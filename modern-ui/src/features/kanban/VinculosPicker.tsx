import { useState } from "react";
import { normalizarTextoGestao, separarVinculos } from "../management";

// Campo de lista com sugestões (responsáveis, vínculos). "@" busca no grupo de
// trabalho. Usado pelo formulário de tarefa e pelo Calendário.
export function VinculosPicker({
  valor,
  sugestoes,
  onChange,
  placeholder = "Filtrar...",
}: {
  valor: string;
  sugestoes: string[];
  onChange: (novoValor: string) => void;
  placeholder?: string;
}) {
  const [filtro, setFiltro] = useState("");
  const [aberto, setAberto] = useState(false);
  const selecionados = separarVinculos(valor);
  // "@" só dispara a busca no grupo de trabalho — descartamos o prefixo antes
  // de comparar. "@" sozinho lista todo mundo.
  const termoBusca = filtro.startsWith("@") ? filtro.slice(1).trim() : filtro.trim();
  const opcoesFiltradas = sugestoes
    .filter((s) => !selecionados.some((sel) => normalizarTextoGestao(sel) === normalizarTextoGestao(s)))
    .filter((s) => !termoBusca || normalizarTextoGestao(s).includes(normalizarTextoGestao(termoBusca)));

  function adicionar(item: string) {
    const limpo = item.trim().replace(/^@/, "").trim();
    if (!limpo || selecionados.some((sel) => normalizarTextoGestao(sel) === normalizarTextoGestao(limpo))) {
      setFiltro("");
      return;
    }
    onChange([...selecionados, limpo].join(", "));
    setFiltro("");
  }

  function remover(item: string) {
    const chave = normalizarTextoGestao(item);
    onChange(selecionados.filter((s) => normalizarTextoGestao(s) !== chave).join(", "));
  }

  return (
    <div className="vinculos-picker">
      <input
        type="text"
        value={filtro}
        onChange={(e) => { setFiltro(e.target.value); setAberto(true); }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && termoBusca) {
            e.preventDefault();
            adicionar(opcoesFiltradas[0] ?? termoBusca);
          }
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder={placeholder}
      />
      {aberto && (opcoesFiltradas.length > 0 || filtro.startsWith("@")) && (
        <div className="vinculos-picker-dropdown">
          {opcoesFiltradas.map((item) => (
            <button type="button" key={item} onMouseDown={(e) => { e.preventDefault(); adicionar(item); }}>
              {item}
            </button>
          ))}
          {termoBusca && !opcoesFiltradas.some((o) => normalizarTextoGestao(o) === normalizarTextoGestao(termoBusca)) && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); adicionar(termoBusca); }}>
              + adicionar "{termoBusca}"
            </button>
          )}
        </div>
      )}
      {selecionados.length > 0 && (
        <div className="vinculos-picker-tags">
          {selecionados.map((item) => (
            <span key={item} className="vinculos-picker-tag">
              {item}
              <button type="button" onClick={() => remover(item)} aria-label={`Remover ${item}`}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
