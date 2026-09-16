import { Archive, Check, CheckCircle2, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type KanbanColuna, type OrdenacaoColuna } from "../management";
import { CORES_COLUNA, estiloCorColuna } from "./quadro";
import { useFecharFora, usePosicaoMenu } from "./useFecharFora";

const ORDENACOES: { id: OrdenacaoColuna; rotulo: string }[] = [
  { id: "manual", rotulo: "Manual (arrastar)" },
  { id: "prazo", rotulo: "Prazo mais próximo" },
  { id: "prioridade", rotulo: "Prioridade" },
];

export function ColunaQuadro({
  coluna,
  quantidade,
  ocultasPorFiltro,
  quantidadeArquivadas,
  concluintesArquivaveis,
  ehConclusao,
  unicaConclusao,
  podeExcluir,
  iniciarRenomeando,
  sobArraste,
  menuAberto,
  criacaoInline,
  children,
  onAlternarMenu,
  onFecharMenu,
  onAlternarRecolhida,
  onAdicionar,
  onOrdenar,
  onRenomear,
  onCor,
  onArquivarConcluidas,
  onRestaurarArquivadas,
  onAlternarConclusao,
  onExcluir,
  onFimRenomear,
}: {
  coluna: KanbanColuna;
  quantidade: number;
  // Tarefas da coluna escondidas pelos filtros da barra.
  ocultasPorFiltro: number;
  quantidadeArquivadas: number;
  concluintesArquivaveis: number;
  ehConclusao: boolean;
  // Única coluna de conclusão do quadro: excluí-la faz as tarefas concluídas
  // voltarem a contar como pendentes (ver o aviso no item de excluir).
  unicaConclusao: boolean;
  // Falso na última coluna restante (seção 5).
  podeExcluir: boolean;
  // Coluna recém-criada entra com o nome em edição (seção 5).
  iniciarRenomeando: boolean;
  sobArraste: boolean;
  menuAberto: boolean;
  criacaoInline: ReactNode;
  children: ReactNode;
  onAlternarMenu: () => void;
  onFecharMenu: () => void;
  onAlternarRecolhida: () => void;
  onAdicionar: () => void;
  onOrdenar: (ordenacao: OrdenacaoColuna) => void;
  onRenomear: (titulo: string) => void;
  onCor: (cor: string) => void;
  onArquivarConcluidas: () => void;
  onRestaurarArquivadas: () => void;
  onAlternarConclusao: () => void;
  onExcluir: () => void;
  onFimRenomear: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [renomeando, setRenomeando] = useState(iniciarRenomeando);
  const campoNome = useRef<HTMLInputElement>(null);
  // Foca e SELECIONA o nome ao entrar em edição. Com autoFocus + select no
  // onFocus, o texto não vinha selecionado na coluna recém-criada, e quem
  // digitasse direto ficava com "Nova colunaAguardando família".
  // Evita salvar duas vezes: Enter encerra e o blur que vem em seguida também.
  const renomeioEncerrado = useRef(false);
  useEffect(() => {
    if (!renomeando) return;
    renomeioEncerrado.current = false;
    campoNome.current?.focus();
    campoNome.current?.select();
  }, [renomeando]);

  // Enter e Esc encerram DIRETAMENTE, sem passar pelo blur: antes eles só
  // chamavam blur(), que não faz nada se o campo não estiver com o foco — e o
  // nome digitado ficava preso em edição, sem salvar.
  function encerrarRenomeio(salvar: boolean) {
    if (renomeioEncerrado.current) return;
    renomeioEncerrado.current = true;
    const titulo = campoNome.current?.value.trim() ?? "";
    // Salva ao sair do campo (seção 5). Nome vazio mantém o anterior.
    if (salvar && titulo && titulo !== coluna.titulo) onRenomear(titulo);
    setRenomeando(false);
    onFimRenomear();
  }
  useFecharFora(menu, menuAberto, onFecharMenu);
  const estiloMenu = usePosicaoMenu(menu, menuAberto, onFecharMenu);
  const ordenacao = coluna.ordenacao ?? "manual";
  const estiloArraste = estiloCorColuna(coluna.cor);

  if (coluna.recolhida) {
    return (
      <article
        data-kanban-column={coluna.id}
        className={`kb-coluna recolhida ${sobArraste ? "sob-arraste" : ""}`}
        style={estiloArraste}
      >
        <button type="button" className="kb-coluna-faixa" onClick={onAlternarRecolhida} aria-label={`Expandir ${coluna.titulo}`}>
          <ChevronRight size={15} />
          <i className="kb-cor-coluna" />
          <span className="kb-coluna-faixa-nome">{coluna.titulo}</span>
          <strong>{quantidade}</strong>
        </button>
      </article>
    );
  }

  // "Nenhuma tarefa aqui" só quando a coluna está vazia de verdade — se os
  // filtros esconderam tudo, dizer isso levaria a criar uma duplicata.
  const vazia = quantidade === 0 && ocultasPorFiltro === 0 && !criacaoInline;

  return (
    <article data-kanban-column={coluna.id} className={`kb-coluna ${sobArraste ? "sob-arraste" : ""}`} style={estiloArraste}>
      <header className="kb-coluna-cabecalho">
        <button type="button" className="kb-icone" onClick={onAlternarRecolhida} aria-label={`Colapsar ${coluna.titulo}`} title="Colapsar coluna">
          <ChevronDown size={15} />
        </button>
        <i className="kb-coluna-ponto kb-cor-coluna" />
        {renomeando ? (
          <input
            ref={campoNome}
            className="kb-coluna-nome-campo"
            defaultValue={coluna.titulo}
            aria-label="Nome da coluna"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                encerrarRenomeio(true);
              }
              if (event.key === "Escape") {
                // preventDefault também impede o Esc de sair do modo seleção.
                event.preventDefault();
                encerrarRenomeio(false);
              }
            }}
            onBlur={() => encerrarRenomeio(true)}
          />
        ) : (
          <h2 className="kb-coluna-nome" onDoubleClick={() => setRenomeando(true)} title="Dois cliques para renomear">
            {coluna.titulo}
          </h2>
        )}
        <span className="kb-contagem">{quantidade}</span>
        <span className="kb-espaco" />
        <button type="button" className="kb-icone" onClick={onAdicionar} aria-label={`Adicionar tarefa em ${coluna.titulo}`}>
          <Plus size={15} />
        </button>
        <div className="kb-menu-ancora" ref={menu}>
          <button type="button" className="kb-icone" onClick={onAlternarMenu} aria-label={`Opções de ${coluna.titulo}`} aria-expanded={menuAberto}>
            <MoreHorizontal size={15} />
          </button>
          {menuAberto && (
            <div className="kb-menu kb-menu-coluna" style={estiloMenu} role="menu">
              <span className="kb-menu-rotulo">Ordenar</span>
              {ORDENACOES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={ordenacao === item.id}
                  onClick={() => {
                    onOrdenar(item.id);
                    onFecharMenu();
                  }}
                >
                  <span className="kb-menu-marca">{ordenacao === item.id && <Check size={13} />}</span>
                  {item.rotulo}
                </button>
              ))}
              <hr />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onFecharMenu();
                  setRenomeando(true);
                }}
              >
                <span className="kb-menu-marca">
                  <Pencil size={13} />
                </span>
                Renomear coluna
              </button>
              <div className="kb-menu-cores">
                <span className="kb-menu-marca" />
                <span>Cor</span>
                {CORES_COLUNA.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    className={`kb-cor-coluna ${coluna.cor === cor ? "atual" : ""}`}
                    style={estiloCorColuna(cor)}
                    aria-label={`Cor ${cor}`}
                    aria-pressed={coluna.cor === cor}
                    onClick={() => onCor(cor)}
                  />
                ))}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onFecharMenu();
                  onAlternarRecolhida();
                }}
              >
                <span className="kb-menu-marca">
                  <ChevronRight size={13} />
                </span>
                Colapsar coluna
              </button>
              {/* A flag conclui é o que risca o título, silencia alertas e habilita
                  "Arquivar concluídas". Sem este item, excluir ou recriar a
                  coluna de conclusão não teria volta (seção 5). */}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={ehConclusao}
                title="Tarefas nesta coluna contam como concluídas"
                onClick={() => {
                  onFecharMenu();
                  onAlternarConclusao();
                }}
              >
                <span className="kb-menu-marca">{ehConclusao ? <Check size={13} /> : <CheckCircle2 size={13} />}</span>
                Coluna de conclusão
              </button>
              {ehConclusao && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={concluintesArquivaveis === 0}
                  onClick={() => {
                    onFecharMenu();
                    onArquivarConcluidas();
                  }}
                >
                  <span className="kb-menu-marca">
                    <Archive size={13} />
                  </span>
                  Arquivar concluídas ({concluintesArquivaveis})
                </button>
              )}
              <hr />
              <button
                type="button"
                role="menuitem"
                className="destrutivo kb-menu-duas-linhas"
                disabled={!podeExcluir}
                title={podeExcluir ? undefined : "A última coluna não pode ser excluída"}
                onClick={() => {
                  onFecharMenu();
                  onExcluir();
                }}
              >
                <span className="kb-menu-marca">
                  <Trash2 size={13} />
                </span>
                <span>
                  {concluintesArquivaveis > 0
                    ? `Excluir coluna e mover ${concluintesArquivaveis} ${concluintesArquivaveis === 1 ? "tarefa" : "tarefas"}`
                    : "Excluir coluna"}
                  {unicaConclusao && concluintesArquivaveis > 0 && (
                    <small>as tarefas daqui deixam de contar como concluídas</small>
                  )}
                </span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="kb-coluna-corpo">
        {criacaoInline}
        {children}
        {ocultasPorFiltro > 0 && (
          <span className="kb-ocultas">
            {ocultasPorFiltro === 1 ? "1 tarefa oculta pelos filtros" : `${ocultasPorFiltro} tarefas ocultas pelos filtros`}
          </span>
        )}
        {vazia && (
          <button type="button" className="kb-coluna-vazia" onClick={onAdicionar}>
            Nenhuma tarefa aqui · adicionar
          </button>
        )}
        {quantidadeArquivadas > 0 && (
          <button type="button" className="kb-faixa-arquivadas" onClick={onRestaurarArquivadas}>
            <span>
              {quantidadeArquivadas === 1 ? "1 tarefa arquivada" : `${quantidadeArquivadas} tarefas arquivadas`}
            </span>
            <span className="kb-link-texto">restaurar</span>
          </button>
        )}
      </div>
    </article>
  );
}

// Campo de título no topo da coluna, aberto pelo "+" do cabeçalho. Enter
// cria e deixa o campo pronto para a próxima; "Detalhes" leva o título já
// digitado para o painel completo.
export function CriacaoInline({
  titulo,
  onChange,
  onCriar,
  onCancelar,
  onDetalhes,
}: {
  titulo: string;
  onChange: (titulo: string) => void;
  onCriar: () => void;
  onCancelar: () => void;
  onDetalhes: () => void;
}) {
  return (
    <div className="kb-criacao-inline">
      <input
        value={titulo}
        placeholder="Título da tarefa"
        aria-label="Título da nova tarefa"
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCriar();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancelar();
          }
        }}
      />
      <div className="kb-criacao-inline-acoes">
        <button type="button" className="kb-link" onClick={onDetalhes}>
          Detalhes
        </button>
        <span>
          <button type="button" className="kb-secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className="kb-primario" onClick={onCriar} disabled={!titulo.trim()}>
            Adicionar
          </button>
        </span>
      </div>
    </div>
  );
}
