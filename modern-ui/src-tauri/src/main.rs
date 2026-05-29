#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
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
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    stage: &'static str,
    version: &'static str,
    data_dir: String,
}

#[derive(Serialize)]
struct ConfiguracoesApp {
    direcao_nome: String,
    direcao_pronome: String,
    nota_minima: f64,
    cabecalho_ata: Option<String>,
}

#[derive(Deserialize)]
struct ConfiguracoesInput {
    direcao_nome: String,
    direcao_pronome: String,
    nota_minima: f64,
}

#[derive(Deserialize)]
struct ImagemCabecalhoInput {
    nome: String,
    bytes: Vec<u8>,
}

#[derive(Deserialize)]
struct SyncStateInput {
    pasta: String,
    device_id: String,
    payload: Value,
}

#[derive(Serialize)]
struct SyncStateResultado {
    caminho: String,
    atualizado_em: String,
}

#[derive(Deserialize)]
struct SyncInstitutionalInput {
    pasta: String,
    device_id: String,
}

#[derive(Serialize)]
struct SyncInstitutionalResultado {
    caminho: Option<String>,
    arquivos: usize,
    atualizado_em: String,
    backup_seguranca: Option<String>,
}

#[derive(Serialize)]
struct KanbanAnexoResultado {
    id: String,
    nome: String,
    tipo: String,
    dados: String,
    caminho: Option<String>,
    origem: String,
}

#[derive(Deserialize)]
struct BackupImportInput {
    nome: String,
    bytes: Vec<u8>,
    modo: String,
}

#[derive(Deserialize)]
struct CsvImportInput {
    nome: String,
    bytes: Vec<u8>,
}

#[derive(Deserialize)]
struct BackupExportInput {
    ciclos: Option<Vec<String>>,
}

#[derive(Serialize)]
struct BackupResultado {
    caminho: Option<String>,
    arquivos: usize,
    arquivos_importados: usize,
    conflitos: Vec<String>,
    backup_seguranca: Option<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
}

#[derive(Serialize)]
struct AtualizacaoInfo {
    versao_atual: String,
    versao_disponivel: Option<String>,
    disponivel: bool,
    url: Option<String>,
    mensagem: String,
}

#[derive(Serialize)]
struct DiagnosticoIaLocal {
    ollama_instalado: bool,
    servidor_ativo: bool,
    modelo_instalado: bool,
    modelos: Vec<String>,
    mensagem: String,
}

#[derive(Deserialize)]
struct ModeloIaInput {
    modelo: String,
}

#[derive(Deserialize)]
struct RequisicaoIaJsonInput {
    url: String,
    headers: BTreeMap<String, String>,
    body: Value,
}

#[derive(Serialize)]
struct RequisicaoIaJsonResultado {
    status: u16,
    body: Value,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModelInfo>>,
}

#[derive(Deserialize)]
struct OllamaModelInfo {
    name: String,
}

#[derive(Clone)]
struct RegistroElegivelCsv {
    matricula: String,
    nome: String,
    nome_normalizado: String,
    deficiencias: Vec<String>,
}

#[derive(Serialize)]
struct ResultadoImportacaoElegiveis {
    registros_csv: usize,
    turmas_lidas: usize,
    turmas_atualizadas: usize,
    alunos_atualizados: usize,
    por_matricula: usize,
    por_nome: usize,
    nao_encontrados: Vec<String>,
    nomes_ambiguos: Vec<String>,
}

#[derive(Serialize)]
struct TurmaResumo {
    codigo: String,
    ano: i64,
    serie: Option<String>,
    sala: Option<String>,
    periodo: Option<String>,
    ciclo: Option<String>,
    coordenador_turma: Option<String>,
    lider_sala: Option<String>,
    vice_lider_sala: Option<String>,
    total_alunos: usize,
    alunos_ativos: usize,
    alunos_elegiveis: usize,
    nomes_alunos: Vec<String>,
    conselhos_com_ajustes: usize,
    conselho_finalizado: bool,
    caminho: String,
}

#[derive(Serialize)]
struct TurmaDetalhe {
    codigo: String,
    ano: i64,
    coordenador_turma: Option<String>,
    bimestre: String,
    tempo_conselho_segundos: i64,
    texto_ata: String,
    alunos: Vec<AlunoDetalhe>,
}

#[derive(Serialize)]
struct FinalizacaoResultado {
    turma: TurmaDetalhe,
    ata: Option<String>,
    relatorio: Option<String>,
}

#[derive(Serialize)]
struct DocumentoConselho {
    tipo: String,
    bimestre: String,
    caminho: String,
}

#[derive(Deserialize)]
struct AbrirDocumentoConselhoInput {
    caminho: String,
}

#[derive(Serialize)]
struct AlunoDetalhe {
    matricula: String,
    nome: String,
    numero_chamada: Option<i64>,
    elegivel: bool,
    lideranca_sala: Option<String>,
    deficiencias: Vec<String>,
    comentario_educacao_especial: Option<String>,
    frequencia_percentual: Option<f64>,
    encaminhamentos: Vec<i64>,
    diagnostico_aprendizagem: Option<DiagnosticoAprendizagem>,
    disciplinas: Vec<DisciplinaDetalhe>,
}

#[derive(Serialize)]
struct DiagnosticoAprendizagem {
    turma_origem: Option<String>,
    portugues: DiagnosticoComponente,
    matematica: DiagnosticoComponente,
    atualizado_em: Option<String>,
}

#[derive(Serialize)]
struct DiagnosticoComponente {
    aprendizagem_equivalente: Option<String>,
    status: Option<String>,
}

#[derive(Serialize)]
struct DisciplinaDetalhe {
    nome: String,
    media_original: Option<f64>,
    media_conselho: Option<f64>,
    quinto_conceito: Option<f64>,
    observacao_conselho: Option<String>,
    faltas: Option<f64>,
    total_aulas: Option<f64>,
    faltas_acumuladas: Option<f64>,
    total_aulas_acumuladas: Option<f64>,
    historico_bimestres: Vec<NotaBimestre>,
    situacao: String,
}

#[derive(Serialize)]
struct NotaBimestre {
    bimestre: String,
    media: f64,
}

#[derive(Deserialize, Serialize)]
struct TurmaArquivo {
    codigo: String,
    ano: i64,
    serie: Option<String>,
    sala: Option<String>,
    periodo: Option<String>,
    ciclo: Option<String>,
    coordenador_turma: Option<String>,
    carga_horaria: Option<serde_json::Map<String, Value>>,
    textos_ata: Option<serde_json::Map<String, Value>>,
    conselhos: Option<serde_json::Map<String, Value>>,
    alunos: Option<serde_json::Map<String, Value>>,
}

#[derive(Deserialize)]
struct AjusteMediaInput {
    disciplina: String,
    media_original: Option<f64>,
    media_ajustada: Option<f64>,
    observacao: Option<String>,
}

#[derive(Deserialize)]
struct FinalizacaoConselhoInput {
    texto: String,
    tempo_segundos: i64,
    gerar_ata: bool,
    gerar_relatorio: bool,
}

#[derive(Deserialize)]
struct CoordenadorTurmaInput {
    coordenador: String,
}

#[derive(Deserialize)]
struct ElegibilidadeAlunoInput {
    elegivel: bool,
}

#[derive(Deserialize)]
struct LiderancaAlunoInput {
    lideranca: Option<String>,
}

#[derive(Deserialize)]
struct EducacaoEspecialAlunoInput {
    deficiencias: Vec<String>,
    comentario: String,
}

#[derive(Deserialize)]
struct RelatorioAlunosCriticosInput {
    serie: Option<String>,
    bimestre: String,
}

#[derive(Serialize)]
struct RelatorioAlunosCriticosResultado {
    caminho: String,
    pasta: String,
    turmas: usize,
    alunos: usize,
}

#[derive(Deserialize)]
struct RelatorioAlteracoesNotasInput {
    serie: Option<String>,
    bimestre: String,
}

#[derive(Serialize)]
struct RelatorioAlteracoesNotasResultado {
    caminho: String,
    pasta: String,
    turmas: usize,
    pendentes: usize,
    alteradas: usize,
}

#[derive(Deserialize)]
struct NovoAlunoInput {
    matricula: String,
    nome: String,
    numero_chamada: Option<i64>,
    ativo: bool,
    deficiencias: Vec<String>,
}

#[derive(Deserialize)]
struct NovaTurmaInput {
    codigo: String,
    ano: i64,
    serie: String,
    sala: String,
    periodo: String,
    ciclo: String,
    alunos: Vec<NovoAlunoInput>,
    substituir_alunos: Option<bool>,
}

#[derive(Deserialize, Clone)]
struct ArquivoMapaoInput {
    nome: String,
    bytes: Vec<u8>,
}

#[derive(Deserialize)]
struct ImportacaoMapoesInput {
    bimestre: String,
    arquivos: Vec<ArquivoMapaoInput>,
}

#[derive(Deserialize)]
struct ImportacaoDiagnosticoInput {
    arquivos: Vec<ArquivoMapaoInput>,
}

#[derive(Clone)]
struct RegistroDiagnostico {
    turma: String,
    estudante: String,
    portugues_ano: String,
    portugues_status: String,
    matematica_ano: String,
    matematica_status: String,
}

#[derive(Serialize)]
struct PreviaArquivoDiagnostico {
    nome: String,
    registros_lidos: usize,
    correspondencias: usize,
    nao_encontrados: usize,
    nomes_nao_encontrados: Vec<String>,
    duplicados: usize,
    nomes_duplicados: Vec<String>,
    turmas_identificadas: Vec<String>,
    erro: Option<String>,
}

#[derive(Serialize)]
struct PreviaImportacaoDiagnostico {
    arquivos: Vec<PreviaArquivoDiagnostico>,
    total_registros: usize,
    total_correspondencias: usize,
    total_nao_encontrados: usize,
    total_duplicados: usize,
}

#[derive(Serialize)]
struct ResultadoImportacaoDiagnostico {
    previa: PreviaImportacaoDiagnostico,
    turmas_atualizadas: usize,
    alunos_atualizados: usize,
}

#[derive(Serialize, Clone)]
struct PreviaArquivoMapao {
    nome: String,
    turma_alvo: Option<String>,
    turma_caminho: Option<String>,
    alunos_lidos: usize,
    disciplinas_lidas: usize,
    correspondencias: usize,
    nao_encontrados: usize,
    nomes_nao_encontrados: Vec<String>,
    duplicados: usize,
    nomes_duplicados: Vec<String>,
    erro: Option<String>,
}

#[derive(Serialize)]
struct PreviaImportacaoMapoes {
    arquivos: Vec<PreviaArquivoMapao>,
    total_correspondencias: usize,
    total_nao_encontrados: usize,
    total_duplicados: usize,
}

#[derive(Serialize)]
struct ResultadoImportacaoMapoes {
    arquivos: Vec<PreviaArquivoMapao>,
    turmas_atualizadas: usize,
    alunos_atualizados: usize,
}

#[derive(Clone)]
struct DisciplinaMapao {
    nome: String,
    media_col: usize,
    faltas_col: Option<usize>,
    compensacao_col: Option<usize>,
    aulas: Option<f64>,
}

#[derive(Clone)]
struct AlunoMapao {
    nome: String,
    numero_chamada: Option<i64>,
    frequencia_percentual: Option<f64>,
    disciplinas: Vec<(DisciplinaMapao, Option<f64>, Option<f64>, Option<f64>)>,
}

struct DadosMapao {
    alunos: Vec<AlunoMapao>,
    disciplinas: BTreeSet<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct RegistroPei {
    timestamp: String,
    email: String,
    professor: String,
    nome_estudante_completo: String,
    nome_aluno: String,
    turma_aluno: String,
    disciplina: String,
    bimestre: String,
    conteudos: String,
    estrategias: String,
    instrumentos: String,
    recursos: String,
}

#[derive(Serialize)]
struct AlunoElegiveisComDisciplinas {
    matricula: String,
    nome: String,
    turma: String,
    disciplinas: Vec<String>,
    disciplinas_por_bimestre: BTreeMap<String, Vec<String>>,
    bimestres_com_medias: Vec<String>,
}

#[derive(Deserialize)]
struct RegistroPeiInput {
    professor: String,
    disciplina: String,
    bimestre: String,
    conteudos: String,
    estrategias: String,
    instrumentos: String,
    recursos: String,
    timestamp: String,
}

#[derive(Deserialize)]
struct GerarPeiAlunoInput {
    nome_aluno: String,
    turma_aluno: String,
    registros: Vec<RegistroPeiInput>,
}

#[derive(Serialize)]
struct GerarPeiResultado {
    caminho: String,
    pasta: String,
}

#[derive(Serialize)]
struct GerarPeisLoteResultado {
    pasta: String,
    arquivos: usize,
    erros: Vec<String>,
}

#[tauri::command]
fn app_info() -> AppInfo {
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
fn carregar_configuracoes() -> Result<ConfiguracoesApp, String> {
    Ok(ler_configuracoes())
}

#[tauri::command]
fn salvar_configuracoes(input: ConfiguracoesInput) -> Result<ConfiguracoesApp, String> {
    if input.nota_minima < 0.0 || input.nota_minima > 10.0 {
        return Err("A media minima deve ficar entre 0 e 10.".to_string());
    }
    let pronome = input.direcao_pronome.trim().to_uppercase();
    if pronome != "F" && pronome != "M" {
        return Err("Selecione o pronome da direcao.".to_string());
    }

    let config = ConfiguracoesApp {
        direcao_nome: input.direcao_nome.trim().to_uppercase(),
        direcao_pronome: pronome,
        nota_minima: input.nota_minima,
        cabecalho_ata: caminho_cabecalho_ata().map(|path| path.to_string_lossy().to_string()),
    };
    salvar_configuracoes_arquivo(&config)?;
    Ok(config)
}

#[tauri::command]
fn salvar_cabecalho_ata(input: ImagemCabecalhoInput) -> Result<ConfiguracoesApp, String> {
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

#[tauri::command]
fn publicar_estado_sincronizacao(input: SyncStateInput) -> Result<SyncStateResultado, String> {
    let raiz = validar_pasta_sincronizacao(&input.pasta)?;
    let estado = raiz.join("state");
    let dispositivos = raiz.join("devices");
    fs::create_dir_all(&estado).map_err(|err| err.to_string())?;
    fs::create_dir_all(&dispositivos).map_err(|err| err.to_string())?;

    let destino = estado.join("workspace-state.json");
    let temporario = estado.join(format!("workspace-state.{}.tmp", Local::now().timestamp_millis()));
    let conteudo = serde_json::to_vec_pretty(&input.payload).map_err(|err| err.to_string())?;
    fs::write(&temporario, conteudo).map_err(|err| err.to_string())?;
    fs::rename(&temporario, &destino).map_err(|err| err.to_string())?;

    if let Some(profile) = input.payload.get("profile") {
        let perfil_path = dispositivos.join(format!("{}.json", nome_arquivo_seguro(&input.device_id)));
        let perfil = serde_json::to_vec_pretty(profile).map_err(|err| err.to_string())?;
        fs::write(perfil_path, perfil).map_err(|err| err.to_string())?;
    }

    Ok(SyncStateResultado {
        caminho: destino.to_string_lossy().to_string(),
        atualizado_em: Local::now().to_rfc3339(),
    })
}

#[tauri::command]
fn carregar_estado_sincronizacao(pasta: String) -> Result<Option<Value>, String> {
    let raiz = validar_pasta_sincronizacao(&pasta)?;
    let arquivo = raiz.join("state").join("workspace-state.json");
    if !arquivo.exists() {
        return Ok(None);
    }
    let texto = fs::read_to_string(arquivo).map_err(|err| err.to_string())?;
    serde_json::from_str(&texto).map(Some).map_err(|err| err.to_string())
}

#[tauri::command]
fn publicar_dados_institucionais_sincronizacao(
    input: SyncInstitutionalInput,
) -> Result<SyncInstitutionalResultado, String> {
    let raiz = validar_pasta_sincronizacao(&input.pasta)?;
    let estado = raiz.join("state");
    fs::create_dir_all(&estado).map_err(|err| err.to_string())?;

    let origem = data_dir().map_err(|err| err.to_string())?;
    let destino = estado.join("institutional-data");
    let assinatura = assinatura_diretorio(&origem).map_err(|err| err.to_string())?;
    let manifesto_atual = fs::read_to_string(destino.join("manifest.json"))
        .ok()
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok());
    if manifesto_atual
        .as_ref()
        .and_then(|dados| dados.get("assinatura").and_then(Value::as_str))
        == Some(assinatura.as_str())
    {
        let atualizado_em = manifesto_atual
            .as_ref()
            .and_then(|dados| dados.get("atualizado_em").and_then(Value::as_str))
            .unwrap_or("")
            .to_string();
        if !atualizado_em.is_empty() {
            salvar_marcador_sincronizacao_institucional(&atualizado_em)
                .map_err(|err| err.to_string())?;
        }
        return Ok(SyncInstitutionalResultado {
            caminho: Some(destino.to_string_lossy().to_string()),
            arquivos: contar_arquivos_recursivamente(&origem).map_err(|err| err.to_string())?,
            atualizado_em,
            backup_seguranca: None,
        });
    }

    let temporario = estado.join(format!(
        "institutional-data.{}.tmp",
        Local::now().timestamp_millis()
    ));
    if temporario.exists() {
        fs::remove_dir_all(&temporario).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&temporario).map_err(|err| err.to_string())?;

    let mut total = 0;
    if origem.exists() {
        copiar_recursivamente_contando(&origem, &temporario.join("dados"), &mut total)
            .map_err(|err| err.to_string())?;
    } else {
        fs::create_dir_all(temporario.join("dados")).map_err(|err| err.to_string())?;
    }

    let atualizado_em = Local::now().to_rfc3339();
    let manifesto = serde_json::json!({
        "app": "CoordenacaoOP",
        "tipo": "coordenacaoop-institutional-data",
        "formato": 1,
        "versao_app": env!("CARGO_PKG_VERSION"),
        "device_id": input.device_id,
        "atualizado_em": atualizado_em,
        "assinatura": assinatura,
        "total_arquivos": total,
    });
    fs::write(
        temporario.join("manifest.json"),
        serde_json::to_vec_pretty(&manifesto).map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())?;

    if destino.exists() {
        fs::remove_dir_all(&destino).map_err(|err| err.to_string())?;
    }
    fs::rename(&temporario, &destino).map_err(|err| err.to_string())?;
    salvar_marcador_sincronizacao_institucional(&atualizado_em).map_err(|err| err.to_string())?;

    Ok(SyncInstitutionalResultado {
        caminho: Some(destino.to_string_lossy().to_string()),
        arquivos: total,
        atualizado_em,
        backup_seguranca: None,
    })
}

#[tauri::command]
fn carregar_dados_institucionais_sincronizacao(
    pasta: String,
) -> Result<SyncInstitutionalResultado, String> {
    let raiz = validar_pasta_sincronizacao(&pasta)?;
    let origem = raiz.join("state").join("institutional-data");
    let origem_dados = origem.join("dados");
    if !origem_dados.exists() {
        return Ok(SyncInstitutionalResultado {
            caminho: None,
            arquivos: 0,
            atualizado_em: String::new(),
            backup_seguranca: None,
        });
    }

    let manifesto = origem.join("manifest.json");
    let atualizado_em = fs::read_to_string(&manifesto)
        .ok()
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
        .and_then(|dados| dados.get("atualizado_em").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| Local::now().to_rfc3339());

    if ler_marcador_sincronizacao_institucional().as_deref() == Some(atualizado_em.as_str()) {
        return Ok(SyncInstitutionalResultado {
            caminho: Some(origem.to_string_lossy().to_string()),
            arquivos: contar_arquivos_recursivamente(&origem_dados).map_err(|err| err.to_string())?,
            atualizado_em,
            backup_seguranca: None,
        });
    }

    let seguranca = exportar_backup_interno()
        .map_err(|err| format!("Não foi possível criar backup de segurança antes da sincronização: {err}"))?
        .caminho;

    let destino = data_dir().map_err(|err| err.to_string())?;
    let base = app_base_dir().map_err(|err| err.to_string())?;
    let ts = Local::now().timestamp_millis();
    let temporario = base.join(format!("dados_sync_tmp_{ts}"));
    let backup_destino = base.join(format!("dados_sync_old_{ts}"));
    if temporario.exists() {
        fs::remove_dir_all(&temporario).map_err(|err| err.to_string())?;
    }

    let mut total = 0;
    copiar_recursivamente_contando(&origem_dados, &temporario, &mut total)
        .map_err(|err| err.to_string())?;

    // Renomeia o diretório atual para backup antes de colocar o novo no lugar.
    // Se o segundo rename falhar, o original é restaurado — sem perda de dados.
    if destino.exists() {
        fs::rename(&destino, &backup_destino).map_err(|err| err.to_string())?;
    }
    if let Err(err) = fs::rename(&temporario, &destino) {
        if backup_destino.exists() {
            let _ = fs::rename(&backup_destino, &destino);
        }
        return Err(err.to_string());
    }
    let _ = fs::remove_dir_all(&backup_destino);
    preparar_base_portatil(&app_base_dir().map_err(|err| err.to_string())?)
        .map_err(|err| err.to_string())?;
    salvar_marcador_sincronizacao_institucional(&atualizado_em).map_err(|err| err.to_string())?;

    Ok(SyncInstitutionalResultado {
        caminho: Some(origem.to_string_lossy().to_string()),
        arquivos: total,
        atualizado_em,
        backup_seguranca: seguranca,
    })
}

#[tauri::command]
fn exportar_backup() -> Result<BackupResultado, String> {
    exportar_backup_interno().map_err(|err| err.to_string())
}

#[tauri::command]
fn exportar_backup_seletivo(input: BackupExportInput) -> Result<BackupResultado, String> {
    let ciclos = input
        .ciclos
        .unwrap_or_default()
        .into_iter()
        .map(|ciclo| ciclo.trim().to_string())
        .filter(|ciclo| !ciclo.is_empty() && ciclo != "todos")
        .collect::<Vec<_>>();
    if ciclos.is_empty() {
        exportar_backup_interno().map_err(|err| err.to_string())
    } else {
        exportar_backup_ciclos_interno(&ciclos).map_err(|err| err.to_string())
    }
}

#[tauri::command]
fn importar_backup(input: BackupImportInput) -> Result<BackupResultado, String> {
    importar_backup_interno(input).map_err(|err| err.to_string())
}

#[tauri::command]
fn importar_alunos_elegiveis(
    input: CsvImportInput,
) -> Result<ResultadoImportacaoElegiveis, String> {
    importar_alunos_elegiveis_interno(input).map_err(|err| err.to_string())
}

#[tauri::command]
fn verificar_atualizacao() -> Result<AtualizacaoInfo, String> {
    verificar_atualizacao_interno().map_err(|err| err.to_string())
}

#[tauri::command]
fn abrir_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
    let script = format!("Start-Process {}", aspas_powershell(&url));
    Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .spawn()
        .map_err(|err| format!("Nao foi possivel abrir o link: {err}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o link: {err}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o link: {err}"))?;
    }

    Ok(())
}

#[tauri::command]
fn abrir_pasta(caminho: String) -> Result<(), String> {
    let pasta = PathBuf::from(caminho);
    let alvo = if pasta.is_file() {
        pasta.parent().map(Path::to_path_buf).unwrap_or(pasta)
    } else {
        pasta
    };
    if !alvo.exists() {
        return Err("Pasta nao encontrada.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&alvo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir a pasta: {err}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&alvo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir a pasta: {err}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&alvo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir a pasta: {err}"))?;
    }
    Ok(())
}

#[tauri::command]
fn preparar_anexo_kanban(caminho: String) -> Result<KanbanAnexoResultado, String> {
    let origem = PathBuf::from(caminho);
    if !origem.exists() || !origem.is_file() {
        return Err("Arquivo nao encontrado.".to_string());
    }

    let nome = origem
        .file_name()
        .and_then(|valor| valor.to_str())
        .unwrap_or("anexo")
        .to_string();
    let tipo = tipo_mime_por_caminho(&origem);
    let id = format!(
        "anexo-{}-{}",
        Local::now().timestamp_millis(),
        sanitizar_segmento(&nome)
    );

    if tipo.starts_with("image/") {
        let pasta = data_dir()
            .map_err(|err| err.to_string())?
            .join("kanban")
            .join("anexos");
        fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
        let destino = pasta.join(format!("{}_{}", id, sanitizar_segmento(&nome)));
        fs::copy(&origem, &destino)
            .map_err(|err| format!("Nao foi possivel copiar a imagem para os dados do programa: {err}"))?;
        Ok(KanbanAnexoResultado {
            id,
            nome,
            tipo,
            dados: String::new(),
            caminho: Some(destino.to_string_lossy().to_string()),
            origem: "interno".to_string(),
        })
    } else {
        Ok(KanbanAnexoResultado {
            id,
            nome,
            tipo,
            dados: String::new(),
            caminho: Some(origem.to_string_lossy().to_string()),
            origem: "externo".to_string(),
        })
    }
}

#[tauri::command]
fn abrir_anexo_kanban(caminho: String) -> Result<(), String> {
    let arquivo = PathBuf::from(caminho);
    if !arquivo.exists() || !arquivo.is_file() {
        return Err("Arquivo nao encontrado. Ele pode ter sido movido, renomeado ou apagado.".to_string());
    }
    abrir_arquivo(&arquivo)
}

#[tauri::command]
fn criar_turma(input: NovaTurmaInput) -> Result<TurmaResumo, String> {
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
fn editar_turma(caminho: String, input: NovaTurmaInput) -> Result<TurmaResumo, String> {
    let caminho_atual = PathBuf::from(caminho);
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
        if input.substituir_alunos.unwrap_or(false) {
            alunos_existentes.clear();
        }
        let mut matriculas_csv = BTreeSet::new();

        for aluno in input.alunos {
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
                existente.insert("ativo".to_string(), Value::Bool(true));
                if !aluno.deficiencias.is_empty() {
                    existente.insert(
                        "deficiencias".to_string(),
                        serde_json::json!(aluno.deficiencias),
                    );
                }
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
            }
        }

        for (matricula, aluno) in alunos_existentes.iter_mut() {
            if !matriculas_csv.contains(matricula) && !input.substituir_alunos.unwrap_or(false) {
                if let Some(objeto) = aluno.as_object_mut() {
                    objeto.insert("ativo".to_string(), Value::Bool(false));
                }
            }
        }
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
fn excluir_turma(caminho: String) -> Result<(), String> {
    let caminho = PathBuf::from(caminho);
    let raiz = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos");
    garantir_caminho_em_pasta(&caminho, &raiz)?;
    if caminho.exists() {
        fs::remove_file(&caminho).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn analisar_mapoes_lote(input: ImportacaoMapoesInput) -> Result<PreviaImportacaoMapoes, String> {
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

#[tauri::command]
fn aplicar_mapoes_lote(input: ImportacaoMapoesInput) -> Result<ResultadoImportacaoMapoes, String> {
    let bimestre = normalizar_bimestre(&input.bimestre);
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
                let valor = serde_json::Number::from_f64(freq.round())
                    .map(Value::Number)
                    .unwrap_or(Value::Null);
                info.insert("frequencia_percentual".to_string(), valor);
            }

            for (disciplina, media, faltas, compensacao) in aluno_mapao.disciplinas {
                if let Some(valor) = media {
                    inserir_valor_bimestre(info, "medias", &bimestre, &disciplina.nome, valor);
                }
                if let Some(valor) = faltas {
                    inserir_valor_bimestre(info, "frequencia", &bimestre, &disciplina.nome, valor);
                }
                if let Some(valor) = compensacao {
                    inserir_valor_bimestre(
                        info,
                        "compensacao_ausencias",
                        &bimestre,
                        &disciplina.nome,
                        valor,
                    );
                }
                if let Some(aulas) = disciplina.aulas {
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

#[tauri::command]
fn analisar_diagnostico_aprendizagem(
    input: ImportacaoDiagnosticoInput,
) -> Result<PreviaImportacaoDiagnostico, String> {
    let turmas = carregar_turmas_com_caminho()?;
    analisar_diagnostico_input(&input.arquivos, &turmas)
}

#[tauri::command]
fn aplicar_diagnostico_aprendizagem(
    input: ImportacaoDiagnosticoInput,
) -> Result<ResultadoImportacaoDiagnostico, String> {
    let mut turmas = carregar_turmas_com_caminho()?;
    let previa = analisar_diagnostico_input(&input.arquivos, &turmas)?;
    let mut alunos_atualizados = BTreeSet::new();
    let mut turmas_alteradas = BTreeSet::new();

    for arquivo in &input.arquivos {
        let Ok(registros) = ler_diagnostico_bytes(&arquivo.bytes) else {
            continue;
        };
        for registro in registros {
            let alvos = alvos_para_diagnostico(&registro.turma, &turmas);
            let destinos = destinos_nome_arquivo(
                &normalizar_nome_busca(&registro.estudante),
                &indice_alunos_por_nome(&turmas),
                &alvos,
            );
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

            info.insert(
                "diagnostico_aprendizagem".to_string(),
                serde_json::json!({
                    "turma_origem": registro.turma,
                    "portugues": {
                        "aprendizagem_equivalente": registro.portugues_ano,
                        "status": registro.portugues_status,
                    },
                    "matematica": {
                        "aprendizagem_equivalente": registro.matematica_ano,
                        "status": registro.matematica_status,
                    },
                    "atualizado_em": Local::now().to_rfc3339(),
                }),
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

#[tauri::command]
fn listar_turmas() -> Result<Vec<TurmaResumo>, String> {
    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;

    let mut turmas = Vec::new();
    visitar_jsons_turma(&pasta, &mut turmas)?;
    turmas.sort_by(|a, b| (a.ano, a.codigo.clone()).cmp(&(b.ano, b.codigo.clone())));
    Ok(turmas)
}

#[tauri::command]
fn carregar_turma(caminho: String, bimestre: String) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
fn salvar_ajustes_media(
    caminho: String,
    matricula: String,
    bimestre: String,
    ajustes: Vec<AjusteMediaInput>,
) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    aplicar_ajustes_media(&mut dados, &matricula, &bimestre, ajustes)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
fn salvar_encaminhamentos(
    caminho: String,
    matricula: String,
    bimestre: String,
    encaminhamentos: Vec<i64>,
) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    aplicar_encaminhamentos(&mut dados, &matricula, &bimestre, encaminhamentos)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
fn salvar_tempo_conselho(
    caminho: String,
    bimestre: String,
    tempo_segundos: i64,
) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;

    aplicar_tempo_conselho(&mut dados, &bimestre, tempo_segundos)?;

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
fn salvar_coordenador_turma(
    caminho: String,
    input: CoordenadorTurmaInput,
) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
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
    Ok(detalhar_turma(turma, "1"))
}

#[tauri::command]
fn salvar_elegibilidade_aluno(
    caminho: String,
    matricula: String,
    input: ElegibilidadeAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
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

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;
    let turma: TurmaArquivo = serde_json::from_value(dados).map_err(|err| err.to_string())?;
    Ok(detalhar_turma(turma, &bimestre))
}

#[tauri::command]
fn salvar_lideranca_aluno(
    caminho: String,
    matricula: String,
    input: LiderancaAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
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
fn salvar_educacao_especial_aluno(
    caminho: String,
    matricula: String,
    input: EducacaoEspecialAlunoInput,
    bimestre: String,
) -> Result<TurmaDetalhe, String> {
    let caminho = PathBuf::from(caminho);
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
fn definir_fullscreen(window: tauri::Window, ativo: bool) -> Result<(), String> {
    window.set_fullscreen(ativo).map_err(|err| err.to_string())
}

#[tauri::command]
fn abrir_ata(caminho: String, bimestre: String) -> Result<String, String> {
    let caminho = PathBuf::from(caminho);
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let arquivo = localizar_documento_finalizacao(
        &dados,
        &bimestre,
        "atas",
        "ata",
        "Ata salva nao encontrada para esta turma e bimestre.",
    )?;

    abrir_arquivo(&arquivo)?;
    Ok(arquivo.to_string_lossy().to_string())
}

#[tauri::command]
fn abrir_relatorio_professores(caminho: String, bimestre: String) -> Result<String, String> {
    let caminho = PathBuf::from(caminho);
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let arquivo = localizar_documento_finalizacao(
        &dados,
        &bimestre,
        "relatorios",
        "relatorio_professores",
        "Relatorio dos professores salvo nao encontrado para esta turma e bimestre.",
    )?;

    abrir_arquivo(&arquivo)?;
    Ok(arquivo.to_string_lossy().to_string())
}

#[tauri::command]
fn listar_documentos_conselho(caminho: String) -> Result<Vec<DocumentoConselho>, String> {
    let texto = fs::read_to_string(PathBuf::from(caminho)).map_err(|err| err.to_string())?;
    let dados: Value = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
    let mut documentos = Vec::new();
    for bimestre in ["1", "2", "3", "4"] {
        if let Ok(path) = localizar_documento_finalizacao(&dados, bimestre, "atas", "ata", "") {
            documentos.push(DocumentoConselho {
                tipo: "ata".to_string(),
                bimestre: bimestre.to_string(),
                caminho: path.to_string_lossy().to_string(),
            });
        }
        if let Ok(path) = localizar_documento_finalizacao(
            &dados,
            bimestre,
            "relatorios",
            "relatorio_professores",
            "",
        ) {
            documentos.push(DocumentoConselho {
                tipo: "relatorio".to_string(),
                bimestre: bimestre.to_string(),
                caminho: path.to_string_lossy().to_string(),
            });
        }
    }
    Ok(documentos)
}

#[tauri::command]
fn abrir_documento_conselho(input: AbrirDocumentoConselhoInput) -> Result<String, String> {
    let caminho = PathBuf::from(input.caminho);
    if !caminho.exists() {
        return Err("Documento não encontrado.".to_string());
    }
    abrir_arquivo(&caminho)?;
    Ok(caminho.to_string_lossy().to_string())
}

#[tauri::command]
fn gerar_relatorio_alunos_criticos(
    input: RelatorioAlunosCriticosInput,
) -> Result<RelatorioAlunosCriticosResultado, String> {
    let bimestre = normalizar_bimestre(&input.bimestre);
    let serie_filtro = input
        .serie
        .as_deref()
        .map(formatar_rotulo_turma_texto)
        .filter(|serie| !serie.trim().is_empty());
    let turmas = carregar_turmas_com_caminho()?;
    let mut blocos = Vec::new();
    for (_, turma) in turmas {
        if let Some(serie) = &serie_filtro {
            let serie_turma = turma
                .serie
                .as_deref()
                .map(formatar_rotulo_turma_texto)
                .unwrap_or_default();
            if serie_turma != *serie {
                continue;
            }
        }

        let registros = levantar_alunos_criticos_turma(&turma, &bimestre);
        if !registros.is_empty() {
            blocos.push((rotulo_turma(&turma), registros));
        }
    }

    let total_alunos = blocos.iter().map(|(_, alunos)| alunos.len()).sum::<usize>();
    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("alunos_criticos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let escopo = serie_filtro
        .as_deref()
        .map(sanitizar_segmento)
        .unwrap_or_else(|| "todas_as_turmas".to_string());
    let arquivo = pasta.join(format!(
        "relatorio_alunos_criticos_{}_bim_{}_{}.docx",
        escopo,
        bimestre,
        Local::now().format("%Y%m%d_%H%M%S")
    ));
    escrever_relatorio_alunos_criticos_docx(&arquivo, &bimestre, serie_filtro.as_deref(), &blocos)?;

    Ok(RelatorioAlunosCriticosResultado {
        caminho: arquivo.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        turmas: blocos.len(),
        alunos: total_alunos,
    })
}

#[tauri::command]
fn gerar_relatorio_alteracoes_notas(
    input: RelatorioAlteracoesNotasInput,
) -> Result<RelatorioAlteracoesNotasResultado, String> {
    let bimestre = normalizar_bimestre(&input.bimestre);
    let serie_filtro = input
        .serie
        .as_deref()
        .map(formatar_rotulo_turma_texto)
        .filter(|serie| !serie.trim().is_empty());
    let turmas = carregar_turmas_com_caminho()?;
    let mut blocos = Vec::new();

    for (_, turma) in turmas {
        if let Some(serie) = &serie_filtro {
            let serie_turma = turma
                .serie
                .as_deref()
                .map(formatar_rotulo_turma_texto)
                .unwrap_or_default();
            if serie_turma != *serie {
                continue;
            }
        }

        let bloco = levantar_alteracoes_notas_turma(&turma, &bimestre);
        if !bloco.pendentes.is_empty() || !bloco.alteradas.is_empty() {
            blocos.push(bloco);
        }
    }

    let total_pendentes = blocos
        .iter()
        .map(|bloco| bloco.pendentes.len())
        .sum::<usize>();
    let total_alteradas = blocos
        .iter()
        .map(|bloco| bloco.alteradas.len())
        .sum::<usize>();
    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("alteracoes_notas");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let escopo = serie_filtro
        .as_deref()
        .map(sanitizar_segmento)
        .unwrap_or_else(|| "todas_as_turmas".to_string());
    let arquivo = pasta.join(format!(
        "alteracoes_notas_pos_conselho_{}_bim_{}_{}.docx",
        escopo,
        bimestre,
        Local::now().format("%Y%m%d_%H%M%S")
    ));
    escrever_relatorio_alteracoes_notas_docx(
        &arquivo,
        &bimestre,
        serie_filtro.as_deref(),
        &blocos,
    )?;

    Ok(RelatorioAlteracoesNotasResultado {
        caminho: arquivo.to_string_lossy().to_string(),
        pasta: pasta.to_string_lossy().to_string(),
        turmas: blocos.len(),
        pendentes: total_pendentes,
        alteradas: total_alteradas,
    })
}

#[tauri::command]
fn salvar_finalizacao_conselho(
    caminho: String,
    bimestre: String,
    finalizacao: FinalizacaoConselhoInput,
) -> Result<FinalizacaoResultado, String> {
    let caminho = PathBuf::from(caminho);
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

fn aplicar_finalizacao_conselho(
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
    Ok(())
}

fn aplicar_tempo_conselho(
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

fn gerar_documento_finalizacao(
    dados: &Value,
    bimestre: &str,
    raiz: &str,
    prefixo: &str,
    finalizacao: &FinalizacaoConselhoInput,
) -> Result<PathBuf, String> {
    let codigo = dados
        .get("codigo")
        .and_then(Value::as_str)
        .unwrap_or("turma");
    let ano = dados.get("ano").and_then(Value::as_i64).unwrap_or(0);
    let serie = dados
        .get("serie")
        .and_then(Value::as_str)
        .filter(|valor| !valor.trim().is_empty())
        .unwrap_or(codigo);
    let serie = formatar_rotulo_turma_texto(serie);
    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join(raiz)
        .join(sanitizar_segmento(&ano.to_string()))
        .join(sanitizar_segmento(&serie))
        .join(sanitizar_segmento(&format!("{bimestre} bimestre")));
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;

    let arquivo = pasta.join(nome_documento_finalizacao(prefixo, codigo, bimestre));
    if prefixo == "ata" {
        escrever_ata_docx(&arquivo, dados, bimestre, finalizacao.texto.as_str())?;
    } else {
        escrever_relatorio_professores_docx(&arquivo, dados, bimestre)?;
    }
    Ok(arquivo)
}

fn localizar_documento_finalizacao(
    dados: &Value,
    bimestre: &str,
    raiz: &str,
    prefixo: &str,
    erro_ausente: &str,
) -> Result<PathBuf, String> {
    let codigo = dados
        .get("codigo")
        .and_then(Value::as_str)
        .unwrap_or("turma");
    let ano = dados.get("ano").and_then(Value::as_i64).unwrap_or(0);
    let serie = dados
        .get("serie")
        .and_then(Value::as_str)
        .filter(|valor| !valor.trim().is_empty())
        .unwrap_or(codigo);
    let serie = formatar_rotulo_turma_texto(serie);
    let pasta = data_dir()
        .map_err(|err| err.to_string())?
        .join(raiz)
        .join(sanitizar_segmento(&ano.to_string()))
        .join(sanitizar_segmento(&serie))
        .join(sanitizar_segmento(&format!("{bimestre} bimestre")));
    let arquivo = pasta.join(nome_documento_finalizacao(prefixo, codigo, bimestre));

    if arquivo.exists() {
        Ok(arquivo)
    } else if prefixo == "ata" {
        let legado_modern = pasta.join(format!(
            "{}_{}_bim_{}.docx",
            prefixo,
            sanitizar_segmento(codigo),
            sanitizar_segmento(bimestre)
        ));
        if legado_modern.exists() {
            Ok(legado_modern)
        } else {
            Err(erro_ausente.to_string())
        }
    } else {
        Err(erro_ausente.to_string())
    }
}

fn nome_documento_finalizacao(prefixo: &str, codigo: &str, bimestre: &str) -> String {
    if prefixo == "ata" {
        format!(
            "{}_{}_bimestre_{}.docx",
            prefixo,
            sanitizar_segmento(codigo),
            sanitizar_segmento(bimestre)
        )
    } else {
        format!(
            "{}_{}_bim_{}.docx",
            prefixo,
            sanitizar_segmento(codigo),
            sanitizar_segmento(bimestre)
        )
    }
}

fn abrir_arquivo(arquivo: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let caminho = arquivo.to_string_lossy();
        let script = format!("Start-Process -FilePath {}", aspas_powershell(&caminho));
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o documento: {err}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(arquivo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o documento: {err}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(arquivo)
            .spawn()
            .map_err(|err| format!("Nao foi possivel abrir o documento: {err}"))?;
    }
    Ok(())
}

fn tipo_mime_por_caminho(caminho: &Path) -> String {
    match caminho
        .extension()
        .and_then(|valor| valor.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "odt" => "application/vnd.oasis.opendocument.text",
        "ods" => "application/vnd.oasis.opendocument.spreadsheet",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(target_os = "windows")]
fn aspas_powershell(valor: &str) -> String {
    format!("'{}'", valor.replace('\'', "''"))
}

fn sanitizar_segmento(valor: &str) -> String {
    let texto = valor.trim().replace('º', "o").replace('ª', "a");
    let filtrado = texto
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '_' | '-') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let filtrado = filtrado.split_whitespace().collect::<Vec<_>>().join(" ");
    if filtrado.is_empty() {
        "sem_identificacao".to_string()
    } else {
        filtrado
    }
}

fn formatar_rotulo_turma_texto(valor: &str) -> String {
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

fn escrever_ata_docx(
    caminho: &Path,
    dados: &Value,
    bimestre: &str,
    texto_ata: &str,
) -> Result<(), String> {
    let titulo = montar_titulo_ata(dados, bimestre);
    let disciplinas = levantar_disciplinas_ata(dados);
    let alunos = preparar_alunos_ata(dados, bimestre, &disciplinas);

    let mut documento = DocumentoDocx::new();
    documento.paragrafo("");
    documento.titulo_ata(&titulo);
    documento.paragrafo("");
    documento.paragrafo_justificado(texto_ata, false, Some(20));

    let mut tabela = Vec::new();
    let mut cabecalho = vec![
        CelulaDocx::cabecalho("Nº"),
        CelulaDocx::cabecalho("ALUNO"),
        CelulaDocx::cabecalho("STATUS"),
    ];
    cabecalho.extend(
        disciplinas
            .iter()
            .map(|disciplina| CelulaDocx::cabecalho(&abreviar_disciplina(disciplina))),
    );
    cabecalho.push(CelulaDocx::cabecalho("FREQ (%)"));
    cabecalho.push(CelulaDocx::cabecalho("ENCAM."));
    tabela.push(cabecalho);

    let larguras_ata = larguras_tabela_ata(disciplinas.len());
    for aluno in alunos {
        let cor_linha = if aluno.linha_amarela {
            Some("FFFF00")
        } else {
            None
        };
        let mut linha = vec![
            CelulaDocx::texto(&aluno.numero)
                .centralizada()
                .com_fundo("E6E6E6"),
            CelulaDocx::texto(&aluno.nome)
                .com_fundo("E6E6E6")
                .alinhada("left"),
            CelulaDocx::texto(&aluno.status)
                .centralizada()
                .fundo_opcional(cor_linha),
        ];
        linha.extend(disciplinas.iter().map(|disciplina| {
            let texto = if aluno.defasagens.contains(disciplina) {
                "X"
            } else {
                ""
            };
            CelulaDocx::texto(texto)
                .centralizada()
                .fundo_opcional(cor_linha)
        }));
        linha.push(
            CelulaDocx::texto(&aluno.frequencia_percentual)
                .centralizada()
                .fundo_opcional(cor_linha),
        );
        linha.push(CelulaDocx::texto(&aluno.encaminhamento).fundo_opcional(cor_linha));
        tabela.push(linha);
    }
    documento.tabela_celulas_com_larguras(tabela, &larguras_ata, true);

    documento.paragrafo("");
    documento.paragrafo_negrito("Outras observações e encaminhamentos:");
    let textos = encaminhamentos_textos();
    let mut tabela_enc = Vec::new();
    for indice in 0..5 {
        let numero_esq = indice + 1;
        let numero_dir = indice + 6;
        tabela_enc.push(vec![
            CelulaDocx::texto(&format!("{numero_esq}."))
                .centralizada()
                .fundo_opcional(fundo_numero_encaminhamento(numero_esq))
                .tamanho(16),
            CelulaDocx::texto(textos[indice])
                .alinhada("left")
                .fundo_opcional(fundo_numero_encaminhamento(numero_esq))
                .tamanho(16),
            CelulaDocx::texto(&format!("{numero_dir}."))
                .centralizada()
                .fundo_opcional(fundo_numero_encaminhamento(numero_dir))
                .tamanho(16),
            CelulaDocx::texto(textos[indice + 5])
                .alinhada("left")
                .fundo_opcional(fundo_numero_encaminhamento(numero_dir))
                .tamanho(16),
        ]);
    }
    documento.tabela_celulas_com_larguras(tabela_enc, &[450, 5050, 450, 5050], true);

    documento.paragrafo("");
    documento.paragrafo_negrito("ASSINATURA DOS PROFESSORES:");
    let mut assinaturas = Vec::new();
    for grupo in disciplinas.chunks(4) {
        let mut linha = grupo
            .iter()
            .map(|disciplina| {
                CelulaDocx::texto(disciplina)
                    .alinhada("left")
                    .tamanho(18)
                    .sem_borda()
            })
            .collect::<Vec<_>>();
        while linha.len() < 4 {
            linha.push(CelulaDocx::texto("").sem_borda());
        }
        assinaturas.push(linha);
    }
    documento.tabela_celulas_com_larguras(assinaturas, &[2775, 2775, 2775, 2775], false);

    documento.paragrafo("");
    documento.tabela_celulas_com_larguras(
        vec![vec![
            CelulaDocx::texto("______________________________\nCoordenação Pedagógica")
                .centralizada()
                .tamanho(24)
                .sem_borda(),
            CelulaDocx::texto("______________________________\nDireção")
                .centralizada()
                .tamanho(24)
                .sem_borda(),
        ]],
        &[4500, 4500],
        false,
    );

    documento.salvar(caminho)
}

fn larguras_tabela_ata(total_disciplinas: usize) -> Vec<i32> {
    let largura_total = 11_100;
    let largura_numero = 420;
    let largura_nome = 2_250;
    let largura_status = 680;
    let largura_freq = 760;
    let largura_encaminhamento = 780;
    let reservado =
        largura_numero + largura_nome + largura_status + largura_freq + largura_encaminhamento;
    let largura_disciplina = if total_disciplinas == 0 {
        500
    } else {
        ((largura_total - reservado) / total_disciplinas as i32).max(360)
    };

    let mut larguras = vec![largura_numero, largura_nome, largura_status];
    larguras.extend(std::iter::repeat(largura_disciplina).take(total_disciplinas));
    larguras.push(largura_freq);
    larguras.push(largura_encaminhamento);
    larguras
}

fn fundo_numero_encaminhamento(numero: usize) -> Option<&'static str> {
    if matches!(numero, 1 | 3 | 5 | 6 | 8 | 10) {
        Some("E6E6E6")
    } else {
        None
    }
}

struct AlunoCriticoRelatorio {
    numero: String,
    nome: String,
    ra: String,
    frequencia: String,
    disciplinas_baixas: Vec<String>,
    motivos: Vec<String>,
}

struct AlteracaoNotaRelatorio {
    numero: String,
    nome: String,
    ra: String,
    disciplina: String,
    media_original: Option<f64>,
    media_conselho: f64,
    media_mapao: Option<f64>,
    situacao: String,
}

struct BlocoAlteracoesNotasRelatorio {
    turma: String,
    pendentes: Vec<AlteracaoNotaRelatorio>,
    alteradas: Vec<AlteracaoNotaRelatorio>,
}

fn levantar_alunos_criticos_turma(
    turma: &TurmaArquivo,
    bimestre: &str,
) -> Vec<AlunoCriticoRelatorio> {
    let nota_minima = obter_nota_minima_configurada();
    let mut registros = Vec::new();
    let Some(alunos) = &turma.alunos else {
        return registros;
    };

    for (matricula, info) in alunos {
        if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
            continue;
        }

        let frequencia = info.get("frequencia_percentual").and_then(valor_para_f64);
        let excesso_faltas = frequencia.map(|valor| valor < 75.0).unwrap_or(false);
        let disciplinas_baixas = disciplinas_baixas_aluno(info, bimestre, nota_minima);
        let critico_por_notas = media_aluno_bimestre(info, bimestre)
            .map(|valor| arredondar_media_normal(valor) < nota_minima)
            .unwrap_or(false);

        if !excesso_faltas && !critico_por_notas {
            continue;
        }

        let mut motivos = Vec::new();
        if excesso_faltas {
            motivos.push("Excesso de faltas".to_string());
        }
        if critico_por_notas {
            motivos.push("Excesso de disciplinas com notas baixas".to_string());
        }

        registros.push(AlunoCriticoRelatorio {
            numero: info
                .get("numero_chamada")
                .and_then(Value::as_i64)
                .map(|numero| numero.to_string())
                .unwrap_or_else(|| "-".to_string()),
            nome: info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            ra: matricula.clone(),
            frequencia: frequencia
                .map(formatar_percentual_docx)
                .unwrap_or_else(|| "-".to_string()),
            disciplinas_baixas,
            motivos,
        });
    }

    registros.sort_by(|a, b| {
        let numero_a = a.numero.parse::<i64>().unwrap_or(i64::MAX);
        let numero_b = b.numero.parse::<i64>().unwrap_or(i64::MAX);
        (numero_a, a.nome.clone()).cmp(&(numero_b, b.nome.clone()))
    });
    registros
}

fn levantar_alteracoes_notas_turma(
    turma: &TurmaArquivo,
    bimestre: &str,
) -> BlocoAlteracoesNotasRelatorio {
    let mut pendentes = Vec::new();
    let mut alteradas = Vec::new();

    if let Some(alunos) = &turma.alunos {
        for (matricula, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }

            let Some(ajustes) = objeto_bimestre(info, "ajustes_medias_conselho", bimestre) else {
                continue;
            };
            let medias = objeto_bimestre(info, "medias", bimestre);
            let numero = info
                .get("numero_chamada")
                .and_then(Value::as_i64)
                .map(|valor| valor.to_string())
                .unwrap_or_else(|| "-".to_string());
            let nome = info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            for (disciplina, ajuste) in ajustes {
                let Some(media_conselho) = ajuste.get("media_ajustada").and_then(valor_para_f64)
                else {
                    continue;
                };
                let media_mapao = medias
                    .and_then(|mapa| mapa.get(disciplina))
                    .and_then(valor_para_f64);
                let media_original = ajuste
                    .get("media_original")
                    .and_then(valor_para_f64)
                    .or(media_mapao);
                let registro = AlteracaoNotaRelatorio {
                    numero: numero.clone(),
                    nome: nome.clone(),
                    ra: matricula.clone(),
                    disciplina: formatar_rotulo_turma_texto(disciplina),
                    media_original,
                    media_conselho,
                    media_mapao,
                    situacao: if media_mapao.is_some() {
                        "Confirmada no mapão".to_string()
                    } else {
                        "Sem nota no mapão".to_string()
                    },
                };

                match media_mapao {
                    Some(media) if notas_equivalentes(media, media_conselho) => {
                        alteradas.push(registro);
                    }
                    Some(media) if notas_mesma_faixa(media, media_conselho) => {}
                    Some(_) => {
                        pendentes.push(AlteracaoNotaRelatorio {
                            situacao: "Conselho e mapão em faixas diferentes".to_string(),
                            ..registro
                        });
                    }
                    None => pendentes.push(registro),
                }
            }
        }
    }

    ordenar_alteracoes_notas(&mut pendentes);
    ordenar_alteracoes_notas(&mut alteradas);
    BlocoAlteracoesNotasRelatorio {
        turma: rotulo_turma(turma),
        pendentes,
        alteradas,
    }
}

fn ordenar_alteracoes_notas(registros: &mut [AlteracaoNotaRelatorio]) {
    registros.sort_by(|a, b| {
        let numero_a = a.numero.parse::<i64>().unwrap_or(i64::MAX);
        let numero_b = b.numero.parse::<i64>().unwrap_or(i64::MAX);
        (numero_a, a.nome.clone(), a.disciplina.clone()).cmp(&(
            numero_b,
            b.nome.clone(),
            b.disciplina.clone(),
        ))
    });
}

fn notas_equivalentes(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.05
}

fn notas_mesma_faixa(a: f64, b: f64) -> bool {
    (a >= 5.0 && b >= 5.0) || (a < 5.0 && b < 5.0)
}

fn disciplinas_baixas_aluno(info: &Value, bimestre: &str, nota_minima: f64) -> Vec<String> {
    let medias = objeto_bimestre(info, "medias", bimestre);
    let ajustes = objeto_bimestre(info, "ajustes_medias_conselho", bimestre);
    let mut disciplinas = BTreeSet::new();
    if let Some(medias) = medias {
        disciplinas.extend(medias.keys().cloned());
    }
    if let Some(ajustes) = ajustes {
        disciplinas.extend(ajustes.keys().cloned());
    }

    disciplinas
        .into_iter()
        .filter_map(|disciplina| {
            let nota = nota_vigente_disciplina(info, bimestre, &disciplina)?;
            (nota < nota_minima).then_some(formatar_rotulo_turma_texto(&disciplina))
        })
        .collect()
}

fn media_aluno_bimestre(info: &Value, bimestre: &str) -> Option<f64> {
    let medias = objeto_bimestre(info, "medias", bimestre);
    let ajustes = objeto_bimestre(info, "ajustes_medias_conselho", bimestre);
    let mut disciplinas = BTreeSet::new();
    if let Some(medias) = medias {
        disciplinas.extend(medias.keys().cloned());
    }
    if let Some(ajustes) = ajustes {
        disciplinas.extend(ajustes.keys().cloned());
    }

    let notas = disciplinas
        .into_iter()
        .filter_map(|disciplina| nota_vigente_disciplina(info, bimestre, &disciplina))
        .collect::<Vec<_>>();
    if notas.is_empty() {
        None
    } else {
        Some(notas.iter().sum::<f64>() / notas.len() as f64)
    }
}

fn nota_vigente_disciplina(info: &Value, bimestre: &str, disciplina: &str) -> Option<f64> {
    objeto_bimestre(info, "ajustes_medias_conselho", bimestre)
        .and_then(|ajustes| ajustes.get(disciplina))
        .and_then(|ajuste| ajuste.get("media_ajustada"))
        .and_then(valor_para_f64)
        .or_else(|| {
            objeto_bimestre(info, "medias", bimestre)
                .and_then(|medias| medias.get(disciplina))
                .and_then(valor_para_f64)
        })
}

fn arredondar_media_normal(valor: f64) -> f64 {
    (valor + 0.5).floor()
}

fn escrever_relatorio_alunos_criticos_docx(
    caminho: &Path,
    bimestre: &str,
    serie: Option<&str>,
    blocos: &[(String, Vec<AlunoCriticoRelatorio>)],
) -> Result<(), String> {
    let mut documento = DocumentoDocx::new();
    documento.titulo_ata("RELATÓRIO DE ALUNOS CRÍTICOS");
    let escopo = serie.unwrap_or("Todas as turmas");
    documento.paragrafo_negrito(&format!(
        "Escopo: {escopo} | {} | Gerado em {}",
        rotulo_bimestre_relatorio(bimestre),
        Local::now().format("%d/%m/%Y %H:%M")
    ));
    documento.paragrafo("Critérios: frequência abaixo de 75% ou status crítico por média global do bimestre. A coluna de disciplinas lista notas abaixo da média mínima configurada.");

    if blocos.is_empty() {
        documento.caixa_aviso("Nenhum aluno crítico encontrado para o escopo selecionado.");
        return documento.salvar(caminho);
    }

    for (indice, (turma, alunos)) in blocos.iter().enumerate() {
        if indice > 0 {
            documento.paragrafo("");
        }
        documento.paragrafo_negrito(&format!("{turma} - {} aluno(s)", alunos.len()));
        let mut linhas = vec![vec![
            CelulaDocx::cabecalho("Nº"),
            CelulaDocx::cabecalho("Aluno"),
            CelulaDocx::cabecalho("RA"),
            CelulaDocx::cabecalho("Freq."),
            CelulaDocx::cabecalho("Motivo"),
            CelulaDocx::cabecalho("Disciplinas abaixo"),
        ]];
        for aluno in alunos {
            linhas.push(vec![
                CelulaDocx::texto(&aluno.numero),
                CelulaDocx::texto(&aluno.nome).alinhada("left"),
                CelulaDocx::texto(&aluno.ra),
                CelulaDocx::texto(&aluno.frequencia),
                CelulaDocx::texto(&aluno.motivos.join(" / ")).alinhada("left"),
                CelulaDocx::texto(&if aluno.disciplinas_baixas.is_empty() {
                    "-".to_string()
                } else {
                    aluno.disciplinas_baixas.join(", ")
                })
                .alinhada("left"),
            ]);
        }
        documento.tabela_celulas_com_larguras(linhas, &[420, 2500, 1250, 780, 2100, 4050], true);
    }

    documento.salvar(caminho)
}

fn escrever_relatorio_alteracoes_notas_docx(
    caminho: &Path,
    bimestre: &str,
    serie: Option<&str>,
    blocos: &[BlocoAlteracoesNotasRelatorio],
) -> Result<(), String> {
    let mut documento = DocumentoDocx::new();
    documento.titulo_ata("ALTERAÇÕES DE NOTAS PÓS-CONSELHO");
    let escopo = serie.unwrap_or("Todas as turmas");
    documento.paragrafo_negrito(&format!(
        "Escopo: {escopo} | {} | Gerado em {}",
        rotulo_bimestre_relatorio(bimestre),
        Local::now().format("%d/%m/%Y %H:%M")
    ));
    documento.paragrafo("Critério: o relatório lista alterações confirmadas exatamente no mapão e pendências em que a nota definida no conselho e a nota atual do mapão estão em faixas diferentes, abaixo de 5 ou igual/acima de 5. Divergências dentro da mesma faixa não são listadas.");

    if blocos.is_empty() {
        documento.caixa_aviso(
            "Nenhuma alteração de nota pós-conselho encontrada para o escopo selecionado.",
        );
        return documento.salvar(caminho);
    }

    for (indice, bloco) in blocos.iter().enumerate() {
        if indice > 0 {
            documento.paragrafo("");
        }
        documento.paragrafo_negrito(&bloco.turma);
        escrever_secao_alteracoes_notas(
            &mut documento,
            "Notas não alteradas ou incoerentes",
            &bloco.pendentes,
        );
        escrever_secao_alteracoes_notas(
            &mut documento,
            "Notas alteradas no mapão",
            &bloco.alteradas,
        );
    }

    documento.salvar(caminho)
}

fn escrever_secao_alteracoes_notas(
    documento: &mut DocumentoDocx,
    titulo: &str,
    registros: &[AlteracaoNotaRelatorio],
) {
    documento.paragrafo_negrito(&format!("{titulo} - {} registro(s)", registros.len()));
    if registros.is_empty() {
        documento.paragrafo("Nenhum registro nesta seção.");
        return;
    }

    let mut linhas = vec![vec![
        CelulaDocx::cabecalho("Nº"),
        CelulaDocx::cabecalho("Aluno"),
        CelulaDocx::cabecalho("RA"),
        CelulaDocx::cabecalho("Disciplina"),
        CelulaDocx::cabecalho("Original"),
        CelulaDocx::cabecalho("Conselho"),
        CelulaDocx::cabecalho("Mapão"),
        CelulaDocx::cabecalho("Situação"),
    ]];
    for registro in registros {
        linhas.push(vec![
            CelulaDocx::texto(&registro.numero),
            CelulaDocx::texto(&registro.nome).alinhada("left"),
            CelulaDocx::texto(&registro.ra),
            CelulaDocx::texto(&registro.disciplina).alinhada("left"),
            CelulaDocx::texto(&formatar_media_docx(registro.media_original)),
            CelulaDocx::texto(&formatar_media_docx(Some(registro.media_conselho))),
            CelulaDocx::texto(&formatar_media_docx(registro.media_mapao)),
            CelulaDocx::texto(&registro.situacao).alinhada("left"),
        ]);
    }
    documento.tabela_celulas_com_larguras(
        linhas,
        &[380, 2200, 1050, 1850, 780, 780, 780, 3280],
        true,
    );
}

fn rotulo_bimestre_relatorio(bimestre: &str) -> String {
    match bimestre {
        "1" => "1º bimestre".to_string(),
        "2" => "2º bimestre".to_string(),
        "3" => "3º bimestre".to_string(),
        "4" => "4º bimestre/conselho final".to_string(),
        outro => format!("{outro}º bimestre"),
    }
}

fn escrever_relatorio_professores_docx(
    caminho: &Path,
    dados: &Value,
    bimestre: &str,
) -> Result<(), String> {
    let codigo = dados
        .get("codigo")
        .and_then(Value::as_str)
        .unwrap_or("turma");
    let titulo_relatorio = format!("Relatório Pedagógico – Bimestre {bimestre} – Turma {codigo}");
    let mut documento = DocumentoDocx::new();
    documento.paragrafo_negrito(&titulo_relatorio);
    documento.paragrafo("");

    let nota_minima = obter_nota_minima_configurada();
    let carga = dados
        .get("carga_horaria")
        .and_then(Value::as_object)
        .and_then(|por_bimestre| por_bimestre.get(bimestre))
        .and_then(Value::as_object);
    let alunos = dados
        .get("alunos")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let mut por_defasagem: BTreeMap<String, Vec<(String, f64)>> = BTreeMap::new();
    let mut por_ajustes: BTreeMap<String, Vec<(String, Option<f64>, f64, String)>> =
        BTreeMap::new();
    let mut por_faltas: BTreeMap<String, Vec<(String, f64, f64, f64)>> = BTreeMap::new();
    let mut encontrou_medias = false;

    for aluno in alunos.values() {
        if !aluno.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
            continue;
        }
        let nome = aluno
            .get("nome")
            .and_then(Value::as_str)
            .map(nome_titulo)
            .unwrap_or_default();
        let medias = objeto_bimestre(aluno, "medias", bimestre);
        let ajustes = objeto_bimestre(aluno, "ajustes_medias_conselho", bimestre);
        let mut disciplinas = BTreeSet::new();
        if let Some(medias) = medias {
            disciplinas.extend(medias.keys().cloned());
        }
        if let Some(ajustes) = ajustes {
            disciplinas.extend(ajustes.keys().cloned());
        }

        for disciplina in disciplinas {
            let media = medias
                .and_then(|mapa| mapa.get(&disciplina))
                .and_then(valor_para_f64);
            if media.is_some() {
                encontrou_medias = true;
            }
            let ajuste = ajustes
                .and_then(|mapa| mapa.get(&disciplina))
                .and_then(Value::as_object);
            let media_ajustada = ajuste
                .and_then(|mapa| mapa.get("media_ajustada"))
                .and_then(valor_para_f64);
            if let Some(media_ajustada) = media_ajustada {
                let media_original = ajuste
                    .and_then(|mapa| mapa.get("media_original"))
                    .and_then(valor_para_f64)
                    .or(media);
                let observacao = ajuste
                    .and_then(|mapa| mapa.get("observacao"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();
                por_ajustes.entry(disciplina).or_default().push((
                    nome.clone(),
                    media_original,
                    media_ajustada,
                    observacao,
                ));
            } else if media.is_some_and(|valor| valor < nota_minima) {
                por_defasagem
                    .entry(disciplina)
                    .or_default()
                    .push((nome.clone(), media.unwrap_or(0.0)));
            }
        }

        if let Some(frequencia) = objeto_bimestre(aluno, "frequencia", bimestre) {
            for (disciplina, faltas_valor) in frequencia {
                let faltas = valor_para_f64(faltas_valor).unwrap_or(0.0);
                let total = carga
                    .and_then(|mapa| mapa.get(disciplina))
                    .and_then(valor_para_f64)
                    .unwrap_or(0.0);
                if total > 0.0 && (faltas / total) > 0.25 {
                    por_faltas.entry(disciplina.clone()).or_default().push((
                        nome.clone(),
                        faltas,
                        total,
                        (faltas / total) * 100.0,
                    ));
                }
            }
        }
    }

    let mut disciplinas = BTreeSet::new();
    disciplinas.extend(por_defasagem.keys().cloned());
    disciplinas.extend(por_ajustes.keys().cloned());
    disciplinas.extend(por_faltas.keys().cloned());

    if !encontrou_medias {
        documento.paragrafo(
            "Nenhuma média encontrada para este bimestre. Reimporte o mapão para registrar as médias.",
        );
        documento.paragrafo("");
    }

    if disciplinas.is_empty() {
        documento.paragrafo("Nenhum registro encontrado para este bimestre.");
    } else {
        let total = disciplinas.len();
        for (indice, disciplina) in disciplinas.into_iter().enumerate() {
            if indice > 0 {
                documento.paragrafo_negrito(&titulo_relatorio);
                documento.paragrafo("");
            }
            documento.paragrafo_negrito(&format!("Disciplina: {disciplina}"));
            documento.paragrafo("Tarefas do professor para registro e acompanhamento.");

            let mut tarefas = Vec::new();
            if por_ajustes
                .get(&disciplina)
                .is_some_and(|lista| !lista.is_empty())
            {
                tarefas.push("Ajustar notas na Sala do Futuro para os alunos listados abaixo.");
            }
            if por_faltas
                .get(&disciplina)
                .is_some_and(|lista| !lista.is_empty())
            {
                tarefas.push("Organizar compensação de faltas para os alunos listados abaixo.");
            }
            if por_defasagem
                .get(&disciplina)
                .is_some_and(|lista| !lista.is_empty())
            {
                tarefas.push("Acompanhar a defasagem de nota dos alunos sem ajuste registrado.");
            }
            if tarefas.is_empty() {
                tarefas.push("Nenhuma ação pendente para esta disciplina.");
            }
            for (numero, tarefa) in tarefas.iter().enumerate() {
                documento.paragrafo(&format!("{}. {tarefa}", numero + 1));
            }

            let ajustes = por_ajustes.get(&disciplina).cloned().unwrap_or_default();
            adicionar_tabela_relatorio(
                &mut documento,
                "Ajustar notas na Sala do Futuro",
                vec!["Aluno", "Media original", "Media ajustada", "Observacao"],
                ajustes
                    .into_iter()
                    .map(|(nome, original, ajustada, observacao)| {
                        vec![
                            nome,
                            formatar_media_docx(original),
                            formatar_media_docx(Some(ajustada)),
                            if observacao.is_empty() {
                                "-".to_string()
                            } else {
                                observacao
                            },
                        ]
                    })
                    .collect(),
                Some("NÃO HÁ AJUSTES DE NOTA NA SALA DO FUTURO PARA ESTA DISCIPLINA."),
            );

            let faltas = por_faltas.get(&disciplina).cloned().unwrap_or_default();
            adicionar_tabela_relatorio(
                &mut documento,
                "Compensar faltas",
                vec!["Aluno", "Faltas", "Aulas", "% Faltas"],
                faltas
                    .into_iter()
                    .map(|(nome, faltas, total, percentual)| {
                        vec![
                            nome,
                            formatar_numero_sem_decimal(faltas),
                            formatar_numero_sem_decimal(total),
                            format!("{percentual:.1}%"),
                        ]
                    })
                    .collect(),
                None,
            );

            let defasagens = por_defasagem.get(&disciplina).cloned().unwrap_or_default();
            adicionar_tabela_relatorio(
                &mut documento,
                "Alunos com defasagem de nota sem ajuste",
                vec!["Aluno", "Media atual"],
                defasagens
                    .into_iter()
                    .map(|(nome, media)| vec![nome, format!("{media:.1}")])
                    .collect(),
                None,
            );

            if indice + 1 < total {
                documento.quebra_pagina();
            }
        }
    }

    documento.salvar(caminho)
}

fn adicionar_tabela_relatorio(
    documento: &mut DocumentoDocx,
    titulo: &str,
    colunas: Vec<&str>,
    linhas: Vec<Vec<String>>,
    mensagem_vazia: Option<&str>,
) {
    documento.paragrafo("");
    documento.paragrafo_negrito(titulo);
    if linhas.is_empty() {
        if let Some(mensagem) = mensagem_vazia {
            documento.caixa_aviso(mensagem);
        } else {
            documento.paragrafo("Nenhum aluno.");
        }
        return;
    }
    let mut tabela = vec![colunas.into_iter().map(str::to_string).collect::<Vec<_>>()];
    tabela.extend(linhas);
    documento.tabela(tabela, true);
}

fn montar_titulo_ata(dados: &Value, bimestre: &str) -> String {
    let codigo = dados.get("codigo").and_then(Value::as_str).unwrap_or("");
    let ano = dados.get("ano").and_then(Value::as_i64).unwrap_or(0);
    let sala = dados
        .get("sala")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let mut partes = vec![format!("CONSELHO DE CLASSE - {bimestre}º BIM/{ano}")];
    if !codigo.trim().is_empty() {
        partes.push(codigo.trim().to_string());
    }
    if !sala.is_empty() {
        partes.push(format!("SALA {sala}"));
    }
    partes.join(" - ")
}

fn levantar_disciplinas_ata(dados: &Value) -> Vec<String> {
    let mut disciplinas = BTreeSet::new();
    if let Some(cargas) = dados.get("carga_horaria").and_then(Value::as_object) {
        for carga in cargas.values().filter_map(Value::as_object) {
            disciplinas.extend(carga.keys().cloned());
        }
    }
    if let Some(alunos) = dados.get("alunos").and_then(Value::as_object) {
        for aluno in alunos.values() {
            if let Some(defasagens) = aluno.get("defasagens").and_then(Value::as_object) {
                for def_bim in defasagens.values().filter_map(Value::as_object) {
                    disciplinas.extend(def_bim.keys().cloned());
                }
            }
        }
    }
    disciplinas.into_iter().collect()
}

struct AlunoAta {
    numero: String,
    nome: String,
    status: String,
    defasagens: BTreeSet<String>,
    frequencia_percentual: String,
    encaminhamento: String,
    linha_amarela: bool,
}

fn preparar_alunos_ata(dados: &Value, bimestre: &str, _disciplinas: &[String]) -> Vec<AlunoAta> {
    let nota_minima = obter_nota_minima_configurada();
    let alunos = dados
        .get("alunos")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut saida = Vec::new();

    for aluno in alunos.values() {
        let status_raw = aluno.get("status").and_then(Value::as_str).unwrap_or("");
        let status = status_ata(status_raw).to_string();
        let mut encaminhamento = status.clone();
        let codigos = extrair_encaminhamentos(aluno, bimestre);
        if !codigos.is_empty() {
            let codigos_txt = codigos
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ");
            encaminhamento = if encaminhamento.is_empty() {
                codigos_txt
            } else {
                format!("{encaminhamento} | {codigos_txt}")
            };
        }

        let medias = objeto_bimestre(aluno, "medias", bimestre);
        let defasagens_importadas = objeto_bimestre(aluno, "defasagens", bimestre);
        let ajustes = objeto_bimestre(aluno, "ajustes_medias_conselho", bimestre);
        let mut disciplinas = BTreeSet::new();
        if let Some(medias) = medias {
            disciplinas.extend(medias.keys().cloned());
        }
        if let Some(defasagens) = defasagens_importadas {
            disciplinas.extend(defasagens.keys().cloned());
        }
        if let Some(ajustes) = ajustes {
            disciplinas.extend(ajustes.keys().cloned());
        }

        let mut defasagens = BTreeSet::new();
        for disciplina in disciplinas {
            let media_mapao = medias
                .and_then(|mapa| mapa.get(&disciplina))
                .and_then(valor_para_f64);
            let media_ajustada = ajustes
                .and_then(|mapa| mapa.get(&disciplina))
                .and_then(Value::as_object)
                .and_then(|ajuste| ajuste.get("media_ajustada"))
                .and_then(valor_para_f64);
            let media_vigente = media_ajustada.or(media_mapao);
            if media_vigente.is_some_and(|media| media < nota_minima) {
                defasagens.insert(disciplina);
            }
        }

        let frequencia_percentual = if aluno.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
            aluno
                .get("frequencia_percentual")
                .and_then(valor_para_f64)
                .map(|valor| format!("{}%", valor.round() as i64))
                .unwrap_or_default()
        } else {
            String::new()
        };

        saida.push(AlunoAta {
            numero: aluno
                .get("numero_chamada")
                .and_then(Value::as_i64)
                .map(|valor| valor.to_string())
                .unwrap_or_default(),
            nome: aluno
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            status,
            defasagens,
            frequencia_percentual,
            encaminhamento,
            linha_amarela: matches!(status_raw, "NCOM" | "RM" | "TR"),
        });
    }

    saida.sort_by(|a, b| {
        let numero_a = a.numero.parse::<i64>().unwrap_or(i64::MAX);
        let numero_b = b.numero.parse::<i64>().unwrap_or(i64::MAX);
        (numero_a, a.nome.clone()).cmp(&(numero_b, b.nome.clone()))
    });
    saida
}

fn status_ata(status: &str) -> &'static str {
    match status {
        "NCOM" => "NCOM",
        "RM" => "REMANEJADO",
        "TR" => "TRANSFERIDO",
        _ => "",
    }
}

fn abreviar_disciplina(disciplina: &str) -> String {
    let maiuscula = disciplina.to_uppercase();
    match maiuscula.as_str() {
        "BIOLOGIA" => "BIO",
        "FÍSICA" | "FISICA" => "FIS",
        "GEOGRAFIA" => "GEO",
        "HISTÓRIA" | "HISTORIA" => "HIST",
        "LINGUA PORTUGUESA" => "PORT",
        "MATEMATICA" => "MAT",
        "QUIMICA" => "QUI",
        "REDAÇÃO E LEITURA" | "REDACAO E LEITURA" => "REDA",
        "ARTE" | "ARTE E MÍDIAS DIGITAIS" | "ARTE E MIDIAS DIGITAIS" => "ARTE",
        "EDUCACAO FISICA" => "EDF",
        "FILOSOFIA E SOCIEDADE MODERNA" => "FIL",
        "GEOPOLITICA" => "GEOP",
        "LINGUA INGLESA" => "ING",
        "PROJETO DE VIDA" => "PV",
        "EDUCAÇÃO FINANCEIRA" | "EDUCACAO FINANCEIRA" => "EFIN",
        "TECNOLOGIA E INOVAÇÃO" | "TECNOLOGIA E INOVACAO" => "TEC",
        "CIENCIAS" => "CIE",
        _ => return maiuscula.chars().take(4).collect(),
    }
    .to_string()
}

fn encaminhamentos_textos() -> [&'static str; 10] {
    [
        "Dificuldade em ler, interpretar e associar dados, tabelas, figuras, produzir textos e resolver situações problemas",
        "Confrontar ideias e opiniões, manifestando-se de forma argumentativa",
        "Dedicar-se mais ao estudo em casa.",
        "Prestar mais atenção às explicações do professor, tirar dúvidas, realizar as tarefas em aula nos prazos estipulados",
        "Frequência às aulas.",
        "Acompanhar diariamente, dialogar e orientar o estudante sobre as atividades escolares",
        "Estabelecer horas de estudo em casa, incentivando o hábito de estudar",
        "Comparecer às reuniões e conversar com professores e coordenadores pedagógicos",
        "Recuperação contínua",
        "Tarefas auxiliares para superação das dificuldades específicas do estudante",
    ]
}

fn obter_nota_minima_configurada() -> f64 {
    let caminho = match app_base_dir() {
        Ok(base) => base.join("config").join("configuracoes.json"),
        Err(_) => return 5.0,
    };
    fs::read_to_string(caminho)
        .ok()
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
        .and_then(|dados| dados.get("nota_minima").and_then(valor_para_f64))
        .unwrap_or(5.0)
}

fn nome_titulo(nome: &str) -> String {
    nome.split_whitespace()
        .map(|parte| {
            let mut chars = parte.chars();
            match chars.next() {
                Some(inicial) => format!(
                    "{}{}",
                    inicial.to_uppercase(),
                    chars.as_str().to_lowercase()
                ),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn formatar_media_docx(valor: Option<f64>) -> String {
    valor
        .map(|valor| format!("{valor:.1}"))
        .unwrap_or_else(|| "-".to_string())
}

fn formatar_percentual_docx(valor: f64) -> String {
    format!("{}%", valor.round() as i64)
}

fn formatar_numero_sem_decimal(valor: f64) -> String {
    if (valor.fract()).abs() < f64::EPSILON {
        format!("{}", valor as i64)
    } else {
        format!("{valor:.1}")
    }
}

struct DocumentoDocx {
    corpo: String,
}

#[derive(Clone)]
struct CelulaDocx {
    texto: String,
    negrito: bool,
    tamanho: i32,
    alinhamento: &'static str,
    fundo: Option<&'static str>,
    borda: bool,
}

impl CelulaDocx {
    fn texto(texto: &str) -> Self {
        Self {
            texto: texto.to_string(),
            negrito: false,
            tamanho: 15,
            alinhamento: "center",
            fundo: None,
            borda: true,
        }
    }

    fn cabecalho(texto: &str) -> Self {
        Self::texto(texto).negrito().com_fundo("E6E6E6").tamanho(16)
    }

    fn negrito(mut self) -> Self {
        self.negrito = true;
        self
    }

    fn tamanho(mut self, tamanho: i32) -> Self {
        self.tamanho = tamanho;
        self
    }

    fn centralizada(mut self) -> Self {
        self.alinhamento = "center";
        self
    }

    fn alinhada(mut self, alinhamento: &'static str) -> Self {
        self.alinhamento = alinhamento;
        self
    }

    fn com_fundo(mut self, fundo: &'static str) -> Self {
        self.fundo = Some(fundo);
        self
    }

    fn fundo_opcional(mut self, fundo: Option<&'static str>) -> Self {
        self.fundo = fundo;
        self
    }

    fn sem_borda(mut self) -> Self {
        self.borda = false;
        self
    }
}

impl DocumentoDocx {
    fn new() -> Self {
        Self {
            corpo: String::new(),
        }
    }

    fn paragrafo(&mut self, texto: &str) {
        self.corpo.push_str(&paragrafo_docx(texto, false));
    }

    fn paragrafo_negrito(&mut self, texto: &str) {
        self.corpo
            .push_str(&paragrafo_docx_formatado(texto, true, Some(20), None, None));
    }

    fn caixa_aviso(&mut self, texto: &str) {
        self.tabela_celulas_com_larguras(
            vec![vec![CelulaDocx::texto(texto)
                .negrito()
                .tamanho(20)
                .alinhada("center")
                .com_fundo("FFF2CC")]],
            &[11_100],
            false,
        );
    }

    fn titulo_ata(&mut self, texto: &str) {
        self.corpo.push_str(&paragrafo_docx_formatado(
            texto,
            true,
            Some(28),
            Some("center"),
            Some("800080"),
        ));
    }

    fn paragrafo_justificado(&mut self, texto: &str, negrito: bool, tamanho: Option<i32>) {
        self.corpo.push_str(&paragrafo_docx_formatado(
            texto,
            negrito,
            tamanho,
            Some("both"),
            None,
        ));
    }

    fn quebra_pagina(&mut self) {
        self.corpo
            .push_str(r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#);
    }

    fn tabela(&mut self, linhas: Vec<Vec<String>>, primeira_linha_cabecalho: bool) {
        let linhas = linhas
            .into_iter()
            .enumerate()
            .map(|(indice, linha)| {
                linha
                    .into_iter()
                    .map(|texto| {
                        if primeira_linha_cabecalho && indice == 0 {
                            CelulaDocx::cabecalho(&texto)
                        } else {
                            CelulaDocx::texto(&texto)
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        self.tabela_celulas(linhas);
    }

    fn tabela_celulas(&mut self, linhas: Vec<Vec<CelulaDocx>>) {
        self.tabela_celulas_com_larguras(linhas, &[], true);
    }

    fn tabela_celulas_com_larguras(
        &mut self,
        linhas: Vec<Vec<CelulaDocx>>,
        larguras: &[i32],
        repetir_primeira_linha: bool,
    ) {
        if linhas.is_empty() {
            return;
        }
        let colunas = linhas.iter().map(Vec::len).max().unwrap_or(0);
        let alguma_borda = linhas.iter().flatten().any(|celula| celula.borda);
        let bordas = if alguma_borda {
            r#"<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>"#
        } else {
            r#"<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>"#
        };
        self.corpo.push_str(&format!(r#"<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="30" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="30" w:type="dxa"/></w:tblCellMar><w:tblLook w:firstColumn="1" w:firstRow="1" w:lastColumn="0" w:lastRow="0" w:noHBand="0" w:noVBand="1" w:val="04A0"/>{bordas}</w:tblPr><w:tblGrid>"#));
        for indice in 0..colunas {
            let largura = larguras.get(indice).copied().unwrap_or_else(|| {
                if colunas <= 2 {
                    4500
                } else if colunas <= 4 {
                    2200
                } else {
                    585
                }
            });
            self.corpo
                .push_str(&format!(r#"<w:gridCol w:w="{largura}"/>"#));
        }
        self.corpo.push_str("</w:tblGrid>");
        for (indice, linha) in linhas.iter().enumerate() {
            if repetir_primeira_linha && indice == 0 {
                self.corpo
                    .push_str(r#"<w:tr><w:trPr><w:tblHeader w:val="true"/></w:trPr>"#);
            } else {
                self.corpo.push_str("<w:tr>");
            }
            for celula in linha {
                self.corpo.push_str(&celula_docx(celula));
            }
            self.corpo.push_str("</w:tr>");
        }
        self.corpo.push_str("</w:tbl>");
    }

    fn salvar(self, caminho: &Path) -> Result<(), String> {
        escrever_docx(caminho, &self.corpo)
    }

    // ── Métodos específicos para o PEI ──────────────────────────────────────

    fn titulo_pei(&mut self, texto: &str) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr>{fonte}<w:b/><w:u w:val="single"/><w:sz w:val="24"/></w:rPr><w:t>{t}</w:t></w:r></w:p>"#,
            fonte = fonte,
            t = escape_xml(texto)
        ));
    }

    fn intro_pei(&mut self) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="24"/>"#;
        // "PEI: Plano Educacional Individualizado – documento que estabelece a "
        // "acessibilidade" (sublinhado)
        // " curricular, adaptações e estratégias para o acesso ao currículo comum.
        //  (Resolução SEDUC Nº 129, de 30 de setembro de 2025)"
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="both"/></w:pPr>"#
        ));
        for (txt, negrito, sublinhado) in [
            ("PEI: Plano Educacional Individualizado \u{2013} documento que estabelece a ", false, false),
            ("acessibilidade", false, true),
            (" curricular, adapta\u{00e7}\u{00f5}es e estrat\u{00e9}gias para o acesso ao curr\u{00ed}culo comum. (Resolu\u{00e7}\u{00e3}o SEDUC N\u{00ba} 129, de 30 de setembro de 2025)", false, false),
        ] {
            let b = if negrito { "<w:b/>" } else { "" };
            let u = if sublinhado { r#"<w:u w:val="single"/>"# } else { "" };
            self.corpo.push_str(&format!(
                r#"<w:r><w:rPr>{fonte}{sz}{b}{u}</w:rPr><w:t xml:space="preserve">{t}</w:t></w:r>"#,
                fonte = fonte, sz = sz, b = b, u = u,
                t = escape_xml(txt)
            ));
        }
        self.corpo.push_str("</w:p>");
    }

    fn campo_pei(&mut self, rotulo: &str, valor: &str) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="24"/>"#;
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="60" w:after="0"/></w:pPr>"#
        ));
        self.corpo.push_str(&format!(
            r#"<w:r><w:rPr>{fonte}{sz}<w:b/></w:rPr><w:t xml:space="preserve">{r} </w:t></w:r>"#,
            fonte = fonte, sz = sz, r = escape_xml(rotulo)
        ));
        if !valor.trim().is_empty() {
            self.corpo.push_str(&format!(
                r#"<w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve">{v}</w:t></w:r>"#,
                fonte = fonte, sz = sz, v = escape_xml(valor)
            ));
        }
        self.corpo.push_str("</w:p>");
    }

    fn periodo_pei(&mut self, bimestre: &str) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="24"/>"#;
        let mut caixas = String::new();
        for (b, label) in [("1", "1\u{00b0} Bimestre"), ("2", "2\u{00ba} Bimestre"),
                            ("3", "3\u{00ba} Bimestre"), ("4", "4\u{00ba} Bimestre")] {
            let marca = if b == bimestre { "X" } else { "  " };
            caixas.push_str(&format!("( {marca} ) {label}  "));
        }
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>"#
        ));
        self.corpo.push_str(&format!(
            "<w:r><w:rPr>{fonte}{sz}<w:b/></w:rPr><w:t xml:space=\"preserve\">Per\u{00ed}odo: </w:t></w:r>",
            fonte = fonte, sz = sz
        ));
        self.corpo.push_str(&format!(
            r#"<w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve">{c}</w:t></w:r>"#,
            fonte = fonte, sz = sz, c = escape_xml(caixas.trim())
        ));
        self.corpo.push_str("</w:p>");
    }

    fn questao_pei(&mut self, pergunta: &str, resposta: &str) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="24"/>"#;
        // Pergunta: negrito, justificado
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="160" w:after="0"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr>{fonte}{sz}<w:b/></w:rPr><w:t xml:space="preserve">{q}</w:t></w:r></w:p>"#,
            fonte = fonte, sz = sz, q = escape_xml(pergunta)
        ));
        // Resposta linha a linha
        if resposta.trim().is_empty() {
            // Espaço em branco para preenchimento manual
            for _ in 0..3 {
                self.corpo.push_str(&format!(
                    r#"<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr>{fonte}{sz}</w:rPr><w:t></w:t></w:r></w:p>"#,
                    fonte = fonte, sz = sz
                ));
            }
        } else {
            for linha in resposta.lines() {
                self.corpo.push_str(&format!(
                    r#"<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve">{l}</w:t></w:r></w:p>"#,
                    fonte = fonte, sz = sz, l = escape_xml(linha)
                ));
            }
        }
        // Espaço após resposta
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr><w:r><w:rPr>{fonte}{sz}</w:rPr><w:t></w:t></w:r></w:p>"#,
            fonte = fonte, sz = sz
        ));
    }

    /// Quatro blocos de assinatura em tabela 2×2, centralizados, ao final da página.
    /// Cada bloco tem espaço para assinar/carimbar, linha de sublinhar e rótulo.
    fn assinaturas_pei_final(&mut self) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz_label = r#"<w:sz w:val="20"/>"#; // 10pt para os rótulos de assinatura

        // Espaçador entre conteúdo e bloco de assinaturas (aprox. 2 cm)
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="1120" w:after="0"/></w:pPr><w:r><w:rPr>{fonte}</w:rPr><w:t></w:t></w:r></w:p>"#,
            fonte = fonte
        ));

        // Tabela 2 colunas × 2 linhas, sem bordas
        self.corpo.push_str(concat!(
            r#"<w:tbl><w:tblPr>"#,
            r#"<w:tblStyle w:val="TableGrid"/>"#,
            r#"<w:tblW w:w="5000" w:type="pct"/>"#,
            r#"<w:jc w:val="center"/>"#,
            r#"<w:tblLayout w:type="fixed"/>"#,
            r#"<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>"#,
            r#"<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>"#,
            r#"</w:tblPr>"#,
            r#"<w:tblGrid><w:gridCol w:w="5550"/><w:gridCol w:w="5550"/></w:tblGrid>"#
        ));

        let pares = [
            (
                "Nome e Assinatura do Coordenador(a) de Gestão Pedagógica:",
                "Nome e Assinatura do Professor(a) Especializado(a) da Educação Especial:",
            ),
            (
                "Nome e Assinatura do Professor(a) Especializado(a) do Projeto Ensino Colaborativo:",
                "Nome e Assinatura do Professor(a) Regente de classes, turmas ou componentes curriculares:",
            ),
        ];

        for (esq, dir) in pares {
            self.corpo.push_str("<w:tr>");
            for rotulo in [esq, dir] {
                self.corpo.push_str("<w:tc><w:tcPr><w:vAlign w:val=\"top\"/></w:tcPr>");
                // Linhas em branco para espaço de assinatura e carimbo
                for _ in 0..5 {
                    self.corpo.push_str(&format!(
                        r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr>{fonte}{sz_label}</w:rPr><w:t></w:t></w:r></w:p>"#,
                        fonte = fonte, sz_label = sz_label
                    ));
                }
                // Linha de sublinhar
                self.corpo.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr>{fonte}{sz_label}</w:rPr><w:t>______________________________</w:t></w:r></w:p>"#,
                    fonte = fonte, sz_label = sz_label
                ));
                // Rótulo
                self.corpo.push_str(&format!(
                    r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="480"/></w:pPr><w:r><w:rPr>{fonte}{sz_label}</w:rPr><w:t xml:space="preserve">{r}</w:t></w:r></w:p>"#,
                    fonte = fonte, sz_label = sz_label, r = escape_xml(rotulo)
                ));
                self.corpo.push_str("</w:tc>");
            }
            self.corpo.push_str("</w:tr>");
        }

        self.corpo.push_str("</w:tbl>");
    }
}

fn escrever_docx(caminho: &Path, corpo: &str) -> Result<(), String> {
    let arquivo = fs::File::create(caminho).map_err(|err| err.to_string())?;
    let mut zip = ZipWriter::new(arquivo);
    let options = SimpleFileOptions::default();
    let cabecalho_path = localizar_imagem_cabecalho();
    let cabecalho_ext = cabecalho_path
        .as_ref()
        .and_then(|path| path.extension())
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_else(|| "jpg".to_string());
    let cabecalho_media = if cabecalho_ext == "png" {
        "cabecalho.png"
    } else {
        "cabecalho.jpg"
    };
    let cabecalho = cabecalho_path.and_then(|path| fs::read(path).ok());
    let tem_cabecalho = cabecalho.is_some();

    zip.start_file("[Content_Types].xml", options)
        .map_err(|err| err.to_string())?;
    let content_types = if tem_cabecalho {
        if cabecalho_ext == "png" {
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>"#.as_slice()
        } else {
            br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>"#.as_slice()
        }
    } else {
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#.as_slice()
    };
    zip.write_all(content_types)
        .map_err(|err| err.to_string())?;

    zip.add_directory("_rels/", options)
        .map_err(|err| err.to_string())?;
    zip.start_file("_rels/.rels", options)
        .map_err(|err| err.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#)
        .map_err(|err| err.to_string())?;

    zip.add_directory("word/", options)
        .map_err(|err| err.to_string())?;
    zip.add_directory("word/_rels/", options)
        .map_err(|err| err.to_string())?;
    zip.start_file("word/_rels/document.xml.rels", options)
        .map_err(|err| err.to_string())?;
    if tem_cabecalho {
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>"#)
            .map_err(|err| err.to_string())?;
    } else {
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>"#)
            .map_err(|err| err.to_string())?;
    }

    if let Some(imagem) = cabecalho {
        zip.start_file("word/header1.xml", options)
            .map_err(|err| err.to_string())?;
        zip.write_all(cabecalho_docx_xml().as_bytes())
            .map_err(|err| err.to_string())?;
        zip.add_directory("word/media/", options)
            .map_err(|err| err.to_string())?;
        zip.start_file(format!("word/media/{cabecalho_media}"), options)
            .map_err(|err| err.to_string())?;
        zip.write_all(&imagem).map_err(|err| err.to_string())?;
        zip.start_file("word/_rels/header1.xml.rels", options)
            .map_err(|err| err.to_string())?;
        zip.write_all(format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdCabecalho" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{cabecalho_media}"/></Relationships>"#).as_bytes())
            .map_err(|err| err.to_string())?;
    }

    zip.start_file("word/document.xml", options)
        .map_err(|err| err.to_string())?;
    let referencia_cabecalho = if tem_cabecalho {
        r#"<w:headerReference w:type="default" r:id="rIdHeader1"/>"#
    } else {
        ""
    };
    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>{corpo}<w:sectPr>{referencia_cabecalho}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="360" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>"#
    );
    zip.write_all(xml.as_bytes())
        .map_err(|err| err.to_string())?;
    zip.finish().map_err(|err| err.to_string())?;
    Ok(())
}

fn localizar_imagem_cabecalho() -> Option<PathBuf> {
    let mut candidatos = Vec::new();
    if let Ok(base) = data_dir() {
        candidatos.extend(
            ["png", "jpg", "jpeg"]
                .map(|ext| base.join("imagens").join(format!("cabecalho_ata.{ext}"))),
        );
        candidatos.push(base.join("imagens").join("cabecalho.jpg"));
    }
    if let Ok(base) = app_base_dir() {
        candidatos.push(base.join("dados").join("imagens").join("cabecalho.jpg"));
    }
    if let Ok(atual) = env::current_dir() {
        candidatos.push(atual.join("dados").join("imagens").join("cabecalho.jpg"));
        candidatos.push(
            atual
                .parent()
                .unwrap_or(&atual)
                .join("dados")
                .join("imagens")
                .join("cabecalho.jpg"),
        );
    }
    candidatos.into_iter().find(|path| path.exists())
}

fn caminho_cabecalho_ata() -> Option<PathBuf> {
    data_dir().ok().and_then(|base| {
        ["png", "jpg", "jpeg"]
            .into_iter()
            .map(|ext| base.join("imagens").join(format!("cabecalho_ata.{ext}")))
            .find(|path| path.exists())
    })
}

fn extensao_imagem_cabecalho(nome: &str) -> Option<&'static str> {
    match Path::new(nome)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => Some("jpg"),
        Some("png") => Some("png"),
        _ => None,
    }
}

fn cabecalho_docx_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="4320000" cy="752000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Cabeçalho"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="cabecalho.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdCabecalho"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4320000" cy="752000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>"#.to_string()
}

fn paragrafo_docx(texto: &str, negrito: bool) -> String {
    paragrafo_docx_formatado(texto, negrito, None, None, None)
}

fn paragrafo_docx_formatado(
    texto: &str,
    negrito: bool,
    tamanho: Option<i32>,
    alinhamento: Option<&str>,
    cor: Option<&str>,
) -> String {
    let bold = if negrito { "<w:b/>" } else { "" };
    let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
    let tamanho = tamanho
        .map(|valor| format!(r#"<w:sz w:val="{valor}"/>"#))
        .unwrap_or_default();
    let cor = cor
        .map(|valor| format!(r#"<w:color w:val="{valor}"/>"#))
        .unwrap_or_default();
    let alinhamento = alinhamento
        .map(|valor| {
            format!(
                r#"<w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="{valor}"/></w:pPr>"#
            )
        })
        .unwrap_or_default();
    let mut runs = Vec::new();
    for (indice, linha) in texto.lines().enumerate() {
        if indice > 0 {
            runs.push("<w:r><w:br/></w:r>".to_string());
        }
        runs.push(format!(
            r#"<w:r><w:rPr>{fonte}{bold}{cor}{tamanho}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r>"#,
            escape_xml(linha)
        ));
    }
    if runs.is_empty() {
        runs.push("<w:r><w:t></w:t></w:r>".to_string());
    }
    format!("<w:p>{alinhamento}{}</w:p>", runs.join(""))
}

fn celula_docx(celula: &CelulaDocx) -> String {
    let shading = celula
        .fundo
        .map(|cor| format!(r#"<w:shd w:fill="{cor}"/>"#))
        .unwrap_or_default();
    let bordas = if celula.borda {
        String::new()
    } else {
        r#"<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>"#.to_string()
    };
    format!(
        r#"<w:tc><w:tcPr>{shading}{bordas}<w:vAlign w:val="center"/></w:tcPr>{}</w:tc>"#,
        paragrafo_docx_formatado(
            &celula.texto,
            celula.negrito,
            Some(celula.tamanho),
            Some(celula.alinhamento),
            None,
        )
    )
}

fn escape_xml(texto: &str) -> String {
    texto
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn aplicar_encaminhamentos(
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

fn aplicar_ajustes_media(
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

fn remover_ajuste_media(aluno: &mut Value, bimestre: &str, disciplina: &str) {
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

fn limpar_ajustes_vazios(aluno: &mut Value, bimestre: &str) {
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

fn escrever_json_atomicamente(caminho: &Path, conteudo: &str) -> io::Result<()> {
    let dir = caminho.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "caminho sem diretório pai")
    })?;
    let nome_base = caminho
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("arquivo");
    let tmp_nome = format!(".{}.{}.tmp", nome_base, Local::now().timestamp_millis());
    let temporario = dir.join(tmp_nome);
    fs::write(&temporario, conteudo)?;
    fs::rename(&temporario, caminho).map_err(|err| {
        let _ = fs::remove_file(&temporario);
        err
    })
}

fn app_base_dir() -> io::Result<PathBuf> {
    if let Ok(base) = env::var("COORDENACAOOP_HOME") {
        let base = PathBuf::from(base);
        preparar_base_portatil(&base)?;
        return Ok(base);
    }

    if let Ok(appimage) = env::var("APPIMAGE") {
        if let Some(base) = PathBuf::from(appimage).parent().map(Path::to_path_buf) {
            if pasta_gravavel(&base) {
                preparar_base_portatil(&base)?;
                return Ok(base);
            }
        }
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let base = parent.to_path_buf();
            if !parece_montagem_appimage(&base) && pasta_gravavel(&base) {
                preparar_base_portatil(&base)?;
                return Ok(base);
            }
        }
    }

    if let Ok(base) = env::current_dir() {
        if pasta_gravavel(&base) {
            preparar_base_portatil(&base)?;
            return Ok(base);
        }
    }

    let base = pasta_dados_usuario()?;
    preparar_base_portatil(&base)?;
    Ok(base)
}

fn parece_montagem_appimage(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .starts_with(".mount_")
    })
}

fn pasta_gravavel(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }
    let teste = path.join(".coordenacaoop_write_test");
    match fs::write(&teste, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(teste);
            true
        }
        Err(_) => false,
    }
}

fn pasta_dados_usuario() -> io::Result<PathBuf> {
    if cfg!(target_os = "windows") {
        if let Ok(appdata) = env::var("APPDATA") {
            return Ok(PathBuf::from(appdata).join("CoordenacaoOP"));
        }
        if let Ok(localappdata) = env::var("LOCALAPPDATA") {
            return Ok(PathBuf::from(localappdata).join("CoordenacaoOP"));
        }
    }

    if cfg!(target_os = "macos") {
        if let Ok(home) = env::var("HOME") {
            return Ok(PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("CoordenacaoOP"));
        }
    }

    if let Ok(xdg_data_home) = env::var("XDG_DATA_HOME") {
        return Ok(PathBuf::from(xdg_data_home).join("coordenacaoop"));
    }
    if let Ok(home) = env::var("HOME") {
        return Ok(PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("coordenacaoop"));
    }

    Ok(env::current_dir()?.join("coordenacaoop-dados"))
}

fn data_dir() -> io::Result<PathBuf> {
    Ok(app_base_dir()?.join("dados"))
}

fn config_dir() -> io::Result<PathBuf> {
    Ok(app_base_dir()?.join("config"))
}

fn backups_dir() -> io::Result<PathBuf> {
    let pasta = app_base_dir()?.join("backups");
    fs::create_dir_all(&pasta)?;
    Ok(pasta)
}

fn config_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join("configuracoes.json"))
}

fn ler_configuracoes() -> ConfiguracoesApp {
    let dados = config_path()
        .ok()
        .and_then(|caminho| fs::read_to_string(caminho).ok())
        .and_then(|texto| serde_json::from_str::<Value>(&texto).ok())
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));

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
    }
}

fn salvar_configuracoes_arquivo(config: &ConfiguracoesApp) -> Result<(), String> {
    let caminho = config_path().map_err(|err| err.to_string())?;
    if let Some(parent) = caminho.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let dados = serde_json::json!({
        "direcao_nome": config.direcao_nome,
        "direcao_pronome": config.direcao_pronome,
        "nota_minima": config.nota_minima,
        "cabecalho_ata": config.cabecalho_ata,
    });
    let texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto).map_err(|err| err.to_string())
}

fn exportar_backup_interno() -> io::Result<BackupResultado> {
    let destino = backups_dir()?.join(format!(
        "coordenacaoop_backup_{}.zip",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    ));
    let arquivo = fs::File::create(&destino)?;
    let mut zip = ZipWriter::new(arquivo);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut total = 0;

    for nome_raiz in ["dados", "config"] {
        let pasta = app_base_dir()?.join(nome_raiz);
        if pasta.exists() {
            adicionar_pasta_zip(&mut zip, &pasta, nome_raiz, options, &mut total)?;
        }
    }

    let manifesto = serde_json::json!({
        "app": "CoordenacaoOP",
        "versao_app": env!("CARGO_PKG_VERSION"),
        "criado_em": Local::now().to_rfc3339(),
        "formato": 1,
        "total_arquivos": total,
    });
    zip.start_file("backup_manifest.json", options)?;
    zip.write_all(serde_json::to_string_pretty(&manifesto)?.as_bytes())?;
    zip.finish()?;

    Ok(BackupResultado {
        caminho: Some(destino.to_string_lossy().to_string()),
        arquivos: total,
        arquivos_importados: 0,
        conflitos: Vec::new(),
        backup_seguranca: None,
    })
}

fn exportar_backup_ciclos_interno(ciclos: &[String]) -> io::Result<BackupResultado> {
    let ciclos_set = ciclos
        .iter()
        .map(|ciclo| normalizar_chave(ciclo))
        .collect::<BTreeSet<_>>();
    let destino = backups_dir()?.join(format!(
        "coordenacaoop_backup_{}_{}.zip",
        ciclos.join("-").replace(['/', '\\', ' '], "_"),
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    ));
    let arquivo = fs::File::create(&destino)?;
    let mut zip = ZipWriter::new(arquivo);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut total = 0;

    let config = config_dir()?;
    if config.exists() {
        adicionar_pasta_zip(&mut zip, &config, "config", options, &mut total)?;
    }

    let dados = data_dir()?;
    let imagens = dados.join("imagens");
    if imagens.exists() {
        adicionar_pasta_zip(&mut zip, &imagens, "dados", options, &mut total)?;
    }

    let turmas =
        carregar_turmas_com_caminho().map_err(|err| io::Error::new(io::ErrorKind::Other, err))?;
    for (caminho, turma) in turmas {
        let ciclo = turma
            .ciclo
            .as_deref()
            .map(normalizar_chave)
            .unwrap_or_default();
        if ciclos_set.contains(&ciclo) {
            adicionar_arquivo_zip(&mut zip, &caminho, "dados", options, &mut total)?;
        }
    }

    let manifesto = serde_json::json!({
        "app": "CoordenacaoOP",
        "versao_app": env!("CARGO_PKG_VERSION"),
        "criado_em": Local::now().to_rfc3339(),
        "formato": 1,
        "tipo": "seletivo_por_ciclo",
        "ciclos": ciclos,
        "total_arquivos": total,
    });
    zip.start_file("backup_manifest.json", options)?;
    zip.write_all(serde_json::to_string_pretty(&manifesto)?.as_bytes())?;
    zip.finish()?;

    Ok(BackupResultado {
        caminho: Some(destino.to_string_lossy().to_string()),
        arquivos: total,
        arquivos_importados: 0,
        conflitos: Vec::new(),
        backup_seguranca: None,
    })
}

fn adicionar_pasta_zip(
    zip: &mut ZipWriter<fs::File>,
    pasta: &Path,
    nome_raiz: &str,
    options: SimpleFileOptions,
    total: &mut usize,
) -> io::Result<()> {
    for entrada in fs::read_dir(pasta)? {
        let entrada = entrada?;
        let caminho = entrada.path();
        if caminho.is_dir() {
            adicionar_pasta_zip(zip, &caminho, nome_raiz, options, total)?;
        } else if caminho.is_file() {
            adicionar_arquivo_zip(zip, &caminho, nome_raiz, options, total)?;
        }
    }
    Ok(())
}

fn adicionar_arquivo_zip(
    zip: &mut ZipWriter<fs::File>,
    caminho: &Path,
    nome_raiz: &str,
    options: SimpleFileOptions,
    total: &mut usize,
) -> io::Result<()> {
    let relativo = caminho
        .strip_prefix(app_base_dir()?.join(nome_raiz))
        .unwrap_or(caminho);
    let nome_zip = format!(
        "{}/{}",
        nome_raiz,
        relativo.to_string_lossy().replace('\\', "/")
    );
    zip.start_file(nome_zip, options)?;
    let bytes = fs::read(caminho)?;
    zip.write_all(&bytes)?;
    *total += 1;
    Ok(())
}

fn importar_backup_interno(input: BackupImportInput) -> io::Result<BackupResultado> {
    if !input.nome.to_lowercase().ends_with(".zip") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Selecione um arquivo .zip de backup.",
        ));
    }

    let tmp = backups_dir()?.join(format!("_importacao_{}", Local::now().timestamp_millis()));
    fs::create_dir_all(&tmp)?;
    let resultado = (|| {
        let mut zip = ZipArchive::new(Cursor::new(input.bytes))?;
        let nomes = zip.file_names().map(str::to_string).collect::<Vec<_>>();
        if !nomes.iter().any(|nome| nome == "backup_manifest.json") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Backup invalido: manifesto nao encontrado.",
            ));
        }
        let nomes_validos = nomes
            .into_iter()
            .filter(|nome| nome.starts_with("dados/") || nome.starts_with("config/"))
            .collect::<Vec<_>>();
        if nomes_validos.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Backup invalido: nenhum dado encontrado.",
            ));
        }

        for nome in nomes_validos {
            validar_entrada_backup(&nome)?;
            let mut arquivo = zip.by_name(&nome)?;
            if arquivo.is_dir() {
                continue;
            }
            let destino = tmp.join(Path::new(&nome));
            if let Some(parent) = destino.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut saida = fs::File::create(destino)?;
            io::copy(&mut arquivo, &mut saida)?;
        }

        if input.modo == "substituir" {
            let seguranca = exportar_backup_interno().ok().and_then(|info| info.caminho);
            for nome in ["dados", "config"] {
                let destino = app_base_dir()?.join(nome);
                if destino.exists() {
                    fs::remove_dir_all(&destino)?;
                }
                let origem = tmp.join(nome);
                if origem.exists() {
                    copiar_recursivamente(&origem, &destino)?;
                } else {
                    fs::create_dir_all(&destino)?;
                }
            }
            preparar_base_portatil(&app_base_dir()?)?;
            Ok(BackupResultado {
                caminho: None,
                arquivos: 0,
                arquivos_importados: 0,
                conflitos: Vec::new(),
                backup_seguranca: seguranca,
            })
        } else {
            let mut importados = 0;
            let mut conflitos = Vec::new();
            for nome in ["dados", "config"] {
                let origem = tmp.join(nome);
                let destino = app_base_dir()?.join(nome);
                mesclar_recursivamente(&origem, &destino, nome, &mut importados, &mut conflitos)?;
            }
            Ok(BackupResultado {
                caminho: None,
                arquivos: 0,
                arquivos_importados: importados,
                conflitos,
                backup_seguranca: None,
            })
        }
    })();

    let _ = fs::remove_dir_all(&tmp);
    resultado
}

fn importar_alunos_elegiveis_interno(
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

fn ler_csv_alunos_elegiveis(texto: &str) -> Result<Vec<RegistroElegivelCsv>, String> {
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

fn dividir_linha_csv_generico(linha: &str, delimitador: char) -> Vec<String> {
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

fn linha_parece_cabecalho_elegiveis(linha: &[String]) -> bool {
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

fn registro_elegivel_de_linha(cabecalho: &[String], valores: &[String]) -> RegistroElegivelCsv {
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

fn coluna_ra_elegiveis(coluna: &str) -> bool {
    matches!(
        coluna,
        "RA" | "R A" | "REGISTRO DO ALUNO" | "MATRICULA" | "MATRICULA RA"
    )
}

fn coluna_digito_ra_elegiveis(coluna: &str) -> bool {
    matches!(coluna, "DIG RA" | "DIGITO RA" | "DIGITO DO RA")
}

fn coluna_nome_elegiveis(coluna: &str) -> bool {
    matches!(
        coluna,
        "NOME" | "NOME DO ALUNO" | "ALUNO" | "ESTUDANTE" | "NOME COMPLETO"
    )
}

fn coluna_deficiencia_elegiveis(coluna: &str) -> bool {
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

fn extrair_deficiencias_elegiveis(cabecalho: &[String], valores: &[String]) -> Vec<String> {
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

fn normalizar_lista_deficiencias(lista: &[String]) -> Vec<String> {
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

fn normalizar_matricula_elegiveis(valor: String) -> String {
    valor
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase()
}

fn variantes_matricula(valor: &str) -> Vec<String> {
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

fn buscar_por_matricula(matricula: &str, indice: &BTreeMap<String, Vec<usize>>) -> Vec<usize> {
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

fn consolidar_registros_elegiveis(registros: Vec<RegistroElegivelCsv>) -> Vec<RegistroElegivelCsv> {
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

fn extrair_nome_social_backend(nome: &str) -> String {
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

fn validar_entrada_backup(nome: &str) -> io::Result<()> {
    let caminho = Path::new(nome);
    if caminho.is_absolute()
        || caminho
            .components()
            .any(|parte| matches!(parte, std::path::Component::ParentDir))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Backup contem caminho invalido.",
        ));
    }
    if !nome.starts_with("dados/") && !nome.starts_with("config/") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Backup contem arquivo fora das pastas esperadas.",
        ));
    }
    Ok(())
}

fn validar_pasta_sincronizacao(pasta: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(pasta.trim());
    if pasta.trim().is_empty() {
        return Err("Escolha uma pasta compartilhada para a sincronização.".to_string());
    }
    if !path.exists() {
        return Err("A pasta de sincronização não existe.".to_string());
    }
    if !path.is_dir() {
        return Err("O caminho de sincronização precisa ser uma pasta.".to_string());
    }
    Ok(path)
}

fn nome_arquivo_seguro(valor: &str) -> String {
    let normalizado = valor
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if normalizado.is_empty() {
        "instalacao".to_string()
    } else {
        normalizado
    }
}

fn mesclar_recursivamente(
    origem: &Path,
    destino: &Path,
    raiz: &str,
    importados: &mut usize,
    conflitos: &mut Vec<String>,
) -> io::Result<()> {
    if !origem.exists() {
        return Ok(());
    }
    fs::create_dir_all(destino)?;
    for entrada in fs::read_dir(origem)? {
        let entrada = entrada?;
        let caminho_origem = entrada.path();
        let caminho_destino = destino.join(entrada.file_name());
        if caminho_origem.is_dir() {
            mesclar_recursivamente(
                &caminho_origem,
                &caminho_destino,
                raiz,
                importados,
                conflitos,
            )?;
        } else if caminho_destino.exists() {
            let relativo = caminho_destino
                .strip_prefix(app_base_dir()?)
                .unwrap_or(&caminho_destino);
            conflitos.push(format!("{}/{}", raiz, relativo.to_string_lossy()));
        } else {
            if let Some(parent) = caminho_destino.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&caminho_origem, &caminho_destino)?;
            *importados += 1;
        }
    }
    Ok(())
}

fn verificar_atualizacao_interno() -> Result<AtualizacaoInfo, Box<dyn std::error::Error>> {
    let atual = env!("CARGO_PKG_VERSION").to_string();
    let release: GithubRelease = reqwest::blocking::Client::new()
        .get("https://api.github.com/repos/thenriques45-dot/coordenacao-op/releases/latest")
        .header("User-Agent", "CoordenacaoOP")
        .send()?
        .error_for_status()?
        .json()?;
    let disponivel = versao_maior(&release.tag_name, &atual);
    Ok(AtualizacaoInfo {
        versao_atual: atual,
        versao_disponivel: Some(release.tag_name.clone()),
        disponivel,
        url: Some(release.html_url),
        mensagem: if disponivel {
            "Nova versao disponivel.".to_string()
        } else {
            "Voce ja esta usando a versao mais recente.".to_string()
        },
    })
}

#[tauri::command]
fn diagnosticar_ia_local(modelo: Option<String>) -> DiagnosticoIaLocal {
    let modelo = modelo
        .filter(|valor| !valor.trim().is_empty())
        .unwrap_or_else(|| "llama3.2:3b".to_string());
    let ollama_instalado = comando_ollama_disponivel();
    if !ollama_instalado {
        return DiagnosticoIaLocal {
            ollama_instalado,
            servidor_ativo: false,
            modelo_instalado: false,
            modelos: Vec::new(),
            mensagem: "Ollama não encontrado neste computador.".to_string(),
        };
    }

    match modelos_ollama_instalados() {
        Ok(modelos) => {
            let modelo_instalado = modelos.iter().any(|item| item == &modelo);
            DiagnosticoIaLocal {
                ollama_instalado,
                servidor_ativo: true,
                modelo_instalado,
                modelos,
                mensagem: if modelo_instalado {
                    "Assistente local pronto para uso.".to_string()
                } else {
                    format!("Ollama está ativo, mas o modelo {modelo} ainda não foi baixado.")
                },
            }
        }
        Err(err) => DiagnosticoIaLocal {
            ollama_instalado,
            servidor_ativo: false,
            modelo_instalado: false,
            modelos: Vec::new(),
            mensagem: err,
        },
    }
}

#[tauri::command]
fn iniciar_ollama_local() -> Result<DiagnosticoIaLocal, String> {
    if !comando_ollama_disponivel() {
        return Err("Ollama não encontrado neste computador.".to_string());
    }

    if modelos_ollama_instalados().is_err() {
        Command::new("ollama")
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| format!("Não foi possível iniciar o Ollama: {err}"))?;
        std::thread::sleep(std::time::Duration::from_millis(900));
    }

    Ok(diagnosticar_ia_local(Some("llama3.2:3b".to_string())))
}

#[tauri::command]
fn baixar_modelo_ia_local(input: ModeloIaInput) -> Result<DiagnosticoIaLocal, String> {
    let modelo = input.modelo.trim();
    if modelo.is_empty() {
        return Err("Informe o modelo de IA local.".to_string());
    }
    if !comando_ollama_disponivel() {
        return Err("Ollama não encontrado neste computador.".to_string());
    }

    let saida = Command::new("ollama")
        .arg("pull")
        .arg(modelo)
        .output()
        .map_err(|err| format!("Não foi possível executar o download do modelo: {err}"))?;
    if !saida.status.success() {
        let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        return Err(if erro.is_empty() {
            "Não foi possível baixar o modelo. Verifique a conexão da rede.".to_string()
        } else {
            erro
        });
    }

    Ok(diagnosticar_ia_local(Some(modelo.to_string())))
}

#[tauri::command]
fn requisicao_ia_json(input: RequisicaoIaJsonInput) -> Result<RequisicaoIaJsonResultado, String> {
    let url = input.url.trim();
    if !url.starts_with("https://") && !url.starts_with("http://127.0.0.1") && !url.starts_with("http://localhost") {
        return Err("Por segurança, informe uma URL HTTPS ou um servidor local de IA.".to_string());
    }

    let cliente = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|err| format!("Não foi possível preparar a conexão com a IA: {err}"))?;
    let mut requisicao = cliente.post(url).json(&input.body);
    for (chave, valor) in input.headers {
        let chave_normalizada = chave.trim().to_ascii_lowercase();
        if chave_normalizada == "content-type" || chave_normalizada == "authorization" || chave_normalizada == "api-key" || chave_normalizada == "http-referer" || chave_normalizada == "x-title" {
            requisicao = requisicao.header(chave, valor);
        }
    }

    let resposta = requisicao
        .send()
        .map_err(|err| format!("Não foi possível conectar ao provedor de IA: {err}"))?;
    let status = resposta.status().as_u16();
    let texto = resposta
        .text()
        .map_err(|err| format!("Não foi possível ler a resposta da IA: {err}"))?;
    let body = serde_json::from_str::<Value>(&texto).unwrap_or_else(|_| Value::String(texto));
    Ok(RequisicaoIaJsonResultado { status, body })
}

fn comando_ollama_disponivel() -> bool {
    Command::new("ollama")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn modelos_ollama_instalados() -> Result<Vec<String>, String> {
    let resposta = reqwest::blocking::Client::new()
        .get("http://127.0.0.1:11434/api/tags")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .map_err(|_| "Ollama instalado, mas o servidor local não está ativo.".to_string())?
        .error_for_status()
        .map_err(|err| format!("Ollama respondeu com erro: {err}"))?
        .json::<OllamaTagsResponse>()
        .map_err(|err| format!("Não foi possível ler a lista de modelos do Ollama: {err}"))?;
    let mut modelos = resposta
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.name)
        .collect::<Vec<_>>();
    modelos.sort();
    Ok(modelos)
}

fn versao_maior(candidata: &str, atual: &str) -> bool {
    let parse = |texto: &str| {
        texto
            .trim_start_matches('v')
            .split('.')
            .map(|parte| parte.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    let mut a = parse(candidata);
    let mut b = parse(atual);
    while a.len() < 3 {
        a.push(0);
    }
    while b.len() < 3 {
        b.push(0);
    }
    a > b
}

fn preparar_base_portatil(base: &Path) -> io::Result<()> {
    fs::create_dir_all(base)?;
    migrar_dados_legados(base)?;

    for nome in ["dados", "config", "backups"] {
        fs::create_dir_all(base.join(nome))?;
    }
    fs::create_dir_all(base.join("dados").join("persistidos"))?;
    Ok(())
}

fn migrar_dados_legados(base: &Path) -> io::Result<()> {
    let Some(legado) = legacy_user_base_dir() else {
        return Ok(());
    };

    if !legado.exists() || mesmos_caminhos(base, &legado) {
        return Ok(());
    }

    for nome in ["dados", "config", "backups"] {
        let origem = legado.join(nome);
        let destino = base.join(nome);
        if origem.exists() && !destino.exists() {
            copiar_recursivamente(&origem, &destino)?;
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn legacy_user_base_dir() -> Option<PathBuf> {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|base| base.join("CoordenacaoOP").join("CoordenacaoOP"))
}

#[cfg(not(target_os = "windows"))]
fn legacy_user_base_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .map(|base| base.join(".coordenacaoop"))
}

fn mesmos_caminhos(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

fn caminhos_diferentes(a: &Path, b: &Path) -> bool {
    !mesmos_caminhos(a, b)
}

fn validar_conflito_sala(
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

fn normalizar_chave(valor: &str) -> String {
    valor
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-' && *c != '_')
        .flat_map(char::to_lowercase)
        .collect::<String>()
}

fn garantir_caminho_em_pasta(caminho: &Path, pasta: &Path) -> Result<(), String> {
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

fn carregar_turmas_com_caminho() -> Result<Vec<(PathBuf, TurmaArquivo)>, String> {
    let pasta = data_dir()
        .map_err(|err| format!("Nao consegui preparar a pasta de dados: {err}"))?
        .join("persistidos");
    fs::create_dir_all(&pasta).map_err(|err| err.to_string())?;
    let mut turmas = Vec::new();
    visitar_jsons_turma_com_dados(&pasta, &mut turmas)?;
    Ok(turmas)
}

fn visitar_jsons_turma_com_dados(
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
        let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
        let turma: TurmaArquivo = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        turmas.push((caminho, turma));
    }
    Ok(())
}

fn indice_alunos_por_nome(
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

fn destinos_nome_arquivo(
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

fn destinos_aluno_mapao(
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

fn rotulo_aluno_mapao(aluno: &AlunoMapao) -> String {
    if aluno.nome.chars().any(char::is_alphabetic) {
        aluno.nome.clone()
    } else if let Some(numero) = aluno.numero_chamada {
        format!("Número {numero}")
    } else {
        "Aluno sem identificação".to_string()
    }
}

fn aluno_mapao_corresponde_a_inativo(
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

fn aluno_mapao_sem_medias(aluno: &AlunoMapao) -> bool {
    aluno
        .disciplinas
        .iter()
        .all(|(_, media, _, _)| media.is_none())
}

fn alvos_para_mapao(
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

fn mapao_educacao_fisica_misto(dados: &DadosMapao) -> bool {
    dados.disciplinas.len() == 1
        && dados
            .disciplinas
            .iter()
            .next()
            .map(|disciplina| normalizar_texto_basico(disciplina).contains("EDUCACAO FISICA"))
            .unwrap_or(false)
}

fn turma_ensino_medio(turma: &TurmaArquivo) -> bool {
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

fn rotulo_alvos(alvos: &BTreeSet<usize>, turmas: &[(PathBuf, TurmaArquivo)]) -> Option<String> {
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

fn caminho_alvo(alvos: &BTreeSet<usize>, turmas: &[(PathBuf, TurmaArquivo)]) -> Option<String> {
    if alvos.len() != 1 {
        return None;
    }
    let idx = *alvos.iter().next()?;
    turmas
        .get(idx)
        .map(|(caminho, _)| caminho.to_string_lossy().to_string())
}

fn turmas_alvo_por_arquivo(
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

fn identificadores_turma(turma: &TurmaArquivo) -> Vec<String> {
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

fn analisar_arquivo_mapao(
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

fn ler_mapao_bytes(bytes: &[u8]) -> Result<DadosMapao, String> {
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
    })
}

fn ler_diagnostico_bytes(bytes: &[u8]) -> Result<Vec<RegistroDiagnostico>, String> {
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
        .position(linha_parece_cabecalho_diagnostico)
        .ok_or_else(|| "Cabeçalho do diagnóstico não encontrado.".to_string())?;
    let mut registros = Vec::new();
    for linha in linhas.iter().skip(linha_inicio + 1) {
        let turma = texto_celula(linha.get(0)).trim().to_string();
        let estudante = texto_celula(linha.get(2)).trim().to_string();
        if turma.is_empty() && estudante.is_empty() {
            continue;
        }
        if estudante.is_empty() {
            continue;
        }
        registros.push(RegistroDiagnostico {
            turma,
            estudante,
            portugues_ano: texto_celula(linha.get(4)).trim().to_string(),
            portugues_status: texto_celula(linha.get(5)).trim().to_string(),
            matematica_ano: texto_celula(linha.get(6)).trim().to_string(),
            matematica_status: texto_celula(linha.get(7)).trim().to_string(),
        });
    }
    if registros.is_empty() {
        return Err("Não encontrei estudantes válidos na planilha de diagnóstico.".to_string());
    }
    Ok(registros)
}

fn linha_parece_cabecalho_diagnostico(linha: &Vec<Data>) -> bool {
    let rotulos = linha.iter().map(rotulo_celula).collect::<Vec<_>>();
    rotulos.get(0).map(String::as_str) == Some("TURMA")
        && rotulos.get(2).map(String::as_str) == Some("ESTUDANTE")
        && rotulos.iter().filter(|rotulo| rotulo.contains("APRENDIZAGEM")).count() >= 2
        && rotulos.iter().filter(|rotulo| rotulo == &"STATUS").count() >= 2
}

fn analisar_diagnostico_arquivo(
    arquivo: &ArquivoMapaoInput,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> PreviaArquivoDiagnostico {
    let registros = match ler_diagnostico_bytes(&arquivo.bytes) {
        Ok(registros) => registros,
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
    let indice = indice_alunos_por_nome(turmas);
    let mut correspondencias = 0;
    let mut nao_encontrados = Vec::new();
    let mut duplicados = Vec::new();
    let mut turmas_identificadas = BTreeSet::new();

    for registro in &registros {
        if !registro.turma.is_empty() {
            turmas_identificadas.insert(registro.turma.clone());
        }
        let alvos = alvos_para_diagnostico(&registro.turma, turmas);
        let destinos =
            destinos_nome_arquivo(&normalizar_nome_busca(&registro.estudante), &indice, &alvos);
        if destinos.len() == 1 {
            correspondencias += 1;
        } else if destinos.is_empty() {
            nao_encontrados.push(format!("{} ({})", registro.estudante, registro.turma));
        } else {
            duplicados.push(format!("{} ({})", registro.estudante, registro.turma));
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
        turmas_identificadas: turmas_identificadas.into_iter().collect(),
        erro: None,
    }
}

fn analisar_diagnostico_input(
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

fn alvos_para_diagnostico(
    turma_planilha: &str,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> BTreeSet<usize> {
    let texto = normalizar_texto_basico(turma_planilha);
    if texto.is_empty() {
        return BTreeSet::new();
    }
    let tokens_planilha = texto.split_whitespace().collect::<BTreeSet<_>>();
    let mut alvos = BTreeSet::new();
    for (idx, (_, turma)) in turmas.iter().enumerate() {
        let identificadores = [
            normalizar_texto_basico(&turma.codigo),
            turma.serie.as_deref().map(normalizar_texto_basico).unwrap_or_default(),
        ];
        if identificadores.iter().any(|id| !id.is_empty() && texto.contains(id)) {
            alvos.insert(idx);
            continue;
        }
        let codigo_tokens = identificadores[0].split_whitespace().collect::<BTreeSet<_>>();
        if !codigo_tokens.is_empty() && codigo_tokens.is_subset(&tokens_planilha) {
            alvos.insert(idx);
        }
    }
    alvos
}

fn localizar_colunas_bloco(
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
        } else if texto.contains("FALT") && faltas_col.is_none() {
            faltas_col = Some(coluna);
        } else if rotulos.iter().any(|item| item == "F") && faltas_col.is_none() {
            faltas_col = Some(coluna);
        } else if (texto.contains("MED") || texto.contains("NOT")) && media_col.is_none() {
            media_col = Some(coluna);
        } else if rotulos.iter().any(|item| item == "M") && media_col.is_none() {
            media_col = Some(coluna);
        }
    }
    let media_col = media_col.unwrap_or(inicio);
    let faltas_col = faltas_col.or_else(|| (media_col + 1 <= fim).then_some(media_col + 1));
    (media_col, faltas_col, compensacao_col)
}

struct ColunasAlunoMapao {
    nome_col: Option<usize>,
    numero_col: Option<usize>,
    status_col: Option<usize>,
}

fn linha_parece_cabecalho_mapao(linha: &Vec<Data>, proxima_linha: Option<&Vec<Data>>) -> bool {
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

fn localizar_colunas_aluno_mapao(
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

fn rotulo_numero_chamada(rotulo: &str) -> bool {
    matches!(
        rotulo,
        "N" | "N." | "NO" | "Nº" | "NUM" | "NUM." | "NUMERO" | "NUMERO CHAMADA" | "CHAMADA"
    )
}

fn situacao_ativa_mapao(celula: Option<&Data>) -> bool {
    let status = celula.map(rotulo_celula).unwrap_or_default();
    matches!(
        status.as_str(),
        "ATIVO" | "MATRICULADO" | "FREQUENTE" | "ENCERRADO"
    )
}

fn extrair_aulas_disciplina(
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

fn inserir_valor_bimestre(
    info: &mut serde_json::Map<String, Value>,
    campo: &str,
    bimestre: &str,
    disciplina: &str,
    valor: f64,
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
    por_bimestre.insert(
        disciplina.to_string(),
        serde_json::Number::from_f64(valor)
            .map(Value::Number)
            .unwrap_or(Value::Null),
    );
}

fn texto_celula(celula: Option<&Data>) -> String {
    match celula {
        Some(Data::String(texto)) => texto.clone(),
        Some(Data::Float(valor)) => valor.to_string(),
        Some(Data::Int(valor)) => valor.to_string(),
        Some(Data::Bool(valor)) => valor.to_string(),
        _ => String::new(),
    }
}

fn numero_celula(celula: &Data) -> Option<f64> {
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

fn numero_chamada_celula(celula: &Data) -> Option<i64> {
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

fn rotulo_celula(celula: &Data) -> String {
    normalizar_texto_basico(&texto_celula(Some(celula)))
}

fn normalizar_disciplina_mapao(valor: &str) -> String {
    normalizar_texto_basico(valor)
}

fn normalizar_nome_busca(valor: &str) -> String {
    normalizar_texto_basico(valor)
}

fn normalizar_texto_basico_preservando_pontuacao(valor: &str) -> String {
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

fn normalizar_texto_basico(valor: &str) -> String {
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

fn copiar_recursivamente(origem: &Path, destino: &Path) -> io::Result<()> {
    if origem.is_dir() {
        fs::create_dir_all(destino)?;
        for entrada in fs::read_dir(origem)? {
            let entrada = entrada?;
            let origem_item = entrada.path();
            let destino_item = destino.join(entrada.file_name());
            copiar_recursivamente(&origem_item, &destino_item)?;
        }
    } else {
        if let Some(parent) = destino.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(origem, destino)?;
    }
    Ok(())
}

fn copiar_recursivamente_contando(
    origem: &Path,
    destino: &Path,
    total: &mut usize,
) -> io::Result<()> {
    if origem.is_dir() {
        fs::create_dir_all(destino)?;
        for entrada in fs::read_dir(origem)? {
            let entrada = entrada?;
            let origem_item = entrada.path();
            let destino_item = destino.join(entrada.file_name());
            copiar_recursivamente_contando(&origem_item, &destino_item, total)?;
        }
    } else {
        if let Some(parent) = destino.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(origem, destino)?;
        *total += 1;
    }
    Ok(())
}

fn contar_arquivos_recursivamente(pasta: &Path) -> io::Result<usize> {
    if pasta.is_file() {
        return Ok(1);
    }
    let mut total = 0;
    if pasta.is_dir() {
        for entrada in fs::read_dir(pasta)? {
            total += contar_arquivos_recursivamente(&entrada?.path())?;
        }
    }
    Ok(total)
}

fn assinatura_diretorio(pasta: &Path) -> io::Result<String> {
    fn visitar(caminho: &Path, raiz: &Path, partes: &mut Vec<String>) -> io::Result<()> {
        if !caminho.exists() {
            return Ok(());
        }
        if caminho.is_dir() {
            let mut entradas = fs::read_dir(caminho)?.collect::<Result<Vec<_>, io::Error>>()?;
            entradas.sort_by_key(|entrada| entrada.file_name());
            for entrada in entradas {
                visitar(&entrada.path(), raiz, partes)?;
            }
            return Ok(());
        }
        let relativo = caminho
            .strip_prefix(raiz)
            .unwrap_or(caminho)
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = fs::read(caminho)?;
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        relativo.hash(&mut hasher);
        bytes.hash(&mut hasher);
        partes.push(format!("{relativo}:{}:{:x}", bytes.len(), hasher.finish()));
        Ok(())
    }

    let mut partes = Vec::new();
    visitar(pasta, pasta, &mut partes)?;
    Ok(partes.join("|"))
}

fn marcador_sincronizacao_institucional_path() -> io::Result<PathBuf> {
    Ok(config_dir()?.join("sync_institutional_last_applied.txt"))
}

fn ler_marcador_sincronizacao_institucional() -> Option<String> {
    marcador_sincronizacao_institucional_path()
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|texto| texto.trim().to_string())
        .filter(|texto| !texto.is_empty())
}

fn salvar_marcador_sincronizacao_institucional(valor: &str) -> io::Result<()> {
    let path = marcador_sincronizacao_institucional_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, valor)
}

fn visitar_jsons_turma(pasta: &PathBuf, turmas: &mut Vec<TurmaResumo>) -> Result<(), String> {
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

        let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
        let turma: TurmaArquivo = serde_json::from_str(&texto).map_err(|err| err.to_string())?;
        turmas.push(resumir_turma(turma, caminho));
    }
    Ok(())
}

fn resumir_turma(turma: TurmaArquivo, caminho: PathBuf) -> TurmaResumo {
    let conselho_finalizado = turma
        .conselhos
        .as_ref()
        .and_then(|conselhos| conselhos.get("1"))
        .map(conselho_foi_finalizado)
        .unwrap_or(false);
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
    nomes_alunos.sort_by(|a, b| a.cmp(b));

    TurmaResumo {
        codigo: formatar_rotulo_turma_texto(&turma.codigo),
        ano: turma.ano,
        serie: turma.serie.map(|serie| formatar_rotulo_turma_texto(&serie)),
        sala: turma.sala,
        periodo: turma.periodo,
        ciclo: turma.ciclo,
        coordenador_turma: turma.coordenador_turma,
        lider_sala,
        vice_lider_sala,
        total_alunos,
        alunos_ativos,
        alunos_elegiveis,
        nomes_alunos,
        conselhos_com_ajustes,
        conselho_finalizado,
        caminho: caminho.to_string_lossy().to_string(),
    }
}

fn conselho_foi_finalizado(registro: &Value) -> bool {
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

fn aluno_tem_deficiencias(info: &Value) -> bool {
    info.get("deficiencias")
        .and_then(Value::as_array)
        .map(|valores| !valores.is_empty())
        .unwrap_or(false)
}

fn normalizar_lideranca_sala(valor: Option<&str>) -> Option<String> {
    match valor.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "lider" | "líder" => Some("lider".to_string()),
        "vice" | "vice_lider" | "vice-lider" | "vice líder" | "vice lider" => {
            Some("vice".to_string())
        }
        _ => None,
    }
}

fn detalhar_turma(turma: TurmaArquivo, bimestre: &str) -> TurmaDetalhe {
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
        let ativo = info.get("ativo").and_then(Value::as_bool).unwrap_or(true);
        if !ativo {
            continue;
        }

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
            numero_chamada,
            elegivel,
            lideranca_sala,
            deficiencias,
            comentario_educacao_especial,
            frequencia_percentual,
            encaminhamentos: extrair_encaminhamentos(&info, &bimestre),
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

fn normalizar_bimestre(bimestre: &str) -> String {
    match bimestre.trim() {
        "2" => "2".to_string(),
        "3" => "3".to_string(),
        "4" => "4".to_string(),
        _ => "1".to_string(),
    }
}

fn texto_ata_para_turma(turma: &TurmaArquivo, bimestre: &str) -> String {
    if let Some(salvo) = turma
        .textos_ata
        .as_ref()
        .and_then(|textos| textos.get(bimestre))
        .and_then(Value::as_object)
    {
        let cabecalho = salvo
            .get("cabecalho")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let corpo = salvo
            .get("corpo")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let texto = [cabecalho, corpo]
            .into_iter()
            .filter(|parte| !parte.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");
        if !texto.is_empty() && !texto_padrao_antigo(&texto) {
            return texto;
        }
    }

    texto_ata_padrao(turma)
}

fn texto_ata_padrao(turma: &TurmaArquivo) -> String {
    let (direcao_nome, direcao_pronome) = obter_direcao_configurada();
    let artigo = if direcao_pronome == "M" { "do" } else { "da" };
    let titulo_direcao = if direcao_pronome == "M" {
        "Diretor Sr."
    } else {
        "Diretora Sra."
    };
    let cargo_direcao = if direcao_pronome == "M" {
        "diretor"
    } else {
        "diretora"
    };
    let turma_rotulo = rotulo_turma(turma);
    let total = turma
        .alunos
        .as_ref()
        .map(|alunos| alunos.len())
        .unwrap_or(0);
    let frequentes = turma
        .alunos
        .as_ref()
        .map(|alunos| {
            alunos
                .values()
                .filter(|aluno| aluno.get("ativo").and_then(Value::as_bool).unwrap_or(true))
                .count()
        })
        .unwrap_or(0);

    let data_extenso = data_por_extenso(Local::now().date_naive());

    format!(
        "Aos {data_extenso}, reuniram-se presencialmente a presidência {artigo} {titulo_direcao} {direcao_nome}, equipe gestora, professores, estudantes e responsáveis da turma do {turma_rotulo} para procederem ao CONSELHO DE CLASSE.\n\nNa abertura a {cargo_direcao} pautou que no conselho de classe devem ser colocadas situações que mereçam um estudo de caso e registro de alternativas para intervenções pedagógicas que tenham como meta o desenvolvimento do processo ensino/aprendizagem dos alunos. Foram tratados também os seguintes assuntos: (1) levantamento de estudantes que não realizaram nenhuma das atividades e projetos; (2) levantamento de estudantes que necessitam de compensação de ausência; (3) estudantes com defasagem de habilidades e conteúdos para a respectiva série que necessitam de acompanhamento pedagógico; (4) levantamento de estudantes que necessitam de recuperação e aprofundamento. Para efeito de registro documental, verificou-se que a turma é composta por {total} estudantes matriculados, sendo {frequentes} alunos frequentes, e destes estudantes frequentes não alcançaram a menção mínima nas disciplinas:"
    )
}

fn texto_padrao_antigo(texto: &str) -> bool {
    let normalizado = texto.trim();
    normalizado.starts_with("Conselho de classe -")
        || normalizado.starts_with("Durante o conselho de classe,")
        || normalizado.starts_with("Reuniram-se presencialmente a equipe gestora")
        || normalizado.starts_with("Reuniram-se presencialmente a presidência")
}

fn data_por_extenso(data: NaiveDate) -> String {
    format!(
        "{} de {} de {}",
        numero_por_extenso(data.day()),
        mes_por_extenso(data.month()),
        ano_por_extenso(data.year())
    )
}

fn mes_por_extenso(mes: u32) -> &'static str {
    match mes {
        1 => "janeiro",
        2 => "fevereiro",
        3 => "março",
        4 => "abril",
        5 => "maio",
        6 => "junho",
        7 => "julho",
        8 => "agosto",
        9 => "setembro",
        10 => "outubro",
        11 => "novembro",
        12 => "dezembro",
        _ => "",
    }
}

fn ano_por_extenso(ano: i32) -> String {
    if ano == 2026 {
        "dois mil e vinte e seis".to_string()
    } else if (2000..=2099).contains(&ano) {
        let resto = (ano - 2000) as u32;
        if resto == 0 {
            "dois mil".to_string()
        } else {
            format!("dois mil e {}", numero_por_extenso(resto))
        }
    } else {
        ano.to_string()
    }
}

fn numero_por_extenso(numero: u32) -> String {
    match numero {
        0 => "zero".to_string(),
        1 => "um".to_string(),
        2 => "dois".to_string(),
        3 => "três".to_string(),
        4 => "quatro".to_string(),
        5 => "cinco".to_string(),
        6 => "seis".to_string(),
        7 => "sete".to_string(),
        8 => "oito".to_string(),
        9 => "nove".to_string(),
        10 => "dez".to_string(),
        11 => "onze".to_string(),
        12 => "doze".to_string(),
        13 => "treze".to_string(),
        14 => "quatorze".to_string(),
        15 => "quinze".to_string(),
        16 => "dezesseis".to_string(),
        17 => "dezessete".to_string(),
        18 => "dezoito".to_string(),
        19 => "dezenove".to_string(),
        20 => "vinte".to_string(),
        21..=29 => format!("vinte e {}", numero_por_extenso(numero - 20)),
        30 => "trinta".to_string(),
        31 => "trinta e um".to_string(),
        _ => numero.to_string(),
    }
}

fn obter_direcao_configurada() -> (String, String) {
    let caminho = match app_base_dir() {
        Ok(base) => base.join("config").join("configuracoes.json"),
        Err(_) => {
            return (
                "________________________________".to_string(),
                "F".to_string(),
            )
        }
    };
    let Ok(texto) = fs::read_to_string(caminho) else {
        return (
            "________________________________".to_string(),
            "F".to_string(),
        );
    };
    let Ok(dados) = serde_json::from_str::<Value>(&texto) else {
        return (
            "________________________________".to_string(),
            "F".to_string(),
        );
    };
    let nome = dados
        .get("direcao_nome")
        .and_then(Value::as_str)
        .filter(|valor| !valor.trim().is_empty())
        .unwrap_or("________________________________")
        .trim()
        .to_string();
    let pronome = dados
        .get("direcao_pronome")
        .and_then(Value::as_str)
        .unwrap_or("F")
        .trim()
        .to_ascii_uppercase();
    (nome, pronome)
}

fn rotulo_turma(turma: &TurmaArquivo) -> String {
    let serie_formatada = turma
        .serie
        .as_deref()
        .map(formatar_rotulo_turma_texto)
        .unwrap_or_default();
    let codigo_formatado = formatar_rotulo_turma_texto(turma.codigo.trim());
    let serie = serie_formatada.trim();
    let codigo = codigo_formatado.trim();
    let ciclo = turma.ciclo.as_deref().unwrap_or("").trim();

    if ciclo == "EM" && !serie.is_empty() {
        let letra = codigo
            .chars()
            .last()
            .filter(|ch| ch.is_ascii_alphabetic())
            .map(|ch| ch.to_ascii_uppercase().to_string())
            .unwrap_or_default();
        if !letra.is_empty() {
            return format!("{serie} {letra}").trim().to_string();
        }
    }

    if !serie.is_empty() && !codigo.is_empty() {
        if codigo.starts_with(serie) {
            codigo.to_string()
        } else {
            format!("{serie} {codigo}").trim().to_string()
        }
    } else if !codigo.is_empty() {
        codigo.to_string()
    } else {
        serie.to_string()
    }
}

fn extrair_encaminhamentos(info: &Value, bimestre: &str) -> Vec<i64> {
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

fn extrair_diagnostico_aprendizagem(info: &Value) -> Option<DiagnosticoAprendizagem> {
    let dados = info.get("diagnostico_aprendizagem")?.as_object()?;
    Some(DiagnosticoAprendizagem {
        turma_origem: dados.get("turma_origem").and_then(Value::as_str).map(str::to_string),
        portugues: extrair_diagnostico_componente(dados.get("portugues")),
        matematica: extrair_diagnostico_componente(dados.get("matematica")),
        atualizado_em: dados.get("atualizado_em").and_then(Value::as_str).map(str::to_string),
    })
}

fn extrair_diagnostico_componente(valor: Option<&Value>) -> DiagnosticoComponente {
    let objeto = valor.and_then(Value::as_object);
    DiagnosticoComponente {
        aprendizagem_equivalente: objeto
            .and_then(|dados| dados.get("aprendizagem_equivalente"))
            .and_then(Value::as_str)
            .map(str::to_string),
        status: objeto
            .and_then(|dados| dados.get("status"))
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

fn extrair_disciplinas(
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
            nomes.insert(nome.clone());
        }
    }

    let mut disciplinas = nomes
        .into_iter()
        .map(|nome| {
            let media_original = medias
                .and_then(|mapa| mapa.get(&nome))
                .and_then(valor_para_f64);
            let faltas = frequencia
                .and_then(|mapa| mapa.get(&nome))
                .and_then(valor_para_f64);
            let media_conselho = ajustes
                .and_then(|mapa| mapa.get(&nome))
                .and_then(|ajuste| ajuste.get("media_ajustada"))
                .and_then(valor_para_f64);
            let observacao_conselho = ajustes
                .and_then(|mapa| mapa.get(&nome))
                .and_then(|ajuste| ajuste.get("observacao"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let quinto_conceito = medias_5c
                .and_then(|mapa| mapa.get(&nome))
                .and_then(valor_para_f64);
            let total_aulas = aulas
                .and_then(|mapa| mapa.get(&nome))
                .and_then(valor_para_f64);
            let mut faltas_acumuladas = 0.0;
            let mut total_aulas_acumuladas = 0.0;
            for periodo in ["1", "2", "3", "4"] {
                if let Some(valor) = objeto_bimestre(info, "frequencia", periodo)
                    .and_then(|mapa| mapa.get(&nome))
                    .and_then(valor_para_f64)
                {
                    faltas_acumuladas += valor;
                }
                if let Some(valor) = carga_horaria
                    .get(periodo)
                    .and_then(Value::as_object)
                    .and_then(|mapa| mapa.get(&nome))
                    .and_then(valor_para_f64)
                {
                    total_aulas_acumuladas += valor;
                }
            }
            let media_efetiva = media_conselho.or(media_original);
            let historico_bimestres = ["1", "2", "3", "4"]
                .into_iter()
                .filter_map(|periodo| {
                    let media_periodo = objeto_bimestre(info, "ajustes_medias_conselho", periodo)
                        .and_then(|mapa| mapa.get(&nome))
                        .and_then(|ajuste| ajuste.get("media_ajustada"))
                        .and_then(valor_para_f64)
                        .or_else(|| {
                            objeto_bimestre(info, "medias", periodo)
                                .and_then(|mapa| mapa.get(&nome))
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
            }
        })
        .collect::<Vec<_>>();

    disciplinas.sort_by(|a, b| a.nome.cmp(&b.nome));
    disciplinas
}

fn objeto_bimestre<'a>(
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

#[tauri::command]
fn buscar_pei_planilha(url: String) -> Result<Vec<RegistroPei>, String> {
    let id = extrair_id_google_sheet(&url).ok_or_else(|| {
        "URL não reconhecida. Cole o link de compartilhamento do Google Sheets.".to_string()
    })?;
    let csv_url = format!(
        "https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv"
    );
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; CoordenacaoOP)")
        .build()
        .map_err(|err| format!("Erro ao criar cliente HTTP: {err}"))?;
    let resposta = client
        .get(&csv_url)
        .send()
        .map_err(|err| format!("Não foi possível acessar a planilha: {err}"))?;
    if !resposta.status().is_success() {
        return Err(format!(
            "A planilha respondeu com erro {}. Verifique se ela está compartilhada como 'qualquer pessoa com o link'.",
            resposta.status().as_u16()
        ));
    }
    let texto = resposta
        .text()
        .map_err(|err| format!("Erro ao ler o conteúdo da planilha: {err}"))?;
    parsear_csv_pei(&texto)
}

#[tauri::command]
fn salvar_url_pei(url: String) -> Result<(), String> {
    let pasta = data_dir().map_err(|e| e.to_string())?.join("pei");
    fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    escrever_json_atomicamente(&pasta.join("config.json"), &url).map_err(|e| e.to_string())
}

#[tauri::command]
fn carregar_url_pei() -> Result<String, String> {
    let caminho = data_dir()
        .map_err(|e| e.to_string())?
        .join("pei")
        .join("config.json");
    if !caminho.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(caminho).map_err(|e| e.to_string())
}

#[tauri::command]
fn abrir_pei_docx(nome_aluno: String, disciplina: String, bimestre: String) -> Result<(), String> {
    let caminho = data_dir()
        .map_err(|e| e.to_string())?
        .join("relatorios")
        .join("pei")
        .join(sanitizar_segmento(&nome_aluno))
        .join(format!(
            "{}_{}_bimestre.docx",
            sanitizar_segmento(&disciplina),
            sanitizar_segmento(&bimestre)
        ));
    if !caminho.exists() {
        return Err(
            "Documento não gerado ainda. Aguarde a geração automática ou verifique a planilha."
                .to_string(),
        );
    }
    abrir_arquivo(&caminho)
}

#[tauri::command]
fn gerar_peis_lote(registros: Vec<RegistroPei>) -> Result<GerarPeisLoteResultado, String> {
    let pasta_base = data_dir()
        .map_err(|err| err.to_string())?
        .join("relatorios")
        .join("pei");
    fs::create_dir_all(&pasta_base).map_err(|err| err.to_string())?;

    let mut arquivos = 0usize;
    let mut erros: Vec<String> = Vec::new();

    for r in &registros {
        let pasta_aluno = pasta_base.join(sanitizar_segmento(&r.nome_aluno));
        if let Err(e) = fs::create_dir_all(&pasta_aluno) {
            erros.push(format!("{} — pasta: {e}", r.nome_aluno));
            continue;
        }
        let nome_arquivo = format!(
            "{}_{}_bimestre.docx",
            sanitizar_segmento(&r.disciplina),
            sanitizar_segmento(&r.bimestre)
        );
        let caminho = pasta_aluno.join(&nome_arquivo);
        match escrever_pei_docx_individual(&caminho, r) {
            Ok(_) => arquivos += 1,
            Err(e) => erros.push(format!("{} — {}: {e}", r.nome_aluno, r.disciplina)),
        }
    }

    Ok(GerarPeisLoteResultado {
        pasta: pasta_base.to_string_lossy().to_string(),
        arquivos,
        erros,
    })
}

#[tauri::command]
fn listar_alunos_elegiveis_com_disciplinas() -> Result<Vec<AlunoElegiveisComDisciplinas>, String> {
    let turmas = carregar_turmas_com_caminho()?;
    let mut resultado = Vec::new();

    for (_, turma) in &turmas {
        let alunos = match &turma.alunos {
            Some(a) => a,
            None => continue,
        };

        // Coleta disciplinas por bimestre a partir da carga horária.
        let mut disciplinas_por_bimestre: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for bim in ["1", "2", "3", "4"] {
            let disc: Vec<String> = turma
                .carga_horaria
                .as_ref()
                .and_then(|c| c.get(bim))
                .and_then(Value::as_object)
                .map(|obj| obj.keys().cloned().collect())
                .unwrap_or_default();
            if !disc.is_empty() {
                disciplinas_por_bimestre.insert(bim.to_string(), disc);
            }
        }

        // União de todas as disciplinas conhecidas.
        let mut todas: BTreeMap<String, String> = BTreeMap::new();
        for disc in disciplinas_por_bimestre.values().flatten() {
            todas.insert(disc.to_uppercase(), disc.clone());
        }
        let disciplinas: Vec<String> = todas.into_values().collect();

        for (matricula, info) in alunos {
            if !info.get("ativo").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            let elegivel_manual = info
                .get("elegivel_manual")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let tem_deficiencia = info
                .get("deficiencias")
                .and_then(Value::as_array)
                .map(|d| !d.is_empty())
                .unwrap_or(false);
            if !elegivel_manual && !tem_deficiencia {
                continue;
            }

            // Detecta bimestres que já têm pelo menos uma média importada.
            let bimestres_com_medias: Vec<String> = ["1", "2", "3", "4"]
                .iter()
                .filter(|&&bim| {
                    info.get("medias")
                        .and_then(Value::as_object)
                        .and_then(|m| m.get(bim))
                        .and_then(Value::as_object)
                        .map(|obj| !obj.is_empty())
                        .unwrap_or(false)
                })
                .map(|b| b.to_string())
                .collect();

            let nome = info
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            resultado.push(AlunoElegiveisComDisciplinas {
                matricula: matricula.clone(),
                nome,
                turma: rotulo_turma(turma),
                disciplinas: disciplinas.clone(),
                disciplinas_por_bimestre: disciplinas_por_bimestre.clone(),
                bimestres_com_medias,
            });
        }
    }

    resultado.sort_by(|a, b| a.turma.cmp(&b.turma).then(a.nome.cmp(&b.nome)));
    Ok(resultado)
}

fn extrair_id_google_sheet(url: &str) -> Option<String> {
    let pos = url.find("/d/")?;
    let depois = &url[pos + 3..];
    let fim = depois.find(['/', '?']).unwrap_or(depois.len());
    if fim == 0 {
        None
    } else {
        Some(depois[..fim].to_string())
    }
}

fn parsear_csv_pei(texto: &str) -> Result<Vec<RegistroPei>, String> {
    let linhas = parsear_csv_completo(texto);
    if linhas.len() < 2 {
        return Err(
            "A planilha está vazia ou não contém registros de PEI.".to_string(),
        );
    }
    let cabecalho = &linhas[0];
    // normalizar_nome_busca produz MAIÚSCULAS — keywords devem ser maiúsculas.
    let col_idx = |palavras: &[&str]| -> Option<usize> {
        cabecalho.iter().position(|c| {
            let c_norm = normalizar_nome_busca(c);
            palavras.iter().any(|kw| c_norm.contains(kw))
        })
    };
    let idx_timestamp  = col_idx(&["CARIMBO", "TIMESTAMP"]);
    let idx_email      = col_idx(&["ENDERECO", "EMAIL"]);
    let idx_professor  = col_idx(&["PROFESSOR"]);
    let idx_estudante  = col_idx(&["ESTUDANTE"]);
    let idx_disciplina = col_idx(&["COMPONENTE", "CURRICULAR"]);
    // Bimestre: a coluna exata vem antes das questões longas que também contêm "BIMESTRE".
    let idx_bimestre   = col_idx(&["BIMESTRE"]);
    // Conteúdos: busca antes de estratégias para evitar colisão com "HABILIDADE".
    let idx_conteudos    = col_idx(&["CONTEUDO", "HABILIDADE"]);
    let idx_estrategias  = col_idx(&["ESTRATEG", "INTERVEN"]);
    let idx_instrumentos = col_idx(&["INSTRUMENTO"]);
    let idx_recursos     = col_idx(&["VIDEO", "LIVRO", "JOGO", "RECURSO", "APLICAT"]);

    let col = |row: &Vec<String>, idx: Option<usize>| -> String {
        idx.and_then(|i| row.get(i))
            .cloned()
            .unwrap_or_default()
            .trim()
            .to_string()
    };

    let mut registros = Vec::new();
    for linha in linhas.iter().skip(1) {
        if linha.iter().all(|c| c.trim().is_empty()) {
            continue;
        }
        let nome_estudante_completo = col(linha, idx_estudante);
        let (nome_aluno, turma_aluno) = separar_nome_turma_pei(&nome_estudante_completo);
        let bimestre_raw = col(linha, idx_bimestre);
        let bimestre = bimestre_raw
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect::<String>();
        let bimestre = if bimestre.is_empty() {
            bimestre_raw
        } else {
            bimestre
        };

        registros.push(RegistroPei {
            timestamp: col(linha, idx_timestamp),
            email: col(linha, idx_email),
            professor: col(linha, idx_professor),
            nome_estudante_completo,
            nome_aluno,
            turma_aluno,
            disciplina: col(linha, idx_disciplina),
            bimestre,
            conteudos: col(linha, idx_conteudos),
            estrategias: col(linha, idx_estrategias),
            instrumentos: col(linha, idx_instrumentos),
            recursos: col(linha, idx_recursos),
        });
    }

    if registros.is_empty() {
        return Err("Nenhum registro de PEI encontrado na planilha.".to_string());
    }

    Ok(registros)
}

fn parsear_csv_completo(texto: &str) -> Vec<Vec<String>> {
    let mut linhas: Vec<Vec<String>> = Vec::new();
    let mut linha_atual: Vec<String> = Vec::new();
    let mut campo = String::new();
    let mut dentro_aspas = false;
    let chars: Vec<char> = texto.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        if ch == '"' {
            if dentro_aspas && i + 1 < chars.len() && chars[i + 1] == '"' {
                campo.push('"');
                i += 2;
                continue;
            }
            dentro_aspas = !dentro_aspas;
        } else if ch == ',' && !dentro_aspas {
            linha_atual.push(campo.trim().to_string());
            campo = String::new();
        } else if ch == '\n' && !dentro_aspas {
            linha_atual.push(campo.trim().to_string());
            campo = String::new();
            if !linha_atual.is_empty() {
                linhas.push(linha_atual);
                linha_atual = Vec::new();
            }
        } else if ch == '\r' {
            // ignorar CR
        } else {
            campo.push(ch);
        }
        i += 1;
    }
    if !campo.is_empty() || !linha_atual.is_empty() {
        linha_atual.push(campo.trim().to_string());
        if !linha_atual.iter().all(|c| c.is_empty()) {
            linhas.push(linha_atual);
        }
    }
    linhas
}

fn separar_nome_turma_pei(texto: &str) -> (String, String) {
    if let Some(pos) = texto.rfind(" - ") {
        (
            texto[..pos].trim().to_string(),
            texto[pos + 3..].trim().to_string(),
        )
    } else {
        (texto.trim().to_string(), String::new())
    }
}

fn escrever_pei_docx_individual(caminho: &Path, r: &RegistroPei) -> Result<(), String> {
    let mut doc = DocumentoDocx::new();

    // Título conforme modelo oficial
    doc.paragrafo("");
    doc.titulo_pei("ANEXO IV \u{2013} PLANO EDUCACIONAL INDIVIDUALIZADO \u{2013} PEI");
    doc.paragrafo("");

    // Parágrafo introdutório com "acessibilidade" sublinhado
    doc.intro_pei();
    doc.paragrafo("");

    // Campos de identificação
    doc.campo_pei("Nome do Estudante:", &nome_titulo(&r.nome_aluno));
    doc.campo_pei("Nome do Professor Regente:", &r.professor);
    doc.campo_pei("Nome do Professor Especializado da Educação Especial:", "");
    doc.campo_pei("Componente Curricular:", &r.disciplina.to_uppercase());
    doc.periodo_pei(&r.bimestre);
    doc.paragrafo("");

    // Quatro perguntas com respostas
    doc.questao_pei(
        "Quais conteúdos e habilidades do Currículo da Rede Estadual Paulista serão desenvolvidos no bimestre?",
        &r.conteudos,
    );
    doc.questao_pei(
        "Quais estratégias, intervenções pedagógicas e recursos de acessibilidade serão utilizados para favorecer o acesso, a participação e a aprendizagem do estudante?",
        &r.estrategias,
    );
    doc.questao_pei(
        "Quais instrumentos serão utilizados para acompanhar o aprendizado do estudante de forma inclusiva e individualizada?",
        &r.instrumentos,
    );
    doc.questao_pei(
        "Quais vídeos, livros, jogos, exercícios ou outras atividades podem ser indicados para apoiar, complementar, suplementar e fortalecer o aprendizado do estudante neste componente curricular, considerando suas potencialidades, especificidades e ritmo de aprendizagem?",
        &r.recursos,
    );

    // Quatro assinaturas centralizadas ao final da página, duas de cada lado
    doc.assinaturas_pei_final();

    doc.salvar(caminho)
}

fn escrever_pei_aluno_docx(caminho: &Path, input: &GerarPeiAlunoInput) -> Result<(), String> {
    let mut documento = DocumentoDocx::new();

    for (indice, registro) in input.registros.iter().enumerate() {
        if indice > 0 {
            documento.quebra_pagina();
        }

        documento.titulo_ata("PLANO EDUCACIONAL INDIVIDUALIZADO");
        documento.paragrafo("");

        documento.tabela_celulas_com_larguras(
            vec![
                vec![
                    CelulaDocx::texto("Estudante:").negrito().alinhada("left"),
                    CelulaDocx::texto(&nome_titulo(&input.nome_aluno)).alinhada("left"),
                    CelulaDocx::texto("Turma:").negrito().alinhada("left"),
                    CelulaDocx::texto(&input.turma_aluno).alinhada("left"),
                ],
                vec![
                    CelulaDocx::texto("Professor(a):").negrito().alinhada("left"),
                    CelulaDocx::texto(&registro.professor).alinhada("left"),
                    CelulaDocx::texto("Bimestre:").negrito().alinhada("left"),
                    CelulaDocx::texto(&format!("{}º", registro.bimestre)).alinhada("left"),
                ],
                vec![
                    CelulaDocx::texto("Componente:").negrito().alinhada("left"),
                    CelulaDocx::texto(&registro.disciplina).alinhada("left"),
                    CelulaDocx::texto("Data:").negrito().alinhada("left"),
                    CelulaDocx::texto(&registro.timestamp).alinhada("left"),
                ],
            ],
            &[2000, 3550, 1500, 3050],
            false,
        );

        documento.paragrafo("");

        for (titulo, conteudo) in [
            ("1. Conteúdos e habilidades a serem desenvolvidos", &registro.conteudos),
            ("2. Estratégias, intervenções e metodologias de ensino", &registro.estrategias),
            ("3. Instrumentos de avaliação", &registro.instrumentos),
            ("4. Recursos (vídeos, livros, jogos, sites e aplicativos)", &registro.recursos),
        ] {
            documento.tabela_celulas_com_larguras(
                vec![
                    vec![CelulaDocx::texto(titulo)
                        .negrito()
                        .alinhada("left")
                        .com_fundo("E6E6E6")
                        .tamanho(18)],
                    vec![CelulaDocx::texto(conteudo).alinhada("left").tamanho(18)],
                ],
                &[11_100],
                false,
            );
            documento.paragrafo("");
        }

        documento.tabela_celulas_com_larguras(
            vec![vec![
                CelulaDocx::texto(
                    "________________________________\nAssinatura do(a) Professor(a)",
                )
                .centralizada()
                .tamanho(20)
                .sem_borda(),
                CelulaDocx::texto("________________________________\nCoordenação Pedagógica")
                    .centralizada()
                    .tamanho(20)
                    .sem_borda(),
            ]],
            &[5550, 5550],
            false,
        );
    }

    documento.salvar(caminho)
}

// ── fim PEI ──────────────────────────────────────────────────────────────────

fn valor_para_f64(valor: &Value) -> Option<f64> {
    match valor {
        Value::Number(numero) => numero.as_f64(),
        Value::String(texto) => texto.replace(',', ".").parse::<f64>().ok(),
        _ => None,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_info,
            carregar_configuracoes,
            salvar_configuracoes,
            salvar_cabecalho_ata,
            publicar_estado_sincronizacao,
            carregar_estado_sincronizacao,
            publicar_dados_institucionais_sincronizacao,
            carregar_dados_institucionais_sincronizacao,
            exportar_backup,
            exportar_backup_seletivo,
            importar_backup,
            importar_alunos_elegiveis,
            analisar_diagnostico_aprendizagem,
            aplicar_diagnostico_aprendizagem,
            verificar_atualizacao,
            diagnosticar_ia_local,
            iniciar_ollama_local,
            baixar_modelo_ia_local,
            requisicao_ia_json,
            abrir_url,
            abrir_pasta,
            preparar_anexo_kanban,
            abrir_anexo_kanban,
            listar_turmas,
            criar_turma,
            editar_turma,
            excluir_turma,
            analisar_mapoes_lote,
            aplicar_mapoes_lote,
            carregar_turma,
            salvar_ajustes_media,
            salvar_encaminhamentos,
            salvar_tempo_conselho,
            salvar_coordenador_turma,
            salvar_elegibilidade_aluno,
            salvar_lideranca_aluno,
            salvar_educacao_especial_aluno,
            definir_fullscreen,
            abrir_ata,
            abrir_relatorio_professores,
            listar_documentos_conselho,
            abrir_documento_conselho,
            gerar_relatorio_alunos_criticos,
            gerar_relatorio_alteracoes_notas,
            salvar_finalizacao_conselho,
            buscar_pei_planilha,
            salvar_url_pei,
            carregar_url_pei,
            abrir_pei_docx,
            gerar_peis_lote,
            listar_alunos_elegiveis_com_disciplinas
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a nova interface do CoordenacaoOP");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Read;

    fn texto_documento_docx(caminho: &Path) -> String {
        let arquivo = fs::File::open(caminho).unwrap();
        let mut zip = zip::ZipArchive::new(arquivo).unwrap();
        let mut documento = zip.by_name("word/document.xml").unwrap();
        let mut texto = String::new();
        documento.read_to_string(&mut texto).unwrap();
        texto
    }

    #[test]
    fn salvar_ajuste_media_usa_formato_do_app_classico() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "medias": { "1": { "MATEMATICA": 4.0 } }
                }
            }
        });

        aplicar_ajustes_media(
            &mut dados,
            "123",
            "1",
            vec![AjusteMediaInput {
                disciplina: "MATEMATICA".to_string(),
                media_original: Some(4.0),
                media_ajustada: Some(5.5),
                observacao: Some("Ajustar apos conselho".to_string()),
            }],
        )
        .unwrap();

        let ajuste = &dados["alunos"]["123"]["ajustes_medias_conselho"]["1"]["MATEMATICA"];
        assert_eq!(ajuste["media_original"], json!(4.0));
        assert_eq!(ajuste["media_ajustada"], json!(5.5));
        assert_eq!(ajuste["observacao"], json!("Ajustar apos conselho"));
    }

    #[test]
    fn salvar_ajuste_media_em_branco_remove_registro() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "ajustes_medias_conselho": {
                        "1": {
                            "MATEMATICA": {
                                "media_original": 4.0,
                                "media_ajustada": 5.5,
                                "observacao": ""
                            }
                        }
                    }
                }
            }
        });

        aplicar_ajustes_media(
            &mut dados,
            "123",
            "1",
            vec![AjusteMediaInput {
                disciplina: "MATEMATICA".to_string(),
                media_original: Some(4.0),
                media_ajustada: None,
                observacao: None,
            }],
        )
        .unwrap();

        assert!(dados["alunos"]["123"]["ajustes_medias_conselho"]
            .as_object()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn salvar_encaminhamentos_usa_lista_ordenada_sem_repeticao() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE"
                }
            }
        });

        aplicar_encaminhamentos(&mut dados, "123", "1", vec![3, 1, 3, 12]).unwrap();

        assert_eq!(
            dados["alunos"]["123"]["encaminhamentos_conselho"]["1"],
            json!([1, 3])
        );
    }

    #[test]
    fn salvar_encaminhamentos_vazio_remove_bimestre() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "encaminhamentos_conselho": {
                        "1": [1, 3]
                    }
                }
            }
        });

        aplicar_encaminhamentos(&mut dados, "123", "1", vec![]).unwrap();

        assert!(dados["alunos"]["123"]["encaminhamentos_conselho"]
            .as_object()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn salvar_finalizacao_guarda_texto_ata_e_tempo() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {}
        });

        aplicar_finalizacao_conselho(
            &mut dados,
            "1",
            FinalizacaoConselhoInput {
                texto: "Texto completo da ata".to_string(),
                tempo_segundos: 3723,
                gerar_ata: true,
                gerar_relatorio: false,
            },
        )
        .unwrap();

        assert_eq!(dados["textos_ata"]["1"]["cabecalho"], json!(""));
        assert_eq!(
            dados["textos_ata"]["1"]["corpo"],
            json!("Texto completo da ata")
        );
        assert_eq!(dados["conselhos"]["1"]["tempo_segundos"], json!(3723));
        assert_eq!(dados["conselhos"]["1"]["gerar_ata"], json!(true));
        assert_eq!(dados["conselhos"]["1"]["gerar_relatorio"], json!(false));
    }

    #[test]
    fn data_da_ata_fica_por_extenso() {
        let data = NaiveDate::from_ymd_opt(2026, 5, 6).unwrap();

        assert_eq!(
            data_por_extenso(data),
            "seis de maio de dois mil e vinte e seis"
        );
    }

    #[test]
    fn situacao_encerrado_no_mapao_conta_como_aluno_ativo() {
        assert!(situacao_ativa_mapao(Some(&Data::String(
            "Encerrado".to_string()
        ))));
        assert!(!situacao_ativa_mapao(Some(&Data::String(
            "Transferido".to_string()
        ))));
    }

    #[test]
    fn documentos_do_conselho_incluem_tabelas_do_modelo_antigo() {
        let dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "serie": "2a SERIE",
            "sala": "05",
            "carga_horaria": {"1": {"MATEMATICA": 20, "HISTORIA": 20}},
            "alunos": {
                "1": {
                    "nome": "ALUNO TESTE",
                    "ativo": true,
                    "numero_chamada": 1,
                    "frequencia_percentual": 80,
                    "medias": {"1": {"MATEMATICA": 4.0, "HISTORIA": 4.0}},
                    "frequencia": {"1": {"MATEMATICA": 6, "HISTORIA": 0}},
                    "ajustes_medias_conselho": {
                        "1": {
                            "MATEMATICA": {
                                "media_original": 4.0,
                                "media_ajustada": 5.5,
                                "observacao": "Ajustar no diario"
                            }
                        }
                    },
                    "encaminhamentos_conselho": {"1": [3]}
                }
            }
        });
        let pasta = env::temp_dir().join(format!("coordenacaoop_docx_test_{}", std::process::id()));
        fs::create_dir_all(&pasta).unwrap();
        let ata = pasta.join("ata.docx");
        let relatorio = pasta.join("relatorio.docx");

        escrever_ata_docx(&ata, &dados, "1", "Texto base da ata").unwrap();
        escrever_relatorio_professores_docx(&relatorio, &dados, "1").unwrap();

        let xml_ata = texto_documento_docx(&ata);
        assert!(xml_ata.contains("CONSELHO DE CLASSE"));
        assert!(xml_ata.contains("Outras observações e encaminhamentos"));
        assert!(xml_ata.contains("ASSINATURA DOS PROFESSORES"));

        let xml_relatorio = texto_documento_docx(&relatorio);
        assert!(xml_relatorio.contains("Relatório Pedagógico"));
        assert!(xml_relatorio.contains("Ajustar notas na Sala do Futuro"));
        assert!(xml_relatorio.contains("Ajustar no diario"));
        assert!(xml_relatorio.contains("NÃO HÁ AJUSTES DE NOTA NA SALA DO FUTURO"));
        assert!(xml_relatorio.matches("Relatório Pedagógico").count() >= 2);
    }

    #[test]
    fn parse_csv_pei_detecta_colunas_e_bimestre() {
        // Cabeçalhos reais da planilha de PEI do Google Forms
        let csv = "\"Carimbo de data/hora\",\"Endereço de e-mail\",\"Nome do Professor\",\"Nome do Estudante\",\"Componente Curricular\",\"Bimestre\",\"Quais conteúdos e habilidades do Currículo da Rede Estadual Paulista serão desenvolvidos no bimestre?\",\"Quais estratégias, intervenções pedagógicas e recursos de acessibilidade serão utilizados?\",\"Quais instrumentos serão utilizados para acompanhar o aprendizado?\",\"Quais vídeos, livros, jogos ou outras atividades podem ser indicados?\"\n\"26/05/2026 08:23:34\",\"prof@edu.sp.gov.br\",\"Ana Silva\",\"JOAO PEDRO SANTOS - 7° ANO A TARDE\",\"História\",\"1º Bimestre\",\"Modernidade e suas implicações\",\"Comparações visuais e debates\",\"Mapas mentais e textos adaptados\",\"Vídeos do YouTube e HQs\"\n";

        let registros = parsear_csv_pei(csv).expect("parse deve funcionar");
        assert_eq!(registros.len(), 1, "deve ter 1 registro");

        let r = &registros[0];
        assert_eq!(r.professor, "Ana Silva");
        assert_eq!(r.nome_aluno, "JOAO PEDRO SANTOS");
        assert_eq!(r.turma_aluno, "7° ANO A TARDE");
        assert_eq!(r.disciplina, "História");
        assert_eq!(r.bimestre, "1", "bimestre deve ser '1', não '1º Bimestre'");
        assert!(!r.conteudos.is_empty(), "conteúdos não deve ser vazio");
        assert!(!r.estrategias.is_empty(), "estratégias não deve ser vazio");
        assert!(!r.instrumentos.is_empty(), "instrumentos não deve ser vazio");
        assert!(!r.recursos.is_empty(), "recursos não deve ser vazio");
    }

    #[test]
    fn separar_nome_turma_pei_funciona() {
        let (nome, turma) = separar_nome_turma_pei("JOAO PEDRO SANTOS - 7° ANO A TARDE");
        assert_eq!(nome, "JOAO PEDRO SANTOS");
        assert_eq!(turma, "7° ANO A TARDE");

        let (nome2, turma2) = separar_nome_turma_pei("ANA CLARA");
        assert_eq!(nome2, "ANA CLARA");
        assert_eq!(turma2, "");
    }
}
