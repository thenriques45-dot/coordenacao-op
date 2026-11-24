import { FileText, Printer, Search, ShieldAlert, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invokeApp } from "../appBridge";
import { useImpressaoDiagnostico } from "../diagnosticoTurma/useDiagnostico";
import {
  BIMESTRES,
  NOTA_MINIMA,
  type AlunoPre,
  type DadosPreConselho,
  type Decisao,
  type LinhaPreConselho,
  type RegistroAlunoPre,
  calcularLinha,
  chaveAluno,
  classeNota,
  formatarNota,
  mediaAnualDisciplina,
  medidasAprovacao,
  medidasReprovacao,
  montarLista,
  notasDisciplina,
} from "./calculos";
import "./preConselho.css";

type TurmaRef = { caminho: string; codigo: string; serie: string | null; ano: number; coordenador_turma?: string | null };

const OPCOES_BIMESTRE = [
  { valor: "1", rotulo: "1º bimestre" },
  { valor: "2", rotulo: "2º bimestre" },
  { valor: "3", rotulo: "3º bimestre" },
  { valor: "4", rotulo: "4º bimestre/conselho final" },
];

const AVISO_INTERNO = "DOCUMENTO INTERNO — USO EXCLUSIVO DOS PROFESSORES";
const AVISO_INTERNO_DETALHE =
  "Registro de trabalho do pré-conselho. Não deve ser entregue a estudantes ou responsáveis, divulgado ou anexado ao prontuário do aluno.";

function formatarPercentual(valor: number | null | undefined) {
  return typeof valor === "number" && Number.isFinite(valor) ? `${Math.round(valor)}%` : "-";
}

function limparRegistro(registro: RegistroAlunoPre): RegistroAlunoPre | null {
  const limpo: RegistroAlunoPre = {};
  if (registro.incluido) limpo.incluido = true;
  if (registro.removido) limpo.removido = true;
  if (registro.decisao) limpo.decisao = registro.decisao;
  if (registro.observacao?.trim()) limpo.observacao = registro.observacao;
  return Object.keys(limpo).length ? limpo : null;
}

export function PreConselho({
  turma,
  turmaLabel,
  alunos,
  bimestreSelecionado,
  setBimestreSelecionado,
  bimestreDados,
  erro,
  onVoltar,
  onAbrirConselho,
}: {
  turma: TurmaRef | null;
  turmaLabel: string;
  alunos: AlunoPre[];
  bimestreSelecionado: string;
  setBimestreSelecionado: (bimestre: string) => void;
  /** Bimestre dos dados de alunos já carregados (evita misturar bimestres na troca). */
  bimestreDados: string | null;
  erro: string;
  onVoltar: () => void;
  onAbrirConselho: () => void;
}) {
  const bimestre = Number.parseInt(bimestreSelecionado, 10) || 1;
  const [dados, setDados] = useState<DadosPreConselho>({});
  const [carregado, setCarregado] = useState(false);
  const [erroDados, setErroDados] = useState("");
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [alunoAberto, setAlunoAberto] = useState<string | null>(null);
  const [ataAberta, setAtaAberta] = useState(false);
  const { imprimindo, imprimir } = useImpressaoDiagnostico();

  const caminho = turma?.caminho ?? "";
  const salvarTimer = useRef<number | null>(null);
  const pendente = useRef<{ caminho: string; bimestre: string; dados: DadosPreConselho } | null>(null);

  function gravarPendente() {
    if (salvarTimer.current !== null) {
      window.clearTimeout(salvarTimer.current);
      salvarTimer.current = null;
    }
    const item = pendente.current;
    pendente.current = null;
    if (!item) return;
    invokeApp("salvar_pre_conselho", { caminho: item.caminho, bimestre: item.bimestre, dadosPre: item.dados }).catch(
      (err) => setErroDados(`Não foi possível salvar o pré-conselho: ${String(err)}`),
    );
  }

  useEffect(() => {
    setCarregado(false);
    setErroDados("");
    if (!caminho) {
      setDados({});
      return;
    }
    let ativo = true;
    invokeApp<DadosPreConselho>("carregar_pre_conselho", { caminho, bimestre: bimestreSelecionado })
      .then((valor) => {
        if (!ativo) return;
        setDados(valor && typeof valor === "object" ? valor : {});
        setCarregado(true);
      })
      .catch((err) => {
        if (!ativo) return;
        setDados({});
        setErroDados(String(err));
      });
    return () => {
      ativo = false;
      // Troca de turma/bimestre ou saída da tela: grava o que faltava.
      gravarPendente();
    };
  }, [caminho, bimestreSelecionado]);

  function atualizarRegistro(chave: string, mudanca: Partial<RegistroAlunoPre>) {
    if (!caminho || !carregado) return;
    setDados((atual) => {
      const alunosAtuais = { ...(atual.alunos ?? {}) };
      const novo = limparRegistro({ ...(alunosAtuais[chave] ?? {}), ...mudanca });
      if (novo) alunosAtuais[chave] = novo;
      else delete alunosAtuais[chave];
      const proximo: DadosPreConselho = { ...atual, alunos: alunosAtuais };
      pendente.current = { caminho, bimestre: bimestreSelecionado, dados: proximo };
      if (salvarTimer.current !== null) window.clearTimeout(salvarTimer.current);
      salvarTimer.current = window.setTimeout(gravarPendente, 600);
      return proximo;
    });
  }

  const dadosProntos = carregado && bimestreDados === bimestreSelecionado;
  const ativos = useMemo(() => alunos.filter((aluno) => aluno.ativo !== false), [alunos]);
  const lista = useMemo(() => (dadosProntos ? montarLista(ativos, bimestre, dados) : []), [ativos, bimestre, dados, dadosProntos]);
  const chavesLista = useMemo(() => new Set(lista.map((linha) => linha.chave)), [lista]);
  const foraDaLista = useMemo(
    () => ativos.filter((aluno) => !chavesLista.has(chaveAluno(aluno))),
    [ativos, chavesLista],
  );
  const retirados = useMemo(
    () => foraDaLista.filter((aluno) => dados.alunos?.[chaveAluno(aluno)]?.removido),
    [foraDaLista, dados],
  );
  const contagem = {
    aprovacao: lista.filter((l) => l.registro.decisao === "aprovacao").length,
    reprovacao: lista.filter((l) => l.registro.decisao === "reprovacao").length,
    semIndicacao: lista.filter((l) => !l.registro.decisao).length,
  };
  const linhaAberta = alunoAberto
    ? (() => {
        const aluno = ativos.find((a) => chaveAluno(a) === alunoAberto);
        return aluno ? calcularLinha(aluno, bimestre, dados.alunos?.[alunoAberto] ?? {}) : null;
      })()
    : null;

  function alternarDecisao(linha: LinhaPreConselho, decisao: Decisao) {
    atualizarRegistro(linha.chave, { decisao: linha.registro.decisao === decisao ? null : decisao });
  }

  function retirar(linha: LinhaPreConselho) {
    // Aluno da lista automática fica marcado como retirado; aluno incluído à
    // mão simplesmente sai. A decisão e a observação vão embora junto.
    atualizarRegistro(linha.chave, linha.automatico
      ? { removido: true, incluido: false, decisao: null, observacao: "" }
      : { incluido: false, decisao: null, observacao: "" });
  }

  function incluir(aluno: AlunoPre) {
    atualizarRegistro(chaveAluno(aluno), { incluido: true, removido: false });
  }

  return (
    <>
      <button className="back-link" onClick={onVoltar}>← Voltar para Conselho</button>
      <header className="topbar council-topbar">
        <div>
          <span className="eyebrow">{turmaLabel}</span>
          <h1>Pré-conselho</h1>
          <p>Alunos com média global abaixo de {NOTA_MINIMA} e os que os professores pedirem para discutir.</p>
        </div>
        <div className="council-actions">
          <button onClick={() => setAdicionarAberto(true)} disabled={!dadosProntos}>
            <UserPlus size={18} />
            Adicionar aluno
          </button>
          <button onClick={() => setAtaAberta(true)} disabled={!dadosProntos || lista.length === 0}>
            <FileText size={18} />
            Gerar ata
          </button>
          <button className="primary-action" onClick={onAbrirConselho}>
            Abrir conselho
          </button>
        </div>
      </header>

      <section className="panel council-summary-panel">
        <div className="summary-selector">
          <label htmlFor="bimestre-pre-conselho">Bimestre</label>
          <select
            id="bimestre-pre-conselho"
            value={bimestreSelecionado}
            onChange={(event) => setBimestreSelecionado(event.target.value)}
          >
            {OPCOES_BIMESTRE.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
            ))}
          </select>
        </div>
        <div className="council-metrics pc-metricas">
          <Metrica valor={lista.length} rotulo="Alunos na pauta" />
          <Metrica valor={contagem.aprovacao} rotulo="Casos de aprovação" tom="green" />
          <Metrica valor={contagem.reprovacao} rotulo="Casos de reprovação" tom="red" />
          <Metrica valor={contagem.semIndicacao} rotulo="Sem indicação" tom="amber" />
        </div>
      </section>

      {(erro || erroDados) && <div className="data-warning">{erro || erroDados}</div>}
      {turma && !dadosProntos && !erro && !erroDados && (
        <div className="data-warning neutral">Carregando os alunos da turma.</div>
      )}

      <section className="panel pre-conselho-panel">
        <div className="panel-heading">
          <h3>Alunos para discutir</h3>
          <span className="pre-conselho-legenda">
            Média global de cada bimestre e quantas disciplinas ficaram abaixo de {NOTA_MINIMA}. Clique no nome para ver todas as notas.
          </span>
        </div>
        {dadosProntos && lista.length === 0 ? (
          <div className="empty-special-list">
            Nenhum aluno com média global abaixo de {NOTA_MINIMA} até o {bimestre}º bimestre. Use "Adicionar aluno" para incluir quem os professores pedirem.
          </div>
        ) : !dadosProntos ? null : (
          <div className="pre-conselho-tabela-wrap">
            <table className="pre-conselho-tabela">
              <thead>
                <tr>
                  <th className="pc-num">Nº</th>
                  <th>Aluno</th>
                  {BIMESTRES.map((b) => (
                    <th key={b} className="pc-bim">{b}º bim</th>
                  ))}
                  <th className="pc-bim">Ano</th>
                  <th>Indicação</th>
                  <th>Observação</th>
                  <th aria-label="Retirar" />
                </tr>
              </thead>
              <tbody>
                {lista.map((linha) => (
                  <tr key={linha.chave}>
                    <td className="pc-num">{linha.aluno.chamada || "-"}</td>
                    <td>
                      <button type="button" className="pc-nome" onClick={() => setAlunoAberto(linha.chave)}>
                        {linha.aluno.nome}
                      </button>
                      {!linha.automatico && <span className="pc-selo">Pedido dos professores</span>}
                    </td>
                    {BIMESTRES.map((b, idx) => (
                      <td key={b} className="pc-bim">
                        {b > bimestre ? (
                          <span className="pc-vazio">-</span>
                        ) : (
                          <>
                            <strong className={`pc-media pc-nota-${classeNota(linha.mediasBimestre[idx])}`}>
                              {formatarNota(linha.mediasBimestre[idx])}
                            </strong>
                            <span className={`pc-abaixo ${linha.abaixoBimestre[idx] ? "tem" : ""}`}>
                              {linha.abaixoBimestre[idx]} abaixo de {NOTA_MINIMA}
                            </span>
                          </>
                        )}
                      </td>
                    ))}
                    <td className="pc-bim">
                      <strong className={`pc-media pc-nota-${classeNota(linha.mediaAno)}`}>{formatarNota(linha.mediaAno)}</strong>
                    </td>
                    <td>
                      <div className="pc-decisao" role="group" aria-label={`Indicação para ${linha.aluno.nome}`}>
                        <button
                          type="button"
                          className={linha.registro.decisao === "aprovacao" ? "ativo aprovacao" : ""}
                          onClick={() => alternarDecisao(linha, "aprovacao")}
                        >
                          Aprovação
                        </button>
                        <button
                          type="button"
                          className={linha.registro.decisao === "reprovacao" ? "ativo reprovacao" : ""}
                          onClick={() => alternarDecisao(linha, "reprovacao")}
                        >
                          Reprovação
                        </button>
                      </div>
                    </td>
                    <td>
                      <textarea
                        className="pc-observacao"
                        rows={2}
                        value={linha.registro.observacao ?? ""}
                        placeholder="Combinados com os professores"
                        onChange={(event) => atualizarRegistro(linha.chave, { observacao: event.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-action pc-retirar"
                        onClick={() => retirar(linha)}
                        title="Retirar da lista do pré-conselho"
                        aria-label={`Retirar ${linha.aluno.nome}`}
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {retirados.length > 0 && (
          <p className="pc-retirados">
            Retirados da lista: {retirados.map((a) => a.nome).join(", ")}. Para trazer de volta, use "Adicionar aluno".
          </p>
        )}
      </section>

      {adicionarAberto && (
        <ModalAdicionar
          alunos={foraDaLista}
          bimestre={bimestre}
          onAdicionar={(aluno) => {
            incluir(aluno);
            setAdicionarAberto(false);
          }}
          onFechar={() => setAdicionarAberto(false)}
        />
      )}

      {linhaAberta && (
        <ModalNotasAluno linha={linhaAberta} bimestre={bimestre} onFechar={() => setAlunoAberto(null)} />
      )}

      {ataAberta && (
        <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
          <div className="kanban-task-modal" style={{ maxWidth: "560px", width: "100%" }}>
            <div className="modal-title-row">
              <div>
                <h2>Ata do pré-conselho</h2>
                <p>{lista.length} aluno{lista.length === 1 ? "" : "s"} · {bimestre}º bimestre · {turmaLabel}</p>
              </div>
              <button type="button" onClick={() => setAtaAberta(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="kanban-task-modal-body">
              <div className="pc-aviso-modal">
                <ShieldAlert size={18} />
                <span>A ata sai com o aviso de que é de uso exclusivo dos professores em todas as páginas.</span>
              </div>
              {contagem.semIndicacao > 0 && (
                <p className="pc-alerta-modal">
                  {contagem.semIndicacao} aluno{contagem.semIndicacao === 1 ? "" : "s"} ainda sem indicação de aprovação ou reprovação. Eles saem na ata como "sem indicação", sem medidas sugeridas.
                </p>
              )}
              <p className="diag-modal-dica">No diálogo de impressão, escolha "Salvar como PDF" para gerar o arquivo.</p>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setAtaAberta(false)}>Fechar</button>
              <button type="button" className="primary-action" onClick={imprimir}>
                <Printer size={16} />
                Imprimir ou salvar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {imprimindo &&
        createPortal(
          <div className="diag-impressao pc-impressao">
            <AtaPreConselho turma={turma} turmaLabel={turmaLabel} bimestre={bimestre} lista={lista} />
          </div>,
          document.body,
        )}
    </>
  );
}

function Metrica({ valor, rotulo, tom }: { valor: number; rotulo: string; tom?: "green" | "amber" | "red" }) {
  return (
    <article className={`council-metric ${tom ?? ""}`}>
      <div className="council-metric-value">
        <strong>{valor}</strong>
      </div>
      <span>{rotulo}</span>
    </article>
  );
}

function ModalAdicionar({
  alunos,
  bimestre,
  onAdicionar,
  onFechar,
}: {
  alunos: AlunoPre[];
  bimestre: number;
  onAdicionar: (aluno: AlunoPre) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const filtrados = alunos
    .filter((a) => !termo || a.nome.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").includes(termo))
    .sort((a, b) => a.chamada - b.chamada || a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <div className="modal-backdrop no-print" role="dialog" aria-modal="true">
      <div className="kanban-task-modal" style={{ maxWidth: "560px", width: "100%" }}>
        <div className="modal-title-row">
          <div>
            <h2>Adicionar aluno</h2>
            <p>Inclua os alunos que os professores pediram para discutir no conselho.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="kanban-task-modal-body">
          <label className="search-box pc-busca">
            <Search size={18} />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno..." />
          </label>
          <div className="pc-lista-adicionar">
            {filtrados.map((aluno) => {
              const linha = calcularLinha(aluno, bimestre);
              return (
                <button type="button" key={chaveAluno(aluno)} onClick={() => onAdicionar(aluno)}>
                  <span className="pc-num">{aluno.chamada || "-"}</span>
                  <span className="pc-add-nome">{aluno.nome}</span>
                  <span className={`pc-media pc-nota-${classeNota(linha.mediaAno)}`}>Média {formatarNota(linha.mediaAno)}</span>
                </button>
              );
            })}
            {!filtrados.length && <div className="empty-special-list">Nenhum aluno encontrado.</div>}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function ModalNotasAluno({ linha, bimestre, onFechar }: { linha: LinhaPreConselho; bimestre: number; onFechar: () => void }) {
  const disciplinas = [...linha.aluno.disciplinas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <div className="modal-backdrop no-print" role="dialog" aria-modal="true" onClick={onFechar}>
      <div className="kanban-task-modal pc-modal-notas" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div>
            <h2>{linha.aluno.nome}</h2>
            <p>
              Nº {linha.aluno.chamada || "-"} · RA {linha.aluno.matricula || "-"} · Frequência {formatarPercentual(linha.aluno.frequencia)}
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="kanban-task-modal-body">
          <table className="pre-conselho-tabela pc-tabela-notas">
            <thead>
              <tr>
                <th>Disciplina</th>
                {BIMESTRES.map((b) => <th key={b} className="pc-bim">{b}º bim</th>)}
                <th className="pc-bim">Média do ano</th>
                <th className="pc-bim">Frequência</th>
              </tr>
            </thead>
            <tbody>
              {disciplinas.map((disciplina) => {
                const notas = notasDisciplina(disciplina, bimestre);
                const anual = mediaAnualDisciplina(disciplina, bimestre);
                const faltas = disciplina.faltasAcumuladas;
                const aulas = disciplina.totalAulasAcumuladas;
                const freq =
                  typeof faltas === "number" && typeof aulas === "number" && aulas > 0
                    ? Math.max(0, Math.min(100, ((aulas - faltas) / aulas) * 100))
                    : null;
                return (
                  <tr key={disciplina.nome}>
                    <td>{disciplina.nome}</td>
                    {notas.map((nota, idx) => (
                      <td key={idx} className="pc-bim">
                        <span className={`pc-media pc-nota-${classeNota(nota)}`}>{formatarNota(nota)}</span>
                      </td>
                    ))}
                    <td className="pc-bim"><strong className={`pc-media pc-nota-${classeNota(anual)}`}>{formatarNota(anual)}</strong></td>
                    <td className="pc-bim">{formatarPercentual(freq)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>Média global</th>
                {linha.mediasBimestre.map((media, idx) => (
                  <th key={idx} className="pc-bim"><span className={`pc-media pc-nota-${classeNota(media)}`}>{formatarNota(media)}</span></th>
                ))}
                <th className="pc-bim"><span className={`pc-media pc-nota-${classeNota(linha.mediaAno)}`}>{formatarNota(linha.mediaAno)}</span></th>
                <th />
              </tr>
              <tr>
                <th>Disciplinas abaixo de {NOTA_MINIMA}</th>
                {linha.abaixoBimestre.map((n, idx) => <th key={idx} className="pc-bim">{idx < bimestre ? n : "-"}</th>)}
                <th className="pc-bim">{linha.disciplinasAbaixoAno.length}</th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function rotuloDecisao(decisao: Decisao | null | undefined) {
  if (decisao === "aprovacao") return "Caso de aprovação";
  if (decisao === "reprovacao") return "Caso de reprovação";
  return "Sem indicação";
}

function AtaPreConselho({
  turma,
  turmaLabel,
  bimestre,
  lista,
}: {
  turma: TurmaRef | null;
  turmaLabel: string;
  bimestre: number;
  lista: LinhaPreConselho[];
}) {
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <table className="pc-ata">
      {/* thead/tfoot se repetem em cada folha impressa: o aviso aparece em todas. */}
      <thead>
        <tr><td><div className="pc-ata-faixa">{AVISO_INTERNO}</div></td></tr>
      </thead>
      <tfoot>
        <tr><td><div className="pc-ata-rodape">{AVISO_INTERNO} · {turmaLabel} · {bimestre}º bimestre</div></td></tr>
      </tfoot>
      <tbody><tr><td>
      <div className="pc-ata-aviso">
        <ShieldAlert size={22} />
        <div>
          <strong>{AVISO_INTERNO}</strong>
          <span>{AVISO_INTERNO_DETALHE}</span>
        </div>
      </div>

      <header className="pc-ata-cabecalho">
        <span>Pré-conselho de classe · {bimestre}º bimestre{turma?.ano ? ` · ${turma.ano}` : ""}</span>
        <h1>{turmaLabel}</h1>
        <p>
          Data: {hoje}
          {turma?.coordenador_turma ? ` · Coordenação da turma: ${turma.coordenador_turma}` : ""}
        </p>
      </header>

      <section>
        <h2><Users size={16} /> Alunos analisados</h2>
        <table className="pc-ata-tabela">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Aluno</th>
              {BIMESTRES.filter((b) => b <= bimestre).map((b) => <th key={b}>{b}º bim</th>)}
              <th>Ano</th>
              <th>Indicação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((linha) => (
              <tr key={linha.chave}>
                <td>{linha.aluno.chamada || "-"}</td>
                <td>{linha.aluno.nome}</td>
                {BIMESTRES.filter((b) => b <= bimestre).map((b) => (
                  <td key={b}>
                    {formatarNota(linha.mediasBimestre[b - 1])}
                    <small> ({linha.abaixoBimestre[b - 1]} &lt; {NOTA_MINIMA})</small>
                  </td>
                ))}
                <td><strong>{formatarNota(linha.mediaAno)}</strong></td>
                <td>{rotuloDecisao(linha.registro.decisao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pc-ata-nota">
          Média global: média das disciplinas no bimestre; entre parênteses, quantas ficaram abaixo de {NOTA_MINIMA}. "Ano" é a média global até o {bimestre}º bimestre.
        </p>
      </section>

      {lista.map((linha) => {
        const medidas =
          linha.registro.decisao === "aprovacao"
            ? medidasAprovacao(linha, bimestre)
            : linha.registro.decisao === "reprovacao"
              ? medidasReprovacao(linha, bimestre)
              : [];
        return (
          <section key={linha.chave} className="pc-ata-aluno">
            <h3>
              {linha.aluno.chamada ? `${linha.aluno.chamada}. ` : ""}
              {linha.aluno.nome}
              <span className={`pc-ata-selo ${linha.registro.decisao ?? "sem"}`}>{rotuloDecisao(linha.registro.decisao)}</span>
            </h3>
            <p>
              Média global do ano: <strong>{formatarNota(linha.mediaAno)}</strong> · Frequência: {formatarPercentual(linha.aluno.frequencia)}
              {linha.disciplinasAbaixoAno.length > 0 && (
                <> · Abaixo de {NOTA_MINIMA} no ano: {linha.disciplinasAbaixoAno.map((d) => `${d.nome} (${formatarNota(d.media)})`).join(", ")}</>
              )}
            </p>
            {linha.registro.observacao?.trim() && (
              <p className="pc-ata-observacao"><strong>Observações dos professores:</strong> {linha.registro.observacao.trim()}</p>
            )}
            {medidas.length > 0 ? (
              <>
                <h4>
                  {linha.registro.decisao === "aprovacao"
                    ? "Medidas pedagógicas: recuperação das aprendizagens"
                    : "Medidas pedagógicas: acompanhamento e registro do percurso"}
                </h4>
                <ul>{medidas.map((m) => <li key={m}>{m}</li>)}</ul>
              </>
            ) : (
              <p className="pc-ata-nota">Sem indicação definida no pré-conselho.</p>
            )}
          </section>
        );
      })}

      <section className="pc-ata-assinaturas">
        <h2>Professores presentes</h2>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="pc-ata-linha"><span /><span /></div>
        ))}
      </section>

      </td></tr></tbody>
    </table>
  );
}
