// Validação semântica de uma ReportDefinition: o que o serde não pega
// sozinho. O executor é tolerante de propósito (campo com id desconhecido
// vira Nulo, ordenação por coluna inexistente é ignorada), o que é ótimo pra
// não quebrar um relatório antigo, mas esconde erro de quem gera definição
// fora do construtor visual — hoje, a IA de "Descrever relatório". Cada
// problema vira uma frase em português que dá pra mostrar na tela e também
// devolver pra IA corrigir na tentativa seguinte.

use std::collections::BTreeSet;

use super::campos::buscar_campo;
use super::definicao::{ConteudoBloco, FonteLinhas, Operador, ReportDefinition, TipoParametro};
use super::expressoes::ExpressaoNo;

#[tauri::command]
pub(crate) fn validar_definicao_relatorio(definicao: ReportDefinition) -> Vec<String> {
    validar_definicao(&definicao)
}

pub(crate) fn validar_definicao(definicao: &ReportDefinition) -> Vec<String> {
    let mut problemas = Vec::new();

    if definicao.nome.trim().is_empty() {
        problemas.push("O relatório precisa de um nome.".to_string());
    }
    if definicao.secoes.is_empty() {
        problemas.push("O relatório precisa de pelo menos uma tabela.".to_string());
    }

    let mut ids_parametro = BTreeSet::new();
    for parametro in &definicao.parametros {
        if parametro.id.trim().is_empty() {
            problemas.push(format!("O parâmetro \"{}\" está sem identificador.", parametro.rotulo));
        } else if !ids_parametro.insert(parametro.id.as_str()) {
            problemas.push(format!("O parâmetro \"{}\" está repetido.", parametro.id));
        }
    }

    for (indice, secao) in definicao.secoes.iter().enumerate() {
        let local = format!("Tabela {}", indice + 1);
        let fan_out = matches!(secao.fonte_linhas, FonteLinhas::PorAlunoEItem { .. });

        if secao.colunas.is_empty() {
            problemas.push(format!("{local}: a tabela precisa de pelo menos uma coluna."));
        }
        let mut ids_coluna = BTreeSet::new();
        let mut viu_oculta = false;
        for coluna in &secao.colunas {
            if coluna.id.trim().is_empty() {
                problemas.push(format!("{local}: a coluna \"{}\" está sem identificador.", coluna.rotulo));
            } else if !ids_coluna.insert(coluna.id.as_str()) {
                problemas.push(format!("{local}: a coluna \"{}\" está repetida.", coluna.id));
            }
            if coluna.oculta {
                viu_oculta = true;
            } else if viu_oculta {
                problemas.push(format!(
                    "{local}: a coluna \"{}\" aparece depois de uma coluna oculta; colunas ocultas precisam ficar no fim.",
                    coluna.rotulo
                ));
            }
            validar_expressao(&coluna.expressao, &format!("{local}, coluna \"{}\"", coluna.rotulo), &ids_parametro, fan_out, &mut problemas);
        }

        for condicao in &secao.filtros.condicoes {
            let onde = format!("{local}, condição");
            validar_expressao(&condicao.campo, &onde, &ids_parametro, fan_out, &mut problemas);
            let dispensa_valor = matches!(condicao.operador, Operador::Vazio | Operador::NaoVazio);
            match &condicao.valor {
                Some(valor) => validar_expressao(valor, &onde, &ids_parametro, fan_out, &mut problemas),
                None if !dispensa_valor => problemas.push(format!("{onde}: falta o valor de comparação.")),
                None => {}
            }
        }

        for ordem in &secao.ordenacao {
            if !ids_coluna.contains(ordem.coluna_id.as_str()) {
                problemas.push(format!("{local}: a ordenação usa a coluna \"{}\", que não existe na tabela.", ordem.coluna_id));
            }
        }

        if let Some(campo) = &secao.agrupamento.campo {
            validar_expressao(campo, &format!("{local}, agrupamento"), &ids_parametro, fan_out, &mut problemas);
        }
        if let Some(id) = &secao.agrupamento.limite_parametro {
            match definicao.parametros.iter().find(|parametro| &parametro.id == id) {
                None => problemas.push(format!("{local}: o limite de linhas usa o parâmetro \"{id}\", que não foi declarado.")),
                Some(parametro) if parametro.tipo != TipoParametro::Numero => {
                    problemas.push(format!("{local}: o limite de linhas precisa de um parâmetro numérico, e \"{id}\" é texto."))
                }
                Some(_) => {}
            }
        }
    }

    for bloco in &definicao.blocos {
        if let ConteudoBloco::Tabela { secao_index } = bloco.conteudo {
            if secao_index >= definicao.secoes.len() {
                problemas.push(format!("Um bloco de tabela aponta para a tabela {}, que não existe.", secao_index + 1));
            }
        }
    }

    problemas
}

fn validar_expressao(no: &ExpressaoNo, onde: &str, ids_parametro: &BTreeSet<&str>, fan_out: bool, problemas: &mut Vec<String>) {
    match no {
        ExpressaoNo::Campo { campo_id, parametro } => match buscar_campo(campo_id) {
            None => problemas.push(format!("{onde}: o campo \"{campo_id}\" não existe.")),
            Some(campo) => {
                let sem_parametro = parametro.as_deref().map_or(true, |valor| valor.trim().is_empty());
                // Numa linha de fan-out o campo herda o parâmetro do item
                // (ver expressoes::avaliar), então ali ele pode faltar.
                if campo.requer_parametro && sem_parametro && !fan_out {
                    problemas.push(format!("{onde}: o campo \"{}\" precisa dizer qual disciplina.", campo.rotulo));
                }
            }
        },
        ExpressaoNo::Parametro { id } => {
            if !ids_parametro.contains(id.as_str()) {
                problemas.push(format!("{onde}: usa o parâmetro \"{id}\", que não foi declarado."));
            }
        }
        ExpressaoNo::ItemAtual { .. } | ExpressaoNo::Literal { .. } => {}
        ExpressaoNo::Aritmetica { esquerda, direita, .. } | ExpressaoNo::Comparacao { esquerda, direita, .. } => {
            validar_expressao(esquerda, onde, ids_parametro, fan_out, problemas);
            validar_expressao(direita, onde, ids_parametro, fan_out, problemas);
        }
        ExpressaoNo::Logica { valores, .. } => {
            for valor in valores {
                validar_expressao(valor, onde, ids_parametro, fan_out, problemas);
            }
        }
        ExpressaoNo::Se { condicao, entao, senao } => {
            validar_expressao(condicao, onde, ids_parametro, fan_out, problemas);
            validar_expressao(entao, onde, ids_parametro, fan_out, problemas);
            validar_expressao(senao, onde, ids_parametro, fan_out, problemas);
        }
        ExpressaoNo::Funcao { argumentos, .. } => {
            for argumento in argumentos {
                validar_expressao(argumento, onde, ids_parametro, fan_out, problemas);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn definicao(valor: serde_json::Value) -> ReportDefinition {
        serde_json::from_value(valor).expect("definição de teste deveria desserializar")
    }

    fn base() -> serde_json::Value {
        json!({
            "id": "teste",
            "nome": "Abaixo da média em Matemática",
            "fonte": {},
            "secoes": [{
                "fonte_linhas": { "tipo": "por_aluno" },
                "filtros": {
                    "combinador": "e",
                    "condicoes": [{
                        "campo": { "tipo": "campo", "campo_id": "nota_disciplina_bimestre", "parametro": "Matemática" },
                        "operador": "menor",
                        "valor": { "tipo": "campo", "campo_id": "nota_minima_configurada" }
                    }]
                },
                "colunas": [
                    { "id": "nome", "rotulo": "Nome", "expressao": { "tipo": "campo", "campo_id": "aluno_nome" } },
                    { "id": "nota", "rotulo": "Nota", "expressao": { "tipo": "campo", "campo_id": "nota_disciplina_bimestre", "parametro": "Matemática" } }
                ],
                "ordenacao": [{ "coluna_id": "nota" }]
            }],
            "blocos": [{ "id": "b1", "tipo": "tabela", "secao_index": 0 }],
            "formato_saida": "docx"
        })
    }

    #[test]
    fn definicao_correta_nao_tem_problemas() {
        assert!(validar_definicao(&definicao(base())).is_empty());
    }

    /// O executor transforma id desconhecido em célula vazia sem avisar —
    /// é exatamente o erro que uma IA comete inventando nome de campo.
    #[test]
    fn campo_inexistente_vira_problema() {
        let mut valor = base();
        valor["secoes"][0]["colunas"][1]["expressao"]["campo_id"] = json!("nota_de_matematica");
        let problemas = validar_definicao(&definicao(valor));
        assert_eq!(problemas.len(), 1, "{problemas:?}");
        assert!(problemas[0].contains("nota_de_matematica"));
    }

    #[test]
    fn campo_parametrizado_sem_disciplina_vira_problema() {
        let mut valor = base();
        valor["secoes"][0]["colunas"][1]["expressao"]["parametro"] = json!(null);
        let problemas = validar_definicao(&definicao(valor));
        assert!(problemas.iter().any(|p| p.contains("qual disciplina")), "{problemas:?}");
    }

    #[test]
    fn ordenacao_e_bloco_apontando_para_o_nada_viram_problemas() {
        let mut valor = base();
        valor["secoes"][0]["ordenacao"][0]["coluna_id"] = json!("faltas");
        valor["blocos"][0]["secao_index"] = json!(3);
        let problemas = validar_definicao(&definicao(valor));
        assert_eq!(problemas.len(), 2, "{problemas:?}");
    }

    #[test]
    fn condicao_sem_valor_so_vale_para_vazio_e_nao_vazio() {
        let mut valor = base();
        valor["secoes"][0]["filtros"]["condicoes"][0]["valor"] = json!(null);
        assert_eq!(validar_definicao(&definicao(valor.clone())).len(), 1);
        valor["secoes"][0]["filtros"]["condicoes"][0]["operador"] = json!("vazio");
        assert!(validar_definicao(&definicao(valor)).is_empty());
    }

    #[test]
    fn coluna_oculta_no_meio_vira_problema() {
        let mut valor = base();
        valor["secoes"][0]["colunas"][0]["oculta"] = json!(true);
        let problemas = validar_definicao(&definicao(valor));
        assert!(problemas.iter().any(|p| p.contains("ocultas precisam ficar no fim")), "{problemas:?}");
    }

    #[test]
    fn parametro_nao_declarado_vira_problema() {
        let mut valor = base();
        valor["secoes"][0]["filtros"]["condicoes"][0]["valor"] = json!({ "tipo": "parametro", "id": "nota_corte" });
        valor["secoes"][0]["agrupamento"] = json!({ "limite_parametro": "quantidade" });
        let problemas = validar_definicao(&definicao(valor));
        assert_eq!(problemas.len(), 2, "{problemas:?}");
    }

    /// Os relatórios oficiais do repositório também passam — são o modelo do
    /// que um relatório montado no construtor deveria ser.
    #[test]
    fn relatorios_oficiais_do_repositorio_passam_na_validacao() {
        let pasta = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../relatorios_repositorio/oficiais");
        let mut lidos = 0;
        for entrada in std::fs::read_dir(&pasta).expect("pasta de relatórios oficiais") {
            let caminho = entrada.unwrap().path();
            if caminho.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let texto = std::fs::read_to_string(&caminho).unwrap();
            let definicao: ReportDefinition = serde_json::from_str(&texto).unwrap();
            let problemas = validar_definicao(&definicao);
            assert!(problemas.is_empty(), "{}: {problemas:?}", caminho.display());
            lidos += 1;
        }
        assert!(lidos > 0);
    }

    /// Os relatórios que vêm com o app passam limpos — garante que a
    /// validação não é mais rígida do que o motor realmente exige.
    #[test]
    fn relatorios_embutidos_passam_na_validacao() {
        for definicao in super::super::embutidos::definicoes_embutidas() {
            let problemas = validar_definicao(&definicao);
            assert!(problemas.is_empty(), "{}: {problemas:?}", definicao.id);
        }
    }
}
