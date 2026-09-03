import { ArrowRight, Check, MessageCircle, Pause, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeApp } from "../appBridge";
import type { MensagemTemplate } from "../SettingsPage";
import {
  assinaturaRastreio,
  formatarTelefoneBR,
  montarSegmentosMensagem,
  telefoneParaWhatsapp,
  textoDeSegmentos,
  variaveisNaoResolvidas,
  type VariavelMensagem,
} from "./mensagemFamilia";
import type { DisparoLote } from "./lote";
import type { AtendimentoAlunoInput } from "./tipos";

const TIPO_CONTATO_FAMILIA = "Contato com a família";
const SEGUNDOS_POR_ENVIO = 15;

export function FilaAssistida({
  disparo: disparoInicial,
  turma,
  bimestre,
  modelo,
  onSalvarAtendimento,
  onAtualizarDisparo,
  onSair,
  onConcluir,
}: {
  disparo: DisparoLote;
  turma: { codigo: string; caminho: string };
  bimestre: string;
  modelo: MensagemTemplate | undefined;
  onSalvarAtendimento: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
  onAtualizarDisparo: (disparo: DisparoLote) => Promise<void>;
  onSair: () => void;
  onConcluir: () => void;
}) {
  const [disparo, setDisparo] = useState<DisparoLote>(disparoInicial);
  const [pos, setPos] = useState(disparoInicial.posicao_atual);
  const [enviados, setEnviados] = useState<Set<string>>(new Set(disparoInicial.enviados));
  const [pulados, setPulados] = useState<Set<string>>(new Set(disparoInicial.pulados));
  const [vars, setVars] = useState<VariavelMensagem[]>([]);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const total = disparo.destinatarios.length;
  const atual = disparo.destinatarios[pos];
  const restantes = total - enviados.size - pulados.size;
  const progresso = total > 0 ? Math.round(((enviados.size + pulados.size) / total) * 100) : 0;
  const etaMin = Math.max(1, Math.round((restantes * SEGUNDOS_POR_ENVIO) / 60));

  useEffect(() => {
    if (!atual) {
      setVars([]);
      return;
    }
    invokeApp<VariavelMensagem[]>("resolver_variaveis_mensagem", {
      caminho: turma.caminho,
      matricula: atual.matricula,
      bimestre,
    })
      .then(setVars)
      .catch(() => setVars([]));
  }, [atual, turma.caminho, bimestre]);

  const segmentos = useMemo(() => {
    if (!atual) return [];
    const extras: Record<string, string> = { responsavel: (atual.responsavel_nome ?? "").trim() || "responsável" };
    return montarSegmentosMensagem(modelo?.corpo ?? "", vars, extras);
  }, [atual, vars, modelo]);
  const texto = textoDeSegmentos(segmentos);
  const pendentes = variaveisNaoResolvidas(segmentos);

  const persistir = useCallback(
    async (patch: Partial<DisparoLote>) => {
      const atualizado: DisparoLote = {
        ...disparo,
        enviados: [...enviados],
        pulados: [...pulados],
        posicao_atual: pos,
        ...patch,
      };
      setDisparo(atualizado);
      try {
        await onAtualizarDisparo(atualizado);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    },
    [disparo, enviados, pulados, pos, onAtualizarDisparo],
  );

  async function avancar(novoEnviados: Set<string>, novoPulados: Set<string>) {
    const prox = (() => {
      for (let i = pos + 1; i < total; i++) {
        const m = disparo.destinatarios[i].matricula;
        if (!novoEnviados.has(m) && !novoPulados.has(m)) return i;
      }
      return total;
    })();
    setPos(prox);
    if (prox >= total) {
      const situacao = novoPulados.size > 0 ? "concluida_pulados" : "concluida";
      await persistir({ enviados: [...novoEnviados], pulados: [...novoPulados], posicao_atual: prox, situacao });
      onConcluir();
    } else {
      await persistir({ enviados: [...novoEnviados], pulados: [...novoPulados], posicao_atual: prox });
    }
  }

  async function abrirWhatsapp() {
    if (!atual?.telefone) return;
    setErro("");
    const url = `https://wa.me/${telefoneParaWhatsapp(atual.telefone)}?text=${encodeURIComponent(texto)}`;
    try {
      await invokeApp("abrir_url", { url });
    } catch (e) {
      setErro(`Não foi possível abrir o WhatsApp: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function marcarEnviei() {
    if (!atual || ocupado) return;
    setOcupado(true);
    setErro("");
    const assinatura = assinaturaRastreio(atual.responsavel_nome ?? "", "responsável", atual.telefone ?? "");
    try {
      await onSalvarAtendimento(atual.matricula, {
        data: new Date().toISOString().slice(0, 10),
        tipos: [TIPO_CONTATO_FAMILIA],
        atendido: "responsavel",
        atendido_nome: atual.responsavel_nome ?? undefined,
        tags: modelo?.tags ?? [],
        descricao: `${texto}${assinatura}`,
        anexos: [],
        canal: "wa_me",
        lote_id: disparo.id,
        modelo_id: modelo?.id,
      });
      const nv = new Set(enviados).add(atual.matricula);
      setEnviados(nv);
      await avancar(nv, pulados);
    } catch (e) {
      setErro(`Não deu para registrar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  async function pular() {
    if (!atual || ocupado) return;
    const np = new Set(pulados).add(atual.matricula);
    setPulados(np);
    await avancar(enviados, np);
  }

  async function pausar() {
    await persistir({ situacao: "pausada" });
    onSair();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Enter") { e.preventDefault(); marcarEnviei(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); pular(); }
      else if (e.key === "Escape") { e.preventDefault(); pausar(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="atd-fa">
      <header className="atd-fa-header">
        <div className="atd-fa-header-topo">
          <div>
            <h1>Fila assistida · {modelo?.titulo ?? "mensagem"}</h1>
            <p>{turma.codigo} · {total} destinatários · você aperta enviar no WhatsApp e volta aqui.</p>
          </div>
          <div className="atd-fa-header-acoes">
            <button type="button" className="atd-btn-secundario" onClick={pausar}><Pause size={15} aria-hidden /> Pausar</button>
            <button type="button" className="atd-btn-secundario" onClick={pausar}>Sair e retomar depois</button>
          </div>
        </div>
        <div className="atd-fa-progresso">
          <div className="atd-fa-barra"><span style={{ width: `${progresso}%` }} /></div>
          <span><strong>{enviados.size} enviados</strong> · {pulados.size} pulados · {restantes} restantes</span>
          {restantes > 0 && <span className="atd-fa-eta">≈ {etaMin} min restantes</span>}
        </div>
      </header>

      {atual ? (
        <div className="atd-fa-corpo">
          <div className="atd-fa-atual">
            <div className="atd-fa-card">
              <div className="atd-fa-card-topo">
                <span className="atd-fa-avatar">{iniciais(atual.nome)}</span>
                <div className="atd-fa-card-info">
                  <div><strong>{atual.nome}</strong> <span>{pos + 1} de {total}</span></div>
                  <div className="atd-fa-resp">→ {atual.responsavel_nome ?? "responsável"} · {atual.telefone ? formatarTelefoneBR(atual.telefone) : "sem telefone"}</div>
                </div>
                {pendentes.length > 0 && (
                  <span className="atd-fa-selo-var"><TriangleAlert size={13} aria-hidden /> {pendentes.length} variável sem dado</span>
                )}
              </div>

              <div className="atd-fa-bolha">
                {segmentos.map((s, i) =>
                  s.tipo === "texto" ? <span key={i}>{s.texto}</span>
                  : s.resolvido ? <span key={i}>{s.valor}</span>
                  : <span key={i} className="atd-bolha-pend">‹{s.rotulo}›</span>,
                )}
              </div>

              {erro && <div className="notice error">{erro}</div>}

              <div className="atd-fa-acoes">
                <button type="button" className="atd-btn-primario" onClick={abrirWhatsapp} disabled={!atual.telefone}>
                  <MessageCircle size={17} aria-hidden /> Abrir no WhatsApp
                </button>
                <button type="button" className="atd-fa-enviei" onClick={marcarEnviei} disabled={ocupado} aria-keyshortcuts="Enter">
                  <Check size={15} aria-hidden /> Enviei · próximo <kbd>Enter</kbd>
                </button>
                <button type="button" className="atd-fa-pular" onClick={pular} disabled={ocupado} aria-keyshortcuts="ArrowRight">
                  Pular <kbd>→</kbd>
                </button>
              </div>
            </div>

            <div className="atd-fa-ritmo">
              <TriangleAlert size={15} aria-hidden />
              Ritmo sugerido: 15 s entre envios. Muitos disparos seguidos do seu número pessoal podem acionar o antispam do WhatsApp.
            </div>
          </div>

          <aside className="atd-fa-lista">
            <div className="atd-fa-lista-topo"><strong>Fila</strong><span>{total} no total</span></div>
            <div className="atd-fa-lista-corpo">
              {disparo.destinatarios.map((d, i) => {
                const estado = enviados.has(d.matricula) ? "enviado"
                  : pulados.has(d.matricula) ? "pulado"
                  : i === pos ? "atual"
                  : !d.telefone ? "sem-tel"
                  : "pendente";
                return (
                  <div key={d.matricula} className={`atd-fa-item ${estado}`}>
                    <span className="atd-fa-item-marca" aria-hidden>
                      {estado === "enviado" ? <Check size={11} /> : estado === "pulado" ? "—" : estado === "atual" ? <ArrowRight size={11} /> : ""}
                    </span>
                    <span className="atd-fa-item-nome">{d.nome}</span>
                    <small>{estado === "enviado" ? "enviado" : estado === "pulado" ? "pulado" : estado === "atual" ? "agora" : estado === "sem-tel" ? "sem telefone" : ""}</small>
                  </div>
                );
              })}
            </div>
            <div className="atd-fa-lista-nota">Cada "Enviei" registra um atendimento do tipo <strong>Contato com a família</strong> no aluno.</div>
          </aside>
        </div>
      ) : (
        <div className="atd-fa-fim">
          <span className="atd-fa-fim-icone"><Check size={28} aria-hidden /></span>
          <strong>Fila concluída</strong>
          <p>{enviados.size} enviados · {pulados.size} pulados. Cada envio virou um atendimento no aluno.</p>
          <button type="button" className="atd-btn-primario" onClick={onConcluir}>Voltar aos atendimentos</button>
        </div>
      )}
    </div>
  );
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
