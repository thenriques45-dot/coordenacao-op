import { invokeApp, tauriDisponivel } from "./appBridge";

export type AiProvider = "gemini" | "manual-prompt" | "ollama";

export type AiAssistantSettings = {
  enabled: boolean;
  provider: AiProvider;
  endpoint: string;
  model: string;
  apiKey: string;
  temperature: number;
  connectionOk: boolean;
  lastTestedAt?: string;
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

const INSTRUCOES_SISTEMA_PEDAGOGICO = [
  "Você é um assistente pedagógico para coordenação escolar.",
  "Gere apenas um rascunho revisável, sem afirmar diagnósticos clínicos.",
  "Use linguagem profissional, acolhedora, objetiva e adequada para registro pedagógico.",
  "Baseie-se somente nos dados fornecidos. Quando faltar dado, não invente.",
  "Escreva em português do Brasil.",
].join(" ");

export const defaultAiAssistantSettings: AiAssistantSettings = {
  enabled: false,
  provider: "gemini",
  endpoint: "https://generativelanguage.googleapis.com",
  model: "gemini-2.5-flash",
  apiKey: "",
  temperature: 0.25,
  connectionOk: false,
};

const PROVIDER_DEFAULTS: Record<AiProvider, Pick<AiAssistantSettings, "endpoint" | "model">> = {
  gemini: { endpoint: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash" },
  "manual-prompt": { endpoint: "https://copilot.microsoft.com", model: "Prompt manual" },
  ollama: { endpoint: "http://127.0.0.1:11434", model: "llama3.2:3b" },
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

export function assistentePedagogicoDisponivel(settings: AiAssistantSettings) {
  const config = normalizarAiSettings(settings);
  return config.enabled && config.provider !== "manual-prompt" && config.connectionOk && Boolean(config.model.trim()) && (config.provider === "ollama" || Boolean(config.apiKey.trim()));
}

export function assistenteManualDisponivel(settings: AiAssistantSettings) {
  const config = normalizarAiSettings(settings);
  return config.enabled && config.provider === "manual-prompt";
}

export function rotuloAiProvider(provider: AiProvider) {
  const rotulos: Record<AiProvider, string> = {
    gemini: "Gemini",
    "manual-prompt": "Prompt manual",
    ollama: "Ollama local",
  };
  return rotulos[provider];
}

export function aplicarPadroesDoProvedor(settings: AiAssistantSettings, provider: AiProvider): AiAssistantSettings {
  const padrao = PROVIDER_DEFAULTS[provider];
  return normalizarAiSettings({
    ...settings,
    provider,
    endpoint: padrao.endpoint,
    model: padrao.model,
    connectionOk: false,
    lastTestedAt: undefined,
  });
}

export async function gerarRelatorioPedagogico(settings: AiAssistantSettings, input: AiStudentReportInput) {
  if (!settings.enabled) {
    throw new Error("Ative o Assistente Pedagógico em Configurações antes de gerar relatórios.");
  }

  return gerarTextoIa(settings, [
    { role: "system", content: INSTRUCOES_SISTEMA_PEDAGOGICO },
    { role: "user", content: montarPromptRelatorio(input) },
  ]);
}

export function montarPromptRelatorioPedagogico(input: AiStudentReportInput) {
  return [INSTRUCOES_SISTEMA_PEDAGOGICO, "", montarPromptRelatorio(input)].join("\n");
}

function normalizarAiSettings(dados: Partial<AiAssistantSettings>): AiAssistantSettings {
  const provider = normalizarProvider(dados.provider);
  const padrao = PROVIDER_DEFAULTS[provider];
  const endpoint = String(dados.endpoint || padrao.endpoint).replace(/\/+$/, "");
  const temperature = typeof dados.temperature === "number" && Number.isFinite(dados.temperature)
    ? Math.max(0, Math.min(1, dados.temperature))
    : defaultAiAssistantSettings.temperature;

  return {
    enabled: dados.enabled === true,
    provider,
    endpoint,
    model: String(dados.model || padrao.model).trim() || padrao.model,
    apiKey: String(dados.apiKey ?? "").trim(),
    temperature,
    connectionOk: dados.connectionOk === true,
    lastTestedAt: dados.lastTestedAt,
  };
}

async function gerarTextoIa(settings: AiAssistantSettings, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const config = normalizarAiSettings(settings);
  if (!config.endpoint) throw new Error("Informe o endereço do provedor de IA.");
  if (!config.model) throw new Error("Informe o modelo de IA.");
  if (config.provider === "gemini" && !config.apiKey) {
    throw new Error("Informe a chave de API do provedor escolhido.");
  }
  if (config.provider === "manual-prompt") {
    throw new Error("O modo manual copia o prompt para uso em outra IA, sem geração automática no aplicativo.");
  }
  if (config.provider === "ollama") return gerarComOllama(config, messages);
  return gerarComGemini(config, messages);
}

function normalizarProvider(provider: unknown): AiProvider {
  if (provider === "gemini" || provider === "manual-prompt" || provider === "ollama") return provider;
  if (provider === "copilot-manual" || provider === "openai" || provider === "azure-openai" || provider === "openrouter" || provider === "openai-compatible") {
    return "manual-prompt";
  }
  return defaultAiAssistantSettings.provider;
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

async function gerarComGemini(settings: AiAssistantSettings, messages: Array<{ role: string; content: string }>) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const user = messages.filter((message) => message.role !== "system").map((message) => message.content).join("\n\n");
  const dados = await requisicaoJson(`${settings.endpoint}/v1beta/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: settings.temperature,
      },
    }),
  }) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (dados.error?.message) throw new Error(dados.error.message);
  const texto = dados.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text ?? "").join("\n").trim() ?? "";
  if (!texto.trim()) throw new Error("O Gemini respondeu sem texto.");
  return texto.trim();
}

async function requisicaoJson(url: string, init: { method: string; headers: Record<string, string>; body: string }) {
  if (tauriDisponivel) {
    const resposta = await invokeApp<{ status: number; body: unknown }>("requisicao_ia_json", {
      input: {
        url,
        headers: init.headers,
        body: JSON.parse(init.body) as unknown,
      },
    });
    if (resposta.status < 200 || resposta.status >= 300) {
      const erro = resposta.body as { error?: { message?: string }; message?: string };
      throw new Error(erro.error?.message ?? erro.message ?? `O provedor respondeu com erro ${resposta.status}.`);
    }
    return resposta.body;
  }

  const resposta = await fetch(url, init);
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = dados as { error?: { message?: string }; message?: string };
    throw new Error(erro.error?.message ?? erro.message ?? `O provedor respondeu com erro ${resposta.status}.`);
  }
  return dados;
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
