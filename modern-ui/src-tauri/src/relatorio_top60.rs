// Relatório dos 60 melhores alunos por período (Manhã/Tarde/Noite).
//
// Critérios de ranqueamento, nessa ordem: (1) média global do bimestre
// (maior primeiro), (2) frequência anual acumulada — menos faltas primeiro,
// aqui usamos o mesmo campo frequencia_percentual que o relatório de Alunos
// Críticos já usa, então "menos faltas" = maior percentual (3) menor número
// de médias vermelhas (disciplinas abaixo da nota mínima configurada) no
// bimestre. Turmas de período INTEGRAL ficam fora: só entram turmas cujo
// campo periodo é exatamente "MANHA", "TARDE" ou "NOITE".

use crate::*;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;

const PERIODOS_RELATORIO: [&str; 3] = ["MANHA", "TARDE", "NOITE"];

fn rotulo_periodo(periodo: &str) -> &'static str {
    match periodo {
        "MANHA" => "Manhã",
        "TARDE" => "Tarde",
        "NOITE" => "Noite",
        _ => "",
    }
}

#[derive(Deserialize)]
pub(crate) struct RelatorioTop60Input {
    pub(crate) bimestre: String,
}

#[derive(Serialize)]
pub(crate) struct RelatorioTop60Resultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) periodos: usize,
    pub(crate) alunos: usize,
}

struct AlunoTop60 {
    numero: String,
    nome: String,
    turma: String,
    media_global: f64,
    frequencia_percentual: Option<f64>,
    medias_vermelhas: usize,
}

#[tauri::command(async)]
pub(crate) fn gerar_relatorio_top60(
    input: RelatorioTop60Input,
) -> Result<RelatorioTop60Resultado, String> {
    let _dados = travar_dados();
    let bimestre = normalizar_bimestre(&input.bimestre);
    let nota_minima = obter_nota_minima_configurada();
    let turmas = carregar_turmas_com_caminho()?;

    let mut por_periodo: std::collections::BTreeMap<&str, Vec<AlunoTop60>> =
        PERIODOS_RELATORIO.iter().map(|&p| (p, Vec::new())).collect();

    for (_, turma) in &turmas {
        let Some(periodo) = turma.periodo.as_deref() else {
            continue;
        };
        if !PERIODOS_RELATORIO.contains(&periodo) {
            continue;
        }
        let Some(alunos) = &turma.alunos else {
            continue;
        };
        let rotulo_turma_atual = rotulo_turma(turma);

        for (_, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            let Some(media_global) = media_aluno_bimestre(info, &bimestre) else {
                continue;
            };
            let frequencia_percentual = info.get("frequencia_percentual").and_then(valor_para_f64);
            let medias_vermelhas = disciplinas_baixas_aluno(info, &bimestre, nota_minima).len();

            por_periodo.get_mut(periodo).unwrap().push(AlunoTop60 {
                numero: info
                    .get("numero_chamada")
                    .and_then(Value::as_i64)
                    .map(|numero| numero.to_string())
                    .unwrap_or_else(|| "-".to_string()),
                nome: info
                    .get("nome")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                turma: rotulo_turma_atual.clone(),
                media_global,
                frequencia_percentual,
                medias_vermelhas,
            });
        }
    }

    let mut total_alunos = 0usize;
    let mut periodos_com_dados = 0usize;
    let mut blocos: Vec<(&str, Vec<AlunoTop60>)> = Vec::new();
    for periodo in PERIODOS_RELATORIO {
        let mut lista = por_periodo.remove(periodo).unwrap_or_default();
        lista.sort_by(|a, b| {
            b.media_global
                .partial_cmp(&a.media_global)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    let freq_a = a.frequencia_percentual.unwrap_or(f64::MIN);
                    let freq_b = b.frequencia_percentual.unwrap_or(f64::MIN);
                    freq_b.partial_cmp(&freq_a).unwrap_or(std::cmp::Ordering::Equal)
                })
                .then(a.medias_vermelhas.cmp(&b.medias_vermelhas))
        });
        lista.truncate(60);
        if !lista.is_empty() {
            periodos_com_dados += 1;
        }
        total_alunos += lista.len();
        blocos.push((periodo, lista));
    }

    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("top60");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let arquivo = pasta.join(format!(
        "top60_bim_{}_{}.docx",
        bimestre,
        Local::now().format("%Y%m%d_%H%M%S")
    ));
    escrever_relatorio_top60_docx(&arquivo, &bimestre, &blocos)?;

    Ok(RelatorioTop60Resultado {
        caminho: arquivo.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        periodos: periodos_com_dados,
        alunos: total_alunos,
    })
}

fn escrever_relatorio_top60_docx(
    caminho: &std::path::Path,
    bimestre: &str,
    blocos: &[(&str, Vec<AlunoTop60>)],
) -> Result<(), String> {
    let mut documento = DocumentoDocx::new();
    documento.titulo_ata("TOP 60 POR PERÍODO");
    documento.paragrafo_negrito(&format!(
        "{} | Gerado em {}",
        rotulo_bimestre_relatorio(bimestre),
        Local::now().format("%d/%m/%Y %H:%M")
    ));
    documento.paragrafo("Critérios de desempate, nesta ordem: 1) maior média global do bimestre; 2) menor número de faltas (maior frequência anual acumulada); 3) menor número de médias vermelhas (disciplinas abaixo da nota mínima configurada). Turmas de período Integral não entram neste relatório.");

    let algum_com_dados = blocos.iter().any(|(_, alunos)| !alunos.is_empty());
    if !algum_com_dados {
        documento.caixa_aviso("Nenhum aluno com média lançada neste bimestre foi encontrado.");
        return documento.salvar(caminho);
    }

    for (indice, (periodo, alunos)) in blocos.iter().enumerate() {
        if alunos.is_empty() {
            continue;
        }
        if indice > 0 {
            documento.paragrafo("");
        }
        documento.paragrafo_negrito(&format!(
            "{} - {} aluno(s)",
            rotulo_periodo(periodo),
            alunos.len()
        ));
        let mut linhas = vec![vec![
            CelulaDocx::cabecalho("Pos."),
            CelulaDocx::cabecalho("Nº"),
            CelulaDocx::cabecalho("Aluno"),
            CelulaDocx::cabecalho("Turma"),
            CelulaDocx::cabecalho("Média global"),
            CelulaDocx::cabecalho("Frequência"),
            CelulaDocx::cabecalho("Médias vermelhas"),
        ]];
        for (posicao, aluno) in alunos.iter().enumerate() {
            linhas.push(vec![
                CelulaDocx::texto(&(posicao + 1).to_string()).centralizada(),
                CelulaDocx::texto(&aluno.numero).centralizada(),
                CelulaDocx::texto(&aluno.nome).alinhada("left"),
                CelulaDocx::texto(&aluno.turma).centralizada(),
                CelulaDocx::texto(&format!("{:.1}", aluno.media_global)).centralizada(),
                CelulaDocx::texto(
                    &aluno
                        .frequencia_percentual
                        .map(formatar_percentual_docx)
                        .unwrap_or_else(|| "-".to_string()),
                )
                .centralizada(),
                CelulaDocx::texto(&aluno.medias_vermelhas.to_string()).centralizada(),
            ]);
        }
        documento.tabela_celulas_com_larguras(
            linhas,
            &[520, 520, 2700, 1200, 1300, 1200, 1560],
            true,
        );
    }

    documento.salvar(caminho)
}
