import { invokeApp, tauriDisponivel } from "./appBridge";
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

async function enviarNotificacao(titulo: string, corpo: string) {
  if (!tauriDisponivel) return;
  await invokeApp("enviar_notificacao", { titulo, corpo });
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

    const hojeChave = chaveData(hoje);

    // Envia as notificações nativas (via backend) e registra quais foram entregues.
    const notificadas = new Set<string>();
    for (const { tarefa, alertas } of tarefasComAlertas) {
      const menorPrazo = Math.min(...alertas.map((alerta) => alerta.diasAntes));
      try {
        await enviarNotificacao("Prazo de tarefa", `${tarefa.titulo} ${rotuloAlerta(menorPrazo)}.`);
        notificadas.add(tarefa.id);
      } catch {
        // Se falhar, não marca como disparado; tenta de novo no próximo ciclo.
      }
    }

    if (notificadas.size === 0) return;

    const disparadosPorTarefa = new Map(
      tarefasComAlertas
        .filter((item) => notificadas.has(item.tarefa.id))
        .map((item) => [item.tarefa.id, new Set(item.alertas.map((alerta) => alerta.diasAntes))]),
    );
    const atualizadas = tarefas.map((tarefa) => {
      const disparados = disparadosPorTarefa.get(tarefa.id);
      if (!disparados) return tarefa;
      return {
        ...tarefa,
        alertas: (tarefa.alertas ?? []).map((alerta) =>
          disparados.has(alerta.diasAntes) && alerta.ativo && !alerta.disparadoEm
            ? { ...alerta, disparadoEm: hojeChave }
            : alerta
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
