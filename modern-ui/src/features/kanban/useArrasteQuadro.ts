import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type KanbanStatus } from "../management";

// Arraste de cartões por eventos de ponteiro, iniciado só pelo punho.
//
// Por que não drag-and-drop HTML5, como o handoff descreve: o Tauri está com
// o arrastar-e-soltar nativo ligado (padrão), e no Windows isso impede o DnD
// HTML5 dentro da página. Desligá-lo faria arquivos soltos do sistema
// chegarem como File do navegador, sem caminho — o anexo teria de ser
// embutido em base64 no localStorage, o mesmo inchaço do estado_ui.json que
// já travou o app. O feedback visual da seção 6 é reproduzido aqui.

export type AlvoArraste = {
  coluna: KanbanStatus;
  // Cartão antes do qual a tarefa entra; nulo = fim da coluna.
  antesDe: string | null;
};

export type EstadoArraste = {
  id: string;
  x: number;
  y: number;
  // Distância do ponto agarrado ao canto do cartão: a prévia acompanha o
  // cursor sem "pular" para o centro.
  deslocX: number;
  deslocY: number;
  largura: number;
  altura: number;
};

const LIMIAR_PX = 4;

function alvoNoPonto(x: number, y: number, idArrastado: string): AlvoArraste | null {
  const elemento = document.elementFromPoint(x, y);
  const coluna = elemento?.closest<HTMLElement>("[data-kanban-column]");
  const idColuna = coluna?.dataset.kanbanColumn;
  if (!idColuna) return null;
  const cartao = elemento?.closest<HTMLElement>("[data-kanban-card]");
  const idCartao = cartao?.dataset.kanbanCard ?? null;
  // Sobre o próprio cartão: soltar ali não muda nada, e não há indicador.
  if (idCartao === idArrastado) return { coluna: idColuna, antesDe: idArrastado };
  return { coluna: idColuna, antesDe: idCartao };
}

export function useArrasteQuadro(onSoltar: (id: string, alvo: AlvoArraste) => void) {
  const [arraste, setArraste] = useState<EstadoArraste | null>(null);
  const [alvo, setAlvo] = useState<AlvoArraste | null>(null);
  const inicio = useRef<{ id: string; x: number; y: number; rect: DOMRect; iniciado: boolean } | null>(null);
  const alvoAtual = useRef<AlvoArraste | null>(null);
  const soltar = useRef(onSoltar);
  soltar.current = onSoltar;

  function encerrar() {
    inicio.current = null;
    alvoAtual.current = null;
    setArraste(null);
    setAlvo(null);
  }

  // Esc cancela um arraste em andamento.
  useEffect(() => {
    if (!arraste) return;
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === "Escape") encerrar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [arraste]);

  function propsDoPunho(id: string) {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const cartao = event.currentTarget.closest<HTMLElement>("[data-kanban-card]");
        if (!cartao) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        inicio.current = { id, x: event.clientX, y: event.clientY, rect: cartao.getBoundingClientRect(), iniciado: false };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const atual = inicio.current;
        if (!atual) return;
        if (!atual.iniciado) {
          if (Math.hypot(event.clientX - atual.x, event.clientY - atual.y) < LIMIAR_PX) return;
          atual.iniciado = true;
        }
        setArraste({
          id: atual.id,
          x: event.clientX,
          y: event.clientY,
          deslocX: atual.x - atual.rect.left,
          deslocY: atual.y - atual.rect.top,
          largura: atual.rect.width,
          altura: atual.rect.height,
        });
        const novo = alvoNoPonto(event.clientX, event.clientY, atual.id);
        alvoAtual.current = novo;
        setAlvo(novo);
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        const atual = inicio.current;
        const destino = alvoAtual.current;
        encerrar();
        if (atual?.iniciado && destino) soltar.current(atual.id, destino);
      },
      onPointerCancel() {
        encerrar();
      },
    };
  }

  return { arraste, alvo, propsDoPunho };
}
