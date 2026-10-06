// Importador do relatório "Aluno Presente" (BI da SEDUC): presença anual na
// turma, presença das duas últimas semanas e risco de reprovação por faltas.
//
// É a fonte da frequência geral do aluno: sai toda semana, enquanto o "Fre
// An(%)" do mapão só chega no fechamento do bimestre. O mapão continua sendo
// a fonte da frequência POR DISCIPLINA (atas, conselho); a geral dele só é
// usada para quem ainda não tem dado do Aluno Presente (ver importador_mapao).

use crate::*;

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use chrono::Local;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    path::PathBuf,
};

/// Uma linha do relatório. Percentuais em 0–100 (o arquivo traz frações).
pub(crate) struct RegistroAlunoPresente {
    pub(crate) ra: String,
    pub(crate) digito: String,
    pub(crate) nome: String,
    pub(crate) risco_reprovacao: bool,
    pub(crate) anual: Option<f64>,
    pub(crate) semana_atual: Option<f64>,
    pub(crate) semana_anterior: Option<f64>,
}

struct ColunasAlunoPresente {
    ra: usize,
    digito: Option<usize>,
    nome: usize,
    risco: Option<usize>,
    anual: usize,
    semana_atual: Option<usize>,
    semana_anterior: Option<usize>,
}

/// Acha as colunas pelo cabeçalho em vez de por posição: o BI já mudou a
/// ordem de colunas em outros relatórios sem aviso.
fn localizar_colunas(linha: &[Data]) -> Option<ColunasAlunoPresente> {
    let rotulos = linha.iter().map(rotulo_celula).collect::<Vec<_>>();
    let achar = |teste: &dyn Fn(&str) -> bool| rotulos.iter().position(|rotulo| teste(rotulo));
    Some(ColunasAlunoPresente {
        ra: achar(&|r| r == "RA")?,
        digito: achar(&|r| r == "DIG" || r.starts_with("DIGITO")),
        nome: achar(&|r| r.starts_with("ALUNO") || r == "NOME" || r == "ESTUDANTE")?,
        risco: achar(&|r| r.contains("RISCO")),
        anual: achar(&|r| r.contains("PRESENCA") && r.contains("ANUAL"))?,
        semana_atual: achar(&|r| r.contains("PRESENCA") && r.contains("SEMANA ATUAL")),
        semana_anterior: achar(&|r| r.contains("PRESENCA") && r.contains("SEMANA ANTERIOR")),
    })
}

/// O BI exporta fração (0.85); aceita também "85%" ou 85 por garantia.
fn percentual(celula: Option<&Data>) -> Option<f64> {
    let valor = match celula? {
        Data::Float(numero) => *numero,
        Data::Int(numero) => *numero as f64,
        outro => {
            let texto = texto_celula(Some(outro)).replace('%', "").replace(',', ".");
            texto.trim().parse::<f64>().ok()?
        }
    };
    let em_cem = if valor <= 1.0 { valor * 100.0 } else { valor };
    Some((em_cem * 10.0).round() / 10.0)
}

/// Turma do rodapé "Filtros aplicados:" ("NmTurma é 1ª SERIE A NOITE ...").
fn turma_do_rodape(texto: &str) -> Option<String> {
    texto.lines().find_map(|linha| {
        let norm = normalizar_texto_basico(linha.trim());
        if !(norm.starts_with("NMTURMA E ") || norm.starts_with("TURMA E ")) {
            return None;
        }
        [" é ", " e "].iter().find_map(|marcador| {
            linha
                .find(*marcador)
                .map(|pos| linha[pos + marcador.len()..].trim().to_string())
                .filter(|valor| !valor.is_empty())
        })
    })
}

pub(crate) fn ler_aluno_presente_bytes(bytes: &[u8]) -> Result<(Vec<RegistroAlunoPresente>, Option<String>), String> {
    let mut workbook: Xlsx<_> =
        open_workbook_from_rs(Cursor::new(bytes.to_vec())).map_err(|err: XlsxError| err.to_string())?;
    let aba = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Planilha sem abas.".to_string())?;
    let range = workbook.worksheet_range(&aba).map_err(|err| err.to_string())?;
    let linhas = range.rows().map(|linha| linha.to_vec()).collect::<Vec<_>>();

    let (linha_cabecalho, colunas) = linhas
        .iter()
        .enumerate()
        .find_map(|(idx, linha)| localizar_colunas(linha).map(|colunas| (idx, colunas)))
        .ok_or_else(|| {
            "Cabeçalho do Aluno Presente não encontrado. Use a exportação do BI \"Aluno Presente\" em Excel, sem mexer nas colunas."
                .to_string()
        })?;

    let mut registros = Vec::new();
    let mut turma = None;
    for linha in linhas.iter().skip(linha_cabecalho + 1) {
        let primeira = texto_celula(linha.first());
        if normalizar_texto_basico(primeira.trim()).starts_with("FILTROS APLICADOS") {
            turma = turma_do_rodape(&primeira);
            continue;
        }
        let ra = texto_celula(linha.get(colunas.ra)).trim().to_string();
        let nome = texto_celula(linha.get(colunas.nome)).trim().to_string();
        if ra.is_empty() || nome.is_empty() {
            continue;
        }
        registros.push(RegistroAlunoPresente {
            ra,
            digito: colunas
                .digito
                .map(|col| texto_celula(linha.get(col)).trim().to_string())
                .unwrap_or_default(),
            nome,
            risco_reprovacao: colunas.risco.and_then(|col| percentual(linha.get(col))).unwrap_or(0.0) > 0.0,
            anual: percentual(linha.get(colunas.anual)),
            semana_atual: colunas.semana_atual.and_then(|col| percentual(linha.get(col))),
            semana_anterior: colunas.semana_anterior.and_then(|col| percentual(linha.get(col))),
        });
    }
    if registros.is_empty() {
        return Err("Não encontrei estudantes na planilha do Aluno Presente.".to_string());
    }
    Ok((registros, turma))
}

/// Casa pelo RA (com e sem dígito, nas variantes que o app reconhece) e só
/// cai no nome quando o RA não bate com ninguém.
fn destinos(
    registro: &RegistroAlunoPresente,
    indice_ra: &BTreeMap<String, Vec<(usize, String)>>,
    indice_nome: &BTreeMap<String, Vec<(usize, String)>>,
) -> Vec<(usize, String)> {
    let mut candidatos_ra = vec![registro.ra.clone()];
    if !registro.digito.is_empty() {
        candidatos_ra.insert(0, format!("{}-{}", registro.ra, registro.digito));
    }
    let mut vistos = BTreeSet::new();
    let mut por_ra = Vec::new();
    for ra in &candidatos_ra {
        for variante in variantes_matricula(ra) {
            for candidato in indice_ra.get(&variante).into_iter().flatten() {
                if vistos.insert(candidato.clone()) {
                    por_ra.push(candidato.clone());
                }
            }
        }
    }
    if !por_ra.is_empty() {
        return por_ra;
    }
    indice_nome
        .get(&normalizar_nome_busca(&registro.nome))
        .cloned()
        .unwrap_or_default()
}

fn analisar_arquivo(arquivo: &ArquivoMapaoInput, turmas: &[(PathBuf, TurmaArquivo)]) -> PreviaArquivoDiagnostico {
    let (registros, turma) = match ler_aluno_presente_bytes(&arquivo.bytes) {
        Ok(dados) => dados,
        Err(err) => {
            return PreviaArquivoDiagnostico {
                nome: arquivo.nome.clone(),
                registros_lidos: 0,
                correspondencias: 0,
                nao_encontrados: 0,
                nomes_nao_encontrados: Vec::new(),
                duplicados: 0,
                nomes_duplicados: Vec::new(),
                turmas_identificadas: Vec::new(),
                erro: Some(err),
            };
        }
    };
    let indice_ra = indice_alunos_por_ra(turmas);
    let indice_nome = indice_alunos_por_nome(turmas);
    let mut correspondencias = 0;
    let mut nao_encontrados = Vec::new();
    let mut duplicados = Vec::new();
    for registro in &registros {
        match destinos(registro, &indice_ra, &indice_nome).len() {
            1 => correspondencias += 1,
            0 => nao_encontrados.push(registro.nome.clone()),
            _ => duplicados.push(registro.nome.clone()),
        }
    }
    PreviaArquivoDiagnostico {
        nome: arquivo.nome.clone(),
        registros_lidos: registros.len(),
        correspondencias,
        nao_encontrados: nao_encontrados.len(),
        nomes_nao_encontrados: nao_encontrados,
        duplicados: duplicados.len(),
        nomes_duplicados: duplicados,
        turmas_identificadas: turma.into_iter().collect(),
        erro: None,
    }
}

fn analisar_input(
    arquivos: &[ArquivoMapaoInput],
    turmas: &[(PathBuf, TurmaArquivo)],
) -> Result<PreviaImportacaoDiagnostico, String> {
    if arquivos.is_empty() {
        return Err("Selecione ao menos uma planilha do Aluno Presente.".to_string());
    }
    let arquivos = arquivos.iter().map(|arquivo| analisar_arquivo(arquivo, turmas)).collect::<Vec<_>>();
    Ok(PreviaImportacaoDiagnostico {
        total_registros: arquivos.iter().map(|arquivo| arquivo.registros_lidos).sum(),
        total_correspondencias: arquivos.iter().map(|arquivo| arquivo.correspondencias).sum(),
        total_nao_encontrados: arquivos.iter().map(|arquivo| arquivo.nao_encontrados).sum(),
        total_duplicados: arquivos.iter().map(|arquivo| arquivo.duplicados).sum(),
        arquivos,
    })
}

fn numero_json(valor: Option<f64>) -> Value {
    valor
        .and_then(serde_json::Number::from_f64)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

/// Grava o bloco `aluno_presente` e passa a frequência geral do aluno para o
/// valor do Aluno Presente. `frequencia_fonte` é o que faz o mapão parar de
/// sobrescrever essa frequência geral.
pub(crate) fn gravar_aluno_presente(info: &mut serde_json::Map<String, Value>, registro: &RegistroAlunoPresente, em: &str) {
    info.insert(
        "aluno_presente".to_string(),
        serde_json::json!({
            "anual": numero_json(registro.anual),
            "semana_atual": numero_json(registro.semana_atual),
            "semana_anterior": numero_json(registro.semana_anterior),
            "risco_reprovacao": registro.risco_reprovacao,
            "em": em,
        }),
    );
    if let Some(anual) = registro.anual {
        info.insert("frequencia_percentual".to_string(), numero_json(Some(anual.round())));
        info.insert("frequencia_fonte".to_string(), Value::String("aluno_presente".to_string()));
    }
}

#[tauri::command(async)]
pub(crate) fn analisar_aluno_presente(input: ImportacaoDiagnosticoInput) -> Result<PreviaImportacaoDiagnostico, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    analisar_input(&input.arquivos, &turmas)
}

#[tauri::command(async)]
pub(crate) fn aplicar_aluno_presente(input: ImportacaoDiagnosticoInput) -> Result<ResultadoImportacaoDiagnostico, String> {
    let _dados = travar_dados();
    let mut turmas = carregar_turmas_com_caminho()?;
    let previa = analisar_input(&input.arquivos, &turmas)?;
    let em = Local::now().to_rfc3339();
    let mut alunos_atualizados = BTreeSet::new();
    let mut turmas_alteradas = BTreeSet::new();

    for arquivo in &input.arquivos {
        let Ok((registros, _)) = ler_aluno_presente_bytes(&arquivo.bytes) else {
            continue;
        };
        let aplicacoes: Vec<(usize, String, usize)> = {
            let indice_ra = indice_alunos_por_ra(&turmas);
            let indice_nome = indice_alunos_por_nome(&turmas);
            registros
                .iter()
                .enumerate()
                .filter_map(|(idx, registro)| {
                    let destinos = destinos(registro, &indice_ra, &indice_nome);
                    (destinos.len() == 1).then(|| (destinos[0].0, destinos[0].1.clone(), idx))
                })
                .collect()
        };
        for (turma_idx, matricula, registro_idx) in aplicacoes {
            let Some((caminho, turma)) = turmas.get_mut(turma_idx) else {
                continue;
            };
            let Some(info) = turma
                .alunos
                .as_mut()
                .and_then(|alunos| alunos.get_mut(&matricula))
                .and_then(Value::as_object_mut)
            else {
                continue;
            };
            gravar_aluno_presente(info, &registros[registro_idx], &em);
            alunos_atualizados.insert((caminho.to_string_lossy().to_string(), matricula));
            turmas_alteradas.insert(caminho.to_string_lossy().to_string());
        }
    }

    for (caminho, turma) in &turmas {
        if turmas_alteradas.contains(&caminho.to_string_lossy().to_string()) {
            let texto = serde_json::to_string_pretty(turma).map_err(|err| err.to_string())?;
            escrever_json_atomicamente(caminho, &texto).map_err(|err| err.to_string())?;
        }
    }

    Ok(ResultadoImportacaoDiagnostico {
        previa,
        turmas_atualizadas: turmas_alteradas.len(),
        alunos_atualizados: alunos_atualizados.len(),
    })
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn percentual_converte_fracao_e_aceita_texto() {
        assert_eq!(percentual(Some(&Data::Float(0.85))), Some(85.0));
        assert_eq!(percentual(Some(&Data::Int(1))), Some(100.0));
        assert_eq!(percentual(Some(&Data::Int(0))), Some(0.0));
        assert_eq!(percentual(Some(&Data::String("82,5%".into()))), Some(82.5));
        assert_eq!(percentual(Some(&Data::Empty)), None);
    }

    #[test]
    fn turma_vem_do_rodape_de_filtros() {
        let rodape = "Filtros aplicados:\nVisao é 01 - REGULAR\nNmTurma é 1ª SERIE A NOITE ANUAL - 41001683\nCdEscola é 7833";
        assert_eq!(turma_do_rodape(rodape).as_deref(), Some("1ª SERIE A NOITE ANUAL - 41001683"));
    }

    #[test]
    fn colunas_sao_achadas_pelo_cabecalho() {
        let cabecalho = [
            "RA",
            "DIG",
            "Aluno(a)",
            "Risco de Reprovação por Faltas",
            "(%) Presença Anual na Turma Atual",
            "(%) Presença na Semana Atual",
            "(%) Presença na Semana Anterior",
        ]
        .map(|texto| Data::String(texto.to_string()));
        let colunas = localizar_colunas(&cabecalho).expect("cabeçalho do Aluno Presente");
        assert_eq!((colunas.ra, colunas.nome, colunas.anual), (0, 2, 4));
        assert_eq!((colunas.digito, colunas.risco), (Some(1), Some(3)));
        assert_eq!((colunas.semana_atual, colunas.semana_anterior), (Some(5), Some(6)));
    }

    #[test]
    fn aluno_presente_vira_a_frequencia_geral() {
        let mut info = serde_json::Map::new();
        let registro = RegistroAlunoPresente {
            ra: "000112652753".into(),
            digito: "1".into(),
            nome: "ALUNO".into(),
            risco_reprovacao: true,
            anual: Some(74.6),
            semana_atual: Some(0.0),
            semana_anterior: Some(74.0),
        };
        gravar_aluno_presente(&mut info, &registro, "2026-10-06T10:00:00-03:00");
        assert_eq!(info["frequencia_percentual"], serde_json::json!(75.0));
        assert_eq!(info["frequencia_fonte"], "aluno_presente");
        assert_eq!(info["aluno_presente"]["risco_reprovacao"], true);
        assert_eq!(info["aluno_presente"]["semana_anterior"], serde_json::json!(74.0));
    }
}
