// Publica uma definição de relatório do usuário no repositório público do
// GitHub — a metade "de envio" do que repositorio.rs já faz pra "de
// leitura" (listar/baixar). Reaproveita as mesmas constantes/pastas e o
// mesmo cliente HTTP com timeout.
//
// Quem decide se o envio vai pra `oficiais/` (commit direto na branch
// principal) ou `comunidade/` (fork + Pull Request) é a identidade do
// GitHub autenticado — não uma escolha na tela: se o login autenticado for
// o do mantenedor do projeto, cai em oficiais; qualquer outra conta abre um
// Pull Request pedindo revisão, nunca comita direto em nada — a aprovação
// de tudo que entra em comunidade/ continua sendo o mantenedor aceitar (ou
// não) o PR no próprio GitHub.

use base64::Engine;
use serde::Serialize;
use std::time::Duration;

use super::comandos::{listar_definicoes_relatorio, sanitizar_id_arquivo};
use super::definicao::ReportDefinition;
use super::repositorio::{
    cliente, com_teto_de_tempo, CategoriaRepositorio, GITHUB_BRANCH, GITHUB_OWNER, GITHUB_REPO, PASTA_COMUNIDADE, PASTA_OFICIAIS,
};
use crate::github_oauth::{consultar_usuario_autenticado, token_github_valido, USER_AGENT};

#[derive(Serialize)]
pub(crate) struct PublicarRelatorioResultado {
    pub(crate) url: String,
    pub(crate) categoria: CategoriaRepositorio,
}

fn sha_arquivo_existente(client: &reqwest::blocking::Client, token: &str, owner: &str, caminho: &str, branch: &str) -> Result<Option<String>, String> {
    let url = format!("https://api.github.com/repos/{owner}/{GITHUB_REPO}/contents/{caminho}?ref={branch}");
    let resposta = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|err| format!("Erro ao verificar o arquivo no repositório: {err}"))?;
    if resposta.status().as_u16() == 404 {
        return Ok(None);
    }
    if !resposta.status().is_success() {
        return Err(format!("Erro ao verificar o arquivo no repositório: {}", resposta.status()));
    }
    let valor: serde_json::Value = resposta.json().map_err(|err| format!("Erro ao interpretar a resposta do GitHub: {err}"))?;
    Ok(valor.get("sha").and_then(|v| v.as_str()).map(str::to_string))
}

/// `PUT contents` cobre tanto criar quanto atualizar um arquivo — se ele já
/// existir na branch de destino, é preciso mandar o `sha` atual junto
/// (checado logo acima), senão o GitHub recusa achando que seria uma
/// sobrescrita "às cegas".
fn comitar_arquivo(
    client: &reqwest::blocking::Client,
    token: &str,
    owner: &str,
    caminho: &str,
    branch: &str,
    conteudo: &str,
    mensagem: &str,
) -> Result<String, String> {
    let sha_existente = sha_arquivo_existente(client, token, owner, caminho, branch)?;
    let url = format!("https://api.github.com/repos/{owner}/{GITHUB_REPO}/contents/{caminho}");
    let conteudo_base64 = base64::engine::general_purpose::STANDARD.encode(conteudo.as_bytes());
    let mut corpo = serde_json::json!({
        "message": mensagem,
        "content": conteudo_base64,
        "branch": branch,
    });
    if let Some(sha) = sha_existente {
        corpo["sha"] = serde_json::Value::String(sha);
    }
    let resposta = client
        .put(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .json(&corpo)
        .send()
        .map_err(|err| format!("Erro ao enviar o relatório para o GitHub: {err}"))?;
    if !resposta.status().is_success() {
        let texto = resposta.text().unwrap_or_default();
        return Err(format!("O GitHub recusou o envio do relatório: {texto}"));
    }
    let valor: serde_json::Value = resposta.json().map_err(|err| format!("Erro ao interpretar a resposta do GitHub: {err}"))?;
    valor
        .get("content")
        .and_then(|c| c.get("html_url"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Relatório enviado, mas não foi possível obter o link dele.".to_string())
}

/// Um fork some por padrão pra quem nunca contribuiu antes — cria um se
/// ainda não existir. Forks do GitHub demoram um pouco pra ficar prontos
/// (processamento assíncrono do lado deles), daí a espera com novas
/// tentativas em vez de seguir direto pra criar uma branch nele.
fn garantir_fork(client: &reqwest::blocking::Client, token: &str, login: &str) -> Result<(), String> {
    let url_checar = format!("https://api.github.com/repos/{login}/{GITHUB_REPO}");
    let ja_existe = client
        .get(&url_checar)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    if ja_existe {
        return Ok(());
    }

    let url_fork = format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/forks");
    let resposta = client
        .post(&url_fork)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|err| format!("Erro ao criar um fork do repositório: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!("Erro ao criar um fork do repositório: {}", resposta.status()));
    }

    for _ in 0..15 {
        std::thread::sleep(Duration::from_secs(2));
        let pronto = client
            .get(&url_checar)
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/vnd.github+json")
            .send()
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if pronto {
            return Ok(());
        }
    }
    Err("O fork do repositório demorou demais para ficar pronto. Tente publicar de novo em instantes.".to_string())
}

fn sha_da_branch(client: &reqwest::blocking::Client, token: &str, owner: &str, branch: &str) -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{owner}/{GITHUB_REPO}/git/ref/heads/{branch}");
    let resposta = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|err| format!("Erro ao consultar seu fork do repositório: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!("Erro ao consultar seu fork do repositório: {}", resposta.status()));
    }
    let valor: serde_json::Value = resposta.json().map_err(|err| format!("Erro ao interpretar a resposta do GitHub: {err}"))?;
    valor
        .get("object")
        .and_then(|o| o.get("sha"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Não foi possível localizar a branch principal do seu fork.".to_string())
}

fn criar_branch(client: &reqwest::blocking::Client, token: &str, owner: &str, nova_branch: &str, sha_base: &str) -> Result<(), String> {
    let url = format!("https://api.github.com/repos/{owner}/{GITHUB_REPO}/git/refs");
    let corpo = serde_json::json!({ "ref": format!("refs/heads/{nova_branch}"), "sha": sha_base });
    let resposta = client
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .json(&corpo)
        .send()
        .map_err(|err| format!("Erro ao criar uma branch no seu fork: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!("Erro ao criar uma branch no seu fork: {}", resposta.status()));
    }
    Ok(())
}

fn abrir_pull_request(
    client: &reqwest::blocking::Client,
    token: &str,
    login: &str,
    branch: &str,
    titulo: &str,
    corpo_pr: &str,
) -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/pulls");
    let corpo = serde_json::json!({
        "title": titulo,
        "head": format!("{login}:{branch}"),
        "base": GITHUB_BRANCH,
        "body": corpo_pr,
        "maintainer_can_modify": true,
    });
    let resposta = client
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .json(&corpo)
        .send()
        .map_err(|err| format!("Erro ao abrir o Pull Request: {err}"))?;
    if !resposta.status().is_success() {
        let texto = resposta.text().unwrap_or_default();
        return Err(format!("O GitHub recusou abrir o Pull Request: {texto}"));
    }
    let valor: serde_json::Value = resposta.json().map_err(|err| format!("Erro ao interpretar a resposta do GitHub: {err}"))?;
    valor
        .get("html_url")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Pull Request criado, mas não foi possível obter o link dele.".to_string())
}

/// Nome de arquivo determinístico a partir do id do relatório — publicar de
/// novo o mesmo relatório atualiza o arquivo existente (via o `sha` checado
/// em `comitar_arquivo`) em vez de criar uma cópia duplicada toda vez.
fn caminho_arquivo(pasta: &str, id: &str) -> String {
    format!("{pasta}/{}.json", sanitizar_id_arquivo(id))
}

fn descricao_para_pr(definicao: &ReportDefinition, login: &str) -> String {
    let descricao = if definicao.descricao.trim().is_empty() { "(sem descrição)" } else { definicao.descricao.trim() };
    format!(
        "Relatório enviado pelo CoordenacaoOP por @{login}.\n\n**Nome:** {}\n**Descrição:** {}\n\n_Publicado direto do construtor de relatórios do app — revise o arquivo JSON anexo antes de aceitar._",
        definicao.nome, descricao
    )
}

fn publicar_interno(id: &str) -> Result<PublicarRelatorioResultado, String> {
    let token = token_github_valido().ok_or_else(|| "Faça login com o GitHub antes de publicar.".to_string())?;
    let login = consultar_usuario_autenticado(&token)?;
    let client = cliente()?;

    let mut definicao = listar_definicoes_relatorio()?
        .into_iter()
        .find(|d| d.id == id)
        .ok_or_else(|| "Relatório não encontrado — salve-o antes de publicar.".to_string())?;

    if definicao.autor.as_deref().unwrap_or("").trim().is_empty() {
        definicao.autor = Some(login.clone());
    }
    definicao.embutido = false;

    let e_dono = login.eq_ignore_ascii_case(GITHUB_OWNER);
    let conteudo = serde_json::to_string_pretty(&definicao).map_err(|err| format!("Erro ao preparar o relatório para envio: {err}"))?;
    let mensagem = format!("Publica relatório \"{}\"", definicao.nome);

    if e_dono {
        let caminho = caminho_arquivo(PASTA_OFICIAIS, &definicao.id);
        let url = comitar_arquivo(&client, &token, GITHUB_OWNER, &caminho, GITHUB_BRANCH, &conteudo, &mensagem)?;
        Ok(PublicarRelatorioResultado { url, categoria: CategoriaRepositorio::Oficial })
    } else {
        garantir_fork(&client, &token, &login)?;
        let caminho = caminho_arquivo(PASTA_COMUNIDADE, &definicao.id);
        let sha_base = sha_da_branch(&client, &token, &login, GITHUB_BRANCH)?;
        let nome_branch = format!("publicar-{}-{}", sanitizar_id_arquivo(&definicao.id), chrono::Local::now().timestamp());
        criar_branch(&client, &token, &login, &nome_branch, &sha_base)?;
        comitar_arquivo(&client, &token, &login, &caminho, &nome_branch, &conteudo, &mensagem)?;
        let url = abrir_pull_request(
            &client,
            &token,
            &login,
            &nome_branch,
            &format!("Relatório da comunidade: {}", definicao.nome),
            &descricao_para_pr(&definicao, &login),
        )?;
        Ok(PublicarRelatorioResultado { url, categoria: CategoriaRepositorio::Comunidade })
    }
}

/// Publica a definição já salva localmente (identificada por `id`) no
/// repositório público — direto em `oficiais/` se quem está autenticado no
/// GitHub for o mantenedor do projeto, ou como um Pull Request pedindo
/// entrada em `comunidade/` para qualquer outra conta. A pasta de destino
/// nunca é uma escolha na tela — é sempre a identidade do GitHub logado que
/// decide, e comunidade sempre passa por revisão humana (o PR) antes de
/// valer.
#[tauri::command(async)]
pub(crate) fn publicar_relatorio_repositorio(id: String) -> Result<PublicarRelatorioResultado, String> {
    // Teto generoso: quando é a primeira publicação de alguém, garantir_fork
    // sozinho pode esperar até ~30s pelo GitHub terminar de criar o fork,
    // antes mesmo de chegar nos passos de branch/commit/PR.
    com_teto_de_tempo(Duration::from_secs(90), move || publicar_interno(&id))
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    fn definicao_fixture(nome: &str, descricao: &str) -> ReportDefinition {
        serde_json::from_value(json!({
            "id": "relatorio_teste_123",
            "nome": nome,
            "descricao": descricao,
            "fonte": { "series": [], "periodos": [], "ciclos": [], "codigos": [] },
            "secoes": [],
            "blocos": [],
            "formato_saida": "docx",
        }))
        .unwrap()
    }

    #[test]
    fn caminho_arquivo_usa_id_sanitizado_com_extensao_json() {
        assert_eq!(caminho_arquivo(PASTA_OFICIAIS, "relatorio abc/123"), "relatorios_repositorio/oficiais/relatorio_abc_123.json");
        assert_eq!(caminho_arquivo(PASTA_COMUNIDADE, "top-20-matematica"), "relatorios_repositorio/comunidade/top-20-matematica.json");
    }

    /// Publicar o mesmo relatório de novo precisa gerar o MESMO caminho —
    /// é isso que faz `comitar_arquivo` atualizar o arquivo existente em
    /// vez de criar uma cópia duplicada a cada envio.
    #[test]
    fn caminho_arquivo_e_deterministico_para_o_mesmo_id() {
        assert_eq!(caminho_arquivo(PASTA_OFICIAIS, "mesmo_id"), caminho_arquivo(PASTA_OFICIAIS, "mesmo_id"));
    }

    #[test]
    fn descricao_para_pr_inclui_nome_e_descricao_do_relatorio() {
        let definicao = definicao_fixture("Top 20 Matemática", "Lista os 20 alunos com menor média.");
        let corpo = descricao_para_pr(&definicao, "algum_coordenador");
        assert!(corpo.contains("@algum_coordenador"));
        assert!(corpo.contains("Top 20 Matemática"));
        assert!(corpo.contains("Lista os 20 alunos com menor média."));
    }

    #[test]
    fn descricao_para_pr_trata_descricao_vazia() {
        let definicao = definicao_fixture("Relatório sem descrição", "   ");
        let corpo = descricao_para_pr(&definicao, "alguem");
        assert!(corpo.contains("(sem descrição)"));
    }
}
