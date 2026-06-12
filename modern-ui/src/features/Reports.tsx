import { BookMarked, ClipboardList, FileText, FileWarning } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";

type TurmaResumoRelatorio = {
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
  onAbrirPei,
  onAbrirPlanejamento,
}: {
  onAbrirCriticos: () => void;
  onAbrirAlteracoesNotas: () => void;
  onAbrirPei: () => void;
  onAbrirPlanejamento: () => void;
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
