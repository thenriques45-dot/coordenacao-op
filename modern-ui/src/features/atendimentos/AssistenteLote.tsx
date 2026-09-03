import { Check, ChevronDown, GripVertical, Info, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeApp } from "../appBridge";
import type { MensagemTemplate } from "../SettingsPage";
import { tomFrequencia } from "./lote";
import {
  CAMPOS,
  OPERADORES,
  ORDENS,
  PRESETS,
  operadoresDoTipo,
  ordenarFila,
  rotuloCampo,
  tipoDoCampo,
  type AlunoLote,
  type Condicao,
  type OrdemFila,
} from "./lote";

const TETO_FILA_ASSISTIDA = 40;

let seq = 0;
const novoId = () => `c${Date.now().toString(36)}_${seq++}`;

type Passo = "modelo" | "destinatarios" | "enviar";

export function AssistenteLote({
  turma,
  bimestre,
  templates,
  onSair,
}: {
  turma: { codigo: string; caminho: string };
  bimestre: string;
  templates: MensagemTemplate[];
  onSair: () => void;
}) {
  const [passo, setPasso] = useState<Passo>("modelo");
  const [modeloId, setModeloId] = useState(templates[0]?.id ?? "");
  const modelo = templates.find((t) => t.id === modeloId);

  const [combinador, setCombinador] = useState<"todas" | "qualquer">("todas");
  const [condicoes, setCondicoes] = useState<Condicao[]>([]);
  const [avaliacao, setAvaliacao] = useState<AlunoLote[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const [manuais, setManuais] = useState<Set<string>>(new Set());
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<OrdemFila>("urgente");
  const [personalizada, setPersonalizada] = useState<string[]>([]);
  const [adicionarAberto, setAdicionarAberto] = useState(false);

  const avaliar = useCallback(() => {
    setCarregando(true);
    setErro("");
    invokeApp<AlunoLote[]>("avaliar_condicoes_atendimento_lote", {
      caminho: turma.caminho,
      bimestre,
      combinador,
      condicoes: condicoes.map(({ campo, operador, valor, valor2 }) => ({ campo, operador, valor, valor2 })),
    })
      .then(setAvaliacao)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false));
  }, [turma.caminho, bimestre, combinador, condicoes]);

  useEffect(() => {
    avaliar();
  }, [avaliar]);

  const porMatricula = useMemo(() => new Map(avaliacao.map((a) => [a.matricula, a])), [avaliacao]);

  const selecionados = useMemo(() => {
    const set = new Set<string>();
    for (const a of avaliacao) {
      const incluir = (a.entra && !removidos.has(a.matricula)) || manuais.has(a.matricula);
      if (incluir && !a.sem_telefone) set.add(a.matricula);
    }
    return set;
  }, [avaliacao, removidos, manuais]);

  const fila = useMemo(() => {
    const base = avaliacao.filter((a) => selecionados.has(a.matricula) || (manuais.has(a.matricula) && a.sem_telefone));
    return ordenarFila(base, ordem, personalizada);
  }, [avaliacao, selecionados, manuais, ordem, personalizada]);

  const nPelasCondicoes = avaliacao.filter((a) => a.entra && !a.sem_telefone && !removidos.has(a.matricula)).length;
  const nNaMao = [...manuais].filter((m) => {
    const a = porMatricula.get(m);
    return a && !a.entra && !a.sem_telefone;
  }).length;
  const nForaSemTelefone = avaliacao.filter(
    (a) => a.sem_telefone && ((a.entra && !removidos.has(a.matricula)) || manuais.has(a.matricula)),
  ).length;
  const totalDestinatarios = selecionados.size;
  const acimaDoTeto = totalDestinatarios > TETO_FILA_ASSISTIDA;

  const presetCount = (fn: (a: AlunoLote) => boolean) => avaliacao.filter(fn).length;
  const presetAtivo = (preset: (typeof PRESETS)[number]) =>
    condicoes.some((c) => c.campo === preset.condicao.campo && c.operador === preset.condicao.operador && c.valor === preset.condicao.valor);

  function alternarPreset(preset: (typeof PRESETS)[number]) {
    setCondicoes((atual) => {
      const idx = atual.findIndex(
        (c) => c.campo === preset.condicao.campo && c.operador === preset.condicao.operador && c.valor === preset.condicao.valor,
      );
      if (idx >= 0) return atual.filter((_, i) => i !== idx);
      return [...atual, { id: novoId(), ...preset.condicao }];
    });
  }

  function adicionarCondicao() {
    setCondicoes((a) => [...a, { id: novoId(), campo: "tarefas_pendentes", operador: "maior_que", valor: "0" }]);
  }
  function atualizarCondicao(id: string, campos: Partial<Condicao>) {
    setCondicoes((a) =>
      a.map((c) => {
        if (c.id !== id) return c;
        const proximo = { ...c, ...campos };
        if (campos.campo) {
          const ops = operadoresDoTipo(tipoDoCampo(campos.campo));
          if (!ops.includes(proximo.operador)) proximo.operador = ops[0];
        }
        return proximo;
      }),
    );
  }
  function removerCondicao(id: string) {
    setCondicoes((a) => a.filter((c) => c.id !== id));
  }

  function moverFila(matricula: string, dir: -1 | 1) {
    const ids = fila.map((a) => a.matricula);
    const i = ids.indexOf(matricula);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPersonalizada(ids);
    setOrdem("personalizada");
  }

  // ── Passo Modelo ──────────────────────────────────────────────────────────
  if (passo === "modelo") {
    return (
      <div className="atd-lote">
        <TrilhoPassos atual="modelo" onSair={onSair} turma={turma.codigo} modelo={modelo?.titulo} />
        <div className="atd-lote-modelo">
          <h2>Qual mensagem enviar?</h2>
          <p>Cada envio vira um atendimento do tipo "Contato com a família" no aluno correspondente.</p>
          {templates.length === 0 && (
            <div className="notice warning">Nenhum modelo cadastrado. Crie modelos em Configurações › Institucional › Mensagens à família.</div>
          )}
          <div className="atd-lote-modelo-lista">
            {templates.map((t) => (
              <button key={t.id} type="button" className={`atd-lote-modelo-card ${t.id === modeloId ? "sel" : ""}`} onClick={() => setModeloId(t.id)}>
                <span className="atd-lote-modelo-radio">{t.id === modeloId ? <Check size={12} /> : null}</span>
                <span>
                  <strong>{t.titulo}</strong>
                  <small>{t.corpo.replace(/\{[a-z_]+\}/g, "…").slice(0, 120)}</small>
                  {t.tags.length > 0 && (
                    <span className="atd-lote-modelo-tags">
                      {t.tags.map((tag) => <span key={tag} className="atd-selo-tipo">{tag}</span>)}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="atd-lote-rodape">
          <span />
          <button type="button" className="atd-btn-primario" disabled={!modeloId} onClick={() => setPasso("destinatarios")}>
            Continuar
          </button>
        </div>
      </div>
    );
  }

  // ── Passo Enviar (placeholder até a Fase 7) ────────────────────────────────
  if (passo === "enviar") {
    return (
      <div className="atd-lote">
        <TrilhoPassos atual="enviar" onSair={onSair} turma={turma.codigo} modelo={modelo?.titulo} />
        <div className="atd-lote-modelo">
          <h2>{totalDestinatarios} destinatários prontos</h2>
          <p>A escolha de canal (fila assistida no WhatsApp ou envio automático) entra na próxima etapa da implantação.</p>
        </div>
        <div className="atd-lote-rodape">
          <button type="button" className="atd-btn-secundario" onClick={() => setPasso("destinatarios")}>Voltar</button>
          <span />
        </div>
      </div>
    );
  }

  // ── Passo Destinatários (3a) ──────────────────────────────────────────────
  return (
    <div className="atd-lote">
      <TrilhoPassos atual="destinatarios" onSair={onSair} turma={turma.codigo} modelo={modelo?.titulo} />

      {erro && <div className="notice error">{erro}</div>}

      <div className="atd-lote-3a">
        <aside className="atd-lote-cond">
          <div className="atd-lote-card">
            <div className="atd-lote-card-topo">
              <strong>Filtros prontos</strong>
              <small>um clique adiciona abaixo</small>
            </div>
            <div className="atd-lote-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`atd-lote-preset ${presetAtivo(p) ? "ativo" : ""}`}
                  onClick={() => alternarPreset(p)}
                >
                  {presetAtivo(p) ? <Check size={12} /> : <Plus size={12} />}
                  {p.rotulo}
                  <span>{presetCount(p.conta)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="atd-lote-card atd-lote-cond-card">
            <div className="atd-lote-card-topo">
              <strong>Condições</strong>
              <div className="atd-segmentado-mini">
                <button type="button" className={combinador === "todas" ? "ativo" : ""} onClick={() => setCombinador("todas")}>Todas</button>
                <button type="button" className={combinador === "qualquer" ? "ativo" : ""} onClick={() => setCombinador("qualquer")}>Qualquer uma</button>
              </div>
            </div>
            <p className="atd-lote-frase">
              O aluno entra na fila se atender <strong>{combinador === "todas" ? "todas" : "qualquer uma"}</strong> {combinador === "todas" ? "as" : "das"} condições abaixo.
            </p>

            <div className="atd-lote-condicoes">
              {condicoes.map((c, i) => {
                const tipo = tipoDoCampo(c.campo);
                return (
                  <div key={c.id} className="atd-lote-condicao">
                    <span className="atd-lote-cond-junc">{i === 0 ? "Se" : combinador === "todas" ? "E" : "OU"}</span>
                    <select value={c.campo} onChange={(e) => atualizarCondicao(c.id, { campo: e.target.value as Condicao["campo"] })}>
                      {CAMPOS.map((campo) => <option key={campo.valor} value={campo.valor}>{campo.rotulo}</option>)}
                    </select>
                    <select value={c.operador} onChange={(e) => atualizarCondicao(c.id, { operador: e.target.value as Condicao["operador"] })}>
                      {operadoresDoTipo(tipo).map((op) => <option key={op} value={op}>{OPERADORES[op]}</option>)}
                    </select>
                    <input
                      className="atd-lote-cond-valor"
                      value={c.valor}
                      inputMode={tipo === "texto" ? "text" : "numeric"}
                      onChange={(e) => atualizarCondicao(c.id, { valor: e.target.value })}
                    />
                    {c.operador === "entre" && (
                      <>
                        <span className="atd-lote-cond-e">e</span>
                        <input className="atd-lote-cond-valor" value={c.valor2 ?? ""} inputMode="numeric" onChange={(e) => atualizarCondicao(c.id, { valor2: e.target.value })} />
                      </>
                    )}
                    <button type="button" className="atd-lote-cond-x" onClick={() => removerCondicao(c.id)} aria-label="Remover condição"><X size={13} /></button>
                  </div>
                );
              })}
              <button type="button" className="atd-lote-add-cond" onClick={adicionarCondicao}>
                <Plus size={14} aria-hidden /> Adicionar condição
              </button>
            </div>

            <div className="atd-lote-cond-rodape">
              <div className="atd-lote-contador">
                <span>Atendem às condições</span>
                <strong>{carregando ? "…" : `${nPelasCondicoes} ${nPelasCondicoes === 1 ? "aluno" : "alunos"}`}</strong>
              </div>
              <button type="button" className="atd-thread-link" onClick={() => { setCondicoes([]); setManuais(new Set()); setRemovidos(new Set()); }}>Limpar</button>
            </div>
          </div>
        </aside>

        <div className="atd-lote-fila">
          <div className="atd-lote-fila-topo">
            <div>
              <strong>Fila</strong>
              <span className="atd-lote-fila-conta">{selecionados.size} selecionados</span>
              {nNaMao > 0 && <span className="atd-lote-fila-mao">+ {nNaMao} na mão</span>}
            </div>
            <div className="atd-lote-fila-acoes">
              <label className="atd-lote-ordem">
                <span>Ordem</span>
                <select value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemFila)}>
                  {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
                <ChevronDown size={13} aria-hidden />
              </label>
              <div className="atd-lote-add-aluno">
                <button type="button" onClick={() => setAdicionarAberto((v) => !v)}>
                  <Plus size={14} aria-hidden /> Adicionar aluno
                </button>
                {adicionarAberto && (
                  <div className="atd-lote-add-menu">
                    {avaliacao
                      .filter((a) => !selecionados.has(a.matricula) && !manuais.has(a.matricula))
                      .map((a) => (
                        <button key={a.matricula} type="button" onClick={() => { setManuais((s) => new Set(s).add(a.matricula)); setAdicionarAberto(false); }}>
                          {a.numero_chamada ? `${a.numero_chamada}. ` : ""}{a.nome}{a.sem_telefone ? " · sem telefone" : ""}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="atd-lote-fila-dica">
            <Info size={13} aria-hidden /> Use o menu de cada linha para mudar a ordem — aí ela passa a ser "Personalizada".
          </div>

          <div className="atd-lote-fila-grade atd-lote-fila-cabecalho">
            <span /><span /><span>Aluno</span><span>Frequência</span><span>Tarefas</span><span>Último contato</span><span />
          </div>
          <div className="atd-lote-fila-corpo">
            {fila.map((a) => (
              <LinhaFila
                key={a.matricula}
                aluno={a}
                onRemover={() => {
                  if (manuais.has(a.matricula)) setManuais((s) => { const n = new Set(s); n.delete(a.matricula); return n; });
                  else setRemovidos((s) => new Set(s).add(a.matricula));
                }}
                onSubir={() => moverFila(a.matricula, -1)}
                onDescer={() => moverFila(a.matricula, 1)}
              />
            ))}
            {fila.length === 0 && <p className="atd-lote-fila-vazia">Nenhum aluno na fila. Ative um filtro pronto ou adicione uma condição.</p>}
          </div>
        </div>
      </div>

      {acimaDoTeto && (
        <div className="notice warning">
          {totalDestinatarios} destinatários — acima do teto de {TETO_FILA_ASSISTIDA} por sessão da fila assistida.
          Quebre em sessões menores ou use o envio automático (API oficial).
        </div>
      )}

      <div className="atd-lote-rodape">
        <div className="atd-lote-rodape-resumo">
          {nPelasCondicoes} pelas condições + {nNaMao} na mão
          {nForaSemTelefone > 0 && ` · ${nForaSemTelefone} fora por falta de telefone`}
        </div>
        <div>
          <button type="button" className="atd-btn-secundario" onClick={() => setPasso("modelo")}>Voltar ao modelo</button>
          <button type="button" className="atd-btn-primario" disabled={totalDestinatarios === 0} onClick={() => setPasso("enviar")}>
            Continuar · {totalDestinatarios} {totalDestinatarios === 1 ? "destinatário" : "destinatários"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrilhoPassos({ atual, onSair, turma, modelo }: { atual: Passo; onSair: () => void; turma: string; modelo?: string }) {
  const passos: { id: Passo; rotulo: string }[] = [
    { id: "modelo", rotulo: "Modelo" },
    { id: "destinatarios", rotulo: "Destinatários" },
    { id: "enviar", rotulo: "Enviar" },
  ];
  const idx = passos.findIndex((p) => p.id === atual);
  return (
    <header className="atd-lote-header">
      <div>
        <h1>Contatar famílias · {turma}</h1>
        {modelo && <p>Modelo <strong>{modelo}</strong> · a fila à direita atualiza a cada mudança.</p>}
      </div>
      <div className="atd-lote-trilho">
        {passos.map((p, i) => (
          <div key={p.id} className={`atd-lote-passo ${i < idx ? "feito" : i === idx ? "atual" : ""}`}>
            <span>{i < idx ? <Check size={12} /> : i + 1}</span>
            {p.rotulo}
          </div>
        ))}
      </div>
      <button type="button" className="atd-btn-secundario" onClick={onSair}>Sair do assistente</button>
    </header>
  );
}

function LinhaFila({
  aluno,
  onRemover,
  onSubir,
  onDescer,
}: {
  aluno: AlunoLote;
  onRemover: () => void;
  onSubir: () => void;
  onDescer: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const tom = tomFrequencia(aluno.frequencia);
  return (
    <div className={`atd-lote-fila-grade atd-lote-fila-linha ${aluno.sem_telefone ? "sem-tel" : ""}`}>
      <span className="atd-lote-alca" aria-hidden><GripVertical size={13} /></span>
      <span className="atd-lote-check">{!aluno.sem_telefone ? <Check size={11} /> : null}</span>
      <span className="atd-lote-fila-aluno">
        <strong>{aluno.nome}</strong>
        <small>{aluno.sem_telefone ? "sem telefone cadastrado" : aluno.responsavel_nome ? `→ ${aluno.responsavel_nome}` : "→ responsável"}</small>
      </span>
      <span className={`atd-lote-val tom-${tom}`}>
        {aluno.frequencia != null ? <><span className="atd-lote-bolinha" aria-hidden />{Math.round(aluno.frequencia)}%</> : "—"}
      </span>
      <span className="atd-lote-val">{aluno.tarefas_pendentes != null ? `${aluno.tarefas_pendentes} pend.` : "—"}</span>
      <span className="atd-lote-val">
        {aluno.ultimo_contato_dias == null ? "nunca" : aluno.ultimo_contato_dias === 0 ? "hoje" : `há ${aluno.ultimo_contato_dias} dias`}
      </span>
      <span className="atd-lote-fila-menu">
        <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Ações da linha">⋯</button>
        {menu && (
          <div className="atd-lote-fila-menu-lista">
            <button type="button" onClick={() => { setMenu(false); onSubir(); }}>Mover para cima</button>
            <button type="button" onClick={() => { setMenu(false); onDescer(); }}>Mover para baixo</button>
            <button type="button" onClick={() => { setMenu(false); onRemover(); }}>Tirar da fila</button>
          </div>
        )}
      </span>
    </div>
  );
}
