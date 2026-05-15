import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  Check,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Home,
  Menu,
  Minus,
  Pencil,
  Plus,
  Search,
  Settings,
  TrendingUp,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import brandLogo from "./assets/logo.png";

type Tela = "dashboard" | "turmas" | "gestao-turma" | "importar-dados" | "importar-notas" | "importar-elegiveis" | "conselhos" | "conselho" | "relatorios" | "relatorio-criticos" | "relatorio-alteracoes-notas" | "configuracoes";

const CICLOS_TURMA: Record<string, string[]> = {
  EI: ["Berçário I", "Berçário II", "Maternal I", "Maternal II", "Pré-escola I", "Pré-escola II"],
  EFAI: ["1º Ano", "2º Ano", "3º Ano", "4º Ano", "5º Ano"],
  EFAF: ["6º Ano", "7º Ano", "8º Ano", "9º Ano"],
  EM: ["1ª Série", "2ª Série", "3ª Série"],
};

const PERIODOS_TURMA = ["MANHA", "TARDE", "NOITE", "INTEGRAL (9 HORAS)", "INTEGRAL (7 HORAS)"];

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
};

type NotaBimestre = {
  bimestre: string;
  media: number;
};

type Aluno = {
  matricula?: string;
  chamada: number;
  nome: string;
  elegivel: boolean;
  liderancaSala?: "lider" | "vice" | null;
  deficiencias: string[];
  comentarioEducacaoEspecial?: string | null;
  frequencia: number | null;
  encaminhamentos: number[];
  disciplinas: Disciplina[];
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
  conselhos_com_ajustes: number;
  conselho_finalizado: boolean;
  caminho: string;
};

type TurmaDetalhe = {
  codigo: string;
  ano: number;
  coordenador_turma: string | null;
  bimestre: string;
  tempo_conselho_segundos: number;
  texto_ata: string;
  alunos: AlunoApi[];
};

type ConfiguracoesApp = {
  direcao_nome: string;
  direcao_pronome: string;
  nota_minima: number;
  cabecalho_ata: string | null;
};

type BackupResultado = {
  caminho: string | null;
  arquivos: number;
  arquivos_importados: number;
  conflitos: string[];
  backup_seguranca: string | null;
};

type DocumentoConselho = {
  tipo: "ata" | "relatorio";
  bimestre: string;
  caminho: string;
};

type AtualizacaoInfo = {
  versao_atual: string;
  versao_disponivel: string | null;
  disponivel: boolean;
  url: string | null;
  mensagem: string;
};

type AlunoApi = {
  matricula: string;
  nome: string;
  numero_chamada: number | null;
  elegivel: boolean;
  lideranca_sala: "lider" | "vice" | null;
  deficiencias: string[];
  comentario_educacao_especial: string | null;
  frequencia_percentual: number | null;
  encaminhamentos: number[];
  disciplinas: DisciplinaApi[];
};

type DisciplinaApi = {
  nome: string;
  media_original: number | null;
  media_conselho: number | null;
  quinto_conceito: number | null;
  observacao_conselho: string | null;
  faltas: number | null;
  total_aulas: number | null;
  faltas_acumuladas: number | null;
  total_aulas_acumuladas: number | null;
  historico_bimestres?: NotaBimestre[];
  situacao: Disciplina["situacao"];
};

type AjusteMediaPayload = {
  disciplina: string;
  media_original: number | null;
  media_ajustada: number | null;
  observacao: string;
};

type NovoAlunoPayload = {
  matricula: string;
  nome: string;
  numero_chamada: number | null;
  ativo: boolean;
  deficiencias: string[];
};

type NovaTurmaPayload = {
  codigo: string;
  ano: number;
  serie: string;
  sala: string;
  periodo: string;
  ciclo: string;
  alunos: NovoAlunoPayload[];
  substituir_alunos?: boolean;
};

type FinalizacaoResultado = {
  ata: string | null;
  relatorio: string | null;
};

type ArquivoMapaoPayload = {
  nome: string;
  bytes: number[];
};

type PreviaArquivoMapao = {
  nome: string;
  turma_alvo: string | null;
  turma_caminho: string | null;
  alunos_lidos: number;
  disciplinas_lidas: number;
  correspondencias: number;
  nao_encontrados: number;
  nomes_nao_encontrados: string[];
  duplicados: number;
  nomes_duplicados: string[];
  erro: string | null;
};

type PreviaImportacaoMapoes = {
  arquivos: PreviaArquivoMapao[];
  total_correspondencias: number;
  total_nao_encontrados: number;
  total_duplicados: number;
};

type ResultadoImportacaoMapoes = {
  arquivos: PreviaArquivoMapao[];
  turmas_atualizadas: number;
  alunos_atualizados: number;
};

type ResultadoImportacaoElegiveis = {
  registros_csv: number;
  turmas_lidas: number;
  turmas_atualizadas: number;
  alunos_atualizados: number;
  por_matricula: number;
  por_nome: number;
  nao_encontrados: string[];
  nomes_ambiguos: string[];
};

type RelatorioAlunosCriticosResultado = {
  caminho: string;
  pasta: string;
  turmas: number;
  alunos: number;
};

type RelatorioAlteracoesNotasResultado = {
  caminho: string;
  pasta: string;
  turmas: number;
  pendentes: number;
  alteradas: number;
};

type AppInfo = {
  name: string;
  stage: string;
  version: string;
  data_dir: string;
};

const NOVIDADES_POR_VERSAO: Record<string, string[]> = {
  "2.1.6": [
    "Relatório de Alunos Críticos disponível na central de relatórios.",
    "Novo relatório Alterações de Notas Pós-Conselho para comparar decisões do conselho com o último mapão importado.",
    "Correções de persistência do coordenador de turma e do ciclo de líder e vice líder.",
    "Melhoria no caminho de salvamento em Linux e versões portáteis.",
    "Manual do usuário atualizado com imagens revisadas.",
  ],
  "2.1.5": [
    "Aba Educação Especial na tela individual do aluno elegível, com condições selecionáveis e comentário complementar.",
    "Documentação de conselho reunida em um único botão, listando atas e relatórios por bimestre.",
    "Importadores agrupados no menu Importar Dados.",
    "Importação de mapões adaptada para arquivos com nome, apenas número, ou nome e número do aluno.",
    "Indicador de evolução das disciplinas na tela de conselho, com histórico bimestral ao clicar.",
  ],
  "2.1.4": [
    "Nova tela “O que há de novidade” exibida uma vez após a atualização do programa.",
    "Lista de mudanças da versão apresentada diretamente ao abrir o CoordenacaoOP.",
    "Preparação do aplicativo para comunicar melhorias futuras sem depender apenas do GitHub.",
  ],
};

const alunosDemo: Aluno[] = [
  {
    matricula: "demo-1",
    chamada: 7,
    nome: "ANA CLARA MARTINS DOS SANTOS",
    elegivel: true,
    deficiencias: ["Aluno elegível"],
    comentarioEducacaoEspecial: "",
    frequencia: 86,
    encaminhamentos: [3, 9],
    disciplinas: [
      { nome: "Lingua Portuguesa", mediaOriginal: 4.5, mediaConselho: 5.0, faltas: 3, situacao: "ajustada" },
      { nome: "Matematica", mediaOriginal: 4.0, mediaConselho: null, faltas: 12, situacao: "abaixo" },
      { nome: "Projeto de Vida", mediaOriginal: null, mediaConselho: null, faltas: 1, situacao: "sem-nota" },
      { nome: "Historia", mediaOriginal: 6.0, mediaConselho: null, faltas: 2, situacao: "adequada" },
    ],
  },
  {
    matricula: "demo-2",
    chamada: 12,
    nome: "BRUNO HENRIQUE ALMEIDA",
    elegivel: false,
    deficiencias: [],
    comentarioEducacaoEspecial: "",
    frequencia: 92,
    encaminhamentos: [5],
    disciplinas: [
      { nome: "Lingua Portuguesa", mediaOriginal: 6.5, mediaConselho: null, faltas: 2, situacao: "adequada" },
      { nome: "Matematica", mediaOriginal: 5.5, mediaConselho: null, faltas: 3, situacao: "adequada" },
      { nome: "Biologia", mediaOriginal: 4.8, mediaConselho: null, faltas: 5, situacao: "abaixo" },
    ],
  },
];

const situacaoLabel: Record<Disciplina["situacao"], string> = {
  adequada: "Adequada",
  abaixo: "Abaixo",
  cuidado: "Cuidado",
  "sem-nota": "Sem nota",
  ajustada: "Ajustada",
};

const encaminhamentos = [
  "Dificuldade em ler, interpretar e associar dados, tabelas, figuras, produzir textos e resolver situacoes problemas",
  "Confrontar ideias e opinioes, manifestando-se de forma argumentativa",
  "Dedicar-se mais ao estudo em casa.",
  "Prestar mais atencao as explicacoes do professor, tirar duvidas, realizar as tarefas em aula nos prazos estipulados",
  "Frequencia as aulas.",
  "Acompanhar diariamente, dialogar e orientar o estudante sobre as atividades escolares",
  "Estabelecer horas de estudo em casa, incentivando o habito de estudar",
  "Comparecer as reunioes e conversar com professores e coordenadores pedagogicos",
  "Recuperacao continua",
  "Tarefas auxiliares para superacao das dificuldades especificas do estudante",
];

function formatarNota(valor: number | null | undefined) {
  if (valor === null || valor === undefined) {
    return "-";
  }
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function arredondarMedia(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return null;
  }
  return Math.floor(valor + 0.5);
}

function formatarMediaGlobal(valor: number | null | undefined) {
  const arredondada = arredondarMedia(valor);
  return arredondada === null ? "-" : String(arredondada);
}

function formatarPercentual(valor: number | null | undefined) {
  if (valor === null || valor === undefined) {
    return "-";
  }
  return `${Math.round(valor)}%`;
}

function formatarTempo(segundos: number) {
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const seg = segundos % 60;
  return [horas, minutos, seg].map((valor) => String(valor).padStart(2, "0")).join(":");
}

function frequenciaMapaoAbaixoDoMinimo(valor: number | null | undefined) {
  return typeof valor === "number" && valor < 75;
}

function classeFaltas(disciplina: Disciplina) {
  const faltas = disciplina.faltas;
  const totalAulas = disciplina.totalAulas;
  if (
    typeof faltas !== "number" ||
    typeof totalAulas !== "number" ||
    !Number.isFinite(faltas) ||
    !Number.isFinite(totalAulas) ||
    totalAulas <= 0
  ) {
    return "";
  }

  const limite = totalAulas * 0.25;
  if (faltas > limite) return "absence-danger";
  if (faltas === limite) return "absence-warning";
  return "";
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

function calcularMediaAluno(aluno: Aluno) {
  const medias = aluno.disciplinas
    .flatMap((disciplina) => {
      const nota = disciplina.mediaConselho ?? disciplina.mediaOriginal;
      return typeof nota === "number" && Number.isFinite(nota) ? [nota] : [];
    });
  if (!medias.length) {
    return null;
  }
  return medias.reduce((total, valor) => total + valor, 0) / medias.length;
}

function classificarAluno(aluno: Aluno) {
  const media = arredondarMedia(calcularMediaAluno(aluno));
  if (media !== null && media < 5) {
    return "critico";
  }
  if (media === 5) {
    return "atencao";
  }
  return "adequado";
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

type EvolucaoDisciplina = "subiu" | "desceu" | "estavel" | "sem-dados";

function calcularEvolucaoDisciplina(disciplina: Disciplina, bimestreAtual: string): EvolucaoDisciplina {
  const notaAtual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
  if (typeof notaAtual !== "number" || !Number.isFinite(notaAtual)) {
    return "sem-dados";
  }

  const atual = Number(bimestreAtual);
  const historico = (disciplina.historicoBimestres ?? [])
    .filter((item) => typeof item.media === "number" && Number.isFinite(item.media));
  const referencias = historico.filter((item) => Number(item.bimestre) < atual);
  const base = referencias.length ? referencias : historico.filter((item) => item.bimestre !== bimestreAtual);
  if (!base.length) {
    return "sem-dados";
  }

  const mediaHistorica = base.reduce((total, item) => total + item.media, 0) / base.length;
  const diferenca = notaAtual - mediaHistorica;
  if (diferenca > 0.05) return "subiu";
  if (diferenca < -0.05) return "desceu";
  return "estavel";
}

function rotuloClassificacao(aluno: Aluno) {
  const status = classificarAluno(aluno);
  if (status === "critico") return "Critico";
  if (status === "atencao") return "Atenção";
  return "Adequado";
}

function calcularMetricasTurma(alunos: Aluno[]) {
  const medias = alunos
    .map(calcularMediaAluno)
    .filter((valor): valor is number => valor !== null && valor !== undefined);
  const mediaGeral = medias.length
    ? medias.reduce((total, valor) => total + valor, 0) / medias.length
    : null;

  return alunos.reduce(
    (metricas, aluno) => {
      const status = classificarAluno(aluno);
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

const atividades = [
  { turma: "2A", descricao: "Conselho do 1º bimestre realizado", data: "04/05/2026" },
  { turma: "3B", descricao: "Mapao FGB importado", data: "03/05/2026" },
  { turma: "1C", descricao: "Lista de alunos elegiveis atualizada", data: "02/05/2026" },
];

const proximosConselhos = [
  { turma: "2B", descricao: "Agendado para 08/05/2026", status: "Pendente" },
  { turma: "1A", descricao: "Agendado para 10/05/2026", status: "Agendado" },
  { turma: "3C", descricao: "Realizado em 30/04/2026", status: "Concluido" },
];

const opcoesBimestre = [
  { valor: "1", rotulo: "1º bimestre" },
  { valor: "2", rotulo: "2º bimestre" },
  { valor: "3", rotulo: "3º bimestre" },
  { valor: "4", rotulo: "4º bimestre/conselho final" },
];

function rotuloBimestre(valor: string | null | undefined) {
  return opcoesBimestre.find((opcao) => opcao.valor === valor)?.rotulo ?? "1º bimestre";
}

export function App() {
  const [tela, setTela] = useState<Tela>("dashboard");
  const [menuAberto, setMenuAberto] = useState(false);
  const [modoReuniao, setModoReuniao] = useState(false);
  const [indiceAluno, setIndiceAluno] = useState(0);
  const [turmas, setTurmas] = useState<TurmaResumo[]>([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState<TurmaResumo | null>(null);
  const [bimestreSelecionado, setBimestreSelecionado] = useState("1");
  const [turmaDetalhe, setTurmaDetalhe] = useState<TurmaDetalhe | null>(null);
  const [erroTurmas, setErroTurmas] = useState("");
  const [erroConselho, setErroConselho] = useState("");
  const [atualizacao, setAtualizacao] = useState<Update | null>(null);
  const [statusAtualizacao, setStatusAtualizacao] = useState("");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [mostrarNovidades, setMostrarNovidades] = useState(false);
  const alunosConselho = useMemo(() => {
    if (!turmaDetalhe?.alunos.length) {
      return alunosDemo;
    }

    return turmaDetalhe.alunos.map((aluno) => ({
      matricula: aluno.matricula,
      chamada: aluno.numero_chamada ?? 0,
      nome: aluno.nome,
      elegivel: aluno.elegivel,
      liderancaSala: aluno.lideranca_sala,
      deficiencias: aluno.deficiencias ?? [],
      comentarioEducacaoEspecial: aluno.comentario_educacao_especial,
      frequencia: aluno.frequencia_percentual,
      encaminhamentos: aluno.encaminhamentos,
      disciplinas: aluno.disciplinas.map((disciplina) => ({
        nome: disciplina.nome,
        mediaOriginal: disciplina.media_original,
        mediaConselho: disciplina.media_conselho,
        quintoConceito: disciplina.quinto_conceito,
        observacaoConselho: disciplina.observacao_conselho,
        faltas: disciplina.faltas,
        totalAulas: disciplina.total_aulas,
        faltasAcumuladas: disciplina.faltas_acumuladas,
        totalAulasAcumuladas: disciplina.total_aulas_acumuladas,
        historicoBimestres: disciplina.historico_bimestres ?? [],
        situacao: disciplina.situacao,
      })),
    }));
  }, [turmaDetalhe]);
  const aluno = alunosConselho[Math.min(indiceAluno, alunosConselho.length - 1)] ?? alunosDemo[0];
  const novidadesVersao = appInfo?.version ? NOVIDADES_POR_VERSAO[appInfo.version] ?? [] : [];

  useEffect(() => {
    check()
      .then((update) => {
        if (update) {
          setAtualizacao(update);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke<AppInfo>("app_info")
      .then((info) => {
        setAppInfo(info);
        const chave = `coordenacaoop:novidades-lidas:${info.version}`;
        if (NOVIDADES_POR_VERSAO[info.version]?.length && localStorage.getItem(chave) !== "sim") {
          setMostrarNovidades(true);
        }
      })
      .catch(() => {});
  }, []);

  function fecharNovidades() {
    if (appInfo?.version) {
      localStorage.setItem(`coordenacaoop:novidades-lidas:${appInfo.version}`, "sim");
    }
    setMostrarNovidades(false);
  }

  async function instalarAtualizacaoDisponivel() {
    if (!atualizacao) return;
    setStatusAtualizacao("Baixando atualização...");
    try {
      await atualizacao.downloadAndInstall((evento) => {
        if (evento.event === "Started") {
          setStatusAtualizacao("Baixando atualização...");
        } else if (evento.event === "Progress") {
          setStatusAtualizacao("Baixando atualização...");
        } else if (evento.event === "Finished") {
          setStatusAtualizacao("Instalando atualização...");
        }
      });
      setStatusAtualizacao("Atualização instalada. Reiniciando...");
      await relaunch();
    } catch (err) {
      setStatusAtualizacao(`Não foi possível atualizar automaticamente: ${String(err)}`);
    }
  }

  useEffect(() => {
    invoke<TurmaResumo[]>("listar_turmas")
      .then((resultado) => {
        setTurmas(resultado);
        setErroTurmas("");
      })
      .catch((erro) => {
        setErroTurmas(String(erro));
      });
  }, []);

  useEffect(() => {
    if (!turmaSelecionada) {
      setTurmaDetalhe(null);
      return;
    }

    setIndiceAluno(0);
    invoke<TurmaDetalhe>("carregar_turma", {
      caminho: turmaSelecionada.caminho,
      bimestre: bimestreSelecionado,
    })
      .then((resultado) => {
        setTurmaDetalhe(resultado);
        setErroConselho("");
      })
      .catch((erro) => {
        setTurmaDetalhe(null);
        setErroConselho(String(erro));
      });
  }, [turmaSelecionada, bimestreSelecionado]);

  const resumo = useMemo(() => {
    const abaixo = aluno.disciplinas.filter((disciplina) => disciplina.situacao === "abaixo").length;
    const ajustadas = aluno.disciplinas.filter((disciplina) => disciplina.situacao === "ajustada").length;
    const semNota = aluno.disciplinas.filter((disciplina) => disciplina.situacao === "sem-nota").length;
    return { abaixo, ajustadas, semNota };
  }, [aluno]);

  function selecionarAluno(indice: number) {
    setIndiceAluno(indice);
  }

  function salvarAjustesMedia(ajustes: AjusteMediaPayload[]) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar ajustes."));
    }

    return invoke<TurmaDetalhe>("salvar_ajustes_media", {
      caminho: turmaSelecionada.caminho,
      matricula: aluno.matricula,
      bimestre: turmaDetalhe.bimestre,
      ajustes,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
    });
  }

  function salvarEncaminhamentos(codigos: number[]) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar encaminhamentos."));
    }

    return invoke<TurmaDetalhe>("salvar_encaminhamentos", {
      caminho: turmaSelecionada.caminho,
      matricula: aluno.matricula,
      bimestre: turmaDetalhe.bimestre,
      encaminhamentos: codigos,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
    });
  }

  function salvarCoordenadorTurma(coordenador: string) {
    if (!turmaSelecionada) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar o coordenador."));
    }
    return invoke<TurmaDetalhe>("salvar_coordenador_turma", {
      caminho: turmaSelecionada.caminho,
      input: { coordenador },
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
      setTurmaSelecionada((atual) => atual ? { ...atual, coordenador_turma: detalheAtualizado.coordenador_turma } : atual);
      return invoke<TurmaResumo[]>("listar_turmas")
        .then((resumoAtualizado) => {
          setTurmas(resumoAtualizado);
          setTurmaSelecionada((atual) => resumoAtualizado.find((item) => item.caminho === atual?.caminho) ?? atual);
        })
        .catch(() => {});
    });
  }

  function salvarElegibilidadeAluno(matricula: string, elegivel: boolean) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar elegibilidade."));
    }
    return invoke<TurmaDetalhe>("salvar_elegibilidade_aluno", {
      caminho: turmaSelecionada.caminho,
      matricula,
      input: { elegivel },
      bimestre: turmaDetalhe.bimestre,
    }).then((detalheAtualizado) => setTurmaDetalhe(detalheAtualizado));
  }

  function salvarLiderancaAluno(matricula: string, lideranca: "lider" | "vice" | null) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar liderança."));
    }
    return invoke<TurmaDetalhe>("salvar_lideranca_aluno", {
      caminho: turmaSelecionada.caminho,
      matricula,
      input: { lideranca },
      bimestre: turmaDetalhe.bimestre,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
      return invoke<TurmaResumo[]>("listar_turmas")
        .then((resumoAtualizado) => {
          setTurmas(resumoAtualizado);
          setTurmaSelecionada((atual) => resumoAtualizado.find((item) => item.caminho === atual?.caminho) ?? atual);
        })
        .catch(() => {});
    });
  }

  function salvarEducacaoEspecialAluno(matricula: string, deficiencias: string[], comentario: string) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar educação especial."));
    }
    return invoke<TurmaDetalhe>("salvar_educacao_especial_aluno", {
      caminho: turmaSelecionada.caminho,
      matricula,
      input: { deficiencias, comentario },
      bimestre: turmaDetalhe.bimestre,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
      return invoke<TurmaResumo[]>("listar_turmas")
        .then(setTurmas)
        .catch(() => {});
    });
  }

  function criarTurma(payload: NovaTurmaPayload) {
    return invoke<TurmaResumo>("criar_turma", { input: payload }).then((novaTurma) => {
      setTurmas((atuais) => [...atuais, novaTurma].sort((a, b) => (a.ano - b.ano) || a.codigo.localeCompare(b.codigo, "pt-BR")));
    });
  }

  function editarTurma(turma: TurmaResumo, payload: NovaTurmaPayload) {
    return invoke<TurmaResumo>("editar_turma", { caminho: turma.caminho, input: payload }).then((turmaAtualizada) => {
      setTurmas((atuais) => atuais
        .map((item) => item.caminho === turma.caminho ? turmaAtualizada : item)
        .sort((a, b) => (a.ano - b.ano) || a.codigo.localeCompare(b.codigo, "pt-BR")));
      setTurmaSelecionada((atual) => atual?.caminho === turma.caminho ? turmaAtualizada : atual);
    });
  }

  function excluirTurma(turma: TurmaResumo) {
    return invoke<void>("excluir_turma", { caminho: turma.caminho }).then(() => {
      setTurmas((atuais) => atuais.filter((item) => item.caminho !== turma.caminho));
      setTurmaSelecionada((atual) => atual?.caminho === turma.caminho ? null : atual);
    });
  }

  function navegarAluno(delta: number) {
    setIndiceAluno((atual) => {
      const proximo = atual + delta;
      if (proximo < 0) return alunosConselho.length - 1;
      if (proximo >= alunosConselho.length) return 0;
      return proximo;
    });
  }

  useEffect(() => {
    if (tela !== "conselho") {
      return;
    }

    function aoPressionarTecla(event: KeyboardEvent) {
      const alvo = event.target as HTMLElement | null;
      if (alvo?.matches("input, textarea, select")) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        navegarAluno(1);
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        navegarAluno(-1);
      }
    }

    window.addEventListener("keydown", aoPressionarTecla);
    return () => window.removeEventListener("keydown", aoPressionarTecla);
  }, [tela, alunosConselho.length]);

  function navegarPara(proximaTela: Tela) {
    setTela(proximaTela);
    setMenuAberto(false);
    if (proximaTela !== "conselho") {
      setModoReuniao(false);
      invoke("definir_fullscreen", { ativo: false }).catch(() => {});
    }
  }

  return (
    <main className={`app-shell ${modoReuniao ? "meeting-mode-shell" : ""}`}>
      <button
        className="app-sidebar-toggle"
        type="button"
        onClick={() => setMenuAberto(true)}
        aria-label="Abrir menu principal"
      >
        <Menu size={22} />
      </button>
      {menuAberto && (
        <button
          className="app-sidebar-backdrop"
          type="button"
          onClick={() => setMenuAberto(false)}
          aria-label="Fechar menu principal"
        />
      )}
      <aside className={`sidebar ${menuAberto ? "open" : ""}`}>
        <div className="brand">
          <img className="brand-logo" src={brandLogo} alt="Coord OP" />
          <button
            className="app-sidebar-close"
            type="button"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu principal"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav-list">
          <NavButton icon={<Home size={18} />} label="Dashboard" active={tela === "dashboard"} onClick={() => navegarPara("dashboard")} />
          <NavButton icon={<Users size={18} />} label="Turmas" active={tela === "turmas"} onClick={() => navegarPara("turmas")} />
          <NavButton icon={<Upload size={18} />} label="Importar Dados" active={tela === "importar-dados" || tela === "importar-notas" || tela === "importar-elegiveis"} onClick={() => navegarPara("importar-dados")} />
          <NavButton icon={<BookOpen size={18} />} label="Conselho" active={tela === "conselhos" || tela === "conselho"} onClick={() => navegarPara("conselhos")} />
          <NavButton icon={<FileText size={18} />} label="Relatórios" active={tela === "relatorios" || tela === "relatorio-criticos" || tela === "relatorio-alteracoes-notas"} onClick={() => navegarPara("relatorios")} />
          <NavButton icon={<Settings size={18} />} label="Configurações" active={tela === "configuracoes"} onClick={() => navegarPara("configuracoes")} />
        </nav>

        <div className="profile-box">
          <span>CP</span>
          <div>
            <strong>Coordenacao</strong>
            <small>Equipe pedagogica</small>
          </div>
        </div>
      </aside>

      <section className="workspace">
        {tela === "dashboard" && (
          <Dashboard
            turmas={turmas}
            erroTurmas={erroTurmas}
            onOpenCouncil={() => navegarPara("conselhos")}
            onOpenTurmas={() => navegarPara("turmas")}
          />
        )}
        {tela === "conselhos" && (
          <SelecaoConselho turmas={turmas} erroTurmas={erroTurmas} onSelecionar={(turma) => {
            setTurmaSelecionada(turma);
            navegarPara("conselho");
          }} />
        )}
        {tela === "conselho" && (
          <Council
            aluno={aluno}
            alunos={alunosConselho}
            totalAlunos={alunosConselho.length}
            indiceAluno={indiceAluno}
            resumo={resumo}
            turmaSelecionada={turmaSelecionada}
            turmaDetalhe={turmaDetalhe}
            bimestreSelecionado={bimestreSelecionado}
            setBimestreSelecionado={setBimestreSelecionado}
            erroConselho={erroConselho}
            selecionarAluno={selecionarAluno}
            salvarAjustesMedia={salvarAjustesMedia}
            salvarEncaminhamentos={salvarEncaminhamentos}
            modoReuniao={modoReuniao}
            setModoReuniao={setModoReuniao}
          />
        )}
        {tela === "turmas" && (
          <Turmas
            turmas={turmas}
            erroTurmas={erroTurmas}
            onCriarTurma={criarTurma}
            onEditarTurma={editarTurma}
            onExcluirTurma={excluirTurma}
            onSelecionar={(turma) => {
            setTurmaSelecionada(turma);
            navegarPara("gestao-turma");
          }} />
        )}
        {tela === "gestao-turma" && (
          <GestaoTurma
            turma={turmaSelecionada}
            turmaDetalhe={turmaDetalhe}
            alunos={alunosConselho}
            onVoltar={() => navegarPara("turmas")}
            onSalvarCoordenador={salvarCoordenadorTurma}
            onSalvarElegibilidade={salvarElegibilidadeAluno}
            onSalvarLideranca={salvarLiderancaAluno}
            onSalvarEducacaoEspecial={salvarEducacaoEspecialAluno}
          />
        )}
        {tela === "importar-dados" && (
          <ImportarDados
            onImportarNotas={() => navegarPara("importar-notas")}
            onImportarElegiveis={() => navegarPara("importar-elegiveis")}
          />
        )}
        {tela === "importar-notas" && (
          <ImportarNotas
            turmas={turmas}
            onSubstituirCsvTurma={(turma, alunos) => editarTurma(turma, {
              codigo: turma.codigo,
              ano: turma.ano,
              serie: turma.serie ?? turma.ciclo ?? turma.codigo,
              sala: turma.sala ?? "",
              periodo: turma.periodo ?? PERIODOS_TURMA[0],
              ciclo: turma.ciclo ?? "EM",
              alunos,
              substituir_alunos: true,
            })}
          />
        )}
        {tela === "importar-elegiveis" && (
          <ImportarElegiveis onImportado={() => {
            invoke<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
            if (turmaSelecionada) {
              invoke<TurmaDetalhe>("carregar_turma", {
                caminho: turmaSelecionada.caminho,
                bimestre: bimestreSelecionado,
              }).then(setTurmaDetalhe).catch(() => {});
            }
          }} />
        )}
        {tela === "configuracoes" && <Configuracoes turmas={turmas} onDadosAlterados={() => {
          invoke<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
        }} />}
        {tela === "relatorios" && (
          <RelatoriosMenu
            onAbrirCriticos={() => navegarPara("relatorio-criticos")}
            onAbrirAlteracoesNotas={() => navegarPara("relatorio-alteracoes-notas")}
          />
        )}
        {tela === "relatorio-criticos" && <RelatorioAlunosCriticos turmas={turmas} onVoltar={() => navegarPara("relatorios")} />}
        {tela === "relatorio-alteracoes-notas" && <RelatorioAlteracoesNotas turmas={turmas} onVoltar={() => navegarPara("relatorios")} />}
        {tela !== "dashboard" && tela !== "conselhos" && tela !== "conselho" && tela !== "turmas" && tela !== "gestao-turma" && tela !== "importar-dados" && tela !== "importar-notas" && tela !== "importar-elegiveis" && tela !== "configuracoes" && tela !== "relatorios" && tela !== "relatorio-criticos" && tela !== "relatorio-alteracoes-notas" && <Placeholder tela={tela} />}
      </section>
      {atualizacao && (
        <div className="modal-backdrop">
          <section className="update-modal">
            <h2>Nova versão disponível</h2>
            <p>Versão disponível: {atualizacao.version}.</p>
            {statusAtualizacao && <p>{statusAtualizacao}</p>}
            <div className="modal-actions">
              <button onClick={() => {
                setAtualizacao(null);
                setStatusAtualizacao("");
              }}>Depois</button>
              <button
                className="primary-action"
                onClick={instalarAtualizacaoDisponivel}
              >
                Atualizar e reiniciar
              </button>
            </div>
          </section>
        </div>
      )}
      {mostrarNovidades && novidadesVersao.length > 0 && (
        <div className="modal-backdrop">
          <section className="whats-new-modal" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
            <span className="eyebrow">Atualização concluída</span>
            <h2 id="whats-new-title">O que há de novidade</h2>
            <p>Versão {appInfo?.version ? `v${appInfo.version}` : "atual"} do CoordenacaoOP.</p>
            <ul>
              {novidadesVersao.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="primary-action" onClick={fecharNovidades}>Entendi</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Dashboard({
  turmas,
  erroTurmas,
  onOpenCouncil,
  onOpenTurmas,
}: {
  turmas: TurmaResumo[];
  erroTurmas: string;
  onOpenCouncil: () => void;
  onOpenTurmas: () => void;
}) {
  const totalAlunos = turmas.reduce((total, turma) => total + turma.alunos_ativos, 0);
  const totalElegiveis = turmas.reduce((total, turma) => total + turma.alunos_elegiveis, 0);
  const ajustes = turmas.reduce((total, turma) => total + turma.conselhos_com_ajustes, 0);
  const turmasRecentes = turmas.slice(0, 4);

  return (
    <>
      <header className="topbar dashboard-topbar">
        <div>
          <span className="eyebrow">Visao geral</span>
          <h1>Dashboard</h1>
          <p>Acompanhe turmas, importacoes e pendencias de conselho.</p>
        </div>
        <button className="primary-action" onClick={onOpenCouncil}>
          <BookOpen size={18} />
          Abrir conselho
        </button>
      </header>

      <section className="metric-grid">
        <MetricCard icon={<Users size={24} />} tone="blue" value={String(turmas.length)} label="Turmas salvas" />
        <MetricCard icon={<GraduationCap size={24} />} tone="green" value={String(totalAlunos)} label="Alunos ativos" />
        <MetricCard icon={<CalendarClock size={24} />} tone="amber" value={String(ajustes)} label="Alunos com ajustes" />
        <MetricCard icon={<TrendingUp size={24} />} tone="purple" value={String(totalElegiveis)} label="Alunos elegiveis" />
      </section>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      <section className="dashboard-grid">
        <div className="panel activity-panel">
          <div className="panel-heading">
            <h3>Turmas recentes</h3>
            <button onClick={onOpenTurmas}>Ver turmas</button>
          </div>
          {(turmasRecentes.length ? turmasRecentes : atividades).map((atividade) => (
            "codigo" in atividade ? (
            <div className="activity-row" key={atividade.caminho}>
              <div>
                <strong>{rotuloTurma(atividade)}</strong>
                <span>{rotuloSerie(atividade.serie) || atividade.ciclo || "Turma sem série definida"}</span>
              </div>
              <time>{atividade.ano}</time>
            </div>
            ) : (
              <div className="activity-row" key={`${atividade.turma}-${atividade.descricao}`}>
                <div>
                  <strong>{atividade.turma}</strong>
                  <span>{atividade.descricao}</span>
                </div>
                <time>{atividade.data}</time>
              </div>
            )
          ))}
        </div>

        <div className="panel upcoming-panel">
          <div className="panel-heading">
            <h3>Proximos conselhos</h3>
          </div>
          {proximosConselhos.map((item) => (
            <button className={`council-card ${item.status.toLowerCase()}`} key={item.turma} onClick={onOpenCouncil}>
              <div>
                <strong>{item.turma}</strong>
                <span>{item.descricao}</span>
              </div>
              <em>{item.status}</em>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function MetricCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: ReactNode;
  tone: "blue" | "green" | "amber" | "purple";
  value: string;
  label: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
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
      <div className="council-metric-value">
        {icon}
        <strong>{value}</strong>
      </div>
      <span>{label}</span>
    </article>
  );
}

function Council({
  aluno,
  alunos,
  totalAlunos,
  indiceAluno,
  resumo,
  turmaSelecionada,
  turmaDetalhe,
  bimestreSelecionado,
  setBimestreSelecionado,
  erroConselho,
  selecionarAluno,
  salvarAjustesMedia,
  salvarEncaminhamentos,
  modoReuniao,
  setModoReuniao,
}: {
  aluno: Aluno;
  alunos: Aluno[];
  totalAlunos: number;
  indiceAluno: number;
  resumo: { abaixo: number; ajustadas: number; semNota: number };
  turmaSelecionada: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  bimestreSelecionado: string;
  setBimestreSelecionado: (bimestre: string) => void;
  erroConselho: string;
  selecionarAluno: (indice: number) => void;
  salvarAjustesMedia: (ajustes: AjusteMediaPayload[]) => Promise<void>;
  salvarEncaminhamentos: (codigos: number[]) => Promise<void>;
  modoReuniao: boolean;
  setModoReuniao: (ativo: boolean) => void;
}) {
  const [disciplinaEditando, setDisciplinaEditando] = useState<string | null>(null);
  const [disciplinaHistoricoAberta, setDisciplinaHistoricoAberta] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [erroEdicao, setErroEdicao] = useState("");
  const [salvandoDisciplina, setSalvandoDisciplina] = useState<string | null>(null);
  const [erroEncaminhamento, setErroEncaminhamento] = useState("");
  const [salvandoEncaminhamento, setSalvandoEncaminhamento] = useState<number | null>(null);
  const [documentosAbertos, setDocumentosAbertos] = useState(false);
  const [documentosConselho, setDocumentosConselho] = useState<DocumentoConselho[]>([]);
  const [documentoAbrindo, setDocumentoAbrindo] = useState<string | null>(null);
  const [mensagemDocumento, setMensagemDocumento] = useState("");
  const [alunosDeliberados, setAlunosDeliberados] = useState<Set<string>>(() => new Set());
  const [filtroAlunos, setFiltroAlunos] = useState<"todos" | "critico" | "atencao">("todos");
  const [inicioReuniao, setInicioReuniao] = useState<number | null>(null);
  const [tempoBaseReuniao, setTempoBaseReuniao] = useState(0);
  const [tempoReuniao, setTempoReuniao] = useState(0);
  const [finalizacaoAberta, setFinalizacaoAberta] = useState(false);
  const turmaLabel = turmaSelecionada
    ? `${turmaSelecionada.codigo} - ${turmaSelecionada.ano} - ${rotuloBimestre(turmaDetalhe?.bimestre ?? bimestreSelecionado)}`
    : `2A - ${rotuloBimestre(bimestreSelecionado)}`;
  const metricasTurma = calcularMetricasTurma(alunos);
  const alunosFiltrados = useMemo(() => {
    if (filtroAlunos === "todos") {
      return alunos.map((item, indice) => ({ item, indice }));
    }
    return alunos
      .map((item, indice) => ({ item, indice }))
      .filter(({ item }) => classificarAluno(item) === filtroAlunos);
  }, [alunos, filtroAlunos]);

  useEffect(() => {
    const acumulado = turmaDetalhe?.tempo_conselho_segundos ?? 0;
    setTempoBaseReuniao(acumulado);
    setTempoReuniao(acumulado);
    setInicioReuniao(null);
    setFinalizacaoAberta(false);
  }, [turmaDetalhe?.bimestre, turmaDetalhe?.tempo_conselho_segundos]);

  useEffect(() => {
    if (!modoReuniao || inicioReuniao === null) {
      return;
    }

    const timer = window.setInterval(() => {
      const total = tempoBaseReuniao + Math.floor((Date.now() - inicioReuniao) / 1000);
      setTempoReuniao(total);
      if (turmaSelecionada && turmaDetalhe && total % 15 === 0) {
        invoke("salvar_tempo_conselho", {
          caminho: turmaSelecionada.caminho,
          bimestre: turmaDetalhe.bimestre,
          tempoSegundos: total,
        }).catch(() => {});
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [modoReuniao, inicioReuniao, tempoBaseReuniao, turmaSelecionada, turmaDetalhe]);

  function ativarModoReuniao() {
    const agora = Date.now();
    const acumulado = turmaDetalhe?.tempo_conselho_segundos ?? tempoReuniao;
    setTempoBaseReuniao(acumulado);
    setInicioReuniao(agora);
    setTempoReuniao(acumulado);
    setModoReuniao(true);
    invoke("definir_fullscreen", { ativo: true }).catch(() => {});
  }

  function abrirFinalizacao() {
    if (turmaSelecionada && turmaDetalhe) {
      invoke("salvar_tempo_conselho", {
        caminho: turmaSelecionada.caminho,
        bimestre: turmaDetalhe.bimestre,
        tempoSegundos: tempoReuniao,
      }).catch(() => {});
    }
    setFinalizacaoAberta(true);
  }

  function alternarDocumentacaoConselho() {
    if (!turmaSelecionada || !turmaDetalhe) {
      setMensagemDocumento("Selecione uma turma e um bimestre antes de abrir o documento.");
      return;
    }
    if (documentosAbertos) {
      setDocumentosAbertos(false);
      return;
    }
    setMensagemDocumento("");
    invoke<DocumentoConselho[]>("listar_documentos_conselho", {
      caminho: turmaSelecionada.caminho,
    })
      .then((documentos) => {
        setDocumentosConselho(documentos);
        setDocumentosAbertos(true);
        if (!documentos.length) {
          setMensagemDocumento("Nenhuma documentação de conselho gerada para esta turma.");
        }
      })
      .catch((error) => setMensagemDocumento(error instanceof Error ? error.message : String(error)));
  }

  function abrirDocumentoConselho(documento: DocumentoConselho) {
    setMensagemDocumento("");
    setDocumentoAbrindo(documento.caminho);
    invoke<string>("abrir_documento_conselho", { input: { caminho: documento.caminho } })
      .then(() => setMensagemDocumento(`${documento.tipo === "ata" ? "Ata" : "Relatório"} aberto.`))
      .catch((error) => setMensagemDocumento(error instanceof Error ? error.message : String(error)))
      .finally(() => setDocumentoAbrindo(null));
  }

  function sairModoReuniao() {
    setModoReuniao(false);
    setFinalizacaoAberta(false);
    invoke("definir_fullscreen", { ativo: false }).catch(() => {});
  }

  function iniciarEdicaoConselho(disciplina: Disciplina) {
    setErroEdicao("");
    setDisciplinaEditando(disciplina.nome);
    setValorEdicao(
      disciplina.mediaConselho == null ? "" : String(disciplina.mediaConselho).replace(".", ","),
    );
  }

  function salvarEdicaoConselho(disciplina: Disciplina) {
    if (salvandoDisciplina === disciplina.nome) {
      return;
    }

    const bruto = valorEdicao.trim();
    let media_ajustada: number | null = null;
    if (bruto) {
      const numero = Number(bruto.replace(",", "."));
      if (!Number.isFinite(numero) || numero < 0 || numero > 10) {
        setErroEdicao(`Nota invalida em ${disciplina.nome}. Use valores de 0 a 10.`);
        return;
      }
      media_ajustada = numero;
    }

    const originalAtual = disciplina.mediaConselho == null ? "" : String(disciplina.mediaConselho).replace(".", ",");
    if (bruto === originalAtual) {
      setDisciplinaEditando(null);
      return;
    }

    setErroEdicao("");
    setSalvandoDisciplina(disciplina.nome);
    salvarAjustesMedia([
      {
        disciplina: disciplina.nome,
        media_original: disciplina.mediaOriginal,
        media_ajustada,
        observacao: disciplina.observacaoConselho ?? "",
      },
    ])
      .then(() => setDisciplinaEditando(null))
      .catch((error) => setErroEdicao(error instanceof Error ? error.message : String(error)))
      .finally(() => setSalvandoDisciplina(null));
  }

  function alternarEncaminhamento(codigo: number) {
    if (salvandoEncaminhamento !== null) {
      return;
    }

    const selecionados = new Set(aluno.encaminhamentos);
    if (selecionados.has(codigo)) {
      selecionados.delete(codigo);
    } else {
      selecionados.add(codigo);
    }

    setErroEncaminhamento("");
    setSalvandoEncaminhamento(codigo);
    salvarEncaminhamentos([...selecionados].sort((a, b) => a - b))
      .catch((error) => setErroEncaminhamento(error instanceof Error ? error.message : String(error)))
      .finally(() => setSalvandoEncaminhamento(null));
  }

  function marcarAlunoDeliberado(item: Aluno) {
    const chave = item.matricula ?? item.nome;
    setAlunosDeliberados((atuais) => new Set(atuais).add(chave));
  }

  return (
    <>
      <header className={`topbar council-topbar ${modoReuniao ? "meeting-topbar" : ""}`}>
        <div>
          <span className="eyebrow">{turmaLabel}</span>
          {!modoReuniao && <h1>Conselho de classe</h1>}
          {!modoReuniao && <p>Acompanhamento e deliberacoes do conselho.</p>}
        </div>
        <div className="council-actions">
          {modoReuniao ? (
            <>
              <div className="meeting-timer">
                <Clock size={18} />
                {formatarTempo(tempoReuniao)}
              </div>
              <button className="danger-action" onClick={abrirFinalizacao}>
                Encerrar conselho
              </button>
            </>
          ) : (
            <>
              <button onClick={ativarModoReuniao}>
                <CalendarClock size={18} />
                Modo reuniao
              </button>
              <button
                onClick={alternarDocumentacaoConselho}
                disabled={!turmaSelecionada || !turmaDetalhe}
              >
                <ClipboardList size={18} />
                Documentação de conselho
              </button>
            </>
          )}
        </div>
      </header>

      {mensagemDocumento && !modoReuniao && (
        <div className="data-warning neutral">{mensagemDocumento}</div>
      )}

      {documentosAbertos && !modoReuniao && (
        <section className="panel council-documents-panel">
          <div className="panel-heading">
            <div>
              <h3>Documentação de conselho</h3>
              <p>Atas e relatórios já gerados para esta turma.</p>
            </div>
            <button type="button" className="ghost-action" onClick={() => setDocumentosAbertos(false)}>
              Fechar
            </button>
          </div>
          {documentosConselho.length > 0 ? (
            <div className="council-document-list">
              {documentosConselho.map((documento) => (
                <button
                  key={`${documento.tipo}-${documento.bimestre}-${documento.caminho}`}
                  type="button"
                  onClick={() => abrirDocumentoConselho(documento)}
                  disabled={documentoAbrindo !== null}
                >
                  <FileText size={18} />
                  <span>{documento.tipo === "ata" ? "Ata" : "Relatório dos professores"}</span>
                  <strong>{rotuloBimestre(documento.bimestre)}</strong>
                  {documentoAbrindo === documento.caminho && <em>Abrindo...</em>}
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-special-list">Nenhum documento foi gerado para esta turma.</div>
          )}
        </section>
      )}

      {!modoReuniao && <section className="panel council-summary-panel">
        <div className="summary-selector">
          <label htmlFor="bimestre-conselho">Bimestre</label>
          <select
            id="bimestre-conselho"
            value={bimestreSelecionado}
            onChange={(event) => setBimestreSelecionado(event.target.value)}
          >
            {opcoesBimestre.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="council-metrics">
          <CouncilMetric value={String(totalAlunos)} label="Total de alunos" />
          <CouncilMetric value={String(metricasTurma.adequados)} label="Adequados" tone="green" />
          <CouncilMetric value={String(metricasTurma.atencao)} label="Em atenção" tone="amber" />
          <CouncilMetric value={String(metricasTurma.criticos)} label="Críticos" tone="red" />
          <CouncilMetric value={formatarMediaGlobal(metricasTurma.mediaGeral)} label="Média geral" />
        </div>
      </section>}

      {erroConselho && <div className="data-warning">{erroConselho}</div>}

      {turmaSelecionada && !turmaDetalhe && !erroConselho && (
        <div className="data-warning neutral">
          Carregando alunos reais da turma selecionada.
        </div>
      )}

      <section className="council-workspace">
        <aside className="panel student-list-panel">
          <div className="panel-heading">
            <h3>Alunos da turma</h3>
          </div>
          <div className="student-filter-row">
            <button className={filtroAlunos === "todos" ? "active" : ""} onClick={() => setFiltroAlunos("todos")}>Todos</button>
            <button className={filtroAlunos === "critico" ? "active" : ""} onClick={() => setFiltroAlunos("critico")}>Críticos</button>
            <button className={filtroAlunos === "atencao" ? "active" : ""} onClick={() => setFiltroAlunos("atencao")}>Atenção</button>
          </div>
          <div className="student-list">
            {alunosFiltrados.map(({ item, indice }) => {
              const media = calcularMediaAluno(item);
              const status = classificarAluno(item);
              return (
                <button
                  className={`student-list-item ${indice === indiceAluno ? "active" : ""} ${
                    alunosDeliberados.has(item.matricula ?? item.nome) ? "deliberated" : ""
                  }`}
                  key={item.matricula ?? `${item.nome}-${indice}`}
                  onClick={() => selecionarAluno(indice)}
                  onBlur={() => marcarAlunoDeliberado(item)}
                  >
                  <div>
                    <strong>{item.nome}</strong>
                    <span>{item.matricula ? `RA: ${item.matricula}` : "Sem RA"}</span>
                  </div>
                  <div className="student-list-status">
                    {item.elegivel && <span className="mini-eligible">Elegível</span>}
                    <i className={status}></i>
                    <span>Media: {formatarMediaGlobal(media)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel council-detail-panel">
          <div className="student-detail-header">
            <div>
              <div className="student-name">
                {aluno.elegivel && <span className="eligible-badge">ALUNO ELEGÍVEL</span>}
                <h2>{aluno.nome}</h2>
              </div>
              <p>
                {aluno.matricula ? `RA: ${aluno.matricula}` : "Sem RA"} | Media:{" "}
                {formatarMediaGlobal(calcularMediaAluno(aluno))} | Frequência mapão:{" "}
                <span className={frequenciaMapaoAbaixoDoMinimo(aluno.frequencia) ? "frequency-low" : ""}>
                  {formatarPercentual(aluno.frequencia)}
                </span>
              </p>
            </div>
            <div className="student-header-status">
              <span className="student-number">Nº {aluno.chamada || "-"}</span>
              <span className={`student-outcome ${classificarAluno(aluno)}`}>
                {rotuloClassificacao(aluno)}
              </span>
            </div>
          </div>

          <section className="summary-grid compact">
            <article>
              <span>Frequência mapão</span>
              <strong className={frequenciaMapaoAbaixoDoMinimo(aluno.frequencia) ? "frequency-low" : ""}>
                {formatarPercentual(aluno.frequencia)}
              </strong>
            </article>
            <article>
              <span>Abaixo da media</span>
              <strong>{resumo.abaixo}</strong>
            </article>
            <article>
              <span>Ajustadas</span>
              <strong>{resumo.ajustadas}</strong>
            </article>
            <article>
              <span>Sem nota</span>
              <strong>{resumo.semNota}</strong>
            </article>
          </section>

          <section className="council-detail-grid">
            <div className="table-panel">
              <div className="panel-heading">
                <h3>Disciplinas e notas</h3>
              </div>
              {erroEdicao && <div className="inline-edit-error">{erroEdicao}</div>}
              <table>
                <thead>
                  <tr>
                    <th>Disciplina</th>
                    <th>Original</th>
                    <th>Conselho</th>
                    <th>Faltas</th>
                    <th>Situacao</th>
                  </tr>
                </thead>
                <tbody>
                  {aluno.disciplinas.map((disciplina) => {
                    const evolucao = calcularEvolucaoDisciplina(disciplina, bimestreSelecionado);
                    const historicoAberto = disciplinaHistoricoAberta === disciplina.nome;
                    const historico = disciplina.historicoBimestres ?? [];
                    return (
                    <tr key={disciplina.nome}>
                      <td>{disciplina.nome}</td>
                      <td>
                        <div className="grade-history-cell">
                          <button
                            type="button"
                            className={`grade-trend ${evolucao}`}
                            onClick={() => setDisciplinaHistoricoAberta(historicoAberto ? null : disciplina.nome)}
                            disabled={!historico.length}
                            title="Ver histórico bimestral da disciplina"
                          >
                            {evolucao === "subiu" && <ArrowUpRight size={16} />}
                            {evolucao === "desceu" && <ArrowDownRight size={16} />}
                            {(evolucao === "estavel" || evolucao === "sem-dados") && <Minus size={16} />}
                          </button>
                          <span>{formatarNota(disciplina.mediaOriginal)}</span>
                          {historicoAberto && (
                            <div className="grade-history-popover">
                              <strong>{disciplina.nome}</strong>
                              {historico.length ? (
                                historico.map((item) => (
                                  <span key={`${disciplina.nome}-${item.bimestre}`}>
                                    {rotuloBimestre(item.bimestre)}: <b>{formatarNota(item.media)}</b>
                                  </span>
                                ))
                              ) : (
                                <span>Sem histórico bimestral.</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        className="editable-grade-cell"
                        onDoubleClick={() => iniciarEdicaoConselho(disciplina)}
                        title="Clique duas vezes para ajustar a nota de conselho"
                      >
                        {disciplinaEditando === disciplina.nome ? (
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={valorEdicao}
                            onBlur={() => salvarEdicaoConselho(disciplina)}
                            onChange={(event) => setValorEdicao(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                              if (event.key === "Escape") {
                                setDisciplinaEditando(null);
                                setErroEdicao("");
                              }
                            }}
                            disabled={salvandoDisciplina === disciplina.nome}
                          />
                        ) : (
                          <span className="editable-grade-value">{formatarNota(disciplina.mediaConselho)}</span>
                        )}
                      </td>
                      <td>
                        <span className={classeFaltas(disciplina)}>
                          {disciplina.faltas ?? "-"}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${disciplina.situacao}`}>
                          {situacaoLabel[disciplina.situacao]}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="notes-panel">
              <div className="panel-heading">
                <h3>Encaminhamentos</h3>
              </div>
              {erroEncaminhamento && <div className="inline-edit-error">{erroEncaminhamento}</div>}
              <div className="encaminhamentos-list">
                {encaminhamentos.map((texto, indice) => {
                  const codigo = indice + 1;
                  const selecionado = aluno.encaminhamentos.includes(codigo);
                  return (
                    <button
                      className={`encaminhamento-item ${selecionado ? "selected" : ""}`}
                      key={codigo}
                      onClick={() => alternarEncaminhamento(codigo)}
                      disabled={salvandoEncaminhamento !== null}
                    >
                      <span className="encaminhamento-code">ENC {codigo}</span>
                      <span>{texto}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </section>
      </section>

      {finalizacaoAberta && (
        <FinalizacaoConselho
          turmaLabel={turmaLabel}
          tempoSegundos={tempoReuniao}
          turmaSelecionada={turmaSelecionada}
          turmaDetalhe={turmaDetalhe}
          onClose={() => setFinalizacaoAberta(false)}
          onFinished={sairModoReuniao}
        />
      )}

    </>
  );
}

function SelecaoConselho({
  turmas,
  erroTurmas,
  onSelecionar,
}: {
  turmas: TurmaResumo[];
  erroTurmas: string;
  onSelecionar: (turma: TurmaResumo) => void;
}) {
  const [busca, setBusca] = useState("");
  const turmasFiltradas = filtrarTurmas(turmas, busca);

  return (
    <>
      <header className="topbar turmas-topbar">
        <div>
          <span className="eyebrow">Conselhos de classe</span>
          <h1>Selecionar conselho</h1>
          <p>Escolha a turma para iniciar ou reabrir o conselho.</p>
        </div>
      </header>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      <section className="panel turmas-search-panel">
        <label className="search-box">
          <Search size={21} />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar turma ou coordenador de sala..."
          />
        </label>
      </section>

      <section className="turmas-card-grid">
        {turmasFiltradas.map((turma) => (
          <article
            className="turma-card conselho-card"
            key={turma.caminho}
          >
            <div className="turma-card-main">
              <h2>{rotuloTurma(turma)}</h2>
              <span>{rotuloSerie(turma.serie) || turma.ciclo || `${turma.ano}`}</span>
            </div>

            <div className="turma-card-meta">
              <span className="meta-line">
                <Users size={17} />
                {turma.alunos_ativos} alunos ativos
              </span>
              <span>
                Período: <strong>{turma.periodo ?? "Não informado"}</strong>
              </span>
              <span>
                Coordenador de sala: <strong>{turma.coordenador_turma || "A definir"}</strong>
              </span>
              <span className="class-leaders-line">
                Líderes de sala:
                <strong>{turma.lider_sala || "Líder a definir"}</strong>
                <strong>{turma.vice_lider_sala || "Vice líder a definir"}</strong>
              </span>
              <span>
                Elegíveis: <strong>{turma.alunos_elegiveis}</strong>
              </span>
            </div>

            <button className="details-action" onClick={() => onSelecionar(turma)}>
              Abrir conselho
            </button>
          </article>
        ))}

        {!turmasFiltradas.length && (
          <div className="panel empty-state">
            <ClipboardList size={32} />
            <strong>Nenhuma turma encontrada</strong>
            <span>Ajuste a busca ou importe/crie uma turma no app atual.</span>
          </div>
        )}
      </section>
    </>
  );
}

function filtrarTurmas(turmas: TurmaResumo[], busca: string) {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  if (!termo) {
    return turmas;
  }

  return turmas.filter((turma) => {
    const campos = [
      turma.codigo,
      rotuloTurma(turma),
      String(turma.ano),
      turma.serie ?? "",
      rotuloSerie(turma.serie),
      turma.sala ?? "",
      turma.periodo ?? "",
      turma.ciclo ?? "",
    ];
    return campos.some((campo) => campo.toLocaleLowerCase("pt-BR").includes(termo));
  });
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
  const normalizar = (valor: string) => normalizarTextoCsv(valor);
  if (normalizar(codigo).startsWith(normalizar(turma.serie ?? ""))) {
    const resto = codigo.slice(turma.serie?.length ?? 0).trim();
    return `${serie} ${resto}`.trim();
  }
  return rotuloSerie(codigo) || codigo;
}

function rotuloCiclo(ciclo: string) {
  const rotulos: Record<string, string> = {
    EI: "Educação Infantil",
    EFAI: "Anos Iniciais",
    EFAF: "Anos Finais",
    EM: "Ensino Médio",
    "Sem ciclo": "Sem ciclo",
  };
  return rotulos[ciclo] ?? ciclo;
}

function rotuloLideranca(lideranca: "lider" | "vice" | null | undefined) {
  if (lideranca === "lider") return "Líder";
  if (lideranca === "vice") return "Vice líder";
  return "Não";
}

function codigoTurma(serie: string, letra: string) {
  return `${serie} ${letra.trim().toLocaleUpperCase("pt-BR") || "A"}`.trim();
}

function letraUnica(valor: string) {
  const normalizada = normalizarTextoCsv(valor).replace(/[^A-Z]/g, "");
  return normalizada.slice(0, 1);
}

function gerarLetrasIntervalo(inicio: string, fim: string) {
  const primeira = letraUnica(inicio);
  const ultima = letraUnica(fim);
  if (!primeira || !ultima) return [];
  const codigoInicio = primeira.charCodeAt(0);
  const codigoFim = ultima.charCodeAt(0);
  if (codigoFim < codigoInicio) return [];
  return Array.from({ length: codigoFim - codigoInicio + 1 }, (_, indice) => String.fromCharCode(codigoInicio + indice));
}

function nomeBaseCsv(nome: string) {
  if (!/\.csv$/i.test(nome)) return "";
  const semExtensao = nome.replace(/\.[^.]+$/, "");
  const normalizado = normalizarTextoCsv(semExtensao).replace(/[^A-Z]/g, "");
  return normalizado.length === 1 ? normalizado : "";
}

function salaLote(salaInicial: string, indice: number) {
  const sala = salaInicial.trim();
  if (!sala) return "";
  if (!/^\d+$/.test(sala)) return sala;
  return String(Number.parseInt(sala, 10) + indice).padStart(sala.length, "0");
}

function assinaturaCsvAlunos(alunos: NovoAlunoPayload[]) {
  return alunos
    .map((aluno) => [
      normalizarTextoCsv(aluno.matricula),
      normalizarTextoCsv(aluno.nome),
      aluno.numero_chamada ?? "",
      aluno.ativo ? "1" : "0",
    ].join("|"))
    .sort()
    .join("\n");
}

function chaveConflitoSala(valor: string | null | undefined) {
  return normalizarTextoCsv(valor ?? "").replace(/[\s_-]/g, "");
}

function encontrarConflitoSala(
  turmas: TurmaResumo[],
  ano: number,
  periodo: string,
  sala: string,
  ignorarCaminho?: string,
) {
  const salaNorm = chaveConflitoSala(sala);
  const periodoNorm = chaveConflitoSala(periodo);
  if (!salaNorm || !periodoNorm) return null;
  return turmas.find((turma) => (
    turma.ano === ano
    && turma.caminho !== ignorarCaminho
    && chaveConflitoSala(turma.sala) === salaNorm
    && chaveConflitoSala(turma.periodo) === periodoNorm
  )) ?? null;
}

function letraTurma(turma: TurmaResumo) {
  const serie = turma.serie ?? "";
  const codigo = turma.codigo ?? "";
  if (serie && codigo.toLocaleUpperCase("pt-BR").startsWith(serie.toLocaleUpperCase("pt-BR"))) {
    const resto = codigo.slice(serie.length).trim();
    return resto || "A";
  }
  const partes = codigo.split(/\s+/).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : "A";
}

function mesmaSerie(a: string, b: string) {
  return normalizarTextoCsv(a) === normalizarTextoCsv(b);
}

function normalizarTextoCsv(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[ªᵃ]/g, "a")
    .replace(/[º°]/g, "o")
    .toLocaleUpperCase("pt-BR")
    .trim();
}

function extrairNomeSocial(nome: string) {
  return nome.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function dividirLinhaCsv(linha: string) {
  const colunas: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let indice = 0; indice < linha.length; indice += 1) {
    const caractere = linha[indice];
    const proximo = linha[indice + 1];
    if (caractere === '"' && entreAspas && proximo === '"') {
      atual += '"';
      indice += 1;
      continue;
    }
    if (caractere === '"') {
      entreAspas = !entreAspas;
      continue;
    }
    if (caractere === ";" && !entreAspas) {
      colunas.push(atual.trim());
      atual = "";
      continue;
    }
    atual += caractere;
  }
  colunas.push(atual.trim());
  return colunas;
}

function parseCsvAlunos(texto: string) {
  const linhas = texto.split(/\r?\n/).filter((linha) => linha.trim() !== "");
  const indiceCabecalho = linhas.findIndex((linha) => {
    const colunas = dividirLinhaCsv(linha).map(normalizarTextoCsv);
    return colunas.includes("RA") && colunas.includes("NOME DO ALUNO");
  });
  const cabecalho = indiceCabecalho >= 0 ? dividirLinhaCsv(linhas[indiceCabecalho]) : [];
  if (!cabecalho.length) {
    throw new Error("CSV sem cabeçalho de alunos reconhecível.");
  }
  const mapaCabecalho = new Map(cabecalho.map((coluna, indice) => [normalizarTextoCsv(coluna), indice]));
  const obter = (linha: string[], nome: string) => {
    const indice = mapaCabecalho.get(normalizarTextoCsv(nome));
    return indice === undefined ? "" : (linha[indice] ?? "").trim();
  };
  const colunasDeficiencia = new Set([
    "DEFICIENCIA",
    "DEFICIENCIAS",
    "TIPO DE DEFICIENCIA",
    "NECESSIDADE ESPECIAL",
    "NECESSIDADES ESPECIAIS",
    "NEE",
    "PUBLICO ALVO",
    "PUBLICO ALVO AEE",
  ]);
  const negativos = new Set(["", "NAO", "N", "NAO SE APLICA", "NAO POSSUI", "SEM DEFICIENCIA"]);
  const positivos = new Set(["SIM", "S", "ELEGIVEL", "ALUNO ELEGIVEL"]);

  return linhas.slice(indiceCabecalho + 1).flatMap((linhaTexto) => {
    const linha = dividirLinhaCsv(linhaTexto);
    const ra = obter(linha, "RA");
    const digito = obter(linha, "Dig. RA");
    const nome = extrairNomeSocial(obter(linha, "Nome do Aluno"));
    if (!ra || !nome) return [];
    const chamada = Number.parseInt(obter(linha, "Nº de chamada"), 10);
    const situacao = normalizarTextoCsv(obter(linha, "Situação do Aluno"));
    const deficiencias = cabecalho.flatMap((coluna, indice) => {
      if (!colunasDeficiencia.has(normalizarTextoCsv(coluna))) return [];
      const valor = linha[indice] ?? "";
      const normalizado = normalizarTextoCsv(valor);
      if (negativos.has(normalizado)) return [];
      if (positivos.has(normalizado)) return ["Aluno elegivel"];
      return valor.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
    });

    return [{
      matricula: `${ra}${digito}`,
      nome,
      numero_chamada: Number.isFinite(chamada) ? chamada : null,
      ativo: ["ATIVO", "MATRICULADO", "FREQUENTE"].includes(situacao),
      deficiencias: Array.from(new Set(deficiencias)),
    }];
  });
}

function GestaoTurma({
  turma,
  turmaDetalhe,
  alunos,
  onVoltar,
  onSalvarCoordenador,
  onSalvarElegibilidade,
  onSalvarLideranca,
  onSalvarEducacaoEspecial,
}: {
  turma: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  alunos: Aluno[];
  onVoltar: () => void;
  onSalvarCoordenador: (coordenador: string) => Promise<void>;
  onSalvarElegibilidade: (matricula: string, elegivel: boolean) => Promise<void>;
  onSalvarLideranca: (matricula: string, lideranca: "lider" | "vice" | null) => Promise<void>;
  onSalvarEducacaoEspecial: (matricula: string, deficiencias: string[], comentario: string) => Promise<void>;
}) {
  const [aba, setAba] = useState<"alunos" | "estatisticas">("alunos");
  const [busca, setBusca] = useState("");
  const [editandoCoordenador, setEditandoCoordenador] = useState(false);
  const [coordenador, setCoordenador] = useState(turma?.coordenador_turma ?? "");
  const [salvandoElegivel, setSalvandoElegivel] = useState<string | null>(null);
  const [salvandoLideranca, setSalvandoLideranca] = useState<string | null>(null);
  const [alunoAberto, setAlunoAberto] = useState<Aluno | null>(null);
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
  }, [turma?.coordenador_turma, turma?.caminho]);

  const alunosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return alunos;
    return alunos.filter((aluno) => [aluno.nome, aluno.matricula ?? ""].some((campo) => campo.toLocaleLowerCase("pt-BR").includes(termo)));
  }, [alunos, busca]);

  const disciplinas = useMemo(() => Array.from(new Set(alunos.flatMap((aluno) => aluno.disciplinas.map((disciplina) => disciplina.nome)))).sort(), [alunos]);
  const mediaGeral = calcularMetricasTurma(alunos).mediaGeral;
  const metricas = calcularMetricasTurma(alunos);
  const total = alunos.length || 1;
  const desempenhoDisciplinas = useMemo(() => disciplinas.map((disciplina) => {
    const notas = alunos.flatMap((aluno) => {
      const nota = aluno.disciplinas.find((item) => item.nome === disciplina)?.mediaOriginal;
      return typeof nota === "number" && Number.isFinite(nota) ? [nota] : [];
    });
    const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0;
    return { disciplina, media };
  }), [alunos, disciplinas]);
  const bimestreLabel = `${turmaDetalhe?.bimestre ?? "1"}º bim`;
  const percentuaisSituacao = {
    adequados: Math.round(metricas.adequados / total * 100),
    atencao: Math.round(metricas.atencao / total * 100),
    criticos: Math.round(metricas.criticos / total * 100),
  };

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

  if (alunoAberto) {
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
          aluno={alunoAberto}
          bimestre={turmaDetalhe?.bimestre ?? "1"}
          onVoltar={() => setAlunoAberto(null)}
          catalogoDeficiencias={catalogoDeficiencias}
          onSalvarEducacaoEspecial={onSalvarEducacaoEspecial}
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
          <CouncilMetric icon={<Users size={21} />} value={`${turma?.alunos_ativos ?? alunos.length}/${turma?.total_alunos ?? alunos.length}`} label="Alunos/Total" />
          <CouncilMetric icon={<TrendingUp size={21} />} value={formatarMediaGlobal(mediaGeral)} label="Média Geral" tone="green" />
          <CouncilMetric icon={<CalendarClock size={21} />} value={formatarPercentual(mediaGeral === null ? null : alunos.reduce((soma, aluno) => soma + (aluno.frequencia ?? 0), 0) / total)} label="Frequência Média" />
          <CouncilMetric icon={<BookOpen size={21} />} value={String(disciplinas.length)} label="Disciplinas" />
        </div>
      </section>

      <div className="detail-tabs">
        <button className={aba === "alunos" ? "active" : ""} onClick={() => setAba("alunos")}>Alunos ({alunos.length})</button>
        <button className={aba === "estatisticas" ? "active" : ""} onClick={() => setAba("estatisticas")}>Estatísticas</button>
      </div>

      {aba === "alunos" && (
        <>
          <label className="search-box class-search">
            <Search size={21} />
            <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar aluno por nome ou matrícula..." />
          </label>
          <div className="panel students-table-wrap">
            <table className="students-table">
              <thead><tr><th>Nome</th><th>RA</th><th>Média</th><th>Frequência</th><th>Situação</th><th>Elegível</th><th>Líder</th></tr></thead>
              <tbody>
                {alunosFiltrados.map((aluno) => {
                  const status = classificarAluno(aluno);
                  return (
                    <tr
                      className="student-table-row"
                      key={aluno.matricula ?? aluno.nome}
                      onClick={() => setAlunoAberto(aluno)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setAlunoAberto(aluno);
                      }}
                    >
                      <td><strong>{aluno.nome}</strong><span>Nº {aluno.chamada || "-"}</span></td>
                      <td>{aluno.matricula ?? "-"}</td>
                      <td className={status === "critico" ? "danger-text" : "success-text"}>{formatarMediaGlobal(calcularMediaAluno(aluno))}</td>
                      <td>{formatarPercentual(aluno.frequencia)}</td>
                      <td><span className={`class-status-pill ${status}`}>{rotuloClassificacao(aluno)}</span></td>
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
    </>
  );
}

function AlunoDetalheGestao({
  aluno,
  bimestre,
  onVoltar,
  catalogoDeficiencias,
  onSalvarEducacaoEspecial,
}: {
  aluno: Aluno;
  bimestre: string;
  onVoltar: () => void;
  catalogoDeficiencias: string[];
  onSalvarEducacaoEspecial: (matricula: string, deficiencias: string[], comentario: string) => Promise<void>;
}) {
  const [aba, setAba] = useState<"desempenho" | "educacao">("desempenho");
  const [deficienciasSelecionadas, setDeficienciasSelecionadas] = useState<string[]>(aluno.deficiencias);
  const [comentario, setComentario] = useState(aluno.comentarioEducacaoEspecial ?? "");
  const [novaCondicao, setNovaCondicao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const status = classificarAluno(aluno);
  const mediaAluno = calcularMediaAluno(aluno);
  const bimestreAtual = Math.max(1, Math.min(4, Number.parseInt(bimestre, 10) || 1));
  const alturaLinhaGrafico = 22;
  const larguraGraficoAluno = 760;
  const alturaGraficoAluno = Math.max(180, 66 + aluno.disciplinas.length * alturaLinhaGrafico);
  const escalaGraficoAluno = 1.1;
  const graficoDisciplinas = aluno.disciplinas.map((disciplina, indice) => {
    const notaAtual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
    const notas = [null, null, null, null] as Array<number | null>;
    notas[bimestreAtual - 1] = notaAtual;
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

  useEffect(() => {
    setAba("desempenho");
    setDeficienciasSelecionadas(aluno.deficiencias);
    setComentario(aluno.comentarioEducacaoEspecial ?? "");
    setNovaCondicao("");
    setMensagem("");
    setErro("");
  }, [aluno.matricula]);

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
    if (!aluno.matricula) return;
    setSalvando(true);
    setMensagem("");
    setErro("");
    onSalvarEducacaoEspecial(aluno.matricula, deficienciasSelecionadas, comentario)
      .then(() => setMensagem("Informações de educação especial salvas."))
      .catch((err) => setErro(String(err)))
      .finally(() => setSalvando(false));
  }

  return (
    <section className="panel student-profile-panel">
      <button className="back-link student-profile-back" onClick={onVoltar}>← Voltar para alunos</button>
      <header className="student-profile-header">
        <div>
          <h2>{aluno.nome}</h2>
          <p>RA: {aluno.matricula ?? "-"} | Média: {formatarMediaGlobal(mediaAluno)} | Frequência: {formatarPercentual(aluno.frequencia)}</p>
        </div>
        <span className={`class-status-pill ${status}`}>{rotuloClassificacao(aluno)}</span>
      </header>

      <div className="student-profile-tabs">
        <button className={aba === "desempenho" ? "active" : ""} onClick={() => setAba("desempenho")}>Desempenho</button>
        {aluno.elegivel && (
          <button className={aba === "educacao" ? "active" : ""} onClick={() => setAba("educacao")}>Educação Especial</button>
        )}
      </div>

      {aba === "desempenho" && (
      <>
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
                const frequencia = calcularFrequenciaDisciplina(disciplina);
                return (
                  <tr key={disciplina.nome}>
                    <td><strong>{disciplina.nome}</strong></td>
                    {[1, 2, 3, 4].map((indice) => (
                      <td key={indice} className={classeTextoNota(indice === bimestreAtual ? nota : null)}>
                        {indice === bimestreAtual ? formatarNota(nota) : "-"}
                      </td>
                    ))}
                    <td className={classeTextoNota(disciplina.quintoConceito)}>{formatarNota(disciplina.quintoConceito)}</td>
                    <td className={classeTextoNota(nota)}>{formatarNota(nota)}</td>
                    <td className={frequencia !== null && frequencia >= 75 ? "success-text" : "danger-text"}>{formatarPercentual(frequencia)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="student-council-note">
        <h3>Parecer do Conselho - {bimestreAtual}º Bimestre</h3>
        <textarea placeholder="Digite aqui as observações e deliberações do conselho de classe..." />
      </section>
      </>
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
    </section>
  );
}

function ImportarDados({
  onImportarNotas,
  onImportarElegiveis,
}: {
  onImportarNotas: () => void;
  onImportarElegiveis: () => void;
}) {
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importações</span>
          <h1>Importar dados</h1>
          <p>Reúna aqui os arquivos vindos da SED e dos mapões.</p>
        </div>
      </header>

      <section className="import-menu-grid">
        <button type="button" className="import-menu-card" onClick={onImportarNotas}>
          <Upload size={24} />
          <div>
            <strong>Importar notas</strong>
            <span>Leia mapões em lote e atualize notas, faltas e aulas dadas.</span>
          </div>
        </button>
        <button type="button" className="import-menu-card" onClick={onImportarElegiveis}>
          <Check size={24} />
          <div>
            <strong>Importar elegíveis</strong>
            <span>Atualize a lista de estudantes elegíveis e suas condições cadastradas.</span>
          </div>
        </button>
      </section>
    </>
  );
}

function ImportarNotas({
  turmas,
  onSubstituirCsvTurma,
}: {
  turmas: TurmaResumo[];
  onSubstituirCsvTurma: (turma: TurmaResumo, alunos: NovoAlunoPayload[]) => Promise<void>;
}) {
  const [bimestre, setBimestre] = useState("1");
  const [arquivos, setArquivos] = useState<ArquivoMapaoPayload[]>([]);
  const [previa, setPrevia] = useState<PreviaImportacaoMapoes | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoMapoes | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [turmasCsv, setTurmasCsv] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState(false);

  function selecionarArquivos(lista: FileList | null) {
    setErro("");
    setMensagem("");
    setPrevia(null);
    setResultado(null);
    if (!lista?.length) {
      setArquivos([]);
      return;
    }
    Promise.all(Array.from(lista).map(async (arquivo) => ({
      nome: arquivo.name,
      bytes: Array.from(new Uint8Array(await arquivo.arrayBuffer())),
    })))
      .then(setArquivos)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function analisar() {
    if (!arquivos.length) {
      setErro("Selecione ao menos uma planilha de mapão.");
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invoke<PreviaImportacaoMapoes>("analisar_mapoes_lote", {
      input: { bimestre, arquivos },
    })
      .then(setPrevia)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function aplicar() {
    if (!arquivos.length || !previa) return;
    setProcessando(true);
    setErro("");
    setMensagem("");
    invoke<ResultadoImportacaoMapoes>("aplicar_mapoes_lote", {
      input: { bimestre, arquivos },
    })
      .then(setResultado)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function substituirCsvDaTurma(arquivoPrevia: PreviaArquivoMapao, arquivoCsv: File | undefined) {
    if (!arquivoCsv) return;
    const caminhoTurma = arquivoPrevia.turma_caminho ?? turmasCsv[arquivoPrevia.nome] ?? "";
    if (!caminhoTurma) {
      setErro("Selecione a turma que deve receber este CSV antes de enviar o arquivo.");
      return;
    }
    const turma = turmas.find((item) => item.caminho === caminhoTurma);
    if (!turma) {
      setErro("Não encontrei a turma selecionada para atualizar o CSV.");
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    arquivoCsv.text()
      .then(parseCsvAlunos)
      .then((alunos) => {
        if (!alunos.length) {
          throw new Error("Não encontrei alunos válidos no CSV.");
        }
        return onSubstituirCsvTurma(turma, alunos);
      })
      .then(() => invoke<PreviaImportacaoMapoes>("analisar_mapoes_lote", {
        input: { bimestre, arquivos },
      }))
      .then((novaPrevia) => {
        setPrevia(novaPrevia);
        setMensagem(`CSV de ${rotuloTurma(turma)} substituído. A prévia foi recalculada.`);
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function precisaAcaoCsv(arquivo: PreviaArquivoMapao) {
    return Boolean(arquivo.erro) || arquivo.nao_encontrados > 0 || arquivo.duplicados > 0 || (arquivo.alunos_lidos > 0 && arquivo.correspondencias < arquivo.alunos_lidos);
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importação em lote</span>
          <h1>Importar notas</h1>
          <p>Selecione vários mapões para casar alunos pelo nome e importar médias, faltas e aulas dadas.</p>
        </div>
      </header>

      <section className="panel import-notes-panel">
        <div className="import-notes-controls">
          <label>Bimestre
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)}>
              <option value="1">1º bimestre</option>
              <option value="2">2º bimestre</option>
              <option value="3">3º bimestre</option>
              <option value="4">4º bimestre</option>
            </select>
          </label>

          <label className="file-picker-button">
            Selecionar mapões
            <input type="file" multiple accept=".xlsx,.xls" onChange={(event) => selecionarArquivos(event.target.files)} />
          </label>

          <button className="primary-action" onClick={analisar} disabled={processando || !arquivos.length}>
            {processando ? "Processando..." : "Analisar"}
          </button>
        </div>

        <div className="import-file-summary">
          {arquivos.length ? `${arquivos.length} planilha(s) selecionada(s)` : "Nenhuma planilha selecionada"}
        </div>

        {erro && <div className="inline-edit-error">{erro}</div>}
        {mensagem && <div className="finish-confirmation compact-confirmation">{mensagem}</div>}
      </section>

      {previa && (
        <section className="panel import-preview-panel">
          <div className="import-preview-heading">
            <h2>Prévia da importação</h2>
            <div>
              <span>Correspondências: <strong>{previa.total_correspondencias}</strong></span>
              <span>Não encontrados: <strong>{previa.total_nao_encontrados}</strong></span>
              <span>Duplicados: <strong>{previa.total_duplicados}</strong></span>
            </div>
          </div>

          {(previa.total_nao_encontrados > 0 || previa.total_duplicados > 0 || previa.arquivos.some((arquivo) => arquivo.erro)) && (
            <div className="import-diagnostics">
              <strong>Verifique antes de aplicar</strong>
              <span>Alunos não encontrados não serão importados. Se o problema estiver no CSV da turma, selecione a turma correta na linha e envie o CSV atualizado.</span>
              {previa.total_duplicados > 0 && <span>Duplicados ficam de fora para evitar gravação no aluno errado.</span>}
            </div>
          )}

          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr><th>Arquivo</th><th>Turma provável</th><th>Alunos</th><th>Disciplinas</th><th>Casados</th><th>Não encontrados</th><th>Duplicados</th><th>Status</th><th>CSV da turma</th></tr>
              </thead>
              <tbody>
                {previa.arquivos.map((arquivo) => (
                  <Fragment key={arquivo.nome}>
                    <tr>
                      <td><span className="truncated-file-name" title={arquivo.nome}>{arquivo.nome}</span></td>
                      <td>{arquivo.turma_alvo ?? "-"}</td>
                      <td>{arquivo.alunos_lidos}</td>
                      <td>{arquivo.disciplinas_lidas}</td>
                      <td className="success-text">{arquivo.correspondencias}</td>
                      <td className={arquivo.nao_encontrados ? "danger-text" : ""}>{arquivo.nao_encontrados}</td>
                      <td className={arquivo.duplicados ? "danger-text" : ""}>{arquivo.duplicados}</td>
                      <td>
                        {arquivo.erro ? (
                          <span className="class-status-pill critico">Erro</span>
                        ) : arquivo.alunos_lidos > 0 && arquivo.correspondencias === 0 ? (
                          <span className="class-status-pill atencao">Conferir CSV</span>
                        ) : (
                          <span className="class-status-pill adequado">Lido</span>
                        )}
                      </td>
                      <td>
                        {precisaAcaoCsv(arquivo) ? (
                          <div className="csv-repair-cell">
                            <select
                              value={arquivo.turma_caminho ?? turmasCsv[arquivo.nome] ?? ""}
                              onChange={(event) => setTurmasCsv((atuais) => ({ ...atuais, [arquivo.nome]: event.target.value }))}
                              aria-label={`Turma para atualizar CSV de ${arquivo.nome}`}
                            >
                              <option value="">Selecionar turma</option>
                              {turmas.map((turma) => (
                                <option key={turma.caminho} value={turma.caminho}>{rotuloTurma(turma)}</option>
                              ))}
                            </select>
                            <label className="mini-file-action">
                              Limpar e subir CSV
                              <input type="file" accept=".csv,text/csv" onChange={(event) => substituirCsvDaTurma(arquivo, event.target.files?.[0])} />
                            </label>
                          </div>
                        ) : "-"}
                      </td>
                    </tr>
                    {(arquivo.erro || arquivo.nomes_nao_encontrados.length > 0 || arquivo.nomes_duplicados.length > 0) && (
                      <tr className="import-error-row">
                        <td colSpan={9}>
                          {arquivo.erro && <p>{arquivo.erro}</p>}
                          {arquivo.nomes_nao_encontrados.length > 0 && (
                            <p><strong>Não encontrados:</strong> {arquivo.nomes_nao_encontrados.slice(0, 20).join(", ")}{arquivo.nomes_nao_encontrados.length > 20 ? ` e mais ${arquivo.nomes_nao_encontrados.length - 20}` : ""}</p>
                          )}
                          {arquivo.nomes_duplicados.length > 0 && (
                            <p><strong>Duplicados:</strong> {arquivo.nomes_duplicados.slice(0, 20).join(", ")}{arquivo.nomes_duplicados.length > 20 ? ` e mais ${arquivo.nomes_duplicados.length - 20}` : ""}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="import-preview-actions">
            <button className="primary-action" onClick={aplicar} disabled={processando || previa.total_correspondencias === 0}>
              {processando ? "Importando..." : "Aplicar importação"}
            </button>
          </div>
        </section>
      )}

      {resultado && (
        <section className="finish-confirmation import-result">
          <strong>Importação concluída.</strong>
          <span>Turmas atualizadas: {resultado.turmas_atualizadas}</span>
          <span>Alunos atualizados: {resultado.alunos_atualizados}</span>
        </section>
      )}
    </>
  );
}

function ImportarElegiveis({ onImportado }: { onImportado: () => void }) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [arquivoBytes, setArquivoBytes] = useState<number[] | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoElegiveis | null>(null);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  function selecionarArquivo(arquivo: File | undefined) {
    setErro("");
    setResultado(null);
    setArquivoNome("");
    setArquivoBytes(null);
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith(".csv")) {
      setErro("Selecione um arquivo CSV.");
      return;
    }
    arquivo.arrayBuffer()
      .then((buffer) => {
        setArquivoNome(arquivo.name);
        setArquivoBytes(Array.from(new Uint8Array(buffer)));
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function importar() {
    if (!arquivoNome || !arquivoBytes) {
      setErro("Selecione o CSV com a lista de alunos elegíveis.");
      return;
    }
    setProcessando(true);
    setErro("");
    setResultado(null);
    invoke<ResultadoImportacaoElegiveis>("importar_alunos_elegiveis", {
      input: { nome: arquivoNome, bytes: arquivoBytes },
    })
      .then((resposta) => {
        setResultado(resposta);
        onImportado();
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Lista de elegibilidade</span>
          <h1>Importar alunos elegíveis</h1>
          <p>Atualize a indicação de aluno elegível e a lista de deficiências a partir do CSV geral da escola.</p>
        </div>
      </header>

      <section className="panel import-notes-panel">
        <div className="import-notes-controls">
          <label className="file-picker-button">
            Selecionar CSV
            <input type="file" accept=".csv,text/csv" onChange={(event) => selecionarArquivo(event.target.files?.[0])} />
          </label>

          <button className="primary-action" onClick={importar} disabled={processando || !arquivoBytes}>
            {processando ? "Importando..." : "Importar elegíveis"}
          </button>
        </div>

        <div className="import-file-summary">
          {arquivoNome || "Nenhum CSV selecionado"}
        </div>

        {erro && <div className="inline-edit-error">{erro}</div>}
      </section>

      {resultado && (
        <section className="panel import-preview-panel">
          <div className="import-preview-heading">
            <h2>Resultado da importação</h2>
            <div>
              <span>Registros no CSV: <strong>{resultado.registros_csv}</strong></span>
              <span>Alunos atualizados: <strong>{resultado.alunos_atualizados}</strong></span>
              <span>Turmas atualizadas: <strong>{resultado.turmas_atualizadas}</strong></span>
            </div>
          </div>

          <div className="import-result-grid">
            <article>
              <strong>{resultado.turmas_lidas}</strong>
              <span>Turmas lidas</span>
            </article>
            <article>
              <strong>{resultado.por_matricula}</strong>
              <span>Casados por RA</span>
            </article>
            <article>
              <strong>{resultado.por_nome}</strong>
              <span>Casados por nome</span>
            </article>
            <article>
              <strong>{resultado.nao_encontrados.length}</strong>
              <span>Não encontrados</span>
            </article>
          </div>

          {(resultado.nao_encontrados.length > 0 || resultado.nomes_ambiguos.length > 0) && (
            <div className="import-diagnostics">
              <strong>Verifique os itens pendentes</strong>
              {resultado.nao_encontrados.length > 0 && (
                <span>
                  Não encontrados: {resultado.nao_encontrados.slice(0, 25).join(", ")}
                  {resultado.nao_encontrados.length > 25 ? ` e mais ${resultado.nao_encontrados.length - 25}` : ""}
                </span>
              )}
              {resultado.nomes_ambiguos.length > 0 && (
                <span>
                  Nomes ambíguos: {resultado.nomes_ambiguos.slice(0, 25).join(", ")}
                  {resultado.nomes_ambiguos.length > 25 ? ` e mais ${resultado.nomes_ambiguos.length - 25}` : ""}
                </span>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function Turmas({
  turmas,
  erroTurmas,
  onSelecionar,
  onCriarTurma,
  onEditarTurma,
  onExcluirTurma,
}: {
  turmas: TurmaResumo[];
  erroTurmas: string;
  onSelecionar: (turma: TurmaResumo) => void;
  onCriarTurma: (payload: NovaTurmaPayload) => Promise<void>;
  onEditarTurma: (turma: TurmaResumo, payload: NovaTurmaPayload) => Promise<void>;
  onExcluirTurma: (turma: TurmaResumo) => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [cicloFiltro, setCicloFiltro] = useState("todos");
  const [criando, setCriando] = useState(false);
  const [modoCriacao, setModoCriacao] = useState<"individual" | "lote">("individual");
  const [turmaEditando, setTurmaEditando] = useState<TurmaResumo | null>(null);
  const [turmaExcluindo, setTurmaExcluindo] = useState<TurmaResumo | null>(null);
  const [ciclo, setCiclo] = useState("EM");
  const [serie, setSerie] = useState(CICLOS_TURMA.EM[0]);
  const [letra, setLetra] = useState("A");
  const [letraFinal, setLetraFinal] = useState("G");
  const [sala, setSala] = useState("");
  const [periodo, setPeriodo] = useState(PERIODOS_TURMA[0]);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [arquivoNome, setArquivoNome] = useState("");
  const [alunosCsv, setAlunosCsv] = useState<NovoAlunoPayload[]>([]);
  const [csvsLote, setCsvsLote] = useState<Record<string, { nome: string; alunos: NovoAlunoPayload[] }>>({});
  const [substituirLista, setSubstituirLista] = useState(false);
  const [erroCriacao, setErroCriacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const ciclosDisponiveis = useMemo(() => {
    const ciclosCadastrados = turmas.map((turma) => turma.ciclo || "Sem ciclo");
    const ciclos = Array.from(new Set(ciclosCadastrados.filter(Boolean)));
    return ciclos.sort((a, b) => rotuloCiclo(a).localeCompare(rotuloCiclo(b), "pt-BR", { numeric: true }));
  }, [turmas]);
  const turmasFiltradas = useMemo(() => {
    const filtradasPorBusca = filtrarTurmas(turmas, busca);
    if (cicloFiltro === "todos") return filtradasPorBusca;
    return filtradasPorBusca.filter((turma) => (turma.ciclo || "Sem ciclo") === cicloFiltro);
  }, [busca, cicloFiltro, turmas]);
  const codigoPreview = codigoTurma(serie, letra);
  const letrasLote = useMemo(() => gerarLetrasIntervalo(letra, letraFinal), [letra, letraFinal]);

  useEffect(() => {
    if (cicloFiltro !== "todos" && !ciclosDisponiveis.includes(cicloFiltro)) {
      setCicloFiltro("todos");
    }
  }, [cicloFiltro, ciclosDisponiveis]);

  function limparFormulario() {
    setModoCriacao("individual");
    setCiclo("EM");
    setSerie(CICLOS_TURMA.EM[0]);
    setLetra("A");
    setLetraFinal("G");
    setSala("");
    setPeriodo(PERIODOS_TURMA[0]);
    setAno(String(new Date().getFullYear()));
    setArquivoNome("");
    setAlunosCsv([]);
    setCsvsLote({});
    setSubstituirLista(false);
    setErroCriacao("");
    setTurmaEditando(null);
  }

  function abrirCriacao() {
    if (criando && !turmaEditando && modoCriacao === "individual") {
      setCriando(false);
      return;
    }
    limparFormulario();
    setModoCriacao("individual");
    setCriando(true);
  }

  function abrirCriacaoLote() {
    if (criando && !turmaEditando && modoCriacao === "lote") {
      setCriando(false);
      return;
    }
    limparFormulario();
    setModoCriacao("lote");
    setCriando(true);
  }

  function abrirEdicao(turma: TurmaResumo) {
    const cicloAtual = turma.ciclo && CICLOS_TURMA[turma.ciclo] ? turma.ciclo : "EM";
    const series = CICLOS_TURMA[cicloAtual] ?? CICLOS_TURMA.EM;
    setModoCriacao("individual");
    setCiclo(cicloAtual);
    setSerie(turma.serie ? (series.find((item) => mesmaSerie(item, turma.serie ?? "")) ?? series[0]) : series[0]);
    setLetra(letraTurma(turma));
    setLetraFinal(letraTurma(turma));
    setSala(turma.sala ?? "");
    setPeriodo(turma.periodo && PERIODOS_TURMA.includes(turma.periodo) ? turma.periodo : PERIODOS_TURMA[0]);
    setAno(String(turma.ano));
    setArquivoNome("");
    setAlunosCsv([]);
    setCsvsLote({});
    setErroCriacao("");
    setTurmaEditando(turma);
    setCriando(true);
  }

  function alterarCiclo(valor: string) {
    setCiclo(valor);
    const series = CICLOS_TURMA[valor] ?? CICLOS_TURMA.EM;
    setSerie(series[0]);
    setCsvsLote({});
    setArquivoNome("");
  }

  function selecionarCsv(arquivo: File | undefined) {
    setErroCriacao("");
    setArquivoNome("");
    setAlunosCsv([]);
    if (!arquivo) return;
    arquivo.text()
      .then((texto) => {
        const alunos = parseCsvAlunos(texto);
        if (!alunos.length) {
          throw new Error("Nao encontrei alunos validos no CSV.");
        }
        setArquivoNome(arquivo.name);
        setAlunosCsv(alunos);
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)));
  }

  function selecionarCsvsLote(arquivos: FileList | null) {
    setErroCriacao("");
    setArquivoNome("");
    setCsvsLote({});
    if (!arquivos?.length) return;

    const esperadas = gerarLetrasIntervalo(letra, letraFinal);
    if (!esperadas.length) {
      setErroCriacao("Informe um intervalo de turmas valido antes de selecionar os CSVs.");
      return;
    }

    Promise.all(Array.from(arquivos).map((arquivo) => arquivo.text().then((texto) => {
      const nomeNormalizado = nomeBaseCsv(arquivo.name);
      const alunos = parseCsvAlunos(texto);
      if (!alunos.length) {
        throw new Error(`${arquivo.name}: nao encontrei alunos validos no CSV.`);
      }
      return { letra: nomeNormalizado, nome: arquivo.name, alunos, assinatura: assinaturaCsvAlunos(alunos) };
    })))
      .then((lidos) => {
        const letrasEsperadas = new Set(esperadas);
        const mapa: Record<string, { nome: string; alunos: NovoAlunoPayload[] }> = {};
        const assinaturas = new Map<string, string>();
        const repetidos: string[] = [];
        const foraDoPadrao: string[] = [];
        const conteudosRepetidos: string[] = [];

        lidos.forEach((item) => {
          if (!item.letra || !letrasEsperadas.has(item.letra)) {
            foraDoPadrao.push(item.nome);
            return;
          }
          if (mapa[item.letra]) {
            repetidos.push(item.nome);
            return;
          }
          const anterior = assinaturas.get(item.assinatura);
          if (anterior) {
            conteudosRepetidos.push(`${anterior} e ${item.nome}`);
            return;
          }
          assinaturas.set(item.assinatura, item.nome);
          mapa[item.letra] = { nome: item.nome, alunos: item.alunos };
        });

        const faltantes = esperadas.filter((item) => !mapa[item]);
        const problemas = [
          faltantes.length ? `Faltam CSVs para: ${faltantes.map((item) => `${item}.csv`).join(", ")}.` : "",
          foraDoPadrao.length ? `Arquivos fora do intervalo ou fora do padrao letra.csv: ${foraDoPadrao.join(", ")}.` : "",
          repetidos.length ? `Arquivos repetidos para a mesma turma: ${repetidos.join(", ")}.` : "",
          conteudosRepetidos.length ? `CSVs com o mesmo conteúdo: ${conteudosRepetidos.join("; ")}.` : "",
        ].filter(Boolean);

        if (problemas.length) {
          setErroCriacao(problemas.join(" "));
          return;
        }

        setCsvsLote(mapa);
        setArquivoNome(`${lidos.length} CSVs selecionados`);
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)));
  }

  function criar() {
    const anoNumero = Number.parseInt(ano, 10);
    if (!Number.isFinite(anoNumero)) {
      setErroCriacao("Ano letivo invalido.");
      return;
    }
    if (modoCriacao === "lote" && !turmaEditando) {
      criarLote(anoNumero);
      return;
    }
    const conflitoSala = encontrarConflitoSala(turmas, anoNumero, periodo, sala, turmaEditando?.caminho);
    if (conflitoSala) {
      setErroCriacao(`A sala ${sala} ja esta ocupada no periodo ${periodo} por ${rotuloTurma(conflitoSala)}.`);
      return;
    }
    if (!turmaEditando && !alunosCsv.length) {
      setErroCriacao("Selecione o CSV de alunos antes de criar a turma.");
      return;
    }
    setSalvando(true);
    setErroCriacao("");
    const payload = {
      codigo: codigoPreview,
      ano: anoNumero,
      serie,
      sala,
      periodo,
      ciclo,
      alunos: alunosCsv,
      substituir_alunos: turmaEditando ? substituirLista : false,
    };
    const acao = turmaEditando ? onEditarTurma(turmaEditando, payload) : onCriarTurma(payload);
    acao
      .then(() => {
        setCriando(false);
        limparFormulario();
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)))
      .finally(() => setSalvando(false));
  }

  function criarLote(anoNumero: number) {
    const letras = gerarLetrasIntervalo(letra, letraFinal);
    if (!letras.length) {
      setErroCriacao("Informe um intervalo de turmas valido.");
      return;
    }
    const faltantes = letras.filter((item) => !csvsLote[item]);
    if (faltantes.length) {
      setErroCriacao(`Selecione os CSVs esperados antes de criar: ${faltantes.map((item) => `${item}.csv`).join(", ")}.`);
      return;
    }
    const codigosLote = letras.map((item) => codigoTurma(serie, item));
    const existentes = turmas.filter((turma) => turma.ano === anoNumero && codigosLote.some((codigo) => normalizarTextoCsv(codigo) === normalizarTextoCsv(turma.codigo)));
    if (existentes.length) {
      setErroCriacao(`Ja existe cadastro para: ${existentes.map(rotuloTurma).join(", ")}.`);
      return;
    }
    const salasGeradas = letras.map((_, indice) => salaLote(sala, indice)).filter(Boolean).map(chaveConflitoSala);
    if (new Set(salasGeradas).size !== salasGeradas.length) {
      setErroCriacao("O lote geraria duas ou mais turmas na mesma sala e período. Ajuste a sala inicial ou deixe o campo vazio.");
      return;
    }
    const conflitosSala = letras.flatMap((letraAtual, indice) => {
      const numeroSala = salaLote(sala, indice);
      const turmaConflitante = encontrarConflitoSala(turmas, anoNumero, periodo, numeroSala);
      return turmaConflitante ? [`${codigoTurma(serie, letraAtual)} usaria a sala ${numeroSala}, ja ocupada por ${rotuloTurma(turmaConflitante)}`] : [];
    });
    if (conflitosSala.length) {
      setErroCriacao(conflitosSala.join(". ") + ".");
      return;
    }

    setSalvando(true);
    setErroCriacao("");
    letras.reduce<Promise<void>>((promessa, letraAtual, indice) => promessa.then(() => {
      const csv = csvsLote[letraAtual];
      return onCriarTurma({
        codigo: codigoTurma(serie, letraAtual),
        ano: anoNumero,
        serie,
        sala: salaLote(sala, indice),
        periodo,
        ciclo,
        alunos: csv.alunos,
        substituir_alunos: false,
      });
    }), Promise.resolve())
      .then(() => {
        setCriando(false);
        limparFormulario();
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)))
      .finally(() => setSalvando(false));
  }

  function confirmarExclusao() {
    if (!turmaExcluindo) return;
    setExcluindo(true);
    onExcluirTurma(turmaExcluindo)
      .then(() => setTurmaExcluindo(null))
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)))
      .finally(() => setExcluindo(false));
  }

  return (
    <>
      <header className="topbar turmas-topbar">
        <div>
          <span className="eyebrow">Dados reais</span>
          <h1>Gestao de turmas</h1>
          <p>Gerencie todas as turmas salvas no CoordenacaoOP.</p>
        </div>
        <div className="turmas-actions">
          <button className="secondary-action" onClick={abrirCriacaoLote}>
            <Upload size={18} />
            Criar salas em lote
          </button>
          <button className="primary-action" onClick={abrirCriacao}>
            <Plus size={18} />
            Nova turma
          </button>
        </div>
      </header>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      {criando && (
        <section className="panel create-class-panel">
          <div className="create-class-heading">
            <div>
              <h2>{turmaEditando ? "Editar turma" : modoCriacao === "lote" ? "Criar salas em lote" : "Criar nova turma"}</h2>
              <p>
                {turmaEditando
                  ? "Atualize os dados cadastrais da turma ou envie um CSV novo para atualizar alunos."
                  : modoCriacao === "lote"
                    ? "Informe ciclo, série, intervalo de letras e selecione um CSV para cada sala, nomeado como A.csv, B.csv, C.csv..."
                    : "Informe os dados da turma e selecione o CSV de alunos."}
              </p>
            </div>
            <span>
              {modoCriacao === "lote" && !turmaEditando
                ? <>Salas: <strong>{letrasLote.length ? letrasLote.map((item) => codigoTurma(serie, item)).join(", ") : "intervalo invalido"}</strong></>
                : <>Codigo: <strong>{codigoPreview}</strong></>}
            </span>
          </div>

          <div className="create-class-grid">
            <label>Ciclo
              <select value={ciclo} onChange={(event) => alterarCiclo(event.target.value)}>
                {Object.keys(CICLOS_TURMA).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Série
              <select value={serie} onChange={(event) => {
                setSerie(event.target.value);
                setCsvsLote({});
                setArquivoNome("");
              }}>
                {(CICLOS_TURMA[ciclo] ?? CICLOS_TURMA.EM).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>{modoCriacao === "lote" && !turmaEditando ? "Turma inicial" : "Turma"}
              <input value={letra} onChange={(event) => {
                setLetra(event.target.value.toLocaleUpperCase("pt-BR").slice(0, 3));
                setCsvsLote({});
                setArquivoNome("");
              }} />
            </label>
            {modoCriacao === "lote" && !turmaEditando && (
              <label>Turma final
                <input value={letraFinal} onChange={(event) => {
                  setLetraFinal(event.target.value.toLocaleUpperCase("pt-BR").slice(0, 3));
                  setCsvsLote({});
                  setArquivoNome("");
                }} />
              </label>
            )}
            <label>{modoCriacao === "lote" && !turmaEditando ? "Número da sala inicial (opcional)" : "Número da sala"}
              <input value={sala} onChange={(event) => setSala(event.target.value)} />
            </label>
            <label>Período
              <select value={periodo} onChange={(event) => setPeriodo(event.target.value)}>
                {PERIODOS_TURMA.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Ano letivo
              <input value={ano} onChange={(event) => setAno(event.target.value.replace(/\D/g, "").slice(0, 4))} />
            </label>
          </div>

          <div className="create-class-file-row">
            <label className="file-picker-button">
              {turmaEditando ? "Atualizar CSV" : modoCriacao === "lote" ? "Selecionar CSVs" : "Selecionar CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                multiple={modoCriacao === "lote" && !turmaEditando}
                onChange={(event) => modoCriacao === "lote" && !turmaEditando ? selecionarCsvsLote(event.target.files) : selecionarCsv(event.target.files?.[0])}
              />
            </label>
            <span>
              {modoCriacao === "lote" && !turmaEditando
                ? arquivoNome
                  ? `${arquivoNome} - ${Object.values(csvsLote).reduce((total, item) => total + item.alunos.length, 0)} alunos encontrados`
                  : `Esperado: ${letrasLote.length ? letrasLote.map((item) => `${item}.csv`).join(", ") : "informe o intervalo"}`
                : arquivoNome
                ? `${arquivoNome} - ${alunosCsv.length} alunos encontrados`
                : turmaEditando
                  ? "Opcional: preserva dados existentes, adiciona novos e inativa ausentes"
                  : "Nenhum CSV selecionado"}
            </span>
          </div>

          {modoCriacao === "lote" && !turmaEditando && Object.keys(csvsLote).length > 0 && (
            <div className="batch-csv-summary">
              {letrasLote.map((item) => (
                <span key={item}>{item}.csv: <strong>{csvsLote[item]?.alunos.length ?? 0} alunos</strong></span>
              ))}
            </div>
          )}

          {turmaEditando && alunosCsv.length > 0 && (
            <label className="replace-students-option">
              <input
                type="checkbox"
                checked={substituirLista}
                onChange={(event) => setSubstituirLista(event.target.checked)}
              />
              <span>Limpar lista atual e substituir pelo CSV selecionado</span>
            </label>
          )}

          {erroCriacao && <div className="inline-edit-error">{erroCriacao}</div>}

          <div className="create-class-actions">
            <button onClick={() => { setCriando(false); limparFormulario(); }}>Cancelar</button>
            <button className="primary-action" onClick={criar} disabled={salvando}>
              {salvando ? "Salvando..." : turmaEditando ? "Salvar alterações" : modoCriacao === "lote" ? "Criar salas" : "Criar turma"}
            </button>
          </div>
        </section>
      )}

      <section className="panel turmas-search-panel">
        <label className="search-box">
          <Search size={21} />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar turma ou coordenador de sala..."
          />
        </label>
        <label className="series-filter">
          Ciclo
          <select value={cicloFiltro} onChange={(event) => setCicloFiltro(event.target.value)}>
            <option value="todos">Todos os ciclos</option>
            {ciclosDisponiveis.map((cicloItem) => (
              <option key={cicloItem} value={cicloItem}>{rotuloCiclo(cicloItem)}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="turmas-card-grid">
        {turmasFiltradas.map((turma) => (
          <article className="turma-card" key={turma.caminho}>
            <div className="turma-card-actions" aria-label="Acoes futuras da turma">
              <button title="Editar turma" onClick={() => abrirEdicao(turma)}>
                <Pencil size={17} />
              </button>
              <button title="Excluir turma" onClick={() => setTurmaExcluindo(turma)}>
                <Trash2 size={17} />
              </button>
            </div>

            <div className="turma-card-main">
              <h2>{rotuloTurma(turma)}</h2>
              <span>{rotuloSerie(turma.serie) || turma.ciclo || `${turma.ano}`}</span>
            </div>

            <div className="turma-card-meta">
              <span className="meta-line">
                <Users size={17} />
                {turma.alunos_ativos} alunos ativos
              </span>
              <span>
                Periodo: <strong>{turma.periodo ?? "Nao informado"}</strong>
              </span>
              <span>
                Coordenador de sala: <strong>{turma.coordenador_turma || "A definir"}</strong>
              </span>
              <span className="class-leaders-line">
                Líderes de sala:
                <strong>{turma.lider_sala || "Líder a definir"}</strong>
                <strong>{turma.vice_lider_sala || "Vice líder a definir"}</strong>
              </span>
              <span>
                Elegiveis: <strong>{turma.alunos_elegiveis}</strong>
              </span>
            </div>

            <button className="details-action" onClick={() => onSelecionar(turma)}>
              Ver detalhes
            </button>
          </article>
        ))}

        {!turmasFiltradas.length && (
          <div className="panel empty-state">
            <ClipboardList size={32} />
            <strong>Nenhuma turma encontrada</strong>
            <span>Ajuste a busca ou importe/crie uma turma no app atual.</span>
          </div>
        )}
      </section>

      {turmaExcluindo && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel delete-class-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-class-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Confirmar exclusão</span>
                <h2 id="delete-class-title">Excluir {rotuloTurma(turmaExcluindo)}?</h2>
              </div>
              <button onClick={() => setTurmaExcluindo(null)} aria-label="Fechar confirmação">
                <X size={18} />
              </button>
            </div>
            <div className="delete-class-body">
              <p>Esta ação apaga o arquivo da turma e remove seus alunos, notas e registros vinculados nesta turma.</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setTurmaExcluindo(null)}>Cancelar</button>
              <button className="danger-action" onClick={confirmarExclusao} disabled={excluindo}>
                {excluindo ? "Excluindo..." : "Excluir turma"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function FinalizacaoConselho({
  turmaLabel,
  tempoSegundos,
  turmaSelecionada,
  turmaDetalhe,
  onClose,
  onFinished,
}: {
  turmaLabel: string;
  tempoSegundos: number;
  turmaSelecionada: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [textoAta, setTextoAta] = useState(
    turmaDetalhe?.texto_ata || `Conselho de classe - ${turmaLabel}`,
  );
  const [gerarAta, setGerarAta] = useState(true);
  const [gerarRelatorio, setGerarRelatorio] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<FinalizacaoResultado | null>(null);

  function finalizar() {
    if (!turmaSelecionada || !turmaDetalhe) {
      setErro("Selecione uma turma antes de finalizar o conselho.");
      return;
    }

    setErro("");
    setSalvando(true);
    invoke<FinalizacaoResultado>("salvar_finalizacao_conselho", {
      caminho: turmaSelecionada.caminho,
      bimestre: turmaDetalhe.bimestre,
      finalizacao: {
        texto: textoAta,
        tempo_segundos: tempoSegundos,
        gerar_ata: gerarAta,
        gerar_relatorio: gerarRelatorio,
      },
    })
      .then((retorno) => setResultado(retorno))
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setSalvando(false));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel finish-council-panel" role="dialog" aria-modal="true" aria-labelledby="finish-council-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Tempo de reuniao: {formatarTempo(tempoSegundos)}</span>
            <h2 id="finish-council-title">Finalizar conselho</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar finalizacao">
            <X size={18} />
          </button>
        </div>

        <div className="finish-council-body">
          <label>
            Texto da ata
            <textarea value={textoAta} onChange={(event) => setTextoAta(event.target.value)} rows={12} />
          </label>

          <div className="document-options">
            <button className={gerarAta ? "selected" : ""} onClick={() => setGerarAta((atual) => !atual)}>
              <FileText size={18} />
              Gerar ata deste conselho
            </button>
            <button className={gerarRelatorio ? "selected" : ""} onClick={() => setGerarRelatorio((atual) => !atual)}>
              <ClipboardList size={18} />
              Gerar relatorio para professores
            </button>
          </div>

          {erro && <div className="inline-edit-error">{erro}</div>}

          {resultado && (
            <div className="finish-confirmation">
              <strong>Conselho finalizado com sucesso.</strong>
              {resultado.ata && <span>Ata salva em: {resultado.ata}</span>}
              {resultado.relatorio && <span>Relatorio salvo em: {resultado.relatorio}</span>}
              {!resultado.ata && !resultado.relatorio && <span>Nenhum documento foi gerado.</span>}
            </div>
          )}
        </div>

        <div className="modal-actions">
          {resultado ? (
            <button className="primary-action" onClick={onFinished}>Fechar modo reuniao</button>
          ) : (
            <>
              <button onClick={onClose}>Retornar ao conselho</button>
              <button className="primary-action" onClick={finalizar} disabled={salvando}>
                {salvando ? "Finalizando..." : "Finalizar"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function RelatoriosMenu({
  onAbrirCriticos,
  onAbrirAlteracoesNotas,
}: {
  onAbrirCriticos: () => void;
  onAbrirAlteracoesNotas: () => void;
}) {
  return (
    <section className="reports-page">
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Central de relatórios</h1>
          <p>Escolha o relatório que deseja gerar.</p>
        </div>
      </header>

      <section className="report-menu-grid">
        <button type="button" className="report-menu-card" onClick={onAbrirCriticos}>
          <FileText size={26} />
          <div>
            <strong>Relatório de Alunos Críticos</strong>
            <span>Lista estudantes por turma com excesso de faltas ou situação crítica por notas.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirAlteracoesNotas}>
          <ClipboardList size={26} />
          <div>
            <strong>Alterações de Notas Pós-Conselho</strong>
            <span>Compara as notas decididas no conselho com o último mapão importado.</span>
          </div>
        </button>
      </section>
    </section>
  );
}

function RelatorioAlunosCriticos({ turmas, onVoltar }: { turmas: TurmaResumo[]; onVoltar: () => void }) {
  const [serie, setSerie] = useState("todas");
  const [bimestre, setBimestre] = useState("1");
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<RelatorioAlunosCriticosResultado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const series = useMemo(() => {
    const unicas = new Set<string>();
    turmas.forEach((turma) => {
      const rotulo = rotuloSerie(turma.serie) || turma.serie || turma.ciclo || "";
      if (rotulo.trim()) unicas.add(rotulo.trim());
    });
    return Array.from(unicas).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [turmas]);

  useEffect(() => {
    if (serie !== "todas" && !series.includes(serie)) {
      setSerie("todas");
    }
  }, [serie, series]);

  function gerarRelatorioCriticos() {
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invoke<RelatorioAlunosCriticosResultado>("gerar_relatorio_alunos_criticos", {
      input: {
        serie: serie === "todas" ? null : serie,
        bimestre,
      },
    })
      .then((resposta) => {
        setResultado(resposta);
        setMensagem(`Relatório gerado com ${resposta.alunos} aluno(s) em ${resposta.turmas} turma(s).`);
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function abrirRelatorio() {
    if (!resultado?.caminho) return;
    setErro("");
    invoke<string>("abrir_documento_conselho", { input: { caminho: resultado.caminho } })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function abrirPastaRelatorios() {
    if (!resultado?.pasta) return;
    setErro("");
    invoke<string>("abrir_pasta", { caminho: resultado.pasta })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Relatório de Alunos Críticos</h1>
          <p>Gere uma lista por turma com estudantes em excesso de faltas ou situação crítica por notas.</p>
        </div>
      </header>

      <section className="panel report-generator-card">
        <div className="report-generator-heading">
          <div>
            <h2>Alunos críticos</h2>
            <p>O relatório é dividido por turma e informa o motivo da inclusão do estudante.</p>
          </div>
          <FileText size={28} />
        </div>

        <div className="report-controls">
          <label>
            Bimestre
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)}>
              {opcoesBimestre.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
          <label>
            Turmas
            <select value={serie} onChange={(event) => setSerie(event.target.value)}>
              <option value="todas">Todas as salas</option>
              {series.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="report-actions">
          <button className="primary-action" onClick={gerarRelatorioCriticos} disabled={processando || !turmas.length}>
            {processando ? "Gerando..." : "Gerar relatório"}
          </button>
          {resultado && (
            <button className="secondary-action" onClick={abrirRelatorio}>
              Abrir relatório
            </button>
          )}
          <button className="secondary-action" onClick={abrirPastaRelatorios} disabled={!resultado}>
            Abrir pasta
          </button>
        </div>

        {mensagem && <div className="notice success">{mensagem}</div>}
        {resultado && <span className="report-path">Salvo em: {resultado.caminho}</span>}
        {erro && <div className="notice error">{erro}</div>}
      </section>
    </section>
  );
}

function RelatorioAlteracoesNotas({ turmas, onVoltar }: { turmas: TurmaResumo[]; onVoltar: () => void }) {
  const [serie, setSerie] = useState("todas");
  const [bimestre, setBimestre] = useState("1");
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<RelatorioAlteracoesNotasResultado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const series = useMemo(() => {
    const unicas = new Set<string>();
    turmas.forEach((turma) => {
      const rotulo = rotuloSerie(turma.serie) || turma.serie || turma.ciclo || "";
      if (rotulo.trim()) unicas.add(rotulo.trim());
    });
    return Array.from(unicas).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [turmas]);

  useEffect(() => {
    if (serie !== "todas" && !series.includes(serie)) {
      setSerie("todas");
    }
  }, [serie, series]);

  function gerarRelatorioAlteracoes() {
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invoke<RelatorioAlteracoesNotasResultado>("gerar_relatorio_alteracoes_notas", {
      input: {
        serie: serie === "todas" ? null : serie,
        bimestre,
      },
    })
      .then((resposta) => {
        setResultado(resposta);
        setMensagem(
          `Relatório gerado com ${resposta.pendentes} pendência(s) e ${resposta.alteradas} alteração(ões) confirmada(s) em ${resposta.turmas} turma(s).`,
        );
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function abrirRelatorio() {
    if (!resultado?.caminho) return;
    setErro("");
    invoke<string>("abrir_documento_conselho", { input: { caminho: resultado.caminho } })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function abrirPastaRelatorios() {
    if (!resultado?.pasta) return;
    setErro("");
    invoke<string>("abrir_pasta", { caminho: resultado.pasta })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Alterações de Notas Pós-Conselho</h1>
          <p>Confira se as notas ajustadas no conselho já aparecem corretamente no último mapão importado.</p>
        </div>
      </header>

      <section className="panel report-generator-card">
        <div className="report-generator-heading">
          <div>
            <h2>Conferência pós-conselho</h2>
            <p>O relatório mostra primeiro as pendências e depois as alterações confirmadas por turma.</p>
          </div>
          <ClipboardList size={28} />
        </div>

        <div className="report-controls">
          <label>
            Bimestre
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)}>
              {opcoesBimestre.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
          <label>
            Turmas
            <select value={serie} onChange={(event) => setSerie(event.target.value)}>
              <option value="todas">Todas as salas</option>
              {series.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="report-actions">
          <button className="primary-action" onClick={gerarRelatorioAlteracoes} disabled={processando || !turmas.length}>
            {processando ? "Gerando..." : "Gerar relatório"}
          </button>
          {resultado && (
            <button className="secondary-action" onClick={abrirRelatorio}>
              Abrir relatório
            </button>
          )}
          <button className="secondary-action" onClick={abrirPastaRelatorios} disabled={!resultado}>
            Abrir pasta
          </button>
        </div>

        {mensagem && <div className="notice success">{mensagem}</div>}
        {resultado && <span className="report-path">Salvo em: {resultado.caminho}</span>}
        {erro && <div className="notice error">{erro}</div>}
      </section>
    </section>
  );
}

function Configuracoes({ turmas, onDadosAlterados }: { turmas: TurmaResumo[]; onDadosAlterados: () => void }) {
  const [config, setConfig] = useState<ConfiguracoesApp>({
    direcao_nome: "",
    direcao_pronome: "F",
    nota_minima: 5,
    cabecalho_ata: null,
  });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);
  const [atualizacao, setAtualizacao] = useState<Update | null>(null);
  const [ciclosBackup, setCiclosBackup] = useState<string[]>(["todos"]);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const ciclosExistentes = useMemo(() => {
    const ciclos = Array.from(new Set(turmas.map((turma) => turma.ciclo || "Sem ciclo").filter(Boolean)));
    return ciclos.sort((a, b) => rotuloCiclo(a).localeCompare(rotuloCiclo(b), "pt-BR", { numeric: true }));
  }, [turmas]);

  useEffect(() => {
    invoke<ConfiguracoesApp>("carregar_configuracoes")
      .then(setConfig)
      .catch((err) => setErro(String(err)));
    invoke<AppInfo>("app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
  }, []);

  useEffect(() => {
    setCiclosBackup((atuais) => {
      if (atuais.includes("todos")) return atuais;
      const validos = atuais.filter((ciclo) => ciclosExistentes.includes(ciclo));
      return validos.length ? validos : ["todos"];
    });
  }, [ciclosExistentes]);

  async function salvar() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const salvo = await invoke<ConfiguracoesApp>("salvar_configuracoes", { input: config });
      setConfig(salvo);
      setMensagem("Configurações salvas.");
      onDadosAlterados();
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function enviarCabecalhoAta(arquivo: File | null) {
    if (!arquivo) return;
    const nome = arquivo.name.toLowerCase();
    if (!nome.endsWith(".jpg") && !nome.endsWith(".jpeg") && !nome.endsWith(".png")) {
      setErro("Selecione uma imagem JPG, JPEG ou PNG.");
      return;
    }
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const bytes = Array.from(new Uint8Array(await arquivo.arrayBuffer()));
      const salvo = await invoke<ConfiguracoesApp>("salvar_cabecalho_ata", {
        input: { nome: arquivo.name, bytes },
      });
      setConfig(salvo);
      setMensagem("Imagem de cabeçalho da ata atualizada.");
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function exportarBackup() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const ciclos = ciclosBackup.includes("todos") ? [] : ciclosBackup;
      const resultado = await invoke<BackupResultado>("exportar_backup_seletivo", { input: { ciclos } });
      setUltimoBackup(resultado.caminho);
      setMensagem(`Backup gerado com ${resultado.arquivos} arquivos em: ${resultado.caminho}`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  function alternarCicloBackup(ciclo: string) {
    setCiclosBackup((atuais) => {
      if (ciclo === "todos") return ["todos"];
      const base = atuais.filter((item) => item !== "todos");
      const proximo = base.includes(ciclo) ? base.filter((item) => item !== ciclo) : [...base, ciclo];
      return proximo.length ? proximo : ["todos"];
    });
  }

  function abrirUltimoBackup() {
    if (!ultimoBackup) return;
    invoke("abrir_pasta", { caminho: ultimoBackup }).catch((err) => setErro(String(err)));
  }

  async function importarBackup(arquivo: File | null, modo: "mesclar" | "substituir") {
    if (!arquivo) return;
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const bytes = Array.from(new Uint8Array(await arquivo.arrayBuffer()));
      const resultado = await invoke<BackupResultado>("importar_backup", {
        input: { nome: arquivo.name, bytes, modo },
      });
      if (modo === "substituir") {
        setMensagem(`Backup restaurado. Backup de segurança: ${resultado.backup_seguranca ?? "não gerado"}.`);
      } else {
        setMensagem(`Backup importado: ${resultado.arquivos_importados} arquivos adicionados, ${resultado.conflitos.length} conflitos ignorados.`);
      }
      onDadosAlterados();
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function verificarAtualizacao() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const update = await check();
      setAtualizacao(update);
      setMensagem(update ? `Nova versão disponível: ${update.version}.` : "Você já está usando a versão mais recente.");
    } catch (err) {
      setErro(`Não foi possível verificar atualizações: ${String(err)}`);
    } finally {
      setProcessando(false);
    }
  }

  async function instalarAtualizacao() {
    if (!atualizacao) return;
    setProcessando(true);
    setMensagem("Baixando atualização...");
    setErro("");
    try {
      await atualizacao.downloadAndInstall();
      setMensagem("Atualização instalada. Reiniciando...");
      await relaunch();
    } catch (err) {
      setErro(`Não foi possível instalar a atualização: ${String(err)}`);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <section className="settings-page">
      <div className="page-title-row">
        <div>
          <h1>Configurações</h1>
          <p>Dados institucionais, backup e atualização do programa.</p>
        </div>
      </div>

      <section className="panel settings-grid">
        <article className="settings-card">
          <h2>Direção e critérios</h2>
          <label>
            Nome da direção
            <input value={config.direcao_nome} onChange={(event) => setConfig((atual) => ({ ...atual, direcao_nome: event.target.value }))} />
          </label>
          <label>
            Pronome
            <select value={config.direcao_pronome} onChange={(event) => setConfig((atual) => ({ ...atual, direcao_pronome: event.target.value }))}>
              <option value="F">Feminino: Diretora Sra.</option>
              <option value="M">Masculino: Diretor Sr.</option>
            </select>
          </label>
          <label>
            Média mínima
            <input type="number" min="0" max="10" step="0.1" value={config.nota_minima} onChange={(event) => setConfig((atual) => ({ ...atual, nota_minima: Number(event.target.value) }))} />
          </label>
          <div className="settings-file-group">
            <span>Cabeçalho da ata</span>
            <p>Use uma imagem JPG ou PNG com o cabeçalho oficial da escola. Ela aparecerá na ata e no relatório dos professores.</p>
            <label className="file-action">
              Enviar imagem de cabeçalho
              <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(event) => enviarCabecalhoAta(event.target.files?.[0] ?? null)} />
            </label>
            <span className="settings-version">
              {config.cabecalho_ata ? "Cabeçalho personalizado configurado." : "Usando cabeçalho padrão, se existir na pasta de dados."}
            </span>
          </div>
          <button className="primary-action" onClick={salvar} disabled={processando}>Salvar configurações</button>
        </article>

        <article className="settings-card">
          <h2>Backup</h2>
          <p>O formato antigo de backup é compatível com a modern-ui.</p>
          <div className="backup-cycle-options" aria-label="Selecionar ciclos para backup">
            <button className={ciclosBackup.includes("todos") ? "selected" : ""} onClick={() => alternarCicloBackup("todos")}>
              Tudo
            </button>
            {ciclosExistentes.map((ciclo) => (
              <button
                key={ciclo}
                className={ciclosBackup.includes(ciclo) ? "selected" : ""}
                onClick={() => alternarCicloBackup(ciclo)}
              >
                {rotuloCiclo(ciclo)}
              </button>
            ))}
          </div>
          <button onClick={exportarBackup} disabled={processando}>Gerar backup</button>
          {ultimoBackup && (
            <button className="secondary-action" onClick={abrirUltimoBackup} disabled={processando}>
              Abrir pasta do último backup
            </button>
          )}
          <label className="file-action">
            Adicionar dados de backup
            <input type="file" accept=".zip" onChange={(event) => importarBackup(event.target.files?.[0] ?? null, "mesclar")} />
          </label>
          <label className="file-action danger">
            Substituir dados pelo backup
            <input type="file" accept=".zip" onChange={(event) => {
              if (window.confirm("Esta ação substitui os dados atuais. Um backup de segurança será criado antes da restauração.")) {
                importarBackup(event.target.files?.[0] ?? null, "substituir");
              }
            }} />
          </label>
        </article>

        <article className="settings-card">
          <h2>Atualização</h2>
          <p>A verificação consulta a última versão publicada no GitHub.</p>
          <button onClick={verificarAtualizacao} disabled={processando}>Verificar atualização</button>
          <span className="settings-version">Versão atual: {appInfo?.version ? `v${appInfo.version}` : "não identificada"}</span>
          {atualizacao && (
            <button className="primary-action" onClick={instalarAtualizacao}>Atualizar e reiniciar</button>
          )}
          {atualizacao && <span className="settings-version">Disponível: {atualizacao.version}</span>}
        </article>
      </section>

      {mensagem && <div className="notice success">{mensagem}</div>}
      {erro && <div className="notice error">{erro}</div>}
    </section>
  );
}

function Placeholder({ tela }: { tela: Tela }) {
  const nomes: Record<Tela, string> = {
    dashboard: "Dashboard",
    turmas: "Turmas",
    "gestao-turma": "Gestão de Turma",
    "importar-dados": "Importar Dados",
    "importar-notas": "Importar Notas",
    "importar-elegiveis": "Importar Elegíveis",
    conselhos: "Conselhos",
    conselho: "Conselho",
    relatorios: "Relatórios",
    "relatorio-criticos": "Relatório de Alunos Críticos",
    "relatorio-alteracoes-notas": "Alterações de Notas Pós-Conselho",
    configuracoes: "Configurações",
  };

  return (
    <section className="placeholder panel">
      <ClipboardList size={36} />
      <h1>{nomes[tela]}</h1>
      <p>Esta area sera migrada depois da validacao da tela de conselho.</p>
      <div className="placeholder-actions">
        <button>
          <BarChart3 size={18} />
          Ver fluxo planejado
        </button>
      </div>
    </section>
  );
}
