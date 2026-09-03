// Lógica compartilhada de mensagem à família (wa.me): telefone, parentesco,
// resolução de variáveis do modelo e assinatura de rastreio. Extraído de
// ClassManagement.tsx para servir também o compositor da Tela de Atendimentos.

import { VARIAVEIS_MENSAGEM } from "../SettingsPage";

export type VariavelMensagem = {
  chave: string;
  rotulo: string;
  valor: string;
  disponivel: boolean;
};

export type ParentescoLike = { parentesco: string; parentesco_desc?: string | null };

export const PARENTESCO_OPCOES: { valor: string; rotulo: string }[] = [
  { valor: "mae", rotulo: "Mãe" },
  { valor: "pai", rotulo: "Pai" },
  { valor: "outro", rotulo: "Outro" },
];

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function formatarTelefoneBR(valor: string): string {
  const d = apenasDigitos(valor).replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

export function telefoneParaWhatsapp(valor: string): string {
  const d = apenasDigitos(valor);
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

export function rotuloParentesco(r: ParentescoLike): string {
  if (r.parentesco === "mae") return "mãe";
  if (r.parentesco === "pai") return "pai";
  return (r.parentesco_desc || "").trim() || "responsável";
}

export function rotuloVariavel(chave: string): string {
  return VARIAVEIS_MENSAGEM.find((v) => v.chave === chave)?.rotulo ?? chave;
}

export type SegmentoMensagem =
  | { tipo: "texto"; texto: string; chave?: undefined }
  | { tipo: "var"; chave: string; rotulo: string; valor?: string; resolvido: boolean; texto?: undefined };

// Quebra o corpo do modelo em trechos literais + ocorrências de {variavel},
// já resolvendo cada variável pelo valor real (ou marcando como pendente).
// `extras` vence sobre `variaveis` (usado para responsável e valores digitados
// na hora).
export function montarSegmentosMensagem(
  corpo: string,
  variaveis: VariavelMensagem[],
  extras: Record<string, string>,
): SegmentoMensagem[] {
  const mapa = new Map(variaveis.map((v) => [v.chave, v]));
  const segmentos: SegmentoMensagem[] = [];
  const regex = /\{([a-z_]+)\}/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(corpo)) !== null) {
    if (m.index > ultimo) segmentos.push({ tipo: "texto", texto: corpo.slice(ultimo, m.index) });
    const chave = m[1];
    const extra = extras[chave];
    const variavel = mapa.get(chave);
    if (extra != null && extra !== "") {
      segmentos.push({ tipo: "var", chave, rotulo: rotuloVariavel(chave), valor: extra, resolvido: true });
    } else if (variavel && variavel.disponivel) {
      segmentos.push({ tipo: "var", chave, rotulo: variavel.rotulo, valor: variavel.valor, resolvido: true });
    } else {
      segmentos.push({ tipo: "var", chave, rotulo: variavel?.rotulo ?? rotuloVariavel(chave), resolvido: false });
    }
    ultimo = regex.lastIndex;
  }
  if (ultimo < corpo.length) segmentos.push({ tipo: "texto", texto: corpo.slice(ultimo) });
  return segmentos;
}

export function textoDeSegmentos(segmentos: SegmentoMensagem[]): string {
  return segmentos
    .map((s) => (s.tipo === "texto" ? s.texto ?? "" : s.resolvido ? s.valor ?? "" : `{${s.chave}}`))
    .join("");
}

export function variaveisNaoResolvidas(segmentos: SegmentoMensagem[]): { chave: string; rotulo: string }[] {
  return Array.from(
    new Map(
      segmentos.flatMap((s) => (s.tipo === "var" && !s.resolvido ? [[s.chave, s.rotulo] as const] : [])),
    ),
  ).map(([chave, rotulo]) => ({ chave, rotulo }));
}

// Remove do corpo o "trecho" (a linha) que contém {chave}. Os modelos são
// escritos com uma ideia por linha, então apagar a linha inteira é o que o
// coordenador espera ao clicar em "Remover trecho".
export function removerTrechoDaVariavel(corpo: string, chave: string): string {
  const alvo = `{${chave}}`;
  return corpo
    .split("\n")
    .filter((linha) => !linha.includes(alvo))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assinaturaRastreio(nome: string, parentescoRotulo: string, telefone: string): string {
  return `\n\n— Enviado via WhatsApp para ${nome || "responsável"} (${parentescoRotulo}) — ${formatarTelefoneBR(telefone)}`;
}
