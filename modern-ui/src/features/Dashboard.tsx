import { AlertTriangle, CalendarClock, Check, GraduationCap, Search, TrendingUp, Users } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";
import {
  carregarEventosCalendario,
  carregarTarefasKanban,
  carregarTarefasKanbanDashboard,
  diferencaDias,
  formatarDataCurta,
  formatarDataLonga,
  formatarResponsaveisTarefa,
  formatarVinculosTarefa,
  KANBAN_UPDATED_EVENT,
  montarLinhaDoTempo,
  rotuloDiasAte,
  rotuloPrioridade,
  salvarTarefasKanban,
  type CalendarEvent,
  type KanbanTarefa,
  type TimelineItem,
} from "./management";

const EVENTOS_REALIZADOS_KEY = "coordenacaoop:eventos-realizados";

function carregarEventosRealizados(): Set<string> {
  try {
    const salvo = localStorage.getItem(EVENTOS_REALIZADOS_KEY);
    return new Set(salvo ? (JSON.parse(salvo) as string[]) : []);
  } catch {
    return new Set();
  }
}

type TurmaDashboard = {
  alunos_ativos: number;
  alunos_elegiveis: number;
  conselhos_com_ajustes: number;
};

type CasoAlunoMultiplasTurmas = {
  matricula_identidade: string;
  nome: string;
  turmas: string[];
  reimportado_sem_resolver: boolean;
};

type RelatorioAlunosMultiplasTurmas = {
  pendentes: CasoAlunoMultiplasTurmas[];
  resolvidos: string[];
};
function formatarDataAtual(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function Dashboard({
  turmas,
  erroTurmas,
  onAbrirBusca,
  onOpenTurmas,
  onOpenKanban,
  onOpenCalendario,
  onImportarAlunosLote,
}: {
  turmas: TurmaDashboard[];
  erroTurmas: string;
  onAbrirBusca: () => void;
  onOpenTurmas: () => void;
  onOpenKanban: () => void;
  onOpenCalendario: () => void;
  onImportarAlunosLote: () => void;
}) {
  const totalAlunos = turmas.reduce((total, turma) => total + turma.alunos_ativos, 0);
  const totalElegiveis = turmas.reduce((total, turma) => total + turma.alunos_elegiveis, 0);
  const ajustes = turmas.reduce((total, turma) => total + turma.conselhos_com_ajustes, 0);

  const [versao, setVersao] = useState(0);
  const [atrasadosExpandidos, setAtrasadosExpandidos] = useState(false);
  const [diagnosticoTurmas, setDiagnosticoTurmas] = useState<RelatorioAlunosMultiplasTurmas | null>(null);

  useEffect(() => {
    const atualizar = () => setVersao((v) => v + 1);
    window.addEventListener(KANBAN_UPDATED_EVENT, atualizar);
    return () => window.removeEventListener(KANBAN_UPDATED_EVENT, atualizar);
  }, []);

  useEffect(() => {
    invokeApp<RelatorioAlunosMultiplasTurmas>("verificar_alunos_multiplas_turmas")
      .then(setDiagnosticoTurmas)
      .catch(() => setDiagnosticoTurmas(null));
  }, []);

  const dispensarCaso = useCallback(async (matriculaIdentidade: string) => {
    setDiagnosticoTurmas((atual) =>
      atual ? { ...atual, pendentes: atual.pendentes.filter((c) => c.matricula_identidade !== matriculaIdentidade) } : atual
    );
    try {
      await invokeApp("dispensar_caso_multiplas_turmas", { matriculaIdentidade });
    } catch {
      // Se a chamada falhar, a próxima visita ao Dashboard volta a mostrar o aviso.
    }
  }, []);

  const proximasTarefas = useMemo(() => carregarTarefasKanbanDashboard(), [versao]);

  const todasDatas = useMemo(() => {
    const realizados = carregarEventosRealizados();
    return montarLinhaDoTempo(carregarTarefasKanban(), carregarEventosCalendario(), 20).filter(
      (item) => !realizados.has(`${item.origemId}:${item.data}`)
    );
  }, [versao]);

  const atrasados = useMemo(() => todasDatas.filter((item) => diferencaDias(item.data) < 0), [todasDatas]);
  const proximos = useMemo(() => todasDatas.filter((item) => diferencaDias(item.data) >= 0).slice(0, 4), [todasDatas]);
  const proximaData = proximos[0];

  const marcarConcluido = useCallback((item: TimelineItem) => {
    if (item.tipo === "tarefa") {
      const tarefas = carregarTarefasKanban().map((t) =>
        t.id === item.origemId
          ? { ...t, status: "concluido" as const, updatedAt: new Date().toISOString() }
          : t
      );
      salvarTarefasKanban(tarefas);
    } else {
      const realizados = carregarEventosRealizados();
      realizados.add(`${item.origemId}:${item.data}`);
      localStorage.setItem(EVENTOS_REALIZADOS_KEY, JSON.stringify([...realizados]));
      setVersao((v) => v + 1);
    }
  }, []);

  return (
    <>
      <header className="topbar dashboard-topbar">
        <div>
          <span className="eyebrow">Visao geral</span>
          <h1>Dashboard</h1>
          <p>Acompanhe turmas, importacoes e pendencias de conselho.</p>
        </div>
        <div className="dashboard-topbar-actions">
          <button className="dashboard-search-trigger" onClick={onAbrirBusca}>
            <Search size={15} />
            <span>Buscar turmas, alunos...</span>
            <kbd>Ctrl+K</kbd>
          </button>
          <span className="dashboard-date">{formatarDataAtual()}</span>
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard icon={<Users size={24} />} tone="blue" value={String(turmas.length)} label="Turmas salvas" />
        <MetricCard icon={<GraduationCap size={24} />} tone="green" value={String(totalAlunos)} label="Alunos ativos" />
        <MetricCard icon={<CalendarClock size={24} />} tone="amber" value={String(ajustes)} label="Alunos com ajustes" />
        <MetricCard icon={<TrendingUp size={24} />} tone="purple" value={String(totalElegiveis)} label="Alunos elegiveis" />
      </section>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      {diagnosticoTurmas && (diagnosticoTurmas.pendentes.length > 0 || diagnosticoTurmas.resolvidos.length > 0) && (
        <div className="notice warning" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {diagnosticoTurmas.resolvidos.map((nome) => (
            <div key={`resolvido-${nome}`}>✓ {nome} não está mais em duas turmas — a reimportação corrigiu.</div>
          ))}
          {diagnosticoTurmas.pendentes.map((caso) => (
            <div key={caso.nome} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "0.15rem" }} />
                <span>
                  {caso.reimportado_sem_resolver ? (
                    <>
                      A reimportação da planilha não corrigiu <strong>{caso.nome}</strong> — continua ativo em{" "}
                      {caso.turmas.join(" e ")}. Isso indica que o problema está na planilha exportada pelo sistema
                      oficial (SED), não em algo que o CoordenacaoOP possa corrigir sozinho. Confira a planilha de
                      origem dessas turmas antes de reimportar de novo.
                    </>
                  ) : (
                    <>
                      <strong>{caso.nome}</strong> está ativo em duas turmas ao mesmo tempo: {caso.turmas.join(" e ")}.
                      Reimporte a planilha dessas turmas para corrigir.
                    </>
                  )}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                {!caso.reimportado_sem_resolver && (
                  <button type="button" className="secondary-action" onClick={onImportarAlunosLote}>
                    Reimportar turmas
                  </button>
                )}
                <button
                  type="button"
                  className="ghost-action"
                  title="Parar de mostrar este aviso — se o problema resolver sozinho no futuro, você ainda será avisado"
                  onClick={() => void dispensarCaso(caso.matricula_identidade)}
                >
                  Dispensar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="dashboard-grid">
        <div className="panel activity-panel timeline-dashboard-panel">
          <div className="panel-heading">
            <h3>Próximas datas</h3>
            <button onClick={onOpenCalendario}>Ver calendário</button>
          </div>
          <div style={{ height: "16px" }} />
          {/* Contador de atrasados */}
          {atrasados.length > 0 && (
            <button
              className="activity-row timeline-row"
              onClick={() => setAtrasadosExpandidos((a) => !a)}
              style={{ borderLeft: "3px solid #f04438", background: "var(--surface)" }}
            >
              <span className="timeline-dot" style={{ background: "#f04438" }} />
              <div>
                <strong style={{ color: "#f04438" }}>
                  {atrasados.length} {atrasados.length === 1 ? "item atrasado" : "itens atrasados"}
                </strong>
                <span>Clique para {atrasadosExpandidos ? "ocultar" : "ver e concluir"}</span>
              </div>
              <time style={{ color: "#f04438" }}>{atrasadosExpandidos ? "▲" : "▼"}</time>
            </button>
          )}

          {/* Lista de itens atrasados (expansível) */}
          {atrasadosExpandidos && atrasados.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
              <button
                className="activity-row timeline-row"
                style={{ flex: 1, opacity: 0.75 }}
                onClick={item.tipo === "tarefa" ? onOpenKanban : onOpenCalendario}
              >
                <span className="timeline-dot" style={{ background: item.cor }} />
                <div>
                  <strong>{item.titulo}</strong>
                  <span>{item.tipo === "tarefa" ? "Tarefa" : "Evento"}{item.recorrente ? " recorrente" : ""} · {item.descricao}</span>
                </div>
                <time style={{ color: "#f04438" }}>{rotuloDiasAte(item.data)}</time>
              </button>
              <button
                title={item.tipo === "tarefa" ? "Marcar como concluída" : "Marcar como realizado"}
                onClick={() => marcarConcluido(item)}
                style={{
                  border: "none", background: "transparent", cursor: "pointer",
                  padding: "0 0.75rem", color: "#13c65c", flexShrink: 0,
                  display: "flex", alignItems: "center",
                }}
              >
                <Check size={16} />
              </button>
            </div>
          ))}

          {/* Próximos itens */}
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
          {proximos.slice(proximaData ? 1 : 0).map((item) => (
            <button className="activity-row timeline-row" key={item.id} onClick={item.tipo === "tarefa" ? onOpenKanban : onOpenCalendario}>
              <span className="timeline-dot" style={{ background: item.cor }} />
              <div>
                <strong>{item.titulo}</strong>
                <span>{item.tipo === "tarefa" ? "Tarefa" : "Evento"}{item.recorrente ? " recorrente" : ""} · {item.descricao}</span>
              </div>
              <time>{formatarDataCurta(item.data)}</time>
            </button>
          ))}
          {!proximos.length && !atrasados.length && (
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
                  <small>{formatarResponsaveisTarefa(item)} · {formatarDataCurta(item.prazo)}</small>
                </div>
                <em>{rotuloPrioridade(item.prioridade)}</em>
              </button>
          ))}
          {!proximasTarefas.length && (
            <button className="council-card kanban-dashboard-task baixa" onClick={onOpenKanban}>
              <div>
                <strong>Nenhuma tarefa em aberto</strong>
                <span>Adicione cards no Quadro de Gestão.</span>
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
        const vinculos = formatarVinculosTarefa(tarefa);
        return (
          <button key={tarefa.id} type="button" className={`linked-task-card ${tarefa.prioridade}`} onClick={onOpenKanban}>
            <div>
              <strong>{tarefa.titulo}</strong>
              <span>{tarefa.descricao}</span>
              {evento && <small>Parte de: {evento.titulo}</small>}
              {vinculos && <small>Vínculo: {vinculos}</small>}
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
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}
