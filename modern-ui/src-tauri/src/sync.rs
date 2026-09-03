
// Sincronização por pasta compartilhada (estado do grupo e dados institucionais) e merges.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use chrono::Local;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    env, fs, io,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};


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

    // O merge acima casa arquivos pelo nome exato. Se um peer com versão mais
    // antiga do app gravou o código da turma sem formatação ("2a SERIE A") e
    // este dispositivo já tinha a mesma turma com o código formatado
    // ("2ª Série A"), os nomes de arquivo divergem e o merge por nome não os
    // une — a turma passava a aparecer duplicada na listagem. Aqui agrupamos
    // por ano + código normalizado (ignorando acentos/maiúsculas) e mesclamos
    // qualquer grupo com mais de um arquivo.
    desduplicar_turmas_por_codigo(&temporario.join("persistidos"))
        .map_err(|err| err.to_string())?;

    // Une as fotos locais às recebidas (sem perder fotos só locais).
    mesclar_diretorio_fotos(&destino.join("fotos"), &temporario.join("fotos"))
        .map_err(|err| err.to_string())?;

    // Preserva planilha_automatica_id/apps_script_projeto_id/
    // apps_script_deployment_id do PEI/Planejamento quando só existem
    // localmente — sem isso, puxar dados institucionais de um colega cuja
    // config chegou "incompleta" (ex.: só adotada via sincronização de
    // grupo, sem esses IDs — ver WebAppConfigSync em workgroupSync.ts)
    // sobrescrevia esses campos com vazio nesta máquina, mesmo sendo ela a
    // dona original do Web App. Ver mesclar_config_webapp.
    mesclar_config_webapp(&destino.join("pei").join("config.json"), &temporario.join("pei").join("config.json"))
        .map_err(|err| err.to_string())?;
    mesclar_config_webapp(
        &destino.join("planejamento").join("config.json"),
        &temporario.join("planejamento").join("config.json"),
    )
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

pub(crate) fn mesclar_frequencia_ou_compensacao(
    local: &mut serde_json::Map<String, Value>,
    incoming: &serde_json::Map<String, Value>,
) {
    for (bimestre, valores_inc) in incoming {
        let Some(valores_inc_obj) = valores_inc.as_object() else { continue; };
        let valores_local = local
            .entry(bimestre.clone())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(valores_local_obj) = valores_local.as_object_mut() else { continue; };
        for (disciplina, valor_inc) in valores_inc_obj {
            valores_local_obj.insert(disciplina.clone(), valor_inc.clone());
        }
    }
}

pub(crate) fn mesclar_aluno(local: &mut Value, incoming: &Value) {
    let Some(local_obj) = local.as_object_mut() else { return; };
    let Some(inc_obj) = incoming.as_object() else { return; };

    // frequencia/compensacao_ausencias: mapa por bimestre/disciplina, sem timestamp por
    // célula. Mesclamos por bimestre+disciplina (incoming vence só a célula em conflito)
    // em vez de substituir o objeto inteiro — trocar o objeto inteiro apagava os
    // bimestres que só existiam no lado local (ex.: outro dispositivo já tinha importado
    // o mapão do bimestre 3, e um incoming trazendo só até o bimestre 2 zerava o 3),
    // o que fazia o total de faltas do ano ficar errado depois do sync.
    for campo in &["frequencia", "compensacao_ausencias"] {
        if let Some(inc_valor) = inc_obj.get(*campo).and_then(Value::as_object) {
            let local_valor = local_obj
                .entry(campo.to_string())
                .or_insert_with(|| Value::Object(serde_json::Map::new()));
            if let Some(local_valor_obj) = local_valor.as_object_mut() {
                mesclar_frequencia_ou_compensacao(local_valor_obj, inc_valor);
            }
        }
    }

    // frequencia_percentual ("Fre An(%)"): cumulativo por bimestre, então só deixamos o
    // incoming vencer se ele vier de um bimestre igual ou mais recente que o já
    // armazenado — senão um sync trazendo um mapão mais antigo (de outro dispositivo)
    // fazia a frequência exibida na ficha do aluno regredir.
    let bim_local = local_obj
        .get("frequencia_percentual_bimestre")
        .and_then(Value::as_str)
        .unwrap_or("");
    let bim_inc = inc_obj
        .get("frequencia_percentual_bimestre")
        .and_then(Value::as_str)
        .unwrap_or("");
    if inc_obj.contains_key("frequencia_percentual") && bim_inc >= bim_local {
        if let Some(valor) = inc_obj.get("frequencia_percentual") {
            local_obj.insert("frequencia_percentual".to_string(), valor.clone());
        }
        if !bim_inc.is_empty() {
            local_obj.insert(
                "frequencia_percentual_bimestre".to_string(),
                Value::String(bim_inc.to_string()),
            );
        }
    }

    // diagnostico_aprendizagem: bloco único por aluno (SARESP/AvD), gravado
    // inteiro a cada importação. Vence o mais recente por `atualizado_em`, ou
    // o incoming quando o local ainda não tem nenhum — senão o diagnóstico
    // importado num dispositivo nunca chegava aos outros pelo sync.
    if let Some(diag_inc) = inc_obj.get("diagnostico_aprendizagem") {
        let em_local = local_obj
            .get("diagnostico_aprendizagem")
            .and_then(|d| d.get("atualizado_em"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let em_inc = diag_inc.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
        if em_inc >= em_local {
            local_obj.insert("diagnostico_aprendizagem".to_string(), diag_inc.clone());
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

    // expansao_online: histórico datado (um snapshot por importação, ver
    // importador_expansoes.rs). Cada dispositivo pode ter importado exports
    // de datas diferentes, então o merge certo é UNIÃO por data — nunca
    // "local vence", nem substituir o objeto inteiro. União também é a
    // única regra que funciona nos dois sentidos: a reintegração de
    // pendrive (conselho_pendrive.rs) chama esta mesma mesclar_aluno com
    // local/incoming invertidos. Sem esta função, o campo inteiro do
    // incoming era descartado sempre que o aluno já existisse localmente —
    // o mesmo problema que ainda afeta `tarefas` e `prova_paulista`
    // (`diagnostico_aprendizagem` já tem regra própria acima).
    mesclar_expansao_online(local_obj, inc_obj);

    // atendimentos: lista de registros com id próprio (cada atendimento feito
    // num dispositivo é um item novo, não a edição de um campo fixo como
    // frequência/médias) — o merge certo é UNIÃO por id, nunca "local sempre
    // vence" nem "o objeto inteiro do incoming vence". Sem isso, atendimentos
    // feitos numa máquina nunca chegavam às outras via sincronização — e se a
    // máquina de origem fosse formatada sem backup, o atendimento sumia de vez.
    mesclar_atendimentos(local_obj, inc_obj);

    // Campos de conselho e encaminhamentos: local sempre vence (edições intencionais)
    // ajustes_medias_conselho, encaminhamentos_conselho, deliberados_conselho,
    // lideranca_sala, deficiencias, comentario_educacao_especial — não tocamos
}

/// Mesma forma de mesclar_medias, mas chaveada por data de importação em
/// vez de bimestre×disciplina — cada snapshot já carrega seu próprio
/// bimestre (ver importador_expansoes.rs), então uma chave só basta.
fn mesclar_expansao_online(local_obj: &mut serde_json::Map<String, Value>, inc_obj: &serde_json::Map<String, Value>) {
    let Some(inc) = inc_obj.get("expansao_online").and_then(Value::as_object) else { return; };
    let local_valor = local_obj
        .entry("expansao_online".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(local_map) = local_valor.as_object_mut() else { return; };

    // email é estável (identifica a correspondência por RA); não há
    // conflito real a resolver, só preencher se o local ainda não tiver.
    if !local_map.contains_key("email") {
        if let Some(email) = inc.get("email") {
            local_map.insert("email".to_string(), email.clone());
        }
    }

    let Some(snaps_inc) = inc.get("snapshots").and_then(Value::as_object) else { return; };
    let snaps_local = local_map
        .entry("snapshots".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(snaps_local_obj) = snaps_local.as_object_mut() else { return; };

    for (data, snap_inc) in snaps_inc {
        let em_inc = snap_inc.get("em").and_then(Value::as_str).unwrap_or("");
        let em_local = snaps_local_obj.get(data).and_then(|s| s.get("em")).and_then(Value::as_str).unwrap_or("");
        // Mesma regra de mesclar_medias: incoming vence se for mais novo,
        // se só ele tem carimbo, ou se nenhum dos dois tem.
        if !snaps_local_obj.contains_key(data)
            || em_inc > em_local
            || (!em_inc.is_empty() && em_local.is_empty())
            || (em_inc.is_empty() && em_local.is_empty())
        {
            snaps_local_obj.insert(data.clone(), snap_inc.clone());
        }
    }
}

fn mesclar_atendimentos(local_obj: &mut serde_json::Map<String, Value>, inc_obj: &serde_json::Map<String, Value>) {
    let Some(inc_lista) = inc_obj.get("atendimentos").and_then(Value::as_array) else { return; };
    let local_valor = local_obj
        .entry("atendimentos".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(local_lista) = local_valor.as_array_mut() else { return; };

    for inc_item in inc_lista {
        let Some(inc_id) = inc_item.get("id").and_then(Value::as_str).map(str::to_string) else { continue; };
        match local_lista
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(inc_id.as_str()))
        {
            Some(local_item) => mesclar_atendimento(local_item, inc_item),
            None => local_lista.push(inc_item.clone()),
        }
    }
}

// Mesmo raciocínio pros followups aninhados (timeline de acompanhamento de um
// atendimento): união por id. O registro em si (fora followups) vence pelo
// atualizado_em mais recente; os followups são unidos independente de quem
// venceu ali, pra não perder um follow-up adicionado só de um dos lados.
fn mesclar_atendimento(local: &mut Value, incoming: &Value) {
    let followups_inc = incoming.get("followups").and_then(Value::as_array).cloned();

    let em_local = local.get("atualizado_em").and_then(Value::as_str).unwrap_or("").to_string();
    let em_inc = incoming.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
    if em_inc > em_local.as_str() {
        *local = incoming.clone();
    }

    let Some(inc_followups) = followups_inc else { return; };
    let Some(local_obj) = local.as_object_mut() else { return; };
    let local_followups_valor = local_obj
        .entry("followups".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(local_followups) = local_followups_valor.as_array_mut() else { return; };

    for inc_followup in inc_followups {
        let Some(inc_id) = inc_followup.get("id").and_then(Value::as_str).map(str::to_string) else { continue; };
        match local_followups
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(inc_id.as_str()))
        {
            Some(local_followup) => {
                let em_l = local_followup.get("atualizado_em").and_then(Value::as_str).unwrap_or("").to_string();
                let em_i = inc_followup.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
                if em_i > em_l.as_str() {
                    *local_followup = inc_followup;
                }
            }
            None => local_followups.push(inc_followup),
        }
    }
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

    mesclar_conselhos_turma(res_obj, incoming);
    mesclar_disparos_lote(res_obj, incoming);

    resultado
}

// Disparos em lote (fila assistida / lote API): união por id, o registro com
// `atualizado_em` mais recente vence inteiro. Um disparo é editado de uma
// máquina por vez (quem está tocando a fila), então não precisa de merge
// campo a campo como os atendimentos.
pub(crate) fn mesclar_disparos_lote(
    local: &mut serde_json::Map<String, Value>,
    incoming: &Value,
) {
    let Some(inc_lista) = incoming.get("disparos_lote").and_then(Value::as_array) else { return; };
    let local_valor = local
        .entry("disparos_lote".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(local_lista) = local_valor.as_array_mut() else { return; };

    for inc_item in inc_lista {
        let Some(inc_id) = inc_item.get("id").and_then(Value::as_str) else { continue; };
        match local_lista
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(inc_id))
        {
            Some(local_item) => {
                let em_local = local_item.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
                let em_inc = inc_item.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
                if em_inc > em_local {
                    *local_item = inc_item.clone();
                }
            }
            None => local_lista.push(inc_item.clone()),
        }
    }
}

// Finalização do conselho (nó "conselhos") e texto da ata: por bimestre, vence
// o lado com finalizado_em mais recente; um registro finalizado vence um que
// nunca foi. Sem isso, um conselho finalizado em outra máquina (sync ou
// pendrive) era descartado silenciosamente, e a turma voltava a "pendente".
pub(crate) fn mesclar_conselhos_turma(
    local: &mut serde_json::Map<String, Value>,
    incoming: &Value,
) {
    let Some(conselhos_inc) = incoming.get("conselhos").and_then(Value::as_object) else {
        return;
    };

    let mut bimestres_vencidos: Vec<String> = Vec::new();
    {
        let conselhos_local = local
            .entry("conselhos".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(conselhos_local) = conselhos_local.as_object_mut() else {
            return;
        };
        for (bimestre, registro_inc) in conselhos_inc {
            let vence = match conselhos_local.get(bimestre) {
                None => true,
                Some(registro_local) => {
                    let em_inc = registro_inc
                        .get("finalizado_em")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let em_local = registro_local
                        .get("finalizado_em")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let finalizado_inc = conselho_foi_finalizado(registro_inc);
                    let finalizado_local = conselho_foi_finalizado(registro_local);
                    if finalizado_inc != finalizado_local {
                        finalizado_inc
                    } else {
                        em_inc > em_local
                    }
                }
            };
            if vence {
                conselhos_local.insert(bimestre.clone(), registro_inc.clone());
                bimestres_vencidos.push(bimestre.clone());
            }
        }
    }

    // O texto da ata acompanha o registro de conselho que venceu o merge.
    if bimestres_vencidos.is_empty() {
        return;
    }
    let Some(textos_inc) = incoming.get("textos_ata").and_then(Value::as_object) else {
        return;
    };
    let textos_local = local
        .entry("textos_ata".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(textos_local) = textos_local.as_object_mut() else {
        return;
    };
    for bimestre in bimestres_vencidos {
        if let Some(texto) = textos_inc.get(&bimestre) {
            textos_local.insert(bimestre, texto.clone());
        }
    }
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

// Mescla um único arquivo de config (dados/pei/config.json ou
// dados/planejamento/config.json) campo a campo: para cada campo string
// vazio do lado recebido (temp_path, que vira o novo dados/ após o swap),
// mantém o valor local se ele não estiver vazio. Se o peer nem tinha o
// arquivo, copia o local para não desaparecer no swap.
pub(crate) fn mesclar_config_webapp(local_path: &Path, temp_path: &Path) -> io::Result<()> {
    if !local_path.exists() {
        return Ok(());
    }
    if !temp_path.exists() {
        if let Some(pai) = temp_path.parent() {
            fs::create_dir_all(pai)?;
        }
        return fs::copy(local_path, temp_path).map(|_| ());
    }
    let texto_local = fs::read_to_string(local_path)?;
    let texto_temp = fs::read_to_string(temp_path)?;
    let (Ok(Value::Object(local_map)), Ok(Value::Object(mut temp_map))) = (
        serde_json::from_str::<Value>(&texto_local),
        serde_json::from_str::<Value>(&texto_temp),
    ) else {
        // Um dos dois não é um objeto JSON válido (ex.: config legada, só
        // texto cru) — não mescla, mantém o que já está em temp_path.
        return Ok(());
    };
    for (chave, valor_local) in local_map {
        let local_nao_vazio = valor_local.as_str().map(|s| !s.is_empty()).unwrap_or(false);
        if !local_nao_vazio {
            continue;
        }
        let vazio_no_recebido = temp_map
            .get(&chave)
            .and_then(Value::as_str)
            .map(str::is_empty)
            .unwrap_or(true);
        if vazio_no_recebido {
            temp_map.insert(chave, valor_local);
        }
    }
    let texto_merged =
        serde_json::to_string_pretty(&Value::Object(temp_map)).map_err(|e| io::Error::other(e.to_string()))?;
    fs::write(temp_path, texto_merged)
}

// Agrupa os arquivos turma_*.json de cada pasta de ano por (ano, código
// normalizado) e mescla qualquer grupo com mais de um arquivo, mantendo o
// nome e os campos de configuração do arquivo cujo código já está no formato
// "bonito" (ex.: "2ª Série A") — se nenhum estiver, mantém o primeiro em
// ordem alfabética. Ver comentário em publicar/carregar_dados_institucionais_
// sincronizacao sobre como duplicatas com nomes diferentes sobrevivem ao
// merge por nome de arquivo em mesclar_diretorio_persistidos.
pub(crate) fn desduplicar_turmas_por_codigo(pasta: &Path) -> io::Result<()> {
    if !pasta.is_dir() {
        return Ok(());
    }
    for entrada in fs::read_dir(pasta)? {
        let caminho = entrada?.path();
        if caminho.is_dir() {
            desduplicar_turmas_por_codigo(&caminho)?;
        }
    }

    let mut grupos: BTreeMap<(i64, String), Vec<PathBuf>> = BTreeMap::new();
    for entrada in fs::read_dir(pasta)? {
        let caminho = entrada?.path();
        let Some(nome) = caminho.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if caminho.is_dir() || !nome.starts_with("turma_") || !nome.ends_with(".json") {
            continue;
        }
        if eh_copia_de_conflito_sync(&caminho) {
            continue;
        }
        let Some(dados) = fs::read_to_string(&caminho)
            .ok()
            .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
        else {
            continue;
        };
        let (Some(ano), Some(codigo)) = (
            dados.get("ano").and_then(Value::as_i64),
            dados.get("codigo").and_then(Value::as_str),
        ) else {
            continue;
        };
        grupos
            .entry((ano, normalizar_texto_basico(codigo)))
            .or_default()
            .push(caminho);
    }

    for (_, mut arquivos) in grupos {
        if arquivos.len() < 2 {
            continue;
        }
        arquivos.sort();

        let mut valores: Vec<(PathBuf, Value)> = arquivos
            .into_iter()
            .filter_map(|caminho| {
                fs::read_to_string(&caminho)
                    .ok()
                    .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
                    .map(|dados| (caminho, dados))
            })
            .collect();
        if valores.len() < 2 {
            continue;
        }

        let indice_base = valores
            .iter()
            .position(|(_, dados)| {
                dados
                    .get("codigo")
                    .and_then(Value::as_str)
                    .map(|codigo| formatar_rotulo_turma_texto(codigo) == codigo)
                    .unwrap_or(false)
            })
            .unwrap_or(0);
        let (caminho_base, base_original) = valores.remove(indice_base);

        let mut mesclado = base_original.clone();
        for (_, valor_extra) in &valores {
            mesclado = mesclar_arquivo_turma(&mesclado, valor_extra);
        }
        // mesclar_arquivo_turma deixa o lado "incoming" vencer nos campos de
        // configuração da turma — aqui queremos que o arquivo já formatado
        // (base_original) continue definindo código/série/sala/etc.
        if let Some(obj) = mesclado.as_object_mut() {
            for campo in ["codigo", "ano", "serie", "sala", "periodo", "ciclo", "carga_horaria"] {
                if let Some(valor) = base_original.get(campo) {
                    obj.insert(campo.to_string(), valor.clone());
                }
            }
        }

        let texto = serde_json::to_string_pretty(&mesclado).map_err(|e| io::Error::other(e.to_string()))?;
        fs::write(&caminho_base, texto)?;
        for (caminho_extra, _) in valores {
            fs::remove_file(caminho_extra)?;
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

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    /// Reproduz o bug real: um atendimento feito só na máquina A nunca
    /// aparecia na máquina B depois de sincronizar, porque `mesclar_aluno`
    /// simplesmente não tocava no campo `atendimentos`. Se a máquina A fosse
    /// reformatada sem backup, o atendimento sumia de vez — em nenhum lugar
    /// do grupo de trabalho ele tinha sido replicado.
    #[test]
    fn atendimento_so_no_incoming_e_incorporado_ao_local() {
        let mut local = json!({ "atendimentos": [] });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Conversa com a família", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let lista = local["atendimentos"].as_array().unwrap();
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0]["id"], "atendimento-1");
    }

    /// Diagnóstico SARESP importado só na máquina A tem que chegar na B pelo
    /// sync — antes `mesclar_aluno` não tocava no campo e o dado nunca saía
    /// do dispositivo onde foi importado.
    #[test]
    fn diagnostico_so_no_incoming_e_incorporado_ao_local() {
        let mut local = json!({ "nome": "FULANO" });
        let incoming = json!({
            "diagnostico_aprendizagem": {
                "portugues": { "avd2": { "nivel": "Básico", "aprendizagem_equivalente": "7º ano" } },
                "atualizado_em": "2026-09-01T10:00:00-03:00"
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["diagnostico_aprendizagem"]["portugues"]["avd2"]["nivel"], "Básico");
    }

    /// Diagnóstico local mais recente não é sobrescrito por um incoming antigo
    /// (ex.: outro dispositivo ainda com a importação anterior).
    #[test]
    fn diagnostico_local_mais_novo_vence_incoming_antigo() {
        let mut local = json!({
            "diagnostico_aprendizagem": {
                "portugues": { "avd2": { "nivel": "Proficiente" } },
                "atualizado_em": "2026-09-10T10:00:00-03:00"
            }
        });
        let incoming = json!({
            "diagnostico_aprendizagem": {
                "portugues": { "avd2": { "nivel": "Básico" } },
                "atualizado_em": "2026-09-01T10:00:00-03:00"
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["diagnostico_aprendizagem"]["portugues"]["avd2"]["nivel"], "Proficiente");
    }

    /// Dois dispositivos criaram atendimentos diferentes pro mesmo aluno
    /// (ids diferentes) — os dois precisam sobreviver ao merge, não só um.
    #[test]
    fn atendimentos_com_ids_diferentes_dos_dois_lados_sao_unidos() {
        let mut local = json!({
            "atendimentos": [
                { "id": "atendimento-local", "descricao": "Feito no dispositivo A", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-remoto", "descricao": "Feito no dispositivo B", "atualizado_em": "2026-08-02T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let mut ids: Vec<&str> = local["atendimentos"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["id"].as_str().unwrap())
            .collect();
        ids.sort();
        assert_eq!(ids, vec!["atendimento-local", "atendimento-remoto"]);
    }

    /// Mesmo atendimento (mesmo id) editado nos dois lados — vence a edição
    /// com `atualizado_em` mais recente, igual já acontece com conselhos.
    #[test]
    fn atendimento_editado_dos_dois_lados_vence_o_mais_recente() {
        let mut local = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Versão antiga", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Versão editada depois", "atualizado_em": "2026-08-03T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["atendimentos"][0]["descricao"], "Versão editada depois");
    }

    /// Follow-up adicionado só do lado remoto, num atendimento que também
    /// existe (com followups próprios) do lado local — os followups dos
    /// dois lados precisam se unir, não um substituir o outro.
    #[test]
    fn followups_de_um_atendimento_sao_unidos_por_id() {
        let mut local = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Original",
                    "atualizado_em": "2026-08-01T10:00:00-03:00",
                    "followups": [
                        { "id": "followup-local", "descricao": "Follow-up feito no dispositivo A", "atualizado_em": "2026-08-01T10:00:00-03:00" }
                    ]
                }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Original",
                    "atualizado_em": "2026-08-01T10:00:00-03:00",
                    "followups": [
                        { "id": "followup-remoto", "descricao": "Follow-up feito no dispositivo B", "atualizado_em": "2026-08-02T10:00:00-03:00" }
                    ]
                }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let mut ids: Vec<&str> = local["atendimentos"][0]["followups"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["id"].as_str().unwrap())
            .collect();
        ids.sort();
        assert_eq!(ids, vec!["followup-local", "followup-remoto"]);
    }

    /// Campos novos do atendimento (canal, modelo_id, followup_previsto) fazem
    /// parte do corpo do registro: quando o incoming mais recente vence, eles
    /// acompanham sem tratamento especial.
    #[test]
    fn campos_novos_do_atendimento_acompanham_o_corpo_no_merge() {
        let mut local = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Só registro", "canal": "manual", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Mensagem enviada e combinado retorno",
                    "canal": "wa_me",
                    "modelo_id": "cobranca_tarefas",
                    "followup_previsto": { "data": "2026-08-30", "descricao": "Conferir entrega" },
                    "atualizado_em": "2026-08-03T10:00:00-03:00"
                }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let a = &local["atendimentos"][0];
        assert_eq!(a["canal"], "wa_me");
        assert_eq!(a["modelo_id"], "cobranca_tarefas");
        assert_eq!(a["followup_previsto"]["data"], "2026-08-30");
    }

    /// Registrar o desfecho (limpar o follow-up combinado) numa máquina tem que
    /// vencer o outro lado que ainda tem o combinado em aberto — o corpo do
    /// registro mais recente vence, então o campo simplesmente some.
    #[test]
    fn followup_previsto_limpo_no_incoming_mais_recente_vence() {
        let mut local = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Combinado retorno",
                    "followup_previsto": { "data": "2026-08-30", "descricao": "Conferir entrega" },
                    "atualizado_em": "2026-08-20T10:00:00-03:00"
                }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Desfecho registrado", "atualizado_em": "2026-08-31T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        assert!(local["atendimentos"][0].get("followup_previsto").is_none());
    }

    /// Reproduz o mesmo bug de classe do teste de atendimentos, mas para
    /// expansao_online: o aluno já existe localmente (sem o campo), e uma
    /// importação feita só na outra máquina não pode ser descartada.
    #[test]
    fn expansao_online_so_no_incoming_e_incorporada_ao_local() {
        let mut local = json!({ "nome": "AGATHA" });
        let incoming = json!({
            "nome": "AGATHA",
            "expansao_online": {
                "email": "00001136866978sp@al.educacao.sp.gov.br",
                "snapshots": { "2026-08-25": { "bimestre": "3", "progresso": 80.0, "em": "2026-08-25T21:00:00-03:00" } }
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["expansao_online"]["email"], json!("00001136866978sp@al.educacao.sp.gov.br"));
        assert_eq!(local["expansao_online"]["snapshots"]["2026-08-25"]["progresso"], json!(80.0));
    }

    /// Cada dispositivo importou um export de data diferente — as duas
    /// datas precisam sobreviver no aluno mesclado, não só uma.
    #[test]
    fn snapshots_de_datas_diferentes_dos_dois_lados_sao_unidos() {
        let mut local = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "bimestre": "3", "progresso": 80.0, "em": "2026-08-25T21:00:00-03:00" } }
            }
        });
        let incoming = json!({
            "expansao_online": {
                "snapshots": { "2026-09-08": { "bimestre": "3", "progresso": 90.0, "em": "2026-09-08T21:00:00-03:00" } }
            }
        });
        mesclar_aluno(&mut local, &incoming);
        let snaps = local["expansao_online"]["snapshots"].as_object().unwrap();
        assert_eq!(snaps.len(), 2);
        assert_eq!(snaps["2026-08-25"]["progresso"], json!(80.0));
        assert_eq!(snaps["2026-09-08"]["progresso"], json!(90.0));
    }

    /// Mesma data importada nos dois lados (ex.: os dois dispositivos
    /// reimportaram o mesmo CSV) — vence o snapshot com "em" mais recente,
    /// igual já acontece com medias.
    #[test]
    fn snapshot_da_mesma_data_vence_o_em_mais_recente() {
        let mut local = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "progresso": 80.0, "em": "2026-08-25T10:00:00-03:00" } }
            }
        });
        let incoming = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "progresso": 85.0, "em": "2026-08-25T18:00:00-03:00" } }
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["expansao_online"]["snapshots"]["2026-08-25"]["progresso"], json!(85.0));
    }

    /// O merge precisa ser simétrico: a reintegração de pendrive
    /// (conselho_pendrive.rs) chama mesclar_arquivo_turma/mesclar_aluno com
    /// os lados invertidos em relação ao sync normal — se a regra não for
    /// simétrica, um dos dois sentidos perde dado.
    #[test]
    fn merge_de_expansao_e_simetrico() {
        let a = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "progresso": 80.0, "em": "2026-08-25T10:00:00-03:00" } }
            }
        });
        let b = json!({
            "expansao_online": {
                "snapshots": { "2026-09-08": { "progresso": 90.0, "em": "2026-09-08T10:00:00-03:00" } }
            }
        });

        let mut a_recebe_b = a.clone();
        mesclar_aluno(&mut a_recebe_b, &b);
        let mut b_recebe_a = b.clone();
        mesclar_aluno(&mut b_recebe_a, &a);

        let datas_de = |v: &Value| -> Vec<String> {
            let mut datas: Vec<String> =
                v["expansao_online"]["snapshots"].as_object().unwrap().keys().cloned().collect();
            datas.sort();
            datas
        };
        assert_eq!(datas_de(&a_recebe_b), vec!["2026-08-25", "2026-09-08"]);
        assert_eq!(datas_de(&b_recebe_a), vec!["2026-08-25", "2026-09-08"]);
    }
}
