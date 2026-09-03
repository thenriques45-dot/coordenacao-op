// Formatação de datas para a Tela de Atendimentos.

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// "dd/MM" a partir de uma data ISO (yyyy-mm-dd) ou completa.
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "12 de ago" — para o follow-up combinado.
export function dataPorExtensoCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return dataCurta(iso);
  const dia = Number.parseInt(m[3], 10);
  const mes = MESES_CURTOS[Number.parseInt(m[2], 10) - 1] ?? "";
  return `${dia} de ${mes}`;
}

// Tempo relativo compacto a partir de um instante ISO ("hoje", "há 3 dias",
// "há 2 sem", "há 4 meses").
export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const dias = Math.floor((Date.now() - t) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 21) return `há ${dias} dias`;
  if (dias < 60) return `há ${Math.round(dias / 7)} sem`;
  return `há ${Math.round(dias / 30)} meses`;
}

import { useEffect, useState } from "react";

// Acompanha uma media query (usada para decidir painel lateral vs. drawer).
export function useMediaQuery(query: string): boolean {
  const [combina, setCombina] = useState(() =>
    typeof window !== "undefined" && "matchMedia" in window ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia(query);
    const onChange = () => setCombina(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return combina;
}

// Acompanha o estado de conexão (para os avisos "sem internet" do handoff 2e).
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

// "1 destinatário" / "3 destinatários" — inclui o número.
export function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
