// Executor genérico: dado qualquer ReportDefinition, produz as linhas de
// cada seção (turma × [aluno | item de fan-out | disciplina agregada] →
// colunas resolvidas) e entrega pro renderer do formato de saída escolhido.
// Isso substitui o esqueleto que cada relatório antigo repetia na mão
// (travar dados → carregar turmas → filtrar/agregar → montar caminho →
// escrever arquivo).

use chrono::Local;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use crate::*;

use super::campos::ContextoLinha;
use super::colecoes;
use super::definicao::{
    AgrupamentoRelatorio, Combinador, ColunaRelatorio, FiltroTurmas, FonteLinhas, FormatoSaida, GrupoFiltros,
    OrdenacaoRelatorio, ReportDefinition, SecaoRelatorio,
};
use super::expressoes::{avaliar, avaliar_condicao, ValorExpressao};
use super::renderers;

pub(crate) struct LinhaRelatorio {
    pub(crate) valores: Vec<(String, ValorExpressao)>,
    pub(crate) grupo: Option<String>,
}

/// Uma tabela já resolvida (ordenada, agrupada) pronta pro renderer — o
/// resultado de executar uma `SecaoRelatorio` contra os dados reais.
pub(crate) struct SecaoResultado<'a> {
    pub(crate) titulo: Option<String>,
    pub(crate) colunas: &'a [ColunaRelatorio],
    pub(crate) blocos: Vec<(Option<String>, Vec<LinhaRelatorio>)>,
}

#[derive(Serialize)]
pub(crate) struct RelatorioGenericoResultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) linhas: usize,
    pub(crate) grupos: usize,
    /// Quantas linhas cada seção produziu, na ordem de `definicao.secoes` —
    /// a UI não usa isso hoje (só soma `linhas`/`grupos`), mas os testes de
    /// paridade de relatórios com mais de uma seção (Elegíveis Recuperação)
    /// precisam comparar seção por seção, não só o total.
    pub(crate) linhas_por_secao: Vec<usize>,
}

/// Mescla os parâmetros enviados pela UI com `valor_padrao` de cada
/// `DefinicaoParametro` da ReportDefinition — o que a UI não mandou (ou nem
/// sabia que existia, se a definição for antiga) cai no padrão declarado.
fn resolver_parametros(definicao: &ReportDefinition, entrada: &BTreeMap<String, ValorExpressao>) -> BTreeMap<String, ValorExpressao> {
    let mut parametros: BTreeMap<String, ValorExpressao> =
        definicao.parametros.iter().map(|param| (param.id.clone(), param.valor_padrao.clone())).collect();
    for (chave, valor) in entrada {
        parametros.insert(chave.clone(), valor.clone());
    }
    parametros
}

/// Monta as seções resolvidas (linhas geradas, ordenadas, agrupadas) contra
/// os dados reais — o meio-de-campo compartilhado entre `executar_relatorio`
/// (que ainda grava o arquivo) e `pre_visualizar_relatorio` (que só devolve
/// uma amostra pra tela, sem tocar em disco).
fn montar_secoes<'a>(
    definicao: &'a ReportDefinition,
    turmas: &[(PathBuf, TurmaArquivo)],
    bimestre: &str,
    nota_minima: f64,
    parametros: &BTreeMap<String, ValorExpressao>,
) -> (Vec<SecaoResultado<'a>>, usize, usize, Vec<usize>) {
    let mut secoes_resultado = Vec::new();
    let mut total_linhas = 0usize;
    let mut total_grupos = 0usize;
    let mut linhas_por_secao = Vec::new();

    for secao in &definicao.secoes {
        let mut linhas = gerar_linhas_secao(secao, turmas, &definicao.fonte, bimestre, nota_minima, parametros);
        ordenar_linhas(&mut linhas, &secao.ordenacao);
        let blocos = agrupar_linhas(linhas, &secao.agrupamento);
        let linhas_secao: usize = blocos.iter().map(|(_, linhas)| linhas.len()).sum();
        total_linhas += linhas_secao;
        total_grupos += blocos.len();
        linhas_por_secao.push(linhas_secao);
        secoes_resultado.push(SecaoResultado {
            titulo: secao.titulo.clone(),
            colunas: &secao.colunas,
            blocos,
        });
    }

    (secoes_resultado, total_linhas, total_grupos, linhas_por_secao)
}

pub(crate) fn executar_relatorio(
    definicao: &ReportDefinition,
    bimestre: &str,
    parametros_entrada: &BTreeMap<String, ValorExpressao>,
) -> Result<RelatorioGenericoResultado, String> {
    let _dados = travar_dados();
    let bimestre = normalizar_bimestre(bimestre);
    let nota_minima = obter_nota_minima_configurada();
    let turmas = carregar_turmas_com_caminho()?;
    let parametros = resolver_parametros(definicao, parametros_entrada);

    let (secoes_resultado, total_linhas, total_grupos, linhas_por_secao) =
        montar_secoes(definicao, &turmas, &bimestre, nota_minima, &parametros);

    let pasta = pasta_saida_relatorio(&definicao.id)?;
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let caminho = pasta.join(nome_arquivo_relatorio(definicao, &bimestre));

    renderers::renderizar(definicao, &secoes_resultado, &caminho)?;

    Ok(RelatorioGenericoResultado {
        caminho: caminho.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        linhas: total_linhas,
        grupos: total_grupos,
        linhas_por_secao,
    })
}

#[derive(Serialize)]
pub(crate) struct ColunaPreview {
    pub(crate) id: String,
    pub(crate) rotulo: String,
}

#[derive(Serialize)]
pub(crate) struct SecaoPreview {
    pub(crate) titulo: Option<String>,
    pub(crate) colunas: Vec<ColunaPreview>,
    pub(crate) linhas: Vec<Vec<String>>,
    /// Quantas linhas a seção tem no total — pode ser maior que
    /// `linhas.len()` quando o resultado real foi cortado pelo `limite`.
    pub(crate) total_linhas: usize,
}

/// Roda a definição contra os dados reais sem gravar nada em disco — pro
/// painel de pré-visualização do construtor visual. Corta cada seção em até
/// `limite` linhas (preservando o agrupamento/ordenação já aplicados) e
/// devolve uma tabela de texto simples, independente do `formato_saida`
/// escolhido (a prévia é sempre HTML na tela).
pub(crate) fn pre_visualizar_relatorio(
    definicao: &ReportDefinition,
    bimestre: &str,
    parametros_entrada: &BTreeMap<String, ValorExpressao>,
    limite: usize,
) -> Result<Vec<SecaoPreview>, String> {
    let _dados = travar_dados();
    let bimestre = normalizar_bimestre(bimestre);
    let nota_minima = obter_nota_minima_configurada();
    let turmas = carregar_turmas_com_caminho()?;
    let parametros = resolver_parametros(definicao, parametros_entrada);

    let (secoes_resultado, .., linhas_por_secao) = montar_secoes(definicao, &turmas, &bimestre, nota_minima, &parametros);

    Ok(secoes_resultado
        .into_iter()
        .zip(linhas_por_secao)
        .map(|(secao, total_linhas)| {
            let colunas: Vec<ColunaPreview> = secao
                .colunas
                .iter()
                .map(|coluna| ColunaPreview {
                    id: coluna.id.clone(),
                    rotulo: coluna.rotulo.clone(),
                })
                .collect();

            let mut linhas_preview: Vec<Vec<String>> = Vec::new();
            'blocos: for (_, linhas) in &secao.blocos {
                for linha in linhas {
                    if linhas_preview.len() >= limite {
                        break 'blocos;
                    }
                    linhas_preview.push(
                        secao
                            .colunas
                            .iter()
                            .map(|coluna| {
                                linha
                                    .valores
                                    .iter()
                                    .find(|(id, _)| id == &coluna.id)
                                    .map(|(_, valor)| valor.como_texto())
                                    .unwrap_or_default()
                            })
                            .collect(),
                    );
                }
            }

            SecaoPreview {
                titulo: secao.titulo,
                colunas,
                linhas: linhas_preview,
                total_linhas,
            }
        })
        .collect())
}

/// Gera as linhas cruas de uma seção, turma por turma, ramificando pela
/// `fonte_linhas`: um aluno por linha (padrão), um aluno×item de uma
/// coleção nomeada (fan-out), ou uma linha agregada por turma×disciplina
/// esperada pela carga horária (varre todos os alunos pra contar, não
/// representa um aluno específico).
fn gerar_linhas_secao(
    secao: &SecaoRelatorio,
    turmas: &[(PathBuf, TurmaArquivo)],
    fonte: &FiltroTurmas,
    bimestre: &str,
    nota_minima: f64,
    parametros: &BTreeMap<String, ValorExpressao>,
) -> Vec<LinhaRelatorio> {
    let mut linhas = Vec::new();

    for (_, turma) in turmas {
        if !turma_passa_fonte(turma, fonte) {
            continue;
        }

        match &secao.fonte_linhas {
            FonteLinhas::PorAluno => {
                let Some(alunos) = &turma.alunos else { continue };
                for (matricula, aluno) in alunos {
                    if !aluno.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                        continue;
                    }
                    let contexto = ContextoLinha {
                        turma,
                        matricula: Some(matricula),
                        aluno: Some(aluno),
                        bimestre,
                        nota_minima,
                        disciplina_contexto: None,
                        item: None,
                        parametros,
                    };
                    processar_linha(secao, &contexto, &mut linhas);
                }
            }
            FonteLinhas::PorAlunoEItem { colecao } => {
                let Some(alunos) = &turma.alunos else { continue };
                for (matricula, aluno) in alunos {
                    if !aluno.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                        continue;
                    }
                    for item in colecoes::gerar_colecao(colecao, turma, aluno, bimestre, parametros) {
                        let contexto = ContextoLinha {
                            turma,
                            matricula: Some(matricula),
                            aluno: Some(aluno),
                            bimestre,
                            nota_minima,
                            disciplina_contexto: None,
                            item: Some(&item),
                            parametros,
                        };
                        processar_linha(secao, &contexto, &mut linhas);
                    }
                }
            }
            FonteLinhas::PorTurmaDisciplina => {
                let carga_horaria = turma.carga_horaria.clone().unwrap_or_default();
                for bimestre_carga in ["1", "2", "3", "4"] {
                    let Some(disciplinas) = carga_horaria.get(bimestre_carga).and_then(Value::as_object) else {
                        continue;
                    };
                    for disciplina in disciplinas.keys() {
                        let contexto = ContextoLinha {
                            turma,
                            matricula: None,
                            aluno: None,
                            bimestre: bimestre_carga,
                            nota_minima,
                            disciplina_contexto: Some(disciplina),
                            item: None,
                            parametros,
                        };
                        processar_linha(secao, &contexto, &mut linhas);
                    }
                }
            }
        }
    }

    linhas
}

fn processar_linha(secao: &SecaoRelatorio, contexto: &ContextoLinha, linhas: &mut Vec<LinhaRelatorio>) {
    if !passa_filtros(&secao.filtros, contexto) {
        return;
    }
    let valores = secao
        .colunas
        .iter()
        .map(|coluna| (coluna.id.clone(), avaliar(&coluna.expressao, contexto)))
        .collect::<Vec<_>>();
    let grupo = secao
        .agrupamento
        .campo
        .as_ref()
        .map(|expressao| avaliar(expressao, contexto).como_texto());
    linhas.push(LinhaRelatorio { valores, grupo });
}

fn turma_passa_fonte(turma: &TurmaArquivo, fonte: &FiltroTurmas) -> bool {
    if !fonte.codigos.is_empty() && !fonte.codigos.contains(&turma.codigo) {
        return false;
    }
    if !fonte.series.is_empty() {
        let Some(serie) = &turma.serie else { return false };
        if !fonte.series.contains(serie) {
            return false;
        }
    }
    if !fonte.periodos.is_empty() {
        let Some(periodo) = &turma.periodo else { return false };
        if !fonte.periodos.contains(periodo) {
            return false;
        }
    }
    if !fonte.ciclos.is_empty() {
        let Some(ciclo) = &turma.ciclo else { return false };
        if !fonte.ciclos.contains(ciclo) {
            return false;
        }
    }
    true
}

fn passa_filtros(filtros: &GrupoFiltros, contexto: &ContextoLinha) -> bool {
    if filtros.condicoes.is_empty() {
        return true;
    }
    match filtros.combinador {
        Combinador::E => filtros.condicoes.iter().all(|condicao| avaliar_condicao(condicao, contexto)),
        Combinador::Ou => filtros.condicoes.iter().any(|condicao| avaliar_condicao(condicao, contexto)),
    }
}

fn ordenar_linhas(linhas: &mut [LinhaRelatorio], ordenacao: &[OrdenacaoRelatorio]) {
    linhas.sort_by(|a, b| {
        for ordem in ordenacao {
            let va = a.valores.iter().find(|(id, _)| *id == ordem.coluna_id).map(|(_, v)| v);
            let vb = b.valores.iter().find(|(id, _)| *id == ordem.coluna_id).map(|(_, v)| v);
            let mut cmp = comparar_valores(va, vb);
            if ordem.decrescente {
                cmp = cmp.reverse();
            }
            if cmp != std::cmp::Ordering::Equal {
                return cmp;
            }
        }
        std::cmp::Ordering::Equal
    });
}

fn comparar_valores(a: Option<&ValorExpressao>, b: Option<&ValorExpressao>) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    match (a.and_then(ValorExpressao::como_numero), b.and_then(ValorExpressao::como_numero)) {
        (Some(na), Some(nb)) => na.partial_cmp(&nb).unwrap_or(Ordering::Equal),
        _ => {
            let ta = a.map(ValorExpressao::como_texto).unwrap_or_default();
            let tb = b.map(ValorExpressao::como_texto).unwrap_or_default();
            ta.cmp(&tb)
        }
    }
}

/// Agrupa as linhas (já ordenadas) pelo campo de agrupamento, na ordem
/// explícita de `ordem_grupos` quando houver (ex.: Manhã/Tarde/Noite), senão
/// alfabética. Sem agrupamento configurado, devolve um único bloco sem
/// rótulo. `limite_por_grupo` corta cada bloco depois de montado — como as
/// linhas já vieram ordenadas por `ordenacao`, isso é o "Top N por grupo".
fn agrupar_linhas(
    linhas: Vec<LinhaRelatorio>,
    agrupamento: &AgrupamentoRelatorio,
) -> Vec<(Option<String>, Vec<LinhaRelatorio>)> {
    if agrupamento.campo.is_none() {
        // Sem campo de agrupamento, as linhas caem todas num grupo
        // implícito só — mas `limite_por_grupo` ainda vale aqui, senão não
        // tem como pedir um "Top N" sem inventar um campo de agrupamento
        // artificial só pra isso (era exatamente esse o bug: o limite era
        // silenciosamente ignorado quando não havia agrupamento).
        let mut linhas = linhas;
        if let Some(limite) = agrupamento.limite_por_grupo {
            linhas.truncate(limite);
        }
        return vec![(None, linhas)];
    }

    let mut mapa: BTreeMap<String, Vec<LinhaRelatorio>> = BTreeMap::new();
    for linha in linhas {
        let chave = linha.grupo.clone().unwrap_or_default();
        mapa.entry(chave).or_default().push(linha);
    }

    let ordem_final: Vec<String> = match &agrupamento.ordem_grupos {
        Some(ordem) => ordem.clone(),
        None => mapa.keys().cloned().collect(),
    };

    let limite = agrupamento.limite_por_grupo;
    ordem_final
        .into_iter()
        .filter_map(|chave| {
            let mut lista = mapa.remove(&chave)?;
            if let Some(limite) = limite {
                lista.truncate(limite);
            }
            Some((Some(chave), lista))
        })
        .collect()
}

fn pasta_saida_relatorio(id: &str) -> Result<PathBuf, String> {
    Ok(data_dir().map_err(|err| err.to_string())?.join("relatorios").join(id))
}

fn nome_arquivo_relatorio(definicao: &ReportDefinition, bimestre: &str) -> String {
    let extensao = match definicao.formato_saida {
        FormatoSaida::Docx => "docx",
        FormatoSaida::Xlsx => "xlsx",
        FormatoSaida::Csv => "csv",
        FormatoSaida::Pdf => "pdf",
    };
    let id_arquivo: String = definicao
        .id
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    format!(
        "{}_bim{}_{}.{}",
        id_arquivo,
        bimestre,
        Local::now().format("%Y%m%d_%H%M%S"),
        extensao
    )
}

#[cfg(test)]
mod testes {
    use super::*;
    use super::super::definicao::{Alinhamento, FiltroCondicao, Operador};
    use super::super::embutidos::definicao_top60;
    use super::super::expressoes::ExpressaoNo;

    #[test]
    fn pre_visualizar_nao_grava_arquivo_e_respeita_limite() {
        let definicao = definicao_top60();
        let secoes =
            pre_visualizar_relatorio(&definicao, "1", &BTreeMap::new(), 3).expect("pré-visualização deveria rodar sem erro");

        assert!(!secoes.is_empty(), "top 60 deveria ter pelo menos uma seção");
        let secao = &secoes[0];
        assert!(!secao.colunas.is_empty(), "colunas da seção deveriam vir preenchidas");
        assert!(secao.linhas.len() <= 3, "a prévia não deveria trazer mais que o limite pedido");
        if secao.total_linhas > 0 {
            assert!(!secao.linhas.is_empty(), "havendo dados reais, a prévia não deveria vir vazia");
        }
    }

    fn campo(id: &str) -> ExpressaoNo {
        ExpressaoNo::Campo {
            campo_id: id.to_string(),
            parametro: None,
        }
    }

    fn campo_param(id: &str, parametro: &str) -> ExpressaoNo {
        ExpressaoNo::Campo {
            campo_id: id.to_string(),
            parametro: Some(parametro.to_string()),
        }
    }

    /// Réplica exata do que o construtor visual produziria pro pedido "top
    /// 20 alunos com melhor nota de Matemática, EM noturno" — usada tanto
    /// pra provar que o motor consegue expressar isso quanto pra pegar
    /// lacunas reais no registro de campos/executor (foi assim que achei os
    /// dois bugs corrigidos junto com este teste: faltava o campo de nota
    /// por disciplina, e `limite_por_grupo` sem `campo` de agrupamento era
    /// ignorado).
    fn definicao_top20_matematica_em_noturno() -> ReportDefinition {
        ReportDefinition {
            id: "top20_matematica_em_noturno".to_string(),
            nome: "Top 20 — Matemática (EM Noturno)".to_string(),
            descricao: "Os 20 alunos com melhor nota em Matemática, turmas de Ensino Médio no período noturno.".to_string(),
            embutido: false,
            fonte: FiltroTurmas {
                periodos: vec!["NOITE".to_string()],
                ciclos: vec!["EM".to_string()],
                ..Default::default()
            },
            parametros: vec![],
            secoes: vec![SecaoRelatorio {
                titulo: None,
                fonte_linhas: FonteLinhas::PorAluno,
                filtros: GrupoFiltros {
                    combinador: Combinador::E,
                    condicoes: vec![FiltroCondicao {
                        campo: campo_param("nota_disciplina_bimestre", "MATEMATICA"),
                        operador: Operador::NaoVazio,
                        valor: None,
                    }],
                },
                colunas: vec![
                    ColunaRelatorio {
                        id: "numero".to_string(),
                        rotulo: "Nº".to_string(),
                        expressao: campo("aluno_numero_chamada"),
                        largura: None,
                        alinhamento: Alinhamento::Centro,
                    },
                    ColunaRelatorio {
                        id: "nome".to_string(),
                        rotulo: "Aluno".to_string(),
                        expressao: campo("aluno_nome"),
                        largura: None,
                        alinhamento: Alinhamento::Esquerda,
                    },
                    ColunaRelatorio {
                        id: "turma".to_string(),
                        rotulo: "Turma".to_string(),
                        expressao: campo("turma_rotulo"),
                        largura: None,
                        alinhamento: Alinhamento::Centro,
                    },
                    ColunaRelatorio {
                        id: "nota".to_string(),
                        rotulo: "Nota em Matemática".to_string(),
                        expressao: campo_param("nota_disciplina_bimestre", "MATEMATICA"),
                        largura: None,
                        alinhamento: Alinhamento::Centro,
                    },
                ],
                ordenacao: vec![OrdenacaoRelatorio {
                    coluna_id: "nota".to_string(),
                    decrescente: true,
                }],
                agrupamento: AgrupamentoRelatorio {
                    campo: None,
                    limite_por_grupo: Some(20),
                    ordem_grupos: None,
                },
            }],
            formato_saida: FormatoSaida::Docx,
        }
    }

    #[test]
    fn top20_matematica_em_noturno_roda_e_respeita_o_limite_sem_agrupamento() {
        let definicao = definicao_top20_matematica_em_noturno();
        let resultado =
            executar_relatorio(&definicao, "1", &BTreeMap::new()).expect("o relatório montado pelo construtor deveria rodar sem erro");

        assert!(resultado.linhas <= 20, "não deveria trazer mais que 20 alunos mesmo sem campo de agrupamento");
        assert!(resultado.linhas > 0, "teste precisa de dados reais no fixture — 0 alunos não prova nada (1a SERIE A é EM/NOITE e tem MATEMATICA lançada no bimestre 1)");
        assert_eq!(resultado.grupos, 1, "sem campo de agrupamento, tudo cai num bloco só");

        // Confere que realmente veio ordenado por nota decrescente, olhando
        // a prévia (que expõe as células como texto já formatado).
        let preview = pre_visualizar_relatorio(&definicao, "1", &BTreeMap::new(), 20).expect("prévia deveria rodar sem erro");
        let notas: Vec<f64> = preview[0]
            .linhas
            .iter()
            .filter_map(|linha| linha.last().and_then(|texto| texto.parse::<f64>().ok()))
            .collect();
        let mut notas_ordenadas = notas.clone();
        notas_ordenadas.sort_by(|a, b| b.partial_cmp(a).unwrap());
        assert_eq!(notas, notas_ordenadas, "as linhas da prévia deveriam vir ordenadas por nota decrescente");
    }
}
