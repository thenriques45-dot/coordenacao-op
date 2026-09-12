# Publicação na Microsoft Store (MSIX)

O CoordenacaoOP vai para a Store como **MSIX**. A Store **assina** o pacote na
submissão — não usamos certificado de code signing próprio.

## Por que MSIX e não EXE/MSI

O tipo "EXE/MSI app" do Partner Center exige um instalador assinado com
certificado Authenticode (custo recorrente). MSIX submetido pela Store é
assinado pela Microsoft, de graça. O produto no Partner Center precisa ter sido
criado como **"Aplicativo MSIX ou PWA"** (não dá para trocar o tipo depois).

## Identidade do produto (Partner Center → Coordenação OP → Identidade do produto)

Fixos no `modern-ui/msix/AppxManifest.xml`:

| Campo | Valor |
|---|---|
| Package/Identity/Name | `ThiagoHenriqueSantos.CoordenaoOP` |
| Package/Identity/Publisher | `CN=7AB270BA-472E-4161-9899-910EEEC69DA9` |
| PublisherDisplayName | `Thiago Henrique Santos` |
| Package Family Name | `ThiagoHenriqueSantos.CoordenaoOP_akhysvd92kc4e` |
| Store ID | `9NB56ZCKQT6H` |

## Build da Store

Feature `store` do Cargo: desliga o auto-updater do Tauri (a Store atualiza) e
esconde na UI o "iniciar com o Windows" (o container do MSIX não deixa gravar a
chave de autostart). `app_info().loja == true` nesse build.

### Local (precisa do Windows SDK para o `makeappx`)

```powershell
cd modern-ui
npm run tauri build -- --config src-tauri/tauri.store.conf.json --features store
./scripts/build-msix.ps1
# -> src-tauri/target/release/msix/CoordenacaoOP_<versao>.0_x64.msix
```

### CI

Workflow **Store (MSIX)** (`.github/workflows/store.yml`), disparo manual em
Actions → Run workflow. Publica o `.msix` como artifact `coordenacaoop-msix`.
Baixe e envie em **Partner Center → Coordenação OP → Pacotes** (sem assinar).

## Versão

O MSIX usa 4 partes com revisão `.0` (ex.: `4.0.1.0`). O
`build-msix.ps1` substitui o placeholder do manifesto pela versão do
`package.json`. Cada envio à Store precisa de versão maior que a anterior.

## Migração de dados

A versão da Store grava em pasta isolada do pacote
(`%LOCALAPPDATA%\Packages\ThiagoHenriqueSantos.CoordenaoOP_akhysvd92kc4e\LocalCache\Roaming\CoordenacaoOP\`).
Quem vem da versão do GitHub **não vê os dados antigos** — precisa restaurar de
um backup. Deixar isso claro na descrição da Store.

## Coexistência

A versão da Store e a do GitHub convivem. Só a do GitHub tem auto-updater.
