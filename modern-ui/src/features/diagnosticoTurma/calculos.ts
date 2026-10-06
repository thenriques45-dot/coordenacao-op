// Cálculos do Relatório Diagnóstico da Turma: transforma os dados que o app
// já reúne (notas, frequência, Prova Paulista, diagnóstico SARESP, tarefas,
// atendimentos e conselho) em indicadores, rankings e alertas da turma.
// Tudo aqui é puro — a tela só desenha o resultado.

export type NotaBimestreDiag = { bimestre: string; media: number };

export type DisciplinaDiag = {
  nome: string;
  mediaOriginal: number | null;
  mediaConselho: number | null;
  faltas?: number | null;
  totalAulas?: number | null;
  faltasAcumuladas?: number | null;
  totalAulasAcumuladas?: number | null;
  historicoBimestres?: NotaBimestreDiag[];
};

export type ComponenteSaresp = {
  status: string | null;
  evolucao: string | null;
  mensurado: boolean;
};

export type AlunoDiag = {
  matricula?: string;
  chamada: number;
  nome: string;
  ativo?: boolean;
  elegivel: boolean;
  deficiencias: string[];
  frequencia: number | null;
  encaminhamentosBimestres?: { bimestre: string; codigos: number[] }[];
  atendimentos?: { data: string; tipos: string[] }[];
  diagnosticoAprendizagem?: { portugues: ComponenteSaresp; matematica: ComponenteSaresp } | null;
  disciplinas: DisciplinaDiag[];
};

type ProvaPaulistaBimestre = { participou?: boolean; geral?: number; disciplinas?: Record<string, number> };
type TarefasBimestre = { feitas?: number; total?: number; percentual?: number };

/** Resposta do comando `carregar_indicadores_diagnostico_turma`. */
export type IndicadoresExtras = {
  alunos: Record<string, { prova_paulista?: Record<string, ProvaPaulistaBimestre>; tarefas?: Record<string, TarefasBimestre> }>;
  perfil_turma: Record<string, Record<string, string>>;
  alunos_destaque: Record<string, Record<string, string>>;
};

export const EXTRAS_VAZIOS: IndicadoresExtras = { alunos: {}, perfil_turma: {}, alunos_destaque: {} };

export type Tom = "bom" | "atencao" | "critico" | "neutro";

export const BIMESTRES = ["1", "2", "3", "4"] as const;

// Limites usados nas cores e nos alertas.
export const FREQ_CRITICA = 75; // abaixo disso há risco de retenção por falta
export const FREQ_ATENCAO = 85;
export const NOTA_MINIMA = 5;
export const NOTA_BOA = 7;
export const PP_CRITICA = 40; // % de acertos na Prova Paulista
export const PP_BOA = 60;

export function tomNota(nota: number | null | undefined): Tom {
  if (nota === null || nota === undefined || !Number.isFinite(nota)) return "neutro";
  if (nota < NOTA_MINIMA) return "critico";
  if (nota < 6) return "atencao";
  return "bom";
}

export function tomFrequencia(freq: number | null | undefined): Tom {
  if (freq === null || freq === undefined || !Number.isFinite(freq)) return "neutro";
  if (freq < FREQ_CRITICA) return "critico";
  if (freq < FREQ_ATENCAO) return "atencao";
  return "bom";
}

export function tomProvaPaulista(percentual: number | null | undefined): Tom {
  if (percentual === null || percentual === undefined || !Number.isFinite(percentual)) return "neutro";
  if (percentual < PP_CRITICA) return "critico";
  if (percentual < PP_BOA) return "atencao";
  return "bom";
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

function finito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function semAcento(valor: string) {
  return valor.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Nota de cada bimestre (1..4) de uma disciplina; a nota do conselho vale sobre a original. */
export function notasPorBimestre(disciplina: DisciplinaDiag, bimestreAtual: number): Array<number | null> {
  const notas: Array<number | null> = [null, null, null, null];
  for (const hb of disciplina.historicoBimestres ?? []) {
    const idx = Number.parseInt(hb.bimestre, 10) - 1;
    if (idx >= 0 && idx < 4 && finito(hb.media)) notas[idx] = hb.media;
  }
  const atual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
  if (finito(atual)) notas[bimestreAtual - 1] = atual;
  return notas;
}

// ---------------------------------------------------------------------------
// Prova Paulista
// ---------------------------------------------------------------------------

/**
 * O importador grava "% de acertos × 10" arredondado. Conforme a planilha traz
 * o percentual como fração (0,65) ou como número (65), o valor salvo fica na
 * faixa 0–10 ou 0–1000. A escala é decidida pelo conjunto da turma e tudo é
 * convertido para % de acertos (0–100).
 */
export function fatorEscalaProvaPaulista(valores: number[]): number {
  const maximo = Math.max(0, ...valores);
  if (maximo <= 10) return 10;
  if (maximo <= 100) return 1;
  return 0.1;
}

// ---------------------------------------------------------------------------
// SARESP / avaliações diagnósticas
// ---------------------------------------------------------------------------

export type NivelSaresp = "abaixo" | "basico" | "adequado" | "avancado" | "nao";

export const NIVEIS_SARESP: { id: NivelSaresp; rotulo: string }[] = [
  { id: "abaixo", rotulo: "Abaixo do básico" },
  { id: "basico", rotulo: "Básico" },
  { id: "adequado", rotulo: "Adequado" },
  { id: "avancado", rotulo: "Avançado" },
  { id: "nao", rotulo: "Não mensurado" },
];

export function nivelSaresp(componente: ComponenteSaresp | null | undefined): NivelSaresp {
  if (!componente || !componente.mensurado || !componente.status) return "nao";
  const texto = semAcento(componente.status);
  if (texto.includes("abaixo")) return "abaixo";
  if (texto.includes("avanc")) return "avancado";
  if (texto.includes("adequ") || texto.includes("profic")) return "adequado";
  if (texto.includes("basic")) return "basico";
  return "nao";
}

export type EvolucaoSaresp = "avancou" | "manteve" | "regrediu" | "sem";

export function evolucaoSaresp(componente: ComponenteSaresp | null | undefined): EvolucaoSaresp {
  const texto = componente?.evolucao ? semAcento(componente.evolucao) : "";
  if (!texto) return "sem";
  if (texto.includes("avanc")) return "avancou";
  if (texto.includes("regred")) return "regrediu";
  return "manteve";
}

// ---------------------------------------------------------------------------
// Indicadores por aluno
// ---------------------------------------------------------------------------

export type IndicadorAluno = {
  chave: string;
  nome: string;
  chamada: number;
  elegivel: boolean;
  frequencia: number | null;
  faltasTotal: number | null;
  disciplinaMaisFaltas: { nome: string; frequencia: number } | null;
  notasAtuais: Record<string, number | null>;
  mediaPorBimestre: Array<number | null>;
  mediaAtual: number | null;
  disciplinasAbaixo: string[];
  variacaoNotas: number | null; // média do bimestre atual − média do anterior com nota
  pp: { bimestre: string; percentual: number | null; participou: boolean }[];
  ppUltimo: number | null;
  ppPrimeiro: number | null;
  ppVariacao: number | null;
  ppBimestresComparados: [string, string] | null;
  sarespPortugues: NivelSaresp;
  sarespMatematica: NivelSaresp;
  evolucaoPortugues: EvolucaoSaresp;
  evolucaoMatematica: EvolucaoSaresp;
  tarefasPercentual: number | null;
  atendimentos: number;
  encaminhamentosBimestre: number;
  pontuacaoRisco: number;
  motivosRisco: { texto: string; tom: Tom }[];
};

export type DesempenhoDisciplina = {
  nome: string;
  media: number | null;
  percentualAbaixo: number; // % dos alunos com nota que estão abaixo da mínima
  alunosComNota: number;
  frequencia: number | null;
  mediaPorBimestre: Array<number | null>;
};

export type Alerta = { tom: Tom; titulo: string; texto: string };

export type DiagnosticoTurma = {
  bimestreAtual: number;
  totalAlunos: number;
  alunos: IndicadorAluno[];
  disciplinas: DesempenhoDisciplina[];
  mediaTurma: number | null;
  mediaTurmaPorBimestre: Array<number | null>;
  frequenciaMedia: number | null;
  situacao: { adequados: number; atencao: number; criticos: number; semNota: number };
  faixasFrequencia: { bom: number; atencao: number; critico: number; semDado: number };
  provaPaulista: {
    temDados: boolean;
    porBimestre: { bimestre: string; media: number | null; participacao: number | null }[];
    disciplinasUltimo: { nome: string; media: number }[];
    bimestreUltimo: string | null;
  };
  saresp: {
    temDados: boolean;
    portugues: Record<NivelSaresp, number>;
    matematica: Record<NivelSaresp, number>;
    evolucaoPortugues: Record<EvolucaoSaresp, number>;
    evolucaoMatematica: Record<EvolucaoSaresp, number>;
  };
  tarefasMedia: number | null;
  elegiveis: number;
  totalAtendimentos: number;
  alunosComEncaminhamento: number;
  perfil: { bimestre: string; apontamentos: Record<string, string> } | null;
  destaques: { bimestre: string; nomes: Record<string, string> } | null;
  pontosAtencao: Alerta[];
  pontosPositivos: Alerta[];
  sugestoes: string[];
};

function contagemVazia<T extends string>(chaves: readonly T[]): Record<T, number> {
  return Object.fromEntries(chaves.map((chave) => [chave, 0])) as Record<T, number>;
}

function ultimoBimestreComDados(
  porBimestre: Record<string, Record<string, string>>,
  bimestreAtual: number,
): { bimestre: string; valores: Record<string, string> } | null {
  for (let b = bimestreAtual; b >= 1; b -= 1) {
    const valores = porBimestre[String(b)];
    if (valores && Object.values(valores).some((v) => typeof v === "string" && v.trim())) {
      return { bimestre: String(b), valores };
    }
  }
  return null;
}

function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length <= 2) return nome.trim();
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

function listaNomes(alunos: IndicadorAluno[], limite = 4) {
  const nomes = alunos.slice(0, limite).map((a) => nomeCurto(a.nome));
  const resto = alunos.length - nomes.length;
  return resto > 0 ? `${nomes.join(", ")} e mais ${resto}` : nomes.join(", ");
}

function pct(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

export function calcularDiagnostico(
  alunosEntrada: AlunoDiag[],
  extras: IndicadoresExtras,
  bimestre: string | null | undefined,
): DiagnosticoTurma {
  const bimestreAtual = Math.max(1, Math.min(4, Number.parseInt(bimestre ?? "1", 10) || 1));
  const idxAtual = bimestreAtual - 1;
  const alunosAtivos = alunosEntrada.filter((aluno) => aluno.ativo !== false);

  // Escala da Prova Paulista decidida pela turma inteira.
  const valoresPP: number[] = [];
  for (const aluno of alunosAtivos) {
    const prova = extras.alunos[aluno.matricula ?? ""]?.prova_paulista ?? {};
    for (const entrada of Object.values(prova)) {
      if (finito(entrada?.geral)) valoresPP.push(entrada.geral);
      for (const v of Object.values(entrada?.disciplinas ?? {})) if (finito(v)) valoresPP.push(v);
    }
  }
  const fatorPP = fatorEscalaProvaPaulista(valoresPP);
  const paraPercentual = (valor: number | undefined | null) =>
    finito(valor) ? Math.max(0, Math.min(100, valor * fatorPP)) : null;

  const nomesDisciplinas = Array.from(
    new Set(alunosAtivos.flatMap((aluno) => aluno.disciplinas.map((d) => d.nome))),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const alunos: IndicadorAluno[] = alunosAtivos.map((aluno) => {
    const chave = aluno.matricula ?? aluno.nome;
    const extrasAluno = extras.alunos[aluno.matricula ?? ""] ?? {};

    // Notas
    const notasAtuais: Record<string, number | null> = {};
    const porBim: number[][] = [[], [], [], []];
    for (const disciplina of aluno.disciplinas) {
      const notas = notasPorBimestre(disciplina, bimestreAtual);
      notasAtuais[disciplina.nome] = notas[idxAtual];
      notas.forEach((nota, idx) => {
        if (nota !== null) porBim[idx].push(nota);
      });
    }
    const mediaPorBimestre = porBim.map((lista) => media(lista));
    let mediaAtual = mediaPorBimestre[idxAtual];
    if (mediaAtual === null) {
      for (let i = idxAtual - 1; i >= 0 && mediaAtual === null; i -= 1) mediaAtual = mediaPorBimestre[i];
    }
    const disciplinasAbaixo = Object.entries(notasAtuais)
      .filter(([, nota]) => finito(nota) && nota < NOTA_MINIMA)
      .map(([nome]) => nome);
    let variacaoNotas: number | null = null;
    const atualBim = mediaPorBimestre[idxAtual];
    if (atualBim !== null) {
      for (let i = idxAtual - 1; i >= 0; i -= 1) {
        const anterior = mediaPorBimestre[i];
        if (anterior !== null) {
          variacaoNotas = atualBim - anterior;
          break;
        }
      }
    }

    // Faltas
    let faltasTotal: number | null = null;
    let disciplinaMaisFaltas: IndicadorAluno["disciplinaMaisFaltas"] = null;
    for (const disciplina of aluno.disciplinas) {
      const faltas = disciplina.faltasAcumuladas ?? disciplina.faltas;
      const aulas = disciplina.totalAulasAcumuladas ?? disciplina.totalAulas;
      if (finito(faltas)) faltasTotal = (faltasTotal ?? 0) + faltas;
      if (finito(faltas) && finito(aulas) && aulas > 0) {
        const freq = Math.max(0, Math.min(100, ((aulas - faltas) / aulas) * 100));
        if (!disciplinaMaisFaltas || freq < disciplinaMaisFaltas.frequencia) {
          disciplinaMaisFaltas = { nome: disciplina.nome, frequencia: freq };
        }
      }
    }

    // Prova Paulista
    const prova = extrasAluno.prova_paulista ?? {};
    const pp = BIMESTRES.filter((b) => prova[b]).map((b) => ({
      bimestre: b,
      percentual: paraPercentual(prova[b]?.geral),
      participou: prova[b]?.participou !== false,
    }));
    const ppComNota = pp.filter((item) => item.percentual !== null);
    const ppPrimeiro = ppComNota.length ? ppComNota[0].percentual : null;
    const ppUltimo = ppComNota.length ? ppComNota[ppComNota.length - 1].percentual : null;
    const ppVariacao = ppComNota.length >= 2 && ppPrimeiro !== null && ppUltimo !== null ? ppUltimo - ppPrimeiro : null;
    const ppBimestresComparados: [string, string] | null =
      ppComNota.length >= 2 ? [ppComNota[0].bimestre, ppComNota[ppComNota.length - 1].bimestre] : null;

    // Tarefas: bimestre atual, ou o último anterior com registro.
    let tarefasPercentual: number | null = null;
    for (let b = bimestreAtual; b >= 1 && tarefasPercentual === null; b -= 1) {
      const t = extrasAluno.tarefas?.[String(b)];
      if (t && finito(t.percentual)) tarefasPercentual = t.percentual;
      else if (t && finito(t.feitas) && finito(t.total) && t.total > 0) tarefasPercentual = (t.feitas / t.total) * 100;
    }

    const diag = aluno.diagnosticoAprendizagem;
    const sarespPortugues = nivelSaresp(diag?.portugues);
    const sarespMatematica = nivelSaresp(diag?.matematica);

    const encaminhamentosBimestre =
      aluno.encaminhamentosBimestres?.find((e) => e.bimestre === String(bimestreAtual))?.codigos.length ?? 0;

    // Pontuação de fragilidade: soma de sinais, cada um com seu motivo.
    const motivosRisco: IndicadorAluno["motivosRisco"] = [];
    let pontuacaoRisco = 0;
    if (disciplinasAbaixo.length) {
      pontuacaoRisco += disciplinasAbaixo.length * 2;
      motivosRisco.push({
        texto: `${disciplinasAbaixo.length} disciplina${disciplinasAbaixo.length > 1 ? "s" : ""} abaixo de ${NOTA_MINIMA}`,
        tom: disciplinasAbaixo.length >= 3 ? "critico" : "atencao",
      });
    }
    if (mediaAtual !== null && mediaAtual < NOTA_MINIMA) {
      pontuacaoRisco += 3;
      motivosRisco.push({ texto: "média geral abaixo de 5", tom: "critico" });
    }
    if (finito(aluno.frequencia) && aluno.frequencia < FREQ_CRITICA) {
      pontuacaoRisco += 3;
      motivosRisco.push({ texto: `frequência ${Math.round(aluno.frequencia)}%`, tom: "critico" });
    } else if (finito(aluno.frequencia) && aluno.frequencia < FREQ_ATENCAO) {
      pontuacaoRisco += 1;
      motivosRisco.push({ texto: `frequência ${Math.round(aluno.frequencia)}%`, tom: "atencao" });
    }
    if (sarespPortugues === "abaixo") {
      pontuacaoRisco += 2;
      motivosRisco.push({ texto: "LP abaixo do básico", tom: "critico" });
    }
    if (sarespMatematica === "abaixo") {
      pontuacaoRisco += 2;
      motivosRisco.push({ texto: "MAT abaixo do básico", tom: "critico" });
    }
    if (ppUltimo !== null && ppUltimo < PP_CRITICA) {
      pontuacaoRisco += 2;
      motivosRisco.push({ texto: `Prova Paulista ${Math.round(ppUltimo)}%`, tom: "critico" });
    }
    if (tarefasPercentual !== null && tarefasPercentual < 50) {
      pontuacaoRisco += 1;
      motivosRisco.push({ texto: `tarefas ${Math.round(tarefasPercentual)}%`, tom: "atencao" });
    }

    return {
      chave,
      nome: aluno.nome,
      chamada: aluno.chamada,
      elegivel: aluno.elegivel,
      frequencia: finito(aluno.frequencia) ? aluno.frequencia : null,
      faltasTotal,
      disciplinaMaisFaltas,
      notasAtuais,
      mediaPorBimestre,
      mediaAtual,
      disciplinasAbaixo,
      variacaoNotas,
      pp,
      ppUltimo,
      ppPrimeiro,
      ppVariacao,
      ppBimestresComparados,
      sarespPortugues,
      sarespMatematica,
      evolucaoPortugues: evolucaoSaresp(diag?.portugues),
      evolucaoMatematica: evolucaoSaresp(diag?.matematica),
      tarefasPercentual,
      atendimentos: aluno.atendimentos?.length ?? 0,
      encaminhamentosBimestre,
      pontuacaoRisco,
      motivosRisco,
    };
  });

  // Disciplinas
  const disciplinas: DesempenhoDisciplina[] = nomesDisciplinas.map((nome) => {
    const notas: number[] = [];
    const porBim: number[][] = [[], [], [], []];
    let faltas = 0;
    let aulas = 0;
    for (const aluno of alunosAtivos) {
      const disciplina = aluno.disciplinas.find((d) => d.nome === nome);
      if (!disciplina) continue;
      const notasBim = notasPorBimestre(disciplina, bimestreAtual);
      const atual = notasBim[idxAtual];
      if (atual !== null) notas.push(atual);
      notasBim.forEach((n, i) => {
        if (n !== null) porBim[i].push(n);
      });
      const f = disciplina.faltasAcumuladas ?? disciplina.faltas;
      const a = disciplina.totalAulasAcumuladas ?? disciplina.totalAulas;
      if (finito(f) && finito(a) && a > 0) {
        faltas += f;
        aulas += a;
      }
    }
    return {
      nome,
      media: media(notas),
      percentualAbaixo: pct(notas.filter((n) => n < NOTA_MINIMA).length, notas.length),
      alunosComNota: notas.length,
      frequencia: aulas > 0 ? Math.max(0, ((aulas - faltas) / aulas) * 100) : null,
      mediaPorBimestre: porBim.map((lista) => media(lista)),
    };
  });

  const mediasAlunos = alunos.map((a) => a.mediaAtual).filter(finito);
  const mediaTurma = media(mediasAlunos);
  const mediaTurmaPorBimestre = [0, 1, 2, 3].map((i) => media(alunos.map((a) => a.mediaPorBimestre[i]).filter(finito)));
  const frequencias = alunos.map((a) => a.frequencia).filter(finito);
  const frequenciaMedia = media(frequencias);

  const situacao = { adequados: 0, atencao: 0, criticos: 0, semNota: 0 };
  for (const aluno of alunos) {
    if (aluno.mediaAtual === null) situacao.semNota += 1;
    else {
      const arredondada = Math.floor(aluno.mediaAtual + 0.5);
      if (arredondada < NOTA_MINIMA) situacao.criticos += 1;
      else if (arredondada === NOTA_MINIMA) situacao.atencao += 1;
      else situacao.adequados += 1;
    }
  }

  const faixasFrequencia = { bom: 0, atencao: 0, critico: 0, semDado: 0 };
  for (const aluno of alunos) {
    const tom = tomFrequencia(aluno.frequencia);
    if (tom === "neutro") faixasFrequencia.semDado += 1;
    else faixasFrequencia[tom] += 1;
  }

  // Prova Paulista da turma
  const ppPorBimestre = BIMESTRES.map((b) => {
    const registros = alunos.flatMap((a) => a.pp.filter((p) => p.bimestre === b));
    const notas = registros.map((r) => r.percentual).filter(finito);
    return {
      bimestre: b,
      media: media(notas),
      participacao: registros.length ? pct(registros.filter((r) => r.participou).length, alunos.length) : null,
    };
  });
  const bimestreUltimoPP = [...ppPorBimestre].reverse().find((p) => p.media !== null)?.bimestre ?? null;
  const disciplinasPP: Record<string, number[]> = {};
  if (bimestreUltimoPP) {
    for (const aluno of alunosAtivos) {
      const entrada = extras.alunos[aluno.matricula ?? ""]?.prova_paulista?.[bimestreUltimoPP];
      for (const [disc, valor] of Object.entries(entrada?.disciplinas ?? {})) {
        const p = paraPercentual(valor);
        if (p !== null) (disciplinasPP[disc] ??= []).push(p);
      }
    }
  }
  const disciplinasUltimo = Object.entries(disciplinasPP)
    .map(([nome, valores]) => ({ nome, media: media(valores) ?? 0 }))
    .sort((a, b) => a.media - b.media);

  // SARESP
  const chavesNivel = NIVEIS_SARESP.map((n) => n.id);
  const chavesEvolucao = ["avancou", "manteve", "regrediu", "sem"] as const;
  const saresp = {
    temDados: false,
    portugues: contagemVazia(chavesNivel),
    matematica: contagemVazia(chavesNivel),
    evolucaoPortugues: contagemVazia(chavesEvolucao),
    evolucaoMatematica: contagemVazia(chavesEvolucao),
  };
  for (const aluno of alunos) {
    saresp.portugues[aluno.sarespPortugues] += 1;
    saresp.matematica[aluno.sarespMatematica] += 1;
    saresp.evolucaoPortugues[aluno.evolucaoPortugues] += 1;
    saresp.evolucaoMatematica[aluno.evolucaoMatematica] += 1;
  }
  saresp.temDados = alunos.length - saresp.portugues.nao > 0 || alunos.length - saresp.matematica.nao > 0;

  const tarefas = alunos.map((a) => a.tarefasPercentual).filter(finito);
  const perfilUltimo = ultimoBimestreComDados(extras.perfil_turma ?? {}, bimestreAtual);
  const destaquesUltimo = ultimoBimestreComDados(extras.alunos_destaque ?? {}, bimestreAtual);

  const total = alunos.length;
  const diagnostico: DiagnosticoTurma = {
    bimestreAtual,
    totalAlunos: total,
    alunos,
    disciplinas,
    mediaTurma,
    mediaTurmaPorBimestre,
    frequenciaMedia,
    situacao,
    faixasFrequencia,
    provaPaulista: {
      temDados: ppPorBimestre.some((p) => p.media !== null),
      porBimestre: ppPorBimestre,
      disciplinasUltimo,
      bimestreUltimo: bimestreUltimoPP,
    },
    saresp,
    tarefasMedia: media(tarefas),
    elegiveis: alunos.filter((a) => a.elegivel).length,
    totalAtendimentos: alunos.reduce((s, a) => s + a.atendimentos, 0),
    alunosComEncaminhamento: alunos.filter((a) => a.encaminhamentosBimestre > 0).length,
    perfil: perfilUltimo ? { bimestre: perfilUltimo.bimestre, apontamentos: perfilUltimo.valores } : null,
    destaques: destaquesUltimo ? { bimestre: destaquesUltimo.bimestre, nomes: destaquesUltimo.valores } : null,
    pontosAtencao: [],
    pontosPositivos: [],
    sugestoes: [],
  };
  montarLeitura(diagnostico);
  return diagnostico;
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

export function rankingFaltas(diag: DiagnosticoTurma, limite: number) {
  return diag.alunos
    .filter((a) => a.frequencia !== null && a.frequencia < 100)
    .sort((a, b) => (a.frequencia ?? 100) - (b.frequencia ?? 100) || (b.faltasTotal ?? 0) - (a.faltasTotal ?? 0))
    .slice(0, limite);
}

export function rankingFragilidade(diag: DiagnosticoTurma, limite: number) {
  return diag.alunos
    .filter((a) => a.pontuacaoRisco > 0)
    .sort((a, b) => b.pontuacaoRisco - a.pontuacaoRisco || (a.mediaAtual ?? 10) - (b.mediaAtual ?? 10))
    .slice(0, limite);
}

export function rankingEvolucaoPP(diag: DiagnosticoTurma, limite: number) {
  return diag.alunos
    .filter((a) => a.ppVariacao !== null && a.ppVariacao > 0)
    .sort((a, b) => (b.ppVariacao ?? 0) - (a.ppVariacao ?? 0))
    .slice(0, limite);
}

export function rankingQuedaPP(diag: DiagnosticoTurma, limite: number) {
  return diag.alunos
    .filter((a) => a.ppVariacao !== null && a.ppVariacao < 0)
    .sort((a, b) => (a.ppVariacao ?? 0) - (b.ppVariacao ?? 0))
    .slice(0, limite);
}

export function rankingMelhoresMedias(diag: DiagnosticoTurma, limite: number) {
  return diag.alunos
    .filter((a) => a.mediaAtual !== null && a.mediaAtual >= NOTA_BOA)
    .sort((a, b) => (b.mediaAtual ?? 0) - (a.mediaAtual ?? 0))
    .slice(0, limite);
}

export function rankingEvolucaoNotas(diag: DiagnosticoTurma, limite: number) {
  return diag.alunos
    .filter((a) => a.variacaoNotas !== null && a.variacaoNotas >= 0.5)
    .sort((a, b) => (b.variacaoNotas ?? 0) - (a.variacaoNotas ?? 0))
    .slice(0, limite);
}

// ---------------------------------------------------------------------------
// Leitura automática: pontos de atenção, pontos positivos e sugestões
// ---------------------------------------------------------------------------

function fmt(valor: number, casas = 1) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function montarLeitura(diag: DiagnosticoTurma) {
  const { alunos, totalAlunos: total } = diag;
  const atencao: Alerta[] = [];
  const positivos: Alerta[] = [];
  const sugestoes: string[] = [];
  if (!total) return;

  // Frequência
  const criticosFreq = alunos.filter((a) => tomFrequencia(a.frequencia) === "critico").sort((a, b) => (a.frequencia ?? 0) - (b.frequencia ?? 0));
  if (criticosFreq.length) {
    atencao.push({
      tom: "critico",
      titulo: `${criticosFreq.length} aluno${criticosFreq.length > 1 ? "s" : ""} com frequência abaixo de ${FREQ_CRITICA}%`,
      texto: `Risco de retenção por falta: ${listaNomes(criticosFreq)}.`,
    });
    sugestoes.push(
      `Busca ativa com as famílias dos ${criticosFreq.length} alunos abaixo de ${FREQ_CRITICA}% de frequência e combinado de compensação de ausências.`,
    );
  }
  if (diag.frequenciaMedia !== null && diag.frequenciaMedia >= 90) {
    positivos.push({ tom: "bom", titulo: `Frequência média de ${Math.round(diag.frequenciaMedia)}%`, texto: "A turma é assídua de forma geral." });
  }

  // Disciplinas
  const criticas = diag.disciplinas
    .filter((d) => d.alunosComNota > 0 && d.percentualAbaixo >= 30)
    .sort((a, b) => b.percentualAbaixo - a.percentualAbaixo);
  if (criticas.length) {
    atencao.push({
      tom: criticas[0].percentualAbaixo >= 50 ? "critico" : "atencao",
      titulo: `Disciplinas com muitos alunos abaixo de ${NOTA_MINIMA}`,
      texto: criticas.slice(0, 4).map((d) => `${d.nome} (${d.percentualAbaixo}%)`).join(", ") + ".",
    });
    sugestoes.push(
      `Planejar recuperação contínua em ${criticas.slice(0, 3).map((d) => d.nome).join(", ")}, com reagrupamento por dificuldade e monitoria entre pares.`,
    );
  }
  const fortes = diag.disciplinas
    .filter((d) => d.media !== null && d.media >= NOTA_BOA && d.percentualAbaixo < 15)
    .sort((a, b) => (b.media ?? 0) - (a.media ?? 0));
  if (fortes.length) {
    positivos.push({
      tom: "bom",
      titulo: "Disciplinas em que a turma vai bem",
      texto: fortes.slice(0, 4).map((d) => `${d.nome} (média ${fmt(d.media ?? 0)})`).join(", ") + ".",
    });
  }
  const freqBaixaDisc = diag.disciplinas.filter((d) => d.frequencia !== null && d.frequencia < FREQ_ATENCAO).sort((a, b) => (a.frequencia ?? 0) - (b.frequencia ?? 0));
  if (freqBaixaDisc.length) {
    atencao.push({
      tom: "atencao",
      titulo: "Disciplinas com mais ausências",
      texto: freqBaixaDisc.slice(0, 4).map((d) => `${d.nome} (${Math.round(d.frequencia ?? 0)}%)`).join(", ") + ". Vale olhar horário e dinâmica dessas aulas.",
    });
  }

  // Situação geral
  const pctCriticos = pct(diag.situacao.criticos, total);
  if (pctCriticos >= 20) {
    atencao.push({
      tom: "critico",
      titulo: `${pctCriticos}% da turma com média geral abaixo de ${NOTA_MINIMA}`,
      texto: "Fragilidade espalhada pela turma; pede ação coletiva, não só individual.",
    });
  }
  const multiplas = alunos.filter((a) => a.disciplinasAbaixo.length >= 3);
  if (multiplas.length) {
    atencao.push({
      tom: "critico",
      titulo: `${multiplas.length} aluno${multiplas.length > 1 ? "s" : ""} abaixo de ${NOTA_MINIMA} em 3 ou mais disciplinas`,
      texto: `${listaNomes(multiplas.sort((a, b) => b.disciplinasAbaixo.length - a.disciplinasAbaixo.length))}.`,
    });
    sugestoes.push("Plano individual de acompanhamento (tutoria) para os alunos com fragilidade em 3 ou mais disciplinas, com retorno quinzenal.");
  }
  if (diag.mediaTurma !== null && diag.mediaTurma >= NOTA_BOA) {
    positivos.push({ tom: "bom", titulo: `Média geral da turma ${fmt(diag.mediaTurma)}`, texto: "Desempenho acima do esperado." });
  }
  const evolucaoTurma = (() => {
    const atual = diag.mediaTurmaPorBimestre[diag.bimestreAtual - 1];
    for (let i = diag.bimestreAtual - 2; i >= 0; i -= 1) {
      const anterior = diag.mediaTurmaPorBimestre[i];
      if (anterior !== null && atual !== null) return { delta: atual - anterior, de: i + 1 };
    }
    return null;
  })();
  if (evolucaoTurma && evolucaoTurma.delta >= 0.3) {
    positivos.push({
      tom: "bom",
      titulo: `Média da turma subiu ${fmt(evolucaoTurma.delta)} ponto${evolucaoTurma.delta >= 2 ? "s" : ""}`,
      texto: `Em relação ao ${evolucaoTurma.de}º bimestre.`,
    });
  } else if (evolucaoTurma && evolucaoTurma.delta <= -0.3) {
    atencao.push({
      tom: "atencao",
      titulo: `Média da turma caiu ${fmt(Math.abs(evolucaoTurma.delta))} ponto${Math.abs(evolucaoTurma.delta) >= 2 ? "s" : ""}`,
      texto: `Em relação ao ${evolucaoTurma.de}º bimestre.`,
    });
  }

  // Prova Paulista
  if (diag.provaPaulista.temDados) {
    const ultimo = diag.provaPaulista.porBimestre.find((p) => p.bimestre === diag.provaPaulista.bimestreUltimo);
    if (ultimo?.media !== null && ultimo?.media !== undefined) {
      const tom = tomProvaPaulista(ultimo.media);
      const alerta = { tom, titulo: `Prova Paulista: ${Math.round(ultimo.media)}% de acertos em média`, texto: `Resultado do ${ultimo.bimestre}º bimestre.` };
      if (tom === "bom") positivos.push(alerta);
      else atencao.push(alerta);
    }
    const piores = diag.provaPaulista.disciplinasUltimo.filter((d) => d.media < PP_CRITICA);
    if (piores.length) {
      sugestoes.push(
        `Retomar habilidades de ${piores.slice(0, 3).map((d) => d.nome).join(", ")} a partir dos itens com menor acerto na Prova Paulista.`,
      );
    }
    const subiram = alunos.filter((a) => (a.ppVariacao ?? 0) >= 5).length;
    const cairam = alunos.filter((a) => (a.ppVariacao ?? 0) <= -5).length;
    if (subiram) positivos.push({ tom: "bom", titulo: `${subiram} aluno${subiram > 1 ? "s" : ""} melhoraram 5 p.p. ou mais na Prova Paulista`, texto: "Reconhecer o avanço em sala ajuda a manter o engajamento." });
    if (cairam) atencao.push({ tom: "atencao", titulo: `${cairam} aluno${cairam > 1 ? "s" : ""} caíram 5 p.p. ou mais na Prova Paulista`, texto: "Investigar se houve mudança de frequência, de rotina ou de engajamento." });
    const participacao = ultimo?.participacao;
    if (participacao !== null && participacao !== undefined && participacao < 85) {
      atencao.push({ tom: "atencao", titulo: `Participação de ${participacao}% na última Prova Paulista`, texto: "Ausências na avaliação reduzem a leitura diagnóstica da turma." });
    }
  }

  // SARESP
  if (diag.saresp.temDados) {
    for (const [rotulo, contagem] of [["Língua Portuguesa", diag.saresp.portugues], ["Matemática", diag.saresp.matematica]] as const) {
      const mensurados = total - contagem.nao;
      const pctAbaixo = pct(contagem.abaixo, mensurados);
      if (mensurados && pctAbaixo >= 30) {
        atencao.push({ tom: "critico", titulo: `${pctAbaixo}% abaixo do básico em ${rotulo}`, texto: "Diagnóstico das avaliações de aprendizagem." });
        sugestoes.push(`Trabalhar habilidades estruturantes de ${rotulo} (recomposição), com atividades em níveis e acompanhamento das Diagnósticas.`);
      }
      const pctAdequado = pct(contagem.adequado + contagem.avancado, mensurados);
      if (mensurados && pctAdequado >= 50) {
        positivos.push({ tom: "bom", titulo: `${pctAdequado}% adequado ou avançado em ${rotulo}`, texto: "Diagnóstico das avaliações de aprendizagem." });
      }
    }
    const avancaram = diag.saresp.evolucaoPortugues.avancou + diag.saresp.evolucaoMatematica.avancou;
    if (avancaram) positivos.push({ tom: "bom", titulo: `${avancaram} avanço${avancaram > 1 ? "s" : ""} de nível entre a Diagnóstica 1 e a 2`, texto: "Somando Língua Portuguesa e Matemática." });
  }

  // Tarefas
  if (diag.tarefasMedia !== null) {
    if (diag.tarefasMedia < 50) {
      atencao.push({ tom: "atencao", titulo: `Só ${Math.round(diag.tarefasMedia)}% das tarefas realizadas`, texto: "Média da turma nas plataformas." });
      sugestoes.push("Reservar momentos em aula para as tarefas das plataformas e acompanhar semanalmente quem não entregou.");
    } else if (diag.tarefasMedia >= 75) {
      positivos.push({ tom: "bom", titulo: `${Math.round(diag.tarefasMedia)}% das tarefas realizadas`, texto: "A turma mantém a rotina de tarefas." });
    }
  }

  if (diag.elegiveis) {
    sugestoes.push(`Garantir as adaptações previstas nos PEIs dos ${diag.elegiveis} estudante${diag.elegiveis > 1 ? "s" : ""} elegíve${diag.elegiveis > 1 ? "is" : "l"} da educação especial.`);
  }
  const quedaNotas = alunos.filter((a) => (a.variacaoNotas ?? 0) <= -1.5);
  if (quedaNotas.length) {
    atencao.push({
      tom: "atencao",
      titulo: `${quedaNotas.length} aluno${quedaNotas.length > 1 ? "s" : ""} com queda forte nas notas`,
      texto: `Média caiu 1,5 ponto ou mais em relação ao bimestre anterior: ${listaNomes(quedaNotas)}.`,
    });
    sugestoes.push("Conversar individualmente com os alunos que tiveram queda brusca de notas antes que vire defasagem.");
  }

  const ordemTom: Record<Tom, number> = { critico: 0, atencao: 1, bom: 2, neutro: 3 };
  diag.pontosAtencao = atencao.sort((a, b) => ordemTom[a.tom] - ordemTom[b.tom]);
  diag.pontosPositivos = positivos;
  diag.sugestoes = sugestoes;
}
