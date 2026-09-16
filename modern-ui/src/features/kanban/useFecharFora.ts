import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useState } from "react";

// Fecha um menu/popover ao clicar fora dele ou apertar Esc. Os menus do
// quadro antes só fechavam clicando de novo no botão que os abriu.
export function useFecharFora(ref: RefObject<HTMLElement | null>, aberto: boolean, fechar: () => void) {
  useEffect(() => {
    if (!aberto) return;
    function aoPressionar(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) fechar();
    }
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        fechar();
      }
    }
    document.addEventListener("mousedown", aoPressionar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoPressionar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [ref, aberto, fechar]);
}

const MARGEM = 8;
const AFASTAMENTO = 4;

// Posiciona o menu com position: fixed, alinhado à direita do botão que o
// abriu, e abre para cima quando não cabe abaixo na janela.
//
// Por que fixed: o quadro rola na horizontal (overflow-x: auto), e isso obriga
// o navegador a cortar também na vertical. Um menu absoluto dentro dele ficava
// cortado — no último cartão da coluna mais alta e, com os itens de coluna
// configurável, até no menu de uma coluna no topo de um quadro curto, onde
// nem abrir para cima resolvia. Fixed escapa desse corte.
//
// Medido antes da pintura (useLayoutEffect), então o menu nunca aparece no
// lugar errado. Como fixed não acompanha a rolagem, o menu fecha quando a
// página ou o quadro rolam.
export function usePosicaoMenu(ancora: RefObject<HTMLElement | null>, aberto: boolean, fechar: () => void): CSSProperties | undefined {
  const [estilo, setEstilo] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!aberto) {
      setEstilo(undefined);
      return;
    }
    const elemento = ancora.current;
    const menu = elemento?.querySelector<HTMLElement>(".kb-menu");
    if (!elemento || !menu) return;
    const botao = elemento.getBoundingClientRect();
    const largura = menu.offsetWidth;
    const altura = menu.offsetHeight;
    const cabeAbaixo = botao.bottom + AFASTAMENTO + altura <= window.innerHeight - MARGEM;
    const cabeAcima = botao.top - AFASTAMENTO - altura >= MARGEM;
    const top = cabeAbaixo || !cabeAcima ? botao.bottom + AFASTAMENTO : botao.top - AFASTAMENTO - altura;
    const left = Math.min(Math.max(MARGEM, botao.right - largura), window.innerWidth - largura - MARGEM);
    setEstilo({ position: "fixed", top, left, right: "auto", bottom: "auto" });
  }, [ancora, aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoRolar(event: Event) {
      // Rolagem dentro do próprio menu não fecha.
      if (ancora.current && event.target instanceof Node && ancora.current.contains(event.target)) return;
      fechar();
    }
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [ancora, aberto, fechar]);

  return estilo;
}
