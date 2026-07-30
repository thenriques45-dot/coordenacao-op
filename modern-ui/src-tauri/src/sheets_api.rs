#![allow(unused_imports)]

// Planilha de respostas do Planejamento via Sheets API (autenticada com o
// OAuth do coordenador — ver google_oauth.rs). Substitui a necessidade de
// criar a planilha manualmente e de compartilhá-la como pública: o app cria
// a planilha e lê os dados de volta autenticado.
//
// Mesmo cuidado de apps_script_api.rs: reqwest::blocking usado aqui precisa
// rodar fora do runtime async do Tauri (thread OS dedicada no call site),
// senão reproduz o panic "Cannot drop a runtime" já visto nesta sessão.

use crate::*;

use serde::{Deserialize, Serialize};

const BASE_SHEETS_API: &str = "https://sheets.googleapis.com/v4/spreadsheets";

pub(crate) const ABA_RESPOSTAS: &str = "Respostas";

pub(crate) const CABECALHO_RESPOSTAS: [&str; 13] = [
    "Timestamp",
    "Segmento",
    "Professor",
    "Ano/Série",
    "Turmas",
    "Componente",
    "Bimestre",
    "Aulas selecionadas",
    "Estratégias",
    "Recursos",
    "Instrumentos de avaliação",
    "Como avaliará",
    "Observações/adaptações",
];

// Esquema fixo da planilha de respostas do PEI (ver
// pei::parsear_valores_sheets_pei) — mapeamento direto por coluna, sem
// decomposição, diferente das "aulas" de Planejamento.
pub(crate) const CABECALHO_RESPOSTAS_PEI: [&str; 12] = [
    "Timestamp",
    "E-mail",
    "Professor",
    "Nome do Estudante",
    "Aluno",
    "Turma",
    "Componente Curricular",
    "Bimestre",
    "Conteúdos e Habilidades",
    "Estratégias e Recursos de Acessibilidade",
    "Instrumentos de Acompanhamento",
    "Recursos Indicados",
];

#[derive(Serialize)]
struct CriarPlanilhaRequest {
    properties: PlanilhaPropriedades,
    sheets: Vec<AbaRequest>,
}

#[derive(Serialize)]
struct PlanilhaPropriedades {
    title: String,
}

#[derive(Serialize)]
struct AbaRequest {
    properties: AbaPropriedades,
    data: Vec<DadosLinha>,
}

#[derive(Serialize)]
struct AbaPropriedades {
    title: String,
}

#[derive(Serialize)]
struct DadosLinha {
    #[serde(rename = "startRow")]
    start_row: i32,
    #[serde(rename = "startColumn")]
    start_column: i32,
    #[serde(rename = "rowData")]
    row_data: Vec<LinhaValores>,
}

#[derive(Serialize)]
struct LinhaValores {
    values: Vec<CelulaValor>,
}

#[derive(Serialize)]
struct CelulaValor {
    #[serde(rename = "userEnteredValue")]
    user_entered_value: ValorTexto,
}

#[derive(Serialize)]
struct ValorTexto {
    #[serde(rename = "stringValue")]
    string_value: String,
}

#[derive(Deserialize)]
struct CriarPlanilhaResponse {
    #[serde(rename = "spreadsheetId")]
    spreadsheet_id: String,
}

fn tratar_resposta_erro(
    resposta: reqwest::blocking::Response,
    contexto: &str,
) -> Result<reqwest::blocking::Response, String> {
    if resposta.status().is_success() {
        return Ok(resposta);
    }
    let status = resposta.status();
    let texto = resposta.text().unwrap_or_default();
    Err(format!("{contexto}: erro {status}. Detalhe: {texto}"))
}

/// Cria uma planilha de respostas já com o cabeçalho fixo na aba indicada.
/// Retorna o `spreadsheetId`. Genérica — usada tanto por Planejamento quanto
/// por PEI, cada um com seu próprio título/aba/cabeçalho.
pub(crate) fn criar_planilha_respostas(
    access_token: &str,
    titulo: &str,
    aba: &str,
    cabecalho: &[&str],
) -> Result<String, String> {
    let celulas: Vec<CelulaValor> = cabecalho
        .iter()
        .map(|texto| CelulaValor {
            user_entered_value: ValorTexto {
                string_value: texto.to_string(),
            },
        })
        .collect();

    let corpo = CriarPlanilhaRequest {
        properties: PlanilhaPropriedades {
            title: titulo.to_string(),
        },
        sheets: vec![AbaRequest {
            properties: AbaPropriedades {
                title: aba.to_string(),
            },
            data: vec![DadosLinha {
                start_row: 0,
                start_column: 0,
                row_data: vec![LinhaValores { values: celulas }],
            }],
        }],
    };

    let client = reqwest::blocking::Client::new();
    let resposta = client
        .post(BASE_SHEETS_API)
        .bearer_auth(access_token)
        .json(&corpo)
        .send()
        .map_err(|err| format!("Erro ao criar a planilha de respostas: {err}"))?;
    let resposta = tratar_resposta_erro(resposta, "Erro ao criar a planilha de respostas")?;
    let corpo_resp: CriarPlanilhaResponse = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar a resposta de criação da planilha: {err}"))?;
    Ok(corpo_resp.spreadsheet_id)
}

#[derive(Deserialize)]
struct ValoresResponse {
    #[serde(default)]
    values: Vec<Vec<serde_json::Value>>,
}

/// Lê um intervalo da planilha autenticado (sem exigir que fique pública).
/// A Sheets API omite células finais vazias de cada linha — o chamador deve
/// tratar linhas mais curtas que o esperado (ver parsear_valores_sheets_planejamento).
pub(crate) fn buscar_planilha_valores_autenticado(
    access_token: &str,
    planilha_id: &str,
    intervalo: &str,
) -> Result<Vec<Vec<String>>, String> {
    let url = format!(
        "{BASE_SHEETS_API}/{planilha_id}/values/{}",
        urlencoding_simples(intervalo)
    );
    let client = reqwest::blocking::Client::new();
    let resposta = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .map_err(|err| format!("Erro ao ler a planilha de respostas: {err}"))?;
    let resposta = tratar_resposta_erro(resposta, "Erro ao ler a planilha de respostas")?;
    let corpo: ValoresResponse = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar os valores da planilha: {err}"))?;

    Ok(corpo
        .values
        .into_iter()
        .map(|linha| {
            linha
                .into_iter()
                .map(|valor| match valor {
                    serde_json::Value::String(s) => s,
                    outro => outro.to_string(),
                })
                .collect()
        })
        .collect())
}

fn urlencoding_simples(texto: &str) -> String {
    url::form_urlencoded::byte_serialize(texto.as_bytes()).collect()
}
