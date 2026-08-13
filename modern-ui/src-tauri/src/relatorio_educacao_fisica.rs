// Relatório de frequência em Educação Física — turmas de Ensino Médio.
//
// Educação Física, quando ofertada, chega por um mapão separado que mistura
// alunos de várias turmas/turnos num único arquivo (ver
// mapao_educacao_fisica_misto em importador_mapao.rs), então nem todo aluno
// do EM tem essa disciplina lançada. A presença de carga horária de
// "EDUCACAO FISICA" (nome já normalizado — sem acento/caixa — como gravado
// pelo importador) é o único sinal de que o aluno faz a disciplina.

use crate::*;

use chrono::Local;
use serde::Serialize;
use serde_json::Value;
use std::fs;

const DISCIPLINA_EDUCACAO_FISICA: &str = "EDUCACAO FISICA";

#[derive(Serialize)]
pub(crate) struct RelatorioEducacaoFisicaResultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) turmas: usize,
    pub(crate) alunos: usize,
}

#[tauri::command(async)]
pub(crate) fn gerar_relatorio_educacao_fisica(
    turmas_filtro: Vec<String>,
) -> Result<RelatorioEducacaoFisicaResultado, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta: {err}"))?
        .join("relatorios");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let ts = Local::now().format("%Y%m%d_%H%M%S");
    let caminho = pasta.join(format!("educacao_fisica_{}.csv", ts));

    let filtro_ativo = !turmas_filtro.is_empty();

    // (turma, numero, nome, faltas_acumuladas, total_aulas_acumuladas, frequencia_pct)
    type LinhaEducacaoFisica = (String, i64, String, f64, f64, i64);
    let mut linhas: Vec<LinhaEducacaoFisica> = Vec::new();
    let mut turmas_com_dados = 0usize;

    for (_, turma) in &turmas {
        if !turma_ensino_medio(turma) {
            continue;
        }
        if filtro_ativo && !turmas_filtro.contains(&turma.codigo) {
            continue;
        }
        let Some(alunos) = &turma.alunos else {
            continue;
        };
        let carga_horaria = turma.carga_horaria.clone().unwrap_or_default();
        let mut tem_aluno = false;

        for (_, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }

            let mut faltas_acumuladas = 0.0;
            let mut total_aulas_acumuladas = 0.0;
            for periodo in ["1", "2", "3", "4"] {
                if let Some(valor) = objeto_bimestre(info, "frequencia", periodo)
                    .and_then(|mapa| mapa.get(DISCIPLINA_EDUCACAO_FISICA))
                    .and_then(valor_para_f64)
                {
                    faltas_acumuladas += valor;
                }
                if let Some(valor) = carga_horaria
                    .get(periodo)
                    .and_then(Value::as_object)
                    .and_then(|mapa| mapa.get(DISCIPLINA_EDUCACAO_FISICA))
                    .and_then(valor_para_f64)
                {
                    total_aulas_acumuladas += valor;
                }
            }

            // Sem carga horária de Educação Física lançada = aluno não faz a disciplina.
            if total_aulas_acumuladas <= 0.0 {
                continue;
            }

            let nome = info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let numero = info
                .get("numero_chamada")
                .and_then(Value::as_i64)
                .unwrap_or(0);
            let frequencia_pct = ((1.0 - faltas_acumuladas / total_aulas_acumuladas) * 100.0)
                .clamp(0.0, 100.0)
                .round() as i64;

            linhas.push((
                turma.codigo.clone(),
                numero,
                nome,
                faltas_acumuladas,
                total_aulas_acumuladas,
                frequencia_pct,
            ));
            tem_aluno = true;
        }
        if tem_aluno {
            turmas_com_dados += 1;
        }
    }

    linhas.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    let total_alunos = linhas.len();

    let mut conteudo =
        "\u{FEFF}Turma;N\u{00BA};Nome;Faltas;Total de aulas;Frequ\u{00EA}ncia (%)\n".to_string();
    for (turma, numero, nome, faltas, total_aulas, frequencia_pct) in &linhas {
        let num_str = if *numero > 0 {
            numero.to_string()
        } else {
            String::new()
        };
        conteudo.push_str(&format!(
            "{turma};{num_str};{nome};{faltas:.0};{total_aulas:.0};{frequencia_pct}\n"
        ));
    }

    fs::write(&caminho, conteudo.as_bytes()).map_err(|err| err.to_string())?;
    Ok(RelatorioEducacaoFisicaResultado {
        caminho: caminho.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        turmas: turmas_com_dados,
        alunos: total_alunos,
    })
}
