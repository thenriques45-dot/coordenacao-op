// Importador do relatório "SARESP - Diagnóstico" (BI da escola): nota média
// do aluno no SARESP, disciplina de menor nota e nota por disciplina, de 0 a
// 10. O arquivo não traz RA: o aluno é casado pelo nome, restrito à turma do
// rodapé "Filtros aplicados" quando o nome se repete em mais de uma turma.

use crate::*;

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use chrono::Local;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    path::PathBuf,
};

pub(crate) struct RegistroSaresp {
    pub(crate) nome: String,
    pub(crate) rede_origem: String,
    pub(crate) media: Option<f64>,
    pub(crate) menor_nota: String,
    /// Sigla da coluna (LPT, MAT, ING...) → nota de 0 a 10.
    pub(crate) disciplinas: BTreeMap<String, f64>,
}

struct ColunasSaresp {
    nome: usize,
    rede: Option<usize>,
    media: usize,
    menor: Option<usize>,
    /// Colunas depois de "MENOR NOTA" (ou de "Nota Média"): uma por disciplina.
    disciplinas: Vec<(usize, String)>,
}

fn localizar_colunas(linha: &[Data]) -> Option<ColunasSaresp> {
    let rotulos = linha.iter().map(rotulo_celula).collect::<Vec<_>>();
    let achar = |teste: &dyn Fn(&str) -> bool| rotulos.iter().position(|rotulo| teste(rotulo));
    let nome = achar(&|r| r == "ALUNO" || r == "ESTUDANTE" || r == "NOME")?;
    let media = achar(&|r| r == "NOTA MEDIA")?;
    let menor = achar(&|r| r == "MENOR NOTA");
    let inicio_disciplinas = menor.unwrap_or(media).max(media) + 1;
    let disciplinas = rotulos
        .iter()
        .enumerate()
        .skip(inicio_disciplinas)
        .filter(|(_, rotulo)| !rotulo.is_empty())
        .map(|(idx, rotulo)| (idx, rotulo.clone()))
        .collect();
    Some(ColunasSaresp {
        nome,
        rede: achar(&|r| r.starts_with("REDE")),
        media,
        menor,
        disciplinas,
    })
}

fn nota(celula: Option<&Data>) -> Option<f64> {
    let valor = match celula? {
        Data::Float(numero) => *numero,
        Data::Int(numero) => *numero as f64,
        outro => texto_celula(Some(outro)).replace(',', ".").trim().parse::<f64>().ok()?,
    };
    Some((valor * 100.0).round() / 100.0)
}

fn turma_do_rodape(texto: &str) -> Option<String> {
    texto.lines().find_map(|linha| {
        let norm = normalizar_texto_basico(linha.trim());
        if !(norm.starts_with("NM TURMA E ") || norm.starts_with("TURMA E ")) {
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

pub(crate) fn ler_saresp_bytes(bytes: &[u8]) -> Result<(Vec<RegistroSaresp>, Option<String>), String> {
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
            "Cabeçalho do SARESP não encontrado. Use a exportação do BI \"SARESP - Diagnóstico\" em Excel, sem mexer nas colunas."
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
        let nome = texto_celula(linha.get(colunas.nome)).trim().to_string();
        if nome.is_empty() {
            continue;
        }
        registros.push(RegistroSaresp {
            nome,
            rede_origem: colunas
                .rede
                .map(|col| texto_celula(linha.get(col)).trim().to_string())
                .unwrap_or_default(),
            media: nota(linha.get(colunas.media)),
            menor_nota: colunas
                .menor
                .map(|col| texto_celula(linha.get(col)).trim().to_string())
                .unwrap_or_default(),
            disciplinas: colunas
                .disciplinas
                .iter()
                .filter_map(|(col, sigla)| nota(linha.get(*col)).map(|valor| (sigla.clone(), valor)))
                .collect(),
        });
    }
    if registros.is_empty() {
        return Err("Não encontrei estudantes na planilha do SARESP.".to_string());
    }
    Ok((registros, turma))
}

/// Turmas do app que batem com o rodapé ou com o nome do arquivo — usadas só
/// para desempatar nomes repetidos em mais de uma turma.
fn alvos(nome_arquivo: &str, turma: &Option<String>, turmas: &[(PathBuf, TurmaArquivo)]) -> BTreeSet<usize> {
    let referencia = format!("{} {}", turma.as_deref().unwrap_or_default(), nome_arquivo);
    turmas_alvo_por_arquivo(&referencia, turmas)
}

fn analisar_arquivo(arquivo: &ArquivoMapaoInput, turmas: &[(PathBuf, TurmaArquivo)]) -> PreviaArquivoDiagnostico {
    let (registros, turma) = match ler_saresp_bytes(&arquivo.bytes) {
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
    let indice_nome = indice_alunos_por_nome(turmas);
    let alvos = alvos(&arquivo.nome, &turma, turmas);
    let mut correspondencias = 0;
    let mut nao_encontrados = Vec::new();
    let mut duplicados = Vec::new();
    for registro in &registros {
        match destinos_nome_arquivo(&normalizar_nome_busca(&registro.nome), &indice_nome, &alvos).len() {
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
        return Err("Selecione ao menos uma planilha do SARESP - Diagnóstico.".to_string());
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

pub(crate) fn montar_saresp_json(registro: &RegistroSaresp, em: &str) -> Value {
    serde_json::json!({
        "media": registro.media,
        "menor_nota": registro.menor_nota,
        "rede_origem": registro.rede_origem,
        "disciplinas": registro.disciplinas,
        "em": em,
    })
}

#[tauri::command(async)]
pub(crate) fn analisar_saresp(input: ImportacaoDiagnosticoInput) -> Result<PreviaImportacaoDiagnostico, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    analisar_input(&input.arquivos, &turmas)
}

#[tauri::command(async)]
pub(crate) fn aplicar_saresp(input: ImportacaoDiagnosticoInput) -> Result<ResultadoImportacaoDiagnostico, String> {
    let _dados = travar_dados();
    let mut turmas = carregar_turmas_com_caminho()?;
    let previa = analisar_input(&input.arquivos, &turmas)?;
    let em = Local::now().to_rfc3339();
    let mut alunos_atualizados = BTreeSet::new();
    let mut turmas_alteradas = BTreeSet::new();

    for arquivo in &input.arquivos {
        let Ok((registros, turma)) = ler_saresp_bytes(&arquivo.bytes) else {
            continue;
        };
        let aplicacoes: Vec<(usize, String, usize)> = {
            let indice_nome = indice_alunos_por_nome(&turmas);
            let alvos = alvos(&arquivo.nome, &turma, &turmas);
            registros
                .iter()
                .enumerate()
                .filter_map(|(idx, registro)| {
                    let destinos = destinos_nome_arquivo(&normalizar_nome_busca(&registro.nome), &indice_nome, &alvos);
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
            info.insert("saresp".to_string(), montar_saresp_json(&registros[registro_idx], &em));
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

    fn cabecalho() -> Vec<Data> {
        [
            "Aluno", "Rede Origem", "Nota Média", "MENOR NOTA", "LPT", "MAT", "ING", "CIE", "HIS", "GEO", "BIO", "FIS",
            "QUI", "FIL", "SOC",
        ]
        .map(|texto| Data::String(texto.to_string()))
        .to_vec()
    }

    #[test]
    fn colunas_de_disciplina_vem_depois_da_menor_nota() {
        let colunas = localizar_colunas(&cabecalho()).expect("cabeçalho do SARESP");
        assert_eq!((colunas.nome, colunas.media, colunas.menor, colunas.rede), (0, 2, Some(3), Some(1)));
        let siglas: Vec<&str> = colunas.disciplinas.iter().map(|(_, sigla)| sigla.as_str()).collect();
        assert_eq!(siglas[..3], ["LPT", "MAT", "ING"]);
        assert_eq!(colunas.disciplinas[0].0, 4);
    }

    #[test]
    fn turma_vem_do_rodape_de_filtros() {
        let rodape = "Filtros aplicados:\nNM_NORMALIZADO é FULANO\nNM_TURMA é 1ª SERIE A NOITE ANUAL - 41001683\nCD_ESCOLA é 7833";
        assert_eq!(turma_do_rodape(rodape).as_deref(), Some("1ª SERIE A NOITE ANUAL - 41001683"));
    }

    #[test]
    fn nota_vazia_nao_vira_zero() {
        assert_eq!(nota(Some(&Data::Empty)), None);
        assert_eq!(nota(Some(&Data::Int(0))), Some(0.0));
        assert_eq!(nota(Some(&Data::Float(3.857))), Some(3.86));
    }
}
