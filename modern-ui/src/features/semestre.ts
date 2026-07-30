// Semestre ativo (institucional) — compartilhado por Planejamento e PEI, que
// usam o mesmo par de prazos para decidir qual semestre (1º/2º bimestre ou
// 3º/4º) está em curso, para colorir seus indicadores de status de entrega.

export type PrazosSemestre = {
  prazo_1_semestre: string;
  prazo_2_semestre: string;
};

export type SemestreAtivo = { bimestres: string[] } | null;

// Até o prazo do 1º semestre (inclusive), avalia os bimestres 1 e 2; depois,
// passa a avaliar os bimestres 3 e 4. Sem prazo configurado, não há como
// saber qual semestre olhar — retorna null (os chamadores caem num
// indicador mais simples, sem distinguir bimestre).
export function semestreAtivo(prazos: PrazosSemestre): SemestreAtivo {
  const prazo1 = prazos.prazo_1_semestre.trim();
  if (!prazo1) return null;
  const dataPrazo1 = new Date(`${prazo1}T23:59:59`);
  if (Number.isNaN(dataPrazo1.getTime())) return null;
  return new Date() > dataPrazo1 ? { bimestres: ["3", "4"] } : { bimestres: ["1", "2"] };
}
