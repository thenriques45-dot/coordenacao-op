import {
  CALENDAR_STORAGE_KEY,
  CALENDARIO_UPDATED_EVENT,
  carregarEventosCalendario,
  type CalendarEvent,
} from "../management";
import { registrarExclusaoSincronizacao } from "../workgroupSync";
import { extrairJpegsDoPdf, lerCalendario, TIPOS_CALENDARIO, type ImagemRgba, type LeituraCalendario, type PeriodoCalendario } from "./leitor";

/** Decodifica um JPEG/PNG com o próprio navegador do app. */
async function decodificarImagem(bytes: Uint8Array, tipo: string): Promise<ImagemRgba> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não consegui abrir a imagem do calendário."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = imagem.naturalWidth;
    canvas.height = imagem.naturalHeight;
    const contexto = canvas.getContext("2d", { willReadFrequently: true });
    if (!contexto) throw new Error("Não consegui ler a imagem do calendário.");
    contexto.drawImage(imagem, 0, 0);
    const dados = contexto.getImageData(0, 0, canvas.width, canvas.height);
    return { width: dados.width, height: dados.height, data: dados.data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lê o PDF (ou uma imagem) do Calendário Escolar da SED. */
export async function lerArquivoCalendario(arquivo: File): Promise<LeituraCalendario> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const ehPdf = arquivo.name.toLowerCase().endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50);
  let paginas: ImagemRgba[];
  if (ehPdf) {
    const jpegs = extrairJpegsDoPdf(bytes);
    if (!jpegs.length) {
      throw new Error("Este PDF não tem o calendário como imagem. Use o PDF baixado em Calendário Escolar, na SED.");
    }
    paginas = [];
    for (const jpeg of jpegs) paginas.push(await decodificarImagem(jpeg, "image/jpeg"));
  } else {
    paginas = [await decodificarImagem(bytes, arquivo.type || "image/png")];
  }
  const anoNoNome = Number(arquivo.name.match(/20\d\d/)?.[0]) || undefined;
  return lerCalendario(paginas, anoNoNome);
}

export const PREFIXO_ID_CALENDARIO_ESCOLAR = "calesc-";

export type EscolhaTipo = { incluir: boolean; avisar: string; nome: string };

/** Chave do tipo na prévia: o código reconhecido, ou a cor da etiqueta desconhecida. */
export function chaveTipo(periodo: PeriodoCalendario) {
  return periodo.codigo ?? periodo.corHex;
}

export function escolhasPadrao(periodos: PeriodoCalendario[]): Record<string, EscolhaTipo> {
  const escolhas: Record<string, EscolhaTipo> = {};
  for (const periodo of periodos) {
    const chave = chaveTipo(periodo);
    if (escolhas[chave]) continue;
    const tipo = periodo.codigo ? TIPOS_CALENDARIO.find((t) => t.codigo === periodo.codigo) : null;
    escolhas[chave] = tipo
      ? { incluir: true, avisar: tipo.avisar, nome: tipo.nome }
      : { incluir: false, avisar: "1", nome: "" };
  }
  return escolhas;
}

/**
 * Grava os períodos escolhidos como eventos do Calendário de Gestão. Os ids
 * são fixos (ano + tipo + início): importar de novo atualiza os mesmos eventos
 * em vez de duplicar, e os eventos do calendário anterior do mesmo ano que
 * não vieram desta vez são removidos (também dos colegas do grupo).
 */
export function gravarCalendarioEscolar(ano: number, periodos: PeriodoCalendario[], escolhas: Record<string, EscolhaTipo>) {
  const agora = new Date().toISOString();
  const prefixoAno = `${PREFIXO_ID_CALENDARIO_ESCOLAR}${ano}-`;
  const existentes = carregarEventosCalendario();
  const anteriores = new Map(existentes.filter((evento) => evento.id.startsWith(prefixoAno)).map((evento) => [evento.id, evento]));

  const novos: CalendarEvent[] = [];
  for (const periodo of periodos) {
    const escolha = escolhas[chaveTipo(periodo)];
    if (!escolha?.incluir || !escolha.nome.trim()) continue;
    const tipo = periodo.codigo ? TIPOS_CALENDARIO.find((t) => t.codigo === periodo.codigo) : null;
    const id = `${prefixoAno}${(periodo.codigo ?? periodo.corHex.slice(1)).toLowerCase()}-${periodo.inicio}`;
    const anterior = anteriores.get(id);
    novos.push({
      id,
      titulo: escolha.nome.trim(),
      descricao: `Calendário escolar ${ano} (SED)${tipo ? ` · ${tipo.sigla}` : ""}${tipo?.semAula ? " · sem aula" : ""}`,
      data: periodo.inicio,
      dataFim: periodo.fim > periodo.inicio ? periodo.fim : undefined,
      horaInicio: "",
      horaFim: "",
      categoria: "Calendário escolar",
      cor: periodo.corHex,
      prioridade: periodo.codigo === "CCL" || periodo.codigo === "RPR" ? "alta" : "media",
      vinculo: "Geral",
      avisarDiasAntes: escolha.avisar ? escolha.avisar.split(",").map(Number).filter((dias) => Number.isFinite(dias)) : undefined,
      createdAt: anterior?.createdAt ?? agora,
      updatedAt: agora,
    });
  }

  const idsNovos = new Set(novos.map((evento) => evento.id));
  const removidos = [...anteriores.keys()].filter((id) => !idsNovos.has(id));
  removidos.forEach((id) => registrarExclusaoSincronizacao("calendarEvent", id));
  const mantidos = existentes.filter((evento) => !evento.id.startsWith(prefixoAno));
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify([...mantidos, ...novos]));
  window.dispatchEvent(new CustomEvent(CALENDARIO_UPDATED_EVENT));
  return {
    adicionados: novos.filter((evento) => !anteriores.has(evento.id)).length,
    atualizados: novos.filter((evento) => anteriores.has(evento.id)).length,
    removidos: removidos.length,
    comAviso: novos.filter((evento) => evento.avisarDiasAntes?.length).length,
  };
}
