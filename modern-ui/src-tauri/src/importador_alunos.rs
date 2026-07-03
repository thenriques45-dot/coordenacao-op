#![allow(unused_imports)]

// Importadores de alunos: lote de listas, tarefas realizadas e elegíveis (CSV).
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
pub(crate) fn importar_alunos_elegiveis(
    input: CsvImportInput,
) -> Result<ResultadoImportacaoElegiveis, String> {
    let _dados = travar_dados();
    importar_alunos_elegiveis_interno(input).map_err(|err| err.to_string())
}

pub(crate) struct ContagemImport {
    pub(crate) novos: usize,
    pub(crate) atualizados: usize,
    pub(crate) inativados: usize,
}

// Aplica uma lista de alunos a uma turma: atualiza existentes (respeitando a situação
// lida da planilha), adiciona novos e — quando não é substituição — marca como inativo
// quem sumiu da lista. Preserva notas e demais dados já lançados.
pub(crate) fn aplicar_lista_alunos(
    alunos_existentes: &mut serde_json::Map<String, Value>,
    alunos: &[NovoAlunoInput],
    substituir: bool,
) -> ContagemImport {
    if substituir {
        alunos_existentes.clear();
    }
    let mut matriculas_csv = BTreeSet::new();
    let mut novos = 0usize;
    let mut atualizados = 0usize;

    for aluno in alunos {
        let matricula = aluno.matricula.trim();
        let nome = aluno.nome.trim();
        if matricula.is_empty() || nome.is_empty() {
            continue;
        }
        matriculas_csv.insert(matricula.to_string());

        if let Some(existente) = alunos_existentes
            .get_mut(matricula)
            .and_then(Value::as_object_mut)
        {
            existente.insert("nome".to_string(), Value::String(nome.to_string()));
            existente.insert(
                "numero_chamada".to_string(),
                aluno.numero_chamada.map(Value::from).unwrap_or(Value::Null),
            );
            existente.insert("ativo".to_string(), Value::Bool(aluno.ativo));
            if !aluno.deficiencias.is_empty() {
                existente.insert(
                    "deficiencias".to_string(),
                    serde_json::json!(aluno.deficiencias),
                );
            }
            atualizados += 1;
        } else {
            alunos_existentes.insert(
                matricula.to_string(),
                serde_json::json!({
                    "nome": nome,
                    "ativo": aluno.ativo,
                    "numero_chamada": aluno.numero_chamada,
                    "notas": {},
                    "frequencia": {},
                    "compensacao_ausencias": {},
                    "defasagens": {},
                    "medias": {},
                    "defasagem_frequencia": {},
                    "frequencia_percentual": "",
                    "encaminhamentos_conselho": {},
                    "ajustes_medias_conselho": {},
                    "deficiencias": aluno.deficiencias,
                }),
            );
            novos += 1;
        }
    }

    let mut inativados = 0usize;
    if !substituir {
        for (matricula, aluno) in alunos_existentes.iter_mut() {
            if !matriculas_csv.contains(matricula) {
                if let Some(objeto) = aluno.as_object_mut() {
                    let estava_ativo =
                        objeto.get("ativo").and_then(Value::as_bool).unwrap_or(true);
                    objeto.insert("ativo".to_string(), Value::Bool(false));
                    if estava_ativo {
                        inativados += 1;
                    }
                }
            }
        }
    }

    ContagemImport {
        novos,
        atualizados,
        inativados,
    }
}

#[derive(Deserialize)]
pub(crate) struct ArquivoAlunosLoteInput {
    pub(crate) nome_arquivo: String,
    pub(crate) alunos: Vec<NovoAlunoInput>,
}

#[derive(Serialize)]
pub(crate) struct PreviaLoteArquivo {
    pub(crate) nome_arquivo: String,
    pub(crate) turma_codigo: Option<String>,
    pub(crate) turma_caminho: Option<String>,
    pub(crate) confianca: u32,
    pub(crate) total: usize,
    pub(crate) correspondencias: usize,
    pub(crate) novos: usize,
    pub(crate) atualizados: usize,
    pub(crate) inativados: usize,
    pub(crate) identificada: bool,
}

// Detecta, por sobreposição de RAs, a qual turma cada CSV pertence e simula a atualização
// (sem gravar nada) para mostrar uma prévia.
#[tauri::command(async)]
pub(crate) fn analisar_lote_alunos(
    arquivos: Vec<ArquivoAlunosLoteInput>,
) -> Result<Vec<PreviaLoteArquivo>, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let mut saida = Vec::new();

    for arq in &arquivos {
        let ras: BTreeSet<String> = arq
            .alunos
            .iter()
            .map(|a| a.matricula.trim().to_string())
            .filter(|m| !m.is_empty())
            .collect();
        let total = ras.len();

        let mut melhor: Option<(usize, &PathBuf, &TurmaArquivo)> = None;
        for (caminho, turma) in &turmas {
            if let Some(mapa) = &turma.alunos {
                let overlap = ras.iter().filter(|m| mapa.contains_key(*m)).count();
                if overlap > 0 && melhor.is_none_or(|(o, _, _)| overlap > o) {
                    melhor = Some((overlap, caminho, turma));
                }
            }
        }

        match melhor {
            Some((overlap, caminho, turma)) if total > 0 => {
                let confianca = ((overlap as f64 / total as f64) * 100.0).round() as u32;
                let identificada = confianca >= 60 && overlap >= 3;
                let mut clone = turma.alunos.clone().unwrap_or_default();
                let cont = aplicar_lista_alunos(&mut clone, &arq.alunos, false);
                saida.push(PreviaLoteArquivo {
                    nome_arquivo: arq.nome_arquivo.clone(),
                    turma_codigo: identificada.then(|| turma.codigo.clone()),
                    turma_caminho: identificada
                        .then(|| caminho.to_string_lossy().to_string()),
                    confianca,
                    total,
                    correspondencias: overlap,
                    novos: cont.novos,
                    atualizados: cont.atualizados,
                    inativados: cont.inativados,
                    identificada,
                });
            }
            _ => saida.push(PreviaLoteArquivo {
                nome_arquivo: arq.nome_arquivo.clone(),
                turma_codigo: None,
                turma_caminho: None,
                confianca: 0,
                total,
                correspondencias: 0,
                novos: 0,
                atualizados: 0,
                inativados: 0,
                identificada: false,
            }),
        }
    }

    Ok(saida)
}

#[derive(Deserialize)]
pub(crate) struct AplicarLoteAlunosItem {
    pub(crate) turma_caminho: String,
    pub(crate) alunos: Vec<NovoAlunoInput>,
}

#[derive(Serialize)]
pub(crate) struct ResultadoLoteArquivo {
    pub(crate) turma_caminho: String,
    pub(crate) turma_codigo: String,
    pub(crate) novos: usize,
    pub(crate) atualizados: usize,
    pub(crate) inativados: usize,
}

// Aplica de fato (grava) as atualizações em lote já confirmadas na prévia.
#[tauri::command(async)]
pub(crate) fn aplicar_lote_alunos(
    itens: Vec<AplicarLoteAlunosItem>,
) -> Result<Vec<ResultadoLoteArquivo>, String> {
    let _dados = travar_dados();
    let mut saida = Vec::new();
    for item in itens {
        let caminho = PathBuf::from(&item.turma_caminho);
        validar_caminho_turma(&caminho)?;
        let texto = fs::read_to_string(&caminho)
            .map_err(|err| format!("Não consegui ler a turma: {err}"))?;
        let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        let codigo = dados
            .get("codigo")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let cont = {
            let alunos_existentes = dados
                .get_mut("alunos")
                .and_then(Value::as_object_mut)
                .ok_or_else(|| "Arquivo da turma sem lista de alunos valida.".to_string())?;
            aplicar_lista_alunos(alunos_existentes, &item.alunos, false)
        };
        let novo_texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
        escrever_json_atomicamente(&caminho, &novo_texto).map_err(|err| err.to_string())?;
        saida.push(ResultadoLoteArquivo {
            turma_caminho: item.turma_caminho,
            turma_codigo: codigo,
            novos: cont.novos,
            atualizados: cont.atualizados,
            inativados: cont.inativados,
        });
    }
    Ok(saida)
}

// ---- Importador de Tarefas Realizadas ----

#[derive(Deserialize)]
pub(crate) struct AlunoTarefasInput {
    pub(crate) nome: String,
    pub(crate) feitas: u32,
    pub(crate) total: u32,
    pub(crate) percentual: f64,
}

// Resolve ambiguidade pelo contexto: escolhe a turma candidata que tem mais
// alunos já casados sem ambiguidade no mesmo arquivo. Retorna None em empate
// ou quando nenhuma candidata tem contexto suficiente.
pub(crate) fn resolver_ambiguo_por_contexto(
    candidatas: &[(usize, String)],
    contagem: &BTreeMap<usize, usize>,
) -> Option<(usize, String)> {
    let mut melhor_count = 0usize;
    let mut melhor: Option<(usize, String)> = None;
    let mut empate = false;
    for (turma_idx, matricula) in candidatas {
        let count = contagem.get(turma_idx).copied().unwrap_or(0);
        if count == 0 {
            continue;
        }
        if count > melhor_count {
            melhor_count = count;
            melhor = Some((*turma_idx, matricula.clone()));
            empate = false;
        } else if count == melhor_count {
            empate = true;
        }
    }
    if empate { None } else { melhor }
}

#[derive(Serialize)]
pub(crate) struct PreviaTarefasAluno {
    pub(crate) nome_csv: String,
    pub(crate) turma: Option<String>,
    pub(crate) feitas: u32,
    pub(crate) total: u32,
    pub(crate) percentual: f64,
    pub(crate) ambiguo: bool,
    pub(crate) encontrado: bool,
    pub(crate) resolvido: bool,
}

#[derive(Serialize)]
pub(crate) struct PreviaTarefas {
    pub(crate) bimestre: String,
    pub(crate) total_csv: usize,
    pub(crate) encontrados: usize,
    pub(crate) nao_encontrados: usize,
    pub(crate) ambiguos: usize,
    pub(crate) resolvidos: usize,
    pub(crate) matches: Vec<PreviaTarefasAluno>,
}

#[tauri::command(async)]
pub(crate) fn analisar_tarefas(
    bimestre: String,
    alunos: Vec<AlunoTarefasInput>,
) -> Result<PreviaTarefas, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let indice = indice_alunos_por_nome(&turmas);

    // 1ª passagem: classifica todos os alunos
    let candidaturas: Vec<Vec<(usize, String)>> = alunos
        .iter()
        .map(|a| indice.get(&normalizar_nome_busca(&a.nome)).cloned().unwrap_or_default())
        .collect();

    // Contagem de contexto a partir dos exatos (sem ambiguidade)
    let mut contagem: BTreeMap<usize, usize> = BTreeMap::new();
    for dest in &candidaturas {
        if dest.len() == 1 {
            *contagem.entry(dest[0].0).or_insert(0) += 1;
        }
    }

    // 2ª passagem: monta a prévia resolvendo ambíguos pelo contexto
    let mut matches = Vec::new();
    let mut encontrados = 0usize;
    let mut nao_encontrados = 0usize;
    let mut ambiguos = 0usize;
    let mut resolvidos = 0usize;
    for (aluno, dest) in alunos.iter().zip(candidaturas.iter()) {
        match dest.len() {
            0 => {
                nao_encontrados += 1;
                matches.push(PreviaTarefasAluno {
                    nome_csv: aluno.nome.clone(),
                    turma: None,
                    feitas: aluno.feitas,
                    total: aluno.total,
                    percentual: aluno.percentual,
                    ambiguo: false,
                    encontrado: false,
                    resolvido: false,
                });
            }
            1 => {
                encontrados += 1;
                let turma_codigo = turmas
                    .get(dest[0].0)
                    .map(|(_, t)| t.codigo.clone())
                    .unwrap_or_default();
                matches.push(PreviaTarefasAluno {
                    nome_csv: aluno.nome.clone(),
                    turma: Some(turma_codigo),
                    feitas: aluno.feitas,
                    total: aluno.total,
                    percentual: aluno.percentual,
                    ambiguo: false,
                    encontrado: true,
                    resolvido: false,
                });
            }
            _ => {
                if let Some((ti, _)) = resolver_ambiguo_por_contexto(dest, &contagem) {
                    resolvidos += 1;
                    encontrados += 1;
                    let turma_codigo = turmas
                        .get(ti)
                        .map(|(_, t)| t.codigo.clone())
                        .unwrap_or_default();
                    matches.push(PreviaTarefasAluno {
                        nome_csv: aluno.nome.clone(),
                        turma: Some(turma_codigo),
                        feitas: aluno.feitas,
                        total: aluno.total,
                        percentual: aluno.percentual,
                        ambiguo: false,
                        encontrado: true,
                        resolvido: true,
                    });
                } else {
                    ambiguos += 1;
                    let turmas_str = dest
                        .iter()
                        .filter_map(|(idx, _)| turmas.get(*idx).map(|(_, t)| t.codigo.clone()))
                        .collect::<Vec<_>>()
                        .join(", ");
                    matches.push(PreviaTarefasAluno {
                        nome_csv: aluno.nome.clone(),
                        turma: Some(turmas_str),
                        feitas: aluno.feitas,
                        total: aluno.total,
                        percentual: aluno.percentual,
                        ambiguo: true,
                        encontrado: false,
                        resolvido: false,
                    });
                }
            }
        }
    }
    Ok(PreviaTarefas {
        bimestre,
        total_csv: alunos.len(),
        encontrados,
        nao_encontrados,
        ambiguos,
        resolvidos,
        matches,
    })
}

#[derive(Serialize)]
pub(crate) struct ResultadoTarefas {
    pub(crate) bimestre: String,
    pub(crate) atualizados: usize,
    pub(crate) turmas_atualizadas: usize,
    pub(crate) nao_encontrados: Vec<String>,
    pub(crate) ambiguos: Vec<String>,
}

#[tauri::command(async)]
pub(crate) fn aplicar_tarefas(
    bimestre: String,
    alunos: Vec<AlunoTarefasInput>,
) -> Result<ResultadoTarefas, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let indice = indice_alunos_por_nome(&turmas);
    let agora = Local::now().to_rfc3339();

    // Contexto: conta alunos exatos por turma
    let candidaturas: Vec<Vec<(usize, String)>> = alunos
        .iter()
        .map(|a| indice.get(&normalizar_nome_busca(&a.nome)).cloned().unwrap_or_default())
        .collect();
    let mut contagem: BTreeMap<usize, usize> = BTreeMap::new();
    for dest in &candidaturas {
        if dest.len() == 1 {
            *contagem.entry(dest[0].0).or_insert(0) += 1;
        }
    }

    let mut por_turma: BTreeMap<usize, Vec<(String, usize)>> = BTreeMap::new();
    let mut nao_encontrados = Vec::new();
    let mut ambiguos = Vec::new();
    for (aluno_idx, (aluno, dest)) in alunos.iter().zip(candidaturas.iter()).enumerate() {
        match dest.len() {
            0 => nao_encontrados.push(aluno.nome.clone()),
            1 => {
                por_turma.entry(dest[0].0).or_default().push((dest[0].1.clone(), aluno_idx));
            }
            _ => {
                if let Some((ti, mat)) = resolver_ambiguo_por_contexto(dest, &contagem) {
                    por_turma.entry(ti).or_default().push((mat, aluno_idx));
                } else {
                    ambiguos.push(aluno.nome.clone());
                }
            }
        }
    }
    let mut atualizados = 0usize;
    let mut turmas_atualizadas = 0usize;
    for (turma_idx, entradas) in &por_turma {
        let caminho = turmas[*turma_idx].0.clone();
        let texto = fs::read_to_string(&caminho)
            .map_err(|err| format!("Nao consegui ler a turma: {err}"))?;
        let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        for (matricula, aluno_idx) in entradas {
            let aluno = &alunos[*aluno_idx];
            if let Some(alunos_obj) = dados.get_mut("alunos").and_then(Value::as_object_mut) {
                if let Some(info) = alunos_obj.get_mut(matricula).and_then(Value::as_object_mut) {
                    let tarefas = info
                        .entry("tarefas")
                        .or_insert_with(|| Value::Object(Default::default()));
                    if let Value::Object(ref mut mapa) = tarefas {
                        mapa.insert(
                            bimestre.clone(),
                            serde_json::json!({
                                "feitas": aluno.feitas,
                                "total": aluno.total,
                                "percentual": aluno.percentual,
                                "em": agora,
                            }),
                        );
                    }
                    atualizados += 1;
                }
            }
        }
        let novo_texto =
            serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
        escrever_json_atomicamente(&caminho, &novo_texto).map_err(|err| err.to_string())?;
        turmas_atualizadas += 1;
    }
    Ok(ResultadoTarefas {
        bimestre,
        atualizados,
        turmas_atualizadas,
        nao_encontrados,
        ambiguos,
    })
}

#[derive(Serialize)]
pub(crate) struct RelatorioTarefasResultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) turmas: usize,
    pub(crate) alunos: usize,
}

#[tauri::command(async)]
pub(crate) fn gerar_relatorio_tarefas(
    bimestre: String,
    turmas_filtro: Vec<String>,
) -> Result<RelatorioTarefasResultado, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta: {err}"))?
        .join("relatorios");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let ts = Local::now().format("%Y%m%d_%H%M%S");
    let caminho = pasta.join(format!("tarefas_bim{}_{}.xlsx", bimestre, ts));

    let filtro_ativo = !turmas_filtro.is_empty();
    let fmt_cabecalho = Format::new().set_bold();

    let mut workbook = Workbook::new();
    let mut turmas_com_dados = 0usize;
    let mut total_alunos = 0usize;

    // Turmas na ordem do código, aplicando filtro
    let mut turmas_sel: Vec<&(PathBuf, TurmaArquivo)> = turmas
        .iter()
        .filter(|(_, t)| !filtro_ativo || turmas_filtro.contains(&t.codigo))
        .collect();
    turmas_sel.sort_by(|a, b| a.1.codigo.cmp(&b.1.codigo));

    for (_, turma) in &turmas_sel {
        let Some(alunos) = &turma.alunos else {
            continue;
        };
        // Coleta alunos ativos ordenados por número de chamada
        let mut linhas: Vec<(i64, String, u32, u32, u32)> = Vec::new();
        for (_, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            let nome = info.get("nome").and_then(Value::as_str).unwrap_or("").to_string();
            let numero = info.get("numero_chamada").and_then(Value::as_i64).unwrap_or(0);
            let (feitas, total, nota) =
                match info.get("tarefas").and_then(|t| t.get(bimestre.as_str())) {
                    Some(bim) => {
                        let f = bim.get("feitas").and_then(Value::as_u64).unwrap_or(0) as u32;
                        let t = bim.get("total").and_then(Value::as_u64).unwrap_or(0) as u32;
                        let p = bim.get("percentual").and_then(Value::as_f64).unwrap_or(0.0);
                        (f, t, (p / 10.0).round() as u32)
                    }
                    None => (0, 0, 0),
                };
            linhas.push((numero, nome, feitas, total, nota));
        }
        if linhas.is_empty() {
            continue;
        }
        linhas.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

        let ws = workbook.add_worksheet();
        // Nome da aba: até 31 caracteres, sem caracteres inválidos do Excel
        let nome_aba: String = turma
            .codigo
            .chars()
            .filter(|c| !matches!(c, '\\' | '/' | '*' | '?' | ':' | '[' | ']'))
            .take(31)
            .collect();
        ws.set_name(&nome_aba).map_err(|e| e.to_string())?;

        // Cabeçalho
        ws.write_with_format(0, 0, "Nº", &fmt_cabecalho).map_err(|e| e.to_string())?;
        ws.write_with_format(0, 1, "Nome", &fmt_cabecalho).map_err(|e| e.to_string())?;
        ws.write_with_format(0, 2, "Feitas", &fmt_cabecalho).map_err(|e| e.to_string())?;
        ws.write_with_format(0, 3, "Total", &fmt_cabecalho).map_err(|e| e.to_string())?;
        ws.write_with_format(0, 4, "Nota", &fmt_cabecalho).map_err(|e| e.to_string())?;

        // Dados
        for (idx, (numero, nome, feitas, total, nota)) in linhas.iter().enumerate() {
            let row = (idx + 1) as u32;
            if *numero > 0 {
                ws.write_number(row, 0, *numero as f64).map_err(|e| e.to_string())?;
            }
            ws.write_string(row, 1, nome).map_err(|e| e.to_string())?;
            ws.write_number(row, 2, *feitas as f64).map_err(|e| e.to_string())?;
            ws.write_number(row, 3, *total as f64).map_err(|e| e.to_string())?;
            ws.write_number(row, 4, *nota as f64).map_err(|e| e.to_string())?;
        }
        ws.set_column_width(1, 32.0).map_err(|e| e.to_string())?;

        turmas_com_dados += 1;
        total_alunos += linhas.len();
    }

    workbook.save(&caminho).map_err(|e| e.to_string())?;
    Ok(RelatorioTarefasResultado {
        caminho: caminho.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        turmas: turmas_com_dados,
        alunos: total_alunos,
    })
}

// ---- Importador de Prova Paulista ----

pub(crate) fn importar_alunos_elegiveis_interno(
    input: CsvImportInput,
) -> Result<ResultadoImportacaoElegiveis, String> {
    if !input.nome.to_lowercase().ends_with(".csv") {
        return Err("Selecione um arquivo .csv com a lista de alunos elegiveis.".to_string());
    }
    let texto = String::from_utf8(input.bytes).map_err(|_| {
        "Nao consegui ler o CSV como UTF-8. Salve a planilha como CSV UTF-8.".to_string()
    })?;
    let registros = ler_csv_alunos_elegiveis(&texto)?;
    let mut resumo = ResultadoImportacaoElegiveis {
        registros_csv: registros.len(),
        turmas_lidas: 0,
        turmas_atualizadas: 0,
        alunos_atualizados: 0,
        por_matricula: 0,
        por_nome: 0,
        nao_encontrados: Vec::new(),
        nomes_ambiguos: Vec::new(),
    };

    if registros.is_empty() {
        return Ok(resumo);
    }

    let mut por_matricula: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    let mut por_nome: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (indice, registro) in registros.iter().enumerate() {
        for variante in variantes_matricula(&registro.matricula) {
            por_matricula.entry(variante).or_default().push(indice);
        }
        if !registro.nome_normalizado.is_empty() {
            por_nome
                .entry(registro.nome_normalizado.clone())
                .or_default()
                .push(indice);
        }
    }

    let mut encontrados = BTreeSet::new();
    let mut ambiguos = BTreeSet::new();
    let turmas = carregar_turmas_com_caminho()?;
    for (caminho, turma) in turmas {
        resumo.turmas_lidas += 1;
        let mut dados = serde_json::to_value(&turma).map_err(|err| err.to_string())?;
        let Some(alunos) = dados.get_mut("alunos").and_then(Value::as_object_mut) else {
            continue;
        };
        let mut alterou_turma = false;

        for (matricula_aluno, info) in alunos.iter_mut() {
            let mut candidatos = buscar_por_matricula(matricula_aluno, &por_matricula);
            let mut modo = "matricula";
            if candidatos.len() != 1 {
                let nome = info.get("nome").and_then(Value::as_str).unwrap_or("");
                candidatos = por_nome
                    .get(&normalizar_nome_busca(nome))
                    .cloned()
                    .unwrap_or_default();
                modo = "nome";
                if candidatos.len() > 1 {
                    ambiguos.insert(nome.to_string());
                }
            }
            if candidatos.len() != 1 {
                continue;
            }

            let indice_registro = candidatos[0];
            let registro = &registros[indice_registro];
            if registro.deficiencias.is_empty() {
                continue;
            }
            let atuais = info
                .get("deficiencias")
                .and_then(Value::as_array)
                .map(|lista| {
                    lista
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if normalizar_lista_deficiencias(&atuais)
                == normalizar_lista_deficiencias(&registro.deficiencias)
            {
                encontrados.insert(indice_registro);
                continue;
            }

            if let Some(objeto) = info.as_object_mut() {
                objeto.insert(
                    "deficiencias".to_string(),
                    serde_json::json!(registro.deficiencias),
                );
                objeto.insert("elegivel_manual".to_string(), Value::Bool(true));
            }
            encontrados.insert(indice_registro);
            alterou_turma = true;
            resumo.alunos_atualizados += 1;
            if modo == "matricula" {
                resumo.por_matricula += 1;
            } else {
                resumo.por_nome += 1;
            }
        }

        if alterou_turma {
            let texto_atualizado =
                serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
            escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
            resumo.turmas_atualizadas += 1;
        }
    }

    resumo.nao_encontrados = registros
        .iter()
        .enumerate()
        .filter(|(indice, registro)| {
            !encontrados.contains(indice)
                && (!registro.nome.is_empty() || !registro.matricula.is_empty())
        })
        .map(|(_, registro)| {
            if !registro.nome.is_empty() {
                registro.nome.clone()
            } else {
                registro.matricula.clone()
            }
        })
        .collect();
    resumo.nomes_ambiguos = ambiguos
        .into_iter()
        .filter(|nome| !nome.trim().is_empty())
        .collect();
    Ok(resumo)
}

pub(crate) fn ler_csv_alunos_elegiveis(texto: &str) -> Result<Vec<RegistroElegivelCsv>, String> {
    let linhas = texto
        .lines()
        .map(|linha| linha.trim_end_matches('\r'))
        .filter(|linha| !linha.trim().is_empty())
        .collect::<Vec<_>>();
    if linhas.is_empty() {
        return Ok(Vec::new());
    }

    let delimitador = if texto.matches(';').count() >= texto.matches(',').count() {
        ';'
    } else {
        ','
    };
    let indice_cabecalho = linhas
        .iter()
        .position(|linha| {
            linha_parece_cabecalho_elegiveis(&dividir_linha_csv_generico(linha, delimitador))
        })
        .ok_or_else(|| {
            "CSV sem cabecalho reconhecivel. Use colunas como Nome do Aluno, RA e Deficiencia."
                .to_string()
        })?;
    let cabecalho = dividir_linha_csv_generico(linhas[indice_cabecalho], delimitador)
        .into_iter()
        .map(|coluna| normalizar_texto_basico(&coluna))
        .collect::<Vec<_>>();

    let mut registros = Vec::new();
    for linha in linhas.iter().skip(indice_cabecalho + 1) {
        let valores = dividir_linha_csv_generico(linha, delimitador);
        let registro = registro_elegivel_de_linha(&cabecalho, &valores);
        if !registro.deficiencias.is_empty()
            && (!registro.matricula.is_empty() || !registro.nome.is_empty())
        {
            registros.push(registro);
        }
    }
    Ok(consolidar_registros_elegiveis(registros))
}

pub(crate) fn dividir_linha_csv_generico(linha: &str, delimitador: char) -> Vec<String> {
    let mut colunas = Vec::new();
    let mut atual = String::new();
    let mut entre_aspas = false;
    let chars = linha.chars().collect::<Vec<_>>();
    let mut indice = 0;
    while indice < chars.len() {
        let ch = chars[indice];
        let proximo = chars.get(indice + 1).copied();
        if ch == '"' && entre_aspas && proximo == Some('"') {
            atual.push('"');
            indice += 2;
            continue;
        }
        if ch == '"' {
            entre_aspas = !entre_aspas;
            indice += 1;
            continue;
        }
        if ch == delimitador && !entre_aspas {
            colunas.push(atual.trim().to_string());
            atual.clear();
            indice += 1;
            continue;
        }
        atual.push(ch);
        indice += 1;
    }
    colunas.push(atual.trim().to_string());
    colunas
}

pub(crate) fn linha_parece_cabecalho_elegiveis(linha: &[String]) -> bool {
    let colunas = linha
        .iter()
        .map(|coluna| normalizar_texto_basico(coluna))
        .collect::<BTreeSet<_>>();
    let tem_nome = colunas.iter().any(|coluna| coluna_nome_elegiveis(coluna));
    let tem_ra = colunas.iter().any(|coluna| coluna_ra_elegiveis(coluna));
    let tem_deficiencia = colunas
        .iter()
        .any(|coluna| coluna_deficiencia_elegiveis(coluna));
    tem_nome && (tem_ra || tem_deficiencia)
}

pub(crate) fn registro_elegivel_de_linha(cabecalho: &[String], valores: &[String]) -> RegistroElegivelCsv {
    let obter = |predicado: fn(&str) -> bool| {
        cabecalho
            .iter()
            .position(|coluna| predicado(coluna))
            .and_then(|indice| valores.get(indice))
            .map(|valor| valor.trim().to_string())
            .unwrap_or_default()
    };
    let ra = obter(coluna_ra_elegiveis);
    let digito = obter(coluna_digito_ra_elegiveis);
    let matricula = normalizar_matricula_elegiveis(if !ra.is_empty() && !digito.is_empty() {
        format!("{ra}{digito}")
    } else {
        ra
    });
    let nome = extrair_nome_social_backend(&obter(coluna_nome_elegiveis));
    let deficiencias = extrair_deficiencias_elegiveis(cabecalho, valores);
    RegistroElegivelCsv {
        matricula,
        nome: nome.clone(),
        nome_normalizado: normalizar_nome_busca(&nome),
        deficiencias,
    }
}

pub(crate) fn coluna_ra_elegiveis(coluna: &str) -> bool {
    matches!(
        coluna,
        "RA" | "R A" | "REGISTRO DO ALUNO" | "MATRICULA" | "MATRICULA RA"
    )
}

pub(crate) fn coluna_digito_ra_elegiveis(coluna: &str) -> bool {
    matches!(coluna, "DIG RA" | "DIGITO RA" | "DIGITO DO RA")
}

pub(crate) fn coluna_nome_elegiveis(coluna: &str) -> bool {
    matches!(
        coluna,
        "NOME" | "NOME DO ALUNO" | "ALUNO" | "ESTUDANTE" | "NOME COMPLETO"
    )
}

pub(crate) fn coluna_deficiencia_elegiveis(coluna: &str) -> bool {
    matches!(
        coluna,
        "DEFICIENCIA"
            | "DEFICIENCIAS"
            | "TIPO DE DEFICIENCIA"
            | "NECESSIDADE ESPECIAL"
            | "NECESSIDADES ESPECIAIS"
            | "NEE"
            | "PUBLICO ALVO"
            | "PUBLICO ALVO AEE"
            | "ELEGIVEL"
            | "ALUNO ELEGIVEL"
    )
}

pub(crate) fn extrair_deficiencias_elegiveis(cabecalho: &[String], valores: &[String]) -> Vec<String> {
    let mut deficiencias = Vec::new();
    for (indice, coluna) in cabecalho.iter().enumerate() {
        if !coluna_deficiencia_elegiveis(coluna) {
            continue;
        }
        let valor = valores.get(indice).map(String::as_str).unwrap_or("").trim();
        let normalizado = normalizar_texto_basico(valor);
        if matches!(
            normalizado.as_str(),
            "" | "NAO" | "N" | "NAO SE APLICA" | "NAO POSSUI" | "SEM DEFICIENCIA"
        ) {
            continue;
        }
        if matches!(
            normalizado.as_str(),
            "SIM" | "S" | "ELEGIVEL" | "ALUNO ELEGIVEL"
        ) {
            deficiencias.push("Aluno elegivel".to_string());
            continue;
        }
        deficiencias.extend(
            valor
                .split([',', ';'])
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string),
        );
    }
    normalizar_lista_deficiencias(&deficiencias)
}

pub(crate) fn normalizar_lista_texto(opcoes: &[String]) -> Vec<String> {
    let mut vistos = BTreeSet::new();
    let mut saida = Vec::new();
    for opcao in opcoes {
        let texto = opcao.trim();
        if texto.is_empty() {
            continue;
        }
        let chave = normalizar_nome_busca(texto);
        if vistos.insert(chave) {
            saida.push(texto.to_string());
        }
    }
    saida
}

pub(crate) fn normalizar_lista_deficiencias(lista: &[String]) -> Vec<String> {
    let mut vistos = BTreeSet::new();
    let mut resultado = Vec::new();
    for item in lista {
        let texto = item.split_whitespace().collect::<Vec<_>>().join(" ");
        if texto.is_empty() {
            continue;
        }
        let chave = normalizar_texto_basico(&texto);
        if vistos.insert(chave) {
            resultado.push(texto);
        }
    }
    resultado
}

pub(crate) fn normalizar_matricula_elegiveis(valor: String) -> String {
    valor
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase()
}

pub(crate) fn variantes_matricula(valor: &str) -> Vec<String> {
    let matricula = normalizar_matricula_elegiveis(valor.to_string());
    if matricula.is_empty() {
        return Vec::new();
    }
    let mut variantes = BTreeSet::new();
    variantes.insert(matricula.clone());
    let sem_zeros = matricula.trim_start_matches('0').to_string();
    if !sem_zeros.is_empty() {
        variantes.insert(sem_zeros);
    }
    if matricula.len() > 1 {
        let sem_digito = matricula[..matricula.len() - 1].to_string();
        variantes.insert(sem_digito.clone());
        let sem_digito_sem_zeros = sem_digito.trim_start_matches('0').to_string();
        if !sem_digito_sem_zeros.is_empty() {
            variantes.insert(sem_digito_sem_zeros);
        }
    }
    variantes.into_iter().collect()
}

pub(crate) fn buscar_por_matricula(matricula: &str, indice: &BTreeMap<String, Vec<usize>>) -> Vec<usize> {
    let mut vistos = BTreeSet::new();
    let mut candidatos = Vec::new();
    for variante in variantes_matricula(matricula) {
        for registro in indice.get(&variante).into_iter().flatten() {
            if vistos.insert(*registro) {
                candidatos.push(*registro);
            }
        }
    }
    candidatos
}

pub(crate) fn consolidar_registros_elegiveis(registros: Vec<RegistroElegivelCsv>) -> Vec<RegistroElegivelCsv> {
    let mut consolidados = Vec::new();
    let mut por_matricula: BTreeMap<String, usize> = BTreeMap::new();
    for registro in registros {
        if registro.matricula.is_empty() {
            consolidados.push(registro);
            continue;
        }
        if let Some(indice) = por_matricula.get(&registro.matricula).copied() {
            let existente: &mut RegistroElegivelCsv = &mut consolidados[indice];
            let mut lista = existente.deficiencias.clone();
            lista.extend(registro.deficiencias);
            existente.deficiencias = normalizar_lista_deficiencias(&lista);
            if existente.nome.is_empty() && !registro.nome.is_empty() {
                existente.nome = registro.nome;
                existente.nome_normalizado = registro.nome_normalizado;
            }
        } else {
            por_matricula.insert(registro.matricula.clone(), consolidados.len());
            consolidados.push(registro);
        }
    }
    consolidados
}

pub(crate) fn extrair_nome_social_backend(nome: &str) -> String {
    let mut resultado = String::new();
    let mut profundidade = 0;
    for ch in nome.chars() {
        match ch {
            '(' => profundidade += 1,
            ')' if profundidade > 0 => profundidade -= 1,
            _ if profundidade == 0 => resultado.push(ch),
            _ => {}
        }
    }
    resultado.split_whitespace().collect::<Vec<_>>().join(" ")
}
