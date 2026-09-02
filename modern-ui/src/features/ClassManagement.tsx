import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { BookOpen, CalendarClock, Copy, FileText, Paperclip, Pencil, Plus, Printer, Search, Sparkles, TrendingUp, Users, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assistentePedagogicoDisponivel,
  assistenteManualDisponivel,
  carregarAiAssistantSettings,
  gerarRelatorioPedagogico,
  montarPromptRelatorioPedagogico,
  type AiAssistantSettings,
} from "./aiAssistant";
import { TaskLinkList } from "./Dashboard";
import type {
  AtendimentoAluno,
  AtendimentoAlunoInput,
  AtendimentoAnexo,
  AtendimentoFollowUp,
} from "./atendimentos/tipos";
import { invokeApp, tauriDisponivel } from "./appBridge";
import { FotoAluno } from "./StudentPhoto";
import {
  carregarEventosCalendario,
  carregarTarefasKanban,
  KANBAN_UPDATED_EVENT,
  tarefasPorVinculo,
  type CalendarEvent,
  type KanbanTarefa,
} from "./management";
import {
  ENCAMINHAMENTOS_PADRAO,
  MENSAGEM_TEMPLATES_PADRAO,
  VARIAVEIS_MENSAGEM,
  type MensagemTemplate,
  type OpcaoEncaminhamento,
} from "./SettingsPage";

const TIPOS_ATENDIMENTO_PADRAO = ["Disciplinar", "Dúvidas", "Pedagógico", "Financeiro", "Educação especial"];
const TIPO_ATENDIMENTO_CONTATO_FAMILIA = "Contato com a família";

function normalizarTiposAtendimento(tipos: string[]) {
  const normalizados = tipos.map((tipo) => tipo.trim()).filter(Boolean);
  return normalizados.length ? normalizados : [...TIPOS_ATENDIMENTO_PADRAO];
}

type NotaBimestre = {
  bimestre: string;
  media: number;
};

type AtribuicaoNota = {
  por: string;
  em: string;
};

type Disciplina = {
  nome: string;
  mediaOriginal: number | null;
  mediaConselho: number | null;
  quintoConceito?: number | null;
  observacaoConselho?: string | null;
  faltas?: number | null;
  totalAulas?: number | null;
  faltasAcumuladas?: number | null;
  totalAulasAcumuladas?: number | null;
  historicoBimestres?: NotaBimestre[];
  situacao: "adequada" | "abaixo" | "cuidado" | "sem-nota" | "ajustada";
  atribuicaoMedia?: AtribuicaoNota | null;
};

type EncaminhamentoBimestre = {
  bimestre: string;
  codigos: number[];
};

type Aluno = {
  matricula?: string;
  chamada: number;
  nome: string;
  ativo?: boolean;
  elegivel: boolean;
  liderancaSala?: "lider" | "vice" | null;
  deficiencias: string[];
  comentarioEducacaoEspecial?: string | null;
  frequencia: number | null;
  encaminhamentos: number[];
  encaminhamentosBimestres?: EncaminhamentoBimestre[];
  atendimentos?: AtendimentoAluno[];
  responsaveis?: ResponsavelAluno[];
  diagnosticoAprendizagem?: DiagnosticoAprendizagem | null;
  disciplinas: Disciplina[];
};

type ResponsavelAluno = {
  nome: string;
  parentesco: string;
  parentesco_desc?: string | null;
  telefone: string;
};

type VariavelMensagem = {
  chave: string;
  rotulo: string;
  valor: string;
  disponivel: boolean;
};

type AtendimentoModalState =
  | { modo: "novo" }
  | { modo: "editar"; atendimento: AtendimentoAluno }
  | { modo: "followup"; atendimento: AtendimentoAluno }
  | { modo: "editar-followup"; atendimento: AtendimentoAluno; followup: AtendimentoFollowUp };

type DiagnosticoAprendizagem = {
  turma_origem: string | null;
  cd_escola: string | null;
  cd_diretoria: string | null;
  portugues: DiagnosticoComponente;
  matematica: DiagnosticoComponente;
  atualizado_em: string | null;
};

type DiagnosticoComponente = {
  aprendizagem_equivalente: string | null;
  status: string | null;
  nivel_avd1: string | null;
  equivalente_avd1: string | null;
  nivel_avd2: string | null;
  equivalente_avd2: string | null;
  evolucao: string | null;
  mensurado: boolean;
};

type TurmaResumo = {
  codigo: string;
  ano: number;
  serie: string | null;
  sala: string | null;
  periodo: string | null;
  ciclo: string | null;
  coordenador_turma: string | null;
  lider_sala: string | null;
  vice_lider_sala: string | null;
  total_alunos: number;
  alunos_ativos: number;
  alunos_elegiveis: number;
  nomes_alunos: string[];
  conselhos_com_ajustes: number;
  conselho_finalizado: boolean;
  conselhos_finalizados: Record<string, string>;
  em_conselho_externo: string[];
  caminho: string;
};

type TurmaDetalhe = {
  codigo: string;
  ano: number;
  coordenador_turma: string | null;
  bimestre: string;
  tempo_conselho_segundos: number;
  texto_ata: string;
  alunos: unknown[];
};

function formatarNota(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function arredondarMedia(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  return Math.floor(valor + 0.5);
}

function formatarMediaGlobal(valor: number | null | undefined) {
  const arredondada = arredondarMedia(valor);
  return arredondada === null ? "-" : String(arredondada);
}

function formatarPercentual(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";
  return `${Math.round(valor)}%`;
}

function calcularFrequenciaDisciplina(disciplina: Disciplina) {
  const faltas = disciplina.faltasAcumuladas ?? disciplina.faltas;
  const totalAulas = disciplina.totalAulasAcumuladas ?? disciplina.totalAulas;
  if (
    typeof faltas !== "number" ||
    typeof totalAulas !== "number" ||
    !Number.isFinite(faltas) ||
    !Number.isFinite(totalAulas) ||
    totalAulas <= 0
  ) {
    return null;
  }
  return Math.max(0, Math.min(100, ((totalAulas - faltas) / totalAulas) * 100));
}

function abreviarDisciplina(nome: string) {
  const abreviacoes: Record<string, string> = {
    "EDUCACAO FINANCEIRA": "ED. FINANC.",
    "LINGUA PORTUGUESA": "PORTUGUESA",
    "LINGUA INGLESA": "INGLES",
    "PROJETO DE VIDA": "PROJ. VIDA",
    "REDACAO E LEITURA": "REDACAO",
    "MATEMATICA": "MATEMAT.",
    "GEOGRAFIA": "GEOGRAF.",
    "BIOLOGIA": "BIOLOGIA",
    "FILOSOFIA": "FILOSOF.",
    "HISTORIA": "HISTORIA",
    "QUIMICA": "QUIMICA",
    "FISICA": "FISICA",
  };
  return abreviacoes[nome] ?? (nome.length > 10 ? `${nome.slice(0, 9)}.` : nome);
}

function notasBimestresDisciplina(disciplina: Disciplina, bimestreAtual: number): Array<number | null> {
  const notaAtual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
  const notas = [null, null, null, null] as Array<number | null>;
  for (const hb of disciplina.historicoBimestres ?? []) {
    const idx = Number.parseInt(hb.bimestre, 10) - 1;
    if (idx >= 0 && idx < 4 && typeof hb.media === "number" && Number.isFinite(hb.media)) {
      notas[idx] = hb.media;
    }
  }
  if (typeof notaAtual === "number" && Number.isFinite(notaAtual) && bimestreAtual >= 1 && bimestreAtual <= 4) {
    notas[bimestreAtual - 1] = notaAtual;
  }
  return notas;
}

function calcularMediaDisciplina(disciplina: Disciplina, bimestreAtual: number): number | null {
  const notas = notasBimestresDisciplina(disciplina, bimestreAtual).filter(
    (nota): nota is number => nota !== null,
  );
  if (!notas.length) return null;
  return notas.reduce((total, valor) => total + valor, 0) / notas.length;
}

function calcularMediaAluno(aluno: Aluno, bimestreAtual: number) {
  const medias = aluno.disciplinas.flatMap((disciplina) => {
    const media = calcularMediaDisciplina(disciplina, bimestreAtual);
    return media !== null ? [media] : [];
  });
  if (!medias.length) return null;
  return medias.reduce((total, valor) => total + valor, 0) / medias.length;
}

function classificarAluno(aluno: Aluno, bimestreAtual: number) {
  const media = arredondarMedia(calcularMediaAluno(aluno, bimestreAtual));
  if (media !== null && media < 5) return "critico";
  if (media === 5) return "atencao";
  return "adequado";
}

function bimestreParaNumero(bimestre: string | null | undefined) {
  return Math.max(1, Math.min(4, Number.parseInt(bimestre ?? "1", 10) || 1));
}

function classeNota(nota: number | null | undefined) {
  if (nota === null || nota === undefined || !Number.isFinite(nota)) return "sem-nota";
  if (nota < 5) return "abaixo";
  if (nota === 5) return "cuidado";
  return "adequada";
}

function classeTextoNota(nota: number | null | undefined) {
  return `grade-value ${classeNota(nota)}`;
}

function formatarAtribuicao(atribuicao: AtribuicaoNota | null | undefined) {
  if (!atribuicao) return null;
  const data = new Date(atribuicao.em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  return `Importado por ${atribuicao.por} em ${data}`;
}

function rotuloClassificacao(status: ReturnType<typeof classificarAluno>) {
  if (status === "critico") return "Critico";
  if (status === "atencao") return "Atenção";
  return "Adequado";
}

function calcularMetricasTurma(alunos: Aluno[], bimestreAtual: number) {
  const medias = alunos
    .map((aluno) => calcularMediaAluno(aluno, bimestreAtual))
    .filter((valor): valor is number => valor !== null && valor !== undefined);
  const mediaGeral = medias.length ? medias.reduce((total, valor) => total + valor, 0) / medias.length : null;
  return alunos.reduce(
    (metricas, aluno) => {
      const status = classificarAluno(aluno, bimestreAtual);
      return {
        ...metricas,
        adequados: metricas.adequados + (status === "adequado" ? 1 : 0),
        atencao: metricas.atencao + (status === "atencao" ? 1 : 0),
        criticos: metricas.criticos + (status === "critico" ? 1 : 0),
      };
    },
    { adequados: 0, atencao: 0, criticos: 0, mediaGeral },
  );
}

function DiagnosticSubjectCard({
  titulo,
  diagnostico,
}: {
  titulo: string;
  diagnostico: DiagnosticoComponente;
}) {
  const status = diagnostico.status ?? "-";
  return (
    <article className={`diagnostic-subject-card ${classeStatusDiagnostico(status)}`}>
      <span>{titulo}</span>
      <strong>{status}</strong>
      {diagnostico.mensurado && diagnostico.aprendizagem_equivalente && (
        <small>Aprendizagem equivalente: {diagnostico.aprendizagem_equivalente}</small>
      )}
      {diagnostico.evolucao && (
        <small className={`diagnostic-evolution ${classeEvolucao(diagnostico.evolucao)}`}>
          {setaEvolucao(diagnostico.evolucao)} {diagnostico.evolucao} da AvD1 para a AvD2
        </small>
      )}
    </article>
  );
}

function classeStatusDiagnostico(status: string) {
  const texto = status.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (texto.includes("abaixo")) return "below-basic";
  if (texto.includes("profic")) return "proficient";
  if (texto.includes("bas")) return "basic";
  return "unknown";
}

function classeEvolucao(evolucao: string) {
  const texto = evolucao.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (texto.includes("avanc")) return "up";
  if (texto.includes("regred")) return "down";
  return "flat";
}

function setaEvolucao(evolucao: string) {
  const classe = classeEvolucao(evolucao);
  return classe === "up" ? "▲" : classe === "down" ? "▼" : "=";
}

function diagnosticoSarespPorDisciplina(diagnostico: DiagnosticoAprendizagem | null | undefined, disciplina: string) {
  if (!diagnostico) return null;
  const nome = normalizarBusca(disciplina);
  if (nome === "portugues" || nome === "portuguesa" || nome === "lingua portuguesa") {
    return diagnostico.portugues;
  }
  if (nome === "matematica") {
    return diagnostico.matematica;
  }
  return null;
}

function normalizarBusca(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function rotuloBimestre(valor: string | null | undefined) {
  const opcoes = [
    { valor: "1", rotulo: "1º bimestre" },
    { valor: "2", rotulo: "2º bimestre" },
    { valor: "3", rotulo: "3º bimestre" },
    { valor: "4", rotulo: "4º bimestre/conselho final" },
  ];
  return opcoes.find((opcao) => opcao.valor === valor)?.rotulo ?? "1º bimestre";
}

function rotuloSerie(valor?: string | null) {
  if (!valor) return "";
  return valor
    .replace(/\b([1-3])\s*a\s+serie\b/gi, "$1ª Série")
    .replace(/\b([1-9])\s*o\s+ano\b/gi, "$1º Ano")
    .replace(/\bpre-escola\b/gi, "Pré-escola")
    .replace(/\bbercario\b/gi, "Berçário")
    .replace(/\bserie\b/gi, "Série")
    .replace(/\bano\b/gi, "Ano");
}

function rotuloTurma(turma: TurmaResumo) {
  const serie = rotuloSerie(turma.serie);
  const codigo = turma.codigo ?? "";
  if (!serie) return codigo;
  if (normalizarBusca(codigo).startsWith(normalizarBusca(turma.serie ?? ""))) {
    const resto = codigo.slice(turma.serie?.length ?? 0).trim();
    return `${serie} ${resto}`.trim();
  }
  return rotuloSerie(codigo) || codigo;
}

function rotuloLideranca(lideranca: "lider" | "vice" | null | undefined) {
  if (lideranca === "lider") return "Líder";
  if (lideranca === "vice") return "Vice líder";
  return "Não";
}

function CouncilMetric({
  value,
  label,
  tone,
  icon,
}: {
  value: string;
  label: string;
  tone?: "green" | "amber" | "red";
  icon?: ReactNode;
}) {
  return (
    <article className={`council-metric ${tone ?? ""}`}>
      {icon && <span className="council-metric-icon">{icon}</span>}
      <div className="council-metric-value">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}
export function GestaoTurma({
  turma,
  turmaDetalhe,
  alunos,
  turmaConfig,
  nomeAlunoInicial,
  onVoltar,
  onSalvarCoordenador,
  onSalvarElegibilidade,
  onSalvarLideranca,
  onSalvarEducacaoEspecial,
  onSalvarAtendimento,
  onSalvarResponsaveis,
  onOpenKanban,
}: {
  turma: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  alunos: Aluno[];
  turmaConfig: { lider_ativo: boolean; lider_rotulo: string; elegivel_ativo: boolean; elegivel_rotulo: string; atendimento_tipos?: string[]; encaminhamento_opcoes?: OpcaoEncaminhamento[]; mensagem_familia_templates?: MensagemTemplate[] };
  nomeAlunoInicial?: string | null;
  onVoltar: () => void;
  onSalvarCoordenador: (coordenador: string) => Promise<void>;
  onSalvarElegibilidade: (matricula: string, elegivel: boolean) => Promise<void>;
  onSalvarLideranca: (matricula: string, lideranca: "lider" | "vice" | null) => Promise<void>;
  onSalvarEducacaoEspecial: (matricula: string, deficiencias: string[], comentario: string) => Promise<void>;
  onSalvarAtendimento: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
  onSalvarResponsaveis: (matricula: string, responsaveis: ResponsavelAluno[]) => Promise<void>;
  onOpenKanban: () => void;
}) {
  const [aba, setAba] = useState<"alunos" | "estatisticas" | "tarefas">("alunos");
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editandoCoordenador, setEditandoCoordenador] = useState(false);
  const [coordenador, setCoordenador] = useState(turma?.coordenador_turma ?? "");
  const [salvandoElegivel, setSalvandoElegivel] = useState<string | null>(null);
  const [salvandoLideranca, setSalvandoLideranca] = useState<string | null>(null);
  const [alunoAberto, setAlunoAberto] = useState<Aluno | null>(null);
  const nomeAlunoInicialAberto = useRef<string | null>(null);
  const [tarefasKanban, setTarefasKanban] = useState<KanbanTarefa[]>(() => carregarTarefasKanban());
  const eventosCalendario = useMemo(() => carregarEventosCalendario(), []);
  const catalogoDeficiencias = useMemo(() => {
    const itens = new Set<string>();
    alunos.forEach((aluno) => aluno.deficiencias.forEach((item) => {
      if (item.trim()) itens.add(item.trim());
    }));
    return Array.from(itens).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [alunos]);

  useEffect(() => {
    setCoordenador(turma?.coordenador_turma ?? "");
    setAlunoAberto(null);
    nomeAlunoInicialAberto.current = null;
  }, [turma?.coordenador_turma, turma?.caminho]);

  useEffect(() => {
    if (!nomeAlunoInicial || nomeAlunoInicialAberto.current === nomeAlunoInicial) return;
    if (alunos.length === 0) return;
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const encontrado = alunos.find((a) => norm(a.nome).includes(norm(nomeAlunoInicial)));
    if (encontrado) {
      setAlunoAberto(encontrado);
      nomeAlunoInicialAberto.current = nomeAlunoInicial;
    }
  }, [nomeAlunoInicial, alunos]);

  // A ficha aberta sempre reflete a versão mais recente vinda do App;
  // alunoAberto é apenas o marcador de qual aluno está aberto.
  const alunoAbertoAtual = alunoAberto
    ? alunos.find((item) => item.matricula && item.matricula === alunoAberto.matricula) ?? alunoAberto
    : null;

  const alunosAtivos = useMemo(() => alunos.filter((aluno) => aluno.ativo !== false), [alunos]);
  const totalInativos = alunos.length - alunosAtivos.length;
  const alunosVisiveis = mostrarInativos ? alunos : alunosAtivos;

  const alunosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return alunosVisiveis;
    return alunosVisiveis.filter((aluno) => [aluno.nome, aluno.matricula ?? ""].some((campo) => campo.toLocaleLowerCase("pt-BR").includes(termo)));
  }, [alunosVisiveis, busca]);

  // Métricas e desempenho consideram apenas os alunos ativos.
  const bimestreAtualTurma = bimestreParaNumero(turmaDetalhe?.bimestre);
  const disciplinas = useMemo(() => Array.from(new Set(alunosAtivos.flatMap((aluno) => aluno.disciplinas.map((disciplina) => disciplina.nome)))).sort(), [alunosAtivos]);
  const mediaGeral = calcularMetricasTurma(alunosAtivos, bimestreAtualTurma).mediaGeral;
  const metricas = calcularMetricasTurma(alunosAtivos, bimestreAtualTurma);
  const total = alunosAtivos.length || 1;
  const desempenhoDisciplinas = useMemo(() => disciplinas.map((disciplina) => {
    const notas = alunosAtivos.flatMap((aluno) => {
      const nota = aluno.disciplinas.find((item) => item.nome === disciplina)?.mediaOriginal;
      return typeof nota === "number" && Number.isFinite(nota) ? [nota] : [];
    });
    const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0;
    return { disciplina, media };
  }), [alunosAtivos, disciplinas]);
  const bimestreLabel = `${turmaDetalhe?.bimestre ?? "1"}º bim`;
  const percentuaisSituacao = {
    adequados: Math.round(metricas.adequados / total * 100),
    atencao: Math.round(metricas.atencao / total * 100),
    criticos: Math.round(metricas.criticos / total * 100),
  };
  const tarefasDaTurma = useMemo(() => {
    const termos = [
      turma ? rotuloTurma(turma) : "",
      turma?.codigo ?? "",
      turma?.serie ? rotuloSerie(turma.serie) : "",
      turma?.sala ? `Sala ${turma.sala}` : "",
    ];
    return tarefasPorVinculo(tarefasKanban, eventosCalendario, termos);
  }, [tarefasKanban, eventosCalendario, turma]);

  useEffect(() => {
    function atualizarTarefas() {
      setTarefasKanban(carregarTarefasKanban());
    }

    function atualizarSeStorage(event: StorageEvent) {
      if (!event.key || event.key.includes("quadro-kanban")) {
        atualizarTarefas();
      }
    }

    window.addEventListener(KANBAN_UPDATED_EVENT, atualizarTarefas);
    window.addEventListener("storage", atualizarSeStorage);
    window.addEventListener("focus", atualizarTarefas);
    return () => {
      window.removeEventListener(KANBAN_UPDATED_EVENT, atualizarTarefas);
      window.removeEventListener("storage", atualizarSeStorage);
      window.removeEventListener("focus", atualizarTarefas);
    };
  }, []);

  useEffect(() => {
    if (aba === "tarefas" && tarefasDaTurma.length === 0) {
      setAba("alunos");
    }
  }, [aba, tarefasDaTurma.length]);

  function salvarCoordenador() {
    onSalvarCoordenador(coordenador).finally(() => setEditandoCoordenador(false));
  }

  function alternarElegivel(aluno: Aluno) {
    const matricula = aluno.matricula;
    if (!matricula) return;
    setSalvandoElegivel(matricula);
    onSalvarElegibilidade(matricula, !aluno.elegivel).finally(() => setSalvandoElegivel(null));
  }

  function alternarLideranca(aluno: Aluno) {
    const matricula = aluno.matricula;
    if (!matricula) return;
    const atual = aluno.liderancaSala ?? null;
    const liderAtual = alunos.find((item) => item.liderancaSala === "lider");
    const viceAtual = alunos.find((item) => item.liderancaSala === "vice");
    let proxima: "lider" | "vice" | null = null;

    if (atual === "vice") {
      proxima = null;
    } else if (atual === "lider") {
      proxima = viceAtual && viceAtual.matricula !== matricula ? null : "vice";
    } else if (!liderAtual) {
      proxima = "lider";
    } else if (!viceAtual) {
      proxima = "vice";
    } else {
      const confirmar = window.confirm(
        `A turma já tem líder (${liderAtual.nome}) e vice líder (${viceAtual.nome}). Deseja limpar essas indicações?`,
      );
      if (!confirmar) return;
      setSalvandoLideranca(matricula);
      Promise.all([
        liderAtual.matricula ? onSalvarLideranca(liderAtual.matricula, null) : Promise.resolve(),
        viceAtual.matricula ? onSalvarLideranca(viceAtual.matricula, null) : Promise.resolve(),
      ]).finally(() => setSalvandoLideranca(null));
      return;
    }

    if (proxima) {
      const ocupante = alunos.find((item) => item.matricula !== matricula && item.liderancaSala === proxima);
      if (ocupante && !window.confirm(`${ocupante.nome} já está como ${rotuloLideranca(proxima)}. Deseja trocar?`)) {
        return;
      }
    }
    setSalvandoLideranca(matricula);
    onSalvarLideranca(matricula, proxima).finally(() => setSalvandoLideranca(null));
  }

  if (alunoAbertoAtual) {
    return (
      <>
        <button className="back-link" onClick={onVoltar}>← Voltar para Turmas</button>

        <section className="panel turma-detail-hero">
          <div className="turma-detail-title">
            <h1>{turma ? rotuloTurma(turma) : "Turma"}</h1>
            <span>{turma?.periodo ?? "Período não informado"}</span>
          </div>
        </section>

        <AlunoDetalheGestao
          aluno={alunoAbertoAtual}
          bimestre={turmaDetalhe?.bimestre ?? "1"}
          caminhoTurma={turma?.caminho}
          turmaLabel={turma ? rotuloTurma(turma) : undefined}
          onVoltar={() => setAlunoAberto(null)}
          catalogoDeficiencias={catalogoDeficiencias}
          tiposAtendimento={turmaConfig.atendimento_tipos ?? []}
          encaminhamentoOpcoes={turmaConfig.encaminhamento_opcoes?.length ? turmaConfig.encaminhamento_opcoes : ENCAMINHAMENTOS_PADRAO}
          mensagemTemplates={turmaConfig.mensagem_familia_templates?.length ? turmaConfig.mensagem_familia_templates : MENSAGEM_TEMPLATES_PADRAO}
          onSalvarEducacaoEspecial={onSalvarEducacaoEspecial}
          onSalvarAtendimento={onSalvarAtendimento}
          onSalvarResponsaveis={onSalvarResponsaveis}
          tarefas={tarefasKanban}
          eventos={eventosCalendario}
          onOpenKanban={onOpenKanban}
        />
      </>
    );
  }

  return (
    <>
      <button className="back-link" onClick={onVoltar}>← Voltar para Turmas</button>

      <section className="panel turma-detail-hero">
        <div className="turma-detail-title">
          <h1>{turma ? rotuloTurma(turma) : "Turma"}</h1>
          <span>{turma?.periodo ?? "Período não informado"}</span>
        </div>
        <div className="turma-info-grid">
          <div><span>Série</span><strong>{rotuloSerie(turma?.serie) || turma?.ciclo || "-"}</strong></div>
          <div><span>Ano Letivo</span><strong>{turma?.ano ?? "-"}</strong></div>
          <div><span>Sala</span><strong>{turma?.sala ? `Sala ${turma.sala}` : "Não informada"}</strong></div>
          <div className="coordinator-field">
            <span>Coordenador da turma</span>
            {editandoCoordenador ? (
              <input
                autoFocus
                value={coordenador}
                onChange={(event) => setCoordenador(event.target.value)}
                onBlur={salvarCoordenador}
                onKeyDown={(event) => {
                  if (event.key === "Enter") salvarCoordenador();
                  if (event.key === "Escape") setEditandoCoordenador(false);
                }}
              />
            ) : (
              <button onClick={() => setEditandoCoordenador(true)}>
                <strong>{coordenador || "A definir"}</strong>
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="class-metric-row">
          <CouncilMetric icon={<Users size={21} />} value={`${turma?.alunos_ativos ?? alunosAtivos.length}/${turma?.total_alunos ?? alunos.length}`} label="Alunos/Total" />
          <CouncilMetric icon={<TrendingUp size={21} />} value={formatarMediaGlobal(mediaGeral)} label="Média Geral" tone="green" />
          <CouncilMetric icon={<CalendarClock size={21} />} value={formatarPercentual(mediaGeral === null ? null : alunos.reduce((soma, aluno) => soma + (aluno.frequencia ?? 0), 0) / total)} label="Frequência Média" />
          <CouncilMetric icon={<BookOpen size={21} />} value={String(disciplinas.length)} label="Disciplinas" />
        </div>
      </section>

      <div className="detail-tabs">
        <button className={aba === "alunos" ? "active" : ""} onClick={() => setAba("alunos")}>Alunos ({alunos.length})</button>
        <button className={aba === "estatisticas" ? "active" : ""} onClick={() => setAba("estatisticas")}>Estatísticas</button>
        {tarefasDaTurma.length > 0 && (
          <button className={aba === "tarefas" ? "active" : ""} onClick={() => setAba("tarefas")}>Tarefas ({tarefasDaTurma.length})</button>
        )}
      </div>

      {aba === "alunos" && (
        <>
          <div className="class-search-row">
            <label className="search-box class-search">
              <Search size={21} />
              <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar aluno por nome ou matrícula..." />
            </label>
            {totalInativos > 0 && (
              <label className="inactive-toggle" title="Exibir também os alunos inativos">
                <input
                  type="checkbox"
                  checked={mostrarInativos}
                  onChange={(event) => setMostrarInativos(event.target.checked)}
                />
                Mostrar inativos ({totalInativos})
              </label>
            )}
          </div>
          <div className="panel students-table-wrap">
            <table className="students-table">
              <thead><tr><th>Nome</th><th>RA</th><th>Média</th><th>Frequência</th><th>Situação</th>{turmaConfig.elegivel_ativo && <th>{turmaConfig.elegivel_rotulo}</th>}{turmaConfig.lider_ativo && <th>{turmaConfig.lider_rotulo}</th>}</tr></thead>
              <tbody>
                {alunosFiltrados.map((aluno) => {
                  const status = classificarAluno(aluno, bimestreAtualTurma);
                  return (
                    <tr
                      className={`student-table-row${aluno.ativo === false ? " inactive" : ""}`}
                      key={aluno.matricula ?? aluno.nome}
                      onClick={() => setAlunoAberto(aluno)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setAlunoAberto(aluno);
                      }}
                    >
                      <td>
                        <strong>{aluno.nome}</strong>
                        {aluno.ativo === false && <span className="inactive-badge">Inativo</span>}
                        <span>Nº {aluno.chamada || "-"}</span>
                      </td>
                      <td>{aluno.matricula ?? "-"}</td>
                      <td className={status === "critico" ? "danger-text" : "success-text"}>{formatarMediaGlobal(calcularMediaAluno(aluno, bimestreAtualTurma))}</td>
                      <td>{formatarPercentual(aluno.frequencia)}</td>
                      <td><span className={`class-status-pill ${status}`}>{rotuloClassificacao(status)}</span></td>
                      {turmaConfig.elegivel_ativo && (
                        <td>
                          <button
                            className={`eligible-toggle ${aluno.elegivel ? "yes" : "no"}`}
                            disabled={salvandoElegivel === aluno.matricula}
                            onClick={(event) => {
                              event.stopPropagation();
                              alternarElegivel(aluno);
                            }}
                          >
                            {aluno.elegivel ? "Sim" : "Não"}
                          </button>
                        </td>
                      )}
                      {turmaConfig.lider_ativo && (
                        <td>
                          <button
                            className={`leader-toggle ${aluno.liderancaSala ?? "no"}`}
                            disabled={salvandoLideranca === aluno.matricula}
                            onClick={(event) => {
                              event.stopPropagation();
                              alternarLideranca(aluno);
                            }}
                          >
                            {rotuloLideranca(aluno.liderancaSala ?? null)}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {aba === "estatisticas" && (
        <section className="stats-layout">
          <div className="panel stats-card discipline-performance-card">
            <div className="stats-card-heading">
              <h3>Desempenho por Disciplina</h3>
              <span>{bimestreLabel}</span>
            </div>
            <div className="subject-performance-chart">
              {desempenhoDisciplinas.map(({ disciplina, media }) => {
                return (
                  <div className="subject-performance-row" key={disciplina}>
                    <span title={disciplina}>{disciplina}</span>
                    <div className="subject-performance-track">
                      <i style={{ width: `${Math.max(2, media * 10)}%` }} />
                    </div>
                    <strong>{formatarMediaGlobal(media)}</strong>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel stats-card status-evolution-card">
            <div className="stats-card-heading">
              <h3>Evolução da Situação da Turma</h3>
              <span>Panorama anual</span>
            </div>
            <div className="status-evolution-row">
              <span>{bimestreLabel}</span>
              <div className="status-evolution-bar" aria-label={`Distribuição da turma no ${bimestreLabel}`}>
                <i className="ok" style={{ width: `${percentuaisSituacao.adequados}%` }} />
                <i className="warn" style={{ width: `${percentuaisSituacao.atencao}%` }} />
                <i className="bad" style={{ width: `${percentuaisSituacao.criticos}%` }} />
              </div>
            </div>
            <div className="status-evolution-placeholder">
              <span>Os próximos bimestres entram aqui quando a turma tiver novos mapões importados.</span>
            </div>
            <div className="pie-legend status-legend">
              <span className="ok">Adequados: {percentuaisSituacao.adequados}%</span>
              <span className="warn">Atenção: {percentuaisSituacao.atencao}%</span>
              <span className="bad">Críticos: {percentuaisSituacao.criticos}%</span>
            </div>
          </div>
          <div className="panel stats-summary">
            <h3>Análise Geral da Turma</h3>
            <article className="ok"><strong>{metricas.adequados}</strong><span>Alunos em situação regular</span></article>
            <article className="warn"><strong>{metricas.atencao}</strong><span>Alunos necessitando atenção</span></article>
            <article className="bad"><strong>{metricas.criticos}</strong><span>Alunos em situação crítica</span></article>
          </div>
        </section>
      )}

      {aba === "tarefas" && (
        <section className="panel linked-tasks-panel">
          <div className="panel-heading">
            <div>
              <h3>Tarefas associadas à turma</h3>
              <p>Cards do Kanban vinculados à turma, sala ou eventos relacionados.</p>
            </div>
          </div>
          <TaskLinkList tarefas={tarefasDaTurma} eventos={eventosCalendario} emptyText="Nenhuma tarefa vinculada a esta turma." onOpenKanban={onOpenKanban} />
        </section>
      )}
    </>
  );
}

function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

// Campo de tags: cada texto vira um "chip" ao digitar vírgula / Enter / sair
// do campo. Guarda e devolve o valor como string separada por vírgula (para
// encaixar sem mudança nos formulários que já usavam um <input> de texto).
function TagsInput({
  value,
  onChange,
  sugestoes,
  placeholder,
}: {
  value: string;
  onChange: (valor: string) => void;
  sugestoes: string[];
  placeholder?: string;
}) {
  const [rascunho, setRascunho] = useState("");
  const [aberto, setAberto] = useState(false);
  const norm = (s: string) => s.trim().toLocaleLowerCase("pt-BR");
  const tags = value.split(",").map((t) => t.trim()).filter(Boolean);

  function commitVarios(brutos: string[]) {
    const atuais = [...tags];
    for (const bruto of brutos) {
      const limpo = bruto.trim();
      if (limpo && !atuais.some((x) => norm(x) === norm(limpo))) atuais.push(limpo);
    }
    if (atuais.length !== tags.length) onChange(atuais.join(", "));
    setRascunho("");
  }

  function removerTag(tag: string) {
    onChange(tags.filter((x) => norm(x) !== norm(tag)).join(", "));
  }

  function aoDigitar(bruto: string) {
    if (!bruto.includes(",")) {
      setRascunho(bruto);
      return;
    }
    const partes = bruto.split(",");
    const ultimo = partes.pop() ?? "";
    commitVarios(partes);
    setRascunho(ultimo);
  }

  const sugestoesFiltradas = sugestoes
    .filter((s) => !tags.some((t) => norm(t) === norm(s)))
    .filter((s) => !rascunho.trim() || norm(s).includes(norm(rascunho)))
    .slice(0, 8);

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          alignItems: "center",
          border: "1px solid var(--border, #e6e3dd)",
          borderRadius: "8px",
          padding: "0.4rem 0.5rem",
          background: "#fff",
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", background: "#eef2f6", borderRadius: "999px", padding: "0.1rem 0.55rem", fontSize: "0.82rem" }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removerTag(tag)}
              aria-label={`Remover ${tag}`}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, minHeight: 0, lineHeight: 1, color: "#667085" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={rascunho}
          onChange={(e) => aoDigitar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "," || e.key === "Enter") {
              e.preventDefault();
              commitVarios([rascunho]);
            } else if (e.key === "Backspace" && !rascunho && tags.length) {
              removerTag(tags[tags.length - 1]);
            }
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => {
            commitVarios([rascunho]);
            setTimeout(() => setAberto(false), 150);
          }}
          placeholder={tags.length ? "" : placeholder}
          style={{ flex: 1, minWidth: "8rem", border: "none", outline: "none", padding: "0.15rem", fontSize: "0.9rem", background: "transparent", marginTop: 0 }}
        />
      </div>
      {aberto && sugestoesFiltradas.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 5,
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid var(--border, #e6e3dd)",
            borderRadius: "8px",
            marginTop: "0.2rem",
            boxShadow: "0 4px 12px rgba(0,0,0,.08)",
            maxHeight: "12rem",
            overflowY: "auto",
          }}
        >
          {sugestoesFiltradas.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitVarios([s]); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.4rem 0.6rem", cursor: "pointer", fontSize: "0.85rem", minHeight: 0 }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatarTelefoneBR(valor: string) {
  const d = apenasDigitos(valor).replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

function telefoneParaWhatsapp(valor: string) {
  const d = apenasDigitos(valor);
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

function rotuloParentesco(r: ResponsavelAluno) {
  if (r.parentesco === "mae") return "mãe";
  if (r.parentesco === "pai") return "pai";
  return (r.parentesco_desc || "").trim() || "responsável";
}

function rotuloVariavel(chave: string) {
  return VARIAVEIS_MENSAGEM.find((v) => v.chave === chave)?.rotulo ?? chave;
}

type SegmentoMensagem =
  | { tipo: "texto"; texto: string; chave?: undefined }
  | { tipo: "var"; chave: string; rotulo: string; valor?: string; resolvido: boolean; texto?: undefined };

// Quebra o texto da mensagem em trechos literais + ocorrências de {variavel},
// já resolvendo cada variável pelo valor real (ou marcando como pendente). A
// prévia renderiza isso com destaque visual; `textoParaEnviar` reconstrói a
// string final a partir dos mesmos segmentos.
function montarSegmentosMensagem(
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

const PARENTESCO_OPCOES: { valor: string; rotulo: string }[] = [
  { valor: "mae", rotulo: "Mãe" },
  { valor: "pai", rotulo: "Pai" },
  { valor: "outro", rotulo: "Outro" },
];

function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function chipHtml(seg: Extract<SegmentoMensagem, { tipo: "var" }>) {
  const classe = seg.resolvido ? "msg-chip msg-chip--ok" : "msg-chip msg-chip--pend";
  const rotulo = seg.resolvido
    ? `Preenchido pela variável: ${seg.rotulo}`
    : `Sem dado para: ${seg.rotulo}`;
  const conteudo = seg.resolvido ? (seg.valor ?? "") : `‹${seg.rotulo}›`;
  return `<span class="${classe}" contenteditable="false" data-chave="${seg.chave}" title="${escaparHtml(rotulo)}">${escaparHtml(conteudo)}</span>`;
}

function segmentosParaHtml(segmentos: SegmentoMensagem[]) {
  const corpo = segmentos
    .map((seg) =>
      seg.tipo === "texto" ? escaparHtml(seg.texto).replace(/\n/g, "<br>") : chipHtml(seg),
    )
    .join("");
  return corpo || "";
}

// Compositor de campo único: o texto e a prévia são a mesma coisa. Cada
// {variável} aparece como um bloco em linha (azul = resolvida / amarelo = sem
// dado). Apagável como caractere; clicar numa tag reinsere na posição do cursor.
function EditorMensagemChips({
  corpo,
  segmentos,
  onCorpoChange,
  resolverChip,
}: {
  corpo: string;
  segmentos: SegmentoMensagem[];
  onCorpoChange: (corpo: string) => void;
  resolverChip: (chave: string) => { valor?: string; rotulo: string; resolvido: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rangeSalvo = useRef<Range | null>(null);
  const ultimoEmitido = useRef<string | null>(null);

  const serializar = useCallback((): string => {
    const raiz = ref.current;
    if (!raiz) return "";
    const walk = (node: Node): string => {
      let s = "";
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          s += (child.textContent ?? "").replace(/ /g, " ");
        } else if (child instanceof HTMLElement) {
          if (child.dataset.chave) {
            s += `{${child.dataset.chave}}`;
          } else if (child.tagName === "BR") {
            s += "\n";
          } else if (child.tagName === "DIV" || child.tagName === "P") {
            if (s && !s.endsWith("\n")) s += "\n";
            const soBr = child.childNodes.length === 1 && child.firstChild?.nodeName === "BR";
            s += soBr ? "" : walk(child);
          } else {
            s += walk(child);
          }
        }
      });
      return s;
    };
    return walk(raiz);
  }, []);

  const emitir = useCallback(() => {
    const txt = serializar();
    ultimoEmitido.current = txt;
    onCorpoChange(txt);
  }, [serializar, onCorpoChange]);

  const salvarSelecao = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      rangeSalvo.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  // Reconstrói o HTML quando o texto muda de fora (troca de modelo, variáveis
  // que terminaram de carregar) — mas nunca enquanto o usuário digita, para
  // não jogar o cursor para o início.
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    if (document.activeElement === raiz) return;
    raiz.innerHTML = segmentosParaHtml(segmentos);
    ultimoEmitido.current = corpo;
  }, [corpo, segmentos]);

  function inserirChip(chave: string) {
    const raiz = ref.current;
    if (!raiz) return;
    raiz.focus();
    const sel = window.getSelection();
    if (!sel) return;
    let range = rangeSalvo.current;
    if (!range || !raiz.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(raiz);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    range.deleteContents();

    const info = resolverChip(chave);
    const chip = document.createElement("span");
    chip.className = info.resolvido ? "msg-chip msg-chip--ok" : "msg-chip msg-chip--pend";
    chip.setAttribute("contenteditable", "false");
    chip.dataset.chave = chave;
    chip.title = info.resolvido ? `Preenchido pela variável: ${info.rotulo}` : `Sem dado para: ${info.rotulo}`;
    chip.textContent = info.resolvido ? (info.valor ?? "") : `‹${info.rotulo}›`;
    range.insertNode(chip);
    const espaco = document.createTextNode(" ");
    chip.after(espaco);
    const depois = document.createRange();
    depois.setStartAfter(espaco);
    depois.collapse(true);
    sel.removeAllRanges();
    sel.addRange(depois);
    rangeSalvo.current = depois.cloneRange();
    emitir();
  }

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <div
        ref={ref}
        className="msg-editor"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Texto da mensagem"
        data-placeholder="Escreva a mensagem. Clique nas etiquetas abaixo para inserir dados do aluno."
        suppressContentEditableWarning
        onInput={emitir}
        onBlur={() => {
          const raiz = ref.current;
          if (raiz) raiz.innerHTML = segmentosParaHtml(segmentos);
          ultimoEmitido.current = corpo;
        }}
        onKeyUp={salvarSelecao}
        onMouseUp={salvarSelecao}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
        {(VARIAVEIS_MENSAGEM).map((v) => {
          const info = resolverChip(v.chave);
          return (
            <button
              key={v.chave}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => inserirChip(v.chave)}
              title={`${v.rotulo}${info.resolvido ? ` — ${info.valor}` : " — sem dado para este aluno"}`}
              className={info.resolvido ? "msg-tag msg-tag--ok" : "msg-tag"}
            >
              {v.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PainelResponsaveisEMensagem({
  aluno,
  bimestre,
  caminhoTurma,
  mensagemTemplates,
  onSalvarResponsaveis,
  onSalvarAtendimento,
}: {
  aluno: Aluno;
  bimestre: string;
  caminhoTurma?: string;
  mensagemTemplates: MensagemTemplate[];
  onSalvarResponsaveis: (matricula: string, responsaveis: ResponsavelAluno[]) => Promise<void>;
  onSalvarAtendimento: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
}) {
  const matricula = aluno.matricula ?? "";
  const [responsaveis, setResponsaveis] = useState<ResponsavelAluno[]>(aluno.responsaveis ?? []);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [composerAberto, setComposerAberto] = useState(false);
  const [destinatarioIndice, setDestinatarioIndice] = useState(0);
  const [bimestreComposer, setBimestreComposer] = useState(bimestre);
  const [templateId, setTemplateId] = useState(mensagemTemplates[0]?.id ?? "");
  const [corpo, setCorpo] = useState("");
  const [variaveis, setVariaveis] = useState<VariavelMensagem[]>([]);
  const [carregandoVariaveis, setCarregandoVariaveis] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroComposer, setErroComposer] = useState("");

  useEffect(() => {
    setResponsaveis(aluno.responsaveis ?? []);
    setEditando(false);
  }, [aluno.matricula, aluno.responsaveis]);

  const templateAtual = mensagemTemplates.find((t) => t.id === templateId) ?? mensagemTemplates[0];
  const destinatario = responsaveis[destinatarioIndice] ?? responsaveis[0];

  const extras: Record<string, string> = {
    responsavel: (destinatario?.nome ?? "").trim() || "responsável",
  };
  const segmentos = useMemo(
    () => montarSegmentosMensagem(corpo, variaveis, extras),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [corpo, variaveis, destinatarioIndice, responsaveis],
  );
  const textoParaEnviar = segmentos
    .map((s) => (s.tipo === "texto" ? s.texto ?? "" : s.resolvido ? s.valor ?? "" : `{${s.chave}}`))
    .join("");
  const variaveisNaoResolvidas = Array.from(
    new Map(
      segmentos.flatMap((s) => (s.tipo === "var" && !s.resolvido ? [[s.chave, s.rotulo] as const] : [])),
    ).values(),
  );

  function atualizarResponsavel(indice: number, campos: Partial<ResponsavelAluno>) {
    setResponsaveis((atual) => atual.map((item, i) => (i === indice ? { ...item, ...campos } : item)));
  }

  function adicionarResponsavel() {
    setResponsaveis((atual) => [...atual, { nome: "", parentesco: "mae", parentesco_desc: "", telefone: "" }].slice(0, 2));
  }

  function removerResponsavel(indice: number) {
    setResponsaveis((atual) => atual.filter((_, i) => i !== indice));
  }

  function salvarResponsaveis() {
    if (!matricula) {
      setErro("Aluno sem RA cadastrado — não é possível salvar responsáveis.");
      return;
    }
    setSalvando(true);
    setErro("");
    setAviso("");
    const limpos = responsaveis
      .map((r) => ({ ...r, nome: r.nome.trim(), telefone: apenasDigitos(r.telefone) }))
      .filter((r) => r.nome || r.telefone);
    onSalvarResponsaveis(matricula, limpos)
      .then(() => {
        setAviso("Responsáveis salvos.");
        setEditando(false);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)))
      .finally(() => setSalvando(false));
  }

  const carregarVariaveis = useCallback(
    (bim: string) => {
      if (!caminhoTurma || !matricula) {
        setVariaveis([]);
        return;
      }
      setCarregandoVariaveis(true);
      invokeApp<VariavelMensagem[]>("resolver_variaveis_mensagem", { caminho: caminhoTurma, matricula, bimestre: bim })
        .then(setVariaveis)
        .catch(() => setVariaveis([]))
        .finally(() => setCarregandoVariaveis(false));
    },
    [caminhoTurma, matricula],
  );

  function abrirComposer() {
    setComposerAberto(true);
    setErroComposer("");
    setDestinatarioIndice(0);
    const primeiro = mensagemTemplates[0];
    setTemplateId(primeiro?.id ?? "");
    setCorpo(primeiro?.corpo ?? "");
    setBimestreComposer(bimestre);
    carregarVariaveis(bimestre);
  }

  function trocarTemplate(id: string) {
    setTemplateId(id);
    setCorpo(mensagemTemplates.find((t) => t.id === id)?.corpo ?? "");
  }

  function restaurarModelo() {
    setCorpo(templateAtual?.corpo ?? "");
  }

  const resolverChip = useCallback(
    (chave: string) => {
      if (extras[chave] != null && extras[chave] !== "") {
        return { valor: extras[chave], rotulo: rotuloVariavel(chave), resolvido: true };
      }
      const v = variaveis.find((item) => item.chave === chave);
      if (v && v.disponivel) return { valor: v.valor, rotulo: v.rotulo, resolvido: true };
      return { rotulo: v?.rotulo ?? rotuloVariavel(chave), resolvido: false };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variaveis, destinatarioIndice, responsaveis],
  );

  async function enviarPeloWhatsapp() {
    if (!destinatario || !apenasDigitos(destinatario.telefone)) {
      setErroComposer("O responsável selecionado não tem telefone cadastrado.");
      return;
    }
    if (!textoParaEnviar.trim()) {
      setErroComposer("Escreva a mensagem antes de enviar.");
      return;
    }
    const aindaComVariaveis = /\{[a-z_]+\}/.test(textoParaEnviar);
    if (aindaComVariaveis && !window.confirm(
      "A mensagem ainda tem variáveis sem preenchimento (aparecem entre chaves). Enviar mesmo assim?",
    )) {
      return;
    }
    setEnviando(true);
    setErroComposer("");
    const numero = telefoneParaWhatsapp(destinatario.telefone);
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(textoParaEnviar)}`;
    try {
      await invokeApp("abrir_url", { url });
    } catch (err) {
      setErroComposer(`Não foi possível abrir o WhatsApp: ${err instanceof Error ? err.message : String(err)}`);
      setEnviando(false);
      return;
    }
    const confirmou = window.confirm(
      "A mensagem foi enviada pelo WhatsApp?\n\nClique OK para registrar este contato como atendimento do aluno.",
    );
    if (!confirmou) {
      setEnviando(false);
      return;
    }
    const assinatura = `\n\n— Enviado via WhatsApp para ${destinatario.nome || "responsável"} (${rotuloParentesco(destinatario)}) — ${formatarTelefoneBR(destinatario.telefone)}`;
    try {
      await onSalvarAtendimento(matricula, {
        data: new Date().toISOString().slice(0, 10),
        tipos: [TIPO_ATENDIMENTO_CONTATO_FAMILIA],
        atendido: "responsavel",
        atendido_nome: destinatario.nome || undefined,
        tags: templateAtual?.tags ?? [],
        descricao: `${textoParaEnviar}${assinatura}`,
        anexos: [],
        canal: "wa_me",
        modelo_id: templateAtual?.id,
      });
      setComposerAberto(false);
    } catch (err) {
      setErroComposer(`Mensagem aberta, mas o registro falhou: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="student-guardian-section" style={{ marginBottom: "1rem", border: "1px solid #e4e7ec", borderRadius: "0.6rem", padding: "0.9rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>Responsável</h3>
          <p style={{ margin: "0.15rem 0 0", color: "#667085", fontSize: "0.85rem" }}>
            Contato da família para envio de mensagens pelo WhatsApp.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {!editando && (
            <button type="button" className="secondary-action" onClick={() => setEditando(true)}>
              <Pencil size={15} /> Editar
            </button>
          )}
          <button
            type="button"
            className="primary-action"
            onClick={abrirComposer}
            disabled={!responsaveis.some((r) => apenasDigitos(r.telefone))}
            title={responsaveis.some((r) => apenasDigitos(r.telefone)) ? undefined : "Cadastre um telefone primeiro"}
          >
            Mensagem ao responsável
          </button>
        </div>
      </div>

      {erro && <div className="notice error kanban-notice">{erro}</div>}
      {aviso && <div className="notice success kanban-notice">{aviso}</div>}

      {!editando ? (
        responsaveis.length ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", display: "grid", gap: "0.35rem" }}>
            {responsaveis.map((r, i) => (
              <li key={i} style={{ fontSize: "0.9rem" }}>
                <strong>{r.nome || "(sem nome)"}</strong>
                <span style={{ color: "#667085" }}> — {rotuloParentesco(r)}</span>
                {apenasDigitos(r.telefone) ? <span> · {formatarTelefoneBR(r.telefone)}</span> : <span style={{ color: "#b42318" }}> · sem telefone</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: "0.5rem 0 0", color: "#667085", fontSize: "0.85rem" }}>Nenhum responsável cadastrado.</p>
        )
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.5rem" }}>
          {responsaveis.map((r, i) => (
            <div key={i} style={{ display: "grid", gap: "0.4rem", border: "1px solid #eef0f3", borderRadius: "0.5rem", padding: "0.6rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  value={r.nome}
                  onChange={(e) => atualizarResponsavel(i, { nome: e.target.value })}
                  placeholder="Nome do responsável"
                  style={{ flex: 1 }}
                />
                <button type="button" className="danger-action" onClick={() => removerResponsavel(i)}>Remover</button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <select
                  value={r.parentesco}
                  onChange={(e) => atualizarResponsavel(i, { parentesco: e.target.value })}
                >
                  {PARENTESCO_OPCOES.map((op) => (
                    <option key={op.valor} value={op.valor}>{op.rotulo}</option>
                  ))}
                </select>
                {r.parentesco === "outro" && (
                  <input
                    value={r.parentesco_desc ?? ""}
                    onChange={(e) => atualizarResponsavel(i, { parentesco_desc: e.target.value })}
                    placeholder="Qual? (ex.: avó, tio)"
                  />
                )}
                <input
                  value={r.telefone}
                  onChange={(e) => atualizarResponsavel(i, { telefone: e.target.value })}
                  onBlur={(e) => atualizarResponsavel(i, { telefone: apenasDigitos(e.target.value) })}
                  placeholder="Celular com DDD"
                  inputMode="numeric"
                  style={{ flex: 1, minWidth: "9rem" }}
                />
              </div>
            </div>
          ))}
          {responsaveis.length < 2 && (
            <button type="button" className="secondary-action" onClick={adicionarResponsavel}>
              <Plus size={15} /> Adicionar {responsaveis.length === 0 ? "responsável" : "2º responsável"}
            </button>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="primary-action" onClick={salvarResponsaveis} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar responsáveis"}
            </button>
            <button type="button" className="secondary-action" onClick={() => { setResponsaveis(aluno.responsaveis ?? []); setEditando(false); setErro(""); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {composerAberto && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="kanban-task-modal attendance-modal" style={{ maxWidth: "640px", width: "100%" }}>
            <div className="modal-title-row">
              <div>
                <h2>Mensagem ao responsável</h2>
                <p>O WhatsApp abre com o texto pronto; após enviar, o contato é registrado como atendimento.</p>
              </div>
              <button type="button" onClick={() => setComposerAberto(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="kanban-task-modal-body" style={{ display: "grid", gap: "0.75rem" }}>
              {erroComposer && <div className="notice error">{erroComposer}</div>}

              <label style={{ display: "grid", gap: "0.25rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Destinatário</span>
                {responsaveis.length > 1 ? (
                  <select value={destinatarioIndice} onChange={(e) => setDestinatarioIndice(Number(e.target.value))}>
                    {responsaveis.map((r, i) => (
                      <option key={i} value={i} disabled={!apenasDigitos(r.telefone)}>
                        {r.nome || "(sem nome)"} — {rotuloParentesco(r)} {apenasDigitos(r.telefone) ? `· ${formatarTelefoneBR(r.telefone)}` : "· sem telefone"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: "0.9rem" }}>
                    {destinatario ? `${destinatario.nome || "(sem nome)"} — ${rotuloParentesco(destinatario)} · ${formatarTelefoneBR(destinatario.telefone)}` : "Nenhum responsável"}
                  </span>
                )}
              </label>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <label style={{ display: "grid", gap: "0.25rem", flex: "2 1 220px" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Modelo</span>
                  <select value={templateId} onChange={(e) => trocarTemplate(e.target.value)}>
                    {mensagemTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.titulo || "(sem título)"}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: "0.25rem", flex: "1 1 120px" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Bimestre dos dados</span>
                  <select
                    value={bimestreComposer}
                    onChange={(e) => {
                      setBimestreComposer(e.target.value);
                      carregarVariaveis(e.target.value);
                    }}
                  >
                    <option value="1">1º bimestre</option>
                    <option value="2">2º bimestre</option>
                    <option value="3">3º bimestre</option>
                    <option value="4">4º bimestre</option>
                  </select>
                </label>
              </div>
              {bimestreComposer !== bimestre && (
                <span style={{ fontSize: "0.78rem", color: "#7a5b12" }}>
                  Usando dados do {bimestreComposer}º bimestre (diferente do bimestre atual do app).
                </span>
              )}

              {carregandoVariaveis && <span style={{ fontSize: "0.8rem", color: "#667085" }}>Carregando dados do aluno...</span>}

              <div style={{ display: "grid", gap: "0.35rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Mensagem — o que você vê é o que será enviado</span>
                  {corpo !== (templateAtual?.corpo ?? "") && (
                    <button
                      type="button"
                      onClick={restaurarModelo}
                      style={{ background: "none", border: "none", padding: 0, minHeight: 0, color: "#175cd3", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
                    >
                      ↺ Restaurar modelo
                    </button>
                  )}
                </div>
                <EditorMensagemChips
                  corpo={corpo}
                  segmentos={segmentos}
                  onCorpoChange={setCorpo}
                  resolverChip={resolverChip}
                />
              </div>

              {variaveisNaoResolvidas.length > 0 && (
                <div className="notice" style={{ background: "#fffaeb", border: "1px solid #f0c36d", color: "#7a5b12", fontSize: "0.82rem" }}>
                  Sem dado para este aluno (aparecem em amarelo): {variaveisNaoResolvidas.join(", ")}. Apague o trecho ou troque o bimestre antes de enviar.
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setComposerAberto(false)}>Cancelar</button>
              <button type="button" className="primary-action" onClick={enviarPeloWhatsapp} disabled={enviando}>
                {enviando ? "Abrindo..." : "Abrir no WhatsApp e registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AlunoDetalheGestao({
  aluno,
  bimestre,
  caminhoTurma,
  turmaLabel,
  onVoltar,
  catalogoDeficiencias,
  tiposAtendimento,
  encaminhamentoOpcoes,
  mensagemTemplates,
  onSalvarEducacaoEspecial,
  onSalvarAtendimento,
  onSalvarResponsaveis,
  tarefas,
  eventos,
  onOpenKanban,
}: {
  aluno: Aluno;
  bimestre: string;
  caminhoTurma?: string;
  turmaLabel?: string;
  onVoltar: () => void;
  catalogoDeficiencias: string[];
  tiposAtendimento: string[];
  encaminhamentoOpcoes: OpcaoEncaminhamento[];
  mensagemTemplates: MensagemTemplate[];
  onSalvarEducacaoEspecial: (matricula: string, deficiencias: string[], comentario: string) => Promise<void>;
  onSalvarAtendimento: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
  onSalvarResponsaveis: (matricula: string, responsaveis: ResponsavelAluno[]) => Promise<void>;
  tarefas: KanbanTarefa[];
  eventos: CalendarEvent[];
  onOpenKanban: () => void;
}) {
  const [aba, setAba] = useState<"desempenho" | "atendimentos" | "educacao" | "tarefas">("desempenho");
  const [deficienciasSelecionadas, setDeficienciasSelecionadas] = useState<string[]>(aluno.deficiencias);
  const [comentario, setComentario] = useState(aluno.comentarioEducacaoEspecial ?? "");
  const [novaCondicao, setNovaCondicao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [assistenteAberto, setAssistenteAberto] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState("");
  const [relatorioIa, setRelatorioIa] = useState("");
  const [promptManual, setPromptManual] = useState("");
  const [modalPromptManual, setModalPromptManual] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiAssistantSettings>(() => carregarAiAssistantSettings());
  const [modalAtendimento, setModalAtendimento] = useState<AtendimentoModalState | null>(null);
  const [abaFormularioAtendimento, setAbaFormularioAtendimento] = useState<"detalhes" | "anexos">("detalhes");
  const [dataAtendimento, setDataAtendimento] = useState(new Date().toISOString().slice(0, 10));
  const [tiposAtendimentoSelecionados, setTiposAtendimentoSelecionados] = useState<string[]>([]);
  const [atendido, setAtendido] = useState<"aluno" | "responsavel">("aluno");
  const [tagsAtendimento, setTagsAtendimento] = useState("");
  const [descricaoAtendimento, setDescricaoAtendimento] = useState("");
  const [anexosAtendimento, setAnexosAtendimento] = useState<AtendimentoAnexo[]>([]);
  const [erroAtendimento, setErroAtendimento] = useState("");
  const [salvandoAtendimento, setSalvandoAtendimento] = useState(false);
  const bimestreAtual = bimestreParaNumero(bimestre);
  const status = classificarAluno(aluno, bimestreAtual);
  const mediaAluno = calcularMediaAluno(aluno, bimestreAtual);
  const alturaLinhaGrafico = 22;
  const larguraGraficoAluno = 760;
  const alturaGraficoAluno = Math.max(180, 66 + aluno.disciplinas.length * alturaLinhaGrafico);
  const escalaGraficoAluno = 1.1;
  const graficoDisciplinas = aluno.disciplinas.map((disciplina, indice) => {
    const notas = notasBimestresDisciplina(disciplina, bimestreAtual);
    const pontos = notas
      .map((nota, bimestreIndice) => {
        if (nota === null) return null;
        const x = 220 + bimestreIndice * 150;
        const y = 46 + indice * alturaLinhaGrafico;
        return { x, y, nota, bimestre: bimestreIndice + 1 };
      })
      .filter((ponto): ponto is { x: number; y: number; nota: number; bimestre: number } => ponto !== null);

    return {
      nome: disciplina.nome,
      pontos,
    };
  });
  const opcoesDeficiencia = useMemo(() => {
    const itens = new Set([...catalogoDeficiencias, ...deficienciasSelecionadas].map((item) => item.trim()).filter(Boolean));
    return Array.from(itens).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [catalogoDeficiencias, deficienciasSelecionadas]);
  const tarefasDoAluno = useMemo(() => tarefasPorVinculo(tarefas, eventos, [aluno.nome, aluno.matricula ?? ""]), [tarefas, eventos, aluno.nome, aluno.matricula]);
  const podeGerarRelatorioIa = assistentePedagogicoDisponivel(aiSettings);
  const podeUsarPromptManual = assistenteManualDisponivel(aiSettings);

  useEffect(() => {
    setAba("desempenho");
    setDeficienciasSelecionadas(aluno.deficiencias);
    setComentario(aluno.comentarioEducacaoEspecial ?? "");
    setNovaCondicao("");
    setMensagem("");
    setErro("");
    setAssistenteAberto(false);
    setModalPromptManual(false);
    setPromptManual("");
    setErroRelatorio("");
    setRelatorioIa("");
    setAiSettings(carregarAiAssistantSettings());
    setModalAtendimento(null);
    setAbaFormularioAtendimento("detalhes");
    setDataAtendimento(new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados([]);
    setAtendido("aluno");
    setTagsAtendimento("");
    setDescricaoAtendimento("");
    setAnexosAtendimento([]);
    setErroAtendimento("");
  }, [aluno.matricula]);

  useEffect(() => {
    if (aba === "tarefas" && tarefasDoAluno.length === 0) {
      setAba("desempenho");
    }
  }, [aba, tarefasDoAluno.length]);

  function alternarDeficiencia(item: string) {
    setDeficienciasSelecionadas((atuais) => atuais.includes(item) ? atuais.filter((valor) => valor !== item) : [...atuais, item]);
  }

  function adicionarCondicao() {
    const texto = novaCondicao.trim();
    if (!texto) return;
    setDeficienciasSelecionadas((atuais) => atuais.some((item) => item.toLocaleLowerCase("pt-BR") === texto.toLocaleLowerCase("pt-BR")) ? atuais : [...atuais, texto]);
    setNovaCondicao("");
  }

  function salvarEducacaoEspecial() {
    if (!aluno.matricula) {
      setErro("Aluno sem matrícula cadastrada — não é possível salvar educação especial.");
      return;
    }
    setSalvando(true);
    setMensagem("");
    setErro("");
    onSalvarEducacaoEspecial(aluno.matricula, deficienciasSelecionadas, comentario)
      .then(() => setMensagem("Informações de educação especial salvas."))
      .catch((err) => setErro(String(err)))
      .finally(() => setSalvando(false));
  }

  function resetarFormularioAtendimento() {
    setDataAtendimento(new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados([]);
    setAtendido("aluno");
    setTagsAtendimento("");
    setDescricaoAtendimento("");
    setAnexosAtendimento([]);
    setErroAtendimento("");
    setAbaFormularioAtendimento("detalhes");
  }

  function preencherFormularioAtendimento(registro: AtendimentoAluno | AtendimentoFollowUp) {
    setDataAtendimento(registro.data || new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados(registro.tipos ?? []);
    setAtendido(registro.atendido === "responsavel" ? "responsavel" : "aluno");
    setTagsAtendimento((registro.tags ?? []).join(", "));
    setDescricaoAtendimento(registro.descricao ?? "");
    setAnexosAtendimento(registro.anexos ?? []);
    setErroAtendimento("");
    setAbaFormularioAtendimento("detalhes");
  }

  function abrirNovoAtendimento() {
    resetarFormularioAtendimento();
    setModalAtendimento({ modo: "novo" });
  }

  function abrirEdicaoAtendimento(atendimento: AtendimentoAluno) {
    preencherFormularioAtendimento(atendimento);
    setModalAtendimento({ modo: "editar", atendimento });
  }

  function abrirFollowUpAtendimento(atendimento: AtendimentoAluno) {
    setDataAtendimento(new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados(atendimento.tipos ?? []);
    setAtendido(atendimento.atendido === "responsavel" ? "responsavel" : "aluno");
    setTagsAtendimento((atendimento.tags ?? []).join(", "));
    setDescricaoAtendimento("");
    setAnexosAtendimento([]);
    setErroAtendimento("");
    setAbaFormularioAtendimento("detalhes");
    setModalAtendimento({ modo: "followup", atendimento });
  }

  function abrirEdicaoFollowUp(atendimento: AtendimentoAluno, followup: AtendimentoFollowUp) {
    preencherFormularioAtendimento(followup);
    setModalAtendimento({ modo: "editar-followup", atendimento, followup });
  }

  function fecharModalAtendimento() {
    setModalAtendimento(null);
    resetarFormularioAtendimento();
  }

  function alternarTipoAtendimento(tipo: string) {
    setTiposAtendimentoSelecionados((atuais) => (
      atuais.includes(tipo) ? atuais.filter((item) => item !== tipo) : [...atuais, tipo]
    ));
  }

  async function anexarArquivoAtendimento() {
    setErroAtendimento("");
    try {
      const selecionados = await abrirDialogoArquivo({
        multiple: true,
        title: "Selecionar anexos do atendimento",
      });
      const caminhos = Array.isArray(selecionados) ? selecionados : selecionados ? [selecionados] : [];
      if (!caminhos.length) return;
      const anexos = await Promise.all(
        caminhos.map((caminho) => invokeApp<AtendimentoAnexo>("preparar_anexo_atendimento", { caminho })),
      );
      setAnexosAtendimento((atuais) => [...atuais, ...anexos]);
    } catch (err) {
      setErroAtendimento(err instanceof Error ? err.message : String(err));
    }
  }

  function removerAnexoAtendimento(id: string) {
    setAnexosAtendimento((atuais) => atuais.filter((anexo) => anexo.id !== id));
  }

  async function abrirAnexoAtendimento(anexo: AtendimentoAnexo) {
    if (!anexo.caminho) return;
    try {
      await invokeApp("abrir_anexo_atendimento", { caminho: anexo.caminho });
    } catch (err) {
      setErroAtendimento(err instanceof Error ? err.message : String(err));
    }
  }

  function salvarAtendimento(event?: FormEvent) {
    event?.preventDefault();
    if (!aluno.matricula) {
      setErroAtendimento("Aluno sem matrícula cadastrada — não é possível salvar atendimento.");
      return;
    }
    setErroAtendimento("");
    setMensagem("");
    if (!dataAtendimento) {
      setErroAtendimento("Informe a data do atendimento.");
      return;
    }
    if (!tiposAtendimentoSelecionados.length) {
      setErroAtendimento("Selecione ao menos um tipo de atendimento.");
      return;
    }
    if (!descricaoAtendimento.trim()) {
      setErroAtendimento("Descreva o atendimento realizado.");
      return;
    }
    const input: AtendimentoAlunoInput = {
      data: dataAtendimento,
      tipos: tiposAtendimentoSelecionados,
      atendido,
      tags: tagsAtendimento.split(",").map((item) => item.trim()).filter(Boolean),
      descricao: descricaoAtendimento,
      anexos: anexosAtendimento,
    };
    if (modalAtendimento?.modo === "editar") {
      input.id = modalAtendimento.atendimento.id;
    }
    if (modalAtendimento?.modo === "followup") {
      input.parent_id = modalAtendimento.atendimento.id;
    }
    if (modalAtendimento?.modo === "editar-followup") {
      input.id = modalAtendimento.followup.id;
      input.parent_id = modalAtendimento.atendimento.id;
    }
    setSalvandoAtendimento(true);
    onSalvarAtendimento(aluno.matricula, input)
      .then(() => {
        const mensagemSucesso = modalAtendimento?.modo === "followup"
          ? "Seguimento registrado."
          : modalAtendimento?.modo === "editar" || modalAtendimento?.modo === "editar-followup"
            ? "Atendimento atualizado."
            : "Atendimento registrado.";
        setMensagem(mensagemSucesso);
        fecharModalAtendimento();
      })
      .catch((err) => setErroAtendimento(err instanceof Error ? err.message : String(err)))
      .finally(() => setSalvandoAtendimento(false));
  }

  async function gerarRelatorio() {
    setAiSettings(carregarAiAssistantSettings());
    setAssistenteAberto(true);
    setGerandoRelatorio(true);
    setErroRelatorio("");
    setRelatorioIa("");
    try {
      const texto = await gerarRelatorioPedagogico(carregarAiAssistantSettings(), {
        aluno,
        bimestre,
        turma: turmaLabel,
        tarefas: tarefasDoAluno.map((tarefa) => ({
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          prazo: tarefa.prazo,
          prioridade: tarefa.prioridade,
          status: tarefa.status,
        })),
      });
      setRelatorioIa(texto);
    } catch (err) {
      setErroRelatorio(err instanceof Error ? err.message : String(err));
    } finally {
      setGerandoRelatorio(false);
    }
  }

  async function copiarRelatorio() {
    if (!relatorioIa.trim()) return;
    await navigator.clipboard.writeText(relatorioIa);
    setMensagem("Relatório copiado para a área de transferência.");
  }

  function abrirPromptManual() {
    const prompt = montarPromptRelatorioPedagogico({
      aluno,
      bimestre,
      turma: turmaLabel,
      tarefas: tarefasDoAluno.map((tarefa) => ({
        titulo: tarefa.titulo,
        descricao: tarefa.descricao,
        prazo: tarefa.prazo,
        prioridade: tarefa.prioridade,
        status: tarefa.status,
      })),
    });
    setPromptManual(prompt);
    setModalPromptManual(true);
  }

  async function copiarPromptManual() {
    if (!promptManual.trim()) return;
    await navigator.clipboard.writeText(promptManual);
    setMensagem("Prompt copiado para colar na IA escolhida.");
  }

  async function abrirCopilotComPrompt() {
    await copiarPromptManual();
    abrirLinkExterno("https://copilot.microsoft.com");
  }

  async function abrirChatGptComPrompt() {
    await copiarPromptManual();
    abrirLinkExterno("https://chatgpt.com");
  }

  function abrirLinkExterno(url: string) {
    if (tauriDisponivel) {
      invokeApp("abrir_url", { url }).catch((err) => setErro(String(err)));
      return;
    }
    window.open(url, "_blank");
  }

  function onGerarRelatorioClick() {
    if (podeUsarPromptManual) {
      abrirPromptManual();
      return;
    }
    gerarRelatorio();
  }

  const atendimentosAluno = aluno.atendimentos ?? [];
  const totalFollowUps = atendimentosAluno.reduce((total, atendimento) => total + (atendimento.followups?.length ?? 0), 0);
  const opcoesTipoAtendimento = Array.from(new Set([
    ...normalizarTiposAtendimento(tiposAtendimento),
    ...tiposAtendimentoSelecionados,
  ])).filter(Boolean);
  const sugestoesTagsAtendimento = useMemo(() => {
    const todas = new Set<string>();
    for (const template of mensagemTemplates) template.tags.forEach((t) => t.trim() && todas.add(t.trim()));
    for (const atendimento of atendimentosAluno) {
      atendimento.tags.forEach((t) => t.trim() && todas.add(t.trim()));
      (atendimento.followups ?? []).forEach((f) => f.tags.forEach((t) => t.trim() && todas.add(t.trim())));
    }
    return Array.from(todas).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [mensagemTemplates, atendimentosAluno]);
  const tituloModalAtendimento = modalAtendimento?.modo === "editar"
    ? "Editar atendimento"
    : modalAtendimento?.modo === "followup"
      ? "Seguir atendimento"
      : modalAtendimento?.modo === "editar-followup"
        ? "Editar seguimento"
        : "Registrar atendimento";
  const descricaoModalAtendimento = modalAtendimento?.modo === "followup" || modalAtendimento?.modo === "editar-followup"
      ? "Inclua uma nova etapa na timeline deste caso."
    : "Registre o contato realizado pela coordenação.";
  const rotuloBotaoSalvarAtendimento = salvandoAtendimento
    ? "Salvando..."
    : modalAtendimento?.modo === "editar" || modalAtendimento?.modo === "editar-followup"
      ? "Salvar alterações"
      : modalAtendimento?.modo === "followup"
        ? "Seguir atendimento"
        : "Registrar atendimento";

  return (
    <section className="panel student-profile-panel">
      <button className="back-link student-profile-back" onClick={onVoltar}>← Voltar para alunos</button>
      <header className="student-profile-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <FotoAluno matricula={aluno.matricula} tamanho={64} />
          <div>
            <h2>{aluno.nome}</h2>
            <p>RA: {aluno.matricula ?? "-"} | Média: {formatarMediaGlobal(mediaAluno)} | Frequência: {formatarPercentual(aluno.frequencia)}</p>
          </div>
        </div>
        <div className="student-profile-actions no-print">
          {aba === "desempenho" && (
          <button type="button" className="secondary-action" onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir notas e parecer
          </button>
          )}
          {(podeGerarRelatorioIa || podeUsarPromptManual) && (
          <button type="button" className="ai-report-action" onClick={onGerarRelatorioClick}>
            <Sparkles size={17} />
            Gerar relatório
          </button>
          )}
          <span className={`class-status-pill ${status}`}>{rotuloClassificacao(status)}</span>
        </div>
      </header>

      <div className="student-profile-tabs">
        <button className={aba === "desempenho" ? "active" : ""} onClick={() => setAba("desempenho")}>Desempenho</button>
        <button className={aba === "atendimentos" ? "active" : ""} onClick={() => setAba("atendimentos")}>Atendimentos ({aluno.atendimentos?.length ?? 0})</button>
        {tarefasDoAluno.length > 0 && (
          <button className={aba === "tarefas" ? "active" : ""} onClick={() => setAba("tarefas")}>Tarefas ({tarefasDoAluno.length})</button>
        )}
        {aluno.elegivel && (
          <button className={aba === "educacao" ? "active" : ""} onClick={() => setAba("educacao")}>Educação Especial</button>
        )}
      </div>

      {aba === "desempenho" && (
      <>
      {aluno.diagnosticoAprendizagem && (
        <section className="student-diagnostic-panel">
          <div className="student-chart-heading">
            <h3>Diagnóstico SARESP</h3>
            {aluno.diagnosticoAprendizagem.turma_origem && <span>{aluno.diagnosticoAprendizagem.turma_origem}</span>}
          </div>
          <div className="student-diagnostic-grid">
            <DiagnosticSubjectCard titulo="Português" diagnostico={aluno.diagnosticoAprendizagem.portugues} />
            <DiagnosticSubjectCard titulo="Matemática" diagnostico={aluno.diagnosticoAprendizagem.matematica} />
          </div>
        </section>
      )}
      <section className="student-performance-grid">
        <article className="student-subject-evolution">
          <div className="student-chart-heading">
            <h3>Evolução por Disciplina</h3>
          </div>
          <div className="student-chart-scroll">
          <svg
            className="student-multi-line-chart"
            width={larguraGraficoAluno * escalaGraficoAluno}
            height={alturaGraficoAluno * escalaGraficoAluno}
            viewBox={`0 0 ${larguraGraficoAluno} ${alturaGraficoAluno}`}
            role="img"
            aria-label="Evolução das notas por disciplina"
          >
            {[1, 2, 3, 4].map((bim, indice) => {
              const x = 220 + indice * 150;
              return (
                <g key={bim}>
                  <line x1={x} x2={x} y1="40" y2={alturaGraficoAluno - 34} />
                  <text x={x} y="24">{bim}º bim</text>
                </g>
              );
            })}
            {graficoDisciplinas.map((disciplina, indice) => {
              const y = 46 + indice * alturaLinhaGrafico;
              return (
              <g key={disciplina.nome}>
                  <line className="student-subject-row-line" x1="160" x2="690" y1={y} y2={y} />
                  <text className="student-subject-axis-label" x="24" y={y + 4}>{abreviarDisciplina(disciplina.nome)}</text>
                {disciplina.pontos.map((ponto) => (
                  <g key={`${disciplina.nome}-${ponto.bimestre}`}>
                    <circle className={`student-grade-dot ${classeNota(ponto.nota)}`} cx={ponto.x} cy={ponto.y} r="3.8">
                    <title>{`${disciplina.nome} - ${ponto.bimestre}º bimestre: ${formatarNota(ponto.nota)}`}</title>
                  </circle>
                    <text className="student-grade-dot-label" x={ponto.x + 10} y={ponto.y + 4}>{formatarNota(ponto.nota)}</text>
                  </g>
                ))}
              </g>
              );
            })}
          </svg>
          </div>
          <div className="student-chart-legend">
            <span><i className="adequada" />Acima da média</span>
            <span><i className="cuidado" />Exatamente 5</span>
            <span><i className="abaixo" />Abaixo</span>
            <span><i className="sem-nota" />Sem nota</span>
          </div>
        </article>
      </section>

      <div className="printable-student-report">
      <div className="print-only print-report-header">
        <h2>{aluno.nome}</h2>
        <p>
          {turmaLabel ? `Turma: ${turmaLabel} | ` : ""}
          RA: {aluno.matricula ?? "-"} | Média: {formatarMediaGlobal(mediaAluno)} | Frequência: {formatarPercentual(aluno.frequencia)}
        </p>
      </div>

      <section className="student-subjects-section">
        <h3>Notas por Disciplina</h3>
        <div className="student-subjects-table-wrap">
          <table className="student-subjects-table">
            <thead>
              <tr><th>Disciplina</th><th>1º Bim</th><th>2º Bim</th><th>3º Bim</th><th>4º Bim</th><th>5º Conceito</th><th>Média</th><th>Freq.</th></tr>
            </thead>
            <tbody>
              {aluno.disciplinas.map((disciplina) => {
                const nota = disciplina.mediaConselho ?? disciplina.mediaOriginal;
                const mediaDisciplina = calcularMediaDisciplina(disciplina, bimestreAtual);
                const frequencia = calcularFrequenciaDisciplina(disciplina);
                const diagnosticoDisciplina = diagnosticoSarespPorDisciplina(aluno.diagnosticoAprendizagem, disciplina.nome);
                return (
                  <tr key={disciplina.nome}>
                    <td>
                      <strong>{disciplina.nome}</strong>
                      {diagnosticoDisciplina && (
                        <span className="subject-diagnostic-tags">
                          <i className={`diagnostic-level-tag ${classeStatusDiagnostico(diagnosticoDisciplina.status ?? "")}`}>{diagnosticoDisciplina.status ?? "-"}</i>
                          {diagnosticoDisciplina.mensurado && diagnosticoDisciplina.aprendizagem_equivalente && (
                            <i className="diagnostic-year-tag">{diagnosticoDisciplina.aprendizagem_equivalente}</i>
                          )}
                          {diagnosticoDisciplina.evolucao && (
                            <i className={`diagnostic-evolution-tag ${classeEvolucao(diagnosticoDisciplina.evolucao)}`} title={`AvD1 → AvD2: ${diagnosticoDisciplina.evolucao}`}>
                              {setaEvolucao(diagnosticoDisciplina.evolucao)} {diagnosticoDisciplina.evolucao}
                            </i>
                          )}
                        </span>
                      )}
                    </td>
                    {[1, 2, 3, 4].map((indice) => {
                      const eAtual = indice === bimestreAtual;
                      const notaBim = eAtual
                        ? nota
                        : (disciplina.historicoBimestres ?? []).find(
                            (hb) => Number.parseInt(hb.bimestre, 10) === indice
                          )?.media ?? null;
                      const tooltip = eAtual ? formatarAtribuicao(disciplina.atribuicaoMedia) : null;
                      return (
                        <td key={indice} className={classeTextoNota(notaBim)} title={tooltip ?? undefined}>
                          {formatarNota(notaBim)}
                        </td>
                      );
                    })}
                    <td className={classeTextoNota(disciplina.quintoConceito)}>{formatarNota(disciplina.quintoConceito)}</td>
                    <td className={classeTextoNota(mediaDisciplina)}>{formatarNota(mediaDisciplina)}</td>
                    <td className={frequencia !== null && frequencia >= 75 ? "success-text" : "danger-text"}>{formatarPercentual(frequencia)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="student-council-note">
        <h3>Parecer do Conselho</h3>
        <div className="council-note-bimesters">
          {[1, 2, 3, 4].map((indice) => {
            const codigos = (aluno.encaminhamentosBimestres ?? []).find(
              (item) => Number.parseInt(item.bimestre, 10) === indice
            )?.codigos ?? [];
            const textos = codigos
              .map((codigo) => encaminhamentoOpcoes.find((opcao) => opcao.numero === codigo)?.texto)
              .filter((texto): texto is string => Boolean(texto));
            return (
              <div className="council-note-bimester" key={indice}>
                <h4>{indice}º Bimestre</h4>
                {textos.length ? (
                  <ul>
                    {textos.map((texto, indiceTexto) => (
                      <li key={indiceTexto}>{texto}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="council-note-empty">Nenhum encaminhamento registrado.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
      </div>
      </>
      )}

      {aba === "atendimentos" && (
        <section className="student-attendance-section">
          <PainelResponsaveisEMensagem
            aluno={aluno}
            bimestre={bimestre}
            caminhoTurma={caminhoTurma}
            mensagemTemplates={mensagemTemplates}
            onSalvarResponsaveis={onSalvarResponsaveis}
            onSalvarAtendimento={onSalvarAtendimento}
          />
          <div className="panel-heading attendance-heading">
            <div>
              <h3>Atendimentos</h3>
              <p>Histórico de casos e seguimentos registrados para este aluno.</p>
            </div>
            <button type="button" className="primary-action" onClick={abrirNovoAtendimento} disabled={!opcoesTipoAtendimento.length}>
              <Plus size={17} />
              Registrar atendimento
            </button>
          </div>
          {mensagem && <div className="notice success kanban-notice">{mensagem}</div>}
          {erroAtendimento && !modalAtendimento && <div className="notice error kanban-notice">{erroAtendimento}</div>}
          {!opcoesTipoAtendimento.length && (
            <div className="empty-special-list">Configure os tipos de atendimento em Configurações antes de registrar novos casos.</div>
          )}

          <div className="attendance-summary-row">
            <article>
              <span>Casos</span>
              <strong>{atendimentosAluno.length}</strong>
            </article>
            <article>
              <span>Seguimentos</span>
              <strong>{totalFollowUps}</strong>
            </article>
            <article>
              <span>Tipos configurados</span>
              <strong>{opcoesTipoAtendimento.length}</strong>
            </article>
          </div>

          <div className="attendance-history-list">
            {atendimentosAluno.length ? atendimentosAluno.map((atendimento) => (
              <article className="attendance-history-card" key={atendimento.id}>
                <header>
                  <div>
                    <strong>{formatarDataAtendimento(atendimento.data)}</strong>
                    <span>{atendimento.tipos.join(", ")} · {rotuloAtendidoAtendimento(atendimento.atendido)}</span>
                  </div>
                  <div className="attendance-card-actions">
                    <button type="button" onClick={() => abrirFollowUpAtendimento(atendimento)}>
                      <Plus size={14} />
                      Seguir atendimento
                    </button>
                    <button type="button" onClick={() => abrirEdicaoAtendimento(atendimento)} aria-label="Editar atendimento">
                      <Pencil size={14} />
                    </button>
                  </div>
                </header>
                {atendimento.tags.length > 0 && (
                  <div className="attendance-tags">
                    {atendimento.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                )}
                <p className="attendance-card-description">{atendimento.descricao}</p>
                <div className="attendance-card-meta">
                  <span><CalendarClock size={14} />{1 + (atendimento.followups?.length ?? 0)} item(ns) na timeline</span>
                  {atendimento.anexos.length > 0 && <span><Paperclip size={14} />{atendimento.anexos.length} anexo(s)</span>}
                </div>
                {atendimento.anexos.length > 0 && (
                  <div className="attendance-attachments saved compact">
                    {atendimento.anexos.map((anexo) => (
                      <button key={anexo.id} type="button" onClick={() => abrirAnexoAtendimento(anexo)}>
                        <FileText size={14} />
                        {anexo.nome}
                      </button>
                    ))}
                  </div>
                )}
                {(atendimento.followups?.length ?? 0) > 0 && (
                  <div className="attendance-timeline">
                    {atendimento.followups?.map((followup) => (
                      <div className="attendance-timeline-item" key={followup.id}>
                        <div>
                          <strong>{formatarDataAtendimento(followup.data)}</strong>
                          <span>{followup.tipos.join(", ")} · {rotuloAtendidoAtendimento(followup.atendido)}</span>
                        </div>
                        <p>{followup.descricao}</p>
                        {followup.tags.length > 0 && (
                          <div className="attendance-tags">
                            {followup.tags.map((tag) => <span key={tag}>{tag}</span>)}
                          </div>
                        )}
                        {followup.anexos.length > 0 && (
                          <div className="attendance-attachments saved compact">
                            {followup.anexos.map((anexo) => (
                              <button key={anexo.id} type="button" onClick={() => abrirAnexoAtendimento(anexo)}>
                                <FileText size={14} />
                                {anexo.nome}
                              </button>
                            ))}
                          </div>
                        )}
                        <button type="button" className="attendance-timeline-edit" onClick={() => abrirEdicaoFollowUp(atendimento, followup)}>
                          <Pencil size={13} />
                          Editar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )) : (
              <div className="empty-special-list">Nenhum atendimento registrado para este aluno.</div>
            )}
          </div>
        </section>
      )}

      {aba === "educacao" && aluno.elegivel && (
        <section className="special-education-panel">
          <div>
            <h3>Condições registradas</h3>
            <p>Marque as condições que devem ficar registradas na gestão da turma. Essas informações não aparecem na tela projetada do conselho.</p>
          </div>
          <div className="special-condition-grid">
            {opcoesDeficiencia.length ? opcoesDeficiencia.map((item) => (
              <button
                key={item}
                className={deficienciasSelecionadas.includes(item) ? "selected" : ""}
                onClick={() => alternarDeficiencia(item)}
                type="button"
              >
                {item}
              </button>
            )) : (
              <span className="empty-special-list">Nenhuma condição cadastrada ainda. Crie uma nova condição abaixo.</span>
            )}
          </div>
          <div className="special-add-row">
            <input
              value={novaCondicao}
              onChange={(event) => setNovaCondicao(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") adicionarCondicao();
              }}
              placeholder="Adicionar nova condição"
            />
            <button type="button" onClick={adicionarCondicao}>Adicionar</button>
          </div>
          <label className="special-comment">
            Comentário complementar
            <textarea
              value={comentario}
              onChange={(event) => setComentario(event.target.value)}
              placeholder="Registre orientações internas, observações pedagógicas ou informações complementares necessárias."
            />
          </label>
          <div className="special-actions">
            <button className="primary-action" onClick={salvarEducacaoEspecial} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar educação especial"}
            </button>
            {mensagem && <span className="success-text">{mensagem}</span>}
            {erro && <span className="danger-text">{erro}</span>}
          </div>
        </section>
      )}

      {aba === "tarefas" && (
        <section className="linked-tasks-panel student-linked-tasks">
          <div className="panel-heading">
            <div>
              <h3>Tarefas associadas ao aluno</h3>
              <p>Cards vinculados ao nome ou RA do estudante.</p>
            </div>
          </div>
          <TaskLinkList tarefas={tarefasDoAluno} eventos={eventos} emptyText="Nenhuma tarefa vinculada a este aluno." onOpenKanban={onOpenKanban} />
        </section>
      )}

      {modalAtendimento && (
        <div className="modal-backdrop">
          <form className="kanban-task-modal attendance-modal" onSubmit={salvarAtendimento}>
            <div className="modal-title-row">
              <div>
                <h2>{tituloModalAtendimento}</h2>
                <p>{descricaoModalAtendimento}</p>
              </div>
              <button type="button" onClick={fecharModalAtendimento} aria-label="Fechar atendimento">
                <X size={18} />
              </button>
            </div>
            {(modalAtendimento.modo === "followup" || modalAtendimento.modo === "editar-followup") && (
              <div className="attendance-parent-case">
                <span>Caso principal</span>
                <strong>{formatarDataAtendimento(modalAtendimento.atendimento.data)} · {modalAtendimento.atendimento.tipos.join(", ")}</strong>
              </div>
            )}
            <div className="kanban-task-tabs" role="tablist" aria-label="Seções do atendimento">
              {[
                { id: "detalhes", label: "Detalhes" },
                { id: "anexos", label: "Anexos" },
              ].map((abaFormulario) => (
                <button
                  key={abaFormulario.id}
                  type="button"
                  className={abaFormularioAtendimento === abaFormulario.id ? "active" : ""}
                  onClick={() => setAbaFormularioAtendimento(abaFormulario.id as "detalhes" | "anexos")}
                  role="tab"
                  aria-selected={abaFormularioAtendimento === abaFormulario.id}
                >
                  {abaFormulario.label}
                </button>
              ))}
            </div>
            <div className="kanban-task-modal-body">
              {abaFormularioAtendimento === "detalhes" && (
                <div className="kanban-task-tab-panel">
                  <div className="kanban-form-grid">
                    <label>
                      Data
                      <input type="date" value={dataAtendimento} onChange={(event) => setDataAtendimento(event.target.value)} autoFocus />
                    </label>
                    <label>
                      Atendido
                      <select value={atendido} onChange={(event) => setAtendido(event.target.value as "aluno" | "responsavel")}>
                        <option value="aluno">Aluno</option>
                        <option value="responsavel">Responsável</option>
                      </select>
                    </label>
                  </div>
                  <div className="attendance-type-picker">
                    <span>Tipos de atendimento</span>
                    <div>
                      {opcoesTipoAtendimento.length ? opcoesTipoAtendimento.map((tipo) => (
                        <button
                          key={tipo}
                          type="button"
                          className={tiposAtendimentoSelecionados.includes(tipo) ? "selected" : ""}
                          onClick={() => alternarTipoAtendimento(tipo)}
                        >
                          {tipo}
                        </button>
                      )) : (
                        <em>Configure os tipos de atendimento em Configurações.</em>
                      )}
                    </div>
                  </div>
                  <label>
                    Tags
                    <TagsInput
                      value={tagsAtendimento}
                      onChange={setTagsAtendimento}
                      sugestoes={sugestoesTagsAtendimento}
                      placeholder="Ex.: agressão, desrespeito, orientação familiar"
                    />
                    <span className="kanban-form-hint">Digite e tecle vírgula ou Enter para criar a tag.</span>
                  </label>
                  <label>
                    Descrição do ocorrido
                    <textarea
                      value={descricaoAtendimento}
                      onChange={(event) => setDescricaoAtendimento(event.target.value)}
                      placeholder="Registre o contexto, encaminhamentos combinados e próximos passos."
                    />
                  </label>
                </div>
              )}

              {abaFormularioAtendimento === "anexos" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Anexos
                    <button type="button" className="kanban-file-picker" onClick={anexarArquivoAtendimento} disabled={!tauriDisponivel}>
                      <Paperclip size={16} />
                      <strong>Selecionar arquivos</strong>
                      <small>{anexosAtendimento.length ? `${anexosAtendimento.length} arquivo(s) anexado(s)` : "Nenhum arquivo anexado"}</small>
                    </button>
                  </label>
                  {anexosAtendimento.length > 0 && (
                    <div className="kanban-attachment-list">
                      {anexosAtendimento.map((anexo) => (
                        <span key={anexo.id}>
                          <Paperclip size={14} />
                          {anexo.nome}
                          {anexo.caminho && (
                            <button type="button" onClick={() => abrirAnexoAtendimento(anexo)} aria-label={`Abrir ${anexo.nome}`}>
                              <FileText size={13} />
                            </button>
                          )}
                          <button type="button" onClick={() => removerAnexoAtendimento(anexo.id)} aria-label={`Remover ${anexo.nome}`}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {erroAtendimento && <div className="attendance-modal-error">{erroAtendimento}</div>}
            <div className="modal-actions">
              <button type="button" onClick={fecharModalAtendimento}>Cancelar</button>
              <button type="submit" className="primary-action" disabled={salvandoAtendimento || !opcoesTipoAtendimento.length}>
                {rotuloBotaoSalvarAtendimento}
              </button>
            </div>
          </form>
        </div>
      )}

      {assistenteAberto && (
        <AssistenteRelatorioModal
          settings={aiSettings}
          alunoNome={aluno.nome}
          texto={relatorioIa}
          erro={erroRelatorio}
          gerando={gerandoRelatorio}
          onTextoChange={setRelatorioIa}
          onCopiar={copiarRelatorio}
          onTentarNovamente={gerarRelatorio}
          onFechar={() => setAssistenteAberto(false)}
        />
      )}
      {modalPromptManual && (
        <PromptManualModal
          prompt={promptManual}
          onCopiar={copiarPromptManual}
          onAbrirCopilot={abrirCopilotComPrompt}
          onAbrirChatGpt={abrirChatGptComPrompt}
          onFechar={() => setModalPromptManual(false)}
        />
      )}
    </section>
  );
}

function formatarDataAtendimento(data: string) {
  if (!data) return "-";
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function rotuloAtendidoAtendimento(atendido: string) {
  return atendido === "responsavel" ? "Responsável" : "Aluno";
}

function AssistenteRelatorioModal({
  settings,
  alunoNome,
  texto,
  erro,
  gerando,
  onTextoChange,
  onCopiar,
  onTentarNovamente,
  onFechar,
}: {
  settings: AiAssistantSettings;
  alunoNome: string;
  texto: string;
  erro: string;
  gerando: boolean;
  onTextoChange: (texto: string) => void;
  onCopiar: () => void;
  onTentarNovamente: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="ai-report-modal" role="dialog" aria-modal="true" aria-labelledby="ai-report-title">
        <header>
          <div>
            <span className="eyebrow">Assistente Pedagógico</span>
            <h2 id="ai-report-title">Relatório de {alunoNome}</h2>
            <p>{settings.provider === "ollama" ? "Ollama local" : "Gemini"} · {settings.model}</p>
          </div>
          <button type="button" className="icon-action" onClick={onFechar} aria-label="Fechar relatório">
            <X size={18} />
          </button>
        </header>
        <div className="ai-report-privacy-note">
          Este texto é um rascunho. Revise o conteúdo antes de usar em ata, reunião ou documento oficial.
        </div>
        {gerando ? (
          <div className="ai-report-loading">
            <Sparkles size={22} />
            <strong>Gerando rascunho pedagógico...</strong>
            <span>A IA está lendo apenas o resumo estruturado deste aluno.</span>
          </div>
        ) : erro ? (
          <div className="ai-report-error">
            <strong>Não foi possível gerar o relatório.</strong>
            <span>{erro}</span>
            <button type="button" onClick={onTentarNovamente}>Tentar novamente</button>
          </div>
        ) : (
          <textarea
            value={texto}
            onChange={(event) => onTextoChange(event.target.value)}
            placeholder="O rascunho gerado aparecerá aqui."
          />
        )}
        <footer>
          <button type="button" onClick={onFechar}>Fechar</button>
          <button type="button" className="primary-action" onClick={onCopiar} disabled={!texto.trim() || gerando}>
            <Copy size={16} />
            Copiar texto
          </button>
        </footer>
      </section>
    </div>
  );
}

function PromptManualModal({
  prompt,
  onCopiar,
  onAbrirCopilot,
  onAbrirChatGpt,
  onFechar,
}: {
  prompt: string;
  onCopiar: () => void;
  onAbrirCopilot: () => void;
  onAbrirChatGpt: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="ai-report-modal manual-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="manual-prompt-title">
        <header>
          <div>
            <span className="eyebrow">Assistente Pedagógico</span>
            <h2 id="manual-prompt-title">Gerar relatório em modo manual</h2>
            <p>Use o prompt em uma IA aberta pela sua própria conta.</p>
          </div>
          <button type="button" className="icon-action" onClick={onFechar} aria-label="Fechar instruções">
            <X size={18} />
          </button>
        </header>
        <div className="ai-report-privacy-note">
          O CoordenaçãoOP não envia os dados neste modo. Ao colar o texto em outro serviço, revise as regras de privacidade e autorização da escola.
        </div>
        <div className="manual-prompt-steps">
          <strong>Como usar</strong>
          <span>1. Clique em copiar prompt ou abra o Copilot/ChatGPT por aqui.</span>
          <span>2. Cole o texto na conversa da IA escolhida.</span>
          <span>3. Revise cuidadosamente o relatório antes de usar em ata, reunião ou documento oficial.</span>
        </div>
        <textarea readOnly value={prompt} />
        <footer>
          <button type="button" onClick={onFechar}>Fechar</button>
          <button type="button" onClick={onCopiar}>
            <Copy size={16} />
            Copiar prompt
          </button>
          <button type="button" className="primary-action" onClick={onAbrirCopilot}>Abrir Copilot</button>
          <button type="button" className="primary-action" onClick={onAbrirChatGpt}>Abrir ChatGPT</button>
        </footer>
      </section>
    </div>
  );
}
