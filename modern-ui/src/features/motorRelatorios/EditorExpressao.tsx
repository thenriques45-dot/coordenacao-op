// Editor recursivo de árvore de expressão — o espelho em UI do motor de
// expressões do backend (motor_relatorios/expressoes.rs). O mesmo
// componente edita tanto o "campo" de uma condição de filtro quanto a
// "expressão" de uma coluna calculada: os dois são só um ExpressaoNo.
//
// Por padrão, todo nó nasce em "modo compacto": um campo vira só um
// dropdown, um valor fixo vira só um input — sem o seletor de "tipo de
// bloco" à mostra, pra ler como frase (campo → operador → valor), no
// espírito de filtro do Notion/Airtable/Linear em vez de uma árvore de
// programação visível. O seletor de tipo (e a árvore completa, com
// SE/E-OU/Cálculo) só aparece se o usuário clicar em "fórmula avançada" —
// ou automaticamente, se o nó já for algo que não cabe num campo/valor
// simples (uma coluna calculada existente, por exemplo).

import { useState } from "react";
import { ListaOrdenavel } from "../ListaOrdenavel";
import {
  CampoRelatorioInfo,
  DefinicaoParametro,
  ExpressaoNo,
  FuncaoExpressao,
  OperadorAritmetico,
  OperadorComparacao,
  OperadorLogico,
  idLocal,
  literalDeTexto,
  valorExpressaoParaTexto,
} from "./tipos";

const ROTULOS_TIPO_NO: Record<ExpressaoNo["tipo"], string> = {
  campo: "Campo",
  item_atual: "Valor do item (avançado)",
  parametro: "Parâmetro",
  literal: "Valor fixo",
  aritmetica: "Cálculo (+ − × ÷)",
  comparacao: "Comparação",
  logica: "E / OU / NÃO",
  se: "SE... ENTÃO... SENÃO",
  funcao: "Função",
};

const ROTULOS_CATEGORIA: Record<CampoRelatorioInfo["categoria"], string> = {
  aluno: "Aluno",
  turma: "Turma",
  notas: "Notas",
  frequencia: "Frequência",
  configuracao: "Configuração",
};

const ROTULOS_OPERADOR_ARITMETICO: Record<OperadorAritmetico, string> = {
  soma: "+",
  subtracao: "−",
  multiplicacao: "×",
  divisao: "÷",
};

const ROTULOS_OPERADOR_COMPARACAO: Record<OperadorComparacao, string> = {
  igual: "=",
  diferente: "≠",
  maior: ">",
  maior_igual: "≥",
  menor: "<",
  menor_igual: "≤",
};

const ROTULOS_OPERADOR_LOGICO: Record<OperadorLogico, string> = {
  e: "E (todas verdadeiras)",
  ou: "OU (pelo menos uma verdadeira)",
  nao: "NÃO (inverte)",
};

const ROTULOS_FUNCAO: Record<FuncaoExpressao, string> = {
  arredondar: "Arredondar",
  concatenar: "Concatenar texto",
};

/** Campo de parâmetro dos campos "requer_parametro" — hoje todos são nome de
 * disciplina. Mostra um dropdown com as disciplinas conhecidas (evita erro
 * de digitação/acentuação que faz o filtro silenciosamente não achar nada)
 * e cai pra texto livre se a disciplina não estiver na lista ainda. */
function SeletorParametro({
  valor,
  disciplinas,
  onMudar,
}: {
  valor: string;
  disciplinas: string[];
  onMudar: (valor: string) => void;
}) {
  const [modoTexto, setModoTexto] = useState(disciplinas.length === 0 || (!!valor && !disciplinas.includes(valor)));

  if (modoTexto) {
    return (
      <>
        <input type="text" placeholder="nome da disciplina" value={valor} onChange={(evento) => onMudar(evento.target.value)} />
        {disciplinas.length > 0 && (
          <button type="button" className="editor-expressao-remover" onClick={() => setModoTexto(false)}>
            Escolher da lista
          </button>
        )}
      </>
    );
  }

  return (
    <select
      value={valor}
      onChange={(evento) => {
        if (evento.target.value === "__outro__") {
          setModoTexto(true);
          return;
        }
        onMudar(evento.target.value);
      }}
    >
      <option value="">Selecione a disciplina...</option>
      {disciplinas.map((disciplina) => (
        <option key={disciplina} value={disciplina}>
          {disciplina}
        </option>
      ))}
      <option value="__outro__">Outra (digitar)...</option>
    </select>
  );
}

function noPadrao(tipo: ExpressaoNo["tipo"], campos: CampoRelatorioInfo[]): ExpressaoNo {
  switch (tipo) {
    case "campo":
      return { tipo: "campo", campo_id: campos[0]?.id ?? "", parametro: null };
    case "item_atual":
      return { tipo: "item_atual", chave: "" };
    case "parametro":
      return { tipo: "parametro", id: "" };
    case "literal":
      return { tipo: "literal", valor: { tipo: "numero", valor: 0 } };
    case "aritmetica":
      return { tipo: "aritmetica", operador: "soma", esquerda: noPadrao("literal", campos), direita: noPadrao("literal", campos) };
    case "comparacao":
      return {
        tipo: "comparacao",
        operador: "igual",
        esquerda: noPadrao("campo", campos),
        direita: noPadrao("literal", campos),
      };
    case "logica":
      return { tipo: "logica", operador: "e", valores: [noPadrao("comparacao", campos)] };
    case "se":
      return {
        tipo: "se",
        condicao: noPadrao("comparacao", campos),
        entao: noPadrao("literal", campos),
        senao: noPadrao("literal", campos),
      };
    case "funcao":
      return { tipo: "funcao", nome: "arredondar", argumentos: [noPadrao("campo", campos)] };
  }
}

/** Um nó "cabe" no modo compacto quando é só um Campo ou um Valor Fixo — os
 * dois casos que dão pra ler como uma frase curta sem árvore visível. */
function cabeNoModoCompacto(no: ExpressaoNo): boolean {
  return no.tipo === "campo" || no.tipo === "literal";
}

type Props = {
  no: ExpressaoNo;
  onMudar: (novo: ExpressaoNo) => void;
  campos: CampoRelatorioInfo[];
  parametros: DefinicaoParametro[];
  disciplinas: string[];
  /** Restringe os tipos de bloco oferecidos no seletor de modo avançado —
   * útil pro "campo" de uma condição de filtro, onde raramente faz sentido
   * oferecer E/OU/SE (ainda que tecnicamente válido). Sem isso, oferece
   * todos. */
  tiposPermitidos?: ExpressaoNo["tipo"][];
};

export function EditorExpressao({ no, onMudar, campos, parametros, disciplinas, tiposPermitidos }: Props) {
  const [modoAvancado, setModoAvancado] = useState(false);
  const tipos = tiposPermitidos ?? (Object.keys(ROTULOS_TIPO_NO) as ExpressaoNo["tipo"][]);

  function trocarTipo(novoTipo: ExpressaoNo["tipo"]) {
    onMudar(noPadrao(novoTipo, campos));
  }

  // Modo compacto: só campo/valor fixo, sem o seletor de tipo de bloco —
  // lê como "Nota em Matemática" ou "5" em vez de um formulário genérico.
  if (!modoAvancado && cabeNoModoCompacto(no)) {
    return (
      <span className="editor-expressao-linha editor-expressao-compacto">
        {no.tipo === "campo" && (
          <>
            <select value={no.campo_id} onChange={(evento) => onMudar({ ...no, campo_id: evento.target.value })}>
              {Object.entries(
                campos.reduce<Record<string, CampoRelatorioInfo[]>>((grupos, campo) => {
                  (grupos[campo.categoria] ??= []).push(campo);
                  return grupos;
                }, {})
              ).map(([categoria, itens]) => (
                <optgroup key={categoria} label={ROTULOS_CATEGORIA[categoria as CampoRelatorioInfo["categoria"]]}>
                  {itens.map((campo) => (
                    <option key={campo.id} value={campo.id}>
                      {campo.rotulo}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {campos.find((c) => c.id === no.campo_id)?.requer_parametro && (
              <SeletorParametro
                valor={no.parametro ?? ""}
                disciplinas={disciplinas}
                onMudar={(valor) => onMudar({ ...no, parametro: valor })}
              />
            )}
          </>
        )}
        {no.tipo === "literal" &&
          (no.valor.tipo === "booleano" ? (
            <select
              value={String(no.valor.valor)}
              onChange={(evento) => onMudar({ tipo: "literal", valor: { tipo: "booleano", valor: evento.target.value === "true" } })}
            >
              <option value="true">Verdadeiro</option>
              <option value="false">Falso</option>
            </select>
          ) : (
            <input
              type={no.valor.tipo === "numero" ? "number" : "text"}
              placeholder="valor"
              value={valorExpressaoParaTexto(no.valor)}
              onChange={(evento) =>
                onMudar({ tipo: "literal", valor: literalDeTexto(no.valor.tipo as "texto" | "numero", evento.target.value) })
              }
            />
          ))}
        <button type="button" className="editor-expressao-remover" onClick={() => setModoAvancado(true)} title="Trocar por um cálculo, comparação ou outro tipo de bloco">
          🔧 fórmula avançada
        </button>
      </span>
    );
  }

  return (
    <div className="editor-expressao">
      <div className="editor-expressao-linha">
        <select value={no.tipo} onChange={(evento) => trocarTipo(evento.target.value as ExpressaoNo["tipo"])}>
          {tipos.map((tipo) => (
            <option key={tipo} value={tipo}>
              {ROTULOS_TIPO_NO[tipo]}
            </option>
          ))}
        </select>
        {cabeNoModoCompacto(no) && (
          <button type="button" className="editor-expressao-remover" onClick={() => setModoAvancado(false)}>
            ↩️ modo simples
          </button>
        )}

        {no.tipo === "campo" && (
          <>
            <select
              value={no.campo_id}
              onChange={(evento) => onMudar({ ...no, campo_id: evento.target.value })}
            >
              {Object.entries(
                campos.reduce<Record<string, CampoRelatorioInfo[]>>((grupos, campo) => {
                  (grupos[campo.categoria] ??= []).push(campo);
                  return grupos;
                }, {})
              ).map(([categoria, itens]) => (
                <optgroup key={categoria} label={ROTULOS_CATEGORIA[categoria as CampoRelatorioInfo["categoria"]]}>
                  {itens.map((campo) => (
                    <option key={campo.id} value={campo.id}>
                      {campo.rotulo}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {campos.find((c) => c.id === no.campo_id)?.requer_parametro && (
              <SeletorParametro
                valor={no.parametro ?? ""}
                disciplinas={disciplinas}
                onMudar={(valor) => onMudar({ ...no, parametro: valor })}
              />
            )}
          </>
        )}

        {no.tipo === "item_atual" && (
          <input
            type="text"
            placeholder="chave do item (ex.: situacao)"
            value={no.chave}
            onChange={(evento) => onMudar({ ...no, chave: evento.target.value })}
          />
        )}

        {no.tipo === "parametro" && (
          <select value={no.id} onChange={(evento) => onMudar({ ...no, id: evento.target.value })}>
            <option value="">Selecione um parâmetro...</option>
            {parametros.map((parametro) => (
              <option key={parametro.id} value={parametro.id}>
                {parametro.rotulo}
              </option>
            ))}
          </select>
        )}

        {no.tipo === "literal" && (
          <>
            <select
              value={no.valor.tipo}
              onChange={(evento) =>
                onMudar({ tipo: "literal", valor: literalDeTexto(evento.target.value as "texto" | "numero" | "booleano", valorExpressaoParaTexto(no.valor)) })
              }
            >
              <option value="numero">Número</option>
              <option value="texto">Texto</option>
              <option value="booleano">Verdadeiro/Falso</option>
            </select>
            {no.valor.tipo === "booleano" ? (
              <select
                value={String(no.valor.valor)}
                onChange={(evento) => onMudar({ tipo: "literal", valor: { tipo: "booleano", valor: evento.target.value === "true" } })}
              >
                <option value="true">Verdadeiro</option>
                <option value="false">Falso</option>
              </select>
            ) : (
              <input
                type={no.valor.tipo === "numero" ? "number" : "text"}
                value={valorExpressaoParaTexto(no.valor)}
                onChange={(evento) =>
                  onMudar({ tipo: "literal", valor: literalDeTexto(no.valor.tipo as "texto" | "numero", evento.target.value) })
                }
              />
            )}
          </>
        )}

        {no.tipo === "aritmetica" && (
          <select
            value={no.operador}
            onChange={(evento) => onMudar({ ...no, operador: evento.target.value as OperadorAritmetico })}
          >
            {Object.entries(ROTULOS_OPERADOR_ARITMETICO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        )}

        {no.tipo === "comparacao" && (
          <select
            value={no.operador}
            onChange={(evento) => onMudar({ ...no, operador: evento.target.value as OperadorComparacao })}
          >
            {Object.entries(ROTULOS_OPERADOR_COMPARACAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        )}

        {no.tipo === "logica" && (
          <select
            value={no.operador}
            onChange={(evento) => onMudar({ ...no, operador: evento.target.value as OperadorLogico })}
          >
            {Object.entries(ROTULOS_OPERADOR_LOGICO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        )}

        {no.tipo === "funcao" && (
          <select value={no.nome} onChange={(evento) => onMudar({ ...no, nome: evento.target.value as FuncaoExpressao })}>
            {Object.entries(ROTULOS_FUNCAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        )}
      </div>

      {(no.tipo === "aritmetica" || no.tipo === "comparacao") && (
        <div className="editor-expressao-filhos">
          <div>
            <strong>Esquerda</strong>
            <EditorExpressao no={no.esquerda} onMudar={(novo) => onMudar({ ...no, esquerda: novo })} campos={campos} parametros={parametros} disciplinas={disciplinas} />
          </div>
          <div>
            <strong>Direita</strong>
            <EditorExpressao no={no.direita} onMudar={(novo) => onMudar({ ...no, direita: novo })} campos={campos} parametros={parametros} disciplinas={disciplinas} />
          </div>
        </div>
      )}

      {no.tipo === "logica" && (
        <div className="editor-expressao-filhos">
          <ListaOrdenavel
            itens={no.valores.map((valor, indice) => ({ id: idLocal(`logica_${indice}`), valor }))}
            chave={(item) => item.id}
            onReordenar={(nova) => onMudar({ ...no, valores: nova.map((item) => item.valor) })}
            renderItem={(item, indice) => (
              <div>
                <EditorExpressao
                  no={item.valor}
                  onMudar={(novo) => {
                    const valores = [...no.valores];
                    valores[indice] = novo;
                    onMudar({ ...no, valores });
                  }}
                  campos={campos}
                  parametros={parametros}
                  disciplinas={disciplinas}
                />
                {no.valores.length > 1 && (
                  <button
                    type="button"
                    className="editor-expressao-remover"
                    onClick={() => onMudar({ ...no, valores: no.valores.filter((_, i) => i !== indice) })}
                  >
                    Remover esta condição
                  </button>
                )}
              </div>
            )}
          />
          <button type="button" className="secondary-action" onClick={() => onMudar({ ...no, valores: [...no.valores, noPadrao("comparacao", campos)] })}>
            + Adicionar condição
          </button>
        </div>
      )}

      {no.tipo === "se" && (
        <div className="editor-expressao-filhos">
          <div>
            <strong>SE</strong>
            <EditorExpressao no={no.condicao} onMudar={(novo) => onMudar({ ...no, condicao: novo })} campos={campos} parametros={parametros} disciplinas={disciplinas} />
          </div>
          <div>
            <strong>ENTÃO</strong>
            <EditorExpressao no={no.entao} onMudar={(novo) => onMudar({ ...no, entao: novo })} campos={campos} parametros={parametros} disciplinas={disciplinas} />
          </div>
          <div>
            <strong>SENÃO</strong>
            <EditorExpressao no={no.senao} onMudar={(novo) => onMudar({ ...no, senao: novo })} campos={campos} parametros={parametros} disciplinas={disciplinas} />
          </div>
        </div>
      )}

      {no.tipo === "funcao" && (
        <div className="editor-expressao-filhos">
          <ListaOrdenavel
            itens={no.argumentos.map((argumento, indice) => ({ id: idLocal(`arg_${indice}`), argumento }))}
            chave={(item) => item.id}
            onReordenar={(nova) => onMudar({ ...no, argumentos: nova.map((item) => item.argumento) })}
            renderItem={(item, indice) => (
              <div>
                <EditorExpressao
                  no={item.argumento}
                  onMudar={(novo) => {
                    const argumentos = [...no.argumentos];
                    argumentos[indice] = novo;
                    onMudar({ ...no, argumentos });
                  }}
                  campos={campos}
                  parametros={parametros}
                  disciplinas={disciplinas}
                />
                {no.argumentos.length > 1 && (
                  <button
                    type="button"
                    className="editor-expressao-remover"
                    onClick={() => onMudar({ ...no, argumentos: no.argumentos.filter((_, i) => i !== indice) })}
                  >
                    Remover este argumento
                  </button>
                )}
              </div>
            )}
          />
          <button type="button" className="secondary-action" onClick={() => onMudar({ ...no, argumentos: [...no.argumentos, noPadrao("campo", campos)] })}>
            + Adicionar argumento
          </button>
        </div>
      )}
    </div>
  );
}
