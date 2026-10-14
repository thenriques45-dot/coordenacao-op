import type { TipoParametro } from "./tipos";

// Espelha executor.rs::OpcoesParametro — o que listar_opcoes_parametros_relatorio
// devolve para cada parâmetro de texto.
export type OpcoesParametro = {
  valores: string[];
  // "Todos" manda o parâmetro vazio, e o filtro que o usa deixa de valer.
  permite_todos: boolean;
};

/** Campo de um parâmetro de relatório: lista suspensa com os valores que
 * existem nos dados (ou as escolhas fixas do relatório) quando houver,
 * senão o campo de texto/número livre de sempre. */
export function CampoParametro({
  tipo,
  valor,
  opcoes,
  onMudar,
  placeholder,
}: {
  tipo: TipoParametro;
  valor: string;
  opcoes?: OpcoesParametro;
  onMudar: (valor: string) => void;
  placeholder?: string;
}) {
  if (tipo === "texto" && opcoes && opcoes.valores.length > 0) {
    // Valor salvo que não aparece mais nos dados (ex.: digitado antes, ou
    // de outro ano) continua visível em vez de sumir sem aviso.
    const valorFora = valor.trim() !== "" && !opcoes.valores.includes(valor);
    const semEscolha = valor.trim() === "" && !opcoes.permite_todos;
    return (
      <select value={valor} onChange={(event) => onMudar(event.target.value)}>
        {opcoes.permite_todos && <option value="">Todos</option>}
        {semEscolha && <option value="">Escolha...</option>}
        {valorFora && <option value={valor}>{valor} (não encontrado nos dados)</option>}
        {opcoes.valores.map((opcao) => (
          <option key={opcao} value={opcao}>{opcao}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={tipo === "numero" ? "number" : "text"}
      placeholder={placeholder}
      value={valor}
      onChange={(event) => onMudar(event.target.value)}
    />
  );
}
