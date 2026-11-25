// Quadro magnético: o mural pessoal do coordenador (post-its, listas e
// arquivos importantes). É de cada um: fica em `pessoal/`, fora de `dados/`,
// para a sincronização do grupo nunca levar (ela publica `dados/` inteira) e
// para entrar no backup junto com `dados/` e `config/`.

use crate::*;

use base64::Engine;
use std::{fs, path::PathBuf};

const LIMITE_MINIATURA: u64 = 12 * 1024 * 1024;

pub(crate) fn pessoal_dir() -> std::io::Result<PathBuf> {
    Ok(app_base_dir()?.join("pessoal"))
}

fn pasta_quadro() -> Result<PathBuf, String> {
    let pasta = pessoal_dir().map_err(|err| err.to_string())?.join("quadro_magnetico");
    fs::create_dir_all(pasta.join("arquivos")).map_err(|err| err.to_string())?;
    Ok(pasta)
}

/// Só aceita o nome de um arquivo da pasta do quadro (nada de `..` ou `/`).
fn caminho_do_arquivo(arquivo_id: &str) -> Result<PathBuf, String> {
    if arquivo_id.is_empty() || arquivo_id.contains(['/', '\\']) || arquivo_id.contains("..") {
        return Err("Arquivo do quadro inválido.".to_string());
    }
    Ok(pasta_quadro()?.join("arquivos").join(arquivo_id))
}

#[derive(serde::Serialize)]
pub(crate) struct ArquivoQuadro {
    arquivo_id: String,
    nome: String,
    tamanho: u64,
    tipo: String,
}

#[tauri::command(async)]
pub(crate) fn carregar_quadro_magnetico() -> Result<Option<String>, String> {
    let caminho = pasta_quadro()?.join("quadro.json");
    match fs::read_to_string(&caminho) {
        Ok(texto) => Ok(Some(texto)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command(async)]
pub(crate) fn salvar_quadro_magnetico(conteudo: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&conteudo).map_err(|err| format!("Quadro inválido: {err}"))?;
    escrever_json_atomicamente(&pasta_quadro()?.join("quadro.json"), &conteudo).map_err(|err| err.to_string())
}

/// Copia o arquivo para a pasta do quadro. O original fica onde estava.
#[tauri::command(async)]
pub(crate) fn adicionar_arquivo_quadro(caminho: String) -> Result<ArquivoQuadro, String> {
    let origem = PathBuf::from(&caminho)
        .canonicalize()
        .map_err(|_| "Arquivo não encontrado.".to_string())?;
    if !origem.is_file() {
        return Err("Só dá para colocar arquivos no quadro (não pastas).".to_string());
    }
    let nome = origem
        .file_name()
        .and_then(|valor| valor.to_str())
        .unwrap_or("arquivo")
        .to_string();
    let arquivo_id = format!("{}_{}", chrono::Local::now().timestamp_millis(), sanitizar_segmento(&nome));
    let destino = caminho_do_arquivo(&arquivo_id)?;
    fs::copy(&origem, &destino).map_err(|err| format!("Não foi possível copiar o arquivo para o quadro: {err}"))?;
    let tamanho = fs::metadata(&destino).map(|meta| meta.len()).unwrap_or(0);
    Ok(ArquivoQuadro { arquivo_id, nome, tamanho, tipo: tipo_mime_por_caminho(&origem) })
}

/// Apaga a cópia guardada pelo quadro (o original, fora do app, não é tocado).
#[tauri::command(async)]
pub(crate) fn remover_arquivo_quadro(arquivo_id: String) -> Result<(), String> {
    let caminho = caminho_do_arquivo(&arquivo_id)?;
    match fs::remove_file(&caminho) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("Não foi possível apagar o arquivo: {err}")),
    }
}

#[tauri::command]
pub(crate) fn abrir_arquivo_quadro(arquivo_id: String) -> Result<(), String> {
    let caminho = caminho_do_arquivo(&arquivo_id)?;
    if !caminho.is_file() {
        return Err("O arquivo não está mais na pasta do quadro.".to_string());
    }
    if extensao_executavel(&caminho) {
        return Err("Por segurança, o app não abre programas ou scripts. Use \"Mostrar na pasta\".".to_string());
    }
    abrir_arquivo(&caminho)
}

#[tauri::command]
pub(crate) fn mostrar_arquivo_quadro(arquivo_id: String) -> Result<(), String> {
    caminho_do_arquivo(&arquivo_id)?;
    abrir_pasta(pasta_quadro()?.join("arquivos").to_string_lossy().to_string())
}

/// Imagem do quadro como data URL, para a miniatura no cartão.
#[tauri::command(async)]
pub(crate) fn miniatura_arquivo_quadro(arquivo_id: String) -> Result<Option<String>, String> {
    let caminho = caminho_do_arquivo(&arquivo_id)?;
    let tipo = tipo_mime_por_caminho(&caminho);
    if !tipo.starts_with("image/") {
        return Ok(None);
    }
    let tamanho = fs::metadata(&caminho).map(|meta| meta.len()).unwrap_or(0);
    if tamanho == 0 || tamanho > LIMITE_MINIATURA {
        return Ok(None);
    }
    let bytes = fs::read(&caminho).map_err(|err| err.to_string())?;
    Ok(Some(format!("data:{tipo};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn arquivo_do_quadro_nao_sai_da_pasta() {
        assert!(caminho_do_arquivo("../dados/x.json").is_err());
        assert!(caminho_do_arquivo("a/b").is_err());
        assert!(caminho_do_arquivo("").is_err());
    }

    #[test]
    fn quadro_entra_no_backup_e_volta() {
        let casa = std::env::temp_dir().join(format!("coordenacaoop-quadro-{}", std::process::id()));
        let _ = fs::remove_dir_all(&casa);
        crate::infra::BASE_DE_TESTE.with(|b| *b.borrow_mut() = Some(casa.clone()));
        salvar_quadro_magnetico("{\"versao\":1,\"itens\":[]}".to_string()).unwrap();
        fs::write(casa.join("pessoal/quadro_magnetico/arquivos/1_nota.txt"), "oi").unwrap();
        let backup = exportar_backup_interno().unwrap();
        let bytes = fs::read(backup.caminho.unwrap()).unwrap();
        fs::remove_dir_all(casa.join("pessoal")).unwrap();
        importar_backup_interno(BackupImportInput { nome: "b.zip".into(), bytes, modo: "mesclar".into() }).unwrap();
        assert!(carregar_quadro_magnetico().unwrap().is_some());
        assert_eq!(fs::read_to_string(casa.join("pessoal/quadro_magnetico/arquivos/1_nota.txt")).unwrap(), "oi");
        crate::infra::BASE_DE_TESTE.with(|b| *b.borrow_mut() = None);
        let _ = fs::remove_dir_all(&casa);
    }
}
