// OAuth do GitHub via Device Flow — pensado justamente para apps de
// desktop/CLI: ao contrário do fluxo usado em google_oauth.rs (Authorization
// Code + PKCE com redirect loopback), o Device Flow do GitHub não precisa
// de client_secret nem de um servidor local escutando uma porta — o usuário
// só confirma um código de uso único numa aba do navegador. Mesmo espírito
// de segurança do fluxo do Google (token guardado no cofre de credenciais
// do sistema operacional via `keyring`, nunca em texto puro): o client_id
// de um OAuth App do GitHub também não é tratado como confidencial pela
// própria documentação do GitHub para este tipo de fluxo.
//
// Usado hoje só para publicar relatórios no repositório público (ver
// motor_relatorios/publicacao.rs) — o escopo pedido (`public_repo`) só dá
// acesso a repositórios públicos, nunca aos privados do usuário.

use crate::*;

use serde::{Deserialize, Serialize};
use std::time::Duration;

const GITHUB_CLIENT_ID: &str = "Ov23liDST7vWSG72nc0y";
const ESCOPO_GITHUB: &str = "public_repo";
const URL_DEVICE_CODE: &str = "https://github.com/login/device/code";
const URL_TOKEN: &str = "https://github.com/login/oauth/access_token";
const KEYRING_SERVICE: &str = "coordenacaoop-github-oauth";
const KEYRING_CONTA: &str = "access_token";
pub(crate) const USER_AGENT: &str = "CoordenacaoOP-App";

fn cliente() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(6))
        .build()
        .map_err(|err| format!("Erro ao preparar a conexão com o GitHub: {err}"))
}

#[derive(Deserialize)]
struct DispositivoResposta {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(default)]
    verification_uri_complete: Option<String>,
    expires_in: u64,
    interval: u64,
}

fn solicitar_codigo_dispositivo(client: &reqwest::blocking::Client) -> Result<DispositivoResposta, String> {
    let resposta = client
        .post(URL_DEVICE_CODE)
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", ESCOPO_GITHUB)])
        .send()
        .map_err(|err| format!("Erro ao iniciar a autorização com o GitHub: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!("O GitHub recusou iniciar a autorização: {}", resposta.status()));
    }
    resposta
        .json::<DispositivoResposta>()
        .map_err(|err| format!("Erro ao interpretar a resposta do GitHub: {err}"))
}

/// Consulta única ao endpoint de token — não repete sozinha (quem chama
/// decide o intervalo entre tentativas, ver `concluir_login_github`), pra
/// não travar uma chamada de comando Tauri por até 15 minutos.
fn consultar_token_uma_vez(client: &reqwest::blocking::Client, device_code: &str) -> Result<Option<String>, String> {
    let resposta = client
        .post(URL_TOKEN)
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .map_err(|err| format!("Erro ao consultar a autorização com o GitHub: {err}"))?;

    let valor: serde_json::Value = resposta
        .json()
        .map_err(|err| format!("Erro ao interpretar a resposta do GitHub: {err}"))?;

    if let Some(token) = valor.get("access_token").and_then(|v| v.as_str()) {
        return Ok(Some(token.to_string()));
    }
    match valor.get("error").and_then(|v| v.as_str()) {
        Some("authorization_pending") => Ok(None),
        Some("slow_down") => Ok(None),
        Some("expired_token") => Err("O código expirou antes da autorização. Tente novamente.".to_string()),
        Some("access_denied") => Err("Autorização cancelada.".to_string()),
        Some(outro) => Err(format!("O GitHub recusou a autorização: {outro}")),
        None => Err("Resposta inesperada do GitHub ao aguardar autorização.".to_string()),
    }
}

fn entrada_keyring() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_CONTA)
        .map_err(|err| format!("Erro ao acessar o armazenamento seguro de credenciais: {err}"))
}

fn salvar_token(token: &str) -> Result<(), String> {
    entrada_keyring()?.set_password(token).map_err(|err| format!("Erro ao salvar o token do GitHub: {err}"))
}

/// Só o token salvo, sem checar se ele ainda é aceito pelo GitHub — quem
/// chama decide como validar (ver `consultar_usuario_autenticado_com_retentativa`
/// abaixo). Separado de `token_github_valido` justamente pra distinguir
/// "nenhuma sessão salva" (aí sim, precisa logar) de "sessão salva, mas a
/// checagem de rede falhou agora" — duas causas bem diferentes pro usuário,
/// que `token_github_valido` (usado só pro check leve de UI) conflava numa
/// mensagem só de "faça login".
pub(crate) fn carregar_token() -> Option<String> {
    entrada_keyring().ok()?.get_password().ok()
}

#[derive(Deserialize)]
struct UsuarioGithub {
    login: String,
}

/// Confirma que um token ainda é válido e devolve o login associado a ele —
/// usado tanto pra checar uma sessão já salva quanto, depois de um login
/// novo, pra saber se é o mantenedor (relatorios_repositorio/oficiais) ou
/// outra pessoa (Pull Request pra relatorios_repositorio/comunidade).
pub(crate) fn consultar_usuario_autenticado(token: &str) -> Result<String, String> {
    let client = cliente()?;
    let resposta = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|err| format!("Erro ao confirmar identidade no GitHub: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!("O GitHub recusou confirmar a identidade: {}", resposta.status()));
    }
    resposta
        .json::<UsuarioGithub>()
        .map(|u| u.login)
        .map_err(|err| format!("Erro ao interpretar a identidade do GitHub: {err}"))
}

/// Uma consulta de identidade pode falhar por uma rede lenta/instável
/// (comum em rede de escola — o resto do app já lida com isso, ver
/// MENSAGEM_TIMEOUT em repositorio.rs) mesmo com o token perfeitamente
/// válido. Sem essa nova tentativa, um soluço de rede vira um "faça login
/// de novo" enganoso bem no meio de uma publicação — o usuário já tinha
/// logado, a sessão continua boa, só a checagem falhou uma vez.
pub(crate) fn consultar_usuario_autenticado_com_retentativa(token: &str) -> Result<String, String> {
    if let Ok(login) = consultar_usuario_autenticado(token) {
        return Ok(login);
    }
    std::thread::sleep(Duration::from_secs(2));
    consultar_usuario_autenticado(token).map_err(|err| {
        format!(
            "Não foi possível confirmar sua conta do GitHub agora ({err}). Sua sessão continua salva — tente publicar de novo em instantes. Se continuar falhando, a rede pode estar bloqueando o acesso ao GitHub."
        )
    })
}

#[derive(Serialize, Clone)]
pub(crate) struct DispositivoLoginInfo {
    pub(crate) device_code: String,
    pub(crate) user_code: String,
    pub(crate) verification_uri: String,
    pub(crate) interval: u64,
    pub(crate) expires_in: u64,
}

/// Se já existe uma sessão válida (token salvo que o GitHub ainda aceita),
/// devolve o login direto — evita abrir o navegador de novo toda vez que o
/// usuário clica em "Publicar".
///
/// Todo corpo aqui que usa `reqwest::blocking` roda dentro de
/// `com_teto_de_tempo` (uma OS thread de verdade, via `std::thread::spawn`)
/// em vez de direto na função do comando — comandos `#[tauri::command(async)]`
/// rodam como uma tarefa do runtime tokio, e o cliente bloqueante do reqwest
/// cria (e ao sair, derruba) seu próprio mini-runtime interno; fazer isso
/// direto numa tarefa tokio já em andamento derruba o processo com "Cannot
/// drop a runtime in a context where blocking is not allowed". Mesmo motivo
/// pelo qual repositorio.rs já usava essa mesma função pra tudo que fala com
/// o GitHub.
#[tauri::command(async)]
pub(crate) fn verificar_login_github() -> Result<Option<String>, String> {
    com_teto_de_tempo(Duration::from_secs(20), || {
        let Some(token) = carregar_token() else { return Ok(None) };
        Ok(consultar_usuario_autenticado_com_retentativa(&token).ok())
    })
}

/// Primeiro passo do login: pede um código de uso único ao GitHub e já abre
/// o navegador numa página que, na maioria dos casos, vem com o código
/// pré-preenchido (`verification_uri_complete`) — o usuário só confirma.
/// `user_code`/`verification_uri` continuam sendo devolvidos pro frontend
/// mostrar como retaguarda, caso o navegador não abra a página certa.
#[tauri::command(async)]
pub(crate) fn iniciar_login_github() -> Result<DispositivoLoginInfo, String> {
    com_teto_de_tempo(Duration::from_secs(15), || {
        let client = cliente()?;
        let dispositivo = solicitar_codigo_dispositivo(&client)?;

        let url_abrir = dispositivo.verification_uri_complete.clone().unwrap_or_else(|| dispositivo.verification_uri.clone());
        abrir_url(url_abrir).map_err(|err| format!("Não foi possível abrir o navegador: {err}"))?;

        Ok(DispositivoLoginInfo {
            device_code: dispositivo.device_code,
            user_code: dispositivo.user_code,
            verification_uri: dispositivo.verification_uri,
            interval: dispositivo.interval,
            expires_in: dispositivo.expires_in,
        })
    })
}

/// Segundo passo: fica consultando o GitHub no intervalo combinado até o
/// usuário confirmar a autorização no navegador (ou o código expirar).
/// Bloqueia a thread do comando — como todo comando Tauri aqui roda em
/// `async`, isso não trava a interface, só a resposta desta chamada.
#[tauri::command(async)]
pub(crate) fn concluir_login_github(device_code: String, interval: u64, expires_in: u64) -> Result<String, String> {
    // Teto absoluto um pouco maior que `expires_in` — o próprio laço abaixo já
    // desiste sozinho quando o código expira; esta margem é só uma rede de
    // segurança contra uma rede realmente travada, pra `com_teto_de_tempo`
    // nunca devolver antes do laço interno ter a chance de expirar direito.
    let limite_absoluto = Duration::from_secs(expires_in + 30);
    com_teto_de_tempo(limite_absoluto, move || {
        let client = cliente()?;
        let limite = Duration::from_secs(expires_in);
        let intervalo = Duration::from_secs(interval.max(5));
        let inicio = std::time::Instant::now();

        let token = loop {
            if inicio.elapsed() > limite {
                return Err("Tempo esgotado aguardando a autorização no navegador. Tente novamente.".to_string());
            }
            std::thread::sleep(intervalo);
            match consultar_token_uma_vez(&client, &device_code)? {
                Some(token) => break token,
                // "slow_down" já é raro no intervalo inicial que o GitHub manda; sem ajuste dinâmico por ora.
                None => continue,
            }
        };

        salvar_token(&token)?;
        consultar_usuario_autenticado(&token)
    })
}

/// Apaga a sessão salva — pra quem autorizou a conta errada por engano ou
/// quer trocar de usuário do GitHub.
#[tauri::command(async)]
pub(crate) fn esquecer_login_github() -> Result<(), String> {
    match entrada_keyring()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("Erro ao remover a sessão salva do GitHub: {err}")),
    }
}
