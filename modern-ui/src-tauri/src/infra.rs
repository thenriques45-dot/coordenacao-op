
// Infraestrutura: trava global de dados, caminhos do app, escrita atômica e espelho do estado da interface.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use chrono::Local;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    env, fs, io,
    path::{Path, PathBuf},
    sync::{Condvar, Mutex, PoisonError},
};


// Serializa o acesso aos arquivos locais (dados/ e config/) entre os comandos
// async e os da thread principal. Antes de existirem comandos async, essa
// serialização era garantida pela própria thread principal; a trava preserva a
// mesma semântica sem congelar a interface durante operações demoradas.
// Regras: todo comando async que toca dados/ segura a trava. Comandos não
// podem chamar outros comandos que travam — a trava não é reentrante.
//
// REGRA CRÍTICA: um comando que segura esta trava PRECISA ser
// `#[tauri::command(async)]`. Comando sem `(async)` roda na thread principal,
// a mesma que processa a janela; se ele esperar aqui enquanto a
// sincronização institucional segura a trava, a interface inteira congela
// pelo tempo todo da espera. Se um comando síncrono precisar gravar em
// dados/, marque-o `(async)` antes de dar `travar_dados()`.
// A trava é JUSTA (atende por ordem de chegada) de propósito, e não um
// Mutex comum. Enquanto os comandos rodavam na thread principal, eles eram
// atendidos na ordem em que chegavam pelo IPC — e o frontend depende disso:
// o Conselho dispara `salvar_perfil_turma`/`salvar_alunos_destaque` a cada
// tecla, sem `await`, mandando o objeto INTEIRO a cada vez. Com um Mutex
// comum, duas gravações represadas atrás de uma sincronização demorada
// seriam liberadas em ordem arbitrária, e a versão mais antiga venceria — o
// coordenador perderia a edição sem nenhum aviso. Por senha, a ordem de
// chegada é preservada e a janela de inversão volta a ser o tempo de
// despacho da thread (microssegundos), como era antes.
pub(crate) static DADOS_LOCK: TravaDados = TravaDados::nova();

pub(crate) struct TravaDados {
    fila: Mutex<FilaTrava>,
    vez: Condvar,
}

struct FilaTrava {
    proxima_senha: u64,
    senha_da_vez: u64,
    ocupada: bool,
}

/// Solta a trava e acorda o próximo da fila ao sair de escopo. Como cada
/// gravação de arquivo é atômica, um panic segurando a trava é seguro: o
/// desenrolar da pilha executa este Drop e a fila anda.
pub(crate) struct GuardaDados<'a> {
    trava: &'a TravaDados,
}

impl TravaDados {
    pub(crate) const fn nova() -> Self {
        Self {
            fila: Mutex::new(FilaTrava {
                proxima_senha: 0,
                senha_da_vez: 0,
                ocupada: false,
            }),
            vez: Condvar::new(),
        }
    }

    pub(crate) fn travar(&self) -> GuardaDados<'_> {
        // Envenenamento é ignorado (ver GuardaDados): a fila em si é só três
        // inteiros, sempre num estado coerente.
        let mut fila = self.fila.lock().unwrap_or_else(PoisonError::into_inner);
        let minha_senha = fila.proxima_senha;
        fila.proxima_senha += 1;
        while fila.ocupada || fila.senha_da_vez != minha_senha {
            fila = self
                .vez
                .wait(fila)
                .unwrap_or_else(PoisonError::into_inner);
        }
        fila.ocupada = true;
        GuardaDados { trava: self }
    }
}

impl Drop for GuardaDados<'_> {
    fn drop(&mut self) {
        let mut fila = self
            .trava
            .fila
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        fila.ocupada = false;
        fila.senha_da_vez += 1;
        // notify_all e não notify_one: quem acorda pode não ser o dono da
        // senha da vez, e voltaria a dormir deixando a fila parada.
        self.trava.vez.notify_all();
    }
}

pub(crate) fn travar_dados() -> GuardaDados<'static> {
    DADOS_LOCK.travar()
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
    gravar_com_flush(&temporario, conteudo.as_bytes())?;
    fs::rename(&temporario, caminho).inspect_err(|_err| {
        let _ = fs::remove_file(&temporario);
    })
}

/// `fs::write` + `sync_all`. Sem o flush, um desligamento ou hibernação logo
/// depois do rename deixava o NTFS com o tamanho novo gravado mas o conteúdo
/// não: o arquivo de turma voltava com zeros no fim ("trailing characters")
/// ou cortado no meio, e a listagem inteira de turmas parava de carregar.
pub(crate) fn gravar_com_flush(caminho: &Path, conteudo: &[u8]) -> io::Result<()> {
    use std::io::Write;
    let mut arquivo = fs::File::create(caminho)?;
    arquivo.write_all(conteudo)?;
    arquivo.sync_all()
}

/// Descarta zeros e espaços depois do fim do JSON — o resto que um
/// desligamento no meio da gravação deixava nos arquivos (ver
/// gravar_com_flush). O conteúdo em si continua passando pelo parser normal.
pub(crate) fn sem_lixo_no_fim(texto: &str) -> &str {
    texto.trim_end_matches(|c: char| c == '\0' || c.is_whitespace())
}

const NOME_INDICE_LOCAL: &str = "_indice.json";

/// Lê o índice local (`_indice.json`) de uma pasta de relatórios — usado por
/// pei.rs e planejamento.rs pra popular a tela de acompanhamento a partir do
/// que já foi gerado em disco, sem depender de nenhum fetch na planilha ter
/// dado certo, e pra decidir (por chave, ver os chamadores) o que pular na
/// próxima geração. Genérico porque a estrutura é idêntica nos dois — só o
/// tipo do registro muda.
pub(crate) fn carregar_indice<T: DeserializeOwned>(pasta_base: &Path) -> Vec<T> {
    fs::read_to_string(pasta_base.join(NOME_INDICE_LOCAL))
        .ok()
        .and_then(|texto| serde_json::from_str(&texto).ok())
        .unwrap_or_default()
}

/// Contraparte de carregar_indice — grava atomicamente, ignorando falha (o
/// índice é só um cache de acompanhamento; os .docx já gerados continuam
/// válidos mesmo se essa gravação específica falhar).
pub(crate) fn salvar_indice<T: Serialize>(pasta_base: &Path, registros: &[T]) {
    if let Ok(texto) = serde_json::to_string_pretty(registros) {
        let _ = escrever_json_atomicamente(&pasta_base.join(NOME_INDICE_LOCAL), &texto);
    }
}

pub(crate) fn app_base_dir() -> io::Result<PathBuf> {
    if let Ok(base) = env::var("COORDENACAOOP_HOME") {
        let base = PathBuf::from(base);
        preparar_base_portatil(&base)?;
        return Ok(base);
    }

    // Na versão da Microsoft Store (MSIX) o Windows desvia em silêncio as
    // gravações em %APPDATA% para a pasta privada do pacote. O app enxergava
    // os arquivos, mas o caminho que mostrava (e passava ao Explorer e ao
    // Word) não existia de verdade fora dele: o relatório "não era salvo".
    // Usando direto a pasta real do pacote, o caminho mostrado é o verdadeiro.
    if let Some(base) = pasta_dados_store() {
        trazer_dados_da_visao_virtualizada(&base);
        preparar_base_portatil(&base)?;
        return Ok(base);
    }

    // No Flatpak o executável fica em /app (só leitura) e a pasta de trabalho
    // costuma ser a pasta pessoal: as regras de modo portátil abaixo gravariam
    // os dados soltos no $HOME. Vai direto para a pasta do sandbox
    // ($XDG_DATA_HOME = ~/.var/app/<id>/data).
    if cfg!(feature = "flatpak") {
        let base = pasta_dados_usuario()?;
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

/// `%LOCALAPPDATA%\Packages\<família do pacote>\LocalCache\Roaming\CoordenacaoOP`:
/// é para lá que o Windows já mandava as gravações em `%APPDATA%\CoordenacaoOP`
/// feitas pela versão da Store, então os dados existentes continuam no lugar.
/// `None` fora da Store ou se o app não estiver rodando como pacote.
#[cfg(all(target_os = "windows", feature = "store"))]
fn pasta_dados_store() -> Option<PathBuf> {
    let familia = familia_pacote_msix()?;
    let local = env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(local)
            .join("Packages")
            .join(familia)
            .join("LocalCache")
            .join("Roaming")
            .join("CoordenacaoOP"),
    )
}

#[cfg(not(all(target_os = "windows", feature = "store")))]
fn pasta_dados_store() -> Option<PathBuf> {
    None
}

#[cfg(all(target_os = "windows", feature = "store"))]
fn familia_pacote_msix() -> Option<String> {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentPackageFamilyName(tamanho: *mut u32, nome: *mut u16) -> i32;
    }
    const ERROR_INSUFFICIENT_BUFFER: i32 = 122;

    let mut tamanho: u32 = 0;
    // Sem pacote a chamada devolve APPMODEL_ERROR_NO_PACKAGE.
    let erro = unsafe { GetCurrentPackageFamilyName(&mut tamanho, std::ptr::null_mut()) };
    if erro != ERROR_INSUFFICIENT_BUFFER || tamanho == 0 {
        return None;
    }
    let mut nome = vec![0u16; tamanho as usize];
    let erro = unsafe { GetCurrentPackageFamilyName(&mut tamanho, nome.as_mut_ptr()) };
    if erro != 0 {
        return None;
    }
    let fim = nome.iter().position(|&c| c == 0).unwrap_or(nome.len());
    let familia = String::from_utf16_lossy(&nome[..fim]);
    (!familia.is_empty()).then_some(familia)
}

/// Até a 4.6.0 a versão da Store lia `%APPDATA%\CoordenacaoOP` pela visão
/// mesclada do Windows (pasta real + pasta do pacote). Quem tinha dados ali de
/// outra instalação via esses arquivos mesmo sem cópia na pasta do pacote; uma
/// vez só, copia o que falta para não perdê-los ao usar o caminho real.
#[cfg(all(target_os = "windows", feature = "store"))]
fn trazer_dados_da_visao_virtualizada(base: &Path) {
    let marcador = base.join(".appdata_mesclado");
    if marcador.exists() {
        return;
    }
    let Some(appdata) = env::var_os("APPDATA") else {
        return;
    };
    let origem = PathBuf::from(appdata).join("CoordenacaoOP");
    if origem.is_dir() && caminhos_diferentes(&origem, base) {
        if copiar_arquivos_faltantes(&origem, base).is_err() {
            return;
        }
    }
    if fs::create_dir_all(base).is_ok() {
        let _ = fs::write(marcador, b"ok");
    }
}

#[cfg(not(all(target_os = "windows", feature = "store")))]
fn trazer_dados_da_visao_virtualizada(_base: &Path) {}

/// Copia de `origem` para `destino` só os arquivos que ainda não existem lá,
/// sem sobrescrever nada.
#[cfg_attr(not(all(target_os = "windows", feature = "store")), allow(dead_code))]
pub(crate) fn copiar_arquivos_faltantes(origem: &Path, destino: &Path) -> io::Result<()> {
    if origem.is_dir() {
        fs::create_dir_all(destino)?;
        for entrada in fs::read_dir(origem)? {
            let entrada = entrada?;
            copiar_arquivos_faltantes(&entrada.path(), &destino.join(entrada.file_name()))?;
        }
    } else if !destino.exists() {
        fs::copy(origem, destino)?;
    }
    Ok(())
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

// `(async)` é obrigatório aqui: sem ele o Tauri roda o comando na thread
// principal, que é a mesma que processa a janela. Como este comando espera
// DADOS_LOCK — presa por minutos durante a sincronização institucional numa
// pasta do OneDrive lenta — a interface congelava inteira a cada gravação do
// espelho (sintoma mais visível no Kanban, que grava a cada ação). Em thread
// separada, a espera pela trava não bloqueia mais o desenho da janela.
#[tauri::command(async)]
pub(crate) fn salvar_estado_ui(chave: String, valor: String) -> Result<(), String> {
    salvar_estado_ui_lote(BTreeMap::from([(chave, valor)]))
}

/// Grava várias chaves do espelho num único ler-modificar-gravar.
///
/// O frontend acumula as gravações e chama este comando (ver o debounce em
/// persistentState.ts): um ciclo de sincronização com 11 peers disparava ~154
/// gravações do arquivo inteiro — que já passa de 2 MB por causa dos avatares
/// em base64 do roster — para no fim persistir um punhado de chaves. Em lote,
/// é uma leitura e uma escrita por ciclo.
#[tauri::command(async)]
pub(crate) fn salvar_estado_ui_lote(entradas: BTreeMap<String, String>) -> Result<(), String> {
    if entradas.is_empty() {
        return Ok(());
    }
    let _dados = travar_dados();
    let mut estado = ler_estado_ui();
    for (chave, valor) in entradas {
        if chave.is_empty() || chave.len() > 120 {
            return Err("Chave de estado inválida.".to_string());
        }
        estado.insert(chave, Value::String(valor));
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copiar_arquivos_faltantes_nao_sobrescreve() {
        let raiz = env::temp_dir().join(format!("coordop_faltantes_{}", std::process::id()));
        let _ = fs::remove_dir_all(&raiz);
        let origem = raiz.join("origem");
        let destino = raiz.join("destino");
        fs::create_dir_all(origem.join("dados").join("relatorios")).unwrap();
        fs::write(origem.join("dados").join("a.json"), "velho").unwrap();
        fs::write(origem.join("dados").join("relatorios").join("r.docx"), "r").unwrap();
        fs::create_dir_all(destino.join("dados")).unwrap();
        fs::write(destino.join("dados").join("a.json"), "novo").unwrap();

        copiar_arquivos_faltantes(&origem, &destino).unwrap();

        assert_eq!(fs::read_to_string(destino.join("dados").join("a.json")).unwrap(), "novo");
        assert_eq!(
            fs::read_to_string(destino.join("dados").join("relatorios").join("r.docx")).unwrap(),
            "r"
        );
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn json_com_zeros_no_fim_volta_a_ser_lido() {
        let texto = format!("{{\"codigo\": \"1ª Série A\"}}\n{}", "\0".repeat(64));
        let valor: Value = serde_json::from_str(sem_lixo_no_fim(&texto)).unwrap();
        assert_eq!(valor["codigo"], "1ª Série A");
    }

    #[test]
    fn json_cortado_continua_sendo_erro() {
        assert!(serde_json::from_str::<Value>(sem_lixo_no_fim("{\"codigo\": \"1ª S")).is_err());
    }

    #[test]
    fn gravacao_atomica_substitui_arquivo_maior_sem_sobras() {
        let pasta = std::env::temp_dir().join(format!("coordop_teste_{}", Local::now().timestamp_nanos_opt().unwrap_or(0)));
        fs::create_dir_all(&pasta).unwrap();
        let caminho = pasta.join("turma_teste.json");
        escrever_json_atomicamente(&caminho, &"x".repeat(4096)).unwrap();
        escrever_json_atomicamente(&caminho, "{}").unwrap();
        assert_eq!(fs::read_to_string(&caminho).unwrap(), "{}");
        let _ = fs::remove_dir_all(&pasta);
    }
}
