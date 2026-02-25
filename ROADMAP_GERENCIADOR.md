# Roadmap - CoordenacaoOP como Gerenciador de Turmas

## MVP v1 (base de gestao)
- GUI operacional unificada para Windows/Linux com adaptacao de atalhos/tema por plataforma.
- Catalogo de turmas com filtro por ano e busca por codigo/arquivo.
- Fluxos principais em tela: abrir turma, atualizar por CSV, importar mapao, gerar ata e relatorio.
- Validacoes de entrada e mensagens de erro padronizadas.
- Suporte de testes para fluxos criticos de relatorios.

## MVP v2 (gestao de dados)
- Cadastro/edicao de turma e aluno direto na GUI (sem depender so de importacao).
- Dashboard por bimestre com status de importacao, pendencias e documentos gerados.
- Assistente de importacao com pre-visualizacao e validacao antes de salvar.
- Log de operacoes relevantes (importacoes, atualizacoes, geracoes).
- Rotina de backup/restauracao do diretorio de dados.

## MVP v3 (produto distribuivel)
- Empacotamento para Windows/Linux (instalavel/executavel).
- Configuracao por ambiente (paths, templates e diretorio de saida).
- Auditoria de alteracoes em dados sensiveis.
- Suite de testes ampliada (servicos + fluxos GUI principais).
- Politica de migracao de schema para evolucao segura dos dados persistidos.
