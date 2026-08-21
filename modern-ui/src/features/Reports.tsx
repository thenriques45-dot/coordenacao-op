import { AlertTriangle, BarChart3, ClipboardList, FileText, FileWarning, FolderGit2, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";

type TurmaResumoRelatorio = {
  codigo: string;
  serie: string | null;
  ciclo: string | null;
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

const coresRelatorio = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#be123c"];

const opcoesBimestre = [
  { valor: "1", rotulo: "1º bimestre" },
  { valor: "2", rotulo: "2º bimestre" },
  { valor: "3", rotulo: "3º bimestre" },
  { valor: "4", rotulo: "4º bimestre/conselho final" },
];

const ROTULOS_CICLO: Record<string, string> = {
  EI: "Ed. Infantil",
  EFAI: "Anos iniciais",
  EFAF: "Anos finais",
  EM: "Ens. médio",
};

function rotuloCiclo(ciclo: string) {
  return ROTULOS_CICLO[ciclo] ?? ciclo;
}

function TurmaChipSelector({
  turmas,
  selecionadas,
  onToggle,
  onSelecionarSubset,
  onDesmarcarSubset,
}: {
  turmas: TurmaResumoRelatorio[];
  selecionadas: Set<string>;
  onToggle: (codigo: string) => void;
  onSelecionarSubset: (codigos: string[]) => void;
  onDesmarcarSubset: (codigos: string[]) => void;
}) {
  const [cicloFiltro, setCicloFiltro] = useState("todos");

  const ciclos = useMemo(() => {
    const set = new Set<string>();
    turmas.forEach((t) => { if (t.ciclo) set.add(t.ciclo); });
    return Array.from(set).sort();
  }, [turmas]);

  const turmasVisiveis = useMemo(
    () =>
      [...turmas]
        .filter((t) => cicloFiltro === "todos" || t.ciclo === cicloFiltro)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })),
    [turmas, cicloFiltro],
  );

  const codigosVisiveis = useMemo(() => turmasVisiveis.map((t) => t.codigo), [turmasVisiveis]);

  return (
    <div className="turma-selector">
      {ciclos.length > 1 && (
        <div className="turma-ciclo-filtro">
          <button
            type="button"
            className={`turma-ciclo-btn${cicloFiltro === "todos" ? " ativo" : ""}`}
            onClick={() => setCicloFiltro("todos")}
          >
            Todos
          </button>
          {ciclos.map((ciclo) => (
            <button
              key={ciclo}
              type="button"
              className={`turma-ciclo-btn${cicloFiltro === ciclo ? " ativo" : ""}`}
              onClick={() => setCicloFiltro(ciclo)}
            >
              {rotuloCiclo(ciclo)}
            </button>
          ))}
        </div>
      )}
      <div className="turma-selector-header">
        <span className="turma-selector-label">Turmas</span>
        <button type="button" className="turma-selector-btn" onClick={() => onSelecionarSubset(codigosVisiveis)}>
          Todas
        </button>
        <button type="button" className="turma-selector-btn" onClick={() => onDesmarcarSubset(codigosVisiveis)}>
          Nenhuma
        </button>
        <span className="turma-selector-count">
          {selecionadas.size} de {turmas.length} selecionada{selecionadas.size !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="turma-chip-list">
        {turmasVisiveis.map((t) => (
          <button
            key={t.codigo}
            type="button"
            className={`turma-chip${selecionadas.has(t.codigo) ? " selecionado" : ""}`}
            onClick={() => onToggle(t.codigo)}
          >
            {t.codigo}
          </button>
        ))}
      </div>
    </div>
  );
}

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
type ReportDefinitionResumo = {
  id: string;
  nome: string;
  descricao: string;
  embutido: boolean;
};

const TUTORIAL_RELATORIOS_KEY = "coordenacaoop:tutorial-relatorios-visto:v1";

function TutorialRelatorios({
  onFechar,
  onAbrirRepositorio,
}: {
  onFechar: () => void;
  onAbrirRepositorio: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const totalPassos = 2;
  return (
    <div className="modal-backdrop">
      <section className="sync-wizard" role="dialog" aria-modal="true" aria-labelledby="tutorial-relatorios-titulo">
        <div className="sync-wizard-progress" aria-label={`Etapa ${passo + 1} de ${totalPassos}`}>
          {Array.from({ length: totalPassos }).map((_, indice) => (
            <span key={indice} className={indice <= passo ? "active" : ""} />
          ))}
        </div>
        {passo === 0 && (
          <>
            <span className="eyebrow">Central de relatórios</span>
            <h2 id="tutorial-relatorios-titulo">Monte o relatório do seu jeito</h2>
            <p>
              Além dos relatórios prontos, o botão <strong>Criar relatório</strong> abre um construtor visual — dá
              pra escolher campos, filtros, ordenação e a imagem de cabeçalho da escola, sem depender de uma
              atualização do programa.
            </p>
            <div className="sync-wizard-grid">
              <article>
                <RefreshCw size={20} />
                <strong>Blocos de conteúdo</strong>
                <span>Adicione tabelas, textos e o cabeçalho institucional na ordem que quiser.</span>
              </article>
              <article>
                <ClipboardList size={20} />
                <strong>Filtros e ordenação</strong>
                <span>Escolha turmas, disciplinas, critério de corte e como ordenar cada tabela.</span>
              </article>
              <article>
                <FileText size={20} />
                <strong>Rascunho automático</strong>
                <span>Se sair no meio da edição, o relatório fica salvo como rascunho pra continuar depois.</span>
              </article>
            </div>
          </>
        )}
        {passo === 1 && (
          <>
            <span className="eyebrow">Repositório de relatórios</span>
            <h2 id="tutorial-relatorios-titulo">Aproveite o que outros coordenadores já montaram</h2>
            <p>
              O <strong>Repositório de relatórios</strong> reúne modelos prontos pra baixar: os <strong>oficiais</strong>{" "}
              (como Tarefas Realizadas, Prova Paulista e Educação Física) e os enviados pela <strong>comunidade</strong>{" "}
              de coordenadores.
            </p>
            <div className="sync-wizard-grid">
              <article>
                <FolderGit2 size={20} />
                <strong>Baixar é rápido</strong>
                <span>Encontre o relatório que precisa e baixe — ele aparece junto dos seus, prontinho pra gerar.</span>
              </article>
              <article>
                <Users size={20} />
                <strong>Autoria visível</strong>
                <span>Cada relatório mostra quem montou, pra você saber a origem antes de usar.</span>
              </article>
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onFechar}>
            Pular
          </button>
          {passo > 0 && (
            <button type="button" onClick={() => setPasso((atual) => atual - 1)}>
              Voltar
            </button>
          )}
          {passo < totalPassos - 1 ? (
            <button type="button" className="primary-action" onClick={() => setPasso((atual) => atual + 1)}>
              Próximo
            </button>
          ) : (
            <>
              <button type="button" onClick={onFechar}>
                Entendi
              </button>
              <button type="button" className="primary-action" onClick={onAbrirRepositorio}>
                <FolderGit2 size={16} /> Ver repositório
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function RelatoriosMenu({
  onAbrirRelatorioMotor,
  onAbrirAtendimentos,
  onCriarRelatorio,
  onAbrirRepositorio,
  onEditarRelatorio,
}: {
  onAbrirRelatorioMotor: (definicaoId: string) => void;
  onAbrirAtendimentos: () => void;
  onCriarRelatorio: () => void;
  onAbrirRepositorio: () => void;
  onEditarRelatorio: (definicaoId: string) => void;
}) {
  const [definicoes, setDefinicoes] = useState<ReportDefinitionResumo[]>([]);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [mostrarTutorial, setMostrarTutorial] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_RELATORIOS_KEY) === null;
    } catch {
      return false;
    }
  });

  function fecharTutorial() {
    try {
      localStorage.setItem(TUTORIAL_RELATORIOS_KEY, "sim");
    } catch {
      // localStorage indisponível (ex.: navegação privada) — só não persiste a preferência.
    }
    setMostrarTutorial(false);
  }

  function recarregarDefinicoes() {
    invokeApp<ReportDefinitionResumo[]>("listar_definicoes_relatorio")
      .then(setDefinicoes)
      .catch(() => {});
  }

  useEffect(() => {
    recarregarDefinicoes();
  }, []);

  const personalizados = definicoes.filter((definicao) => !definicao.embutido);

  async function excluir(id: string) {
    if (!window.confirm("Apagar este relatório personalizado? Não dá pra desfazer.")) return;
    setExcluindo(id);
    try {
      await invokeApp("excluir_definicao_relatorio", { id });
      recarregarDefinicoes();
    } finally {
      setExcluindo(null);
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
        <button type="button" className="report-menu-card" onClick={() => onAbrirRelatorioMotor("alunos_criticos")}>
          <FileText size={26} />
          <div>
            <strong>Relatório de Alunos Críticos</strong>
            <span>Lista estudantes por turma com excesso de faltas ou situação crítica por notas.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={() => onAbrirRelatorioMotor("elegiveis_recuperacao")}>
          <AlertTriangle size={26} />
          <div>
            <strong>Elegíveis à Prova de Recuperação</strong>
            <span>Lista alunos com X% ou mais de notas vermelhas (limiar ajustável, 50% padrão) somando todos os bimestres e sugere qual nota trocar após a recuperação.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={() => onAbrirRelatorioMotor("alteracoes_notas")}>
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
        <button type="button" className="report-menu-card" onClick={() => onAbrirRelatorioMotor("pendencia_lancamento")}>
          <FileWarning size={26} />
          <div>
            <strong>Pendência de Lançamento de Notas</strong>
            <span>Lista, por turma, as disciplinas com notas ainda não lançadas no mapão.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={() => onAbrirRelatorioMotor("top60")}>
          <Users size={26} />
          <div>
            <strong>Top Alunos</strong>
            <span>Lista os melhores alunos de cada período (manhã, tarde e noite) por média global, faltas e médias vermelhas — quantidade ajustável na hora de gerar.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onCriarRelatorio}>
          <RefreshCw size={26} />
          <div>
            <strong>Criar relatório</strong>
            <span>Monte um relatório novo escolhendo campos, filtros e colunas — sem precisar de um release.</span>
          </div>
        </button>
        <button type="button" className="report-menu-card" onClick={onAbrirRepositorio}>
          <FolderGit2 size={26} />
          <div>
            <strong>Repositório de relatórios</strong>
            <span>Baixe relatórios prontos publicados por você ou pela comunidade — inclui Tarefas Realizadas, Prova Paulista e Educação Física.</span>
          </div>
        </button>
      </section>

      {personalizados.length > 0 && (
        <>
          <header className="topbar" style={{ marginTop: 24 }}>
            <div>
              <h2>Meus relatórios</h2>
            </div>
          </header>
          <section className="report-menu-grid">
            {personalizados.map((definicao) => (
              <div key={definicao.id} className="report-menu-card" style={{ cursor: "default" }}>
                <FileText size={26} />
                <div>
                  <strong>{definicao.nome || "(sem nome)"}</strong>
                  <span>{definicao.descricao}</span>
                  <div className="report-actions" style={{ marginTop: 8 }}>
                    <button type="button" className="secondary-action" onClick={() => onAbrirRelatorioMotor(definicao.id)}>
                      Gerar
                    </button>
                    <button type="button" className="secondary-action" onClick={() => onEditarRelatorio(definicao.id)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => excluir(definicao.id)}
                      disabled={excluindo === definicao.id}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {mostrarTutorial && (
        <TutorialRelatorios
          onFechar={fecharTutorial}
          onAbrirRepositorio={() => {
            fecharTutorial();
            onAbrirRepositorio();
          }}
        />
      )}
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


type ValorExpressaoDTO =
  | { tipo: "texto"; valor: string }
  | { tipo: "numero"; valor: number }
  | { tipo: "booleano"; valor: boolean }
  | { tipo: "nulo" };

type DefinicaoParametro = {
  id: string;
  rotulo: string;
  tipo: "numero" | "texto";
  valor_padrao: ValorExpressaoDTO;
};

type ReportDefinition = {
  id: string;
  nome: string;
  descricao: string;
  embutido: boolean;
  formato_saida: string;
  parametros: DefinicaoParametro[];
  [chave: string]: unknown;
};

type RelatorioGenericoResultado = {
  caminho: string;
  pasta: string;
  linhas: number;
  grupos: number;
};

function valorPadraoTexto(valor: ValorExpressaoDTO): string {
  if (valor.tipo === "numero") return String(valor.valor);
  if (valor.tipo === "texto") return valor.valor;
  return "";
}

export function MotorRelatorios({
  onVoltar,
  definicaoIdInicial,
}: {
  onVoltar: () => void;
  definicaoIdInicial?: string;
}) {
  const [definicoes, setDefinicoes] = useState<ReportDefinition[]>([]);
  const [selecionadaId, setSelecionadaId] = useState("");
  const [bimestre, setBimestre] = useState("4");
  const [valoresParametros, setValoresParametros] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<RelatorioGenericoResultado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    invokeApp<ReportDefinition[]>("listar_definicoes_relatorio")
      .then((lista) => {
        setDefinicoes(lista);
        const preferida = definicaoIdInicial && lista.some((definicao) => definicao.id === definicaoIdInicial);
        if (preferida) {
          setSelecionadaId(definicaoIdInicial as string);
        } else if (lista.length > 0) {
          setSelecionadaId(lista[0].id);
        }
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definicaoIdInicial]);

  const definicaoSelecionada = definicoes.find((definicao) => definicao.id === selecionadaId) ?? null;

  useEffect(() => {
    const iniciais: Record<string, string> = {};
    for (const parametro of definicaoSelecionada?.parametros ?? []) {
      iniciais[parametro.id] = valorPadraoTexto(parametro.valor_padrao);
    }
    setValoresParametros(iniciais);
  }, [selecionadaId]);

  function gerarRelatorio() {
    if (!definicaoSelecionada) return;
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    const parametros: Record<string, ValorExpressaoDTO> = {};
    for (const parametro of definicaoSelecionada.parametros ?? []) {
      const texto = valoresParametros[parametro.id] ?? valorPadraoTexto(parametro.valor_padrao);
      parametros[parametro.id] =
        parametro.tipo === "numero" ? { tipo: "numero", valor: Number(texto) || 0 } : { tipo: "texto", valor: texto };
    }
    invokeApp<RelatorioGenericoResultado>("executar_relatorio_generico", {
      input: { definicao: definicaoSelecionada, bimestre, parametros },
    })
      .then((resposta) => {
        setResultado(resposta);
        setMensagem(
          resposta.linhas === 0
            ? "Nenhum registro encontrado para os filtros deste relatório."
            : `Relatório gerado com ${resposta.linhas} registro(s) em ${resposta.grupos} grupo(s).`
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
          <h1>{definicaoSelecionada?.nome ?? "Gerar relatório"}</h1>
          <p>{definicaoSelecionada?.descricao}</p>
        </div>
      </header>

      <section className="panel report-generator-card">
        <div className="report-generator-heading">
          <div>
            <h2>Gerar relatório</h2>
            {carregando && <p>Carregando relatórios disponíveis...</p>}
          </div>
          <BarChart3 size={28} />
        </div>

        <div className="report-controls">
          {!definicaoIdInicial && (
            <label>
              Relatório
              <select value={selecionadaId} onChange={(event) => setSelecionadaId(event.target.value)} disabled={carregando}>
                {definicoes.map((definicao) => (
                  <option key={definicao.id} value={definicao.id}>
                    {definicao.nome} ({String(definicao.formato_saida).toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Bimestre
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)}>
              {opcoesBimestre.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
          {(definicaoSelecionada?.parametros ?? []).map((parametro) => (
            <label key={parametro.id}>
              {parametro.rotulo}
              <input
                type={parametro.tipo === "numero" ? "number" : "text"}
                value={valoresParametros[parametro.id] ?? ""}
                onChange={(event) =>
                  setValoresParametros((atual) => ({ ...atual, [parametro.id]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>

        <div className="report-actions">
          <button className="primary-action" onClick={gerarRelatorio} disabled={processando || !definicaoSelecionada}>
            {processando ? "Gerando..." : "Gerar relatório"}
          </button>
          {resultado && (
            <button className="secondary-action" onClick={abrirRelatorio}>
              Abrir relatório
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

