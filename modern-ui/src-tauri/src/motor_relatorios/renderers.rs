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

use std::fs;
use std::path::Path;

use crate::*;

use super::definicao::{Alinhamento, FormatoSaida, ReportDefinition};
use super::executor::{LinhaRelatorio, SecaoResultado};

type Bloco = (Option<String>, Vec<LinhaRelatorio>);

pub(crate) fn renderizar(definicao: &ReportDefinition, secoes: &[SecaoResultado], caminho: &Path) -> Result<(), String> {
    match definicao.formato_saida {
        FormatoSaida::Docx => renderizar_docx(definicao, secoes, caminho),
        FormatoSaida::Csv => renderizar_csv(definicao, secoes, caminho),
        FormatoSaida::Xlsx => renderizar_xlsx(definicao, secoes, caminho),
        FormatoSaida::Pdf => renderizar_pdf(definicao, secoes, caminho),
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

fn renderizar_docx(definicao: &ReportDefinition, secoes: &[SecaoResultado], caminho: &Path) -> Result<(), String> {
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
        let linhas_secao: usize = secao.blocos.iter().map(|(_, linhas)| linhas.len()).sum();
        if indice_secao > 0 {
            documento.paragrafo("");
        }
        if let Some(titulo) = &secao.titulo {
            documento.paragrafo_negrito(titulo);
        }
        if linhas_secao == 0 {
            documento.caixa_aviso("Nenhum registro nesta seção.");
            continue;
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
                        .map(|coluna| {
                            CelulaDocx::texto(&valor_coluna(linha, &coluna.id)).alinhada(alinhamento_docx(coluna.alinhamento))
                        })
                        .collect(),
                );
            }
            documento.tabela_celulas_com_larguras(tabela, &larguras, true);
        }
    }

    documento.salvar(caminho)
}

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

fn renderizar_csv(_definicao: &ReportDefinition, secoes: &[SecaoResultado], caminho: &Path) -> Result<(), String> {
    let mut conteudo = String::from("\u{FEFF}");
    for (indice, secao) in secoes.iter().enumerate() {
        if indice > 0 {
            conteudo.push('\n');
            if let Some(titulo) = &secao.titulo {
                conteudo.push_str(&format!("# {titulo}\n"));
            }
        }
        let tem_grupo = secao.blocos.len() > 1 || secao.blocos.first().is_some_and(|(rotulo, _)| rotulo.is_some());
        escrever_bloco_csv(&mut conteudo, secao, tem_grupo);
    }
    fs::write(caminho, conteudo.as_bytes()).map_err(|err| err.to_string())
}

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

fn renderizar_xlsx(definicao: &ReportDefinition, secoes: &[SecaoResultado], caminho: &Path) -> Result<(), String> {
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
        let blocos_com_dados: Vec<&Bloco> = secao.blocos.iter().filter(|(_, linhas)| !linhas.is_empty()).collect();
        for bloco in blocos_com_dados {
            let (rotulo_grupo, linhas) = bloco;
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
                    .write_with_format(0, indice as u16, &coluna.rotulo, &fmt_cabecalho)
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
    }

    workbook.save(caminho).map_err(|err| err.to_string())
}

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
];

/// Carrega uma família de fontes já instalada no sistema (Calibri/Arial no
/// Windows, DejaVu/Liberation Sans no Linux) para o genpdf embutir no PDF.
/// O projeto não embute nenhuma fonte TTF própria; se nenhum desses
/// candidatos existir na máquina, a geração de PDF falha com uma mensagem
/// clara em vez de silenciosamente sair errada.
fn carregar_familia_fonte_pdf() -> Result<genpdf::fonts::FontFamily<genpdf::fonts::FontData>, String> {
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

fn renderizar_pdf(definicao: &ReportDefinition, secoes: &[SecaoResultado], caminho: &Path) -> Result<(), String> {
    use genpdf::elements::{Break, FrameCellDecorator, Paragraph, TableLayout};
    use genpdf::style::{Effect, Style};
    use genpdf::Alignment;
    use genpdf::Element as _;

    let familia_fonte = carregar_familia_fonte_pdf()?;
    let mut documento = genpdf::Document::new(familia_fonte);
    documento.set_title(&definicao.nome);
    documento.set_line_spacing(1.2);

    let mut decorador = genpdf::SimplePageDecorator::new();
    decorador.set_margins(10);
    documento.set_page_decorator(decorador);

    documento.push(Paragraph::new(&definicao.nome).aligned(Alignment::Center).styled(Style::new().bold().with_font_size(16)));
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
        let linhas_secao: usize = secao.blocos.iter().map(|(_, linhas)| linhas.len()).sum();
        if let Some(titulo) = &secao.titulo {
            documento.push(Paragraph::new(titulo.clone()).styled(Style::new().bold().with_font_size(13)));
            documento.push(Break::new(0.5));
        }
        if linhas_secao == 0 {
            documento.push(Paragraph::new("Nenhum registro nesta seção."));
            documento.push(Break::new(1.0));
            continue;
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
    }

    documento.render_to_file(caminho).map_err(|err| err.to_string())
}
