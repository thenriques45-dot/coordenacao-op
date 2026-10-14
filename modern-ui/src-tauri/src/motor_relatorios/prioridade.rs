// Pontuação de "aluno prioritário" para recomposição, a mesma da planilha de
// análise da AvD: cada critério atendido soma pontos (2ª AvD vale 1,5; 1ª
// AvD, frequência, Prova Paulista e SARESP valem 1 cada) e quem chega ao
// corte (2,5 por padrão) é prioritário.
//
// Os critérios não são fixos: cada um é lido de um parâmetro de execução do
// relatório (ids PARAM_*), com o valor da planilha como padrão. Assim o
// relatório pronto "Alunos prioritários (AvD)" e qualquer relatório
// personalizado que declare os mesmos ids usam os critérios escolhidos na
// hora de gerar.

use serde_json::Value;

use super::campos::ContextoLinha;
use super::expressoes::ValorExpressao;
use crate::normalizar_texto_basico;

pub(crate) const PARAM_COMPONENTE: &str = "prioridade_componente";
pub(crate) const PARAM_NIVEL_AVD: &str = "prioridade_nivel_avd";
pub(crate) const PARAM_FREQUENCIA: &str = "prioridade_frequencia_minima";
pub(crate) const PARAM_PROVA_PAULISTA: &str = "prioridade_prova_paulista_minima";
pub(crate) const PARAM_SARESP: &str = "prioridade_saresp_minimo";
pub(crate) const PARAM_PONTOS: &str = "prioridade_pontos_minimos";

pub(crate) const PADRAO_COMPONENTE: &str = "Matemática";
pub(crate) const PADRAO_NIVEL_AVD: &str = "Abaixo do Básico";
pub(crate) const PADRAO_FREQUENCIA: f64 = 75.0;
/// Prova Paulista e SARESP ficam guardados de 0 a 10: 5 = 50% de acertos.
pub(crate) const PADRAO_PROVA_PAULISTA: f64 = 5.0;
pub(crate) const PADRAO_SARESP: f64 = 4.0;
pub(crate) const PADRAO_PONTOS: f64 = 2.5;

/// Escolhas das listas suspensas na hora de gerar.
pub(crate) const COMPONENTES_AVD: [&str; 2] = ["Matemática", "Língua Portuguesa"];
pub(crate) const OPCOES_NIVEL_AVD: [&str; 2] = ["Abaixo do Básico", "Abaixo do Básico ou Básico"];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Componente {
    Matematica,
    Portugues,
}

/// Componente da coluna (parâmetro do campo) ou, sem ele, do parâmetro de
/// execução do relatório. Aceita "MAT", "Matemática", "LP", "LPT",
/// "Português", "Língua Portuguesa".
fn componente(ctx: &ContextoLinha, parametro: Option<&str>) -> Componente {
    let texto = parametro
        .map(str::to_string)
        .or_else(|| texto_parametro(ctx, PARAM_COMPONENTE))
        .unwrap_or_else(|| PADRAO_COMPONENTE.to_string());
    let norm = normalizar_texto_basico(&texto);
    if norm.starts_with("MAT") {
        Componente::Matematica
    } else if norm.starts_with("LP") || norm.starts_with("PORT") || norm.starts_with("LINGUA") {
        Componente::Portugues
    } else {
        Componente::Matematica
    }
}

fn texto_parametro(ctx: &ContextoLinha, id: &str) -> Option<String> {
    match ctx.parametros.get(id)? {
        ValorExpressao::Texto(texto) if !texto.trim().is_empty() => Some(texto.trim().to_string()),
        _ => None,
    }
}

fn numero_parametro(ctx: &ContextoLinha, id: &str, padrao: f64) -> f64 {
    ctx.parametros.get(id).and_then(ValorExpressao::como_numero).unwrap_or(padrao)
}

fn onda_avd<'a>(ctx: &'a ContextoLinha, componente: Componente, onda: &str) -> Option<&'a Value> {
    let chave = match componente {
        Componente::Matematica => "matematica",
        Componente::Portugues => "portugues",
    };
    ctx.aluno?
        .get("diagnostico_aprendizagem")?
        .get(chave)?
        .get(onda)
        .filter(|valor| !valor.is_null())
}

fn nivel_avd(ctx: &ContextoLinha, componente: Componente, onda: &str) -> Option<String> {
    onda_avd(ctx, componente, onda)?
        .get("nivel")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// "Abaixo do Básico" ou, se o critério escolhido incluir o Básico, também
/// "Básico". Sem dado da AvD não pontua.
fn avd_atende(ctx: &ContextoLinha, componente: Componente, onda: &str) -> bool {
    let Some(nivel) = nivel_avd(ctx, componente, onda) else {
        return false;
    };
    let nivel = normalizar_texto_basico(&nivel);
    let criterio = normalizar_texto_basico(
        &texto_parametro(ctx, PARAM_NIVEL_AVD).unwrap_or_else(|| PADRAO_NIVEL_AVD.to_string()),
    );
    nivel.starts_with("ABAIXO DO BASICO") || (criterio.contains(" OU BASICO") && nivel.starts_with("BASICO"))
}

fn frequencia(ctx: &ContextoLinha) -> Option<f64> {
    ctx.aluno?.get("frequencia_percentual").and_then(crate::valor_para_f64)
}

/// Média dos bimestres da Prova Paulista na disciplina do componente.
fn media_prova_paulista(ctx: &ContextoLinha, componente: Componente) -> Option<f64> {
    let bimestres = ctx.aluno?.get("prova_paulista")?.as_object()?;
    let notas: Vec<f64> = bimestres
        .values()
        .filter_map(|entrada| {
            entrada.get("disciplinas")?.as_object()?.iter().find_map(|(nome, nota)| {
                let nome = normalizar_texto_basico(nome);
                let bate = match componente {
                    Componente::Matematica => nome.starts_with("MAT"),
                    Componente::Portugues => {
                        nome.starts_with("PORT") || nome.starts_with("LP") || nome.starts_with("LINGUA P")
                    }
                };
                if bate { nota.as_f64() } else { None }
            })
        })
        .collect();
    (!notas.is_empty()).then(|| notas.iter().sum::<f64>() / notas.len() as f64)
}

fn nota_saresp(ctx: &ContextoLinha, componente: Componente) -> Option<f64> {
    let sigla = match componente {
        Componente::Matematica => "MAT",
        Componente::Portugues => "LPT",
    };
    ctx.aluno?
        .get("saresp")?
        .get("disciplinas")?
        .as_object()?
        .iter()
        .find(|(nome, _)| normalizar_texto_basico(nome) == sigla)
        .and_then(|(_, nota)| nota.as_f64())
}

struct Avaliacao {
    pontos: f64,
    criterios: Vec<&'static str>,
}

fn avaliar(ctx: &ContextoLinha, componente: Componente) -> Avaliacao {
    let mut pontos = 0.0;
    let mut criterios = Vec::new();
    if avd_atende(ctx, componente, "avd2") {
        pontos += 1.5;
        criterios.push("2ª AvD");
    }
    if avd_atende(ctx, componente, "avd1") {
        pontos += 1.0;
        criterios.push("1ª AvD");
    }
    if frequencia(ctx).is_some_and(|valor| valor < numero_parametro(ctx, PARAM_FREQUENCIA, PADRAO_FREQUENCIA)) {
        pontos += 1.0;
        criterios.push("Frequência");
    }
    if media_prova_paulista(ctx, componente)
        .is_some_and(|valor| valor < numero_parametro(ctx, PARAM_PROVA_PAULISTA, PADRAO_PROVA_PAULISTA))
    {
        pontos += 1.0;
        criterios.push("Prova Paulista");
    }
    if nota_saresp(ctx, componente).is_some_and(|valor| valor < numero_parametro(ctx, PARAM_SARESP, PADRAO_SARESP)) {
        pontos += 1.0;
        criterios.push("SARESP");
    }
    Avaliacao { pontos, criterios }
}

pub(crate) fn campo_avd1_nivel(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    texto_avd(ctx, componente(ctx, parametro), "avd1")
}

pub(crate) fn campo_avd2_nivel(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    texto_avd(ctx, componente(ctx, parametro), "avd2")
}

/// "Abaixo do Básico (7º ano)", como aparece no BI.
fn texto_avd(ctx: &ContextoLinha, componente: Componente, onda: &str) -> ValorExpressao {
    let Some(entrada) = onda_avd(ctx, componente, onda) else {
        return ValorExpressao::Nulo;
    };
    let nivel = entrada.get("nivel").and_then(Value::as_str).unwrap_or_default();
    let texto = match entrada.get("aprendizagem_equivalente").and_then(Value::as_str) {
        Some(equivalente) if !equivalente.is_empty() => format!("{nivel} ({equivalente})"),
        _ => nivel.to_string(),
    };
    if texto.is_empty() { ValorExpressao::Nulo } else { ValorExpressao::Texto(texto) }
}

/// Ano escolar equivalente da AvD mais recente como número (6º ano = 6,
/// 1ª série = 10), para ordenar: no empate de pontos vem antes quem tem a
/// aprendizagem equivalente mais baixa. Sem dado vai para o fim (99).
pub(crate) fn campo_avd_ano_equivalente(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let componente = componente(ctx, parametro);
    let equivalente = ["avd2", "avd1"].iter().find_map(|onda| {
        onda_avd(ctx, componente, onda)?
            .get("aprendizagem_equivalente")
            .and_then(Value::as_str)
            .filter(|texto| !texto.is_empty())
            .map(str::to_string)
    });
    let ano = equivalente.and_then(|texto| {
        let numero: String = texto.chars().take_while(char::is_ascii_digit).collect();
        let numero = numero.parse::<f64>().ok()?;
        Some(if normalizar_texto_basico(&texto).contains("SERIE") { numero + 9.0 } else { numero })
    });
    ValorExpressao::Numero(ano.unwrap_or(99.0))
}

/// Os quatro níveis da AvD, na ordem do mais baixo ao mais alto. O BI às
/// vezes escreve "Proficiente" no lugar de "Adequado" (mesma regra do
/// diagnóstico da turma, em calculos.ts).
pub(crate) const NIVEIS_AVD: [&str; 4] = ["Abaixo do Básico", "Básico", "Adequado", "Avançado"];

pub(crate) const PARAM_NIVEIS_FILTRO: &str = "avd_niveis_filtro";
pub(crate) const PADRAO_NIVEIS_FILTRO: &str = "Todos";
pub(crate) const OPCOES_NIVEIS_FILTRO: [&str; 7] = [
    "Todos",
    "Abaixo do Básico",
    "Básico",
    "Adequado",
    "Avançado",
    "Abaixo do Básico, Básico",
    "Adequado, Avançado",
];

fn nivel_padronizado(bruto: &str) -> Option<&'static str> {
    let texto = normalizar_texto_basico(bruto);
    if texto.starts_with("ABAIXO") {
        Some(NIVEIS_AVD[0])
    } else if texto.starts_with("BASIC") {
        Some(NIVEIS_AVD[1])
    } else if texto.starts_with("ADEQU") || texto.starts_with("PROFIC") {
        Some(NIVEIS_AVD[2])
    } else if texto.starts_with("AVANC") {
        Some(NIVEIS_AVD[3])
    } else {
        None
    }
}

/// Número da onda em chaves como "avd1", "avd2", "avd3"...
fn numero_onda(chave: &str) -> Option<u32> {
    chave.strip_prefix("avd")?.parse().ok()
}

/// Nível da avaliação mais recente que tem nível: a de maior número entre
/// "avd1", "avd2", "avd3"... Não fica preso a duas avaliações, então uma
/// 3ª AvD gravada como "avd3" já entra sozinha.
fn nivel_mais_recente(ctx: &ContextoLinha, componente: Componente) -> Option<&'static str> {
    let chave = match componente {
        Componente::Matematica => "matematica",
        Componente::Portugues => "portugues",
    };
    let ondas = ctx.aluno?.get("diagnostico_aprendizagem")?.get(chave)?.as_object()?;
    let mut candidatas: Vec<(u32, &'static str)> = ondas
        .iter()
        .filter_map(|(onda, valor)| {
            let nivel = valor.get("nivel").and_then(Value::as_str)?;
            Some((numero_onda(onda)?, nivel_padronizado(nivel)?))
        })
        .collect();
    candidatas.sort_by_key(|(numero, _)| *numero);
    candidatas.last().map(|(_, nivel)| *nivel)
}

/// "Abaixo do Básico", "Básico", "Adequado" ou "Avançado", sem o ano
/// equivalente: serve para filtrar e agrupar. Avaliação mais recente.
pub(crate) fn campo_avd_nivel(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    nivel_mais_recente(ctx, componente(ctx, parametro))
        .map(|nivel| ValorExpressao::Texto(nivel.to_string()))
        .unwrap_or(ValorExpressao::Nulo)
}

/// "Sim" quando o nível mais recente está entre os escolhidos no parâmetro
/// de execução PARAM_NIVEIS_FILTRO ("Abaixo do Básico, Básico", "Básico e
/// Avançado", "Todos"...). Sem nível na AvD, "Não".
pub(crate) fn campo_avd_nivel_escolhido(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let Some(nivel) = nivel_mais_recente(ctx, componente(ctx, parametro)) else {
        return ValorExpressao::Texto("Não".to_string());
    };
    let escolha = texto_parametro(ctx, PARAM_NIVEIS_FILTRO).unwrap_or_else(|| PADRAO_NIVEIS_FILTRO.to_string());
    let escolhidos = niveis_escolhidos(&escolha);
    let entra = escolhidos.is_empty() || escolhidos.contains(&nivel);
    ValorExpressao::Texto(if entra { "Sim" } else { "Não" }.to_string())
}

/// Lê a lista de níveis digitada, com qualquer separador ("Abaixo do
/// Básico, Básico", "Básico ou Avançado"). Nenhum nível reconhecido (ex.:
/// "Todos") = todos.
fn niveis_escolhidos(texto: &str) -> Vec<&'static str> {
    let normalizado = normalizar_texto_basico(texto);
    let palavras: Vec<&str> = normalizado.split_whitespace().collect();
    let mut niveis = Vec::new();
    let mut indice = 0;
    while indice < palavras.len() {
        let palavra = palavras[indice];
        let nivel = if palavra.starts_with("ABAIXO") {
            // "ABAIXO DO BASICO": o "BASICO" seguinte não é outro nível.
            if palavras.get(indice + 1) == Some(&"DO") {
                indice += 1;
            }
            if palavras.get(indice + 1).is_some_and(|seguinte| seguinte.starts_with("BASIC")) {
                indice += 1;
            }
            Some(NIVEIS_AVD[0])
        } else {
            nivel_padronizado(palavra)
        };
        if let Some(nivel) = nivel {
            if !niveis.contains(&nivel) {
                niveis.push(nivel);
            }
        }
        indice += 1;
    }
    niveis
}

pub(crate) fn campo_prova_paulista_media_componente(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    media_prova_paulista(ctx, componente(ctx, parametro))
        .map(|media| ValorExpressao::Numero((media * 10.0).round() / 10.0))
        .unwrap_or(ValorExpressao::Nulo)
}

pub(crate) fn campo_saresp_componente(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    nota_saresp(ctx, componente(ctx, parametro))
        .map(ValorExpressao::Numero)
        .unwrap_or(ValorExpressao::Nulo)
}

pub(crate) fn campo_prioridade_pontos(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    ValorExpressao::Numero(avaliar(ctx, componente(ctx, parametro)).pontos)
}

pub(crate) fn campo_prioridade_criterios(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let avaliacao = avaliar(ctx, componente(ctx, parametro));
    if avaliacao.criterios.is_empty() {
        ValorExpressao::Nulo
    } else {
        ValorExpressao::Texto(avaliacao.criterios.join(", "))
    }
}

pub(crate) fn campo_prioritario(ctx: &ContextoLinha, parametro: Option<&str>) -> ValorExpressao {
    let pontos = avaliar(ctx, componente(ctx, parametro)).pontos;
    let corte = numero_parametro(ctx, PARAM_PONTOS, PADRAO_PONTOS);
    ValorExpressao::Texto(if pontos >= corte { "Sim" } else { "Não" }.to_string())
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::collections::BTreeMap;

    fn aluno() -> Value {
        serde_json::json!({
            "frequencia_percentual": 70,
            "diagnostico_aprendizagem": {
                "matematica": {
                    "avd1": { "nivel": "Básico", "aprendizagem_equivalente": "8º ano" },
                    "avd2": { "nivel": "Abaixo do Básico", "aprendizagem_equivalente": "7º ano" }
                },
                "portugues": {
                    "avd1": { "nivel": "Adequado", "aprendizagem_equivalente": "1ª série" },
                    "avd2": null
                }
            },
            "prova_paulista": {
                "1": { "disciplinas": { "MAT": 4, "PORT": 7 } },
                "2": { "disciplinas": { "MAT": 5, "PORT": 8 } }
            },
            "saresp": { "disciplinas": { "MAT": 3.5, "LPT": 6.0 } }
        })
    }

    fn avaliar_com(parametros: &BTreeMap<String, ValorExpressao>, componente_coluna: Option<&str>) -> (ValorExpressao, ValorExpressao, ValorExpressao) {
        let turma: crate::TurmaArquivo = serde_json::from_value(serde_json::json!({ "codigo": "1ª Série A", "ano": 2026, "alunos": {} })).unwrap();
        let aluno = aluno();
        let ctx = ContextoLinha {
            turma: &turma,
            matricula: None,
            aluno: Some(&aluno),
            bimestre: "3",
            nota_minima: 5.0,
            disciplina_contexto: None,
            item: None,
            parametros,
        };
        (
            campo_prioridade_pontos(&ctx, componente_coluna),
            campo_prioridade_criterios(&ctx, componente_coluna),
            campo_prioritario(&ctx, componente_coluna),
        )
    }

    #[test]
    fn matematica_soma_os_criterios_da_planilha() {
        // 2ª AvD (1,5) + frequência 70 < 75 (1) + PP média 4,5 < 5 (1) + SARESP 3,5 < 4 (1).
        let (pontos, criterios, prioritario) = avaliar_com(&BTreeMap::new(), None);
        assert_eq!(pontos, ValorExpressao::Numero(4.5));
        assert_eq!(criterios, ValorExpressao::Texto("2ª AvD, Frequência, Prova Paulista, SARESP".into()));
        assert_eq!(prioritario, ValorExpressao::Texto("Sim".into()));
    }

    #[test]
    fn criterio_basico_e_componente_vem_dos_parametros() {
        let mut parametros = BTreeMap::new();
        parametros.insert(PARAM_NIVEL_AVD.to_string(), ValorExpressao::Texto("Abaixo do Básico ou Básico".into()));
        parametros.insert(PARAM_FREQUENCIA.to_string(), ValorExpressao::Numero(60.0));
        let (pontos, _, _) = avaliar_com(&parametros, None);
        // 2ª AvD (1,5) + 1ª AvD Básico (1) + PP (1) + SARESP (1); frequência 70 já não conta.
        assert_eq!(pontos, ValorExpressao::Numero(4.5));

        parametros.insert(PARAM_COMPONENTE.to_string(), ValorExpressao::Texto("Língua Portuguesa".into()));
        let (pontos, criterios, prioritario) = avaliar_com(&parametros, None);
        assert_eq!(pontos, ValorExpressao::Numero(0.0));
        assert_eq!(criterios, ValorExpressao::Nulo);
        assert_eq!(prioritario, ValorExpressao::Texto("Não".into()));
    }

    #[test]
    fn parametro_da_coluna_vence_o_do_relatorio() {
        let mut parametros = BTreeMap::new();
        parametros.insert(PARAM_COMPONENTE.to_string(), ValorExpressao::Texto("Matemática".into()));
        let (pontos, _, _) = avaliar_com(&parametros, Some("LP"));
        assert_eq!(pontos, ValorExpressao::Numero(1.0)); // só a frequência
    }

    #[test]
    fn nivel_avd_usa_a_avaliacao_mais_recente_sem_o_ano() {
        let turma: crate::TurmaArquivo = serde_json::from_value(serde_json::json!({ "codigo": "1ª Série A", "ano": 2026, "alunos": {} })).unwrap();
        let aluno = serde_json::json!({
            "diagnostico_aprendizagem": {
                "matematica": {
                    "avd1": { "nivel": "Abaixo do Básico", "aprendizagem_equivalente": "6º ano" },
                    "avd2": { "nivel": "Básico", "aprendizagem_equivalente": "8º ano" },
                    "avd3": { "nivel": "Proficiente", "aprendizagem_equivalente": "1ª série" }
                },
                "portugues": { "avd1": { "nivel": "Básico" }, "avd2": null }
            }
        });
        let mut parametros = BTreeMap::new();
        let nivel = |parametros: &BTreeMap<String, ValorExpressao>, componente: &str| {
            let ctx = ContextoLinha {
                turma: &turma,
                matricula: None,
                aluno: Some(&aluno),
                bimestre: "3",
                nota_minima: 5.0,
                disciplina_contexto: None,
                item: None,
                parametros,
            };
            (campo_avd_nivel(&ctx, Some(componente)), campo_avd_nivel_escolhido(&ctx, Some(componente)))
        };
        // A 3ª AvD já entra, e "Proficiente" vira "Adequado".
        assert_eq!(nivel(&parametros, "MAT"), (ValorExpressao::Texto("Adequado".into()), ValorExpressao::Texto("Sim".into())));
        // A 2ª AvD de LP está vazia: vale a 1ª.
        assert_eq!(nivel(&parametros, "LP").0, ValorExpressao::Texto("Básico".into()));

        parametros.insert(PARAM_NIVEIS_FILTRO.to_string(), ValorExpressao::Texto("Abaixo do Básico".into()));
        assert_eq!(nivel(&parametros, "LP").1, ValorExpressao::Texto("Não".into()), "Básico não é Abaixo do Básico");
        parametros.insert(PARAM_NIVEIS_FILTRO.to_string(), ValorExpressao::Texto("abaixo do basico, Básico".into()));
        assert_eq!(nivel(&parametros, "LP").1, ValorExpressao::Texto("Sim".into()));
        assert_eq!(nivel(&parametros, "MAT").1, ValorExpressao::Texto("Não".into()));
    }

    #[test]
    fn niveis_escolhidos_aceita_qualquer_separador() {
        assert_eq!(niveis_escolhidos("Todos"), Vec::<&str>::new());
        assert_eq!(niveis_escolhidos("Abaixo do Básico"), vec!["Abaixo do Básico"]);
        assert_eq!(niveis_escolhidos("Abaixo do Básico ou Básico"), vec!["Abaixo do Básico", "Básico"]);
        assert_eq!(niveis_escolhidos("Básico; Avançado e adequado"), vec!["Básico", "Avançado", "Adequado"]);
    }
}
