import {
  CALENDARIO_UPDATED_EVENT,
  carregarEventosCalendario,
  carregarTarefasKanban,
  chaveData,
  expandirOcorrencias,
  idsDeConclusao,
  KANBAN_UPDATED_EVENT,
  parseDataLocal,
  tarefaEstaAtiva,
  type KanbanStatus,
  type KanbanTarefa,
} from "./management";
import {
  carregarLembretes,
  CONCLUSAO_EVENT,
  CONCLUSAO_POR_DESTINO,
  lembretesQueVenceram,
  LEMBRETES_UPDATED_EVENT,
  proximoAviso,
  type ChaveConclusao,
  type DestinoLembrete,
  type Lembrete,
} from "./lembretesDados";
import { carregarPreferenciasAvisos } from "./preferenciasAvisos";

// Central de avisos interna: os alertas de prazo das tarefas do Kanban, os
// lembretes recorrentes, os eventos do calendário e os avisos automáticos
// (retornos de atendimento, risco por faltas, tarefa atribuída, resumo do dia)
// viram avisos dentro do app (sino na barra lateral + aviso no canto da tela).
//
// O registro do que já foi avisado fica NESTE computador. Antes ele era gravado
// na própria tarefa (alertas[].disparadoEm), que sincroniza com o grupo — em
// tarefa compartilhada, o primeiro coordenador a abrir o app "consumia" o aviso
// dos outros.

export const AVISOS_STORAGE_KEY = "coordenacaoop:avisos:v1";
export const AVISOS_UPDATED_EVENT = "coordenacaoop:avisos-updated";

const INTERVALO_VERIFICACAO_MS = 30 * 60 * 1000;
// Lembretes e avisos adiados têm hora marcada: conferidos a cada minuto (só lê o localStorage).
const INTERVALO_CURTO_MS = 60 * 1000;
const LIMITE_AVISOS = 80;
// Eventos do calendário: olha até este número de dias à frente.
const JANELA_EVENTOS_DIAS = 31;

export type TipoAviso =
  | "prazo-tarefa"
  | "tarefa-atribuida"
  | "lembrete"
  | "evento"
  | "resumo"
  | "atendimento"
  | "frequencia";

export type CategoriaAviso = "prazos" | "lembretes" | "agenda" | "alunos";

export const CATEGORIAS_AVISO: { id: CategoriaAviso; rotulo: string }[] = [
  { id: "prazos", rotulo: "Tarefas" },
  { id: "lembretes", rotulo: "Lembretes" },
  { id: "agenda", rotulo: "Agenda" },
  { id: "alunos", rotulo: "Alunos" },
];

export function categoriaAviso(tipo: TipoAviso): CategoriaAviso {
  if (tipo === "prazo-tarefa" || tipo === "tarefa-atribuida") return "prazos";
  if (tipo === "lembrete") return "lembretes";
  if (tipo === "evento" || tipo === "resumo") return "agenda";
  return "alunos";
}

export type AvisoApp = {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  texto: string;
  criadoEm: string;
  lidoEm?: string;
  /** Marcado como lido sozinho porque a importação/backup foi feita. */
  resolvidoEm?: string;
  tarefaId?: string;
  lembreteId?: string;
  /** Tela aberta ao clicar no aviso. */
  destino?: DestinoLembrete;
  /** Aviso que voltou depois de adiado. */
  adiado?: boolean;
};

export type AvisoAdiado = { aviso: AvisoApp; ate: string };

type EstadoAvisos = {
  avisos: AvisoApp[];
  // Chaves `tarefa|prazo|diasAntes` dos alertas já avisados. O prazo entra na
  // chave para que mudar a data da tarefa rearme os alertas.
  disparados: string[];
  // Chaves `evento|data|diasAntes` dos eventos do calendário já avisados.
  disparadosEventos: string[];
  adiados: AvisoAdiado[];
  // Marcas dos avisos automáticos: último dia do resumo/retornos, contagem de
  // alunos em risco por turma na última verificação.
  marcas: Record<string, string>;
};

function lista<T>(valor: unknown): T[] {
  return Array.isArray(valor) ? (valor as T[]) : [];
}

function carregarEstado(): EstadoAvisos {
  try {
    const bruto = localStorage.getItem(AVISOS_STORAGE_KEY);
    const estado = bruto ? (JSON.parse(bruto) as Partial<EstadoAvisos>) : {};
    return {
      avisos: lista<AvisoApp>(estado.avisos),
      disparados: lista<string>(estado.disparados),
      disparadosEventos: lista<string>(estado.disparadosEventos),
      adiados: lista<AvisoAdiado>(estado.adiados).filter((item) => item?.aviso && item.ate),
      marcas: estado.marcas && typeof estado.marcas === "object" ? estado.marcas : {},
    };
  } catch {
    return { avisos: [], disparados: [], disparadosEventos: [], adiados: [], marcas: {} };
  }
}

function salvarEstado(estado: EstadoAvisos) {
  localStorage.setItem(AVISOS_STORAGE_KEY, JSON.stringify({ ...estado, avisos: estado.avisos.slice(0, LIMITE_AVISOS) }));
  window.dispatchEvent(new CustomEvent(AVISOS_UPDATED_EVENT));
}

export function carregarAvisos(): AvisoApp[] {
  return carregarEstado().avisos;
}

export function carregarAdiados(): AvisoAdiado[] {
  return carregarEstado().adiados;
}

function atualizarAvisos(transformar: (avisos: AvisoApp[]) => AvisoApp[]) {
  const estado = carregarEstado();
  salvarEstado({ ...estado, avisos: transformar(estado.avisos) });
}

export function marcarAvisoLido(id: string) {
  const agora = new Date().toISOString();
  atualizarAvisos((avisos) => avisos.map((aviso) => (aviso.id === id && !aviso.lidoEm ? { ...aviso, lidoEm: agora } : aviso)));
}

export function marcarTodosAvisosLidos() {
  const agora = new Date().toISOString();
  atualizarAvisos((avisos) => avisos.map((aviso) => (aviso.lidoEm ? aviso : { ...aviso, lidoEm: agora })));
}

export function removerAviso(id: string) {
  atualizarAvisos((avisos) => avisos.filter((aviso) => aviso.id !== id));
}

export function limparAvisosLidos() {
  atualizarAvisos((avisos) => avisos.filter((aviso) => !aviso.lidoEm));
}

/** Tira o aviso da lista e devolve na hora indicada (como novo, não lido). */
export function adiarAviso(id: string, ate: Date) {
  const estado = carregarEstado();
  const aviso = estado.avisos.find((item) => item.id === id);
  if (!aviso) return;
  salvarEstado({
    ...estado,
    avisos: estado.avisos.filter((item) => item.id !== id),
    adiados: [...estado.adiados.filter((item) => item.aviso.id !== id), { aviso, ate: ate.toISOString() }],
  });
}

export function cancelarAdiamento(id: string) {
  const estado = carregarEstado();
  const item = estado.adiados.find((adiado) => adiado.aviso.id === id);
  if (!item) return;
  salvarEstado({
    ...estado,
    adiados: estado.adiados.filter((adiado) => adiado.aviso.id !== id),
    avisos: [{ ...item.aviso, lidoEm: undefined }, ...estado.avisos],
  });
}

/** Opções do botão "Adiar". */
export function opcoesAdiar(agora = new Date()): { rotulo: string; ate: Date }[] {
  const umaHora = new Date(agora.getTime() + 60 * 60 * 1000);
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 8, 0);
  const diasAteSegunda = ((8 - agora.getDay()) % 7) || 7;
  const segunda = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + diasAteSegunda, 8, 0);
  const opcoes = [
    { rotulo: "Daqui a 1 hora", ate: umaHora },
    { rotulo: "Amanhã às 8h", ate: amanha },
  ];
  if (diasAteSegunda > 1) opcoes.push({ rotulo: "Segunda às 8h", ate: segunda });
  return opcoes;
}

function inicioDoDia(data = new Date()) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function diasAte(prazo: Date, hoje: Date) {
  return Math.round((prazo.getTime() - hoje.getTime()) / 86_400_000);
}

// Rotula pelo que falta de fato, não pelo alerta configurado: com o app fechado
// por alguns dias, o alerta "2 dias antes" pode só ser visto na véspera.
function rotuloPrazo(dias: number) {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}

function rotuloEvento(dias: number) {
  if (dias === 0) return "é hoje";
  if (dias === 1) return "é amanhã";
  return `daqui a ${dias} dias`;
}

function chaveDisparo(tarefa: KanbanTarefa, diasAntes: number) {
  return `${tarefa.id}|${tarefa.prazo}|${diasAntes}`;
}

function alertasVencidos(tarefa: KanbanTarefa, hoje: Date, disparados: Set<string>, concluintes: Set<KanbanStatus>) {
  if (!tarefa.prazo || !tarefaEstaAtiva(tarefa, concluintes)) return [];
  const prazo = parseDataLocal(tarefa.prazo);
  if (Number.isNaN(prazo.getTime()) || prazo < hoje) return [];
  const dias = diasAte(prazo, hoje);
  return (tarefa.alertas ?? []).filter(
    (alerta) => alerta.ativo && alerta.diasAntes >= dias && !disparados.has(chaveDisparo(tarefa, alerta.diasAntes)),
  );
}

let sequencia = 0;
function novoId() {
  sequencia += 1;
  return `aviso-${Date.now().toString(36)}-${sequencia}`;
}

function novoAviso(dados: Omit<AvisoApp, "id" | "criadoEm">): AvisoApp {
  return { id: novoId(), criadoEm: new Date().toISOString(), ...dados };
}

/**
 * Põe avisos novos no topo. Um aviso não lido "do mesmo assunto" (mesma
 * tarefa, mesmo lembrete, mesmo tipo automático) é substituído em vez de
 * empilhado.
 */
function mesmoAssunto(a: AvisoApp, b: AvisoApp) {
  if (a.tarefaId || b.tarefaId) return a.tarefaId === b.tarefaId && a.tipo === b.tipo;
  if (a.lembreteId || b.lembreteId) return a.lembreteId === b.lembreteId;
  return a.tipo === b.tipo && a.titulo === b.titulo;
}

function inserirAvisos(avisos: AvisoApp[], novos: AvisoApp[]) {
  const restantes = avisos.filter((aviso) => aviso.lidoEm || !novos.some((novo) => mesmoAssunto(novo, aviso)));
  return [...novos, ...restantes];
}

/**
 * Gera os avisos de prazo que venceram desde a última verificação e devolve
 * só os novos (para o aviso no canto da tela). Também tira da central os
 * avisos não lidos de tarefas que foram concluídas, arquivadas ou excluídas.
 */
export function verificarAvisosPrazo(): AvisoApp[] {
  let tarefas: KanbanTarefa[];
  try {
    tarefas = carregarTarefasKanban();
  } catch {
    return [];
  }
  const estado = carregarEstado();
  const hoje = inicioDoDia();
  const disparados = new Set(estado.disparados);
  // Lido uma vez: o padrão de tarefaEstaAtiva relê as colunas a cada chamada.
  const concluintes = idsDeConclusao();
  const ativas = new Map(tarefas.filter((tarefa) => tarefaEstaAtiva(tarefa, concluintes)).map((tarefa) => [tarefa.id, tarefa]));

  let avisos = estado.avisos.filter((aviso) => aviso.lidoEm || !aviso.tarefaId || ativas.has(aviso.tarefaId));
  const novos: AvisoApp[] = [];

  for (const tarefa of tarefas) {
    const vencidos = alertasVencidos(tarefa, hoje, disparados, concluintes);
    if (!vencidos.length) continue;
    vencidos.forEach((alerta) => disparados.add(chaveDisparo(tarefa, alerta.diasAntes)));
    const aviso = novoAviso({
      tipo: "prazo-tarefa",
      titulo: tarefa.titulo,
      texto: `Prazo da tarefa: ${rotuloPrazo(diasAte(parseDataLocal(tarefa.prazo), hoje))}.`,
      tarefaId: tarefa.id,
    });
    // Um aviso por tarefa: "vence amanhã" substitui o "vence em 2 dias" não lido.
    avisos = inserirAvisos(avisos, [aviso]);
    novos.push(aviso);
  }

  // Sem isto o registro só cresceria: guarda apenas chaves de tarefas que
  // ainda existem com o mesmo prazo.
  const chavesValidas = new Set(
    tarefas.flatMap((tarefa) => (tarefa.alertas ?? []).map((alerta) => chaveDisparo(tarefa, alerta.diasAntes))),
  );
  const proximo: EstadoAvisos = {
    ...estado,
    avisos,
    disparados: [...disparados].filter((chave) => chavesValidas.has(chave)),
  };

  const mudou =
    novos.length > 0 ||
    proximo.avisos.length !== estado.avisos.length ||
    proximo.disparados.length !== estado.disparados.length;
  if (mudou) salvarEstado(proximo);
  return novos;
}

/** Avisos dos eventos do calendário com "Avisar" marcado. */
export function verificarEventosCalendario(): AvisoApp[] {
  if (!carregarPreferenciasAvisos().eventos) return [];
  let eventos;
  try {
    eventos = carregarEventosCalendario();
  } catch {
    return [];
  }
  const estado = carregarEstado();
  const hoje = inicioDoDia();
  const hojeChave = chaveData(hoje);
  const disparados = new Set(estado.disparadosEventos);
  const novos: AvisoApp[] = [];
  const validas = new Set<string>();

  for (const evento of eventos) {
    const avisar = (evento.avisarDiasAntes ?? []).filter((dias) => Number.isFinite(dias) && dias >= 0);
    if (!avisar.length || !evento.data) continue;
    const ocorrencias = expandirOcorrencias(evento.data, evento.recorrencia, JANELA_EVENTOS_DIAS).filter((data) => data >= hojeChave);
    for (const data of ocorrencias) {
      const dias = diasAte(parseDataLocal(data), hoje);
      const devidos = avisar.filter((antes) => antes >= dias);
      devidos.forEach((antes) => validas.add(`${evento.id}|${data}|${antes}`));
      const pendentes = devidos.filter((antes) => !disparados.has(`${evento.id}|${data}|${antes}`));
      if (!pendentes.length) continue;
      pendentes.forEach((antes) => disparados.add(`${evento.id}|${data}|${antes}`));
      const hora = evento.horaInicio ? ` às ${evento.horaInicio}` : "";
      novos.push(
        novoAviso({
          tipo: "evento",
          titulo: evento.titulo,
          texto: `No calendário: ${rotuloEvento(dias)}${hora}${evento.categoria && evento.categoria !== "Geral" ? ` · ${evento.categoria}` : ""}.`,
          destino: "calendario",
        }),
      );
    }
  }

  const disparadosEventos = [...disparados].filter((chave) => validas.has(chave) || chave.split("|")[1] >= hojeChave);
  if (novos.length || disparadosEventos.length !== estado.disparadosEventos.length) {
    salvarEstado({ ...estado, avisos: inserirAvisos(estado.avisos, novos), disparadosEventos });
  }
  return novos;
}

function avisoDeLembrete(lembrete: Lembrete): AvisoApp {
  return novoAviso({
    tipo: "lembrete",
    titulo: lembrete.titulo,
    texto: lembrete.texto || "Lembrete",
    lembreteId: lembrete.id,
    destino: lembrete.destino,
  });
}

function publicar(novos: AvisoApp[]): AvisoApp[] {
  if (!novos.length) return [];
  const estado = carregarEstado();
  salvarEstado({ ...estado, avisos: inserirAvisos(estado.avisos, novos) });
  return novos;
}

/** Gera os avisos dos lembretes cuja hora chegou e devolve os novos. */
export function verificarLembretes(): AvisoApp[] {
  try {
    return publicar(lembretesQueVenceram().map(avisoDeLembrete));
  } catch {
    return [];
  }
}

/** Devolve à lista os avisos adiados cuja hora chegou. */
export function verificarAdiados(agora = new Date()): AvisoApp[] {
  const estado = carregarEstado();
  const voltam = estado.adiados.filter((item) => new Date(item.ate) <= agora);
  if (!voltam.length) return [];
  const novos = voltam.map((item) => ({ ...item.aviso, id: novoId(), criadoEm: agora.toISOString(), lidoEm: undefined, adiado: true }));
  salvarEstado({
    ...estado,
    adiados: estado.adiados.filter((item) => new Date(item.ate) > agora),
    avisos: inserirAvisos(estado.avisos, novos),
  });
  return novos;
}

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/**
 * Resumo do dia, uma vez por dia, na primeira verificação a partir das 6h:
 * tarefas que vencem hoje, eventos de hoje e lembretes marcados para hoje.
 */
export function verificarResumoDoDia(agora = new Date()): AvisoApp[] {
  if (!carregarPreferenciasAvisos().resumoDia || agora.getHours() < 6) return [];
  const estado = carregarEstado();
  const hojeChave = chaveData(agora);
  if (estado.marcas.resumo === hojeChave) return [];

  const partes: string[] = [];
  try {
    const concluintes = idsDeConclusao();
    const tarefas = carregarTarefasKanban().filter((tarefa) => tarefaEstaAtiva(tarefa, concluintes) && tarefa.prazo);
    const hoje = tarefas.filter((tarefa) => tarefa.prazo === hojeChave).length;
    const atrasadas = tarefas.filter((tarefa) => tarefa.prazo < hojeChave).length;
    if (hoje) partes.push(plural(hoje, "tarefa vence hoje", "tarefas vencem hoje"));
    if (atrasadas) partes.push(plural(atrasadas, "tarefa atrasada", "tarefas atrasadas"));
    const eventos = carregarEventosCalendario().filter((evento) =>
      expandirOcorrencias(evento.data, evento.recorrencia, 1).includes(hojeChave) ||
      (evento.dataFim && evento.data <= hojeChave && evento.dataFim >= hojeChave),
    );
    if (eventos.length) {
      const nomes = eventos.slice(0, 2).map((evento) => evento.titulo).join(", ");
      partes.push(`${plural(eventos.length, "evento", "eventos")} no calendário (${nomes}${eventos.length > 2 ? "…" : ""})`);
    }
    const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59);
    const lembretes = carregarLembretes().filter((lembrete) => {
      const proximo = proximoAviso(lembrete);
      return proximo && proximo <= fimDoDia;
    }).length;
    if (lembretes) partes.push(plural(lembretes, "lembrete para hoje", "lembretes para hoje"));
  } catch {
    /* resumo é um extra: sem dados, sem resumo */
  }

  const marcas = { ...estado.marcas, resumo: hojeChave };
  if (!partes.length) {
    salvarEstado({ ...estado, marcas });
    return [];
  }
  const aviso = novoAviso({
    tipo: "resumo",
    titulo: "Seu dia",
    texto: `${partes.join(" · ")}.`,
    destino: "calendario",
  });
  // O resumo de ontem, se não foi lido, sai: só vale o de hoje.
  salvarEstado({ ...estado, marcas, avisos: [aviso, ...estado.avisos.filter((item) => item.tipo !== "resumo" || item.lidoEm)] });
  return [aviso];
}

/** Resumo das turmas que os avisos automáticos de alunos precisam. */
export type TurmaParaAvisos = {
  codigo: string;
  followups_vencidos?: number;
  alunos_risco_faltas?: number;
};

/**
 * Avisos automáticos que dependem dos dados das turmas: retornos de
 * atendimento vencidos (no máximo um por dia) e turmas com MAIS alunos em
 * risco de reprovação por faltas do que na última verificação (a primeira
 * verificação só guarda a contagem). Chamado pelo App sempre que a lista de
 * turmas é recarregada.
 */
export function avisosDasTurmas(turmas: TurmaParaAvisos[], agora = new Date()): AvisoApp[] {
  if (!turmas.length) return [];
  const preferencias = carregarPreferenciasAvisos();
  const estado = carregarEstado();
  const marcas = { ...estado.marcas };
  const novos: AvisoApp[] = [];
  const hojeChave = chaveData(agora);

  const vencidos = turmas.reduce((soma, turma) => soma + (turma.followups_vencidos ?? 0), 0);
  if (preferencias.retornos && vencidos > 0 && marcas.retornos !== hojeChave) {
    marcas.retornos = hojeChave;
    const comVencidos = turmas.filter((turma) => (turma.followups_vencidos ?? 0) > 0).map((turma) => turma.codigo);
    novos.push(
      novoAviso({
        tipo: "atendimento",
        titulo: vencidos === 1 ? "1 retorno de atendimento para fazer" : `${vencidos} retornos de atendimento para fazer`,
        texto: `Follow-up combinado para hoje ou antes em ${comVencidos.slice(0, 4).join(", ")}${comVencidos.length > 4 ? "…" : ""}.`,
        destino: "atendimentos",
      }),
    );
  }

  const contagem: Record<string, number> = Object.fromEntries(turmas.map((turma) => [turma.codigo, turma.alunos_risco_faltas ?? 0]));
  let anterior: Record<string, number> | null = null;
  try {
    anterior = marcas.risco ? (JSON.parse(marcas.risco) as Record<string, number>) : null;
  } catch {
    anterior = null;
  }
  if (anterior && preferencias.riscoFaltas) {
    const aumentos = turmas
      .map((turma) => ({ codigo: turma.codigo, agora: contagem[turma.codigo], antes: anterior![turma.codigo] ?? 0 }))
      .filter((item) => item.agora > item.antes);
    if (aumentos.length) {
      const total = aumentos.reduce((soma, item) => soma + item.agora - item.antes, 0);
      novos.push(
        novoAviso({
          tipo: "frequencia",
          titulo: total === 1 ? "1 aluno a mais em risco por faltas" : `${total} alunos a mais em risco por faltas`,
          texto: `Segundo o Aluno Presente: ${aumentos
            .slice(0, 4)
            .map((item) => `${item.codigo} (${item.agora}, +${item.agora - item.antes})`)
            .join(", ")}${aumentos.length > 4 ? "…" : ""}.`,
          destino: "turmas",
        }),
      );
    }
  }
  marcas.risco = JSON.stringify(contagem);

  const mudouMarcas = JSON.stringify(marcas) !== JSON.stringify(estado.marcas);
  if (novos.length || mudouMarcas) salvarEstado({ ...estado, marcas, avisos: inserirAvisos(estado.avisos, novos) });
  return novos;
}

/** Tarefas compartilhadas que chegaram de um colega atribuídas a você. */
export function avisarTarefasAtribuidas(tarefas: KanbanTarefa[]): AvisoApp[] {
  if (!tarefas.length || !carregarPreferenciasAvisos().tarefasAtribuidas) return [];
  if (tarefas.length > 3) {
    return publicarImediato([
      novoAviso({
        tipo: "tarefa-atribuida",
        titulo: `${tarefas.length} tarefas novas para você`,
        texto: `Colegas passaram para você: ${tarefas.slice(0, 3).map((tarefa) => tarefa.titulo).join(", ")}…`,
        destino: "kanban",
      }),
    ]);
  }
  return publicarImediato(
    tarefas.map((tarefa) =>
      novoAviso({
        tipo: "tarefa-atribuida",
        titulo: tarefa.titulo,
        texto: tarefa.prazo
          ? `Um colega passou esta tarefa para você. Prazo: ${parseDataLocal(tarefa.prazo).toLocaleDateString("pt-BR")}.`
          : "Um colega passou esta tarefa para você.",
        tarefaId: tarefa.id,
      }),
    ),
  );
}

/** Marca como resolvidos os avisos de lembretes cuja importação/backup foi feita. */
function resolverAvisosDaConclusao(chave: ChaveConclusao) {
  const destinos = new Set(
    (Object.entries(CONCLUSAO_POR_DESTINO) as [DestinoLembrete, ChaveConclusao][])
      .filter(([, valor]) => valor === chave)
      .map(([destino]) => destino),
  );
  const agora = new Date().toISOString();
  const estado = carregarEstado();
  let mudou = false;
  const avisos = estado.avisos.map((aviso) => {
    if (aviso.lidoEm || aviso.tipo !== "lembrete" || !aviso.destino || !destinos.has(aviso.destino)) return aviso;
    mudou = true;
    return { ...aviso, lidoEm: agora, resolvidoEm: agora };
  });
  // Adiados do mesmo assunto também deixam de fazer sentido.
  const adiados = estado.adiados.filter((item) => !(item.aviso.tipo === "lembrete" && item.aviso.destino && destinos.has(item.aviso.destino)));
  if (mudou || adiados.length !== estado.adiados.length) salvarEstado({ ...estado, avisos, adiados });
}

const AVISO_IMEDIATO_EVENT = "coordenacaoop:aviso-imediato";

/** Publica e mostra no canto da tela na hora (para quem gera avisos fora do monitor). */
function publicarImediato(novos: AvisoApp[]): AvisoApp[] {
  publicar(novos);
  if (novos.length) window.dispatchEvent(new CustomEvent<AvisoApp[]>(AVISO_IMEDIATO_EVENT, { detail: novos }));
  return novos;
}

/** Mesma coisa para os avisos das turmas, que o App gera ao recarregar a lista. */
export function mostrarAvisos(novos: AvisoApp[]) {
  if (novos.length) window.dispatchEvent(new CustomEvent<AvisoApp[]>(AVISO_IMEDIATO_EVENT, { detail: novos }));
}

/** "Ver como fica": mostra o aviso do lembrete agora, sem mexer na programação. */
export function avisarLembreteAgora(lembrete: Lembrete) {
  publicarImediato([avisoDeLembrete(lembrete)]);
}

/**
 * Verifica tudo ao abrir, a cada 30 min, logo depois de salvar o Kanban ou
 * os lembretes e quando a janela volta da bandeja; lembretes e adiados também
 * a cada minuto. Devolve a função de limpeza.
 */
export function iniciarMonitorAvisos(aoSurgirem: (novos: AvisoApp[]) => void) {
  const entregar = (novos: AvisoApp[]) => {
    if (novos.length) aoSurgirem(novos);
  };
  const seguro = (verificacao: () => AvisoApp[]) => {
    try {
      return verificacao();
    } catch {
      return [];
    }
  };
  const verificarCurto = () => entregar([...seguro(verificarLembretes), ...seguro(verificarAdiados), ...seguro(verificarResumoDoDia)]);
  const verificar = () =>
    entregar([
      ...seguro(verificarAvisosPrazo),
      ...seguro(verificarEventosCalendario),
      ...seguro(verificarLembretes),
      ...seguro(verificarAdiados),
      ...seguro(verificarResumoDoDia),
    ]);
  const aoAvisoImediato = (evento: Event) => entregar((evento as CustomEvent<AvisoApp[]>).detail ?? []);
  const aoConcluir = (evento: Event) => {
    const chave = (evento as CustomEvent<ChaveConclusao>).detail;
    if (chave) resolverAvisosDaConclusao(chave);
  };

  verificar();
  const intervalo = window.setInterval(verificar, INTERVALO_VERIFICACAO_MS);
  const intervaloCurto = window.setInterval(verificarCurto, INTERVALO_CURTO_MS);
  let agendada: number | null = null;
  const verificarAposSalvar = () => {
    if (agendada !== null) window.clearTimeout(agendada);
    agendada = window.setTimeout(() => {
      agendada = null;
      verificar();
    }, 500);
  };
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === "visible") verificar();
  };
  window.addEventListener(KANBAN_UPDATED_EVENT, verificarAposSalvar);
  window.addEventListener(LEMBRETES_UPDATED_EVENT, verificarAposSalvar);
  window.addEventListener(CALENDARIO_UPDATED_EVENT, verificarAposSalvar);
  window.addEventListener(AVISO_IMEDIATO_EVENT, aoAvisoImediato);
  window.addEventListener(CONCLUSAO_EVENT, aoConcluir);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  return () => {
    window.clearInterval(intervalo);
    window.clearInterval(intervaloCurto);
    if (agendada !== null) window.clearTimeout(agendada);
    window.removeEventListener(KANBAN_UPDATED_EVENT, verificarAposSalvar);
    window.removeEventListener(LEMBRETES_UPDATED_EVENT, verificarAposSalvar);
    window.removeEventListener(CALENDARIO_UPDATED_EVENT, verificarAposSalvar);
    window.removeEventListener(AVISO_IMEDIATO_EVENT, aoAvisoImediato);
    window.removeEventListener(CONCLUSAO_EVENT, aoConcluir);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  };
}
