#![allow(unused_imports)]

// Assistente de IA (Gemini/Ollama) e verificação de atualização.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use rust_xlsxwriter::{Format, Workbook};
use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs, io,
    hash::{Hash, Hasher},
    io::Cursor,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, MutexGuard, PoisonError},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};


#[tauri::command(async)]
pub(crate) fn verificar_atualizacao() -> Result<AtualizacaoInfo, String> {
    verificar_atualizacao_interno().map_err(|err| err.to_string())
}

pub(crate) fn verificar_atualizacao_interno() -> Result<AtualizacaoInfo, Box<dyn std::error::Error>> {
    let atual = env!("CARGO_PKG_VERSION").to_string();
    let release: GithubRelease = reqwest::blocking::Client::new()
        .get("https://api.github.com/repos/thenriques45-dot/coordenacao-op/releases/latest")
        .header("User-Agent", "CoordenacaoOP")
        .send()?
        .error_for_status()?
        .json()?;
    let disponivel = versao_maior(&release.tag_name, &atual);
    Ok(AtualizacaoInfo {
        versao_atual: atual,
        versao_disponivel: Some(release.tag_name.clone()),
        disponivel,
        url: Some(release.html_url),
        mensagem: if disponivel {
            "Nova versao disponivel.".to_string()
        } else {
            "Voce ja esta usando a versao mais recente.".to_string()
        },
    })
}

#[tauri::command(async)]
pub(crate) fn diagnosticar_ia_local(modelo: Option<String>) -> DiagnosticoIaLocal {
    let modelo = modelo
        .filter(|valor| !valor.trim().is_empty())
        .unwrap_or_else(|| "llama3.2:3b".to_string());
    let ollama_instalado = comando_ollama_disponivel();
    if !ollama_instalado {
        return DiagnosticoIaLocal {
            ollama_instalado,
            servidor_ativo: false,
            modelo_instalado: false,
            modelos: Vec::new(),
            mensagem: "Ollama não encontrado neste computador.".to_string(),
        };
    }

    match modelos_ollama_instalados() {
        Ok(modelos) => {
            let modelo_instalado = modelos.iter().any(|item| item == &modelo);
            DiagnosticoIaLocal {
                ollama_instalado,
                servidor_ativo: true,
                modelo_instalado,
                modelos,
                mensagem: if modelo_instalado {
                    "Assistente local pronto para uso.".to_string()
                } else {
                    format!("Ollama está ativo, mas o modelo {modelo} ainda não foi baixado.")
                },
            }
        }
        Err(err) => DiagnosticoIaLocal {
            ollama_instalado,
            servidor_ativo: false,
            modelo_instalado: false,
            modelos: Vec::new(),
            mensagem: err,
        },
    }
}

#[tauri::command(async)]
pub(crate) fn iniciar_ollama_local() -> Result<DiagnosticoIaLocal, String> {
    if !comando_ollama_disponivel() {
        return Err("Ollama não encontrado neste computador.".to_string());
    }

    if modelos_ollama_instalados().is_err() {
        Command::new("ollama")
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| format!("Não foi possível iniciar o Ollama: {err}"))?;
        std::thread::sleep(std::time::Duration::from_millis(900));
    }

    Ok(diagnosticar_ia_local(Some("llama3.2:3b".to_string())))
}

// Async: "ollama pull" baixa gigabytes e não pode segurar a thread principal.
#[tauri::command(async)]
pub(crate) fn baixar_modelo_ia_local(input: ModeloIaInput) -> Result<DiagnosticoIaLocal, String> {
    let modelo = input.modelo.trim();
    if modelo.is_empty() {
        return Err("Informe o modelo de IA local.".to_string());
    }
    if !comando_ollama_disponivel() {
        return Err("Ollama não encontrado neste computador.".to_string());
    }

    let saida = Command::new("ollama")
        .arg("pull")
        .arg(modelo)
        .output()
        .map_err(|err| format!("Não foi possível executar o download do modelo: {err}"))?;
    if !saida.status.success() {
        let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        return Err(if erro.is_empty() {
            "Não foi possível baixar o modelo. Verifique a conexão da rede.".to_string()
        } else {
            erro
        });
    }

    Ok(diagnosticar_ia_local(Some(modelo.to_string())))
}

// Async: a chamada ao provedor pode levar até 120s e não pode segurar a thread principal.
#[tauri::command(async)]
pub(crate) fn requisicao_ia_json(input: RequisicaoIaJsonInput) -> Result<RequisicaoIaJsonResultado, String> {
    let url = input.url.trim();
    if !url.starts_with("https://") && !url.starts_with("http://127.0.0.1") && !url.starts_with("http://localhost") {
        return Err("Por segurança, informe uma URL HTTPS ou um servidor local de IA.".to_string());
    }

    let cliente = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|err| format!("Não foi possível preparar a conexão com a IA: {err}"))?;
    let mut requisicao = cliente.post(url).json(&input.body);
    for (chave, valor) in input.headers {
        let chave_normalizada = chave.trim().to_ascii_lowercase();
        if chave_normalizada == "content-type" || chave_normalizada == "authorization" || chave_normalizada == "api-key" || chave_normalizada == "http-referer" || chave_normalizada == "x-title" {
            requisicao = requisicao.header(chave, valor);
        }
    }

    let resposta = requisicao
        .send()
        .map_err(|err| format!("Não foi possível conectar ao provedor de IA: {err}"))?;
    let status = resposta.status().as_u16();
    let texto = resposta
        .text()
        .map_err(|err| format!("Não foi possível ler a resposta da IA: {err}"))?;
    let body = serde_json::from_str::<Value>(&texto).unwrap_or(Value::String(texto));
    Ok(RequisicaoIaJsonResultado { status, body })
}

pub(crate) fn comando_ollama_disponivel() -> bool {
    Command::new("ollama")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub(crate) fn modelos_ollama_instalados() -> Result<Vec<String>, String> {
    let resposta = reqwest::blocking::Client::new()
        .get("http://127.0.0.1:11434/api/tags")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .map_err(|_| "Ollama instalado, mas o servidor local não está ativo.".to_string())?
        .error_for_status()
        .map_err(|err| format!("Ollama respondeu com erro: {err}"))?
        .json::<OllamaTagsResponse>()
        .map_err(|err| format!("Não foi possível ler a lista de modelos do Ollama: {err}"))?;
    let mut modelos = resposta
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.name)
        .collect::<Vec<_>>();
    modelos.sort();
    Ok(modelos)
}

pub(crate) fn versao_maior(candidata: &str, atual: &str) -> bool {
    let parse = |texto: &str| {
        texto
            .trim()
            .trim_start_matches('v')
            .split('.')
            // Considera apenas os dígitos iniciais de cada segmento para tolerar
            // sufixos de pré-lançamento (ex.: "11-rc1" vira 11 em vez de 0).
            .map(|parte| {
                parte
                    .trim()
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse::<u64>()
                    .unwrap_or(0)
            })
            .collect::<Vec<_>>()
    };
    let mut a = parse(candidata);
    let mut b = parse(atual);
    while a.len() < 3 {
        a.push(0);
    }
    while b.len() < 3 {
        b.push(0);
    }
    a > b
}
