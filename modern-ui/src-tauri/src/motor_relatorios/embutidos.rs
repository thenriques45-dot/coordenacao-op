// Relatórios embutidos: os relatórios de hoje (Top 60, Educação Física, ...)
// reescritos como ReportDefinition sobre o motor genérico — a prova de que o
// motor cobre casos reais antes de investir no construtor visual. Não podem
// ser apagados pelo usuário (embutido: true), só duplicados para customizar.

use super::definicao::{
    AgrupamentoRelatorio, Alinhamento, Combinador, ColunaRelatorio, DefinicaoParametro, FiltroCondicao, FiltroTurmas,
    FonteLinhas, FormatoSaida, GrupoFiltros, Operador, OrdenacaoRelatorio, ReportDefinition, SecaoRelatorio,
    TipoParametro,
};
use super::expressoes::{ExpressaoNo, FuncaoExpressao, OperadorComparacao, OperadorLogico, ValorExpressao};

fn campo(id: &str) -> ExpressaoNo {
    ExpressaoNo::Campo {
        campo_id: id.to_string(),
        parametro: None,
    }
}

fn item_atual(chave: &str) -> ExpressaoNo {
    ExpressaoNo::ItemAtual { chave: chave.to_string() }
}

fn parametro(id: &str) -> ExpressaoNo {
    ExpressaoNo::Parametro { id: id.to_string() }
}

fn literal_texto(texto: &str) -> ExpressaoNo {
    ExpressaoNo::Literal {
        valor: ValorExpressao::Texto(texto.to_string()),
    }
}

fn literal_numero(numero: f64) -> ExpressaoNo {
    ExpressaoNo::Literal {
        valor: ValorExpressao::Numero(numero),
    }
}

fn igual_a(expressao: ExpressaoNo, texto: &str) -> ExpressaoNo {
    ExpressaoNo::Comparacao {
        operador: OperadorComparacao::Igual,
        esquerda: Box::new(expressao),
        direita: Box::new(literal_texto(texto)),
    }
}

fn coluna(id: &str, rotulo: &str, expressao: ExpressaoNo, largura: Option<i32>, alinhamento: Alinhamento) -> ColunaRelatorio {
    ColunaRelatorio {
        id: id.to_string(),
        rotulo: rotulo.to_string(),
        expressao,
        largura,
        alinhamento,
    }
}

fn ordenacao(coluna_id: &str) -> OrdenacaoRelatorio {
    OrdenacaoRelatorio {
        coluna_id: coluna_id.to_string(),
        decrescente: false,
    }
}

/// A maioria dos relatórios tem 1 seção só, sem título (o comportamento
/// "de sempre": uma tabela, agrupada ou não). Esse helper monta esse caso
/// comum a partir dos 4 blocos que toda ReportDefinition de hoje já tinha.
fn secao_unica(
    filtros: GrupoFiltros,
    colunas: Vec<ColunaRelatorio>,
    ordenacao: Vec<OrdenacaoRelatorio>,
    agrupamento: AgrupamentoRelatorio,
) -> Vec<SecaoRelatorio> {
    vec![SecaoRelatorio {
        titulo: None,
        fonte_linhas: FonteLinhas::PorAluno,
        filtros,
        colunas,
        ordenacao,
        agrupamento,
    }]
}

/// SE período == "MANHA" ENTÃO "Manhã" SENÃO SE período == "TARDE" ENTÃO
/// "Tarde" SENÃO "Noite" — só pra exibir os blocos do Top 60 com rótulo
/// bonito em vez do código bruto da turma.
fn expressao_rotulo_periodo() -> ExpressaoNo {
    ExpressaoNo::Se {
        condicao: Box::new(igual_a(campo("turma_periodo"), "MANHA")),
        entao: Box::new(literal_texto("Manhã")),
        senao: Box::new(ExpressaoNo::Se {
            condicao: Box::new(igual_a(campo("turma_periodo"), "TARDE")),
            entao: Box::new(literal_texto("Tarde")),
            senao: Box::new(literal_texto("Noite")),
        }),
    }
}

pub(crate) fn definicao_top60() -> ReportDefinition {
    ReportDefinition {
        id: "top60".to_string(),
        nome: "Top Alunos".to_string(),
        descricao:
            "Os melhores alunos de cada período (Manhã/Tarde/Noite) do bimestre, por média global — \
             quantidade por período ajustável abaixo (60 por padrão). Critérios de desempate: maior \
             frequência anual acumulada, depois menor número de médias vermelhas. Turmas de período \
             Integral não entram."
                .to_string(),
        autor: None,
        embutido: true,
        fonte: FiltroTurmas {
            periodos: vec!["MANHA".to_string(), "TARDE".to_string(), "NOITE".to_string()],
            ..Default::default()
        },
        parametros: vec![DefinicaoParametro {
            id: "quantidade_top".to_string(),
            rotulo: "Quantos alunos por período (Top N)".to_string(),
            tipo: TipoParametro::Numero,
            valor_padrao: ValorExpressao::Numero(60.0),
        }],
        secoes: secao_unica(
            GrupoFiltros {
                combinador: Combinador::E,
                condicoes: vec![FiltroCondicao {
                    campo: campo("media_bimestre"),
                    operador: Operador::NaoVazio,
                    valor: None,
                }],
            },
            vec![
                coluna("numero", "Nº", campo("aluno_numero_chamada"), Some(520), Alinhamento::Centro),
                coluna("nome", "Aluno", campo("aluno_nome"), Some(2700), Alinhamento::Esquerda),
                coluna("turma", "Turma", campo("turma_rotulo"), Some(1200), Alinhamento::Centro),
                coluna("media", "Média global", campo("media_bimestre"), Some(1300), Alinhamento::Centro),
                coluna("frequencia", "Frequência", campo("frequencia_percentual"), Some(1200), Alinhamento::Centro),
                coluna(
                    "vermelhas",
                    "Médias vermelhas",
                    campo("contagem_disciplinas_abaixo_media"),
                    Some(1560),
                    Alinhamento::Centro,
                ),
            ],
            vec![
                OrdenacaoRelatorio {
                    coluna_id: "media".to_string(),
                    decrescente: true,
                },
                OrdenacaoRelatorio {
                    coluna_id: "frequencia".to_string(),
                    decrescente: true,
                },
                ordenacao("vermelhas"),
            ],
            AgrupamentoRelatorio {
                campo: Some(expressao_rotulo_periodo()),
                limite_por_grupo: Some(60),
                limite_parametro: Some("quantidade_top".to_string()),
                ordem_grupos: Some(vec!["Manhã".to_string(), "Tarde".to_string(), "Noite".to_string()]),
            },
        ),
        blocos: Vec::new(),
        formato_saida: FormatoSaida::Docx,
    }
}

/// Critério "excesso de faltas": frequência anual acumulada abaixo de 75%.
fn cond_excesso_faltas() -> ExpressaoNo {
    ExpressaoNo::Comparacao {
        operador: OperadorComparacao::Menor,
        esquerda: Box::new(campo("frequencia_percentual")),
        direita: Box::new(literal_numero(75.0)),
    }
}

/// Critério "crítico por notas": média global do bimestre (arredondada,
/// meio-para-cima) abaixo da nota mínima configurada — os dois lados são
/// campos dinâmicos, não um limiar fixo.
fn cond_critico_por_notas() -> ExpressaoNo {
    ExpressaoNo::Comparacao {
        operador: OperadorComparacao::Menor,
        esquerda: Box::new(campo("media_bimestre_arredondada")),
        direita: Box::new(campo("nota_minima_configurada")),
    }
}

fn expressao_motivo_critico() -> ExpressaoNo {
    ExpressaoNo::Se {
        condicao: Box::new(ExpressaoNo::Logica {
            operador: OperadorLogico::E,
            valores: vec![cond_excesso_faltas(), cond_critico_por_notas()],
        }),
        entao: Box::new(literal_texto("Excesso de faltas e de disciplinas com notas baixas")),
        senao: Box::new(ExpressaoNo::Se {
            condicao: Box::new(cond_excesso_faltas()),
            entao: Box::new(literal_texto("Excesso de faltas")),
            senao: Box::new(ExpressaoNo::Se {
                condicao: Box::new(cond_critico_por_notas()),
                entao: Box::new(literal_texto("Excesso de disciplinas com notas baixas")),
                senao: Box::new(literal_texto("-")),
            }),
        }),
    }
}

pub(crate) fn definicao_alunos_criticos() -> ReportDefinition {
    ReportDefinition {
        id: "alunos_criticos".to_string(),
        nome: "Relatório de Alunos Críticos".to_string(),
        descricao: "Alunos com frequência anual abaixo de 75% ou média global do bimestre abaixo da nota mínima configurada."
            .to_string(),
        autor: None,
        embutido: true,
        fonte: FiltroTurmas::default(),
        parametros: vec![],
        secoes: secao_unica(
            GrupoFiltros {
                combinador: Combinador::Ou,
                condicoes: vec![
                    FiltroCondicao {
                        campo: campo("frequencia_percentual"),
                        operador: Operador::Menor,
                        valor: Some(literal_numero(75.0)),
                    },
                    FiltroCondicao {
                        campo: campo("media_bimestre_arredondada"),
                        operador: Operador::Menor,
                        valor: Some(campo("nota_minima_configurada")),
                    },
                ],
            },
            vec![
                coluna("numero", "Nº", campo("aluno_numero_chamada"), Some(420), Alinhamento::Centro),
                coluna("nome", "Aluno", campo("aluno_nome"), Some(2500), Alinhamento::Esquerda),
                coluna("ra", "RA", campo("aluno_matricula"), Some(1250), Alinhamento::Centro),
                coluna("frequencia", "Freq.", campo("frequencia_percentual"), Some(780), Alinhamento::Centro),
                coluna("motivo", "Motivo", expressao_motivo_critico(), Some(2100), Alinhamento::Esquerda),
                coluna(
                    "disciplinas_baixas",
                    "Disciplinas abaixo",
                    campo("disciplinas_abaixo_media"),
                    Some(4050),
                    Alinhamento::Esquerda,
                ),
            ],
            vec![ordenacao("numero"), ordenacao("nome")],
            AgrupamentoRelatorio {
                campo: Some(campo("turma_rotulo")),
                limite_por_grupo: None,
                limite_parametro: None,
                ordem_grupos: None,
            },
        ),
        blocos: Vec::new(),
        formato_saida: FormatoSaida::Docx,
    }
}

/// Colunas comuns às duas seções de Alterações de Notas — cada linha é um
/// aluno × uma disciplina alterada no conselho (fan-out sobre a coleção
/// `disciplinas_ajustadas_bimestre`, ver colecoes.rs).
fn colunas_alteracoes_notas() -> Vec<ColunaRelatorio> {
    vec![
        coluna("numero", "Nº", campo("aluno_numero_chamada"), Some(420), Alinhamento::Centro),
        coluna("nome", "Aluno", campo("aluno_nome"), Some(2200), Alinhamento::Esquerda),
        coluna("ra", "RA", campo("aluno_matricula"), Some(1250), Alinhamento::Centro),
        coluna("disciplina", "Disciplina", item_atual("disciplina_rotulo"), Some(1800), Alinhamento::Esquerda),
        coluna("media_original", "Média Original", item_atual("media_original"), Some(1300), Alinhamento::Centro),
        coluna("media_conselho", "Média Conselho", item_atual("media_conselho"), Some(1300), Alinhamento::Centro),
        coluna("media_mapao", "Média Mapão", item_atual("media_mapao"), Some(1300), Alinhamento::Centro),
        coluna("situacao", "Situação", item_atual("situacao"), Some(2400), Alinhamento::Esquerda),
    ]
}

fn secao_alteracoes_notas(titulo: &str, operador_situacao: Operador) -> SecaoRelatorio {
    SecaoRelatorio {
        titulo: Some(titulo.to_string()),
        fonte_linhas: FonteLinhas::PorAlunoEItem {
            colecao: "disciplinas_ajustadas_bimestre".to_string(),
        },
        filtros: GrupoFiltros {
            combinador: Combinador::E,
            condicoes: vec![FiltroCondicao {
                campo: item_atual("situacao"),
                operador: operador_situacao,
                valor: Some(literal_texto("Confirmada no mapão")),
            }],
        },
        colunas: colunas_alteracoes_notas(),
        ordenacao: vec![ordenacao("numero"), ordenacao("nome"), ordenacao("disciplina")],
        agrupamento: AgrupamentoRelatorio {
            campo: Some(campo("turma_rotulo")),
            limite_por_grupo: None,
            limite_parametro: None,
            ordem_grupos: None,
        },
    }
}

pub(crate) fn definicao_alteracoes_notas() -> ReportDefinition {
    ReportDefinition {
        id: "alteracoes_notas".to_string(),
        nome: "Alterações de Notas Pós-Conselho".to_string(),
        descricao: "Compara, disciplina por disciplina, as notas decididas no conselho com o último mapão importado."
            .to_string(),
        autor: None,
        embutido: true,
        fonte: FiltroTurmas::default(),
        parametros: vec![],
        secoes: vec![
            secao_alteracoes_notas("Pendentes (mapão ainda não confirma o conselho)", Operador::Diferente),
            secao_alteracoes_notas("Confirmadas no mapão", Operador::Igual),
        ],
        blocos: Vec::new(),
        formato_saida: FormatoSaida::Docx,
    }
}

/// "1º semestre..." se a sugestão repõe o 1º/2º bimestre, senão "2º
/// semestre..." — mesmo corte usado pelo relatório original pra separar as
/// duas provas de recuperação do ano.
fn expressao_rotulo_semestre_recuperacao() -> ExpressaoNo {
    ExpressaoNo::Se {
        condicao: Box::new(ExpressaoNo::Logica {
            operador: OperadorLogico::Ou,
            valores: vec![igual_a(item_atual("bimestre_repor"), "1"), igual_a(item_atual("bimestre_repor"), "2")],
        }),
        entao: Box::new(literal_texto("1º semestre (substitui 1º ou 2º bimestre)")),
        senao: Box::new(literal_texto("2º semestre (substitui 3º ou 4º bimestre)")),
    }
}

/// Chave de agrupamento das sugestões: turma × semestre × disciplina — uma
/// tabela por disciplina (como no relatório original), não uma lista só por
/// turma. A ordenação alfabética da chave concatenada já cai na ordem certa
/// (turma, depois semestre — "1º" vem antes de "2º" —, depois disciplina)
/// sem precisar de `ordem_grupos` explícito.
fn expressao_grupo_sugestao_recuperacao() -> ExpressaoNo {
    ExpressaoNo::Funcao {
        nome: FuncaoExpressao::Concatenar,
        argumentos: vec![
            campo("turma_rotulo"),
            literal_texto(" — "),
            expressao_rotulo_semestre_recuperacao(),
            literal_texto(" — Disciplina: "),
            item_atual("disciplina_rotulo"),
        ],
    }
}

pub(crate) fn definicao_elegiveis_recuperacao() -> ReportDefinition {
    let secao_elegiveis = SecaoRelatorio {
        titulo: Some("Alunos Elegíveis".to_string()),
        fonte_linhas: FonteLinhas::PorAluno,
        filtros: GrupoFiltros {
            combinador: Combinador::E,
            condicoes: vec![FiltroCondicao {
                campo: campo("recuperacao_percentual_vermelhas"),
                operador: Operador::MaiorIgual,
                valor: Some(parametro("limiar_percentual")),
            }],
        },
        colunas: vec![
            coluna("numero", "Nº", campo("aluno_numero_chamada"), Some(420), Alinhamento::Centro),
            coluna("nome", "Aluno", campo("aluno_nome"), Some(2500), Alinhamento::Esquerda),
            coluna("ra", "RA", campo("aluno_matricula"), Some(1250), Alinhamento::Centro),
            coluna("total_notas", "Total de notas", campo("recuperacao_total_notas"), Some(1100), Alinhamento::Centro),
            coluna(
                "vermelhas",
                "Notas vermelhas",
                campo("recuperacao_notas_vermelhas"),
                Some(1100),
                Alinhamento::Centro,
            ),
            coluna(
                "percentual",
                "% vermelhas",
                campo("recuperacao_percentual_vermelhas"),
                Some(1100),
                Alinhamento::Centro,
            ),
            coluna(
                "disciplinas_vermelhas",
                "Disciplinas vermelhas",
                campo("recuperacao_disciplinas_vermelhas"),
                Some(3500),
                Alinhamento::Esquerda,
            ),
        ],
        ordenacao: vec![ordenacao("numero"), ordenacao("nome")],
        agrupamento: AgrupamentoRelatorio {
            campo: Some(campo("turma_rotulo")),
            limite_por_grupo: None,
            limite_parametro: None,
            ordem_grupos: None,
        },
    };

    let secao_sugestoes = SecaoRelatorio {
        titulo: Some("Sugestões de Substituição de Nota".to_string()),
        fonte_linhas: FonteLinhas::PorAlunoEItem {
            colecao: "sugestoes_substituicao_recuperacao".to_string(),
        },
        filtros: GrupoFiltros::default(),
        colunas: vec![
            coluna("numero", "Nº", campo("aluno_numero_chamada"), Some(420), Alinhamento::Centro),
            coluna("nome", "Aluno", campo("aluno_nome"), Some(2200), Alinhamento::Esquerda),
            coluna("ra", "RA", campo("aluno_matricula"), Some(1250), Alinhamento::Centro),
            coluna("disciplina", "Disciplina", item_atual("disciplina_rotulo"), Some(1800), Alinhamento::Esquerda),
            coluna("bimestre_repor", "Bimestre a repor", item_atual("bimestre_repor"), Some(1300), Alinhamento::Centro),
            coluna("nota_repor", "Nota a repor", item_atual("nota_repor"), Some(1100), Alinhamento::Centro),
            coluna("bimestre_outro", "Outro bimestre", item_atual("bimestre_outro"), Some(1300), Alinhamento::Centro),
            coluna("nota_outro", "Nota do outro", item_atual("nota_outro"), Some(1100), Alinhamento::Centro),
        ],
        ordenacao: vec![ordenacao("numero"), ordenacao("nome")],
        agrupamento: AgrupamentoRelatorio {
            campo: Some(expressao_grupo_sugestao_recuperacao()),
            limite_por_grupo: None,
            limite_parametro: None,
            ordem_grupos: None,
        },
    };

    ReportDefinition {
        id: "elegiveis_recuperacao".to_string(),
        nome: "Elegíveis à Prova de Recuperação".to_string(),
        descricao: "Alunos com X% ou mais de notas vermelhas (limiar ajustável abaixo) somando todos os bimestres, \
                     e a sugestão de qual nota a prova de recuperação substitui em cada disciplina."
            .to_string(),
        autor: None,
        embutido: true,
        fonte: FiltroTurmas::default(),
        parametros: vec![DefinicaoParametro {
            id: "limiar_percentual".to_string(),
            rotulo: "Limiar de notas vermelhas para elegibilidade (%)".to_string(),
            tipo: TipoParametro::Numero,
            valor_padrao: ValorExpressao::Numero(50.0),
        }],
        secoes: vec![secao_elegiveis, secao_sugestoes],
        blocos: Vec::new(),
        formato_saida: FormatoSaida::Docx,
    }
}

pub(crate) fn definicao_pendencia_lancamento() -> ReportDefinition {
    ReportDefinition {
        id: "pendencia_lancamento".to_string(),
        nome: "Pendência de Lançamento de Notas".to_string(),
        descricao: "Por turma, disciplina e bimestre: quantos alunos ativos ainda não têm nota lançada no mapão."
            .to_string(),
        autor: None,
        embutido: true,
        fonte: FiltroTurmas::default(),
        parametros: vec![],
        secoes: vec![SecaoRelatorio {
            titulo: None,
            fonte_linhas: FonteLinhas::PorTurmaDisciplina,
            filtros: GrupoFiltros {
                combinador: Combinador::E,
                condicoes: vec![FiltroCondicao {
                    campo: campo("faltam_lancar_disciplina"),
                    operador: Operador::Maior,
                    valor: Some(literal_numero(0.0)),
                }],
            },
            colunas: vec![
                coluna("bimestre", "Bimestre", campo("bimestre_linha"), Some(900), Alinhamento::Centro),
                coluna("disciplina", "Disciplina", campo("disciplina_contexto"), Some(2600), Alinhamento::Esquerda),
                coluna("total", "Alunos ativos", campo("total_ativos_disciplina"), Some(1300), Alinhamento::Centro),
                coluna("lancadas", "Notas lançadas", campo("notas_lancadas_disciplina"), Some(1300), Alinhamento::Centro),
                coluna("faltam", "Faltam lançar", campo("faltam_lancar_disciplina"), Some(1300), Alinhamento::Centro),
            ],
            ordenacao: vec![ordenacao("bimestre"), ordenacao("disciplina")],
            agrupamento: AgrupamentoRelatorio {
                campo: Some(campo("turma_codigo")),
                limite_por_grupo: None,
                limite_parametro: None,
                ordem_grupos: None,
            },
        }],
        blocos: Vec::new(),
        formato_saida: FormatoSaida::Docx,
    }
}

pub(crate) fn definicoes_embutidas() -> Vec<ReportDefinition> {
    vec![
        definicao_top60(),
        definicao_alunos_criticos(),
        definicao_alteracoes_notas(),
        definicao_elegiveis_recuperacao(),
        definicao_pendencia_lancamento(),
    ]
}
