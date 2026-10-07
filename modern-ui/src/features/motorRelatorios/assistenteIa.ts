// "Descrever relatório": a IA configurada em Configurações › Assistente
// pedagógico traduz um pedido em português para um relatório do motor.
//
// A IA não escreve a ReportDefinition inteira. Ela responde um "plano"
// simplificado (campos, condições, ordenação), que este arquivo converte de
// forma determinística na definição que o construtor e o motor já usam.
// Assim a IA não precisa acertar ids de coluna, blocos e expressões
// aninhadas, coisa em que um modelo local pequeno erra muito. O que ela
// errar (campo inventado, disciplina que não existe) volta pra ela como
// lista de problemas para uma segunda tentativa.
//
// A IA só recebe a estrutura (catálogo de campos e nomes de disciplina),
// nunca dados de aluno.

import { gerarJsonIa, type AiAssistantSettings } from "../aiAssistant";
import { invokeApp } from "../appBridge";
import {
  idLocal,
  type Alinhamento,
  type BlocoRelatorio,
  type CampoRelatorioInfo,
  type ColunaRelatorio,
  type ExpressaoNo,
  type FiltroCondicao,
  type FormatoSaida,
  type OperadorFiltro,
  type OrdenacaoRelatorio,
  type ReportDefinition,
} from "./tipos";

type ReferenciaCampoPlano = { campo: string; parametro?: string | null };

export type PlanoRelatorioIa = {
  nome: string;
  descricao?: string;
  turmas?: { series?: string[]; periodos?: string[]; ciclos?: string[] };
  colunas: Array<ReferenciaCampoPlano & { rotulo?: string | null }>;
  combinador?: "e" | "ou";
  condicoes?: Array<
    ReferenciaCampoPlano & {
      operador: string;
      valor?: string | number | boolean | null | ReferenciaCampoPlano;
    }
  >;
  ordenacao?: Array<ReferenciaCampoPlano & { decrescente?: boolean }>;
  agrupar_por?: ReferenciaCampoPlano | null;
  limite?: number | null;
  introducao?: string | null;
  formato?: string;
};

export type ContextoAssistente = {
  campos: CampoRelatorioInfo[];
  disciplinas: string[];
  series: string[];
};

export type ResultadoAssistente = {
  definicao: ReportDefinition;
  plano: PlanoRelatorioIa;
};

const OPERADORES: OperadorFiltro[] = ["igual", "diferente", "maior", "maior_igual", "menor", "menor_igual", "contem", "vazio", "nao_vazio"];
const PERIODOS = ["MANHA", "TARDE", "NOITE", "INTEGRAL"];
const CICLOS = ["EI", "EFAI", "EFAF", "EM"];
const FORMATOS: FormatoSaida[] = ["docx", "xlsx", "pdf", "csv"];

/** Campos que só fazem sentido em linhas que não são "um aluno por linha"
 * (relatórios embutidos agregados ou com fan-out). O construtor visual só
 * monta tabelas por aluno, então a IA nem fica sabendo deles. */
const CAMPOS_FORA_DO_CONSTRUTOR = new Set([
  "bimestre_linha",
  "disciplina_contexto",
  "total_ativos_disciplina",
  "notas_lancadas_disciplina",
  "faltam_lancar_disciplina",
]);

/** Campos cujo parâmetro é o nome de uma disciplina do mapão. Para eles o
 * nome que a IA escreveu é trocado pelo nome exato da lista (ignorando
 * acento e maiúsculas), porque o motor compara o texto ao pé da letra. */
const CAMPOS_COM_DISCIPLINA_DO_MAPAO = new Set([
  "frequencia_percentual_disciplina",
  "faltas_acumuladas_disciplina",
  "total_aulas_disciplina",
  "nota_disciplina_bimestre",
  "aluno_tem_disciplina",
]);

const MAX_TENTATIVAS = 2;

export function camposParaAssistente(campos: CampoRelatorioInfo[]) {
  return campos.filter((campo) => !CAMPOS_FORA_DO_CONSTRUTOR.has(campo.id));
}

const INSTRUCOES_SISTEMA = [
  "Você monta relatórios escolares no motor de relatórios do aplicativo Coordenação OP.",
  "Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem blocos de código.",
  "Use apenas os ids de campo da lista fornecida. Nunca invente um campo.",
  "Cada linha do relatório é um aluno. Textos (nome, descrição, rótulos, introdução) em português do Brasil.",
].join(" ");

const FORMATO_PLANO = `{
  "nome": "título curto do relatório",
  "descricao": "uma frase dizendo o que o relatório mostra",
  "turmas": { "series": [], "periodos": [], "ciclos": [] },
  "colunas": [ { "campo": "id_do_campo", "parametro": "só quando o campo pede disciplina", "rotulo": "opcional" } ],
  "combinador": "e",
  "condicoes": [ { "campo": "id_do_campo", "parametro": null, "operador": "menor", "valor": 5 } ],
  "ordenacao": [ { "campo": "id_do_campo", "parametro": null, "decrescente": false } ],
  "agrupar_por": null,
  "limite": null,
  "introducao": null,
  "formato": "docx"
}`;

const REGRAS_PLANO = [
  "Regras do JSON:",
  "- \"turmas\": listas vazias significam todas as turmas. \"periodos\" aceita MANHA, TARDE, NOITE, INTEGRAL. \"ciclos\" aceita EI, EFAI, EFAF, EM. \"series\" usa exatamente os nomes de série informados.",
  "- \"colunas\": comece por aluno_numero_chamada e aluno_nome, depois os dados pedidos. Se o relatório juntar várias turmas, inclua turma_rotulo.",
  "- Campos marcados [pede disciplina] exigem \"parametro\" com o nome exato de uma disciplina da lista. Para campos do SARESP use a sigla (LPT, MAT, ING...).",
  "- \"operador\": igual, diferente, maior, maior_igual, menor, menor_igual, contem, vazio, nao_vazio. Com vazio e nao_vazio, \"valor\" fica null.",
  "- \"valor\": número, texto, true/false, ou outro campo no formato { \"campo\": \"id\" } (ex.: { \"campo\": \"nota_minima_configurada\" } para \"abaixo da média\").",
  "- Campos (percentual) vão de 0 a 100: \"abaixo de 75%\" é { \"operador\": \"menor\", \"valor\": 75 }.",
  "- \"combinador\": \"e\" quando todas as condições valem juntas, \"ou\" quando basta uma.",
  "- \"agrupar_por\": { \"campo\": \"turma_rotulo\" } para separar por turma, { \"campo\": \"turma_periodo\" } por período; null para uma lista só.",
  "- \"limite\": número máximo de alunos (por grupo, se houver agrupamento) para pedidos do tipo \"os 10 mais...\"; senão null.",
  "- \"introducao\": um parágrafo opcional explicando o critério do relatório, ou null.",
  "- \"formato\": docx (Word), xlsx (Excel), pdf ou csv. Use docx se o pedido não disser.",
].join("\n");

export function montarPromptAssistente(pedido: string, contexto: ContextoAssistente) {
  const campos = camposParaAssistente(contexto.campos)
    .map((campo) => `- ${campo.id}: ${campo.rotulo} (${campo.tipo})${campo.requer_parametro ? " [pede disciplina]" : ""}`)
    .join("\n");
  const disciplinas = contexto.disciplinas.length > 0 ? contexto.disciplinas.join("; ") : "(nenhuma importada ainda)";
  const series = contexto.series.length > 0 ? contexto.series.join("; ") : "(nenhuma)";

  return [
    "Monte o relatório pedido abaixo respondendo neste formato JSON:",
    FORMATO_PLANO,
    REGRAS_PLANO,
    `Campos disponíveis (id: descrição (tipo)):\n${campos}`,
    `Disciplinas existentes: ${disciplinas}`,
    `Séries existentes: ${series}`,
    `Pedido do coordenador: ${pedido.trim()}`,
  ].join("\n\n");
}

/** O prompt inteiro (instruções + pedido) para o modo "Prompt manual",
 * em que a pessoa cola em outra IA e traz a resposta de volta. */
export function montarPromptAssistenteManual(pedido: string, contexto: ContextoAssistente) {
  return [INSTRUCOES_SISTEMA, "", montarPromptAssistente(pedido, contexto)].join("\n");
}

/** Gera o relatório chamando a IA configurada. Se a resposta tiver
 * problemas, devolve a lista à IA uma vez para ela corrigir. */
export async function gerarRelatorioComIa(settings: AiAssistantSettings, pedido: string, contexto: ContextoAssistente): Promise<ResultadoAssistente> {
  const prompt = montarPromptAssistente(pedido, contexto);
  let mensagemUsuario = prompt;
  let ultimosProblemas: string[] = [];

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
    const resposta = await gerarJsonIa(settings, [
      { role: "system", content: INSTRUCOES_SISTEMA },
      { role: "user", content: mensagemUsuario },
    ]);
    const resultado = await interpretarRespostaAssistente(resposta, contexto);
    if (resultado.ok) return resultado.valor;
    ultimosProblemas = resultado.problemas;
    mensagemUsuario = [
      prompt,
      `Sua resposta anterior foi:\n${resposta}`,
      `Ela tem estes problemas:\n${ultimosProblemas.map((problema) => `- ${problema}`).join("\n")}`,
      "Responda de novo com o JSON completo e corrigido.",
    ].join("\n\n");
  }

  throw new ErroAssistente(ultimosProblemas);
}

export class ErroAssistente extends Error {
  problemas: string[];
  constructor(problemas: string[]) {
    super(`A IA não conseguiu montar o relatório: ${problemas.join(" ")}`);
    this.problemas = problemas;
  }
}

/** Lê a resposta (da IA configurada ou colada à mão no modo manual),
 * converte e passa pela validação do motor. */
export async function interpretarRespostaAssistente(
  resposta: string,
  contexto: ContextoAssistente,
): Promise<{ ok: true; valor: ResultadoAssistente } | { ok: false; problemas: string[] }> {
  const plano = extrairJson(resposta);
  if (!plano) return { ok: false, problemas: ["A resposta não é um JSON válido."] };

  const conversao = converterPlano(plano, contexto);
  if (!conversao.ok) return conversao;

  const problemasMotor = await invokeApp<string[]>("validar_definicao_relatorio", { definicao: conversao.definicao });
  if (problemasMotor.length > 0) return { ok: false, problemas: problemasMotor };

  return { ok: true, valor: { definicao: conversao.definicao, plano: plano as PlanoRelatorioIa } };
}

/** Aceita o JSON puro ou cercado de texto/```json — IAs de chat (modo
 * manual) quase sempre embrulham a resposta. */
export function extrairJson(texto: string): unknown {
  const semCerca = texto.replace(/```(?:json)?/gi, "");
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(semCerca.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto ? texto : null;
}

function listaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
}

export function converterPlano(
  bruto: unknown,
  contexto: ContextoAssistente,
): { ok: true; definicao: ReportDefinition } | { ok: false; problemas: string[] } {
  const problemas: string[] = [];
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
    return { ok: false, problemas: ["A resposta precisa ser um objeto JSON."] };
  }
  const plano = bruto as Record<string, unknown>;
  const camposPorId = new Map(camposParaAssistente(contexto.campos).map((campo) => [campo.id, campo]));
  const disciplinasPorNome = new Map(contexto.disciplinas.map((nome) => [normalizar(nome), nome]));
  const seriesPorNome = new Map(contexto.series.map((nome) => [normalizar(nome), nome]));

  function referencia(valor: unknown, onde: string): { expressao: ExpressaoNo; campo: CampoRelatorioInfo; parametro: string | null } | null {
    if (!valor || typeof valor !== "object") {
      problemas.push(`${onde}: falta o campo.`);
      return null;
    }
    const ref = valor as Record<string, unknown>;
    const id = textoOuNulo(ref.campo);
    const campo = id ? camposPorId.get(id) : undefined;
    if (!id || !campo) {
      problemas.push(`${onde}: o campo "${id ?? ""}" não existe na lista de campos disponíveis.`);
      return null;
    }
    let parametro = campo.requer_parametro ? textoOuNulo(ref.parametro) : null;
    if (campo.requer_parametro && !parametro) {
      problemas.push(`${onde}: o campo "${id}" pede o nome da disciplina em "parametro".`);
      return null;
    }
    if (parametro && CAMPOS_COM_DISCIPLINA_DO_MAPAO.has(id) && disciplinasPorNome.size > 0) {
      const exata = disciplinasPorNome.get(normalizar(parametro));
      if (!exata) {
        problemas.push(`${onde}: a disciplina "${parametro}" não existe. Use uma destas: ${contexto.disciplinas.join("; ")}.`);
        return null;
      }
      parametro = exata;
    }
    return { expressao: { tipo: "campo", campo_id: id, parametro }, campo, parametro };
  }

  function chave(expressao: ExpressaoNo) {
    return expressao.tipo === "campo" ? `${expressao.campo_id}|${expressao.parametro ?? ""}` : "";
  }

  function rotuloPadrao(campo: CampoRelatorioInfo, parametro: string | null) {
    return parametro ? `${campo.rotulo} – ${parametro}` : campo.rotulo;
  }

  function alinhamento(campo: CampoRelatorioInfo): Alinhamento {
    return campo.tipo === "texto" ? "esquerda" : "centro";
  }

  const nome = textoOuNulo(plano.nome);
  if (!nome) problemas.push("Falta o \"nome\" do relatório.");

  // Colunas visíveis
  const colunas: ColunaRelatorio[] = [];
  const idsUsados = new Set<string>();
  function novoIdColuna(base: string) {
    let id = base;
    for (let n = 2; idsUsados.has(id); n += 1) id = `${base}_${n}`;
    idsUsados.add(id);
    return id;
  }
  const colunasPlano = Array.isArray(plano.colunas) ? plano.colunas : [];
  if (colunasPlano.length === 0) problemas.push("O relatório precisa de pelo menos uma coluna em \"colunas\".");
  colunasPlano.forEach((item, indice) => {
    const ref = referencia(item, `Coluna ${indice + 1}`);
    if (!ref) return;
    if (colunas.some((coluna) => chave(coluna.expressao) === chave(ref.expressao))) return;
    colunas.push({
      id: novoIdColuna(ref.campo.id),
      rotulo: textoOuNulo((item as Record<string, unknown>).rotulo) ?? rotuloPadrao(ref.campo, ref.parametro),
      expressao: ref.expressao,
      largura: null,
      alinhamento: alinhamento(ref.campo),
    });
  });
  // Todo relatório por aluno precisa identificar o aluno.
  if (colunas.length > 0 && !colunas.some((coluna) => chave(coluna.expressao) === "aluno_nome|")) {
    const campoNome = camposPorId.get("aluno_nome");
    if (campoNome) {
      colunas.unshift({ id: novoIdColuna("aluno_nome"), rotulo: campoNome.rotulo, expressao: { tipo: "campo", campo_id: "aluno_nome", parametro: null }, largura: null, alinhamento: "esquerda" });
    }
  }

  // Condições
  const condicoes: FiltroCondicao[] = [];
  const condicoesPlano = Array.isArray(plano.condicoes) ? plano.condicoes : [];
  condicoesPlano.forEach((item, indice) => {
    const onde = `Condição ${indice + 1}`;
    const ref = referencia(item, onde);
    if (!ref) return;
    const condicao = item as Record<string, unknown>;
    const operador = textoOuNulo(condicao.operador) as OperadorFiltro | null;
    if (!operador || !OPERADORES.includes(operador)) {
      problemas.push(`${onde}: o operador "${String(condicao.operador ?? "")}" não existe.`);
      return;
    }
    if (operador === "vazio" || operador === "nao_vazio") {
      condicoes.push({ campo: ref.expressao, operador, valor: null });
      return;
    }
    const valor = condicao.valor;
    let valorExpressao: ExpressaoNo | null = null;
    if (typeof valor === "number" && Number.isFinite(valor)) {
      valorExpressao = { tipo: "literal", valor: { tipo: "numero", valor } };
    } else if (typeof valor === "boolean") {
      valorExpressao = { tipo: "literal", valor: { tipo: "booleano", valor } };
    } else if (typeof valor === "string" && valor.trim() !== "") {
      const numero = Number(valor.replace(",", "."));
      valorExpressao = ref.campo.tipo !== "texto" && Number.isFinite(numero)
        ? { tipo: "literal", valor: { tipo: "numero", valor: numero } }
        : { tipo: "literal", valor: { tipo: "texto", valor: valor.trim() } };
    } else if (valor && typeof valor === "object") {
      const outro = referencia(valor, `${onde} (valor)`);
      if (!outro) return;
      valorExpressao = outro.expressao;
    }
    if (!valorExpressao) {
      problemas.push(`${onde}: falta o "valor" para comparar.`);
      return;
    }
    condicoes.push({ campo: ref.expressao, operador, valor: valorExpressao });
  });

  // Ordenação: ordena por uma coluna já visível ou cria uma oculta no fim.
  const ocultas: ColunaRelatorio[] = [];
  const ordenacao: OrdenacaoRelatorio[] = [];
  const ordenacaoPlano = Array.isArray(plano.ordenacao) ? plano.ordenacao : [];
  ordenacaoPlano.forEach((item, indice) => {
    const ref = referencia(item, `Ordenação ${indice + 1}`);
    if (!ref) return;
    let coluna = [...colunas, ...ocultas].find((existente) => chave(existente.expressao) === chave(ref.expressao));
    if (!coluna) {
      coluna = { id: novoIdColuna(`ordem_${ref.campo.id}`), rotulo: rotuloPadrao(ref.campo, ref.parametro), expressao: ref.expressao, largura: null, alinhamento: "centro", oculta: true };
      ocultas.push(coluna);
    }
    ordenacao.push({ coluna_id: coluna.id, decrescente: (item as Record<string, unknown>).decrescente === true });
  });

  let agrupamentoCampo: ExpressaoNo | null = null;
  if (plano.agrupar_por) {
    const ref = referencia(plano.agrupar_por, "Agrupamento");
    if (ref) agrupamentoCampo = ref.expressao;
  }
  const limite = typeof plano.limite === "number" && Number.isFinite(plano.limite) && plano.limite > 0 ? Math.round(plano.limite) : null;

  // Turmas
  const turmas = (plano.turmas && typeof plano.turmas === "object" ? plano.turmas : {}) as Record<string, unknown>;
  const series: string[] = [];
  for (const serie of listaDeTextos(turmas.series)) {
    const exata = seriesPorNome.get(normalizar(serie));
    if (exata) series.push(exata);
    else problemas.push(`A série "${serie}" não existe. Use uma destas: ${contexto.series.join("; ")}.`);
  }
  const periodos = listaDeTextos(turmas.periodos).map((periodo) => normalizar(periodo).toUpperCase());
  periodos.filter((periodo) => !PERIODOS.includes(periodo)).forEach((periodo) => problemas.push(`O período "${periodo}" não existe. Use MANHA, TARDE, NOITE ou INTEGRAL.`));
  const ciclos = listaDeTextos(turmas.ciclos).map((ciclo) => ciclo.toUpperCase());
  ciclos.filter((ciclo) => !CICLOS.includes(ciclo)).forEach((ciclo) => problemas.push(`O ciclo "${ciclo}" não existe. Use EI, EFAI, EFAF ou EM.`));

  if (problemas.length > 0) return { ok: false, problemas };

  const formato = FORMATOS.includes(plano.formato as FormatoSaida) ? (plano.formato as FormatoSaida) : "docx";
  const introducao = textoOuNulo(plano.introducao);
  const blocos: BlocoRelatorio[] = [
    { id: idLocal("blk"), ativo: true, tipo: "cabecalho" },
    { id: idLocal("blk"), ativo: true, tipo: "titulo", tamanho: 14, cor: "#800080" },
    ...(introducao ? [{ id: idLocal("blk"), ativo: true, tipo: "texto", titulo: null, corpo: introducao, tamanho_titulo: 14, tamanho_corpo: 11 } as BlocoRelatorio] : []),
    { id: idLocal("blk"), ativo: true, tipo: "tabela", secao_index: 0 },
  ];

  return {
    ok: true,
    definicao: {
      id: idLocal("relatorio"),
      nome: nome as string,
      descricao: textoOuNulo(plano.descricao) ?? "",
      embutido: false,
      fonte: { series, periodos, ciclos, codigos: [] },
      parametros: [],
      secoes: [
        {
          titulo: null,
          fonte_linhas: { tipo: "por_aluno" },
          filtros: { combinador: plano.combinador === "ou" ? "ou" : "e", condicoes },
          colunas: [...colunas, ...ocultas],
          ordenacao,
          agrupamento: { campo: agrupamentoCampo, limite_por_grupo: limite },
        },
      ],
      blocos,
      formato_saida: formato,
    },
  };
}
