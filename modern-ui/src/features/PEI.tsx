import { BookMarked, FileText, FolderOpen, RefreshCw, Settings, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";

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

type AlunoElegivelComDisciplinas = {
  matricula: string;
  nome: string;
  turma: string;
  disciplinas: string[];
  disciplinas_por_bimestre: Record<string, string[]>;
  bimestres_com_medias: string[];
};

type GerarPeisLoteResultado = {
  pasta: string;
  arquivos: number;
  erros: string[];
};

const PEI_URL_KEY = "coordenacaoop:pei-url-planilha";
const PEI_ULTIMA_BUSCA_KEY = "coordenacaoop:pei-ultima-busca";
const PEI_REGISTROS_KEY = "coordenacaoop:pei-registros-cache";

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

const BIMESTRES_ORDEM = ["1", "2", "3", "4"];

/** Bimestre atual = primeiro que ainda não tem médias importadas. */
function bimestreAtualDoAluno(aluno: AlunoElegivelComDisciplinas): string {
  for (const b of BIMESTRES_ORDEM) {
    if (!aluno.bimestres_com_medias.includes(b)) return b;
  }
  return "4";
}

/**
 * Verifica se todos os PEIs esperados até o bimestre atual estão entregues.
 * Verde: todos entregues. Amarelo: algum entregue. Sem indicador: nenhum.
 */
function statusPeiAluno(
  aluno: AlunoElegivelComDisciplinas,
  peis: RegistroPei[]
): "adequado" | "atencao" | "critico" {
  const bimAtual = bimestreAtualDoAluno(aluno);
  const bimestresAVerificar = BIMESTRES_ORDEM.slice(0, BIMESTRES_ORDEM.indexOf(bimAtual) + 1);

  let esperado = 0;
  let encontrado = 0;

  for (const b of bimestresAVerificar) {
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

  if (encontrado === 0) return "critico";
  return encontrado >= esperado ? "adequado" : "atencao";
}

function carregarRegistrosCachedados(): RegistroPei[] {
  try {
    const salvo = localStorage.getItem(PEI_REGISTROS_KEY);
    return salvo ? (JSON.parse(salvo) as RegistroPei[]) : [];
  } catch {
    return [];
  }
}

export function TelaPEI({ onVoltar }: { onVoltar: () => void }) {
  const [url, setUrl] = useState("");
  const [urlEditando, setUrlEditando] = useState("");
  const [configAberta, setConfigAberta] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaBusca, setUltimaBusca] = useState(
    () => localStorage.getItem(PEI_ULTIMA_BUSCA_KEY) ?? ""
  );
  const [registros, setRegistros] = useState<RegistroPei[]>(carregarRegistrosCachedados);
  const [alunosElegiveis, setAlunosElegiveis] = useState<AlunoElegivelComDisciplinas[]>([]);
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoElegivelComDisciplinas | null>(null);
  const [erroPeiAbrir, setErroPeiAbrir] = useState("");
  const [gerando, setGerando] = useState(false);
  const [statusGeracao, setStatusGeracao] = useState("");
  const [pastaGeral, setPastaGeral] = useState("");

  // Carrega URL salva em disco (inclusa no sync institucional) com fallback para localStorage.
  useEffect(() => {
    invokeApp<string>("carregar_url_pei")
      .then((urlDisco) => {
        const urlFinal = urlDisco.trim() || localStorage.getItem(PEI_URL_KEY) || "";
        setUrl(urlFinal);
        setUrlEditando(urlFinal);
        setConfigAberta(!urlFinal);
      })
      .catch(() => {
        const urlLocal = localStorage.getItem(PEI_URL_KEY) || "";
        setUrl(urlLocal);
        setUrlEditando(urlLocal);
        setConfigAberta(!urlLocal);
      });
  }, []);

  useEffect(() => {
    invokeApp<AlunoElegivelComDisciplinas[]>("listar_alunos_elegiveis_com_disciplinas")
      .then(setAlunosElegiveis)
      .catch(() => setAlunosElegiveis([]));
  }, []);

  // Dispara geração automática sempre que os registros mudam (startup com cache ou fetch novo).
  useEffect(() => {
    if (registros.length === 0 || gerando) return;
    gerarLote(registros);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registros]);

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
    const doMapao = alunoSelecionado?.disciplinas ?? [];
    const doPei = registrosDoAluno.map((r) => r.disciplina);
    const todas = new Map<string, string>();
    for (const d of [...doMapao, ...doPei]) {
      todas.set(normalizarDisciplina(d), d);
    }
    return Array.from(todas.values()).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }, [alunoSelecionado, registrosDoAluno]);

  const matrizPei = useMemo(() => {
    const indice = new Map<string, RegistroPei>();
    for (const r of registrosDoAluno) {
      const chave = `${normalizarDisciplina(r.disciplina)}|${r.bimestre}`;
      indice.set(chave, r);
    }
    return indice;
  }, [registrosDoAluno]);

  function buscarPlanilha() {
    const urlFinal = urlEditando.trim();
    if (!urlFinal) {
      setErro("Informe o link da planilha do Google Sheets.");
      return;
    }
    setCarregando(true);
    setErro("");
    invokeApp<RegistroPei[]>("buscar_pei_planilha", { url: urlFinal })
      .then((dados) => {
        setRegistros(dados);
        setUrl(urlFinal);
        const agora = new Date().toLocaleString("pt-BR");
        setUltimaBusca(agora);
        localStorage.setItem(PEI_URL_KEY, urlFinal);
        localStorage.setItem(PEI_ULTIMA_BUSCA_KEY, agora);
        localStorage.setItem(PEI_REGISTROS_KEY, JSON.stringify(dados));
        // Salva também em disco para entrar no sync institucional.
        invokeApp("salvar_url_pei", { url: urlFinal }).catch(() => {});
        setConfigAberta(false);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)))
      .finally(() => setCarregando(false));
  }

  function gerarLote(recs: RegistroPei[]) {
    if (recs.length === 0) return;
    setGerando(true);
    setStatusGeracao("Gerando documentos PEI...");
    invokeApp<GerarPeisLoteResultado>("gerar_peis_lote", { registros: recs })
      .then((res) => {
        setPastaGeral(res.pasta);
        const msg = res.erros.length > 0
          ? `${res.arquivos} PEI(s) gerado(s). ${res.erros.length} erro(s).`
          : `${res.arquivos} PEI(s) gerado(s) com sucesso.`;
        setStatusGeracao(msg);
      })
      .catch((err) => setStatusGeracao(`Erro ao gerar: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setGerando(false));
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
          <button className="back-link" style={{ marginBottom: "0.25rem" }} onClick={onVoltar}>
            ← Voltar para Relatórios
          </button>
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

      {/* Painel de configuração da planilha */}
      {configAberta && (
        <section className="panel council-documents-panel">
          <div className="panel-heading">
            <div>
              <h3>Planilha de respostas do formulário PEI</h3>
              <p>Cole o link de compartilhamento do Google Sheets com as respostas.</p>
            </div>
            {url && (
              <button type="button" className="ghost-action" onClick={() => setConfigAberta(false)}>
                <X size={16} /> Fechar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: "280px" }}>
              Link da planilha
              <input
                type="url"
                value={urlEditando}
                onChange={(e) => setUrlEditando(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarPlanilha()}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                style={{ width: "100%", marginTop: "0.25rem" }}
              />
            </label>
            <button className="primary-action" onClick={buscarPlanilha} disabled={carregando}>
              <RefreshCw size={15} />
              {carregando ? "Buscando..." : "Atualizar"}
            </button>
          </div>
          {ultimaBusca && (
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
              Última atualização: {ultimaBusca} · {registros.length} PEI(s) carregado(s)
            </p>
          )}
          {erro && <div className="notice error" style={{ marginTop: "0.5rem" }}>{erro}</div>}
        </section>
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
              const status = statusPeiAluno(aluno, peis);
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
