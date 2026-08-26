// Importador de progresso nas Disciplinas de Expansão (online), cursadas
// pelos alunos do período noturno numa plataforma externa. A coordenação
// exporta um CSV periodicamente; cada exportação vira um snapshot datado
// guardado em `expansao_online.snapshots` no próprio aluno (ver `campos.rs`
// para os campos de relatório derivados desse histórico).
//
// Extraído seguindo a convenção de main.rs; os itens são pub(crate) e os
// módulos se enxergam através dos re-exports globais feitos no main.rs
// (use crate::*).
//
// NÃO CONFUNDIR com `TurmaArquivo.disciplinas_expansao` (tipos.rs): aquilo é
// uma lista de *nomes de disciplina* vindos de um mapão de expansão/
// itinerário, usada para excluir do Plano de Ensino/PEI. Este módulo trata
// de progresso/nota por aluno na plataforma online — outro nível, outro
// propósito.

use crate::*;

use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, fs};

// ---- Normalizadores ----

/// O e-mail institucional codifica o RA do aluno: local-part = RA + "sp".
/// Ex.: 00001136866978sp@al.educacao.sp.gov.br → matrícula 0001136866978
///      0000111492765xsp@al.educacao.sp.gov.br → matrícula 000111492765X
/// (o dígito verificador "x" vem em minúsculo no e-mail; normalizar_matricula_elegiveis
/// já faz o uppercase). Verificado contra uma exportação real: 33/33 linhas casaram.
pub(crate) fn ra_do_email(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("");
    let sem_sufixo = local.strip_suffix("sp").or_else(|| local.strip_suffix("SP")).unwrap_or(local);
    normalizar_matricula_elegiveis(sem_sufixo.to_string())
}

/// "5,28" → 5.28 ; "10,00" → 10.0 ; "" → None. Aceita ponto também, por segurança.
pub(crate) fn numero_br(valor: &str) -> Option<f64> {
    let limpo = valor.trim().replace(',', ".");
    if limpo.is_empty() {
        return None;
    }
    limpo.parse::<f64>().ok()
}

/// "80%" → 80.0 ; "7,5%" → 7.5 ; "" → None.
pub(crate) fn percentual_br(valor: &str) -> Option<f64> {
    numero_br(valor.trim().trim_end_matches('%'))
}

/// "21/08/2026" → "2026-08-21" ; entrada inválida → None.
pub(crate) fn data_br_para_iso(valor: &str) -> Option<String> {
    NaiveDate::parse_from_str(valor.trim(), "%d/%m/%Y")
        .ok()
        .map(|data| data.format("%Y-%m-%d").to_string())
}

/// "...relatorio_turma_X_20260825.csv" → "2026-08-25" ; sem sufixo de 8 dígitos → None.
pub(crate) fn data_do_nome_arquivo(nome_arquivo: &str) -> Option<String> {
    let base = nome_arquivo.strip_suffix(".csv").or_else(|| nome_arquivo.strip_suffix(".CSV")).unwrap_or(nome_arquivo);
    let digitos: String = base.chars().rev().take_while(|c| c.is_ascii_digit()).collect();
    if digitos.chars().count() != 8 {
        return None;
    }
    let aaaammdd: String = digitos.chars().rev().collect();
    NaiveDate::parse_from_str(&aaaammdd, "%Y%m%d")
        .ok()
        .map(|data| data.format("%Y-%m-%d").to_string())
}

/// A `data_importacao` chega do frontend em ISO ("AAAA-MM-DD", vinda de um
/// `<input type="date">`) — diferente de `data_br_para_iso`, que converte o
/// formato "DD/MM/AAAA" das colunas do CSV. Usada só para validar a entrada
/// antes de gravar (uma chave de snapshot malformada corrompe o histórico).
pub(crate) fn data_iso_valida(valor: &str) -> bool {
    NaiveDate::parse_from_str(valor.trim(), "%Y-%m-%d").is_ok()
}

/// Data efetiva do snapshot: usa `data_importacao` se for um ISO válido
/// (é o normal — o frontend pré-preenche a partir do nome do arquivo e
/// deixa editável); se vier vazia/corrompida, cai para o sufixo do próprio
/// nome do arquivo como última defesa antes de recusar o arquivo inteiro.
pub(crate) fn data_efetiva(arquivo: &ArquivoExpansaoInput) -> Option<String> {
    if data_iso_valida(&arquivo.data_importacao) {
        return Some(arquivo.data_importacao.trim().to_string());
    }
    data_do_nome_arquivo(&arquivo.nome_arquivo)
}

/// Só aceita "1".."4" — ao contrário de normalizar_bimestre (turmas.rs), que
/// coage entrada desconhecida para "1". Aqui um bimestre em branco/inválido
/// no CSV precisa virar `None` (snapshot sem bimestre), nunca 1º silenciosamente.
pub(crate) fn bimestre_valido(valor: &str) -> Option<String> {
    let v = valor.trim();
    matches!(v, "1" | "2" | "3" | "4").then(|| v.to_string())
}

// ---- DTOs de entrada ----

#[derive(Deserialize)]
pub(crate) struct LinhaExpansaoInput {
    pub(crate) nome: String,
    pub(crate) email: String,
    pub(crate) turma_origem: String,
    pub(crate) escola: String,
    pub(crate) bimestre: String,
    pub(crate) nota: String,
    pub(crate) progresso: String,
    pub(crate) ultimo_acesso: String,
}

#[derive(Deserialize)]
pub(crate) struct ArquivoExpansaoInput {
    pub(crate) nome_arquivo: String,
    /// "YYYY-MM-DD" — pré-preenchido no frontend a partir do nome do
    /// arquivo (data_do_nome_arquivo), editável pelo usuário.
    pub(crate) data_importacao: String,
    /// Quando Some, sobrepõe o Bimestre lido de cada linha do CSV.
    #[serde(default)]
    pub(crate) bimestre_override: Option<String>,
    pub(crate) linhas: Vec<LinhaExpansaoInput>,
}

// ---- DTOs de saída ----

#[derive(Serialize)]
pub(crate) struct PreviaExpansaoAluno {
    pub(crate) nome_csv: String,
    pub(crate) ra: String,
    pub(crate) turma: Option<String>,
    pub(crate) bimestre: Option<String>,
    pub(crate) nota: Option<f64>,
    pub(crate) progresso: Option<f64>,
    pub(crate) ultimo_acesso: Option<String>,
    /// "ra" | "nome" | "-" (nao encontrado)
    pub(crate) modo: String,
    pub(crate) encontrado: bool,
    pub(crate) ambiguo: bool,
    pub(crate) resolvido: bool,
    /// Já existe snapshot nesta data para este aluno — aplicar vai sobrescrever.
    pub(crate) ja_existe: bool,
}

#[derive(Serialize)]
pub(crate) struct PreviaExpansaoArquivo {
    pub(crate) nome_arquivo: String,
    pub(crate) data_importacao: String,
    pub(crate) turma_origem: String,
    pub(crate) bimestres_detectados: Vec<String>,
    pub(crate) total_csv: usize,
    pub(crate) encontrados: usize,
    pub(crate) por_ra: usize,
    pub(crate) por_nome: usize,
    pub(crate) nao_encontrados: usize,
    pub(crate) ambiguos: usize,
    pub(crate) resolvidos: usize,
    pub(crate) sobrescritos: usize,
    /// Arquivo malformado (ex.: data_importacao inválida) não derruba o lote.
    pub(crate) erro: Option<String>,
    pub(crate) matches: Vec<PreviaExpansaoAluno>,
}

#[derive(Serialize)]
pub(crate) struct PreviaExpansoes {
    pub(crate) arquivos: Vec<PreviaExpansaoArquivo>,
    pub(crate) total_encontrados: usize,
    pub(crate) total_nao_encontrados: usize,
    pub(crate) total_ambiguos: usize,
}

#[derive(Serialize)]
pub(crate) struct ResultadoExpansoes {
    pub(crate) arquivos_aplicados: usize,
    pub(crate) atualizados: usize,
    pub(crate) turmas_atualizadas: usize,
    pub(crate) snapshots_sobrescritos: usize,
    pub(crate) nao_encontrados: Vec<String>,
    pub(crate) ambiguos: Vec<String>,
}

// ---- Correspondência: RA primeiro, nome como fallback ----

/// Candidatos de uma linha: (turma_idx, matricula, modo). Só cai para nome
/// quando o RA não dá nenhum candidato — se o RA já é ambíguo (aluno ativo
/// em duas turmas por inconsistência de cadastro), o nome daria os mesmos
/// candidatos, então não adianta trocar de eixo.
fn candidatar_linha(
    linha: &LinhaExpansaoInput,
    indice_ra: &BTreeMap<String, Candidatos>,
    indice_nome: &BTreeMap<String, Candidatos>,
) -> CandidaturaLinha {
    let ra = ra_do_email(&linha.email);
    let mut vistos = std::collections::BTreeSet::new();
    let mut candidatos_ra = Vec::new();
    for variante in variantes_matricula(&ra) {
        for candidato in indice_ra.get(&variante).into_iter().flatten() {
            if vistos.insert(candidato.clone()) {
                candidatos_ra.push(candidato.clone());
            }
        }
    }
    if !candidatos_ra.is_empty() {
        return (candidatos_ra, "ra");
    }
    let candidatos_nome = indice_nome.get(&normalizar_nome_busca(&linha.nome)).cloned().unwrap_or_default();
    (candidatos_nome, "nome")
}

/// Candidatos de correspondência para uma linha: (turma_idx, matricula).
type Candidatos = Vec<(usize, String)>;
/// Uma linha resolvida: seus candidatos e o eixo que os encontrou ("ra" | "nome").
type CandidaturaLinha = (Candidatos, &'static str);

struct LoteResolvido {
    /// Por arquivo, por linha: candidatos e modo.
    candidaturas: Vec<Vec<CandidaturaLinha>>,
}

fn resolver_lote(
    arquivos: &[ArquivoExpansaoInput],
    turmas: &[(std::path::PathBuf, TurmaArquivo)],
) -> LoteResolvido {
    let indice_ra = indice_alunos_por_ra(turmas);
    let indice_nome = indice_alunos_por_nome(turmas);
    let candidaturas = arquivos
        .iter()
        .map(|arquivo| {
            arquivo.linhas.iter().map(|linha| candidatar_linha(linha, &indice_ra, &indice_nome)).collect::<Vec<_>>()
        })
        .collect();
    LoteResolvido { candidaturas }
}

/// Contexto por arquivo: conta, entre as candidaturas exatas (tamanho 1)
/// daquele arquivo, quantas caíram em cada turma — usado para desempatar
/// as ambíguas com resolver_ambiguo_por_contexto.
fn contagem_por_arquivo(candidaturas_arquivo: &[CandidaturaLinha]) -> BTreeMap<usize, usize> {
    let mut contagem = BTreeMap::new();
    for (candidatos, _) in candidaturas_arquivo {
        if candidatos.len() == 1 {
            *contagem.entry(candidatos[0].0).or_insert(0) += 1;
        }
    }
    contagem
}

fn bimestre_da_linha(linha: &LinhaExpansaoInput, arquivo: &ArquivoExpansaoInput) -> Option<String> {
    if let Some(bimestre) = &arquivo.bimestre_override {
        return bimestre_valido(bimestre);
    }
    bimestre_valido(&linha.bimestre)
}

fn snapshot_json(linha: &LinhaExpansaoInput, arquivo: &ArquivoExpansaoInput, agora: &str) -> Value {
    serde_json::json!({
        "bimestre": bimestre_da_linha(linha, arquivo),
        "nota": numero_br(&linha.nota),
        "progresso": percentual_br(&linha.progresso),
        "ultimo_acesso": data_br_para_iso(&linha.ultimo_acesso),
        "turma_origem": linha.turma_origem,
        "escola": linha.escola,
        "arquivo": arquivo.nome_arquivo,
        "em": agora,
    })
}

fn ja_existe_snapshot(turma: &TurmaArquivo, matricula: &str, data: &str) -> bool {
    turma
        .alunos
        .as_ref()
        .and_then(|alunos| alunos.get(matricula))
        .and_then(|aluno| aluno.get("expansao_online"))
        .and_then(|env| env.get("snapshots"))
        .and_then(|snaps| snaps.get(data))
        .is_some()
}

/// Grava um snapshot no objeto JSON de UM aluno (info = o Value do aluno,
/// já localizado dentro de `alunos.<matricula>`). Pura — sem disco — para
/// poder ser testada direto, igual às funções de merge de sync.rs. Devolve
/// `true` quando já existia snapshot nessa data (foi sobrescrito).
fn aplicar_snapshot_no_aluno(
    info: &mut serde_json::Map<String, Value>,
    email: &str,
    data: &str,
    snapshot: Value,
) -> bool {
    let envelope = info.entry("expansao_online").or_insert_with(|| serde_json::json!({}));
    let Value::Object(env) = envelope else { return false };
    env.entry("email").or_insert_with(|| Value::String(email.to_string()));
    let snaps = env.entry("snapshots").or_insert_with(|| serde_json::json!({}));
    let Value::Object(mapa) = snaps else { return false };
    mapa.insert(data.to_string(), snapshot).is_some()
}

// ---- Comandos ----

#[tauri::command(async)]
pub(crate) fn analisar_expansoes(arquivos: Vec<ArquivoExpansaoInput>) -> Result<PreviaExpansoes, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let resolvido = resolver_lote(&arquivos, &turmas);

    let mut arquivos_previa = Vec::new();
    let mut total_encontrados = 0usize;
    let mut total_nao_encontrados = 0usize;
    let mut total_ambiguos = 0usize;

    for (arquivo, candidaturas) in arquivos.iter().zip(resolvido.candidaturas.iter()) {
        let Some(data) = data_efetiva(arquivo) else {
            arquivos_previa.push(PreviaExpansaoArquivo {
                nome_arquivo: arquivo.nome_arquivo.clone(),
                data_importacao: arquivo.data_importacao.clone(),
                turma_origem: arquivo.linhas.first().map(|l| l.turma_origem.clone()).unwrap_or_default(),
                bimestres_detectados: Vec::new(),
                total_csv: arquivo.linhas.len(),
                encontrados: 0,
                por_ra: 0,
                por_nome: 0,
                nao_encontrados: 0,
                ambiguos: 0,
                resolvidos: 0,
                sobrescritos: 0,
                erro: Some(
                    "Data de importação inválida. Use o formato AAAA-MM-DD ou renomeie o arquivo com a data no final (ex.: _20260825.csv)."
                        .to_string(),
                ),
                matches: Vec::new(),
            });
            continue;
        };

        let contagem = contagem_por_arquivo(candidaturas);
        let mut matches = Vec::new();
        let mut encontrados = 0usize;
        let mut por_ra = 0usize;
        let mut por_nome = 0usize;
        let mut nao_encontrados = 0usize;
        let mut ambiguos = 0usize;
        let mut resolvidos = 0usize;
        let mut sobrescritos = 0usize;
        let mut bimestres_detectados = std::collections::BTreeSet::new();

        for (linha, (candidatos, modo)) in arquivo.linhas.iter().zip(candidaturas.iter()) {
            if let Some(b) = bimestre_da_linha(linha, arquivo) {
                bimestres_detectados.insert(b);
            }
            let ra = ra_do_email(&linha.email);
            let nota = numero_br(&linha.nota);
            let progresso = percentual_br(&linha.progresso);
            let ultimo_acesso = data_br_para_iso(&linha.ultimo_acesso);
            let bimestre = bimestre_da_linha(linha, arquivo);

            let (turma_str, ambiguo, resolvido_flag, encontrado, turma_idx_opt, matricula_opt) = match candidatos.len() {
                0 => {
                    nao_encontrados += 1;
                    (None, false, false, false, None, None)
                }
                1 => {
                    encontrados += 1;
                    if *modo == "ra" { por_ra += 1 } else { por_nome += 1 }
                    let codigo = turmas.get(candidatos[0].0).map(|(_, t)| t.codigo.clone()).unwrap_or_default();
                    (Some(codigo), false, false, true, Some(candidatos[0].0), Some(candidatos[0].1.clone()))
                }
                _ => {
                    if let Some((ti, mat)) = resolver_ambiguo_por_contexto(candidatos, &contagem) {
                        resolvidos += 1;
                        encontrados += 1;
                        if *modo == "ra" { por_ra += 1 } else { por_nome += 1 }
                        let codigo = turmas.get(ti).map(|(_, t)| t.codigo.clone()).unwrap_or_default();
                        (Some(codigo), false, true, true, Some(ti), Some(mat))
                    } else {
                        ambiguos += 1;
                        let lista = candidatos
                            .iter()
                            .filter_map(|(idx, _)| turmas.get(*idx).map(|(_, t)| t.codigo.clone()))
                            .collect::<Vec<_>>()
                            .join(", ");
                        (Some(lista), true, false, false, None, None)
                    }
                }
            };

            let ja_existe = match (turma_idx_opt, &matricula_opt) {
                (Some(ti), Some(mat)) => turmas.get(ti).map(|(_, t)| ja_existe_snapshot(t, mat, &data)).unwrap_or(false),
                _ => false,
            };
            if ja_existe {
                sobrescritos += 1;
            }

            matches.push(PreviaExpansaoAluno {
                nome_csv: linha.nome.clone(),
                ra,
                turma: turma_str,
                bimestre,
                nota,
                progresso,
                ultimo_acesso,
                modo: if encontrado { modo.to_string() } else { "-".to_string() },
                encontrado,
                ambiguo,
                resolvido: resolvido_flag,
                ja_existe,
            });
        }

        total_encontrados += encontrados;
        total_nao_encontrados += nao_encontrados;
        total_ambiguos += ambiguos;

        arquivos_previa.push(PreviaExpansaoArquivo {
            nome_arquivo: arquivo.nome_arquivo.clone(),
            data_importacao: data,
            turma_origem: arquivo.linhas.first().map(|l| l.turma_origem.clone()).unwrap_or_default(),
            bimestres_detectados: bimestres_detectados.into_iter().collect(),
            total_csv: arquivo.linhas.len(),
            encontrados,
            por_ra,
            por_nome,
            nao_encontrados,
            ambiguos,
            resolvidos,
            sobrescritos,
            erro: None,
            matches,
        });
    }

    Ok(PreviaExpansoes { arquivos: arquivos_previa, total_encontrados, total_nao_encontrados, total_ambiguos })
}

#[tauri::command(async)]
pub(crate) fn aplicar_expansoes(arquivos: Vec<ArquivoExpansaoInput>) -> Result<ResultadoExpansoes, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let resolvido = resolver_lote(&arquivos, &turmas);
    let agora = Local::now().to_rfc3339();

    // (turma_idx) -> Vec<(matricula, email, snapshot data, snapshot json)>
    let mut por_turma: BTreeMap<usize, Vec<(String, String, String, Value)>> = BTreeMap::new();
    let mut nao_encontrados = Vec::new();
    let mut ambiguos = Vec::new();
    let mut arquivos_com_erro = 0usize;

    for (arquivo, candidaturas) in arquivos.iter().zip(resolvido.candidaturas.iter()) {
        let Some(data) = data_efetiva(arquivo) else {
            arquivos_com_erro += 1;
            continue;
        };
        let contagem = contagem_por_arquivo(candidaturas);
        for (linha, (candidatos, _modo)) in arquivo.linhas.iter().zip(candidaturas.iter()) {
            let destino = match candidatos.len() {
                0 => {
                    nao_encontrados.push(linha.nome.clone());
                    None
                }
                1 => Some(candidatos[0].clone()),
                _ => {
                    if let Some(par) = resolver_ambiguo_por_contexto(candidatos, &contagem) {
                        Some(par)
                    } else {
                        ambiguos.push(linha.nome.clone());
                        None
                    }
                }
            };
            if let Some((turma_idx, matricula)) = destino {
                let snapshot = snapshot_json(linha, arquivo, &agora);
                por_turma.entry(turma_idx).or_default().push((matricula, linha.email.clone(), data.clone(), snapshot));
            }
        }
    }

    let mut atualizados = 0usize;
    let mut turmas_atualizadas = 0usize;
    let mut snapshots_sobrescritos = 0usize;
    for (turma_idx, entradas) in &por_turma {
        let caminho = turmas[*turma_idx].0.clone();
        let texto = fs::read_to_string(&caminho).map_err(|err| format!("Nao consegui ler a turma: {err}"))?;
        let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        for (matricula, email, data, snapshot) in entradas {
            if let Some(alunos_obj) = dados.get_mut("alunos").and_then(Value::as_object_mut) {
                if let Some(info) = alunos_obj.get_mut(matricula).and_then(Value::as_object_mut) {
                    if aplicar_snapshot_no_aluno(info, email, data, snapshot.clone()) {
                        snapshots_sobrescritos += 1;
                    }
                    atualizados += 1;
                }
            }
        }
        let novo_texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
        escrever_json_atomicamente(&caminho, &novo_texto).map_err(|err| err.to_string())?;
        turmas_atualizadas += 1;
    }

    Ok(ResultadoExpansoes {
        arquivos_aplicados: arquivos.len().saturating_sub(arquivos_com_erro),
        atualizados,
        turmas_atualizadas,
        snapshots_sobrescritos,
        nao_encontrados,
        ambiguos,
    })
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    fn turma_fixture(valor: Value) -> TurmaArquivo {
        serde_json::from_value(valor).unwrap()
    }

    fn linha_fixture(nome: &str, email: &str) -> LinhaExpansaoInput {
        LinhaExpansaoInput {
            nome: nome.to_string(),
            email: email.to_string(),
            turma_origem: "NAO SERIADO E TARDE ANUAL".to_string(),
            escola: "ESCOLA TESTE".to_string(),
            bimestre: "3".to_string(),
            nota: "5,28".to_string(),
            progresso: "80%".to_string(),
            ultimo_acesso: "21/08/2026".to_string(),
        }
    }

    #[test]
    fn ra_do_email_extrai_a_matricula_incluindo_o_digito_x() {
        // ra_do_email só tira o sufixo "sp" e normaliza maiúsculas — não
        // mexe na quantidade de zeros à esquerda (o e-mail tem um zero a
        // mais que a matrícula gravada). Quem reconcilia isso é
        // variantes_matricula, testado à parte via candidatar_linha.
        assert_eq!(ra_do_email("00001136866978sp@al.educacao.sp.gov.br"), "00001136866978");
        // O dígito verificador "x" vem em minúsculo no e-mail; a matrícula guarda maiúsculo.
        assert_eq!(ra_do_email("0000111492765xsp@al.educacao.sp.gov.br"), "0000111492765X");
    }

    #[test]
    fn numero_br_converte_virgula_decimal() {
        assert_eq!(numero_br("5,28"), Some(5.28));
        assert_eq!(numero_br("10,00"), Some(10.0));
        assert_eq!(numero_br(""), None);
        assert_eq!(numero_br("  "), None);
    }

    #[test]
    fn percentual_br_converte_com_e_sem_simbolo() {
        assert_eq!(percentual_br("80%"), Some(80.0));
        assert_eq!(percentual_br("7,5%"), Some(7.5));
        assert_eq!(percentual_br(""), None);
    }

    #[test]
    fn data_br_para_iso_converte_formato_brasileiro() {
        assert_eq!(data_br_para_iso("21/08/2026"), Some("2026-08-21".to_string()));
        assert_eq!(data_br_para_iso(""), None);
        assert_eq!(data_br_para_iso("2026-08-21"), None); // formato errado — não é dd/mm/aaaa
    }

    #[test]
    fn data_do_nome_arquivo_le_sufixo_de_oito_digitos() {
        assert_eq!(
            data_do_nome_arquivo("relatorio_turma_NAO SERIADO E TARDE ANUAL_20260825.csv"),
            Some("2026-08-25".to_string())
        );
        assert_eq!(data_do_nome_arquivo("sem_data.csv"), None);
    }

    #[test]
    fn bimestre_valido_recusa_vazio_e_formato_com_simbolo() {
        assert_eq!(bimestre_valido("3"), Some("3".to_string()));
        assert_eq!(bimestre_valido(""), None);
        assert_eq!(bimestre_valido("3º"), None);
    }

    #[test]
    fn data_iso_valida_aceita_so_formato_iso() {
        assert!(data_iso_valida("2026-08-25"));
        assert!(!data_iso_valida("25/08/2026"));
        assert!(!data_iso_valida(""));
    }

    /// Mesma matrícula em duas turmas — uma ativo:false (transferência),
    /// outra ativo:true. O índice de RA precisa ignorar a inativa: sem esse
    /// filtro a importação gravaria no registro morto e o dado nunca
    /// apareceria nos relatórios (era o caso de 47 dos 56 alunos
    /// transferidos encontrados na base real do usuário).
    #[test]
    fn ra_duplicado_com_uma_copia_inativa_casa_com_a_ativa() {
        let turmas = vec![
            (
                std::path::PathBuf::from("turma_origem.json"),
                turma_fixture(json!({
                    "codigo": "1A", "ano": 2026,
                    "alunos": { "0001136866978": { "nome": "AGATHA DA SILVA ALVES", "ativo": false } }
                })),
            ),
            (
                std::path::PathBuf::from("turma_destino.json"),
                turma_fixture(json!({
                    "codigo": "1B", "ano": 2026,
                    "alunos": { "0001136866978": { "nome": "AGATHA DA SILVA ALVES", "ativo": true } }
                })),
            ),
        ];
        let indice_ra = indice_alunos_por_ra(&turmas);
        let indice_nome = indice_alunos_por_nome(&turmas);
        let linha = linha_fixture("AGATHA DA SILVA ALVES", "00001136866978sp@al.educacao.sp.gov.br");
        let (candidatos, modo) = candidatar_linha(&linha, &indice_ra, &indice_nome);
        assert_eq!(modo, "ra");
        assert_eq!(candidatos, vec![(1usize, "0001136866978".to_string())]);
    }

    /// Reproduz a inconsistência de cadastro encontrada na base real do
    /// usuário: aluno transferido sem a matrícula antiga ter sido
    /// desativada (6 casos em 1.411 alunos ativos). O importador não deve
    /// adivinhar qual turma é a certa — precisa reportar ambíguo.
    #[test]
    fn ra_ativo_em_duas_turmas_fica_ambiguo() {
        let turmas = vec![
            (
                std::path::PathBuf::from("t1.json"),
                turma_fixture(json!({
                    "codigo": "6E", "ano": 2026,
                    "alunos": { "0001201646601": { "nome": "SAMUEL TENORIO DE SOUSA", "ativo": true } }
                })),
            ),
            (
                std::path::PathBuf::from("t2.json"),
                turma_fixture(json!({
                    "codigo": "6F", "ano": 2026,
                    "alunos": { "0001201646601": { "nome": "SAMUEL TENORIO DE SOUSA", "ativo": true } }
                })),
            ),
        ];
        let indice_ra = indice_alunos_por_ra(&turmas);
        let indice_nome = indice_alunos_por_nome(&turmas);
        let linha = linha_fixture("SAMUEL TENORIO DE SOUSA", "0001201646601sp@al.educacao.sp.gov.br");
        let (candidatos, modo) = candidatar_linha(&linha, &indice_ra, &indice_nome);
        assert_eq!(modo, "ra");
        assert_eq!(candidatos.len(), 2);
    }

    #[test]
    fn linha_sem_ra_conhecido_cai_no_fallback_por_nome() {
        let turmas = vec![(
            std::path::PathBuf::from("t1.json"),
            turma_fixture(json!({
                "codigo": "1A", "ano": 2026,
                "alunos": { "999": { "nome": "FULANO DE TAL", "ativo": true } }
            })),
        )];
        let indice_ra = indice_alunos_por_ra(&turmas);
        let indice_nome = indice_alunos_por_nome(&turmas);
        // E-mail não bate com nenhuma matrícula conhecida na base.
        let linha = linha_fixture("FULANO DE TAL", "00009999999999sp@al.educacao.sp.gov.br");
        let (candidatos, modo) = candidatar_linha(&linha, &indice_ra, &indice_nome);
        assert_eq!(modo, "nome");
        assert_eq!(candidatos, vec![(0usize, "999".to_string())]);
    }

    #[test]
    fn aplicar_snapshot_no_aluno_a_mesma_data_sobrescreve() {
        let mut info = json!({ "nome": "AGATHA" }).as_object().unwrap().clone();
        let sobrescreveu_1 = aplicar_snapshot_no_aluno(&mut info, "x@y", "2026-08-25", json!({"progresso": 80.0}));
        assert!(!sobrescreveu_1);
        let sobrescreveu_2 = aplicar_snapshot_no_aluno(&mut info, "x@y", "2026-08-25", json!({"progresso": 85.0}));
        assert!(sobrescreveu_2);
        let snaps = info["expansao_online"]["snapshots"].as_object().unwrap();
        assert_eq!(snaps.len(), 1);
        assert_eq!(snaps["2026-08-25"]["progresso"], json!(85.0));
    }

    #[test]
    fn aplicar_snapshot_no_aluno_data_diferente_acrescenta_preservando_a_antiga() {
        let mut info = json!({ "nome": "AGATHA" }).as_object().unwrap().clone();
        aplicar_snapshot_no_aluno(&mut info, "x@y", "2026-08-25", json!({"progresso": 80.0}));
        aplicar_snapshot_no_aluno(&mut info, "x@y", "2026-09-08", json!({"progresso": 90.0}));
        let snaps = info["expansao_online"]["snapshots"].as_object().unwrap();
        assert_eq!(snaps.len(), 2);
        assert_eq!(snaps["2026-08-25"]["progresso"], json!(80.0));
        assert_eq!(snaps["2026-09-08"]["progresso"], json!(90.0));
    }

    #[test]
    fn aplicar_snapshot_no_aluno_preenche_email_so_na_primeira_vez() {
        let mut info = json!({}).as_object().unwrap().clone();
        aplicar_snapshot_no_aluno(&mut info, "primeiro@x", "2026-08-25", json!({}));
        aplicar_snapshot_no_aluno(&mut info, "segundo@x", "2026-09-08", json!({}));
        assert_eq!(info["expansao_online"]["email"], json!("primeiro@x"));
    }
}
