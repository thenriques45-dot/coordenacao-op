// Dados extras para o Relatório Diagnóstico da Turma.
// O `carregar_turma` já entrega notas, frequência geral, diagnóstico AvD,
// atendimentos e encaminhamentos do bimestre em vista; aqui vão os blocos que
// o detalhe da turma não expõe: Prova Paulista e tarefas (todos os
// bimestres), Aluno Presente (presença semanal e risco de reprovação por
// faltas), SARESP, perfil da turma e alunos destaque.

use crate::*;

use serde_json::{Map, Value};
use std::{fs, path::PathBuf};

pub(crate) fn extrair_indicadores_diagnostico(dados: &Value) -> Value {
    let mut alunos = Map::new();
    if let Some(lista) = dados.get("alunos").and_then(Value::as_object) {
        for (matricula, info) in lista {
            let mut extras = Map::new();
            for campo in ["prova_paulista", "tarefas", "aluno_presente", "saresp"] {
                if let Some(valor) = info.get(campo).filter(|v| v.is_object()) {
                    extras.insert(campo.to_string(), valor.clone());
                }
            }
            if !extras.is_empty() {
                alunos.insert(matricula.clone(), Value::Object(extras));
            }
        }
    }
    let objeto_ou_vazio = |campo: &str| {
        dados
            .get(campo)
            .filter(|v| v.is_object())
            .cloned()
            .unwrap_or_else(|| Value::Object(Map::new()))
    };
    serde_json::json!({
        "alunos": alunos,
        "perfil_turma": objeto_ou_vazio("perfil_turma"),
        "alunos_destaque": objeto_ou_vazio("alunos_destaque"),
    })
}

#[tauri::command(async)]
pub(crate) fn carregar_indicadores_diagnostico_turma(caminho: String) -> Result<Value, String> {
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    Ok(extrair_indicadores_diagnostico(&dados))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extrai_blocos_por_aluno_perfil_e_destaques() {
        let dados = serde_json::json!({
            "codigo": "1A",
            "alunos": {
                "111": {
                    "nome": "Ana",
                    "prova_paulista": { "1": { "participou": true, "geral": 62 } },
                    "tarefas": { "1": { "feitas": 3, "total": 4, "percentual": 75.0 } },
                    "aluno_presente": { "anual": 72.5, "semana_atual": 60.0, "risco_reprovacao": true },
                    "saresp": { "media": 4.2, "menor_nota": "MAT", "disciplinas": { "LPT": 5.0, "MAT": 3.4 } }
                },
                "222": { "nome": "Bruno" }
            },
            "perfil_turma": { "1": { "engajamento": "alto" } },
            "alunos_destaque": { "1": { "lideranca": "Ana" } }
        });
        let resultado = extrair_indicadores_diagnostico(&dados);
        assert_eq!(resultado["alunos"]["111"]["prova_paulista"]["1"]["geral"], 62);
        assert_eq!(resultado["alunos"]["111"]["tarefas"]["1"]["feitas"], 3);
        assert_eq!(resultado["alunos"]["111"]["aluno_presente"]["risco_reprovacao"], true);
        assert_eq!(resultado["alunos"]["111"]["saresp"]["disciplinas"]["MAT"], 3.4);
        assert!(resultado["alunos"].get("222").is_none());
        assert_eq!(resultado["perfil_turma"]["1"]["engajamento"], "alto");
        assert_eq!(resultado["alunos_destaque"]["1"]["lideranca"], "Ana");
    }

    #[test]
    fn turma_sem_dados_extras_devolve_objetos_vazios() {
        let resultado = extrair_indicadores_diagnostico(&serde_json::json!({ "codigo": "1A" }));
        assert_eq!(resultado["alunos"], serde_json::json!({}));
        assert_eq!(resultado["perfil_turma"], serde_json::json!({}));
        assert_eq!(resultado["alunos_destaque"], serde_json::json!({}));
    }
}
