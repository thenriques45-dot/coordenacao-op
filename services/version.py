import os

from services.runtime_paths import asset_path

APP_NAME = "CoordenacaoOP"


def _read_version_file():
    try:
        caminho = asset_path("VERSION")
        if os.path.exists(caminho):
            with open(caminho, "r", encoding="utf-8") as fp:
                texto = fp.read().strip()
                if texto:
                    return texto.lstrip("v")
    except Exception:
        return ""
    return ""


def _resolve_version():
    env_version = os.getenv("COORDENACAOOP_VERSION", "").strip()
    if env_version:
        return env_version.lstrip("v")

    file_version = _read_version_file()
    if file_version:
        return file_version

    return "1.0.2"


APP_VERSION = _resolve_version()
