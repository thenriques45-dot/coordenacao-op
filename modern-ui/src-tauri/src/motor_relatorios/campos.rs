// Registro de campos: o catálogo declarativo que permite um bloco visual
// dizer "Média Geral do Aluno" sem saber nada da forma do JSON por trás.
// Cada campo é só um envelope fino em cima das funções de extração que já
// existiam (media_aluno_bimestre, disciplinas_baixas_aluno, objeto_bimestre
// etc., de docx.rs/turmas.rs/pendencias.rs) — nada de reimplementar a
// leitura do dado do zero.

use chrono::{Local, NaiveDate};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

use crate::*;

use super::expressoes::ValorExpressao;

/// Um item gerado por uma "coleção nomeada" (fan-out — ver colecoes.rs):
/// uma linha de `PorAlunoEItem` representa um aluno + um item específico
/// (ex.: uma disciplina alterada no conselho), não o aluno inteiro.
/// `parametro` alimenta os campos parametrizados que já existem quando a
/// coluna não fixa um parâmetro explícito; `extras` carrega valores que só
/// existem naquele item (ex.: a nota do outro bimestre do par), lidos via
/// `ExpressaoNo::ItemAtual`.
pub(crate) struct ItemFanOut {
    pub(crate) parametro: String,
    pub(crate) extras: BTreeMap<String, ValorExpressao>,
}

/// `aluno`/`matricula` são `None` numa linha agregada (`PorTurmaDisciplina`
/// — a linha é sobre turma×disciplina, não sobre um aluno). `item` só é
/// `Some` numa linha de fan-out (`PorAlunoEItem`). `disciplina_contexto` só
/// é `Some` numa linha agregada.
pub(crate) struct ContextoLinha<'a> {
    pub(crate) turma: &'a TurmaArquivo,
    pub(crate) matricula: Option<&'a str>,
    pub(crate) aluno: Option<&'a Value>,
    pub(crate) bimestre: &'a str,
    pub(crate) nota_minima: f64,
    pub(crate) disciplina_contexto: Option<&'a str>,
    pub(crate) item: Option<&'a ItemFanOut>,
    /// Parâmetros de execução já resolvidos (valor enviado pela UI, ou
    /// `valor_padrao` da definição quando a UI não enviou nada) — ver
    /// `DefinicaoParametro`/`ExpressaoNo::Parametro`.
    pub(crate) parametros: &'a BTreeMap<String, ValorExpressao>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TipoCampo {
    Texto,
    Numero,
    Percentual,
    Booleano,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CategoriaCampo {
    Aluno,
    Turma,
    Notas,
    Frequencia,
    Configuracao,
    Expansoes,
}

pub(crate) struct CampoRelatorio {
    pub(crate) id: &'static str,
    pub(crate) rotulo: &'static str,
    pub(crate) categoria: CategoriaCampo,
    pub(crate) tipo: TipoCampo,
    /// Campos parametrizados esperam um `parametro` na ExpressaoNo::Campo
    /// que os referencia (ex.: nome da disciplina para frequência por
    /// disciplina). O construtor visual mostra um seletor extra para eles.
    pub(crate) requer_parametro: bool,
    pub(crate) extrator: fn(&ContextoLinha, Option<&str>) -> ValorExpressao,
}

pub(crate) const CAMPOS: &[CampoRelatorio] = &[
    CampoRelatorio {
        id: "aluno_nome",
        rotulo: "Nome do Aluno",
        categoria: CategoriaCampo::Aluno,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_aluno_nome,
    },
    CampoRelatorio {
        id: "aluno_numero_chamada",
        rotulo: "Nº de Chamada",
        categoria: CategoriaCampo::Aluno,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_aluno_numero_chamada,
    },
    CampoRelatorio {
        id: "aluno_matricula",
        rotulo: "RA / Matrícula",
        categoria: CategoriaCampo::Aluno,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_aluno_matricula,
    },
    CampoRelatorio {
        id: "turma_codigo",
        rotulo: "Código da Turma",
        categoria: CategoriaCampo::Turma,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_turma_codigo,
    },
    CampoRelatorio {
        id: "turma_rotulo",
        rotulo: "Turma",
        categoria: CategoriaCampo::Turma,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_turma_rotulo,
    },
    CampoRelatorio {
        id: "turma_serie",
        rotulo: "Série",
        categoria: CategoriaCampo::Turma,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_turma_serie,
    },
    CampoRelatorio {
        id: "turma_periodo",
        rotulo: "Período",
        categoria: CategoriaCampo::Turma,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_turma_periodo,
    },
    CampoRelatorio {
        id: "media_bimestre",
        rotulo: "Média Global do Bimestre",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_media_bimestre,
    },
    CampoRelatorio {
        id: "disciplinas_abaixo_media",
        rotulo: "Disciplinas Abaixo da Média",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_disciplinas_abaixo_media,
    },
    CampoRelatorio {
        id: "contagem_disciplinas_abaixo_media",
        rotulo: "Qtd. de Disciplinas Abaixo da Média",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_contagem_disciplinas_abaixo_media,
    },
    CampoRelatorio {
        id: "frequencia_percentual",
        rotulo: "Frequência Anual (%)",
        categoria: CategoriaCampo::Frequencia,
        tipo: TipoCampo::Percentual,
        requer_parametro: false,
        extrator: campo_frequencia_percentual,
    },
    CampoRelatorio {
        id: "frequencia_percentual_disciplina",
        rotulo: "Frequência Acumulada em uma Disciplina (%)",
        categoria: CategoriaCampo::Frequencia,
        tipo: TipoCampo::Percentual,
        requer_parametro: true,
        extrator: campo_frequencia_percentual_disciplina,
    },
    CampoRelatorio {
        id: "faltas_acumuladas_disciplina",
        rotulo: "Faltas Acumuladas em uma Disciplina",
        categoria: CategoriaCampo::Frequencia,
        tipo: TipoCampo::Numero,
        requer_parametro: true,
        extrator: campo_faltas_acumuladas_disciplina,
    },
    CampoRelatorio {
        id: "total_aulas_disciplina",
        rotulo: "Total de Aulas de uma Disciplina",
        categoria: CategoriaCampo::Frequencia,
        tipo: TipoCampo::Numero,
        requer_parametro: true,
        extrator: campo_total_aulas_disciplina,
    },
    CampoRelatorio {
        id: "nota_disciplina_bimestre",
        rotulo: "Nota em uma Disciplina (Bimestre)",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: true,
        extrator: campo_nota_disciplina_bimestre,
    },
    CampoRelatorio {
        id: "aluno_tem_disciplina",
        rotulo: "Aluno Cursa uma Disciplina",
        categoria: CategoriaCampo::Frequencia,
        tipo: TipoCampo::Booleano,
        requer_parametro: true,
        extrator: campo_aluno_tem_disciplina,
    },
    CampoRelatorio {
        id: "media_bimestre_arredondada",
        rotulo: "Média Global do Bimestre (Arredondada)",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_media_bimestre_arredondada,
    },
    CampoRelatorio {
        id: "tarefas_feitas",
        rotulo: "Tarefas Feitas no Bimestre",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_tarefas_feitas,
    },
    CampoRelatorio {
        id: "tarefas_total",
        rotulo: "Total de Tarefas no Bimestre",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_tarefas_total,
    },
    CampoRelatorio {
        id: "tarefas_nota",
        rotulo: "Nota de Tarefas (0-10)",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_tarefas_nota,
    },
    CampoRelatorio {
        id: "prova_paulista_participou",
        rotulo: "Participou da Prova Paulista",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_prova_paulista_participou,
    },
    CampoRelatorio {
        id: "prova_paulista_geral",
        rotulo: "Prova Paulista — Nota Geral",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_prova_paulista_geral,
    },
    CampoRelatorio {
        id: "prova_paulista_disciplina",
        rotulo: "Prova Paulista — Nota por Disciplina",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: true,
        extrator: campo_prova_paulista_disciplina,
    },
    CampoRelatorio {
        id: "nota_minima_configurada",
        rotulo: "Nota Mínima Configurada",
        categoria: CategoriaCampo::Configuracao,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_nota_minima_configurada,
    },
    CampoRelatorio {
        id: "bimestre_linha",
        rotulo: "Bimestre da Linha",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_bimestre_linha,
    },
    CampoRelatorio {
        id: "disciplina_contexto",
        rotulo: "Disciplina (linha agregada por turma×disciplina)",
        categoria: CategoriaCampo::Turma,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_disciplina_contexto,
    },
    CampoRelatorio {
        id: "total_ativos_disciplina",
        rotulo: "Alunos Ativos Esperados na Disciplina",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_total_ativos_disciplina,
    },
    CampoRelatorio {
        id: "notas_lancadas_disciplina",
        rotulo: "Notas Lançadas na Disciplina",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_notas_lancadas_disciplina,
    },
    CampoRelatorio {
        id: "faltam_lancar_disciplina",
        rotulo: "Notas Faltando Lançar na Disciplina",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_faltam_lancar_disciplina,
    },
    CampoRelatorio {
        id: "recuperacao_total_notas",
        rotulo: "Total de Notas Lançadas no Ano",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_recuperacao_total_notas,
    },
    CampoRelatorio {
        id: "recuperacao_notas_vermelhas",
        rotulo: "Qtd. de Notas Vermelhas no Ano",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_recuperacao_notas_vermelhas,
    },
    CampoRelatorio {
        id: "recuperacao_percentual_vermelhas",
        rotulo: "% de Notas Vermelhas no Ano",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Percentual,
        requer_parametro: false,
        extrator: campo_recuperacao_percentual_vermelhas,
    },
    CampoRelatorio {
        id: "recuperacao_disciplinas_vermelhas",
        rotulo: "Disciplinas Vermelhas no Ano",
        categoria: CategoriaCampo::Notas,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_recuperacao_disciplinas_vermelhas,
    },
    // Expansão (online): disciplinas de expansão cursadas numa plataforma
    // externa pelos alunos do noturno (ver importador_expansoes.rs). NÃO
    // CONFUNDIR com TurmaArquivo.disciplinas_expansao — aquilo é uma lista
    // de nomes de disciplina em nível de turma, isto é progresso/nota por
    // aluno. Todo campo abaixo respeita duas regras, ver snapshots_expansao:
    // (1) nunca mostra dado de um bimestre diferente de ctx.bimestre — um
    // campo "atual" só olha snapshots com bimestre == ctx.bimestre; (2) sem
    // dado, devolve Nulo, nunca 0.0 — 0.0 tornaria "sem dado" indistinguível
    // de "estagnado", que é a distinção que estes campos existem para dar.
    CampoRelatorio {
        id: "expansao_progresso_atual",
        rotulo: "Expansão — Progresso Atual (%)",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Percentual,
        requer_parametro: false,
        extrator: campo_expansao_progresso_atual,
    },
    CampoRelatorio {
        id: "expansao_nota_atual",
        rotulo: "Expansão — Nota Média Atual (0–10)",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_expansao_nota_atual,
    },
    CampoRelatorio {
        id: "expansao_progresso_delta_recente",
        rotulo: "Expansão — Progresso Ganho desde a Importação Anterior (p.p.)",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_expansao_progresso_delta_recente,
    },
    CampoRelatorio {
        id: "expansao_nota_delta_recente",
        rotulo: "Expansão — Nota Ganha desde a Importação Anterior",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_expansao_nota_delta_recente,
    },
    CampoRelatorio {
        id: "expansao_progresso_delta_bimestre",
        rotulo: "Expansão — Progresso Ganho no Bimestre (p.p.)",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_expansao_progresso_delta_bimestre,
    },
    CampoRelatorio {
        id: "expansao_nota_delta_bimestre",
        rotulo: "Expansão — Nota Ganha no Bimestre",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_expansao_nota_delta_bimestre,
    },
    CampoRelatorio {
        id: "expansao_dias_sem_acesso",
        rotulo: "Expansão — Dias sem Acessar a Plataforma",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_expansao_dias_sem_acesso,
    },
    CampoRelatorio {
        id: "expansao_ultimo_acesso",
        rotulo: "Expansão — Data do Último Acesso",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_expansao_ultimo_acesso,
    },
    CampoRelatorio {
        id: "expansao_data_ultima_importacao",
        rotulo: "Expansão — Data da Última Importação",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_expansao_data_ultima_importacao,
    },
    CampoRelatorio {
        id: "expansao_qtd_importacoes_bimestre",
        rotulo: "Expansão — Nº de Importações no Bimestre",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Numero,
        requer_parametro: false,
        extrator: campo_expansao_qtd_importacoes_bimestre,
    },
    CampoRelatorio {
        id: "expansao_turma_origem",
        rotulo: "Expansão — Turma na Plataforma",
        categoria: CategoriaCampo::Expansoes,
        tipo: TipoCampo::Texto,
        requer_parametro: false,
        extrator: campo_expansao_turma_origem,
    },
];

pub(crate) fn buscar_campo(id: &str) -> Option<&'static CampoRelatorio> {
    CAMPOS.iter().find(|campo| campo.id == id)
}

fn campo_aluno_nome(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    aluno
        .get("nome")
        .and_then(Value::as_str)
        .map(|nome| ValorExpressao::Texto(nome.to_string()))
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_aluno_numero_chamada(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    aluno
        .get("numero_chamada")
        .and_then(Value::as_i64)
        .map(|numero| ValorExpressao::Numero(numero as f64))
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_aluno_matricula(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ctx.matricula.map(|m| ValorExpressao::Texto(m.to_string())).unwrap_or(ValorExpressao::Nulo)
}

fn campo_turma_codigo(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ValorExpressao::Texto(ctx.turma.codigo.clone())
}

fn campo_turma_rotulo(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ValorExpressao::Texto(rotulo_turma(ctx.turma))
}

fn campo_turma_serie(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ctx.turma
        .serie
        .clone()
        .map(ValorExpressao::Texto)
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_turma_periodo(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ctx.turma
        .periodo
        .clone()
        .map(ValorExpressao::Texto)
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_media_bimestre(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    media_aluno_bimestre(aluno, ctx.bimestre)
        .map(ValorExpressao::Numero)
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_disciplinas_abaixo_media(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let disciplinas = disciplinas_baixas_aluno(aluno, ctx.bimestre, ctx.nota_minima);
    if disciplinas.is_empty() {
        ValorExpressao::Texto("-".to_string())
    } else {
        ValorExpressao::Texto(disciplinas.join(", "))
    }
}

fn campo_contagem_disciplinas_abaixo_media(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let disciplinas = disciplinas_baixas_aluno(aluno, ctx.bimestre, ctx.nota_minima);
    ValorExpressao::Numero(disciplinas.len() as f64)
}

fn campo_frequencia_percentual(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    aluno
        .get("frequencia_percentual")
        .and_then(valor_para_f64)
        .map(ValorExpressao::Numero)
        .unwrap_or(ValorExpressao::Nulo)
}

/// Réplica do critério usado hoje pelo relatório de Educação Física: soma
/// faltas/aulas da disciplina em cada bimestre lançado. A presença da chave
/// de frequência (mesmo com 0 falta) é o sinal de que o aluno cursa a
/// disciplina — carga_horaria sozinha não serve de critério porque é um
/// campo por turma (fica positiva pra sala inteira assim que 1 aluno real
/// da disciplina é casado ali).
struct FrequenciaDisciplina {
    tem_disciplina: bool,
    faltas_acumuladas: f64,
    total_aulas_acumuladas: f64,
}

fn frequencia_bruta_disciplina(ctx: &ContextoLinha, disciplina: &str) -> FrequenciaDisciplina {
    let carga_horaria = ctx.turma.carga_horaria.clone().unwrap_or_default();
    let mut resultado = FrequenciaDisciplina {
        tem_disciplina: false,
        faltas_acumuladas: 0.0,
        total_aulas_acumuladas: 0.0,
    };
    let Some(aluno) = ctx.aluno else { return resultado };

    for periodo in ["1", "2", "3", "4"] {
        if let Some(entrada) =
            objeto_bimestre(aluno, "frequencia", periodo).and_then(|mapa| mapa.get(disciplina))
        {
            resultado.tem_disciplina = true;
            if let Some(valor) = valor_para_f64(entrada) {
                resultado.faltas_acumuladas += valor;
            }
        }
        if let Some(valor) = carga_horaria
            .get(periodo)
            .and_then(Value::as_object)
            .and_then(|mapa| mapa.get(disciplina))
            .and_then(valor_para_f64)
        {
            resultado.total_aulas_acumuladas += valor;
        }
    }

    resultado
}

fn campo_frequencia_percentual_disciplina(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let Some(disciplina) = parametro else {
        return ValorExpressao::Nulo;
    };
    let dados = frequencia_bruta_disciplina(ctx, disciplina);
    if !dados.tem_disciplina || dados.total_aulas_acumuladas <= 0.0 {
        return ValorExpressao::Nulo;
    }
    let percentual = ((1.0 - dados.faltas_acumuladas / dados.total_aulas_acumuladas) * 100.0).clamp(0.0, 100.0);
    ValorExpressao::Numero(percentual)
}

fn campo_faltas_acumuladas_disciplina(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let Some(disciplina) = parametro else {
        return ValorExpressao::Nulo;
    };
    let dados = frequencia_bruta_disciplina(ctx, disciplina);
    if !dados.tem_disciplina {
        return ValorExpressao::Nulo;
    }
    ValorExpressao::Numero(dados.faltas_acumuladas)
}

fn campo_total_aulas_disciplina(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let Some(disciplina) = parametro else {
        return ValorExpressao::Nulo;
    };
    let dados = frequencia_bruta_disciplina(ctx, disciplina);
    if !dados.tem_disciplina {
        return ValorExpressao::Nulo;
    }
    ValorExpressao::Numero(dados.total_aulas_acumuladas)
}

fn campo_nota_disciplina_bimestre(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let Some(disciplina) = parametro else { return ValorExpressao::Nulo };
    nota_vigente_disciplina(aluno, ctx.bimestre, disciplina)
        .map(ValorExpressao::Numero)
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_aluno_tem_disciplina(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let Some(disciplina) = parametro else {
        return ValorExpressao::Booleano(false);
    };
    let dados = frequencia_bruta_disciplina(ctx, disciplina);
    ValorExpressao::Booleano(dados.tem_disciplina && dados.total_aulas_acumuladas > 0.0)
}

fn campo_nota_minima_configurada(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ValorExpressao::Numero(ctx.nota_minima)
}

fn campo_media_bimestre_arredondada(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    media_aluno_bimestre(aluno, ctx.bimestre)
        .map(|valor| ValorExpressao::Numero(arredondar_media_normal(valor)))
        .unwrap_or(ValorExpressao::Nulo)
}

fn valor_tarefas_bimestre<'a>(ctx: &'a ContextoLinha) -> Option<&'a Value> {
    ctx.aluno?.get("tarefas").and_then(|tarefas| tarefas.get(ctx.bimestre))
}

fn campo_tarefas_feitas(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let feitas = valor_tarefas_bimestre(ctx).and_then(|bim| bim.get("feitas")).and_then(Value::as_u64).unwrap_or(0);
    ValorExpressao::Numero(feitas as f64)
}

fn campo_tarefas_total(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let total = valor_tarefas_bimestre(ctx).and_then(|bim| bim.get("total")).and_then(Value::as_u64).unwrap_or(0);
    ValorExpressao::Numero(total as f64)
}

fn campo_tarefas_nota(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let percentual = valor_tarefas_bimestre(ctx).and_then(|bim| bim.get("percentual")).and_then(Value::as_f64).unwrap_or(0.0);
    ValorExpressao::Numero((percentual / 10.0).round())
}

fn valor_prova_paulista_bimestre<'a>(ctx: &'a ContextoLinha) -> Option<&'a Value> {
    ctx.aluno?.get("prova_paulista").and_then(|prova| prova.get(ctx.bimestre))
}

fn campo_prova_paulista_participou(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let participou = valor_prova_paulista_bimestre(ctx)
        .and_then(|entrada| entrada.get("participou"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    ValorExpressao::Texto(if participou { "Sim" } else { "Não" }.to_string())
}

fn campo_prova_paulista_geral(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    valor_prova_paulista_bimestre(ctx)
        .and_then(|entrada| entrada.get("geral"))
        .and_then(Value::as_u64)
        .map(|valor| ValorExpressao::Numero(valor as f64))
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_prova_paulista_disciplina(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let Some(disciplina) = parametro else {
        return ValorExpressao::Nulo;
    };
    valor_prova_paulista_bimestre(ctx)
        .and_then(|entrada| entrada.get("disciplinas"))
        .and_then(Value::as_object)
        .and_then(|mapa| mapa.get(disciplina))
        .and_then(Value::as_u64)
        .map(|valor| ValorExpressao::Numero(valor as f64))
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_bimestre_linha(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ValorExpressao::Texto(format!("{}º", ctx.bimestre))
}

fn campo_disciplina_contexto(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    ctx.disciplina_contexto
        .map(|disciplina| ValorExpressao::Texto(disciplina.to_string()))
        .unwrap_or(ValorExpressao::Nulo)
}

/// (total de alunos ativos na turma, quantos já têm nota lançada na
/// disciplina/bimestre da linha agregada atual). Réplica do critério de
/// Pendência de Lançamento (`pendencias.rs`): olha só `medias`, não
/// `ajustes_medias_conselho` — é sobre o mapão, não sobre decisão de
/// conselho.
fn contagem_notas_disciplina(ctx: &ContextoLinha) -> (usize, usize) {
    let Some(disciplina) = ctx.disciplina_contexto else {
        return (0, 0);
    };
    let Some(alunos) = &ctx.turma.alunos else {
        return (0, 0);
    };
    let mut total_ativos = 0usize;
    let mut lancadas = 0usize;
    for aluno in alunos.values() {
        if !aluno.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
            continue;
        }
        total_ativos += 1;
        let tem_nota = objeto_bimestre(aluno, "medias", ctx.bimestre)
            .and_then(|mapa| mapa.get(disciplina))
            .and_then(valor_para_f64)
            .is_some();
        if tem_nota {
            lancadas += 1;
        }
    }
    (total_ativos, lancadas)
}

fn campo_total_ativos_disciplina(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let (total, _) = contagem_notas_disciplina(ctx);
    ValorExpressao::Numero(total as f64)
}

fn campo_notas_lancadas_disciplina(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let (_, lancadas) = contagem_notas_disciplina(ctx);
    ValorExpressao::Numero(lancadas as f64)
}

fn campo_faltam_lancar_disciplina(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let (total, lancadas) = contagem_notas_disciplina(ctx);
    ValorExpressao::Numero((total - lancadas) as f64)
}

// ── Elegibilidade para recuperação ──────────────────────────────────────────
// Levantamento compartilhado entre os campos "por aluno" abaixo (lista de
// elegíveis) e a coleção de fan-out `sugestoes_substituicao_recuperacao`
// (colecoes.rs) — os dois precisam do mesmo cálculo de % de notas vermelhas
// e dos mesmos pares de bimestre 1↔2/3↔4, então fica num só lugar. Réplica
// de `levantar_elegiveis_recuperacao_turma` (docx.rs:815-978).

pub(crate) struct LevantamentoRecuperacao {
    pub(crate) total_notas: usize,
    pub(crate) notas_vermelhas: usize,
    pub(crate) disciplinas_vermelhas_fmt: Vec<String>,
    pub(crate) notas_par_1_2: BTreeMap<String, (Option<f64>, Option<f64>)>,
    pub(crate) notas_par_3_4: BTreeMap<String, (Option<f64>, Option<f64>)>,
}

impl LevantamentoRecuperacao {
    pub(crate) fn percentual_vermelhas(&self) -> Option<f64> {
        if self.total_notas == 0 {
            None
        } else {
            Some(self.notas_vermelhas as f64 / self.total_notas as f64 * 100.0)
        }
    }
}

pub(crate) fn levantar_recuperacao_aluno(aluno: &Value, nota_minima: f64) -> LevantamentoRecuperacao {
    let mut total_notas = 0usize;
    let mut notas_vermelhas = 0usize;
    let mut disciplinas_vermelhas_mapa: std::collections::BTreeMap<String, Vec<&str>> = BTreeMap::new();
    let mut notas_par_1_2: BTreeMap<String, (Option<f64>, Option<f64>)> = BTreeMap::new();
    let mut notas_par_3_4: BTreeMap<String, (Option<f64>, Option<f64>)> = BTreeMap::new();

    for bimestre in ["1", "2", "3", "4"] {
        let medias = objeto_bimestre(aluno, "medias", bimestre);
        let ajustes = objeto_bimestre(aluno, "ajustes_medias_conselho", bimestre);
        let mut disciplinas = std::collections::BTreeSet::new();
        if let Some(medias) = medias {
            disciplinas.extend(medias.keys().cloned());
        }
        if let Some(ajustes) = ajustes {
            disciplinas.extend(ajustes.keys().cloned());
        }

        for disciplina in disciplinas {
            let Some(nota) = nota_vigente_disciplina(aluno, bimestre, &disciplina) else {
                continue;
            };
            total_notas += 1;
            if nota < nota_minima {
                notas_vermelhas += 1;
                disciplinas_vermelhas_mapa
                    .entry(formatar_rotulo_turma_texto(&disciplina))
                    .or_default()
                    .push(bimestre);
            }

            let (mapa, posicao) = match bimestre {
                "1" => (&mut notas_par_1_2, 0),
                "2" => (&mut notas_par_1_2, 1),
                "3" => (&mut notas_par_3_4, 0),
                _ => (&mut notas_par_3_4, 1),
            };
            let entrada = mapa.entry(disciplina.clone()).or_insert((None, None));
            if posicao == 0 {
                entrada.0 = Some(nota);
            } else {
                entrada.1 = Some(nota);
            }
        }
    }

    let disciplinas_vermelhas_fmt = disciplinas_vermelhas_mapa
        .into_iter()
        .map(|(disciplina, bimestres)| format!("{disciplina} ({})", formatar_bimestres_lista(&bimestres)))
        .collect();

    LevantamentoRecuperacao {
        total_notas,
        notas_vermelhas,
        disciplinas_vermelhas_fmt,
        notas_par_1_2,
        notas_par_3_4,
    }
}

fn campo_recuperacao_total_notas(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    ValorExpressao::Numero(levantar_recuperacao_aluno(aluno, ctx.nota_minima).total_notas as f64)
}

fn campo_recuperacao_notas_vermelhas(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    ValorExpressao::Numero(levantar_recuperacao_aluno(aluno, ctx.nota_minima).notas_vermelhas as f64)
}

fn campo_recuperacao_percentual_vermelhas(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    levantar_recuperacao_aluno(aluno, ctx.nota_minima)
        .percentual_vermelhas()
        .map(ValorExpressao::Numero)
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_recuperacao_disciplinas_vermelhas(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let lista = levantar_recuperacao_aluno(aluno, ctx.nota_minima).disciplinas_vermelhas_fmt;
    if lista.is_empty() {
        ValorExpressao::Texto("-".to_string())
    } else {
        ValorExpressao::Texto(lista.join(", "))
    }
}

// ---- Expansão (online) ----
// Ver o comentário no bloco de CAMPOS acima para as duas regras que todo
// extrator abaixo segue (isolamento por bimestre; Nulo em vez de 0.0).

struct SnapshotExpansao<'a> {
    /// Chave do snapshot ("AAAA-MM-DD" — a data da exportação, não de hoje).
    data: &'a str,
    bimestre: Option<&'a str>,
    nota: Option<f64>,
    progresso: Option<f64>,
    ultimo_acesso: Option<NaiveDate>,
    turma_origem: Option<&'a str>,
}

/// Snapshots do aluno em ordem cronológica — a ordem vem de graça da chave
/// ISO ("AAAA-MM-DD") + serde_json::Map ser BTreeMap (sem preserve_order no
/// Cargo.toml, ver Cargo.toml). Formato gravado em importador_expansoes.rs.
fn snapshots_expansao(aluno: &Value) -> Vec<SnapshotExpansao<'_>> {
    let Some(snaps) = aluno.get("expansao_online").and_then(|env| env.get("snapshots")).and_then(Value::as_object)
    else {
        return Vec::new();
    };
    snaps
        .iter()
        .map(|(data, snap)| SnapshotExpansao {
            data,
            bimestre: snap.get("bimestre").and_then(Value::as_str),
            nota: snap.get("nota").and_then(Value::as_f64),
            progresso: snap.get("progresso").and_then(Value::as_f64),
            ultimo_acesso: snap
                .get("ultimo_acesso")
                .and_then(Value::as_str)
                .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok()),
            turma_origem: snap.get("turma_origem").and_then(Value::as_str),
        })
        .collect()
}

/// Snapshot mais recente (por data) cujo bimestre bate com `bimestre` — é o
/// que ancora todo campo "atual": nunca mostra dado de outro bimestre.
fn ultimo_snapshot_do_bimestre<'a>(
    snapshots: &'a [SnapshotExpansao<'a>],
    bimestre: &str,
) -> Option<&'a SnapshotExpansao<'a>> {
    snapshots.iter().rev().find(|s| s.bimestre == Some(bimestre))
}

/// Diferença entre a última importação e a penúltima (qualquer bimestre),
/// só reportada quando a mais recente já é do bimestre pedido — senão a
/// "variação recente" de um aluno sem import neste bimestre mostraria o
/// salto do bimestre anterior como se fosse dele.
fn delta_recente(
    snapshots: &[SnapshotExpansao],
    bimestre: &str,
    campo: impl Fn(&SnapshotExpansao) -> Option<f64>,
) -> Option<f64> {
    if snapshots.len() < 2 {
        return None;
    }
    let ultimo = &snapshots[snapshots.len() - 1];
    if ultimo.bimestre != Some(bimestre) {
        return None;
    }
    let penultimo = &snapshots[snapshots.len() - 2];
    Some(campo(ultimo)? - campo(penultimo)?)
}

/// Variação dentro do bimestre: ultimo−primeiro entre os snapshots daquele
/// bimestre. Com um único snapshot no bimestre, usa como base a medição
/// imediatamente anterior a ele (de qualquer bimestre — é a única correta,
/// já que datas são cronológicas e só há 1 ponto neste bimestre) em vez de
/// devolver 0, que classificaria como estagnado um aluno que só ainda não
/// foi reimportado desde o fechamento do bimestre anterior.
fn delta_bimestre(
    snapshots: &[SnapshotExpansao],
    bimestre: &str,
    campo: impl Fn(&SnapshotExpansao) -> Option<f64>,
) -> Option<f64> {
    let indices: Vec<usize> =
        snapshots.iter().enumerate().filter(|(_, s)| s.bimestre == Some(bimestre)).map(|(i, _)| i).collect();
    match indices.len() {
        0 => None,
        1 => {
            let idx = indices[0];
            if idx == 0 {
                return None;
            }
            Some(campo(&snapshots[idx])? - campo(&snapshots[idx - 1])?)
        }
        _ => {
            let primeiro = *indices.first()?;
            let ultimo = *indices.last()?;
            Some(campo(&snapshots[ultimo])? - campo(&snapshots[primeiro])?)
        }
    }
}

fn campo_expansao_progresso_atual(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    ultimo_snapshot_do_bimestre(&snapshots, ctx.bimestre)
        .and_then(|s| s.progresso)
        .map(ValorExpressao::Numero)
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_expansao_nota_atual(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    ultimo_snapshot_do_bimestre(&snapshots, ctx.bimestre)
        .and_then(|s| s.nota)
        .map(ValorExpressao::Numero)
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_expansao_progresso_delta_recente(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    delta_recente(&snapshots, ctx.bimestre, |s| s.progresso).map(ValorExpressao::Numero).unwrap_or(ValorExpressao::Nulo)
}

fn campo_expansao_nota_delta_recente(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    delta_recente(&snapshots, ctx.bimestre, |s| s.nota).map(ValorExpressao::Numero).unwrap_or(ValorExpressao::Nulo)
}

fn campo_expansao_progresso_delta_bimestre(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    delta_bimestre(&snapshots, ctx.bimestre, |s| s.progresso).map(ValorExpressao::Numero).unwrap_or(ValorExpressao::Nulo)
}

fn campo_expansao_nota_delta_bimestre(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    delta_bimestre(&snapshots, ctx.bimestre, |s| s.nota).map(ValorExpressao::Numero).unwrap_or(ValorExpressao::Nulo)
}

/// Ancorado em "hoje" (Local::now()), não na data da importação: a
/// pergunta que este campo responde é "há quantos dias, a partir de agora,
/// o aluno não acessa" — ancorar na importação tornaria a coluna
/// incomparável entre alunos vindos de arquivos importados em dias
/// diferentes. Contrapartida aceita: o relatório não é reproduzível ao
/// regerar depois (mesmo comportamento de "Gerado em" nos renderers).
fn campo_expansao_dias_sem_acesso(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    let Some(ultimo_acesso) = ultimo_snapshot_do_bimestre(&snapshots, ctx.bimestre).and_then(|s| s.ultimo_acesso)
    else {
        return ValorExpressao::Nulo;
    };
    let dias = (Local::now().date_naive() - ultimo_acesso).num_days();
    ValorExpressao::Numero(dias.max(0) as f64)
}

fn campo_expansao_ultimo_acesso(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    ultimo_snapshot_do_bimestre(&snapshots, ctx.bimestre)
        .and_then(|s| s.ultimo_acesso)
        .map(|data| ValorExpressao::Texto(data.format("%d/%m/%Y").to_string()))
        .unwrap_or(ValorExpressao::Nulo)
}

fn campo_expansao_data_ultima_importacao(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    let Some(snapshot) = ultimo_snapshot_do_bimestre(&snapshots, ctx.bimestre) else { return ValorExpressao::Nulo };
    NaiveDate::parse_from_str(snapshot.data, "%Y-%m-%d")
        .ok()
        .map(|data| ValorExpressao::Texto(data.format("%d/%m/%Y").to_string()))
        .unwrap_or(ValorExpressao::Nulo)
}

/// Contagem, não presença: 0 é resposta legítima aqui (aluno existe, mas
/// não foi importado neste bimestre ainda) — só quando não há linha de
/// aluno nenhuma (ctx.aluno == None) é que o campo devolve Nulo.
fn campo_expansao_qtd_importacoes_bimestre(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    let qtd = snapshots.iter().filter(|s| s.bimestre == Some(ctx.bimestre)).count();
    ValorExpressao::Numero(qtd as f64)
}

fn campo_expansao_turma_origem(ctx: &ContextoLinha, _parametro: Option<&str>) -> ValorExpressao {
    let Some(aluno) = ctx.aluno else { return ValorExpressao::Nulo };
    let snapshots = snapshots_expansao(aluno);
    snapshots
        .last()
        .and_then(|s| s.turma_origem)
        .map(|turma| ValorExpressao::Texto(turma.to_string()))
        .unwrap_or(ValorExpressao::Nulo)
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    fn turma_fixture() -> TurmaArquivo {
        serde_json::from_value(json!({ "codigo": "1A", "ano": 2026, "alunos": {} })).unwrap()
    }

    fn ctx_fixture<'a>(turma: &'a TurmaArquivo, aluno: &'a Value, bimestre: &'a str, parametros: &'a BTreeMap<String, ValorExpressao>) -> ContextoLinha<'a> {
        ContextoLinha {
            turma,
            matricula: None,
            aluno: Some(aluno),
            bimestre,
            nota_minima: 5.0,
            disciplina_contexto: None,
            item: None,
            parametros,
        }
    }

    /// O aluno só tem snapshot do bimestre 3; pedir "atual" no bimestre 2
    /// não pode devolver o valor do 3 — mostraria o número errado numa
    /// linha rotulada com o bimestre errado.
    #[test]
    fn progresso_atual_de_outro_bimestre_nao_vaza_para_a_linha() {
        let turma = turma_fixture();
        let aluno = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "bimestre": "3", "progresso": 80.0, "nota": 5.28 } }
            }
        });
        let parametros = BTreeMap::new();
        let ctx = ctx_fixture(&turma, &aluno, "2", &parametros);
        assert_eq!(campo_expansao_progresso_atual(&ctx, None), ValorExpressao::Nulo);

        let ctx3 = ctx_fixture(&turma, &aluno, "3", &parametros);
        assert_eq!(campo_expansao_progresso_atual(&ctx3, None), ValorExpressao::Numero(80.0));
    }

    /// Sem um segundo snapshot para comparar, a variação recente tem que
    /// ser Nulo — nunca 0.0, que tornaria "sem dado" indistinguível de
    /// "estagnado" (a distinção que este campo existe para dar).
    #[test]
    fn delta_recente_e_nulo_sem_historico_suficiente() {
        let turma = turma_fixture();
        let aluno = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "bimestre": "3", "progresso": 80.0 } }
            }
        });
        let parametros = BTreeMap::new();
        let ctx = ctx_fixture(&turma, &aluno, "3", &parametros);
        assert_eq!(campo_expansao_progresso_delta_recente(&ctx, None), ValorExpressao::Nulo);
    }

    /// A variação recente só é reportada quando a importação mais recente
    /// do aluno já é do bimestre pedido — senão o salto do bimestre
    /// anterior apareceria como se fosse variação do bimestre atual.
    #[test]
    fn delta_recente_e_nulo_quando_o_ultimo_snapshot_e_de_outro_bimestre() {
        let turma = turma_fixture();
        let aluno = json!({
            "expansao_online": {
                "snapshots": {
                    "2026-06-01": { "bimestre": "2", "progresso": 50.0 },
                    "2026-08-25": { "bimestre": "3", "progresso": 80.0 }
                }
            }
        });
        let parametros = BTreeMap::new();
        // pedindo o bimestre 2, mas o snapshot mais recente já é do 3
        let ctx = ctx_fixture(&turma, &aluno, "2", &parametros);
        assert_eq!(campo_expansao_progresso_delta_recente(&ctx, None), ValorExpressao::Nulo);
    }

    /// Com um único snapshot no bimestre, a base da variação é a medição
    /// imediatamente anterior (de qualquer bimestre) — não 0. Sem isso, um
    /// aluno que avançou 30 p.p. desde o fechamento do bimestre anterior
    /// apareceria como estagnado só por ainda não ter uma segunda
    /// importação dentro do bimestre atual.
    #[test]
    fn delta_bimestre_com_um_unico_snapshot_usa_a_medicao_anterior_como_base() {
        let turma = turma_fixture();
        let aluno = json!({
            "expansao_online": {
                "snapshots": {
                    "2026-06-01": { "bimestre": "2", "progresso": 50.0 },
                    "2026-08-25": { "bimestre": "3", "progresso": 80.0 }
                }
            }
        });
        let parametros = BTreeMap::new();
        let ctx = ctx_fixture(&turma, &aluno, "3", &parametros);
        assert_eq!(campo_expansao_progresso_delta_bimestre(&ctx, None), ValorExpressao::Numero(30.0));
    }

    /// Um único snapshot no bimestre e nenhuma medição anterior (primeira
    /// importação da vida do aluno): não há base nenhuma para a variação.
    #[test]
    fn delta_bimestre_com_um_snapshot_e_sem_historico_anterior_e_nulo() {
        let turma = turma_fixture();
        let aluno = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "bimestre": "3", "progresso": 80.0 } }
            }
        });
        let parametros = BTreeMap::new();
        let ctx = ctx_fixture(&turma, &aluno, "3", &parametros);
        assert_eq!(campo_expansao_progresso_delta_bimestre(&ctx, None), ValorExpressao::Nulo);
    }

    /// Contagem, não presença: aluno existente sem nenhuma importação no
    /// bimestre pedido é 0 (resposta legítima), não Nulo.
    #[test]
    fn qtd_importacoes_bimestre_devolve_zero_quando_aluno_existe_sem_import_no_bimestre() {
        let turma = turma_fixture();
        let aluno = json!({
            "expansao_online": {
                "snapshots": { "2026-06-01": { "bimestre": "2", "progresso": 50.0 } }
            }
        });
        let parametros = BTreeMap::new();
        let ctx = ctx_fixture(&turma, &aluno, "3", &parametros);
        assert_eq!(campo_expansao_qtd_importacoes_bimestre(&ctx, None), ValorExpressao::Numero(0.0));
    }

    #[test]
    fn aluno_sem_expansao_online_devolve_nulo_em_todos_os_campos() {
        let turma = turma_fixture();
        let aluno = json!({ "nome": "SEM EXPANSAO" });
        let parametros = BTreeMap::new();
        let ctx = ctx_fixture(&turma, &aluno, "3", &parametros);
        assert_eq!(campo_expansao_progresso_atual(&ctx, None), ValorExpressao::Nulo);
        assert_eq!(campo_expansao_nota_atual(&ctx, None), ValorExpressao::Nulo);
        assert_eq!(campo_expansao_dias_sem_acesso(&ctx, None), ValorExpressao::Nulo);
        assert_eq!(campo_expansao_qtd_importacoes_bimestre(&ctx, None), ValorExpressao::Numero(0.0));
    }

    /// Prova que os 11 ids de expansão realmente entraram no catálogo — o
    /// construtor visual e o executor só enxergam um campo por id, então um
    /// id digitado errado no array CAMPOS falharia silenciosamente (o
    /// avaliador de expressão devolve Nulo pra id desconhecido, não erro).
    #[test]
    fn todos_os_campos_de_expansao_estao_registrados_no_catalogo() {
        for id in [
            "expansao_progresso_atual",
            "expansao_nota_atual",
            "expansao_progresso_delta_recente",
            "expansao_nota_delta_recente",
            "expansao_progresso_delta_bimestre",
            "expansao_nota_delta_bimestre",
            "expansao_dias_sem_acesso",
            "expansao_ultimo_acesso",
            "expansao_data_ultima_importacao",
            "expansao_qtd_importacoes_bimestre",
            "expansao_turma_origem",
        ] {
            assert!(buscar_campo(id).is_some(), "campo {id} deveria estar registrado em CAMPOS");
            assert_eq!(buscar_campo(id).unwrap().categoria, CategoriaCampo::Expansoes);
        }
    }
}
