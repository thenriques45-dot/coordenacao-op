import { Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  CALENDAR_STORAGE_KEY,
  KANBAN_STORAGE_KEY,
  adicionarMeses,
  carregarEventosCalendario,
  carregarTarefasKanban,
  chaveData,
  colunasKanbanPadrao,
  coresCalendario,
  filtrarSugestoesFuzzy,
  formatarDataLonga,
  montarLinhaDoTempo,
  normalizarTextoGestao,
  formatarVinculosEvento,
  obterVinculosEvento,
  obterVinculosTarefa,
  rotuloRecorrencia,
  separarVinculos,
  type CalendarEvent,
  type KanbanPrioridade,
  type KanbanStatus,
  type KanbanTarefa,
  type RecurrenceFrequency,
  type TimelineItem,
} from "./management";
import { registrarExclusaoSincronizacao, WORKGROUP_SYNC_APPLIED_EVENT } from "./workgroupSync";

type TurmaCalendario = {
  codigo: string;
  serie: string | null;
  nomes_alunos: string[];
};

type AbaFormularioEvento = "detalhes" | "vinculos" | "aparencia" | "recorrencia";
type AbaFormularioTarefaCalendario = "detalhes" | "vinculos" | "etiquetas" | "recorrencia";

const ABAS_FORMULARIO_EVENTO: { id: AbaFormularioEvento; label: string }[] = [
  { id: "detalhes", label: "Detalhes" },
  { id: "vinculos", label: "Vínculos" },
  { id: "aparencia", label: "Aparência" },
  { id: "recorrencia", label: "Recorrência" },
];

const ABAS_FORMULARIO_TAREFA_CALENDARIO: { id: AbaFormularioTarefaCalendario; label: string }[] = [
  { id: "detalhes", label: "Detalhes" },
  { id: "vinculos", label: "Vínculos" },
  { id: "etiquetas", label: "Etiquetas" },
  { id: "recorrencia", label: "Recorrência" },
];

function normalizarBusca(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function rotuloSerie(valor?: string | null) {
  if (!valor) return "";
  return valor
    .replace(/\b([1-3])\s*a\s+serie\b/gi, "$1ª Série")
    .replace(/\b([1-9])\s*o\s+ano\b/gi, "$1º Ano")
    .replace(/\bpre-escola\b/gi, "Pré-escola")
    .replace(/\bbercario\b/gi, "Berçário")
    .replace(/\bserie\b/gi, "Série")
    .replace(/\bano\b/gi, "Ano");
}

function rotuloTurma(turma: TurmaCalendario) {
  const serie = rotuloSerie(turma.serie);
  const codigo = turma.codigo ?? "";
  if (!serie) return rotuloSerie(codigo) || codigo;
  if (normalizarBusca(codigo).startsWith(normalizarBusca(turma.serie ?? ""))) {
    const resto = codigo.slice(turma.serie?.length ?? 0).trim();
    return `${serie} ${resto}`.trim();
  }
  return rotuloSerie(codigo) || codigo;
}

function adicionarSugestaoEmLista(texto: string, sugestao: string) {
  const vinculos = separarVinculos(texto);
  const chave = normalizarTextoGestao(sugestao);
  const semAtual = vinculos.filter((item) => normalizarTextoGestao(item) !== chave);
  return [...semAtual, sugestao].join(", ");
}

function ultimoItemDigitado(valor: string) {
  const partes = valor.split(/[,;\n]/);
  return partes[partes.length - 1]?.trim() ?? "";
}

export function CalendarioGestao({
  turmas,
  onOpenKanban,
}: {
  turmas: TurmaCalendario[];
  onOpenKanban: () => void;
}) {
  const [eventos, setEventos] = useState<CalendarEvent[]>(() => carregarEventosCalendario());
  const [tarefas, setTarefas] = useState<KanbanTarefa[]>(() => carregarTarefasKanban());
  const [mesAtual, setMesAtual] = useState(() => new Date());
  const [diaSelecionado, setDiaSelecionado] = useState(() => chaveData(new Date()));
  const [modalEvento, setModalEvento] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<CalendarEvent | null>(null);
  const [abaEvento, setAbaEvento] = useState<AbaFormularioEvento>("detalhes");
  const [modalTarefa, setModalTarefa] = useState(false);
  const [eventoTarefa, setEventoTarefa] = useState<CalendarEvent | null>(null);
  const [abaTarefa, setAbaTarefa] = useState<AbaFormularioTarefaCalendario>("detalhes");
  const [ocultarTarefasAssociadas, setOcultarTarefasAssociadas] = useState(false);
  const [formEvento, setFormEvento] = useState({
    titulo: "",
    descricao: "",
    data: chaveData(new Date()),
    dataFim: "",
    horaInicio: "",
    horaFim: "",
    categoria: "Geral",
    cor: coresCalendario[0],
    prioridade: "media" as KanbanPrioridade,
    vinculo: "",
    repetir: "none" as "none" | RecurrenceFrequency,
    intervalo: 1,
    repetirAte: "",
  });
  const [formTarefa, setFormTarefa] = useState({
    titulo: "",
    descricao: "",
    etiquetas: "",
    responsavel: "Coordenação",
    prazo: chaveData(new Date()),
    prioridade: "media" as KanbanPrioridade,
    status: "fazer" as KanbanStatus,
    vinculo: "",
    repetir: "none" as "none" | RecurrenceFrequency,
    intervalo: 1,
    repetirAte: "",
  });

  useEffect(() => {
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(eventos));
  }, [eventos]);

  useEffect(() => {
    localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify(tarefas));
  }, [tarefas]);

  useEffect(() => {
    function recarregarEstadoCompartilhado() {
      setEventos(carregarEventosCalendario());
      setTarefas(carregarTarefasKanban());
    }
    window.addEventListener(WORKGROUP_SYNC_APPLIED_EVENT, recarregarEstadoCompartilhado);
    return () => window.removeEventListener(WORKGROUP_SYNC_APPLIED_EVENT, recarregarEstadoCompartilhado);
  }, []);

  useEffect(() => {
    if (!modalEvento) return;
    function fecharComEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalEvento(false);
        setEventoEditando(null);
      }
    }
    window.addEventListener("keydown", fecharComEsc);
    return () => window.removeEventListener("keydown", fecharComEsc);
  }, [modalEvento]);

  useEffect(() => {
    if (!modalTarefa) return;
    function fecharComEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModalTarefa(false);
        setEventoTarefa(null);
      }
    }
    window.addEventListener("keydown", fecharComEsc);
    return () => window.removeEventListener("keydown", fecharComEsc);
  }, [modalTarefa]);

  const itensCalendario = useMemo(() => montarLinhaDoTempo(tarefas, eventos, 120), [tarefas, eventos]);
  const itensPorDia = useMemo(() => {
    return itensCalendario.reduce<Record<string, TimelineItem[]>>((resultado, item) => {
      resultado[item.data] = [...(resultado[item.data] ?? []), item];
      return resultado;
    }, {});
  }, [itensCalendario]);
  const itensDiaSelecionado = itensPorDia[diaSelecionado] ?? [];

  const diasDoMes = useMemo(() => {
    const primeiro = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1);
    const inicio = new Date(primeiro);
    inicio.setDate(primeiro.getDate() - primeiro.getDay());
    return Array.from({ length: 42 }, (_, indice) => {
      const data = new Date(inicio);
      data.setDate(inicio.getDate() + indice);
      return data;
    });
  }, [mesAtual]);
  const sugestoesVinculo = useMemo(() => {
    const itens = new Set<string>();
    turmas.forEach((turma) => {
      itens.add(rotuloTurma(turma));
      (turma.nomes_alunos ?? []).forEach((nome) => itens.add(nome));
    });
    eventos.forEach((evento) => {
      obterVinculosEvento(evento).forEach((vinculo) => itens.add(vinculo));
    });
    tarefas.forEach((tarefa) => {
      obterVinculosTarefa(tarefa).forEach((vinculo) => itens.add(vinculo));
    });
    return Array.from(itens).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [turmas, eventos, tarefas]);
  const termoVinculoEvento = ultimoItemDigitado(formEvento.vinculo);
  const vinculosEventoSelecionados = separarVinculos(formEvento.vinculo);
  const sugestoesEvento = filtrarSugestoesFuzzy(
    sugestoesVinculo.filter((item) => !vinculosEventoSelecionados.some((vinculo) => normalizarTextoGestao(vinculo) === normalizarTextoGestao(item))),
    termoVinculoEvento,
    5,
  );
  const termoVinculoTarefa = ultimoItemDigitado(formTarefa.vinculo);
  const vinculosTarefaSelecionados = separarVinculos(formTarefa.vinculo);
  const sugestoesTarefa = filtrarSugestoesFuzzy(
    sugestoesVinculo.filter((item) => !vinculosTarefaSelecionados.some((vinculo) => normalizarTextoGestao(vinculo) === normalizarTextoGestao(item))),
    termoVinculoTarefa,
    5,
  );

  function abrirNovoEvento(data = diaSelecionado) {
    setEventoEditando(null);
    setAbaEvento("detalhes");
    setFormEvento({
      titulo: "",
      descricao: "",
      data,
      dataFim: "",
      horaInicio: "",
      horaFim: "",
      categoria: "Geral",
      cor: coresCalendario[0],
      prioridade: "media",
      vinculo: "",
      repetir: "none",
      intervalo: 1,
      repetirAte: "",
    });
    setModalEvento(true);
  }

  function abrirEdicaoEvento(evento: CalendarEvent) {
    setEventoEditando(evento);
    setAbaEvento("detalhes");
    setFormEvento({
      titulo: evento.titulo,
      descricao: evento.descricao,
      data: evento.data,
      dataFim: evento.dataFim ?? "",
      horaInicio: evento.horaInicio,
      horaFim: evento.horaFim,
      categoria: evento.categoria,
      cor: evento.cor,
      prioridade: evento.prioridade,
      vinculo: formatarVinculosEvento(evento),
      repetir: evento.recorrencia?.frequency ?? "none",
      intervalo: evento.recorrencia?.interval ?? 1,
      repetirAte: evento.recorrencia?.until ?? "",
    });
    setModalEvento(true);
  }

  function salvarEvento(event: FormEvent) {
    event.preventDefault();
    const titulo = formEvento.titulo.trim();
    if (!titulo) return;
    const recorrencia = formEvento.repetir === "none" ? undefined : {
      frequency: formEvento.repetir,
      interval: Math.max(1, Number(formEvento.intervalo) || 1),
      until: formEvento.repetirAte || undefined,
    };
    const agora = new Date().toISOString();
    const vinculos = separarVinculos(formEvento.vinculo);
    const dataInicio = formEvento.data || chaveData(new Date());
    // Só guarda dataFim se for posterior à data de início.
    const dataFim = formEvento.dataFim && formEvento.dataFim > dataInicio ? formEvento.dataFim : undefined;
    const payload: CalendarEvent = {
      id: eventoEditando?.id ?? `evento-${Date.now()}`,
      titulo,
      descricao: formEvento.descricao.trim(),
      data: dataInicio,
      dataFim,
      horaInicio: formEvento.horaInicio,
      horaFim: formEvento.horaFim,
      categoria: formEvento.categoria.trim() || "Geral",
      cor: formEvento.cor,
      prioridade: formEvento.prioridade,
      vinculo: vinculos[0] ?? "Geral",
      vinculos: vinculos.length ? vinculos : undefined,
      recorrencia,
      createdAt: eventoEditando?.createdAt ?? agora,
      updatedAt: agora,
    };
    setEventos((atuais) => eventoEditando ? atuais.map((item) => item.id === eventoEditando.id ? payload : item) : [payload, ...atuais]);
    setDiaSelecionado(payload.data);
    setModalEvento(false);
    setEventoEditando(null);
  }

  function apagarEvento(id: string) {
    if (!window.confirm("Apagar este evento do calendário? As tarefas associadas permanecem no Kanban.")) return;
    registrarExclusaoSincronizacao("calendarEvent", id);
    setEventos((atuais) => atuais.filter((evento) => evento.id !== id));
    setTarefas((atuais) => atuais.map((tarefa) => tarefa.eventId === id ? { ...tarefa, eventId: undefined } : tarefa));
  }

  function abrirTarefaAssociada(evento: CalendarEvent) {
    setEventoTarefa(evento);
    setAbaTarefa("detalhes");
    setFormTarefa({
      titulo: `Preparar ${evento.titulo}`,
      descricao: evento.descricao || "Tarefa associada a evento do calendário.",
      etiquetas: `${evento.categoria}, Calendário`,
      responsavel: "Coordenação",
      prazo: evento.data,
      prioridade: evento.prioridade,
      status: "fazer",
      vinculo: formatarVinculosEvento(evento),
      repetir: "none",
      intervalo: 1,
      repetirAte: "",
    });
    setModalTarefa(true);
  }

  function salvarTarefaAssociada(event: FormEvent) {
    event.preventDefault();
    if (!eventoTarefa || !formTarefa.titulo.trim()) return;
    const vinculos = separarVinculos(formTarefa.vinculo || formatarVinculosEvento(eventoTarefa));
    const recorrencia = formTarefa.repetir === "none" ? undefined : {
      frequency: formTarefa.repetir,
      interval: Math.max(1, Number(formTarefa.intervalo) || 1),
      until: formTarefa.repetirAte || undefined,
    };
    const tarefa: KanbanTarefa = {
      id: `kanban-${Date.now()}`,
      titulo: formTarefa.titulo.trim(),
      descricao: formTarefa.descricao.trim() || "Tarefa associada a evento do calendário.",
      etiquetas: formTarefa.etiquetas.split(",").map((item) => item.trim()).filter(Boolean),
      responsavel: formTarefa.responsavel.trim() || "Coordenação",
      prazo: formTarefa.prazo || eventoTarefa.data,
      prioridade: formTarefa.prioridade,
      status: formTarefa.status,
      eventId: eventoTarefa.id,
      vinculo: vinculos[0] ?? eventoTarefa.vinculo,
      vinculos: vinculos.length ? vinculos : undefined,
      recorrencia,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTarefas((atuais) => [tarefa, ...atuais]);
    setModalTarefa(false);
    setEventoTarefa(null);
  }

  return (
    <section className="calendar-page">
      <div className="topbar dashboard-topbar">
        <div>
          <h1>Calendário de Gestão</h1>
          <p>Visualize eventos, tarefas com prazo e recorrências em uma agenda única.</p>
        </div>
        <div className="kanban-top-actions">
          <button type="button" className="secondary-action" onClick={() => setMesAtual(new Date())}>
            <Clock size={18} />
            Hoje
          </button>
          <button type="button" className="primary-action" onClick={() => abrirNovoEvento()}>
            <Plus size={18} />
            Novo Evento
          </button>
        </div>
      </div>

      <section className="calendar-layout">
        <div className="calendar-panel">
          <header className="calendar-month-header">
            <button type="button" onClick={() => setMesAtual(adicionarMeses(mesAtual, -1))}>‹</button>
            <h2>{mesAtual.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
            <button type="button" onClick={() => setMesAtual(adicionarMeses(mesAtual, 1))}>›</button>
          </header>
          <div className="calendar-weekdays">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => <span key={dia}>{dia}</span>)}
          </div>
          <div className="calendar-grid">
            {diasDoMes.map((data) => {
              const chave = chaveData(data);
              const itens = itensPorDia[chave] ?? [];
              const foraDoMes = data.getMonth() !== mesAtual.getMonth();
              return (
                <button
                  key={chave}
                  type="button"
                  className={`calendar-day ${foraDoMes ? "muted" : ""} ${diaSelecionado === chave ? "selected" : ""}`}
                  onClick={() => setDiaSelecionado(chave)}
                  onDoubleClick={() => abrirNovoEvento(chave)}
                >
                  <strong>{data.getDate()}</strong>
                  <div>
                    {itens.slice(0, 3).map((item) => (
                      <span key={item.id} style={{ background: item.cor }} title={item.titulo} />
                    ))}
                  </div>
                  {itens.length > 3 && <em>+{itens.length - 3}</em>}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="calendar-agenda">
          <div className="panel-heading">
            <div>
              <h3>{formatarDataLonga(diaSelecionado)}</h3>
              <span>{itensDiaSelecionado.length} item(ns) com data</span>
            </div>
            <button type="button" onClick={() => abrirNovoEvento(diaSelecionado)}>Adicionar</button>
          </div>
          <label className="calendar-hide-linked">
            <input type="checkbox" checked={ocultarTarefasAssociadas} onChange={(event) => setOcultarTarefasAssociadas(event.target.checked)} />
            Ocultar tarefas dentro dos eventos
          </label>
          <div className="calendar-agenda-list">
            {itensDiaSelecionado.filter((item) => !(ocultarTarefasAssociadas && item.tipo === "tarefa" && item.eventId)).map((item) => {
              const evento = eventos.find((atual) => atual.id === item.origemId);
              const tarefasAssociadas = item.tipo === "evento" ? tarefas.filter((tarefa) => tarefa.eventId === item.origemId) : [];
              const abrirItemCalendario = () => {
                if (item.tipo === "tarefa") {
                  onOpenKanban();
                }
              };
              return (
                <article
                  className={`calendar-agenda-item ${item.tipo === "tarefa" ? "is-task clickable" : "is-event"}`}
                  key={item.id}
                  onClick={abrirItemCalendario}
                  tabIndex={item.tipo === "tarefa" ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (item.tipo === "tarefa" && event.key === "Enter") onOpenKanban();
                  }}
                >
                  <span className="calendar-item-dot" style={{ background: item.cor }} />
                  <div>
                    <small>{item.tipo === "tarefa" ? "Tarefa do Kanban" : item.hora ? `Evento · ${item.hora}` : "Evento"}</small>
                    <strong>{item.titulo}</strong>
                    <p>{item.descricao}{item.recorrente ? ` · ${rotuloRecorrencia(evento?.recorrencia)}` : ""}</p>
                    {!ocultarTarefasAssociadas && tarefasAssociadas.length > 0 && (
                      <div className="calendar-linked-tasks">
                        {tarefasAssociadas.map((tarefa) => (
                          <button key={tarefa.id} type="button" onClick={onOpenKanban}>{tarefa.titulo}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {evento && (
                    <div className="calendar-item-actions">
                      <button type="button" onClick={() => abrirTarefaAssociada(evento)}>Tarefa</button>
                      <button type="button" onClick={() => abrirEdicaoEvento(evento)}><Pencil size={14} /></button>
                      <button type="button" onClick={() => apagarEvento(evento.id)}><Trash2 size={14} /></button>
                    </div>
                  )}
                  {item.tipo === "tarefa" && (
                    <div className="calendar-item-actions">
                      <span>Abrir no Kanban</span>
                    </div>
                  )}
                </article>
              );
            })}
            {!itensDiaSelecionado.length && (
              <button className="calendar-empty-day" type="button" onClick={() => abrirNovoEvento(diaSelecionado)}>
                Nenhum item nesta data. Criar evento.
              </button>
            )}
          </div>
        </aside>
      </section>

      {modalEvento && (
        <div className="modal-backdrop">
          <form className="kanban-task-modal calendar-event-modal" onSubmit={salvarEvento}>
            <div className="modal-title-row">
              <div>
                <h2>{eventoEditando ? "Editar evento" : "Novo evento"}</h2>
                <p>Registre compromissos gerais ou vinculados à rotina escolar.</p>
              </div>
              <button type="button" onClick={() => setModalEvento(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <label className="kanban-task-title-field">
              Título
              <input value={formEvento.titulo} onChange={(event) => setFormEvento((atual) => ({ ...atual, titulo: event.target.value }))} autoFocus />
            </label>
            <div className="kanban-task-tabs" role="tablist" aria-label="Seções do evento">
              {ABAS_FORMULARIO_EVENTO.map((aba) => (
                <button
                  key={aba.id}
                  type="button"
                  className={abaEvento === aba.id ? "active" : ""}
                  onClick={() => setAbaEvento(aba.id)}
                  role="tab"
                  aria-selected={abaEvento === aba.id}
                >
                  {aba.label}
                </button>
              ))}
            </div>
            <div className="kanban-task-modal-body">
              {abaEvento === "detalhes" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Descrição
                    <textarea value={formEvento.descricao} onChange={(event) => setFormEvento((atual) => ({ ...atual, descricao: event.target.value }))} />
                  </label>
                  <div className="kanban-form-grid">
                    <label>
                      Data de início
                      <input type="date" value={formEvento.data} onChange={(event) => setFormEvento((atual) => ({ ...atual, data: event.target.value }))} />
                    </label>
                    <label>
                      Data de fim (opcional)
                      <input
                        type="date"
                        value={formEvento.dataFim}
                        min={formEvento.data}
                        onChange={(event) => setFormEvento((atual) => ({ ...atual, dataFim: event.target.value }))}
                      />
                    </label>
                  </div>
                  {formEvento.dataFim && formEvento.dataFim > formEvento.data && (
                    <p className="kanban-form-hint">O evento será exibido em todos os dias entre o início e o fim.</p>
                  )}
                  <div className="kanban-form-grid">
                    <label>
                      Prioridade
                      <select value={formEvento.prioridade} onChange={(event) => setFormEvento((atual) => ({ ...atual, prioridade: event.target.value as KanbanPrioridade }))}>
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                    </label>
                  </div>
                  <div className="kanban-form-grid">
                    <label>
                      Início
                      <input type="time" value={formEvento.horaInicio} onChange={(event) => setFormEvento((atual) => ({ ...atual, horaInicio: event.target.value }))} />
                    </label>
                    <label>
                      Fim
                      <input type="time" value={formEvento.horaFim} onChange={(event) => setFormEvento((atual) => ({ ...atual, horaFim: event.target.value }))} />
                    </label>
                  </div>
                </div>
              )}

              {abaEvento === "vinculos" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Vínculos
                    <input list="calendar-vinculos" placeholder="Geral, turma, aluno ou conselho" value={formEvento.vinculo} onChange={(event) => setFormEvento((atual) => ({ ...atual, vinculo: event.target.value }))} />
                    {sugestoesEvento.length > 0 && (
                      <span className="calendar-link-suggestions">
                        {sugestoesEvento.map((item) => (
                          <button
                            type="button"
                            key={item}
                            onClick={() => setFormEvento((atual) => ({ ...atual, vinculo: adicionarSugestaoEmLista(atual.vinculo, item) }))}
                          >
                            {item}
                          </button>
                        ))}
                      </span>
                    )}
                  </label>
                </div>
              )}

              {abaEvento === "aparencia" && (
                <div className="kanban-task-tab-panel">
                  <div className="kanban-form-grid">
                    <label>
                      Categoria
                      <input value={formEvento.categoria} onChange={(event) => setFormEvento((atual) => ({ ...atual, categoria: event.target.value }))} />
                    </label>
                    <label>
                      Cor
                      <div className="calendar-color-picker">
                        {coresCalendario.map((cor) => (
                          <button key={cor} type="button" className={formEvento.cor === cor ? "selected" : ""} style={{ background: cor }} onClick={() => setFormEvento((atual) => ({ ...atual, cor }))} />
                        ))}
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {abaEvento === "recorrencia" && (
                <div className="kanban-task-tab-panel">
                  <div className="kanban-form-grid">
                    <label>
                      Recorrência
                      <select value={formEvento.repetir} onChange={(event) => setFormEvento((atual) => ({ ...atual, repetir: event.target.value as "none" | RecurrenceFrequency }))}>
                        <option value="none">Não repetir</option>
                        <option value="daily">Diariamente</option>
                        <option value="weekly">Semanalmente</option>
                        <option value="monthly">Mensalmente</option>
                        <option value="yearly">Anualmente</option>
                      </select>
                    </label>
                  </div>
                  {formEvento.repetir !== "none" && (
                    <div className="kanban-form-grid">
                      <label>
                        Repetir a cada
                        <input type="number" min={1} value={formEvento.intervalo} onChange={(event) => setFormEvento((atual) => ({ ...atual, intervalo: Number(event.target.value) }))} />
                      </label>
                      <label>
                        Repetir até
                        <input type="date" value={formEvento.repetirAte} onChange={(event) => setFormEvento((atual) => ({ ...atual, repetirAte: event.target.value }))} />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setModalEvento(false)}>Cancelar</button>
              <button type="submit" className="primary-action">{eventoEditando ? "Salvar evento" : "Criar evento"}</button>
            </div>
            <datalist id="calendar-vinculos">
              {sugestoesVinculo.map((item) => <option key={item} value={item} />)}
            </datalist>
          </form>
        </div>
      )}
      {modalTarefa && eventoTarefa && (
        <div className="modal-backdrop">
          <form className="kanban-task-modal calendar-event-modal" onSubmit={salvarTarefaAssociada}>
            <div className="modal-title-row">
              <div>
                <h2>Tarefa associada</h2>
                <p>{eventoTarefa.titulo}</p>
              </div>
              <button type="button" onClick={() => setModalTarefa(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <label className="kanban-task-title-field">
              Título
              <input value={formTarefa.titulo} onChange={(event) => setFormTarefa((atual) => ({ ...atual, titulo: event.target.value }))} autoFocus />
            </label>
            <div className="kanban-task-tabs" role="tablist" aria-label="Seções da tarefa associada">
              {ABAS_FORMULARIO_TAREFA_CALENDARIO.map((aba) => (
                <button
                  key={aba.id}
                  type="button"
                  className={abaTarefa === aba.id ? "active" : ""}
                  onClick={() => setAbaTarefa(aba.id)}
                  role="tab"
                  aria-selected={abaTarefa === aba.id}
                >
                  {aba.label}
                </button>
              ))}
            </div>
            <div className="kanban-task-modal-body">
              {abaTarefa === "detalhes" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Descrição
                    <textarea value={formTarefa.descricao} onChange={(event) => setFormTarefa((atual) => ({ ...atual, descricao: event.target.value }))} />
                  </label>
                  <div className="kanban-form-grid">
                    <label>
                      Responsável
                      <input value={formTarefa.responsavel} onChange={(event) => setFormTarefa((atual) => ({ ...atual, responsavel: event.target.value }))} />
                    </label>
                    <label>
                      Prazo
                      <input type="date" value={formTarefa.prazo} onChange={(event) => setFormTarefa((atual) => ({ ...atual, prazo: event.target.value }))} />
                    </label>
                  </div>
                  <div className="kanban-form-grid">
                    <label>
                      Status
                      <select value={formTarefa.status} onChange={(event) => setFormTarefa((atual) => ({ ...atual, status: event.target.value as KanbanStatus }))}>
                        {colunasKanbanPadrao.map((coluna) => <option key={coluna.id} value={coluna.id}>{coluna.titulo}</option>)}
                      </select>
                    </label>
                    <label>
                      Prioridade
                      <select value={formTarefa.prioridade} onChange={(event) => setFormTarefa((atual) => ({ ...atual, prioridade: event.target.value as KanbanPrioridade }))}>
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {abaTarefa === "vinculos" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Vínculos
                    <input list="calendar-vinculos-task" value={formTarefa.vinculo} onChange={(event) => setFormTarefa((atual) => ({ ...atual, vinculo: event.target.value }))} />
                    {sugestoesTarefa.length > 0 && (
                      <span className="calendar-link-suggestions">
                        {sugestoesTarefa.map((item) => (
                          <button
                            type="button"
                            key={item}
                            onClick={() => setFormTarefa((atual) => ({ ...atual, vinculo: adicionarSugestaoEmLista(atual.vinculo, item) }))}
                          >
                            {item}
                          </button>
                        ))}
                      </span>
                    )}
                  </label>
                </div>
              )}

              {abaTarefa === "etiquetas" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Etiquetas
                    <input value={formTarefa.etiquetas} onChange={(event) => setFormTarefa((atual) => ({ ...atual, etiquetas: event.target.value }))} />
                  </label>
                </div>
              )}

              {abaTarefa === "recorrencia" && (
                <div className="kanban-task-tab-panel">
                  <div className="kanban-form-grid">
                    <label>
                      Recorrência
                      <select value={formTarefa.repetir} onChange={(event) => setFormTarefa((atual) => ({ ...atual, repetir: event.target.value as "none" | RecurrenceFrequency }))}>
                        <option value="none">Não repetir</option>
                        <option value="daily">Diariamente</option>
                        <option value="weekly">Semanalmente</option>
                        <option value="monthly">Mensalmente</option>
                        <option value="yearly">Anualmente</option>
                      </select>
                    </label>
                  </div>
                  {formTarefa.repetir !== "none" && (
                    <div className="kanban-form-grid">
                      <label>
                        Repetir a cada
                        <input type="number" min={1} value={formTarefa.intervalo} onChange={(event) => setFormTarefa((atual) => ({ ...atual, intervalo: Number(event.target.value) }))} />
                      </label>
                      <label>
                        Repetir até
                        <input type="date" value={formTarefa.repetirAte} onChange={(event) => setFormTarefa((atual) => ({ ...atual, repetirAte: event.target.value }))} />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
            <datalist id="calendar-vinculos-task">
              {sugestoesVinculo.map((item) => <option key={item} value={item} />)}
            </datalist>
            <div className="modal-actions">
              <button type="button" onClick={() => setModalTarefa(false)}>Cancelar</button>
              <button type="submit" className="primary-action">Criar tarefa</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
