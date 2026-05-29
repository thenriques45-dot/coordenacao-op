import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cloud,
  FileText,
  Filter,
  FolderOpen,
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
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import brandLogo from "./assets/logo.png";
import { invokeApp, tauriDisponivel } from "./features/appBridge";
import { CalendarioGestao } from "./features/CalendarManagement";
import { Turmas } from "./features/ClassList";
import { GestaoTurma } from "./features/ClassManagement";
import { Council, SelecaoConselho } from "./features/Council";
import { Dashboard } from "./features/Dashboard";
import { ImportarDados, ImportarDiagnostico, ImportarElegiveis, ImportarNotas } from "./features/Imports";
import { QuadroKanban } from "./features/KanbanBoard";
import { RelatorioAlteracoesNotas, RelatorioAlunosCriticos, RelatoriosMenu } from "./features/Reports";
import { TelaPEI } from "./features/PEI";
import { Configuracoes } from "./features/SettingsPage";
import { type NovoAlunoPayload } from "./features/studentsCsv";
import { iniciarMonitorAlertasTarefas } from "./features/taskNotifications";
import {
  aplicarPayloadSincronizacao,
  carregarPerfilSincronizacao,
  iniciaisPerfil,
  montarPayloadSincronizacao,
  salvarPerfilSincronizacao,
  type WorkgroupSyncPayload,
  type WorkgroupSyncProfile,
} from "./features/workgroupSync";

type Tela = "dashboard" | "turmas" | "gestao-turma" | "importar-dados" | "importar-notas" | "importar-elegiveis" | "importar-diagnostico" | "conselhos" | "conselho" | "kanban" | "calendario" | "relatorios" | "relatorio-criticos" | "relatorio-alteracoes-notas" | "pei" | "configuracoes";

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
  diagnosticoAprendizagem?: DiagnosticoAprendizagemApi | null;
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
  diagnostico_aprendizagem: DiagnosticoAprendizagemApi | null;
  disciplinas: DisciplinaApi[];
};

type DiagnosticoAprendizagemApi = {
  turma_origem: string | null;
  portugues: DiagnosticoComponenteApi;
  matematica: DiagnosticoComponenteApi;
  atualizado_em: string | null;
};

type DiagnosticoComponenteApi = {
  aprendizagem_equivalente: string | null;
  status: string | null;
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

type SyncStateResultado = {
  caminho: string;
  atualizado_em: string;
};

type SyncInstitutionalResultado = {
  caminho: string | null;
  arquivos: number;
  atualizado_em: string;
  backup_seguranca: string | null;
};

const NOVIDADES_POR_VERSAO: Record<string, string[]> = {
  "2.6.0": [
    "Nova tela PEI na Central de Relatórios para acompanhar os Planos Educacionais Individualizados enviados pelos professores.",
    "Os documentos PEI são gerados automaticamente ao abrir a tela, organizados por aluno e disciplina.",
    "Indicador de entrega por aluno: verde quando todos os PEIs do bimestre atual estão completos, amarelo quando parcial e vermelho quando nenhum foi recebido.",
    "Clique no ícone de folha para abrir o DOCX de cada PEI diretamente.",
    "URL da planilha de respostas sincronizada entre dispositivos junto com os dados institucionais.",
  ],
  "2.5.0": [
    "Tarefas com prazo vencido voltam a aparecer no dashboard, facilitando o acompanhamento de pendências em atraso.",
    "Salvamento de dados de turma, conselho e importações agora usa escrita segura: em caso de queda de energia, o arquivo anterior é preservado.",
    "Sincronização institucional corrigida para não apagar os dados locais se a operação for interrompida.",
    "Sincronização de grupo de trabalho corrigida: coordenadores sem data de cadastro passam a ser atualizados normalmente.",
    "Alertas de prazo do Kanban não marcam mais como disparados alertas que ainda não foram enviados.",
  ],
  "2.4.5": [
    "Fotos de perfil dos coordenadores agora são sincronizadas entre os membros do grupo de trabalho.",
    "Cards do Kanban passam a exibir o avatar do responsável mesmo quando a tarefa veio de outro coordenador.",
  ],
  "2.4.4": [
    "Assistente Pedagógico simplificado com foco em Gemini, prompt manual e Ollama local.",
    "Configurações do Gemini ganharam atalho para gerar chave no Google AI Studio.",
    "Modo manual agora abre uma janela com instruções para usar o prompt no Copilot, ChatGPT ou outra IA.",
    "Abertura de links externos foi corrigida no Linux e no aplicativo desktop.",
  ],
  "2.4.3": [
    "Janelas de criação e edição de tarefas do Kanban foram reorganizadas em abas, com rolagem interna e ações sempre visíveis.",
    "Criação e edição de eventos do calendário agora seguem o mesmo padrão em abas para evitar formulários longos.",
    "Criação de tarefas associadas a eventos também ficou mais compacta e organizada.",
  ],
  "2.4.2": [
    "Novo Assistente Pedagógico com IA local para gerar rascunhos de relatórios individuais dos alunos.",
    "Configurações foram reorganizadas em seções para facilitar perfil, sincronização, backup, atualização e IA.",
    "Configuração guiada do Ollama local agora diagnostica instalação, servidor e modelo recomendado.",
    "Tags do Diagnóstico SARESP aparecem apenas em Português e Matemática, com cores alinhadas ao padrão do app.",
  ],
  "2.4.1": [
    "Importador Diagnóstico SARESP agora aceita múltiplas planilhas e mostra prévia por arquivo.",
    "Tela do aluno exibe tags SARESP em Português e Matemática com nível e equivalência de ano.",
    "Tarefas do Kanban só entram na sincronização quando marcadas para compartilhar com o grupo.",
  ],
  "2.4.0": [
    "Sincronização de grupo de trabalho com perfil de coordenador, foto e pasta compartilhada.",
    "Kanban e calendário agora sincronizam tarefas, eventos, colunas, anexos e exclusões entre instalações.",
    "Turmas, alunos, elegíveis e demais status institucionais podem ser sincronizados com backup automático de segurança.",
    "Eventos do calendário aceitam múltiplos vínculos com turmas e alunos, usando autocomplete aproximado.",
  ],
  "2.3.6": [
    "O alerta de alta prioridade do Kanban agora ignora tarefas em Concluído.",
    "Ícones do aplicativo no Linux foram ajustados para melhorar a integração com GNOME/Dash to Dock.",
  ],
  "2.3.5": [
    "Tarefas concluídas continuam no histórico do Kanban, mas deixam de aparecer como pendências.",
    "Dashboard, calendário e listas de tarefas vinculadas agora ocultam atividades em Concluído.",
  ],
  "2.3.4": [
    "Autocomplete de etiquetas e vínculos do Kanban agora usa busca aproximada.",
    "Tarefas podem ser vinculadas a múltiplas turmas, alunos ou eventos.",
    "Anexos do Kanban agora preservam documentos editáveis como link para o arquivo original.",
    "Alertas de prazo são verificados logo após criar ou editar tarefas.",
  ],
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
  const [perfilSync, setPerfilSync] = useState<WorkgroupSyncProfile>(() => carregarPerfilSincronizacao());
  const [mostrarAssistenteSync, setMostrarAssistenteSync] = useState(() => carregarPerfilSincronizacao().onboarding === "pending");
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
      diagnosticoAprendizagem: aluno.diagnostico_aprendizagem,
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

  useEffect(() => {
    if (!tauriDisponivel || !perfilSync.syncEnabled || !perfilSync.syncFolder) return;
    let cancelado = false;
    let sincronizando = false;
    let ciclos = 0;

    async function sincronizarAutomaticamente() {
      if (sincronizando || cancelado) return;
      sincronizando = true;
      try {
        const remoto = await invokeApp<WorkgroupSyncPayload | null>("carregar_estado_sincronizacao", { pasta: perfilSync.syncFolder });
        const recebeu = Boolean(remoto);
        if (remoto) {
          aplicarPayloadSincronizacao(remoto);
        }
        const payload = montarPayloadSincronizacao(perfilSync);
        const resultado = await invokeApp<SyncStateResultado>("publicar_estado_sincronizacao", {
          input: {
            pasta: perfilSync.syncFolder,
            device_id: perfilSync.userId,
            payload,
          },
        });
        if (!cancelado) {
          setPerfilSync((atual) => salvarPerfilSincronizacao({
            ...atual,
            lastPublishedAt: resultado.atualizado_em,
            lastPulledAt: recebeu ? new Date().toISOString() : atual.lastPulledAt,
          }));
        }
        const sincronizarDadosInstitucionais = ciclos === 0 || ciclos % 20 === 0;
        if (sincronizarDadosInstitucionais) {
          const dadosInstitucionais = await invokeApp<SyncInstitutionalResultado>("carregar_dados_institucionais_sincronizacao", {
            pasta: perfilSync.syncFolder,
          });
          const recebeuDadosInstitucionais = Boolean(dadosInstitucionais.caminho);
          if (recebeuDadosInstitucionais && !cancelado) {
            invokeApp<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
          }
          const publicacaoDados = await invokeApp<SyncInstitutionalResultado>("publicar_dados_institucionais_sincronizacao", {
            input: {
              pasta: perfilSync.syncFolder,
              device_id: perfilSync.userId,
            },
          });
          if (!cancelado) {
            setPerfilSync((atual) => salvarPerfilSincronizacao({
              ...atual,
              lastInstitutionalPublishedAt: publicacaoDados.atualizado_em,
              lastInstitutionalPulledAt: recebeuDadosInstitucionais
                ? dadosInstitucionais.atualizado_em || new Date().toISOString()
                : atual.lastInstitutionalPulledAt,
            }));
          }
        }
      } catch {
        // A sincronização automática é silenciosa; a tela de Configurações mantém os controles manuais.
      } finally {
        ciclos += 1;
        sincronizando = false;
      }
    }

    const inicial = window.setTimeout(sincronizarAutomaticamente, 5000);
    const intervalo = window.setInterval(sincronizarAutomaticamente, 45000);
    return () => {
      cancelado = true;
      window.clearTimeout(inicial);
      window.clearInterval(intervalo);
    };
  }, [
    perfilSync.syncEnabled,
    perfilSync.syncFolder,
    perfilSync.userId,
    perfilSync.displayName,
    perfilSync.role,
    perfilSync.deviceName,
    perfilSync.avatarDataUrl,
  ]);

  function fecharNovidades() {
    if (appInfo?.version) {
      localStorage.setItem(`coordenacaoop:novidades-lidas:${appInfo.version}`, "sim");
    }
    setMostrarNovidades(false);
  }

  function atualizarPerfilSync(perfil: WorkgroupSyncProfile) {
    setPerfilSync(salvarPerfilSincronizacao(perfil));
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
          <NavButton icon={<Upload size={18} />} label="Importar Dados" active={tela === "importar-dados" || tela === "importar-notas" || tela === "importar-elegiveis" || tela === "importar-diagnostico"} onClick={() => navegarPara("importar-dados")} />
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
          <NavButton icon={<FileText size={18} />} label="Relatórios" active={tela === "relatorios" || tela === "relatorio-criticos" || tela === "relatorio-alteracoes-notas" || tela === "pei"} onClick={() => navegarPara("relatorios")} />
          <NavButton icon={<Settings size={18} />} label="Configurações" active={tela === "configuracoes"} onClick={() => navegarPara("configuracoes")} />
        </nav>

        <div className="profile-box">
          {perfilSync.avatarDataUrl ? (
            <img className="profile-avatar" src={perfilSync.avatarDataUrl} alt="" />
          ) : (
            <span>{iniciaisPerfil(perfilSync.displayName)}</span>
          )}
          <div>
            <strong>{perfilSync.displayName || "Coordenacao"}</strong>
            <small>{perfilSync.syncEnabled ? "Sincronização ativa" : perfilSync.role || "Equipe pedagogica"}</small>
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
            onImportarDiagnostico={() => navegarPara("importar-diagnostico")}
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
        {tela === "importar-diagnostico" && (
          <ImportarDiagnostico onImportado={() => {
            invokeApp<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
            if (turmaSelecionada) {
              invokeApp<TurmaDetalhe>("carregar_turma", {
                caminho: turmaSelecionada.caminho,
                bimestre: bimestreSelecionado,
              }).then(setTurmaDetalhe).catch(() => {});
            }
          }} />
        )}
        {tela === "kanban" && <QuadroKanban turmas={turmas} perfil={perfilSync} />}
        {tela === "calendario" && <CalendarioGestao turmas={turmas} onOpenKanban={() => navegarPara("kanban")} />}
        {tela === "configuracoes" && <Configuracoes turmas={turmas} perfilSync={perfilSync} onPerfilSyncChange={atualizarPerfilSync} onAbrirAssistenteSync={() => setMostrarAssistenteSync(true)} onDadosAlterados={() => {
          invokeApp<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
        }} />}
        {tela === "relatorios" && (
          <RelatoriosMenu
            onAbrirCriticos={() => navegarPara("relatorio-criticos")}
            onAbrirAlteracoesNotas={() => navegarPara("relatorio-alteracoes-notas")}
            onAbrirPei={() => navegarPara("pei")}
          />
        )}
        {tela === "relatorio-criticos" && <RelatorioAlunosCriticos turmas={turmas} onVoltar={() => navegarPara("relatorios")} />}
        {tela === "relatorio-alteracoes-notas" && <RelatorioAlteracoesNotas turmas={turmas} onVoltar={() => navegarPara("relatorios")} />}
        {tela === "pei" && <TelaPEI onVoltar={() => navegarPara("relatorios")} />}
        {tela !== "dashboard" && tela !== "conselhos" && tela !== "conselho" && tela !== "turmas" && tela !== "gestao-turma" && tela !== "importar-dados" && tela !== "importar-notas" && tela !== "importar-elegiveis" && tela !== "importar-diagnostico" && tela !== "kanban" && tela !== "calendario" && tela !== "configuracoes" && tela !== "relatorios" && tela !== "relatorio-criticos" && tela !== "relatorio-alteracoes-notas" && tela !== "pei" && <Placeholder tela={tela} />}
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
      {!mostrarNovidades && mostrarAssistenteSync && (
        <AssistenteSincronizacaoGrupo
          perfil={perfilSync}
          onConcluir={(perfil) => {
            atualizarPerfilSync(perfil);
            setMostrarAssistenteSync(false);
          }}
          onDispensar={() => {
            atualizarPerfilSync({ ...perfilSync, syncEnabled: false, onboarding: "dismissed" });
            setMostrarAssistenteSync(false);
          }}
        />
      )}
    </main>
  );
}

function AssistenteSincronizacaoGrupo({
  perfil,
  onConcluir,
  onDispensar,
}: {
  perfil: WorkgroupSyncProfile;
  onConcluir: (perfil: WorkgroupSyncProfile) => void;
  onDispensar: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const [rascunho, setRascunho] = useState(perfil);
  const [erro, setErro] = useState("");
  const totalPassos = 3;

  async function escolherPasta() {
    setErro("");
    try {
      const selecionado = await abrirDialogoArquivo({
        directory: true,
        multiple: false,
        title: "Escolher pasta compartilhada do grupo de trabalho",
      });
      if (typeof selecionado === "string") {
        setRascunho((atual) => ({ ...atual, syncFolder: selecionado }));
      }
    } catch (error) {
      setErro(`Não foi possível abrir o seletor de pasta: ${String(error)}`);
    }
  }

  function finalizar() {
    if (!rascunho.syncFolder.trim()) {
      setErro("Escolha a pasta compartilhada antes de finalizar a ativação.");
      return;
    }
    onConcluir({
      ...rascunho,
      displayName: rascunho.displayName.trim() || "Coordenação",
      role: rascunho.role.trim() || "Coordenação pedagógica",
      syncEnabled: true,
      onboarding: "enabled",
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="sync-wizard" role="dialog" aria-modal="true" aria-labelledby="sync-wizard-title">
        <div className="sync-wizard-progress" aria-label={`Etapa ${passo + 1} de ${totalPassos}`}>
          {Array.from({ length: totalPassos }).map((_, indice) => (
            <span key={indice} className={indice <= passo ? "active" : ""} />
          ))}
        </div>

        {passo === 0 && (
          <>
            <span className="eyebrow">Trabalho em equipe</span>
            <h2 id="sync-wizard-title">Sincronização de grupo de trabalho</h2>
            <p>O CoordenacaoOP pode preparar esta instalação para compartilhar dados com outros coordenadores usando uma pasta comum, como o OneDrive da escola.</p>
            <div className="sync-wizard-grid">
              <article>
                <UserRound size={20} />
                <strong>Perfil identificado</strong>
                <span>Cada alteração futura poderá registrar quem fez e de qual instalação veio.</span>
              </article>
              <article>
                <Cloud size={20} />
                <strong>Sem servidor próprio</strong>
                <span>A pasta compartilhada funciona apenas como transporte dos arquivos de sincronização.</span>
              </article>
            </div>
            <p className="sync-wizard-note">Se preferir decidir depois, este recurso fica em Configurações, na seção Perfil e sincronização.</p>
          </>
        )}

        {passo === 1 && (
          <>
            <span className="eyebrow">Perfil do coordenador</span>
            <h2 id="sync-wizard-title">Identifique esta instalação</h2>
            <p>Esses dados ajudam o grupo a entender a origem das alterações. Eles não substituem login nem enviam dados para servidor externo.</p>
            <div className="sync-wizard-form">
              <label>
                Seu nome
                <input value={rascunho.displayName} onChange={(event) => setRascunho((atual) => ({ ...atual, displayName: event.target.value }))} placeholder="Ex.: Thiago Henrique" />
              </label>
              <label>
                Função
                <input value={rascunho.role} onChange={(event) => setRascunho((atual) => ({ ...atual, role: event.target.value }))} />
              </label>
              <label>
                Nome deste dispositivo
                <input value={rascunho.deviceName} onChange={(event) => setRascunho((atual) => ({ ...atual, deviceName: event.target.value }))} />
              </label>
            </div>
          </>
        )}

        {passo === 2 && (
          <>
            <span className="eyebrow">Pasta compartilhada</span>
            <h2 id="sync-wizard-title">Escolha a pasta do grupo</h2>
            <p>Use uma pasta OneDrive compartilhada entre os coordenadores. O ideal é criar uma pasta exclusiva, por exemplo `CoordenacaoOP-Sync`.</p>
            <div className="sync-folder-picker">
              <button type="button" onClick={escolherPasta}>
                <FolderOpen size={18} />
                Escolher pasta
              </button>
              <span>{rascunho.syncFolder || "Nenhuma pasta selecionada"}</span>
            </div>
            <p className="sync-wizard-note">Por enquanto o aplicativo salva o perfil e a pasta. A sincronização dos dados será ativada em etapa posterior com segurança contra conflitos.</p>
            {erro && <div className="notice error">{erro}</div>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onDispensar}>Agora não</button>
          {passo > 0 && <button type="button" onClick={() => setPasso((atual) => atual - 1)}>Voltar</button>}
          {passo < totalPassos - 1 ? (
            <button type="button" className="primary-action" onClick={() => setPasso((atual) => atual + 1)}>Próximo</button>
          ) : (
            <button type="button" className="primary-action" onClick={finalizar}>Finalizar</button>
          )}
        </div>
      </section>
    </div>
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
    "importar-diagnostico": "Importar Diagnóstico SARESP",
    conselhos: "Conselhos",
    conselho: "Conselho",
    kanban: "Quadro de Gestão",
    calendario: "Calendário",
    relatorios: "Relatórios",
    "relatorio-criticos": "Relatório de Alunos Críticos",
    "relatorio-alteracoes-notas": "Alterações de Notas Pós-Conselho",
    pei: "PEI — Plano Educacional Individualizado",
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
