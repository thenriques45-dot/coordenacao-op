import { BookMarked, ClipboardCopy, ClipboardList, FileText, FolderOpen, RefreshCw, Settings, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";

type RegistroPlanejamento = {
  professor: string;
  disciplina: string;
  ano: string;
  turma: string;
  turmas: string;
  bimestre: string;
  unidade_tematica: string;
  objetos_conhecimento: string;
  habilidades: string;
  estrategias: string;
  recursos: string;
  avaliacao: string;
  adaptacao_curricular: string;
  verificacao_objetivo: string;
};

type GerarPlanejamentosLoteResultado = { pasta: string; arquivos: number; erros: string[] };

type TurmaResumo = {
  codigo: string;
  ano: number;
  serie: string | null;
  ciclo: string | null;
  periodo: string | null;
  caminho: string;
};

type ParPlanejamento = { sem1: string; sem2: string };
type ConfigPlanejamento = { fundamental: ParPlanejamento; medio: ParPlanejamento; versao: string };

const CONFIG_PADRAO: ConfigPlanejamento = {
  fundamental: { sem1: "", sem2: "" },
  medio: { sem1: "", sem2: "" },
  versao: "",
};

const PLANEJAMENTO_ULTIMA_BUSCA_KEY = "coordenacaoop:planejamento-ultima-busca";
const PLANEJAMENTO_REGISTROS_KEY = "coordenacaoop:planejamento-registros-cache";
const BIMESTRES = ["1", "2", "3", "4"];

function normalizarTurma(valor: string) {
  return valor.trim().toLocaleUpperCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}
function normalizarDisciplina(valor: string) {
  return valor.trim().toLocaleUpperCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function carregarRegistrosCache(): RegistroPlanejamento[] {
  try {
    const salvo = localStorage.getItem(PLANEJAMENTO_REGISTROS_KEY);
    return salvo ? (JSON.parse(salvo) as RegistroPlanejamento[]) : [];
  } catch {
    return [];
  }
}

function urlsDaConfig(c: ConfigPlanejamento): string[] {
  return [c.fundamental.sem1, c.fundamental.sem2, c.medio.sem1, c.medio.sem2].map((u) => u.trim()).filter(Boolean);
}

const passoStyle: React.CSSProperties = { display: "flex", gap: "0.9rem", marginBottom: "1rem", alignItems: "flex-start" };
const numStyle: React.CSSProperties = {
  minWidth: "26px", height: "26px", borderRadius: "50%", background: "var(--accent)", color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.82rem", flexShrink: 0, marginTop: "2px",
};
const textoPassoStyle: React.CSSProperties = { fontSize: "0.84rem", margin: "0.3rem 0 0", lineHeight: 1.5, color: "var(--text-secondary)" };

export function TelaPlanejamento({ turmas, onVoltar }: { turmas: TurmaResumo[]; onVoltar: () => void }) {
  const [config, setConfig] = useState<ConfigPlanejamento>(CONFIG_PADRAO);
  const [versaoScript, setVersaoScript] = useState("");
  const [configAberta, setConfigAberta] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [statusScript, setStatusScript] = useState("");
  const [ultimaBusca, setUltimaBusca] = useState(() => localStorage.getItem(PLANEJAMENTO_ULTIMA_BUSCA_KEY) ?? "");
  const [registros, setRegistros] = useState<RegistroPlanejamento[]>(carregarRegistrosCache);
  const [turmaSelecionada, setTurmaSelecionada] = useState<TurmaResumo | null>(null);
  const [disciplinasMapao, setDisciplinasMapao] = useState<Record<string, string[]>>({});
  const [gerando, setGerando] = useState(false);
  const [statusGeracao, setStatusGeracao] = useState("");
  const [pastaGeral, setPastaGeral] = useState("");
  const [erroAbrir, setErroAbrir] = useState("");
  const [gerandoPend, setGerandoPend] = useState(false);

  useEffect(() => {
    invokeApp<ConfigPlanejamento>("carregar_config_planejamento")
      .then((c) => {
        const cfg = { ...CONFIG_PADRAO, ...c, fundamental: { ...CONFIG_PADRAO.fundamental, ...c.fundamental }, medio: { ...CONFIG_PADRAO.medio, ...c.medio } };
        setConfig(cfg);
        setConfigAberta(urlsDaConfig(cfg).length === 0);
      })
      .catch(() => setConfigAberta(true));
    invokeApp<string>("versao_script_planejamento").then(setVersaoScript).catch(() => {});
  }, []);

  // Geração automática quando os registros mudam.
  useEffect(() => {
    if (registros.length === 0 || gerando) return;
    gerarLote(registros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registros]);

  // Carrega disciplinas do mapão ao selecionar uma turma (com cache por caminho).
  useEffect(() => {
    if (!turmaSelecionada) return;
    if (disciplinasMapao[turmaSelecionada.caminho]) return;
    invokeApp<string[]>("listar_disciplinas_turma", { caminho: turmaSelecionada.caminho })
      .then((ds) => setDisciplinasMapao((m) => ({ ...m, [turmaSelecionada.caminho]: ds })))
      .catch(() => setDisciplinasMapao((m) => ({ ...m, [turmaSelecionada.caminho]: [] })));
  }, [turmaSelecionada, disciplinasMapao]);

  // Índice: turma-norm -> contagem de planejamentos (para o indicador da lista).
  const planosPorTurma = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of registros) {
      const t = normalizarTurma(r.turma);
      mapa.set(t, (mapa.get(t) ?? 0) + 1);
    }
    return mapa;
  }, [registros]);

  // Registros da turma selecionada, indexados por disciplina|bimestre.
  const registrosDaTurma = useMemo(() => {
    if (!turmaSelecionada) return [];
    const tn = normalizarTurma(turmaSelecionada.codigo);
    return registros.filter((r) => normalizarTurma(r.turma) === tn);
  }, [turmaSelecionada, registros]);

  const matrizPlano = useMemo(() => {
    const idx = new Map<string, RegistroPlanejamento>();
    for (const r of registrosDaTurma) idx.set(`${normalizarDisciplina(r.disciplina)}|${r.bimestre}`, r);
    return idx;
  }, [registrosDaTurma]);

  // Disciplinas: união do mapão + disciplinas presentes nos planejamentos.
  const disciplinasDaTurma = useMemo(() => {
    const doMapao = turmaSelecionada ? disciplinasMapao[turmaSelecionada.caminho] ?? [] : [];
    const dosPlanos = registrosDaTurma.map((r) => r.disciplina);
    const todas = new Map<string, string>();
    for (const d of [...doMapao, ...dosPlanos]) todas.set(normalizarDisciplina(d), d);
    return Array.from(todas.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [turmaSelecionada, disciplinasMapao, registrosDaTurma]);

  const turmasComPlano = useMemo(() => {
    let n = 0;
    for (const t of turmas) if ((planosPorTurma.get(normalizarTurma(t.codigo)) ?? 0) > 0) n++;
    return n;
  }, [turmas, planosPorTurma]);

  function atualizarUrl(seg: "fundamental" | "medio", sem: "sem1" | "sem2", valor: string) {
    setConfig((c) => ({ ...c, [seg]: { ...c[seg], [sem]: valor } }));
  }
  function salvarConfig(): Promise<void> {
    return invokeApp("salvar_config_planejamento", { config }).then(() => {});
  }

  function carregarPlanejamentos() {
    const urls = urlsDaConfig(config);
    if (urls.length === 0) { setErro("Informe ao menos um link de planilha de respostas."); return; }
    setCarregando(true);
    setErro("");
    salvarConfig().catch(() => {})
      .then(() => invokeApp<RegistroPlanejamento[]>("buscar_planejamentos", { urls }))
      .then((dados) => {
        setRegistros(dados);
        const agora = new Date().toLocaleString("pt-BR");
        setUltimaBusca(agora);
        localStorage.setItem(PLANEJAMENTO_ULTIMA_BUSCA_KEY, agora);
        localStorage.setItem(PLANEJAMENTO_REGISTROS_KEY, JSON.stringify(dados));
        setConfigAberta(false);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)))
      .finally(() => setCarregando(false));
  }

  function gerarLote(recs: RegistroPlanejamento[]) {
    if (recs.length === 0) return;
    setGerando(true);
    setStatusGeracao("Gerando planejamentos...");
    invokeApp<GerarPlanejamentosLoteResultado>("gerar_planejamentos_lote", { registros: recs })
      .then((res) => {
        setPastaGeral(res.pasta);
        setStatusGeracao(res.erros.length > 0 ? `${res.arquivos} gerado(s). ${res.erros.length} erro(s).` : `${res.arquivos} planejamento(s) gerado(s).`);
      })
      .catch((err) => setStatusGeracao(`Erro ao gerar: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setGerando(false));
  }

  // Relatório de pendências: turmas × disciplinas (do mapão) que participam do
  // planejamento e estão sem plano nos bimestres já coletados.
  async function gerarRelatorioPendencias() {
    if (registros.length === 0) {
      setErroAbrir("Carregue os planejamentos antes de gerar o relatório de pendências.");
      return;
    }
    setGerandoPend(true);
    setErroAbrir("");
    try {
      const bimestresAtivos = Array.from(new Set(registros.map((r) => r.bimestre).filter(Boolean))).sort();
      // Disciplinas que participam do planejamento (apareceram em alguma resposta).
      const discComForm = new Set(registros.map((r) => normalizarDisciplina(r.disciplina)));
      // Disciplinas do mapão de cada turma (busca em lote, com cache).
      const cache = { ...disciplinasMapao };
      await Promise.all(
        turmas
          .filter((t) => !cache[t.caminho])
          .map((t) =>
            invokeApp<string[]>("listar_disciplinas_turma", { caminho: t.caminho })
              .then((ds) => { cache[t.caminho] = ds; })
              .catch(() => { cache[t.caminho] = []; })
          )
      );
      setDisciplinasMapao(cache);

      const indice = new Map<string, true>();
      for (const r of registros) indice.set(`${normalizarTurma(r.turma)}|${normalizarDisciplina(r.disciplina)}|${r.bimestre}`, true);

      const secoes = turmas
        .map((turma) => {
          const tn = normalizarTurma(turma.codigo);
          const linhas = (cache[turma.caminho] ?? [])
            .filter((d) => discComForm.has(normalizarDisciplina(d)))
            .map((disc) => {
              const faltam = bimestresAtivos.filter((b) => !indice.has(`${tn}|${normalizarDisciplina(disc)}|${b}`));
              return { item: disc, faltam: faltam.map((b) => `${b}º`).join(", ") };
            })
            .filter((l) => l.faltam.length > 0)
            .sort((a, b) => a.item.localeCompare(b.item, "pt-BR"));
          return { titulo: turma.codigo, linhas };
        })
        .filter((s) => s.linhas.length > 0);

      const periodo = bimestresAtivos.map((b) => `${b}º`).join(", ");
      const res = await invokeApp<{ caminho: string }>("gerar_relatorio_pendencias", {
        input: {
          titulo: "PENDÊNCIAS — PLANEJAMENTO DOS PROFESSORES",
          criterio: `Lista, por turma, as disciplinas (que participam do planejamento) sem plano de ensino nos bimestres coletados: ${periodo}. Disciplinas sem formulário não são listadas.`,
          coluna_item: "Disciplina",
          escopo: "planejamento",
          secoes,
        },
      });
      await invokeApp("abrir_documento_conselho", { input: { caminho: res.caminho } }).catch(() => {});
    } catch (err) {
      setErroAbrir(err instanceof Error ? err.message : String(err));
    } finally {
      setGerandoPend(false);
    }
  }

  async function copiarScript(seg: "fundamental" | "medio") {
    try {
      const txt = await invokeApp<string>("obter_script_planejamento", { segmento: seg });
      await navigator.clipboard.writeText(txt);
      setStatusScript(`Script do ${seg === "fundamental" ? "Fundamental" : "Médio"} copiado. Cole no editor em script.google.com e execute.`);
    } catch (err) {
      setStatusScript(`Não foi possível copiar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <>
      <header className="topbar council-topbar">
        <div>
          <button className="back-link" style={{ marginBottom: "0.25rem" }} onClick={onVoltar}>← Voltar para Relatórios</button>
          <span className="eyebrow">{turmaSelecionada ? turmaSelecionada.codigo : "Todas as turmas"}</span>
          <h1>Planejamento dos Professores</h1>
        </div>
        <div className="council-actions">
          {(gerando || statusGeracao) && (
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{gerando ? "Gerando planejamentos..." : statusGeracao}</span>
          )}
          {registros.length > 0 && (
            <button onClick={gerarRelatorioPendencias} disabled={gerandoPend} title="Gerar relatório do que falta entregar">
              <ClipboardList size={18} /> {gerandoPend ? "Gerando..." : "Pendências"}
            </button>
          )}
          {pastaGeral && (
            <button onClick={() => invokeApp("abrir_pasta", { caminho: pastaGeral }).catch(() => {})} title="Abrir pasta dos planejamentos">
              <FolderOpen size={18} /> Abrir pasta
            </button>
          )}
          <button onClick={() => setConfigAberta((a) => !a)} title="Configurar planilhas">
            <Settings size={18} /> Planilhas
          </button>
        </div>
      </header>

      {configAberta && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && urlsDaConfig(config).length) setConfigAberta(false); }}>
          <section className="whats-new-modal" role="dialog" aria-modal="true" style={{ maxWidth: "820px", width: "92vw", maxHeight: "88vh", overflowY: "auto", textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <div>
                <span className="eyebrow">Planejamento</span>
                <h2 style={{ margin: "0.15rem 0 0" }}>Configurar planilhas de respostas</h2>
              </div>
              {urlsDaConfig(config).length > 0 && (
                <button type="button" className="ghost-action" onClick={() => setConfigAberta(false)} style={{ marginTop: "0.25rem" }}><X size={16} /></button>
              )}
            </div>

            <p style={{ marginBottom: "1rem" }}>
              Os planejamentos são coletados por um formulário Google Forms padronizado (gerado por um script).
              Preencha abaixo apenas os segmentos e semestres que sua escola utiliza.
            </p>

            <div style={passoStyle}>
              <div style={numStyle}>1</div>
              <div style={{ flex: 1 }}>
                <strong>Copiar o script oficial do segmento</strong>
                <p style={textoPassoStyle}>
                  Cada segmento tem um script que cria o formulário já com os escopos do Currículo Priorizado{versaoScript ? ` (${versaoScript})` : ""}.
                  Copie o do segmento desejado:
                </p>
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => copiarScript("fundamental")}><ClipboardCopy size={14} /> Copiar script · Fundamental</button>
                  <button type="button" onClick={() => copiarScript("medio")}><ClipboardCopy size={14} /> Copiar script · Médio</button>
                </div>
                {statusScript && <p style={{ ...textoPassoStyle, color: "var(--accent)", marginTop: "0.45rem" }}>{statusScript}</p>}
              </div>
            </div>

            <div style={passoStyle}>
              <div style={numStyle}>2</div>
              <div style={{ flex: 1 }}>
                <strong>Executar no Google Apps Script</strong>
                <ol style={textoPassoStyle}>
                  <li>Acesse <em>script.google.com</em> e crie um novo projeto.</li>
                  <li>Apague o conteúdo padrão e <em>cole</em> o script copiado.</li>
                  <li>Clique em <em>Executar</em> (▶) na função <code>criarFormulario</code> e autorize as permissões.</li>
                  <li>O link do formulário aparece no <em>Registro de execução</em> (Ctrl+Enter).</li>
                </ol>
              </div>
            </div>

            <div style={passoStyle}>
              <div style={numStyle}>3</div>
              <div style={{ flex: 1 }}>
                <strong>Vincular a planilha de respostas e compartilhar</strong>
                <ol style={textoPassoStyle}>
                  <li>No formulário, aba <em>Respostas</em> → ícone do Sheets → <em>Criar planilha</em>.</li>
                  <li>Na planilha, <em>Compartilhar</em> → <em>Qualquer pessoa com o link</em> como <em>Leitor</em>.</li>
                  <li>Copie o link e cole no campo correspondente abaixo.</li>
                </ol>
              </div>
            </div>

            <div style={{ ...passoStyle, marginBottom: "1rem" }}>
              <div style={numStyle}>4</div>
              <div style={{ flex: 1 }}>
                <strong>Links das planilhas de respostas</strong>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: "0.5rem", marginTop: "0.6rem", alignItems: "center" }}>
                  <span />
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}>1º Semestre (1º/2º bim)</span>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}>2º Semestre (3º/4º bim)</span>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Fundamental</span>
                  <input type="url" placeholder="https://docs.google.com/..." value={config.fundamental.sem1} onChange={(e) => atualizarUrl("fundamental", "sem1", e.target.value)} />
                  <input type="url" placeholder="https://docs.google.com/..." value={config.fundamental.sem2} onChange={(e) => atualizarUrl("fundamental", "sem2", e.target.value)} />
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Ensino Médio</span>
                  <input type="url" placeholder="https://docs.google.com/..." value={config.medio.sem1} onChange={(e) => atualizarUrl("medio", "sem1", e.target.value)} />
                  <input type="url" placeholder="https://docs.google.com/..." value={config.medio.sem2} onChange={(e) => atualizarUrl("medio", "sem2", e.target.value)} />
                </div>
              </div>
            </div>

            {ultimaBusca && (
              <p style={{ fontSize: "0.76rem", color: "var(--text-secondary)", margin: "0 0 0.5rem" }}>
                Última atualização: {ultimaBusca} · {registros.length} planejamento(s) carregado(s)
              </p>
            )}
            {erro && <div className="notice error" style={{ marginBottom: "0.5rem" }}>{erro}</div>}

            <div className="modal-actions" style={{ marginTop: "0.5rem", gap: "0.6rem" }}>
              <button onClick={() => salvarConfig().then(() => setStatusScript("Configuração salva.")).catch((e) => setErro(String(e)))}>Salvar</button>
              <button className="primary-action" onClick={carregarPlanejamentos} disabled={carregando}>
                <RefreshCw size={14} /> {carregando ? "Carregando..." : "Carregar planejamentos"}
              </button>
            </div>
          </section>
        </div>
      )}

      <section className="council-workspace">
        {/* Lista de turmas */}
        <aside className="panel student-list-panel">
          <div className="panel-heading"><h3>Turmas</h3></div>
          <div style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
            {turmas.length} turma(s) · {turmasComPlano} com planejamento
          </div>
          <div className="student-list">
            {turmas.length === 0 && (
              <p style={{ padding: "0.75rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Nenhuma turma cadastrada. Importe os mapões na tela de Importação.
              </p>
            )}
            {turmas.map((turma) => {
              const ativo = turmaSelecionada?.caminho === turma.caminho;
              const n = planosPorTurma.get(normalizarTurma(turma.codigo)) ?? 0;
              const status = n > 0 ? "atencao" : "critico";
              return (
                <button key={turma.caminho} className={`student-list-item ${ativo ? "active" : ""}`} onClick={() => setTurmaSelecionada(ativo ? null : turma)}>
                  <div>
                    <strong>{turma.codigo}</strong>
                    <span>{turma.periodo ?? turma.ciclo ?? ""}</span>
                  </div>
                  <div className="student-list-status"><i className={status} /></div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Painel central: matriz disciplinas × bimestres */}
        <section className="panel council-detail-panel">
          {!turmaSelecionada ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
              <BookMarked size={40} style={{ opacity: 0.3, marginBottom: "0.75rem" }} />
              <p>Selecione uma turma à esquerda para ver os planejamentos por disciplina e bimestre.</p>
              {registros.length === 0 && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.84rem" }}>
                  Depois configure as planilhas clicando em <strong>Planilhas</strong> no canto superior direito.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="student-detail-header">
                <div>
                  <div className="student-name">
                    <span className="eligible-badge">TURMA</span>
                    <h2>{turmaSelecionada.codigo}</h2>
                  </div>
                  <p>{registrosDaTurma.length} planejamento(s) recebido(s)</p>
                </div>
              </div>

              <div className="table-panel">
                <div className="panel-heading"><h3>Planejamentos por disciplina e bimestre</h3></div>
                {disciplinasDaTurma.length === 0 ? (
                  <p style={{ padding: "0.75rem", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                    Nenhuma disciplina encontrada. Importe o mapão desta turma para carregar as disciplinas.
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", minWidth: "160px" }}>Disciplina</th>
                        {BIMESTRES.map((b) => (<th key={b} style={{ textAlign: "center", width: "80px" }}>{b}º Bim</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {disciplinasDaTurma.map((disciplina) => (
                        <tr key={disciplina}>
                          <td>{disciplina}</td>
                          {BIMESTRES.map((b) => {
                            const reg = matrizPlano.get(`${normalizarDisciplina(disciplina)}|${b}`);
                            return (
                              <td key={b} style={{ textAlign: "center" }}>
                                {reg ? (
                                  <button
                                    type="button"
                                    title={`Abrir Plano de Ensino · ${disciplina} · ${b}º bim (Prof. ${reg.professor})`}
                                    onClick={() => {
                                      setErroAbrir("");
                                      invokeApp("abrir_planejamento_docx", { turma: reg.turma, disciplina: reg.disciplina, bimestre: reg.bimestre })
                                        .catch((err: unknown) => setErroAbrir(err instanceof Error ? err.message : String(err)));
                                    }}
                                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: "6px", padding: "0.25rem 0.4rem", cursor: "pointer", color: "var(--accent)", display: "inline-flex", alignItems: "center" }}
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

              {erroAbrir && <div className="notice error" style={{ marginTop: "0.75rem" }}>{erroAbrir}</div>}
            </>
          )}
        </section>
      </section>
    </>
  );
}
