import { useEffect, useState } from "react";
import { invokeApp } from "./appBridge";
import type { ConfiguracoesApp } from "./SettingsPage";

const TOTAL_PASSOS = 2;

export function AssistenteConfigTurmas({
  onConcluido,
  onFechar,
}: {
  onConcluido: (config: ConfiguracoesApp) => void;
  onFechar: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const [config, setConfig] = useState<ConfiguracoesApp | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    invokeApp<ConfiguracoesApp>("carregar_configuracoes")
      .then(setConfig)
      .catch(() => {});
  }, []);

  function adicionarTipoAtendimento() {
    setConfig((atual) => (atual ? { ...atual, atendimento_tipos: [...atual.atendimento_tipos, ""] } : atual));
  }

  function atualizarTipoAtendimento(indice: number, valor: string) {
    setConfig((atual) =>
      atual ? { ...atual, atendimento_tipos: atual.atendimento_tipos.map((item, i) => (i === indice ? valor : item)) } : atual
    );
  }

  function removerTipoAtendimento(indice: number) {
    setConfig((atual) =>
      atual ? { ...atual, atendimento_tipos: atual.atendimento_tipos.filter((_, i) => i !== indice) } : atual
    );
  }

  async function salvarEFinalizar() {
    if (!config) {
      onFechar();
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      const salvo = await invokeApp<ConfiguracoesApp>("salvar_configuracoes", { input: config });
      onConcluido(salvo);
    } catch (err) {
      setErro(String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="sync-wizard" role="dialog" aria-modal="true" aria-labelledby="turmas-wizard-titulo">
        <div className="sync-wizard-progress" aria-label={`Etapa ${passo + 1} de ${TOTAL_PASSOS}`}>
          {Array.from({ length: TOTAL_PASSOS }).map((_, indice) => (
            <span key={indice} className={indice <= passo ? "active" : ""} />
          ))}
        </div>

        {passo === 0 && (
          <>
            <span className="eyebrow">Configuração de turmas</span>
            <h2 id="turmas-wizard-titulo">Líder de sala e elegível</h2>
            <p>Esses campos aparecem nas turmas e no conselho. Desative os que não fizerem sentido para sua escola.</p>
            <div className="sync-wizard-form">
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={config?.lider_ativo ?? true}
                  disabled={!config}
                  onChange={(event) => setConfig((atual) => (atual ? { ...atual, lider_ativo: event.target.checked } : atual))}
                />
                Usar líder de sala
              </label>
              <label>
                Nome do campo
                <input
                  value={config?.lider_rotulo ?? ""}
                  disabled={!config || !config.lider_ativo}
                  onChange={(event) => setConfig((atual) => (atual ? { ...atual, lider_rotulo: event.target.value } : atual))}
                  placeholder="Ex.: Líder de sala, Representante"
                />
              </label>
              <label className="settings-check-row">
                <input
                  type="checkbox"
                  checked={config?.elegivel_ativo ?? true}
                  disabled={!config}
                  onChange={(event) => setConfig((atual) => (atual ? { ...atual, elegivel_ativo: event.target.checked } : atual))}
                />
                Usar elegível
              </label>
              <label>
                Nome do campo
                <input
                  value={config?.elegivel_rotulo ?? ""}
                  disabled={!config || !config.elegivel_ativo}
                  onChange={(event) => setConfig((atual) => (atual ? { ...atual, elegivel_rotulo: event.target.value } : atual))}
                  placeholder="Ex.: Elegível"
                />
              </label>
            </div>
          </>
        )}

        {passo === 1 && (
          <>
            <span className="eyebrow">Configuração de turmas</span>
            <h2 id="turmas-wizard-titulo">Tipos de atendimento</h2>
            <p>Defina as opções disponíveis na aba Atendimentos da ficha do aluno.</p>
            <div className="perfil-criterios-config">
              {(config?.atendimento_tipos ?? []).map((tipo, indice) => (
                <div key={indice} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input
                    value={tipo}
                    onChange={(event) => atualizarTipoAtendimento(indice, event.target.value)}
                    placeholder="Ex.: Disciplinar, Pedagógico, Financeiro"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="danger-action" onClick={() => removerTipoAtendimento(indice)}>
                    Remover
                  </button>
                </div>
              ))}
              {!config?.atendimento_tipos.length && (
                <span style={{ color: "#667085", fontSize: "0.85rem" }}>
                  Nenhum tipo configurado. Adicione ao menos um para registrar atendimentos.
                </span>
              )}
            </div>
            <button type="button" className="secondary-action" onClick={adicionarTipoAtendimento} disabled={!config}>
              Adicionar tipo
            </button>
          </>
        )}

        {erro && <div className="notice error">{erro}</div>}

        <div className="modal-actions">
          <button type="button" onClick={onFechar}>Pular</button>
          {passo > 0 && <button type="button" onClick={() => setPasso((atual) => atual - 1)}>Voltar</button>}
          {passo < TOTAL_PASSOS - 1 ? (
            <button type="button" className="primary-action" onClick={() => setPasso((atual) => atual + 1)}>
              Próximo
            </button>
          ) : (
            <button type="button" className="primary-action" onClick={salvarEFinalizar} disabled={salvando || !config}>
              {salvando ? "Salvando..." : "Concluir"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
