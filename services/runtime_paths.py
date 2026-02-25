import os
import sys
from pathlib import Path

try:
    from platformdirs import user_data_dir
except Exception:  # pragma: no cover
    user_data_dir = None


APP_NAME = "CoordenacaoOP"
APP_AUTHOR = "CoordenacaoOP"


def is_frozen():
    return bool(getattr(sys, "frozen", False))


def app_base_dir():
    if is_frozen():
        if user_data_dir is not None:
            base = Path(user_data_dir(APP_NAME, APP_AUTHOR))
        else:
            base = Path.home() / ".coordenacaoop"
    else:
        base = Path.cwd()
    base.mkdir(parents=True, exist_ok=True)
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
