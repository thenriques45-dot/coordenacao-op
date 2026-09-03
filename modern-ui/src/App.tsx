import {
  BookMarked,
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
  MessageCircle,
  Moon,
  NotebookPen,
  Pencil,
  Plus,
  Settings,
  Sun,
  Tag,
  TrendingUp,
  Trash2,
  Upload,
  Usb,
  Users,
  X,
} from "lucide-react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import brandLogo from "./assets/logo.png";
import { invokeApp, tauriDisponivel } from "./features/appBridge";
import type { AtendimentoAlunoInput, CanalAtendimento, FollowupPrevisto } from "./features/atendimentos/tipos";
import { BuscaGlobal } from "./features/GlobalSearch";
import { CalendarioGestao } from "./features/CalendarManagement";
import { Turmas } from "./features/ClassList";
import { GestaoTurma } from "./features/ClassManagement";
import { TelaAtendimentos } from "./features/Atendimentos";
import { Council, SelecaoConselho } from "./features/Council";
import { Dashboard } from "./features/Dashboard";
import { ImportarAlunosLote, ImportarDados, ImportarDiagnostico, ImportarElegiveis, ImportarExpansoes, ImportarFotos, ImportarNotas, ImportarProvaPaulista, ImportarTarefas } from "./features/Imports";
import { QuadroKanban } from "./features/KanbanBoard";
import { RelatorioAtendimentos, RelatoriosMenu, MotorRelatorios } from "./features/Reports";
import { ConstrutorRelatorio } from "./features/motorRelatorios/ConstrutorRelatorio";
import { RepositorioRelatorios } from "./features/motorRelatorios/RepositorioRelatorios";
import type { ReportDefinition } from "./features/motorRelatorios/tipos";
import { TelaPEI } from "./features/PEI";
import { TelaPlanejamento } from "./features/Planejamento";
import { Configuracoes, type ConfiguracoesApp, type OpcaoEncaminhamento, type MensagemTemplate, type SettingsSection } from "./features/SettingsPage";
import { AssistenteConfiguracaoInicial } from "./features/SetupWizard";
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

type Tela = "dashboard" | "turmas" | "gestao-turma" | "atendimentos" | "importar-dados" | "importar-notas" | "importar-elegiveis" | "importar-diagnostico" | "importar-fotos" | "importar-alunos-lote" | "importar-tarefas" | "importar-prova-paulista" | "importar-expansoes" | "conselhos" | "conselho" | "kanban" | "calendario" | "relatorios" | "relatorio-atendimentos" | "relatorio-motor" | "construtor-relatorio" | "repositorio-relatorios" | "pei" | "planejamento" | "configuracoes";

const PERIODOS_TURMA = ["MANHA", "TARDE", "NOITE", "INTEGRAL (9 HORAS)", "INTEGRAL (7 HORAS)"];
const TIPOS_ATENDIMENTO_PADRAO = ["Disciplinar", "Dúvidas", "Pedagógico", "Financeiro", "Educação especial"];

function normalizarTiposAtendimento(tipos?: string[] | null) {
  const normalizados = (tipos ?? []).map((tipo) => tipo.trim()).filter(Boolean);
  return normalizados.length ? normalizados : [...TIPOS_ATENDIMENTO_PADRAO];
}

const ENCAMINHAMENTOS_PADRAO: OpcaoEncaminhamento[] = [
  "Dificuldade em ler, interpretar e associar dados, tabelas, figuras, produzir textos e resolver situações problemas",
  "Confrontar ideias e opiniões, manifestando-se de forma argumentativa",
  "Dedicar-se mais ao estudo em casa.",
  "Prestar mais atenção às explicações do professor, tirar dúvidas, realizar as tarefas em aula nos prazos estipulados",
  "Frequência às aulas.",
  "Acompanhar diariamente, dialogar e orientar o estudante sobre as atividades escolares",
  "Estabelecer horas de estudo em casa, incentivando o hábito de estudar",
  "Comparecer às reuniões e conversar com professores e coordenadores pedagógicos",
  "Recuperação contínua",
  "Tarefas auxiliares para superação das dificuldades específicas do estudante",
].map((texto, indice) => ({ numero: indice + 1, texto }));

function normalizarEncaminhamentos(opcoes?: OpcaoEncaminhamento[] | null) {
  const normalizados = (opcoes ?? [])
    .map((item) => ({ numero: item.numero, texto: item.texto.trim() }))
    .filter((item) => item.texto.length > 0);
  return normalizados.length ? normalizados : [...ENCAMINHAMENTOS_PADRAO];
}

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

type OpcaoCriterioPerfil = {
  nivel: string;
  label: string;
};

type CriterioPerfil = {
  id: string;
  nome: string;
  opcoes: OpcaoCriterioPerfil[];
};

type CriterioDestaque = {
  id: string;
  titulo: string;
  icone: string;
};

type TurmaConfig = {
  lider_ativo: boolean;
  lider_rotulo: string;
  elegivel_ativo: boolean;
  elegivel_rotulo: string;
  atendimento_tipos?: string[];
  encaminhamento_opcoes?: OpcaoEncaminhamento[];
  mensagem_familia_templates?: MensagemTemplate[];
  perfil_turma_ativo?: boolean;
  perfil_turma_criterios?: CriterioPerfil[];
  aluno_destaque_ativo?: boolean;
  aluno_destaque_criterios?: CriterioDestaque[];
};

type ResponsavelAluno = {
  nome: string;
  parentesco: string;
  parentesco_desc?: string | null;
  telefone: string;
};

type AtendimentoAnexoApi = {
  id: string;
  nome: string;
  tipo: string;
  dados: string;
  caminho: string | null;
  origem: string;
};

type AtendimentoAlunoApi = {
  id: string;
  data: string;
  tipos: string[];
  atendido: string;
  atendido_nome?: string | null;
  tags: string[];
  descricao: string;
  anexos: AtendimentoAnexoApi[];
  followups?: AtendimentoFollowUpApi[];
  canal: CanalAtendimento;
  lote_id?: string | null;
  modelo_id?: string | null;
  followup_previsto?: FollowupPrevisto | null;
  criado_em: string | null;
  atualizado_em?: string | null;
};

type AtendimentoFollowUpApi = {
  id: string;
  data: string;
  tipos: string[];
  atendido: string;
  atendido_nome?: string | null;
  tags: string[];
  descricao: string;
  anexos: AtendimentoAnexoApi[];
  canal: CanalAtendimento;
  modelo_id?: string | null;
  criado_em: string | null;
  atualizado_em?: string | null;
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
  encaminhamentosBimestres?: EncaminhamentosBimestreApi[];
  deliberado: boolean;
  atendimentos?: AtendimentoAlunoApi[];
  responsaveis?: ResponsavelAluno[];
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
  pei_coordenador_gestao?: string | null;
  pei_prof_especializado?: string | null;
  pei_direcao?: string | null;
  lider_sala: string | null;
  vice_lider_sala: string | null;
  total_alunos: number;
  alunos_ativos: number;
  alunos_elegiveis: number;
  nomes_alunos: string[];
  conselhos_com_ajustes: number;
  conselho_finalizado: boolean;
  // Sempre presentes vindos de `listar_turmas`; opcionais no tipo porque
  // componentes-filhos (ClassList, Council, BuscaGlobal) devolvem o objeto por
  // callback declarando só um subconjunto dos campos.
  total_atendimentos?: number;
  followups_pendentes?: number;
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
  alunos: AlunoApi[];
};

type PendriveConselhoDetectado = {
  pasta: string;
  bimestre: string;
  criado_em: string;
  origem: string;
  turmas: string[];
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
  ativo: boolean;
  numero_chamada: number | null;
  elegivel: boolean;
  lideranca_sala: "lider" | "vice" | null;
  deficiencias: string[];
  comentario_educacao_especial: string | null;
  frequencia_percentual: number | null;
  encaminhamentos: number[];
  encaminhamentos_bimestres: EncaminhamentosBimestreApi[];
  deliberado: boolean;
  atendimentos: AtendimentoAlunoApi[];
  responsaveis: ResponsavelAluno[];
  diagnostico_aprendizagem: DiagnosticoAprendizagemApi | null;
  disciplinas: DisciplinaApi[];
};

type EncaminhamentosBimestreApi = {
  bimestre: string;
  codigos: number[];
};

type DiagnosticoAprendizagemApi = {
  turma_origem: string | null;
  cd_escola: string | null;
  cd_diretoria: string | null;
  portugues: DiagnosticoComponenteApi;
  matematica: DiagnosticoComponenteApi;
  atualizado_em: string | null;
};

type DiagnosticoComponenteApi = {
  aprendizagem_equivalente: string | null;
  status: string | null;
  nivel_avd1: string | null;
  equivalente_avd1: string | null;
  nivel_avd2: string | null;
  equivalente_avd2: string | null;
  evolucao: string | null;
  mensurado: boolean;
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
  "4.0.0": [
    "Nova tela 'Atendimentos', item próprio no menu (entre Turmas e Importar Dados), com contador de follow-ups pendentes. Reúne todos os atendimentos da turma numa lista com filtros (tipo, período, canal, tag, follow-up pendente), selo de canal por linha (Manual / wa.me / wa.me · lote / API oficial) e alternância entre tabela e cartões.",
    "Detalhe do atendimento em thread: registro inicial, follow-ups e o 'follow-up combinado' — um compromisso datado que substitui o antigo campo de status. É o que sinaliza que um caso tem pendência. 'Registrar desfecho' encerra o combinado.",
    "Compositor de mensagem à família redesenhado: destinatário, modelo e variáveis em três passos, com prévia em bolha de WhatsApp e os trechos sem dado destacados para preencher na hora ou remover.",
    "Aba 'Por aluno': histórico de contato com a família por estudante (mensagens e presencial), responsáveis à vista e acesso rápido a 'Nova mensagem'.",
    "Disparo em lote — 'Contatar famílias': monte a fila por filtros prontos (com tarefa pendente, frequência baixa, sem acesso à plataforma…) ou por condições (campo · operador · valor, o mesmo vocabulário do construtor de relatórios). Depois, escolha o canal: fila assistida no WhatsApp (grátis, você aperta enviar em cada um, com atalhos de teclado e teto de 40 por sessão, pausável e retomável) ou envio automático pela API oficial da Meta.",
    "Envio automático (opcional): configure em Configurações › Sistema › 'Envio automático de mensagens'. Cobra por mensagem, vale só nesta máquina e não sincroniza com o grupo. Sem isso, tudo continua funcionando pela fila assistida.",
    "Aba 'Disparos em lote': histórico dos envios da turma, com situação (concluída, pausada, com pendências) e retomada de filas paradas.",
    "A aba 'Atendimentos' da ficha do aluno ganhou um atalho para abrir o mesmo aluno na tela nova.",
  ],
  "3.5.1": [
    "Corrigido: o boletim da ficha do aluno (aba Desempenho) voltava a não mostrar nenhuma nota nem frequência quando o bimestre selecionado ainda não tinha lançamento — por exemplo, ao entrar no 3º bimestre antes de importar o mapão. Agora o boletim sempre lista as disciplinas do ano e as notas já lançadas (1º, 2º…), preservando a comparação da progressão ao longo do ano. A tabela de disciplinas do Conselho e as métricas da turma passam a seguir a mesma regra: mostram o rol de disciplinas do ano mesmo antes de o bimestre atual ter notas.",
  ],
  "3.5.0": [
    "Bimestre atual global: um seletor único no cabeçalho (Turmas, ficha do aluno, Conselho, Relatórios) define o bimestre de todas as telas, e a escolha fica salva. O app resolve sozinho (datas de início na configuração institucional → maior bimestre já importado → 1º) até você fixar um manualmente.",
    "Compositor \"Mensagem ao responsável\": o texto e a prévia viraram um campo só, com as variáveis aparecendo como etiquetas coloridas (azul = com dado, amarelo = sem dado do aluno). As etiquetas embaixo inserem a variável na posição do cursor; apagar é como apagar um caractere.",
    "Importar Tarefas: a chave de bimestre é normalizada (\"1\"…\"4\"), alinhando o dado com a leitura da mensagem à família e do motor de relatórios.",
  ],
  "3.4.0": [
    "Novo: contato com a família por WhatsApp, na aba Atendimentos do perfil do aluno. Cadastre o responsável (nome, parentesco — mãe, pai ou outro — e celular; dá pra ter um segundo responsável), escolha um modelo de mensagem e o app abre o WhatsApp com o texto pronto, já preenchido com os dados do aluno (frequência, tarefas pendentes, progresso na plataforma de expansão, etc.). Cada mensagem enviada fica registrada como um atendimento do aluno, com as tags do modelo.",
    "Novo: modelos de mensagem à família, editáveis em Configurações › Institucional › 'Mensagens à família'. Crie um modelo por situação (excesso de faltas, tarefas em atraso, convocação…) usando variáveis entre chaves — {aluno}, {frequencia}, {tarefas_pendentes}, {expansao_dias_sem_acesso}… — que são trocadas pelos dados reais do estudante na hora de enviar. Já vem com exemplos prontos.",
    "Importar Tarefas: agora aceita várias planilhas de uma vez (ou ir adicionando uma a uma, com a lista à vista). O app junta todas antes de cruzar os alunos pelo nome, então dá pra importar todas as turmas num passo só.",
    "As tags do formulário de atendimento viraram um campo de 'chips': digite e tecle vírgula ou Enter para criar a tag, e o campo sugere as tags já usadas neste aluno e as definidas nos modelos de mensagem.",
    "Quadro Kanban: no campo 'Responsável' de uma tarefa, digite '@' para escolher um coordenador do grupo de trabalho; também dá pra adicionar um nome que não esteja no grupo.",
    "O importador do Diagnóstico SARESP lê o novo relatório 'Aprendizagem Equivalente' das Devolutivas Pedagógicas, com as duas aplicações do ano (Diagnóstica 1 e Diagnóstica 2) e a evolução por componente. As telas de conselho passam a mostrar o resultado mais recente e um selo de evolução (Avançou / Manteve / Regrediu).",
    "Disciplinas lançadas com grafias diferentes que são a mesma matéria (ex.: 'Língua Inglesa' e 'LINGUA INGLESA', vindas de mapões diferentes) passam a ser tratadas como uma só na tela do conselho — antes a versão de expansão aparecia como disciplina separada, sem plano nem PEI. Também há uma correção para isso em Configurações › Manutenção de dados.",
    "Repositório de relatórios ganhou botão 'Atualizar' e passa a buscar sempre a versão mais recente da lista publicada no GitHub, sem cache preso.",
  ],
  "3.3.0": [
    "Novo: 'Assinaturas', na tela de PEI — define por turma quem assina cada PEI (coordenador de gestão pedagógica, professor especializado, direção), e o nome já sai impresso acima da linha de assinatura no documento. O professor regente vem automático de quem respondeu o PEI; o responsável pelo estudante é preenchido na ficha do aluno e fica em branco se não cadastrado. Digite '@nome' num campo para puxar alguém do grupo de trabalho.",
    "Novo: ao exportar o PEI de um aluno em PDF, as assinaturas de todos os componentes passam para uma folha única no final — uma folha por aluno para assinar e digitalizar, em vez de um bloco repetido a cada disciplina.",
    "Novo: botão 'Regerar todos' na tela de PEI, para reescrever os PEIs já gerados com os nomes de assinatura atuais.",
    "Corrigido: 'Publicar no repositório' recusava o envio com erro de autenticação mesmo depois de fazer login com o GitHub, e pedia login a cada uso — a sessão nunca era realmente guardada no chaveiro do sistema. O mesmo afetava a autorização do Google (Planejamento/PEI). Agora a sessão fica salva de verdade entre usos.",
  ],
  "3.2.2": [
    "Corrigido: mesmo já logado, 'Publicar no repositório' podia recusar o envio pedindo login de novo — uma rede lenta ou instável na hora de confirmar a conta (comum em rede de escola) era tratada como sessão inválida. Agora tenta de novo automaticamente antes de desistir, e o aviso de erro (quando acontece) deixa claro que é a rede, não a sessão salva.",
  ],
  "3.2.1": [
    "Corrigido: no 'Publicar no repositório' (novo na 3.2.0), confirmar o envio fechava o construtor de relatórios no meio do processo, antes da publicação terminar — o relatório não chegava a subir pro GitHub, e nenhum erro aparecia. O construtor agora fica aberto até o fim do envio, mostrando confirmação ou erro.",
  ],
  "3.2.0": [
    "Novo: 'Publicar no repositório', no construtor de relatórios — envia um relatório seu direto pro repositório público do GitHub sem precisar sair do app. Se for você, atualiza direto o relatório oficial; se for outro coordenador, abre um Pull Request pedindo entrada em 'comunidade', que só vale depois de revisado e aceito.",
    "Novo: o nome do relatório virou um bloco próprio ('Título do relatório'), separado do 'Cabeçalho institucional' — permite colocar um Espaçador entre a imagem da escola e o título, e agora dá pra escolher o tamanho e a cor do título (algumas opções prontas ou qualquer código de cor).",
    "Novo: nos blocos de texto do construtor, o tamanho da fonte do título e do corpo passa a ser editável (antes era fixo). O bloco 'Título e texto' foi renomeado só para 'Texto'.",
    "Novo: o bloco 'Espaçador' deixa escolher quantas linhas em branco ele gera, em vez de sempre duas.",
    "Novo: toda tabela de alunos nova já vem com as colunas 'Nº de Chamada' e 'Nome do Aluno' prontas, pra identificar o aluno de cara e mostrar que dá pra adicionar mais colunas ali.",
    "O dropdown de campos do construtor só mostra 'Expansão' e 'Prova Paulista' quando a escola realmente tem esse tipo de dado importado — menos opções irrelevantes poluindo a lista.",
    "Corrigido: 'Coordenação Pedagógica · Nº bimestre' ficava embutido no corpo do documento Word, colado no título — agora vira um rodapé que repete em toda página, e o espaçador finalmente separa a imagem institucional do título como esperado.",
    "Corrigido: parâmetros desvinculados de um filtro (ou de 'quantidade de linhas editável') continuavam aparecendo na tela de gerar relatório mesmo sem afetar nada — e o botão 'usar parâmetro' num filtro podia acabar vinculando ao parâmetro errado sem avisar. As duas coisas causavam relatórios que pareciam configurados mas geravam valores sem sentido.",
  ],
  "3.1.1": [
    "Importador de Disciplinas de Expansão (período noturno) — carregue a planilha de progresso da plataforma online e o app guarda um histórico datado por aluno, não só o valor mais recente. O motor de relatórios ganha campos novos (progresso e nota atuais, quanto o aluno evoluiu desde a última importação e no bimestre, dias sem acessar a plataforma) pra você montar seus próprios relatórios de acompanhamento — quem mais evoluiu, quem está parado, quem precisa de atenção — sem esperar uma atualização do programa.",
    "'Exportar PEI (PDF)', na tela de PEI — junta todos os documentos de um aluno (todas as disciplinas e bimestres) num único PDF com o nome dele, em vez de vários .docx separados na pasta.",
    "Novo bloco 'Espaçador' no construtor de relatórios: acrescenta duas linhas em branco entre itens do documento (ex.: entre o cabeçalho e o título).",
    "Nova seção 'Manutenção de dados', em Configurações: encontra e corrige disciplinas gravadas com grafias diferentes que são a mesma matéria (ex.: 'Orientação de Estudo - Matemática' e 'Orientação de Estudo Matemática') — sem essa correção, as notas ficavam divididas entre duas linhas em vez de uma só. Mostra a lista antes de corrigir; a correção mantém sempre a nota mais recente.",
    "Correções e refinamentos: a Dashboard passa a avisar quando um aluno aparece ativo em duas turmas ao mesmo tempo (com opção de 'Dispensar' o aviso, que ainda assim continua sendo verificado por trás — se resolver sozinho depois, você é avisado); o bloco 'Parâmetros' do construtor de relatórios foi reorganizado pra mostrar direto onde cada parâmetro pode ser aplicado (filtro ou quantidade de linhas), permitindo criar e vincular tudo num clique só, sem precisar visitar filtros/colunas separadamente; no construtor, a seção 'Colunas' passa a vir antes de 'Condições' (mais lógico montar a planilha antes de filtrar) e o nome da coluna é preenchido automaticamente a partir do campo escolhido, podendo ser editado à mão.",
  ],
  "3.1.0": [
    "Novo: importador de Disciplinas de Expansão (período noturno) — carregue a planilha de progresso da plataforma online e o app guarda um histórico datado por aluno, não só o valor mais recente. O motor de relatórios ganha campos novos (progresso e nota atuais, quanto o aluno evoluiu desde a última importação e no bimestre, dias sem acessar a plataforma) pra você montar seus próprios relatórios de acompanhamento — quem mais evoluiu, quem está parado, quem precisa de atenção — sem esperar uma atualização do programa.",
    "Novo: 'Exportar PEI (PDF)', na tela de PEI — junta todos os documentos de um aluno (todas as disciplinas e bimestres) num único PDF com o nome dele, em vez de vários .docx separados na pasta.",
    "Novo bloco 'Espaçador' no construtor de relatórios: acrescenta duas linhas em branco entre itens do documento (ex.: entre o cabeçalho e o título).",
    "Nova seção 'Manutenção de dados', em Configurações: encontra e corrige disciplinas gravadas com grafias diferentes que são a mesma matéria (ex.: 'Orientação de Estudo - Matemática' e 'Orientação de Estudo Matemática') — sem essa correção, as notas ficavam divididas entre duas linhas em vez de uma só. Mostra a lista antes de corrigir; a correção mantém sempre a nota mais recente.",
    "Corrigido: no construtor de relatórios, 'Gerar agora' podia salvar um relatório com uma tabela sem nenhuma coluna configurada, mesmo o botão 'Salvar' recusando isso pelo mesmo motivo — agora as duas ações usam a mesma checagem.",
    "Corrigido: em algumas distribuições Linux (ex.: Fedora), gerar relatórios em PDF falhava mesmo com a fonte certa instalada, porque o app só procurava fontes nos caminhos do Ubuntu/Debian.",
  ],
  "3.0.1": [
    "Novo: 'Criar relatório', na Central de Relatórios, ganhou um construtor visual em blocos — monte relatórios do zero escolhendo campos, filtros, ordenação, textos e o cabeçalho institucional, na ordem que quiser, sem precisar de uma atualização do programa. Um tutorial explica o construtor e o repositório no primeiro acesso à tela.",
    "Novo: 'Repositório de relatórios' reúne modelos prontos pra baixar — os oficiais (Tarefas Realizadas, Prova Paulista e Educação Física, que deixaram de vir instalados por padrão) e os enviados pela comunidade de coordenadores. Cada relatório mostra quem montou.",
    "O relatório 'Top 60' virou 'Top Alunos' e a quantidade de alunos listados por período passa a ser escolhida na hora de gerar, em vez de fixa em 60.",
    "A imagem de cabeçalho institucional (configurada em Configurações › Instituição) agora também aparece nos relatórios exportados em Excel e PDF — já aparecia no Word.",
    "Corrigido: depois de reformatar o computador e reinstalar o app, reentrar no grupo de trabalho com o mesmo nome não bastava pra recuperar a configuração automática de Planejamento/PEI feita antes da formatação — agora aparece um botão 'Essa configuração é minha' pra reivindicar a configuração de um perfil antigo com o mesmo nome de exibição.",
  ],
  "3.0.0": [
    "Novo: 'Criar relatório', na Central de Relatórios, ganhou um construtor visual em blocos — monte relatórios do zero escolhendo campos, filtros, ordenação, textos e o cabeçalho institucional, na ordem que quiser, sem precisar de uma atualização do programa. Um tutorial explica o construtor e o repositório no primeiro acesso à tela.",
    "Novo: 'Repositório de relatórios' reúne modelos prontos pra baixar — os oficiais (Tarefas Realizadas, Prova Paulista e Educação Física, que deixaram de vir instalados por padrão) e os enviados pela comunidade de coordenadores. Cada relatório mostra quem montou.",
    "O relatório 'Top 60' virou 'Top Alunos' e a quantidade de alunos listados por período passa a ser escolhida na hora de gerar, em vez de fixa em 60.",
    "A imagem de cabeçalho institucional (configurada em Configurações › Instituição) agora também aparece nos relatórios exportados em Excel e PDF — já aparecia no Word.",
    "Corrigido: depois de reformatar o computador e reinstalar o app, reentrar no grupo de trabalho com o mesmo nome não bastava pra recuperar a configuração automática de Planejamento/PEI feita antes da formatação — agora aparece um botão 'Essa configuração é minha' pra reivindicar a configuração de um perfil antigo com o mesmo nome de exibição.",
  ],
  "2.24.1": [
    "Corrigido: turmas podiam aparecer duplicadas na lista depois de sincronizar com um dispositivo em versão mais antiga do app — o merge casava as turmas pelo nome do arquivo, e um código gravado sem formatação (ex.: '2a SERIE A') virava um arquivo com nome diferente do já formatado ('2ª Série A'), então as duas nunca se uniam. A sincronização agora reconhece que são a mesma turma comparando o código sem acento/maiúsculas, une os dados dos dois lados e mantém só um registro.",
  ],
  "2.23.1": [
    "Corrigido: o relatório 'Educação Física — Ensino Médio' (novo na 2.23.0) listava a turma inteira em vez de só quem faz a disciplina — a carga horária de EF é um número por turma (mesmo valor pra sala toda), então bastava 1 aluno real de EF ter sido casado naquela sala pra todo mundo dela entrar no relatório com frequência 100% inventada. Agora só entra quem tem falta de EF lançada individualmente.",
  ],
  "2.23.0": [
    "Novo relatório 'Educação Física — Ensino Médio' na Central de Relatórios: exporta em planilha (.csv) nome, turma e frequência dos alunos do EM que têm Educação Física lançada — a disciplina chega por um mapão separado e nem todo aluno a faz, então só entram os alunos com carga horária de EF de fato lançada.",
    "Corrigido: reimportar o mapão de um bimestre anterior depois de já ter importado um mais recente podia fazer a frequência exibida na ficha do aluno regredir — o app agora só atualiza esse número quando o mapão importado é do bimestre igual ou mais recente que o já registrado.",
    "Corrigido: sincronizar entre dois dispositivos que tinham importado mapões de bimestres diferentes podia apagar as faltas por disciplina de um dos lados, distorcendo o total de faltas do ano — a sincronização agora combina os bimestres de cada lado em vez de substituir um pelo outro.",
  ],
  "2.22.3": [
    "Corrigido: a tela de novidades ('o que há de novidade') podia ficar travada em monitores menores, sem espaço para rolar até o botão 'Entendi' nem forma de fechar — agora ela sempre cabe na tela (com rolagem interna quando o texto é longo), e também fecha com Esc ou clicando fora.",
  ],
  "2.22.2": [
    "Corrigido: a correção da versão anterior para disciplinas que aparecem tanto no mapão normal quanto no de expansão com grafias diferentes (ex.: 'Língua Inglesa' no normal e 'LINGUA INGLESA' no de expansão) não funcionava de fato — a comparação usava o texto exato e não reconhecia as duas grafias como a mesma disciplina, deixando a versão de expansão aparecer como se fosse uma disciplina própria, sem plano nem PEI. Agora a comparação ignora acento e caixa.",
    "Ajustado: só 'Projeto de Vida' deixou de exigir Plano de Ensino e PEI (é um componente de tutoria sem professor de componente dedicado). Redação e Leitura e Orientação de Estudo continuam exigindo os dois documentos normalmente — a versão anterior desta correção tinha excluído essas duas por engano.",
    "O PEI passa a esconder as disciplinas de mapão de expansão da cobrança de documento, do mesmo jeito que o Planejamento já fazia — antes só o Planejamento respeitava essa marcação.",
    "Corrigido: PEIs já entregues por um Forms antigo (antes da migração para o Web App automático) ou gerados com uma versão anterior do app (antes da correção de acentos no nome do arquivo) ficavam invisíveis na tela de acompanhamento e no relatório de pendências, mesmo com o documento salvo na pasta do aluno. A tela agora reconcilia com os documentos já existentes na pasta de cada aluno elegível.",
    "Planejamento: nomes de disciplina na matriz passam a ter caixa consistente (Título Case), mesmo quando vêm de um mapão que grava o nome todo em maiúsculas (comum em componentes de expansão/itinerário).",
  ],
  "2.22.1": [
    "Corrigido: disciplinas de mapões de 'Tipo de Ensino: Expansão' (turmas não seriadas de itinerário/aprofundamento) apareciam na tela de Planejamento como se precisassem de Plano de Ensino, mesmo sem nenhum professor responsável por planejá-las. As notas continuam entrando normalmente nos alunos/conselho — só a cobrança de plano não se aplica mais a essas disciplinas. Quando a mesma disciplina existe nos dois mapões (ex.: Língua Inglesa no mapão normal e no de expansão), ela continua contando como disciplina normal.",
    "Corrigido: a mesma disciplina podia aparecer duas vezes na lista de Planejamento (ex.: 'Orientação de Estudo em Matemática' e 'ORIENTACAO DE ESTUDO - MATEMATICA') quando o mapão do SED e o Web App usavam redações diferentes — hífen, a palavra 'em' ou um sufixo de série coladas ao nome. Essas variações passam a ser reconhecidas como a mesma disciplina.",
    "Corrigido: trocar o coordenador responsável por uma turma podia sobrescrever o texto da ata e o tempo de reunião do conselho pelos dados do 1º bimestre, mesmo estando em outro bimestre no momento.",
    "Corrigido: criar uma tarefa a partir de um evento do calendário não atualizava o Dashboard nem o Quadro de Gestão até recarregar o app.",
    "Corrigido: salvar educação especial ou atendimento de um aluno sem matrícula cadastrada falhava em silêncio, sem avisar o coordenador.",
    "Corrigido: a lista de eventos do calendário disponíveis para vincular a uma tarefa no Kanban podia ficar desatualizada depois de uma sincronização de grupo.",
  ],
  "2.21.6": [
    "Corrigido: a sincronização (de grupo ou institucional) podia apagar da configuração de Planejamento/PEI o vínculo com a planilha e o projeto Apps Script já criados, mesmo em quem originalmente configurou — o sintoma era erro 'Acesso negado' ao ler respostas e, ao clicar em 'Atualizar turmas/republicar' nesse estado, uma planilha nova e vazia em vez de reaproveitar a existente.",
    "Corrigido: uma resposta sem turma selecionada gerava um documento de planejamento numa pasta fantasma (só o nome do ano, sem a letra da turma) misturada às pastas das turmas reais — agora aparece marcada como 'SEM TURMA' para ficar claro que é uma resposta a corrigir na planilha.",
    "Nomes de arquivo gerados (planejamento e PEI) não trocam mais cada letra acentuada por '_' (ex.: 'Educação Física' virava 'Educa__o F_sica') — os acentos são convertidos para a letra correspondente, o que também evita gerar arquivos diferentes para o mesmo texto digitado de formas diferentes.",
    "As telas de Planejamento e PEI passam a mostrar o status (turmas coloridas, quantidade gerada, 'Abrir pasta') a partir dos documentos já salvos no computador, não só da última busca na planilha — um erro pontual de leitura não faz mais turmas com documento já gerado aparecerem como se nada tivesse sido entregue. Recarregar também deixa de reescrever documentos cujo conteúdo não mudou.",
  ],
  "2.21.5": [
    "Corrigido: o botão 'Sincronizar do grupo de trabalho' (Configurações → Perfil & Sincronização) podia trazer o estado de outro coordenador em vez do mais recente de cada um — ele lia um arquivo único compartilhado, sobrescrito por qualquer publicação de qualquer pessoa do grupo, em vez do arquivo próprio de cada coordenador (que é o que o ciclo automático de sincronização já usava corretamente). Isso podia fazer a config de Planejamento/PEI de um coordenador nunca chegar aos demais, de forma intermitente.",
  ],
  "2.21.4": [
    "Planejamento e PEI: quando um coordenador do grupo de trabalho já configurou o Web App automático, os demais deixam de precisar clicar em 'Criar automaticamente' — a config (link e token de leitura) chega sozinha pela sincronização de grupo já existente (Kanban/Calendário), e a tela mostra só o nome (e foto, se houver) de quem configurou, com um botão 'Carregar agora'.",
    "Se mesmo assim alguém clicar em 'Criar automaticamente' tendo uma configuração de grupo já ativa, o app avisa que isso cria uma configuração paralela e substitui a atual nesta máquina, antes de prosseguir — o objetivo é manter só uma configuração ativa por escola.",
  ],
  "2.21.3": [
    "Corrigido: a bolinha de status do PEI podia acusar 'crítico' (vermelho) mesmo com vários PEIs recebidos, quando a carga horária do 3º/4º bimestre ainda não tinha sido importada para o aluno — agora, sem esse dado, ela cai num indicador simples (recebeu algo ou não) em vez de um falso vermelho.",
    "Telas de Planejamento e PEI ganham avisos na aba Automático: o que fazer se o Google mostrar 'Acesso bloqueado'/'app não verificado' ao autorizar (link direto pro tutorial de client próprio), e o que fazer se o link parar de abrir para outras pessoas depois de republicar (falha conhecida da API do Google ao atualizar implantações — resolvida resalvando a implantação pelo editor do Apps Script).",
  ],
  "2.21.2": [
    "Planejamento e PEI ganham um Web App próprio, criado e republicado automaticamente pelo CoordenacaoOP (autorização única com sua conta Google) — sem precisar mais colar script no Apps Script nem compartilhar planilha manualmente. O caminho manual antigo (script/Forms) continua disponível como alternativa, na aba 'Manual' de cada tela.",
    "No Web App do PEI, o professor escolhe a própria turma e só vê os alunos elegíveis dela — turmas sem nenhum aluno elegível nem aparecem na lista — e o componente curricular já vem filtrado pelas disciplinas reais daquele aluno.",
    "Os dois Web Apps têm impressão/PDF sem precisar de nenhuma autorização extra, cópia por e-mail opcional para o professor e um botão para enviar outro planejamento/PEI sem recarregar a página.",
    "PEI e Planejamento viram itens próprios do menu lateral, em vez de cards dentro de Relatórios.",
    "Os prazos de entrega por semestre (1º/2º bimestre e 3º/4º) saem do Planejamento e passam a ser configuração da instituição, ajustável em Configurações → Instituição ou no assistente inicial — os valores já configurados são migrados automaticamente. O indicador de status do PEI passa a seguir esses mesmos prazos, em vez de depender de médias já importadas.",
    "Quem não conseguir usar 'Criar automaticamente' por causa do limite de usuários de teste do Google pode agora configurar seu próprio client OAuth, sem precisar recompilar o app — veja o tutorial 'Configurar_Client_OAuth_Proprio.md' no repositório.",
  ],
  "2.20.0": [
    "Novo relatório 'Elegíveis à Prova de Recuperação': lista, por turma, os alunos com um percentual configurável de notas vermelhas (50% por padrão, ajustável na própria tela) somando todos os bimestres, e aponta qual nota o professor deve substituir após a recuperação — 1º ou 2º bimestre, e 3º ou 4º, separados por página e por disciplina para facilitar a entrega a cada professor.",
    "Tela de Configurações reorganizada: a navegação passa a ter 2 níveis fixos (Institucional, Conselho, Perfil & Sincronização, Sistema) em vez de uma lista com 7 itens soltos. As 4 seções do Conselho (Perfil da turma, Aluno destaque, Encaminhamentos, Notas na ATA) e 'Perfil e sincronização' viram destinos diretos, sem precisar abrir um acordeão dentro de outro.",
    "Quadro Kanban: o campo Responsável passa a aceitar mais de um coordenador do grupo de trabalho (ou o próprio nome, quando não há grupo configurado), com o mesmo seletor usado em Vínculos.",
    "Corrigidos casos de texto ilegível no tema escuro: nota editável nas tabelas, seletor de arquivo do Kanban, opções de documento do conselho, botão de cancelar ao criar turma, cronômetro do modo reunião e popover de histórico de notas.",
  ],
  "2.19.0": [
    "O campo 'Parecer do Conselho' na ficha do aluno agora mostra os encaminhamentos já marcados no Conselho, organizados por bimestre (1º ao 4º) — sem precisar trocar de tela para consultar o que foi combinado em cada bimestre.",
    "Novo botão 'Imprimir notas e parecer' na ficha do aluno: gera uma impressão com a tabela de notas por disciplina e o parecer por bimestre, pronta para entregar ou arquivar.",
    "Corrigido: os assistentes de configuração (Conselho, Turmas, Setup inicial) podiam ficar com os botões de navegação fora da tela quando havia muitos itens cadastrados, sem forma de rolar, salvar ou fechar. Agora rolam normalmente.",
  ],
  "2.18.0": [
    "Novo assistente de configuração inicial: além da sincronização, agora também cadastra os dados da instituição e permite criar a primeira turma sem sair do assistente.",
    "Turmas e Conselho ganham assistentes de configuração próprios (líder de sala, elegível, perfil da turma, aluno destaque, encaminhamentos), acessíveis a qualquer momento — não só no primeiro acesso.",
    "Encaminhamentos do conselho (a lista de 'outras observações e encaminhamentos' da ATA) deixam de ser fixos: a coordenação pode adicionar, editar, reordenar e remover opções em Configurações. Cada opção tem um número fixo, preservado mesmo ao editar a lista, para não invalidar marcações já feitas em outras turmas.",
    "Tela 'Configuração de Conselho' reorganizada em acordeão — Perfil da Turma, Aluno destaque, Encaminhamentos e Notas na ATA começam fechados, com um resumo de uma linha, reduzindo a rolagem.",
    "Scripts de planejamento (Anos Finais e Ensino Médio) passam a montar o Forms em etapas, com continuação automática a cada minuto, evitando o timeout do Apps Script em formulários grandes.",
  ],
  "2.17.0": [
    "Planejamento dos Professores: cada segmento (Anos Finais e Ensino Médio) agora usa uma única planilha de respostas cobrindo o ano letivo inteiro (1º ao 4º bimestre), em vez de uma planilha por semestre — configuração mais simples do Forms.",
    "Novos prazos de entrega por semestre na tela de Planejamento: defina a data de corte do 1º e do 2º semestre e a bolinha de cada turma passa a indicar entrega completa (verde), parcial (amarelo) ou nenhuma (vermelho), comparando com as disciplinas do mapão.",
    "Corrigida a leitura da planilha do Forms quando Turma, Componente, Série/Ano ou Bimestre aparecem em colunas repetidas (um ramo do formulário por resposta anterior) — o app agora usa sempre a primeira coluna preenchida.",
    "Renomeado 'Fundamental' para 'Anos Finais' no script e na tela de Planejamento, alinhado à nomenclatura oficial.",
  ],
  "2.16.0": [
    "Novo 'Pendrive do conselho': prepare um pendrive com as turmas do conselho — o app copia a si mesmo e os dados necessários (notas, fotos e configurações). Faça o conselho em qualquer computador e reintegre tudo na volta.",
    "Reintegração com um clique: ao abrir o app com o pendrive plugado, ele detecta o conselho feito e oferece a reintegração, criando um backup de segurança antes de mesclar.",
    "A tela de conselhos mostra o andamento por bimestre em cada turma: selo verde com a data quando o conselho foi finalizado e selo vermelho quando a turma está em conselho externo.",
    "Tutorial de primeiro acesso na tela de conselhos, apresentando os selos de status e o fluxo do pendrive.",
    "Corrigido: o status de 'conselho finalizado' considerava apenas o 1º bimestre — agora vale para todos os bimestres.",
    "Corrigido: conselhos finalizados em outra máquina (sincronização ou pendrive) não se perdem mais na mesclagem — a finalização mais recente vence e o texto da ata acompanha.",
    "Desempenho: sincronização, importações, backups e geração de documentos deixaram de travar a interface.",
    "Quadro Kanban, calendário e caches de PEI/planejamento ganharam cópia de segurança em disco, restaurada automaticamente se o navegador interno perder os dados.",
  ],
  "2.15.4": [
    "Corrigida a duplicação de turmas na sincronização: cópias de conflito criadas pelo OneDrive (ex.: 'turma_X-NomePC') agora são ignoradas e removidas automaticamente — as turmas não aparecem mais duplicadas ou triplicadas após sincronizar.",
    "Criação de turmas (individual e em lote) passa a bloquear duplicatas com grafia diferente do mesmo nome — ex.: '3ª SERIE A' não cria mais uma cópia de '3ª Série A'.",
    "Importação de notas mais clara: o contador 'Duplicados' virou 'Ambíguos' (alunos cujo nome casa com mais de um estudante, deixados de fora por segurança) e a prévia agora informa quantos alunos serão importados e atualizados.",
  ],
  "2.15.3": [
    "Conselho de classe: o Perfil da Turma passa a respeitar a configuração principal e só aparece quando estiver ativado.",
    "Perfil da Turma e Aluno Destaque agora vêm desativados por padrão nas configurações.",
    "Atendimentos do aluno já ficam disponíveis com os tipos padrão do app, mesmo antes de o coordenador salvar as configurações.",
    "Tema escuro refinado nas telas de Perfil da Turma e Atendimentos, com melhor leitura de tabelas, cards e linha do tempo.",
    "Modal de registro de atendimento ajustado para manter o botão de salvar acessível também na versão instalada.",
  ],
  "2.15.2": [
    "Relatorio de Tarefas agora exporta planilha Excel (.xlsx) com uma aba por turma — sem misturar turmas diferentes na mesma tabela.",
    "Seletor de turmas: escolha quais turmas incluir no relatorio com checkboxes individuais e botoes 'Todas' / 'Nenhuma'.",
    "Turmas ordenadas por codigo na planilha e no seletor.",
  ],
  "2.15.1": [
    "Resolucao automatica de alunos ambiguos por contexto: quando um mesmo nome existe em mais de uma turma, o app identifica a turma correta contando quantos outros colegas do mesmo arquivo ja foram casados com cada candidata — sem necessidade de intervencao manual na maioria dos casos.",
    "Previas de importacao mostram badge 'inferido' (laranja) para alunos resolvidos por contexto, com explicacao do criterio.",
    "Corrigida sincronizacao da versao no binario instalado — o atualizador automatico nao exibe mais falso positivo apos a instalacao.",
  ],
  "2.15.0": [
    "Importador de Tarefas Realizadas: carregue o CSV da SED com o andamento das tarefas dos alunos e registre feitas, total e percentual por bimestre.",
    "Relatorio de Tarefas: exporte uma planilha (.csv) com Turma, Numero, Nome, Feitas, Total e Nota (0–10) de todos os alunos ativos por bimestre.",
    "Importador da Prova Paulista: carregue a planilha XLSX de resultados e registre automaticamente as notas por disciplina e bimestre — deteccao automatica das disciplinas disponiveis (varia por serie).",
    "Relatorio da Prova Paulista: exporte planilha (.csv) com colunas dinamicas por disciplina — so aparecem as disciplinas com dados importados para aquele bimestre.",
    "Dados da Prova Paulista gravados individualmente em cada aluno, prontos para uso em outras funcoes.",
  ],
  "2.13.2": [
    "Correcao interna: versao do aplicativo agora e gravada corretamente no binario — o atualizador automatico passa a funcionar de forma confiavel.",
  ],
  "2.13.1": [
    "Corrigido: ao importar um CSV em que o mesmo aluno aparece mais de uma vez (ex.: 'Ativo' + 'TROCA ALUNO ENTRE CLASSES'), o app agora mantém a entrada ativa — sem necessidade de recriar a turma, basta reimportar o CSV.",
  ],
  "2.13.0": [
    "Indicador de sincronizacao animado no rodape da barra lateral: ponto verde pulsante com o tempo da ultima sincronizacao ('agora mesmo', 'ha 1 min' etc.), atualizado a cada 30 segundos.",
    "Colunas do Quadro Kanban animam a entrada ao abrir o quadro, aparecendo em cascata com atraso escalonado.",
    "Cards de prioridade Alta pulsam suavemente em vermelho para destacar urgencia — a animacao e suprimida durante o arrasto.",
    "Tema escuro: animacao de pulso usa cor e intensidade adaptadas para o tema escuro.",
  ],
  "2.12.0": [
    "Nova aba 'Atendimentos' no perfil do aluno: registre atendimentos com tipo, data e descricao, adicione seguimentos (follow-ups) e anexe documentos.",
    "Linha do tempo de seguimentos por atendimento para acompanhar o historico de cada caso.",
    "Novo Relatorio de Atendimentos na Central de Relatorios: metricas agregadas por tipo, turma e periodo.",
    "Tipos de atendimento configurados em Configuracoes — padrao inclui Disciplinar, Duvidas, Pedagogico, Financeiro e Educacao Especial; personalizaveis.",
  ],
  "2.11.0": [
    "Busca global (Ctrl+K): modal de busca unificada para turmas, alunos e acoes rapidas navegavel inteiramente pelo teclado.",
    "Redesign visual: painel de turma com cards de metrica coloridos por contexto, abas em estilo pilula e periodo exibido como subtitulo.",
    "Quadro Kanban: cada card exibe borda colorida a esquerda indicando prioridade — vermelho para alta, ambar para media e verde para baixa.",
    "Tema escuro refinado com as mesmas melhorias visuais: icones de metrica, abas, badges e bordas Kanban seguem a nova paleta.",
    "Menu lateral: submenu 'Quadro de Gestao' usa guia de recuo em vez de bloco com borda, em ambos os temas.",
    "Badges de Elegivel e Lider corrigidos — 'Sim' em verde, 'Nao' em cinza; Lider e Vice em azul.",
    "Nome do coordenador na tela de turma exibido em vermelho da marca.",
  ],
  "2.10.6": [
    "Segurança: o app agora valida o esquema das URLs antes de abri-las — apenas http, https e mailto são permitidos.",
    "Segurança: proteção contra path traversal em todos os comandos que recebem caminhos de arquivo do front-end.",
    "Verificador de atualizações tolerante a versões com sufixo de pré-lançamento.",
  ],
  "2.10.5": [
    "Novo relatório 'Pendência de Lançamento de Notas' na Central de Relatórios: lista, por turma, as disciplinas ainda sem notas no mapão.",
    "Tela de conselho: diagnóstico SARESP (nível e equivalência de aprendizagem) passa a aparecer em Matemática e Língua Portuguesa.",
    "Corrigida a cor do status 'Básico' no diagnóstico (estava sem cor por causa do acento na sigla).",
    "Corrigido o desalinhamento do indicador de situação quando o nome do aluno ocupa duas linhas.",
  ],
  "2.10.4": [
    "Dashboard: 'Próximas tarefas' agora lista todas as não concluídas (A Fazer, Em Andamento e Revisão).",
    "Relatório de pendências do PEI: considera os bimestres realmente coletados, não apenas o primeiro.",
    "Busca de turmas por código compacto — '6b' encontra o 6º Ano B, '1f' encontra a 1ª Série F.",
    "Corrigido o transbordo dos botões na janela de reposicionar foto do aluno.",
  ],
  "2.10.3": [
    "Nova tela 'Atualizar turmas em lote': selecione vários CSVs da SED de uma vez — o app identifica cada turma pelos RAs dos alunos e mostra prévia antes de aplicar.",
    "Reimportar uma turma agora respeita a situação lida da planilha — transferidos e inativados não são mais reativados.",
  ],
  "2.10.2": [
    "Novo toggle 'Mostrar inativos' na tela de turmas — por padrão os inativos ficam ocultos com o selo 'Inativo' e a linha esmaecida.",
    "Tela de conselho: alunos inativos não aparecem mais na lista nem entram na navegação por teclado.",
    "Métricas e percentuais da turma passam a considerar apenas os alunos ativos.",
  ],
  "2.10.1": [
    "Nova tela 'Importar Fotos dos Alunos': aceita ZIP ou 7z por turma, com as fotos nomeadas pelo primeiro nome do aluno, prévia de recorte e reposicionamento.",
    "As fotos aparecem acima do nome no conselho e ao lado do nome na tela individual do aluno.",
    "Suporte a JPG, PNG, WEBP, GIF, BMP e RAW (CR2/NEF/ARW); fotos HEIC recebem aviso para converter para JPG.",
    "Fotos sincronizadas com o grupo de trabalho sem sobrescrever as que só existem localmente.",
  ],
  "2.10.0": [
    "Nova tela 'Planejamento dos Professores' na Central de Relatórios: acompanha, por turma e disciplina, quais professores entregaram o Plano de Ensino em cada bimestre.",
    "Sincronização inteligente: mesclagem por campo em vez de substituição total — notas e elegibilidade respeitam sempre a edição mais recente.",
    "Rastreabilidade de notas: ao passar o mouse sobre uma nota importada, o app mostra quem importou e quando.",
    "Instância única: reabrir o app pelo ícone com ele na bandeja foca a janela existente em vez de abrir uma nova.",
  ],
  "2.9.0": [
    "O aplicativo vai para a bandeja do sistema ao fechar a janela — notificações de prazo continuam funcionando em segundo plano.",
    "Nova opção 'Importar diagnóstico de aprendizagem' — importa dados de leitura e matemática via CSV da SED e os exibe no conselho de classe.",
    "Nova aba 'Diagnóstico' no perfil individual do aluno no conselho.",
  ],
  "2.8.0": [
    "Tarefas do Kanban agora podem ter data de início e prazo, aparecendo em todos os dias do período no calendário.",
    "Formulário de tarefa mais enxuto: datas na mesma linha, responsável na aba Vínculos já preenchido, e compartilhar virou um botão.",
    "Notificações de prazo corrigidas — agora são enviadas de forma nativa e confiável no Windows e no Linux.",
    "Novo botão para testar notificações em Configurações → Atualização.",
  ],
  "2.7.0": [
    "Eventos do calendário agora podem ter data de início e data de fim, aparecendo em todos os dias do período.",
    "Sincronização do grupo corrigida: eventos e tarefas criados por outros coordenadores não se perdem mais e aparecem de forma confiável.",
    "No Linux, abrir documentos PEI, atas e pastas passa a usar o aplicativo correto em vez de abrir o navegador.",
  ],
  "2.6.1": [
    "A tela do PEI agora traz um tutorial passo a passo de como criar o formulário no Google Forms e compartilhar a planilha.",
    "No painel de próximas datas, tarefas e eventos atrasados ficam reunidos em um contador que você pode expandir e marcar como concluídos.",
    "Tema escuro reformulado, com cores mais suaves e confortáveis para os olhos.",
  ],
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
    deliberado: false,
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
    deliberado: false,
    disciplinas: [
      { nome: "Lingua Portuguesa", mediaOriginal: 6.5, mediaConselho: null, faltas: 2, situacao: "adequada" },
      { nome: "Matematica", mediaOriginal: 5.5, mediaConselho: null, faltas: 3, situacao: "adequada" },
      { nome: "Biologia", mediaOriginal: 4.8, mediaConselho: null, faltas: 5, situacao: "abaixo" },
    ],
  },
];

export function App() {
  const [tela, setTela] = useState<Tela>("dashboard");
  const [relatorioMotorPreselecionado, setRelatorioMotorPreselecionado] = useState<string | undefined>(undefined);
  const [definicaoParaEditar, setDefinicaoParaEditar] = useState<ReportDefinition | undefined>(undefined);
  const [menuAberto, setMenuAberto] = useState(false);
  const [buscaGlobalAberta, setBuscaGlobalAberta] = useState(false);
  const [nomeAlunoParaAbrir, setNomeAlunoParaAbrir] = useState<string | null>(null);
  const [modoReuniao, setModoReuniao] = useState(false);
  const [indiceAluno, setIndiceAluno] = useState(0);
  const [turmas, setTurmas] = useState<TurmaResumo[]>([]);
  const [turmaConfig, setTurmaConfig] = useState<TurmaConfig>({
    lider_ativo: true,
    lider_rotulo: "Líder de sala",
    elegivel_ativo: true,
    elegivel_rotulo: "Elegível",
    atendimento_tipos: TIPOS_ATENDIMENTO_PADRAO,
    encaminhamento_opcoes: ENCAMINHAMENTOS_PADRAO,
    mensagem_familia_templates: [],
    perfil_turma_ativo: false,
    perfil_turma_criterios: [],
    aluno_destaque_ativo: false,
    aluno_destaque_criterios: [],
  });
  const [turmaSelecionada, setTurmaSelecionada] = useState<TurmaResumo | null>(null);
  const [bimestreSelecionado, setBimestreSelecionado] = useState("1");
  const [bimestreOrigem, setBimestreOrigem] = useState<"manual" | "datas" | "dados" | "padrao">("padrao");
  const [configSecaoInicial, setConfigSecaoInicial] = useState<SettingsSection | undefined>(undefined);
  const [atendimentosTurmaInicial, setAtendimentosTurmaInicial] = useState<string | null>(null);
  const [turmaDetalhe, setTurmaDetalhe] = useState<TurmaDetalhe | null>(null);
  const [turmaRefreshKey, setTurmaRefreshKey] = useState(0);
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
  const lastSyncTime = useMemo(() => {
    const pub = perfilSync.lastPublishedAt ? new Date(perfilSync.lastPublishedAt).getTime() : 0;
    const pull = perfilSync.lastPulledAt ? new Date(perfilSync.lastPulledAt).getTime() : 0;
    return Math.max(pub, pull) || Date.now();
  }, [perfilSync.lastPublishedAt, perfilSync.lastPulledAt]);
  const alunosConselho = useMemo(() => {
    if (!turmaDetalhe?.alunos.length) {
      return alunosDemo;
    }

    return turmaDetalhe.alunos.map((aluno) => ({
      matricula: aluno.matricula,
      chamada: aluno.numero_chamada ?? 0,
      nome: aluno.nome,
      ativo: aluno.ativo,
      elegivel: aluno.elegivel,
      liderancaSala: aluno.lideranca_sala,
      deficiencias: aluno.deficiencias ?? [],
      comentarioEducacaoEspecial: aluno.comentario_educacao_especial,
      frequencia: aluno.frequencia_percentual,
      encaminhamentos: aluno.encaminhamentos,
      encaminhamentosBimestres: aluno.encaminhamentos_bimestres ?? [],
      deliberado: aluno.deliberado,
      atendimentos: aluno.atendimentos ?? [],
      responsaveis: aluno.responsaveis ?? [],
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
  // O conselho nunca exibe alunos inativos.
  const alunosConselhoAtivos = useMemo(
    () => alunosConselho.filter((aluno) => aluno.ativo !== false),
    [alunosConselho],
  );
  const aluno = alunosConselhoAtivos[Math.min(indiceAluno, alunosConselhoAtivos.length - 1)] ?? alunosDemo[0];
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

  function aplicarConfigCarregada(c: ConfiguracoesApp) {
    setTurmaConfig({
      lider_ativo: c.lider_ativo,
      lider_rotulo: c.lider_rotulo,
      elegivel_ativo: c.elegivel_ativo,
      elegivel_rotulo: c.elegivel_rotulo,
      atendimento_tipos: normalizarTiposAtendimento(c.atendimento_tipos),
      encaminhamento_opcoes: normalizarEncaminhamentos(c.encaminhamento_opcoes),
      mensagem_familia_templates: c.mensagem_familia_templates ?? [],
      perfil_turma_ativo: c.perfil_turma_ativo ?? false,
      perfil_turma_criterios: c.perfil_turma_criterios ?? [],
      aluno_destaque_ativo: c.aluno_destaque_ativo ?? false,
      aluno_destaque_criterios: c.aluno_destaque_criterios ?? [],
    });
  }

  useEffect(() => {
    if (!tauriDisponivel) return;
    invokeApp<ConfiguracoesApp>("carregar_configuracoes")
      .then(aplicarConfigCarregada)
      .catch(() => {});
  }, []);

  // Resolve o bimestre atual (pin manual → calendário → dados importados → 1º)
  // uma vez na abertura; as telas herdam esse valor.
  useEffect(() => {
    if (!tauriDisponivel) return;
    invokeApp<{ valor: string; origem: "manual" | "datas" | "dados" | "padrao" }>("resolver_bimestre_atual")
      .then((resp) => {
        setBimestreSelecionado(resp.valor);
        setBimestreOrigem(resp.origem);
      })
      .catch(() => {});
  }, []);

  // Muda o bimestre global. `pin` = fixar em Configurações; senão volta ao automático.
  function mudarBimestre(valor: string, pin: boolean) {
    setBimestreSelecionado(valor);
    setBimestreOrigem(pin ? "manual" : bimestreOrigem);
    if (!tauriDisponivel) return;
    invokeApp<{ valor: string; origem: "manual" | "datas" | "dados" | "padrao" }>("fixar_bimestre_pin", {
      valor: pin ? valor : "",
    })
      .then((resp) => {
        setBimestreSelecionado(resp.valor);
        setBimestreOrigem(resp.origem);
      })
      .catch(() => {});
  }

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
        const remotos = await invokeApp<WorkgroupSyncPayload[]>("carregar_estados_sincronizacao", {
          pasta: perfilSync.syncFolder,
          deviceId: perfilSync.userId,
        });
        const recebeu = remotos.length > 0;
        // Aplica o estado de cada dispositivo; a mesclagem é cumulativa e
        // converge mesmo que outro coordenador esteja offline.
        for (const remoto of remotos) {
          if (remoto) await aplicarPayloadSincronizacao(remoto);
        }
        const payload = await montarPayloadSincronizacao(perfilSync);
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
            lastSyncError: undefined,
            lastSyncErrorAt: undefined,
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
      } catch (err) {
        // A sincronização automática não interrompe o uso do app, mas o erro
        // fica visível na tela de Configurações — sem isso, uma falha
        // persistente (ex.: pasta compartilhada inválida numa máquina)
        // travava a publicação por meses sem que ninguém percebesse.
        console.error("Falha na sincronização automática de grupo:", err);
        if (!cancelado) {
          setPerfilSync((atual) => salvarPerfilSincronizacao({
            ...atual,
            lastSyncError: String(err),
            lastSyncErrorAt: new Date().toISOString(),
          }));
        }
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

  useEffect(() => {
    if (!mostrarNovidades) {
      return;
    }
    function aoPressionarEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        fecharNovidades();
      }
    }
    window.addEventListener("keydown", aoPressionarEsc);
    return () => window.removeEventListener("keydown", aoPressionarEsc);
  }, [mostrarNovidades, appInfo?.version]);

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

  function recarregarDadosTurmas() {
    invokeApp<TurmaResumo[]>("listar_turmas")
      .then((resultado) => {
        setTurmas(resultado);
        setTurmaSelecionada((atual) => atual ? resultado.find((item) => item.caminho === atual.caminho) ?? atual : atual);
      })
      .catch(() => {});
    setTurmaRefreshKey((atual) => atual + 1);
  }

  // Pendrive de conselho: na abertura, procura conselhos preparados e ainda não
  // reintegrados (nas unidades removíveis e nas pastas registradas no check-out).
  const [pendrivesConselho, setPendrivesConselho] = useState<PendriveConselhoDetectado[]>([]);
  const [mensagemPendrive, setMensagemPendrive] = useState("");
  const [reintegrandoPendrive, setReintegrandoPendrive] = useState(false);
  useEffect(() => {
    invokeApp<PendriveConselhoDetectado[]>("detectar_pendrives_conselho")
      .then(setPendrivesConselho)
      .catch(() => {});
  }, []);

  async function reintegrarPendriveDetectado(pendrive: PendriveConselhoDetectado) {
    if (reintegrandoPendrive) return;
    setReintegrandoPendrive(true);
    setMensagemPendrive("");
    try {
      const resultado = await invokeApp<{ turmas: number; bimestre: string; avisos: string[] }>(
        "reintegrar_pendrive_conselho",
        { pasta: pendrive.pasta },
      );
      const avisos = resultado.avisos.length ? ` Avisos: ${resultado.avisos.join(" ")}` : "";
      setMensagemPendrive(
        `Conselho do ${resultado.bimestre}º bimestre reintegrado: ${resultado.turmas} turma(s) atualizadas.${avisos}`,
      );
      setPendrivesConselho((atual) => atual.filter((item) => item.pasta !== pendrive.pasta));
      recarregarDadosTurmas();
    } catch (err) {
      setMensagemPendrive(String(err));
    } finally {
      setReintegrandoPendrive(false);
    }
  }

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
  }, [turmaSelecionada, bimestreSelecionado, turmaRefreshKey]);

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

  function salvarAlunoDeliberado(matricula: string, deliberado: boolean) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de marcar o aluno."));
    }

    return invokeApp<TurmaDetalhe>("salvar_aluno_deliberado", {
      caminho: turmaSelecionada.caminho,
      matricula,
      bimestre: turmaDetalhe.bimestre,
      deliberado,
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
      bimestre: turmaDetalhe?.bimestre ?? "1",
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

  function salvarAtendimentoAluno(matricula: string, input: AtendimentoAlunoInput) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar atendimento."));
    }
    return invokeApp<TurmaDetalhe>("salvar_atendimento_aluno", {
      caminho: turmaSelecionada.caminho,
      matricula,
      input,
      bimestre: turmaDetalhe.bimestre,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
    });
  }

  function salvarResponsaveisAluno(matricula: string, responsaveis: ResponsavelAluno[]) {
    if (!turmaSelecionada || !turmaDetalhe) {
      return Promise.reject(new Error("Selecione uma turma antes de salvar responsáveis."));
    }
    return invokeApp<TurmaDetalhe>("salvar_responsaveis_aluno", {
      caminho: turmaSelecionada.caminho,
      matricula,
      input: { responsaveis },
      bimestre: turmaDetalhe.bimestre,
    }).then((detalheAtualizado) => {
      setTurmaDetalhe(detalheAtualizado);
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
      if (proximo < 0) return alunosConselhoAtivos.length - 1;
      if (proximo >= alunosConselhoAtivos.length) return 0;
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
  }, [tela, alunosConselhoAtivos.length]);

  useEffect(() => {
    function abrirBusca(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setBuscaGlobalAberta((aberta) => !aberta);
      }
    }
    window.addEventListener("keydown", abrirBusca);
    return () => window.removeEventListener("keydown", abrirBusca);
  }, []);

  function navegarPara(proximaTela: Tela) {
    setTela(proximaTela);
    setMenuAberto(false);
    if (proximaTela !== "conselho") {
      setModoReuniao(false);
      invokeApp("definir_fullscreen", { ativo: false }).catch(() => {});
    }
  }

  return (
    <main
      className={`app-shell ${temaEscuro ? "theme-dark" : "theme-light"} ${modoReuniao ? "meeting-mode-shell" : ""} ${
        tela === "construtor-relatorio" ? "no-sidebar-shell" : ""
      }`}
    >
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
          <NavButton
            icon={<MessageCircle size={18} />}
            label="Atendimentos"
            active={tela === "atendimentos"}
            onClick={() => navegarPara("atendimentos")}
            badge={turmas.reduce((soma, t) => soma + (t.followups_pendentes ?? 0), 0)}
          />
          <NavButton icon={<Upload size={18} />} label="Importar Dados" active={tela === "importar-dados" || tela === "importar-notas" || tela === "importar-elegiveis" || tela === "importar-diagnostico" || tela === "importar-fotos" || tela === "importar-alunos-lote"} onClick={() => navegarPara("importar-dados")} />
          <NavButton icon={<BookOpen size={18} />} label="Conselho" active={tela === "conselhos" || tela === "conselho"} onClick={() => navegarPara("conselhos")} />
          <NavButton icon={<BookMarked size={18} />} label="PEI" active={tela === "pei"} onClick={() => navegarPara("pei")} />
          <NavButton icon={<NotebookPen size={18} />} label="Planejamento" active={tela === "planejamento"} onClick={() => navegarPara("planejamento")} />
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
          <NavButton icon={<FileText size={18} />} label="Relatórios" active={tela === "relatorios" || tela === "relatorio-atendimentos" || tela === "relatorio-motor" || tela === "construtor-relatorio" || tela === "repositorio-relatorios"} onClick={() => navegarPara("relatorios")} />
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
            {perfilSync.syncEnabled
              ? <SyncIndicator lastSyncTime={lastSyncTime} />
              : <small>{perfilSync.role || "Equipe pedagogica"}</small>
            }
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
        {["dashboard", "turmas", "gestao-turma", "atendimentos", "conselhos", "relatorios", "relatorio-atendimentos", "planejamento", "pei"].includes(tela) && (
          <div className="bimestre-switcher">
            <span>Bimestre atual</span>
            <select
              value={bimestreSelecionado}
              onChange={(e) => mudarBimestre(e.target.value, true)}
              title={
                bimestreOrigem === "manual" ? "Fixado manualmente"
                : bimestreOrigem === "datas" ? "Definido pelo calendário em Configurações"
                : bimestreOrigem === "dados" ? "Inferido pelo maior bimestre já importado"
                : "Padrão (nada configurado)"
              }
            >
              <option value="1">1º bimestre</option>
              <option value="2">2º bimestre</option>
              <option value="3">3º bimestre</option>
              <option value="4">4º bimestre</option>
            </select>
            {bimestreOrigem !== "manual" ? (
              <small>automático</small>
            ) : (
              <button type="button" className="ghost-action" onClick={() => mudarBimestre(bimestreSelecionado, false)}>
                voltar ao automático
              </button>
            )}
          </div>
        )}
        {pendrivesConselho.map((pendrive) => (
          <div key={pendrive.pasta} className="data-warning neutral pendrive-detectado">
            <Usb size={17} />
            <span>
              Conselho do {pendrive.bimestre}º bimestre encontrado no pendrive
              {pendrive.turmas.length ? ` (${pendrive.turmas.join(", ")})` : ""}. Reintegrar os dados
              agora?
            </span>
            <button onClick={() => reintegrarPendriveDetectado(pendrive)} disabled={reintegrandoPendrive}>
              {reintegrandoPendrive ? "Reintegrando…" : "Reintegrar"}
            </button>
            <button
              className="ghost-action"
              onClick={() => setPendrivesConselho((atual) => atual.filter((item) => item.pasta !== pendrive.pasta))}
            >
              Agora não
            </button>
          </div>
        ))}
        {mensagemPendrive && (
          <div className="data-warning neutral">
            {mensagemPendrive}
            <button className="ghost-action" onClick={() => setMensagemPendrive("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {tela === "dashboard" && (
          <Dashboard
            turmas={turmas}
            erroTurmas={erroTurmas}
            onAbrirBusca={() => setBuscaGlobalAberta(true)}
            onOpenTurmas={() => navegarPara("turmas")}
            onOpenKanban={() => navegarPara("kanban")}
            onOpenCalendario={() => navegarPara("calendario")}
            onImportarAlunosLote={() => navegarPara("importar-alunos-lote")}
          />
        )}
        {tela === "conselhos" && (
          <SelecaoConselho turmas={turmas} erroTurmas={erroTurmas} turmaConfig={turmaConfig} bimestreSelecionado={bimestreSelecionado} aoAtualizarDados={recarregarDadosTurmas} onConfigSalva={aplicarConfigCarregada} onSelecionar={(turma) => {
            setTurmaSelecionada(turma);
            navegarPara("conselho");
          }} />
        )}
        {tela === "conselho" && (
          <Council
            aluno={aluno}
            turmaConfig={turmaConfig}
            alunos={alunosConselhoAtivos}
            totalAlunos={alunosConselhoAtivos.length}
            indiceAluno={indiceAluno}
            resumo={resumo}
            turmaSelecionada={turmaSelecionada}
            turmaDetalhe={turmaDetalhe}
            bimestreSelecionado={bimestreSelecionado}
            setBimestreSelecionado={(v) => mudarBimestre(v, true)}
            erroConselho={erroConselho}
            selecionarAluno={selecionarAluno}
            salvarAjustesMedia={salvarAjustesMedia}
            salvarEncaminhamentos={salvarEncaminhamentos}
            salvarAlunoDeliberado={salvarAlunoDeliberado}
            modoReuniao={modoReuniao}
            setModoReuniao={setModoReuniao}
            aoAtualizarDados={recarregarDadosTurmas}
          />
        )}
        {tela === "turmas" && (
          <Turmas
            turmas={turmas}
            erroTurmas={erroTurmas}
            onCriarTurma={criarTurma}
            onEditarTurma={editarTurma}
            onExcluirTurma={excluirTurma}
            onConfigSalva={aplicarConfigCarregada}
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
            turmaConfig={turmaConfig}
            nomeAlunoInicial={nomeAlunoParaAbrir}
            onVoltar={() => navegarPara("turmas")}
            onSalvarCoordenador={salvarCoordenadorTurma}
            onSalvarElegibilidade={salvarElegibilidadeAluno}
            onSalvarLideranca={salvarLiderancaAluno}
            onSalvarEducacaoEspecial={salvarEducacaoEspecialAluno}
            onSalvarAtendimento={salvarAtendimentoAluno}
            onSalvarResponsaveis={salvarResponsaveisAluno}
            onOpenKanban={() => navegarPara("kanban")}
            onAbrirTelaAtendimentos={() => {
              setAtendimentosTurmaInicial(turmaSelecionada?.codigo ?? null);
              navegarPara("atendimentos");
            }}
          />
        )}
        {tela === "atendimentos" && (
          <TelaAtendimentos
            turmas={turmas}
            bimestre={bimestreSelecionado}
            turmaCodigoInicial={atendimentosTurmaInicial}
            tiposAtendimento={turmaConfig.atendimento_tipos}
            mensagemTemplates={turmaConfig.mensagem_familia_templates}
            onAtivarEnvioAutomatico={() => {
              setConfigSecaoInicial("whatsapp");
              navegarPara("configuracoes");
            }}
            onAbrirFichaAluno={(turmaCodigo, alunoNome) => {
              const alvo = turmas.find((t) => t.codigo === turmaCodigo);
              if (!alvo) return;
              setNomeAlunoParaAbrir(alunoNome);
              setTurmaSelecionada(alvo);
              navegarPara("gestao-turma");
            }}
          />
        )}
        {tela === "importar-dados" && (
          <ImportarDados
            onImportarNotas={() => navegarPara("importar-notas")}
            onImportarElegiveis={() => navegarPara("importar-elegiveis")}
            onImportarDiagnostico={() => navegarPara("importar-diagnostico")}
            onImportarFotos={() => navegarPara("importar-fotos")}
            onImportarAlunosLote={() => navegarPara("importar-alunos-lote")}
            onImportarTarefas={() => navegarPara("importar-tarefas")}
            onImportarProvaPaulista={() => navegarPara("importar-prova-paulista")}
            onImportarExpansoes={() => navegarPara("importar-expansoes")}
          />
        )}
        {tela === "importar-fotos" && <ImportarFotos />}
        {tela === "importar-alunos-lote" && (
          <ImportarAlunosLote onAplicado={() => setTurmaRefreshKey((k) => k + 1)} />
        )}
        {tela === "importar-tarefas" && (
          <ImportarTarefas onAplicado={() => setTurmaRefreshKey((k) => k + 1)} />
        )}
        {tela === "importar-prova-paulista" && (
          <ImportarProvaPaulista onAplicado={() => setTurmaRefreshKey((k) => k + 1)} />
        )}
        {tela === "importar-expansoes" && (
          <ImportarExpansoes onAplicado={() => setTurmaRefreshKey((k) => k + 1)} />
        )}
        {tela === "importar-notas" && (
          <ImportarNotas
            turmas={turmas}
            onAplicado={() => setTurmaRefreshKey((k) => k + 1)}
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
        {tela === "configuracoes" && <Configuracoes turmas={turmas} perfilSync={perfilSync} onPerfilSyncChange={atualizarPerfilSync} onAbrirAssistenteSync={() => setMostrarAssistenteSync(true)} onConfigSalva={aplicarConfigCarregada} secaoInicial={configSecaoInicial} onDadosAlterados={() => {
          invokeApp<TurmaResumo[]>("listar_turmas").then(setTurmas).catch(() => {});
        }} />}
        {tela === "relatorios" && (
          <RelatoriosMenu
            onAbrirRelatorioMotor={(definicaoId) => {
              setRelatorioMotorPreselecionado(definicaoId);
              navegarPara("relatorio-motor");
            }}
            onAbrirAtendimentos={() => navegarPara("relatorio-atendimentos")}
            onCriarRelatorio={() => {
              setDefinicaoParaEditar(undefined);
              navegarPara("construtor-relatorio");
            }}
            onAbrirRepositorio={() => navegarPara("repositorio-relatorios")}
            onEditarRelatorio={(definicaoId) => {
              invokeApp<ReportDefinition[]>("listar_definicoes_relatorio")
                .then((lista) => {
                  const encontrada = lista.find((definicao) => definicao.id === definicaoId);
                  setDefinicaoParaEditar(encontrada);
                  navegarPara("construtor-relatorio");
                })
                .catch(() => {});
            }}
          />
        )}
        {tela === "relatorio-atendimentos" && <RelatorioAtendimentos onVoltar={() => navegarPara("relatorios")} />}
        {tela === "repositorio-relatorios" && <RepositorioRelatorios onVoltar={() => navegarPara("relatorios")} />}
        {tela === "relatorio-motor" && (
          <MotorRelatorios definicaoIdInicial={relatorioMotorPreselecionado} onVoltar={() => navegarPara("relatorios")} />
        )}
        {tela === "construtor-relatorio" && (
          <ConstrutorRelatorio
            definicaoInicial={definicaoParaEditar}
            turmas={turmas.map((turma) => ({ codigo: turma.codigo, serie: turma.serie }))}
            onVoltar={() => navegarPara("relatorios")}
            onSalvo={() => navegarPara("relatorios")}
          />
        )}
        {tela === "pei" && <TelaPEI turmas={turmas} onTurmasAlteradas={recarregarDadosTurmas} />}
        {tela === "planejamento" && <TelaPlanejamento turmas={turmas} />}
      </section>
      {buscaGlobalAberta && (
        <BuscaGlobal
          turmas={turmas}
          onFechar={() => setBuscaGlobalAberta(false)}
          onAbrirTurma={(turma) => {
            setNomeAlunoParaAbrir(null);
            setTurmaSelecionada(turma);
            navegarPara("gestao-turma");
            setBuscaGlobalAberta(false);
          }}
          onAbrirAluno={(turma, nome) => {
            setNomeAlunoParaAbrir(nome);
            setTurmaSelecionada(turma);
            navegarPara("gestao-turma");
            setBuscaGlobalAberta(false);
          }}
          onNavegar={(tela) => {
            navegarPara(tela as Tela);
            setBuscaGlobalAberta(false);
          }}
          onAbrirConselho={(turma) => {
            setTurmaSelecionada(turma);
            navegarPara("conselhos");
            setBuscaGlobalAberta(false);
          }}
        />
      )}
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
        <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) fecharNovidades(); }}>
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
        <AssistenteConfiguracaoInicial
          perfil={perfilSync}
          turmasCount={turmas.length}
          onCriarTurma={criarTurma}
          onAbrirTelaTurmas={() => {
            atualizarPerfilSync({ ...perfilSync, onboarding: "dismissed" });
            setMostrarAssistenteSync(false);
            navegarPara("turmas");
          }}
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

function computeSyncLabel(lastSyncTime: number): string {
  const mins = Math.floor((Date.now() - lastSyncTime) / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins === 1) return "há 1 min";
  return `há ${mins} min`;
}

function useSyncLabel(lastSyncTime: number): string {
  const [label, setLabel] = useState(() => computeSyncLabel(lastSyncTime));

  useEffect(() => {
    setLabel(computeSyncLabel(lastSyncTime));
    const timer = setInterval(() => setLabel(computeSyncLabel(lastSyncTime)), 30_000);
    return () => clearInterval(timer);
  }, [lastSyncTime]);

  return label;
}

function SyncIndicator({ lastSyncTime }: { lastSyncTime: number }) {
  const label = useSyncLabel(lastSyncTime);
  return (
    <div className="sync-indicator">
      <span className="sync-dot-wrapper">
        <span className="sync-ring" />
        <span className="sync-dot" />
      </span>
      <small>{`Sincronizado · ${label}`}</small>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {label}
      {badge != null && badge > 0 && <span className="nav-item-badge">{badge}</span>}
    </button>
  );
}
