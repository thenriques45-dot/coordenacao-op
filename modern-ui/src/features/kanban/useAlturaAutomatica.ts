import { useLayoutEffect, useRef } from "react";

// A caixa de descrição cresce com o texto até o teto definido no CSS
// (max-height), quando então rola. Sem isso, uma caixa de altura fixa obriga a
// ler um texto de dez linhas por uma fresta de duas.
export function useAlturaAutomatica(texto: string) {
  const referencia = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const campo = referencia.current;
    if (!campo) return;
    // Zerar antes de medir: sem isso o scrollHeight nunca diminui e a caixa
    // não encolhe ao apagar linhas.
    campo.style.height = "auto";
    // Com box-sizing: border-box, a altura inclui a borda e o scrollHeight
    // não: somá-la evita uma barra de rolagem por 1px.
    const borda = campo.offsetHeight - campo.clientHeight;
    campo.style.height = `${campo.scrollHeight + borda}px`;
  }, [texto]);

  return referencia;
}
