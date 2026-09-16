import { Archive, ClipboardList, Trash2, X } from "lucide-react";
import { type CalendarEvent } from "../management";
import { VinculosPicker } from "./VinculosPicker";
import {
  AlternarCompartilhar,
  CampoEtiquetas,
  CampoRecorrencia,
  PastilhaColuna,
  SeletorAvisos,
  ZonaAnexos,
} from "./camposTarefa";
import { aplicarPrazo, type FormularioTarefa } from "./formularioTarefa";
import { estiloCorColuna } from "./quadro";
import { PRIORIDADES, teclasDoFormulario, type PropsFormularioTarefa } from "./CompositorRapido";

// Painel completo: duas colunas, sem abas. À esquerda o que muda o fluxo da
// tarefa; à direita o contexto, em chips. Só abre por escolha explícita —
// "Abrir formulário completo" no compositor, "Abrir detalhes" no menu do
// cartão ou "Detalhes" na criação rápida da coluna.
export function PainelCompleto({
  form,
  setForm,
  editando,
  colunas,
  eventos,
  sugestoesResponsavel,
  sugestoesVinculo,
  sugestoesEtiquetas,
  acoesAnexos,
  destacarAnexos,
  onSalvar,
  onFechar,
  onArquivar,
  onExcluir,
}: PropsFormularioTarefa & { onArquivar?: () => void; onExcluir?: () => void }) {
  const atualizar = (mudanca: Partial<FormularioTarefa>) => setForm((atual) => ({ ...atual, ...mudanca }));
  const coluna = colunas.find((item) => item.id === form.status) ?? colunas[0];
  const podeSalvar = form.titulo.trim().length > 0;
  const intervaloCompleto = Boolean(form.dataInicio && form.prazo && form.dataInicio < form.prazo);

  return (
    <div className="modal-backdrop kb-backdrop">
      <form
        className="kb-painel"
        aria-label={editando ? "Detalhes da tarefa" : "Nova tarefa"}
        onSubmit={(event) => {
          event.preventDefault();
          if (podeSalvar) onSalvar();
        }}
        onKeyDown={(event) => teclasDoFormulario(event, { podeSalvar, onSalvar, onEsc: onFechar })}
      >
        <header className="kb-painel-cabecalho">
          <div className="kb-painel-titulo">
            <div className="kb-cabecalho">
              {editando ? (
                <>
                  <PastilhaColuna coluna={coluna} />
                  <span className="kb-contexto">editando tarefa</span>
                </>
              ) : (
                <span className="kb-contexto kb-contexto-icone">
                  <ClipboardList size={13} />
                  Quadro de gestão
                </span>
              )}
            </div>
            <input
              className="kb-titulo"
              value={form.titulo}
              onChange={(event) => atualizar({ titulo: event.target.value })}
              placeholder="O que precisa ser feito?"
              aria-label="Título"
              autoFocus
            />
          </div>
          <button type="button" className="kb-fechar kb-fechar-caixa" onClick={onFechar} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="kb-painel-corpo">
          <div className="kb-painel-fluxo">
            <label className="kb-campo">
              <span>Descrição</span>
              <textarea value={form.descricao} onChange={(event) => atualizar({ descricao: event.target.value })} rows={4} />
            </label>

            <div className="kb-campo">
              <span>Prazo</span>
              <div className="kb-intervalo">
                <input
                  type="date"
                  aria-label="Início"
                  value={form.dataInicio}
                  max={form.prazo || undefined}
                  onChange={(event) => atualizar({ dataInicio: event.target.value })}
                />
                <span>até</span>
                <input
                  type="date"
                  aria-label="Prazo"
                  value={form.prazo}
                  min={form.dataInicio || undefined}
                  onChange={(event) => setForm((atual) => aplicarPrazo(atual, event.target.value))}
                />
              </div>
              <small className="kb-dica">
                {intervaloCompleto
                  ? "A tarefa aparece no calendário em todos os dias do período."
                  : "Com as duas datas, a tarefa aparece no calendário em todos os dias do período."}
              </small>
            </div>

            <div className="kb-campo">
              <span>Prioridade</span>
              <div className="kb-segmentado kb-segmentado-largo">
                {PRIORIDADES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={form.prioridade === item.id ? "selecionado" : ""}
                    aria-pressed={form.prioridade === item.id}
                    onClick={() => atualizar({ prioridade: item.id })}
                  >
                    <i className={`kb-ponto-prioridade ${item.id}`} />
                    {item.rotulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="kb-campo">
              <span>Coluna</span>
              <div className="kb-colunas-escolha">
                {colunas.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={coluna?.id === item.id ? "selecionado" : ""}
                    aria-pressed={coluna?.id === item.id}
                    onClick={() => atualizar({ status: item.id })}
                  >
                    <i className="kb-cor-coluna" style={estiloCorColuna(item.cor)} />
                    {item.titulo}
                  </button>
                ))}
              </div>
            </div>

            <hr className="kb-divisor" />

            <div className="kb-campo">
              <span>Avisar antes do prazo</span>
              <SeletorAvisos
                longo
                alertas={form.alertas}
                onAlternar={(chave) => setForm((atual) => ({ ...atual, alertas: { ...atual.alertas, [chave]: !atual.alertas[chave] } }))}
              />
            </div>

            <div className="kb-campo">
              <span>Repetição</span>
              <CampoRecorrencia form={form} onChange={atualizar} comDica />
            </div>
          </div>

          <aside className="kb-painel-contexto">
            <div className="kb-campo">
              <span>Responsáveis</span>
              <VinculosPicker
                valor={form.responsavel}
                sugestoes={sugestoesResponsavel}
                onChange={(valor) => atualizar({ responsavel: valor })}
                placeholder="+ @ grupo"
              />
            </div>

            <div className="kb-campo">
              <span>Turmas e alunos</span>
              <VinculosPicker
                valor={form.vinculo}
                sugestoes={sugestoesVinculo}
                onChange={(valor) => atualizar({ vinculo: valor })}
                placeholder="+ vincular"
              />
            </div>

            <div className="kb-campo">
              <span>Etiquetas</span>
              <CampoEtiquetas valor={form.etiquetas} sugestoes={sugestoesEtiquetas} onChange={(valor) => atualizar({ etiquetas: valor })} usadasAntes />
            </div>

            <label className="kb-campo">
              <span>Evento do calendário</span>
              <SeletorEvento valor={form.eventId} eventos={eventos} onChange={(eventId) => atualizar({ eventId })} />
            </label>

            <div className="kb-campo">
              <span>Anexos</span>
              <ZonaAnexos anexos={form.anexos} acoes={acoesAnexos} destacar={destacarAnexos} />
            </div>

            {editando && (onArquivar || onExcluir) && (
              // Ações destrutivas no pé da coluna de contexto, nunca no rodapé
              // principal ao lado de Salvar (seção 3 do handoff).
              <div className="kb-destrutivas">
                {onArquivar && (
                  <button type="button" className="kb-destrutivo kb-destrutivo-leve" onClick={onArquivar}>
                    <Archive size={14} />
                    Arquivar tarefa
                  </button>
                )}
                {onExcluir && (
                <button type="button" className="kb-destrutivo" onClick={onExcluir}>
                  <Trash2 size={14} />
                  Excluir tarefa
                </button>
                )}
              </div>
            )}
          </aside>
        </div>

        <footer className="kb-rodape">
          <AlternarCompartilhar ativo={form.compartilhada} onAlternar={() => atualizar({ compartilhada: !form.compartilhada })} comDica />
          <div className="kb-rodape-direita">
            <button type="button" className="kb-secundario" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="kb-primario" disabled={!podeSalvar}>
              {editando ? "Salvar alterações" : "Criar tarefa"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function SeletorEvento({ valor, eventos, onChange }: { valor: string; eventos: CalendarEvent[]; onChange: (eventId: string) => void }) {
  return (
    <select value={valor} onChange={(event) => onChange(event.target.value)}>
      <option value="">Nenhum evento</option>
      {eventos.map((evento) => (
        <option key={evento.id} value={evento.id}>
          {evento.titulo}
        </option>
      ))}
    </select>
  );
}
