
// Modelo de turma: CRUD, conselho (ajustes, encaminhamentos, atendimentos) e detalhamento.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use chrono::Local;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet}, fs,
    path::{Path, PathBuf},
};


#[tauri::command]
pub(crate) fn criar_turma(input: NovaTurmaInput) -> Result<TurmaResumo, String> {
    let _dados = travar_dados();
    let codigo = formatar_rotulo_turma_texto(input.codigo.trim());
    let serie = formatar_rotulo_turma_texto(input.serie.trim());
    let ciclo = input.ciclo.trim().to_string();
    let periodo = input.periodo.trim().to_string();

    if codigo.is_empty() || serie.is_empty() {
        return Err("Serie e turma sao obrigatorias.".to_string());
    }
    if input.ano <= 0 {
        return Err("Ano letivo invalido.".to_string());
    }
    if input.alunos.is_empty() {
        return Err("O CSV nao trouxe alunos validos.".to_string());
    }

    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos")
        .join(input.ano.to_string());
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let caminho = pasta.join(format!("turma_{}.json", sanitizar_segmento(&codigo)));
    if caminho.exists() {
        return Err(format!("Ja existe uma turma {codigo} para {}.", input.ano));
    }
    // Compara também ignorando acentos e maiúsculas ("2ª SERIE B" x "2ª Série B"),
    // senão importações com grafia diferente criam turmas duplicadas.
    let codigo_norm = normalizar_texto_basico(&codigo);
    for (_, existente) in carregar_turmas_com_caminho()? {
        if existente.ano == input.ano && normalizar_texto_basico(&existente.codigo) == codigo_norm {
            return Err(format!(
                "Ja existe uma turma equivalente a {codigo} para {} (cadastrada como {}).",
                input.ano, existente.codigo
            ));
        }
    }
    validar_conflito_sala(input.ano, &periodo, input.sala.trim(), None)?;

    let mut alunos = serde_json::Map::new();
    for aluno in input.alunos {
        let matricula = aluno.matricula.trim();
        let nome = aluno.nome.trim();
        if matricula.is_empty() || nome.is_empty() {
            continue;
        }
        alunos.insert(
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
    }

    if alunos.is_empty() {
        return Err("O CSV nao trouxe alunos validos.".to_string());
    }

    let dados = serde_json::json!({
        "codigo": codigo,
        "ano": input.ano,
        "serie": serie,
        "sala": input.sala.trim(),
        "periodo": periodo,
        "ciclo": ciclo,
        "coordenador_turma": null,
        "carga_horaria": {},
        "textos_ata": {},
        "conselhos": {},
        "alunos": alunos,
    });

    let texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(resumir_turma(turma, caminho))
}

#[tauri::command]
pub(crate) fn editar_turma(caminho: String, input: NovaTurmaInput) -> Result<TurmaResumo, String> {
    let _dados = travar_dados();
    let caminho_atual = PathBuf::from(caminho);
    validar_caminho_turma(&caminho_atual)?;
    let texto = fs::read_to_string(&caminho_atual).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    let codigo = formatar_rotulo_turma_texto(input.codigo.trim());
    let serie = formatar_rotulo_turma_texto(input.serie.trim());
    let ciclo = input.ciclo.trim().to_string();
    let periodo = input.periodo.trim().to_string();
    if codigo.is_empty() || serie.is_empty() {
        return Err("Serie e turma sao obrigatorias.".to_string());
    }
    if input.ano <= 0 {
        return Err("Ano letivo invalido.".to_string());
    }

    dados["codigo"] = Value::String(codigo.clone());
    dados["ano"] = Value::Number(input.ano.into());
    dados["serie"] = Value::String(serie.clone());
    dados["sala"] = Value::String(input.sala.trim().to_string());
    dados["periodo"] = Value::String(periodo.clone());
    dados["ciclo"] = Value::String(ciclo.clone());

    if !input.alunos.is_empty() {
        let alunos_existentes = dados
            .get_mut("alunos")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "Arquivo da turma sem lista de alunos valida.".to_string())?;
        aplicar_lista_alunos(
            alunos_existentes,
            &input.alunos,
            input.substituir_alunos.unwrap_or(false),
        );
    }

    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos")
        .join(input.ano.to_string());
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let novo_caminho = pasta.join(format!("turma_{}.json", sanitizar_segmento(&codigo)));

    if caminhos_diferentes(&caminho_atual, &novo_caminho) && novo_caminho.exists() {
        return Err(format!("Ja existe uma turma {codigo} para {}.", input.ano));
    }
    validar_conflito_sala(input.ano, &periodo, input.sala.trim(), Some(&caminho_atual))?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&novo_caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    if caminhos_diferentes(&caminho_atual, &novo_caminho) && caminho_atual.exists() {
        fs::remove_file(&caminho_atual).map_err(|err| err.to_string())?;
    }

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(resumir_turma(turma, novo_caminho))
}

#[tauri::command]
pub(crate) fn excluir_turma(caminho: String) -> Result<(), String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    if caminho.exists() {
        fs::remove_file(&caminho).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn listar_turmas() -> Result<Vec<TurmaResumo>, String> {
    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;

    let mut turmas = Vec::new();
    visitar_jsons_turma(&pasta, &mut turmas)?;

    // Marca as turmas com conselho preparado em pendrive e ainda não reintegrado.
    let externos = ler_conselhos_externos();
    if !externos.is_empty() {
        for turma in &mut turmas {
            let caminho_turma = Path::new(&turma.caminho);
            turma.em_conselho_externo = externos
                .iter()
                .filter(|item| mesmos_caminhos(caminho_turma, &pasta.join(&item.caminho_relativo)))
                .map(|item| item.bimestre.clone())
                .collect();
        }
    }

    turmas.sort_by_key(|a| (a.ano, a.codigo.clone()));
    Ok(turmas)
}

// Lista os componentes (disciplinas) de uma turma a partir do mapão importado.
#[tauri::command]
pub(crate) fn listar_disciplinas_turma(caminho: String) -> Result<Vec<String>, String> {
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|e| e.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|e| e.to_string())?;
    let mut set: BTreeSet<String> = BTreeSet::new();

    if let Some(carga) = dados.get("carga_horaria").and_then(Value::as_object) {
        for por_disc in carga.values() {
            if let Some(obj) = por_disc.as_object() {
                set.extend(obj.keys().cloned());
            }
        }
    }
    if let Some(alunos) = dados.get("alunos").and_then(Value::as_object) {
        for info in alunos.values() {
            for campo in ["medias", "ajustes_medias_conselho", "frequencia"] {
                if let Some(por_bim) = info.get(campo).and_then(Value::as_object) {
                    for discs in por_bim.values() {
                        if let Some(obj) = discs.as_object() {
                            set.extend(obj.keys().cloned());
                        }
                    }
                }
            }
        }
    }
    // Disciplinas de mapão "Tipo de Ensino: Expansão" (turma não seriada de
    // itinerário/aprofundamento) têm nota lançada normalmente acima, mas
    // ninguém escreve Plano de Ensino pra elas — não entram na lista que
    // alimenta o Planejamento nem o dropdown de componente curricular do
    // Web App. Ver importador_mapao::mapao_eh_expansao.
    if let Some(expansao) = dados.get("disciplinas_expansao").and_then(Value::as_array) {
        for nome in expansao.iter().filter_map(Value::as_str) {
            set.remove(nome);
        }
    }
    // Itinerário/tutoria (Projeto de Vida, Redação e Leitura, Orientação de
    // Estudo) nunca tem Plano de Ensino de professor, independente de vir de
    // mapão regular ou de expansão — ver disciplina_e_de_apoio_sem_documento.
    set.retain(|nome| !disciplina_e_de_apoio_sem_documento(nome));
    Ok(set.into_iter().collect())
}

#[tauri::command]
pub(crate) fn carregar_turma(caminho: String, bimestre: String) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_ajustes_media(
    caminho: String,
    matricula: String,
    bimestre: String,
    ajustes: Vec<AjusteMediaInput>,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    aplicar_ajustes_media(&mut dados, &matricula, &bimestre, ajustes)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_encaminhamentos(
    caminho: String,
    matricula: String,
    bimestre: String,
    encaminhamentos: Vec<i64>,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    aplicar_encaminhamentos(&mut dados, &matricula, &bimestre, encaminhamentos)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_aluno_deliberado(
    caminho: String,
    matricula: String,
    bimestre: String,
    deliberado: bool,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    aplicar_aluno_deliberado(&mut dados, &matricula, &bimestre, deliberado)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_tempo_conselho(
    caminho: String,
    bimestre: String,
    tempo_segundos: i64,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    aplicar_tempo_conselho(&mut dados, &bimestre, tempo_segundos)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_coordenador_turma(
    caminho: String,
    input: CoordenadorTurmaInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let Some(objeto) = dados.as_object_mut() else {
        return Err("Arquivo da turma esta invalido.".to_string());
    };
    let coordenador = input.coordenador.trim();
    if coordenador.is_empty() {
        objeto.remove("coordenador_turma");
    } else {
        objeto.insert("coordenador_turma".to_string(), Value::from(coordenador));
    }

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

fn ajustar_chave_texto(objeto: &mut serde_json::Map<String, Value>, chave: &str, valor: &str) {
    let valor = valor.trim();
    if valor.is_empty() {
        objeto.remove(chave);
    } else {
        objeto.insert(chave.to_string(), Value::from(valor));
    }
}

// Grava os assinantes do PEI desta turma. Campos vazios são removidos do
// arquivo — o fallback (coordenador de gestão / direcao_nome) é aplicado só
// na hora de gerar o documento, em pei::resolver_assinantes_pei.
#[tauri::command]
pub(crate) fn salvar_pessoas_pei_turma(
    caminho: String,
    input: PessoasPeiTurmaInput,
) -> Result<(), String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let Some(objeto) = dados.as_object_mut() else {
        return Err("Arquivo da turma esta invalido.".to_string());
    };
    ajustar_chave_texto(objeto, "pei_coordenador_gestao", &input.coordenador_gestao);
    ajustar_chave_texto(objeto, "pei_prof_especializado", &input.prof_especializado);
    ajustar_chave_texto(objeto, "pei_direcao", &input.direcao);
    // Chave antiga (campo separado de ensino colaborativo) — hoje unificada.
    objeto.remove("pei_prof_colaborativo");

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())
}

// Grava o responsável pelo estudante (impresso acima da linha de assinatura
// do PEI). Vazio remove a chave.
#[tauri::command]
pub(crate) fn salvar_responsavel_pei_aluno(
    caminho: String,
    matricula: String,
    responsavel: String,
) -> Result<(), String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let aluno = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .and_then(|alunos| alunos.get_mut(&matricula))
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;
    ajustar_chave_texto(aluno, "responsavel_pei", &responsavel);

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn salvar_elegibilidade_aluno(
    caminho: String,
    matricula: String,
    input: ElegibilidadeAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let aluno = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .and_then(|alunos| alunos.get_mut(&matricula))
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;
    let Some(aluno_obj) = aluno.as_object_mut() else {
        return Err("Registro do aluno esta invalido.".to_string());
    };
    aluno_obj.insert("elegivel_manual".to_string(), Value::from(input.elegivel));
    aluno_obj.insert("elegivel_manual_em".to_string(), Value::from(Local::now().to_rfc3339()));

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_lideranca_aluno(
    caminho: String,
    matricula: String,
    input: LiderancaAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let lideranca = normalizar_lideranca_sala(input.lideranca.as_deref());
    let alunos = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Arquivo da turma sem lista de alunos valida.".to_string())?;

    if !alunos.contains_key(&matricula) {
        return Err("Aluno nao encontrado na turma selecionada.".to_string());
    }

    if let Some(ref cargo) = lideranca {
        for aluno in alunos.values_mut() {
            if aluno
                .get("lideranca_sala")
                .and_then(Value::as_str)
                .and_then(|valor| normalizar_lideranca_sala(Some(valor)))
                .as_deref()
                == Some(cargo.as_str())
            {
                if let Some(objeto) = aluno.as_object_mut() {
                    objeto.remove("lideranca_sala");
                }
            }
        }
    }

    let aluno = alunos
        .get_mut(&matricula)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Registro do aluno esta invalido.".to_string())?;
    match lideranca {
        Some(cargo) => {
            aluno.insert("lideranca_sala".to_string(), Value::String(cargo));
        }
        None => {
            aluno.remove("lideranca_sala");
        }
    }

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_educacao_especial_aluno(
    caminho: String,
    matricula: String,
    input: EducacaoEspecialAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let alunos = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Arquivo da turma sem lista de alunos valida.".to_string())?;
    let aluno = alunos
        .get_mut(&matricula)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;

    let deficiencias = normalizar_lista_deficiencias(&input.deficiencias);
    aluno.insert("deficiencias".to_string(), serde_json::json!(deficiencias));
    if !deficiencias.is_empty() {
        aluno.insert("elegivel_manual".to_string(), Value::Bool(true));
    }

    let comentario = input.comentario.trim();
    if comentario.is_empty() {
        aluno.remove("comentario_educacao_especial");
    } else {
        aluno.insert(
            "comentario_educacao_especial".to_string(),
            Value::String(comentario.to_string()),
        );
    }

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_responsaveis_aluno(
    caminho: String,
    matricula: String,
    input: ResponsaveisAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let aluno = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .and_then(|alunos| alunos.get_mut(matricula.trim()))
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;

    let responsaveis = normalizar_responsaveis(&input.responsaveis);
    if responsaveis.is_empty() {
        aluno.remove("responsaveis");
    } else {
        aluno.insert(
            "responsaveis".to_string(),
            serde_json::to_value(&responsaveis).map_err(|err| err.to_string())?,
        );
    }

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
pub(crate) fn salvar_atendimento_aluno(
    caminho: String,
    matricula: String,
    input: AtendimentoAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let _dados = travar_dados();
    let data = input.data.trim();
    if data.is_empty() {
        return Err("Informe a data do atendimento.".to_string());
    }
    let tipos = normalizar_lista_texto(&input.tipos);
    if tipos.is_empty() {
        return Err("Selecione ao menos um tipo de atendimento.".to_string());
    }
    let atendido = input.atendido.trim();
    if atendido.is_empty() {
        return Err("Informe quem foi atendido.".to_string());
    }
    if atendido != "aluno" && atendido != "responsavel" {
        return Err("Tipo de atendido invalido.".to_string());
    }
    let descricao = input.descricao.trim();
    if descricao.is_empty() {
        return Err("Descreva o atendimento realizado.".to_string());
    }
    let id_informado = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|valor| !valor.is_empty())
        .map(str::to_string);
    let parent_id = input
        .parent_id
        .as_deref()
        .map(str::trim)
        .filter(|valor| !valor.is_empty())
        .map(str::to_string);
    let tags = normalizar_lista_texto(&input.tags);
    let anexos = serde_json::to_value(input.anexos).map_err(|err| err.to_string())?;
    let agora = Local::now().to_rfc3339();

    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let aluno = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .and_then(|alunos| alunos.get_mut(matricula.trim()))
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;

    if !matches!(aluno.get("atendimentos"), Some(Value::Array(_))) {
        aluno.insert("atendimentos".to_string(), Value::Array(Vec::new()));
    }
    let atendimentos = aluno
        .get_mut("atendimentos")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Lista de atendimentos invalida.".to_string())?;

    let montar_registro = |id: String, criado_em: String, followups: Option<Value>| {
        let mut objeto = serde_json::Map::new();
        objeto.insert("id".to_string(), Value::String(id));
        objeto.insert("data".to_string(), Value::String(data.to_string()));
        objeto.insert("tipos".to_string(), serde_json::to_value(&tipos).unwrap_or(Value::Array(Vec::new())));
        objeto.insert("atendido".to_string(), Value::String(atendido.to_string()));
        objeto.insert("tags".to_string(), serde_json::to_value(&tags).unwrap_or(Value::Array(Vec::new())));
        objeto.insert("descricao".to_string(), Value::String(descricao.to_string()));
        objeto.insert("anexos".to_string(), anexos.clone());
        if let Some(followups) = followups {
            objeto.insert("followups".to_string(), followups);
        }
        objeto.insert("criado_em".to_string(), Value::String(criado_em));
        objeto.insert("atualizado_em".to_string(), Value::String(agora.clone()));
        Value::Object(objeto)
    };

    if let Some(parent_id) = parent_id {
        let atendimento = atendimentos
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(parent_id.as_str()))
            .ok_or_else(|| "Atendimento principal nao encontrado.".to_string())?;
        let atendimento_obj = atendimento
            .as_object_mut()
            .ok_or_else(|| "Registro de atendimento invalido.".to_string())?;
        if !matches!(atendimento_obj.get("followups"), Some(Value::Array(_))) {
            atendimento_obj.insert("followups".to_string(), Value::Array(Vec::new()));
        }
        let followups = atendimento_obj
            .get_mut("followups")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| "Timeline de follow-up invalida.".to_string())?;

        if let Some(id) = id_informado {
            let followup = followups
                .iter_mut()
                .find(|item| item.get("id").and_then(Value::as_str) == Some(id.as_str()))
                .ok_or_else(|| "Follow-up nao encontrado.".to_string())?;
            let criado_em = followup
                .get("criado_em")
                .and_then(Value::as_str)
                .unwrap_or(&agora)
                .to_string();
            *followup = montar_registro(id, criado_em, None);
        } else {
            followups.push(montar_registro(
                format!("followup-{}", Local::now().timestamp_millis()),
                agora.clone(),
                None,
            ));
        }
        atendimento_obj.insert("atualizado_em".to_string(), Value::String(agora.clone()));
    } else if let Some(id) = id_informado {
        let atendimento = atendimentos
            .iter_mut()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(id.as_str()))
            .ok_or_else(|| "Atendimento nao encontrado.".to_string())?;
        let criado_em = atendimento
            .get("criado_em")
            .and_then(Value::as_str)
            .unwrap_or(&agora)
            .to_string();
        let followups = atendimento
            .get("followups")
            .cloned()
            .or_else(|| Some(Value::Array(Vec::new())));
        *atendimento = montar_registro(id, criado_em, followups);
    } else {
        atendimentos.push(montar_registro(
            format!("atendimento-{}", Local::now().timestamp_millis()),
            agora.clone(),
            Some(Value::Array(Vec::new())),
        ));
    }

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command(async)]
pub(crate) fn carregar_relatorio_atendimentos() -> Result<RelatorioAtendimentosResultado, String> {
    let _dados = travar_dados();
    let turmas = carregar_turmas_com_caminho()?;
    let mut alunos_atendidos = Vec::new();
    let mut alunos_nao_atendidos = Vec::new();
    let mut eventos = Vec::new();
    let mut total_alunos_ativos = 0usize;
    let total_turmas = turmas.len();

    for (_, turma) in turmas {
        let turma_rotulo = rotulo_turma(&turma);
        let Some(alunos) = &turma.alunos else {
            continue;
        };

        for (matricula, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            total_alunos_ativos += 1;
            let nome = info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("Aluno sem nome")
                .to_string();
            let atendimentos = extrair_atendimentos_aluno(info);

            if atendimentos.is_empty() {
                alunos_nao_atendidos.push(RelatorioAtendimentoAlunoBasico {
                    turma: turma_rotulo.clone(),
                    matricula: matricula.clone(),
                    nome,
                });
                continue;
            }

            let mut tipos_aluno: BTreeMap<String, usize> = BTreeMap::new();
            let mut total_atendimentos_aluno = 0usize;
            let mut total_seguimentos = 0usize;

            for atendimento in &atendimentos {
                total_atendimentos_aluno += 1;
                registrar_evento_relatorio_atendimento(
                    &mut eventos,
                    &mut tipos_aluno,
                    &turma_rotulo,
                    matricula,
                    &nome,
                    &atendimento.data,
                    &atendimento.tipos,
                    &atendimento.tags,
                );

                for followup in &atendimento.followups {
                    total_atendimentos_aluno += 1;
                    total_seguimentos += 1;
                    registrar_evento_relatorio_atendimento(
                        &mut eventos,
                        &mut tipos_aluno,
                        &turma_rotulo,
                        matricula,
                        &nome,
                        &followup.data,
                        &followup.tipos,
                        &followup.tags,
                    );
                }
            }

            let mut tipos = tipos_aluno
                .into_iter()
                .map(|(nome, total)| RelatorioAtendimentoContagem { nome, total })
                .collect::<Vec<_>>();
            tipos.sort_by(|a, b| b.total.cmp(&a.total).then_with(|| a.nome.cmp(&b.nome)));

            alunos_atendidos.push(RelatorioAtendimentoAluno {
                turma: turma_rotulo.clone(),
                matricula: matricula.clone(),
                nome,
                atendimentos: total_atendimentos_aluno,
                casos: atendimentos.len(),
                seguimentos: total_seguimentos,
                tipos,
            });
        }
    }

    alunos_atendidos.sort_by(|a, b| {
        a.turma
            .cmp(&b.turma)
            .then_with(|| a.nome.cmp(&b.nome))
            .then_with(|| a.matricula.cmp(&b.matricula))
    });
    alunos_nao_atendidos.sort_by(|a, b| {
        a.turma
            .cmp(&b.turma)
            .then_with(|| a.nome.cmp(&b.nome))
            .then_with(|| a.matricula.cmp(&b.matricula))
    });
    eventos.sort_by(|a, b| {
        a.data
            .cmp(&b.data)
            .then_with(|| a.turma.cmp(&b.turma))
            .then_with(|| a.aluno.cmp(&b.aluno))
    });

    let total_atendimentos = eventos.len();
    Ok(RelatorioAtendimentosResultado {
        alunos_atendidos,
        alunos_nao_atendidos,
        eventos,
        total_turmas,
        total_alunos_ativos,
        total_atendimentos,
    })
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn registrar_evento_relatorio_atendimento(
    eventos: &mut Vec<RelatorioAtendimentoEvento>,
    tipos_aluno: &mut BTreeMap<String, usize>,
    turma: &str,
    matricula: &str,
    aluno: &str,
    data: &str,
    tipos: &[String],
    tags: &[String],
) {
    let tipos_normalizados = if tipos.is_empty() {
        vec!["Sem tipo".to_string()]
    } else {
        normalizar_lista_texto(tipos)
    };
    let tags_normalizadas = normalizar_lista_texto(tags);
    for tipo in &tipos_normalizados {
        *tipos_aluno.entry(tipo.clone()).or_insert(0) += 1;
    }
    eventos.push(RelatorioAtendimentoEvento {
        turma: turma.to_string(),
        matricula: matricula.to_string(),
        aluno: aluno.to_string(),
        data: data.to_string(),
        mes: mes_relatorio_atendimento(data),
        tipos: tipos_normalizados,
        tags: tags_normalizadas,
    });
}

pub(crate) fn mes_relatorio_atendimento(data: &str) -> String {
    if data.len() >= 7 {
        data[..7].to_string()
    } else {
        "Sem data".to_string()
    }
}

#[tauri::command]
pub(crate) fn salvar_finalizacao_conselho(
    caminho: String,
    bimestre: String,
    finalizacao: FinalizacaoConselhoInput,
) -> Result<FinalizacaoResultado, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    let ata = if finalizacao.gerar_ata {
        Some(gerar_documento_finalizacao(
            &dados,
            &bimestre,
            "atas",
            "ata",
            &finalizacao,
        )?)
    } else {
        None
    };
    let relatorio = if finalizacao.gerar_relatorio {
        Some(gerar_documento_finalizacao(
            &dados,
            &bimestre,
            "relatorios",
            "relatorio_professores",
            &finalizacao,
        )?)
    } else {
        None
    };

    aplicar_finalizacao_conselho(&mut dados, &bimestre, finalizacao)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(FinalizacaoResultado {
        turma: detalhar_turma(turma, &bimestre),
        ata: ata.map(|path| path.to_string_lossy().to_string()),
        relatorio: relatorio.map(|path| path.to_string_lossy().to_string()),
    })
}

pub(crate) fn aplicar_finalizacao_conselho(
    dados: &mut Value,
    bimestre: &str,
    finalizacao: FinalizacaoConselhoInput,
) -> Result<(), String> {
    let Some(dados_obj) = dados.as_object_mut() else {
        return Err("Arquivo da turma esta invalido.".to_string());
    };

    let textos_ata = dados_obj
        .entry("textos_ata")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(textos_ata) = textos_ata.as_object_mut() else {
        return Err("Campo textos_ata esta invalido.".to_string());
    };

    let mut texto_bimestre = serde_json::Map::new();
    texto_bimestre.insert("cabecalho".to_string(), Value::from(String::new()));
    texto_bimestre.insert(
        "corpo".to_string(),
        Value::from(finalizacao.texto.trim().to_string()),
    );
    textos_ata.insert(bimestre.to_string(), Value::Object(texto_bimestre));

    aplicar_tempo_conselho(dados, bimestre, finalizacao.tempo_segundos)?;
    let Some(dados_obj) = dados.as_object_mut() else {
        return Err("Arquivo da turma esta invalido.".to_string());
    };
    let conselhos = dados_obj
        .entry("conselhos")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(conselhos) = conselhos.as_object_mut() else {
        return Err("Campo conselhos esta invalido.".to_string());
    };

    let registro = conselhos
        .entry(bimestre.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(registro) = registro.as_object_mut() else {
        return Err("Registro do conselho esta invalido.".to_string());
    };
    registro.insert("gerar_ata".to_string(), Value::from(finalizacao.gerar_ata));
    registro.insert(
        "gerar_relatorio".to_string(),
        Value::from(finalizacao.gerar_relatorio),
    );
    // Data da finalização: alimenta o status por bimestre na lista de turmas e
    // desempata o merge de conselhos entre máquinas (sync e pendrive).
    registro.insert(
        "finalizado_em".to_string(),
        Value::from(Local::now().to_rfc3339()),
    );
    Ok(())
}

pub(crate) fn aplicar_tempo_conselho(
    dados: &mut Value,
    bimestre: &str,
    tempo_segundos: i64,
) -> Result<(), String> {
    let Some(dados_obj) = dados.as_object_mut() else {
        return Err("Arquivo da turma esta invalido.".to_string());
    };

    let conselhos = dados_obj
        .entry("conselhos")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(conselhos) = conselhos.as_object_mut() else {
        return Err("Campo conselhos esta invalido.".to_string());
    };

    let registro = conselhos
        .entry(bimestre.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(registro) = registro.as_object_mut() else {
        return Err("Registro do conselho esta invalido.".to_string());
    };
    registro.insert(
        "tempo_segundos".to_string(),
        Value::from(tempo_segundos.max(0)),
    );
    Ok(())
}

pub(crate) fn formatar_rotulo_turma_texto(valor: &str) -> String {
    let mut texto = valor.trim().to_string();
    let substituicoes = [
        ("1a SERIE", "1ª Série"),
        ("2a SERIE", "2ª Série"),
        ("3a SERIE", "3ª Série"),
        ("1A SERIE", "1ª Série"),
        ("2A SERIE", "2ª Série"),
        ("3A SERIE", "3ª Série"),
        ("1o ANO", "1º Ano"),
        ("2o ANO", "2º Ano"),
        ("3o ANO", "3º Ano"),
        ("4o ANO", "4º Ano"),
        ("5o ANO", "5º Ano"),
        ("6o ANO", "6º Ano"),
        ("7o ANO", "7º Ano"),
        ("8o ANO", "8º Ano"),
        ("9o ANO", "9º Ano"),
        ("PRE-ESCOLA", "Pré-escola"),
        ("BERCARIO", "Berçário"),
    ];
    for (antigo, novo) in substituicoes {
        texto = texto.replace(antigo, novo);
    }
    texto
}

pub(crate) fn aplicar_encaminhamentos(
    dados: &mut Value,
    matricula: &str,
    bimestre: &str,
    mut encaminhamentos: Vec<i64>,
) -> Result<(), String> {
    encaminhamentos.retain(|codigo| (1..=10).contains(codigo));
    encaminhamentos.sort_unstable();
    encaminhamentos.dedup();

    let aluno = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .and_then(|alunos| alunos.get_mut(matricula))
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;
    let Some(aluno_obj) = aluno.as_object_mut() else {
        return Err("Registro do aluno esta invalido.".to_string());
    };

    let por_bimestre = aluno_obj
        .entry("encaminhamentos_conselho")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(por_bimestre) = por_bimestre.as_object_mut() else {
        return Err("Campo encaminhamentos_conselho esta invalido.".to_string());
    };

    if encaminhamentos.is_empty() {
        por_bimestre.remove(bimestre);
    } else {
        por_bimestre.insert(
            bimestre.to_string(),
            Value::Array(encaminhamentos.into_iter().map(Value::from).collect()),
        );
    }
    Ok(())
}

pub(crate) fn aplicar_aluno_deliberado(
    dados: &mut Value,
    matricula: &str,
    bimestre: &str,
    deliberado: bool,
) -> Result<(), String> {
    let aluno = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .and_then(|alunos| alunos.get_mut(matricula))
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;
    let Some(aluno_obj) = aluno.as_object_mut() else {
        return Err("Registro do aluno esta invalido.".to_string());
    };

    let por_bimestre = aluno_obj
        .entry("deliberados_conselho")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(por_bimestre) = por_bimestre.as_object_mut() else {
        return Err("Campo deliberados_conselho esta invalido.".to_string());
    };

    if deliberado {
        por_bimestre.insert(bimestre.to_string(), Value::Bool(true));
    } else {
        por_bimestre.remove(bimestre);
    }
    Ok(())
}

pub(crate) fn aplicar_ajustes_media(
    dados: &mut Value,
    matricula: &str,
    bimestre: &str,
    ajustes: Vec<AjusteMediaInput>,
) -> Result<(), String> {
    let aluno = dados
        .get_mut("alunos")
        .and_then(Value::as_object_mut)
        .and_then(|alunos| alunos.get_mut(matricula))
        .ok_or_else(|| "Aluno nao encontrado na turma selecionada.".to_string())?;

    for ajuste in ajustes {
        let disciplina = ajuste.disciplina.trim();
        if disciplina.is_empty() {
            continue;
        }

        let Some(media_ajustada) = ajuste.media_ajustada else {
            remover_ajuste_media(aluno, bimestre, disciplina);
            continue;
        };

        if !(0.0..=10.0).contains(&media_ajustada) {
            return Err(format!(
                "Nota invalida em {disciplina}: use valores de 0 a 10."
            ));
        }

        let Some(aluno_obj) = aluno.as_object_mut() else {
            return Err("Registro do aluno esta invalido.".to_string());
        };

        let ajustes_por_bimestre = aluno_obj
            .entry("ajustes_medias_conselho")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(ajustes_por_bimestre) = ajustes_por_bimestre.as_object_mut() else {
            return Err("Campo ajustes_medias_conselho esta invalido.".to_string());
        };

        let ajustes_bimestre = ajustes_por_bimestre
            .entry(bimestre.to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        let Some(ajustes_bimestre) = ajustes_bimestre.as_object_mut() else {
            return Err("Campo de ajustes do bimestre esta invalido.".to_string());
        };

        let mut ajuste_salvo = serde_json::Map::new();
        ajuste_salvo.insert(
            "media_original".to_string(),
            ajuste
                .media_original
                .map(Value::from)
                .unwrap_or(Value::Null),
        );
        ajuste_salvo.insert("media_ajustada".to_string(), Value::from(media_ajustada));
        ajuste_salvo.insert(
            "observacao".to_string(),
            Value::from(ajuste.observacao.unwrap_or_default()),
        );
        ajustes_bimestre.insert(disciplina.to_string(), Value::Object(ajuste_salvo));
    }

    limpar_ajustes_vazios(aluno, bimestre);
    Ok(())
}

pub(crate) fn remover_ajuste_media(aluno: &mut Value, bimestre: &str, disciplina: &str) {
    let Some(ajustes_bimestre) = aluno
        .get_mut("ajustes_medias_conselho")
        .and_then(Value::as_object_mut)
        .and_then(|por_bimestre| por_bimestre.get_mut(bimestre))
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    ajustes_bimestre.remove(disciplina);
}

pub(crate) fn limpar_ajustes_vazios(aluno: &mut Value, bimestre: &str) {
    let Some(por_bimestre) = aluno
        .get_mut("ajustes_medias_conselho")
        .and_then(Value::as_object_mut)
    else {
        return;
    };

    let bimestre_vazio = por_bimestre
        .get(bimestre)
        .and_then(Value::as_object)
        .map(|ajustes| ajustes.is_empty())
        .unwrap_or(false);
    if bimestre_vazio {
        por_bimestre.remove(bimestre);
    }
}

pub(crate) fn validar_conflito_sala(
    ano: i64,
    periodo: &str,
    sala: &str,
    ignorar_caminho: Option<&Path>,
) -> Result<(), String> {
    let sala_norm = normalizar_chave(sala);
    let periodo_norm = normalizar_chave(periodo);
    if sala_norm.is_empty() || periodo_norm.is_empty() {
        return Ok(());
    }

    let turmas = carregar_turmas_com_caminho()?;
    for (caminho, turma) in turmas {
        if turma.ano != ano {
            continue;
        }
        if let Some(ignorar) = ignorar_caminho {
            if !caminhos_diferentes(&caminho, ignorar) {
                continue;
            }
        }
        let mesma_sala = turma
            .sala
            .as_deref()
            .map(normalizar_chave)
            .unwrap_or_default()
            == sala_norm;
        let mesmo_periodo = turma
            .periodo
            .as_deref()
            .map(normalizar_chave)
            .unwrap_or_default()
            == periodo_norm;
        if mesma_sala && mesmo_periodo {
            return Err(format!(
                "A sala {sala} ja esta ocupada no periodo {periodo} por {}.",
                turma.codigo
            ));
        }
    }
    Ok(())
}

pub(crate) fn normalizar_chave(valor: &str) -> String {
    valor
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-' && *c != '_')
        .flat_map(char::to_lowercase)
        .collect::<String>()
}

pub(crate) fn raiz_turmas() -> Result<PathBuf, String> {
    let raiz = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos");
    fs::create_dir_all(&raiz).map_err(|err| err.to_string())?;
    Ok(raiz)
}

/// Garante que um caminho recebido do front-end aponta para dentro da pasta de
/// turmas (dados/persistidos). Protege os comandos contra leitura/escrita fora
/// da área de dados caso o caminho seja manipulado.
pub(crate) fn validar_caminho_turma(caminho: &Path) -> Result<(), String> {
    garantir_caminho_em_pasta(caminho, &raiz_turmas()?)
}

/// Garante que um caminho recebido do front-end aponta para dentro da pasta de
/// dados do aplicativo (atas, relatórios, anexos, etc.).
pub(crate) fn validar_caminho_em_dados(caminho: &Path) -> Result<(), String> {
    let base = data_dir().map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?;
    fs::create_dir_all(&base).map_err(|err| err.to_string())?;
    garantir_caminho_em_pasta(caminho, &base)
}

pub(crate) fn garantir_caminho_em_pasta(caminho: &Path, pasta: &Path) -> Result<(), String> {
    let pasta = pasta.canonicalize().map_err(|err| err.to_string())?;
    let alvo = if caminho.exists() {
        caminho.canonicalize().map_err(|err| err.to_string())?
    } else {
        let pai = caminho
            .parent()
            .ok_or_else(|| "Caminho invalido.".to_string())?
            .canonicalize()
            .map_err(|err| err.to_string())?;
        pai.join(caminho.file_name().unwrap_or_default())
    };
    if alvo.starts_with(&pasta) {
        Ok(())
    } else {
        Err("Caminho da turma fora da pasta de dados.".to_string())
    }
}

pub(crate) fn carregar_turmas_com_caminho() -> Result<Vec<(PathBuf, TurmaArquivo)>, String> {
    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let mut turmas = Vec::new();
    visitar_jsons_turma_com_dados(&pasta, &mut turmas)?;
    Ok(turmas)
}

pub(crate) fn visitar_jsons_turma_com_dados(
    pasta: &Path,
    turmas: &mut Vec<(PathBuf, TurmaArquivo)>,
) -> Result<(), String> {
    for entrada in fs::read_dir(pasta).map_err(|err| err.to_string())? {
        let entrada = entrada.map_err(|err| err.to_string())?;
        let caminho = entrada.path();
        if caminho.is_dir() {
            visitar_jsons_turma_com_dados(&caminho, turmas)?;
            continue;
        }
        let Some(nome) = caminho.file_name().and_then(|valor| valor.to_str()) else {
            continue;
        };
        if !nome.starts_with("turma_") || !nome.ends_with(".json") {
            continue;
        }
        if eh_copia_de_conflito_sync(&caminho) {
            continue;
        }
        let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
        let turma: TurmaArquivo = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        turmas.push((caminho, turma));
    }
    Ok(())
}

pub(crate) fn indice_alunos_por_nome(
    turmas: &[(PathBuf, TurmaArquivo)],
) -> BTreeMap<String, Vec<(usize, String)>> {
    let mut indice: BTreeMap<String, Vec<(usize, String)>> = BTreeMap::new();
    for (turma_idx, (_, turma)) in turmas.iter().enumerate() {
        if let Some(alunos) = &turma.alunos {
            for (matricula, info) in alunos {
                if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                    continue;
                }
                if let Some(nome) = info.get("nome").and_then(Value::as_str) {
                    indice
                        .entry(normalizar_nome_busca(nome))
                        .or_default()
                        .push((turma_idx, matricula.clone()));
                }
            }
        }
    }
    indice
}

/// Espelho de indice_alunos_por_nome, chaveado pelas variantes de matrícula
/// (ver importador_alunos::variantes_matricula) em vez do nome normalizado.
/// Só alunos ATIVOS: a mesma matrícula aparece em mais de um arquivo de
/// turma quando o aluno é transferido — a cópia antiga fica ativo:false.
/// Sem esse filtro, uma importação por RA pode gravar no registro morto e o
/// dado nunca aparece nos relatórios.
pub(crate) fn indice_alunos_por_ra(
    turmas: &[(PathBuf, TurmaArquivo)],
) -> BTreeMap<String, Vec<(usize, String)>> {
    let mut indice: BTreeMap<String, Vec<(usize, String)>> = BTreeMap::new();
    for (turma_idx, (_, turma)) in turmas.iter().enumerate() {
        if let Some(alunos) = &turma.alunos {
            for (matricula, info) in alunos {
                if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                    continue;
                }
                for variante in variantes_matricula(matricula) {
                    indice
                        .entry(variante)
                        .or_default()
                        .push((turma_idx, matricula.clone()));
                }
            }
        }
    }
    for candidatos in indice.values_mut() {
        candidatos.dedup();
    }
    indice
}

/// Forma reduzida da matrícula usada só pra decidir "é o mesmo aluno" —
/// mesma normalização de variantes_matricula (alnum + maiúsculas + sem
/// zeros à esquerda), sem gerar todas as variantes: aqui cada aluno só
/// precisa de UMA chave de identidade, não um índice de busca.
fn identidade_matricula(matricula: &str) -> String {
    normalizar_matricula_elegiveis(matricula.to_string()).trim_start_matches('0').to_string()
}

pub(crate) struct CasoMultiplasTurmas {
    pub(crate) matricula_identidade: String,
    pub(crate) nome: String,
    pub(crate) turmas: Vec<String>,
}

/// Alunos ativos (`ativo != false`) na mesma matrícula em mais de uma
/// turma ao mesmo tempo — sinal de transferência mal feita (a matrícula
/// antiga não foi desativada na turma de origem). Usada pelo diagnóstico
/// do Dashboard (diagnosticos.rs); não decide sozinha qual turma é a
/// certa, só relata.
pub(crate) fn detectar_alunos_multiplas_turmas(turmas: &[(PathBuf, TurmaArquivo)]) -> Vec<CasoMultiplasTurmas> {
    let mut grupos: BTreeMap<String, Vec<(usize, String)>> = BTreeMap::new();
    for (turma_idx, (_, turma)) in turmas.iter().enumerate() {
        let Some(alunos) = &turma.alunos else { continue };
        for (matricula, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            let identidade = identidade_matricula(matricula);
            if identidade.is_empty() {
                continue;
            }
            let nome = info.get("nome").and_then(Value::as_str).unwrap_or("").to_string();
            grupos.entry(identidade).or_default().push((turma_idx, nome));
        }
    }

    let mut casos = Vec::new();
    for (identidade, entradas) in grupos {
        let turma_idxs: BTreeSet<usize> = entradas.iter().map(|(idx, _)| *idx).collect();
        if turma_idxs.len() < 2 {
            continue;
        }
        let nome = entradas.first().map(|(_, n)| n.clone()).unwrap_or_default();
        let turmas_codigos: Vec<String> =
            turma_idxs.iter().filter_map(|idx| turmas.get(*idx).map(|(_, t)| t.codigo.clone())).collect();
        casos.push(CasoMultiplasTurmas { matricula_identidade: identidade, nome, turmas: turmas_codigos });
    }
    casos
}

pub(crate) fn visitar_jsons_turma(pasta: &PathBuf, turmas: &mut Vec<TurmaResumo>) -> Result<(), String> {
    for entrada in fs::read_dir(pasta).map_err(|err| err.to_string())? {
        let entrada = entrada.map_err(|err| err.to_string())?;
        let caminho = entrada.path();
        if caminho.is_dir() {
            visitar_jsons_turma(&caminho, turmas)?;
            continue;
        }

        let Some(nome) = caminho.file_name().and_then(|valor| valor.to_str()) else {
            continue;
        };
        if !nome.starts_with("turma_") || !nome.ends_with(".json") {
            continue;
        }
        if eh_copia_de_conflito_sync(&caminho) {
            continue;
        }

        let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
        let turma: TurmaArquivo = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        turmas.push(resumir_turma(turma, caminho));
    }
    Ok(())
}

pub(crate) fn resumir_turma(turma: TurmaArquivo, caminho: PathBuf) -> TurmaResumo {
    // Bimestre -> data da finalização ("" para registros antigos, sem data).
    let conselhos_finalizados: BTreeMap<String, String> = turma
        .conselhos
        .as_ref()
        .map(|conselhos| {
            conselhos
                .iter()
                .filter(|(_, registro)| conselho_foi_finalizado(registro))
                .map(|(bimestre, registro)| {
                    let data = registro
                        .get("finalizado_em")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    (bimestre.clone(), data)
                })
                .collect()
        })
        .unwrap_or_default();
    let conselho_finalizado = !conselhos_finalizados.is_empty();
    let alunos = turma.alunos.unwrap_or_default();
    let total_alunos = alunos.len();
    let mut alunos_ativos = 0;
    let mut alunos_elegiveis = 0;
    let mut conselhos_com_ajustes = 0;
    let mut lider_sala = None;
    let mut vice_lider_sala = None;
    let mut nomes_alunos = Vec::new();

    for info in alunos.values() {
        let ativo = info.get("ativo").and_then(Value::as_bool).unwrap_or(true);
        if ativo {
            alunos_ativos += 1;
            if let Some(nome) = info.get("nome").and_then(Value::as_str) {
                if !nome.trim().is_empty() {
                    nomes_alunos.push(nome.trim().to_string());
                }
            }
        }

        let elegivel = info
            .get("elegivel_manual")
            .and_then(Value::as_bool)
            .unwrap_or_else(|| aluno_tem_deficiencias(info));
        if elegivel {
            alunos_elegiveis += 1;
        }

        if ativo {
            let nome = info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            match normalizar_lideranca_sala(info.get("lideranca_sala").and_then(Value::as_str)) {
                Some(cargo) if cargo == "lider" && lider_sala.is_none() => lider_sala = Some(nome),
                Some(cargo) if cargo == "vice" && vice_lider_sala.is_none() => {
                    vice_lider_sala = Some(nome)
                }
                _ => {}
            }
        }

        let tem_ajustes = info
            .get("ajustes_medias_conselho")
            .and_then(Value::as_object)
            .map(|por_bimestre| {
                por_bimestre.values().any(|valor| {
                    valor
                        .as_object()
                        .map(|ajustes| !ajustes.is_empty())
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        if tem_ajustes {
            conselhos_com_ajustes += 1;
        }
    }
    nomes_alunos.sort();

    TurmaResumo {
        codigo: formatar_rotulo_turma_texto(&turma.codigo),
        ano: turma.ano,
        serie: turma.serie.map(|serie| formatar_rotulo_turma_texto(&serie)),
        sala: turma.sala,
        periodo: turma.periodo,
        ciclo: turma.ciclo,
        coordenador_turma: turma.coordenador_turma,
        pei_coordenador_gestao: turma.pei_coordenador_gestao,
        pei_prof_especializado: turma.pei_prof_especializado,
        pei_direcao: turma.pei_direcao,
        lider_sala,
        vice_lider_sala,
        total_alunos,
        alunos_ativos,
        alunos_elegiveis,
        nomes_alunos,
        conselhos_com_ajustes,
        conselho_finalizado,
        conselhos_finalizados,
        // Preenchido em listar_turmas, que cruza com o registro de check-outs.
        em_conselho_externo: Vec::new(),
        caminho: caminho.to_string_lossy().to_string(),
    }
}

pub(crate) fn conselho_foi_finalizado(registro: &Value) -> bool {
    let ata = registro
        .get("gerar_ata")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let relatorio = registro
        .get("gerar_relatorio")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    ata && relatorio
}

pub(crate) fn aluno_tem_deficiencias(info: &Value) -> bool {
    info.get("deficiencias")
        .and_then(Value::as_array)
        .map(|valores| !valores.is_empty())
        .unwrap_or(false)
}

pub(crate) fn normalizar_lideranca_sala(valor: Option<&str>) -> Option<String> {
    match valor.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "lider" | "líder" => Some("lider".to_string()),
        "vice" | "vice_lider" | "vice-lider" | "vice líder" | "vice lider" => {
            Some("vice".to_string())
        }
        _ => None,
    }
}

pub(crate) fn detalhar_turma(turma: TurmaArquivo, bimestre: &str) -> TurmaDetalhe {
    let bimestre = normalizar_bimestre(bimestre);
    let carga_horaria = turma.carga_horaria.clone().unwrap_or_default();
    let texto_ata = texto_ata_para_turma(&turma, &bimestre);
    let tempo_conselho_segundos = turma
        .conselhos
        .as_ref()
        .and_then(|por_bimestre| por_bimestre.get(&bimestre))
        .and_then(|registro| registro.get("tempo_segundos"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let alunos = turma.alunos.unwrap_or_default();
    let mut alunos_detalhe = Vec::new();

    for (matricula, info) in alunos {
        // Mantemos os inativos na lista (marcados), e o frontend decide exibi-los ou não.
        let ativo = info.get("ativo").and_then(Value::as_bool).unwrap_or(true);

        let nome = info
            .get("nome")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let numero_chamada = info.get("numero_chamada").and_then(Value::as_i64);
        let elegivel = info
            .get("elegivel_manual")
            .and_then(Value::as_bool)
            .unwrap_or_else(|| aluno_tem_deficiencias(&info));
        let lideranca_sala =
            normalizar_lideranca_sala(info.get("lideranca_sala").and_then(Value::as_str));
        let deficiencias = info
            .get("deficiencias")
            .and_then(Value::as_array)
            .map(|lista| {
                lista
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .map(|lista| normalizar_lista_deficiencias(&lista))
            .unwrap_or_default();
        let comentario_educacao_especial = info
            .get("comentario_educacao_especial")
            .and_then(Value::as_str)
            .map(str::to_string);
        let frequencia_percentual = info.get("frequencia_percentual").and_then(valor_para_f64);

        alunos_detalhe.push(AlunoDetalhe {
            matricula,
            nome,
            ativo,
            numero_chamada,
            elegivel,
            lideranca_sala,
            deficiencias,
            comentario_educacao_especial,
            frequencia_percentual,
            encaminhamentos: extrair_encaminhamentos(&info, &bimestre),
            encaminhamentos_bimestres: extrair_encaminhamentos_bimestres(&info),
            deliberado: extrair_aluno_deliberado(&info, &bimestre),
            atendimentos: extrair_atendimentos_aluno(&info),
            responsaveis: extrair_responsaveis_aluno(&info),
            diagnostico_aprendizagem: extrair_diagnostico_aprendizagem(&info),
            disciplinas: extrair_disciplinas(&info, &bimestre, &carga_horaria),
        });
    }

    alunos_detalhe.sort_by(|a, b| {
        (
            a.numero_chamada.unwrap_or(i64::MAX),
            a.nome.clone(),
            a.matricula.clone(),
        )
            .cmp(&(
                b.numero_chamada.unwrap_or(i64::MAX),
                b.nome.clone(),
                b.matricula.clone(),
            ))
    });

    TurmaDetalhe {
        codigo: turma.codigo,
        ano: turma.ano,
        coordenador_turma: turma.coordenador_turma,
        bimestre,
        tempo_conselho_segundos,
        texto_ata,
        alunos: alunos_detalhe,
    }
}

pub(crate) fn normalizar_bimestre(bimestre: &str) -> String {
    match bimestre.trim() {
        "2" => "2".to_string(),
        "3" => "3".to_string(),
        "4" => "4".to_string(),
        _ => "1".to_string(),
    }
}

pub(crate) fn extrair_atendimentos_aluno(info: &Value) -> Vec<AtendimentoAluno> {
    let mut atendimentos = info
        .get("atendimentos")
        .and_then(Value::as_array)
        .map(|lista| {
            lista
                .iter()
                .filter_map(|item| serde_json::from_value::<AtendimentoAluno>(item.clone()).ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for atendimento in &mut atendimentos {
        atendimento.followups.sort_by(|a, b| {
            (
                a.data.clone(),
                a.criado_em.clone().unwrap_or_default(),
            )
                .cmp(&(
                    b.data.clone(),
                    b.criado_em.clone().unwrap_or_default(),
                ))
        });
    }
    atendimentos.sort_by(|a, b| {
        (
            std::cmp::Reverse(a.data.clone()),
            std::cmp::Reverse(a.criado_em.clone().unwrap_or_default()),
        )
            .cmp(&(
                std::cmp::Reverse(b.data.clone()),
                std::cmp::Reverse(b.criado_em.clone().unwrap_or_default()),
            ))
    });
    atendimentos
}

pub(crate) fn extrair_responsaveis_aluno(info: &Value) -> Vec<Responsavel> {
    info.get("responsaveis")
        .and_then(Value::as_array)
        .map(|lista| {
            lista
                .iter()
                .filter_map(|item| serde_json::from_value::<Responsavel>(item.clone()).ok())
                .collect::<Vec<_>>()
        })
        .map(|lista| normalizar_responsaveis(&lista))
        .unwrap_or_default()
}

/// Limpa a lista vinda da UI: apara os campos, guarda o telefone só com
/// dígitos, força `parentesco` para um dos três valores conhecidos, descarta
/// entradas totalmente vazias e mantém no máximo dois responsáveis.
pub(crate) fn normalizar_responsaveis(lista: &[Responsavel]) -> Vec<Responsavel> {
    lista
        .iter()
        .map(|responsavel| {
            let parentesco = match responsavel.parentesco.trim().to_lowercase().as_str() {
                "mae" | "mãe" => "mae",
                "pai" => "pai",
                _ => "outro",
            }
            .to_string();
            let telefone: String = responsavel
                .telefone
                .chars()
                .filter(char::is_ascii_digit)
                .collect();
            let parentesco_desc = responsavel
                .parentesco_desc
                .as_deref()
                .map(str::trim)
                .filter(|texto| !texto.is_empty() && parentesco == "outro")
                .map(str::to_string);
            Responsavel {
                nome: responsavel.nome.trim().to_string(),
                parentesco,
                parentesco_desc,
                telefone,
            }
        })
        .filter(|responsavel| !responsavel.nome.is_empty() || !responsavel.telefone.is_empty())
        .take(2)
        .collect()
}

pub(crate) fn extrair_encaminhamentos(info: &Value, bimestre: &str) -> Vec<i64> {
    let mut codigos = info
        .get("encaminhamentos_conselho")
        .and_then(Value::as_object)
        .and_then(|por_bimestre| por_bimestre.get(bimestre))
        .and_then(Value::as_array)
        .map(|valores| valores.iter().filter_map(Value::as_i64).collect::<Vec<_>>())
        .unwrap_or_default();

    codigos.sort_unstable();
    codigos.dedup();
    codigos
}

pub(crate) fn extrair_encaminhamentos_bimestres(info: &Value) -> Vec<EncaminhamentosBimestre> {
    ["1", "2", "3", "4"]
        .into_iter()
        .map(|periodo| EncaminhamentosBimestre {
            bimestre: periodo.to_string(),
            codigos: extrair_encaminhamentos(info, periodo),
        })
        .collect()
}

pub(crate) fn extrair_aluno_deliberado(info: &Value, bimestre: &str) -> bool {
    info.get("deliberados_conselho")
        .and_then(Value::as_object)
        .and_then(|por_bimestre| por_bimestre.get(bimestre))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub(crate) fn extrair_diagnostico_aprendizagem(info: &Value) -> Option<DiagnosticoAprendizagem> {
    let dados = info.get("diagnostico_aprendizagem")?.as_object()?;
    let texto = |chave: &str| dados.get(chave).and_then(Value::as_str).map(str::to_string);
    Some(DiagnosticoAprendizagem {
        turma_origem: texto("turma_origem"),
        cd_escola: texto("cd_escola"),
        cd_diretoria: texto("cd_diretoria"),
        portugues: extrair_diagnostico_componente(dados.get("portugues")),
        matematica: extrair_diagnostico_componente(dados.get("matematica")),
        atualizado_em: texto("atualizado_em"),
    })
}

/// Lê um componente do diagnóstico. Formato novo: sub-objetos `avd1`/`avd2`
/// (`{nivel, aprendizagem_equivalente}` ou `null`) + `evolucao`. Formato
/// legado: `status`/`aprendizagem_equivalente` planos direto no componente.
/// O valor "corrente" (status/aprendizagem_equivalente) que as telas usam é
/// a AvD2 quando existe, senão a AvD1; "Não mensurado" quando o aluno não
/// fez nenhuma das duas.
pub(crate) fn extrair_diagnostico_componente(valor: Option<&Value>) -> DiagnosticoComponente {
    let objeto = valor.and_then(Value::as_object);
    let texto = |chave: &str| {
        objeto
            .and_then(|dados| dados.get(chave))
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    let onda = |chave: &str| -> (Option<String>, Option<String>) {
        let obj = objeto.and_then(|dados| dados.get(chave)).and_then(Value::as_object);
        (
            obj.and_then(|o| o.get("nivel")).and_then(Value::as_str).map(str::to_string),
            obj.and_then(|o| o.get("aprendizagem_equivalente"))
                .and_then(Value::as_str)
                .map(str::to_string),
        )
    };

    let tem_ondas = objeto
        .map(|o| o.contains_key("avd1") || o.contains_key("avd2"))
        .unwrap_or(false);
    if !tem_ondas {
        let status = texto("status");
        return DiagnosticoComponente {
            aprendizagem_equivalente: texto("aprendizagem_equivalente"),
            mensurado: status.is_some(),
            status,
            nivel_avd1: None,
            equivalente_avd1: None,
            nivel_avd2: None,
            equivalente_avd2: None,
            evolucao: None,
        };
    }

    let (nivel_avd1, equivalente_avd1) = onda("avd1");
    let (nivel_avd2, equivalente_avd2) = onda("avd2");
    let mensurado = nivel_avd1.is_some() || nivel_avd2.is_some();
    let status = nivel_avd2
        .clone()
        .or_else(|| nivel_avd1.clone())
        .or_else(|| (!mensurado).then(|| "Não mensurado".to_string()));
    DiagnosticoComponente {
        aprendizagem_equivalente: equivalente_avd2.clone().or_else(|| equivalente_avd1.clone()),
        status,
        nivel_avd1,
        equivalente_avd1,
        nivel_avd2,
        equivalente_avd2,
        evolucao: texto("evolucao"),
        mensurado,
    }
}

pub(crate) fn extrair_disciplinas(
    info: &Value,
    bimestre: &str,
    carga_horaria: &serde_json::Map<String, Value>,
) -> Vec<DisciplinaDetalhe> {
    let medias = objeto_bimestre(info, "medias", bimestre);
    let frequencia = objeto_bimestre(info, "frequencia", bimestre);
    let ajustes = objeto_bimestre(info, "ajustes_medias_conselho", bimestre);
    let medias_5c = objeto_bimestre(info, "medias", "5C");
    let aulas = carga_horaria.get(bimestre).and_then(Value::as_object);
    let mut nomes = BTreeSet::new();

    for mapa in [medias, frequencia, ajustes, aulas, medias_5c]
        .into_iter()
        .flatten()
    {
        for nome in mapa.keys() {
            // Agrupa por grafia normalizada: grafias antigas (ex.: "Orientação
            // de Estudo - Matemática" vs sem hífen), enquanto não passam pela
            // "Manutenção de dados", não devem virar duas linhas na tela.
            nomes.insert(normalizar_texto_basico(nome));
        }
    }

    let mut disciplinas = nomes
        .into_iter()
        .map(|nome| {
            let entrada_media = valor_disciplina(medias, &nome);
            let media_original = entrada_media.and_then(valor_para_f64);
            let atribuicao_media = entrada_media.and_then(extrair_atribuicao);
            let faltas = valor_disciplina(frequencia, &nome).and_then(valor_para_f64);
            let media_conselho = valor_disciplina(ajustes, &nome)
                .and_then(|ajuste| ajuste.get("media_ajustada"))
                .and_then(valor_para_f64);
            let observacao_conselho = valor_disciplina(ajustes, &nome)
                .and_then(|ajuste| ajuste.get("observacao"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let quinto_conceito =
                valor_disciplina(medias_5c, &nome).and_then(valor_para_f64);
            let total_aulas = valor_disciplina(aulas, &nome).and_then(valor_para_f64);
            let mut faltas_acumuladas = 0.0;
            let mut total_aulas_acumuladas = 0.0;
            for periodo in ["1", "2", "3", "4"] {
                if let Some(valor) =
                    valor_disciplina(objeto_bimestre(info, "frequencia", periodo), &nome)
                        .and_then(valor_para_f64)
                {
                    faltas_acumuladas += valor;
                }
                if let Some(valor) = valor_disciplina(
                    carga_horaria.get(periodo).and_then(Value::as_object),
                    &nome,
                )
                .and_then(valor_para_f64)
                {
                    total_aulas_acumuladas += valor;
                }
            }
            let media_efetiva = media_conselho.or(media_original);
            let historico_bimestres = ["1", "2", "3", "4"]
                .into_iter()
                .filter_map(|periodo| {
                    let media_periodo = valor_disciplina(
                        objeto_bimestre(info, "ajustes_medias_conselho", periodo),
                        &nome,
                    )
                    .and_then(|ajuste| ajuste.get("media_ajustada"))
                    .and_then(valor_para_f64)
                    .or_else(|| {
                        valor_disciplina(objeto_bimestre(info, "medias", periodo), &nome)
                            .and_then(valor_para_f64)
                    })?;
                    Some(NotaBimestre {
                        bimestre: periodo.to_string(),
                        media: media_periodo,
                    })
                })
                .collect::<Vec<_>>();

            let situacao = if media_efetiva.is_none() {
                "sem-nota"
            } else if media_efetiva.unwrap_or(0.0) < 5.0 {
                "abaixo"
            } else if media_efetiva.unwrap_or(0.0) == 5.0 {
                "cuidado"
            } else if media_conselho.is_some() {
                "ajustada"
            } else {
                "adequada"
            }
            .to_string();

            DisciplinaDetalhe {
                nome,
                media_original,
                media_conselho,
                quinto_conceito,
                observacao_conselho,
                faltas,
                total_aulas,
                faltas_acumuladas: (total_aulas_acumuladas > 0.0).then_some(faltas_acumuladas),
                total_aulas_acumuladas: (total_aulas_acumuladas > 0.0)
                    .then_some(total_aulas_acumuladas),
                historico_bimestres,
                situacao,
                atribuicao_media,
            }
        })
        .collect::<Vec<_>>();

    disciplinas.sort_by(|a, b| a.nome.cmp(&b.nome));
    disciplinas
}

// Busca uma disciplina no mapa (medias/frequencia/carga_horaria de um
// bimestre) primeiro pela grafia exata; se não achar, cai para comparação
// normalizada (ignora acento, caixa, hífen e espaços repetidos). `nome` já
// vem normalizado de extrair_disciplinas. Protege as telas de resíduos
// pré-normalização que ainda não passaram pela "Manutenção de dados" — sem
// isso, "Orientação de Estudo - Matemática" e "Orientação de Estudo
// Matemática" apareciam como duas linhas.
pub(crate) fn valor_disciplina<'a>(
    mapa: Option<&'a serde_json::Map<String, Value>>,
    nome: &str,
) -> Option<&'a Value> {
    let mapa = mapa?;
    if let Some(valor) = mapa.get(nome) {
        return Some(valor);
    }
    mapa.iter()
        .find(|(chave, _)| normalizar_texto_basico(chave) == nome)
        .map(|(_, valor)| valor)
}

pub(crate) fn objeto_bimestre<'a>(
    info: &'a Value,
    campo: &str,
    bimestre: &str,
) -> Option<&'a serde_json::Map<String, Value>> {
    info.get(campo)
        .and_then(Value::as_object)
        .and_then(|por_bimestre| por_bimestre.get(bimestre))
        .and_then(Value::as_object)
}

// ── PEI ──────────────────────────────────────────────────────────────────────
