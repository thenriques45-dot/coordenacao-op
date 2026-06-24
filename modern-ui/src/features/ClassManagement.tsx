import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { BookOpen, CalendarClock, Copy, FileText, Paperclip, Pencil, Plus, Search, Sparkles, TrendingUp, Users, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  assistentePedagogicoDisponivel,
  assistenteManualDisponivel,
  carregarAiAssistantSettings,
  gerarRelatorioPedagogico,
  montarPromptRelatorioPedagogico,
  type AiAssistantSettings,
} from "./aiAssistant";
import { TaskLinkList } from "./Dashboard";
import { invokeApp, tauriDisponivel } from "./appBridge";
import { FotoAluno } from "./StudentPhoto";
import {
  carregarEventosCalendario,
  carregarTarefasKanban,
  KANBAN_UPDATED_EVENT,
  tarefasPorVinculo,
  type CalendarEvent,
  type KanbanTarefa,
} from "./management";

type NotaBimestre = {
  bimestre: string;
  media: number;
};

type AtribuicaoNota = {
  por: string;
  em: string;
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
  atribuicaoMedia?: AtribuicaoNota | null;
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
  atendimentos?: AtendimentoAluno[];
  diagnosticoAprendizagem?: DiagnosticoAprendizagem | null;
  disciplinas: Disciplina[];
};

type AtendimentoAnexo = {
  id: string;
  nome: string;
  tipo: string;
  dados: string;
  caminho: string | null;
  origem: string;
};

type AtendimentoAluno = {
  id: string;
  data: string;
  tipos: string[];
  atendido: string;
  tags: string[];
  descricao: string;
  anexos: AtendimentoAnexo[];
  followups?: AtendimentoFollowUp[];
  criado_em?: string | null;
  atualizado_em?: string | null;
};

type AtendimentoFollowUp = {
  id: string;
  data: string;
  tipos: string[];
  atendido: string;
  tags: string[];
  descricao: string;
  anexos: AtendimentoAnexo[];
  criado_em?: string | null;
  atualizado_em?: string | null;
};

type AtendimentoModalState =
  | { modo: "novo" }
  | { modo: "editar"; atendimento: AtendimentoAluno }
  | { modo: "followup"; atendimento: AtendimentoAluno }
  | { modo: "editar-followup"; atendimento: AtendimentoAluno; followup: AtendimentoFollowUp };

type DiagnosticoAprendizagem = {
  turma_origem: string | null;
  portugues: DiagnosticoComponente;
  matematica: DiagnosticoComponente;
  atualizado_em: string | null;
};

type DiagnosticoComponente = {
  aprendizagem_equivalente: string | null;
  status: string | null;
};

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

function calcularFrequenciaDisciplina(disciplina: Disciplina) {
  const faltas = disciplina.faltasAcumuladas ?? disciplina.faltas;
  const totalAulas = disciplina.totalAulasAcumuladas ?? disciplina.totalAulas;
  if (
    typeof faltas !== "number" ||
    typeof totalAulas !== "number" ||
    !Number.isFinite(faltas) ||
    !Number.isFinite(totalAulas) ||
    totalAulas <= 0
  ) {
    return null;
  }
  return Math.max(0, Math.min(100, ((totalAulas - faltas) / totalAulas) * 100));
}

function abreviarDisciplina(nome: string) {
  const abreviacoes: Record<string, string> = {
    "EDUCACAO FINANCEIRA": "ED. FINANC.",
    "LINGUA PORTUGUESA": "PORTUGUESA",
    "LINGUA INGLESA": "INGLES",
    "PROJETO DE VIDA": "PROJ. VIDA",
    "REDACAO E LEITURA": "REDACAO",
    "MATEMATICA": "MATEMAT.",
    "GEOGRAFIA": "GEOGRAF.",
    "BIOLOGIA": "BIOLOGIA",
    "FILOSOFIA": "FILOSOF.",
    "HISTORIA": "HISTORIA",
    "QUIMICA": "QUIMICA",
    "FISICA": "FISICA",
  };
  return abreviacoes[nome] ?? (nome.length > 10 ? `${nome.slice(0, 9)}.` : nome);
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

function classeNota(nota: number | null | undefined) {
  if (nota === null || nota === undefined || !Number.isFinite(nota)) return "sem-nota";
  if (nota < 5) return "abaixo";
  if (nota === 5) return "cuidado";
  return "adequada";
}

function classeTextoNota(nota: number | null | undefined) {
  return `grade-value ${classeNota(nota)}`;
}

function formatarAtribuicao(atribuicao: AtribuicaoNota | null | undefined) {
  if (!atribuicao) return null;
  const data = new Date(atribuicao.em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  return `Importado por ${atribuicao.por} em ${data}`;
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
  return alunos.reduce(
    (metricas, aluno) => {
      const status = classificarAluno(aluno);
      return {
        ...metricas,
        adequados: metricas.adequados + (status === "adequado" ? 1 : 0),
        atencao: metricas.atencao + (status === "atencao" ? 1 : 0),
        criticos: metricas.criticos + (status === "critico" ? 1 : 0),
      };
    },
    { adequados: 0, atencao: 0, criticos: 0, mediaGeral },
  );
}

function DiagnosticSubjectCard({
  titulo,
  diagnostico,
}: {
  titulo: string;
  diagnostico: DiagnosticoComponente;
}) {
  const status = diagnostico.status ?? "-";
  return (
    <article className={`diagnostic-subject-card ${classeStatusDiagnostico(status)}`}>
      <span>{titulo}</span>
      <strong>{status}</strong>
      <small>Aprendizagem equivalente: {diagnostico.aprendizagem_equivalente ?? "-"}</small>
    </article>
  );
}

function classeStatusDiagnostico(status: string) {
  const texto = status.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (texto.includes("abaixo")) return "below-basic";
  if (texto.includes("profic")) return "proficient";
  if (texto.includes("bas")) return "basic";
  return "unknown";
}

function diagnosticoSarespPorDisciplina(diagnostico: DiagnosticoAprendizagem | null | undefined, disciplina: string) {
  if (!diagnostico) return null;
  const nome = normalizarBusca(disciplina);
  if (nome === "portugues" || nome === "portuguesa" || nome === "lingua portuguesa") {
    return diagnostico.portugues;
  }
  if (nome === "matematica") {
    return diagnostico.matematica;
  }
  return null;
}

function normalizarBusca(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function rotuloBimestre(valor: string | null | undefined) {
  const opcoes = [
    { valor: "1", rotulo: "1º bimestre" },
    { valor: "2", rotulo: "2º bimestre" },
    { valor: "3", rotulo: "3º bimestre" },
    { valor: "4", rotulo: "4º bimestre/conselho final" },
  ];
  return opcoes.find((opcao) => opcao.valor === valor)?.rotulo ?? "1º bimestre";
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
  if (normalizarBusca(codigo).startsWith(normalizarBusca(turma.serie ?? ""))) {
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
      {icon && <span className="council-metric-icon">{icon}</span>}
      <div className="council-metric-value">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}
export function GestaoTurma({
  turma,
  turmaDetalhe,
  alunos,
  turmaConfig,
  onVoltar,
  onSalvarCoordenador,
  onSalvarElegibilidade,
  onSalvarLideranca,
  onSalvarEducacaoEspecial,
  onSalvarAtendimento,
  onOpenKanban,
}: {
  turma: TurmaResumo | null;
  turmaDetalhe: TurmaDetalhe | null;
  alunos: Aluno[];
  turmaConfig: { lider_ativo: boolean; lider_rotulo: string; elegivel_ativo: boolean; elegivel_rotulo: string; atendimento_tipos?: string[] };
  onVoltar: () => void;
  onSalvarCoordenador: (coordenador: string) => Promise<void>;
  onSalvarElegibilidade: (matricula: string, elegivel: boolean) => Promise<void>;
  onSalvarLideranca: (matricula: string, lideranca: "lider" | "vice" | null) => Promise<void>;
  onSalvarEducacaoEspecial: (matricula: string, deficiencias: string[], comentario: string) => Promise<void>;
  onSalvarAtendimento: (matricula: string, input: { id?: string; parent_id?: string; data: string; tipos: string[]; atendido: string; tags: string[]; descricao: string; anexos: AtendimentoAnexo[] }) => Promise<void>;
  onOpenKanban: () => void;
}) {
  const [aba, setAba] = useState<"alunos" | "estatisticas" | "tarefas">("alunos");
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editandoCoordenador, setEditandoCoordenador] = useState(false);
  const [coordenador, setCoordenador] = useState(turma?.coordenador_turma ?? "");
  const [salvandoElegivel, setSalvandoElegivel] = useState<string | null>(null);
  const [salvandoLideranca, setSalvandoLideranca] = useState<string | null>(null);
  const [alunoAberto, setAlunoAberto] = useState<Aluno | null>(null);
  const [tarefasKanban, setTarefasKanban] = useState<KanbanTarefa[]>(() => carregarTarefasKanban());
  const eventosCalendario = useMemo(() => carregarEventosCalendario(), []);
  const catalogoDeficiencias = useMemo(() => {
    const itens = new Set<string>();
    alunos.forEach((aluno) => aluno.deficiencias.forEach((item) => {
      if (item.trim()) itens.add(item.trim());
    }));
    return Array.from(itens).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [alunos]);

  useEffect(() => {
    setCoordenador(turma?.coordenador_turma ?? "");
    setAlunoAberto(null);
  }, [turma?.coordenador_turma, turma?.caminho]);

  const alunosAtivos = useMemo(() => alunos.filter((aluno) => aluno.ativo !== false), [alunos]);
  const totalInativos = alunos.length - alunosAtivos.length;
  const alunosVisiveis = mostrarInativos ? alunos : alunosAtivos;

  const alunosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return alunosVisiveis;
    return alunosVisiveis.filter((aluno) => [aluno.nome, aluno.matricula ?? ""].some((campo) => campo.toLocaleLowerCase("pt-BR").includes(termo)));
  }, [alunosVisiveis, busca]);

  // Métricas e desempenho consideram apenas os alunos ativos.
  const disciplinas = useMemo(() => Array.from(new Set(alunosAtivos.flatMap((aluno) => aluno.disciplinas.map((disciplina) => disciplina.nome)))).sort(), [alunosAtivos]);
  const mediaGeral = calcularMetricasTurma(alunosAtivos).mediaGeral;
  const metricas = calcularMetricasTurma(alunosAtivos);
  const total = alunosAtivos.length || 1;
  const desempenhoDisciplinas = useMemo(() => disciplinas.map((disciplina) => {
    const notas = alunosAtivos.flatMap((aluno) => {
      const nota = aluno.disciplinas.find((item) => item.nome === disciplina)?.mediaOriginal;
      return typeof nota === "number" && Number.isFinite(nota) ? [nota] : [];
    });
    const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0;
    return { disciplina, media };
  }), [alunosAtivos, disciplinas]);
  const bimestreLabel = `${turmaDetalhe?.bimestre ?? "1"}º bim`;
  const percentuaisSituacao = {
    adequados: Math.round(metricas.adequados / total * 100),
    atencao: Math.round(metricas.atencao / total * 100),
    criticos: Math.round(metricas.criticos / total * 100),
  };
  const tarefasDaTurma = useMemo(() => {
    const termos = [
      turma ? rotuloTurma(turma) : "",
      turma?.codigo ?? "",
      turma?.serie ? rotuloSerie(turma.serie) : "",
      turma?.sala ? `Sala ${turma.sala}` : "",
    ];
    return tarefasPorVinculo(tarefasKanban, eventosCalendario, termos);
  }, [tarefasKanban, eventosCalendario, turma]);

  useEffect(() => {
    function atualizarTarefas() {
      setTarefasKanban(carregarTarefasKanban());
    }

    function atualizarSeStorage(event: StorageEvent) {
      if (!event.key || event.key.includes("quadro-kanban")) {
        atualizarTarefas();
      }
    }

    window.addEventListener(KANBAN_UPDATED_EVENT, atualizarTarefas);
    window.addEventListener("storage", atualizarSeStorage);
    window.addEventListener("focus", atualizarTarefas);
    return () => {
      window.removeEventListener(KANBAN_UPDATED_EVENT, atualizarTarefas);
      window.removeEventListener("storage", atualizarSeStorage);
      window.removeEventListener("focus", atualizarTarefas);
    };
  }, []);

  useEffect(() => {
    if (aba === "tarefas" && tarefasDaTurma.length === 0) {
      setAba("alunos");
    }
  }, [aba, tarefasDaTurma.length]);

  function salvarCoordenador() {
    onSalvarCoordenador(coordenador).finally(() => setEditandoCoordenador(false));
  }

  function alternarElegivel(aluno: Aluno) {
    const matricula = aluno.matricula;
    if (!matricula) return;
    setSalvandoElegivel(matricula);
    onSalvarElegibilidade(matricula, !aluno.elegivel).finally(() => setSalvandoElegivel(null));
  }

  function alternarLideranca(aluno: Aluno) {
    const matricula = aluno.matricula;
    if (!matricula) return;
    const atual = aluno.liderancaSala ?? null;
    const liderAtual = alunos.find((item) => item.liderancaSala === "lider");
    const viceAtual = alunos.find((item) => item.liderancaSala === "vice");
    let proxima: "lider" | "vice" | null = null;

    if (atual === "vice") {
      proxima = null;
    } else if (atual === "lider") {
      proxima = viceAtual && viceAtual.matricula !== matricula ? null : "vice";
    } else if (!liderAtual) {
      proxima = "lider";
    } else if (!viceAtual) {
      proxima = "vice";
    } else {
      const confirmar = window.confirm(
        `A turma já tem líder (${liderAtual.nome}) e vice líder (${viceAtual.nome}). Deseja limpar essas indicações?`,
      );
      if (!confirmar) return;
      setSalvandoLideranca(matricula);
      Promise.all([
        liderAtual.matricula ? onSalvarLideranca(liderAtual.matricula, null) : Promise.resolve(),
        viceAtual.matricula ? onSalvarLideranca(viceAtual.matricula, null) : Promise.resolve(),
      ]).finally(() => setSalvandoLideranca(null));
      return;
    }

    if (proxima) {
      const ocupante = alunos.find((item) => item.matricula !== matricula && item.liderancaSala === proxima);
      if (ocupante && !window.confirm(`${ocupante.nome} já está como ${rotuloLideranca(proxima)}. Deseja trocar?`)) {
        return;
      }
    }
    setSalvandoLideranca(matricula);
    onSalvarLideranca(matricula, proxima).finally(() => setSalvandoLideranca(null));
  }

  if (alunoAberto) {
    return (
      <>
        <button className="back-link" onClick={onVoltar}>← Voltar para Turmas</button>

        <section className="panel turma-detail-hero">
          <div className="turma-detail-title">
            <h1>{turma ? rotuloTurma(turma) : "Turma"}</h1>
            <span>{turma?.periodo ?? "Período não informado"}</span>
          </div>
        </section>

        <AlunoDetalheGestao
          aluno={alunoAberto}
          bimestre={turmaDetalhe?.bimestre ?? "1"}
          turmaLabel={turma ? rotuloTurma(turma) : undefined}
          onVoltar={() => setAlunoAberto(null)}
          catalogoDeficiencias={catalogoDeficiencias}
          tiposAtendimento={turmaConfig.atendimento_tipos ?? []}
          onSalvarEducacaoEspecial={onSalvarEducacaoEspecial}
          onSalvarAtendimento={onSalvarAtendimento}
          tarefas={tarefasKanban}
          eventos={eventosCalendario}
          onOpenKanban={onOpenKanban}
        />
      </>
    );
  }

  return (
    <>
      <button className="back-link" onClick={onVoltar}>← Voltar para Turmas</button>

      <section className="panel turma-detail-hero">
        <div className="turma-detail-title">
          <h1>{turma ? rotuloTurma(turma) : "Turma"}</h1>
          <span>{turma?.periodo ?? "Período não informado"}</span>
        </div>
        <div className="turma-info-grid">
          <div><span>Série</span><strong>{rotuloSerie(turma?.serie) || turma?.ciclo || "-"}</strong></div>
          <div><span>Ano Letivo</span><strong>{turma?.ano ?? "-"}</strong></div>
          <div><span>Sala</span><strong>{turma?.sala ? `Sala ${turma.sala}` : "Não informada"}</strong></div>
          <div className="coordinator-field">
            <span>Coordenador da turma</span>
            {editandoCoordenador ? (
              <input
                autoFocus
                value={coordenador}
                onChange={(event) => setCoordenador(event.target.value)}
                onBlur={salvarCoordenador}
                onKeyDown={(event) => {
                  if (event.key === "Enter") salvarCoordenador();
                  if (event.key === "Escape") setEditandoCoordenador(false);
                }}
              />
            ) : (
              <button onClick={() => setEditandoCoordenador(true)}>
                <strong>{coordenador || "A definir"}</strong>
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="class-metric-row">
          <CouncilMetric icon={<Users size={21} />} value={`${turma?.alunos_ativos ?? alunosAtivos.length}/${turma?.total_alunos ?? alunos.length}`} label="Alunos/Total" />
          <CouncilMetric icon={<TrendingUp size={21} />} value={formatarMediaGlobal(mediaGeral)} label="Média Geral" tone="green" />
          <CouncilMetric icon={<CalendarClock size={21} />} value={formatarPercentual(mediaGeral === null ? null : alunos.reduce((soma, aluno) => soma + (aluno.frequencia ?? 0), 0) / total)} label="Frequência Média" />
          <CouncilMetric icon={<BookOpen size={21} />} value={String(disciplinas.length)} label="Disciplinas" />
        </div>
      </section>

      <div className="detail-tabs">
        <button className={aba === "alunos" ? "active" : ""} onClick={() => setAba("alunos")}>Alunos ({alunos.length})</button>
        <button className={aba === "estatisticas" ? "active" : ""} onClick={() => setAba("estatisticas")}>Estatísticas</button>
        {tarefasDaTurma.length > 0 && (
          <button className={aba === "tarefas" ? "active" : ""} onClick={() => setAba("tarefas")}>Tarefas ({tarefasDaTurma.length})</button>
        )}
      </div>

      {aba === "alunos" && (
        <>
          <div className="class-search-row">
            <label className="search-box class-search">
              <Search size={21} />
              <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar aluno por nome ou matrícula..." />
            </label>
            {totalInativos > 0 && (
              <label className="inactive-toggle" title="Exibir também os alunos inativos">
                <input
                  type="checkbox"
                  checked={mostrarInativos}
                  onChange={(event) => setMostrarInativos(event.target.checked)}
                />
                Mostrar inativos ({totalInativos})
              </label>
            )}
          </div>
          <div className="panel students-table-wrap">
            <table className="students-table">
              <thead><tr><th>Nome</th><th>RA</th><th>Média</th><th>Frequência</th><th>Situação</th>{turmaConfig.elegivel_ativo && <th>{turmaConfig.elegivel_rotulo}</th>}{turmaConfig.lider_ativo && <th>{turmaConfig.lider_rotulo}</th>}</tr></thead>
              <tbody>
                {alunosFiltrados.map((aluno) => {
                  const status = classificarAluno(aluno);
                  return (
                    <tr
                      className={`student-table-row${aluno.ativo === false ? " inactive" : ""}`}
                      key={aluno.matricula ?? aluno.nome}
                      onClick={() => setAlunoAberto(aluno)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setAlunoAberto(aluno);
                      }}
                    >
                      <td>
                        <strong>{aluno.nome}</strong>
                        {aluno.ativo === false && <span className="inactive-badge">Inativo</span>}
                        <span>Nº {aluno.chamada || "-"}</span>
                      </td>
                      <td>{aluno.matricula ?? "-"}</td>
                      <td className={status === "critico" ? "danger-text" : "success-text"}>{formatarMediaGlobal(calcularMediaAluno(aluno))}</td>
                      <td>{formatarPercentual(aluno.frequencia)}</td>
                      <td><span className={`class-status-pill ${status}`}>{rotuloClassificacao(aluno)}</span></td>
                      {turmaConfig.elegivel_ativo && (
                        <td>
                          <button
                            className={`eligible-toggle ${aluno.elegivel ? "yes" : "no"}`}
                            disabled={salvandoElegivel === aluno.matricula}
                            onClick={(event) => {
                              event.stopPropagation();
                              alternarElegivel(aluno);
                            }}
                          >
                            {aluno.elegivel ? "Sim" : "Não"}
                          </button>
                        </td>
                      )}
                      {turmaConfig.lider_ativo && (
                        <td>
                          <button
                            className={`leader-toggle ${aluno.liderancaSala ?? "no"}`}
                            disabled={salvandoLideranca === aluno.matricula}
                            onClick={(event) => {
                              event.stopPropagation();
                              alternarLideranca(aluno);
                            }}
                          >
                            {rotuloLideranca(aluno.liderancaSala ?? null)}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {aba === "estatisticas" && (
        <section className="stats-layout">
          <div className="panel stats-card discipline-performance-card">
            <div className="stats-card-heading">
              <h3>Desempenho por Disciplina</h3>
              <span>{bimestreLabel}</span>
            </div>
            <div className="subject-performance-chart">
              {desempenhoDisciplinas.map(({ disciplina, media }) => {
                return (
                  <div className="subject-performance-row" key={disciplina}>
                    <span title={disciplina}>{disciplina}</span>
                    <div className="subject-performance-track">
                      <i style={{ width: `${Math.max(2, media * 10)}%` }} />
                    </div>
                    <strong>{formatarMediaGlobal(media)}</strong>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel stats-card status-evolution-card">
            <div className="stats-card-heading">
              <h3>Evolução da Situação da Turma</h3>
              <span>Panorama anual</span>
            </div>
            <div className="status-evolution-row">
              <span>{bimestreLabel}</span>
              <div className="status-evolution-bar" aria-label={`Distribuição da turma no ${bimestreLabel}`}>
                <i className="ok" style={{ width: `${percentuaisSituacao.adequados}%` }} />
                <i className="warn" style={{ width: `${percentuaisSituacao.atencao}%` }} />
                <i className="bad" style={{ width: `${percentuaisSituacao.criticos}%` }} />
              </div>
            </div>
            <div className="status-evolution-placeholder">
              <span>Os próximos bimestres entram aqui quando a turma tiver novos mapões importados.</span>
            </div>
            <div className="pie-legend status-legend">
              <span className="ok">Adequados: {percentuaisSituacao.adequados}%</span>
              <span className="warn">Atenção: {percentuaisSituacao.atencao}%</span>
              <span className="bad">Críticos: {percentuaisSituacao.criticos}%</span>
            </div>
          </div>
          <div className="panel stats-summary">
            <h3>Análise Geral da Turma</h3>
            <article className="ok"><strong>{metricas.adequados}</strong><span>Alunos em situação regular</span></article>
            <article className="warn"><strong>{metricas.atencao}</strong><span>Alunos necessitando atenção</span></article>
            <article className="bad"><strong>{metricas.criticos}</strong><span>Alunos em situação crítica</span></article>
          </div>
        </section>
      )}

      {aba === "tarefas" && (
        <section className="panel linked-tasks-panel">
          <div className="panel-heading">
            <div>
              <h3>Tarefas associadas à turma</h3>
              <p>Cards do Kanban vinculados à turma, sala ou eventos relacionados.</p>
            </div>
          </div>
          <TaskLinkList tarefas={tarefasDaTurma} eventos={eventosCalendario} emptyText="Nenhuma tarefa vinculada a esta turma." onOpenKanban={onOpenKanban} />
        </section>
      )}
    </>
  );
}

function AlunoDetalheGestao({
  aluno,
  bimestre,
  turmaLabel,
  onVoltar,
  catalogoDeficiencias,
  tiposAtendimento,
  onSalvarEducacaoEspecial,
  onSalvarAtendimento,
  tarefas,
  eventos,
  onOpenKanban,
}: {
  aluno: Aluno;
  bimestre: string;
  turmaLabel?: string;
  onVoltar: () => void;
  catalogoDeficiencias: string[];
  tiposAtendimento: string[];
  onSalvarEducacaoEspecial: (matricula: string, deficiencias: string[], comentario: string) => Promise<void>;
  onSalvarAtendimento: (matricula: string, input: { id?: string; parent_id?: string; data: string; tipos: string[]; atendido: string; tags: string[]; descricao: string; anexos: AtendimentoAnexo[] }) => Promise<void>;
  tarefas: KanbanTarefa[];
  eventos: CalendarEvent[];
  onOpenKanban: () => void;
}) {
  const [aba, setAba] = useState<"desempenho" | "atendimentos" | "educacao" | "tarefas">("desempenho");
  const [deficienciasSelecionadas, setDeficienciasSelecionadas] = useState<string[]>(aluno.deficiencias);
  const [comentario, setComentario] = useState(aluno.comentarioEducacaoEspecial ?? "");
  const [novaCondicao, setNovaCondicao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [assistenteAberto, setAssistenteAberto] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState("");
  const [relatorioIa, setRelatorioIa] = useState("");
  const [promptManual, setPromptManual] = useState("");
  const [modalPromptManual, setModalPromptManual] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiAssistantSettings>(() => carregarAiAssistantSettings());
  const [modalAtendimento, setModalAtendimento] = useState<AtendimentoModalState | null>(null);
  const [abaFormularioAtendimento, setAbaFormularioAtendimento] = useState<"detalhes" | "anexos">("detalhes");
  const [dataAtendimento, setDataAtendimento] = useState(new Date().toISOString().slice(0, 10));
  const [tiposAtendimentoSelecionados, setTiposAtendimentoSelecionados] = useState<string[]>([]);
  const [atendido, setAtendido] = useState<"aluno" | "responsavel">("aluno");
  const [tagsAtendimento, setTagsAtendimento] = useState("");
  const [descricaoAtendimento, setDescricaoAtendimento] = useState("");
  const [anexosAtendimento, setAnexosAtendimento] = useState<AtendimentoAnexo[]>([]);
  const [erroAtendimento, setErroAtendimento] = useState("");
  const [salvandoAtendimento, setSalvandoAtendimento] = useState(false);
  const status = classificarAluno(aluno);
  const mediaAluno = calcularMediaAluno(aluno);
  const bimestreAtual = Math.max(1, Math.min(4, Number.parseInt(bimestre, 10) || 1));
  const alturaLinhaGrafico = 22;
  const larguraGraficoAluno = 760;
  const alturaGraficoAluno = Math.max(180, 66 + aluno.disciplinas.length * alturaLinhaGrafico);
  const escalaGraficoAluno = 1.1;
  const graficoDisciplinas = aluno.disciplinas.map((disciplina, indice) => {
    const notaAtual = disciplina.mediaConselho ?? disciplina.mediaOriginal;
    const notas = [null, null, null, null] as Array<number | null>;
    notas[bimestreAtual - 1] = notaAtual;
    const pontos = notas
      .map((nota, bimestreIndice) => {
        if (nota === null) return null;
        const x = 220 + bimestreIndice * 150;
        const y = 46 + indice * alturaLinhaGrafico;
        return { x, y, nota, bimestre: bimestreIndice + 1 };
      })
      .filter((ponto): ponto is { x: number; y: number; nota: number; bimestre: number } => ponto !== null);

    return {
      nome: disciplina.nome,
      pontos,
    };
  });
  const opcoesDeficiencia = useMemo(() => {
    const itens = new Set([...catalogoDeficiencias, ...deficienciasSelecionadas].map((item) => item.trim()).filter(Boolean));
    return Array.from(itens).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [catalogoDeficiencias, deficienciasSelecionadas]);
  const tarefasDoAluno = useMemo(() => tarefasPorVinculo(tarefas, eventos, [aluno.nome, aluno.matricula ?? ""]), [tarefas, eventos, aluno.nome, aluno.matricula]);
  const podeGerarRelatorioIa = assistentePedagogicoDisponivel(aiSettings);
  const podeUsarPromptManual = assistenteManualDisponivel(aiSettings);

  useEffect(() => {
    setAba("desempenho");
    setDeficienciasSelecionadas(aluno.deficiencias);
    setComentario(aluno.comentarioEducacaoEspecial ?? "");
    setNovaCondicao("");
    setMensagem("");
    setErro("");
    setAssistenteAberto(false);
    setModalPromptManual(false);
    setPromptManual("");
    setErroRelatorio("");
    setRelatorioIa("");
    setAiSettings(carregarAiAssistantSettings());
    setModalAtendimento(null);
    setAbaFormularioAtendimento("detalhes");
    setDataAtendimento(new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados([]);
    setAtendido("aluno");
    setTagsAtendimento("");
    setDescricaoAtendimento("");
    setAnexosAtendimento([]);
    setErroAtendimento("");
  }, [aluno.matricula]);

  useEffect(() => {
    if (aba === "tarefas" && tarefasDoAluno.length === 0) {
      setAba("desempenho");
    }
  }, [aba, tarefasDoAluno.length]);

  function alternarDeficiencia(item: string) {
    setDeficienciasSelecionadas((atuais) => atuais.includes(item) ? atuais.filter((valor) => valor !== item) : [...atuais, item]);
  }

  function adicionarCondicao() {
    const texto = novaCondicao.trim();
    if (!texto) return;
    setDeficienciasSelecionadas((atuais) => atuais.some((item) => item.toLocaleLowerCase("pt-BR") === texto.toLocaleLowerCase("pt-BR")) ? atuais : [...atuais, texto]);
    setNovaCondicao("");
  }

  function salvarEducacaoEspecial() {
    if (!aluno.matricula) return;
    setSalvando(true);
    setMensagem("");
    setErro("");
    onSalvarEducacaoEspecial(aluno.matricula, deficienciasSelecionadas, comentario)
      .then(() => setMensagem("Informações de educação especial salvas."))
      .catch((err) => setErro(String(err)))
      .finally(() => setSalvando(false));
  }

  function resetarFormularioAtendimento() {
    setDataAtendimento(new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados([]);
    setAtendido("aluno");
    setTagsAtendimento("");
    setDescricaoAtendimento("");
    setAnexosAtendimento([]);
    setErroAtendimento("");
    setAbaFormularioAtendimento("detalhes");
  }

  function preencherFormularioAtendimento(registro: AtendimentoAluno | AtendimentoFollowUp) {
    setDataAtendimento(registro.data || new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados(registro.tipos ?? []);
    setAtendido(registro.atendido === "responsavel" ? "responsavel" : "aluno");
    setTagsAtendimento((registro.tags ?? []).join(", "));
    setDescricaoAtendimento(registro.descricao ?? "");
    setAnexosAtendimento(registro.anexos ?? []);
    setErroAtendimento("");
    setAbaFormularioAtendimento("detalhes");
  }

  function abrirNovoAtendimento() {
    resetarFormularioAtendimento();
    setModalAtendimento({ modo: "novo" });
  }

  function abrirEdicaoAtendimento(atendimento: AtendimentoAluno) {
    preencherFormularioAtendimento(atendimento);
    setModalAtendimento({ modo: "editar", atendimento });
  }

  function abrirFollowUpAtendimento(atendimento: AtendimentoAluno) {
    setDataAtendimento(new Date().toISOString().slice(0, 10));
    setTiposAtendimentoSelecionados(atendimento.tipos ?? []);
    setAtendido(atendimento.atendido === "responsavel" ? "responsavel" : "aluno");
    setTagsAtendimento((atendimento.tags ?? []).join(", "));
    setDescricaoAtendimento("");
    setAnexosAtendimento([]);
    setErroAtendimento("");
    setAbaFormularioAtendimento("detalhes");
    setModalAtendimento({ modo: "followup", atendimento });
  }

  function abrirEdicaoFollowUp(atendimento: AtendimentoAluno, followup: AtendimentoFollowUp) {
    preencherFormularioAtendimento(followup);
    setModalAtendimento({ modo: "editar-followup", atendimento, followup });
  }

  function fecharModalAtendimento() {
    setModalAtendimento(null);
    resetarFormularioAtendimento();
  }

  function alternarTipoAtendimento(tipo: string) {
    setTiposAtendimentoSelecionados((atuais) => (
      atuais.includes(tipo) ? atuais.filter((item) => item !== tipo) : [...atuais, tipo]
    ));
  }

  async function anexarArquivoAtendimento() {
    setErroAtendimento("");
    try {
      const selecionados = await abrirDialogoArquivo({
        multiple: true,
        title: "Selecionar anexos do atendimento",
      });
      const caminhos = Array.isArray(selecionados) ? selecionados : selecionados ? [selecionados] : [];
      if (!caminhos.length) return;
      const anexos = await Promise.all(
        caminhos.map((caminho) => invokeApp<AtendimentoAnexo>("preparar_anexo_atendimento", { caminho })),
      );
      setAnexosAtendimento((atuais) => [...atuais, ...anexos]);
    } catch (err) {
      setErroAtendimento(err instanceof Error ? err.message : String(err));
    }
  }

  function removerAnexoAtendimento(id: string) {
    setAnexosAtendimento((atuais) => atuais.filter((anexo) => anexo.id !== id));
  }

  async function abrirAnexoAtendimento(anexo: AtendimentoAnexo) {
    if (!anexo.caminho) return;
    try {
      await invokeApp("abrir_anexo_atendimento", { caminho: anexo.caminho });
    } catch (err) {
      setErroAtendimento(err instanceof Error ? err.message : String(err));
    }
  }

  function salvarAtendimento(event?: FormEvent) {
    event?.preventDefault();
    if (!aluno.matricula) return;
    setErroAtendimento("");
    setMensagem("");
    if (!dataAtendimento) {
      setErroAtendimento("Informe a data do atendimento.");
      return;
    }
    if (!tiposAtendimentoSelecionados.length) {
      setErroAtendimento("Selecione ao menos um tipo de atendimento.");
      return;
    }
    if (!descricaoAtendimento.trim()) {
      setErroAtendimento("Descreva o atendimento realizado.");
      return;
    }
    const input: { id?: string; parent_id?: string; data: string; tipos: string[]; atendido: string; tags: string[]; descricao: string; anexos: AtendimentoAnexo[] } = {
      data: dataAtendimento,
      tipos: tiposAtendimentoSelecionados,
      atendido,
      tags: tagsAtendimento.split(",").map((item) => item.trim()).filter(Boolean),
      descricao: descricaoAtendimento,
      anexos: anexosAtendimento,
    };
    if (modalAtendimento?.modo === "editar") {
      input.id = modalAtendimento.atendimento.id;
    }
    if (modalAtendimento?.modo === "followup") {
      input.parent_id = modalAtendimento.atendimento.id;
    }
    if (modalAtendimento?.modo === "editar-followup") {
      input.id = modalAtendimento.followup.id;
      input.parent_id = modalAtendimento.atendimento.id;
    }
    setSalvandoAtendimento(true);
    onSalvarAtendimento(aluno.matricula, input)
      .then(() => {
        const mensagemSucesso = modalAtendimento?.modo === "followup"
          ? "Seguimento registrado."
          : modalAtendimento?.modo === "editar" || modalAtendimento?.modo === "editar-followup"
            ? "Atendimento atualizado."
            : "Atendimento registrado.";
        setMensagem(mensagemSucesso);
        fecharModalAtendimento();
      })
      .catch((err) => setErroAtendimento(err instanceof Error ? err.message : String(err)))
      .finally(() => setSalvandoAtendimento(false));
  }

  async function gerarRelatorio() {
    setAiSettings(carregarAiAssistantSettings());
    setAssistenteAberto(true);
    setGerandoRelatorio(true);
    setErroRelatorio("");
    setRelatorioIa("");
    try {
      const texto = await gerarRelatorioPedagogico(carregarAiAssistantSettings(), {
        aluno,
        bimestre,
        turma: turmaLabel,
        tarefas: tarefasDoAluno.map((tarefa) => ({
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          prazo: tarefa.prazo,
          prioridade: tarefa.prioridade,
          status: tarefa.status,
        })),
      });
      setRelatorioIa(texto);
    } catch (err) {
      setErroRelatorio(err instanceof Error ? err.message : String(err));
    } finally {
      setGerandoRelatorio(false);
    }
  }

  async function copiarRelatorio() {
    if (!relatorioIa.trim()) return;
    await navigator.clipboard.writeText(relatorioIa);
    setMensagem("Relatório copiado para a área de transferência.");
  }

  function abrirPromptManual() {
    const prompt = montarPromptRelatorioPedagogico({
      aluno,
      bimestre,
      turma: turmaLabel,
      tarefas: tarefasDoAluno.map((tarefa) => ({
        titulo: tarefa.titulo,
        descricao: tarefa.descricao,
        prazo: tarefa.prazo,
        prioridade: tarefa.prioridade,
        status: tarefa.status,
      })),
    });
    setPromptManual(prompt);
    setModalPromptManual(true);
  }

  async function copiarPromptManual() {
    if (!promptManual.trim()) return;
    await navigator.clipboard.writeText(promptManual);
    setMensagem("Prompt copiado para colar na IA escolhida.");
  }

  async function abrirCopilotComPrompt() {
    await copiarPromptManual();
    abrirLinkExterno("https://copilot.microsoft.com");
  }

  async function abrirChatGptComPrompt() {
    await copiarPromptManual();
    abrirLinkExterno("https://chatgpt.com");
  }

  function abrirLinkExterno(url: string) {
    if (tauriDisponivel) {
      invokeApp("abrir_url", { url }).catch((err) => setErro(String(err)));
      return;
    }
    window.open(url, "_blank");
  }

  function onGerarRelatorioClick() {
    if (podeUsarPromptManual) {
      abrirPromptManual();
      return;
    }
    gerarRelatorio();
  }

  const atendimentosAluno = aluno.atendimentos ?? [];
  const totalFollowUps = atendimentosAluno.reduce((total, atendimento) => total + (atendimento.followups?.length ?? 0), 0);
  const opcoesTipoAtendimento = Array.from(new Set([...tiposAtendimento, ...tiposAtendimentoSelecionados])).filter(Boolean);
  const tituloModalAtendimento = modalAtendimento?.modo === "editar"
    ? "Editar atendimento"
    : modalAtendimento?.modo === "followup"
      ? "Seguir atendimento"
      : modalAtendimento?.modo === "editar-followup"
        ? "Editar seguimento"
        : "Registrar atendimento";
  const descricaoModalAtendimento = modalAtendimento?.modo === "followup" || modalAtendimento?.modo === "editar-followup"
      ? "Inclua uma nova etapa na timeline deste caso."
    : "Registre o contato realizado pela coordenação.";
  const rotuloBotaoSalvarAtendimento = salvandoAtendimento
    ? "Salvando..."
    : modalAtendimento?.modo === "editar" || modalAtendimento?.modo === "editar-followup"
      ? "Salvar alterações"
      : modalAtendimento?.modo === "followup"
        ? "Seguir atendimento"
        : "Registrar atendimento";

  return (
    <section className="panel student-profile-panel">
      <button className="back-link student-profile-back" onClick={onVoltar}>← Voltar para alunos</button>
      <header className="student-profile-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <FotoAluno matricula={aluno.matricula} tamanho={64} />
          <div>
            <h2>{aluno.nome}</h2>
            <p>RA: {aluno.matricula ?? "-"} | Média: {formatarMediaGlobal(mediaAluno)} | Frequência: {formatarPercentual(aluno.frequencia)}</p>
          </div>
        </div>
        <div className="student-profile-actions">
          {(podeGerarRelatorioIa || podeUsarPromptManual) && (
          <button type="button" className="ai-report-action" onClick={onGerarRelatorioClick}>
            <Sparkles size={17} />
            Gerar relatório
          </button>
          )}
          <span className={`class-status-pill ${status}`}>{rotuloClassificacao(aluno)}</span>
        </div>
      </header>

      <div className="student-profile-tabs">
        <button className={aba === "desempenho" ? "active" : ""} onClick={() => setAba("desempenho")}>Desempenho</button>
        <button className={aba === "atendimentos" ? "active" : ""} onClick={() => setAba("atendimentos")}>Atendimentos ({aluno.atendimentos?.length ?? 0})</button>
        {tarefasDoAluno.length > 0 && (
          <button className={aba === "tarefas" ? "active" : ""} onClick={() => setAba("tarefas")}>Tarefas ({tarefasDoAluno.length})</button>
        )}
        {aluno.elegivel && (
          <button className={aba === "educacao" ? "active" : ""} onClick={() => setAba("educacao")}>Educação Especial</button>
        )}
      </div>

      {aba === "desempenho" && (
      <>
      {aluno.diagnosticoAprendizagem && (
        <section className="student-diagnostic-panel">
          <div className="student-chart-heading">
            <h3>Diagnóstico SARESP</h3>
            {aluno.diagnosticoAprendizagem.turma_origem && <span>{aluno.diagnosticoAprendizagem.turma_origem}</span>}
          </div>
          <div className="student-diagnostic-grid">
            <DiagnosticSubjectCard titulo="Português" diagnostico={aluno.diagnosticoAprendizagem.portugues} />
            <DiagnosticSubjectCard titulo="Matemática" diagnostico={aluno.diagnosticoAprendizagem.matematica} />
          </div>
        </section>
      )}
      <section className="student-performance-grid">
        <article className="student-subject-evolution">
          <div className="student-chart-heading">
            <h3>Evolução por Disciplina</h3>
          </div>
          <div className="student-chart-scroll">
          <svg
            className="student-multi-line-chart"
            width={larguraGraficoAluno * escalaGraficoAluno}
            height={alturaGraficoAluno * escalaGraficoAluno}
            viewBox={`0 0 ${larguraGraficoAluno} ${alturaGraficoAluno}`}
            role="img"
            aria-label="Evolução das notas por disciplina"
          >
            {[1, 2, 3, 4].map((bim, indice) => {
              const x = 220 + indice * 150;
              return (
                <g key={bim}>
                  <line x1={x} x2={x} y1="40" y2={alturaGraficoAluno - 34} />
                  <text x={x} y="24">{bim}º bim</text>
                </g>
              );
            })}
            {graficoDisciplinas.map((disciplina, indice) => {
              const y = 46 + indice * alturaLinhaGrafico;
              return (
              <g key={disciplina.nome}>
                  <line className="student-subject-row-line" x1="160" x2="690" y1={y} y2={y} />
                  <text className="student-subject-axis-label" x="24" y={y + 4}>{abreviarDisciplina(disciplina.nome)}</text>
                {disciplina.pontos.map((ponto) => (
                  <g key={`${disciplina.nome}-${ponto.bimestre}`}>
                    <circle className={`student-grade-dot ${classeNota(ponto.nota)}`} cx={ponto.x} cy={ponto.y} r="3.8">
                    <title>{`${disciplina.nome} - ${ponto.bimestre}º bimestre: ${formatarNota(ponto.nota)}`}</title>
                  </circle>
                    <text className="student-grade-dot-label" x={ponto.x + 10} y={ponto.y + 4}>{formatarNota(ponto.nota)}</text>
                  </g>
                ))}
              </g>
              );
            })}
          </svg>
          </div>
          <div className="student-chart-legend">
            <span><i className="adequada" />Acima da média</span>
            <span><i className="cuidado" />Exatamente 5</span>
            <span><i className="abaixo" />Abaixo</span>
            <span><i className="sem-nota" />Sem nota</span>
          </div>
        </article>
      </section>

      <section className="student-subjects-section">
        <h3>Notas por Disciplina</h3>
        <div className="student-subjects-table-wrap">
          <table className="student-subjects-table">
            <thead>
              <tr><th>Disciplina</th><th>1º Bim</th><th>2º Bim</th><th>3º Bim</th><th>4º Bim</th><th>5º Conceito</th><th>Média</th><th>Freq.</th></tr>
            </thead>
            <tbody>
              {aluno.disciplinas.map((disciplina) => {
                const nota = disciplina.mediaConselho ?? disciplina.mediaOriginal;
                const frequencia = calcularFrequenciaDisciplina(disciplina);
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
                    {[1, 2, 3, 4].map((indice) => {
                      const eAtual = indice === bimestreAtual;
                      const tooltip = eAtual ? formatarAtribuicao(disciplina.atribuicaoMedia) : null;
                      return (
                        <td key={indice} className={classeTextoNota(eAtual ? nota : null)} title={tooltip ?? undefined}>
                          {eAtual ? formatarNota(nota) : "-"}
                        </td>
                      );
                    })}
                    <td className={classeTextoNota(disciplina.quintoConceito)}>{formatarNota(disciplina.quintoConceito)}</td>
                    <td className={classeTextoNota(nota)}>{formatarNota(nota)}</td>
                    <td className={frequencia !== null && frequencia >= 75 ? "success-text" : "danger-text"}>{formatarPercentual(frequencia)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="student-council-note">
        <h3>Parecer do Conselho - {bimestreAtual}º Bimestre</h3>
        <textarea placeholder="Digite aqui as observações e deliberações do conselho de classe..." />
      </section>
      </>
      )}

      {aba === "atendimentos" && (
        <section className="student-attendance-section">
          <div className="panel-heading attendance-heading">
            <div>
              <h3>Atendimentos</h3>
              <p>Histórico de casos e seguimentos registrados para este aluno.</p>
            </div>
            <button type="button" className="primary-action" onClick={abrirNovoAtendimento} disabled={!tiposAtendimento.length}>
              <Plus size={17} />
              Registrar atendimento
            </button>
          </div>
          {mensagem && <div className="notice success kanban-notice">{mensagem}</div>}
          {erroAtendimento && !modalAtendimento && <div className="notice error kanban-notice">{erroAtendimento}</div>}
          {!tiposAtendimento.length && (
            <div className="empty-special-list">Configure os tipos de atendimento em Configurações antes de registrar novos casos.</div>
          )}

          <div className="attendance-summary-row">
            <article>
              <span>Casos</span>
              <strong>{atendimentosAluno.length}</strong>
            </article>
            <article>
              <span>Seguimentos</span>
              <strong>{totalFollowUps}</strong>
            </article>
            <article>
              <span>Tipos configurados</span>
              <strong>{tiposAtendimento.length}</strong>
            </article>
          </div>

          <div className="attendance-history-list">
            {atendimentosAluno.length ? atendimentosAluno.map((atendimento) => (
              <article className="attendance-history-card" key={atendimento.id}>
                <header>
                  <div>
                    <strong>{formatarDataAtendimento(atendimento.data)}</strong>
                    <span>{atendimento.tipos.join(", ")} · {rotuloAtendidoAtendimento(atendimento.atendido)}</span>
                  </div>
                  <div className="attendance-card-actions">
                    <button type="button" onClick={() => abrirFollowUpAtendimento(atendimento)}>
                      <Plus size={14} />
                      Seguir atendimento
                    </button>
                    <button type="button" onClick={() => abrirEdicaoAtendimento(atendimento)} aria-label="Editar atendimento">
                      <Pencil size={14} />
                    </button>
                  </div>
                </header>
                {atendimento.tags.length > 0 && (
                  <div className="attendance-tags">
                    {atendimento.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                )}
                <p className="attendance-card-description">{atendimento.descricao}</p>
                <div className="attendance-card-meta">
                  <span><CalendarClock size={14} />{1 + (atendimento.followups?.length ?? 0)} item(ns) na timeline</span>
                  {atendimento.anexos.length > 0 && <span><Paperclip size={14} />{atendimento.anexos.length} anexo(s)</span>}
                </div>
                {atendimento.anexos.length > 0 && (
                  <div className="attendance-attachments saved compact">
                    {atendimento.anexos.map((anexo) => (
                      <button key={anexo.id} type="button" onClick={() => abrirAnexoAtendimento(anexo)}>
                        <FileText size={14} />
                        {anexo.nome}
                      </button>
                    ))}
                  </div>
                )}
                {(atendimento.followups?.length ?? 0) > 0 && (
                  <div className="attendance-timeline">
                    {atendimento.followups?.map((followup) => (
                      <div className="attendance-timeline-item" key={followup.id}>
                        <div>
                          <strong>{formatarDataAtendimento(followup.data)}</strong>
                          <span>{followup.tipos.join(", ")} · {rotuloAtendidoAtendimento(followup.atendido)}</span>
                        </div>
                        <p>{followup.descricao}</p>
                        {followup.tags.length > 0 && (
                          <div className="attendance-tags">
                            {followup.tags.map((tag) => <span key={tag}>{tag}</span>)}
                          </div>
                        )}
                        {followup.anexos.length > 0 && (
                          <div className="attendance-attachments saved compact">
                            {followup.anexos.map((anexo) => (
                              <button key={anexo.id} type="button" onClick={() => abrirAnexoAtendimento(anexo)}>
                                <FileText size={14} />
                                {anexo.nome}
                              </button>
                            ))}
                          </div>
                        )}
                        <button type="button" className="attendance-timeline-edit" onClick={() => abrirEdicaoFollowUp(atendimento, followup)}>
                          <Pencil size={13} />
                          Editar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )) : (
              <div className="empty-special-list">Nenhum atendimento registrado para este aluno.</div>
            )}
          </div>
        </section>
      )}

      {aba === "educacao" && aluno.elegivel && (
        <section className="special-education-panel">
          <div>
            <h3>Condições registradas</h3>
            <p>Marque as condições que devem ficar registradas na gestão da turma. Essas informações não aparecem na tela projetada do conselho.</p>
          </div>
          <div className="special-condition-grid">
            {opcoesDeficiencia.length ? opcoesDeficiencia.map((item) => (
              <button
                key={item}
                className={deficienciasSelecionadas.includes(item) ? "selected" : ""}
                onClick={() => alternarDeficiencia(item)}
                type="button"
              >
                {item}
              </button>
            )) : (
              <span className="empty-special-list">Nenhuma condição cadastrada ainda. Crie uma nova condição abaixo.</span>
            )}
          </div>
          <div className="special-add-row">
            <input
              value={novaCondicao}
              onChange={(event) => setNovaCondicao(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") adicionarCondicao();
              }}
              placeholder="Adicionar nova condição"
            />
            <button type="button" onClick={adicionarCondicao}>Adicionar</button>
          </div>
          <label className="special-comment">
            Comentário complementar
            <textarea
              value={comentario}
              onChange={(event) => setComentario(event.target.value)}
              placeholder="Registre orientações internas, observações pedagógicas ou informações complementares necessárias."
            />
          </label>
          <div className="special-actions">
            <button className="primary-action" onClick={salvarEducacaoEspecial} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar educação especial"}
            </button>
            {mensagem && <span className="success-text">{mensagem}</span>}
            {erro && <span className="danger-text">{erro}</span>}
          </div>
        </section>
      )}

      {aba === "tarefas" && (
        <section className="linked-tasks-panel student-linked-tasks">
          <div className="panel-heading">
            <div>
              <h3>Tarefas associadas ao aluno</h3>
              <p>Cards vinculados ao nome ou RA do estudante.</p>
            </div>
          </div>
          <TaskLinkList tarefas={tarefasDoAluno} eventos={eventos} emptyText="Nenhuma tarefa vinculada a este aluno." onOpenKanban={onOpenKanban} />
        </section>
      )}

      {modalAtendimento && (
        <div className="modal-backdrop">
          <form className="kanban-task-modal attendance-modal" onSubmit={salvarAtendimento}>
            <div className="modal-title-row">
              <div>
                <h2>{tituloModalAtendimento}</h2>
                <p>{descricaoModalAtendimento}</p>
              </div>
              <button type="button" onClick={fecharModalAtendimento} aria-label="Fechar atendimento">
                <X size={18} />
              </button>
            </div>
            {(modalAtendimento.modo === "followup" || modalAtendimento.modo === "editar-followup") && (
              <div className="attendance-parent-case">
                <span>Caso principal</span>
                <strong>{formatarDataAtendimento(modalAtendimento.atendimento.data)} · {modalAtendimento.atendimento.tipos.join(", ")}</strong>
              </div>
            )}
            <div className="kanban-task-tabs" role="tablist" aria-label="Seções do atendimento">
              {[
                { id: "detalhes", label: "Detalhes" },
                { id: "anexos", label: "Anexos" },
              ].map((abaFormulario) => (
                <button
                  key={abaFormulario.id}
                  type="button"
                  className={abaFormularioAtendimento === abaFormulario.id ? "active" : ""}
                  onClick={() => setAbaFormularioAtendimento(abaFormulario.id as "detalhes" | "anexos")}
                  role="tab"
                  aria-selected={abaFormularioAtendimento === abaFormulario.id}
                >
                  {abaFormulario.label}
                </button>
              ))}
            </div>
            <div className="kanban-task-modal-body">
              {abaFormularioAtendimento === "detalhes" && (
                <div className="kanban-task-tab-panel">
                  <div className="kanban-form-grid">
                    <label>
                      Data
                      <input type="date" value={dataAtendimento} onChange={(event) => setDataAtendimento(event.target.value)} autoFocus />
                    </label>
                    <label>
                      Atendido
                      <select value={atendido} onChange={(event) => setAtendido(event.target.value as "aluno" | "responsavel")}>
                        <option value="aluno">Aluno</option>
                        <option value="responsavel">Responsável</option>
                      </select>
                    </label>
                  </div>
                  <div className="attendance-type-picker">
                    <span>Tipos de atendimento</span>
                    <div>
                      {opcoesTipoAtendimento.length ? opcoesTipoAtendimento.map((tipo) => (
                        <button
                          key={tipo}
                          type="button"
                          className={tiposAtendimentoSelecionados.includes(tipo) ? "selected" : ""}
                          onClick={() => alternarTipoAtendimento(tipo)}
                        >
                          {tipo}
                        </button>
                      )) : (
                        <em>Configure os tipos de atendimento em Configurações.</em>
                      )}
                    </div>
                  </div>
                  <label>
                    Tags
                    <input
                      value={tagsAtendimento}
                      onChange={(event) => setTagsAtendimento(event.target.value)}
                      placeholder="Ex.: agressão, desrespeito, orientação familiar"
                    />
                    <span className="kanban-form-hint">Separe as tags por vírgula.</span>
                  </label>
                  <label>
                    Descrição do ocorrido
                    <textarea
                      value={descricaoAtendimento}
                      onChange={(event) => setDescricaoAtendimento(event.target.value)}
                      placeholder="Registre o contexto, encaminhamentos combinados e próximos passos."
                    />
                  </label>
                </div>
              )}

              {abaFormularioAtendimento === "anexos" && (
                <div className="kanban-task-tab-panel">
                  <label>
                    Anexos
                    <button type="button" className="kanban-file-picker" onClick={anexarArquivoAtendimento} disabled={!tauriDisponivel}>
                      <Paperclip size={16} />
                      <strong>Selecionar arquivos</strong>
                      <small>{anexosAtendimento.length ? `${anexosAtendimento.length} arquivo(s) anexado(s)` : "Nenhum arquivo anexado"}</small>
                    </button>
                  </label>
                  {anexosAtendimento.length > 0 && (
                    <div className="kanban-attachment-list">
                      {anexosAtendimento.map((anexo) => (
                        <span key={anexo.id}>
                          <Paperclip size={14} />
                          {anexo.nome}
                          {anexo.caminho && (
                            <button type="button" onClick={() => abrirAnexoAtendimento(anexo)} aria-label={`Abrir ${anexo.nome}`}>
                              <FileText size={13} />
                            </button>
                          )}
                          <button type="button" onClick={() => removerAnexoAtendimento(anexo.id)} aria-label={`Remover ${anexo.nome}`}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {erroAtendimento && <div className="attendance-modal-error">{erroAtendimento}</div>}
            <div className="modal-actions">
              <button type="button" onClick={fecharModalAtendimento}>Cancelar</button>
              <button type="submit" className="primary-action" disabled={salvandoAtendimento || !opcoesTipoAtendimento.length}>
                {rotuloBotaoSalvarAtendimento}
              </button>
            </div>
          </form>
        </div>
      )}

      {assistenteAberto && (
        <AssistenteRelatorioModal
          settings={aiSettings}
          alunoNome={aluno.nome}
          texto={relatorioIa}
          erro={erroRelatorio}
          gerando={gerandoRelatorio}
          onTextoChange={setRelatorioIa}
          onCopiar={copiarRelatorio}
          onTentarNovamente={gerarRelatorio}
          onFechar={() => setAssistenteAberto(false)}
        />
      )}
      {modalPromptManual && (
        <PromptManualModal
          prompt={promptManual}
          onCopiar={copiarPromptManual}
          onAbrirCopilot={abrirCopilotComPrompt}
          onAbrirChatGpt={abrirChatGptComPrompt}
          onFechar={() => setModalPromptManual(false)}
        />
      )}
    </section>
  );
}

function formatarDataAtendimento(data: string) {
  if (!data) return "-";
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function rotuloAtendidoAtendimento(atendido: string) {
  return atendido === "responsavel" ? "Responsável" : "Aluno";
}

function AssistenteRelatorioModal({
  settings,
  alunoNome,
  texto,
  erro,
  gerando,
  onTextoChange,
  onCopiar,
  onTentarNovamente,
  onFechar,
}: {
  settings: AiAssistantSettings;
  alunoNome: string;
  texto: string;
  erro: string;
  gerando: boolean;
  onTextoChange: (texto: string) => void;
  onCopiar: () => void;
  onTentarNovamente: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="ai-report-modal" role="dialog" aria-modal="true" aria-labelledby="ai-report-title">
        <header>
          <div>
            <span className="eyebrow">Assistente Pedagógico</span>
            <h2 id="ai-report-title">Relatório de {alunoNome}</h2>
            <p>{settings.provider === "ollama" ? "Ollama local" : "Gemini"} · {settings.model}</p>
          </div>
          <button type="button" className="icon-action" onClick={onFechar} aria-label="Fechar relatório">
            <X size={18} />
          </button>
        </header>
        <div className="ai-report-privacy-note">
          Este texto é um rascunho. Revise o conteúdo antes de usar em ata, reunião ou documento oficial.
        </div>
        {gerando ? (
          <div className="ai-report-loading">
            <Sparkles size={22} />
            <strong>Gerando rascunho pedagógico...</strong>
            <span>A IA está lendo apenas o resumo estruturado deste aluno.</span>
          </div>
        ) : erro ? (
          <div className="ai-report-error">
            <strong>Não foi possível gerar o relatório.</strong>
            <span>{erro}</span>
            <button type="button" onClick={onTentarNovamente}>Tentar novamente</button>
          </div>
        ) : (
          <textarea
            value={texto}
            onChange={(event) => onTextoChange(event.target.value)}
            placeholder="O rascunho gerado aparecerá aqui."
          />
        )}
        <footer>
          <button type="button" onClick={onFechar}>Fechar</button>
          <button type="button" className="primary-action" onClick={onCopiar} disabled={!texto.trim() || gerando}>
            <Copy size={16} />
            Copiar texto
          </button>
        </footer>
      </section>
    </div>
  );
}

function PromptManualModal({
  prompt,
  onCopiar,
  onAbrirCopilot,
  onAbrirChatGpt,
  onFechar,
}: {
  prompt: string;
  onCopiar: () => void;
  onAbrirCopilot: () => void;
  onAbrirChatGpt: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="ai-report-modal manual-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="manual-prompt-title">
        <header>
          <div>
            <span className="eyebrow">Assistente Pedagógico</span>
            <h2 id="manual-prompt-title">Gerar relatório em modo manual</h2>
            <p>Use o prompt em uma IA aberta pela sua própria conta.</p>
          </div>
          <button type="button" className="icon-action" onClick={onFechar} aria-label="Fechar instruções">
            <X size={18} />
          </button>
        </header>
        <div className="ai-report-privacy-note">
          O CoordenaçãoOP não envia os dados neste modo. Ao colar o texto em outro serviço, revise as regras de privacidade e autorização da escola.
        </div>
        <div className="manual-prompt-steps">
          <strong>Como usar</strong>
          <span>1. Clique em copiar prompt ou abra o Copilot/ChatGPT por aqui.</span>
          <span>2. Cole o texto na conversa da IA escolhida.</span>
          <span>3. Revise cuidadosamente o relatório antes de usar em ata, reunião ou documento oficial.</span>
        </div>
        <textarea readOnly value={prompt} />
        <footer>
          <button type="button" onClick={onFechar}>Fechar</button>
          <button type="button" onClick={onCopiar}>
            <Copy size={16} />
            Copiar prompt
          </button>
          <button type="button" className="primary-action" onClick={onAbrirCopilot}>Abrir Copilot</button>
          <button type="button" className="primary-action" onClick={onAbrirChatGpt}>Abrir ChatGPT</button>
        </footer>
      </section>
    </div>
  );
}
