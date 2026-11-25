import { AlarmClock, Bell, CalendarClock, Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AVISOS_UPDATED_EVENT,
  carregarAvisos,
  iniciarMonitorAvisos,
  limparAvisosLidos,
  marcarAvisoLido,
  marcarTodosAvisosLidos,
  removerAviso,
  type AvisoApp,
} from "./centralAvisosDados";
import type { DestinoLembrete } from "./lembretesDados";

function IconeAviso({ aviso, size }: { aviso: AvisoApp; size: number }) {
  return aviso.tipo === "lembrete" ? <AlarmClock size={size} aria-hidden /> : <CalendarClock size={size} aria-hidden />;
}

/** O que acontece ao clicar num aviso: abre a tarefa ou a tela do lembrete. */
export type AcoesAviso = {
  onAbrirTarefa: (tarefaId: string) => void;
  onAbrirDestino: (destino: DestinoLembrete) => void;
};

function abrirAlvo(aviso: AvisoApp, acoes: AcoesAviso) {
  if (aviso.tarefaId) {
    acoes.onAbrirTarefa(aviso.tarefaId);
    return true;
  }
  if (aviso.destino) {
    acoes.onAbrirDestino(aviso.destino);
    return true;
  }
  return false;
}

const DURACAO_FLUTUANTE_MS = 8000;
const MAX_FLUTUANTES = 3;

/**
 * Estado da central: lista persistida, avisos flutuantes recém-chegados e o
 * monitor de prazos. Fica no App (não no sino) porque o sino mora na barra
 * lateral, que some no construtor de relatórios, e o monitor precisa seguir.
 */
export function useCentralAvisos() {
  const [avisos, setAvisos] = useState<AvisoApp[]>(carregarAvisos);
  const [flutuantes, setFlutuantes] = useState<AvisoApp[]>([]);

  useEffect(() => {
    const recarregar = () => setAvisos(carregarAvisos());
    window.addEventListener(AVISOS_UPDATED_EVENT, recarregar);
    // Com a janela na bandeja, o aviso do canto sumiria antes de alguém ver:
    // guarda e mostra quando a janela voltar (no sino ele já está).
    let pendentes: AvisoApp[] = [];
    const mostrar = (novos: AvisoApp[]) => setFlutuantes((atuais) => [...novos, ...atuais].slice(0, MAX_FLUTUANTES));
    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || !pendentes.length) return;
      mostrar(pendentes);
      pendentes = [];
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const parar = iniciarMonitorAvisos((novos) => {
      if (document.visibilityState === "hidden") pendentes = [...novos, ...pendentes].slice(0, MAX_FLUTUANTES);
      else mostrar(novos);
    });
    return () => {
      window.removeEventListener(AVISOS_UPDATED_EVENT, recarregar);
      document.removeEventListener("visibilitychange", aoVoltar);
      parar();
    };
  }, []);

  function fecharFlutuante(id: string) {
    setFlutuantes((atuais) => atuais.filter((aviso) => aviso.id !== id));
  }

  return {
    avisos,
    naoLidos: avisos.filter((aviso) => !aviso.lidoEm).length,
    flutuantes,
    fecharFlutuante,
  };
}

export function SinoAvisos({ naoLidos, aberto, onAlternar }: { naoLidos: number; aberto: boolean; onAlternar: () => void }) {
  const rotulo = naoLidos > 0 ? `Avisos (${naoLidos} não lido${naoLidos > 1 ? "s" : ""})` : "Avisos";
  return (
    <button
      className={`theme-toggle sino-avisos ${aberto ? "aberto" : ""}`}
      type="button"
      onClick={onAlternar}
      aria-label={rotulo}
      aria-expanded={aberto}
      title={rotulo}
    >
      <Bell size={18} />
      {naoLidos > 0 && <span className="sino-avisos-contador">{naoLidos > 9 ? "9+" : naoLidos}</span>}
    </button>
  );
}

function quandoFoi(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (data.toDateString() === hoje.toDateString()) return `hoje, ${hora}`;
  if (data.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function PainelAvisos({
  avisos,
  onFechar,
  onGerenciarLembretes,
  ...acoes
}: {
  avisos: AvisoApp[];
  onFechar: () => void;
  onGerenciarLembretes: () => void;
} & AcoesAviso) {
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  const temNaoLidos = avisos.some((aviso) => !aviso.lidoEm);
  const temLidos = avisos.some((aviso) => aviso.lidoEm);

  function abrir(aviso: AvisoApp) {
    marcarAvisoLido(aviso.id);
    if (abrirAlvo(aviso, acoes)) onFechar();
  }

  return (
    <>
      <button className="avisos-fundo" type="button" aria-label="Fechar avisos" onClick={onFechar} />
      <section className="avisos-painel" role="dialog" aria-label="Avisos">
        <header>
          <strong>Avisos</strong>
          <div>
            <button
              type="button"
              className="ghost-action"
              onClick={() => {
                onGerenciarLembretes();
                onFechar();
              }}
              title="Lembretes recorrentes"
            >
              <AlarmClock size={13} aria-hidden /> Lembretes
            </button>
            {temNaoLidos && (
              <button type="button" className="ghost-action" onClick={marcarTodosAvisosLidos}>
                Marcar todos como lidos
              </button>
            )}
            {temLidos && (
              <button type="button" className="ghost-action" onClick={limparAvisosLidos}>
                Limpar lidos
              </button>
            )}
          </div>
        </header>
        {avisos.length === 0 ? (
          <p className="avisos-vazio">
            Nenhum aviso. Os avisos de prazo das tarefas do Kanban e os seus lembretes aparecem aqui. Para criar ou ativar um lembrete, clique em "Lembretes".
          </p>
        ) : (
          <ul>
            {avisos.map((aviso) => (
              <li key={aviso.id} className={aviso.lidoEm ? "lido" : ""}>
                <button type="button" className="avisos-item" onClick={() => abrir(aviso)}>
                  <IconeAviso aviso={aviso} size={16} />
                  <span>
                    <strong>{aviso.titulo}</strong>
                    <small>{aviso.texto}</small>
                    <em>{quandoFoi(aviso.criadoEm)}</em>
                  </span>
                </button>
                {!aviso.lidoEm && (
                  <button
                    type="button"
                    className="avisos-acao"
                    onClick={() => marcarAvisoLido(aviso.id)}
                    aria-label="Marcar como lido"
                    title="Marcar como lido"
                  >
                    <Check size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="avisos-acao"
                  onClick={() => removerAviso(aviso.id)}
                  aria-label="Remover aviso"
                  title="Remover"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AvisoFlutuante({
  aviso,
  onFechar,
  ...acoes
}: {
  aviso: AvisoApp;
  onFechar: () => void;
} & AcoesAviso) {
  const [pausado, setPausado] = useState(false);
  // Em ref para o temporizador não reiniciar a cada render do pai (o
  // onFechar chega como função nova sempre que outro aviso some).
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    if (pausado) return;
    const temporizador = window.setTimeout(() => fecharRef.current(), DURACAO_FLUTUANTE_MS);
    return () => window.clearTimeout(temporizador);
  }, [pausado]);

  return (
    <div className="aviso-flutuante" role="status" onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}>
      <button
        type="button"
        className="avisos-item"
        onClick={() => {
          marcarAvisoLido(aviso.id);
          abrirAlvo(aviso, acoes);
          onFechar();
        }}
      >
        <IconeAviso aviso={aviso} size={18} />
        <span>
          <strong>{aviso.titulo}</strong>
          <small>{aviso.texto}</small>
        </span>
      </button>
      <button type="button" className="avisos-acao" onClick={onFechar} aria-label="Dispensar" title="Dispensar">
        <X size={15} />
      </button>
    </div>
  );
}

// Dispensar o flutuante não marca como lido: o aviso continua no sino.
export function AvisosFlutuantes({
  avisos,
  onFechar,
  ...acoes
}: {
  avisos: AvisoApp[];
  onFechar: (id: string) => void;
} & AcoesAviso) {
  if (!avisos.length) return null;
  return (
    <div className="avisos-flutuantes">
      {avisos.map((aviso) => (
        <AvisoFlutuante key={aviso.id} aviso={aviso} onFechar={() => onFechar(aviso.id)} {...acoes} />
      ))}
    </div>
  );
}
