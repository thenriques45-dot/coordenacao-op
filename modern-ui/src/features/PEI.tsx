import { BookMarked, ClipboardList, Copy, ExternalLink, FileText, FolderOpen, RefreshCw, Settings, Sparkles, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";
import { semestreAtivo, type PrazosSemestre } from "./semestre";
import { carregarMembrosSincronizacao, garantirPerfilPersistido, type WorkgroupSyncMember } from "./workgroupSync";

type RegistroPei = {
  timestamp: string;
  email: string;
  professor: string;
  nome_estudante_completo: string;
  nome_aluno: string;
  turma_aluno: string;
  disciplina: string;
  bimestre: string;
  conteudos: string;
  estrategias: string;
  instrumentos: string;
  recursos: string;
};

type ConfigPei = {
  url_legado: string;
  planilha_automatica_id: string;
  webapp_url: string;
  apps_script_projeto_id: string;
  apps_script_deployment_id: string;
  token_leitura: string;
  configurado_por_user_id: string;
};

type ProvisionamentoPeiResultado = {
  webapp_url: string;
  planilha_id: string;
  planilha_url: string;
  apps_script_projeto_id: string;
  apps_script_deployment_id: string;
  token_leitura: string;
};

const CONFIG_PEI_PADRAO: ConfigPei = {
  url_legado: "",
  planilha_automatica_id: "",
  webapp_url: "",
  apps_script_projeto_id: "",
  apps_script_deployment_id: "",
  token_leitura: "",
  configurado_por_user_id: "",
};

type AlunoElegivelComDisciplinas = {
  matricula: string;
  nome: string;
  turma: string;
  disciplinas: string[];
  disciplinas_por_bimestre: Record<string, string[]>;
};

type GerarPeisLoteResultado = {
  pasta: string;
  arquivos: number;
  pulados: number;
  erros: string[];
  registros: RegistroPei[];
};
type PeisLocaisResultado = { pasta: string; registros: RegistroPei[] };

const PEI_ULTIMA_BUSCA_KEY = "coordenacaoop:pei-ultima-busca";

const BIMESTRES = ["1", "2", "3", "4"];

function normalizarNome(nome: string) {
  return nome
    .trim()
    .toLocaleUpperCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function normalizarDisciplina(nome: string) {
  return nome
    .trim()
    .toLocaleUpperCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Verifica se todos os PEIs esperados no semestre ativo (mesma regra de
 * datas do Planejamento — ver semestre.ts) estão entregues. Verde: todos
 * entregues. Amarelo: algum entregue. Vermelho: nenhum. Sem prazo
 * configurado ainda, cai num indicador simples (recebeu algo ou não).
 */
function statusPeiAluno(
  aluno: AlunoElegivelComDisciplinas,
  peis: RegistroPei[],
  semestre: ReturnType<typeof semestreAtivo>
): "adequado" | "atencao" | "critico" {
  if (!semestre) {
    return peis.length > 0 ? "atencao" : "critico";
  }

  let esperado = 0;
  let encontrado = 0;

  for (const b of semestre.bimestres) {
    const disciplinas = aluno.disciplinas_por_bimestre[b] ?? [];
    for (const d of disciplinas) {
      esperado++;
      const temPei = peis.some(
        (r) =>
          r.bimestre === b &&
          normalizarDisciplina(r.disciplina) === normalizarDisciplina(d)
      );
      if (temPei) encontrado++;
    }
  }

  // Sem disciplinas_por_bimestre para os bimestres ativos (carga horária
  // ainda não importada para o 3º/4º bim., por exemplo), não há como saber
  // o que é esperado — cai no indicador simples em vez de acusar "crítico"
  // com o aluno já tendo vários PEIs recebidos em outros bimestres.
  if (esperado === 0) {
    return peis.length > 0 ? "atencao" : "critico";
  }

  if (encontrado === 0) return "critico";
  return encontrado >= esperado ? "adequado" : "atencao";
}

// Estilos reutilizados no diálogo de tutorial
const estiloPassoPEI: React.CSSProperties = {
  display: "flex", gap: "0.9rem", marginBottom: "1rem", alignItems: "flex-start",
};
const estiloNumPassoPEI: React.CSSProperties = {
  minWidth: "26px", height: "26px", borderRadius: "50%",
  background: "var(--accent)", color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontWeight: 700, fontSize: "0.82rem", flexShrink: 0, marginTop: "2px",
};
const estiloTextoPassoPEI: React.CSSProperties = {
  fontSize: "0.84rem", margin: "0.3rem 0 0", lineHeight: 1.5,
  color: "var(--text-secondary)",
};

export function TelaPEI() {
  const [config, setConfig] = useState<ConfigPei>(CONFIG_PEI_PADRAO);
  const [configAberta, setConfigAberta] = useState(false);
  const [abaConfig, setAbaConfig] = useState<"automatico" | "manual">("automatico");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaBusca, setUltimaBusca] = useState(
    () => localStorage.getItem(PEI_ULTIMA_BUSCA_KEY) ?? ""
  );
  const [registros, setRegistros] = useState<RegistroPei[]>([]);
  const [alunosElegiveis, setAlunosElegiveis] = useState<AlunoElegivelComDisciplinas[]>([]);
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoElegivelComDisciplinas | null>(null);
  const [erroPeiAbrir, setErroPeiAbrir] = useState("");
  const [gerando, setGerando] = useState(false);
  const [statusGeracao, setStatusGeracao] = useState("");
  const [pastaGeral, setPastaGeral] = useState("");
  const [gerandoPend, setGerandoPend] = useState(false);
  const [criandoWebApp, setCriandoWebApp] = useState(false);
  const [erroWebApp, setErroWebApp] = useState("");
  const [linkRecebido, setLinkRecebido] = useState("");
  const [importandoLink, setImportandoLink] = useState(false);
  const [statusImportarLink, setStatusImportarLink] = useState("");
  const [prazos, setPrazos] = useState<PrazosSemestre>({ prazo_1_semestre: "", prazo_2_semestre: "" });
  const [configuradoPorOutro, setConfiguradoPorOutro] = useState(false);
  const [membroConfigurador, setMembroConfigurador] = useState<WorkgroupSyncMember | null>(null);

  useEffect(() => {
    invokeApp<ConfigPei>("carregar_config_pei")
      .then((c) => {
        const cfg = { ...CONFIG_PEI_PADRAO, ...c };
        setConfig(cfg);
        // Configurado por outro coordenador via sincronização de grupo (ver
        // workgroupSync.ts): nesse caso não força a modal técnica, mostra o
        // card "Fulano já configurou" em vez disso.
        const perfilLocal = garantirPerfilPersistido();
        const porOutro = Boolean(
          cfg.webapp_url && cfg.token_leitura && cfg.configurado_por_user_id
            && cfg.configurado_por_user_id !== perfilLocal.userId
        );
        setConfiguradoPorOutro(porOutro);
        setMembroConfigurador(
          porOutro ? carregarMembrosSincronizacao().find((m) => m.userId === cfg.configurado_por_user_id) ?? null : null
        );
        setConfigAberta(!porOutro && !cfg.url_legado.trim() && !cfg.webapp_url.trim());
      })
      .catch(() => setConfigAberta(true));
    invokeApp<PrazosSemestre>("carregar_configuracoes")
      .then((c) => setPrazos({ prazo_1_semestre: c.prazo_1_semestre, prazo_2_semestre: c.prazo_2_semestre }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    invokeApp<AlunoElegivelComDisciplinas[]>("listar_alunos_elegiveis_com_disciplinas")
      .then(setAlunosElegiveis)
      .catch(() => setAlunosElegiveis([]));
  }, []);

  // Popula a tela a partir do que já foi gerado em disco (índice local, ver
  // pei::carregar_peis_locais) — não depende de nenhuma busca na planilha
  // ter dado certo, então um 403/erro de rede não faz a tela voltar a
  // mostrar "nenhum PEI" para alunos que já têm documento salvo.
  useEffect(() => {
    invokeApp<PeisLocaisResultado>("carregar_peis_locais")
      .then((res) => {
        setPastaGeral(res.pasta);
        setRegistros(res.registros);
      })
      .catch(() => {});
  }, []);

  const semestre = useMemo(() => semestreAtivo(prazos), [prazos]);

  const registrosPorAluno = useMemo(() => {
    const mapa = new Map<string, RegistroPei[]>();
    for (const r of registros) {
      const chave = normalizarNome(r.nome_aluno);
      const lista = mapa.get(chave) ?? [];
      lista.push(r);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [registros]);

  const registrosDoAluno = useMemo(() => {
    if (!alunoSelecionado) return [];
    return registrosPorAluno.get(normalizarNome(alunoSelecionado.nome)) ?? [];
  }, [alunoSelecionado, registrosPorAluno]);

  const disciplinasDoAluno = useMemo(() => {
    // Apenas as disciplinas do mapão, em MAIÚSCULAS e sem duplicatas (matérias que
    // se repetem em FGB/IF aparecem uma vez). Os PEIs recebidos são casados a essas
    // linhas — o texto livre digitado pelo professor não cria uma linha nova.
    const todas = new Map<string, string>();
    for (const d of alunoSelecionado?.disciplinas ?? []) {
      const norm = normalizarDisciplina(d);
      if (norm) todas.set(norm, norm);
    }
    return Array.from(todas.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [alunoSelecionado]);

  const matrizPei = useMemo(() => {
    const indice = new Map<string, RegistroPei>();
    for (const r of registrosDoAluno) {
      const chave = `${normalizarDisciplina(r.disciplina)}|${r.bimestre}`;
      indice.set(chave, r);
    }
    return indice;
  }, [registrosDoAluno]);

  function atualizarUrlLegado(valor: string) {
    setConfig((c) => ({ ...c, url_legado: valor }));
  }

  function salvarConfig(): Promise<void> {
    return invokeApp("salvar_config_pei", { config }).then(() => {});
  }

  function carregarPeis() {
    const urlLegado = config.url_legado.trim();
    if (!urlLegado && !config.planilha_automatica_id.trim() && !config.webapp_url.trim()) {
      setErro("Informe o link de uma planilha ou crie o Web App automaticamente.");
      return;
    }
    setCarregando(true);
    setErro("");
    salvarConfig().catch(() => {})
      .then(() => invokeApp<RegistroPei[]>("buscar_peis", { config }))
      .then((dados) => {
        const agora = new Date().toLocaleString("pt-BR");
        setUltimaBusca(agora);
        localStorage.setItem(PEI_ULTIMA_BUSCA_KEY, agora);
        setConfigAberta(false);
        // Não faz setRegistros(dados) direto: a tela só reflete o que
        // realmente foi (ou já estava) gerado em disco — gerarLote mescla
        // isto com o índice local e é quem atualiza `registros` de fato.
        gerarLote(dados);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)))
      .finally(() => setCarregando(false));
  }

  async function criarWebAppPeiAutomatico() {
    const perfilLocal = garantirPerfilPersistido();
    if (
      config.configurado_por_user_id
      && config.configurado_por_user_id !== perfilLocal.userId
      && !window.confirm(
        "Esta configuração de PEI já foi feita por outro coordenador do grupo de trabalho e está em uso por "
        + "todos. Continuar cria uma configuração própria nesta máquina e SUBSTITUI a atual — o ideal é ter só "
        + "uma configuração ativa por grupo de trabalho. Quer continuar mesmo assim?"
      )
    ) {
      return;
    }
    setCriandoWebApp(true);
    setErroWebApp("");
    try {
      const resultado = await invokeApp<ProvisionamentoPeiResultado>(
        "provisionar_pei_automatico",
        { config }
      );
      const novaConfig: ConfigPei = {
        ...config,
        planilha_automatica_id: resultado.planilha_id,
        webapp_url: resultado.webapp_url,
        apps_script_projeto_id: resultado.apps_script_projeto_id,
        apps_script_deployment_id: resultado.apps_script_deployment_id,
        token_leitura: resultado.token_leitura,
        configurado_por_user_id: perfilLocal.userId,
      };
      setConfig(novaConfig);
      setConfiguradoPorOutro(false);
      setMembroConfigurador(null);
      await invokeApp("salvar_config_pei", { config: novaConfig }).catch(() => {});
    } catch (err) {
      setErroWebApp(err instanceof Error ? err.message : String(err));
    } finally {
      setCriandoWebApp(false);
    }
  }

  // Colado de outro coordenador (que já configurou o Web App): evita repetir
  // a criação/OAuth só para ler os mesmos dados — ver
  // pei::importar_config_pei_por_link.
  function importarLinkRecebido() {
    const link = linkRecebido.trim();
    if (!link) return;
    setImportandoLink(true);
    setStatusImportarLink("");
    invokeApp<ConfigPei>("importar_config_pei_por_link", { link })
      .then((novaConfig) => {
        setConfig({ ...CONFIG_PEI_PADRAO, ...novaConfig });
        setLinkRecebido("");
        setStatusImportarLink("Link importado! Já pode buscar os PEIs.");
      })
      .catch((err) => setStatusImportarLink(err instanceof Error ? err.message : String(err)))
      .finally(() => setImportandoLink(false));
  }

  function gerarLote(recs: RegistroPei[]) {
    if (recs.length === 0) return;
    setGerando(true);
    setStatusGeracao("Gerando documentos PEI...");
    invokeApp<GerarPeisLoteResultado>("gerar_peis_lote", { registros: recs })
      .then((res) => {
        setPastaGeral(res.pasta);
        // Fonte de verdade da tela vira o índice mesclado (local + esta
        // leva) devolvido pelo backend — nunca o `recs` cru da planilha,
        // que pode vir parcial numa busca com erro.
        setRegistros(res.registros);
        const partes: string[] = [];
        if (res.arquivos > 0) partes.push(`${res.arquivos} gerado(s)`);
        if (res.pulados > 0) partes.push(`${res.pulados} sem mudança`);
        if (res.erros.length > 0) partes.push(`${res.erros.length} erro(s)`);
        setStatusGeracao(partes.length > 0 ? `${partes.join(", ")}.` : "Nenhum PEI novo.");
      })
      .catch((err) => setStatusGeracao(`Erro ao gerar: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setGerando(false));
  }

  // Relatório de pendências: por aluno elegível, disciplinas sem PEI até o
  // bimestre atual (mesmo critério do indicador da lista).
  async function gerarRelatorioPendencias() {
    if (alunosElegiveis.length === 0) {
      setErroPeiAbrir("Importe o mapão e os elegíveis antes de gerar o relatório.");
      return;
    }
    setGerandoPend(true);
    setErroPeiAbrir("");
    try {
      // Bimestres coletados = os que aparecem em algum PEI recebido (ex.: 1º, 2º).
      const bimestresColetados = Array.from(
        new Set(registros.map((r) => r.bimestre).filter(Boolean))
      ).sort();
      const bims = bimestresColetados.length ? bimestresColetados : ["1"];

      const secoes = alunosElegiveis
        .map((aluno) => {
          const peis = registrosPorAluno.get(normalizarNome(aluno.nome)) ?? [];
          const disciplinas = Array.from(
            new Set((aluno.disciplinas ?? []).map(normalizarDisciplina).filter(Boolean))
          ).sort((a, b) => a.localeCompare(b, "pt-BR"));
          const linhas = disciplinas
            .map((disc) => {
              const faltam = bims.filter(
                (b) => !peis.some((r) => r.bimestre === b && normalizarDisciplina(r.disciplina) === disc)
              );
              return { item: disc, faltam: faltam.map((b) => `${b}º`).join(", ") };
            })
            .filter((l) => l.faltam.length > 0);
          return { titulo: `${aluno.turma} — ${aluno.nome}`, linhas };
        })
        .filter((s) => s.linhas.length > 0);

      const periodo = bims.map((b) => `${b}º`).join(", ");
      const res = await invokeApp<{ caminho: string }>("gerar_relatorio_pendencias", {
        input: {
          titulo: "PENDÊNCIAS — PEI",
          criterio: `Lista, por aluno elegível, as disciplinas (do mapão) sem PEI recebido nos bimestres coletados: ${periodo}.`,
          coluna_item: "Disciplina",
          escopo: "pei",
          secoes,
        },
      });
      await invokeApp("abrir_documento_conselho", { input: { caminho: res.caminho } }).catch(() => {});
    } catch (err) {
      setErroPeiAbrir(err instanceof Error ? err.message : String(err));
    } finally {
      setGerandoPend(false);
    }
  }

  const totalPeis = useMemo(() => {
    return alunosElegiveis.reduce((total, aluno) => {
      const n = (registrosPorAluno.get(normalizarNome(aluno.nome)) ?? []).length;
      return total + (n > 0 ? 1 : 0);
    }, 0);
  }, [alunosElegiveis, registrosPorAluno]);

  return (
    <>
      <header className="topbar council-topbar">
        <div>
          <span className="eyebrow">
            {alunoSelecionado
              ? `${alunoSelecionado.turma} — ${alunoSelecionado.nome}`
              : "Todos os alunos elegíveis"}
          </span>
          <h1>PEI — Plano Educacional Individualizado</h1>
        </div>
        <div className="council-actions">
          {gerando && (
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Gerando PEIs…
            </span>
          )}
          {!gerando && statusGeracao && (
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              {statusGeracao}
            </span>
          )}
          {alunosElegiveis.length > 0 && (
            <button onClick={gerarRelatorioPendencias} disabled={gerandoPend} title="Gerar relatório dos PEIs que faltam">
              <ClipboardList size={18} />
              {gerandoPend ? "Gerando…" : "Pendências"}
            </button>
          )}
          {pastaGeral && (
            <button
              onClick={() => invokeApp("abrir_pasta", { caminho: pastaGeral }).catch(() => {})}
              title="Abrir pasta com todos os PEIs gerados"
            >
              <FolderOpen size={18} />
              Abrir pasta
            </button>
          )}
          <button onClick={() => setConfigAberta((a) => !a)} title="Configurar planilha">
            <Settings size={18} />
            Planilha
          </button>
        </div>
      </header>

      {configuradoPorOutro && !configAberta && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap",
            border: "1px solid var(--border-color, #333)", borderRadius: "10px",
            padding: "0.8rem 1rem", margin: "0 0 1rem",
          }}
        >
          {membroConfigurador?.avatarDataUrl && (
            <img
              src={membroConfigurador.avatarDataUrl}
              alt=""
              style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
          )}
          <p style={{ margin: 0, flex: 1, minWidth: "220px", fontSize: "0.88rem" }}>
            <strong>{membroConfigurador?.displayName || "Outro coordenador da equipe"}</strong> já configurou o PEI
            automático para a escola — não é preciso criar um novo.
          </p>
          <button type="button" className="primary-action" onClick={carregarPeis} disabled={carregando}>
            <RefreshCw size={14} /> {carregando ? "Carregando..." : "Carregar agora"}
          </button>
          <button type="button" className="ghost-action" onClick={() => setConfigAberta(true)}>
            Ver configurações avançadas
          </button>
        </div>
      )}

      {/* Diálogo modal de configuração */}
      {configAberta && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setConfigAberta(false); }}>
          <section
            className="whats-new-modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "860px", width: "92vw", maxHeight: "88vh", overflowY: "auto", textAlign: "left" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div>
                <span className="eyebrow">PEI</span>
                <h2 style={{ margin: "0.15rem 0 0" }}>Configurar planilha de respostas</h2>
              </div>
              <button type="button" className="ghost-action" onClick={() => setConfigAberta(false)} style={{ marginTop: "0.25rem" }} title="Fechar">
                <X size={16} />
              </button>
            </div>

            <p style={{ marginBottom: "1rem" }}>
              Os PEIs são coletados por um Web App próprio (recomendado) — só aparecem as turmas com aluno
              elegível — ou, alternativamente, por um Google Forms criado manualmente.
            </p>

            <div style={{ display: "flex", gap: "0.4rem", borderBottom: "1px solid var(--border-color, #333)", marginBottom: "1.1rem" }}>
              <button
                type="button"
                onClick={() => setAbaConfig("automatico")}
                style={{
                  padding: "0.5rem 0.9rem", border: "none", borderBottom: abaConfig === "automatico" ? "2px solid var(--accent)" : "2px solid transparent",
                  background: "none", fontWeight: abaConfig === "automatico" ? 700 : 500, cursor: "pointer",
                }}
              >
                Automático (recomendado)
              </button>
              <button
                type="button"
                onClick={() => setAbaConfig("manual")}
                style={{
                  padding: "0.5rem 0.9rem", border: "none", borderBottom: abaConfig === "manual" ? "2px solid var(--accent)" : "2px solid transparent",
                  background: "none", fontWeight: abaConfig === "manual" ? 700 : 500, cursor: "pointer",
                }}
              >
                Manual (Forms legado)
              </button>
            </div>

            {abaConfig === "automatico" && (
              <div style={{ border: "1px solid var(--border-color, #333)", borderRadius: "10px", padding: "0.9rem 1rem", marginBottom: "1.2rem" }}>
                <strong>Criação automática</strong>
                <p style={estiloTextoPassoPEI}>
                  Cria (ou atualiza) o Web App e a planilha de respostas automaticamente via OAuth, sem precisar
                  criar Forms nem compartilhar planilha nenhuma. Só aparecem as turmas com aluno elegível — o
                  professor escolhe a própria turma e só vê os alunos elegíveis dela. Republicar reflete
                  mudanças de turmas/elegíveis mas preserva as respostas já recebidas.
                </p>
                <p style={{ ...estiloTextoPassoPEI, marginTop: "0.5rem" }}>
                  <strong>Se o Google mostrar "Acesso bloqueado" ou "app não verificado"</strong> ao autorizar, sua
                  conta não está liberada no client compartilhado do CoordenacaoOP (limite de contas de teste do
                  Google). Veja o tutorial{" "}
                  <a
                    href="https://github.com/thenriques45-dot/coordenacao-op/blob/main/docs/manual_usuario/Configurar_Client_OAuth_Proprio.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Configurar_Client_OAuth_Proprio.md
                  </a>{" "}
                  para criar seu próprio client OAuth (gratuito, ~10-15 min) e usar sem esse limite.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <button type="button" className={config.webapp_url ? "secondary-action" : "primary-action"} onClick={criarWebAppPeiAutomatico} disabled={criandoWebApp}>
                    <Sparkles size={14} />{" "}
                    {criandoWebApp
                      ? "Aguardando autorização no navegador..."
                      : config.webapp_url
                        ? "Atualizar turmas / republicar"
                        : "Criar automaticamente"}
                  </button>
                </div>
                {config.webapp_url && (
                  <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.5rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.5rem" }}>
                      <button type="button" className="primary-action" style={{ justifyContent: "center" }} onClick={() => invokeApp("abrir_url", { url: config.webapp_url }).catch(() => {})}>
                        <ExternalLink size={14} /> Abrir PEI
                      </button>
                      <button type="button" className="secondary-action" style={{ justifyContent: "center" }} onClick={() => navigator.clipboard.writeText(config.webapp_url)}>
                        <Copy size={14} /> Copiar link para professores
                      </button>
                      {config.token_leitura && (
                        <button
                          type="button"
                          className="secondary-action"
                          style={{ justifyContent: "center" }}
                          onClick={() => navigator.clipboard.writeText(`${config.webapp_url}?respostas=${config.token_leitura}`)}
                        >
                          <Copy size={14} /> Copiar link para coordenadores
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary-action"
                        style={{ justifyContent: "center" }}
                        onClick={() =>
                          invokeApp("abrir_url", {
                            url: `https://docs.google.com/spreadsheets/d/${config.planilha_automatica_id}/edit`,
                          }).catch(() => {})
                        }
                      >
                        <FileText size={14} /> Abrir planilha de respostas
                      </button>
                    </div>
                    {config.token_leitura && (
                      <p style={{ ...estiloTextoPassoPEI, marginTop: "0.1rem", color: "var(--danger, #ef4444)" }}>
                        Atenção: o link "para coordenadores" dá acesso de leitura a dados sensíveis dos estudantes
                        (nome, disciplina, adaptações). Os dois links são diferentes — mande o "para coordenadores"
                        só para quem coordena com você, nunca para a lista de professores.
                      </p>
                    )}
                    <p style={{ ...estiloTextoPassoPEI, marginTop: "0.1rem" }}>
                      <strong>Passo único, opcional:</strong> se quiser que os professores recebam uma cópia por
                      e-mail ao enviar o PEI, é preciso autorizar o envio uma vez por Web App (o Google não aceita
                      isso vindo só da autorização automática). Abra{" "}
                      <a href="https://script.google.com/home" target="_blank" rel="noreferrer">script.google.com/home</a>,
                      entre no projeto <em>"PEI — CoordenacaoOP"</em>, selecione a função{" "}
                      <code>autorizarEnvioEmail</code> no menu de funções, clique em <em>Executar</em> (▶) e autorize
                      "Enviar e-mail em seu nome". Sem esse passo, o PEI continua sendo salvo normalmente — só a
                      cópia por e-mail não sai.
                    </p>
                    <p style={{ ...estiloTextoPassoPEI, marginTop: "0.6rem" }}>
                      <strong>Se o link parar de abrir para outras pessoas</strong> depois de republicar (aparecer
                      uma tela de "Acesso negado"/"Você precisa de permissão" do Google), é uma falha conhecida da
                      própria API do Google ao atualizar implantações existentes. Abra{" "}
                      <a href="https://script.google.com/home" target="_blank" rel="noreferrer">script.google.com/home</a>,
                      entre no projeto, vá em <em>Implantar → Gerenciar implantações</em>, edite a implantação ativa e
                      confirme/resalve com <em>"Quem pode acessar"</em> em <em>"Qualquer pessoa"</em> — a URL não muda.
                    </p>
                  </div>
                )}
                {erroWebApp && <p style={{ ...estiloTextoPassoPEI, color: "var(--danger, #ef4444)", marginTop: "0.45rem" }}>{erroWebApp}</p>}
              </div>
            )}

            {abaConfig === "automatico" && (
              <div style={{ border: "1px solid var(--border-color, #333)", borderRadius: "10px", padding: "0.9rem 1rem", marginBottom: "1.2rem" }}>
                <strong>Já tem um Web App configurado por outro coordenador?</strong>
                <p style={estiloTextoPassoPEI}>
                  Cole aqui o "link para coordenadores" que ele te mandou — evita criar um Web App e uma planilha
                  novos só para ver os mesmos PEIs.
                </p>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    type="url"
                    placeholder="Cole aqui o link recebido"
                    value={linkRecebido}
                    onChange={(e) => setLinkRecebido(e.target.value)}
                    style={{ flex: 1, minWidth: "220px" }}
                  />
                  <button type="button" onClick={importarLinkRecebido} disabled={importandoLink || !linkRecebido.trim()}>
                    {importandoLink ? "Validando..." : "Usar este link"}
                  </button>
                </div>
                {statusImportarLink && (
                  <p style={{ ...estiloTextoPassoPEI, marginTop: "0.45rem" }}>{statusImportarLink}</p>
                )}
              </div>
            )}

            {abaConfig === "manual" && (
              <>
                {/* Campo de URL — no topo */}
                <div style={{ background: "var(--surface-elevated, var(--surface))", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.85rem 1rem", marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>
                    Link da planilha de respostas
                  </label>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                    <input
                      type="url"
                      value={config.url_legado}
                      onChange={(e) => atualizarUrlLegado(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>

                {/* Passo 1 */}
                <div style={estiloPassoPEI}>
                  <div style={estiloNumPassoPEI}>1</div>
                  <div style={{ flex: 1 }}>
                    <strong>Criar o formulário no Google Forms</strong>
                    <p style={estiloTextoPassoPEI}>
                      Acesse <em>forms.google.com</em> e crie um novo formulário. Ative a coleta de e-mail
                      (ícone de engrenagem → <em>Coletar endereço de e-mail</em>). Adicione as perguntas
                      abaixo <strong>nesta ordem e com estes títulos</strong> (o programa os detecta pelo conteúdo):
                    </p>
                    <ol style={{ margin: "0.5rem 0 0", padding: "0 0 0 1.2rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                      {[
                        ["Nome do Professor", "resposta curta"],
                        ["Nome do Estudante", "resposta curta — formato: NOME COMPLETO - TURMA PERÍODO  (ex: JOÃO SILVA - 7° ANO A TARDE)"],
                        ["Componente Curricular", "resposta curta"],
                        ["Bimestre", "múltipla escolha: 1º Bimestre · 2º Bimestre · 3º Bimestre · 4º Bimestre"],
                        ["Quais conteúdos e habilidades do Currículo da Rede Estadual Paulista serão desenvolvidos no bimestre?", "parágrafo"],
                        ["Quais estratégias, intervenções pedagógicas e recursos de acessibilidade serão utilizados para favorecer o acesso, a participação e a aprendizagem do estudante?", "parágrafo"],
                        ["Quais instrumentos serão utilizados para acompanhar o aprendizado do estudante de forma inclusiva e individualizada?", "parágrafo"],
                        ["Quais vídeos, livros, jogos, exercícios ou outras atividades podem ser indicados para apoiar, complementar, suplementar e fortalecer o aprendizado do estudante neste componente curricular, considerando suas potencialidades, especificidades e ritmo de aprendizagem?", "parágrafo"],
                      ].map(([titulo, tipo], i) => (
                        <li key={i} style={{ fontSize: "0.84rem", lineHeight: 1.45 }}>
                          <span>{titulo}</span>
                          <span style={{ marginLeft: "0.4rem", fontSize: "0.74rem", color: "var(--text-secondary)", background: "var(--border)", borderRadius: "4px", padding: "0.05rem 0.35rem", whiteSpace: "nowrap" }}>
                            {tipo}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Passo 2 */}
                <div style={estiloPassoPEI}>
                  <div style={estiloNumPassoPEI}>2</div>
                  <div style={{ flex: 1 }}>
                    <strong>Vincular o formulário a uma planilha</strong>
                    <ol style={estiloTextoPassoPEI}>
                      <li>No formulário, clique na aba <em>Respostas</em>.</li>
                      <li>Clique no ícone de planilha do Google Sheets (ou em <em>Vincular planilhas</em>).</li>
                      <li>Escolha <em>Criar uma nova planilha</em> e confirme.</li>
                      <li>A planilha de respostas será criada automaticamente e atualizada a cada envio.</li>
                    </ol>
                  </div>
                </div>

                {/* Passo 3 */}
                <div style={{ ...estiloPassoPEI, marginBottom: "1.25rem" }}>
                  <div style={estiloNumPassoPEI}>3</div>
                  <div style={{ flex: 1 }}>
                    <strong>Compartilhar a planilha e colar o link acima</strong>
                    <ol style={estiloTextoPassoPEI}>
                      <li>Abra a planilha de respostas no Google Sheets.</li>
                      <li>Clique em <em>Compartilhar</em> (canto superior direito).</li>
                      <li>Em <em>Acesso geral</em>, selecione <em>Qualquer pessoa com o link</em> como <em>Leitor</em>.</li>
                      <li>Copie o link e cole no campo acima.</li>
                    </ol>
                  </div>
                </div>
              </>
            )}

            {ultimaBusca && (
              <p style={{ fontSize: "0.76rem", color: "var(--text-secondary)", margin: "0 0 0.5rem" }}>
                Última atualização: {ultimaBusca} · {registros.length} PEI(s) carregado(s)
              </p>
            )}
            {erro && <div className="notice error" style={{ marginBottom: "0.5rem" }}>{erro}</div>}

            <div className="modal-actions" style={{ marginTop: "0.5rem", gap: "0.6rem" }}>
              <button onClick={() => setConfigAberta(false)}>Fechar</button>
              <button onClick={() => salvarConfig().catch((e) => setErro(String(e)))}>Salvar</button>
              <button className="primary-action" onClick={carregarPeis} disabled={carregando}>
                <RefreshCw size={14} /> {carregando ? "Carregando..." : "Carregar PEIs"}
              </button>
            </div>
          </section>
        </div>
      )}


      <section className="council-workspace">
        {/* Lista de alunos elegíveis */}
        <aside className="panel student-list-panel">
          <div className="panel-heading">
            <h3>Alunos elegíveis</h3>
          </div>
          <div style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
            {alunosElegiveis.length} elegível(is) · {totalPeis} com PEI
          </div>
          <div className="student-list">
            {alunosElegiveis.length === 0 && (
              <p style={{ padding: "0.75rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Nenhum aluno elegível. Importe o mapão e os elegíveis.
              </p>
            )}
            {alunosElegiveis.map((aluno) => {
              const chave = normalizarNome(aluno.nome);
              const peis = registrosPorAluno.get(chave) ?? [];
              const ativo = alunoSelecionado?.matricula === aluno.matricula;
              const status = statusPeiAluno(aluno, peis, semestre);
              return (
                <button
                  key={aluno.matricula}
                  className={`student-list-item ${ativo ? "active" : ""}`}
                  onClick={() => {
                                    setAlunoSelecionado(ativo ? null : aluno);
                  }}
                >
                  <div>
                    <strong>{aluno.nome}</strong>
                    <span>{aluno.turma}</span>
                  </div>
                  <div className="student-list-status">
                    <i className={status} />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Painel central: matriz disciplinas × bimestres */}
        <section className="panel council-detail-panel">
          {!alunoSelecionado ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
              <BookMarked size={40} style={{ opacity: 0.3, marginBottom: "0.75rem" }} />
              <p>Selecione um aluno elegível à esquerda para ver os PEIs por disciplina e bimestre.</p>
              {registros.length === 0 && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.84rem" }}>
                  Depois configure a planilha clicando em <strong>Planilha</strong> no canto superior direito.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="student-detail-header">
                <div>
                  <div className="student-name">
                    <span className="eligible-badge">ALUNO ELEGÍVEL</span>
                    <h2>{alunoSelecionado.nome}</h2>
                  </div>
                  <p>
                    {alunoSelecionado.turma} · {registrosDoAluno.length} PEI(s) recebido(s)
                    {registrosDoAluno.length > 0 && pastaGeral && (
                      <> ·{" "}
                        <button
                          className="ghost-action"
                          style={{ display: "inline", padding: 0, fontSize: "inherit" }}
                          onClick={() => invokeApp("abrir_pasta", {
                            caminho: `${pastaGeral}/${alunoSelecionado.nome.replace(/[^a-zA-Z0-9 _-]/g, "_")}`,
                          }).catch(() =>
                            invokeApp("abrir_pasta", { caminho: pastaGeral }).catch(() => {})
                          )}
                        >
                          Abrir pasta do aluno
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Tabela matriz */}
              <div className="table-panel">
                <div className="panel-heading">
                  <h3>PEIs por disciplina e bimestre</h3>
                </div>
                {disciplinasDoAluno.length === 0 ? (
                  <p style={{ padding: "0.75rem", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                    Nenhuma disciplina encontrada. Importe o mapão para carregar as disciplinas desta turma.
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", minWidth: "160px" }}>Disciplina</th>
                        {BIMESTRES.map((b) => (
                          <th key={b} style={{ textAlign: "center", width: "80px" }}>
                            {b}º Bim
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {disciplinasDoAluno.map((disciplina) => (
                        <tr key={disciplina}>
                          <td>{disciplina}</td>
                          {BIMESTRES.map((b) => {
                            const chave = `${normalizarDisciplina(disciplina)}|${b}`;
                            const pei = matrizPei.get(chave);
                            return (
                              <td key={b} style={{ textAlign: "center" }}>
                                {pei ? (
                                  <button
                                    type="button"
                                    title={`Abrir PEI de ${disciplina} — ${b}º bimestre (Prof. ${pei.professor})`}
                                    onClick={() => {
                                      setErroPeiAbrir("");
                                      invokeApp("abrir_pei_docx", {
                                        nomeAluno: alunoSelecionado!.nome,
                                        disciplina: pei.disciplina,
                                        bimestre: pei.bimestre,
                                      }).catch((err: unknown) =>
                                        setErroPeiAbrir(err instanceof Error ? err.message : String(err))
                                      );
                                    }}
                                    style={{
                                      background: "transparent",
                                      border: "1px solid transparent",
                                      borderRadius: "6px",
                                      padding: "0.25rem 0.4rem",
                                      cursor: "pointer",
                                      color: "var(--accent)",
                                      display: "inline-flex",
                                      alignItems: "center",
                                    }}
                                  >
                                    <FileText size={16} />
                                  </button>
                                ) : (
                                  <span style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {erroPeiAbrir && (
                <div className="notice error" style={{ marginTop: "0.75rem" }}>
                  {erroPeiAbrir}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </>
  );
}
