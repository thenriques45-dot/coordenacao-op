# Plano de Autoatualização

Este documento descreve uma abordagem segura para atualização automática sem reinstalação manual.

## Objetivo

Permitir que usuários Windows e Linux atualizem com um clique quando houver nova versão publicada no GitHub Releases.

## Estratégia recomendada

1. Manter um endpoint de versão (pode ser o próprio `latest release` da API do GitHub)
2. O app verifica versão atual x versão remota ao iniciar (ou por ação manual)
3. Se houver atualização:
   - baixa o pacote correto da plataforma
   - valida checksum SHA256
   - executa atualizador externo

## Windows

- Distribuir via instalador (Inno Setup ou NSIS)
- Usar atualizador externo (processo separado) para substituir binários após fechar o app
- Registrar versão instalada em arquivo local

## Linux

- AppImageUpdate (quando usar AppImage com metadados zsync)
- Alternativa: baixar novo AppImage e substituir arquivo atual

## Requisitos de segurança

- Validar checksum do artefato antes de aplicar update
- Exibir origem e versão alvo para o usuário
- Permitir opt-out de atualização automática

## Passos de implementação

1. Criar módulo `services/updater.py` com:
   - leitura da versão local
   - consulta da versão remota
   - comparação semântica
2. Adicionar menu na GUI:
   - `Ajuda > Verificar atualizações`
3. Implementar download + validação de checksum
4. Implementar instalador/atualizador por plataforma
