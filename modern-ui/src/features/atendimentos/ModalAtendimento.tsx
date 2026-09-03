import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { Paperclip, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { invokeApp } from "../appBridge";
import type { AtendimentoAluno, AtendimentoAlunoInput, AtendimentoAnexo } from "./tipos";

export type AlunoOpcao = { matricula: string; nome: string; numeroChamada: number | null };

export type ModoModalAtendimento =
  | { tipo: "novo" }
  | { tipo: "editar"; atendimento: AtendimentoAluno; matricula: string; alunoNome: string }
  | { tipo: "followup"; atendimento: AtendimentoAluno; matricula: string; alunoNome: string }
  | { tipo: "desfecho"; atendimento: AtendimentoAluno; matricula: string; alunoNome: string };

const TIPOS_PADRAO = ["Disciplinar", "Dúvidas", "Pedagógico", "Financeiro", "Educação especial"];

export function ModalAtendimento({
  modo,
  turmaCodigo,
  alunos,
  tipos,
  onFechar,
  onSalvar,
}: {
  modo: ModoModalAtendimento;
  turmaCodigo: string;
  alunos: AlunoOpcao[];
  tipos: string[];
  onFechar: () => void;
  onSalvar: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
}) {
  const editando = modo.tipo === "editar";
  const registro = modo.tipo === "editar" ? modo.atendimento : null;
  const tiposConfig = tipos.length ? tipos : TIPOS_PADRAO;
  const ehThread = modo.tipo === "followup" || modo.tipo === "desfecho";

  const [matricula, setMatricula] = useState(
    modo.tipo === "novo" ? alunos[0]?.matricula ?? "" : modo.matricula,
  );
  const [data, setData] = useState(registro?.data ?? new Date().toISOString().slice(0, 10));
  const [atendido, setAtendido] = useState<"aluno" | "responsavel" | "outro">(
    (registro?.atendido as "aluno" | "responsavel" | "outro") ?? (ehThread ? "responsavel" : "aluno"),
  );
  const [atendidoNome, setAtendidoNome] = useState(registro?.atendido_nome ?? "");
  const [tiposSel, setTiposSel] = useState<string[]>(
    registro?.tipos ?? (modo.tipo !== "novo" ? modo.atendimento.tipos : []),
  );
  const [descricao, setDescricao] = useState(editando ? registro?.descricao ?? "" : "");
  const [tags, setTags] = useState<string[]>(registro?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [anexos, setAnexos] = useState<AtendimentoAnexo[]>(registro?.anexos ?? []);
  const [aba, setAba] = useState<"detalhes" | "anexos">("detalhes");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onFechar]);

  const titulo =
    modo.tipo === "novo" ? "Novo atendimento"
    : modo.tipo === "editar" ? "Editar atendimento"
    : modo.tipo === "followup" ? "Registrar follow-up"
    : "Registrar desfecho";
  const rotuloSalvar =
    modo.tipo === "desfecho" ? "Registrar desfecho"
    : modo.tipo === "followup" ? "Salvar follow-up"
    : "Salvar atendimento";
  const alunoNome = modo.tipo === "novo" ? alunos.find((a) => a.matricula === matricula)?.nome : modo.alunoNome;

  function alternarTipo(t: string) {
    setTiposSel((atual) => (atual.includes(t) ? atual.filter((x) => x !== t) : [...atual, t]));
  }

  function adicionarTag(valor: string) {
    const limpo = valor.trim().replace(/,$/, "").trim();
    if (limpo && !tags.includes(limpo)) setTags((t) => [...t, limpo]);
    setTagInput("");
  }

  async function anexar() {
    setErro("");
    try {
      const sel = await abrirDialogoArquivo({ multiple: true, title: "Selecionar anexos do atendimento" });
      const caminhos = Array.isArray(sel) ? sel : sel ? [sel] : [];
      if (!caminhos.length) return;
      const novos = await Promise.all(
        caminhos.map((c) => invokeApp<AtendimentoAnexo>("preparar_anexo_atendimento", { caminho: c })),
      );
      setAnexos((atuais) => [...atuais, ...novos]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!matricula) return setErro("Selecione o aluno.");
    if (!data) return setErro("Informe a data.");
    if (modo.tipo === "novo" && !tiposSel.length) return setErro("Selecione ao menos um tipo.");
    if (!descricao.trim()) return setErro("Descreva o atendimento.");
    if (atendido !== "aluno" && !atendidoNome.trim()) return setErro("Informe o nome de quem foi atendido.");
    setSalvando(true);
    setErro("");
    const base: AtendimentoAlunoInput = {
      data,
      tipos: tiposSel.length ? tiposSel : (modo.tipo !== "novo" ? modo.atendimento.tipos : []),
      atendido,
      atendido_nome: atendido === "aluno" ? undefined : atendidoNome.trim(),
      tags,
      descricao: descricao.trim(),
      anexos,
      canal: "manual",
    };
    if (modo.tipo === "editar") base.id = modo.atendimento.id;
    if (modo.tipo === "followup" || modo.tipo === "desfecho") base.parent_id = modo.atendimento.id;
    if (modo.tipo === "desfecho") base.followup_previsto = null;
    try {
      await onSalvar(matricula, base);
      onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onFechar}>
      <form className="atd-modal" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <div className="atd-modal-titulo">
          <div>
            <h2>{titulo}</h2>
            <p>{alunoNome ? `${alunoNome} · ${turmaCodigo}` : turmaCodigo}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
        </div>

        {!ehThread && (
          <div className="atd-modal-abas">
            <button type="button" className={aba === "detalhes" ? "ativo" : ""} onClick={() => setAba("detalhes")}>Detalhes</button>
            <button type="button" className={aba === "anexos" ? "ativo" : ""} onClick={() => setAba("anexos")}>
              Anexos {anexos.length > 0 && <span>{anexos.length}</span>}
            </button>
          </div>
        )}

        <div className="atd-modal-corpo">
          {erro && <div className="notice error">{erro}</div>}

          {aba === "detalhes" && (
            <>
              {modo.tipo === "novo" ? (
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
              ) : (
                <label className="atd-modal-data-so">
                  <span>Data</span>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </label>
              )}

              <fieldset className="atd-segmentado">
                <legend>Quem foi atendido</legend>
                <div>
                  {(["aluno", "responsavel", "outro"] as const).map((op) => (
                    <button key={op} type="button" className={atendido === op ? "ativo" : ""} onClick={() => setAtendido(op)}>
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

              {modo.tipo !== "desfecho" && (
                <div className="atd-campo">
                  <div className="atd-campo-rotulo">
                    <span>Tipos</span>
                    <small>{ehThread ? "herda do atendimento se nada for marcado" : "lista configurável na turma · pode marcar vários"}</small>
                  </div>
                  <div className="atd-chips">
                    {tiposConfig.map((t) => (
                      <button key={t} type="button" className={`atd-chip ${tiposSel.includes(t) ? "ativo" : ""}`} onClick={() => alternarTipo(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="atd-campo">
                <span className="atd-campo-rotulo">
                  {modo.tipo === "desfecho" ? "O que foi o desfecho?" : "Descrição"}
                </span>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={5}
                  placeholder={modo.tipo === "desfecho" ? "O que aconteceu com o que ficou combinado…" : "O que foi conversado, o que ficou combinado…"}
                  autoFocus={ehThread}
                />
              </label>

              {modo.tipo !== "desfecho" && (
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
              )}

              {!ehThread && (
                <p className="atd-modal-nota">
                  <Paperclip size={13} aria-hidden /> Follow-ups e o retorno combinado são adicionados depois, na thread.
                </p>
              )}
            </>
          )}

          {aba === "anexos" && (
            <div className="atd-campo">
              <button type="button" className="atd-anexar" onClick={anexar}>
                <Paperclip size={15} aria-hidden /> Anexar arquivo
              </button>
              {anexos.length > 0 && (
                <ul className="atd-anexos-lista">
                  {anexos.map((a) => (
                    <li key={a.id}>
                      <span>{a.nome}</span>
                      <button type="button" onClick={() => setAnexos((atuais) => atuais.filter((x) => x.id !== a.id))} aria-label={`Remover ${a.nome}`}>
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="atd-modal-acoes">
          <button type="button" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="atd-btn-primario" disabled={salvando}>
            {salvando ? "Salvando…" : rotuloSalvar}
          </button>
        </div>
      </form>
    </div>
  );
}
