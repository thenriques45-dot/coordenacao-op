import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  GripVertical,
  Link2,
  MoreHorizontal,
  PanelRightOpen,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { tauriDisponivel } from "../appBridge";
import { type EquipeGestora } from "../SettingsPage";
import { nomeExibicao } from "../equipe";
import {
  obterResponsaveisTarefa,
  obterVinculosTarefa,
  rotuloRecorrencia,
  type CalendarEvent,
  type KanbanAnexo,
  type KanbanTarefa,
} from "../management";
import { iniciaisPerfil, nomesCompativeis, type WorkgroupSyncMember } from "../workgroupSync";
import { DESCRICAO_VAZIA, rotuloPrazo } from "./formularioTarefa";
import { useFecharFora, usePosicaoMenu } from "./useFecharFora";

const ROTULO_PRIORIDADE = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

type PropsPunho = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

function origemImagem(anexo: KanbanAnexo) {
  if (anexo.dados) return anexo.dados;
  if (anexo.caminho && tauriDisponivel) return convertFileSrc(anexo.caminho);
  return "";
}

export function CartaoTarefa({
  tarefa,
  evento,
  membros,
  equipeGestora,
  concluida,
  aberto,
  modoSelecao,
  selecionada,
  menuAberto,
  renomeando,
  arrastando,
  alvoDeQueda,
  podeSubir,
  podeDescer,
  punho,
  onAbrir,
  onAbrirDetalhes,
  onAbrirDetalhesComTitulo,
  onAlternarAberto,
  onAlternarSelecao,
  onAlternarMenu,
  onFecharMenu,
  onIniciarRenomear,
  onRenomear,
  onCancelarRenomear,
  onSubir,
  onDescer,
  onArquivar,
  onExcluir,
  onAbrirAnexo,
}: {
  tarefa: KanbanTarefa;
  evento?: CalendarEvent;
  membros: WorkgroupSyncMember[];
  equipeGestora: EquipeGestora;
  concluida: boolean;
  aberto: boolean;
  modoSelecao: boolean;
  selecionada: boolean;
  menuAberto: boolean;
  renomeando: boolean;
  arrastando: boolean;
  alvoDeQueda: boolean;
  podeSubir: boolean;
  podeDescer: boolean;
  punho: PropsPunho;
  onAbrir: () => void;
  onAbrirDetalhes: () => void;
  // Do renomear no lugar: leva o título já digitado para o painel.
  onAbrirDetalhesComTitulo: (titulo: string) => void;
  onAlternarAberto: () => void;
  onAlternarSelecao: () => void;
  onAlternarMenu: () => void;
  onFecharMenu: () => void;
  onIniciarRenomear: () => void;
  onRenomear: (titulo: string) => void;
  onCancelarRenomear: () => void;
  onSubir: () => void;
  onDescer: () => void;
  onArquivar: () => void;
  onExcluir: () => void;
  onAbrirAnexo: (anexo: KanbanAnexo) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useFecharFora(menu, menuAberto, onFecharMenu);
  const estiloMenu = usePosicaoMenu(menu, menuAberto, onFecharMenu);

  const responsaveis = obterResponsaveisTarefa(tarefa);
  // Nome compatível (não só igual) para achar o avatar mesmo com o nome
  // digitado diferente do roster ("Thiago" x "Thiago Henrique Santos").
  const membro = membros.find((item) => responsaveis.some((nome) => nomesCompativeis(nome, item.displayName)));
  const nomeResponsaveis = responsaveis.map((nome) => nomeExibicao(nome, equipeGestora)).join(", ");
  const iniciais = iniciaisPerfil(membro?.displayName || responsaveis[0] || "");
  const prazo = rotuloPrazo(tarefa.dataInicio ?? "", tarefa.prazo);
  const descricao = tarefa.descricao === DESCRICAO_VAZIA ? "" : tarefa.descricao;
  const anexos = tarefa.anexos ?? [];
  const imagens = anexos.filter((anexo) => anexo.tipo.startsWith("image/"));
  const documentos = anexos.filter((anexo) => !anexo.tipo.startsWith("image/"));
  const vinculos = obterVinculosTarefa(tarefa);
  const alertas = (tarefa.alertas ?? []).filter((alerta) => alerta.ativo);

  // No modo seleção, clicar no corpo marca/desmarca em vez de abrir.
  const aoClicarCorpo = modoSelecao ? onAlternarSelecao : onAbrir;

  const avatar = membro?.avatarDataUrl ? (
    <img className="kb-avatar" src={membro.avatarDataUrl} alt="" />
  ) : (
    <span className="kb-avatar kb-avatar-iniciais" aria-hidden="true">
      {iniciais}
    </span>
  );

  return (
    <article
      data-kanban-card={tarefa.id}
      className={[
        "kb-cartao",
        `prioridade-${tarefa.prioridade}`,
        concluida ? "concluida" : "",
        arrastando ? "arrastando" : "",
        alvoDeQueda ? "alvo-queda" : "",
        selecionada ? "selecionada" : "",
      ].join(" ")}
    >
      <div className="kb-cartao-topo">
        <span className="kb-punho" title="Arraste para reordenar" aria-hidden="true" {...punho}>
          <GripVertical size={14} />
        </span>
        {modoSelecao && (
          <button
            type="button"
            className={`kb-marcar ${selecionada ? "marcada" : ""}`}
            role="checkbox"
            aria-checked={selecionada}
            aria-label={`Selecionar ${tarefa.titulo}`}
            onClick={onAlternarSelecao}
          >
            {selecionada && <Check size={12} />}
          </button>
        )}

        {renomeando ? (
          <RenomearNoLugar titulo={tarefa.titulo} onSalvar={onRenomear} onCancelar={onCancelarRenomear} onAbrirDetalhes={onAbrirDetalhesComTitulo} />
        ) : (
          <button type="button" className="kb-cartao-titulo" onClick={aoClicarCorpo} title={modoSelecao ? undefined : "Abrir para editar"}>
            <strong>{tarefa.titulo}</strong>
            {!aberto && (prazo || responsaveis.length > 0) && (
              <span className="kb-cartao-resumo">
                {prazo && (
                  <span>
                    <CalendarDays size={11} />
                    {prazo}
                  </span>
                )}
                {responsaveis.length > 0 && <span>{iniciais}</span>}
              </span>
            )}
          </button>
        )}

        {!renomeando && (
          <>
            <button
              type="button"
              className={`kb-icone kb-chevron ${aberto ? "" : "fechado"}`}
              onClick={onAlternarAberto}
              aria-label={aberto ? "Colapsar cartão" : "Expandir cartão"}
              aria-expanded={aberto}
              title={aberto ? "Colapsar cartão" : "Expandir cartão"}
            >
              <ChevronDown size={15} />
            </button>
            <div className="kb-menu-ancora" ref={menu}>
              <button type="button" className="kb-icone" onClick={onAlternarMenu} aria-label="Opções da tarefa" aria-expanded={menuAberto}>
                <MoreHorizontal size={15} />
              </button>
              {menuAberto && (
                <div className="kb-menu" style={estiloMenu} role="menu">
                  <button type="button" role="menuitem" onClick={onIniciarRenomear}>
                    <Pencil size={13} />
                    Renomear aqui
                  </button>
                  <button type="button" role="menuitem" onClick={onAbrirDetalhes}>
                    <PanelRightOpen size={13} />
                    Abrir detalhes
                  </button>
                  <div className="kb-menu-linha">
                    <button type="button" role="menuitem" onClick={onSubir} disabled={!podeSubir}>
                      <ArrowUp size={13} />
                      Subir
                    </button>
                    <button type="button" role="menuitem" onClick={onDescer} disabled={!podeDescer}>
                      <ArrowDown size={13} />
                      Descer
                    </button>
                  </div>
                  <hr />
                  <button type="button" role="menuitem" onClick={onArquivar}>
                    <Archive size={13} />
                    Arquivar
                  </button>
                  <button type="button" role="menuitem" className="destrutivo" onClick={onExcluir}>
                    <Trash2 size={13} />
                    Excluir
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {aberto && !renomeando && (
        <div className="kb-cartao-corpo">
          {descricao && (
            <p className="kb-cartao-descricao" onClick={aoClicarCorpo}>
              {descricao}
            </p>
          )}
          {imagens.length > 0 && (
            <div className="kb-cartao-imagens">
              {imagens.map((anexo) => (
                <img key={anexo.id} src={origemImagem(anexo)} alt={anexo.nome} draggable={false} />
              ))}
            </div>
          )}
          {(evento || vinculos.length > 0 || tarefa.recorrencia) && (
            <div className="kb-cartao-vinculos">
              {evento && (
                <span>
                  <CalendarDays size={11} />
                  {evento.titulo}
                </span>
              )}
              {vinculos.map((vinculo) => (
                <span key={vinculo}>
                  <Link2 size={11} />
                  {vinculo}
                </span>
              ))}
              {tarefa.recorrencia && (
                <span>
                  <Clock size={11} />
                  {rotuloRecorrencia(tarefa.recorrencia)}
                </span>
              )}
            </div>
          )}
          {tarefa.etiquetas.length > 0 && (
            <div className="kb-cartao-etiquetas">
              {tarefa.etiquetas.map((etiqueta) => (
                <span key={etiqueta}>{etiqueta}</span>
              ))}
            </div>
          )}
          {documentos.length > 0 && (
            <div className="kb-cartao-documentos">
              {documentos.map((anexo) =>
                anexo.caminho ? (
                  <button key={anexo.id} type="button" onClick={() => onAbrirAnexo(anexo)}>
                    <Paperclip size={11} />
                    {anexo.nome}
                  </button>
                ) : (
                  <a key={anexo.id} href={anexo.dados} download={anexo.nome}>
                    <Paperclip size={11} />
                    {anexo.nome}
                  </a>
                ),
              )}
            </div>
          )}
          <footer className="kb-cartao-rodape">
            <span className="kb-cartao-pessoa" title={nomeResponsaveis}>
              {responsaveis.length > 0 && avatar}
              {prazo && <span className="kb-cartao-prazo">{prazo}</span>}
              {alertas.length > 0 && (
                <span className="kb-cartao-alerta" title={`${alertas.length} aviso(s) de prazo`}>
                  <Clock size={11} />
                </span>
              )}
            </span>
            <em className={`kb-selo-prioridade ${tarefa.prioridade}`}>{ROTULO_PRIORIDADE[tarefa.prioridade]}</em>
          </footer>
        </div>
      )}
    </article>
  );
}

function RenomearNoLugar({
  titulo,
  onSalvar,
  onCancelar,
  onAbrirDetalhes,
}: {
  titulo: string;
  onSalvar: (titulo: string) => void;
  onCancelar: () => void;
  onAbrirDetalhes: (titulo: string) => void;
}) {
  const [valor, setValor] = useState(titulo);
  // Evita salvar duas vezes: Enter salva e o blur que vem em seguida também.
  const encerrado = useRef(false);

  function salvar() {
    if (encerrado.current) return;
    encerrado.current = true;
    onSalvar(valor);
  }

  return (
    <div className="kb-renomear">
      <input
        value={valor}
        autoFocus
        aria-label="Título da tarefa"
        onChange={(event) => setValor(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            salvar();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            encerrado.current = true;
            onCancelar();
          }
        }}
        onBlur={salvar}
      />
      <div className="kb-renomear-acoes">
        {/* onMouseDown evita que o blur do campo salve e feche antes do clique. */}
        <button type="button" className="kb-link" onMouseDown={(event) => event.preventDefault()} onClick={() => { encerrado.current = true; onAbrirDetalhes(valor); }}>
          Abrir detalhes
          <ArrowUpRight size={12} />
        </button>
        <button type="button" className="kb-primario" onMouseDown={(event) => event.preventDefault()} onClick={salvar}>
          Salvar
        </button>
      </div>
    </div>
  );
}
