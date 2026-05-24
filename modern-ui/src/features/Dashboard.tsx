import { BookOpen, CalendarClock, GraduationCap, TrendingUp, Users } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import {
  carregarEventosCalendario,
  carregarTarefasKanban,
  carregarTarefasKanbanDashboard,
  formatarDataCurta,
  formatarDataLonga,
  montarLinhaDoTempo,
  rotuloDiasAte,
  rotuloPrioridade,
  type CalendarEvent,
  type KanbanTarefa,
} from "./management";

type TurmaDashboard = {
  alunos_ativos: number;
  alunos_elegiveis: number;
  conselhos_com_ajustes: number;
};
export function Dashboard({
  turmas,
  erroTurmas,
  onOpenCouncil,
  onOpenTurmas,
  onOpenKanban,
  onOpenCalendario,
}: {
  turmas: TurmaDashboard[];
  erroTurmas: string;
  onOpenCouncil: () => void;
  onOpenTurmas: () => void;
  onOpenKanban: () => void;
  onOpenCalendario: () => void;
}) {
  const totalAlunos = turmas.reduce((total, turma) => total + turma.alunos_ativos, 0);
  const totalElegiveis = turmas.reduce((total, turma) => total + turma.alunos_elegiveis, 0);
  const ajustes = turmas.reduce((total, turma) => total + turma.conselhos_com_ajustes, 0);
  const proximasTarefas = useMemo(() => carregarTarefasKanbanDashboard(), []);
  const proximasDatas = useMemo(() => montarLinhaDoTempo(carregarTarefasKanban(), carregarEventosCalendario(), 4), []);
  const proximaData = proximasDatas[0];

  return (
    <>
      <header className="topbar dashboard-topbar">
        <div>
          <span className="eyebrow">Visao geral</span>
          <h1>Dashboard</h1>
          <p>Acompanhe turmas, importacoes e pendencias de conselho.</p>
        </div>
        <button className="primary-action" onClick={onOpenCouncil}>
          <BookOpen size={18} />
          Abrir conselho
        </button>
      </header>

      <section className="metric-grid">
        <MetricCard icon={<Users size={24} />} tone="blue" value={String(turmas.length)} label="Turmas salvas" />
        <MetricCard icon={<GraduationCap size={24} />} tone="green" value={String(totalAlunos)} label="Alunos ativos" />
        <MetricCard icon={<CalendarClock size={24} />} tone="amber" value={String(ajustes)} label="Alunos com ajustes" />
        <MetricCard icon={<TrendingUp size={24} />} tone="purple" value={String(totalElegiveis)} label="Alunos elegiveis" />
      </section>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      <section className="dashboard-grid">
        <div className="panel activity-panel timeline-dashboard-panel">
          <div className="panel-heading">
            <h3>Próximas datas</h3>
            <button onClick={onOpenCalendario}>Ver calendário</button>
          </div>
          {proximaData && (
            <button className="next-date-card" type="button" onClick={onOpenCalendario}>
              <div>
                <span>Próximo dia relevante</span>
                <strong>{proximaData.titulo}</strong>
                <small>{formatarDataLonga(proximaData.data)}{proximaData.hora ? ` · ${proximaData.hora}` : ""}</small>
              </div>
              <em>{rotuloDiasAte(proximaData.data)}</em>
            </button>
          )}
          {proximasDatas.slice(proximaData ? 1 : 0).map((item) => (
            <button className="activity-row timeline-row" key={item.id} onClick={item.tipo === "tarefa" ? onOpenKanban : onOpenCalendario}>
              <span className="timeline-dot" style={{ background: item.cor }} />
              <div>
                <strong>{item.titulo}</strong>
                <span>{item.tipo === "tarefa" ? "Tarefa" : "Evento"}{item.recorrente ? " recorrente" : ""} · {item.descricao}</span>
              </div>
              <time>{formatarDataCurta(item.data)}</time>
            </button>
          ))}
          {!proximasDatas.length && (
            <button className="activity-row timeline-row" onClick={onOpenCalendario}>
              <span className="timeline-dot" style={{ background: "#64748b" }} />
              <div>
                <strong>Nenhuma data futura</strong>
                <span>Crie eventos ou adicione prazos às tarefas.</span>
              </div>
              <time>Agenda</time>
            </button>
          )}
        </div>

        <div className="panel upcoming-panel">
          <div className="panel-heading">
            <h3>Próximas tarefas</h3>
            <button onClick={onOpenKanban}>Ver quadro</button>
          </div>
          {proximasTarefas.map((item) => (
            <button className={`council-card kanban-dashboard-task ${item.prioridade}`} key={item.id} onClick={onOpenKanban}>
                <div>
                  <strong>{item.titulo}</strong>
                  <span>{item.descricao}</span>
                  <small>{item.responsavel} · {formatarDataCurta(item.prazo)}</small>
                </div>
                <em>{rotuloPrioridade(item.prioridade)}</em>
              </button>
          ))}
          {!proximasTarefas.length && (
            <button className="council-card kanban-dashboard-task baixa" onClick={onOpenKanban}>
              <div>
                <strong>Nenhuma tarefa em aberto</strong>
                <span>Adicione cards em A Fazer no Quadro de Gestão.</span>
              </div>
              <em>Kanban</em>
            </button>
          )}
        </div>
      </section>
    </>
  );
}

export function TaskLinkList({ tarefas, eventos, emptyText, onOpenKanban }: { tarefas: KanbanTarefa[]; eventos: CalendarEvent[]; emptyText: string; onOpenKanban: () => void }) {
  if (!tarefas.length) {
    return <div className="empty-special-list">{emptyText}</div>;
  }
  return (
    <div className="linked-task-list">
      {tarefas.map((tarefa) => {
        const evento = eventos.find((item) => item.id === tarefa.eventId);
        return (
          <button key={tarefa.id} type="button" className={`linked-task-card ${tarefa.prioridade}`} onClick={onOpenKanban}>
            <div>
              <strong>{tarefa.titulo}</strong>
              <span>{tarefa.descricao}</span>
              {evento && <small>Parte de: {evento.titulo}</small>}
              {tarefa.vinculo && <small>Vínculo: {tarefa.vinculo}</small>}
            </div>
            <time>{formatarDataCurta(tarefa.prazo)}</time>
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: ReactNode;
  tone: "blue" | "green" | "amber" | "purple";
  value: string;
  label: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
