// Lembretes recorrentes: avisos simples que se repetem (toda semana, a cada N
// dias ou todo mês), sem precisar criar uma tarefa no Kanban. Quando chega a
// hora, o lembrete vira um aviso da central (sino + aviso no canto da tela).
//
// Ficam NESTE computador (e no espelho estado_ui.json), não sincronizam com o
// grupo: cada coordenador tem a própria rotina.

export const LEMBRETES_STORAGE_KEY = "coordenacaoop:lembretes:v1";
export const LEMBRETES_UPDATED_EVENT = "coordenacaoop:lembretes-updated";

/** Telas que um lembrete pode abrir ao clicar no aviso. */
export type DestinoLembrete =
  | "importar-aluno-presente"
  | "importar-tarefas"
  | "importar-expansoes"
  | "importar-notas"
  | "atendimentos"
  | "kanban"
  | "backup";

export const DESTINOS_LEMBRETE: { id: DestinoLembrete; rotulo: string }[] = [
  { id: "importar-aluno-presente", rotulo: "Importar Aluno Presente" },
  { id: "importar-tarefas", rotulo: "Importar Tarefas Realizadas" },
  { id: "importar-expansoes", rotulo: "Importar Disciplinas de Expansão" },
  { id: "importar-notas", rotulo: "Importar mapões" },
  { id: "atendimentos", rotulo: "Atendimentos" },
  { id: "kanban", rotulo: "Quadro Kanban" },
  { id: "backup", rotulo: "Configurações › Backup" },
];

export type FrequenciaLembrete =
  /** dias: 0 = domingo … 6 = sábado. */
  | { tipo: "semanal"; dias: number[] }
  /** A cada N dias, contando a partir de `inicio` (AAAA-MM-DD). */
  | { tipo: "intervalo"; cadaDias: number; inicio: string }
  /** Todo mês no dia indicado (meses mais curtos usam o último dia). */
  | { tipo: "mensal"; dia: number };

export type Lembrete = {
  id: string;
  titulo: string;
  texto: string;
  ativo: boolean;
  frequencia: FrequenciaLembrete;
  /** "HH:MM" */
  hora: string;
  destino?: DestinoLembrete;
  /** Id da sugestão pronta que originou este lembrete. */
  sugestao?: string;
  /** Referência para o próximo aviso: só avisa ocorrências depois disto. */
  ativadoEm?: string;
  ultimoAviso?: string;
};

export const NOMES_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const NOMES_DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Sugestões prontas: aparecem desligadas até o usuário ativar. */
export const SUGESTOES_LEMBRETE: Lembrete[] = [
  {
    id: "sug-aluno-presente",
    sugestao: "sug-aluno-presente",
    titulo: "Importar o Aluno Presente",
    texto: "Baixe as planilhas do Aluno Presente no BI e importe para atualizar a frequência da semana.",
    ativo: false,
    frequencia: { tipo: "semanal", dias: [1] },
    hora: "08:00",
    destino: "importar-aluno-presente",
  },
  {
    id: "sug-tarefas",
    sugestao: "sug-tarefas",
    titulo: "Importar as tarefas realizadas",
    texto: "Baixe a planilha de tarefas realizadas e importe para acompanhar quem está entregando.",
    ativo: false,
    frequencia: { tipo: "semanal", dias: [5] },
    hora: "08:00",
    destino: "importar-tarefas",
  },
  {
    id: "sug-expansoes",
    sugestao: "sug-expansoes",
    titulo: "Importar o progresso das Disciplinas de Expansão",
    texto: "Baixe a planilha de progresso da plataforma e importe para ver quem evoluiu e quem está parado.",
    ativo: false,
    frequencia: { tipo: "semanal", dias: [3] },
    hora: "18:00",
    destino: "importar-expansoes",
  },
  {
    id: "sug-kanban",
    sugestao: "sug-kanban",
    titulo: "Revisar as tarefas da semana",
    texto: "Dê uma olhada no Quadro Kanban: o que vence esta semana e o que ficou parado.",
    ativo: false,
    frequencia: { tipo: "semanal", dias: [1] },
    hora: "07:30",
    destino: "kanban",
  },
  {
    id: "sug-familias",
    sugestao: "sug-familias",
    titulo: "Contatar famílias de alunos faltosos",
    texto: "Em Atendimentos › Contatar famílias, monte a fila de quem está com frequência baixa ou tarefas pendentes.",
    ativo: false,
    frequencia: { tipo: "intervalo", cadaDias: 14, inicio: hojeIso() },
    hora: "09:00",
    destino: "atendimentos",
  },
  {
    id: "sug-backup",
    sugestao: "sug-backup",
    titulo: "Fazer o backup do app",
    texto: "Exporte um backup dos dados em Configurações › Backup e guarde fora deste computador.",
    ativo: false,
    frequencia: { tipo: "mensal", dia: 1 },
    hora: "10:00",
    destino: "backup",
  },
];

function carregarSalvos(): Lembrete[] {
  try {
    const bruto = localStorage.getItem(LEMBRETES_STORAGE_KEY);
    const dados = bruto ? (JSON.parse(bruto) as { lembretes?: Lembrete[] }) : {};
    return Array.isArray(dados.lembretes) ? dados.lembretes.filter((l) => l && typeof l.id === "string" && l.frequencia) : [];
  } catch {
    return [];
  }
}

function salvar(lembretes: Lembrete[]) {
  localStorage.setItem(LEMBRETES_STORAGE_KEY, JSON.stringify({ lembretes }));
  window.dispatchEvent(new CustomEvent(LEMBRETES_UPDATED_EVENT));
}

/**
 * Lista para a tela: as sugestões (na versão salva, se o usuário já mexeu
 * nelas) seguidas dos lembretes criados pelo usuário.
 */
export function carregarLembretes(): Lembrete[] {
  const salvos = carregarSalvos();
  const porSugestao = new Map(salvos.filter((l) => l.sugestao).map((l) => [l.sugestao!, l]));
  const sugestoes = SUGESTOES_LEMBRETE.map((s) => porSugestao.get(s.sugestao!) ?? s);
  const proprios = salvos.filter((l) => !l.sugestao || !SUGESTOES_LEMBRETE.some((s) => s.sugestao === l.sugestao));
  return [...sugestoes, ...proprios];
}

let sequencia = 0;
export function novoIdLembrete() {
  sequencia += 1;
  return `lembrete-${Date.now().toString(36)}-${sequencia}`;
}

/**
 * Grava um lembrete (novo ou editado). Mudar a programação ou ligar o lembrete
 * recomeça a contagem a partir de agora, para não avisar na hora uma
 * ocorrência que já passou.
 */
export function salvarLembrete(lembrete: Lembrete) {
  const salvos = carregarSalvos();
  const anterior = salvos.find((l) => l.id === lembrete.id);
  const mudouProgramacao =
    !anterior ||
    anterior.ativo !== lembrete.ativo ||
    anterior.hora !== lembrete.hora ||
    JSON.stringify(anterior.frequencia) !== JSON.stringify(lembrete.frequencia);
  const final: Lembrete = mudouProgramacao && lembrete.ativo ? { ...lembrete, ativadoEm: new Date().toISOString() } : lembrete;
  salvar(anterior ? salvos.map((l) => (l.id === lembrete.id ? final : l)) : [...salvos, final]);
}

/** Remove um lembrete próprio, ou devolve uma sugestão ao padrão (desligada). */
export function removerLembrete(id: string) {
  salvar(carregarSalvos().filter((l) => l.id !== id));
}

function horaMinuto(hora: string): [number, number] {
  const [h, m] = (hora || "08:00").split(":").map((parte) => Number(parte));
  return [Number.isFinite(h) ? h : 8, Number.isFinite(m) ? m : 0];
}

function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(ano, mes + 1, 0).getDate();
}

/** Primeira ocorrência do lembrete estritamente depois de `depoisDe`. */
export function proximaOcorrencia(lembrete: Lembrete, depoisDe: Date): Date | null {
  const [h, m] = horaMinuto(lembrete.hora);
  const f = lembrete.frequencia;
  const ano = depoisDe.getFullYear();
  const mes = depoisDe.getMonth();
  const dia = depoisDe.getDate();

  if (f.tipo === "semanal") {
    const dias = new Set(f.dias);
    if (!dias.size) return null;
    for (let i = 0; i <= 7; i += 1) {
      const candidato = new Date(ano, mes, dia + i, h, m);
      if (dias.has(candidato.getDay()) && candidato > depoisDe) return candidato;
    }
    return null;
  }

  if (f.tipo === "intervalo") {
    const passo = Math.max(1, Math.round(f.cadaDias || 1));
    const [ai, mi, di] = (f.inicio || hojeIso()).split("-").map(Number);
    const inicio = new Date(ai, (mi || 1) - 1, di || 1, h, m);
    if (Number.isNaN(inicio.getTime())) return null;
    if (inicio > depoisDe) return inicio;
    const diasDesde = Math.floor((depoisDe.getTime() - inicio.getTime()) / 86_400_000);
    let k = Math.max(0, Math.floor(diasDesde / passo) - 1);
    for (let tentativas = 0; tentativas < 5; tentativas += 1, k += 1) {
      const candidato = new Date(ai, (mi || 1) - 1, (di || 1) + k * passo, h, m);
      if (candidato > depoisDe) return candidato;
    }
    return null;
  }

  for (let i = 0; i <= 2; i += 1) {
    const alvoAno = new Date(ano, mes + i, 1).getFullYear();
    const alvoMes = new Date(ano, mes + i, 1).getMonth();
    const diaAlvo = Math.min(Math.max(1, f.dia), ultimoDiaDoMes(alvoAno, alvoMes));
    const candidato = new Date(alvoAno, alvoMes, diaAlvo, h, m);
    if (candidato > depoisDe) return candidato;
  }
  return null;
}

function referencia(lembrete: Lembrete) {
  const datas = [lembrete.ativadoEm, lembrete.ultimoAviso]
    .filter((iso): iso is string => Boolean(iso))
    .map((iso) => new Date(iso))
    .filter((data) => !Number.isNaN(data.getTime()));
  if (!datas.length) return new Date();
  return new Date(Math.max(...datas.map((data) => data.getTime())));
}

/** Próximo aviso de um lembrete ligado (para mostrar na tela). */
export function proximoAviso(lembrete: Lembrete): Date | null {
  if (!lembrete.ativo) return null;
  return proximaOcorrencia(lembrete, referencia(lembrete));
}

/**
 * Lembretes ligados cuja hora chegou desde o último aviso. Com o app fechado
 * por vários dias, avisa uma vez só (não empilha as ocorrências perdidas).
 * Marca o aviso como dado e devolve os lembretes que devem virar aviso.
 */
export function lembretesQueVenceram(agora = new Date()): Lembrete[] {
  const salvos = carregarSalvos();
  const vencidos: Lembrete[] = [];
  const atualizados = salvos.map((lembrete) => {
    if (!lembrete.ativo) return lembrete;
    const proxima = proximaOcorrencia(lembrete, referencia(lembrete));
    if (!proxima || proxima > agora) return lembrete;
    vencidos.push(lembrete);
    return { ...lembrete, ultimoAviso: agora.toISOString() };
  });
  if (vencidos.length) salvar(atualizados);
  return vencidos;
}

/** "Toda segunda e quinta, às 08:00", "A cada 14 dias, às 09:00"… */
export function descreverProgramacao(lembrete: Lembrete) {
  const f = lembrete.frequencia;
  const hora = `às ${lembrete.hora}`;
  if (f.tipo === "semanal") {
    const dias = [...f.dias].sort((a, b) => a - b);
    if (dias.length === 7) return `Todos os dias, ${hora}`;
    if (dias.length === 5 && [1, 2, 3, 4, 5].every((d) => dias.includes(d))) return `De segunda a sexta, ${hora}`;
    const nomes = dias.map((d) => NOMES_DIAS[d].toLowerCase());
    const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0] ?? "";
    const toda = dias.length === 1 && (dias[0] === 0 || dias[0] === 6) ? "Todo" : "Toda";
    return lista ? `${toda} ${lista}, ${hora}` : "Nenhum dia escolhido";
  }
  if (f.tipo === "intervalo") {
    return f.cadaDias === 1 ? `Todos os dias, ${hora}` : `A cada ${f.cadaDias} dias, ${hora}`;
  }
  return `Todo dia ${f.dia} do mês, ${hora}`;
}

export function descreverQuando(data: Date) {
  const hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (data.toDateString() === hoje.toDateString()) return `hoje, ${hora}`;
  if (data.toDateString() === amanha.toDateString()) return `amanhã, ${hora}`;
  const diaSemana = NOMES_DIAS_CURTOS[data.getDay()];
  return `${diaSemana}, ${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hora}`;
}
