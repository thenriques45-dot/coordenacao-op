// Derivações da Tela de Atendimentos: achata os atendimentos de todos os
// alunos de uma turma em linhas de tabela e resolve os rótulos de selo.

import type {
  AtendimentoAluno,
  CanalAtendimento,
  LinhaAtendimento,
  TurmaDetalheAtendimentos,
} from "./tipos";

// Um contato por wa.me/API sem nenhum follow-up e mais antigo que isto conta
// como "sem retorno" — sinaliza que a família não respondeu.
export const SEM_RETORNO_DIAS = 7;

// O compositor grava a assinatura de rastreio no fim da descrição, separada por
// uma linha em branco: "…texto…\n\n— Enviado via WhatsApp para Nome (mãe) — (11) …".
// A thread mostra essa parte à parte, em cinza, sob uma linha tracejada.
export function separarAssinaturaRastreio(descricao: string): { corpo: string; assinatura: string | null } {
  const marca = descricao.indexOf("\n\n— Enviado via WhatsApp");
  if (marca === -1) return { corpo: descricao, assinatura: null };
  return {
    corpo: descricao.slice(0, marca).trimEnd(),
    assinatura: descricao.slice(marca + 2).trim(),
  };
}

export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function rotuloAtendido(at: Pick<AtendimentoAluno, "atendido" | "atendido_nome">): string {
  const nome = (at.atendido_nome ?? "").trim();
  if (at.atendido === "responsavel") return nome ? `Responsável · ${nome}` : "Responsável";
  if (at.atendido === "outro") return nome ? `Outro · ${nome}` : "Outro";
  return "Aluno";
}

export type SeloCanal = { texto: string; tom: "manual" | "wa_me" | "wa_me_lote" | "api" };

export function seloCanal(canal: CanalAtendimento, temLote: boolean): SeloCanal {
  if (canal === "api") return { texto: "API oficial", tom: "api" };
  if (canal === "wa_me") return temLote
    ? { texto: "wa.me · lote", tom: "wa_me_lote" }
    : { texto: "wa.me", tom: "wa_me" };
  return { texto: "Manual", tom: "manual" };
}

export function ehSemRetorno(at: AtendimentoAluno): boolean {
  if (at.canal !== "wa_me" && at.canal !== "api") return false;
  if ((at.followups ?? []).length > 0) return false;
  if (at.followup_previsto) return false;
  const dias = diasDesde(at.atualizado_em ?? at.criado_em ?? null);
  return dias !== null && dias >= SEM_RETORNO_DIAS;
}

const TIPO_CONTATO_FAMILIA = "Contato com a família";

// Um atendimento conta como "contato com a família" quando marca o tipo, veio
// por wa.me/API, ou foi feito diretamente com o responsável.
export function ehContatoFamilia(at: AtendimentoAluno): boolean {
  return at.tipos.includes(TIPO_CONTATO_FAMILIA) || at.canal !== "manual" || at.atendido === "responsavel";
}

export type MeioContato = "whatsapp" | "telefone" | "presencial";

export function meioContato(canal: CanalAtendimento, descricao: string, tags: string[]): MeioContato {
  if (canal === "wa_me" || canal === "api") return "whatsapp";
  const alvo = `${descricao} ${tags.join(" ")}`.toLocaleLowerCase("pt-BR");
  if (/liga(ç|c)|telefon/.test(alvo)) return "telefone";
  return "presencial";
}

export type EventoFamilia = {
  id: string;
  data: string;
  criadoEm: string | null;
  canal: CanalAtendimento;
  meio: MeioContato;
  titulo: string;
  alvo: string | null;
  descricao: string;
  temLote: boolean;
  ehFollowup: boolean;
};

// Achata os atendimentos de contato com a família de um aluno (e seus
// follow-ups) num histórico ordenado, para a aba "Por aluno".
export function eventosFamilia(
  atendimentos: AtendimentoAluno[],
  tituloModelo: (modeloId: string | null | undefined) => string | null,
): EventoFamilia[] {
  const eventos: EventoFamilia[] = [];
  for (const at of atendimentos) {
    if (!ehContatoFamilia(at)) continue;
    const alvo =
      at.atendido === "responsavel" || at.atendido === "outro"
        ? (at.atendido_nome ?? "").trim() || null
        : null;
    const tituloBase =
      tituloModelo(at.modelo_id) ??
      (at.canal === "wa_me" || at.canal === "api" ? "Mensagem pelo WhatsApp" : primeiraLinha(at.descricao));
    eventos.push({
      id: at.id,
      data: at.data,
      criadoEm: at.criado_em ?? null,
      canal: at.canal,
      meio: meioContato(at.canal, at.descricao, at.tags),
      titulo: tituloBase,
      alvo,
      descricao: at.descricao,
      temLote: Boolean(at.lote_id),
      ehFollowup: false,
    });
    for (const f of at.followups ?? []) {
      eventos.push({
        id: f.id,
        data: f.data,
        criadoEm: f.criado_em ?? null,
        canal: f.canal,
        meio: meioContato(f.canal, f.descricao, f.tags),
        titulo: "Follow-up",
        alvo: (f.atendido_nome ?? "").trim() || null,
        descricao: f.descricao,
        temLote: false,
        ehFollowup: true,
      });
    }
  }
  eventos.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || (b.criadoEm ?? "").localeCompare(a.criadoEm ?? ""));
  return eventos;
}

function primeiraLinha(texto: string): string {
  const linha = (texto.split("\n").find((l) => l.trim()) ?? "").trim();
  return linha.length > 60 ? `${linha.slice(0, 57)}…` : linha || "Registro";
}

export function montarLinhas(
  detalhe: TurmaDetalheAtendimentos,
  turmaCodigo: string,
): LinhaAtendimento[] {
  const linhas: LinhaAtendimento[] = [];
  for (const aluno of detalhe.alunos) {
    for (const atendimento of aluno.atendimentos ?? []) {
      linhas.push({
        atendimento,
        matricula: aluno.matricula,
        alunoNome: aluno.nome,
        numeroChamada: aluno.numero_chamada,
        turmaCodigo,
        totalFollowups: (atendimento.followups ?? []).length,
        followupPendente: Boolean(atendimento.followup_previsto),
        semRetorno: ehSemRetorno(atendimento),
        atendidoLabel: rotuloAtendido(atendimento),
      });
    }
  }
  // Mais recentes primeiro (por data do atendimento, desempate por atualização).
  linhas.sort((a, b) => {
    const porData = (b.atendimento.data ?? "").localeCompare(a.atendimento.data ?? "");
    if (porData !== 0) return porData;
    return (b.atendimento.atualizado_em ?? "").localeCompare(a.atendimento.atualizado_em ?? "");
  });
  return linhas;
}
