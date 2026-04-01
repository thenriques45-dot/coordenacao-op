import unittest

from domain.aluno import Aluno
from domain.turma import Turma
from services.acompanhamento_frequencia import AcompanhamentoFrequencia


class TestAcompanhamentoFrequencia(unittest.TestCase):
    def test_soma_faltas_aulas_e_compensacoes_ao_longo_dos_bimestres(self):
        turma = Turma("2A", 2026)
        turma.carga_horaria["1"] = {"MATEMATICA": 20}
        turma.carga_horaria["2"] = {"MATEMATICA": 18}

        aluno = Aluno("1", "ALUNO TESTE")
        aluno.frequencia["1"] = {"MATEMATICA": 6}
        aluno.frequencia["2"] = {"MATEMATICA": 4}
        aluno.compensacao_ausencias["1"] = {"MATEMATICA": 1}
        aluno.compensacao_ausencias["2"] = {"MATEMATICA": 2}
        turma.adicionar_aluno(aluno)

        linhas = AcompanhamentoFrequencia.listar_linhas_turma(turma)

        self.assertEqual(len(linhas), 1)
        linha = linhas[0]
        self.assertEqual(linha["faltas"], 10)
        self.assertEqual(linha["compensadas"], 3)
        self.assertEqual(linha["aulas"], 38)
        self.assertEqual(linha["saldo"], 7)
        self.assertAlmostEqual(linha["percentual"], (7 / 38) * 100, places=2)
        self.assertEqual(linha["status"], "OK")

    def test_identifica_excesso_apos_compensacao(self):
        turma = Turma("2A", 2026)
        turma.carga_horaria["1"] = {"MATEMATICA": 20}

        aluno = Aluno("1", "ALUNO TESTE")
        aluno.frequencia["1"] = {"MATEMATICA": 8}
        aluno.compensacao_ausencias["1"] = {"MATEMATICA": 1}
        turma.adicionar_aluno(aluno)

        resumo = AcompanhamentoFrequencia.resumo_turma(turma)
        linhas = AcompanhamentoFrequencia.listar_linhas_turma(turma)

        self.assertEqual(resumo["total"], 1)
        self.assertEqual(resumo["excesso"], 1)
        self.assertEqual(linhas[0]["status"], "EXCESSO")


if __name__ == "__main__":
    unittest.main()
