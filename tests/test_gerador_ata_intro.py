import unittest
from datetime import date
from tempfile import TemporaryDirectory
from unittest.mock import patch

from domain.turma import Turma
from services.gerador_ata import GeradorAta
from services.persistencia import PersistenciaJSON


class TestGeradorAtaIntro(unittest.TestCase):
    def test_monta_titulo_com_turma_e_sala(self):
        turma = Turma("2A", 2026, serie="2a SERIE", sala="04", ciclo="EM")
        titulo = GeradorAta.montar_titulo(turma, "1")
        self.assertEqual(titulo, "CONSELHO DE CLASSE - 1º BIM/2026 - 2a SERIE A - SALA 04")

    def test_monta_intro_padrao_em_duas_partes(self):
        turma = Turma("2A", 2026, serie="2a SERIE", ciclo="EM")

        with patch("services.gerador_ata.Configuracao.obter_direcao", return_value=("TESTE", "F")):
            cabecalho, corpo = GeradorAta.montar_intro_padrao(turma, date(2026, 3, 23))

        self.assertIn("CONSELHO DE CLASSE.", cabecalho)
        self.assertIn("Diretora Sra. TESTE", cabecalho)
        self.assertTrue(corpo.startswith("Na abertura a diretora pautou"))
        self.assertIn("não alcançaram a menção mínima nas disciplinas:", corpo)

    def test_persistencia_salva_textos_ata(self):
        turma = Turma("2A", 2026)
        turma.textos_ata = {
            "1": {
                "cabecalho": "Cabecalho personalizado",
                "corpo": "Corpo personalizado",
            }
        }

        with TemporaryDirectory() as tmpdir:
            with patch("services.persistencia.data_dir", side_effect=lambda *parts: f"{tmpdir}\\{'\\\\'.join(parts)}"):
                caminho = PersistenciaJSON.salvar_turma(turma)
                restaurada = PersistenciaJSON.carregar_turma(caminho)

        self.assertEqual(restaurada.textos_ata["1"]["cabecalho"], "Cabecalho personalizado")
        self.assertEqual(restaurada.textos_ata["1"]["corpo"], "Corpo personalizado")


if __name__ == "__main__":
    unittest.main()
