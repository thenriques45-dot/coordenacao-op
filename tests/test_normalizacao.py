import unittest

from services.normalizacao import normalizar_disciplina


class TestNormalizacao(unittest.TestCase):
    def test_remove_acentos_e_padroniza_disciplina(self):
        self.assertEqual(normalizar_disciplina("Educação Financeira"), "EDUCACAO FINANCEIRA")
        self.assertEqual(normalizar_disciplina("  Redação   e  Leitura "), "REDACAO E LEITURA")


if __name__ == "__main__":
    unittest.main()
