import {
  chaveData,
  formatarResponsaveisTarefa,
  formatarVinculosTarefa,
  parseDataLocal,
  separarVinculos,
  normalizarTextoGestao,
  type KanbanAnexo,
  type KanbanPrioridade,
  type KanbanStatus,
  type KanbanTarefa,
  type RecurrenceFrequency,
} from "../management";

// Estado do formulário de tarefa, compartilhado pelo compositor rápido e pelo
// painel completo. Os dois leem e escrevem ESTE mesmo objeto — é isso que faz
// "Abrir formulário completo" preservar tudo o que já foi digitado sem copiar
// nada entre formulários.
//
// Responsáveis, vínculos e etiquetas ficam como texto separado por vírgula
// porque é o formato que o VinculosPicker e o salvamento já usam.

export const ALERTAS_TAREFA = [
  { chave: "doisDias", diasAntes: 2, rotulo: "2 dias", rotuloLongo: "2 dias antes" },
  { chave: "umDia", diasAntes: 1, rotulo: "1 dia", rotuloLongo: "1 dia antes" },
  { chave: "noDia", diasAntes: 0, rotulo: "no dia", rotuloLongo: "No dia" },
] as const;

export type AlertasFormulario = Record<(typeof ALERTAS_TAREFA)[number]["chave"], boolean>;

export const alertasFormularioPadrao: AlertasFormulario = {
  doisDias: false,
  umDia: false,
  noDia: false,
};

export type FormularioTarefa = {
  titulo: string;
  descricao: string;
  etiquetas: string;
  responsavel: string;
  dataInicio: string;
  prazo: string;
  prioridade: KanbanPrioridade;
  status: KanbanStatus;
  anexos: KanbanAnexo[];
  eventId: string;
  vinculo: string;
  repetir: "none" | RecurrenceFrequency;
  intervalo: number;
  repetirAte: string;
  compartilhada: boolean;
  alertas: AlertasFormulario;
};

// Texto que o salvamento grava quando a descrição fica vazia. Não pode voltar
// para o campo ao reabrir a tarefa: o compositor mostraria "Sem descrição
// informada" como se o coordenador tivesse escrito isso.
export const DESCRICAO_VAZIA = "Sem descrição informada";

export function formularioVazio(status: KanbanStatus, responsavel = ""): FormularioTarefa {
  return {
    titulo: "",
    descricao: "",
    etiquetas: "",
    responsavel,
    dataInicio: "",
    prazo: "",
    prioridade: "media",
    status,
    anexos: [],
    eventId: "",
    vinculo: "",
    repetir: "none",
    intervalo: 1,
    repetirAte: "",
    compartilhada: false,
    alertas: { ...alertasFormularioPadrao },
  };
}

export function alertasParaFormulario(tarefa: KanbanTarefa | null): AlertasFormulario {
  return ALERTAS_TAREFA.reduce<AlertasFormulario>((resultado, alerta) => {
    resultado[alerta.chave] = Boolean(tarefa?.alertas?.some((item) => item.diasAntes === alerta.diasAntes && item.ativo));
    return resultado;
  }, { ...alertasFormularioPadrao });
}

export function formularioDaTarefa(tarefa: KanbanTarefa): FormularioTarefa {
  return {
    titulo: tarefa.titulo,
    descricao: tarefa.descricao === DESCRICAO_VAZIA ? "" : tarefa.descricao,
    etiquetas: tarefa.etiquetas.join(", "),
    responsavel: formatarResponsaveisTarefa(tarefa),
    dataInicio: tarefa.dataInicio ?? "",
    prazo: tarefa.prazo,
    prioridade: tarefa.prioridade,
    status: tarefa.status,
    anexos: tarefa.anexos ?? [],
    eventId: tarefa.eventId ?? "",
    vinculo: formatarVinculosTarefa(tarefa),
    repetir: tarefa.recorrencia?.frequency ?? "none",
    intervalo: tarefa.recorrencia?.interval ?? 1,
    repetirAte: tarefa.recorrencia?.until ?? "",
    compartilhada: tarefa.compartilhada === true,
    alertas: alertasParaFormulario(tarefa),
  };
}

export function montarAlertasTarefa(alertas: AlertasFormulario, prazo: string, tarefaAnterior?: KanbanTarefa | null) {
  return ALERTAS_TAREFA
    .filter((alerta) => alertas[alerta.chave])
    .map((alerta) => {
      // Mantém o carimbo de disparo só se o prazo não mudou; prazo novo
      // precisa avisar de novo.
      const anterior = tarefaAnterior?.prazo === prazo
        ? tarefaAnterior.alertas?.find((item) => item.diasAntes === alerta.diasAntes)
        : undefined;
      return {
        diasAntes: alerta.diasAntes,
        ativo: true,
        disparadoEm: anterior?.disparadoEm,
      };
    });
}

export function adicionarSugestaoEmLista(texto: string, sugestao: string) {
  const vinculos = separarVinculos(texto);
  const chave = normalizarTextoGestao(sugestao);
  const semAtual = vinculos.filter((item) => normalizarTextoGestao(item) !== chave);
  return [...semAtual, sugestao].join(", ");
}

export function removerDaLista(texto: string, item: string) {
  const chave = normalizarTextoGestao(item);
  return separarVinculos(texto).filter((valor) => normalizarTextoGestao(valor) !== chave).join(", ");
}

export function ultimoItemDigitado(valor: string) {
  const partes = valor.split(/[,;\n]/);
  return partes[partes.length - 1]?.trim() ?? "";
}

// ── Atalhos de prazo ────────────────────────────────────────────────────────
// Recebem "hoje" como parâmetro para serem testáveis sem depender do relógio.

export type AtalhoPrazo = "hoje" | "amanha" | "sexta" | "proximaSemana";

export const ATALHOS_PRAZO: { id: AtalhoPrazo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "amanha", rotulo: "Amanhã" },
  { id: "sexta", rotulo: "Sexta" },
  { id: "proximaSemana", rotulo: "Próxima semana" },
];

export function dataDoAtalho(atalho: AtalhoPrazo, hoje = new Date()): string {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diaSemana = base.getDay(); // 0 = domingo … 5 = sexta
  const deslocamento = (() => {
    switch (atalho) {
      case "hoje":
        return 0;
      case "amanha":
        return 1;
      case "sexta":
        // A sexta desta semana; se já passou (sábado/domingo), a próxima.
        return (5 - diaSemana + 7) % 7;
      case "proximaSemana":
        // Segunda-feira da semana que vem — o começo dela, não "daqui a 7
        // dias", que numa quarta cairia no meio da semana seguinte.
        return ((1 - diaSemana + 7) % 7) || 7;
    }
  })();
  base.setDate(base.getDate() + deslocamento);
  return chaveData(base);
}

// Novo prazo sem deixar um início posterior a ele: um intervalo invertido
// some do calendário em vez de aparecer.
export function aplicarPrazo(form: FormularioTarefa, prazo: string): FormularioTarefa {
  const dataInicio = form.dataInicio && prazo && form.dataInicio > prazo ? "" : form.dataInicio;
  return { ...form, prazo, dataInicio };
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function diaMes(data: string) {
  const d = parseDataLocal(data);
  return { dia: d.getDate(), mes: MESES_CURTOS[d.getMonth()], ano: d.getFullYear() };
}

// "24 jun", "18–24 jun" ou "28 jun–2 jul" para a pastilha de prazo.
export function rotuloPrazo(dataInicio: string, prazo: string): string {
  if (!prazo) return "";
  const fim = diaMes(prazo);
  if (!dataInicio || dataInicio >= prazo) return `${fim.dia} ${fim.mes}`;
  const inicio = diaMes(dataInicio);
  if (inicio.mes === fim.mes && inicio.ano === fim.ano) return `${inicio.dia}–${fim.dia} ${fim.mes}`;
  return `${inicio.dia} ${inicio.mes}–${fim.dia} ${fim.mes}`;
}

// Resumo de uma lista em pastilha: "8º Ano A" ou "8º Ano A +2".
export function rotuloLista(texto: string): string {
  const itens = separarVinculos(texto);
  if (!itens.length) return "";
  return itens.length === 1 ? itens[0] : `${itens[0]} +${itens.length - 1}`;
}

export const atalhoEnviar = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘↵" : "Ctrl ↵";
