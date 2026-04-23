import unittest
from unittest.mock import patch

from domain.aluno import Aluno
from domain.turma import Turma
from services.preparador_ata import PreparadorAta


class TestPreparadorAta(unittest.TestCase):
    def test_inclui_encaminhamentos_do_conselho_no_campo_encam(self):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE", ativo=True)
        aluno.numero_chamada = 1
        aluno.encaminhamentos_conselho = {"1": [3, 1, 3]}
        turma.adicionar_aluno(aluno)

        alunos = PreparadorAta.preparar_alunos(turma, "1")
        self.assertEqual(len(alunos), 1)
        self.assertEqual(alunos[0]["encaminhamento"], "1, 3")

    @patch("services.preparador_ata.Configuracao.obter_nota_minima", return_value=5.0)
    def test_ata_remove_defasagem_quando_conselho_ajusta_media_para_minimo(self, _nota_minima_mock):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE", ativo=True)
        aluno.numero_chamada = 1
        aluno.medias = {"1": {"MATEMATICA": 4.0}}
        aluno.defasagens = {"1": {"MATEMATICA": True}}
        aluno.ajustes_medias_conselho = {
            "1": {"MATEMATICA": {"media_original": 4.0, "media_ajustada": 5.0, "observacao": ""}}
        }
        turma.adicionar_aluno(aluno)

        alunos = PreparadorAta.preparar_alunos(turma, "1")

        self.assertEqual(alunos[0]["defasagens"], set())

    @patch("services.preparador_ata.Configuracao.obter_nota_minima", return_value=5.0)
    def test_ata_inclui_defasagem_quando_conselho_ajusta_media_para_abaixo_do_minimo(self, _nota_minima_mock):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE", ativo=True)
        aluno.numero_chamada = 1
        aluno.medias = {"1": {"MATEMATICA": 6.0}}
        aluno.defasagens = {"1": {}}
        aluno.ajustes_medias_conselho = {
            "1": {"MATEMATICA": {"media_original": 6.0, "media_ajustada": 4.5, "observacao": ""}}
        }
        turma.adicionar_aluno(aluno)

        alunos = PreparadorAta.preparar_alunos(turma, "1")

        self.assertEqual(alunos[0]["defasagens"], {"MATEMATICA"})


if __name__ == "__main__":
    unittest.main()
