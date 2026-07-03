#![allow(unused_imports)]

// Sincronização por pasta compartilhada (estado do grupo e dados institucionais) e merges.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use rust_xlsxwriter::{Format, Workbook};
use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs, io,
    hash::{Hash, Hasher},
    io::Cursor,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, MutexGuard, PoisonError},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};


// Async sem trava de dados: só toca a pasta de sincronização (OneDrive), com
// arquivo próprio por dispositivo e gravações atômicas.
#[tauri::command(async)]
pub(crate) fn publicar_estado_sincronizacao(input: SyncStateInput) -> Result<SyncStateResultado, String> {
    let raiz = validar_pasta_sincronizacao(&input.pasta)?;
    let estado = raiz.join("state");
    let dispositivos = raiz.join("devices");
    fs::create_dir_all(&estado).map_err(|err| err.to_string())?;
    fs::create_dir_all(&dispositivos).map_err(|err| err.to_string())?;

    let conteudo = serde_json::to_vec_pretty(&input.payload).map_err(|err| err.to_string())?;

    // Arquivo por dispositivo: cada instalação escreve apenas o SEU próprio estado.
    // Isso evita a corrida de leitura-modificação-escrita do arquivo único, em que
    // um dispositivo sobrescrevia eventos/tarefas recém-criados por outro.
    let peers = estado.join("peers");
    fs::create_dir_all(&peers).map_err(|err| err.to_string())?;
    let peer_destino = peers.join(format!("{}.json", nome_arquivo_seguro(&input.device_id)));
    let peer_tmp = peers.join(format!(
        "{}.{}.tmp",
        nome_arquivo_seguro(&input.device_id),
        Local::now().timestamp_millis()
    ));
    fs::write(&peer_tmp, &conteudo).map_err(|err| err.to_string())?;
    fs::rename(&peer_tmp, &peer_destino).map_err(|err| err.to_string())?;

    // Mantém o arquivo único para compatibilidade com versões antigas do app.
    let destino = estado.join("workspace-state.json");
    let temporario = estado.join(format!("workspace-state.{}.tmp", Local::now().timestamp_millis()));
    fs::write(&temporario, &conteudo).map_err(|err| err.to_string())?;
    fs::rename(&temporario, &destino).map_err(|err| err.to_string())?;

    if let Some(profile) = input.payload.get("profile") {
        let perfil_path = dispositivos.join(format!("{}.json", nome_arquivo_seguro(&input.device_id)));
        let perfil = serde_json::to_vec_pretty(profile).map_err(|err| err.to_string())?;
        fs::write(perfil_path, perfil).map_err(|err| err.to_string())?;
    }

    Ok(SyncStateResultado {
        caminho: peer_destino.to_string_lossy().to_string(),
        atualizado_em: Local::now().to_rfc3339(),
    })
}

#[tauri::command(async)]
pub(crate) fn carregar_estado_sincronizacao(pasta: String) -> Result<Option<Value>, String> {
    let raiz = validar_pasta_sincronizacao(&pasta)?;
    let arquivo = raiz.join("state").join("workspace-state.json");
    if !arquivo.exists() {
        return Ok(None);
    }
    let texto = fs::read_to_string(arquivo).map_err(|err| err.to_string())?;
    serde_json::from_str(&texto).map(Some).map_err(|err| err.to_string())
}

/// Lê o estado de TODOS os dispositivos (arquivos em state/peers/) além do
/// arquivo único legado. Retorna a lista de payloads, ignorando o próprio
/// dispositivo. A mesclagem é feita no frontend (último a atualizar vence).
#[tauri::command(async)]
pub(crate) fn carregar_estados_sincronizacao(
    pasta: String,
    device_id: String,
) -> Result<Vec<Value>, String> {
    let raiz = validar_pasta_sincronizacao(&pasta)?;
    let estado = raiz.join("state");
    let peers = estado.join("peers");
    let proprio = format!("{}.json", nome_arquivo_seguro(&device_id));
    let mut payloads = Vec::new();

    if peers.is_dir() {
        let mut entradas: Vec<PathBuf> = fs::read_dir(&peers)
            .map_err(|err| err.to_string())?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.extension().and_then(|e| e.to_str()) == Some("json")
                    && p.file_name().and_then(|n| n.to_str()) != Some(proprio.as_str())
            })
            .collect();
        entradas.sort();
        for caminho in entradas {
            if let Ok(texto) = fs::read_to_string(&caminho) {
                if let Ok(valor) = serde_json::from_str::<Value>(&texto) {
                    payloads.push(valor);
                }
            }
        }
    }

    // Compatibilidade: inclui também o arquivo único legado, para não perder
    // alterações de coordenadores que ainda usam versões antigas do app (que
    // só escrevem workspace-state.json). A mesclagem por updatedAt no frontend
    // ignora dados mais antigos, então incluí-lo sempre é seguro.
    let arquivo = estado.join("workspace-state.json");
    if arquivo.exists() {
        if let Ok(texto) = fs::read_to_string(&arquivo) {
            if let Ok(valor) = serde_json::from_str::<Value>(&texto) {
                payloads.push(valor);
            }
        }
    }

    Ok(payloads)
}

#[tauri::command(async)]
pub(crate) fn publicar_dados_institucionais_sincronizacao(
    input: SyncInstitutionalInput,
) -> Result<SyncInstitutionalResultado, String> {
    let _dados = travar_dados();
    let raiz = validar_pasta_sincronizacao(&input.pasta)?;
    let estado = raiz.join("state");
    fs::create_dir_all(&estado).map_err(|err| err.to_string())?;

    let origem = data_dir().map_err(|err| err.to_string())?;
    let destino = estado.join("institutional-data");
    let assinatura = assinatura_diretorio(&origem).map_err(|err| err.to_string())?;
    let manifesto_atual = fs::read_to_string(destino.join("manifest.json"))
        .ok()
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok());
    if manifesto_atual
        .as_ref()
        .and_then(|dados| dados.get("assinatura").and_then(Value::as_str))
        == Some(assinatura.as_str())
    {
        let atualizado_em = manifesto_atual
            .as_ref()
            .and_then(|dados| dados.get("atualizado_em").and_then(Value::as_str))
            .unwrap_or("")
            .to_string();
        if !atualizado_em.is_empty() {
            salvar_marcador_sincronizacao_institucional(&atualizado_em)
                .map_err(|err| err.to_string())?;
        }
        return Ok(SyncInstitutionalResultado {
            caminho: Some(destino.to_string_lossy().to_string()),
            arquivos: contar_arquivos_recursivamente(&origem).map_err(|err| err.to_string())?,
            atualizado_em,
            backup_seguranca: None,
        });
    }

    let temporario = estado.join(format!(
        "institutional-data.{}.tmp",
        Local::now().timestamp_millis()
    ));
    if temporario.exists() {
        fs::remove_dir_all(&temporario).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&temporario).map_err(|err| err.to_string())?;

    let mut total = 0;
    if origem.exists() {
        copiar_recursivamente_contando(&origem, &temporario.join("dados"), &mut total)
            .map_err(|err| err.to_string())?;
    } else {
        fs::create_dir_all(temporario.join("dados")).map_err(|err| err.to_string())?;
    }

    let atualizado_em = Local::now().to_rfc3339();
    let manifesto = serde_json::json!({
        "app": "CoordenacaoOP",
        "tipo": "coordenacaoop-institutional-data",
        "formato": 1,
        "versao_app": env!("CARGO_PKG_VERSION"),
        "device_id": input.device_id,
        "atualizado_em": atualizado_em,
        "assinatura": assinatura,
        "total_arquivos": total,
    });
    fs::write(
        temporario.join("manifest.json"),
        serde_json::to_vec_pretty(&manifesto).map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())?;

    if destino.exists() {
        fs::remove_dir_all(&destino).map_err(|err| err.to_string())?;
    }
    fs::rename(&temporario, &destino).map_err(|err| err.to_string())?;
    salvar_marcador_sincronizacao_institucional(&atualizado_em).map_err(|err| err.to_string())?;

    Ok(SyncInstitutionalResultado {
        caminho: Some(destino.to_string_lossy().to_string()),
        arquivos: total,
        atualizado_em,
        backup_seguranca: None,
    })
}

#[tauri::command(async)]
pub(crate) fn carregar_dados_institucionais_sincronizacao(
    pasta: String,
) -> Result<SyncInstitutionalResultado, String> {
    let _dados = travar_dados();
    let raiz = validar_pasta_sincronizacao(&pasta)?;
    let origem = raiz.join("state").join("institutional-data");
    let origem_dados = origem.join("dados");
    if !origem_dados.exists() {
        return Ok(SyncInstitutionalResultado {
            caminho: None,
            arquivos: 0,
            atualizado_em: String::new(),
            backup_seguranca: None,
        });
    }

    let manifesto = origem.join("manifest.json");
    let atualizado_em = fs::read_to_string(&manifesto)
        .ok()
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
        .and_then(|dados| dados.get("atualizado_em").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| Local::now().to_rfc3339());

    if ler_marcador_sincronizacao_institucional().as_deref() == Some(atualizado_em.as_str()) {
        return Ok(SyncInstitutionalResultado {
            caminho: Some(origem.to_string_lossy().to_string()),
            arquivos: contar_arquivos_recursivamente(&origem_dados).map_err(|err| err.to_string())?,
            atualizado_em,
            backup_seguranca: None,
        });
    }

    let destino = data_dir().map_err(|err| err.to_string())?;

    let seguranca = exportar_backup_interno()
        .map_err(|err| format!("Não foi possível criar backup de segurança antes da sincronização: {err}"))?
        .caminho;
    let base = app_base_dir().map_err(|err| err.to_string())?;
    let ts = Local::now().timestamp_millis();
    let temporario = base.join(format!("dados_sync_tmp_{ts}"));
    let backup_destino = base.join(format!("dados_sync_old_{ts}"));
    if temporario.exists() {
        fs::remove_dir_all(&temporario).map_err(|err| err.to_string())?;
    }

    // Copia dados do peer para o temporário
    let mut total = 0;
    copiar_recursivamente_contando(&origem_dados, &temporario, &mut total)
        .map_err(|err| err.to_string())?;

    // Remove cópias de conflito criadas pelo OneDrive dentro do estado recebido
    // (ex.: "turma_X-NomePC.json"), que viravam turmas duplicadas na listagem.
    remover_copias_de_conflito_sync(&temporario.join("persistidos"))
        .map_err(|err| err.to_string())?;

    // Merge: preserva turmas criadas localmente e mescla campos por timestamp
    mesclar_diretorio_persistidos(
        &destino.join("persistidos"),
        &temporario.join("persistidos"),
    )
    .map_err(|err| err.to_string())?;

    // Une as fotos locais às recebidas (sem perder fotos só locais).
    mesclar_diretorio_fotos(&destino.join("fotos"), &temporario.join("fotos"))
        .map_err(|err| err.to_string())?;

    // Renomeia o diretório atual para backup antes de colocar o novo no lugar.
    // Se o segundo rename falhar, o original é restaurado — sem perda de dados.
    if destino.exists() {
        fs::rename(&destino, &backup_destino).map_err(|err| err.to_string())?;
    }
    if let Err(err) = fs::rename(&temporario, &destino) {
        if backup_destino.exists() {
            let _ = fs::rename(&backup_destino, &destino);
        }
        return Err(err.to_string());
    }
    let _ = fs::remove_dir_all(&backup_destino);
    preparar_base_portatil(&app_base_dir().map_err(|err| err.to_string())?)
        .map_err(|err| err.to_string())?;
    salvar_marcador_sincronizacao_institucional(&atualizado_em).map_err(|err| err.to_string())?;

    Ok(SyncInstitutionalResultado {
        caminho: Some(origem.to_string_lossy().to_string()),
        arquivos: total,
        atualizado_em,
        backup_seguranca: seguranca,
    })
}

pub(crate) fn validar_pasta_sincronizacao(pasta: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(pasta.trim());
    if pasta.trim().is_empty() {
        return Err("Escolha uma pasta compartilhada para a sincronização.".to_string());
    }
    if !path.exists() {
        return Err("A pasta de sincronização não existe.".to_string());
    }
    if !path.is_dir() {
        return Err("O caminho de sincronização precisa ser uma pasta.".to_string());
    }
    Ok(path)
}

pub(crate) fn nome_arquivo_seguro(valor: &str) -> String {
    let normalizado = valor
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if normalizado.is_empty() {
        "instalacao".to_string()
    } else {
        normalizado
    }
}

pub(crate) fn mesclar_recursivamente(
    origem: &Path,
    destino: &Path,
    raiz: &str,
    importados: &mut usize,
    conflitos: &mut Vec<String>,
) -> io::Result<()> {
    if !origem.exists() {
        return Ok(());
    }
    fs::create_dir_all(destino)?;
    for entrada in fs::read_dir(origem)? {
        let entrada = entrada?;
        let caminho_origem = entrada.path();
        let caminho_destino = destino.join(entrada.file_name());
        if caminho_origem.is_dir() {
            mesclar_recursivamente(
                &caminho_origem,
                &caminho_destino,
                raiz,
                importados,
                conflitos,
            )?;
        } else if caminho_destino.exists() {
            let relativo = caminho_destino
                .strip_prefix(app_base_dir()?)
                .unwrap_or(&caminho_destino);
            conflitos.push(format!("{}/{}", raiz, relativo.to_string_lossy()));
        } else {
            if let Some(parent) = caminho_destino.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&caminho_origem, &caminho_destino)?;
            *importados += 1;
        }
    }
    Ok(())
}

pub(crate) fn copiar_recursivamente(origem: &Path, destino: &Path) -> io::Result<()> {
    if origem.is_dir() {
        fs::create_dir_all(destino)?;
        for entrada in fs::read_dir(origem)? {
            let entrada = entrada?;
            let origem_item = entrada.path();
            let destino_item = destino.join(entrada.file_name());
            copiar_recursivamente(&origem_item, &destino_item)?;
        }
    } else {
        if let Some(parent) = destino.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(origem, destino)?;
    }
    Ok(())
}

pub(crate) fn copiar_recursivamente_contando(
    origem: &Path,
    destino: &Path,
    total: &mut usize,
) -> io::Result<()> {
    if origem.is_dir() {
        fs::create_dir_all(destino)?;
        for entrada in fs::read_dir(origem)? {
            let entrada = entrada?;
            let origem_item = entrada.path();
            let destino_item = destino.join(entrada.file_name());
            copiar_recursivamente_contando(&origem_item, &destino_item, total)?;
        }
    } else {
        if let Some(parent) = destino.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(origem, destino)?;
        *total += 1;
    }
    Ok(())
}

pub(crate) fn mesclar_medias(local: &mut serde_json::Map<String, Value>, incoming: &serde_json::Map<String, Value>) {
    for (bimestre, notas_inc) in incoming {
        let Some(notas_inc_obj) = notas_inc.as_object() else { continue; };
        let notas_local = local
            .entry(bimestre.clone())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(notas_local_obj) = notas_local.as_object_mut() else { continue; };
        for (disciplina, nota_inc) in notas_inc_obj {
            let em_inc = nota_inc.get("em").and_then(Value::as_str).unwrap_or("");
            let em_local = notas_local_obj
                .get(disciplina)
                .and_then(|n| n.get("em"))
                .and_then(Value::as_str)
                .unwrap_or("");
            // Incoming wins if: newer timestamp, has timestamp but local doesn't, or neither has timestamp
            if em_inc > em_local || (!em_inc.is_empty() && em_local.is_empty()) || (em_inc.is_empty() && em_local.is_empty()) {
                notas_local_obj.insert(disciplina.clone(), nota_inc.clone());
            }
        }
    }
}

pub(crate) fn mesclar_aluno(local: &mut Value, incoming: &Value) {
    let Some(local_obj) = local.as_object_mut() else { return; };
    let Some(inc_obj) = incoming.as_object() else { return; };

    // Dados vindos de importação de mapão: incoming sempre vence
    for campo in &["frequencia", "frequencia_percentual", "compensacao_ausencias"] {
        if let Some(valor) = inc_obj.get(*campo) {
            local_obj.insert(campo.to_string(), valor.clone());
        }
    }

    // elegivel_manual: vence o mais recente (por elegivel_manual_em)
    let em_local = local_obj.get("elegivel_manual_em").and_then(Value::as_str).unwrap_or("");
    let em_inc = inc_obj.get("elegivel_manual_em").and_then(Value::as_str).unwrap_or("");
    if em_inc > em_local {
        for campo in &["elegivel_manual", "elegivel_manual_em"] {
            if let Some(valor) = inc_obj.get(*campo) {
                local_obj.insert(campo.to_string(), valor.clone());
            }
        }
    }

    // medias: por disciplina/bimestre, vence o mais recente (por "em" do envelope)
    if let Some(medias_inc) = inc_obj.get("medias").and_then(Value::as_object) {
        let medias_local = local_obj
            .entry("medias".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if let Some(medias_local_obj) = medias_local.as_object_mut() {
            mesclar_medias(medias_local_obj, medias_inc);
        }
    }

    // Campos de conselho e encaminhamentos: local sempre vence (edições intencionais)
    // ajustes_medias_conselho, encaminhamentos, lideranca_sala, deficiencias,
    // comentario_educacao_especial — não tocamos
}

pub(crate) fn mesclar_arquivo_turma(local: &Value, incoming: &Value) -> Value {
    let mut resultado = local.clone();
    let Some(res_obj) = resultado.as_object_mut() else { return incoming.clone(); };

    // Campos de configuração da turma: incoming vence
    for campo in &["codigo", "ano", "serie", "sala", "periodo", "ciclo", "carga_horaria"] {
        if let Some(valor) = incoming.get(*campo) {
            res_obj.insert(campo.to_string(), valor.clone());
        }
    }

    // Merge de alunos
    if let (Some(alunos_local), Some(alunos_inc)) = (
        res_obj.get_mut("alunos").and_then(Value::as_object_mut),
        incoming.get("alunos").and_then(Value::as_object),
    ) {
        for (matricula, aluno_inc) in alunos_inc {
            if let Some(aluno_local) = alunos_local.get_mut(matricula) {
                mesclar_aluno(aluno_local, aluno_inc);
            } else {
                alunos_local.insert(matricula.clone(), aluno_inc.clone());
            }
        }
    }

    resultado
}

// Cópias de conflito criadas por serviços de sincronização de arquivos (OneDrive,
// Google Drive) recebem sufixo com o nome do dispositivo: "turma_X-NomePC.json" ou
// "turma_X-NomePC-2.json". Se remover sufixos "-token" do nome resultar em um
// arquivo que também existe na mesma pasta, este é uma cópia de conflito, não uma turma.
pub(crate) fn eh_copia_de_conflito_sync(caminho: &Path) -> bool {
    let Some(pasta) = caminho.parent() else {
        return false;
    };
    let Some(stem) = caminho.file_stem().and_then(|s| s.to_str()) else {
        return false;
    };
    let mut base = stem;
    while let Some(pos) = base.rfind('-') {
        base = &base[..pos];
        if !base.is_empty() && pasta.join(format!("{base}.json")).is_file() {
            return true;
        }
    }
    false
}

pub(crate) fn remover_copias_de_conflito_sync(pasta: &Path) -> io::Result<()> {
    if !pasta.is_dir() {
        return Ok(());
    }
    for entrada in fs::read_dir(pasta)? {
        let caminho = entrada?.path();
        if caminho.is_dir() {
            remover_copias_de_conflito_sync(&caminho)?;
        } else if caminho.extension().and_then(|e| e.to_str()) == Some("json")
            && eh_copia_de_conflito_sync(&caminho)
        {
            fs::remove_file(&caminho)?;
        }
    }
    Ok(())
}

pub(crate) fn mesclar_diretorio_persistidos(local_dir: &Path, temp_dir: &Path) -> io::Result<()> {
    if !local_dir.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(temp_dir)?;

    for entrada in fs::read_dir(local_dir)? {
        let entrada = entrada?;
        let nome = entrada.file_name();
        let local_path = entrada.path();
        let temp_path = temp_dir.join(&nome);

        if local_path.is_dir() {
            mesclar_diretorio_persistidos(&local_path, &temp_path)?;
        } else if local_path.extension().and_then(|e| e.to_str()) == Some("json") {
            if eh_copia_de_conflito_sync(&local_path) {
                continue;
            }
            if temp_path.exists() {
                // Arquivo em ambos: merge, mantendo o mais recente por campo
                let texto_local = fs::read_to_string(&local_path)?;
                let texto_temp = fs::read_to_string(&temp_path)?;
                if let (Ok(val_local), Ok(val_temp)) = (
                    serde_json::from_str::<Value>(&texto_local),
                    serde_json::from_str::<Value>(&texto_temp),
                ) {
                    let merged = mesclar_arquivo_turma(&val_local, &val_temp);
                    let texto_merged = serde_json::to_string_pretty(&merged)
                        .map_err(|e| io::Error::other(e.to_string()))?;
                    fs::write(&temp_path, texto_merged)?;
                }
                // Se parse falhar, mantém o incoming (já está em temp_path)
            } else {
                // Arquivo só no local (turma criada após último sync): preservar
                fs::copy(&local_path, &temp_path)?;
            }
        }
    }
    Ok(())
}


// Une as fotos locais ao diretório recebido do peer (que virará o novo `dados`),
// preservando fotos que só existem localmente e, em conflito, a mais recente.
pub(crate) fn mesclar_diretorio_fotos(local_dir: &Path, temp_dir: &Path) -> io::Result<()> {
    if !local_dir.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(temp_dir)?;
    for entrada in fs::read_dir(local_dir)? {
        let entrada = entrada?;
        let nome = entrada.file_name();
        let local_path = entrada.path();
        let temp_path = temp_dir.join(&nome);
        if local_path.is_dir() {
            mesclar_diretorio_fotos(&local_path, &temp_path)?;
        } else if temp_path.exists() {
            let local_t = fs::metadata(&local_path).and_then(|m| m.modified()).ok();
            let temp_t = fs::metadata(&temp_path).and_then(|m| m.modified()).ok();
            if let (Some(lt), Some(tt)) = (local_t, temp_t) {
                if lt > tt {
                    fs::copy(&local_path, &temp_path)?;
                }
            }
        } else {
            fs::copy(&local_path, &temp_path)?;
        }
    }
    Ok(())
}

pub(crate) fn contar_arquivos_recursivamente(pasta: &Path) -> io::Result<usize> {
    if pasta.is_file() {
        return Ok(1);
    }
    let mut total = 0;
    if pasta.is_dir() {
        for entrada in fs::read_dir(pasta)? {
            total += contar_arquivos_recursivamente(&entrada?.path())?;
        }
    }
    Ok(total)
}

pub(crate) fn assinatura_diretorio(pasta: &Path) -> io::Result<String> {
    fn visitar(caminho: &Path, raiz: &Path, partes: &mut Vec<String>) -> io::Result<()> {
        if !caminho.exists() {
            return Ok(());
        }
        if caminho.is_dir() {
            let mut entradas = fs::read_dir(caminho)?.collect::<Result<Vec<_>, io::Error>>()?;
            entradas.sort_by_key(|entrada| entrada.file_name());
            for entrada in entradas {
                visitar(&entrada.path(), raiz, partes)?;
            }
            return Ok(());
        }
        let relativo = caminho
            .strip_prefix(raiz)
            .unwrap_or(caminho)
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = fs::read(caminho)?;
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        relativo.hash(&mut hasher);
        bytes.hash(&mut hasher);
        partes.push(format!("{relativo}:{}:{:x}", bytes.len(), hasher.finish()));
        Ok(())
    }

    let mut partes = Vec::new();
    visitar(pasta, pasta, &mut partes)?;
    Ok(partes.join("|"))
}

pub(crate) fn marcador_sincronizacao_institucional_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join("sync_institutional_last_applied.txt"))
}

pub(crate) fn ler_marcador_sincronizacao_institucional() -> Option<String> {
    marcador_sincronizacao_institucional_path()
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|texto| texto.trim().to_string())
        .filter(|texto| !texto.is_empty())
}

pub(crate) fn salvar_marcador_sincronizacao_institucional(valor: &str) -> io::Result<()> {
    let path = marcador_sincronizacao_institucional_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, valor)
}
