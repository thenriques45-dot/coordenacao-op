
// Importador e relatório da Prova Paulista.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet}, fs,
    io::Cursor,
};


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

