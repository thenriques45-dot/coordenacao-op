import json
import os
import stat
import shutil
import time
import zipfile
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from services.runtime_paths import app_base_dir, config_dir, data_dir
from services.version import APP_VERSION


class BackupDados:
    MANIFESTO = "backup_manifest.json"
    PREFIXOS_VALIDOS = ("dados/", "config/")

    @staticmethod
    def _agora():
        return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    @staticmethod
    def _diretorios_origem():
        return {
            "dados": Path(data_dir()),
            "config": Path(config_dir()),
        }

    @staticmethod
    def _ha_conteudo_local():
        for pasta in BackupDados._diretorios_origem().values():
            if pasta.exists() and any(pasta.rglob("*")):
                return True
        return False

    @staticmethod
    def _montar_manifesto(total_arquivos):
        return {
            "app": "CoordenacaoOP",
            "versao_app": APP_VERSION,
            "criado_em": datetime.now().isoformat(timespec="seconds"),
            "formato": 1,
            "total_arquivos": total_arquivos,
        }

    @staticmethod
    def exportar_backup(caminho_destino):
        caminho_destino = str(caminho_destino)
        pasta_destino = os.path.dirname(caminho_destino)
        if pasta_destino:
            os.makedirs(pasta_destino, exist_ok=True)

        total_arquivos = 0
        with zipfile.ZipFile(caminho_destino, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for nome_raiz, pasta in BackupDados._diretorios_origem().items():
                if not pasta.exists():
                    continue
                for arquivo in sorted(pasta.rglob("*")):
                    if not arquivo.is_file():
                        continue
                    arcname = f"{nome_raiz}/{arquivo.relative_to(pasta).as_posix()}"
                    zf.write(arquivo, arcname)
                    total_arquivos += 1

            manifesto = BackupDados._montar_manifesto(total_arquivos)
            zf.writestr(BackupDados.MANIFESTO, json.dumps(manifesto, ensure_ascii=False, indent=2))

        return {
            "caminho": caminho_destino,
            "arquivos": total_arquivos,
        }

    @staticmethod
    def _validar_nome_arquivo(nome):
        caminho = Path(nome)
        if caminho.is_absolute():
            raise ValueError("O arquivo de backup contem caminhos absolutos invalidos.")
        if ".." in caminho.parts:
            raise ValueError("O arquivo de backup contem caminhos relativos invalidos.")
        if not any(nome.startswith(prefixo) for prefixo in BackupDados.PREFIXOS_VALIDOS):
            raise ValueError("O arquivo de backup contem itens fora das pastas esperadas.")

    @staticmethod
    def _extrair_para_temporario(caminho_backup):
        arquivos_extraidos = 0
        tmpdir = TemporaryDirectory()
        base_tmp = Path(tmpdir.name)

        with zipfile.ZipFile(caminho_backup, "r") as zf:
            nomes = zf.namelist()
            if BackupDados.MANIFESTO not in nomes:
                tmpdir.cleanup()
                raise ValueError("Backup invalido: manifesto nao encontrado.")

            nomes_dados = [nome for nome in nomes if any(nome.startswith(prefixo) for prefixo in BackupDados.PREFIXOS_VALIDOS)]
            if not nomes_dados:
                tmpdir.cleanup()
                raise ValueError("Backup invalido: nenhum dado de aplicacao encontrado.")

            for nome in nomes_dados:
                BackupDados._validar_nome_arquivo(nome)
                destino = base_tmp / Path(nome)
                destino.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(nome) as origem, open(destino, "wb") as saida:
                    shutil.copyfileobj(origem, saida)
                arquivos_extraidos += 1

        return tmpdir, base_tmp, arquivos_extraidos

    @staticmethod
    def _copiar_para_destino(base_tmp):
        destinos = BackupDados._diretorios_origem()
        for nome_raiz, destino_final in destinos.items():
            origem = base_tmp / nome_raiz
            if destino_final.exists():
                BackupDados._remover_arvore(destino_final)
            if origem.exists():
                shutil.copytree(origem, destino_final)

    @staticmethod
    def _remover_arvore(caminho, tentativas=3):
        caminho = Path(caminho)
        if not caminho.exists():
            return

        ultimo_erro = None

        def _onerror(func, path, exc_info):
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except Exception:
                raise exc_info[1]

        for tentativa in range(tentativas):
            try:
                shutil.rmtree(caminho, onerror=_onerror)
                return
            except PermissionError as exc:
                ultimo_erro = exc
                time.sleep(0.2 * (tentativa + 1))

        if ultimo_erro is not None:
            raise PermissionError(
                "Nao foi possivel substituir os dados locais porque algum arquivo esta em uso. "
                "Feche outras instancias do aplicativo e arquivos abertos na pasta de dados e tente novamente."
            ) from ultimo_erro

    @staticmethod
    def _mesclar_para_destino(base_tmp):
        destinos = BackupDados._diretorios_origem()
        copiados = 0
        conflitos = []

        for nome_raiz, destino_final in destinos.items():
            origem = base_tmp / nome_raiz
            if not origem.exists():
                continue
            os.makedirs(destino_final, exist_ok=True)
            for arquivo in sorted(origem.rglob("*")):
                if not arquivo.is_file():
                    continue
                relativo = arquivo.relative_to(origem)
                destino_arquivo = destino_final / relativo
                if destino_arquivo.exists():
                    conflitos.append(f"{nome_raiz}/{relativo.as_posix()}")
                    continue
                destino_arquivo.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(arquivo, destino_arquivo)
                copiados += 1

        return copiados, conflitos

    @staticmethod
    def restaurar_backup(caminho_backup, criar_backup_seguranca=True):
        tmpdir, base_tmp, arquivos_extraidos = BackupDados._extrair_para_temporario(caminho_backup)
        try:
            caminho_seguranca = None
            if criar_backup_seguranca and BackupDados._ha_conteudo_local():
                caminho_seguranca = os.path.join(
                    BackupDados.pasta_padrao_backup(),
                    f"backup_antes_restauracao_{BackupDados._agora()}.zip",
                )
                BackupDados.exportar_backup(caminho_seguranca)

            BackupDados._copiar_para_destino(base_tmp)

            return {
                "arquivos_restaurados": arquivos_extraidos,
                "backup_seguranca": caminho_seguranca,
            }
        finally:
            tmpdir.cleanup()

    @staticmethod
    def importar_backup_mesclando(caminho_backup):
        tmpdir, base_tmp, arquivos_extraidos = BackupDados._extrair_para_temporario(caminho_backup)
        try:
            arquivos_copiados, conflitos = BackupDados._mesclar_para_destino(base_tmp)
            return {
                "arquivos_no_backup": arquivos_extraidos,
                "arquivos_importados": arquivos_copiados,
                "conflitos": conflitos,
            }
        finally:
            tmpdir.cleanup()

    @staticmethod
    def nome_padrao_backup():
        return f"coordenacaoop_backup_{BackupDados._agora()}.zip"

    @staticmethod
    def pasta_padrao_backup():
        pasta = str(app_base_dir() / "backups")
        os.makedirs(pasta, exist_ok=True)
        return pasta
