import { MessageCircle, Paperclip, Phone, Search, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invokeApp } from "../appBridge";
import type { MensagemTemplate } from "../SettingsPage";
import { ehContatoFamilia, ehSemRetorno, eventosFamilia, separarAssinaturaRastreio, type EventoFamilia, type MeioContato } from "./dados";
import { dataPorExtensoCurta, iniciais, tempoRelativo } from "./formato";
import { formatarTelefoneBR, rotuloParentesco } from "./mensagemFamilia";
import type { AlunoAtendimentos } from "./tipos";

const FILTROS: { valor: "tudo" | "mensagens" | "presencial"; rotulo: string }[] = [
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "mensagens", rotulo: "Só mensagens" },
  { valor: "presencial", rotulo: "Só presencial" },
];

function IconeMeio({ meio }: { meio: MeioContato }) {
  if (meio === "whatsapp") return <MessageCircle size={13} aria-hidden />;
  if (meio === "telefone") return <Phone size={13} aria-hidden />;
  return <Users size={13} aria-hidden />;
}

export function AbaPorAluno({
  alunos,
  turmaCodigo,
  caminhoTurma,
  bimestre,
  templates,
  onNovaMensagem,
  onAbrirFicha,
}: {
  alunos: AlunoAtendimentos[];
  turmaCodigo: string;
  caminhoTurma: string;
  bimestre: string;
  templates: MensagemTemplate[];
  onNovaMensagem: (matricula: string) => void;
  onAbrirFicha: (alunoNome: string) => void;
}) {
  const tituloModelo = useMemo(() => {
    const mapa = new Map(templates.map((t) => [t.id, t.titulo]));
    return (id: string | null | undefined) => (id ? mapa.get(id) ?? null : null);
  }, [templates]);

  const resumo = useMemo(() => {
    return alunos
      .filter((a) => a.ativo !== false)
      .map((a) => {
        const familia = (a.atendimentos ?? []).filter(ehContatoFamilia);
        const eventos = eventosFamilia(a.atendimentos ?? [], tituloModelo);
        const semTelefone = !(a.responsaveis ?? []).some((r) => r.telefone.replace(/\D/g, ""));
        const semRetorno = familia.some(ehSemRetorno);
        const ultimo = eventos[0];
        const estado = semTelefone
          ? "sem telefone"
          : eventos.length === 0
          ? "sem contato"
          : semRetorno
          ? "sem retorno"
          : `último ${tempoRelativo(ultimo.criadoEm ?? ultimo.data)}`;
        return {
          matricula: a.matricula,
          nome: a.nome,
          numeroChamada: a.numero_chamada,
          nContatos: eventos.filter((e) => !e.ehFollowup).length,
          estado,
          alerta: semTelefone || semRetorno,
        };
      })
      .sort((x, y) => y.nContatos - x.nContatos || x.nome.localeCompare(y.nome, "pt-BR"));
  }, [alunos, tituloModelo]);

  const [busca, setBusca] = useState("");
  const [selMatricula, setSelMatricula] = useState<string | null>(resumo[0]?.matricula ?? null);
  const [filtro, setFiltro] = useState<"tudo" | "mensagens" | "presencial">("tudo");
  const [vars, setVars] = useState<{ freq: number | null; tarefas: string | null }>({ freq: null, tarefas: null });

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return resumo;
    return resumo.filter((r) => r.nome.toLocaleLowerCase("pt-BR").includes(termo) || r.matricula.includes(termo));
  }, [resumo, busca]);

  useEffect(() => {
    if (selMatricula && !resumo.some((r) => r.matricula === selMatricula)) setSelMatricula(resumo[0]?.matricula ?? null);
  }, [resumo, selMatricula]);

  const aluno = alunos.find((a) => a.matricula === selMatricula) ?? null;

  useEffect(() => {
    if (!aluno || !caminhoTurma) {
      setVars({ freq: null, tarefas: null });
      return;
    }
    const freq = aluno.frequencia_percentual;
    setVars({ freq, tarefas: null });
    invokeApp<{ chave: string; valor: string; disponivel: boolean }[]>("resolver_variaveis_mensagem", {
      caminho: caminhoTurma,
      matricula: aluno.matricula,
      bimestre,
    })
      .then((vs) => {
        const tp = vs.find((v) => v.chave === "tarefas_pendentes");
        setVars({ freq, tarefas: tp?.disponivel ? tp.valor : null });
      })
      .catch(() => setVars({ freq, tarefas: null }));
  }, [aluno, caminhoTurma, bimestre]);

  const eventos = useMemo<EventoFamilia[]>(
    () => (aluno ? eventosFamilia(aluno.atendimentos ?? [], tituloModelo) : []),
    [aluno, tituloModelo],
  );
  const eventosVisiveis = eventos.filter((e) => {
    if (filtro === "mensagens") return e.meio === "whatsapp" || e.meio === "telefone";
    if (filtro === "presencial") return e.meio === "presencial";
    return true;
  });

  if (!resumo.length) {
    return <div className="atd-carregando">Nenhum aluno ativo nesta turma.</div>;
  }

  return (
    <div className="atd-familia">
      <aside className="atd-familia-lista">
        <label className="atd-busca">
          <Search size={16} aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno…" />
        </label>
        <div className="atd-familia-alunos">
          {listaFiltrada.map((r) => (
            <button
              key={r.matricula}
              type="button"
              className={`atd-familia-aluno ${r.matricula === selMatricula ? "sel" : ""}`}
              onClick={() => setSelMatricula(r.matricula)}
            >
              <span className="atd-familia-avatar">{iniciais(r.nome)}</span>
              <span className="atd-familia-aluno-info">
                <strong>{r.nome}</strong>
                <small className={r.alerta ? "alerta" : ""}>
                  {r.nContatos} {r.nContatos === 1 ? "contato" : "contatos"} · {r.estado}
                </small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="atd-familia-painel">
        {aluno ? (
          <>
            <div className="atd-familia-cabecalho">
              <div>
                <strong>{aluno.nome}</strong>
                <div className="atd-familia-sub">
                  Mat. {aluno.matricula} · {turmaCodigo}
                  {vars.freq != null && ` · Frequência ${Math.round(vars.freq)}%`}
                  {vars.tarefas && ` · ${vars.tarefas} tarefas pendentes`}
                </div>
                <div className="atd-familia-responsaveis">
                  {(aluno.responsaveis ?? []).length === 0 && (
                    <span className="atd-familia-sem-resp">Sem responsável cadastrado</span>
                  )}
                  {(aluno.responsaveis ?? []).map((r, i) => (
                    <div key={i} className="atd-familia-resp-card">
                      <span className="atd-familia-resp-avatar">{iniciais(r.nome || "?")}</span>
                      <span>
                        <strong>{r.nome || "(sem nome)"}</strong>
                        <small>
                          {rotuloParentesco(r).replace(/^./, (c) => c.toUpperCase())}
                          {r.telefone.replace(/\D/g, "") ? ` · ${formatarTelefoneBR(r.telefone)}` : " · sem telefone"}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="atd-familia-acoes">
                <button type="button" className="atd-btn-primario" onClick={() => onNovaMensagem(aluno.matricula)}>
                  <MessageCircle size={16} aria-hidden /> Nova mensagem
                </button>
                <button type="button" className="atd-btn-secundario" onClick={() => onAbrirFicha(aluno.nome)}>
                  <UserRound size={15} aria-hidden /> Abrir ficha do aluno
                </button>
              </div>
            </div>

            <div className="atd-familia-historico">
              <div className="atd-familia-hist-topo">
                <strong>Histórico de contato com a família</strong>
                <div className="atd-familia-filtros">
                  {FILTROS.map((f) => (
                    <button key={f.valor} type="button" className={filtro === f.valor ? "ativo" : ""} onClick={() => setFiltro(f.valor)}>
                      {f.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              {eventosVisiveis.length === 0 ? (
                <p className="atd-familia-vazio">
                  {eventos.length === 0 ? "Nenhum contato com a família registrado." : "Nenhum contato neste filtro."}
                </p>
              ) : (
                <div className="atd-familia-timeline">
                  {eventosVisiveis.map((e) => {
                    const { corpo, assinatura } = separarAssinaturaRastreio(e.descricao);
                    return (
                      <div key={e.id} className="atd-familia-evento">
                        <span className="atd-familia-data">{dataPorExtensoCurta(e.data)}</span>
                        <span className={`atd-familia-marcador ${e.meio}`}><IconeMeio meio={e.meio} /></span>
                        <div className="atd-familia-conteudo">
                          <div className="atd-familia-evento-titulo">
                            <strong>{e.titulo}</strong>
                            {!e.ehFollowup && (
                              <span className={`atd-selo-canal ${e.canal === "wa_me" ? (e.temLote ? "wa_me_lote" : "wa_me") : e.canal === "api" ? "api" : "manual"}`}>
                                {e.canal === "wa_me" ? (e.temLote ? "wa.me · lote" : "wa.me") : e.canal === "api" ? "API oficial" : "Manual"}
                              </span>
                            )}
                            {e.alvo && <span className="atd-familia-alvo">→ {e.alvo}</span>}
                          </div>
                          {corpo && <p>{corpo}</p>}
                          {assinatura && <div className="atd-thread-assinatura">{assinatura}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="atd-carregando">Selecione um aluno.</div>
        )}
      </div>
    </div>
  );
}
