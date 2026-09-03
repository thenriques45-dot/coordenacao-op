import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { invokeApp, tauriDisponivel } from "./appBridge";
import { ConfigEnvioAutomatico } from "./atendimentos/ConfigEnvioAutomatico";
import { EquipeGestoraSecao } from "./EquipeGestoraSecao";
import {
  aplicarPadroesDoProvedor,
  carregarAiAssistantSettings,
  rotuloAiProvider,
  salvarAiAssistantSettings,
  testarAiAssistant,
  type AiProvider,
  type AiAssistantSettings,
} from "./aiAssistant";
import {
  aplicarPayloadSincronizacao,
  montarPayloadSincronizacao,
  type WorkgroupSyncPayload,
  type WorkgroupSyncProfile,
} from "./workgroupSync";

type TurmaConfiguracoes = {
  ciclo: string | null;
};

type GrupoDisciplinaDuplicada = {
  forma_canonica: string;
  grafias: string[];
  turmas: string[];
  alunos_afetados: number;
};

export type OpcaoCriterioPerfil = {
  nivel: string;
  label: string;
};

export type CriterioPerfil = {
  id: string;
  nome: string;
  opcoes: OpcaoCriterioPerfil[];
};

export type CriterioDestaque = {
  id: string;
  titulo: string;
  icone: string;
};

export type OpcaoEncaminhamento = {
  numero: number;
  texto: string;
};

export type MensagemTemplate = {
  id: string;
  titulo: string;
  corpo: string;
  tags: string[];
};

// Variáveis interpoláveis nos templates de mensagem à família. `chave` é o
// que aparece entre chaves no corpo ({aluno}); a tela do aluno substitui
// pelos valores reais resolvidos pelo comando `resolver_variaveis_mensagem`.
export const VARIAVEIS_MENSAGEM: { chave: string; rotulo: string }[] = [
  { chave: "aluno", rotulo: "Primeiro nome do estudante" },
  { chave: "aluno_completo", rotulo: "Nome completo do estudante" },
  { chave: "turma", rotulo: "Turma" },
  { chave: "serie", rotulo: "Série" },
  { chave: "bimestre", rotulo: "Bimestre" },
  { chave: "responsavel", rotulo: "Nome do responsável (destinatário)" },
  { chave: "tarefas_pendentes", rotulo: "Tarefas pendentes no bimestre" },
  { chave: "tarefas_feitas", rotulo: "Tarefas concluídas no bimestre" },
  { chave: "tarefas_total", rotulo: "Total de tarefas no bimestre" },
  { chave: "frequencia", rotulo: "Frequência anual (%)" },
  { chave: "faltas", rotulo: "Faltas no bimestre" },
  { chave: "media_global", rotulo: "Média global do bimestre" },
  { chave: "disciplinas_abaixo", rotulo: "Disciplinas abaixo da média" },
  { chave: "expansao_progresso", rotulo: "Expansão — progresso atual (%)" },
  { chave: "expansao_dias_sem_acesso", rotulo: "Expansão — dias sem acessar" },
  { chave: "expansao_ultimo_acesso", rotulo: "Expansão — data do último acesso" },
  { chave: "direcao", rotulo: "Nome da direção" },
  { chave: "data_extenso", rotulo: "Data de hoje por extenso" },
];

export const MENSAGEM_TEMPLATES_PADRAO: MensagemTemplate[] = [
  {
    id: "padrao-1",
    titulo: "Cobrança de tarefas",
    corpo:
      "Prezado(a) responsável por {aluno},\n\nVerificamos que o(a) estudante está com {tarefas_pendentes} tarefa(s) pendente(s) no {bimestre} ({tarefas_feitas} de {tarefas_total} concluídas).\n\nPedimos que acompanhe a realização das atividades. Permanecemos à disposição.\n\nAtenciosamente,\nCoordenação Pedagógica — {turma}",
    tags: ["Tarefas"],
  },
  {
    id: "padrao-2",
    titulo: "Excesso de faltas",
    corpo:
      "Prezado(a) responsável por {aluno},\n\nO(A) estudante {aluno_completo} está com frequência de {frequencia} no {bimestre}. O acompanhamento da frequência é essencial para o bom desempenho escolar.\n\nSolicitamos contato com a escola para conversarmos sobre a situação.\n\nAtenciosamente,\nCoordenação Pedagógica — {turma}",
    tags: ["Faltas"],
  },
  {
    id: "padrao-3",
    titulo: "Tarefas + Expansão",
    corpo:
      "Prezado(a) responsável por {aluno},\n\nRegistramos dois pontos de atenção no {bimestre}:\n- Tarefas: {tarefas_pendentes} pendente(s) ({tarefas_feitas} de {tarefas_total}).\n- Expansão: {expansao_dias_sem_acesso} dia(s) sem acesso à plataforma (último acesso em {expansao_ultimo_acesso}).\n\nContamos com o apoio da família no acompanhamento das atividades.\n\nAtenciosamente,\nCoordenação Pedagógica — {turma}",
    tags: ["Tarefas", "Expansão"],
  },
  {
    id: "padrao-4",
    titulo: "Convocação de responsável",
    corpo:
      "Prezado(a) responsável por {aluno},\n\nSolicitamos seu comparecimento à escola para tratarmos da vida escolar do(a) estudante {aluno_completo}, da turma {turma}.\n\nPor favor, entre em contato para agendarmos o melhor horário.\n\nAtenciosamente,\nCoordenação Pedagógica",
    tags: ["Convocação"],
  },
];

// "F" | "M" | "" (não informado → formas neutras nos textos gerados).
export type GeneroEquipe = "F" | "M" | "";

export type MembroEquipe = {
  id: string;
  nome: string;
  genero: GeneroEquipe;
};

// Escolha manual de com quem casar um membro do grupo de trabalho.
// membro_id "" = "não vincular". O casamento automático (nome compatível) não
// entra aqui — é resolvido ao vivo.
export type VinculoMembroEquipe = {
  nome_curto: string;
  membro_id: string;
};

export type EquipeGestora = {
  direcao: MembroEquipe;
  vices: MembroEquipe[];
  coordenacoes: MembroEquipe[];
  vinculos: VinculoMembroEquipe[];
  atualizado_em: string;
};

export function equipeGestoraVazia(): EquipeGestora {
  return {
    direcao: { id: "direcao", nome: "", genero: "" },
    vices: [],
    coordenacoes: [],
    vinculos: [],
    atualizado_em: "",
  };
}

export type ConfiguracoesApp = {
  direcao_nome: string;
  direcao_pronome: string;
  equipe_gestora: EquipeGestora;
  nota_minima: number;
  cabecalho_ata: string | null;
  lider_ativo: boolean;
  lider_rotulo: string;
  elegivel_ativo: boolean;
  elegivel_rotulo: string;
  atendimento_tipos: string[];
  encaminhamento_opcoes: OpcaoEncaminhamento[];
  mensagem_familia_templates: MensagemTemplate[];
  perfil_turma_ativo: boolean;
  perfil_turma_criterios: CriterioPerfil[];
  aluno_destaque_ativo: boolean;
  aluno_destaque_criterios: CriterioDestaque[];
  modo_notas_ata: ModoNotasAta;
  prazo_1_semestre: string;
  prazo_2_semestre: string;
  /** Datas de início de cada bimestre (ISO "AAAA-MM-DD" ou ""); sempre 4 posições. */
  bimestre_datas_inicio: string[];
  /** "" = bimestre atual automático; "1".."4" = fixo. */
  bimestre_pin: string;
};

export type ModoNotasAta = "x_vermelhas" | "todas" | "somente_vermelhas";

export const opcoesModoNotasAta: { valor: ModoNotasAta; rotulo: string }[] = [
  { valor: "x_vermelhas", rotulo: "Mostrar X nas notas vermelhas" },
  { valor: "todas", rotulo: "Mostrar todas as notas" },
  { valor: "somente_vermelhas", rotulo: "Mostrar apenas notas vermelhas" },
];

export const ENCAMINHAMENTOS_PADRAO: OpcaoEncaminhamento[] = [
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

type BackupResultado = {
  caminho: string | null;
  arquivos: number;
  arquivos_importados: number;
  conflitos: string[];
  backup_seguranca: string | null;
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

type DiagnosticoIaLocal = {
  ollama_instalado: boolean;
  servidor_ativo: boolean;
  modelo_instalado: boolean;
  modelos: string[];
  mensagem: string;
};

export type SettingsSection =
  | "visao-geral"
  | "instituicao"
  | "turmas"
  | "equipe-gestora"
  | "conselho-perfil"
  | "conselho-destaque"
  | "conselho-encaminhamentos"
  | "conselho-notas"
  | "perfil-dispositivo"
  | "sincronizacao"
  | "backup"
  | "manutencao-dados"
  | "atualizacao"
  | "assistente"
  | "whatsapp";

// Índice de busca da tela (handoff v2 — busca casa seção E campo). Uma entrada
// por seção; entradas com `campo` apontam para um id de elemento (`ancora`)
// que a busca rola até a vista e destaca por um instante.
export type IndiceConfig = {
  secao: SettingsSection;
  grupo: string;
  secaoLabel: string;
  campo?: string;
  ancora?: string;
};

// Grupos e destinos da nav (4 grupos, nomes que dizem a natureza do ajuste).
export const GRUPOS_CONFIG: Array<{ titulo: string; itens: Array<{ id: SettingsSection; label: string }> }> = [
  {
    titulo: "Institucional",
    itens: [
      { id: "instituicao", label: "Instituição" },
      { id: "turmas", label: "Turmas" },
      { id: "equipe-gestora", label: "Equipe gestora" },
    ],
  },
  {
    titulo: "Conselho",
    itens: [
      { id: "conselho-perfil", label: "Perfil da turma" },
      { id: "conselho-destaque", label: "Aluno destaque" },
      { id: "conselho-encaminhamentos", label: "Encaminhamentos" },
      { id: "conselho-notas", label: "Notas na ATA" },
    ],
  },
  {
    titulo: "Este computador",
    itens: [
      { id: "perfil-dispositivo", label: "Perfil e dispositivo" },
      { id: "sincronizacao", label: "Sincronização" },
      { id: "backup", label: "Backup" },
      { id: "atualizacao", label: "Atualização" },
      { id: "manutencao-dados", label: "Manutenção de dados" },
    ],
  },
  {
    titulo: "Integrações",
    itens: [
      { id: "assistente", label: "Assistente pedagógico" },
      { id: "whatsapp", label: "WhatsApp" },
    ],
  },
];

const GRUPO_DA_SECAO: Record<SettingsSection, string> = (() => {
  const mapa = {} as Record<SettingsSection, string>;
  mapa["visao-geral"] = "";
  for (const grupo of GRUPOS_CONFIG) for (const item of grupo.itens) mapa[item.id] = grupo.titulo;
  return mapa;
})();

const LABEL_DA_SECAO: Record<SettingsSection, string> = (() => {
  const mapa = {} as Record<SettingsSection, string>;
  mapa["visao-geral"] = "Visão geral";
  for (const grupo of GRUPOS_CONFIG) for (const item of grupo.itens) mapa[item.id] = item.label;
  return mapa;
})();

// Campos indexados pela busca, além das seções. `ancora` = id do elemento.
const CAMPOS_INDEXADOS: Array<{ secao: SettingsSection; campo: string; ancora?: string }> = [
  { secao: "equipe-gestora", campo: "Nome e gênero da direção", ancora: "cfg-equipe-direcao" },
  { secao: "equipe-gestora", campo: "Vice-direção", ancora: "cfg-equipe-vices" },
  { secao: "equipe-gestora", campo: "Coordenação", ancora: "cfg-equipe-coordenacoes" },
  { secao: "equipe-gestora", campo: "Vincular membros do grupo de trabalho", ancora: "cfg-equipe-vinculos" },
  { secao: "instituicao", campo: "Cabeçalho dos documentos", ancora: "cfg-instituicao-cabecalho" },
  { secao: "instituicao", campo: "Calendário letivo", ancora: "cfg-instituicao-ciclo" },
  { secao: "instituicao", campo: "Datas dos bimestres", ancora: "cfg-instituicao-bimestres" },
  { secao: "instituicao", campo: "Média mínima (nota vermelha)", ancora: "cfg-instituicao-ciclo" },
  { secao: "turmas", campo: "Líder de sala", ancora: "cfg-turmas-campos" },
  { secao: "turmas", campo: "Elegível", ancora: "cfg-turmas-campos" },
  { secao: "turmas", campo: "Tipos de atendimento", ancora: "cfg-turmas-tipos" },
  { secao: "conselho-notas", campo: "Modo de exibição das notas", ancora: "cfg-notas-minima" },
  { secao: "sincronizacao", campo: "Pasta compartilhada", ancora: "cfg-sync-pasta" },
  { secao: "sincronizacao", campo: "Turmas e alunos", ancora: "cfg-sync-institucional" },
  { secao: "assistente", campo: "Chave da API do assistente" },
  { secao: "whatsapp", campo: "Token permanente da Meta", ancora: "cfg-whatsapp-token" },
  { secao: "whatsapp", campo: "ID do número de telefone", ancora: "cfg-whatsapp-token" },
  { secao: "atualizacao", campo: "Iniciar com o Windows" },
];

export function construirIndiceBusca(): IndiceConfig[] {
  const entradas: IndiceConfig[] = [];
  for (const grupo of GRUPOS_CONFIG) {
    for (const item of grupo.itens) {
      entradas.push({ secao: item.id, grupo: grupo.titulo, secaoLabel: item.label });
    }
  }
  for (const c of CAMPOS_INDEXADOS) {
    entradas.push({
      secao: c.secao,
      grupo: GRUPO_DA_SECAO[c.secao],
      secaoLabel: LABEL_DA_SECAO[c.secao],
      campo: c.campo,
      ancora: c.ancora,
    });
  }
  return entradas;
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

// Ultimo backup feito NESTE computador - registro local, so para o aviso de
// manutencao da Visao geral. Nao substitui o backup em si.
const CHAVE_ULTIMO_BACKUP = "coordenacaoop:ultimo-backup";
function registrarBackupFeito(ciclos: string[]) {
  try {
    localStorage.setItem(CHAVE_ULTIMO_BACKUP, JSON.stringify({ em: new Date().toISOString(), ciclos }));
  } catch {
    /* localStorage indisponivel - sem aviso, tudo bem */
  }
}
function lerUltimoBackup(): { em: string; ciclos: string[] } | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ULTIMO_BACKUP);
    if (!bruto) return null;
    const dado = JSON.parse(bruto) as { em?: unknown; ciclos?: unknown };
    if (dado && typeof dado.em === "string") {
      return { em: dado.em, ciclos: Array.isArray(dado.ciclos) ? (dado.ciclos as string[]) : [] };
    }
  } catch {
    /* valor corrompido - ignora */
  }
  return null;
}
function diasDesde(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function rotuloCiclo(ciclo: string) {
  const rotulos: Record<string, string> = {
    EI: "Educação Infantil",
    EFAI: "Anos iniciais",
    EFAF: "Anos finais",
    EM: "Ensino médio",
    "Sem ciclo": "Sem ciclo",
  };
  return rotulos[ciclo] ?? ciclo;
}
function pluralizar(quantidade: number, singular: string, plural: string) {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

export function Configuracoes({
  turmas,
  perfilSync,
  onPerfilSyncChange,
  onAbrirAssistenteSync,
  onDadosAlterados,
  onConfigSalva,
  secaoInicial,
}: {
  turmas: TurmaConfiguracoes[];
  perfilSync: WorkgroupSyncProfile;
  onPerfilSyncChange: (perfil: WorkgroupSyncProfile) => void;
  onAbrirAssistenteSync: () => void;
  onDadosAlterados: () => void;
  onConfigSalva: (config: ConfiguracoesApp) => void;
  secaoInicial?: SettingsSection;
}) {
  const [config, setConfig] = useState<ConfiguracoesApp>({
    direcao_nome: "",
    direcao_pronome: "F",
    equipe_gestora: equipeGestoraVazia(),
    nota_minima: 5,
    cabecalho_ata: null,
    lider_ativo: true,
    lider_rotulo: "Líder de sala",
    elegivel_ativo: true,
    elegivel_rotulo: "Elegível",
    atendimento_tipos: ["Disciplinar", "Dúvidas", "Pedagógico", "Financeiro", "Educação especial"],
    encaminhamento_opcoes: ENCAMINHAMENTOS_PADRAO,
    mensagem_familia_templates: MENSAGEM_TEMPLATES_PADRAO,
    perfil_turma_ativo: false,
    perfil_turma_criterios: [],
    aluno_destaque_ativo: false,
    aluno_destaque_criterios: [],
    modo_notas_ata: "x_vermelhas",
    prazo_1_semestre: "",
    prazo_2_semestre: "",
    bimestre_datas_inicio: ["", "", "", ""],
    bimestre_pin: "",
  });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);
  const [atualizacao, setAtualizacao] = useState<Update | null>(null);
  const [ciclosBackup, setCiclosBackup] = useState<string[]>(["todos"]);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const [avatarOrigem, setAvatarOrigem] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiAssistantSettings>(() => carregarAiAssistantSettings());
  const [aiStatus, setAiStatus] = useState<DiagnosticoIaLocal | null>(null);
  const [verificandoIa, setVerificandoIa] = useState(false);
  const [acaoIa, setAcaoIa] = useState<"iniciar" | "baixar" | "testar" | null>(null);
  const [mostrarIaAvancado, setMostrarIaAvancado] = useState(false);
  const [secaoConfig, setSecaoConfig] = useState<SettingsSection>(secaoInicial ?? "visao-geral");
  const [autostartAtivo, setAutostartAtivo] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaFoco, setBuscaFoco] = useState(false);
  const [buscaIndiceAtivo, setBuscaIndiceAtivo] = useState(0);
  const [ancoraDestacada, setAncoraDestacada] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement | null>(null);
  const indiceBusca = useMemo(() => construirIndiceBusca(), []);
  const resultadosBusca = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (!termo) return [];
    return indiceBusca
      .filter((e) => {
        const alvo = semAcento(`${e.campo ?? ""} ${e.secaoLabel} ${e.grupo}`);
        return alvo.includes(termo);
      })
      .slice(0, 8);
  }, [busca, indiceBusca]);

  function irParaResultado(resultado: IndiceConfig) {
    setSecaoConfig(resultado.secao);
    setBusca("");
    setBuscaFoco(false);
    setBuscaIndiceAtivo(0);
    if (resultado.ancora) {
      const ancora = resultado.ancora;
      window.setTimeout(() => {
        document.getElementById(ancora)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setAncoraDestacada(ancora);
      }, 60);
    }
  }

  useEffect(() => {
    if (!ancoraDestacada) return;
    const alvo = document.getElementById(ancoraDestacada);
    if (!alvo) return;
    alvo.classList.add("cfg-ancora-destacada");
    const limpar = window.setTimeout(() => {
      alvo.classList.remove("cfg-ancora-destacada");
      setAncoraDestacada(null);
    }, 1900);
    return () => {
      window.clearTimeout(limpar);
      alvo.classList.remove("cfg-ancora-destacada");
    };
  }, [ancoraDestacada]);

  function aoTeclarNaBusca(evento: ReactKeyboardEvent<HTMLInputElement>) {
    if (!resultadosBusca.length) {
      if (evento.key === "Escape") buscaRef.current?.blur();
      return;
    }
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setBuscaIndiceAtivo((i) => (i + 1) % resultadosBusca.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setBuscaIndiceAtivo((i) => (i - 1 + resultadosBusca.length) % resultadosBusca.length);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const escolhido = resultadosBusca[buscaIndiceAtivo] ?? resultadosBusca[0];
      if (escolhido) irParaResultado(escolhido);
    } else if (evento.key === "Escape") {
      evento.preventDefault();
      setBusca("");
      setBuscaFoco(false);
      buscaRef.current?.blur();
    }
  }
  const [duplicatasDisciplinas, setDuplicatasDisciplinas] = useState<GrupoDisciplinaDuplicada[] | null>(null);
  const [processandoDuplicatas, setProcessandoDuplicatas] = useState(false);
  const [mensagemDuplicatas, setMensagemDuplicatas] = useState("");
  const ciclosExistentes = useMemo(() => {
    const ciclos = Array.from(new Set(turmas.map((turma) => turma.ciclo || "Sem ciclo").filter(Boolean)));
    return ciclos.sort((a, b) => rotuloCiclo(a).localeCompare(rotuloCiclo(b), "pt-BR", { numeric: true }));
  }, [turmas]);

  useEffect(() => {
    invokeApp<ConfiguracoesApp>("carregar_configuracoes")
      .then(setConfig)
      .catch((err) => setErro(String(err)));
    invokeApp<AppInfo>("app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
    if (tauriDisponivel) {
      autostartIsEnabled().then(setAutostartAtivo).catch(() => {});
    }
  }, []);

  useEffect(() => {
    setCiclosBackup((atuais) => {
      if (atuais.includes("todos")) return atuais;
      const validos = atuais.filter((ciclo) => ciclosExistentes.includes(ciclo));
      return validos.length ? validos : ["todos"];
    });
  }, [ciclosExistentes]);

  useEffect(() => {
    if (secaoConfig === "assistente" && tauriDisponivel && aiSettings.provider === "ollama") {
      verificarIaLocal(false);
    }
  }, [secaoConfig, aiSettings.provider]);

  function adicionarTipoAtendimento() {
    setConfig((atual) => ({
      ...atual,
      atendimento_tipos: [...atual.atendimento_tipos, ""],
    }));
  }

  function atualizarTipoAtendimento(indice: number, valor: string) {
    setConfig((atual) => ({
      ...atual,
      atendimento_tipos: atual.atendimento_tipos.map((item, i) => i === indice ? valor : item),
    }));
  }

  function removerTipoAtendimento(indice: number) {
    setConfig((atual) => ({
      ...atual,
      atendimento_tipos: atual.atendimento_tipos.filter((_, i) => i !== indice),
    }));
  }

  function adicionarEncaminhamento() {
    setConfig((atual) => {
      const proximoNumero = atual.encaminhamento_opcoes.reduce((max, item) => Math.max(max, item.numero), 0) + 1;
      return {
        ...atual,
        encaminhamento_opcoes: [...atual.encaminhamento_opcoes, { numero: proximoNumero, texto: "" }],
      };
    });
  }

  function atualizarEncaminhamento(indice: number, valor: string) {
    setConfig((atual) => ({
      ...atual,
      encaminhamento_opcoes: atual.encaminhamento_opcoes.map((item, i) => i === indice ? { ...item, texto: valor } : item),
    }));
  }

  function removerEncaminhamento(indice: number) {
    setConfig((atual) => ({
      ...atual,
      encaminhamento_opcoes: atual.encaminhamento_opcoes.filter((_, i) => i !== indice),
    }));
  }

  function adicionarCriterioPerfil() {
    const novoCriterio: CriterioPerfil = {
      id: `criterio_${Date.now()}`,
      nome: "",
      opcoes: [
        { nivel: "baixo", label: "" },
        { nivel: "medio", label: "" },
        { nivel: "alto", label: "" },
      ],
    };
    setConfig((atual) => ({
      ...atual,
      perfil_turma_criterios: [...(atual.perfil_turma_criterios ?? []), novoCriterio],
    }));
  }

  function atualizarCriterioPerfil(indice: number, campo: "nome", valor: string): void;
  function atualizarCriterioPerfil(indice: number, campo: "opcao", nivel: string, valor: string): void;
  function atualizarCriterioPerfil(indice: number, campo: string, valorOuNivel: string, valorOpcao?: string) {
    setConfig((atual) => ({
      ...atual,
      perfil_turma_criterios: (atual.perfil_turma_criterios ?? []).map((criterio, i) => {
        if (i !== indice) return criterio;
        if (campo === "nome") {
          return { ...criterio, nome: valorOuNivel };
        }
        if (campo === "opcao") {
          return {
            ...criterio,
            opcoes: criterio.opcoes.map((op) =>
              op.nivel === valorOuNivel ? { ...op, label: valorOpcao ?? "" } : op
            ),
          };
        }
        return criterio;
      }),
    }));
  }

  function removerCriterioPerfil(indice: number) {
    setConfig((atual) => ({
      ...atual,
      perfil_turma_criterios: (atual.perfil_turma_criterios ?? []).filter((_, i) => i !== indice),
    }));
  }

  function adicionarCriterioDestaque() {
    const novo: CriterioDestaque = { id: `destaque_${Date.now()}`, titulo: "", icone: "⭐" };
    setConfig((atual) => ({
      ...atual,
      aluno_destaque_criterios: [...(atual.aluno_destaque_criterios ?? []), novo],
    }));
  }

  function atualizarCriterioDestaque(indice: number, campo: "titulo" | "icone", valor: string) {
    setConfig((atual) => ({
      ...atual,
      aluno_destaque_criterios: (atual.aluno_destaque_criterios ?? []).map((c, i) =>
        i === indice ? { ...c, [campo]: valor } : c
      ),
    }));
  }

  function removerCriterioDestaque(indice: number) {
    setConfig((atual) => ({
      ...atual,
      aluno_destaque_criterios: (atual.aluno_destaque_criterios ?? []).filter((_, i) => i !== indice),
    }));
  }

  async function salvar() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const salvo = await invokeApp<ConfiguracoesApp>("salvar_configuracoes", { input: config });
      setConfig(salvo);
      setMensagem("Configurações salvas.");
      onConfigSalva(salvo);
      onDadosAlterados();
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  // Equipe gestora: salva só esse campo (carimba atualizado_em p/ o sync do grupo).
  async function salvarEquipe() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const salvo = await invokeApp<ConfiguracoesApp>("salvar_equipe_gestora", { equipe: config.equipe_gestora });
      setConfig(salvo);
      setMensagem("Equipe gestora salva.");
      onConfigSalva(salvo);
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
      const salvo = await invokeApp<ConfiguracoesApp>("salvar_cabecalho_ata", {
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
      const resultado = await invokeApp<BackupResultado>("exportar_backup_seletivo", { input: { ciclos } });
      setUltimoBackup(resultado.caminho);
      registrarBackupFeito(ciclos);
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
    invokeApp("abrir_pasta", { caminho: ultimoBackup }).catch((err) => setErro(String(err)));
  }

  async function importarBackup(modo: "mesclar" | "substituir") {
    const selecao = await abrirDialogoArquivo({
      filters: [{ name: "Backup CoordenacaoOP", extensions: ["zip"] }],
    }).catch(() => null);
    if (!selecao) return;
    const caminho = typeof selecao === "string" ? selecao : null;
    if (!caminho) return;
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const resultado = await invokeApp<BackupResultado>("importar_backup_por_caminho", { caminho, modo });
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
      if (!tauriDisponivel) {
        throw new Error("Verificação disponível apenas no aplicativo desktop.");
      }
      const update = await check();
      setAtualizacao(update);
      setMensagem(update ? `Nova versão disponível: ${update.version}.` : "Você já está usando a versão mais recente.");
    } catch (err) {
      setErro(`Não foi possível verificar atualizações: ${String(err)}`);
    } finally {
      setProcessando(false);
    }
  }

  async function alternarAutostart() {
    setErro("");
    try {
      if (autostartAtivo) {
        await autostartDisable();
      } else {
        await autostartEnable();
      }
      const ativo = await autostartIsEnabled();
      setAutostartAtivo(ativo);
      setMensagem(ativo ? "Aplicativo configurado para iniciar com o Windows." : "Início automático desativado.");
    } catch (err) {
      setErro(`Não foi possível alterar o início automático: ${String(err)}`);
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
      if (tauriDisponivel) {
        await relaunch();
      }
    } catch (err) {
      setErro(`Não foi possível instalar a atualização: ${String(err)}`);
    } finally {
      setProcessando(false);
    }
  }

  async function escolherPastaSincronizacao() {
    setErro("");
    try {
      const selecionado = await abrirDialogoArquivo({
        directory: true,
        multiple: false,
        title: "Escolher pasta compartilhada do grupo de trabalho",
      });
      if (typeof selecionado === "string") {
        onPerfilSyncChange({ ...perfilSync, syncFolder: selecionado });
        setMensagem("Pasta de sincronização atualizada.");
      }
    } catch (err) {
      setErro(`Não foi possível selecionar a pasta: ${String(err)}`);
    }
  }

  function atualizarPerfilSync(campo: keyof WorkgroupSyncProfile, valor: string | boolean) {
    onPerfilSyncChange({ ...perfilSync, [campo]: valor });
  }

  function atualizarAiSettings(campo: keyof AiAssistantSettings, valor: string | boolean | number) {
    setAiSettings((atual) => {
      const alteraConexao = campo === "provider" || campo === "endpoint" || campo === "model" || campo === "apiKey";
      const proximo = {
        ...atual,
        [campo]: valor,
        ...(alteraConexao ? { connectionOk: false, lastTestedAt: undefined } : {}),
      } as AiAssistantSettings;
      salvarAiAssistantSettings(proximo);
      return proximo;
    });
  }

  function trocarProvedorIa(provider: AiProvider) {
    setAiSettings((atual) => {
      const proximo = aplicarPadroesDoProvedor(atual, provider);
      salvarAiAssistantSettings(proximo);
      setAiStatus(null);
      return proximo;
    });
  }

  function abrirLinkExterno(url: string) {
    if (tauriDisponivel) {
      invokeApp("abrir_url", { url }).catch((err) => setErro(String(err)));
      return;
    }
    window.open(url, "_blank");
  }

  async function testarConexaoIa() {
    setAcaoIa("testar");
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const resposta = await testarAiAssistant(aiSettings);
      const validado = { ...aiSettings, connectionOk: true, lastTestedAt: new Date().toISOString() };
      setAiSettings(validado);
      salvarAiAssistantSettings(validado);
      setMensagem(`Assistente Pedagógico conectado: ${resposta}`);
      if (aiSettings.provider === "ollama") await verificarIaLocal(false);
    } catch (err) {
      const invalidado = { ...aiSettings, connectionOk: false, lastTestedAt: undefined };
      setAiSettings(invalidado);
      salvarAiAssistantSettings(invalidado);
      setErro(String(err));
    } finally {
      setAcaoIa(null);
      setProcessando(false);
    }
  }

  async function verificarIaLocal(mostrarMensagem = true) {
    setVerificandoIa(true);
    if (mostrarMensagem) {
      setMensagem("");
      setErro("");
    }
    try {
      const status = await invokeApp<DiagnosticoIaLocal>("diagnosticar_ia_local", { modelo: aiSettings.model });
      setAiStatus(status);
      if (mostrarMensagem) {
        setMensagem(status.mensagem);
      }
    } catch (err) {
      setErro(String(err));
    } finally {
      setVerificandoIa(false);
    }
  }

  async function iniciarIaLocal() {
    setAcaoIa("iniciar");
    setMensagem("");
    setErro("");
    try {
      await invokeApp<DiagnosticoIaLocal>("iniciar_ollama_local");
      await verificarIaLocal(false);
      setMensagem("Ollama iniciado. Verifique se o modelo recomendado está disponível.");
    } catch (err) {
      setErro(String(err));
    } finally {
      setAcaoIa(null);
    }
  }

  async function baixarModeloIaLocal() {
    setAcaoIa("baixar");
    setMensagem("Baixando modelo local. Isso pode demorar e depende da rede.");
    setErro("");
    try {
      const status = await invokeApp<DiagnosticoIaLocal>("baixar_modelo_ia_local", {
        input: { modelo: aiSettings.model },
      });
      setAiStatus(status);
      setMensagem(status.mensagem);
    } catch (err) {
      setErro(`Não foi possível baixar o modelo. ${String(err)}`);
    } finally {
      setAcaoIa(null);
    }
  }

  function escolherFotoPerfil(arquivo: File | null) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErro("Selecione uma imagem para a foto do perfil.");
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => setAvatarOrigem(String(leitor.result ?? ""));
    leitor.onerror = () => setErro("Não foi possível carregar a imagem selecionada.");
    leitor.readAsDataURL(arquivo);
  }

  async function publicarEstadoGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de publicar.");
      }
      const payload = await montarPayloadSincronizacao(perfilSync);
      const resultado = await invokeApp<SyncStateResultado>("publicar_estado_sincronizacao", {
        input: {
          pasta: perfilSync.syncFolder,
          device_id: perfilSync.userId,
          payload,
        },
      });
      onPerfilSyncChange({ ...perfilSync, syncEnabled: true, onboarding: "enabled", lastPublishedAt: resultado.atualizado_em });
      setMensagem(`Estado do Quadro de Gestão publicado em: ${resultado.caminho}`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function atualizarDoGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de atualizar.");
      }
      // Lê o estado de CADA coordenador (arquivo por dispositivo), não o
      // arquivo único legado — este último é sobrescrito por qualquer
      // publicação de qualquer coordenador, então "puxar" a partir dele
      // podia trazer o estado de outra pessoa em vez do mais recente de
      // cada um. Mesma lógica já usada pelo ciclo automático em App.tsx.
      const payloads = await invokeApp<WorkgroupSyncPayload[]>("carregar_estados_sincronizacao", {
        pasta: perfilSync.syncFolder,
        deviceId: perfilSync.userId,
      });
      if (payloads.length === 0) {
        setMensagem("Ainda não há estado publicado nesta pasta de sincronização.");
        return;
      }
      let resumo: Awaited<ReturnType<typeof aplicarPayloadSincronizacao>> | null = null;
      const origens: string[] = [];
      for (const payload of payloads) {
        resumo = await aplicarPayloadSincronizacao(payload);
        origens.push(resumo.origem);
      }
      onPerfilSyncChange({ ...perfilSync, syncEnabled: true, onboarding: "enabled", lastPulledAt: new Date().toISOString() });
      setMensagem(`Dados do grupo aplicados: ${resumo?.tarefas ?? 0} tarefas e ${resumo?.eventos ?? 0} eventos. Origem: ${origens.join(", ")}.`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function publicarDadosInstitucionaisGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de publicar.");
      }
      const resultado = await invokeApp<SyncInstitutionalResultado>("publicar_dados_institucionais_sincronizacao", {
        input: {
          pasta: perfilSync.syncFolder,
          device_id: perfilSync.userId,
        },
      });
      onPerfilSyncChange({
        ...perfilSync,
        syncEnabled: true,
        onboarding: "enabled",
        lastInstitutionalPublishedAt: resultado.atualizado_em,
      });
      setMensagem(`Turmas, alunos e status publicados: ${resultado.arquivos} arquivo(s).`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function atualizarDadosInstitucionaisGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de atualizar.");
      }
      const resultado = await invokeApp<SyncInstitutionalResultado>("carregar_dados_institucionais_sincronizacao", { pasta: perfilSync.syncFolder });
      if (!resultado.caminho) {
        setMensagem("Ainda não há turmas e alunos publicados nesta pasta de sincronização.");
        return;
      }
      onDadosAlterados();
      onPerfilSyncChange({
        ...perfilSync,
        syncEnabled: true,
        onboarding: "enabled",
        lastInstitutionalPulledAt: resultado.atualizado_em || new Date().toISOString(),
      });
      setMensagem(`Turmas, alunos e status atualizados: ${resultado.arquivos} arquivo(s). Backup local: ${resultado.backup_seguranca ?? "não informado"}.`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  const totalResultados = resultadosBusca.length;

  return (
    <section className="settings-page">
      <div className="page-title-row">
        <div>
          <h1>Configurações</h1>
          <p>Ajustes desta instalação e da instituição. Listas usadas no dia a dia ficam nas próprias telas.</p>
        </div>
      </div>

      <section className="panel settings-layout settings-layout-v2">
        <nav className="settings-nav settings-nav-v2" aria-label="Seções de configurações">
          <div className={`settings-busca ${buscaFoco ? "focada" : ""}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={buscaRef}
              type="search"
              value={busca}
              placeholder="Buscar ajuste ou campo…"
              onChange={(evento) => { setBusca(evento.target.value); setBuscaIndiceAtivo(0); }}
              onFocus={() => setBuscaFoco(true)}
              onBlur={() => window.setTimeout(() => setBuscaFoco(false), 120)}
              onKeyDown={aoTeclarNaBusca}
              aria-label="Buscar ajuste ou campo"
              aria-expanded={buscaFoco && totalResultados > 0}
              aria-controls="settings-busca-lista"
              role="combobox"
            />
            {buscaFoco && busca.trim() && (
              <div className="settings-busca-dropdown" id="settings-busca-lista" role="listbox">
                {totalResultados === 0 ? (
                  <div className="settings-busca-vazio">Nada encontrado para “{busca.trim()}”.</div>
                ) : (
                  <>
                    {resultadosBusca.some((r) => r.campo) && <div className="settings-busca-grupo">Campos</div>}
                    {resultadosBusca.map((resultado, indice) => (
                      <button
                        key={`${resultado.secao}-${resultado.campo ?? "secao"}-${indice}`}
                        type="button"
                        role="option"
                        aria-selected={indice === buscaIndiceAtivo}
                        className={`settings-busca-item ${indice === buscaIndiceAtivo ? "ativo" : ""}`}
                        onMouseDown={(evento) => { evento.preventDefault(); irParaResultado(resultado); }}
                        onMouseEnter={() => setBuscaIndiceAtivo(indice)}
                      >
                        <strong>{resultado.campo ?? resultado.secaoLabel}</strong>
                        <small>{resultado.campo ? `${resultado.grupo} › ${resultado.secaoLabel}` : resultado.grupo}</small>
                      </button>
                    ))}
                    <div className="settings-busca-rodape">
                      <span>{pluralizar(totalResultados, "resultado", "resultados")}</span>
                      <span className="settings-busca-teclas">navegar <kbd>↑↓</kbd></span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`settings-nav-visaogeral ${secaoConfig === "visao-geral" ? "active" : ""}`}
            onClick={() => setSecaoConfig("visao-geral")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
            Visão geral
          </button>

          {GRUPOS_CONFIG.map((grupo) => {
            const grupoAtivo = grupo.itens.some((item) => item.id === secaoConfig);
            return (
              <div key={grupo.titulo} className={`settings-nav-group ${grupoAtivo ? "active" : ""}`}>
                <div className="settings-nav-group-title">{grupo.titulo}</div>
                {grupo.itens.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={secaoConfig === item.id ? "active" : ""}
                    onClick={() => setSecaoConfig(item.id)}
                  >
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="settings-content">
        {secaoConfig === "visao-geral" && (
          <VisaoGeralConfig
            config={config}
            perfilSync={perfilSync}
            appInfo={appInfo}
            ultimoBackup={ultimoBackup}
            atualizacaoDisponivel={atualizacao}
            aiSettings={aiSettings}
            onIr={setSecaoConfig}
          />
        )}
        {secaoConfig === "equipe-gestora" && (
        <article className="settings-card">
          <CabecalhoSecao
            secao="equipe-gestora"
            titulo="Equipe gestora"
            descricao="Direção, vice-direções e coordenações com nome e gênero. É a fonte da verdade para quem assina documentos e aparece no grupo de trabalho."
            acao={<button type="button" className="primary-action" onClick={salvarEquipe} disabled={processando}>Salvar alterações</button>}
          />
          <EquipeGestoraSecao
            equipe={config.equipe_gestora}
            onChange={(equipe) => setConfig((atual) => ({ ...atual, equipe_gestora: equipe }))}
            perfilSync={perfilSync}
          />
        </article>
        )}

        {secaoConfig === "instituicao" && (
        <article className="settings-card">
          <CabecalhoSecao
            secao="instituicao"
            titulo="Instituição"
            descricao="Calendário letivo e cabeçalho usado na ATA, nos relatórios e nos documentos impressos."
            acao={<button type="button" className="primary-action" onClick={salvar} disabled={processando}>Salvar alterações</button>}
          />

          <div className="cfg-artigo" id="cfg-instituicao-ciclo">
            <div className="cfg-artigo-titulo">
              <strong>Calendário letivo</strong>
              <span>define o bimestre que as telas mostram por padrão</span>
            </div>
            <div className="cfg-campos-2col">
              <label>
                Bimestre atual
                <select
                  value={config.bimestre_pin}
                  onChange={(event) => setConfig((atual) => ({ ...atual, bimestre_pin: event.target.value }))}
                >
                  <option value="">Automático (pela data de hoje)</option>
                  <option value="1">Fixo no 1º bimestre</option>
                  <option value="2">Fixo no 2º bimestre</option>
                  <option value="3">Fixo no 3º bimestre</option>
                  <option value="4">Fixo no 4º bimestre</option>
                </select>
              </label>
              <label>
                Média mínima
                <input type="number" min="0" max="10" step="0.1" value={config.nota_minima} onChange={(event) => setConfig((atual) => ({ ...atual, nota_minima: Number(event.target.value) }))} />
              </label>
            </div>
            <div className="cfg-consequencia">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span>No modo automático, o app decide o bimestre pelas datas de início abaixo; se elas estiverem vazias, usa o maior bimestre já importado.</span>
            </div>
            <div className="cfg-campos-2col" id="cfg-instituicao-bimestres">
              {[0, 1, 2, 3].map((i) => (
                <label key={i}>
                  Início do {i + 1}º bimestre
                  <input
                    type="date"
                    value={config.bimestre_datas_inicio[i] ?? ""}
                    onChange={(event) =>
                      setConfig((atual) => {
                        const datas = [...(atual.bimestre_datas_inicio ?? ["", "", "", ""])];
                        datas[i] = event.target.value;
                        return { ...atual, bimestre_datas_inicio: datas };
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="cfg-campos-2col">
              <label>
                Prazo do 1º semestre (bimestres 1º e 2º)
                <input type="date" value={config.prazo_1_semestre} onChange={(event) => setConfig((atual) => ({ ...atual, prazo_1_semestre: event.target.value }))} />
              </label>
              <label>
                Prazo do 2º semestre (bimestres 3º e 4º)
                <input type="date" value={config.prazo_2_semestre} onChange={(event) => setConfig((atual) => ({ ...atual, prazo_2_semestre: event.target.value }))} />
              </label>
            </div>
          </div>

          <div className="cfg-artigo" id="cfg-instituicao-cabecalho">
            <div className="cfg-artigo-titulo">
              <strong>Cabeçalho dos documentos</strong>
              <span>prévia à direita</span>
            </div>
            <div className="cfg-cabecalho-grid">
              <div className="settings-file-group" style={{ margin: 0 }}>
                <span>Imagem de cabeçalho</span>
                <p>JPG ou PNG com o cabeçalho oficial da escola. Aparece na ATA e no relatório dos professores.</p>
                <label className="file-action">
                  Enviar imagem de cabeçalho
                  <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(event) => enviarCabecalhoAta(event.target.files?.[0] ?? null)} />
                </label>
                <span className="settings-version">
                  {config.cabecalho_ata ? "Cabeçalho personalizado configurado." : "Usando cabeçalho padrão, se existir na pasta de dados."}
                </span>
              </div>
              <div className="cfg-preview-ata">
                <span className="cfg-preview-ata-rotulo">Prévia</span>
                <div className="cfg-preview-ata-folha">
                  <div className="cfg-preview-ata-topo">
                    <span style={{ width: 26, height: 26, borderRadius: 5, background: "#f2f0ec", flexShrink: 0 }} aria-hidden="true" />
                    <div>
                      <div className="cfg-preview-ata-l1">Prefeitura / Secretaria de Educação</div>
                      <div className="cfg-preview-ata-l2">{config.cabecalho_ata ? "Cabeçalho enviado" : "Nome da escola"}</div>
                    </div>
                  </div>
                  <div className="cfg-preview-ata-regua" />
                  <div className="cfg-preview-ata-titulo">ATA DO CONSELHO DE CLASSE</div>
                  <div className="cfg-preview-ata-sub">2ª A · 3º bimestre</div>
                  <div className="cfg-preview-ata-linhas">
                    <span /><span /><span style={{ width: "72%" }} /><span style={{ width: "84%" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
        )}
        {secaoConfig === "turmas" && (
        <article className="settings-card">
          <CabecalhoSecao
            secao="turmas"
            titulo="Turmas"
            descricao="Campos usados nas turmas e no conselho, e os tipos de atendimento da ficha do aluno. Valem para toda a escola."
            acao={<button type="button" className="primary-action" onClick={salvar} disabled={processando}>Salvar alterações</button>}
          />
          <div id="cfg-turmas-campos" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={config.lider_ativo} onChange={(e) => setConfig((a) => ({ ...a, lider_ativo: e.target.checked }))} />
              Usar líder de sala
            </label>
            <label style={{ display: "block", flex: "1 1 220px" }}>
              Nome do campo
              <input value={config.lider_rotulo} disabled={!config.lider_ativo} onChange={(e) => setConfig((a) => ({ ...a, lider_rotulo: e.target.value }))} placeholder="Ex.: Líder de sala, Representante" style={{ width: "100%" }} />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end", marginTop: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={config.elegivel_ativo} onChange={(e) => setConfig((a) => ({ ...a, elegivel_ativo: e.target.checked }))} />
              Usar elegível
            </label>
            <label style={{ display: "block", flex: "1 1 220px" }}>
              Nome do campo
              <input value={config.elegivel_rotulo} disabled={!config.elegivel_ativo} onChange={(e) => setConfig((a) => ({ ...a, elegivel_rotulo: e.target.value }))} placeholder="Ex.: Elegível" style={{ width: "100%" }} />
            </label>
          </div>
          <div style={{ marginTop: "1.25rem" }} id="cfg-turmas-tipos">
            <h3 style={{ marginBottom: "0.25rem" }}>Tipos de atendimento</h3>
            <p style={{ color: "#667085", fontSize: "0.9rem", marginBottom: "0.75rem" }}>Defina as opções disponíveis na aba Atendimentos da ficha do aluno. Valem para toda a escola.</p>
            <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.5rem" }}>
              {config.atendimento_tipos.map((tipo, indice) => (
                <div key={indice} style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    value={tipo}
                    onChange={(event) => atualizarTipoAtendimento(indice, event.target.value)}
                    placeholder="Ex.: Disciplinar, Pedagógico, Financeiro"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="danger-action" onClick={() => removerTipoAtendimento(indice)}>
                    Remover
                  </button>
                </div>
              ))}
              {!config.atendimento_tipos.length && (
                <span style={{ color: "#667085", fontSize: "0.85rem" }}>Nenhum tipo configurado. Adicione ao menos um para registrar atendimentos.</span>
              )}
            </div>
            <button type="button" className="secondary-action" onClick={adicionarTipoAtendimento}>Adicionar tipo</button>
          </div>
        </article>
        )}

        {secaoConfig === "conselho-perfil" && (
        <article className="settings-card">
          <CabecalhoSecao secao="conselho-perfil" titulo="Perfil da turma" descricao="Critérios de observação exibidos no conselho e na ATA." acao={<button type="button" className="primary-action" onClick={salvar} disabled={processando}>Salvar alterações</button>} />
          <label className="settings-check-row">
            <input
              type="checkbox"
              checked={config.perfil_turma_ativo}
              onChange={(e) => setConfig((a) => ({ ...a, perfil_turma_ativo: e.target.checked }))}
            />
            Exibir Perfil da Turma no conselho e na ATA
          </label>

          {config.perfil_turma_ativo && (
            <>
              <h3 style={{ marginBottom: "0.5rem" }}>Critérios de observação</h3>
              <p style={{ color: "#667085", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                Cada critério tem três níveis: baixo (vermelho), médio (amarelo) e alto (verde). O coordenador seleciona um nível por critério no conselho.
              </p>
              <div className="perfil-criterios-config">
                {(config.perfil_turma_criterios ?? []).map((criterio, indice) => (
                  <div key={criterio.id} className="perfil-criterio-config-item">
                    <div className="perfil-criterio-config-row">
                      <input
                        value={criterio.nome}
                        onChange={(e) => atualizarCriterioPerfil(indice, "nome", e.target.value)}
                        placeholder="Nome do critério (ex.: Participação nas aulas)"
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="danger-action" onClick={() => removerCriterioPerfil(indice)}>
                        Remover
                      </button>
                    </div>
                    <div className="perfil-criterio-config-opcoes">
                      {criterio.opcoes.map((opcao) => (
                        <label key={opcao.nivel} className={`perfil-opcao-config perfil-opcao-config-${opcao.nivel}`}>
                          <span>{opcao.nivel === "baixo" ? "Baixo" : opcao.nivel === "medio" ? "Médio" : "Alto"}</span>
                          <input
                            value={opcao.label}
                            onChange={(e) => atualizarCriterioPerfil(indice, "opcao", opcao.nivel, e.target.value)}
                            placeholder={opcao.nivel === "baixo" ? "Ex.: Raramente" : opcao.nivel === "medio" ? "Ex.: Às vezes" : "Ex.: Sempre"}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary-action" onClick={adicionarCriterioPerfil} style={{ marginTop: "0.75rem" }}>
                Adicionar critério
              </button>
            </>
          )}
        </article>
        )}

        {secaoConfig === "conselho-destaque" && (
        <article className="settings-card">
          <CabecalhoSecao secao="conselho-destaque" titulo="Aluno destaque" descricao="Categorias de destaque e superação registradas por aluno no conselho e na ATA." acao={<button type="button" className="primary-action" onClick={salvar} disabled={processando}>Salvar alterações</button>} />
          <label className="settings-check-row">
            <input
              type="checkbox"
              checked={config.aluno_destaque_ativo}
              onChange={(e) => setConfig((a) => ({ ...a, aluno_destaque_ativo: e.target.checked }))}
            />
            Registrar alunos destaque/superação no conselho e na ATA
          </label>

          {config.aluno_destaque_ativo && (
            <>
              <h3 style={{ marginBottom: "0.5rem" }}>Categorias de destaque</h3>
              <p style={{ color: "#667085", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
                Cada categoria tem um título e um ícone. No conselho, você digita o nome do aluno que se destaca em cada categoria.
              </p>
              <div className="perfil-criterios-config">
                {(config.aluno_destaque_criterios ?? []).map((criterio, indice) => (
                  <div key={criterio.id} className="perfil-criterio-config-item">
                    <div className="perfil-criterio-config-row">
                      <input
                        value={criterio.titulo}
                        onChange={(e) => atualizarCriterioDestaque(indice, "titulo", e.target.value)}
                        placeholder="Título (ex.: Aluno Destaque, Aluno Superação)"
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="danger-action" onClick={() => removerCriterioDestaque(indice)}>
                        Remover
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                      {["⭐", "🏆", "📈", "↗", "💪", "🎯", "👑", "🌟", "🔝", "🎖"].map((icone) => (
                        <button
                          key={icone}
                          type="button"
                          onClick={() => atualizarCriterioDestaque(indice, "icone", icone)}
                          style={{
                            fontSize: "1.3rem",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: criterio.icone === icone ? "2px solid var(--accent)" : "2px solid var(--border)",
                            background: criterio.icone === icone ? "var(--accent-subtle)" : "transparent",
                            cursor: "pointer",
                            lineHeight: 1,
                          }}
                          title={icone}
                        >
                          {icone}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary-action" onClick={adicionarCriterioDestaque} style={{ marginTop: "0.75rem" }}>
                Adicionar categoria
              </button>
            </>
          )}
        </article>
        )}

        {secaoConfig === "conselho-encaminhamentos" && (
        <article className="settings-card">
          <CabecalhoSecao secao="conselho-encaminhamentos" titulo="Encaminhamentos" descricao={`Opções para marcar por aluno no conselho e listadas em "Outras observações e encaminhamentos" na ATA.`} acao={<button type="button" className="primary-action" onClick={salvar} disabled={processando}>Salvar alterações</button>} />
          <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.5rem" }}>
            {config.encaminhamento_opcoes.map((opcao, indice) => (
              <div key={opcao.numero} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ color: "#667085", fontSize: "0.85rem", minWidth: "1.75rem", textAlign: "right" }}>{opcao.numero}.</span>
                <input
                  value={opcao.texto}
                  onChange={(event) => atualizarEncaminhamento(indice, event.target.value)}
                  placeholder="Ex.: Dedicar-se mais ao estudo em casa."
                  style={{ flex: 1 }}
                />
                <button type="button" className="danger-action" onClick={() => removerEncaminhamento(indice)}>
                  Remover
                </button>
              </div>
            ))}
            {!config.encaminhamento_opcoes.length && (
              <span style={{ color: "#667085", fontSize: "0.85rem" }}>Nenhum encaminhamento configurado. Adicione ao menos um.</span>
            )}
          </div>
          <button type="button" className="secondary-action" onClick={adicionarEncaminhamento}>Adicionar encaminhamento</button>
        </article>
        )}

        {secaoConfig === "conselho-notas" && (
        <article className="settings-card">
          <CabecalhoSecao secao="conselho-notas" titulo="Notas na ATA" descricao="Como as notas de cada disciplina aparecem na ATA do conselho." acao={<button type="button" className="primary-action" onClick={salvar} disabled={processando}>Salvar alterações</button>} />
          <div className="ata-notas-options" id="cfg-notas-minima">
            {opcoesModoNotasAta.map((opcao) => (
              <label key={opcao.valor} className="settings-check-row">
                <input
                  type="radio"
                  name="modo-notas-ata"
                  value={opcao.valor}
                  checked={config.modo_notas_ata === opcao.valor}
                  onChange={() => setConfig((a) => ({ ...a, modo_notas_ata: opcao.valor }))}
                />
                {opcao.rotulo}
              </label>
            ))}
          </div>
        </article>
        )}

        {secaoConfig === "perfil-dispositivo" && (
        <article className="settings-card">
          <CabecalhoSecao secao="perfil-dispositivo" titulo="Perfil e dispositivo" descricao="Identifique esta instalação antes de compartilhar dados com outros coordenadores. Salva sozinho." />
          <div className="profile-photo-settings">
            {perfilSync.avatarDataUrl ? (
              <img src={perfilSync.avatarDataUrl} alt="" />
            ) : (
              <span>{(perfilSync.displayName || "CP").trim().slice(0, 2).toUpperCase()}</span>
            )}
            <label className="file-action">
              Alterar foto
              <input type="file" accept="image/*" onChange={(event) => escolherFotoPerfil(event.target.files?.[0] ?? null)} />
            </label>
            {perfilSync.avatarDataUrl && (
              <button type="button" onClick={() => onPerfilSyncChange({ ...perfilSync, avatarDataUrl: undefined })}>Remover foto</button>
            )}
          </div>
          <label>
            Nome do coordenador
            <input value={perfilSync.displayName} onChange={(event) => atualizarPerfilSync("displayName", event.target.value)} placeholder="Ex.: Thiago Henrique" />
          </label>
          <label>
            Função
            <input value={perfilSync.role} onChange={(event) => atualizarPerfilSync("role", event.target.value)} />
          </label>
          <label>
            Nome deste dispositivo
            <input value={perfilSync.deviceName} onChange={(event) => atualizarPerfilSync("deviceName", event.target.value)} />
          </label>
        </article>
        )}

        {secaoConfig === "sincronizacao" && (
        <>
        <article className="settings-card" id="cfg-sync-grupo">
          <CabecalhoSecao secao="sincronizacao" titulo="Sincronização" descricao="Compartilhe turmas, alunos e o Quadro de Gestão com outros coordenadores da instituição." />
          <label className="settings-check-row">
            <input type="checkbox" checked={perfilSync.syncEnabled} onChange={(event) => atualizarPerfilSync("syncEnabled", event.target.checked)} />
            Ativar sincronização de grupo de trabalho
          </label>
          <div className="settings-file-group" id="cfg-sync-pasta">
            <span>Pasta compartilhada</span>
            <p>Use uma pasta OneDrive compartilhada exclusivamente para o CoordenacaoOP.</p>
            <button type="button" onClick={escolherPastaSincronizacao}>Escolher pasta</button>
            <span className="settings-version">{perfilSync.syncFolder || "Nenhuma pasta selecionada."}</span>
          </div>
          <div className="sync-actions-row">
            <button type="button" onClick={publicarEstadoGrupo} disabled={processando || !perfilSync.syncFolder}>Publicar estado</button>
            <button type="button" onClick={atualizarDoGrupo} disabled={processando || !perfilSync.syncFolder}>Atualizar do grupo</button>
          </div>
          <button type="button" className="secondary-action" onClick={onAbrirAssistenteSync}>Abrir assistente de configuração</button>
          <span className="settings-version">
            {perfilSync.syncEnabled ? "Sincronização preparada para esta instalação." : "Recurso desativado. Pode ser ativado quando o grupo estiver pronto."}
          </span>
          {perfilSync.lastPublishedAt && <span className="settings-version">Última publicação: {new Date(perfilSync.lastPublishedAt).toLocaleString("pt-BR")}</span>}
          {perfilSync.lastPulledAt && <span className="settings-version">Última atualização recebida: {new Date(perfilSync.lastPulledAt).toLocaleString("pt-BR")}</span>}
          {perfilSync.lastSyncError && (
            <div className="notice error">
              A sincronização automática falhou em {perfilSync.lastSyncErrorAt ? new Date(perfilSync.lastSyncErrorAt).toLocaleString("pt-BR") : "uma tentativa recente"}: {perfilSync.lastSyncError}
            </div>
          )}
        </article>
        <article className="settings-card" id="cfg-sync-institucional">
          <h2>Turmas e alunos</h2>
          <p>Sincroniza os dados institucionais da pasta local: turmas, alunos, elegibilidade, liderança, notas ajustadas e demais registros de conselho.</p>
          <div className="sync-actions-row">
            <button type="button" onClick={publicarDadosInstitucionaisGrupo} disabled={processando || !perfilSync.syncFolder}>Publicar turmas e alunos</button>
            <button type="button" onClick={atualizarDadosInstitucionaisGrupo} disabled={processando || !perfilSync.syncFolder}>Atualizar turmas e alunos</button>
          </div>
          {!perfilSync.syncFolder && (
            <span className="settings-version">Escolha a pasta compartilhada acima antes de publicar ou atualizar.</span>
          )}
          {perfilSync.lastInstitutionalPublishedAt && <span className="settings-version">Última publicação de turmas: {new Date(perfilSync.lastInstitutionalPublishedAt).toLocaleString("pt-BR")}</span>}
          {perfilSync.lastInstitutionalPulledAt && <span className="settings-version">Última atualização de turmas: {new Date(perfilSync.lastInstitutionalPulledAt).toLocaleString("pt-BR")}</span>}
        </article>
        </>
        )}

        {secaoConfig === "whatsapp" && (
        <article className="settings-card" id="cfg-whatsapp-token">
          <CabecalhoSecao
            secao="whatsapp"
            titulo="WhatsApp"
            descricao="Credenciais da API oficial do WhatsApp, para disparos em lote. A fila assistida (abrir o WhatsApp e apertar enviar) funciona sem configurar nada."
          />
          <ConfigEnvioAutomatico />
        </article>
        )}

        {secaoConfig === "backup" && (
        <article className="settings-card">
          <CabecalhoSecao secao="backup" titulo="Backup" descricao="Exporta e restaura os dados do app. Compatível com o formato antigo de backup." />
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
          <button type="button" className="file-action" disabled={processando} onClick={() => void importarBackup("mesclar")}>
            Adicionar dados de backup
          </button>
          <button type="button" className="file-action danger" disabled={processando} onClick={() => {
            if (window.confirm("Esta ação substitui os dados atuais. Um backup de segurança será criado antes da restauração.")) {
              void importarBackup("substituir");
            }
          }}>
            Substituir dados pelo backup
          </button>
        </article>
        )}

        {secaoConfig === "manutencao-dados" && (
        <article className="settings-card">
          <CabecalhoSecao
            secao="manutencao-dados"
            titulo="Manutenção de dados"
            descricao="Encontra disciplinas gravadas com grafias diferentes que deveriam ser a mesma matéria — resíduo de importações antigas."
          />
          <p className="settings-version">
            Revise a lista antes de corrigir: a correção funde notas, frequência e carga horária sob
            uma única grafia, preferindo sempre o valor mais recente.
          </p>
          <button
            type="button"
            onClick={async () => {
              setMensagemDuplicatas("");
              setProcessandoDuplicatas(true);
              try {
                const res = await invokeApp<GrupoDisciplinaDuplicada[]>("analisar_disciplinas_duplicadas");
                setDuplicatasDisciplinas(res);
                if (res.length === 0) setMensagemDuplicatas("Nenhuma duplicidade encontrada.");
              } catch (e) {
                setErro(e instanceof Error ? e.message : String(e));
              } finally {
                setProcessandoDuplicatas(false);
              }
            }}
            disabled={processandoDuplicatas}
          >
            {processandoDuplicatas ? "Verificando..." : "Verificar disciplinas duplicadas"}
          </button>

          {mensagemDuplicatas && <span className="settings-version">{mensagemDuplicatas}</span>}

          {duplicatasDisciplinas && duplicatasDisciplinas.length > 0 && (
            <>
              <div className="students-table-wrap">
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>Disciplina</th>
                      <th>Grafias encontradas</th>
                      <th>Turmas</th>
                      <th>Alunos afetados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicatasDisciplinas.map((grupo, i) => (
                      <tr key={i}>
                        <td><strong>{grupo.forma_canonica}</strong></td>
                        <td>{grupo.grafias.join(" · ")}</td>
                        <td>{grupo.turmas.length}</td>
                        <td>{grupo.alunos_afetados}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="file-action"
                disabled={processandoDuplicatas}
                onClick={async () => {
                  setProcessandoDuplicatas(true);
                  setMensagemDuplicatas("");
                  try {
                    const total = await invokeApp<number>("corrigir_disciplinas_duplicadas");
                    setMensagemDuplicatas(`${total} ocorrência(s) corrigida(s).`);
                    setDuplicatasDisciplinas(null);
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : String(e));
                  } finally {
                    setProcessandoDuplicatas(false);
                  }
                }}
              >
                Corrigir {duplicatasDisciplinas.reduce((acc, g) => acc + g.grafias.length - 1, 0)} duplicidade(s)
              </button>
            </>
          )}
        </article>
        )}

        {secaoConfig === "assistente" && (
        <article className="settings-card">
          <CabecalhoSecao secao="assistente" titulo="Assistente pedagógico" descricao="Gera rascunhos de relatórios pedagógicos. Provedores em nuvem recebem os dados do relatório; use apenas com autorização da escola." />
          <label className="settings-check-row">
            <input type="checkbox" checked={aiSettings.enabled} onChange={(event) => atualizarAiSettings("enabled", event.target.checked)} />
            Ativar geração de relatórios com IA
          </label>
          <div className="ai-provider-options">
            {[
              { id: "gemini" as const, titulo: "Gemini", texto: "Grátis com limites. Requer chave do Google AI Studio." },
              { id: "manual-prompt" as const, titulo: "Prompt manual", texto: "Copia instruções para usar no Copilot, ChatGPT ou outra IA aberta pelo usuário." },
              { id: "ollama" as const, titulo: "Ollama local", texto: "Sem envio à nuvem, mas exige download de modelo e costuma ter qualidade menor." },
            ].map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                className={aiSettings.provider === opcao.id ? "selected" : ""}
                onClick={() => trocarProvedorIa(opcao.id)}
              >
                <strong>{opcao.titulo}</strong>
                <small>{opcao.texto}</small>
              </button>
            ))}
          </div>
          {aiSettings.provider === "gemini" && (
            <div className="data-warning neutral ai-privacy-warning">
              <strong>Uso em nuvem e custos</strong>
              <span>
                Gemini pode ser usado gratuitamente dentro dos limites do Google. Os dados usados para gerar o relatório são enviados ao serviço do Google quando este modo está ativo.
              </span>
            </div>
          )}
          {aiSettings.provider === "manual-prompt" && (
            <div className="data-warning neutral ai-privacy-warning">
              <strong>Modo manual</strong>
              <span>O aplicativo não acessa contas externas. Ele monta um prompt pedagógico para você copiar e colar na IA de sua preferência.</span>
            </div>
          )}
          {aiSettings.provider === "gemini" && (
            <div className="ai-advanced-grid">
              <label>
                Chave de API
                <input
                  type="password"
                  value={aiSettings.apiKey}
                  onChange={(event) => atualizarAiSettings("apiKey", event.target.value)}
                  placeholder="Chave do Google AI Studio"
                />
              </label>
              <label>
                Modelo
                <input value={aiSettings.model} onChange={(event) => atualizarAiSettings("model", event.target.value)} />
              </label>
              <button type="button" onClick={() => abrirLinkExterno("https://aistudio.google.com/app/apikey")}>
                Gerar chave no Google AI Studio
              </button>
              <button type="button" onClick={testarConexaoIa} disabled={processando || acaoIa !== null || !aiSettings.apiKey.trim()}>
                {acaoIa === "testar" ? "Testando..." : "Testar conexão"}
              </button>
              <span className={`ai-status-pill ${aiSettings.connectionOk ? "ready" : "blocked"}`}>
                {aiSettings.connectionOk ? `Pronto: ${rotuloAiProvider(aiSettings.provider)}` : "Aguardando teste"}
              </span>
            </div>
          )}
          {aiSettings.lastTestedAt && (
            <span className="settings-version">
              Último teste bem-sucedido: {new Date(aiSettings.lastTestedAt).toLocaleString("pt-BR")}
            </span>
          )}
          {aiSettings.provider === "ollama" && (
          <div className="ai-setup-panel">
            <div className="ai-setup-heading">
              <strong>Status da IA local</strong>
              <span className={`ai-status-pill ${aiStatus?.modelo_instalado ? "ready" : aiStatus?.servidor_ativo ? "warning" : "blocked"}`}>
                {verificandoIa
                  ? "Verificando..."
                  : aiStatus?.modelo_instalado
                    ? "Pronto"
                    : aiStatus?.servidor_ativo
                      ? "Falta modelo"
                      : aiStatus?.ollama_instalado
                        ? "Ollama desligado"
                        : "Não configurado"}
              </span>
            </div>
            <p>{aiStatus?.mensagem ?? "Clique em verificar para diagnosticar a IA local neste computador."}</p>
            <div className="ai-setup-steps">
              <span className={aiStatus?.ollama_instalado ? "done" : ""}>1. Ollama instalado</span>
              <span className={aiStatus?.servidor_ativo ? "done" : ""}>2. Servidor local ativo</span>
              <span className={aiStatus?.modelo_instalado ? "done" : ""}>3. Modelo recomendado baixado</span>
            </div>
            <div className="sync-actions-row">
              <button type="button" onClick={() => verificarIaLocal()} disabled={verificandoIa || acaoIa !== null}>
                {verificandoIa ? "Verificando..." : "Verificar IA local"}
              </button>
              {!aiStatus?.ollama_instalado ? (
                <button type="button" onClick={() => abrirLinkExterno("https://ollama.com/download")}>
                  Instalar Ollama
                </button>
              ) : !aiStatus?.servidor_ativo ? (
                <button type="button" onClick={iniciarIaLocal} disabled={acaoIa !== null}>
                  {acaoIa === "iniciar" ? "Iniciando..." : "Iniciar Ollama"}
                </button>
              ) : !aiStatus?.modelo_instalado ? (
                <button type="button" onClick={baixarModeloIaLocal} disabled={acaoIa !== null}>
                  {acaoIa === "baixar" ? "Baixando..." : "Baixar modelo"}
                </button>
              ) : (
                <button type="button" onClick={testarConexaoIa} disabled={processando || acaoIa !== null}>
                  {acaoIa === "testar" ? "Testando..." : "Testar assistente"}
                </button>
              )}
            </div>
            {aiStatus?.modelos.length ? (
              <span className="settings-version">Modelos disponíveis: {aiStatus.modelos.join(", ")}</span>
            ) : (
              <span className="settings-version">Modelo recomendado: {aiSettings.model}</span>
            )}
          </div>
          )}
          <button type="button" className="secondary-action" onClick={() => setMostrarIaAvancado((atual) => !atual)}>
            {mostrarIaAvancado ? "Ocultar opções avançadas" : "Mostrar opções avançadas"}
          </button>
          {mostrarIaAvancado && (
            <div className="ai-advanced-grid">
              <label>
                Provedor
                <select value={aiSettings.provider} onChange={(event) => trocarProvedorIa(event.target.value as AiProvider)}>
                  <option value="gemini">Gemini</option>
                  <option value="manual-prompt">Prompt manual</option>
                  <option value="ollama">Ollama local</option>
                </select>
              </label>
              <label>
                Endereço
                <input value={aiSettings.endpoint} onChange={(event) => atualizarAiSettings("endpoint", event.target.value)} placeholder="https://generativelanguage.googleapis.com" />
              </label>
              <label>
                Modelo
                <input value={aiSettings.model} onChange={(event) => atualizarAiSettings("model", event.target.value)} placeholder="gemini-2.5-flash" />
              </label>
              <label>
                Chave de API
                <input type="password" value={aiSettings.apiKey} onChange={(event) => atualizarAiSettings("apiKey", event.target.value)} placeholder="Opcional para IA local" />
              </label>
              <label>
                Criatividade
                <input type="range" min="0" max="1" step="0.05" value={aiSettings.temperature} onChange={(event) => atualizarAiSettings("temperature", Number(event.target.value))} />
              </label>
              <span className="settings-version">Valor atual: {aiSettings.temperature.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <button type="button" onClick={testarConexaoIa} disabled={processando || acaoIa !== null}>Testar conexão manual</button>
            </div>
          )}
        </article>
        )}

        {secaoConfig === "atualizacao" && (
        <article className="settings-card">
          <CabecalhoSecao secao="atualizacao" titulo="Atualização" descricao="A verificação consulta a última versão publicada no GitHub." />
          <button onClick={verificarAtualizacao} disabled={processando}>Verificar atualização</button>
          <span className="settings-version">Versão atual: {appInfo?.version ? `v${appInfo.version}` : "não identificada"}</span>
          {atualizacao && (
            <button className="primary-action" onClick={instalarAtualizacao}>Atualizar e reiniciar</button>
          )}
          {atualizacao && <span className="settings-version">Disponível: {atualizacao.version}</span>}
          <p style={{ marginTop: "1rem" }}>Inicialização e bandeja do sistema.</p>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autostartAtivo}
              onChange={alternarAutostart}
              disabled={!tauriDisponivel}
            />
            Iniciar com o Windows e minimizar para a bandeja ao fechar
          </label>
          <span className="settings-version">Quando ativo, fechar a janela mantém o aplicativo na bandeja para continuar enviando notificações.</span>
        </article>
        )}
        </div>
      </section>

      {mensagem && <div className="notice success">{mensagem}</div>}
      {erro && <div className="notice error">{erro}</div>}
      {avatarOrigem && (
        <AvatarCropper
          imagem={avatarOrigem}
          onCancelar={() => setAvatarOrigem(null)}
          onSalvar={(avatarDataUrl) => {
            onPerfilSyncChange({ ...perfilSync, avatarDataUrl });
            setAvatarOrigem(null);
            setMensagem("Foto do perfil atualizada.");
          }}
        />
      )}
    </section>
  );
}

// Cabeçalho único de seção (handoff #6): trilha + título + descrição + slot de ação.
function CabecalhoSecao({
  secao,
  titulo,
  descricao,
  acao,
}: {
  secao: SettingsSection;
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  const seta = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
  return (
    <header className="cfg-secao-cabecalho">
      <div className="cfg-trilha">
        <span>Configurações</span>
        {seta}
        <span>{GRUPO_DA_SECAO[secao] || "Geral"}</span>
        {seta}
        <strong>{LABEL_DA_SECAO[secao]}</strong>
      </div>
      <div className="cfg-secao-cabecalho-linha">
        <div>
          <h2>{titulo}</h2>
          <p>{descricao}</p>
        </div>
        {acao && <div className="cfg-secao-acao">{acao}</div>}
      </div>
    </header>
  );
}

type LinhaCard = { label: string; secao: SettingsSection; estado: string; tom?: "ok" | "atencao" };

// Porta de entrada (handoff 1a): faixa de manutencao + grade 2x2 de grupos com
// o estado real de cada destino.
function VisaoGeralConfig({
  config,
  perfilSync,
  appInfo,
  atualizacaoDisponivel,
  aiSettings,
  onIr,
}: {
  config: ConfiguracoesApp;
  perfilSync: WorkgroupSyncProfile;
  appInfo: AppInfo | null;
  ultimoBackup: string | null;
  atualizacaoDisponivel: Update | null;
  aiSettings: AiAssistantSettings;
  onIr: (secao: SettingsSection) => void;
}) {
  const backup = lerUltimoBackup();
  const backupDias = backup ? diasDesde(backup.em) : null;
  const modoNotas = opcoesModoNotasAta.find((o) => o.valor === config.modo_notas_ata)?.rotulo ?? "Padrão";

  const avisos: Array<{ texto: string; rotulo: string; secao: SettingsSection }> = [];
  if (backupDias === null) {
    avisos.push({ texto: "Você ainda não gerou um backup neste computador.", rotulo: "Fazer backup", secao: "backup" });
  } else if (backupDias >= 7) {
    avisos.push({
      texto: `Backup há ${backupDias} ${backupDias === 1 ? "dia" : "dias"}.${backup && backup.ciclos.length ? ` Último: ${backup.ciclos.join(", ")}.` : ""}`,
      rotulo: "Exportar agora",
      secao: "backup",
    });
  }
  if (atualizacaoDisponivel) {
    avisos.push({ texto: `Atualização ${atualizacaoDisponivel.version} disponível.`, rotulo: "Ver atualização", secao: "atualizacao" });
  }
  if (perfilSync.lastSyncError) {
    avisos.push({ texto: "A última sincronização automática falhou.", rotulo: "Abrir Sincronização", secao: "sincronizacao" });
  }

  const grupos: Array<{ titulo: string; icone: ReactNode; linhas: LinhaCard[]; nota?: string }> = [
    {
      titulo: "Institucional",
      icone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" /></svg>,
      linhas: [
        { label: "Instituição", secao: "instituicao", estado: config.cabecalho_ata ? "Cabeçalho pronto" : "Sem cabeçalho" },
        { label: "Turmas", secao: "turmas", estado: pluralizar(config.atendimento_tipos.length, "tipo de atendimento", "tipos de atendimento") },
      ],
    },
    {
      titulo: "Conselho",
      icone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>,
      linhas: [
        {
          label: "Perfil da turma",
          secao: "conselho-perfil",
          estado: config.perfil_turma_ativo ? `Ativo · ${pluralizar((config.perfil_turma_criterios ?? []).length, "critério", "critérios")}` : "Desativado",
          tom: config.perfil_turma_ativo ? "ok" : undefined,
        },
        {
          label: "Aluno destaque",
          secao: "conselho-destaque",
          estado: config.aluno_destaque_ativo ? `Ativo · ${pluralizar((config.aluno_destaque_criterios ?? []).length, "categoria", "categorias")}` : "Desativado",
          tom: config.aluno_destaque_ativo ? "ok" : undefined,
        },
        { label: "Encaminhamentos", secao: "conselho-encaminhamentos", estado: pluralizar(config.encaminhamento_opcoes.length, "opção", "opções") },
        { label: "Notas na ATA", secao: "conselho-notas", estado: modoNotas },
      ],
    },
    {
      titulo: "Este computador",
      icone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
      linhas: [
        { label: "Perfil e dispositivo", secao: "perfil-dispositivo", estado: [perfilSync.displayName, perfilSync.deviceName].filter(Boolean).join(" · ") || "A configurar" },
        { label: "Sincronização", secao: "sincronizacao", estado: perfilSync.syncEnabled ? "Ativa" : "Desativada", tom: perfilSync.syncEnabled ? "ok" : undefined },
        {
          label: "Backup",
          secao: "backup",
          estado: backupDias === null ? "Nunca neste computador" : `Há ${backupDias} ${backupDias === 1 ? "dia" : "dias"}`,
          tom: backupDias !== null && backupDias >= 7 ? "atencao" : undefined,
        },
        {
          label: "Atualização",
          secao: "atualizacao",
          estado: atualizacaoDisponivel ? `${atualizacaoDisponivel.version} disponível` : `${appInfo?.version ? `v${appInfo.version}` : "versão atual"} · em dia`,
          tom: atualizacaoDisponivel ? "atencao" : undefined,
        },
      ],
    },
    {
      titulo: "Integrações",
      icone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0-6 6c0 7-3 8-3 8h18s-3-1-3-8a6 6 0 0 0-6-6" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></svg>,
      linhas: [
        { label: "Assistente pedagógico", secao: "assistente", estado: aiSettings.enabled ? `Ativo · ${rotuloAiProvider(aiSettings.provider)}` : "Desligado", tom: aiSettings.enabled ? "ok" : undefined },
        { label: "WhatsApp", secao: "whatsapp", estado: "Fila assistida sempre disponível" },
      ],
      nota: "A fila assistida funciona sem configurar nada.",
    },
  ];

  return (
    <div className="cfg-visaogeral">
      {avisos.length > 0 && (
        <div className="cfg-vg-manutencao">
          {avisos.map((aviso) => (
            <div key={aviso.secao + aviso.rotulo} className="cfg-vg-aviso">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /><path d="M12 9v4M12 17h.01" />
              </svg>
              <span>{aviso.texto}</span>
              <button type="button" onClick={() => onIr(aviso.secao)}>{aviso.rotulo}</button>
            </div>
          ))}
        </div>
      )}

      <div className="cfg-vg-grade">
        {grupos.map((grupo) => (
          <article key={grupo.titulo} className="cfg-vg-card">
            <div className="cfg-vg-card-topo">
              <span className="cfg-vg-card-icone" aria-hidden="true">{grupo.icone}</span>
              <strong>{grupo.titulo}</strong>
            </div>
            <div className="cfg-vg-linhas">
              {grupo.linhas.map((linha) => (
                <button key={linha.secao} type="button" className="cfg-vg-linha" onClick={() => onIr(linha.secao)}>
                  <span className="cfg-vg-linha-label">{linha.label}</span>
                  <span className={`cfg-vg-linha-estado ${linha.tom ? `tom-${linha.tom}` : ""}`}>
                    {linha.tom && <span className="cfg-vg-ponto" aria-hidden="true" />}
                    {linha.estado}
                  </span>
                </button>
              ))}
            </div>
            {grupo.nota && <p className="cfg-vg-card-nota">{grupo.nota}</p>}
          </article>
        ))}
      </div>

      <div className="cfg-vg-movidos">
        <div className="cfg-vg-movidos-topo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <strong>Saiu de Configurações</strong>
          <span>agora se edita na tela onde é usado</span>
        </div>
        <div className="cfg-vg-movidos-chips">
          <span>Modelos de mensagem<em>Atendimentos › Gerenciar modelos</em></span>
        </div>
      </div>
    </div>
  );
}

function AvatarCropper({
  imagem,
  onSalvar,
  onCancelar,
}: {
  imagem: string;
  onSalvar: (avatarDataUrl: string) => void;
  onCancelar: () => void;
}) {
  const imagemRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  function recortar() {
    const img = imagemRef.current;
    if (!img) return;
    const tamanho = 256;
    const canvas = document.createElement("canvas");
    canvas.width = tamanho;
    canvas.height = tamanho;
    const contexto = canvas.getContext("2d");
    if (!contexto) return;

    contexto.clearRect(0, 0, tamanho, tamanho);
    contexto.save();
    contexto.beginPath();
    contexto.arc(tamanho / 2, tamanho / 2, tamanho / 2, 0, Math.PI * 2);
    contexto.clip();

    const base = Math.max(tamanho / img.naturalWidth, tamanho / img.naturalHeight) * zoom;
    const largura = img.naturalWidth * base;
    const altura = img.naturalHeight * base;
    const x = (tamanho - largura) / 2 + offsetX;
    const y = (tamanho - altura) / 2 + offsetY;
    contexto.drawImage(img, x, y, largura, altura);
    contexto.restore();
    onSalvar(canvas.toDataURL("image/png"));
  }

  const transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${zoom})`;

  return (
    <div className="modal-backdrop">
      <section className="avatar-cropper-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-cropper-title">
        <h2 id="avatar-cropper-title">Ajustar foto do perfil</h2>
        <div className="avatar-cropper-preview">
          <img ref={imagemRef} src={imagem} alt="" style={{ transform }} />
        </div>
        <div className="avatar-cropper-controls">
          <label>
            Zoom
            <input type="range" min="1" max="2.6" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <label>
            Horizontal
            <input type="range" min="-90" max="90" step="1" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
          </label>
          <label>
            Vertical
            <input type="range" min="-90" max="90" step="1" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="primary-action" onClick={recortar}>Salvar foto</button>
        </div>
      </section>
    </div>
  );
}
