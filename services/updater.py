import json
import urllib.error
import urllib.request
import webbrowser

from services.version import APP_VERSION

REPO_OWNER = "thenriques45-dot"
REPO_NAME = "coordenacao-op"
LATEST_RELEASE_API = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"


def _normalize_version(v):
    if not v:
        return "0"
    texto = str(v).strip().lower()
    if texto.startswith("v"):
        texto = texto[1:]
    return texto


def _version_tuple(v):
    texto = _normalize_version(v)
    parts = texto.split(".")
    nums = []
    for part in parts:
        num = ""
        for ch in part:
            if ch.isdigit():
                num += ch
            else:
                break
        nums.append(int(num) if num else 0)
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums[:3])


def has_update(current_version, latest_version):
    return _version_tuple(latest_version) > _version_tuple(current_version)


def fetch_latest_release(timeout=8):
    req = urllib.request.Request(
        LATEST_RELEASE_API,
        headers={"User-Agent": "CoordenacaoOP-Updater"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Falha ao consultar release (status {resp.status}).")
        return json.loads(resp.read().decode("utf-8"))


def check_for_updates(current_version=APP_VERSION):
    try:
        release = fetch_latest_release()
        latest_tag = release.get("tag_name", "")
        latest_version = _normalize_version(latest_tag)
        release_url = release.get("html_url", "")
        return {
            "ok": True,
            "current_version": _normalize_version(current_version),
            "latest_version": latest_version,
            "latest_tag": latest_tag,
            "release_url": release_url,
            "update_available": has_update(current_version, latest_version),
        }
    except (urllib.error.URLError, TimeoutError) as exc:
        return {"ok": False, "error": f"Sem conexão para verificar atualizações: {exc}"}
    except Exception as exc:
        return {"ok": False, "error": f"Falha ao verificar atualizações: {exc}"}


def open_release_page(url):
    if not url:
        return False
    return webbrowser.open(url)
