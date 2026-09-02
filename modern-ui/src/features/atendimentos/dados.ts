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

function ehSemRetorno(at: AtendimentoAluno): boolean {
  if (at.canal !== "wa_me" && at.canal !== "api") return false;
  if ((at.followups ?? []).length > 0) return false;
  if (at.followup_previsto) return false;
  const dias = diasDesde(at.atualizado_em ?? at.criado_em ?? null);
  return dias !== null && dias >= SEM_RETORNO_DIAS;
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
