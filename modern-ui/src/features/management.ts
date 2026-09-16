// Id de uma coluna do quadro. Era um union fechado com as 4 colunas fixas;
// virou string porque as colunas passaram a ser dados da instalação (o
// coordenador renomeia, cria e exclui). Nada no app pode voltar a comparar
// este valor com um literal — quem precisa saber se a tarefa está concluída
// pergunta para a coluna, via `tarefaEstaConcluida`/`idsDeConclusao`.
export type KanbanStatus = string;
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
  // Marca a coluna de conclusão: título riscado, ícone de check, "arquivar
  // concluídas" e o silenciamento dos alertas de prazo dependem dela, e não
  // mais do id "concluido". Opcional porque instalações que salvaram as
  // colunas antes desta flag existir não a têm — ver `idsDeConclusao`.
  conclui?: boolean;
  // Como a coluna exibe as tarefas. Arrastar ou usar Subir/Descer devolve a
  // coluna para "manual". Ausente = manual.
  ordenacao?: OrdenacaoColuna;
  // Coluna recolhida numa faixa vertical estreita. Estado da instalação,
  // como tudo nas colunas (elas não sincronizam).
  recolhida?: boolean;
};

export type OrdenacaoColuna = "manual" | "prazo" | "prioridade";

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
  responsaveis?: string[];
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
  // Quando foi arquivada. Arquivada some do quadro, do calendário, da
  // dashboard, da tela da turma e dos alertas de prazo — mas continua nos
  // dados e pode ser restaurada. Arquivar muda o updatedAt, então numa tarefa
  // compartilhada o arquivamento chega aos colegas pela sincronização.
  arquivadaEm?: string;
  createdAt?: string;
  updatedAt?: string;
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
  { id: "concluido", titulo: "Concluído", cor: "#13c65c", conclui: true },
];

// Fonte única das colunas da instalação. As colunas são LOCAIS: saíram da
// sincronização de grupo de propósito, porque o payload trazia o conjunto
// inteiro e o último a sincronizar sobrescrevia o dos outros — com colunas
// configuráveis isso reverteria renomeações alheias a cada ciclo de 45 s.
export function carregarColunasKanban(): KanbanColuna[] {
  try {
    const salvas = localStorage.getItem(KANBAN_COLUMNS_STORAGE_KEY);
    const colunas = salvas ? JSON.parse(salvas) as KanbanColuna[] : null;
    return colunas?.length ? colunas : colunasKanbanPadrao;
  } catch {
    return colunasKanbanPadrao;
  }
}

// Ids das colunas que contam como "concluído".
//
// Instalações que salvaram as colunas antes da flag `conclui` existir não a
// têm em nenhuma coluna. Nesse caso cai no id "concluido", que era o nome
// fixo da coluna de conclusão — sem isso, atualizar o app faria toda tarefa
// concluída voltar a ser tratada como pendente (alerta de prazo tocando de
// novo, contagem de alta prioridade inflada).
//
// O fallback vale só quando NENHUMA coluna tem a flag definida. Basta uma
// coluna com `conclui` gravado (true ou false) para a flag passar a mandar —
// é o que permite ao coordenador desmarcar "Coluna de conclusão" numa
// instalação antiga, onde o id "concluido" concluiria para sempre.
export function idsDeConclusao(colunas: KanbanColuna[] = carregarColunasKanban()): Set<KanbanStatus> {
  if (colunas.some((coluna) => coluna.conclui !== undefined)) {
    return new Set(colunas.filter((coluna) => coluna.conclui).map((coluna) => coluna.id));
  }
  return new Set(colunas.filter((coluna) => coluna.id === "concluido").map((coluna) => coluna.id));
}

export function tarefaEstaConcluida(tarefa: KanbanTarefa, concluintes: Set<KanbanStatus> = idsDeConclusao()) {
  return concluintes.has(tarefa.status);
}

// Coluna onde nasce uma tarefa nova. Era o literal "fazer" espalhado pelo
// app; com colunas configuráveis, esse id pode simplesmente não existir mais
// e a tarefa nasceria órfã — visível só pelo desempate de `colunaDaTarefa`,
// mas com um status que nenhuma coluna reconhece.
export function statusPadrao(colunas: KanbanColuna[] = carregarColunasKanban()): KanbanStatus {
  return colunas[0]?.id ?? colunasKanbanPadrao[0].id;
}

// Para onde vai uma tarefa marcada como concluída fora do quadro (ex.: o
// botão da Dashboard). Cai na última coluna se nenhuma estiver marcada — num
// quadro, a última posição é o fim do fluxo, e é melhor que não fazer nada.
export function statusDeConclusao(colunas: KanbanColuna[] = carregarColunasKanban()): KanbanStatus {
  const [primeiraConcluinte] = Array.from(idsDeConclusao(colunas));
  return primeiraConcluinte ?? colunas[colunas.length - 1]?.id ?? "concluido";
}

// Coluna onde a tarefa deve APARECER.
//
// Uma tarefa compartilhada pode chegar com o id de uma coluna que só existe
// no quadro de quem a criou. Ela cai na primeira coluna para não sumir da
// tela — mas o `status` dela NÃO é reescrito: reescrever propagaria a
// mudança de volta e moveria o cartão no quadro do colega que tem a coluna.
// A correção só vale para exibição; arrastar o cartão (aí sim uma ação do
// usuário) é o que grava um status local.
export function colunaDaTarefa(tarefa: KanbanTarefa, colunas: KanbanColuna[]) {
  return colunas.find((coluna) => coluna.id === tarefa.status) ?? colunas[0];
}

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

// Ponto único de "esta tarefa ainda pede atenção": Calendário, Dashboard,
// tela da turma e a contagem de alta prioridade passam todos por aqui. Por
// isso o arquivamento é checado AQUI, e não em cada tela.
export function tarefaEstaAtiva(tarefa: KanbanTarefa, concluintes: Set<KanbanStatus> = idsDeConclusao()) {
  return !tarefa.arquivadaEm && !concluintes.has(tarefa.status);
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
  const colunas = carregarColunasKanban();
  const concluintes = idsDeConclusao(colunas);
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
    ...tarefas.filter((tarefa) => tarefaEstaAtiva(tarefa, concluintes) && tarefa.prazo).flatMap((tarefa) => {
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
          descricao: formatarResponsaveisTarefa(tarefa),
          data,
          cor: colunaDaTarefa(tarefa, colunas)?.cor ?? "#2f78ff",
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

export function obterResponsaveisTarefa(tarefa: KanbanTarefa) {
  return deduplicarVinculos([
    ...(Array.isArray(tarefa.responsaveis) ? tarefa.responsaveis : []),
    tarefa.responsavel ?? "",
  ]);
}

export function formatarResponsaveisTarefa(tarefa: KanbanTarefa) {
  return obterResponsaveisTarefa(tarefa).join(", ");
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

// Só substring completa ou todas as palavras do termo presentes — ao
// contrário de pontuarBuscaFuzzy (usada em filtrarSugestoesFuzzy pro
// autocomplete de uma lista curta, onde tolerar letras soltas fora de ordem
// ajuda), aqui o texto é um parágrafo inteiro (título+descrição+vínculos da
// tarefa). O fallback de subsequência de caracteres, aplicado a um texto tão
// longo, quase sempre encontra as letras do nome de QUALQUER aluno em algum
// lugar com lacunas — foi assim que uma tarefa vinculada só a "Polyana
// David" aparecia na aba "Tarefas" de "Luan Cirino de Sousa".
function correspondeMencao(textoNormalizado: string, termoBruto: string): boolean {
  const termo = normalizarTextoGestao(termoBruto);
  if (!termo || !textoNormalizado) return false;
  if (textoNormalizado.includes(termo)) return true;
  const partes = termo.split(/\s+/).filter(Boolean);
  return partes.length > 1 && partes.every((parte) => textoNormalizado.includes(parte));
}

export function tarefaCombinaComVinculo(tarefa: KanbanTarefa, eventos: CalendarEvent[], termos: string[]) {
  const evento = eventos.find((item) => item.id === tarefa.eventId);
  const texto = [
    tarefa.titulo,
    tarefa.descricao,
    ...obterResponsaveisTarefa(tarefa),
    ...obterVinculosTarefa(tarefa),
    ...(tarefa.etiquetas ?? []),
    evento?.titulo ?? "",
    ...(evento ? obterVinculosEvento(evento) : []),
  ].map(normalizarTextoGestao).join(" ");
  return termos.some((termo) => correspondeMencao(texto, termo));
}

export function tarefasPorVinculo(tarefas: KanbanTarefa[], eventos: CalendarEvent[], termos: string[]) {
  // Resolve as colunas uma vez, não uma por tarefa: o padrão de
  // `tarefaEstaAtiva` lê o localStorage a cada chamada.
  const concluintes = idsDeConclusao();
  return tarefas
    .filter((tarefa) => tarefaEstaAtiva(tarefa, concluintes))
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
