#![allow(unused_imports)]

// Pendrive de conselho (check-out/check-in): prepara uma cópia portátil do app
// com as turmas de um conselho, e reintegra os dados na volta, mesclando as
// edições feitas fora. O estado de check-out fica em dados/conselhos_externos.json
// e o pendrive carrega um manifesto em dados/conselho_pendrive.json.

use crate::*;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    env, fs, io,
    path::{Path, PathBuf},
};

pub(crate) const NOME_PASTA_PENDRIVE: &str = "CoordenacaoOP-Conselho";
pub(crate) const NOME_MANIFESTO_PENDRIVE: &str = "conselho_pendrive.json";
pub(crate) const TIPO_MANIFESTO_PENDRIVE: &str = "coordenacaoop-conselho-pendrive";

#[derive(Deserialize)]
pub(crate) struct PrepararPendriveConselhoInput {
    pub(crate) destino: String,
    pub(crate) turmas: Vec<String>,
    pub(crate) bimestre: String,
}

#[derive(Serialize)]
pub(crate) struct ResultadoPreparacaoPendrive {
    pub(crate) pasta: String,
    pub(crate) turmas: usize,
    pub(crate) fotos: usize,
    pub(crate) avisos: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ConselhoExterno {
    pub(crate) caminho_relativo: String,
    pub(crate) rotulo: String,
    pub(crate) bimestre: String,
    pub(crate) pasta: String,
    pub(crate) criado_em: String,
}

#[derive(Serialize)]
pub(crate) struct PendriveConselhoDetectado {
    pub(crate) pasta: String,
    pub(crate) bimestre: String,
    pub(crate) criado_em: String,
    pub(crate) origem: String,
    pub(crate) turmas: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct ResultadoReintegracaoPendrive {
    pub(crate) turmas: usize,
    pub(crate) bimestre: String,
    pub(crate) backup_seguranca: Option<String>,
    pub(crate) avisos: Vec<String>,
}

fn caminho_conselhos_externos() -> io::Result<PathBuf> {
    Ok(data_dir()?.join("conselhos_externos.json"))
}

pub(crate) fn ler_conselhos_externos() -> Vec<ConselhoExterno> {
    caminho_conselhos_externos()
        .ok()
        .and_then(|caminho| fs::read_to_string(caminho).ok())
        .and_then(|texto| serde_json::from_str(&texto).ok())
        .unwrap_or_default()
}

fn salvar_conselhos_externos(externos: &[ConselhoExterno]) -> Result<(), String> {
    let caminho = caminho_conselhos_externos().map_err(|err| err.to_string())?;
    if let Some(pai) = caminho.parent() {
        fs::create_dir_all(pai).map_err(|err| err.to_string())?;
    }
    let texto = serde_json::to_string_pretty(externos).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto).map_err(|err| err.to_string())
}

fn nome_dispositivo() -> String {
    env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_default()
}

#[tauri::command(async)]
pub(crate) fn preparar_pendrive_conselho(
    input: PrepararPendriveConselhoInput,
) -> Result<ResultadoPreparacaoPendrive, String> {
    let _dados = travar_dados();
    let destino = input.destino.trim();
    if destino.is_empty() {
        return Err("Escolha a pasta do pendrive.".to_string());
    }
    if input.turmas.is_empty() {
        return Err("Escolha ao menos uma turma para o conselho.".to_string());
    }
    let bimestre = normalizar_bimestre(&input.bimestre);
    let pasta = PathBuf::from(destino).join(NOME_PASTA_PENDRIVE);
    if !pasta_gravavel(&pasta) {
        return Err("A pasta escolhida não permite gravação. Verifique o pendrive.".to_string());
    }

    let raiz = raiz_turmas()?;
    let raiz_canonica = raiz.canonicalize().map_err(|err| err.to_string())?;
    let pend_dados = pasta.join("dados");
    let pend_persistidos = pend_dados.join("persistidos");
    fs::create_dir_all(&pend_persistidos).map_err(|err| err.to_string())?;

    let mut avisos = Vec::new();
    let mut turmas_manifesto: Vec<(String, String)> = Vec::new();
    let mut matriculas: BTreeSet<String> = BTreeSet::new();

    for caminho_str in &input.turmas {
        let caminho = PathBuf::from(caminho_str);
        validar_caminho_turma(&caminho)?;
        let relativo = caminho
            .canonicalize()
            .ok()
            .and_then(|abs| abs.strip_prefix(&raiz_canonica).ok().map(Path::to_path_buf))
            .ok_or_else(|| "Não consegui calcular o caminho relativo da turma.".to_string())?;
        let destino_arquivo = pend_persistidos.join(&relativo);
        if let Some(pai) = destino_arquivo.parent() {
            fs::create_dir_all(pai).map_err(|err| err.to_string())?;
        }
        fs::copy(&caminho, &destino_arquivo).map_err(|err| err.to_string())?;

        let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
        let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        let rotulo = dados
            .get("codigo")
            .and_then(Value::as_str)
            .map(formatar_rotulo_turma_texto)
            .unwrap_or_else(|| relativo.to_string_lossy().to_string());
        if let Some(alunos) = dados.get("alunos").and_then(Value::as_object) {
            matriculas.extend(alunos.keys().cloned());
        }
        turmas_manifesto.push((relativo.to_string_lossy().replace('\\', "/"), rotulo));
    }

    // Configurações (critérios, nota mínima, cabeçalho da ata) valem no conselho.
    if let Ok(cfg) = config_dir() {
        if cfg.exists() {
            if let Err(err) = copiar_recursivamente(&cfg, &pasta.join("config")) {
                avisos.push(format!("Não copiei as configurações: {err}"));
            }
        }
    }

    // Fotos apenas dos alunos das turmas escolhidas.
    let mut fotos_copiadas = 0usize;
    if let Ok(fotos_local) = pasta_fotos() {
        let pend_fotos = pend_dados.join("fotos");
        fs::create_dir_all(&pend_fotos).map_err(|err| err.to_string())?;
        for matricula in &matriculas {
            let slug = sanitizar_segmento(matricula);
            for ext in EXTS_FOTO {
                let origem = fotos_local.join(format!("{slug}.{ext}"));
                if origem.exists() && fs::copy(&origem, pend_fotos.join(format!("{slug}.{ext}"))).is_ok() {
                    fotos_copiadas += 1;
                }
            }
        }
        let posicoes = fotos_local.join("posicoes.json");
        if posicoes.exists() {
            let _ = fs::copy(&posicoes, pend_fotos.join("posicoes.json"));
        }
    }

    // O próprio executável vira a versão portátil do pendrive (o modo portátil
    // é automático: pasta gravável ao lado do exe). Um build de desenvolvimento
    // não serve: ele procura o servidor do Vite em 127.0.0.1 em vez da
    // interface embutida, e abriria "conexão recusada" em outra máquina.
    if cfg!(debug_assertions) {
        avisos.push(
            "Versão de desenvolvimento: o executável NÃO foi copiado. Copie o \
             CoordenacaoOP.exe da versão instalada (release) para a pasta do pendrive."
                .to_string(),
        );
    } else {
        match env::current_exe() {
            Ok(exe) => {
                let nome_exe = if cfg!(windows) { "CoordenacaoOP.exe" } else { "CoordenacaoOP" };
                if let Err(err) = fs::copy(&exe, pasta.join(nome_exe)) {
                    avisos.push(format!(
                        "Não copiei o executável ({err}). Copie o CoordenacaoOP.exe manualmente para {}.",
                        pasta.display()
                    ));
                }
            }
            Err(err) => avisos.push(format!("Não localizei o executável do app: {err}")),
        }
    }

    let criado_em = Local::now().to_rfc3339();
    let manifesto = serde_json::json!({
        "tipo": TIPO_MANIFESTO_PENDRIVE,
        "formato": 1,
        "criado_em": criado_em,
        "origem": nome_dispositivo(),
        "bimestre": bimestre,
        "turmas": turmas_manifesto
            .iter()
            .map(|(rel, rotulo)| serde_json::json!({"caminho_relativo": rel, "rotulo": rotulo}))
            .collect::<Vec<_>>(),
    });
    escrever_json_atomicamente(
        &pend_dados.join(NOME_MANIFESTO_PENDRIVE),
        &serde_json::to_string_pretty(&manifesto).map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())?;

    // Registra o check-out: a lista de turmas passa a indicar "em conselho externo".
    let mut externos = ler_conselhos_externos();
    externos.retain(|item| {
        !(item.bimestre == bimestre
            && turmas_manifesto.iter().any(|(rel, _)| rel == &item.caminho_relativo))
    });
    for (rel, rotulo) in &turmas_manifesto {
        externos.push(ConselhoExterno {
            caminho_relativo: rel.clone(),
            rotulo: rotulo.clone(),
            bimestre: bimestre.clone(),
            pasta: pasta.to_string_lossy().to_string(),
            criado_em: criado_em.clone(),
        });
    }
    salvar_conselhos_externos(&externos)?;

    Ok(ResultadoPreparacaoPendrive {
        pasta: pasta.to_string_lossy().to_string(),
        turmas: turmas_manifesto.len(),
        fotos: fotos_copiadas,
        avisos,
    })
}

#[tauri::command(async)]
pub(crate) fn reintegrar_pendrive_conselho(
    pasta: String,
) -> Result<ResultadoReintegracaoPendrive, String> {
    let _dados = travar_dados();
    let pasta = PathBuf::from(pasta.trim());
    // Aceita a pasta CoordenacaoOP-Conselho, a raiz do pendrive ou o dados/ direto.
    let manifesto_path = [
        pasta.join("dados").join(NOME_MANIFESTO_PENDRIVE),
        pasta.join(NOME_PASTA_PENDRIVE).join("dados").join(NOME_MANIFESTO_PENDRIVE),
        pasta.join(NOME_MANIFESTO_PENDRIVE),
    ]
    .into_iter()
    .find(|caminho| caminho.exists())
    .ok_or_else(|| {
        "Não encontrei um pendrive de conselho nesta pasta (manifesto ausente).".to_string()
    })?;
    let base_dados = manifesto_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Manifesto em local inválido.".to_string())?;

    let texto = fs::read_to_string(&manifesto_path).map_err(|err| err.to_string())?;
    let mut manifesto: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    if manifesto.get("tipo").and_then(Value::as_str) != Some(TIPO_MANIFESTO_PENDRIVE) {
        return Err("Esta pasta não contém um conselho preparado por este app.".to_string());
    }
    if let Some(quando) = manifesto.get("reintegrado_em").and_then(Value::as_str) {
        if !quando.is_empty() {
            return Err(format!("Este conselho já foi reintegrado em {quando}."));
        }
    }
    let bimestre = manifesto
        .get("bimestre")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let turmas_manifesto: Vec<(String, String)> = manifesto
        .get("turmas")
        .and_then(Value::as_array)
        .map(|itens| {
            itens
                .iter()
                .filter_map(|item| {
                    let rel = item.get("caminho_relativo").and_then(Value::as_str)?;
                    let rotulo = item
                        .get("rotulo")
                        .and_then(Value::as_str)
                        .unwrap_or(rel)
                        .to_string();
                    Some((rel.to_string(), rotulo))
                })
                .collect()
        })
        .unwrap_or_default();
    if turmas_manifesto.is_empty() {
        return Err("O manifesto do pendrive não lista nenhuma turma.".to_string());
    }

    let backup_seguranca = exportar_backup_interno().ok().and_then(|info| info.caminho);

    let raiz = raiz_turmas()?;
    let mut avisos = Vec::new();
    let mut mescladas = 0usize;
    for (rel, rotulo) in &turmas_manifesto {
        let origem = base_dados.join("persistidos").join(rel);
        if !origem.exists() {
            avisos.push(format!("Turma {rotulo}: arquivo não encontrado no pendrive."));
            continue;
        }
        let destino = raiz.join(rel);
        // O caminho vem do manifesto (externo): garante que não escapa de dados/persistidos.
        garantir_caminho_em_pasta(&destino, &raiz)?;

        let texto_pendrive = fs::read_to_string(&origem).map_err(|err| err.to_string())?;
        let valor_pendrive: Value =
            serde_json::from_str(&texto_pendrive).map_err(|err| err.to_string())?;
        if destino.exists() {
            let texto_local = fs::read_to_string(&destino).map_err(|err| err.to_string())?;
            let valor_local: Value =
                serde_json::from_str(&texto_local).map_err(|err| err.to_string())?;
            // O pendrive entra como "local" do merge de propósito: em
            // mesclar_aluno as edições de conselho (ajustes, encaminhamentos)
            // do lado "local" vencem — e no check-in quem fez o conselho foi o
            // pendrive. Médias e importações continuam mescladas por timestamp.
            let mesclado = mesclar_arquivo_turma(&valor_pendrive, &valor_local);
            let texto_mesclado =
                serde_json::to_string_pretty(&mesclado).map_err(|err| err.to_string())?;
            escrever_json_atomicamente(&destino, &texto_mesclado).map_err(|err| err.to_string())?;
        } else {
            if let Some(pai) = destino.parent() {
                fs::create_dir_all(pai).map_err(|err| err.to_string())?;
            }
            fs::copy(&origem, &destino).map_err(|err| err.to_string())?;
        }
        mescladas += 1;
    }

    // Fotos: traz as novas/mais recentes do pendrive para a máquina.
    let fotos_pendrive = base_dados.join("fotos");
    if fotos_pendrive.is_dir() {
        if let Ok(fotos_local) = pasta_fotos() {
            if let Err(err) = mesclar_diretorio_fotos(&fotos_pendrive, &fotos_local) {
                avisos.push(format!("Fotos não mescladas: {err}"));
            }
        }
    }

    // Marca o pendrive como reintegrado, para a detecção não oferecer de novo.
    if let Some(obj) = manifesto.as_object_mut() {
        obj.insert(
            "reintegrado_em".to_string(),
            Value::from(Local::now().to_rfc3339()),
        );
        if let Ok(texto) = serde_json::to_string_pretty(&manifesto) {
            if escrever_json_atomicamente(&manifesto_path, &texto).is_err() {
                avisos.push(
                    "Não consegui marcar o pendrive como reintegrado (protegido contra gravação?)."
                        .to_string(),
                );
            }
        }
    }

    // Encerra o check-out das turmas reintegradas.
    let mut externos = ler_conselhos_externos();
    externos.retain(|item| {
        !turmas_manifesto
            .iter()
            .any(|(rel, _)| rel == &item.caminho_relativo && item.bimestre == bimestre)
    });
    salvar_conselhos_externos(&externos)?;

    Ok(ResultadoReintegracaoPendrive {
        turmas: mescladas,
        bimestre,
        backup_seguranca,
        avisos,
    })
}

// Procura conselhos preparados e ainda não reintegrados: nas pastas registradas
// no check-out e, no Windows, na pasta padrão de cada unidade (D: a Z:).
#[tauri::command(async)]
pub(crate) fn detectar_pendrives_conselho() -> Vec<PendriveConselhoDetectado> {
    let mut candidatos: Vec<PathBuf> = ler_conselhos_externos()
        .into_iter()
        .map(|item| PathBuf::from(item.pasta))
        .collect();
    #[cfg(target_os = "windows")]
    for letra in b'D'..=b'Z' {
        let raiz = format!("{}:\\", letra as char);
        if Path::new(&raiz).exists() {
            candidatos.push(PathBuf::from(raiz).join(NOME_PASTA_PENDRIVE));
        }
    }

    let mut vistos = BTreeSet::new();
    let mut encontrados = Vec::new();
    for pasta in candidatos {
        if !vistos.insert(pasta.to_string_lossy().to_lowercase()) {
            continue;
        }
        let manifesto_path = pasta.join("dados").join(NOME_MANIFESTO_PENDRIVE);
        let Ok(texto) = fs::read_to_string(&manifesto_path) else {
            continue;
        };
        let Ok(manifesto) = serde_json::from_str::<Value>(&texto) else {
            continue;
        };
        if manifesto.get("tipo").and_then(Value::as_str) != Some(TIPO_MANIFESTO_PENDRIVE) {
            continue;
        }
        if manifesto
            .get("reintegrado_em")
            .and_then(Value::as_str)
            .map(|quando| !quando.is_empty())
            .unwrap_or(false)
        {
            continue;
        }
        let turmas = manifesto
            .get("turmas")
            .and_then(Value::as_array)
            .map(|itens| {
                itens
                    .iter()
                    .filter_map(|item| item.get("rotulo").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        encontrados.push(PendriveConselhoDetectado {
            pasta: pasta.to_string_lossy().to_string(),
            bimestre: manifesto
                .get("bimestre")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            criado_em: manifesto
                .get("criado_em")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            origem: manifesto
                .get("origem")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            turmas,
        });
    }
    encontrados
}

#[tauri::command]
pub(crate) fn listar_conselhos_externos() -> Vec<ConselhoExterno> {
    ler_conselhos_externos()
}

// Desfaz um check-out sem reintegrar (ex.: pendrive perdido ou conselho adiado).
#[tauri::command]
pub(crate) fn cancelar_conselho_externo(
    caminho_relativo: String,
    bimestre: String,
) -> Result<Vec<ConselhoExterno>, String> {
    let _dados = travar_dados();
    let mut externos = ler_conselhos_externos();
    externos.retain(|item| {
        !(item.caminho_relativo == caminho_relativo && item.bimestre == bimestre)
    });
    salvar_conselhos_externos(&externos)?;
    Ok(externos)
}
