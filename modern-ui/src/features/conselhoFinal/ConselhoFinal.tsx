import { AlertTriangle, CheckCircle2, ClipboardList, FileText, Lock, RotateCcw, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { invokeApp } from "../appBridge";
import {
  FREQUENCIA_MINIMA,
  LIMITE_APC,
  NOTA_MINIMA,
  ROTULO_RESULTADO,
  ROTULO_STATUS,
  RETIDAS_RETENCAO,
  type DadosConselhoFinal,
  type LinhaDisciplinaCf,
  type RegistroAlunoCf,
  type RegistroDisciplinaCf,
  type Resultado,
  type ResultadoCalculado,
  type SituacaoAlunoCf,
  type StatusDisciplina,
  aplicarNovoQuinto,
  aplicarStatus,
  formatarNota,
  formatarPercentual,
  lerNota,
  rotuloCalculado,
  siglaAta,
} from "./calculos";
import "./conselhoFinal.css";

// ---------------------------------------------------------------------------
// Dados salvos (conselho_final no arquivo da turma, um registro por aluno)
// ---------------------------------------------------------------------------

function limparRegistro(registro: RegistroAlunoCf): RegistroAlunoCf {
  const limpo: RegistroAlunoCf = {};
  const disciplinas: Record<string, RegistroDisciplinaCf> = {};
  for (const [nome, item] of Object.entries(registro.disciplinas ?? {})) {
    const d: RegistroDisciplinaCf = {};
    if (item.status) d.status = item.status;
    if (typeof item.quinto === "number") d.quinto = item.quinto;
    if (Object.keys(d).length) disciplinas[nome] = d;
  }
  if (Object.keys(disciplinas).length) limpo.disciplinas = disciplinas;
  if (registro.limite_apc_ignorado) limpo.limite_apc_ignorado = true;
  if (registro.decisao) {
    limpo.decisao = registro.decisao;
    limpo.decidido_sobre = registro.decidido_sobre ?? null;
  }
  return limpo;
}

export function useConselhoFinal(caminho: string, ativo: boolean) {
  const [dados, setDados] = useState<DadosConselhoFinal>({});
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState("");
  const pendentes = useRef<Map<string, { caminho: string; registro: RegistroAlunoCf }>>(new Map());
  const timer = useRef<number | null>(null);

  function gravarPendentes() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const itens = [...pendentes.current.entries()];
    pendentes.current.clear();
    for (const [chave, item] of itens) {
      invokeApp("salvar_conselho_final", { caminho: item.caminho, chave, registro: item.registro }).catch((err) =>
        setErro(`Não foi possível salvar o conselho final: ${String(err)}`),
      );
    }
  }

  function recarregar() {
    if (!caminho || !ativo) return Promise.resolve();
    return invokeApp<Record<string, unknown>>("carregar_conselho_final", { caminho })
      .then((valor) => {
        const mapa = valor && typeof valor === "object" ? { ...valor } : {};
        const turma = (mapa._turma ?? {}) as { tempo_segundos?: number; texto_ata?: string; finalizado_em?: string };
        delete mapa._turma;
        setDados({ alunos: mapa as Record<string, RegistroAlunoCf>, ...turma });
        setCarregado(true);
      })
      .catch((err) => {
        setDados({});
        setErro(String(err));
      });
  }

  useEffect(() => {
    setCarregado(false);
    setErro("");
    if (!caminho || !ativo) {
      setDados({});
      return;
    }
    recarregar();
    return () => gravarPendentes();
  }, [caminho, ativo]);

  function salvarAluno(chave: string, mudar: (atual: RegistroAlunoCf) => RegistroAlunoCf, imediato = false) {
    if (!caminho || !carregado) return;
    setDados((atual) => {
      const registro = limparRegistro(mudar(atual.alunos?.[chave] ?? {}));
      pendentes.current.set(chave, { caminho, registro });
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(gravarPendentes, imediato ? 0 : 400);
      return { ...atual, alunos: { ...(atual.alunos ?? {}), [chave]: registro } };
    });
  }

  return { dados, carregado, erro, salvarAluno, gravarPendentes, recarregar };
}

// ---------------------------------------------------------------------------
// Peças visuais
// ---------------------------------------------------------------------------

export function SeloResultado({ valor, curto }: { valor: ResultadoCalculado | Resultado | null; curto?: boolean }) {
  if (!valor) return null;
  const curtos: Record<string, string> = {
    ap: "Aprovado",
    apc: "Aprov. conselho",
    app: "Aprov. parcial",
    rt: "Retido",
    decidir: "Decidir",
    pendente: "Falta nota",
  };
  const classe = valor === "decidir" || valor === "pendente" ? "pend" : valor;
  return <span className={`cf-selo cf-${classe}`}>{curto ? curtos[valor] : rotuloCalculado(valor)}</span>;
}

function classeNota(valor: number | null) {
  if (valor === null) return "";
  return valor < NOTA_MINIMA ? "cf-nota-baixa" : "cf-nota-ok";
}

function CampoNota({
  valor,
  alterado,
  mapao,
  onSalvar,
  rotulo,
}: {
  valor: number | null;
  alterado: boolean;
  mapao: number | null;
  onSalvar: (nota: number | null) => Promise<void> | void;
  rotulo: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(false);

  function iniciar() {
    setTexto(valor === null ? "" : formatarNota(valor));
    setErro(false);
    setEditando(true);
  }

  function concluir() {
    const nota = lerNota(texto);
    if (nota === undefined) {
      setErro(true);
      return;
    }
    setEditando(false);
    if (nota === valor) return;
    Promise.resolve(onSalvar(nota)).catch(() => setErro(true));
  }

  return (
    <div className="cf-campo-nota">
      {editando ? (
        <input
          autoFocus
          inputMode="decimal"
          className={erro ? "erro" : ""}
          value={texto}
          aria-label={rotulo}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={concluir}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditando(false);
          }}
        />
      ) : (
        <button
          type="button"
          className={`cf-nota-editavel ${alterado ? "alterada" : ""} ${classeNota(valor)}`}
          onClick={iniciar}
          title={`Clique para alterar (${rotulo})`}
        >
          {formatarNota(valor)}
        </button>
      )}
      {alterado && <span className="cf-mapao">mapão: {formatarNota(mapao)}</span>}
    </div>
  );
}

function BotoesStatus({ linha, onEscolher }: { linha: LinhaDisciplinaCf; onEscolher: (s: StatusDisciplina) => void }) {
  return (
    <div className="cf-status" role="group" aria-label={`Decisão em ${linha.disciplina.nome}`}>
      {(["ap", "apc", "rt"] as StatusDisciplina[]).map((status) => (
        <button
          key={status}
          type="button"
          title={ROTULO_RESULTADO[status]}
          className={linha.status === status ? `ativo cf-on-${status}` : ""}
          onClick={() => onEscolher(status)}
        >
          {ROTULO_STATUS[status]}
        </button>
      ))}
    </div>
  );
}

function textoBanner(situacao: SituacaoAlunoCf) {
  const nomes = (lista: LinhaDisciplinaCf[]) => lista.map((l) => l.disciplina.nome).join(", ");
  const partes: string[] = [];
  if (situacao.retidas.length) {
    partes.push(`${situacao.retidas.length} disciplina${situacao.retidas.length === 1 ? "" : "s"} retida${situacao.retidas.length === 1 ? "" : "s"} (${nomes(situacao.retidas)})`);
  }
  if (situacao.aprovadasConselho.length) {
    partes.push(`${situacao.aprovadasConselho.length} aprovada${situacao.aprovadasConselho.length === 1 ? "" : "s"} pelo conselho (${nomes(situacao.aprovadasConselho)})`);
  }
  return partes.length ? partes.join(" e ") : "todas as disciplinas aprovadas";
}

// ---------------------------------------------------------------------------
// Painel do aluno no conselho final
// ---------------------------------------------------------------------------

export function PainelConselhoFinal({
  situacao,
  semQuintoConceito,
  onMudarDisciplina,
  onSalvarQuarto,
  onIgnorarLimite,
}: {
  situacao: SituacaoAlunoCf;
  /** A turma ainda não tem o mapão do 5º conceito importado. */
  semQuintoConceito: boolean;
  onMudarDisciplina: (disciplina: string, registro: RegistroDisciplinaCf) => void;
  onSalvarQuarto: (linha: LinhaDisciplinaCf, nota: number | null) => Promise<void>;
  onIgnorarLimite: () => void;
}) {
  const [limiteAberto, setLimiteAberto] = useState<{ disciplina: string; anterior: RegistroDisciplinaCf } | null>(null);

  // Mudou a disciplina e passou do limite de apc: pergunta corrigir ou ignorar.
  function mudar(linha: LinhaDisciplinaCf, registro: RegistroDisciplinaCf) {
    const anterior: RegistroDisciplinaCf = {
      status: linha.statusAutomatico ? null : linha.status,
      quinto: linha.quintoAlterado ? linha.quinto : null,
    };
    onMudarDisciplina(linha.disciplina.nome, registro);
    const virouApc = registro.status === "apc" && linha.status !== "apc";
    if (virouApc && situacao.aprovadasConselho.length + 1 > LIMITE_APC && !situacao.registro.limite_apc_ignorado) {
      setLimiteAberto({ disciplina: linha.disciplina.nome, anterior });
    }
  }

  const bannerClasse =
    situacao.calculado === "ap" ? "ok" : situacao.calculado === "pendente" || situacao.calculado === "decidir" ? "pend" : situacao.calculado;

  return (
    <div className="cf-painel">
      {semQuintoConceito && (
        <div className="data-warning neutral">
          Esta turma ainda não tem o 5º conceito. Importe o mapão do 5º conceito em Importar dados. Enquanto isso, o conselho pode digitar a nota em cada disciplina.
        </div>
      )}
      {situacao.frequenciaBaixa && (
        <div className="cf-banner cf-banner-freq">
          <span className="cf-selo cf-rt">Frequência {formatarPercentual(situacao.frequenciaAno)}</span>
          <div>
            Abaixo de {FREQUENCIA_MINIMA}%: pela frequência o aluno estaria <b>retido</b>. O conselho pode aprovar, mas cada professor de disciplina aprovada terá que <b>lançar compensação de ausências</b> (sai no relatório dos professores).
          </div>
        </div>
      )}
      <div className={`cf-banner cf-banner-${bannerClasse}`}>
        <SeloResultado valor={situacao.calculado} />
        <div>
          {situacao.calculado === "pendente" ? (
            <>Falta o 5º conceito ou a decisão em: <b>{situacao.pendentes.map((l) => l.disciplina.nome).join(", ")}</b>. Sem isso o conselho final não pode ser encerrado.</>
          ) : situacao.calculado === "decidir" ? (
            <>Sem resultado possível: <b>{textoBanner(situacao)}</b>. {situacao.motivoDecidir} A coordenação decide entre retornar ao conselho ou reter o aluno.</>
          ) : situacao.calculado === "rt" ? (
            <>Resultado calculado: <b>{textoBanner(situacao)}</b>. Retido em {RETIDAS_RETENCAO} ou mais disciplinas.</>
          ) : (
            <>Resultado calculado: <b>{textoBanner(situacao)}</b>.{situacao.calculado !== "ap" && " A coordenação confirma no encerramento."}</>
          )}
        </div>
      </div>

      <div className="cf-tabela-wrap">
        <table className="cf-tabela">
          <thead>
            <tr>
              <th>Disciplina</th>
              <th className="cf-num"><Lock size={11} /> 1º bim</th>
              <th className="cf-num"><Lock size={11} /> 2º bim</th>
              <th className="cf-num"><Lock size={11} /> 3º bim</th>
              <th className="cf-num">4º bim</th>
              <th className="cf-num">5º conceito</th>
              <th className="cf-num">Faltas no ano</th>
              <th>Decisão do conselho</th>
            </tr>
          </thead>
          <tbody>
            {situacao.disciplinas.map((linha) => (
              <tr key={linha.disciplina.nome} className={linha.status === null || linha.quinto === null ? "cf-linha-pendente" : ""}>
                <td>
                  <strong>{linha.disciplina.nome}</strong>
                  {linha.expansao && <span className="cf-tag-exp">expansão</span>}
                </td>
                {linha.notas.slice(0, 3).map((nota, idx) => (
                  <td key={idx} className={`cf-num cf-travada ${classeNota(nota)}`}>{formatarNota(nota)}</td>
                ))}
                <td className="cf-num">
                  <CampoNota
                    valor={linha.notas[3]}
                    alterado={linha.disciplina.mediaConselho !== null && linha.disciplina.mediaConselho !== linha.nota4Mapao}
                    mapao={linha.nota4Mapao}
                    rotulo={`4º bimestre de ${linha.disciplina.nome}`}
                    onSalvar={(nota) => onSalvarQuarto(linha, nota)}
                  />
                </td>
                <td className="cf-num">
                  <CampoNota
                    valor={linha.quinto}
                    alterado={linha.quintoAlterado}
                    mapao={linha.quintoMapao}
                    rotulo={`5º conceito de ${linha.disciplina.nome}`}
                    onSalvar={(nota) => mudar(linha, aplicarNovoQuinto(linha, nota))}
                  />
                </td>
                <td className={`cf-num ${linha.excessoFaltas ? "cf-faltas-altas" : ""}`}>
                  {linha.faltas ?? "-"}
                </td>
                <td>
                  <BotoesStatus linha={linha} onEscolher={(status) => mudar(linha, aplicarStatus(linha, status))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cf-legenda">
        <Lock size={12} /> 1º a 3º bimestre só para consulta. O 4º bimestre e o 5º conceito podem ser alterados aqui; nota alterada fica roxa e vai para o relatório dos professores. Aprovar uma disciplina com 5º conceito abaixo de {NOTA_MINIMA} leva a nota a {NOTA_MINIMA}. Faltas em vermelho: mais de {100 - FREQUENCIA_MINIMA}% de faltas na disciplina.
      </p>

      {limiteAberto && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="kanban-task-modal cf-modal">
            <div className="cf-modal-titulo">
              <span className="cf-icone aviso"><AlertTriangle size={18} /></span>
              <h2>Mais de {LIMITE_APC} disciplinas aprovadas pelo conselho</h2>
            </div>
            <p>
              <b>{situacao.aluno.nome}</b> está com <b>{situacao.aprovadasConselho.length + (situacao.aprovadasConselho.some((l) => l.disciplina.nome === limiteAberto.disciplina) ? 0 : 1)} disciplinas</b> marcadas como "Aprovado pelo Conselho". O limite é {LIMITE_APC}.
            </p>
            <p>Se ignorar, o resultado fica "Aprovado pelo Conselho" e as atas não mencionam o limite.</p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  onIgnorarLimite();
                  setLimiteAberto(null);
                }}
              >
                Ignorar e manter
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  onMudarDisciplina(limiteAberto.disciplina, limiteAberto.anterior);
                  setLimiteAberto(null);
                }}
              >
                Corrigir o conselho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aviso ao sair de um aluno sem resultado possível (4 retidas no médio,
// fundamental com retidas, expansão retida)
// ---------------------------------------------------------------------------

export function ModalDecidirAluno({
  situacao,
  onRetornar,
  onReter,
}: {
  situacao: SituacaoAlunoCf;
  onRetornar: () => void;
  onReter: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="kanban-task-modal cf-modal">
        <div className="cf-modal-titulo">
          <span className="cf-icone perigo"><AlertTriangle size={18} /></span>
          <h2>Aluno sem resultado possível</h2>
        </div>
        <p>
          <b>{situacao.aluno.nome}</b> ficou retido em <b>{situacao.retidas.length} disciplina{situacao.retidas.length === 1 ? "" : "s"}</b> ({situacao.retidas.map((l) => l.disciplina.nome).join(", ")}). {situacao.motivoDecidir}
        </p>
        <p>
          O conselho é soberano e pode reter, mas uma retenção com menos de {RETIDAS_RETENCAO} disciplinas é <b>facilmente contestada</b>. Tem certeza?
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onRetornar}>Retornar ao conselho</button>
          <button type="button" className="cf-botao-escuro" onClick={onReter}>Reter aluno</button>
        </div>
      </div>
    </div>
  );
}

export function ModalConfirmarRetencao({
  situacao,
  onCancelar,
  onReter,
}: {
  situacao: SituacaoAlunoCf;
  onCancelar: () => void;
  onReter: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="kanban-task-modal cf-modal">
        <div className="cf-modal-titulo">
          <span className="cf-icone perigo"><AlertTriangle size={18} /></span>
          <h2>Reter {situacao.aluno.nome}?</h2>
        </div>
        <p>
          O resultado calculado é <b>{rotuloCalculado(situacao.calculado)}</b>
          {situacao.retidas.length ? `, com ${situacao.retidas.length} disciplina${situacao.retidas.length === 1 ? "" : "s"} retida${situacao.retidas.length === 1 ? "" : "s"}` : ""}.
        </p>
        <p>
          O conselho é soberano e pode reter, mas uma retenção com menos de {RETIDAS_RETENCAO} disciplinas é <b>facilmente contestada</b>. Tem certeza?
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="cf-botao-escuro" onClick={onReter}>Reter o aluno</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela de confirmação do resultado final
// ---------------------------------------------------------------------------

function resumoDisciplinas(situacao: SituacaoAlunoCf) {
  const nomes = (lista: LinhaDisciplinaCf[]) => lista.map((l) => l.disciplina.nome).join(", ");
  if (situacao.calculado === "pendente") {
    return `Sem 5º conceito ou sem decisão: ${nomes(situacao.pendentes)}`;
  }
  const partes: string[] = [];
  if (situacao.aprovadasConselho.length) partes.push(`Aprovado pelo conselho em ${situacao.aprovadasConselho.length}: ${nomes(situacao.aprovadasConselho)}`);
  if (situacao.retidas.length) partes.push(`Retido em ${situacao.retidas.length}: ${nomes(situacao.retidas)}`);
  if (situacao.calculado === "decidir") partes.push(situacao.motivoDecidir);
  if (situacao.frequenciaBaixa) partes.push(`Frequência ${formatarPercentual(situacao.frequenciaAno)}`);
  return partes.join(" · ") || "Todas as disciplinas aprovadas";
}

export function ConfirmacaoResultadoFinal({
  turmaLabel,
  situacoes,
  onFechar,
  onAbrirAluno,
  onDecidir,
  onGerarAtas,
}: {
  turmaLabel: string;
  situacoes: SituacaoAlunoCf[];
  onFechar: () => void;
  onAbrirAluno: (situacao: SituacaoAlunoCf) => void;
  onDecidir: (situacao: SituacaoAlunoCf, decisao: "manter" | "reter" | null) => void;
  onGerarAtas: () => void;
}) {
  const [reterAberto, setReterAberto] = useState<SituacaoAlunoCf | null>(null);
  const [mostrarDiretos, setMostrarDiretos] = useState(false);
  const diretos = situacoes.filter((s) => s.aprovadoDireto);
  const outros = situacoes.filter((s) => !s.aprovadoDireto);
  const pendentes = situacoes.filter((s) => s.calculado === "pendente");
  const semDecisao = outros.filter((s) => s.calculado !== "pendente" && !s.confirmado);
  const contar = (r: Resultado) => situacoes.filter((s) => s.confirmado && s.final === r).length;
  const pode = pendentes.length === 0 && semDecisao.length === 0;

  function linha(situacao: SituacaoAlunoCf) {
    const { calculado, registro } = situacao;
    let acoes: ReactNode;
    if (calculado === "pendente") {
      acoes = null;
    } else if (calculado === "decidir") {
      const reteve = situacao.confirmado && situacao.final === "rt";
      acoes = (
        <div className="cf-escolha">
          <button type="button" onClick={() => onAbrirAluno(situacao)}><RotateCcw size={14} /> Retornar ao conselho</button>
          <button type="button" className={reteve ? "sel" : ""} onClick={() => (reteve ? onDecidir(situacao, null) : setReterAberto(situacao))}>
            <X size={14} /> Reter o aluno
          </button>
        </div>
      );
    } else if (calculado === "ap") {
      acoes = null;
    } else {
      const manteve = situacao.confirmado && registro.decisao === "manter";
      const reteve = situacao.confirmado && registro.decisao === "reter";
      acoes = (
        <div className="cf-escolha">
          <button type="button" className={manteve ? "sel" : ""} onClick={() => onDecidir(situacao, manteve ? null : "manter")}>
            <CheckCircle2 size={14} /> Manter {ROTULO_RESULTADO[calculado].toLocaleLowerCase("pt-BR")}
          </button>
          {calculado !== "rt" && (
            <button type="button" className={reteve ? "sel" : ""} onClick={() => (reteve ? onDecidir(situacao, null) : setReterAberto(situacao))}>
              <X size={14} /> Reter o aluno
            </button>
          )}
        </div>
      );
    }
    return (
      <div key={situacao.chave} className={`cf-conf-linha ${situacao.confirmado && !situacao.aprovadoDireto ? "feito" : ""}`}>
        <div className="cf-conf-num">{situacao.aluno.chamada || "-"}</div>
        <div className="cf-conf-nome">
          <b>{situacao.aluno.nome}</b>
          {situacao.confirmado && !situacao.aprovadoDireto && (
            <small className="cf-confirmado"><CheckCircle2 size={12} /> {ROTULO_RESULTADO[situacao.final as Resultado]}</small>
          )}
        </div>
        <div className="cf-conf-disc">{resumoDisciplinas(situacao)}</div>
        <div className="cf-conf-acoes">
          <div className="cf-calc">
            Resultado calculado: <SeloResultado valor={calculado} />
          </div>
          {acoes && (
            <div className="cf-decisao-rotulo">
              Decisão da coordenação{calculado === "decidir" && <em> (obrigatória)</em>}
            </div>
          )}
          {acoes}
          <button type="button" className="cf-link" onClick={() => onAbrirAluno(situacao)}>Abrir aluno no conselho</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop cf-confirmacao-fundo" role="dialog" aria-modal="true">
      <section className="cf-confirmacao">
        <header className="cf-conf-topo">
          <div>
            <span className="eyebrow">{turmaLabel}</span>
            <h2>Confirmar resultado final</h2>
          </div>
          <div className="cf-conf-botoes">
            <button type="button" onClick={onFechar}>← Voltar ao conselho</button>
            <button type="button" className="primary-action" disabled={!pode} onClick={onGerarAtas}>
              <FileText size={16} /> Confirmar e gerar as atas
            </button>
          </div>
        </header>

        <div className="cf-contadores">
          <div><strong className="cf-c-ap">{contar("ap")}</strong><span>Aprovados</span></div>
          <div><strong className="cf-c-apc">{contar("apc")}</strong><span>Aprovados pelo conselho</span></div>
          <div><strong className="cf-c-app">{contar("app")}</strong><span>Aprovados parcialmente</span></div>
          <div><strong className="cf-c-rt">{contar("rt")}</strong><span>Retidos</span></div>
          <div><strong>{pendentes.length + semDecisao.length}</strong><span>Falta decidir</span></div>
        </div>

        {pendentes.length > 0 && (
          <div className="cf-bloqueio">
            <b>Não dá para encerrar ainda.</b>{" "}
            {pendentes.map((s) => `${s.aluno.nome} (${s.pendentes.map((l) => l.disciplina.nome).join(", ")})`).join("; ")}{" "}
            {pendentes.length === 1 ? "está" : "estão"} sem 5º conceito ou sem decisão. O conselho precisa dar uma nota e um status.
          </div>
        )}

        <div className="panel cf-conf-lista">
          <h3>Alunos que não foram aprovados direto</h3>
          <p className="cf-conf-ajuda">
            Para cada aluno, a coordenação mantém o resultado calculado ou escolhe outro caminho. "Reter o aluno" sempre pede confirmação, porque retenção com menos de {RETIDAS_RETENCAO} disciplinas é facilmente contestada. Se o conselho mudar alguma decisão depois, a confirmação do aluno é desfeita.
          </p>
          {outros.length ? outros.map(linha) : <div className="empty-special-list">Todos os alunos foram aprovados direto.</div>}
        </div>

        <div className="panel cf-conf-lista">
          <button type="button" className="cf-link" onClick={() => setMostrarDiretos((v) => !v)}>
            {mostrarDiretos ? "Esconder" : "Mostrar"} os {diretos.length} aprovados direto
          </button>
          {mostrarDiretos && diretos.map(linha)}
        </div>
      </section>

      {reterAberto && (
        <ModalConfirmarRetencao
          situacao={reterAberto}
          onCancelar={() => setReterAberto(null)}
          onReter={() => {
            onDecidir(reterAberto, "reter");
            setReterAberto(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Encerramento: texto das atas e geração dos documentos
// ---------------------------------------------------------------------------

export type DocumentosConselhoFinalInput = {
  texto_ata: string;
  disciplinas: string[];
  alunos: { matricula: string; resultado: string; siglas: Record<string, string>; frequencia: string }[];
  pendencias: { disciplina: string; tipo: "quinto" | "quarto" | "compensacao"; numero: string; aluno: string; de: string; para: string; detalhe: string }[];
  gerar_relatorio: boolean;
};

export function montarDocumentosConselhoFinal(
  situacoes: SituacaoAlunoCf[],
  textoAta: string,
  gerarRelatorio: boolean,
): DocumentosConselhoFinalInput {
  const disciplinas = new Map<string, boolean>();
  for (const s of situacoes) for (const l of s.disciplinas) disciplinas.set(l.disciplina.nome, l.expansao);
  const ordem = [...disciplinas.entries()]
    .sort((a, b) => Number(a[1]) - Number(b[1]) || a[0].localeCompare(b[0], "pt-BR"))
    .map(([nome]) => nome);

  const pendencias: DocumentosConselhoFinalInput["pendencias"] = [];
  for (const s of situacoes) {
    const numero = s.aluno.chamada ? String(s.aluno.chamada) : "";
    for (const l of s.disciplinas) {
      if (l.quintoAlterado) {
        pendencias.push({
          disciplina: l.disciplina.nome,
          tipo: "quinto",
          numero,
          aluno: s.aluno.nome,
          de: formatarNota(l.quintoMapao),
          para: formatarNota(l.quinto),
          detalhe: l.status ? ROTULO_RESULTADO[l.status] : "",
        });
      }
      const conselho = l.disciplina.mediaConselho;
      if (conselho !== null && conselho !== l.nota4Mapao) {
        pendencias.push({
          disciplina: l.disciplina.nome,
          tipo: "quarto",
          numero,
          aluno: s.aluno.nome,
          de: formatarNota(l.nota4Mapao),
          para: formatarNota(conselho),
          detalhe: "",
        });
      }
      if (s.frequenciaBaixa && s.final !== "rt" && (l.status === "ap" || l.status === "apc")) {
        pendencias.push({
          disciplina: l.disciplina.nome,
          tipo: "compensacao",
          numero,
          aluno: s.aluno.nome,
          de: formatarPercentual(s.frequenciaAno),
          para: l.faltas === null ? "-" : String(l.faltas),
          detalhe: "",
        });
      }
    }
  }

  return {
    texto_ata: textoAta,
    disciplinas: ordem,
    alunos: situacoes.map((s) => ({
      matricula: s.aluno.matricula ?? "",
      resultado: s.final ? ROTULO_RESULTADO[s.final] : "",
      siglas: Object.fromEntries(s.disciplinas.map((l) => [l.disciplina.nome, siglaAta(s, l)])),
      frequencia: s.frequenciaAno === null ? "" : String(Math.round(s.frequenciaAno)),
    })),
    pendencias,
    gerar_relatorio: gerarRelatorio,
  };
}

type FinalizacaoResultado = { ata: string | null; relatorio: string | null };

export function EncerramentoConselhoFinal({
  turmaLabel,
  caminho,
  bimestre,
  tempoSegundos,
  textoAta4Inicial,
  textoAtaFinalInicial,
  situacoes,
  onClose,
  onFinished,
  aoFinalizado,
}: {
  turmaLabel: string;
  caminho: string;
  bimestre: string;
  tempoSegundos: number;
  textoAta4Inicial: string;
  textoAtaFinalInicial: string;
  situacoes: SituacaoAlunoCf[];
  onClose: () => void;
  onFinished: () => void;
  aoFinalizado: () => void;
}) {
  const [textoAta4, setTextoAta4] = useState(textoAta4Inicial);
  const [textoFinal, setTextoFinal] = useState(textoAtaFinalInicial);
  const [gerarRelatorio, setGerarRelatorio] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<{ ata4: string | null; rel4: string | null; ataFinal: string; relFinal: string | null } | null>(null);

  async function gerar() {
    setErro("");
    setSalvando(true);
    try {
      const quarto = await invokeApp<FinalizacaoResultado>("salvar_finalizacao_conselho", {
        caminho,
        bimestre,
        finalizacao: { texto: textoAta4, tempo_segundos: tempoSegundos, gerar_ata: true, gerar_relatorio: gerarRelatorio },
      });
      const final = await invokeApp<{ ata: string; relatorio: string | null }>("gerar_documentos_conselho_final", {
        caminho,
        input: montarDocumentosConselhoFinal(situacoes, textoFinal, gerarRelatorio),
      });
      setFeito({ ata4: quarto.ata, rel4: quarto.relatorio, ataFinal: final.ata, relFinal: final.relatorio });
      aoFinalizado();
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel finish-council-panel" role="dialog" aria-modal="true" aria-labelledby="cf-encerrar-titulo">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{turmaLabel}</span>
            <h2 id="cf-encerrar-titulo">Encerrar conselho final</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="finish-council-body">
          <label>
            Texto da ata do 4º bimestre
            <textarea value={textoAta4} onChange={(e) => setTextoAta4(e.target.value)} rows={6} />
          </label>
          <label>
            Texto da ata do resultado final
            <textarea value={textoFinal} onChange={(e) => setTextoFinal(e.target.value)} rows={6} />
          </label>
          <div className="document-options">
            <button className={gerarRelatorio ? "selected" : ""} onClick={() => setGerarRelatorio((v) => !v)}>
              <ClipboardList size={18} />
              Gerar relatórios para professores
            </button>
          </div>
          <p className="cf-legenda">Serão geradas a ata do 4º bimestre (com os encaminhamentos) e a ata do resultado final, com todos os alunos da turma.</p>

          {erro && <div className="inline-edit-error">{erro}</div>}
          {feito && (
            <div className="finish-confirmation">
              <strong>Conselho final encerrado.</strong>
              {feito.ata4 && <span>Ata do 4º bimestre: {feito.ata4}</span>}
              <span>Ata do resultado final: {feito.ataFinal}</span>
              {feito.rel4 && <span>Relatório dos professores (4º bimestre): {feito.rel4}</span>}
              {feito.relFinal && <span>Relatório dos professores (conselho final): {feito.relFinal}</span>}
            </div>
          )}
        </div>

        <div className="modal-actions">
          {feito ? (
            <button className="primary-action" onClick={onFinished}>Fechar modo reunião</button>
          ) : (
            <>
              <button onClick={onClose}>Voltar</button>
              <button className="primary-action" onClick={gerar} disabled={salvando}>
                {salvando ? "Gerando..." : "Gerar as atas"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

