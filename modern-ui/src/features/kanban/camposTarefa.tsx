import { Paperclip, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { tauriDisponivel } from "../appBridge";
import {
  filtrarSugestoesFuzzy,
  normalizarTextoGestao,
  separarVinculos,
  type KanbanAnexo,
  type KanbanColuna,
} from "../management";
import {
  ALERTAS_TAREFA,
  adicionarSugestaoEmLista,
  removerDaLista,
  type AlertasFormulario,
  type FormularioTarefa,
} from "./formularioTarefa";
import { estiloCorColuna } from "./quadro";

// Ações de anexo vêm do quadro: elas precisam do invokeApp e do diálogo de
// arquivo do Tauri, e reportam erro na faixa de avisos do quadro.
export type AcoesAnexos = {
  selecionar: () => void;
  adicionarArquivos: (arquivos: FileList | null) => void;
  adicionarCaminhos: (caminhos: string[]) => void;
  remover: (id: string) => void;
};

export function PastilhaColuna({ coluna }: { coluna?: KanbanColuna }) {
  if (!coluna) return null;
  return (
    <span className="kb-pastilha-coluna">
      <i className="kb-cor-coluna" style={estiloCorColuna(coluna.cor)} />
      {coluna.titulo}
    </span>
  );
}

export function AlternarCompartilhar({
  ativo,
  onAlternar,
  comDica = false,
}: {
  ativo: boolean;
  onAlternar: () => void;
  comDica?: boolean;
}) {
  return (
    <button type="button" className="kb-compartilhar" role="switch" aria-checked={ativo} onClick={onAlternar}>
      <span className={`kb-interruptor ${ativo ? "ligado" : ""}`} aria-hidden="true">
        <i />
      </span>
      <span className="kb-compartilhar-texto">
        <strong>Compartilhar com o grupo</strong>
        {comDica && <small>{ativo ? "Visível para os outros coordenadores" : "Fica só nesta instalação"}</small>}
      </span>
    </button>
  );
}

export function SeletorAvisos({
  alertas,
  onAlternar,
  longo = false,
}: {
  alertas: AlertasFormulario;
  onAlternar: (chave: keyof AlertasFormulario) => void;
  longo?: boolean;
}) {
  return (
    <div className={`kb-avisos ${longo ? "longo" : ""}`}>
      {ALERTAS_TAREFA.map((alerta) => (
        <button
          key={alerta.chave}
          type="button"
          className={alertas[alerta.chave] ? "selecionado" : ""}
          aria-pressed={alertas[alerta.chave]}
          onClick={() => onAlternar(alerta.chave)}
        >
          {longo ? alerta.rotuloLongo : alerta.rotulo}
        </button>
      ))}
    </div>
  );
}

export function CampoRecorrencia({
  form,
  onChange,
  comDica = false,
}: {
  form: FormularioTarefa;
  onChange: (mudanca: Partial<FormularioTarefa>) => void;
  comDica?: boolean;
}) {
  return (
    <div className="kb-recorrencia">
      <select
        value={form.repetir}
        onChange={(event) => onChange({ repetir: event.target.value as FormularioTarefa["repetir"] })}
        aria-label="Repetição"
      >
        <option value="none">Não repetir</option>
        <option value="daily">Diariamente</option>
        <option value="weekly">Semanalmente</option>
        <option value="monthly">Mensalmente</option>
        <option value="yearly">Anualmente</option>
      </select>
      {form.repetir === "none" ? (
        comDica && <span className="kb-dica">intervalo e limite aparecem ao escolher</span>
      ) : (
        <>
          <label className="kb-inline">
            a cada
            <input
              type="number"
              min={1}
              value={form.intervalo}
              onChange={(event) => onChange({ intervalo: Number(event.target.value) })}
            />
          </label>
          <label className="kb-inline">
            até
            <input type="date" value={form.repetirAte} onChange={(event) => onChange({ repetirAte: event.target.value })} />
          </label>
        </>
      )}
    </div>
  );
}

// Etiquetas como chips removíveis + campo de adicionar. Com usadasAntes,
// lista as etiquetas já usadas no quadro para um clique (painel completo).
export function CampoEtiquetas({
  valor,
  sugestoes,
  onChange,
  usadasAntes = false,
  autoFocus = false,
}: {
  valor: string;
  sugestoes: string[];
  onChange: (valor: string) => void;
  usadasAntes?: boolean;
  autoFocus?: boolean;
}) {
  const [digitando, setDigitando] = useState("");
  const [editando, setEditando] = useState(autoFocus);
  const selecionadas = separarVinculos(valor);
  const disponiveis = sugestoes.filter(
    (item) => !selecionadas.some((etiqueta) => normalizarTextoGestao(etiqueta) === normalizarTextoGestao(item)),
  );
  const filtradas = filtrarSugestoesFuzzy(disponiveis, digitando, 6);

  function adicionar(etiqueta: string) {
    const limpa = etiqueta.trim();
    if (limpa) onChange(adicionarSugestaoEmLista(valor, limpa));
    setDigitando("");
  }

  return (
    <div className="kb-etiquetas">
      <div className="kb-chips">
        {selecionadas.map((etiqueta) => (
          <span key={etiqueta} className="kb-chip">
            {etiqueta}
            <button type="button" onClick={() => onChange(removerDaLista(valor, etiqueta))} aria-label={`Remover ${etiqueta}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        {editando ? (
          <input
            className="kb-chip-input"
            value={digitando}
            placeholder="nova etiqueta"
            autoFocus
            onChange={(event) => setDigitando(event.target.value)}
            onKeyDown={(event) => {
              // Enter aqui adiciona a etiqueta; não pode enviar o formulário.
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                event.stopPropagation();
                adicionar(digitando);
              }
            }}
            onBlur={() => {
              adicionar(digitando);
              setEditando(false);
            }}
          />
        ) : (
          <button type="button" className="kb-chip-adicionar" onClick={() => setEditando(true)}>
            <Plus size={12} />
            etiqueta
          </button>
        )}
      </div>
      {filtradas.length > 0 && (
        <div className="kb-sugestoes">
          {filtradas.map((item) => (
            <button key={item} type="button" onMouseDown={(event) => { event.preventDefault(); adicionar(item); }}>
              {item}
            </button>
          ))}
        </div>
      )}
      {usadasAntes && disponiveis.length > 0 && (
        <div className="kb-usadas-antes">
          <span>Usadas antes</span>
          <div className="kb-sugestoes">
            {disponiveis.slice(0, 12).map((item) => (
              <button key={item} type="button" onClick={() => adicionar(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Área de anexos com "solte arquivos ou clique".
//
// No app desktop o soltar NÃO chega pelos eventos HTML de drop: o Tauri está
// com o arrastar-e-soltar nativo ligado (padrão) e intercepta arquivos vindos
// do sistema, entregando só os caminhos pelo evento da webview. Por isso o
// soltar é escutado ali e filtrado pela posição do cursor sobre a área. No
// navegador (fora do Tauri), vale o input de arquivo normal.
export function ZonaAnexos({
  anexos,
  acoes,
  destacar = false,
}: {
  anexos: KanbanAnexo[];
  acoes: AcoesAnexos;
  destacar?: boolean;
}) {
  const zona = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState(false);
  // Ref para o listener (inscrito uma vez) sempre chamar a versão atual.
  const adicionarCaminhos = useRef(acoes.adicionarCaminhos);
  adicionarCaminhos.current = acoes.adicionarCaminhos;

  useEffect(() => {
    if (!tauriDisponivel) return;
    let cancelado = false;
    let desinscrever: (() => void) | undefined;

    function dentroDaZona(posicao: { x: number; y: number }) {
      const area = zona.current?.getBoundingClientRect();
      if (!area) return false;
      // O Tauri entrega a posição em pixels físicos; o layout é em pixels CSS.
      const x = posicao.x / window.devicePixelRatio;
      const y = posicao.y / window.devicePixelRatio;
      return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
    }

    getCurrentWebview()
      .onDragDropEvent((evento) => {
        const dados = evento.payload;
        if (dados.type === "leave") {
          setSobre(false);
          return;
        }
        const dentro = dentroDaZona(dados.position);
        if (dados.type === "drop") {
          setSobre(false);
          if (dentro && dados.paths.length) adicionarCaminhos.current(dados.paths);
          return;
        }
        setSobre(dentro);
      })
      .then((fn) => {
        if (cancelado) fn();
        else desinscrever = fn;
      })
      .catch(() => {});

    return () => {
      cancelado = true;
      desinscrever?.();
    };
  }, []);

  const conteudo = (
    <>
      <Paperclip size={15} />
      <strong>Solte arquivos ou clique</strong>
    </>
  );

  return (
    <div className="kb-anexos">
      <div ref={zona} className={`kb-zona-anexos ${sobre ? "sobre" : ""} ${destacar ? "destacar" : ""}`}>
        {tauriDisponivel ? (
          <button type="button" onClick={acoes.selecionar}>
            {conteudo}
          </button>
        ) : (
          <label>
            {conteudo}
            <input type="file" multiple onChange={(event) => acoes.adicionarArquivos(event.target.files)} />
          </label>
        )}
      </div>
      {anexos.length > 0 && (
        <ul className="kb-lista-anexos">
          {anexos.map((anexo) => (
            <li key={anexo.id}>
              <Paperclip size={13} />
              <span>{anexo.nome}</span>
              <button type="button" onClick={() => acoes.remover(anexo.id)} aria-label={`Remover ${anexo.nome}`}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
