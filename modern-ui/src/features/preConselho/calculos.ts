// Cálculos do pré-conselho: média global de cada bimestre, disciplinas abaixo
// de 5 e a lista de alunos que entram na pauta. Tudo puro — a tela só desenha.

export const NOTA_MINIMA = 5;
export const FREQUENCIA_MINIMA = 75;
export const BIMESTRES = [1, 2, 3, 4] as const;

export type NotaBimestrePre = { bimestre: string; media: number; media_mapao?: number | null };

export type DisciplinaPre = {
  nome: string;
  mediaOriginal: number | null;
  mediaConselho: number | null;
  faltasAcumuladas?: number | null;
  totalAulasAcumuladas?: number | null;
  historicoBimestres?: NotaBimestrePre[];
};

export type AlunoPre = {
  matricula?: string;
  chamada: number;
  nome: string;
  ativo?: boolean;
  frequencia: number | null;
  disciplinas: DisciplinaPre[];
};

export type Decisao = "aprovacao" | "reprovacao";

/** Registro salvo de um aluno no pré-conselho do bimestre. */
export type RegistroAlunoPre = {
  /** Incluído à mão (pedido dos professores). */
  incluido?: boolean;
  /** Retirado da lista automática. */
  removido?: boolean;
  decisao?: Decisao | null;
  observacao?: string;
};

export type DadosPreConselho = {
  alunos?: Record<string, RegistroAlunoPre>;
};

export type LinhaPreConselho = {
  chave: string;
  aluno: AlunoPre;
  /** Média global de cada bimestre (média das disciplinas daquele bimestre). */
  mediasBimestre: Array<number | null>;
  /** Quantas disciplinas ficaram abaixo de 5 em cada bimestre. */
  abaixoBimestre: number[];
  /** Média global do ano até o bimestre do pré-conselho. */
  mediaAno: number | null;
  /** Disciplinas com média do ano abaixo de 5, com a média. */
  disciplinasAbaixoAno: { nome: string; media: number }[];
  automatico: boolean;
  registro: RegistroAlunoPre;
};

function finito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((total, valor) => total + valor, 0) / valores.length : null;
}

export function chaveAluno(aluno: Pick<AlunoPre, "matricula" | "nome">) {
  const ra = aluno.matricula?.trim();
  return ra ? ra : `nome:${aluno.nome.trim().toLocaleUpperCase("pt-BR")}`;
}

/**
 * Nota de cada bimestre (1..4) de uma disciplina, até o bimestre do
 * pré-conselho. A nota do conselho vale sobre a do mapão.
 */
export function notasDisciplina(disciplina: DisciplinaPre, bimestreAtual: number): Array<number | null> {
  const notas: Array<number | null> = [null, null, null, null];
  for (const hb of disciplina.historicoBimestres ?? []) {
    const idx = Number.parseInt(hb.bimestre, 10) - 1;
    if (idx >= 0 && idx < 4 && finito(hb.media)) notas[idx] = hb.media;
  }
  const atual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
  if (finito(atual) && bimestreAtual >= 1 && bimestreAtual <= 4) notas[bimestreAtual - 1] = atual;
  return notas.map((nota, idx) => (idx < bimestreAtual ? nota : null));
}

export function mediaAnualDisciplina(disciplina: DisciplinaPre, bimestreAtual: number) {
  return media(notasDisciplina(disciplina, bimestreAtual).filter(finito));
}

export function calcularLinha(aluno: AlunoPre, bimestreAtual: number, registro: RegistroAlunoPre = {}): LinhaPreConselho {
  const porDisciplina = aluno.disciplinas.map((d) => notasDisciplina(d, bimestreAtual));
  const mediasBimestre = BIMESTRES.map((_, idx) => media(porDisciplina.map((n) => n[idx]).filter(finito)));
  const abaixoBimestre = BIMESTRES.map(
    (_, idx) => porDisciplina.filter((n) => finito(n[idx]) && (n[idx] as number) < NOTA_MINIMA).length,
  );
  const mediasAnuais = aluno.disciplinas.map((d) => ({ nome: d.nome, media: mediaAnualDisciplina(d, bimestreAtual) }));
  const mediaAno = media(mediasAnuais.map((d) => d.media).filter(finito));
  const disciplinasAbaixoAno = mediasAnuais
    .filter((d): d is { nome: string; media: number } => finito(d.media) && d.media < NOTA_MINIMA)
    .sort((a, b) => a.media - b.media);
  return {
    chave: chaveAluno(aluno),
    aluno,
    mediasBimestre,
    abaixoBimestre,
    mediaAno,
    disciplinasAbaixoAno,
    automatico: mediaAno !== null && mediaAno < NOTA_MINIMA,
    registro,
  };
}

/**
 * Lista do pré-conselho: alunos ativos com média global do ano abaixo de 5
 * (menos os retirados) e os incluídos à mão, em ordem de chamada.
 */
export function montarLista(alunos: AlunoPre[], bimestreAtual: number, dados: DadosPreConselho) {
  const registros = dados.alunos ?? {};
  return alunos
    .filter((aluno) => aluno.ativo !== false)
    .map((aluno) => calcularLinha(aluno, bimestreAtual, registros[chaveAluno(aluno)] ?? {}))
    .filter((linha) => (linha.automatico && !linha.registro.removido) || linha.registro.incluido)
    .sort((a, b) => a.aluno.chamada - b.aluno.chamada || a.aluno.nome.localeCompare(b.aluno.nome, "pt-BR"));
}

export function formatarNota(valor: number | null | undefined) {
  if (!finito(valor)) return "-";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function classeNota(valor: number | null | undefined) {
  if (!finito(valor)) return "sem-nota";
  if (valor < NOTA_MINIMA) return "abaixo";
  if (valor < 6) return "cuidado";
  return "adequada";
}

// ---------------------------------------------------------------------------
// Medidas pedagógicas sugeridas para a ata
// ---------------------------------------------------------------------------

/**
 * Caso de aprovação: o aluno ainda pode recompor as aprendizagens. As medidas
 * são de recuperação, por disciplina abaixo de 5.
 */
/** Disciplinas a trabalhar: abaixo de 5 no ano ou, se não houver, no último bimestre. */
function disciplinasFoco(linha: LinhaPreConselho, bimestreAtual: number): string[] {
  if (linha.disciplinasAbaixoAno.length) return linha.disciplinasAbaixoAno.map((d) => d.nome);
  return linha.aluno.disciplinas
    .filter((d) => {
      const nota = notasDisciplina(d, bimestreAtual)[bimestreAtual - 1];
      return finito(nota) && nota < NOTA_MINIMA;
    })
    .map((d) => d.nome);
}

export function medidasAprovacao(linha: LinhaPreConselho, bimestreAtual: number): string[] {
  const disciplinas = disciplinasFoco(linha, bimestreAtual);
  const lista = disciplinas.length ? disciplinas.join(", ") : "as disciplinas com menor desempenho";
  const medidas = [
    `Atividades pedagógicas complementares em ${lista}, com foco nas habilidades ainda não consolidadas e devolutiva comentada ao estudante.`,
    "Recuperação contínua em sala: retomada dos conteúdos, reagrupamento produtivo e acompanhamento individual durante as aulas.",
    "Recuperação paralela com cronograma combinado com o estudante, seguida de nova avaliação para recompor a nota.",
    "Uso das plataformas digitais da rede como reforço, com metas semanais acompanhadas pelo professor.",
    "Tutoria entre pares ou acompanhamento por professor de referência, com retorno quinzenal à coordenação.",
    "Contato com a família para combinar a rotina de estudos e o acompanhamento das atividades em casa.",
  ];
  if (finito(linha.aluno.frequencia) && linha.aluno.frequencia < FREQUENCIA_MINIMA) {
    medidas.push("Busca ativa e acompanhamento da frequência, com registro dos contatos realizados.");
  }
  return medidas;
}

/**
 * Caso de reprovação: as medidas garantem que o percurso do estudante fique
 * documentado e que ele receba as mesmas oportunidades da turma. Os critérios
 * de avaliação são os mesmos para todos.
 */
export function medidasReprovacao(linha: LinhaPreConselho, bimestreAtual: number): string[] {
  const disciplinas = disciplinasFoco(linha, bimestreAtual);
  const lista = disciplinas.length ? ` em ${disciplinas.join(", ")}` : "";
  const medidas = [
    `Registro sistemático, no Diário de Classe, de todas as atividades e avaliações propostas${lista}, com data e indicação de entrega ou não entrega.`,
    "Oferta formal de recuperação contínua e paralela, com atividades e prazos definidos e registro da participação ou ausência do estudante.",
    "Avaliação com os mesmos critérios e instrumentos aplicados à turma, com critérios de correção explícitos e devolutiva por escrito.",
    "Convocação dos responsáveis, com registro em ata da ciência sobre o desempenho e as oportunidades de recuperação oferecidas.",
    "Acompanhamento pela coordenação, com registro dos atendimentos e das orientações dadas ao estudante.",
    "Reunião das evidências (atividades, avaliações, recuperações e contatos) para análise do caso no conselho de classe.",
  ];
  if (finito(linha.aluno.frequencia) && linha.aluno.frequencia < FREQUENCIA_MINIMA) {
    medidas.splice(1, 0, "Registro da frequência e busca ativa, com documentação dos contatos com a família sobre as faltas.");
  }
  return medidas;
}
