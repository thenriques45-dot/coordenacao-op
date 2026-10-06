// Relatório Diagnóstico da Turma: painel geral, em páginas A4, para entregar
// aos professores. Fica na aba "Diagnóstico" da tela da turma e imprime (ou
// salva em PDF) só as páginas do relatório.

import { AlertTriangle, CheckCircle2, Lightbulb, Printer, Star } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { invokeApp, tauriDisponivel } from "../appBridge";
import {
  calcularDiagnostico,
  EXTRAS_VAZIOS,
  FREQ_ATENCAO,
  FREQ_CRITICA,
  NIVEIS_AVD,
  NOTA_MINIMA,
  rankingAscensaoAvd,
  rankingDesafioAvd,
  rankingEvolucaoNotas,
  rankingEvolucaoPP,
  rankingFaltas,
  rankingFragilidade,
  rankingMelhoresMedias,
  rankingQuedaPP,
  PP_CRITICA,
  SARESP_CRITICO,
  tomFrequencia,
  tomNota,
  tomProvaPaulista,
  type AlunoDiag,
  type DiagnosticoTurma,
  type IndicadorAluno,
  type IndicadoresExtras,
  type MudancaAvd,
  type NivelAvd,
  type Tom,
} from "./calculos";
import { BarraEmpilhada, BarrasHorizontais, Colunas, Legenda, Rosca, Variacao } from "./graficos";
import "./diagnostico.css";

type CriterioPerfil = { id: string; nome: string; opcoes: { nivel: string; label: string }[] };
type CriterioDestaque = { id: string; titulo: string; icone: string };

export type CabecalhoTurmaDiagnostico = {
  rotulo: string;
  serie: string;
  periodo: string | null;
  ano: number | null;
  sala: string | null;
  coordenador: string | null;
  caminho: string | null;
};

type SecaoId = "panorama" | "leitura" | "frequencia" | "fragilidades" | "mapa" | "paulista" | "avd" | "avaliacoes";

const SECOES: { id: SecaoId; rotulo: string }[] = [
  { id: "panorama", rotulo: "Panorama" },
  { id: "leitura", rotulo: "Leitura da turma" },
  { id: "frequencia", rotulo: "Frequência" },
  { id: "fragilidades", rotulo: "Fragilidades" },
  { id: "mapa", rotulo: "Mapa de notas" },
  { id: "paulista", rotulo: "Prova Paulista" },
  { id: "avd", rotulo: "AvD" },
  { id: "avaliacoes", rotulo: "SARESP e destaques" },
];

const TOM_NIVEL_AVD: Record<NivelAvd, Tom | "avancado"> = {
  abaixo: "critico",
  basico: "atencao",
  adequado: "bom",
  avancado: "avancado",
  nao: "neutro",
};

function nota(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function percentual(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return `${Math.round(valor)}%`;
}

function abreviarDisciplina(nome: string) {
  const limpo = nome.replace(/\s+-\s+/g, " – ");
  return limpo.length > 26 ? `${limpo.slice(0, 25)}…` : limpo;
}

const ROTULO_CURTO_NIVEL: Record<NivelAvd, string> = {
  abaixo: "Abaixo do básico",
  basico: "Básico",
  adequado: "Adequado",
  avancado: "Avançado",
  nao: "—",
};

function CelulaMudancaAvd({ mudanca }: { mudanca: MudancaAvd | null }) {
  if (!mudanca) return <span className="diag-avd-mudanca">—</span>;
  const classe = mudanca.passos > 0 ? "texto-bom" : mudanca.passos < 0 ? "texto-critico" : "";
  const seta = mudanca.passos > 0 ? "▲" : mudanca.passos < 0 ? "▼" : "=";
  const comNiveis = mudanca.de !== "nao" && mudanca.para !== "nao";
  return (
    <span className="diag-avd-mudanca">
      <strong className={classe}>{seta}</strong>{" "}
      {comNiveis && mudanca.passos === 0 ? (
        <span className="diag-avd-manteve">{ROTULO_CURTO_NIVEL[mudanca.para]}</span>
      ) : comNiveis ? (
        <>
          {ROTULO_CURTO_NIVEL[mudanca.de]} → <span className={classe}>{ROTULO_CURTO_NIVEL[mudanca.para]}</span>
        </>
      ) : (
        <span className={classe}>{mudanca.passos > 0 ? "avançou" : mudanca.passos < 0 ? "regrediu" : "manteve"}</span>
      )}
      {mudanca.equivalenteDe && mudanca.equivalentePara && mudanca.equivalenteDe !== mudanca.equivalentePara && (
        <small>{mudanca.equivalenteDe} → {mudanca.equivalentePara}</small>
      )}
    </span>
  );
}

function Kpi({ rotulo, valor, tom, detalhe }: { rotulo: string; valor: string; tom: Tom; detalhe?: string }) {
  return (
    <article className={`diag-kpi tom-borda-${tom}`}>
      <span>{rotulo}</span>
      <strong className={`texto-${tom}`}>{valor}</strong>
      {detalhe && <small>{detalhe}</small>}
    </article>
  );
}

function Pagina({
  titulo,
  subtitulo,
  cabecalho,
  bimestre,
  numero,
  children,
  className = "",
}: {
  titulo: string;
  subtitulo?: string;
  cabecalho: CabecalhoTurmaDiagnostico;
  bimestre: number;
  numero: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`diag-pagina ${className}`}>
      <header className="diag-pagina-topo">
        <div>
          <span className="diag-sobretitulo">Diagnóstico da turma · {cabecalho.rotulo} · {bimestre}º bimestre</span>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <span className="diag-numero-pagina">{numero}</span>
      </header>
      {children}
    </section>
  );
}

function Quadro({ titulo, children, className = "" }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={`diag-quadro ${className}`}>
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

function Chip({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={`diag-chip tom-fundo-${tom}`}>{children}</span>;
}

function TabelaAlunos({
  alunos,
  colunas,
  vazio,
}: {
  alunos: IndicadorAluno[];
  colunas: { titulo: string; classe?: string; render: (aluno: IndicadorAluno) => ReactNode }[];
  vazio: string;
}) {
  if (!alunos.length) return <p className="diag-vazio">{vazio}</p>;
  return (
    <table className="diag-tabela">
      <thead>
        <tr>
          <th className="diag-col-pos">#</th>
          <th>Aluno</th>
          {colunas.map((c) => (
            <th key={c.titulo} className={c.classe}>{c.titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {alunos.map((aluno, idx) => (
          <tr key={aluno.chave}>
            <td className="diag-col-pos">{idx + 1}</td>
            <td className="diag-col-nome">
              {aluno.nome}
              <small>Nº {aluno.chamada || "—"}{aluno.elegivel ? " · Ed. especial" : ""}</small>
            </td>
            {colunas.map((c) => (
              <td key={c.titulo} className={c.classe}>{c.render(aluno)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Relatorio({
  diag,
  cabecalho,
  secoes,
  limite,
  criteriosPerfil,
  criteriosDestaque,
}: {
  diag: DiagnosticoTurma;
  cabecalho: CabecalhoTurmaDiagnostico;
  secoes: Set<SecaoId>;
  limite: number;
  criteriosPerfil: CriterioPerfil[];
  criteriosDestaque: CriterioDestaque[];
}) {
  const b = diag.bimestreAtual;
  const total = diag.totalAlunos;
  const emitidoEm = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const ppUltimo = diag.provaPaulista.porBimestre.find((p) => p.bimestre === diag.provaPaulista.bimestreUltimo);
  const faltas = rankingFaltas(diag, limite);
  const fragilidades = rankingFragilidade(diag, limite);
  const subiramPP = rankingEvolucaoPP(diag, limite);
  const cairamPP = rankingQuedaPP(diag, limite);
  const melhores = rankingMelhoresMedias(diag, limite);
  const evoluiramNotas = rankingEvolucaoNotas(diag, limite);
  const ascensaoAvd = rankingAscensaoAvd(diag, limite);
  const desafioAvd = rankingDesafioAvd(diag, limite);
  const colunasAvd = [
    { titulo: "Português", render: (a: IndicadorAluno) => <CelulaMudancaAvd mudanca={a.mudancaPortugues} /> },
    { titulo: "Matemática", render: (a: IndicadorAluno) => <CelulaMudancaAvd mudanca={a.mudancaMatematica} /> },
  ];
  const maxVariacaoPP = Math.max(5, ...[...subiramPP, ...cairamPP].map((a) => Math.abs(a.ppVariacao ?? 0)));
  const maxVariacaoNotas = Math.max(1, ...evoluiramNotas.map((a) => Math.abs(a.variacaoNotas ?? 0)));
  const disciplinasMapa = diag.disciplinas.filter((d) => d.alunosComNota > 0);
  const alunosMapa = [...diag.alunos].sort((x, y) => x.chamada - y.chamada || x.nome.localeCompare(y.nome, "pt-BR"));
  let numero = 0;
  const proximo = () => (numero += 1);

  const perfilItens = diag.perfil
    ? criteriosPerfil
        .map((criterio) => {
          const nivel = diag.perfil?.apontamentos[criterio.id] ?? "";
          const opcao = criterio.opcoes.find((o) => o.nivel === nivel);
          const tom: Tom = nivel === "baixo" ? "critico" : nivel === "medio" ? "atencao" : nivel === "alto" ? "bom" : "neutro";
          return { criterio: criterio.nome, rotulo: opcao?.label ?? "", tom };
        })
        .filter((item) => item.rotulo)
    : [];
  const destaqueItens = diag.destaques
    ? criteriosDestaque
        .map((criterio) => ({ titulo: criterio.titulo, nome: (diag.destaques?.nomes[criterio.id] ?? "").trim() }))
        .filter((item) => item.nome)
    : [];

  return (
    <div className="diag-relatorio">
      {secoes.has("panorama") && (
        <section className="diag-pagina diag-capa">
          <header className="diag-capa-topo">
            <div>
              <span className="diag-sobretitulo">Relatório diagnóstico · {b}º bimestre</span>
              <h1>{cabecalho.rotulo}</h1>
              <p>
                {[cabecalho.serie, cabecalho.periodo, cabecalho.sala ? `Sala ${cabecalho.sala}` : null, cabecalho.ano ? `Ano letivo ${cabecalho.ano}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <dl>
              <div><dt>Coordenação da turma</dt><dd>{cabecalho.coordenador || "A definir"}</dd></div>
              <div><dt>Emitido em</dt><dd>{emitidoEm}</dd></div>
            </dl>
            <span className="diag-numero-pagina">{proximo()}</span>
          </header>

          <div className="diag-kpis">
            <Kpi rotulo="Alunos ativos" valor={String(total)} tom="neutro" detalhe={diag.elegiveis ? `${diag.elegiveis} da educação especial` : undefined} />
            <Kpi rotulo="Média geral" valor={nota(diag.mediaTurma)} tom={tomNota(diag.mediaTurma)} detalhe={`${b}º bimestre`} />
            <Kpi rotulo="Frequência média" valor={percentual(diag.frequenciaMedia)} tom={tomFrequencia(diag.frequenciaMedia)} detalhe={diag.alunoPresente.emRisco ? `${diag.alunoPresente.emRisco} em risco de reprovação` : `${diag.faixasFrequencia.critico} abaixo de ${FREQ_CRITICA}%`} />
            <Kpi
              rotulo="Média abaixo de 5"
              valor={String(diag.situacao.criticos)}
              tom={diag.situacao.criticos ? "critico" : "bom"}
              detalhe={total ? `${Math.round((diag.situacao.criticos / total) * 100)}% da turma` : undefined}
            />
            <Kpi
              rotulo="Prova Paulista"
              valor={percentual(ppUltimo?.media)}
              tom={tomProvaPaulista(ppUltimo?.media)}
              detalhe={ppUltimo ? `acertos · ${ppUltimo.bimestre}º bim` : "sem dados importados"}
            />
            <Kpi
              rotulo="Tarefas realizadas"
              valor={percentual(diag.tarefasMedia)}
              tom={diag.tarefasMedia === null ? "neutro" : diag.tarefasMedia < 50 ? "critico" : diag.tarefasMedia < 75 ? "atencao" : "bom"}
              detalhe={diag.tarefasMedia === null ? "sem dados importados" : "média da turma"}
            />
          </div>

          <div className="diag-grade-2">
            <Quadro titulo="Situação da turma pela média">
              <div className="diag-rosca-bloco">
                <Rosca
                  legenda="Situação da turma"
                  fatias={[
                    { rotulo: "Adequados", valor: diag.situacao.adequados, tom: "bom" },
                    { rotulo: "Atenção", valor: diag.situacao.atencao, tom: "atencao" },
                    { rotulo: "Críticos", valor: diag.situacao.criticos, tom: "critico" },
                    { rotulo: "Sem nota", valor: diag.situacao.semNota, tom: "neutro" },
                  ]}
                  centro={<><strong>{total}</strong><span>alunos</span></>}
                />
                <Legenda
                  itens={[
                    { rotulo: "Média 6 ou mais", tom: "bom", valor: diag.situacao.adequados },
                    { rotulo: "Média 5", tom: "atencao", valor: diag.situacao.atencao },
                    { rotulo: "Abaixo de 5", tom: "critico", valor: diag.situacao.criticos },
                    ...(diag.situacao.semNota ? [{ rotulo: "Sem nota", tom: "neutro" as Tom, valor: diag.situacao.semNota }] : []),
                  ]}
                />
              </div>
              <h4>Frequência</h4>
              <BarraEmpilhada
                segmentos={[
                  { rotulo: `${FREQ_ATENCAO}% ou mais`, valor: diag.faixasFrequencia.bom, tom: "bom" },
                  { rotulo: `${FREQ_CRITICA}% a ${FREQ_ATENCAO - 1}%`, valor: diag.faixasFrequencia.atencao, tom: "atencao" },
                  { rotulo: `Abaixo de ${FREQ_CRITICA}%`, valor: diag.faixasFrequencia.critico, tom: "critico" },
                  { rotulo: "Sem dado", valor: diag.faixasFrequencia.semDado, tom: "neutro" },
                ]}
              />
              <Legenda
                itens={[
                  { rotulo: `≥ ${FREQ_ATENCAO}%`, tom: "bom", valor: diag.faixasFrequencia.bom },
                  { rotulo: `${FREQ_CRITICA}–${FREQ_ATENCAO - 1}%`, tom: "atencao", valor: diag.faixasFrequencia.atencao },
                  { rotulo: `< ${FREQ_CRITICA}%`, tom: "critico", valor: diag.faixasFrequencia.critico },
                ]}
              />
              <h4>Média da turma por bimestre</h4>
              <Colunas
                maximo={10}
                formatar={(v) => nota(v)}
                itens={diag.mediaTurmaPorBimestre.map((valor, i) => ({ rotulo: `${i + 1}º bim`, valor: i < b ? valor : null, tom: tomNota(valor) }))}
              />
            </Quadro>
            <Quadro titulo={`Desempenho por disciplina · ${b}º bimestre`}>
              <BarrasHorizontais
                maximo={10}
                formatar={(v) => nota(v)}
                vazio="Nenhuma nota lançada neste bimestre."
                itens={[...diag.disciplinas]
                  .filter((d) => d.media !== null)
                  .sort((x, y) => (x.media ?? 0) - (y.media ?? 0))
                  .map((d) => ({
                    rotulo: abreviarDisciplina(d.nome),
                    valor: d.media,
                    tom: tomNota(d.media),
                    detalhe: d.percentualAbaixo ? <span className={d.percentualAbaixo >= 30 ? "texto-critico" : ""}>{d.percentualAbaixo}% &lt; 5</span> : <span className="texto-bom">todos ≥ 5</span>,
                  }))}
              />
              <p className="diag-nota-rodape">Barras: média da turma. À direita: parcela dos alunos abaixo de {NOTA_MINIMA}.</p>
            </Quadro>
          </div>

          {(diag.pontosAtencao.length > 0 || diag.pontosPositivos.length > 0) && (
            <div className="diag-grade-2">
              <Quadro titulo="Principais alertas" className="diag-quadro-atencao">
                <ul className="diag-alertas diag-alertas-resumo">
                  {diag.pontosAtencao.slice(0, 3).map((alerta) => (
                    <li key={alerta.titulo} className={`tom-borda-${alerta.tom}`}>
                      <AlertTriangle size={14} className={`texto-${alerta.tom}`} />
                      <div><strong>{alerta.titulo}</strong></div>
                    </li>
                  ))}
                  {!diag.pontosAtencao.length && <li className="tom-borda-bom"><div><strong>Nenhum ponto crítico identificado.</strong></div></li>}
                </ul>
              </Quadro>
              <Quadro titulo="O que a turma tem de bom" className="diag-quadro-positivo">
                <ul className="diag-alertas diag-alertas-resumo">
                  {diag.pontosPositivos.slice(0, 3).map((alerta) => (
                    <li key={alerta.titulo} className="tom-borda-bom">
                      <CheckCircle2 size={14} className="texto-bom" />
                      <div><strong>{alerta.titulo}</strong></div>
                    </li>
                  ))}
                  {!diag.pontosPositivos.length && <li className="tom-borda-neutro"><div><strong>Ainda sem destaques claros nos dados.</strong></div></li>}
                </ul>
              </Quadro>
            </div>
          )}
        </section>
      )}

      {secoes.has("leitura") && (
        <Pagina titulo="Leitura da turma" subtitulo="O que os dados dizem e por onde começar" cabecalho={cabecalho} bimestre={b} numero={proximo()}>
          <div className="diag-grade-2">
            <Quadro titulo="Pontos de atenção" className="diag-quadro-atencao">
              {diag.pontosAtencao.length ? (
                <ul className="diag-alertas">
                  {/* Limites para a página caber numa folha; a lista já vem do mais grave ao mais leve. */}
                  {diag.pontosAtencao.slice(0, 7).map((alerta) => (
                    <li key={alerta.titulo} className={`tom-borda-${alerta.tom}`}>
                      <AlertTriangle size={15} className={`texto-${alerta.tom}`} />
                      <div><strong>{alerta.titulo}</strong><span>{alerta.texto}</span></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="diag-vazio">Nenhum ponto crítico identificado com os dados disponíveis.</p>
              )}
            </Quadro>
            <Quadro titulo="Pontos positivos" className="diag-quadro-positivo">
              {diag.pontosPositivos.length ? (
                <ul className="diag-alertas">
                  {diag.pontosPositivos.slice(0, 7).map((alerta) => (
                    <li key={alerta.titulo} className="tom-borda-bom">
                      <CheckCircle2 size={15} className="texto-bom" />
                      <div><strong>{alerta.titulo}</strong><span>{alerta.texto}</span></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="diag-vazio">Ainda não há destaques positivos claros nos dados importados.</p>
              )}
            </Quadro>
          </div>
          <Quadro titulo="Sugestões de abordagem" className="diag-quadro-sugestoes">
            {diag.sugestoes.length ? (
              <ol className="diag-sugestoes">
                {diag.sugestoes.slice(0, 6).map((sugestao) => (
                  <li key={sugestao}><Lightbulb size={14} /> {sugestao}</li>
                ))}
              </ol>
            ) : (
              <p className="diag-vazio">Sem sugestões automáticas para esta turma.</p>
            )}
            <p className="diag-nota-rodape">Sugestões geradas a partir dos indicadores; servem de ponto de partida para a conversa com os professores.</p>
          </Quadro>
          <div className="diag-grade-2">
            <Quadro titulo={diag.perfil ? `Perfil da turma (conselho do ${diag.perfil.bimestre}º bim)` : "Perfil da turma"}>
              {perfilItens.length ? (
                <ul className="diag-perfil">
                  {perfilItens.map((item) => (
                    <li key={item.criterio}><span>{item.criterio}</span><Chip tom={item.tom}>{item.rotulo}</Chip></li>
                  ))}
                </ul>
              ) : (
                <p className="diag-vazio">Perfil ainda não preenchido no conselho de classe.</p>
              )}
            </Quadro>
            <Quadro titulo={diag.destaques ? `Alunos destaque (conselho do ${diag.destaques.bimestre}º bim)` : "Alunos destaque"}>
              {destaqueItens.length ? (
                <ul className="diag-perfil">
                  {destaqueItens.map((item) => (
                    <li key={item.titulo}><span><Star size={12} className="texto-atencao" /> {item.titulo}</span><strong>{item.nome}</strong></li>
                  ))}
                </ul>
              ) : (
                <p className="diag-vazio">Nenhum destaque registrado no conselho de classe.</p>
              )}
              <div className="diag-mini-kpis">
                <span><strong>{diag.totalAtendimentos}</strong> atendimentos registrados</span>
                <span><strong>{diag.alunosComEncaminhamento}</strong> alunos com encaminhamento no {b}º bim</span>
              </div>
            </Quadro>
          </div>
        </Pagina>
      )}

      {secoes.has("frequencia") && (
        <Pagina titulo="Frequência" subtitulo={
            diag.alunoPresente.temDados
              ? `Frequência anual e presença semanal do Aluno Presente; por disciplina, do mapão · abaixo de ${FREQ_CRITICA}% há risco de retenção`
              : `Alunos com mais faltas e disciplinas com mais ausências · abaixo de ${FREQ_CRITICA}% há risco de retenção`
          } cabecalho={cabecalho} bimestre={b} numero={proximo()}>
          {diag.alunoPresente.temDados && (
            <div className="diag-kpis diag-kpis-3">
              <Kpi
                rotulo="Risco de reprovação por faltas"
                valor={String(diag.alunoPresente.emRisco)}
                tom={diag.alunoPresente.emRisco ? "critico" : "bom"}
                detalhe="alunos, segundo o Aluno Presente"
              />
              <Kpi rotulo="Presença na semana anterior" valor={percentual(diag.alunoPresente.semanaAnterior)} tom={tomFrequencia(diag.alunoPresente.semanaAnterior)} detalhe="média da turma" />
              <Kpi
                rotulo="Presença na semana atual"
                valor={percentual(diag.alunoPresente.semanaAtual)}
                tom={tomFrequencia(diag.alunoPresente.semanaAtual)}
                detalhe={
                  diag.alunoPresente.semanaAtual !== null && diag.alunoPresente.semanaAnterior !== null
                    ? `${diag.alunoPresente.semanaAtual >= diag.alunoPresente.semanaAnterior ? "▲ +" : "▼ "}${Math.round(diag.alunoPresente.semanaAtual - diag.alunoPresente.semanaAnterior)} p.p. na semana`
                    : "média da turma"
                }
              />
            </div>
          )}
          <Quadro titulo="Alunos com mais faltas">
            <TabelaAlunos
              alunos={faltas}
              vazio="Nenhum aluno com faltas registradas."
              colunas={[
                {
                  titulo: "Frequência",
                  classe: "diag-col-barra",
                  render: (a) => (
                    <BarrasHorizontais maximo={100} formatar={(v) => percentual(v)} itens={[{ rotulo: "", valor: a.frequencia, tom: tomFrequencia(a.frequencia) }]} />
                  ),
                },
                ...(diag.alunoPresente.temDados
                  ? [
                      {
                        titulo: "Últimas semanas",
                        classe: "diag-col-num",
                        render: (a: IndicadorAluno) =>
                          a.presencaSemanaAtual === null && a.presencaSemanaAnterior === null ? (
                            "—"
                          ) : (
                            <>
                              {percentual(a.presencaSemanaAnterior)} → <span className={`texto-${tomFrequencia(a.presencaSemanaAtual)}`}>{percentual(a.presencaSemanaAtual)}</span>
                            </>
                          ),
                      },
                      {
                        titulo: "Risco",
                        classe: "diag-col-num",
                        render: (a: IndicadorAluno) => (a.riscoReprovacaoFaltas ? <Chip tom="critico">reprovação</Chip> : "—"),
                      },
                    ]
                  : [{ titulo: "Faltas (aulas)", classe: "diag-col-num", render: (a: IndicadorAluno) => (a.faltasTotal === null ? "—" : Math.round(a.faltasTotal)) }]),
                {
                  titulo: "Disciplina com mais faltas",
                  render: (a) => (a.disciplinaMaisFaltas ? <>{abreviarDisciplina(a.disciplinaMaisFaltas.nome)} <small className={`texto-${tomFrequencia(a.disciplinaMaisFaltas.frequencia)}`}>({percentual(a.disciplinaMaisFaltas.frequencia)})</small></> : "—"),
                },
                { titulo: "Média", classe: "diag-col-num", render: (a) => <span className={`texto-${tomNota(a.mediaAtual)}`}>{nota(a.mediaAtual)}</span> },
              ]}
            />
          </Quadro>
          <Quadro titulo="Frequência da turma por disciplina (acumulada no ano)">
            <BarrasHorizontais
              maximo={100}
              formatar={(v) => percentual(v)}
              vazio="Sem carga horária e faltas importadas."
              itens={[...diag.disciplinas]
                .filter((d) => d.frequencia !== null)
                .sort((x, y) => (x.frequencia ?? 0) - (y.frequencia ?? 0))
                .map((d) => ({ rotulo: abreviarDisciplina(d.nome), valor: d.frequencia, tom: tomFrequencia(d.frequencia) }))}
            />
          </Quadro>
        </Pagina>
      )}

      {secoes.has("fragilidades") && (
        <Pagina titulo="Alunos com maiores fragilidades pedagógicas" subtitulo="Ranking que soma notas abaixo de 5, média, frequência, AvD, Prova Paulista, SARESP e tarefas" cabecalho={cabecalho} bimestre={b} numero={proximo()}>
          <Quadro titulo="Alunos que mais precisam de apoio">
            <TabelaAlunos
              alunos={fragilidades}
              vazio="Nenhum aluno com sinais de fragilidade nos dados disponíveis."
              colunas={[
                { titulo: "Média", classe: "diag-col-num", render: (a) => <span className={`texto-${tomNota(a.mediaAtual)} diag-destaque-num`}>{nota(a.mediaAtual)}</span> },
                { titulo: "Abaixo de 5", classe: "diag-col-num", render: (a) => <span className={a.disciplinasAbaixo.length ? "texto-critico diag-destaque-num" : ""}>{a.disciplinasAbaixo.length}</span> },
                { titulo: "Freq.", classe: "diag-col-num", render: (a) => <span className={`texto-${tomFrequencia(a.frequencia)}`}>{percentual(a.frequencia)}</span> },
                {
                  titulo: "Sinais",
                  render: (a) => (
                    <span className="diag-chips">
                      {a.motivosRisco.map((m) => <Chip key={m.texto} tom={m.tom}>{m.texto}</Chip>)}
                    </span>
                  ),
                },
              ]}
            />
            <p className="diag-nota-rodape">
              Disciplinas abaixo de 5 de cada aluno aparecem no mapa de notas. Ordem: pontuação de fragilidade. Cada disciplina abaixo de 5 vale 2; média abaixo de 5, 3; frequência abaixo de {FREQ_CRITICA}%, 3 (entre {FREQ_CRITICA}% e {FREQ_ATENCAO}%, 1); risco de reprovação por faltas no Aluno Presente, 2; presença abaixo de {FREQ_CRITICA}% na semana, 1; abaixo do básico na AvD, 2 por componente; Prova Paulista abaixo de {PP_CRITICA}%, 2; SARESP abaixo de {SARESP_CRITICO}, 1; tarefas abaixo de 50%, 1.
            </p>
          </Quadro>
          <Quadro titulo="Onde a turma tem mais alunos abaixo de 5">
            <BarrasHorizontais
              maximo={100}
              formatar={(v) => `${Math.round(v)}%`}
              vazio="Nenhuma nota lançada neste bimestre."
              itens={[...diag.disciplinas]
                .filter((d) => d.alunosComNota > 0 && d.percentualAbaixo > 0)
                .sort((x, y) => y.percentualAbaixo - x.percentualAbaixo)
                .slice(0, 10)
                .map((d) => ({
                  rotulo: abreviarDisciplina(d.nome),
                  valor: d.percentualAbaixo,
                  tom: d.percentualAbaixo >= 50 ? "critico" : d.percentualAbaixo >= 30 ? "atencao" : "neutro",
                }))}
            />
          </Quadro>
        </Pagina>
      )}

      {secoes.has("mapa") && (
        <Pagina titulo="Mapa de notas" subtitulo={`Nota de cada aluno em cada disciplina no ${b}º bimestre`} cabecalho={cabecalho} bimestre={b} numero={proximo()}>
          {disciplinasMapa.length ? (
            <table className="diag-mapa">
              <thead>
                <tr>
                  <th className="diag-mapa-nome">Aluno</th>
                  {disciplinasMapa.map((d) => (
                    <th key={d.nome} className="diag-mapa-disc"><span>{abreviarDisciplina(d.nome)}</span></th>
                  ))}
                  <th className="diag-mapa-disc diag-mapa-resumo"><span>Média</span></th>
                  <th className="diag-mapa-disc diag-mapa-resumo"><span>Frequência</span></th>
                </tr>
              </thead>
              <tbody>
                {alunosMapa.map((aluno) => (
                  <tr key={aluno.chave}>
                    <td className="diag-mapa-nome">{aluno.chamada ? `${aluno.chamada}. ` : ""}{aluno.nome}</td>
                    {disciplinasMapa.map((d) => {
                      const valor = aluno.notasAtuais[d.nome] ?? null;
                      return <td key={d.nome} className={`diag-celula tom-celula-${valor === null ? "neutro" : valor >= 8 ? "otimo" : tomNota(valor)}`}>{valor === null ? "" : Math.round(valor)}</td>;
                    })}
                    <td className={`diag-celula diag-mapa-resumo tom-celula-${tomNota(aluno.mediaAtual)}`}>{nota(aluno.mediaAtual)}</td>
                    <td className={`diag-celula diag-mapa-resumo tom-celula-${tomFrequencia(aluno.frequencia)}`}>{percentual(aluno.frequencia)}</td>
                  </tr>
                ))}
                {/* Linha comum (não <tfoot>): o Chromium repete e quebra o tfoot na impressão. */}
                <tr className="diag-mapa-total">
                  <td className="diag-mapa-nome">Média da turma</td>
                  {disciplinasMapa.map((d) => (
                    <td key={d.nome} className={`diag-celula tom-celula-${tomNota(d.media)}`}>{nota(d.media)}</td>
                  ))}
                  <td className={`diag-celula diag-mapa-resumo tom-celula-${tomNota(diag.mediaTurma)}`}>{nota(diag.mediaTurma)}</td>
                  <td className={`diag-celula diag-mapa-resumo tom-celula-${tomFrequencia(diag.frequenciaMedia)}`}>{percentual(diag.frequenciaMedia)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="diag-vazio">Nenhuma nota lançada neste bimestre.</p>
          )}
          <div className="diag-legenda diag-legenda-mapa">
            <span><i className="tom-celula-critico" /> abaixo de 5</span>
            <span><i className="tom-celula-atencao" /> 5</span>
            <span><i className="tom-celula-bom" /> 6 a 7</span>
            <span><i className="tom-celula-otimo" /> 8 ou mais</span>
          </div>
        </Pagina>
      )}

      {secoes.has("paulista") && (
        <Pagina titulo="Prova Paulista" subtitulo="Percentual de acertos da turma, alunos em ascensão e alunos desafio entre as aplicações" cabecalho={cabecalho} bimestre={b} numero={proximo()}>
          {diag.provaPaulista.temDados ? (
            <>
              <div className="diag-grade-2">
                <Quadro titulo="Média de acertos da turma por bimestre">
                  <Colunas
                    maximo={100}
                    formatar={(v) => percentual(v)}
                    itens={diag.provaPaulista.porBimestre.map((p) => ({ rotulo: `${p.bimestre}º bim`, valor: p.media, tom: tomProvaPaulista(p.media) }))}
                  />
                  <p className="diag-nota-rodape">
                    Participação:{" "}
                    {diag.provaPaulista.porBimestre
                      .filter((p) => p.participacao !== null)
                      .map((p) => `${p.bimestre}º bim ${p.participacao}%`)
                      .join(" · ")}
                  </p>
                </Quadro>
                <Quadro titulo={`Acertos por disciplina · ${diag.provaPaulista.bimestreUltimo}º bimestre`}>
                  <BarrasHorizontais
                    maximo={100}
                    formatar={(v) => percentual(v)}
                    vazio="A planilha importada não trouxe notas por disciplina."
                    itens={diag.provaPaulista.disciplinasUltimo.map((d) => ({ rotulo: d.nome, valor: d.media, tom: tomProvaPaulista(d.media) }))}
                  />
                </Quadro>
              </div>
              <div className="diag-grade-2">
                <Quadro titulo="Alunos em ascensão" className="diag-quadro-positivo">
                  <TabelaAlunos
                    alunos={subiramPP}
                    vazio="Ninguém subiu entre as aplicações (são necessárias ao menos duas)."
                    colunas={[
                      { titulo: "Acertos", classe: "diag-col-num", render: (a) => `${percentual(a.ppPrimeiro)} → ${percentual(a.ppUltimo)}` },
                      { titulo: "Variação (p.p.)", classe: "diag-col-barra", render: (a) => <Variacao valor={a.ppVariacao ?? 0} maximo={maxVariacaoPP} /> },
                    ]}
                  />
                </Quadro>
                <Quadro titulo="Alunos desafio" className="diag-quadro-atencao">
                  <TabelaAlunos
                    alunos={cairamPP}
                    vazio="Ninguém caiu entre as aplicações (são necessárias ao menos duas)."
                    colunas={[
                      { titulo: "Acertos", classe: "diag-col-num", render: (a) => `${percentual(a.ppPrimeiro)} → ${percentual(a.ppUltimo)}` },
                      { titulo: "Variação (p.p.)", classe: "diag-col-barra", render: (a) => <Variacao valor={a.ppVariacao ?? 0} maximo={maxVariacaoPP} /> },
                    ]}
                  />
                </Quadro>
              </div>
              <p className="diag-nota-rodape">A variação compara a primeira e a última aplicação com resultado de cada aluno. p.p. = pontos percentuais.</p>
            </>
          ) : (
            <p className="diag-vazio diag-vazio-grande">Nenhum resultado da Prova Paulista importado para esta turma. Use Importar dados › Prova Paulista.</p>
          )}
        </Pagina>
      )}

      {secoes.has("avd") && (
        <Pagina className="diag-pagina-compacta" titulo="Avaliação Diagnóstica (AvD)" subtitulo="Recomposição – Diagnóstico: níveis da turma, alunos em ascensão e alunos desafio da 1ª para a 2ª AvD" cabecalho={cabecalho} bimestre={b} numero={proximo()}>
          <Quadro titulo="Níveis na AvD (Recomposição – Diagnóstico)">
            {diag.avd.temDados ? (
              <>
                {([["Português", diag.avd.portugues, diag.avd.evolucaoPortugues], ["Matemática", diag.avd.matematica, diag.avd.evolucaoMatematica]] as const).map(([rotulo, contagem, evolucao]) => (
                  <div className="diag-avd-linha" key={rotulo}>
                    <span className="diag-avd-rotulo">{rotulo}</span>
                    <BarraEmpilhada segmentos={NIVEIS_AVD.map((n) => ({ rotulo: n.rotulo, valor: contagem[n.id], tom: TOM_NIVEL_AVD[n.id] }))} />
                    <span className="diag-avd-evolucao">
                      <span className="texto-bom">▲ {evolucao.avancou}</span>
                      <span>= {evolucao.manteve}</span>
                      <span className="texto-critico">▼ {evolucao.regrediu}</span>
                    </span>
                  </div>
                ))}
                <Legenda itens={NIVEIS_AVD.map((n) => ({ rotulo: n.rotulo, tom: TOM_NIVEL_AVD[n.id] }))} />
                <p className="diag-nota-rodape">Nível mais recente de cada aluno. À direita: quantos avançaram (▲), mantiveram (=) ou regrediram (▼) da 1ª para a 2ª AvD. Nas listas abaixo, ascensão é quem subiu de nível em ao menos um componente e desafio é quem caiu em ao menos um, na ordem do saldo de níveis; sob o nível, a mudança na aprendizagem equivalente.</p>
              </>
            ) : (
              <p className="diag-vazio">Nenhuma AvD importada para esta turma.</p>
            )}
          </Quadro>
          {diag.avd.temDados && (
            <>
              <Quadro titulo="Alunos em ascensão" className="diag-quadro-positivo">
                <TabelaAlunos alunos={ascensaoAvd} vazio="Ninguém subiu de nível da 1ª para a 2ª AvD." colunas={colunasAvd} />
              </Quadro>
              <Quadro titulo="Alunos desafio" className="diag-quadro-atencao">
                <TabelaAlunos alunos={desafioAvd} vazio="Ninguém caiu de nível da 1ª para a 2ª AvD." colunas={colunasAvd} />
              </Quadro>
            </>
          )}
        </Pagina>
      )}

      {secoes.has("avaliacoes") && (
        <Pagina titulo="SARESP e destaques" subtitulo="Notas do SARESP – Diagnóstico, maiores médias e alunos em ascensão nas notas" cabecalho={cabecalho} bimestre={b} numero={proximo()}>
          <Quadro titulo={diag.saresp.media !== null ? `SARESP · nota média ${nota(diag.saresp.media)}` : "SARESP"}>
            {diag.saresp.temDados ? (
              <>
                <BarrasHorizontais
                  maximo={10}
                  formatar={(v) => nota(v)}
                  itens={diag.saresp.disciplinas.map((d) => ({
                    rotulo: d.nome,
                    valor: d.media,
                    tom: d.media < SARESP_CRITICO ? "critico" : tomNota(d.media),
                    detalhe: d.abaixo ? <span className="texto-critico">{d.abaixo} &lt; {SARESP_CRITICO}</span> : <span className="texto-bom">ninguém &lt; {SARESP_CRITICO}</span>,
                  }))}
                />
                <p className="diag-nota-rodape">Média da turma por disciplina (0 a 10). À direita: alunos abaixo de {SARESP_CRITICO}.</p>
              </>
            ) : (
              <p className="diag-vazio">Nenhum resultado do SARESP – Diagnóstico importado para esta turma.</p>
            )}
          </Quadro>
          <div className="diag-grade-2">
            <Quadro titulo={`Maiores médias · ${b}º bimestre`} className="diag-quadro-positivo">
              <TabelaAlunos
                alunos={melhores}
                vazio="Nenhum aluno com média 7 ou mais."
                colunas={[
                  { titulo: "Média", classe: "diag-col-num", render: (a) => <span className="texto-bom diag-destaque-num">{nota(a.mediaAtual)}</span> },
                  { titulo: "Freq.", classe: "diag-col-num", render: (a) => percentual(a.frequencia) },
                ]}
              />
            </Quadro>
            <Quadro titulo="Alunos em ascensão nas notas" className="diag-quadro-positivo">
              <TabelaAlunos
                alunos={evoluiramNotas}
                vazio="Sem bimestre anterior para comparar, ou ninguém subiu meio ponto."
                colunas={[
                  { titulo: "Média", classe: "diag-col-num", render: (a) => nota(a.mediaAtual) },
                  { titulo: "Variação", classe: "diag-col-barra", render: (a) => <Variacao valor={a.variacaoNotas ?? 0} maximo={maxVariacaoNotas} /> },
                ]}
              />
            </Quadro>
          </div>
        </Pagina>
      )}
    </div>
  );
}

export function RelatorioDiagnosticoTurma({
  cabecalho,
  alunos,
  bimestre,
  criteriosPerfil,
  criteriosDestaque,
}: {
  cabecalho: CabecalhoTurmaDiagnostico;
  alunos: AlunoDiag[];
  bimestre: string | null | undefined;
  criteriosPerfil: CriterioPerfil[];
  criteriosDestaque: CriterioDestaque[];
}) {
  const [extras, setExtras] = useState<IndicadoresExtras>(EXTRAS_VAZIOS);
  const [erroExtras, setErroExtras] = useState<string | null>(null);
  const [limite, setLimite] = useState(10);
  const [secoes, setSecoes] = useState<Set<SecaoId>>(() => new Set(SECOES.map((s) => s.id)));
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    if (!cabecalho.caminho || !tauriDisponivel) return;
    let ativo = true;
    invokeApp<IndicadoresExtras>("carregar_indicadores_diagnostico_turma", { caminho: cabecalho.caminho })
      .then((dados) => {
        if (!ativo) return;
        setExtras({ ...EXTRAS_VAZIOS, ...dados });
        setErroExtras(null);
      })
      .catch((erro) => {
        if (ativo) setErroExtras(String(erro));
      });
    return () => {
      ativo = false;
    };
  }, [cabecalho.caminho]);

  const diag = useMemo(() => calcularDiagnostico(alunos, extras, bimestre), [alunos, extras, bimestre]);

  useEffect(() => {
    if (!imprimindo) return;
    const terminar = () => {
      document.body.classList.remove("imprimindo-diagnostico");
      setImprimindo(false);
    };
    document.body.classList.add("imprimindo-diagnostico");
    window.addEventListener("afterprint", terminar, { once: true });
    // Espera o portal de impressão ser desenhado antes de abrir o diálogo.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", terminar);
      document.body.classList.remove("imprimindo-diagnostico");
    };
  }, [imprimindo]);

  function alternarSecao(id: SecaoId) {
    setSecoes((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  const relatorio = (
    <Relatorio
      diag={diag}
      cabecalho={cabecalho}
      secoes={secoes}
      limite={limite}
      criteriosPerfil={criteriosPerfil}
      criteriosDestaque={criteriosDestaque}
    />
  );

  return (
    <section className="diag-tela">
      <div className="panel diag-controles no-print">
        <div>
          <h3>Relatório diagnóstico da turma</h3>
          <p>Panorama para entregar aos professores: dificuldades, características e pontos positivos da turma no {diag.bimestreAtual}º bimestre.</p>
          {erroExtras && <p className="danger-text">Prova Paulista, tarefas e conselho não carregaram: {erroExtras}</p>}
        </div>
        <div className="diag-controles-opcoes">
          <div className="diag-secoes" role="group" aria-label="Páginas do relatório">
            {SECOES.map((secao) => (
              <label key={secao.id} className={secoes.has(secao.id) ? "ativo" : ""}>
                <input type="checkbox" checked={secoes.has(secao.id)} onChange={() => alternarSecao(secao.id)} />
                {secao.rotulo}
              </label>
            ))}
          </div>
          <label className="diag-limite">
            Alunos por ranking
            <select value={limite} onChange={(event) => setLimite(Number(event.target.value))}>
              {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="primary-action diag-imprimir" onClick={() => setImprimindo(true)} disabled={secoes.size === 0}>
            <Printer size={16} />
            Imprimir ou salvar PDF
          </button>
        </div>
      </div>
      <div className="diag-previa">{relatorio}</div>
      {imprimindo && createPortal(<div className="diag-impressao">{relatorio}</div>, document.body)}
    </section>
  );
}
