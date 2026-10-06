// Ganchos compartilhados pelo painel de estatísticas da turma, pelo relatório
// imprimível e pela aba de diagnóstico do aluno.

import { useEffect, useState } from "react";
import { invokeApp, tauriDisponivel } from "../appBridge";
import { EXTRAS_VAZIOS, type IndicadoresExtras } from "./calculos";

/** Prova Paulista, tarefas, Aluno Presente, SARESP, perfil e destaques da turma. */
export function useIndicadoresExtras(caminho: string | null | undefined) {
  const [extras, setExtras] = useState<IndicadoresExtras>(EXTRAS_VAZIOS);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setExtras(EXTRAS_VAZIOS);
    if (!caminho || !tauriDisponivel) return;
    let ativo = true;
    invokeApp<IndicadoresExtras>("carregar_indicadores_diagnostico_turma", { caminho })
      .then((dados) => {
        if (!ativo) return;
        setExtras({ ...EXTRAS_VAZIOS, ...dados });
        setErro(null);
      })
      .catch((falha) => {
        if (ativo) setErro(String(falha));
      });
    return () => {
      ativo = false;
    };
  }, [caminho]);

  return { extras, erro };
}

/**
 * Liga o modo de impressão: enquanto `imprimindo` for verdadeiro, o chamador
 * desenha o conteúdo num portal `.diag-impressao`; o resto do app some.
 */
export function useImpressaoDiagnostico() {
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    if (!imprimindo) return;
    const terminar = () => {
      document.body.classList.remove("imprimindo-diagnostico");
      setImprimindo(false);
    };
    document.body.classList.add("imprimindo-diagnostico");
    window.addEventListener("afterprint", terminar, { once: true });
    // Espera o portal de impressão ser desenhado antes de abrir o diálogo.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", terminar);
      document.body.classList.remove("imprimindo-diagnostico");
    };
  }, [imprimindo]);

  return { imprimindo, imprimir: () => setImprimindo(true) };
}
