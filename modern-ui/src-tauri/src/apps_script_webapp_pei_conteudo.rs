
// Conteúdo (estático e dinâmico) do Web App do PEI — mesmo modelo de
// apps_script_webapp_conteudo.rs (Planejamento), separado de
// apps_script_api.rs, que fica só com as chamadas HTTP à Apps Script API.
//
// Estático (include_str!): Code.gs e Index.html — ver src-tauri/scripts/webapp-pei/.
// O manifesto (appsscript.json) é reaproveitado do módulo de Planejamento
// (mesmo conteúdo, sem nada específico de PEI).
//
// Dinâmico (montado aqui a cada "Criar automaticamente"/republicação): as
// turmas que têm ao menos um aluno elegível, e os próprios elegíveis de cada
// uma — turmas sem nenhum elegível simplesmente não aparecem no seletor, em
// vez de um dropdown único e plano com a escola inteira, como no Forms legado.

use crate::*;

pub(crate) const CODE_GS_PEI: &str = include_str!("../scripts/webapp-pei/Code.gs");
pub(crate) const INDEX_HTML_PEI: &str = include_str!("../scripts/webapp-pei/Index.html");

/// Agrega os alunos elegíveis (via listar_alunos_elegiveis_com_disciplinas,
/// já usada pelo resto do PEI) por turma e monta o arquivo `DadosPeiReais.gs`,
/// dinâmico, injetado a cada implantação. Só entram turmas com pelo menos um
/// elegível — quem não tem nenhum simplesmente não aparece na lista.
pub(crate) fn construir_dados_pei_gs() -> Result<String, String> {
    let elegiveis = listar_alunos_elegiveis_com_disciplinas()?;

    let mut elegiveis_por_turma: std::collections::BTreeMap<String, Vec<serde_json::Value>> =
        Default::default();
    for aluno in &elegiveis {
        elegiveis_por_turma
            .entry(aluno.turma.clone())
            .or_default()
            .push(serde_json::json!({
                "nome": aluno.nome,
                "disciplinas": aluno.disciplinas,
            }));
    }

    let turmas_json = serde_json::to_string(&elegiveis_por_turma.keys().collect::<Vec<_>>())
        .map_err(|err| format!("Erro ao serializar as turmas do PEI: {err}"))?;
    let elegiveis_json = serde_json::to_string(&elegiveis_por_turma)
        .map_err(|err| format!("Erro ao serializar os alunos elegíveis do PEI: {err}"))?;

    Ok(format!(
        "// Gerado automaticamente pelo CoordenacaoOP a cada implantação — não editar\n\
         // manualmente (é sobrescrito na próxima republicação). Contém as turmas com\n\
         // ao menos um aluno elegível, usadas por obterDadosPei (Code.gs) para montar\n\
         // o seletor de turma/aluno do Web App do PEI.\n\n\
         const TURMAS_PEI = {turmas_json};\n\n\
         const ELEGIVEIS_POR_TURMA = {elegiveis_json};\n"
    ))
}
