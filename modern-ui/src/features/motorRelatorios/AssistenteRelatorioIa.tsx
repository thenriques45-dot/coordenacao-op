// Tela "Descrever relatório": a pessoa escreve o que quer em português e a
// IA monta o relatório no construtor (ver assistenteIa.ts). O resultado
// sempre abre no construtor para conferir e salvar; nada é gerado direto.

import { Copy, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { assistenteManualDisponivel, assistentePedagogicoDisponivel, carregarAiAssistantSettings, rotuloAiProvider } from "../aiAssistant";
import { invokeApp, tauriDisponivel } from "../appBridge";
import {
  ErroAssistente,
  gerarRelatorioComIa,
  interpretarRespostaAssistente,
  montarPromptAssistenteManual,
  type ContextoAssistente,
} from "./assistenteIa";
import type { CampoRelatorioInfo, ReportDefinition } from "./tipos";

const EXEMPLOS = [
  "Alunos com nota abaixo da média em Matemática, ordenados pela nota",
  "Os 10 alunos com mais faltas de cada turma do noturno",
  "Alunos sem telefone do responsável cadastrado, separados por turma",
  "Alunos com frequência anual abaixo de 75%, em Excel",
];

export function AssistenteRelatorioIa({
  series,
  onGerado,
  onAbrirConfiguracoes,
  onFechar,
}: {
  series: string[];
  onGerado: (definicao: ReportDefinition, pedido: string) => void;
  onAbrirConfiguracoes: () => void;
  onFechar: () => void;
}) {
  const [settings] = useState(carregarAiAssistantSettings);
  const automatico = assistentePedagogicoDisponivel(settings);
  const manual = assistenteManualDisponivel(settings);
  const [contexto, setContexto] = useState<ContextoAssistente | null>(null);
  const [pedido, setPedido] = useState("");
  const [respostaManual, setRespostaManual] = useState("");
  const [promptCopiado, setPromptCopiado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [problemas, setProblemas] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      invokeApp<CampoRelatorioInfo[]>("listar_campos_disponiveis"),
      invokeApp<string[]>("listar_disciplinas_conhecidas").catch(() => [] as string[]),
    ])
      .then(([campos, disciplinas]) => setContexto({ campos, disciplinas, series }))
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [series]);

  function limparErros() {
    setErro("");
    setProblemas([]);
  }

  async function gerar() {
    if (!contexto || !pedido.trim()) return;
    limparErros();
    setGerando(true);
    try {
      const resultado = await gerarRelatorioComIa(settings, pedido, contexto);
      onGerado(resultado.definicao, pedido.trim());
    } catch (e) {
      if (e instanceof ErroAssistente) setProblemas(e.problemas);
      else setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  }

  async function copiarPrompt() {
    if (!contexto || !pedido.trim()) return;
    await navigator.clipboard.writeText(montarPromptAssistenteManual(pedido, contexto));
    setPromptCopiado(true);
  }

  function abrirLink(url: string) {
    void copiarPrompt();
    if (tauriDisponivel) {
      invokeApp("abrir_url", { url }).catch((e) => setErro(String(e)));
      return;
    }
    window.open(url, "_blank");
  }

  async function usarRespostaManual() {
    if (!contexto || !respostaManual.trim()) return;
    limparErros();
    setGerando(true);
    try {
      const resultado = await interpretarRespostaAssistente(respostaManual, contexto);
      if (resultado.ok) onGerado(resultado.valor.definicao, pedido.trim());
      else setProblemas(resultado.problemas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="ai-report-modal assistente-relatorio-modal" role="dialog" aria-modal="true" aria-labelledby="assistente-relatorio-titulo">
        <header>
          <div>
            <span className="eyebrow">Central de relatórios</span>
            <h2 id="assistente-relatorio-titulo">Descrever relatório</h2>
            <p>
              {automatico
                ? `Escreva o que você precisa e a IA monta o relatório no construtor · ${rotuloAiProvider(settings.provider)} · ${settings.model}`
                : "Escreva o que você precisa e a IA monta o relatório no construtor."}
            </p>
          </div>
          <button type="button" className="icon-action" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {!automatico && !manual ? (
          <div className="ai-report-error">
            <strong>O assistente pedagógico está desligado.</strong>
            <span>Ative e teste o assistente em Configurações para descrever relatórios com IA.</span>
            <button type="button" onClick={onAbrirConfiguracoes}>Abrir Configurações</button>
          </div>
        ) : (
          <>
            <div className="ai-report-privacy-note">
              A IA recebe só a lista de campos, disciplinas e séries, nunca dados de alunos. O relatório abre no
              construtor para você conferir a prévia antes de salvar.
            </div>

            <label className="assistente-relatorio-pedido">
              <strong>O que o relatório deve mostrar?</strong>
              <textarea
                value={pedido}
                onChange={(evento) => {
                  setPedido(evento.target.value);
                  setPromptCopiado(false);
                }}
                placeholder="Ex.: alunos do 1º ano com nota abaixo de 5 em Matemática e frequência abaixo de 75%, separados por turma"
                disabled={gerando}
              />
            </label>
            <div className="assistente-relatorio-exemplos">
              {EXEMPLOS.map((exemplo) => (
                <button key={exemplo} type="button" onClick={() => setPedido(exemplo)} disabled={gerando}>
                  {exemplo}
                </button>
              ))}
            </div>

            {manual && (
              <div className="manual-prompt-steps">
                <strong>Modo manual</strong>
                <span>1. Descreva o relatório acima e copie o prompt (ou abra o Copilot/ChatGPT por aqui).</span>
                <span>2. Cole na IA escolhida e copie a resposta inteira dela.</span>
                <span>3. Cole a resposta abaixo e clique em "Usar resposta".</span>
                <textarea
                  className="assistente-relatorio-resposta"
                  value={respostaManual}
                  onChange={(evento) => setRespostaManual(evento.target.value)}
                  placeholder="Cole aqui a resposta da IA"
                  disabled={gerando}
                />
              </div>
            )}

            {gerando && (
              <div className="ai-report-privacy-note assistente-relatorio-status">
                <Sparkles size={16} /> Montando o relatório...
              </div>
            )}
            {(erro || problemas.length > 0) && (
              <div className="ai-report-privacy-note assistente-relatorio-erro" role="alert">
                <strong>{erro ? "Não foi possível montar o relatório." : "A IA não conseguiu montar o relatório. Tente descrever de outro jeito."}</strong>
                {erro && <span>{erro}</span>}
                {problemas.length > 0 && (
                  <ul>
                    {problemas.map((problema) => (
                      <li key={problema}>{problema}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <footer>
          <button type="button" onClick={onFechar}>Fechar</button>
          {automatico && (
            <button type="button" className="primary-action" onClick={gerar} disabled={!contexto || !pedido.trim() || gerando}>
              <Sparkles size={16} />
              {gerando ? "Montando..." : "Montar relatório"}
            </button>
          )}
          {manual && (
            <>
              <button type="button" onClick={copiarPrompt} disabled={!contexto || !pedido.trim()}>
                <Copy size={16} />
                {promptCopiado ? "Prompt copiado" : "Copiar prompt"}
              </button>
              <button type="button" onClick={() => abrirLink("https://copilot.microsoft.com")} disabled={!contexto || !pedido.trim()}>Abrir Copilot</button>
              <button type="button" onClick={() => abrirLink("https://chatgpt.com")} disabled={!contexto || !pedido.trim()}>Abrir ChatGPT</button>
              <button type="button" className="primary-action" onClick={usarRespostaManual} disabled={!contexto || !respostaManual.trim() || gerando}>
                Usar resposta
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
