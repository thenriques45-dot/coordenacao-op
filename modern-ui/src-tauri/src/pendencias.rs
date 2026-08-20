
// Relatório de pendências (genérico para PEI e Planejamento).
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;


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
