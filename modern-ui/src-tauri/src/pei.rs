#![allow(unused_imports)]

// PEI: busca na planilha, geração de documentos e parsing de CSV.
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

// Une o PEI legado (CSV público do Forms) com o caminho automático (Sheets
// API autenticada). Falha isolada por fonte — mesmo padrão de
// planejamento::buscar_planejamentos. Roda numa thread OS dedicada porque o
// caminho automático usa OAuth (reqwest::blocking + eventual TcpListener de
// reautorização), inseguro dentro do runtime async do Tauri.
#[tauri::command(async)]
pub(crate) fn buscar_peis(
    url_legado: Option<String>,
    planilha_automatica_id: Option<String>,
) -> Result<Vec<RegistroPei>, String> {
    std::thread::spawn(move || buscar_peis_interno(url_legado, planilha_automatica_id))
        .join()
        .map_err(|_| "Falha interna ao buscar os PEIs.".to_string())?
}

fn buscar_peis_interno(
    url_legado: Option<String>,
    planilha_automatica_id: Option<String>,
) -> Result<Vec<RegistroPei>, String> {
    let url_legado = url_legado.map(|u| u.trim().to_string()).filter(|u| !u.is_empty());
    let planilha_automatica_id = planilha_automatica_id
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty());

    if url_legado.is_none() && planilha_automatica_id.is_none() {
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

    if let Some(planilha_id) = planilha_automatica_id {
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

#[tauri::command(async)]
pub(crate) fn gerar_peis_lote(registros: Vec<RegistroPei>) -> Result<GerarPeisLoteResultado, String> {
    let _dados = travar_dados();
    let pasta_base = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("pei");
    fs::create_dir_all(&pasta_base).map_err(|err| err.to_string())?;

    let mut arquivos = 0usize;
    let mut erros: Vec<String> = Vec::new();

    for r in &registros {
        let pasta_aluno = pasta_base.join(sanitizar_segmento(&r.nome_aluno));
        if let Err(e) = fs::create_dir_all(&pasta_aluno) {
            erros.push(format!("{} — pasta: {e}", r.nome_aluno));
            continue;
        }
        let nome_arquivo = format!(
            "{}_{}_bimestre.docx",
            sanitizar_segmento(&r.disciplina),
            sanitizar_segmento(&r.bimestre)
        );
        let caminho = pasta_aluno.join(&nome_arquivo);
        match escrever_pei_docx_individual(&caminho, r) {
            Ok(_) => arquivos += 1,
            Err(e) => erros.push(format!("{} — {}: {e}", r.nome_aluno, r.disciplina)),
        }
    }

    Ok(GerarPeisLoteResultado {
        pasta: pasta_base.to_string_lossy().to_string(),
        arquivos,
        erros,
    })
}

#[tauri::command]
pub(crate) fn listar_alunos_elegiveis_com_disciplinas() -> Result<Vec<AlunoElegiveisComDisciplinas>, String> {
    let turmas = carregar_turmas_com_caminho()?;
    let mut resultado = Vec::new();

    for (_, turma) in &turmas {
        let alunos = match &turma.alunos {
            Some(a) => a,
            None => continue,
        };

        // Coleta disciplinas por bimestre a partir da carga horária.
        let mut disciplinas_por_bimestre: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for bim in ["1", "2", "3", "4"] {
            let disc: Vec<String> = turma
                .carga_horaria
                .as_ref()
                .and_then(|c| c.get(bim))
                .and_then(Value::as_object)
                .map(|obj| obj.keys().cloned().collect())
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

            resultado.push(AlunoElegiveisComDisciplinas {
                matricula: matricula.clone(),
                nome,
                turma: rotulo_turma(turma),
                disciplinas: disciplinas.clone(),
                disciplinas_por_bimestre: disciplinas_por_bimestre.clone(),
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

pub(crate) fn escrever_pei_docx_individual(caminho: &Path, r: &RegistroPei) -> Result<(), String> {
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
    doc.campo_pei("Nome do Professor Especializado da Educação Especial:", "");
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

    // Quatro assinaturas centralizadas ao final da página, duas de cada lado
    doc.assinaturas_pei_final();

    doc.salvar(caminho)
}

// ── fim PEI ──────────────────────────────────────────────────────────────────

// ── Planejamento dos Professores ──────────────────────────────────────────────
