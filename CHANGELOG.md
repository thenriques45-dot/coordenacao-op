# Changelog

## v4.5.0 - Diagnóstico da turma, relatórios descritos com IA e central de avisos

Reúne três conjuntos de novidades que entraram juntos (diagnóstico da turma, relatório descrito com IA e central de avisos), por isso a versão salta da 4.2.6 direto para a 4.5.0. As versões 4.3 e 4.4 não foram publicadas.

### Diagnóstico da turma e do aluno
- **Relatório diagnóstico da turma:** botão "Relatório diagnóstico" na tela da turma, ao lado das abas. Gera páginas A4 para entregar aos professores: panorama com indicadores e gráficos, leitura da turma (pontos de atenção, pontos positivos e sugestões de abordagem), frequência, ranking de fragilidades pedagógicas, mapa de calor de notas, evolução e queda na Prova Paulista, Avaliação Diagnóstica (AvD) e SARESP e destaques. As páginas e o tamanho das listas são escolhidos antes de imprimir; "Salvar como PDF" gera o arquivo.
- **AvD:** página com os níveis da turma e as listas de alunos em ascensão (subiram de nível da 1ª para a 2ª AvD em ao menos um componente) e alunos desafio (caíram em ao menos um), com o nível e a aprendizagem equivalente de antes e depois.
- **Aluno Presente e SARESP no diagnóstico:** a frequência usa o Aluno Presente quando importado (presença das duas últimas semanas e risco de reprovação por faltas), e o SARESP – Diagnóstico entra com a média da turma por disciplina e os alunos abaixo de 4.
- **Aba Estatísticas:** passa a mostrar o diagnóstico completo da turma. O nome do aluno abre a ficha dele.
- **Aba Diagnóstico na ficha do aluno:** o mesmo diagnóstico recortado para o aluno e comparado com a média da turma (notas, frequência, Prova Paulista, AvD, SARESP, pontos de atenção e sugestões), imprimível em duas páginas A4.

### Relatórios descritos com IA
- **Descrever relatório com IA:** card novo na Central de Relatórios. O pedido em português vira um relatório que abre no construtor, já na pré-visualização, para conferir antes de salvar. A IA responde um plano simples (campos, condições, ordenação, agrupamento, limite) que o app converte para a definição do relatório, e nomes de disciplina e série são casados sem diferenciar acentos ou maiúsculas.
- Funciona com Gemini, Ollama e o modo prompt manual. A IA recebe só o catálogo de campos, as disciplinas e as séries, nunca dados de aluno.
- **Validação de relatórios:** campo inexistente, campo sem disciplina, ordenação ou bloco sem destino, parâmetro não declarado, condição sem valor e coluna oculta fora do fim são apontados. Os problemas voltam à IA para uma segunda tentativa e, se continuarem, aparecem na tela.
- **Windows:** corrigido o build, que falhava porque `centralAvisos.ts` e `CentralAvisos.tsx` tinham o mesmo nome num sistema de arquivos que ignora maiúsculas.


### Avisos de prazo dentro do app
- **Central de avisos:** os alertas de prazo das tarefas do Kanban ("2 dias", "1 dia", "no dia") passam a aparecer dentro do app. Um sino no rodapé da barra lateral mostra quantos avisos ainda não foram lidos; clicar num aviso abre a tarefa no Kanban. Quando surge um aviso novo, ele aparece por alguns segundos no canto da tela. O texto diz quanto falta de fato: se o app ficou fechado alguns dias, o alerta "2 dias antes" aparece como "vence amanhã".
- **Fim das notificações do sistema:** os avisos dependiam das notificações do Windows e do Linux, que nunca funcionaram de forma confiável. Saíram o `notify-rust`, o plugin de notificação do Tauri e a permissão correspondente.
- **Avisos de tarefas compartilhadas para todos:** a marca de "já avisado" ficava gravada na própria tarefa, que sincroniza com o grupo. O primeiro coordenador a abrir o app consumia o aviso dos colegas. Agora cada computador guarda o próprio registro.

### Importações
- **Aluno Presente:** novo importador para a exportação do BI "Aluno Presente", com uma planilha por turma e várias de uma vez. A presença anual passa a ser a frequência geral do aluno no app, atualizada toda semana sem esperar o mapão. A presença das duas últimas semanas e o risco de reprovação por faltas também ficam guardados. A frequência por disciplina continua vindo do mapão, que para de sobrescrever a frequência geral de quem já tem dado do Aluno Presente. Na sincronização com o grupo, vence a importação mais recente.
- **SARESP – Diagnóstico:** novo importador para a exportação do BI "SARESP - Diagnóstico". Guarda por aluno a nota média, a disciplina de menor nota e a nota de cada disciplina, de 0 a 10. O arquivo não traz RA: o aluno é casado pelo nome, e a turma do rodapé da planilha desempata nomes repetidos. As notas entram no motor de relatórios.
- **Recomposição – Diagnóstico (AvD):** o antigo "Importar Diagnóstico SARESP" passou a se chamar assim, que é o nome do BI de onde o arquivo vem (1ª e 2ª AvD, com a aprendizagem equivalente). Nada muda na leitura do arquivo.
- **Prova Paulista por RA:** os alunos passam a ser casados pelo RA da coluna "NR RA". Antes eram casados pelo nome, e grafias diferentes deixavam alunos de fora ou ambíguos.
- **Alunos prioritários:** novo relatório pronto "Alunos prioritários (AvD)", com a pontuação da planilha de análise da AvD (2ª AvD 1,5; 1ª AvD, frequência, Prova Paulista e SARESP 1 cada). Componente, nível da AvD, cortes de frequência, Prova Paulista e SARESP, e pontos para ser prioritário são escolhidos na hora de gerar. Ordem: mais pontos primeiro; no empate, menor aprendizagem equivalente. Os campos (pontos, critérios atendidos, prioritário, 1ª e 2ª AvD, ano equivalente) também ficam disponíveis para relatórios personalizados.
- **Motor de relatórios:** colunas podem ser marcadas como ocultas, para servir só de critério de ordenação.
- **Motor de relatórios:** campos novos de média da Prova Paulista entre os bimestres importados (geral e por disciplina), do SARESP (nota média, nota por disciplina e disciplina de menor nota) e do Aluno Presente (presença na semana atual e na anterior, risco de reprovação por faltas).

### Linux: Flatpak
- O app passa a ser publicado também como `.flatpak` em cada release, com o runtime GNOME 51. No Flatpak quem atualiza é a loja do sistema ou o `flatpak update`. Os dados ficam no sandbox (`~/.var/app/io.github.thenriques45_dot.CoordenacaoOP`). Para levar os dados do AppImage, use Backup → Exportar no AppImage e Restaurar no Flatpak. Detalhes em `docs/flatpak.md`.
- **Atualização pela loja:** o Flatpak sai de um repositório próprio no GitHub Pages (<https://thenriques45-dot.github.io/coordenacao-op/>), assinado com GPG. Quem instala por lá, ou pelo `.flatpak` da release, recebe as versões novas pela loja do sistema.

### Identificador do app
- O identificador mudou de `br.gov.sp.educacao.coordenacaoop` para `io.github.thenriques45-dot.CoordenacaoOP` (no Flatpak, `io.github.thenriques45_dot.CoordenacaoOP`, porque o Flathub troca `-` por `_` e o Tauri não aceita `_`), porque o antigo sugeria um vínculo com a Secretaria da Educação que o app não tem. O WebView continua usando a pasta de dados do identificador antigo quando ela existe, então nada se perde: configurações de IA, tema e tutoriais vistos continuam lá. O instalador do Windows passa a indicar "Thiago Henrique Santos" como fabricante.
- O espelho em disco (`dados/estado_ui.json`) passa a guardar também os avisos, o tema, o menu Gestão aberto ou fechado, a exibição do Kanban e os tutoriais já vistos.

## v4.2.6 - Barra de título no tema do sistema (Linux)

- **Linux (AppImage):** a barra de título podia aparecer clara com o Fedora/GNOME em modo escuro. Desde a v4.2.5 a barra é desenhada pelo próprio app em Wayland. Para escolher o tema, o AppImage consultava o sistema com tempo limite de 1 segundo e, se a consulta falhasse, ficava no claro. Isso acontecia sobretudo ao abrir junto com o sistema e ao reiniciar depois de uma atualização. O app agora lê a preferência claro/escuro do sistema por conta própria. Para escolher outro tema, defina `APPIMAGE_GTK_THEME` (por exemplo, `adw-gtk3-dark`, com o pacote `adw-gtk3-theme` instalado).
- Correção na nota da v4.2.5: o AppImage continua levando o próprio `libwayland`. A exclusão não funcionou com a versão do linuxdeploy usada pelo Tauri, e o app roda normalmente em Wayland com ele.

## v4.2.5 - Janela não congela mais no Linux

- **Linux (AppImage):** a janela podia congelar depois de algum tempo aberta, e só voltava ao forçar o fechamento. O programa continuava rodando, mas a tela parava de ser redesenhada. A causa: o AppImage forçava o modo X11, e nele o GTK e o gerenciador de janelas do GNOME perdiam a sincronização de quadros. Em sessões Wayland o app agora usa o backend nativo. Para voltar ao modo antigo, defina `APPIMAGE_GDK_BACKEND=x11`.
- **Linux com NVIDIA:** corrigida a tela preta, que desenhava só a área sob o mouse até um clique. O renderizador DMA-BUF do WebKitGTK passa a ficar desligado por padrão. Para reativá-lo, defina `WEBKIT_DISABLE_DMABUF_RENDERER=0`.

## v4.2.4 - Pasta compartilhada sem cópias acumuladas

### Sincronização do grupo de trabalho
- **Fim das cópias `institutional-data.<n>.tmp`:** a publicação dos dados institucionais montava uma cópia completa dos dados numa pasta temporária e, se o OneDrive travasse algum arquivo durante a troca (comum no Windows), a cópia ficava abandonada na pasta do grupo. Eram ~70 sobras (~15 GB) desde junho. Agora a troca é feita por renomeação — a versão anterior só é apagada depois que a nova está no lugar, e volta se algo falhar —, o temporário é apagado em caso de erro e cada publicação remove sobras com mais de 1 hora.
- **Fim das cópias de conflito de `workspace-state.json`:** todos os dispositivos regravavam esse arquivo legado a cada ciclo, e o OneDrive criava uma cópia de conflito (~1 MB) a cada colisão — 5.909 cópias (4,6 GB). Desde a v2.7.0 cada dispositivo publica o próprio arquivo em `state/peers/`, então o legado deixou de ser gravado (a leitura continua, por compatibilidade).
- **Syncthing:** cópias de conflito no padrão do Syncthing (`arquivo.sync-conflict-AAAAMMDD-HHMMSS-ID.json`) passam a ser reconhecidas e ignoradas, como já acontecia com as do OneDrive e do Google Drive.

## v4.2.3 - Sincronização não traz de volta turma corrompida

- Sincronização institucional: se a pasta compartilhada tiver um arquivo de turma danificado, o app agora mantém a cópia boa deste computador em vez de substituí-la. Antes, uma turma corrompida na pasta compartilhada voltava a aparecer a cada sincronização, com o erro "Arquivo de turma ilegível" no Dashboard.

## v4.2.2 - Corrige turmas sumindo por erro de arquivo corrompido

- Corrigido o erro "trailing characters at line…" que aparecia no Dashboard e escondia todas as turmas. Ele surgia quando o computador desligava ou hibernava logo depois de o app salvar uma turma: o arquivo ficava com sobras no fim. Agora cada gravação é confirmada no disco antes de ser concluída, e arquivos que já tinham essas sobras voltam a abrir normalmente.

## v4.2.1 - Detalhes ao criar tarefa e descrição mais legível no Kanban

- Quadro Kanban: ao criar uma tarefa pelo "+" da coluna, agora aparece também o campo de detalhes, logo abaixo do título. Enter no título leva aos detalhes; Ctrl+Enter ou "Adicionar" cria a tarefa. O antigo link "Detalhes", que abria o formulário completo, passou a se chamar "Mais campos" e leva junto o que já foi digitado.
- Quadro Kanban: a descrição da tarefa ficou maior e mais legível ao abrir um cartão. A caixa cresce conforme o texto, até cerca de um terço da tela, e só então passa a rolar — antes mostrava pouco mais de duas linhas. O texto também aparece na cor normal, e não mais em cinza.

## v4.2.0 - Novo Quadro Kanban e fim dos travamentos

- **Quadro Kanban — Criar e editar tarefas ficou mais rápido.** "Nova tarefa" abre um compositor enxuto: título, descrição e pastilhas só para o que a tarefa precisar. Clicar no título ou no texto de um cartão abre o mesmo compositor já preenchido. Quando a tarefa pede mais contexto, "Abrir formulário completo" mostra tudo numa tela só, sem abas — e leva junto o que você já digitou.
  - Pastilhas: Prazo, Prioridade, Responsável, Vínculos, Etiqueta e Anexo — cada uma abre um seletor no lugar.
  - Atalhos de prazo: Hoje, Amanhã, Sexta e Próxima semana, com os avisos de 2 dias, 1 dia e no dia.
  - Formulário completo sem abas: O que muda o fluxo à esquerda, o contexto (responsáveis, turmas, etiquetas, anexos) à direita.
- **Quadro Kanban — Organize o quadro do seu jeito.** Agora dá para mudar a ordem dos cartões dentro da coluna, não só entre colunas. O cartão passa a ser arrastado pelo punho de seis pontinhos à esquerda do título — clicar no resto do cartão abre a tarefa. Cada coluna pode ser ordenada por prazo ou prioridade, e cartões e colunas podem ser recolhidos.
  - Arraste pelo punho: Solte entre dois cartões para escolher a posição. Pelo menu ⋯ do cartão também há Subir e Descer.
  - Ordenar a coluna: No menu ⋯ da coluna: Manual, Prazo mais próximo ou Prioridade.
  - Compacto ou Confortável: Recolha todos os cartões de uma vez, ou só um pelo chevron. A coluna inteira também recolhe numa faixa estreita.
- **Quadro Kanban — Arquive, exclua e aja em várias tarefas de uma vez.** Tarefa arquivada sai do quadro, do calendário, da dashboard, da tela da turma e dos alertas de prazo, mas continua guardada — a coluna mostra "N tarefas arquivadas · restaurar". Excluir deixou de pedir confirmação: aparece um aviso com Desfazer por alguns segundos.
  - Selecionar: Marque vários cartões e use a barra no rodapé para mover, arquivar ou excluir todos juntos.
  - Arquivar concluídas: No menu ⋯ da coluna de conclusão, limpa a coluna numa ação só.
  - Filtros rápidos: Busca por título, etiqueta ou turma, e os filtros Minhas, Alta e Vence esta semana (que inclui as atrasadas).
- **Quadro Kanban — As colunas agora são suas.** Crie colunas em "Nova coluna", no fim do quadro, renomeie com dois cliques no nome e troque a cor pelo menu ⋯. Ao excluir uma coluna, as tarefas dela vão para a primeira, com Desfazer. Importante para quem usa a sincronização de grupo: as colunas passam a ser de cada computador e não sincronizam mais — antes, o quadro de um colega podia sobrescrever as suas colunas. As tarefas compartilhadas continuam sincronizando normalmente.
  - Coluna de conclusão: Marque no menu ⋯ qual coluna conclui as tarefas: é ela que risca o título e silencia os alertas de prazo.
  - Cada um com suas colunas: Tarefa de um colega numa coluna que você não tem aparece na sua primeira coluna, sem mudar nada no quadro dele.
- Corrigido: o programa podia travar por vários segundos, principalmente no Quadro Kanban e em dias de internet lenta. Salvar dados esperava a sincronização com a pasta do OneDrive terminar, e isso congelava a janela inteira. Agora os salvamentos rodam por trás, sem travar a tela, e continuam sendo gravados na ordem em que foram feitos.
- Corrigido: a sincronização institucional recopiava toda a pasta de dados para o OneDrive a cada 15 minutos, mesmo sem mudança nenhuma, e cada colega que recebia a cópia gerava um backup completo. Ela agora só acontece quando algum dado institucional mudou de verdade.
- Backups automáticos: o programa passa a guardar só os 10 mais recentes e apaga os mais antigos, inclusive na primeira abertura desta versão. Com as fotos dos alunos, cada backup pode passar de 500 MB, e a pasta chegava a dezenas de GB. As exportações seletivas por ciclo, feitas por você, não são apagadas.
- Limpeza automática de restos de sincronizações interrompidas: cópias temporárias da pasta de dados e cópias de conflito criadas pelo OneDrive.
- Corrigido: cópias de conflito do OneDrive na pasta compartilhada eram lidas como se fossem outro coordenador, fazendo reaparecer dispositivos antigos na lista do grupo.
- Tema escuro: as cores das colunas do Kanban ganharam versões próprias para o fundo escuro, e a barra de rolagem do quadro deixou de aparecer branca.
- Para quem usa sincronização de grupo: colegas que ainda não atualizaram veem as tarefas arquivadas como tarefas normais, até instalarem esta versão.

## v4.1.3 - Corrige contagem de elegíveis e passa a publicar na Microsoft Store

- Corrigido: o total de alunos elegíveis (painel, lista de turmas e conselho) somava também as cópias inativas de quem mudou de turma durante o ano — o aluno transferido continuava contando na turma de origem, onde a lista nem o mostra, porque inativos ficam escondidos até marcar "Mostrar inativos". O número ficava maior que o de elegíveis realmente visíveis, e cada transferência aumentava a diferença. Agora só contam alunos ativos, e a importação da lista de elegíveis também deixa de marcar as cópias inativas — se um aluno da lista não estiver ativo em turma nenhuma, ele aparece entre os não encontrados para a coordenação revisar.
- Corrigido: desmarcar um aluno como elegível na tela da turma não o tirava da listagem do PEI quando ele tinha alguma deficiência cadastrada pela importação. A marcação manual agora vale nos dois lugares.

## v4.1.2 - Corrige atendimento duplicado, marca telefone sem WhatsApp, permite excluir registro

- **Atendimentos › Contatar famílias — Marque um número como "não é WhatsApp".** Quando o envio mostra que o número da família não é WhatsApp, marque ali mesmo na fila assistida — o número some das próximas filas até alguém cadastrar um telefone novo, mas continua salvo na ficha do aluno.
  - Botão na fila: "Nº não é WhatsApp" ao lado de Enviei/Pular, na fila assistida.
  - Aparece na ficha: O número marcado fica sinalizado nos responsáveis do aluno, editável a qualquer momento.
  - Relatório de pendência: Campo "Telefone do Responsável Marcado como Inválido" no construtor — filtre com "não está vazio" pra listar quem precisa vir atualizar o número.
- Corrigido: apertar Enter na fila assistida podia registrar o mesmo atendimento duas vezes (o atalho de teclado e o clique nativo do botão focado disputavam o mesmo envio). Agora só um vale.
- Novo: "Excluir registro" no menu (⋮) de um atendimento, para apagar um registro feito por engano ou duplicado.

## v4.1.1 - Corrige fila de WhatsApp interrompida presa em "Concluída"

- Corrigido: uma fila assistida de WhatsApp interrompida sem clicar em "Pausar" (app fechado no meio, por exemplo) podia ficar marcada como "Concluída" em Atendimentos › Disparos em lote assim que tivesse ao menos um pulado — mesmo com a maioria dos destinatários ainda sem receber nada — e sem nenhum botão pra retomar. Agora aparece como "Em progresso" com "Retomar fila", igual a uma pausada de propósito.

## v4.1.0 - Fila de contato completa dados na hora, filtro de Expansões, relatório de pendência de cadastro

- **Atendimentos › Contatar famílias — Aluno sem telefone não fica mais de fora da fila.** Quem entra na fila sem telefone de responsável cadastrado aparece como pendente, com um link 'adicionar telefone' na própria linha — preenche nome e telefone sem sair da tela, e o aluno já entra como destinatário.
  - Preenchimento na linha: Nome, parentesco e telefone direto na fila, sem abrir a ficha do aluno.
  - Some da lista de 'fora': Antes ficava só num contador — agora vira destinatário assim que salva.
  - Filtro de Expansões: Nova condição 'Progresso nas Expansões (%)' — antes só dava pra filtrar por último acesso.
- **Construtor de Relatórios — Liste quem falta cadastrar responsável ou telefone.** Dois campos novos — 'Nome do Responsável' e 'Telefone do Responsável' — ficam vazios quando falta o cadastro. Combine com o operador 'está vazio' que o construtor já tem pra gerar a lista de pendências.
  - Dois campos novos: Nome e Telefone do Responsável, na categoria Aluno.
  - Sem UI nova: Usa o operador 'está vazio' que já existia no construtor.
- Corrigido: uma tarefa do Kanban vinculada a um aluno podia aparecer na aba "Tarefas" de outro aluno sem relação nenhuma com o card — o casamento por nome era fuzzy demais para textos longos.

## v4.0.3 - Corrige de vez o ícone da "Visão geral"

- Corrigido: o item 'Visão geral' das Configurações ainda podia aparecer com o ícone empilhado em cima do texto em vez de lado a lado (o ajuste da versão anterior não tinha especificidade suficiente para vencer o estilo antigo).

## v4.0.2 - Corrige alinhamento do menu de Configurações

- Corrigido: os itens do menu de Configurações (Instituição, Turmas, Backup...) podiam aparecer com o texto colado no topo da caixa em vez de centralizado, e rótulos mais longos quebravam linha.

## v4.0.1 - Ajuste da imagem de cabeçalho e do destaque "Visão geral"

- Corrigido: ao trocar a imagem de cabeçalho em Configurações › Institucional, a ATA e os relatórios podiam continuar saindo com a imagem antiga. Agora o app sempre usa a imagem enviada mais recentemente, mesmo que o arquivo anterior não tenha sido apagado na hora (lock do OneDrive ou antivírus).
- Ajuste visual: o item 'Visão geral' das Configurações, quando aberto, tinha um preenchimento vermelho forte que parecia um alerta — agora usa o mesmo destaque discreto (barra vermelha à esquerda) dos outros itens do menu.

## v4.0.0 - Tela de Atendimentos, Configurações v2 e Equipe gestora

- **Novo no menu — Uma tela só para os atendimentos da turma.** Entre 'Turmas' e 'Importar Dados' agora tem 'Atendimentos', com um contador de follow-ups pendentes. Ela reúne todos os atendimentos da turma numa lista só.
  - Filtros: Tipo, período, canal, tag e 'follow-up pendente' — combináveis.
  - Selo de canal: Cada linha mostra como o contato saiu: Manual, wa.me, wa.me · lote ou API oficial.
  - Tabela ou cartões: Alterna a visão conforme você prefere ler a lista.
- **Atendimentos — Cada caso é uma conversa, com um combinado datado.** O atendimento abre em thread: o registro inicial, os follow-ups e o 'follow-up combinado' — um compromisso com data que substituiu o antigo campo de status. É ele que marca que um caso tem pendência.
  - Thread do caso: Registro inicial e follow-ups na ordem em que aconteceram.
  - Follow-up combinado: Um compromisso datado; enquanto está aberto, o caso conta como pendente.
  - Registrar desfecho: Encerra o combinado quando o assunto se resolve.
- **Atendimentos — Montar a mensagem para a família em três passos.** O compositor separa destinatário, modelo e variáveis, com prévia em bolha de WhatsApp. Os trechos sem dado do aluno ficam destacados para preencher na hora ou remover.
  - Três passos: Destinatário, modelo e variáveis, um de cada vez.
  - Prévia real: Vê o texto final na bolha antes de enviar.
  - Aba 'Por aluno': Histórico de contato com a família de cada estudante, por mensagem e presencial.
- **Atendimentos — Contatar várias famílias de uma vez.** Em 'Contatar famílias', monte a fila por filtros prontos (com tarefa pendente, frequência baixa, sem acesso à plataforma…) ou por condições no mesmo formato do construtor de relatórios (campo · operador · valor).
  - Monte a fila: Filtros prontos ou condições combináveis.
  - Fila assistida no WhatsApp: Grátis: você aperta enviar em cada um, com atalhos de teclado, teto de 40 por sessão, pausável e retomável.
  - Envio automático: Opcional, pela API oficial da Meta.
- **Configurações › Integrações — Envio automático pela API oficial (opcional).** Se quiser que o lote saia sozinho, configure em Configurações › Integrações › 'WhatsApp'. Sem isso, tudo continua funcionando pela fila assistida.
  - Cobra por mensagem: É a API oficial da Meta, com custo por envio.
  - Só nesta máquina: A configuração não sincroniza com o grupo.
  - Histórico em 'Disparos em lote': Situação de cada fila (concluída, pausada, com pendências) e retomada das que pararam.
- **Configurações — Configurações mais fáceis de percorrer.** A tela passou a ter 4 grupos que dizem a natureza do ajuste — Institucional, Conselho, Este computador, Integrações — com uma busca no topo e uma 'Visão geral' de entrada.
  - Busca no topo: Acha tanto a seção quanto o campo — 'token', 'código do grupo'…
  - Visão geral: Avisos de manutenção (backup vencido, atualização) e o estado de cada seção.
  - Modelos de mensagem: Saíram daqui e agora se editam em Atendimentos → 'Gerenciar modelos', perto de onde são usados.
- **Configurações › Institucional — Equipe gestora: nome e gênero de quem assina.** Uma seção nova para cadastrar a direção, as vice-direções e as coordenações (quantas houver), cada uma com nome e gênero. O gênero flexiona os títulos nos documentos; quem preferir pode deixar 'não informar'.
  - Nome + gênero: 'Diretora' / 'Diretor', 'Coordenadora' / 'Coordenador' saem certos na ATA e no PEI.
  - Casa com o grupo: Quem entrou como 'Wilton' é reconhecido como 'Wilton Bortolleto · Coordenação' — automático e revisável.
  - Vale em todo lugar: Nome completo nas assinaturas do PEI, no Quadro de Gestão e nos documentos.
- 'AvD1' e 'AvD2' agora aparecem como 'Diagnóstica 1' e 'Diagnóstica 2' nas telas de conselho, na ficha do aluno e no importador.

## v3.5.1 - Boletim do aluno mostra sempre as notas já lançadas

- Corrigido: o boletim da ficha do aluno (aba Desempenho) voltava a não mostrar nenhuma nota nem frequência quando o bimestre selecionado ainda não tinha lançamento — por exemplo, ao entrar no 3º bimestre antes de importar o mapão. Agora o boletim sempre lista as disciplinas do ano e as notas já lançadas (1º, 2º…), preservando a comparação da progressão ao longo do ano. A tabela de disciplinas do Conselho e as métricas da turma passam a seguir a mesma regra: mostram o rol de disciplinas do ano mesmo antes de o bimestre atual ter notas.

## v3.5.0 - Bimestre atual global e compositor de mensagem com chips

- Bimestre atual global: um seletor único no cabeçalho (Turmas, ficha do aluno, Conselho, Relatórios) define o bimestre de todas as telas, e a escolha fica salva. O app resolve sozinho (datas de início na configuração institucional → maior bimestre já importado → 1º) até você fixar um manualmente.
- Compositor "Mensagem ao responsável": o texto e a prévia viraram um campo só, com as variáveis aparecendo como etiquetas coloridas (azul = com dado, amarelo = sem dado do aluno). As etiquetas embaixo inserem a variável na posição do cursor; apagar é como apagar um caractere.
- Importar Tarefas: a chave de bimestre é normalizada ("1"…"4"), alinhando o dado com a leitura da mensagem à família e do motor de relatórios.

## v3.4.0 - Contato com a família por WhatsApp, import de tarefas em lote e ajustes de UI

- Novo: contato com a família por WhatsApp, na aba Atendimentos do perfil do aluno. Cadastre o responsável (nome, parentesco — mãe, pai ou outro — e celular; dá pra ter um segundo responsável), escolha um modelo de mensagem e o app abre o WhatsApp com o texto pronto, já preenchido com os dados do aluno (frequência, tarefas pendentes, progresso na plataforma de expansão, etc.). Cada mensagem enviada fica registrada como um atendimento do aluno, com as tags do modelo.
- Novo: modelos de mensagem à família, editáveis em Configurações › Institucional › 'Mensagens à família'. Crie um modelo por situação (excesso de faltas, tarefas em atraso, convocação…) usando variáveis entre chaves — {aluno}, {frequencia}, {tarefas_pendentes}, {expansao_dias_sem_acesso}… — que são trocadas pelos dados reais do estudante na hora de enviar. Já vem com exemplos prontos.
- Importar Tarefas: agora aceita várias planilhas de uma vez (ou ir adicionando uma a uma, com a lista à vista). O app junta todas antes de cruzar os alunos pelo nome, então dá pra importar todas as turmas num passo só.
- As tags do formulário de atendimento viraram um campo de 'chips': digite e tecle vírgula ou Enter para criar a tag, e o campo sugere as tags já usadas neste aluno e as definidas nos modelos de mensagem.
- Quadro Kanban: no campo 'Responsável' de uma tarefa, digite '@' para escolher um coordenador do grupo de trabalho; também dá pra adicionar um nome que não esteja no grupo.
- O importador do Diagnóstico SARESP lê o novo relatório 'Aprendizagem Equivalente' das Devolutivas Pedagógicas, com as duas aplicações do ano (Diagnóstica 1 e Diagnóstica 2) e a evolução por componente. As telas de conselho passam a mostrar o resultado mais recente e um selo de evolução (Avançou / Manteve / Regrediu).
- Disciplinas lançadas com grafias diferentes que são a mesma matéria (ex.: 'Língua Inglesa' e 'LINGUA INGLESA', vindas de mapões diferentes) passam a ser tratadas como uma só na tela do conselho — antes a versão de expansão aparecia como disciplina separada, sem plano nem PEI. Também há uma correção para isso em Configurações › Manutenção de dados.
- Repositório de relatórios ganhou botão 'Atualizar' e passa a buscar sempre a versão mais recente da lista publicada no GitHub, sem cache preso.

## v3.3.0 - Assinaturas nomeadas no PEI e correção do login persistente (GitHub/Google)

- Novo: 'Assinaturas', na tela de PEI — define por turma quem assina cada PEI (coordenador de gestão pedagógica, professor especializado, direção), e o nome já sai impresso acima da linha de assinatura no documento. O professor regente vem automático de quem respondeu o PEI; o responsável pelo estudante é preenchido na ficha do aluno e fica em branco se não cadastrado. Digite '@nome' num campo para puxar alguém do grupo de trabalho.
- Novo: ao exportar o PEI de um aluno em PDF, as assinaturas de todos os componentes passam para uma folha única no final — uma folha por aluno para assinar e digitalizar, em vez de um bloco repetido a cada disciplina.
- Novo: botão 'Regerar todos' na tela de PEI, para reescrever os PEIs já gerados com os nomes de assinatura atuais.
- Corrigido: 'Publicar no repositório' recusava o envio com erro de autenticação mesmo depois de fazer login com o GitHub, e pedia login a cada uso — a sessão nunca era realmente guardada no chaveiro do sistema. O mesmo afetava a autorização do Google (Planejamento/PEI). Agora a sessão fica salva de verdade entre usos.

## v3.2.2 - Corrige falso "faça login de novo" ao publicar com rede instável

- Corrigido: mesmo já logado, 'Publicar no repositório' podia recusar o envio pedindo login de novo — uma rede lenta ou instável na hora de confirmar a conta (comum em rede de escola) era tratada como sessão inválida. Agora tenta de novo automaticamente antes de desistir, e o aviso de erro (quando acontece) deixa claro que é a rede, não a sessão salva.

## v3.2.1 - Corrige fechamento do construtor ao publicar no repositório

- Corrigido: no 'Publicar no repositório' (novo na 3.2.0), confirmar o envio fechava o construtor de relatórios no meio do processo, antes da publicação terminar — o relatório não chegava a subir pro GitHub, e nenhum erro aparecia. O construtor agora fica aberto até o fim do envio, mostrando confirmação ou erro.

## v3.2.0 - Título/cor/tamanho no construtor, espacador configurável e publicação no GitHub

- Novo: 'Publicar no repositório', no construtor de relatórios — envia um relatório seu direto pro repositório público do GitHub sem precisar sair do app. Se for você, atualiza direto o relatório oficial; se for outro coordenador, abre um Pull Request pedindo entrada em 'comunidade', que só vale depois de revisado e aceito.
- Novo: o nome do relatório virou um bloco próprio ('Título do relatório'), separado do 'Cabeçalho institucional' — permite colocar um Espaçador entre a imagem da escola e o título, e agora dá pra escolher o tamanho e a cor do título (algumas opções prontas ou qualquer código de cor).
- Novo: nos blocos de texto do construtor, o tamanho da fonte do título e do corpo passa a ser editável (antes era fixo). O bloco 'Título e texto' foi renomeado só para 'Texto'.
- Novo: o bloco 'Espaçador' deixa escolher quantas linhas em branco ele gera, em vez de sempre duas.
- Novo: toda tabela de alunos nova já vem com as colunas 'Nº de Chamada' e 'Nome do Aluno' prontas, pra identificar o aluno de cara e mostrar que dá pra adicionar mais colunas ali.
- O dropdown de campos do construtor só mostra 'Expansão' e 'Prova Paulista' quando a escola realmente tem esse tipo de dado importado — menos opções irrelevantes poluindo a lista.
- Corrigido: 'Coordenação Pedagógica · Nº bimestre' ficava embutido no corpo do documento Word, colado no título — agora vira um rodapé que repete em toda página, e o espaçador finalmente separa a imagem institucional do título como esperado.
- Corrigido: parâmetros desvinculados de um filtro (ou de 'quantidade de linhas editável') continuavam aparecendo na tela de gerar relatório mesmo sem afetar nada — e o botão 'usar parâmetro' num filtro podia acabar vinculando ao parâmetro errado sem avisar. As duas coisas causavam relatórios que pareciam configurados mas geravam valores sem sentido.

## v3.1.1 - Correções e refinamentos no construtor de relatorios e diagnostico de turmas

- Importador de Disciplinas de Expansão (período noturno) — carregue a planilha de progresso da plataforma online e o app guarda um histórico datado por aluno, não só o valor mais recente. O motor de relatórios ganha campos novos (progresso e nota atuais, quanto o aluno evoluiu desde a última importação e no bimestre, dias sem acessar a plataforma) pra você montar seus próprios relatórios de acompanhamento — quem mais evoluiu, quem está parado, quem precisa de atenção — sem esperar uma atualização do programa.
- 'Exportar PEI (PDF)', na tela de PEI — junta todos os documentos de um aluno (todas as disciplinas e bimestres) num único PDF com o nome dele, em vez de vários .docx separados na pasta.
- Novo bloco 'Espaçador' no construtor de relatórios: acrescenta duas linhas em branco entre itens do documento (ex.: entre o cabeçalho e o título).
- Nova seção 'Manutenção de dados', em Configurações: encontra e corrige disciplinas gravadas com grafias diferentes que são a mesma matéria (ex.: 'Orientação de Estudo - Matemática' e 'Orientação de Estudo Matemática') — sem essa correção, as notas ficavam divididas entre duas linhas em vez de uma só. Mostra a lista antes de corrigir; a correção mantém sempre a nota mais recente.
- Correções e refinamentos: a Dashboard passa a avisar quando um aluno aparece ativo em duas turmas ao mesmo tempo (com opção de 'Dispensar' o aviso, que ainda assim continua sendo verificado por trás — se resolver sozinho depois, você é avisado); o bloco 'Parâmetros' do construtor de relatórios foi reorganizado pra mostrar direto onde cada parâmetro pode ser aplicado (filtro ou quantidade de linhas), permitindo criar e vincular tudo num clique só, sem precisar visitar filtros/colunas separadamente; no construtor, a seção 'Colunas' passa a vir antes de 'Condições' (mais lógico montar a planilha antes de filtrar) e o nome da coluna é preenchido automaticamente a partir do campo escolhido, podendo ser editado à mão.

## v3.1.0 - Importador de Expansões, PEI em PDF e manutenção de dados

- Novo: importador de Disciplinas de Expansão (período noturno) — carregue a planilha de progresso da plataforma online e o app guarda um histórico datado por aluno, não só o valor mais recente. O motor de relatórios ganha campos novos (progresso e nota atuais, quanto o aluno evoluiu desde a última importação e no bimestre, dias sem acessar a plataforma) pra você montar seus próprios relatórios de acompanhamento — quem mais evoluiu, quem está parado, quem precisa de atenção — sem esperar uma atualização do programa.
- Novo: 'Exportar PEI (PDF)', na tela de PEI — junta todos os documentos de um aluno (todas as disciplinas e bimestres) num único PDF com o nome dele, em vez de vários .docx separados na pasta.
- Novo bloco 'Espaçador' no construtor de relatórios: acrescenta duas linhas em branco entre itens do documento (ex.: entre o cabeçalho e o título).
- Nova seção 'Manutenção de dados', em Configurações: encontra e corrige disciplinas gravadas com grafias diferentes que são a mesma matéria (ex.: 'Orientação de Estudo - Matemática' e 'Orientação de Estudo Matemática') — sem essa correção, as notas ficavam divididas entre duas linhas em vez de uma só. Mostra a lista antes de corrigir; a correção mantém sempre a nota mais recente.
- Corrigido: no construtor de relatórios, 'Gerar agora' podia salvar um relatório com uma tabela sem nenhuma coluna configurada, mesmo o botão 'Salvar' recusando isso pelo mesmo motivo — agora as duas ações usam a mesma checagem.
- Corrigido: em algumas distribuições Linux (ex.: Fedora), gerar relatórios em PDF falhava mesmo com a fonte certa instalada, porque o app só procurava fontes nos caminhos do Ubuntu/Debian.

## v3.0.1 - Corrige perda de atendimentos na sincronização, duplicação de pessoas no grupo de trabalho e adiciona limite de linhas configurável no construtor

- Novo: 'Criar relatório', na Central de Relatórios, ganhou um construtor visual em blocos — monte relatórios do zero escolhendo campos, filtros, ordenação, textos e o cabeçalho institucional, na ordem que quiser, sem precisar de uma atualização do programa. Um tutorial explica o construtor e o repositório no primeiro acesso à tela.
- Novo: 'Repositório de relatórios' reúne modelos prontos pra baixar — os oficiais (Tarefas Realizadas, Prova Paulista e Educação Física, que deixaram de vir instalados por padrão) e os enviados pela comunidade de coordenadores. Cada relatório mostra quem montou.
- O relatório 'Top 60' virou 'Top Alunos' e a quantidade de alunos listados por período passa a ser escolhida na hora de gerar, em vez de fixa em 60.
- A imagem de cabeçalho institucional (configurada em Configurações › Instituição) agora também aparece nos relatórios exportados em Excel e PDF — já aparecia no Word.
- Corrigido: depois de reformatar o computador e reinstalar o app, reentrar no grupo de trabalho com o mesmo nome não bastava pra recuperar a configuração automática de Planejamento/PEI feita antes da formatação — agora aparece um botão 'Essa configuração é minha' pra reivindicar a configuração de um perfil antigo com o mesmo nome de exibição.

## v3.0.0 - Cabeçalho institucional em Excel/PDF, autoria no repositório, tutorial e reivindicação de config após reinstalação

- Novo: 'Criar relatório', na Central de Relatórios, ganhou um construtor visual em blocos — monte relatórios do zero escolhendo campos, filtros, ordenação, textos e o cabeçalho institucional, na ordem que quiser, sem precisar de uma atualização do programa. Um tutorial explica o construtor e o repositório no primeiro acesso à tela.
- Novo: 'Repositório de relatórios' reúne modelos prontos pra baixar — os oficiais (Tarefas Realizadas, Prova Paulista e Educação Física, que deixaram de vir instalados por padrão) e os enviados pela comunidade de coordenadores. Cada relatório mostra quem montou.
- O relatório 'Top 60' virou 'Top Alunos' e a quantidade de alunos listados por período passa a ser escolhida na hora de gerar, em vez de fixa em 60.
- A imagem de cabeçalho institucional (configurada em Configurações › Instituição) agora também aparece nos relatórios exportados em Excel e PDF — já aparecia no Word.
- Corrigido: depois de reformatar o computador e reinstalar o app, reentrar no grupo de trabalho com o mesmo nome não bastava pra recuperar a configuração automática de Planejamento/PEI feita antes da formatação — agora aparece um botão 'Essa configuração é minha' pra reivindicar a configuração de um perfil antigo com o mesmo nome de exibição.

## v2.24.1 - Corrige turmas duplicadas na sincronização

- Corrigido: turmas podiam aparecer duplicadas na lista depois de sincronizar com um dispositivo em versão mais antiga do app — o merge casava as turmas pelo nome do arquivo, e um código gravado sem formatação (ex.: '2a SERIE A') virava um arquivo com nome diferente do já formatado ('2ª Série A'), então as duas nunca se uniam. A sincronização agora reconhece que são a mesma turma comparando o código sem acento/maiúsculas, une os dados dos dois lados e mantém só um registro.

## v2.24.0 - Relatório Top 60 por Período e aviso de erro na sincronização automatica

- Relatorio Top 60 por Periodo e aviso de erro na sincronizacao automatica.

## v2.23.1 - Corrige relatório de Educação Física listando turma inteira

- Corrigido: o relatório 'Educação Física — Ensino Médio' (novo na 2.23.0) listava a turma inteira em vez de só quem faz a disciplina — a carga horária de EF é um número por turma (mesmo valor pra sala toda), então bastava 1 aluno real de EF ter sido casado naquela sala pra todo mundo dela entrar no relatório com frequência 100% inventada. Agora só entra quem tem falta de EF lançada individualmente.

## v2.23.0 - Relatório de Educação Física e correção de frequência no sync

- Novo relatório 'Educação Física — Ensino Médio' na Central de Relatórios: exporta em planilha (.csv) nome, turma e frequência dos alunos do EM que têm Educação Física lançada — a disciplina chega por um mapão separado e nem todo aluno a faz, então só entram os alunos com carga horária de EF de fato lançada.
- Corrigido: reimportar o mapão de um bimestre anterior depois de já ter importado um mais recente podia fazer a frequência exibida na ficha do aluno regredir — o app agora só atualiza esse número quando o mapão importado é do bimestre igual ou mais recente que o já registrado.
- Corrigido: sincronizar entre dois dispositivos que tinham importado mapões de bimestres diferentes podia apagar as faltas por disciplina de um dos lados, distorcendo o total de faltas do ano — a sincronização agora combina os bimestres de cada lado em vez de substituir um pelo outro.

## v2.22.3 - Corrige tela de novidades travada em monitores menores

- Corrigido: a tela de novidades ('o que há de novidade') podia ficar travada em monitores menores, sem espaço para rolar até o botão 'Entendi' nem forma de fechar — agora ela sempre cabe na tela (com rolagem interna quando o texto é longo), e também fecha com Esc ou clicando fora.

## v2.22.2 - Corrige exclusão de disciplinas de expansão no Planejamento/PEI e índice do PEI

- Corrigido: a correção da versão anterior para disciplinas que aparecem tanto no mapão normal quanto no de expansão com grafias diferentes (ex.: 'Língua Inglesa' no normal e 'LINGUA INGLESA' no de expansão) não funcionava de fato — a comparação usava o texto exato e não reconhecia as duas grafias como a mesma disciplina, deixando a versão de expansão aparecer como se fosse uma disciplina própria, sem plano nem PEI. Agora a comparação ignora acento e caixa.
- Ajustado: só 'Projeto de Vida' deixou de exigir Plano de Ensino e PEI (é um componente de tutoria sem professor de componente dedicado). Redação e Leitura e Orientação de Estudo continuam exigindo os dois documentos normalmente — a versão anterior desta correção tinha excluído essas duas por engano.
- O PEI passa a esconder as disciplinas de mapão de expansão da cobrança de documento, do mesmo jeito que o Planejamento já fazia — antes só o Planejamento respeitava essa marcação.
- Corrigido: PEIs já entregues por um Forms antigo (antes da migração para o Web App automático) ou gerados com uma versão anterior do app (antes da correção de acentos no nome do arquivo) ficavam invisíveis na tela de acompanhamento e no relatório de pendências, mesmo com o documento salvo na pasta do aluno. A tela agora reconcilia com os documentos já existentes na pasta de cada aluno elegível.
- Planejamento: nomes de disciplina na matriz passam a ter caixa consistente (Título Case), mesmo quando vêm de um mapão que grava o nome todo em maiúsculas (comum em componentes de expansão/itinerário).

## v2.22.1 - Corrige build Linux quebrado no 2.22.0 (import de env fora do cfg certo)

- Corrigido: disciplinas de mapões de 'Tipo de Ensino: Expansão' (turmas não seriadas de itinerário/aprofundamento) apareciam na tela de Planejamento como se precisassem de Plano de Ensino, mesmo sem nenhum professor responsável por planejá-las. As notas continuam entrando normalmente nos alunos/conselho — só a cobrança de plano não se aplica mais a essas disciplinas. Quando a mesma disciplina existe nos dois mapões (ex.: Língua Inglesa no mapão normal e no de expansão), ela continua contando como disciplina normal.
- Corrigido: a mesma disciplina podia aparecer duas vezes na lista de Planejamento (ex.: 'Orientação de Estudo em Matemática' e 'ORIENTACAO DE ESTUDO - MATEMATICA') quando o mapão do SED e o Web App usavam redações diferentes — hífen, a palavra 'em' ou um sufixo de série coladas ao nome. Essas variações passam a ser reconhecidas como a mesma disciplina.
- Corrigido: trocar o coordenador responsável por uma turma podia sobrescrever o texto da ata e o tempo de reunião do conselho pelos dados do 1º bimestre, mesmo estando em outro bimestre no momento.
- Corrigido: criar uma tarefa a partir de um evento do calendário não atualizava o Dashboard nem o Quadro de Gestão até recarregar o app.
- Corrigido: salvar educação especial ou atendimento de um aluno sem matrícula cadastrada falhava em silêncio, sem avisar o coordenador.
- Corrigido: a lista de eventos do calendário disponíveis para vincular a uma tarefa no Kanban podia ficar desatualizada depois de uma sincronização de grupo.

## v2.21.6 - Corrige sync do Web App de Planejamento/PEI; acompanhamento agora vem dos arquivos locais

- Corrigido: a sincronização (de grupo ou institucional) podia apagar da configuração de Planejamento/PEI o vínculo com a planilha e o projeto Apps Script já criados, mesmo em quem originalmente configurou — o sintoma era erro 'Acesso negado' ao ler respostas e, ao clicar em 'Atualizar turmas/republicar' nesse estado, uma planilha nova e vazia em vez de reaproveitar a existente.
- Corrigido: uma resposta sem turma selecionada gerava um documento de planejamento numa pasta fantasma (só o nome do ano, sem a letra da turma) misturada às pastas das turmas reais — agora aparece marcada como 'SEM TURMA' para ficar claro que é uma resposta a corrigir na planilha.
- Nomes de arquivo gerados (planejamento e PEI) não trocam mais cada letra acentuada por '_' (ex.: 'Educação Física' virava 'Educa__o F_sica') — os acentos são convertidos para a letra correspondente, o que também evita gerar arquivos diferentes para o mesmo texto digitado de formas diferentes.
- As telas de Planejamento e PEI passam a mostrar o status (turmas coloridas, quantidade gerada, 'Abrir pasta') a partir dos documentos já salvos no computador, não só da última busca na planilha — um erro pontual de leitura não faz mais turmas com documento já gerado aparecerem como se nada tivesse sido entregue. Recarregar também deixa de reescrever documentos cujo conteúdo não mudou.

## v2.21.5 - Corrige race no botão de sincronizar do grupo de trabalho

- Corrigido: o botão 'Sincronizar do grupo de trabalho' (Configurações → Perfil & Sincronização) podia trazer o estado de outro coordenador em vez do mais recente de cada um — ele lia um arquivo único compartilhado, sobrescrito por qualquer publicação de qualquer pessoa do grupo, em vez do arquivo próprio de cada coordenador (que é o que o ciclo automático de sincronização já usava corretamente). Isso podia fazer a config de Planejamento/PEI de um coordenador nunca chegar aos demais, de forma intermitente.

## v2.21.4 - Web App de Planejamento/PEI compartilhado sem OAuth extra

- Planejamento e PEI: quando um coordenador do grupo de trabalho já configurou o Web App automático, os demais deixam de precisar clicar em 'Criar automaticamente' — a config (link e token de leitura) chega sozinha pela sincronização de grupo já existente (Kanban/Calendário), e a tela mostra só o nome (e foto, se houver) de quem configurou, com um botão 'Carregar agora'.
- Se mesmo assim alguém clicar em 'Criar automaticamente' tendo uma configuração de grupo já ativa, o app avisa que isso cria uma configuração paralela e substitui a atual nesta máquina, antes de prosseguir — o objetivo é manter só uma configuração ativa por escola.

## v2.21.3 - Corrige falso "crítico" no status do PEI e avisos de troubleshooting

- Corrigido: a bolinha de status do PEI podia acusar 'crítico' (vermelho) mesmo com vários PEIs recebidos, quando a carga horária do 3º/4º bimestre ainda não tinha sido importada para o aluno — agora, sem esse dado, ela cai num indicador simples (recebeu algo ou não) em vez de um falso vermelho.
- Telas de Planejamento e PEI ganham avisos na aba Automático: o que fazer se o Google mostrar 'Acesso bloqueado'/'app não verificado' ao autorizar (link direto pro tutorial de client próprio), e o que fazer se o link parar de abrir para outras pessoas depois de republicar (falha conhecida da API do Google ao atualizar implantações — resolvida resalvando a implantação pelo editor do Apps Script).

## v2.21.2 - Hotfix de teste e "o que há de novo" (2.21.0/2.21.1 não foram a publico)

- Planejamento e PEI ganham um Web App próprio, criado e republicado automaticamente pelo CoordenacaoOP (autorização única com sua conta Google) — sem precisar mais colar script no Apps Script nem compartilhar planilha manualmente. O caminho manual antigo (script/Forms) continua disponível como alternativa, na aba 'Manual' de cada tela.
- No Web App do PEI, o professor escolhe a própria turma e só vê os alunos elegíveis dela — turmas sem nenhum aluno elegível nem aparecem na lista — e o componente curricular já vem filtrado pelas disciplinas reais daquele aluno.
- Os dois Web Apps têm impressão/PDF sem precisar de nenhuma autorização extra, cópia por e-mail opcional para o professor e um botão para enviar outro planejamento/PEI sem recarregar a página.
- PEI e Planejamento viram itens próprios do menu lateral, em vez de cards dentro de Relatórios.
- Os prazos de entrega por semestre (1º/2º bimestre e 3º/4º) saem do Planejamento e passam a ser configuração da instituição, ajustável em Configurações → Instituição ou no assistente inicial — os valores já configurados são migrados automaticamente. O indicador de status do PEI passa a seguir esses mesmos prazos, em vez de depender de médias já importadas.
- Quem não conseguir usar 'Criar automaticamente' por causa do limite de usuários de teste do Google pode agora configurar seu próprio client OAuth, sem precisar recompilar o app — veja o tutorial 'Configurar_Client_OAuth_Proprio.md' no repositório.

## v2.21.1 - Client OAuth próprio (config sem recompilar) e tutorial

- Client OAuth proprio (config sem recompilar) e tutorial.

## v2.20.1 - Quickfix no relatório de Elegíveis a Recuperação

- Quickfix no relatorio de Elegiveis a Recuperacao.

## v2.20.0 - Elegíveis a recuperação, responsável múltiplo e reorganização de Configurações

- Novo relatório 'Elegíveis à Prova de Recuperação': lista, por turma, os alunos com um percentual configurável de notas vermelhas (50% por padrão, ajustável na própria tela) somando todos os bimestres, e aponta qual nota o professor deve substituir após a recuperação — 1º ou 2º bimestre, e 3º ou 4º, separados por página e por disciplina para facilitar a entrega a cada professor.
- Tela de Configurações reorganizada: a navegação passa a ter 2 níveis fixos (Institucional, Conselho, Perfil & Sincronização, Sistema) em vez de uma lista com 7 itens soltos. As 4 seções do Conselho (Perfil da turma, Aluno destaque, Encaminhamentos, Notas na ATA) e 'Perfil e sincronização' viram destinos diretos, sem precisar abrir um acordeão dentro de outro.
- Quadro Kanban: o campo Responsável passa a aceitar mais de um coordenador do grupo de trabalho (ou o próprio nome, quando não há grupo configurado), com o mesmo seletor usado em Vínculos.
- Corrigidos casos de texto ilegível no tema escuro: nota editável nas tabelas, seletor de arquivo do Kanban, opções de documento do conselho, botão de cancelar ao criar turma, cronômetro do modo reunião e popover de histórico de notas.

## v2.19.0 - Parecer do Conselho por bimestre e impressão de notas

- O campo 'Parecer do Conselho' na ficha do aluno agora mostra os encaminhamentos já marcados no Conselho, organizados por bimestre (1º ao 4º) — sem precisar trocar de tela para consultar o que foi combinado em cada bimestre.
- Novo botão 'Imprimir notas e parecer' na ficha do aluno: gera uma impressão com a tabela de notas por disciplina e o parecer por bimestre, pronta para entregar ou arquivar.
- Corrigido: os assistentes de configuração (Conselho, Turmas, Setup inicial) podiam ficar com os botões de navegação fora da tela quando havia muitos itens cadastrados, sem forma de rolar, salvar ou fechar. Agora rolam normalmente.

## v2.18.0 - Configuração de conselho, encaminhamentos e assistente inicial

- Novo assistente de configuração inicial: além da sincronização, agora também cadastra os dados da instituição e permite criar a primeira turma sem sair do assistente.
- Turmas e Conselho ganham assistentes de configuração próprios (líder de sala, elegível, perfil da turma, aluno destaque, encaminhamentos), acessíveis a qualquer momento — não só no primeiro acesso.
- Encaminhamentos do conselho (a lista de 'outras observações e encaminhamentos' da ATA) deixam de ser fixos: a coordenação pode adicionar, editar, reordenar e remover opções em Configurações. Cada opção tem um número fixo, preservado mesmo ao editar a lista, para não invalidar marcações já feitas em outras turmas.
- Tela 'Configuração de Conselho' reorganizada em acordeão — Perfil da Turma, Aluno destaque, Encaminhamentos e Notas na ATA começam fechados, com um resumo de uma linha, reduzindo a rolagem.
- Scripts de planejamento (Anos Finais e Ensino Médio) passam a montar o Forms em etapas, com continuação automática a cada minuto, evitando o timeout do Apps Script em formulários grandes.

## v2.17.0 - Prazos de entrega do planejamento por semestre

- Planejamento dos Professores: cada segmento (Anos Finais e Ensino Médio) agora usa uma única planilha de respostas cobrindo o ano letivo inteiro (1º ao 4º bimestre), em vez de uma planilha por semestre — configuração mais simples do Forms.
- Novos prazos de entrega por semestre na tela de Planejamento: defina a data de corte do 1º e do 2º semestre e a bolinha de cada turma passa a indicar entrega completa (verde), parcial (amarelo) ou nenhuma (vermelho), comparando com as disciplinas do mapão.
- Corrigida a leitura da planilha do Forms quando Turma, Componente, Série/Ano ou Bimestre aparecem em colunas repetidas (um ramo do formulário por resposta anterior) — o app agora usa sempre a primeira coluna preenchida.
- Renomeado 'Fundamental' para 'Anos Finais' no script e na tela de Planejamento, alinhado à nomenclatura oficial.

## v2.16.1 - Hotfix de atualização das telas

- Hotfix de atualizacao das telas.

## v2.16.0 - Pendrive do conselho e status por bimestre

- Novo 'Pendrive do conselho': prepare um pendrive com as turmas do conselho — o app copia a si mesmo e os dados necessários (notas, fotos e configurações). Faça o conselho em qualquer computador e reintegre tudo na volta.
- Reintegração com um clique: ao abrir o app com o pendrive plugado, ele detecta o conselho feito e oferece a reintegração, criando um backup de segurança antes de mesclar.
- A tela de conselhos mostra o andamento por bimestre em cada turma: selo verde com a data quando o conselho foi finalizado e selo vermelho quando a turma está em conselho externo.
- Tutorial de primeiro acesso na tela de conselhos, apresentando os selos de status e o fluxo do pendrive.
- Corrigido: o status de 'conselho finalizado' considerava apenas o 1º bimestre — agora vale para todos os bimestres.
- Corrigido: conselhos finalizados em outra máquina (sincronização ou pendrive) não se perdem mais na mesclagem — a finalização mais recente vence e o texto da ata acompanha.
- Desempenho: sincronização, importações, backups e geração de documentos deixaram de travar a interface.
- Quadro Kanban, calendário e caches de PEI/planejamento ganharam cópia de segurança em disco, restaurada automaticamente se o navegador interno perder os dados.

## v2.15.4 - Fix de turmas duplicadas no sync e clareza na importação

- Corrigida a duplicação de turmas na sincronização: cópias de conflito criadas pelo OneDrive (ex.: 'turma_X-NomePC') agora são ignoradas e removidas automaticamente — as turmas não aparecem mais duplicadas ou triplicadas após sincronizar.
- Criação de turmas (individual e em lote) passa a bloquear duplicatas com grafia diferente do mesmo nome — ex.: '3ª SERIE A' não cria mais uma cópia de '3ª Série A'.
- Importação de notas mais clara: o contador 'Duplicados' virou 'Ambíguos' (alunos cujo nome casa com mais de um estudante, deixados de fora por segurança) e a prévia agora informa quantos alunos serão importados e atualizados.

## v2.15.3 - Ajustes e correções

- Conselho de classe: o Perfil da Turma passa a respeitar a configuração principal e só aparece quando estiver ativado.
- Perfil da Turma e Aluno Destaque agora vêm desativados por padrão nas configurações.
- Atendimentos do aluno já ficam disponíveis com os tipos padrão do app, mesmo antes de o coordenador salvar as configurações.
- Tema escuro refinado nas telas de Perfil da Turma e Atendimentos, com melhor leitura de tabelas, cards e linha do tempo.
- Modal de registro de atendimento ajustado para manter o botão de salvar acessível também na versão instalada.

## v2.15.2 - Relatório de tarefas com abas por turma e seletor

- Relatorio de Tarefas agora exporta planilha Excel (.xlsx) com uma aba por turma — sem misturar turmas diferentes na mesma tabela.
- Seletor de turmas: escolha quais turmas incluir no relatorio com checkboxes individuais e botoes 'Todas' / 'Nenhuma'.
- Turmas ordenadas por codigo na planilha e no seletor.

## v2.15.1 - Resolução de ambíguos por contexto e fix do atualizador

- Resolucao automatica de alunos ambiguos por contexto: quando um mesmo nome existe em mais de uma turma, o app identifica a turma correta contando quantos outros colegas do mesmo arquivo ja foram casados com cada candidata — sem necessidade de intervencao manual na maioria dos casos.
- Previas de importacao mostram badge 'inferido' (laranja) para alunos resolvidos por contexto, com explicacao do criterio.
- Corrigida sincronizacao da versao no binario instalado — o atualizador automatico nao exibe mais falso positivo apos a instalacao.

## v2.15.0 - Importador e relatório da Prova Paulista e Tarefas

- Importador de Tarefas Realizadas: carregue o CSV da SED com o andamento das tarefas dos alunos e registre feitas, total e percentual por bimestre.
- Relatorio de Tarefas: exporte uma planilha (.csv) com Turma, Numero, Nome, Feitas, Total e Nota (0–10) de todos os alunos ativos por bimestre.
- Importador da Prova Paulista: carregue a planilha XLSX de resultados e registre automaticamente as notas por disciplina e bimestre — deteccao automatica das disciplinas disponiveis (varia por serie).
- Relatorio da Prova Paulista: exporte planilha (.csv) com colunas dinamicas por disciplina — so aparecem as disciplinas com dados importados para aquele bimestre.
- Dados da Prova Paulista gravados individualmente em cada aluno, prontos para uso em outras funcoes.

## v2.14.1 - Corrige boletim e importação de backup

- Corrige boletim e importação de backup.

## v2.14.0 - Busca global completa e dashboard redesenhado

- Busca global completa e dashboard redesenhado.

## v2.13.2 - Sincronização de versão no binário

- Correcao interna: versao do aplicativo agora e gravada corretamente no binario — o atualizador automatico passa a funcionar de forma confiavel.

## v2.13.1 - Corrige importador com RA duplicado

- Corrigido: ao importar um CSV em que o mesmo aluno aparece mais de uma vez (ex.: 'Ativo' + 'TROCA ALUNO ENTRE CLASSES'), o app agora mantém a entrada ativa — sem necessidade de recriar a turma, basta reimportar o CSV.

## v2.13.0 - Animações de tema e indicador de sincronização

- Indicador de sincronizacao animado no rodape da barra lateral: ponto verde pulsante com o tempo da ultima sincronizacao ('agora mesmo', 'ha 1 min' etc.), atualizado a cada 30 segundos.
- Colunas do Quadro Kanban animam a entrada ao abrir o quadro, aparecendo em cascata com atraso escalonado.
- Cards de prioridade Alta pulsam suavemente em vermelho para destacar urgencia — a animacao e suprimida durante o arrasto.
- Tema escuro: animacao de pulso usa cor e intensidade adaptadas para o tema escuro.

## v2.12.0 - Corrige KanbanAnexoResultado: adiciona Deserialize e Clone

- Nova aba 'Atendimentos' no perfil do aluno: registre atendimentos com tipo, data e descricao, adicione seguimentos (follow-ups) e anexe documentos.
- Linha do tempo de seguimentos por atendimento para acompanhar o historico de cada caso.
- Novo Relatorio de Atendimentos na Central de Relatorios: metricas agregadas por tipo, turma e periodo.
- Tipos de atendimento configurados em Configuracoes — padrao inclui Disciplinar, Duvidas, Pedagogico, Financeiro e Educacao Especial; personalizaveis.

## v2.11.1 - Corrige importação de turmas de anos iniciais

- Corrige importação de turmas de anos iniciais.

## v2.11.0 - Busca global e redesign visual

### Busca global (nova função)
- **Ctrl+K** (ou ⌘K no Mac) abre o modal de busca unificada em qualquer tela do app.
- **Turmas:** busca por código, série ou período; exibe alunos ativos e elegíveis.
- **Ações rápidas:** "Ir para Conselho de Classe", "Importar Mapão" e "Criar Tarefa no Kanban" — a ação de conselho é contextualizada pela primeira turma encontrada.
- **Alunos:** ativo com ≥ 2 caracteres; varre os nomes de todas as turmas; clicar abre o detalhe da turma do aluno.
- Navegação inteiramente por teclado: ↑↓ movem o cursor, Enter seleciona, ESC fecha. Clique fora também fecha.
- Funciona em ambos os temas (claro e escuro).

### Redesign visual
- **Painel de turma — cards de métrica:** ícone colorido por contexto (vermelho, verde, azul e roxo) em caixa de tom suave; fundo sutil e borda fina separando do card; período exibido como subtítulo discreto em vez de badge.
- **Painel de turma — abas:** estilo pílula com fundo suave, aba ativa em branco com leve sombra. Mesmo padrão aplicado ao perfil do aluno.
- **Quadro Kanban:** cards exibem borda colorida à esquerda por prioridade — vermelho (`#f04438`) para alta, âmbar (`#eba400`) para média e verde (`#13c65c`) para baixa.
- **Menu lateral:** submenu "Quadro de Gestão" passa a usar guia de recuo (borda esquerda fina) em vez de bloco com borda, ficando mais sutil em ambos os temas.
- **Badges Elegível / Líder:** "Sim" em verde, "Não" em cinza; Líder e Vice em azul — cores corrigidas para refletir a semântica visual do redesign.
- **Coordenador da turma:** nome exibido em vermelho da marca (`#e8202a`) nos temas claro e escuro.
- **Tema escuro:** todas as melhorias acima refletidas na paleta dark — ícones de métrica, abas, badges e bordas Kanban com cores ajustadas para contraste sobre fundos escuros.

## v2.10.6 - Hardening de segurança

- **Validação de URL:** `abrir_url` agora rejeita esquemas além de `http`, `https` e `mailto`, impedindo execução de protocolos arbitrários.
- **Proteção contra path traversal:** todos os comandos que recebem caminhos de arquivo do front-end passam por validação — o app rejeita qualquer caminho que saia dos diretórios autorizados (`dados/` e o diretório de dados do Tauri).
- **Parsing de versão tolerante:** o verificador de atualizações passa a comparar versões com sufixos de pré-lançamento (ex.: `2.10.6-beta`) sem travar.

## v2.10.5 - Pendência de lançamento, diagnóstico no conselho e ajustes

- **Novo relatório "Pendência de Lançamento de Notas"** na Central de Relatórios: lista, por turma, as disciplinas com notas ainda não lançadas no mapão — indicando "(todos)" quando nenhum aluno teve nota lançada ou "(N de T)" quando faltam apenas alguns. Considera apenas alunos ativos e os bimestres da carga horária.
- **Tela de conselho:** o diagnóstico SARESP (nível e ano equivalente de aprendizagem) passa a aparecer nas linhas de Matemática e Língua Portuguesa, como já acontece na tela do aluno.
- **Diagnóstico:** corrigida a classificação por nível — o status "Básico" agora aparece corretamente em amarelo (antes ficava sem cor por causa do acento).
- **Lista de alunos do conselho:** corrigido o desalinhamento do indicador de média/situação quando o nome do aluno ocupa duas linhas.

## v2.10.4 - Ajustes de relatórios, PEI e usabilidade

- **Painel inicial:** "Próximas tarefas" passa a mostrar todas as tarefas não concluídas (A Fazer, Em Andamento e Revisão), não apenas as de "A Fazer".
- **Relatório de pendências do PEI:** deixa de depender das médias importadas e passa a considerar os bimestres realmente coletados (os que aparecem em algum PEI recebido). Antes só listava o 1º bimestre.
- **Relatório de pendências do Planejamento:** lista todas as disciplinas do mapão pendentes em cada turma, em vez de apenas as que já tinham alguma resposta.
- **Tela de PEI:** as disciplinas passam a vir apenas do mapão, padronizadas em MAIÚSCULAS e sem duplicatas (matérias repetidas em FGB/IF aparecem uma única vez). Os PEIs recebidos são casados a essas linhas.
- **Busca de turmas:** agora é possível buscar por código compacto (ex.: "6b" encontra o 6º Ano B; "1f" encontra a 1ª Série F).
- **Foto do aluno:** corrigido o transbordo dos botões na janela de reposicionar foto.

## v2.10.3 - Atualização de turmas em lote e situação do aluno

### Atualizar turmas em lote (nova função)
- Nova tela **Importar Dados → Atualizar turmas em lote**: selecione **vários CSVs de alunos da SED de uma vez**. O app identifica a turma de cada arquivo **pelos RAs dos alunos** (ignorando o nome genérico do arquivo) e mostra uma **prévia** antes de gravar — turma detectada, % de confiança, e quantos seriam atualizados, novos e inativados.
- Só aplica em turmas com confiança suficiente (RAs casados); arquivos sem correspondência clara ficam como "não identificada" e não são alterados. Notas e dados já lançados são preservados.
- Alunos novos entram automaticamente na turma identificada pelos colegas — útil para quem chega de transferência.

### Correção da situação do aluno
- Ao reimportar uma turma, a **situação lida da planilha** (coluna "Situação do Aluno": Remanejamento, Transferido, BAIXA - Transferência, Não Comparecimento etc.) agora é respeitada também para alunos que já existiam. Antes, reimportar reativava todos. Agora, reimportar a lista atualizada marca corretamente os inativos (e o toggle "Mostrar inativos" passa a aparecer).

## v2.10.2 - Alunos inativos

- **Tela de turmas:** novo toggle **"Mostrar inativos"** (aparece quando há alunos inativos na turma). Por padrão, os inativos ficam ocultos; ao exibi-los, recebem um selo "Inativo" e a linha fica esmaecida.
- **Tela de conselho:** alunos inativos não são mais exibidos nem entram na navegação.
- A **ata de conselho** continua incluindo os alunos inativos normalmente.
- As **métricas e percentuais** da turma passam a considerar apenas os alunos ativos.

## v2.10.1 - Fotos dos alunos

### Importador de fotos dos alunos (nova função)
- Nova tela **Importar Fotos dos Alunos**: um arquivo **.zip** ou **.7z** por turma (o nome do arquivo identifica a turma, ex.: `6B.zip`), com as fotos nomeadas pelo primeiro nome do aluno (ou nome e sobrenome quando há repetição).
- As fotos são exibidas **quadradas** (corte central) com opção de **reposicionar** o enquadramento. Aparecem **acima do nome** na tela de conselho e **ao lado do nome** na tela do aluno.
- Suporte amplo de formatos: **JPG, PNG, WEBP, GIF, BMP** e **RAW da câmera (CR2/NEF/ARW)**, do qual é extraído o preview JPEG embutido. Fotos **HEIC/HEIF** (iPhone) são detectadas com aviso para converter para JPG.
- **Seleção manual:** alunos sem foto podem receber uma imagem do computador com um clique; fotos já vinculadas podem ser trocadas pelo modal de reposicionamento — útil quando o nome do arquivo difere do cadastro.
- As fotos ficam dentro de `dados/` e são **sincronizáveis com o grupo de trabalho**: a sincronização une as fotos de cada aparelho sem sobrescrever as que só existem localmente.

### Correções e ajustes de interface
- Telas de **PEI** e **Planejamento**: a janela de configuração agora sempre pode ser fechada (X, botão Fechar e clique fora), evitando travamento quando ainda não há links configurados.
- Tela de **conselho**: seletor de bimestre e métricas reorganizados na mesma linha; foto do aluno ampliada.
- Removidos itens provisórios: a área temporária da tela de fotos e o botão "Testar notificação" das Configurações.

## v2.10.0 - Planejamento dos Professores, relatórios de pendências e melhorias

### Planejamento dos Professores (nova função)
- Nova tela **Planejamento dos Professores** na Central de Relatórios, ao lado do PEI. Acompanha, por turma, quais professores entregaram o Plano de Ensino em cada disciplina e bimestre.
- A lista de **turmas** vem do próprio programa e a lista de **disciplinas** vem dos mapões importados — assim fica fácil ver quem entregou (ícone de documento) e quem não entregou (—).
- Os planejamentos são coletados por um **formulário Google Forms padronizado**, gerado por um script oficial embutido no aplicativo (Fundamental e Médio). A tela de configuração traz o passo a passo e botões para copiar cada script.
- Suporta **duas planilhas por segmento** (1º e 2º semestre) e os dois segmentos (Fundamental e Médio); cada escola preenche apenas os links que utiliza.
- O **Plano de Ensino** é gerado em DOCX com o cabeçalho institucional configurado, turmas atendidas, ano letivo e os campos do Currículo Priorizado (unidade temática, objetos de conhecimento, habilidades, estratégias, recursos, avaliação, adaptação curricular).

### Relatório de pendências (PEI e Planejamento)
- Botão **Pendências** nas telas de PEI e Planejamento gera um relatório DOCX organizado indicando o que falta entregar — por aluno (PEI) ou por turma (Planejamento), com as disciplinas e bimestres pendentes.

### Sincronização e rastreabilidade de notas
- **Sincronização inteligente:** a sincronização institucional agora faz mesclagem por campo em vez de substituição total. Notas e elegibilidade obedecem sempre à edição mais recente, e turmas criadas localmente não se perdem mais ao sincronizar com um dispositivo desatualizado.
- **Rastreabilidade de notas:** a importação de mapão registra quem importou e quando; ao passar o mouse sobre a nota, o app mostra o autor e a data da importação.

### Correções e ajustes de interface
- Instância única: ao relançar o app pelo ícone com ele na bandeja, a janela existente é focada em vez de abrir uma nova instância.
- Formulários de tarefa e evento: corrigido o negrito excessivo dos campos e a legibilidade dos rótulos no tema escuro.
- Campo **Vínculos** reformulado com seleção por tags e lista filtrável.
- Tema escuro da tela de importação corrigido (avisos e linhas de erro).
- Após importar notas, a tela da turma aberta é atualizada automaticamente.

## v2.9.0 - Bandeja do sistema e início automático com o Windows

- O aplicativo agora vai para a **bandeja do sistema** ao fechar a janela, em vez de encerrar. As notificações de prazo das tarefas continuam funcionando mesmo com a janela fechada.
- Ícone na bandeja com menu de contexto: **Abrir** (restaura a janela) e **Sair** (encerra o aplicativo).
- Clique com o botão esquerdo no ícone da bandeja também reabre a janela.
- Nova opção em **Configurações → Atualização**: ativar ou desativar o **início automático com o Windows**, gravado no registro do sistema.

## v2.8.0 - Tarefas com período, formulário mais enxuto e correção das notificações

- Tarefas do Kanban agora aceitam **data de início e prazo**, sendo exibidas em todos os dias do período no calendário.
- Formulário de tarefa reorganizado: datas de início e prazo na mesma linha, campo Responsável movido para a aba Vínculos e já preenchido com o nome do criador, e a opção de compartilhar virou um botão compacto.
- **Correção das notificações de prazo:** os alertas agora são enviados nativamente pelo backend, em vez da API web do navegador (instável no Linux e no Windows). Também foi corrigida a identidade usada no envio, que no Linux colidia com a integração do AppImage e fazia o sistema descartar as notificações.
- Novo botão **"Testar notificação"** em Configurações → Atualização.
- Observação: os alertas continuam dependendo do aplicativo estar aberto. A execução em segundo plano (autostart + bandeja do sistema) está planejada para uma próxima versão.

## v2.7.0 - Eventos com período, sync confiável e abertura de documentos no Linux

- Eventos do calendário agora aceitam **data de início e data de fim**, sendo replicados em todos os dias do período.
- **Correção de sincronização:** cada dispositivo passa a gravar seu próprio arquivo de estado (`state/peers/`), eliminando a corrida em que um coordenador sobrescrevia eventos/tarefas recém-criados por outro. Eventos criados por outros coordenadores agora aparecem de forma confiável.
- **Correção no Linux/AppImage:** ao abrir documentos PEI, atas ou pastas, o programa limpa as variáveis de ambiente injetadas pelo AppImage (GTK/GLib) que faziam o sistema abrir o navegador em vez do aplicativo correto.
- Geração de PEI confirmada: os documentos são salvos em `dados/relatorios/pei/<aluno>/`, um arquivo por disciplina e bimestre.

## v2.6.1 - Ajustes de UX e tema escuro

- Tela PEI: diálogo de configuração da planilha expandido com tutorial passo a passo sobre como criar o formulário no Google Forms, vincular à planilha e compartilhar o link.
- Dashboard: itens com prazo vencido agora aparecem em um contador expansível "X atrasados" com botão ✓ para marcar cada item como concluído (tarefas vão para Concluído no Kanban; eventos são descartados localmente).
- Dashboard: ajuste de espaçamento entre o cabeçalho "Ver calendário" e o primeiro card, alinhando com o painel de tarefas.
- Tema escuro revisado: substituição do preto puro por cinza-azulado escuro (`#1a1a1f`), texto principal suavizado de branco puro para `#dde4f0`, melhor hierarquia de superfícies e bordas. Adicionadas variáveis CSS (`--accent`, `--border`, `--surface`, `--text-secondary`) usadas pelos componentes PEI.

## v2.6.0 - PEI — Plano Educacional Individualizado

- Nova tela **PEI** na Central de Relatórios para acompanhar os Planos Educacionais Individualizados enviados pelos professores via Google Forms.
- A URL da planilha de respostas é configurada uma vez e sincronizada automaticamente entre dispositivos junto com os dados institucionais.
- Ao abrir a tela, os documentos PEI são gerados automaticamente a partir dos dados da última planilha carregada.
- Cada PEI é salvo como um arquivo DOCX individual (`DISCIPLINA_Xbimestre.docx`) dentro de uma pasta com o nome do aluno.
- Clicar no ícone de folha na tabela disciplinas × bimestres abre o DOCX correspondente.
- Indicador de status por aluno: verde (todos os PEIs do bimestre atual entregues), amarelo (entrega parcial) ou vermelho (nenhum PEI recebido).
- O bimestre atual é detectado automaticamente pelas médias já importadas no mapão.
- Relatório PEI gerado no formato oficial (Anexo IV – Resolução SEDUC Nº 129/2025): cabeçalho da escola, campos de identificação, período com checkbox do bimestre, quatro perguntas do currículo paulista, e bloco de assinaturas centralizado em duas colunas ao final da página.

## v2.5.0 - Correções de integridade de dados e sincronização

### Correções críticas
- **Perda de dados no sync institucional:** a substituição do diretório de dados agora usa renomeação dupla (swap seguro). Se a operação falhar no meio, o diretório original é restaurado automaticamente em vez de ser apagado sem recuperação.
- **Escrita atômica nos arquivos de turma:** todos os comandos que salvam dados de turma (ajustes de média, encaminhamentos, liderança, educação especial, finalização de conselho, importação de mapões etc.) agora gravam em arquivo temporário e fazem rename atômico, evitando corrupção por queda de energia ou crash.

### Correções de comportamento
- **Linha do tempo do dashboard:** tarefas ativas com prazo vencido há até 30 dias voltam a aparecer na linha do tempo; antes eram silenciosamente omitidas.
- **Próxima ocorrência de tarefas recorrentes antigas:** tarefas recorrentes com mais de 400 dias de existência não retornam mais uma data passada como "próxima ocorrência".
- **Alertas de prazo:** a marcação de alerta como disparado agora respeita o campo `ativo` e o estado `disparadoEm` individualmente, evitando silenciar alertas inativos que compartilham o mesmo intervalo.

### Correções de sincronização em grupo
- **Membros com timestamp ausente:** a comparação de timestamps ao mesclar membros do grupo de trabalho usava `NaN >= N`, que é sempre `false`; corrigido para que registros com timestamp válido sempre prevaleçam sobre registros sem timestamp.
- **Tarefas privadas no payload remoto:** a aplicação de payloads de sincronização agora rejeita tarefas sem `compartilhada: true`, impedindo que arquivos corrompidos ou de versões antigas injetem tarefas privadas remotas sobre tarefas locais.

### Melhorias de qualidade
- System prompt do assistente pedagógico extraído para constante única, eliminando divergência entre o caminho automático (Gemini/Ollama) e o manual.
- Lógica de deduplicação de vínculos (`obterVinculosTarefa` / `obterVinculosEvento`) consolidada em helper compartilhado.
- Cor de status das tarefas na linha do tempo passa a usar `colunasKanbanPadrao` como fonte única.

## v2.3.6 - Ícone Linux e alerta do Kanban

- Corrigido o banner de alta prioridade do Kanban para ignorar tarefas em `Concluído`.
- Normalizados os ícones Linux do aplicativo para tamanhos padrão usados pelo GNOME/Dash to Dock.
- O AppImage passa a incluir metadados de categoria e ícone compatíveis com a integração do desktop.

## v2.3.5 - Tarefas concluídas fora das pendências

- Tarefas movidas para `Concluído` continuam no histórico do Kanban.
- Tarefas concluídas não aparecem mais em próximas tarefas, próximas datas, calendário ou listas vinculadas de alunos e turmas.

## v2.3.4 - Vínculos, anexos e notificações do Kanban

- Autocomplete de etiquetas e vínculos do Kanban agora usa busca aproximada.
- Tarefas podem ser vinculadas a múltiplas turmas, alunos ou eventos.
- Imagens anexadas ao Kanban são copiadas para a pasta de dados do programa.
- Documentos e planilhas anexados ao Kanban passam a abrir o arquivo original pelo aplicativo padrão do sistema.
- Alertas de prazo são verificados também logo após criar ou editar tarefas.

## v2.3.3 - Alertas de prazo nas tarefas

- Adicionada integração com notificações nativas do Windows e Linux para prazos de tarefas.
- Cada tarefa pode ativar alertas independentes para 2 dias antes, 1 dia antes e no dia do prazo.
- O aplicativo verifica alertas ao abrir e periodicamente enquanto estiver em execução.
- Alertas disparados são marcados para evitar notificações repetidas para o mesmo prazo.

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
