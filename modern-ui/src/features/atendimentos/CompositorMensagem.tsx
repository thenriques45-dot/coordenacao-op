import { Check, Copy, Info, MessageCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invokeApp } from "../appBridge";
import type { MensagemTemplate } from "../SettingsPage";
import {
  apenasDigitos,
  assinaturaRastreio,
  formatarTelefoneBR,
  montarSegmentosMensagem,
  removerTrechoDaVariavel,
  rotuloParentesco,
  rotuloVariavel,
  telefoneParaWhatsapp,
  textoDeSegmentos,
  variaveisNaoResolvidas,
  type VariavelMensagem,
} from "./mensagemFamilia";
import type { AtendimentoAlunoInput, ResponsavelAluno } from "./tipos";

const TIPO_CONTATO_FAMILIA = "Contato com a família";

type AlunoCompositor = {
  matricula: string;
  nome: string;
  turmaCodigo: string;
  frequencia: number | null;
};

export function CompositorMensagem({
  aluno,
  responsaveis,
  caminhoTurma,
  bimestre,
  templates,
  onFechar,
  onSalvar,
  onCadastrarResponsavel,
  onAtivarEnvioAutomatico,
}: {
  aluno: AlunoCompositor;
  responsaveis: ResponsavelAluno[];
  caminhoTurma: string;
  bimestre: string;
  templates: MensagemTemplate[];
  onFechar: () => void;
  onSalvar: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
  onCadastrarResponsavel?: () => void;
  onAtivarEnvioAutomatico?: () => void;
}) {
  const comTelefone = responsaveis.filter((r) => apenasDigitos(r.telefone));
  const [destIndice, setDestIndice] = useState(() => {
    const i = responsaveis.findIndex((r) => apenasDigitos(r.telefone));
    return i >= 0 ? i : 0;
  });
  const destinatario = responsaveis[destIndice];

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const [corpo, setCorpo] = useState(templates[0]?.corpo ?? "");
  const [variaveis, setVariaveis] = useState<VariavelMensagem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [manuais, setManuais] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onFechar]);

  useEffect(() => {
    if (!caminhoTurma || !aluno.matricula) return;
    setCarregando(true);
    invokeApp<VariavelMensagem[]>("resolver_variaveis_mensagem", {
      caminho: caminhoTurma,
      matricula: aluno.matricula,
      bimestre,
    })
      .then(setVariaveis)
      .catch(() => setVariaveis([]))
      .finally(() => setCarregando(false));
  }, [caminhoTurma, aluno.matricula, bimestre]);

  const extras = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {
      responsavel: (destinatario?.nome ?? "").trim() || "responsável",
    };
    for (const [k, v] of Object.entries(manuais)) if (v.trim()) base[k] = v.trim();
    return base;
  }, [destinatario, manuais]);

  const segmentos = useMemo(() => montarSegmentosMensagem(corpo, variaveis, extras), [corpo, variaveis, extras]);
  const texto = textoDeSegmentos(segmentos);
  const pendentes = variaveisNaoResolvidas(segmentos);

  // Chaves de variável que o modelo usa (para a grade do passo 3), sem repetir.
  const chavesModelo = useMemo(() => {
    const set = new Set<string>();
    for (const s of segmentos) if (s.tipo === "var") set.add(s.chave);
    return [...set];
  }, [segmentos]);

  function trocarTemplate(id: string) {
    setTemplateId(id);
    setCorpo(templates.find((t) => t.id === id)?.corpo ?? "");
    setManuais({});
  }

  function valorResolvido(chave: string): string | null {
    if (extras[chave]) return extras[chave];
    const v = variaveis.find((x) => x.chave === chave);
    return v?.disponivel ? v.valor : null;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      setErro("Não foi possível copiar o texto.");
    }
  }

  async function abrirERegistrar() {
    setErro("");
    if (!destinatario || !apenasDigitos(destinatario.telefone)) {
      setErro("O responsável selecionado não tem telefone cadastrado.");
      return;
    }
    if (!texto.trim()) {
      setErro("Escreva a mensagem antes de enviar.");
      return;
    }
    if (pendentes.length && !window.confirm(
      `A mensagem ainda tem variável sem preenchimento (${pendentes.map((p) => p.rotulo).join(", ")}). Enviar assim mesmo?`,
    )) {
      return;
    }
    setEnviando(true);
    const numero = telefoneParaWhatsapp(destinatario.telefone);
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
    try {
      await invokeApp("abrir_url", { url });
    } catch (e) {
      setErro(`Não foi possível abrir o WhatsApp: ${e instanceof Error ? e.message : String(e)}`);
      setEnviando(false);
      return;
    }
    const ok = window.confirm(
      "O WhatsApp abriu com o texto pronto. O app não tem como saber se você apertou enviar.\n\nClique OK para registrar este contato como atendimento do aluno.",
    );
    if (!ok) {
      setEnviando(false);
      return;
    }
    const assinatura = assinaturaRastreio(destinatario.nome, rotuloParentesco(destinatario), destinatario.telefone);
    try {
      await onSalvar(aluno.matricula, {
        data: new Date().toISOString().slice(0, 10),
        tipos: [TIPO_CONTATO_FAMILIA],
        atendido: "responsavel",
        atendido_nome: destinatario.nome || undefined,
        tags: template?.tags ?? [],
        descricao: `${texto}${assinatura}`,
        anexos: [],
        canal: "wa_me",
        modelo_id: template?.id,
      });
      onFechar();
    } catch (e) {
      setErro(`Mensagem aberta, mas o registro falhou: ${e instanceof Error ? e.message : String(e)}`);
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onFechar}>
      <div className="atd-compositor" onClick={(e) => e.stopPropagation()}>
        <div className="atd-compositor-topo">
          <div>
            <h2>Mensagem para a família</h2>
            <p>
              {aluno.nome} · Mat. {aluno.matricula} · {aluno.turmaCodigo}
              {aluno.frequencia != null && ` · Frequência ${Math.round(aluno.frequencia)}%`}
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
        </div>

        <div className="atd-compositor-corpo">
          <div className="atd-compositor-passos">
            {erro && <div className="notice error">{erro}</div>}

            <section>
              <span className="atd-passo-rotulo">1 · Destinatário</span>
              <div className="atd-dest-lista">
                {responsaveis.length === 0 && (
                  <div className="atd-dest-vazio">
                    Nenhum responsável cadastrado.
                    {onCadastrarResponsavel && (
                      <button type="button" className="atd-thread-link" onClick={onCadastrarResponsavel}>Cadastrar</button>
                    )}
                  </div>
                )}
                {responsaveis.map((r, i) => {
                  const temTel = Boolean(apenasDigitos(r.telefone));
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`atd-dest-card ${i === destIndice && temTel ? "sel" : ""} ${temTel ? "" : "sem-tel"}`}
                      onClick={() => temTel && setDestIndice(i)}
                      disabled={!temTel}
                    >
                      <span className="atd-dest-radio" aria-hidden>
                        {i === destIndice && temTel ? <Check size={12} /> : null}
                      </span>
                      <span className="atd-dest-info">
                        <strong>{r.nome || "(sem nome)"}</strong>
                        <small>
                          {rotuloParentesco(r).replace(/^./, (c) => c.toUpperCase())}
                          {temTel ? ` · ${formatarTelefoneBR(r.telefone)}` : " · sem telefone cadastrado"}
                        </small>
                      </span>
                      {temTel ? (
                        <span className="atd-dest-tag">tem WhatsApp</span>
                      ) : onCadastrarResponsavel ? (
                        <span className="atd-thread-link" onClick={(e) => { e.stopPropagation(); onCadastrarResponsavel(); }}>Cadastrar</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <span className="atd-passo-rotulo">2 · Modelo</span>
              <select value={templateId} onChange={(e) => trocarTemplate(e.target.value)} className="atd-compositor-select">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.titulo || "(sem título)"}</option>
                ))}
              </select>
              <div className="atd-modelo-tags">
                {(template?.tags ?? []).map((t) => (
                  <span key={t} className="atd-selo-tipo">{t}</span>
                ))}
                <span className="atd-thread-link atd-modelo-config" title="Editável em Configurações">Editar modelos nas Configurações</span>
              </div>
            </section>

            <section>
              <span className="atd-passo-rotulo">
                3 · Variáveis <small>preenchidas com os dados do aluno</small>
              </span>
              {carregando && <p className="atd-compositor-carregando">Carregando dados do aluno…</p>}
              <div className="atd-var-grade">
                {chavesModelo.map((chave) => {
                  const valor = valorResolvido(chave);
                  if (valor != null) {
                    return (
                      <div key={chave} className="atd-var-item">
                        <small>{`{${chave}}`}</small>
                        <strong>{valor}</strong>
                      </div>
                    );
                  }
                  return (
                    <div key={chave} className="atd-var-item pendente">
                      <div className="atd-var-pend-titulo">
                        <Info size={13} aria-hidden /> {`{${chave}}`} sem dado — {rotuloVariavel(chave)}
                      </div>
                      <div className="atd-var-pend-acao">
                        <input
                          value={manuais[chave] ?? ""}
                          onChange={(e) => setManuais((m) => ({ ...m, [chave]: e.target.value }))}
                          placeholder="digitar valor…"
                        />
                        <button type="button" className="atd-thread-link" onClick={() => setCorpo((c) => removerTrechoDaVariavel(c, chave))}>
                          Remover trecho
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="atd-compositor-previa">
            <div className="atd-previa-cabecalho">
              <strong>Prévia da mensagem</strong>
              <span>{texto.length} caracteres</span>
            </div>
            <div className="atd-previa-scroll">
              <div className="atd-bolha">
                {segmentos.map((s, i) =>
                  s.tipo === "texto" ? (
                    <span key={i}>{s.texto}</span>
                  ) : s.resolvido ? (
                    <span key={i}>{s.valor}</span>
                  ) : (
                    <span key={i} className="atd-bolha-pend">‹{s.rotulo}›</span>
                  ),
                )}
              </div>
              <p className="atd-previa-nota">
                <Info size={13} aria-hidden /> O texto abre no WhatsApp pronto; você aperta enviar.
              </p>
            </div>
            <div className="atd-previa-acoes">
              <button type="button" className="atd-btn-primario" onClick={abrirERegistrar} disabled={enviando}>
                <MessageCircle size={17} aria-hidden /> {enviando ? "Abrindo…" : "Abrir no WhatsApp e registrar"}
              </button>
              <button type="button" className="atd-previa-copiar" onClick={copiar}>
                <Copy size={15} aria-hidden /> {copiado ? "Copiado!" : "Copiar texto"}
              </button>
              <div className="atd-previa-auto">
                <span>Envio automático desligado</span>
                {onAtivarEnvioAutomatico && (
                  <button type="button" className="atd-thread-link" onClick={onAtivarEnvioAutomatico}>Ativar envio automático</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
