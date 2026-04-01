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
                [None, None, None, "Fre An(%)"],
                ["ALUNO TESTE", media, 0, "90%"],
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


if __name__ == "__main__":
    unittest.main()
