import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Clock,
  FileText,
  Minus,
  Search,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { invokeApp } from "./appBridge";
import { FotoAluno } from "./StudentPhoto";

type NotaBimestre = {
  bimestre: string;
  media: number;
};

type Disciplina = {
  nome: string;
  mediaOriginal: number | null;
  mediaConselho: number | null;
  quintoConceito?: number | null;
  observacaoConselho?: string | null;
  faltas?: number | null;
  totalAulas?: number | null;
  faltasAcumuladas?: number | null;
  totalAulasAcumuladas?: number | null;
  historicoBimestres?: NotaBimestre[];
  situacao: "adequada" | "abaixo" | "cuidado" | "sem-nota" | "ajustada";
};

type DiagnosticoComponente = {
  aprendizagem_equivalente: string | null;
  status: string | null;
};

type DiagnosticoAprendizagem = {
  turma_origem: string | null;
  portugues: DiagnosticoComponente;
  matematica: DiagnosticoComponente;
  atualizado_em: string | null;
};

type Aluno = {
  matricula?: string;
  chamada: number;
  nome: string;
  ativo?: boolean;
  elegivel: boolean;
  liderancaSala?: "lider" | "vice" | null;
  deficiencias: string[];
  comentarioEducacaoEspecial?: string | null;
  frequencia: number | null;
  encaminhamentos: number[];
  diagnosticoAprendizagem?: DiagnosticoAprendizagem | null;
  disciplinas: Disciplina[];
};

function classeStatusDiagnostico(status: string) {
  const texto = status.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (texto.includes("abaixo")) return "below-basic";
  if (texto.includes("profic")) return "proficient";
  if (texto.includes("bas")) return "basic";
  return "unknown";
}

function diagnosticoSarespPorDisciplina(
  diagnostico: DiagnosticoAprendizagem | null | undefined,
  disciplina: string,
) {
  if (!diagnostico) return null;
  const nome = disciplina.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (nome === "portugues" || nome === "portuguesa" || nome === "lingua portuguesa") {
    return diagnostico.portugues;
  }
  if (nome === "matematica") {
    return diagnostico.matematica;
  }
  return null;
}

type TurmaResumo = {
  codigo: string;
  ano: number;
  serie: string | null;
  sala: string | null;
  periodo: string | null;
  ciclo: string | null;
  coordenador_turma: string | null;
  lider_sala: string | null;
  vice_lider_sala: string | null;
  total_alunos: number;
  alunos_ativos: number;
  alunos_elegiveis: number;
  nomes_alunos: string[];
  conselhos_com_ajustes: number;
  conselho_finalizado: boolean;
  caminho: string;
};

type TurmaDetalhe = {
  codigo: string;
  ano: number;
  coordenador_turma: string | null;
  bimestre: string;
  tempo_conselho_segundos: number;
  texto_ata: string;
  alunos: unknown[];
};

type DocumentoConselho = {
  tipo: "ata" | "relatorio";
  bimestre: string;
  caminho: string;
};

type AjusteMediaPayload = {
  disciplina: string;
  media_original: number | null;
  media_ajustada: number | null;
  observacao: string;
};

type FinalizacaoResultado = {
  ata: string | null;
  relatorio: string | null;
};

const situacaoLabel: Record<Disciplina["situacao"], string> = {
  adequada: "Adequada",
  abaixo: "Abaixo",
  cuidado: "Cuidado",
  "sem-nota": "Sem nota",
  ajustada: "Ajustada",
};

const encaminhamentos = [
  "Dificuldade em ler, interpretar e associar dados, tabelas, figuras, produzir textos e resolver situacoes problemas",
  "Confrontar ideias e opinioes, manifestando-se de forma argumentativa",
  "Dedicar-se mais ao estudo em casa.",
  "Prestar mais atencao as explicacoes do professor, tirar duvidas, realizar as tarefas em aula nos prazos estipulados",
  "Frequencia as aulas.",
  "Acompanhar diariamente, dialogar e orientar o estudante sobre as atividades escolares",
  "Estabelecer horas de estudo em casa, incentivando o habito de estudar",
  "Comparecer as reunioes e conversar com professores e coordenadores pedagogicos",
  "Recuperacao continua",
  "Tarefas auxiliares para superacao das dificuldades especificas do estudante",
];

const opcoesBimestre = [
  { valor: "1", rotulo: "1º bimestre" },
  { valor: "2", rotulo: "2º bimestre" },
  { valor: "3", rotulo: "3º bimestre" },
  { valor: "4", rotulo: "4º bimestre/conselho final" },
];

function formatarNota(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function arredondarMedia(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  return Math.floor(valor + 0.5);
}

function formatarMediaGlobal(valor: number | null | undefined) {
  const arredondada = arredondarMedia(valor);
  return arredondada === null ? "-" : String(arredondada);
}

function formatarPercentual(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";
  return `${Math.round(valor)}%`;
}

function formatarTempo(segundos: number) {
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const seg = segundos % 60;
  return [horas, minutos, seg].map((valor) => String(valor).padStart(2, "0")).join(":");
}

function frequenciaMapaoAbaixoDoMinimo(valor: number | null | undefined) {
  return typeof valor === "number" && valor < 75;
}

function classeFaltas(disciplina: Disciplina) {
  const faltas = disciplina.faltas;
  const totalAulas = disciplina.totalAulas;
  if (typeof faltas !== "number" || typeof totalAulas !== "number" || !Number.isFinite(faltas) || !Number.isFinite(totalAulas) || totalAulas <= 0) return "";
  const limite = totalAulas * 0.25;
  if (faltas > limite) return "absence-danger";
  if (faltas === limite) return "absence-warning";
  return "";
}

function calcularMediaAluno(aluno: Aluno) {
  const medias = aluno.disciplinas.flatMap((disciplina) => {
    const nota = disciplina.mediaConselho ?? disciplina.mediaOriginal;
    return typeof nota === "number" && Number.isFinite(nota) ? [nota] : [];
  });
  if (!medias.length) return null;
  return medias.reduce((total, valor) => total + valor, 0) / medias.length;
}

function classificarAluno(aluno: Aluno) {
  const media = arredondarMedia(calcularMediaAluno(aluno));
  if (media !== null && media < 5) return "critico";
  if (media === 5) return "atencao";
  return "adequado";
}

type EvolucaoDisciplina = "subiu" | "desceu" | "estavel" | "sem-dados";

function calcularEvolucaoDisciplina(disciplina: Disciplina, bimestreAtual: string): EvolucaoDisciplina {
  const notaAtual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
  if (typeof notaAtual !== "number" || !Number.isFinite(notaAtual)) return "sem-dados";
  const atual = Number(bimestreAtual);
  const historico = (disciplina.historicoBimestres ?? []).filter((item) => typeof item.media === "number" && Number.isFinite(item.media));
  const referencias = historico.filter((item) => Number(item.bimestre) < atual);
  const base = referencias.length ? referencias : historico.filter((item) => item.bimestre !== bimestreAtual);
  if (!base.length) return "sem-dados";
  const mediaHistorica = base.reduce((total, item) => total + item.media, 0) / base.length;
  const diferenca = notaAtual - mediaHistorica;
  if (diferenca > 0.05) return "subiu";
  if (diferenca < -0.05) return "desceu";
  return "estavel";
}

function rotuloClassificacao(aluno: Aluno) {
  const status = classificarAluno(aluno);
  if (status === "critico") return "Critico";
  if (status === "atencao") return "Atenção";
  return "Adequado";
}

function calcularMetricasTurma(alunos: Aluno[]) {
  const medias = alunos.map(calcularMediaAluno).filter((valor): valor is number => valor !== null && valor !== undefined);
  const mediaGeral = medias.length ? medias.reduce((total, valor) => total + valor, 0) / medias.length : null;
  return alunos.reduce((metricas, aluno) => {
    const status = classificarAluno(aluno);
    return {
      ...metricas,
      adequados: metricas.adequados + (status === "adequado" ? 1 : 0),
      atencao: metricas.atencao + (status === "atencao" ? 1 : 0),
      criticos: metricas.criticos + (status === "critico" ? 1 : 0),
    };
  }, { adequados: 0, atencao: 0, criticos: 0, mediaGeral });
}

function rotuloBimestre(valor: string | null | undefined) {
  return opcoesBimestre.find((opcao) => opcao.valor === valor)?.rotulo ?? "1º bimestre";
}
function CouncilMetric({
  value,
  label,
  tone,
  icon,
}: {
  value: string;
  label: string;
  tone?: "green" | "amber" | "red";
  icon?: ReactNode;
}) {
  return (
    <article className={`council-metric ${tone ?? ""}`}>
      <div className="council-metric-value">
        {icon}
        <strong>{value}</strong>
      </div>
      <span>{label}</span>
    </article>
  );
}

export function Council({
  aluno,
  turmaConfig,
  alunos,
  totalAlunos,
  indiceAluno,
  resumo,
  turmaSelecionada,
  turmaDetalhe,
  bimestreSelecionado,
  setBimestreSelecionado,
  erroConselho,
  selecionarAluno,
  salvarAjustesMedia,
  salvarEncaminhamentos,
  modoReuniao,
  setModoReuniao,
}: {
  aluno: Aluno;
  turmaConfig: { lider_ativo: boolean; lider_rotulo: string; elegivel_ativo: boolean; elegivel_rotulo: string };
  alunos: Aluno[];
  totalAlunos: number;
  indiceAluno: number;
  resumo: { abaixo: number; ajustadas: number; semNota: number };
  turmaSelecionada: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  bimestreSelecionado: string;
  setBimestreSelecionado: (bimestre: string) => void;
  erroConselho: string;
  selecionarAluno: (indice: number) => void;
  salvarAjustesMedia: (ajustes: AjusteMediaPayload[]) => Promise<void>;
  salvarEncaminhamentos: (codigos: number[]) => Promise<void>;
  modoReuniao: boolean;
  setModoReuniao: (ativo: boolean) => void;
}) {
  const [disciplinaEditando, setDisciplinaEditando] = useState<string | null>(null);
  const [disciplinaHistoricoAberta, setDisciplinaHistoricoAberta] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [erroEdicao, setErroEdicao] = useState("");
  const [salvandoDisciplina, setSalvandoDisciplina] = useState<string | null>(null);
  const [erroEncaminhamento, setErroEncaminhamento] = useState("");
  const [salvandoEncaminhamento, setSalvandoEncaminhamento] = useState<number | null>(null);
  const [documentosAbertos, setDocumentosAbertos] = useState(false);
  const [documentosConselho, setDocumentosConselho] = useState<DocumentoConselho[]>([]);
  const [documentoAbrindo, setDocumentoAbrindo] = useState<string | null>(null);
  const [mensagemDocumento, setMensagemDocumento] = useState("");
  const [alunosDeliberados, setAlunosDeliberados] = useState<Set<string>>(() => new Set());
  const [filtroAlunos, setFiltroAlunos] = useState<"todos" | "critico" | "atencao">("todos");
  const [inicioReuniao, setInicioReuniao] = useState<number | null>(null);
  const [tempoBaseReuniao, setTempoBaseReuniao] = useState(0);
  const [tempoReuniao, setTempoReuniao] = useState(0);
  const [finalizacaoAberta, setFinalizacaoAberta] = useState(false);
  const turmaLabel = turmaSelecionada
    ? `${turmaSelecionada.codigo} - ${turmaSelecionada.ano} - ${rotuloBimestre(turmaDetalhe?.bimestre ?? bimestreSelecionado)}`
    : `2A - ${rotuloBimestre(bimestreSelecionado)}`;
  const metricasTurma = calcularMetricasTurma(alunos);
  const alunosFiltrados = useMemo(() => {
    if (filtroAlunos === "todos") {
      return alunos.map((item, indice) => ({ item, indice }));
    }
    return alunos
      .map((item, indice) => ({ item, indice }))
      .filter(({ item }) => classificarAluno(item) === filtroAlunos);
  }, [alunos, filtroAlunos]);

  useEffect(() => {
    const acumulado = turmaDetalhe?.tempo_conselho_segundos ?? 0;
    setTempoBaseReuniao(acumulado);
    setTempoReuniao(acumulado);
    setInicioReuniao(null);
    setFinalizacaoAberta(false);
  }, [turmaDetalhe?.bimestre, turmaDetalhe?.tempo_conselho_segundos]);

  useEffect(() => {
    if (!modoReuniao || inicioReuniao === null) {
      return;
    }

    const timer = window.setInterval(() => {
      const total = tempoBaseReuniao + Math.floor((Date.now() - inicioReuniao) / 1000);
      setTempoReuniao(total);
      if (turmaSelecionada && turmaDetalhe && total % 15 === 0) {
        invokeApp("salvar_tempo_conselho", {
          caminho: turmaSelecionada.caminho,
          bimestre: turmaDetalhe.bimestre,
          tempoSegundos: total,
        }).catch(() => {});
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [modoReuniao, inicioReuniao, tempoBaseReuniao, turmaSelecionada, turmaDetalhe]);

  function ativarModoReuniao() {
    const agora = Date.now();
    const acumulado = turmaDetalhe?.tempo_conselho_segundos ?? tempoReuniao;
    setTempoBaseReuniao(acumulado);
    setInicioReuniao(agora);
    setTempoReuniao(acumulado);
    setModoReuniao(true);
    invokeApp("definir_fullscreen", { ativo: true }).catch(() => {});
  }

  function abrirFinalizacao() {
    if (turmaSelecionada && turmaDetalhe) {
      invokeApp("salvar_tempo_conselho", {
        caminho: turmaSelecionada.caminho,
        bimestre: turmaDetalhe.bimestre,
        tempoSegundos: tempoReuniao,
      }).catch(() => {});
    }
    setFinalizacaoAberta(true);
  }

  function alternarDocumentacaoConselho() {
    if (!turmaSelecionada || !turmaDetalhe) {
      setMensagemDocumento("Selecione uma turma e um bimestre antes de abrir o documento.");
      return;
    }
    if (documentosAbertos) {
      setDocumentosAbertos(false);
      return;
    }
    setMensagemDocumento("");
    invokeApp<DocumentoConselho[]>("listar_documentos_conselho", {
      caminho: turmaSelecionada.caminho,
    })
      .then((documentos) => {
        setDocumentosConselho(documentos);
        setDocumentosAbertos(true);
        if (!documentos.length) {
          setMensagemDocumento("Nenhuma documentação de conselho gerada para esta turma.");
        }
      })
      .catch((error) => setMensagemDocumento(error instanceof Error ? error.message : String(error)));
  }

  function abrirDocumentoConselho(documento: DocumentoConselho) {
    setMensagemDocumento("");
    setDocumentoAbrindo(documento.caminho);
    invokeApp<string>("abrir_documento_conselho", { input: { caminho: documento.caminho } })
      .then(() => setMensagemDocumento(`${documento.tipo === "ata" ? "Ata" : "Relatório"} aberto.`))
      .catch((error) => setMensagemDocumento(error instanceof Error ? error.message : String(error)))
      .finally(() => setDocumentoAbrindo(null));
  }

  function sairModoReuniao() {
    setModoReuniao(false);
    setFinalizacaoAberta(false);
    invokeApp("definir_fullscreen", { ativo: false }).catch(() => {});
  }

  function iniciarEdicaoConselho(disciplina: Disciplina) {
    setErroEdicao("");
    setDisciplinaEditando(disciplina.nome);
    setValorEdicao(
      disciplina.mediaConselho == null ? "" : String(disciplina.mediaConselho).replace(".", ","),
    );
  }

  function salvarEdicaoConselho(disciplina: Disciplina) {
    if (salvandoDisciplina === disciplina.nome) {
      return;
    }

    const bruto = valorEdicao.trim();
    let media_ajustada: number | null = null;
    if (bruto) {
      const numero = Number(bruto.replace(",", "."));
      if (!Number.isFinite(numero) || numero < 0 || numero > 10) {
        setErroEdicao(`Nota invalida em ${disciplina.nome}. Use valores de 0 a 10.`);
        return;
      }
      media_ajustada = numero;
    }

    const originalAtual = disciplina.mediaConselho == null ? "" : String(disciplina.mediaConselho).replace(".", ",");
    if (bruto === originalAtual) {
      setDisciplinaEditando(null);
      return;
    }

    setErroEdicao("");
    setSalvandoDisciplina(disciplina.nome);
    salvarAjustesMedia([
      {
        disciplina: disciplina.nome,
        media_original: disciplina.mediaOriginal,
        media_ajustada,
        observacao: disciplina.observacaoConselho ?? "",
      },
    ])
      .then(() => setDisciplinaEditando(null))
      .catch((error) => setErroEdicao(error instanceof Error ? error.message : String(error)))
      .finally(() => setSalvandoDisciplina(null));
  }

  function alternarEncaminhamento(codigo: number) {
    if (salvandoEncaminhamento !== null) {
      return;
    }

    const selecionados = new Set(aluno.encaminhamentos);
    if (selecionados.has(codigo)) {
      selecionados.delete(codigo);
    } else {
      selecionados.add(codigo);
    }

    setErroEncaminhamento("");
    setSalvandoEncaminhamento(codigo);
    salvarEncaminhamentos([...selecionados].sort((a, b) => a - b))
      .catch((error) => setErroEncaminhamento(error instanceof Error ? error.message : String(error)))
      .finally(() => setSalvandoEncaminhamento(null));
  }

  function marcarAlunoDeliberado(item: Aluno) {
    const chave = item.matricula ?? item.nome;
    setAlunosDeliberados((atuais) => new Set(atuais).add(chave));
  }

  return (
    <>
      <header className={`topbar council-topbar ${modoReuniao ? "meeting-topbar" : ""}`}>
        <div>
          <span className="eyebrow">{turmaLabel}</span>
          {!modoReuniao && <h1>Conselho de classe</h1>}
          {!modoReuniao && <p>Acompanhamento e deliberacoes do conselho.</p>}
        </div>
        <div className="council-actions">
          {modoReuniao ? (
            <>
              <div className="meeting-timer">
                <Clock size={18} />
                {formatarTempo(tempoReuniao)}
              </div>
              <button className="danger-action" onClick={abrirFinalizacao}>
                Encerrar conselho
              </button>
            </>
          ) : (
            <>
              <button onClick={ativarModoReuniao}>
                <CalendarClock size={18} />
                Modo reuniao
              </button>
              <button
                onClick={alternarDocumentacaoConselho}
                disabled={!turmaSelecionada || !turmaDetalhe}
              >
                <ClipboardList size={18} />
                Documentação de conselho
              </button>
            </>
          )}
        </div>
      </header>

      {mensagemDocumento && !modoReuniao && (
        <div className="data-warning neutral">{mensagemDocumento}</div>
      )}

      {documentosAbertos && !modoReuniao && (
        <section className="panel council-documents-panel">
          <div className="panel-heading">
            <div>
              <h3>Documentação de conselho</h3>
              <p>Atas e relatórios já gerados para esta turma.</p>
            </div>
            <button type="button" className="ghost-action" onClick={() => setDocumentosAbertos(false)}>
              Fechar
            </button>
          </div>
          {documentosConselho.length > 0 ? (
            <div className="council-document-list">
              {documentosConselho.map((documento) => (
                <button
                  key={`${documento.tipo}-${documento.bimestre}-${documento.caminho}`}
                  type="button"
                  onClick={() => abrirDocumentoConselho(documento)}
                  disabled={documentoAbrindo !== null}
                >
                  <FileText size={18} />
                  <span>{documento.tipo === "ata" ? "Ata" : "Relatório dos professores"}</span>
                  <strong>{rotuloBimestre(documento.bimestre)}</strong>
                  {documentoAbrindo === documento.caminho && <em>Abrindo...</em>}
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-special-list">Nenhum documento foi gerado para esta turma.</div>
          )}
        </section>
      )}

      {!modoReuniao && <section className="panel council-summary-panel">
        <div className="summary-selector">
          <label htmlFor="bimestre-conselho">Bimestre</label>
          <select
            id="bimestre-conselho"
            value={bimestreSelecionado}
            onChange={(event) => setBimestreSelecionado(event.target.value)}
          >
            {opcoesBimestre.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="council-metrics">
          <CouncilMetric value={String(totalAlunos)} label="Total de alunos" />
          <CouncilMetric value={String(metricasTurma.adequados)} label="Adequados" tone="green" />
          <CouncilMetric value={String(metricasTurma.atencao)} label="Em atenção" tone="amber" />
          <CouncilMetric value={String(metricasTurma.criticos)} label="Críticos" tone="red" />
          <CouncilMetric value={formatarMediaGlobal(metricasTurma.mediaGeral)} label="Média geral" />
        </div>
      </section>}

      {erroConselho && <div className="data-warning">{erroConselho}</div>}

      {turmaSelecionada && !turmaDetalhe && !erroConselho && (
        <div className="data-warning neutral">
          Carregando alunos reais da turma selecionada.
        </div>
      )}

      <section className="council-workspace">
        <aside className="panel student-list-panel">
          <div className="panel-heading">
            <h3>Alunos da turma</h3>
          </div>
          <div className="student-filter-row">
            <button className={filtroAlunos === "todos" ? "active" : ""} onClick={() => setFiltroAlunos("todos")}>Todos</button>
            <button className={filtroAlunos === "critico" ? "active" : ""} onClick={() => setFiltroAlunos("critico")}>Críticos</button>
            <button className={filtroAlunos === "atencao" ? "active" : ""} onClick={() => setFiltroAlunos("atencao")}>Atenção</button>
          </div>
          <div className="student-list">
            {alunosFiltrados.map(({ item, indice }) => {
              const media = calcularMediaAluno(item);
              const status = classificarAluno(item);
              return (
                <button
                  className={`student-list-item ${indice === indiceAluno ? "active" : ""} ${
                    alunosDeliberados.has(item.matricula ?? item.nome) ? "deliberated" : ""
                  }`}
                  key={item.matricula ?? `${item.nome}-${indice}`}
                  onClick={() => selecionarAluno(indice)}
                  onBlur={() => marcarAlunoDeliberado(item)}
                  >
                  <div>
                    <strong>{item.nome}</strong>
                    <span>{item.matricula ? `RA: ${item.matricula}` : "Sem RA"}</span>
                  </div>
                  <div className="student-list-status">
                    {turmaConfig.elegivel_ativo && item.elegivel && <span className="mini-eligible">{turmaConfig.elegivel_rotulo}</span>}
                    <i className={status}></i>
                    <span>Media: {formatarMediaGlobal(media)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel council-detail-panel">
          <div className="student-detail-header">
            <div>
              <FotoAluno matricula={aluno.matricula} tamanho={114} />
              <div className="student-name" style={{ marginTop: "0.6rem" }}>
                {turmaConfig.elegivel_ativo && aluno.elegivel && <span className="eligible-badge">ALUNO {turmaConfig.elegivel_rotulo.toLocaleUpperCase("pt-BR")}</span>}
                <h2>{aluno.nome}</h2>
              </div>
              <p>
                {aluno.matricula ? `RA: ${aluno.matricula}` : "Sem RA"} | Media:{" "}
                {formatarMediaGlobal(calcularMediaAluno(aluno))} | Frequência mapão:{" "}
                <span className={frequenciaMapaoAbaixoDoMinimo(aluno.frequencia) ? "frequency-low" : ""}>
                  {formatarPercentual(aluno.frequencia)}
                </span>
              </p>
            </div>
            <div className="student-header-status">
              <span className="student-number">Nº {aluno.chamada || "-"}</span>
              <span className={`student-outcome ${classificarAluno(aluno)}`}>
                {rotuloClassificacao(aluno)}
              </span>
            </div>
          </div>

          <section className="summary-grid compact">
            <article>
              <span>Frequência mapão</span>
              <strong className={frequenciaMapaoAbaixoDoMinimo(aluno.frequencia) ? "frequency-low" : ""}>
                {formatarPercentual(aluno.frequencia)}
              </strong>
            </article>
            <article>
              <span>Abaixo da media</span>
              <strong>{resumo.abaixo}</strong>
            </article>
            <article>
              <span>Ajustadas</span>
              <strong>{resumo.ajustadas}</strong>
            </article>
            <article>
              <span>Sem nota</span>
              <strong>{resumo.semNota}</strong>
            </article>
          </section>

          <section className="council-detail-grid">
            <div className="table-panel">
              <div className="panel-heading">
                <h3>Disciplinas e notas</h3>
              </div>
              {erroEdicao && <div className="inline-edit-error">{erroEdicao}</div>}
              <table>
                <thead>
                  <tr>
                    <th>Disciplina</th>
                    <th>Original</th>
                    <th>Conselho</th>
                    <th>Faltas</th>
                    <th>Situacao</th>
                  </tr>
                </thead>
                <tbody>
                  {aluno.disciplinas.map((disciplina) => {
                    const evolucao = calcularEvolucaoDisciplina(disciplina, bimestreSelecionado);
                    const historicoAberto = disciplinaHistoricoAberta === disciplina.nome;
                    const historico = disciplina.historicoBimestres ?? [];
                    const diagnosticoDisciplina = diagnosticoSarespPorDisciplina(aluno.diagnosticoAprendizagem, disciplina.nome);
                    return (
                    <tr key={disciplina.nome}>
                      <td>
                        <strong>{disciplina.nome}</strong>
                        {diagnosticoDisciplina && (
                          <span className="subject-diagnostic-tags">
                            <i className={`diagnostic-level-tag ${classeStatusDiagnostico(diagnosticoDisciplina.status ?? "")}`}>{diagnosticoDisciplina.status ?? "-"}</i>
                            <i className="diagnostic-year-tag">{diagnosticoDisciplina.aprendizagem_equivalente ?? "-"}</i>
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="grade-history-cell">
                          <button
                            type="button"
                            className={`grade-trend ${evolucao}`}
                            onClick={() => setDisciplinaHistoricoAberta(historicoAberto ? null : disciplina.nome)}
                            disabled={!historico.length}
                            title="Ver histórico bimestral da disciplina"
                          >
                            {evolucao === "subiu" && <ArrowUpRight size={16} />}
                            {evolucao === "desceu" && <ArrowDownRight size={16} />}
                            {(evolucao === "estavel" || evolucao === "sem-dados") && <Minus size={16} />}
                          </button>
                          <span>{formatarNota(disciplina.mediaOriginal)}</span>
                          {historicoAberto && (
                            <div className="grade-history-popover">
                              <strong>{disciplina.nome}</strong>
                              {historico.length ? (
                                historico.map((item) => (
                                  <span key={`${disciplina.nome}-${item.bimestre}`}>
                                    {rotuloBimestre(item.bimestre)}: <b>{formatarNota(item.media)}</b>
                                  </span>
                                ))
                              ) : (
                                <span>Sem histórico bimestral.</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        className="editable-grade-cell"
                        onDoubleClick={() => iniciarEdicaoConselho(disciplina)}
                        title="Clique duas vezes para ajustar a nota de conselho"
                      >
                        {disciplinaEditando === disciplina.nome ? (
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={valorEdicao}
                            onBlur={() => salvarEdicaoConselho(disciplina)}
                            onChange={(event) => setValorEdicao(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                              if (event.key === "Escape") {
                                setDisciplinaEditando(null);
                                setErroEdicao("");
                              }
                            }}
                            disabled={salvandoDisciplina === disciplina.nome}
                          />
                        ) : (
                          <span className="editable-grade-value">{formatarNota(disciplina.mediaConselho)}</span>
                        )}
                      </td>
                      <td>
                        <span className={classeFaltas(disciplina)}>
                          {disciplina.faltas ?? "-"}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${disciplina.situacao}`}>
                          {situacaoLabel[disciplina.situacao]}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="notes-panel">
              <div className="panel-heading">
                <h3>Encaminhamentos</h3>
              </div>
              {erroEncaminhamento && <div className="inline-edit-error">{erroEncaminhamento}</div>}
              <div className="encaminhamentos-list">
                {encaminhamentos.map((texto, indice) => {
                  const codigo = indice + 1;
                  const selecionado = aluno.encaminhamentos.includes(codigo);
                  return (
                    <button
                      className={`encaminhamento-item ${selecionado ? "selected" : ""}`}
                      key={codigo}
                      onClick={() => alternarEncaminhamento(codigo)}
                      disabled={salvandoEncaminhamento !== null}
                    >
                      <span className="encaminhamento-code">ENC {codigo}</span>
                      <span>{texto}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </section>
      </section>

      {finalizacaoAberta && (
        <FinalizacaoConselho
          turmaLabel={turmaLabel}
          tempoSegundos={tempoReuniao}
          turmaSelecionada={turmaSelecionada}
          turmaDetalhe={turmaDetalhe}
          onClose={() => setFinalizacaoAberta(false)}
          onFinished={sairModoReuniao}
        />
      )}

    </>
  );
}

export function SelecaoConselho({
  turmas,
  erroTurmas,
  onSelecionar,
  turmaConfig,
}: {
  turmas: TurmaResumo[];
  erroTurmas: string;
  onSelecionar: (turma: TurmaResumo) => void;
  turmaConfig: { lider_ativo: boolean; lider_rotulo: string; elegivel_ativo: boolean; elegivel_rotulo: string };
}) {
  const [busca, setBusca] = useState("");
  const turmasFiltradas = filtrarTurmas(turmas, busca);

  return (
    <>
      <header className="topbar turmas-topbar">
        <div>
          <span className="eyebrow">Conselhos de classe</span>
          <h1>Selecionar conselho</h1>
          <p>Escolha a turma para iniciar ou reabrir o conselho.</p>
        </div>
      </header>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      <section className="panel turmas-search-panel">
        <label className="search-box">
          <Search size={21} />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar turma, coordenador ou aluno..."
          />
        </label>
      </section>

      <section className="turmas-card-grid">
        {turmasFiltradas.map((turma) => (
          <article
            className="turma-card conselho-card"
            key={turma.caminho}
          >
            <div className="turma-card-main">
              <h2>{rotuloTurma(turma)}</h2>
              <span>{rotuloSerie(turma.serie) || turma.ciclo || `${turma.ano}`}</span>
            </div>

            <div className="turma-card-meta">
              <span className="meta-line">
                <Users size={17} />
                {turma.alunos_ativos} alunos ativos
              </span>
              <span>
                Período: <strong>{turma.periodo ?? "Não informado"}</strong>
              </span>
              <span>
                Coordenador de sala: <strong>{turma.coordenador_turma || "A definir"}</strong>
              </span>
              {turmaConfig.lider_ativo && (
                <span className="class-leaders-line">
                  {turmaConfig.lider_rotulo}:
                  <strong>{turma.lider_sala || "A definir"}</strong>
                  <strong>{turma.vice_lider_sala || "Vice a definir"}</strong>
                </span>
              )}
              {turmaConfig.elegivel_ativo && (
                <span>
                  {turmaConfig.elegivel_rotulo}: <strong>{turma.alunos_elegiveis}</strong>
                </span>
              )}
            </div>

            <button className="details-action" onClick={() => onSelecionar(turma)}>
              Abrir conselho
            </button>
          </article>
        ))}

        {!turmasFiltradas.length && (
          <div className="panel empty-state">
            <ClipboardList size={32} />
            <strong>Nenhuma turma encontrada</strong>
            <span>Ajuste a busca ou importe/crie uma turma no app atual.</span>
          </div>
        )}
      </section>
    </>
  );
}

function filtrarTurmas(turmas: TurmaResumo[], busca: string) {
  const termo = normalizarBusca(busca);
  if (!termo) {
    return turmas;
  }

  return turmas.filter((turma) => {
    const campos = [
      turma.codigo,
      rotuloTurma(turma),
      String(turma.ano),
      turma.serie ?? "",
      rotuloSerie(turma.serie),
      turma.sala ?? "",
      turma.periodo ?? "",
      turma.ciclo ?? "",
      turma.coordenador_turma ?? "",
      turma.lider_sala ?? "",
      turma.vice_lider_sala ?? "",
      ...(turma.nomes_alunos ?? []),
    ];
    return campos.some((campo) => normalizarBusca(campo).includes(termo));
  });
}

function normalizarBusca(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function rotuloTurma(turma: TurmaResumo) {
  const serie = rotuloSerie(turma.serie);
  const codigo = turma.codigo ?? "";
  if (!serie) return codigo;
  const normalizar = (valor: string) => normalizarBusca(valor);
  if (normalizar(codigo).startsWith(normalizar(turma.serie ?? ""))) {
    const resto = codigo.slice(turma.serie?.length ?? 0).trim();
    return `${serie} ${resto}`.trim();
  }
  return rotuloSerie(codigo) || codigo;
}

function rotuloLideranca(lideranca: "lider" | "vice" | null | undefined) {
  if (lideranca === "lider") return "Líder";
  if (lideranca === "vice") return "Vice líder";
  return "Não";
}

function FinalizacaoConselho({
  turmaLabel,
  tempoSegundos,
  turmaSelecionada,
  turmaDetalhe,
  onClose,
  onFinished,
}: {
  turmaLabel: string;
  tempoSegundos: number;
  turmaSelecionada: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [textoAta, setTextoAta] = useState(
    turmaDetalhe?.texto_ata || `Conselho de classe - ${turmaLabel}`,
  );
  const [gerarAta, setGerarAta] = useState(true);
  const [gerarRelatorio, setGerarRelatorio] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<FinalizacaoResultado | null>(null);

  function finalizar() {
    if (!turmaSelecionada || !turmaDetalhe) {
      setErro("Selecione uma turma antes de finalizar o conselho.");
      return;
    }

    setErro("");
    setSalvando(true);
    invokeApp<FinalizacaoResultado>("salvar_finalizacao_conselho", {
      caminho: turmaSelecionada.caminho,
      bimestre: turmaDetalhe.bimestre,
      finalizacao: {
        texto: textoAta,
        tempo_segundos: tempoSegundos,
        gerar_ata: gerarAta,
        gerar_relatorio: gerarRelatorio,
      },
    })
      .then((retorno) => setResultado(retorno))
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setSalvando(false));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel finish-council-panel" role="dialog" aria-modal="true" aria-labelledby="finish-council-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Tempo de reuniao: {formatarTempo(tempoSegundos)}</span>
            <h2 id="finish-council-title">Finalizar conselho</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar finalizacao">
            <X size={18} />
          </button>
        </div>

        <div className="finish-council-body">
          <label>
            Texto da ata
            <textarea value={textoAta} onChange={(event) => setTextoAta(event.target.value)} rows={12} />
          </label>

          <div className="document-options">
            <button className={gerarAta ? "selected" : ""} onClick={() => setGerarAta((atual) => !atual)}>
              <FileText size={18} />
              Gerar ata deste conselho
            </button>
            <button className={gerarRelatorio ? "selected" : ""} onClick={() => setGerarRelatorio((atual) => !atual)}>
              <ClipboardList size={18} />
              Gerar relatorio para professores
            </button>
          </div>

          {erro && <div className="inline-edit-error">{erro}</div>}

          {resultado && (
            <div className="finish-confirmation">
              <strong>Conselho finalizado com sucesso.</strong>
              {resultado.ata && <span>Ata salva em: {resultado.ata}</span>}
              {resultado.relatorio && <span>Relatorio salvo em: {resultado.relatorio}</span>}
              {!resultado.ata && !resultado.relatorio && <span>Nenhum documento foi gerado.</span>}
            </div>
          )}
        </div>

        <div className="modal-actions">
          {resultado ? (
            <button className="primary-action" onClick={onFinished}>Fechar modo reuniao</button>
          ) : (
            <>
              <button onClick={onClose}>Retornar ao conselho</button>
              <button className="primary-action" onClick={finalizar} disabled={salvando}>
                {salvando ? "Finalizando..." : "Finalizar"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
