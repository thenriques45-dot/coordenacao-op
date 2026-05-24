import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  Home,
  Menu,
  Moon,
  Pencil,
  Plus,
  Settings,
  Sun,
  Tag,
  TrendingUp,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import brandLogo from "./assets/logo.png";
import { invokeApp, tauriDisponivel } from "./features/appBridge";
import { CalendarioGestao } from "./features/CalendarManagement";
import { Turmas } from "./features/ClassList";
import { GestaoTurma } from "./features/ClassManagement";
import { Council, SelecaoConselho } from "./features/Council";
import { Dashboard } from "./features/Dashboard";
import { ImportarDados, ImportarElegiveis, ImportarNotas } from "./features/Imports";
import { QuadroKanban } from "./features/KanbanBoard";
import { RelatorioAlteracoesNotas, RelatorioAlunosCriticos, RelatoriosMenu } from "./features/Reports";
import { Configuracoes } from "./features/SettingsPage";
import { type NovoAlunoPayload } from "./features/studentsCsv";
import { iniciarMonitorAlertasTarefas } from "./features/taskNotifications";

type Tela = "dashboard" | "turmas" | "gestao-turma" | "importar-dados" | "importar-notas" | "importar-elegiveis" | "conselhos" | "conselho" | "kanban" | "calendario" | "relatorios" | "relatorio-criticos" | "relatorio-alteracoes-notas" | "configuracoes";

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
  nomes_alunos: string[];
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

type AppInfo = {
  name: string;
  stage: string;
  version: string;
  data_dir: string;
};

const NOVIDADES_POR_VERSAO: Record<string, string[]> = {
  "2.3.3": [
    "Tarefas do Quadro Kanban agora podem ter alertas de prazo configuráveis.",
    "É possível ativar alertas para 2 dias antes, 1 dia antes e no dia do prazo.",
    "Com o aplicativo aberto, o CoordenacaoOP verifica os prazos e envia notificações nativas do sistema.",
  ],
  "2.3.2": [
    "Correção na importação de mapões para considerar alunos com situação Encerrado como ativos.",
    "Aba de tarefas em turmas e alunos agora aparece apenas quando há tarefas vinculadas.",
    "Tabela de notas do aluno ajustada para o tema escuro.",
    "Changelog do projeto unificado em um único arquivo.",
  ],
  "2.3.1": [
    "Correção para iniciar Quadro Kanban e Calendário sem tarefas ou eventos de demonstração.",
    "Os dados do Quadro de Gestão permanecem dependentes apenas do uso local ou de backups importados.",
  ],
  "2.3.0": [
    "Novo Calendário de Gestão com eventos, recorrências e tarefas do Kanban em uma visão temporal unificada.",
    "Tarefas agora podem ser associadas a eventos, alunos e turmas, com abas próprias nas telas de aluno e turma.",
    "Quadro Kanban ganhou reordenação manual por arraste, ordenação automática por prazo e submenu dedicado na barra lateral.",
  ],
  "2.2.0": [
    "Novo Quadro de Gestão em formato Kanban, com tarefas, etiquetas, anexos e colunas personalizáveis.",
    "Tema escuro com alternância rápida pela barra lateral.",
    "Dashboard agora exibe as próximas tarefas do Kanban.",
  ],
  "2.1.7": [
    "A busca nas telas de Turmas e Conselho agora também localiza turmas pelo nome dos alunos.",
    "A busca ficou mais tolerante a acentos, permitindo encontrar João ao digitar Joao.",
  ],
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
  const [temaEscuro, setTemaEscuro] = useState(() => localStorage.getItem("coordenacaoop:tema") === "escuro");
  const [gestaoMenuAberto, setGestaoMenuAberto] = useState(() => localStorage.getItem("coordenacaoop:menu-gestao") !== "fechado");
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
    localStorage.setItem("coordenacaoop:tema", temaEscuro ? "escuro" : "claro");
  }, [temaEscuro]);

  useEffect(() => {
    localStorage.setItem("coordenacaoop:menu-gestao", gestaoMenuAberto ? "aberto" : "fechado");
  }, [gestaoMenuAberto]);

  useEffect(() => {
    if (!tauriDisponivel) return;
    return iniciarMonitorAlertasTarefas();
  }, []);

  useEffect(() => {
    if (!tauriDisponivel) return;
    check()
      .then((update) => {
        if (update) {
          setAtualizacao(update);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    invokeApp<AppInfo>("app_info")
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
      if (tauriDisponivel) {
        await relaunch();
      }
    } catch (err) {
      setStatusAtualizacao(`Não foi possível atualizar automaticamente: ${String(err)}`);
    }
  }

  useEffect(() => {
    invokeApp<TurmaResumo[]>("listar_turmas")
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
    invokeApp<TurmaDetalhe>("carregar_turma", {
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

    return invokeApp<TurmaDetalhe>("salvar_ajustes_media", {
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

    return invokeApp<TurmaDetalhe>("salvar_encaminhamentos", {
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
    return invokeApp<TurmaDetalhe>("salvar_coordenador_turma", {
      caminho: turmaSelecionada.caminho,
      input: { coordenador },
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
      setTurmaSelecionada((atual) => atual ? { ...atual, coordenador_turma: detalheAtualizado.coordenador_turma } : atual);
      return invokeApp<TurmaResumo[]>("listar_turmas")
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
    return invokeApp<TurmaDetalhe>("salvar_elegibilidade_aluno", {
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
    return invokeApp<TurmaDetalhe>("salvar_lideranca_aluno", {
      caminho: turmaSelecionada.caminho,
      matricula,
      input: { lideranca },
      bimestre: turmaDetalhe.bimestre,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
      return invokeApp<TurmaResumo[]>("listar_turmas")
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
    return invokeApp<TurmaDetalhe>("salvar_educacao_especial_aluno", {
      caminho: turmaSelecionada.caminho,
      matricula,
      input: { deficiencias, comentario },
      bimestre: turmaDetalhe.bimestre,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
      return invokeApp<TurmaResumo[]>("listar_turmas")
        .then(setTurmas)
        .catch(() => {});
    });
  }

  function criarTurma(payload: NovaTurmaPayload) {
    return invokeApp<TurmaResumo>("criar_turma", { input: payload }).then((novaTurma) => {
      setTurmas((atuais) => [...atuais, novaTurma].sort((a, b) => (a.ano - b.ano) || a.codigo.localeCompare(b.codigo, "pt-BR")));
    });
  }

  function editarTurma(turma: TurmaResumo, payload: NovaTurmaPayload) {
    return invokeApp<TurmaResumo>("editar_turma", { caminho: turma.caminho, input: payload }).then((turmaAtualizada) => {
      setTurmas((atuais) => atuais
        .map((item) => item.caminho === turma.caminho ? turmaAtualizada : item)
        .sort((a, b) => (a.ano - b.ano) || a.codigo.localeCompare(b.codigo, "pt-BR")));
      setTurmaSelecionada((atual) => atual?.caminho === turma.caminho ? turmaAtualizada : atual);
    });
  }

  function excluirTurma(turma: TurmaResumo) {
    return invokeApp<void>("excluir_turma", { caminho: turma.caminho }).then(() => {
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
      invokeApp("definir_fullscreen", { ativo: false }).catch(() => {});
    }
  }

  return (
    <main className={`app-shell ${temaEscuro ? "theme-dark" : "theme-light"} ${modoReuniao ? "meeting-mode-shell" : ""}`}>
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
          <div className={`nav-group ${gestaoMenuAberto ? "open" : ""}`}>
            <button
              className={`nav-item nav-group-toggle ${tela === "kanban" || tela === "calendario" ? "active" : ""}`}
              type="button"
              onClick={() => setGestaoMenuAberto((atual) => !atual)}
            >
              <ClipboardList size={18} />
              <span>Quadro de Gestão</span>
              {gestaoMenuAberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {gestaoMenuAberto && (
              <div className="nav-submenu">
                <NavButton icon={<ClipboardList size={17} />} label="Quadro Kanban" active={tela === "kanban"} onClick={() => navegarPara("kanban")} />
                <NavButton icon={<CalendarDays size={17} />} label="Calendário" active={tela === "calendario"} onClick={() => navegarPara("calendario")} />
              </div>
            )}
          </div>
          <NavButton icon={<FileText size={18} />} label="Relatórios" active={tela === "relatorios" || tela === "relatorio-criticos" || tela === "relatorio-alteracoes-notas"} onClick={() => navegarPara("relatorios")} />
          <NavButton icon={<Settings size={18} />} label="Configurações" active={tela === "configuracoes"} onClick={() => navegarPara("configuracoes")} />
        </nav>

        <div className="profile-box">
          <span>CP</span>
          <div>
            <strong>Coordenacao</strong>
            <small>Equipe pedagogica</small>
          </div>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTemaEscuro((atual) => !atual)}
            aria-label={temaEscuro ? "Ativar tema claro" : "Ativar tema escuro"}
            title={temaEscuro ? "Tema claro" : "Tema escuro"}
          >
            {temaEscuro ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </aside>

      <section className="workspace">
        {tela === "dashboard" && (
          <Dashboard
            turmas={turmas}
            erroTurmas={erroTurmas}
            onOpenCouncil={() => navegarPara("conselhos")}
            onOpenTurmas={() => navegarPara("turmas")}
            onOpenKanban={() => navegarPara("kanban")}
            onOpenCalendario={() => navegarPara("calendario")}
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
            onOpenKanban={() => navegarPara("kanban")}
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
            onSubstituirCsvTurma={(turma, alunos) => {
              const turmaCompleta = turmas.find((item) => item.caminho === turma.caminho);
              if (!turmaCompleta) {
                return Promise.reject(new Error("Turma não encontrada para atualizar o CSV."));
              }
              return editarTurma(turmaCompleta, {
                codigo: turmaCompleta.codigo,
                ano: turmaCompleta.ano,
                serie: turmaCompleta.serie ?? turmaCompleta.ciclo ?? turmaCompleta.codigo,
                sala: turmaCompleta.sala ?? "",
                periodo: turmaCompleta.periodo ?? PERIODOS_TURMA[0],
                ciclo: turmaCompleta.ciclo ?? "EM",
                alunos,
                substituir_alunos: true,
              });
            }}
          />
        )}
        {tela === "importar-elegiveis" && (
          <ImportarElegiveis onImportado={() => {
            invokeApp<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
            if (turmaSelecionada) {
              invokeApp<TurmaDetalhe>("carregar_turma", {
                caminho: turmaSelecionada.caminho,
                bimestre: bimestreSelecionado,
              }).then(setTurmaDetalhe).catch(() => {});
            }
          }} />
        )}
        {tela === "kanban" && <QuadroKanban />}
        {tela === "calendario" && <CalendarioGestao turmas={turmas} onOpenKanban={() => navegarPara("kanban")} />}
        {tela === "configuracoes" && <Configuracoes turmas={turmas} onDadosAlterados={() => {
          invokeApp<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
        }} />}
        {tela === "relatorios" && (
          <RelatoriosMenu
            onAbrirCriticos={() => navegarPara("relatorio-criticos")}
            onAbrirAlteracoesNotas={() => navegarPara("relatorio-alteracoes-notas")}
          />
        )}
        {tela === "relatorio-criticos" && <RelatorioAlunosCriticos turmas={turmas} onVoltar={() => navegarPara("relatorios")} />}
        {tela === "relatorio-alteracoes-notas" && <RelatorioAlteracoesNotas turmas={turmas} onVoltar={() => navegarPara("relatorios")} />}
        {tela !== "dashboard" && tela !== "conselhos" && tela !== "conselho" && tela !== "turmas" && tela !== "gestao-turma" && tela !== "importar-dados" && tela !== "importar-notas" && tela !== "importar-elegiveis" && tela !== "kanban" && tela !== "calendario" && tela !== "configuracoes" && tela !== "relatorios" && tela !== "relatorio-criticos" && tela !== "relatorio-alteracoes-notas" && <Placeholder tela={tela} />}
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
    kanban: "Quadro de Gestão",
    calendario: "Calendário",
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
