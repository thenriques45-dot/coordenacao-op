import {
  carregarTarefasKanban,
  idsDeConclusao,
  KANBAN_UPDATED_EVENT,
  parseDataLocal,
  tarefaEstaAtiva,
  type KanbanStatus,
  type KanbanTarefa,
} from "./management";

// Central de avisos interna: os alertas de prazo das tarefas do Kanban viram
// avisos dentro do app (sino na barra lateral + aviso no canto da tela), sem
// passar pelas notificações do sistema operacional.
//
// O registro do que já foi avisado fica NESTE computador. Antes ele era gravado
// na própria tarefa (alertas[].disparadoEm), que sincroniza com o grupo — em
// tarefa compartilhada, o primeiro coordenador a abrir o app "consumia" o aviso
// dos outros.

export const AVISOS_STORAGE_KEY = "coordenacaoop:avisos:v1";
export const AVISOS_UPDATED_EVENT = "coordenacaoop:avisos-updated";

const INTERVALO_VERIFICACAO_MS = 30 * 60 * 1000;
const LIMITE_AVISOS = 50;

export type AvisoApp = {
  id: string;
  tipo: "prazo-tarefa";
  titulo: string;
  texto: string;
  criadoEm: string;
  lidoEm?: string;
  tarefaId?: string;
};

type EstadoAvisos = {
  avisos: AvisoApp[];
  // Chaves `tarefa|prazo|diasAntes` dos alertas já avisados. O prazo entra na
  // chave para que mudar a data da tarefa rearme os alertas.
  disparados: string[];
};

function carregarEstado(): EstadoAvisos {
  try {
    const bruto = localStorage.getItem(AVISOS_STORAGE_KEY);
    const estado = bruto ? (JSON.parse(bruto) as Partial<EstadoAvisos>) : {};
    return {
      avisos: Array.isArray(estado.avisos) ? estado.avisos : [],
      disparados: Array.isArray(estado.disparados) ? estado.disparados : [],
    };
  } catch {
    return { avisos: [], disparados: [] };
  }
}

function salvarEstado(estado: EstadoAvisos) {
  localStorage.setItem(AVISOS_STORAGE_KEY, JSON.stringify(estado));
  window.dispatchEvent(new CustomEvent(AVISOS_UPDATED_EVENT));
}

export function carregarAvisos(): AvisoApp[] {
  return carregarEstado().avisos;
}

function atualizarAvisos(transformar: (avisos: AvisoApp[]) => AvisoApp[]) {
  const estado = carregarEstado();
  salvarEstado({ ...estado, avisos: transformar(estado.avisos) });
}

export function marcarAvisoLido(id: string) {
  const agora = new Date().toISOString();
  atualizarAvisos((avisos) => avisos.map((aviso) => (aviso.id === id && !aviso.lidoEm ? { ...aviso, lidoEm: agora } : aviso)));
}

export function marcarTodosAvisosLidos() {
  const agora = new Date().toISOString();
  atualizarAvisos((avisos) => avisos.map((aviso) => (aviso.lidoEm ? aviso : { ...aviso, lidoEm: agora })));
}

export function removerAviso(id: string) {
  atualizarAvisos((avisos) => avisos.filter((aviso) => aviso.id !== id));
}

export function limparAvisosLidos() {
  atualizarAvisos((avisos) => avisos.filter((aviso) => !aviso.lidoEm));
}

function inicioDoDia(data = new Date()) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function diasAte(prazo: Date, hoje: Date) {
  return Math.round((prazo.getTime() - hoje.getTime()) / 86_400_000);
}

// Rotula pelo que falta de fato, não pelo alerta configurado: com o app fechado
// por alguns dias, o alerta "2 dias antes" pode só ser visto na véspera.
function rotuloPrazo(dias: number) {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}

function chaveDisparo(tarefa: KanbanTarefa, diasAntes: number) {
  return `${tarefa.id}|${tarefa.prazo}|${diasAntes}`;
}

function alertasVencidos(tarefa: KanbanTarefa, hoje: Date, disparados: Set<string>, concluintes: Set<KanbanStatus>) {
  if (!tarefa.prazo || !tarefaEstaAtiva(tarefa, concluintes)) return [];
  const prazo = parseDataLocal(tarefa.prazo);
  if (Number.isNaN(prazo.getTime()) || prazo < hoje) return [];
  const dias = diasAte(prazo, hoje);
  return (tarefa.alertas ?? []).filter(
    (alerta) => alerta.ativo && alerta.diasAntes >= dias && !disparados.has(chaveDisparo(tarefa, alerta.diasAntes)),
  );
}

let sequencia = 0;
function novoId() {
  sequencia += 1;
  return `aviso-${Date.now().toString(36)}-${sequencia}`;
}

/**
 * Gera os avisos de prazo que venceram desde a última verificação e devolve
 * só os novos (para o aviso no canto da tela). Também tira da central os
 * avisos não lidos de tarefas que foram concluídas, arquivadas ou excluídas.
 */
export function verificarAvisosPrazo(): AvisoApp[] {
  let tarefas: KanbanTarefa[];
  try {
    tarefas = carregarTarefasKanban();
  } catch {
    return [];
  }
  const estado = carregarEstado();
  const hoje = inicioDoDia();
  const disparados = new Set(estado.disparados);
  // Lido uma vez: o padrão de tarefaEstaAtiva relê as colunas a cada chamada.
  const concluintes = idsDeConclusao();
  const ativas = new Map(tarefas.filter((tarefa) => tarefaEstaAtiva(tarefa, concluintes)).map((tarefa) => [tarefa.id, tarefa]));

  let avisos = estado.avisos.filter((aviso) => aviso.lidoEm || !aviso.tarefaId || ativas.has(aviso.tarefaId));
  const novos: AvisoApp[] = [];
  const agora = new Date().toISOString();

  for (const tarefa of tarefas) {
    const vencidos = alertasVencidos(tarefa, hoje, disparados, concluintes);
    if (!vencidos.length) continue;
    vencidos.forEach((alerta) => disparados.add(chaveDisparo(tarefa, alerta.diasAntes)));

    const aviso: AvisoApp = {
      id: novoId(),
      tipo: "prazo-tarefa",
      titulo: tarefa.titulo,
      texto: `Prazo da tarefa: ${rotuloPrazo(diasAte(parseDataLocal(tarefa.prazo), hoje))}.`,
      criadoEm: agora,
      tarefaId: tarefa.id,
    };
    // Um aviso por tarefa: um novo alerta da mesma tarefa substitui o anterior
    // ainda não lido em vez de empilhar "vence em 2 dias" e "vence amanhã".
    avisos = [aviso, ...avisos.filter((item) => item.lidoEm || item.tarefaId !== tarefa.id)];
    novos.push(aviso);
  }

  // Sem isto o registro só cresceria: guarda apenas chaves de tarefas que
  // ainda existem com o mesmo prazo.
  const chavesValidas = new Set(
    tarefas.flatMap((tarefa) => (tarefa.alertas ?? []).map((alerta) => chaveDisparo(tarefa, alerta.diasAntes))),
  );
  const proximo: EstadoAvisos = {
    avisos: avisos.slice(0, LIMITE_AVISOS),
    disparados: [...disparados].filter((chave) => chavesValidas.has(chave)),
  };

  const mudou =
    novos.length > 0 ||
    proximo.avisos.length !== estado.avisos.length ||
    proximo.disparados.length !== estado.disparados.length;
  if (mudou) salvarEstado(proximo);
  return novos;
}

/**
 * Verifica os prazos ao abrir, a cada 30 min, logo depois de salvar o Kanban
 * e quando a janela volta da bandeja. Devolve a função de limpeza.
 */
export function iniciarMonitorAvisos(aoSurgirem: (novos: AvisoApp[]) => void) {
  const verificar = () => {
    const novos = verificarAvisosPrazo();
    if (novos.length) aoSurgirem(novos);
  };

  verificar();
  const intervalo = window.setInterval(verificar, INTERVALO_VERIFICACAO_MS);
  let agendada: number | null = null;
  const verificarAposSalvar = () => {
    if (agendada !== null) window.clearTimeout(agendada);
    agendada = window.setTimeout(() => {
      agendada = null;
      verificar();
    }, 500);
  };
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === "visible") verificar();
  };
  window.addEventListener(KANBAN_UPDATED_EVENT, verificarAposSalvar);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  return () => {
    window.clearInterval(intervalo);
    if (agendada !== null) window.clearTimeout(agendada);
    window.removeEventListener(KANBAN_UPDATED_EVENT, verificarAposSalvar);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  };
}
