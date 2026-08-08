
// Criação e implantação automática do Web App de Planejamento no Google, via
// Apps Script API (script.googleapis.com) e Sheets API (ver sheets_api.rs),
// autenticado pelo OAuth do coordenador (ver google_oauth.rs). Substitui o
// fluxo manual de colar um script no editor do Apps Script — que continua
// existindo como alternativa (botão "Copiar script" em Planejamento.tsx)
// para domínios onde a Apps Script API esteja bloqueada por política do
// Workspace.
//
// Reaproveita o projeto/planilha/implantação já existentes (guardados em
// ConfigPlanejamento) em vez de criar recursos novos a cada clique — os
// primeiros testes desta implementação chegaram a deixar 5 projetos órfãos
// no Drive por criar um novo a cada tentativa.

use crate::*;

use serde::{Deserialize, Serialize};

const BASE_APPS_SCRIPT_API: &str = "https://script.googleapis.com/v1";

#[derive(Serialize)]
struct CriarProjetoRequest {
    title: String,
}

#[derive(Deserialize)]
struct CriarProjetoResponse {
    #[serde(rename = "scriptId")]
    script_id: String,
}

#[derive(Serialize)]
struct ArquivoConteudo {
    name: String,
    #[serde(rename = "type")]
    tipo: String,
    source: String,
}

#[derive(Serialize)]
struct ConteudoProjeto {
    files: Vec<ArquivoConteudo>,
}

#[derive(Serialize)]
struct CriarVersaoRequest {
    description: String,
}

#[derive(Deserialize)]
struct CriarVersaoResponse {
    #[serde(rename = "versionNumber")]
    version_number: i64,
}

#[derive(Serialize)]
struct DeploymentConfig {
    #[serde(rename = "versionNumber")]
    version_number: i64,
    #[serde(rename = "manifestFileName")]
    manifest_file_name: String,
    description: String,
}

#[derive(Serialize)]
struct CriarDeploymentRequest {
    #[serde(rename = "deploymentConfig")]
    deployment_config: DeploymentConfig,
}

#[derive(Deserialize)]
struct DeploymentResponse {
    #[serde(rename = "deploymentId", default)]
    deployment_id: String,
    #[serde(rename = "entryPoints", default)]
    entry_points: Vec<EntryPoint>,
}

#[derive(Deserialize)]
struct EntryPoint {
    #[serde(rename = "webApp")]
    web_app: Option<WebAppEntry>,
}

#[derive(Deserialize)]
struct WebAppEntry {
    url: String,
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
    if status.as_u16() == 403 {
        return Err(format!(
            "{contexto}: acesso negado (403). Se a mensagem mencionar a Apps Script API, \
            confirme que ela está ativada em https://script.google.com/home/usersettings \
            (interruptor pessoal, separado do Google Cloud Console) e tente novamente. \
            Se persistir, pode ser uma política do domínio/administrador do Workspace — \
            use o fluxo manual (\"Copiar script\") como alternativa. Detalhe: {texto}"
        ));
    }
    Err(format!("{contexto}: erro {status}. Detalhe: {texto}"))
}

fn criar_projeto(
    client: &reqwest::blocking::Client,
    access_token: &str,
    titulo: &str,
) -> Result<String, String> {
    let resposta = client
        .post(format!("{BASE_APPS_SCRIPT_API}/projects"))
        .bearer_auth(access_token)
        .json(&CriarProjetoRequest {
            title: titulo.to_string(),
        })
        .send()
        .map_err(|err| format!("Erro ao criar o projeto Apps Script: {err}"))?;
    let resposta = tratar_resposta_erro(resposta, "Erro ao criar o projeto Apps Script")?;
    let corpo: CriarProjetoResponse = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar a resposta de criação do projeto: {err}"))?;
    Ok(corpo.script_id)
}

fn subir_conteudo(
    client: &reqwest::blocking::Client,
    access_token: &str,
    script_id: &str,
    arquivos: Vec<(&str, &str, String)>,
) -> Result<(), String> {
    let conteudo = ConteudoProjeto {
        files: arquivos
            .into_iter()
            .map(|(name, tipo, source)| ArquivoConteudo {
                name: name.to_string(),
                tipo: tipo.to_string(),
                source,
            })
            .collect(),
    };
    let resposta = client
        .put(format!("{BASE_APPS_SCRIPT_API}/projects/{script_id}/content"))
        .bearer_auth(access_token)
        .json(&conteudo)
        .send()
        .map_err(|err| format!("Erro ao enviar o conteúdo do Web App: {err}"))?;
    tratar_resposta_erro(resposta, "Erro ao enviar o conteúdo do Web App")?;
    Ok(())
}

fn criar_versao(
    client: &reqwest::blocking::Client,
    access_token: &str,
    script_id: &str,
) -> Result<i64, String> {
    let resposta = client
        .post(format!("{BASE_APPS_SCRIPT_API}/projects/{script_id}/versions"))
        .bearer_auth(access_token)
        .json(&CriarVersaoRequest {
            description: "Atualização automática — CoordenacaoOP".to_string(),
        })
        .send()
        .map_err(|err| format!("Erro ao criar a versão do Web App: {err}"))?;
    let resposta = tratar_resposta_erro(resposta, "Erro ao criar a versão do Web App")?;
    let corpo: CriarVersaoResponse = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar a resposta de versão: {err}"))?;
    Ok(corpo.version_number)
}

fn extrair_url_webapp(resposta: DeploymentResponse) -> Result<(String, String), String> {
    let url = resposta
        .entry_points
        .into_iter()
        .find_map(|entrada| entrada.web_app)
        .map(|web_app| web_app.url)
        .ok_or_else(|| "A implantação não retornou uma URL de Web App.".to_string())?;
    Ok((resposta.deployment_id, url))
}

/// Cria uma implantação NOVA (primeira vez) — usada só quando não há
/// `apps_script_deployment_id` salvo ainda.
fn criar_deployment(
    client: &reqwest::blocking::Client,
    access_token: &str,
    script_id: &str,
    version_number: i64,
) -> Result<(String, String), String> {
    let resposta = client
        .post(format!("{BASE_APPS_SCRIPT_API}/projects/{script_id}/deployments"))
        .bearer_auth(access_token)
        .json(&serde_json::json!({
            "versionNumber": version_number,
            "manifestFileName": "appsscript",
            "description": "Implantação automática — CoordenacaoOP",
        }))
        .send()
        .map_err(|err| format!("Erro ao implantar o Web App: {err}"))?;
    let resposta = tratar_resposta_erro(resposta, "Erro ao implantar o Web App")?;
    let corpo: DeploymentResponse = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar a resposta de implantação: {err}"))?;
    extrair_url_webapp(corpo)
}

/// Atualiza uma implantação EXISTENTE para apontar para a nova versão,
/// mantendo a mesma URL pública (o professor não precisa de um link novo a
/// cada vez que o coordenador republica).
fn atualizar_deployment(
    client: &reqwest::blocking::Client,
    access_token: &str,
    script_id: &str,
    deployment_id: &str,
    version_number: i64,
) -> Result<(String, String), String> {
    let resposta = client
        .put(format!(
            "{BASE_APPS_SCRIPT_API}/projects/{script_id}/deployments/{deployment_id}"
        ))
        .bearer_auth(access_token)
        .json(&CriarDeploymentRequest {
            deployment_config: DeploymentConfig {
                version_number,
                manifest_file_name: "appsscript".to_string(),
                description: "Atualização automática — CoordenacaoOP".to_string(),
            },
        })
        .send()
        .map_err(|err| format!("Erro ao atualizar a implantação do Web App: {err}"))?;
    let resposta = tratar_resposta_erro(resposta, "Erro ao atualizar a implantação do Web App")?;
    let corpo: DeploymentResponse = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar a resposta de atualização: {err}"))?;
    extrair_url_webapp(corpo)
}

/// Cria (ou atualiza) o Web App de Planejamento e a planilha de respostas,
/// autenticando o coordenador via OAuth (abre o navegador quando
/// necessário). Reaproveita planilha/projeto/implantação já existentes na
/// config em vez de criar recursos novos a cada chamada.
fn provisionar_planejamento_via_oauth(
    config: ConfigPlanejamento,
) -> Result<ProvisionamentoPlanejamentoResultado, String> {
    let access_token = obter_access_token()?;
    let client = reqwest::blocking::Client::new();

    let planilha_id = if config.planilha_automatica_id.trim().is_empty() {
        sheets_api::criar_planilha_respostas(
            &access_token,
            "Planejamento — Respostas (CoordenacaoOP)",
            sheets_api::ABA_RESPOSTAS,
            &sheets_api::CABECALHO_RESPOSTAS,
        )?
    } else {
        config.planilha_automatica_id.trim().to_string()
    };

    let script_id = if config.apps_script_projeto_id.trim().is_empty() {
        criar_projeto(&client, &access_token, "Planejamento — CoordenacaoOP")?
    } else {
        config.apps_script_projeto_id.trim().to_string()
    };

    let token_leitura = if config.token_leitura.trim().is_empty() {
        google_oauth::gerar_bytes_aleatorios_base64url(32)
    } else {
        config.token_leitura.trim().to_string()
    };

    let code_gs = CODE_GS
        .replace("__PLANILHA_ID__", &planilha_id)
        .replace("__TOKEN_LEITURA__", &token_leitura);
    let dados_reais_gs = construir_dados_reais_gs()?;
    let componentes_extras_gs = construir_componentes_extras_gs(&config)?;

    subir_conteudo(
        &client,
        &access_token,
        &script_id,
        vec![
            ("Code", "SERVER_JS", code_gs),
            ("DadosMedio", "SERVER_JS", DADOS_MEDIO_GS.to_string()),
            ("DadosAnosFinais", "SERVER_JS", DADOS_ANOS_FINAIS_GS.to_string()),
            ("DadosReais", "SERVER_JS", dados_reais_gs),
            ("ComponentesExtras", "SERVER_JS", componentes_extras_gs),
            ("Index", "HTML", INDEX_HTML.to_string()),
            ("appsscript", "JSON", APPSSCRIPT_JSON.to_string()),
        ],
    )?;

    let version_number = criar_versao(&client, &access_token, &script_id)?;

    let (deployment_id, webapp_url) = if config.apps_script_deployment_id.trim().is_empty() {
        criar_deployment(&client, &access_token, &script_id, version_number)?
    } else {
        atualizar_deployment(
            &client,
            &access_token,
            &script_id,
            config.apps_script_deployment_id.trim(),
            version_number,
        )?
    };

    Ok(ProvisionamentoPlanejamentoResultado {
        webapp_url,
        planilha_url: format!("https://docs.google.com/spreadsheets/d/{planilha_id}/edit"),
        planilha_id,
        apps_script_projeto_id: script_id,
        apps_script_deployment_id: deployment_id,
        token_leitura,
    })
}

#[tauri::command(async)]
pub(crate) fn provisionar_planejamento_automatico(
    config: ConfigPlanejamento,
) -> Result<ProvisionamentoPlanejamentoResultado, String> {
    // Roda numa thread OS dedicada, fora do runtime async do Tauri: o fluxo
    // usa reqwest::blocking (que cria seu próprio runtime interno) e um
    // TcpListener bloqueante aguardando o navegador — nenhum dos dois é
    // seguro dentro de um contexto assíncrono (mesmo motivo documentado em
    // shell::enviar_notificacao para o notify-rust).
    std::thread::spawn(move || provisionar_planejamento_via_oauth(config))
        .join()
        .map_err(|_| "Falha interna ao provisionar o Web App de Planejamento.".to_string())?
}

/// Cria (ou atualiza) o Web App do PEI e a planilha de respostas — mesma
/// orquestração de provisionar_planejamento_via_oauth, reaproveitando as
/// mesmas funções HTTP genéricas acima. Sem "componentes extras" nem
/// segmentação Médio/Anos Finais: o PEI usa uma única lista fixa de
/// componentes e uma cascata Turma → Aluno elegível → Componente → Bimestre.
fn provisionar_pei_via_oauth(config: ConfigPei) -> Result<ProvisionamentoPeiResultado, String> {
    let access_token = obter_access_token()?;
    let client = reqwest::blocking::Client::new();

    let planilha_id = if config.planilha_automatica_id.trim().is_empty() {
        sheets_api::criar_planilha_respostas(
            &access_token,
            "PEI — Respostas (CoordenacaoOP)",
            sheets_api::ABA_RESPOSTAS,
            &CABECALHO_RESPOSTAS_PEI,
        )?
    } else {
        config.planilha_automatica_id.trim().to_string()
    };

    let script_id = if config.apps_script_projeto_id.trim().is_empty() {
        criar_projeto(&client, &access_token, "PEI — CoordenacaoOP")?
    } else {
        config.apps_script_projeto_id.trim().to_string()
    };

    let token_leitura = if config.token_leitura.trim().is_empty() {
        google_oauth::gerar_bytes_aleatorios_base64url(32)
    } else {
        config.token_leitura.trim().to_string()
    };

    let code_gs = CODE_GS_PEI
        .replace("__PLANILHA_ID__", &planilha_id)
        .replace("__TOKEN_LEITURA__", &token_leitura);
    let dados_pei_gs = construir_dados_pei_gs()?;

    subir_conteudo(
        &client,
        &access_token,
        &script_id,
        vec![
            ("Code", "SERVER_JS", code_gs),
            ("DadosPeiReais", "SERVER_JS", dados_pei_gs),
            ("Index", "HTML", INDEX_HTML_PEI.to_string()),
            ("appsscript", "JSON", APPSSCRIPT_JSON.to_string()),
        ],
    )?;

    let version_number = criar_versao(&client, &access_token, &script_id)?;

    let (deployment_id, webapp_url) = if config.apps_script_deployment_id.trim().is_empty() {
        criar_deployment(&client, &access_token, &script_id, version_number)?
    } else {
        atualizar_deployment(
            &client,
            &access_token,
            &script_id,
            config.apps_script_deployment_id.trim(),
            version_number,
        )?
    };

    Ok(ProvisionamentoPeiResultado {
        webapp_url,
        planilha_url: format!("https://docs.google.com/spreadsheets/d/{planilha_id}/edit"),
        planilha_id,
        apps_script_projeto_id: script_id,
        apps_script_deployment_id: deployment_id,
        token_leitura,
    })
}

#[tauri::command(async)]
pub(crate) fn provisionar_pei_automatico(config: ConfigPei) -> Result<ProvisionamentoPeiResultado, String> {
    std::thread::spawn(move || provisionar_pei_via_oauth(config))
        .join()
        .map_err(|_| "Falha interna ao provisionar o Web App do PEI.".to_string())?
}
