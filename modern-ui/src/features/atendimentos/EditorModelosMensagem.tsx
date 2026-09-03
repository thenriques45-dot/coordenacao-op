import { VARIAVEIS_MENSAGEM, type MensagemTemplate } from "../SettingsPage";

// Editor dos modelos de mensagem à família. Controlado: o pai guarda a lista
// e decide quando persistir. Vive em Configurações e no modal "Gerenciar
// modelos" da tela de Atendimentos (handoff Configurações v2, mudança 1c).
export function EditorModelosMensagem({
  modelos,
  onChange,
}: {
  modelos: MensagemTemplate[];
  onChange: (modelos: MensagemTemplate[]) => void;
}) {
  function atualizar(indice: number, campos: Partial<MensagemTemplate>) {
    onChange(modelos.map((item, i) => (i === indice ? { ...item, ...campos } : item)));
  }
  function remover(indice: number) {
    onChange(modelos.filter((_, i) => i !== indice));
  }
  function mover(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= modelos.length) return;
    const copia = [...modelos];
    [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
    onChange(copia);
  }
  function adicionar() {
    onChange([...modelos, { id: `tpl-${Date.now()}`, titulo: "", corpo: "", tags: [] }]);
  }

  return (
    <div className="atd-modelos">
      <p className="atd-modelos-ajuda">
        Um modelo por situação — faltas, tarefas em atraso, convocação. Use variáveis entre chaves
        no texto; elas são trocadas pelos dados reais do estudante ao compor a mensagem.
      </p>
      <div className="atd-modelos-vars">
        {VARIAVEIS_MENSAGEM.map((variavel) => (
          <span key={variavel.chave} title={variavel.rotulo}>{`{${variavel.chave}}`}</span>
        ))}
      </div>

      <div className="atd-modelos-lista">
        {modelos.map((modelo, indice) => (
          <div key={modelo.id} className="atd-modelo-card">
            <div className="atd-modelo-topo">
              <input
                value={modelo.titulo}
                onChange={(evento) => atualizar(indice, { titulo: evento.target.value })}
                placeholder="Título do modelo (ex.: Excesso de faltas)"
                className="atd-modelo-titulo"
              />
              <button type="button" onClick={() => mover(indice, -1)} disabled={indice === 0} aria-label="Mover para cima">↑</button>
              <button type="button" onClick={() => mover(indice, 1)} disabled={indice === modelos.length - 1} aria-label="Mover para baixo">↓</button>
              <button type="button" className="danger-action" onClick={() => remover(indice)}>Remover</button>
            </div>
            <textarea
              value={modelo.corpo}
              onChange={(evento) => atualizar(indice, { corpo: evento.target.value })}
              placeholder="Corpo da mensagem. Ex.: Prezado(a) responsável por {aluno}, ..."
              rows={6}
            />
            <input
              value={modelo.tags.join(", ")}
              onChange={(evento) =>
                atualizar(indice, {
                  tags: evento.target.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                })
              }
              placeholder="Tags do atendimento (separadas por vírgula) — ex.: Faltas"
            />
          </div>
        ))}
        {!modelos.length && (
          <span className="atd-modelos-vazio">Nenhum modelo. Sem modelos, o app usa os exemplos padrão ao salvar.</span>
        )}
      </div>
      <button type="button" className="atd-btn-secundario" onClick={adicionar}>Adicionar modelo</button>
    </div>
  );
}
