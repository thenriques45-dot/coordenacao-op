export type NovoAlunoPayload = {
  matricula: string;
  nome: string;
  numero_chamada: number | null;
  ativo: boolean;
  deficiencias: string[];
};

export function normalizarTextoCsv(valor: string) {
  return valor
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[ªᵃ]/g, "a")
    .replace(/[º°]/g, "o")
    .toLocaleUpperCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function extrairNomeSocial(nome: string) {
  return nome.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function dividirLinhaCsv(linha: string) {
  const colunas: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let indice = 0; indice < linha.length; indice += 1) {
    const caractere = linha[indice];
    const proximo = linha[indice + 1];
    if (caractere === '"' && entreAspas && proximo === '"') {
      atual += '"';
      indice += 1;
      continue;
    }
    if (caractere === '"') {
      entreAspas = !entreAspas;
      continue;
    }
    if (caractere === ";" && !entreAspas) {
      colunas.push(atual.trim());
      atual = "";
      continue;
    }
    atual += caractere;
  }
  colunas.push(atual.trim());
  return colunas;
}

export function parseCsvAlunos(texto: string) {
  const linhas = texto.split(/\r?\n/).filter((linha) => linha.trim() !== "");
  const indiceCabecalho = linhas.findIndex((linha) => {
    const colunas = dividirLinhaCsv(linha).map(normalizarTextoCsv);
    return colunas.includes("RA") && colunas.includes("NOME DO ALUNO");
  });
  const cabecalho = indiceCabecalho >= 0 ? dividirLinhaCsv(linhas[indiceCabecalho]) : [];
  if (!cabecalho.length) {
    throw new Error("CSV sem cabeçalho de alunos reconhecível.");
  }
  const mapaCabecalho = new Map(cabecalho.map((coluna, indice) => [normalizarTextoCsv(coluna), indice]));
  const obter = (linha: string[], nome: string) => {
    const indice = mapaCabecalho.get(normalizarTextoCsv(nome));
    return indice === undefined ? "" : (linha[indice] ?? "").trim();
  };
  const colunasDeficiencia = new Set([
    "DEFICIENCIA",
    "DEFICIENCIAS",
    "TIPO DE DEFICIENCIA",
    "NECESSIDADE ESPECIAL",
    "NECESSIDADES ESPECIAIS",
    "NEE",
    "PUBLICO ALVO",
    "PUBLICO ALVO AEE",
  ]);
  const negativos = new Set(["", "NAO", "N", "NAO SE APLICA", "NAO POSSUI", "SEM DEFICIENCIA"]);
  const positivos = new Set(["SIM", "S", "ELEGIVEL", "ALUNO ELEGIVEL"]);

  return linhas.slice(indiceCabecalho + 1).flatMap<NovoAlunoPayload>((linhaTexto) => {
    const linha = dividirLinhaCsv(linhaTexto);
    const ra = obter(linha, "RA");
    const digito = obter(linha, "Dig. RA");
    const nome = extrairNomeSocial(obter(linha, "Nome do Aluno"));
    if (!ra || !nome) return [];
    const chamada = Number.parseInt(obter(linha, "Nº de chamada"), 10);
    const situacao = normalizarTextoCsv(obter(linha, "Situação do Aluno"));
    const deficiencias = cabecalho.flatMap((coluna, indice) => {
      if (!colunasDeficiencia.has(normalizarTextoCsv(coluna))) return [];
      const valor = linha[indice] ?? "";
      const normalizado = normalizarTextoCsv(valor);
      if (negativos.has(normalizado)) return [];
      if (positivos.has(normalizado)) return ["Aluno elegivel"];
      return valor.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
    });

    return [{
      matricula: `${ra}${digito}`,
      nome,
      numero_chamada: Number.isFinite(chamada) ? chamada : null,
      ativo: ["ATIVO", "MATRICULADO", "FREQUENTE"].includes(situacao),
      deficiencias: Array.from(new Set(deficiencias)),
    }];
  });
}
