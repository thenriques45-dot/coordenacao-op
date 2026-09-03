import { useMemo, useState } from "react";
import { tempoRelativo } from "./formato";
import type { DisparoLote } from "./lote";

export type DisparoLoteRegistro = DisparoLote;

const CANAIS = [
  { valor: "todos", rotulo: "Canal · Todos" },
  { valor: "wa_me", rotulo: "Fila wa.me" },
  { valor: "api", rotulo: "API oficial" },
];
const PERIODOS = [
  { valor: "90", rotulo: "90 dias", dias: 90 },
  { valor: "30", rotulo: "30 dias", dias: 30 },
  { valor: "365", rotulo: "Último ano", dias: 365 },
  { valor: "todos", rotulo: "Tudo", dias: null as number | null },
];

function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function situacaoInfo(d: DisparoLoteRegistro): { rotulo: string; tom: "ok" | "atencao" | "acento"; acao?: "retomar" | "relatorio" } {
  const pendencias = d.falhas.length;
  if (d.situacao === "pausada") return { rotulo: "Pausada", tom: "acento", acao: "retomar" };
  if (pendencias > 0 || d.situacao === "pendencias") return { rotulo: `${pendencias} pendências`, tom: "atencao", acao: "relatorio" };
  if (d.situacao === "concluida_pulados" || d.pulados.length > 0) return { rotulo: `Concluída · ${d.pulados.length} pulados`, tom: "ok" };
  if (d.situacao === "em_progresso") return { rotulo: "Em progresso", tom: "acento" };
  return { rotulo: "Concluída", tom: "ok" };
}

export function AbaDisparos({
  disparos,
  turmaCodigo,
  onRetomar,
  onVerRelatorio,
}: {
  disparos: DisparoLoteRegistro[];
  turmaCodigo: string;
  onRetomar: (d: DisparoLoteRegistro) => void;
  onVerRelatorio: (d: DisparoLoteRegistro) => void;
}) {
  const [canal, setCanal] = useState("todos");
  const [periodo, setPeriodo] = useState("90");

  const lista = useMemo(() => {
    const p = PERIODOS.find((x) => x.valor === periodo);
    const limite = p?.dias != null ? Date.now() - p.dias * 86_400_000 : null;
    return disparos
      .filter((d) => canal === "todos" || d.canal === canal)
      .filter((d) => limite == null || Date.parse(d.data_hora) >= limite)
      .sort((a, b) => b.data_hora.localeCompare(a.data_hora));
  }, [disparos, canal, periodo]);

  return (
    <div className="atd-disparos">
      <div className="atd-disparos-topo">
        <div>
          <strong>Últimos disparos da {turmaCodigo}</strong>
          <p>Uma fila pausada continua de onde parou.</p>
        </div>
        <div className="atd-disparos-filtros">
          <select value={canal} onChange={(e) => setCanal(e.target.value)}>
            {CANAIS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map((p) => <option key={p.valor} value={p.valor}>Período · {p.rotulo}</option>)}
          </select>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="atd-carregando">Nenhum disparo em lote nesta turma{canal !== "todos" || periodo !== "todos" ? " neste filtro" : ""}.</div>
      ) : (
        <div className="atd-disparos-tabela">
          <div className="atd-disparos-grade atd-disparos-cab">
            <span>Quando</span><span>Modelo</span><span>Canal</span><span>Destinat.</span><span>Enviados</span><span>Falhas</span><span>Situação</span><span />
          </div>
          {lista.map((d) => {
            const sit = situacaoInfo(d);
            return (
              <div key={d.id} className={`atd-disparos-grade atd-disparos-linha ${sit.acao === "retomar" ? "pausada" : ""}`}>
                <span className="atd-disparos-quando">{dataHora(d.data_hora)}</span>
                <strong>{d.modelo_titulo || "Mensagem"}</strong>
                <span className={`atd-selo-canal ${d.canal === "api" ? "api" : "wa_me"}`}>
                  {d.canal === "api" ? "API oficial" : "Fila wa.me"}
                </span>
                <span>{d.destinatarios.length}</span>
                <strong className="atd-disparos-ok">{d.enviados.length}</strong>
                <strong className={d.falhas.length ? "atd-disparos-falha" : "atd-disparos-neutro"}>{d.falhas.length || "—"}</strong>
                <span className={`atd-disparos-sit tom-${sit.tom}`}>{sit.rotulo}</span>
                <span className="atd-disparos-acao">
                  {sit.acao === "retomar" && <button type="button" className="atd-thread-link" onClick={() => onRetomar(d)}>Retomar fila</button>}
                  {sit.acao === "relatorio" && <button type="button" className="atd-thread-link" onClick={() => onVerRelatorio(d)}>Ver relatório</button>}
                  {!sit.acao && <span className="atd-disparos-quando">{tempoRelativo(d.atualizado_em)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
