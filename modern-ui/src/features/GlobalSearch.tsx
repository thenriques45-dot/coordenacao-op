import { BarChart2, BookOpen, Calendar, CornerDownLeft, FileText, Home, LayoutGrid, Search, Settings, Upload, Users } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

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

type AlunoResultado = {
  nome: string;
  turma: TurmaResumo;
};

type AcaoRapida = {
  id: string;
  label: string;
  icone: ReactNode;
  acao: () => void;
};

type TelaNavegacao = {
  id: string;
  label: string;
  icone: ReactNode;
  palavras: string[];
};

type Item =
  | { tipo: "turma"; data: TurmaResumo }
  | { tipo: "acao"; data: AcaoRapida }
  | { tipo: "tela"; data: TelaNavegacao }
  | { tipo: "aluno"; data: AlunoResultado };

type Props = {
  turmas: TurmaResumo[];
  onFechar: () => void;
  onAbrirTurma: (turma: TurmaResumo) => void;
  onAbrirAluno: (turma: TurmaResumo, nome: string) => void;
  onNavegar: (tela: string) => void;
  onAbrirConselho: (turma: TurmaResumo) => void;
};

function normalizar(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function toTitleCase(nome: string): string {
  const conectivos = new Set(["da", "de", "di", "do", "du", "das", "dos", "des", "e"]);
  return nome
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && conectivos.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

function periodoCurto(periodo: string | null): string {
  if (!periodo) return "";
  if (periodo.startsWith("MANHA")) return "Manhã";
  if (periodo.startsWith("TARDE")) return "Tarde";
  if (periodo.startsWith("NOITE")) return "Noite";
  if (periodo.startsWith("INTEGRAL")) return "Integral";
  return periodo;
}

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

export function BuscaGlobal({ turmas, onFechar, onAbrirTurma, onAbrirAluno, onNavegar, onAbrirConselho }: Props) {
  const [busca, setBusca] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = normalizar(busca.trim());
  const temQuery = q.length > 0;

  const turmasFiltradas = temQuery
    ? turmas.filter(
        (t) =>
          normalizar(t.codigo).includes(q) ||
          (t.serie && normalizar(t.serie).includes(q)) ||
          (t.periodo && normalizar(t.periodo).includes(q)),
      )
    : [];

  const primeiraTurma = turmasFiltradas[0] ?? null;

  const acoes: AcaoRapida[] = primeiraTurma
    ? [
        {
          id: "conselho",
          label: `Ir para Conselho de Classe — ${primeiraTurma.codigo}`,
          icone: <BookOpen size={16} />,
          acao: () => onAbrirConselho(primeiraTurma),
        },
      ]
    : [];

  const telasNavegacao = useMemo((): TelaNavegacao[] => [
    { id: "dashboard",                    label: "Dashboard",                        icone: <Home size={16} />,       palavras: ["inicio", "visao", "painel", "geral"] },
    { id: "turmas",                       label: "Turmas",                           icone: <Users size={16} />,      palavras: ["classes", "salas", "turma"] },
    { id: "conselhos",                    label: "Conselho de Classe",               icone: <BookOpen size={16} />,   palavras: ["conselho", "reuniao", "classe"] },
    { id: "kanban",                       label: "Quadro de Gestão",                 icone: <LayoutGrid size={16} />, palavras: ["kanban", "tarefas", "quadro", "gestao"] },
    { id: "calendario",                   label: "Calendário",                       icone: <Calendar size={16} />,   palavras: ["agenda", "datas", "eventos", "calendario"] },
    { id: "relatorios",                   label: "Relatórios",                       icone: <BarChart2 size={16} />,  palavras: ["relatorio", "relatorios"] },
    { id: "relatorio-criticos",           label: "Alunos Críticos",                  icone: <BarChart2 size={16} />,  palavras: ["relatorio", "criticos", "risco"] },
    { id: "relatorio-alteracoes-notas",   label: "Alterações de Notas",              icone: <BarChart2 size={16} />,  palavras: ["relatorio", "notas", "alteracoes", "historico"] },
    { id: "relatorio-atendimentos",       label: "Relatório de Atendimentos",        icone: <BarChart2 size={16} />,  palavras: ["relatorio", "atendimentos"] },
    { id: "pei",                          label: "PEI — Plano Educacional",          icone: <FileText size={16} />,   palavras: ["pei", "plano", "educacional", "individualizado"] },
    { id: "planejamento",                 label: "Plano de Ensino",                  icone: <FileText size={16} />,   palavras: ["planejamento", "plano", "ensino"] },
    { id: "configuracoes",                label: "Configurações",                    icone: <Settings size={16} />,   palavras: ["config", "configuracoes", "ajustes", "preferencias"] },
    { id: "importar-dados",               label: "Importar Dados",                   icone: <Upload size={16} />,     palavras: ["importar", "dados", "import"] },
    { id: "importar-notas",               label: "Importar Mapão",                   icone: <Upload size={16} />,     palavras: ["importar", "notas", "mapao", "mapas"] },
    { id: "importar-elegiveis",           label: "Importar Elegíveis",               icone: <Upload size={16} />,     palavras: ["importar", "elegiveis", "eligiveis"] },
    { id: "importar-diagnostico",         label: "Importar Diagnóstico",             icone: <Upload size={16} />,     palavras: ["importar", "diagnostico", "diagnosticos"] },
    { id: "importar-fotos",               label: "Importar Fotos",                   icone: <Upload size={16} />,     palavras: ["importar", "fotos", "foto", "imagens"] },
    { id: "importar-alunos-lote",         label: "Importar Alunos em Lote",          icone: <Upload size={16} />,     palavras: ["importar", "alunos", "lote", "batch"] },
  ], []);

  const telasFiltradas = temQuery
    ? telasNavegacao.filter((t) => {
        const texto = normalizar(t.label + " " + t.palavras.join(" "));
        return texto.includes(q);
      }).slice(0, 5)
    : [];

  const alunosResultado: AlunoResultado[] = q.length >= 2
    ? turmas
        .flatMap((t) =>
          t.nomes_alunos
            .filter((nome) => normalizar(nome).includes(q))
            .map((nome) => ({ nome, turma: t })),
        )
        .slice(0, 6)
    : [];

  const itens: Item[] = [
    ...turmasFiltradas.map((t): Item => ({ tipo: "turma", data: t })),
    ...(temQuery && acoes.length > 0 ? acoes.map((a): Item => ({ tipo: "acao", data: a })) : []),
    ...telasFiltradas.map((t): Item => ({ tipo: "tela", data: t })),
    ...alunosResultado.map((a): Item => ({ tipo: "aluno", data: a })),
  ];

  const turmaOffset = 0;
  const acaoOffset = turmasFiltradas.length;
  const telaOffset = acaoOffset + (temQuery && acoes.length > 0 ? acoes.length : 0);
  const alunoOffset = telaOffset + telasFiltradas.length;

  function globalIndex(tipo: "turma" | "acao" | "tela" | "aluno", localIdx: number): number {
    if (tipo === "turma") return turmaOffset + localIdx;
    if (tipo === "acao") return acaoOffset + localIdx;
    if (tipo === "tela") return telaOffset + localIdx;
    return alunoOffset + localIdx;
  }

  useEffect(() => {
    setCursor(0);
  }, [busca]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onFechar();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, itens.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter" && itens[cursor]) {
        e.preventDefault();
        activateItem(itens[cursor]);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [itens, cursor]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function activateItem(item: Item) {
    if (item.tipo === "turma") onAbrirTurma(item.data);
    else if (item.tipo === "acao") item.data.acao();
    else if (item.tipo === "tela") onNavegar(item.data.id);
    else onAbrirAluno(item.data.turma, item.data.nome);
  }

  const hasResults = itens.length > 0;

  return (
    <div className="global-search-backdrop" role="presentation" onClick={onFechar}>
      <div
        className="global-search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="global-search-input-row">
          <Search size={18} className="global-search-icon" />
          <input
            ref={inputRef}
            className="global-search-input"
            type="text"
            placeholder="Buscar turmas, alunos, relatórios, telas..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Busca global"
          />
          <kbd className="global-search-esc">ESC</kbd>
        </div>

        {hasResults ? (
          <div className="global-search-results" ref={listRef}>
            {turmasFiltradas.length > 0 && (
              <section className="global-search-section">
                <p className="global-search-group-label">Turmas</p>
                {turmasFiltradas.map((turma, i) => {
                  const idx = globalIndex("turma", i);
                  const ativo = cursor === idx;
                  const meta = [
                    turma.serie,
                    turma.periodo ? periodoCurto(turma.periodo) : null,
                    `${turma.alunos_ativos} alunos`,
                    turma.alunos_elegiveis ? `${turma.alunos_elegiveis} elegíveis` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <button
                      key={turma.caminho}
                      className={`global-search-item${ativo ? " active" : ""}`}
                      data-active={ativo}
                      onClick={() => onAbrirTurma(turma)}
                      onMouseEnter={() => setCursor(idx)}
                    >
                      <span className={`global-search-turma-icon${ativo ? " active" : ""}`}>
                        <Users size={16} />
                      </span>
                      <div className="global-search-item-content">
                        <strong>{turma.codigo}</strong>
                        {meta && <span className="global-search-item-meta">{meta}</span>}
                      </div>
                      {ativo && <CornerDownLeft size={14} className="global-search-enter-icon" />}
                    </button>
                  );
                })}
              </section>
            )}

            {temQuery && acoes.length > 0 && (
              <section className="global-search-section">
                <p className="global-search-group-label">Ações Rápidas</p>
                {acoes.map((acao, i) => {
                  const idx = globalIndex("acao", i);
                  const ativo = cursor === idx;
                  return (
                    <button
                      key={acao.id}
                      className={`global-search-item${ativo ? " active" : ""}`}
                      data-active={ativo}
                      onClick={acao.acao}
                      onMouseEnter={() => setCursor(idx)}
                    >
                      <span className={`global-search-acao-icon acao-${acao.id}`}>{acao.icone}</span>
                      <span>{acao.label}</span>
                      {ativo && <CornerDownLeft size={14} className="global-search-enter-icon" />}
                    </button>
                  );
                })}
              </section>
            )}

            {telasFiltradas.length > 0 && (
              <section className="global-search-section">
                <p className="global-search-group-label">Navegar para</p>
                {telasFiltradas.map((tela, i) => {
                  const idx = globalIndex("tela", i);
                  const ativo = cursor === idx;
                  return (
                    <button
                      key={tela.id}
                      className={`global-search-item${ativo ? " active" : ""}`}
                      data-active={ativo}
                      onClick={() => onNavegar(tela.id)}
                      onMouseEnter={() => setCursor(idx)}
                    >
                      <span className="global-search-tela-icon">{tela.icone}</span>
                      <span className="global-search-item-content">
                        <strong>{tela.label}</strong>
                      </span>
                      {ativo && <CornerDownLeft size={14} className="global-search-enter-icon" />}
                    </button>
                  );
                })}
              </section>
            )}

            {alunosResultado.length > 0 && (
              <section className="global-search-section">
                <p className="global-search-group-label">
                  Alunos ({alunosResultado.length} resultado{alunosResultado.length !== 1 ? "s" : ""})
                </p>
                {alunosResultado.map((aluno, i) => {
                  const idx = globalIndex("aluno", i);
                  const ativo = cursor === idx;
                  return (
                    <button
                      key={`${aluno.turma.caminho}-${aluno.nome}`}
                      className={`global-search-item${ativo ? " active" : ""}`}
                      data-active={ativo}
                      onClick={() => onAbrirAluno(aluno.turma, aluno.nome)}
                      onMouseEnter={() => setCursor(idx)}
                    >
                      <span className="global-search-aluno-avatar">{iniciais(aluno.nome)}</span>
                      <div className="global-search-item-content">
                        <strong>{toTitleCase(aluno.nome)}</strong>
                        <span className="global-search-item-meta">Turma {aluno.turma.codigo}</span>
                      </div>
                      {ativo && <CornerDownLeft size={14} className="global-search-enter-icon" />}
                    </button>
                  );
                })}
              </section>
            )}
          </div>
        ) : temQuery ? (
          <div className="global-search-empty">
            Nenhum resultado para <strong>"{busca}"</strong>
          </div>
        ) : (
          <div className="global-search-empty global-search-hint">
            Digite para buscar turmas, alunos, relatórios ou telas.
          </div>
        )}

        <div className="global-search-footer">
          <span><kbd>↑↓</kbd> navegar</span>
          <span><kbd>↵</kbd> selecionar</span>
          <span><kbd>ESC</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}
