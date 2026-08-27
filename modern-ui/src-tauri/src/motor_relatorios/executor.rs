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
        let blocos = agrupar_linhas(linhas, &secao.agrupamento, parametros);
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

    renderers::renderizar(definicao, &secoes_resultado, &bimestre, &caminho)?;

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
/// `limite_parametro` (id de um `DefinicaoParametro` numérico) vence
/// `limite_por_grupo` quando os dois estão presentes e o parâmetro resolve
/// pra um número — é o que torna um "Top N" configurável na hora de gerar
/// (ex.: Top 60 virar Top 20) em vez de fixo na definição.
fn limite_efetivo(agrupamento: &AgrupamentoRelatorio, parametros: &BTreeMap<String, ValorExpressao>) -> Option<usize> {
    agrupamento
        .limite_parametro
        .as_ref()
        .and_then(|id| parametros.get(id))
        .and_then(ValorExpressao::como_numero)
        .map(|numero| numero.max(0.0) as usize)
        .or(agrupamento.limite_por_grupo)
}

fn agrupar_linhas(
    linhas: Vec<LinhaRelatorio>,
    agrupamento: &AgrupamentoRelatorio,
    parametros: &BTreeMap<String, ValorExpressao>,
) -> Vec<(Option<String>, Vec<LinhaRelatorio>)> {
    let limite = limite_efetivo(agrupamento, parametros);

    if agrupamento.campo.is_none() {
        // Sem campo de agrupamento, as linhas caem todas num grupo
        // implícito só — mas o limite ainda vale aqui, senão não tem como
        // pedir um "Top N" sem inventar um campo de agrupamento artificial
        // só pra isso (era exatamente esse o bug: o limite era
        // silenciosamente ignorado quando não havia agrupamento).
        let mut linhas = linhas;
        if let Some(limite) = limite {
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
    use serde_json::json;

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

    /// Fixture em memória (sem tocar disco nem `data_dir()`) — turma NOITE
    /// com alunos ativos com média de bimestre e frequência calculáveis, pra
    /// exercitar "Top Alunos" sem depender de dados reais só existentes na
    /// máquina de quem escreveu o teste (era por isso que ele só passava
    /// localmente e falhava sempre no CI, ver plano de correção).
    fn turma_fixture(json: Value) -> TurmaArquivo {
        serde_json::from_value(json).expect("fixture de turma deveria desserializar")
    }

    fn turma_top_alunos_fixture() -> TurmaArquivo {
        turma_fixture(json!({
            "codigo": "3ª Série C",
            "ano": 2026,
            "serie": "3ª Série",
            "periodo": "NOITE",
            "ciclo": "EM",
            "alunos": {
                "1": {
                    "nome": "ALUNO UM", "ativo": true, "numero_chamada": 1,
                    "frequencia_percentual": 95.0,
                    "medias": { "1": { "MATEMATICA": 9.0, "PORTUGUES": 8.0 } }
                },
                "2": {
                    "nome": "ALUNO DOIS", "ativo": true, "numero_chamada": 2,
                    "frequencia_percentual": 90.0,
                    "medias": { "1": { "MATEMATICA": 7.0, "PORTUGUES": 7.5 } }
                },
                "3": {
                    "nome": "ALUNO TRES", "ativo": true, "numero_chamada": 3,
                    "frequencia_percentual": 88.0,
                    "medias": { "1": { "MATEMATICA": 6.0, "PORTUGUES": 6.5 } }
                }
            }
        }))
    }

    /// "Top Alunos" (ex-Top 60) agora aceita um parâmetro `quantidade_top`
    /// que sobrepõe o `limite_por_grupo` fixo da definição — prova que
    /// `limite_efetivo` realmente lê o parâmetro passado na hora de gerar,
    /// não só o valor gravado na definição.
    #[test]
    fn quantidade_top_por_parametro_sobrepoe_o_padrao() {
        let definicao = definicao_top60();
        let mut parametros = BTreeMap::new();
        parametros.insert("quantidade_top".to_string(), ValorExpressao::Numero(2.0));

        let turmas = vec![(PathBuf::from("fixture_top_alunos.json"), turma_top_alunos_fixture())];
        let (_, total_linhas, total_grupos, _) = montar_secoes(&definicao, &turmas, "1", 5.0, &parametros);

        assert_eq!(total_grupos, 1, "3 alunos noturnos deveriam cair num único grupo (período Noite)");
        assert_eq!(total_linhas, 2, "com quantidade_top=2 e 3 alunos com média, só os 2 melhores deveriam entrar");
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
            autor: None,
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
                    limite_parametro: None,
                    ordem_grupos: None,
                },
            }],
            blocos: Vec::new(),
            formato_saida: FormatoSaida::Docx,
        }
    }

    /// 25 alunos ativos com nota de Matemática distinta (pra cortar o top 20
    /// de verdade, não só passar por ter poucos alunos), mais um inativo e
    /// um sem nota de Matemática — os dois não deveriam entrar. Fixture em
    /// memória: mesma razão da `turma_top_alunos_fixture` acima.
    fn turma_top20_matematica_fixture() -> TurmaArquivo {
        let mut alunos = serde_json::Map::new();
        for i in 0..25 {
            alunos.insert(
                i.to_string(),
                json!({
                    "nome": format!("ALUNO {i:02}"),
                    "ativo": true,
                    "numero_chamada": i + 1,
                    "medias": { "1": { "MATEMATICA": 10.0 - (i as f64) * 0.3 } }
                }),
            );
        }
        alunos.insert(
            "inativo".to_string(),
            json!({ "nome": "ALUNO INATIVO", "ativo": false, "numero_chamada": 99, "medias": { "1": { "MATEMATICA": 10.0 } } }),
        );
        alunos.insert(
            "sem_nota".to_string(),
            json!({ "nome": "ALUNO SEM NOTA", "ativo": true, "numero_chamada": 100, "medias": { "1": { "PORTUGUES": 8.0 } } }),
        );
        turma_fixture(json!({
            "codigo": "1ª Série A",
            "ano": 2026,
            "serie": "1ª Série",
            "periodo": "NOITE",
            "ciclo": "EM",
            "alunos": Value::Object(alunos)
        }))
    }

    #[test]
    fn top20_matematica_em_noturno_roda_e_respeita_o_limite_sem_agrupamento() {
        let definicao = definicao_top20_matematica_em_noturno();
        let turmas = vec![(PathBuf::from("fixture_top20.json"), turma_top20_matematica_fixture())];
        let (secoes, total_linhas, total_grupos, _) = montar_secoes(&definicao, &turmas, "1", 5.0, &BTreeMap::new());

        assert_eq!(total_linhas, 20, "25 alunos ativos com nota deveriam ser cortados em exatamente 20 (o inativo e o sem nota ficam de fora)");
        assert_eq!(total_grupos, 1, "sem campo de agrupamento, tudo cai num bloco só");

        let (_, linhas) = &secoes[0].blocos[0];
        let notas: Vec<f64> = linhas
            .iter()
            .filter_map(|linha| linha.valores.iter().find(|(id, _)| id.as_str() == "nota"))
            .filter_map(|(_, valor)| valor.como_numero())
            .collect();
        assert_eq!(notas.len(), 20);
        let mut notas_ordenadas = notas.clone();
        notas_ordenadas.sort_by(|a, b| b.partial_cmp(a).unwrap());
        assert_eq!(notas, notas_ordenadas, "as linhas deveriam vir ordenadas por nota decrescente");
    }

    /// Réplica do que o construtor visual produziria pro relatório de
    /// "Estacionados na Expansão" (ver plano da feature): filtro composto
    /// (NãoVazio + MenorIgual + MaiorIgual) sobre os novos campos, ordenado
    /// decrescente. Prova que os `campo_id` de expansão existem em
    /// `buscar_campo` (um id digitado errado cairia silenciosamente em
    /// Nulo, não erro) e que o pipeline inteiro — filtro, ordenação,
    /// prévia — roda sem panicar mesmo sem nenhum aluno do fixture ter
    /// dado de expansão (0 linhas é esperado aqui; o teste não afirma
    /// contagem, só ausência de erro).
    #[test]
    fn relatorio_de_estacionados_na_expansao_roda_de_ponta_a_ponta() {
        let definicao = ReportDefinition {
            id: "estacionados_expansao".to_string(),
            nome: "Estacionados na Expansão".to_string(),
            descricao: "Alunos do noturno sem avanço recente nas disciplinas de expansão.".to_string(),
            autor: None,
            embutido: false,
            fonte: FiltroTurmas { periodos: vec!["NOITE".to_string()], ..Default::default() },
            parametros: vec![],
            secoes: vec![SecaoRelatorio {
                titulo: None,
                fonte_linhas: FonteLinhas::PorAluno,
                filtros: GrupoFiltros {
                    combinador: Combinador::E,
                    condicoes: vec![
                        FiltroCondicao { campo: campo("expansao_progresso_atual"), operador: Operador::NaoVazio, valor: None },
                        FiltroCondicao {
                            campo: campo("expansao_progresso_delta_recente"),
                            operador: Operador::MenorIgual,
                            valor: Some(ExpressaoNo::Literal { valor: ValorExpressao::Numero(2.0) }),
                        },
                        FiltroCondicao {
                            campo: campo("expansao_dias_sem_acesso"),
                            operador: Operador::MaiorIgual,
                            valor: Some(ExpressaoNo::Literal { valor: ValorExpressao::Numero(7.0) }),
                        },
                    ],
                },
                colunas: vec![
                    ColunaRelatorio {
                        id: "nome".to_string(),
                        rotulo: "Aluno".to_string(),
                        expressao: campo("aluno_nome"),
                        largura: None,
                        alinhamento: Alinhamento::Esquerda,
                    },
                    ColunaRelatorio {
                        id: "dias".to_string(),
                        rotulo: "Dias sem Acesso".to_string(),
                        expressao: campo("expansao_dias_sem_acesso"),
                        largura: None,
                        alinhamento: Alinhamento::Centro,
                    },
                ],
                ordenacao: vec![OrdenacaoRelatorio { coluna_id: "dias".to_string(), decrescente: true }],
                agrupamento: AgrupamentoRelatorio { campo: None, limite_por_grupo: None, limite_parametro: None, ordem_grupos: None },
            }],
            blocos: Vec::new(),
            formato_saida: FormatoSaida::Docx,
        };

        let preview = pre_visualizar_relatorio(&definicao, "1", &BTreeMap::new(), 50)
            .expect("relatório com campos de expansão deveria rodar sem erro mesmo sem dado real no fixture");
        assert!(!preview.is_empty(), "deveria ter ao menos uma seção montada");

        let resultado = executar_relatorio(&definicao, "1", &BTreeMap::new())
            .expect("gerar o docx também deveria rodar sem erro");
        let _ = std::fs::remove_file(&resultado.caminho);
    }

    /// Mesma consulta do teste acima, mas com `blocos` preenchido (o que o
    /// construtor de blocos novo produz) e passando por cabeçalho, texto,
    /// tabela, quebra de página, assinaturas e parâmetros — prova que o
    /// caminho novo dos 4 renderers roda de ponta a ponta sem entrar em
    /// pânico e sem sair vazio, não só o caminho antigo (direto em `secoes`)
    /// que os outros testes já cobrem.
    fn definicao_com_blocos(formato: FormatoSaida) -> ReportDefinition {
        use super::super::definicao::{BlocoRelatorio, ConteudoBloco};

        let mut definicao = definicao_top20_matematica_em_noturno();
        definicao.formato_saida = formato;
        definicao.blocos = vec![
            BlocoRelatorio { id: "blk_1".to_string(), ativo: true, conteudo: ConteudoBloco::Cabecalho },
            BlocoRelatorio {
                id: "blk_2".to_string(),
                ativo: true,
                conteudo: ConteudoBloco::Texto {
                    titulo: Some("Apresentação".to_string()),
                    corpo: "Lista referente ao {bimestre}.".to_string(),
                    tamanho_titulo: 14,
                    tamanho_corpo: 11,
                },
            },
            BlocoRelatorio { id: "blk_3".to_string(), ativo: true, conteudo: ConteudoBloco::Tabela { secao_index: 0 } },
            BlocoRelatorio { id: "blk_4".to_string(), ativo: true, conteudo: ConteudoBloco::QuebraPagina },
            BlocoRelatorio { id: "blk_4b".to_string(), ativo: true, conteudo: ConteudoBloco::Espacador { linhas: 2 } },
            BlocoRelatorio {
                id: "blk_5".to_string(),
                ativo: true,
                conteudo: ConteudoBloco::Assinaturas { nomes: vec!["Direção".to_string(), "Coordenação".to_string()] },
            },
            BlocoRelatorio { id: "blk_6".to_string(), ativo: true, conteudo: ConteudoBloco::Parametros },
            // Bloco desligado: não deve aparecer no arquivo final nem quebrar nada.
            BlocoRelatorio {
                id: "blk_7".to_string(),
                ativo: false,
                conteudo: ConteudoBloco::Texto {
                    titulo: None,
                    corpo: "Não deveria aparecer.".to_string(),
                    tamanho_titulo: 14,
                    tamanho_corpo: 11,
                },
            },
        ];
        definicao
    }

    #[test]
    fn relatorio_com_blocos_gera_arquivo_nao_vazio_nos_4_formatos() {
        for formato in [FormatoSaida::Docx, FormatoSaida::Xlsx, FormatoSaida::Csv, FormatoSaida::Pdf] {
            let definicao = definicao_com_blocos(formato.clone());
            let resultado = executar_relatorio(&definicao, "2", &BTreeMap::new())
                .unwrap_or_else(|erro| panic!("formato {formato:?} deveria gerar o relatório sem erro: {erro}"));
            let tamanho = fs::metadata(&resultado.caminho)
                .unwrap_or_else(|erro| panic!("formato {formato:?}: arquivo gerado deveria existir ({erro})"))
                .len();
            assert!(tamanho > 0, "formato {formato:?}: arquivo gerado não deveria ficar vazio");
            let _ = fs::remove_file(&resultado.caminho);
        }
    }

    /// Configura uma imagem de cabeçalho de teste no lugar em que
    /// `localizar_imagem_cabecalho` (docx.rs) procura, gera XLSX e PDF com o
    /// bloco Cabeçalho ativo e confere que a imagem realmente foi embutida —
    /// no XLSX, checando o zip por um arquivo em `xl/media/`; no PDF,
    /// comparando o tamanho do arquivo com/sem a imagem configurada (uma
    /// imagem de verdade embutida deveria pesar bem mais do que sem ela).
    /// Sempre restaura o estado anterior da pasta de imagens, mesmo se um
    /// assert falhar no meio.
    #[test]
    fn cabecalho_com_imagem_institucional_aparece_no_xlsx_e_no_pdf() {
        let pasta_imagens = data_dir().expect("data_dir deveria resolver em teste").join("imagens");
        fs::create_dir_all(&pasta_imagens).expect("deveria conseguir criar a pasta de imagens");
        let caminho_imagem = pasta_imagens.join("cabecalho_ata.png");
        let backup = fs::read(&caminho_imagem).ok();

        let mut png_bytes = Vec::new();
        image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(40, 10, image::Rgb([200, 30, 30])))
            .write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageOutputFormat::Png)
            .expect("deveria conseguir codificar o PNG de teste");
        fs::write(&caminho_imagem, &png_bytes).expect("deveria conseguir escrever a imagem de teste");

        // Usa um bimestre incomum (não usado pelos outros testes) e lê/apaga
        // cada arquivo logo depois de gerar, antes do próximo — o nome do
        // arquivo só tem precisão de segundo (`id_bimN_AAAAMMDD_HHMMSS`), e
        // duas gerações da mesma definição no mesmo segundo colidiriam no
        // mesmo caminho, fazendo uma sobrescrever a outra antes da leitura.
        let resultado_xlsx = executar_relatorio(&definicao_com_blocos(FormatoSaida::Xlsx), "9", &BTreeMap::new());
        let tamanho_xlsx = resultado_xlsx.as_ref().ok().map(|r| (r.caminho.clone(), fs::read(&r.caminho)));
        if let Ok(r) = &resultado_xlsx {
            let _ = fs::remove_file(&r.caminho);
        }

        let resultado_pdf_com_imagem = executar_relatorio(&definicao_com_blocos(FormatoSaida::Pdf), "9", &BTreeMap::new());
        let bytes_pdf_com_imagem = resultado_pdf_com_imagem.as_ref().ok().and_then(|r| fs::read(&r.caminho).ok());
        if let Ok(r) = &resultado_pdf_com_imagem {
            let _ = fs::remove_file(&r.caminho);
        }

        // Restaura a pasta de imagens ANTES de qualquer assert, pra nunca
        // deixar a imagem de teste pra trás mesmo se algo falhar abaixo —
        // restaura o backup se havia uma imagem antes, ou apaga a de teste
        // se a pasta estava vazia.
        match &backup {
            Some(bytes) => {
                fs::write(&caminho_imagem, bytes).ok();
            }
            None => {
                fs::remove_file(&caminho_imagem).ok();
            }
        }

        let (_, bytes_xlsx) = tamanho_xlsx.expect("xlsx com cabeçalho deveria gerar sem erro");
        let bytes_xlsx = bytes_xlsx.expect("deveria conseguir ler o xlsx gerado antes de apagar");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes_xlsx)).expect("xlsx gerado deveria ser um zip válido");
        let tem_media = (0..zip.len()).any(|i| zip.by_index(i).map(|arq| arq.name().starts_with("xl/media/")).unwrap_or(false));
        assert!(tem_media, "xlsx com bloco Cabeçalho ativo e imagem configurada deveria ter a imagem em xl/media/");

        // Compara tamanho de arquivo é frágil aqui (o peso do PDF é dominado
        // pela fonte do sistema embutida, que pode variar de execução pra
        // execução) — em vez disso, procura no PDF bruto a marca de um
        // XObject de imagem, que só aparece quando há mesmo uma imagem
        // embutida no documento. Não testamos o caminho "sem imagem" aqui:
        // `localizar_imagem_cabecalho` tem vários locais de fallback (ver
        // docx.rs) além do que este teste configura, então "sem imagem
        // nenhuma" não é um estado que dá pra garantir isoladamente num
        // ambiente de teste que pode ter uma imagem real configurada em
        // outro desses locais.
        let bytes_pdf_com_imagem = bytes_pdf_com_imagem.expect("pdf com imagem deveria ter sido gerado e lido");
        let tem_marca_de_imagem = bytes_pdf_com_imagem.windows(b"/Image".len()).any(|janela| janela == b"/Image");
        assert!(
            tem_marca_de_imagem,
            "pdf com bloco Cabeçalho ativo e imagem configurada deveria ter um XObject /Image embutido"
        );
    }
}
