#!/usr/bin/env bash
set -euo pipefail

python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
python3 -m pip install pyinstaller

python3 -m PyInstaller \
  --noconfirm \
  --clean \
  --onefile \
  --windowed \
  --name CoordenacaoOP \
  --add-data "VERSION:." \
  --add-data "dados/imagens:dados/imagens" \
  main_gui.py

rm -rf AppDir
mkdir -p AppDir/usr/bin
cp dist/CoordenacaoOP AppDir/usr/bin/CoordenacaoOP

cat > AppDir/AppRun <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/CoordenacaoOP" "$@"
EOF
chmod +x AppDir/AppRun

cat > AppDir/coordenacaoop.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=CoordenacaoOP
Exec=CoordenacaoOP
Icon=coordenacaoop
Categories=Office;Education;
Terminal=false
EOF

cat > AppDir/coordenacaoop.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="20" fill="#1f6aa5"/>
  <text x="50%" y="54%" text-anchor="middle" fill="#ffffff" font-size="64" font-family="Arial, sans-serif">CO</text>
</svg>
EOF

mkdir -p AppDir/usr/share/applications
cp AppDir/coordenacaoop.desktop AppDir/usr/share/applications/coordenacaoop.desktop

if [[ ! -f appimagetool ]]; then
  wget -q https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage -O appimagetool
  chmod +x appimagetool
fi

ARCH=x86_64 ./appimagetool AppDir "dist/CoordenacaoOP-x86_64.AppImage"
echo "Build finalizado em dist/CoordenacaoOP-x86_64.AppImage"
