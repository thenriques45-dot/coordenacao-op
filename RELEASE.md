# Release e Autoatualizacao

Este projeto usa o updater oficial do Tauri 2 para atualizar a modern-ui automaticamente.

## O que o usuario final precisa fazer

Nada alem de instalar a primeira versao pelo instalador publicado no GitHub.

Depois disso, quando houver uma versao nova, o programa verifica a release publicada, baixa o instalador assinado, instala e reinicia.

## Secret obrigatorio no GitHub

A release moderna so gera autoatualizacao se o repositorio tiver o secret:

```text
TAURI_SIGNING_PRIVATE_KEY
```

O valor deve ser o conteudo completo do arquivo local:

```text
C:\Users\thenr\.tauri\coordenacaoop-updater.key
```

Nao publique esse arquivo no repositorio. Ele e a chave privada usada para assinar updates.

## Como cadastrar pelo GitHub

1. Abra o repositorio no GitHub.
2. Entre em `Settings`.
3. Entre em `Secrets and variables` > `Actions`.
4. Clique em `New repository secret`.
5. Nome: `TAURI_SIGNING_PRIVATE_KEY`.
6. Valor: cole o conteudo de `C:\Users\thenr\.tauri\coordenacaoop-updater.key`.
7. Salve.

## Como cadastrar pelo GitHub CLI

Se o GitHub CLI estiver instalado e autenticado:

```powershell
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo thenriques45-dot/coordenacao-op --body (Get-Content -Raw "$env:USERPROFILE\.tauri\coordenacaoop-updater.key")
```

## Como publicar uma nova versao

1. Atualize a versao em:
   - `modern-ui/package.json`
   - `modern-ui/package-lock.json`
   - `modern-ui/src-tauri/Cargo.toml`
   - `modern-ui/src-tauri/tauri.conf.json`
2. Crie e envie uma tag:

```powershell
git tag v2.0.1
git push origin v2.0.1
```

3. A workflow `.github/workflows/release.yml` gera somente a versão oficial em Tauri:
   - instalador Windows;
   - AppImage Linux;
   - assinaturas `.sig`;
   - `latest.json`;
   - release no GitHub.

## Arquivos necessarios na release

Para o auto update funcionar no Windows, a release precisa conter:

```text
CoordenacaoOP_2.0.1_x64-setup.exe
CoordenacaoOP_2.0.1_x64-setup.exe.sig
latest.json
```

Para Linux, a release precisa conter também:

```text
CoordenacaoOP_2.0.1_amd64.AppImage
CoordenacaoOP_2.0.1_amd64.AppImage.sig
```

O `latest.json` deve apontar para o instalador da propria release e conter a assinatura gerada no build.

## Perda da chave privada

Se a chave privada for perdida, as versoes ja instaladas nao conseguirao validar updates futuros assinados com outra chave.

Nesse caso, seria necessario distribuir manualmente uma nova instalacao com uma nova chave publica embutida.
