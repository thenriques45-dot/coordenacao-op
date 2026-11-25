import type { ImagemRgba } from "./leitor";

/**
 * Lê o quadro "1º Bimestre … 02/02 a 22/04" do canto do Calendário Escolar da
 * SED. O PDF é só imagem, então os algarismos são reconhecidos comparando cada
 * um com modelos tirados do próprio calendário da SED (a fonte é sempre a mesma).
 */

export type DatasBimestre = { inicio: string; fim: string };

// Modelos 8×12 (tinta de 0 a 9 por quadradinho) e proporção largura/altura.
const MODELOS: Record<string, { tinta: string; proporcao: number }> = {
  "0": { tinta: "027997202899997169723895894005979930049899300499993004999930049889400597697238952899997102799720", proporcao: 0.64 },
  "1": { tinta: "000049990013899935899999999679996410599900005999000059990000599900005999000059990000599900005999", proporcao: 0.43 },
  "2": { tinta: "027998402899999469722698463003990000049700002893000279400038830002872000289655547999999999999999", proporcao: 0.66 },
  "3": { tinta: "026996101799996159623894243007940001387100069920000469610000059646300599696226972899998303799730", proporcao: 0.66 },
  "4": { tinta: "000069500001995000069950004999500186695006825950394059508955797599999999555579750000595000005950", proporcao: 0.71 },
  "5": { tinta: "069999940799999429855552396000005976762069999983696348961200049956200499896237963899998203899620", proporcao: 0.66 },
  "6": { tinta: "016998301699998259832794895001209934530099899961999669959950059889500599597326971799998302699730", proporcao: 0.66 },
  "7": { tinta: "999999999999999955555894000049500001871000059400001881000049500000693000018910000298000003980000", proporcao: 0.64 },
  "8": { tinta: "157997305997798379500796794006963895597215999951598448959940049999300399995005994997799414799741", proporcao: 0.62 },
  "9": { tinta: "148996105999996199623895992005969940079879967999389999990145359723100696796238934999995015998510", proporcao: 0.66 },
};
const GW = 8;
const GH = 12;
const MODELOS_NUM = Object.entries(MODELOS).map(([digito, m]) => ({
  digito,
  proporcao: m.proporcao,
  tinta: Array.from(m.tinta, (c) => Number(c) / 10 + 0.05),
}));

type Mascara = { w: number; h: number; tinta: Uint8Array };

function recortar(img: ImagemRgba, x0: number, y0: number, x1: number, y1: number, limiar: number): Mascara {
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const tinta = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * img.width + (x0 + x)) * 4;
      tinta[y * w + x] = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3 < limiar ? 1 : 0;
    }
  }
  return { w, h, tinta };
}

/** Caracteres da célula, separados pelas colunas sem tinta. */
function caracteres(m: Mascara) {
  const segmentos: { xa: number; xb: number; ya: number; yb: number }[] = [];
  let x = 0;
  const temTinta = (col: number) => {
    for (let y = 0; y < m.h; y++) if (m.tinta[y * m.w + col]) return true;
    return false;
  };
  while (x < m.w) {
    if (!temTinta(x)) {
      x++;
      continue;
    }
    const xa = x;
    while (x < m.w && temTinta(x)) x++;
    if (x - xa <= 1) continue;
    let ya = m.h;
    let yb = -1;
    for (let y = 0; y < m.h; y++) {
      for (let c = xa; c < x; c++) {
        if (m.tinta[y * m.w + c]) {
          ya = Math.min(ya, y);
          yb = Math.max(yb, y);
          break;
        }
      }
    }
    segmentos.push({ xa, xb: x, ya, yb: yb + 1 });
  }
  const alturaMax = Math.max(0, ...segmentos.map((s) => s.yb - s.ya));
  return segmentos.filter((s) => s.yb - s.ya > alturaMax * 0.4);
}

function reconhecerDigito(m: Mascara, s: { xa: number; xb: number; ya: number; yb: number }) {
  const w = s.xb - s.xa;
  const h = s.yb - s.ya;
  const grade: number[] = [];
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const ya = Math.floor((j * h) / GH);
      const yb = Math.max(Math.ceil(((j + 1) * h) / GH), ya + 1);
      const xa = Math.floor((i * w) / GW);
      const xb = Math.max(Math.ceil(((i + 1) * w) / GW), xa + 1);
      let soma = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) soma += m.tinta[(s.ya + y) * m.w + s.xa + x];
      grade.push(soma / ((yb - ya) * (xb - xa)));
    }
  }
  const proporcao = w / h;
  let melhor = { digito: "", pontos: Infinity };
  for (const modelo of MODELOS_NUM) {
    let pontos = 3 * Math.abs(proporcao - modelo.proporcao);
    for (let k = 0; k < grade.length; k++) pontos += Math.abs(grade[k] - modelo.tinta[k]);
    if (pontos < melhor.pontos) melhor = { digito: modelo.digito, pontos };
  }
  // Longe de qualquer algarismo: não é um número (ou a fonte mudou).
  return melhor.pontos < 25 ? melhor.digito : null;
}

function escuro(img: ImagemRgba, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3 < 90;
}

/** Faixas de linhas consecutivas que satisfazem o teste. */
function faixas(total: number, teste: (i: number) => boolean) {
  const lista: [number, number][] = [];
  let inicio = -1;
  for (let i = 0; i <= total; i++) {
    const ok = i < total && teste(i);
    if (ok && inicio < 0) inicio = i;
    if (!ok && inicio >= 0) {
      lista.push([inicio, i]);
      inicio = -1;
    }
  }
  return lista;
}

function dataValida(ano: number, dia: number, mes: number) {
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

function iso(ano: number, dia: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Procura o quadro dos bimestres no alto da primeira página. Devolve os 4
 * períodos, ou null se não achar ou se alguma data não fizer sentido (nesse
 * caso o app simplesmente não sugere as datas).
 */
export function lerBimestres(img: ImagemRgba, ano: number): DatasBimestre[] | null {
  const altura = Math.floor(img.height * 0.15);
  // Linhas horizontais pretas e longas do quadro.
  const linhas = faixas(altura, (y) => {
    let n = 0;
    for (let x = 0; x < img.width; x++) if (escuro(img, x, y)) n++;
    return n > img.width * 0.2;
  });
  if (!linhas.length) return null;
  // Extensão do quadro: o trecho escuro mais longo da linha de cima.
  const yTopo = linhas[0][0] + Math.floor((linhas[0][1] - linhas[0][0]) / 2);
  const trechos = faixas(img.width, (x) => escuro(img, x, yTopo));
  const [ta, tb] = trechos.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), [0, 0]);
  // Folga para os cantos arredondados do quadro.
  const folga = Math.ceil((tb - ta) * 0.05);
  const qa = Math.max(0, ta - folga);
  const qb = Math.min(img.width, tb + folga);
  const resultado: DatasBimestre[] = [];
  for (let k = 0; k + 1 < linhas.length && resultado.length < 4; k++) {
    const ya = linhas[k][1];
    const yb = linhas[k + 1][0];
    if (yb - ya < img.height * 0.006) continue;
    const margem = Math.floor((yb - ya) * 0.15);
    // Divisórias verticais da linha do quadro.
    const verticais = faixas(qb - qa, (dx) => {
      const x = qa + dx;
      let n = 0;
      for (let y = ya + margem; y < yb - margem; y++) if (escuro(img, x, y)) n++;
      return n >= (yb - ya - 2 * margem) * 0.9;
    }).map(([a, b]) => [a + qa, b + qa]);
    // A coluna das datas é a célula entre duas divisórias que tem "dd/mm a dd/mm".
    const recuo = Math.max(2, Math.round((yb - ya) * 0.07));
    let periodo: DatasBimestre | null = null;
    for (let v = 0; v + 1 < verticais.length && !periodo; v++) {
      const mascara = recortar(img, verticais[v][1] + recuo, ya + recuo, verticais[v + 1][0] - recuo, yb - recuo, 128);
      const chars = caracteres(mascara);
      if (chars.length !== 11) continue;
      const ler = (indices: number[]) => {
        const digitos = indices.map((i) => reconhecerDigito(mascara, chars[i]));
        return digitos.every((d) => d !== null) ? Number(digitos.join("")) : NaN;
      };
      const [d1, m1, d2, m2] = [ler([0, 1]), ler([3, 4]), ler([6, 7]), ler([9, 10])];
      if (dataValida(ano, d1, m1) && dataValida(ano, d2, m2)) periodo = { inicio: iso(ano, d1, m1), fim: iso(ano, d2, m2) };
    }
    if (!periodo) return null;
    resultado.push(periodo);
  }
  if (resultado.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    if (resultado[i].fim < resultado[i].inicio) return null;
    if (i && resultado[i].inicio <= resultado[i - 1].fim) return null;
  }
  return resultado;
}
