import {
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

type Tela = "dashboard" | "turmas" | "gestao-turma" | "importar-notas" | "conselhos" | "conselho" | "relatorios" | "configuracoes";

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
  situacao: "adequada" | "abaixo" | "cuidado" | "sem-nota" | "ajustada";
};

type Aluno = {
  matricula?: string;
  chamada: number;
  nome: string;
  elegivel: boolean;
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
};

type BackupResultado = {
  caminho: string | null;
  arquivos: number;
  arquivos_importados: number;
  conflitos: string[];
  backup_seguranca: string | null;
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
  duplicados: number;
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

type AppInfo = {
  name: string;
  stage: string;
  version: string;
  data_dir: string;
};

const alunosDemo: Aluno[] = [
  {
    matricula: "demo-1",
    chamada: 7,
    nome: "ANA CLARA MARTINS DOS SANTOS",
    elegivel: true,
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
  const alunosConselho = useMemo(() => {
    if (!turmaDetalhe?.alunos.length) {
      return alunosDemo;
    }

    return turmaDetalhe.alunos.map((aluno) => ({
      matricula: aluno.matricula,
      chamada: aluno.numero_chamada ?? 0,
      nome: aluno.nome,
      elegivel: aluno.elegivel,
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
        situacao: disciplina.situacao,
      })),
    }));
  }, [turmaDetalhe]);
  const aluno = alunosConselho[Math.min(indiceAluno, alunosConselho.length - 1)] ?? alunosDemo[0];

  useEffect(() => {
    check()
      .then((update) => {
        if (update) {
          setAtualizacao(update);
        }
      })
      .catch(() => {});
  }, []);

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
          <NavButton icon={<Upload size={18} />} label="Importar Notas" active={tela === "importar-notas"} onClick={() => navegarPara("importar-notas")} />
          <NavButton icon={<BookOpen size={18} />} label="Conselho" active={tela === "conselhos" || tela === "conselho"} onClick={() => navegarPara("conselhos")} />
          <NavButton icon={<FileText size={18} />} label="Relatorios" active={tela === "relatorios"} onClick={() => navegarPara("relatorios")} />
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
        {tela === "configuracoes" && <Configuracoes onDadosAlterados={() => {
          invoke<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
        }} />}
        {tela !== "dashboard" && tela !== "conselhos" && tela !== "conselho" && tela !== "turmas" && tela !== "gestao-turma" && tela !== "importar-notas" && tela !== "configuracoes" && <Placeholder tela={tela} />}
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
  const [valorEdicao, setValorEdicao] = useState("");
  const [erroEdicao, setErroEdicao] = useState("");
  const [salvandoDisciplina, setSalvandoDisciplina] = useState<string | null>(null);
  const [erroEncaminhamento, setErroEncaminhamento] = useState("");
  const [salvandoEncaminhamento, setSalvandoEncaminhamento] = useState<number | null>(null);
  const [documentoAbrindo, setDocumentoAbrindo] = useState<"ata" | "relatorio" | null>(null);
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

  function abrirDocumentoConselho(tipo: "ata" | "relatorio") {
    if (!turmaSelecionada || !turmaDetalhe) {
      setMensagemDocumento("Selecione uma turma e um bimestre antes de abrir o documento.");
      return;
    }

    const comando = tipo === "ata" ? "abrir_ata" : "abrir_relatorio_professores";
    setMensagemDocumento("");
    setDocumentoAbrindo(tipo);
    invoke<string>(comando, {
      caminho: turmaSelecionada.caminho,
      bimestre: turmaDetalhe.bimestre,
    })
      .then(() => setMensagemDocumento(tipo === "ata" ? "Ata aberta." : "Relatório dos professores aberto."))
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
                onClick={() => abrirDocumentoConselho("ata")}
                disabled={documentoAbrindo !== null || !turmaSelecionada || !turmaDetalhe}
              >
                <FileText size={18} />
                {documentoAbrindo === "ata" ? "Abrindo..." : "Abrir ata"}
              </button>
              <button
                onClick={() => abrirDocumentoConselho("relatorio")}
                disabled={documentoAbrindo !== null || !turmaSelecionada || !turmaDetalhe}
              >
                <ClipboardList size={18} />
                {documentoAbrindo === "relatorio" ? "Abrindo..." : "Abrir relatório"}
              </button>
            </>
          )}
        </div>
      </header>

      {mensagemDocumento && !modoReuniao && (
        <div className="data-warning neutral">{mensagemDocumento}</div>
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
                  {aluno.disciplinas.map((disciplina) => (
                    <tr key={disciplina.nome}>
                      <td>{disciplina.nome}</td>
                      <td>{formatarNota(disciplina.mediaOriginal)}</td>
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
                  ))}
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
            className={`turma-card conselho-card ${turma.conselho_finalizado ? "conselho-finalizado" : ""}`}
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
                Coordenador de sala: <strong>A definir</strong>
              </span>
              <span>
                Elegíveis: <strong>{turma.alunos_elegiveis}</strong>
              </span>
              <span className={`council-state ${turma.conselho_finalizado ? "done" : "pending"}`}>
                {turma.conselho_finalizado ? "Ata e relatório gerados" : "Conselho não finalizado"}
              </span>
            </div>

            <button className="details-action" onClick={() => onSelecionar(turma)}>
              {turma.conselho_finalizado ? "Abrir conselho" : "Iniciar conselho"}
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

function codigoTurma(serie: string, letra: string) {
  return `${serie} ${letra.trim().toLocaleUpperCase("pt-BR") || "A"}`.trim();
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
}: {
  turma: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  alunos: Aluno[];
  onVoltar: () => void;
  onSalvarCoordenador: (coordenador: string) => Promise<void>;
  onSalvarElegibilidade: (matricula: string, elegivel: boolean) => Promise<void>;
}) {
  const [aba, setAba] = useState<"alunos" | "estatisticas">("alunos");
  const [busca, setBusca] = useState("");
  const [editandoCoordenador, setEditandoCoordenador] = useState(false);
  const [coordenador, setCoordenador] = useState(turma?.coordenador_turma ?? "");
  const [salvandoElegivel, setSalvandoElegivel] = useState<string | null>(null);
  const [alunoAberto, setAlunoAberto] = useState<Aluno | null>(null);

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
              <thead><tr><th>Nome</th><th>RA</th><th>Média</th><th>Frequência</th><th>Situação</th><th>Elegível</th></tr></thead>
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
}: {
  aluno: Aluno;
  bimestre: string;
  onVoltar: () => void;
}) {
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
        <button className="active">Desempenho</button>
      </div>

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
                    {[1, 2, 3, 4].map((indice) => <td key={indice}>{indice === bimestreAtual ? formatarNota(nota) : "-"}</td>)}
                    <td>{formatarNota(disciplina.quintoConceito)}</td>
                    <td className={nota !== null && nota >= 5 ? "success-text" : "danger-text"}>{formatarNota(nota)}</td>
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
    </section>
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
    if (!arquivoCsv || !arquivoPrevia.turma_caminho) return;
    const turma = turmas.find((item) => item.caminho === arquivoPrevia.turma_caminho);
    if (!turma) {
      setErro("Não encontrei a turma provável para atualizar o CSV.");
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
              <span>Alunos não encontrados não serão importados. Use “Limpar e subir CSV” quando a turma provável estiver correta, ou revise o CSV da turma.</span>
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
                        {arquivo.turma_caminho && arquivo.alunos_lidos > 0 && arquivo.correspondencias < arquivo.alunos_lidos ? (
                          <label className="mini-file-action">
                            Limpar e subir CSV
                            <input type="file" accept=".csv,text/csv" onChange={(event) => substituirCsvDaTurma(arquivo, event.target.files?.[0])} />
                          </label>
                        ) : "-"}
                      </td>
                    </tr>
                    {arquivo.erro && (
                      <tr className="import-error-row">
                        <td colSpan={9}>{arquivo.erro}</td>
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
  const [serieFiltro, setSerieFiltro] = useState("todas");
  const [criando, setCriando] = useState(false);
  const [turmaEditando, setTurmaEditando] = useState<TurmaResumo | null>(null);
  const [turmaExcluindo, setTurmaExcluindo] = useState<TurmaResumo | null>(null);
  const [ciclo, setCiclo] = useState("EM");
  const [serie, setSerie] = useState(CICLOS_TURMA.EM[0]);
  const [letra, setLetra] = useState("A");
  const [sala, setSala] = useState("");
  const [periodo, setPeriodo] = useState(PERIODOS_TURMA[0]);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [arquivoNome, setArquivoNome] = useState("");
  const [alunosCsv, setAlunosCsv] = useState<NovoAlunoPayload[]>([]);
  const [substituirLista, setSubstituirLista] = useState(false);
  const [erroCriacao, setErroCriacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const seriesDisponiveis = useMemo(() => {
    const seriesCadastradas = turmas.map((turma) => rotuloSerie(turma.serie) || turma.ciclo || "Sem série");
    const seriesConfiguradas = Object.values(CICLOS_TURMA).flat().map(rotuloSerie);
    const series = Array.from(new Set([...seriesConfiguradas, ...seriesCadastradas].filter(Boolean)));
    return series.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [turmas]);
  const turmasFiltradas = useMemo(() => {
    const filtradasPorBusca = filtrarTurmas(turmas, busca);
    if (serieFiltro === "todas") return filtradasPorBusca;
    return filtradasPorBusca.filter((turma) => (rotuloSerie(turma.serie) || turma.ciclo || "Sem série") === serieFiltro);
  }, [busca, serieFiltro, turmas]);
  const codigoPreview = codigoTurma(serie, letra);

  function limparFormulario() {
    setCiclo("EM");
    setSerie(CICLOS_TURMA.EM[0]);
    setLetra("A");
    setSala("");
    setPeriodo(PERIODOS_TURMA[0]);
    setAno(String(new Date().getFullYear()));
    setArquivoNome("");
    setAlunosCsv([]);
    setSubstituirLista(false);
    setErroCriacao("");
    setTurmaEditando(null);
  }

  function abrirCriacao() {
    if (criando && !turmaEditando) {
      setCriando(false);
      return;
    }
    limparFormulario();
    setCriando(true);
  }

  function abrirEdicao(turma: TurmaResumo) {
    const cicloAtual = turma.ciclo && CICLOS_TURMA[turma.ciclo] ? turma.ciclo : "EM";
    const series = CICLOS_TURMA[cicloAtual] ?? CICLOS_TURMA.EM;
    setCiclo(cicloAtual);
    setSerie(turma.serie ? (series.find((item) => mesmaSerie(item, turma.serie ?? "")) ?? series[0]) : series[0]);
    setLetra(letraTurma(turma));
    setSala(turma.sala ?? "");
    setPeriodo(turma.periodo && PERIODOS_TURMA.includes(turma.periodo) ? turma.periodo : PERIODOS_TURMA[0]);
    setAno(String(turma.ano));
    setArquivoNome("");
    setAlunosCsv([]);
    setErroCriacao("");
    setTurmaEditando(turma);
    setCriando(true);
  }

  function alterarCiclo(valor: string) {
    setCiclo(valor);
    const series = CICLOS_TURMA[valor] ?? CICLOS_TURMA.EM;
    setSerie(series[0]);
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

  function criar() {
    const anoNumero = Number.parseInt(ano, 10);
    if (!Number.isFinite(anoNumero)) {
      setErroCriacao("Ano letivo invalido.");
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
        <button className="primary-action" onClick={abrirCriacao}>
          <Plus size={18} />
          Nova turma
        </button>
      </header>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      {criando && (
        <section className="panel create-class-panel">
          <div className="create-class-heading">
            <div>
              <h2>{turmaEditando ? "Editar turma" : "Criar nova turma"}</h2>
              <p>{turmaEditando ? "Atualize os dados cadastrais da turma ou envie um CSV novo para atualizar alunos." : "Informe os dados da turma e selecione o CSV de alunos."}</p>
            </div>
            <span>Codigo: <strong>{codigoPreview}</strong></span>
          </div>

          <div className="create-class-grid">
            <label>Ciclo
              <select value={ciclo} onChange={(event) => alterarCiclo(event.target.value)}>
                {Object.keys(CICLOS_TURMA).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Série
              <select value={serie} onChange={(event) => setSerie(event.target.value)}>
                {(CICLOS_TURMA[ciclo] ?? CICLOS_TURMA.EM).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Turma
              <input value={letra} onChange={(event) => setLetra(event.target.value.toLocaleUpperCase("pt-BR").slice(0, 3))} />
            </label>
            <label>Número da sala
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
              {turmaEditando ? "Atualizar CSV" : "Selecionar CSV"}
              <input type="file" accept=".csv,text/csv" onChange={(event) => selecionarCsv(event.target.files?.[0])} />
            </label>
            <span>
              {arquivoNome
                ? `${arquivoNome} - ${alunosCsv.length} alunos encontrados`
                : turmaEditando
                  ? "Opcional: preserva dados existentes, adiciona novos e inativa ausentes"
                  : "Nenhum CSV selecionado"}
            </span>
          </div>

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
              {salvando ? "Salvando..." : turmaEditando ? "Salvar alterações" : "Criar turma"}
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
          Série
          <select value={serieFiltro} onChange={(event) => setSerieFiltro(event.target.value)}>
            <option value="todas">Todas as séries</option>
            {seriesDisponiveis.map((serieItem) => (
              <option key={serieItem} value={serieItem}>{serieItem}</option>
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
                Coordenador de sala: <strong>A definir</strong>
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

function Configuracoes({ onDadosAlterados }: { onDadosAlterados: () => void }) {
  const [config, setConfig] = useState<ConfiguracoesApp>({
    direcao_nome: "",
    direcao_pronome: "F",
    nota_minima: 5,
  });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);
  const [atualizacao, setAtualizacao] = useState<Update | null>(null);

  useEffect(() => {
    invoke<ConfiguracoesApp>("carregar_configuracoes")
      .then(setConfig)
      .catch((err) => setErro(String(err)));
    invoke<AppInfo>("app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
  }, []);

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

  async function exportarBackup() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const resultado = await invoke<BackupResultado>("exportar_backup");
      setMensagem(`Backup gerado com ${resultado.arquivos} arquivos em: ${resultado.caminho}`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
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
          <button className="primary-action" onClick={salvar} disabled={processando}>Salvar configurações</button>
        </article>

        <article className="settings-card">
          <h2>Backup</h2>
          <p>O formato antigo de backup é compatível com a modern-ui.</p>
          <button onClick={exportarBackup} disabled={processando}>Gerar backup</button>
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
    "importar-notas": "Importar Notas",
    conselhos: "Conselhos",
    conselho: "Conselho",
    relatorios: "Relatorios",
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
