#![allow(unused_imports)]

// Conteúdo (estático e dinâmico) do Web App de Planejamento — separado de
// apps_script_api.rs, que fica só com as chamadas HTTP à Apps Script API.
//
// Estático (include_str!, copiado fielmente dos .gs legados — ver
// src-tauri/scripts/webapp/): dados de Escopo-Sequência por segmento
// (DadosMedio.gs/DadosAnosFinais.gs), o Code.gs, o Index.html e o manifesto.
//
// Dinâmico (montado aqui a cada "Criar automaticamente"/republicação): as
// turmas reais e as disciplinas reais por série/ano, para o Web App casar
// os componentes curados (Escopo-Sequência) com o que a escola realmente
// oferece — em vez de confiar numa lista estática que já se mostrou
// desatualizada (ex.: "Educação Financeira" nem existia no .gs de Anos
// Finais, embora apareça nos dados reais de turma).

use crate::*;

pub(crate) const DADOS_MEDIO_GS: &str = include_str!("../scripts/webapp/DadosMedio.gs");
pub(crate) const DADOS_ANOS_FINAIS_GS: &str = include_str!("../scripts/webapp/DadosAnosFinais.gs");
pub(crate) const CODE_GS: &str = include_str!("../scripts/webapp/Code.gs");
pub(crate) const INDEX_HTML: &str = include_str!("../scripts/webapp/Index.html");
pub(crate) const APPSSCRIPT_JSON: &str = include_str!("../scripts/webapp/appsscript.json");

const SERIES_MEDIO: [&str; 3] = ["1ª Série", "2ª Série", "3ª Série"];
const ANOS_ANOS_FINAIS: [&str; 4] = ["6º Ano", "7º Ano", "8º Ano", "9º Ano"];

fn segmento_da_serie(serie: &str) -> Option<&'static str> {
    if serie.contains("Série") {
        Some("medio")
    } else if serie.contains("Ano") {
        Some("anos_finais")
    } else {
        None
    }
}

fn js_array_de_strings(itens: &[String]) -> String {
    let valores: Vec<String> = itens
        .iter()
        .map(|s| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string()))
        .collect();
    format!("[{}]", valores.join(", "))
}

fn js_objeto_por_chave(unidades: &[&str], mapa: &std::collections::BTreeMap<String, Vec<String>>) -> String {
    let mut linhas = Vec::new();
    for unidade in unidades {
        let vazio = Vec::new();
        let itens = mapa.get(*unidade).unwrap_or(&vazio);
        linhas.push(format!(
            "  {}: {}",
            serde_json::to_string(unidade).unwrap(),
            js_array_de_strings(itens)
        ));
    }
    format!("{{\n{}\n}}", linhas.join(",\n"))
}

/// Agrega turmas e disciplinas reais (via turmas::listar_turmas /
/// listar_disciplinas_turma, os mesmos comandos já usados pelo resto do
/// app) e monta o arquivo `DadosReais.gs`, dinâmico, injetado a cada
/// implantação. Nomes de disciplina são normalizados (mesma função usada
/// na importação do mapão) para casar de forma confiável com os nomes
/// curados do Escopo-Sequência, que às vezes divergem em acentuação.
pub(crate) fn construir_dados_reais_gs() -> Result<String, String> {
    let turmas = turmas::listar_turmas()?;

    let mut turmas_por_serie: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    let mut disciplinas_por_serie: std::collections::BTreeMap<String, std::collections::BTreeSet<String>> =
        Default::default();

    for turma in &turmas {
        let Some(serie) = turma.serie.as_deref() else { continue };
        if segmento_da_serie(serie).is_none() {
            continue;
        }
        turmas_por_serie
            .entry(serie.to_string())
            .or_default()
            .push(turma.codigo.clone());

        let disciplinas = listar_disciplinas_turma(turma.caminho.clone())?;
        let conjunto = disciplinas_por_serie.entry(serie.to_string()).or_default();
        for disciplina in disciplinas {
            conjunto.insert(normalizar_texto_basico(&disciplina));
        }
    }

    let disciplinas_por_serie_vec: std::collections::BTreeMap<String, Vec<String>> = disciplinas_por_serie
        .into_iter()
        .map(|(serie, conjunto)| (serie, conjunto.into_iter().collect()))
        .collect();

    let series_medio_ref: Vec<&str> = SERIES_MEDIO.to_vec();
    let anos_af_ref: Vec<&str> = ANOS_ANOS_FINAIS.to_vec();

    let conteudo = format!(
        "// Gerado automaticamente pelo CoordenacaoOP a cada implantação — não editar\n\
         // manualmente (é sobrescrito na próxima republicação). Contém as turmas e as\n\
         // disciplinas reais da escola no momento da implantação, usadas por\n\
         // obterDadosSegmento (Code.gs) para casar com os componentes curados de\n\
         // Escopo-Sequência.\n\n\
         const TURMAS_POR_SERIE_MEDIO = {};\n\n\
         const TURMAS_POR_ANO_ANOS_FINAIS = {};\n\n\
         const DISCIPLINAS_REAIS_POR_SERIE_MEDIO = {};\n\n\
         const DISCIPLINAS_REAIS_POR_ANO_ANOS_FINAIS = {};\n",
        js_objeto_por_chave(&series_medio_ref, &turmas_por_serie),
        js_objeto_por_chave(&anos_af_ref, &turmas_por_serie),
        js_objeto_por_chave(&series_medio_ref, &disciplinas_por_serie_vec),
        js_objeto_por_chave(&anos_af_ref, &disciplinas_por_serie_vec),
    );

    Ok(conteudo)
}

/// Monta o arquivo `ComponentesExtras.gs` a partir do que o coordenador
/// configurou manualmente (ex.: "Sociologia" para 1ª e 2ª Série do Médio) —
/// ver `ConfigPlanejamento.componentes_extras_medio/anos_finais`.
pub(crate) fn construir_componentes_extras_gs(config: &ConfigPlanejamento) -> Result<String, String> {
    let medio = serde_json::to_string(&config.componentes_extras_medio)
        .map_err(|err| format!("Erro ao serializar componentes extras (Médio): {err}"))?;
    let anos_finais = serde_json::to_string(&config.componentes_extras_anos_finais)
        .map_err(|err| format!("Erro ao serializar componentes extras (Anos Finais): {err}"))?;

    Ok(format!(
        "// Gerado automaticamente a partir da configuração do coordenador —\n\
         // componentes confirmados manualmente por série/ano mesmo sem dado real\n\
         // nas turmas importadas (ver ConfigPlanejamento em tipos.rs).\n\n\
         const COMPONENTES_EXTRAS_MEDIO = {medio};\n\
         const COMPONENTES_EXTRAS_ANOS_FINAIS = {anos_finais};\n"
    ))
}
