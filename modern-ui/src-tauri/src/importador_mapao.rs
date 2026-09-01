
// Importador de mapões e diagnóstico de aprendizagem (parsing XLSX).
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use chrono::Local;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Cursor,
    path::PathBuf,
};


#[tauri::command(async)]
pub(crate) fn analisar_mapoes_lote(input: ImportacaoMapoesInput) -> Result<PreviaImportacaoMapoes, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let indice = indice_alunos_por_nome(&turmas);
    let mut arquivos = Vec::new();

    for arquivo in input.arquivos {
        arquivos.push(analisar_arquivo_mapao(
            &arquivo,
            &indice,
            &turmas,
            &input.bimestre,
        ));
    }

    let total_correspondencias = arquivos.iter().map(|item| item.correspondencias).sum();
    let total_nao_encontrados = arquivos.iter().map(|item| item.nao_encontrados).sum();
    let total_duplicados = arquivos.iter().map(|item| item.duplicados).sum();
    Ok(PreviaImportacaoMapoes {
        arquivos,
        total_correspondencias,
        total_nao_encontrados,
        total_duplicados,
    })
}

#[tauri::command(async)]
pub(crate) fn aplicar_mapoes_lote(input: ImportacaoMapoesInput) -> Result<ResultadoImportacaoMapoes, String> {
    let _dados = travar_dados();
    let bimestre = normalizar_bimestre(&input.bimestre);
    let device_id = input.device_id.as_deref();
    let mut turmas = carregar_turmas_com_caminho()?;
    let indice = indice_alunos_por_nome(&turmas);
    let mut arquivos = Vec::new();
    let mut alunos_atualizados = BTreeSet::new();
    let mut turmas_alteradas = BTreeSet::new();

    for arquivo in input.arquivos {
        let previa = analisar_arquivo_mapao(&arquivo, &indice, &turmas, &bimestre);
        if previa.erro.is_some() {
            arquivos.push(previa);
            continue;
        }
        let dados = match ler_mapao_bytes(&arquivo.bytes) {
            Ok(dados) => dados,
            Err(err) => {
                arquivos.push(PreviaArquivoMapao {
                    turma_alvo: previa.turma_alvo.clone(),
                    turma_caminho: previa.turma_caminho.clone(),
                    erro: Some(err),
                    ..previa
                });
                continue;
            }
        };

        let eh_expansao = dados.eh_expansao;
        let alvos = alvos_para_mapao(&arquivo.nome, &dados, &turmas);
        for aluno_mapao in dados.alunos {
            if aluno_mapao_corresponde_a_inativo(&aluno_mapao, &alvos, &turmas) {
                continue;
            }
            let destinos = destinos_aluno_mapao(&aluno_mapao, &indice, &alvos, &turmas);
            if destinos.is_empty() {
                continue;
            }
            if destinos.len() != 1 {
                continue;
            }
            let (turma_idx, matricula) = &destinos[0];
            let Some((caminho, turma)) = turmas.get_mut(*turma_idx) else {
                continue;
            };
            let Some(info) = turma
                .alunos
                .as_mut()
                .and_then(|alunos| alunos.get_mut(matricula))
                .and_then(Value::as_object_mut)
            else {
                continue;
            };

            if let Some(freq) = aluno_mapao.frequencia_percentual {
                // "Fre An(%)" é cumulativo (frequência anual até aquele bimestre), então o
                // mapão do bimestre mais recente sempre tem o valor mais completo. Sem essa
                // checagem, reimportar um mapão de correção de um bimestre anterior (depois
                // de já ter importado um bimestre mais novo) fazia a frequência exibida
                // regredir para o valor mais antigo.
                let bimestre_armazenado_e_mais_recente = info
                    .get("frequencia_percentual_bimestre")
                    .and_then(Value::as_str)
                    .map(|armazenado| armazenado > bimestre.as_str())
                    .unwrap_or(false);
                if !bimestre_armazenado_e_mais_recente {
                    let valor = serde_json::Number::from_f64(freq.round())
                        .map(Value::Number)
                        .unwrap_or(Value::Null);
                    info.insert("frequencia_percentual".to_string(), valor);
                    info.insert(
                        "frequencia_percentual_bimestre".to_string(),
                        Value::String(bimestre.clone()),
                    );
                }
            }

            for (disciplina, media, faltas, compensacao) in aluno_mapao.disciplinas {
                // Mapão de "Tipo de Ensino: Expansão" (turma não seriada de
                // itinerário/aprofundamento — ver mapao_eh_expansao): as
                // notas continuam entrando normalmente abaixo, mas a
                // disciplina fica marcada pra não aparecer como pendente de
                // Plano de Ensino/PEI (nenhum professor planeja essas aulas).
                // Exceção: algumas disciplinas se repetem no mapão normal E
                // no de expansão com grafias diferentes (ex.: "Língua
                // Inglesa" no normal, "LINGUA INGLESA" no de expansão) — só a
                // grafia do mapão normal deve valer, senão a mesma matéria
                // vira duas linhas na tela. A comparação usa
                // normalizar_texto_basico (ignora acento/caixa) justamente
                // pra pegar esses casos; comparação exata deixava a grafia
                // de expansão passar como se fosse uma disciplina nova.
                let ja_e_regular = ja_existe_disciplina_regular(turma.carga_horaria.as_ref(), &disciplina.nome);
                if eh_expansao {
                    if !ja_e_regular {
                        let marcadas = turma.disciplinas_expansao.get_or_insert_with(Vec::new);
                        if !marcadas.contains(&disciplina.nome) {
                            marcadas.push(disciplina.nome.clone());
                        }
                    }
                } else if let Some(marcadas) = turma.disciplinas_expansao.as_mut() {
                    marcadas.retain(|nome| nome != &disciplina.nome);
                }
                if let Some(valor) = media {
                    inserir_valor_bimestre(info, "medias", &bimestre, &disciplina.nome, valor, device_id);
                }
                if let Some(valor) = faltas {
                    inserir_valor_bimestre(info, "frequencia", &bimestre, &disciplina.nome, valor, None);
                }
                if let Some(valor) = compensacao {
                    inserir_valor_bimestre(
                        info,
                        "compensacao_ausencias",
                        &bimestre,
                        &disciplina.nome,
                        valor,
                        None,
                    );
                }
                // Grafia de expansão com equivalente já regular: não cria uma
                // entrada própria na carga horária (a exigência de Plano de
                // Ensino/PEI já é coberta pela grafia do mapão normal) — só
                // nota/falta acima continuam sendo registradas normalmente.
                let pular_carga_horaria = eh_expansao && ja_e_regular;
                if let Some(aulas) = disciplina.aulas {
                    if !pular_carga_horaria {
                        let carga = turma.carga_horaria.get_or_insert_with(serde_json::Map::new);
                        let por_bimestre = carga
                            .entry(bimestre.clone())
                            .or_insert_with(|| Value::Object(serde_json::Map::new()));
                        if let Some(objeto) = por_bimestre.as_object_mut() {
                            objeto.entry(disciplina.nome.clone()).or_insert_with(|| {
                                serde_json::Number::from_f64(aulas)
                                    .map(Value::Number)
                                    .unwrap_or(Value::Null)
                            });
                        }
                    }
                }
            }

            alunos_atualizados.insert((caminho.to_string_lossy().to_string(), matricula.clone()));
            turmas_alteradas.insert(caminho.to_string_lossy().to_string());
        }
        arquivos.push(previa);
    }

    for (caminho, turma) in &turmas {
        if turmas_alteradas.contains(&caminho.to_string_lossy().to_string()) {
            let texto = serde_json::to_string_pretty(turma).map_err(|err| err.to_string())?;
            escrever_json_atomicamente(caminho, &texto).map_err(|err| err.to_string())?;
        }
    }

    Ok(ResultadoImportacaoMapoes {
        arquivos,
        turmas_atualizadas: turmas_alteradas.len(),
        alunos_atualizados: alunos_atualizados.len(),
    })
}

#[tauri::command(async)]
pub(crate) fn analisar_diagnostico_aprendizagem(
    input: ImportacaoDiagnosticoInput,
) -> Result<PreviaImportacaoDiagnostico, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    analisar_diagnostico_input(&input.arquivos, &turmas)
}

#[tauri::command(async)]
pub(crate) fn aplicar_diagnostico_aprendizagem(
    input: ImportacaoDiagnosticoInput,
) -> Result<ResultadoImportacaoDiagnostico, String> {
    let _dados = travar_dados();
    let mut turmas = carregar_turmas_com_caminho()?;
    let previa = analisar_diagnostico_input(&input.arquivos, &turmas)?;
    let mut alunos_atualizados = BTreeSet::new();
    let mut turmas_alteradas = BTreeSet::new();

    for arquivo in &input.arquivos {
        let Ok((registros, cabecalho)) = ler_diagnostico_bytes(&arquivo.bytes) else {
            continue;
        };
        // Índices recalculados por arquivo: `turmas` muda entre um arquivo e
        // outro. Colhe (turma, matrícula) com empréstimo imutável dentro do
        // bloco e só depois grava, para não conflitar com o `get_mut` abaixo.
        let aplicacoes: Vec<(usize, String, usize)> = {
            let indice_ra = indice_alunos_por_ra(&turmas);
            let indice_nome = indice_alunos_por_nome(&turmas);
            registros
                .iter()
                .enumerate()
                .filter_map(|(idx, registro)| {
                    let destinos = destinos_diagnostico(registro, &indice_ra, &indice_nome);
                    (destinos.len() == 1).then(|| (destinos[0].0, destinos[0].1.clone(), idx))
                })
                .collect()
        };

        for (turma_idx, matricula, registro_idx) in aplicacoes {
            let registro = &registros[registro_idx];
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

            info.insert(
                "diagnostico_aprendizagem".to_string(),
                montar_diagnostico_json(registro, &cabecalho),
            );
            alunos_atualizados.insert((caminho.to_string_lossy().to_string(), matricula.clone()));
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

pub(crate) fn destinos_nome_arquivo(
    nome_normalizado: &str,
    indice: &BTreeMap<String, Vec<(usize, String)>>,
    alvos: &BTreeSet<usize>,
) -> Vec<(usize, String)> {
    let destinos = indice.get(nome_normalizado).cloned().unwrap_or_default();
    if destinos.len() <= 1 {
        return destinos;
    }

    if alvos.is_empty() {
        return destinos;
    }

    destinos
        .into_iter()
        .filter(|(turma_idx, _)| alvos.contains(turma_idx))
        .collect()
}

pub(crate) fn destinos_aluno_mapao(
    aluno: &AlunoMapao,
    indice: &BTreeMap<String, Vec<(usize, String)>>,
    alvos: &BTreeSet<usize>,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> Vec<(usize, String)> {
    if aluno.nome.chars().any(char::is_alphabetic) {
        let destinos = destinos_nome_arquivo(&normalizar_nome_busca(&aluno.nome), indice, alvos);
        if !destinos.is_empty() {
            return destinos;
        }
    }

    let Some(numero) = aluno.numero_chamada else {
        return Vec::new();
    };
    let mut destinos = Vec::new();
    for (turma_idx, (_, turma)) in turmas.iter().enumerate() {
        if !alvos.is_empty() && !alvos.contains(&turma_idx) {
            continue;
        }
        let Some(alunos) = &turma.alunos else {
            continue;
        };
        for (matricula, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            if info.get("numero_chamada").and_then(Value::as_i64) == Some(numero) {
                destinos.push((turma_idx, matricula.clone()));
            }
        }
    }
    destinos
}

pub(crate) fn rotulo_aluno_mapao(aluno: &AlunoMapao) -> String {
    if aluno.nome.chars().any(char::is_alphabetic) {
        aluno.nome.clone()
    } else if let Some(numero) = aluno.numero_chamada {
        format!("Número {numero}")
    } else {
        "Aluno sem identificação".to_string()
    }
}

pub(crate) fn aluno_mapao_corresponde_a_inativo(
    aluno: &AlunoMapao,
    alvos: &BTreeSet<usize>,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> bool {
    if aluno.nome.chars().any(char::is_alphabetic) {
        return false;
    }
    let Some(numero) = aluno.numero_chamada else {
        return false;
    };
    if alvos.len() != 1 {
        return false;
    }
    let Some((_, turma)) = alvos.iter().next().and_then(|idx| turmas.get(*idx)) else {
        return false;
    };
    turma
        .alunos
        .as_ref()
        .map(|alunos| {
            alunos.values().any(|info| {
                info.get("numero_chamada").and_then(Value::as_i64) == Some(numero)
                    && !info.get("ativo").and_then(Value::as_bool).unwrap_or(true)
            })
        })
        .unwrap_or(false)
}

pub(crate) fn aluno_mapao_sem_medias(aluno: &AlunoMapao) -> bool {
    aluno
        .disciplinas
        .iter()
        .all(|(_, media, _, _)| media.is_none())
}

pub(crate) fn alvos_para_mapao(
    nome_arquivo: &str,
    dados: &DadosMapao,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> BTreeSet<usize> {
    if mapao_educacao_fisica_misto(dados) {
        return turmas
            .iter()
            .enumerate()
            .filter_map(|(idx, (_, turma))| turma_ensino_medio(turma).then_some(idx))
            .collect();
    }

    let por_arquivo = turmas_alvo_por_arquivo(nome_arquivo, turmas);
    if por_arquivo.len() == 1 {
        return por_arquivo;
    }

    let nomes_mapao = dados
        .alunos
        .iter()
        .filter(|aluno| aluno.nome.chars().any(char::is_alphabetic))
        .map(|aluno| normalizar_nome_busca(&aluno.nome))
        .collect::<BTreeSet<_>>();
    let numeros_mapao = dados
        .alunos
        .iter()
        .filter_map(|aluno| aluno.numero_chamada)
        .collect::<BTreeSet<_>>();
    let mut pontuacoes = Vec::new();
    for (idx, (_, turma)) in turmas.iter().enumerate() {
        let mut pontos = 0usize;
        if let Some(alunos) = &turma.alunos {
            for info in alunos.values() {
                if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                    continue;
                }
                if let Some(nome) = info.get("nome").and_then(Value::as_str) {
                    if nomes_mapao.contains(&normalizar_nome_busca(nome)) {
                        pontos += 1;
                        continue;
                    }
                }
                if let Some(numero) = info.get("numero_chamada").and_then(Value::as_i64) {
                    if numeros_mapao.contains(&numero) {
                        pontos += 1;
                    }
                }
            }
        }
        if pontos > 0 {
            pontuacoes.push((idx, pontos));
        }
    }
    pontuacoes.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let Some((melhor_idx, melhor_pontos)) = pontuacoes.first().copied() else {
        return BTreeSet::new();
    };
    let empate = pontuacoes
        .get(1)
        .map(|(_, pontos)| *pontos == melhor_pontos)
        .unwrap_or(false);
    let minimo = (dados.alunos.len() / 3).max(3);
    if empate || melhor_pontos < minimo {
        return BTreeSet::new();
    }
    BTreeSet::from([melhor_idx])
}

pub(crate) fn mapao_educacao_fisica_misto(dados: &DadosMapao) -> bool {
    dados.disciplinas.len() == 1
        && dados
            .disciplinas
            .iter()
            .next()
            .map(|disciplina| normalizar_texto_basico(disciplina).contains("EDUCACAO FISICA"))
            .unwrap_or(false)
}

pub(crate) fn turma_ensino_medio(turma: &TurmaArquivo) -> bool {
    turma
        .ciclo
        .as_deref()
        .map(|ciclo| normalizar_texto_basico(ciclo) == "EM")
        .unwrap_or(false)
        || turma
            .serie
            .as_deref()
            .map(|serie| normalizar_texto_basico(serie).contains("SERIE"))
            .unwrap_or(false)
}

pub(crate) fn rotulo_alvos(alvos: &BTreeSet<usize>, turmas: &[(PathBuf, TurmaArquivo)]) -> Option<String> {
    if alvos.is_empty() {
        return None;
    }
    let nomes = alvos
        .iter()
        .filter_map(|idx| turmas.get(*idx).map(|(_, turma)| turma.codigo.clone()))
        .collect::<Vec<_>>();
    if nomes.is_empty() {
        None
    } else {
        Some(nomes.join(", "))
    }
}

pub(crate) fn caminho_alvo(alvos: &BTreeSet<usize>, turmas: &[(PathBuf, TurmaArquivo)]) -> Option<String> {
    if alvos.len() != 1 {
        return None;
    }
    let idx = *alvos.iter().next()?;
    turmas
        .get(idx)
        .map(|(caminho, _)| caminho.to_string_lossy().to_string())
}

pub(crate) fn turmas_alvo_por_arquivo(
    nome_arquivo: &str,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> BTreeSet<usize> {
    let arquivo = normalizar_texto_basico(nome_arquivo);
    let mut alvos = BTreeSet::new();
    for (idx, (_, turma)) in turmas.iter().enumerate() {
        for identificador in identificadores_turma(turma) {
            if !identificador.is_empty() && arquivo.contains(&identificador) {
                alvos.insert(idx);
            }
        }
    }
    alvos
}

pub(crate) fn identificadores_turma(turma: &TurmaArquivo) -> Vec<String> {
    let mut ids = Vec::new();
    ids.push(normalizar_texto_basico(&turma.codigo));
    if let Some(serie) = &turma.serie {
        let serie = normalizar_texto_basico(serie);
        let letra = turma
            .codigo
            .split_whitespace()
            .last()
            .map(normalizar_texto_basico)
            .unwrap_or_default();
        if !letra.is_empty() {
            ids.push(format!("{serie} {letra}"));
        }
    }
    ids.sort();
    ids.dedup();
    ids
}

pub(crate) fn analisar_arquivo_mapao(
    arquivo: &ArquivoMapaoInput,
    indice: &BTreeMap<String, Vec<(usize, String)>>,
    turmas: &[(PathBuf, TurmaArquivo)],
    _bimestre: &str,
) -> PreviaArquivoMapao {
    match ler_mapao_bytes(&arquivo.bytes) {
        Ok(dados) => {
            let mut correspondencias = 0;
            let mut nao_encontrados = 0;
            let mut nomes_nao_encontrados = Vec::new();
            let mut duplicados = 0;
            let mut nomes_duplicados = Vec::new();
            let mut alunos_lidos = 0;
            let alvos = alvos_para_mapao(&arquivo.nome, &dados, turmas);
            for aluno in &dados.alunos {
                if aluno_mapao_corresponde_a_inativo(aluno, &alvos, turmas) {
                    continue;
                }
                let destinos = destinos_aluno_mapao(aluno, indice, &alvos, turmas);
                if destinos.is_empty()
                    && !aluno.nome.chars().any(char::is_alphabetic)
                    && aluno_mapao_sem_medias(aluno)
                {
                    continue;
                }
                alunos_lidos += 1;
                match destinos.len() {
                    0 => {
                        nao_encontrados += 1;
                        nomes_nao_encontrados.push(rotulo_aluno_mapao(aluno));
                    }
                    1 => correspondencias += 1,
                    _ => {
                        duplicados += 1;
                        nomes_duplicados.push(rotulo_aluno_mapao(aluno));
                    }
                }
            }
            PreviaArquivoMapao {
                nome: arquivo.nome.clone(),
                turma_alvo: rotulo_alvos(&alvos, turmas),
                turma_caminho: caminho_alvo(&alvos, turmas),
                alunos_lidos,
                disciplinas_lidas: dados.disciplinas.len(),
                correspondencias,
                nao_encontrados,
                nomes_nao_encontrados,
                duplicados,
                nomes_duplicados,
                erro: None,
            }
        }
        Err(err) => PreviaArquivoMapao {
            nome: arquivo.nome.clone(),
            turma_alvo: None,
            turma_caminho: None,
            alunos_lidos: 0,
            disciplinas_lidas: 0,
            correspondencias: 0,
            nao_encontrados: 0,
            nomes_nao_encontrados: Vec::new(),
            duplicados: 0,
            nomes_duplicados: Vec::new(),
            erro: Some(err),
        },
    }
}

pub(crate) fn ler_mapao_bytes(bytes: &[u8]) -> Result<DadosMapao, String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook: Xlsx<_> =
        open_workbook_from_rs(cursor).map_err(|err: XlsxError| err.to_string())?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Planilha sem abas.".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|err| err.to_string())?;
    let linhas = range.rows().map(|row| row.to_vec()).collect::<Vec<_>>();

    let linha_inicio = linhas
        .iter()
        .enumerate()
        .position(|(idx, linha)| linha_parece_cabecalho_mapao(linha, linhas.get(idx + 1)))
        .ok_or_else(|| "Cabeçalho de alunos não encontrado no mapão. Use a versão com nome, número ou nome e número.".to_string())?;
    let eh_expansao = mapao_eh_expansao(&linhas, linha_inicio);
    let cabecalho_alunos =
        localizar_colunas_aluno_mapao(&linhas[linha_inicio], linhas.get(linha_inicio + 1))
            .ok_or_else(|| {
                "Não foi possível identificar a coluna de aluno ou número de chamada no mapão."
                    .to_string()
            })?;

    let mut linha_freq = None;
    let mut col_frequencia = None;
    for offset in 1..=5 {
        let idx = linha_inicio + offset;
        if idx >= linhas.len() {
            break;
        }
        for (col, celula) in linhas[idx].iter().enumerate() {
            let texto = rotulo_celula(celula);
            if texto.contains("FRE") && texto.contains("AN") {
                linha_freq = Some(idx);
                col_frequencia = Some(col);
                break;
            }
        }
        if linha_freq.is_some() {
            break;
        }
    }
    let linha_freq =
        linha_freq.ok_or_else(|| "Coluna 'Fre An(%)' não encontrada no mapão.".to_string())?;

    let cabecalho = &linhas[linha_inicio];
    let mut disciplinas = Vec::new();
    let mut idx = 0;
    while idx < cabecalho.len() {
        let nome = texto_celula(cabecalho.get(idx));
        if nome.contains('\n') {
            let disciplina = normalizar_disciplina_mapao(nome.split('\n').next().unwrap_or(""));
            let inicio = idx;
            let mut fim = idx;
            let mut j = idx + 1;
            while j < cabecalho.len() && texto_celula(cabecalho.get(j)).trim().is_empty() {
                fim = j;
                j += 1;
            }
            let (media_col, faltas_col, compensacao_col) =
                localizar_colunas_bloco(&linhas, linha_inicio, linha_freq, inicio, fim);
            let aulas = extrair_aulas_disciplina(&linhas, &disciplina, inicio, fim);
            disciplinas.push(DisciplinaMapao {
                nome: disciplina,
                media_col,
                faltas_col,
                compensacao_col,
                aulas,
            });
            idx = j;
        } else {
            idx += 1;
        }
    }

    let mut alunos = Vec::new();
    let mut disciplinas_lidas = BTreeSet::new();
    let mut encontrou_linha_aluno = false;
    for linha in linhas.iter().skip(linha_freq + 1) {
        let nome = cabecalho_alunos
            .nome_col
            .and_then(|col| linha.get(col))
            .map(|celula| texto_celula(Some(celula)).trim().to_string())
            .unwrap_or_default();
        let numero_chamada = cabecalho_alunos
            .numero_col
            .and_then(|col| linha.get(col))
            .and_then(numero_chamada_celula);
        if nome.is_empty() && numero_chamada.is_none() {
            if encontrou_linha_aluno {
                break;
            }
            continue;
        }
        encontrou_linha_aluno = true;
        if cabecalho_alunos
            .status_col
            .and_then(|col| linha.get(col))
            .map(|celula| !situacao_ativa_mapao(Some(celula)))
            .unwrap_or(false)
        {
            continue;
        }
        let frequencia_percentual = col_frequencia
            .and_then(|col| linha.get(col))
            .and_then(numero_celula)
            .map(|valor| if valor <= 1.0 { valor * 100.0 } else { valor });
        let mut disciplinas_aluno = Vec::new();
        for disciplina in &disciplinas {
            disciplinas_lidas.insert(disciplina.nome.clone());
            let media = linha.get(disciplina.media_col).and_then(numero_celula);
            let faltas = disciplina
                .faltas_col
                .and_then(|col| linha.get(col))
                .and_then(numero_celula);
            let compensacao = disciplina
                .compensacao_col
                .and_then(|col| linha.get(col))
                .and_then(numero_celula);
            disciplinas_aluno.push((disciplina.clone(), media, faltas, compensacao));
        }
        alunos.push(AlunoMapao {
            nome,
            numero_chamada,
            frequencia_percentual,
            disciplinas: disciplinas_aluno,
        });
    }

    Ok(DadosMapao {
        alunos,
        disciplinas: disciplinas_lidas,
        eh_expansao,
    })
}

// Procura, nas linhas antes do cabeçalho de alunos, a célula "Tipo de
// Ensino:" (rótulo do mapão do SED) e olha se o valor ao lado contém
// "Expansão" (ex.: "110 - EXPANSÃO NOVO EM") — marca de turma não seriada de
// itinerário/aprofundamento, cujas disciplinas não têm Plano de Ensino de
// professor. Ver DadosMapao::eh_expansao.
pub(crate) fn mapao_eh_expansao(linhas: &[Vec<Data>], linha_inicio: usize) -> bool {
    for linha in linhas.iter().take(linha_inicio) {
        for (idx, celula) in linha.iter().enumerate() {
            let rotulo = normalizar_texto_basico(&texto_celula(Some(celula)));
            if rotulo.contains("TIPO DE ENSINO") {
                let valor = normalizar_texto_basico(&texto_celula(linha.get(idx + 1)));
                return valor.contains("EXPANSAO");
            }
        }
    }
    false
}

/// Lê o relatório "Aprendizagem Equivalente" das Devolutivas Pedagógicas
/// (Prova Paulista / AvD). Layout fixo: colunas A=TURMA (genérica),
/// B=RA, C=ESTUDANTE, F–H=Português (AvD1, AvD2, Evolução), I–K=Matemática.
/// A turma real, a escola e a diretoria só aparecem no rodapé "Filtros
/// aplicados:".
pub(crate) fn ler_diagnostico_bytes(
    bytes: &[u8],
) -> Result<(Vec<RegistroDiagnostico>, CabecalhoDiagnostico), String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook: Xlsx<_> =
        open_workbook_from_rs(cursor).map_err(|err: XlsxError| err.to_string())?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Planilha sem abas.".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|err| err.to_string())?;
    let linhas = range.rows().map(|row| row.to_vec()).collect::<Vec<_>>();
    let linha_inicio = linhas
        .iter()
        .position(|linha| linha_parece_cabecalho_diagnostico(linha))
        .ok_or_else(|| {
            "Cabeçalho do diagnóstico não encontrado. Use o relatório \"Aprendizagem Equivalente\" das Devolutivas Pedagógicas."
                .to_string()
        })?;

    let mut registros = Vec::new();
    let mut cabecalho = CabecalhoDiagnostico::default();
    for linha in linhas.iter().skip(linha_inicio + 1) {
        let col_a = texto_celula(linha.first()).trim().to_string();
        let estudante = texto_celula(linha.get(2)).trim().to_string();

        // Rodapé: uma célula só na coluna A, com quebras de linha
        // ("Filtros aplicados:\nTurma é ...\nCD_DIRETORIA é ...").
        if normalizar_texto_basico(&col_a).starts_with("FILTROS APLICADOS") {
            cabecalho = extrair_cabecalho_diagnostico(&col_a);
            continue;
        }
        if estudante.is_empty() {
            continue;
        }
        registros.push(RegistroDiagnostico {
            ra: texto_celula(linha.get(1))
                .split_whitespace()
                .next()
                .unwrap_or("")
                .to_string(),
            turma: col_a,
            estudante,
            portugues_avd1: texto_celula(linha.get(5)).trim().to_string(),
            portugues_avd2: texto_celula(linha.get(6)).trim().to_string(),
            portugues_evolucao: texto_celula(linha.get(7)).trim().to_string(),
            matematica_avd1: texto_celula(linha.get(8)).trim().to_string(),
            matematica_avd2: texto_celula(linha.get(9)).trim().to_string(),
            matematica_evolucao: texto_celula(linha.get(10)).trim().to_string(),
        });
    }
    if registros.is_empty() {
        return Err("Não encontrei estudantes válidos na planilha de diagnóstico.".to_string());
    }
    Ok((registros, cabecalho))
}

pub(crate) fn linha_parece_cabecalho_diagnostico(linha: &[Data]) -> bool {
    let rotulos = linha.iter().map(rotulo_celula).collect::<Vec<_>>();
    rotulos.first().map(String::as_str) == Some("TURMA")
        && rotulos.get(2).map(String::as_str) == Some("ESTUDANTE")
        && rotulos.iter().filter(|rotulo| rotulo.contains("APRENDIZAGEM")).count() >= 2
        && rotulos.iter().any(|rotulo| rotulo.contains("EVOLUCAO"))
}

/// Extrai turma real / escola / diretoria do rodapé "Filtros aplicados:"
/// — uma única célula com linhas do tipo "Rótulo é valor" (o acento do "é"
/// pode ou não vir, dependendo da origem do export).
pub(crate) fn extrair_cabecalho_diagnostico(texto: &str) -> CabecalhoDiagnostico {
    fn valor_apos_e(linha: &str) -> Option<String> {
        [" é ", " e ", " = "].iter().find_map(|marcador| {
            linha
                .find(*marcador)
                .map(|pos| linha[pos + marcador.len()..].trim().to_string())
        })
    }
    let mut cabecalho = CabecalhoDiagnostico::default();
    for linha in texto.lines() {
        let linha = linha.trim();
        let norm = normalizar_texto_basico(linha);
        if norm.starts_with("TURMA E ") {
            cabecalho.turma = valor_apos_e(linha).filter(|v| !v.is_empty());
        } else if norm.starts_with("CD DIRETORIA E ") {
            cabecalho.cd_diretoria = valor_apos_e(linha).filter(|v| !v.is_empty());
        } else if norm.starts_with("CD ESCOLA E ") {
            cabecalho.cd_escola = valor_apos_e(linha).filter(|v| !v.is_empty());
        }
    }
    cabecalho
}

/// "Básico (7º ano)" -> ("Básico", Some("7º ano")). "Sem AvD1"/"Sem AvD2"/
/// vazio/"-" -> None (o aluno não fez aquela aplicação).
pub(crate) fn parsear_nivel_equivalente(bruto: &str) -> Option<(String, Option<String>)> {
    let bruto = bruto.trim();
    if bruto.is_empty() || bruto == "-" {
        return None;
    }
    let norm = normalizar_texto_basico(bruto);
    if norm.starts_with("SEM AVD") || norm.starts_with("SEM AVALIACAO") {
        return None;
    }
    if let Some((nivel, resto)) = bruto.split_once('(') {
        let equivalente = resto.trim().trim_end_matches(')').trim();
        return Some((
            nivel.trim().to_string(),
            (!equivalente.is_empty()).then(|| equivalente.to_string()),
        ));
    }
    Some((bruto.to_string(), None))
}

/// "Avançou" / "Manteve" / "Regrediu" -> Some(...). "-"/vazio -> None
/// (falta uma das duas ondas para comparar).
pub(crate) fn parsear_evolucao(bruto: &str) -> Option<String> {
    let bruto = bruto.trim();
    (!bruto.is_empty() && bruto != "-").then(|| bruto.to_string())
}

fn componente_diagnostico_json(avd1: &str, avd2: &str, evolucao: &str) -> Value {
    let onda = |bruto: &str| match parsear_nivel_equivalente(bruto) {
        Some((nivel, equivalente)) => serde_json::json!({
            "nivel": nivel,
            "aprendizagem_equivalente": equivalente,
        }),
        None => Value::Null,
    };
    serde_json::json!({
        "avd1": onda(avd1),
        "avd2": onda(avd2),
        "evolucao": parsear_evolucao(evolucao),
    })
}

pub(crate) fn montar_diagnostico_json(
    registro: &RegistroDiagnostico,
    cabecalho: &CabecalhoDiagnostico,
) -> Value {
    serde_json::json!({
        "turma_origem": cabecalho.turma.clone().unwrap_or_else(|| registro.turma.clone()),
        "cd_escola": cabecalho.cd_escola.clone(),
        "cd_diretoria": cabecalho.cd_diretoria.clone(),
        "portugues": componente_diagnostico_json(
            &registro.portugues_avd1,
            &registro.portugues_avd2,
            &registro.portugues_evolucao,
        ),
        "matematica": componente_diagnostico_json(
            &registro.matematica_avd1,
            &registro.matematica_avd2,
            &registro.matematica_evolucao,
        ),
        "atualizado_em": Local::now().to_rfc3339(),
    })
}

/// Correspondência de uma linha do diagnóstico: RA primeiro, nome como
/// fallback (só quando o RA não encontra ninguém — mesma política do
/// importador de expansões).
pub(crate) fn destinos_diagnostico(
    registro: &RegistroDiagnostico,
    indice_ra: &BTreeMap<String, Vec<(usize, String)>>,
    indice_nome: &BTreeMap<String, Vec<(usize, String)>>,
) -> Vec<(usize, String)> {
    let mut vistos = BTreeSet::new();
    let mut por_ra = Vec::new();
    for variante in variantes_matricula(&registro.ra) {
        for candidato in indice_ra.get(&variante).into_iter().flatten() {
            if vistos.insert(candidato.clone()) {
                por_ra.push(candidato.clone());
            }
        }
    }
    if !por_ra.is_empty() {
        return por_ra;
    }
    indice_nome
        .get(&normalizar_nome_busca(&registro.estudante))
        .cloned()
        .unwrap_or_default()
}

pub(crate) fn analisar_diagnostico_arquivo(
    arquivo: &ArquivoMapaoInput,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> PreviaArquivoDiagnostico {
    let (registros, cabecalho) = match ler_diagnostico_bytes(&arquivo.bytes) {
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
        let destinos = destinos_diagnostico(registro, &indice_ra, &indice_nome);
        match destinos.len() {
            1 => correspondencias += 1,
            0 => nao_encontrados.push(registro.estudante.clone()),
            _ => duplicados.push(registro.estudante.clone()),
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
        turmas_identificadas: cabecalho.turma.into_iter().collect(),
        erro: None,
    }
}

pub(crate) fn analisar_diagnostico_input(
    arquivos: &[ArquivoMapaoInput],
    turmas: &[(PathBuf, TurmaArquivo)],
) -> Result<PreviaImportacaoDiagnostico, String> {
    if arquivos.is_empty() {
        return Err("Selecione ao menos uma planilha de diagnóstico SARESP.".to_string());
    }
    let arquivos = arquivos
        .iter()
        .map(|arquivo| analisar_diagnostico_arquivo(arquivo, turmas))
        .collect::<Vec<_>>();
    Ok(PreviaImportacaoDiagnostico {
        total_registros: arquivos.iter().map(|arquivo| arquivo.registros_lidos).sum(),
        total_correspondencias: arquivos.iter().map(|arquivo| arquivo.correspondencias).sum(),
        total_nao_encontrados: arquivos.iter().map(|arquivo| arquivo.nao_encontrados).sum(),
        total_duplicados: arquivos.iter().map(|arquivo| arquivo.duplicados).sum(),
        arquivos,
    })
}

pub(crate) fn localizar_colunas_bloco(
    linhas: &[Vec<Data>],
    linha_inicio: usize,
    linha_freq: usize,
    inicio: usize,
    fim: usize,
) -> (usize, Option<usize>, Option<usize>) {
    let mut media_col = None;
    let mut faltas_col = None;
    let mut compensacao_col = None;
    for coluna in inicio..=fim {
        let mut rotulos = Vec::new();
        for linha in linhas.iter().take(linha_freq + 1).skip(linha_inicio + 1) {
            let rotulo = linha.get(coluna).map(rotulo_celula).unwrap_or_default();
            if !rotulo.is_empty() {
                rotulos.push(rotulo);
            }
        }
        let texto = rotulos.join(" | ");
        if rotulos.iter().any(|item| item == "AC")
            || (texto.contains("COMP") && (texto.contains("AUS") || texto.contains("FALT")))
        {
            compensacao_col = Some(coluna);
        } else if (texto.contains("FALT") || rotulos.iter().any(|item| item == "F"))
            && faltas_col.is_none()
        {
            faltas_col = Some(coluna);
        } else if (texto.contains("MED")
            || texto.contains("NOT")
            || rotulos.iter().any(|item| item == "M"))
            && media_col.is_none()
        {
            media_col = Some(coluna);
        }
    }
    let media_col = media_col.unwrap_or(inicio);
    let faltas_col = faltas_col.or_else(|| (media_col < fim).then_some(media_col + 1));
    (media_col, faltas_col, compensacao_col)
}

pub(crate) struct ColunasAlunoMapao {
    pub(crate) nome_col: Option<usize>,
    pub(crate) numero_col: Option<usize>,
    pub(crate) status_col: Option<usize>,
}

pub(crate) fn linha_parece_cabecalho_mapao(linha: &[Data], proxima_linha: Option<&Vec<Data>>) -> bool {
    let rotulos = linha.iter().map(rotulo_celula).collect::<Vec<_>>();
    let tem_aluno = rotulos
        .iter()
        .any(|rotulo| rotulo == "ALUNO" || rotulo.contains("NOME"));
    let tem_numero = rotulos.iter().any(|rotulo| rotulo_numero_chamada(rotulo))
        || proxima_linha
            .map(|linha| {
                linha
                    .iter()
                    .map(rotulo_celula)
                    .any(|rotulo| rotulo_numero_chamada(&rotulo))
            })
            .unwrap_or(false);
    let tem_disciplina = linha
        .iter()
        .any(|celula| texto_celula(Some(celula)).contains('\n'));
    (tem_aluno || tem_numero) && tem_disciplina
}

pub(crate) fn localizar_colunas_aluno_mapao(
    linha: &[Data],
    subcabecalho: Option<&Vec<Data>>,
) -> Option<ColunasAlunoMapao> {
    let mut nome_col = None;
    let mut numero_col = None;
    let mut status_col = None;
    for (col, celula) in linha.iter().enumerate() {
        let rotulo = rotulo_celula(celula);
        if nome_col.is_none() && (rotulo == "ALUNO" || rotulo.contains("NOME")) {
            nome_col = Some(col);
        } else if numero_col.is_none() && rotulo_numero_chamada(&rotulo) {
            numero_col = Some(col);
        } else if status_col.is_none() && matches!(rotulo.as_str(), "SITUACAO" | "SIT" | "STATUS") {
            status_col = Some(col);
        }
    }
    if numero_col.is_none() {
        if let Some(subcabecalho) = subcabecalho {
            numero_col = subcabecalho.iter().enumerate().find_map(|(col, celula)| {
                rotulo_numero_chamada(&rotulo_celula(celula)).then_some(col)
            });
        }
    }

    if status_col.is_none() {
        status_col = nome_col.map(|col| col + 1).filter(|col| *col < linha.len());
    }

    (nome_col.is_some() || numero_col.is_some()).then_some(ColunasAlunoMapao {
        nome_col,
        numero_col,
        status_col,
    })
}

pub(crate) fn rotulo_numero_chamada(rotulo: &str) -> bool {
    matches!(
        rotulo,
        "N" | "N." | "NO" | "Nº" | "NUM" | "NUM." | "NUMERO" | "NUMERO CHAMADA" | "CHAMADA"
    )
}

pub(crate) fn situacao_ativa_mapao(celula: Option<&Data>) -> bool {
    let status = celula.map(rotulo_celula).unwrap_or_default();
    matches!(
        status.as_str(),
        "ATIVO" | "MATRICULADO" | "FREQUENTE" | "ENCERRADO"
    )
}

pub(crate) fn extrair_aulas_disciplina(
    linhas: &[Vec<Data>],
    disciplina: &str,
    inicio: usize,
    fim: usize,
) -> Option<f64> {
    for linha in linhas {
        for coluna in inicio..=fim {
            let texto = linha
                .get(coluna)
                .map(|celula| {
                    normalizar_texto_basico_preservando_pontuacao(&texto_celula(Some(celula)))
                })
                .unwrap_or_default();
            if !texto.contains("AULAS DADAS") {
                continue;
            }
            if let Some(parte) = texto.split(':').nth(1) {
                if let Ok(valor) = parte.split_whitespace().next().unwrap_or("").parse::<f64>() {
                    return Some(valor);
                }
            }
            let _ = disciplina;
        }
    }
    None
}

pub(crate) fn inserir_valor_bimestre(
    info: &mut serde_json::Map<String, Value>,
    campo: &str,
    bimestre: &str,
    disciplina: &str,
    valor: f64,
    device_id: Option<&str>,
) {
    let raiz = info
        .entry(campo.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(raiz) = raiz.as_object_mut() else {
        return;
    };
    let por_bimestre = raiz
        .entry(bimestre.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(por_bimestre) = por_bimestre.as_object_mut() else {
        return;
    };
    let entrada = if let Some(por) = device_id {
        serde_json::json!({
            "v": valor,
            "por": por,
            "em": Local::now().to_rfc3339(),
        })
    } else {
        serde_json::Number::from_f64(valor)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    };
    por_bimestre.insert(disciplina.to_string(), entrada);
}

pub(crate) fn texto_celula(celula: Option<&Data>) -> String {
    match celula {
        Some(Data::String(texto)) => texto.clone(),
        Some(Data::Float(valor)) => valor.to_string(),
        Some(Data::Int(valor)) => valor.to_string(),
        Some(Data::Bool(valor)) => valor.to_string(),
        _ => String::new(),
    }
}

pub(crate) fn numero_celula(celula: &Data) -> Option<f64> {
    match celula {
        Data::Float(valor) => Some(*valor),
        Data::Int(valor) => Some(*valor as f64),
        Data::String(texto) => texto
            .replace('%', "")
            .replace(',', ".")
            .trim()
            .parse::<f64>()
            .ok(),
        _ => None,
    }
}

pub(crate) fn numero_chamada_celula(celula: &Data) -> Option<i64> {
    match celula {
        Data::Int(valor) => Some(*valor),
        Data::Float(valor) if valor.fract().abs() < f64::EPSILON => Some(*valor as i64),
        Data::String(texto) => {
            let texto = texto.trim();
            texto
                .chars()
                .all(|ch| ch.is_ascii_digit())
                .then(|| texto.parse::<i64>().ok())
                .flatten()
        }
        _ => None,
    }
}

pub(crate) fn rotulo_celula(celula: &Data) -> String {
    normalizar_texto_basico(&texto_celula(Some(celula)))
}

pub(crate) fn normalizar_disciplina_mapao(valor: &str) -> String {
    normalizar_texto_basico(valor)
}

// "Projeto de Vida" é o único componente do mapão normal que, mesmo tendo
// carga horária e nota lançada normalmente, nunca tem professor de
// componente que escreva Plano de Ensino ou PEI — confirmado pelo
// coordenador em 10/08/2026. Redação e Leitura e Orientação de Estudo
// SÃO disciplinas regulares normais (têm professor e exigem os dois
// documentos); não entram aqui. Usado por listar_disciplinas_turma
// (Planejamento) e listar_alunos_elegiveis_com_disciplinas (PEI).
pub(crate) fn disciplina_e_de_apoio_sem_documento(nome: &str) -> bool {
    normalizar_texto_basico(nome) == "PROJETO DE VIDA"
}

// Existe, em `carga_horaria` (qualquer bimestre), alguma disciplina cuja
// grafia normalizada (ignora acento/caixa) bate com `nome`? Usado para
// decidir se uma disciplina vinda de um mapão de expansão já tem
// equivalente no mapão normal — ver aplicar_mapoes_lote. Comparação
// normalizada de propósito: o mapão normal e o de expansão podem grafar a
// mesma matéria de formas diferentes (ex.: "Língua Inglesa" vs "LINGUA
// INGLESA"); comparar só a string exata deixava a grafia de expansão passar
// como se fosse uma disciplina nova, duplicando a linha na tela.
pub(crate) fn ja_existe_disciplina_regular(
    carga_horaria: Option<&serde_json::Map<String, Value>>,
    nome: &str,
) -> bool {
    let nome_norm = normalizar_texto_basico(nome);
    carga_horaria.is_some_and(|carga| {
        carga.values().any(|por_disc| {
            por_disc
                .as_object()
                .is_some_and(|obj| obj.keys().any(|chave| normalizar_texto_basico(chave) == nome_norm))
        })
    })
}

pub(crate) fn normalizar_nome_busca(valor: &str) -> String {
    normalizar_texto_basico(valor)
}

// ── Correção de disciplinas duplicadas por grafia diferente ────────────────
//
// A normalização em normalizar_disciplina_mapao (usada na importação de
// mapão hoje) já evita que uma disciplina seja gravada duas vezes com
// grafias diferentes (ex.: com/sem hífen) — mas não desfaz o que já foi
// gravado antes dela existir. As funções abaixo detectam e fundem essas
// chaves residuais dentro de `medias` de um aluno.

/// Agrupa as chaves de disciplina de `medias` (todas as usadas em
/// qualquer bimestre) pela forma normalizada. Só devolve grupos com mais
/// de uma grafia — é o que sobra pra revisar/corrigir. Só lê, não muda
/// nada (usado tanto pela prévia quanto pela aplicação).
pub(crate) fn agrupar_grafias_duplicadas(medias: &serde_json::Map<String, Value>) -> BTreeMap<String, Vec<String>> {
    let mut todas: BTreeSet<String> = BTreeSet::new();
    for bimestre in medias.values() {
        if let Some(obj) = bimestre.as_object() {
            todas.extend(obj.keys().cloned());
        }
    }
    let mut grupos: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for chave in todas {
        grupos.entry(normalizar_texto_basico(&chave)).or_default().push(chave);
    }
    grupos.retain(|_, variantes| variantes.len() > 1);
    grupos
}

/// Mesma regra de mesclar_medias (sync.rs): quem tem "em" mais recente
/// vence; entre um valor com timestamp e um sem (formato legado, número
/// cru), o com timestamp vence.
fn valor_de_disciplina_vence(candidato: &Value, atual: &Value) -> bool {
    let em_cand = candidato.get("em").and_then(Value::as_str).unwrap_or("");
    let em_atual = atual.get("em").and_then(Value::as_str).unwrap_or("");
    em_cand > em_atual || (!em_cand.is_empty() && em_atual.is_empty())
}

/// Aplica a fusão em `medias` de UM aluno: pra cada grupo de grafias
/// duplicadas, funde bimestre a bimestre sob a forma canônica (a
/// normalizada — é a mesma que qualquer importação nova já grava) e
/// remove as grafias antigas. Devolve os grupos realmente fundidos.
pub(crate) fn desduplicar_disciplinas_aluno(medias: &mut serde_json::Map<String, Value>) -> Vec<(String, Vec<String>)> {
    let grupos = agrupar_grafias_duplicadas(medias);
    for (canonica, variantes) in &grupos {
        for bimestre in medias.values_mut() {
            let Some(obj) = bimestre.as_object_mut() else { continue };
            let mut vencedor: Option<Value> = None;
            for variante in variantes {
                if let Some(valor) = obj.get(variante) {
                    vencedor = Some(match vencedor {
                        Some(atual) if !valor_de_disciplina_vence(valor, &atual) => atual,
                        _ => valor.clone(),
                    });
                }
            }
            for variante in variantes {
                obj.remove(variante);
            }
            if let Some(valor) = vencedor {
                obj.insert(canonica.clone(), valor);
            }
        }
    }
    grupos.into_iter().collect()
}

#[derive(Serialize)]
pub(crate) struct GrupoDisciplinaDuplicada {
    pub(crate) forma_canonica: String,
    pub(crate) grafias: Vec<String>,
    pub(crate) turmas: Vec<String>,
    pub(crate) alunos_afetados: usize,
}

// Campos, dentro de um aluno, cujas chaves são nomes de disciplina e que
// podem ter ficado com grafias duplicadas (resíduo de importações anteriores
// à normalização atual). Todos são mapas bimestre → disciplina → valor.
// `carga_horaria` também sofre do mesmo problema, mas é do nível da turma —
// tratada à parte.
pub(crate) const CAMPOS_DISCIPLINA_ALUNO: [&str; 3] =
    ["medias", "frequencia", "ajustes_medias_conselho"];

// Junta os grupos de grafias duplicadas de todos os campos de disciplina de
// um aluno (a mesma matéria pode estar duplicada só em `frequencia`, por
// exemplo). Só leitura.
pub(crate) fn agrupar_grafias_duplicadas_aluno(aluno: &Value) -> BTreeMap<String, Vec<String>> {
    let mut combinado: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for campo in CAMPOS_DISCIPLINA_ALUNO {
        let Some(mapa) = aluno.get(campo).and_then(Value::as_object) else { continue };
        for (canonica, variantes) in agrupar_grafias_duplicadas(mapa) {
            combinado.entry(canonica).or_default().extend(variantes);
        }
    }
    combinado
        .into_iter()
        .map(|(canonica, variantes)| (canonica, variantes.into_iter().collect()))
        .collect()
}

#[tauri::command(async)]
pub(crate) fn analisar_disciplinas_duplicadas() -> Result<Vec<GrupoDisciplinaDuplicada>, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;

    let mut por_canonica: BTreeMap<String, GrupoDisciplinaDuplicada> = BTreeMap::new();
    let mut acumular = |canonica: String,
                        variantes: Vec<String>,
                        codigo_turma: &str,
                        alunos_delta: usize| {
        let entrada = por_canonica
            .entry(canonica.clone())
            .or_insert_with(|| GrupoDisciplinaDuplicada {
                forma_canonica: canonica,
                grafias: Vec::new(),
                turmas: Vec::new(),
                alunos_afetados: 0,
            });
        for variante in variantes {
            if !entrada.grafias.contains(&variante) {
                entrada.grafias.push(variante);
            }
        }
        if !entrada.turmas.contains(&codigo_turma.to_string()) {
            entrada.turmas.push(codigo_turma.to_string());
        }
        entrada.alunos_afetados += alunos_delta;
    };

    for (_, turma) in &turmas {
        if let Some(carga) = turma.carga_horaria.as_ref() {
            for (canonica, variantes) in agrupar_grafias_duplicadas(carga) {
                acumular(canonica, variantes, &turma.codigo, 0);
            }
        }
        let Some(alunos) = &turma.alunos else { continue };
        for aluno in alunos.values() {
            for (canonica, variantes) in agrupar_grafias_duplicadas_aluno(aluno) {
                acumular(canonica, variantes, &turma.codigo, 1);
            }
        }
    }

    Ok(por_canonica.into_values().collect())
}

#[tauri::command(async)]
pub(crate) fn corrigir_disciplinas_duplicadas() -> Result<usize, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let mut total = 0usize;

    for (caminho, _) in &turmas {
        let texto = fs::read_to_string(caminho).map_err(|err| format!("Nao consegui ler a turma: {err}"))?;
        let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        let mut mudou = false;

        if let Some(carga) = dados.get_mut("carga_horaria").and_then(Value::as_object_mut) {
            let fundidas = desduplicar_disciplinas_aluno(carga);
            if !fundidas.is_empty() {
                total += fundidas.len();
                mudou = true;
            }
        }

        if let Some(alunos) = dados.get_mut("alunos").and_then(Value::as_object_mut) {
            for aluno in alunos.values_mut() {
                let mut fundidas_aluno: BTreeSet<String> = BTreeSet::new();
                for campo in CAMPOS_DISCIPLINA_ALUNO {
                    if let Some(mapa) = aluno.get_mut(campo).and_then(Value::as_object_mut) {
                        for (canonica, _) in desduplicar_disciplinas_aluno(mapa) {
                            fundidas_aluno.insert(canonica);
                        }
                    }
                }
                if !fundidas_aluno.is_empty() {
                    total += fundidas_aluno.len();
                    mudou = true;
                }
            }
        }

        if mudou {
            let novo_texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
            escrever_json_atomicamente(caminho, &novo_texto).map_err(|err| err.to_string())?;
        }
    }

    Ok(total)
}

pub(crate) fn normalizar_texto_basico_preservando_pontuacao(valor: &str) -> String {
    valor
        .chars()
        .map(|ch| match ch {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'E',
            'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
            'ç' | 'Ç' => 'C',
            'ñ' | 'Ñ' => 'N',
            other => other.to_ascii_uppercase(),
        })
        .collect::<String>()
}

pub(crate) fn normalizar_texto_basico(valor: &str) -> String {
    let mut texto = String::new();
    for ch in valor.trim().chars() {
        let convertido = match ch {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'E',
            'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
            'ç' | 'Ç' => 'C',
            'ñ' | 'Ñ' => 'N',
            'ª' | 'ᵃ' => 'A',
            'º' | '°' => 'O',
            other if other.is_ascii_alphanumeric() => other.to_ascii_uppercase(),
            _ => ' ',
        };
        texto.push(convertido);
    }
    texto.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod testes_diagnostico {
    use super::*;

    fn celulas(valores: &[&str]) -> Vec<Data> {
        valores.iter().map(|v| Data::String(v.to_string())).collect()
    }

    #[test]
    fn cabecalho_novo_reconhecido_sem_coluna_status_literal() {
        let linha = celulas(&[
            "TURMA",
            "RA",
            "ESTUDANTE",
            "(%) PARTICIPAÇÃO",
            "Variação (p.p.)",
            "Av 1 Status (Aprendizagem Equivalente)",
            "Av 2 Status (Aprendizagem Equivalente)",
            "Evolução",
            "Av 1 Status (Aprendizagem Equivalente) ",
            "Av 2 Status (Aprendizagem Equivalente) ",
            "Evolução ",
        ]);
        assert!(linha_parece_cabecalho_diagnostico(&linha));
    }

    #[test]
    fn nivel_equivalente_quebra_nivel_e_ano() {
        assert_eq!(
            parsear_nivel_equivalente("Abaixo do Básico (6º ano)"),
            Some(("Abaixo do Básico".to_string(), Some("6º ano".to_string())))
        );
        assert_eq!(
            parsear_nivel_equivalente("Proficiente (1ª série)"),
            Some(("Proficiente".to_string(), Some("1ª série".to_string())))
        );
    }

    #[test]
    fn sem_avd_vira_nao_mensurado() {
        assert_eq!(parsear_nivel_equivalente("Sem AvD1"), None);
        assert_eq!(parsear_nivel_equivalente("Sem AvD2"), None);
        assert_eq!(parsear_nivel_equivalente(""), None);
        assert_eq!(parsear_nivel_equivalente("-"), None);
    }

    #[test]
    fn evolucao_traco_e_vazio_viram_none() {
        assert_eq!(parsear_evolucao("Avançou"), Some("Avançou".to_string()));
        assert_eq!(parsear_evolucao("-"), None);
        assert_eq!(parsear_evolucao(""), None);
    }

    #[test]
    fn rodape_extrai_turma_escola_diretoria() {
        let texto = "Filtros aplicados:\nTurma não está em branco\nRecorte nominal válido é 1\nTurma é 1ª SERIE A NOITE ANUAL - 41001683\nCD_DIRETORIA é 10602\nCD_ESCOLA é 7833";
        let cab = extrair_cabecalho_diagnostico(texto);
        assert_eq!(cab.turma.as_deref(), Some("1ª SERIE A NOITE ANUAL - 41001683"));
        assert_eq!(cab.cd_diretoria.as_deref(), Some("10602"));
        assert_eq!(cab.cd_escola.as_deref(), Some("7833"));
    }

    #[test]
    fn json_do_componente_marca_avd2_ausente_como_null() {
        let json = componente_diagnostico_json("Básico (7º ano)", "Sem AvD2", "-");
        assert_eq!(json["avd1"]["nivel"], "Básico");
        assert_eq!(json["avd1"]["aprendizagem_equivalente"], "7º ano");
        assert!(json["avd2"].is_null());
        assert!(json["evolucao"].is_null());
    }

    #[test]
    fn destinos_preferem_ra_e_caem_para_nome() {
        let mut indice_ra: BTreeMap<String, Vec<(usize, String)>> = BTreeMap::new();
        indice_ra.insert("1142981058".to_string(), vec![(0, "0001142981058".to_string())]);
        let mut indice_nome: BTreeMap<String, Vec<(usize, String)>> = BTreeMap::new();
        indice_nome.insert(normalizar_nome_busca("Maria Souza"), vec![(3, "999".to_string())]);

        let por_ra = RegistroDiagnostico {
            ra: "0001142981058 SP".to_string(),
            turma: "1ª série".to_string(),
            estudante: "Fulano".to_string(),
            portugues_avd1: String::new(),
            portugues_avd2: String::new(),
            portugues_evolucao: String::new(),
            matematica_avd1: String::new(),
            matematica_avd2: String::new(),
            matematica_evolucao: String::new(),
        };
        // RA vem sem o " SP"? aqui simulo já limpo (ler_diagnostico_bytes limpa).
        let mut so_numero = por_ra.clone();
        so_numero.ra = "0001142981058".to_string();
        assert_eq!(
            destinos_diagnostico(&so_numero, &indice_ra, &indice_nome),
            vec![(0, "0001142981058".to_string())]
        );

        let sem_ra = RegistroDiagnostico {
            ra: "0009999999999".to_string(),
            estudante: "Maria Souza".to_string(),
            ..por_ra
        };
        assert_eq!(
            destinos_diagnostico(&sem_ra, &indice_ra, &indice_nome),
            vec![(3, "999".to_string())]
        );
    }
}
