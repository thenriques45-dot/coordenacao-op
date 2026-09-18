import { Clock, Download, Plus, Tag, Upload } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  KANBAN_COLUMNS_STORAGE_KEY,
  arquivoParaAnexo,
  carregarColunasKanban,
  carregarTarefasKanban,
  carregarEventosCalendario,
  colunaDaTarefa,
  idsDeConclusao,
  normalizarTextoGestao,
  obterResponsaveisTarefa,
  obterVinculosEvento,
  obterVinculosTarefa,
  salvarTarefasKanban,
  separarVinculos,
  statusPadrao,
  tarefaEstaAtiva,
  type CalendarEvent,
  type KanbanAnexo,
  type KanbanColuna,
  type KanbanStatus,
  type KanbanTarefa,
  type OrdenacaoColuna,
} from "./management";
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { invokeApp } from "./appBridge";
import {
  agruparMembrosPorPessoa,
  carregarMembrosSincronizacao,
  iniciaisPerfil,
  registrarExclusaoSincronizacao,
  WORKGROUP_SYNC_APPLIED_EVENT,
  type WorkgroupSyncMember,
  type WorkgroupSyncProfile,
} from "./workgroupSync";
import { equipeGestoraVazia, type EquipeGestora } from "./SettingsPage";
import { listarEquipe } from "./equipe";
import { CompositorRapido, type PropsFormularioTarefa } from "./kanban/CompositorRapido";
import { PainelCompleto } from "./kanban/PainelCompleto";
import { CartaoTarefa } from "./kanban/CartaoTarefa";
import { ColunaQuadro, CriacaoInline } from "./kanban/ColunaQuadro";
import { AvisoDesfazer, BarraFerramentas, BarraSelecao } from "./kanban/BarrasQuadro";
import { useArrasteQuadro } from "./kanban/useArrasteQuadro";
import { type AcoesAnexos } from "./kanban/camposTarefa";
import {
  DESCRICAO_VAZIA,
  formularioDaTarefa,
  formularioVazio,
  montarAlertasTarefa,
  rotuloPrazo,
  type FormularioTarefa,
} from "./kanban/formularioTarefa";
import {
  algumFiltroAtivo,
  alternarCartao,
  alternarDensidade,
  arquivadasDaColuna,
  arquivarTarefas,
  carregarExibicao,
  cartaoAberto,
  criarColuna,
  deslocarNaColuna,
  desfazerExclusaoColuna,
  estiloCorColuna,
  excluirColuna,
  filtrosVazios,
  moverParaPosicao,
  moverTarefasPara,
  restaurarTarefas,
  salvarExibicao,
  tarefaPassaNosFiltros,
  tarefasDaColuna,
  type FiltrosQuadro,
} from "./kanban/quadro";

// O VinculosPicker mudou para ./kanban; o re-export mantém o import do
// Calendário funcionando.
export { VinculosPicker } from "./kanban/VinculosPicker";

type TurmaKanban = {
  codigo: string;
  serie: string | null;
  nomes_alunos: string[];
};

type KanbanAnexoDesktop = KanbanAnexo & {
  caminho: string;
  origem: "interno" | "externo";
};

type Aviso = {
  id: number;
  texto: string;
  desfazer: () => void;
  // Chamado quando o aviso some sem Desfazer (tempo esgotado, outro aviso
  // tomou o lugar ou o quadro foi fechado). É onde a exclusão se consuma.
  aoExpirar?: () => void;
};

const DURACAO_AVISO_MS = 6000;

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

export function QuadroKanban({ turmas = [], perfil }: { turmas?: TurmaKanban[]; perfil?: WorkgroupSyncProfile }) {
  const [tarefas, setTarefas] = useState<KanbanTarefa[]>(carregarTarefasKanban);
  const [colunas, setColunas] = useState<KanbanColuna[]>(carregarColunasKanban);
  // Qual formulário está aberto. O estado do que foi digitado (novaTarefa)
  // é um só para os dois: trocar de "rapido" para "completo" preserva tudo.
  const [formulario, setFormulario] = useState<"rapido" | "completo" | null>(null);
  const [tarefaEditando, setTarefaEditando] = useState<KanbanTarefa | null>(null);
  const [novaTarefa, setNovaTarefa] = useState<FormularioTarefa>(() => formularioVazio(statusPadrao()));
  const [destacarAnexos, setDestacarAnexos] = useState(false);
  // Criação inline pelo "+" da coluna: id da coluna, título e detalhes em
  // digitação.
  const [criandoNaColuna, setCriandoNaColuna] = useState<{ coluna: KanbanStatus; titulo: string; descricao: string } | null>(null);
  const [menuTarefa, setMenuTarefa] = useState<string | null>(null);
  const [menuColuna, setMenuColuna] = useState<string | null>(null);
  const [colunaRecemCriada, setColunaRecemCriada] = useState<string | null>(null);
  const [renomeandoTarefa, setRenomeandoTarefa] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosQuadro>(filtrosVazios);
  const [exibicao, setExibicao] = useState(carregarExibicao);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [mensagemQuadro, setMensagemQuadro] = useState("");
  const [erroQuadro, setErroQuadro] = useState("");
  const [membrosSync, setMembrosSync] = useState<WorkgroupSyncMember[]>(() => carregarMembrosSincronizacao());
  const [equipeGestora, setEquipeGestora] = useState<EquipeGestora>(equipeGestoraVazia());
  const [eventosCalendario, setEventosCalendario] = useState<CalendarEvent[]>(() => carregarEventosCalendario());

  const avisoAtual = useRef<Aviso | null>(null);
  // Tarefas excluídas cujo Desfazer ainda está no ar. Ficam fora do quadro,
  // mas ainda SEM lápide de sincronização (ver excluirTarefas).
  const exclusaoPendente = useRef<Set<string>>(new Set());

  useEffect(() => {
    salvarTarefasKanban(tarefas);
  }, [tarefas]);

  useEffect(() => {
    localStorage.setItem(KANBAN_COLUMNS_STORAGE_KEY, JSON.stringify(colunas));
  }, [colunas]);

  useEffect(() => {
    salvarExibicao(exibicao);
  }, [exibicao]);

  useEffect(() => {
    function carregarEquipe() {
      invokeApp<{ equipe_gestora?: EquipeGestora }>("carregar_configuracoes")
        .then((c) => { if (c.equipe_gestora) setEquipeGestora(c.equipe_gestora); })
        .catch(() => {});
    }
    carregarEquipe();
    window.addEventListener(WORKGROUP_SYNC_APPLIED_EVENT, carregarEquipe);
    return () => window.removeEventListener(WORKGROUP_SYNC_APPLIED_EVENT, carregarEquipe);
  }, []);

  useEffect(() => {
    function recarregarEstadoCompartilhado() {
      // A mescla da sincronização pode trazer de volta uma tarefa que acabou
      // de ser excluída aqui: enquanto o Desfazer está no ar a lápide ainda
      // não existe, e o colega continua tendo a tarefa. Sem este filtro ela
      // reapareceria no quadro no meio da janela do Desfazer.
      const pendentes = exclusaoPendente.current;
      setTarefas(carregarTarefasKanban().filter((tarefa) => !pendentes.has(tarefa.id)));
      setEventosCalendario(carregarEventosCalendario());
      setMembrosSync(carregarMembrosSincronizacao());
    }
    function recarregarMembros() {
      setMembrosSync(carregarMembrosSincronizacao());
    }
    window.addEventListener(WORKGROUP_SYNC_APPLIED_EVENT, recarregarEstadoCompartilhado);
    window.addEventListener("coordenacaoop:workgroup-sync-profile-updated", recarregarMembros);
    return () => {
      window.removeEventListener(WORKGROUP_SYNC_APPLIED_EVENT, recarregarEstadoCompartilhado);
      window.removeEventListener("coordenacaoop:workgroup-sync-profile-updated", recarregarMembros);
    };
  }, []);

  // ── Aviso com Desfazer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => {
      if (avisoAtual.current?.id !== aviso.id) return;
      const expirado = avisoAtual.current;
      avisoAtual.current = null;
      setAviso(null);
      expirado.aoExpirar?.();
    }, DURACAO_AVISO_MS);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  // Sair do quadro com um aviso no ar consuma a ação: a exclusão ganha a
  // lápide em vez de ficar num limbo que nunca sincroniza.
  useEffect(() => () => {
    const pendente = avisoAtual.current;
    avisoAtual.current = null;
    pendente?.aoExpirar?.();
  }, []);

  function mostrarAviso(novo: Omit<Aviso, "id">) {
    // Um aviso novo toma o lugar do anterior, que se consuma.
    const anterior = avisoAtual.current;
    const comId = { ...novo, id: Date.now() + Math.random() };
    avisoAtual.current = comId;
    setAviso(comId);
    anterior?.aoExpirar?.();
  }

  function desfazerAviso() {
    const atual = avisoAtual.current;
    avisoAtual.current = null;
    setAviso(null);
    atual?.desfazer();
  }

  // ── Modo seleção: Esc sai ──────────────────────────────────────────────
  useEffect(() => {
    if (!modoSelecao || formulario) return;
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) sairDaSelecao();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [modoSelecao, formulario]);

  // ── Derivados ──────────────────────────────────────────────────────────
  const membrosParaCards = useMemo(() => {
    const membros = [...membrosSync];
    if (perfil?.displayName) {
      membros.push({
        userId: perfil.userId,
        displayName: perfil.displayName,
        role: perfil.role,
        deviceName: perfil.deviceName,
        avatarDataUrl: perfil.avatarDataUrl,
        updatedAt: perfil.updatedAt,
      });
    }
    // Equipe gestora entra no roster: nome completo + função, pra "Wilton" no
    // cartão casar com "Wilton Bortolleto · Coordenação" (via nomesCompativeis).
    for (const p of listarEquipe(equipeGestora)) {
      membros.push({ userId: `equipe-${p.id}`, displayName: p.nome, role: "", deviceName: "" });
    }
    return membros;
  }, [membrosSync, perfil, equipeGestora]);

  const concluintes = useMemo(() => idsDeConclusao(colunas), [colunas]);
  const tarefasNoQuadro = useMemo(() => tarefas.filter((tarefa) => !tarefa.arquivadaEm), [tarefas]);

  // Conta pela coluna de EXIBIÇÃO: uma tarefa compartilhada cujo status
  // aponta para uma coluna que só existe no quadro do colega cai na primeira
  // — se contasse pelo status cru, ela apareceria na tela sem entrar em
  // contagem nenhuma. Ver `colunaDaTarefa`.
  const contagemPorStatus = useMemo(() => {
    const zerado = Object.fromEntries(colunas.map((coluna) => [coluna.id, 0])) as Record<KanbanStatus, number>;
    return tarefasNoQuadro.reduce((resultado, tarefa) => {
      const coluna = colunaDaTarefa(tarefa, colunas);
      if (coluna) resultado[coluna.id] = (resultado[coluna.id] ?? 0) + 1;
      return resultado;
    }, zerado);
  }, [tarefasNoQuadro, colunas]);

  const sugestoesEtiquetas = useMemo(() => {
    return Array.from(new Set(tarefas.flatMap((tarefa) => tarefa.etiquetas))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tarefas]);

  const sugestoesResponsavel = useMemo(() => {
    // Agrupa por pessoa (não só por string exata) antes de sugerir — sem
    // isso, a mesma pessoa configurada com nomes ligeiramente diferentes (ou
    // vista em mais de um `userId`, ex.: dual boot) aparecia como duas
    // sugestões distintas.
    return agruparMembrosPorPessoa(membrosParaCards)
      .map((membro) => membro.displayName)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [membrosParaCards]);

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

  const totalAltaPrioridade = tarefas.filter((tarefa) => tarefaEstaAtiva(tarefa, concluintes) && tarefa.prioridade === "alta").length;
  const nomePerfil = perfil?.displayName ?? "";
  const filtrando = algumFiltroAtivo(filtros);

  // ── Arraste ────────────────────────────────────────────────────────────
  const { arraste, alvo, propsDoPunho } = useArrasteQuadro((id, destino) => {
    if (destino.antesDe === id) return;
    setTarefas((atuais) => moverParaPosicao(atuais, colunas, id, destino.coluna, destino.antesDe));
    // Arrastar devolve a coluna de destino para a ordem manual (seção 4).
    marcarManual(destino.coluna);
  });

  // ── Colunas ────────────────────────────────────────────────────────────
  function atualizarColuna(id: KanbanStatus, mudanca: Partial<KanbanColuna>) {
    setColunas((atuais) => atuais.map((coluna) => (coluna.id === id ? { ...coluna, ...mudanca } : coluna)));
  }

  function marcarManual(id: KanbanStatus) {
    setColunas((atuais) =>
      atuais.map((coluna) => (coluna.id === id && (coluna.ordenacao ?? "manual") !== "manual" ? { ...coluna, ordenacao: "manual" } : coluna)),
    );
  }

  function adicionarColuna() {
    const nova = criarColuna(colunas);
    setColunas((atuais) => [...atuais, nova]);
    setColunaRecemCriada(nova.id);
  }

  // Grava a flag EXPLÍCITA em todas as colunas, não só na clicada. Numa
  // instalação antiga nenhuma coluna tem a flag e a conclusão vem do id
  // "concluido" (ver idsDeConclusao); gravar só um false na clicada não
  // desligaria esse fallback, e desmarcar não teria efeito.
  function alternarConclusao(coluna: KanbanColuna) {
    setColunas((atuais) =>
      atuais.map((item) => ({ ...item, conclui: item.id === coluna.id ? !concluintes.has(item.id) : concluintes.has(item.id) })),
    );
  }

  // Exclui a coluna com Desfazer. Os cartões dela passam a aparecer na
  // primeira coluna sem ter o status reescrito (ver excluirColuna em quadro.ts).
  function excluirColunaDoQuadro(coluna: KanbanColuna) {
    const resultado = excluirColuna(colunas, tarefas, coluna.id);
    if (!resultado) return;
    const indice = colunas.findIndex((item) => item.id === coluna.id);
    // Preserva a marcação de conclusão efetiva: a coluna "concluido" das
    // instalações antigas conclui pelo id, não pela flag, e perderia isso ao
    // voltar pelo Desfazer se a flag não for gravada nela agora.
    const colunaParaDesfazer = concluintes.has(coluna.id) ? { ...coluna, conclui: true } : coluna;
    setColunas(resultado.colunas);
    setTarefas(resultado.tarefas);
    if (criandoNaColuna?.coluna === coluna.id) setCriandoNaColuna(null);
    const movidas = resultado.movidas
      ? ` · ${resultado.movidas} ${resultado.movidas === 1 ? "tarefa movida" : "tarefas movidas"} para ${resultado.destino.titulo}`
      : "";
    mostrarAviso({
      texto: `Coluna “${coluna.titulo}” excluída${movidas}`,
      // Desfaz sobre o estado ATUAL: o que mudou no quadro durante a janela
      // do aviso não se perde.
      desfazer: () => {
        setTarefas((atuais) => desfazerExclusaoColuna([], atuais, colunaParaDesfazer, indice, resultado.ordemAnterior).tarefas);
        setColunas((atuais) => desfazerExclusaoColuna(atuais, [], colunaParaDesfazer, indice, new Map()).colunas);
      },
    });
  }

  // ── Formulários ────────────────────────────────────────────────────────
  function abrirNovaTarefa(
    status: KanbanStatus = statusPadrao(colunas),
    modo: "rapido" | "completo" = "rapido",
    titulo = "",
    descricao = "",
  ) {
    setEventosCalendario(carregarEventosCalendario());
    setTarefaEditando(null);
    setDestacarAnexos(false);
    setCriandoNaColuna(null);
    setNovaTarefa({ ...formularioVazio(status, perfil?.displayName?.trim() || "Coordenação"), titulo, descricao });
    setFormulario(modo);
  }

  // Clique no corpo do cartão abre o compositor; o painel completo só por
  // escolha explícita ("Abrir detalhes" no menu, ou escalando do compositor).
  function abrirEdicaoTarefa(tarefa: KanbanTarefa, modo: "rapido" | "completo" = "rapido") {
    setEventosCalendario(carregarEventosCalendario());
    setMenuTarefa(null);
    setRenomeandoTarefa(null);
    setDestacarAnexos(false);
    setTarefaEditando(tarefa);
    setNovaTarefa(formularioDaTarefa(tarefa));
    setFormulario(modo);
  }

  function fecharFormulario() {
    setFormulario(null);
    setTarefaEditando(null);
    setDestacarAnexos(false);
  }

  // Monta a tarefa a partir do formulário. Com `anterior`, preserva o que o
  // formulário não edita (id, criação, ordem) e o carimbo dos alertas.
  function montarTarefa(form: FormularioTarefa, anterior: KanbanTarefa | null, agora: string): KanbanTarefa {
    const etiquetas = separarVinculos(form.etiquetas);
    const vinculos = separarVinculos(form.vinculo);
    const responsaveis = separarVinculos(form.responsavel);
    const prazo = form.prazo || new Date().toISOString().slice(0, 10);
    // Só guarda dataInicio se for anterior ao prazo.
    const dataInicio = form.dataInicio && form.dataInicio < prazo ? form.dataInicio : undefined;
    const recorrencia = form.repetir === "none" ? undefined : {
      frequency: form.repetir,
      interval: Math.max(1, Number(form.intervalo) || 1),
      until: form.repetirAte || undefined,
    };
    return {
      ...(anterior ?? {}),
      id: anterior?.id ?? `kanban-${Date.now()}`,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || DESCRICAO_VAZIA,
      etiquetas,
      responsavel: responsaveis[0] || "Coordenação",
      responsaveis: responsaveis.length ? responsaveis : undefined,
      dataInicio,
      prazo,
      prioridade: form.prioridade,
      status: form.status,
      anexos: form.anexos,
      eventId: form.eventId || undefined,
      vinculo: vinculos[0],
      vinculos: vinculos.length ? vinculos : undefined,
      recorrencia,
      compartilhada: form.compartilhada,
      alertas: montarAlertasTarefa(form.alertas, prazo, anterior),
      createdAt: anterior?.createdAt ?? agora,
      updatedAt: agora,
    };
  }

  function salvarFormulario() {
    if (!novaTarefa.titulo.trim()) return;
    const agora = new Date().toISOString();
    if (tarefaEditando) {
      setTarefas((atuais) => atuais.map((tarefa) => (tarefa.id === tarefaEditando.id ? montarTarefa(novaTarefa, tarefa, agora) : tarefa)));
    } else {
      setTarefas((atuais) => [montarTarefa(novaTarefa, null, agora), ...atuais]);
    }
    fecharFormulario();
  }

  // Criação rápida pelo "+" da coluna: título e detalhes, direto naquela
  // coluna.
  function criarNaColuna() {
    if (!criandoNaColuna) return;
    const titulo = criandoNaColuna.titulo.trim();
    if (!titulo) {
      // Sem título não há tarefa, mas detalhes já digitados não podem sumir
      // com um Ctrl+Enter distraído: só fecha se a caixa estiver vazia.
      if (!criandoNaColuna.descricao.trim()) setCriandoNaColuna(null);
      return;
    }
    const agora = new Date().toISOString();
    const base = formularioVazio(criandoNaColuna.coluna, perfil?.displayName?.trim() || "Coordenação");
    setTarefas((atuais) => [montarTarefa({ ...base, titulo, descricao: criandoNaColuna.descricao }, null, agora), ...atuais]);
    // Continua aberto para emendar a próxima tarefa na mesma coluna.
    setCriandoNaColuna({ coluna: criandoNaColuna.coluna, titulo: "", descricao: "" });
  }

  function abrirCriacaoNaColuna(coluna: KanbanColuna) {
    if (coluna.recolhida) atualizarColuna(coluna.id, { recolhida: false });
    setCriandoNaColuna({ coluna: coluna.id, titulo: "", descricao: "" });
  }

  // ── Ações sobre tarefas ────────────────────────────────────────────────
  function renomearTarefa(id: string, titulo: string) {
    setRenomeandoTarefa(null);
    const limpo = titulo.trim();
    if (!limpo) return;
    const agora = new Date().toISOString();
    setTarefas((atuais) => atuais.map((tarefa) => (tarefa.id === id && tarefa.titulo !== limpo ? { ...tarefa, titulo: limpo, updatedAt: agora } : tarefa)));
  }

  function deslocar(tarefa: KanbanTarefa, direcao: -1 | 1) {
    setMenuTarefa(null);
    const coluna = colunaDaTarefa(tarefa, colunas);
    setTarefas((atuais) => deslocarNaColuna(atuais, colunas, tarefa.id, direcao));
    if (coluna) marcarManual(coluna.id);
  }

  function tirarDaSelecao(ids: string[]) {
    const alvo = new Set(ids);
    setSelecionadas((atuais) => atuais.filter((id) => !alvo.has(id)));
  }

  function arquivar(ids: string[]) {
    const alvo = ids.filter((id) => tarefas.some((tarefa) => tarefa.id === id && !tarefa.arquivadaEm));
    if (!alvo.length) return;
    setMenuTarefa(null);
    setTarefas((atuais) => arquivarTarefas(atuais, alvo));
    tirarDaSelecao(alvo);
    mostrarAviso({
      texto: alvo.length === 1 ? "Tarefa arquivada" : `${alvo.length} tarefas arquivadas`,
      // Desfazer RESTAURA com carimbo novo em vez de devolver o objeto antigo:
      // se a sincronização já levou o arquivamento aos colegas dentro da
      // janela do aviso, só uma versão mais nova vence a mescla — a antiga
      // seria sobrescrita e a tarefa voltaria a ficar arquivada.
      desfazer: () => setTarefas((atuais) => restaurarTarefas(atuais, alvo)),
    });
  }

  // Exclusão com Desfazer e lápide ADIADA: a tarefa some na hora, mas a
  // lápide de sincronização só é gravada quando o aviso expira. Gravar na
  // hora faria o Desfazer inútil numa tarefa compartilhada — a sincronização
  // re-apagaria a tarefa restaurada em até 45 s.
  function excluirTarefas(ids: string[]) {
    const alvo = new Set(ids);
    const removidas = tarefas.filter((tarefa) => alvo.has(tarefa.id));
    if (!removidas.length) return;
    setMenuTarefa(null);
    setTarefas((atuais) => atuais.filter((tarefa) => !alvo.has(tarefa.id)));
    tirarDaSelecao(ids);

    let resolvida = false;
    const liberar = () => removidas.forEach((tarefa) => exclusaoPendente.current.delete(tarefa.id));
    mostrarAviso({
      texto: removidas.length === 1 ? "Tarefa excluída" : `${removidas.length} tarefas excluídas`,
      desfazer: () => {
        if (resolvida) return;
        resolvida = true;
        liberar();
        setTarefas((atuais) => [...removidas.filter((tarefa) => !atuais.some((atual) => atual.id === tarefa.id)), ...atuais]);
      },
      aoExpirar: () => {
        if (resolvida) return;
        resolvida = true;
        liberar();
        removidas
          .filter((tarefa) => tarefa.compartilhada === true)
          .forEach((tarefa) => registrarExclusaoSincronizacao("kanbanTask", tarefa.id));
      },
    });
    removidas.forEach((tarefa) => exclusaoPendente.current.add(tarefa.id));
  }

  function alternarSelecionada(id: string) {
    setSelecionadas((atuais) => (atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]));
  }

  function sairDaSelecao() {
    setModoSelecao(false);
    setSelecionadas([]);
  }

  function moverSelecionadas(destino: KanbanStatus) {
    setTarefas((atuais) => moverTarefasPara(atuais, selecionadas, destino));
    setSelecionadas([]);
  }

  // ── Anexos ─────────────────────────────────────────────────────────────
  async function anexarArquivos(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const anexos = await Promise.all(Array.from(arquivos).map(arquivoParaAnexo));
    setNovaTarefa((atual) => ({ ...atual, anexos: [...atual.anexos, ...anexos] }));
  }

  async function adicionarAnexosPorCaminho(caminhos: string[]) {
    setErroQuadro("");
    try {
      const anexos = await Promise.all(
        caminhos.map((caminho) => invokeApp<KanbanAnexoDesktop>("preparar_anexo_kanban", { caminho })),
      );
      setNovaTarefa((atual) => ({ ...atual, anexos: [...atual.anexos, ...anexos] }));
    } catch (error) {
      setErroQuadro(error instanceof Error ? error.message : String(error));
    }
  }

  async function selecionarAnexosDesktop() {
    setErroQuadro("");
    try {
      const selecionados = await abrirDialogoArquivo({
        multiple: true,
        title: "Selecionar anexos da tarefa",
      });
      const caminhos = Array.isArray(selecionados) ? selecionados : selecionados ? [selecionados] : [];
      if (caminhos.length) await adicionarAnexosPorCaminho(caminhos);
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

  // ── Backup do quadro ───────────────────────────────────────────────────
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

  const acoesAnexos: AcoesAnexos = {
    selecionar: selecionarAnexosDesktop,
    adicionarArquivos: anexarArquivos,
    adicionarCaminhos: adicionarAnexosPorCaminho,
    remover: removerAnexo,
  };

  const propsFormulario: PropsFormularioTarefa = {
    form: novaTarefa,
    setForm: setNovaTarefa,
    editando: Boolean(tarefaEditando),
    colunas,
    eventos: eventosCalendario,
    sugestoesResponsavel,
    sugestoesVinculo,
    sugestoesEtiquetas,
    acoesAnexos,
    destacarAnexos,
    onSalvar: salvarFormulario,
    onFechar: fecharFormulario,
  };

  const tarefaArrastada = arraste ? tarefas.find((tarefa) => tarefa.id === arraste.id) : undefined;

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
          <label className="secondary-action kanban-import-action">
            <Upload size={18} />
            Importar Quadro
            <input type="file" accept=".json,application/json" onChange={(event) => importarQuadro(event.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>

      <section className="kanban-metrics" aria-label="Resumo do quadro Kanban">
        <KanbanMetric label="Total de Tarefas" value={tarefasNoQuadro.length} icon={<Clock size={18} />} />
        {colunas.map((coluna) => (
          <KanbanMetric key={coluna.id} label={coluna.titulo} value={contagemPorStatus[coluna.id] ?? 0} color={coluna.cor} />
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

      <BarraFerramentas
        filtros={filtros}
        onFiltros={setFiltros}
        nomePerfil={nomePerfil}
        densidade={exibicao.densidade}
        onDensidade={(densidade) => setExibicao(alternarDensidade(densidade))}
        modoSelecao={modoSelecao}
        onAlternarSelecao={() => (modoSelecao ? sairDaSelecao() : setModoSelecao(true))}
        onNovaTarefa={() => abrirNovaTarefa()}
      />

      <section className={`kb-quadro ${arraste ? "arrastando" : ""}`} aria-label="Quadro de tarefas">
        {colunas.map((coluna) => {
          const todas = tarefasDaColuna(tarefas, coluna, colunas);
          const visiveis = filtrando
            ? todas.filter((tarefa) => tarefaPassaNosFiltros(tarefa, filtros, { nomePerfil, concluintes }))
            : todas;
          const ehConclusao = concluintes.has(coluna.id);
          return (
            <ColunaQuadro
              key={coluna.id}
              coluna={coluna}
              quantidade={visiveis.length}
              ocultasPorFiltro={todas.length - visiveis.length}
              quantidadeArquivadas={arquivadasDaColuna(tarefas, coluna, colunas).length}
              concluintesArquivaveis={todas.length}
              ehConclusao={ehConclusao}
              unicaConclusao={ehConclusao && concluintes.size === 1}
              podeExcluir={colunas.length > 1}
              iniciarRenomeando={colunaRecemCriada === coluna.id}
              onAlternarConclusao={() => alternarConclusao(coluna)}
              onExcluir={() => excluirColunaDoQuadro(coluna)}
              onFimRenomear={() => setColunaRecemCriada((atual) => (atual === coluna.id ? null : atual))}
              sobArraste={Boolean(arraste) && alvo?.coluna === coluna.id}
              menuAberto={menuColuna === coluna.id}
              onAlternarMenu={() => setMenuColuna((atual) => (atual === coluna.id ? null : coluna.id))}
              onFecharMenu={() => setMenuColuna(null)}
              onAlternarRecolhida={() => atualizarColuna(coluna.id, { recolhida: !coluna.recolhida })}
              onAdicionar={() => abrirCriacaoNaColuna(coluna)}
              onOrdenar={(ordenacao: OrdenacaoColuna) => atualizarColuna(coluna.id, { ordenacao })}
              onRenomear={(titulo) => atualizarColuna(coluna.id, { titulo })}
              onCor={(cor) => atualizarColuna(coluna.id, { cor })}
              onArquivarConcluidas={() => arquivar(todas.map((tarefa) => tarefa.id))}
              onRestaurarArquivadas={() =>
                setTarefas((atuais) => restaurarTarefas(atuais, arquivadasDaColuna(atuais, coluna, colunas).map((tarefa) => tarefa.id)))
              }
              criacaoInline={
                criandoNaColuna?.coluna === coluna.id ? (
                  <CriacaoInline
                    titulo={criandoNaColuna.titulo}
                    descricao={criandoNaColuna.descricao}
                    onChange={(mudanca) => setCriandoNaColuna((atual) => (atual ? { ...atual, ...mudanca } : atual))}
                    onCriar={criarNaColuna}
                    onCancelar={() => setCriandoNaColuna(null)}
                    onDetalhes={() => abrirNovaTarefa(coluna.id, "completo", criandoNaColuna.titulo, criandoNaColuna.descricao)}
                  />
                ) : null
              }
            >
              {visiveis.map((tarefa) => {
                const indice = todas.indexOf(tarefa);
                return (
                  <CartaoTarefa
                    key={tarefa.id}
                    tarefa={tarefa}
                    evento={eventosCalendario.find((evento) => evento.id === tarefa.eventId)}
                    membros={membrosParaCards}
                    equipeGestora={equipeGestora}
                    concluida={ehConclusao}
                    aberto={cartaoAberto(tarefa.id, exibicao)}
                    modoSelecao={modoSelecao}
                    selecionada={selecionadas.includes(tarefa.id)}
                    menuAberto={menuTarefa === tarefa.id}
                    renomeando={renomeandoTarefa === tarefa.id}
                    arrastando={arraste?.id === tarefa.id}
                    alvoDeQueda={Boolean(arraste) && arraste?.id !== tarefa.id && alvo?.antesDe === tarefa.id}
                    podeSubir={indice > 0}
                    podeDescer={indice >= 0 && indice < todas.length - 1}
                    punho={propsDoPunho(tarefa.id)}
                    onAbrir={() => abrirEdicaoTarefa(tarefa, "rapido")}
                    onAbrirDetalhes={() => abrirEdicaoTarefa(tarefa, "completo")}
                    onAbrirDetalhesComTitulo={(titulo) => {
                      setRenomeandoTarefa(null);
                      abrirEdicaoTarefa(tarefa, "completo");
                      setNovaTarefa((atual) => ({ ...atual, titulo }));
                    }}
                    onAlternarAberto={() => setExibicao((atual) => alternarCartao(tarefa.id, atual))}
                    onAlternarSelecao={() => alternarSelecionada(tarefa.id)}
                    onAlternarMenu={() => setMenuTarefa((atual) => (atual === tarefa.id ? null : tarefa.id))}
                    onFecharMenu={() => setMenuTarefa(null)}
                    onIniciarRenomear={() => {
                      setMenuTarefa(null);
                      setRenomeandoTarefa(tarefa.id);
                    }}
                    onRenomear={(titulo) => renomearTarefa(tarefa.id, titulo)}
                    onCancelarRenomear={() => setRenomeandoTarefa(null)}
                    onSubir={() => deslocar(tarefa, -1)}
                    onDescer={() => deslocar(tarefa, 1)}
                    onArquivar={() => arquivar([tarefa.id])}
                    onExcluir={() => excluirTarefas([tarefa.id])}
                    onAbrirAnexo={abrirAnexo}
                  />
                );
              })}
            </ColunaQuadro>
          );
        })}
        <button type="button" className="kb-nova-coluna" onClick={adicionarColuna}>
          <Plus size={18} />
          Nova coluna
        </button>
      </section>

      {arraste && tarefaArrastada && (
        <div
          className="kb-previa-arraste"
          style={{ left: arraste.x - arraste.deslocX, top: arraste.y - arraste.deslocY, width: arraste.largura }}
          aria-hidden="true"
        >
          <strong>{tarefaArrastada.titulo}</strong>
          <span>
            {[rotuloPrazo(tarefaArrastada.dataInicio ?? "", tarefaArrastada.prazo), iniciaisPerfil(obterResponsaveisTarefa(tarefaArrastada)[0] ?? "")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      )}

      {modoSelecao && (
        <BarraSelecao
          quantidade={selecionadas.length}
          colunas={colunas}
          onMover={moverSelecionadas}
          onArquivar={() => arquivar(selecionadas)}
          onExcluir={() => excluirTarefas(selecionadas)}
          onSair={sairDaSelecao}
        />
      )}
      {aviso && <AvisoDesfazer texto={aviso.texto} acimaDaBarra={modoSelecao} onDesfazer={desfazerAviso} />}

      {formulario === "rapido" && (
        <CompositorRapido {...propsFormulario} onAbrirCompleto={() => setFormulario("completo")} />
      )}
      {formulario === "completo" && (
        <PainelCompleto
          {...propsFormulario}
          onArquivar={tarefaEditando && !tarefaEditando.arquivadaEm ? () => {
            arquivar([tarefaEditando.id]);
            fecharFormulario();
          } : undefined}
          onExcluir={tarefaEditando ? () => {
            excluirTarefas([tarefaEditando.id]);
            fecharFormulario();
          } : undefined}
        />
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
      {icon ?? <span className="kanban-metric-dot kb-cor-coluna" style={color ? estiloCorColuna(color) : undefined} />}
    </article>
  );
}
