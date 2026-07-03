#![allow(unused_imports)]

// Fotos dos alunos: importação (zip/7z), armazenamento e posicionamento.
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


// ── Fotos dos alunos ────────────────────────────────────────────────────────────
#[derive(Deserialize)]
pub(crate) struct ImportarFotosInput {
    pub(crate) caminho: String,
}

#[derive(Serialize)]
pub(crate) struct ResultadoImportacaoFotos {
    pub(crate) turma: String,
    pub(crate) turma_encontrada: bool,
    pub(crate) total: usize,
    pub(crate) casados: usize,
    pub(crate) nao_encontrados: Vec<String>,
    pub(crate) ambiguos: Vec<String>,
    pub(crate) arquivos_no_pacote: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct FotoAlunoDados {
    pub(crate) data_url: String,
    pub(crate) posicao: String,
}

pub(crate) fn pasta_fotos() -> Result<PathBuf, String> {
    // Fica dentro de `dados/` para ser sincronizada com o grupo de trabalho.
    let pasta = data_dir().map_err(|e| e.to_string())?.join("fotos");
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    // Migração: traz fotos da localização antiga (app_base_dir/fotos, não sincronizada).
    if let Ok(base) = app_base_dir() {
        let antiga = base.join("fotos");
        if antiga.is_dir() && antiga != pasta {
            if let Ok(entradas) = fs::read_dir(&antiga) {
                for entrada in entradas.flatten() {
                    let origem = entrada.path();
                    if origem.is_file() {
                        let destino = pasta.join(entrada.file_name());
                        if !destino.exists()
                            && fs::rename(&origem, &destino).is_err() {
                                let _ = fs::copy(&origem, &destino);
                            }
                    }
                }
            }
            let _ = fs::remove_dir_all(&antiga);
        }
    }
    Ok(pasta)
}

// Chave normalizada da turma: primeiro número + última letra. Ex.: "6º Ano B" -> "6B".
pub(crate) fn chave_turma_foto(texto: &str) -> String {
    let mut num = String::new();
    let mut achou_num = false;
    for ch in texto.chars() {
        if ch.is_ascii_digit() {
            num.push(ch);
            achou_num = true;
        } else if achou_num {
            break;
        }
    }
    let letra = texto
        .chars().rfind(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_uppercase().to_string())
        .unwrap_or_default();
    format!("{num}{letra}")
}

// Extensões de imagem exibíveis diretamente pelo WebView (e que armazenamos como estão).
pub(crate) const EXTS_FOTO: [&str; 6] = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

pub(crate) fn extensao_imagem(nome: &str) -> Option<String> {
    let n = nome.to_ascii_lowercase();
    if n.ends_with(".png") {
        return Some("png".to_string());
    }
    if n.ends_with(".webp") {
        return Some("webp".to_string());
    }
    if n.ends_with(".gif") {
        return Some("gif".to_string());
    }
    if n.ends_with(".bmp") || n.ends_with(".dib") {
        return Some("bmp".to_string());
    }
    if n.ends_with(".jpg") || n.ends_with(".jpeg") || n.ends_with(".jpe") || n.ends_with(".jfif") {
        return Some("jpg".to_string());
    }
    None
}

// Detecta imagem pelos bytes iniciais (magic bytes), independente da extensão/nome.
pub(crate) fn detectar_ext_imagem(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 12 {
        return None;
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return Some("png");
    }
    if &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if bytes.starts_with(b"BM") {
        return Some("bmp");
    }
    None
}

// Detecta HEIC/HEIF (foto de iPhone): ISO-BMFF com marca de tipo "ftyp" + brand HEIF.
pub(crate) fn eh_heic(bytes: &[u8]) -> bool {
    if bytes.len() < 12 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    matches!(
        &bytes[8..12],
        b"heic" | b"heix" | b"hevc" | b"hevx" | b"heim" | b"heis" | b"mif1" | b"msf1" | b"heif"
    )
}

// Verifica se um stream JPEG é decodável por navegadores (baseline/extended/progressive),
// e não um JPEG sem perdas (SOF3), como o usado para o RAW dentro de um CR2.
pub(crate) fn jpeg_decodavel(b: &[u8]) -> bool {
    let mut i = 2usize; // pula SOI (FFD8)
    while i + 4 <= b.len() {
        if b[i] != 0xFF {
            i += 1;
            continue;
        }
        let marcador = b[i + 1];
        // marcadores sem payload
        if marcador == 0xD8 || marcador == 0xD9 || (0xD0..=0xD7).contains(&marcador) || marcador == 0x01 || marcador == 0xFF {
            i += 2;
            continue;
        }
        let seglen = u16::from_be_bytes([b[i + 2], b[i + 3]]) as usize;
        match marcador {
            0xC0..=0xC2 => return true,  // baseline / extended / progressive
            0xC3 | 0xC5 | 0xC6 | 0xC7 | 0xC9 | 0xCA | 0xCB | 0xCD | 0xCE | 0xCF => return false, // sem perdas / diferencial
            0xDA => return false,               // início do scan sem SOF decodável
            _ => {}
        }
        if seglen < 2 {
            break;
        }
        i += 2 + seglen;
    }
    false
}

// Extrai o maior preview JPEG decodável embutido em um RAW baseado em TIFF (CR2, NEF, ARW...).
pub(crate) fn extrair_preview_raw(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() < 16 {
        return None;
    }
    let le = match &bytes[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let u16a = |o: usize| -> Option<u16> {
        let s = bytes.get(o..o + 2)?;
        Some(if le { u16::from_le_bytes([s[0], s[1]]) } else { u16::from_be_bytes([s[0], s[1]]) })
    };
    let u32a = |o: usize| -> Option<u32> {
        let s = bytes.get(o..o + 4)?;
        Some(if le {
            u32::from_le_bytes([s[0], s[1], s[2], s[3]])
        } else {
            u32::from_be_bytes([s[0], s[1], s[2], s[3]])
        })
    };
    if u16a(2)? != 42 {
        return None;
    }
    let mut ifd_off = u32a(4)? as usize;
    let mut melhor: Option<(usize, usize)> = None; // (offset, len)
    let mut visitados = 0;
    while ifd_off != 0 && visitados < 16 {
        visitados += 1;
        let count = match u16a(ifd_off) {
            Some(c) => c as usize,
            None => break,
        };
        let base = ifd_off + 2;
        if base + count * 12 + 4 > bytes.len() {
            break;
        }
        let mut strip_off: Option<usize> = None;
        let mut strip_len: Option<usize> = None;
        for i in 0..count {
            let e = base + i * 12;
            let tag = u16a(e)?;
            let tipo = u16a(e + 2)?;
            let valor = if tipo == 3 {
                // SHORT armazenado no campo de valor
                u16a(e + 8)? as u32
            } else {
                u32a(e + 8)?
            } as usize;
            match tag {
                0x0111 => strip_off = Some(valor), // StripOffsets (preview = strip único)
                0x0117 => strip_len = Some(valor), // StripByteCounts
                _ => {}
            }
        }
        if let (Some(o), Some(l)) = (strip_off, strip_len) {
            if l > 1024 && o + l <= bytes.len() {
                let trecho = &bytes[o..o + l];
                if trecho.starts_with(&[0xFF, 0xD8, 0xFF]) && jpeg_decodavel(trecho)
                    && melhor.is_none_or(|(_, bl)| l > bl) {
                        melhor = Some((o, l));
                    }
            }
        }
        ifd_off = u32a(base + count * 12)? as usize;
    }
    melhor.map(|(o, l)| bytes[o..o + l].to_vec())
}

// Decide como armazenar um arquivo: imagem padrão direta, ou preview JPEG de um RAW.
pub(crate) fn imagem_para_armazenar(nome: &str, dados: Vec<u8>) -> Option<(String, Vec<u8>)> {
    if let Some(ext) =
        extensao_imagem(nome).or_else(|| detectar_ext_imagem(&dados).map(|s| s.to_string()))
    {
        return Some((ext, dados));
    }
    extrair_preview_raw(&dados).map(|jpeg| ("jpg".to_string(), jpeg))
}

pub(crate) fn nome_base_arquivo(caminho: &str) -> String {
    let bruto = caminho.rsplit(['/', '\\']).next().unwrap_or(caminho);
    match bruto.rfind('.') {
        Some(p) => bruto[..p].to_string(),
        None => bruto.to_string(),
    }
}

pub(crate) fn mime_por_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    }
}

pub(crate) fn coletar_imagens_dir(
    dir: &Path,
    imagens: &mut Vec<(String, String, Vec<u8>)>,
    todos: &mut Vec<String>,
) {
    if let Ok(entradas) = fs::read_dir(dir) {
        for entrada in entradas.flatten() {
            let caminho = entrada.path();
            if caminho.is_dir() {
                coletar_imagens_dir(&caminho, imagens, todos);
            } else if let Some(nome) = caminho.file_name().and_then(|n| n.to_str()) {
                todos.push(nome.to_string());
                if let Ok(dados) = fs::read(&caminho) {
                    if let Some((ext, conteudo)) = imagem_para_armazenar(nome, dados) {
                        imagens.push((nome_base_arquivo(nome), ext, conteudo));
                    }
                }
            }
        }
    }
}

// (nome_sem_ext, ext, bytes)
pub(crate) type ImagemExtraida = (String, String, Vec<u8>);

// Extrai imagens de um .zip/.7z e a lista de todos os arquivos encontrados
// (para diagnóstico quando nada é reconhecido).
pub(crate) fn extrair_imagens_arquivo(
    nome: &str,
    bytes: &[u8],
) -> Result<(Vec<ImagemExtraida>, Vec<String>), String> {
    let mut imagens = Vec::new();
    let mut todos = Vec::new();
    if nome.to_ascii_lowercase().ends_with(".7z") {
        let base = std::env::temp_dir().join(format!("coop_fotos_{}", Local::now().timestamp_millis()));
        let arq = base.with_extension("7z");
        fs::create_dir_all(&base).map_err(|e| e.to_string())?;
        fs::write(&arq, bytes).map_err(|e| e.to_string())?;
        let resultado = sevenz_rust::decompress_file(&arq, &base)
            .map_err(|e| format!("Falha ao ler o arquivo .7z: {e}"));
        if resultado.is_ok() {
            coletar_imagens_dir(&base, &mut imagens, &mut todos);
        }
        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_file(&arq);
        resultado?;
    } else {
        let cursor = Cursor::new(bytes.to_vec());
        let mut zip = ZipArchive::new(cursor).map_err(|e| format!("Falha ao ler o arquivo .zip: {e}"))?;
        for i in 0..zip.len() {
            let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
            if f.is_dir() {
                continue;
            }
            let nome_entrada = f.name().to_string();
            let rotulo = nome_entrada.rsplit(['/', '\\']).next().unwrap_or(&nome_entrada).to_string();
            todos.push(rotulo);
            let mut buf = Vec::new();
            std::io::Read::read_to_end(&mut f, &mut buf).map_err(|e| e.to_string())?;
            if let Some((ext, conteudo)) = imagem_para_armazenar(&nome_entrada, buf) {
                imagens.push((nome_base_arquivo(&nome_entrada), ext, conteudo));
            }
        }
    }
    Ok((imagens, todos))
}

#[tauri::command(async)]
pub(crate) fn importar_fotos_turma(input: ImportarFotosInput) -> Result<ResultadoImportacaoFotos, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(&input.caminho);
    let nome_arquivo = caminho
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let bytes = fs::read(&caminho)
        .map_err(|e| format!("Não foi possível ler o arquivo: {e}"))?;
    let chave_arquivo = chave_turma_foto(&nome_base_arquivo(&nome_arquivo));
    let turmas = carregar_turmas_com_caminho()?;
    let turma = turmas
        .iter()
        .find(|(_, t)| chave_turma_foto(&t.codigo) == chave_arquivo);

    let Some((_, turma)) = turma else {
        return Ok(ResultadoImportacaoFotos {
            turma: chave_arquivo,
            turma_encontrada: false,
            total: 0,
            casados: 0,
            nao_encontrados: Vec::new(),
            ambiguos: Vec::new(),
            arquivos_no_pacote: Vec::new(),
        });
    };

    // Índice de alunos: matrícula -> nome normalizado e primeiro token.
    let mut alunos: Vec<(String, String, String)> = Vec::new(); // (matricula, nome_norm, primeiro_token)
    if let Some(mapa) = &turma.alunos {
        for (matricula, info) in mapa {
            if let Some(nome) = info.get("nome").and_then(Value::as_str) {
                let norm = normalizar_nome_busca(nome);
                let primeiro = norm.split_whitespace().next().unwrap_or("").to_string();
                alunos.push((matricula.clone(), norm, primeiro));
            }
        }
    }

    let (imagens, arquivos_no_pacote) = extrair_imagens_arquivo(&nome_arquivo, &bytes)?;
    let total = imagens.len();
    let pasta = pasta_fotos()?;
    let mut casados = 0usize;
    let mut nao_encontrados = Vec::new();
    let mut ambiguos = Vec::new();

    for (nome_foto, ext, dados) in imagens {
        let alvo = normalizar_nome_busca(&nome_foto);
        let tokens: Vec<&str> = alvo.split_whitespace().collect();
        let candidatos: Vec<&(String, String, String)> = if tokens.len() <= 1 {
            alunos.iter().filter(|(_, _, primeiro)| *primeiro == alvo).collect()
        } else {
            alunos
                .iter()
                .filter(|(_, norm, _)| *norm == alvo || norm.starts_with(&format!("{alvo} ")))
                .collect()
        };

        match candidatos.len() {
            1 => {
                let matricula = &candidatos[0].0;
                // remove variações de extensão antigas e grava a nova.
                for e in EXTS_FOTO {
                    let _ = fs::remove_file(pasta.join(format!("{}.{}", sanitizar_segmento(matricula), e)));
                }
                let destino = pasta.join(format!("{}.{}", sanitizar_segmento(matricula), ext));
                if fs::write(&destino, &dados).is_ok() {
                    casados += 1;
                } else {
                    nao_encontrados.push(nome_foto);
                }
            }
            0 => nao_encontrados.push(nome_foto),
            _ => ambiguos.push(nome_foto),
        }
    }

    Ok(ResultadoImportacaoFotos {
        turma: turma.codigo.clone(),
        turma_encontrada: true,
        total,
        casados,
        nao_encontrados,
        ambiguos,
        arquivos_no_pacote: if total == 0 { arquivos_no_pacote } else { Vec::new() },
    })
}

#[tauri::command]
pub(crate) fn carregar_foto_aluno(matricula: String) -> Result<Option<FotoAlunoDados>, String> {
    if matricula.trim().is_empty() {
        return Ok(None);
    }
    let pasta = pasta_fotos()?;
    let slug = sanitizar_segmento(&matricula);
    for ext in EXTS_FOTO {
        let caminho = pasta.join(format!("{slug}.{ext}"));
        if caminho.exists() {
            let dados = fs::read(&caminho).map_err(|e| e.to_string())?;
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&dados);
            let data_url = format!("data:{};base64,{}", mime_por_ext(ext), b64);
            let posicao = ler_posicao_foto(&matricula).unwrap_or_else(|| "50% 50%".to_string());
            return Ok(Some(FotoAlunoDados { data_url, posicao }));
        }
    }
    Ok(None)
}

pub(crate) fn caminho_posicoes_foto() -> Result<PathBuf, String> {
    Ok(pasta_fotos()?.join("posicoes.json"))
}

pub(crate) fn ler_posicoes_foto() -> serde_json::Map<String, Value> {
    caminho_posicoes_foto()
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

pub(crate) fn ler_posicao_foto(matricula: &str) -> Option<String> {
    ler_posicoes_foto()
        .get(matricula)
        .and_then(Value::as_str)
        .map(str::to_string)
}

#[tauri::command]
pub(crate) fn salvar_posicao_foto(matricula: String, posicao: String) -> Result<(), String> {
    let _dados = travar_dados();
    let mut mapa = ler_posicoes_foto();
    mapa.insert(matricula, Value::String(posicao));
    let texto = serde_json::to_string_pretty(&Value::Object(mapa)).map_err(|e| e.to_string())?;
    escrever_json_atomicamente(&caminho_posicoes_foto()?, &texto).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub(crate) struct DefinirFotoInput {
    pub(crate) matricula: String,
    pub(crate) caminho: String,
}

#[tauri::command]
pub(crate) fn definir_foto_aluno(input: DefinirFotoInput) -> Result<bool, String> {
    let _dados = travar_dados();
    if input.matricula.trim().is_empty() {
        return Err("Aluno inválido.".to_string());
    }
    let dados = fs::read(&input.caminho)
        .map_err(|e| format!("Não foi possível ler a imagem: {e}"))?;
    let nome = PathBuf::from(&input.caminho)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let eh_heic_arquivo = eh_heic(&dados);
    let (ext, conteudo) = imagem_para_armazenar(&nome, dados).ok_or_else(|| {
        if eh_heic_arquivo {
            "Fotos no formato HEIC/HEIF (padrão do iPhone) ainda não são exibíveis. Converta a imagem para JPG antes de usar.".to_string()
        } else {
            "O arquivo selecionado não é uma imagem suportada (use JPG, PNG, WEBP, GIF, BMP ou CR2).".to_string()
        }
    })?;
    let pasta = pasta_fotos()?;
    let slug = sanitizar_segmento(&input.matricula);
    for e in EXTS_FOTO {
        let _ = fs::remove_file(pasta.join(format!("{slug}.{e}")));
    }
    fs::write(pasta.join(format!("{slug}.{ext}")), &conteudo).map_err(|e| e.to_string())?;
    // Reseta o enquadramento ao trocar de foto.
    let mut mapa = ler_posicoes_foto();
    mapa.remove(&input.matricula);
    if let Ok(caminho) = caminho_posicoes_foto() {
        let texto = serde_json::to_string_pretty(&Value::Object(mapa)).unwrap_or_default();
        let _ = escrever_json_atomicamente(&caminho, &texto);
    }
    Ok(true)
}

#[tauri::command]
pub(crate) fn remover_foto_aluno(matricula: String) -> Result<(), String> {
    let _dados = travar_dados();
    let pasta = pasta_fotos()?;
    let slug = sanitizar_segmento(&matricula);
    for ext in EXTS_FOTO {
        let _ = fs::remove_file(pasta.join(format!("{slug}.{ext}")));
    }
    let mut mapa = ler_posicoes_foto();
    mapa.remove(&matricula);
    let texto = serde_json::to_string_pretty(&Value::Object(mapa)).map_err(|e| e.to_string())?;
    let _ = escrever_json_atomicamente(&caminho_posicoes_foto()?, &texto);
    Ok(())
}
