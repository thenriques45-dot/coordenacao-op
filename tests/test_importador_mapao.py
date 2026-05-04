import unittest
from unittest.mock import patch

import pandas as pd

from domain.aluno import Aluno
from domain.turma import Turma
from services.acompanhamento_ajustes import AcompanhamentoAjustes
from services.importador_mapao import ImportadorMapao


class TestImportadorMapao(unittest.TestCase):
    @staticmethod
    def _df_mapao(media):
        return pd.DataFrame(
            [
                ["ALUNO", "MATEMATICA\nMEDIA", None, None],
                [None, "M", "F", "Fre An(%)"],
                ["ALUNO TESTE", media, 0, "90%"],
            ]
        )

    @staticmethod
    def _df_mapao_com_compensacao(media, compensadas):
        return pd.DataFrame(
            [
                ["ALUNO", "MATEMATICA\nMEDIA", None, None, None],
                [None, "M", "F", "AC", "Fre An(%)"],
                ["ALUNO TESTE", media, 6, compensadas, "90%"],
            ]
        )

    @staticmethod
    def _df_mapao_disciplina_com_acento():
        return pd.DataFrame(
            [
                ["ALUNO", "EDUCAÇÃO FINANCEIRA\n1234", None, None, None],
                [None, "M", "F", "AC", "Fre An(%)"],
                ["ALUNO TESTE", 8, 1, 0, "90%"],
            ]
        )

    @patch("services.importador_mapao.extrair_aulas_por_disciplina", return_value={"MATEMATICA": 20})
    @patch("services.importador_mapao.Configuracao.obter_nota_minima", return_value=5.0)
    @patch("services.importador_mapao.pd.read_excel")
    def test_reimportacao_atualiza_media_existente(self, read_excel_mock, _nota_minima_mock, _carga_mock):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        aluno.medias["1"] = {"MATEMATICA": 4.0}
        turma.adicionar_aluno(aluno)

        read_excel_mock.return_value = self._df_mapao(5.5)

        ImportadorMapao.importar("mapao.xlsx", turma, "1")

        self.assertEqual(turma.alunos["1"].medias["1"]["MATEMATICA"], 5.5)

    @patch("services.importador_mapao.extrair_aulas_por_disciplina", return_value={"MATEMATICA": 20})
    @patch("services.importador_mapao.Configuracao.obter_nota_minima", return_value=5.0)
    @patch("services.importador_mapao.pd.read_excel")
    def test_reimportacao_reconcilia_ajuste_de_nota(self, read_excel_mock, _nota_minima_mock, _carga_mock):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        aluno.medias["1"] = {"MATEMATICA": 4.0}
        aluno.ajustes_medias_conselho["1"] = {
            "MATEMATICA": {
                "media_original": 4.0,
                "media_ajustada": 5.5,
                "observacao": "Aplicar no sistema",
            }
        }
        turma.adicionar_aluno(aluno)

        read_excel_mock.return_value = self._df_mapao(5.5)

        ImportadorMapao.importar("mapao.xlsx", turma, "1")

        ajuste = turma.alunos["1"].ajustes_medias_conselho["1"]["MATEMATICA"]
        self.assertEqual(ajuste["status_aplicacao"], AcompanhamentoAjustes.STATUS_APLICADO)
        self.assertEqual(ajuste["media_mapao_atual"], 5.5)

    @patch("services.importador_mapao.extrair_aulas_por_disciplina", return_value={"MATEMATICA": 20})
    @patch("services.importador_mapao.Configuracao.obter_nota_minima", return_value=5.0)
    @patch("services.importador_mapao.pd.read_excel")
    def test_importa_ausencias_compensadas_quando_coluna_existe(self, read_excel_mock, _nota_minima_mock, _carga_mock):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        turma.adicionar_aluno(aluno)

        read_excel_mock.return_value = self._df_mapao_com_compensacao(4.0, 2)

        ImportadorMapao.importar("mapao.xlsx", turma, "1")

        self.assertEqual(turma.alunos["1"].compensacao_ausencias["1"]["MATEMATICA"], 2)

    @patch("services.importador_mapao.extrair_aulas_por_disciplina", return_value={"MATEMATICA": 20})
    @patch("services.importador_mapao.Configuracao.obter_nota_minima", return_value=5.0)
    @patch("services.importador_mapao.pd.read_excel")
    def test_nao_apaga_compensacao_existente_quando_segundo_mapao_vem_vazio(
        self, read_excel_mock, _nota_minima_mock, _carga_mock
    ):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        aluno.compensacao_ausencias["1"] = {"MATEMATICA": 3}
        turma.adicionar_aluno(aluno)

        read_excel_mock.return_value = self._df_mapao_com_compensacao(4.0, None)

        ImportadorMapao.importar("mapao.xlsx", turma, "1")

        self.assertEqual(turma.alunos["1"].compensacao_ausencias["1"]["MATEMATICA"], 3)

    @patch("services.importador_mapao.extrair_aulas_por_disciplina", return_value={"EDUCACAO FINANCEIRA": 20})
    @patch("services.importador_mapao.Configuracao.obter_nota_minima", return_value=5.0)
    @patch("services.importador_mapao.pd.read_excel")
    def test_normaliza_nome_de_disciplina_com_acento(self, read_excel_mock, _nota_minima_mock, _carga_mock):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        turma.adicionar_aluno(aluno)

        read_excel_mock.return_value = self._df_mapao_disciplina_com_acento()

        ImportadorMapao.importar("mapao.xlsx", turma, "1")

        self.assertEqual(turma.alunos["1"].medias["1"]["EDUCACAO FINANCEIRA"], 8.0)
        self.assertEqual(turma.alunos["1"].frequencia["1"]["EDUCACAO FINANCEIRA"], 1)

    @patch("services.importador_mapao.extrair_aulas_por_disciplina", return_value={"MATEMATICA": 20})
    @patch("services.importador_mapao.Configuracao.obter_nota_minima", return_value=5.0)
    @patch("services.importador_mapao.pd.read_excel")
    def test_mantem_disciplina_com_carga_quando_media_vem_vazia(self, read_excel_mock, _nota_minima_mock, _carga_mock):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        turma.adicionar_aluno(aluno)

        read_excel_mock.return_value = self._df_mapao(None)

        ImportadorMapao.importar("mapao.xlsx", turma, "1")

        self.assertEqual(turma.carga_horaria["1"]["MATEMATICA"], 20)
        self.assertNotIn("MATEMATICA", turma.alunos["1"].medias.get("1", {}))
        self.assertEqual(turma.alunos["1"].frequencia["1"]["MATEMATICA"], 0)

    @patch("services.importador_mapao.extrair_aulas_por_disciplina", return_value={"MATEMATICA": 20})
    @patch("services.importador_mapao.Configuracao.obter_nota_minima", return_value=5.0)
    @patch("services.importador_mapao.pd.read_excel")
    def test_importacao_if_nao_sobrescreve_disciplina_preservada_da_fgb(
        self, read_excel_mock, _nota_minima_mock, _carga_mock
    ):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        turma.adicionar_aluno(aluno)

        read_excel_mock.return_value = self._df_mapao(9.0)
        ImportadorMapao.importar("mapao_fgb.xlsx", turma, "1")

        read_excel_mock.return_value = self._df_mapao(4.0)
        ImportadorMapao.importar(
            "mapao_if.xlsx",
            turma,
            "1",
            disciplinas_preservadas={"MATEMATICA"},
        )

        self.assertEqual(turma.alunos["1"].medias["1"]["MATEMATICA"], 9.0)


if __name__ == "__main__":
    unittest.main()
