export type KanbanStatus = "fazer" | "progresso" | "revisao" | "concluido";
export type KanbanPrioridade = "alta" | "media" | "baixa";

export type KanbanAnexo = {
  id: string;
  nome: string;
  tipo: string;
  dados: string;
  caminho?: string;
  origem?: "embutido" | "interno" | "externo";
};

export type KanbanColuna = {
  id: KanbanStatus;
  titulo: string;
  cor: string;
};

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays?: number[];
  until?: string;
};

export type KanbanAlerta = {
  diasAntes: number;
  ativo: boolean;
  disparadoEm?: string;
};

export type KanbanTarefa = {
  id: string;
  titulo: string;
  descricao: string;
  etiquetas: string[];
  responsavel: string;
  dataInicio?: string;
  prazo: string;
  prioridade: KanbanPrioridade;
  status: KanbanStatus;
  ordem?: number;
  anexos?: KanbanAnexo[];
  eventId?: string;
  vinculo?: string;
  vinculos?: string[];
  recorrencia?: RecurrenceRule;
  alertas?: KanbanAlerta[];
  compartilhada?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type KanbanDragPreview = {
  tarefa: KanbanTarefa;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CalendarEvent = {
  id: string;
  titulo: string;
  descricao: string;
  data: string;
  dataFim?: string;
  horaInicio: string;
  horaFim: string;
  categoria: string;
  cor: string;
  prioridade: KanbanPrioridade;
  vinculo: string;
  vinculos?: string[];
  recorrencia?: RecurrenceRule;
  createdAt?: string;
  updatedAt?: string;
};

export type TimelineItem = {
  id: string;
  origemId: string;
  tipo: "evento" | "tarefa";
  titulo: string;
  descricao: string;
  data: string;
  hora?: string;
  cor: string;
  prioridade: KanbanPrioridade;
  status?: KanbanStatus;
  eventId?: string;
  recorrente?: boolean;
};

export const KANBAN_STORAGE_KEY = "coordenacaoop:quadro-kanban:v1";
export const KANBAN_COLUMNS_STORAGE_KEY = "coordenacaoop:quadro-kanban-colunas:v1";
export const CALENDAR_STORAGE_KEY = "coordenacaoop:calendario-gestao:v1";
export const KANBAN_UPDATED_EVENT = "coordenacaoop:kanban-updated";

export const colunasKanbanPadrao: KanbanColuna[] = [
  { id: "fazer", titulo: "A Fazer", cor: "#2f78ff" },
  { id: "progresso", titulo: "Em Progresso", cor: "#f2aa00" },
  { id: "revisao", titulo: "Em Revisão", cor: "#a844f5" },
  { id: "concluido", titulo: "Concluído", cor: "#13c65c" },
];

export const coresKanban = ["#2f78ff", "#f2aa00", "#a844f5", "#13c65c", "#f04438", "#14b8a6", "#64748b"];
export const coresCalendario = ["#3794ff", "#13c65c", "#f2aa00", "#a844f5", "#f04438", "#14b8a6", "#64748b"];

export const tarefasKanbanIniciais: KanbanTarefa[] = [];
export const eventosCalendarioIniciais: CalendarEvent[] = [];

export function carregarTarefasKanban() {
  try {
    const salvas = localStorage.getItem(KANBAN_STORAGE_KEY);
    return salvas ? JSON.parse(salvas) as KanbanTarefa[] : tarefasKanbanIniciais;
  } catch {
    return tarefasKanbanIniciais;
  }
}

export function salvarTarefasKanban(tarefas: KanbanTarefa[]) {
  localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify(tarefas));
  window.dispatchEvent(new CustomEvent(KANBAN_UPDATED_EVENT));
}

export function carregarEventosCalendario() {
  try {
    const salvos = localStorage.getItem(CALENDAR_STORAGE_KEY);
    return salvos ? JSON.parse(salvos) as CalendarEvent[] : eventosCalendarioIniciais;
  } catch {
    return eventosCalendarioIniciais;
  }
}

export function carregarTarefasKanbanDashboard() {
  try {
    return carregarTarefasKanban()
      .filter((tarefa) => tarefaEstaAtiva(tarefa))
      .sort((a, b) => a.prazo.localeCompare(b.prazo))
      .slice(0, 3);
  } catch {
    return tarefasKanbanIniciais
      .filter((tarefa) => tarefaEstaAtiva(tarefa))
      .sort((a, b) => a.prazo.localeCompare(b.prazo))
      .slice(0, 3);
  }
}

export function tarefaEstaAtiva(tarefa: KanbanTarefa) {
  return tarefa.status !== "concluido";
}

export function rotuloPrioridade(prioridade: KanbanPrioridade) {
  if (prioridade === "alta") return "Alta";
  if (prioridade === "media") return "Média";
  return "Baixa";
}

export function parseDataLocal(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1);
}

export function formatarDataLonga(data: string) {
  if (!data) return "";
  return parseDataLocal(data).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function chaveData(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function adicionarMeses(data: Date, meses: number) {
  const proxima = new Date(data);
  proxima.setMonth(proxima.getMonth() + meses);
  return proxima;
}

export function diferencaDias(data: string) {
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const alvo = parseDataLocal(data);
  return Math.ceil((alvo.getTime() - base.getTime()) / 86400000);
}

export function rotuloDiasAte(data: string) {
  const dias = diferencaDias(data);
  if (dias < 0) return `${Math.abs(dias)} dia(s) atrás`;
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  return `Faltam ${dias} dias`;
}

export function rotuloRecorrencia(regra?: RecurrenceRule) {
  if (!regra) return "Não repetir";
  const intervalo = regra.interval > 1 ? ` a cada ${regra.interval}` : "";
  if (regra.frequency === "daily") return `Diariamente${intervalo}`;
  if (regra.frequency === "weekly") return `Semanalmente${intervalo}`;
  if (regra.frequency === "monthly") return `Mensalmente${intervalo}`;
  return `Anualmente${intervalo}`;
}

export function proximaOcorrencia(baseData: string, regra?: RecurrenceRule, limiteDias = 180) {
  if (!regra) return baseData;
  const hoje = new Date();
  const inicio = parseDataLocal(baseData);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + limiteDias);
  let atual = inicio;
  let tentativas = 0;

  while (atual < hoje && atual <= limite && tentativas < 1500) {
    if (regra.frequency === "daily") {
      atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + regra.interval);
    } else if (regra.frequency === "weekly") {
      atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + 7 * regra.interval);
    } else if (regra.frequency === "monthly") {
      atual = adicionarMeses(atual, regra.interval);
    } else {
      atual = new Date(atual.getFullYear() + regra.interval, atual.getMonth(), atual.getDate());
    }
    tentativas += 1;
  }

  if (atual < hoje) return baseData;
  if (regra.until && atual > parseDataLocal(regra.until)) return baseData;
  return chaveData(atual);
}

export function expandirOcorrencias(baseData: string, regra?: RecurrenceRule, limiteDias = 90) {
  const inicio = parseDataLocal(baseData);
  const fim = new Date();
  fim.setDate(fim.getDate() + limiteDias);
  const ocorrencias: string[] = [];
  let atual = inicio;
  let tentativas = 0;

  while (atual <= fim && tentativas < 200) {
    const chave = chaveData(atual);
    if (!regra?.until || atual <= parseDataLocal(regra.until)) {
      ocorrencias.push(chave);
    }
    if (!regra) break;
    if (regra.frequency === "daily") {
      atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + regra.interval);
    } else if (regra.frequency === "weekly") {
      atual = new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + 7 * regra.interval);
    } else if (regra.frequency === "monthly") {
      atual = adicionarMeses(atual, regra.interval);
    } else {
      atual = new Date(atual.getFullYear() + regra.interval, atual.getMonth(), atual.getDate());
    }
    tentativas += 1;
  }

  return ocorrencias;
}

function duracaoEmDias(inicioISO?: string, fimISO?: string) {
  if (!inicioISO || !fimISO) return 0;
  const inicio = parseDataLocal(inicioISO);
  const fim = parseDataLocal(fimISO);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return 0;
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86400000);
  return dias > 0 ? Math.min(dias, 366) : 0;
}

export function duracaoEventoDias(evento: CalendarEvent) {
  return duracaoEmDias(evento.data, evento.dataFim);
}

export function duracaoTarefaDias(tarefa: KanbanTarefa) {
  return duracaoEmDias(tarefa.dataInicio, tarefa.prazo);
}

function diasDoIntervalo(inicio: string, duracaoDias: number) {
  if (duracaoDias <= 0) return [inicio];
  const base = parseDataLocal(inicio);
  return Array.from({ length: duracaoDias + 1 }, (_, deslocamento) =>
    chaveData(new Date(base.getFullYear(), base.getMonth(), base.getDate() + deslocamento)),
  );
}

export function montarLinhaDoTempo(tarefas: KanbanTarefa[], eventos: CalendarEvent[], limite = 8) {
  const itens: TimelineItem[] = [
    ...eventos.flatMap((evento) => {
      const duracao = duracaoEventoDias(evento);
      return expandirOcorrencias(evento.data, evento.recorrencia).flatMap((inicio) =>
        diasDoIntervalo(inicio, duracao).map((data) => ({
          id: `${evento.id}-${data}`,
          origemId: evento.id,
          tipo: "evento" as const,
          titulo: evento.titulo,
          descricao: formatarVinculosEvento(evento) || evento.descricao,
          data,
          hora: evento.horaInicio,
          cor: evento.cor,
          prioridade: evento.prioridade,
          recorrente: Boolean(evento.recorrencia),
        })),
      );
    }),
    ...tarefas.filter((tarefa) => tarefaEstaAtiva(tarefa) && tarefa.prazo).flatMap((tarefa) => {
      const duracao = duracaoTarefaDias(tarefa);
      // Cada ocorrência é ancorada no prazo (fim); o período cobre os dias
      // de (prazo - duração) até o prazo.
      return expandirOcorrencias(tarefa.prazo, tarefa.recorrencia).flatMap((fim) => {
        const base = parseDataLocal(fim);
        const inicio = chaveData(new Date(base.getFullYear(), base.getMonth(), base.getDate() - duracao));
        return diasDoIntervalo(inicio, duracao).map((data) => ({
          id: `${tarefa.id}-${data}`,
          origemId: tarefa.id,
          tipo: "tarefa" as const,
          titulo: tarefa.titulo,
          descricao: tarefa.responsavel,
          data,
          cor: colunasKanbanPadrao.find((c) => c.id === tarefa.status)?.cor ?? "#2f78ff",
          prioridade: tarefa.prioridade,
          status: tarefa.status,
          eventId: tarefa.eventId,
          recorrente: Boolean(tarefa.recorrencia),
        }));
      });
    }),
  ];

  return itens
    .filter((item) => item.recorrente ? diferencaDias(item.data) >= 0 : diferencaDias(item.data) >= -30)
    .sort((a, b) => `${a.data}${a.hora ?? ""}`.localeCompare(`${b.data}${b.hora ?? ""}`))
    .slice(0, limite);
}

export function normalizarTextoGestao(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function separarVinculos(valor: string) {
  return deduplicarVinculos(valor.split(/[,;\n]/));
}

function deduplicarVinculos(valores: string[]) {
  const vistos = new Set<string>();
  return valores
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const chave = normalizarTextoGestao(item);
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

export function obterVinculosTarefa(tarefa: KanbanTarefa) {
  return deduplicarVinculos([
    ...(Array.isArray(tarefa.vinculos) ? tarefa.vinculos : []),
    tarefa.vinculo ?? "",
  ]);
}

export function formatarVinculosTarefa(tarefa: KanbanTarefa) {
  return obterVinculosTarefa(tarefa).join(", ");
}

export function obterVinculosEvento(evento: CalendarEvent) {
  return deduplicarVinculos([
    ...(Array.isArray(evento.vinculos) ? evento.vinculos : []),
    evento.vinculo ?? "",
  ]);
}

export function formatarVinculosEvento(evento: CalendarEvent) {
  return obterVinculosEvento(evento).join(", ");
}

function pontuarBuscaFuzzy(opcao: string, busca: string) {
  const alvo = normalizarTextoGestao(opcao);
  const termo = normalizarTextoGestao(busca);
  if (!termo) return 0;
  if (!alvo) return -1;
  if (alvo === termo) return 1000;

  const indice = alvo.indexOf(termo);
  if (indice >= 0) return 800 - indice;

  const partes = termo.split(/\s+/).filter(Boolean);
  if (partes.length > 1 && partes.every((parte) => alvo.includes(parte))) {
    return 650 - partes.reduce((total, parte) => total + alvo.indexOf(parte), 0);
  }

  let cursor = 0;
  let lacunas = 0;
  for (const caractere of termo) {
    const encontrado = alvo.indexOf(caractere, cursor);
    if (encontrado < 0) return -1;
    lacunas += encontrado - cursor;
    cursor = encontrado + 1;
  }
  return 420 - lacunas - Math.max(0, alvo.length - termo.length) * 0.5;
}

export function correspondeBuscaFuzzy(opcao: string, busca: string) {
  return pontuarBuscaFuzzy(opcao, busca) >= 0;
}

export function filtrarSugestoesFuzzy(opcoes: string[], busca: string, limite = 5) {
  const termo = normalizarTextoGestao(busca);
  if (!termo) return [];
  return opcoes
    .map((opcao) => ({ opcao, score: pontuarBuscaFuzzy(opcao, termo) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.opcao.localeCompare(b.opcao, "pt-BR"))
    .slice(0, limite)
    .map((item) => item.opcao);
}

export function tarefaCombinaComVinculo(tarefa: KanbanTarefa, eventos: CalendarEvent[], termos: string[]) {
  const evento = eventos.find((item) => item.id === tarefa.eventId);
  const texto = [
    tarefa.titulo,
    tarefa.descricao,
    tarefa.responsavel,
    ...obterVinculosTarefa(tarefa),
    ...(tarefa.etiquetas ?? []),
    evento?.titulo ?? "",
    ...(evento ? obterVinculosEvento(evento) : []),
  ].map(normalizarTextoGestao).join(" ");
  return termos.map(normalizarTextoGestao).filter(Boolean).some((termo) => correspondeBuscaFuzzy(texto, termo));
}

export function tarefasPorVinculo(tarefas: KanbanTarefa[], eventos: CalendarEvent[], termos: string[]) {
  return tarefas
    .filter(tarefaEstaAtiva)
    .filter((tarefa) => tarefaCombinaComVinculo(tarefa, eventos, termos))
    .sort(ordenarPorPrazoECriacao);
}

function extrairOrdemCriacao(id: string) {
  const numero = Number(id.replace(/\D+/g, ""));
  return Number.isFinite(numero) ? numero : 0;
}

export function ordenarPorPrazoECriacao(a: KanbanTarefa, b: KanbanTarefa) {
  const porPrazo = a.prazo.localeCompare(b.prazo);
  if (porPrazo !== 0) return porPrazo;
  return extrairOrdemCriacao(a.id) - extrairOrdemCriacao(b.id);
}

export function ordenarTarefasKanban(a: KanbanTarefa, b: KanbanTarefa) {
  const aManual = typeof a.ordem === "number";
  const bManual = typeof b.ordem === "number";
  if (aManual && bManual && a.ordem !== b.ordem) {
    return (a.ordem ?? 0) - (b.ordem ?? 0);
  }
  if (aManual !== bManual) {
    return aManual ? -1 : 1;
  }
  return ordenarPorPrazoECriacao(a, b);
}

export function reordenarColunaKanban(tarefas: KanbanTarefa[], colunaOrdenada: KanbanTarefa[], status: KanbanStatus) {
  const ordemPorId = new Map(colunaOrdenada.map((tarefa, indice) => [tarefa.id, indice]));
  return tarefas.map((tarefa) => {
    const ordem = ordemPorId.get(tarefa.id);
    if (ordem === undefined) {
      return tarefa.status === status ? { ...tarefa, ordem: undefined } : tarefa;
    }
    return { ...tarefa, status, ordem };
  });
}

export function formatarDataCurta(data: string) {
  if (!data) return "";
  const [ano, mes, dia] = data.split("-");
  if (!ano || !mes || !dia) return data;
  return `${dia}/${mes}/${ano}`;
}

export function arquivoParaAnexo(arquivo: File): Promise<KanbanAnexo> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      resolve({
        id: `anexo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        nome: arquivo.name,
        tipo: arquivo.type || "application/octet-stream",
        dados: String(leitor.result),
        origem: "embutido",
      });
    };
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}
