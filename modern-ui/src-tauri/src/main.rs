use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Cursor,
    env, fs, io,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    stage: &'static str,
    data_dir: String,
}

#[derive(Serialize)]
struct ConfiguracoesApp {
    direcao_nome: String,
    direcao_pronome: String,
    nota_minima: f64,
}

#[derive(Deserialize)]
struct ConfiguracoesInput {
    direcao_nome: String,
    direcao_pronome: String,
    nota_minima: f64,
}

#[derive(Deserialize)]
struct BackupImportInput {
    nome: String,
    bytes: Vec<u8>,
    modo: String,
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
struct TurmaResumo {
    codigo: String,
    ano: i64,
    serie: Option<String>,
    sala: Option<String>,
    periodo: Option<String>,
    ciclo: Option<String>,
    coordenador_turma: Option<String>,
    total_alunos: usize,
    alunos_ativos: usize,
    alunos_elegiveis: usize,
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
struct AlunoDetalhe {
    matricula: String,
    nome: String,
    numero_chamada: Option<i64>,
    elegivel: bool,
    frequencia_percentual: Option<f64>,
    encaminhamentos: Vec<i64>,
    disciplinas: Vec<DisciplinaDetalhe>,
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
    situacao: String,
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

#[derive(Serialize, Clone)]
struct PreviaArquivoMapao {
    nome: String,
    turma_alvo: Option<String>,
    turma_caminho: Option<String>,
    alunos_lidos: usize,
    disciplinas_lidas: usize,
    correspondencias: usize,
    nao_encontrados: usize,
    duplicados: usize,
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
    frequencia_percentual: Option<f64>,
    disciplinas: Vec<(DisciplinaMapao, Option<f64>, Option<f64>, Option<f64>)>,
}

struct DadosMapao {
    alunos: Vec<AlunoMapao>,
    disciplinas: BTreeSet<String>,
}

#[tauri::command]
fn app_info() -> AppInfo {
    let data_dir = data_dir()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| String::new());

    AppInfo {
        name: "CoordenacaoOP",
        stage: "modern-ui-prototype",
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
    };
    salvar_configuracoes_arquivo(&config)?;
    Ok(config)
}

#[tauri::command]
fn exportar_backup() -> Result<BackupResultado, String> {
    exportar_backup_interno().map_err(|err| err.to_string())
}

#[tauri::command]
fn importar_backup(input: BackupImportInput) -> Result<BackupResultado, String> {
    importar_backup_interno(input).map_err(|err| err.to_string())
}

#[tauri::command]
fn verificar_atualizacao() -> Result<AtualizacaoInfo, String> {
    verificar_atualizacao_interno().map_err(|err| err.to_string())
}

#[tauri::command]
fn abrir_url(url: String) -> Result<(), String> {
    let script = format!("Start-Process {}", aspas_powershell(&url));
    Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .spawn()
        .map_err(|err| format!("Nao foi possivel abrir o link: {err}"))?;
    Ok(())
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
    fs::write(&caminho, texto).map_err(|err| err.to_string())?;
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

            if let Some(existente) = alunos_existentes.get_mut(matricula).and_then(Value::as_object_mut) {
                existente.insert("nome".to_string(), Value::String(nome.to_string()));
                existente.insert("numero_chamada".to_string(), aluno.numero_chamada.map(Value::from).unwrap_or(Value::Null));
                existente.insert("ativo".to_string(), Value::Bool(true));
                if !aluno.deficiencias.is_empty() {
                    existente.insert("deficiencias".to_string(), serde_json::json!(aluno.deficiencias));
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

    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    fs::write(&novo_caminho, texto_atualizado).map_err(|err| err.to_string())?;
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
        arquivos.push(analisar_arquivo_mapao(&arquivo, &indice, &turmas, &input.bimestre));
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
            let chave = normalizar_nome_busca(&aluno_mapao.nome);
            let destinos = destinos_nome_arquivo(&chave, &indice, &alvos);
            if destinos.is_empty() {
                continue;
            }
            if destinos.len() != 1 {
                continue;
            }
            let (turma_idx, matricula) = &destinos[0];
            let Some((caminho, turma)) = turmas.get_mut(*turma_idx) else { continue };
            let Some(info) = turma
                .alunos
                .as_mut()
                .and_then(|alunos| alunos.get_mut(matricula))
                .and_then(Value::as_object_mut)
            else {
                continue;
            };

            if let Some(freq) = aluno_mapao.frequencia_percentual {
                let valor = serde_json::Number::from_f64(freq.round()).map(Value::Number).unwrap_or(Value::Null);
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
                    inserir_valor_bimestre(info, "compensacao_ausencias", &bimestre, &disciplina.nome, valor);
                }
                if let Some(aulas) = disciplina.aulas {
                    let carga = turma.carga_horaria.get_or_insert_with(serde_json::Map::new);
                    let por_bimestre = carga
                        .entry(bimestre.clone())
                        .or_insert_with(|| Value::Object(serde_json::Map::new()));
                    if let Some(objeto) = por_bimestre.as_object_mut() {
                        objeto.entry(disciplina.nome.clone()).or_insert_with(|| {
                            serde_json::Number::from_f64(aulas).map(Value::Number).unwrap_or(Value::Null)
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
            fs::write(caminho, texto).map_err(|err| err.to_string())?;
        }
    }

    Ok(ResultadoImportacaoMapoes {
        arquivos,
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
    fs::write(&caminho, texto_atualizado).map_err(|err| err.to_string())?;

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
    fs::write(&caminho, texto_atualizado).map_err(|err| err.to_string())?;

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
    fs::write(&caminho, texto_atualizado).map_err(|err| err.to_string())?;

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
    fs::write(&caminho, texto_atualizado).map_err(|err| err.to_string())?;
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
    fs::write(&caminho, texto_atualizado).map_err(|err| err.to_string())?;
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
    fs::write(&caminho, texto_atualizado).map_err(|err| err.to_string())?;

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
    Ok(())
}

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
}

fn escrever_docx(caminho: &Path, corpo: &str) -> Result<(), String> {
    let arquivo = fs::File::create(caminho).map_err(|err| err.to_string())?;
    let mut zip = ZipWriter::new(arquivo);
    let options = SimpleFileOptions::default();
    let cabecalho = localizar_imagem_cabecalho().and_then(|path| fs::read(path).ok());
    let tem_cabecalho = cabecalho.is_some();

    zip.start_file("[Content_Types].xml", options)
        .map_err(|err| err.to_string())?;
    let content_types = if tem_cabecalho {
        br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>"#.as_slice()
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
        zip.start_file("word/media/cabecalho.jpg", options)
            .map_err(|err| err.to_string())?;
        zip.write_all(&imagem).map_err(|err| err.to_string())?;
        zip.start_file("word/_rels/header1.xml.rels", options)
            .map_err(|err| err.to_string())?;
        zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdCabecalho" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cabecalho.jpg"/></Relationships>"#)
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

fn app_base_dir() -> io::Result<PathBuf> {
    if let Ok(base) = env::var("COORDENACAOOP_HOME") {
        let base = PathBuf::from(base);
        preparar_base_portatil(&base)?;
        return Ok(base);
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let base = parent.to_path_buf();
            preparar_base_portatil(&base)?;
            return Ok(base);
        }
    }

    let base = env::current_dir()?;
    preparar_base_portatil(&base)?;
    Ok(base)
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
    });
    let texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    fs::write(caminho, texto).map_err(|err| err.to_string())
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
            let relativo = caminho.strip_prefix(app_base_dir()?.join(nome_raiz)).unwrap_or(&caminho);
            let nome_zip = format!("{}/{}", nome_raiz, relativo.to_string_lossy().replace('\\', "/"));
            zip.start_file(nome_zip, options)?;
            let bytes = fs::read(caminho)?;
            zip.write_all(&bytes)?;
            *total += 1;
        }
    }
    Ok(())
}

fn importar_backup_interno(input: BackupImportInput) -> io::Result<BackupResultado> {
    if !input.nome.to_lowercase().ends_with(".zip") {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Selecione um arquivo .zip de backup."));
    }

    let tmp = backups_dir()?.join(format!("_importacao_{}", Local::now().timestamp_millis()));
    fs::create_dir_all(&tmp)?;
    let resultado = (|| {
        let mut zip = ZipArchive::new(Cursor::new(input.bytes))?;
        let nomes = zip.file_names().map(str::to_string).collect::<Vec<_>>();
        if !nomes.iter().any(|nome| nome == "backup_manifest.json") {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Backup invalido: manifesto nao encontrado."));
        }
        let nomes_validos = nomes
            .into_iter()
            .filter(|nome| nome.starts_with("dados/") || nome.starts_with("config/"))
            .collect::<Vec<_>>();
        if nomes_validos.is_empty() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Backup invalido: nenhum dado encontrado."));
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

fn validar_entrada_backup(nome: &str) -> io::Result<()> {
    let caminho = Path::new(nome);
    if caminho.is_absolute() || caminho.components().any(|parte| matches!(parte, std::path::Component::ParentDir)) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Backup contem caminho invalido."));
    }
    if !nome.starts_with("dados/") && !nome.starts_with("config/") {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "Backup contem arquivo fora das pastas esperadas."));
    }
    Ok(())
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
            mesclar_recursivamente(&caminho_origem, &caminho_destino, raiz, importados, conflitos)?;
        } else if caminho_destino.exists() {
            let relativo = caminho_destino.strip_prefix(app_base_dir()?).unwrap_or(&caminho_destino);
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
    while a.len() < 3 { a.push(0); }
    while b.len() < 3 { b.push(0); }
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

fn indice_alunos_por_nome(turmas: &[(PathBuf, TurmaArquivo)]) -> BTreeMap<String, Vec<(usize, String)>> {
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

fn alvos_para_mapao(
    nome_arquivo: &str,
    dados: &DadosMapao,
    turmas: &[(PathBuf, TurmaArquivo)],
) -> BTreeSet<usize> {
    let por_arquivo = turmas_alvo_por_arquivo(nome_arquivo, turmas);
    if por_arquivo.len() == 1 {
        return por_arquivo;
    }

    let nomes_mapao = dados
        .alunos
        .iter()
        .map(|aluno| normalizar_nome_busca(&aluno.nome))
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
            let mut duplicados = 0;
            let alvos = alvos_para_mapao(&arquivo.nome, &dados, turmas);
            for aluno in &dados.alunos {
                let destinos = destinos_nome_arquivo(
                    &normalizar_nome_busca(&aluno.nome),
                    indice,
                    &alvos,
                );
                match destinos.len() {
                    0 => nao_encontrados += 1,
                    1 => correspondencias += 1,
                    _ => duplicados += 1,
                }
            }
            PreviaArquivoMapao {
                nome: arquivo.nome.clone(),
                turma_alvo: rotulo_alvos(&alvos, turmas),
                turma_caminho: caminho_alvo(&alvos, turmas),
                alunos_lidos: dados.alunos.len(),
                disciplinas_lidas: dados.disciplinas.len(),
                correspondencias,
                nao_encontrados,
                duplicados,
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
            duplicados: 0,
            erro: Some(err),
        },
    }
}

fn ler_mapao_bytes(bytes: &[u8]) -> Result<DadosMapao, String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook: Xlsx<_> = open_workbook_from_rs(cursor).map_err(|err: XlsxError| err.to_string())?;
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
        .position(|linha| texto_celula(linha.first()).trim().eq_ignore_ascii_case("ALUNO"))
        .ok_or_else(|| "Cabeçalho 'ALUNO' não encontrado no mapão.".to_string())?;

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
    let linha_freq = linha_freq.ok_or_else(|| "Coluna 'Fre An(%)' não encontrada no mapão.".to_string())?;

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
    for linha in linhas.iter().skip(linha_freq + 1) {
        let nome = texto_celula(linha.first()).trim().to_string();
        if nome.is_empty() {
            continue;
        }
        if !situacao_ativa_mapao(linha.get(1)) {
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
            let faltas = disciplina.faltas_col.and_then(|col| linha.get(col)).and_then(numero_celula);
            let compensacao = disciplina.compensacao_col.and_then(|col| linha.get(col)).and_then(numero_celula);
            disciplinas_aluno.push((disciplina.clone(), media, faltas, compensacao));
        }
        alunos.push(AlunoMapao {
            nome,
            frequencia_percentual,
            disciplinas: disciplinas_aluno,
        });
    }

    Ok(DadosMapao {
        alunos,
        disciplinas: disciplinas_lidas,
    })
}

fn localizar_colunas_bloco(
    linhas: &[Vec<Data>],
    linha_inicio: usize,
    linha_freq: usize,
    inicio: usize,
    fim: usize,
) -> (usize, Option<usize>, Option<usize>) {
    let mut media_col = inicio;
    let mut faltas_col = (inicio + 1 <= fim).then_some(inicio + 1);
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
        if rotulos.iter().any(|item| item == "AC") || (texto.contains("COMP") && (texto.contains("AUS") || texto.contains("FALT"))) {
            compensacao_col = Some(coluna);
        } else if texto.contains("FALT") && faltas_col.is_none() {
            faltas_col = Some(coluna);
        } else if rotulos.iter().any(|item| item == "F") && faltas_col.is_none() {
            faltas_col = Some(coluna);
        } else if (texto.contains("MED") || texto.contains("NOT")) && media_col == inicio {
            media_col = coluna;
        } else if rotulos.iter().any(|item| item == "M") && media_col == inicio {
            media_col = coluna;
        }
    }
    (media_col, faltas_col, compensacao_col)
}

fn situacao_ativa_mapao(celula: Option<&Data>) -> bool {
    let status = celula.map(rotulo_celula).unwrap_or_default();
    matches!(status.as_str(), "ATIVO" | "MATRICULADO" | "FREQUENTE")
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
                .map(|celula| normalizar_texto_basico_preservando_pontuacao(&texto_celula(Some(celula))))
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
    let Some(raiz) = raiz.as_object_mut() else { return };
    let por_bimestre = raiz
        .entry(bimestre.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(por_bimestre) = por_bimestre.as_object_mut() else { return };
    por_bimestre.insert(
        disciplina.to_string(),
        serde_json::Number::from_f64(valor).map(Value::Number).unwrap_or(Value::Null),
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
        Data::String(texto) => texto.replace('%', "").replace(',', ".").trim().parse::<f64>().ok(),
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

    for info in alunos.values() {
        let ativo = info.get("ativo").and_then(Value::as_bool).unwrap_or(true);
        if ativo {
            alunos_ativos += 1;
        }

        let elegivel = info
            .get("elegivel_manual")
            .and_then(Value::as_bool)
            .unwrap_or_else(|| aluno_tem_deficiencias(info));
        if elegivel {
            alunos_elegiveis += 1;
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

    TurmaResumo {
        codigo: formatar_rotulo_turma_texto(&turma.codigo),
        ano: turma.ano,
        serie: turma.serie.map(|serie| formatar_rotulo_turma_texto(&serie)),
        sala: turma.sala,
        periodo: turma.periodo,
        ciclo: turma.ciclo,
        coordenador_turma: turma.coordenador_turma,
        total_alunos,
        alunos_ativos,
        alunos_elegiveis,
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
        let frequencia_percentual = info.get("frequencia_percentual").and_then(valor_para_f64);

        alunos_detalhe.push(AlunoDetalhe {
            matricula,
            nome,
            numero_chamada,
            elegivel,
            frequencia_percentual,
            encaminhamentos: extrair_encaminhamentos(&info, &bimestre),
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

    for mapa in [medias, frequencia, ajustes, aulas, medias_5c].into_iter().flatten() {
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
                total_aulas_acumuladas: (total_aulas_acumuladas > 0.0).then_some(total_aulas_acumuladas),
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

fn valor_para_f64(valor: &Value) -> Option<f64> {
    match valor {
        Value::Number(numero) => numero.as_f64(),
        Value::String(texto) => texto.replace(',', ".").parse::<f64>().ok(),
        _ => None,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_info,
            carregar_configuracoes,
            salvar_configuracoes,
            exportar_backup,
            importar_backup,
            verificar_atualizacao,
            abrir_url,
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
            definir_fullscreen,
            abrir_ata,
            abrir_relatorio_professores,
            salvar_finalizacao_conselho
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
}
