import { ChevronDown, ChevronRight, LayoutGrid, MessageCircle, Plus, Rows3, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";
import { montarLinhas, seloCanal } from "./atendimentos/dados";
import { dataCurta, iniciais, tempoRelativo, useMediaQuery } from "./atendimentos/formato";
import { AbaDisparos, type DisparoLoteRegistro } from "./atendimentos/AbaDisparos";
import { AbaPorAluno } from "./atendimentos/AbaPorAluno";
import { AssistenteLote } from "./atendimentos/AssistenteLote";
import { CompositorMensagem } from "./atendimentos/CompositorMensagem";
import { ModalAtendimento, type ModoModalAtendimento } from "./atendimentos/ModalAtendimento";
import { PainelThread } from "./atendimentos/PainelThread";
import type { MensagemTemplate } from "./SettingsPage";
import type {
  AtendimentoAlunoInput,
  AtendimentoAnexo,
  FollowupPrevisto,
  LinhaAtendimento,
  TurmaDetalheAtendimentos,
  TurmaResumoAtendimentos,
} from "./atendimentos/tipos";

const TIPOS_ATENDIMENTO_PADRAO = ["Disciplinar", "Dúvidas", "Pedagógico", "Financeiro", "Educação especial"];
const TIPO_CONTATO_FAMILIA = "Contato com a família";

const PERIODOS: { valor: string; rotulo: string; dias: number | null }[] = [
  { valor: "todos", rotulo: "Todo o período", dias: null },
  { valor: "30", rotulo: "Últimos 30 dias", dias: 30 },
  { valor: "90", rotulo: "Últimos 90 dias", dias: 90 },
  { valor: "365", rotulo: "Último ano", dias: 365 },
];

const CANAIS: { valor: string; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos os canais" },
  { valor: "manual", rotulo: "Manual" },
  { valor: "wa_me", rotulo: "wa.me" },
  { valor: "api", rotulo: "API oficial" },
  { valor: "sem_retorno", rotulo: "Sem retorno" },
];

const POR_PAGINA = 12;

type Props = {
  turmas: TurmaResumoAtendimentos[];
  bimestre: string;
  tiposAtendimento?: string[];
  mensagemTemplates?: MensagemTemplate[];
  turmaCodigoInicial?: string | null;
  onAbrirFichaAluno: (turmaCodigo: string, alunoNome: string) => void;
  onAtivarEnvioAutomatico: () => void;
};

export function TelaAtendimentos({
  turmas,
  bimestre,
  tiposAtendimento,
  mensagemTemplates,
  turmaCodigoInicial,
  onAbrirFichaAluno,
  onAtivarEnvioAutomatico,
}: Props) {
  const turmasOrdenadas = useMemo(
    () => [...turmas].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR")),
    [turmas],
  );
  const [turmaCodigo, setTurmaCodigo] = useState<string>(
    turmaCodigoInicial ?? turmasOrdenadas[0]?.codigo ?? "",
  );
  const turma = turmasOrdenadas.find((t) => t.codigo === turmaCodigo) ?? turmasOrdenadas[0];

  const [detalhe, setDetalhe] = useState<TurmaDetalheAtendimentos | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"lista" | "por-aluno" | "lote">("lista");
  const [densidade, setDensidade] = useState<"tabela" | "cartoes">("tabela");

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [filtroTag, setFiltroTag] = useState("todas");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todos");
  const [soPendentes, setSoPendentes] = useState(false);
  const [pilula, setPilula] = useState<"todos" | "pendente" | "sem_retorno" | string>("todos");
  const [pagina, setPagina] = useState(1);

  const [modalModo, setModalModo] = useState<ModoModalAtendimento | null>(null);
  const [compositorMatricula, setCompositorMatricula] = useState<string | null>(null);
  const [assistenteLote, setAssistenteLote] = useState(false);
  const [disparos, setDisparos] = useState<DisparoLoteRegistro[]>([]);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [varsPainel, setVarsPainel] = useState<{ freq: number | null; tarefas: string | null }>({ freq: null, tarefas: null });

  const tiposConfig = tiposAtendimento?.length ? tiposAtendimento : TIPOS_ATENDIMENTO_PADRAO;
  const templatesConfig = mensagemTemplates ?? [];

  const carregar = useCallback(() => {
    if (!turma) {
      setDetalhe(null);
      return;
    }
    setCarregando(true);
    setErro("");
    invokeApp<TurmaDetalheAtendimentos>("carregar_turma", { caminho: turma.caminho, bimestre })
      .then((resp) => setDetalhe(resp))
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false));
  }, [turma, bimestre]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setPagina(1);
  }, [turmaCodigo, busca, filtroTipo, filtroCanal, filtroTag, filtroPeriodo, soPendentes, pilula]);

  const linhas = useMemo<LinhaAtendimento[]>(
    () => (detalhe ? montarLinhas(detalhe, turma?.codigo ?? "") : []),
    [detalhe, turma?.codigo],
  );

  const alunoDoAberto = useMemo(() => {
    if (!abertoId || !detalhe) return null;
    for (const a of detalhe.alunos) {
      const at = (a.atendimentos ?? []).find((x) => x.id === abertoId);
      if (at) return { aluno: a, atendimento: at };
    }
    return null;
  }, [abertoId, detalhe]);

  const linhaAberta = useMemo(
    () => linhas.find((l) => l.atendimento.id === abertoId) ?? null,
    [linhas, abertoId],
  );

  // Se o atendimento aberto sumiu da lista (ex.: recarga após trocar de turma), fecha o painel.
  useEffect(() => {
    if (abertoId && detalhe && !alunoDoAberto) setAbertoId(null);
  }, [abertoId, detalhe, alunoDoAberto]);

  // Ao trocar de aba, fecha o painel/drawer da thread (que é só da aba "lista").
  useEffect(() => {
    if (aba !== "lista") setAbertoId(null);
  }, [aba]);

  useEffect(() => {
    if (aba !== "lote" || !turma) return;
    invokeApp<DisparoLoteRegistro[]>("carregar_disparos_lote", { caminho: turma.caminho })
      .then(setDisparos)
      .catch(() => setDisparos([]));
  }, [aba, turma?.caminho, assistenteLote]);

  // Resolve frequência / tarefas pendentes para o cabeçalho do painel.
  useEffect(() => {
    if (!alunoDoAberto || !turma) {
      setVarsPainel({ freq: null, tarefas: null });
      return;
    }
    const freq = alunoDoAberto.aluno.frequencia_percentual;
    setVarsPainel({ freq, tarefas: null });
    invokeApp<{ chave: string; valor: string; disponivel: boolean }[]>("resolver_variaveis_mensagem", {
      caminho: turma.caminho,
      matricula: alunoDoAberto.aluno.matricula,
      bimestre,
    })
      .then((vars) => {
        const tp = vars.find((v) => v.chave === "tarefas_pendentes");
        setVarsPainel({ freq, tarefas: tp?.disponivel ? tp.valor : null });
      })
      .catch(() => setVarsPainel({ freq, tarefas: null }));
  }, [alunoDoAberto, turma, bimestre]);

  const tagsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const l of linhas) for (const t of l.atendimento.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhas]);

  const followupsPendentes = useMemo(() => linhas.filter((l) => l.followupPendente).length, [linhas]);
  const semRetornoTotal = useMemo(() => linhas.filter((l) => l.semRetorno).length, [linhas]);
  const pilulasTipo = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const l of linhas) for (const t of l.atendimento.tipos) contagem.set(t, (contagem.get(t) ?? 0) + 1);
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [linhas]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const periodo = PERIODOS.find((p) => p.valor === filtroPeriodo);
    const limite = periodo?.dias != null ? Date.now() - periodo.dias * 86_400_000 : null;
    return linhas.filter((l) => {
      const at = l.atendimento;
      if (soPendentes && !l.followupPendente) return false;
      if (pilula === "pendente" && !l.followupPendente) return false;
      if (pilula === "sem_retorno" && !l.semRetorno) return false;
      if (pilula !== "todos" && pilula !== "pendente" && pilula !== "sem_retorno" && !at.tipos.includes(pilula)) return false;
      if (filtroTipo !== "todos" && !at.tipos.includes(filtroTipo)) return false;
      if (filtroTag !== "todas" && !at.tipos.includes(filtroTag) && !at.tags.includes(filtroTag)) return false;
      if (filtroCanal === "sem_retorno" && !l.semRetorno) return false;
      if (filtroCanal !== "todos" && filtroCanal !== "sem_retorno" && at.canal !== filtroCanal) return false;
      if (limite != null) {
        const t = Date.parse(at.data);
        if (!Number.isNaN(t) && t < limite) return false;
      }
      if (termo) {
        const alvo = `${l.alunoNome} ${at.descricao} ${at.tags.join(" ")} ${at.tipos.join(" ")}`.toLocaleLowerCase("pt-BR");
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [linhas, busca, filtroTipo, filtroCanal, filtroTag, filtroPeriodo, soPendentes, pilula]);

  const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const linhasPagina = linhasFiltradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const alunosOrdenados = useMemo(
    () =>
      (detalhe?.alunos ?? [])
        .filter((a) => a.ativo !== false)
        .sort((a, b) => (a.numero_chamada ?? 1e9) - (b.numero_chamada ?? 1e9) || a.nome.localeCompare(b.nome, "pt-BR"))
        .map((a) => ({ matricula: a.matricula, nome: a.nome, numeroChamada: a.numero_chamada })),
    [detalhe],
  );

  async function salvarAtendimento(matricula: string, input: AtendimentoAlunoInput) {
    if (!turma) throw new Error("Selecione uma turma.");
    const resp = await invokeApp<TurmaDetalheAtendimentos>("salvar_atendimento_aluno", {
      caminho: turma.caminho,
      matricula,
      input,
      bimestre,
    });
    setDetalhe(resp);
  }

  async function definirCombinado(matricula: string, atendimentoId: string, previsto: FollowupPrevisto | null) {
    if (!turma) throw new Error("Selecione uma turma.");
    const resp = await invokeApp<TurmaDetalheAtendimentos>("definir_followup_previsto", {
      caminho: turma.caminho,
      matricula,
      atendimentoId,
      previsto,
      bimestre,
    });
    setDetalhe(resp);
  }

  async function abrirAnexo(a: AtendimentoAnexo) {
    if (!a.caminho) return;
    try {
      await invokeApp("abrir_anexo_atendimento", { caminho: a.caminho });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  const totalAtd = turma?.total_atendimentos ?? 0;
  const pendentesTurma = turma?.followups_pendentes ?? 0;
  const subtitulo = turma
    ? `${totalAtd} ${totalAtd === 1 ? "atendimento" : "atendimentos"} na turma` +
      (pendentesTurma > 0 ? `, ${pendentesTurma} com follow-up pendente` : "")
    : "Nenhuma turma cadastrada";

  const larguraPainel = useMediaQuery("(min-width: 1280px)");
  const painelLado = densidade === "cartoes" && Boolean(linhaAberta) && larguraPainel;

  const compositorAluno = useMemo(
    () => (compositorMatricula ? detalhe?.alunos.find((a) => a.matricula === compositorMatricula) ?? null : null),
    [compositorMatricula, detalhe],
  );

  if (assistenteLote && turma) {
    return (
      <AssistenteLote
        turma={{ codigo: turma.codigo, caminho: turma.caminho }}
        bimestre={bimestre}
        templates={templatesConfig}
        onSalvarAtendimento={salvarAtendimento}
        onAtivarEnvioAutomatico={onAtivarEnvioAutomatico}
        onSair={() => { setAssistenteLote(false); carregar(); }}
        onConcluir={() => { setAssistenteLote(false); carregar(); }}
      />
    );
  }

  return (
    <div className="atd-tela">
      <header className="atd-header">
        <div className="atd-header-titulo">
          <h1>Atendimentos</h1>
          <p>Registros de contato e tratativa por aluno. {subtitulo}.</p>
        </div>
        <div className="atd-header-acoes">
          <label className="atd-turma-chip">
            <span>Turma</span>
            <select value={turmaCodigo} onChange={(e) => setTurmaCodigo(e.target.value)}>
              {turmasOrdenadas.map((t) => (
                <option key={t.codigo} value={t.codigo}>{t.codigo}</option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden />
          </label>
          <button type="button" className="atd-btn-secundario" onClick={() => setAssistenteLote(true)} disabled={!turma}>
            <MessageCircle size={16} /> Contatar famílias
          </button>
          <button type="button" className="atd-btn-primario" onClick={() => setModalModo({ tipo: "novo" })} disabled={!turma}>
            <Plus size={16} /> Novo atendimento
          </button>
        </div>
      </header>

      <nav className="atd-abas" role="tablist">
        <button role="tab" aria-selected={aba === "lista"} className={aba === "lista" ? "ativo" : ""} onClick={() => setAba("lista")}>
          Atendimentos
        </button>
        <button role="tab" aria-selected={aba === "por-aluno"} className={aba === "por-aluno" ? "ativo" : ""} onClick={() => setAba("por-aluno")}>
          Por aluno
        </button>
        <button role="tab" aria-selected={aba === "lote"} className={aba === "lote" ? "ativo" : ""} onClick={() => setAba("lote")} disabled>
          Disparos em lote
        </button>
      </nav>

      {aba === "lista" && (
        <>
          {densidade === "cartoes" ? (
            <div className="atd-pilulas">
              <Pilula ativa={pilula === "todos"} onClick={() => setPilula("todos")} rotulo="Todos" n={linhas.length} />
              <Pilula ativa={pilula === "pendente"} onClick={() => setPilula("pendente")} rotulo="Follow-up pendente" n={followupsPendentes} />
              <Pilula ativa={pilula === "sem_retorno"} onClick={() => setPilula("sem_retorno")} rotulo="Sem retorno" n={semRetornoTotal} />
              {pilulasTipo.map(([t, n]) => (
                <Pilula key={t} ativa={pilula === t} onClick={() => setPilula(t)} rotulo={t} n={n} />
              ))}
              <div className="atd-densidade">
                <button type="button" onClick={() => setDensidade("tabela")} aria-label="Ver em tabela"><Rows3 size={15} /></button>
                <button type="button" className="ativo" onClick={() => setDensidade("cartoes")} aria-label="Ver em cartões"><LayoutGrid size={15} /></button>
              </div>
            </div>
          ) : (
            <div className="atd-filtros">
              <label className="atd-busca">
                <Search size={16} aria-hidden />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por aluno, descrição ou tag…" />
              </label>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo">
                <option value="todos">Tipo · Todos</option>
                {tiposConfig.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)} aria-label="Filtrar por período">
                {PERIODOS.map((p) => <option key={p.valor} value={p.valor}>{p.valor === "todos" ? "Período · Todo" : p.rotulo}</option>)}
              </select>
              <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)} aria-label="Filtrar por canal">
                {CANAIS.map((c) => <option key={c.valor} value={c.valor}>{c.valor === "todos" ? "Canal · Todos" : c.rotulo}</option>)}
              </select>
              <select value={filtroTag} onChange={(e) => setFiltroTag(e.target.value)} aria-label="Filtrar por tag" disabled={!tagsDisponiveis.length}>
                <option value="todas">Tag · Todas</option>
                {tagsDisponiveis.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" className={`atd-toggle-pendente ${soPendentes ? "ativo" : ""}`} onClick={() => setSoPendentes((v) => !v)} aria-pressed={soPendentes}>
                Follow-up pendente<span>{followupsPendentes}</span>
              </button>
              <div className="atd-densidade">
                <button type="button" className="ativo" onClick={() => setDensidade("tabela")} aria-label="Ver em tabela"><Rows3 size={15} /></button>
                <button type="button" onClick={() => setDensidade("cartoes")} aria-label="Ver em cartões"><LayoutGrid size={15} /></button>
              </div>
            </div>
          )}

          {erro && <div className="notice error">{erro}</div>}

          {carregando ? (
            <div className="atd-carregando">Carregando atendimentos…</div>
          ) : linhas.length === 0 ? (
            <EstadoVazioTurma turma={turma?.codigo ?? null} temTurma={Boolean(turma)} onNovo={() => setModalModo({ tipo: "novo" })} onContatar={() => setAssistenteLote(true)} />
          ) : densidade === "cartoes" ? (
            <div className={`atd-master-detail ${painelLado ? "com-painel" : ""}`}>
              <div className="atd-cards">
                {linhasFiltradas.map((l) => (
                  <CardAtendimento key={l.atendimento.id} linha={l} selecionado={l.atendimento.id === abertoId} onClick={() => setAbertoId(l.atendimento.id)} />
                ))}
              </div>
              {painelLado && linhaAberta && (
                <PainelThread
                  linha={linhaAberta}
                  frequencia={varsPainel.freq}
                  tarefasPendentes={varsPainel.tarefas}
                  variante="painel"
                  onFollowup={() => setModalModo({ tipo: "followup", atendimento: linhaAberta.atendimento, matricula: linhaAberta.matricula, alunoNome: linhaAberta.alunoNome })}
                  onDesfecho={() => setModalModo({ tipo: "desfecho", atendimento: linhaAberta.atendimento, matricula: linhaAberta.matricula, alunoNome: linhaAberta.alunoNome })}
                  onEditar={() => setModalModo({ tipo: "editar", atendimento: linhaAberta.atendimento, matricula: linhaAberta.matricula, alunoNome: linhaAberta.alunoNome })}
                  onNovaMensagem={() => setCompositorMatricula(linhaAberta.matricula)}
                  onDefinirCombinado={(p) => definirCombinado(linhaAberta.matricula, linhaAberta.atendimento.id, p)}
                  onAbrirAnexo={abrirAnexo}
                  onAbrirFicha={() => linhaAberta && onAbrirFichaAluno(linhaAberta.turmaCodigo, linhaAberta.alunoNome)}
                  onFechar={() => setAbertoId(null)}
                />
              )}
            </div>
          ) : (
            <>
              <div className="atd-tabela" role="table">
                <div className="atd-tabela-cabecalho" role="row">
                  <span role="columnheader">Data</span>
                  <span role="columnheader">Aluno</span>
                  <span role="columnheader">Tipos</span>
                  <span role="columnheader">Atendido</span>
                  <span role="columnheader">Canal</span>
                  <span role="columnheader">Thread</span>
                  <span role="columnheader">Atualizado</span>
                  <span role="columnheader" aria-label="Abrir" />
                </div>
                {linhasPagina.map((l) => (
                  <LinhaTabela key={l.atendimento.id} linha={l} onAbrir={() => setAbertoId(l.atendimento.id)} />
                ))}
              </div>
              <div className="atd-rodape">
                <span>
                  Mostrando {linhasPagina.length} de {linhasFiltradas.length}
                  {linhasFiltradas.length !== linhas.length ? ` (de ${linhas.length})` : ""} atendimentos
                </span>
                {totalPaginas > 1 && (
                  <div className="atd-paginacao">
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                      <button key={n} type="button" className={n === paginaAtual ? "ativo" : ""} onClick={() => setPagina(n)}>{n}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {aba === "por-aluno" && turma && (
        carregando ? (
          <div className="atd-carregando">Carregando…</div>
        ) : detalhe ? (
          <AbaPorAluno
            alunos={detalhe.alunos}
            turmaCodigo={turma.codigo}
            caminhoTurma={turma.caminho}
            bimestre={bimestre}
            templates={templatesConfig}
            onNovaMensagem={(m) => setCompositorMatricula(m)}
            onAbrirFicha={(nome) => onAbrirFichaAluno(turma.codigo, nome)}
          />
        ) : null
      )}

      {aba === "lote" && turma && (
        <AbaDisparos
          disparos={disparos}
          turmaCodigo={turma.codigo}
          onRetomar={() => setAssistenteLote(true)}
          onVerRelatorio={() => setAssistenteLote(true)}
        />
      )}

      {/* Drawer: tabela sempre; cartões abaixo de 1280px (painelLado = false). */}
      {abertoId && linhaAberta && !painelLado && (
        <PainelThread
          linha={linhaAberta}
          frequencia={varsPainel.freq}
          tarefasPendentes={varsPainel.tarefas}
          variante="drawer"
          onFollowup={() => setModalModo({ tipo: "followup", atendimento: linhaAberta.atendimento, matricula: linhaAberta.matricula, alunoNome: linhaAberta.alunoNome })}
          onDesfecho={() => setModalModo({ tipo: "desfecho", atendimento: linhaAberta.atendimento, matricula: linhaAberta.matricula, alunoNome: linhaAberta.alunoNome })}
          onEditar={() => setModalModo({ tipo: "editar", atendimento: linhaAberta.atendimento, matricula: linhaAberta.matricula, alunoNome: linhaAberta.alunoNome })}
          onNovaMensagem={() => setCompositorMatricula(linhaAberta.matricula)}
          onDefinirCombinado={(p) => definirCombinado(linhaAberta.matricula, linhaAberta.atendimento.id, p)}
          onAbrirAnexo={abrirAnexo}
          onAbrirFicha={() => linhaAberta && onAbrirFichaAluno(linhaAberta.turmaCodigo, linhaAberta.alunoNome)}
          onFechar={() => setAbertoId(null)}
        />
      )}

      {modalModo && turma && (
        <ModalAtendimento
          modo={modalModo}
          turmaCodigo={turma.codigo}
          alunos={alunosOrdenados}
          tipos={tiposConfig}
          onFechar={() => setModalModo(null)}
          onSalvar={salvarAtendimento}
        />
      )}

      {compositorAluno && turma && (
        <CompositorMensagem
          aluno={{
            matricula: compositorAluno.matricula,
            nome: compositorAluno.nome,
            turmaCodigo: turma.codigo,
            frequencia: compositorAluno.frequencia_percentual,
          }}
          responsaveis={compositorAluno.responsaveis ?? []}
          caminhoTurma={turma.caminho}
          bimestre={bimestre}
          templates={templatesConfig}
          onFechar={() => setCompositorMatricula(null)}
          onSalvar={salvarAtendimento}
          onCadastrarResponsavel={() => onAbrirFichaAluno(turma.codigo, compositorAluno.nome)}
          onAtivarEnvioAutomatico={onAtivarEnvioAutomatico}
        />
      )}
    </div>
  );
}

function Pilula({ ativa, onClick, rotulo, n }: { ativa: boolean; onClick: () => void; rotulo: string; n: number }) {
  return (
    <button type="button" className={`atd-pilula ${ativa ? "ativa" : ""}`} onClick={onClick} aria-pressed={ativa}>
      {rotulo} <span>{n}</span>
    </button>
  );
}

function LinhaTabela({ linha, onAbrir }: { linha: LinhaAtendimento; onAbrir: () => void }) {
  const at = linha.atendimento;
  const selo = seloCanal(at.canal, Boolean(at.lote_id));
  return (
    <div className="atd-linha" role="row" onClick={onAbrir} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}>
      <span role="cell" className="atd-col-data">{dataCurta(at.data)}</span>
      <span role="cell" className="atd-col-aluno">
        <strong>{linha.alunoNome}</strong>
        <small>Mat. {linha.matricula} · {linha.turmaCodigo}</small>
      </span>
      <span role="cell" className="atd-col-tipos">
        {at.tipos.map((t) => (
          <span key={t} className={`atd-selo-tipo ${t === TIPO_CONTATO_FAMILIA ? "familia" : ""}`}>{t}</span>
        ))}
      </span>
      <span role="cell" className="atd-col-atendido">{linha.atendidoLabel}</span>
      <span role="cell"><span className={`atd-selo-canal ${selo.tom}`}>{selo.texto}</span></span>
      <span role="cell" className={`atd-col-thread ${linha.followupPendente ? "pendente" : ""}`}>
        {linha.followupPendente || linha.totalFollowups > 0 ? (
          <>
            {linha.followupPendente && <span className="atd-ponto-pendente" aria-hidden />}
            <MessageCircle size={13} aria-hidden />
            {linha.totalFollowups > 0 ? linha.totalFollowups : ""}
          </>
        ) : "—"}
      </span>
      <span role="cell" className="atd-col-atualizado">{tempoRelativo(at.atualizado_em)}</span>
      <span role="cell" className="atd-col-chevron"><ChevronRight size={16} aria-hidden /></span>
    </div>
  );
}

function CardAtendimento({ linha, selecionado, onClick }: { linha: LinhaAtendimento; selecionado: boolean; onClick: () => void }) {
  const at = linha.atendimento;
  const selo = seloCanal(at.canal, Boolean(at.lote_id));
  const resumoThread = linha.followupPendente
    ? `${linha.totalFollowups} follow-up${linha.totalFollowups === 1 ? "" : "s"} · 1 pendente`
    : linha.semRetorno
    ? "Sem retorno"
    : linha.totalFollowups > 0
    ? `${linha.totalFollowups} follow-up${linha.totalFollowups === 1 ? "" : "s"}`
    : null;
  return (
    <button type="button" className={`atd-card ${selecionado ? "sel" : ""}`} onClick={onClick}>
      <span className="atd-card-avatar">{iniciais(linha.alunoNome)}</span>
      <span className="atd-card-corpo">
        <span className="atd-card-linha1">
          <strong>{linha.alunoNome}</strong>
          <span className={`atd-selo-canal ${selo.tom}`}>{selo.texto}</span>
          <span className="atd-card-data">{dataCurta(at.data)}</span>
        </span>
        <span className="atd-card-desc">{at.descricao}</span>
        <span className="atd-card-linha3">
          {at.tipos.slice(0, 2).map((t) => (
            <span key={t} className={`atd-selo-tipo ${t === TIPO_CONTATO_FAMILIA ? "familia" : ""}`}>{t}</span>
          ))}
          {resumoThread && <span className={`atd-card-thread ${linha.followupPendente ? "pendente" : ""}`}>{resumoThread}</span>}
        </span>
      </span>
    </button>
  );
}

function EstadoVazioTurma({ turma, temTurma, onNovo, onContatar }: { turma: string | null; temTurma: boolean; onNovo: () => void; onContatar: () => void }) {
  return (
    <div className="atd-vazio">
      <span className="atd-vazio-icone"><MessageCircle size={26} aria-hidden /></span>
      <strong>{turma ? `Nenhum atendimento na ${turma}` : "Nenhuma turma cadastrada"}</strong>
      <p>
        {temTurma
          ? "Registre uma conversa que já aconteceu ou comece contatando as famílias que precisam de atenção."
          : "Crie uma turma em Turmas para começar a registrar atendimentos."}
      </p>
      {temTurma && (
        <div className="atd-vazio-acoes">
          <button type="button" className="atd-btn-primario" onClick={onNovo}>Novo atendimento</button>
          <button type="button" className="atd-btn-secundario" onClick={onContatar}>Contatar famílias</button>
        </div>
      )}
    </div>
  );
}
