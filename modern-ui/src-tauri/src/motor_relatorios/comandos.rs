// Comandos Tauri do motor de relatórios: substituem os ~8 comandos
// específicos de hoje (um por relatório) por um punhado de comandos
// genéricos, parametrizados pela ReportDefinition.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

use crate::*;

use super::campos::{CategoriaCampo, TipoCampo, CAMPOS};
use super::definicao::ReportDefinition;
use super::embutidos::definicoes_embutidas;
use super::executor::{executar_relatorio, RelatorioGenericoResultado, SecaoPreview};
use super::expressoes::ValorExpressao;

/// DTO do registro de campos pro construtor visual — a struct real
/// (campos.rs) guarda um ponteiro de função no extrator, que não é
/// serializável, então só o que o frontend precisa pra montar a paleta de
/// blocos atravessa a fronteira do comando.
#[derive(Serialize)]
pub(crate) struct CampoRelatorioInfo {
    pub(crate) id: String,
    pub(crate) rotulo: String,
    pub(crate) categoria: CategoriaCampo,
    pub(crate) tipo: TipoCampo,
    pub(crate) requer_parametro: bool,
}

/// Nomes de disciplina conhecidos (varrendo `carga_horaria`/`medias`/
/// `ajustes_medias_conselho`/`frequencia` de todas as turmas) — alimenta o
/// dropdown de disciplina no construtor visual pros campos parametrizados
/// (nota/frequência de UMA disciplina). Sem filtro nenhum: ao contrário de
/// `turmas::listar_disciplinas_turma` (usado pelo Planejamento, que exclui
/// disciplinas de apoio/expansão porque essas não têm Plano de Ensino), aqui
/// o usuário pode querer referenciar qualquer disciplina lançada.
#[tauri::command(async)]
pub(crate) fn listar_disciplinas_conhecidas() -> Result<Vec<String>, String> {
    let turmas = carregar_turmas_com_caminho()?;
    let mut disciplinas: BTreeSet<String> = BTreeSet::new();

    for (_, turma) in &turmas {
        if let Some(carga) = &turma.carga_horaria {
            for por_bimestre in carga.values() {
                if let Some(obj) = por_bimestre.as_object() {
                    disciplinas.extend(obj.keys().cloned());
                }
            }
        }
        let Some(alunos) = &turma.alunos else { continue };
        for aluno in alunos.values() {
            for campo in ["medias", "ajustes_medias_conselho", "frequencia"] {
                let Some(por_bimestre) = aluno.get(campo).and_then(Value::as_object) else { continue };
                for disciplinas_bimestre in por_bimestre.values() {
                    if let Some(obj) = disciplinas_bimestre.as_object() {
                        disciplinas.extend(obj.keys().cloned());
                    }
                }
            }
        }
    }

    Ok(disciplinas.into_iter().collect())
}

#[tauri::command(async)]
pub(crate) fn listar_campos_disponiveis() -> Vec<CampoRelatorioInfo> {
    CAMPOS
        .iter()
        .map(|campo| CampoRelatorioInfo {
            id: campo.id.to_string(),
            rotulo: campo.rotulo.to_string(),
            categoria: campo.categoria,
            tipo: campo.tipo,
            requer_parametro: campo.requer_parametro,
        })
        .collect()
}

fn pasta_definicoes_personalizadas() -> Result<PathBuf, String> {
    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios_personalizados");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    Ok(pasta)
}

fn sanitizar_id_arquivo(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

fn carregar_definicoes_personalizadas() -> Result<Vec<ReportDefinition>, String> {
    let pasta = pasta_definicoes_personalizadas()?;
    let mut definicoes = Vec::new();
    for entrada in fs::read_dir(&pasta).map_err(|err| err.to_string())? {
        let entrada = entrada.map_err(|err| err.to_string())?;
        let caminho = entrada.path();
        if caminho.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Ok(texto) = fs::read_to_string(&caminho) else {
            continue;
        };
        // Ignora arquivo corrompido/de outra versão em vez de derrubar a
        // listagem inteira — o usuário só não vê aquele relatório na lista.
        if let Ok(definicao) = serde_json::from_str::<ReportDefinition>(&texto) {
            definicoes.push(definicao);
        }
    }
    Ok(definicoes)
}

#[tauri::command(async)]
pub(crate) fn listar_definicoes_relatorio() -> Result<Vec<ReportDefinition>, String> {
    let mut definicoes = definicoes_embutidas();
    definicoes.extend(carregar_definicoes_personalizadas()?);
    Ok(definicoes)
}

#[derive(Deserialize)]
pub(crate) struct ExecutarRelatorioGenericoInput {
    pub(crate) definicao: ReportDefinition,
    pub(crate) bimestre: String,
    /// Valores dos parâmetros de execução declarados em
    /// `definicao.parametros` (ex.: o limiar de elegibilidade) — o que a UI
    /// não enviar cai no `valor_padrao` de cada um.
    #[serde(default)]
    pub(crate) parametros: BTreeMap<String, ValorExpressao>,
}

#[tauri::command(async)]
pub(crate) fn executar_relatorio_generico(
    input: ExecutarRelatorioGenericoInput,
) -> Result<RelatorioGenericoResultado, String> {
    executar_relatorio(&input.definicao, &input.bimestre, &input.parametros)
}

const LIMITE_PADRAO_PREVISUALIZACAO: usize = 20;

#[derive(Deserialize)]
pub(crate) struct PreVisualizarRelatorioInput {
    pub(crate) definicao: ReportDefinition,
    pub(crate) bimestre: String,
    #[serde(default)]
    pub(crate) parametros: BTreeMap<String, ValorExpressao>,
}

#[tauri::command(async)]
pub(crate) fn pre_visualizar_relatorio(input: PreVisualizarRelatorioInput) -> Result<Vec<SecaoPreview>, String> {
    super::executor::pre_visualizar_relatorio(
        &input.definicao,
        &input.bimestre,
        &input.parametros,
        LIMITE_PADRAO_PREVISUALIZACAO,
    )
}

#[tauri::command(async)]
pub(crate) fn salvar_definicao_relatorio(definicao: ReportDefinition) -> Result<(), String> {
    if definicao.embutido {
        return Err("Relatórios embutidos não podem ser sobrescritos — duplique para customizar.".to_string());
    }
    if definicao.id.trim().is_empty() {
        return Err("O relatório precisa de um identificador.".to_string());
    }
    let pasta = pasta_definicoes_personalizadas()?;
    let caminho = pasta.join(format!("{}.json", sanitizar_id_arquivo(&definicao.id)));
    let conteudo = serde_json::to_string_pretty(&definicao).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &conteudo).map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub(crate) fn excluir_definicao_relatorio(id: String) -> Result<(), String> {
    let pasta = pasta_definicoes_personalizadas()?;
    let caminho = pasta.join(format!("{}.json", sanitizar_id_arquivo(&id)));
    if caminho.is_file() {
        fs::remove_file(&caminho).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command(async)]
pub(crate) fn exportar_definicao_relatorio(id: String, destino: String) -> Result<(), String> {
    let definicoes = listar_definicoes_relatorio()?;
    let definicao = definicoes
        .into_iter()
        .find(|definicao| definicao.id == id)
        .ok_or_else(|| "Relatório não encontrado.".to_string())?;
    let conteudo = serde_json::to_string_pretty(&definicao).map_err(|err| err.to_string())?;
    fs::write(&destino, conteudo).map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub(crate) fn importar_definicao_relatorio(caminho: String) -> Result<ReportDefinition, String> {
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut definicao: ReportDefinition =
        serde_json::from_str(&texto).map_err(|err| format!("Arquivo de relatório inválido: {err}"))?;
    definicao.embutido = false;
    salvar_definicao_relatorio(definicao.clone())?;
    Ok(definicao)
}
