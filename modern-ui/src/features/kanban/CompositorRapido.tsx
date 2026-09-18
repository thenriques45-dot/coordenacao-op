import { ArrowUpRight, CalendarDays, Link2, Paperclip, Plus, Tag, UserRound, X } from "lucide-react";
import { type Dispatch, type KeyboardEvent, type SetStateAction, useState } from "react";
import { type CalendarEvent, type KanbanColuna, type KanbanPrioridade } from "../management";
import { iniciaisPerfil } from "../workgroupSync";
import { VinculosPicker } from "./VinculosPicker";
import {
  AlternarCompartilhar,
  CampoEtiquetas,
  CampoRecorrencia,
  PastilhaColuna,
  SeletorAvisos,
  ZonaAnexos,
  type AcoesAnexos,
} from "./camposTarefa";
import {
  ATALHOS_PRAZO,
  aplicarPrazo,
  atalhoEnviar,
  dataDoAtalho,
  rotuloLista,
  rotuloPrazo,
  type FormularioTarefa,
} from "./formularioTarefa";
import { useAlturaAutomatica } from "./useAlturaAutomatica";

export type PropsFormularioTarefa = {
  form: FormularioTarefa;
  setForm: Dispatch<SetStateAction<FormularioTarefa>>;
  editando: boolean;
  colunas: KanbanColuna[];
  eventos: CalendarEvent[];
  sugestoesResponsavel: string[];
  sugestoesVinculo: string[];
  sugestoesEtiquetas: string[];
  acoesAnexos: AcoesAnexos;
  destacarAnexos: boolean;
  onSalvar: () => void;
  onFechar: () => void;
};

export const PRIORIDADES: { id: KanbanPrioridade; rotulo: string }[] = [
  { id: "alta", rotulo: "Alta" },
  { id: "media", rotulo: "Média" },
  { id: "baixa", rotulo: "Baixa" },
];

type Popover = "prazo" | "prioridade" | "responsavel" | "vinculos" | "etiqueta" | "anexo";

// Ctrl/⌘+Enter salva; Esc fecha primeiro o popover aberto e só depois o
// formulário — fechar tudo de uma vez faria o coordenador perder o que
// digitou ao só querer dispensar um seletor.
export function teclasDoFormulario(
  event: KeyboardEvent<HTMLElement>,
  { podeSalvar, onSalvar, onEsc }: { podeSalvar: boolean; onSalvar: () => void; onEsc: () => void },
) {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    if (podeSalvar) onSalvar();
    return;
  }
  // Enter sozinho num campo de texto NÃO envia: sem isso, o envio implícito
  // do navegador criaria a tarefa ao confirmar um responsável ou uma data,
  // antes de o coordenador terminar de preencher as pastilhas.
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onEsc();
  }
}

// Compositor rápido: título, descrição e pastilhas. É o que abre ao clicar num
// cartão e em "Nova tarefa". O painel completo só aparece por escolha
// explícita (onAbrirCompleto).
export function CompositorRapido({
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
  onAbrirCompleto,
}: PropsFormularioTarefa & { onAbrirCompleto: () => void }) {
  const refDescricao = useAlturaAutomatica(form.descricao);
  const [popover, setPopover] = useState<Popover | null>(destacarAnexos ? "anexo" : null);
  const [maisOpcoes, setMaisOpcoes] = useState(Boolean(form.eventId) || form.repetir !== "none");
  const atualizar = (mudanca: Partial<FormularioTarefa>) => setForm((atual) => ({ ...atual, ...mudanca }));
  const coluna = colunas.find((item) => item.id === form.status) ?? colunas[0];
  const podeSalvar = form.titulo.trim().length > 0;
  const alternar = (alvo: Popover) => setPopover((atual) => (atual === alvo ? null : alvo));

  const prazo = rotuloPrazo(form.dataInicio, form.prazo);
  const responsavel = rotuloLista(form.responsavel);
  const vinculos = rotuloLista(form.vinculo);
  const etiquetas = rotuloLista(form.etiquetas);
  const prioridade = PRIORIDADES.find((item) => item.id === form.prioridade) ?? PRIORIDADES[1];

  return (
    <div className="modal-backdrop kb-backdrop">
      <form
        className="kb-compositor"
        aria-label={editando ? "Editar tarefa" : "Nova tarefa"}
        onSubmit={(event) => {
          event.preventDefault();
          if (podeSalvar) onSalvar();
        }}
        onKeyDown={(event) =>
          teclasDoFormulario(event, {
            podeSalvar,
            onSalvar,
            onEsc: () => (popover ? setPopover(null) : onFechar()),
          })
        }
      >
        <header className="kb-cabecalho">
          <PastilhaColuna coluna={coluna} />
          <span className="kb-contexto">{editando ? "editando tarefa" : "nova tarefa"}</span>
          <button type="button" className="kb-fechar" onClick={onFechar} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <input
          className="kb-titulo"
          value={form.titulo}
          onChange={(event) => atualizar({ titulo: event.target.value })}
          placeholder="O que precisa ser feito?"
          aria-label="Título"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
            }
          }}
        />
        <textarea
          ref={refDescricao}
          className="kb-descricao"
          value={form.descricao}
          onChange={(event) => atualizar({ descricao: event.target.value })}
          placeholder="Adicionar detalhes (opcional)"
          aria-label="Descrição"
          rows={4}
        />

        <div className="kb-pastilhas">
          <button type="button" className={`kb-pastilha ${popover === "prazo" ? "aberta" : prazo ? "preenchida" : ""}`} onClick={() => alternar("prazo")}>
            <CalendarDays size={14} />
            {prazo || "Prazo"}
          </button>
          <button type="button" className={`kb-pastilha ${popover === "prioridade" ? "aberta" : "preenchida"}`} onClick={() => alternar("prioridade")}>
            <i className={`kb-ponto-prioridade ${prioridade.id}`} />
            {prioridade.rotulo}
          </button>
          <button type="button" className={`kb-pastilha ${popover === "responsavel" ? "aberta" : responsavel ? "preenchida" : ""}`} onClick={() => alternar("responsavel")}>
            {responsavel ? <span className="kb-iniciais">{iniciaisPerfil(responsavel)}</span> : <UserRound size={14} />}
            {responsavel || "Responsável"}
          </button>
          <button type="button" className={`kb-pastilha ${popover === "vinculos" ? "aberta" : vinculos ? "preenchida" : ""}`} onClick={() => alternar("vinculos")}>
            <Link2 size={14} />
            {vinculos || "Vínculos"}
          </button>
          <button type="button" className={`kb-pastilha ${popover === "etiqueta" ? "aberta" : etiquetas ? "preenchida" : ""}`} onClick={() => alternar("etiqueta")}>
            <Tag size={14} />
            {etiquetas || "Etiqueta"}
          </button>
          <button type="button" className={`kb-pastilha ${popover === "anexo" ? "aberta" : form.anexos.length ? "preenchida" : ""}`} onClick={() => alternar("anexo")}>
            <Paperclip size={14} />
            {form.anexos.length ? `${form.anexos.length} anexo${form.anexos.length > 1 ? "s" : ""}` : "Anexo"}
          </button>
          <button
            type="button"
            className="kb-pastilha kb-pastilha-mais"
            aria-expanded={maisOpcoes}
            onClick={() => {
              setMaisOpcoes((atual) => !atual);
              setPopover(null);
            }}
          >
            <Plus size={14} />
            {maisOpcoes ? "menos opções" : "mais opções"}
          </button>
        </div>

        {popover && (
          <section className="kb-popover" aria-label="Editar campo">
            <div className="kb-popover-topo">
              <strong>
                {{ prazo: "Prazo", prioridade: "Prioridade", responsavel: "Responsável", vinculos: "Turmas e alunos", etiqueta: "Etiquetas", anexo: "Anexos" }[popover]}
              </strong>
              <button type="button" className="kb-link" onClick={() => setPopover(null)}>
                fechar
              </button>
            </div>

            {popover === "prazo" && (
              <>
                <div className="kb-atalhos">
                  {ATALHOS_PRAZO.map((atalho) => (
                    <button key={atalho.id} type="button" onClick={() => setForm((atual) => aplicarPrazo(atual, dataDoAtalho(atalho.id)))}>
                      {atalho.rotulo}
                    </button>
                  ))}
                </div>
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
                <div className="kb-avisar">
                  <span>Avisar</span>
                  <SeletorAvisos
                    alertas={form.alertas}
                    onAlternar={(chave) => setForm((atual) => ({ ...atual, alertas: { ...atual.alertas, [chave]: !atual.alertas[chave] } }))}
                  />
                </div>
              </>
            )}

            {popover === "prioridade" && (
              <div className="kb-segmentado">
                {PRIORIDADES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={form.prioridade === item.id ? "selecionado" : ""}
                    aria-pressed={form.prioridade === item.id}
                    onClick={() => {
                      atualizar({ prioridade: item.id });
                      setPopover(null);
                    }}
                  >
                    <i className={`kb-ponto-prioridade ${item.id}`} />
                    {item.rotulo}
                  </button>
                ))}
              </div>
            )}

            {popover === "responsavel" && (
              <VinculosPicker
                valor={form.responsavel}
                sugestoes={sugestoesResponsavel}
                onChange={(valor) => atualizar({ responsavel: valor })}
                placeholder="Nome ou @ para o grupo de trabalho"
              />
            )}

            {popover === "vinculos" && (
              <VinculosPicker
                valor={form.vinculo}
                sugestoes={sugestoesVinculo}
                onChange={(valor) => atualizar({ vinculo: valor })}
                placeholder="Aluno, turma ou geral"
              />
            )}

            {popover === "etiqueta" && (
              <CampoEtiquetas valor={form.etiquetas} sugestoes={sugestoesEtiquetas} onChange={(valor) => atualizar({ etiquetas: valor })} autoFocus />
            )}

            {popover === "anexo" && <ZonaAnexos anexos={form.anexos} acoes={acoesAnexos} destacar={destacarAnexos} />}
          </section>
        )}

        {maisOpcoes && (
          <section className="kb-mais-opcoes">
            <label>
              <span>Evento do calendário</span>
              <select value={form.eventId} onChange={(event) => atualizar({ eventId: event.target.value })}>
                <option value="">Nenhum evento</option>
                {eventos.map((evento) => (
                  <option key={evento.id} value={evento.id}>
                    {evento.titulo}
                  </option>
                ))}
              </select>
            </label>
            <div className="kb-campo">
              <span>Repetição</span>
              <CampoRecorrencia form={form} onChange={atualizar} />
            </div>
          </section>
        )}

        <footer className="kb-rodape">
          <div className="kb-rodape-esquerda">
            <button type="button" className="kb-escalar" onClick={onAbrirCompleto}>
              Abrir formulário completo
              <ArrowUpRight size={13} />
            </button>
            <AlternarCompartilhar ativo={form.compartilhada} onAlternar={() => atualizar({ compartilhada: !form.compartilhada })} />
          </div>
          <div className="kb-rodape-direita">
            <span className="kb-atalho" aria-hidden="true">
              {atalhoEnviar}
            </span>
            <button type="submit" className="kb-primario" disabled={!podeSalvar}>
              {editando ? "Salvar" : "Criar tarefa"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
