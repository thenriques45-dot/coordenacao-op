// Renderers: cada formato de saída (docx/xlsx/csv/pdf) sabe transformar as
// seções já resolvidas pelo executor (SecaoResultado — cada uma com suas
// próprias colunas e blocos agrupados) num arquivo. Docx reaproveita o
// builder existente (DocumentoDocx/CelulaDocx); Xlsx reaproveita
// rust_xlsxwriter (já era dependência do projeto, usada hoje só no
// importador); Csv é um writer genérico; Pdf usa genpdf (Rust puro) com uma
// fonte do sistema, já que o projeto não embutia nenhuma fonte TTF até aqui.
//
// A maioria dos relatórios tem 1 seção só (o caso comum); vários formatos
// tratam esse caso especialmente pra não poluir a saída com um cabeçalho de
// seção redundante quando não há nada pra distinguir.
//
// Desde o construtor de blocos, um relatório pode trazer `definicao.blocos`
// preenchido — nesse caso, cada formato monta o documento bloco a bloco
// (cabeçalho/texto/tabela/quebra de página/assinaturas), na ordem escolhida
// na tela, em vez de simplesmente empilhar `secoes`. Relatórios sem
// `blocos` (todo mundo salvo antes desta versão, e os embutidos) continuam
// pelo caminho antigo, sem nenhuma mudança de comportamento.

use std::fs;
use std::path::Path;

use crate::*;

use super::definicao::{Alinhamento, ConteudoBloco, FormatoSaida, ReportDefinition};
use super::executor::{LinhaRelatorio, SecaoResultado};

type Bloco = (Option<String>, Vec<LinhaRelatorio>);

pub(crate) fn renderizar(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    match definicao.formato_saida {
        FormatoSaida::Docx => renderizar_docx(definicao, secoes, bimestre, caminho),
        FormatoSaida::Csv => renderizar_csv(definicao, secoes, bimestre, caminho),
        FormatoSaida::Xlsx => renderizar_xlsx(definicao, secoes, bimestre, caminho),
        FormatoSaida::Pdf => renderizar_pdf(definicao, secoes, bimestre, caminho),
    }
}

fn valor_coluna<'a>(linha: &'a LinhaRelatorio, coluna_id: &str) -> String {
    linha
        .valores
        .iter()
        .find(|(id, _)| id == coluna_id)
        .map(|(_, valor)| valor.como_texto())
        .unwrap_or_default()
}

fn alinhamento_docx(alinhamento: Alinhamento) -> &'static str {
    match alinhamento {
        Alinhamento::Esquerda => "left",
        Alinhamento::Centro => "center",
        Alinhamento::Direita => "right",
    }
}

fn total_linhas(secoes: &[SecaoResultado]) -> usize {
    secoes.iter().flat_map(|secao| &secao.blocos).map(|(_, linhas)| linhas.len()).sum()
}

/// "1" → "1º bimestre" etc. — usado no bloco Cabeçalho e na substituição de
/// `{bimestre}` dentro de blocos de Texto.
fn rotulo_bimestre(bimestre: &str) -> String {
    match bimestre {
        "1" | "2" | "3" | "4" => format!("{bimestre}º bimestre"),
        outro => format!("{outro}º bimestre"),
    }
}

fn substituir_variaveis(texto: &str, bimestre: &str) -> String {
    texto.replace("{bimestre}", &rotulo_bimestre(bimestre))
}

/// A mesma imagem institucional configurada em Configurações › Instituição
/// (`localizar_imagem_cabecalho`, em docx.rs) — o Word já a embute sozinho
/// como cabeçalho de página em todo `.docx` gerado (ver `escrever_docx`),
/// então só Excel e PDF precisam deste carregamento explícito aqui.
fn carregar_imagem_cabecalho_bytes() -> Option<Vec<u8>> {
    let caminho = localizar_imagem_cabecalho()?;
    fs::read(caminho).ok()
}

fn tem_bloco_cabecalho_ativo(definicao: &ReportDefinition) -> bool {
    definicao.blocos.iter().any(|bloco| bloco.ativo && matches!(bloco.conteudo, ConteudoBloco::Cabecalho))
}

/// Carrega a imagem institucional já redimensionada pro PDF, mirando
/// `largura_alvo_mm` de largura (o genpdf calcula o tamanho físico a partir
/// do "dpi" declarado + pixels da imagem, então a gente reverte a conta: dpi
/// = polegadas-por-pixel necessárias pra bater a largura desejada).
/// PNGs com transparência são convertidos pra RGB — o genpdf rejeita canal
/// alfa — em vez de falhar a geração inteira por causa do cabeçalho.
fn carregar_imagem_cabecalho_pdf(largura_alvo_mm: f64) -> Option<genpdf::elements::Image> {
    use image::GenericImageView;

    let bytes = carregar_imagem_cabecalho_bytes()?;
    let decodificada = image::load_from_memory(&bytes).ok()?;
    let sem_alfa = image::DynamicImage::ImageRgb8(decodificada.to_rgb8());
    let (largura_px, _) = sem_alfa.dimensions();
    if largura_px == 0 {
        return None;
    }
    let dpi = 25.4 * largura_px as f64 / largura_alvo_mm;
    genpdf::elements::Image::from_dynamic_image(sem_alfa)
        .ok()
        .map(|imagem| imagem.with_dpi(dpi).with_alignment(genpdf::Alignment::Center))
}

// ───────────────────────────── DOCX ─────────────────────────────

fn preencher_tabela_docx(documento: &mut DocumentoDocx, secao: &SecaoResultado) {
    let linhas_secao: usize = secao.blocos.iter().map(|(_, linhas)| linhas.len()).sum();
    if let Some(titulo) = &secao.titulo {
        documento.paragrafo_negrito(titulo);
    }
    if linhas_secao == 0 {
        documento.caixa_aviso("Nenhum registro encontrado para os filtros selecionados.");
        return;
    }

    let larguras: Vec<i32> = secao.colunas.iter().map(|coluna| coluna.largura.unwrap_or(1500)).collect();
    for (indice_bloco, (rotulo_grupo, linhas)) in secao.blocos.iter().enumerate() {
        if linhas.is_empty() {
            continue;
        }
        if indice_bloco > 0 {
            documento.paragrafo("");
        }
        if let Some(rotulo) = rotulo_grupo {
            documento.paragrafo_negrito(&format!("{} - {} registro(s)", rotulo, linhas.len()));
        }
        let mut tabela: Vec<Vec<CelulaDocx>> =
            vec![secao.colunas.iter().map(|coluna| CelulaDocx::cabecalho(&coluna.rotulo)).collect()];
        for linha in linhas {
            tabela.push(
                secao
                    .colunas
                    .iter()
                    .map(|coluna| CelulaDocx::texto(&valor_coluna(linha, &coluna.id)).alinhada(alinhamento_docx(coluna.alinhamento)))
                    .collect(),
            );
        }
        documento.tabela_celulas_com_larguras(tabela, &larguras, true);
    }
}

fn assinatura_docx(documento: &mut DocumentoDocx, nomes: &[String]) {
    if nomes.is_empty() {
        return;
    }
    documento.paragrafo("");
    for nome in nomes {
        documento.paragrafo_justificado("_______________________________________", false, None);
        documento.paragrafo(nome);
        documento.paragrafo("");
    }
}

fn renderizar_docx_blocos(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    let mut documento = DocumentoDocx::new();
    let mut teve_conteudo = false;

    for bloco in &definicao.blocos {
        if !bloco.ativo {
            continue;
        }
        match &bloco.conteudo {
            ConteudoBloco::Cabecalho => {
                documento.titulo_ata(&definicao.nome.to_uppercase());
                documento.paragrafo(&format!("Coordenação Pedagógica · {}", rotulo_bimestre(bimestre)));
                teve_conteudo = true;
            }
            ConteudoBloco::Texto { titulo, corpo } => {
                if let Some(titulo) = titulo {
                    if !titulo.trim().is_empty() {
                        documento.paragrafo_negrito(titulo);
                    }
                }
                if !corpo.trim().is_empty() {
                    documento.paragrafo(&substituir_variaveis(corpo, bimestre));
                }
                teve_conteudo = true;
            }
            ConteudoBloco::Tabela { secao_index } => {
                if let Some(secao) = secoes.get(*secao_index) {
                    preencher_tabela_docx(&mut documento, secao);
                    teve_conteudo = true;
                }
            }
            ConteudoBloco::QuebraPagina => documento.quebra_pagina(),
            ConteudoBloco::Espacador => {
                documento.paragrafo("");
                documento.paragrafo("");
            }
            ConteudoBloco::Assinaturas { nomes } => {
                assinatura_docx(&mut documento, nomes);
                teve_conteudo = teve_conteudo || !nomes.is_empty();
            }
            ConteudoBloco::Parametros => {}
        }
    }

    if !teve_conteudo {
        documento.caixa_aviso("Este relatório não tem nenhum bloco de conteúdo ativo.");
    }
    documento.salvar(caminho)
}

fn renderizar_docx(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    if !definicao.blocos.is_empty() {
        return renderizar_docx_blocos(definicao, secoes, bimestre, caminho);
    }

    let mut documento = DocumentoDocx::new();
    documento.titulo_ata(&definicao.nome.to_uppercase());
    if !definicao.descricao.is_empty() {
        documento.paragrafo(&definicao.descricao);
    }
    documento.paragrafo_negrito(&format!("Gerado em {}", chrono::Local::now().format("%d/%m/%Y %H:%M")));

    if total_linhas(secoes) == 0 {
        documento.caixa_aviso("Nenhum registro encontrado para os filtros selecionados.");
        return documento.salvar(caminho);
    }

    for (indice_secao, secao) in secoes.iter().enumerate() {
        if indice_secao > 0 {
            documento.paragrafo("");
        }
        preencher_tabela_docx(&mut documento, secao);
    }

    documento.salvar(caminho)
}

// ───────────────────────────── CSV ─────────────────────────────

fn escrever_bloco_csv(conteudo: &mut String, secao: &SecaoResultado, tem_grupo: bool) {
    let mut cabecalhos: Vec<String> = Vec::new();
    if tem_grupo {
        cabecalhos.push("Grupo".to_string());
    }
    cabecalhos.extend(secao.colunas.iter().map(|coluna| coluna.rotulo.clone()));
    conteudo.push_str(&cabecalhos.join(";"));
    conteudo.push('\n');

    for (rotulo_grupo, linhas) in &secao.blocos {
        for linha in linhas {
            let mut campos: Vec<String> = Vec::new();
            if tem_grupo {
                campos.push(rotulo_grupo.clone().unwrap_or_default());
            }
            for coluna in secao.colunas {
                campos.push(valor_coluna(linha, &coluna.id).replace(';', ","));
            }
            conteudo.push_str(&campos.join(";"));
            conteudo.push('\n');
        }
    }
}

fn tem_grupo_secao(secao: &SecaoResultado) -> bool {
    secao.blocos.len() > 1 || secao.blocos.first().is_some_and(|(rotulo, _)| rotulo.is_some())
}

fn renderizar_csv_blocos(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    let mut conteudo = String::from("\u{FEFF}");
    let mut teve_conteudo = false;

    for bloco in &definicao.blocos {
        if !bloco.ativo {
            continue;
        }
        match &bloco.conteudo {
            ConteudoBloco::Cabecalho => {
                conteudo.push_str(&format!("{}\n", definicao.nome));
                conteudo.push_str(&format!("Coordenação Pedagógica · {}\n\n", rotulo_bimestre(bimestre)));
                teve_conteudo = true;
            }
            ConteudoBloco::Texto { titulo, corpo } => {
                if let Some(titulo) = titulo {
                    if !titulo.trim().is_empty() {
                        conteudo.push_str(&format!("{titulo}\n"));
                    }
                }
                if !corpo.trim().is_empty() {
                    conteudo.push_str(&format!("{}\n\n", substituir_variaveis(corpo, bimestre).replace('\n', " ")));
                }
                teve_conteudo = true;
            }
            ConteudoBloco::Tabela { secao_index } => {
                if let Some(secao) = secoes.get(*secao_index) {
                    if let Some(titulo) = &secao.titulo {
                        conteudo.push_str(&format!("# {titulo}\n"));
                    }
                    escrever_bloco_csv(&mut conteudo, secao, tem_grupo_secao(secao));
                    conteudo.push('\n');
                    teve_conteudo = true;
                }
            }
            ConteudoBloco::QuebraPagina => conteudo.push('\n'),
            ConteudoBloco::Espacador => conteudo.push_str("\n\n"),
            ConteudoBloco::Assinaturas { nomes } => {
                for nome in nomes {
                    conteudo.push_str(&format!("_____________________;{nome}\n"));
                }
                if !nomes.is_empty() {
                    conteudo.push('\n');
                    teve_conteudo = true;
                }
            }
            ConteudoBloco::Parametros => {}
        }
    }

    if !teve_conteudo {
        conteudo.push_str("Este relatório não tem nenhum bloco de conteúdo ativo.\n");
    }
    fs::write(caminho, conteudo.as_bytes()).map_err(|err| err.to_string())
}

fn renderizar_csv(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    if !definicao.blocos.is_empty() {
        return renderizar_csv_blocos(definicao, secoes, bimestre, caminho);
    }

    let mut conteudo = String::from("\u{FEFF}");
    for (indice, secao) in secoes.iter().enumerate() {
        if indice > 0 {
            conteudo.push('\n');
            if let Some(titulo) = &secao.titulo {
                conteudo.push_str(&format!("# {titulo}\n"));
            }
        }
        escrever_bloco_csv(&mut conteudo, secao, tem_grupo_secao(secao));
    }
    fs::write(caminho, conteudo.as_bytes()).map_err(|err| err.to_string())
}

// ───────────────────────────── XLSX ─────────────────────────────

fn nome_aba_planilha(base: &str) -> String {
    let filtrado: String = base
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | '*' | '?' | ':' | '[' | ']'))
        .take(31)
        .collect();
    if filtrado.trim().is_empty() {
        "Relatório".to_string()
    } else {
        filtrado
    }
}

fn escrever_secao_xlsx(
    workbook: &mut rust_xlsxwriter::Workbook,
    definicao: &ReportDefinition,
    secao: &SecaoResultado,
    multiplas_secoes: bool,
    fmt_cabecalho: &rust_xlsxwriter::Format,
) -> Result<(), String> {
    let blocos_com_dados: Vec<&Bloco> = secao.blocos.iter().filter(|(_, linhas)| !linhas.is_empty()).collect();
    if blocos_com_dados.is_empty() {
        let planilha = workbook.add_worksheet();
        planilha
            .set_name(nome_aba_planilha(secao.titulo.as_deref().unwrap_or(&definicao.nome)))
            .map_err(|err| err.to_string())?;
        planilha
            .write_string(0, 0, "Nenhum registro nesta seção.")
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    for (rotulo_grupo, linhas) in blocos_com_dados {
        let nome_base = match (&secao.titulo, rotulo_grupo) {
            (Some(titulo), Some(rotulo)) if multiplas_secoes => format!("{titulo} — {rotulo}"),
            (Some(titulo), None) if multiplas_secoes => titulo.clone(),
            (_, Some(rotulo)) => rotulo.clone(),
            (Some(titulo), None) => titulo.clone(),
            (None, None) => definicao.nome.clone(),
        };
        let planilha = workbook.add_worksheet();
        planilha.set_name(nome_aba_planilha(&nome_base)).map_err(|err| err.to_string())?;

        for (indice, coluna) in secao.colunas.iter().enumerate() {
            planilha
                .write_with_format(0, indice as u16, &coluna.rotulo, fmt_cabecalho)
                .map_err(|err| err.to_string())?;
        }
        for (linha_idx, linha) in linhas.iter().enumerate() {
            let linha_planilha = (linha_idx + 1) as u32;
            for (coluna_idx, coluna) in secao.colunas.iter().enumerate() {
                let texto = valor_coluna(linha, &coluna.id);
                let valor_numerico = linha
                    .valores
                    .iter()
                    .find(|(id, _)| id == &coluna.id)
                    .and_then(|(_, valor)| valor.como_numero());
                match valor_numerico {
                    Some(numero) => planilha
                        .write_number(linha_planilha, coluna_idx as u16, numero)
                        .map_err(|err| err.to_string())?,
                    None => planilha
                        .write_string(linha_planilha, coluna_idx as u16, &texto)
                        .map_err(|err| err.to_string())?,
                };
            }
        }
    }
    Ok(())
}

fn renderizar_xlsx_blocos(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    use rust_xlsxwriter::{Format, Workbook};

    let mut workbook = Workbook::new();
    let fmt_titulo = Format::new().set_bold().set_font_size(14.0);
    let fmt_cabecalho = Format::new().set_bold();

    // Cabeçalho/texto/assinaturas viram linhas de uma planilha de rosto;
    // tabelas continuam uma aba por bloco de dados, como sempre.
    let mut linhas_capa: Vec<(String, bool)> = Vec::new();
    let mut indices_tabela: Vec<usize> = Vec::new();

    for bloco in &definicao.blocos {
        if !bloco.ativo {
            continue;
        }
        match &bloco.conteudo {
            ConteudoBloco::Cabecalho => {
                linhas_capa.push((definicao.nome.clone(), true));
                linhas_capa.push((format!("Coordenação Pedagógica · {}", rotulo_bimestre(bimestre)), false));
                linhas_capa.push((String::new(), false));
            }
            ConteudoBloco::Texto { titulo, corpo } => {
                if let Some(titulo) = titulo {
                    if !titulo.trim().is_empty() {
                        linhas_capa.push((titulo.clone(), true));
                    }
                }
                if !corpo.trim().is_empty() {
                    linhas_capa.push((substituir_variaveis(corpo, bimestre), false));
                }
                linhas_capa.push((String::new(), false));
            }
            ConteudoBloco::Tabela { secao_index } => indices_tabela.push(*secao_index),
            ConteudoBloco::Espacador => {
                linhas_capa.push((String::new(), false));
                linhas_capa.push((String::new(), false));
            }
            ConteudoBloco::QuebraPagina | ConteudoBloco::Parametros => {}
            ConteudoBloco::Assinaturas { nomes } => {
                for nome in nomes {
                    linhas_capa.push((format!("_____________________  {nome}"), false));
                }
                if !nomes.is_empty() {
                    linhas_capa.push((String::new(), false));
                }
            }
        }
    }

    let mut teve_aba = false;
    if !linhas_capa.is_empty() {
        // Nome fixo (em vez do nome do relatório) pra nunca colidir com a
        // aba de uma tabela sem título/grupo, que cai no nome do relatório
        // por padrão (ver `escrever_secao_xlsx`).
        let planilha = workbook.add_worksheet();
        planilha.set_name("Capa").map_err(|err| err.to_string())?;

        let mut linha_atual = 0u32;
        if tem_bloco_cabecalho_ativo(definicao) {
            if let Some(bytes) = carregar_imagem_cabecalho_bytes() {
                if let Ok(imagem) = rust_xlsxwriter::Image::new_from_buffer(&bytes) {
                    planilha.set_row_height_pixels(0, 90).map_err(|err| err.to_string())?;
                    planilha.set_column_width_pixels(0, 260).map_err(|err| err.to_string())?;
                    planilha
                        .insert_image_fit_to_cell(0, 0, &imagem, true)
                        .map_err(|err| err.to_string())?;
                    linha_atual = 2;
                }
            }
        }

        for (texto, negrito) in linhas_capa.iter() {
            if *negrito {
                planilha
                    .write_with_format(linha_atual, 0, texto, &fmt_titulo)
                    .map_err(|err| err.to_string())?;
            } else {
                planilha.write_string(linha_atual, 0, texto).map_err(|err| err.to_string())?;
            }
            linha_atual += 1;
        }
        teve_aba = true;
    }

    let multiplas_secoes = indices_tabela.len() > 1;
    for secao_index in &indices_tabela {
        if let Some(secao) = secoes.get(*secao_index) {
            escrever_secao_xlsx(&mut workbook, definicao, secao, multiplas_secoes, &fmt_cabecalho)?;
            teve_aba = true;
        }
    }

    if !teve_aba {
        let planilha = workbook.add_worksheet();
        planilha.set_name(nome_aba_planilha(&definicao.nome)).map_err(|err| err.to_string())?;
        planilha
            .write_string(0, 0, "Este relatório não tem nenhum bloco de conteúdo ativo.")
            .map_err(|err| err.to_string())?;
    }

    workbook.save(caminho).map_err(|err| err.to_string())
}

fn renderizar_xlsx(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    if !definicao.blocos.is_empty() {
        return renderizar_xlsx_blocos(definicao, secoes, bimestre, caminho);
    }

    use rust_xlsxwriter::{Format, Workbook};

    let mut workbook = Workbook::new();
    let fmt_cabecalho = Format::new().set_bold();
    let multiplas_secoes = secoes.len() > 1;

    if total_linhas(secoes) == 0 {
        let planilha = workbook.add_worksheet();
        planilha.set_name(nome_aba_planilha(&definicao.nome)).map_err(|err| err.to_string())?;
        planilha
            .write_string(0, 0, "Nenhum registro encontrado para os filtros selecionados.")
            .map_err(|err| err.to_string())?;
        return workbook.save(caminho).map_err(|err| err.to_string());
    }

    for secao in secoes {
        escrever_secao_xlsx(&mut workbook, definicao, secao, multiplas_secoes, &fmt_cabecalho)?;
    }

    workbook.save(caminho).map_err(|err| err.to_string())
}

// ───────────────────────────── PDF ─────────────────────────────

struct CandidatoFontePdf {
    base: &'static str,
    regular: &'static str,
    negrito: &'static str,
    italico: &'static str,
    negrito_italico: &'static str,
}

const CANDIDATOS_FONTE_PDF: &[CandidatoFontePdf] = &[
    CandidatoFontePdf {
        base: "C:\\Windows\\Fonts",
        regular: "calibri.ttf",
        negrito: "calibrib.ttf",
        italico: "calibrii.ttf",
        negrito_italico: "calibriz.ttf",
    },
    CandidatoFontePdf {
        base: "C:\\Windows\\Fonts",
        regular: "arial.ttf",
        negrito: "arialbd.ttf",
        italico: "ariali.ttf",
        negrito_italico: "arialbi.ttf",
    },
    CandidatoFontePdf {
        base: "/usr/share/fonts/truetype/dejavu",
        regular: "DejaVuSans.ttf",
        negrito: "DejaVuSans-Bold.ttf",
        italico: "DejaVuSans-Oblique.ttf",
        negrito_italico: "DejaVuSans-BoldOblique.ttf",
    },
    CandidatoFontePdf {
        base: "/usr/share/fonts/truetype/liberation",
        regular: "LiberationSans-Regular.ttf",
        negrito: "LiberationSans-Bold.ttf",
        italico: "LiberationSans-Italic.ttf",
        negrito_italico: "LiberationSans-BoldItalic.ttf",
    },
    // Distros baseadas em RPM (Fedora, RHEL, openSUSE) empacotam essas
    // mesmas fontes num caminho diferente do padrão Debian/Ubuntu acima —
    // sem isto, o AppImage falha em gerar PDF mesmo com a fonte instalada.
    CandidatoFontePdf {
        base: "/usr/share/fonts/dejavu-sans-fonts",
        regular: "DejaVuSans.ttf",
        negrito: "DejaVuSans-Bold.ttf",
        italico: "DejaVuSans-Oblique.ttf",
        negrito_italico: "DejaVuSans-BoldOblique.ttf",
    },
    CandidatoFontePdf {
        base: "/usr/share/fonts/liberation-sans-fonts",
        regular: "LiberationSans-Regular.ttf",
        negrito: "LiberationSans-Bold.ttf",
        italico: "LiberationSans-Italic.ttf",
        negrito_italico: "LiberationSans-BoldItalic.ttf",
    },
];

/// Carrega uma família de fontes já instalada no sistema (Calibri/Arial no
/// Windows, DejaVu/Liberation Sans no Linux) para o genpdf embutir no PDF.
/// O projeto não embute nenhuma fonte TTF própria; se nenhum desses
/// candidatos existir na máquina, a geração de PDF falha com uma mensagem
/// clara em vez de silenciosamente sair errada.
///
/// pub(crate) porque o exportador de PEI em PDF (pei.rs) reusa esta mesma
/// lógica de fallback em vez de duplicar a lista de fontes candidatas.
pub(crate) fn carregar_familia_fonte_pdf() -> Result<genpdf::fonts::FontFamily<genpdf::fonts::FontData>, String> {
    for candidato in CANDIDATOS_FONTE_PDF {
        let base = Path::new(candidato.base);
        let caminhos = [
            base.join(candidato.regular),
            base.join(candidato.negrito),
            base.join(candidato.italico),
            base.join(candidato.negrito_italico),
        ];
        if !caminhos.iter().all(|caminho| caminho.is_file()) {
            continue;
        }
        let carregar = |caminho: &Path| -> Result<genpdf::fonts::FontData, String> {
            let bytes = fs::read(caminho).map_err(|err| err.to_string())?;
            genpdf::fonts::FontData::new(bytes, None).map_err(|err| err.to_string())
        };
        return Ok(genpdf::fonts::FontFamily {
            regular: carregar(&caminhos[0])?,
            bold: carregar(&caminhos[1])?,
            italic: carregar(&caminhos[2])?,
            bold_italic: carregar(&caminhos[3])?,
        });
    }
    Err(
        "Não encontrei nenhuma fonte compatível instalada no sistema para gerar PDF (Calibri, Arial, \
         DejaVu Sans ou Liberation Sans). Gere em .docx, .xlsx ou .csv, ou instale uma dessas fontes."
            .to_string(),
    )
}

fn escrever_tabela_pdf(documento: &mut genpdf::Document, secao: &SecaoResultado) -> Result<(), String> {
    use genpdf::elements::{Break, FrameCellDecorator, Paragraph, TableLayout};
    use genpdf::style::{Effect, Style};
    use genpdf::Element as _;

    let linhas_secao: usize = secao.blocos.iter().map(|(_, linhas)| linhas.len()).sum();
    if let Some(titulo) = &secao.titulo {
        documento.push(Paragraph::new(titulo.clone()).styled(Style::new().bold().with_font_size(13)));
        documento.push(Break::new(0.5));
    }
    if linhas_secao == 0 {
        documento.push(Paragraph::new("Nenhum registro nesta seção."));
        documento.push(Break::new(1.0));
        return Ok(());
    }

    for (rotulo_grupo, linhas) in &secao.blocos {
        if linhas.is_empty() {
            continue;
        }
        if let Some(rotulo) = rotulo_grupo {
            documento.push(Paragraph::new(format!("{} - {} registro(s)", rotulo, linhas.len())).styled(Effect::Bold));
            documento.push(Break::new(0.5));
        }

        let pesos = vec![1usize; secao.colunas.len().max(1)];
        let mut tabela = TableLayout::new(pesos);
        tabela.set_cell_decorator(FrameCellDecorator::new(true, true, false));

        let mut linha_cabecalho = tabela.row();
        for coluna in secao.colunas {
            linha_cabecalho.push_element(Paragraph::new(coluna.rotulo.clone()).styled(Effect::Bold).padded(1));
        }
        linha_cabecalho.push().map_err(|err| err.to_string())?;

        for linha in linhas {
            let mut linha_tabela = tabela.row();
            for coluna in secao.colunas {
                linha_tabela.push_element(Paragraph::new(valor_coluna(linha, &coluna.id)).padded(1));
            }
            linha_tabela.push().map_err(|err| err.to_string())?;
        }

        documento.push(tabela);
        documento.push(Break::new(1.0));
    }
    Ok(())
}

fn assinatura_pdf(documento: &mut genpdf::Document, nomes: &[String]) {
    use genpdf::elements::{Break, Paragraph};

    for nome in nomes {
        documento.push(Paragraph::new("_______________________________________"));
        documento.push(Paragraph::new(nome.clone()));
        documento.push(Break::new(0.8));
    }
}

fn renderizar_pdf_blocos(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    use genpdf::elements::{Break, PageBreak, Paragraph};
    use genpdf::style::Style;
    use genpdf::Alignment;
    use genpdf::Element as _;

    let familia_fonte = carregar_familia_fonte_pdf()?;
    let mut documento = genpdf::Document::new(familia_fonte);
    documento.set_title(&definicao.nome);
    documento.set_line_spacing(1.2);

    let mut decorador = genpdf::SimplePageDecorator::new();
    decorador.set_margins(10);
    documento.set_page_decorator(decorador);

    let mut teve_conteudo = false;
    for bloco in &definicao.blocos {
        if !bloco.ativo {
            continue;
        }
        match &bloco.conteudo {
            ConteudoBloco::Cabecalho => {
                if let Some(imagem) = carregar_imagem_cabecalho_pdf(160.0) {
                    documento.push(imagem);
                    documento.push(Break::new(0.5));
                }
                documento.push(Paragraph::new(&definicao.nome).aligned(Alignment::Center).styled(Style::new().bold().with_font_size(16)));
                documento.push(
                    Paragraph::new(format!("Coordenação Pedagógica · {}", rotulo_bimestre(bimestre))).aligned(Alignment::Center),
                );
                documento.push(Break::new(1.0));
                teve_conteudo = true;
            }
            ConteudoBloco::Texto { titulo, corpo } => {
                if let Some(titulo) = titulo {
                    if !titulo.trim().is_empty() {
                        documento.push(Paragraph::new(titulo.clone()).styled(Style::new().bold().with_font_size(13)));
                    }
                }
                if !corpo.trim().is_empty() {
                    documento.push(Paragraph::new(substituir_variaveis(corpo, bimestre)));
                }
                documento.push(Break::new(1.0));
                teve_conteudo = true;
            }
            ConteudoBloco::Tabela { secao_index } => {
                if let Some(secao) = secoes.get(*secao_index) {
                    escrever_tabela_pdf(&mut documento, secao)?;
                    teve_conteudo = true;
                }
            }
            ConteudoBloco::QuebraPagina => documento.push(PageBreak::new()),
            ConteudoBloco::Espacador => documento.push(Break::new(2.0)),
            ConteudoBloco::Assinaturas { nomes } => {
                assinatura_pdf(&mut documento, nomes);
                teve_conteudo = teve_conteudo || !nomes.is_empty();
            }
            ConteudoBloco::Parametros => {}
        }
    }

    if !teve_conteudo {
        documento.push(Paragraph::new("Este relatório não tem nenhum bloco de conteúdo ativo."));
    }

    documento.render_to_file(caminho).map_err(|err| err.to_string())
}

fn renderizar_pdf(definicao: &ReportDefinition, secoes: &[SecaoResultado], bimestre: &str, caminho: &Path) -> Result<(), String> {
    if !definicao.blocos.is_empty() {
        return renderizar_pdf_blocos(definicao, secoes, bimestre, caminho);
    }

    use genpdf::elements::{Break, Paragraph};
    use genpdf::style::Effect;
    use genpdf::Element as _;

    let familia_fonte = carregar_familia_fonte_pdf()?;
    let mut documento = genpdf::Document::new(familia_fonte);
    documento.set_title(&definicao.nome);
    documento.set_line_spacing(1.2);

    let mut decorador = genpdf::SimplePageDecorator::new();
    decorador.set_margins(10);
    documento.set_page_decorator(decorador);

    documento.push(Paragraph::new(&definicao.nome).aligned(genpdf::Alignment::Center).styled(genpdf::style::Style::new().bold().with_font_size(16)));
    if !definicao.descricao.is_empty() {
        documento.push(Paragraph::new(&definicao.descricao));
    }
    documento.push(Paragraph::new(format!("Gerado em {}", chrono::Local::now().format("%d/%m/%Y %H:%M"))).styled(Effect::Italic));
    documento.push(Break::new(1.0));

    if total_linhas(secoes) == 0 {
        documento.push(Paragraph::new("Nenhum registro encontrado para os filtros selecionados."));
        return documento.render_to_file(caminho).map_err(|err| err.to_string());
    }

    for secao in secoes {
        escrever_tabela_pdf(&mut documento, secao)?;
    }

    documento.render_to_file(caminho).map_err(|err| err.to_string())
}
