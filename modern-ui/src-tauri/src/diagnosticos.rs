// Diagnósticos de integridade de dados, exibidos no Dashboard. Primeiro
// caso: alunos ativos em mais de uma turma ao mesmo tempo (ver
// turmas::detectar_alunos_multiplas_turmas) — sinal de transferência mal
// feita entre turmas, onde a matrícula antiga não foi desativada na turma
// de origem.
//
// Extraído seguindo a convenção de main.rs; os itens são pub(crate) e os
// módulos se enxergam através dos re-exports globais feitos no main.rs
// (use crate::*).

use crate::*;

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// Snapshot de um caso já visto numa checagem anterior — persistido via o
/// mesmo mecanismo genérico de índice que pei.rs/planejamento.rs usam
/// (infra::carregar_indice/salvar_indice).
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RegistroCasoConhecido {
    pub(crate) matricula_identidade: String,
    pub(crate) nome: String,
    pub(crate) turmas: Vec<String>,
    /// RFC3339 — preservada entre checagens, não é "agora" a cada vez.
    pub(crate) detectado_em: String,
    /// código da turma -> mtime do arquivo (segundos desde a epoch) no
    /// momento em que este caso foi detectado PELA PRIMEIRA VEZ — fica
    /// congelado enquanto o caso persistir (ver comparar_com_anteriores).
    /// Se fosse atualizado a cada checagem, "reimportado_sem_resolver" só
    /// apareceria por uma visita ao Dashboard e sumiria sozinho na
    /// seguinte, mesmo sem o problema real ter sido corrigido.
    pub(crate) mtimes_na_deteccao: BTreeMap<String, u64>,
    /// Usuário pediu pra parar de ver este aviso (ex.: problema é da
    /// planilha oficial e a coordenação não tem como corrigir). Continua
    /// rastreado em silêncio — se resolver sozinho no futuro, ainda entra
    /// em `resolvidos` uma vez, mesmo dispensado.
    #[serde(default)]
    pub(crate) dispensado: bool,
}

#[derive(Serialize)]
pub(crate) struct CasoAlunoMultiplasTurmas {
    pub(crate) matricula_identidade: String,
    pub(crate) nome: String,
    pub(crate) turmas: Vec<String>,
    /// Pelo menos uma das turmas envolvidas foi regravada desde que este
    /// caso foi detectado pela primeira vez, e o conflito continua — ou
    /// seja, uma reimportação não resolveu. Indica que o problema está na
    /// planilha de origem (sistema oficial), não em algo que o
    /// CoordenacaoOP possa corrigir sozinho.
    pub(crate) reimportado_sem_resolver: bool,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAlunosMultiplasTurmas {
    pub(crate) pendentes: Vec<CasoAlunoMultiplasTurmas>,
    /// Nomes que estavam pendentes na checagem anterior e sumiram desta —
    /// só aparece na checagem imediatamente seguinte à resolução, porque o
    /// snapshot já não guarda mais o caso depois disso.
    pub(crate) resolvidos: Vec<String>,
}

fn mtime_arquivo(caminho: &Path) -> Option<u64> {
    fs::metadata(caminho).ok()?.modified().ok()?.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

fn mtimes_dos_arquivos(turmas: &[(PathBuf, TurmaArquivo)], codigos: &[String]) -> BTreeMap<String, u64> {
    let mut mapa = BTreeMap::new();
    for codigo in codigos {
        if let Some((caminho, _)) = turmas.iter().find(|(_, t)| &t.codigo == codigo) {
            if let Some(mtime) = mtime_arquivo(caminho) {
                mapa.insert(codigo.clone(), mtime);
            }
        }
    }
    mapa
}

/// Núcleo puro (sem disco) do diagnóstico: compara os casos atuais contra
/// o snapshot da checagem anterior e decide pendentes/resolvidos/novo
/// snapshot. Separado da parte que lê/grava `_indice.json` pra poder ser
/// testado com fixtures em memória.
fn comparar_com_anteriores(
    atuais: &[CasoMultiplasTurmas],
    turmas: &[(PathBuf, TurmaArquivo)],
    anteriores: &[RegistroCasoConhecido],
    agora: &str,
) -> (Vec<CasoAlunoMultiplasTurmas>, Vec<String>, Vec<RegistroCasoConhecido>) {
    let anteriores_por_identidade: BTreeMap<&str, &RegistroCasoConhecido> =
        anteriores.iter().map(|r| (r.matricula_identidade.as_str(), r)).collect();

    let mut pendentes = Vec::new();
    let mut novo_snapshot = Vec::new();
    for caso in atuais {
        let mtimes_agora = mtimes_dos_arquivos(turmas, &caso.turmas);
        let anterior = anteriores_por_identidade.get(caso.matricula_identidade.as_str()).copied();
        // Congelado na primeira detecção — só usa mtimes_agora quando o
        // caso é inédito. Enquanto persistir, a base de comparação não
        // muda, senão "reimportado_sem_resolver" fica verdadeiro só na
        // checagem seguinte ao reimport e falso de novo depois.
        let mtimes_base = anterior.map(|a| a.mtimes_na_deteccao.clone()).unwrap_or_else(|| mtimes_agora.clone());
        let reimportado_sem_resolver =
            anterior.is_some() && caso.turmas.iter().any(|t| mtimes_base.get(t) != mtimes_agora.get(t));
        let dispensado = anterior.is_some_and(|a| a.dispensado);

        if !dispensado {
            pendentes.push(CasoAlunoMultiplasTurmas {
                matricula_identidade: caso.matricula_identidade.clone(),
                nome: caso.nome.clone(),
                turmas: caso.turmas.clone(),
                reimportado_sem_resolver,
            });
        }
        novo_snapshot.push(RegistroCasoConhecido {
            matricula_identidade: caso.matricula_identidade.clone(),
            nome: caso.nome.clone(),
            turmas: caso.turmas.clone(),
            detectado_em: anterior.map(|a| a.detectado_em.clone()).unwrap_or_else(|| agora.to_string()),
            mtimes_na_deteccao: mtimes_base,
            dispensado,
        });
    }

    let atuais_identidades: std::collections::BTreeSet<&str> =
        atuais.iter().map(|c| c.matricula_identidade.as_str()).collect();
    let resolvidos = anteriores
        .iter()
        .filter(|a| !atuais_identidades.contains(a.matricula_identidade.as_str()))
        .map(|a| a.nome.clone())
        .collect();

    (pendentes, resolvidos, novo_snapshot)
}

#[tauri::command(async)]
pub(crate) fn verificar_alunos_multiplas_turmas() -> Result<RelatorioAlunosMultiplasTurmas, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let atuais = detectar_alunos_multiplas_turmas(&turmas);

    let pasta = data_dir().map_err(|err| err.to_string())?.join("diagnosticos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let anteriores: Vec<RegistroCasoConhecido> = carregar_indice(&pasta);

    let (pendentes, resolvidos, novo_snapshot) =
        comparar_com_anteriores(&atuais, &turmas, &anteriores, &Local::now().to_rfc3339());

    salvar_indice(&pasta, &novo_snapshot);
    Ok(RelatorioAlunosMultiplasTurmas { pendentes, resolvidos })
}

/// Para de mostrar este caso no Dashboard (ex.: o problema é da planilha
/// oficial e a coordenação não tem como corrigir sozinha) sem parar de
/// rastreá-lo — se ele desaparecer numa checagem futura, ainda entra em
/// `resolvidos` uma vez, mesmo tendo sido dispensado.
#[tauri::command(async)]
pub(crate) fn dispensar_caso_multiplas_turmas(matricula_identidade: String) -> Result<(), String> {
    let _dados = travar_dados();
    let pasta = data_dir().map_err(|err| err.to_string())?.join("diagnosticos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let mut registros: Vec<RegistroCasoConhecido> = carregar_indice(&pasta);
    for registro in registros.iter_mut() {
        if registro.matricula_identidade == matricula_identidade {
            registro.dispensado = true;
        }
    }
    salvar_indice(&pasta, &registros);
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    /// Pasta temporária real por teste (nome literal + pid, mesmo padrão de
    /// desduplicar_turmas_por_codigo em main.rs) — os fixtures precisam ser
    /// arquivos de verdade em disco pra `mtime_arquivo` ter algo real pra
    /// comparar, não um caminho fictício que sempre devolveria `None`.
    fn pasta_temp(sufixo: &str) -> PathBuf {
        let pasta = std::env::temp_dir().join(format!("coordenacaoop_diag_{sufixo}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&pasta);
        fs::create_dir_all(&pasta).unwrap();
        pasta
    }

    fn turma_fixture(pasta: &Path, codigo: &str, alunos_json: serde_json::Value) -> (PathBuf, TurmaArquivo) {
        let valor = json!({ "codigo": codigo, "ano": 2026, "alunos": alunos_json });
        let caminho = pasta.join(format!("turma_{codigo}.json"));
        fs::write(&caminho, serde_json::to_string(&valor).unwrap()).unwrap();
        (caminho, serde_json::from_value(valor).unwrap())
    }

    fn turmas_com_conflito(pasta: &Path) -> Vec<(PathBuf, TurmaArquivo)> {
        vec![
            turma_fixture(pasta, "6º Ano E", json!({ "0001201646601": { "nome": "SAMUEL", "ativo": true } })),
            turma_fixture(pasta, "6º Ano F", json!({ "0001201646601": { "nome": "SAMUEL", "ativo": true } })),
        ]
    }

    #[test]
    fn detecta_mesmo_ra_ativo_em_duas_turmas() {
        let pasta = pasta_temp("deteccao");
        let casos = detectar_alunos_multiplas_turmas(&turmas_com_conflito(&pasta));
        assert_eq!(casos.len(), 1);
        assert_eq!(casos[0].nome, "SAMUEL");
        assert_eq!(casos[0].turmas, vec!["6º Ano E".to_string(), "6º Ano F".to_string()]);
    }

    #[test]
    fn ignora_copia_inativa_na_turma_de_origem() {
        let pasta = pasta_temp("copia_inativa");
        let turmas = vec![
            turma_fixture(&pasta, "1ª Série B", json!({ "0001098707369": { "nome": "HIAGO", "ativo": false } })),
            turma_fixture(&pasta, "1ª Série D", json!({ "0001098707369": { "nome": "HIAGO", "ativo": true } })),
        ];
        assert!(detectar_alunos_multiplas_turmas(&turmas).is_empty(), "transferência correta não deveria ser sinalizada");
    }

    #[test]
    fn primeira_checagem_sem_snapshot_anterior_nao_marca_reimportado() {
        let pasta = pasta_temp("primeira_checagem");
        let turmas = turmas_com_conflito(&pasta);
        let atuais = detectar_alunos_multiplas_turmas(&turmas);
        let (pendentes, resolvidos, snapshot) = comparar_com_anteriores(&atuais, &turmas, &[], "2026-08-26T10:00:00-03:00");

        assert_eq!(pendentes.len(), 1);
        assert!(!pendentes[0].reimportado_sem_resolver, "sem histórico, não há como saber se houve reimportação");
        assert!(resolvidos.is_empty());
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].detectado_em, "2026-08-26T10:00:00-03:00");
    }

    #[test]
    fn mtime_de_turma_mudado_desde_a_deteccao_marca_reimportado_sem_resolver() {
        let pasta = pasta_temp("mtime_mudou");
        let turmas = turmas_com_conflito(&pasta);
        let atuais = detectar_alunos_multiplas_turmas(&turmas);

        // Data antiga fabricada (ano 1970 + 1000s) — o mtime real dos
        // arquivos fixture (escritos agora, em 2026) é necessariamente
        // maior, simulando "a turma foi regravada depois da detecção
        // anterior" sem depender de sleep nem de tocar o arquivo de novo.
        let mut mtimes_antigos = BTreeMap::new();
        mtimes_antigos.insert("6º Ano E".to_string(), 1_000u64);
        mtimes_antigos.insert("6º Ano F".to_string(), 1_000u64);
        let anteriores = vec![RegistroCasoConhecido {
            matricula_identidade: atuais[0].matricula_identidade.clone(),
            nome: "SAMUEL".to_string(),
            turmas: atuais[0].turmas.clone(),
            detectado_em: "2026-08-01T10:00:00-03:00".to_string(),
            mtimes_na_deteccao: mtimes_antigos,
            dispensado: false,
        }];

        let (pendentes, _, snapshot) =
            comparar_com_anteriores(&atuais, &turmas, &anteriores, "2026-08-26T10:00:00-03:00");

        assert!(pendentes[0].reimportado_sem_resolver, "arquivo mudou e o conflito continua — deveria sinalizar planilha oficial");
        assert_eq!(snapshot[0].detectado_em, "2026-08-01T10:00:00-03:00", "data original de detecção é preservada, não é 'agora'");
    }

    /// Reproduz o bug real: se a base de comparação fosse atualizada a
    /// cada checagem (em vez de congelada na primeira detecção),
    /// "reimportado_sem_resolver" apareceria só na checagem imediatamente
    /// seguinte ao reimport e desapareceria sozinho na seguinte, mesmo sem
    /// o problema real ter sido corrigido — o coordenador que não visse o
    /// Dashboard bem naquela hora nunca saberia.
    #[test]
    fn reimportado_sem_resolver_continua_verdadeiro_em_checagens_seguintes() {
        let pasta = pasta_temp("mtime_persiste");
        let turmas = turmas_com_conflito(&pasta);
        let atuais = detectar_alunos_multiplas_turmas(&turmas);

        let mut mtimes_antigos = BTreeMap::new();
        mtimes_antigos.insert("6º Ano E".to_string(), 1_000u64);
        mtimes_antigos.insert("6º Ano F".to_string(), 1_000u64);
        let checagem_1 = vec![RegistroCasoConhecido {
            matricula_identidade: atuais[0].matricula_identidade.clone(),
            nome: "SAMUEL".to_string(),
            turmas: atuais[0].turmas.clone(),
            detectado_em: "2026-08-01T10:00:00-03:00".to_string(),
            mtimes_na_deteccao: mtimes_antigos,
            dispensado: false,
        }];

        let (pendentes_2, _, snapshot_2) =
            comparar_com_anteriores(&atuais, &turmas, &checagem_1, "2026-08-26T10:00:00-03:00");
        assert!(pendentes_2[0].reimportado_sem_resolver, "primeira checagem depois do reimport deveria sinalizar");

        // Nenhum arquivo mudou entre a checagem 2 e a 3 — só rodando o
        // Dashboard de novo no dia seguinte, sem nova reimportação.
        let (pendentes_3, _, _) =
            comparar_com_anteriores(&atuais, &turmas, &snapshot_2, "2026-08-27T10:00:00-03:00");
        assert!(pendentes_3[0].reimportado_sem_resolver, "o problema não foi corrigido — o aviso não pode sumir sozinho");
    }

    #[test]
    fn mtime_de_turma_igual_ao_da_deteccao_nao_marca_reimportado() {
        let pasta = pasta_temp("mtime_igual");
        let turmas = turmas_com_conflito(&pasta);
        let atuais = detectar_alunos_multiplas_turmas(&turmas);
        let mtimes_reais = mtimes_dos_arquivos(&turmas, &atuais[0].turmas);

        let anteriores = vec![RegistroCasoConhecido {
            matricula_identidade: atuais[0].matricula_identidade.clone(),
            nome: "SAMUEL".to_string(),
            turmas: atuais[0].turmas.clone(),
            detectado_em: "2026-08-01T10:00:00-03:00".to_string(),
            mtimes_na_deteccao: mtimes_reais,
            dispensado: false,
        }];

        let (pendentes, _, _) = comparar_com_anteriores(&atuais, &turmas, &anteriores, "2026-08-26T10:00:00-03:00");
        assert!(!pendentes[0].reimportado_sem_resolver, "nenhum arquivo mudou desde a detecção — ainda só aguardando reimportação");
    }

    #[test]
    fn caso_dispensado_nao_aparece_em_pendentes() {
        let pasta = pasta_temp("dispensado");
        let turmas = turmas_com_conflito(&pasta);
        let atuais = detectar_alunos_multiplas_turmas(&turmas);
        let mtimes_reais = mtimes_dos_arquivos(&turmas, &atuais[0].turmas);

        let anteriores = vec![RegistroCasoConhecido {
            matricula_identidade: atuais[0].matricula_identidade.clone(),
            nome: "SAMUEL".to_string(),
            turmas: atuais[0].turmas.clone(),
            detectado_em: "2026-08-01T10:00:00-03:00".to_string(),
            mtimes_na_deteccao: mtimes_reais,
            dispensado: true,
        }];

        let (pendentes, resolvidos, snapshot) =
            comparar_com_anteriores(&atuais, &turmas, &anteriores, "2026-08-26T10:00:00-03:00");

        assert!(pendentes.is_empty(), "caso dispensado não deveria voltar a incomodar o usuário");
        assert!(resolvidos.is_empty());
        assert!(snapshot[0].dispensado, "continua marcado como dispensado no snapshot seguinte");
    }

    /// O pedido original do usuário: mesmo dispensado, se o problema
    /// resolver sozinho no futuro (ex.: SED corrigiu a planilha), o
    /// coordenador ainda deveria ficar sabendo.
    #[test]
    fn caso_dispensado_que_resolve_ainda_aparece_como_resolvido() {
        let pasta = pasta_temp("dispensado_resolvido");
        let turmas_sem_conflito = vec![turma_fixture(&pasta, "6º Ano F", json!({ "0001201646601": { "nome": "SAMUEL", "ativo": true } }))];
        let atuais = detectar_alunos_multiplas_turmas(&turmas_sem_conflito);
        assert!(atuais.is_empty());

        let anteriores = vec![RegistroCasoConhecido {
            matricula_identidade: "1201646601".to_string(),
            nome: "SAMUEL".to_string(),
            turmas: vec!["6º Ano E".to_string(), "6º Ano F".to_string()],
            detectado_em: "2026-08-01T10:00:00-03:00".to_string(),
            mtimes_na_deteccao: BTreeMap::new(),
            dispensado: true,
        }];

        let (pendentes, resolvidos, _) =
            comparar_com_anteriores(&atuais, &turmas_sem_conflito, &anteriores, "2026-08-26T10:00:00-03:00");

        assert!(pendentes.is_empty());
        assert_eq!(resolvidos, vec!["SAMUEL".to_string()], "resolvido tem que aparecer mesmo tendo sido dispensado antes");
    }

    #[test]
    fn caso_que_sumiu_do_atual_aparece_como_resolvido_uma_vez() {
        let pasta = pasta_temp("resolvido");
        let turmas_sem_conflito = vec![turma_fixture(&pasta, "6º Ano F", json!({ "0001201646601": { "nome": "SAMUEL", "ativo": true } }))];
        let atuais = detectar_alunos_multiplas_turmas(&turmas_sem_conflito);
        assert!(atuais.is_empty());

        let anteriores = vec![RegistroCasoConhecido {
            matricula_identidade: "1201646601".to_string(),
            nome: "SAMUEL".to_string(),
            turmas: vec!["6º Ano E".to_string(), "6º Ano F".to_string()],
            detectado_em: "2026-08-01T10:00:00-03:00".to_string(),
            mtimes_na_deteccao: BTreeMap::new(),
            dispensado: false,
        }];

        let (pendentes, resolvidos, snapshot) =
            comparar_com_anteriores(&atuais, &turmas_sem_conflito, &anteriores, "2026-08-26T10:00:00-03:00");

        assert!(pendentes.is_empty());
        assert_eq!(resolvidos, vec!["SAMUEL".to_string()]);
        assert!(snapshot.is_empty(), "caso resolvido não deveria sobreviver no próximo snapshot");
    }
}
