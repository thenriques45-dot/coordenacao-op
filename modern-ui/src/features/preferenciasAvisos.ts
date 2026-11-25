// Preferências da central de avisos: quais avisos automáticos o app gera e se
// também usa a notificação do sistema. Ficam neste computador.

export const PREFERENCIAS_AVISOS_KEY = "coordenacaoop:preferencias-avisos:v1";
export const PREFERENCIAS_AVISOS_EVENT = "coordenacaoop:preferencias-avisos-updated";

export type PreferenciasAvisos = {
  /** Atendimentos com retorno (follow-up) combinado para hoje ou antes. */
  retornos: boolean;
  /** Turmas com mais alunos em risco de reprovação por faltas no Aluno Presente. */
  riscoFaltas: boolean;
  /** Eventos do calendário com "Avisar" marcado. */
  eventos: boolean;
  /** Tarefa compartilhada que um colega passou para você. */
  tarefasAtribuidas: boolean;
  /** Resumo do dia na primeira vez que o app abre. */
  resumoDia: boolean;
  /** Também mostra a notificação do Windows/Linux com o app fora de foco. */
  sistema: boolean;
};

export const PREFERENCIAS_PADRAO: PreferenciasAvisos = {
  retornos: true,
  riscoFaltas: true,
  eventos: true,
  tarefasAtribuidas: true,
  resumoDia: true,
  sistema: false,
};

export function carregarPreferenciasAvisos(): PreferenciasAvisos {
  try {
    const bruto = localStorage.getItem(PREFERENCIAS_AVISOS_KEY);
    const salvas = bruto ? (JSON.parse(bruto) as Partial<PreferenciasAvisos>) : {};
    return { ...PREFERENCIAS_PADRAO, ...salvas };
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}

export function salvarPreferenciasAvisos(preferencias: PreferenciasAvisos) {
  try {
    localStorage.setItem(PREFERENCIAS_AVISOS_KEY, JSON.stringify(preferencias));
  } catch {
    /* sem localStorage, vale o padrão */
  }
  window.dispatchEvent(new CustomEvent(PREFERENCIAS_AVISOS_EVENT));
}
