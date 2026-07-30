#![allow(unused_imports)]

// OAuth do Google (Authorization Code + PKCE, redirect loopback) para o
// coordenador autorizar o app a agir em nome da própria conta Google — sem
// nenhum servidor central: a troca de token acontece direto entre este app e
// o Google. Extraído como módulo próprio; ver apps_script_api.rs para o
// consumo (criação/implantação do Web App de Planejamento).
//
// Fluxo (recomendado pelo Google para apps desktop/nativos, substituto do
// antigo fluxo "oob" descontinuado): abre o navegador padrão numa tela de
// consentimento do Google; um servidor HTTP local mínimo (TcpListener cru,
// sem dependências novas) captura o redirect com o código de autorização;
// o código é trocado por um access_token (curta duração) e um refresh_token
// (guardado no cofre de credenciais do sistema operacional via `keyring`,
// nunca em texto puro, pois dá acesso contínuo à conta do coordenador).

use crate::*;

use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    io,
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    time::{Duration, Instant},
};

pub(crate) const ESCOPOS_GOOGLE: &str =
    "https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/script.deployments https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/script.send_mail";
const URL_AUTORIZACAO: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_TOKEN: &str = "https://oauth2.googleapis.com/token";
const TIMEOUT_AUTORIZACAO: Duration = Duration::from_secs(120);
const KEYRING_SERVICE: &str = "coordenacaoop-google-oauth";
const KEYRING_CONTA: &str = "refresh_token";

// Client OAuth "Aplicativo para computador" compartilhado por todos os
// usuários do CoordenacaoOP (projeto Google Cloud "coordenacaoop-planejamento").
// O client_secret de um app instalado/nativo não é tratado como confidencial
// pelo próprio Google — não há como mantê-lo em segredo num binário
// distribuído, e a documentação oficial do Google já parte desse
// pressuposto. A segurança do fluxo vem do PKCE (abaixo) e do redirect
// restrito a loopback (127.0.0.1), não do sigilo destes valores: cada
// coordenador autoriza com a própria conta Google, e o client_id só
// identifica "esta requisição vem do CoordenacaoOP" — não concede acesso
// aos dados de ninguém além de quem loga.
//
// Enquanto a tela de permissão OAuth deste projeto não passar pela
// verificação do Google, há um teto de ~100 usuários únicos autorizando ao
// longo do tempo (os escopos de Apps Script contam como sensíveis). Vale a
// pena reavaliar isso caso o uso cresça além de um punhado de escolas.
const GOOGLE_OAUTH_CLIENT_ID: &str =
    "573335387735-m2qo6ctt5e7ave75mo07m26ict0vo8d5.apps.googleusercontent.com";
const GOOGLE_OAUTH_CLIENT_SECRET: &str = "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";

// ── PKCE ──────────────────────────────────────────────────────────────────

fn gerar_bytes_aleatorios_base64url(quantidade: usize) -> String {
    let mut bytes = vec![0u8; quantidade];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn gerar_code_verifier() -> String {
    gerar_bytes_aleatorios_base64url(64)
}

fn gerar_code_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}

// ── Servidor loopback (captura o redirect numa única requisição) ──────────

struct CallbackOAuth {
    code: String,
    state: String,
}

fn iniciar_listener_loopback() -> io::Result<(TcpListener, u16)> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let porta = listener.local_addr()?.port();
    Ok((listener, porta))
}

fn aguardar_callback_oauth(listener: TcpListener, timeout: Duration) -> Result<CallbackOAuth, String> {
    listener
        .set_nonblocking(true)
        .map_err(|err| format!("Erro ao preparar o servidor local de callback: {err}"))?;
    let inicio = Instant::now();
    loop {
        match listener.accept() {
            Ok((stream, _endereco)) => return processar_requisicao_callback(stream),
            Err(ref err) if err.kind() == io::ErrorKind::WouldBlock => {
                if inicio.elapsed() > timeout {
                    return Err(
                        "Tempo esgotado aguardando a autorização no navegador. Tente novamente."
                            .to_string(),
                    );
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(err) => return Err(format!("Erro no servidor local de callback: {err}")),
        }
    }
}

fn processar_requisicao_callback(mut stream: TcpStream) -> Result<CallbackOAuth, String> {
    let primeira_linha = {
        let mut reader = BufReader::new(&stream);
        let mut linha = String::new();
        reader
            .read_line(&mut linha)
            .map_err(|err| format!("Erro ao ler o callback de autorização: {err}"))?;
        linha
    };

    let caminho = primeira_linha
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "Requisição de callback malformada.".to_string())?
        .to_string();

    let corpo_html = "<html><body><p style=\"font-family: sans-serif\">\
        Autorização concluída. Pode fechar esta aba e voltar ao CoordenacaoOP.\
        </p></body></html>";
    let resposta = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        corpo_html.len(),
        corpo_html
    );
    let _ = stream.write_all(resposta.as_bytes());
    let _ = stream.flush();

    extrair_parametros_callback(&caminho)
}

fn extrair_parametros_callback(caminho: &str) -> Result<CallbackOAuth, String> {
    let completo = format!("http://127.0.0.1{caminho}");
    let url = url::Url::parse(&completo)
        .map_err(|err| format!("Erro ao interpretar o retorno do Google: {err}"))?;

    let mut code = None;
    let mut state = None;
    let mut erro = None;
    for (chave, valor) in url.query_pairs() {
        match chave.as_ref() {
            "code" => code = Some(valor.into_owned()),
            "state" => state = Some(valor.into_owned()),
            "error" => erro = Some(valor.into_owned()),
            _ => {}
        }
    }

    if let Some(erro) = erro {
        return Err(format!("Autorização negada ou cancelada no Google: {erro}"));
    }
    let code = code.ok_or_else(|| "Retorno do Google sem código de autorização.".to_string())?;
    let state = state.unwrap_or_default();
    Ok(CallbackOAuth { code, state })
}

// ── Troca/renovação de token ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
}

fn trocar_code_por_token(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::blocking::Client::new();
    let params = [
        ("code", code),
        ("client_id", GOOGLE_OAUTH_CLIENT_ID),
        ("client_secret", GOOGLE_OAUTH_CLIENT_SECRET),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", code_verifier),
    ];
    let resposta = client
        .post(URL_TOKEN)
        .form(&params)
        .send()
        .map_err(|err| format!("Erro ao trocar o código por um token: {err}"))?;
    if !resposta.status().is_success() {
        let texto = resposta.text().unwrap_or_default();
        return Err(format!("O Google recusou a troca de token: {texto}"));
    }
    resposta
        .json::<TokenResponse>()
        .map_err(|err| format!("Erro ao interpretar a resposta de token: {err}"))
}

fn renovar_access_token(refresh_token: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let params = [
        ("refresh_token", refresh_token),
        ("client_id", GOOGLE_OAUTH_CLIENT_ID),
        ("client_secret", GOOGLE_OAUTH_CLIENT_SECRET),
        ("grant_type", "refresh_token"),
    ];
    let resposta = client
        .post(URL_TOKEN)
        .form(&params)
        .send()
        .map_err(|err| format!("Erro ao renovar o token: {err}"))?;
    if !resposta.status().is_success() {
        return Err("Token de acesso contínuo expirado ou revogado.".to_string());
    }
    let token: TokenResponse = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar a resposta de renovação: {err}"))?;
    Ok(token.access_token)
}

fn entrada_keyring() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_CONTA)
        .map_err(|err| format!("Erro ao acessar o armazenamento seguro de credenciais: {err}"))
}

fn salvar_refresh_token(token: &str) -> Result<(), String> {
    entrada_keyring()?
        .set_password(token)
        .map_err(|err| format!("Erro ao salvar o token de acesso contínuo: {err}"))
}

fn carregar_refresh_token() -> Option<String> {
    entrada_keyring().ok()?.get_password().ok()
}

// ── Fluxo interativo completo (abre navegador, aguarda callback) ──────────

fn autorizar_interativamente() -> Result<String, String> {
    let (listener, porta) = iniciar_listener_loopback().map_err(|err| err.to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{porta}/callback");

    let code_verifier = gerar_code_verifier();
    let code_challenge = gerar_code_challenge(&code_verifier);
    let state = gerar_bytes_aleatorios_base64url(16);

    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    serializer
        .append_pair("client_id", GOOGLE_OAUTH_CLIENT_ID)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", ESCOPOS_GOOGLE)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &state);
    let url_autorizacao = format!("{URL_AUTORIZACAO}?{}", serializer.finish());

    abrir_url(url_autorizacao).map_err(|err| format!("Não foi possível abrir o navegador: {err}"))?;

    let callback = aguardar_callback_oauth(listener, TIMEOUT_AUTORIZACAO)?;
    if callback.state != state {
        return Err("Estado de segurança (state) não confere; autorização abortada.".to_string());
    }

    let token = trocar_code_por_token(&callback.code, &code_verifier, &redirect_uri)?;
    if let Some(refresh) = &token.refresh_token {
        salvar_refresh_token(refresh)?;
    }
    Ok(token.access_token)
}

/// Ponto de entrada único usado por `apps_script_api.rs`: tenta renovar
/// silenciosamente um token já autorizado antes; só abre o navegador se não
/// houver um refresh_token salvo ou se ele já não for mais válido.
pub(crate) fn obter_access_token() -> Result<String, String> {
    if let Some(refresh_token) = carregar_refresh_token() {
        if let Ok(token) = renovar_access_token(&refresh_token) {
            return Ok(token);
        }
    }

    autorizar_interativamente()
}
