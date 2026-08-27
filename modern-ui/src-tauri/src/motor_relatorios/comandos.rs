// Comandos Tauri do motor de relatórios: substituem os ~8 comandos
// específicos de hoje (um por relatório) por um punhado de comandos
// genéricos, parametrizados pela ReportDefinition.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

use crate::*;

use super::campos::{CategoriaCampo, TipoCampo, CAMPOS};
use super::definicao::{BlocoRelatorio, ConteudoBloco, ReportDefinition};
use super::embutidos::definicoes_embutidas;
use super::executor::{executar_relatorio, RelatorioGenericoResultado, SecaoPreview};
use super::expressoes::ValorExpressao;

/// DTO do registro de campos pro construtor visual — a struct real
/// (campos.rs) guarda um ponteiro de função no extrator, que não é
/// serializável, então só o que o frontend precisa pra montar a paleta de
/// blocos atravessa a fronteira do comando.
#[derive(Serialize)]
pub(crate) struct CampoRelatorioInfo {
    pub(crate) id: String,
    pub(crate) rotulo: String,
    pub(crate) categoria: CategoriaCampo,
    pub(crate) tipo: TipoCampo,
    pub(crate) requer_parametro: bool,
}

/// Nomes de disciplina conhecidos (varrendo `carga_horaria`/`medias`/
/// `ajustes_medias_conselho`/`frequencia` de todas as turmas) — alimenta o
/// dropdown de disciplina no construtor visual pros campos parametrizados
/// (nota/frequência de UMA disciplina). Sem filtro nenhum: ao contrário de
/// `turmas::listar_disciplinas_turma` (usado pelo Planejamento, que exclui
/// disciplinas de apoio/expansão porque essas não têm Plano de Ensino), aqui
/// o usuário pode querer referenciar qualquer disciplina lançada.
#[tauri::command(async)]
pub(crate) fn listar_disciplinas_conhecidas() -> Result<Vec<String>, String> {
    let turmas = carregar_turmas_com_caminho()?;
    let mut disciplinas: BTreeSet<String> = BTreeSet::new();

    for (_, turma) in &turmas {
        if let Some(carga) = &turma.carga_horaria {
            for por_bimestre in carga.values() {
                if let Some(obj) = por_bimestre.as_object() {
                    disciplinas.extend(obj.keys().cloned());
                }
            }
        }
        let Some(alunos) = &turma.alunos else { continue };
        for aluno in alunos.values() {
            for campo in ["medias", "ajustes_medias_conselho", "frequencia"] {
                let Some(por_bimestre) = aluno.get(campo).and_then(Value::as_object) else { continue };
                for disciplinas_bimestre in por_bimestre.values() {
                    if let Some(obj) = disciplinas_bimestre.as_object() {
                        disciplinas.extend(obj.keys().cloned());
                    }
                }
            }
        }
    }

    Ok(disciplinas.into_iter().collect())
}

/// true se algum aluno de alguma turma tem pelo menos um snapshot de
/// Expansão (online) importado — ver importador_expansoes.rs. Sem isso,
/// os 11 campos de "Expansões" não servem pra nada (não fazem sentido nem
/// pra escolas 100% diurnas, que nunca terão esse dado) e só poluem o
/// dropdown de campos do construtor de relatórios.
fn tem_dados_expansao(turmas: &[(PathBuf, TurmaArquivo)]) -> bool {
    turmas.iter().any(|(_, turma)| {
        turma.alunos.as_ref().is_some_and(|alunos| {
            alunos.values().any(|aluno| {
                aluno
                    .get("expansao_online")
                    .and_then(|env| env.get("snapshots"))
                    .and_then(Value::as_object)
                    .is_some_and(|snaps| !snaps.is_empty())
            })
        })
    })
}

/// Mesma ideia, pros 3 campos de "Prova Paulista" — nem toda escola/série
/// participa dessa avaliação externa.
fn tem_dados_prova_paulista(turmas: &[(PathBuf, TurmaArquivo)]) -> bool {
    turmas.iter().any(|(_, turma)| {
        turma.alunos.as_ref().is_some_and(|alunos| {
            alunos.values().any(|aluno| {
                aluno
                    .get("prova_paulista")
                    .and_then(Value::as_object)
                    .is_some_and(|bimestres| !bimestres.is_empty())
            })
        })
    })
}

/// Só lista campos que fazem sentido pros dados que este usuário realmente
/// tem — uma lista com todos os campos de todas as categorias, sempre,
/// deixava o dropdown do construtor carregado com opções que nunca dão
/// resultado (ex.: Expansão pra uma escola só diurna, Prova Paulista pra
/// quem nunca importou essa planilha). Falha aberta (mostra tudo) se não
/// conseguir ler as turmas, pra nunca esconder campo por um erro passageiro.
#[tauri::command(async)]
pub(crate) fn listar_campos_disponiveis() -> Vec<CampoRelatorioInfo> {
    let (expansao_ok, prova_paulista_ok) = match carregar_turmas_com_caminho() {
        Ok(turmas) => (tem_dados_expansao(&turmas), tem_dados_prova_paulista(&turmas)),
        Err(_) => (true, true),
    };

    CAMPOS
        .iter()
        .filter(|campo| {
            if campo.categoria == CategoriaCampo::Expansoes && !expansao_ok {
                return false;
            }
            if campo.id.starts_with("prova_paulista_") && !prova_paulista_ok {
                return false;
            }
            true
        })
        .map(|campo| CampoRelatorioInfo {
            id: campo.id.to_string(),
            rotulo: campo.rotulo.to_string(),
            categoria: campo.categoria,
            tipo: campo.tipo,
            requer_parametro: campo.requer_parametro,
        })
        .collect()
}

fn pasta_definicoes_personalizadas() -> Result<PathBuf, String> {
    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios_personalizados");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    Ok(pasta)
}

pub(crate) fn sanitizar_id_arquivo(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Migra relatórios salvos antes de o título virar um bloco próprio: o
/// bloco Cabeçalho costumava gerar o nome do relatório junto com a imagem
/// institucional (ver `ConteudoBloco::Cabecalho`) — agora só cuida da
/// imagem/rodapé, e o nome é o bloco `Titulo`, separado e endereçável (dá
/// pra pôr um Espaçador entre os dois, por exemplo). Sem esta migração,
/// todo relatório salvo antes dessa mudança perderia o título
/// silenciosamente na próxima geração. Idempotente — só insere se ainda
/// não existir nenhum bloco `Titulo`; relatórios sem `blocos` (formato
/// antigo/embutidos) usam outro caminho de renderização que já gera o
/// título sozinho, então ficam de fora.
fn migrar_titulo_separado_do_cabecalho(definicao: &mut ReportDefinition) {
    if definicao.blocos.is_empty() {
        return;
    }
    let ja_tem_titulo = definicao.blocos.iter().any(|b| matches!(b.conteudo, ConteudoBloco::Titulo { .. }));
    if ja_tem_titulo {
        return;
    }
    let Some(posicao_cabecalho) = definicao
        .blocos
        .iter()
        .position(|b| b.ativo && matches!(b.conteudo, ConteudoBloco::Cabecalho))
    else {
        return;
    };
    definicao.blocos.insert(
        posicao_cabecalho + 1,
        BlocoRelatorio {
            id: format!("{}_titulo_migrado", definicao.id),
            ativo: true,
            conteudo: ConteudoBloco::Titulo { tamanho: 14, cor: "#800080".to_string() },
        },
    );
}

fn carregar_definicoes_personalizadas() -> Result<Vec<ReportDefinition>, String> {
    let pasta = pasta_definicoes_personalizadas()?;
    let mut definicoes = Vec::new();
    for entrada in fs::read_dir(&pasta).map_err(|err| err.to_string())? {
        let entrada = entrada.map_err(|err| err.to_string())?;
        let caminho = entrada.path();
        if caminho.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Ok(texto) = fs::read_to_string(&caminho) else {
            continue;
        };
        // Ignora arquivo corrompido/de outra versão em vez de derrubar a
        // listagem inteira — o usuário só não vê aquele relatório na lista.
        if let Ok(mut definicao) = serde_json::from_str::<ReportDefinition>(&texto) {
            migrar_titulo_separado_do_cabecalho(&mut definicao);
            definicoes.push(definicao);
        }
    }
    Ok(definicoes)
}

#[tauri::command(async)]
pub(crate) fn listar_definicoes_relatorio() -> Result<Vec<ReportDefinition>, String> {
    let mut definicoes = definicoes_embutidas();
    definicoes.extend(carregar_definicoes_personalizadas()?);
    Ok(definicoes)
}

#[derive(Deserialize)]
pub(crate) struct ExecutarRelatorioGenericoInput {
    pub(crate) definicao: ReportDefinition,
    pub(crate) bimestre: String,
    /// Valores dos parâmetros de execução declarados em
    /// `definicao.parametros` (ex.: o limiar de elegibilidade) — o que a UI
    /// não enviar cai no `valor_padrao` de cada um.
    #[serde(default)]
    pub(crate) parametros: BTreeMap<String, ValorExpressao>,
}

#[tauri::command(async)]
pub(crate) fn executar_relatorio_generico(
    input: ExecutarRelatorioGenericoInput,
) -> Result<RelatorioGenericoResultado, String> {
    executar_relatorio(&input.definicao, &input.bimestre, &input.parametros)
}

const LIMITE_PADRAO_PREVISUALIZACAO: usize = 20;

#[derive(Deserialize)]
pub(crate) struct PreVisualizarRelatorioInput {
    pub(crate) definicao: ReportDefinition,
    pub(crate) bimestre: String,
    #[serde(default)]
    pub(crate) parametros: BTreeMap<String, ValorExpressao>,
}

#[tauri::command(async)]
pub(crate) fn pre_visualizar_relatorio(input: PreVisualizarRelatorioInput) -> Result<Vec<SecaoPreview>, String> {
    super::executor::pre_visualizar_relatorio(
        &input.definicao,
        &input.bimestre,
        &input.parametros,
        LIMITE_PADRAO_PREVISUALIZACAO,
    )
}

#[tauri::command(async)]
pub(crate) fn salvar_definicao_relatorio(definicao: ReportDefinition) -> Result<(), String> {
    if definicao.embutido {
        return Err("Relatórios embutidos não podem ser sobrescritos — duplique para customizar.".to_string());
    }
    if definicao.id.trim().is_empty() {
        return Err("O relatório precisa de um identificador.".to_string());
    }
    let pasta = pasta_definicoes_personalizadas()?;
    let caminho = pasta.join(format!("{}.json", sanitizar_id_arquivo(&definicao.id)));
    let conteudo = serde_json::to_string_pretty(&definicao).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &conteudo).map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub(crate) fn excluir_definicao_relatorio(id: String) -> Result<(), String> {
    let pasta = pasta_definicoes_personalizadas()?;
    let caminho = pasta.join(format!("{}.json", sanitizar_id_arquivo(&id)));
    if caminho.is_file() {
        fs::remove_file(&caminho).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command(async)]
pub(crate) fn exportar_definicao_relatorio(id: String, destino: String) -> Result<(), String> {
    let definicoes = listar_definicoes_relatorio()?;
    let definicao = definicoes
        .into_iter()
        .find(|definicao| definicao.id == id)
        .ok_or_else(|| "Relatório não encontrado.".to_string())?;
    let conteudo = serde_json::to_string_pretty(&definicao).map_err(|err| err.to_string())?;
    fs::write(&destino, conteudo).map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub(crate) fn importar_definicao_relatorio(caminho: String) -> Result<ReportDefinition, String> {
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut definicao: ReportDefinition =
        serde_json::from_str(&texto).map_err(|err| format!("Arquivo de relatório inválido: {err}"))?;
    definicao.embutido = false;
    salvar_definicao_relatorio(definicao.clone())?;
    Ok(definicao)
}

#[cfg(test)]
mod testes_migracao_titulo {
    use super::*;
    use serde_json::json;

    fn definicao_fixture(blocos: serde_json::Value) -> ReportDefinition {
        serde_json::from_value(json!({
            "id": "rel_teste",
            "nome": "Alunos com baixa progressão de expansões",
            "fonte": { "series": [], "periodos": [], "ciclos": [], "codigos": [] },
            "secoes": [],
            "blocos": blocos,
            "formato_saida": "docx",
        }))
        .unwrap()
    }

    #[test]
    fn insere_titulo_logo_apos_o_cabecalho() {
        let mut definicao = definicao_fixture(json!([
            { "id": "b1", "ativo": true, "tipo": "cabecalho" },
            { "id": "b2", "ativo": true, "tipo": "espacador" },
            { "id": "b3", "ativo": true, "tipo": "tabela", "secao_index": 0 },
        ]));

        migrar_titulo_separado_do_cabecalho(&mut definicao);

        assert!(matches!(definicao.blocos[0].conteudo, ConteudoBloco::Cabecalho));
        assert!(matches!(definicao.blocos[1].conteudo, ConteudoBloco::Titulo { .. }), "título deveria entrar logo depois do cabeçalho");
        assert!(matches!(definicao.blocos[2].conteudo, ConteudoBloco::Espacador { .. }));
        assert_eq!(definicao.blocos.len(), 4);
    }

    #[test]
    fn nao_duplica_titulo_se_ja_existir() {
        let mut definicao = definicao_fixture(json!([
            { "id": "b1", "ativo": true, "tipo": "cabecalho" },
            { "id": "b2", "ativo": true, "tipo": "titulo" },
            { "id": "b3", "ativo": true, "tipo": "tabela", "secao_index": 0 },
        ]));

        migrar_titulo_separado_do_cabecalho(&mut definicao);

        assert_eq!(definicao.blocos.len(), 3, "não deveria inserir um segundo bloco título");
    }

    #[test]
    fn nao_mexe_em_relatorio_sem_blocos() {
        let mut definicao = definicao_fixture(json!([]));
        migrar_titulo_separado_do_cabecalho(&mut definicao);
        assert!(definicao.blocos.is_empty(), "relatório sem blocos usa o caminho de renderização antigo — não migra");
    }

    #[test]
    fn sem_cabecalho_ativo_nao_insere_titulo() {
        let mut definicao = definicao_fixture(json!([
            { "id": "b1", "ativo": false, "tipo": "cabecalho" },
            { "id": "b2", "ativo": true, "tipo": "tabela", "secao_index": 0 },
        ]));
        migrar_titulo_separado_do_cabecalho(&mut definicao);
        assert_eq!(definicao.blocos.len(), 2, "cabeçalho desativado não deveria ganhar título");
    }
}

#[cfg(test)]
mod testes_relevancia_campos {
    use super::*;
    use serde_json::json;

    fn turma_fixture(alunos_json: serde_json::Value) -> (PathBuf, TurmaArquivo) {
        let valor = json!({ "codigo": "6º Ano A", "ano": 2026, "alunos": alunos_json });
        (PathBuf::new(), serde_json::from_value(valor).unwrap())
    }

    #[test]
    fn sem_nenhum_snapshot_de_expansao_nao_tem_dados() {
        let turmas = vec![turma_fixture(json!({ "1": { "nome": "SAMUEL" } }))];
        assert!(!tem_dados_expansao(&turmas));
    }

    #[test]
    fn snapshot_vazio_nao_conta_como_dado() {
        // Envelope existe (ex.: criado por um import que não achou o aluno)
        // mas sem nenhum snapshot dentro — não é dado de verdade.
        let turmas = vec![turma_fixture(json!({ "1": { "nome": "SAMUEL", "expansao_online": { "snapshots": {} } } }))];
        assert!(!tem_dados_expansao(&turmas));
    }

    #[test]
    fn um_snapshot_em_qualquer_aluno_de_qualquer_turma_basta() {
        let turmas = vec![
            turma_fixture(json!({ "1": { "nome": "SAMUEL" } })),
            turma_fixture(json!({ "2": { "nome": "MARIA", "expansao_online": { "snapshots": { "2026-08-01": { "progresso": 10.0 } } } } })),
        ];
        assert!(tem_dados_expansao(&turmas));
    }

    #[test]
    fn sem_prova_paulista_nao_tem_dados() {
        let turmas = vec![turma_fixture(json!({ "1": { "nome": "SAMUEL" } }))];
        assert!(!tem_dados_prova_paulista(&turmas));
    }

    #[test]
    fn prova_paulista_com_algum_bimestre_lancado_tem_dados() {
        let turmas = vec![turma_fixture(json!({ "1": { "nome": "SAMUEL", "prova_paulista": { "1": { "participou": true, "geral": 250 } } } }))];
        assert!(tem_dados_prova_paulista(&turmas));
    }
}
