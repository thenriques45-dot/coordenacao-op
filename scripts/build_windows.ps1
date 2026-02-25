$ErrorActionPreference = "Stop"

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller

python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name CoordenacaoOP `
  --add-data "dados/imagens;dados/imagens" `
  main_gui.py

Write-Host "Build finalizado em dist/CoordenacaoOP.exe"
