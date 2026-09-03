import { CalendarClock, Check, ExternalLink, MessageCircle, MoreVertical, Paperclip, Pencil, Plus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { rotuloAtendido, separarAssinaturaRastreio, seloCanal } from "./dados";
import { dataPorExtensoCurta } from "./formato";
import type { AtendimentoAluno, AtendimentoAnexo, AtendimentoFollowUp, FollowupPrevisto, LinhaAtendimento } from "./tipos";

const TIPO_CONTATO_FAMILIA = "Contato com a família";

function horaCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function CaixaTexto({ descricao, anexos, onAbrirAnexo }: {
  descricao: string;
  anexos: AtendimentoAnexo[];
  onAbrirAnexo: (a: AtendimentoAnexo) => void;
}) {
  const { corpo, assinatura } = separarAssinaturaRastreio(descricao);
  return (
    <div className="atd-thread-caixa">
      <p>{corpo}</p>
      {assinatura && <div className="atd-thread-assinatura">{assinatura}</div>}
      {anexos.length > 0 && (
        <div className="atd-thread-anexos">
          {anexos.map((a) => (
            <button key={a.id} type="button" onClick={() => onAbrirAnexo(a)}>
              <Paperclip size={12} aria-hidden /> {a.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PainelThread({
  linha,
  frequencia,
  tarefasPendentes,
  variante,
  onFollowup,
  onDesfecho,
  onEditar,
  onNovaMensagem,
  onDefinirCombinado,
  onAbrirAnexo,
  onAbrirFicha,
  onFechar,
}: {
  linha: LinhaAtendimento;
  frequencia: number | null;
  tarefasPendentes: string | null;
  variante: "drawer" | "painel";
  onFollowup: () => void;
  onDesfecho: () => void;
  onEditar: () => void;
  onNovaMensagem: () => void;
  onDefinirCombinado: (previsto: FollowupPrevisto | null) => Promise<void>;
  onAbrirAnexo: (a: AtendimentoAnexo) => void;
  onAbrirFicha: () => void;
  onFechar: () => void;
}) {
  const at = linha.atendimento;
  const selo = seloCanal(at.canal, Boolean(at.lote_id));
  const followups: AtendimentoFollowUp[] = [...(at.followups ?? [])].sort((a, b) =>
    (a.data ?? "").localeCompare(b.data ?? "") || (a.criado_em ?? "").localeCompare(b.criado_em ?? ""),
  );
  const [menuAberto, setMenuAberto] = useState(false);
  const [combinando, setCombinando] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const conteudo = (
    <div className={`atd-thread ${variante}`}>
      <div className="atd-thread-topo">
        <div className="atd-thread-aluno">
          <strong>{linha.alunoNome}</strong>
          <span>
            Mat. {linha.matricula} · {linha.turmaCodigo}
            {frequencia != null && ` · Frequência ${Math.round(frequencia)}%`}
            {tarefasPendentes && ` · ${tarefasPendentes} tarefas pendentes`}
          </span>
        </div>
        <button type="button" className="atd-thread-fechar" onClick={onFechar} aria-label="Fechar"><X size={16} /></button>
      </div>

      <div className="atd-thread-acoes">
        <button type="button" onClick={onFollowup}><Plus size={14} aria-hidden /> Follow-up</button>
        <button type="button" onClick={onNovaMensagem}>
          <MessageCircle size={14} aria-hidden /> Nova mensagem
        </button>
        <div className="atd-thread-menu" ref={menuRef}>
          <button type="button" onClick={() => setMenuAberto((v) => !v)} aria-label="Mais ações"><MoreVertical size={15} /></button>
          {menuAberto && (
            <div className="atd-thread-menu-lista">
              <button type="button" onClick={() => { setMenuAberto(false); onEditar(); }}>
                <Pencil size={13} aria-hidden /> Editar registro
              </button>
              {!at.followup_previsto && (
                <button type="button" onClick={() => { setMenuAberto(false); setCombinando(true); }}>
                  <CalendarClock size={13} aria-hidden /> Combinar retorno
                </button>
              )}
              <button type="button" onClick={() => { setMenuAberto(false); onAbrirFicha(); }}>
                <ExternalLink size={13} aria-hidden /> Abrir ficha do aluno
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="atd-thread-timeline">
        <ItemTimeline
          marcador="inicial"
          titulo="Registro inicial"
          quando={`${at.data ? dataPorExtensoCurta(at.data) : ""}${horaCurta(at.criado_em) ? ` · ${horaCurta(at.criado_em)}` : ""}`}
        >
          <CaixaTexto descricao={at.descricao} anexos={at.anexos ?? []} onAbrirAnexo={onAbrirAnexo} />
          <div className="atd-thread-selos">
            <span className={`atd-selo-canal ${selo.tom}`}>{selo.texto}</span>
            {at.tipos.map((t) => (
              <span key={t} className={`atd-selo-tipo ${t === TIPO_CONTATO_FAMILIA ? "familia" : ""}`}>{t}</span>
            ))}
          </div>
        </ItemTimeline>

        {followups.map((f) => (
          <ItemTimeline
            key={f.id}
            marcador="followup"
            titulo={`Follow-up · ${rotuloAtendido(f)}`}
            quando={`${f.data ? dataPorExtensoCurta(f.data) : ""}${horaCurta(f.criado_em) ? ` · ${horaCurta(f.criado_em)}` : ""}`}
          >
            <CaixaTexto descricao={f.descricao} anexos={f.anexos ?? []} onAbrirAnexo={onAbrirAnexo} />
          </ItemTimeline>
        ))}

        {at.followup_previsto && (
          <ItemTimeline marcador="combinado" titulo="Follow-up combinado" quando={`para ${dataPorExtensoCurta(at.followup_previsto.data)}`} acento>
            {at.followup_previsto.descricao && <p className="atd-thread-combinado-desc">{at.followup_previsto.descricao}</p>}
            <div className="atd-thread-combinado-acoes">
              <button type="button" className="atd-btn-desfecho" onClick={onDesfecho}>
                <Check size={14} aria-hidden /> Registrar desfecho
              </button>
              <button type="button" className="atd-thread-link" onClick={() => setCombinando(true)}>Editar retorno</button>
            </div>
          </ItemTimeline>
        )}
      </div>

      {combinando && (
        <FormCombinar
          inicial={at.followup_previsto ?? null}
          onCancelar={() => setCombinando(false)}
          onConfirmar={async (previsto) => {
            await onDefinirCombinado(previsto);
            setCombinando(false);
          }}
        />
      )}
    </div>
  );

  if (variante === "drawer") {
    return (
      <div className="atd-drawer-backdrop" onClick={onFechar}>
        <div className="atd-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          {conteudo}
        </div>
      </div>
    );
  }
  return conteudo;
}

function ItemTimeline({
  marcador,
  titulo,
  quando,
  acento,
  children,
}: {
  marcador: "inicial" | "followup" | "combinado";
  titulo: string;
  quando: string;
  acento?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`atd-tl-item ${marcador}`}>
      <div className="atd-tl-trilho">
        <span className="atd-tl-marcador" aria-hidden>
          {marcador === "combinado" ? <CalendarClock size={13} /> : marcador === "followup" ? <MessageCircle size={13} /> : <MessageCircle size={13} />}
        </span>
      </div>
      <div className="atd-tl-conteudo">
        <div className={`atd-tl-cabecalho ${acento ? "acento" : ""}`}>
          <strong>{titulo}</strong>
          <span>{quando}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormCombinar({
  inicial,
  onCancelar,
  onConfirmar,
}: {
  inicial: FollowupPrevisto | null;
  onCancelar: () => void;
  onConfirmar: (previsto: FollowupPrevisto | null) => Promise<void>;
}) {
  const [data, setData] = useState(inicial?.data ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!data) return setErro("Escolha a data prevista.");
    setSalvando(true);
    setErro("");
    try {
      await onConfirmar({ data, descricao: descricao.trim() });
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setSalvando(false);
    }
  }

  return (
    <form className="atd-combinar" onSubmit={confirmar}>
      <strong>Combinar retorno</strong>
      <p>Um compromisso datado — é o que sinaliza que o caso tem pendência.</p>
      {erro && <div className="notice error">{erro}</div>}
      <label>
        <span>Data prevista</span>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </label>
      <label>
        <span>O que verificar / combinar</span>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: conferir com a professora se as tarefas foram entregues" />
      </label>
      <div className="atd-combinar-acoes">
        {inicial && (
          <button type="button" className="atd-thread-link" onClick={() => onConfirmar(null)}>Remover retorno combinado</button>
        )}
        <button type="button" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="atd-btn-primario" disabled={salvando}>{salvando ? "Salvando…" : "Combinar"}</button>
      </div>
    </form>
  );
}
