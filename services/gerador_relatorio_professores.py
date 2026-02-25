import os

from docx import Document
from docx.shared import Pt

from services.avaliador_frequencia import AvaliadorFrequencia
from services.configuracao import Configuracao
from services.periodo_letivo import garantir_bimestre_operacional


class GeradorRelatorioProfessores:
    @staticmethod
    def gerar(turma, bimestre, caminho_saida=None):
        bimestre = garantir_bimestre_operacional(bimestre)
        doc = Document()

        # Fonte padrão
        normal = doc.styles["Normal"]
        normal.font.name = "Calibri"
        normal.font.size = Pt(11)
        normal.paragraph_format.space_before = Pt(0)
        normal.paragraph_format.space_after = Pt(0)

        titulo = doc.add_paragraph()
        run = titulo.add_run(
            f"Relatório Pedagógico – Bimestre {bimestre} – Turma {turma.codigo}"
        )
        run.bold = True
        run.font.size = Pt(14)

        doc.add_paragraph()

        # ===================== AGRUPADO POR DISCIPLINA =====================
        nota_minima = Configuracao.obter_nota_minima()

        carga = turma.carga_horaria.get(bimestre, {})
        por_disciplina = {}
        por_disciplina_faltas = {}
        encontrou_medias = False

        for aluno in turma.alunos.values():
            if not getattr(aluno, "ativo", True):
                continue

            medias_bim = getattr(aluno, "medias", {}).get(bimestre, {})
            for disciplina, media in medias_bim.items():
                if media is None:
                    continue
                encontrou_medias = True
                if media < nota_minima:
                    nome_fmt = aluno.nome.title()
                    por_disciplina.setdefault(disciplina, []).append((nome_fmt, media))

            faltas_bim = aluno.frequencia.get(bimestre, {})
            for disciplina, faltas in faltas_bim.items():
                total_aulas = carga.get(disciplina)
                if not total_aulas or total_aulas <= 0:
                    continue
                if (faltas / total_aulas) > AvaliadorFrequencia.LIMITE:
                    percentual = (faltas / total_aulas) * 100
                    nome_fmt = aluno.nome.title()
                    por_disciplina_faltas.setdefault(disciplina, []).append(
                        (nome_fmt, faltas, total_aulas, percentual)
                    )

        # Disciplinas a considerar (união de notas e faltas)
        disciplinas = sorted(set(por_disciplina.keys()) | set(por_disciplina_faltas.keys()))

        if not encontrou_medias:
            doc.add_paragraph(
                "Nenhuma média encontrada para este bimestre. "
                "Reimporte o mapão para registrar as médias."
            )
            doc.add_paragraph()

        if not disciplinas:
            doc.add_paragraph("Nenhum registro encontrado para este bimestre.")
        else:
            for disciplina in disciplinas:
                doc.add_paragraph()
                d = doc.add_paragraph()
                d.add_run(disciplina).bold = True

                # Sub-seção: defasagem de nota
                sub1 = doc.add_paragraph()
                sub1.add_run("Alunos com defasagem de nota").bold = True
                lista_notas = sorted(por_disciplina.get(disciplina, []), key=lambda x: x[0])
                if not lista_notas:
                    doc.add_paragraph("Nenhum aluno.")
                else:
                    for nome, media in lista_notas:
                        doc.add_paragraph(f"{nome} - {media:.1f}")

                # Sub-seção: excesso de faltas
                sub2 = doc.add_paragraph()
                sub2.add_run("Alunos com excesso de faltas").bold = True
                lista_faltas = sorted(
                    por_disciplina_faltas.get(disciplina, []), key=lambda x: x[0]
                )
                if not lista_faltas:
                    doc.add_paragraph("Nenhum aluno.")
                else:
                    nomes = []
                    for nome, faltas, total, percentual in lista_faltas:
                        nomes.append(nome)
                        doc.add_paragraph(
                            f"{nome} - {faltas}/{total} ({percentual:.1f}%)"
                        )
                    doc.add_paragraph(f"Compensar faltas: {', '.join(nomes)}")

        # ===================== SALVAR =====================
        if caminho_saida:
            pasta = os.path.dirname(caminho_saida)
            if pasta:
                os.makedirs(pasta, exist_ok=True)
            caminho = caminho_saida
        else:
            pasta = "dados/relatorios"
            os.makedirs(pasta, exist_ok=True)
            caminho = os.path.join(
                pasta,
                f"relatorio_professores_{turma.codigo}_bim_{bimestre}.docx"
            )

        doc.save(caminho)
        return caminho
