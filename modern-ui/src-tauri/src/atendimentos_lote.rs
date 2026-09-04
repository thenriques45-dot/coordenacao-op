// Montagem da fila de disparo em lote (Tela de Atendimentos → "Contatar
// famílias" → passo 2 "Destinatários", artboard 3a).
//
// Avalia condições no vocabulário do construtor de relatórios — SEM expor
// fórmula: cada condição é `campo · operador · valor`. Os "filtros prontos" da
// UI são só atalhos que adicionam uma condição já preenchida.

use crate::*;

use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::PathBuf;

const TIPO_CONTATO_FAMILIA: &str = "Contato com a família";

#[derive(Deserialize)]
pub(crate) struct CondicaoLote {
    pub(crate) campo: String,
    pub(crate) operador: String,
    #[serde(default)]
    pub(crate) valor: String,
    #[serde(default)]
    pub(crate) valor2: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct AlunoLote {
    matricula: String,
    nome: String,
    numero_chamada: Option<i64>,
    responsavel_nome: Option<String>,
    telefone: Option<String>,
    frequencia: Option<f64>,
    tarefas_pendentes: Option<i64>,
    ultimo_contato_dias: Option<i64>,
    dias_sem_acesso: Option<i64>,
    media_global: Option<f64>,
    media_disciplina_min: Option<f64>,
    faltas_periodo: Option<f64>,
    expansao_progresso: Option<f64>,
    entra: bool,
    condicoes_atendidas: usize,
    sem_telefone: bool,
}

struct Metricas {
    frequencia: Option<f64>,
    tarefas_pendentes: Option<f64>,
    media_global: Option<f64>,
    media_disciplina_min: Option<f64>,
    faltas_periodo: Option<f64>,
    ultimo_contato_dias: Option<i64>,
    dias_sem_acesso: Option<i64>,
    expansao_progresso: Option<f64>,
    tipos_anteriores: BTreeSet<String>,
    tags: BTreeSet<String>,
}

fn norm(s: &str) -> String {
    normalizar_texto_basico(s).to_lowercase()
}

fn metricas_aluno(info: &Value, bimestre: &str) -> Metricas {
    let frequencia = info.get("frequencia_percentual").and_then(valor_para_f64);

    let tarefas = info.get("tarefas").and_then(|t| t.get(bimestre));
    let feitas = tarefas.and_then(|b| b.get("feitas")).and_then(Value::as_f64);
    let total = tarefas.and_then(|b| b.get("total")).and_then(Value::as_f64);
    let tarefas_pendentes = match (feitas, total) {
        (Some(f), Some(t)) => Some((t - f).max(0.0)),
        _ => None,
    };

    let media_global = media_aluno_bimestre(info, bimestre);

    let medias = objeto_bimestre(info, "medias", bimestre);
    let ajustes = objeto_bimestre(info, "ajustes_medias_conselho", bimestre);
    let mut disciplinas = BTreeSet::new();
    if let Some(m) = medias {
        disciplinas.extend(m.keys().cloned());
    }
    if let Some(a) = ajustes {
        disciplinas.extend(a.keys().cloned());
    }
    let media_disciplina_min = disciplinas
        .iter()
        .filter_map(|d| nota_vigente_disciplina(info, bimestre, d))
        .fold(None, |acc: Option<f64>, n| Some(acc.map_or(n, |a| a.min(n))));

    let faltas_periodo = objeto_bimestre(info, "frequencia", bimestre)
        .map(|mapa| mapa.values().filter_map(valor_para_f64).sum::<f64>());

    let atendimentos = extrair_atendimentos_aluno(info);
    let hoje = Local::now().date_naive();
    let mut ultimo_contato: Option<NaiveDate> = None;
    let mut tipos_anteriores = BTreeSet::new();
    let mut tags = BTreeSet::new();
    for at in &atendimentos {
        for t in &at.tipos {
            tipos_anteriores.insert(norm(t));
        }
        for t in &at.tags {
            tags.insert(norm(t));
        }
        let familia = at.tipos.iter().any(|t| t == TIPO_CONTATO_FAMILIA)
            || at.canal != "manual"
            || at.atendido == "responsavel";
        if familia {
            if let Ok(d) = NaiveDate::parse_from_str(&at.data, "%Y-%m-%d") {
                if ultimo_contato.map_or(true, |u| d > u) {
                    ultimo_contato = Some(d);
                }
            }
        }
    }
    let ultimo_contato_dias = ultimo_contato.map(|d| (hoje - d).num_days().max(0));

    let snapshot_expansao = snapshot_expansao_atual(info, bimestre);
    let dias_sem_acesso = snapshot_expansao
        .as_ref()
        .and_then(|s| s.ultimo_acesso)
        .map(|d| (hoje - d).num_days().max(0));
    let expansao_progresso = snapshot_expansao.and_then(|s| s.progresso);

    Metricas {
        frequencia,
        tarefas_pendentes,
        media_global,
        media_disciplina_min,
        faltas_periodo,
        ultimo_contato_dias,
        dias_sem_acesso,
        expansao_progresso,
        tipos_anteriores,
        tags,
    }
}

fn num_do_campo(m: &Metricas, campo: &str) -> Option<f64> {
    match campo {
        "tarefas_pendentes" => m.tarefas_pendentes,
        "frequencia" => m.frequencia,
        "media_global" => m.media_global,
        "media_disciplina" => m.media_disciplina_min,
        "faltas_periodo" => m.faltas_periodo,
        "dias_sem_acesso" => m.dias_sem_acesso.map(|d| d as f64),
        "ultimo_contato_familia" => m.ultimo_contato_dias.map(|d| d as f64),
        "expansao_progresso" => m.expansao_progresso,
        _ => None,
    }
}

fn condicao_atendida(m: &Metricas, c: &CondicaoLote) -> bool {
    let alvo: f64 = c.valor.trim().replace(',', ".").parse().unwrap_or(f64::NAN);
    match c.operador.as_str() {
        "maior_que" => num_do_campo(m, &c.campo).map_or(false, |v| v > alvo),
        "menor_que" => num_do_campo(m, &c.campo).map_or(false, |v| v < alvo),
        "entre" => {
            let alvo2: f64 = c
                .valor2
                .as_deref()
                .unwrap_or("")
                .trim()
                .replace(',', ".")
                .parse()
                .unwrap_or(f64::NAN);
            num_do_campo(m, &c.campo).map_or(false, |v| {
                let (lo, hi) = if alvo <= alvo2 { (alvo, alvo2) } else { (alvo2, alvo) };
                v >= lo && v <= hi
            })
        }
        // "há mais de N dias" / "há menos de N dias" — sem contato conta como
        // "há mais de qualquer coisa".
        "ha_mais_de" => match c.campo.as_str() {
            "ultimo_contato_familia" => m.ultimo_contato_dias.map_or(true, |d| (d as f64) > alvo),
            _ => num_do_campo(m, &c.campo).map_or(false, |v| v > alvo),
        },
        "ha_menos_de" => match c.campo.as_str() {
            "ultimo_contato_familia" => m.ultimo_contato_dias.map_or(false, |d| (d as f64) < alvo),
            _ => num_do_campo(m, &c.campo).map_or(false, |v| v < alvo),
        },
        "e" | "nao_e" | "contem" => {
            let conjunto = match c.campo.as_str() {
                "tipo_atendimento_anterior" => &m.tipos_anteriores,
                "tag" => &m.tags,
                _ => return false,
            };
            let alvo_txt = norm(&c.valor);
            let bate = match c.operador.as_str() {
                "e" => conjunto.contains(&alvo_txt),
                "nao_e" => !conjunto.contains(&alvo_txt),
                "contem" => conjunto.iter().any(|v| v.contains(&alvo_txt)),
                _ => false,
            };
            bate
        }
        _ => false,
    }
}

#[tauri::command]
pub(crate) fn avaliar_condicoes_atendimento_lote(
    caminho: String,
    bimestre: String,
    combinador: String,
    condicoes: Vec<CondicaoLote>,
) -> Result<Vec<AlunoLote>, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = std::fs::read_to_string(&caminho).map_err(|e| e.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|e| e.to_string())?;
    let bimestre = normalizar_bimestre(&bimestre);
    let qualquer = combinador == "qualquer";

    let alunos = dados
        .get("alunos")
        .and_then(Value::as_object)
        .ok_or_else(|| "Turma sem alunos.".to_string())?;

    let mut saida = Vec::new();
    for (matricula, info) in alunos {
        if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
            continue;
        }
        let nome = info.get("nome").and_then(Value::as_str).unwrap_or("").to_string();
        let numero_chamada = info.get("numero_chamada").and_then(Value::as_i64);
        let m = metricas_aluno(info, &bimestre);

        let responsavel = extrair_responsaveis_aluno(info)
            .into_iter()
            .find(|r| !r.telefone.chars().filter(|c| c.is_ascii_digit()).collect::<String>().is_empty());
        let (responsavel_nome, telefone) = match &responsavel {
            Some(r) => (Some(r.nome.clone()), Some(r.telefone.clone())),
            None => (None, None),
        };

        let atendidas = condicoes.iter().filter(|c| condicao_atendida(&m, c)).count();
        let entra = if condicoes.is_empty() {
            false
        } else if qualquer {
            atendidas > 0
        } else {
            atendidas == condicoes.len()
        };

        saida.push(AlunoLote {
            matricula: matricula.clone(),
            nome,
            numero_chamada,
            responsavel_nome,
            telefone: telefone.clone(),
            frequencia: m.frequencia,
            tarefas_pendentes: m.tarefas_pendentes.map(|v| v as i64),
            ultimo_contato_dias: m.ultimo_contato_dias,
            dias_sem_acesso: m.dias_sem_acesso,
            media_global: m.media_global,
            media_disciplina_min: m.media_disciplina_min,
            faltas_periodo: m.faltas_periodo,
            expansao_progresso: m.expansao_progresso,
            entra,
            condicoes_atendidas: atendidas,
            sem_telefone: telefone.is_none(),
        });
    }

    saida.sort_by(|a, b| {
        (a.numero_chamada.unwrap_or(i64::MAX), a.nome.clone())
            .cmp(&(b.numero_chamada.unwrap_or(i64::MAX), b.nome.clone()))
    });
    Ok(saida)
}

// ── Entidade "Disparo em lote" ──────────────────────────────────────────────
// Vive no array `disparos_lote` do JSON da turma. A fila assistida grava o
// progresso aqui para pausar/retomar entre sessões; o lote via API guarda o
// resultado e as falhas. Merge por id no sync (sync.rs::mesclar_disparos_lote).

#[derive(Deserialize)]
pub(crate) struct DisparoDestinatarioInput {
    pub(crate) matricula: String,
    pub(crate) nome: String,
    #[serde(default)]
    pub(crate) responsavel_nome: Option<String>,
    #[serde(default)]
    pub(crate) telefone: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct IniciarDisparoInput {
    pub(crate) modelo_id: String,
    #[serde(default)]
    pub(crate) modelo_titulo: String,
    pub(crate) canal: String,
    pub(crate) destinatarios: Vec<DisparoDestinatarioInput>,
}

fn agora_rfc3339() -> String {
    chrono::Local::now().to_rfc3339()
}

fn ler_turma(caminho: &std::path::Path) -> Result<Value, String> {
    validar_caminho_turma(caminho)?;
    let texto = std::fs::read_to_string(caminho).map_err(|e| e.to_string())?;
    serde_json::from_str(&texto).map_err(|e| e.to_string())
}

fn gravar_turma(caminho: &std::path::Path, dados: &Value) -> Result<(), String> {
    let texto = serde_json::to_string_pretty(dados).map_err(|e| e.to_string())?;
    escrever_json_atomicamente(caminho, &texto).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn carregar_disparos_lote(caminho: String) -> Result<Vec<Value>, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    let dados = ler_turma(&caminho)?;
    let mut lista = dados
        .get("disparos_lote")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    // Mais recentes primeiro.
    lista.sort_by(|a, b| {
        b.get("data_hora").and_then(Value::as_str).unwrap_or("")
            .cmp(a.get("data_hora").and_then(Value::as_str).unwrap_or(""))
    });
    Ok(lista)
}

#[tauri::command]
pub(crate) fn iniciar_disparo_lote(caminho: String, input: IniciarDisparoInput) -> Result<Value, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    let mut dados = ler_turma(&caminho)?;

    let agora = agora_rfc3339();
    let turma_codigo = dados.get("codigo").and_then(Value::as_str).unwrap_or("").to_string();
    let destinatarios: Vec<Value> = input
        .destinatarios
        .iter()
        .map(|d| serde_json::json!({
            "matricula": d.matricula,
            "nome": d.nome,
            "responsavel_nome": d.responsavel_nome,
            "telefone": d.telefone,
        }))
        .collect();

    let registro = serde_json::json!({
        "id": format!("disparo-{}", chrono::Local::now().timestamp_millis()),
        "data_hora": agora,
        "modelo_id": input.modelo_id,
        "modelo_titulo": input.modelo_titulo,
        "canal": input.canal,
        "turma": turma_codigo,
        "destinatarios": destinatarios,
        "enviados": [],
        "pulados": [],
        "falhas": [],
        "posicao_atual": 0,
        "situacao": "em_progresso",
        "custo": Value::Null,
        "atualizado_em": agora,
    });

    let obj = dados.as_object_mut().ok_or_else(|| "Turma invalida.".to_string())?;
    obj.entry("disparos_lote".to_string())
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| "Lista de disparos invalida.".to_string())?
        .push(registro.clone());

    gravar_turma(&caminho, &dados)?;
    Ok(registro)
}

/// Substitui um disparo por id pelo `disparo` recebido (progresso da fila,
/// falhas do lote…). O frontend manda o registro inteiro, já com a situacao.
#[tauri::command]
pub(crate) fn atualizar_disparo_lote(caminho: String, disparo: Value) -> Result<Value, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    let mut dados = ler_turma(&caminho)?;
    let id = disparo.get("id").and_then(Value::as_str).unwrap_or("").to_string();
    if id.is_empty() {
        return Err("Disparo sem id.".to_string());
    }
    let mut registro = disparo;
    if let Some(obj) = registro.as_object_mut() {
        obj.insert("atualizado_em".to_string(), Value::String(agora_rfc3339()));
    }

    let lista = dados
        .as_object_mut()
        .and_then(|o| o.get_mut("disparos_lote"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Nenhum disparo nesta turma.".to_string())?;
    let alvo = lista
        .iter_mut()
        .find(|d| d.get("id").and_then(Value::as_str) == Some(id.as_str()))
        .ok_or_else(|| "Disparo nao encontrado.".to_string())?;
    *alvo = registro.clone();

    gravar_turma(&caminho, &dados)?;
    Ok(registro)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn metricas_de(info: &Value) -> Metricas {
        metricas_aluno(info, "2")
    }

    #[test]
    fn condicao_numerica_maior_menor_entre() {
        let m = metricas_de(&json!({
            "frequencia_percentual": 68.0,
            "tarefas": { "2": { "feitas": 3, "total": 12 } }
        }));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "frequencia".into(), operador: "menor_que".into(), valor: "75".into(), valor2: None }));
        assert!(!condicao_atendida(&m, &CondicaoLote { campo: "frequencia".into(), operador: "maior_que".into(), valor: "75".into(), valor2: None }));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "tarefas_pendentes".into(), operador: "maior_que".into(), valor: "0".into(), valor2: None }));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "frequencia".into(), operador: "entre".into(), valor: "60".into(), valor2: Some("70".into()) }));
    }

    #[test]
    fn sem_dado_nao_atende_condicao_numerica() {
        let m = metricas_de(&json!({}));
        assert!(!condicao_atendida(&m, &CondicaoLote { campo: "frequencia".into(), operador: "menor_que".into(), valor: "75".into(), valor2: None }));
    }

    #[test]
    fn ultimo_contato_sem_registro_conta_como_ha_mais_de() {
        let m = metricas_de(&json!({}));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "ultimo_contato_familia".into(), operador: "ha_mais_de".into(), valor: "15".into(), valor2: None }));
        assert!(!condicao_atendida(&m, &CondicaoLote { campo: "ultimo_contato_familia".into(), operador: "ha_menos_de".into(), valor: "15".into(), valor2: None }));
    }

    #[test]
    fn condicao_expansao_progresso_le_o_snapshot_do_bimestre() {
        let m = metricas_de(&json!({
            "expansao_online": { "snapshots": {
                "2026-05-01": { "bimestre": "1", "progresso": 90.0 },
                "2026-07-01": { "bimestre": "2", "progresso": 40.0 }
            } }
        }));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "expansao_progresso".into(), operador: "menor_que".into(), valor: "50".into(), valor2: None }));
        assert!(!condicao_atendida(&m, &CondicaoLote { campo: "expansao_progresso".into(), operador: "maior_que".into(), valor: "50".into(), valor2: None }));
    }

    #[test]
    fn merge_disparos_lote_une_por_id_e_o_mais_recente_vence() {
        let mut local = json!({ "disparos_lote": [
            { "id": "d1", "situacao": "em_progresso", "enviados": ["a"], "atualizado_em": "2026-05-01T10:00:00-03:00" }
        ] });
        let incoming = json!({ "disparos_lote": [
            { "id": "d1", "situacao": "pausada", "enviados": ["a", "b"], "atualizado_em": "2026-05-01T12:00:00-03:00" },
            { "id": "d2", "situacao": "concluida", "atualizado_em": "2026-05-02T09:00:00-03:00" }
        ] });
        crate::mesclar_disparos_lote(local.as_object_mut().unwrap(), &incoming);
        let lista = local["disparos_lote"].as_array().unwrap();
        assert_eq!(lista.len(), 2);
        let d1 = lista.iter().find(|d| d["id"] == "d1").unwrap();
        assert_eq!(d1["situacao"], "pausada");
        assert_eq!(d1["enviados"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn condicao_de_tag_ignora_acento_e_caixa() {
        let m = metricas_de(&json!({
            "atendimentos": [{ "id": "a1", "data": "2026-05-01", "tipos": ["Disciplinar"], "tags": ["Reforço"], "atendido": "aluno", "descricao": "x", "canal": "manual" }]
        }));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "tag".into(), operador: "e".into(), valor: "reforco".into(), valor2: None }));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "tipo_atendimento_anterior".into(), operador: "e".into(), valor: "disciplinar".into(), valor2: None }));
        assert!(condicao_atendida(&m, &CondicaoLote { campo: "tipo_atendimento_anterior".into(), operador: "nao_e".into(), valor: "financeiro".into(), valor2: None }));
    }
}
