import {
  CalendarClock,
  CalendarDays,
  Check,
  Clock,
  Download,
  Filter,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { type FormEvent, type PointerEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  KANBAN_COLUMNS_STORAGE_KEY,
  KANBAN_STORAGE_KEY,
  arquivoParaAnexo,
  carregarTarefasKanban,
  carregarEventosCalendario,
  colunasKanbanPadrao,
  coresKanban,
  filtrarSugestoesFuzzy,
  formatarDataCurta,
  formatarVinculosTarefa,
  normalizarTextoGestao,
  obterVinculosEvento,
  obterVinculosTarefa,
  ordenarPorPrazoECriacao,
  ordenarTarefasKanban,
  reordenarColunaKanban,
  rotuloRecorrencia,
  salvarTarefasKanban,
  separarVinculos,
  tarefaEstaAtiva,
  tarefasKanbanIniciais,
  type CalendarEvent,
  type KanbanAnexo,
  type KanbanColuna,
  type KanbanDragPreview,
  type KanbanPrioridade,
  type KanbanStatus,
  type KanbanTarefa,
  type RecurrenceFrequency,
} from "./management";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { invokeApp, tauriDisponivel } from "./appBridge";
import { iniciaisPerfil, registrarExclusaoSincronizacao, WORKGROUP_SYNC_APPLIED_EVENT, type WorkgroupSyncProfile } from "./workgroupSync";

type TurmaKanban = {
  codigo: string;
  serie: string | null;
  nomes_alunos: string[];
};

type KanbanAnexoDesktop = KanbanAnexo & {
  caminho: string;
  origem: "interno" | "externo";
};

const ALERTAS_TAREFA = [
  { chave: "doisDias", diasAntes: 2, titulo: "Alerta 1", descricao: "2 dias antes" },
  { chave: "umDia", diasAntes: 1, titulo: "Alerta 2", descricao: "1 dia antes" },
  { chave: "noDia", diasAntes: 0, titulo: "Alerta 3", descricao: "No dia" },
] as const;

type AlertasFormulario = Record<(typeof ALERTAS_TAREFA)[number]["chave"], boolean>;
type AbaFormularioTarefa = "detalhes" | "vinculos" | "etiquetas" | "anexos" | "recorrencia";

const ABAS_FORMULARIO_TAREFA: { id: AbaFormularioTarefa; label: string }[] = [
  { id: "detalhes", label: "Detalhes" },
  { id: "vinculos", label: "Vínculos" },
  { id: "etiquetas", label: "Etiquetas" },
  { id: "anexos", label: "Anexos" },
  { id: "recorrencia", label: "Recorrência" },
];

const alertasFormularioPadrao: AlertasFormulario = {
  doisDias: false,
  umDia: false,
  noDia: false,
};

function alertasParaFormulario(tarefa: KanbanTarefa | null): AlertasFormulario {
  return ALERTAS_TAREFA.reduce<AlertasFormulario>((resultado, alerta) => {
    resultado[alerta.chave] = Boolean(tarefa?.alertas?.some((item) => item.diasAntes === alerta.diasAntes && item.ativo));
    return resultado;
  }, { ...alertasFormularioPadrao });
}

function montarAlertasTarefa(alertas: AlertasFormulario, prazo: string, tarefaAnterior?: KanbanTarefa | null) {
  return ALERTAS_TAREFA
    .filter((alerta) => alertas[alerta.chave])
    .map((alerta) => {
      const anterior = tarefaAnterior?.prazo === prazo
        ? tarefaAnterior.alertas?.find((item) => item.diasAntes === alerta.diasAntes)
        : undefined;
      return {
        diasAntes: alerta.diasAntes,
        ativo: true,
        disparadoEm: anterior?.disparadoEm,
      };
    });
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

function rotuloTurma(turma: TurmaKanban) {
  const serie = rotuloSerie(turma.serie);
  const codigo = turma.codigo ?? "";
  if (!serie) return rotuloSerie(codigo) || codigo;
  if (normalizarTextoGestao(codigo).startsWith(normalizarTextoGestao(turma.serie ?? ""))) {
    const resto = codigo.slice(turma.serie?.length ?? 0).trim();
    return `${serie} ${resto}`.trim();
  }
  return rotuloSerie(codigo) || codigo;
}

function adicionarSugestaoEmLista(texto: string, sugestao: string) {
  const vinculos = separarItensSeparados(texto);
  const chave = normalizarTextoGestao(sugestao);
  const semAtual = vinculos.filter((item) => normalizarTextoGestao(item) !== chave);
  return [...semAtual, sugestao].join(", ");
}

function separarItensSeparados(valor: string) {
  return separarVinculos(valor);
}

function ultimoItemDigitado(valor: string) {
  const partes = valor.split(/[,;\n]/);
  return partes[partes.length - 1]?.trim() ?? "";
}

export function QuadroKanban({ turmas = [], perfil }: { turmas?: TurmaKanban[]; perfil?: WorkgroupSyncProfile }) {
  const [tarefas, setTarefas] = useState<KanbanTarefa[]>(() => {
    try {
      const salvas = localStorage.getItem(KANBAN_STORAGE_KEY);
      return salvas ? JSON.parse(salvas) as KanbanTarefa[] : tarefasKanbanIniciais;
    } catch {
      return tarefasKanbanIniciais;
    }
  });
  const [colunas, setColunas] = useState<KanbanColuna[]>(() => {
    try {
      const salvas = localStorage.getItem(KANBAN_COLUMNS_STORAGE_KEY);
      return salvas ? JSON.parse(salvas) as KanbanColuna[] : colunasKanbanPadrao;
    } catch {
      return colunasKanbanPadrao;
    }
  });
  const [filtroAltaPrioridade, setFiltroAltaPrioridade] = useState(false);
  const [modalNovaTarefa, setModalNovaTarefa] = useState(false);
  const [tarefaEditando, setTarefaEditando] = useState<KanbanTarefa | null>(null);
  const [abaFormulario, setAbaFormulario] = useState<AbaFormularioTarefa>("detalhes");
  const [menuTarefaAberto, setMenuTarefaAberto] = useState<string | null>(null);
  const [etiquetasEditando, setEtiquetasEditando] = useState<string | null>(null);
  const [colunaEditando, setColunaEditando] = useState<KanbanStatus | null>(null);
  const [destacarAnexos, setDestacarAnexos] = useState(false);
  const [tarefaArrastada, setTarefaArrastada] = useState<string | null>(null);
  const [previewArraste, setPreviewArraste] = useState<KanbanDragPreview | null>(null);
  const [mensagemQuadro, setMensagemQuadro] = useState("");
  const [erroQuadro, setErroQuadro] = useState("");
  const eventosCalendario = useMemo(() => carregarEventosCalendario(), [modalNovaTarefa]);
  const [novaTarefa, setNovaTarefa] = useState({
    titulo: "",
    descricao: "",
    etiquetas: "",
    responsavel: "",
    prazo: "",
    prioridade: "media" as KanbanPrioridade,
    status: "fazer" as KanbanStatus,
    anexos: [] as KanbanAnexo[],
    eventId: "",
    vinculo: "",
    repetir: "none" as "none" | RecurrenceFrequency,
    intervalo: 1,
    repetirAte: "",
    compartilhada: false,
    alertas: { ...alertasFormularioPadrao },
  });

  useEffect(() => {
    salvarTarefasKanban(tarefas);
  }, [tarefas]);

  useEffect(() => {
    localStorage.setItem(KANBAN_COLUMNS_STORAGE_KEY, JSON.stringify(colunas));
  }, [colunas]);

  useEffect(() => {
    function recarregarEstadoCompartilhado() {
      setTarefas(carregarTarefasKanban());
      try {
        const salvas = localStorage.getItem(KANBAN_COLUMNS_STORAGE_KEY);
        setColunas(salvas ? JSON.parse(salvas) as KanbanColuna[] : colunasKanbanPadrao);
      } catch {
        setColunas(colunasKanbanPadrao);
      }
    }
    window.addEventListener(WORKGROUP_SYNC_APPLIED_EVENT, recarregarEstadoCompartilhado);
    return () => window.removeEventListener(WORKGROUP_SYNC_APPLIED_EVENT, recarregarEstadoCompartilhado);
  }, []);

  useEffect(() => {
    if (!modalNovaTarefa) return;

    function fecharComEsc(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setModalNovaTarefa(false);
      setTarefaEditando(null);
      setDestacarAnexos(false);
    }

    window.addEventListener("keydown", fecharComEsc);
    return () => window.removeEventListener("keydown", fecharComEsc);
  }, [modalNovaTarefa]);

  const tarefasVisiveis = useMemo(() => {
    if (!filtroAltaPrioridade) return tarefas;
    return tarefas.filter((tarefa) => tarefa.prioridade === "alta");
  }, [tarefas, filtroAltaPrioridade]);

  const contagemPorStatus = useMemo(() => {
    return colunas.reduce<Record<KanbanStatus, number>>((resultado, coluna) => {
      resultado[coluna.id] = tarefas.filter((tarefa) => tarefa.status === coluna.id).length;
      return resultado;
    }, { fazer: 0, progresso: 0, revisao: 0, concluido: 0 });
  }, [tarefas, colunas]);

  const sugestoesEtiquetas = useMemo(() => {
    return Array.from(new Set(tarefas.flatMap((tarefa) => tarefa.etiquetas))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tarefas]);

  const termoEtiquetaAtual = ultimoItemDigitado(novaTarefa.etiquetas);
  const etiquetasSelecionadas = separarItensSeparados(novaTarefa.etiquetas);
  const sugestoesEtiquetaTarefa = filtrarSugestoesFuzzy(
    sugestoesEtiquetas.filter((item) => !etiquetasSelecionadas.some((etiqueta) => normalizarTextoGestao(etiqueta) === normalizarTextoGestao(item))),
    termoEtiquetaAtual,
    6,
  );

  const sugestoesVinculo = useMemo(() => {
    const itens = new Set<string>();
    turmas.forEach((turma) => {
      itens.add(rotuloTurma(turma));
      (turma.nomes_alunos ?? []).forEach((nome) => itens.add(nome));
    });
    eventosCalendario.forEach((evento) => {
      obterVinculosEvento(evento).forEach((vinculo) => itens.add(vinculo));
    });
    tarefas.forEach((tarefa) => {
      obterVinculosTarefa(tarefa).forEach((vinculo) => itens.add(vinculo));
    });
    return Array.from(itens).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [turmas, eventosCalendario, tarefas]);

  const termoVinculoAtual = ultimoItemDigitado(novaTarefa.vinculo);
  const vinculosSelecionados = separarVinculos(novaTarefa.vinculo);
  const sugestoesVinculoTarefa = filtrarSugestoesFuzzy(
    sugestoesVinculo.filter((item) => !vinculosSelecionados.some((vinculo) => normalizarTextoGestao(vinculo) === normalizarTextoGestao(item))),
    termoVinculoAtual,
    6,
  );

  const totalAltaPrioridade = tarefas.filter((tarefa) => tarefaEstaAtiva(tarefa) && tarefa.prioridade === "alta").length;

  function moverTarefa(id: string, status: KanbanStatus) {
    setTarefas((atuais) => {
      const tarefaMovida = atuais.find((tarefa) => tarefa.id === id);
      if (!tarefaMovida) return atuais;
      const colunaDestino = atuais
        .filter((tarefa) => tarefa.id !== id && tarefa.status === status)
        .sort(ordenarTarefasKanban);
      return reordenarColunaKanban(atuais, [{ ...tarefaMovida, status, updatedAt: new Date().toISOString() }, ...colunaDestino], status);
    });
  }

  function aoIniciarArrastePorPonteiro(event: PointerEvent<HTMLElement>, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (deveIgnorarArrasteKanban(event.target)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTarefaArrastada(id);
    const rect = event.currentTarget.getBoundingClientRect();
    const tarefa = tarefas.find((item) => item.id === id);
    if (tarefa) {
      setPreviewArraste({
        tarefa,
        x: event.clientX,
        y: event.clientY,
        width: rect.width,
        height: rect.height,
      });
    }
  }

  function aoMoverArrastePorPonteiro(event: PointerEvent<HTMLElement>) {
    if (!tarefaArrastada) return;
    setPreviewArraste((atual) => atual ? { ...atual, x: event.clientX, y: event.clientY } : atual);
  }

  function aoSoltarArrastePorPonteiro(event: PointerEvent<HTMLElement>, id: string) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const elemento = document.elementFromPoint(event.clientX, event.clientY);
    const coluna = elemento?.closest<HTMLElement>("[data-kanban-column]");
    const statusDestino = coluna?.dataset.kanbanColumn as KanbanStatus | undefined;
    const statusAtual = tarefas.find((tarefa) => tarefa.id === id)?.status;
    if (statusDestino && statusDestino !== statusAtual) {
      moverTarefa(id, statusDestino);
    }
    setTarefaArrastada(null);
    setPreviewArraste(null);
  }

  function cancelarArrastePorPonteiro() {
    setTarefaArrastada(null);
    setPreviewArraste(null);
  }

  function ordenarAutomaticamente() {
    setTarefas((atuais) => atuais.map((tarefa) => ({ ...tarefa, ordem: undefined })).sort(ordenarPorPrazoECriacao));
  }

  function abrirNovaTarefa(status: KanbanStatus = "fazer") {
    setTarefaEditando(null);
    setNovaTarefa({ titulo: "", descricao: "", etiquetas: "", responsavel: "", prazo: "", prioridade: "media", status, anexos: [], eventId: "", vinculo: "", repetir: "none", intervalo: 1, repetirAte: "", compartilhada: false, alertas: { ...alertasFormularioPadrao } });
    setAbaFormulario("detalhes");
    setModalNovaTarefa(true);
  }

  function abrirEdicaoTarefa(tarefa: KanbanTarefa, anexar = false) {
    setMenuTarefaAberto(null);
    setDestacarAnexos(anexar);
    setTarefaEditando(tarefa);
    setAbaFormulario(anexar ? "anexos" : "detalhes");
    setNovaTarefa({
      titulo: tarefa.titulo,
      descricao: tarefa.descricao,
      etiquetas: tarefa.etiquetas.join(", "),
      responsavel: tarefa.responsavel,
      prazo: tarefa.prazo,
      prioridade: tarefa.prioridade,
      status: tarefa.status,
      anexos: tarefa.anexos ?? [],
      eventId: tarefa.eventId ?? "",
      vinculo: formatarVinculosTarefa(tarefa),
      repetir: tarefa.recorrencia?.frequency ?? "none",
      intervalo: tarefa.recorrencia?.interval ?? 1,
      repetirAte: tarefa.recorrencia?.until ?? "",
      compartilhada: tarefa.compartilhada === true,
      alertas: alertasParaFormulario(tarefa),
    });
    setModalNovaTarefa(true);
  }

  function apagarTarefa(id: string) {
    setMenuTarefaAberto(null);
    if (window.confirm("Apagar esta tarefa do quadro?")) {
      const tarefa = tarefas.find((item) => item.id === id);
      if (tarefa?.compartilhada === true) {
        registrarExclusaoSincronizacao("kanbanTask", id);
      }
      setTarefas((atuais) => atuais.filter((tarefa) => tarefa.id !== id));
    }
  }

  function salvarEtiquetas(id: string, etiquetas: string) {
    setTarefas((atuais) => atuais.map((tarefa) => tarefa.id === id ? {
      ...tarefa,
      etiquetas: etiquetas.split(",").map((item) => item.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    } : tarefa));
    setEtiquetasEditando(null);
  }

  function atualizarColuna(id: KanbanStatus, titulo: string, cor: string) {
    setColunas((atuais) => atuais.map((coluna) => coluna.id === id ? { ...coluna, titulo: titulo.trim() || coluna.titulo, cor } : coluna));
    setColunaEditando(null);
  }

  async function anexarArquivos(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const anexos = await Promise.all(Array.from(arquivos).map(arquivoParaAnexo));
    setNovaTarefa((atual) => ({ ...atual, anexos: [...atual.anexos, ...anexos] }));
  }

  async function selecionarAnexosDesktop() {
    setErroQuadro("");
    try {
      const selecionados = await abrirDialogoArquivo({
        multiple: true,
        title: "Selecionar anexos da tarefa",
      });
      const caminhos = Array.isArray(selecionados) ? selecionados : selecionados ? [selecionados] : [];
      if (!caminhos.length) return;
      const anexos = await Promise.all(
        caminhos.map((caminho) => invokeApp<KanbanAnexoDesktop>("preparar_anexo_kanban", { caminho })),
      );
      setNovaTarefa((atual) => ({ ...atual, anexos: [...atual.anexos, ...anexos] }));
    } catch (error) {
      setErroQuadro(error instanceof Error ? error.message : String(error));
    }
  }

  async function abrirAnexo(anexo: KanbanAnexo) {
    if (!anexo.caminho) return;
    try {
      await invokeApp("abrir_anexo_kanban", { caminho: anexo.caminho });
    } catch (error) {
      setErroQuadro(error instanceof Error ? error.message : String(error));
    }
  }

  function removerAnexo(id: string) {
    setNovaTarefa((atual) => ({ ...atual, anexos: atual.anexos.filter((anexo) => anexo.id !== id) }));
  }

  function exportarQuadro() {
    setMensagemQuadro("");
    setErroQuadro("");
    const payload = {
      tipo: "coordenacaoop-kanban",
      versao: 1,
      exportado_em: new Date().toISOString(),
      colunas,
      tarefas,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `coordenacaoop_quadro_gestao_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMensagemQuadro("Backup do quadro gerado separadamente dos dados de turmas.");
  }

  async function importarQuadro(arquivo: File | null) {
    if (!arquivo) return;
    setMensagemQuadro("");
    setErroQuadro("");
    try {
      const dados = JSON.parse(await arquivo.text()) as {
        tipo?: string;
        colunas?: KanbanColuna[];
        tarefas?: KanbanTarefa[];
      };
      if (dados.tipo !== "coordenacaoop-kanban" || !Array.isArray(dados.colunas) || !Array.isArray(dados.tarefas)) {
        throw new Error("Selecione um arquivo de backup do Quadro de Gestão.");
      }
      setColunas(dados.colunas);
      setTarefas(dados.tarefas);
      setMensagemQuadro("Backup do quadro importado. Os dados de turmas não foram alterados.");
    } catch (error) {
      setErroQuadro(error instanceof Error ? error.message : String(error));
    }
  }

  function criarTarefa(event: FormEvent) {
    event.preventDefault();
    const titulo = novaTarefa.titulo.trim();
    if (!titulo) return;

    const etiquetas = novaTarefa.etiquetas.split(",").map((item) => item.trim()).filter(Boolean);
    const vinculos = separarVinculos(novaTarefa.vinculo);
    const prazo = novaTarefa.prazo || new Date().toISOString().slice(0, 10);
    const agora = new Date().toISOString();
    const recorrencia = novaTarefa.repetir === "none" ? undefined : {
      frequency: novaTarefa.repetir,
      interval: Math.max(1, Number(novaTarefa.intervalo) || 1),
      until: novaTarefa.repetirAte || undefined,
    };

    if (tarefaEditando) {
      setTarefas((atuais) => atuais.map((tarefa) => tarefa.id === tarefaEditando.id ? {
        ...tarefa,
        titulo,
        descricao: novaTarefa.descricao.trim() || "Sem descrição informada",
        etiquetas,
        responsavel: novaTarefa.responsavel.trim() || "Coordenação",
        prazo,
        prioridade: novaTarefa.prioridade,
        status: novaTarefa.status,
        anexos: novaTarefa.anexos,
        eventId: novaTarefa.eventId || undefined,
        vinculo: vinculos[0],
        vinculos: vinculos.length ? vinculos : undefined,
        recorrencia,
        compartilhada: novaTarefa.compartilhada,
        alertas: montarAlertasTarefa(novaTarefa.alertas, prazo, tarefa),
        updatedAt: agora,
      } : tarefa));
      setTarefaEditando(null);
      setDestacarAnexos(false);
      setModalNovaTarefa(false);
      return;
    }

    const tarefa: KanbanTarefa = {
      id: `kanban-${Date.now()}`,
      titulo,
      descricao: novaTarefa.descricao.trim() || "Sem descrição informada",
      etiquetas,
      responsavel: novaTarefa.responsavel.trim() || "Coordenação",
      prazo,
      prioridade: novaTarefa.prioridade,
      status: novaTarefa.status,
      anexos: novaTarefa.anexos,
      eventId: novaTarefa.eventId || undefined,
      vinculo: vinculos[0],
      vinculos: vinculos.length ? vinculos : undefined,
      recorrencia,
      compartilhada: novaTarefa.compartilhada,
      alertas: montarAlertasTarefa(novaTarefa.alertas, prazo),
      createdAt: agora,
      updatedAt: agora,
    };

    setTarefas((atuais) => [tarefa, ...atuais]);
    setNovaTarefa({ titulo: "", descricao: "", etiquetas: "", responsavel: "", prazo: "", prioridade: "media", status: "fazer", anexos: [], eventId: "", vinculo: "", repetir: "none", intervalo: 1, repetirAte: "", compartilhada: false, alertas: { ...alertasFormularioPadrao } });
    setDestacarAnexos(false);
    setModalNovaTarefa(false);
  }

  return (
    <section className="kanban-page">
      <div className="topbar dashboard-topbar">
        <div>
          <h1>Quadro Kanban</h1>
          <p>Gerencie tarefas e atividades escolares</p>
        </div>
        <div className="kanban-top-actions">
          <button type="button" className="secondary-action" onClick={exportarQuadro}>
            <Download size={18} />
            Exportar Quadro
          </button>
          <button type="button" className="secondary-action" onClick={ordenarAutomaticamente}>
            <CalendarClock size={18} />
            Ordenar
          </button>
          <label className="secondary-action kanban-import-action">
            <Upload size={18} />
            Importar Quadro
            <input type="file" accept=".json,application/json" onChange={(event) => importarQuadro(event.target.files?.[0] ?? null)} />
          </label>
          <button
            type="button"
            className={`secondary-action ${filtroAltaPrioridade ? "selected" : ""}`}
            onClick={() => setFiltroAltaPrioridade((ativo) => !ativo)}
          >
            <Filter size={18} />
            Filtros
          </button>
          <button type="button" className="primary-action kanban-new-task" onClick={() => abrirNovaTarefa()}>
            <Plus size={18} />
            Nova Tarefa
          </button>
        </div>
      </div>

      <section className="kanban-metrics" aria-label="Resumo do quadro Kanban">
        <KanbanMetric label="Total de Tarefas" value={tarefas.length} icon={<Clock size={18} />} />
        {colunas.map((coluna) => (
          <KanbanMetric key={coluna.id} label={coluna.titulo} value={contagemPorStatus[coluna.id]} color={coluna.cor} />
        ))}
      </section>

      {totalAltaPrioridade > 0 && (
        <div className="kanban-alert">
          <Tag size={18} />
          <span>{totalAltaPrioridade} tarefa(s) de alta prioridade requer(em) atenção</span>
        </div>
      )}
      {mensagemQuadro && <div className="notice success kanban-notice">{mensagemQuadro}</div>}
      {erroQuadro && <div className="notice error kanban-notice">{erroQuadro}</div>}

      <section className="kanban-board" aria-label="Quadro de tarefas">
        {colunas.map((coluna) => {
          const tarefasColuna = tarefasVisiveis.filter((tarefa) => tarefa.status === coluna.id).sort(ordenarTarefasKanban);
          return (
            <article
              key={coluna.id}
              data-kanban-column={coluna.id}
              className={`kanban-column ${tarefaArrastada ? "drag-active" : ""}`}
            >
              <header className="kanban-column-header">
                <div className="kanban-column-title-wrap">
                  <span className="kanban-dot" style={{ background: coluna.cor }} />
                  <h2>{coluna.titulo}</h2>
                  <strong>{tarefasColuna.length}</strong>
                  <button className="kanban-column-edit" type="button" aria-label={`Editar ${coluna.titulo}`} onClick={() => setColunaEditando((atual) => atual === coluna.id ? null : coluna.id)}>
                    <Pencil size={14} />
                  </button>
                  {colunaEditando === coluna.id && (
                    <ColumnEditor coluna={coluna} onSalvar={atualizarColuna} onFechar={() => setColunaEditando(null)} />
                  )}
                </div>
                <button type="button" aria-label={`Adicionar tarefa em ${coluna.titulo}`} onClick={() => abrirNovaTarefa(coluna.id)}>
                  <Plus size={18} />
                </button>
              </header>

              <div className="kanban-column-body">
                {tarefasColuna.map((tarefa) => (
                  <KanbanTaskCard
                    key={tarefa.id}
                    tarefa={tarefa}
                    evento={eventosCalendario.find((evento) => evento.id === tarefa.eventId)}
                    perfil={perfil}
                    sugestoesEtiquetas={sugestoesEtiquetas}
                    menuAberto={menuTarefaAberto === tarefa.id}
                    editandoEtiquetas={etiquetasEditando === tarefa.id}
                    onToggleMenu={() => setMenuTarefaAberto((atual) => atual === tarefa.id ? null : tarefa.id)}
                    onEditar={() => abrirEdicaoTarefa(tarefa)}
                    onAnexar={() => abrirEdicaoTarefa(tarefa, true)}
                    onApagar={() => apagarTarefa(tarefa.id)}
                    onEditarEtiquetas={() => {
                      setMenuTarefaAberto(null);
                      setEtiquetasEditando(tarefa.id);
                    }}
                    onSalvarEtiquetas={(etiquetas) => salvarEtiquetas(tarefa.id, etiquetas)}
                    onCancelarEtiquetas={() => setEtiquetasEditando(null)}
                    onAbrirAnexo={abrirAnexo}
                    onPointerDown={(event) => aoIniciarArrastePorPonteiro(event, tarefa.id)}
                    onPointerMove={aoMoverArrastePorPonteiro}
                    onPointerUp={(event) => aoSoltarArrastePorPonteiro(event, tarefa.id)}
                    onPointerCancel={cancelarArrastePorPonteiro}
                    arrastando={tarefaArrastada === tarefa.id}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </section>

      {previewArraste && (
        <div
          className="kanban-drag-preview"
          style={{
            left: previewArraste.x,
            top: previewArraste.y,
            width: previewArraste.width,
            minHeight: Math.min(previewArraste.height, 180),
          }}
        >
          <strong>{previewArraste.tarefa.titulo}</strong>
          <span>{previewArraste.tarefa.responsavel || "Coordenação"}</span>
          <small>{formatarDataCurta(previewArraste.tarefa.prazo)}</small>
        </div>
      )}

      {modalNovaTarefa && (
        <div className="modal-backdrop">
          <form className="kanban-task-modal" onSubmit={criarTarefa}>
            <div className="modal-title-row">
              <div>
                <h2>{tarefaEditando ? "Editar tarefa" : "Nova tarefa"}</h2>
                <p>{tarefaEditando ? "Atualize os dados da pendência." : "Inclua uma pendência no quadro de gestão."}</p>
              </div>
              <button type="button" onClick={() => {
                setModalNovaTarefa(false);
                setTarefaEditando(null);
                setDestacarAnexos(false);
              }} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <label className="kanban-task-title-field">
              Título
              <input value={novaTarefa.titulo} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, titulo: event.target.value }))} autoFocus />
            </label>
            <div className="kanban-task-tabs" role="tablist" aria-label="Seções da tarefa">
              {ABAS_FORMULARIO_TAREFA.map((aba) => (
                <button
                  key={aba.id}
                  type="button"
                  className={abaFormulario === aba.id ? "active" : ""}
                  onClick={() => setAbaFormulario(aba.id)}
                  role="tab"
                  aria-selected={abaFormulario === aba.id}
                >
                  {aba.label}
                </button>
              ))}
            </div>
            <div className="kanban-task-modal-body">
              {abaFormulario === "detalhes" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Descrição
                    <textarea value={novaTarefa.descricao} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, descricao: event.target.value }))} />
                  </label>
                  <div className="kanban-form-grid">
                    <label>
                      Responsável
                      <input value={novaTarefa.responsavel} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, responsavel: event.target.value }))} />
                    </label>
                    <label>
                      Prazo
                      <input type="date" value={novaTarefa.prazo} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, prazo: event.target.value }))} />
                    </label>
                  </div>
                  <div className="kanban-form-grid">
                    <label>
                      Status
                      <select value={novaTarefa.status} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, status: event.target.value as KanbanStatus }))}>
                        {colunas.map((coluna) => (
                          <option key={coluna.id} value={coluna.id}>{coluna.titulo}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Prioridade
                      <select value={novaTarefa.prioridade} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, prioridade: event.target.value as KanbanPrioridade }))}>
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                    </label>
                  </div>
                  <div className="kanban-alert-options">
                    <span>Alertas do prazo</span>
                    <div>
                      {ALERTAS_TAREFA.map((alerta) => (
                        <button
                          key={alerta.chave}
                          type="button"
                          className={novaTarefa.alertas[alerta.chave] ? "selected" : ""}
                          onClick={() => setNovaTarefa((atual) => ({
                            ...atual,
                            alertas: {
                              ...atual.alertas,
                              [alerta.chave]: !atual.alertas[alerta.chave],
                            },
                          }))}
                        >
                          <strong>{alerta.titulo}</strong>
                          <small>{alerta.descricao}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="kanban-share-toggle">
                    <input
                      type="checkbox"
                      checked={novaTarefa.compartilhada}
                      onChange={(event) => setNovaTarefa((atual) => ({ ...atual, compartilhada: event.target.checked }))}
                    />
                    <span>
                      <strong>Compartilhar com o grupo de trabalho</strong>
                      <small>Quando desativado, esta tarefa fica somente nesta instalação.</small>
                    </span>
                  </label>
                </div>
              )}

              {abaFormulario === "vinculos" && (
                <div className="kanban-task-tab-panel">
                  <div className="kanban-form-grid">
                    <label>
                      Evento associado
                      <select value={novaTarefa.eventId} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, eventId: event.target.value }))}>
                        <option value="">Nenhum evento</option>
                        {eventosCalendario.map((evento) => (
                          <option key={evento.id} value={evento.id}>{evento.titulo}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Vínculos
                      <input
                        list="kanban-vinculos-sugeridos"
                        placeholder="Aluno, turma ou geral"
                        value={novaTarefa.vinculo}
                        onChange={(event) => setNovaTarefa((atual) => ({ ...atual, vinculo: event.target.value }))}
                      />
                      {sugestoesVinculoTarefa.length > 0 && (
                        <span className="calendar-link-suggestions">
                          {sugestoesVinculoTarefa.map((item) => (
                            <button
                              type="button"
                              key={item}
                              onClick={() => setNovaTarefa((atual) => ({ ...atual, vinculo: adicionarSugestaoEmLista(atual.vinculo, item) }))}
                            >
                              {item}
                            </button>
                          ))}
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              )}

              {abaFormulario === "etiquetas" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Etiquetas
                    <input list="kanban-etiquetas-sugeridas" placeholder="Conselho, Urgente" value={novaTarefa.etiquetas} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, etiquetas: event.target.value }))} />
                    {sugestoesEtiquetaTarefa.length > 0 && (
                      <span className="calendar-link-suggestions">
                        {sugestoesEtiquetaTarefa.map((item) => (
                          <button
                            type="button"
                            key={item}
                            onClick={() => setNovaTarefa((atual) => ({ ...atual, etiquetas: adicionarSugestaoEmLista(atual.etiquetas, item) }))}
                          >
                            {item}
                          </button>
                        ))}
                      </span>
                    )}
                  </label>
                </div>
              )}

              {abaFormulario === "anexos" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Anexos
                    {tauriDisponivel ? (
                      <button type="button" className={`kanban-file-picker ${destacarAnexos ? "highlight" : ""}`} onClick={selecionarAnexosDesktop}>
                        <Paperclip size={16} />
                        <strong>Selecionar arquivos</strong>
                        <small>{novaTarefa.anexos.length ? `${novaTarefa.anexos.length} arquivo(s) anexado(s)` : "Nenhum arquivo anexado"}</small>
                      </button>
                    ) : (
                      <span className={`kanban-file-picker ${destacarAnexos ? "highlight" : ""}`}>
                        <Paperclip size={16} />
                        <strong>Selecionar arquivos</strong>
                        <small>{novaTarefa.anexos.length ? `${novaTarefa.anexos.length} arquivo(s) anexado(s)` : "Nenhum arquivo anexado"}</small>
                        <input type="file" multiple onChange={(event) => anexarArquivos(event.target.files)} />
                      </span>
                    )}
                  </label>
                  {novaTarefa.anexos.length > 0 && (
                    <div className="kanban-attachment-list">
                      {novaTarefa.anexos.map((anexo) => (
                        <span key={anexo.id}>
                          <Paperclip size={14} />
                          {anexo.nome}
                          <button type="button" onClick={() => removerAnexo(anexo.id)} aria-label={`Remover ${anexo.nome}`}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {abaFormulario === "recorrencia" && (
                <div className="kanban-task-tab-panel">
                  <div className="kanban-form-grid">
                    <label>
                      Recorrência
                      <select value={novaTarefa.repetir} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, repetir: event.target.value as "none" | RecurrenceFrequency }))}>
                        <option value="none">Não repetir</option>
                        <option value="daily">Diariamente</option>
                        <option value="weekly">Semanalmente</option>
                        <option value="monthly">Mensalmente</option>
                        <option value="yearly">Anualmente</option>
                      </select>
                    </label>
                  </div>
                  {novaTarefa.repetir !== "none" && (
                    <div className="kanban-form-grid">
                      <label>
                        Repetir a cada
                        <input type="number" min={1} value={novaTarefa.intervalo} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, intervalo: Number(event.target.value) }))} />
                      </label>
                      <label>
                        Repetir até
                        <input type="date" value={novaTarefa.repetirAte} onChange={(event) => setNovaTarefa((atual) => ({ ...atual, repetirAte: event.target.value }))} />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
            <datalist id="kanban-etiquetas-sugeridas">
              {sugestoesEtiquetas.map((etiqueta) => (
                <option key={etiqueta} value={etiqueta} />
              ))}
            </datalist>
            <datalist id="kanban-vinculos-sugeridos">
              {sugestoesVinculo.map((vinculo) => (
                <option key={vinculo} value={vinculo} />
              ))}
            </datalist>
            <div className="modal-actions">
              <button type="button" onClick={() => {
                setModalNovaTarefa(false);
                setTarefaEditando(null);
                setDestacarAnexos(false);
              }}>Cancelar</button>
              <button type="submit" className="primary-action">{tarefaEditando ? "Salvar tarefa" : "Criar tarefa"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function KanbanMetric({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: ReactNode }) {
  return (
    <article className="kanban-metric-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {icon ?? <span className="kanban-metric-dot" style={{ background: color }} />}
    </article>
  );
}

function deveIgnorarArrasteKanban(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, input, textarea, select, a, label, [contenteditable='true']"));
}

function ColumnEditor({
  coluna,
  onSalvar,
  onFechar,
}: {
  coluna: KanbanColuna;
  onSalvar: (id: KanbanStatus, titulo: string, cor: string) => void;
  onFechar: () => void;
}) {
  const [titulo, setTitulo] = useState(coluna.titulo);
  const [cor, setCor] = useState(coluna.cor);

  return (
    <div className="kanban-column-editor">
      <label>
        Nome da coluna
        <input value={titulo} onChange={(event) => setTitulo(event.target.value)} />
      </label>
      <div className="kanban-color-options" aria-label="Cores da coluna">
        {coresKanban.map((opcao) => (
          <button
            key={opcao}
            type="button"
            className={cor === opcao ? "selected" : ""}
            style={{ background: opcao }}
            onClick={() => setCor(opcao)}
            aria-label={`Usar cor ${opcao}`}
          />
        ))}
      </div>
      <div className="kanban-editor-actions">
        <button type="button" onClick={onFechar}>Cancelar</button>
        <button type="button" onClick={() => onSalvar(coluna.id, titulo, cor)}>Salvar</button>
      </div>
    </div>
  );
}

function origemImagemAnexo(anexo: KanbanAnexo) {
  if (anexo.dados) return anexo.dados;
  if (anexo.caminho && tauriDisponivel) return convertFileSrc(anexo.caminho);
  return "";
}

function KanbanTaskCard({
  tarefa,
  evento,
  perfil,
  sugestoesEtiquetas,
  menuAberto,
  editandoEtiquetas,
  onToggleMenu,
  onEditar,
  onAnexar,
  onApagar,
  onEditarEtiquetas,
  onSalvarEtiquetas,
  onCancelarEtiquetas,
  onAbrirAnexo,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  arrastando,
}: {
  tarefa: KanbanTarefa;
  evento?: CalendarEvent;
  perfil?: WorkgroupSyncProfile;
  sugestoesEtiquetas: string[];
  menuAberto: boolean;
  editandoEtiquetas: boolean;
  onToggleMenu: () => void;
  onEditar: () => void;
  onAnexar: () => void;
  onApagar: () => void;
  onEditarEtiquetas: () => void;
  onSalvarEtiquetas: (etiquetas: string) => void;
  onCancelarEtiquetas: () => void;
  onAbrirAnexo: (anexo: KanbanAnexo) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  arrastando: boolean;
}) {
  const prioridadeClasse = tarefa.prioridade === "alta" ? "high" : tarefa.prioridade === "media" ? "medium" : "low";
  const anexos = tarefa.anexos ?? [];
  const imagens = anexos.filter((anexo) => anexo.tipo.startsWith("image/"));
  const documentos = anexos.filter((anexo) => !anexo.tipo.startsWith("image/"));
  const alertasAtivos = (tarefa.alertas ?? []).filter((alerta) => alerta.ativo).sort((a, b) => b.diasAntes - a.diasAntes);
  const usarAvatarPerfil = Boolean(perfil?.avatarDataUrl && normalizarTextoGestao(tarefa.responsavel) === normalizarTextoGestao(perfil.displayName));
  const vinculos = obterVinculosTarefa(tarefa);
  const [textoEtiquetas, setTextoEtiquetas] = useState(tarefa.etiquetas.join(", "));
  const termoEtiquetaAtual = ultimoItemDigitado(textoEtiquetas);
  const etiquetasSelecionadas = separarItensSeparados(textoEtiquetas);
  const sugestoesEtiquetasFiltradas = filtrarSugestoesFuzzy(
    sugestoesEtiquetas.filter((item) => !etiquetasSelecionadas.some((etiqueta) => normalizarTextoGestao(etiqueta) === normalizarTextoGestao(item))),
    termoEtiquetaAtual,
    5,
  );

  useEffect(() => {
    setTextoEtiquetas(tarefa.etiquetas.join(", "));
  }, [tarefa.etiquetas]);

  return (
    <article
      className={`kanban-task-card ${arrastando ? "is-dragging" : ""}`}
      draggable={false}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="kanban-card-title-row">
        <h3>{tarefa.titulo}</h3>
        <button type="button" aria-label="Mais opções" onClick={onToggleMenu}>
          <MoreVertical size={17} />
        </button>
        {menuAberto && (
          <div className="kanban-card-menu">
            <button type="button" onClick={onEditar}>
              <Pencil size={14} />
              Editar
            </button>
            <button type="button" onClick={onAnexar}>
              <Paperclip size={14} />
              Anexar
            </button>
            <button type="button" onClick={onApagar}>
              <Trash2 size={14} />
              Apagar
            </button>
          </div>
        )}
      </div>
      {imagens.length > 0 && (
        <div className="kanban-image-attachments">
          {imagens.map((anexo) => (
            <img key={anexo.id} src={origemImagemAnexo(anexo)} alt={anexo.nome} draggable={false} />
          ))}
        </div>
      )}
      <p>{tarefa.descricao}</p>
      {(evento || tarefa.recorrencia || vinculos.length > 0) && (
        <div className="kanban-linked-meta">
          {evento && (
            <span>
              <CalendarDays size={13} />
              Parte de: {evento.titulo}
            </span>
          )}
          {vinculos.map((vinculo) => (
            <span key={vinculo}>
              <Tag size={13} />
              {vinculo}
            </span>
          ))}
          {tarefa.recorrencia && (
            <span>
              <Clock size={13} />
              {rotuloRecorrencia(tarefa.recorrencia)}
            </span>
          )}
        </div>
      )}
      {editandoEtiquetas ? (
        <div className="kanban-tags-editor">
          <input
            list={`kanban-tags-${tarefa.id}`}
            value={textoEtiquetas}
            onChange={(event) => setTextoEtiquetas(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSalvarEtiquetas(textoEtiquetas);
              }
              if (event.key === "Escape") {
                onCancelarEtiquetas();
              }
            }}
            autoFocus
          />
          <datalist id={`kanban-tags-${tarefa.id}`}>
            {sugestoesEtiquetas.map((etiqueta) => (
              <option key={etiqueta} value={etiqueta} />
            ))}
          </datalist>
          {sugestoesEtiquetasFiltradas.length > 0 && (
            <span className="calendar-link-suggestions">
              {sugestoesEtiquetasFiltradas.map((etiqueta) => (
                <button type="button" key={etiqueta} onClick={() => setTextoEtiquetas((atual) => adicionarSugestaoEmLista(atual, etiqueta))}>
                  {etiqueta}
                </button>
              ))}
            </span>
          )}
          <button type="button" onClick={() => onSalvarEtiquetas(textoEtiquetas)} aria-label="Salvar etiquetas">
            <Check size={14} />
          </button>
        </div>
      ) : (
        <div className="kanban-tags">
          {tarefa.etiquetas.map((etiqueta) => (
            <span key={etiqueta}>{etiqueta}</span>
          ))}
          <button type="button" onClick={onEditarEtiquetas} aria-label="Editar etiquetas">
            <Pencil size={13} />
          </button>
        </div>
      )}
      {documentos.length > 0 && (
        <div className="kanban-doc-attachments">
          {documentos.map((anexo) => anexo.caminho ? (
            <button key={anexo.id} type="button" onClick={() => onAbrirAnexo(anexo)}>
              <Paperclip size={13} />
              {anexo.nome}
            </button>
          ) : (
            <a key={anexo.id} href={anexo.dados} download={anexo.nome}>
              <Paperclip size={13} />
              {anexo.nome}
            </a>
          ))}
        </div>
      )}
      {alertasAtivos.length > 0 && (
        <div className="kanban-reminder-tags">
          {alertasAtivos.map((alerta) => (
            <span key={alerta.diasAntes}>
              <CalendarClock size={13} />
              {alerta.diasAntes === 0 ? "No dia" : `${alerta.diasAntes} dia(s) antes`}
            </span>
          ))}
        </div>
      )}
      <footer>
        <span>
          {usarAvatarPerfil ? (
            <img className="kanban-assignee-avatar" src={perfil?.avatarDataUrl} alt="" />
          ) : (
            perfil?.displayName && normalizarTextoGestao(tarefa.responsavel) === normalizarTextoGestao(perfil.displayName)
              ? <span className="kanban-assignee-initials">{iniciaisPerfil(perfil.displayName)}</span>
              : <UserRound size={14} />
          )}
          {tarefa.responsavel}
        </span>
        <span>
          <CalendarDays size={14} />
          {formatarDataCurta(tarefa.prazo)}
        </span>
        <i className={prioridadeClasse} title={`Prioridade ${tarefa.prioridade}`} />
      </footer>
    </article>
  );
}
