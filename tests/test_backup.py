import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from services.backup import BackupDados


class TestBackupDados(unittest.TestCase):
    def test_exporta_e_restaura_backup(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            dados = base / "dados"
            config = base / "config"
            externo = base / "externo"
            externo.mkdir(parents=True, exist_ok=True)

            (dados / "persistidos" / "2026").mkdir(parents=True, exist_ok=True)
            (config).mkdir(parents=True, exist_ok=True)
            (dados / "persistidos" / "2026" / "turma_2A.json").write_text('{"codigo":"2A"}', encoding="utf-8")
            (config / "configuracoes.json").write_text('{"nota_minima": 5.0}', encoding="utf-8")

            with patch("services.backup.data_dir", side_effect=lambda *parts: str(dados.joinpath(*parts))):
                with patch("services.backup.config_dir", side_effect=lambda *parts: str(config.joinpath(*parts))):
                    with patch("services.backup.app_base_dir", return_value=base):
                        caminho_backup = str(externo / "backup.zip")
                        info_export = BackupDados.exportar_backup(caminho_backup)
                        self.assertEqual(info_export["arquivos"], 2)

                        for pasta in (dados, config):
                            for item in sorted(pasta.rglob("*"), reverse=True):
                                if item.is_file():
                                    item.unlink()
                                elif item.is_dir():
                                    item.rmdir()

                        info_restore = BackupDados.restaurar_backup(caminho_backup, criar_backup_seguranca=False)

            self.assertEqual(info_restore["arquivos_restaurados"], 2)
            self.assertTrue((dados / "persistidos" / "2026" / "turma_2A.json").exists())
            self.assertTrue((config / "configuracoes.json").exists())

    def test_restauracao_cria_backup_de_seguranca(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            dados = base / "dados"
            config = base / "config"
            externo = base / "externo"
            externo.mkdir(parents=True, exist_ok=True)

            (dados / "persistidos" / "2026").mkdir(parents=True, exist_ok=True)
            (config).mkdir(parents=True, exist_ok=True)
            arquivo_turma = dados / "persistidos" / "2026" / "turma_2A.json"
            arquivo_turma.write_text('{"codigo":"2A","origem":"local"}', encoding="utf-8")
            (config / "configuracoes.json").write_text('{"nota_minima": 5.0}', encoding="utf-8")

            with patch("services.backup.data_dir", side_effect=lambda *parts: str(dados.joinpath(*parts))):
                with patch("services.backup.config_dir", side_effect=lambda *parts: str(config.joinpath(*parts))):
                    with patch("services.backup.app_base_dir", return_value=base):
                        caminho_backup = str(externo / "backup.zip")
                        BackupDados.exportar_backup(caminho_backup)

                        arquivo_turma.write_text('{"codigo":"2A","origem":"alterado"}', encoding="utf-8")
                        info_restore = BackupDados.restaurar_backup(caminho_backup, criar_backup_seguranca=True)

            self.assertTrue(info_restore["backup_seguranca"])
            self.assertTrue(os.path.exists(info_restore["backup_seguranca"]))
            conteudo_restaurado = json.loads(arquivo_turma.read_text(encoding="utf-8"))
            self.assertEqual(conteudo_restaurado["origem"], "local")

    def test_importacao_mescla_sem_sobrescrever_conflitos(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            dados = base / "dados"
            config = base / "config"
            externo = base / "externo"
            externo.mkdir(parents=True, exist_ok=True)

            (dados / "persistidos" / "2026").mkdir(parents=True, exist_ok=True)
            (config).mkdir(parents=True, exist_ok=True)
            turma_local = dados / "persistidos" / "2026" / "turma_2A.json"
            turma_local.write_text('{"codigo":"2A","origem":"local"}', encoding="utf-8")
            (config / "configuracoes.json").write_text('{"nota_minima": 5.0}', encoding="utf-8")

            origem_backup = base / "origem_backup"
            dados_backup = origem_backup / "dados"
            config_backup = origem_backup / "config"
            (dados_backup / "persistidos" / "2026").mkdir(parents=True, exist_ok=True)
            (dados_backup / "persistidos" / "2027").mkdir(parents=True, exist_ok=True)
            (config_backup).mkdir(parents=True, exist_ok=True)
            (dados_backup / "persistidos" / "2026" / "turma_2A.json").write_text(
                '{"codigo":"2A","origem":"backup"}', encoding="utf-8"
            )
            (dados_backup / "persistidos" / "2027" / "turma_3B.json").write_text(
                '{"codigo":"3B","origem":"backup"}', encoding="utf-8"
            )
            (config_backup / "configuracoes.json").write_text('{"nota_minima": 7.0}', encoding="utf-8")

            with patch("services.backup.data_dir", side_effect=lambda *parts: str(dados_backup.joinpath(*parts))):
                with patch("services.backup.config_dir", side_effect=lambda *parts: str(config_backup.joinpath(*parts))):
                    with patch("services.backup.app_base_dir", return_value=origem_backup):
                        caminho_backup = str(externo / "backup_importacao.zip")
                        BackupDados.exportar_backup(caminho_backup)

            with patch("services.backup.data_dir", side_effect=lambda *parts: str(dados.joinpath(*parts))):
                with patch("services.backup.config_dir", side_effect=lambda *parts: str(config.joinpath(*parts))):
                    with patch("services.backup.app_base_dir", return_value=base):
                        info_import = BackupDados.importar_backup_mesclando(caminho_backup)

            self.assertEqual(info_import["arquivos_importados"], 1)
            self.assertIn("dados/persistidos/2026/turma_2A.json", info_import["conflitos"])
            self.assertIn("config/configuracoes.json", info_import["conflitos"])
            conteudo_local = json.loads(turma_local.read_text(encoding="utf-8"))
            self.assertEqual(conteudo_local["origem"], "local")
            turma_importada = dados / "persistidos" / "2027" / "turma_3B.json"
            self.assertTrue(turma_importada.exists())


if __name__ == "__main__":
    unittest.main()
