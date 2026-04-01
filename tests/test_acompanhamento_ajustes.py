import unittest

from domain.aluno import Aluno
from domain.turma import Turma
from services.acompanhamento_ajustes import AcompanhamentoAjustes


class TestAcompanhamentoAjustes(unittest.TestCase):
    def test_classifica_ajuste_como_aplicado_quando_mapao_bate_com_conselho(self):
        aluno = Aluno("1", "ALUNO TESTE")
        aluno.medias["1"] = {"MATEMATICA": 5.5}
        aluno.ajustes_medias_conselho["1"] = {
            "MATEMATICA": {
                "media_original": 4.0,
                "media_ajustada": 5.5,
                "observacao": "Aplicar ajuste",
            }
        }

        AcompanhamentoAjustes.reconciliar_aluno(aluno, "1")
        ajuste = aluno.ajustes_medias_conselho["1"]["MATEMATICA"]

        self.assertEqual(ajuste["status_aplicacao"], AcompanhamentoAjustes.STATUS_APLICADO)
        self.assertEqual(ajuste["media_mapao_atual"], 5.5)

    def test_classifica_ajuste_como_pendente_quando_mapao_mantem_media_original(self):
        aluno = Aluno("1", "ALUNO TESTE")
        aluno.medias["1"] = {"MATEMATICA": 4.0}
        aluno.ajustes_medias_conselho["1"] = {
            "MATEMATICA": {
                "media_original": 4.0,
                "media_ajustada": 5.5,
                "observacao": "",
            }
        }

        AcompanhamentoAjustes.reconciliar_aluno(aluno, "1")
        ajuste = aluno.ajustes_medias_conselho["1"]["MATEMATICA"]

        self.assertEqual(ajuste["status_aplicacao"], AcompanhamentoAjustes.STATUS_PENDENTE)

    def test_classifica_ajuste_como_divergente_quando_mapao_traz_outro_valor(self):
        aluno = Aluno("1", "ALUNO TESTE")
        aluno.medias["1"] = {"MATEMATICA": 6.0}
        aluno.ajustes_medias_conselho["1"] = {
            "MATEMATICA": {
                "media_original": 4.0,
                "media_ajustada": 5.5,
                "observacao": "",
            }
        }

        AcompanhamentoAjustes.reconciliar_aluno(aluno, "1")
        ajuste = aluno.ajustes_medias_conselho["1"]["MATEMATICA"]

        self.assertEqual(ajuste["status_aplicacao"], AcompanhamentoAjustes.STATUS_DIVERGENTE)

    def test_resumo_da_turma_agrega_status(self):
        turma = Turma("2A", 2026)

        aluno_aplicado = Aluno("1", "ALUNO A")
        aluno_aplicado.medias["1"] = {"MATEMATICA": 5.5}
        aluno_aplicado.ajustes_medias_conselho["1"] = {
            "MATEMATICA": {"media_original": 4.0, "media_ajustada": 5.5, "observacao": ""}
        }

        aluno_pendente = Aluno("2", "ALUNO B")
        aluno_pendente.medias["1"] = {"MATEMATICA": 4.0}
        aluno_pendente.ajustes_medias_conselho["1"] = {
            "MATEMATICA": {"media_original": 4.0, "media_ajustada": 5.0, "observacao": ""}
        }

        turma.adicionar_aluno(aluno_aplicado)
        turma.adicionar_aluno(aluno_pendente)

        resumo = AcompanhamentoAjustes.reconciliar_turma(turma, "1")

        self.assertEqual(resumo["total"], 2)
        self.assertEqual(resumo[AcompanhamentoAjustes.STATUS_APLICADO], 1)
        self.assertEqual(resumo[AcompanhamentoAjustes.STATUS_PENDENTE], 1)
        self.assertEqual(resumo[AcompanhamentoAjustes.STATUS_DIVERGENTE], 0)


if __name__ == "__main__":
    unittest.main()
