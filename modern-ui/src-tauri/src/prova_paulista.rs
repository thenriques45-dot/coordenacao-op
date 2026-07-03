#![allow(unused_imports)]

// Importador e relatório da Prova Paulista.
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


#[derive(Deserialize)]
pub(crate) struct ArquivoProvaInput {
    pub(crate) bytes: Vec<u8>,
}

pub(crate) struct AlunoProvaPaulistaData {
    pub(crate) nome: String,
    pub(crate) participou: bool,
    pub(crate) geral: Option<u32>,
    pub(crate) disciplinas: BTreeMap<String, u32>,
}

pub(crate) fn extrair_prova_paulista_xlsx(
    bytes: &[u8],
) -> Result<(Vec<AlunoProvaPaulistaData>, Vec<String>), String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut wb: Xlsx<_> =
        open_workbook_from_rs(cursor).map_err(|err: XlsxError| err.to_string())?;
    let aba = wb
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "Planilha sem abas.".to_string())?;
    let range = wb
        .worksheet_range(&aba)
        .map_err(|err| err.to_string())?;
    let linhas: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();
    let mut iter = linhas.iter();
    let cabecalho = iter
        .next()
        .ok_or_else(|| "Planilha sem dados.".to_string())?;

    // Colunas de disciplina: índice >= 4, com nome não-vazio
    let mut colunas_disc: Vec<(usize, String)> = Vec::new();
    for (idx, celula) in cabecalho.iter().enumerate() {
        if idx < 4 {
            continue;
        }
        let nome_col = normalizar_texto_basico(&texto_celula(Some(celula)));
        if !nome_col.is_empty() {
            colunas_disc.push((idx, nome_col));
        }
    }

    let mut alunos: Vec<AlunoProvaPaulistaData> = Vec::new();
    let mut discs_com_dados: BTreeSet<String> = BTreeSet::new();

    for linha in iter {
        // Coluna 1 = Nome; pula linhas sem nome (Total, Filtros, vazio)
        let nome = texto_celula(linha.get(1));
        if nome.is_empty() {
            continue;
        }
        // Coluna 0 = "NR RA" ou "Total"
        let col0 = texto_celula(linha.first());
        if normalizar_texto_basico(&col0) == "TOTAL" {
            continue;
        }

        // Coluna 2 = % de Participação
        let participacao = match linha.get(2) {
            Some(Data::Float(f)) => *f,
            Some(Data::Int(i)) => *i as f64,
            _ => 0.0,
        };
        let participou = participacao > 0.0;

        // Coluna 3 = % de Acertos (geral)
        let geral = match linha.get(3) {
            Some(Data::Float(f)) => Some((f * 10.0).round() as u32),
            Some(Data::Int(i)) => Some((*i as f64 * 10.0).round() as u32),
            _ => None,
        };

        // Disciplinas
        let mut disciplinas: BTreeMap<String, u32> = BTreeMap::new();
        for (col_idx, disc_nome) in &colunas_disc {
            let nota = match linha.get(*col_idx) {
                Some(Data::Float(f)) => Some((f * 10.0).round() as u32),
                Some(Data::Int(i)) => Some((*i as f64 * 10.0).round() as u32),
                _ => None,
            };
            if let Some(n) = nota {
                disciplinas.insert(disc_nome.clone(), n);
                discs_com_dados.insert(disc_nome.clone());
            }
        }

        alunos.push(AlunoProvaPaulistaData {
            nome,
            participou,
            geral,
            disciplinas,
        });
    }

    // Ordem canônica das disciplinas
    let ordem = [
        "MAT", "PORT", "ING", "HIST", "GEO", "CIE", "FILO", "SOC", "BIO", "FIS", "QUI", "FIN",
        "TEC",
    ];
    let disciplinas_ordenadas: Vec<String> = ordem
        .iter()
        .filter(|d| discs_com_dados.contains(**d))
        .map(|d| d.to_string())
        .chain(
            discs_com_dados
                .iter()
                .filter(|d| !ordem.contains(&d.as_str()))
                .cloned(),
        )
        .collect();

    Ok((alunos, disciplinas_ordenadas))
}

#[derive(Serialize)]
pub(crate) struct PreviaPaulistaAluno {
    pub(crate) nome_csv: String,
    pub(crate) turma: Option<String>,
    pub(crate) participou: bool,
    pub(crate) geral: Option<u32>,
    pub(crate) encontrado: bool,
    pub(crate) ambiguo: bool,
    pub(crate) resolvido: bool,
}

#[derive(Serialize)]
pub(crate) struct PreviaPaulista {
    pub(crate) bimestre: String,
    pub(crate) total_csv: usize,
    pub(crate) encontrados: usize,
    pub(crate) nao_encontrados: usize,
    pub(crate) ambiguos: usize,
    pub(crate) resolvidos: usize,
    pub(crate) disciplinas_detectadas: Vec<String>,
    pub(crate) matches: Vec<PreviaPaulistaAluno>,
}

#[tauri::command(async)]
pub(crate) fn analisar_prova_paulista(
    bimestre: String,
    arquivo: ArquivoProvaInput,
) -> Result<PreviaPaulista, String> {
    let _dados = travar_dados();
    let (alunos_csv, disciplinas) = extrair_prova_paulista_xlsx(&arquivo.bytes)?;
    let turmas = carregar_turmas_com_caminho()?;
    let indice = indice_alunos_por_nome(&turmas);

    // 1ª passagem: classifica e acumula contexto
    let candidaturas: Vec<Vec<(usize, String)>> = alunos_csv
        .iter()
        .map(|a| indice.get(&normalizar_nome_busca(&a.nome)).cloned().unwrap_or_default())
        .collect();
    let mut contagem: BTreeMap<usize, usize> = BTreeMap::new();
    for dest in &candidaturas {
        if dest.len() == 1 {
            *contagem.entry(dest[0].0).or_insert(0) += 1;
        }
    }

    let mut matches = Vec::new();
    let mut encontrados = 0usize;
    let mut nao_encontrados = 0usize;
    let mut ambiguos = 0usize;
    let mut resolvidos = 0usize;
    for (aluno, dest) in alunos_csv.iter().zip(candidaturas.iter()) {
        match dest.len() {
            0 => {
                nao_encontrados += 1;
                matches.push(PreviaPaulistaAluno {
                    nome_csv: aluno.nome.clone(),
                    turma: None,
                    participou: aluno.participou,
                    geral: aluno.geral,
                    encontrado: false,
                    ambiguo: false,
                    resolvido: false,
                });
            }
            1 => {
                encontrados += 1;
                let turma_codigo = turmas
                    .get(dest[0].0)
                    .map(|(_, t)| t.codigo.clone())
                    .unwrap_or_default();
                matches.push(PreviaPaulistaAluno {
                    nome_csv: aluno.nome.clone(),
                    turma: Some(turma_codigo),
                    participou: aluno.participou,
                    geral: aluno.geral,
                    encontrado: true,
                    ambiguo: false,
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
                    matches.push(PreviaPaulistaAluno {
                        nome_csv: aluno.nome.clone(),
                        turma: Some(turma_codigo),
                        participou: aluno.participou,
                        geral: aluno.geral,
                        encontrado: true,
                        ambiguo: false,
                        resolvido: true,
                    });
                } else {
                    ambiguos += 1;
                    let turmas_str = dest
                        .iter()
                        .filter_map(|(idx, _)| turmas.get(*idx).map(|(_, t)| t.codigo.clone()))
                        .collect::<Vec<_>>()
                        .join(", ");
                    matches.push(PreviaPaulistaAluno {
                        nome_csv: aluno.nome.clone(),
                        turma: Some(turmas_str),
                        participou: aluno.participou,
                        geral: aluno.geral,
                        encontrado: false,
                        ambiguo: true,
                        resolvido: false,
                    });
                }
            }
        }
    }
    Ok(PreviaPaulista {
        bimestre,
        total_csv: alunos_csv.len(),
        encontrados,
        nao_encontrados,
        ambiguos,
        resolvidos,
        disciplinas_detectadas: disciplinas,
        matches,
    })
}

#[derive(Serialize)]
pub(crate) struct ResultadoPaulista {
    pub(crate) bimestre: String,
    pub(crate) atualizados: usize,
    pub(crate) turmas_atualizadas: usize,
    pub(crate) nao_encontrados: Vec<String>,
    pub(crate) ambiguos: Vec<String>,
}

#[tauri::command(async)]
pub(crate) fn aplicar_prova_paulista(
    bimestre: String,
    arquivo: ArquivoProvaInput,
) -> Result<ResultadoPaulista, String> {
    let _dados = travar_dados();
    let (alunos_csv, _) = extrair_prova_paulista_xlsx(&arquivo.bytes)?;
    let turmas = carregar_turmas_com_caminho()?;
    let indice = indice_alunos_por_nome(&turmas);
    let agora = Local::now().to_rfc3339();

    // Contexto: conta alunos exatos por turma para resolver ambíguos
    let candidaturas: Vec<Vec<(usize, String)>> = alunos_csv
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
    for (aluno_idx, (aluno, dest)) in alunos_csv.iter().zip(candidaturas.iter()).enumerate() {
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
            let aluno = &alunos_csv[*aluno_idx];
            if let Some(alunos_obj) = dados.get_mut("alunos").and_then(Value::as_object_mut) {
                if let Some(info) = alunos_obj.get_mut(matricula).and_then(Value::as_object_mut) {
                    let prova = info
                        .entry("prova_paulista")
                        .or_insert_with(|| Value::Object(Default::default()));
                    if let Value::Object(ref mut mapa) = prova {
                        let mut entrada = serde_json::json!({
                            "participou": aluno.participou,
                            "em": agora,
                        });
                        if let Some(g) = aluno.geral {
                            entrada["geral"] = serde_json::json!(g);
                        }
                        if !aluno.disciplinas.is_empty() {
                            let discs: serde_json::Map<String, Value> = aluno
                                .disciplinas
                                .iter()
                                .map(|(k, v)| (k.clone(), serde_json::json!(v)))
                                .collect();
                            entrada["disciplinas"] = Value::Object(discs);
                        }
                        mapa.insert(bimestre.clone(), entrada);
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
    Ok(ResultadoPaulista {
        bimestre,
        atualizados,
        turmas_atualizadas,
        nao_encontrados,
        ambiguos,
    })
}

#[derive(Serialize)]
pub(crate) struct RelatorioProvaPaulistaResultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) turmas: usize,
    pub(crate) alunos: usize,
}

#[tauri::command(async)]
pub(crate) fn gerar_relatorio_prova_paulista(
    bimestre: String,
    turmas_filtro: Vec<String>,
) -> Result<RelatorioProvaPaulistaResultado, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta: {err}"))?
        .join("relatorios");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let ts = Local::now().format("%Y%m%d_%H%M%S");
    let caminho = pasta.join(format!("prova_paulista_bim{}_{}.csv", bimestre, ts));

    // (turma, numero, nome, participou, geral, disciplinas)
    type LinhaProvaPaulista = (String, i64, String, bool, Option<u32>, BTreeMap<String, Option<u32>>);
    let mut linhas: Vec<LinhaProvaPaulista> = Vec::new();
    let mut todas_discs: BTreeSet<String> = BTreeSet::new();
    let mut turmas_com_dados = 0usize;
    let filtro_ativo = !turmas_filtro.is_empty();

    for (_, turma) in &turmas {
        if filtro_ativo && !turmas_filtro.contains(&turma.codigo) {
            continue;
        }
        let Some(alunos) = &turma.alunos else {
            continue;
        };
        let mut tem_aluno = false;
        for (_, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            let nome = info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let numero = info
                .get("numero_chamada")
                .and_then(Value::as_i64)
                .unwrap_or(0);
            let (participou, geral, discs) = match info
                .get("prova_paulista")
                .and_then(|p| p.get(bimestre.as_str()))
            {
                Some(entrada) => {
                    let p = entrada
                        .get("participou")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let g = entrada
                        .get("geral")
                        .and_then(Value::as_u64)
                        .map(|v| v as u32);
                    let mut d: BTreeMap<String, Option<u32>> = BTreeMap::new();
                    if let Some(obj) = entrada.get("disciplinas").and_then(Value::as_object) {
                        for (disc, val) in obj {
                            let nota = val.as_u64().map(|v| v as u32);
                            todas_discs.insert(disc.clone());
                            d.insert(disc.clone(), nota);
                        }
                    }
                    (p, g, d)
                }
                None => (false, None, BTreeMap::new()),
            };
            linhas.push((
                turma.codigo.clone(),
                numero,
                nome,
                participou,
                geral,
                discs,
            ));
            tem_aluno = true;
        }
        if tem_aluno {
            turmas_com_dados += 1;
        }
    }

    let ordem = [
        "MAT", "PORT", "ING", "HIST", "GEO", "CIE", "FILO", "SOC", "BIO", "FIS", "QUI", "FIN",
        "TEC",
    ];
    let discs_ord: Vec<String> = ordem
        .iter()
        .filter(|d| todas_discs.contains(**d))
        .map(|d| d.to_string())
        .chain(
            todas_discs
                .iter()
                .filter(|d| !ordem.contains(&d.as_str()))
                .cloned(),
        )
        .collect();

    linhas.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    let total_alunos = linhas.len();

    let cabecalho_discs = if discs_ord.is_empty() {
        String::new()
    } else {
        format!(";{}", discs_ord.join(";"))
    };
    let mut conteudo = format!(
        "\u{FEFF}Turma;N\u{00BA};Nome;Participou;Geral{cabecalho_discs}\n"
    );

    for (turma, numero, nome, participou, geral, discs) in &linhas {
        let num_str = if *numero > 0 {
            numero.to_string()
        } else {
            String::new()
        };
        let part_str = if *participou { "Sim" } else { "N\u{00E3}o" };
        let geral_str = geral.map(|g| g.to_string()).unwrap_or_default();
        let disc_vals: Vec<String> = discs_ord
            .iter()
            .map(|d| {
                discs
                    .get(d)
                    .and_then(|v| *v)
                    .map(|n| n.to_string())
                    .unwrap_or_default()
            })
            .collect();
        let discs_str = if discs_ord.is_empty() {
            String::new()
        } else {
            format!(";{}", disc_vals.join(";"))
        };
        conteudo.push_str(&format!(
            "{turma};{num_str};{nome};{part_str};{geral_str}{discs_str}\n"
        ));
    }

    fs::write(&caminho, conteudo.as_bytes()).map_err(|err| err.to_string())?;
    Ok(RelatorioProvaPaulistaResultado {
        caminho: caminho.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        turmas: turmas_com_dados,
        alunos: total_alunos,
    })
}
