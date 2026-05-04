import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from services import runtime_paths


class TestRuntimePaths(unittest.TestCase):
    def setUp(self):
        runtime_paths._MIGRACAO_PORTATIL_VERIFICADA = False

    def tearDown(self):
        runtime_paths._MIGRACAO_PORTATIL_VERIFICADA = False

    def test_executavel_usa_pasta_do_proprio_programa(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            exe = base / "CoordenacaoOP.exe"
            exe.write_text("", encoding="utf-8")

            with patch("services.runtime_paths.sys.frozen", True, create=True):
                with patch("services.runtime_paths.sys.executable", str(exe)):
                    self.assertEqual(runtime_paths.app_base_dir(), base)

    def test_migra_dados_antigos_para_pasta_portatil_vazia(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            portable = base / "pendrive"
            legacy = base / "usuario"
            exe = portable / "CoordenacaoOP.exe"
            exe.parent.mkdir(parents=True)
            exe.write_text("", encoding="utf-8")
            (legacy / "dados" / "persistidos" / "2026").mkdir(parents=True)
            (legacy / "dados" / "persistidos" / "2026" / "turma_2A.json").write_text(
                "{}",
                encoding="utf-8",
            )
            (legacy / "config").mkdir()
            (legacy / "config" / "configuracoes.json").write_text("{}", encoding="utf-8")

            with patch("services.runtime_paths.sys.frozen", True, create=True):
                with patch("services.runtime_paths.sys.executable", str(exe)):
                    with patch("services.runtime_paths._legacy_user_base_dir", return_value=legacy):
                        runtime_paths.app_base_dir()

            self.assertTrue((portable / "dados" / "persistidos" / "2026" / "turma_2A.json").exists())
            self.assertTrue((portable / "config" / "configuracoes.json").exists())


if __name__ == "__main__":
    unittest.main()
