
// PEI: busca na planilha, geração de documentos e parsing de CSV.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::{Path, PathBuf},
};


#[tauri::command(async)]
pub(crate) fn buscar_pei_planilha(url: String) -> Result<Vec<RegistroPei>, String> {
    let id = extrair_id_google_sheet(&url).ok_or_else(|| {
        "URL não reconhecida. Cole o link de compartilhamento do Google Sheets.".to_string()
    })?;
    let csv_url = format!(
        "https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv"
    );
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; CoordenacaoOP)")
        .build()
        .map_err(|err| format!("Erro ao criar cliente HTTP: {err}"))?;
    let resposta = client
        .get(&csv_url)
        .send()
        .map_err(|err| format!("Não foi possível acessar a planilha: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!(
            "A planilha respondeu com erro {}. Verifique se ela está compartilhada como 'qualquer pessoa com o link'.",
            resposta.status().as_u16()
        ));
    }
    let texto = resposta
        .text()
        .map_err(|err| format!("Erro ao ler o conteúdo da planilha: {err}"))?;
    parsear_csv_pei(&texto)
}

#[tauri::command]
pub(crate) fn salvar_url_pei(url: String) -> Result<(), String> {
    let _dados = travar_dados();
    let pasta = data_dir().map_err(|e| e.to_string())?.join("pei");
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    escrever_json_atomicamente(&pasta.join("config.json"), &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn carregar_url_pei() -> Result<String, String> {
    let caminho = data_dir()
        .map_err(|e| e.to_string())?
        .join("pei")
        .join("config.json");
    if !caminho.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(caminho).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn salvar_config_pei(config: ConfigPei) -> Result<(), String> {
    let _dados = travar_dados();
    let pasta = data_dir().map_err(|e| e.to_string())?.join("pei");
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    let texto = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    escrever_json_atomicamente(&pasta.join("config.json"), &texto).map_err(|e| e.to_string())
}

// Mesmo arquivo físico usado por salvar_url_pei/carregar_url_pei (formato
// antigo: a URL crua, sem aspas, como todo o conteúdo do arquivo — ver
// salvar_url_pei acima). Migração: tenta decodificar como ConfigPei; se
// falhar (arquivo antigo, texto puro), trata o conteúdo inteiro como
// url_legado em vez de descartar a URL já configurada.
#[tauri::command]
pub(crate) fn carregar_config_pei() -> Result<ConfigPei, String> {
    let caminho = data_dir()
        .map_err(|e| e.to_string())?
        .join("pei")
        .join("config.json");
    if !caminho.exists() {
        return Ok(ConfigPei::default());
    }
    let texto = fs::read_to_string(caminho).map_err(|e| e.to_string())?;
    let aparado = texto.trim();
    if aparado.is_empty() {
        return Ok(ConfigPei::default());
    }
    if let Ok(config) = serde_json::from_str::<ConfigPei>(aparado) {
        return Ok(config);
    }
    Ok(ConfigPei {
        url_legado: aparado.to_string(),
        ..Default::default()
    })
}

// Recebe o link de leitura que outro coordenador copiou ("Copiar link para
// os coordenadores") e cola aqui — evita repetir todo o provisionamento
// OAuth só para ler os mesmos dados. Valida buscando de verdade antes de
// salvar, para não gravar um link quebrado/digitado errado sem avisar.
#[tauri::command(async)]
pub(crate) fn importar_config_pei_por_link(link: String) -> Result<ConfigPei, String> {
    std::thread::spawn(move || importar_config_pei_por_link_interno(link))
        .join()
        .map_err(|_| "Falha interna ao importar o link.".to_string())?
}

fn importar_config_pei_por_link_interno(link: String) -> Result<ConfigPei, String> {
    let (webapp_url, token_leitura) = sheets_api::separar_link_leitura(&link)?;
    sheets_api::buscar_respostas_via_webapp(&webapp_url, &token_leitura)
        .map_err(|e| format!("Não foi possível validar o link: {e}"))?;

    let mut config = carregar_config_pei()?;
    config.webapp_url = webapp_url;
    config.token_leitura = token_leitura;
    salvar_config_pei(config.clone())?;
    Ok(config)
}

// Esquema fixo (12 colunas, ver sheets_api::CABECALHO_RESPOSTAS_PEI) escrito
// pelo Web App próprio — mapeamento direto por coluna, sem decomposição
// (diferente das "aulas" de Planejamento): o cliente já entrega os campos
// prontos.
pub(crate) fn parsear_valores_sheets_pei(valores: Vec<Vec<String>>) -> Vec<RegistroPei> {
    const COLUNAS: usize = 12;
    valores
        .into_iter()
        .map(|mut linha| {
            linha.resize(COLUNAS, String::new());
            // Mesma extração de dígito do parser legado (parsear_csv_pei):
            // o resto do app (matriz por bimestre, BIMESTRES = ["1".."4"])
            // espera só o número, não o texto "1º Bimestre" por extenso.
            let bimestre_raw = linha[7].trim();
            let bimestre: String = bimestre_raw.chars().filter(|c| c.is_ascii_digit()).collect();
            let bimestre = if bimestre.is_empty() { bimestre_raw.to_string() } else { bimestre };
            RegistroPei {
                timestamp: linha[0].trim().to_string(),
                email: linha[1].trim().to_string(),
                professor: linha[2].trim().to_string(),
                nome_estudante_completo: linha[3].trim().to_string(),
                nome_aluno: linha[4].trim().to_string(),
                turma_aluno: linha[5].trim().to_string(),
                disciplina: linha[6].trim().to_string(),
                bimestre,
                conteudos: linha[8].trim().to_string(),
                estrategias: linha[9].trim().to_string(),
                instrumentos: linha[10].trim().to_string(),
                recursos: linha[11].trim().to_string(),
            }
        })
        .collect()
}

// Une o PEI legado (CSV público do Forms) com o caminho automático. Falha
// isolada por fonte — mesmo padrão de planejamento::buscar_planejamentos.
// Roda numa thread OS dedicada porque o caminho automático de configs
// antigas (sem token_leitura) usa OAuth (reqwest::blocking + eventual
// TcpListener de reautorização), inseguro dentro do runtime async do Tauri.
#[tauri::command(async)]
pub(crate) fn buscar_peis(config: ConfigPei) -> Result<Vec<RegistroPei>, String> {
    std::thread::spawn(move || buscar_peis_interno(config))
        .join()
        .map_err(|_| "Falha interna ao buscar os PEIs.".to_string())?
}

fn buscar_peis_interno(config: ConfigPei) -> Result<Vec<RegistroPei>, String> {
    let url_legado = {
        let u = config.url_legado.trim().to_string();
        if u.is_empty() { None } else { Some(u) }
    };
    let webapp_url = config.webapp_url.trim().to_string();
    let token_leitura = config.token_leitura.trim().to_string();
    let planilha_automatica_id = {
        let id = config.planilha_automatica_id.trim().to_string();
        if id.is_empty() { None } else { Some(id) }
    };

    if url_legado.is_none() && webapp_url.is_empty() && planilha_automatica_id.is_none() {
        return Err(
            "Nenhuma planilha configurada. Informe um link ou crie o Web App automaticamente."
                .to_string(),
        );
    }

    let mut todos = Vec::new();
    let mut erros = Vec::new();

    if let Some(url) = url_legado {
        match buscar_pei_planilha(url) {
            Ok(mut regs) => todos.append(&mut regs),
            Err(e) => erros.push(e),
        }
    }

    if !webapp_url.is_empty() && !token_leitura.is_empty() {
        // Caminho preferencial: leitura direta pelo próprio Web App, sem
        // OAuth nem compartilhar a planilha — ver
        // sheets_api::buscar_respostas_via_webapp.
        match sheets_api::buscar_respostas_via_webapp(&webapp_url, &token_leitura) {
            Ok(valores) => todos.extend(parsear_valores_sheets_pei(valores)),
            Err(e) => erros.push(format!("Web App: {e}")),
        }
    } else if let Some(planilha_id) = planilha_automatica_id {
        // Configs provisionadas antes do token de leitura existir: cai para
        // o caminho OAuth/Sheets API até a próxima republicação.
        let intervalo = format!("{}!A2:L", sheets_api::ABA_RESPOSTAS);
        match obter_access_token().and_then(|token| {
            sheets_api::buscar_planilha_valores_autenticado(&token, &planilha_id, &intervalo)
        }) {
            Ok(valores) => todos.extend(parsear_valores_sheets_pei(valores)),
            Err(e) => erros.push(format!("Planilha automática: {e}")),
        }
    }

    if todos.is_empty() {
        return Err(if erros.is_empty() {
            "Nenhum PEI encontrado nas planilhas configuradas.".to_string()
        } else {
            erros.join(" | ")
        });
    }
    Ok(todos)
}

#[tauri::command]
pub(crate) fn abrir_pei_docx(nome_aluno: String, disciplina: String, bimestre: String) -> Result<(), String> {
    let caminho = data_dir()
        .map_err(|e| e.to_string())?
        .join("relatorios")
        .join("pei")
        .join(sanitizar_segmento(&nome_aluno))
        .join(format!(
            "{}_{}_bimestre.docx",
            sanitizar_segmento(&disciplina),
            sanitizar_segmento(&bimestre)
        ));
    if !caminho.exists() {
        return Err(
            "Documento não gerado ainda. Aguarde a geração automática ou verifique a planilha."
                .to_string(),
        );
    }
    abrir_arquivo(&caminho)
}

fn chave_registro_pei(r: &RegistroPei) -> String {
    format!("{}|{}|{}", r.nome_aluno, r.disciplina, r.bimestre)
}

// Lê só o que já está em disco (índice local, ver infra::carregar_indice) —
// usada para popular a tela de acompanhamento sem depender de nenhum fetch
// na planilha ter dado certo. Ver PeisLocaisResultado.
#[tauri::command]
pub(crate) fn carregar_peis_locais() -> Result<PeisLocaisResultado, String> {
    let pasta_base = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("pei");
    let mut registros = carregar_indice(&pasta_base);
    reconciliar_indice_pei_com_disco(&pasta_base, &mut registros);
    Ok(PeisLocaisResultado {
        pasta: pasta_base.to_string_lossy().to_string(),
        registros,
    })
}

// ── Reconciliação do índice local com o que existe em disco ────────────────
//
// O índice (_indice.json) só ganha uma entrada quando uma busca na planilha
// (buscar_peis + gerar_peis_lote) roda com sucesso para aquele registro. Um
// PEI gerado por uma fonte que não é mais buscada — ex.: o Forms/CSV legado,
// depois que o coordenador migrou para o Web App automático e a config
// perdeu o url_legado — ou por uma versão anterior do sanitizador de nome de
// arquivo (ver dobrar_acento em shell.rs: antes, cada vogal acentuada virava
// "_", perdendo o caractere e mudando o nome do arquivo) some do índice,
// mas o .docx continua salvo na pasta do aluno. Sem isto, a tela de
// acompanhamento e o relatório de pendências acusavam "faltando" um PEI que
// na prática já tinha sido entregue.
fn extrair_disciplina_bimestre_do_nome(nome_arquivo: &str) -> Option<(String, String)> {
    let stem = nome_arquivo.strip_suffix(".docx")?;
    let stem = stem.strip_suffix("_bimestre")?;
    let pos = stem.rfind('_')?;
    let bimestre = &stem[pos + 1..];
    if bimestre.is_empty() || !bimestre.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let disc_token = stem[..pos].trim();
    if disc_token.is_empty() {
        return None;
    }
    Some((disc_token.to_string(), bimestre.to_string()))
}

fn chave_letras(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_uppercase())
        .collect()
}

fn distancia_levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut dp = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, linha) in dp.iter_mut().enumerate() {
        linha[0] = i;
    }
    for (j, valor) in dp[0].iter_mut().enumerate() {
        *valor = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let custo = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + custo);
        }
    }
    dp[a.len()][b.len()]
}

// Acha, entre as disciplinas conhecidas do aluno (mapão), a que corresponde
// ao trecho de nome de arquivo `disc_token`. Compara igual (formato atual
// do sanitizador) e, se não bater, tolera uma distância pequena — cobre o
// formato legado, que perdia 1 caractere por vogal acentuada.
fn casar_disciplina_conhecida<'a>(disc_token: &str, candidatas: &'a [String]) -> Option<&'a String> {
    let chave_token = chave_letras(disc_token);
    if chave_token.is_empty() {
        return None;
    }
    let mut melhor: Option<(&String, usize)> = None;
    for candidata in candidatas {
        let chave_cand = chave_letras(candidata);
        if chave_cand.is_empty() {
            continue;
        }
        let distancia = distancia_levenshtein(&chave_token, &chave_cand);
        if distancia == 0 {
            return Some(candidata);
        }
        let tolerancia = (chave_cand.len() / 6).clamp(1, 3);
        if distancia <= tolerancia && melhor.is_none_or(|(_, d)| distancia < d) {
            melhor = Some((candidata, distancia));
        }
    }
    melhor.map(|(c, _)| c)
}

fn caminho_esperado_pei(pasta_base: &Path, r: &RegistroPei) -> PathBuf {
    pasta_base
        .join(sanitizar_segmento(&r.nome_aluno))
        .join(format!(
            "{}_{}_bimestre.docx",
            sanitizar_segmento(&r.disciplina),
            sanitizar_segmento(&r.bimestre)
        ))
}

// Varre a pasta de cada aluno elegível e acrescenta ao índice (em memória,
// sem persistir — é barato refazer a cada carregamento da tela) um registro
// sintético para todo .docx que já exista em disco mas não corresponda a
// nenhuma entrada do índice. Falha em silêncio por aluno/pasta (mapão não
// importado, pasta ainda não criada) — é só uma tentativa de reconciliação.
fn reconciliar_indice_pei_com_disco(pasta_base: &Path, indice: &mut Vec<RegistroPei>) {
    let alunos = listar_alunos_elegiveis_com_disciplinas().unwrap_or_default();
    if alunos.is_empty() {
        return;
    }

    let mut caminhos_indexados: HashSet<PathBuf> = indice
        .iter()
        .map(|r| caminho_esperado_pei(pasta_base, r))
        .collect();
    let mut chaves_indice: HashSet<String> = indice.iter().map(chave_registro_pei).collect();

    for aluno in &alunos {
        let pasta_aluno = pasta_base.join(sanitizar_segmento(&aluno.nome));
        let entradas = match fs::read_dir(&pasta_aluno) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entrada in entradas.flatten() {
            let caminho = entrada.path();
            if caminho.extension().and_then(|e| e.to_str()) != Some("docx") {
                continue;
            }
            if caminhos_indexados.contains(&caminho) {
                continue;
            }
            let nome_arquivo = match caminho.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            let Some((disc_token, bimestre)) = extrair_disciplina_bimestre_do_nome(nome_arquivo) else {
                continue;
            };
            let Some(disciplina) = casar_disciplina_conhecida(&disc_token, &aluno.disciplinas) else {
                continue;
            };
            let disciplina = disciplina.clone();

            let registro = RegistroPei {
                timestamp: String::new(),
                email: String::new(),
                professor: String::new(),
                nome_estudante_completo: String::new(),
                nome_aluno: aluno.nome.clone(),
                turma_aluno: aluno.turma.clone(),
                disciplina,
                bimestre,
                conteudos: String::new(),
                estrategias: String::new(),
                instrumentos: String::new(),
                recursos: String::new(),
            };
            let chave = chave_registro_pei(&registro);
            if chaves_indice.insert(chave) {
                caminhos_indexados.insert(caminho);
                indice.push(registro);
            }
        }
    }
}

#[cfg(test)]
mod testes_reconciliacao_disco {
    use super::*;

    const CANDIDATAS: &[&str] = &[
        "ARTE",
        "CIENCIAS",
        "EDUCACAO FISICA",
        "GEOGRAFIA",
        "HISTORIA",
        "LINGUA INGLESA",
        "LINGUA PORTUGUESA",
        "MATEMATICA",
        "ORIENTACAO DE ESTUDO LINGUA PORTUGUESA",
        "ORIENTACAO DE ESTUDO MATEMATICA",
        "PROJETO DE VIDA",
        "REDACAO E LEITURA",
    ];

    fn candidatas() -> Vec<String> {
        CANDIDATAS.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reconhece_nomes_de_arquivo_legado_do_caso_real() {
        let candidatas = candidatas();
        let casos = [
            ("Ci_ncias_2_bimestre.docx", "2", "CIENCIAS"),
            ("Hist_ria_1_bimestre.docx", "1", "HISTORIA"),
            ("L_ngua Inglesa_3_bimestre.docx", "3", "LINGUA INGLESA"),
            ("L_ngua Portuguesa_1_bimestre.docx", "1", "LINGUA PORTUGUESA"),
            ("Matem_tica_1_bimestre.docx", "1", "MATEMATICA"),
            (
                "Orienta__o de Estudo - Matem_tica_2_bimestre.docx",
                "2",
                "ORIENTACAO DE ESTUDO MATEMATICA",
            ),
            ("Projeto de Vida_3_bimestre.docx", "3", "PROJETO DE VIDA"),
        ];
        for (nome_arquivo, bimestre_esperado, disciplina_esperada) in casos {
            let (disc_token, bimestre) = extrair_disciplina_bimestre_do_nome(nome_arquivo)
                .unwrap_or_else(|| panic!("não conseguiu extrair de {nome_arquivo}"));
            assert_eq!(bimestre, bimestre_esperado, "bimestre de {nome_arquivo}");
            let casado = casar_disciplina_conhecida(&disc_token, &candidatas)
                .unwrap_or_else(|| panic!("não casou nenhuma disciplina para {nome_arquivo}"));
            assert_eq!(casado, disciplina_esperada, "disciplina de {nome_arquivo}");
        }
    }

    #[test]
    fn reconhece_nomes_de_arquivo_no_formato_atual() {
        let candidatas = candidatas();
        let casos = [
            ("ARTE_2_bimestre.docx", "2", "ARTE"),
            ("EDUCACAO FISICA_3_bimestre.docx", "3", "EDUCACAO FISICA"),
            ("MATEMATICA_4_bimestre.docx", "4", "MATEMATICA"),
        ];
        for (nome_arquivo, bimestre_esperado, disciplina_esperada) in casos {
            let (disc_token, bimestre) = extrair_disciplina_bimestre_do_nome(nome_arquivo).unwrap();
            assert_eq!(bimestre, bimestre_esperado);
            let casado = casar_disciplina_conhecida(&disc_token, &candidatas).unwrap();
            assert_eq!(casado, disciplina_esperada);
        }
    }

    #[test]
    fn nao_confunde_disciplina_curta_com_orientacao_de_estudo() {
        let candidatas = candidatas();
        // "Matem_tica" pura (sem "Orientação de Estudo") deve casar com
        // MATEMATICA, não com ORIENTACAO DE ESTUDO MATEMATICA.
        let casado = casar_disciplina_conhecida("Matem_tica", &candidatas).unwrap();
        assert_eq!(casado, "MATEMATICA");
    }

    #[test]
    fn ignora_arquivo_sem_padrao_de_bimestre_reconhecivel() {
        assert_eq!(extrair_disciplina_bimestre_do_nome("_indice.json"), None);
        assert_eq!(extrair_disciplina_bimestre_do_nome("qualquer_coisa.docx"), None);
    }
}

#[tauri::command(async)]
pub(crate) fn gerar_peis_lote(
    registros: Vec<RegistroPei>,
    // "Regerar todos": quando true, ignora o índice e reescreve todo .docx —
    // usado para aplicar o novo bloco de assinaturas a PEIs já gerados, cujo
    // RegistroPei não mudou. Ausente/false mantém o comportamento incremental.
    forcar: Option<bool>,
) -> Result<GerarPeisLoteResultado, String> {
    let _dados = travar_dados();
    let forcar = forcar.unwrap_or(false);
    let assinantes_pei = MapaAssinantesPei::carregar();
    let pasta_base = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("pei");
    fs::create_dir_all(&pasta_base).map_err(|err| err.to_string())?;

    // Índice anterior — a mesclagem começa dele: um registro ausente NESTA
    // leva (fetch parcial/com erro) não é removido, só fica sem atualização
    // — evita a tela "zerar" quando uma busca falha ou volta incompleta.
    // Ver gerar_planejamentos_lote (mesmo padrão) para o raciocínio completo.
    let mut indice: BTreeMap<String, RegistroPei> = carregar_indice(&pasta_base)
        .into_iter()
        .map(|r| (chave_registro_pei(&r), r))
        .collect();

    let mut arquivos = 0usize;
    let mut pulados = 0usize;
    let mut erros: Vec<String> = Vec::new();

    for r in &registros {
        let pasta_aluno = pasta_base.join(sanitizar_segmento(&r.nome_aluno));
        let nome_arquivo = format!(
            "{}_{}_bimestre.docx",
            sanitizar_segmento(&r.disciplina),
            sanitizar_segmento(&r.bimestre)
        );
        let caminho = pasta_aluno.join(&nome_arquivo);

        // Mesmo conteúdo do que já está no índice E o arquivo ainda existe:
        // pula a reescrita — recarregar vira um no-op na prática.
        let chave = chave_registro_pei(r);
        let inalterado = !forcar
            && indice.get(&chave).is_some_and(|anterior| anterior == r)
            && caminho.exists();
        if inalterado {
            pulados += 1;
            continue;
        }

        if let Err(e) = fs::create_dir_all(&pasta_aluno) {
            erros.push(format!("{} — pasta: {e}", r.nome_aluno));
            continue;
        }
        match escrever_pei_docx_individual(&caminho, r, &assinantes_pei.para(r)) {
            Ok(_) => {
                arquivos += 1;
                indice.insert(chave, r.clone());
            }
            Err(e) => erros.push(format!("{} — {}: {e}", r.nome_aluno, r.disciplina)),
        }
    }

    let registros_indice: Vec<RegistroPei> = indice.into_values().collect();
    salvar_indice(&pasta_base, &registros_indice);

    Ok(GerarPeisLoteResultado {
        pasta: pasta_base.to_string_lossy().to_string(),
        arquivos,
        pulados,
        erros,
        registros: registros_indice,
    })
}

#[tauri::command]
pub(crate) fn listar_alunos_elegiveis_com_disciplinas() -> Result<Vec<AlunoElegiveisComDisciplinas>, String> {
    let turmas = carregar_turmas_com_caminho()?;
    let mut resultado = Vec::new();

    for (caminho_turma, turma) in &turmas {
        let alunos = match &turma.alunos {
            Some(a) => a,
            None => continue,
        };

        // Disciplinas que não pedem PEI por componente, mesmo aparecendo na
        // carga horária: itinerário/tutoria sem professor de componente (ver
        // disciplina_e_de_apoio_sem_documento) e as marcadas como vindas de
        // mapão de expansão (turma não seriada — ver
        // importador_mapao::mapao_eh_expansao). Mesma exclusão que
        // turmas::listar_disciplinas_turma já aplica ao Planejamento.
        let expansao_da_turma: std::collections::HashSet<&str> = turma
            .disciplinas_expansao
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(String::as_str)
            .collect();
        let exclui_disciplina = |nome: &str| -> bool {
            disciplina_e_de_apoio_sem_documento(nome) || expansao_da_turma.contains(nome)
        };

        // Coleta disciplinas por bimestre a partir da carga horária.
        let mut disciplinas_por_bimestre: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for bim in ["1", "2", "3", "4"] {
            let disc: Vec<String> = turma
                .carga_horaria
                .as_ref()
                .and_then(|c| c.get(bim))
                .and_then(Value::as_object)
                .map(|obj| {
                    obj.keys()
                        .filter(|nome| !exclui_disciplina(nome))
                        .cloned()
                        .collect()
                })
                .unwrap_or_default();
            if !disc.is_empty() {
                disciplinas_por_bimestre.insert(bim.to_string(), disc);
            }
        }

        // União de todas as disciplinas conhecidas.
        let mut todas: BTreeMap<String, String> = BTreeMap::new();
        for disc in disciplinas_por_bimestre.values().flatten() {
            todas.insert(disc.to_uppercase(), disc.clone());
        }
        let disciplinas: Vec<String> = todas.into_values().collect();

        for (matricula, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            let elegivel_manual = info
                .get("elegivel_manual")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let tem_deficiencia = info
                .get("deficiencias")
                .and_then(Value::as_array)
                .map(|d| !d.is_empty())
                .unwrap_or(false);
            if !elegivel_manual && !tem_deficiencia {
                continue;
            }

            let nome = info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            let responsavel = info
                .get("responsavel_pei")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string);

            resultado.push(AlunoElegiveisComDisciplinas {
                matricula: matricula.clone(),
                nome,
                turma: rotulo_turma(turma),
                turma_caminho: caminho_turma.to_string_lossy().to_string(),
                disciplinas: disciplinas.clone(),
                disciplinas_por_bimestre: disciplinas_por_bimestre.clone(),
                responsavel,
            });
        }
    }

    resultado.sort_by(|a, b| a.turma.cmp(&b.turma).then(a.nome.cmp(&b.nome)));
    Ok(resultado)
}

pub(crate) fn extrair_id_google_sheet(url: &str) -> Option<String> {
    let pos = url.find("/d/")?;
    let depois = &url[pos + 3..];
    let fim = depois.find(['/', '?']).unwrap_or(depois.len());
    if fim == 0 {
        None
    } else {
        Some(depois[..fim].to_string())
    }
}

pub(crate) fn parsear_csv_pei(texto: &str) -> Result<Vec<RegistroPei>, String> {
    let linhas = parsear_csv_completo(texto);
    if linhas.len() < 2 {
        return Err(
            "A planilha está vazia ou não contém registros de PEI.".to_string(),
        );
    }
    let cabecalho = &linhas[0];
    // normalizar_nome_busca produz MAIÚSCULAS — keywords devem ser maiúsculas.
    let col_idx = |palavras: &[&str]| -> Option<usize> {
        cabecalho.iter().position(|c| {
            let c_norm = normalizar_nome_busca(c);
            palavras.iter().any(|kw| c_norm.contains(kw))
        })
    };
    let idx_timestamp  = col_idx(&["CARIMBO", "TIMESTAMP"]);
    let idx_email      = col_idx(&["ENDERECO", "EMAIL"]);
    let idx_professor  = col_idx(&["PROFESSOR"]);
    let idx_estudante  = col_idx(&["ESTUDANTE"]);
    let idx_disciplina = col_idx(&["COMPONENTE", "CURRICULAR"]);
    // Bimestre: a coluna exata vem antes das questões longas que também contêm "BIMESTRE".
    let idx_bimestre   = col_idx(&["BIMESTRE"]);
    // Conteúdos: busca antes de estratégias para evitar colisão com "HABILIDADE".
    let idx_conteudos    = col_idx(&["CONTEUDO", "HABILIDADE"]);
    let idx_estrategias  = col_idx(&["ESTRATEG", "INTERVEN"]);
    let idx_instrumentos = col_idx(&["INSTRUMENTO"]);
    let idx_recursos     = col_idx(&["VIDEO", "LIVRO", "JOGO", "RECURSO", "APLICAT"]);

    let col = |row: &Vec<String>, idx: Option<usize>| -> String {
        idx.and_then(|i| row.get(i))
            .cloned()
            .unwrap_or_default()
            .trim()
            .to_string()
    };

    let mut registros = Vec::new();
    for linha in linhas.iter().skip(1) {
        if linha.iter().all(|c| c.trim().is_empty()) {
            continue;
        }
        let nome_estudante_completo = col(linha, idx_estudante);
        let (nome_aluno, turma_aluno) = separar_nome_turma_pei(&nome_estudante_completo);
        let bimestre_raw = col(linha, idx_bimestre);
        let bimestre = bimestre_raw
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect::<String>();
        let bimestre = if bimestre.is_empty() {
            bimestre_raw
        } else {
            bimestre
        };

        registros.push(RegistroPei {
            timestamp: col(linha, idx_timestamp),
            email: col(linha, idx_email),
            professor: col(linha, idx_professor),
            nome_estudante_completo,
            nome_aluno,
            turma_aluno,
            disciplina: col(linha, idx_disciplina),
            bimestre,
            conteudos: col(linha, idx_conteudos),
            estrategias: col(linha, idx_estrategias),
            instrumentos: col(linha, idx_instrumentos),
            recursos: col(linha, idx_recursos),
        });
    }

    if registros.is_empty() {
        return Err("Nenhum registro de PEI encontrado na planilha.".to_string());
    }

    Ok(registros)
}

pub(crate) fn parsear_csv_completo(texto: &str) -> Vec<Vec<String>> {
    let mut linhas: Vec<Vec<String>> = Vec::new();
    let mut linha_atual: Vec<String> = Vec::new();
    let mut campo = String::new();
    let mut dentro_aspas = false;
    let chars: Vec<char> = texto.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        if ch == '"' {
            if dentro_aspas && i + 1 < chars.len() && chars[i + 1] == '"' {
                campo.push('"');
                i += 2;
                continue;
            }
            dentro_aspas = !dentro_aspas;
        } else if ch == ',' && !dentro_aspas {
            linha_atual.push(campo.trim().to_string());
            campo = String::new();
        } else if ch == '\n' && !dentro_aspas {
            linha_atual.push(campo.trim().to_string());
            campo = String::new();
            if !linha_atual.is_empty() {
                linhas.push(linha_atual);
                linha_atual = Vec::new();
            }
        } else if ch == '\r' {
            // ignorar CR
        } else {
            campo.push(ch);
        }
        i += 1;
    }
    if !campo.is_empty() || !linha_atual.is_empty() {
        linha_atual.push(campo.trim().to_string());
        if !linha_atual.iter().all(|c| c.is_empty()) {
            linhas.push(linha_atual);
        }
    }
    linhas
}

pub(crate) fn separar_nome_turma_pei(texto: &str) -> (String, String) {
    if let Some(pos) = texto.rfind(" - ") {
        (
            texto[..pos].trim().to_string(),
            texto[pos + 3..].trim().to_string(),
        )
    } else {
        (texto.trim().to_string(), String::new())
    }
}

// ── Assinantes do PEI ────────────────────────────────────────────────────────
//
// O nome de cada signatário é impresso acima da respectiva linha de assinatura
// (nenhuma rubrica é gerada — a assinatura continua sendo um ato da pessoa). O
// regente vem do próprio RegistroPei; os demais papéis são configurados por
// turma (ver turmas::salvar_pessoas_pei_turma) com estes fallbacks:
//   - especializado / ensino colaborativo vazios ⟶ coordenador de gestão da turma
//   - direção vazia ⟶ direcao_nome de configuracoes.json
//   - responsável só é impresso se cadastrado no aluno (senão, linha em branco)

// Rótulo abaixo da linha de assinatura: só a função (o nome já vai impresso
// acima da linha). O regente é rotulado apenas com a disciplina.
const ROTULO_ASSIN_COORD: &str = "Coordenador de Gestão Pedagógica";
const ROTULO_ASSIN_ESPECIALIZADO: &str = "Educação Especial";
const ROTULO_ASSIN_COLABORATIVO: &str = "Ensino Colaborativo";
const ROTULO_ASSIN_DIRECAO: &str = "Direção";
const ROTULO_ASSIN_RESPONSAVEL: &str = "Responsável pelo estudante";

#[derive(Default, Clone)]
pub(crate) struct AssinantesTurmaPei {
    coordenador_gestao: String,
    // Mesma pessoa assina "Especializado da Educação Especial" e "Ensino
    // Colaborativo" — um valor só.
    especializado: String,
    // true quando a turma tem um professor especializado próprio; false quando
    // caiu no coordenador. Sem especializado próprio, o bloco de "Ensino
    // Colaborativo" nem aparece (evita repetir o coordenador três vezes).
    especializado_proprio: bool,
    direcao: String,
    // nome do aluno normalizado -> nome do responsável
    responsaveis: std::collections::HashMap<String, String>,
}

pub(crate) struct MapaAssinantesPei {
    direcao_padrao: String,
    por_rotulo_turma: std::collections::HashMap<String, AssinantesTurmaPei>,
    por_aluno: std::collections::HashMap<String, AssinantesTurmaPei>,
}

// Fallbacks dos assinantes de uma turma (pura, testável): o professor
// especializado (que também assina como ensino colaborativo) vazio cai no
// coordenador de gestão; direção vazia cai na direção padrão (direcao_nome).
// Devolve (coordenador, especializado, especializado_proprio, direção).
fn resolver_nomes_assinantes(
    pei_coord: Option<&str>,
    pei_esp: Option<&str>,
    pei_dir: Option<&str>,
    direcao_padrao: &str,
) -> (String, String, bool, String) {
    let limpa = |v: Option<&str>| v.unwrap_or("").trim().to_string();
    let coord = limpa(pei_coord);
    let esp_txt = limpa(pei_esp);
    let esp_proprio = !esp_txt.is_empty();
    let esp = if esp_proprio { esp_txt } else { coord.clone() };
    let dir = {
        let t = limpa(pei_dir);
        if t.is_empty() { direcao_padrao.trim().to_string() } else { t }
    };
    (coord, esp, esp_proprio, dir)
}

impl MapaAssinantesPei {
    pub(crate) fn carregar() -> Self {
        let (direcao_padrao, _) = obter_direcao_configurada();
        let turmas = carregar_turmas_com_caminho().unwrap_or_default();
        let mut por_rotulo_turma = std::collections::HashMap::new();
        let mut por_aluno = std::collections::HashMap::new();

        for (_, turma) in &turmas {
            let (coord, esp, esp_proprio, dir) = resolver_nomes_assinantes(
                turma.pei_coordenador_gestao.as_deref(),
                turma.pei_prof_especializado.as_deref(),
                turma.pei_direcao.as_deref(),
                &direcao_padrao,
            );

            let mut responsaveis = std::collections::HashMap::new();
            if let Some(alunos) = &turma.alunos {
                for info in alunos.values() {
                    let nome = info.get("nome").and_then(Value::as_str).unwrap_or("");
                    let resp = info
                        .get("responsavel_pei")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim();
                    if !nome.is_empty() && !resp.is_empty() {
                        responsaveis.insert(normalizar_nome_busca(nome), resp.to_string());
                    }
                }
            }

            let assinantes = AssinantesTurmaPei {
                coordenador_gestao: coord,
                especializado: esp,
                especializado_proprio: esp_proprio,
                direcao: dir,
                responsaveis,
            };

            por_rotulo_turma.insert(normalizar_nome_busca(&rotulo_turma(turma)), assinantes.clone());
            if let Some(alunos) = &turma.alunos {
                for info in alunos.values() {
                    if let Some(nome) = info.get("nome").and_then(Value::as_str) {
                        por_aluno.insert(normalizar_nome_busca(nome), assinantes.clone());
                    }
                }
            }
        }

        Self { direcao_padrao, por_rotulo_turma, por_aluno }
    }

    // Assinantes aplicáveis a um registro: casa pela turma (rótulo) e, na
    // falta — registro legado do Forms ou reconstruído do disco sem turma —,
    // pelo nome do aluno.
    pub(crate) fn para(&self, r: &RegistroPei) -> AssinantesTurmaPei {
        self.por_rotulo_turma
            .get(&normalizar_nome_busca(&r.turma_aluno))
            .or_else(|| self.por_aluno.get(&normalizar_nome_busca(&r.nome_aluno)))
            .cloned()
            .unwrap_or_else(|| AssinantesTurmaPei {
                direcao: self.direcao_padrao.clone(),
                ..Default::default()
            })
    }
}

impl AssinantesTurmaPei {
    fn responsavel_de(&self, nome_aluno: &str) -> String {
        self.responsaveis
            .get(&normalizar_nome_busca(nome_aluno))
            .cloned()
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod testes_assinantes_pei {
    use super::resolver_nomes_assinantes;

    #[test]
    fn especializado_vazio_cai_no_coordenador_e_nao_e_proprio() {
        let (coord, esp, esp_proprio, dir) = resolver_nomes_assinantes(
            Some("ANA COORDENADORA"),
            Some("   "),
            None,
            "HILDA DIRETORA",
        );
        assert_eq!(coord, "ANA COORDENADORA");
        assert_eq!(esp, "ANA COORDENADORA");
        assert!(!esp_proprio, "sem especializado próprio ⇒ bloco de colaborativo some");
        assert_eq!(dir, "HILDA DIRETORA");
    }

    #[test]
    fn valores_informados_sao_preservados() {
        let (_, esp, esp_proprio, dir) = resolver_nomes_assinantes(
            Some("ANA"),
            Some("BRUNO ESPECIALISTA"),
            Some("VERA VICE"),
            "HILDA DIRETORA",
        );
        assert_eq!(esp, "BRUNO ESPECIALISTA");
        assert!(esp_proprio);
        assert_eq!(dir, "VERA VICE");
    }

    #[test]
    fn sem_coordenador_especializado_fica_vazio_para_preencher_a_mao() {
        let (coord, esp, esp_proprio, _) =
            resolver_nomes_assinantes(None, None, None, "HILDA DIRETORA");
        assert_eq!(coord, "");
        assert_eq!(esp, "");
        assert!(!esp_proprio);
    }
}

pub(crate) fn escrever_pei_docx_individual(
    caminho: &Path,
    r: &RegistroPei,
    assinantes: &AssinantesTurmaPei,
) -> Result<(), String> {
    let mut doc = DocumentoDocx::new();

    // Título conforme modelo oficial
    doc.paragrafo("");
    doc.titulo_pei("ANEXO IV \u{2013} PLANO EDUCACIONAL INDIVIDUALIZADO \u{2013} PEI");
    doc.paragrafo("");

    // Parágrafo introdutório com "acessibilidade" sublinhado
    doc.intro_pei();
    doc.paragrafo("");

    // Campos de identificação
    doc.campo_pei("Nome do Estudante:", &nome_titulo(&r.nome_aluno));
    doc.campo_pei("Nome do Professor Regente:", &r.professor);
    doc.campo_pei(
        "Nome do Professor Especializado da Educação Especial:",
        &assinantes.especializado,
    );
    doc.campo_pei("Componente Curricular:", &r.disciplina.to_uppercase());
    doc.periodo_pei(&r.bimestre);
    doc.paragrafo("");

    // Quatro perguntas com respostas
    doc.questao_pei(
        "Quais conteúdos e habilidades do Currículo da Rede Estadual Paulista serão desenvolvidos no bimestre?",
        &r.conteudos,
    );
    doc.questao_pei(
        "Quais estratégias, intervenções pedagógicas e recursos de acessibilidade serão utilizados para favorecer o acesso, a participação e a aprendizagem do estudante?",
        &r.estrategias,
    );
    doc.questao_pei(
        "Quais instrumentos serão utilizados para acompanhar o aprendizado do estudante de forma inclusiva e individualizada?",
        &r.instrumentos,
    );
    doc.questao_pei(
        "Quais vídeos, livros, jogos, exercícios ou outras atividades podem ser indicados para apoiar, complementar, suplementar e fortalecer o aprendizado do estudante neste componente curricular, considerando suas potencialidades, especificidades e ritmo de aprendizagem?",
        &r.recursos,
    );

    // Blocos de assinatura ao final da página, com o nome de cada signatário
    // impresso acima da linha (responsável fica só com a linha, se não houver
    // nome cadastrado).
    let responsavel = assinantes.responsavel_de(&r.nome_aluno);
    let disciplina_regente = r.disciplina.to_uppercase();
    let mut blocos: Vec<(&str, &str)> = vec![
        (ROTULO_ASSIN_COORD, assinantes.coordenador_gestao.as_str()),
        (ROTULO_ASSIN_ESPECIALIZADO, assinantes.especializado.as_str()),
    ];
    // Ensino Colaborativo só entra quando há um especializado próprio — senão
    // seria o coordenador assinando a mesma linha de novo.
    if assinantes.especializado_proprio {
        blocos.push((ROTULO_ASSIN_COLABORATIVO, assinantes.especializado.as_str()));
    }
    blocos.push((disciplina_regente.as_str(), r.professor.as_str()));
    blocos.push((ROTULO_ASSIN_DIRECAO, assinantes.direcao.as_str()));
    blocos.push((ROTULO_ASSIN_RESPONSAVEL, responsavel.as_str()));
    doc.assinaturas_pei_final(&blocos);

    doc.salvar(caminho)
}

// ── Exportar PEI: um PDF combinando todos os documentos do aluno ───────────
//
// O app não tem nenhuma forma de converter .docx em PDF nem de juntar PDFs
// (sem docx-rs/libreoffice/lopdf no Cargo.toml — ver investigação no plano).
// Em vez de converter os .docx já escritos acima, o PDF é gerado direto dos
// mesmos RegistroPei, com o genpdf que o motor de relatórios já usa
// (carregar_familia_fonte_pdf, motor_relatorios/renderers.rs). Isto DUPLICA
// o conteúdo/layout do PEI num segundo formato — se o texto de alguma
// pergunta ou rótulo mudar em escrever_pei_docx_individual (acima), mudar
// aqui também. genpdf::style::Effect não tem sublinhado, então
// "acessibilidade" sai em negrito no lugar do sublinhado do .docx.

fn campo_pei_pdf(rotulo: &str, valor: &str) -> genpdf::elements::Paragraph {
    use genpdf::elements::Paragraph;
    use genpdf::style::Effect;

    let mut p = Paragraph::default();
    p.push_styled(format!("{rotulo} "), Effect::Bold);
    if !valor.trim().is_empty() {
        p.push(valor.to_string());
    }
    p
}

fn periodo_pei_pdf(bimestre: &str) -> genpdf::elements::Paragraph {
    use genpdf::elements::Paragraph;
    use genpdf::style::Effect;

    let opcoes = [("1", "1\u{00b0} Bimestre"), ("2", "2\u{00ba} Bimestre"), ("3", "3\u{00ba} Bimestre"), ("4", "4\u{00ba} Bimestre")];
    let texto = opcoes
        .iter()
        .map(|(b, rotulo)| {
            let marca = if *b == bimestre { "X" } else { " " };
            format!("( {marca} ) {rotulo}")
        })
        .collect::<Vec<_>>()
        .join("   ");
    let mut p = Paragraph::default();
    p.push_styled("Per\u{00ed}odo: ", Effect::Bold);
    p.push(texto);
    p
}

/// Diferente de questao_pei (docx): quando a resposta está vazia, o .docx
/// deixa 3 linhas em branco pra preenchimento manual (documento que pode
/// ser impresso e completado à mão); o PDF exportado é um arquivo final
/// pronto pra arquivo/entrega, então mostra "(sem resposta preenchida)" em
/// itálico em vez de espaço em branco sem explicação.
fn questao_pei_pdf(documento: &mut genpdf::Document, pergunta: &str, resposta: &str) {
    use genpdf::elements::{Break, Paragraph};
    use genpdf::style::{Effect, Style};
    use genpdf::Element as _;

    documento.push(Break::new(0.3));
    documento.push(Paragraph::new(pergunta.to_string()).styled(Effect::Bold));
    if resposta.trim().is_empty() {
        documento.push(Paragraph::new("(sem resposta preenchida)").styled(Style::new().italic()));
    } else {
        for linha in resposta.lines() {
            documento.push(Paragraph::new(linha.to_string()));
        }
    }
}

/// Um bloco de assinatura no PDF: nome do signatário (quando informado)
/// acima da linha, a linha e o rótulo do cargo.
fn bloco_assinatura_pdf(documento: &mut genpdf::Document, rotulo: &str, nome: &str) {
    use genpdf::elements::{Break, Paragraph};
    use genpdf::style::Style;
    use genpdf::{Alignment, Element as _};

    documento.push(Break::new(1.4));
    if !nome.trim().is_empty() {
        // Nome sempre em maiúsculas, como no .docx.
        documento.push(
            Paragraph::new(nome.trim().to_uppercase())
                .aligned(Alignment::Center)
                .styled(Style::new().with_font_size(10)),
        );
    }
    documento.push(Paragraph::new("______________________________").aligned(Alignment::Center));
    documento.push(
        Paragraph::new(rotulo.to_string())
            .aligned(Alignment::Center)
            .styled(Style::new().with_font_size(9)),
    );
}

/// Folha única de assinaturas no final do PDF combinado — separada do corpo
/// por uma quebra de página. Um bloco de regente por componente curricular
/// (os regentes variam entre os PEIs do aluno); os demais papéis, um bloco
/// cada, com o nome já preenchido pela configuração da turma.
fn folha_assinaturas_pei_pdf(
    documento: &mut genpdf::Document,
    nome_aluno: &str,
    turma: &str,
    assinantes: &AssinantesTurmaPei,
    regentes_por_componente: &[(String, String)],
) {
    use genpdf::elements::{Break, Paragraph};
    use genpdf::style::Style;
    use genpdf::{Alignment, Element as _};

    documento.push(
        Paragraph::new("FOLHA DE ASSINATURAS \u{2013} PEI")
            .aligned(Alignment::Center)
            .styled(Style::new().bold().with_font_size(12)),
    );
    documento.push(Break::new(0.4));
    documento.push(campo_pei_pdf("Estudante:", &nome_titulo(nome_aluno)));
    if !turma.trim().is_empty() {
        documento.push(campo_pei_pdf("Turma:", turma.trim()));
    }

    bloco_assinatura_pdf(documento, ROTULO_ASSIN_COORD, &assinantes.coordenador_gestao);
    bloco_assinatura_pdf(documento, ROTULO_ASSIN_ESPECIALIZADO, &assinantes.especializado);
    if assinantes.especializado_proprio {
        bloco_assinatura_pdf(documento, ROTULO_ASSIN_COLABORATIVO, &assinantes.especializado);
    }
    for (disciplina, professor) in regentes_por_componente {
        bloco_assinatura_pdf(documento, &disciplina.to_uppercase(), professor);
    }
    bloco_assinatura_pdf(documento, ROTULO_ASSIN_DIRECAO, &assinantes.direcao);
    bloco_assinatura_pdf(
        documento,
        ROTULO_ASSIN_RESPONSAVEL,
        &assinantes.responsavel_de(nome_aluno),
    );
}

/// Uma "página" do PEI combinado — mesmo conteúdo/ordem de
/// escrever_pei_docx_individual (título, intro, campos, 4 perguntas). As
/// assinaturas NÃO entram aqui: vão todas numa folha única ao final (ver
/// folha_assinaturas_pei_pdf).
fn escrever_secao_pei_pdf(documento: &mut genpdf::Document, r: &RegistroPei, especializado: &str) {
    use genpdf::elements::{Break, Paragraph};
    use genpdf::style::{Effect, Style};
    use genpdf::{Alignment, Element as _};

    documento.push(
        Paragraph::new("ANEXO IV \u{2013} PLANO EDUCACIONAL INDIVIDUALIZADO \u{2013} PEI")
            .aligned(Alignment::Center)
            .styled(Style::new().bold().with_font_size(12)),
    );
    documento.push(Break::new(0.5));

    let mut intro = Paragraph::default();
    intro.push("PEI: Plano Educacional Individualizado \u{2013} documento que estabelece a ");
    intro.push_styled("acessibilidade".to_string(), Effect::Bold);
    intro.push(
        " curricular, adapta\u{00e7}\u{00f5}es e estrat\u{00e9}gias para o acesso ao curr\u{00ed}culo comum. \
         (Resolu\u{00e7}\u{00e3}o SEDUC N\u{00ba} 129, de 30 de setembro de 2025)",
    );
    documento.push(intro);
    documento.push(Break::new(0.5));

    documento.push(campo_pei_pdf("Nome do Estudante:", &nome_titulo(&r.nome_aluno)));
    documento.push(campo_pei_pdf("Nome do Professor Regente:", &r.professor));
    documento.push(campo_pei_pdf(
        "Nome do Professor Especializado da Educa\u{00e7}\u{00e3}o Especial:",
        especializado,
    ));
    documento.push(campo_pei_pdf("Componente Curricular:", &r.disciplina.to_uppercase()));
    documento.push(periodo_pei_pdf(&r.bimestre));
    documento.push(Break::new(0.5));

    questao_pei_pdf(
        documento,
        "Quais conte\u{00fa}dos e habilidades do Curr\u{00ed}culo da Rede Estadual Paulista ser\u{00e3}o desenvolvidos no bimestre?",
        &r.conteudos,
    );
    questao_pei_pdf(
        documento,
        "Quais estrat\u{00e9}gias, interven\u{00e7}\u{00f5}es pedag\u{00f3}gicas e recursos de acessibilidade ser\u{00e3}o utilizados para favorecer o acesso, a participa\u{00e7}\u{00e3}o e a aprendizagem do estudante?",
        &r.estrategias,
    );
    questao_pei_pdf(
        documento,
        "Quais instrumentos ser\u{00e3}o utilizados para acompanhar o aprendizado do estudante de forma inclusiva e individualizada?",
        &r.instrumentos,
    );
    questao_pei_pdf(
        documento,
        "Quais v\u{00ed}deos, livros, jogos, exerc\u{00ed}cios ou outras atividades podem ser indicados para apoiar, complementar, suplementar e fortalecer o aprendizado do estudante neste componente curricular, considerando suas potencialidades, especificidades e ritmo de aprendizagem?",
        &r.recursos,
    );
}

fn escrever_pei_pdf_combinado(caminho: &Path, nome_aluno: &str, registros: &[RegistroPei]) -> Result<(), String> {
    use genpdf::elements::PageBreak;

    let assinantes_pei = MapaAssinantesPei::carregar();
    let familia_fonte = carregar_familia_fonte_pdf()?;
    let mut documento = genpdf::Document::new(familia_fonte);
    documento.set_title(format!("PEI - {}", nome_titulo(nome_aluno)));
    documento.set_line_spacing(1.2);
    let mut decorador = genpdf::SimplePageDecorator::new();
    decorador.set_margins(10);
    documento.set_page_decorator(decorador);

    for (indice, r) in registros.iter().enumerate() {
        if indice > 0 {
            documento.push(PageBreak::new());
        }
        escrever_secao_pei_pdf(&mut documento, r, &assinantes_pei.para(r).especializado);
    }

    // Folha única de assinaturas ao final: um regente por componente
    // curricular, mais os papéis configurados na turma.
    if let Some(primeiro) = registros.first() {
        let assinantes = assinantes_pei.para(primeiro);
        let mut regentes: Vec<(String, String)> = Vec::new();
        for r in registros {
            let disc = r.disciplina.to_uppercase();
            if !regentes.iter().any(|(d, _)| *d == disc) {
                regentes.push((disc, r.professor.clone()));
            }
        }
        documento.push(PageBreak::new());
        folha_assinaturas_pei_pdf(
            &mut documento,
            nome_aluno,
            &primeiro.turma_aluno,
            &assinantes,
            &regentes,
        );
    }

    documento.render_to_file(caminho).map_err(|err| err.to_string())
}

/// Junta todos os PEIs de um aluno (todas as disciplinas/bimestres já
/// recebidos) num único PDF nomeado com o nome do aluno, salvo na mesma
/// pasta dos .docx individuais. `registros` vem pronto do frontend
/// (PEI.tsx já casa os registros com o aluno selecionado por nome
/// normalizado — mesmo padrão de gerar_peis_lote, que também recebe a
/// lista pronta em vez de buscar sozinho).
#[tauri::command(async)]
pub(crate) fn exportar_pei_aluno(nome_aluno: String, registros: Vec<RegistroPei>) -> Result<String, String> {
    let _dados = travar_dados();
    if registros.is_empty() {
        return Err("Nenhum PEI encontrado para este aluno.".to_string());
    }
    let mut ordenados = registros;
    ordenados.sort_by(|a, b| (&a.bimestre, &a.disciplina).cmp(&(&b.bimestre, &b.disciplina)));

    let pasta = data_dir()
        .map_err(|e| e.to_string())?
        .join("relatorios")
        .join("pei")
        .join(sanitizar_segmento(&nome_aluno));
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    let caminho = pasta.join(format!("{}.pdf", sanitizar_segmento(&nome_aluno)));

    escrever_pei_pdf_combinado(&caminho, &nome_aluno, &ordenados)?;
    abrir_arquivo(&caminho)?;
    Ok(caminho.to_string_lossy().to_string())
}

// ── fim PEI ──────────────────────────────────────────────────────────────────

// ── Planejamento dos Professores ──────────────────────────────────────────────
