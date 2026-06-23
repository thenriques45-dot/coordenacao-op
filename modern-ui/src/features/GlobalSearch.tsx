import { BookOpen, CornerDownLeft, Plus, Search, Upload, Users } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

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

type AcaoId = "conselho" | "importar" | "kanban";

type AcaoRapida = {
  id: AcaoId;
  label: string;
  icone: ReactNode;
  acao: () => void;
};

type Item =
  | { tipo: "turma"; data: TurmaResumo }
  | { tipo: "acao"; data: AcaoRapida }
  | { tipo: "aluno"; data: AlunoResultado };

type Props = {
  turmas: TurmaResumo[];
  onFechar: () => void;
  onAbrirTurma: (turma: TurmaResumo) => void;
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

export function BuscaGlobal({ turmas, onFechar, onAbrirTurma, onNavegar, onAbrirConselho }: Props) {
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

  const acoes: AcaoRapida[] = [
    ...(primeiraTurma
      ? [
          {
            id: "conselho" as AcaoId,
            label: `Ir para Conselho de Classe — ${primeiraTurma.codigo}`,
            icone: <BookOpen size={16} />,
            acao: () => onAbrirConselho(primeiraTurma),
          },
        ]
      : []),
    {
      id: "importar" as AcaoId,
      label: "Importar Mapão",
      icone: <Upload size={16} />,
      acao: () => onNavegar("importar-notas"),
    },
    {
      id: "kanban" as AcaoId,
      label: "Criar Tarefa no Kanban",
      icone: <Plus size={16} />,
      acao: () => onNavegar("kanban"),
    },
  ];

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
    ...(temQuery ? acoes.map((a): Item => ({ tipo: "acao", data: a })) : []),
    ...alunosResultado.map((a): Item => ({ tipo: "aluno", data: a })),
  ];

  const turmaOffset = 0;
  const acaoOffset = turmasFiltradas.length;
  const alunoOffset = acaoOffset + (temQuery ? acoes.length : 0);

  function globalIndex(tipo: "turma" | "acao" | "aluno", localIdx: number): number {
    if (tipo === "turma") return turmaOffset + localIdx;
    if (tipo === "acao") return acaoOffset + localIdx;
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
    else onAbrirTurma(item.data.turma);
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
            placeholder="Buscar turmas, alunos, ações..."
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
                      onClick={() => onAbrirTurma(aluno.turma)}
                      onMouseEnter={() => setCursor(idx)}
                    >
                      <span className="global-search-aluno-avatar">{iniciais(aluno.nome)}</span>
                      <div className="global-search-item-content">
                        <strong>{toTitleCase(aluno.nome)}</strong>
                        <span className="global-search-item-meta">Turma {aluno.turma.codigo}</span>
                      </div>
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
            Digite para buscar turmas, alunos ou use ações como Importar Mapão.
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
