import { useEffect, useState } from "react";
import { invokeApp } from "./appBridge";
import { opcoesModoNotasAta, type ConfiguracoesApp, type CriterioDestaque, type CriterioPerfil } from "./SettingsPage";

function proximoNumeroEncaminhamento(opcoes: { numero: number }[]) {
  return opcoes.reduce((max, item) => Math.max(max, item.numero), 0) + 1;
}

const TOTAL_PASSOS = 4;
const ICONES_DESTAQUE = ["⭐", "🏆", "📈", "↗", "💪", "🎯", "👑", "🌟", "🔝", "🎖"];

export function AssistenteConfigConselho({
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

  function adicionarCriterioPerfil() {
    const novo: CriterioPerfil = {
      id: `criterio_${Date.now()}`,
      nome: "",
      opcoes: [
        { nivel: "baixo", label: "" },
        { nivel: "medio", label: "" },
        { nivel: "alto", label: "" },
      ],
    };
    setConfig((atual) => (atual ? { ...atual, perfil_turma_criterios: [...(atual.perfil_turma_criterios ?? []), novo] } : atual));
  }

  function atualizarNomeCriterioPerfil(indice: number, valor: string) {
    setConfig((atual) =>
      atual
        ? {
            ...atual,
            perfil_turma_criterios: (atual.perfil_turma_criterios ?? []).map((criterio, i) =>
              i === indice ? { ...criterio, nome: valor } : criterio
            ),
          }
        : atual
    );
  }

  function atualizarOpcaoCriterioPerfil(indice: number, nivel: string, valor: string) {
    setConfig((atual) =>
      atual
        ? {
            ...atual,
            perfil_turma_criterios: (atual.perfil_turma_criterios ?? []).map((criterio, i) =>
              i === indice
                ? { ...criterio, opcoes: criterio.opcoes.map((op) => (op.nivel === nivel ? { ...op, label: valor } : op)) }
                : criterio
            ),
          }
        : atual
    );
  }

  function removerCriterioPerfil(indice: number) {
    setConfig((atual) =>
      atual ? { ...atual, perfil_turma_criterios: (atual.perfil_turma_criterios ?? []).filter((_, i) => i !== indice) } : atual
    );
  }

  function adicionarCriterioDestaque() {
    const novo: CriterioDestaque = { id: `destaque_${Date.now()}`, titulo: "", icone: "⭐" };
    setConfig((atual) => (atual ? { ...atual, aluno_destaque_criterios: [...(atual.aluno_destaque_criterios ?? []), novo] } : atual));
  }

  function atualizarCriterioDestaque(indice: number, campo: "titulo" | "icone", valor: string) {
    setConfig((atual) =>
      atual
        ? {
            ...atual,
            aluno_destaque_criterios: (atual.aluno_destaque_criterios ?? []).map((criterio, i) =>
              i === indice ? { ...criterio, [campo]: valor } : criterio
            ),
          }
        : atual
    );
  }

  function removerCriterioDestaque(indice: number) {
    setConfig((atual) =>
      atual ? { ...atual, aluno_destaque_criterios: (atual.aluno_destaque_criterios ?? []).filter((_, i) => i !== indice) } : atual
    );
  }

  function adicionarEncaminhamento() {
    setConfig((atual) =>
      atual
        ? { ...atual, encaminhamento_opcoes: [...atual.encaminhamento_opcoes, { numero: proximoNumeroEncaminhamento(atual.encaminhamento_opcoes), texto: "" }] }
        : atual
    );
  }

  function atualizarEncaminhamento(indice: number, valor: string) {
    setConfig((atual) =>
      atual
        ? { ...atual, encaminhamento_opcoes: atual.encaminhamento_opcoes.map((item, i) => (i === indice ? { ...item, texto: valor } : item)) }
        : atual
    );
  }

  function removerEncaminhamento(indice: number) {
    setConfig((atual) =>
      atual ? { ...atual, encaminhamento_opcoes: atual.encaminhamento_opcoes.filter((_, i) => i !== indice) } : atual
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
      <section className="sync-wizard" role="dialog" aria-modal="true" aria-labelledby="conselho-wizard-titulo">
        <div className="sync-wizard-progress" aria-label={`Etapa ${passo + 1} de ${TOTAL_PASSOS}`}>
          {Array.from({ length: TOTAL_PASSOS }).map((_, indice) => (
            <span key={indice} className={indice <= passo ? "active" : ""} />
          ))}
        </div>

        {passo === 0 && (
          <>
            <span className="eyebrow">Configuração do conselho</span>
            <h2 id="conselho-wizard-titulo">Perfil da turma</h2>
            <p>
              Aparece no início da lista de alunos no conselho e na ATA gerada. Cada critério tem três níveis: baixo
              (vermelho), médio (amarelo) e alto (verde).
            </p>
            <label className="settings-check-row" style={{ marginBottom: "1rem" }}>
              <input
                type="checkbox"
                checked={config?.perfil_turma_ativo ?? false}
                disabled={!config}
                onChange={(event) => setConfig((atual) => (atual ? { ...atual, perfil_turma_ativo: event.target.checked } : atual))}
              />
              Exibir Perfil da Turma no conselho e na ATA
            </label>
            {config?.perfil_turma_ativo && (
              <>
                <div className="perfil-criterios-config">
                  {(config.perfil_turma_criterios ?? []).map((criterio, indice) => (
                    <div key={criterio.id} className="perfil-criterio-config-item">
                      <div className="perfil-criterio-config-row">
                        <input
                          value={criterio.nome}
                          onChange={(event) => atualizarNomeCriterioPerfil(indice, event.target.value)}
                          placeholder="Nome do critério (ex.: Participação nas aulas)"
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="danger-action" onClick={() => removerCriterioPerfil(indice)}>
                          Remover
                        </button>
                      </div>
                      <div className="perfil-criterio-config-opcoes">
                        {criterio.opcoes.map((opcao) => (
                          <label key={opcao.nivel} className={`perfil-opcao-config perfil-opcao-config-${opcao.nivel}`}>
                            <span>{opcao.nivel === "baixo" ? "Baixo" : opcao.nivel === "medio" ? "Médio" : "Alto"}</span>
                            <input
                              value={opcao.label}
                              onChange={(event) => atualizarOpcaoCriterioPerfil(indice, opcao.nivel, event.target.value)}
                              placeholder={opcao.nivel === "baixo" ? "Ex.: Raramente" : opcao.nivel === "medio" ? "Ex.: Às vezes" : "Ex.: Sempre"}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="secondary-action" onClick={adicionarCriterioPerfil} style={{ marginTop: "0.75rem" }}>
                  Adicionar critério
                </button>
              </>
            )}
          </>
        )}

        {passo === 1 && (
          <>
            <span className="eyebrow">Configuração do conselho</span>
            <h2 id="conselho-wizard-titulo">Aluno destaque</h2>
            <p>Registre alunos destaque/superação no conselho e na ATA. Cada categoria tem um título e um ícone.</p>
            <label className="settings-check-row" style={{ marginBottom: "1rem" }}>
              <input
                type="checkbox"
                checked={config?.aluno_destaque_ativo ?? false}
                disabled={!config}
                onChange={(event) => setConfig((atual) => (atual ? { ...atual, aluno_destaque_ativo: event.target.checked } : atual))}
              />
              Registrar alunos destaque/superação
            </label>
            {config?.aluno_destaque_ativo && (
              <>
                <div className="perfil-criterios-config">
                  {(config.aluno_destaque_criterios ?? []).map((criterio, indice) => (
                    <div key={criterio.id} className="perfil-criterio-config-item">
                      <div className="perfil-criterio-config-row">
                        <input
                          value={criterio.titulo}
                          onChange={(event) => atualizarCriterioDestaque(indice, "titulo", event.target.value)}
                          placeholder="Título (ex.: Aluno Destaque, Aluno Superação)"
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="danger-action" onClick={() => removerCriterioDestaque(indice)}>
                          Remover
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                        {ICONES_DESTAQUE.map((icone) => (
                          <button
                            key={icone}
                            type="button"
                            onClick={() => atualizarCriterioDestaque(indice, "icone", icone)}
                            style={{
                              fontSize: "1.3rem",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: criterio.icone === icone ? "2px solid var(--accent)" : "2px solid var(--border)",
                              background: criterio.icone === icone ? "var(--accent-subtle)" : "transparent",
                              cursor: "pointer",
                              lineHeight: 1,
                            }}
                            title={icone}
                          >
                            {icone}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="secondary-action" onClick={adicionarCriterioDestaque} style={{ marginTop: "0.75rem" }}>
                  Adicionar categoria
                </button>
              </>
            )}
          </>
        )}

        {passo === 2 && (
          <>
            <span className="eyebrow">Configuração do conselho</span>
            <h2 id="conselho-wizard-titulo">Encaminhamentos</h2>
            <p>
              Opções disponíveis para marcar por aluno no conselho e listadas em "Outras observações e
              encaminhamentos" na ATA.
            </p>
            <div className="perfil-criterios-config">
              {(config?.encaminhamento_opcoes ?? []).map((opcao, indice) => (
                <div key={opcao.numero} className="perfil-criterio-config-row" style={{ marginBottom: "0.5rem", alignItems: "center" }}>
                  <span style={{ color: "#667085", fontSize: "0.85rem", minWidth: "1.75rem", textAlign: "right" }}>{opcao.numero}.</span>
                  <input
                    value={opcao.texto}
                    onChange={(event) => atualizarEncaminhamento(indice, event.target.value)}
                    placeholder="Ex.: Dedicar-se mais ao estudo em casa."
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="danger-action" onClick={() => removerEncaminhamento(indice)}>
                    Remover
                  </button>
                </div>
              ))}
              {!(config?.encaminhamento_opcoes ?? []).length && (
                <span style={{ color: "#667085", fontSize: "0.85rem" }}>Nenhum encaminhamento configurado. Adicione ao menos um.</span>
              )}
            </div>
            <button type="button" className="secondary-action" onClick={adicionarEncaminhamento} disabled={!config} style={{ marginTop: "0.75rem" }}>
              Adicionar encaminhamento
            </button>
          </>
        )}

        {passo === 3 && (
          <>
            <span className="eyebrow">Configuração do conselho</span>
            <h2 id="conselho-wizard-titulo">Notas na ATA</h2>
            <p>Escolha como as notas de cada disciplina aparecem na ATA do conselho.</p>
            <div className="ata-notas-options">
              {opcoesModoNotasAta.map((opcao) => (
                <label key={opcao.valor} className="settings-check-row">
                  <input
                    type="radio"
                    name="modo-notas-ata-wizard"
                    value={opcao.valor}
                    checked={config?.modo_notas_ata === opcao.valor}
                    onChange={() => setConfig((atual) => (atual ? { ...atual, modo_notas_ata: opcao.valor } : atual))}
                  />
                  {opcao.rotulo}
                </label>
              ))}
            </div>
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
