#![allow(unused_imports)]

// Geração de documentos DOCX: ata, relatórios do conselho e utilitários XML.
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


#[tauri::command(async)]
pub(crate) fn abrir_ata(caminho: String, bimestre: String) -> Result<String, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
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

#[tauri::command(async)]
pub(crate) fn abrir_relatorio_professores(caminho: String, bimestre: String) -> Result<String, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
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
pub(crate) fn listar_documentos_conselho(caminho: String) -> Result<Vec<DocumentoConselho>, String> {
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
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
pub(crate) fn abrir_documento_conselho(input: AbrirDocumentoConselhoInput) -> Result<String, String> {
    let caminho = PathBuf::from(input.caminho);
    if !caminho.exists() {
        return Err("Documento não encontrado.".to_string());
    }
    validar_caminho_em_dados(&caminho)?;
    abrir_arquivo(&caminho)?;
    Ok(caminho.to_string_lossy().to_string())
}

#[tauri::command(async)]
pub(crate) fn gerar_relatorio_alunos_criticos(
    input: RelatorioAlunosCriticosInput,
) -> Result<RelatorioAlunosCriticosResultado, String> {
    let _dados = travar_dados();
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

#[tauri::command(async)]
pub(crate) fn gerar_relatorio_alteracoes_notas(
    input: RelatorioAlteracoesNotasInput,
) -> Result<RelatorioAlteracoesNotasResultado, String> {
    let _dados = travar_dados();
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

pub(crate) fn gerar_documento_finalizacao(
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
        let config = ler_configuracoes();
        escrever_ata_docx(&arquivo, dados, bimestre, finalizacao.texto.as_str(), &config)?;
    } else {
        escrever_relatorio_professores_docx(&arquivo, dados, bimestre)?;
    }
    Ok(arquivo)
}

pub(crate) fn localizar_documento_finalizacao(
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

pub(crate) fn nome_documento_finalizacao(prefixo: &str, codigo: &str, bimestre: &str) -> String {
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

pub(crate) fn cor_nivel_perfil(nivel: &str) -> Option<&'static str> {
    match nivel {
        "baixo" => Some("FF9999"),
        "medio" => Some("FFFF99"),
        "alto" => Some("CCFFCC"),
        _ => None,
    }
}

pub(crate) fn escrever_ata_docx(
    caminho: &Path,
    dados: &Value,
    bimestre: &str,
    texto_ata: &str,
    config: &ConfiguracoesApp,
) -> Result<(), String> {
    let modo_notas = config.modo_notas_ata.as_str();
    let titulo = montar_titulo_ata(dados, bimestre);
    let disciplinas = levantar_disciplinas_ata(dados);
    let alunos = preparar_alunos_ata(dados, bimestre, &disciplinas);

    let mut documento = DocumentoDocx::new();
    documento.paragrafo("");
    documento.titulo_ata(&titulo);
    documento.paragrafo("");
    documento.paragrafo_justificado(texto_ata, false, Some(20));

    if config.perfil_turma_ativo && !config.perfil_turma_criterios.is_empty() {
        let apontamentos = dados
            .get("perfil_turma")
            .and_then(|pt| pt.get(bimestre))
            .and_then(Value::as_object)
            .cloned();

        documento.paragrafo("");
        documento.paragrafo_negrito("PERFIL DA TURMA:");

        let mut tabela_perfil = vec![vec![
            CelulaDocx::cabecalho("CRITÉRIOS"),
            CelulaDocx::cabecalho("ESCALA DE OBSERVAÇÃO"),
            CelulaDocx::cabecalho("APONTAMENTO"),
        ]];

        for criterio in &config.perfil_turma_criterios {
            let escala_xml = {
                let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
                let sz = r#"<w:sz w:val="16"/>"#;
                let ppr = r#"<w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>"#;
                let mut runs = String::new();
                for (i, opcao) in criterio.opcoes.iter().enumerate() {
                    if i > 0 {
                        runs.push_str(&format!(
                            r#"<w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve">   </w:t></w:r>"#
                        ));
                    }
                    let cor = match opcao.nivel.as_str() {
                        "baixo" => "CC0000",
                        "medio" => "BB8800",
                        "alto" => "007700",
                        _ => "444444",
                    };
                    runs.push_str(&format!(
                        r#"<w:r><w:rPr>{fonte}<w:color w:val="{cor}"/>{sz}</w:rPr><w:t>&#x25A0;</w:t></w:r>"#
                    ));
                    runs.push_str(&format!(
                        r#"<w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve"> {label}</w:t></w:r>"#,
                        label = escape_xml(&opcao.label)
                    ));
                }
                format!("<w:p>{ppr}{runs}</w:p>")
            };

            let nivel_selecionado = apontamentos
                .as_ref()
                .and_then(|m| m.get(&criterio.id))
                .and_then(Value::as_str)
                .unwrap_or("");

            let label_apontamento = criterio
                .opcoes
                .iter()
                .find(|op| op.nivel == nivel_selecionado)
                .map(|op| op.label.as_str())
                .unwrap_or("");

            let cor_apontamento = cor_nivel_perfil(nivel_selecionado);

            tabela_perfil.push(vec![
                CelulaDocx::texto(&criterio.nome).alinhada("left").tamanho(16),
                CelulaDocx::texto("").com_conteudo_xml(escala_xml),
                CelulaDocx::texto(label_apontamento)
                    .centralizada()
                    .tamanho(16)
                    .fundo_opcional(cor_apontamento),
            ]);
        }

        documento.tabela_celulas_compacta(tabela_perfil, &[3800, 5000, 2300], true);
        documento.paragrafo("");
    }

    if config.aluno_destaque_ativo && !config.aluno_destaque_criterios.is_empty() {
        let nomes_destaque = dados
            .get("alunos_destaque")
            .and_then(|ad| ad.get(bimestre))
            .and_then(Value::as_object)
            .cloned();

        let entradas: Vec<(&CriterioDestaque, &str)> = config
            .aluno_destaque_criterios
            .iter()
            .filter_map(|c| {
                let nome = nomes_destaque
                    .as_ref()
                    .and_then(|m| m.get(&c.id))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if nome.is_empty() { None } else { Some((c, nome)) }
            })
            .collect();

        if !entradas.is_empty() {
            documento.paragrafo_negrito("ALUNOS EM DESTAQUE:");
            let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
            let tabela_dest: Vec<Vec<CelulaDocx>> = entradas
                .into_iter()
                .map(|(criterio, nome)| {
                    let titulo_xml = format!(
                        r#"<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr>{fonte}<w:b/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">{icone} {titulo}</w:t></w:r></w:p>"#,
                        fonte = fonte,
                        icone = escape_xml(&criterio.icone),
                        titulo = escape_xml(&criterio.titulo),
                    );
                    vec![
                        CelulaDocx::texto("").com_conteudo_xml(titulo_xml),
                        CelulaDocx::texto(nome).alinhada("left").tamanho(18),
                    ]
                })
                .collect();
            documento.tabela_celulas_compacta(tabela_dest, &[3800, 7300], false);
            documento.paragrafo("");
        }
    }

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
            let em_defasagem = aluno.defasagens.contains(disciplina);
            let texto = match modo_notas {
                "todas" => aluno
                    .notas
                    .get(disciplina)
                    .map(|nota| formatar_media_docx(Some(*nota)))
                    .unwrap_or_default(),
                "somente_vermelhas" => if em_defasagem {
                    aluno
                        .notas
                        .get(disciplina)
                        .map(|nota| formatar_media_docx(Some(*nota)))
                        .unwrap_or_default()
                } else {
                    String::new()
                },
                _ => if em_defasagem { "X".to_string() } else { String::new() },
            };
            CelulaDocx::texto(&texto)
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

pub(crate) fn larguras_tabela_ata(total_disciplinas: usize) -> Vec<i32> {
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
    larguras.extend(std::iter::repeat_n(largura_disciplina, total_disciplinas));
    larguras.push(largura_freq);
    larguras.push(largura_encaminhamento);
    larguras
}

pub(crate) fn fundo_numero_encaminhamento(numero: usize) -> Option<&'static str> {
    if matches!(numero, 1 | 3 | 5 | 6 | 8 | 10) {
        Some("E6E6E6")
    } else {
        None
    }
}

pub(crate) struct AlunoCriticoRelatorio {
    pub(crate) numero: String,
    pub(crate) nome: String,
    pub(crate) ra: String,
    pub(crate) frequencia: String,
    pub(crate) disciplinas_baixas: Vec<String>,
    pub(crate) motivos: Vec<String>,
}

pub(crate) struct AlteracaoNotaRelatorio {
    pub(crate) numero: String,
    pub(crate) nome: String,
    pub(crate) ra: String,
    pub(crate) disciplina: String,
    pub(crate) media_original: Option<f64>,
    pub(crate) media_conselho: f64,
    pub(crate) media_mapao: Option<f64>,
    pub(crate) situacao: String,
}

pub(crate) struct BlocoAlteracoesNotasRelatorio {
    pub(crate) turma: String,
    pub(crate) pendentes: Vec<AlteracaoNotaRelatorio>,
    pub(crate) alteradas: Vec<AlteracaoNotaRelatorio>,
}

pub(crate) fn levantar_alunos_criticos_turma(
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

pub(crate) fn levantar_alteracoes_notas_turma(
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

pub(crate) fn ordenar_alteracoes_notas(registros: &mut [AlteracaoNotaRelatorio]) {
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

pub(crate) fn notas_equivalentes(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.05
}

pub(crate) fn notas_mesma_faixa(a: f64, b: f64) -> bool {
    (a >= 5.0 && b >= 5.0) || (a < 5.0 && b < 5.0)
}

pub(crate) fn disciplinas_baixas_aluno(info: &Value, bimestre: &str, nota_minima: f64) -> Vec<String> {
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

pub(crate) fn media_aluno_bimestre(info: &Value, bimestre: &str) -> Option<f64> {
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

pub(crate) fn nota_vigente_disciplina(info: &Value, bimestre: &str, disciplina: &str) -> Option<f64> {
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

pub(crate) fn arredondar_media_normal(valor: f64) -> f64 {
    (valor + 0.5).floor()
}

pub(crate) fn escrever_relatorio_alunos_criticos_docx(
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

pub(crate) fn escrever_relatorio_alteracoes_notas_docx(
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

pub(crate) fn escrever_secao_alteracoes_notas(
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

pub(crate) fn rotulo_bimestre_relatorio(bimestre: &str) -> String {
    match bimestre {
        "1" => "1º bimestre".to_string(),
        "2" => "2º bimestre".to_string(),
        "3" => "3º bimestre".to_string(),
        "4" => "4º bimestre/conselho final".to_string(),
        outro => format!("{outro}º bimestre"),
    }
}

pub(crate) fn escrever_relatorio_professores_docx(
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
    // (aluno, média original, média ajustada, disciplina)
    type AjusteConselho = (String, Option<f64>, f64, String);
    let mut por_ajustes: BTreeMap<String, Vec<AjusteConselho>> = BTreeMap::new();
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

pub(crate) fn adicionar_tabela_relatorio(
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

pub(crate) fn montar_titulo_ata(dados: &Value, bimestre: &str) -> String {
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

pub(crate) fn levantar_disciplinas_ata(dados: &Value) -> Vec<String> {
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

pub(crate) struct AlunoAta {
    pub(crate) numero: String,
    pub(crate) nome: String,
    pub(crate) status: String,
    pub(crate) defasagens: BTreeSet<String>,
    pub(crate) notas: BTreeMap<String, f64>,
    pub(crate) frequencia_percentual: String,
    pub(crate) encaminhamento: String,
    pub(crate) linha_amarela: bool,
}

pub(crate) fn preparar_alunos_ata(dados: &Value, bimestre: &str, _disciplinas: &[String]) -> Vec<AlunoAta> {
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
        let mut notas = BTreeMap::new();
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
            if let Some(media) = media_vigente {
                notas.insert(disciplina.clone(), media);
                if media < nota_minima {
                    defasagens.insert(disciplina);
                }
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
            notas,
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

pub(crate) fn status_ata(status: &str) -> &'static str {
    match status {
        "NCOM" => "NCOM",
        "RM" => "REMANEJADO",
        "TR" => "TRANSFERIDO",
        _ => "",
    }
}

pub(crate) fn abreviar_disciplina(disciplina: &str) -> String {
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

pub(crate) fn encaminhamentos_textos() -> [&'static str; 10] {
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

pub(crate) fn obter_nota_minima_configurada() -> f64 {
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

pub(crate) fn nome_titulo(nome: &str) -> String {
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

pub(crate) fn formatar_media_docx(valor: Option<f64>) -> String {
    valor
        .map(|valor| format!("{valor:.1}"))
        .unwrap_or_else(|| "-".to_string())
}

pub(crate) fn formatar_percentual_docx(valor: f64) -> String {
    format!("{}%", valor.round() as i64)
}

pub(crate) fn formatar_numero_sem_decimal(valor: f64) -> String {
    if (valor.fract()).abs() < f64::EPSILON {
        format!("{}", valor as i64)
    } else {
        format!("{valor:.1}")
    }
}

pub(crate) struct DocumentoDocx {
    pub(crate) corpo: String,
}

#[derive(Clone)]
pub(crate) struct CelulaDocx {
    pub(crate) texto: String,
    pub(crate) negrito: bool,
    pub(crate) tamanho: i32,
    pub(crate) alinhamento: &'static str,
    pub(crate) fundo: Option<&'static str>,
    pub(crate) borda: bool,
    pub(crate) valign: &'static str,
    pub(crate) conteudo_xml: Option<String>,
}

impl CelulaDocx {
    pub(crate) fn texto(texto: &str) -> Self {
        Self {
            texto: texto.to_string(),
            negrito: false,
            tamanho: 15,
            alinhamento: "center",
            fundo: None,
            borda: true,
            valign: "center",
            conteudo_xml: None,
        }
    }

    pub(crate) fn cabecalho(texto: &str) -> Self {
        Self::texto(texto).negrito().com_fundo("E6E6E6").tamanho(16)
    }

    pub(crate) fn negrito(mut self) -> Self {
        self.negrito = true;
        self
    }

    pub(crate) fn tamanho(mut self, tamanho: i32) -> Self {
        self.tamanho = tamanho;
        self
    }

    pub(crate) fn centralizada(mut self) -> Self {
        self.alinhamento = "center";
        self
    }

    pub(crate) fn alinhada(mut self, alinhamento: &'static str) -> Self {
        self.alinhamento = alinhamento;
        self
    }

    pub(crate) fn com_fundo(mut self, fundo: &'static str) -> Self {
        self.fundo = Some(fundo);
        self
    }

    pub(crate) fn fundo_opcional(mut self, fundo: Option<&'static str>) -> Self {
        self.fundo = fundo;
        self
    }

    pub(crate) fn sem_borda(mut self) -> Self {
        self.borda = false;
        self
    }

    pub(crate) fn valign_top(mut self) -> Self {
        self.valign = "top";
        self
    }

    pub(crate) fn com_conteudo_xml(mut self, xml: String) -> Self {
        self.conteudo_xml = Some(xml);
        self
    }
}

impl DocumentoDocx {
    pub(crate) fn new() -> Self {
        Self {
            corpo: String::new(),
        }
    }

    pub(crate) fn paragrafo(&mut self, texto: &str) {
        self.corpo.push_str(&paragrafo_docx(texto, false));
    }

    pub(crate) fn paragrafo_negrito(&mut self, texto: &str) {
        self.corpo
            .push_str(&paragrafo_docx_formatado(texto, true, Some(20), None, None));
    }

    pub(crate) fn caixa_aviso(&mut self, texto: &str) {
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

    pub(crate) fn titulo_ata(&mut self, texto: &str) {
        self.corpo.push_str(&paragrafo_docx_formatado(
            texto,
            true,
            Some(28),
            Some("center"),
            Some("800080"),
        ));
    }

    pub(crate) fn paragrafo_justificado(&mut self, texto: &str, negrito: bool, tamanho: Option<i32>) {
        self.corpo.push_str(&paragrafo_docx_formatado(
            texto,
            negrito,
            tamanho,
            Some("both"),
            None,
        ));
    }

    pub(crate) fn quebra_pagina(&mut self) {
        self.corpo
            .push_str(r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#);
    }

    pub(crate) fn tabela(&mut self, linhas: Vec<Vec<String>>, primeira_linha_cabecalho: bool) {
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

    pub(crate) fn tabela_celulas(&mut self, linhas: Vec<Vec<CelulaDocx>>) {
        self.tabela_celulas_com_larguras(linhas, &[], true);
    }

    pub(crate) fn tabela_celulas_com_larguras(
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
            let largura = larguras.get(indice).copied().unwrap_or({
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

    pub(crate) fn tabela_celulas_compacta(
        &mut self,
        linhas: Vec<Vec<CelulaDocx>>,
        larguras: &[i32],
        repetir_primeira_linha: bool,
    ) {
        if linhas.is_empty() {
            return;
        }
        let colunas = linhas.iter().map(Vec::len).max().unwrap_or(0);
        let alguma_borda = linhas.iter().flatten().any(|c| c.borda);
        let bordas = if alguma_borda {
            r#"<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>"#
        } else {
            r#"<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>"#
        };
        self.corpo.push_str(&format!(r#"<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:left w:w="30" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="30" w:type="dxa"/></w:tblCellMar><w:tblLook w:firstColumn="1" w:firstRow="1" w:lastColumn="0" w:lastRow="0" w:noHBand="0" w:noVBand="1" w:val="04A0"/>{bordas}</w:tblPr><w:tblGrid>"#));
        for indice in 0..colunas {
            let largura = larguras.get(indice).copied().unwrap_or(585);
            self.corpo.push_str(&format!(r#"<w:gridCol w:w="{largura}"/>"#));
        }
        self.corpo.push_str("</w:tblGrid>");
        for (indice, linha) in linhas.iter().enumerate() {
            if repetir_primeira_linha && indice == 0 {
                self.corpo.push_str(r#"<w:tr><w:trPr><w:tblHeader w:val="true"/></w:trPr>"#);
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

    pub(crate) fn salvar(self, caminho: &Path) -> Result<(), String> {
        escrever_docx(caminho, &self.corpo)
    }

    // ── Métodos específicos para o PEI ──────────────────────────────────────

    pub(crate) fn titulo_pei(&mut self, texto: &str) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        self.corpo.push_str(&format!(
            r#"<w:p><w:pPr><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr>{fonte}<w:b/><w:u w:val="single"/><w:sz w:val="24"/></w:rPr><w:t>{t}</w:t></w:r></w:p>"#,
            fonte = fonte,
            t = escape_xml(texto)
        ));
    }

    pub(crate) fn intro_pei(&mut self) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="24"/>"#;
        // "PEI: Plano Educacional Individualizado – documento que estabelece a "
        // "acessibilidade" (sublinhado)
        // " curricular, adaptações e estratégias para o acesso ao currículo comum.
        //  (Resolução SEDUC Nº 129, de 30 de setembro de 2025)"
        self.corpo.push_str(r#"<w:p><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="both"/></w:pPr>"#);
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

    pub(crate) fn campo_pei(&mut self, rotulo: &str, valor: &str) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="24"/>"#;
        self.corpo.push_str(r#"<w:p><w:pPr><w:spacing w:before="60" w:after="0"/></w:pPr>"#);
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

    pub(crate) fn periodo_pei(&mut self, bimestre: &str) {
        let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
        let sz = r#"<w:sz w:val="24"/>"#;
        let mut caixas = String::new();
        for (b, label) in [("1", "1\u{00b0} Bimestre"), ("2", "2\u{00ba} Bimestre"),
                            ("3", "3\u{00ba} Bimestre"), ("4", "4\u{00ba} Bimestre")] {
            let marca = if b == bimestre { "X" } else { "  " };
            caixas.push_str(&format!("( {marca} ) {label}  "));
        }
        self.corpo.push_str(r#"<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>"#);
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

    pub(crate) fn questao_pei(&mut self, pergunta: &str, resposta: &str) {
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
    pub(crate) fn assinaturas_pei_final(&mut self) {
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

pub(crate) fn escrever_docx(caminho: &Path, corpo: &str) -> Result<(), String> {
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

pub(crate) fn localizar_imagem_cabecalho() -> Option<PathBuf> {
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

pub(crate) fn caminho_cabecalho_ata() -> Option<PathBuf> {
    data_dir().ok().and_then(|base| {
        ["png", "jpg", "jpeg"]
            .into_iter()
            .map(|ext| base.join("imagens").join(format!("cabecalho_ata.{ext}")))
            .find(|path| path.exists())
    })
}

pub(crate) fn extensao_imagem_cabecalho(nome: &str) -> Option<&'static str> {
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

pub(crate) fn cabecalho_docx_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="4320000" cy="752000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Cabeçalho"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="cabecalho.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdCabecalho"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4320000" cy="752000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>"#.to_string()
}

pub(crate) fn paragrafo_docx(texto: &str, negrito: bool) -> String {
    paragrafo_docx_formatado(texto, negrito, None, None, None)
}

pub(crate) fn paragrafo_docx_formatado(
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

pub(crate) fn celula_docx(celula: &CelulaDocx) -> String {
    let shading = celula
        .fundo
        .map(|cor| format!(r#"<w:shd w:fill="{cor}"/>"#))
        .unwrap_or_default();
    let bordas = if celula.borda {
        String::new()
    } else {
        r#"<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>"#.to_string()
    };
    let valign = celula.valign;
    let conteudo = if let Some(xml) = &celula.conteudo_xml {
        xml.clone()
    } else {
        paragrafo_docx_formatado(
            &celula.texto,
            celula.negrito,
            Some(celula.tamanho),
            Some(celula.alinhamento),
            None,
        )
    };
    format!(
        r#"<w:tc><w:tcPr>{shading}{bordas}<w:vAlign w:val="{valign}"/></w:tcPr>{conteudo}</w:tc>"#,
    )
}

pub(crate) fn bullets_para_xml(texto: &str, tamanho: i32, alinhamento: &str) -> String {
    let fonte = r#"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>"#;
    let sz = format!(r#"<w:sz w:val="{tamanho}"/>"#);
    let alinha = format!(
        r#"<w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/><w:jc w:val="{alinhamento}"/></w:pPr>"#
    );
    let mut resultado = String::new();
    let linhas: Vec<&str> = texto.lines().collect();
    if linhas.is_empty() || texto.trim().is_empty() {
        resultado.push_str(&format!(
            r#"<w:p>{alinha}<w:r><w:rPr>{fonte}{sz}</w:rPr><w:t></w:t></w:r></w:p>"#
        ));
        return resultado;
    }
    for linha in &linhas {
        let linha_trim = linha.trim();
        if linha_trim.is_empty() {
            continue;
        }
        let prefixado = if linha_trim.starts_with('\u{2022}') || linha_trim.starts_with('-') {
            linha_trim.to_string()
        } else {
            format!("\u{2022} {linha_trim}")
        };
        resultado.push_str(&format!(
            r#"<w:p>{alinha}<w:r><w:rPr>{fonte}{sz}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
            escape_xml(&prefixado)
        ));
    }
    if resultado.is_empty() {
        resultado.push_str(&format!(
            r#"<w:p>{alinha}<w:r><w:rPr>{fonte}{sz}</w:rPr><w:t></w:t></w:r></w:p>"#
        ));
    }
    resultado
}

pub(crate) fn escape_xml(texto: &str) -> String {
    texto
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub(crate) fn texto_ata_para_turma(turma: &TurmaArquivo, bimestre: &str) -> String {
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

pub(crate) fn texto_ata_padrao(turma: &TurmaArquivo) -> String {
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

pub(crate) fn texto_padrao_antigo(texto: &str) -> bool {
    let normalizado = texto.trim();
    normalizado.starts_with("Conselho de classe -")
        || normalizado.starts_with("Durante o conselho de classe,")
        || normalizado.starts_with("Reuniram-se presencialmente a equipe gestora")
        || normalizado.starts_with("Reuniram-se presencialmente a presidência")
}

pub(crate) fn data_por_extenso(data: NaiveDate) -> String {
    format!(
        "{} de {} de {}",
        numero_por_extenso(data.day()),
        mes_por_extenso(data.month()),
        ano_por_extenso(data.year())
    )
}

pub(crate) fn mes_por_extenso(mes: u32) -> &'static str {
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

pub(crate) fn ano_por_extenso(ano: i32) -> String {
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

pub(crate) fn numero_por_extenso(numero: u32) -> String {
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

pub(crate) fn obter_direcao_configurada() -> (String, String) {
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

pub(crate) fn rotulo_turma(turma: &TurmaArquivo) -> String {
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
