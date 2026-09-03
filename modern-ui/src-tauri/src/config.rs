
// Configurações do aplicativo, perfil de turma, alunos destaque e cabeçalho da ata.
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use serde_json::Value;
use std::{
    collections::BTreeSet,
    env, fs, io,
    path::PathBuf,
};


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
    if !modo_notas_ata_valido(&input.modo_notas_ata) {
        return Err("Selecione uma opção válida para exibição de notas na ata.".to_string());
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

    let encaminhamento_opcoes = normalizar_opcoes_encaminhamento(&input.encaminhamento_opcoes);
    let encaminhamento_opcoes = if encaminhamento_opcoes.is_empty() {
        encaminhamento_opcoes_padrao()
    } else {
        encaminhamento_opcoes
    };

    let mensagem_familia_templates =
        normalizar_mensagem_templates(&input.mensagem_familia_templates);
    let mensagem_familia_templates = if mensagem_familia_templates.is_empty() {
        mensagem_familia_templates_padrao()
    } else {
        mensagem_familia_templates
    };

    let config = ConfiguracoesApp {
        direcao_nome: input.direcao_nome.trim().to_uppercase(),
        direcao_pronome: pronome,
        vice_direcao: normalizar_lista_texto(&input.vice_direcao),
        nota_minima: input.nota_minima,
        cabecalho_ata: caminho_cabecalho_ata().map(|path| path.to_string_lossy().to_string()),
        lider_ativo: input.lider_ativo,
        lider_rotulo,
        elegivel_ativo: input.elegivel_ativo,
        elegivel_rotulo,
        atendimento_tipos,
        encaminhamento_opcoes,
        mensagem_familia_templates,
        perfil_turma_ativo: input.perfil_turma_ativo,
        perfil_turma_criterios: if input.perfil_turma_criterios.is_empty() {
            criterios_perfil_padrao()
        } else {
            input.perfil_turma_criterios
        },
        aluno_destaque_ativo: input.aluno_destaque_ativo,
        aluno_destaque_criterios: input.aluno_destaque_criterios,
        modo_notas_ata: input.modo_notas_ata,
        prazo_1_semestre: input.prazo_1_semestre.trim().to_string(),
        prazo_2_semestre: input.prazo_2_semestre.trim().to_string(),
        bimestre_datas_inicio: normalizar_bimestre_datas(&input.bimestre_datas_inicio),
        bimestre_pin: normalizar_bimestre_pin(&input.bimestre_pin),
    };
    salvar_configuracoes_arquivo(&config)?;
    Ok(config)
}

/// Salva apenas os modelos de mensagem à família, sem tocar no resto da
/// configuração. Usado pela tela de Atendimentos ("Gerenciar modelos"), que
/// não carrega o objeto de configuração inteiro.
#[tauri::command]
pub(crate) fn salvar_modelos_mensagem(
    modelos: Vec<MensagemTemplate>,
) -> Result<ConfiguracoesApp, String> {
    let _dados = travar_dados();
    let mut config = ler_configuracoes();
    let modelos = normalizar_mensagem_templates(&modelos);
    config.mensagem_familia_templates = if modelos.is_empty() {
        mensagem_familia_templates_padrao()
    } else {
        modelos
    };
    salvar_configuracoes_arquivo(&config)?;
    Ok(config)
}

/// Sempre devolve 4 posições; cada uma é "" ou uma data ISO "AAAA-MM-DD".
/// Entrada inválida vira "".
pub(crate) fn normalizar_bimestre_datas(datas: &[String]) -> Vec<String> {
    (0..4)
        .map(|i| {
            datas
                .get(i)
                .map(|s| s.trim())
                .filter(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok())
                .unwrap_or("")
                .to_string()
        })
        .collect()
}

/// "" (automático) ou "1".."4".
pub(crate) fn normalizar_bimestre_pin(valor: &str) -> String {
    match valor.trim() {
        "1" | "2" | "3" | "4" => valor.trim().to_string(),
        _ => String::new(),
    }
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
    let encaminhamento_opcoes = dados
        .get("encaminhamento_opcoes")
        .and_then(|v| serde_json::from_value::<Vec<OpcaoEncaminhamento>>(v.clone()).ok())
        .map(|lista| normalizar_opcoes_encaminhamento(&lista))
        .unwrap_or_default();
    let encaminhamento_opcoes = if encaminhamento_opcoes.is_empty() {
        encaminhamento_opcoes_padrao()
    } else {
        encaminhamento_opcoes
    };
    let mensagem_familia_templates = dados
        .get("mensagem_familia_templates")
        .and_then(|v| serde_json::from_value::<Vec<MensagemTemplate>>(v.clone()).ok())
        .map(|lista| normalizar_mensagem_templates(&lista))
        .unwrap_or_default();
    let mensagem_familia_templates = if mensagem_familia_templates.is_empty() {
        mensagem_familia_templates_padrao()
    } else {
        mensagem_familia_templates
    };

    let mut prazo_1_semestre = dados
        .get("prazo_1_semestre")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let mut prazo_2_semestre = dados
        .get("prazo_2_semestre")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    // Migração: essas datas viviam em ConfigPlanejamento (planejamento/config.json)
    // antes de existirem aqui. Lido como Value cru, sem depender do struct
    // ConfigPlanejamento (que perde esses campos) — não apaga o arquivo antigo.
    // Autolimitante: assim que o usuário salvar Configurações uma vez, o valor
    // passa a residir em configuracoes.json e este bloco nunca mais é acionado.
    if prazo_1_semestre.is_empty() && prazo_2_semestre.is_empty() {
        if let Ok(pasta) = data_dir() {
            if let Ok(texto) = fs::read_to_string(pasta.join("planejamento").join("config.json")) {
                if let Ok(legado) = serde_json::from_str::<Value>(&texto) {
                    if let Some(p1) = legado.get("prazo_1_semestre").and_then(Value::as_str) {
                        prazo_1_semestre = p1.to_string();
                    }
                    if let Some(p2) = legado.get("prazo_2_semestre").and_then(Value::as_str) {
                        prazo_2_semestre = p2.to_string();
                    }
                }
            }
        }
    }

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
        vice_direcao: dados
            .get("vice_direcao")
            .and_then(Value::as_array)
            .map(|lista| {
                lista
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .map(|lista| normalizar_lista_texto(&lista))
            .unwrap_or_default(),
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
        encaminhamento_opcoes,
        mensagem_familia_templates,
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
        modo_notas_ata: dados
            .get("modo_notas_ata")
            .and_then(Value::as_str)
            .filter(|valor| modo_notas_ata_valido(valor))
            .map(str::to_string)
            .unwrap_or_else(modo_notas_ata_padrao),
        prazo_1_semestre,
        prazo_2_semestre,
        bimestre_datas_inicio: normalizar_bimestre_datas(
            &dados
                .get("bimestre_datas_inicio")
                .and_then(Value::as_array)
                .map(|lista| {
                    lista
                        .iter()
                        .map(|v| v.as_str().unwrap_or("").to_string())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
        ),
        bimestre_pin: normalizar_bimestre_pin(
            dados.get("bimestre_pin").and_then(Value::as_str).unwrap_or(""),
        ),
    }
}

pub(crate) fn atendimento_tipos_padrao() -> Vec<String> {
    vec![
        "Disciplinar".to_string(),
        "Dúvidas".to_string(),
        "Pedagógico".to_string(),
        "Financeiro".to_string(),
        "Educação especial".to_string(),
        TIPO_ATENDIMENTO_CONTATO_FAMILIA.to_string(),
    ]
}

/// Tipo de atendimento aplicado automaticamente ao registrar uma mensagem
/// enviada ao responsável. A tela do aluno usa esta constante direta, sem
/// depender de a lista configurada conter o item (usuários que já salvaram
/// Configurações antes desta versão não recebem o padrão novo).
pub(crate) const TIPO_ATENDIMENTO_CONTATO_FAMILIA: &str = "Contato com a família";

pub(crate) fn mensagem_familia_templates_padrao() -> Vec<MensagemTemplate> {
    [
        (
            "Cobrança de tarefas",
            "Prezado(a) responsável por {aluno},\n\nVerificamos que o(a) estudante está com {tarefas_pendentes} tarefa(s) pendente(s) no {bimestre} ({tarefas_feitas} de {tarefas_total} concluídas).\n\nPedimos que acompanhe a realização das atividades. Permanecemos à disposição.\n\nAtenciosamente,\nCoordenação Pedagógica — {turma}",
            vec!["Tarefas"],
        ),
        (
            "Excesso de faltas",
            "Prezado(a) responsável por {aluno},\n\nO(A) estudante {aluno_completo} está com frequência de {frequencia} no {bimestre}. O acompanhamento da frequência é essencial para o bom desempenho escolar.\n\nSolicitamos contato com a escola para conversarmos sobre a situação.\n\nAtenciosamente,\nCoordenação Pedagógica — {turma}",
            vec!["Faltas"],
        ),
        (
            "Tarefas + Expansão",
            "Prezado(a) responsável por {aluno},\n\nRegistramos dois pontos de atenção no {bimestre}:\n- Tarefas: {tarefas_pendentes} pendente(s) ({tarefas_feitas} de {tarefas_total}).\n- Expansão: {expansao_dias_sem_acesso} dia(s) sem acesso à plataforma (último acesso em {expansao_ultimo_acesso}).\n\nContamos com o apoio da família no acompanhamento das atividades.\n\nAtenciosamente,\nCoordenação Pedagógica — {turma}",
            vec!["Tarefas", "Expansão"],
        ),
        (
            "Convocação de responsável",
            "Prezado(a) responsável por {aluno},\n\nSolicitamos seu comparecimento à escola para tratarmos da vida escolar do(a) estudante {aluno_completo}, da turma {turma}.\n\nPor favor, entre em contato para agendarmos o melhor horário.\n\nAtenciosamente,\nCoordenação Pedagógica",
            vec!["Convocação"],
        ),
    ]
    .into_iter()
    .enumerate()
    .map(|(indice, (titulo, corpo, tags))| MensagemTemplate {
        id: format!("padrao-{}", indice + 1),
        titulo: titulo.to_string(),
        corpo: corpo.to_string(),
        tags: tags.into_iter().map(str::to_string).collect(),
    })
    .collect()
}

// Preserva o `id` de cada template (para a UI casar edições) e descarta
// entradas totalmente vazias; gera um id estável quando vier em branco ou
// repetido.
pub(crate) fn normalizar_mensagem_templates(lista: &[MensagemTemplate]) -> Vec<MensagemTemplate> {
    let mut vistos = BTreeSet::new();
    let mut saida = Vec::new();
    for (indice, template) in lista.iter().enumerate() {
        let titulo = template.titulo.trim();
        let corpo = template.corpo.trim();
        if titulo.is_empty() && corpo.is_empty() {
            continue;
        }
        let mut id = template.id.trim().to_string();
        if id.is_empty() || !vistos.insert(id.clone()) {
            id = format!("tpl-{}", indice + 1);
            vistos.insert(id.clone());
        }
        saida.push(MensagemTemplate {
            id,
            titulo: titulo.to_string(),
            corpo: corpo.to_string(),
            tags: normalizar_lista_texto(&template.tags),
        });
    }
    saida
}

pub(crate) fn encaminhamento_opcoes_padrao() -> Vec<OpcaoEncaminhamento> {
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
    .into_iter()
    .enumerate()
    .map(|(indice, texto)| OpcaoEncaminhamento { numero: indice as i64 + 1, texto: texto.to_string() })
    .collect()
}

// Preserva o `numero` de cada opção (referenciado pelos encaminhamentos já
// marcados nas turmas salvas) mesmo quando a lista é reordenada, editada ou
// tem itens adicionados/removidos pela coordenação.
pub(crate) fn normalizar_opcoes_encaminhamento(opcoes: &[OpcaoEncaminhamento]) -> Vec<OpcaoEncaminhamento> {
    let mut vistos = BTreeSet::new();
    let mut saida = Vec::new();
    for opcao in opcoes {
        let texto = opcao.texto.trim();
        if texto.is_empty() || opcao.numero <= 0 {
            continue;
        }
        if vistos.insert(opcao.numero) {
            saida.push(OpcaoEncaminhamento { numero: opcao.numero, texto: texto.to_string() });
        }
    }
    saida
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
        "vice_direcao": config.vice_direcao,
        "nota_minima": config.nota_minima,
        "cabecalho_ata": config.cabecalho_ata,
        "lider_ativo": config.lider_ativo,
        "lider_rotulo": config.lider_rotulo,
        "elegivel_ativo": config.elegivel_ativo,
        "elegivel_rotulo": config.elegivel_rotulo,
        "atendimento_tipos": config.atendimento_tipos,
        "encaminhamento_opcoes": config.encaminhamento_opcoes,
        "mensagem_familia_templates": serde_json::to_value(&config.mensagem_familia_templates).unwrap_or_default(),
        "perfil_turma_ativo": config.perfil_turma_ativo,
        "perfil_turma_criterios": serde_json::to_value(&config.perfil_turma_criterios).unwrap_or_default(),
        "aluno_destaque_ativo": config.aluno_destaque_ativo,
        "aluno_destaque_criterios": serde_json::to_value(&config.aluno_destaque_criterios).unwrap_or_default(),
        "modo_notas_ata": config.modo_notas_ata,
        "prazo_1_semestre": config.prazo_1_semestre,
        "prazo_2_semestre": config.prazo_2_semestre,
        "bimestre_datas_inicio": config.bimestre_datas_inicio,
        "bimestre_pin": config.bimestre_pin,
    });
    let texto = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto).map_err(|err| err.to_string())
}

// ── Bimestre atual ────────────────────────────────────────────────────────
//
// O app não tinha uma noção global de "em que bimestre estamos" — cada tela
// herdava um valor que, na prática, ficava preso no 1º. Aqui centralizamos a
// decisão, em ordem de prioridade:
//   1. pin manual (Configurações ou seletor do cabeçalho);
//   2. calendário: última data de início de bimestre já passada;
//   3. dados: maior bimestre que já tem mapão/tarefas/notas importados;
//   4. padrão: 1º.

#[tauri::command]
pub(crate) fn resolver_bimestre_atual() -> BimestreAtualResposta {
    let config = ler_configuracoes();

    let pin = normalizar_bimestre_pin(&config.bimestre_pin);
    if !pin.is_empty() {
        return BimestreAtualResposta { valor: pin, origem: "manual".into() };
    }

    if let Some(b) = bimestre_por_datas(&config.bimestre_datas_inicio) {
        return BimestreAtualResposta { valor: b, origem: "datas".into() };
    }

    if let Some(b) = bimestre_por_dados_importados() {
        return BimestreAtualResposta { valor: b, origem: "dados".into() };
    }

    BimestreAtualResposta { valor: "1".into(), origem: "padrao".into() }
}

/// Grava só o pin do bimestre em `configuracoes.json`, preservando o resto.
/// "" (ou valor inválido) volta para o modo automático.
#[tauri::command]
pub(crate) fn fixar_bimestre_pin(valor: String) -> Result<BimestreAtualResposta, String> {
    let _dados = travar_dados();
    let mut config = ler_configuracoes();
    config.bimestre_pin = normalizar_bimestre_pin(&valor);
    salvar_configuracoes_arquivo(&config)?;
    drop(_dados);
    Ok(resolver_bimestre_atual())
}

fn bimestre_por_datas(datas: &[String]) -> Option<String> {
    let hoje = chrono::Local::now().date_naive();
    let mut atual: Option<u8> = None;
    for (i, data) in datas.iter().enumerate().take(4) {
        if let Ok(d) = chrono::NaiveDate::parse_from_str(data.trim(), "%Y-%m-%d") {
            if d <= hoje {
                atual = Some((i as u8) + 1);
            }
        }
    }
    // Se nenhuma data foi preenchida, não é sinal nenhum → deixa o fallback agir.
    if datas.iter().all(|d| d.trim().is_empty()) {
        return None;
    }
    Some(atual.unwrap_or(1).to_string())
}

fn bimestre_por_dados_importados() -> Option<String> {
    let turmas = carregar_turmas_com_caminho().ok()?;
    let mut maior: u8 = 0;
    for (_, turma) in &turmas {
        let Some(alunos) = &turma.alunos else { continue };
        for info in alunos.values() {
            if let Some(b) = info
                .get("frequencia_percentual_bimestre")
                .and_then(Value::as_str)
                .and_then(|s| s.trim().parse::<u8>().ok())
            {
                maior = maior.max(b);
            }
            for campo in ["medias", "frequencia", "tarefas"] {
                if let Some(obj) = info.get(campo).and_then(Value::as_object) {
                    for chave in obj.keys() {
                        if let Ok(b) = chave.trim().parse::<u8>() {
                            maior = maior.max(b);
                        }
                    }
                }
            }
        }
    }
    (1..=4).contains(&maior).then(|| maior.to_string())
}
