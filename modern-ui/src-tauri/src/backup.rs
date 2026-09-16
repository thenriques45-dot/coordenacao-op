
// Exportação e importação de backups (.zip).
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use chrono::Local;
use std::{
    collections::BTreeSet,
    env, fs, io,
    io::Cursor,
    io::Write,
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};


#[tauri::command(async)]
pub(crate) fn exportar_backup() -> Result<BackupResultado, String> {
    let _dados = travar_dados();
    exportar_backup_interno().map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub(crate) fn exportar_backup_seletivo(input: BackupExportInput) -> Result<BackupResultado, String> {
    let _dados = travar_dados();
    let ciclos = input
        .ciclos
        .unwrap_or_default()
        .into_iter()
        .map(|ciclo| ciclo.trim().to_string())
        .filter(|ciclo| !ciclo.is_empty() && ciclo != "todos")
        .collect::<Vec<_>>();
    if ciclos.is_empty() {
        exportar_backup_interno().map_err(|err| err.to_string())
    } else {
        exportar_backup_ciclos_interno(&ciclos).map_err(|err| err.to_string())
    }
}

#[tauri::command(async)]
pub(crate) fn importar_backup(input: BackupImportInput) -> Result<BackupResultado, String> {
    let _dados = travar_dados();
    importar_backup_interno(input).map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub(crate) fn importar_backup_por_caminho(caminho: String, modo: String) -> Result<BackupResultado, String> {
    let _dados = travar_dados();
    let bytes = std::fs::read(&caminho).map_err(|err| err.to_string())?;
    let nome = std::path::Path::new(&caminho)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("backup.zip")
        .to_string();
    importar_backup_interno(BackupImportInput { nome, bytes, modo }).map_err(|err| err.to_string())
}

pub(crate) fn exportar_backup_interno() -> io::Result<BackupResultado> {
    let destino = backups_dir()?.join(format!(
        "coordenacaoop_backup_{}.zip",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    ));
    let arquivo = fs::File::create(&destino)?;
    let mut zip = ZipWriter::new(arquivo);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut total = 0;

    for nome_raiz in ["dados", "config"] {
        let pasta = app_base_dir()?.join(nome_raiz);
        if pasta.exists() {
            adicionar_pasta_zip(&mut zip, &pasta, nome_raiz, options, &mut total)?;
        }
    }

    let manifesto = serde_json::json!({
        "app": "CoordenacaoOP",
        "versao_app": env!("CARGO_PKG_VERSION"),
        "criado_em": Local::now().to_rfc3339(),
        "formato": 1,
        "total_arquivos": total,
    });
    zip.start_file("backup_manifest.json", options)?;
    zip.write_all(serde_json::to_string_pretty(&manifesto)?.as_bytes())?;
    zip.finish()?;

    // Falha na poda não invalida o backup que acabou de ser criado.
    let _ = podar_backups_antigos(MAX_BACKUPS_MANTIDOS);

    Ok(BackupResultado {
        caminho: Some(destino.to_string_lossy().to_string()),
        arquivos: total,
        arquivos_importados: 0,
        conflitos: Vec::new(),
        backup_seguranca: None,
    })
}

/// Quantos backups automáticos ficam em disco. Cada um é um zip de `dados/` +
/// `config/` inteiros — ~570 MB numa escola com fotos de todos os alunos.
pub(crate) const MAX_BACKUPS_MANTIDOS: usize = 10;

/// Reconhece o nome dos backups COMPLETOS gerados automaticamente:
/// `coordenacaoop_backup_2026-09-15_21-26-56.zip`.
///
/// Exige o carimbo de data exato de propósito: os backups seletivos por ciclo
/// (`coordenacaoop_backup_<ciclos>_<data>.zip`) são exportações que o
/// coordenador pediu e não podem ser podadas junto.
pub(crate) fn eh_backup_automatico(nome: &str) -> bool {
    let Some(carimbo) = nome
        .strip_prefix("coordenacaoop_backup_")
        .and_then(|resto| resto.strip_suffix(".zip"))
    else {
        return false;
    };
    // %Y-%m-%d_%H-%M-%S
    carimbo.len() == 19
        && carimbo
            .chars()
            .enumerate()
            .all(|(i, c)| match i {
                4 | 7 | 13 | 16 => c == '-',
                10 => c == '_',
                _ => c.is_ascii_digit(),
            })
}

/// Apaga os backups automáticos mais antigos, mantendo os `manter` mais
/// recentes. Devolve quantos foram apagados.
///
/// Até aqui nada limpava essa pasta. Como cada pull institucional gera um
/// backup de segurança — e o pull disparava a cada 15 minutos por causa da
/// assinatura instável (ver `eh_estado_ui_da_maquina` em sync.rs) — a pasta
/// tinha chegado a 46 arquivos e 24 GB numa instalação real.
pub(crate) fn podar_backups_antigos(manter: usize) -> io::Result<usize> {
    podar_backups_na_pasta(&backups_dir()?, manter)
}

/// Corpo de `podar_backups_antigos`, separado da descoberta da pasta para
/// poder ser testado sem depender de COORDENACAOOP_HOME.
pub(crate) fn podar_backups_na_pasta(pasta: &Path, manter: usize) -> io::Result<usize> {
    let mut automaticos: Vec<_> = fs::read_dir(pasta)?
        .filter_map(|entrada| entrada.ok())
        .map(|entrada| entrada.path())
        .filter(|caminho| {
            caminho.is_file()
                && caminho
                    .file_name()
                    .and_then(|nome| nome.to_str())
                    .is_some_and(eh_backup_automatico)
        })
        .collect();

    if automaticos.len() <= manter {
        return Ok(0);
    }

    // O carimbo no nome (%Y-%m-%d_%H-%M-%S) ordena lexicograficamente na mesma
    // ordem cronológica — mais confiável que o mtime, que a sincronização de
    // arquivos pode reescrever.
    automaticos.sort();
    let remover = automaticos.len() - manter;
    let mut apagados = 0;
    for caminho in automaticos.into_iter().take(remover) {
        if fs::remove_file(&caminho).is_ok() {
            apagados += 1;
        }
    }
    Ok(apagados)
}

pub(crate) fn exportar_backup_ciclos_interno(ciclos: &[String]) -> io::Result<BackupResultado> {
    let ciclos_set = ciclos
        .iter()
        .map(|ciclo| normalizar_chave(ciclo))
        .collect::<BTreeSet<_>>();
    let destino = backups_dir()?.join(format!(
        "coordenacaoop_backup_{}_{}.zip",
        ciclos.join("-").replace(['/', '\\', ' '], "_"),
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    ));
    let arquivo = fs::File::create(&destino)?;
    let mut zip = ZipWriter::new(arquivo);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut total = 0;

    let config = config_dir()?;
    if config.exists() {
        adicionar_pasta_zip(&mut zip, &config, "config", options, &mut total)?;
    }

    let dados = data_dir()?;
    let imagens = dados.join("imagens");
    if imagens.exists() {
        adicionar_pasta_zip(&mut zip, &imagens, "dados", options, &mut total)?;
    }

    let turmas =
        carregar_turmas_com_caminho().map_err(io::Error::other)?;
    for (caminho, turma) in turmas {
        let ciclo = turma
            .ciclo
            .as_deref()
            .map(normalizar_chave)
            .unwrap_or_default();
        if ciclos_set.contains(&ciclo) {
            adicionar_arquivo_zip(&mut zip, &caminho, "dados", options, &mut total)?;
        }
    }

    let manifesto = serde_json::json!({
        "app": "CoordenacaoOP",
        "versao_app": env!("CARGO_PKG_VERSION"),
        "criado_em": Local::now().to_rfc3339(),
        "formato": 1,
        "tipo": "seletivo_por_ciclo",
        "ciclos": ciclos,
        "total_arquivos": total,
    });
    zip.start_file("backup_manifest.json", options)?;
    zip.write_all(serde_json::to_string_pretty(&manifesto)?.as_bytes())?;
    zip.finish()?;

    Ok(BackupResultado {
        caminho: Some(destino.to_string_lossy().to_string()),
        arquivos: total,
        arquivos_importados: 0,
        conflitos: Vec::new(),
        backup_seguranca: None,
    })
}

pub(crate) fn adicionar_pasta_zip(
    zip: &mut ZipWriter<fs::File>,
    pasta: &Path,
    nome_raiz: &str,
    options: SimpleFileOptions,
    total: &mut usize,
) -> io::Result<()> {
    for entrada in fs::read_dir(pasta)? {
        let entrada = entrada?;
        let caminho = entrada.path();
        if caminho.is_dir() {
            adicionar_pasta_zip(zip, &caminho, nome_raiz, options, total)?;
        } else if caminho.is_file() {
            adicionar_arquivo_zip(zip, &caminho, nome_raiz, options, total)?;
        }
    }
    Ok(())
}

pub(crate) fn adicionar_arquivo_zip(
    zip: &mut ZipWriter<fs::File>,
    caminho: &Path,
    nome_raiz: &str,
    options: SimpleFileOptions,
    total: &mut usize,
) -> io::Result<()> {
    let relativo = caminho
        .strip_prefix(app_base_dir()?.join(nome_raiz))
        .unwrap_or(caminho);
    let nome_zip = format!(
        "{}/{}",
        nome_raiz,
        relativo.to_string_lossy().replace('\\', "/")
    );
    zip.start_file(nome_zip, options)?;
    let bytes = fs::read(caminho)?;
    zip.write_all(&bytes)?;
    *total += 1;
    Ok(())
}

pub(crate) fn importar_backup_interno(input: BackupImportInput) -> io::Result<BackupResultado> {
    if !input.nome.to_lowercase().ends_with(".zip") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Selecione um arquivo .zip de backup.",
        ));
    }

    let tmp = backups_dir()?.join(format!("_importacao_{}", Local::now().timestamp_millis()));
    fs::create_dir_all(&tmp)?;
    let resultado = (|| {
        let mut zip = ZipArchive::new(Cursor::new(input.bytes))?;
        let nomes = zip.file_names().map(str::to_string).collect::<Vec<_>>();
        if !nomes.iter().any(|nome| nome == "backup_manifest.json") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Backup invalido: manifesto nao encontrado.",
            ));
        }
        let nomes_validos = nomes
            .into_iter()
            .filter(|nome| nome.starts_with("dados/") || nome.starts_with("config/"))
            .collect::<Vec<_>>();
        if nomes_validos.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Backup invalido: nenhum dado encontrado.",
            ));
        }

        for nome in nomes_validos {
            validar_entrada_backup(&nome)?;
            let mut arquivo = zip.by_name(&nome)?;
            if arquivo.is_dir() {
                continue;
            }
            let destino = tmp.join(Path::new(&nome));
            if let Some(parent) = destino.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut saida = fs::File::create(destino)?;
            io::copy(&mut arquivo, &mut saida)?;
        }

        if input.modo == "substituir" {
            let seguranca = exportar_backup_interno().ok().and_then(|info| info.caminho);
            for nome in ["dados", "config"] {
                let destino = app_base_dir()?.join(nome);
                if destino.exists() {
                    fs::remove_dir_all(&destino)?;
                }
                let origem = tmp.join(nome);
                if origem.exists() {
                    copiar_recursivamente(&origem, &destino)?;
                } else {
                    fs::create_dir_all(&destino)?;
                }
            }
            preparar_base_portatil(&app_base_dir()?)?;
            Ok(BackupResultado {
                caminho: None,
                arquivos: 0,
                arquivos_importados: 0,
                conflitos: Vec::new(),
                backup_seguranca: seguranca,
            })
        } else {
            let mut importados = 0;
            let mut conflitos = Vec::new();
            for nome in ["dados", "config"] {
                let origem = tmp.join(nome);
                let destino = app_base_dir()?.join(nome);
                mesclar_recursivamente(&origem, &destino, nome, &mut importados, &mut conflitos)?;
            }
            Ok(BackupResultado {
                caminho: None,
                arquivos: 0,
                arquivos_importados: importados,
                conflitos,
                backup_seguranca: None,
            })
        }
    })();

    let _ = fs::remove_dir_all(&tmp);
    resultado
}

pub(crate) fn validar_entrada_backup(nome: &str) -> io::Result<()> {
    let caminho = Path::new(nome);
    if caminho.is_absolute()
        || caminho
            .components()
            .any(|parte| matches!(parte, std::path::Component::ParentDir))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Backup contem caminho invalido.",
        ));
    }
    if !nome.starts_with("dados/") && !nome.starts_with("config/") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Backup contem arquivo fora das pastas esperadas.",
        ));
    }
    Ok(())
}
