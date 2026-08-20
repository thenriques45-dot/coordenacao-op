// Repositório público de relatórios: navega e baixa definições publicadas
// no repositório GitHub do projeto (pastas oficiais/comunidade), sem exigir
// login — o repo é público. "Oficial" e "comunidade" são só duas pastas
// diferentes; quem entra em cada uma é decidido no GitHub (commit direto do
// mantenedor pra oficiais, Pull Request revisado pra comunidade), não neste
// código — esta tela só lista e baixa o que já está lá.

use serde::{Deserialize, Serialize};

use super::comandos::salvar_definicao_relatorio;
use super::definicao::{FormatoSaida, ReportDefinition};

const GITHUB_OWNER: &str = "thenriques45-dot";
const GITHUB_REPO: &str = "coordenacao-op";
const GITHUB_BRANCH: &str = "main";
const PASTA_OFICIAIS: &str = "relatorios_repositorio/oficiais";
const PASTA_COMUNIDADE: &str = "relatorios_repositorio/comunidade";
const USER_AGENT: &str = "CoordenacaoOP-App";

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

fn cliente() -> reqwest::blocking::Client {
    reqwest::blocking::Client::new()
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

#[tauri::command(async)]
pub(crate) fn listar_repositorio_relatorios() -> Result<Vec<ItemRepositorio>, String> {
    let client = cliente();
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
                    formato_saida: definicao.formato_saida,
                });
            }
        }
    }

    Ok(itens)
}

#[tauri::command(async)]
pub(crate) fn baixar_relatorio_repositorio(caminho: String) -> Result<ReportDefinition, String> {
    let client = cliente();
    let url = format!("https://raw.githubusercontent.com/{GITHUB_OWNER}/{GITHUB_REPO}/{GITHUB_BRANCH}/{caminho}");
    let mut definicao = baixar_definicao(&client, &url)?;
    definicao.embutido = false;
    salvar_definicao_relatorio(definicao.clone())?;
    Ok(definicao)
}
