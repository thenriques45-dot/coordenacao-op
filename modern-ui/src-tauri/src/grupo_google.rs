// Sincronização do grupo pelo Google, sem pasta compartilhada na nuvem.
//
// Quem cria o grupo publica, na própria conta Google, um Apps Script
// ("carteiro", ver scripts/grupo-google/Code.gs) que guarda os arquivos do
// grupo numa pasta do Drive dessa pessoa. Os colegas só colam o código do
// grupo (endereço do carteiro + segredo), sem login no Google.
//
// O app continua sincronizando por pasta: a pasta do grupo passa a ser uma
// cópia local (`grupo-google/` em app_base_dir), e `trocar_com_grupo_google`
// a mantém em dia com o carteiro antes de cada ciclo. Funciona porque, no
// formato 2 da sincronização (ver sync.rs), cada arquivo tem um dono só ou é
// gravado uma vez e nunca reescrito: subir os próprios arquivos e baixar os
// dos outros nunca gera conflito.

use crate::*;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs, io,
    path::{Path, PathBuf},
    time::Duration,
};

const CODE_GRUPO_GS: &str = include_str!("../scripts/grupo-google/Code.gs");
const APPSSCRIPT_GRUPO_JSON: &str = include_str!("../scripts/grupo-google/appsscript.json");
const PREFIXO_CODIGO: &str = "COP1-";
/// Tamanho máximo (antes do base64) de cada envio ou recebimento. O Apps
/// Script aceita bem mais, mas pedidos menores falham menos e mostram
/// progresso.
const LOTE_MAXIMO_BYTES: u64 = 8 * 1024 * 1024;
const INTERVALO_LIMPEZA_MS: i64 = 24 * 60 * 60 * 1000;
const IDADE_BLOB_SEM_USO_NO_GRUPO_MS: i64 = 3 * 24 * 60 * 60 * 1000;

#[derive(Serialize, Deserialize, Default, Clone)]
pub(crate) struct ConfigGrupoGoogle {
    pub(crate) url: String,
    pub(crate) token: String,
    /// Só em quem criou o grupo: permite trocar o código.
    #[serde(default)]
    pub(crate) script_id: String,
    #[serde(default)]
    pub(crate) deployment_id: String,
    #[serde(default)]
    pub(crate) ultima_limpeza_ms: i64,
}

#[derive(Serialize)]
pub(crate) struct GrupoGoogleStatus {
    pub(crate) configurado: bool,
    pub(crate) criador: bool,
    pub(crate) codigo: String,
    pub(crate) url: String,
    pub(crate) pasta: String,
}

#[derive(Serialize)]
pub(crate) struct TrocaGrupoGoogle {
    pub(crate) pasta: String,
    pub(crate) enviados: usize,
    pub(crate) recebidos: usize,
}

#[derive(Serialize, Deserialize)]
struct ConteudoCodigo {
    u: String,
    t: String,
}

fn config_grupo_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join("grupo_google.json"))
}

fn carregar_config_grupo() -> Option<ConfigGrupoGoogle> {
    let texto = fs::read_to_string(config_grupo_path().ok()?).ok()?;
    serde_json::from_str::<ConfigGrupoGoogle>(&texto)
        .ok()
        .filter(|config| !config.url.is_empty() && !config.token.is_empty())
}

fn salvar_config_grupo(config: &ConfigGrupoGoogle) -> Result<(), String> {
    let path = config_grupo_path().map_err(|err| err.to_string())?;
    let texto = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&path, &texto).map_err(|err| err.to_string())
}

pub(crate) fn pasta_espelho_grupo() -> io::Result<PathBuf> {
    let pasta = app_base_dir()?.join("grupo-google");
    fs::create_dir_all(&pasta)?;
    Ok(pasta)
}

pub(crate) fn montar_codigo_grupo(url: &str, token: &str) -> String {
    let json = serde_json::to_vec(&ConteudoCodigo { u: url.to_string(), t: token.to_string() }).unwrap_or_default();
    format!("{PREFIXO_CODIGO}{}", base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json))
}

pub(crate) fn ler_codigo_grupo(codigo: &str) -> Result<(String, String), String> {
    let invalido = || "Código do grupo inválido. Copie o código inteiro, começando por COP1-.".to_string();
    let limpo: String = codigo.chars().filter(|c| !c.is_whitespace()).collect();
    let corpo = limpo.strip_prefix(PREFIXO_CODIGO).ok_or_else(invalido)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(corpo)
        .map_err(|_| invalido())?;
    let conteudo: ConteudoCodigo = serde_json::from_slice(&bytes).map_err(|_| invalido())?;
    if !conteudo.u.starts_with("https://script.google.com/") || conteudo.t.len() < 32 {
        return Err(invalido());
    }
    Ok((conteudo.u, conteudo.t))
}

/// Só estes caminhos trafegam pelo carteiro (o Code.gs confere o mesmo).
pub(crate) fn caminho_do_grupo_valido(caminho: &str) -> bool {
    let partes: Vec<&str> = caminho.split('/').collect();
    let nome_ok = |nome: &str, extensao: &str| {
        nome.strip_suffix(extensao).is_some_and(|base| {
            !base.is_empty() && base.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
    };
    match partes.as_slice() {
        ["state", "institutional" | "peers", nome] | ["devices", nome] => nome_ok(nome, ".json"),
        ["state", "blobs", nome] => nome.split_once('-').is_some_and(|(hash, tamanho)| {
            !hash.is_empty()
                && hash.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
                && !tamanho.is_empty()
                && tamanho.chars().all(|c| c.is_ascii_digit())
        }),
        _ => false,
    }
}

fn cliente_http() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|err| err.to_string())
}

fn chamar_carteiro(
    client: &reqwest::blocking::Client,
    config: &ConfigGrupoGoogle,
    mut pedido: Value,
) -> Result<Value, String> {
    pedido["t"] = Value::String(config.token.clone());
    let resposta = client
        .post(&config.url)
        .header("Content-Type", "text/plain;charset=utf-8")
        .body(pedido.to_string())
        .send()
        .map_err(|err| format!("Sem conexão com o grupo no Google: {err}"))?;
    let status = resposta.status();
    let texto = resposta.text().unwrap_or_default();
    let Ok(valor) = serde_json::from_str::<Value>(&texto) else {
        // Sem autorização do dono, o Google devolve uma página HTML de login.
        return Err(format!(
            "O grupo no Google não respondeu como esperado (HTTP {status}). Se o grupo acabou de ser criado, \
             quem o criou precisa autorizá-lo: em Configurações > Sincronização, clique em \"Autorizar no Google\"."
        ));
    };
    if let Some(erro) = valor.get("erro").and_then(Value::as_str) {
        return Err(format!("Grupo no Google: {erro}"));
    }
    Ok(valor)
}

fn publicar_carteiro(
    client: &reqwest::blocking::Client,
    access_token: &str,
    script_id: &str,
    token: &str,
) -> Result<i64, String> {
    subir_conteudo(
        client,
        access_token,
        script_id,
        vec![
            ("Code", "SERVER_JS", CODE_GRUPO_GS.replace("__TOKEN__", token)),
            ("appsscript", "JSON", APPSSCRIPT_GRUPO_JSON.to_string()),
        ],
    )?;
    criar_versao(client, access_token, script_id)
}

fn criar_grupo_google_bloqueante() -> Result<GrupoGoogleStatus, String> {
    let access_token = obter_access_token()?;
    let client = cliente_http()?;
    let token = gerar_bytes_aleatorios_base64url(32);
    let script_id = criar_projeto(&client, &access_token, "Grupo de sincronização — CoordenacaoOP")?;
    let versao = publicar_carteiro(&client, &access_token, &script_id, &token)?;
    let (deployment_id, url) = criar_deployment(&client, &access_token, &script_id, versao)?;
    salvar_config_grupo(&ConfigGrupoGoogle { url, token, script_id, deployment_id, ultima_limpeza_ms: 0 })?;
    status_grupo_google()
}

fn trocar_codigo_grupo_google_bloqueante() -> Result<GrupoGoogleStatus, String> {
    let mut config = carregar_config_grupo().ok_or("Este computador não está em nenhum grupo do Google.")?;
    if config.script_id.is_empty() || config.deployment_id.is_empty() {
        return Err("Só quem criou o grupo pode trocar o código.".to_string());
    }
    let access_token = obter_access_token()?;
    let client = cliente_http()?;
    let token = gerar_bytes_aleatorios_base64url(32);
    let versao = publicar_carteiro(&client, &access_token, &config.script_id, &token)?;
    let (_, url) = atualizar_deployment(&client, &access_token, &config.script_id, &config.deployment_id, versao)?;
    config.url = url;
    config.token = token;
    salvar_config_grupo(&config)?;
    status_grupo_google()
}

/// Cria o grupo: publica o carteiro na conta Google de quem clicou. Depois
/// disso essa pessoa precisa abrir o endereço uma vez no navegador para
/// autorizar o script a usar o Drive dela (ver `url` no retorno).
#[tauri::command(async)]
pub(crate) fn criar_grupo_google() -> Result<GrupoGoogleStatus, String> {
    // Thread própria: reqwest::blocking e o login pelo navegador não podem
    // rodar dentro do runtime async do Tauri (ver provisionar_planejamento_automatico).
    std::thread::spawn(criar_grupo_google_bloqueante)
        .join()
        .map_err(|_| "Falha interna ao criar o grupo no Google.".to_string())?
}

#[tauri::command(async)]
pub(crate) fn trocar_codigo_grupo_google() -> Result<GrupoGoogleStatus, String> {
    std::thread::spawn(trocar_codigo_grupo_google_bloqueante)
        .join()
        .map_err(|_| "Falha interna ao trocar o código do grupo.".to_string())?
}

#[tauri::command(async)]
pub(crate) fn entrar_grupo_google(codigo: String) -> Result<GrupoGoogleStatus, String> {
    let (url, token) = ler_codigo_grupo(&codigo)?;
    let config = ConfigGrupoGoogle { url, token, ..Default::default() };
    std::thread::spawn(move || {
        let client = cliente_http()?;
        chamar_carteiro(&client, &config, serde_json::json!({ "a": "info" }))?;
        // Quem cria o grupo e cola o próprio código não perde o que permite
        // trocá-lo depois.
        let anterior = carregar_config_grupo().filter(|anterior| anterior.url == config.url);
        let config = match anterior {
            Some(anterior) => ConfigGrupoGoogle { token: config.token, ..anterior },
            None => config,
        };
        salvar_config_grupo(&config)?;
        status_grupo_google()
    })
    .join()
    .map_err(|_| "Falha interna ao entrar no grupo.".to_string())?
}

#[tauri::command]
pub(crate) fn sair_grupo_google() -> Result<(), String> {
    let path = config_grupo_path().map_err(|err| err.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn status_grupo_google() -> Result<GrupoGoogleStatus, String> {
    let pasta = pasta_espelho_grupo().map_err(|err| err.to_string())?.to_string_lossy().to_string();
    Ok(match carregar_config_grupo() {
        Some(config) => GrupoGoogleStatus {
            configurado: true,
            criador: !config.script_id.is_empty(),
            codigo: montar_codigo_grupo(&config.url, &config.token),
            url: config.url,
            pasta,
        },
        None => GrupoGoogleStatus { configurado: false, criador: false, codigo: String::new(), url: String::new(), pasta },
    })
}

/// (caminho na pasta do grupo, tamanho em bytes).
type ItensDoGrupo = Vec<(String, u64)>;

/// Divide `itens` em lotes de até LOTE_MAXIMO_BYTES.
fn em_lotes(itens: ItensDoGrupo) -> Vec<Vec<String>> {
    let mut lotes: Vec<Vec<String>> = Vec::new();
    let mut atual: Vec<String> = Vec::new();
    let mut tamanho_atual = 0;
    for (caminho, tamanho) in itens {
        if !atual.is_empty() && tamanho_atual + tamanho > LOTE_MAXIMO_BYTES {
            lotes.push(std::mem::take(&mut atual));
            tamanho_atual = 0;
        }
        tamanho_atual += tamanho;
        atual.push(caminho);
    }
    if !atual.is_empty() {
        lotes.push(atual);
    }
    lotes
}

fn tamanho_descrito(descricao: &str) -> u64 {
    descricao.split(':').next().and_then(|tamanho| tamanho.parse().ok()).unwrap_or(0)
}

fn descricao_local(caminho: &Path) -> Option<String> {
    fs::read(caminho).ok().map(|bytes| descrever_conteudo(&bytes))
}

/// O que precisa subir: os blobs do próprio manifesto que o grupo ainda não
/// tem e, depois deles, os próprios arquivos que mudaram. Os blobs vêm
/// primeiro para que um colega nunca veja um manifesto apontando para algo
/// que ainda não chegou.
pub(crate) fn planejar_envio(
    espelho: &Path,
    device_id: &str,
    remotos: &BTreeMap<String, String>,
    blobs_remotos: &BTreeSet<String>,
) -> ItensDoGrupo {
    let id = nome_arquivo_seguro(device_id);
    let manifesto = format!("state/institutional/{id}.json");
    let mut envio = Vec::new();
    let conteudo = fs::read(espelho.join(&manifesto))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|valor| valor.get("conteudo").cloned())
        .and_then(|conteudo| serde_json::from_value::<BTreeMap<String, String>>(conteudo).ok())
        .unwrap_or_default();
    let descricoes: BTreeSet<&String> = conteudo.values().collect();
    for descricao in descricoes {
        let nome = nome_do_blob(descricao);
        let caminho = format!("state/blobs/{nome}");
        if !blobs_remotos.contains(&nome) && descricao_local(&espelho.join(&caminho)).as_ref() == Some(descricao) {
            envio.push((caminho, tamanho_descrito(descricao)));
        }
    }
    for caminho in [manifesto, format!("state/peers/{id}.json"), format!("devices/{id}.json")] {
        if let Some(descricao) = descricao_local(&espelho.join(&caminho)) {
            if remotos.get(&caminho) != Some(&descricao) {
                envio.push((caminho, tamanho_descrito(&descricao)));
            }
        }
    }
    envio
}

/// O que precisa descer: arquivos dos colegas que mudaram e, para cada
/// manifesto de colega já aqui, os blobs que ainda faltam.
pub(crate) fn planejar_recebimento(
    espelho: &Path,
    device_id: &str,
    remotos: &BTreeMap<String, String>,
    blobs_remotos: &BTreeSet<String>,
) -> (ItensDoGrupo, ItensDoGrupo) {
    let id = nome_arquivo_seguro(device_id);
    let proprios = [
        format!("state/institutional/{id}.json"),
        format!("state/peers/{id}.json"),
        format!("devices/{id}.json"),
    ];
    let arquivos = remotos
        .iter()
        .filter(|(caminho, _)| caminho_do_grupo_valido(caminho) && !proprios.contains(caminho))
        .filter(|(caminho, descricao)| descricao_local(&espelho.join(caminho.as_str())).as_ref() != Some(*descricao))
        .map(|(caminho, descricao)| (caminho.clone(), tamanho_descrito(descricao)))
        .collect();

    let mut blobs = BTreeMap::new();
    for caminho in remotos.keys().filter(|c| c.starts_with("state/institutional/") && !proprios.contains(c)) {
        let Some(conteudo) = fs::read(espelho.join(caminho))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .and_then(|valor| valor.get("conteudo").cloned())
            .and_then(|conteudo| serde_json::from_value::<BTreeMap<String, String>>(conteudo).ok())
        else {
            continue;
        };
        for descricao in conteudo.values() {
            let nome = nome_do_blob(descricao);
            if blobs_remotos.contains(&nome) && !espelho.join("state/blobs").join(&nome).is_file() {
                blobs.insert(format!("state/blobs/{nome}"), tamanho_descrito(descricao));
            }
        }
    }
    (arquivos, blobs.into_iter().collect())
}

fn baixar_lotes(
    client: &reqwest::blocking::Client,
    config: &ConfigGrupoGoogle,
    espelho: &Path,
    itens: ItensDoGrupo,
) -> Result<usize, String> {
    let mut recebidos = 0;
    for lote in em_lotes(itens) {
        let resposta = chamar_carteiro(client, config, serde_json::json!({ "a": "baixar", "caminhos": lote }))?;
        let Some(arquivos) = resposta.get("arquivos").and_then(Value::as_object) else {
            continue;
        };
        for (caminho, conteudo) in arquivos {
            if !caminho_do_grupo_valido(caminho) {
                continue;
            }
            let Some(bytes) = conteudo
                .as_str()
                .and_then(|texto| base64::engine::general_purpose::STANDARD.decode(texto).ok())
            else {
                continue;
            };
            gravar_no_espelho(&espelho.join(caminho), &bytes).map_err(|err| err.to_string())?;
            recebidos += 1;
        }
    }
    Ok(recebidos)
}

fn gravar_no_espelho(destino: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(pai) = destino.parent() {
        fs::create_dir_all(pai)?;
    }
    let tmp = destino.with_extension("baixando");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, destino)
}

fn trocar_com_grupo_google_bloqueante(device_id: String) -> Result<TrocaGrupoGoogle, String> {
    let mut config = carregar_config_grupo().ok_or("Este computador não está em nenhum grupo do Google.")?;
    let espelho = pasta_espelho_grupo().map_err(|err| err.to_string())?;
    let client = cliente_http()?;

    let indice = chamar_carteiro(&client, &config, serde_json::json!({ "a": "indice" }))?;
    let remotos: BTreeMap<String, String> = indice
        .get("arquivos")
        .cloned()
        .and_then(|valor| serde_json::from_value(valor).ok())
        .unwrap_or_default();
    let blobs_remotos: BTreeSet<String> = indice
        .get("blobs")
        .cloned()
        .and_then(|valor| serde_json::from_value(valor).ok())
        .unwrap_or_default();

    let mut enviados = 0;
    for lote in em_lotes(planejar_envio(&espelho, &device_id, &remotos, &blobs_remotos)) {
        let mut arquivos = serde_json::Map::new();
        for caminho in lote {
            let bytes = fs::read(espelho.join(&caminho)).map_err(|err| err.to_string())?;
            arquivos.insert(
                caminho,
                serde_json::json!({
                    "d": descrever_conteudo(&bytes),
                    "b": base64::engine::general_purpose::STANDARD.encode(&bytes),
                }),
            );
        }
        enviados += arquivos.len();
        chamar_carteiro(&client, &config, serde_json::json!({ "a": "enviar", "arquivos": arquivos }))?;
    }

    // Primeiro os manifestos e estados dos colegas; com eles aqui, os blobs
    // que eles apontam.
    let (arquivos, _) = planejar_recebimento(&espelho, &device_id, &remotos, &blobs_remotos);
    let mut recebidos = baixar_lotes(&client, &config, &espelho, arquivos)?;
    let (_, blobs) = planejar_recebimento(&espelho, &device_id, &remotos, &blobs_remotos);
    recebidos += baixar_lotes(&client, &config, &espelho, blobs)?;

    let agora_ms = chrono::Local::now().timestamp_millis();
    if agora_ms - config.ultima_limpeza_ms > INTERVALO_LIMPEZA_MS
        && chamar_carteiro(
            &client,
            &config,
            serde_json::json!({ "a": "limpar", "idadeMinimaMs": IDADE_BLOB_SEM_USO_NO_GRUPO_MS }),
        )
        .is_ok()
    {
        config.ultima_limpeza_ms = agora_ms;
        salvar_config_grupo(&config)?;
    }

    Ok(TrocaGrupoGoogle { pasta: espelho.to_string_lossy().to_string(), enviados, recebidos })
}

/// Sobe o que este computador publicou na cópia local da pasta do grupo e
/// baixa o que os colegas publicaram. Devolve a pasta a usar nos comandos de
/// sincronização por pasta.
#[tauri::command(async)]
pub(crate) fn trocar_com_grupo_google(device_id: String) -> Result<TrocaGrupoGoogle, String> {
    std::thread::spawn(move || trocar_com_grupo_google_bloqueante(device_id))
        .join()
        .map_err(|_| "Falha interna ao sincronizar com o grupo no Google.".to_string())?
}

#[cfg(test)]
mod testes {
    use super::*;

    fn pasta_de_teste(nome: &str) -> PathBuf {
        let pasta = std::env::temp_dir().join(format!("coordop_grupo_{nome}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&pasta);
        fs::create_dir_all(&pasta).unwrap();
        pasta
    }

    fn gravar(caminho: &Path, bytes: &[u8]) {
        fs::create_dir_all(caminho.parent().unwrap()).unwrap();
        fs::write(caminho, bytes).unwrap();
    }

    #[test]
    fn codigo_do_grupo_vai_e_volta() {
        let token = gerar_bytes_aleatorios_base64url(32);
        let url = "https://script.google.com/macros/s/AKfy/exec";
        let codigo = montar_codigo_grupo(url, &token);
        assert!(codigo.starts_with("COP1-"));
        // Colado com quebra de linha no meio, ainda vale.
        let colado = format!(" {}\n{} ", &codigo[..20], &codigo[20..]);
        assert_eq!(ler_codigo_grupo(&colado).unwrap(), (url.to_string(), token));
        assert!(ler_codigo_grupo("COP1-abc").is_err());
        let fora_do_google = montar_codigo_grupo("https://exemplo.com/exec", &gerar_bytes_aleatorios_base64url(32));
        assert!(ler_codigo_grupo(&fora_do_google).is_err());
    }

    #[test]
    fn so_caminhos_do_formato_novo_trafegam() {
        for valido in [
            "state/institutional/abc-123.json",
            "state/peers/abc_1.json",
            "devices/abc.json",
            "state/blobs/00ff12-345",
        ] {
            assert!(caminho_do_grupo_valido(valido), "{valido}");
        }
        for invalido in [
            "state/institutional/../config.json",
            "state/institutional-data/manifest.json",
            "state/workspace-state.json",
            "state/blobs/00FF-1",
            "state/blobs/abc",
            "../fora.json",
            "devices/a b.json",
        ] {
            assert!(!caminho_do_grupo_valido(invalido), "{invalido}");
        }
    }

    #[test]
    fn envio_sobe_blobs_antes_do_manifesto_e_so_o_que_mudou() {
        let espelho = pasta_de_teste("envio");
        let foto = b"foto".to_vec();
        let turma = b"{}".to_vec();
        let d_foto = descrever_conteudo(&foto);
        let d_turma = descrever_conteudo(&turma);
        gravar(&espelho.join("state/blobs").join(nome_do_blob(&d_foto)), &foto);
        gravar(&espelho.join("state/blobs").join(nome_do_blob(&d_turma)), &turma);
        let manifesto = serde_json::json!({ "conteudo": { "fotos/1.jpg": d_foto, "persistidos/t.json": d_turma } });
        gravar(&espelho.join("state/institutional/eu.json"), manifesto.to_string().as_bytes());
        gravar(&espelho.join("state/peers/eu.json"), b"{\"x\":1}");

        // O grupo já tem a turma e o estado igual; falta a foto e o manifesto.
        let remotos = BTreeMap::from([(
            "state/peers/eu.json".to_string(),
            descrever_conteudo(b"{\"x\":1}"),
        )]);
        let blobs = BTreeSet::from([nome_do_blob(&d_turma)]);
        let envio: Vec<String> = planejar_envio(&espelho, "eu", &remotos, &blobs).into_iter().map(|(c, _)| c).collect();
        assert_eq!(
            envio,
            vec![format!("state/blobs/{}", nome_do_blob(&d_foto)), "state/institutional/eu.json".to_string()]
        );
        let _ = fs::remove_dir_all(&espelho);
    }

    #[test]
    fn recebimento_ignora_os_proprios_e_pede_blobs_que_faltam() {
        let espelho = pasta_de_teste("recebimento");
        let d_foto = descrever_conteudo(b"foto");
        let manifesto_colega = serde_json::json!({ "conteudo": { "fotos/1.jpg": d_foto } }).to_string();
        let remotos = BTreeMap::from([
            ("state/institutional/eu.json".to_string(), descrever_conteudo(b"meu")),
            ("state/institutional/colega.json".to_string(), descrever_conteudo(manifesto_colega.as_bytes())),
            ("state/peers/colega.json".to_string(), descrever_conteudo(b"igual")),
        ]);
        gravar(&espelho.join("state/peers/colega.json"), b"igual");
        let blobs = BTreeSet::from([nome_do_blob(&d_foto)]);

        let (arquivos, blobs_faltando) = planejar_recebimento(&espelho, "eu", &remotos, &blobs);
        assert_eq!(arquivos.iter().map(|(c, _)| c.as_str()).collect::<Vec<_>>(), vec!["state/institutional/colega.json"]);
        // O manifesto do colega ainda não chegou aqui: os blobs vêm depois.
        assert!(blobs_faltando.is_empty());

        gravar(&espelho.join("state/institutional/colega.json"), manifesto_colega.as_bytes());
        let (arquivos, blobs_faltando) = planejar_recebimento(&espelho, "eu", &remotos, &blobs);
        assert!(arquivos.is_empty());
        assert_eq!(blobs_faltando, vec![(format!("state/blobs/{}", nome_do_blob(&d_foto)), 4)]);
        let _ = fs::remove_dir_all(&espelho);
    }

    #[test]
    fn lotes_respeitam_o_tamanho_maximo() {
        let itens = vec![
            ("a".to_string(), LOTE_MAXIMO_BYTES - 10),
            ("b".to_string(), 20),
            ("c".to_string(), LOTE_MAXIMO_BYTES * 2),
            ("d".to_string(), 1),
        ];
        assert_eq!(
            em_lotes(itens),
            vec![vec!["a".to_string()], vec!["b".to_string()], vec!["c".to_string()], vec!["d".to_string()]]
        );
    }
}
