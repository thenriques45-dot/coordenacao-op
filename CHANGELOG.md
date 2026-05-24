# Changelog

## v2.3.2 - Correções do importador, tarefas e tema escuro

- Corrigida a importação de mapões para considerar alunos com situação `Encerrado` como ativos.
- A aba de tarefas nas telas de turma e aluno agora só aparece quando ainda existem tarefas vinculadas.
- Ajustado o tema escuro da tabela de notas por disciplina na tela individual do aluno.
- Changelogs antigos foram consolidados neste arquivo único.

## v2.3.1 - Quadro e calendário sem dados de demonstração

- Correção para iniciar Quadro Kanban e Calendário sem tarefas ou eventos de demonstração.
- Os dados do Quadro de Gestão permanecem dependentes apenas do uso local ou de backups importados.

## v2.3.0 - Calendário de gestão

- Novo Calendário de Gestão com eventos, recorrências e tarefas do Kanban em uma visão temporal unificada.
- Tarefas agora podem ser associadas a eventos, alunos e turmas, com abas próprias nas telas de aluno e turma.
- Quadro Kanban ganhou reordenação manual por arraste, ordenação automática por prazo e submenu dedicado na barra lateral.

## v2.2.0 - Quadro de gestão e tema escuro

- Novo Quadro de Gestão em formato Kanban, com tarefas, etiquetas, anexos e colunas personalizáveis.
- Tema escuro com alternância rápida pela barra lateral.
- Dashboard agora exibe as próximas tarefas do Kanban.

## v2.1.7 - Busca por aluno nas turmas

- A busca nas telas de Turmas e Conselho agora também considera os nomes dos alunos ativos de cada sala.
- A busca foi ajustada para ignorar acentos, permitindo localizar alunos e turmas mesmo com digitação simplificada.

## v2.1.6 - Relatórios e correções de persistência

- Adicionada a central de relatórios ao menu lateral.
- Adicionado o Relatório de Alunos Críticos, com filtro por bimestre e por série.
- Adicionado o relatório Alterações de Notas Pós-Conselho, comparando decisões do conselho com o último mapão importado.
- Os relatórios gerados agora oferecem botão para abrir diretamente a pasta de destino.
- Corrigida a persistência do coordenador de turma ao voltar para os cards e reabrir a turma.
- Ajustado o ciclo de líder e vice líder para evitar conflitos quando as duas funções já estão preenchidas.
- Melhorado o caminho de salvamento em Linux, AppImage e versão portátil.
- Manual do usuário atualizado com imagens revisadas.

## v2.1.5 - Educação especial e importação de mapões

- Adicionada aba "Educação Especial" na tela individual de alunos elegíveis.
- Condições especiais podem ser selecionadas como botões, novas condições podem ser criadas e comentários complementares podem ser salvos.
- A tela de conselho agora reúne atas e relatórios no botão "Documentação de conselho", listando documentos por bimestre.
- Removido o marcador "conselho finalizado/não finalizado" da tela de seleção de conselho.
- Adicionado indicador de evolução por disciplina na tela de conselho, com histórico bimestral em balão flutuante.
- Importadores foram agrupados no menu "Importar Dados".
- O importador de mapões agora reconhece versões com nome, apenas número, ou nome e número do aluno.
- Corrigida a leitura de blocos com "Nº/M/F/AC" para preservar médias, faltas e ausências compensadas corretamente.

## v2.1.4 - Tela de novidades

- Adicionada tela "O que há de novidade" exibida uma vez por versão após atualização do programa.
- A tela mostra uma lista objetiva das mudanças da versão atual.
- O aviso fica registrado localmente depois que o usuário confirma a leitura.

## v2.1.3 - Cabeçalho personalizado da ata

- Adicionada opção na tela de configurações para enviar imagem de cabeçalho da ata.
- Aceita imagens JPG, JPEG e PNG.
- O cabeçalho personalizado passa a ser usado na ata e no relatório dos professores.
- Mantida compatibilidade com o cabeçalho padrão antigo quando nenhuma imagem personalizada é enviada.
- Incluído manual de uso em PDF, DOCX e Markdown com imagens demonstrativas da interface e instruções de download pelo GitHub.

## v2.1.2 - Elegiveis e lideranca de sala

- Portado para a modern-ui o importador da lista geral de alunos elegiveis.
- Importacao de elegiveis com casamento por RA e, quando necessario, por nome.
- Registro da lista de deficiencias do aluno nas turmas existentes.
- Relatorio de alunos nao encontrados e nomes ambiguos apos a importacao.
- Marcacao manual de lider e vice lider na gestao de turma, com apenas um aluno por funcao.
- Exibicao dos lideres de sala no card da turma.

## v2.1.1 - Proteções de cadastro e backup seletivo

- Bloqueio de turmas usando a mesma sala no mesmo período e ano letivo.
- Validação de CSVs duplicados na criação de salas em lote.
- Filtro de ciclos na tela de turmas limitado aos ciclos realmente cadastrados.
- Backup com seleção por ciclo, mostrando apenas ciclos existentes.
- Atalho para abrir a pasta do último backup gerado.

## v2.1.0 - Criação de salas em lote

- Novo botão "Criar salas em lote" na tela de gestão de turmas.
- Criação de várias turmas a partir de um intervalo de letras, como A até G.
- Seleção de múltiplos CSVs com validação pelo nome do arquivo:
  - A.csv para a turma A;
  - B.csv para a turma B;
  - e assim por diante.
- Bloqueio da criação quando faltam CSVs, há arquivos fora do padrão ou alguma turma do lote já existe no ano letivo.
- Campo opcional de sala inicial, com numeração sequencial quando preenchido.
- Reaproveitamento da mesma importação de alunos, incluindo tratamento de nome social e elegibilidade.

## v2.0.0 - Modern UI, importação em lote e autoatualização

- Nova interface desktop em Tauri 2, React e TypeScript.
- Dashboard moderno com resumo das turmas, alunos e conselhos.
- Tela de gestão de turmas redesenhada com cards, busca, criação, edição, exclusão e atualização de CSV.
- Nova tela de gestão da turma com:
  - cabeçalho com métricas;
  - edição do coordenador de sala;
  - lista de alunos;
  - edição manual de elegibilidade;
  - tela individual de aluno com gráfico por disciplina, tabela de notas, 5º conceito e frequência.
- Nova tela de conselho com:
  - seleção prévia da turma;
  - lista lateral de alunos;
  - indicação de aluno elegível sem expor dados sigilosos;
  - edição inline da nota de conselho;
  - ordenação visual por situação;
  - encaminhamentos em botões;
  - modo reunião em tela cheia;
  - cronômetro persistente;
  - finalização do conselho;
  - geração de ata e relatório dos professores.
- Relatórios `.docx` revisados:
  - cabeçalho institucional por imagem;
  - formatação compacta de tabelas;
  - relatório por disciplina em páginas separadas;
  - aviso destacado quando não há ajustes para a Sala do Futuro.
- Importação de mapões em lote:
  - leitura de múltiplos `.xlsx`;
  - detecção de turma por interseção de nomes;
  - tratamento de alunos ativos;
  - importação de médias, faltas, compensações e carga horária;
  - tratamento de nome social no CSV.
- Persistência portátil dos dados junto ao executável.
- Backup e restauração compatíveis com o formato antigo (`dados/`, `config/` e manifesto).
- Tela de configurações com nome da direção, pronome e média mínima.
- Autoatualização via plugin oficial do Tauri:
  - artefatos assinados;
  - `latest.json`;
  - instalação e reinício pelo aplicativo.
- Workflow de release atualizada para publicar a versão Tauri oficial para Windows e Linux.
- Nova identidade visual com logo e ícone Coord OP.

Changelog v1.6

v1.6.4 - Selo de aluno elegivel no conselho
- Selo `ALUNO ELEGIVEL` passou a aparecer antes do nome do aluno.
- Evita que nomes longos escondam a indicacao na tela de conselho.

v1.6.3 - Ajuste da tela de conselho maximizada
- Janela de conselho maximizada agora respeita uma folga inferior no Windows.
- Evita que os botoes de navegacao e finalizacao fiquem cobertos pela barra de iniciar.

v1.6.2 - Ajuste do build no GitHub
- Testes de importacao de alunos elegiveis passaram a usar caminhos compativeis com Windows e Linux.
- Corrige a falha do CI no GitHub Actions sem alterar o comportamento do aplicativo.

v1.6.1 - Ajustes em disciplinas sem nota no conselho
- Disciplinas sem nota no mapao continuam aparecendo com `-` no conselho.
- Agora e possivel lancar media ajustada para disciplinas sem nota original.
- Relatorio dos professores passou a incluir estes lancamentos:
  - media original como `-`
  - media ajustada informada no conselho
  - observacao para orientar o registro manual na Sala do Futuro

v1.6 - Portabilidade, conselho ampliado e melhorias de turmas
- Dados passaram a usar modo portatil quando o aplicativo estiver empacotado:
  - `dados`, `config` e `backups` ficam junto do executavel
  - dados antigos da pasta do usuario sao migrados automaticamente para a pasta portatil quando necessario
- Tela de conselho recebeu ajustes de uso em tela cheia:
  - botoes internos para maximizar e restaurar
  - conteudo acompanha o tamanho da janela
  - textos, tabelas e encaminhamentos ficaram maiores
  - selo `ALUNO ELEGIVEL` destacado sem expor a deficiencia
- Gerenciamento de turmas passou a permitir excluir varias salas selecionadas de uma vez.
- Importacao de mapoes ficou mais segura para FGB + IF:
  - disciplinas repetidas no IF nao sobrescrevem as disciplinas ja vindas do FGB
  - disciplinas sem nota aparecem no conselho com `-`
  - disciplinas sem media nao podem receber ajuste manual no conselho
- Alunos elegiveis:
  - importacao de CSV geral da escola por RA ou nome
  - persistencia da lista de deficiencias no cadastro do aluno
  - exibicao da lista apenas em `Gerenciar alunos`
- Novos testes cobrindo portabilidade, importacao de alunos elegiveis e regras de mapao.

Arquivos principais
- gui/app.py
- services/runtime_paths.py
- services/importador_mapao.py
- services/importador_alunos_especiais.py
- services/importador_dados.py
- services/persistencia.py
- tests/test_runtime_paths.py
- tests/test_importador_mapao.py
- tests/test_alunos_necessidades_especiais.py

Changelog v1.4.x

v1.4.6 - Correcao no campo de ano letivo
- Corrigida a exibicao do ano letivo na tela `Editar dados da turma`
- Mantidas as informacoes bloqueadas de ciclo, serie e ano visiveis durante o uso do dialogo

v1.4.5 - Edicao dos dados da turma
- Nova opcao `Editar dados da turma` na tela de gestao da turma
- Permite alterar turma, numero da sala e periodo apos a criacao
- Exibe ciclo, serie e ano letivo como informacoes bloqueadas para consulta
- Atualiza o codigo e o arquivo persistido quando a identificacao da turma muda

v1.4.4 - Ajustes no fluxo de turmas e lista de alunos
- Removido o botao `Abrir selecionada`, que deixava o fluxo de turmas confuso
- As acoes rapidas agora usam automaticamente a turma selecionada na lista
- A atualizacao por CSV ganhou a opcao de substituir completamente a lista de alunos
- A tela de gerenciamento de alunos ganhou a opcao de apagar a lista atual
- Confirmacoes adicionadas para deixar claro quando notas, frequencias, ajustes e encaminhamentos vinculados aos alunos serao removidos

v1.4.1 - Acompanhamento anual de faltas e normalizacao das disciplinas
- Nova tela `Acompanhar faltas e compensacoes` na gestao da turma:
  - acumulado anual por aluno e disciplina
  - soma de faltas, aulas e ausencias compensadas ao longo dos bimestres importados
  - saldo pendente apos compensacao e identificacao de excesso
- Importacao de mapoes passou a ler a coluna `AC` como ausencia compensada dentro do bloco de cada disciplina
- Reimportacao segue segura para o fluxo FGB + IF:
  - valores vazios nao apagam faltas, compensacoes ou medias ja importadas
- Nomes de disciplinas vindos do mapao agora sao normalizados para evitar duplicidade visual:
  - remocao de acentos
  - padronizacao em caixa alta
  - exemplo: `EDUCAÇÃO FINANCEIRA` passa a ser consolidada como `EDUCACAO FINANCEIRA`
- Abreviacoes da ata foram ajustadas para continuar funcionando com os nomes normalizados
- Novos testes cobrindo leitura de `AC`, acumulado de frequencia e normalizacao de disciplinas

v1.4.0 - Acompanhamento de ajustes de nota apos o conselho
- Novo acompanhamento para verificar se os ajustes de nota combinados no conselho foram aplicados:
  - status `Aplicado` quando o novo mapao traz a media esperada
  - status `Pendente` quando a media original ainda permanece
  - status `Divergente` quando o novo mapao traz um valor diferente do acordado
- Nova tela `Verificar ajustes de notas` na gestao da turma:
  - resumo por bimestre com totais aplicados, pendentes e divergentes
  - listagem por aluno e disciplina com medias original, do conselho e do mapao atual
  - exibicao da observacao registrada no ajuste
- Importacao de mapoes passou a reconciliar automaticamente os ajustes registrados no conselho
- Reimportacao de mapoes ficou mais segura para o fluxo FGB + IF:
  - medias validas atualizam os dados da turma
  - valores vazios nao apagam medias ja importadas
  - disciplinas repetidas em mapoes diferentes deixam de sobrescrever nota com vazio
- Mensagem de sucesso da importacao agora informa o resumo dos ajustes de nota quando houver dados para acompanhar
- Novos testes cobrindo reconciliacao de ajustes e reimportacao de mapoes

Arquivos principais do ciclo 1.4.x
- gui/app.py
- services/importador_mapao.py
- services/acompanhamento_ajustes.py
- tests/test_acompanhamento_ajustes.py
- tests/test_importador_mapao.py
- VERSION
- services/version.py

Changelog v1.3.x

v1.3.3 - Refinos finais do logo no GitHub e do icone no Windows
- Icone do app/release regenerado com melhor ocupacao visual para o Windows
- Logo do repositório ganhou versao com fundo branco para melhor leitura no GitHub em modo escuro
- `README` atualizado para usar a versao do logo pensada para a página do GitHub

v1.3.2 - Identidade visual aplicada ao app e ao repositório
- Logotipo exibido no topo do `README` para aparecer na página do GitHub
- Ícone aplicado à janela do programa
- Ícone `.ico` gerado para o empacotamento do executável Windows
- Build Linux atualizado para usar a arte real do ícone
- Cabeçalho principal do app passou a exibir o logotipo em versão tratada para interface:
  - recorte sem sobra de prancheta
  - melhor nitidez
  - uso do logotipo sem repetição do nome em texto

v1.3.1 - Backup transportavel entre computadores e textos mais claros na interface
- Novo fluxo para transporte de dados entre computadores:
  - exportacao de dados para um unico arquivo `.zip`
  - adicao de dados de outro backup sem apagar os dados locais
  - substituicao completa dos dados locais por um backup escolhido
  - backup de seguranca automatico antes da substituicao completa
- Regras de importacao mais seguras:
  - arquivos ja existentes localmente sao mantidos
  - conflitos sao ignorados e informados ao usuario
- Textos do menu foram ajustados para ficar mais claros para uso leigo:
  - `Exportar dados...`
  - `Adicionar dados de backup...`
  - `Substituir dados pelo backup...`
- Rotina de substituicao de dados no Windows ficou mais robusta contra arquivos travados
- Novos testes cobrindo exportacao, restauracao e mesclagem de backups

v1.3.0 - Ajustes de medias no conselho e documentacao final mais objetiva
- Tela de conselho passou a permitir ajuste de media por disciplina:
  - exibicao da media original e da media ajustada no conselho
  - edicao por selecao da disciplina ou duplo clique na linha
  - observacao livre para orientar o lancamento manual posterior
  - destaque visual para disciplinas com ajuste registrado
- Ajustes de media agora sao persistidos na turma:
  - armazenamento de media original
  - armazenamento de media ajustada
  - armazenamento da observacao do conselho
- Fluxo de fechamento do conselho foi reorganizado:
  - tela principal ficou mais enxuta para navegacao entre alunos
  - nova janela de finalizacao concentra data, texto da ata e geracao de documentos
  - texto da ata passou a salvar automaticamente durante a digitacao
  - botao para restaurar o texto padrao da ata
  - selecao de local para salvar ata e relatorio acontece ao marcar cada checkbox
  - confirmacao extra ao finalizar sem gerar nenhum documento
- Relatorio de encaminhamento aos professores foi reformulado para impressao:
  - organizacao por disciplina em formato de folha de tarefas
  - bloco para ajustar notas na Sala do Futuro
  - bloco para compensar faltas
  - bloco para alunos com defasagem de nota sem ajuste
  - separacao visual maior entre as tabelas para melhorar a leitura
- Tela inicial recebeu melhoria de usabilidade:
  - duplo clique sobre a turma no catalogo abre diretamente a gestao da turma
- Testes atualizados para cobrir o novo relatorio por tarefas e os ajustes de media

Arquivos principais do ciclo 1.3.x
- gui/app.py
- services/gerador_relatorio_professores.py
- services/persistencia.py
- domain/aluno.py
- tests/test_gerador_relatorio_professores.py
- VERSION
- services/version.py

Changelog v1.2.x

v1.2.1 - Ajuste fino na largura do editor da ata
- Tela de conselho recebeu mais 20px aproximados na largura do texto da ata para melhorar o conforto de leitura sem voltar a exagerar na largura total da janela

v1.2.0 - Ata personalizavel no conselho e refinamentos de usabilidade
- Tela de conselho passou a permitir editar o texto da ata por bimestre:
  - cabeçalho inicial sugerido dinamicamente com data, direção e abertura do conselho
  - corpo padrão da ata sugerido como texto-base editável
  - personalização salva por bimestre na turma
  - geração da ata usa automaticamente o texto salvo no conselho
- Título da ata ficou mais completo:
  - formato com bimestre, ano, turma e sala
  - exemplo: `CONSELHO DE CLASSE - 1º BIM/2026 - 2a SERIE A - SALA 04`
- Compatibilidade com turmas antigas melhorada:
  - turmas legadas do Ensino Médio como `2A` passam a ser exibidas como `2a SERIE A`
  - persistência agora salva e restaura `serie`, `sala`, `periodo` e `ciclo`
- Tela de conselho refinada:
  - data do conselho sem truncamento no cabeçalho
  - distribuição mais horizontal dos painéis
  - largura do editor da ata ajustada para leitura mais confortável
- Workflows do GitHub Actions atualizados para versões compatíveis com a migração do Node 24:
  - `actions/checkout@v5`
  - `actions/setup-python@v6`
  - `actions/upload-artifact@v6`
  - `actions/download-artifact@v5`
- Novos testes cobrindo montagem do texto/título da ata e persistência do texto editável

Arquivos principais do ciclo 1.2.x
- gui/app.py
- services/gerador_ata.py
- services/persistencia.py
- domain/turma.py
- tests/test_gerador_ata_intro.py
- .github/workflows/ci.yml
- .github/workflows/release.yml
- VERSION
- services/version.py

Changelog v1.1.x

v1.1.0 - Modernizacao da interface e assistente inicial
- Tela principal reorganizada em formato de dashboard:
  - cabecalho mais claro
  - catalogo de turmas com filtros mais legiveis
  - acoes rapidas agrupadas
  - painel lateral de status e configuracoes
- Base visual refinada para ficar mais proxima de apps desktop modernos no Windows/Linux:
  - tipografia e espacamento mais consistentes
  - treeviews e botoes com melhor hierarquia visual
- Novo "Assistente inicial":
  - configura nota minima
  - configura dados da direcao
  - permite criar a primeira turma no mesmo fluxo
  - abre automaticamente apenas quando nao ha turmas e a configuracao inicial ainda esta pendente
- Janelas de trabalho passam a ajustar o tamanho ao conteudo automaticamente:
  - criar turma
  - gerir turma
  - conselho
  - gerenciar alunos
  - atualizar por CSV
  - importar mapoes
- Terminologia refinada na criacao da turma:
  - "Sala" alterado para "Numero da sala"
- Ambiente virtual local passa a ser ignorado pelo Git com `.venv/` no `.gitignore`

Arquivos principais do ciclo 1.1.x
- gui/app.py
- gui/platform_ui.py
- services/configuracao.py
- services/version.py
- VERSION
- .gitignore

Changelog v1.0.x

v1.0.4 - Ajustes de UX e fluxo de conselho
- Tela "Gerir turma" com seletor de periodo em dropdown:
  - 1o bimestre, 2o bimestre, 3o bimestre, 4o bimestre e 5o conceito
- Campos de arquivo movidos para telas proprias:
  - "Atualizar turma por CSV"
  - "Importar mapoes"
- Botao de relatorio removido da tela de gestao.
- Novo botao na tela de conselho:
  - "Encaminhamentos professores" (gera relatorio no bimestre atual do conselho)
- Bloco "Status do bimestre" removido da gestao para evitar inconsistencias.

v1.0.3 - Correcao de versao no executavel
- Versao do app passa a ser lida de forma robusta:
  - variavel de ambiente (quando existir)
  - arquivo VERSION empacotado no build
  - fallback local
- Pipeline de release passou a gerar VERSION a partir da tag.
- Scripts de build Windows/Linux passaram a incluir VERSION no bundle.

v1.0.2 - Menu Ajuda
- Novo item "Sobre" no menu Ajuda com:
  - nome do app
  - versao atual
  - descricao curta
  - licenca
  - link do repositorio GitHub

v1.0.1 - Correcao de build Linux
- Ajuste no empacotamento AppImage para resolver falha de build.

v1.0.0 - Base da versao estavel
- GUI consolidada com cobertura das funcionalidades principais do CLI.
- Tela de conselho por bimestre (aluno a aluno), com:
  - notas por situacao (abaixo, limite, adequada)
  - frequencia por disciplina
  - encaminhamentos ENC 1..10 com salvamento automatico
- Integracao dos encaminhamentos no campo ENCAM da ata.
- Geracao de ata na tela de conselho (bimestre automatico).
- Suporte ao 5o conceito (5C) na gestao de alunos.
- Exclusao de turma com confirmacao.
- Selecao de destino ao salvar ata e relatorio.
- Projeto preparado para distribuicao open source:
  - licenca GPL-3.0
  - documentacao de contribuicao/seguranca
  - pipelines de CI e release para Windows/Linux
- Verificacao manual de atualizacoes via menu Ajuda (GitHub Releases).

Arquivos principais do ciclo 1.0.x
- gui/app.py
- services/updater.py
- services/version.py
- services/gerador_ata.py
- services/gerador_relatorio_professores.py
- services/runtime_paths.py
- .github/workflows/ci.yml
- .github/workflows/release.yml
- scripts/build_windows.ps1
- scripts/build_linux_appimage.sh

Changelog v0.9.0

Resumo amigavel
- Interface grafica inicial multiplataforma (Windows/Linux) usando tkinter.
- Adaptacao por plataforma para tema e atalhos principais.
- Catalogo de turmas com filtro por ano, busca e abertura por duplo clique.
- Criacao de nova turma diretamente na GUI a partir de CSV.
- Edicao basica de alunos pela GUI (nome, numero de chamada e ativo/inativo).
- Fluxos principais operacionais em GUI:
  - atualizar turma por CSV
  - importar mapao FGB/IF
  - gerar ata
  - gerar relatorio para professores
- Painel de status por bimestre (mapao, ata, relatorio e pendencias de frequencia).
- Gerador de ata ajustado para modo GUI (sem input obrigatorio) mantendo compatibilidade com CLI.

Arquivos principais
- main_gui.py (novo)
- gui/app.py (novo)
- gui/platform_ui.py (novo)
- gui/bootstrap.py (novo)
- services/gerador_ata.py (ajustes de integracao GUI)
- ROADMAP_GERENCIADOR.md (novo)
- CHECKLIST_v0.9.0.md (novo)

Changelog v0.8

Resumo amigável
- Relatório DOCX para professores (agrupado por disciplina), com:
  - Alunos abaixo da nota mínima (com nota)
  - Alunos com excesso de faltas (com percentual e lista para compensação)
- Novo item de menu para gerar o relatório de professores
- Persistência de médias por disciplina para uso em relatórios
- Configurações migradas para `config/configuracoes.json`
- Texto da ata ajustado para gênero correto da direção

Arquivos principais
- services/gerador_relatorio_professores.py (novo)
- domain/aluno.py (novo campo `medias`)
- services/importador_mapao.py (salva médias)
- services/persistencia.py (salva/carrega médias)
- main.py (novo menu)
- services/configuracao.py (configurações + migração)
- services/gerador_ata.py (texto da direção)

