import os
import shutil
import sys
from pathlib import Path

try:
    from platformdirs import user_data_dir
except Exception:  # pragma: no cover
    user_data_dir = None


APP_NAME = "CoordenacaoOP"
APP_AUTHOR = "CoordenacaoOP"
_MIGRACAO_PORTATIL_VERIFICADA = False


def is_frozen():
    return bool(getattr(sys, "frozen", False))


def _legacy_user_base_dir():
    if user_data_dir is not None:
        return Path(user_data_dir(APP_NAME, APP_AUTHOR))
    return Path.home() / ".coordenacaoop"


def _portable_base_dir():
    env_base = os.environ.get("COORDENACAOOP_HOME")
    if env_base:
        return Path(env_base)

    if is_frozen():
        return Path(sys.executable).resolve().parent

    return Path.cwd()


def _migrar_dados_usuario_para_portatil(base):
    global _MIGRACAO_PORTATIL_VERIFICADA
    if _MIGRACAO_PORTATIL_VERIFICADA:
        return
    _MIGRACAO_PORTATIL_VERIFICADA = True

    if not is_frozen():
        return

    legado = _legacy_user_base_dir()
    if legado.resolve() == base.resolve() or not legado.exists():
        return

    for nome in ("dados", "config", "backups"):
        origem = legado / nome
        destino = base / nome
        if origem.exists() and not destino.exists():
            shutil.copytree(origem, destino)


def app_base_dir():
    base = _portable_base_dir()
    base.mkdir(parents=True, exist_ok=True)
    _migrar_dados_usuario_para_portatil(base)
    return base


def data_dir(*parts):
    path = app_base_dir() / "dados"
    for part in parts:
        path = path / str(part)
    return str(path)


def config_dir(*parts):
    path = app_base_dir() / "config"
    for part in parts:
        path = path / str(part)
    return str(path)


def asset_path(*parts):
    rel = os.path.join(*parts)
    local = Path.cwd() / rel
    if local.exists():
        return str(local)

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        bundled = Path(meipass) / rel
        if bundled.exists():
            return str(bundled)
    return str(local)
