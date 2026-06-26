import { BarChart3, BookMarked, ClipboardList, FileText, FileWarning, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";

type TurmaResumoRelatorio = {
  codigo: string;
  serie: string | null;
  ciclo: string | null;
};

type RelatorioAlunosCriticosResultado = {
  caminho: string;
  pasta: string;
  turmas: number;
  alunos: number;
};

type RelatorioAlteracoesNotasResultado = {
  caminho: string;
  pasta: string;
  turmas: number;
  pendentes: number;
  alteradas: number;
};

type RelatorioAtendimentoContagem = {
  nome: string;
  total: number;
};

type RelatorioAtendimentoAluno = {
  turma: string;
  matricula: string;
  nome: string;
  atendimentos: number;
  casos: number;
  seguimentos: number;
  tipos: RelatorioAtendimentoContagem[];
};

type RelatorioAtendimentoAlunoBasico = {
  turma: string;
  matricula: string;
  nome: string;
};

type RelatorioAtendimentoEvento = {
  turma: string;
  matricula: string;
  aluno: string;
  data: string;
  mes: string;
  tipos: string[];
  tags: string[];
};

type RelatorioAtendimentosResultado = {
  alunos_atendidos: RelatorioAtendimentoAluno[];
  alunos_nao_atendidos: RelatorioAtendimentoAlunoBasico[];
  eventos: RelatorioAtendimentoEvento[];
  total_turmas: number;
  total_alunos_ativos: number;
  total_atendimentos: number;
};

type SerieMensal = {
  nome: string;
  total: number;
  valores: number[];
};

type RelatorioTarefasResultado = {
  caminho: string;
  pasta: string;
  turmas: number;
  alunos: number;
};

type RelatorioProvaPaulistaResultado = {
  caminho: string;
  pasta: string;
  turmas: number;
  alunos: number;
};

const coresRelatorio = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#be123c"];

const opcoesBimestre = [
  { valor: "1", rotulo: "1º bimestre" },
  { valor: "2", rotulo: "2º bimestre" },
  { valor: "3", rotulo: "3º bimestre" },
  { valor: "4", rotulo: "4º bimestre/conselho final" },
];

function rotuloSerie(valor?: string | null) {
  if (!valor) return "";
  return valor
    .replace(/\b([1-3])\s*a\s+serie\b/gi, "$1ª Série")
    .replace(/\b([1-9])\s*o\s+ano\b/gi, "$1º Ano")
    .replace(/\bpre-escola\b/gi, "Pré-escola")
    .replace(/\bbercario\b/gi, "Berçário")
    .replace(/\bserie\b/gi, "Série")
    .replace(/\bano\b/gi, "Ano");
}
export function RelatoriosMenu({
  onAbrirCriticos,
  onAbrirAlteracoesNotas,
  onAbrirAtendimentos,
  onAbrirPei,
  onAbrirPlanejamento,
  onAbrirTarefas,
  onAbrirProvaPaulista,
}: {
  onAbrirCriticos: () => void;
  onAbrirAlteracoesNotas: () => void;
  onAbrirAtendimentos: () => void;
  onAbrirPei: () => void;
  onAbrirPlanejamento: () => void;
  onAbrirTarefas: () => void;
  onAbrirProvaPaulista: () => void;
}) {
  const [gerandoLancamento, setGerandoLancamento] = useState(false);
  const [erroLancamento, setErroLancamento] = useState("");

  async function gerarPendenciaLancamento() {
    if (gerandoLancamento) return;
    setGerandoLancamento(true);
    setErroLancamento("");
    try {
      const res = await invokeApp<{ caminho: string }>("gerar_relatorio_pendencia_lancamento");
      await invokeApp("abrir_documento_conselho", { input: { caminho: res.caminho } }).catch(() => {});
    } catch (err) {
      setErroLancamento(err instanceof Error ? err.message : String(err));
    } finally {
      setGerandoLancamento(false);
    }
  }

  return (
    <section className="reports-page">
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Central de relatórios</h1>
          <p>Escolha o relatório que deseja gerar.</p>
        </div>
      </header>

      <section className="report-menu-grid">
        <button type="button" className="report-menu-card" onClick={onAbrirCriticos}>
          <FileText size={26} />
          <div>
            <strong>Relatório de Alunos Críticos</strong>
            <span>Lista estudantes por turma com excesso de faltas ou situação crítica por notas.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirAlteracoesNotas}>
          <ClipboardList size={26} />
          <div>
            <strong>Alterações de Notas Pós-Conselho</strong>
            <span>Compara as notas decididas no conselho com o último mapão importado.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirAtendimentos}>
          <Users size={26} />
          <div>
            <strong>Relatórios de Atendimento</strong>
            <span>Acompanhe alunos atendidos, alunos nunca atendidos, tipos recorrentes e evolução mensal das tags.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={gerarPendenciaLancamento} disabled={gerandoLancamento}>
          <FileWarning size={26} />
          <div>
            <strong>Pendência de Lançamento de Notas</strong>
            <span>{gerandoLancamento ? "Gerando relatório..." : "Lista, por turma, as disciplinas com notas ainda não lançadas no mapão."}</span>
            {erroLancamento && <span style={{ color: "var(--danger, #ef4444)" }}>{erroLancamento}</span>}
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirPei}>
          <BookMarked size={26} />
          <div>
            <strong>PEI — Plano Educacional Individualizado</strong>
            <span>Acompanhe os planos enviados pelos professores e gere documentos por aluno elegível.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirPlanejamento}>
          <FileText size={26} />
          <div>
            <strong>Planejamento dos Professores</strong>
            <span>Acompanhe os planos de ensino enviados pelos professores por turma, disciplina e bimestre.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirTarefas}>
          <BarChart3 size={26} />
          <div>
            <strong>Tarefas Realizadas</strong>
            <span>Exporte em planilha (.csv) o percentual de tarefas concluídas por aluno e sala, por bimestre.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirProvaPaulista}>
          <BarChart3 size={26} />
          <div>
            <strong>Prova Paulista</strong>
            <span>Exporte em planilha (.csv) as notas da Prova Paulista por disciplina, turma e bimestre.</span>
          </div>
        </button>
      </section>
    </section>
  );
}

export function RelatorioAlunosCriticos({ turmas, onVoltar }: { turmas: TurmaResumoRelatorio[]; onVoltar: () => void }) {
  const [serie, setSerie] = useState("todas");
  const [bimestre, setBimestre] = useState("1");
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<RelatorioAlunosCriticosResultado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const series = useMemo(() => {
    const unicas = new Set<string>();
    turmas.forEach((turma) => {
      const rotulo = rotuloSerie(turma.serie) || turma.serie || turma.ciclo || "";
      if (rotulo.trim()) unicas.add(rotulo.trim());
    });
    return Array.from(unicas).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [turmas]);

  useEffect(() => {
    if (serie !== "todas" && !series.includes(serie)) {
      setSerie("todas");
    }
  }, [serie, series]);

  function gerarRelatorioCriticos() {
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invokeApp<RelatorioAlunosCriticosResultado>("gerar_relatorio_alunos_criticos", {
      input: {
        serie: serie === "todas" ? null : serie,
        bimestre,
      },
    })
      .then((resposta) => {
        setResultado(resposta);
        setMensagem(`Relatório gerado com ${resposta.alunos} aluno(s) em ${resposta.turmas} turma(s).`);
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function abrirRelatorio() {
    if (!resultado?.caminho) return;
    setErro("");
    invokeApp<string>("abrir_documento_conselho", { input: { caminho: resultado.caminho } })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function abrirPastaRelatorios() {
    if (!resultado?.pasta) return;
    setErro("");
    invokeApp<string>("abrir_pasta", { caminho: resultado.pasta })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Relatório de Alunos Críticos</h1>
          <p>Gere uma lista por turma com estudantes em excesso de faltas ou situação crítica por notas.</p>
        </div>
      </header>

      <section className="panel report-generator-card">
        <div className="report-generator-heading">
          <div>
            <h2>Alunos críticos</h2>
            <p>O relatório é dividido por turma e informa o motivo da inclusão do estudante.</p>
          </div>
          <FileText size={28} />
        </div>

        <div className="report-controls">
          <label>
            Bimestre
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)}>
              {opcoesBimestre.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
          <label>
            Turmas
            <select value={serie} onChange={(event) => setSerie(event.target.value)}>
              <option value="todas">Todas as salas</option>
              {series.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="report-actions">
          <button className="primary-action" onClick={gerarRelatorioCriticos} disabled={processando || !turmas.length}>
            {processando ? "Gerando..." : "Gerar relatório"}
          </button>
          {resultado && (
            <button className="secondary-action" onClick={abrirRelatorio}>
              Abrir relatório
            </button>
          )}
          <button className="secondary-action" onClick={abrirPastaRelatorios} disabled={!resultado}>
            Abrir pasta
          </button>
        </div>

        {mensagem && <div className="notice success">{mensagem}</div>}
        {resultado && <span className="report-path">Salvo em: {resultado.caminho}</span>}
        {erro && <div className="notice error">{erro}</div>}
      </section>
    </section>
  );
}

export function RelatorioAlteracoesNotas({ turmas, onVoltar }: { turmas: TurmaResumoRelatorio[]; onVoltar: () => void }) {
  const [serie, setSerie] = useState("todas");
  const [bimestre, setBimestre] = useState("1");
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<RelatorioAlteracoesNotasResultado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const series = useMemo(() => {
    const unicas = new Set<string>();
    turmas.forEach((turma) => {
      const rotulo = rotuloSerie(turma.serie) || turma.serie || turma.ciclo || "";
      if (rotulo.trim()) unicas.add(rotulo.trim());
    });
    return Array.from(unicas).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [turmas]);

  useEffect(() => {
    if (serie !== "todas" && !series.includes(serie)) {
      setSerie("todas");
    }
  }, [serie, series]);

  function gerarRelatorioAlteracoes() {
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invokeApp<RelatorioAlteracoesNotasResultado>("gerar_relatorio_alteracoes_notas", {
      input: {
        serie: serie === "todas" ? null : serie,
        bimestre,
      },
    })
      .then((resposta) => {
        setResultado(resposta);
        setMensagem(
          `Relatório gerado com ${resposta.pendentes} pendência(s) e ${resposta.alteradas} alteração(ões) confirmada(s) em ${resposta.turmas} turma(s).`,
        );
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function abrirRelatorio() {
    if (!resultado?.caminho) return;
    setErro("");
    invokeApp<string>("abrir_documento_conselho", { input: { caminho: resultado.caminho } })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function abrirPastaRelatorios() {
    if (!resultado?.pasta) return;
    setErro("");
    invokeApp<string>("abrir_pasta", { caminho: resultado.pasta })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Alterações de Notas Pós-Conselho</h1>
          <p>Confira se as notas ajustadas no conselho já aparecem corretamente no último mapão importado.</p>
        </div>
      </header>

      <section className="panel report-generator-card">
        <div className="report-generator-heading">
          <div>
            <h2>Conferência pós-conselho</h2>
            <p>O relatório mostra primeiro as pendências e depois as alterações confirmadas por turma.</p>
          </div>
          <ClipboardList size={28} />
        </div>

        <div className="report-controls">
          <label>
            Bimestre
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)}>
              {opcoesBimestre.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
          <label>
            Turmas
            <select value={serie} onChange={(event) => setSerie(event.target.value)}>
              <option value="todas">Todas as salas</option>
              {series.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="report-actions">
          <button className="primary-action" onClick={gerarRelatorioAlteracoes} disabled={processando || !turmas.length}>
            {processando ? "Gerando..." : "Gerar relatório"}
          </button>
          {resultado && (
            <button className="secondary-action" onClick={abrirRelatorio}>
              Abrir relatório
            </button>
          )}
          <button className="secondary-action" onClick={abrirPastaRelatorios} disabled={!resultado}>
            Abrir pasta
          </button>
        </div>

        {mensagem && <div className="notice success">{mensagem}</div>}
        {resultado && <span className="report-path">Salvo em: {resultado.caminho}</span>}
        {erro && <div className="notice error">{erro}</div>}
      </section>
    </section>
  );
}

export function RelatorioAtendimentos({ onVoltar }: { onVoltar: () => void }) {
  const [dados, setDados] = useState<RelatorioAtendimentosResultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"alunos" | "geral">("alunos");

  function carregarDados() {
    setCarregando(true);
    setErro("");
    invokeApp<RelatorioAtendimentosResultado>("carregar_relatorio_atendimentos")
      .then(setDados)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const meses = useMemo(() => mesesRelatorioAtendimentos(dados?.eventos ?? []), [dados]);
  const tiposResumo = useMemo(() => contarItensRelatorio(dados?.eventos ?? [], "tipos"), [dados]);
  const tagsResumo = useMemo(() => contarItensRelatorio(dados?.eventos ?? [], "tags"), [dados]);
  const seriesTipos = useMemo(() => seriesMensaisRelatorio(dados?.eventos ?? [], meses, "tipos", 6), [dados, meses]);
  const seriesTags = useMemo(() => seriesMensaisRelatorio(dados?.eventos ?? [], meses, "tags", 6), [dados, meses]);

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Relatórios de Atendimento</h1>
          <p>Visualize cobertura dos atendimentos e recorrências por tipo, tag e mês.</p>
        </div>
        <button className="secondary-action" onClick={carregarDados} disabled={carregando}>
          <RefreshCw size={17} />
          {carregando ? "Atualizando..." : "Atualizar"}
        </button>
      </header>

      {erro && <div className="notice error">{erro}</div>}

      <section className="attendance-report-metrics">
        <article>
          <span>Alunos ativos</span>
          <strong>{dados?.total_alunos_ativos ?? 0}</strong>
        </article>
        <article>
          <span>Alunos atendidos</span>
          <strong>{dados?.alunos_atendidos.length ?? 0}</strong>
        </article>
        <article>
          <span>Nunca atendidos</span>
          <strong>{dados?.alunos_nao_atendidos.length ?? 0}</strong>
        </article>
        <article>
          <span>Atendimentos</span>
          <strong>{dados?.total_atendimentos ?? 0}</strong>
        </article>
      </section>

      <div className="student-profile-tabs report-tabs">
        <button className={aba === "alunos" ? "active" : ""} onClick={() => setAba("alunos")}>Alunos atendidos e não atendidos</button>
        <button className={aba === "geral" ? "active" : ""} onClick={() => setAba("geral")}>Relatório geral de atendimentos</button>
      </div>

      {aba === "alunos" && (
        <section className="attendance-report-grid">
          <article className="panel report-table-panel">
            <div className="report-generator-heading">
              <div>
                <h2>Alunos atendidos</h2>
                <p>Quantidade de atendimentos e tipos registrados por aluno.</p>
              </div>
              <Users size={24} />
            </div>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Turma</th>
                    <th>Aluno</th>
                    <th>RA</th>
                    <th>Atend.</th>
                    <th>Tipos</th>
                  </tr>
                </thead>
                <tbody>
                  {dados?.alunos_atendidos.length ? dados.alunos_atendidos.map((aluno) => (
                    <tr key={`${aluno.turma}-${aluno.matricula}`}>
                      <td>{aluno.turma}</td>
                      <td>{aluno.nome}</td>
                      <td>{aluno.matricula}</td>
                      <td>{aluno.atendimentos} <small>({aluno.casos} caso(s), {aluno.seguimentos} seg.)</small></td>
                      <td>{aluno.tipos.map((tipo) => `${tipo.nome} (${tipo.total})`).join(", ")}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5}>Nenhum aluno atendido ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel report-table-panel">
            <div className="report-generator-heading">
              <div>
                <h2>Alunos nunca atendidos</h2>
                <p>Alunos ativos sem histórico de atendimento registrado.</p>
              </div>
              <FileWarning size={24} />
            </div>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Turma</th>
                    <th>Aluno</th>
                    <th>RA</th>
                  </tr>
                </thead>
                <tbody>
                  {dados?.alunos_nao_atendidos.length ? dados.alunos_nao_atendidos.map((aluno) => (
                    <tr key={`${aluno.turma}-${aluno.matricula}`}>
                      <td>{aluno.turma}</td>
                      <td>{aluno.nome}</td>
                      <td>{aluno.matricula}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3}>Todos os alunos ativos têm ao menos um atendimento registrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {aba === "geral" && (
        <section className="attendance-report-general">
          <article className="panel report-chart-panel">
            <div className="report-generator-heading">
              <div>
                <h2>Tipos mais comuns</h2>
                <p>Frequência dos tipos de atendimento registrados.</p>
              </div>
              <BarChart3 size={24} />
            </div>
            <HorizontalBars dados={tiposResumo.slice(0, 10)} />
          </article>

          <article className="panel report-chart-panel">
            <div className="report-generator-heading">
              <div>
                <h2>Evolução por tipo e mês</h2>
                <p>Linhas mensais dos tipos mais recorrentes.</p>
              </div>
              <BarChart3 size={24} />
            </div>
            <MonthlyLineChart meses={meses} series={seriesTipos} emptyText="Sem atendimentos por tipo para exibir." />
          </article>

          <article className="panel report-chart-panel">
            <div className="report-generator-heading">
              <div>
                <h2>Tags mais recorrentes</h2>
                <p>Classificações que aparecem com maior frequência nos atendimentos.</p>
              </div>
              <BarChart3 size={24} />
            </div>
            <HorizontalBars dados={tagsResumo.slice(0, 10)} emptyText="Nenhuma tag registrada ainda." />
          </article>

          <article className="panel report-chart-panel">
            <div className="report-generator-heading">
              <div>
                <h2>Evolução das tags por mês</h2>
                <p>Linhas mensais das tags mais recorrentes.</p>
              </div>
              <BarChart3 size={24} />
            </div>
            <MonthlyLineChart meses={meses} series={seriesTags} emptyText="Sem tags por mês para exibir." />
          </article>
        </section>
      )}
    </section>
  );
}

function mesesRelatorioAtendimentos(eventos: RelatorioAtendimentoEvento[]) {
  const meses = Array.from(new Set(eventos.map((evento) => evento.mes).filter((mes) => mes && mes !== "Sem data")));
  return meses.sort((a, b) => a.localeCompare(b));
}

function contarItensRelatorio(eventos: RelatorioAtendimentoEvento[], campo: "tipos" | "tags") {
  const contagem = new Map<string, number>();
  eventos.forEach((evento) => {
    evento[campo].forEach((item) => {
      const nome = item.trim();
      if (!nome) return;
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    });
  });
  return Array.from(contagem.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

function seriesMensaisRelatorio(eventos: RelatorioAtendimentoEvento[], meses: string[], campo: "tipos" | "tags", limite: number) {
  const principais = contarItensRelatorio(eventos, campo).slice(0, limite).map((item) => item.nome);
  return principais.map((nome) => {
    const valores = meses.map((mes) => eventos.reduce((total, evento) => {
      if (evento.mes !== mes) return total;
      return total + evento[campo].filter((item) => item === nome).length;
    }, 0));
    return {
      nome,
      total: valores.reduce((soma, valor) => soma + valor, 0),
      valores,
    };
  }).filter((serie) => serie.total > 0);
}

function rotuloMesRelatorio(mes: string) {
  const [ano, numeroMes] = mes.split("-");
  if (!ano || !numeroMes) return mes;
  const data = new Date(Number(ano), Number(numeroMes) - 1, 1);
  return data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

function HorizontalBars({ dados, emptyText = "Sem dados para exibir." }: { dados: RelatorioAtendimentoContagem[]; emptyText?: string }) {
  const maximo = Math.max(1, ...dados.map((item) => item.total));
  if (!dados.length) return <div className="empty-special-list">{emptyText}</div>;
  return (
    <div className="report-horizontal-bars">
      {dados.map((item, indice) => (
        <div className="report-horizontal-bar" key={item.nome}>
          <span>{item.nome}</span>
          <div>
            <i style={{ width: `${Math.max(6, item.total / maximo * 100)}%`, background: coresRelatorio[indice % coresRelatorio.length] }} />
          </div>
          <strong>{item.total}</strong>
        </div>
      ))}
    </div>
  );
}

function MonthlyLineChart({ meses, series, emptyText }: { meses: string[]; series: SerieMensal[]; emptyText: string }) {
  if (!meses.length || !series.length) return <div className="empty-special-list">{emptyText}</div>;
  const largura = 760;
  const altura = 280;
  const margem = { top: 22, right: 26, bottom: 44, left: 42 };
  const maximo = Math.max(1, ...series.flatMap((serie) => serie.valores));
  const x = (indice: number) => {
    if (meses.length === 1) return (largura - margem.left - margem.right) / 2 + margem.left;
    return margem.left + indice * ((largura - margem.left - margem.right) / (meses.length - 1));
  };
  const y = (valor: number) => margem.top + (maximo - valor) * ((altura - margem.top - margem.bottom) / maximo);

  return (
    <div className="report-line-chart-wrap">
      <svg className="report-line-chart" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label="Evolução mensal">
        {[0, Math.ceil(maximo / 2), maximo].map((valor) => (
          <g key={valor}>
            <line x1={margem.left} x2={largura - margem.right} y1={y(valor)} y2={y(valor)} />
            <text x={12} y={y(valor) + 4}>{valor}</text>
          </g>
        ))}
        {meses.map((mes, indice) => (
          <text key={mes} x={x(indice)} y={altura - 14} textAnchor="middle">{rotuloMesRelatorio(mes)}</text>
        ))}
        {series.map((serie, serieIndice) => {
          const pontos = serie.valores.map((valor, indice) => `${x(indice)},${y(valor)}`).join(" ");
          const cor = coresRelatorio[serieIndice % coresRelatorio.length];
          return (
            <g key={serie.nome}>
              <polyline points={pontos} stroke={cor} />
              {serie.valores.map((valor, indice) => (
                <circle key={`${serie.nome}-${meses[indice]}`} cx={x(indice)} cy={y(valor)} r="3.5" fill={cor}>
                  <title>{`${serie.nome} - ${rotuloMesRelatorio(meses[indice])}: ${valor}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="report-chart-legend">
        {series.map((serie, indice) => (
          <span key={serie.nome}><i style={{ background: coresRelatorio[indice % coresRelatorio.length] }} />{serie.nome}</span>
        ))}
      </div>
    </div>
  );
}

export function RelatorioTarefas({
  turmas,
  onVoltar,
}: {
  turmas: TurmaResumoRelatorio[];
  onVoltar: () => void;
}) {
  const [bimestre, setBimestre] = useState("1");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set(turmas.map((t) => t.codigo)));
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<RelatorioTarefasResultado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  // Sincroniza selecionadas quando a lista de turmas muda
  useEffect(() => {
    setSelecionadas(new Set(turmas.map((t) => t.codigo)));
  }, [turmas]);

  function toggleTurma(codigo: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
    setResultado(null);
  }

  function selecionarTodas() {
    setSelecionadas(new Set(turmas.map((t) => t.codigo)));
    setResultado(null);
  }

  function desmarcarTodas() {
    setSelecionadas(new Set());
    setResultado(null);
  }

  function gerarRelatorio() {
    if (selecionadas.size === 0) {
      setErro("Selecione ao menos uma turma.");
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invokeApp<RelatorioTarefasResultado>("gerar_relatorio_tarefas", {
      bimestre,
      turmasFiltro: Array.from(selecionadas),
    })
      .then((resposta) => {
        setResultado(resposta);
        setMensagem(`Planilha gerada com ${resposta.alunos} aluno(s) em ${resposta.turmas} turma(s).`);
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function abrirRelatorio() {
    if (!resultado?.caminho) return;
    setErro("");
    invokeApp<string>("abrir_documento_conselho", { input: { caminho: resultado.caminho } })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function abrirPasta() {
    if (!resultado?.pasta) return;
    setErro("");
    invokeApp<string>("abrir_pasta", { caminho: resultado.pasta })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  const turmasOrdenadas = useMemo(
    () => [...turmas].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })),
    [turmas],
  );

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Tarefas Realizadas</h1>
          <p>Exporte uma planilha Excel (.xlsx) com uma aba por turma.</p>
        </div>
      </header>

      <section className="panel report-generator-card">
        <div className="report-generator-heading">
          <div>
            <h2>Exportar por bimestre</h2>
            <p>Cada turma selecionada gera uma aba separada na planilha.</p>
          </div>
          <BarChart3 size={28} />
        </div>

        <div className="report-controls">
          <label>
            Bimestre
            <select value={bimestre} onChange={(e) => { setBimestre(e.target.value); setResultado(null); }}>
              {opcoesBimestre.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Turmas</span>
            <button type="button" className="secondary-action" style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }} onClick={selecionarTodas}>
              Todas
            </button>
            <button type="button" className="secondary-action" style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }} onClick={desmarcarTodas}>
              Nenhuma
            </button>
            <span style={{ fontSize: "0.8rem", color: "var(--muted, #667085)" }}>
              {selecionadas.size} de {turmas.length} selecionada(s)
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {turmasOrdenadas.map((t) => (
              <label
                key={t.codigo}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "0.4rem",
                  border: "1px solid var(--border, #e2e8f0)",
                  cursor: "pointer",
                  background: selecionadas.has(t.codigo) ? "var(--primary-50, #eff6ff)" : "transparent",
                  fontSize: "0.85rem",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={selecionadas.has(t.codigo)}
                  onChange={() => toggleTurma(t.codigo)}
                  style={{ accentColor: "var(--primary, #2563eb)" }}
                />
                {t.codigo}
              </label>
            ))}
          </div>
        </div>

        <div className="report-actions">
          <button
            className="primary-action"
            onClick={gerarRelatorio}
            disabled={processando || selecionadas.size === 0}
          >
            {processando ? "Gerando..." : "Gerar planilha"}
          </button>
          {resultado && (
            <button className="secondary-action" onClick={abrirRelatorio}>
              Abrir arquivo
            </button>
          )}
          <button className="secondary-action" onClick={abrirPasta} disabled={!resultado}>
            Abrir pasta
          </button>
        </div>

        {mensagem && <div className="notice success">{mensagem}</div>}
        {resultado && <span className="report-path">Salvo em: {resultado.caminho}</span>}
        {erro && <div className="notice error">{erro}</div>}
      </section>
    </section>
  );
}

export function RelatorioProvaPaulista({ onVoltar }: { onVoltar: () => void }) {
  const [bimestre, setBimestre] = useState("1");
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<RelatorioProvaPaulistaResultado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  function gerarRelatorio() {
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invokeApp<RelatorioProvaPaulistaResultado>("gerar_relatorio_prova_paulista", { bimestre })
      .then((resposta) => {
        setResultado(resposta);
        setMensagem(`Planilha gerada com ${resposta.alunos} aluno(s) em ${resposta.turmas} turma(s).`);
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function abrirRelatorio() {
    if (!resultado?.caminho) return;
    setErro("");
    invokeApp<string>("abrir_documento_conselho", { input: { caminho: resultado.caminho } })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function abrirPasta() {
    if (!resultado?.pasta) return;
    setErro("");
    invokeApp<string>("abrir_pasta", { caminho: resultado.pasta })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Prova Paulista</h1>
          <p>Exporte uma planilha (.csv) com as notas da Prova Paulista por disciplina, turma e bimestre.</p>
        </div>
      </header>

      <section className="panel report-generator-card">
        <div className="report-generator-heading">
          <div>
            <h2>Exportar por bimestre</h2>
            <p>O arquivo .csv gerado abre diretamente no Excel. As colunas de disciplina aparecem apenas para as que tiverem dados importados.</p>
          </div>
          <BarChart3 size={28} />
        </div>

        <div className="report-controls">
          <label>
            Bimestre
            <select value={bimestre} onChange={(e) => setBimestre(e.target.value)}>
              {opcoesBimestre.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="report-actions">
          <button className="primary-action" onClick={gerarRelatorio} disabled={processando}>
            {processando ? "Gerando..." : "Gerar planilha"}
          </button>
          {resultado && (
            <button className="secondary-action" onClick={abrirRelatorio}>
              Abrir arquivo
            </button>
          )}
          <button className="secondary-action" onClick={abrirPasta} disabled={!resultado}>
            Abrir pasta
          </button>
        </div>

        {mensagem && <div className="notice success">{mensagem}</div>}
        {resultado && <span className="report-path">Salvo em: {resultado.caminho}</span>}
        {erro && <div className="notice error">{erro}</div>}
      </section>
    </section>
  );
}
