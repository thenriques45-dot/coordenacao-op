# CoordenacaoOP Modern UI

Interface oficial do CoordenacaoOP, construída com Tauri 2, React, TypeScript, Vite e Rust.

Esta pasta concentra a aplicação desktop atual e é a base dos releases oficiais.

## Requisitos de desenvolvimento

- Node.js LTS
- Rust stable
- Dependências nativas do Tauri para o sistema operacional usado

Referência oficial:
<https://v2.tauri.app/start/prerequisites/>

## Comandos principais

```powershell
cd modern-ui
npm ci
npm run build
npm run tauri dev
```

Para validar o backend Tauri:

```powershell
cd modern-ui/src-tauri
cargo check
cargo test
```

## Dados locais

O aplicativo prioriza funcionamento portátil. Em builds instalados ou portáteis, os dados do usuário ficam na estrutura `dados/` resolvida pelo backend Rust, evitando que dados reais sejam versionados no Git.
