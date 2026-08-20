// Coleções nomeadas: o mecanismo de fan-out por trás de
// `FonteLinhas::PorAlunoEItem`. Cada coleção expande UM aluno em zero ou
// mais `ItemFanOut` (ex.: uma disciplina alterada no conselho vira um item;
// um aluno sem alteração nenhuma não gera item nenhum). `parametro` de cada
// item alimenta os campos parametrizados que já existem (campos.rs);
// `extras` carrega valores que só existem naquele item específico, lidos
// via `ExpressaoNo::ItemAtual` (expressoes.rs).

use serde_json::Value;
use std::collections::BTreeMap;

use crate::*;

use super::campos::{levantar_recuperacao_aluno, ItemFanOut};
use super::expressoes::ValorExpressao;

pub(crate) fn gerar_colecao(
    id: &str,
    turma: &TurmaArquivo,
    aluno: &Value,
    bimestre: &str,
    parametros: &BTreeMap<String, ValorExpressao>,
) -> Vec<ItemFanOut> {
    match id {
        "disciplinas_ajustadas_bimestre" => colecao_disciplinas_ajustadas_bimestre(aluno, bimestre),
        "sugestoes_substituicao_recuperacao" => colecao_sugestoes_substituicao_recuperacao(turma, aluno, parametros),
        _ => Vec::new(),
    }
}

/// Uma disciplina por ajuste de conselho lançado no bimestre — réplica de
/// `levantar_alteracoes_notas_turma` (docx.rs:980-1059), sem o agrupamento
/// por turma que já é papel do motor (agrupamento.campo).
fn colecao_disciplinas_ajustadas_bimestre(aluno: &Value, bimestre: &str) -> Vec<ItemFanOut> {
    let Some(ajustes) = objeto_bimestre(aluno, "ajustes_medias_conselho", bimestre) else {
        return Vec::new();
    };
    let medias = objeto_bimestre(aluno, "medias", bimestre);
    let mut itens = Vec::new();

    for (disciplina, ajuste) in ajustes {
        let Some(media_conselho) = ajuste.get("media_ajustada").and_then(valor_para_f64) else {
            continue;
        };
        let media_mapao = medias.and_then(|mapa| mapa.get(disciplina)).and_then(valor_para_f64);
        let media_original = ajuste.get("media_original").and_then(valor_para_f64).or(media_mapao);

        let situacao = match media_mapao {
            Some(media) if notas_equivalentes(media, media_conselho) => "Confirmada no mapão".to_string(),
            // Faixa igual (ambos aprovados ou ambos reprovados) mas notas
            // diferentes: divergência não vale a pena sinalizar — descartado
            // silenciosamente, igual ao relatório original.
            Some(media) if notas_mesma_faixa(media, media_conselho) => continue,
            Some(_) => "Conselho e mapão em faixas diferentes".to_string(),
            None => "Sem nota no mapão".to_string(),
        };

        let mut extras = BTreeMap::new();
        extras.insert(
            "media_original".to_string(),
            media_original.map(ValorExpressao::Numero).unwrap_or(ValorExpressao::Nulo),
        );
        extras.insert("media_conselho".to_string(), ValorExpressao::Numero(media_conselho));
        extras.insert(
            "media_mapao".to_string(),
            media_mapao.map(ValorExpressao::Numero).unwrap_or(ValorExpressao::Nulo),
        );
        extras.insert("situacao".to_string(), ValorExpressao::Texto(situacao));
        extras.insert(
            "disciplina_rotulo".to_string(),
            ValorExpressao::Texto(formatar_rotulo_turma_texto(disciplina)),
        );
        itens.push(ItemFanOut {
            parametro: disciplina.clone(),
            extras,
        });
    }

    itens
}

/// Sugestões de troca de nota pra prova de recuperação — só gera itens para
/// alunos elegíveis (mesmo critério do parâmetro `limiar_percentual`, igual
/// ao usado na seção "Alunos Elegíveis"). Réplica do laço de pareamento por
/// semestre de `levantar_elegiveis_recuperacao_turma` (docx.rs:911-943).
fn colecao_sugestoes_substituicao_recuperacao(
    _turma: &TurmaArquivo,
    aluno: &Value,
    parametros: &BTreeMap<String, ValorExpressao>,
) -> Vec<ItemFanOut> {
    let nota_minima = obter_nota_minima_configurada();
    let limiar = parametros.get("limiar_percentual").and_then(ValorExpressao::como_numero).unwrap_or(50.0);
    let levantamento = levantar_recuperacao_aluno(aluno, nota_minima);
    let Some(percentual) = levantamento.percentual_vermelhas() else {
        return Vec::new();
    };
    if percentual < limiar {
        return Vec::new();
    }

    let mut itens = Vec::new();
    for (rotulo_a, rotulo_b, mapa) in [
        ("1", "2", &levantamento.notas_par_1_2),
        ("3", "4", &levantamento.notas_par_3_4),
    ] {
        for (disciplina, (nota_a, nota_b)) in mapa {
            let vermelha_a = nota_a.is_some_and(|valor| valor < nota_minima);
            let vermelha_b = nota_b.is_some_and(|valor| valor < nota_minima);

            let (bimestre_repor, nota_repor, bimestre_outro, nota_outro) = match (vermelha_a, vermelha_b) {
                (false, false) => continue,
                (true, false) => (rotulo_a, nota_a.unwrap(), nota_b.map(|_| rotulo_b.to_string()), *nota_b),
                (false, true) => (rotulo_b, nota_b.unwrap(), nota_a.map(|_| rotulo_a.to_string()), *nota_a),
                (true, true) => {
                    if nota_a.unwrap() <= nota_b.unwrap() {
                        (rotulo_a, nota_a.unwrap(), Some(rotulo_b.to_string()), *nota_b)
                    } else {
                        (rotulo_b, nota_b.unwrap(), Some(rotulo_a.to_string()), *nota_a)
                    }
                }
            };

            let mut extras = BTreeMap::new();
            extras.insert("bimestre_repor".to_string(), ValorExpressao::Texto(bimestre_repor.to_string()));
            extras.insert("nota_repor".to_string(), ValorExpressao::Numero(nota_repor));
            extras.insert(
                "bimestre_outro".to_string(),
                bimestre_outro.map(ValorExpressao::Texto).unwrap_or(ValorExpressao::Nulo),
            );
            extras.insert(
                "nota_outro".to_string(),
                nota_outro.map(ValorExpressao::Numero).unwrap_or(ValorExpressao::Nulo),
            );
            extras.insert(
                "disciplina_rotulo".to_string(),
                ValorExpressao::Texto(formatar_rotulo_turma_texto(disciplina)),
            );
            itens.push(ItemFanOut {
                parametro: disciplina.clone(),
                extras,
            });
        }
    }

    itens
}
