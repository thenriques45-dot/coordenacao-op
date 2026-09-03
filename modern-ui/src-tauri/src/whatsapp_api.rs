// Envio automático de mensagens pela API oficial do WhatsApp (Meta Cloud API).
//
// As credenciais (Phone Number ID, WABA ID, token permanente) ficam SÓ nesta
// máquina, em `config/whatsapp_api.json` — a sincronização de grupo só toca
// `dados/persistidos/`, nunca `config/`. Cada escola que quiser usar o envio
// automático configura o próprio número; o token é sensível e não deve
// circular pelo OneDrive do grupo.
//
// Sem isso configurado, a tela de Atendimentos esconde os controles pagos e
// mostra só o link "Ativar envio automático", que abre esta seção em
// Configurações → Sistema. A fila assistida (wa.me) funciona sem nada disso.

use crate::*;

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const GRAPH_BASE: &str = "https://graph.facebook.com/v21.0";
const LIMITE_DIA_PADRAO: u32 = 250;

static ARQUIVO_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default, Deserialize, Serialize)]
struct WhatsappApiArquivo {
    #[serde(default)]
    phone_number_id: String,
    #[serde(default)]
    waba_id: String,
    #[serde(default)]
    token: String,
    #[serde(default)]
    ativo: bool,
    #[serde(default)]
    token_invalido: bool,
    #[serde(default)]
    numero_formatado: String,
    #[serde(default)]
    limite_dia: u32,
    // "YYYY-MM-DD" -> quantas mensagens já saíram nesse dia.
    #[serde(default)]
    uso: BTreeMap<String, u32>,
}

impl WhatsappApiArquivo {
    fn configurada(&self) -> bool {
        !self.phone_number_id.trim().is_empty()
            && !self.token.trim().is_empty()
    }

    fn limite(&self) -> u32 {
        if self.limite_dia == 0 { LIMITE_DIA_PADRAO } else { self.limite_dia }
    }

    fn uso_hoje(&self) -> u32 {
        self.uso.get(&hoje()).copied().unwrap_or(0)
    }

    fn status(&self) -> &'static str {
        if !self.configurada() {
            "desligado"
        } else if self.token_invalido {
            "token_invalido"
        } else if self.ativo {
            "ativo"
        } else {
            "desligado"
        }
    }
}

#[derive(Serialize)]
pub(crate) struct WhatsappApiStatus {
    configurada: bool,
    ativo: bool,
    status: String,
    phone_number_id: String,
    waba_id: String,
    tem_token: bool,
    numero_formatado: String,
    limite_dia: u32,
    uso_hoje: u32,
}

impl From<&WhatsappApiArquivo> for WhatsappApiStatus {
    fn from(a: &WhatsappApiArquivo) -> Self {
        WhatsappApiStatus {
            configurada: a.configurada(),
            ativo: a.ativo && !a.token_invalido,
            status: a.status().to_string(),
            phone_number_id: a.phone_number_id.clone(),
            waba_id: a.waba_id.clone(),
            tem_token: !a.token.trim().is_empty(),
            numero_formatado: a.numero_formatado.clone(),
            limite_dia: a.limite(),
            uso_hoje: a.uso_hoje(),
        }
    }
}

fn hoje() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn caminho_arquivo() -> Result<PathBuf, String> {
    let pasta = config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    Ok(pasta.join("whatsapp_api.json"))
}

fn ler() -> WhatsappApiArquivo {
    let Ok(caminho) = caminho_arquivo() else { return WhatsappApiArquivo::default(); };
    fs::read_to_string(&caminho)
        .ok()
        .and_then(|texto| serde_json::from_str(&texto).ok())
        .unwrap_or_default()
}

fn gravar(arquivo: &WhatsappApiArquivo) -> Result<(), String> {
    let caminho = caminho_arquivo()?;
    let texto = serde_json::to_string_pretty(arquivo).map_err(|e| e.to_string())?;
    escrever_json_atomicamente(&caminho, &texto).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn carregar_config_whatsapp_api() -> Result<WhatsappApiStatus, String> {
    let _guard = ARQUIVO_LOCK.lock().unwrap();
    Ok((&ler()).into())
}

#[derive(Deserialize)]
pub(crate) struct WhatsappApiInput {
    pub(crate) phone_number_id: String,
    pub(crate) waba_id: String,
    pub(crate) token: String,
}

#[tauri::command]
pub(crate) fn salvar_config_whatsapp_api(input: WhatsappApiInput) -> Result<WhatsappApiStatus, String> {
    let _guard = ARQUIVO_LOCK.lock().unwrap();
    let phone_number_id = input.phone_number_id.trim().to_string();
    let token = input.token.trim().to_string();
    if phone_number_id.is_empty() || token.is_empty() {
        return Err("Informe o Phone Number ID e o token permanente.".to_string());
    }
    let mut atual = ler();
    atual.phone_number_id = phone_number_id;
    atual.waba_id = input.waba_id.trim().to_string();
    atual.token = token;
    atual.ativo = true;
    atual.token_invalido = false;
    if atual.limite_dia == 0 {
        atual.limite_dia = LIMITE_DIA_PADRAO;
    }
    gravar(&atual)?;
    Ok((&atual).into())
}

#[tauri::command]
pub(crate) fn desativar_whatsapp_api() -> Result<WhatsappApiStatus, String> {
    let _guard = ARQUIVO_LOCK.lock().unwrap();
    let mut atual = ler();
    atual.ativo = false;
    gravar(&atual)?;
    Ok((&atual).into())
}

/// GET no Phone Number ID para validar o token e trazer o número formatado.
/// Sucesso grava o número e limpa a marca de token inválido.
#[tauri::command(async)]
pub(crate) fn testar_conexao_whatsapp_api() -> Result<String, String> {
    let (phone_number_id, token) = {
        let _guard = ARQUIVO_LOCK.lock().unwrap();
        let a = ler();
        if !a.configurada() {
            return Err("Configure o Phone Number ID e o token antes de testar.".to_string());
        }
        (a.phone_number_id.clone(), a.token.clone())
    };

    let client = reqwest::blocking::Client::new();
    let resposta = client
        .get(format!("{GRAPH_BASE}/{phone_number_id}"))
        .query(&[("fields", "display_phone_number,verified_name")])
        .bearer_auth(&token)
        .send()
        .map_err(|e| format!("Falha de rede ao contatar a Meta: {e}"))?;

    let status = resposta.status();
    let corpo: serde_json::Value = resposta.json().unwrap_or_default();

    if status.is_success() {
        let numero = corpo
            .get("display_phone_number")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string();
        let nome = corpo
            .get("verified_name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");
        let formatado = if nome.is_empty() {
            numero.clone()
        } else {
            format!("{numero} · {nome}")
        };
        let _guard = ARQUIVO_LOCK.lock().unwrap();
        let mut atual = ler();
        atual.numero_formatado = formatado.clone();
        atual.token_invalido = false;
        gravar(&atual)?;
        return Ok(formatado);
    }

    if status.as_u16() == 401 || codigo_meta(&corpo) == Some(190) {
        let _guard = ARQUIVO_LOCK.lock().unwrap();
        let mut atual = ler();
        atual.token_invalido = true;
        atual.ativo = false;
        gravar(&atual)?;
        return Err("Token inválido ou expirado. Gere um novo token permanente na Meta.".to_string());
    }

    Err(mensagem_erro_meta(&corpo).unwrap_or_else(|| format!("A Meta respondeu {status}.")))
}

fn codigo_meta(corpo: &serde_json::Value) -> Option<i64> {
    corpo.get("error")?.get("code")?.as_i64()
}

fn mensagem_erro_meta(corpo: &serde_json::Value) -> Option<String> {
    let erro = corpo.get("error")?;
    let msg = erro.get("message").and_then(serde_json::Value::as_str)?;
    match erro.get("code").and_then(serde_json::Value::as_i64) {
        Some(code) => Some(format!("Erro {code} · {msg}")),
        None => Some(msg.to_string()),
    }
}

#[derive(Deserialize)]
pub(crate) struct EnvioApiInput {
    /// Número do destinatário só com dígitos, com DDI (ex.: 5511998887777).
    pub(crate) telefone: String,
    /// Nome do template aprovado na Meta.
    pub(crate) template: String,
    #[serde(default = "idioma_padrao")]
    pub(crate) idioma: String,
    /// Parâmetros do corpo do template, na ordem ({{1}}, {{2}}…).
    #[serde(default)]
    pub(crate) parametros: Vec<String>,
}

fn idioma_padrao() -> String {
    "pt_BR".to_string()
}

#[derive(Serialize)]
pub(crate) struct EnvioApiResultado {
    pub(crate) id_meta: String,
    pub(crate) uso_hoje: u32,
    pub(crate) limite_dia: u32,
}

/// Dispara uma mensagem de template pela Cloud API. Erros voltam como string
/// em linguagem natural + código da Meta quando houver. Usado pelo lote da
/// aba "Disparos em lote" (fase posterior).
#[tauri::command(async)]
pub(crate) fn enviar_mensagem_whatsapp_api(input: EnvioApiInput) -> Result<EnvioApiResultado, String> {
    let (phone_number_id, token, limite) = {
        let _guard = ARQUIVO_LOCK.lock().unwrap();
        let a = ler();
        if !a.configurada() || !a.ativo || a.token_invalido {
            return Err("O envio automático não está ativo nesta máquina.".to_string());
        }
        if a.uso_hoje() >= a.limite() {
            return Err(format!("Limite diário de {} mensagens já atingido neste número.", a.limite()));
        }
        (a.phone_number_id.clone(), a.token.clone(), a.limite())
    };

    let corpo_json = serde_json::json!({
        "messaging_product": "whatsapp",
        "to": input.telefone.chars().filter(|c| c.is_ascii_digit()).collect::<String>(),
        "type": "template",
        "template": {
            "name": input.template,
            "language": { "code": input.idioma },
            "components": if input.parametros.is_empty() {
                serde_json::json!([])
            } else {
                serde_json::json!([{
                    "type": "body",
                    "parameters": input.parametros.iter()
                        .map(|p| serde_json::json!({ "type": "text", "text": p }))
                        .collect::<Vec<_>>()
                }])
            }
        }
    });

    let client = reqwest::blocking::Client::new();
    let resposta = client
        .post(format!("{GRAPH_BASE}/{phone_number_id}/messages"))
        .bearer_auth(&token)
        .json(&corpo_json)
        .send()
        .map_err(|e| format!("Falha de rede: {e}"))?;

    let status = resposta.status();
    let corpo: serde_json::Value = resposta.json().unwrap_or_default();

    if status.is_success() {
        let id_meta = corpo
            .get("messages")
            .and_then(serde_json::Value::as_array)
            .and_then(|m| m.first())
            .and_then(|m| m.get("id"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string();
        let _guard = ARQUIVO_LOCK.lock().unwrap();
        let mut atual = ler();
        let dia = hoje();
        *atual.uso.entry(dia).or_insert(0) += 1;
        let uso_hoje = atual.uso_hoje();
        gravar(&atual)?;
        return Ok(EnvioApiResultado { id_meta, uso_hoje, limite_dia: limite });
    }

    if status.as_u16() == 401 || codigo_meta(&corpo) == Some(190) {
        let _guard = ARQUIVO_LOCK.lock().unwrap();
        let mut atual = ler();
        atual.token_invalido = true;
        atual.ativo = false;
        gravar(&atual)?;
    }

    Err(mensagem_erro_meta(&corpo).unwrap_or_else(|| format!("A Meta respondeu {status}.")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_reflete_os_tres_estados_da_secao() {
        let vazio = WhatsappApiArquivo::default();
        assert_eq!(vazio.status(), "desligado");
        assert!(!vazio.configurada());

        let mut ok = WhatsappApiArquivo {
            phone_number_id: "123".into(),
            token: "t".into(),
            ativo: true,
            ..Default::default()
        };
        assert_eq!(ok.status(), "ativo");

        ok.token_invalido = true;
        assert_eq!(ok.status(), "token_invalido", "token invalido vence o ativo");

        ok.token_invalido = false;
        ok.ativo = false;
        assert_eq!(ok.status(), "desligado", "configurada mas nao ativa");
    }

    #[test]
    fn limite_diario_cai_no_padrao_de_250() {
        let a = WhatsappApiArquivo { limite_dia: 0, ..Default::default() };
        assert_eq!(a.limite(), 250);
        let b = WhatsappApiArquivo { limite_dia: 100, ..Default::default() };
        assert_eq!(b.limite(), 100);
    }

    #[test]
    fn mensagem_erro_meta_inclui_codigo_quando_ha() {
        let corpo = serde_json::json!({ "error": { "message": "limite de marketing", "code": 131049 } });
        assert_eq!(mensagem_erro_meta(&corpo).as_deref(), Some("Erro 131049 · limite de marketing"));
        assert_eq!(codigo_meta(&corpo), Some(131049));
    }
}
