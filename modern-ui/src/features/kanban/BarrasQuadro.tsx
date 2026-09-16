import { Archive, CheckSquare, Plus, Rows2, Rows3, Search, Trash2, X } from "lucide-react";
import { type KanbanColuna } from "../management";
import { type ExibicaoQuadro, type FiltrosQuadro } from "./quadro";

export function BarraFerramentas({
  filtros,
  onFiltros,
  nomePerfil,
  densidade,
  onDensidade,
  modoSelecao,
  onAlternarSelecao,
  onNovaTarefa,
}: {
  filtros: FiltrosQuadro;
  onFiltros: (filtros: FiltrosQuadro) => void;
  nomePerfil: string;
  densidade: ExibicaoQuadro["densidade"];
  onDensidade: (densidade: ExibicaoQuadro["densidade"]) => void;
  modoSelecao: boolean;
  onAlternarSelecao: () => void;
  onNovaTarefa: () => void;
}) {
  const alternar = (chave: "minhas" | "alta" | "semana") => onFiltros({ ...filtros, [chave]: !filtros[chave] });
  // "Minhas" depende do nome do perfil. Sem ele não há como saber o que é de
  // quem — melhor explicar do que filtrar para uma tela vazia.
  const semNome = !nomePerfil.trim();

  return (
    <div className="kb-ferramentas" role="toolbar" aria-label="Filtros e ações do quadro">
      <label className="kb-busca">
        <Search size={15} />
        <input
          value={filtros.busca}
          onChange={(event) => onFiltros({ ...filtros, busca: event.target.value })}
          placeholder="Buscar tarefa, etiqueta ou turma"
          aria-label="Buscar tarefa, etiqueta ou turma"
        />
        {filtros.busca && (
          <button type="button" onClick={() => onFiltros({ ...filtros, busca: "" })} aria-label="Limpar busca">
            <X size={13} />
          </button>
        )}
      </label>
      <button
        type="button"
        className={`kb-filtro ${filtros.minhas ? "ativo" : ""}`}
        aria-pressed={filtros.minhas}
        onClick={() => alternar("minhas")}
        disabled={semNome}
        title={semNome ? "Defina seu nome em Configurações → Perfil & Sincronização" : "Tarefas em que você é responsável"}
      >
        Minhas
      </button>
      <button type="button" className={`kb-filtro ${filtros.alta ? "ativo" : ""}`} aria-pressed={filtros.alta} onClick={() => alternar("alta")}>
        <i className="kb-ponto-prioridade alta" />
        Alta
      </button>
      <button
        type="button"
        className={`kb-filtro ${filtros.semana ? "ativo" : ""}`}
        aria-pressed={filtros.semana}
        onClick={() => alternar("semana")}
        title="Prazo até domingo, incluindo as atrasadas"
      >
        Vence esta semana
      </button>

      <span className="kb-espaco" />

      <div className="kb-densidade" role="radiogroup" aria-label="Densidade dos cartões">
        <button type="button" role="radio" aria-checked={densidade === "compacto"} className={densidade === "compacto" ? "ativo" : ""} onClick={() => onDensidade("compacto")}>
          <Rows3 size={14} />
          Compacto
        </button>
        <button type="button" role="radio" aria-checked={densidade === "confortavel"} className={densidade === "confortavel" ? "ativo" : ""} onClick={() => onDensidade("confortavel")}>
          <Rows2 size={14} />
          Confortável
        </button>
      </div>
      <button type="button" className={`kb-botao ${modoSelecao ? "ativo" : ""}`} aria-pressed={modoSelecao} onClick={onAlternarSelecao}>
        <CheckSquare size={15} />
        Selecionar
      </button>
      <button type="button" className="kb-primario kb-nova-tarefa" onClick={onNovaTarefa}>
        <Plus size={16} />
        Nova tarefa
      </button>
    </div>
  );
}

export function BarraSelecao({
  quantidade,
  colunas,
  onMover,
  onArquivar,
  onExcluir,
  onSair,
}: {
  quantidade: number;
  colunas: KanbanColuna[];
  onMover: (coluna: string) => void;
  onArquivar: () => void;
  onExcluir: () => void;
  onSair: () => void;
}) {
  const nenhuma = quantidade === 0;
  return (
    <div className="kb-barra-selecao" role="region" aria-label="Ações em lote">
      <strong>
        {nenhuma ? "Nenhuma tarefa selecionada" : quantidade === 1 ? "1 tarefa selecionada" : `${quantidade} tarefas selecionadas`}
      </strong>
      <span className="kb-barra-divisor" />
      <label className="kb-barra-mover">
        Mover para
        <select
          value=""
          disabled={nenhuma}
          onChange={(event) => {
            if (event.target.value) onMover(event.target.value);
          }}
        >
          <option value="">coluna…</option>
          {colunas.map((coluna) => (
            <option key={coluna.id} value={coluna.id}>
              {coluna.titulo}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onArquivar} disabled={nenhuma}>
        <Archive size={14} />
        Arquivar
      </button>
      <button type="button" className="destrutivo" onClick={onExcluir} disabled={nenhuma}>
        <Trash2 size={14} />
        Excluir
      </button>
      <span className="kb-barra-divisor" />
      <button type="button" className="kb-barra-sair" onClick={onSair}>
        Sair do modo seleção
      </button>
    </div>
  );
}

export function AvisoDesfazer({ texto, acimaDaBarra, onDesfazer }: { texto: string; acimaDaBarra: boolean; onDesfazer: () => void }) {
  return (
    <div className={`kb-aviso ${acimaDaBarra ? "acima" : ""}`} role="status" aria-live="polite">
      <span>{texto}</span>
      <button type="button" onClick={onDesfazer}>
        Desfazer
      </button>
    </div>
  );
}
