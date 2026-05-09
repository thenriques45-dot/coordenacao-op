# CoordenacaoOP Modern UI

Prova de conceito da nova interface desktop usando Tauri, React, TypeScript e Vite.

Esta pasta e independente da interface Tkinter atual. A ideia e migrar por etapas, comecando pela tela de conselho, enquanto a versao Python existente continua funcionando.

## Objetivo da primeira etapa

- Validar a experiencia visual da tela de conselho em uma interface moderna.
- Definir navegacao, layout, tabelas e estados de aluno elegivel.
- Preparar a estrutura para conectar a interface aos dados reais do aplicativo atual.

## Requisitos de desenvolvimento

- Node.js LTS
- Rust stable
- Dependencias do Tauri para Windows

Referencias oficiais:
- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/start/frontend/vite/

## Comandos

```powershell
cd modern-ui
npm install
npm run dev
npm run tauri dev
```

## Proximo passo tecnico

Criar uma ponte entre o Tauri e os dados atuais do CoordenacaoOP. Existem duas rotas possiveis:

- Manter os servicos Python por enquanto e chamar um processo local/CLI.
- Migrar gradualmente regras estaveis para TypeScript ou Rust.

Para reduzir risco, a recomendacao inicial e reaproveitar os arquivos JSON atuais e implementar primeiro leitura em modo somente visualizacao.
