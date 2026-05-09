<p align="center">
  <img src="docs/imagens/logo_coordenacaoop_github.png" alt="Logotipo do CoordenacaoOP" width="720">
</p>

# CoordenacaoOP

Software de apoio à coordenação pedagógica para organizar turmas, importar dados, conduzir conselhos de classe e gerar documentos oficiais.

## O que o aplicativo faz

- cadastra e gerencia turmas
- importa alunos por CSV
- importa mapões em lote, cruzando alunos por nome
- registra encaminhamentos por aluno em cada conselho
- permite ajustes de nota durante o conselho
- gera ata de conselho em `.docx`
- gera relatório para professores em `.docx`
- salva dados de forma portátil junto ao executável
- faz backup e restauração dos dados
- verifica e instala atualizações pela modern-ui

## Para quem ele foi pensado

O aplicativo foi pensado para uso prático no cotidiano da coordenação pedagógica, com foco em reduzir trabalho manual na preparação e no registro dos conselhos de classe.

## Como baixar

As versões prontas para uso ficam na página de Releases do GitHub:

<https://github.com/thenriques45-dot/coordenacao-op/releases>

Arquivos publicados:

- Windows moderno: `CoordenacaoOP_2.0.0_x64-setup.exe`
- Windows legado: `CoordenacaoOP-windows.zip`
- Linux: `CoordenacaoOP-x86_64.AppImage`

## Como usar no Windows

1. Baixe o instalador `CoordenacaoOP_2.0.0_x64-setup.exe` da versão desejada.
2. Execute o instalador.
3. Abra o CoordenacaoOP pelo atalho criado.

Observação:
Dependendo das configurações do Windows/SmartScreen, pode aparecer alerta de aplicativo não reconhecido.

## Como usar no Linux

1. Baixe o arquivo `CoordenacaoOP-x86_64.AppImage`.
2. Dê permissão de execução ao arquivo.
3. Execute o AppImage.

## Sobre o desenvolvimento

Este projeto é desenvolvido com forte uso de vibe coding: a evolução do software acontece com apoio intenso de IA, sempre com revisão, testes e ajustes práticos orientados pelo uso real do aplicativo.

## Informações técnicas

Se você pretende rodar o projeto a partir do código-fonte:

- Modern UI: Tauri 2, React, TypeScript, Rust e Node.js
- Interface legada: Python 3.11+ (recomendado 3.12), dependências em `requirements.txt`
- Modern UI em desenvolvimento: `cd modern-ui && npm run tauri dev`
- Interface legada: `python main_gui.py`

## Licença

Este projeto é distribuído sob a licença **GPL-3.0-or-later**. Veja [LICENSE](LICENSE).

## Documentos adicionais

- Segurança: [SECURITY.md](SECURITY.md)
- Contribuição: [CONTRIBUTING.md](CONTRIBUTING.md)
- Código de conduta: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Release e autoatualização: [RELEASE.md](RELEASE.md)
