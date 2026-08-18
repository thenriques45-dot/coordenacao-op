import {
  CALENDAR_STORAGE_KEY,
  KANBAN_COLUMNS_STORAGE_KEY,
  KANBAN_STORAGE_KEY,
  carregarEventosCalendario,
  carregarTarefasKanban,
  colunasKanbanPadrao,
  type CalendarEvent,
  type KanbanColuna,
  type KanbanTarefa,
} from "./management";
import { invokeApp } from "./appBridge";

// Formato mínimo usado só para carregar a config de Planejamento/PEI do Web
// App automático via sincronização de grupo — ver WebAppConfigSync abaixo.
// Os tipos completos (com currículo, componentes extras etc.) vivem em
// Planejamento.tsx/PEI.tsx; aqui só os campos que precisam viajar.
//
// Inclui planilha_automatica_id/apps_script_projeto_id/apps_script_deployment_id
// (não só webapp_url+token_leitura): sem eles, uma máquina que só adota a
// config por sincronização fica com um config "meio preenchido" — lê as
// respostas normalmente, mas se clicar em "Atualizar turmas/republicar" o
// backend não tem os IDs pra reaproveitar e cria silenciosamente uma
// planilha e um projeto Apps Script NOVOS, órfãos do original.
type WebAppConfigSync = {
  webapp_url: string;
  token_leitura: string;
  configurado_por_user_id: string;
  planilha_automatica_id: string;
  apps_script_projeto_id: string;
  apps_script_deployment_id: string;
};

export type WorkgroupSyncProfile = {
  userId: string;
  displayName: string;
  role: string;
  deviceName: string;
  avatarDataUrl?: string;
  syncEnabled: boolean;
  syncFolder: string;
  onboarding: "pending" | "enabled" | "dismissed";
  createdAt: string;
  updatedAt: string;
  lastPublishedAt?: string;
  lastPulledAt?: string;
  lastInstitutionalPublishedAt?: string;
  lastInstitutionalPulledAt?: string;
  lastSyncError?: string;
  lastSyncErrorAt?: string;
};

export type WorkgroupSyncMember = {
  userId: string;
  displayName: string;
  role: string;
  deviceName: string;
  avatarDataUrl?: string;
  updatedAt?: string;
};

export type WorkgroupSyncPayload = {
  tipo: "coordenacaoop-workgroup-state";
  versao: 1;
  generatedAt: string;
  profile: {
    userId: string;
    displayName: string;
    role: string;
    deviceName: string;
    avatarDataUrl?: string;
  };
  profiles?: WorkgroupSyncMember[];
  data: {
    kanbanTasks: KanbanTarefa[];
    kanbanColumns: KanbanColuna[];
    calendarEvents: CalendarEvent[];
    deletedKanbanTasks?: Record<string, string>;
    deletedCalendarEvents?: Record<string, string>;
    planejamentoConfig?: WebAppConfigSync | null;
    peiConfig?: WebAppConfigSync | null;
  };
};

export const WORKGROUP_SYNC_PROFILE_KEY = "coordenacaoop:workgroup-sync-profile:v1";
export const WORKGROUP_SYNC_MEMBERS_KEY = "coordenacaoop:workgroup-sync-members:v1";
export const WORKGROUP_SYNC_TOMBSTONES_KEY = "coordenacaoop:workgroup-sync-tombstones:v1";
export const WORKGROUP_SYNC_APPLIED_EVENT = "coordenacaoop:workgroup-sync-applied";

type SyncTombstones = {
  kanbanTasks: Record<string, string>;
  calendarEvents: Record<string, string>;
};

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `coord-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultDeviceName() {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Linux")) return "Linux";
  if (userAgent.includes("Mac")) return "Mac";
  return "Esta instalação";
}

export function criarPerfilSincronizacaoPadrao(): WorkgroupSyncProfile {
  const agora = new Date().toISOString();
  return {
    userId: randomId(),
    displayName: "",
    role: "Coordenação pedagógica",
    deviceName: defaultDeviceName(),
    syncEnabled: false,
    syncFolder: "",
    onboarding: "pending",
    createdAt: agora,
    updatedAt: agora,
  };
}

export function carregarPerfilSincronizacao(): WorkgroupSyncProfile {
  try {
    const salvo = localStorage.getItem(WORKGROUP_SYNC_PROFILE_KEY);
    if (!salvo) return criarPerfilSincronizacaoPadrao();
    return {
      ...criarPerfilSincronizacaoPadrao(),
      ...JSON.parse(salvo),
    };
  } catch {
    return criarPerfilSincronizacaoPadrao();
  }
}

// carregarPerfilSincronizacao() gera um userId novo a cada chamada quando
// nunca houve um perfil salvo (coordenador que nunca abriu a aba de
// Sincronização de grupo) — o que quebra qualquer comparação de identidade
// entre chamadas. Usada por quem precisa de um userId ESTÁVEL mesmo sem o
// coordenador ter passado pelo onboarding de sincronização (ver
// configurado_por_user_id em Planejamento.tsx/PEI.tsx).
export function garantirPerfilPersistido(): WorkgroupSyncProfile {
  if (localStorage.getItem(WORKGROUP_SYNC_PROFILE_KEY)) {
    return carregarPerfilSincronizacao();
  }
  return salvarPerfilSincronizacao(criarPerfilSincronizacaoPadrao());
}

export function salvarPerfilSincronizacao(perfil: WorkgroupSyncProfile) {
  const atualizado = { ...perfil, updatedAt: new Date().toISOString() };
  localStorage.setItem(WORKGROUP_SYNC_PROFILE_KEY, JSON.stringify(atualizado));
  registrarMembroSincronizacao(atualizado);
  window.dispatchEvent(new CustomEvent("coordenacaoop:workgroup-sync-profile-updated", { detail: atualizado }));
  return atualizado;
}

export function iniciaisPerfil(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "CP";
  return partes.slice(0, 2).map((parte) => parte[0]?.toUpperCase()).join("");
}

function carregarTombstones(): SyncTombstones {
  try {
    const salvas = localStorage.getItem(WORKGROUP_SYNC_TOMBSTONES_KEY);
    if (!salvas) return { kanbanTasks: {}, calendarEvents: {} };
    return { kanbanTasks: {}, calendarEvents: {}, ...JSON.parse(salvas) };
  } catch {
    return { kanbanTasks: {}, calendarEvents: {} };
  }
}

function salvarTombstones(tombstones: SyncTombstones) {
  localStorage.setItem(WORKGROUP_SYNC_TOMBSTONES_KEY, JSON.stringify(tombstones));
}

export function carregarMembrosSincronizacao(): WorkgroupSyncMember[] {
  try {
    const salvos = localStorage.getItem(WORKGROUP_SYNC_MEMBERS_KEY);
    if (!salvos) return [];
    return (JSON.parse(salvos) as WorkgroupSyncMember[]).filter((membro) => membro.userId && membro.displayName);
  } catch {
    return [];
  }
}

function salvarMembrosSincronizacao(membros: WorkgroupSyncMember[]) {
  const porId = new Map<string, WorkgroupSyncMember>();
  membros.forEach((membro) => {
    if (!membro.userId || !membro.displayName) return;
    const anterior = porId.get(membro.userId);
    const tsNovo = Date.parse(membro.updatedAt ?? "") || 0;
    const tsAnterior = Date.parse(anterior?.updatedAt ?? "") || 0;
    if (!anterior || tsNovo >= tsAnterior) {
      porId.set(membro.userId, membro);
    }
  });
  localStorage.setItem(WORKGROUP_SYNC_MEMBERS_KEY, JSON.stringify(Array.from(porId.values())));
}

export function registrarMembroSincronizacao(perfil: WorkgroupSyncMember | WorkgroupSyncProfile) {
  if (!perfil.userId || !perfil.displayName) return;
  salvarMembrosSincronizacao([
    ...carregarMembrosSincronizacao(),
    {
      userId: perfil.userId,
      displayName: perfil.displayName,
      role: perfil.role,
      deviceName: perfil.deviceName,
      avatarDataUrl: perfil.avatarDataUrl,
      updatedAt: perfil.updatedAt ?? new Date().toISOString(),
    },
  ]);
}

export function registrarExclusaoSincronizacao(tipo: "kanbanTask" | "calendarEvent", id: string) {
  const tombstones = carregarTombstones();
  const destino = tipo === "kanbanTask" ? tombstones.kanbanTasks : tombstones.calendarEvents;
  destino[id] = new Date().toISOString();
  salvarTombstones(tombstones);
}

function carregarColunasKanban() {
  try {
    const salvas = localStorage.getItem(KANBAN_COLUMNS_STORAGE_KEY);
    return salvas ? JSON.parse(salvas) as KanbanColuna[] : colunasKanbanPadrao;
  } catch {
    return colunasKanbanPadrao;
  }
}

// Busca a config de Planejamento/PEI para incluir no payload de
// sincronização — só quando o Web App automático já estiver configurado de
// verdade (webapp_url + token_leitura), senão não há nada útil pra
// propagar. Falha isolada: se o comando não existir ainda (versão antiga do
// backend) ou der erro, simplesmente não inclui essa config no payload.
async function buscarConfigWebAppParaSync(comando: string): Promise<WebAppConfigSync | null> {
  try {
    const cfg = await invokeApp<Partial<WebAppConfigSync>>(comando);
    if (!cfg?.webapp_url || !cfg?.token_leitura) return null;
    return {
      webapp_url: cfg.webapp_url,
      token_leitura: cfg.token_leitura,
      configurado_por_user_id: cfg.configurado_por_user_id ?? "",
      planilha_automatica_id: cfg.planilha_automatica_id ?? "",
      apps_script_projeto_id: cfg.apps_script_projeto_id ?? "",
      apps_script_deployment_id: cfg.apps_script_deployment_id ?? "",
    };
  } catch {
    return null;
  }
}

export async function montarPayloadSincronizacao(perfil: WorkgroupSyncProfile): Promise<WorkgroupSyncPayload> {
  const tombstones = carregarTombstones();
  registrarMembroSincronizacao(perfil);
  const [planejamentoConfig, peiConfig] = await Promise.all([
    buscarConfigWebAppParaSync("carregar_config_planejamento"),
    buscarConfigWebAppParaSync("carregar_config_pei"),
  ]);
  return {
    tipo: "coordenacaoop-workgroup-state",
    versao: 1,
    generatedAt: new Date().toISOString(),
    profile: {
      userId: perfil.userId,
      displayName: perfil.displayName,
      role: perfil.role,
      deviceName: perfil.deviceName,
      avatarDataUrl: perfil.avatarDataUrl,
    },
    profiles: carregarMembrosSincronizacao(),
    data: {
      kanbanTasks: carregarTarefasKanban().filter((tarefa) => tarefa.compartilhada === true),
      kanbanColumns: carregarColunasKanban(),
      calendarEvents: carregarEventosCalendario(),
      deletedKanbanTasks: tombstones.kanbanTasks,
      deletedCalendarEvents: tombstones.calendarEvents,
      planejamentoConfig,
      peiConfig,
    },
  };
}

function dataAtualizacao(item: { updatedAt?: string; createdAt?: string; id: string }) {
  if (item.updatedAt) return Date.parse(item.updatedAt) || 0;
  if (item.createdAt) return Date.parse(item.createdAt) || 0;
  const match = item.id.match(/(?:kanban|evento)-(\d+)/);
  return match ? Number(match[1]) : 0;
}

function mesclarPorAtualizacao<T extends { id: string; updatedAt?: string; createdAt?: string }>(locais: T[], remotos: T[]) {
  const porId = new Map<string, T>();
  locais.forEach((item) => porId.set(item.id, item));
  remotos.forEach((remoto) => {
    const local = porId.get(remoto.id);
    if (!local || dataAtualizacao(remoto) > dataAtualizacao(local)) {
      porId.set(remoto.id, remoto);
    }
  });
  return Array.from(porId.values());
}

// Adota a config recebida só se esta máquina ainda não tiver nenhuma própria
// (webapp_url vazio) — nunca sobrescreve uma configuração já existente,
// local ou vinda de outro colega. Preserva configurado_por_user_id tal como
// veio, para manter a atribuição original através de vários saltos de
// sincronização.
//
// Caso à parte: quem já importou o MESMO Web App pelo link manual (fluxo
// anterior a este, que não gravava configurado_por_user_id) tem
// webapp_url preenchido mas nenhuma atribuição — sem isso, a tela nunca
// mostra "Fulano já configurou". Nesse caso específico (mesmo webapp_url,
// atribuição local vazia), completa só esse campo, sem tocar em mais nada.
//
// Mesma lógica para planilha_automatica_id/apps_script_projeto_id/
// apps_script_deployment_id: uma máquina que só adotou a config (ou
// importou por link) fica com esses três vazios mesmo com o webapp_url
// certo — e se clicar em "Atualizar turmas/republicar" nesse estado, o
// backend não tem o que reaproveitar e provisiona planilha/projeto NOVOS.
// Sempre que aparecer, pelo sync, o mesmo webapp_url com esses campos
// preenchidos, completa os que estiverem vazios localmente.
async function adotarConfigWebAppRecebida(
  recebida: WebAppConfigSync | null | undefined,
  comandoCarregar: string,
  comandoSalvar: string,
) {
  if (!recebida?.webapp_url || !recebida?.token_leitura) return;
  try {
    const atual = await invokeApp<Partial<WebAppConfigSync>>(comandoCarregar);
    if (!atual?.webapp_url) {
      await invokeApp(comandoSalvar, { config: { ...atual, ...recebida } });
      return;
    }
    if (atual.webapp_url !== recebida.webapp_url) return;
    const completar: Partial<WebAppConfigSync> = {};
    if (!atual.configurado_por_user_id && recebida.configurado_por_user_id) {
      completar.configurado_por_user_id = recebida.configurado_por_user_id;
    }
    if (!atual.planilha_automatica_id && recebida.planilha_automatica_id) {
      completar.planilha_automatica_id = recebida.planilha_automatica_id;
    }
    if (!atual.apps_script_projeto_id && recebida.apps_script_projeto_id) {
      completar.apps_script_projeto_id = recebida.apps_script_projeto_id;
    }
    if (!atual.apps_script_deployment_id && recebida.apps_script_deployment_id) {
      completar.apps_script_deployment_id = recebida.apps_script_deployment_id;
    }
    if (Object.keys(completar).length > 0) {
      await invokeApp(comandoSalvar, { config: { ...atual, ...completar } });
    }
  } catch {
    // Sincronização automática é silenciosa — a tela de Planejamento/PEI
    // continua funcionando com os controles manuais existentes.
  }
}

export async function aplicarPayloadSincronizacao(payload: WorkgroupSyncPayload) {
  if (payload.tipo !== "coordenacaoop-workgroup-state" || payload.versao !== 1) {
    throw new Error("Arquivo de sincronização incompatível com esta versão.");
  }
  await Promise.all([
    adotarConfigWebAppRecebida(payload.data.planejamentoConfig, "carregar_config_planejamento", "salvar_config_planejamento"),
    adotarConfigWebAppRecebida(payload.data.peiConfig, "carregar_config_pei", "salvar_config_pei"),
  ]);
  const tarefasAtuais = carregarTarefasKanban();
  const eventosAtuais = carregarEventosCalendario();
  const colunasAtuais = carregarColunasKanban();
  const tombstonesAtuais = carregarTombstones();
  const tombstones: SyncTombstones = {
    kanbanTasks: { ...tombstonesAtuais.kanbanTasks, ...(payload.data.deletedKanbanTasks ?? {}) },
    calendarEvents: { ...tombstonesAtuais.calendarEvents, ...(payload.data.deletedCalendarEvents ?? {}) },
  };

  const tarefas = mesclarPorAtualizacao(tarefasAtuais, (payload.data.kanbanTasks ?? []).filter((t) => t.compartilhada === true))
    .filter((tarefa) => !tombstones.kanbanTasks[tarefa.id]);
  const eventos = mesclarPorAtualizacao(eventosAtuais, payload.data.calendarEvents ?? [])
    .filter((evento) => !tombstones.calendarEvents[evento.id]);
  const colunas = payload.data.kanbanColumns?.length ? payload.data.kanbanColumns : colunasAtuais;

  registrarMembroSincronizacao({
    ...payload.profile,
    updatedAt: payload.generatedAt,
  });
  (payload.profiles ?? []).forEach(registrarMembroSincronizacao);
  localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify(tarefas));
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(eventos));
  localStorage.setItem(KANBAN_COLUMNS_STORAGE_KEY, JSON.stringify(colunas));
  salvarTombstones(tombstones);
  window.dispatchEvent(new CustomEvent("coordenacaoop:kanban-updated"));
  window.dispatchEvent(new CustomEvent(WORKGROUP_SYNC_APPLIED_EVENT));

  return {
    tarefas: tarefas.length,
    eventos: eventos.length,
    colunas: colunas.length,
    origem: payload.profile.displayName || payload.profile.deviceName || "grupo de trabalho",
    generatedAt: payload.generatedAt,
  };
}
