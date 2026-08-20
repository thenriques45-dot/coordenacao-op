// Esquema declarativo de um relatório: o que o construtor visual edita e o
// que fica salvo em disco (dados/relatorios_personalizados/*.json). Todo
// relatório — embutido ou personalizado — é uma ReportDefinition executada
// pelo mesmo motor genérico (ver executor.rs).

use serde::{Deserialize, Serialize};

use super::expressoes::{ExpressaoNo, ValorExpressao};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum FormatoSaida {
    Docx,
    Xlsx,
    Csv,
    Pdf,
}

/// Filtro de quais turmas entram no relatório. Listas vazias = "sem
/// restrição nesse eixo"; os três primeiros eixos são combinados com E,
/// `codigos` (turmas específicas) restringe ainda mais quando não vazio.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct FiltroTurmas {
    #[serde(default)]
    pub(crate) series: Vec<String>,
    #[serde(default)]
    pub(crate) periodos: Vec<String>,
    #[serde(default)]
    pub(crate) ciclos: Vec<String>,
    #[serde(default)]
    pub(crate) codigos: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Operador {
    Igual,
    Diferente,
    Maior,
    MaiorIgual,
    Menor,
    MenorIgual,
    Contem,
    Vazio,
    NaoVazio,
}

/// `valor` é uma expressão (não só um literal fixo) para permitir comparar
/// campo com campo — ex.: "média do bimestre" < "nota mínima configurada",
/// onde os dois lados são dinâmicos, não um número fixo escrito na definição.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FiltroCondicao {
    pub(crate) campo: ExpressaoNo,
    pub(crate) operador: Operador,
    #[serde(default)]
    pub(crate) valor: Option<ExpressaoNo>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Combinador {
    E,
    Ou,
}

impl Default for Combinador {
    fn default() -> Self {
        Combinador::E
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct GrupoFiltros {
    #[serde(default)]
    pub(crate) combinador: Combinador,
    #[serde(default)]
    pub(crate) condicoes: Vec<FiltroCondicao>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Alinhamento {
    Esquerda,
    Centro,
    Direita,
}

impl Default for Alinhamento {
    fn default() -> Self {
        Alinhamento::Centro
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ColunaRelatorio {
    pub(crate) id: String,
    pub(crate) rotulo: String,
    pub(crate) expressao: ExpressaoNo,
    #[serde(default)]
    pub(crate) largura: Option<i32>,
    #[serde(default)]
    pub(crate) alinhamento: Alinhamento,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OrdenacaoRelatorio {
    pub(crate) coluna_id: String,
    #[serde(default)]
    pub(crate) decrescente: bool,
}

/// Agrupamento opcional das linhas (ex.: um bloco por período, um bloco por
/// turma). `limite_por_grupo` cobre o caso "Top N por grupo" (ex.: Top 60);
/// `ordem_grupos` permite fixar a ordem dos blocos em vez de alfabética
/// (ex.: Manhã/Tarde/Noite em vez de Manhã/Noite/Tarde).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(crate) struct AgrupamentoRelatorio {
    #[serde(default)]
    pub(crate) campo: Option<ExpressaoNo>,
    #[serde(default)]
    pub(crate) limite_por_grupo: Option<usize>,
    #[serde(default)]
    pub(crate) ordem_grupos: Option<Vec<String>>,
}

/// Como as linhas de uma seção são geradas a partir dos dados de uma turma.
/// `PorAluno` é o padrão (comportamento original do motor: 1 linha por
/// aluno ativo). As outras duas cobrem formas de relatório que não são "uma
/// linha por aluno": fan-out (uma sub-coleção do aluno vira várias linhas,
/// ex.: uma por disciplina alterada no conselho) e agregação (a linha é
/// sobre turma×disciplina×bimestre, computada varrendo todos os alunos, não
/// sobre um aluno específico).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub(crate) enum FonteLinhas {
    PorAluno,
    PorAlunoEItem { colecao: String },
    PorTurmaDisciplina,
}

impl Default for FonteLinhas {
    fn default() -> Self {
        FonteLinhas::PorAluno
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TipoParametro {
    Numero,
    Texto,
}

/// Um "parâmetro de execução": igual ao bimestre (que toda tela de
/// relatório já pede antes de gerar), mas declarado pela própria
/// ReportDefinition em vez de ser hardcoded no motor. Qualquer filtro ou
/// coluna pode referenciar o valor via `ExpressaoNo::Parametro`; a UI
/// desenha um campo de entrada por parâmetro declarado, pré-preenchido com
/// `valor_padrao`, antes do botão "Gerar relatório".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct DefinicaoParametro {
    pub(crate) id: String,
    pub(crate) rotulo: String,
    pub(crate) tipo: TipoParametro,
    pub(crate) valor_padrao: ValorExpressao,
}

/// Uma tabela dentro do relatório. A maioria dos relatórios tem uma seção
/// só; relatórios como "Elegíveis à Recuperação" têm duas (lista de
/// elegíveis + lista de sugestões de troca de nota), com fontes de linha e
/// colunas completamente diferentes entre si.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SecaoRelatorio {
    #[serde(default)]
    pub(crate) titulo: Option<String>,
    #[serde(default)]
    pub(crate) fonte_linhas: FonteLinhas,
    #[serde(default)]
    pub(crate) filtros: GrupoFiltros,
    pub(crate) colunas: Vec<ColunaRelatorio>,
    #[serde(default)]
    pub(crate) ordenacao: Vec<OrdenacaoRelatorio>,
    #[serde(default)]
    pub(crate) agrupamento: AgrupamentoRelatorio,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ReportDefinition {
    pub(crate) id: String,
    pub(crate) nome: String,
    #[serde(default)]
    pub(crate) descricao: String,
    /// Relatórios embutidos (Top 60, Educação Física, etc.) vêm com o app e
    /// não podem ser apagados — só duplicados para customizar. Relatórios do
    /// usuário são sempre `false`.
    #[serde(default)]
    pub(crate) embutido: bool,
    pub(crate) fonte: FiltroTurmas,
    #[serde(default)]
    pub(crate) parametros: Vec<DefinicaoParametro>,
    pub(crate) secoes: Vec<SecaoRelatorio>,
    pub(crate) formato_saida: FormatoSaida,
}
