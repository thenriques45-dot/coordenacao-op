import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { carregarTarefasKanban, chaveData, KANBAN_UPDATED_EVENT, parseDataLocal, salvarTarefasKanban, type KanbanTarefa } from "./management";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

function inicioDoDia(data = new Date()) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function adicionarDias(data: Date, dias: number) {
  const proxima = new Date(data);
  proxima.setDate(proxima.getDate() + dias);
  return proxima;
}

function rotuloAlerta(diasAntes: number) {
  if (diasAntes === 0) return "vence hoje";
  if (diasAntes === 1) return "vence amanhã";
  return `vence em ${diasAntes} dias`;
}

async function garantirPermissaoNotificacao() {
  let permissao = await isPermissionGranted();
  if (!permissao) {
    const resposta = await requestPermission();
    permissao = resposta === "granted";
  }
  return permissao;
}

function alertasPendentes(tarefa: KanbanTarefa, hoje: Date) {
  if (!tarefa.prazo || tarefa.status === "concluido") return [];
  const prazo = parseDataLocal(tarefa.prazo);
  if (Number.isNaN(prazo.getTime()) || prazo < hoje) return [];

  return (tarefa.alertas ?? [])
    .filter((alerta) => alerta.ativo && !alerta.disparadoEm)
    .filter((alerta) => adicionarDias(prazo, -alerta.diasAntes) <= hoje);
}

export async function verificarAlertasTarefas() {
  try {
    const tarefas = carregarTarefasKanban();
    const hoje = inicioDoDia();
    const tarefasComAlertas = tarefas
      .map((tarefa) => ({ tarefa, alertas: alertasPendentes(tarefa, hoje) }))
      .filter((item) => item.alertas.length > 0);

    if (!tarefasComAlertas.length) return;
    const podeNotificar = await garantirPermissaoNotificacao();
    if (!podeNotificar) return;

    const hojeChave = chaveData(hoje);
    const atualizadas = tarefas.map((tarefa) => {
      const item = tarefasComAlertas.find((entrada) => entrada.tarefa.id === tarefa.id);
      if (!item) return tarefa;

      const alertasDisparados = new Set(item.alertas.map((alerta) => alerta.diasAntes));
      const menorPrazo = Math.min(...item.alertas.map((alerta) => alerta.diasAntes));
      try {
        sendNotification({
          title: "Prazo de tarefa",
          body: `${tarefa.titulo} ${rotuloAlerta(menorPrazo)}.`,
        });
      } catch {
        return tarefa;
      }

      return {
        ...tarefa,
        alertas: (tarefa.alertas ?? []).map((alerta) =>
          alertasDisparados.has(alerta.diasAntes) ? { ...alerta, disparadoEm: hojeChave } : alerta
        ),
      };
    });

    salvarTarefasKanban(atualizadas);
  } catch {
    // Falha de notificação não deve impedir o uso normal do quadro.
  }
}

export function iniciarMonitorAlertasTarefas() {
  void verificarAlertasTarefas();
  const intervalo = window.setInterval(() => {
    void verificarAlertasTarefas();
  }, CHECK_INTERVAL_MS);
  let verificacaoAgendada: number | null = null;
  const verificarAposSalvarKanban = () => {
    if (verificacaoAgendada !== null) {
      window.clearTimeout(verificacaoAgendada);
    }
    verificacaoAgendada = window.setTimeout(() => {
      verificacaoAgendada = null;
      void verificarAlertasTarefas();
    }, 500);
  };
  window.addEventListener(KANBAN_UPDATED_EVENT, verificarAposSalvarKanban);

  return () => {
    window.clearInterval(intervalo);
    if (verificacaoAgendada !== null) {
      window.clearTimeout(verificacaoAgendada);
    }
    window.removeEventListener(KANBAN_UPDATED_EVENT, verificarAposSalvarKanban);
  };
}
