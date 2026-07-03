#![allow(unused_imports)]

// Integração com o sistema: notificações, abrir URLs/pastas/arquivos e anexos.
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


/// Envia uma notificação nativa do sistema diretamente pelo backend.
///
/// Evita a API web `window.Notification` (instável no WebKitGTK do Linux e no
/// WebView2 do Windows). Também não usa o `.show()` do plugin, que dispara a
/// notificação dentro do runtime async e descarta o erro — no Linux o
/// `zbus::blocking` (usado pelo notify-rust) falha de forma intermitente quando
/// chamado de dentro do Tokio. Aqui rodamos o `show()` numa thread OS dedicada,
/// sem runtime async no caminho, e propagamos o erro real.
#[tauri::command]
pub(crate) fn enviar_notificacao(titulo: String, corpo: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let mut notificacao = notify_rust::Notification::new();
        notificacao.summary(&titulo).body(&corpo);
        // O appname padrão do notify-rust é o nome do binário ("coordenacaoop").
        // Em algumas versões do GNOME esse nome casa com um .desktop quebrado da
        // integração do AppImage e as notificações são silenciosamente descartadas.
        // Usar o nome de exibição evita essa colisão.
        notificacao.appname("CoordenacaoOP");
        #[cfg(target_os = "windows")]
        {
            // AppUserModelID registrado pelo instalador, necessário para o toast.
            notificacao.app_id("br.gov.sp.educacao.coordenacaoop");
        }
        notificacao
            .show()
            .map(|_| ())
            .map_err(|err| err.to_string())
    })
    .join()
    .map_err(|_| "Falha ao executar a thread de notificação.".to_string())?
}

#[tauri::command]
pub(crate) fn abrir_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if !url_esquema_permitido(url) {
        return Err("Link invalido. Apenas enderecos http, https e mailto sao permitidos.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
    let script = format!("Start-Process {}", aspas_powershell(url));
    comando_externo("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .spawn()
        .map_err(|err| format!("Nao foi possivel abrir o link: {err}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        comando_externo("open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o link: {err}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        comando_externo("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o link: {err}"))?;
    }

    Ok(())
}

/// Aceita apenas links de navegação seguros (http, https, mailto), evitando que
/// `Start-Process`/`open`/`xdg-open` sejam usados para executar arquivos locais
/// a partir de conteúdo importado ou sincronizado.
pub(crate) fn url_esquema_permitido(url: &str) -> bool {
    let minusculo = url.to_ascii_lowercase();
    minusculo.starts_with("http://")
        || minusculo.starts_with("https://")
        || minusculo.starts_with("mailto:")
}

#[tauri::command]
pub(crate) fn abrir_pasta(caminho: String) -> Result<(), String> {
    let pasta = PathBuf::from(caminho);
    let alvo = if pasta.is_file() {
        pasta.parent().map(Path::to_path_buf).unwrap_or(pasta)
    } else {
        pasta
    };
    if !alvo.exists() {
        return Err("Pasta nao encontrada.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        comando_externo("explorer")
            .arg(&alvo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir a pasta: {err}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        comando_externo("open")
            .arg(&alvo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir a pasta: {err}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        comando_externo("xdg-open")
            .arg(&alvo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir a pasta: {err}"))?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn preparar_anexo_kanban(caminho: String) -> Result<KanbanAnexoResultado, String> {
    let _dados = travar_dados();
    let origem = PathBuf::from(caminho);
    if !origem.exists() || !origem.is_file() {
        return Err("Arquivo nao encontrado.".to_string());
    }

    let nome = origem
        .file_name()
        .and_then(|valor| valor.to_str())
        .unwrap_or("anexo")
        .to_string();
    let tipo = tipo_mime_por_caminho(&origem);
    let id = format!(
        "anexo-{}-{}",
        Local::now().timestamp_millis(),
        sanitizar_segmento(&nome)
    );

    if tipo.starts_with("image/") {
        let pasta = data_dir()
            .map_err(|err| err.to_string())?
            .join("kanban")
            .join("anexos");
        fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
        let destino = pasta.join(format!("{}_{}", id, sanitizar_segmento(&nome)));
        fs::copy(&origem, &destino)
            .map_err(|err| format!("Nao foi possivel copiar a imagem para os dados do programa: {err}"))?;
        Ok(KanbanAnexoResultado {
            id,
            nome,
            tipo,
            dados: String::new(),
            caminho: Some(destino.to_string_lossy().to_string()),
            origem: "interno".to_string(),
        })
    } else {
        Ok(KanbanAnexoResultado {
            id,
            nome,
            tipo,
            dados: String::new(),
            caminho: Some(origem.to_string_lossy().to_string()),
            origem: "externo".to_string(),
        })
    }
}

#[tauri::command]
pub(crate) fn abrir_anexo_kanban(caminho: String) -> Result<(), String> {
    let arquivo = PathBuf::from(caminho);
    if !arquivo.exists() || !arquivo.is_file() {
        return Err("Arquivo nao encontrado. Ele pode ter sido movido, renomeado ou apagado.".to_string());
    }
    abrir_arquivo(&arquivo)
}

#[tauri::command]
pub(crate) fn preparar_anexo_atendimento(caminho: String) -> Result<KanbanAnexoResultado, String> {
    let _dados = travar_dados();
    let origem = PathBuf::from(&caminho)
        .canonicalize()
        .map_err(|_| "Arquivo nao encontrado.".to_string())?;
    if !origem.is_file() {
        return Err("Arquivo nao encontrado.".to_string());
    }
    let dados_c = data_dir()
        .map_err(|err| err.to_string())?
        .canonicalize()
        .map_err(|err| err.to_string())?;
    if origem.starts_with(&dados_c) {
        return Err("Nao e permitido anexar arquivos internos do aplicativo.".to_string());
    }

    let nome = origem
        .file_name()
        .and_then(|valor| valor.to_str())
        .unwrap_or("anexo")
        .to_string();
    let tipo = tipo_mime_por_caminho(&origem);
    let id = format!(
        "atendimento-anexo-{}-{}",
        Local::now().timestamp_millis(),
        sanitizar_segmento(&nome)
    );
    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join("atendimentos")
        .join("anexos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let destino = pasta.join(format!("{}_{}", id, sanitizar_segmento(&nome)));
    fs::copy(&origem, &destino)
        .map_err(|err| format!("Nao foi possivel copiar o anexo para os dados do programa: {err}"))?;

    Ok(KanbanAnexoResultado {
        id,
        nome,
        tipo,
        dados: String::new(),
        caminho: Some(destino.to_string_lossy().to_string()),
        origem: "interno".to_string(),
    })
}

#[tauri::command]
pub(crate) fn abrir_anexo_atendimento(caminho: String) -> Result<(), String> {
    let arquivo = PathBuf::from(caminho);
    if !arquivo.exists() || !arquivo.is_file() {
        return Err("Arquivo nao encontrado. Ele pode ter sido movido, renomeado ou apagado.".to_string());
    }
    abrir_arquivo(&arquivo)
}

#[tauri::command]
pub(crate) fn definir_fullscreen(window: tauri::Window, ativo: bool) -> Result<(), String> {
    window.set_fullscreen(ativo).map_err(|err| err.to_string())
}

/// Cria um `Command` para lançar um programa externo (abrir arquivo, pasta ou link).
///
/// Quando o app roda como AppImage, o runtime injeta variáveis de ambiente
/// (XDG_DATA_DIRS, GTK_PATH, GIO_EXTRA_MODULES, GDK_PIXBUF_MODULE_FILE,
/// GSETTINGS_SCHEMA_DIR, etc.) que são herdadas pelos processos-filho. Isso
/// faz o `xdg-open`/`gio` e o aplicativo lançado usarem os recursos empacotados
/// no AppImage em vez dos do sistema, quebrando a abertura do programa padrão e
/// caindo no navegador. Removemos essas variáveis para que o programa externo
/// rode como se tivesse sido lançado diretamente pelo sistema.
#[allow(unused_mut)]
pub(crate) fn comando_externo(programa: &str) -> Command {
    let mut cmd = Command::new(programa);
    #[cfg(target_os = "linux")]
    {
        if let Some(appdir) = env::var_os("APPDIR").map(|v| v.to_string_lossy().to_string()) {
            // Remove as variáveis que apontam para dentro do AppImage e fazem o
            // aplicativo externo usar bibliotecas/recursos empacotados.
            for var in [
                "GTK_DATA_PREFIX",
                "GTK_EXE_PREFIX",
                "GTK_PATH",
                "GTK_IM_MODULE_FILE",
                "GTK_THEME",
                "GDK_BACKEND",
                "GDK_PIXBUF_MODULE_FILE",
                "GDK_PIXBUF_MODULEDIR",
                "GSETTINGS_SCHEMA_DIR",
                "GIO_EXTRA_MODULES",
                "GIO_MODULE_DIR",
                "LD_LIBRARY_PATH",
                "LD_PRELOAD",
            ] {
                cmd.env_remove(var);
            }
            // Para XDG_DATA_DIRS preservamos as entradas do sistema/usuário
            // (inclusive Flatpak) e removemos apenas as que apontam para o AppImage,
            // para não perder as associações de aplicativo padrão.
            if let Ok(atual) = env::var("XDG_DATA_DIRS") {
                let limpo: Vec<&str> = atual
                    .split(':')
                    .filter(|p| !p.is_empty() && !p.starts_with(&appdir))
                    .collect();
                if limpo.is_empty() {
                    cmd.env("XDG_DATA_DIRS", "/usr/local/share:/usr/share");
                } else {
                    cmd.env("XDG_DATA_DIRS", limpo.join(":"));
                }
            }
        }
    }
    cmd
}

pub(crate) fn abrir_arquivo(arquivo: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let caminho = arquivo.to_string_lossy();
        let script = format!("Start-Process -FilePath {}", aspas_powershell(&caminho));
        comando_externo("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o documento: {err}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        comando_externo("open")
            .arg(arquivo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o documento: {err}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        comando_externo("xdg-open")
            .arg(arquivo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o documento: {err}"))?;
    }
    Ok(())
}

pub(crate) fn tipo_mime_por_caminho(caminho: &Path) -> String {
    match caminho
        .extension()
        .and_then(|valor| valor.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "odt" => "application/vnd.oasis.opendocument.text",
        "ods" => "application/vnd.oasis.opendocument.spreadsheet",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(target_os = "windows")]
pub(crate) fn aspas_powershell(valor: &str) -> String {
    format!("'{}'", valor.replace('\'', "''"))
}

pub(crate) fn sanitizar_segmento(valor: &str) -> String {
    let texto = valor.trim().replace('º', "o").replace('ª', "a");
    let filtrado = texto
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '_' | '-') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let filtrado = filtrado.split_whitespace().collect::<Vec<_>>().join(" ");
    if filtrado.is_empty() {
        "sem_identificacao".to_string()
    } else {
        filtrado
    }
}
