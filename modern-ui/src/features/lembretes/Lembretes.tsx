import { AlarmClock, BellRing, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { avisarLembreteAgora } from "../centralAvisosDados";
import {
  carregarLembretes,
  descreverProgramacao,
  descreverQuando,
  DESTINOS_LEMBRETE,
  LEMBRETES_UPDATED_EVENT,
  NOMES_DIAS_CURTOS,
  novoIdLembrete,
  proximoAviso,
  removerLembrete,
  salvarLembrete,
  SUGESTOES_LEMBRETE,
  type DestinoLembrete,
  type FrequenciaLembrete,
  type Lembrete,
} from "../lembretesDados";
import "./lembretes.css";

// Tela "Lembretes": sugestões prontas que só precisam ser ligadas e lembretes
// próprios, com repetição semanal, a cada N dias ou mensal.

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ehSugestao(lembrete: Lembrete) {
  return Boolean(lembrete.sugestao && SUGESTOES_LEMBRETE.some((s) => s.sugestao === lembrete.sugestao));
}

function semInicio(frequencia: FrequenciaLembrete) {
  // A data de início das sugestões "a cada N dias" é o dia em que foram ligadas.
  return JSON.stringify(frequencia.tipo === "intervalo" ? { ...frequencia, inicio: "" } : frequencia);
}

function foiPersonalizada(lembrete: Lembrete) {
  const padrao = SUGESTOES_LEMBRETE.find((s) => s.sugestao === lembrete.sugestao);
  if (!padrao) return false;
  return (
    padrao.titulo !== lembrete.titulo ||
    padrao.texto !== lembrete.texto ||
    padrao.hora !== lembrete.hora ||
    padrao.destino !== lembrete.destino ||
    semInicio(padrao.frequencia) !== semInicio(lembrete.frequencia)
  );
}

export function TelaLembretes() {
  const [lembretes, setLembretes] = useState<Lembrete[]>(carregarLembretes);
  const [editando, setEditando] = useState<Lembrete | null>(null);
  // Recalcula "próximo aviso" de tempos em tempos (a tela pode ficar aberta).
  const [, setRelogio] = useState(0);

  useEffect(() => {
    const recarregar = () => setLembretes(carregarLembretes());
    window.addEventListener(LEMBRETES_UPDATED_EVENT, recarregar);
    const intervalo = window.setInterval(() => setRelogio((n) => n + 1), 60_000);
    return () => {
      window.removeEventListener(LEMBRETES_UPDATED_EVENT, recarregar);
      window.clearInterval(intervalo);
    };
  }, []);

  const sugestoes = lembretes.filter(ehSugestao);
  const proprios = lembretes.filter((l) => !ehSugestao(l));
  const ativos = lembretes.filter((l) => l.ativo).length;

  function alternar(lembrete: Lembrete) {
    salvarLembrete({ ...lembrete, ativo: !lembrete.ativo });
  }

  function novo() {
    setEditando({
      id: novoIdLembrete(),
      titulo: "",
      texto: "",
      ativo: true,
      frequencia: { tipo: "semanal", dias: [new Date().getDay()] },
      hora: "08:00",
    });
  }

  return (
    <section className="lembretes-page">
      <div className="topbar dashboard-topbar">
        <div>
          <h1>Lembretes</h1>
          <p>
            Avisos que se repetem sozinhos, para as coisas de toda semana. Na hora marcada, o lembrete aparece no canto da
            tela e fica no sino da barra lateral.
          </p>
        </div>
        <div className="kanban-top-actions">
          <button type="button" className="primary-action" onClick={novo}>
            <Plus size={17} /> Novo lembrete
          </button>
        </div>
      </div>

      <p className="lembretes-resumo">
        {ativos === 0
          ? "Nenhum lembrete ligado ainda. Ligue uma sugestão abaixo ou crie o seu."
          : `${ativos} lembrete${ativos > 1 ? "s" : ""} ligado${ativos > 1 ? "s" : ""}.`}{" "}
        Os lembretes ficam neste computador e só avisam com o app aberto (ou na bandeja); se ele estiver fechado na hora, o
        aviso aparece quando você abrir.
      </p>

      <h2 className="lembretes-secao">Sugestões prontas</h2>
      <ul className="lembretes-lista">
        {sugestoes.map((lembrete) => (
          <CartaoLembrete
            key={lembrete.id}
            lembrete={lembrete}
            onAlternar={() => alternar(lembrete)}
            onEditar={() => setEditando(lembrete)}
            onRemover={foiPersonalizada(lembrete) || lembrete.ativo ? () => removerLembrete(lembrete.id) : undefined}
            rotuloRemover="Voltar ao padrão (desligado)"
          />
        ))}
      </ul>

      <h2 className="lembretes-secao">Meus lembretes</h2>
      {proprios.length === 0 ? (
        <p className="lembretes-vazio">
          Nenhum lembrete criado por você. Use "Novo lembrete" para qualquer rotina: reunião de ATPC, conferir o diário de
          classe, enviar recados…
        </p>
      ) : (
        <ul className="lembretes-lista">
          {proprios.map((lembrete) => (
            <CartaoLembrete
              key={lembrete.id}
              lembrete={lembrete}
              onAlternar={() => alternar(lembrete)}
              onEditar={() => setEditando(lembrete)}
              onRemover={() => removerLembrete(lembrete.id)}
              rotuloRemover="Excluir lembrete"
            />
          ))}
        </ul>
      )}

      {editando && (
        <EditorLembrete
          inicial={editando}
          novo={!lembretes.some((l) => l.id === editando.id)}
          onCancelar={() => setEditando(null)}
          onSalvar={(lembrete) => {
            salvarLembrete(lembrete);
            setEditando(null);
          }}
        />
      )}
    </section>
  );
}

function CartaoLembrete({
  lembrete,
  onAlternar,
  onEditar,
  onRemover,
  rotuloRemover,
}: {
  lembrete: Lembrete;
  onAlternar: () => void;
  onEditar: () => void;
  onRemover?: () => void;
  rotuloRemover: string;
}) {
  const proximo = proximoAviso(lembrete);
  const destino = DESTINOS_LEMBRETE.find((d) => d.id === lembrete.destino);
  return (
    <li className={`lembrete-cartao ${lembrete.ativo ? "ativo" : ""}`}>
      <label className="lembrete-chave" title={lembrete.ativo ? "Desligar lembrete" : "Ligar lembrete"}>
        <input type="checkbox" checked={lembrete.ativo} onChange={onAlternar} aria-label={`Ligar "${lembrete.titulo}"`} />
        <span aria-hidden />
      </label>
      <div className="lembrete-corpo">
        <strong>{lembrete.titulo}</strong>
        {lembrete.texto && <p>{lembrete.texto}</p>}
        <div className="lembrete-meta">
          <span>
            <AlarmClock size={14} aria-hidden /> {descreverProgramacao(lembrete)}
          </span>
          {proximo && <span className="lembrete-proximo">Próximo aviso: {descreverQuando(proximo)}</span>}
          {destino && <span>Abre: {destino.rotulo}</span>}
        </div>
      </div>
      <div className="lembrete-acoes">
        <button type="button" className="avisos-acao" onClick={onEditar} title="Editar" aria-label="Editar">
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="avisos-acao"
          onClick={() => avisarLembreteAgora(lembrete)}
          title="Ver como fica o aviso"
          aria-label="Ver como fica o aviso"
        >
          <BellRing size={15} />
        </button>
        {onRemover && (
          <button type="button" className="avisos-acao" onClick={onRemover} title={rotuloRemover} aria-label={rotuloRemover}>
            {ehSugestao(lembrete) ? <RotateCcw size={15} /> : <Trash2 size={15} />}
          </button>
        )}
      </div>
    </li>
  );
}

type TipoRepeticao = FrequenciaLembrete["tipo"];

function EditorLembrete({
  inicial,
  novo,
  onCancelar,
  onSalvar,
}: {
  inicial: Lembrete;
  novo: boolean;
  onCancelar: () => void;
  onSalvar: (lembrete: Lembrete) => void;
}) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [texto, setTexto] = useState(inicial.texto);
  const [hora, setHora] = useState(inicial.hora);
  const [destino, setDestino] = useState<DestinoLembrete | "">(inicial.destino ?? "");
  const [tipo, setTipo] = useState<TipoRepeticao>(inicial.frequencia.tipo);
  const [dias, setDias] = useState<number[]>(inicial.frequencia.tipo === "semanal" ? inicial.frequencia.dias : [1]);
  const [cadaDias, setCadaDias] = useState(inicial.frequencia.tipo === "intervalo" ? inicial.frequencia.cadaDias : 14);
  const [inicio, setInicio] = useState(inicial.frequencia.tipo === "intervalo" ? inicial.frequencia.inicio : hojeIso());
  const [diaMes, setDiaMes] = useState(inicial.frequencia.tipo === "mensal" ? inicial.frequencia.dia : 1);
  const [ativo, setAtivo] = useState(novo ? true : inicial.ativo);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onCancelar]);

  const frequencia = useMemo<FrequenciaLembrete>(() => {
    if (tipo === "semanal") return { tipo, dias: [...dias].sort((a, b) => a - b) };
    if (tipo === "intervalo") return { tipo, cadaDias: Math.max(1, Math.min(365, Math.round(cadaDias) || 1)), inicio: inicio || hojeIso() };
    return { tipo, dia: Math.max(1, Math.min(31, Math.round(diaMes) || 1)) };
  }, [tipo, dias, cadaDias, inicio, diaMes]);

  const rascunho: Lembrete = { ...inicial, titulo: titulo.trim(), texto: texto.trim(), hora: hora || "08:00", destino: destino || undefined, frequencia, ativo };
  const erro = !titulo.trim() ? "Dê um título ao lembrete." : tipo === "semanal" && dias.length === 0 ? "Escolha ao menos um dia da semana." : "";

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (erro) return;
    onSalvar(rascunho);
  }

  function alternarDia(dia: number) {
    setDias((atuais) => (atuais.includes(dia) ? atuais.filter((d) => d !== dia) : [...atuais, dia]));
  }

  // Segunda a domingo, como no calendário escolar.
  const ordemDias = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="modal-backdrop">
      <form className="lembrete-editor" onSubmit={enviar}>
        <div className="modal-title-row">
          <div>
            <h2>{novo ? "Novo lembrete" : "Editar lembrete"}</h2>
            <p>{erro ? erro : descreverProgramacao(rascunho)}</p>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="lembrete-editor-corpo">
          <label>
            Título
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Importar o Aluno Presente" autoFocus />
          </label>
          <label>
            Texto do aviso (opcional)
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="O que fazer quando o lembrete aparecer" />
          </label>

          <fieldset>
            <legend>Repetir</legend>
            <div className="lembrete-opcoes-repeticao" role="radiogroup">
              {(
                [
                  ["semanal", "Toda semana"],
                  ["intervalo", "A cada N dias"],
                  ["mensal", "Todo mês"],
                ] as [TipoRepeticao, string][]
              ).map(([id, rotulo]) => (
                <button key={id} type="button" role="radio" aria-checked={tipo === id} className={tipo === id ? "selecionado" : ""} onClick={() => setTipo(id)}>
                  {rotulo}
                </button>
              ))}
            </div>
            {tipo === "semanal" && (
              <div className="lembrete-dias">
                {ordemDias.map((dia) => (
                  <button key={dia} type="button" aria-pressed={dias.includes(dia)} className={dias.includes(dia) ? "selecionado" : ""} onClick={() => alternarDia(dia)}>
                    {NOMES_DIAS_CURTOS[dia]}
                  </button>
                ))}
              </div>
            )}
            {tipo === "intervalo" && (
              <div className="lembrete-linha">
                <label>
                  A cada
                  <span className="lembrete-numero">
                    <input type="number" min={1} max={365} value={cadaDias} onChange={(e) => setCadaDias(Number(e.target.value))} /> dias
                  </span>
                </label>
                <label>
                  A partir de
                  <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </label>
              </div>
            )}
            {tipo === "mensal" && (
              <div className="lembrete-linha">
                <label>
                  No dia
                  <span className="lembrete-numero">
                    <input type="number" min={1} max={31} value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))} /> de cada mês
                  </span>
                </label>
              </div>
            )}
          </fieldset>

          <div className="lembrete-linha">
            <label>
              Horário
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </label>
            <label>
              Ao clicar no aviso, abrir
              <select value={destino} onChange={(e) => setDestino(e.target.value as DestinoLembrete | "")}>
                <option value="">Nada (só lembrar)</option>
                {DESTINOS_LEMBRETE.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="lembrete-ligado">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Lembrete ligado
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="primary-action" disabled={Boolean(erro)}>
            {novo ? "Criar lembrete" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
