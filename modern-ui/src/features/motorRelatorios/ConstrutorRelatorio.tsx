// Construtor visual de relatórios: editor de blocos (estilo WordPress) em
// cima de uma ReportDefinition — cabeçalho/texto/tabela/quebra de
// página/assinaturas/parâmetros, cada um um bloco que se liga/desliga,
// reordena e configura sozinho. Quem faz o trabalho pesado continua sendo
// o EditorExpressao/motor de relatórios; esta tela só reorganiza a
// experiência de montagem — ver `BlocoRelatorio`/`ConteudoBloco` em tipos.ts
// e o handoff de design em dados de referência do projeto.
//
// Um bloco "Tabela" não carrega sua própria configuração: ele só aponta
// (`secao_index`) pra uma `SecaoRelatorio` em `definicao.secoes`, que é
// quem o motor realmente executa. Isso preserva o schema/execução de
// sempre — só a composição do documento é nova.
//
// Relatórios com seções que não são "por aluno" (fan-out, agregação) ainda
// não têm bloco correspondente — continuam só visualizáveis/exportáveis,
// como antes.

import { save as salvarDialogoArquivo, open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import {
  AlignVerticalSpaceAround,
  BarChart3,
  FileDown,
  FileUp,
  Heading,
  LayoutGrid,
  PenLine,
  SeparatorHorizontal,
  Settings2,
  Table as TableIcon,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { invokeApp } from "../appBridge";
import { ListaOrdenavel } from "../ListaOrdenavel";
import { EditorExpressao } from "./EditorExpressao";
import {
  Alinhamento,
  BlocoRelatorio,
  CampoRelatorioInfo,
  ColunaRelatorio,
  DefinicaoParametro,
  ExpressaoNo,
  FiltroCondicao,
  FormatoSaida,
  OperadorFiltro,
  OrdenacaoRelatorio,
  ReportDefinition,
  SecaoPreview,
  SecaoRelatorio,
  TipoBloco,
  TipoParametro,
  ValorExpressao,
  idLocal,
  valorExpressaoParaTexto,
} from "./tipos";

const PERIODOS_DISPONIVEIS = ["MANHA", "TARDE", "NOITE", "INTEGRAL"];
const CICLOS_DISPONIVEIS = ["EI", "EFAI", "EFAF", "EM"];

const ROTULOS_PERIODO: Record<string, string> = { MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite", INTEGRAL: "Integral" };
const ROTULOS_CICLO: Record<string, string> = { EI: "Ed. Infantil", EFAI: "Anos iniciais", EFAF: "Anos finais", EM: "Ens. médio" };

const ROTULOS_OPERADOR_FILTRO: Record<OperadorFiltro, string> = {
  igual: "é igual a",
  diferente: "é diferente de",
  maior: "é maior que",
  maior_igual: "é maior ou igual a",
  menor: "é menor que",
  menor_igual: "é menor ou igual a",
  contem: "contém",
  vazio: "está vazio",
  nao_vazio: "não está vazio",
};

const ROTULOS_FORMATO: Record<FormatoSaida, string> = {
  docx: "Word (.docx)",
  xlsx: "Excel (.xlsx)",
  csv: "Planilha simples (.csv)",
  pdf: "PDF (.pdf)",
};

type ItemBiblioteca =
  | { tipo: TipoBloco; icone: LucideIcon; titulo: string; descricao: string; emBreve?: false }
  | { tipo: null; icone: LucideIcon; titulo: string; descricao: string; emBreve: true };

const BIBLIOTECA: ItemBiblioteca[] = [
  { tipo: "cabecalho", icone: Heading, titulo: "Cabeçalho institucional", descricao: "Nome da escola e bimestre no topo" },
  { tipo: "texto", icone: Type, titulo: "Título e texto", descricao: "Parágrafo introdutório ou observações" },
  { tipo: "tabela", icone: TableIcon, titulo: "Tabela de alunos", descricao: "Uma linha por aluno, colunas à sua escolha" },
  { tipo: null, icone: LayoutGrid, titulo: "Indicadores", descricao: "Números-resumo em destaque — em breve", emBreve: true },
  { tipo: null, icone: BarChart3, titulo: "Gráfico de barras", descricao: "Comparação por turma ou disciplina — em breve", emBreve: true },
  { tipo: "quebra_pagina", icone: SeparatorHorizontal, titulo: "Quebra de página", descricao: "Começa uma nova folha" },
  { tipo: "espacador", icone: AlignVerticalSpaceAround, titulo: "Espaçador", descricao: "Duas linhas em branco entre os itens" },
  { tipo: "assinaturas", icone: PenLine, titulo: "Assinaturas", descricao: "Linhas para direção e coordenação" },
  { tipo: "parametros", icone: Settings2, titulo: "Parâmetros", descricao: "O que a pessoa preenche antes de gerar" },
];

const TIPOS_UNICOS: TipoBloco[] = ["cabecalho", "parametros"];

function iconeParaTipo(tipo: TipoBloco): LucideIcon {
  return BIBLIOTECA.find((item) => item.tipo === tipo)?.icone ?? Type;
}

function tituloParaTipo(tipo: TipoBloco): string {
  return BIBLIOTECA.find((item) => item.tipo === tipo)?.titulo ?? tipo;
}

function campoPadrao(campos: CampoRelatorioInfo[]): ExpressaoNo {
  return { tipo: "campo", campo_id: campos[0]?.id ?? "aluno_nome", parametro: null };
}

/** Rótulo do campo referenciado por uma expressão simples (`{tipo:"campo"}`),
 * usado pra manter o nome da coluna em sincronia com "de onde vem o valor" —
 * `null` quando a expressão não é uma referência direta a um campo (uso
 * avançado), caso em que o rótulo digitado pelo usuário fica intocado. */
function rotuloParaExpressao(expressao: ExpressaoNo, campos: CampoRelatorioInfo[]): string | null {
  if (expressao.tipo !== "campo") return null;
  return campos.find((c) => c.id === expressao.campo_id)?.rotulo ?? null;
}

/** Frase curta pra um filtro elegível a virar parâmetro (ex.: "Nota em
 * Matemática é maior que 5") — usada na listagem do bloco Parâmetros. `null`
 * quando o filtro não é do formato simples campo→operador→valor fixo
 * (uso avançado, continua só acessível pelo próprio filtro). */
function descreverFiltro(condicao: FiltroCondicao, campos: CampoRelatorioInfo[]): string | null {
  const campoNo = condicao.campo;
  if (campoNo.tipo !== "campo") return null;
  const campoInfo = campos.find((c) => c.id === campoNo.campo_id);
  if (!campoInfo) return null;
  const operadorTexto = ROTULOS_OPERADOR_FILTRO[condicao.operador];
  const valorTexto = condicao.valor?.tipo === "literal" ? valorExpressaoParaTexto(condicao.valor.valor) : "";
  return `${campoInfo.rotulo} ${operadorTexto}${valorTexto ? ` ${valorTexto}` : ""}`;
}

function slugificar(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || idLocal("col")
  );
}

function secaoTabelaVazia(): SecaoRelatorio {
  return {
    titulo: null,
    fonte_linhas: { tipo: "por_aluno" },
    filtros: { combinador: "e", condicoes: [] },
    colunas: [],
    ordenacao: [],
    agrupamento: {},
  };
}

function definicaoVazia(): ReportDefinition {
  const idCabecalho = idLocal("blk");
  const idTabela = idLocal("blk");
  return {
    id: idLocal("relatorio"),
    nome: "",
    descricao: "",
    embutido: false,
    fonte: { series: [], periodos: [], ciclos: [], codigos: [] },
    parametros: [],
    secoes: [secaoTabelaVazia()],
    blocos: [
      { id: idCabecalho, ativo: true, tipo: "cabecalho" },
      { id: idTabela, ativo: true, tipo: "tabela", secao_index: 0 },
    ],
    formato_saida: "docx",
  };
}

/** Relatórios salvos antes do construtor de blocos não têm `blocos` — se
 * todas as seções forem "por aluno" (o único caso que este construtor edita),
 * gera um bloco Cabeçalho + um bloco Tabela por seção, preservando os dados
 * exatamente como estavam. Se alguma seção não for "por aluno" (relatório
 * avançado), devolve a definição como veio — cai no aviso de "não editável"
 * de sempre. */
function migrarParaBlocos(definicao: ReportDefinition): ReportDefinition {
  if (definicao.blocos && definicao.blocos.length > 0) return definicao;
  if (definicao.secoes.length === 0) return definicao;
  const todasPorAluno = definicao.secoes.every((secao) => secao.fonte_linhas.tipo === "por_aluno");
  if (!todasPorAluno) return definicao;
  return {
    ...definicao,
    blocos: [
      { id: idLocal("blk"), ativo: true, tipo: "cabecalho" },
      ...definicao.secoes.map((_, indice): BlocoRelatorio => ({ id: idLocal("blk"), ativo: true, tipo: "tabela", secao_index: indice })),
    ],
  };
}

function resumoBloco(bloco: BlocoRelatorio, secoes: SecaoRelatorio[]): string {
  switch (bloco.tipo) {
    case "cabecalho":
      return "Nome da escola e bimestre";
    case "texto":
      return bloco.corpo.trim() ? bloco.corpo.trim().slice(0, 70) : "Sem texto ainda";
    case "tabela": {
      const secao = secoes[bloco.secao_index];
      if (!secao) return "seção não encontrada";
      const partes = [`${secao.colunas.length} coluna${secao.colunas.length === 1 ? "" : "s"}`];
      if (secao.filtros.condicoes.length > 0) {
        partes.push(`${secao.filtros.condicoes.length} condição${secao.filtros.condicoes.length === 1 ? "" : "ões"}`);
      }
      return partes.join(" · ");
    }
    case "quebra_pagina":
      return "Início de uma nova página";
    case "espacador":
      return "Duas linhas em branco";
    case "assinaturas":
      return bloco.nomes.length > 0 ? bloco.nomes.join(", ") : "Nenhum nome ainda";
    case "parametros":
      return "Editado logo abaixo";
  }
}

function substituirVariaveisPreview(texto: string, bimestre: string): string {
  return texto.replace("{bimestre}", `${bimestre}º bimestre`);
}

export function ConstrutorRelatorio({
  definicaoInicial,
  turmas,
  onVoltar,
  onSalvo,
}: {
  definicaoInicial?: ReportDefinition;
  turmas: { codigo: string; serie: string | null }[];
  onVoltar: () => void;
  onSalvo: () => void;
}) {
  const [definicao, setDefinicao] = useState<ReportDefinition>(() => migrarParaBlocos(definicaoInicial ?? definicaoVazia()));
  const [campos, setCampos] = useState<CampoRelatorioInfo[]>([]);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [aba, setAba] = useState<"montar" | "preview">("montar");
  const [selecionado, setSelecionado] = useState<string | null>(definicao.blocos[0]?.id ?? null);
  const [bimestrePreview, setBimestrePreview] = useState("1");
  const [preview, setPreview] = useState<SecaoPreview[] | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [rascunhoSalvoEm, setRascunhoSalvoEm] = useState<string | null>(null);

  useEffect(() => {
    invokeApp<CampoRelatorioInfo[]>("listar_campos_disponiveis")
      .then(setCampos)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
    invokeApp<string[]>("listar_disciplinas_conhecidas")
      .then(setDisciplinas)
      .catch(() => {});
  }, []);

  // Rascunho automático: assim que o relatório tem um nome, qualquer mudança
  // é salva sozinha alguns segundos depois — sem exigir colunas nem validar
  // nada (diferente do botão "Salvar"). Se o coordenador precisar sair da
  // tela no meio do trabalho, o relatório incompleto continua na lista de
  // Relatórios pra retomar depois. Nada é salvo antes de ter nome, pra não
  // encher a lista de rascunhos em branco.
  useEffect(() => {
    if (!definicao.nome.trim()) return;
    const temporizador = setTimeout(() => {
      invokeApp("salvar_definicao_relatorio", { definicao })
        .then(() => setRascunhoSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })))
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(temporizador);
  }, [definicao]);

  const editavel = definicao.blocos.length > 0;
  const seriesConhecidas = Array.from(new Set(turmas.map((t) => t.serie).filter((s): s is string => !!s))).sort();
  const blocoSelecionado = definicao.blocos.find((b) => b.id === selecionado) ?? null;
  const totalBlocosAtivos = definicao.blocos.filter((b) => b.ativo).length;

  async function atualizarPreview() {
    setCarregandoPreview(true);
    try {
      const resultado = await invokeApp<SecaoPreview[]>("pre_visualizar_relatorio", {
        input: { definicao, bimestre: bimestrePreview, parametros: {} },
      });
      setPreview(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregandoPreview(false);
    }
  }

  useEffect(() => {
    if (aba === "preview" && editavel) {
      atualizarPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, bimestrePreview]);

  // Aceita tanto um objeto quanto uma função — a função recebe a seção mais
  // atual (de dentro do updater do setState), não a que estava no closure no
  // momento do clique. Isso importa porque `adicionarColuna`/`adicionarFiltro`/
  // `adicionarOrdenacao` fazem `[...secao.X, novo]`: se dois cliques
  // acontecerem antes do React re-renderizar entre eles (ex.: clique duplo,
  // ou um clique de teste automatizado disparado sem esperar o quadro
  // seguinte), os dois calculariam a partir da MESMA lista antiga e um dos
  // itens adicionados desapareceria silenciosamente.
  function atualizarSecao(indice: number, mudanca: Partial<SecaoRelatorio> | ((secaoAtual: SecaoRelatorio) => Partial<SecaoRelatorio>)) {
    setDefinicao((atual) => ({
      ...atual,
      secoes: atual.secoes.map((s, i) => {
        if (i !== indice) return s;
        const patch = typeof mudanca === "function" ? mudanca(s) : mudanca;
        return { ...s, ...patch };
      }),
    }));
  }

  function atualizarBloco(id: string, mudanca: Record<string, unknown> | ((blocoAtual: BlocoRelatorio) => Record<string, unknown>)) {
    setDefinicao((atual) => ({
      ...atual,
      blocos: atual.blocos.map((b) => {
        if (b.id !== id) return b;
        const patch = typeof mudanca === "function" ? mudanca(b) : mudanca;
        return { ...b, ...patch } as BlocoRelatorio;
      }),
    }));
  }

  function adicionarBloco(tipo: TipoBloco) {
    if (TIPOS_UNICOS.includes(tipo) && definicao.blocos.some((b) => b.tipo === tipo)) return;
    const id = idLocal("blk");
    setDefinicao((atual) => {
      if (tipo === "tabela") {
        return {
          ...atual,
          secoes: [...atual.secoes, secaoTabelaVazia()],
          blocos: [...atual.blocos, { id, ativo: true, tipo: "tabela", secao_index: atual.secoes.length }],
        };
      }
      if (tipo === "texto") {
        return { ...atual, blocos: [...atual.blocos, { id, ativo: true, tipo: "texto", titulo: "", corpo: "" }] };
      }
      if (tipo === "assinaturas") {
        return {
          ...atual,
          blocos: [...atual.blocos, { id, ativo: true, tipo: "assinaturas", nomes: ["Direção", "Coordenação Pedagógica"] }],
        };
      }
      if (tipo === "cabecalho") {
        return { ...atual, blocos: [...atual.blocos, { id, ativo: true, tipo: "cabecalho" }] };
      }
      if (tipo === "quebra_pagina") {
        return { ...atual, blocos: [...atual.blocos, { id, ativo: true, tipo: "quebra_pagina" }] };
      }
      if (tipo === "espacador") {
        return { ...atual, blocos: [...atual.blocos, { id, ativo: true, tipo: "espacador" }] };
      }
      return { ...atual, blocos: [...atual.blocos, { id, ativo: true, tipo: "parametros" }] };
    });
    setSelecionado(id);
  }

  function removerBloco(id: string) {
    setDefinicao((atual) => {
      const bloco = atual.blocos.find((b) => b.id === id);
      if (!bloco) return atual;
      if (bloco.tipo === "tabela") {
        const indiceRemovido = bloco.secao_index;
        return {
          ...atual,
          secoes: atual.secoes.filter((_, i) => i !== indiceRemovido),
          blocos: atual.blocos
            .filter((b) => b.id !== id)
            .map((b) => (b.tipo === "tabela" && b.secao_index > indiceRemovido ? { ...b, secao_index: b.secao_index - 1 } : b)),
        };
      }
      return { ...atual, blocos: atual.blocos.filter((b) => b.id !== id) };
    });
    setSelecionado((atual) => (atual === id ? null : atual));
  }

  // ── Colunas/filtros/ordenação/agrupamento de uma tabela (indexada por `indiceSecao`) ──

  function adicionarColuna(indiceSecao: number) {
    const expressao = campoPadrao(campos);
    const nova: ColunaRelatorio = { id: idLocal("coluna"), rotulo: rotuloParaExpressao(expressao, campos) ?? "Nova coluna", expressao, largura: null, alinhamento: "centro" };
    atualizarSecao(indiceSecao, (secaoAtual) => ({ colunas: [...secaoAtual.colunas, nova] }));
  }

  function mudarColuna(indiceSecao: number, indice: number, mudanca: Partial<ColunaRelatorio>) {
    atualizarSecao(indiceSecao, (secaoAtual) => ({
      colunas: secaoAtual.colunas.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)),
    }));
  }

  function removerColuna(indiceSecao: number, indice: number) {
    atualizarSecao(indiceSecao, (secaoAtual) => {
      const removida = secaoAtual.colunas[indice];
      return {
        colunas: secaoAtual.colunas.filter((_, i) => i !== indice),
        ordenacao: secaoAtual.ordenacao.filter((o) => o.coluna_id !== removida.id),
      };
    });
  }

  function adicionarFiltro(indiceSecao: number) {
    const nova: FiltroCondicao = { campo: campoPadrao(campos), operador: "igual", valor: { tipo: "literal", valor: { tipo: "texto", valor: "" } } };
    atualizarSecao(indiceSecao, (secaoAtual) => ({ filtros: { ...secaoAtual.filtros, condicoes: [...secaoAtual.filtros.condicoes, nova] } }));
  }

  function mudarFiltro(indiceSecao: number, indice: number, mudanca: Partial<FiltroCondicao>) {
    atualizarSecao(indiceSecao, (secaoAtual) => ({
      filtros: { ...secaoAtual.filtros, condicoes: secaoAtual.filtros.condicoes.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)) },
    }));
  }

  function removerFiltro(indiceSecao: number, indice: number) {
    atualizarSecao(indiceSecao, (secaoAtual) => ({
      filtros: { ...secaoAtual.filtros, condicoes: secaoAtual.filtros.condicoes.filter((_, i) => i !== indice) },
    }));
  }

  function adicionarOrdenacao(indiceSecao: number) {
    atualizarSecao(indiceSecao, (secaoAtual) => {
      if (secaoAtual.colunas.length === 0) return {};
      const nova: OrdenacaoRelatorio = { coluna_id: secaoAtual.colunas[0].id, decrescente: false };
      return { ordenacao: [...secaoAtual.ordenacao, nova] };
    });
  }

  function mudarOrdenacao(indiceSecao: number, indice: number, mudanca: Partial<OrdenacaoRelatorio>) {
    atualizarSecao(indiceSecao, (secaoAtual) => ({
      ordenacao: secaoAtual.ordenacao.map((o, i) => (i === indice ? { ...o, ...mudanca } : o)),
    }));
  }

  function removerOrdenacao(indiceSecao: number, indice: number) {
    atualizarSecao(indiceSecao, (secaoAtual) => ({ ordenacao: secaoAtual.ordenacao.filter((_, i) => i !== indice) }));
  }

  // Liga/desliga o limite de linhas ser um parâmetro editável na hora de
  // gerar (mesmo mecanismo do "Top Alunos" embutido — ver AgrupamentoRelatorio
  // no backend). Ligar cria um parâmetro numérico novo pré-preenchido com o
  // limite atual; desligar só desvincula, volta a ser o número fixo (não
  // apaga o parâmetro — quem quiser removê-lo faz isso no bloco Parâmetros).
  function alternarLimiteEditavel(indiceSecao: number) {
    setDefinicao((atual) => {
      const secaoAtual = atual.secoes[indiceSecao];
      if (!secaoAtual) return atual;
      const agrupamento = secaoAtual.agrupamento;

      if (agrupamento.limite_parametro) {
        return {
          ...atual,
          secoes: atual.secoes.map((s, i) =>
            i !== indiceSecao ? s : { ...s, agrupamento: { ...s.agrupamento, limite_parametro: null } }
          ),
        };
      }

      const valorInicial = agrupamento.limite_por_grupo ?? 20;
      const idParametro = idLocal("parametro");
      const novoParametro: DefinicaoParametro = {
        id: idParametro,
        rotulo: secaoAtual.titulo ? `Quantidade de linhas — ${secaoAtual.titulo}` : "Quantidade de linhas",
        tipo: "numero",
        valor_padrao: { tipo: "numero", valor: valorInicial },
      };
      return {
        ...atual,
        parametros: [...atual.parametros, novoParametro],
        secoes: atual.secoes.map((s, i) =>
          i !== indiceSecao
            ? s
            : { ...s, agrupamento: { ...s.agrupamento, limite_por_grupo: valorInicial, limite_parametro: idParametro } }
        ),
      };
    });
  }

  // Generalização de alternarLimiteEditavel pro valor de um filtro: cria um
  // DefinicaoParametro (rótulo herdado do campo do filtro, tipo/valor
  // herdados do valor fixo atual) e já vincula o filtro a ele, num clique
  // só — pra não precisar sair do bloco Parâmetros pra ir mexer no filtro.
  function tornarFiltroParametro(indiceSecao: number, indiceFiltro: number) {
    setDefinicao((atual) => {
      const secaoAtual = atual.secoes[indiceSecao];
      const condicao = secaoAtual?.filtros.condicoes[indiceFiltro];
      if (!secaoAtual || !condicao || condicao.valor?.tipo !== "literal") return atual;

      const valorAtual = condicao.valor.valor;
      const idParametro = idLocal("parametro");
      const campoNo = condicao.campo;
      const campoInfo = campoNo.tipo === "campo" ? campos.find((c) => c.id === campoNo.campo_id) : undefined;
      const novoParametro: DefinicaoParametro = {
        id: idParametro,
        rotulo: campoInfo?.rotulo ?? "Novo parâmetro",
        tipo: valorAtual.tipo === "numero" ? "numero" : "texto",
        valor_padrao: valorAtual,
      };

      return {
        ...atual,
        parametros: [...atual.parametros, novoParametro],
        secoes: atual.secoes.map((s, i) =>
          i !== indiceSecao
            ? s
            : {
                ...s,
                filtros: {
                  ...s.filtros,
                  condicoes: s.filtros.condicoes.map((c, j) =>
                    j !== indiceFiltro ? c : { ...c, valor: { tipo: "parametro", id: idParametro } }
                  ),
                },
              }
        ),
      };
    });
  }

  // Contraparte de tornarFiltroParametro: só desvincula o filtro (volta a
  // ser um valor fixo, preenchido com o valor padrão atual do parâmetro
  // pra não perder o número) — não apaga o DefinicaoParametro, mesma
  // política de "desligar" do limite de linhas editável.
  function desvincularFiltro(indiceSecao: number, indiceFiltro: number) {
    setDefinicao((atual) => {
      const secaoAtual = atual.secoes[indiceSecao];
      const condicao = secaoAtual?.filtros.condicoes[indiceFiltro];
      const valorNo = condicao?.valor;
      if (!secaoAtual || !condicao || valorNo?.tipo !== "parametro") return atual;
      const parametro = atual.parametros.find((p) => p.id === valorNo.id);
      const valorFixo: ValorExpressao = parametro?.valor_padrao ?? { tipo: "numero", valor: 0 };

      return {
        ...atual,
        secoes: atual.secoes.map((s, i) =>
          i !== indiceSecao
            ? s
            : {
                ...s,
                filtros: {
                  ...s.filtros,
                  condicoes: s.filtros.condicoes.map((c, j) =>
                    j !== indiceFiltro ? c : { ...c, valor: { tipo: "literal", valor: valorFixo } }
                  ),
                },
              }
        ),
      };
    });
  }

  function alternarListaFonte(lista: string[], valor: string): string[] {
    return lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
  }

  // ── Parâmetros de execução (bloco "Parâmetros") ──

  function adicionarParametro() {
    const novo: DefinicaoParametro = { id: idLocal("parametro"), rotulo: "Novo parâmetro", tipo: "numero", valor_padrao: { tipo: "numero", valor: 0 } };
    setDefinicao((atual) => ({ ...atual, parametros: [...atual.parametros, novo] }));
  }

  function mudarParametro(indice: number, mudanca: Partial<DefinicaoParametro>) {
    setDefinicao((atual) => ({ ...atual, parametros: atual.parametros.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)) }));
  }

  function removerParametro(indice: number) {
    setDefinicao((atual) => ({ ...atual, parametros: atual.parametros.filter((_, i) => i !== indice) }));
  }

  function reordenarParametros(nova: DefinicaoParametro[]) {
    setDefinicao((atual) => ({ ...atual, parametros: nova }));
  }

  // ── Ações de topo ──

  /** Erro de validação a bloquear antes de salvar OU gerar — as duas ações
   * chamam salvar_definicao_relatorio por baixo, então uma definição
   * inválida não pode escapar por nenhuma das duas (ver bug real: "Gerar
   * agora" salvava uma tabela sem coluna que "Salvar" corretamente recusava
   * depois, deixando o relatório salvo quebrado nos bastidores). */
  function validarAntesDeSalvar(): string {
    if (!definicao.nome.trim()) return "Dê um nome ao relatório antes de salvar.";
    const tabelaSemColuna = definicao.blocos.find(
      (b) => b.ativo && b.tipo === "tabela" && (definicao.secoes[b.secao_index]?.colunas.length ?? 0) === 0
    );
    if (tabelaSemColuna) return "Toda tabela de alunos ligada precisa de pelo menos uma coluna.";
    return "";
  }

  async function salvar() {
    const erroValidacao = validarAntesDeSalvar();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    try {
      await invokeApp("salvar_definicao_relatorio", { definicao });
      setMensagem("Relatório salvo.");
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  async function gerarAgora() {
    const erroValidacao = validarAntesDeSalvar();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    try {
      await invokeApp("salvar_definicao_relatorio", { definicao });
      const resultado = await invokeApp<{ caminho: string }>("executar_relatorio_generico", {
        input: { definicao, bimestre: bimestrePreview, parametros: {} },
      });
      setMensagem(`Relatório gerado em ${resultado.caminho}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  async function exportar() {
    const destino = await salvarDialogoArquivo({
      defaultPath: `${slugificar(definicao.nome || definicao.id)}.json`,
      filters: [{ name: "Relatório CoordenacaoOP", extensions: ["json"] }],
    }).catch(() => null);
    if (!destino) return;
    setErro("");
    setMensagem("");
    try {
      await invokeApp("exportar_definicao_relatorio", { id: definicao.id, destino });
      setMensagem("Relatório exportado.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function importar() {
    const selecao = await abrirDialogoArquivo({ filters: [{ name: "Relatório CoordenacaoOP", extensions: ["json"] }] }).catch(() => null);
    const caminho = typeof selecao === "string" ? selecao : null;
    if (!caminho) return;
    setErro("");
    setMensagem("");
    try {
      const importado = await invokeApp<ReportDefinition>("importar_definicao_relatorio", { caminho });
      const migrado = migrarParaBlocos(importado);
      setDefinicao(migrado);
      setSelecionado(migrado.blocos[0]?.id ?? null);
      setPreview(null);
      setMensagem("Relatório importado — revise e salve.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (!editavel) {
    return (
      <section className="cb-shell cb-shell-fallback">
        <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
        <section className="panel report-generator-card">
          <h2>{definicao.nome || "Relatório"}</h2>
          <p>
            Este relatório usa uma estrutura avançada (linhas geradas por disciplina/turma em vez de por aluno) que o
            construtor visual ainda não edita. Você pode exportá-lo como arquivo pra guardar ou compartilhar.
          </p>
          <div className="report-actions">
            <button className="secondary-action" onClick={exportar}>Exportar definição</button>
          </div>
          {mensagem && <div className="notice success">{mensagem}</div>}
          {erro && <div className="notice error">{erro}</div>}
        </section>
      </section>
    );
  }

  return (
    <div className="cb-shell">
      <header className="cb-topbar">
        <button
          className="cb-voltar"
          onClick={() => {
            if (definicao.nome.trim()) invokeApp("salvar_definicao_relatorio", { definicao }).catch(() => {});
            onVoltar();
          }}
        >
          ← Relatórios
        </button>
        <div className="cb-divisor" />
        <input
          className="cb-nome"
          type="text"
          placeholder="Nome do relatório"
          value={definicao.nome}
          onChange={(evento) => setDefinicao((atual) => ({ ...atual, nome: evento.target.value }))}
        />
        <div className="cb-abas">
          <button className={aba === "montar" ? "cb-aba ativa" : "cb-aba"} onClick={() => setAba("montar")}>Montar</button>
          <button className={aba === "preview" ? "cb-aba ativa" : "cb-aba"} onClick={() => setAba("preview")}>Pré-visualização</button>
        </div>
        <div className="cb-topbar-direita">
          {rascunhoSalvoEm && <span className="cb-rascunho-status">Rascunho salvo às {rascunhoSalvoEm}</span>}
          <select
            className="cb-select-formato"
            value={definicao.formato_saida}
            onChange={(evento) => setDefinicao((atual) => ({ ...atual, formato_saida: evento.target.value as FormatoSaida }))}
          >
            {Object.entries(ROTULOS_FORMATO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
          <button className="cb-icone-acao" onClick={importar} title="Importar definição de um arquivo">
            <FileUp size={15} />
          </button>
          <button className="cb-icone-acao" onClick={exportar} title="Exportar definição para um arquivo">
            <FileDown size={15} />
          </button>
          <button className="secondary-action" onClick={gerarAgora} disabled={processando}>Gerar agora</button>
          <button className="primary-action" onClick={salvar} disabled={processando}>Salvar</button>
        </div>
      </header>

      {(mensagem || erro) && (
        <div className="cb-avisos">
          {mensagem && <div className="notice success">{mensagem}</div>}
          {erro && <div className="notice error">{erro}</div>}
        </div>
      )}

      {aba === "montar" ? (
        <div className="cb-corpo">
          <aside className="cb-coluna cb-biblioteca">
            <span className="cb-rotulo-secao">Blocos disponíveis</span>
            <div className="cb-lista-biblioteca">
              {BIBLIOTECA.map((item) => {
                const Icone = item.icone;
                const desabilitado = item.emBreve || (item.tipo && TIPOS_UNICOS.includes(item.tipo) && definicao.blocos.some((b) => b.tipo === item.tipo));
                return (
                  <button
                    key={item.titulo}
                    type="button"
                    className={desabilitado ? "cb-cartao-biblioteca desabilitado" : "cb-cartao-biblioteca"}
                    disabled={!!desabilitado}
                    onClick={() => item.tipo && adicionarBloco(item.tipo)}
                    title={item.emBreve ? "Em breve" : desabilitado ? "Este relatório já tem um bloco desse tipo" : "Adicionar ao fim do documento"}
                  >
                    <span className="cb-icone-biblioteca"><Icone size={15} /></span>
                    <span className="cb-texto-biblioteca">
                      <strong>{item.titulo}</strong>
                      <small>{item.descricao}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="cb-rodape-biblioteca">Clique num bloco para adicionar ao fim do documento.</p>
          </aside>

          <main className="cb-coluna cb-documento">
            <div className="cb-cabecalho-documento">
              <span className="cb-rotulo-secao">Estrutura do documento</span>
              <span className="cb-contagem">{totalBlocosAtivos} de {definicao.blocos.length} blocos ativos</span>
            </div>

            <ListaOrdenavel
              itens={definicao.blocos}
              chave={(b) => b.id}
              onReordenar={(nova) => setDefinicao((atual) => ({ ...atual, blocos: nova }))}
              renderItem={(bloco) => {
                const Icone = iconeParaTipo(bloco.tipo);
                const ativo = selecionado === bloco.id;
                const colunasMiniatura = bloco.tipo === "tabela" ? definicao.secoes[bloco.secao_index]?.colunas ?? [] : [];
                return (
                  <div
                    className={["cb-cartao-bloco", ativo ? "selecionado" : "", bloco.ativo ? "" : "desligado"].filter(Boolean).join(" ")}
                    onClick={() => setSelecionado(bloco.id)}
                  >
                    <div className="cb-cartao-bloco-topo">
                      <span className="cb-icone-bloco"><Icone size={15} /></span>
                      <span className="cb-info-bloco">
                        <strong>{tituloParaTipo(bloco.tipo)}</strong>
                        <small>{resumoBloco(bloco, definicao.secoes)}</small>
                      </span>
                      <label className="cb-switch" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={bloco.ativo} onChange={(e) => atualizarBloco(bloco.id, { ativo: e.target.checked })} />
                        <span className="cb-switch-trilho"><span className="cb-switch-bola" /></span>
                      </label>
                      <button type="button" className="cb-remover-bloco" onClick={(e) => { e.stopPropagation(); removerBloco(bloco.id); }} title="Remover bloco">
                        <X size={14} />
                      </button>
                    </div>
                    {bloco.ativo && colunasMiniatura.length > 0 && (
                      <div className="cb-miniatura-colunas">
                        {colunasMiniatura.map((coluna) => (
                          <div key={coluna.id} className="cb-miniatura-coluna">
                            <span className="cb-chip-coluna">{coluna.rotulo || "(sem rótulo)"}</span>
                            <span className="cb-skeleton-linha" />
                            <span className="cb-skeleton-linha" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <p className="cb-adicionar-fim">Use a biblioteca à esquerda para adicionar mais blocos.</p>
          </main>

          <aside className="cb-coluna cb-inspetor">
            {!blocoSelecionado ? (
              <p className="cb-inspetor-vazio">Selecione um bloco pra configurar.</p>
            ) : (
              <InspetorBloco
                bloco={blocoSelecionado}
                definicao={definicao}
                atualizarAutor={(autor) => setDefinicao((atual) => ({ ...atual, autor }))}
                campos={campos}
                disciplinas={disciplinas}
                seriesConhecidas={seriesConhecidas}
                atualizarBloco={atualizarBloco}
                atualizarFonte={(mudanca) =>
                  setDefinicao((atual) => ({
                    ...atual,
                    fonte: { ...atual.fonte, ...(typeof mudanca === "function" ? mudanca(atual.fonte) : mudanca) },
                  }))
                }
                alternarListaFonte={alternarListaFonte}
                totalBlocosTabela={definicao.blocos.filter((b) => b.tipo === "tabela").length}
                adicionarColuna={adicionarColuna}
                mudarColuna={mudarColuna}
                removerColuna={removerColuna}
                adicionarFiltro={adicionarFiltro}
                mudarFiltro={mudarFiltro}
                removerFiltro={removerFiltro}
                adicionarOrdenacao={adicionarOrdenacao}
                mudarOrdenacao={mudarOrdenacao}
                removerOrdenacao={removerOrdenacao}
                alternarLimiteEditavel={alternarLimiteEditavel}
                atualizarSecao={atualizarSecao}
                parametros={definicao.parametros}
                adicionarParametro={adicionarParametro}
                mudarParametro={mudarParametro}
                removerParametro={removerParametro}
                tornarFiltroParametro={tornarFiltroParametro}
                desvincularFiltro={desvincularFiltro}
                reordenarParametros={reordenarParametros}
              />
            )}
          </aside>
        </div>
      ) : (
        <div className="cb-preview-mesa">
          <div className="cb-preview-controles">
            <label>
              Bimestre pra testar
              <select value={bimestrePreview} onChange={(evento) => setBimestrePreview(evento.target.value)}>
                <option value="1">1º bimestre</option>
                <option value="2">2º bimestre</option>
                <option value="3">3º bimestre</option>
                <option value="4">4º bimestre</option>
              </select>
            </label>
            <button className="secondary-action" onClick={atualizarPreview} disabled={carregandoPreview}>
              {carregandoPreview ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
          <div className="cb-folha">
            {definicao.blocos.filter((b) => b.ativo).length === 0 && <p className="cb-inspetor-vazio">Nenhum bloco ativo pra mostrar.</p>}
            {definicao.blocos
              .filter((b) => b.ativo)
              .map((bloco) => {
                if (bloco.tipo === "cabecalho") {
                  return (
                    <div key={bloco.id} className="cb-preview-cabecalho">
                      <div className="cb-preview-logo" />
                      <div>
                        <strong>{definicao.nome || "Nome do relatório"}</strong>
                        <div className="cb-preview-legenda">Coordenação Pedagógica · {bimestrePreview}º bimestre</div>
                      </div>
                    </div>
                  );
                }
                if (bloco.tipo === "texto") {
                  return (
                    <div key={bloco.id} className="cb-preview-texto">
                      {bloco.titulo && <h3>{bloco.titulo}</h3>}
                      {bloco.corpo && <p>{substituirVariaveisPreview(bloco.corpo, bimestrePreview)}</p>}
                    </div>
                  );
                }
                if (bloco.tipo === "tabela") {
                  const secaoPrev = preview?.[bloco.secao_index];
                  if (!secaoPrev) return null;
                  return (
                    <div key={bloco.id} className="cb-preview-tabela-bloco">
                      {secaoPrev.titulo && <strong>{secaoPrev.titulo}</strong>}
                      {secaoPrev.linhas.length > 0 ? (
                        <table className="cb-preview-tabela">
                          <thead>
                            <tr>
                              {secaoPrev.colunas.map((coluna) => (
                                <th key={coluna.id}>{coluna.rotulo}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {secaoPrev.linhas.map((linha, indiceLinha) => (
                              <tr key={indiceLinha}>
                                {linha.map((valor, indiceColuna) => (
                                  <td key={indiceColuna}>{valor}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="cb-preview-rodape">Nenhum registro encontrado para os filtros selecionados.</p>
                      )}
                      <p className="cb-preview-rodape">
                        Mostrando {secaoPrev.linhas.length} de {secaoPrev.total_linhas} registro(s) · {bimestrePreview}º bimestre
                      </p>
                    </div>
                  );
                }
                if (bloco.tipo === "quebra_pagina") {
                  return <div key={bloco.id} className="cb-preview-quebra">— nova página —</div>;
                }
                if (bloco.tipo === "espacador") {
                  return <div key={bloco.id} className="cb-preview-espacador">espaço</div>;
                }
                if (bloco.tipo === "assinaturas") {
                  return (
                    <div key={bloco.id} className="cb-preview-assinaturas">
                      {bloco.nomes.map((nome, indice) => (
                        <div key={indice} className="cb-preview-assinatura-linha">
                          <span className="cb-preview-linha-assinatura" />
                          <span>{nome}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function InspetorBloco({
  bloco,
  definicao,
  atualizarAutor,
  campos,
  disciplinas,
  seriesConhecidas,
  atualizarBloco,
  atualizarFonte,
  alternarListaFonte,
  totalBlocosTabela,
  adicionarColuna,
  mudarColuna,
  removerColuna,
  adicionarFiltro,
  mudarFiltro,
  removerFiltro,
  adicionarOrdenacao,
  mudarOrdenacao,
  removerOrdenacao,
  alternarLimiteEditavel,
  atualizarSecao,
  parametros,
  adicionarParametro,
  mudarParametro,
  removerParametro,
  tornarFiltroParametro,
  desvincularFiltro,
  reordenarParametros,
}: {
  bloco: BlocoRelatorio;
  definicao: ReportDefinition;
  atualizarAutor: (autor: string) => void;
  campos: CampoRelatorioInfo[];
  disciplinas: string[];
  seriesConhecidas: string[];
  atualizarBloco: (id: string, mudanca: Record<string, unknown> | ((blocoAtual: BlocoRelatorio) => Record<string, unknown>)) => void;
  atualizarFonte: (mudanca: Partial<ReportDefinition["fonte"]> | ((fonteAtual: ReportDefinition["fonte"]) => Partial<ReportDefinition["fonte"]>)) => void;
  alternarListaFonte: (lista: string[], valor: string) => string[];
  totalBlocosTabela: number;
  adicionarColuna: (indiceSecao: number) => void;
  mudarColuna: (indiceSecao: number, indice: number, mudanca: Partial<ColunaRelatorio>) => void;
  removerColuna: (indiceSecao: number, indice: number) => void;
  adicionarFiltro: (indiceSecao: number) => void;
  mudarFiltro: (indiceSecao: number, indice: number, mudanca: Partial<FiltroCondicao>) => void;
  removerFiltro: (indiceSecao: number, indice: number) => void;
  adicionarOrdenacao: (indiceSecao: number) => void;
  mudarOrdenacao: (indiceSecao: number, indice: number, mudanca: Partial<OrdenacaoRelatorio>) => void;
  removerOrdenacao: (indiceSecao: number, indice: number) => void;
  alternarLimiteEditavel: (indiceSecao: number) => void;
  atualizarSecao: (indiceSecao: number, mudanca: Partial<SecaoRelatorio>) => void;
  parametros: DefinicaoParametro[];
  adicionarParametro: () => void;
  mudarParametro: (indice: number, mudanca: Partial<DefinicaoParametro>) => void;
  removerParametro: (indice: number) => void;
  tornarFiltroParametro: (indiceSecao: number, indiceFiltro: number) => void;
  desvincularFiltro: (indiceSecao: number, indiceFiltro: number) => void;
  reordenarParametros: (nova: DefinicaoParametro[]) => void;
}) {
  const Icone = iconeParaTipo(bloco.tipo);

  return (
    <>
      <div className="cb-inspetor-cabecalho">
        <span className="cb-icone-inspetor"><Icone size={15} /></span>
        <div>
          <strong>{tituloParaTipo(bloco.tipo)}</strong>
          <small>Configuração do bloco</small>
        </div>
      </div>

      <div className="cb-inspetor-corpo">
        {bloco.tipo === "cabecalho" && (
          <>
            <p className="cb-ajuda">
              O cabeçalho usa o nome do relatório (definido no topo da tela), o bimestre em que ele for gerado e a
              imagem institucional configurada em Configurações › Instituição (Word, Excel e PDF — planilha .csv não
              carrega imagem).
            </p>
            <label className="cb-campo">
              Autor (opcional)
              <input
                type="text"
                placeholder="Seu nome ou da sua equipe"
                value={definicao.autor ?? ""}
                onChange={(e) => atualizarAutor(e.target.value)}
              />
            </label>
            <p className="cb-ajuda">Aparece como crédito se este relatório for publicado no Repositório de relatórios.</p>
          </>
        )}

        {bloco.tipo === "texto" && (
          <>
            <label className="cb-campo">
              Título da seção
              <input type="text" value={bloco.titulo ?? ""} onChange={(e) => atualizarBloco(bloco.id, { titulo: e.target.value })} />
            </label>
            <label className="cb-campo">
              Texto
              <textarea rows={5} value={bloco.corpo} onChange={(e) => atualizarBloco(bloco.id, { corpo: e.target.value })} />
            </label>
            <p className="cb-ajuda">Use {"{bimestre}"} para inserir o bimestre automaticamente.</p>
          </>
        )}

        {bloco.tipo === "quebra_pagina" && (
          <p className="cb-ajuda">Este bloco não tem configuração — tudo depois dele começa em uma nova página (no Word e no PDF).</p>
        )}

        {bloco.tipo === "espacador" && (
          <p className="cb-ajuda">Este bloco não tem configuração — acrescenta duas linhas em branco entre os itens ao redor dele.</p>
        )}

        {bloco.tipo === "assinaturas" && (
          <>
            <p className="cb-ajuda">Cada nome vira uma linha de assinatura no rodapé do documento.</p>
            <ListaOrdenavel
              itens={bloco.nomes.map((nome, indice) => ({ id: `assinatura_${indice}`, nome, indice }))}
              chave={(item) => item.id}
              onReordenar={(nova) => atualizarBloco(bloco.id, () => ({ nomes: nova.map((item) => item.nome) }))}
              renderItem={(item) => (
                <div className="editor-expressao-linha">
                  <input
                    type="text"
                    value={item.nome}
                    onChange={(e) => {
                      const valor = e.target.value;
                      atualizarBloco(bloco.id, (blocoAtual) => {
                        const nomes = blocoAtual.tipo === "assinaturas" ? [...blocoAtual.nomes] : [];
                        nomes[item.indice] = valor;
                        return { nomes };
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="editor-expressao-remover"
                    onClick={() =>
                      atualizarBloco(bloco.id, (blocoAtual) => ({
                        nomes: blocoAtual.tipo === "assinaturas" ? blocoAtual.nomes.filter((_, i) => i !== item.indice) : [],
                      }))
                    }
                  >
                    Remover
                  </button>
                </div>
              )}
            />
            <button
              type="button"
              className="secondary-action"
              onClick={() =>
                atualizarBloco(bloco.id, (blocoAtual) => ({
                  nomes: blocoAtual.tipo === "assinaturas" ? [...blocoAtual.nomes, "Novo nome"] : ["Novo nome"],
                }))
              }
            >
              + Nome
            </button>
          </>
        )}

        {bloco.tipo === "parametros" && (
          <>
            <p className="cb-ajuda">
              Campos que a pessoa preenche antes de gerar — como o bimestre já faz. Escolha abaixo onde cada um se
              aplica, sem precisar ir até o filtro.
            </p>

            {definicao.secoes.map((secao, indiceSecao) => {
              const filtrosElegiveis = secao.filtros.condicoes
                .map((condicao, indiceFiltro) => ({ condicao, indiceFiltro }))
                .filter(
                  ({ condicao }) =>
                    condicao.campo.tipo === "campo" && (condicao.valor?.tipo === "literal" || condicao.valor?.tipo === "parametro")
                );
              const temLimite = secao.agrupamento.limite_por_grupo != null;
              if (filtrosElegiveis.length === 0 && !temLimite) return null;

              const tituloSecao = secao.titulo?.trim() || `Tabela ${indiceSecao + 1}`;

              return (
                <div key={indiceSecao} className="cb-parametros-secao">
                  <strong>{tituloSecao}</strong>

                  {filtrosElegiveis.map(({ condicao, indiceFiltro }) => {
                    const valor = condicao.valor;

                    if (valor?.tipo === "parametro") {
                      const indiceParametro = parametros.findIndex((p) => p.id === valor.id);
                      const parametro = parametros[indiceParametro];
                      if (!parametro) return null;
                      return (
                        <div key={indiceFiltro} className="editor-expressao-linha">
                          <input
                            type="text"
                            placeholder="Rótulo"
                            value={parametro.rotulo}
                            onChange={(e) => mudarParametro(indiceParametro, { rotulo: e.target.value })}
                          />
                          <input
                            type={parametro.tipo === "numero" ? "number" : "text"}
                            placeholder="Valor padrão"
                            value={valorExpressaoParaTexto(parametro.valor_padrao)}
                            onChange={(e) =>
                              mudarParametro(indiceParametro, {
                                valor_padrao:
                                  parametro.tipo === "numero"
                                    ? { tipo: "numero", valor: Number(e.target.value) || 0 }
                                    : { tipo: "texto", valor: e.target.value },
                              })
                            }
                          />
                          <button
                            type="button"
                            className="editor-expressao-remover"
                            onClick={() => desvincularFiltro(indiceSecao, indiceFiltro)}
                          >
                            Desvincular
                          </button>
                        </div>
                      );
                    }

                    const descricao = descreverFiltro(condicao, campos);
                    if (!descricao) return null;
                    return (
                      <div key={indiceFiltro} className="editor-expressao-linha">
                        <span>{descricao}</span>
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => tornarFiltroParametro(indiceSecao, indiceFiltro)}
                        >
                          🔤 Tornar parâmetro
                        </button>
                      </div>
                    );
                  })}

                  {temLimite && (
                    <label className="cb-checkbox">
                      <input
                        type="checkbox"
                        checked={!!secao.agrupamento.limite_parametro}
                        onChange={() => alternarLimiteEditavel(indiceSecao)}
                      />
                      Quantidade de linhas ({secao.agrupamento.limite_por_grupo}) editável na hora de gerar
                    </label>
                  )}
                </div>
              );
            })}

            <details className="cb-parametros-avancado">
              <summary>Avançado — gerenciar todos os parâmetros</summary>
              <ListaOrdenavel
                itens={parametros}
                chave={(p) => p.id}
                onReordenar={reordenarParametros}
                vazio={<p className="report-path">Nenhum parâmetro ainda.</p>}
                renderItem={(parametro, indice) => (
                  <div className="editor-expressao-linha">
                    <input type="text" placeholder="Rótulo" value={parametro.rotulo} onChange={(e) => mudarParametro(indice, { rotulo: e.target.value })} />
                    <select
                      value={parametro.tipo}
                      onChange={(e) => {
                        const tipo = e.target.value as TipoParametro;
                        mudarParametro(indice, { tipo, valor_padrao: tipo === "numero" ? { tipo: "numero", valor: 0 } : { tipo: "texto", valor: "" } });
                      }}
                    >
                      <option value="numero">Número</option>
                      <option value="texto">Texto</option>
                    </select>
                    <input
                      type={parametro.tipo === "numero" ? "number" : "text"}
                      placeholder="Valor padrão"
                      value={valorExpressaoParaTexto(parametro.valor_padrao)}
                      onChange={(e) =>
                        mudarParametro(indice, {
                          valor_padrao: parametro.tipo === "numero" ? { tipo: "numero", valor: Number(e.target.value) || 0 } : { tipo: "texto", valor: e.target.value },
                        })
                      }
                    />
                    <button type="button" className="editor-expressao-remover" onClick={() => removerParametro(indice)}>Remover</button>
                  </div>
                )}
              />
              <button type="button" className="secondary-action" onClick={adicionarParametro}>+ Criar parâmetro solto</button>
            </details>
          </>
        )}

        {bloco.tipo === "tabela" && (
          <InspetorTabela
            key={bloco.id}
            indiceSecao={bloco.secao_index}
            secao={definicao.secoes[bloco.secao_index]}
            fonte={definicao.fonte}
            campos={campos}
            disciplinas={disciplinas}
            parametros={parametros}
            seriesConhecidas={seriesConhecidas}
            mostrarNotaFonteCompartilhada={totalBlocosTabela > 1}
            atualizarFonte={atualizarFonte}
            alternarListaFonte={alternarListaFonte}
            atualizarSecao={atualizarSecao}
            adicionarColuna={adicionarColuna}
            mudarColuna={mudarColuna}
            removerColuna={removerColuna}
            adicionarFiltro={adicionarFiltro}
            mudarFiltro={mudarFiltro}
            removerFiltro={removerFiltro}
            adicionarOrdenacao={adicionarOrdenacao}
            mudarOrdenacao={mudarOrdenacao}
            removerOrdenacao={removerOrdenacao}
            alternarLimiteEditavel={alternarLimiteEditavel}
          />
        )}
      </div>
    </>
  );
}

function InspetorTabela({
  indiceSecao,
  secao,
  fonte,
  campos,
  disciplinas,
  parametros,
  seriesConhecidas,
  mostrarNotaFonteCompartilhada,
  atualizarFonte,
  alternarListaFonte,
  atualizarSecao,
  adicionarColuna,
  mudarColuna,
  removerColuna,
  adicionarFiltro,
  mudarFiltro,
  removerFiltro,
  adicionarOrdenacao,
  mudarOrdenacao,
  removerOrdenacao,
  alternarLimiteEditavel,
}: {
  indiceSecao: number;
  secao: SecaoRelatorio;
  fonte: ReportDefinition["fonte"];
  campos: CampoRelatorioInfo[];
  disciplinas: string[];
  parametros: DefinicaoParametro[];
  seriesConhecidas: string[];
  mostrarNotaFonteCompartilhada: boolean;
  atualizarFonte: (mudanca: Partial<ReportDefinition["fonte"]> | ((fonteAtual: ReportDefinition["fonte"]) => Partial<ReportDefinition["fonte"]>)) => void;
  alternarListaFonte: (lista: string[], valor: string) => string[];
  atualizarSecao: (indiceSecao: number, mudanca: Partial<SecaoRelatorio>) => void;
  adicionarColuna: (indiceSecao: number) => void;
  mudarColuna: (indiceSecao: number, indice: number, mudanca: Partial<ColunaRelatorio>) => void;
  removerColuna: (indiceSecao: number, indice: number) => void;
  adicionarFiltro: (indiceSecao: number) => void;
  mudarFiltro: (indiceSecao: number, indice: number, mudanca: Partial<FiltroCondicao>) => void;
  removerFiltro: (indiceSecao: number, indice: number) => void;
  adicionarOrdenacao: (indiceSecao: number) => void;
  mudarOrdenacao: (indiceSecao: number, indice: number, mudanca: Partial<OrdenacaoRelatorio>) => void;
  removerOrdenacao: (indiceSecao: number, indice: number) => void;
  alternarLimiteEditavel: (indiceSecao: number) => void;
}) {
  const [colunaExpandidaId, setColunaExpandidaId] = useState<string | null>(null);
  const totalColunasAnterior = useRef(secao?.colunas.length ?? 0);

  useEffect(() => {
    const total = secao?.colunas.length ?? 0;
    if (total > totalColunasAnterior.current) {
      setColunaExpandidaId(secao.colunas[total - 1].id);
    }
    totalColunasAnterior.current = total;
  }, [secao?.colunas]);

  if (!secao) return <p className="cb-ajuda">Este bloco ficou sem seção correspondente — remova e adicione de novo.</p>;

  return (
    <>
      <section className="cb-inspetor-secao">
        <span className="cb-titulo-secao">Quem entra</span>
        <p className="cb-ajuda">
          Sem nada marcado, entram todas as turmas.
          {mostrarNotaFonteCompartilhada && " Isso vale pro relatório inteiro, não só para esta tabela."}
        </p>
        <div className="cb-pilulas">
          {PERIODOS_DISPONIVEIS.map((periodo) => (
            <button key={periodo} type="button" className={fonte.periodos.includes(periodo) ? "cb-pilula ativa" : "cb-pilula"} onClick={() => atualizarFonte((fonteAtual) => ({ periodos: alternarListaFonte(fonteAtual.periodos, periodo) }))}>
              {ROTULOS_PERIODO[periodo]}
            </button>
          ))}
        </div>
        <div className="cb-pilulas">
          {CICLOS_DISPONIVEIS.map((ciclo) => (
            <button key={ciclo} type="button" className={fonte.ciclos.includes(ciclo) ? "cb-pilula ativa" : "cb-pilula"} onClick={() => atualizarFonte((fonteAtual) => ({ ciclos: alternarListaFonte(fonteAtual.ciclos, ciclo) }))}>
              {ROTULOS_CICLO[ciclo]}
            </button>
          ))}
        </div>
        {seriesConhecidas.length > 0 && (
          <div className="cb-pilulas">
            {seriesConhecidas.map((serie) => (
              <button key={serie} type="button" className={fonte.series.includes(serie) ? "cb-pilula ativa" : "cb-pilula"} onClick={() => atualizarFonte((fonteAtual) => ({ series: alternarListaFonte(fonteAtual.series, serie) }))}>
                {serie}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="cb-inspetor-secao">
        <span className="cb-titulo-secao">Colunas</span>
        <ListaOrdenavel
          itens={secao.colunas.map((coluna, indice) => ({ id: coluna.id, coluna, indice }))}
          chave={(item) => item.id}
          onReordenar={(nova) => atualizarSecao(indiceSecao, { colunas: nova.map((item) => item.coluna) })}
          vazio={<p className="cb-ajuda">Nenhuma coluna ainda — adicione pelo menos uma.</p>}
          renderItem={(item) => {
            const expandida = colunaExpandidaId === item.coluna.id;
            return (
              <div
                className={expandida ? "cb-coluna-item expandida" : "cb-coluna-item"}
                onFocus={() => setColunaExpandidaId(item.coluna.id)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setColunaExpandidaId((atual) => (atual === item.coluna.id ? null : atual));
                  }
                }}
              >
                {expandida && <span className="cb-microrrotulo cb-microrrotulo-primeira">Nome desta coluna no relatório</span>}
                <div className="cb-coluna-item-linha">
                  <input
                    type="text"
                    className="cb-coluna-rotulo"
                    placeholder="Rótulo da coluna"
                    value={item.coluna.rotulo}
                    onChange={(e) => mudarColuna(indiceSecao, item.indice, { rotulo: e.target.value })}
                  />
                  <button type="button" className="cb-remover-inline" onClick={() => removerColuna(indiceSecao, item.indice)}>×</button>
                </div>
                {expandida && (
                  <div className="cb-coluna-avancado">
                    <span className="cb-microrrotulo">De onde vem o valor</span>
                    <EditorExpressao
                      no={item.coluna.expressao}
                      onMudar={(novo) =>
                        mudarColuna(indiceSecao, item.indice, {
                          expressao: novo,
                          rotulo: rotuloParaExpressao(novo, campos) ?? item.coluna.rotulo,
                        })
                      }
                      campos={campos}
                      parametros={parametros}
                      disciplinas={disciplinas}
                    />
                    <span className="cb-microrrotulo">Alinhamento</span>
                    <select value={item.coluna.alinhamento} onChange={(e) => mudarColuna(indiceSecao, item.indice, { alinhamento: e.target.value as Alinhamento })}>
                      <option value="esquerda">Esquerda</option>
                      <option value="centro">Centro</option>
                      <option value="direita">Direita</option>
                    </select>
                  </div>
                )}
              </div>
            );
          }}
        />
        <button type="button" className="cb-adicionar-tracejado" onClick={() => adicionarColuna(indiceSecao)}>+ Coluna</button>
      </section>

      <section className="cb-inspetor-secao">
        <div className="cb-titulo-secao-linha">
          <span className="cb-titulo-secao">Condições</span>
          {secao.filtros.condicoes.length > 1 && <small className="cb-nota-direita">todas precisam ser verdadeiras</small>}
        </div>
        <ListaOrdenavel
          itens={secao.filtros.condicoes.map((condicao, indice) => ({ id: `filtro_${indice}`, condicao, indice }))}
          chave={(item) => item.id}
          onReordenar={(nova) => atualizarSecao(indiceSecao, { filtros: { ...secao.filtros, condicoes: nova.map((item) => item.condicao) } })}
          vazio={<p className="cb-ajuda">Nenhuma condição — entram todos os alunos das turmas selecionadas acima.</p>}
          renderItem={(item) => (
            <div className="cb-condicao">
              <strong className="cb-condicao-prefixo">{item.indice === 0 ? "Se" : "e"}</strong>
              <EditorExpressao no={item.condicao.campo} onMudar={(novo) => mudarFiltro(indiceSecao, item.indice, { campo: novo })} campos={campos} parametros={parametros} disciplinas={disciplinas} />
              <div className="editor-expressao-linha">
                <select value={item.condicao.operador} onChange={(e) => mudarFiltro(indiceSecao, item.indice, { operador: e.target.value as OperadorFiltro })}>
                  {Object.entries(ROTULOS_OPERADOR_FILTRO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </div>
              {item.condicao.operador !== "vazio" && item.condicao.operador !== "nao_vazio" && (
                <EditorExpressao
                  no={item.condicao.valor ?? { tipo: "literal", valor: { tipo: "texto", valor: "" } }}
                  onMudar={(novo) => mudarFiltro(indiceSecao, item.indice, { valor: novo })}
                  campos={campos}
                  parametros={parametros}
                  disciplinas={disciplinas}
                />
              )}
              <button type="button" className="editor-expressao-remover" onClick={() => removerFiltro(indiceSecao, item.indice)}>× Remover condição</button>
            </div>
          )}
        />
        <button type="button" className="cb-adicionar-tracejado" onClick={() => adicionarFiltro(indiceSecao)}>+ Condição</button>
      </section>

      <section className="cb-inspetor-secao">
        <span className="cb-titulo-secao">Ordem e limite</span>
        {secao.colunas.length === 0 ? (
          <p className="cb-ajuda">Adicione colunas primeiro — só dá pra ordenar por um campo que já é uma coluna da tabela.</p>
        ) : (
          <>
            <p className="cb-ajuda">As opções abaixo vêm das colunas da seção "Colunas", acima. Pra ordenar por um campo que ainda não aparece na lista, adicione-o lá primeiro.</p>
            {secao.ordenacao.length > 1 && (
              <p className="cb-ajuda">Cada critério novo só entra em ação quando os de cima empatarem — é assim que dá pra montar um desempate em cadeia.</p>
            )}
            <ListaOrdenavel
              itens={secao.ordenacao.map((item, indice) => ({ id: `ord_${indice}`, item, indice }))}
              chave={(x) => x.id}
              onReordenar={(nova) => atualizarSecao(indiceSecao, { ordenacao: nova.map((x) => x.item) })}
              vazio={<p className="cb-ajuda">Sem ordenação — vem na ordem em que os dados aparecem.</p>}
              renderItem={(x) => (
                <div className="cb-ordenacao-item">
                  <strong className="cb-condicao-prefixo">{x.indice === 0 ? "Ordenar por" : `Se empatar, por`}</strong>
                  <div className="editor-expressao-linha">
                    <select value={x.item.coluna_id} onChange={(e) => mudarOrdenacao(indiceSecao, x.indice, { coluna_id: e.target.value })}>
                      {secao.colunas.map((coluna) => (
                        <option key={coluna.id} value={coluna.id}>{coluna.rotulo}</option>
                      ))}
                    </select>
                    <button type="button" className="secondary-action" onClick={() => mudarOrdenacao(indiceSecao, x.indice, { decrescente: !x.item.decrescente })}>
                      {x.item.decrescente ? "↓ maior primeiro" : "↑ menor primeiro"}
                    </button>
                    <button type="button" className="editor-expressao-remover" onClick={() => removerOrdenacao(indiceSecao, x.indice)}>Remover</button>
                  </div>
                </div>
              )}
            />
            <button type="button" className="cb-adicionar-tracejado" onClick={() => adicionarOrdenacao(indiceSecao)}>+ Critério de desempate</button>
          </>
        )}

        <label className="cb-checkbox">
          <input
            type="checkbox"
            checked={secao.agrupamento.limite_por_grupo != null}
            onChange={(e) =>
              atualizarSecao(indiceSecao, {
                agrupamento: {
                  ...secao.agrupamento,
                  limite_por_grupo: e.target.checked ? 20 : null,
                  limite_parametro: e.target.checked ? secao.agrupamento.limite_parametro : null,
                },
              })
            }
          />
          Mostrar só as primeiras
          <input
            type="number"
            className="cb-limite-input"
            disabled={secao.agrupamento.limite_por_grupo == null}
            value={secao.agrupamento.limite_por_grupo ?? 20}
            onChange={(e) => atualizarSecao(indiceSecao, { agrupamento: { ...secao.agrupamento, limite_por_grupo: Number(e.target.value) || 1 } })}
          />
          linhas {secao.agrupamento.campo ? "por grupo" : "no total"}
        </label>

        {secao.agrupamento.limite_por_grupo != null && (
          <label className="cb-checkbox">
            <input
              type="checkbox"
              checked={!!secao.agrupamento.limite_parametro}
              onChange={() => alternarLimiteEditavel(indiceSecao)}
            />
            Deixar essa quantidade editável na hora de gerar
          </label>
        )}
        {secao.agrupamento.limite_parametro && (
          <p className="cb-ajuda">
            Criado um parâmetro numérico pra isso — edite o rótulo dele no bloco <strong>Parâmetros</strong>, se quiser.
            A pessoa que gerar o relatório vai poder escolher a quantidade antes de rodar (como já acontece no Top
            Alunos).
          </p>
        )}

        <label className="cb-checkbox">
          <input
            type="checkbox"
            checked={!!secao.agrupamento.campo}
            onChange={(e) => atualizarSecao(indiceSecao, { agrupamento: { ...secao.agrupamento, campo: e.target.checked ? campoPadrao(campos) : null } })}
          />
          Agrupar linhas em blocos (ex.: um bloco por turma)
        </label>
        {secao.agrupamento.campo && (
          <EditorExpressao no={secao.agrupamento.campo} onMudar={(novo) => atualizarSecao(indiceSecao, { agrupamento: { ...secao.agrupamento, campo: novo } })} campos={campos} parametros={parametros} disciplinas={disciplinas} />
        )}
      </section>
    </>
  );
}
