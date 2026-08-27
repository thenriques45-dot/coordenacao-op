import { BookMarked, ClipboardList, Copy, ExternalLink, FileText, FolderOpen, PenLine, RefreshCw, Settings, Sparkles, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";
import { semestreAtivo, type PrazosSemestre } from "./semestre";
import { useWebAppConfig } from "./useWebAppConfig";
import { BIMESTRES, ConfiguradoPorOutroBanner, MatrizBimestral } from "./webAppConfigUi";
import { agruparMembrosPorPessoa, carregarMembrosSincronizacao, garantirPerfilPersistido } from "./workgroupSync";

type TurmaResumoPei = {
  codigo: string;
  serie: string | null;
  caminho: string;
  pei_coordenador_gestao?: string | null;
  pei_prof_especializado?: string | null;
  pei_direcao?: string | null;
};

type PessoasPeiTurma = {
  coordenador_gestao: string;
  prof_especializado: string;
  direcao: string;
};

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
  turma_caminho: string;
  disciplinas: string[];
  disciplinas_por_bimestre: Record<string, string[]>;
  responsavel: string | null;
};

const PEI_ULTIMA_BUSCA_KEY = "coordenacaoop:pei-ultima-busca";

function normalizarNome(nome: string) {
  return nome
    .trim()
    .toLocaleUpperCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

// Além de maiúsculas/acento, ignora diferenças de redação que não mudam a
// disciplina: hífen, o conector "em" e um sufixo de série colado no fim
// (ver mesma função em Planejamento.tsx para o caso real que motivou isto).
function normalizarDisciplina(nome: string) {
  return nome
    .trim()
    .toLocaleUpperCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*-?\s*\d+[ºO]?\s*ANO\s*$/i, "")
    .replace(/[-–—]/g, " ")
    .replace(/\bEM\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export function TelaPEI({ turmas = [], onTurmasAlteradas }: { turmas?: TurmaResumoPei[]; onTurmasAlteradas?: () => void }) {
  const {
    config, setConfig, configAberta, setConfigAberta, abaConfig, setAbaConfig,
    carregando, erro, setErro, ultimaBusca, registros, gerando, statusGeracao,
    pastaGeral, criandoWebApp, erroWebApp, linkRecebido, setLinkRecebido,
    importandoLink, statusImportarLink, configuradoPorOutro, membroConfigurador,
    podeReivindicar, reivindicando, reivindicar,
    salvarConfig, carregar: carregarPeis, gerarLote, criarWebAppAutomatico: criarWebAppPeiAutomatico,
    importarLinkRecebido,
  } = useWebAppConfig<ConfigPei, RegistroPei>({
    configPadrao: CONFIG_PEI_PADRAO,
    comandos: {
      carregarConfig: "carregar_config_pei",
      salvarConfig: "salvar_config_pei",
      carregarLocais: "carregar_peis_locais",
      buscar: "buscar_peis",
      gerarLote: "gerar_peis_lote",
      provisionarAutomatico: "provisionar_pei_automatico",
      importarLinkPorConfig: "importar_config_pei_por_link",
    },
    ultimaBuscaKey: PEI_ULTIMA_BUSCA_KEY,
    textos: {
      semFonte: "Informe o link de uma planilha ou crie o Web App automaticamente.",
      confirmarSubstituirConfigDeOutro:
        "Esta configuração de PEI já foi feita por outro coordenador do grupo de trabalho e está em uso por "
        + "todos. Continuar cria uma configuração própria nesta máquina e SUBSTITUI a atual — o ideal é ter só "
        + "uma configuração ativa por grupo de trabalho. Quer continuar mesmo assim?",
      linkImportado: "Link importado! Já pode buscar os PEIs.",
      gerando: "documentos PEI",
      nenhumNovo: "Nenhum PEI novo.",
    },
    temFonteManual: (c) => Boolean(c.url_legado.trim()),
  });

  const [alunosElegiveis, setAlunosElegiveis] = useState<AlunoElegivelComDisciplinas[]>([]);
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoElegivelComDisciplinas | null>(null);
  const [erroPeiAbrir, setErroPeiAbrir] = useState("");
  const [exportandoPei, setExportandoPei] = useState(false);
  const [gerandoPend, setGerandoPend] = useState(false);
  const [prazos, setPrazos] = useState<PrazosSemestre>({ prazo_1_semestre: "", prazo_2_semestre: "" });

  // Tela de assinaturas do PEI: nomes impressos acima das linhas de assinatura.
  const [assinAberta, setAssinAberta] = useState(false);
  // Config completo do app (para gravar vice_direcao sem perder os demais campos).
  const [cfgApp, setCfgApp] = useState<Record<string, unknown> | null>(null);
  const [viceTexto, setViceTexto] = useState("");
  const [pessoasPorTurma, setPessoasPorTurma] = useState<Record<string, PessoasPeiTurma>>({});
  const [salvandoAssin, setSalvandoAssin] = useState(false);
  const [msgAssin, setMsgAssin] = useState("");
  const [respAluno, setRespAluno] = useState("");
  const [salvandoResp, setSalvandoResp] = useState(false);

  useEffect(() => {
    invokeApp<PrazosSemestre & { vice_direcao?: string[]; direcao_nome?: string }>("carregar_configuracoes")
      .then((c) => {
        setPrazos({ prazo_1_semestre: c.prazo_1_semestre, prazo_2_semestre: c.prazo_2_semestre });
        setCfgApp(c as unknown as Record<string, unknown>);
        setViceTexto((c.vice_direcao ?? []).join("\n"));
      })
      .catch(() => {});
  }, []);

  // Semente do editor por turma a partir do que já está salvo em cada turma.
  useEffect(() => {
    setPessoasPorTurma((atual) => {
      const proximo = { ...atual };
      for (const t of turmas) {
        if (!proximo[t.caminho]) {
          proximo[t.caminho] = {
            coordenador_gestao: t.pei_coordenador_gestao ?? "",
            prof_especializado: t.pei_prof_especializado ?? "",
            direcao: t.pei_direcao ?? "",
          };
        }
      }
      return proximo;
    });
  }, [turmas]);

  // Só as turmas que têm aluno elegível (as demais não geram PEI).
  const caminhosComElegivel = useMemo(
    () => new Set(alunosElegiveis.map((a) => a.turma_caminho)),
    [alunosElegiveis]
  );

  // Nomes do grupo de trabalho, para a menção "@nome" nos campos de assinante.
  const membrosGrupo = useMemo(() => {
    const s = new Set<string>();
    for (const m of agruparMembrosPorPessoa(carregarMembrosSincronizacao())) {
      if (m.displayName?.trim()) s.add(m.displayName.trim());
    }
    const perfil = garantirPerfilPersistido();
    if (perfil.displayName?.trim()) s.add(perfil.displayName.trim());
    return Array.from(s);
  }, []);

  // "@wilton" -> nome completo do membro do grupo cujo nome começa com "wilton".
  // Sem correspondência, mantém o texto como digitado (nome livre).
  function resolverMencao(texto: string): string {
    const m = texto.trim().match(/^@(.+)$/);
    if (!m) return texto;
    const alvo = normalizarNome(m[1]);
    const achado = membrosGrupo.find((nome) => normalizarNome(nome).startsWith(alvo));
    return achado ?? texto;
  }

  const direcaoNome = (cfgApp?.direcao_nome as string) ?? "";
  const opcoesDirecao = useMemo(() => {
    const vices = viceTexto.split("\n").map((v) => v.trim()).filter(Boolean);
    return [direcaoNome, ...vices].filter(Boolean);
  }, [direcaoNome, viceTexto]);

  const turmasOrdenadas = useMemo(
    () => turmas
      .filter((t) => caminhosComElegivel.has(t.caminho))
      .sort((a, b) =>
        (a.serie ?? "").localeCompare(b.serie ?? "", "pt-BR") || a.codigo.localeCompare(b.codigo, "pt-BR")
      ),
    [turmas, caminhosComElegivel]
  );

  useEffect(() => {
    invokeApp<AlunoElegivelComDisciplinas[]>("listar_alunos_elegiveis_com_disciplinas")
      .then(setAlunosElegiveis)
      .catch(() => setAlunosElegiveis([]));
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

  useEffect(() => {
    setRespAluno(alunoSelecionado?.responsavel ?? "");
  }, [alunoSelecionado]);

  function editarPessoaTurma(caminho: string, campo: keyof PessoasPeiTurma, valor: string) {
    setPessoasPorTurma((atual) => ({
      ...atual,
      [caminho]: { ...atual[caminho], [campo]: valor },
    }));
  }

  // "Repetir para as turmas abaixo": copia o valor deste campo para todas as
  // todas as turmas da lista — conveniência de digitação, não agregação.
  function repetirEmTodas(campo: keyof PessoasPeiTurma) {
    const primeira = turmasOrdenadas[0];
    if (!primeira) return;
    const base = resolverMencao(pessoasPorTurma[primeira.caminho]?.[campo] ?? "");
    setPessoasPorTurma((atual) => {
      const proximo = { ...atual };
      for (const t of turmasOrdenadas) {
        proximo[t.caminho] = { ...proximo[t.caminho], [campo]: base };
      }
      return proximo;
    });
  }

  async function salvarAssinaturas() {
    setSalvandoAssin(true);
    setMsgAssin("");
    try {
      const vice = viceTexto.split("\n").map((v) => v.trim()).filter(Boolean);
      if (cfgApp) {
        const atualizado = { ...cfgApp, vice_direcao: vice };
        await invokeApp("salvar_configuracoes", { input: atualizado });
        setCfgApp(atualizado);
      }
      for (const t of turmas) {
        const p = pessoasPorTurma[t.caminho];
        if (!p) continue;
        const original = {
          coordenador_gestao: t.pei_coordenador_gestao ?? "",
          prof_especializado: t.pei_prof_especializado ?? "",
          direcao: t.pei_direcao ?? "",
        };
        const mudou = (Object.keys(original) as (keyof PessoasPeiTurma)[]).some(
          (k) => (p[k] ?? "").trim() !== original[k].trim()
        );
        if (mudou) {
          await invokeApp("salvar_pessoas_pei_turma", { caminho: t.caminho, input: p });
        }
      }
      onTurmasAlteradas?.();
      setMsgAssin("Assinaturas salvas. Use “Regerar todos” para aplicar aos PEIs já gerados.");
    } catch (e) {
      setMsgAssin(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvandoAssin(false);
    }
  }

  async function salvarResponsavel() {
    if (!alunoSelecionado) return;
    setSalvandoResp(true);
    setErroPeiAbrir("");
    try {
      await invokeApp("salvar_responsavel_pei_aluno", {
        caminho: alunoSelecionado.turma_caminho,
        matricula: alunoSelecionado.matricula,
        responsavel: respAluno,
      });
      setAlunosElegiveis((lista) =>
        lista.map((a) =>
          a.matricula === alunoSelecionado.matricula && a.turma_caminho === alunoSelecionado.turma_caminho
            ? { ...a, responsavel: respAluno.trim() || null }
            : a
        )
      );
      setAlunoSelecionado((a) => (a ? { ...a, responsavel: respAluno.trim() || null } : a));
    } catch (e) {
      setErroPeiAbrir(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvandoResp(false);
    }
  }

  function regerarTodos() {
    if (registros.length === 0) return;
    if (!window.confirm(
      `Regerar os ${registros.length} PEI(s) já registrados, reescrevendo todos os .docx com os nomes de assinatura atuais? Os PDFs são regerados quando você exporta cada aluno.`
    )) return;
    gerarLote(registros, true);
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
          <button onClick={() => setAssinAberta(true)} title="Definir os nomes que aparecem acima das linhas de assinatura">
            <PenLine size={18} />
            Assinaturas
          </button>
          {registros.length > 0 && (
            <button onClick={regerarTodos} disabled={gerando} title="Reescreve todos os .docx já gerados com os nomes de assinatura atuais">
              <RefreshCw size={18} />
              Regerar todos
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
        <ConfiguradoPorOutroBanner
          membro={membroConfigurador}
          rotulo="PEI"
          carregando={carregando}
          onCarregarAgora={carregarPeis}
          onVerConfiguracoes={() => setConfigAberta(true)}
          onReivindicar={podeReivindicar ? reivindicar : undefined}
          reivindicando={reivindicando}
        />
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


      {/* Diálogo modal de assinaturas do PEI */}
      {assinAberta && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setAssinAberta(false); }}>
          <section
            className="whats-new-modal"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "1120px", width: "96vw", maxHeight: "88vh", overflowY: "auto", textAlign: "left" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div>
                <span className="eyebrow">PEI</span>
                <h2 style={{ margin: "0.15rem 0 0" }}>Assinaturas do PEI</h2>
              </div>
              <button type="button" className="ghost-action" onClick={() => setAssinAberta(false)} style={{ marginTop: "0.25rem" }} title="Fechar">
                <X size={16} />
              </button>
            </div>

            <p style={{ marginBottom: "1rem", fontSize: "0.86rem", color: "var(--text-secondary)" }}>
              O nome de cada pessoa é impresso acima da linha de assinatura — o app não gera rubricas, a
              assinatura continua sendo feita por quem assina. O <strong>professor regente</strong> vem
              automaticamente de quem respondeu o PEI. O <strong>responsável</strong> pelo estudante é
              definido na ficha do aluno (painel à direita) e fica em branco se não cadastrado.
            </p>

            <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.85rem 1rem", marginBottom: "1.2rem" }}>
              <strong>Direção</strong>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0.3rem 0 0.5rem" }}>
                Diretor(a): <strong>{direcaoNome || "defina em Configurações"}</strong>. Um vice-diretor por
                linha — ficam disponíveis para escolher em cada turma abaixo.
              </p>
              <textarea
                value={viceTexto}
                onChange={(e) => setViceTexto(e.target.value)}
                rows={3}
                placeholder={"NOME DO VICE-DIRETOR 1\nNOME DO VICE-DIRETOR 2"}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <strong>Por turma</strong>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0.3rem 0 0.6rem" }}>
              Só aparecem as turmas com aluno elegível. Digite o nome do coordenador ou{" "}
              <strong>@nome</strong> para puxar do grupo de trabalho. Deixe o professor especializado em
              branco se a escola não tem essa pessoa — a linha recebe o coordenador de gestão da turma.
              “Repetir em todas” copia o valor da primeira turma para as demais.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "34%" }} />
                  <col />
                </colgroup>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-secondary)", verticalAlign: "bottom" }}>
                    <th style={{ padding: "0.3rem 0.4rem" }}>Turma</th>
                    <th style={{ padding: "0.3rem 0.4rem" }}>
                      Coord. de Gestão Pedagógica
                      <button type="button" className="ghost-action" style={{ display: "block", padding: 0, fontSize: "0.72rem", fontWeight: 400 }}
                        onClick={() => repetirEmTodas("coordenador_gestao")}>↓ repetir em todas</button>
                    </th>
                    <th style={{ padding: "0.3rem 0.4rem" }}>
                      Prof. Especializado / Ensino Colaborativo
                      <button type="button" className="ghost-action" style={{ display: "block", padding: 0, fontSize: "0.72rem", fontWeight: 400 }}
                        onClick={() => repetirEmTodas("prof_especializado")}>↓ repetir em todas</button>
                    </th>
                    <th style={{ padding: "0.3rem 0.4rem" }}>
                      Direção
                      <button type="button" className="ghost-action" style={{ display: "block", padding: 0, fontSize: "0.72rem", fontWeight: 400 }}
                        onClick={() => repetirEmTodas("direcao")}>↓ repetir em todas</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {turmasOrdenadas.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: "0.6rem 0.4rem", color: "var(--text-secondary)" }}>
                      Nenhuma turma com aluno elegível.
                    </td></tr>
                  )}
                  {turmasOrdenadas.map((t) => {
                    const p = pessoasPorTurma[t.caminho] ?? { coordenador_gestao: "", prof_especializado: "", direcao: "" };
                    const campoTexto = (campo: keyof PessoasPeiTurma) => (
                      <input
                        value={p[campo]}
                        onChange={(e) => editarPessoaTurma(t.caminho, campo, e.target.value)}
                        onBlur={(e) => {
                          const resolvido = resolverMencao(e.target.value);
                          if (resolvido !== e.target.value) editarPessoaTurma(t.caminho, campo, resolvido);
                        }}
                        placeholder="Nome ou @nome"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    );
                    return (
                      <tr key={t.caminho} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.3rem 0.4rem", whiteSpace: "nowrap" }}>{t.codigo}</td>
                        <td style={{ padding: "0.3rem 0.4rem" }}>{campoTexto("coordenador_gestao")}</td>
                        <td style={{ padding: "0.3rem 0.4rem" }}>{campoTexto("prof_especializado")}</td>
                        <td style={{ padding: "0.3rem 0.4rem" }}>
                          <select value={p.direcao} onChange={(e) => editarPessoaTurma(t.caminho, "direcao", e.target.value)} style={{ width: "100%", boxSizing: "border-box" }}>
                            <option value="">{direcaoNome ? `Padrão (${direcaoNome})` : "Padrão"}</option>
                            {opcoesDirecao.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {msgAssin && <div className="notice" style={{ marginTop: "0.75rem" }}>{msgAssin}</div>}

            <div className="modal-actions" style={{ marginTop: "0.8rem", gap: "0.6rem" }}>
              <button onClick={() => setAssinAberta(false)}>Fechar</button>
              <button className="primary-action" onClick={salvarAssinaturas} disabled={salvandoAssin}>
                {salvandoAssin ? "Salvando..." : "Salvar"}
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
                {registrosDoAluno.length > 0 && (
                  <button
                    type="button"
                    className="primary-action"
                    disabled={exportandoPei}
                    onClick={async () => {
                      setErroPeiAbrir("");
                      setExportandoPei(true);
                      try {
                        await invokeApp("exportar_pei_aluno", {
                          nomeAluno: alunoSelecionado!.nome,
                          registros: registrosDoAluno,
                        });
                      } catch (e) {
                        setErroPeiAbrir(e instanceof Error ? e.message : String(e));
                      } finally {
                        setExportandoPei(false);
                      }
                    }}
                  >
                    <FileText size={16} /> {exportandoPei ? "Exportando..." : "Exportar PEI (PDF)"}
                  </button>
                )}
              </div>

              {/* Responsável pelo estudante — impresso acima da linha de assinatura do PEI */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", margin: "0.25rem 0 0.5rem" }}>
                <label style={{ fontSize: "0.82rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  Responsável pelo estudante
                </label>
                <input
                  value={respAluno}
                  onChange={(e) => setRespAluno(e.target.value)}
                  placeholder="Nome de quem assina como responsável (opcional)"
                  style={{ flex: 1, minWidth: "220px" }}
                />
                <button
                  type="button"
                  onClick={salvarResponsavel}
                  disabled={salvandoResp || respAluno.trim() === (alunoSelecionado.responsavel ?? "").trim()}
                >
                  {salvandoResp ? "Salvando..." : "Salvar"}
                </button>
              </div>

              {/* Tabela matriz */}
              <MatrizBimestral
                titulo="PEIs por disciplina e bimestre"
                mensagemVazia="Nenhuma disciplina encontrada. Importe o mapão para carregar as disciplinas desta turma."
                disciplinas={disciplinasDoAluno}
                matriz={matrizPei}
                normalizarDisciplina={normalizarDisciplina}
                tituloBotao={(disciplina, b, pei) => `Abrir PEI de ${disciplina} — ${b}º bimestre (Prof. ${pei.professor})`}
                onAbrir={(_disciplina, _b, pei) => {
                  setErroPeiAbrir("");
                  invokeApp("abrir_pei_docx", {
                    nomeAluno: alunoSelecionado!.nome,
                    disciplina: pei.disciplina,
                    bimestre: pei.bimestre,
                  }).catch((err: unknown) => setErroPeiAbrir(err instanceof Error ? err.message : String(err)));
                }}
              />

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
