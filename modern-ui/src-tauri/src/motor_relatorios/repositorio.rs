// Repositório público de relatórios: navega e baixa definições publicadas
// no repositório GitHub do projeto (pastas oficiais/comunidade), sem exigir
// login — o repo é público. "Oficial" e "comunidade" são só duas pastas
// diferentes; quem entra em cada uma é decidido no GitHub (commit direto do
// mantenedor pra oficiais, Pull Request revisado pra comunidade), não neste
// código — esta tela só lista e baixa o que já está lá.

use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::comandos::salvar_definicao_relatorio;
use super::definicao::{FormatoSaida, ReportDefinition};

pub(crate) const GITHUB_OWNER: &str = "thenriques45-dot";
pub(crate) const GITHUB_REPO: &str = "coordenacao-op";
pub(crate) const GITHUB_BRANCH: &str = "main";
pub(crate) const PASTA_OFICIAIS: &str = "relatorios_repositorio/oficiais";
pub(crate) const PASTA_COMUNIDADE: &str = "relatorios_repositorio/comunidade";
pub(crate) const USER_AGENT: &str = "CoordenacaoOP-App";

const MENSAGEM_TIMEOUT: &str = "O repositório de relatórios não respondeu a tempo. Confira sua conexão com a \
     internet — redes de escola/institucionais às vezes bloqueiam ou atrasam muito o acesso a sites externos \
     como o GitHub — e tente de novo.";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CategoriaRepositorio {
    Oficial,
    Comunidade,
}

#[derive(Serialize)]
pub(crate) struct ItemRepositorio {
    pub(crate) caminho: String,
    pub(crate) categoria: CategoriaRepositorio,
    pub(crate) nome: String,
    pub(crate) descricao: String,
    pub(crate) autor: Option<String>,
    pub(crate) formato_saida: FormatoSaida,
}

/// Só os campos que a API "list directory contents" do GitHub garante —
/// `download_url` vem `null` para submódulos/symlinks, por isso é opcional.
#[derive(Deserialize)]
struct EntradaConteudoGithub {
    name: String,
    path: String,
    download_url: Option<String>,
}

/// Roda `tarefa` numa thread separada e espera no máximo `limite` — um teto
/// de tempo absoluto que não depende do timeout interno do reqwest (que em
/// algumas redes com proxy/DNS problemático pode não disparar do jeito
/// esperado). Se o prazo estourar, a thread de rede fica pra trás sozinha
/// (eventualmente termina ou não, mas não trava mais a tela) e devolvemos
/// um erro claro na hora certa.
pub(crate) fn com_teto_de_tempo<T: Send + 'static>(limite: Duration, tarefa: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(tarefa());
    });
    rx.recv_timeout(limite).unwrap_or_else(|_| Err(MENSAGEM_TIMEOUT.to_string()))
}

/// Timeout por requisição HTTP individual — mais curto que o teto absoluto
/// de cada comando, já que um comando pode fazer várias requisições em
/// sequência (uma por arquivo listado).
pub(crate) fn cliente() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(6))
        .build()
        .map_err(|err| format!("Erro ao preparar a conexão com o repositório: {err}"))
}

fn listar_pasta(client: &reqwest::blocking::Client, pasta: &str) -> Result<Vec<EntradaConteudoGithub>, String> {
    let url = format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{pasta}");
    let resposta = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|err| format!("Erro ao acessar o repositório de relatórios: {err}"))?;

    if resposta.status().as_u16() == 404 {
        // Pasta ainda não existe no repositório (ex.: comunidade vazia) —
        // não é erro, só não tem nada pra listar ali ainda.
        return Ok(Vec::new());
    }
    if !resposta.status().is_success() {
        let status = resposta.status();
        return Err(format!("Erro ao acessar o repositório de relatórios ({pasta}): {status}"));
    }
    resposta
        .json::<Vec<EntradaConteudoGithub>>()
        .map_err(|err| format!("Erro ao interpretar a lista de relatórios do repositório: {err}"))
}

fn baixar_definicao(client: &reqwest::blocking::Client, download_url: &str) -> Result<ReportDefinition, String> {
    let resposta = client
        .get(download_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .map_err(|err| format!("Erro ao baixar o relatório: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!("Erro ao baixar o relatório: {}", resposta.status()));
    }
    let texto = resposta.text().map_err(|err| format!("Erro ao ler o relatório baixado: {err}"))?;
    serde_json::from_str(&texto).map_err(|err| format!("Relatório do repositório em formato inválido: {err}"))
}

fn listar_repositorio_relatorios_interno() -> Result<Vec<ItemRepositorio>, String> {
    let client = cliente()?;
    let mut itens = Vec::new();

    for (pasta, categoria) in [
        (PASTA_OFICIAIS, CategoriaRepositorio::Oficial),
        (PASTA_COMUNIDADE, CategoriaRepositorio::Comunidade),
    ] {
        let entradas = listar_pasta(&client, pasta)?;
        for entrada in entradas {
            if !entrada.name.ends_with(".json") {
                continue;
            }
            let Some(download_url) = &entrada.download_url else { continue };
            // Um arquivo corrompido ou de um formato futuro não deve
            // derrubar a lista inteira — só não aparece.
            if let Ok(definicao) = baixar_definicao(&client, download_url) {
                itens.push(ItemRepositorio {
                    caminho: entrada.path,
                    categoria,
                    nome: definicao.nome,
                    descricao: definicao.descricao,
                    autor: definicao.autor,
                    formato_saida: definicao.formato_saida,
                });
            }
        }
    }

    Ok(itens)
}

#[tauri::command(async)]
pub(crate) fn listar_repositorio_relatorios() -> Result<Vec<ItemRepositorio>, String> {
    com_teto_de_tempo(Duration::from_secs(25), listar_repositorio_relatorios_interno)
}

#[tauri::command(async)]
pub(crate) fn baixar_relatorio_repositorio(caminho: String) -> Result<ReportDefinition, String> {
    com_teto_de_tempo(Duration::from_secs(15), move || {
        let client = cliente()?;
        let url = format!("https://raw.githubusercontent.com/{GITHUB_OWNER}/{GITHUB_REPO}/{GITHUB_BRANCH}/{caminho}");
        let mut definicao = baixar_definicao(&client, &url)?;
        definicao.embutido = false;
        salvar_definicao_relatorio(definicao.clone())?;
        Ok(definicao)
    })
}
