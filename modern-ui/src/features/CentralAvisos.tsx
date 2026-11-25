import { AlarmClock, Bell, CalendarClock, CalendarDays, Check, ClipboardList, Clock3, Sun, UserRound, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { invokeApp, tauriDisponivel } from "./appBridge";
import {
  adiarAviso,
  AVISOS_UPDATED_EVENT,
  cancelarAdiamento,
  carregarAdiados,
  carregarAvisos,
  categoriaAviso,
  CATEGORIAS_AVISO,
  iniciarMonitorAvisos,
  limparAvisosLidos,
  marcarAvisoLido,
  marcarTodosAvisosLidos,
  opcoesAdiar,
  removerAviso,
  type AvisoAdiado,
  type AvisoApp,
  type CategoriaAviso,
} from "./centralAvisosDados";
import { CONCLUSAO_POR_DESTINO, registrarConclusao, type DestinoLembrete } from "./lembretesDados";
import { carregarPreferenciasAvisos } from "./preferenciasAvisos";

const DURACAO_FLUTUANTE_MS = 8000;
const MAX_FLUTUANTES = 3;

function IconeAviso({ aviso, size }: { aviso: AvisoApp; size: number }) {
  switch (aviso.tipo) {
    case "lembrete":
      return <AlarmClock size={size} aria-hidden />;
    case "evento":
      return <CalendarDays size={size} aria-hidden />;
    case "resumo":
      return <Sun size={size} aria-hidden />;
    case "tarefa-atribuida":
      return <ClipboardList size={size} aria-hidden />;
    case "atendimento":
      return <UserRound size={size} aria-hidden />;
    case "frequencia":
      return <Users size={size} aria-hidden />;
    default:
      return <CalendarClock size={size} aria-hidden />;
  }
}

/** O que acontece ao clicar num aviso: abre a tarefa ou a tela indicada. */
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

/**
 * "Feito": marca como lido. No lembrete de importação/backup também registra
 * que foi feito, para não repetir antes da próxima vez.
 */
function concluirAviso(aviso: AvisoApp) {
  const chave = aviso.tipo === "lembrete" && aviso.destino ? CONCLUSAO_POR_DESTINO[aviso.destino] : undefined;
  if (chave) registrarConclusao(chave);
  marcarAvisoLido(aviso.id);
}

// Notificação do sistema: só com a preferência ligada e o app fora de foco
// (com a janela à frente, o aviso no canto basta).
function notificarSistema(novos: AvisoApp[]) {
  if (!tauriDisponivel || !novos.length || !carregarPreferenciasAvisos().sistema) return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const enviar = (titulo: string, corpo: string) => invokeApp("enviar_notificacao", { titulo, corpo }).catch(() => {});
  if (novos.length <= 2) {
    novos.forEach((aviso) => enviar(aviso.titulo, aviso.texto));
  } else {
    enviar(`${novos.length} avisos novos`, novos.map((aviso) => aviso.titulo).join(" · "));
  }
}

/** Botão de teste das Configurações dos avisos. Devolve a mensagem de erro, se houver. */
export async function testarNotificacaoSistema(): Promise<string | null> {
  if (!tauriDisponivel) return "Disponível só no aplicativo instalado.";
  try {
    await invokeApp("enviar_notificacao", {
      titulo: "Coordenação OP",
      corpo: "Teste de notificação: se você está vendo isto, os avisos também vão aparecer aqui.",
    });
    return null;
  } catch (erro) {
    return String(erro);
  }
}

/**
 * Estado da central: lista persistida, avisos flutuantes recém-chegados e o
 * monitor. Fica no App (não no sino) porque o sino mora na barra lateral, que
 * some no construtor de relatórios, e o monitor precisa seguir.
 */
export function useCentralAvisos() {
  const [avisos, setAvisos] = useState<AvisoApp[]>(carregarAvisos);
  const [adiados, setAdiados] = useState<AvisoAdiado[]>(carregarAdiados);
  const [flutuantes, setFlutuantes] = useState<AvisoApp[]>([]);

  useEffect(() => {
    const recarregar = () => {
      setAvisos(carregarAvisos());
      setAdiados(carregarAdiados());
    };
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
      notificarSistema(novos);
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
    adiados,
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

function quandoVolta(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (data.toDateString() === hoje.toDateString()) return `hoje, ${hora}`;
  if (data.toDateString() === amanha.toDateString()) return `amanhã, ${hora}`;
  return `${data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}, ${hora}`;
}

type Grupo = { titulo: string; avisos: AvisoApp[] };

function agruparPorData(avisos: AvisoApp[]): Grupo[] {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const inicioSemana = inicioHoje - 6 * 86_400_000;
  const grupos: Grupo[] = [
    { titulo: "Hoje", avisos: [] },
    { titulo: "Últimos 7 dias", avisos: [] },
    { titulo: "Antes", avisos: [] },
  ];
  avisos.forEach((aviso) => {
    const quando = new Date(aviso.criadoEm).getTime();
    grupos[quando >= inicioHoje ? 0 : quando >= inicioSemana ? 1 : 2].avisos.push(aviso);
  });
  return grupos.filter((grupo) => grupo.avisos.length);
}

/** Botão "Adiar" com o menu de opções. */
function BotaoAdiar({ aviso, onAdiado }: { aviso: AvisoApp; onAdiado?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => {
      if (ref.current && !ref.current.contains(evento.target as Node)) setAberto(false);
    };
    window.addEventListener("mousedown", fora);
    return () => window.removeEventListener("mousedown", fora);
  }, [aberto]);

  return (
    <div className="avisos-adiar" ref={ref}>
      <button
        type="button"
        className="avisos-acao"
        onClick={() => setAberto((atual) => !atual)}
        aria-label="Adiar"
        aria-expanded={aberto}
        title="Adiar"
      >
        <Clock3 size={15} />
      </button>
      {aberto && (
        <div className="avisos-adiar-menu" role="menu">
          <strong>Lembrar de novo</strong>
          {opcoesAdiar().map((opcao) => (
            <button
              key={opcao.rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                adiarAviso(aviso.id, opcao.ate);
                setAberto(false);
                onAdiado?.();
              }}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PainelAvisos({
  avisos,
  adiados,
  onFechar,
  onGerenciarLembretes,
  ...acoes
}: {
  avisos: AvisoApp[];
  adiados: AvisoAdiado[];
  onFechar: () => void;
  onGerenciarLembretes: () => void;
} & AcoesAviso) {
  const [filtro, setFiltro] = useState<CategoriaAviso | "todos">("todos");
  const [verAdiados, setVerAdiados] = useState(false);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  const naoLidosPorCategoria = useMemo(() => {
    const contagem: Record<string, number> = {};
    avisos.forEach((aviso) => {
      if (aviso.lidoEm) return;
      const categoria = categoriaAviso(aviso.tipo);
      contagem[categoria] = (contagem[categoria] ?? 0) + 1;
    });
    return contagem;
  }, [avisos]);
  const categoriasPresentes = CATEGORIAS_AVISO.filter((categoria) => avisos.some((aviso) => categoriaAviso(aviso.tipo) === categoria.id));
  const visiveis = filtro === "todos" ? avisos : avisos.filter((aviso) => categoriaAviso(aviso.tipo) === filtro);
  const grupos = agruparPorData(visiveis);
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
              title="Lembretes e configurações dos avisos"
            >
              <AlarmClock size={13} aria-hidden /> Lembretes
            </button>
            {temNaoLidos && (
              <button type="button" className="ghost-action" onClick={marcarTodosAvisosLidos} title="Marcar todos como lidos">
                Marcar lidos
              </button>
            )}
            {temLidos && (
              <button type="button" className="ghost-action" onClick={limparAvisosLidos}>
                Limpar lidos
              </button>
            )}
          </div>
        </header>
        {categoriasPresentes.length > 1 && (
          <nav className="avisos-filtros" aria-label="Filtrar avisos">
            <button type="button" className={filtro === "todos" ? "ativo" : ""} onClick={() => setFiltro("todos")}>
              Todos
            </button>
            {categoriasPresentes.map((categoria) => (
              <button key={categoria.id} type="button" className={filtro === categoria.id ? "ativo" : ""} onClick={() => setFiltro(categoria.id)}>
                {categoria.rotulo}
                {naoLidosPorCategoria[categoria.id] ? <span>{naoLidosPorCategoria[categoria.id]}</span> : null}
              </button>
            ))}
          </nav>
        )}
        {avisos.length === 0 ? (
          <p className="avisos-vazio">
            Nenhum aviso. Prazos do Kanban, eventos do calendário, lembretes e avisos sobre os alunos aparecem aqui. Para
            criar ou ligar lembretes, clique em "Lembretes".
          </p>
        ) : (
          <div className="avisos-rolagem">
            {grupos.map((grupo) => (
              <div key={grupo.titulo} className="avisos-grupo">
                <h3>{grupo.titulo}</h3>
                <ul>
                  {grupo.avisos.map((aviso) => (
                    <li key={aviso.id} className={aviso.lidoEm ? "lido" : ""}>
                      <button type="button" className="avisos-item" onClick={() => abrir(aviso)}>
                        <IconeAviso aviso={aviso} size={16} />
                        <span>
                          <strong>{aviso.titulo}</strong>
                          <small>{aviso.texto}</small>
                          <em>
                            {quandoFoi(aviso.criadoEm)}
                            {aviso.adiado ? " · adiado" : ""}
                            {aviso.resolvidoEm ? " · resolvido: já foi feito" : ""}
                          </em>
                        </span>
                      </button>
                      {!aviso.lidoEm && (
                        <>
                          <button type="button" className="avisos-acao" onClick={() => concluirAviso(aviso)} aria-label="Feito" title="Feito">
                            <Check size={15} />
                          </button>
                          <BotaoAdiar aviso={aviso} />
                        </>
                      )}
                      <button type="button" className="avisos-acao" onClick={() => removerAviso(aviso.id)} aria-label="Remover aviso" title="Remover">
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {grupos.length === 0 && <p className="avisos-vazio">Nenhum aviso deste tipo.</p>}
          </div>
        )}
        {adiados.length > 0 && (
          <footer className="avisos-adiados">
            <button type="button" className="avisos-adiados-toggle" onClick={() => setVerAdiados((atual) => !atual)} aria-expanded={verAdiados}>
              <Clock3 size={14} aria-hidden /> {adiados.length === 1 ? "1 aviso adiado" : `${adiados.length} avisos adiados`}
            </button>
            {verAdiados && (
              <ul>
                {[...adiados]
                  .sort((a, b) => a.ate.localeCompare(b.ate))
                  .map((item) => (
                    <li key={item.aviso.id}>
                      <span>
                        <strong>{item.aviso.titulo}</strong>
                        <small>volta {quandoVolta(item.ate)}</small>
                      </span>
                      <button type="button" className="ghost-action" onClick={() => cancelarAdiamento(item.aviso.id)}>
                        Trazer agora
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </footer>
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
    <div
      className="aviso-flutuante"
      role="status"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
    >
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
      <div className="aviso-flutuante-acoes">
        <button
          type="button"
          className="avisos-acao"
          onClick={() => {
            concluirAviso(aviso);
            onFechar();
          }}
          aria-label="Feito"
          title="Feito"
        >
          <Check size={15} />
        </button>
        <BotaoAdiar aviso={aviso} onAdiado={onFechar} />
        <button type="button" className="avisos-acao" onClick={onFechar} aria-label="Dispensar" title="Dispensar (continua no sino)">
          <X size={15} />
        </button>
      </div>
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
