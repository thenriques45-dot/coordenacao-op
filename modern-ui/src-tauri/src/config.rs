#![allow(unused_imports)]

// Configurações do aplicativo, perfil de turma, alunos destaque e cabeçalho da ata.
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


#[tauri::command]
pub(crate) fn app_info() -> AppInfo {
    let data_dir = data_dir()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| String::new());

    AppInfo {
        name: "CoordenacaoOP",
        stage: "modern-ui-prototype",
        version: env!("CARGO_PKG_VERSION"),
        data_dir,
    }
}

#[tauri::command]
pub(crate) fn carregar_configuracoes() -> Result<ConfiguracoesApp, String> {
    Ok(ler_configuracoes())
}

#[tauri::command]
pub(crate) fn salvar_configuracoes(input: ConfiguracoesInput) -> Result<ConfiguracoesApp, String> {
    let _dados = travar_dados();
    if input.nota_minima < 0.0 || input.nota_minima > 10.0 {
        return Err("A media minima deve ficar entre 0 e 10.".to_string());
    }
    let pronome = input.direcao_pronome.trim().to_uppercase();
    if pronome != "F" && pronome != "M" {
        return Err("Selecione o pronome da direcao.".to_string());
    }

    let lider_rotulo = {
        let r = input.lider_rotulo.trim();
        if r.is_empty() { "Líder de sala".to_string() } else { r.to_string() }
    };
    let elegivel_rotulo = {
        let r = input.elegivel_rotulo.trim();
        if r.is_empty() { "Elegível".to_string() } else { r.to_string() }
    };

    let atendimento_tipos = normalizar_lista_texto(&input.atendimento_tipos);
    let atendimento_tipos = if atendimento_tipos.is_empty() {
        atendimento_tipos_padrao()
    } else {
        atendimento_tipos
    };

    let config = ConfiguracoesApp {
        direcao_nome: input.direcao_nome.trim().to_uppercase(),
        direcao_pronome: pronome,
        nota_minima: input.nota_minima,
        cabecalho_ata: caminho_cabecalho_ata().map(|path| path.to_string_lossy().to_string()),
        lider_ativo: input.lider_ativo,
        lider_rotulo,
        elegivel_ativo: input.elegivel_ativo,
        elegivel_rotulo,
        atendimento_tipos,
        perfil_turma_ativo: input.perfil_turma_ativo,
        perfil_turma_criterios: if input.perfil_turma_criterios.is_empty() {
            criterios_perfil_padrao()
        } else {
            input.perfil_turma_criterios
        },
        aluno_destaque_ativo: input.aluno_destaque_ativo,
        aluno_destaque_criterios: input.aluno_destaque_criterios,
    };
    salvar_configuracoes_arquivo(&config)?;
    Ok(config)
}

#[tauri::command]
pub(crate) fn carregar_perfil_turma(caminho: String, bimestre: String) -> Result<Value, String> {
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let apontamentos = dados
        .get("perfil_turma")
        .and_then(|pt| pt.get(&bimestre))
        .cloned()
        .unwrap_or(Value::Object(serde_json::Map::new()));
    Ok(apontamentos)
}

#[tauri::command]
pub(crate) fn salvar_perfil_turma(caminho: String, bimestre: String, apontamentos: Value) -> Result<(), String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    {
        let perfil_turma = dados
            .as_object_mut()
            .ok_or_else(|| "Arquivo da turma inválido.".to_string())?
            .entry("perfil_turma")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if let Some(obj) = perfil_turma.as_object_mut() {
            obj.insert(bimestre, apontamentos);
        }
    }
    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn carregar_alunos_destaque(caminho: String, bimestre: String) -> Result<Value, String> {
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let nomes = dados
        .get("alunos_destaque")
        .and_then(|pt| pt.get(&bimestre))
        .cloned()
        .unwrap_or(Value::Object(serde_json::Map::new()));
    Ok(nomes)
}

#[tauri::command]
pub(crate) fn salvar_alunos_destaque(caminho: String, bimestre: String, nomes: Value) -> Result<(), String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    {
        let alunos_destaque = dados
            .as_object_mut()
            .ok_or_else(|| "Arquivo da turma inválido.".to_string())?
            .entry("alunos_destaque")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if let Some(obj) = alunos_destaque.as_object_mut() {
            obj.insert(bimestre, nomes);
        }
    }
    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) fn salvar_cabecalho_ata(input: ImagemCabecalhoInput) -> Result<ConfiguracoesApp, String> {
    let _dados = travar_dados();
    let extensao = extensao_imagem_cabecalho(&input.nome).ok_or_else(|| {
        "Selecione uma imagem JPG, JPEG ou PNG para o cabeçalho da ata.".to_string()
    })?;
    if input.bytes.is_empty() {
        return Err("A imagem selecionada está vazia.".to_string());
    }
    let pasta = data_dir().map_err(|err| err.to_string())?.join("imagens");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    for ext in ["jpg", "jpeg", "png"] {
        let _ = fs::remove_file(pasta.join(format!("cabecalho_ata.{ext}")));
    }
    let destino = pasta.join(format!("cabecalho_ata.{extensao}"));
    fs::write(&destino, input.bytes).map_err(|err| err.to_string())?;
    let config = ler_configuracoes();
    salvar_configuracoes_arquivo(&config)?;
    Ok(config)
}

pub(crate) fn config_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join("configuracoes.json"))
}

pub(crate) fn ler_configuracoes() -> ConfiguracoesApp {
    let dados = config_path()
        .ok()
        .and_then(|caminho| fs::read_to_string(caminho).ok())
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
    let atendimento_tipos = dados
        .get("atendimento_tipos")
        .and_then(Value::as_array)
        .map(|lista| {
            lista
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .map(|lista| normalizar_lista_texto(&lista))
        .unwrap_or_default();
    let atendimento_tipos = if atendimento_tipos.is_empty() {
        atendimento_tipos_padrao()
    } else {
        atendimento_tipos
    };

    ConfiguracoesApp {
        direcao_nome: dados
            .get("direcao_nome")
            .and_then(Value::as_str)
            .unwrap_or("________________________________")
            .to_string(),
        direcao_pronome: dados
            .get("direcao_pronome")
            .and_then(Value::as_str)
            .unwrap_or("F")
            .to_string(),
        nota_minima: dados
            .get("nota_minima")
            .and_then(valor_para_f64)
            .unwrap_or(5.0),
        cabecalho_ata: caminho_cabecalho_ata().map(|path| path.to_string_lossy().to_string()),
        lider_ativo: dados.get("lider_ativo").and_then(Value::as_bool).unwrap_or(true),
        lider_rotulo: dados
            .get("lider_rotulo")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Líder de sala")
            .to_string(),
        elegivel_ativo: dados.get("elegivel_ativo").and_then(Value::as_bool).unwrap_or(true),
        elegivel_rotulo: dados
            .get("elegivel_rotulo")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Elegível")
            .to_string(),
        atendimento_tipos,
        perfil_turma_ativo: dados.get("perfil_turma_ativo").and_then(Value::as_bool).unwrap_or(false),
        perfil_turma_criterios: dados
            .get("perfil_turma_criterios")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(criterios_perfil_padrao),
        aluno_destaque_ativo: dados.get("aluno_destaque_ativo").and_then(Value::as_bool).unwrap_or(false),
        aluno_destaque_criterios: dados
            .get("aluno_destaque_criterios")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default(),
    }
}

pub(crate) fn atendimento_tipos_padrao() -> Vec<String> {
    vec![
        "Disciplinar".to_string(),
        "Dúvidas".to_string(),
        "Pedagógico".to_string(),
        "Financeiro".to_string(),
        "Educação especial".to_string(),
    ]
}

pub(crate) fn criterios_perfil_padrao() -> Vec<CriterioPerfil> {
    fn c(id: &str, nome: &str, b: &str, m: &str, a: &str) -> CriterioPerfil {
        CriterioPerfil {
            id: id.to_string(),
            nome: nome.to_string(),
            opcoes: vec![
                OpcaoCriterioPerfil { nivel: "baixo".to_string(), label: b.to_string() },
                OpcaoCriterioPerfil { nivel: "medio".to_string(), label: m.to_string() },
                OpcaoCriterioPerfil { nivel: "alto".to_string(), label: a.to_string() },
            ],
        }
    }
    vec![
        c("participacao_aulas", "Participação nas aulas", "Baixa", "Média", "Alta"),
        c("entrega_atividades", "Entrega de atividades", "Raramente", "Algumas vezes", "Com frequência"),
        c("interesse_engajamento", "Interesse e engajamento", "Apático", "Oscilante", "Interessado"),
        c("convivencia_interpessoal", "Convivência e relações interpessoais", "Conflituosa", "Equilibrada", "Colaborativa"),
        c("frequencia_escolar", "Frequência escolar", "Alta evasão", "Ausências regulares", "Presença constante"),
        c("leitura_interpretacao", "Habilidades de leitura e interpretação", "Muitos com dificuldades", "Nível mediano", "Turma avançada"),
        c("producao_escrita", "Produção escrita", "Pouco desenvolvida", "Parcialmente desenvolvida", "Desenvolvida"),
        c("desempenho_matematica", "Desempenho em matemática", "Majoritariamente insuficiente", "Mediano", "Satisfatório"),
        c("uso_plataformas", "Uso das plataformas digitais", "Raramente acessam", "Alguns utilizam", "Utilizam com autonomia"),
        c("participacao_familia", "Participação da família", "Inexistente", "Ocasional", "Presente e atuante"),
        c("autonomia_rotinas", "Autonomia da turma nas rotinas escolares", "Dependente", "Em construção", "Autônoma"),
        c("protagonismo", "Nível de protagonismo", "Pouco participativa", "Participa quando estimulada", "Participativa e propositiva"),
        c("clima_escolar", "Clima escolar (relato dos professores)", "Desafiador", "Razoável", "Positivo e acolhedor"),
        c("nivel_aprendizagem", "Nível de aprendizagem da turma", "Abaixo do esperado", "Em processo", "Adequado à série"),
    ]
}

pub(crate) fn salvar_configuracoes_arquivo(config: &ConfiguracoesApp) -> Result<(), String> {
    let caminho = config_path().map_err(|err| err.to_string())?;
    if let Some(parent) = caminho.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let dados = serde_json::json!({
        "direcao_nome": config.direcao_nome,
        "direcao_pronome": config.direcao_pronome,
        "nota_minima": config.nota_minima,
        "cabecalho_ata": config.cabecalho_ata,
        "lider_ativo": config.lider_ativo,
        "lider_rotulo": config.lider_rotulo,
        "elegivel_ativo": config.elegivel_ativo,
        "elegivel_rotulo": config.elegivel_rotulo,
        "atendimento_tipos": config.atendimento_tipos,
        "perfil_turma_ativo": config.perfil_turma_ativo,
        "perfil_turma_criterios": serde_json::to_value(&config.perfil_turma_criterios).unwrap_or_default(),
        "aluno_destaque_ativo": config.aluno_destaque_ativo,
        "aluno_destaque_criterios": serde_json::to_value(&config.aluno_destaque_criterios).unwrap_or_default(),
    });
    let texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto).map_err(|err| err.to_string())
}
