import { BarChart3, Check, ImagePlus, Upload, Users } from "lucide-react";
import { Fragment, useState } from "react";
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { invokeApp } from "./appBridge";
import { normalizarTextoCsv, parseCsvAlunos, type NovoAlunoPayload } from "./studentsCsv";
import { carregarPerfilSincronizacao } from "./workgroupSync";

type TurmaResumoImportacao = {
  codigo: string;
  ano: number;
  serie: string | null;
  sala: string | null;
  periodo: string | null;
  ciclo: string | null;
  caminho: string;
};

type ArquivoMapaoPayload = {
  nome: string;
  bytes: number[];
};

type PreviaArquivoMapao = {
  nome: string;
  turma_alvo: string | null;
  turma_caminho: string | null;
  alunos_lidos: number;
  disciplinas_lidas: number;
  correspondencias: number;
  nao_encontrados: number;
  nomes_nao_encontrados: string[];
  duplicados: number;
  nomes_duplicados: string[];
  erro: string | null;
};

type PreviaImportacaoMapoes = {
  arquivos: PreviaArquivoMapao[];
  total_correspondencias: number;
  total_nao_encontrados: number;
  total_duplicados: number;
};

type ResultadoImportacaoMapoes = {
  arquivos: PreviaArquivoMapao[];
  turmas_atualizadas: number;
  alunos_atualizados: number;
};

type ResultadoImportacaoElegiveis = {
  registros_csv: number;
  turmas_lidas: number;
  turmas_atualizadas: number;
  alunos_atualizados: number;
  por_matricula: number;
  por_nome: number;
  nao_encontrados: string[];
  nomes_ambiguos: string[];
};

type PreviaArquivoDiagnostico = {
  nome: string;
  registros_lidos: number;
  correspondencias: number;
  nao_encontrados: number;
  nomes_nao_encontrados: string[];
  duplicados: number;
  nomes_duplicados: string[];
  turmas_identificadas: string[];
  erro: string | null;
};

type PreviaImportacaoDiagnostico = {
  arquivos: PreviaArquivoDiagnostico[];
  total_registros: number;
  total_correspondencias: number;
  total_nao_encontrados: number;
  total_duplicados: number;
};

type ResultadoImportacaoDiagnostico = {
  previa: PreviaImportacaoDiagnostico;
  turmas_atualizadas: number;
  alunos_atualizados: number;
};

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

function rotuloTurma(turma: TurmaResumoImportacao) {
  const serie = rotuloSerie(turma.serie);
  const codigo = turma.codigo ?? "";
  if (!serie) return codigo;
  if (normalizarTextoCsv(codigo).startsWith(normalizarTextoCsv(turma.serie ?? ""))) {
    const resto = codigo.slice(turma.serie?.length ?? 0).trim();
    return `${serie} ${resto}`.trim();
  }
  return rotuloSerie(codigo) || codigo;
}
export function ImportarDados({
  onImportarNotas,
  onImportarElegiveis,
  onImportarDiagnostico,
  onImportarFotos,
  onImportarAlunosLote,
  onImportarTarefas,
  onImportarProvaPaulista,
}: {
  onImportarNotas: () => void;
  onImportarElegiveis: () => void;
  onImportarDiagnostico: () => void;
  onImportarFotos: () => void;
  onImportarAlunosLote: () => void;
  onImportarTarefas: () => void;
  onImportarProvaPaulista: () => void;
}) {
  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importações</span>
          <h1>Importar dados</h1>
          <p>Reúna aqui os arquivos vindos da SED e dos mapões.</p>
        </div>
      </header>

      <section className="import-menu-grid">
        <button type="button" className="import-menu-card" onClick={onImportarNotas}>
          <Upload size={24} />
          <div>
            <strong>Importar notas</strong>
            <span>Leia mapões em lote e atualize notas, faltas e aulas dadas.</span>
          </div>
        </button>
        <button type="button" className="import-menu-card" onClick={onImportarElegiveis}>
          <Check size={24} />
          <div>
            <strong>Importar elegíveis</strong>
            <span>Atualize a lista de estudantes elegíveis e suas condições cadastradas.</span>
          </div>
        </button>
        <button type="button" className="import-menu-card" onClick={onImportarDiagnostico}>
          <BarChart3 size={24} />
          <div>
            <strong>Importar Diagnóstico SARESP</strong>
            <span>Leia a planilha de Português e Matemática com aprendizagem equivalente e status.</span>
          </div>
        </button>
        <button type="button" className="import-menu-card" onClick={onImportarFotos}>
          <ImagePlus size={24} />
          <div>
            <strong>Importar fotos dos alunos</strong>
            <span>Carregue um arquivo .zip ou .7z por turma (nomeado pela turma) com as fotos dos alunos.</span>
          </div>
        </button>
        <button type="button" className="import-menu-card" onClick={onImportarAlunosLote}>
          <Users size={24} />
          <div>
            <strong>Atualizar turmas em lote</strong>
            <span>Carregue vários CSVs de alunos da SED de uma vez; o app identifica a turma pelos RAs e atualiza status e novos alunos.</span>
          </div>
        </button>
        <button type="button" className="import-menu-card" onClick={onImportarTarefas}>
          <BarChart3 size={24} />
          <div>
            <strong>Importar Tarefas Realizadas</strong>
            <span>Carregue a planilha de tarefas do sistema e registre o andamento por bimestre para cada aluno.</span>
          </div>
        </button>
        <button type="button" className="import-menu-card" onClick={onImportarProvaPaulista}>
          <BarChart3 size={24} />
          <div>
            <strong>Importar Prova Paulista</strong>
            <span>Carregue a planilha de resultados da Prova Paulista e registre as notas por disciplina e bimestre.</span>
          </div>
        </button>
      </section>
    </>
  );
}

type ResultadoImportacaoFotos = {
  turma: string;
  turma_encontrada: boolean;
  total: number;
  casados: number;
  nao_encontrados: string[];
  ambiguos: string[];
  arquivos_no_pacote: string[];
};

type ResultadoArquivoFotos = { nome: string; resultado: ResultadoImportacaoFotos | null; erro?: string };

export function ImportarFotos() {
  const [resultados, setResultados] = useState<ResultadoArquivoFotos[]>([]);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  async function selecionarArquivos() {
    setErro("");
    let selecao: string | string[] | null = null;
    try {
      selecao = await abrirDialogoArquivo({
        multiple: true,
        filters: [{ name: "Arquivos compactados", extensions: ["zip", "7z"] }],
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!selecao) return;
    const caminhos = Array.isArray(selecao) ? selecao : [selecao];
    if (caminhos.length === 0) return;

    setProcessando(true);
    const saida: ResultadoArquivoFotos[] = [];
    for (const caminho of caminhos) {
      const nome = caminho.split(/[\\/]/).pop() ?? caminho;
      try {
        const resultado = await invokeApp<ResultadoImportacaoFotos>("importar_fotos_turma", {
          input: { caminho },
        });
        saida.push({ nome, resultado });
      } catch (e) {
        saida.push({ nome, resultado: null, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    setResultados(saida);
    setProcessando(false);
  }

  const totalCasados = resultados.reduce((acc, r) => acc + (r.resultado?.casados ?? 0), 0);

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importações</span>
          <h1>Importar fotos dos alunos</h1>
          <p>Um arquivo <strong>.zip</strong> ou <strong>.7z</strong> por turma. O nome do arquivo identifica a turma (ex.: <em>6B.zip</em>); dentro, as fotos têm o nome dos alunos (primeiro nome, ou nome e sobrenome quando há repetição).</p>
        </div>
      </header>

      <section className="import-notes-panel">
        <div className="import-notes-controls">
          <button type="button" className="file-picker-button" disabled={processando} onClick={selecionarArquivos}>
            <Upload size={16} /> {processando ? "Importando..." : "Selecionar arquivos (.zip / .7z)"}
          </button>
          {resultados.length > 0 && (
            <span className="import-file-summary">{totalCasados} foto(s) vinculada(s) em {resultados.length} arquivo(s).</span>
          )}
        </div>

        {erro && <div className="notice error">{erro}</div>}

        {resultados.map(({ nome, resultado, erro: erroArq }, i) => (
          <div key={i} className="import-diagnostics" style={{ background: "transparent", border: "1px solid var(--border)", color: "inherit" }}>
            <strong>{nome}</strong>
            {erroArq ? (
              <span style={{ color: "var(--danger, #ef4444)" }}>{erroArq}</span>
            ) : !resultado?.turma_encontrada ? (
              <span>Turma não encontrada no programa (verifique se o nome do arquivo corresponde a uma turma, ex.: 6B).</span>
            ) : (
              <>
                <span>Turma <strong>{resultado.turma}</strong>: {resultado.casados} de {resultado.total} foto(s) vinculada(s).</span>
                {resultado.nao_encontrados.length > 0 && (
                  <span>Sem aluno correspondente: {resultado.nao_encontrados.join(", ")}</span>
                )}
                {resultado.ambiguos.length > 0 && (
                  <span>Nome ambíguo (use nome e sobrenome): {resultado.ambiguos.join(", ")}</span>
                )}
                {resultado.total === 0 && (
                  resultado.arquivos_no_pacote.length > 0 ? (
                    <span style={{ color: "var(--danger, #ef4444)" }}>
                      Nenhuma imagem reconhecida. Arquivos no pacote: {resultado.arquivos_no_pacote.slice(0, 15).join(", ")}
                      {resultado.arquivos_no_pacote.length > 15 ? ` e mais ${resultado.arquivos_no_pacote.length - 15}` : ""}
                    </span>
                  ) : (
                    <span style={{ color: "var(--danger, #ef4444)" }}>
                      O pacote foi aberto, mas nenhum arquivo foi encontrado dentro dele.
                    </span>
                  )
                )}
              </>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

type PreviaLoteArquivo = {
  nome_arquivo: string;
  turma_codigo: string | null;
  turma_caminho: string | null;
  confianca: number;
  total: number;
  correspondencias: number;
  novos: number;
  atualizados: number;
  inativados: number;
  identificada: boolean;
};

type ResultadoLoteArquivo = {
  turma_caminho: string;
  turma_codigo: string;
  novos: number;
  atualizados: number;
  inativados: number;
};

type ItemLote = { previa: PreviaLoteArquivo; alunos: NovoAlunoPayload[] };

type AlunoTarefasPayload = {
  nome: string;
  feitas: number;
  total: number;
  percentual: number;
  data_coleta: string;
};

type PreviaTarefasAluno = {
  nome_csv: string;
  turma: string | null;
  feitas: number;
  total: number;
  percentual: number;
  ambiguo: boolean;
  encontrado: boolean;
  resolvido: boolean;
};

type PreviaTarefas = {
  bimestre: string;
  total_csv: number;
  encontrados: number;
  nao_encontrados: number;
  ambiguos: number;
  resolvidos: number;
  matches: PreviaTarefasAluno[];
};

type ResultadoTarefas = {
  bimestre: string;
  atualizados: number;
  turmas_atualizadas: number;
  nao_encontrados: string[];
  ambiguos: string[];
};

function parseCsvTarefas(texto: string): AlunoTarefasPayload[] {
  const linhas = texto.split(/\r?\n/);

  let dataColeta = "";
  const primeiraLinha = linhas[0]?.trim() ?? "";
  if (normalizarTextoCsv(primeiraLinha).startsWith("DADOS;")) {
    dataColeta = primeiraLinha.split(";")[1]?.trim() ?? "";
  }

  let headerIdx = -1;
  for (let i = 0; i < linhas.length; i++) {
    const norm = normalizarTextoCsv(linhas[i]);
    if (norm.includes("NOME DO ALUNO") && norm.includes("TAREFAS REALIZADAS")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const cab = linhas[headerIdx].split(";").map((c) => normalizarTextoCsv(c));
  const idxStatus = cab.findIndex((c) => c === "STATUS");
  const idxNome = cab.findIndex((c) => c === "NOME DO ALUNO");
  const idxTarefas = cab.findIndex((c) => c === "TAREFAS REALIZADAS");
  if (idxNome === -1 || idxTarefas === -1) return [];

  const alunos: AlunoTarefasPayload[] = [];
  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;
    const campos = linha.split(";");
    const nome = campos[idxNome]?.trim() ?? "";
    if (!nome) continue;
    const tarefasStr = campos[idxTarefas]?.trim() ?? "0 de 0";
    const statusStr = idxStatus >= 0 ? (campos[idxStatus]?.trim() ?? "0%") : "0%";
    const tarefasMatch = tarefasStr.match(/(\d+)\s+de\s+(\d+)/i);
    const feitas = tarefasMatch ? parseInt(tarefasMatch[1], 10) : 0;
    const total = tarefasMatch ? parseInt(tarefasMatch[2], 10) : 0;
    const percentual = parseFloat(statusStr.replace("%", "").replace(",", ".").trim()) || 0;
    alunos.push({ nome, feitas, total, percentual, data_coleta: dataColeta });
  }
  return alunos;
}

export function ImportarAlunosLote({ onAplicado }: { onAplicado: () => void }) {
  const [itens, setItens] = useState<ItemLote[]>([]);
  const [resultados, setResultados] = useState<ResultadoLoteArquivo[] | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  async function selecionarArquivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setErro("");
    setResultados(null);
    setProcessando(true);
    try {
      const arquivos: { nome_arquivo: string; alunos: NovoAlunoPayload[] }[] = [];
      for (const arquivo of Array.from(lista)) {
        const texto = await arquivo.text();
        const alunos = parseCsvAlunos(texto);
        if (alunos.length) arquivos.push({ nome_arquivo: arquivo.name, alunos });
      }
      if (!arquivos.length) {
        throw new Error("Nenhum aluno válido encontrado nos arquivos selecionados.");
      }
      const previas = await invokeApp<PreviaLoteArquivo[]>("analisar_lote_alunos", { arquivos });
      setItens(previas.map((previa, indice) => ({ previa, alunos: arquivos[indice].alunos })));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setItens([]);
    } finally {
      setProcessando(false);
    }
  }

  async function aplicar() {
    const aplicaveis = itens.filter((item) => item.previa.identificada && item.previa.turma_caminho);
    if (!aplicaveis.length) return;
    setProcessando(true);
    setErro("");
    try {
      const lote = aplicaveis.map((item) => ({
        turma_caminho: item.previa.turma_caminho as string,
        alunos: item.alunos,
      }));
      const res = await invokeApp<ResultadoLoteArquivo[]>("aplicar_lote_alunos", { itens: lote });
      setResultados(res);
      setItens([]);
      onAplicado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  const identificadas = itens.filter((item) => item.previa.identificada).length;

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importações</span>
          <h1>Atualizar turmas em lote</h1>
          <p>
            Selecione vários CSVs de alunos da SED. O app identifica a turma de cada arquivo
            pelos RAs, atualiza a situação (ativo/inativo) e adiciona alunos novos. Notas já
            lançadas são preservadas.
          </p>
        </div>
      </header>

      <section className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label className="file-picker-button" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
          <Upload size={18} />
          <span>Selecionar CSVs</span>
          <input
            type="file"
            accept=".csv"
            multiple
            style={{ display: "none" }}
            disabled={processando}
            onChange={(event) => {
              void selecionarArquivos(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        {erro && <div className="notice error">{erro}</div>}

        {itens.length > 0 && (
          <>
            <div className="students-table-wrap">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Turma detectada</th>
                    <th>Confiança</th>
                    <th>Atualizados</th>
                    <th>Novos</th>
                    <th>Inativados</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, indice) => (
                    <tr key={indice} className={item.previa.identificada ? "" : "student-table-row inactive"}>
                      <td><strong>{item.previa.nome_arquivo}</strong></td>
                      <td>
                        {item.previa.identificada
                          ? item.previa.turma_codigo
                          : <span className="inactive-badge">não identificada</span>}
                      </td>
                      <td>{item.previa.total ? `${item.previa.confianca}% (${item.previa.correspondencias}/${item.previa.total})` : "-"}</td>
                      <td>{item.previa.identificada ? item.previa.atualizados : "-"}</td>
                      <td>{item.previa.identificada ? item.previa.novos : "-"}</td>
                      <td>{item.previa.identificada ? item.previa.inativados : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="primary-action"
              style={{ alignSelf: "flex-start" }}
              disabled={processando || identificadas === 0}
              onClick={() => void aplicar()}
            >
              Aplicar {identificadas} turma(s)
            </button>
            {identificadas < itens.length && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted, #667085)" }}>
                Arquivos "não identificados" não serão alterados. Verifique se a turma já existe no
                programa e se o CSV corresponde a ela.
              </p>
            )}
          </>
        )}

        {resultados && (
          <div className="notice success">
            <strong>Atualização concluída:</strong>
            <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
              {resultados.map((r, indice) => (
                <li key={indice}>
                  {r.turma_codigo}: {r.atualizados} atualizado(s), {r.novos} novo(s), {r.inativados} inativado(s)
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

export function ImportarNotas({
  turmas,
  onSubstituirCsvTurma,
  onAplicado,
}: {
  turmas: TurmaResumoImportacao[];
  onSubstituirCsvTurma: (turma: TurmaResumoImportacao, alunos: NovoAlunoPayload[]) => Promise<void>;
  onAplicado?: () => void;
}) {
  const [bimestre, setBimestre] = useState("1");
  const [arquivos, setArquivos] = useState<ArquivoMapaoPayload[]>([]);
  const [previa, setPrevia] = useState<PreviaImportacaoMapoes | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoMapoes | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [turmasCsv, setTurmasCsv] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState(false);

  function selecionarArquivos(lista: FileList | null) {
    setErro("");
    setMensagem("");
    setPrevia(null);
    setResultado(null);
    if (!lista?.length) {
      setArquivos([]);
      return;
    }
    Promise.all(Array.from(lista).map(async (arquivo) => ({
      nome: arquivo.name,
      bytes: Array.from(new Uint8Array(await arquivo.arrayBuffer())),
    })))
      .then(setArquivos)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function analisar() {
    if (!arquivos.length) {
      setErro("Selecione ao menos uma planilha de mapão.");
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    setResultado(null);
    invokeApp<PreviaImportacaoMapoes>("analisar_mapoes_lote", {
      input: { bimestre, arquivos },
    })
      .then(setPrevia)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function aplicar() {
    if (!arquivos.length || !previa) return;
    setProcessando(true);
    setErro("");
    setMensagem("");
    const perfil = carregarPerfilSincronizacao();
    const device_id = perfil.displayName?.trim() || perfil.deviceName || undefined;
    invokeApp<ResultadoImportacaoMapoes>("aplicar_mapoes_lote", {
      input: { bimestre, arquivos, device_id },
    })
      .then((res) => { setResultado(res); onAplicado?.(); })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function substituirCsvDaTurma(arquivoPrevia: PreviaArquivoMapao, arquivoCsv: File | undefined) {
    if (!arquivoCsv) return;
    const caminhoTurma = arquivoPrevia.turma_caminho ?? turmasCsv[arquivoPrevia.nome] ?? "";
    if (!caminhoTurma) {
      setErro("Selecione a turma que deve receber este CSV antes de enviar o arquivo.");
      return;
    }
    const turma = turmas.find((item) => item.caminho === caminhoTurma);
    if (!turma) {
      setErro("Não encontrei a turma selecionada para atualizar o CSV.");
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    arquivoCsv.text()
      .then(parseCsvAlunos)
      .then((alunos) => {
        if (!alunos.length) {
          throw new Error("Não encontrei alunos válidos no CSV.");
        }
        return onSubstituirCsvTurma(turma, alunos);
      })
      .then(() => invokeApp<PreviaImportacaoMapoes>("analisar_mapoes_lote", {
        input: { bimestre, arquivos },
      }))
      .then((novaPrevia) => {
        setPrevia(novaPrevia);
        setMensagem(`CSV de ${rotuloTurma(turma)} substituído. A prévia foi recalculada.`);
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function precisaAcaoCsv(arquivo: PreviaArquivoMapao) {
    return Boolean(arquivo.erro) || arquivo.nao_encontrados > 0 || arquivo.duplicados > 0 || (arquivo.alunos_lidos > 0 && arquivo.correspondencias < arquivo.alunos_lidos);
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importação em lote</span>
          <h1>Importar notas</h1>
          <p>Selecione vários mapões para casar alunos pelo nome e importar médias, faltas e aulas dadas.</p>
        </div>
      </header>

      <section className="panel import-notes-panel">
        <div className="import-notes-controls">
          <label>Bimestre
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)}>
              <option value="1">1º bimestre</option>
              <option value="2">2º bimestre</option>
              <option value="3">3º bimestre</option>
              <option value="4">4º bimestre</option>
            </select>
          </label>

          <label className="file-picker-button">
            Selecionar mapões
            <input type="file" multiple accept=".xlsx,.xls" onChange={(event) => selecionarArquivos(event.target.files)} />
          </label>

          <button className="primary-action" onClick={analisar} disabled={processando || !arquivos.length}>
            {processando ? "Processando..." : "Analisar"}
          </button>
        </div>

        <div className="import-file-summary">
          {arquivos.length ? `${arquivos.length} planilha(s) selecionada(s)` : "Nenhuma planilha selecionada"}
        </div>

        {erro && <div className="inline-edit-error">{erro}</div>}
        {mensagem && <div className="finish-confirmation compact-confirmation">{mensagem}</div>}
      </section>

      {previa && (
        <section className="panel import-preview-panel">
          <div className="import-preview-heading">
            <h2>Prévia da importação</h2>
            <div>
              <span>Serão importados: <strong>{previa.total_correspondencias}</strong></span>
              <span>Não encontrados: <strong>{previa.total_nao_encontrados}</strong></span>
              <span>Ambíguos: <strong>{previa.total_duplicados}</strong></span>
            </div>
          </div>

          {(previa.total_nao_encontrados > 0 || previa.total_duplicados > 0 || previa.arquivos.some((arquivo) => arquivo.erro)) && (
            <div className="import-diagnostics">
              <strong>Verifique antes de aplicar</strong>
              <span>Alunos não encontrados não serão importados. Se o problema estiver no CSV da turma, selecione a turma correta na linha e envie o CSV atualizado.</span>
              {previa.total_duplicados > 0 && <span>Ambíguos são alunos cujo nome casa com mais de um estudante — ficam de fora para não gravar a nota no aluno errado. Os demais {previa.total_correspondencias} alunos serão importados e atualizados normalmente.</span>}
            </div>
          )}

          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr><th>Arquivo</th><th>Turma provável</th><th>Alunos</th><th>Disciplinas</th><th>Casados</th><th>Não encontrados</th><th>Ambíguos</th><th>Status</th><th>CSV da turma</th></tr>
              </thead>
              <tbody>
                {previa.arquivos.map((arquivo) => (
                  <Fragment key={arquivo.nome}>
                    <tr>
                      <td><span className="truncated-file-name" title={arquivo.nome}>{arquivo.nome}</span></td>
                      <td>{arquivo.turma_alvo ?? "-"}</td>
                      <td>{arquivo.alunos_lidos}</td>
                      <td>{arquivo.disciplinas_lidas}</td>
                      <td className="success-text">{arquivo.correspondencias}</td>
                      <td className={arquivo.nao_encontrados ? "danger-text" : ""}>{arquivo.nao_encontrados}</td>
                      <td className={arquivo.duplicados ? "danger-text" : ""}>{arquivo.duplicados}</td>
                      <td>
                        {arquivo.erro ? (
                          <span className="class-status-pill critico">Erro</span>
                        ) : arquivo.alunos_lidos > 0 && arquivo.correspondencias === 0 ? (
                          <span className="class-status-pill atencao">Conferir CSV</span>
                        ) : (
                          <span className="class-status-pill adequado">Lido</span>
                        )}
                      </td>
                      <td>
                        {precisaAcaoCsv(arquivo) ? (
                          <div className="csv-repair-cell">
                            <select
                              value={arquivo.turma_caminho ?? turmasCsv[arquivo.nome] ?? ""}
                              onChange={(event) => setTurmasCsv((atuais) => ({ ...atuais, [arquivo.nome]: event.target.value }))}
                              aria-label={`Turma para atualizar CSV de ${arquivo.nome}`}
                            >
                              <option value="">Selecionar turma</option>
                              {turmas.map((turma) => (
                                <option key={turma.caminho} value={turma.caminho}>{rotuloTurma(turma)}</option>
                              ))}
                            </select>
                            <label className="mini-file-action">
                              Limpar e subir CSV
                              <input type="file" accept=".csv,text/csv" onChange={(event) => substituirCsvDaTurma(arquivo, event.target.files?.[0])} />
                            </label>
                          </div>
                        ) : "-"}
                      </td>
                    </tr>
                    {(arquivo.erro || arquivo.nomes_nao_encontrados.length > 0 || arquivo.nomes_duplicados.length > 0) && (
                      <tr className="import-error-row">
                        <td colSpan={9}>
                          {arquivo.erro && <p>{arquivo.erro}</p>}
                          {arquivo.nomes_nao_encontrados.length > 0 && (
                            <p><strong>Não encontrados:</strong> {arquivo.nomes_nao_encontrados.slice(0, 20).join(", ")}{arquivo.nomes_nao_encontrados.length > 20 ? ` e mais ${arquivo.nomes_nao_encontrados.length - 20}` : ""}</p>
                          )}
                          {arquivo.nomes_duplicados.length > 0 && (
                            <p><strong>Ambíguos (nome casa com mais de um estudante):</strong> {arquivo.nomes_duplicados.slice(0, 20).join(", ")}{arquivo.nomes_duplicados.length > 20 ? ` e mais ${arquivo.nomes_duplicados.length - 20}` : ""}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="import-preview-actions">
            <button className="primary-action" onClick={aplicar} disabled={processando || previa.total_correspondencias === 0}>
              {processando ? "Importando..." : "Aplicar importação"}
            </button>
          </div>
        </section>
      )}

      {resultado && (
        <section className="finish-confirmation import-result">
          <strong>Importação concluída.</strong>
          <span>Turmas atualizadas: {resultado.turmas_atualizadas}</span>
          <span>Alunos atualizados: {resultado.alunos_atualizados}</span>
        </section>
      )}
    </>
  );
}

export function ImportarElegiveis({ onImportado }: { onImportado: () => void }) {
  const [arquivoNome, setArquivoNome] = useState("");
  const [arquivoBytes, setArquivoBytes] = useState<number[] | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoElegiveis | null>(null);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  function selecionarArquivo(arquivo: File | undefined) {
    setErro("");
    setResultado(null);
    setArquivoNome("");
    setArquivoBytes(null);
    if (!arquivo) return;
    if (!arquivo.name.toLowerCase().endsWith(".csv")) {
      setErro("Selecione um arquivo CSV.");
      return;
    }
    arquivo.arrayBuffer()
      .then((buffer) => {
        setArquivoNome(arquivo.name);
        setArquivoBytes(Array.from(new Uint8Array(buffer)));
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function importar() {
    if (!arquivoNome || !arquivoBytes) {
      setErro("Selecione o CSV com a lista de alunos elegíveis.");
      return;
    }
    setProcessando(true);
    setErro("");
    setResultado(null);
    invokeApp<ResultadoImportacaoElegiveis>("importar_alunos_elegiveis", {
      input: { nome: arquivoNome, bytes: arquivoBytes },
    })
      .then((resposta) => {
        setResultado(resposta);
        onImportado();
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Lista de elegibilidade</span>
          <h1>Importar alunos elegíveis</h1>
          <p>Atualize a indicação de aluno elegível e a lista de deficiências a partir do CSV geral da escola.</p>
        </div>
      </header>

      <section className="panel import-notes-panel">
        <div className="import-notes-controls">
          <label className="file-picker-button">
            Selecionar CSV
            <input type="file" accept=".csv,text/csv" onChange={(event) => selecionarArquivo(event.target.files?.[0])} />
          </label>

          <button className="primary-action" onClick={importar} disabled={processando || !arquivoBytes}>
            {processando ? "Importando..." : "Importar elegíveis"}
          </button>
        </div>

        <div className="import-file-summary">
          {arquivoNome || "Nenhum CSV selecionado"}
        </div>

        {erro && <div className="inline-edit-error">{erro}</div>}
      </section>

      {resultado && (
        <section className="panel import-preview-panel">
          <div className="import-preview-heading">
            <h2>Resultado da importação</h2>
            <div>
              <span>Registros no CSV: <strong>{resultado.registros_csv}</strong></span>
              <span>Alunos atualizados: <strong>{resultado.alunos_atualizados}</strong></span>
              <span>Turmas atualizadas: <strong>{resultado.turmas_atualizadas}</strong></span>
            </div>
          </div>

          <div className="import-result-grid">
            <article>
              <strong>{resultado.turmas_lidas}</strong>
              <span>Turmas lidas</span>
            </article>
            <article>
              <strong>{resultado.por_matricula}</strong>
              <span>Casados por RA</span>
            </article>
            <article>
              <strong>{resultado.por_nome}</strong>
              <span>Casados por nome</span>
            </article>
            <article>
              <strong>{resultado.nao_encontrados.length}</strong>
              <span>Não encontrados</span>
            </article>
          </div>

          {(resultado.nao_encontrados.length > 0 || resultado.nomes_ambiguos.length > 0) && (
            <div className="import-diagnostics">
              <strong>Verifique os itens pendentes</strong>
              {resultado.nao_encontrados.length > 0 && (
                <span>
                  Não encontrados: {resultado.nao_encontrados.slice(0, 25).join(", ")}
                  {resultado.nao_encontrados.length > 25 ? ` e mais ${resultado.nao_encontrados.length - 25}` : ""}
                </span>
              )}
              {resultado.nomes_ambiguos.length > 0 && (
                <span>
                  Nomes ambíguos: {resultado.nomes_ambiguos.slice(0, 25).join(", ")}
                  {resultado.nomes_ambiguos.length > 25 ? ` e mais ${resultado.nomes_ambiguos.length - 25}` : ""}
                </span>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}

export function ImportarDiagnostico({ onImportado }: { onImportado: () => void }) {
  const [arquivos, setArquivos] = useState<ArquivoMapaoPayload[]>([]);
  const [previa, setPrevia] = useState<PreviaImportacaoDiagnostico | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoDiagnostico | null>(null);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  function selecionarArquivos(lista: FileList | null) {
    setErro("");
    setPrevia(null);
    setResultado(null);
    setArquivos([]);
    if (!lista?.length) return;
    const arquivosSelecionados = Array.from(lista);
    const invalido = arquivosSelecionados.find((arquivo) => !/\.(xlsx|xls)$/i.test(arquivo.name));
    if (invalido) {
      setErro(`Selecione apenas planilhas Excel. Arquivo inválido: ${invalido.name}`);
      return;
    }
    Promise.all(arquivosSelecionados.map(async (arquivo) => ({
      nome: arquivo.name,
      bytes: Array.from(new Uint8Array(await arquivo.arrayBuffer())),
    })))
      .then(setArquivos)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)));
  }

  function analisar() {
    if (!arquivos.length) {
      setErro("Selecione ao menos uma planilha de Diagnóstico SARESP.");
      return;
    }
    setProcessando(true);
    setErro("");
    setResultado(null);
    invokeApp<PreviaImportacaoDiagnostico>("analisar_diagnostico_aprendizagem", {
      input: { arquivos },
    })
      .then(setPrevia)
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  function aplicar() {
    if (!arquivos.length || !previa) return;
    setProcessando(true);
    setErro("");
    invokeApp<ResultadoImportacaoDiagnostico>("aplicar_diagnostico_aprendizagem", {
      input: { arquivos },
    })
      .then((resposta) => {
        setResultado(resposta);
        setPrevia(resposta.previa);
        onImportado();
      })
      .catch((error) => setErro(error instanceof Error ? error.message : String(error)))
      .finally(() => setProcessando(false));
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Diagnóstico SARESP</span>
          <h1>Importar Diagnóstico SARESP</h1>
          <p>Atualize Português e Matemática por aluno a partir da planilha de aprendizagem equivalente.</p>
        </div>
      </header>

      <section className="panel import-notes-panel">
        <div className="import-notes-controls">
          <label className="file-picker-button">
            Selecionar planilhas
            <input type="file" multiple accept=".xlsx,.xls" onChange={(event) => selecionarArquivos(event.target.files)} />
          </label>
          <button className="primary-action" onClick={analisar} disabled={processando || !arquivos.length}>
            {processando ? "Processando..." : "Analisar"}
          </button>
        </div>

        <div className="import-file-summary">
          {arquivos.length ? `${arquivos.length} planilha(s) selecionada(s)` : "Nenhuma planilha selecionada"}
        </div>

        {erro && <div className="inline-edit-error">{erro}</div>}
      </section>

      {previa && (
        <section className="panel import-preview-panel">
          <div className="import-preview-heading">
            <h2>Prévia da importação</h2>
            <div>
              <span>Registros: <strong>{previa.total_registros}</strong></span>
              <span>Serão importados: <strong>{previa.total_correspondencias}</strong></span>
              <span>Não encontrados: <strong>{previa.total_nao_encontrados}</strong></span>
              <span>Ambíguos: <strong>{previa.total_duplicados}</strong></span>
            </div>
          </div>
          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr><th>Arquivo</th><th>Registros</th><th>Casados</th><th>Não encontrados</th><th>Ambíguos</th><th>Status</th></tr>
              </thead>
              <tbody>
                {previa.arquivos.map((arquivo) => (
                  <Fragment key={arquivo.nome}>
                    <tr>
                      <td><span className="truncated-file-name" title={arquivo.nome}>{arquivo.nome}</span></td>
                      <td>{arquivo.registros_lidos}</td>
                      <td className="success-text">{arquivo.correspondencias}</td>
                      <td className={arquivo.nao_encontrados ? "danger-text" : ""}>{arquivo.nao_encontrados}</td>
                      <td className={arquivo.duplicados ? "danger-text" : ""}>{arquivo.duplicados}</td>
                      <td>{arquivo.erro ? <span className="class-status-pill critico">Erro</span> : <span className="class-status-pill adequado">Lido</span>}</td>
                    </tr>
                    {(arquivo.erro || arquivo.nomes_nao_encontrados.length > 0 || arquivo.nomes_duplicados.length > 0) && (
                      <tr className="import-error-row">
                        <td colSpan={6}>
                          {arquivo.erro && <p>{arquivo.erro}</p>}
                          {arquivo.nomes_nao_encontrados.length > 0 && <p><strong>Não encontrados:</strong> {arquivo.nomes_nao_encontrados.slice(0, 20).join(", ")}{arquivo.nomes_nao_encontrados.length > 20 ? ` e mais ${arquivo.nomes_nao_encontrados.length - 20}` : ""}</p>}
                          {arquivo.nomes_duplicados.length > 0 && <p><strong>Ambíguos (nome casa com mais de um estudante):</strong> {arquivo.nomes_duplicados.slice(0, 20).join(", ")}{arquivo.nomes_duplicados.length > 20 ? ` e mais ${arquivo.nomes_duplicados.length - 20}` : ""}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {(previa.total_nao_encontrados > 0 || previa.total_duplicados > 0) && (
            <div className="import-diagnostics">
              <strong>Verifique antes de aplicar</strong>
              <span>Alunos não encontrados ou ambíguos ficam de fora para evitar gravar diagnóstico no estudante errado.</span>
            </div>
          )}

          <div className="import-preview-actions">
            <button className="primary-action" onClick={aplicar} disabled={processando || previa.total_correspondencias === 0}>
              {processando ? "Importando..." : "Aplicar Diagnóstico SARESP"}
            </button>
          </div>
        </section>
      )}

      {resultado && (
        <section className="finish-confirmation import-result">
          <strong>Diagnóstico SARESP importado.</strong>
          <span>Turmas atualizadas: {resultado.turmas_atualizadas}</span>
          <span>Alunos atualizados: {resultado.alunos_atualizados}</span>
        </section>
      )}
    </>
  );
}

const opcoesBimestreTarefas = [
  { valor: "1", rotulo: "1º bimestre" },
  { valor: "2", rotulo: "2º bimestre" },
  { valor: "3", rotulo: "3º bimestre" },
  { valor: "4", rotulo: "4º bimestre/conselho final" },
];

export function ImportarTarefas({ onAplicado }: { onAplicado: () => void }) {
  const [bimestre, setBimestre] = useState("1");
  const [alunos, setAlunos] = useState<AlunoTarefasPayload[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [previa, setPrevia] = useState<PreviaTarefas | null>(null);
  const [resultado, setResultado] = useState<ResultadoTarefas | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  async function selecionarArquivo(lista: FileList | null) {
    const arquivo = lista?.[0];
    if (!arquivo) return;
    setErro("");
    setPrevia(null);
    setResultado(null);
    try {
      const texto = await arquivo.text();
      const parsed = parseCsvTarefas(texto);
      if (!parsed.length) throw new Error("Nenhum aluno encontrado. Verifique se o arquivo é a planilha de tarefas correta.");
      setAlunos(parsed);
      setNomeArquivo(arquivo.name);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setAlunos([]);
      setNomeArquivo("");
    }
  }

  async function analisar() {
    if (!alunos.length) return;
    setProcessando(true);
    setErro("");
    setPrevia(null);
    try {
      const res = await invokeApp<PreviaTarefas>("analisar_tarefas", { bimestre, alunos });
      setPrevia(res);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  async function aplicar() {
    if (!previa || previa.encontrados === 0) return;
    setProcessando(true);
    setErro("");
    try {
      const res = await invokeApp<ResultadoTarefas>("aplicar_tarefas", { bimestre, alunos });
      setResultado(res);
      setPrevia(null);
      setAlunos([]);
      setNomeArquivo("");
      onAplicado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importações</span>
          <h1>Importar Tarefas Realizadas</h1>
          <p>
            Carregue a planilha de tarefas exportada pelo sistema. O app localiza cada aluno pelo
            nome e registra a quantidade de tarefas concluídas por bimestre. Uma nova importação
            substitui os dados anteriores do mesmo bimestre.
          </p>
        </div>
      </header>

      <section className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label>
            Bimestre
            <select value={bimestre} onChange={(e) => setBimestre(e.target.value)} disabled={processando}>
              {opcoesBimestreTarefas.map((o) => (
                <option key={o.valor} value={o.valor}>{o.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="file-picker-button" style={{ cursor: "pointer" }}>
            <Upload size={18} />
            <span>{nomeArquivo || "Selecionar planilha CSV"}</span>
            <input
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              disabled={processando}
              onChange={(e) => { void selecionarArquivo(e.target.files); e.target.value = ""; }}
            />
          </label>
          {alunos.length > 0 && !previa && (
            <button type="button" className="primary-action" onClick={() => void analisar()} disabled={processando}>
              {processando ? "Analisando..." : `Analisar ${alunos.length} aluno(s)`}
            </button>
          )}
        </div>

        {erro && <div className="notice error">{erro}</div>}

        {previa && (
          <>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <span className="active-badge">✓ {previa.encontrados} encontrado(s)</span>
              {previa.resolvidos > 0 && (
                <span className="active-badge" style={{ background: "var(--warning, #d97706)" }}>⟳ {previa.resolvidos} inferido(s) por contexto</span>
              )}
              {previa.nao_encontrados > 0 && (
                <span className="inactive-badge">⚠ {previa.nao_encontrados} não encontrado(s)</span>
              )}
              {previa.ambiguos > 0 && (
                <span className="inactive-badge">⚠ {previa.ambiguos} ambíguo(s)</span>
              )}
            </div>
            <div className="students-table-wrap">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Nome (planilha)</th>
                    <th>Turma</th>
                    <th>Feitas</th>
                    <th>Total</th>
                    <th>%</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.matches.map((m, i) => (
                    <tr key={i} className={m.encontrado ? "" : "student-table-row inactive"}>
                      <td>{m.nome_csv}</td>
                      <td>{m.turma ?? "—"}</td>
                      <td>{m.feitas}</td>
                      <td>{m.total}</td>
                      <td>{m.percentual.toFixed(1).replace(".", ",")}%</td>
                      <td>
                        {m.resolvido
                          ? <span className="active-badge" style={{ background: "var(--warning, #d97706)" }}>inferido</span>
                          : m.encontrado
                            ? <span className="active-badge">ok</span>
                            : m.ambiguo
                              ? <span className="inactive-badge">ambíguo</span>
                              : <span className="inactive-badge">não encontrado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previa.resolvidos > 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted, #667085)" }}>
                Alunos "inferidos" foram identificados pela turma com mais colegas presentes na mesma planilha.
              </p>
            )}
            {(previa.nao_encontrados > 0 || previa.ambiguos > 0) && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted, #667085)" }}>
                Alunos não encontrados ou ambíguos são ignorados para evitar gravar no estudante errado.
              </p>
            )}
            <button
              type="button"
              className="primary-action"
              style={{ alignSelf: "flex-start" }}
              disabled={processando || previa.encontrados === 0}
              onClick={() => void aplicar()}
            >
              {processando ? "Importando..." : `Importar ${previa.encontrados} aluno(s)`}
            </button>
          </>
        )}

        {resultado && (
          <div className="notice success">
            <strong>Importação concluída.</strong>
            <span>{resultado.atualizados} aluno(s) atualizados em {resultado.turmas_atualizadas} turma(s).</span>
            {resultado.nao_encontrados.length > 0 && (
              <span>Não encontrados: {resultado.nao_encontrados.join(", ")}</span>
            )}
          </div>
        )}
      </section>
    </>
  );
}

type ArquivoProvaPayload = { nome: string; bytes: number[] };

type PreviaPaulistaAluno = {
  nome_csv: string;
  turma: string | null;
  participou: boolean;
  geral: number | null;
  encontrado: boolean;
  ambiguo: boolean;
  resolvido: boolean;
};

type PreviaPaulista = {
  bimestre: string;
  total_csv: number;
  encontrados: number;
  nao_encontrados: number;
  ambiguos: number;
  resolvidos: number;
  disciplinas_detectadas: string[];
  matches: PreviaPaulistaAluno[];
};

type ResultadoPaulista = {
  bimestre: string;
  atualizados: number;
  turmas_atualizadas: number;
  nao_encontrados: string[];
  ambiguos: string[];
};

export function ImportarProvaPaulista({ onAplicado }: { onAplicado: () => void }) {
  const [bimestre, setBimestre] = useState("1");
  const [arquivo, setArquivo] = useState<ArquivoProvaPayload | null>(null);
  const [previa, setPrevia] = useState<PreviaPaulista | null>(null);
  const [resultado, setResultado] = useState<ResultadoPaulista | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  function selecionarArquivo(file: File | null) {
    setErro("");
    setPrevia(null);
    setResultado(null);
    if (!file) return;
    file.arrayBuffer()
      .then((buf) => setArquivo({ nome: file.name, bytes: Array.from(new Uint8Array(buf)) }))
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)));
  }

  async function analisar() {
    if (!arquivo) return;
    setProcessando(true);
    setErro("");
    setPrevia(null);
    setResultado(null);
    try {
      const res = await invokeApp<PreviaPaulista>("analisar_prova_paulista", {
        bimestre,
        arquivo,
      });
      setPrevia(res);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function aplicar() {
    if (!arquivo) return;
    setProcessando(true);
    setErro("");
    try {
      const res = await invokeApp<ResultadoPaulista>("aplicar_prova_paulista", {
        bimestre,
        arquivo,
      });
      setResultado(res);
      onAplicado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessando(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importações</span>
          <h1>Prova Paulista</h1>
          <p>Importe os resultados da Prova Paulista por disciplina e bimestre.</p>
        </div>
      </header>

      <section className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="report-controls">
          <label>
            Bimestre
            <select value={bimestre} onChange={(e) => { setBimestre(e.target.value); setPrevia(null); setResultado(null); }}>
              {opcoesBimestreTarefas.map((o) => (
                <option key={o.valor} value={o.valor}>{o.rotulo}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label className="file-picker-button">
            Selecionar planilha (.xlsx)
            <input type="file" accept=".xlsx" onChange={(e) => selecionarArquivo(e.target.files?.[0] ?? null)} />
          </label>
          {arquivo && (
            <>
              <span style={{ fontSize: "0.9rem", color: "var(--muted, #667085)" }}>{arquivo.nome}</span>
              <button
                type="button"
                className="primary-action"
                disabled={processando}
                onClick={() => void analisar()}
              >
                {processando && !previa ? "Analisando..." : "Analisar"}
              </button>
            </>
          )}
        </div>

        {erro && <div className="notice error">{erro}</div>}

        {previa && !resultado && (
          <>
            <div className="notice">
              <strong>{previa.total_csv} alunos na planilha</strong>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                <span className="active-badge">✓ {previa.encontrados} encontrado(s)</span>
                {previa.resolvidos > 0 && (
                  <span className="active-badge" style={{ background: "var(--warning, #d97706)" }}>⟳ {previa.resolvidos} inferido(s) por contexto</span>
                )}
                {previa.nao_encontrados > 0 && (
                  <span className="inactive-badge">⚠ {previa.nao_encontrados} não encontrado(s)</span>
                )}
                {previa.ambiguos > 0 && (
                  <span className="inactive-badge">⚠ {previa.ambiguos} ambíguo(s)</span>
                )}
              </div>
              {previa.disciplinas_detectadas.length > 0 && (
                <span>Disciplinas detectadas: {previa.disciplinas_detectadas.join(", ")}</span>
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Nome (planilha)</th>
                    <th>Turma</th>
                    <th>Participou</th>
                    <th>Geral</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.matches.map((m, i) => (
                    <tr key={i}>
                      <td>{m.nome_csv}</td>
                      <td>{m.turma ?? "—"}</td>
                      <td>{m.participou ? "Sim" : "Não"}</td>
                      <td>{m.geral != null ? m.geral : "—"}</td>
                      <td>
                        {m.resolvido
                          ? <span className="active-badge" style={{ background: "var(--warning, #d97706)" }}>inferido</span>
                          : m.encontrado
                            ? <span className="active-badge">ok</span>
                            : m.ambiguo
                              ? <span className="inactive-badge">ambíguo</span>
                              : <span className="inactive-badge">não encontrado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previa.resolvidos > 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted, #667085)" }}>
                Alunos "inferidos" foram identificados pela turma com mais colegas presentes na mesma planilha.
              </p>
            )}
            {(previa.nao_encontrados > 0 || previa.ambiguos > 0) && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted, #667085)" }}>
                Alunos não encontrados ou ambíguos são ignorados para evitar gravar no estudante errado.
              </p>
            )}
            <button
              type="button"
              className="primary-action"
              style={{ alignSelf: "flex-start" }}
              disabled={processando || previa.encontrados === 0}
              onClick={() => void aplicar()}
            >
              {processando ? "Importando..." : `Importar ${previa.encontrados} aluno(s)`}
            </button>
          </>
        )}

        {resultado && (
          <div className="notice success">
            <strong>Importação concluída.</strong>
            <span>{resultado.atualizados} aluno(s) atualizados em {resultado.turmas_atualizadas} turma(s).</span>
            {resultado.nao_encontrados.length > 0 && (
              <span>Não encontrados: {resultado.nao_encontrados.join(", ")}</span>
            )}
          </div>
        )}
      </section>
    </>
  );
}
