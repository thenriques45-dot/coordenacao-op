// Regras do conselho final (4º bimestre + 5º conceito). Tudo puro: a tela só
// desenha e grava. As regras foram combinadas com a coordenação:
//
// - Cada disciplina recebe Aprovado (ap), Aprovado pelo Conselho (apc) ou
//   Retido (rt). Sem decisão salva, vale o 5º conceito: 5 ou mais = ap,
//   abaixo de 5 = rt, sem nota = pendente (bloqueia o encerramento).
// - Retido em 5 ou mais disciplinas = Retido.
// - Ensino médio com 1 a 3 retidas, nenhuma de expansão = Aprovado
//   Parcialmente (vale mesmo com disciplinas aprovadas pelo conselho).
// - Ensino médio com 4 retidas, retida em expansão, ou fundamental com 1 a 4
//   retidas: não há resultado automático. A coordenação escolhe "Retornar ao
//   conselho" ou "Reter aluno".
// - Sem retidas: ao menos uma apc = Aprovado pelo Conselho; senão Aprovado.
// - Mais de 3 apc: alerta; se a coordenação ignorar, fica apc e a ata não
//   menciona o limite.
// - O conselho é soberano e pode reter com menos de 5 retidas (com aviso de
//   que é facilmente contestado).

export const NOTA_MINIMA = 5;
export const FREQUENCIA_MINIMA = 75;
export const LIMITE_APC = 3;
export const LIMITE_PARCIAL = 3;
export const RETIDAS_RETENCAO = 5;

export type StatusDisciplina = "ap" | "apc" | "rt";
export type Resultado = "ap" | "apc" | "app" | "rt";
/** Situação calculada: um resultado, ou falta algo para chegar nele. */
export type ResultadoCalculado = Resultado | "decidir" | "pendente";

export type NotaBimestreCf = { bimestre: string; media: number; media_mapao?: number | null };

export type DisciplinaCf = {
  nome: string;
  mediaOriginal: number | null;
  mediaConselho: number | null;
  quintoConceito?: number | null;
  faltasAcumuladas?: number | null;
  totalAulasAcumuladas?: number | null;
  faltasQuintoConceito?: number | null;
  aulasQuintoConceito?: number | null;
  historicoBimestres?: NotaBimestreCf[];
};

export type AlunoCf = {
  matricula?: string;
  chamada: number;
  nome: string;
  ativo?: boolean;
  frequencia: number | null;
  encaminhamentos?: number[];
  disciplinas: DisciplinaCf[];
};

export type RegistroDisciplinaCf = {
  status?: StatusDisciplina | null;
  /** 5º conceito dado pelo conselho (vale sobre o do mapão). */
  quinto?: number | null;
};

export type DecisaoCoordenacao = "manter" | "reter";

export type RegistroAlunoCf = {
  disciplinas?: Record<string, RegistroDisciplinaCf>;
  /** Coordenação viu o alerta de mais de 3 apc e escolheu manter. */
  limite_apc_ignorado?: boolean;
  /** Decisão da coordenação na tela de confirmação. */
  decisao?: DecisaoCoordenacao | null;
  /** Resultado calculado quando a coordenação decidiu. Se as decisões do
   *  conselho mudarem depois, a confirmação deixa de valer. */
  decidido_sobre?: ResultadoCalculado | null;
};

export type DadosConselhoFinal = {
  alunos?: Record<string, RegistroAlunoCf>;
  tempo_segundos?: number;
  texto_ata?: string;
  finalizado_em?: string;
};

export type LinhaDisciplinaCf = {
  disciplina: DisciplinaCf;
  /** Notas de 1º a 4º bimestre (4º já com o ajuste do conselho, se houver). */
  notas: Array<number | null>;
  nota4Mapao: number | null;
  quintoMapao: number | null;
  quinto: number | null;
  quintoAlterado: boolean;
  status: StatusDisciplina | null;
  /** Status veio do 5º conceito (sem clique do conselho). */
  statusAutomatico: boolean;
  faltas: number | null;
  aulas: number | null;
  /** Mais de 25% de faltas na disciplina. */
  excessoFaltas: boolean;
  expansao: boolean;
};

export type SituacaoAlunoCf = {
  chave: string;
  aluno: AlunoCf;
  registro: RegistroAlunoCf;
  disciplinas: LinhaDisciplinaCf[];
  retidas: LinhaDisciplinaCf[];
  aprovadasConselho: LinhaDisciplinaCf[];
  pendentes: LinhaDisciplinaCf[];
  frequenciaAno: number | null;
  frequenciaBaixa: boolean;
  calculado: ResultadoCalculado;
  /** Por que não há resultado automático (quando calculado = "decidir"). */
  motivoDecidir: string;
  /** Resultado final depois da decisão da coordenação (null = falta decidir). */
  final: Resultado | null;
  /** A coordenação já confirmou (ou não precisa: aprovado direto). */
  confirmado: boolean;
  /** Mais de 3 apc e a coordenação ainda não escolheu ignorar. */
  alertaLimiteApc: boolean;
  aprovadoDireto: boolean;
};

function finito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

export function normalizarNome(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

export function chaveAluno(aluno: Pick<AlunoCf, "matricula" | "nome">) {
  const ra = aluno.matricula?.trim();
  return ra ? ra : `nome:${aluno.nome.trim().toLocaleUpperCase("pt-BR")}`;
}

/** Série do ensino médio ("1ª Série", "2a Serie B"...). Fundamental é "Ano". */
export function ehEnsinoMedio(serie: string | null | undefined, codigo?: string | null) {
  const texto = normalizarNome(`${serie ?? ""} ${codigo ?? ""}`);
  return /\bSERIE\b/.test(texto) || /\bEM\b/.test(texto);
}

export function arredondarNota(valor: number) {
  return Math.round(valor * 10) / 10;
}

/** Status sugerido pelo 5º conceito. */
export function statusPorNota(nota: number | null): StatusDisciplina | null {
  if (!finito(nota)) return null;
  return nota >= NOTA_MINIMA ? "ap" : "rt";
}

function notasBimestres(disciplina: DisciplinaCf): Array<number | null> {
  const notas: Array<number | null> = [null, null, null, null];
  for (const hb of disciplina.historicoBimestres ?? []) {
    const idx = Number.parseInt(hb.bimestre, 10) - 1;
    if (idx >= 0 && idx < 4 && finito(hb.media)) notas[idx] = hb.media;
  }
  // A tela carrega o 4º bimestre: a nota vigente (conselho sobre o mapão).
  const atual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
  if (finito(atual)) notas[3] = atual;
  return notas;
}

export function calcularDisciplina(
  disciplina: DisciplinaCf,
  registro: RegistroDisciplinaCf | undefined,
  expansao: boolean,
): LinhaDisciplinaCf {
  const notas = notasBimestres(disciplina);
  const quintoMapao = finito(disciplina.quintoConceito) ? disciplina.quintoConceito : null;
  const quintoConselho = finito(registro?.quinto) ? (registro?.quinto as number) : null;
  const quinto = quintoConselho ?? quintoMapao;
  const statusSalvo = registro?.status ?? null;
  const status = statusSalvo ?? statusPorNota(quinto);
  // Faltas do ano: as do mapão do 5º conceito, ou a soma dos bimestres.
  const faltas = finito(disciplina.faltasQuintoConceito)
    ? disciplina.faltasQuintoConceito
    : finito(disciplina.faltasAcumuladas)
      ? disciplina.faltasAcumuladas
      : null;
  const aulas = finito(disciplina.aulasQuintoConceito)
    ? disciplina.aulasQuintoConceito
    : finito(disciplina.totalAulasAcumuladas)
      ? disciplina.totalAulasAcumuladas
      : null;
  return {
    disciplina,
    notas,
    nota4Mapao: finito(disciplina.mediaOriginal) ? disciplina.mediaOriginal : null,
    quintoMapao,
    quinto,
    quintoAlterado: quintoConselho !== null && (quintoMapao === null || Math.abs(quintoConselho - quintoMapao) > 0.001),
    status,
    statusAutomatico: !statusSalvo,
    faltas,
    aulas,
    excessoFaltas: finito(faltas) && finito(aulas) && aulas > 0 && faltas / aulas > 1 - FREQUENCIA_MINIMA / 100,
    expansao,
  };
}

/** Frequência do ano: soma de faltas e aulas das disciplinas; senão a do mapão. */
export function frequenciaDoAno(aluno: AlunoCf, linhas: LinhaDisciplinaCf[]) {
  let faltas = 0;
  let aulas = 0;
  for (const linha of linhas) {
    if (finito(linha.faltas) && finito(linha.aulas) && linha.aulas > 0) {
      faltas += linha.faltas;
      aulas += linha.aulas;
    }
  }
  if (aulas > 0) return Math.max(0, Math.min(100, ((aulas - faltas) / aulas) * 100));
  return finito(aluno.frequencia) ? aluno.frequencia : null;
}

export function calcularResultado(
  retidas: LinhaDisciplinaCf[],
  aprovadasConselho: number,
  pendentes: number,
  ensinoMedio: boolean,
): { calculado: ResultadoCalculado; motivo: string } {
  if (pendentes > 0) return { calculado: "pendente", motivo: "" };
  const n = retidas.length;
  if (n >= RETIDAS_RETENCAO) return { calculado: "rt", motivo: "" };
  if (n === 0) return { calculado: aprovadasConselho > 0 ? "apc" : "ap", motivo: "" };
  if (!ensinoMedio) {
    return {
      calculado: "decidir",
      motivo: "No ensino fundamental não existe aprovação parcial.",
    };
  }
  if (n > LIMITE_PARCIAL) {
    return {
      calculado: "decidir",
      motivo: `A aprovação parcial vale só para até ${LIMITE_PARCIAL} disciplinas e a retenção automática começa em ${RETIDAS_RETENCAO}.`,
    };
  }
  const expansao = retidas.filter((linha) => linha.expansao);
  if (expansao.length) {
    return {
      calculado: "decidir",
      motivo: `${expansao.map((l) => l.disciplina.nome).join(", ")} é de expansão, e disciplina de expansão não entra na aprovação parcial.`,
    };
  }
  return { calculado: "app", motivo: "" };
}

export function calcularAluno(
  aluno: AlunoCf,
  registro: RegistroAlunoCf,
  ensinoMedio: boolean,
  expansao: Set<string>,
): SituacaoAlunoCf {
  const disciplinas = aluno.disciplinas
    .map((d) => calcularDisciplina(d, registro.disciplinas?.[d.nome], expansao.has(normalizarNome(d.nome))))
    .sort((a, b) => Number(a.expansao) - Number(b.expansao) || a.disciplina.nome.localeCompare(b.disciplina.nome, "pt-BR"));
  const retidas = disciplinas.filter((l) => l.status === "rt");
  const aprovadasConselho = disciplinas.filter((l) => l.status === "apc");
  const pendentes = disciplinas.filter((l) => l.status === null || l.quinto === null);
  const { calculado, motivo } = calcularResultado(retidas, aprovadasConselho.length, pendentes.length, ensinoMedio);
  const frequenciaAno = frequenciaDoAno(aluno, disciplinas);

  let final: Resultado | null = null;
  let confirmado = false;
  const aprovadoDireto = calculado === "ap";
  const decisaoValida = registro.decisao && registro.decidido_sobre === calculado;
  if (aprovadoDireto) {
    final = registro.decisao === "reter" && decisaoValida ? "rt" : "ap";
    confirmado = true;
  } else if (calculado !== "pendente") {
    if (decisaoValida && registro.decisao === "reter") {
      final = "rt";
      confirmado = true;
    } else if (decisaoValida && registro.decisao === "manter" && calculado !== "decidir") {
      final = calculado;
      confirmado = true;
    } else if (calculado !== "decidir") {
      final = calculado;
    }
  }

  return {
    chave: chaveAluno(aluno),
    aluno,
    registro,
    disciplinas,
    retidas,
    aprovadasConselho,
    pendentes,
    frequenciaAno,
    frequenciaBaixa: finito(frequenciaAno) && frequenciaAno < FREQUENCIA_MINIMA,
    calculado,
    motivoDecidir: motivo,
    final,
    confirmado,
    alertaLimiteApc: aprovadasConselho.length > LIMITE_APC && !registro.limite_apc_ignorado,
    aprovadoDireto,
  };
}

export function montarSituacoes(
  alunos: AlunoCf[],
  dados: DadosConselhoFinal,
  ensinoMedio: boolean,
  expansao: Set<string>,
) {
  return alunos
    .filter((aluno) => aluno.ativo !== false)
    .map((aluno) => calcularAluno(aluno, dados.alunos?.[chaveAluno(aluno)] ?? {}, ensinoMedio, expansao))
    .sort((a, b) => a.aluno.chamada - b.aluno.chamada || a.aluno.nome.localeCompare(b.aluno.nome, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Mudanças feitas pelo conselho numa disciplina
// ---------------------------------------------------------------------------

/**
 * Novo 5º conceito digitado: 5 ou mais vira "Aprovado pelo Conselho" (o
 * conselho pode trocar para "Aprovado"); abaixo de 5 vira "Retido". Voltar
 * para a nota do mapão desfaz a alteração.
 */
export function aplicarNovoQuinto(linha: LinhaDisciplinaCf, nota: number | null): RegistroDisciplinaCf {
  if (nota === null) return { status: null, quinto: null };
  const igualMapao = linha.quintoMapao !== null && Math.abs(nota - linha.quintoMapao) < 0.001;
  if (igualMapao) return { status: null, quinto: null };
  return { quinto: nota, status: nota >= NOTA_MINIMA ? "apc" : "rt" };
}

/**
 * Clique num status. Aprovar (ap ou apc) uma disciplina com 5º conceito
 * abaixo de 5 leva a nota a 5 (o professor lança na SED). Voltar ao status
 * que o 5º conceito do mapão sugere limpa a decisão.
 */
export function aplicarStatus(linha: LinhaDisciplinaCf, status: StatusDisciplina): RegistroDisciplinaCf {
  let quinto: number | null = linha.quintoAlterado ? linha.quinto : null;
  if (status !== "rt" && (linha.quinto === null || linha.quinto < NOTA_MINIMA)) quinto = NOTA_MINIMA;
  if (status === "rt" && linha.quintoAlterado && linha.quinto !== null && linha.quinto >= NOTA_MINIMA && linha.quintoMapao !== null && linha.quintoMapao < NOTA_MINIMA) {
    // Desfez a aprovação: a nota volta à do mapão.
    quinto = null;
  }
  const notaEfetiva = quinto ?? linha.quintoMapao;
  const sugerido = statusPorNota(notaEfetiva);
  return { quinto, status: quinto === null && sugerido === status ? null : status };
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

export const ROTULO_RESULTADO: Record<Resultado, string> = {
  ap: "Aprovado",
  apc: "Aprovado pelo Conselho",
  app: "Aprovado Parcialmente",
  rt: "Retido",
};

export const ROTULO_STATUS: Record<StatusDisciplina, string> = {
  ap: "Aprovado",
  apc: "Ap. Conselho",
  rt: "Retido",
};

export function rotuloCalculado(calculado: ResultadoCalculado) {
  if (calculado === "decidir") return "Precisa de decisão";
  if (calculado === "pendente") return "Falta 5º conceito";
  return ROTULO_RESULTADO[calculado];
}

/** Sigla da disciplina na ata final. Aluno aprovado parcialmente: a
 *  disciplina em dependência sai como "app". */
export function siglaAta(situacao: SituacaoAlunoCf, linha: LinhaDisciplinaCf): string {
  if (!linha.status) return "";
  if (situacao.final === "app" && linha.status === "rt") return "app";
  return linha.status;
}

export function formatarNota(valor: number | null | undefined) {
  if (!finito(valor)) return "-";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function lerNota(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;
  const valor = Number(limpo);
  if (!Number.isFinite(valor) || valor < 0 || valor > 10) return undefined;
  return arredondarNota(valor);
}

export function formatarPercentual(valor: number | null | undefined) {
  return finito(valor) ? `${Math.round(valor)}%` : "-";
}
