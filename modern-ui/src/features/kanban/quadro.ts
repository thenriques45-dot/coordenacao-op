import {
  chaveData,
  colunaDaTarefa,
  normalizarTextoGestao,
  obterResponsaveisTarefa,
  obterVinculosTarefa,
  ordenarPorPrazoECriacao,
  ordenarTarefasKanban,
  type KanbanColuna,
  type KanbanPrioridade,
  type KanbanStatus,
  type KanbanTarefa,
  type OrdenacaoColuna,
} from "../management";
import type { CSSProperties } from "react";
import { nomesCompativeis } from "../workgroupSync";

// Lógica do quadro sem React: filtros, ordem das colunas, reposicionamento e
// arquivamento. Tudo aqui recebe e devolve dados, para ser testável sem tela.

// ── Filtros ─────────────────────────────────────────────────────────────────

export type FiltrosQuadro = {
  busca: string;
  minhas: boolean;
  alta: boolean;
  semana: boolean;
};

export const filtrosVazios: FiltrosQuadro = { busca: "", minhas: false, alta: false, semana: false };

export function algumFiltroAtivo(filtros: FiltrosQuadro) {
  return Boolean(filtros.busca.trim()) || filtros.minhas || filtros.alta || filtros.semana;
}

// Domingo da semana corrente (semana de segunda a domingo).
export function fimDaSemana(hoje = new Date()): string {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diasAteDomingo = (7 - base.getDay()) % 7;
  base.setDate(base.getDate() + diasAteDomingo);
  return chaveData(base);
}

export function tarefaPassaNosFiltros(
  tarefa: KanbanTarefa,
  filtros: FiltrosQuadro,
  contexto: { nomePerfil: string; concluintes: Set<KanbanStatus>; hoje?: Date },
) {
  if (filtros.alta && tarefa.prioridade !== "alta") return false;

  if (filtros.minhas) {
    const nome = contexto.nomePerfil.trim();
    if (!nome || !obterResponsaveisTarefa(tarefa).some((responsavel) => nomesCompativeis(responsavel, nome))) return false;
  }

  // "Vence esta semana" inclui as ATRASADAS de propósito: uma tarefa que
  // venceu semana passada e segue aberta pede mais atenção do que uma que
  // vence sexta — escondê-la justo nesse filtro seria o pior resultado.
  // Concluídas ficam de fora: não "vencem" mais.
  if (filtros.semana) {
    if (!tarefa.prazo || contexto.concluintes.has(tarefa.status)) return false;
    if (tarefa.prazo > fimDaSemana(contexto.hoje)) return false;
  }

  const termo = normalizarTextoGestao(filtros.busca);
  if (termo) {
    const alvo = [tarefa.titulo, ...tarefa.etiquetas, ...obterVinculosTarefa(tarefa)].map(normalizarTextoGestao).join(" ");
    if (!alvo.includes(termo)) return false;
  }

  return true;
}

// ── Ordem das colunas ───────────────────────────────────────────────────────

const PESO_PRIORIDADE: Record<KanbanPrioridade, number> = { alta: 0, media: 1, baixa: 2 };

export function ordenarPorOrdenacao(tarefas: KanbanTarefa[], ordenacao: OrdenacaoColuna = "manual") {
  const copia = [...tarefas];
  if (ordenacao === "prazo") return copia.sort(ordenarPorPrazoECriacao);
  if (ordenacao === "prioridade") {
    return copia.sort((a, b) => PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade] || ordenarPorPrazoECriacao(a, b));
  }
  return copia.sort(ordenarTarefasKanban);
}

// Tarefas não arquivadas que APARECEM na coluna, na ordem da coluna. Usa a
// coluna de exibição (ver colunaDaTarefa): tarefa de colega com coluna que
// não existe aqui entra na primeira.
export function tarefasDaColuna(tarefas: KanbanTarefa[], coluna: KanbanColuna, colunas: KanbanColuna[]) {
  return ordenarPorOrdenacao(
    tarefas.filter((tarefa) => !tarefa.arquivadaEm && colunaDaTarefa(tarefa, colunas)?.id === coluna.id),
    coluna.ordenacao,
  );
}

export function arquivadasDaColuna(tarefas: KanbanTarefa[], coluna: KanbanColuna, colunas: KanbanColuna[]) {
  return tarefas.filter((tarefa) => tarefa.arquivadaEm && colunaDaTarefa(tarefa, colunas)?.id === coluna.id);
}

// Grava a ordem exibida como ordem manual.
//
// Só a tarefa MOVIDA recebe o status da coluna (e updatedAt, se mudou de
// coluna). As vizinhas ficam com o status que têm: algumas só aparecem nesta
// coluna pelo desempate de colunaDaTarefa (coluna de colega, coluna excluída),
// e regravar o status delas seria editá-las em silêncio — sem updatedAt, a
// mudança nem sincronizaria na hora, e vazaria na próxima edição da tarefa.
// Reordenar vizinhas também não carimba updatedAt: não é uma edição delas.
function gravarOrdem(tarefas: KanbanTarefa[], ordenadas: KanbanTarefa[], status: KanbanStatus, movidaId: string | null, agora: string) {
  const posicao = new Map(ordenadas.map((tarefa, indice) => [tarefa.id, indice]));
  return tarefas.map((tarefa) => {
    const ordem = posicao.get(tarefa.id);
    if (ordem === undefined) return tarefa;
    if (tarefa.id !== movidaId) return { ...tarefa, ordem };
    const mudouDeColuna = tarefa.status !== status;
    return {
      ...tarefa,
      status,
      ordem,
      ...(mudouDeColuna ? { updatedAt: agora } : {}),
    };
  });
}

// Coloca a tarefa `id` na coluna `destino`, antes de `antesDeId` (ou no fim,
// se nulo). A coluna de destino passa a ter ordem manual — quem chama deve
// marcar `ordenacao: "manual"` nela.
export function moverParaPosicao(
  tarefas: KanbanTarefa[],
  colunas: KanbanColuna[],
  id: string,
  destino: KanbanStatus,
  antesDeId: string | null,
  agora = new Date().toISOString(),
) {
  const movida = tarefas.find((tarefa) => tarefa.id === id);
  const coluna = colunas.find((item) => item.id === destino);
  if (!movida || !coluna) return tarefas;
  if (antesDeId === id) return tarefas;

  const lista = tarefasDaColuna(tarefas, coluna, colunas).filter((tarefa) => tarefa.id !== id);
  const indiceAlvo = antesDeId ? lista.findIndex((tarefa) => tarefa.id === antesDeId) : -1;
  const indice = indiceAlvo >= 0 ? indiceAlvo : lista.length;
  lista.splice(indice, 0, movida);
  return gravarOrdem(tarefas, lista, destino, id, agora);
}

// ↑ Subir / ↓ Descer: troca com a vizinha na ordem exibida da coluna.
export function deslocarNaColuna(tarefas: KanbanTarefa[], colunas: KanbanColuna[], id: string, direcao: -1 | 1) {
  const tarefa = tarefas.find((item) => item.id === id);
  const coluna = tarefa ? colunaDaTarefa(tarefa, colunas) : undefined;
  if (!tarefa || !coluna) return tarefas;
  const lista = tarefasDaColuna(tarefas, coluna, colunas);
  const indice = lista.findIndex((item) => item.id === id);
  const vizinha = indice + direcao;
  if (indice < 0 || vizinha < 0 || vizinha >= lista.length) return tarefas;
  [lista[indice], lista[vizinha]] = [lista[vizinha], lista[indice]];
  return gravarOrdem(tarefas, lista, coluna.id, null, "");
}

export function moverTarefasPara(tarefas: KanbanTarefa[], ids: string[], destino: KanbanStatus, agora = new Date().toISOString()) {
  const alvo = new Set(ids);
  return tarefas.map((tarefa) =>
    alvo.has(tarefa.id) && tarefa.status !== destino ? { ...tarefa, status: destino, ordem: undefined, updatedAt: agora } : tarefa,
  );
}

// ── Colunas configuráveis ───────────────────────────────────────────────────

// Paleta da seção 5 do handoff.
export const CORES_COLUNA = ["#2f78ff", "#f2aa00", "#a844f5", "#13c65c", "#e8202a", "#0d9488"];

// Versão da cor para o tema escuro (seção 8 do handoff). Só as 4 cores das
// colunas padrão têm par definido; o vermelho #e8202a é a primária, que o
// handoff mantém igual nos dois temas, e #0d9488 não tem par na tabela.
export const CORES_COLUNA_ESCURO: Record<string, string> = {
  "#2f78ff": "#6aa0ff",
  "#f2aa00": "#e3ad3e",
  "#a844f5": "#c47dff",
  "#13c65c": "#34d178",
};

// Variáveis de cor de uma coluna para o CSS escolher pelo tema (.kb-cor-coluna).
//
// A cor é dado do usuário, então chega em estilo inline — que o CSS de tema
// não consegue sobrescrever. Passando as DUAS versões como variáveis, o tema
// escuro troca a cor sem o JavaScript precisar saber qual tema está ativo.
// Cor fora da tabela (escolhida antes, ou importada de backup) fica igual.
export function estiloCorColuna(cor: string): CSSProperties {
  return {
    "--kb-cor-coluna": cor,
    "--kb-cor-coluna-escura": CORES_COLUNA_ESCURO[cor.toLowerCase()] ?? cor,
  } as CSSProperties;
}

// Coluna nova no fim do quadro, com a primeira cor da paleta ainda não usada
// (ou seguindo o ciclo, se todas já estiverem em uso).
export function criarColuna(colunas: KanbanColuna[], agora = Date.now()): KanbanColuna {
  const usadas = new Set(colunas.map((coluna) => coluna.cor.toLowerCase()));
  const cor = CORES_COLUNA.find((item) => !usadas.has(item)) ?? CORES_COLUNA[colunas.length % CORES_COLUNA.length];
  let id = `coluna-${agora.toString(36)}`;
  for (let n = 2; colunas.some((coluna) => coluna.id === id); n++) id = `coluna-${agora.toString(36)}-${n}`;
  return { id, titulo: "Nova coluna", cor, ordenacao: "manual" };
}

export type ResultadoExclusaoColuna = {
  colunas: KanbanColuna[];
  tarefas: KanbanTarefa[];
  destino: KanbanColuna;
  movidas: number;
  // Ordem anterior das tarefas cuja `ordem` mudou, para o Desfazer.
  ordemAnterior: Map<string, number | undefined>;
};

// Exclui a coluna e manda os cartões dela para a primeira coluna restante.
//
// O `status` das tarefas NÃO é reescrito. Elas passam a aparecer na primeira
// coluna pelo mesmo desempate que já trata tarefas de colegas com colunas que
// não existem aqui (ver colunaDaTarefa). Reescrever o status seria editar a
// tarefa: a sincronização levaria a mudança aos colegas e moveria o cartão no
// quadro de quem ainda tem aquela coluna — e colunas são locais de propósito.
//
// Só a `ordem` é regravada (sem updatedAt, como num arraste), para os cartões
// chegarem no FIM da coluna de destino em vez de se intercalarem com os dela.
export function excluirColuna(colunas: KanbanColuna[], tarefas: KanbanTarefa[], id: KanbanStatus): ResultadoExclusaoColuna | null {
  if (colunas.length <= 1) return null;
  const alvo = colunas.find((coluna) => coluna.id === id);
  if (!alvo) return null;
  const restantes = colunas.filter((coluna) => coluna.id !== id);
  const destino = restantes[0];

  const daColuna = tarefasDaColuna(tarefas, alvo, colunas);
  const doDestino = tarefasDaColuna(tarefas, destino, colunas);
  const lista = [...doDestino, ...daColuna];
  const posicao = new Map(lista.map((tarefa, indice) => [tarefa.id, indice]));
  const ordemAnterior = new Map<string, number | undefined>();

  const novas = tarefas.map((tarefa) => {
    const ordem = posicao.get(tarefa.id);
    if (ordem === undefined || tarefa.ordem === ordem) return tarefa;
    ordemAnterior.set(tarefa.id, tarefa.ordem);
    return { ...tarefa, ordem };
  });

  return { colunas: restantes, tarefas: novas, destino, movidas: daColuna.length, ordemAnterior };
}

// Desfaz a exclusão: devolve a coluna à posição original e a ordem anterior
// dos cartões. Usa o estado ATUAL (não uma cópia de antes), para não perder o
// que foi feito no quadro durante a janela do Desfazer.
export function desfazerExclusaoColuna(
  colunasAtuais: KanbanColuna[],
  tarefasAtuais: KanbanTarefa[],
  coluna: KanbanColuna,
  indice: number,
  ordemAnterior: Map<string, number | undefined>,
) {
  const colunas = [...colunasAtuais];
  if (!colunas.some((item) => item.id === coluna.id)) colunas.splice(Math.min(indice, colunas.length), 0, coluna);
  const tarefas = tarefasAtuais.map((tarefa) => (ordemAnterior.has(tarefa.id) ? { ...tarefa, ordem: ordemAnterior.get(tarefa.id) } : tarefa));
  return { colunas, tarefas };
}

// ── Arquivamento ────────────────────────────────────────────────────────────

export function arquivarTarefas(tarefas: KanbanTarefa[], ids: string[], agora = new Date().toISOString()) {
  const alvo = new Set(ids);
  return tarefas.map((tarefa) => (alvo.has(tarefa.id) ? { ...tarefa, arquivadaEm: agora, updatedAt: agora } : tarefa));
}

export function restaurarTarefas(tarefas: KanbanTarefa[], ids: string[], agora = new Date().toISOString()) {
  const alvo = new Set(ids);
  return tarefas.map((tarefa) => {
    if (!alvo.has(tarefa.id)) return tarefa;
    const { arquivadaEm: _arquivadaEm, ...restante } = tarefa;
    return { ...restante, updatedAt: agora };
  });
}

// ── Exibição (densidade e cartões recolhidos) ───────────────────────────────
// Preferência visual desta instalação. Fica FORA dos dados da tarefa: a
// tarefa sincroniza, e recolher um cartão aqui não pode recolhê-lo no quadro
// do colega. Também não entra no espelho em disco — perder isso numa limpeza
// de cache não custa nada.

export type ExibicaoQuadro = {
  densidade: "confortavel" | "compacto";
  // Cartões cujo estado difere do padrão da densidade.
  excecoes: Record<string, true>;
};

export const EXIBICAO_STORAGE_KEY = "coordenacaoop:kanban-exibicao:v1";

export function carregarExibicao(): ExibicaoQuadro {
  try {
    const salva = localStorage.getItem(EXIBICAO_STORAGE_KEY);
    const dados = salva ? (JSON.parse(salva) as Partial<ExibicaoQuadro>) : {};
    return {
      densidade: dados.densidade === "compacto" ? "compacto" : "confortavel",
      excecoes: dados.excecoes && typeof dados.excecoes === "object" ? dados.excecoes : {},
    };
  } catch {
    return { densidade: "confortavel", excecoes: {} };
  }
}

export function salvarExibicao(exibicao: ExibicaoQuadro) {
  try {
    localStorage.setItem(EXIBICAO_STORAGE_KEY, JSON.stringify(exibicao));
  } catch {
    // Preferência visual: falhar em gravar não pode atrapalhar o uso.
  }
}

// O botão global define o padrão; o chevron de cada cartão é uma exceção
// sobre ele. Trocar a densidade zera as exceções (ver alternarDensidade).
export function cartaoAberto(id: string, exibicao: ExibicaoQuadro) {
  const excecao = Boolean(exibicao.excecoes[id]);
  return exibicao.densidade === "confortavel" ? !excecao : excecao;
}

export function alternarCartao(id: string, exibicao: ExibicaoQuadro): ExibicaoQuadro {
  const excecoes = { ...exibicao.excecoes };
  if (excecoes[id]) delete excecoes[id];
  else excecoes[id] = true;
  return { ...exibicao, excecoes };
}

export function alternarDensidade(densidade: ExibicaoQuadro["densidade"]): ExibicaoQuadro {
  return { densidade, excecoes: {} };
}
