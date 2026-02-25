import unittest

from services.periodo_letivo import (
    CONCEITO_FINAL,
    garantir_bimestre_operacional,
    garantir_periodo_letivo,
    normalizar_periodo,
)


class TestPeriodoLetivo(unittest.TestCase):
    def test_normalizar_aceita_variantes_5c(self):
        self.assertEqual(normalizar_periodo("5"), CONCEITO_FINAL)
        self.assertEqual(normalizar_periodo("5c"), CONCEITO_FINAL)
        self.assertEqual(normalizar_periodo("5º"), CONCEITO_FINAL)
        self.assertEqual(normalizar_periodo("5 conceito"), CONCEITO_FINAL)

    def test_garantir_periodo_letivo_aceita_5c(self):
        self.assertEqual(garantir_periodo_letivo("5"), CONCEITO_FINAL)
        self.assertEqual(garantir_periodo_letivo("2"), "2")

    def test_bimestre_operacional_rejeita_5c(self):
        with self.assertRaises(ValueError):
            garantir_bimestre_operacional("5C")


if __name__ == "__main__":
    unittest.main()
