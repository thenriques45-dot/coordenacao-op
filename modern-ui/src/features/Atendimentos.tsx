import { ChevronDown, ChevronRight, MessageCircle, Paperclip, Plus, Search, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";
import { montarLinhas, seloCanal } from "./atendimentos/dados";
import { dataCurta, tempoRelativo } from "./atendimentos/formato";
import type {
  AtendimentoAlunoInput,
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
  turmaCodigoInicial?: string | null;
  onAbrirFichaAluno: (turmaCodigo: string, alunoNome: string) => void;
};

export function TelaAtendimentos({
  turmas,
  bimestre,
  tiposAtendimento,
  turmaCodigoInicial,
  onAbrirFichaAluno,
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

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [filtroTag, setFiltroTag] = useState("todas");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todos");
  const [soPendentes, setSoPendentes] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [modalNovo, setModalNovo] = useState(false);

  const tiposConfig = tiposAtendimento?.length ? tiposAtendimento : TIPOS_ATENDIMENTO_PADRAO;

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
  }, [turmaCodigo, busca, filtroTipo, filtroCanal, filtroTag, filtroPeriodo, soPendentes]);

  const linhas = useMemo<LinhaAtendimento[]>(
    () => (detalhe ? montarLinhas(detalhe, turma?.codigo ?? "") : []),
    [detalhe, turma?.codigo],
  );

  const tagsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const l of linhas) for (const t of l.atendimento.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhas]);

  const followupsPendentes = useMemo(() => linhas.filter((l) => l.followupPendente).length, [linhas]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const periodo = PERIODOS.find((p) => p.valor === filtroPeriodo);
    const limite = periodo?.dias != null ? Date.now() - periodo.dias * 86_400_000 : null;
    return linhas.filter((l) => {
      const at = l.atendimento;
      if (soPendentes && !l.followupPendente) return false;
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
  }, [linhas, busca, filtroTipo, filtroCanal, filtroTag, filtroPeriodo, soPendentes]);

  const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const linhasPagina = linhasFiltradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  async function salvarNovoAtendimento(matricula: string, input: AtendimentoAlunoInput) {
    if (!turma) throw new Error("Selecione uma turma.");
    const resp = await invokeApp<TurmaDetalheAtendimentos>("salvar_atendimento_aluno", {
      caminho: turma.caminho,
      matricula,
      input,
      bimestre,
    });
    setDetalhe(resp);
  }

  const totalAtd = turma?.total_atendimentos ?? 0;
  const pendentesTurma = turma?.followups_pendentes ?? 0;
  const subtitulo = turma
    ? `${totalAtd} ${totalAtd === 1 ? "atendimento" : "atendimentos"} na turma` +
      (pendentesTurma > 0 ? `, ${pendentesTurma} com follow-up pendente` : "")
    : "Nenhuma turma cadastrada";

  const alunosOrdenados = useMemo(
    () =>
      (detalhe?.alunos ?? [])
        .filter((a) => a.ativo !== false)
        .sort((a, b) => (a.numero_chamada ?? 1e9) - (b.numero_chamada ?? 1e9) || a.nome.localeCompare(b.nome, "pt-BR")),
    [detalhe],
  );

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
          <button type="button" className="atd-btn-secundario" disabled title="Disponível em breve">
            <MessageCircle size={16} /> Contatar famílias
          </button>
          <button
            type="button"
            className="atd-btn-primario"
            onClick={() => setModalNovo(true)}
            disabled={!turma}
          >
            <Plus size={16} /> Novo atendimento
          </button>
        </div>
      </header>

      <nav className="atd-abas" role="tablist">
        <button role="tab" aria-selected={aba === "lista"} className={aba === "lista" ? "ativo" : ""} onClick={() => setAba("lista")}>
          Atendimentos
        </button>
        <button role="tab" aria-selected={aba === "por-aluno"} className={aba === "por-aluno" ? "ativo" : ""} onClick={() => setAba("por-aluno")} disabled>
          Por aluno
        </button>
        <button role="tab" aria-selected={aba === "lote"} className={aba === "lote" ? "ativo" : ""} onClick={() => setAba("lote")} disabled>
          Disparos em lote
        </button>
      </nav>

      {aba === "lista" && (
        <>
          <div className="atd-filtros">
            <label className="atd-busca">
              <Search size={16} aria-hidden />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por aluno, descrição ou tag…"
              />
            </label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Filtrar por tipo">
              <option value="todos">Tipo · Todos</option>
              {tiposConfig.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)} aria-label="Filtrar por período">
              {PERIODOS.map((p) => (
                <option key={p.valor} value={p.valor}>{p.valor === "todos" ? "Período · Todo" : p.rotulo}</option>
              ))}
            </select>
            <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)} aria-label="Filtrar por canal">
              {CANAIS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.valor === "todos" ? "Canal · Todos" : c.rotulo}</option>
              ))}
            </select>
            <select value={filtroTag} onChange={(e) => setFiltroTag(e.target.value)} aria-label="Filtrar por tag" disabled={!tagsDisponiveis.length}>
              <option value="todas">Tag · Todas</option>
              {tagsDisponiveis.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              type="button"
              className={`atd-toggle-pendente ${soPendentes ? "ativo" : ""}`}
              onClick={() => setSoPendentes((v) => !v)}
              aria-pressed={soPendentes}
            >
              Follow-up pendente
              <span>{followupsPendentes}</span>
            </button>
          </div>

          {erro && <div className="notice error">{erro}</div>}

          {carregando ? (
            <div className="atd-carregando">Carregando atendimentos…</div>
          ) : linhas.length === 0 ? (
            <EstadoVazioTurma turma={turma?.codigo ?? null} temTurma={Boolean(turma)} onNovo={() => setModalNovo(true)} />
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
                  <LinhaTabela
                    key={l.atendimento.id}
                    linha={l}
                    onAbrir={() => onAbrirFichaAluno(l.turmaCodigo, l.alunoNome)}
                  />
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
                      <button
                        key={n}
                        type="button"
                        className={n === paginaAtual ? "ativo" : ""}
                        onClick={() => setPagina(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {aba !== "lista" && (
        <div className="atd-carregando">Esta aba entra em uma próxima etapa da implantação.</div>
      )}

      {modalNovo && turma && (
        <ModalNovoAtendimento
          turmaCodigo={turma.codigo}
          alunos={alunosOrdenados.map((a) => ({ matricula: a.matricula, nome: a.nome, numeroChamada: a.numero_chamada }))}
          tipos={tiposConfig}
          onFechar={() => setModalNovo(false)}
          onSalvar={salvarNovoAtendimento}
        />
      )}
    </div>
  );
}

function LinhaTabela({ linha, onAbrir }: { linha: LinhaAtendimento; onAbrir: () => void }) {
  const at = linha.atendimento;
  const selo = seloCanal(at.canal, Boolean(at.lote_id));
  return (
    <div className="atd-linha" role="row" onClick={onAbrir} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}>
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
      <span role="cell">
        <span className={`atd-selo-canal ${selo.tom}`}>{selo.texto}</span>
      </span>
      <span role="cell" className={`atd-col-thread ${linha.followupPendente ? "pendente" : ""}`}>
        {linha.followupPendente || linha.totalFollowups > 0 ? (
          <>
            <MessageCircle size={13} aria-hidden />
            {linha.totalFollowups > 0 ? linha.totalFollowups : ""}
            {linha.followupPendente ? " •" : ""}
          </>
        ) : (
          "—"
        )}
      </span>
      <span role="cell" className="atd-col-atualizado">{tempoRelativo(at.atualizado_em)}</span>
      <span role="cell" className="atd-col-chevron"><ChevronRight size={16} aria-hidden /></span>
    </div>
  );
}

function EstadoVazioTurma({ turma, temTurma, onNovo }: { turma: string | null; temTurma: boolean; onNovo: () => void }) {
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
          <button type="button" className="atd-btn-secundario" disabled title="Disponível em breve">Contatar famílias</button>
        </div>
      )}
    </div>
  );
}

type AlunoOpcao = { matricula: string; nome: string; numeroChamada: number | null };

function ModalNovoAtendimento({
  turmaCodigo,
  alunos,
  tipos,
  onFechar,
  onSalvar,
}: {
  turmaCodigo: string;
  alunos: AlunoOpcao[];
  tipos: string[];
  onFechar: () => void;
  onSalvar: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
}) {
  const [matricula, setMatricula] = useState(alunos[0]?.matricula ?? "");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [atendido, setAtendido] = useState<"aluno" | "responsavel" | "outro">("aluno");
  const [atendidoNome, setAtendidoNome] = useState("");
  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onFechar]);

  function alternarTipo(t: string) {
    setTiposSel((atual) => (atual.includes(t) ? atual.filter((x) => x !== t) : [...atual, t]));
  }

  function adicionarTag(valor: string) {
    const limpo = valor.trim().replace(/,$/, "").trim();
    if (limpo && !tags.includes(limpo)) setTags((t) => [...t, limpo]);
    setTagInput("");
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!matricula) return setErro("Selecione o aluno.");
    if (!data) return setErro("Informe a data.");
    if (!tiposSel.length) return setErro("Selecione ao menos um tipo.");
    if (!descricao.trim()) return setErro("Descreva o atendimento.");
    if (atendido !== "aluno" && !atendidoNome.trim()) return setErro("Informe o nome de quem foi atendido.");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar(matricula, {
        data,
        tipos: tiposSel,
        atendido,
        atendido_nome: atendido === "aluno" ? undefined : atendidoNome.trim(),
        tags,
        descricao: descricao.trim(),
        anexos: [],
        canal: "manual",
      });
      onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setSalvando(false);
    }
  }

  const alunoSel = alunos.find((a) => a.matricula === matricula);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onFechar}>
      <form className="atd-modal" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <div className="atd-modal-titulo">
          <div>
            <h2>Novo atendimento</h2>
            <p>{alunoSel ? `${alunoSel.nome} · Mat. ${alunoSel.matricula} · ${turmaCodigo}` : turmaCodigo}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
        </div>

        <div className="atd-modal-corpo">
          {erro && <div className="notice error">{erro}</div>}

          <div className="atd-modal-grade">
            <label>
              <span>Aluno</span>
              <select value={matricula} onChange={(e) => setMatricula(e.target.value)}>
                {alunos.map((a) => (
                  <option key={a.matricula} value={a.matricula}>
                    {a.numeroChamada ? `${a.numeroChamada}. ` : ""}{a.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
          </div>

          <fieldset className="atd-segmentado">
            <legend>Quem foi atendido</legend>
            <div>
              {(["aluno", "responsavel", "outro"] as const).map((op) => (
                <button
                  key={op}
                  type="button"
                  className={atendido === op ? "ativo" : ""}
                  onClick={() => setAtendido(op)}
                >
                  {op === "aluno" ? "O próprio aluno" : op === "responsavel" ? "Responsável" : "Outro"}
                </button>
              ))}
            </div>
            {atendido !== "aluno" && (
              <input
                className="atd-atendido-nome"
                value={atendidoNome}
                onChange={(e) => setAtendidoNome(e.target.value)}
                placeholder={atendido === "responsavel" ? "Nome do responsável" : "Quem? (ex.: professora, conselho tutelar)"}
              />
            )}
          </fieldset>

          <div className="atd-campo">
            <div className="atd-campo-rotulo">
              <span>Tipos</span>
              <small>lista configurável na turma · pode marcar vários</small>
            </div>
            <div className="atd-chips">
              {tipos.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`atd-chip ${tiposSel.includes(t) ? "ativo" : ""}`}
                  onClick={() => alternarTipo(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <label className="atd-campo">
            <span className="atd-campo-rotulo">Descrição</span>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              placeholder="O que foi conversado, o que ficou combinado…"
            />
          </label>

          <div className="atd-campo">
            <span className="atd-campo-rotulo">Tags <small>Enter ou vírgula para criar</small></span>
            <div className="atd-tags-campo">
              {tags.map((t) => (
                <span key={t} className="atd-tag">
                  {t}
                  <button type="button" onClick={() => setTags((atual) => atual.filter((x) => x !== t))} aria-label={`Remover ${t}`}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    adicionarTag(tagInput);
                  }
                }}
                onBlur={() => tagInput.trim() && adicionarTag(tagInput)}
                placeholder={tags.length ? "" : "adicionar…"}
              />
            </div>
          </div>

          <p className="atd-modal-nota">
            <Paperclip size={13} aria-hidden /> Anexos e follow-ups podem ser adicionados depois, na thread do atendimento.
          </p>
        </div>

        <div className="atd-modal-acoes">
          <button type="button" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="atd-btn-primario" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar atendimento"}
          </button>
        </div>
      </form>
    </div>
  );
}
