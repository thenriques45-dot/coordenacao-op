import unittest

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


if __name__ == "__main__":
    unittest.main()
