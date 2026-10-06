#!/usr/bin/env bash
# Regenera cargo-sources.json e node-sources.json, as listas de dependências
# que o Flatpak baixa antes de compilar sem internet. Rode sempre que mudar
# modern-ui/src-tauri/Cargo.lock ou modern-ui/package-lock.json.
#
# Usa os geradores oficiais de github.com/flatpak/flatpak-builder-tools num
# ambiente Python temporário (precisa de git e python3).
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

git clone -q --depth 1 https://github.com/flatpak/flatpak-builder-tools.git "$temp/fbt"
python3 -m venv "$temp/venv"
"$temp/venv/bin/pip" install -q aiohttp tomlkit "$temp/fbt/node"

"$temp/venv/bin/python3" "$temp/fbt/cargo/flatpak-cargo-generator.py" \
  "$raiz/modern-ui/src-tauri/Cargo.lock" -o "$raiz/flatpak/cargo-sources.json"
"$temp/venv/bin/flatpak-node-generator" npm \
  "$raiz/modern-ui/package-lock.json" -o "$raiz/flatpak/node-sources.json"

echo "Fontes regeneradas em $raiz/flatpak/"
