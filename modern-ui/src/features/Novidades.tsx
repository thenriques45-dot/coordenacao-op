import {
  CalendarClock,
  ChevronRight,
  FileText,
  Filter,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  MessagesSquare,
  Search,
  Send,
  Settings2,
  Sparkles,
  UserSquare,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

// "O que há de novidade" paginado — uma novidade por página, no formato dos
// tutoriais de tela (área + título + texto + destaques), com atalho opcional
// para abrir a função. Versões antigas (quase só correções) entram como uma
// página única de "Outras mudanças".

const ICONES = {
  novidade: Sparkles,
  conversa: MessagesSquare,
  mensagem: MessageCircle,
  grade: LayoutGrid,
  agenda: CalendarClock,
  lista: ListChecks,
  aluno: UserSquare,
  envio: Send,
  config: Settings2,
  busca: Search,
  equipe: Users,
  documento: FileText,
  filtro: Filter,
} satisfies Record<string, LucideIcon>;

export type ChaveIcone = keyof typeof ICONES;

export type DestaqueNovidade = {
  icone: ChaveIcone;
  titulo: string;
  texto: string;
};

export type PaginaNovidade = {
  area: string;
  titulo: string;
  corpo: string;
  destaques?: DestaqueNovidade[];
  irPara?: { rotulo: string; tela: string };
};

export type NovidadesVersao = {
  paginas: PaginaNovidade[];
  outrasMudancas?: string[];
};

// Aceita o formato rico ou a lista de strings das versões antigas.
export type EntradaNovidades = NovidadesVersao | string[];

export function normalizarNovidades(entrada: EntradaNovidades | undefined | null): NovidadesVersao | null {
  if (!entrada) return null;
  if (Array.isArray(entrada)) {
    return entrada.length ? { paginas: [], outrasMudancas: entrada } : null;
  }
  const paginas = entrada.paginas ?? [];
  const outras = entrada.outrasMudancas?.length ? entrada.outrasMudancas : undefined;
  return paginas.length || outras ? { paginas, outrasMudancas: outras } : null;
}

export function NovidadesWizard({
  versao,
  dados,
  onFechar,
  onNavegar,
}: {
  versao: string | null;
  dados: NovidadesVersao;
  onFechar: () => void;
  onNavegar?: (tela: string) => void;
}) {
  const temOutras = Boolean(dados.outrasMudancas?.length);
  const total = dados.paginas.length + (temOutras ? 1 : 0);
  const [passo, setPasso] = useState(0);

  const indice = Math.min(passo, Math.max(total - 1, 0));
  const ultimo = indice >= total - 1;
  const pagina = indice < dados.paginas.length ? dados.paginas[indice] : null;

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") onFechar();
      else if (evento.key === "ArrowRight" && indice < total - 1) setPasso(indice + 1);
      else if (evento.key === "ArrowLeft" && indice > 0) setPasso(indice - 1);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [indice, total, onFechar]);

  if (total === 0) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onFechar();
      }}
    >
      <section
        className="sync-wizard novidades-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="novidades-titulo"
      >
        <header className="novidades-wizard-topo">
          <span className="novidades-wizard-versao">
            O que há de novidade{versao ? ` · v${versao}` : ""}
          </span>
          <button
            type="button"
            className="novidades-wizard-fechar"
            onClick={onFechar}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="sync-wizard-progress" aria-label={`Novidade ${indice + 1} de ${total}`}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={i <= indice ? "active" : ""} />
          ))}
        </div>

        {pagina ? (
          <>
            <span className="eyebrow">{pagina.area}</span>
            <h2 id="novidades-titulo">{pagina.titulo}</h2>
            <p>{pagina.corpo}</p>
            {pagina.destaques?.length ? (
              <div className="sync-wizard-grid">
                {pagina.destaques.map((destaque) => {
                  const Icone = ICONES[destaque.icone] ?? Sparkles;
                  return (
                    <article key={destaque.titulo}>
                      <Icone size={20} />
                      <strong>{destaque.titulo}</strong>
                      <span>{destaque.texto}</span>
                    </article>
                  );
                })}
              </div>
            ) : null}
            {pagina.irPara && onNavegar ? (
              <button
                type="button"
                className="novidades-wizard-atalho"
                onClick={() => onNavegar(pagina.irPara!.tela)}
              >
                {pagina.irPara.rotulo}
                <ChevronRight size={16} />
              </button>
            ) : null}
          </>
        ) : (
          <>
            <span className="eyebrow">Nesta versão</span>
            <h2 id="novidades-titulo">Outras mudanças</h2>
            <ul className="novidades-wizard-lista">
              {dados.outrasMudancas!.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}

        <div className="modal-actions">
          {!ultimo && (
            <button type="button" onClick={onFechar}>
              Pular
            </button>
          )}
          {indice > 0 && (
            <button type="button" onClick={() => setPasso(indice - 1)}>
              Voltar
            </button>
          )}
          {ultimo ? (
            <button type="button" className="primary-action" onClick={onFechar}>
              Começar a usar
            </button>
          ) : (
            <button type="button" className="primary-action" onClick={() => setPasso(indice + 1)}>
              Próximo
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
