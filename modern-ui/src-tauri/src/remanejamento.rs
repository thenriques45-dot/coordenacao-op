// Aluno remanejado de turma dentro da escola (ex.: 9º A -> 9º E depois do
// 2º bimestre). A importação de alunos deixa uma cópia `ativo: false` na
// turma de origem, com as notas/faltas dos bimestres em que ele estava lá, e
// cria o registro ativo na turma nova, que só recebe notas dos mapões dali em
// diante. Resultado: o boletim, a ficha e as estatísticas da turma nova
// mostravam o aluno sem o 1º/2º bimestre, e a coordenação precisava voltar à
// turma antiga para consultar.
//
// Aqui os bimestres que faltam no registro ativo são copiados da cópia
// inativa do mesmo RA, desde que seja do MESMO ano letivo e da MESMA série
// (ex.: 9º Ano A e 9º Ano E). Essa trava existe porque já houve RA casando
// com aluno de outra série (mapão de expansão da 3ª série caindo num aluno
// da 2ª B): progressão parcial ou turma de outra série nunca entra aqui.
//
// Regras:
// - Só preenche bimestre que o registro ativo ainda não tem (nem nota nem
//   falta). O que veio do mapão da turma nova sempre vence.
// - A cópia na turma de origem não muda: ela continua inativa e fora das
//   estatísticas da turma antiga, como já era.
// - O registro ativo ganha `bimestres_outra_turma` ({"1": "9º Ano A", ...})
//   para a ficha avisar de onde vieram aquelas notas, e para um bimestre já
//   trazido não ser reenviado de volta se o aluno voltar para a turma antiga.
// - Idempotente: rodar de novo não muda nada.

use crate::*;

use serde_json::{Map, Value};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

pub(crate) const CAMPO_BIMESTRES_OUTRA_TURMA: &str = "bimestres_outra_turma";

const BIMESTRES: [&str; 4] = ["1", "2", "3", "4"];

// Campos do aluno organizados por bimestre que vão junto com ele.
const CAMPOS_POR_BIMESTRE: [&str; 7] = [
    "medias",
    "frequencia",
    "compensacao_ausencias",
    "ajustes_medias_conselho",
    "encaminhamentos_conselho",
    "deliberados_conselho",
    "tarefas",
];

fn ativo(info: &Value) -> bool {
    info.get("ativo").and_then(Value::as_bool).unwrap_or(true)
}

fn identidade_ra(matricula: &str) -> String {
    normalizar_matricula_elegiveis(matricula.to_string())
        .trim_start_matches('0')
        .to_string()
}

/// Ano letivo + série normalizada. Sem o campo `serie`, usa o código sem a
/// última palavra ("9º Ano A" -> "9º Ano").
fn chave_serie(turma: &Value) -> Option<(i64, String)> {
    let ano = turma.get("ano").and_then(Value::as_i64)?;
    let serie = turma
        .get("serie")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            let codigo = turma.get("codigo").and_then(Value::as_str)?.trim();
            let (inicio, _) = codigo.rsplit_once(char::is_whitespace)?;
            Some(inicio.trim().to_string())
        })?;
    let serie = normalizar_texto_basico(&serie);
    if serie.is_empty() {
        return None;
    }
    Some((ano, serie))
}

fn mapa_nao_vazio(valor: Option<&Value>) -> bool {
    match valor {
        Some(Value::Object(m)) => !m.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Null) | None => false,
        Some(_) => true,
    }
}

/// O aluno já tem lançamento próprio (nota ou falta) neste bimestre?
fn tem_bimestre(info: &Value, bimestre: &str) -> bool {
    ["medias", "frequencia"]
        .iter()
        .any(|campo| mapa_nao_vazio(info.get(*campo).and_then(|m| m.get(bimestre))))
}

fn bimestre_veio_de_outra_turma(info: &Value, bimestre: &str) -> bool {
    info.get(CAMPO_BIMESTRES_OUTRA_TURMA)
        .and_then(|m| m.get(bimestre))
        .is_some()
}

fn quantidade_notas(info: &Value, bimestre: &str) -> usize {
    info.get("medias")
        .and_then(|m| m.get(bimestre))
        .and_then(Value::as_object)
        .map(|m| m.len())
        .unwrap_or(0)
}

fn ultima_data(info: &Value, bimestre: &str) -> String {
    info.get("medias")
        .and_then(|m| m.get(bimestre))
        .and_then(Value::as_object)
        .map(|m| {
            m.values()
                .filter_map(|v| v.get("em").and_then(Value::as_str))
                .max()
                .unwrap_or("")
                .to_string()
        })
        .unwrap_or_default()
}

/// Copia para `destino` os bimestres que ele não tem, vindos das cópias
/// inativas em `origens` (rótulo da turma, registro do aluno). Devolve se
/// algo mudou.
pub(crate) fn completar_bimestres_do_aluno(destino: &mut Value, origens: &[(String, &Value)]) -> bool {
    let mut mudou = false;
    for bimestre in BIMESTRES {
        if tem_bimestre(destino, bimestre) {
            continue;
        }
        // Entre as turmas de onde ele saiu, a que tem esse bimestre lançado
        // de verdade (não trazido de uma terceira turma). Se mais de uma tem
        // (troca no meio do bimestre), vale a com mais notas e, empatando,
        // a lançada por último.
        let melhor = origens
            .iter()
            .filter(|(_, info)| tem_bimestre(info, bimestre) && !bimestre_veio_de_outra_turma(info, bimestre))
            .max_by(|(_, a), (_, b)| {
                (quantidade_notas(a, bimestre), ultima_data(a, bimestre))
                    .cmp(&(quantidade_notas(b, bimestre), ultima_data(b, bimestre)))
            });
        let Some((rotulo, origem)) = melhor else {
            continue;
        };
        let Some(objeto) = destino.as_object_mut() else {
            return mudou;
        };
        for campo in CAMPOS_POR_BIMESTRE {
            let Some(valor) = origem.get(campo).and_then(|m| m.get(bimestre)) else {
                continue;
            };
            if !mapa_nao_vazio(Some(valor)) {
                continue;
            }
            let mapa = objeto
                .entry(campo.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if !mapa.is_object() {
                *mapa = Value::Object(Map::new());
            }
            if let Some(mapa) = mapa.as_object_mut() {
                if !mapa_nao_vazio(mapa.get(bimestre)) {
                    mapa.insert(bimestre.to_string(), valor.clone());
                }
            }
        }
        let marcas = objeto
            .entry(CAMPO_BIMESTRES_OUTRA_TURMA.to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !marcas.is_object() {
            *marcas = Value::Object(Map::new());
        }
        if let Some(marcas) = marcas.as_object_mut() {
            marcas.insert(bimestre.to_string(), Value::String(rotulo.clone()));
        }
        mudou = true;
    }
    mudou
}

/// Aplica `completar_bimestres_do_aluno` a todas as turmas carregadas.
/// Devolve os índices das turmas que mudaram.
pub(crate) fn completar_bimestres_remanejados(turmas: &mut [Value]) -> Vec<usize> {
    // (ano, série, RA) -> [(índice da turma, matrícula como está no arquivo)]
    let mut inativos: BTreeMap<(i64, String, String), Vec<(usize, String)>> = BTreeMap::new();
    for (idx, turma) in turmas.iter().enumerate() {
        let Some((ano, serie)) = chave_serie(turma) else { continue };
        let Some(alunos) = turma.get("alunos").and_then(Value::as_object) else { continue };
        for (matricula, info) in alunos {
            if ativo(info) {
                continue;
            }
            let ra = identidade_ra(matricula);
            if ra.is_empty() {
                continue;
            }
            inativos
                .entry((ano, serie.clone(), ra))
                .or_default()
                .push((idx, matricula.clone()));
        }
    }
    if inativos.is_empty() {
        return Vec::new();
    }

    // Planeja primeiro (só leitura), aplica depois.
    let mut trabalhos: Vec<(usize, String, Vec<(String, Value)>)> = Vec::new();
    for (idx, turma) in turmas.iter().enumerate() {
        let Some((ano, serie)) = chave_serie(turma) else { continue };
        let Some(alunos) = turma.get("alunos").and_then(Value::as_object) else { continue };
        for (matricula, info) in alunos {
            if !ativo(info) {
                continue;
            }
            let ra = identidade_ra(matricula);
            if ra.is_empty() {
                continue;
            }
            let Some(candidatos) = inativos.get(&(ano, serie.clone(), ra)) else { continue };
            let origens: Vec<(String, Value)> = candidatos
                .iter()
                .filter(|(origem_idx, _)| *origem_idx != idx)
                .filter_map(|(origem_idx, origem_matricula)| {
                    let origem_turma = turmas.get(*origem_idx)?;
                    let registro = origem_turma.get("alunos")?.get(origem_matricula)?.clone();
                    let rotulo = origem_turma
                        .get("codigo")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    Some((rotulo, registro))
                })
                .collect();
            if origens.is_empty() {
                continue;
            }
            let falta_algum = BIMESTRES.iter().any(|b| {
                !tem_bimestre(info, b) && origens.iter().any(|(_, o)| tem_bimestre(o, b))
            });
            if falta_algum {
                trabalhos.push((idx, matricula.clone(), origens));
            }
        }
    }

    let mut alteradas = Vec::new();
    for (idx, matricula, origens) in trabalhos {
        let Some(info) = turmas
            .get_mut(idx)
            .and_then(|t| t.get_mut("alunos"))
            .and_then(|a| a.get_mut(&matricula))
        else {
            continue;
        };
        let refs: Vec<(String, &Value)> = origens.iter().map(|(r, v)| (r.clone(), v)).collect();
        if completar_bimestres_do_aluno(info, &refs) && !alteradas.contains(&idx) {
            alteradas.push(idx);
        }
    }
    alteradas
}

fn coletar_arquivos_turma(pasta: &Path, saida: &mut Vec<PathBuf>) -> io::Result<()> {
    for entrada in fs::read_dir(pasta)? {
        let caminho = entrada?.path();
        if caminho.is_dir() {
            coletar_arquivos_turma(&caminho, saida)?;
            continue;
        }
        let Some(nome) = caminho.file_name().and_then(|n| n.to_str()) else { continue };
        if !nome.starts_with("turma_") || !nome.ends_with(".json") {
            continue;
        }
        if eh_copia_de_conflito_sync(&caminho) {
            continue;
        }
        saida.push(caminho);
    }
    Ok(())
}

/// Versão em disco: lê todos os arquivos de turma de `pasta` (recursivo),
/// completa os remanejados e regrava só as turmas que mudaram. Quem chama
/// já deve estar com a trava de dados (travar_dados).
pub(crate) fn completar_bimestres_remanejados_na_pasta(pasta: &Path) -> io::Result<usize> {
    if !pasta.is_dir() {
        return Ok(0);
    }
    let mut caminhos = Vec::new();
    coletar_arquivos_turma(pasta, &mut caminhos)?;
    let mut lidos: Vec<(PathBuf, Value)> = caminhos
        .into_iter()
        .filter_map(|caminho| {
            let texto = fs::read_to_string(&caminho).ok()?;
            let valor = serde_json::from_str::<Value>(sem_lixo_no_fim(&texto)).ok()?;
            Some((caminho, valor))
        })
        .collect();
    let mut valores: Vec<Value> = lidos.iter_mut().map(|(_, v)| std::mem::take(v)).collect();
    let alteradas = completar_bimestres_remanejados(&mut valores);
    for idx in &alteradas {
        let (caminho, _) = &lidos[*idx];
        let texto = serde_json::to_string_pretty(&valores[*idx])
            .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
        escrever_json_atomicamente(caminho, &texto)?;
    }
    Ok(alteradas.len())
}

/// Atalho para a pasta de dados do app (dados/persistidos).
pub(crate) fn completar_bimestres_remanejados_dados() -> io::Result<usize> {
    completar_bimestres_remanejados_na_pasta(&data_dir()?.join("persistidos"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn turma(codigo: &str, serie: &str, ano: i64, alunos: Value) -> Value {
        json!({ "codigo": codigo, "serie": serie, "ano": ano, "alunos": alunos })
    }

    fn nota(v: f64) -> Value {
        json!({ "em": "2026-05-01T10:00:00-03:00", "por": "Thiago", "v": v })
    }

    #[test]
    fn traz_bimestres_anteriores_da_turma_de_origem() {
        let mut turmas = vec![
            turma("9º Ano A", "9º Ano", 2026, json!({
                "0001150196968": {
                    "nome": "JUNIOR BRAGA", "ativo": false,
                    "medias": { "1": { "MATEMATICA": nota(5.0) }, "2": { "MATEMATICA": nota(6.0) } },
                    "frequencia": { "1": { "MATEMATICA": 2 }, "2": { "MATEMATICA": 0 } },
                    "compensacao_ausencias": { "1": { "MATEMATICA": 0 }, "2": { "MATEMATICA": 0 } },
                    "encaminhamentos_conselho": { "2": [1, 3] }
                }
            })),
            turma("9º Ano E", "9º Ano", 2026, json!({
                "1150196968": {
                    "nome": "JUNIOR BRAGA", "ativo": true,
                    "medias": { "3": { "MATEMATICA": nota(7.0) } },
                    "frequencia": { "3": { "MATEMATICA": 1 } }
                }
            })),
        ];
        let alteradas = completar_bimestres_remanejados(&mut turmas);
        assert_eq!(alteradas, vec![1]);
        let junior = &turmas[1]["alunos"]["1150196968"];
        assert_eq!(junior["medias"]["1"]["MATEMATICA"]["v"], json!(5.0));
        assert_eq!(junior["medias"]["2"]["MATEMATICA"]["v"], json!(6.0));
        assert_eq!(junior["medias"]["3"]["MATEMATICA"]["v"], json!(7.0));
        assert_eq!(junior["frequencia"]["1"]["MATEMATICA"], json!(2));
        assert_eq!(junior["encaminhamentos_conselho"]["2"], json!([1, 3]));
        assert_eq!(junior[CAMPO_BIMESTRES_OUTRA_TURMA], json!({ "1": "9º Ano A", "2": "9º Ano A" }));
        // A cópia antiga continua igual e inativa.
        assert_eq!(turmas[0]["alunos"]["0001150196968"]["ativo"], json!(false));
        assert!(turmas[0]["alunos"]["0001150196968"].get(CAMPO_BIMESTRES_OUTRA_TURMA).is_none());

        // Rodar de novo não muda nada.
        assert!(completar_bimestres_remanejados(&mut turmas).is_empty());
    }

    #[test]
    fn nao_sobrescreve_bimestre_que_a_turma_nova_ja_tem() {
        let mut turmas = vec![
            turma("9º Ano A", "9º Ano", 2026, json!({
                "123": { "ativo": false, "medias": { "2": { "ARTE": nota(3.0) } } }
            })),
            turma("9º Ano E", "9º Ano", 2026, json!({
                "123": { "ativo": true, "medias": { "2": { "ARTE": nota(8.0) } } }
            })),
        ];
        assert!(completar_bimestres_remanejados(&mut turmas).is_empty());
        assert_eq!(turmas[1]["alunos"]["123"]["medias"]["2"]["ARTE"]["v"], json!(8.0));
    }

    #[test]
    fn nao_mistura_series_nem_anos_diferentes() {
        let mut turmas = vec![
            turma("3ª Série A", "3ª Série", 2026, json!({
                "123": { "ativo": false, "medias": { "1": { "ARTE": nota(3.0) } } }
            })),
            turma("9º Ano A", "9º Ano", 2025, json!({
                "123": { "ativo": false, "medias": { "1": { "ARTE": nota(4.0) } } }
            })),
            turma("2ª Série B", "2ª Série", 2026, json!({
                "123": { "ativo": true, "medias": { "3": { "ARTE": nota(8.0) } } }
            })),
        ];
        assert!(completar_bimestres_remanejados(&mut turmas).is_empty());
        assert!(turmas[2]["alunos"]["123"]["medias"].get("1").is_none());
    }

    #[test]
    fn serie_vem_do_codigo_quando_falta_o_campo() {
        let mut turmas = vec![
            json!({ "codigo": "9º Ano A", "ano": 2026, "alunos": {
                "123": { "ativo": false, "medias": { "1": { "ARTE": nota(3.0) } } }
            }}),
            json!({ "codigo": "9º Ano E", "ano": 2026, "alunos": {
                "123": { "ativo": true, "medias": {} }
            }}),
        ];
        assert_eq!(completar_bimestres_remanejados(&mut turmas), vec![1]);
    }

    #[test]
    fn bimestre_trazido_nao_volta_para_a_turma_antiga() {
        // Aluno foi do 9º A para o 9º E e voltou para o 9º A. O 9º E
        // (agora inativo) tem 1º/2º trazidos do 9º A e o 3º próprio.
        let mut turmas = vec![
            turma("9º Ano A", "9º Ano", 2026, json!({
                "123": { "ativo": true,
                    "medias": { "1": { "ARTE": nota(3.0) }, "2": { "ARTE": nota(4.0) } } }
            })),
            turma("9º Ano E", "9º Ano", 2026, json!({
                "123": { "ativo": false,
                    "medias": { "1": { "ARTE": nota(3.0) }, "2": { "ARTE": nota(4.0) }, "3": { "ARTE": nota(9.0) } },
                    "bimestres_outra_turma": { "1": "9º Ano A", "2": "9º Ano A" } }
            })),
        ];
        assert_eq!(completar_bimestres_remanejados(&mut turmas), vec![0]);
        let aluno = &turmas[0]["alunos"]["123"];
        assert_eq!(aluno["medias"]["3"]["ARTE"]["v"], json!(9.0));
        assert_eq!(aluno[CAMPO_BIMESTRES_OUTRA_TURMA], json!({ "3": "9º Ano E" }));
    }
}
