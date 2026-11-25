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
    let arquivo_id = id_do_arquivo(&nome, chrono::Local::now().timestamp_millis());
    let destino = caminho_do_arquivo(&arquivo_id)?;
    fs::copy(&origem, &destino).map_err(|err| format!("Não foi possível copiar o arquivo para o quadro: {err}"))?;
    let tamanho = fs::metadata(&destino).map(|meta| meta.len()).unwrap_or(0);
    Ok(ArquivoQuadro { arquivo_id, nome, tamanho, tipo: tipo_mime_por_caminho(&origem) })
}

/// Nome da cópia: `<momento>_<nome limpo>.<extensão>`. A extensão fica de
/// fora da limpeza para o Windows saber com que programa abrir e o app saber
/// que é imagem.
fn id_do_arquivo(nome: &str, momento: i64) -> String {
    let caminho = std::path::Path::new(nome);
    let base = caminho.file_stem().and_then(|v| v.to_str()).unwrap_or(nome);
    let extensao = caminho
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| v.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase())
        .filter(|v| !v.is_empty() && v.len() <= 10);
    match extensao {
        Some(extensao) => format!("{momento}_{}.{extensao}", sanitizar_segmento(base)),
        None => format!("{momento}_{}", sanitizar_segmento(base)),
    }
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

/// Miniatura da imagem do quadro como data URL. PNG e JPEG são reduzidos
/// para no máximo 640 px e mandados como JPEG; o que não der para reduzir vai
/// como está (até o limite de tamanho).
#[tauri::command(async)]
pub(crate) fn miniatura_arquivo_quadro(arquivo_id: String) -> Result<Option<String>, String> {
    let caminho = caminho_do_arquivo(&arquivo_id)?;
    let tamanho = fs::metadata(&caminho).map(|meta| meta.len()).unwrap_or(0);
    if tamanho == 0 || tamanho > LIMITE_MINIATURA {
        return Ok(None);
    }
    let bytes = fs::read(&caminho).map_err(|err| err.to_string())?;
    // Cópias feitas pela versão de teste anterior ficaram sem extensão: o
    // conteúdo diz se é imagem.
    let tipo = match tipo_pelo_conteudo(&bytes) {
        Some(tipo) => tipo.to_string(),
        None => tipo_mime_por_caminho(&caminho),
    };
    if !tipo.starts_with("image/") {
        return Ok(None);
    }
    if let Some(jpeg) = reduzir_imagem(&bytes) {
        return Ok(Some(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(jpeg))));
    }
    // Não deu para reduzir (formato que o app não decodifica, como WebP, ou
    // uma imagem com extensão trocada): manda o original com o tipo real,
    // que a tela sabe mostrar.
    Ok(Some(format!("data:{tipo};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
}

/// Tipo da imagem pelos primeiros bytes (a extensão às vezes mente: foto
/// baixada como .png que na verdade é JPEG ou WebP).
fn tipo_pelo_conteudo(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF8") {
        Some("image/gif")
    } else if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else {
        None
    }
}
const LADO_MINIATURA: u32 = 640;

/// Reduz PNG/JPEG para JPEG pequeno, com fundo branco onde era transparente.
fn reduzir_imagem(bytes: &[u8]) -> Option<Vec<u8>> {
    let imagem = image::load_from_memory(bytes).ok()?;
    let reduzida = imagem.thumbnail(LADO_MINIATURA, LADO_MINIATURA).to_rgba8();
    let (largura, altura) = reduzida.dimensions();
    let mut rgb = image::RgbImage::new(largura, altura);
    for (x, y, pixel) in reduzida.enumerate_pixels() {
        let [r, g, b, a] = pixel.0;
        let mistura = |c: u8| ((c as u32 * a as u32 + 255 * (255 - a as u32)) / 255) as u8;
        rgb.put_pixel(x, y, image::Rgb([mistura(r), mistura(g), mistura(b)]));
    }
    let mut saida = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(rgb).write_to(&mut saida, image::ImageOutputFormat::Jpeg(82)).ok()?;
    Some(saida.into_inner())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn miniatura_reduz_imagem_grande() {
        let imagem = image::RgbaImage::from_pixel(2000, 1000, image::Rgba([10, 120, 200, 128]));
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(imagem).write_to(&mut png, image::ImageOutputFormat::Png).unwrap();
        let jpeg = reduzir_imagem(&png.into_inner()).expect("miniatura");
        let lida = image::load_from_memory(&jpeg).unwrap();
        assert_eq!(image::GenericImageView::dimensions(&lida), (640, 320));
    }

    #[test]
    fn copia_mantem_a_extensao() {
        assert_eq!(id_do_arquivo("Img_Perfil_Thiago.png", 1), "1_Img_Perfil_Thiago.png");
        assert_eq!(id_do_arquivo("Ata do conselho (2).PDF", 2), "2_Ata do conselho _2_.pdf");
        assert_eq!(id_do_arquivo("LEIAME", 3), "3_LEIAME");
        assert!(caminho_do_arquivo(&id_do_arquivo("x.png", 4)).is_ok());
    }

    #[test]
    fn tipo_da_imagem_pelo_conteudo() {
        assert_eq!(tipo_pelo_conteudo(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(tipo_pelo_conteudo(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(tipo_pelo_conteudo(b"texto"), None);
    }

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
