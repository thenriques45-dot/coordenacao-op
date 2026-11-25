import { CalendarDays, Check, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { OPCOES_AVISO_EVENTO } from "../management";
import { agruparPeriodos, TIPOS_CALENDARIO, type LeituraCalendario, type PeriodoCalendario } from "./leitor";
import { chaveTipo, escolhasPadrao, gravarCalendarioEscolar, lerArquivoCalendario, type EscolhaTipo } from "./importar";
import "./calendarioEscolar.css";

function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function rotuloPeriodo(periodo: PeriodoCalendario) {
  return periodo.fim > periodo.inicio ? `${dataCurta(periodo.inicio)} a ${dataCurta(periodo.fim)}` : dataCurta(periodo.inicio);
}

/** Texto escuro nas cores claras da legenda, claro nas escuras. */
function corDoTexto(fundo: string) {
  const valor = Number.parseInt(fundo.slice(1), 16);
  const [r, g, b] = [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1d2433" : "#ffffff";
}

function Etiqueta({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="cal-esc-etiqueta" style={{ background: cor, color: corDoTexto(cor) }}>
      {texto}
    </span>
  );
}

type Resultado = ReturnType<typeof gravarCalendarioEscolar>;

export function ImportarCalendarioEscolar({ onAbrirCalendario }: { onAbrirCalendario: () => void }) {
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [leitura, setLeitura] = useState<LeituraCalendario | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaTipo>>({});
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [verDatas, setVerDatas] = useState(false);

  const periodos = useMemo(() => (leitura ? agruparPeriodos(leitura.etiquetas) : []), [leitura]);
  const tipos = useMemo(() => {
    const porChave = new Map<string, { chave: string; periodo: PeriodoCalendario; quantidade: number }>();
    for (const periodo of periodos) {
      const chave = chaveTipo(periodo);
      const atual = porChave.get(chave);
      if (atual) atual.quantidade += 1;
      else porChave.set(chave, { chave, periodo, quantidade: 1 });
    }
    // Na ordem da legenda; os não reconhecidos no fim.
    const ordem = (chave: string) => {
      const indice = TIPOS_CALENDARIO.findIndex((t) => t.codigo === chave);
      return indice < 0 ? 999 : indice;
    };
    return [...porChave.values()].sort((a, b) => ordem(a.chave) - ordem(b.chave));
  }, [periodos]);

  const selecionados = periodos.filter((periodo) => {
    const escolha = escolhas[chaveTipo(periodo)];
    return escolha?.incluir && escolha.nome.trim();
  });

  async function selecionar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setResultado(null);
    setLeitura(null);
    setNomeArquivo(arquivo.name);
    setLendo(true);
    try {
      // Deixa a tela mostrar "Lendo…" antes do trabalho pesado.
      await new Promise((resolve) => window.setTimeout(resolve, 30));
      const lida = await lerArquivoCalendario(arquivo);
      setLeitura(lida);
      setEscolhas(escolhasPadrao(agruparPeriodos(lida.etiquetas)));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setLendo(false);
    }
  }

  function mudarEscolha(chave: string, mudanca: Partial<EscolhaTipo>) {
    setEscolhas((atuais) => ({ ...atuais, [chave]: { ...atuais[chave], ...mudanca } }));
  }

  function importar() {
    if (!leitura) return;
    setResultado(gravarCalendarioEscolar(leitura.ano, periodos, escolhas));
  }

  return (
    <>
      <header className="topbar">
        <div>
          <span className="eyebrow">Importações</span>
          <h1>Importar calendário escolar</h1>
          <p>
            Carregue o PDF do Calendário Escolar baixado da SED. O app lê as datas do ano inteiro (férias, recessos,
            feriados, conselhos de classe, reuniões, semanas de estudos intensivos…) e coloca no Calendário de Gestão, com
            aviso no sino para o que você escolher. Importar de novo o calendário do mesmo ano atualiza as datas, sem
            duplicar.
          </p>
        </div>
      </header>

      <section className="panel cal-esc-painel">
        <div className="cal-esc-acoes">
          <label className="file-picker-button" style={{ cursor: lendo ? "wait" : "pointer" }}>
            <Upload size={18} />
            <span>{leitura ? "Escolher outro arquivo" : "Selecionar o PDF do calendário"}</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              style={{ display: "none" }}
              disabled={lendo}
              onChange={(e) => {
                void selecionar(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {nomeArquivo && <span className="cal-esc-arquivo">{lendo ? `Lendo ${nomeArquivo}…` : nomeArquivo}</span>}
        </div>

        {erro && <div className="notice error">{erro}</div>}

        {leitura && !resultado && (
          <>
            <div className="cal-esc-resumo">
              <strong>Calendário de {leitura.ano}</strong>
              <span>
                {periodos.length} datas de {tipos.length} tipos
              </span>
              {leitura.confianca < 22 && (
                <span className="cal-esc-alerta">
                  O formato não bateu totalmente com {leitura.ano}. Confira algumas datas em "Ver todas as datas" antes de
                  importar.
                </span>
              )}
            </div>

            <div className="students-table-wrap">
              <table className="students-table cal-esc-tabela">
                <thead>
                  <tr>
                    <th>Importar</th>
                    <th>Tipo</th>
                    <th>Datas</th>
                    <th>Avisar no sino</th>
                  </tr>
                </thead>
                <tbody>
                  {tipos.map(({ chave, periodo, quantidade }) => {
                    const tipo = TIPOS_CALENDARIO.find((t) => t.codigo === periodo.codigo);
                    const escolha = escolhas[chave];
                    if (!escolha) return null;
                    const exemplos = periodos.filter((p) => chaveTipo(p) === chave).slice(0, 3).map(rotuloPeriodo).join(", ");
                    return (
                      <tr key={chave} className={escolha.incluir ? "" : "cal-esc-desligado"}>
                        <td>
                          <input
                            type="checkbox"
                            checked={escolha.incluir}
                            onChange={(e) => mudarEscolha(chave, { incluir: e.target.checked })}
                            aria-label={`Importar ${escolha.nome || "tipo não reconhecido"}`}
                          />
                        </td>
                        <td>
                          <div className="cal-esc-tipo">
                            <Etiqueta cor={periodo.corHex} texto={tipo?.sigla ?? "?"} />
                            {tipo ? (
                              <span>{escolha.nome}</span>
                            ) : (
                              <input
                                value={escolha.nome}
                                placeholder="Tipo não reconhecido: dê um nome"
                                onChange={(e) => mudarEscolha(chave, { nome: e.target.value, incluir: Boolean(e.target.value.trim()) })}
                              />
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="cal-esc-datas">
                            {quantidade}× · {exemplos}
                            {quantidade > 3 ? "…" : ""}
                          </span>
                        </td>
                        <td>
                          <select value={escolha.avisar} onChange={(e) => mudarEscolha(chave, { avisar: e.target.value })} disabled={!escolha.incluir}>
                            {OPCOES_AVISO_EVENTO.map((opcao) => (
                              <option key={opcao.valor} value={opcao.valor}>
                                {opcao.rotulo}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button type="button" className="ghost-action cal-esc-ver" onClick={() => setVerDatas((atual) => !atual)} aria-expanded={verDatas}>
              <CalendarDays size={16} /> {verDatas ? "Esconder as datas" : "Ver todas as datas"}
            </button>
            {verDatas && (
              <ol className="cal-esc-lista">
                {periodos.map((periodo) => {
                  const escolha = escolhas[chaveTipo(periodo)];
                  const tipo = TIPOS_CALENDARIO.find((t) => t.codigo === periodo.codigo);
                  return (
                    <li key={`${chaveTipo(periodo)}-${periodo.inicio}`} className={escolha?.incluir ? "" : "cal-esc-desligado"}>
                      <span className="cal-esc-quando">{rotuloPeriodo(periodo)}</span>
                      <Etiqueta cor={periodo.corHex} texto={tipo?.sigla ?? "?"} />
                      <span>{escolha?.nome || "Tipo não reconhecido"}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="cal-esc-rodape">
              <button type="button" className="primary-action" onClick={importar} disabled={!selecionados.length}>
                <Check size={17} /> Adicionar {selecionados.length} datas ao calendário
              </button>
            </div>
          </>
        )}

        {resultado && leitura && (
          <div className="cal-esc-pronto">
            <div className="notice success">
              Calendário escolar de {leitura.ano} no Calendário de Gestão: {resultado.adicionados} datas novas
              {resultado.atualizados ? `, ${resultado.atualizados} atualizadas` : ""}
              {resultado.removidos ? `, ${resultado.removidos} que não estão mais no calendário foram tiradas` : ""}.{" "}
              {resultado.comAviso ? `${resultado.comAviso} vão avisar no sino.` : ""}
            </div>
            <div className="cal-esc-acoes">
              <button type="button" className="primary-action" onClick={onAbrirCalendario}>
                <CalendarDays size={17} /> Abrir o calendário
              </button>
              <button type="button" className="secondary-action" onClick={() => setResultado(null)}>
                Voltar à prévia
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
