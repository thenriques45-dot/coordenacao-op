import os
from datetime import date
from pdb import run
from pydoc import doc
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from domain import turma
from services.configuracao import Configuracao
from docx.shared import RGBColor


class GeradorAta:

    @staticmethod
    def gerar(turma, bimestre):
        doc = Document()

        # ===================== CABEÇALHO COM IMAGEM =====================
        section = doc.sections[0]
        header = section.header

        aragrafo_header = header.paragraphs[0]
        aragrafo_header.alignment = WD_ALIGN_PARAGRAPH.CENTER

        run_header = aragrafo_header.add_run()
        run_header.add_picture(
            "dados/imagens/cabecalho.jpg",
        width=Cm(12)
        )

        # ===================== ESTILO PADRÃO =====================
        style = doc.styles['Normal']
        style.font.name = 'Times New Roman'
        style.font.size = Pt(12)

        # ===================== CABEÇALHO =====================
        doc.add_paragraph()

        titulo = doc.add_paragraph()
        titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER

        texto_titulo = f"CONSELHO DE CLASSE - {bimestre}º BIM/{turma.ano}"

        run = titulo.add_run(texto_titulo)
        run.bold = True
        run.font.size = Pt(14)
        run.font.color.rgb = RGBColor(128, 0, 128)  # #800080

        # ===================== LINHA: SÉRIE / SALA / PERÍODO =====================
        tabela_info = doc.add_table(rows=1, cols=3)
        tabela_info.alignment = WD_TABLE_ALIGNMENT.CENTER
        tabela_info.autofit = True

        celulas = tabela_info.rows[0].cells

        dados = [
            f"{turma.serie} {turma.codigo}",
            f"SALA: {turma.sala}",
            turma.periodo
        ]

        for i, texto in enumerate(dados):
            p = celulas[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER

            run = p.add_run(texto.upper())
            run.bold = True
            run.font.color.rgb = RGBColor(192, 0, 0)  # vermelho institucional

        # ===================== TEXTO INTRODUTÓRIO =====================
        hoje = date.today().strftime("%d/%m/%Y")

        intro = doc.add_paragraph(
            f"Aos {hoje}, realizou-se o Conselho de Classe do "
            f"{bimestre}º bimestre da turma {turma.codigo}, "
            f"com a finalidade de analisar o rendimento escolar, "
            f"a frequência e o desenvolvimento dos alunos."
        )
        intro.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        doc.add_paragraph()

        # ===================== TABELA =====================
        tabela = doc.add_table(rows=1, cols=4)
        tabela.alignment = WD_TABLE_ALIGNMENT.CENTER
        tabela.style = 'Table Grid'

        cabecalho = tabela.rows[0].cells
        cabecalho[0].text = "Nº"
        cabecalho[1].text = "Aluno"
        cabecalho[2].text = "Disciplinas com Defasagem"
        cabecalho[3].text = "Frequência Crítica"

        for aluno in turma.alunos.values():
            linha = tabela.add_row().cells
            linha[0].text = str(aluno.numero_chamada or "")
            linha[1].text = aluno.nome

            # Defasagens por nota
            disciplinas_def = []
            if bimestre in aluno.defasagens:
                for d, em_def in aluno.defasagens[bimestre].items():
                    if em_def:
                        disciplinas_def.append(d)

            linha[2].text = ", ".join(disciplinas_def) if disciplinas_def else "-"

            # Frequência crítica (>25%)
            freq_critica = []
            if bimestre in aluno.frequencia and bimestre in turma.carga_horaria:
                for disciplina, faltas in aluno.frequencia[bimestre].items():
                    total = turma.carga_horaria[bimestre].get(disciplina)
                    if total and faltas / total > 0.25:
                        freq_critica.append(disciplina)

            linha[3].text = ", ".join(freq_critica) if freq_critica else "-"

        # ===================== ENCERRAMENTO =====================
        doc.add_paragraph()
        encerramento = doc.add_paragraph(
            "Nada mais havendo a tratar, foi lavrada a presente ata, "
            "que após lida e aprovada, segue assinada pelos presentes."
        )
        encerramento.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

        doc.add_paragraph("\n\nAssinaturas:\n\n______________________________________________")

        # ===================== SALVAR =====================
        pasta = "dados/atas"
        os.makedirs(pasta, exist_ok=True)

        caminho = os.path.join(
            pasta,
            f"ata_{turma.codigo}_bimestre_{bimestre}.docx"
        )

        doc.save(caminho)
        return caminho
