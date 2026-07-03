#![allow(unused_imports)]

// Planejamento dos professores: busca, parsing e geração de documentos.
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


pub(crate) const SCRIPT_PLANEJAMENTO_FUNDAMENTAL: &str =
    include_str!("../scripts/planejamento_fundamental.gs");
pub(crate) const SCRIPT_PLANEJAMENTO_MEDIO: &str = include_str!("../scripts/planejamento_medio.gs");
pub(crate) const VERSAO_SCRIPT_PLANEJAMENTO: &str = "Currículo Priorizado 2026";
pub(crate) const REFERENCIAS_PLANEJAMENTO: &str =
    "Currículo Priorizado\nEscopo Sequência\nCurrículo Paulista\nBNCC";

// Célula "Rótulo: valor" (rótulo em negrito, valor normal) numa única linha.
pub(crate) fn campo_rotulo_valor_xml(rotulo: &str, valor: &str) -> String {
    let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
    let sz = r#"<w:sz w:val="18"/>"#;
    let alinha = r#"<w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>"#;
    format!(
        r#"<w:p>{alinha}<w:r><w:rPr>{fonte}{sz}<w:b/></w:rPr><w:t xml:space="preserve">{} </w:t></w:r><w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        escape_xml(rotulo),
        escape_xml(valor),
    )
}

pub(crate) fn escrever_planejamento_docx_individual(caminho: &Path, r: &RegistroPlanejamento) -> Result<(), String> {
    // O cabeçalho (imagem configurada em Configurações) é embutido automaticamente
    // por escrever_docx como header do Word. Aqui montamos só o corpo.
    let mut doc = DocumentoDocx::new();
    let n = r.bimestre.trim().parse::<u32>().unwrap_or(1);
    let ano_letivo = Local::now().year();

    // Título: PLANO DE ENSINO / Nº Bimestre
    doc.tabela_celulas_com_larguras(
        vec![vec![CelulaDocx::texto(&format!("PLANO DE ENSINO\n{n}º Bimestre"))
            .negrito()
            .tamanho(20)
            .centralizada()]],
        &[11_100],
        false,
    );

    // Professor (rótulo à esquerda)
    let prof_xml = {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="18"/>"#;
        let alinha = r#"<w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>"#;
        format!(
            r#"<w:p>{alinha}<w:r><w:rPr>{fonte}{sz}<w:b/></w:rPr><w:t xml:space="preserve">Professor: </w:t></w:r><w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
            escape_xml(&r.professor)
        )
    };
    doc.tabela_celulas_com_larguras(
        vec![vec![CelulaDocx::texto("").com_conteudo_xml(prof_xml)]],
        &[11_100],
        false,
    );

    // Identificação: Disciplina | Série/ano | Turmas | Ano letivo
    doc.tabela_celulas_com_larguras(
        vec![vec![
            CelulaDocx::texto("").com_conteudo_xml(campo_rotulo_valor_xml("Disciplina:", &r.disciplina)),
            CelulaDocx::texto("").com_conteudo_xml(campo_rotulo_valor_xml("Série/ano:", &r.ano)),
            CelulaDocx::texto("").com_conteudo_xml(campo_rotulo_valor_xml("Turmas:", &r.turmas)),
            CelulaDocx::texto("").com_conteudo_xml(campo_rotulo_valor_xml("Ano letivo:", &ano_letivo.to_string())),
        ]],
        &[3700, 2700, 2700, 2000],
        false,
    );

    // Cabeçalho do bimestre (cinza)
    doc.tabela_celulas_com_larguras(
        vec![vec![CelulaDocx::cabecalho(&format!("{n}º BIMESTRE")).tamanho(16)]],
        &[11_100],
        false,
    );

    // Linhas rótulo | conteúdo (sem Objetivos da Área e sem Reforço)
    let campos: Vec<(&str, &str)> = vec![
        ("UNIDADE TEMÁTICA", &r.unidade_tematica),
        ("OBJETOS DE CONHECIMENTO", &r.objetos_conhecimento),
        ("HABILIDADE", &r.habilidades),
        ("ESTRATÉGIAS / METODOLOGIA", &r.estrategias),
        ("RECURSOS PEDAGÓGICOS", &r.recursos),
        ("AVALIAÇÃO", &r.avaliacao),
        ("ADAPTAÇÃO CURRICULAR", &r.adaptacao_curricular),
        ("COMO VERIFICAR SE O OBJETIVO FOI CUMPRIDO", &r.verificacao_objetivo),
        ("REFERÊNCIAS", REFERENCIAS_PLANEJAMENTO),
    ];

    let linhas_tabela: Vec<Vec<CelulaDocx>> = campos
        .into_iter()
        .map(|(rotulo, conteudo)| {
            let celula_rotulo = CelulaDocx::texto(rotulo)
                .negrito()
                .tamanho(16)
                .alinhada("left")
                .valign_top();
            let celula_conteudo = CelulaDocx::texto("")
                .com_conteudo_xml(bullets_para_xml(conteudo, 18, "left"))
                .valign_top();
            vec![celula_rotulo, celula_conteudo]
        })
        .collect();

    doc.tabela_celulas_com_larguras(linhas_tabela, &[2800, 8300], false);

    doc.salvar(caminho)
}

// Remove o prefixo "Aula N -/—" preservando o título.
pub(crate) fn remover_prefixo_aula(s: &str) -> &str {
    let t = s.trim_start();
    let sem_aula = t
        .strip_prefix("Aula")
        .or_else(|| t.strip_prefix("AULA"))
        .or_else(|| t.strip_prefix("aula"));
    if let Some(rest) = sem_aula {
        let rest = rest.trim_start();
        let rest = rest.trim_start_matches(|c: char| c.is_ascii_digit());
        let rest = rest.trim_start();
        let rest = rest.trim_start_matches(['—', '–', '-']);
        return rest.trim_start();
    }
    t
}

// Extrai códigos BNCC (EF06AR09, EM13CHS101...) de uma string.
pub(crate) fn extrair_codigos_bncc(s: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut cur = String::new();
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() || ch == '*' {
            cur.push(ch);
        } else if !cur.is_empty() {
            tokens.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        tokens.push(cur);
    }
    let mut out: Vec<String> = Vec::new();
    for tk in tokens {
        let u = tk.to_uppercase();
        let prefixo_ok = u.starts_with("EF") || u.starts_with("EM");
        let nums_ok = u.len() >= 8 && u[2..4].chars().all(|c| c.is_ascii_digit());
        if prefixo_ok && nums_ok && !out.contains(&tk) {
            out.push(tk);
        }
    }
    out
}

// Separa o trecho final entre parênteses: "obj (AE1 | EM13..)" -> ("obj", "AE1 | EM13..").
pub(crate) fn separar_parenteses_final(rest: &str) -> Option<(String, String)> {
    let t = rest.trim_end();
    if !t.ends_with(')') {
        return None;
    }
    let abre = t.rfind('(')?;
    let hab = t[abre + 1..t.len() - 1].trim().to_string();
    let obj = t[..abre].trim().to_string();
    Some((obj, hab))
}

// Quebra uma aula em (unidade temática, objetos, habilidade), detectando EM ou EF.
pub(crate) fn parse_aula_planejamento(s: &str) -> (String, String, String) {
    let resto = remover_prefixo_aula(s);
    let segs: Vec<&str> = resto.split('|').map(|x| x.trim()).collect();
    let unidade = segs.first().map(|x| x.trim().to_string()).unwrap_or_default();
    let mut objetos = String::new();
    let mut habilidade = String::new();

    let rotulado = segs.iter().skip(1).any(|seg| {
        let n = normalizar_texto_basico(seg);
        n.starts_with("CONTEUDOS") || n.starts_with("HABILIDADES")
    });

    if rotulado {
        // formato EF: ... | Conteúdos: ... | Habilidades: EF.. | AE.. - ...
        for seg in segs.iter().skip(1) {
            let n = normalizar_texto_basico(seg);
            if n.starts_with("CONTEUDOS") {
                objetos = seg.split_once(':').map(|x| x.1).unwrap_or(seg).trim().to_string();
            } else if n.starts_with("HABILIDADES") {
                habilidade = seg.split_once(':').map(|x| x.1).unwrap_or(seg).trim().to_string();
            }
        }
        if habilidade.is_empty() {
            habilidade = extrair_codigos_bncc(s).join(", ");
        }
    } else {
        // formato EM: {objetos} (AE.. | EM13..)
        let rest = if segs.len() > 1 { segs[1..].join(" | ") } else { String::new() };
        if let Some((obj, hab)) = separar_parenteses_final(&rest) {
            objetos = obj;
            habilidade = hab;
        } else {
            objetos = rest;
        }
    }
    (unidade, objetos, habilidade)
}

// Quebra o texto de uma célula multi-seleção (aulas) em itens, usando "Aula N"
// como âncora — evita quebrar nos vírgulas internas das próprias aulas.
pub(crate) fn separar_aulas(texto: &str) -> Vec<String> {
    let t = texto.trim();
    if t.is_empty() {
        return Vec::new();
    }
    let mut itens: Vec<String> = Vec::new();
    let mut atual = String::new();
    for parte in t.split(", ") {
        let inicia_aula = {
            let p = parte.trim_start();
            p.starts_with("Aula ") || p.starts_with("AULA ") || p.starts_with("Plataforma EF")
        };
        if inicia_aula && !atual.is_empty() {
            itens.push(std::mem::take(&mut atual));
        }
        if atual.is_empty() {
            atual = parte.to_string();
        } else {
            atual.push_str(", ");
            atual.push_str(parte);
        }
    }
    if !atual.is_empty() {
        itens.push(atual);
    }
    itens
}

pub(crate) fn split_itens_planejamento(texto: &str) -> Vec<String> {
    texto
        .split(';')
        .flat_map(|l| l.split('\n'))
        .map(|l| l.trim().trim_end_matches('.').trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

pub(crate) fn split_checkbox(texto: &str) -> Vec<String> {
    texto
        .split(", ")
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .collect()
}

pub(crate) fn parsear_csv_planejamento(texto: &str) -> Result<Vec<RegistroPlanejamento>, String> {
    let linhas = parsear_csv_completo(texto);
    if linhas.len() < 2 {
        return Err("A planilha está vazia ou não contém registros de planejamento.".to_string());
    }
    let cabecalho = &linhas[0];
    let norm: Vec<String> = cabecalho.iter().map(|c| normalizar_texto_basico(c)).collect();

    let primeiro = |kw: &str| -> Option<usize> { norm.iter().position(|n| n.contains(kw)) };
    let exato = |kw: &str| -> Option<usize> { norm.iter().position(|n| n == kw) };

    let idx_professor = primeiro("PROFESSOR");
    let idx_componente = primeiro("COMPONENTE").or_else(|| primeiro("DISCIPLINA"));
    let idx_ano = exato("ANO").or_else(|| primeiro("SERIE"));
    let idx_turma = primeiro("TURMA");
    let idx_bimestre = exato("BIMESTRE");
    // Colunas de aulas (checkbox) duplicadas, uma por componente.
    let idxs_aulas: Vec<usize> = norm
        .iter()
        .enumerate()
        .filter(|(_, n)| n.starts_with("AULAS") && n.contains("BIMESTRE"))
        .map(|(i, _)| i)
        .collect();
    // Colunas de texto livre (componentes sem currículo priorizado).
    let idxs_aulas_livre: Vec<usize> = norm
        .iter()
        .enumerate()
        .filter(|(_, n)| n.contains("OBJETIVOS PLANEJADOS"))
        .map(|(i, _)| i)
        .collect();
    let idx_estrategias = exato("ESTRATEGIAS DIDATICAS");
    let idx_estrategias_desc = primeiro("DESCREVA");
    let idx_recursos = primeiro("RECURSOS");
    let idx_instrumentos = primeiro("INSTRUMENTO");
    let idx_como_avaliara = primeiro("AVALIARA");
    let idx_observacoes = primeiro("OBSERVACOES").or_else(|| primeiro("ADAPTACOES"));

    let col = |row: &[String], idx: Option<usize>| -> String {
        idx.and_then(|i| row.get(i)).cloned().unwrap_or_default().trim().to_string()
    };
    let primeira_nao_vazia = |row: &[String], idxs: &[usize]| -> String {
        idxs.iter()
            .filter_map(|&i| row.get(i))
            .map(|s| s.trim())
            .find(|s| !s.is_empty())
            .unwrap_or("")
            .to_string()
    };

    let mut registros = Vec::new();
    for linha in linhas.iter().skip(1) {
        if linha.iter().all(|c| c.trim().is_empty()) {
            continue;
        }
        let disciplina = col(linha, idx_componente);
        let ano = col(linha, idx_ano);
        if disciplina.is_empty() && ano.is_empty() {
            continue;
        }

        let bimestre_raw = col(linha, idx_bimestre);
        let bimestre: String = bimestre_raw.chars().filter(|c| c.is_ascii_digit()).collect();
        let bimestre = if bimestre.is_empty() { bimestre_raw } else { bimestre };

        // Aulas: a coluna preenchida (checkbox) ou o texto livre.
        let aulas_cell = primeira_nao_vazia(linha, &idxs_aulas);
        let aulas_livre = primeira_nao_vazia(linha, &idxs_aulas_livre);

        let (unidade, objetos, habilidade) = if !aulas_cell.is_empty() {
            let aulas = separar_aulas(&aulas_cell);
            let mut unis: Vec<String> = Vec::new();
            let mut objs: Vec<String> = Vec::new();
            let mut habs: Vec<String> = Vec::new();
            for a in &aulas {
                let (u, o, h) = parse_aula_planejamento(a);
                if !u.is_empty() && !unis.contains(&u) {
                    unis.push(u);
                }
                for item in split_itens_planejamento(&o) {
                    objs.push(item);
                }
                for cod in h.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()) {
                    if !habs.contains(&cod) {
                        habs.push(cod);
                    }
                }
            }
            (unis.join("\n"), objs.join("\n"), habs.join("\n"))
        } else {
            // texto livre: vai inteiro para "objetos de conhecimento".
            (String::new(), aulas_livre.clone(), String::new())
        };

        // Estratégias = checkbox + descrição.
        let mut estr_itens = split_checkbox(&col(linha, idx_estrategias));
        let desc = col(linha, idx_estrategias_desc);
        if !desc.is_empty() {
            estr_itens.push(desc);
        }
        let estrategias = estr_itens.join("\n");
        let recursos = split_checkbox(&col(linha, idx_recursos)).join("\n");
        let verificacao = split_checkbox(&col(linha, idx_instrumentos)).join("\n");
        let avaliacao = col(linha, idx_como_avaliara);
        let adaptacao = col(linha, idx_observacoes);

        // Expansão por turma (Turma A, Turma B... -> 8º A, 8º B...).
        let professor = col(linha, idx_professor);
        let turmas_resp = col(linha, idx_turma);
        let letras: Vec<String> = turmas_resp
            .split(',')
            .map(|t| t.trim().trim_start_matches("Turma").trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        let turmas_legivel = letras.join(", ");
        let letras = if letras.is_empty() { vec![String::new()] } else { letras };

        for letra in &letras {
            // Casa com o código da turma do programa, ex.: "8º Ano A" / "1ª Série F".
            let turma = if letra.is_empty() {
                ano.trim().to_string()
            } else {
                format!("{} {}", ano.trim(), letra)
            };
            registros.push(RegistroPlanejamento {
                professor: professor.clone(),
                disciplina: disciplina.clone(),
                ano: ano.clone(),
                turma,
                turmas: turmas_legivel.clone(),
                bimestre: bimestre.clone(),
                unidade_tematica: unidade.clone(),
                objetos_conhecimento: objetos.clone(),
                habilidades: habilidade.clone(),
                estrategias: estrategias.clone(),
                recursos: recursos.clone(),
                avaliacao: avaliacao.clone(),
                adaptacao_curricular: adaptacao.clone(),
                verificacao_objetivo: verificacao.clone(),
            });
        }
    }

    if registros.is_empty() {
        return Err("Nenhum registro de planejamento encontrado na planilha.".to_string());
    }
    Ok(registros)
}

pub(crate) fn baixar_csv_planilha(url: &str) -> Result<String, String> {
    let id = extrair_id_google_sheet(url).ok_or_else(|| {
        "URL não reconhecida. Cole o link de compartilhamento do Google Sheets.".to_string()
    })?;
    let csv_url = format!("https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv");
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
    resposta
        .text()
        .map_err(|err| format!("Erro ao ler o conteúdo da planilha: {err}"))
}

// Busca e combina os registros de todas as planilhas configuradas.
#[tauri::command(async)]
pub(crate) fn buscar_planejamentos(urls: Vec<String>) -> Result<Vec<RegistroPlanejamento>, String> {
    let urls: Vec<String> = urls
        .into_iter()
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty())
        .collect();
    if urls.is_empty() {
        return Err("Nenhuma planilha configurada. Informe ao menos um link.".to_string());
    }
    let mut todos = Vec::new();
    let mut erros = Vec::new();
    for url in &urls {
        match baixar_csv_planilha(url).and_then(|csv| parsear_csv_planejamento(&csv)) {
            Ok(mut regs) => todos.append(&mut regs),
            Err(e) => erros.push(e),
        }
    }
    if todos.is_empty() {
        return Err(if erros.is_empty() {
            "Nenhum planejamento encontrado nas planilhas configuradas.".to_string()
        } else {
            erros.join(" | ")
        });
    }
    Ok(todos)
}

#[tauri::command]
pub(crate) fn salvar_config_planejamento(config: ConfigPlanejamento) -> Result<(), String> {
    let _dados = travar_dados();
    let pasta = data_dir().map_err(|e| e.to_string())?.join("planejamento");
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    let texto = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    escrever_json_atomicamente(&pasta.join("config.json"), &texto).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn carregar_config_planejamento() -> Result<ConfigPlanejamento, String> {
    let caminho = data_dir()
        .map_err(|e| e.to_string())?
        .join("planejamento")
        .join("config.json");
    if !caminho.exists() {
        return Ok(ConfigPlanejamento::default());
    }
    let texto = fs::read_to_string(caminho).map_err(|e| e.to_string())?;
    // Tolerante a configs antigas (string simples) -> retorna default.
    Ok(serde_json::from_str(&texto).unwrap_or_default())
}

#[tauri::command]
pub(crate) fn obter_script_planejamento(segmento: String) -> Result<String, String> {
    match normalizar_texto_basico(&segmento).as_str() {
        s if s.contains("FUNDAMENTAL") => Ok(SCRIPT_PLANEJAMENTO_FUNDAMENTAL.to_string()),
        s if s.contains("MEDIO") => Ok(SCRIPT_PLANEJAMENTO_MEDIO.to_string()),
        _ => Err("Segmento inválido. Use 'fundamental' ou 'medio'.".to_string()),
    }
}

#[tauri::command]
pub(crate) fn versao_script_planejamento() -> String {
    VERSAO_SCRIPT_PLANEJAMENTO.to_string()
}

#[tauri::command]
pub(crate) fn abrir_planejamento_docx(turma: String, disciplina: String, bimestre: String) -> Result<(), String> {
    let caminho = data_dir()
        .map_err(|e| e.to_string())?
        .join("relatorios")
        .join("planejamento")
        .join(sanitizar_segmento(&turma))
        .join(format!(
            "{}_{}.docx",
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
pub(crate) fn gerar_planejamentos_lote(registros: Vec<RegistroPlanejamento>) -> Result<GerarPlanejamentosLoteResultado, String> {
    let _dados = travar_dados();
    let pasta_base = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("planejamento");
    fs::create_dir_all(&pasta_base).map_err(|err| err.to_string())?;

    let mut arquivos = 0usize;
    let mut erros: Vec<String> = Vec::new();

    for r in &registros {
        let pasta_turma = pasta_base.join(sanitizar_segmento(&r.turma));
        if let Err(e) = fs::create_dir_all(&pasta_turma) {
            erros.push(format!("{} — pasta: {e}", r.turma));
            continue;
        }
        let nome_arquivo = format!(
            "{}_{}.docx",
            sanitizar_segmento(&r.disciplina),
            sanitizar_segmento(&r.bimestre)
        );
        let caminho = pasta_turma.join(&nome_arquivo);
        match escrever_planejamento_docx_individual(&caminho, r) {
            Ok(_) => arquivos += 1,
            Err(e) => erros.push(format!("{} — {}: {e}", r.turma, r.disciplina)),
        }
    }

    Ok(GerarPlanejamentosLoteResultado {
        pasta: pasta_base.to_string_lossy().to_string(),
        arquivos,
        erros,
    })
}
