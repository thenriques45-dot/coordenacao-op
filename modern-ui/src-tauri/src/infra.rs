#![allow(unused_imports)]

// Infraestrutura: trava global de dados, caminhos do app, escrita atômica e espelho do estado da interface.
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


// Serializa o acesso aos arquivos locais (dados/ e config/) entre os comandos
// async e os da thread principal. Antes de existirem comandos async, essa
// serialização era garantida pela própria thread principal; a trava preserva a
// mesma semântica sem congelar a interface durante operações demoradas.
// Regras: todo comando async que toca dados/ segura a trava; todo comando
// síncrono que GRAVA em dados/ também. Leituras síncronas de arquivo único
// ficam sem trava (as gravações são atômicas via rename). Comandos não podem
// chamar outros comandos que travam — a trava não é reentrante.
pub(crate) static DADOS_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn travar_dados() -> MutexGuard<'static, ()> {
    // Um panic com a trava presa não pode inutilizar o app: como cada gravação
    // de arquivo é atômica, herdar a trava envenenada é seguro.
    DADOS_LOCK.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(crate) fn escrever_json_atomicamente(caminho: &Path, conteudo: &str) -> io::Result<()> {
    let dir = caminho.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "caminho sem diretório pai")
    })?;
    let nome_base = caminho
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("arquivo");
    let tmp_nome = format!(".{}.{}.tmp", nome_base, Local::now().timestamp_millis());
    let temporario = dir.join(tmp_nome);
    fs::write(&temporario, conteudo)?;
    fs::rename(&temporario, caminho).inspect_err(|_err| {
        let _ = fs::remove_file(&temporario);
    })
}

pub(crate) fn app_base_dir() -> io::Result<PathBuf> {
    if let Ok(base) = env::var("COORDENACAOOP_HOME") {
        let base = PathBuf::from(base);
        preparar_base_portatil(&base)?;
        return Ok(base);
    }

    if let Ok(appimage) = env::var("APPIMAGE") {
        if let Some(base) = PathBuf::from(appimage).parent().map(Path::to_path_buf) {
            if pasta_gravavel(&base) {
                preparar_base_portatil(&base)?;
                return Ok(base);
            }
        }
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let base = parent.to_path_buf();
            if !parece_montagem_appimage(&base) && pasta_gravavel(&base) {
                preparar_base_portatil(&base)?;
                return Ok(base);
            }
        }
    }

    if let Ok(base) = env::current_dir() {
        if pasta_gravavel(&base) {
            preparar_base_portatil(&base)?;
            return Ok(base);
        }
    }

    let base = pasta_dados_usuario()?;
    preparar_base_portatil(&base)?;
    Ok(base)
}

pub(crate) fn parece_montagem_appimage(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .starts_with(".mount_")
    })
}

pub(crate) fn pasta_gravavel(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }
    let teste = path.join(".coordenacaoop_write_test");
    match fs::write(&teste, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(teste);
            true
        }
        Err(_) => false,
    }
}

pub(crate) fn pasta_dados_usuario() -> io::Result<PathBuf> {
    if cfg!(target_os = "windows") {
        if let Ok(appdata) = env::var("APPDATA") {
            return Ok(PathBuf::from(appdata).join("CoordenacaoOP"));
        }
        if let Ok(localappdata) = env::var("LOCALAPPDATA") {
            return Ok(PathBuf::from(localappdata).join("CoordenacaoOP"));
        }
    }

    if cfg!(target_os = "macos") {
        if let Ok(home) = env::var("HOME") {
            return Ok(PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("CoordenacaoOP"));
        }
    }

    if let Ok(xdg_data_home) = env::var("XDG_DATA_HOME") {
        return Ok(PathBuf::from(xdg_data_home).join("coordenacaoop"));
    }
    if let Ok(home) = env::var("HOME") {
        return Ok(PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("coordenacaoop"));
    }

    Ok(env::current_dir()?.join("coordenacaoop-dados"))
}

pub(crate) fn data_dir() -> io::Result<PathBuf> {
    Ok(app_base_dir()?.join("dados"))
}

pub(crate) fn config_dir() -> io::Result<PathBuf> {
    Ok(app_base_dir()?.join("config"))
}

pub(crate) fn backups_dir() -> io::Result<PathBuf> {
    let pasta = app_base_dir()?.join("backups");
    fs::create_dir_all(&pasta)?;
    Ok(pasta)
}

// ── Espelho do estado da interface ───────────────────────────────────────────
// O quadro kanban, o calendário e os caches de PEI/planejamento vivem no
// localStorage do WebView, que pode ser perdido em limpezas de cache/perfil.
// Estes comandos guardam uma cópia em dados/estado_ui.json para o frontend
// restaurar na inicialização. A gravação segura DADOS_LOCK, que serializa o
// ler-modificar-gravar do arquivo com os demais comandos.

pub(crate) fn estado_ui_path() -> io::Result<PathBuf> {
    Ok(data_dir()?.join("estado_ui.json"))
}

pub(crate) fn ler_estado_ui() -> serde_json::Map<String, Value> {
    // Um espelho ilegível não pode travar as gravações futuras: recomeça vazio.
    estado_ui_path()
        .ok()
        .and_then(|caminho| fs::read_to_string(caminho).ok())
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
        .and_then(|valor| valor.as_object().cloned())
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) fn salvar_estado_ui(chave: String, valor: String) -> Result<(), String> {
    let _dados = travar_dados();
    if chave.is_empty() || chave.len() > 120 {
        return Err("Chave de estado inválida.".to_string());
    }
    let mut estado = ler_estado_ui();
    estado.insert(chave, Value::String(valor));
    let caminho = estado_ui_path().map_err(|err| err.to_string())?;
    if let Some(pai) = caminho.parent() {
        fs::create_dir_all(pai).map_err(|err| err.to_string())?;
    }
    let texto = serde_json::to_string(&Value::Object(estado)).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn carregar_estado_ui() -> BTreeMap<String, String> {
    ler_estado_ui()
        .into_iter()
        .filter_map(|(chave, valor)| match valor {
            Value::String(texto) => Some((chave, texto)),
            _ => None,
        })
        .collect()
}

pub(crate) fn preparar_base_portatil(base: &Path) -> io::Result<()> {
    fs::create_dir_all(base)?;
    migrar_dados_legados(base)?;

    for nome in ["dados", "config", "backups"] {
        fs::create_dir_all(base.join(nome))?;
    }
    fs::create_dir_all(base.join("dados").join("persistidos"))?;
    Ok(())
}

pub(crate) fn migrar_dados_legados(base: &Path) -> io::Result<()> {
    let Some(legado) = legacy_user_base_dir() else {
        return Ok(());
    };

    if !legado.exists() || mesmos_caminhos(base, &legado) {
        return Ok(());
    }

    for nome in ["dados", "config", "backups"] {
        let origem = legado.join(nome);
        let destino = base.join(nome);
        if origem.exists() && !destino.exists() {
            copiar_recursivamente(&origem, &destino)?;
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn legacy_user_base_dir() -> Option<PathBuf> {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|base| base.join("CoordenacaoOP").join("CoordenacaoOP"))
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn legacy_user_base_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .map(|base| base.join(".coordenacaoop"))
}

pub(crate) fn mesmos_caminhos(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

pub(crate) fn caminhos_diferentes(a: &Path, b: &Path) -> bool {
    !mesmos_caminhos(a, b)
}
