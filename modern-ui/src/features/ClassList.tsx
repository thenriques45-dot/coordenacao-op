import { ClipboardList, Pencil, Plus, Search, Trash2, Upload, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { normalizarTextoCsv, parseCsvAlunos, type NovoAlunoPayload } from "./studentsCsv";

const CICLOS_TURMA: Record<string, string[]> = {
  EI: ["Berçário I", "Berçário II", "Maternal I", "Maternal II", "Pré-escola I", "Pré-escola II"],
  EFAI: ["1º Ano", "2º Ano", "3º Ano", "4º Ano", "5º Ano"],
  EFAF: ["6º Ano", "7º Ano", "8º Ano", "9º Ano"],
  EM: ["1ª Série", "2ª Série", "3ª Série"],
};

const PERIODOS_TURMA = ["MANHA", "TARDE", "NOITE", "INTEGRAL (9 HORAS)", "INTEGRAL (7 HORAS)"];

type TurmaResumo = {
  codigo: string;
  ano: number;
  serie: string | null;
  sala: string | null;
  periodo: string | null;
  ciclo: string | null;
  coordenador_turma: string | null;
  lider_sala: string | null;
  vice_lider_sala: string | null;
  total_alunos: number;
  alunos_ativos: number;
  alunos_elegiveis: number;
  nomes_alunos: string[];
  conselhos_com_ajustes: number;
  conselho_finalizado: boolean;
  caminho: string;
};

type NovaTurmaPayload = {
  codigo: string;
  ano: number;
  serie: string;
  sala: string;
  periodo: string;
  ciclo: string;
  alunos: NovoAlunoPayload[];
  substituir_alunos?: boolean;
};

function normalizarBusca(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Chave compacta da turma: primeiro n\u00famero + \u00faltima letra. Ex.: "6\u00ba Ano B" -> "6b",
// "1\u00aa S\u00e9rie F" -> "1f". Permite buscar por "6b" e achar o card do 6\u00ba Ano B.
function chaveCompactaTurma(valor: string) {
  const norm = normalizarBusca(valor);
  const num = norm.match(/\d+/)?.[0] ?? "";
  const letras = norm.replace(/[^a-z]/g, "");
  const ultima = letras ? letras[letras.length - 1] : "";
  return num + ultima;
}

function filtrarTurmas(turmas: TurmaResumo[], busca: string) {
  const termo = normalizarBusca(busca);
  if (!termo) return turmas;
  const termoCompacto = chaveCompactaTurma(busca);
  return turmas.filter((turma) => {
    if (termoCompacto && chaveCompactaTurma(turma.codigo) === termoCompacto) return true;
    const campos = [
      turma.codigo,
      turma.serie ?? "",
      turma.sala ?? "",
      turma.periodo ?? "",
      turma.ciclo ?? "",
      turma.coordenador_turma ?? "",
      turma.lider_sala ?? "",
      turma.vice_lider_sala ?? "",
      ...(turma.nomes_alunos ?? []),
    ];
    return campos.some((campo) => normalizarBusca(campo).includes(termo));
  });
}

function rotuloSerie(valor?: string | null) {
  if (!valor) return "";
  return valor
    .replace(/\b([1-3])\s*a\s+serie\b/gi, "$1ª Série")
    .replace(/\b([1-9])\s*o\s+ano\b/gi, "$1º Ano")
    .replace(/\bpre-escola\b/gi, "Pré-escola")
    .replace(/\bbercario\b/gi, "Berçário")
    .replace(/\bserie\b/gi, "Série")
    .replace(/\bano\b/gi, "Ano");
}

function rotuloTurma(turma: TurmaResumo) {
  const serie = rotuloSerie(turma.serie);
  const codigo = turma.codigo ?? "";
  if (!serie) return codigo;
  if (normalizarTextoCsv(codigo).startsWith(normalizarTextoCsv(turma.serie ?? ""))) {
    const resto = codigo.slice(turma.serie?.length ?? 0).trim();
    return `${serie} ${resto}`.trim();
  }
  return rotuloSerie(codigo) || codigo;
}

function rotuloCiclo(ciclo: string) {
  const rotulos: Record<string, string> = {
    EI: "Educação Infantil",
    EFAI: "Anos iniciais",
    EFAF: "Anos finais",
    EM: "Ensino médio",
    "Sem ciclo": "Sem ciclo",
  };
  return rotulos[ciclo] ?? ciclo;
}

function rotuloLideranca(lideranca: "lider" | "vice" | null | undefined) {
  if (lideranca === "lider") return "Líder";
  if (lideranca === "vice") return "Vice líder";
  return "Não";
}

function codigoTurma(serie: string, letra: string) {
  return `${serie} ${letra.trim().toLocaleUpperCase("pt-BR")}`.trim();
}

function letraUnica(valor: string) {
  const normalizada = normalizarTextoCsv(valor).replace(/[^A-Z]/g, "");
  return normalizada.length === 1 ? normalizada : "";
}

function gerarLetrasIntervalo(inicio: string, fim: string) {
  const letraInicio = letraUnica(inicio);
  const letraFim = letraUnica(fim);
  if (!letraInicio || !letraFim) return [];
  const codigoInicio = letraInicio.charCodeAt(0);
  const codigoFim = letraFim.charCodeAt(0);
  if (codigoFim < codigoInicio) return [];
  return Array.from({ length: codigoFim - codigoInicio + 1 }, (_, indice) => String.fromCharCode(codigoInicio + indice));
}

function nomeBaseCsv(nome: string) {
  const semExtensao = nome.replace(/\.csv$/i, "");
  const normalizado = normalizarTextoCsv(semExtensao).replace(/[^A-Z]/g, "");
  return normalizado.length === 1 ? normalizado : "";
}

function salaLote(salaInicial: string, indice: number) {
  const texto = salaInicial.trim();
  if (!texto) return "";
  const numero = Number.parseInt(texto, 10);
  if (!Number.isFinite(numero)) return texto;
  return String(numero + indice).padStart(texto.length, "0");
}

function assinaturaCsvAlunos(alunos: NovoAlunoPayload[]) {
  return alunos
    .map((aluno) => [normalizarTextoCsv(aluno.matricula), normalizarTextoCsv(aluno.nome), String(aluno.numero_chamada ?? "")].join("|"))
    .sort()
    .join("\n");
}

function chaveConflitoSala(valor: string | null | undefined) {
  return normalizarTextoCsv(valor ?? "").replace(/[\s_-]/g, "");
}

function encontrarConflitoSala(turmas: TurmaResumo[], ano: number, periodo: string, sala: string, caminhoIgnorado?: string | null) {
  const salaNormalizada = chaveConflitoSala(sala);
  const periodoNormalizado = normalizarTextoCsv(periodo);
  if (!salaNormalizada || !periodoNormalizado) return null;
  return turmas.find((turma) => {
    if (caminhoIgnorado && turma.caminho === caminhoIgnorado) return false;
    return turma.ano === ano && normalizarTextoCsv(turma.periodo ?? "") === periodoNormalizado && chaveConflitoSala(turma.sala) === salaNormalizada;
  }) ?? null;
}

function letraTurma(turma: TurmaResumo) {
  const codigoNormalizado = normalizarTextoCsv(turma.codigo);
  const serieNormalizada = normalizarTextoCsv(turma.serie ?? "");
  const resto = serieNormalizada && codigoNormalizado.startsWith(serieNormalizada)
    ? codigoNormalizado.slice(serieNormalizada.length).trim()
    : codigoNormalizado.split(" ").pop() ?? "A";
  return resto || "A";
}

function mesmaSerie(a: string, b: string) {
  return normalizarTextoCsv(a) === normalizarTextoCsv(b);
}
export function Turmas({
  turmas,
  erroTurmas,
  onSelecionar,
  onCriarTurma,
  onEditarTurma,
  onExcluirTurma,
}: {
  turmas: TurmaResumo[];
  erroTurmas: string;
  onSelecionar: (turma: TurmaResumo) => void;
  onCriarTurma: (payload: NovaTurmaPayload) => Promise<void>;
  onEditarTurma: (turma: TurmaResumo, payload: NovaTurmaPayload) => Promise<void>;
  onExcluirTurma: (turma: TurmaResumo) => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [cicloFiltro, setCicloFiltro] = useState("todos");
  const [criando, setCriando] = useState(false);
  const [modoCriacao, setModoCriacao] = useState<"individual" | "lote">("individual");
  const [turmaEditando, setTurmaEditando] = useState<TurmaResumo | null>(null);
  const [turmaExcluindo, setTurmaExcluindo] = useState<TurmaResumo | null>(null);
  const [ciclo, setCiclo] = useState("EM");
  const [serie, setSerie] = useState(CICLOS_TURMA.EM[0]);
  const [letra, setLetra] = useState("A");
  const [letraFinal, setLetraFinal] = useState("G");
  const [sala, setSala] = useState("");
  const [periodo, setPeriodo] = useState(PERIODOS_TURMA[0]);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [arquivoNome, setArquivoNome] = useState("");
  const [alunosCsv, setAlunosCsv] = useState<NovoAlunoPayload[]>([]);
  const [csvsLote, setCsvsLote] = useState<Record<string, { nome: string; alunos: NovoAlunoPayload[] }>>({});
  const [substituirLista, setSubstituirLista] = useState(false);
  const [erroCriacao, setErroCriacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const ciclosDisponiveis = useMemo(() => {
    const ciclosCadastrados = turmas.map((turma) => turma.ciclo || "Sem ciclo");
    const ciclos = Array.from(new Set(ciclosCadastrados.filter(Boolean)));
    return ciclos.sort((a, b) => rotuloCiclo(a).localeCompare(rotuloCiclo(b), "pt-BR", { numeric: true }));
  }, [turmas]);
  const turmasFiltradas = useMemo(() => {
    const filtradasPorBusca = filtrarTurmas(turmas, busca);
    if (cicloFiltro === "todos") return filtradasPorBusca;
    return filtradasPorBusca.filter((turma) => (turma.ciclo || "Sem ciclo") === cicloFiltro);
  }, [busca, cicloFiltro, turmas]);
  const codigoPreview = codigoTurma(serie, letra);
  const letrasLote = useMemo(() => gerarLetrasIntervalo(letra, letraFinal), [letra, letraFinal]);

  useEffect(() => {
    if (cicloFiltro !== "todos" && !ciclosDisponiveis.includes(cicloFiltro)) {
      setCicloFiltro("todos");
    }
  }, [cicloFiltro, ciclosDisponiveis]);

  function limparFormulario() {
    setModoCriacao("individual");
    setCiclo("EM");
    setSerie(CICLOS_TURMA.EM[0]);
    setLetra("A");
    setLetraFinal("G");
    setSala("");
    setPeriodo(PERIODOS_TURMA[0]);
    setAno(String(new Date().getFullYear()));
    setArquivoNome("");
    setAlunosCsv([]);
    setCsvsLote({});
    setSubstituirLista(false);
    setErroCriacao("");
    setTurmaEditando(null);
  }

  function abrirCriacao() {
    if (criando && !turmaEditando && modoCriacao === "individual") {
      setCriando(false);
      return;
    }
    limparFormulario();
    setModoCriacao("individual");
    setCriando(true);
  }

  function abrirCriacaoLote() {
    if (criando && !turmaEditando && modoCriacao === "lote") {
      setCriando(false);
      return;
    }
    limparFormulario();
    setModoCriacao("lote");
    setCriando(true);
  }

  function abrirEdicao(turma: TurmaResumo) {
    const cicloAtual = turma.ciclo && CICLOS_TURMA[turma.ciclo] ? turma.ciclo : "EM";
    const series = CICLOS_TURMA[cicloAtual] ?? CICLOS_TURMA.EM;
    setModoCriacao("individual");
    setCiclo(cicloAtual);
    setSerie(turma.serie ? (series.find((item) => mesmaSerie(item, turma.serie ?? "")) ?? series[0]) : series[0]);
    setLetra(letraTurma(turma));
    setLetraFinal(letraTurma(turma));
    setSala(turma.sala ?? "");
    setPeriodo(turma.periodo && PERIODOS_TURMA.includes(turma.periodo) ? turma.periodo : PERIODOS_TURMA[0]);
    setAno(String(turma.ano));
    setArquivoNome("");
    setAlunosCsv([]);
    setCsvsLote({});
    setErroCriacao("");
    setTurmaEditando(turma);
    setCriando(true);
  }

  function alterarCiclo(valor: string) {
    setCiclo(valor);
    const series = CICLOS_TURMA[valor] ?? CICLOS_TURMA.EM;
    setSerie(series[0]);
    setCsvsLote({});
    setArquivoNome("");
  }

  function selecionarCsv(arquivo: File | undefined) {
    setErroCriacao("");
    setArquivoNome("");
    setAlunosCsv([]);
    if (!arquivo) return;
    arquivo.text()
      .then((texto) => {
        const alunos = parseCsvAlunos(texto);
        if (!alunos.length) {
          throw new Error("Nao encontrei alunos validos no CSV.");
        }
        setArquivoNome(arquivo.name);
        setAlunosCsv(alunos);
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)));
  }

  function selecionarCsvsLote(arquivos: FileList | null) {
    setErroCriacao("");
    setArquivoNome("");
    setCsvsLote({});
    if (!arquivos?.length) return;

    const esperadas = gerarLetrasIntervalo(letra, letraFinal);
    if (!esperadas.length) {
      setErroCriacao("Informe um intervalo de turmas valido antes de selecionar os CSVs.");
      return;
    }

    Promise.all(Array.from(arquivos).map((arquivo) => arquivo.text().then((texto) => {
      const nomeNormalizado = nomeBaseCsv(arquivo.name);
      const alunos = parseCsvAlunos(texto);
      if (!alunos.length) {
        throw new Error(`${arquivo.name}: nao encontrei alunos validos no CSV.`);
      }
      return { letra: nomeNormalizado, nome: arquivo.name, alunos, assinatura: assinaturaCsvAlunos(alunos) };
    })))
      .then((lidos) => {
        const letrasEsperadas = new Set(esperadas);
        const mapa: Record<string, { nome: string; alunos: NovoAlunoPayload[] }> = {};
        const assinaturas = new Map<string, string>();
        const repetidos: string[] = [];
        const foraDoPadrao: string[] = [];
        const conteudosRepetidos: string[] = [];

        lidos.forEach((item) => {
          if (!item.letra || !letrasEsperadas.has(item.letra)) {
            foraDoPadrao.push(item.nome);
            return;
          }
          if (mapa[item.letra]) {
            repetidos.push(item.nome);
            return;
          }
          const anterior = assinaturas.get(item.assinatura);
          if (anterior) {
            conteudosRepetidos.push(`${anterior} e ${item.nome}`);
            return;
          }
          assinaturas.set(item.assinatura, item.nome);
          mapa[item.letra] = { nome: item.nome, alunos: item.alunos };
        });

        const faltantes = esperadas.filter((item) => !mapa[item]);
        const problemas = [
          faltantes.length ? `Faltam CSVs para: ${faltantes.map((item) => `${item}.csv`).join(", ")}.` : "",
          foraDoPadrao.length ? `Arquivos fora do intervalo ou fora do padrao letra.csv: ${foraDoPadrao.join(", ")}.` : "",
          repetidos.length ? `Arquivos repetidos para a mesma turma: ${repetidos.join(", ")}.` : "",
          conteudosRepetidos.length ? `CSVs com o mesmo conteúdo: ${conteudosRepetidos.join("; ")}.` : "",
        ].filter(Boolean);

        if (problemas.length) {
          setErroCriacao(problemas.join(" "));
          return;
        }

        setCsvsLote(mapa);
        setArquivoNome(`${lidos.length} CSVs selecionados`);
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)));
  }

  function criar() {
    const anoNumero = Number.parseInt(ano, 10);
    if (!Number.isFinite(anoNumero)) {
      setErroCriacao("Ano letivo invalido.");
      return;
    }
    if (modoCriacao === "lote" && !turmaEditando) {
      criarLote(anoNumero);
      return;
    }
    const conflitoSala = encontrarConflitoSala(turmas, anoNumero, periodo, sala, turmaEditando?.caminho);
    if (conflitoSala) {
      setErroCriacao(`A sala ${sala} ja esta ocupada no periodo ${periodo} por ${rotuloTurma(conflitoSala)}.`);
      return;
    }
    if (!turmaEditando && !alunosCsv.length) {
      setErroCriacao("Selecione o CSV de alunos antes de criar a turma.");
      return;
    }
    setSalvando(true);
    setErroCriacao("");
    const payload = {
      codigo: codigoPreview,
      ano: anoNumero,
      serie,
      sala,
      periodo,
      ciclo,
      alunos: alunosCsv,
      substituir_alunos: turmaEditando ? substituirLista : false,
    };
    const acao = turmaEditando ? onEditarTurma(turmaEditando, payload) : onCriarTurma(payload);
    acao
      .then(() => {
        setCriando(false);
        limparFormulario();
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)))
      .finally(() => setSalvando(false));
  }

  function criarLote(anoNumero: number) {
    const letras = gerarLetrasIntervalo(letra, letraFinal);
    if (!letras.length) {
      setErroCriacao("Informe um intervalo de turmas valido.");
      return;
    }
    const faltantes = letras.filter((item) => !csvsLote[item]);
    if (faltantes.length) {
      setErroCriacao(`Selecione os CSVs esperados antes de criar: ${faltantes.map((item) => `${item}.csv`).join(", ")}.`);
      return;
    }
    const codigosLote = letras.map((item) => codigoTurma(serie, item));
    const existentes = turmas.filter((turma) => turma.ano === anoNumero && codigosLote.some((codigo) => normalizarTextoCsv(codigo) === normalizarTextoCsv(turma.codigo)));
    if (existentes.length) {
      setErroCriacao(`Ja existe cadastro para: ${existentes.map(rotuloTurma).join(", ")}.`);
      return;
    }
    const salasGeradas = letras.map((_, indice) => salaLote(sala, indice)).filter(Boolean).map(chaveConflitoSala);
    if (new Set(salasGeradas).size !== salasGeradas.length) {
      setErroCriacao("O lote geraria duas ou mais turmas na mesma sala e período. Ajuste a sala inicial ou deixe o campo vazio.");
      return;
    }
    const conflitosSala = letras.flatMap((letraAtual, indice) => {
      const numeroSala = salaLote(sala, indice);
      const turmaConflitante = encontrarConflitoSala(turmas, anoNumero, periodo, numeroSala);
      return turmaConflitante ? [`${codigoTurma(serie, letraAtual)} usaria a sala ${numeroSala}, ja ocupada por ${rotuloTurma(turmaConflitante)}`] : [];
    });
    if (conflitosSala.length) {
      setErroCriacao(conflitosSala.join(". ") + ".");
      return;
    }

    setSalvando(true);
    setErroCriacao("");
    letras.reduce<Promise<void>>((promessa, letraAtual, indice) => promessa.then(() => {
      const csv = csvsLote[letraAtual];
      return onCriarTurma({
        codigo: codigoTurma(serie, letraAtual),
        ano: anoNumero,
        serie,
        sala: salaLote(sala, indice),
        periodo,
        ciclo,
        alunos: csv.alunos,
        substituir_alunos: false,
      });
    }), Promise.resolve())
      .then(() => {
        setCriando(false);
        limparFormulario();
      })
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)))
      .finally(() => setSalvando(false));
  }

  function confirmarExclusao() {
    if (!turmaExcluindo) return;
    setExcluindo(true);
    onExcluirTurma(turmaExcluindo)
      .then(() => setTurmaExcluindo(null))
      .catch((erro) => setErroCriacao(erro instanceof Error ? erro.message : String(erro)))
      .finally(() => setExcluindo(false));
  }

  return (
    <>
      <header className="topbar turmas-topbar">
        <div>
          <span className="eyebrow">Dados reais</span>
          <h1>Gestao de turmas</h1>
          <p>Gerencie todas as turmas salvas no CoordenacaoOP.</p>
        </div>
        <div className="turmas-actions">
          <button className="secondary-action" onClick={abrirCriacaoLote}>
            <Upload size={18} />
            Criar salas em lote
          </button>
          <button className="primary-action" onClick={abrirCriacao}>
            <Plus size={18} />
            Nova turma
          </button>
        </div>
      </header>

      {erroTurmas && <div className="data-warning">{erroTurmas}</div>}

      {criando && (
        <section className="panel create-class-panel">
          <div className="create-class-heading">
            <div>
              <h2>{turmaEditando ? "Editar turma" : modoCriacao === "lote" ? "Criar salas em lote" : "Criar nova turma"}</h2>
              <p>
                {turmaEditando
                  ? "Atualize os dados cadastrais da turma ou envie um CSV novo para atualizar alunos."
                  : modoCriacao === "lote"
                    ? "Informe ciclo, série, intervalo de letras e selecione um CSV para cada sala, nomeado como A.csv, B.csv, C.csv..."
                    : "Informe os dados da turma e selecione o CSV de alunos."}
              </p>
            </div>
            <span>
              {modoCriacao === "lote" && !turmaEditando
                ? <>Salas: <strong>{letrasLote.length ? letrasLote.map((item) => codigoTurma(serie, item)).join(", ") : "intervalo invalido"}</strong></>
                : <>Codigo: <strong>{codigoPreview}</strong></>}
            </span>
          </div>

          <div className="create-class-grid">
            <label>Ciclo
              <select value={ciclo} onChange={(event) => alterarCiclo(event.target.value)}>
                {Object.keys(CICLOS_TURMA).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Série
              <select value={serie} onChange={(event) => {
                setSerie(event.target.value);
                setCsvsLote({});
                setArquivoNome("");
              }}>
                {(CICLOS_TURMA[ciclo] ?? CICLOS_TURMA.EM).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>{modoCriacao === "lote" && !turmaEditando ? "Turma inicial" : "Turma"}
              <input value={letra} onChange={(event) => {
                setLetra(event.target.value.toLocaleUpperCase("pt-BR").slice(0, 3));
                setCsvsLote({});
                setArquivoNome("");
              }} />
            </label>
            {modoCriacao === "lote" && !turmaEditando && (
              <label>Turma final
                <input value={letraFinal} onChange={(event) => {
                  setLetraFinal(event.target.value.toLocaleUpperCase("pt-BR").slice(0, 3));
                  setCsvsLote({});
                  setArquivoNome("");
                }} />
              </label>
            )}
            <label>{modoCriacao === "lote" && !turmaEditando ? "Número da sala inicial (opcional)" : "Número da sala"}
              <input value={sala} onChange={(event) => setSala(event.target.value)} />
            </label>
            <label>Período
              <select value={periodo} onChange={(event) => setPeriodo(event.target.value)}>
                {PERIODOS_TURMA.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Ano letivo
              <input value={ano} onChange={(event) => setAno(event.target.value.replace(/\D/g, "").slice(0, 4))} />
            </label>
          </div>

          <div className="create-class-file-row">
            <label className="file-picker-button">
              {turmaEditando ? "Atualizar CSV" : modoCriacao === "lote" ? "Selecionar CSVs" : "Selecionar CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                multiple={modoCriacao === "lote" && !turmaEditando}
                onChange={(event) => modoCriacao === "lote" && !turmaEditando ? selecionarCsvsLote(event.target.files) : selecionarCsv(event.target.files?.[0])}
              />
            </label>
            <span>
              {modoCriacao === "lote" && !turmaEditando
                ? arquivoNome
                  ? `${arquivoNome} - ${Object.values(csvsLote).reduce((total, item) => total + item.alunos.length, 0)} alunos encontrados`
                  : `Esperado: ${letrasLote.length ? letrasLote.map((item) => `${item}.csv`).join(", ") : "informe o intervalo"}`
                : arquivoNome
                ? `${arquivoNome} - ${alunosCsv.length} alunos encontrados`
                : turmaEditando
                  ? "Opcional: preserva dados existentes, adiciona novos e inativa ausentes"
                  : "Nenhum CSV selecionado"}
            </span>
          </div>

          {modoCriacao === "lote" && !turmaEditando && Object.keys(csvsLote).length > 0 && (
            <div className="batch-csv-summary">
              {letrasLote.map((item) => (
                <span key={item}>{item}.csv: <strong>{csvsLote[item]?.alunos.length ?? 0} alunos</strong></span>
              ))}
            </div>
          )}

          {turmaEditando && alunosCsv.length > 0 && (
            <label className="replace-students-option">
              <input
                type="checkbox"
                checked={substituirLista}
                onChange={(event) => setSubstituirLista(event.target.checked)}
              />
              <span>Limpar lista atual e substituir pelo CSV selecionado</span>
            </label>
          )}

          {erroCriacao && <div className="inline-edit-error">{erroCriacao}</div>}

          <div className="create-class-actions">
            <button onClick={() => { setCriando(false); limparFormulario(); }}>Cancelar</button>
            <button className="primary-action" onClick={criar} disabled={salvando}>
              {salvando ? "Salvando..." : turmaEditando ? "Salvar alterações" : modoCriacao === "lote" ? "Criar salas" : "Criar turma"}
            </button>
          </div>
        </section>
      )}

      <section className="panel turmas-search-panel">
        <label className="search-box">
          <Search size={21} />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar turma, coordenador ou aluno..."
          />
        </label>
        <label className="series-filter">
          Ciclo
          <select value={cicloFiltro} onChange={(event) => setCicloFiltro(event.target.value)}>
            <option value="todos">Todos os ciclos</option>
            {ciclosDisponiveis.map((cicloItem) => (
              <option key={cicloItem} value={cicloItem}>{rotuloCiclo(cicloItem)}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="turmas-card-grid">
        {turmasFiltradas.map((turma) => (
          <article className="turma-card" key={turma.caminho}>
            <div className="turma-card-actions" aria-label="Acoes futuras da turma">
              <button title="Editar turma" onClick={() => abrirEdicao(turma)}>
                <Pencil size={17} />
              </button>
              <button title="Excluir turma" onClick={() => setTurmaExcluindo(turma)}>
                <Trash2 size={17} />
              </button>
            </div>

            <div className="turma-card-main">
              <h2>{rotuloTurma(turma)}</h2>
              <span>{rotuloSerie(turma.serie) || turma.ciclo || `${turma.ano}`}</span>
            </div>

            <div className="turma-card-meta">
              <span className="meta-line">
                <Users size={17} />
                {turma.alunos_ativos} alunos ativos
              </span>
              <span>
                Periodo: <strong>{turma.periodo ?? "Nao informado"}</strong>
              </span>
              <span>
                Coordenador de sala: <strong>{turma.coordenador_turma || "A definir"}</strong>
              </span>
              <span className="class-leaders-line">
                Líderes de sala:
                <strong>{turma.lider_sala || "Líder a definir"}</strong>
                <strong>{turma.vice_lider_sala || "Vice líder a definir"}</strong>
              </span>
              <span>
                Elegiveis: <strong>{turma.alunos_elegiveis}</strong>
              </span>
            </div>

            <button className="details-action" onClick={() => onSelecionar(turma)}>
              Ver detalhes
            </button>
          </article>
        ))}

        {!turmasFiltradas.length && (
          <div className="panel empty-state">
            <ClipboardList size={32} />
            <strong>Nenhuma turma encontrada</strong>
            <span>Ajuste a busca ou importe/crie uma turma no app atual.</span>
          </div>
        )}
      </section>

      {turmaExcluindo && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel delete-class-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-class-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Confirmar exclusão</span>
                <h2 id="delete-class-title">Excluir {rotuloTurma(turmaExcluindo)}?</h2>
              </div>
              <button onClick={() => setTurmaExcluindo(null)} aria-label="Fechar confirmação">
                <X size={18} />
              </button>
            </div>
            <div className="delete-class-body">
              <p>Esta ação apaga o arquivo da turma e remove seus alunos, notas e registros vinculados nesta turma.</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setTurmaExcluindo(null)}>Cancelar</button>
              <button className="danger-action" onClick={confirmarExclusao} disabled={excluindo}>
                {excluindo ? "Excluindo..." : "Excluir turma"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
