
// Sincronização por pasta compartilhada (estado do grupo e dados institucionais) e merges.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use chrono::Local;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    env, fs, io,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};


// Async sem trava de dados: só toca a pasta de sincronização (OneDrive), com
// arquivo próprio por dispositivo e gravações atômicas.
#[tauri::command(async)]
pub(crate) fn publicar_estado_sincronizacao(input: SyncStateInput) -> Result<SyncStateResultado, String> {
    let raiz = validar_pasta_sincronizacao(&input.pasta)?;
    let estado = raiz.join("state");
    let dispositivos = raiz.join("devices");
    fs::create_dir_all(&estado).map_err(|err| err.to_string())?;
    fs::create_dir_all(&dispositivos).map_err(|err| err.to_string())?;

    let conteudo = serde_json::to_vec_pretty(&input.payload).map_err(|err| err.to_string())?;

    // Arquivo por dispositivo: cada instalação escreve apenas o SEU próprio estado.
    // Isso evita a corrida de leitura-modificação-escrita do arquivo único, em que
    // um dispositivo sobrescrevia eventos/tarefas recém-criados por outro.
    let peers = estado.join("peers");
    fs::create_dir_all(&peers).map_err(|err| err.to_string())?;
    let peer_destino = peers.join(format!("{}.json", nome_arquivo_seguro(&input.device_id)));
    let peer_tmp = peers.join(format!(
        "{}.{}.tmp",
        nome_arquivo_seguro(&input.device_id),
        Local::now().timestamp_millis()
    ));
    fs::write(&peer_tmp, &conteudo).map_err(|err| err.to_string())?;
    fs::rename(&peer_tmp, &peer_destino).map_err(|err| err.to_string())?;

    // O arquivo único legado (state/workspace-state.json) não é mais gravado.
    // Todos os dispositivos regravando o mesmo arquivo a cada ciclo fazia o
    // OneDrive gerar uma cópia de conflito (~1 MB) a cada colisão — milhares
    // por mês na pasta do grupo. Versões desde a v2.7.0 já leem state/peers/.

    if let Some(profile) = input.payload.get("profile") {
        let perfil_path = dispositivos.join(format!("{}.json", nome_arquivo_seguro(&input.device_id)));
        let perfil = serde_json::to_vec_pretty(profile).map_err(|err| err.to_string())?;
        fs::write(perfil_path, perfil).map_err(|err| err.to_string())?;
    }

    Ok(SyncStateResultado {
        caminho: peer_destino.to_string_lossy().to_string(),
        atualizado_em: Local::now().to_rfc3339(),
    })
}

/// Lê o estado de TODOS os dispositivos (arquivos em state/peers/) além do
/// arquivo único legado. Retorna a lista de payloads, ignorando o próprio
/// dispositivo. A mesclagem é feita no frontend (último a atualizar vence).
#[tauri::command(async)]
pub(crate) fn carregar_estados_sincronizacao(
    pasta: String,
    device_id: String,
) -> Result<Vec<Value>, String> {
    let raiz = validar_pasta_sincronizacao(&pasta)?;
    let estado = raiz.join("state");
    let peers = estado.join("peers");
    let proprio = format!("{}.json", nome_arquivo_seguro(&device_id));
    let mut payloads = Vec::new();

    if peers.is_dir() {
        let mut entradas: Vec<PathBuf> = fs::read_dir(&peers)
            .map_err(|err| err.to_string())?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.extension().and_then(|e| e.to_str()) == Some("json")
                    && p.file_name().and_then(|n| n.to_str()) != Some(proprio.as_str())
                    // Cópias de conflito do OneDrive ("<device-id>-NOMEPC.json")
                    // são fotografias velhas do estado de alguém: aplicá-las
                    // ressuscitava dispositivos aposentados no roster e fazia o
                    // ciclo processar ~1 MB a mais por arquivo. Aqui só
                    // ignoramos — apagar é decisão de quem é dono da pasta, que
                    // é compartilhada com o grupo todo.
                    && !eh_copia_de_conflito_sync(p)
            })
            .collect();
        entradas.sort();
        for caminho in entradas {
            if let Ok(texto) = fs::read_to_string(&caminho) {
                if let Ok(valor) = serde_json::from_str::<Value>(&texto) {
                    payloads.push(valor);
                }
            }
        }
    }

    // Compatibilidade: inclui também o arquivo único legado, para não perder
    // alterações de coordenadores que ainda usam versões antigas do app (que
    // só escrevem workspace-state.json). A mesclagem por updatedAt no frontend
    // ignora dados mais antigos, então incluí-lo sempre é seguro.
    let arquivo = estado.join("workspace-state.json");
    if arquivo.exists() {
        if let Ok(texto) = fs::read_to_string(&arquivo) {
            if let Ok(valor) = serde_json::from_str::<Value>(&texto) {
                payloads.push(valor);
            }
        }
    }

    Ok(payloads)
}

// O app do pendrive de conselho não participa da sincronização institucional
// (ver rodando_do_pendrive_de_conselho): os dados voltam pela reintegração.
fn sem_sincronizacao_no_pendrive() -> SyncInstitutionalResultado {
    SyncInstitutionalResultado {
        caminho: None,
        arquivos: 0,
        atualizado_em: String::new(),
        backup_seguranca: None,
    }
}

// Formato 2 da sincronização institucional (a partir da 4.7.0): nenhum
// arquivo da pasta do grupo tem dois donos.
//
// - `state/institutional/<device_id>.json`: o manifesto DESTE computador
//   (caminho relativo -> "tamanho:fnv" de cada arquivo de `dados/`). Só ele
//   grava esse arquivo.
// - `state/blobs/<fnv>-<tamanho>`: o conteúdo dos arquivos, nomeado pelo
//   próprio conteúdo. Um blob nunca é reescrito: se dois computadores têm o
//   mesmo arquivo, gravam o mesmo nome com os mesmos bytes, e o grupo guarda
//   uma cópia só (as fotos não ficam repetidas por computador).
//
// Até a 4.6.6 todos regravavam a mesma `state/institutional-data/`, e o
// OneDrive criava uma cópia de conflito a cada colisão
// (`institutional-data-NOMEPC`). Aquela pasta continua sendo lida, e só é
// gravada enquanto algum colega ativo ainda está numa versão antiga (ver
// precisa_publicar_pasta_antiga).
pub(crate) const FORMATO_SINCRONIZACAO_INSTITUCIONAL: u64 = 2;
const TIPO_MANIFESTO_DISPOSITIVO: &str = "coordenacaoop-institutional-manifest";

/// Manifesto de um computador que não publica há mais que isso é de uma
/// instalação aposentada: não é mais puxado, e os blobs só dele podem ser
/// apagados.
const VALIDADE_MANIFESTO_DISPOSITIVO_MS: i64 = 90 * 24 * 60 * 60 * 1000;

/// Um colega numa versão antiga que sincronizou neste intervalo ainda
/// depende da pasta `institutional-data`.
const JANELA_COLEGA_VERSAO_ANTIGA_MS: i64 = 14 * 24 * 60 * 60 * 1000;

/// Blob sem nenhum manifesto apontando para ele é apagado só depois disso:
/// o manifesto novo de um colega pode ainda estar chegando pela nuvem.
const IDADE_BLOB_SEM_USO_MS: i64 = 3 * 24 * 60 * 60 * 1000;

pub(crate) fn nome_do_blob(descricao: &str) -> String {
    let (tamanho, hash) = descricao.split_once(':').unwrap_or((descricao, ""));
    format!("{}-{}", nome_arquivo_seguro(hash), nome_arquivo_seguro(tamanho))
}

fn manifesto_do_dispositivo_path(estado: &Path, device_id: &str) -> PathBuf {
    estado
        .join("institutional")
        .join(format!("{}.json", nome_arquivo_seguro(device_id)))
}

fn ler_json(caminho: &Path) -> Option<Value> {
    fs::read(caminho)
        .ok()
        .and_then(|bytes| serde_json::from_str::<Value>(sem_lixo_no_fim(&String::from_utf8_lossy(&bytes))).ok())
}

fn milissegundos_rfc3339(valor: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(valor)
        .ok()
        .map(|data| data.timestamp_millis())
}

fn gravar_atomico(destino: &Path, conteudo: &[u8]) -> io::Result<()> {
    if let Some(pai) = destino.parent() {
        fs::create_dir_all(pai)?;
    }
    let nome = destino.file_name().and_then(|n| n.to_str()).unwrap_or("arquivo");
    let tmp = destino.with_file_name(format!("{nome}.{}.tmp", Local::now().timestamp_millis()));
    fs::write(&tmp, conteudo)?;
    if let Err(err) = fs::rename(&tmp, destino) {
        let _ = fs::remove_file(&tmp);
        return Err(err);
    }
    Ok(())
}

/// Grava em `state/blobs/` o que ainda não está lá. Devolve quantos foram
/// gravados.
pub(crate) fn gravar_blobs(
    origem: &Path,
    blobs: &Path,
    inventario: &BTreeMap<String, String>,
) -> io::Result<usize> {
    fs::create_dir_all(blobs)?;
    let mut gravados = 0;
    for (relativo, descricao) in inventario {
        let alvo = blobs.join(nome_do_blob(descricao));
        let ja_esta_la = fs::metadata(&alvo)
            .map(|meta| meta.is_file() && Some(meta.len()) == tamanho_da_descricao(descricao))
            .unwrap_or(false);
        if ja_esta_la {
            continue;
        }
        let bytes = fs::read(origem.join(relativo))?;
        // O arquivo pode ter mudado entre o inventário e agora; um blob com
        // nome que não bate com o conteúdo enganaria os colegas.
        if &descrever_conteudo(&bytes) != descricao {
            return Err(io::Error::other(format!(
                "{relativo} mudou durante a publicação; tenta de novo no próximo ciclo"
            )));
        }
        gravar_atomico(&alvo, &bytes)?;
        gravados += 1;
    }
    Ok(gravados)
}

/// Um manifesto de computador lido da pasta do grupo.
pub(crate) struct ManifestoDispositivo {
    pub(crate) device_id: String,
    pub(crate) atualizado_em: String,
    pub(crate) conteudo: BTreeMap<String, String>,
}

/// Lê `state/institutional/*.json`, sem cópias de conflito, sem o próprio
/// computador (quando `proprio` é informado) e sem instalações aposentadas.
pub(crate) fn listar_manifestos_dispositivos(
    estado: &Path,
    proprio: Option<&str>,
    agora_ms: i64,
) -> Vec<ManifestoDispositivo> {
    let pasta = estado.join("institutional");
    let Ok(entradas) = fs::read_dir(&pasta) else {
        return Vec::new();
    };
    let proprio = proprio.map(|id| format!("{}.json", nome_arquivo_seguro(id)));
    let mut caminhos: Vec<PathBuf> = entradas
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("json")
                && p.file_name().and_then(|n| n.to_str()) != proprio.as_deref()
                && !eh_copia_de_conflito_sync(p)
        })
        .collect();
    caminhos.sort();
    caminhos
        .into_iter()
        .filter_map(|caminho| {
            let manifesto = ler_json(&caminho)?;
            if manifesto.get("tipo").and_then(Value::as_str) != Some(TIPO_MANIFESTO_DISPOSITIVO) {
                return None;
            }
            let atualizado_em = manifesto.get("atualizado_em")?.as_str()?.to_string();
            let publicado_ms = milissegundos_rfc3339(&atualizado_em)?;
            if agora_ms - publicado_ms > VALIDADE_MANIFESTO_DISPOSITIVO_MS {
                return None;
            }
            let device_id = manifesto
                .get("device_id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| {
                    caminho.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_string()
                });
            Some(ManifestoDispositivo {
                device_id,
                atualizado_em,
                conteudo: conteudo_do_manifesto(Some(&manifesto)),
            })
        })
        .collect()
}

/// Algum colega (outro computador) ainda numa versão que só conhece
/// `institutional-data` sincronizou nas últimas duas semanas? Quem está na
/// versão nova anota `formatoSincronizacao` no próprio estado em
/// `state/peers/`; quem não anota é antigo.
pub(crate) fn precisa_publicar_pasta_antiga(estado: &Path, device_id: &str, agora_ms: i64) -> bool {
    let peers = estado.join("peers");
    let Ok(entradas) = fs::read_dir(&peers) else {
        return false;
    };
    let proprio = format!("{}.json", nome_arquivo_seguro(device_id));
    entradas.flatten().map(|e| e.path()).any(|caminho| {
        if caminho.extension().and_then(|e| e.to_str()) != Some("json")
            || caminho.file_name().and_then(|n| n.to_str()) == Some(proprio.as_str())
            || eh_copia_de_conflito_sync(&caminho)
        {
            return false;
        }
        let Some(payload) = ler_json(&caminho) else {
            return false;
        };
        let formato = payload.get("formatoSincronizacao").and_then(Value::as_u64).unwrap_or(1);
        let gerado_ms = payload
            .get("generatedAt")
            .and_then(Value::as_str)
            .and_then(milissegundos_rfc3339)
            .unwrap_or(0);
        formato < FORMATO_SINCRONIZACAO_INSTITUCIONAL && agora_ms - gerado_ms <= JANELA_COLEGA_VERSAO_ANTIGA_MS
    })
}

/// Apaga blobs que nenhum manifesto em uso aponta e que já têm alguns dias.
/// Apagar não gera cópia de conflito, e um blob apagado por engano é
/// regravado pelo dono na próxima publicação (gravar_blobs confere se está
/// lá).
pub(crate) fn limpar_blobs_sem_uso(estado: &Path, proprio: &BTreeMap<String, String>, agora_ms: i64) {
    let blobs = estado.join("blobs");
    let Ok(entradas) = fs::read_dir(&blobs) else {
        return;
    };
    let mut em_uso: std::collections::BTreeSet<String> =
        proprio.values().map(|descricao| nome_do_blob(descricao)).collect();
    for manifesto in listar_manifestos_dispositivos(estado, None, agora_ms) {
        em_uso.extend(manifesto.conteudo.values().map(|descricao| nome_do_blob(descricao)));
    }
    for entrada in entradas.flatten() {
        let nome = entrada.file_name().to_string_lossy().to_string();
        if em_uso.contains(&nome) {
            continue;
        }
        let idade_ms = entrada
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modificado| modificado.elapsed().ok())
            .map(|idade| idade.as_millis() as i64)
            .unwrap_or(0);
        if idade_ms >= IDADE_BLOB_SEM_USO_MS && entrada.path().is_file() {
            let _ = fs::remove_file(entrada.path());
        }
    }
}

#[tauri::command(async)]
pub(crate) fn publicar_dados_institucionais_sincronizacao(
    input: SyncInstitutionalInput,
) -> Result<SyncInstitutionalResultado, String> {
    let _dados = travar_dados();
    if rodando_do_pendrive_de_conselho() {
        return Ok(sem_sincronizacao_no_pendrive());
    }
    let raiz = validar_pasta_sincronizacao(&input.pasta)?;
    let estado = raiz.join("state");
    fs::create_dir_all(&estado).map_err(|err| err.to_string())?;
    let origem = data_dir().map_err(|err| err.to_string())?;
    let agora_ms = Local::now().timestamp_millis();

    let inventario = inventariar_dados_institucionais(&origem).map_err(|err| err.to_string())?;
    let total = inventario.len();
    let manifesto_path = manifesto_do_dispositivo_path(&estado, &input.device_id);
    let manifesto_atual = ler_json(&manifesto_path);
    let atual_igual = manifesto_atual.is_some() && conteudo_do_manifesto(manifesto_atual.as_ref()) == inventario;

    let atualizado_em = if atual_igual {
        manifesto_atual
            .as_ref()
            .and_then(|dados| dados.get("atualizado_em").and_then(Value::as_str))
            .unwrap_or("")
            .to_string()
    } else {
        // Blobs primeiro, manifesto por último: quem lê o manifesto novo
        // sabe quais blobs esperar.
        gravar_blobs(&origem, &estado.join("blobs"), &inventario).map_err(|err| err.to_string())?;
        let atualizado_em = Local::now().to_rfc3339();
        let manifesto = serde_json::json!({
            "app": "CoordenacaoOP",
            "tipo": TIPO_MANIFESTO_DISPOSITIVO,
            "formato": FORMATO_SINCRONIZACAO_INSTITUCIONAL,
            "versao_app": env!("CARGO_PKG_VERSION"),
            "device_id": input.device_id,
            "atualizado_em": atualizado_em,
            "total_arquivos": total,
            "conteudo": inventario,
        });
        let bytes = serde_json::to_vec_pretty(&manifesto).map_err(|err| err.to_string())?;
        gravar_atomico(&manifesto_path, &bytes).map_err(|err| err.to_string())?;
        atualizado_em
    };

    if precisa_publicar_pasta_antiga(&estado, &input.device_id, agora_ms) {
        publicar_pasta_antiga(&estado, &origem, &input.device_id, &inventario)?;
    }
    limpar_blobs_sem_uso(&estado, &inventario, agora_ms);

    Ok(SyncInstitutionalResultado {
        caminho: Some(manifesto_path.to_string_lossy().to_string()),
        arquivos: total,
        atualizado_em,
        backup_seguranca: None,
    })
}

/// Publicação no formato da 4.6.6 (`state/institutional-data/`), para os
/// colegas que ainda não atualizaram. O marcador da pasta antiga fica com a
/// data desta publicação, para este computador não puxar de volta o que
/// acabou de publicar.
fn publicar_pasta_antiga(
    estado: &Path,
    origem: &Path,
    device_id: &str,
    inventario: &BTreeMap<String, String>,
) -> Result<(), String> {
    let destino = estado.join("institutional-data");
    let assinatura = assinatura_diretorio(origem).map_err(|err| err.to_string())?;
    let manifesto_atual = ler_json(&destino.join("manifest.json"));
    if manifesto_atual
        .as_ref()
        .and_then(|dados| dados.get("assinatura").and_then(Value::as_str))
        == Some(assinatura.as_str())
    {
        let atualizado_em = manifesto_atual
            .as_ref()
            .and_then(|dados| dados.get("atualizado_em").and_then(Value::as_str))
            .unwrap_or("")
            .to_string();
        if !atualizado_em.is_empty() {
            salvar_marcador_sincronizacao_institucional(&atualizado_em)
                .map_err(|err| err.to_string())?;
        }
        return Ok(());
    }

    // Sobras das publicações por troca de pasta (até a 4.6.6) e de
    // publicações interrompidas.
    limpar_temporarios_institucionais_antigos(estado, Local::now().timestamp_millis());

    let anterior = conteudo_do_manifesto(manifesto_atual.as_ref());
    let atualizado_em = Local::now().to_rfc3339();
    let montagem = (|| -> io::Result<()> {
        espelhar_dados_institucionais(origem, &destino.join("dados"), inventario, &anterior)?;
        let manifesto = serde_json::json!({
            "app": "CoordenacaoOP",
            "tipo": "coordenacaoop-institutional-data",
            "formato": 1,
            "versao_app": env!("CARGO_PKG_VERSION"),
            "device_id": device_id,
            "atualizado_em": atualizado_em,
            "assinatura": assinatura,
            "total_arquivos": inventario.len(),
            "conteudo": inventario,
        });
        // O manifesto vai por último: quem o lê com a data nova sabe, pelo
        // `conteudo`, quais arquivos ainda precisa esperar chegar.
        gravar_atomico(&destino.join("manifest.json"), &serde_json::to_vec_pretty(&manifesto)?)
    })();
    // Se falhar no meio (OneDrive travando um arquivo), o manifesto antigo
    // continua lá: os colegas veem arquivos que não batem com ele e esperam,
    // e a próxima publicação daqui completa o que faltou.
    montagem.map_err(|err| err.to_string())?;
    salvar_marcador_sincronizacao_institucional(&atualizado_em).map_err(|err| err.to_string())
}

/// De onde vêm os dados de um pull: o manifesto de um colega (formato 2) ou
/// a pasta antiga `institutional-data`.
enum OrigemDados {
    Dispositivo(ManifestoDispositivo),
    PastaAntiga { atualizado_em: String, manifesto: Option<Value> },
}

impl OrigemDados {
    fn atualizado_em(&self) -> &str {
        match self {
            OrigemDados::Dispositivo(manifesto) => &manifesto.atualizado_em,
            OrigemDados::PastaAntiga { atualizado_em, .. } => atualizado_em,
        }
    }
}

fn marcadores_dispositivos_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join("sync_institutional_dispositivos.json"))
}

/// device_id -> `atualizado_em` do último manifesto daquele colega já
/// mesclado aqui.
fn ler_marcadores_dispositivos() -> BTreeMap<String, String> {
    marcadores_dispositivos_path()
        .ok()
        .and_then(|path| ler_json(&path))
        .and_then(|valor| serde_json::from_value(valor).ok())
        .unwrap_or_default()
}

fn salvar_marcadores_dispositivos(marcadores: &BTreeMap<String, String>) -> io::Result<()> {
    let bytes = serde_json::to_vec_pretty(marcadores).map_err(|e| io::Error::other(e.to_string()))?;
    gravar_atomico(&marcadores_dispositivos_path()?, &bytes)
}

/// Monta em `temporario` os arquivos do manifesto de um colega, tirados de
/// `state/blobs/`. Devolve os que ainda não chegaram (ou chegaram pela
/// metade); esses ficam de fora.
pub(crate) fn materializar_manifesto(
    conteudo: &BTreeMap<String, String>,
    blobs: &Path,
    temporario: &Path,
    total: &mut usize,
) -> io::Result<Vec<String>> {
    fs::create_dir_all(temporario)?;
    let mut faltando = Vec::new();
    for (relativo, descricao) in conteudo {
        if !relativo.contains('/') && eh_arquivo_da_maquina(relativo) {
            continue;
        }
        let Ok(bytes) = fs::read(blobs.join(nome_do_blob(descricao))) else {
            faltando.push(relativo.clone());
            continue;
        };
        if &descrever_conteudo(&bytes) != descricao {
            faltando.push(relativo.clone());
            continue;
        }
        let alvo = temporario.join(relativo);
        if let Some(pai) = alvo.parent() {
            fs::create_dir_all(pai)?;
        }
        fs::write(alvo, bytes)?;
        *total += 1;
    }
    Ok(faltando)
}

#[tauri::command(async)]
pub(crate) fn carregar_dados_institucionais_sincronizacao(
    pasta: String,
    device_id: Option<String>,
) -> Result<SyncInstitutionalResultado, String> {
    let _dados = travar_dados();
    if rodando_do_pendrive_de_conselho() {
        return Ok(sem_sincronizacao_no_pendrive());
    }
    let raiz = validar_pasta_sincronizacao(&pasta)?;
    let estado = raiz.join("state");
    let agora = Local::now();
    let agora_ms = agora.timestamp_millis();

    let dispositivos = listar_manifestos_dispositivos(&estado, device_id.as_deref(), agora_ms);
    let mut marcadores = ler_marcadores_dispositivos();
    let mut origens: Vec<OrigemDados> = Vec::new();

    let antiga = estado.join("institutional-data");
    let tem_pasta_antiga = antiga.join("dados").exists();
    if tem_pasta_antiga {
        let manifesto = ler_json(&antiga.join("manifest.json"));
        let atualizado_em = manifesto
            .as_ref()
            .and_then(|dados| dados.get("atualizado_em").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| agora.to_rfc3339());
        // Se quem publicou a pasta antiga já está no formato novo (ela é só a
        // cópia de cortesia para os colegas desatualizados), o manifesto dele
        // já traz os mesmos dados.
        let publicado_por = manifesto
            .as_ref()
            .and_then(|dados| dados.get("device_id").and_then(Value::as_str))
            .map(str::to_string);
        let publicado_por_formato_novo = publicado_por.as_deref().is_some_and(|autor| {
            Some(autor) == device_id.as_deref() || dispositivos.iter().any(|d| d.device_id == autor)
        });
        if !publicado_por_formato_novo
            && ler_marcador_sincronizacao_institucional().as_deref() != Some(atualizado_em.as_str())
        {
            origens.push(OrigemDados::PastaAntiga { atualizado_em, manifesto });
        }
    }
    let tem_dispositivos = !dispositivos.is_empty();
    for manifesto in dispositivos {
        if marcadores.get(&manifesto.device_id) != Some(&manifesto.atualizado_em) {
            origens.push(OrigemDados::Dispositivo(manifesto));
        }
    }

    if !tem_pasta_antiga && !tem_dispositivos {
        return Ok(SyncInstitutionalResultado {
            caminho: None,
            arquivos: 0,
            atualizado_em: String::new(),
            backup_seguranca: None,
        });
    }
    if origens.is_empty() {
        return Ok(SyncInstitutionalResultado {
            caminho: Some(estado.to_string_lossy().to_string()),
            arquivos: 0,
            atualizado_em: ler_marcador_sincronizacao_institucional().unwrap_or_default(),
            backup_seguranca: None,
        });
    }
    // Do mais antigo para o mais novo: nos arquivos em que o recebido vence
    // por inteiro, fica o do colega que publicou por último.
    origens.sort_by_key(|origem| milissegundos_rfc3339(origem.atualizado_em()).unwrap_or(0));

    let destino = data_dir().map_err(|err| err.to_string())?;
    let base = app_base_dir().map_err(|err| err.to_string())?;
    let mut seguranca = None;
    let mut total = 0;
    let mut atualizado_em = String::new();
    let mut ainda_chegando = 0;
    let mut inventario_local: Option<BTreeMap<String, String>> = None;

    for (indice, origem) in origens.iter().enumerate() {
        let ts = agora_ms + indice as i64;
        let temporario = base.join(format!("dados_sync_tmp_{ts}"));
        if temporario.exists() {
            fs::remove_dir_all(&temporario).map_err(|err| err.to_string())?;
        }
        let recente = publicacao_recente(origem.atualizado_em(), agora);

        // O OneDrive baixa a pasta do grupo arquivo por arquivo, e o manifesto
        // novo pode chegar antes das turmas. Mesclar nessa hora trazia as turmas
        // de antes (conselho sem finalizar, sem perfil da turma) e, como o
        // marcador era salvo, esta máquina não puxava de novo. Sem salvar o
        // marcador, a próxima tentativa confere de novo.
        let faltando = match origem {
            OrigemDados::PastaAntiga { manifesto, .. } => {
                let faltando = manifesto
                    .as_ref()
                    .map(|manifesto| arquivos_ainda_chegando(manifesto, &antiga.join("dados")))
                    .unwrap_or(0);
                if faltando == 0 || !recente {
                    copiar_dados_institucionais(&antiga.join("dados"), &temporario, &mut total)
                        .map_err(|err| err.to_string())?;
                }
                faltando
            }
            OrigemDados::Dispositivo(manifesto) => {
                // Depois que o grupo converge, o manifesto do colega costuma
                // ser igual ao que já temos: marca como visto sem refazer o
                // pull inteiro (cópia de `dados/` e backup).
                if inventario_local.is_none() {
                    inventario_local = Some(inventariar_dados_institucionais(&destino).map_err(|err| err.to_string())?);
                }
                let nada_novo = inventario_local.as_ref().is_some_and(|local| {
                    manifesto.conteudo.iter().all(|(relativo, descricao)| {
                        (!relativo.contains('/') && eh_arquivo_da_maquina(relativo))
                            || local.get(relativo) == Some(descricao)
                    })
                });
                if nada_novo {
                    marcadores.insert(manifesto.device_id.clone(), manifesto.atualizado_em.clone());
                    salvar_marcadores_dispositivos(&marcadores).map_err(|err| err.to_string())?;
                    continue;
                }
                let mut copiados = 0;
                let faltando = materializar_manifesto(&manifesto.conteudo, &estado.join("blobs"), &temporario, &mut copiados)
                    .map_err(|err| err.to_string())?;
                if faltando.is_empty() || !recente {
                    total += copiados;
                    // Blob que não chegou nem depois da espera: fica a versão
                    // desta máquina, em vez de o arquivo sumir daqui.
                    for relativo in &faltando {
                        let local = destino.join(relativo);
                        if local.is_file() {
                            let alvo = temporario.join(relativo);
                            if let Some(pai) = alvo.parent() {
                                fs::create_dir_all(pai).map_err(|err| err.to_string())?;
                            }
                            fs::copy(&local, &alvo).map_err(|err| err.to_string())?;
                        }
                    }
                }
                faltando.len()
            }
        };
        if faltando > 0 && recente {
            ainda_chegando += faltando;
            let _ = fs::remove_dir_all(&temporario);
            continue;
        }

        if seguranca.is_none() {
            seguranca = Some(
                exportar_backup_interno()
                    .map_err(|err| format!("Não foi possível criar backup de segurança antes da sincronização: {err}"))?
                    .caminho,
            );
        }
        aplicar_dados_recebidos(&temporario, &destino, &base.join(format!("dados_sync_old_{ts}")))
            .map_err(|err| err.to_string())?;
        inventario_local = None;
        match origem {
            OrigemDados::PastaAntiga { atualizado_em, .. } => {
                salvar_marcador_sincronizacao_institucional(atualizado_em).map_err(|err| err.to_string())?;
            }
            OrigemDados::Dispositivo(manifesto) => {
                marcadores.insert(manifesto.device_id.clone(), manifesto.atualizado_em.clone());
                salvar_marcadores_dispositivos(&marcadores).map_err(|err| err.to_string())?;
            }
        }
        atualizado_em = origem.atualizado_em().to_string();
    }

    if seguranca.is_none() && ainda_chegando > 0 {
        return Err(format!(
            "Os dados do grupo ainda estão chegando pela pasta compartilhada ({ainda_chegando} arquivo(s) incompleto(s)). \
             O app tenta de novo sozinho em alguns minutos."
        ));
    }

    Ok(SyncInstitutionalResultado {
        caminho: Some(estado.to_string_lossy().to_string()),
        arquivos: total,
        atualizado_em,
        backup_seguranca: seguranca.flatten(),
    })
}

/// Mescla o que chegou de um colega (já montado em `temporario`) com
/// `dados/` desta máquina e põe o resultado no lugar de `dados/`.
fn aplicar_dados_recebidos(temporario: &Path, destino: &Path, backup_destino: &Path) -> io::Result<()> {
    // `dados/` é substituído inteiro pelo temporário logo abaixo, então o
    // espelho desta máquina precisa ser levado junto — senão o app volta com o
    // quadro kanban e o calendário vazios depois de cada pull. Peers em versão
    // antiga ainda publicam o espelho DELES; copiar o local por cima garante
    // que o de fora nunca vença. Ver eh_estado_ui_da_maquina.
    for nome in std::iter::once("estado_ui.json").chain(ARQUIVOS_PENDRIVE_DA_MAQUINA) {
        let local = destino.join(nome);
        let recebido = temporario.join(nome);
        if local.is_file() {
            fs::copy(&local, &recebido)?;
        } else if recebido.is_file() && nome != "estado_ui.json" {
            fs::remove_file(&recebido)?;
        }
    }

    // Remove cópias de conflito criadas pelo OneDrive dentro do estado recebido
    // (ex.: "turma_X-NomePC.json"), que viravam turmas duplicadas na listagem.
    remover_copias_de_conflito_sync(&temporario.join("persistidos"))?;

    // Merge: preserva turmas criadas localmente e mescla campos por timestamp
    mesclar_diretorio_persistidos(&destino.join("persistidos"), &temporario.join("persistidos"))?;

    // O merge acima casa arquivos pelo nome exato. Se um peer com versão mais
    // antiga do app gravou o código da turma sem formatação ("2a SERIE A") e
    // este dispositivo já tinha a mesma turma com o código formatado
    // ("2ª Série A"), os nomes de arquivo divergem e o merge por nome não os
    // une — a turma passava a aparecer duplicada na listagem. Aqui agrupamos
    // por ano + código normalizado (ignorando acentos/maiúsculas) e mesclamos
    // qualquer grupo com mais de um arquivo.
    desduplicar_turmas_por_codigo(&temporario.join("persistidos"))?;

    // Une as fotos locais às recebidas (sem perder fotos só locais).
    mesclar_diretorio_fotos(&destino.join("fotos"), &temporario.join("fotos"))?;

    // Preserva planilha_automatica_id/apps_script_projeto_id/
    // apps_script_deployment_id do PEI/Planejamento quando só existem
    // localmente — sem isso, puxar dados institucionais de um colega cuja
    // config chegou "incompleta" (ex.: só adotada via sincronização de
    // grupo, sem esses IDs — ver WebAppConfigSync em workgroupSync.ts)
    // sobrescrevia esses campos com vazio nesta máquina, mesmo sendo ela a
    // dona original do Web App. Ver mesclar_config_webapp.
    mesclar_config_webapp(&destino.join("pei").join("config.json"), &temporario.join("pei").join("config.json"))?;
    mesclar_config_webapp(
        &destino.join("planejamento").join("config.json"),
        &temporario.join("planejamento").join("config.json"),
    )?;

    // Renomeia o diretório atual para backup antes de colocar o novo no lugar.
    // Se o segundo rename falhar, o original é restaurado — sem perda de dados.
    if destino.exists() {
        fs::rename(destino, backup_destino)?;
    }
    if let Err(err) = fs::rename(temporario, destino) {
        if backup_destino.exists() {
            let _ = fs::rename(backup_destino, destino);
        }
        return Err(err);
    }
    let _ = fs::remove_dir_all(backup_destino);
    preparar_base_portatil(&app_base_dir()?)
}

pub(crate) fn validar_pasta_sincronizacao(pasta: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(pasta.trim());
    if pasta.trim().is_empty() {
        return Err("Escolha uma pasta compartilhada para a sincronização.".to_string());
    }
    if !path.exists() {
        return Err("A pasta de sincronização não existe.".to_string());
    }
    if !path.is_dir() {
        return Err("O caminho de sincronização precisa ser uma pasta.".to_string());
    }
    Ok(path)
}

pub(crate) fn nome_arquivo_seguro(valor: &str) -> String {
    let normalizado = valor
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if normalizado.is_empty() {
        "instalacao".to_string()
    } else {
        normalizado
    }
}

pub(crate) fn mesclar_recursivamente(
    origem: &Path,
    destino: &Path,
    raiz: &str,
    importados: &mut usize,
    conflitos: &mut Vec<String>,
) -> io::Result<()> {
    if !origem.exists() {
        return Ok(());
    }
    fs::create_dir_all(destino)?;
    for entrada in fs::read_dir(origem)? {
        let entrada = entrada?;
        let caminho_origem = entrada.path();
        let caminho_destino = destino.join(entrada.file_name());
        if caminho_origem.is_dir() {
            mesclar_recursivamente(
                &caminho_origem,
                &caminho_destino,
                raiz,
                importados,
                conflitos,
            )?;
        } else if caminho_destino.exists() {
            let relativo = caminho_destino
                .strip_prefix(app_base_dir()?)
                .unwrap_or(&caminho_destino);
            conflitos.push(format!("{}/{}", raiz, relativo.to_string_lossy()));
        } else {
            if let Some(parent) = caminho_destino.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&caminho_origem, &caminho_destino)?;
            *importados += 1;
        }
    }
    Ok(())
}

pub(crate) fn copiar_recursivamente(origem: &Path, destino: &Path) -> io::Result<()> {
    if origem.is_dir() {
        fs::create_dir_all(destino)?;
        for entrada in fs::read_dir(origem)? {
            let entrada = entrada?;
            let origem_item = entrada.path();
            let destino_item = destino.join(entrada.file_name());
            copiar_recursivamente(&origem_item, &destino_item)?;
        }
    } else {
        if let Some(parent) = destino.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(origem, destino)?;
    }
    Ok(())
}

/// `dados/estado_ui.json` é o espelho do localStorage DESTA máquina (quadro
/// kanban, calendário, caches de PEI/Planejamento, roster com avatares) e não
/// tem nada a fazer na sincronização institucional:
///
/// 1. Ele muda a cada ciclo de sincronização (~45 s). Como entrava na
///    `assinatura_diretorio`, a assinatura NUNCA coincidia com a publicada, e
///    o app republicava os 570 MB de `dados/` a cada 15 minutos para sempre —
///    o que, do outro lado, disparava um pull completo com backup de 570 MB
///    em cada peer. Foi assim que a pasta de backups chegou a 24 GB.
/// 2. No pull, `dados/` é substituído inteiro pelo diretório temporário, então
///    o espelho do colega sobrescrevia o desta máquina.
/// 3. As cópias de conflito do OneDrive (`estado_ui-NOMEPC.json`) nasciam
///    justamente da disputa de (1) e (2) e iam junto na carona, engordando
///    cada ciclo.
///
/// O kanban e o calendário continuam sincronizando normalmente — isso é feito
/// pelo estado de grupo (`publicar_estado_sincronizacao`), não daqui.
pub(crate) fn eh_estado_ui_da_maquina(nome: &str) -> bool {
    nome == "estado_ui.json"
        || (nome.starts_with("estado_ui-") && nome.ends_with(".json"))
}

/// O controle do pendrive de conselho também é desta máquina: o manifesto
/// (`conselho_pendrive.json`, só existe no pendrive) e a lista de check-outs
/// (`conselhos_externos.json`). Pela sincronização institucional, o manifesto
/// de um pendrive ia parar no computador e o de outro conselho voltava por
/// cima do que estava no pendrive, e a reintegração não trazia mais as turmas.
pub(crate) const ARQUIVOS_PENDRIVE_DA_MAQUINA: [&str; 2] =
    [NOME_MANIFESTO_PENDRIVE, "conselhos_externos.json"];

pub(crate) fn eh_arquivo_da_maquina(nome: &str) -> bool {
    eh_estado_ui_da_maquina(nome) || ARQUIVOS_PENDRIVE_DA_MAQUINA.contains(&nome)
}

/// Copia `dados/` para a sincronização institucional pulando, na raiz, os
/// arquivos que são locais da máquina (ver `eh_estado_ui_da_maquina`).
/// Só a raiz é filtrada: subpastas (fotos, persistidos, relatórios) vão
/// inteiras.
pub(crate) fn copiar_dados_institucionais(
    origem: &Path,
    destino: &Path,
    total: &mut usize,
) -> io::Result<()> {
    fs::create_dir_all(destino)?;
    for entrada in fs::read_dir(origem)? {
        let entrada = entrada?;
        let nome = entrada.file_name();
        if eh_arquivo_da_maquina(&nome.to_string_lossy()) {
            continue;
        }
        copiar_recursivamente_contando(&entrada.path(), &destino.join(&nome), total)?;
    }
    Ok(())
}

/// Idade a partir da qual um `institutional-data.<ms>[.old].tmp` é tido como
/// sobra. Mais novo que isso pode ser a publicação em andamento de outro
/// coordenador.
const IDADE_SOBRA_INSTITUCIONAL_MS: i64 = 60 * 60 * 1000;

/// Apaga da pasta do grupo as sobras de publicações interrompidas. O nome
/// traz o instante de criação em milissegundos; só o que tem mais de
/// `IDADE_SOBRA_INSTITUCIONAL_MS` é removido.
pub(crate) fn limpar_temporarios_institucionais_antigos(estado: &Path, agora_ms: i64) {
    let Ok(entradas) = fs::read_dir(estado) else {
        return;
    };
    for entrada in entradas.flatten() {
        let nome = entrada.file_name();
        let Some(nome) = nome.to_str() else {
            continue;
        };
        let Some(resto) = nome.strip_prefix("institutional-data.") else {
            continue;
        };
        if !resto.ends_with(".tmp") {
            continue;
        }
        let Some(criado_ms) = resto.split('.').next().and_then(|ms| ms.parse::<i64>().ok()) else {
            continue;
        };
        if agora_ms - criado_ms >= IDADE_SOBRA_INSTITUCIONAL_MS {
            let _ = fs::remove_dir_all(entrada.path());
        }
    }
}

/// Caminho relativo (com `/`) de cada arquivo debaixo de `pasta`.
fn listar_arquivos_relativos(pasta: &Path) -> io::Result<Vec<String>> {
    fn visitar(caminho: &Path, raiz: &Path, saida: &mut Vec<String>) -> io::Result<()> {
        if caminho.is_dir() {
            for entrada in fs::read_dir(caminho)? {
                visitar(&entrada?.path(), raiz, saida)?;
            }
        } else if caminho.is_file() {
            let relativo = caminho
                .strip_prefix(raiz)
                .unwrap_or(caminho)
                .to_string_lossy()
                .replace('\\', "/");
            saida.push(relativo);
        }
        Ok(())
    }
    let mut saida = Vec::new();
    if pasta.exists() {
        visitar(pasta, pasta, &mut saida)?;
    }
    Ok(saida)
}

// FNV-1a de 64 bits: o hasher da std pode mudar entre versões do Rust, e o
// manifesto é lido por instalações compiladas em épocas diferentes.
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

pub(crate) fn descrever_conteudo(bytes: &[u8]) -> String {
    format!("{}:{:016x}", bytes.len(), fnv1a(bytes))
}

fn tamanho_da_descricao(descricao: &str) -> Option<u64> {
    descricao.split(':').next().and_then(|tamanho| tamanho.parse().ok())
}

/// Caminho relativo -> "tamanho:fnv" de cada arquivo de `dados/` que vai para
/// o grupo (os arquivos da máquina, na raiz, ficam de fora). Vai no manifesto
/// como `conteudo` e serve para duas coisas: publicar só o que mudou e, do
/// outro lado, saber se a pasta compartilhada já terminou de chegar.
pub(crate) fn inventariar_dados_institucionais(pasta: &Path) -> io::Result<BTreeMap<String, String>> {
    let mut inventario = BTreeMap::new();
    for relativo in listar_arquivos_relativos(pasta)? {
        if !relativo.contains('/') && eh_arquivo_da_maquina(&relativo) {
            continue;
        }
        let bytes = fs::read(pasta.join(&relativo))?;
        inventario.insert(relativo, descrever_conteudo(&bytes));
    }
    Ok(inventario)
}

fn conteudo_do_manifesto(manifesto: Option<&Value>) -> BTreeMap<String, String> {
    manifesto
        .and_then(|dados| dados.get("conteudo"))
        .and_then(Value::as_object)
        .map(|conteudo| {
            conteudo
                .iter()
                .filter_map(|(caminho, descricao)| Some((caminho.clone(), descricao.as_str()?.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

/// Atualiza `destino` (a cópia de `dados/` na pasta do grupo) para ficar
/// igual a `inventario`, copiando só o que mudou desde a publicação
/// anterior e apagando o que não existe mais. Antes, cada publicação
/// regravava a pasta inteira (1.800 arquivos numa escola real): o OneDrive
/// dos colegas levava muito tempo para baixar tudo de novo, e quem puxava
/// no meio do caminho ficava com turmas de antes (conselhos sem finalizar,
/// sem perfil da turma).
pub(crate) fn espelhar_dados_institucionais(
    origem: &Path,
    destino: &Path,
    inventario: &BTreeMap<String, String>,
    anterior: &BTreeMap<String, String>,
) -> io::Result<usize> {
    fs::create_dir_all(destino)?;
    let mut copiados = 0;
    for (relativo, descricao) in inventario {
        let alvo = destino.join(relativo);
        let ja_esta_la = anterior.get(relativo) == Some(descricao)
            && fs::metadata(&alvo)
                .map(|meta| meta.is_file() && Some(meta.len()) == tamanho_da_descricao(descricao))
                .unwrap_or(false);
        if ja_esta_la {
            continue;
        }
        if let Some(pai) = alvo.parent() {
            fs::create_dir_all(pai)?;
        }
        fs::copy(origem.join(relativo), &alvo)?;
        copiados += 1;
    }
    for relativo in listar_arquivos_relativos(destino)? {
        if !inventario.contains_key(&relativo) {
            fs::remove_file(destino.join(&relativo))?;
        }
    }
    Ok(copiados)
}

/// Por quanto tempo uma publicação incompleta na pasta do grupo é esperada.
/// Passado isso, ela é aplicada como estiver, para um arquivo que nunca
/// chega não travar a sincronização desta máquina para sempre.
const ESPERA_MAXIMA_PUBLICACAO_INCOMPLETA_MS: i64 = 60 * 60 * 1000;

/// Quantos arquivos do manifesto ainda não chegaram (ou chegaram pela metade)
/// em `origem_dados`. Manifestos novos trazem `conteudo` (tamanho + hash);
/// os das versões até a 4.6.6 só trazem a `assinatura`, da qual dá para
/// conferir o tamanho.
pub(crate) fn arquivos_ainda_chegando(manifesto: &Value, origem_dados: &Path) -> usize {
    let conteudo = conteudo_do_manifesto(Some(manifesto));
    if !conteudo.is_empty() {
        return conteudo
            .iter()
            .filter(|(relativo, descricao)| {
                fs::read(origem_dados.join(relativo))
                    .map(|bytes| &descrever_conteudo(&bytes) != *descricao)
                    .unwrap_or(true)
            })
            .count();
    }
    let Some(assinatura) = manifesto.get("assinatura").and_then(Value::as_str) else {
        return 0;
    };
    assinatura
        .split('|')
        .filter(|parte| !parte.is_empty())
        .filter(|parte| {
            let mut pedacos = parte.rsplitn(3, ':');
            let (Some(_hash), Some(tamanho), Some(relativo)) = (pedacos.next(), pedacos.next(), pedacos.next()) else {
                return false;
            };
            let Ok(tamanho) = tamanho.parse::<u64>() else {
                return false;
            };
            fs::metadata(origem_dados.join(relativo))
                .map(|meta| meta.len() != tamanho)
                .unwrap_or(true)
        })
        .count()
}

pub(crate) fn publicacao_recente(atualizado_em: &str, agora: chrono::DateTime<Local>) -> bool {
    chrono::DateTime::parse_from_rfc3339(atualizado_em)
        .map(|publicada| (agora.timestamp_millis() - publicada.timestamp_millis()) < ESPERA_MAXIMA_PUBLICACAO_INCOMPLETA_MS)
        .unwrap_or(false)
}

pub(crate) fn copiar_recursivamente_contando(
    origem: &Path,
    destino: &Path,
    total: &mut usize,
) -> io::Result<()> {
    if origem.is_dir() {
        fs::create_dir_all(destino)?;
        for entrada in fs::read_dir(origem)? {
            let entrada = entrada?;
            let origem_item = entrada.path();
            let destino_item = destino.join(entrada.file_name());
            copiar_recursivamente_contando(&origem_item, &destino_item, total)?;
        }
    } else {
        if let Some(parent) = destino.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(origem, destino)?;
        *total += 1;
    }
    Ok(())
}

pub(crate) fn mesclar_medias(local: &mut serde_json::Map<String, Value>, incoming: &serde_json::Map<String, Value>) {
    for (bimestre, notas_inc) in incoming {
        let Some(notas_inc_obj) = notas_inc.as_object() else { continue; };
        let notas_local = local
            .entry(bimestre.clone())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(notas_local_obj) = notas_local.as_object_mut() else { continue; };
        for (disciplina, nota_inc) in notas_inc_obj {
            let em_inc = nota_inc.get("em").and_then(Value::as_str).unwrap_or("");
            let em_local = notas_local_obj
                .get(disciplina)
                .and_then(|n| n.get("em"))
                .and_then(Value::as_str)
                .unwrap_or("");
            // Incoming wins if: newer timestamp, has timestamp but local doesn't, or neither has timestamp
            if em_inc > em_local || (!em_inc.is_empty() && em_local.is_empty()) || (em_inc.is_empty() && em_local.is_empty()) {
                notas_local_obj.insert(disciplina.clone(), nota_inc.clone());
            }
        }
    }
}

pub(crate) fn mesclar_frequencia_ou_compensacao(
    local: &mut serde_json::Map<String, Value>,
    incoming: &serde_json::Map<String, Value>,
) {
    for (bimestre, valores_inc) in incoming {
        let Some(valores_inc_obj) = valores_inc.as_object() else { continue; };
        let valores_local = local
            .entry(bimestre.clone())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(valores_local_obj) = valores_local.as_object_mut() else { continue; };
        for (disciplina, valor_inc) in valores_inc_obj {
            valores_local_obj.insert(disciplina.clone(), valor_inc.clone());
        }
    }
}

pub(crate) fn mesclar_aluno(local: &mut Value, incoming: &Value) {
    let Some(local_obj) = local.as_object_mut() else { return; };
    let Some(inc_obj) = incoming.as_object() else { return; };

    // frequencia/compensacao_ausencias: mapa por bimestre/disciplina, sem timestamp por
    // célula. Mesclamos por bimestre+disciplina (incoming vence só a célula em conflito)
    // em vez de substituir o objeto inteiro — trocar o objeto inteiro apagava os
    // bimestres que só existiam no lado local (ex.: outro dispositivo já tinha importado
    // o mapão do bimestre 3, e um incoming trazendo só até o bimestre 2 zerava o 3),
    // o que fazia o total de faltas do ano ficar errado depois do sync.
    for campo in &["frequencia", "compensacao_ausencias"] {
        if let Some(inc_valor) = inc_obj.get(*campo).and_then(Value::as_object) {
            let local_valor = local_obj
                .entry(campo.to_string())
                .or_insert_with(|| Value::Object(serde_json::Map::new()));
            if let Some(local_valor_obj) = local_valor.as_object_mut() {
                mesclar_frequencia_ou_compensacao(local_valor_obj, inc_valor);
            }
        }
    }

    // frequencia_percentual ("Fre An(%)"): cumulativo por bimestre, então só deixamos o
    // incoming vencer se ele vier de um bimestre igual ou mais recente que o já
    // armazenado — senão um sync trazendo um mapão mais antigo (de outro dispositivo)
    // fazia a frequência exibida na ficha do aluno regredir.
    let bim_local = local_obj
        .get("frequencia_percentual_bimestre")
        .and_then(Value::as_str)
        .unwrap_or("");
    let bim_inc = inc_obj
        .get("frequencia_percentual_bimestre")
        .and_then(Value::as_str)
        .unwrap_or("");
    // Frequência vinda do Aluno Presente (semanal) não regride para a do mapão:
    // ela é tratada no bloco aluno_presente logo abaixo.
    let fonte_aluno_presente =
        |obj: &serde_json::Map<String, Value>| obj.get("frequencia_fonte").and_then(Value::as_str) == Some("aluno_presente");
    let local_do_aluno_presente = fonte_aluno_presente(local_obj);
    if inc_obj.contains_key("frequencia_percentual")
        && bim_inc >= bim_local
        && !local_do_aluno_presente
        && !fonte_aluno_presente(inc_obj)
    {
        if let Some(valor) = inc_obj.get("frequencia_percentual") {
            local_obj.insert("frequencia_percentual".to_string(), valor.clone());
        }
        if !bim_inc.is_empty() {
            local_obj.insert(
                "frequencia_percentual_bimestre".to_string(),
                Value::String(bim_inc.to_string()),
            );
        }
    }

    // aluno_presente: bloco único por aluno, gravado inteiro a cada importação.
    // Vence o mais recente por `em`, e a frequência geral acompanha o bloco.
    if let Some(presente_inc) = inc_obj.get("aluno_presente") {
        let em_local = local_obj
            .get("aluno_presente")
            .and_then(|bloco| bloco.get("em"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let em_inc = presente_inc.get("em").and_then(Value::as_str).unwrap_or("");
        if em_inc >= em_local {
            local_obj.insert("aluno_presente".to_string(), presente_inc.clone());
            for campo in &["frequencia_percentual", "frequencia_fonte"] {
                if let Some(valor) = inc_obj.get(*campo) {
                    local_obj.insert(campo.to_string(), valor.clone());
                }
            }
        }
    }

    // saresp: bloco único por aluno, gravado inteiro a cada importação; vence o
    // mais recente por `em`.
    if let Some(saresp_inc) = inc_obj.get("saresp") {
        let em_local = local_obj
            .get("saresp")
            .and_then(|bloco| bloco.get("em"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let em_inc = saresp_inc.get("em").and_then(Value::as_str).unwrap_or("");
        if em_inc >= em_local {
            local_obj.insert("saresp".to_string(), saresp_inc.clone());
        }
    }

    // diagnostico_aprendizagem: bloco único por aluno (AvD), gravado
    // inteiro a cada importação. Vence o mais recente por `atualizado_em`, ou
    // o incoming quando o local ainda não tem nenhum — senão o diagnóstico
    // importado num dispositivo nunca chegava aos outros pelo sync.
    if let Some(diag_inc) = inc_obj.get("diagnostico_aprendizagem") {
        let em_local = local_obj
            .get("diagnostico_aprendizagem")
            .and_then(|d| d.get("atualizado_em"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let em_inc = diag_inc.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
        if em_inc >= em_local {
            local_obj.insert("diagnostico_aprendizagem".to_string(), diag_inc.clone());
        }
    }

    // elegivel_manual: vence o mais recente (por elegivel_manual_em)
    let em_local = local_obj.get("elegivel_manual_em").and_then(Value::as_str).unwrap_or("");
    let em_inc = inc_obj.get("elegivel_manual_em").and_then(Value::as_str).unwrap_or("");
    if em_inc > em_local {
        for campo in &["elegivel_manual", "elegivel_manual_em"] {
            if let Some(valor) = inc_obj.get(*campo) {
                local_obj.insert(campo.to_string(), valor.clone());
            }
        }
    }

    // medias: por disciplina/bimestre, vence o mais recente (por "em" do envelope)
    if let Some(medias_inc) = inc_obj.get("medias").and_then(Value::as_object) {
        let medias_local = local_obj
            .entry("medias".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if let Some(medias_local_obj) = medias_local.as_object_mut() {
            mesclar_medias(medias_local_obj, medias_inc);
        }
    }

    // expansao_online: histórico datado (um snapshot por importação, ver
    // importador_expansoes.rs). Cada dispositivo pode ter importado exports
    // de datas diferentes, então o merge certo é UNIÃO por data — nunca
    // "local vence", nem substituir o objeto inteiro. União também é a
    // única regra que funciona nos dois sentidos: a reintegração de
    // pendrive (conselho_pendrive.rs) chama esta mesma mesclar_aluno com
    // local/incoming invertidos. Sem esta função, o campo inteiro do
    // incoming era descartado sempre que o aluno já existisse localmente —
    // o mesmo problema que ainda afeta `tarefas` e `prova_paulista`
    // (`diagnostico_aprendizagem` já tem regra própria acima).
    mesclar_expansao_online(local_obj, inc_obj);

    // atendimentos: lista de registros com id próprio (cada atendimento feito
    // num dispositivo é um item novo, não a edição de um campo fixo como
    // frequência/médias) — o merge certo é UNIÃO por id, nunca "local sempre
    // vence" nem "o objeto inteiro do incoming vence". Sem isso, atendimentos
    // feitos numa máquina nunca chegavam às outras via sincronização — e se a
    // máquina de origem fosse formatada sem backup, o atendimento sumia de vez.
    mesclar_atendimentos(local_obj, inc_obj);

    // Campos de conselho e encaminhamentos: local sempre vence (edições intencionais)
    // ajustes_medias_conselho, encaminhamentos_conselho, deliberados_conselho,
    // lideranca_sala, deficiencias, comentario_educacao_especial — não tocamos,
    // exceto para trazer o bimestre que o local nunca registrou (ver
    // completar_bimestres_ausentes).
    for campo in ["ajustes_medias_conselho", "encaminhamentos_conselho", "deliberados_conselho"] {
        completar_bimestres_ausentes(local_obj, inc_obj, campo);
    }
}

/// Copia do incoming os bimestres que o local não tem em `campo` (mapa por
/// bimestre, sem data de edição). O local continua vencendo em todo bimestre
/// que ele já tem — inclusive vazio, que é como fica uma marcação desfeita.
/// Sem isto, um conselho feito em outra máquina chegava pela sincronização
/// sem destaques, perfil da turma, ajustes de média e encaminhamentos: a
/// turma já existia aqui, e esses campos nunca vinham.
pub(crate) fn completar_bimestres_ausentes(
    local: &mut serde_json::Map<String, Value>,
    incoming: &serde_json::Map<String, Value>,
    campo: &str,
) {
    let Some(inc_mapa) = incoming.get(campo).and_then(Value::as_object) else { return; };
    let local_valor = local
        .entry(campo.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(local_mapa) = local_valor.as_object_mut() else { return; };
    for (bimestre, valor) in inc_mapa {
        if !local_mapa.contains_key(bimestre) {
            local_mapa.insert(bimestre.clone(), valor.clone());
        }
    }
}

/// Campo irmão de `campo` com a data da última edição de cada bimestre
/// (`perfil_turma_editado_em`, `alunos_destaque_editado_em`). Gravado no
/// próprio arquivo, e não tirado da data do arquivo, que muda ao passar
/// pela nuvem.
pub(crate) fn campo_editado_em(campo: &str) -> String {
    format!("{campo}_editado_em")
}

/// Grava em `dados` a data de edição de `campo` no `bimestre`.
pub(crate) fn marcar_bimestre_editado(dados: &mut serde_json::Map<String, Value>, campo: &str, bimestre: &str) {
    let datas = dados
        .entry(campo_editado_em(campo))
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if !datas.is_object() {
        *datas = Value::Object(serde_json::Map::new());
    }
    if let Some(datas) = datas.as_object_mut() {
        datas.insert(bimestre.to_string(), Value::from(Local::now().to_rfc3339()));
    }
}

/// Mescla `campo` (mapa por bimestre) bimestre a bimestre: vence a edição
/// mais recente, pela data em `<campo>_editado_em`. Sem data dos dois lados
/// (arquivos de antes da 4.7.0), o local vence em todo bimestre que já tem,
/// inclusive vazio, que é como fica uma marcação desfeita; o incoming só
/// completa os bimestres que faltam aqui. Antes não havia data nenhuma: um
/// bimestre que já existia aqui nunca era atualizado por outra máquina, e o
/// perfil da turma preenchido no conselho de um colega não chegava.
pub(crate) fn mesclar_bimestres_por_edicao(
    local: &mut serde_json::Map<String, Value>,
    incoming: &serde_json::Map<String, Value>,
    campo: &str,
) {
    let Some(inc_mapa) = incoming.get(campo).and_then(Value::as_object) else { return; };
    let campo_datas = campo_editado_em(campo);
    let inc_datas = incoming.get(&campo_datas).and_then(Value::as_object);
    let data_de = |datas: Option<&serde_json::Map<String, Value>>, bimestre: &str| -> String {
        datas
            .and_then(|datas| datas.get(bimestre))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };

    let mut vencidos: Vec<(String, Value, String)> = Vec::new();
    {
        let local_mapa = local.get(campo).and_then(Value::as_object);
        let local_datas = local.get(&campo_datas).and_then(Value::as_object);
        for (bimestre, valor) in inc_mapa {
            let em_inc = data_de(inc_datas, bimestre);
            let vence = match local_mapa.and_then(|mapa| mapa.get(bimestre)) {
                None => true,
                Some(_) => em_inc > data_de(local_datas, bimestre),
            };
            if vence {
                vencidos.push((bimestre.clone(), valor.clone(), em_inc));
            }
        }
    }
    if vencidos.is_empty() {
        return;
    }

    let local_valor = local
        .entry(campo.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if !local_valor.is_object() {
        *local_valor = Value::Object(serde_json::Map::new());
    }
    if let Some(local_mapa) = local_valor.as_object_mut() {
        for (bimestre, valor, _) in &vencidos {
            local_mapa.insert(bimestre.clone(), valor.clone());
        }
    }
    let datas = local
        .entry(campo_datas)
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if !datas.is_object() {
        *datas = Value::Object(serde_json::Map::new());
    }
    if let Some(datas) = datas.as_object_mut() {
        for (bimestre, _, em) in vencidos {
            if !em.is_empty() {
                datas.insert(bimestre, Value::from(em));
            }
        }
    }
}

/// Mesma forma de mesclar_medias, mas chaveada por data de importação em
/// vez de bimestre×disciplina — cada snapshot já carrega seu próprio
/// bimestre (ver importador_expansoes.rs), então uma chave só basta.
fn mesclar_expansao_online(local_obj: &mut serde_json::Map<String, Value>, inc_obj: &serde_json::Map<String, Value>) {
    let Some(inc) = inc_obj.get("expansao_online").and_then(Value::as_object) else { return; };
    let local_valor = local_obj
        .entry("expansao_online".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(local_map) = local_valor.as_object_mut() else { return; };

    // email é estável (identifica a correspondência por RA); não há
    // conflito real a resolver, só preencher se o local ainda não tiver.
    if !local_map.contains_key("email") {
        if let Some(email) = inc.get("email") {
            local_map.insert("email".to_string(), email.clone());
        }
    }

    let Some(snaps_inc) = inc.get("snapshots").and_then(Value::as_object) else { return; };
    let snaps_local = local_map
        .entry("snapshots".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(snaps_local_obj) = snaps_local.as_object_mut() else { return; };

    for (data, snap_inc) in snaps_inc {
        let em_inc = snap_inc.get("em").and_then(Value::as_str).unwrap_or("");
        let em_local = snaps_local_obj.get(data).and_then(|s| s.get("em")).and_then(Value::as_str).unwrap_or("");
        // Mesma regra de mesclar_medias: incoming vence se for mais novo,
        // se só ele tem carimbo, ou se nenhum dos dois tem.
        if !snaps_local_obj.contains_key(data)
            || em_inc > em_local
            || (!em_inc.is_empty() && em_local.is_empty())
            || (em_inc.is_empty() && em_local.is_empty())
        {
            snaps_local_obj.insert(data.clone(), snap_inc.clone());
        }
    }
}

fn mesclar_atendimentos(local_obj: &mut serde_json::Map<String, Value>, inc_obj: &serde_json::Map<String, Value>) {
    let Some(inc_lista) = inc_obj.get("atendimentos").and_then(Value::as_array) else { return; };
    let local_valor = local_obj
        .entry("atendimentos".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(local_lista) = local_valor.as_array_mut() else { return; };

    for inc_item in inc_lista {
        let Some(inc_id) = inc_item.get("id").and_then(Value::as_str).map(str::to_string) else { continue; };
        match local_lista
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(inc_id.as_str()))
        {
            Some(local_item) => mesclar_atendimento(local_item, inc_item),
            None => local_lista.push(inc_item.clone()),
        }
    }
}

// Mesmo raciocínio pros followups aninhados (timeline de acompanhamento de um
// atendimento): união por id. O registro em si (fora followups) vence pelo
// atualizado_em mais recente; os followups são unidos independente de quem
// venceu ali, pra não perder um follow-up adicionado só de um dos lados.
fn mesclar_atendimento(local: &mut Value, incoming: &Value) {
    let followups_inc = incoming.get("followups").and_then(Value::as_array).cloned();

    let em_local = local.get("atualizado_em").and_then(Value::as_str).unwrap_or("").to_string();
    let em_inc = incoming.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
    if em_inc > em_local.as_str() {
        *local = incoming.clone();
    }

    let Some(inc_followups) = followups_inc else { return; };
    let Some(local_obj) = local.as_object_mut() else { return; };
    let local_followups_valor = local_obj
        .entry("followups".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(local_followups) = local_followups_valor.as_array_mut() else { return; };

    for inc_followup in inc_followups {
        let Some(inc_id) = inc_followup.get("id").and_then(Value::as_str).map(str::to_string) else { continue; };
        match local_followups
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(inc_id.as_str()))
        {
            Some(local_followup) => {
                let em_l = local_followup.get("atualizado_em").and_then(Value::as_str).unwrap_or("").to_string();
                let em_i = inc_followup.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
                if em_i > em_l.as_str() {
                    *local_followup = inc_followup;
                }
            }
            None => local_followups.push(inc_followup),
        }
    }
}

pub(crate) fn mesclar_arquivo_turma(local: &Value, incoming: &Value) -> Value {
    let mut resultado = local.clone();
    let Some(res_obj) = resultado.as_object_mut() else { return incoming.clone(); };

    // Campos de configuração da turma: incoming vence
    for campo in &["codigo", "ano", "serie", "sala", "periodo", "ciclo", "carga_horaria"] {
        if let Some(valor) = incoming.get(*campo) {
            res_obj.insert(campo.to_string(), valor.clone());
        }
    }

    // Merge de alunos
    if let (Some(alunos_local), Some(alunos_inc)) = (
        res_obj.get_mut("alunos").and_then(Value::as_object_mut),
        incoming.get("alunos").and_then(Value::as_object),
    ) {
        for (matricula, aluno_inc) in alunos_inc {
            if let Some(aluno_local) = alunos_local.get_mut(matricula) {
                mesclar_aluno(aluno_local, aluno_inc);
            } else {
                alunos_local.insert(matricula.clone(), aluno_inc.clone());
            }
        }
    }

    // Listas de disciplinas vistas em mapão de expansão/regular: união das
    // duas máquinas. Sem isso, a carga horária (que vem do incoming) trazia
    // as disciplinas de expansão importadas na outra máquina sem a marcação,
    // e elas apareciam no Planejamento.
    for campo in ["disciplinas_expansao", "disciplinas_regulares"] {
        let Some(inc_lista) = incoming.get(campo).and_then(Value::as_array) else { continue };
        let local_valor = res_obj
            .entry(campo.to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        if !local_valor.is_array() {
            *local_valor = Value::Array(Vec::new());
        }
        if let Some(local_lista) = local_valor.as_array_mut() {
            for item in inc_lista {
                if !local_lista.contains(item) {
                    local_lista.push(item.clone());
                }
            }
        }
    }

    // Destaques e perfil da turma, gravados por bimestre no Conselho.
    if let Some(inc_obj) = incoming.as_object() {
        for campo in ["alunos_destaque", "perfil_turma"] {
            mesclar_bimestres_por_edicao(res_obj, inc_obj, campo);
        }
    }

    mesclar_conselhos_turma(res_obj, incoming);
    mesclar_disparos_lote(res_obj, incoming);

    resultado
}

// Disparos em lote (fila assistida / lote API): união por id, o registro com
// `atualizado_em` mais recente vence inteiro. Um disparo é editado de uma
// máquina por vez (quem está tocando a fila), então não precisa de merge
// campo a campo como os atendimentos.
pub(crate) fn mesclar_disparos_lote(
    local: &mut serde_json::Map<String, Value>,
    incoming: &Value,
) {
    let Some(inc_lista) = incoming.get("disparos_lote").and_then(Value::as_array) else { return; };
    let local_valor = local
        .entry("disparos_lote".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(local_lista) = local_valor.as_array_mut() else { return; };

    for inc_item in inc_lista {
        let Some(inc_id) = inc_item.get("id").and_then(Value::as_str) else { continue; };
        match local_lista
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(inc_id))
        {
            Some(local_item) => {
                let em_local = local_item.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
                let em_inc = inc_item.get("atualizado_em").and_then(Value::as_str).unwrap_or("");
                if em_inc > em_local {
                    *local_item = inc_item.clone();
                }
            }
            None => local_lista.push(inc_item.clone()),
        }
    }
}

// Finalização do conselho (nó "conselhos") e texto da ata: por bimestre, vence
// o lado com finalizado_em mais recente; um registro finalizado vence um que
// nunca foi. Sem isso, um conselho finalizado em outra máquina (sync ou
// pendrive) era descartado silenciosamente, e a turma voltava a "pendente".
pub(crate) fn mesclar_conselhos_turma(
    local: &mut serde_json::Map<String, Value>,
    incoming: &Value,
) {
    let Some(conselhos_inc) = incoming.get("conselhos").and_then(Value::as_object) else {
        return;
    };

    let mut bimestres_vencidos: Vec<String> = Vec::new();
    {
        let conselhos_local = local
            .entry("conselhos".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(conselhos_local) = conselhos_local.as_object_mut() else {
            return;
        };
        for (bimestre, registro_inc) in conselhos_inc {
            let vence = match conselhos_local.get(bimestre) {
                None => true,
                Some(registro_local) => {
                    let em_inc = registro_inc
                        .get("finalizado_em")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let em_local = registro_local
                        .get("finalizado_em")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let finalizado_inc = conselho_foi_finalizado(registro_inc);
                    let finalizado_local = conselho_foi_finalizado(registro_local);
                    if finalizado_inc != finalizado_local {
                        finalizado_inc
                    } else {
                        em_inc > em_local
                    }
                }
            };
            if vence {
                conselhos_local.insert(bimestre.clone(), registro_inc.clone());
                bimestres_vencidos.push(bimestre.clone());
            }
        }
    }

    // O texto da ata acompanha o registro de conselho que venceu o merge.
    if bimestres_vencidos.is_empty() {
        return;
    }
    let Some(textos_inc) = incoming.get("textos_ata").and_then(Value::as_object) else {
        return;
    };
    let textos_local = local
        .entry("textos_ata".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(textos_local) = textos_local.as_object_mut() else {
        return;
    };
    for bimestre in bimestres_vencidos {
        if let Some(texto) = textos_inc.get(&bimestre) {
            textos_local.insert(bimestre, texto.clone());
        }
    }
}

/// rclone bisync: "turma_X.conflict1.json".
fn eh_conflito_do_rclone(stem: &str) -> bool {
    stem.rsplit_once('.').is_some_and(|(_, sufixo)| {
        sufixo
            .strip_prefix("conflict")
            .is_some_and(|numero| !numero.is_empty() && numero.chars().all(|c| c.is_ascii_digit()))
    })
}

// Cópias de conflito criadas por serviços de sincronização de arquivos (OneDrive,
// Google Drive) recebem sufixo com o nome do dispositivo: "turma_X-NomePC.json" ou
// "turma_X-NomePC-2.json". Se remover sufixos "-token" do nome resultar em um
// arquivo que também existe na mesma pasta, este é uma cópia de conflito, não uma turma.
// O Syncthing e o rclone usam outro padrão, inconfundível por si só:
// "turma_X.sync-conflict-20260930-153012-ABCDEFG.json", "turma_X.conflict1.json".
// O Google Drive para computador numera: "turma_X (1).json".
pub(crate) fn eh_copia_de_conflito_sync(caminho: &Path) -> bool {
    let Some(pasta) = caminho.parent() else {
        return false;
    };
    let Some(stem) = caminho.file_stem().and_then(|s| s.to_str()) else {
        return false;
    };
    if stem.contains(".sync-conflict-") || eh_conflito_do_rclone(stem) {
        return true;
    }
    // Google Drive para computador: "turma_X (1).json".
    if let Some((nome, numero)) = stem.strip_suffix(')').and_then(|resto| resto.rsplit_once(" (")) {
        let extensao = caminho.extension().and_then(|e| e.to_str()).unwrap_or("json");
        if !nome.is_empty()
            && !numero.is_empty()
            && numero.chars().all(|c| c.is_ascii_digit())
            && pasta.join(format!("{nome}.{extensao}")).is_file()
        {
            return true;
        }
    }
    let mut base = stem;
    while let Some(pos) = base.rfind('-') {
        base = &base[..pos];
        if !base.is_empty() && pasta.join(format!("{base}.json")).is_file() {
            return true;
        }
    }
    false
}

/// Faxina de resíduos deixados por sincronizações anteriores, rodada uma vez
/// na abertura do app. Tudo aqui é local (dentro de app_base_dir) — nada é
/// apagado da pasta compartilhada, que é de todo o grupo.
///
/// Remove duas coisas:
///
/// 1. `dados_sync_tmp_*` / `dados_sync_old_*` — cópias inteiras de `dados/`
///    que `carregar_dados_institucionais_sincronizacao` cria e que ficam para
///    trás quando o app é fechado no meio do pull. Numa instalação real havia
///    uma de 382 MB parada desde a semana anterior.
/// 2. As cópias de conflito do OneDrive na raiz de `dados/`
///    (`estado_ui-NOMEPC.json`), que nasciam do espelho local ir e voltar pela
///    sincronização institucional. Com `eh_estado_ui_da_maquina` fora do
///    ciclo, não surgem mais — isto limpa as que já existem.
///
/// A trava é obrigatória: mexe em `dados/` e nos diretórios que o pull usa.
pub(crate) fn limpar_residuos_sincronizacao() -> io::Result<()> {
    let _dados = travar_dados();
    let base = app_base_dir()?;

    for entrada in fs::read_dir(&base)? {
        let caminho = entrada?.path();
        if !caminho.is_dir() {
            continue;
        }
        let Some(nome) = caminho.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if nome.starts_with("dados_sync_tmp_") || nome.starts_with("dados_sync_old_") {
            let _ = fs::remove_dir_all(&caminho);
        }
    }

    let dados = data_dir()?;
    if dados.is_dir() {
        for entrada in fs::read_dir(&dados)? {
            let caminho = entrada?.path();
            if !caminho.is_file() {
                continue;
            }
            let Some(nome) = caminho.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            // `nome != "estado_ui.json"` protege o espelho em uso; o resto do
            // padrão só casa com cópia de conflito.
            if nome != "estado_ui.json"
                && eh_estado_ui_da_maquina(nome)
                && eh_copia_de_conflito_sync(&caminho)
            {
                let _ = fs::remove_file(&caminho);
            }
        }
    }

    // A poda roda depois de cada backup novo, mas quem já acumulou dezenas de
    // GB pode passar muito tempo sem gerar outro (agora que o pull
    // institucional deixou de disparar a cada 15 min). Na abertura, o espaço
    // volta já na primeira execução da versão corrigida.
    let _ = podar_backups_antigos(MAX_BACKUPS_MANTIDOS);

    Ok(())
}

pub(crate) fn remover_copias_de_conflito_sync(pasta: &Path) -> io::Result<()> {
    if !pasta.is_dir() {
        return Ok(());
    }
    for entrada in fs::read_dir(pasta)? {
        let caminho = entrada?.path();
        if caminho.is_dir() {
            remover_copias_de_conflito_sync(&caminho)?;
        } else if caminho.extension().and_then(|e| e.to_str()) == Some("json")
            && eh_copia_de_conflito_sync(&caminho)
        {
            fs::remove_file(&caminho)?;
        }
    }
    Ok(())
}

// Mescla um único arquivo de config (dados/pei/config.json ou
// dados/planejamento/config.json) campo a campo: para cada campo string
// vazio do lado recebido (temp_path, que vira o novo dados/ após o swap),
// mantém o valor local se ele não estiver vazio. Se o peer nem tinha o
// arquivo, copia o local para não desaparecer no swap.
pub(crate) fn mesclar_config_webapp(local_path: &Path, temp_path: &Path) -> io::Result<()> {
    if !local_path.exists() {
        return Ok(());
    }
    if !temp_path.exists() {
        if let Some(pai) = temp_path.parent() {
            fs::create_dir_all(pai)?;
        }
        return fs::copy(local_path, temp_path).map(|_| ());
    }
    let texto_local = fs::read_to_string(local_path)?;
    let texto_temp = fs::read_to_string(temp_path)?;
    let (Ok(Value::Object(local_map)), Ok(Value::Object(mut temp_map))) = (
        serde_json::from_str::<Value>(&texto_local),
        serde_json::from_str::<Value>(&texto_temp),
    ) else {
        // Um dos dois não é um objeto JSON válido (ex.: config legada, só
        // texto cru) — não mescla, mantém o que já está em temp_path.
        return Ok(());
    };
    for (chave, valor_local) in local_map {
        let local_nao_vazio = valor_local.as_str().map(|s| !s.is_empty()).unwrap_or(false);
        if !local_nao_vazio {
            continue;
        }
        let vazio_no_recebido = temp_map
            .get(&chave)
            .and_then(Value::as_str)
            .map(str::is_empty)
            .unwrap_or(true);
        if vazio_no_recebido {
            temp_map.insert(chave, valor_local);
        }
    }
    let texto_merged =
        serde_json::to_string_pretty(&Value::Object(temp_map)).map_err(|e| io::Error::other(e.to_string()))?;
    fs::write(temp_path, texto_merged)
}

// Agrupa os arquivos turma_*.json de cada pasta de ano por (ano, código
// normalizado) e mescla qualquer grupo com mais de um arquivo, mantendo o
// nome e os campos de configuração do arquivo cujo código já está no formato
// "bonito" (ex.: "2ª Série A") — se nenhum estiver, mantém o primeiro em
// ordem alfabética. Ver comentário em publicar/carregar_dados_institucionais_
// sincronizacao sobre como duplicatas com nomes diferentes sobrevivem ao
// merge por nome de arquivo em mesclar_diretorio_persistidos.
pub(crate) fn desduplicar_turmas_por_codigo(pasta: &Path) -> io::Result<()> {
    if !pasta.is_dir() {
        return Ok(());
    }
    for entrada in fs::read_dir(pasta)? {
        let caminho = entrada?.path();
        if caminho.is_dir() {
            desduplicar_turmas_por_codigo(&caminho)?;
        }
    }

    let mut grupos: BTreeMap<(i64, String), Vec<PathBuf>> = BTreeMap::new();
    for entrada in fs::read_dir(pasta)? {
        let caminho = entrada?.path();
        let Some(nome) = caminho.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if caminho.is_dir() || !nome.starts_with("turma_") || !nome.ends_with(".json") {
            continue;
        }
        if eh_copia_de_conflito_sync(&caminho) {
            continue;
        }
        let Some(dados) = fs::read_to_string(&caminho)
            .ok()
            .and_then(|texto| serde_json::from_str::<Value>(sem_lixo_no_fim(&texto)).ok())
        else {
            continue;
        };
        let (Some(ano), Some(codigo)) = (
            dados.get("ano").and_then(Value::as_i64),
            dados.get("codigo").and_then(Value::as_str),
        ) else {
            continue;
        };
        grupos
            .entry((ano, normalizar_texto_basico(codigo)))
            .or_default()
            .push(caminho);
    }

    for (_, mut arquivos) in grupos {
        if arquivos.len() < 2 {
            continue;
        }
        arquivos.sort();

        let mut valores: Vec<(PathBuf, Value)> = arquivos
            .into_iter()
            .filter_map(|caminho| {
                fs::read_to_string(&caminho)
                    .ok()
                    .and_then(|texto| serde_json::from_str::<Value>(sem_lixo_no_fim(&texto)).ok())
                    .map(|dados| (caminho, dados))
            })
            .collect();
        if valores.len() < 2 {
            continue;
        }

        let indice_base = valores
            .iter()
            .position(|(_, dados)| {
                dados
                    .get("codigo")
                    .and_then(Value::as_str)
                    .map(|codigo| formatar_rotulo_turma_texto(codigo) == codigo)
                    .unwrap_or(false)
            })
            .unwrap_or(0);
        let (caminho_base, base_original) = valores.remove(indice_base);

        let mut mesclado = base_original.clone();
        for (_, valor_extra) in &valores {
            mesclado = mesclar_arquivo_turma(&mesclado, valor_extra);
        }
        // mesclar_arquivo_turma deixa o lado "incoming" vencer nos campos de
        // configuração da turma — aqui queremos que o arquivo já formatado
        // (base_original) continue definindo código/série/sala/etc.
        if let Some(obj) = mesclado.as_object_mut() {
            for campo in ["codigo", "ano", "serie", "sala", "periodo", "ciclo", "carga_horaria"] {
                if let Some(valor) = base_original.get(campo) {
                    obj.insert(campo.to_string(), valor.clone());
                }
            }
        }

        let texto = serde_json::to_string_pretty(&mesclado).map_err(|e| io::Error::other(e.to_string()))?;
        gravar_com_flush(&caminho_base, texto.as_bytes())?;
        for (caminho_extra, _) in valores {
            fs::remove_file(caminho_extra)?;
        }
    }
    Ok(())
}

pub(crate) fn mesclar_diretorio_persistidos(local_dir: &Path, temp_dir: &Path) -> io::Result<()> {
    if !local_dir.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(temp_dir)?;

    for entrada in fs::read_dir(local_dir)? {
        let entrada = entrada?;
        let nome = entrada.file_name();
        let local_path = entrada.path();
        let temp_path = temp_dir.join(&nome);

        if local_path.is_dir() {
            mesclar_diretorio_persistidos(&local_path, &temp_path)?;
        } else if local_path.extension().and_then(|e| e.to_str()) == Some("json") {
            if eh_copia_de_conflito_sync(&local_path) {
                continue;
            }
            if temp_path.exists() {
                // Arquivo em ambos: merge, mantendo o mais recente por campo.
                // Lido como bytes: um arquivo cortado no meio de um caractere
                // acentuado não é UTF-8 válido e abortaria a sincronização toda.
                let texto_local = String::from_utf8_lossy(&fs::read(&local_path)?).into_owned();
                let texto_temp = String::from_utf8_lossy(&fs::read(&temp_path)?).into_owned();
                match (
                    serde_json::from_str::<Value>(sem_lixo_no_fim(&texto_local)),
                    serde_json::from_str::<Value>(sem_lixo_no_fim(&texto_temp)),
                ) {
                    (Ok(val_local), Ok(val_temp)) => {
                        let merged = mesclar_arquivo_turma(&val_local, &val_temp);
                        let texto_merged = serde_json::to_string_pretty(&merged)
                            .map_err(|e| io::Error::other(e.to_string()))?;
                        gravar_com_flush(&temp_path, texto_merged.as_bytes())?;
                    }
                    // Incoming ilegível e local bom: fica o local. Antes o
                    // incoming vencia sempre, e um arquivo corrompido na pasta
                    // compartilhada apagava a cópia boa desta máquina a cada pull.
                    (Ok(_), Err(_)) => {
                        gravar_com_flush(&temp_path, texto_local.as_bytes())?;
                    }
                    // Local ilegível (ou os dois): mantém o incoming, já em temp_path.
                    _ => {}
                }
            } else {
                // Arquivo só no local (turma criada após último sync): preservar
                fs::copy(&local_path, &temp_path)?;
            }
        }
    }
    Ok(())
}


// Une as fotos locais ao diretório recebido do peer (que virará o novo `dados`),
// preservando fotos que só existem localmente e, em conflito, a mais recente.
pub(crate) fn mesclar_diretorio_fotos(local_dir: &Path, temp_dir: &Path) -> io::Result<()> {
    if !local_dir.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(temp_dir)?;
    for entrada in fs::read_dir(local_dir)? {
        let entrada = entrada?;
        let nome = entrada.file_name();
        let local_path = entrada.path();
        let temp_path = temp_dir.join(&nome);
        if local_path.is_dir() {
            mesclar_diretorio_fotos(&local_path, &temp_path)?;
        } else if temp_path.exists() {
            let local_t = fs::metadata(&local_path).and_then(|m| m.modified()).ok();
            let temp_t = fs::metadata(&temp_path).and_then(|m| m.modified()).ok();
            if let (Some(lt), Some(tt)) = (local_t, temp_t) {
                if lt > tt {
                    fs::copy(&local_path, &temp_path)?;
                }
            }
        } else {
            fs::copy(&local_path, &temp_path)?;
        }
    }
    Ok(())
}

pub(crate) fn assinatura_diretorio(pasta: &Path) -> io::Result<String> {
    fn visitar(caminho: &Path, raiz: &Path, partes: &mut Vec<String>) -> io::Result<()> {
        if !caminho.exists() {
            return Ok(());
        }
        if caminho.is_dir() {
            let mut entradas = fs::read_dir(caminho)?.collect::<Result<Vec<_>, io::Error>>()?;
            entradas.sort_by_key(|entrada| entrada.file_name());
            for entrada in entradas {
                visitar(&entrada.path(), raiz, partes)?;
            }
            return Ok(());
        }
        let relativo = caminho
            .strip_prefix(raiz)
            .unwrap_or(caminho)
            .to_string_lossy()
            .replace('\\', "/");
        // Arquivo local da máquina na raiz: fora da assinatura, senão ela muda
        // a cada 45 s e a publicação nunca converge (ver
        // eh_estado_ui_da_maquina). O `!contains('/')` restringe à raiz.
        if !relativo.contains('/') && eh_arquivo_da_maquina(&relativo) {
            return Ok(());
        }
        let bytes = fs::read(caminho)?;
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        relativo.hash(&mut hasher);
        bytes.hash(&mut hasher);
        partes.push(format!("{relativo}:{}:{:x}", bytes.len(), hasher.finish()));
        Ok(())
    }

    let mut partes = Vec::new();
    visitar(pasta, pasta, &mut partes)?;
    Ok(partes.join("|"))
}

pub(crate) fn marcador_sincronizacao_institucional_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join("sync_institutional_last_applied.txt"))
}

pub(crate) fn ler_marcador_sincronizacao_institucional() -> Option<String> {
    marcador_sincronizacao_institucional_path()
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|texto| texto.trim().to_string())
        .filter(|texto| !texto.is_empty())
}

pub(crate) fn salvar_marcador_sincronizacao_institucional(valor: &str) -> io::Result<()> {
    let path = marcador_sincronizacao_institucional_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, valor)
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    /// Reproduz o bug da 4.2.2: a pasta compartilhada tinha uma turma cortada
    /// no meio e o pull trocava a cópia local boa por ela.
    #[test]
    fn turma_corrompida_no_incoming_nao_substitui_a_local_boa() {
        let base = std::env::temp_dir().join(format!(
            "coordop_sync_{}",
            Local::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        let (local, temp) = (base.join("local"), base.join("temp"));
        fs::create_dir_all(&local).unwrap();
        fs::create_dir_all(&temp).unwrap();
        let boa = r#"{"codigo": "6º Ano F", "ano": 2026, "alunos": {}}"#;
        fs::write(local.join("turma_6o Ano F.json"), boa).unwrap();
        // Cortado no meio do "º" (bytes 0xC2 0xBA): nem UTF-8 válido é.
        let mut cortada = br#"{"codigo": "6"#.to_vec();
        cortada.push(0xC2);
        fs::write(temp.join("turma_6o Ano F.json"), cortada).unwrap();

        mesclar_diretorio_persistidos(&local, &temp).unwrap();

        let resultado: Value =
            serde_json::from_str(&fs::read_to_string(temp.join("turma_6o Ano F.json")).unwrap()).unwrap();
        assert_eq!(resultado["codigo"], "6º Ano F");
        let _ = fs::remove_dir_all(&base);
    }

    /// Reproduz o bug real: um atendimento feito só na máquina A nunca
    /// aparecia na máquina B depois de sincronizar, porque `mesclar_aluno`
    /// simplesmente não tocava no campo `atendimentos`. Se a máquina A fosse
    /// reformatada sem backup, o atendimento sumia de vez — em nenhum lugar
    /// do grupo de trabalho ele tinha sido replicado.
    #[test]
    fn atendimento_so_no_incoming_e_incorporado_ao_local() {
        let mut local = json!({ "atendimentos": [] });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Conversa com a família", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let lista = local["atendimentos"].as_array().unwrap();
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0]["id"], "atendimento-1");
    }

    /// Diagnóstico da AvD importado só na máquina A tem que chegar na B pelo
    /// sync — antes `mesclar_aluno` não tocava no campo e o dado nunca saía
    /// do dispositivo onde foi importado.
    #[test]
    fn diagnostico_so_no_incoming_e_incorporado_ao_local() {
        let mut local = json!({ "nome": "FULANO" });
        let incoming = json!({
            "diagnostico_aprendizagem": {
                "portugues": { "avd2": { "nivel": "Básico", "aprendizagem_equivalente": "7º ano" } },
                "atualizado_em": "2026-09-01T10:00:00-03:00"
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["diagnostico_aprendizagem"]["portugues"]["avd2"]["nivel"], "Básico");
    }

    /// Diagnóstico local mais recente não é sobrescrito por um incoming antigo
    /// (ex.: outro dispositivo ainda com a importação anterior).
    #[test]
    fn diagnostico_local_mais_novo_vence_incoming_antigo() {
        let mut local = json!({
            "diagnostico_aprendizagem": {
                "portugues": { "avd2": { "nivel": "Proficiente" } },
                "atualizado_em": "2026-09-10T10:00:00-03:00"
            }
        });
        let incoming = json!({
            "diagnostico_aprendizagem": {
                "portugues": { "avd2": { "nivel": "Básico" } },
                "atualizado_em": "2026-09-01T10:00:00-03:00"
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["diagnostico_aprendizagem"]["portugues"]["avd2"]["nivel"], "Proficiente");
    }

    /// Dois dispositivos criaram atendimentos diferentes pro mesmo aluno
    /// (ids diferentes) — os dois precisam sobreviver ao merge, não só um.
    #[test]
    fn atendimentos_com_ids_diferentes_dos_dois_lados_sao_unidos() {
        let mut local = json!({
            "atendimentos": [
                { "id": "atendimento-local", "descricao": "Feito no dispositivo A", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-remoto", "descricao": "Feito no dispositivo B", "atualizado_em": "2026-08-02T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let mut ids: Vec<&str> = local["atendimentos"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["id"].as_str().unwrap())
            .collect();
        ids.sort();
        assert_eq!(ids, vec!["atendimento-local", "atendimento-remoto"]);
    }

    /// Mesmo atendimento (mesmo id) editado nos dois lados — vence a edição
    /// com `atualizado_em` mais recente, igual já acontece com conselhos.
    #[test]
    fn atendimento_editado_dos_dois_lados_vence_o_mais_recente() {
        let mut local = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Versão antiga", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Versão editada depois", "atualizado_em": "2026-08-03T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["atendimentos"][0]["descricao"], "Versão editada depois");
    }

    /// Follow-up adicionado só do lado remoto, num atendimento que também
    /// existe (com followups próprios) do lado local — os followups dos
    /// dois lados precisam se unir, não um substituir o outro.
    #[test]
    fn followups_de_um_atendimento_sao_unidos_por_id() {
        let mut local = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Original",
                    "atualizado_em": "2026-08-01T10:00:00-03:00",
                    "followups": [
                        { "id": "followup-local", "descricao": "Follow-up feito no dispositivo A", "atualizado_em": "2026-08-01T10:00:00-03:00" }
                    ]
                }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Original",
                    "atualizado_em": "2026-08-01T10:00:00-03:00",
                    "followups": [
                        { "id": "followup-remoto", "descricao": "Follow-up feito no dispositivo B", "atualizado_em": "2026-08-02T10:00:00-03:00" }
                    ]
                }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let mut ids: Vec<&str> = local["atendimentos"][0]["followups"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["id"].as_str().unwrap())
            .collect();
        ids.sort();
        assert_eq!(ids, vec!["followup-local", "followup-remoto"]);
    }

    /// Campos novos do atendimento (canal, modelo_id, followup_previsto) fazem
    /// parte do corpo do registro: quando o incoming mais recente vence, eles
    /// acompanham sem tratamento especial.
    #[test]
    fn campos_novos_do_atendimento_acompanham_o_corpo_no_merge() {
        let mut local = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Só registro", "canal": "manual", "atualizado_em": "2026-08-01T10:00:00-03:00" }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Mensagem enviada e combinado retorno",
                    "canal": "wa_me",
                    "modelo_id": "cobranca_tarefas",
                    "followup_previsto": { "data": "2026-08-30", "descricao": "Conferir entrega" },
                    "atualizado_em": "2026-08-03T10:00:00-03:00"
                }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        let a = &local["atendimentos"][0];
        assert_eq!(a["canal"], "wa_me");
        assert_eq!(a["modelo_id"], "cobranca_tarefas");
        assert_eq!(a["followup_previsto"]["data"], "2026-08-30");
    }

    /// Registrar o desfecho (limpar o follow-up combinado) numa máquina tem que
    /// vencer o outro lado que ainda tem o combinado em aberto — o corpo do
    /// registro mais recente vence, então o campo simplesmente some.
    #[test]
    fn followup_previsto_limpo_no_incoming_mais_recente_vence() {
        let mut local = json!({
            "atendimentos": [
                {
                    "id": "atendimento-1",
                    "descricao": "Combinado retorno",
                    "followup_previsto": { "data": "2026-08-30", "descricao": "Conferir entrega" },
                    "atualizado_em": "2026-08-20T10:00:00-03:00"
                }
            ]
        });
        let incoming = json!({
            "atendimentos": [
                { "id": "atendimento-1", "descricao": "Desfecho registrado", "atualizado_em": "2026-08-31T10:00:00-03:00" }
            ]
        });
        mesclar_aluno(&mut local, &incoming);
        assert!(local["atendimentos"][0].get("followup_previsto").is_none());
    }

    /// Reproduz o mesmo bug de classe do teste de atendimentos, mas para
    /// expansao_online: o aluno já existe localmente (sem o campo), e uma
    /// importação feita só na outra máquina não pode ser descartada.
    #[test]
    fn expansao_online_so_no_incoming_e_incorporada_ao_local() {
        let mut local = json!({ "nome": "AGATHA" });
        let incoming = json!({
            "nome": "AGATHA",
            "expansao_online": {
                "email": "00001136866978sp@al.educacao.sp.gov.br",
                "snapshots": { "2026-08-25": { "bimestre": "3", "progresso": 80.0, "em": "2026-08-25T21:00:00-03:00" } }
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["expansao_online"]["email"], json!("00001136866978sp@al.educacao.sp.gov.br"));
        assert_eq!(local["expansao_online"]["snapshots"]["2026-08-25"]["progresso"], json!(80.0));
    }

    /// Cada dispositivo importou um export de data diferente — as duas
    /// datas precisam sobreviver no aluno mesclado, não só uma.
    #[test]
    fn snapshots_de_datas_diferentes_dos_dois_lados_sao_unidos() {
        let mut local = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "bimestre": "3", "progresso": 80.0, "em": "2026-08-25T21:00:00-03:00" } }
            }
        });
        let incoming = json!({
            "expansao_online": {
                "snapshots": { "2026-09-08": { "bimestre": "3", "progresso": 90.0, "em": "2026-09-08T21:00:00-03:00" } }
            }
        });
        mesclar_aluno(&mut local, &incoming);
        let snaps = local["expansao_online"]["snapshots"].as_object().unwrap();
        assert_eq!(snaps.len(), 2);
        assert_eq!(snaps["2026-08-25"]["progresso"], json!(80.0));
        assert_eq!(snaps["2026-09-08"]["progresso"], json!(90.0));
    }

    /// Mesma data importada nos dois lados (ex.: os dois dispositivos
    /// reimportaram o mesmo CSV) — vence o snapshot com "em" mais recente,
    /// igual já acontece com medias.
    #[test]
    fn snapshot_da_mesma_data_vence_o_em_mais_recente() {
        let mut local = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "progresso": 80.0, "em": "2026-08-25T10:00:00-03:00" } }
            }
        });
        let incoming = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "progresso": 85.0, "em": "2026-08-25T18:00:00-03:00" } }
            }
        });
        mesclar_aluno(&mut local, &incoming);
        assert_eq!(local["expansao_online"]["snapshots"]["2026-08-25"]["progresso"], json!(85.0));
    }

    #[test]
    fn destaques_e_ajustes_de_outra_maquina_chegam_sem_apagar_os_locais() {
        let local = json!({
            "codigo": "6A",
            "alunos_destaque": {"2": {"destaque": "ANA"}, "3": {}},
            "alunos": {"1": {"ajustes_medias_conselho": {"2": {"MAT": 5}}}}
        });
        let incoming = json!({
            "codigo": "6A",
            "alunos_destaque": {"2": {"destaque": "BIA"}, "3": {"destaque": "CAIO"}},
            "perfil_turma": {"3": {"engajamento": "alto"}},
            "alunos": {"1": {"ajustes_medias_conselho": {"2": {"MAT": 6}, "3": {"MAT": 7}}}}
        });
        let r = mesclar_arquivo_turma(&local, &incoming);
        assert_eq!(r["alunos_destaque"]["2"]["destaque"], json!("ANA"));
        // Bimestre vazio no local é marcação desfeita: continua vazio.
        assert_eq!(r["alunos_destaque"]["3"], json!({}));
        assert_eq!(r["perfil_turma"]["3"]["engajamento"], json!("alto"));
        assert_eq!(r["alunos"]["1"]["ajustes_medias_conselho"]["2"]["MAT"], json!(5));
        assert_eq!(r["alunos"]["1"]["ajustes_medias_conselho"]["3"]["MAT"], json!(7));
    }

    #[test]
    fn perfil_e_destaques_ficam_com_a_edicao_mais_recente() {
        let local = json!({
            "codigo": "6A",
            "perfil_turma": {"3": {}, "2": {"engajamento": "baixo"}},
            "perfil_turma_editado_em": {"2": "2026-10-27T10:00:00-03:00"},
            "alunos_destaque": {"3": {"destaque": "ANA"}},
            "alunos_destaque_editado_em": {"3": "2026-10-27T12:00:00-03:00"}
        });
        let incoming = json!({
            "codigo": "6A",
            "perfil_turma": {"3": {"engajamento": "alto"}, "2": {"engajamento": "medio"}},
            "perfil_turma_editado_em": {"3": "2026-10-26T21:09:00-03:00", "2": "2026-10-26T09:00:00-03:00"},
            "alunos_destaque": {"3": {"destaque": "BIA"}},
            "alunos_destaque_editado_em": {"3": "2026-10-27T11:00:00-03:00"}
        });
        let r = mesclar_arquivo_turma(&local, &incoming);
        // Bimestre vazio aqui, sem data: o perfil preenchido no colega chega.
        assert_eq!(r["perfil_turma"]["3"]["engajamento"], json!("alto"));
        assert_eq!(r["perfil_turma_editado_em"]["3"], json!("2026-10-26T21:09:00-03:00"));
        // Edição local mais recente continua.
        assert_eq!(r["perfil_turma"]["2"]["engajamento"], json!("baixo"));
        assert_eq!(r["alunos_destaque"]["3"]["destaque"], json!("ANA"));
        assert_eq!(r["alunos_destaque_editado_em"]["3"], json!("2026-10-27T12:00:00-03:00"));
    }

    #[test]
    fn marcar_bimestre_editado_grava_a_data_no_proprio_arquivo() {
        let mut dados = serde_json::Map::new();
        marcar_bimestre_editado(&mut dados, "perfil_turma", "3");
        let data = dados["perfil_turma_editado_em"]["3"].as_str().unwrap();
        assert!(chrono::DateTime::parse_from_rfc3339(data).is_ok());
    }

    #[test]
    fn arquivos_do_pendrive_de_conselho_nao_vao_para_a_sincronizacao() {
        assert!(eh_arquivo_da_maquina("conselho_pendrive.json"));
        assert!(eh_arquivo_da_maquina("conselhos_externos.json"));
        assert!(eh_arquivo_da_maquina("estado_ui.json"));
        assert!(!eh_arquivo_da_maquina("persistidos"));
    }

    /// O merge precisa ser simétrico: a reintegração de pendrive
    /// (conselho_pendrive.rs) chama mesclar_arquivo_turma/mesclar_aluno com
    /// os lados invertidos em relação ao sync normal — se a regra não for
    /// simétrica, um dos dois sentidos perde dado.
    #[test]
    fn merge_de_expansao_e_simetrico() {
        let a = json!({
            "expansao_online": {
                "snapshots": { "2026-08-25": { "progresso": 80.0, "em": "2026-08-25T10:00:00-03:00" } }
            }
        });
        let b = json!({
            "expansao_online": {
                "snapshots": { "2026-09-08": { "progresso": 90.0, "em": "2026-09-08T10:00:00-03:00" } }
            }
        });

        let mut a_recebe_b = a.clone();
        mesclar_aluno(&mut a_recebe_b, &b);
        let mut b_recebe_a = b.clone();
        mesclar_aluno(&mut b_recebe_a, &a);

        let datas_de = |v: &Value| -> Vec<String> {
            let mut datas: Vec<String> =
                v["expansao_online"]["snapshots"].as_object().unwrap().keys().cloned().collect();
            datas.sort();
            datas
        };
        assert_eq!(datas_de(&a_recebe_b), vec!["2026-08-25", "2026-09-08"]);
        assert_eq!(datas_de(&b_recebe_a), vec!["2026-08-25", "2026-09-08"]);
    }
}

#[cfg(test)]
mod testes_pasta_por_dispositivo {
    use super::*;
    use serde_json::json;

    fn pasta_de_teste(nome: &str) -> PathBuf {
        let pasta = env::temp_dir().join(format!("coordop_{nome}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&pasta);
        fs::create_dir_all(&pasta).unwrap();
        pasta
    }

    fn gravar(caminho: &Path, conteudo: &str) {
        fs::create_dir_all(caminho.parent().unwrap()).unwrap();
        fs::write(caminho, conteudo).unwrap();
    }

    fn turma(codigo: &str) -> String {
        json!({ "ano": 2026, "codigo": codigo, "alunos": [] }).to_string()
    }

    fn entrada(pasta: &str, device_id: &str) -> SyncInstitutionalInput {
        SyncInstitutionalInput { pasta: pasta.to_string(), device_id: device_id.to_string() }
    }

    /// Três computadores numa mesma pasta: A e B na versão nova, C ainda
    /// numa versão antiga que só conhece `institutional-data`.
    #[test]
    fn cada_computador_grava_so_o_proprio_manifesto_e_todos_convergem() {
        let raiz = pasta_de_teste("grupo");
        let grupo = raiz.join("nuvem");
        fs::create_dir_all(&grupo).unwrap();
        let pasta = grupo.to_string_lossy().to_string();
        let casa_a = raiz.join("a");
        let casa_b = raiz.join("b");
        let foto = "foto-igual-nos-dois";
        gravar(&casa_a.join("dados/persistidos/turma_6o Ano A.json"), &turma("6º Ano A"));
        gravar(&casa_a.join("dados/fotos/123.jpg"), foto);
        gravar(&casa_b.join("dados/persistidos/turma_7o Ano B.json"), &turma("7º Ano B"));
        gravar(&casa_b.join("dados/fotos/123.jpg"), foto);

        let usar = |casa: &Path| BASE_DE_TESTE.with(|base| *base.borrow_mut() = Some(casa.to_path_buf()));

        usar(&casa_a);
        publicar_dados_institucionais_sincronizacao(entrada(&pasta, "A")).unwrap();
        usar(&casa_b);
        carregar_dados_institucionais_sincronizacao(pasta.clone(), Some("B".into())).unwrap();
        publicar_dados_institucionais_sincronizacao(entrada(&pasta, "B")).unwrap();
        usar(&casa_a);
        carregar_dados_institucionais_sincronizacao(pasta.clone(), Some("A".into())).unwrap();

        for casa in [&casa_a, &casa_b] {
            assert!(casa.join("dados/persistidos/turma_6o Ano A.json").is_file());
            assert!(casa.join("dados/persistidos/turma_7o Ano B.json").is_file());
        }
        let estado = grupo.join("state");
        assert!(estado.join("institutional/A.json").is_file());
        assert!(estado.join("institutional/B.json").is_file());
        // Ninguém na versão antiga: a pasta compartilhada antiga nem nasce.
        assert!(!estado.join("institutional-data").exists());
        // A foto igual nos dois computadores vira um blob só.
        let blobs_da_foto = fs::read_dir(estado.join("blobs"))
            .unwrap()
            .flatten()
            .filter(|e| fs::read(e.path()).unwrap() == foto.as_bytes())
            .count();
        assert_eq!(blobs_da_foto, 1);

        // C, numa versão antiga, sincronizou agora há pouco.
        gravar(
            &estado.join("peers/C.json"),
            &json!({ "tipo": "coordenacaoop-workgroup-state", "versao": 1, "generatedAt": Local::now().to_rfc3339() })
                .to_string(),
        );
        // A muda algo e publica: vai também para a pasta antiga, para C ver.
        usar(&casa_a);
        gravar(&casa_a.join("dados/persistidos/turma_8o Ano C.json"), &turma("8º Ano C"));
        publicar_dados_institucionais_sincronizacao(entrada(&pasta, "A")).unwrap();
        assert!(estado.join("institutional-data/dados/persistidos/turma_8o Ano C.json").is_file());

        // B não puxa a pasta antiga publicada por A (o manifesto de A já traz
        // o mesmo), e recebe a turma nova pelo manifesto de A.
        usar(&casa_b);
        carregar_dados_institucionais_sincronizacao(pasta.clone(), Some("B".into())).unwrap();
        assert!(casa_b.join("dados/persistidos/turma_8o Ano C.json").is_file());

        // C publica do jeito antigo; os dois da versão nova recebem.
        let dados_antigos = estado.join("institutional-data/dados");
        gravar(&dados_antigos.join("persistidos/turma_9o Ano D.json"), &turma("9º Ano D"));
        let conteudo = inventariar_dados_institucionais(&dados_antigos).unwrap();
        let depois = (Local::now() + chrono::Duration::seconds(5)).to_rfc3339();
        gravar(
            &estado.join("institutional-data/manifest.json"),
            &json!({ "tipo": "coordenacaoop-institutional-data", "device_id": "C", "atualizado_em": depois, "conteudo": conteudo })
                .to_string(),
        );
        carregar_dados_institucionais_sincronizacao(pasta.clone(), Some("B".into())).unwrap();
        assert!(casa_b.join("dados/persistidos/turma_9o Ano D.json").is_file());
        usar(&casa_a);
        carregar_dados_institucionais_sincronizacao(pasta.clone(), Some("A".into())).unwrap();
        assert!(casa_a.join("dados/persistidos/turma_9o Ano D.json").is_file());

        BASE_DE_TESTE.with(|base| *base.borrow_mut() = None);
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn manifesto_com_blob_ainda_chegando_nao_e_montado() {
        let raiz = pasta_de_teste("blob_chegando");
        let origem = raiz.join("dados");
        gravar(&origem.join("persistidos/turma_x.json"), "{}");
        gravar(&origem.join("fotos/1.jpg"), "foto");
        let inventario = inventariar_dados_institucionais(&origem).unwrap();
        let blobs = raiz.join("blobs");
        gravar_blobs(&origem, &blobs, &inventario).unwrap();
        // Um blob chegou pela metade.
        fs::write(blobs.join(nome_do_blob(&inventario["fotos/1.jpg"])), "fo").unwrap();
        let mut total = 0;
        let faltando = materializar_manifesto(&inventario, &blobs, &raiz.join("montado"), &mut total).unwrap();
        assert_eq!(faltando, vec!["fotos/1.jpg".to_string()]);
        assert_eq!(total, 1);
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn manifestos_proprio_aposentado_e_de_conflito_ficam_de_fora() {
        let raiz = pasta_de_teste("manifestos");
        let agora = Local::now();
        let manifesto = |id: &str, quando: chrono::DateTime<Local>| {
            json!({ "tipo": TIPO_MANIFESTO_DISPOSITIVO, "device_id": id, "atualizado_em": quando.to_rfc3339(), "conteudo": {} })
                .to_string()
        };
        gravar(&raiz.join("institutional/eu.json"), &manifesto("eu", agora));
        gravar(&raiz.join("institutional/colega.json"), &manifesto("colega", agora));
        gravar(&raiz.join("institutional/colega-DESKTOP-1.json"), &manifesto("colega", agora));
        gravar(&raiz.join("institutional/colega (1).json"), &manifesto("colega", agora));
        gravar(
            &raiz.join("institutional/velho.json"),
            &manifesto("velho", agora - chrono::Duration::days(120)),
        );
        let ids: Vec<String> = listar_manifestos_dispositivos(&raiz, Some("eu"), agora.timestamp_millis())
            .into_iter()
            .map(|m| m.device_id)
            .collect();
        assert_eq!(ids, vec!["colega".to_string()]);
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn pasta_antiga_so_e_gravada_com_colega_desatualizado_ativo() {
        let raiz = pasta_de_teste("colega_antigo");
        let agora = Local::now();
        let estado_de = |formato: Option<u64>, quando: chrono::DateTime<Local>| {
            let mut payload = json!({ "generatedAt": quando.to_rfc3339() });
            if let Some(formato) = formato {
                payload["formatoSincronizacao"] = json!(formato);
            }
            payload.to_string()
        };
        gravar(&raiz.join("peers/eu.json"), &estado_de(None, agora));
        gravar(&raiz.join("peers/novo.json"), &estado_de(Some(2), agora));
        gravar(&raiz.join("peers/aposentado.json"), &estado_de(None, agora - chrono::Duration::days(30)));
        assert!(!precisa_publicar_pasta_antiga(&raiz, "eu", agora.timestamp_millis()));
        gravar(&raiz.join("peers/antigo.json"), &estado_de(None, agora - chrono::Duration::days(2)));
        assert!(precisa_publicar_pasta_antiga(&raiz, "eu", agora.timestamp_millis()));
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn copias_de_conflito_do_google_drive_e_do_rclone_sao_reconhecidas() {
        let raiz = pasta_de_teste("conflitos_nuvem");
        gravar(&raiz.join("turma_6A.json"), "{}");
        for nome in ["turma_6A (1).json", "turma_6A.conflict1.json", "turma_6A.conflict12.json"] {
            gravar(&raiz.join(nome), "{}");
            assert!(eh_copia_de_conflito_sync(&raiz.join(nome)), "{nome}");
        }
        // Parênteses de verdade no nome, sem o original ao lado, não é conflito.
        gravar(&raiz.join("turma_EJA (noite).json"), "{}");
        assert!(!eh_copia_de_conflito_sync(&raiz.join("turma_EJA (noite).json")));
        gravar(&raiz.join("turma_7B (2).json"), "{}");
        assert!(!eh_copia_de_conflito_sync(&raiz.join("turma_7B (2).json")));
        let _ = fs::remove_dir_all(&raiz);
    }
}
