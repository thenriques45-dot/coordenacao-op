// Aba "Diagnóstico" da ficha do aluno: o recorte individual do relatório da
// turma, comparando o aluno com a média da sala. Imprime em A4 (2 páginas).

import { AlertTriangle, CheckCircle2, Lightbulb, Printer, Star } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  FREQ_CRITICA,
  leituraAluno,
  NOTA_MINIMA,
  PP_CRITICA,
  SARESP_CRITICO,
  tomFrequencia,
  tomNota,
  tomProvaPaulista,
  type DiagnosticoTurma,
  type LeituraAluno,
  type NivelAvd,
  type Tom,
} from "./calculos";
import { BarrasHorizontais, Colunas } from "./graficos";
import {
  CelulaMudancaAvd,
  Chip,
  Kpi,
  nota,
  percentual,
  Quadro,
  ROTULO_CURTO_NIVEL,
  type CabecalhoTurmaDiagnostico,
  type CriterioDestaque,
} from "./RelatorioDiagnosticoTurma";
import { useImpressaoDiagnostico } from "./useDiagnostico";
import "./diagnostico.css";

const TOM_CHIP_NIVEL: Record<NivelAvd, Tom> = { abaixo: "critico", basico: "atencao", adequado: "bom", avancado: "bom", nao: "neutro" };

function diferenca(valor: number | null) {
  if (valor === null) return null;
  const texto = Math.abs(valor).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (Math.abs(valor) < 0.05) return <span className="texto-neutro">= turma</span>;
  return valor > 0 ? <span className="texto-bom">+{texto} vs turma</span> : <span className="texto-critico">−{texto} vs turma</span>;
}

function PaginaAluno({
  leitura,
  cabecalho,
  bimestre,
  numero,
  titulo,
  children,
}: {
  leitura: LeituraAluno;
  cabecalho: CabecalhoTurmaDiagnostico;
  bimestre: number;
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  const { indicador } = leitura;
  return (
    <section className="diag-pagina diag-pagina-aluno">
      <header className="diag-pagina-topo">
        <div>
          <span className="diag-sobretitulo">Diagnóstico do aluno · {cabecalho.rotulo} · {bimestre}º bimestre</span>
          <h2>{indicador.nome}</h2>
          <p>
            {titulo} · Nº {indicador.chamada || "—"}
            {indicador.chave !== indicador.nome ? ` · RA ${indicador.chave}` : ""}
            {indicador.elegivel ? " · Educação especial" : ""}
          </p>
        </div>
        <span className="diag-numero-pagina">{numero}</span>
      </header>
      {children}
    </section>
  );
}

function ConteudoAluno({
  leitura,
  diag,
  cabecalho,
  destaques,
}: {
  leitura: LeituraAluno;
  diag: DiagnosticoTurma;
  cabecalho: CabecalhoTurmaDiagnostico;
  destaques: string[];
}) {
  const a = leitura.indicador;
  const b = diag.bimestreAtual;
  const ppTurma = Object.fromEntries(diag.provaPaulista.porBimestre.map((p) => [p.bimestre, p.media]));
  const ppComNota = a.pp.filter((p) => p.percentual !== null || !p.participou);
  const ppUltimoBim = [...a.pp].reverse().find((p) => p.percentual !== null);
  const ppDisciplinas = ppUltimoBim ? Object.entries(ppUltimoBim.disciplinas).sort((x, y) => x[1] - y[1]) : [];
  const ppTurmaDisc = Object.fromEntries(diag.provaPaulista.disciplinasUltimo.map((d) => [d.nome, d.media]));
  const sarespDisc = Object.entries(a.sarespDisciplinas).sort((x, y) => x[0].localeCompare(y[0], "pt-BR"));
  const sarespTurma = Object.fromEntries(diag.saresp.disciplinas.map((d) => [d.nome, d.media]));
  const temAvd = a.avdPortugues !== "nao" || a.avdMatematica !== "nao";
  const ppUltimoTurma = ppUltimoBim ? ppTurma[ppUltimoBim.bimestre] ?? null : null;

  return (
    <>
      <PaginaAluno leitura={leitura} cabecalho={cabecalho} bimestre={b} numero={1} titulo="Notas e frequência">
        <div className="diag-kpis">
          <Kpi
            rotulo="Média geral"
            valor={nota(a.mediaAtual)}
            tom={tomNota(a.mediaAtual)}
            detalhe={leitura.posicaoMedia ? `${leitura.posicaoMedia}ª de ${leitura.totalAlunos} · turma ${nota(diag.mediaTurma)}` : `turma ${nota(diag.mediaTurma)}`}
          />
          <Kpi
            rotulo="Frequência"
            valor={percentual(a.frequencia)}
            tom={tomFrequencia(a.frequencia)}
            detalhe={a.riscoReprovacaoFaltas ? "risco de reprovação por faltas" : `turma ${percentual(diag.frequenciaMedia)}`}
          />
          <Kpi
            rotulo={`Abaixo de ${NOTA_MINIMA}`}
            valor={String(a.disciplinasAbaixo.length)}
            tom={a.disciplinasAbaixo.length >= 3 ? "critico" : a.disciplinasAbaixo.length ? "atencao" : "bom"}
            detalhe={a.disciplinasAbaixo.length === 1 ? "disciplina" : "disciplinas"}
          />
          <Kpi
            rotulo="Prova Paulista"
            valor={percentual(a.ppUltimo)}
            tom={tomProvaPaulista(a.ppUltimo)}
            detalhe={ppUltimoBim ? `${ppUltimoBim.bimestre}º bim · turma ${percentual(ppUltimoTurma)}` : "sem dados importados"}
          />
          <Kpi
            rotulo="Tarefas realizadas"
            valor={percentual(a.tarefasPercentual)}
            tom={a.tarefasPercentual === null ? "neutro" : a.tarefasPercentual < 50 ? "critico" : a.tarefasPercentual < 75 ? "atencao" : "bom"}
            detalhe={a.tarefasPercentual === null ? "sem dados importados" : `turma ${percentual(diag.tarefasMedia)}`}
          />
          <Kpi
            rotulo="Sinais de atenção"
            valor={String(a.motivosRisco.length)}
            tom={a.pontuacaoRisco >= 8 ? "critico" : a.pontuacaoRisco > 0 ? "atencao" : "bom"}
            detalhe={a.atendimentos ? `${a.atendimentos} atendimento${a.atendimentos > 1 ? "s" : ""} registrado${a.atendimentos > 1 ? "s" : ""}` : "nenhum atendimento"}
          />
        </div>

        <div className="diag-grade-2">
          <Quadro titulo={`Notas do ${b}º bimestre comparadas à turma`}>
            <BarrasHorizontais
              maximo={10}
              formatar={(v) => nota(v)}
              vazio="Nenhuma nota lançada neste bimestre."
              itens={leitura.disciplinas.map((d) => ({
                rotulo: d.nome,
                valor: d.nota,
                tom: tomNota(d.nota),
                detalhe: diferenca(d.diferenca),
              }))}
            />
            <p className="diag-nota-rodape">Barra: nota do aluno (0 a 10). À direita: diferença para a média da turma na disciplina.</p>
          </Quadro>
          <div className="diag-coluna-quadros">
            <Quadro titulo="Média por bimestre">
              <Colunas
                maximo={10}
                formatar={(v) => nota(v)}
                itens={a.mediaPorBimestre.map((valor, i) => ({ rotulo: `${i + 1}º bim`, valor: i < b ? valor : null, tom: tomNota(valor) }))}
              />
              <p className="diag-nota-rodape">Turma no {b}º bimestre: {nota(diag.mediaTurmaPorBimestre[b - 1])}.</p>
            </Quadro>
            <Quadro titulo="Frequência">
              <ul className="diag-perfil">
                <li><span>Frequência anual</span><Chip tom={tomFrequencia(a.frequencia)}>{percentual(a.frequencia)}</Chip></li>
                {a.presencaSemanaAnterior !== null && (
                  <li><span>Presença na semana anterior</span><Chip tom={tomFrequencia(a.presencaSemanaAnterior)}>{percentual(a.presencaSemanaAnterior)}</Chip></li>
                )}
                {a.presencaSemanaAtual !== null && (
                  <li><span>Presença na semana atual</span><Chip tom={tomFrequencia(a.presencaSemanaAtual)}>{percentual(a.presencaSemanaAtual)}</Chip></li>
                )}
                {a.disciplinaMaisFaltas && (
                  <li>
                    <span>Mais ausências em {a.disciplinaMaisFaltas.nome}</span>
                    <Chip tom={tomFrequencia(a.disciplinaMaisFaltas.frequencia)}>{percentual(a.disciplinaMaisFaltas.frequencia)}</Chip>
                  </li>
                )}
                {a.faltasTotal !== null && <li><span>Faltas somadas nas disciplinas</span><strong>{a.faltasTotal}</strong></li>}
                <li>
                  <span>Risco de reprovação por faltas</span>
                  <Chip tom={a.riscoReprovacaoFaltas ? "critico" : "bom"}>{a.riscoReprovacaoFaltas ? "Sim" : "Não"}</Chip>
                </li>
              </ul>
              <p className="diag-nota-rodape">Abaixo de {FREQ_CRITICA}% há risco de retenção por falta.</p>
            </Quadro>
          </div>
        </div>
      </PaginaAluno>

      <PaginaAluno leitura={leitura} cabecalho={cabecalho} bimestre={b} numero={2} titulo="Avaliações externas e leitura">
        <div className="diag-grade-2">
          <Quadro titulo="Prova Paulista">
            {ppComNota.length ? (
              <>
                <Colunas
                  maximo={100}
                  formatar={(v) => percentual(v)}
                  itens={a.pp.map((p) => ({ rotulo: `${p.bimestre}º bim`, valor: p.percentual, tom: tomProvaPaulista(p.percentual) }))}
                />
                {ppDisciplinas.length > 0 && (
                  <>
                    <h4>Por disciplina · {ppUltimoBim?.bimestre}º bimestre</h4>
                    <BarrasHorizontais
                      maximo={100}
                      formatar={(v) => percentual(v)}
                      itens={ppDisciplinas.map(([nome, valor]) => {
                        const turma = ppTurmaDisc[nome];
                        return {
                          rotulo: nome,
                          valor,
                          tom: tomProvaPaulista(valor),
                          detalhe: turma === undefined ? undefined : <span className="texto-neutro">turma {percentual(turma)}</span>,
                        };
                      })}
                    />
                  </>
                )}
                <p className="diag-nota-rodape">Percentual de acertos. Abaixo de {PP_CRITICA}% pede retomada das habilidades.</p>
              </>
            ) : (
              <p className="diag-vazio">Nenhuma Prova Paulista importada para este aluno.</p>
            )}
          </Quadro>
          <div className="diag-coluna-quadros">
            <Quadro titulo="AvD (Recomposição – Diagnóstico)">
              {temAvd ? (
                <ul className="diag-perfil">
                  {([["Língua Portuguesa", a.avdPortugues, a.mudancaPortugues], ["Matemática", a.avdMatematica, a.mudancaMatematica]] as const).map(([rotulo, nivel, mudanca]) => (
                    <li key={rotulo}>
                      <span className="diag-avd-componente">
                        {rotulo}
                        <small><CelulaMudancaAvd mudanca={mudanca} /></small>
                      </span>
                      <Chip tom={TOM_CHIP_NIVEL[nivel]}>{ROTULO_CURTO_NIVEL[nivel]}</Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="diag-vazio">Nenhuma AvD importada para este aluno.</p>
              )}
            </Quadro>
            <Quadro titulo={a.sarespMedia !== null ? `SARESP · nota média ${nota(a.sarespMedia)}` : "SARESP"}>
              {sarespDisc.length ? (
                <BarrasHorizontais
                  maximo={10}
                  formatar={(v) => nota(v)}
                  itens={sarespDisc.map(([nome, valor]) => ({
                    rotulo: nome,
                    valor,
                    tom: valor < SARESP_CRITICO ? "critico" : tomNota(valor),
                    detalhe: sarespTurma[nome] === undefined ? undefined : <span className="texto-neutro">turma {nota(sarespTurma[nome])}</span>,
                  }))}
                />
              ) : (
                <p className="diag-vazio">Nenhum resultado do SARESP – Diagnóstico para este aluno.</p>
              )}
            </Quadro>
          </div>
        </div>

        {(leitura.listas.length > 0 || destaques.length > 0) && (
          <Quadro titulo="No relatório da turma">
            <div className="diag-chips">
              {destaques.map((titulo) => (
                <Chip key={titulo} tom="bom"><Star size={12} /> {titulo}</Chip>
              ))}
              {leitura.listas.map((item) => (
                <Chip key={item.lista} tom={item.tom}>{item.lista} · {item.posicao}º</Chip>
              ))}
            </div>
          </Quadro>
        )}

        <div className="diag-grade-2">
          <Quadro titulo="Pontos de atenção" className="diag-quadro-atencao">
            {leitura.pontosAtencao.length ? (
              <ul className="diag-alertas">
                {leitura.pontosAtencao.slice(0, 7).map((alerta) => (
                  <li key={alerta.titulo} className={`tom-borda-${alerta.tom}`}>
                    <AlertTriangle size={15} className={`texto-${alerta.tom}`} />
                    <div><strong>{alerta.titulo}</strong>{alerta.texto && <span>{alerta.texto}</span>}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="diag-vazio">Nenhum sinal de atenção com os dados disponíveis.</p>
            )}
          </Quadro>
          <Quadro titulo="Pontos positivos" className="diag-quadro-positivo">
            {leitura.pontosPositivos.length ? (
              <ul className="diag-alertas">
                {leitura.pontosPositivos.slice(0, 7).map((alerta) => (
                  <li key={alerta.titulo} className="tom-borda-bom">
                    <CheckCircle2 size={15} className="texto-bom" />
                    <div><strong>{alerta.titulo}</strong>{alerta.texto && <span>{alerta.texto}</span>}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="diag-vazio">Ainda não há destaques positivos claros nos dados importados.</p>
            )}
          </Quadro>
        </div>
        <Quadro titulo="Sugestões de abordagem" className="diag-quadro-sugestoes">
          <ol className="diag-sugestoes">
            {leitura.sugestoes.slice(0, 6).map((sugestao) => (
              <li key={sugestao}><Lightbulb size={14} /> {sugestao}</li>
            ))}
          </ol>
          <p className="diag-nota-rodape">Sugestões geradas a partir dos indicadores; servem de ponto de partida para a conversa com o aluno, a família e os professores.</p>
        </Quadro>
      </PaginaAluno>
    </>
  );
}

export function DiagnosticoAluno({
  diag,
  chave,
  cabecalho,
  criteriosDestaque,
  erroExtras,
}: {
  diag: DiagnosticoTurma;
  chave: string;
  cabecalho: CabecalhoTurmaDiagnostico;
  criteriosDestaque: CriterioDestaque[];
  erroExtras?: string | null;
}) {
  const { imprimindo, imprimir } = useImpressaoDiagnostico();
  const leitura = leituraAluno(diag, chave);
  if (!leitura) {
    return <p className="diag-vazio diag-vazio-grande">O diagnóstico considera só os alunos ativos da turma.</p>;
  }
  const nomeNormalizado = leitura.indicador.nome.trim().toLocaleUpperCase("pt-BR");
  const destaques = diag.destaques
    ? criteriosDestaque
        .filter((c) => (diag.destaques?.nomes[c.id] ?? "").trim().toLocaleUpperCase("pt-BR") === nomeNormalizado)
        .map((c) => `${c.titulo} (conselho do ${diag.destaques?.bimestre}º bim)`)
    : [];
  const conteudo = <ConteudoAluno leitura={leitura} diag={diag} cabecalho={cabecalho} destaques={destaques} />;

  return (
    <section className="diag-tela diag-tela-aluno">
      <div className="diag-tela-barra no-print">
        <p>O mesmo diagnóstico do relatório da turma, recortado para este aluno e comparado com a média da sala.</p>
        <button type="button" className="secondary-action" onClick={imprimir}>
          <Printer size={16} />
          Imprimir diagnóstico
        </button>
      </div>
      {erroExtras && <p className="danger-text no-print">Prova Paulista, tarefas e conselho não carregaram: {erroExtras}</p>}
      <div className="diag-relatorio diag-modo-tela">{conteudo}</div>
      {imprimindo &&
        createPortal(
          <div className="diag-impressao">
            <div className="diag-relatorio diag-modo-papel">{conteudo}</div>
          </div>,
          document.body,
        )}
    </section>
  );
}
