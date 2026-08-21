// Tipos TypeScript espelhando exatamente o schema Rust do motor de
// relatórios (motor_relatorios/{definicao,expressoes,campos}.rs) — é o que
// o construtor visual lê/escreve e manda pro backend via
// salvar_definicao_relatorio/executar_relatorio_generico/
// pre_visualizar_relatorio. Qualquer mudança de forma aqui tem que
// acompanhar o `#[derive(Serialize, Deserialize)]` do lado Rust.

export type ValorExpressao =
  | { tipo: "texto"; valor: string }
  | { tipo: "numero"; valor: number }
  | { tipo: "booleano"; valor: boolean }
  | { tipo: "nulo" };

export type OperadorAritmetico = "soma" | "subtracao" | "multiplicacao" | "divisao";
export type OperadorComparacao = "igual" | "diferente" | "maior" | "maior_igual" | "menor" | "menor_igual";
export type OperadorLogico = "e" | "ou" | "nao";
export type FuncaoExpressao = "arredondar" | "concatenar";

export type ExpressaoNo =
  | { tipo: "campo"; campo_id: string; parametro?: string | null }
  | { tipo: "item_atual"; chave: string }
  | { tipo: "parametro"; id: string }
  | { tipo: "literal"; valor: ValorExpressao }
  | { tipo: "aritmetica"; operador: OperadorAritmetico; esquerda: ExpressaoNo; direita: ExpressaoNo }
  | { tipo: "comparacao"; operador: OperadorComparacao; esquerda: ExpressaoNo; direita: ExpressaoNo }
  | { tipo: "logica"; operador: OperadorLogico; valores: ExpressaoNo[] }
  | { tipo: "se"; condicao: ExpressaoNo; entao: ExpressaoNo; senao: ExpressaoNo }
  | { tipo: "funcao"; nome: FuncaoExpressao; argumentos: ExpressaoNo[] };

// Operador de FiltroCondicao (definicao.rs::Operador) — parecido com
// OperadorComparacao, mas com mais opções (Contém/Vazio/NãoVazio) e nomes
// próprios; são enums Rust diferentes, não confundir.
export type OperadorFiltro =
  | "igual"
  | "diferente"
  | "maior"
  | "maior_igual"
  | "menor"
  | "menor_igual"
  | "contem"
  | "vazio"
  | "nao_vazio";

export type Combinador = "e" | "ou";
export type Alinhamento = "esquerda" | "centro" | "direita";
export type TipoParametro = "numero" | "texto";
export type FormatoSaida = "docx" | "xlsx" | "csv" | "pdf";

export type FiltroTurmas = {
  series: string[];
  periodos: string[];
  ciclos: string[];
  codigos: string[];
};

export type FiltroCondicao = {
  campo: ExpressaoNo;
  operador: OperadorFiltro;
  valor?: ExpressaoNo | null;
};

export type GrupoFiltros = {
  combinador: Combinador;
  condicoes: FiltroCondicao[];
};

export type ColunaRelatorio = {
  id: string;
  rotulo: string;
  expressao: ExpressaoNo;
  largura?: number | null;
  alinhamento: Alinhamento;
};

export type OrdenacaoRelatorio = {
  coluna_id: string;
  decrescente: boolean;
};

export type AgrupamentoRelatorio = {
  campo?: ExpressaoNo | null;
  limite_por_grupo?: number | null;
  // Id de um DefinicaoParametro numérico que, quando presente, vale mais que
  // limite_por_grupo na hora de gerar — é o que torna um "Top N" ajustável
  // (ex.: Top 60 virar Top 20) sem editar a definição do relatório.
  limite_parametro?: string | null;
  ordem_grupos?: string[] | null;
};

// FonteLinhas só é criada pelo backend (relatórios embutidos com fan-out ou
// linha agregada) — o construtor visual sempre cria/edita "por_aluno", mas
// precisa reconhecer as outras formas pra não quebrar ao abrir um
// relatório embutido pra visualizar/exportar.
export type FonteLinhas = { tipo: "por_aluno" } | { tipo: "por_aluno_e_item"; colecao: string } | { tipo: "por_turma_disciplina" };

export type DefinicaoParametro = {
  id: string;
  rotulo: string;
  tipo: TipoParametro;
  valor_padrao: ValorExpressao;
};

export type SecaoRelatorio = {
  titulo?: string | null;
  fonte_linhas: FonteLinhas;
  filtros: GrupoFiltros;
  colunas: ColunaRelatorio[];
  ordenacao: OrdenacaoRelatorio[];
  agrupamento: AgrupamentoRelatorio;
};

// Espelha ConteudoBloco (motor_relatorios/definicao.rs) — o construtor de
// blocos novo. "tabela" só guarda `secao_index`: quem carrega filtros,
// colunas etc. continua sendo a SecaoRelatorio correspondente em
// `ReportDefinition.secoes`, no mesmo índice.
export type ConteudoBloco =
  | { tipo: "cabecalho" }
  | { tipo: "texto"; titulo?: string | null; corpo: string }
  | { tipo: "tabela"; secao_index: number }
  | { tipo: "quebra_pagina" }
  | { tipo: "assinaturas"; nomes: string[] }
  | { tipo: "parametros" };

export type TipoBloco = ConteudoBloco["tipo"];

export type BlocoRelatorio = {
  id: string;
  ativo: boolean;
} & ConteudoBloco;

export type ReportDefinition = {
  id: string;
  nome: string;
  descricao: string;
  // Nome de quem publicou — só usado pra crédito no Repositório de relatórios.
  autor?: string | null;
  embutido: boolean;
  fonte: FiltroTurmas;
  parametros: DefinicaoParametro[];
  secoes: SecaoRelatorio[];
  blocos: BlocoRelatorio[];
  formato_saida: FormatoSaida;
};

// Espelha repositorio.rs — um item listado na tela "Repositório de
// relatórios", vindo do repositório GitHub público do projeto.
export type CategoriaRepositorio = "oficial" | "comunidade";

export type ItemRepositorio = {
  caminho: string;
  categoria: CategoriaRepositorio;
  nome: string;
  descricao: string;
  autor?: string | null;
  formato_saida: FormatoSaida;
};

export type CampoRelatorioInfo = {
  id: string;
  rotulo: string;
  categoria: "aluno" | "turma" | "notas" | "frequencia" | "configuracao";
  tipo: "texto" | "numero" | "percentual" | "booleano";
  requer_parametro: boolean;
};

export type SecaoPreview = {
  titulo?: string | null;
  colunas: { id: string; rotulo: string }[];
  linhas: string[][];
  total_linhas: number;
};

let contadorId = 0;
/** Gera um id local curto e único, só pra usar como `key` do React em listas
 * que ainda não têm um id "de negócio" estável (ex.: condição de filtro
 * recém-criada, antes de qualquer coisa que a identifique). */
export function idLocal(prefixo: string): string {
  contadorId += 1;
  return `${prefixo}_${Date.now().toString(36)}_${contadorId}`;
}

export function valorExpressaoParaTexto(valor: ValorExpressao): string {
  switch (valor.tipo) {
    case "texto":
      return valor.valor;
    case "numero":
      return String(valor.valor);
    case "booleano":
      return valor.valor ? "true" : "false";
    case "nulo":
      return "";
  }
}

export function literalDeTexto(tipo: "texto" | "numero" | "booleano", texto: string): ValorExpressao {
  if (tipo === "numero") return { tipo: "numero", valor: Number(texto) || 0 };
  if (tipo === "booleano") return { tipo: "booleano", valor: texto === "true" };
  return { tipo: "texto", valor: texto };
}
