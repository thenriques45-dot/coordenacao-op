// Construtor visual de relatórios: cria/edita uma ReportDefinition de uma
// seção só (PorAluno) — filtros, colunas calculadas, ordenação, agrupamento
// e parâmetros de execução, tudo em cima do EditorExpressao/ListaOrdenavel.
// Relatórios com seções múltiplas ou fan-out (embutidos avançados) ficam
// só visualizáveis/exportáveis aqui, não editáveis — ver plano.

import { open as abrirDialogoArquivo, save as salvarDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { invokeApp } from "../appBridge";
import { ListaOrdenavel } from "../ListaOrdenavel";
import { EditorExpressao } from "./EditorExpressao";
import {
  Alinhamento,
  CampoRelatorioInfo,
  ColunaRelatorio,
  DefinicaoParametro,
  ExpressaoNo,
  FiltroCondicao,
  FormatoSaida,
  OperadorFiltro,
  OrdenacaoRelatorio,
  ReportDefinition,
  SecaoPreview,
  SecaoRelatorio,
  TipoParametro,
  idLocal,
  valorExpressaoParaTexto,
} from "./tipos";

const PERIODOS_DISPONIVEIS = ["MANHA", "TARDE", "NOITE", "INTEGRAL"];
const CICLOS_DISPONIVEIS = ["EI", "EFAI", "EFAF", "EM"];

const ROTULOS_OPERADOR_FILTRO: Record<OperadorFiltro, string> = {
  igual: "é igual a",
  diferente: "é diferente de",
  maior: "é maior que",
  maior_igual: "é maior ou igual a",
  menor: "é menor que",
  menor_igual: "é menor ou igual a",
  contem: "contém",
  vazio: "está vazio",
  nao_vazio: "não está vazio",
};

const ROTULOS_FORMATO: Record<FormatoSaida, string> = {
  docx: "Word (.docx)",
  xlsx: "Excel (.xlsx)",
  csv: "Planilha simples (.csv)",
  pdf: "PDF (.pdf)",
};

function campoPadrao(campos: CampoRelatorioInfo[]): ExpressaoNo {
  return { tipo: "campo", campo_id: campos[0]?.id ?? "aluno_nome", parametro: null };
}

function slugificar(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || idLocal("col")
  );
}

function definicaoVazia(): ReportDefinition {
  return {
    id: idLocal("relatorio"),
    nome: "",
    descricao: "",
    embutido: false,
    fonte: { series: [], periodos: [], ciclos: [], codigos: [] },
    parametros: [],
    secoes: [
      {
        titulo: null,
        fonte_linhas: { tipo: "por_aluno" },
        filtros: { combinador: "e", condicoes: [] },
        colunas: [],
        ordenacao: [],
        agrupamento: {},
      },
    ],
    formato_saida: "docx",
  };
}

export function ConstrutorRelatorio({
  definicaoInicial,
  turmas,
  onVoltar,
  onSalvo,
}: {
  definicaoInicial?: ReportDefinition;
  turmas: { codigo: string; serie: string | null }[];
  onVoltar: () => void;
  onSalvo: () => void;
}) {
  const [definicao, setDefinicao] = useState<ReportDefinition>(() => definicaoInicial ?? definicaoVazia());
  const [campos, setCampos] = useState<CampoRelatorioInfo[]>([]);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [bimestrePreview, setBimestrePreview] = useState("1");
  const [preview, setPreview] = useState<SecaoPreview[] | null>(null);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    invokeApp<CampoRelatorioInfo[]>("listar_campos_disponiveis")
      .then(setCampos)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
    invokeApp<string[]>("listar_disciplinas_conhecidas")
      .then(setDisciplinas)
      .catch(() => {});
  }, []);

  const secao = definicao.secoes[0];
  const editavel = definicao.secoes.length === 1 && secao.fonte_linhas.tipo === "por_aluno";
  const seriesConhecidas = Array.from(new Set(turmas.map((t) => t.serie).filter((s): s is string => !!s))).sort();

  function atualizarSecao(mudanca: Partial<SecaoRelatorio>) {
    setDefinicao((atual) => ({
      ...atual,
      secoes: atual.secoes.map((s, indice) => (indice === 0 ? { ...s, ...mudanca } : s)),
    }));
  }

  function alternar(lista: string[], valor: string): string[] {
    return lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
  }

  function adicionarColuna() {
    const nova: ColunaRelatorio = {
      id: idLocal("coluna"),
      rotulo: "Nova coluna",
      expressao: campoPadrao(campos),
      largura: null,
      alinhamento: "centro",
    };
    atualizarSecao({ colunas: [...secao.colunas, nova] });
  }

  function mudarColuna(indice: number, mudanca: Partial<ColunaRelatorio>) {
    const colunas = secao.colunas.map((coluna, i) => (i === indice ? { ...coluna, ...mudanca } : coluna));
    atualizarSecao({ colunas });
  }

  function removerColuna(indice: number) {
    const removida = secao.colunas[indice];
    atualizarSecao({
      colunas: secao.colunas.filter((_, i) => i !== indice),
      ordenacao: secao.ordenacao.filter((o) => o.coluna_id !== removida.id),
    });
  }

  function adicionarFiltro() {
    const nova: FiltroCondicao = {
      campo: campoPadrao(campos),
      operador: "igual",
      valor: { tipo: "literal", valor: { tipo: "texto", valor: "" } },
    };
    atualizarSecao({ filtros: { ...secao.filtros, condicoes: [...secao.filtros.condicoes, nova] } });
  }

  function mudarFiltro(indice: number, mudanca: Partial<FiltroCondicao>) {
    const condicoes = secao.filtros.condicoes.map((condicao, i) => (i === indice ? { ...condicao, ...mudanca } : condicao));
    atualizarSecao({ filtros: { ...secao.filtros, condicoes } });
  }

  function removerFiltro(indice: number) {
    atualizarSecao({ filtros: { ...secao.filtros, condicoes: secao.filtros.condicoes.filter((_, i) => i !== indice) } });
  }

  function adicionarOrdenacao() {
    if (secao.colunas.length === 0) return;
    const nova: OrdenacaoRelatorio = { coluna_id: secao.colunas[0].id, decrescente: false };
    atualizarSecao({ ordenacao: [...secao.ordenacao, nova] });
  }

  function mudarOrdenacao(indice: number, mudanca: Partial<OrdenacaoRelatorio>) {
    const ordenacao = secao.ordenacao.map((item, i) => (i === indice ? { ...item, ...mudanca } : item));
    atualizarSecao({ ordenacao });
  }

  function removerOrdenacao(indice: number) {
    atualizarSecao({ ordenacao: secao.ordenacao.filter((_, i) => i !== indice) });
  }

  function adicionarParametro() {
    const novo: DefinicaoParametro = {
      id: idLocal("parametro"),
      rotulo: "Novo parâmetro",
      tipo: "numero",
      valor_padrao: { tipo: "numero", valor: 0 },
    };
    setDefinicao((atual) => ({ ...atual, parametros: [...atual.parametros, novo] }));
  }

  function mudarParametro(indice: number, mudanca: Partial<DefinicaoParametro>) {
    setDefinicao((atual) => ({
      ...atual,
      parametros: atual.parametros.map((parametro, i) => (i === indice ? { ...parametro, ...mudanca } : parametro)),
    }));
  }

  function removerParametro(indice: number) {
    setDefinicao((atual) => ({ ...atual, parametros: atual.parametros.filter((_, i) => i !== indice) }));
  }

  async function préVisualizar() {
    setProcessando(true);
    setErro("");
    setMensagem("");
    try {
      const resultado = await invokeApp<SecaoPreview[]>("pre_visualizar_relatorio", {
        input: { definicao, bimestre: bimestrePreview, parametros: {} },
      });
      setPreview(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  async function salvar() {
    if (!definicao.nome.trim()) {
      setErro("Dê um nome ao relatório antes de salvar.");
      return;
    }
    if (secao.colunas.length === 0) {
      setErro("Adicione pelo menos uma coluna.");
      return;
    }
    setProcessando(true);
    setErro("");
    setMensagem("");
    try {
      await invokeApp("salvar_definicao_relatorio", { definicao });
      setMensagem("Relatório salvo.");
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  async function exportar() {
    const destino = await salvarDialogoArquivo({
      defaultPath: `${slugificar(definicao.nome || definicao.id)}.json`,
      filters: [{ name: "Relatório CoordenacaoOP", extensions: ["json"] }],
    }).catch(() => null);
    if (!destino) return;
    setErro("");
    setMensagem("");
    try {
      await invokeApp("exportar_definicao_relatorio", { id: definicao.id, destino });
      setMensagem("Relatório exportado.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function importar() {
    const selecao = await abrirDialogoArquivo({
      filters: [{ name: "Relatório CoordenacaoOP", extensions: ["json"] }],
    }).catch(() => null);
    const caminho = typeof selecao === "string" ? selecao : null;
    if (!caminho) return;
    setErro("");
    setMensagem("");
    try {
      const importado = await invokeApp<ReportDefinition>("importar_definicao_relatorio", { caminho });
      setDefinicao(importado);
      setPreview(null);
      setMensagem("Relatório importado — revise e salve.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios · Construtor</span>
          <h1>{definicaoInicial ? "Editar relatório" : "Criar relatório"}</h1>
          <p>Monte filtros e colunas a partir dos campos disponíveis — sem precisar editar código.</p>
        </div>
      </header>

      {!editavel && (
        <section className="panel report-generator-card">
          <p>
            Este relatório usa uma estrutura avançada (mais de uma seção, ou linhas geradas por disciplina/turma em vez de
            por aluno) que o construtor visual ainda não edita. Você pode exportá-lo como arquivo pra guardar ou
            compartilhar.
          </p>
          <div className="report-actions">
            <button className="secondary-action" onClick={exportar}>Exportar definição</button>
          </div>
          {mensagem && <div className="notice success">{mensagem}</div>}
          {erro && <div className="notice error">{erro}</div>}
        </section>
      )}

      {editavel && (
        <>
          <section className="panel report-generator-card">
            <h2>Identificação</h2>
            <div className="report-controls">
              <label>
                Nome do relatório
                <input
                  type="text"
                  value={definicao.nome}
                  onChange={(evento) => setDefinicao((atual) => ({ ...atual, nome: evento.target.value }))}
                />
              </label>
              <label>
                Descrição
                <input
                  type="text"
                  value={definicao.descricao}
                  onChange={(evento) => setDefinicao((atual) => ({ ...atual, descricao: evento.target.value }))}
                />
              </label>
              <label>
                Formato de saída
                <select
                  value={definicao.formato_saida}
                  onChange={(evento) => setDefinicao((atual) => ({ ...atual, formato_saida: evento.target.value as FormatoSaida }))}
                >
                  {Object.entries(ROTULOS_FORMATO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="panel report-generator-card">
            <h2>Fonte — quais turmas entram</h2>
            <p>Deixe tudo desmarcado pra incluir todas as turmas.</p>
            <div className="report-controls">
              <label>
                Períodos
                <div className="editor-expressao-linha">
                  {PERIODOS_DISPONIVEIS.map((periodo) => (
                    <label key={periodo} style={{ fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={definicao.fonte.periodos.includes(periodo)}
                        onChange={() =>
                          setDefinicao((atual) => ({ ...atual, fonte: { ...atual.fonte, periodos: alternar(atual.fonte.periodos, periodo) } }))
                        }
                      />
                      {periodo}
                    </label>
                  ))}
                </div>
              </label>
              <label>
                Ciclos
                <div className="editor-expressao-linha">
                  {CICLOS_DISPONIVEIS.map((ciclo) => (
                    <label key={ciclo} style={{ fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={definicao.fonte.ciclos.includes(ciclo)}
                        onChange={() =>
                          setDefinicao((atual) => ({ ...atual, fonte: { ...atual.fonte, ciclos: alternar(atual.fonte.ciclos, ciclo) } }))
                        }
                      />
                      {ciclo}
                    </label>
                  ))}
                </div>
              </label>
              {seriesConhecidas.length > 0 && (
                <label>
                  Séries
                  <div className="editor-expressao-linha">
                    {seriesConhecidas.map((serie) => (
                      <label key={serie} style={{ fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={definicao.fonte.series.includes(serie)}
                          onChange={() =>
                            setDefinicao((atual) => ({ ...atual, fonte: { ...atual.fonte, series: alternar(atual.fonte.series, serie) } }))
                          }
                        />
                        {serie}
                      </label>
                    ))}
                  </div>
                </label>
              )}
            </div>
          </section>

          <section className="panel report-generator-card">
            <h2>Parâmetros de execução (opcional)</h2>
            <p>Campos que a pessoa preenche antes de gerar, como o bimestre já faz — ex.: um limiar ajustável.</p>
            <ListaOrdenavel
              itens={definicao.parametros}
              chave={(p) => p.id}
              onReordenar={(nova) => setDefinicao((atual) => ({ ...atual, parametros: nova }))}
              vazio={<p className="report-path">Nenhum parâmetro adicional.</p>}
              renderItem={(parametro, indice) => (
                <div className="editor-expressao-linha">
                  <input
                    type="text"
                    placeholder="Rótulo"
                    value={parametro.rotulo}
                    onChange={(evento) => mudarParametro(indice, { rotulo: evento.target.value })}
                  />
                  <select
                    value={parametro.tipo}
                    onChange={(evento) => {
                      const tipo = evento.target.value as TipoParametro;
                      mudarParametro(indice, {
                        tipo,
                        valor_padrao: tipo === "numero" ? { tipo: "numero", valor: 0 } : { tipo: "texto", valor: "" },
                      });
                    }}
                  >
                    <option value="numero">Número</option>
                    <option value="texto">Texto</option>
                  </select>
                  <input
                    type={parametro.tipo === "numero" ? "number" : "text"}
                    placeholder="Valor padrão"
                    value={valorExpressaoParaTexto(parametro.valor_padrao)}
                    onChange={(evento) =>
                      mudarParametro(indice, {
                        valor_padrao:
                          parametro.tipo === "numero"
                            ? { tipo: "numero", valor: Number(evento.target.value) || 0 }
                            : { tipo: "texto", valor: evento.target.value },
                      })
                    }
                  />
                  <button type="button" className="editor-expressao-remover" onClick={() => removerParametro(indice)}>Remover</button>
                </div>
              )}
            />
            <button type="button" className="secondary-action" onClick={adicionarParametro}>+ Adicionar parâmetro</button>
          </section>

          <section className="panel report-generator-card">
            <h2>Filtros — quem entra no relatório</h2>
            <label>
              Combinar condições com
              <select
                value={secao.filtros.combinador}
                onChange={(evento) => atualizarSecao({ filtros: { ...secao.filtros, combinador: evento.target.value as "e" | "ou" } })}
              >
                <option value="e">E (todas precisam ser verdadeiras)</option>
                <option value="ou">OU (basta uma ser verdadeira)</option>
              </select>
            </label>
            <ListaOrdenavel
              itens={secao.filtros.condicoes.map((condicao, indice) => ({ id: `filtro_${indice}`, condicao, indice }))}
              chave={(item) => item.id}
              onReordenar={(nova) => atualizarSecao({ filtros: { ...secao.filtros, condicoes: nova.map((item) => item.condicao) } })}
              vazio={<p className="report-path">Nenhum filtro — o relatório inclui todo mundo.</p>}
              renderItem={(item) => (
                <div>
                  <strong>Se</strong>
                  <EditorExpressao no={item.condicao.campo} onMudar={(novo) => mudarFiltro(item.indice, { campo: novo })} campos={campos} parametros={definicao.parametros} disciplinas={disciplinas} />
                  <div className="editor-expressao-linha">
                    <select
                      value={item.condicao.operador}
                      onChange={(evento) => mudarFiltro(item.indice, { operador: evento.target.value as OperadorFiltro })}
                    >
                      {Object.entries(ROTULOS_OPERADOR_FILTRO).map(([valor, rotulo]) => (
                        <option key={valor} value={valor}>{rotulo}</option>
                      ))}
                    </select>
                  </div>
                  {item.condicao.operador !== "vazio" && item.condicao.operador !== "nao_vazio" && (
                    <EditorExpressao
                      no={item.condicao.valor ?? { tipo: "literal", valor: { tipo: "texto", valor: "" } }}
                      onMudar={(novo) => mudarFiltro(item.indice, { valor: novo })}
                      campos={campos}
                      parametros={definicao.parametros}
                      disciplinas={disciplinas}
                    />
                  )}
                  <button type="button" className="editor-expressao-remover" onClick={() => removerFiltro(item.indice)}>Remover filtro</button>
                </div>
              )}
            />
            <button type="button" className="secondary-action" onClick={adicionarFiltro}>+ Adicionar filtro</button>
          </section>

          <section className="panel report-generator-card">
            <h2>Colunas</h2>
            <ListaOrdenavel
              itens={secao.colunas.map((coluna, indice) => ({ id: coluna.id, coluna, indice }))}
              chave={(item) => item.id}
              onReordenar={(nova) => atualizarSecao({ colunas: nova.map((item) => item.coluna) })}
              vazio={<p className="report-path">Nenhuma coluna ainda — adicione pelo menos uma.</p>}
              renderItem={(item) => (
                <div>
                  <div className="editor-expressao-linha">
                    <input
                      type="text"
                      placeholder="Rótulo da coluna"
                      value={item.coluna.rotulo}
                      onChange={(evento) => mudarColuna(item.indice, { rotulo: evento.target.value })}
                    />
                    <select
                      value={item.coluna.alinhamento}
                      onChange={(evento) => mudarColuna(item.indice, { alinhamento: evento.target.value as Alinhamento })}
                    >
                      <option value="esquerda">Esquerda</option>
                      <option value="centro">Centro</option>
                      <option value="direita">Direita</option>
                    </select>
                  </div>
                  <EditorExpressao no={item.coluna.expressao} onMudar={(novo) => mudarColuna(item.indice, { expressao: novo })} campos={campos} parametros={definicao.parametros} disciplinas={disciplinas} />
                  <button type="button" className="editor-expressao-remover" onClick={() => removerColuna(item.indice)}>Remover coluna</button>
                </div>
              )}
            />
            <button type="button" className="secondary-action" onClick={adicionarColuna}>+ Adicionar coluna</button>
          </section>

          <section className="panel report-generator-card">
            <h2>Ordenação</h2>
            {secao.colunas.length === 0 ? (
              <p className="report-path">Adicione colunas primeiro.</p>
            ) : (
              <>
                <ListaOrdenavel
                  itens={secao.ordenacao.map((item, indice) => ({ id: `ord_${indice}`, item, indice }))}
                  chave={(x) => x.id}
                  onReordenar={(nova) => atualizarSecao({ ordenacao: nova.map((x) => x.item) })}
                  vazio={<p className="report-path">Sem ordenação — vem na ordem em que os dados aparecem.</p>}
                  renderItem={(x) => (
                    <div className="editor-expressao-linha">
                      <select value={x.item.coluna_id} onChange={(evento) => mudarOrdenacao(x.indice, { coluna_id: evento.target.value })}>
                        {secao.colunas.map((coluna) => (
                          <option key={coluna.id} value={coluna.id}>{coluna.rotulo}</option>
                        ))}
                      </select>
                      <label style={{ fontWeight: 400 }}>
                        <input type="checkbox" checked={x.item.decrescente} onChange={(evento) => mudarOrdenacao(x.indice, { decrescente: evento.target.checked })} />
                        Decrescente
                      </label>
                      <button type="button" className="editor-expressao-remover" onClick={() => removerOrdenacao(x.indice)}>Remover</button>
                    </div>
                  )}
                />
                <button type="button" className="secondary-action" onClick={adicionarOrdenacao}>+ Adicionar critério de ordenação</button>
              </>
            )}
          </section>

          <section className="panel report-generator-card">
            <h2>Agrupamento e limite de resultados</h2>
            <p>
              Combine com a Ordenação acima pra montar um "Top N" — ex.: ordenar por nota decrescente + limitar a 20 dá os
              20 melhores.
            </p>
            <label style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={secao.agrupamento.limite_por_grupo != null}
                onChange={(evento) =>
                  atualizarSecao({
                    agrupamento: { ...secao.agrupamento, limite_por_grupo: evento.target.checked ? 20 : null },
                  })
                }
              />
              Limitar quantidade de linhas
            </label>
            {secao.agrupamento.limite_por_grupo != null && (
              <label>
                Quantas linhas {secao.agrupamento.campo ? "por grupo" : "no total"}
                <input
                  type="number"
                  value={secao.agrupamento.limite_por_grupo}
                  onChange={(evento) =>
                    atualizarSecao({ agrupamento: { ...secao.agrupamento, limite_por_grupo: Number(evento.target.value) || 1 } })
                  }
                />
              </label>
            )}

            <label style={{ fontWeight: 400, marginTop: 12, display: "block" }}>
              <input
                type="checkbox"
                checked={!!secao.agrupamento.campo}
                onChange={(evento) =>
                  atualizarSecao({ agrupamento: { ...secao.agrupamento, campo: evento.target.checked ? campoPadrao(campos) : null } })
                }
              />
              Agrupar linhas em blocos (ex.: um bloco por turma — daí o limite acima vale por bloco, não no total)
            </label>
            {secao.agrupamento.campo && (
              <EditorExpressao
                no={secao.agrupamento.campo}
                onMudar={(novo) => atualizarSecao({ agrupamento: { ...secao.agrupamento, campo: novo } })}
                campos={campos}
                parametros={definicao.parametros}
                disciplinas={disciplinas}
              />
            )}
          </section>

          <section className="panel report-generator-card">
            <h2>Pré-visualização</h2>
            <div className="report-controls">
              <label>
                Bimestre pra testar
                <select value={bimestrePreview} onChange={(evento) => setBimestrePreview(evento.target.value)}>
                  <option value="1">1º bimestre</option>
                  <option value="2">2º bimestre</option>
                  <option value="3">3º bimestre</option>
                  <option value="4">4º bimestre</option>
                </select>
              </label>
            </div>
            <div className="report-actions">
              <button className="secondary-action" onClick={préVisualizar} disabled={processando}>Pré-visualizar</button>
            </div>
            {preview && preview.map((secaoPrev, indice) => (
              <div key={indice} style={{ overflowX: "auto", marginTop: 12 }}>
                {secaoPrev.titulo && <strong>{secaoPrev.titulo}</strong>}
                <p className="report-path">
                  Mostrando {secaoPrev.linhas.length} de {secaoPrev.total_linhas} registro(s).
                </p>
                {secaoPrev.linhas.length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        {secaoPrev.colunas.map((coluna) => (
                          <th key={coluna.id}>{coluna.rotulo}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {secaoPrev.linhas.map((linha, indiceLinha) => (
                        <tr key={indiceLinha}>
                          {linha.map((valor, indiceColuna) => (
                            <td key={indiceColuna}>{valor}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </section>

          <section className="panel report-generator-card">
            <div className="report-actions">
              <button className="primary-action" onClick={salvar} disabled={processando}>Salvar relatório</button>
              <button className="secondary-action" onClick={exportar}>Exportar definição</button>
              <button className="secondary-action" onClick={importar}>Importar definição</button>
            </div>
            {mensagem && <div className="notice success">{mensagem}</div>}
            {erro && <div className="notice error">{erro}</div>}
          </section>
        </>
      )}
    </section>
  );
}
