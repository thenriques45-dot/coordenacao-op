#![allow(unused_imports)]

// Relatório de pendências (genérico para PEI e Planejamento).
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


// ── Relatório de pendências (genérico: PEI e Planejamento) ──────────────────────
#[derive(Deserialize)]
pub(crate) struct LinhaPendencia {
    pub(crate) item: String,
    pub(crate) faltam: String,
}

#[derive(Deserialize)]
pub(crate) struct SecaoPendencia {
    pub(crate) titulo: String,
    pub(crate) linhas: Vec<LinhaPendencia>,
}

#[derive(Deserialize)]
pub(crate) struct RelatorioPendenciasInput {
    pub(crate) titulo: String,
    pub(crate) criterio: String,
    pub(crate) coluna_item: String,
    pub(crate) escopo: String,
    pub(crate) secoes: Vec<SecaoPendencia>,
}

#[derive(Serialize)]
pub(crate) struct RelatorioPendenciasResultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) secoes: usize,
    pub(crate) total: usize,
}

#[tauri::command]
pub(crate) fn escrever_relatorio_pendencias_doc(
    titulo: &str,
    criterio: &str,
    coluna_item: &str,
    coluna_faltam: &str,
    escopo: &str,
    secoes: &[SecaoPendencia],
) -> Result<RelatorioPendenciasResultado, String> {
    let total: usize = secoes.iter().map(|s| s.linhas.len()).sum();
    let mut doc = DocumentoDocx::new();
    doc.titulo_ata(titulo);
    doc.paragrafo_negrito(&format!(
        "Gerado em {} · {} pendência(s) em {} grupo(s)",
        Local::now().format("%d/%m/%Y %H:%M"),
        total,
        secoes.len()
    ));
    if !criterio.trim().is_empty() {
        doc.paragrafo(criterio);
    }

    if secoes.is_empty() {
        doc.caixa_aviso("Nenhuma pendência encontrada. Tudo entregue!");
    } else {
        for (indice, secao) in secoes.iter().enumerate() {
            if indice > 0 {
                doc.paragrafo("");
            }
            doc.paragrafo_negrito(&secao.titulo);
            let mut linhas = vec![vec![
                CelulaDocx::cabecalho(coluna_item),
                CelulaDocx::cabecalho(coluna_faltam),
            ]];
            for linha in &secao.linhas {
                linhas.push(vec![
                    CelulaDocx::texto(&linha.item).alinhada("left"),
                    CelulaDocx::texto(&linha.faltam).alinhada("left"),
                ]);
            }
            doc.tabela_celulas_com_larguras(linhas, &[6800, 4300], true);
        }
    }

    let pasta = data_dir()
        .map_err(|e| e.to_string())?
        .join("relatorios")
        .join("pendencias");
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    let escopo = if escopo.trim().is_empty() {
        "pendencias".to_string()
    } else {
        sanitizar_segmento(escopo)
    };
    let arquivo = pasta.join(format!(
        "pendencias_{}_{}.docx",
        escopo,
        Local::now().format("%Y%m%d_%H%M%S")
    ));
    doc.salvar(&arquivo)?;

    Ok(RelatorioPendenciasResultado {
        caminho: arquivo.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        secoes: secoes.len(),
        total,
    })
}

#[tauri::command(async)]
pub(crate) fn gerar_relatorio_pendencias(
    input: RelatorioPendenciasInput,
) -> Result<RelatorioPendenciasResultado, String> {
    let _dados = travar_dados();
    escrever_relatorio_pendencias_doc(
        &input.titulo,
        &input.criterio,
        &input.coluna_item,
        "Bimestres em falta",
        &input.escopo,
        &input.secoes,
    )
}

// Chave de ordenação natural da turma: (número, última letra). Ex.: "1ª Série A" < "6º Ano B".
pub(crate) fn chave_ordenacao_turma(texto: &str) -> (u32, String) {
    let mut num = String::new();
    for ch in texto.chars() {
        if ch.is_ascii_digit() {
            num.push(ch);
        } else if !num.is_empty() {
            break;
        }
    }
    let numero = num.parse::<u32>().unwrap_or(0);
    let letra = texto
        .chars().rfind(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_uppercase().to_string())
        .unwrap_or_default();
    (numero, letra)
}

// Relatório de pendência de lançamento: por turma, disciplinas com notas ainda
// não lançadas no mapão (por bimestre presente na carga horária).
#[tauri::command(async)]
pub(crate) fn gerar_relatorio_pendencia_lancamento() -> Result<RelatorioPendenciasResultado, String> {
    let _dados = travar_dados();
    let mut turmas: Vec<TurmaArquivo> = carregar_turmas_com_caminho()?
        .into_iter()
        .map(|(_, t)| t)
        .collect();
    turmas.sort_by_key(|a| chave_ordenacao_turma(&a.codigo));

    let mut secoes: Vec<SecaoPendencia> = Vec::new();

    for turma in &turmas {
        let (alunos, carga) = match (&turma.alunos, &turma.carga_horaria) {
            (Some(a), Some(c)) => (a, c),
            _ => continue,
        };
        let ativos: Vec<&Value> = alunos
            .values()
            .filter(|i| i.get("ativo").and_then(Value::as_bool).unwrap_or(true))
            .collect();
        let total = ativos.len();
        if total == 0 {
            continue;
        }

        let mut bims: Vec<&String> = carga.keys().collect();
        bims.sort();

        // disciplina (maiúscula) -> lista de (bimestre, faltam)
        let mut por_disc: BTreeMap<String, Vec<(String, usize)>> = BTreeMap::new();
        for bim in &bims {
            let discs = match carga.get(*bim).and_then(Value::as_object) {
                Some(o) => o,
                None => continue,
            };
            for disc in discs.keys() {
                let lancadas = ativos
                    .iter()
                    .filter(|info| {
                        info.get("medias")
                            .and_then(Value::as_object)
                            .and_then(|m| m.get(*bim))
                            .and_then(Value::as_object)
                            .and_then(|b| b.get(disc))
                            .and_then(valor_para_f64)
                            .is_some()
                    })
                    .count();
                let faltam = total.saturating_sub(lancadas);
                if faltam > 0 {
                    por_disc
                        .entry(disc.to_uppercase())
                        .or_default()
                        .push(((*bim).clone(), faltam));
                }
            }
        }

        let mut linhas: Vec<LinhaPendencia> = por_disc
            .into_iter()
            .map(|(disc, bims_faltam)| {
                let faltam = bims_faltam
                    .iter()
                    .map(|(b, f)| {
                        if *f == total {
                            format!("{b}º (todos)")
                        } else {
                            format!("{b}º ({f} de {total})")
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                LinhaPendencia { item: disc, faltam }
            })
            .collect();
        linhas.sort_by(|a, b| a.item.cmp(&b.item));

        if !linhas.is_empty() {
            secoes.push(SecaoPendencia {
                titulo: turma.codigo.clone(),
                linhas,
            });
        }
    }

    escrever_relatorio_pendencias_doc(
        "PENDÊNCIAS — LANÇAMENTO DE NOTAS",
        "Lista, por turma, as disciplinas com notas ainda não lançadas no mapão. \"(todos)\" indica que nenhum aluno teve nota lançada na disciplina; \"(N de T)\" indica quantos alunos estão sem nota. Considera apenas alunos ativos e os bimestres presentes na carga horária.",
        "Disciplina",
        "Notas não lançadas",
        "lancamento_notas",
        &secoes,
    )
}

// ── fim Planejamento ──────────────────────────────────────────────────────────

pub(crate) fn valor_para_f64(valor: &Value) -> Option<f64> {
    match valor {
        Value::Number(numero) => numero.as_f64(),
        Value::String(texto) => texto.replace(',', ".").parse::<f64>().ok(),
        Value::Object(objeto) => objeto.get("v").and_then(valor_para_f64),
        _ => None,
    }
}

pub(crate) fn extrair_atribuicao(valor: &Value) -> Option<AtribuicaoNota> {
    let objeto = valor.as_object()?;
    let por = objeto.get("por")?.as_str()?.to_string();
    let em = objeto.get("em")?.as_str()?.to_string();
    Some(AtribuicaoNota { por, em })
}
