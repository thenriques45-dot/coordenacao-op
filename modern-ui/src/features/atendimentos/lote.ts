// Vocabulário do passo "Destinatários" (artboard 3a) — campo · operador ·
// valor, sem fórmula. Espelha `atendimentos_lote.rs`.

export type CampoCondicao =
  | "tarefas_pendentes"
  | "frequencia"
  | "media_global"
  | "media_disciplina"
  | "faltas_periodo"
  | "ultimo_contato_familia"
  | "dias_sem_acesso"
  | "expansao_progresso"
  | "tipo_atendimento_anterior"
  | "tag";

export type OperadorCondicao =
  | "maior_que"
  | "menor_que"
  | "entre"
  | "ha_mais_de"
  | "ha_menos_de"
  | "e"
  | "nao_e"
  | "contem";

export type TipoCampo = "numero" | "data" | "texto";

export type Condicao = {
  id: string;
  campo: CampoCondicao;
  operador: OperadorCondicao;
  valor: string;
  valor2?: string;
};

export type AlunoLote = {
  matricula: string;
  nome: string;
  numero_chamada: number | null;
  responsavel_nome: string | null;
  telefone: string | null;
  frequencia: number | null;
  tarefas_pendentes: number | null;
  ultimo_contato_dias: number | null;
  dias_sem_acesso: number | null;
  expansao_progresso: number | null;
  media_global: number | null;
  media_disciplina_min: number | null;
  faltas_periodo: number | null;
  entra: boolean;
  condicoes_atendidas: number;
  sem_telefone: boolean;
};

export const CAMPOS: { valor: CampoCondicao; rotulo: string; tipo: TipoCampo }[] = [
  { valor: "tarefas_pendentes", rotulo: "Tarefas pendentes", tipo: "numero" },
  { valor: "frequencia", rotulo: "Frequência (%)", tipo: "numero" },
  { valor: "media_global", rotulo: "Média global", tipo: "numero" },
  { valor: "media_disciplina", rotulo: "Média por disciplina", tipo: "numero" },
  { valor: "faltas_periodo", rotulo: "Faltas no período", tipo: "numero" },
  { valor: "ultimo_contato_familia", rotulo: "Último contato com a família", tipo: "data" },
  { valor: "dias_sem_acesso", rotulo: "Dias sem acesso à plataforma", tipo: "numero" },
  { valor: "expansao_progresso", rotulo: "Progresso nas Expansões (%)", tipo: "numero" },
  { valor: "tipo_atendimento_anterior", rotulo: "Tipo de atendimento anterior", tipo: "texto" },
  { valor: "tag", rotulo: "Tag", tipo: "texto" },
];

export const OPERADORES: Record<OperadorCondicao, string> = {
  maior_que: "é maior que",
  menor_que: "é menor que",
  entre: "está entre",
  ha_mais_de: "há mais de",
  ha_menos_de: "há menos de",
  e: "é",
  nao_e: "não é",
  contem: "contém",
};

export function operadoresDoTipo(tipo: TipoCampo): OperadorCondicao[] {
  if (tipo === "numero") return ["maior_que", "menor_que", "entre"];
  if (tipo === "data") return ["ha_mais_de", "ha_menos_de"];
  return ["e", "nao_e", "contem"];
}

export function tipoDoCampo(campo: CampoCondicao): TipoCampo {
  return CAMPOS.find((c) => c.valor === campo)?.tipo ?? "numero";
}

export function rotuloCampo(campo: CampoCondicao): string {
  return CAMPOS.find((c) => c.valor === campo)?.rotulo ?? campo;
}

// "Filtros prontos": cada um é um atalho que adiciona uma condição pronta.
// `conta` reproduz a avaliação do backend só para a contagem do chip inativo.
export const PRESETS: {
  id: string;
  rotulo: string;
  condicao: Omit<Condicao, "id">;
  conta: (a: AlunoLote) => boolean;
}[] = [
  {
    id: "tarefa-pendente",
    rotulo: "Com tarefa pendente",
    condicao: { campo: "tarefas_pendentes", operador: "maior_que", valor: "0" },
    conta: (a) => a.tarefas_pendentes != null && a.tarefas_pendentes > 0,
  },
  {
    id: "freq-baixa",
    rotulo: "Frequência abaixo de 75%",
    condicao: { campo: "frequencia", operador: "menor_que", valor: "75" },
    conta: (a) => a.frequencia != null && a.frequencia < 75,
  },
  {
    id: "sem-acesso",
    rotulo: "Sem acesso há 7 dias",
    condicao: { campo: "dias_sem_acesso", operador: "maior_que", valor: "7" },
    conta: (a) => a.dias_sem_acesso != null && a.dias_sem_acesso > 7,
  },
  {
    id: "expansao-atrasada",
    rotulo: "Expansões abaixo de 50%",
    condicao: { campo: "expansao_progresso", operador: "menor_que", valor: "50" },
    conta: (a) => a.expansao_progresso != null && a.expansao_progresso < 50,
  },
  {
    id: "disciplina-baixa",
    rotulo: "Disciplina abaixo da média",
    condicao: { campo: "media_disciplina", operador: "menor_que", valor: "5" },
    conta: (a) => a.media_disciplina_min != null && a.media_disciplina_min < 5,
  },
];

// Entidade "Disparo em lote" (atendimentos_lote.rs). O JSON completo circula
// entre a fila assistida / lote API e o backend.
export type DisparoDestinatario = {
  matricula: string;
  nome: string;
  responsavel_nome: string | null;
  telefone: string | null;
};

export type DisparoFalha = {
  matricula: string;
  destinatario?: string;
  motivo?: string;
  codigo_meta?: number;
};

export type DisparoLote = {
  id: string;
  data_hora: string;
  modelo_id: string;
  modelo_titulo: string;
  canal: string;
  turma: string;
  destinatarios: DisparoDestinatario[];
  enviados: string[];
  pulados: string[];
  falhas: DisparoFalha[];
  posicao_atual: number;
  situacao: string;
  custo: number | null;
  atualizado_em: string;
};

// Uma fila wa.me ainda tem gente a processar tanto quando foi pausada de
// propósito (botão "Pausar"/"Sair e retomar depois") quanto quando o app
// fechou/travou no meio dela — nesse caso a situação salva continua
// "em_progresso" (nunca chega a virar "pausada", que só é gravada por um
// clique explícito). As duas contam como retomável; sem isso, uma fila
// interrompida sem pausar fica presa: a lista de disparos a rotula
// "Concluída" (por já ter algum pulado) e não sobra nenhum jeito de voltar.
export function disparoRetomavel(d: DisparoLote): boolean {
  return d.canal === "wa_me" && (d.situacao === "pausada" || d.situacao === "em_progresso");
}

export type OrdemFila =
  | "urgente"
  | "alfabetica"
  | "menor_frequencia"
  | "contato_antigo"
  | "personalizada";

export const ORDENS: { valor: OrdemFila; rotulo: string }[] = [
  { valor: "urgente", rotulo: "Mais urgente primeiro" },
  { valor: "alfabetica", rotulo: "Alfabética" },
  { valor: "menor_frequencia", rotulo: "Menor frequência" },
  { valor: "contato_antigo", rotulo: "Contato mais antigo" },
  { valor: "personalizada", rotulo: "Personalizada" },
];

// "Mais urgente primeiro" = maior nº de condições atendidas; desempate pela
// menor frequência (definição fechada com a coordenação).
export function ordenarFila(alunos: AlunoLote[], ordem: OrdemFila, personalizada: string[]): AlunoLote[] {
  const arr = [...alunos];
  switch (ordem) {
    case "alfabetica":
      return arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    case "menor_frequencia":
      return arr.sort((a, b) => (a.frequencia ?? 101) - (b.frequencia ?? 101));
    case "contato_antigo":
      return arr.sort((a, b) => (b.ultimo_contato_dias ?? 1e9) - (a.ultimo_contato_dias ?? 1e9));
    case "personalizada": {
      const pos = new Map(personalizada.map((m, i) => [m, i]));
      return arr.sort((a, b) => (pos.get(a.matricula) ?? 1e9) - (pos.get(b.matricula) ?? 1e9));
    }
    default:
      return arr.sort(
        (a, b) =>
          b.condicoes_atendidas - a.condicoes_atendidas ||
          (a.frequencia ?? 101) - (b.frequencia ?? 101),
      );
  }
}

// Cor semântica de um valor numérico (verde/âmbar/vermelho). A cor nunca é o
// único sinal — a UI mostra sempre o número junto.
export function tomFrequencia(f: number | null): "ok" | "atencao" | "critico" | "neutro" {
  if (f == null) return "neutro";
  if (f < 75) return "critico";
  if (f < 80) return "atencao";
  return "ok";
}
