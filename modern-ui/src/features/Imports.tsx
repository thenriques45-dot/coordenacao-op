import { BarChart3, Check, Upload } from "lucide-react";
import { Fragment, useState } from "react";
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
}: {
  onImportarNotas: () => void;
  onImportarElegiveis: () => void;
  onImportarDiagnostico: () => void;
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
              <span>Correspondências: <strong>{previa.total_correspondencias}</strong></span>
              <span>Não encontrados: <strong>{previa.total_nao_encontrados}</strong></span>
              <span>Duplicados: <strong>{previa.total_duplicados}</strong></span>
            </div>
          </div>

          {(previa.total_nao_encontrados > 0 || previa.total_duplicados > 0 || previa.arquivos.some((arquivo) => arquivo.erro)) && (
            <div className="import-diagnostics">
              <strong>Verifique antes de aplicar</strong>
              <span>Alunos não encontrados não serão importados. Se o problema estiver no CSV da turma, selecione a turma correta na linha e envie o CSV atualizado.</span>
              {previa.total_duplicados > 0 && <span>Duplicados ficam de fora para evitar gravação no aluno errado.</span>}
            </div>
          )}

          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr><th>Arquivo</th><th>Turma provável</th><th>Alunos</th><th>Disciplinas</th><th>Casados</th><th>Não encontrados</th><th>Duplicados</th><th>Status</th><th>CSV da turma</th></tr>
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
                            <p><strong>Duplicados:</strong> {arquivo.nomes_duplicados.slice(0, 20).join(", ")}{arquivo.nomes_duplicados.length > 20 ? ` e mais ${arquivo.nomes_duplicados.length - 20}` : ""}</p>
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
              <span>Correspondências: <strong>{previa.total_correspondencias}</strong></span>
              <span>Não encontrados: <strong>{previa.total_nao_encontrados}</strong></span>
              <span>Duplicados: <strong>{previa.total_duplicados}</strong></span>
            </div>
          </div>
          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr><th>Arquivo</th><th>Registros</th><th>Casados</th><th>Não encontrados</th><th>Duplicados</th><th>Status</th></tr>
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
                          {arquivo.nomes_duplicados.length > 0 && <p><strong>Duplicados:</strong> {arquivo.nomes_duplicados.slice(0, 20).join(", ")}{arquivo.nomes_duplicados.length > 20 ? ` e mais ${arquivo.nomes_duplicados.length - 20}` : ""}</p>}
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
