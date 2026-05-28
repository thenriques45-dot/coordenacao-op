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
    if (!anterior || Date.parse(membro.updatedAt ?? "") >= Date.parse(anterior.updatedAt ?? "")) {
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

export function montarPayloadSincronizacao(perfil: WorkgroupSyncProfile): WorkgroupSyncPayload {
  const tombstones = carregarTombstones();
  registrarMembroSincronizacao(perfil);
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

export function aplicarPayloadSincronizacao(payload: WorkgroupSyncPayload) {
  if (payload.tipo !== "coordenacaoop-workgroup-state" || payload.versao !== 1) {
    throw new Error("Arquivo de sincronização incompatível com esta versão.");
  }
  const tarefasAtuais = carregarTarefasKanban();
  const eventosAtuais = carregarEventosCalendario();
  const colunasAtuais = carregarColunasKanban();
  const tombstonesAtuais = carregarTombstones();
  const tombstones: SyncTombstones = {
    kanbanTasks: { ...tombstonesAtuais.kanbanTasks, ...(payload.data.deletedKanbanTasks ?? {}) },
    calendarEvents: { ...tombstonesAtuais.calendarEvents, ...(payload.data.deletedCalendarEvents ?? {}) },
  };

  const tarefas = mesclarPorAtualizacao(tarefasAtuais, payload.data.kanbanTasks ?? [])
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
