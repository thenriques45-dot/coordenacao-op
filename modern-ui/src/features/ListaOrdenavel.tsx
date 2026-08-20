// Lista com arrastar-e-soltar genérica, usada em todo lugar do construtor
// visual que precisa reordenar itens: colunas, condições de filtro,
// critérios de ordenação, e os filhos de um bloco E/OU/Função dentro do
// editor de expressão. Construída uma vez em cima do @dnd-kit pra não
// reimplementar a mecânica de arrastar em cada tela.

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

function ItemArrastavel({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="lista-ordenavel-item">
      <button type="button" className="lista-ordenavel-alca" aria-label="Arrastar para reordenar" {...attributes} {...listeners}>
        ⠿
      </button>
      <div className="lista-ordenavel-conteudo">{children}</div>
    </div>
  );
}

export function ListaOrdenavel<T>({
  itens,
  chave,
  onReordenar,
  renderItem,
  vazio,
}: {
  itens: T[];
  chave: (item: T) => string;
  onReordenar: (novaOrdem: T[]) => void;
  renderItem: (item: T, indice: number) => ReactNode;
  vazio?: ReactNode;
}) {
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = itens.map(chave);

  function aoTerminarArrasto(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;
    const indiceAntigo = ids.indexOf(String(active.id));
    const indiceNovo = ids.indexOf(String(over.id));
    if (indiceAntigo === -1 || indiceNovo === -1) return;
    onReordenar(arrayMove(itens, indiceAntigo, indiceNovo));
  }

  if (itens.length === 0 && vazio) {
    return <>{vazio}</>;
  }

  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoTerminarArrasto}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="lista-ordenavel">
          {itens.map((item, indice) => (
            <ItemArrastavel key={chave(item)} id={chave(item)}>
              {renderItem(item, indice)}
            </ItemArrastavel>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
