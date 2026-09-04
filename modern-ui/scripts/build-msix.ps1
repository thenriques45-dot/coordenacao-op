<#
.SYNOPSIS
  Empacota o build da feature `store` num .msix para enviar a Microsoft Store.

.DESCRIPTION
  Pre-requisito: rodar antes, a partir de modern-ui/

      npm run tauri build -- --config src-tauri/tauri.store.conf.json --features store

  que produz src-tauri/target/release/CoordenacaoOP.exe (sem NSIS/MSI/updater).

  Este script monta a pasta de staging (exe + WebView2Loader.dll + Assets +
  AppxManifest.xml com a versao substituida) e roda `makeappx pack`.

  NAO assina o pacote: a Microsoft Store assina na submissao. Para testar
  localmente por sideload, assine depois com um certificado de dev cujo
  subject == Publisher do manifesto.

.PARAMETER Version
  Versao do pacote no formato x.y.z (a revisao .0 e adicionada). Se omitida,
  le de modern-ui/package.json.
#>
[CmdletBinding()]
param(
  [string]$Version
)

$ErrorActionPreference = "Stop"

$modernUi   = Split-Path -Parent $PSScriptRoot            # .../modern-ui
$repoRoot   = Split-Path -Parent $modernUi
$release    = Join-Path $modernUi "src-tauri\target\release"
$msixSrc    = Join-Path $modernUi "msix"
$icons      = Join-Path $modernUi "src-tauri\icons"
$staging    = Join-Path $modernUi "src-tauri\target\msix-staging"
$outDir     = Join-Path $modernUi "src-tauri\target\release\msix"

if (-not $Version) {
  $Version = (Get-Content (Join-Path $modernUi "package.json") | ConvertFrom-Json).version
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Versao invalida: '$Version' (esperado x.y.z)"
}
$pkgVersion = "$Version.0"
Write-Host "Empacotando CoordenacaoOP $pkgVersion"

# Sem bundler (bundle.active=false), o cargo emite o nome do pacote:
# coordenacaoop.exe. Com bundler/mainBinaryName seria CoordenacaoOP.exe.
$exe = @("CoordenacaoOP.exe","coordenacaoop.exe") |
  ForEach-Object { Join-Path $release $_ } |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $exe) {
  throw "Nao achei o executavel em $release. Rode antes: npm run tauri build -- --config src-tauri/tauri.store.conf.json --features store"
}
Write-Host "  exe: $exe"

# --- staging -------------------------------------------------------------
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging "Assets") | Out-Null

Copy-Item $exe (Join-Path $staging "CoordenacaoOP.exe")

$webview2 = Join-Path $release "WebView2Loader.dll"
if (Test-Path $webview2) {
  Copy-Item $webview2 (Join-Path $staging "WebView2Loader.dll")
  Write-Host "  + WebView2Loader.dll"
}

$assets = @(
  "StoreLogo.png","Square44x44Logo.png","Square71x71Logo.png",
  "Square150x150Logo.png","Square310x310Logo.png","Wide310x150Logo.png"
)
foreach ($a in $assets) {
  $p = Join-Path $icons $a
  if (-not (Test-Path $p)) { throw "Asset MSIX ausente: $p" }
  Copy-Item $p (Join-Path $staging "Assets\$a")
}

# --- manifesto ---------------------------------------------------------
$manifest = Get-Content (Join-Path $msixSrc "AppxManifest.xml") -Raw
$manifest = $manifest -replace 'Version="0\.0\.0\.0"', ("Version=""{0}""" -f $pkgVersion)
Set-Content -Path (Join-Path $staging "AppxManifest.xml") -Value $manifest -Encoding UTF8

# --- makeappx --------------------------------------------------------
$makeappx = Get-Command makeappx.exe -ErrorAction SilentlyContinue
if (-not $makeappx) {
  $cand = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $cand) { throw "makeappx.exe nao encontrado (instale o Windows SDK)." }
  $makeappx = $cand.FullName
} else {
  $makeappx = $makeappx.Source
}
Write-Host "  makeappx: $makeappx"

if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$msix = Join-Path $outDir ("CoordenacaoOP_{0}_x64.msix" -f $pkgVersion)

& $makeappx pack /o /d $staging /p $msix
if ($LASTEXITCODE -ne 0) { throw "makeappx pack falhou ($LASTEXITCODE)" }

Write-Host ""
Write-Host "OK: $msix"
Write-Host "Suba esse arquivo em Partner Center > Coordenacao OP > Pacotes (sem assinar)."
