
// Variáveis de mensagem para o responsável (contato com a família).
// Resolve, para um aluno e bimestre, os valores que os templates de mensagem
// (Configurações → Mensagens à família) podem interpolar entre chaves:
// {aluno}, {tarefas_pendentes}, {frequencia}, {expansao_...} etc. A tela do
// aluno faz a substituição de texto; aqui só entregamos o dicionário já
// calculado, marcando como indisponível o que não existe para aquela turma.

use crate::*;

use chrono::{Datelike, Local, NaiveDate};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Serialize)]
pub(crate) struct VariavelMensagem {
    pub(crate) chave: String,
    pub(crate) rotulo: String,
    pub(crate) valor: String,
    pub(crate) disponivel: bool,
}

#[tauri::command]
pub(crate) fn resolver_variaveis_mensagem(
    caminho: String,
    matricula: String,
    bimestre: String,
) -> Result<Vec<VariavelMensagem>, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = std::fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    let bimestre = normalizar_bimestre(&bimestre);
    let configuracoes = ler_configuracoes();
    let nota_minima = configuracoes.nota_minima;
    let direcao_nome = configuracoes.direcao_nome;

    let codigo_turma = dados
        .get("codigo")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let serie_turma = dados
        .get("serie")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let aluno = dados
        .get("alunos")
        .and_then(Value::as_object)
        .and_then(|alunos| alunos.get(matricula.trim()))
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;

    let nome_completo = aluno
        .get("nome")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let primeiro_nome = nome_completo
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string();

    let mut vars: Vec<VariavelMensagem> = Vec::new();
    let mut add = |chave: &str, rotulo: &str, valor: Option<String>| {
        let (valor, disponivel) = match valor {
            Some(texto) if !texto.trim().is_empty() => (texto, true),
            _ => (String::new(), false),
        };
        vars.push(VariavelMensagem {
            chave: chave.to_string(),
            rotulo: rotulo.to_string(),
            valor,
            disponivel,
        });
    };

    add(
        "aluno",
        "Primeiro nome do estudante",
        (!primeiro_nome.is_empty()).then(|| primeiro_nome.clone()),
    );
    add(
        "aluno_completo",
        "Nome completo do estudante",
        (!nome_completo.is_empty()).then(|| nome_completo.clone()),
    );
    add(
        "turma",
        "Turma",
        (!codigo_turma.is_empty()).then(|| codigo_turma.clone()),
    );
    add(
        "serie",
        "Série",
        (!serie_turma.is_empty()).then(|| serie_turma.clone()),
    );
    add("bimestre", "Bimestre", Some(format!("{bimestre}º bimestre")));

    // ── Tarefas do bimestre ────────────────────────────────────────────────
    let tarefas = aluno.get("tarefas").and_then(|t| t.get(&bimestre));
    let feitas = tarefas.and_then(|b| b.get("feitas")).and_then(Value::as_u64);
    let total = tarefas.and_then(|b| b.get("total")).and_then(Value::as_u64);
    add(
        "tarefas_feitas",
        "Tarefas concluídas no bimestre",
        feitas.map(|valor| valor.to_string()),
    );
    add(
        "tarefas_total",
        "Total de tarefas no bimestre",
        total.map(|valor| valor.to_string()),
    );
    add(
        "tarefas_pendentes",
        "Tarefas pendentes no bimestre",
        match (feitas, total) {
            (Some(f), Some(t)) => Some(t.saturating_sub(f).to_string()),
            _ => None,
        },
    );

    // ── Frequência anual e faltas do bimestre ──────────────────────────────
    let frequencia = aluno.get("frequencia_percentual").and_then(valor_para_f64);
    add(
        "frequencia",
        "Frequência anual (%)",
        frequencia.map(formatar_percentual_pt),
    );
    let faltas_bimestre = objeto_bimestre(aluno, "frequencia", &bimestre)
        .map(|mapa| mapa.values().filter_map(valor_para_f64).sum::<f64>());
    add(
        "faltas",
        "Faltas no bimestre",
        faltas_bimestre.map(formatar_numero_sem_decimal),
    );

    // ── Desempenho ────────────────────────────────────────────────────────
    add(
        "media_global",
        "Média global do bimestre",
        media_aluno_bimestre(aluno, &bimestre).map(formatar_media_pt),
    );
    let abaixo = disciplinas_baixas_aluno(aluno, &bimestre, nota_minima);
    add(
        "disciplinas_abaixo",
        "Disciplinas abaixo da média",
        (!abaixo.is_empty()).then(|| abaixo.join(", ")),
    );

    // ── Expansão (plataforma) — snapshot mais recente do bimestre ──────────
    let snapshot = snapshot_expansao_atual(aluno, &bimestre);
    add(
        "expansao_progresso",
        "Expansão — progresso atual (%)",
        snapshot
            .as_ref()
            .and_then(|s| s.progresso)
            .map(formatar_percentual_pt),
    );
    add(
        "expansao_ultimo_acesso",
        "Expansão — data do último acesso",
        snapshot
            .as_ref()
            .and_then(|s| s.ultimo_acesso)
            .map(|data| data.format("%d/%m/%Y").to_string()),
    );
    add(
        "expansao_dias_sem_acesso",
        "Expansão — dias sem acessar a plataforma",
        snapshot
            .as_ref()
            .and_then(|s| s.ultimo_acesso)
            .map(|data| (Local::now().date_naive() - data).num_days().max(0).to_string()),
    );

    // ── Institucional / data ──────────────────────────────────────────────
    add(
        "direcao",
        "Nome da direção",
        (!direcao_nome.trim().is_empty() && !direcao_nome.contains('_')).then(|| direcao_nome.clone()),
    );
    add("data_extenso", "Data de hoje por extenso", Some(data_hoje_extenso()));

    Ok(vars)
}

struct SnapshotExpansaoAtual {
    progresso: Option<f64>,
    ultimo_acesso: Option<NaiveDate>,
}

/// Réplica enxuta de `campos.rs::ultimo_snapshot_do_bimestre`: o snapshot
/// mais recente (chave ISO "AAAA-MM-DD", ordem crescente no BTreeMap) cujo
/// bimestre bate com o pedido. Não faz deltas — a mensagem à família é sobre
/// "agora", não sobre variação entre importações.
fn snapshot_expansao_atual(aluno: &Value, bimestre: &str) -> Option<SnapshotExpansaoAtual> {
    let snapshots = aluno
        .get("expansao_online")
        .and_then(|envelope| envelope.get("snapshots"))
        .and_then(Value::as_object)?;
    snapshots
        .iter()
        .rev()
        .find(|(_, snap)| snap.get("bimestre").and_then(Value::as_str) == Some(bimestre))
        .map(|(_, snap)| SnapshotExpansaoAtual {
            progresso: snap.get("progresso").and_then(Value::as_f64),
            ultimo_acesso: snap
                .get("ultimo_acesso")
                .and_then(Value::as_str)
                .and_then(|valor| NaiveDate::parse_from_str(valor, "%Y-%m-%d").ok()),
        })
}

fn formatar_percentual_pt(valor: f64) -> String {
    if valor.fract().abs() < 0.05 {
        format!("{}%", valor.round() as i64)
    } else {
        format!("{valor:.1}%").replace('.', ",")
    }
}

fn formatar_media_pt(valor: f64) -> String {
    format!("{valor:.1}").replace('.', ",")
}

fn data_hoje_extenso() -> String {
    let hoje = Local::now().date_naive();
    const MESES: [&str; 12] = [
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    ];
    format!(
        "{} de {} de {}",
        hoje.day(),
        MESES[(hoje.month() - 1) as usize],
        hoje.year()
    )
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn percentual_sem_decimal_quando_inteiro() {
        assert_eq!(formatar_percentual_pt(100.0), "100%");
        assert_eq!(formatar_percentual_pt(71.0), "71%");
    }

    #[test]
    fn percentual_com_virgula_quando_fracionario() {
        assert_eq!(formatar_percentual_pt(71.4), "71,4%");
    }

    #[test]
    fn media_usa_virgula() {
        assert_eq!(formatar_media_pt(6.25), "6,2");
    }

    #[test]
    fn normaliza_responsaveis_limpa_e_limita_a_dois() {
        let entrada = vec![
            Responsavel {
                nome: "  Maria Silva ".to_string(),
                parentesco: "MÃE".to_string(),
                parentesco_desc: Some("ignorar".to_string()),
                telefone: "(11) 98765-4321".to_string(),
            },
            Responsavel {
                nome: "Avó Joana".to_string(),
                parentesco: "avó".to_string(),
                parentesco_desc: Some("  avó  ".to_string()),
                telefone: "11 3333 2222".to_string(),
            },
            Responsavel {
                nome: "".to_string(),
                parentesco: "pai".to_string(),
                parentesco_desc: None,
                telefone: "".to_string(),
            },
            Responsavel {
                nome: "Excedente".to_string(),
                parentesco: "pai".to_string(),
                parentesco_desc: None,
                telefone: "119999".to_string(),
            },
        ];
        let saida = normalizar_responsaveis(&entrada);
        assert_eq!(saida.len(), 2);
        assert_eq!(saida[0].nome, "Maria Silva");
        assert_eq!(saida[0].parentesco, "mae");
        assert_eq!(saida[0].parentesco_desc, None);
        assert_eq!(saida[0].telefone, "11987654321");
        assert_eq!(saida[1].parentesco, "outro");
        assert_eq!(saida[1].parentesco_desc.as_deref(), Some("avó"));
    }

    #[test]
    fn normaliza_templates_descarta_vazios_e_gera_id() {
        let entrada = vec![
            MensagemTemplate {
                id: "".to_string(),
                titulo: "  Faltas  ".to_string(),
                corpo: "Olá {aluno}".to_string(),
                tags: vec![" Faltas ".to_string(), "".to_string()],
            },
            MensagemTemplate {
                id: "  ".to_string(),
                titulo: "".to_string(),
                corpo: "   ".to_string(),
                tags: vec![],
            },
        ];
        let saida = normalizar_mensagem_templates(&entrada);
        assert_eq!(saida.len(), 1);
        assert_eq!(saida[0].id, "tpl-1");
        assert_eq!(saida[0].titulo, "Faltas");
        assert_eq!(saida[0].tags, vec!["Faltas".to_string()]);
    }

    #[test]
    fn templates_padrao_incluem_faltas_e_tarefas() {
        let padrao = mensagem_familia_templates_padrao();
        assert!(padrao.iter().any(|t| t.titulo == "Excesso de faltas"));
        assert!(padrao.iter().any(|t| t.titulo == "Cobrança de tarefas"));
        assert!(padrao.iter().all(|t| !t.id.is_empty() && !t.corpo.is_empty()));
    }

    #[test]
    fn snapshot_expansao_pega_o_mais_recente_do_bimestre() {
        let aluno = json!({
            "expansao_online": { "snapshots": {
                "2026-03-01": { "bimestre": "1", "progresso": 10.0, "ultimo_acesso": "2026-02-20" },
                "2026-05-10": { "bimestre": "2", "progresso": 30.0, "ultimo_acesso": "2026-05-01" },
                "2026-05-20": { "bimestre": "2", "progresso": 45.0, "ultimo_acesso": "2026-05-18" }
            }}
        });
        let snap = snapshot_expansao_atual(&aluno, "2").unwrap();
        assert_eq!(snap.progresso, Some(45.0));
        assert_eq!(
            snap.ultimo_acesso,
            Some(NaiveDate::from_ymd_opt(2026, 5, 18).unwrap())
        );
        assert!(snapshot_expansao_atual(&aluno, "3").is_none());
    }
}
