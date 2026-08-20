// Motor de expressões: uma árvore pequena e caseira (não um scripting
// engine embutido) que representa tanto colunas calculadas quanto condições
// de filtro. O construtor visual monta essa árvore compondo blocos
// (campo/operador/valor encadeados) — não existe entrada de texto livre, então
// não há gramática pra parsear nem sandbox de execução pra resolver.

use serde::{Deserialize, Serialize};

use super::campos::{buscar_campo, ContextoLinha};

// Tag adjacente (tag + content separados), não interna: variantes com um
// valor primitivo bruto (String/f64/bool) não são serializáveis com tag
// interna — o serde não tem como misturar a tag com um valor que não é
// objeto/mapa.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "tipo", content = "valor", rename_all = "snake_case")]
pub(crate) enum ValorExpressao {
    Texto(String),
    Numero(f64),
    Booleano(bool),
    Nulo,
}

impl ValorExpressao {
    pub(crate) fn como_texto(&self) -> String {
        match self {
            ValorExpressao::Texto(valor) => valor.clone(),
            ValorExpressao::Numero(valor) => {
                if valor.fract().abs() < f64::EPSILON {
                    format!("{:.0}", valor)
                } else {
                    format!("{:.1}", valor)
                }
            }
            ValorExpressao::Booleano(valor) => {
                if *valor {
                    "Sim".to_string()
                } else {
                    "Não".to_string()
                }
            }
            ValorExpressao::Nulo => "-".to_string(),
        }
    }

    pub(crate) fn como_numero(&self) -> Option<f64> {
        match self {
            ValorExpressao::Numero(valor) => Some(*valor),
            ValorExpressao::Texto(valor) => valor.replace(',', ".").parse::<f64>().ok(),
            ValorExpressao::Booleano(valor) => Some(if *valor { 1.0 } else { 0.0 }),
            ValorExpressao::Nulo => None,
        }
    }

    pub(crate) fn como_booleano(&self) -> bool {
        match self {
            ValorExpressao::Booleano(valor) => *valor,
            ValorExpressao::Numero(valor) => *valor != 0.0,
            ValorExpressao::Texto(valor) => !valor.is_empty(),
            ValorExpressao::Nulo => false,
        }
    }

    pub(crate) fn eh_nulo_ou_vazio(&self) -> bool {
        match self {
            ValorExpressao::Nulo => true,
            ValorExpressao::Texto(valor) => valor.trim().is_empty(),
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OperadorAritmetico {
    Soma,
    Subtracao,
    Multiplicacao,
    Divisao,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OperadorComparacao {
    Igual,
    Diferente,
    Maior,
    MaiorIgual,
    Menor,
    MenorIgual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OperadorLogico {
    E,
    Ou,
    Nao,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum FuncaoExpressao {
    Arredondar,
    Concatenar,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub(crate) enum ExpressaoNo {
    /// Referência a um campo do registro (campos.rs). `parametro` é usado
    /// pelos campos parametrizados (ex.: frequência de UMA disciplina
    /// específica) — ver CampoRelatorio::requer_parametro.
    Campo {
        campo_id: String,
        #[serde(default)]
        parametro: Option<String>,
    },
    /// Lê um valor extra do item de fan-out atual (`ContextoLinha::item`,
    /// só existe em linhas de `PorAlunoEItem`) — ex.: a nota do outro
    /// bimestre do par, numa sugestão de troca de recuperação. Fora de uma
    /// linha de fan-out, avalia pra Nulo.
    ItemAtual {
        chave: String,
    },
    /// Lê um parâmetro de execução (`DefinicaoParametro` — igual ao
    /// bimestre, mas declarado pela ReportDefinition). Sem valor enviado
    /// nem valor_padrao declarado, avalia pra Nulo.
    Parametro {
        id: String,
    },
    Literal {
        valor: ValorExpressao,
    },
    Aritmetica {
        operador: OperadorAritmetico,
        esquerda: Box<ExpressaoNo>,
        direita: Box<ExpressaoNo>,
    },
    Comparacao {
        operador: OperadorComparacao,
        esquerda: Box<ExpressaoNo>,
        direita: Box<ExpressaoNo>,
    },
    Logica {
        operador: OperadorLogico,
        valores: Vec<ExpressaoNo>,
    },
    Se {
        condicao: Box<ExpressaoNo>,
        entao: Box<ExpressaoNo>,
        senao: Box<ExpressaoNo>,
    },
    Funcao {
        nome: FuncaoExpressao,
        argumentos: Vec<ExpressaoNo>,
    },
}

pub(crate) fn avaliar(no: &ExpressaoNo, contexto: &ContextoLinha) -> ValorExpressao {
    match no {
        ExpressaoNo::Campo { campo_id, parametro } => match buscar_campo(campo_id) {
            Some(campo) => {
                // Campo parametrizado sem parâmetro explícito na coluna
                // herda o parâmetro do item de fan-out da linha atual (ex.:
                // "nota vigente da disciplina" sem dizer qual disciplina —
                // usa a disciplina do item, numa linha de PorAlunoEItem).
                let parametro_efetivo = parametro
                    .as_deref()
                    .or_else(|| contexto.item.map(|item| item.parametro.as_str()));
                (campo.extrator)(contexto, parametro_efetivo)
            }
            None => ValorExpressao::Nulo,
        },
        ExpressaoNo::ItemAtual { chave } => contexto
            .item
            .and_then(|item| item.extras.get(chave))
            .cloned()
            .unwrap_or(ValorExpressao::Nulo),
        ExpressaoNo::Parametro { id } => contexto.parametros.get(id).cloned().unwrap_or(ValorExpressao::Nulo),
        ExpressaoNo::Literal { valor } => valor.clone(),
        ExpressaoNo::Aritmetica {
            operador,
            esquerda,
            direita,
        } => {
            let (Some(a), Some(b)) = (
                avaliar(esquerda, contexto).como_numero(),
                avaliar(direita, contexto).como_numero(),
            ) else {
                return ValorExpressao::Nulo;
            };
            let resultado = match operador {
                OperadorAritmetico::Soma => a + b,
                OperadorAritmetico::Subtracao => a - b,
                OperadorAritmetico::Multiplicacao => a * b,
                OperadorAritmetico::Divisao => {
                    if b == 0.0 {
                        return ValorExpressao::Nulo;
                    }
                    a / b
                }
            };
            ValorExpressao::Numero(resultado)
        }
        ExpressaoNo::Comparacao {
            operador,
            esquerda,
            direita,
        } => {
            let a = avaliar(esquerda, contexto);
            let b = avaliar(direita, contexto);
            ValorExpressao::Booleano(comparar(operador, &a, &b))
        }
        ExpressaoNo::Logica { operador, valores } => match operador {
            OperadorLogico::E => {
                ValorExpressao::Booleano(valores.iter().all(|v| avaliar(v, contexto).como_booleano()))
            }
            OperadorLogico::Ou => {
                ValorExpressao::Booleano(valores.iter().any(|v| avaliar(v, contexto).como_booleano()))
            }
            OperadorLogico::Nao => {
                let valor = valores.first().map(|v| avaliar(v, contexto).como_booleano()).unwrap_or(false);
                ValorExpressao::Booleano(!valor)
            }
        },
        ExpressaoNo::Se { condicao, entao, senao } => {
            if avaliar(condicao, contexto).como_booleano() {
                avaliar(entao, contexto)
            } else {
                avaliar(senao, contexto)
            }
        }
        ExpressaoNo::Funcao { nome, argumentos } => avaliar_funcao(*nome, argumentos, contexto),
    }
}

fn comparar(operador: &OperadorComparacao, a: &ValorExpressao, b: &ValorExpressao) -> bool {
    // Nulo (campo ausente/sem valor) não entra na comparação textual de
    // fallback abaixo — sem isso, "sem frequência lançada" (Nulo) virava
    // texto "-" e "-" < "75" dava true por ordem lexicográfica, um falso
    // positivo silencioso. Igual/Diferente comparam nulidade; qualquer
    // comparação de ordem contra um valor ausente é sempre falsa (não dá
    // pra dizer que um dado que não existe é maior/menor que outro).
    if matches!(a, ValorExpressao::Nulo) || matches!(b, ValorExpressao::Nulo) {
        return match operador {
            OperadorComparacao::Igual => matches!(a, ValorExpressao::Nulo) && matches!(b, ValorExpressao::Nulo),
            OperadorComparacao::Diferente => !(matches!(a, ValorExpressao::Nulo) && matches!(b, ValorExpressao::Nulo)),
            _ => false,
        };
    }
    if let (Some(na), Some(nb)) = (a.como_numero(), b.como_numero()) {
        return match operador {
            OperadorComparacao::Igual => (na - nb).abs() < 1e-9,
            OperadorComparacao::Diferente => (na - nb).abs() >= 1e-9,
            OperadorComparacao::Maior => na > nb,
            OperadorComparacao::MaiorIgual => na >= nb,
            OperadorComparacao::Menor => na < nb,
            OperadorComparacao::MenorIgual => na <= nb,
        };
    }
    let ta = a.como_texto();
    let tb = b.como_texto();
    match operador {
        OperadorComparacao::Igual => ta == tb,
        OperadorComparacao::Diferente => ta != tb,
        OperadorComparacao::Maior => ta > tb,
        OperadorComparacao::MaiorIgual => ta >= tb,
        OperadorComparacao::Menor => ta < tb,
        OperadorComparacao::MenorIgual => ta <= tb,
    }
}

fn avaliar_funcao(nome: FuncaoExpressao, argumentos: &[ExpressaoNo], contexto: &ContextoLinha) -> ValorExpressao {
    match nome {
        FuncaoExpressao::Arredondar => {
            let Some(no) = argumentos.first() else {
                return ValorExpressao::Nulo;
            };
            match avaliar(no, contexto).como_numero() {
                Some(valor) => ValorExpressao::Numero(valor.round()),
                None => ValorExpressao::Nulo,
            }
        }
        FuncaoExpressao::Concatenar => {
            let texto = argumentos
                .iter()
                .map(|no| avaliar(no, contexto).como_texto())
                .collect::<Vec<_>>()
                .join("");
            ValorExpressao::Texto(texto)
        }
    }
}

/// Avalia uma condição de filtro (campo/operador/valor) contra uma linha.
pub(crate) fn avaliar_condicao(
    condicao: &super::definicao::FiltroCondicao,
    contexto: &ContextoLinha,
) -> bool {
    use super::definicao::Operador;

    let valor_campo = avaliar(&condicao.campo, contexto);
    match condicao.operador {
        Operador::Vazio => valor_campo.eh_nulo_ou_vazio(),
        Operador::NaoVazio => !valor_campo.eh_nulo_ou_vazio(),
        Operador::Contem => {
            let alvo = condicao
                .valor
                .as_ref()
                .map(|expressao| avaliar(expressao, contexto).como_texto())
                .unwrap_or_default();
            valor_campo
                .como_texto()
                .to_lowercase()
                .contains(&alvo.to_lowercase())
        }
        operador_simples => {
            let Some(expressao_alvo) = condicao.valor.as_ref() else {
                return true;
            };
            let valor_alvo = avaliar(expressao_alvo, contexto);
            let operador_comparacao = match operador_simples {
                Operador::Igual => OperadorComparacao::Igual,
                Operador::Diferente => OperadorComparacao::Diferente,
                Operador::Maior => OperadorComparacao::Maior,
                Operador::MaiorIgual => OperadorComparacao::MaiorIgual,
                Operador::Menor => OperadorComparacao::Menor,
                Operador::MenorIgual => OperadorComparacao::MenorIgual,
                Operador::Contem | Operador::Vazio | Operador::NaoVazio => unreachable!(),
            };
            comparar(&operador_comparacao, &valor_campo, &valor_alvo)
        }
    }
}
