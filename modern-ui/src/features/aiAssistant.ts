export type AiProvider = "ollama" | "openai-compatible";

export type AiAssistantSettings = {
  enabled: boolean;
  provider: AiProvider;
  endpoint: string;
  model: string;
  temperature: number;
};

export type AiStudentReportInput = {
  aluno: {
    nome: string;
    matricula?: string;
    chamada?: number;
    elegivel?: boolean;
    deficiencias?: string[];
    comentarioEducacaoEspecial?: string | null;
    frequencia?: number | null;
    encaminhamentos?: number[];
    diagnosticoAprendizagem?: {
      turma_origem: string | null;
      portugues: { aprendizagem_equivalente: string | null; status: string | null };
      matematica: { aprendizagem_equivalente: string | null; status: string | null };
      atualizado_em: string | null;
    } | null;
    disciplinas: Array<{
      nome: string;
      mediaOriginal: number | null;
      mediaConselho: number | null;
      quintoConceito?: number | null;
      faltas?: number | null;
      totalAulas?: number | null;
      faltasAcumuladas?: number | null;
      totalAulasAcumuladas?: number | null;
      situacao: string;
    }>;
  };
  bimestre: string;
  turma?: string;
  tarefas?: Array<{
    titulo: string;
    descricao: string;
    prazo?: string;
    prioridade: string;
    status: string;
  }>;
};

const AI_SETTINGS_KEY = "coordenacaoop.aiAssistantSettings";

export const defaultAiAssistantSettings: AiAssistantSettings = {
  enabled: false,
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "llama3.2:3b",
  temperature: 0.25,
};

export function carregarAiAssistantSettings(): AiAssistantSettings {
  try {
    const salvo = localStorage.getItem(AI_SETTINGS_KEY);
    if (!salvo) return defaultAiAssistantSettings;
    const dados = JSON.parse(salvo) as Partial<AiAssistantSettings>;
    return normalizarAiSettings(dados);
  } catch {
    return defaultAiAssistantSettings;
  }
}

export function salvarAiAssistantSettings(settings: AiAssistantSettings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(normalizarAiSettings(settings)));
}

export async function testarAiAssistant(settings: AiAssistantSettings) {
  const texto = await gerarTextoIa(settings, [
    {
      role: "system",
      content: "Responda em português do Brasil, em uma frase curta.",
    },
    {
      role: "user",
      content: "Confirme que o assistente pedagógico local está conectado.",
    },
  ]);
  return texto.trim();
}

export async function gerarRelatorioPedagogico(settings: AiAssistantSettings, input: AiStudentReportInput) {
  if (!settings.enabled) {
    throw new Error("Ative o Assistente Pedagógico em Configurações antes de gerar relatórios.");
  }

  return gerarTextoIa(settings, [
    {
      role: "system",
      content: [
        "Você é um assistente pedagógico para coordenação escolar.",
        "Gere apenas um rascunho revisável, sem afirmar diagnósticos clínicos.",
        "Use linguagem profissional, acolhedora, objetiva e adequada para registro pedagógico.",
        "Baseie-se somente nos dados fornecidos. Quando faltar dado, não invente.",
        "Escreva em português do Brasil.",
      ].join(" "),
    },
    {
      role: "user",
      content: montarPromptRelatorio(input),
    },
  ]);
}

function normalizarAiSettings(dados: Partial<AiAssistantSettings>): AiAssistantSettings {
  const endpoint = String(dados.endpoint || defaultAiAssistantSettings.endpoint).replace(/\/+$/, "");
  const provider = dados.provider === "openai-compatible" ? "openai-compatible" : "ollama";
  const temperature = typeof dados.temperature === "number" && Number.isFinite(dados.temperature)
    ? Math.max(0, Math.min(1, dados.temperature))
    : defaultAiAssistantSettings.temperature;

  return {
    enabled: dados.enabled === true,
    provider,
    endpoint,
    model: String(dados.model || defaultAiAssistantSettings.model).trim() || defaultAiAssistantSettings.model,
    temperature,
  };
}

async function gerarTextoIa(settings: AiAssistantSettings, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const config = normalizarAiSettings(settings);
  if (!config.endpoint) throw new Error("Informe o endereço local da IA.");
  if (!config.model) throw new Error("Informe o modelo local da IA.");
  return config.provider === "ollama"
    ? gerarComOllama(config, messages)
    : gerarComOpenAiCompativel(config, messages);
}

async function gerarComOllama(settings: AiAssistantSettings, messages: Array<{ role: string; content: string }>) {
  const resposta = await fetch(`${settings.endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: false,
      options: {
        temperature: settings.temperature,
      },
    }),
  });
  if (!resposta.ok) {
    throw new Error(`A IA local respondeu com erro ${resposta.status}. Verifique se o Ollama está aberto e se o modelo foi baixado.`);
  }
  const dados = await resposta.json() as { message?: { content?: string }; response?: string };
  const texto = dados.message?.content ?? dados.response ?? "";
  if (!texto.trim()) throw new Error("A IA local respondeu sem texto.");
  return texto.trim();
}

async function gerarComOpenAiCompativel(settings: AiAssistantSettings, messages: Array<{ role: string; content: string }>) {
  const resposta = await fetch(`${settings.endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
    }),
  });
  if (!resposta.ok) {
    throw new Error(`A IA local respondeu com erro ${resposta.status}. Verifique se o servidor local está ativo.`);
  }
  const dados = await resposta.json() as { choices?: Array<{ message?: { content?: string } }> };
  const texto = dados.choices?.[0]?.message?.content ?? "";
  if (!texto.trim()) throw new Error("A IA local respondeu sem texto.");
  return texto.trim();
}

function montarPromptRelatorio({ aluno, bimestre, turma, tarefas }: AiStudentReportInput) {
  const disciplinas = aluno.disciplinas.map((disciplina) => {
    const media = disciplina.mediaConselho ?? disciplina.mediaOriginal;
    return {
      disciplina: disciplina.nome,
      media,
      quintoConceito: disciplina.quintoConceito ?? null,
      faltas: disciplina.faltasAcumuladas ?? disciplina.faltas ?? null,
      totalAulas: disciplina.totalAulasAcumuladas ?? disciplina.totalAulas ?? null,
      situacao: disciplina.situacao,
    };
  });

  const dados = {
    aluno: {
      nome: aluno.nome,
      ra: aluno.matricula ?? null,
      numeroChamada: aluno.chamada ?? null,
      turma: turma ?? null,
      bimestre,
      frequenciaPercentual: aluno.frequencia ?? null,
      elegivelEducacaoEspecial: aluno.elegivel === true,
      condicoesRegistradas: aluno.deficiencias ?? [],
      comentarioEducacaoEspecial: aluno.comentarioEducacaoEspecial ?? null,
      encaminhamentosSelecionados: aluno.encaminhamentos ?? [],
      diagnosticoSaresp: aluno.diagnosticoAprendizagem ?? null,
      disciplinas,
      tarefasRelacionadas: (tarefas ?? []).slice(0, 8),
    },
  };

  return [
    "Gere um relatório pedagógico individual em formato de texto corrido com seções curtas.",
    "Inclua: síntese do desempenho, pontos de atenção, potencialidades observáveis pelos dados, intervenções pedagógicas sugeridas e encaminhamentos para acompanhamento.",
    "Não use listas muito longas. Não use linguagem médica. Não exponha que você é uma IA.",
    "Dados estruturados:",
    JSON.stringify(dados, null, 2),
  ].join("\n\n");
}
