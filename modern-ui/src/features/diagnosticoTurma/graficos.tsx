// Gráficos simples em HTML/SVG para o Relatório Diagnóstico da Turma.
// Pensados para impressão: sem dependências, cores por classe (tom-*) e
// valores sempre escritos ao lado da marca, para não depender só da cor.

import type { ReactNode } from "react";
import type { Tom } from "./calculos";

export function BarrasHorizontais({
  itens,
  maximo,
  formatar,
  vazio = "Sem dados.",
}: {
  itens: { rotulo: string; valor: number | null; tom: Tom; detalhe?: ReactNode }[];
  maximo: number;
  formatar: (valor: number) => string;
  vazio?: string;
}) {
  if (!itens.length) return <p className="diag-vazio">{vazio}</p>;
  return (
    <div className="diag-barras">
      {itens.map((item) => (
        <div className="diag-barra-linha" key={item.rotulo} title={item.valor === null ? item.rotulo : `${item.rotulo}: ${formatar(item.valor)}`}>
          <span className="diag-barra-rotulo">{item.rotulo}</span>
          <span className="diag-barra-trilho">
            {item.valor !== null && (
              <i className={`tom-${item.tom}`} style={{ width: `${Math.max(1.5, Math.min(100, (item.valor / maximo) * 100))}%` }} />
            )}
          </span>
          <strong className="diag-barra-valor">{item.valor === null ? "—" : formatar(item.valor)}</strong>
          {item.detalhe !== undefined && <span className="diag-barra-detalhe">{item.detalhe}</span>}
        </div>
      ))}
    </div>
  );
}

export function Rosca({
  fatias,
  centro,
  legenda,
}: {
  fatias: { rotulo: string; valor: number; tom: Tom }[];
  centro: ReactNode;
  legenda?: string;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const raio = 42;
  const circunferencia = 2 * Math.PI * raio;
  const visiveis = fatias.filter((f) => f.valor > 0);
  const lacuna = visiveis.length > 1 ? 1.6 : 0;
  let acumulado = 0;
  return (
    <div className="diag-rosca">
      <svg viewBox="0 0 100 100" role="img" aria-label={legenda ?? "Distribuição"}>
        <circle cx="50" cy="50" r={raio} className="diag-rosca-fundo" />
        {total > 0 &&
          visiveis.map((fatia) => {
            const comprimento = (fatia.valor / total) * circunferencia;
            const traco = Math.max(0.1, comprimento - lacuna);
            const elemento = (
              <circle
                key={fatia.rotulo}
                cx="50"
                cy="50"
                r={raio}
                className={`diag-rosca-fatia tom-${fatia.tom}`}
                strokeDasharray={`${traco} ${circunferencia - traco}`}
                strokeDashoffset={-acumulado}
                transform="rotate(-90 50 50)"
              >
                <title>{`${fatia.rotulo}: ${fatia.valor}`}</title>
              </circle>
            );
            acumulado += comprimento;
            return elemento;
          })}
      </svg>
      <div className="diag-rosca-centro">{centro}</div>
    </div>
  );
}

export function BarraEmpilhada({
  segmentos,
}: {
  segmentos: { rotulo: string; valor: number; tom: Tom | "avancado" }[];
}) {
  const total = segmentos.reduce((s, seg) => s + seg.valor, 0);
  return (
    <div className="diag-empilhada" role="img" aria-label={segmentos.map((s) => `${s.rotulo}: ${s.valor}`).join(", ")}>
      {total === 0 && <span className="diag-empilhada-vazia" />}
      {segmentos
        .filter((seg) => seg.valor > 0)
        .map((seg) => (
          <i key={seg.rotulo} className={`tom-${seg.tom}`} style={{ flexGrow: seg.valor }} title={`${seg.rotulo}: ${seg.valor}`}>
            {total > 0 && seg.valor / total >= 0.08 ? seg.valor : ""}
          </i>
        ))}
    </div>
  );
}

export function Legenda({ itens }: { itens: { rotulo: string; tom: Tom | "avancado"; valor?: ReactNode }[] }) {
  return (
    <div className="diag-legenda">
      {itens.map((item) => (
        <span key={item.rotulo}>
          <i className={`tom-${item.tom}`} />
          {item.rotulo}
          {item.valor !== undefined && <strong>{item.valor}</strong>}
        </span>
      ))}
    </div>
  );
}

/** Colunas verticais (ex.: média por bimestre). */
export function Colunas({
  itens,
  maximo,
  formatar,
}: {
  itens: { rotulo: string; valor: number | null; tom: Tom }[];
  maximo: number;
  formatar: (valor: number) => string;
}) {
  return (
    <div className="diag-colunas">
      {itens.map((item) => (
        <div className="diag-coluna" key={item.rotulo}>
          <strong>{item.valor === null ? "—" : formatar(item.valor)}</strong>
          <span className="diag-coluna-trilho">
            {item.valor !== null && (
              <i className={`tom-${item.tom}`} style={{ height: `${Math.max(2, Math.min(100, (item.valor / maximo) * 100))}%` }} />
            )}
          </span>
          <span className="diag-coluna-rotulo">{item.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

/** Barra divergente a partir do zero: verde para a direita, vermelha para a esquerda. */
export function Variacao({ valor, maximo, sufixo = "" }: { valor: number; maximo: number; sufixo?: string }) {
  const largura = Math.min(50, (Math.abs(valor) / Math.max(maximo, 0.0001)) * 50);
  const positivo = valor >= 0;
  return (
    <span className="diag-variacao">
      <span className="diag-variacao-trilho">
        <i
          className={positivo ? "tom-bom" : "tom-critico"}
          style={positivo ? { left: "50%", width: `${largura}%` } : { right: "50%", width: `${largura}%` }}
        />
        <b />
      </span>
      <strong className={positivo ? "texto-bom" : "texto-critico"}>
        {positivo ? "▲ +" : "▼ "}
        {valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        {sufixo}
      </strong>
    </span>
  );
}
