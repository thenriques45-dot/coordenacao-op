// Leitor do "Calendário Escolar" da SED em PDF.
//
// O PDF que a SED gera (jsPDF) não tem texto: cada página é uma imagem JPEG
// do calendário. A leitura é feita pela própria imagem:
//   1. tira os JPEGs de dentro do PDF;
//   2. acha as tabelas dos 12 meses pelas linhas cinza (#DDDDDD) das células;
//   3. descobre o ano pelo formato dos meses (em que dia da semana cada um
//      começa e quantas semanas tem);
//   4. em cada célula (dia), acha as etiquetas coloridas e reconhece o código
//      pela cor (e, nas que têm a mesma cor, pelo tamanho do texto).
// O "L" preto (dia letivo comum) não é etiqueta e é ignorado.

import { lerBimestres, type DatasBimestre } from "./bimestres";

export type CodigoCalendario =
  | "F"
  | "RE"
  | "FN"
  | "FE"
  | "FEE"
  | "PTF"
  | "DNL"
  | "RDL"
  | "LS"
  | "ACT"
  | "PL"
  | "REP"
  | "RPG"
  | "SEI"
  | "CCL"
  | "RPM"
  | "RPMN"
  | "RGE"
  | "RCE"
  | "CES"
  | "RPR";

export type TipoCalendario = {
  codigo: CodigoCalendario;
  sigla: string;
  nome: string;
  cor: [number, number, number];
  /** Quantas letras tem a sigla (desempata etiquetas da mesma cor). */
  letras: number;
  /** "Avisar no sino" sugerido (dias antes, separados por vírgula; "" = não avisar). */
  avisar: string;
  /** Dias sem aula (para o texto da prévia). */
  semAula?: boolean;
  /** Período de vários dias: um fim de semana sem etiqueta no meio não o quebra. */
  ponte?: boolean;
};

// Cores medidas no PDF da SED (mediana dos pixels da etiqueta).
export const TIPOS_CALENDARIO: TipoCalendario[] = [
  { codigo: "F", sigla: "F", nome: "Férias docentes", cor: [199, 204, 226], letras: 1, avisar: "7", semAula: true, ponte: true },
  { codigo: "RE", sigla: "RE", nome: "Recesso escolar", cor: [199, 204, 226], letras: 2, avisar: "1", semAula: true, ponte: true },
  { codigo: "FN", sigla: "FN", nome: "Feriado nacional", cor: [153, 223, 163], letras: 2, avisar: "1", semAula: true },
  { codigo: "FE", sigla: "FE", nome: "Feriado / ponto facultativo", cor: [207, 183, 205], letras: 2, avisar: "1", semAula: true },
  { codigo: "FEE", sigla: "FE", nome: "Feriado estadual", cor: [223, 159, 209], letras: 2, avisar: "1", semAula: true },
  { codigo: "PTF", sigla: "PTF", nome: "Ponto facultativo", cor: [225, 226, 228], letras: 3, avisar: "1", semAula: true },
  { codigo: "DNL", sigla: "DNL", nome: "Dia não letivo", cor: [158, 167, 174], letras: 3, avisar: "1", semAula: true },
  { codigo: "RDL", sigla: "RDL", nome: "Reposição de dia letivo", cor: [225, 166, 160], letras: 3, avisar: "1" },
  { codigo: "LS", sigla: "L", nome: "Dia letivo (reposição)", cor: [218, 213, 210], letras: 1, avisar: "1" },
  { codigo: "ACT", sigla: "ACT", nome: "Acolhimento", cor: [171, 172, 202], letras: 3, avisar: "1" },
  { codigo: "PL", sigla: "PL", nome: "Planejamento", cor: [94, 115, 59], letras: 2, avisar: "1" },
  { codigo: "REP", sigla: "REP", nome: "Replanejamento", cor: [174, 246, 74], letras: 3, avisar: "1" },
  { codigo: "RPG", sigla: "RPG", nome: "Reunião pedagógica", cor: [227, 192, 214], letras: 3, avisar: "1" },
  { codigo: "SEI", sigla: "SEI", nome: "Semana de estudos intensivos", cor: [255, 210, 29], letras: 3, avisar: "7,1", ponte: true },
  { codigo: "CCL", sigla: "CCL", nome: "Conselho de classe", cor: [195, 157, 230], letras: 3, avisar: "7,1" },
  { codigo: "RPM", sigla: "RPM", nome: "Reunião da APM", cor: [176, 228, 192], letras: 3, avisar: "1" },
  { codigo: "RPMN", sigla: "RPM", nome: "Reunião da APM (não letivo)", cor: [181, 198, 166], letras: 3, avisar: "1", semAula: true },
  { codigo: "RGE", sigla: "RGE", nome: "Reunião do Grêmio Estudantil", cor: [194, 224, 196], letras: 3, avisar: "" },
  { codigo: "RCE", sigla: "RCE", nome: "Reunião do Conselho de Escola", cor: [170, 189, 219], letras: 3, avisar: "1" },
  { codigo: "CES", sigla: "CES", nome: "Eleição do Conselho de Escola", cor: [2, 67, 125], letras: 3, avisar: "1" },
  { codigo: "RPR", sigla: "RPR", nome: "Reunião de pais/responsáveis", cor: [207, 207, 195], letras: 3, avisar: "7,1" },
];

export type ImagemRgba = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

export type EtiquetaLida = {
  /** AAAA-MM-DD */
  data: string;
  codigo: CodigoCalendario | null;
  /** Cor lida (para mostrar a etiqueta não reconhecida). */
  cor: [number, number, number];
};

export type LeituraCalendario = {
  ano: number;
  /** Quantos dos 24 testes de formato (12 meses × 2) bateram com o ano escolhido. */
  confianca: number;
  etiquetas: EtiquetaLida[];
  /** Quadro dos bimestres do alto da página, quando deu para ler. */
  bimestres: DatasBimestre[] | null;
};

// ---------------------------------------------------------------------------
// PDF → JPEGs

function indiceDe(bytes: Uint8Array, padrao: string, inicio: number) {
  const alvo = Array.from(padrao, (c) => c.charCodeAt(0));
  outer: for (let i = inicio; i <= bytes.length - alvo.length; i += 1) {
    for (let j = 0; j < alvo.length; j += 1) if (bytes[i + j] !== alvo[j]) continue outer;
    return i;
  }
  return -1;
}

/** Os JPEGs embutidos no PDF (streams /DCTDecode), na ordem do arquivo. */
export function extrairJpegsDoPdf(bytes: Uint8Array): Uint8Array[] {
  const imagens: Uint8Array[] = [];
  let pos = 0;
  for (;;) {
    const dct = indiceDe(bytes, "/DCTDecode", pos);
    if (dct < 0) break;
    const inicioStream = indiceDe(bytes, "stream", dct);
    if (inicioStream < 0) break;
    let inicio = inicioStream + "stream".length;
    if (bytes[inicio] === 0x0d) inicio += 1;
    if (bytes[inicio] === 0x0a) inicio += 1;
    const fim = indiceDe(bytes, "endstream", inicio);
    if (fim < 0) break;
    // Termina no último marcador FFD9 antes de "endstream".
    let ultimo = fim;
    while (ultimo > inicio && !(bytes[ultimo - 2] === 0xff && bytes[ultimo - 1] === 0xd9)) ultimo -= 1;
    if (bytes[inicio] === 0xff && bytes[inicio + 1] === 0xd8 && ultimo > inicio) imagens.push(bytes.slice(inicio, ultimo));
    pos = fim + 9;
  }
  return imagens;
}

// ---------------------------------------------------------------------------
// Imagem → etiquetas

type Linha = { y: number; s: number; e: number };
type Celula = { coluna: number; xa: number; xb: number };
type LinhaTabela = { t: number; b: number; celulas: Celula[] };
type Mes = { linhas: LinhaTabela[] };

function criarLeitor(img: ImagemRgba) {
  const { width: W, data } = img;
  const borda = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return Math.abs(data[i] - 221) <= 10 && Math.abs(data[i + 1] - 221) <= 10 && Math.abs(data[i + 2] - 221) <= 10;
  };
  const pixel = (x: number, y: number): [number, number, number] => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { borda, pixel };
}

/** Tabelas de mês de uma página, em ordem de leitura (linha por linha de meses). */
function acharMeses(img: ImagemRgba): Mes[] {
  const { width: W, height: H } = img;
  const { borda } = criarLeitor(img);
  // Trechos horizontais de cinza; os longos (≥ 20% da página) marcam onde as
  // tabelas começam. A última semana do mês pode ter só 1 ou 2 dias, então a
  // linha dela é curta: entra também todo trecho de pelo menos uma célula que
  // começa na borda esquerda de uma tabela.
  const trechos: Linha[] = [];
  for (let y = 0; y < H; y += 1) {
    let x = 0;
    while (x < W) {
      if (borda(x, y)) {
        const s = x;
        while (x < W && borda(x, y)) x += 1;
        if (x - s >= 0.03 * W) trechos.push({ y, s, e: x });
      } else x += 1;
    }
  }
  const inicios: number[] = [];
  for (const t of trechos) {
    if (t.e - t.s >= 0.2 * W && !inicios.some((x) => Math.abs(x - t.s) <= 6)) inicios.push(t.s);
  }
  const linhas = trechos.filter((t) => inicios.some((x) => Math.abs(x - t.s) <= 6));

  // Colunas de meses: linhas que começam no mesmo x.
  const grupos: { x0: number; linhas: Linha[] }[] = [];
  for (const linha of linhas) {
    const grupo = grupos.find((g) => Math.abs(g.x0 - linha.s) <= 6);
    if (grupo) grupo.linhas.push(linha);
    else grupos.push({ x0: linha.s, linhas: [linha] });
  }
  const colunas = grupos.filter((g) => g.linhas.filter((l) => l.e - l.s >= 0.2 * W).length > 20).sort((a, b) => a.x0 - b.x0);

  const mesesPorColuna: Mes[][] = colunas.map((grupo) => {
    const x0 = grupo.x0;
    const x1 = Math.max(...grupo.linhas.map((l) => l.e));
    const faixas: [number, number][] = [];
    for (const { y } of [...grupo.linhas].sort((a, b) => a.y - b.y)) {
      const ultima = faixas[faixas.length - 1];
      if (ultima && y - ultima[1] <= 3) ultima[1] = y;
      else faixas.push([y, y]);
    }
    const larguraColuna = (x1 - x0) / 7;
    const meses: Mes[] = [];
    let atual: (Mes & { ultimaFaixa: number }) | null = null;
    for (let i = 0; i < faixas.length - 1; i += 1) {
      const t = faixas[i][1] + 1;
      const b = faixas[i + 1][0] - 1;
      if (b - t < 20) continue;
      const meio = (t + b) >> 1;
      // Linhas verticais: trechos curtos de cinza no meio da linha que
      // descem por quase toda a altura (texto antialiasado não desce).
      const verticais: [number, number][] = [];
      let x = x0;
      while (x <= x1 + 2 && x < img.width) {
        if (borda(x, meio)) {
          const s = x;
          while (x < img.width && borda(x, meio)) x += 1;
          const largura = x - s;
          if (largura <= 10) {
            const cx = s + (largura >> 1);
            let cinza = 0;
            for (let yy = t; yy < b; yy += 1) if (borda(cx, yy)) cinza += 1;
            if (cinza / (b - t) > 0.9) verticais.push([s, largura]);
          }
        } else x += 1;
      }
      if (verticais.length >= 2) {
        const celulas: Celula[] = [];
        for (let k = 0; k < verticais.length - 1; k += 1) {
          const [s1, l1] = verticais[k];
          const [s2] = verticais[k + 1];
          const cx = (s1 + l1 + s2) / 2;
          celulas.push({ coluna: Math.floor((cx - x0) / larguraColuna), xa: s1 + l1, xb: s2 });
        }
        if (!atual || faixas[i][0] !== atual.ultimaFaixa) {
          atual = { linhas: [], ultimaFaixa: -1 };
          meses.push(atual);
        }
        atual.linhas.push({ t, b, celulas });
        atual.ultimaFaixa = faixas[i + 1][0];
      } else {
        atual = null;
      }
    }
    return meses;
  });

  const ordenados: Mes[] = [];
  const maxLinhas = Math.max(0, ...mesesPorColuna.map((m) => m.length));
  for (let linha = 0; linha < maxLinhas; linha += 1) {
    for (const meses of mesesPorColuna) if (meses[linha]) ordenados.push(meses[linha]);
  }
  return ordenados;
}

function primeiroDiaSemana(ano: number, mes: number) {
  return new Date(ano, mes, 1).getDay();
}

function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes + 1, 0).getDate();
}

function pontuarAno(meses: Mes[], ano: number) {
  let pontos = 0;
  meses.slice(0, 12).forEach((mes, indice) => {
    const inicio = primeiroDiaSemana(ano, indice);
    const semanas = Math.ceil((inicio + diasNoMes(ano, indice)) / 7);
    if (mes.linhas.length === semanas) pontos += 1;
    const primeira = mes.linhas[0]?.celulas.map((c) => c.coluna).sort((a, b) => a - b) ?? [];
    const esperada = Array.from({ length: 7 - inicio }, (_, k) => inicio + k);
    if (primeira.join(",") === esperada.join(",")) pontos += 1;
  });
  return pontos;
}

function mediana(valores: number[]) {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[ordenados.length >> 1];
}

function distanciaCor(a: [number, number, number], b: [number, number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** Reconhece o código pela cor; nas cores repetidas, pelo número de letras. */
export function classificarEtiqueta(cor: [number, number, number], larguraTexto: number): CodigoCalendario | null {
  const candidatos = TIPOS_CALENDARIO.map((tipo) => ({ tipo, d: distanciaCor(cor, tipo.cor) }))
    .filter((c) => c.d <= 40)
    .sort((a, b) => a.d - b.d);
  if (!candidatos.length) return null;
  const melhor = candidatos[0].d;
  const empatados = candidatos.filter((c) => c.d <= melhor + 8);
  if (empatados.length === 1) return empatados[0].tipo.codigo;
  // Mesma cor (ex.: F e RE): 1 letra ocupa pouco da etiqueta.
  const letras = larguraTexto < 0.3 ? 1 : larguraTexto < 0.55 ? 2 : 3;
  const porLetras = empatados.find((c) => c.tipo.letras === letras);
  return (porLetras ?? empatados[0]).tipo.codigo;
}

function lerEtiquetasDaCelula(img: ImagemRgba, linha: LinhaTabela, celula: Celula, alturaEtiqueta: number) {
  const { pixel } = criarLeitor(img);
  const x0 = celula.xa + 3;
  const x1 = celula.xb - 2;
  const y0 = linha.t + 2;
  const y1 = linha.b - 1;
  const w = x1 - x0;
  if (w <= 4 || y1 - y0 <= 4) return [];
  const colorido = (p: [number, number, number]) => {
    const mn = Math.min(p[0], p[1], p[2]);
    const mx = Math.max(p[0], p[1], p[2]);
    return mn < 238 && !(mx < 120 && mx - mn < 25);
  };

  const ehEtiqueta: boolean[] = [];
  for (let y = y0; y < y1; y += 1) {
    let n = 0;
    for (let x = x0; x < x1; x += 1) if (colorido(pixel(x, y))) n += 1;
    ehEtiqueta.push(n / w > 0.35);
  }

  const blocos: [number, number][] = [];
  let i = 0;
  while (i < ehEtiqueta.length) {
    if (!ehEtiqueta[i]) {
      i += 1;
      continue;
    }
    const inicio = i;
    let ultimo = i;
    while (i < ehEtiqueta.length && (ehEtiqueta[i] || i - ultimo <= 6)) {
      if (ehEtiqueta[i]) ultimo = i;
      i += 1;
    }
    if (ultimo - inicio >= 20) blocos.push([y0 + inicio, y0 + ultimo + 1]);
  }

  const resultado: { cor: [number, number, number]; larguraTexto: number }[] = [];
  for (const [inicio, fim] of blocos) {
    // Etiquetas empilhadas (ex.: RPG sobre PTF) encostam uma na outra.
    const n = Math.max(1, Math.round((fim - inicio) / alturaEtiqueta));
    const altura = (fim - inicio) / n;
    for (let k = 0; k < n; k += 1) {
      const a = Math.floor(inicio + k * altura);
      const b = Math.floor(inicio + (k + 1) * altura);
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      const porColuna = new Array(w).fill(0);
      for (let y = a; y < b; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const p = pixel(x, y);
          if (!colorido(p)) continue;
          rs.push(p[0]);
          gs.push(p[1]);
          bs.push(p[2]);
          porColuna[x - x0] += 1;
        }
      }
      if (!rs.length) continue;
      const cor: [number, number, number] = [mediana(rs), mediana(gs), mediana(bs)];
      const colunas = porColuna.map((v, idx) => (v / (b - a) > 0.3 ? idx : -1)).filter((idx) => idx >= 0);
      const bx0 = x0 + Math.min(...colunas);
      const bx1 = x0 + Math.max(...colunas) + 1;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let y = a + 4; y < b - 4; y += 1) {
        for (let x = bx0 + 2; x < bx1 - 2; x += 1) {
          const p = pixel(x, y);
          if (Math.min(p[0], p[1], p[2]) > 235) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
      }
      const larguraTexto = maxX >= minX ? (maxX - minX + 1) / Math.max(1, bx1 - bx0) : 0;
      resultado.push({ cor, larguraTexto });
    }
  }
  return resultado;
}

function chaveDia(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Lê as páginas (imagens) do calendário. `anoSugerido` (ex.: do nome do
 * arquivo) só desempata; o ano vem do formato dos meses.
 */
export function lerCalendario(paginas: ImagemRgba[], anoSugerido?: number): LeituraCalendario {
  const meses: { mes: Mes; img: ImagemRgba }[] = [];
  for (const img of paginas) for (const mes of acharMeses(img)) meses.push({ mes, img });
  if (meses.length < 12) {
    throw new Error(
      meses.length
        ? `Encontrei só ${meses.length} meses no arquivo. Use o PDF do Calendário Escolar da SED com o ano inteiro.`
        : "Não encontrei o calendário neste arquivo. Use o PDF do Calendário Escolar baixado da SED.",
    );
  }
  const doze = meses.slice(0, 12);
  const hoje = new Date().getFullYear();
  const candidatos = Array.from(new Set([anoSugerido, hoje - 1, hoje, hoje + 1, hoje + 2].filter((a): a is number => Boolean(a))));
  let ano = candidatos[0];
  let confianca = -1;
  for (const candidato of candidatos) {
    const pontos = pontuarAno(doze.map((m) => m.mes), candidato) + (candidato === anoSugerido ? 0.5 : 0);
    if (pontos > confianca) {
      confianca = pontos;
      ano = candidato;
    }
  }
  confianca = Math.floor(confianca);

  const etiquetas: EtiquetaLida[] = [];
  doze.forEach(({ mes, img }, indice) => {
    const inicio = primeiroDiaSemana(ano, indice);
    const total = diasNoMes(ano, indice);
    const larguras = mes.linhas.flatMap((l) => l.celulas.map((c) => c.xb - c.xa));
    // A etiqueta tem ~40% da largura da célula de altura.
    const alturaEtiqueta = Math.max(12, mediana(larguras) * 0.41);
    mes.linhas.forEach((linha, r) => {
      for (const celula of linha.celulas) {
        const dia = r * 7 + celula.coluna - inicio + 1;
        if (dia < 1 || dia > total) continue;
        for (const lida of lerEtiquetasDaCelula(img, linha, celula, alturaEtiqueta)) {
          etiquetas.push({ data: chaveDia(ano, indice, dia), codigo: classificarEtiqueta(lida.cor, lida.larguraTexto), cor: lida.cor });
        }
      }
    });
  });
  let bimestres: DatasBimestre[] | null = null;
  for (const img of paginas) {
    bimestres = lerBimestres(img, ano);
    if (bimestres) break;
  }
  return { ano, confianca, etiquetas, bimestres };
}

// ---------------------------------------------------------------------------
// Etiquetas → períodos

export type PeriodoCalendario = {
  codigo: CodigoCalendario | null;
  /** Para etiquetas não reconhecidas: a cor em hex, que identifica o grupo. */
  corHex: string;
  inicio: string;
  fim: string;
};

export function corHex(cor: [number, number, number]) {
  return `#${cor.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function dataLocal(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

/**
 * Junta dias seguidos com o mesmo código num período só (ex.: férias de 02 a
 * 16/01). Nas férias, no recesso e na SEI, um fim de semana sem etiqueta no
 * meio não quebra o período; reuniões em dias separados continuam separadas.
 */
export function agruparPeriodos(etiquetas: EtiquetaLida[]): PeriodoCalendario[] {
  const porGrupo = new Map<string, Set<string>>();
  for (const etiqueta of etiquetas) {
    // Não reconhecidas: agrupa por cor aproximada.
    const chave = etiqueta.codigo ?? `?${corHex(etiqueta.cor.map((v) => Math.min(255, Math.round(v / 12) * 12)) as [number, number, number])}`;
    if (!porGrupo.has(chave)) porGrupo.set(chave, new Set());
    porGrupo.get(chave)!.add(etiqueta.data);
  }
  const periodos: PeriodoCalendario[] = [];
  for (const [chave, dias] of porGrupo) {
    const codigo = chave.startsWith("?") ? null : (chave as CodigoCalendario);
    const tipo = codigo ? TIPOS_CALENDARIO.find((t) => t.codigo === codigo)! : null;
    const hex = tipo ? corHex(tipo.cor) : chave.slice(1);
    const maxPulo = tipo?.ponte ? 3 : 1;
    const ordenados = [...dias].sort();
    let atual: PeriodoCalendario | null = null;
    for (const dia of ordenados) {
      if (atual) {
        const anterior = dataLocal(atual.fim);
        const esta = dataLocal(dia);
        let continua = true;
        for (let d = new Date(anterior.getFullYear(), anterior.getMonth(), anterior.getDate() + 1); d < esta; d.setDate(d.getDate() + 1)) {
          if (d.getDay() !== 0 && d.getDay() !== 6) {
            continua = false;
            break;
          }
        }
        if (continua && Math.round((esta.getTime() - anterior.getTime()) / 86_400_000) <= maxPulo) {
          atual.fim = dia;
          continue;
        }
      }
      atual = { codigo, corHex: hex, inicio: dia, fim: dia };
      periodos.push(atual);
    }
  }
  return periodos.sort((a, b) => a.inicio.localeCompare(b.inicio) || (a.codigo ?? "").localeCompare(b.codigo ?? ""));
}
