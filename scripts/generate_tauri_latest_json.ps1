param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [Parameter(Mandatory=$true)]
    [string]$Tag,

    [Parameter(Mandatory=$true)]
    [string]$Repository,

    [Parameter(Mandatory=$true)]
    [string]$InstallerPath,

    [Parameter(Mandatory=$true)]
    [string]$SignaturePath,

    [Parameter(Mandatory=$true)]
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"

$installerName = Split-Path $InstallerPath -Leaf
$signature = (Get-Content -Raw $SignaturePath).Trim()
$url = "https://github.com/$Repository/releases/download/$Tag/$installerName"

$latest = [ordered]@{
    version = $Version.TrimStart("v")
    notes = "Atualização do CoordenacaoOP."
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature
            url = $url
        }
    }
}

$latest | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding utf8
