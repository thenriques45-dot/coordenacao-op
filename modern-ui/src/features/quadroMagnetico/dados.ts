import { invokeApp, tauriDisponivel } from "../appBridge";

// Quadro magnético: mural pessoal do coordenador. Fica em `pessoal/` (fora
// da sincronização do grupo, dentro do backup). No navegador (sem o app
// desktop), usa o localStorage só para dar para ver a tela.

export type CorQuadro = "amarelo" | "rosa" | "azul" | "verde" | "laranja" | "lilas" | "branco";

export const CORES_QUADRO: { cor: CorQuadro; fundo: string; nome: string }[] = [
  { cor: "amarelo", fundo: "#fff3a3", nome: "Amarelo" },
  { cor: "rosa", fundo: "#f9c4d8", nome: "Rosa" },
  { cor: "azul", fundo: "#bfe6fb", nome: "Azul" },
  { cor: "verde", fundo: "#cfe8b0", nome: "Verde" },
  { cor: "laranja", fundo: "#ffd29a", nome: "Laranja" },
  { cor: "lilas", fundo: "#dcccf5", nome: "Lilás" },
  { cor: "branco", fundo: "#ffffff", nome: "Branco" },
];

export const CORES_LINHA = ["#d93025", "#1a73e8", "#188038", "#f29900", "#5f6368"];

export type ItemLista = { id: string; texto: string; feito: boolean };

export type ArquivoNoQuadro = { arquivoId: string; nome: string; tamanho: number; tipo: string };

export type ItemQuadro = {
  id: string;
  tipo: "nota" | "lista" | "arquivo";
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** Leve inclinação de papel (graus), sorteada ao criar. */
  giro: number;
  cor: CorQuadro;
  titulo: string;
  texto: string;
  etiqueta: string;
  itens?: ItemLista[];
  arquivo?: ArquivoNoQuadro;
  fixado?: boolean;
  arquivado?: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

export type LinhaQuadro = { id: string; de: string; para: string; cor: string; rotulo: string };

export type AparenciaQuadro = {
  fundo: "pontos" | "cortica";
  prendedor: "nenhum" | "tachinha" | "ima";
};

export type Quadro = {
  versao: 1;
  itens: ItemQuadro[];
  linhas: LinhaQuadro[];
  aparencia: AparenciaQuadro;
  zoom: number;
};

export const LARGURA_QUADRO = 3200;
export const ALTURA_QUADRO = 2000;
export const TAMANHO_MIN = { w: 150, h: 110 };
export const TAMANHO_MAX = { w: 640, h: 640 };

const CHAVE_NAVEGADOR = "coordenacaoop:quadro-magnetico:v1";

export function quadroVazio(): Quadro {
  return { versao: 1, itens: [], linhas: [], aparencia: { fundo: "pontos", prendedor: "nenhum" }, zoom: 1 };
}

function normalizar(bruto: unknown): Quadro {
  const base = quadroVazio();
  if (!bruto || typeof bruto !== "object") return base;
  const dados = bruto as Partial<Quadro>;
  return {
    versao: 1,
    itens: Array.isArray(dados.itens) ? dados.itens.filter((item) => item && typeof item.id === "string") : [],
    linhas: Array.isArray(dados.linhas) ? dados.linhas.filter((linha) => linha && typeof linha.de === "string") : [],
    aparencia: {
      fundo: dados.aparencia?.fundo === "cortica" ? "cortica" : "pontos",
      prendedor: dados.aparencia?.prendedor === "tachinha" || dados.aparencia?.prendedor === "ima" ? dados.aparencia.prendedor : "nenhum",
    },
    zoom: typeof dados.zoom === "number" && dados.zoom >= 0.4 && dados.zoom <= 1.6 ? dados.zoom : 1,
  };
}

export async function carregarQuadro(): Promise<Quadro> {
  if (!tauriDisponivel) {
    try {
      return normalizar(JSON.parse(localStorage.getItem(CHAVE_NAVEGADOR) ?? "null"));
    } catch {
      return quadroVazio();
    }
  }
  const texto = await invokeApp<string | null>("carregar_quadro_magnetico");
  return texto ? normalizar(JSON.parse(texto)) : quadroVazio();
}

export async function salvarQuadro(quadro: Quadro) {
  const texto = JSON.stringify(quadro);
  if (!tauriDisponivel) {
    try {
      localStorage.setItem(CHAVE_NAVEGADOR, texto);
    } catch {
      // Sem armazenamento no navegador: a tela segue funcionando.
    }
    return;
  }
  await invokeApp("salvar_quadro_magnetico", { conteudo: texto });
}

export function novoId(prefixo: string) {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function giroAleatorio() {
  return Math.round((Math.random() * 5 - 2.5) * 10) / 10;
}

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function rotuloTipoArquivo(nome: string, tipo: string) {
  const extensao = nome.split(".").pop()?.toUpperCase() ?? "";
  if (tipo.startsWith("image/")) return "IMG";
  return extensao.length && extensao.length <= 4 ? extensao : "ARQ";
}

export function corTipoArquivo(rotulo: string) {
  if (rotulo === "PDF") return "#d93025";
  if (["DOC", "DOCX", "ODT", "RTF", "TXT"].includes(rotulo)) return "#1a73e8";
  if (["XLS", "XLSX", "ODS", "CSV"].includes(rotulo)) return "#188038";
  if (["PPT", "PPTX", "ODP"].includes(rotulo)) return "#e8710a";
  return "#5f6368";
}

/** Área de sobreposição entre dois cartões, em fração do menor. */
export function sobreposicao(a: ItemQuadro, b: ItemQuadro) {
  const largura = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const altura = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (largura <= 0 || altura <= 0) return 0;
  return (largura * altura) / Math.min(a.w * a.h, b.w * b.h);
}

const BORDA = 18;

export function limitarAoQuadro(item: Pick<ItemQuadro, "x" | "y" | "w" | "h">) {
  return {
    x: Math.max(BORDA, Math.min(LARGURA_QUADRO - item.w - BORDA, item.x)),
    y: Math.max(BORDA, Math.min(ALTURA_QUADRO - item.h - BORDA, item.y)),
  };
}

/** Lugar livre mais perto do ponto desejado (procura em espiral), para um
 *  cartão novo não cair em cima de outro. */
export function lugarLivre(desejado: { x: number; y: number; w: number; h: number }, ocupados: ItemQuadro[]) {
  const tenta = (x: number, y: number) => {
    const lugar = { ...desejado, ...limitarAoQuadro({ ...desejado, x, y }) };
    const livre = ocupados.every((outro) => sobreposicao({ ...lugar } as ItemQuadro, outro) < 0.08);
    return livre ? lugar : null;
  };
  const primeiro = tenta(desejado.x, desejado.y);
  if (primeiro) return { x: primeiro.x, y: primeiro.y };
  for (let raio = 60; raio < 1600; raio += 60) {
    for (let angulo = 0; angulo < 360; angulo += 30) {
      const rad = (angulo * Math.PI) / 180;
      const achado = tenta(desejado.x + Math.cos(rad) * raio * 1.4, desejado.y + Math.sin(rad) * raio);
      if (achado) return { x: achado.x, y: achado.y };
    }
  }
  return limitarAoQuadro(desejado);
}

/** Posições em grade para o botão "Arrumar", na ordem atual (de cima para baixo). */
export function arrumarEmGrade(itens: ItemQuadro[], larguraVisivel: number) {
  const visiveis = [...itens].sort((a, b) => a.y - b.y || a.x - b.x);
  const margem = 32;
  const espaco = 28;
  let x = margem;
  let y = margem;
  let alturaLinha = 0;
  const posicoes = new Map<string, { x: number; y: number }>();
  const limite = Math.max(larguraVisivel, 900);
  for (const item of visiveis) {
    if (x + item.w > limite - margem && x > margem) {
      x = margem;
      y += alturaLinha + espaco;
      alturaLinha = 0;
    }
    posicoes.set(item.id, { x, y });
    x += item.w + espaco;
    alturaLinha = Math.max(alturaLinha, item.h);
  }
  return posicoes;
}
