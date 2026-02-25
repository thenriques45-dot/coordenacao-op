import os
import tempfile
import unittest
from unittest.mock import patch

from docx import Document

from domain.aluno import Aluno
from domain.turma import Turma
from services.gerador_relatorio_professores import GeradorRelatorioProfessores


class TestGeradorRelatorioProfessores(unittest.TestCase):
    def setUp(self):
        self._cwd = os.getcwd()
        self._tmpdir = tempfile.TemporaryDirectory()
        os.chdir(self._tmpdir.name)

    def tearDown(self):
        os.chdir(self._cwd)
        self._tmpdir.cleanup()

    def _texto_docx(self, caminho):
        doc = Document(caminho)
        return "\n".join(p.text for p in doc.paragraphs)

    def test_ignora_alunos_inativos(self):
        turma = Turma("2A", 2026)
        turma.carga_horaria["1"] = {"MATEMATICA": 20}

        ativo = Aluno("1", "ALUNO ATIVO", ativo=True)
        ativo.medias["1"] = {"MATEMATICA": 4.0}
        ativo.frequencia["1"] = {"MATEMATICA": 6}

        inativo = Aluno("2", "ALUNO INATIVO", ativo=False)
        inativo.medias["1"] = {"MATEMATICA": 3.0}
        inativo.frequencia["1"] = {"MATEMATICA": 8}

        turma.adicionar_aluno(ativo)
        turma.adicionar_aluno(inativo)

        with patch("services.gerador_relatorio_professores.Configuracao.obter_nota_minima", return_value=5.0):
            caminho = GeradorRelatorioProfessores.gerar(turma, "1")

        texto = self._texto_docx(caminho)
        self.assertIn("Aluno Ativo", texto)
        self.assertNotIn("Aluno Inativo", texto)

    def test_mostra_aviso_quando_nao_ha_medias_validas(self):
        turma = Turma("2A", 2026)
        turma.carga_horaria["1"] = {"MATEMATICA": 20}

        aluno = Aluno("1", "ALUNO SEM MEDIA", ativo=True)
        aluno.medias["1"] = {"MATEMATICA": None}
        aluno.frequencia["1"] = {"MATEMATICA": 0}
        turma.adicionar_aluno(aluno)

        with patch("services.gerador_relatorio_professores.Configuracao.obter_nota_minima", return_value=5.0):
            caminho = GeradorRelatorioProfessores.gerar(turma, "1")

        texto = self._texto_docx(caminho)
        self.assertIn("Nenhuma média encontrada para este bimestre.", texto)

    def test_lista_apenas_disciplinas_com_excesso_de_faltas(self):
        turma = Turma("2A", 2026)
        turma.carga_horaria["1"] = {"MATEMATICA": 20, "HISTORIA": 20}

        aluno = Aluno("1", "ALUNO TESTE", ativo=True)
        aluno.medias["1"] = {"MATEMATICA": 7.0, "HISTORIA": 7.0}
        aluno.frequencia["1"] = {"MATEMATICA": 6, "HISTORIA": 4}
        turma.adicionar_aluno(aluno)

        with patch("services.gerador_relatorio_professores.Configuracao.obter_nota_minima", return_value=5.0):
            caminho = GeradorRelatorioProfessores.gerar(turma, "1")

        texto = self._texto_docx(caminho)
        self.assertIn("Aluno Teste - 6/20 (30.0%)", texto)
        self.assertNotIn("Aluno Teste - 4/20 (20.0%)", texto)


if __name__ == "__main__":
    unittest.main()
