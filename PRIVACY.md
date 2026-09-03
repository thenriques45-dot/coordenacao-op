# Política de Privacidade — CoordenacaoOP

**Última atualização:** 3 de setembro de 2026
**Versão do aplicativo a que se aplica:** 4.0.0 e posteriores

O **CoordenacaoOP** é um aplicativo de desktop (Windows e Linux) de apoio ao
trabalho da coordenação pedagógica em escolas de Ensino Médio. Ele organiza
dados de turmas, conselho de classe, PEI, planejamento e atendimento às
famílias.

Esta política explica quais dados o aplicativo trata, onde eles ficam e o que
acontece quando você ativa recursos opcionais que dependem de serviços de
terceiros.

## Resumo

- O CoordenacaoOP funciona **localmente**. Todos os dados que você digita ou
  importa ficam **no seu computador**.
- O desenvolvedor **não opera servidores** e **não recebe** dados de uso, dados
  de alunos, nem qualquer informação pessoal tratada no aplicativo.
- **Não há** publicidade, rastreamento, analytics ou telemetria.
- O aplicativo só envia dados para fora do computador quando **você ativa** um
  recurso opcional (verificação de atualização, sincronização com o grupo de
  trabalho, contato com a família por WhatsApp ou assistente de IA em nuvem).
  Cada um está descrito abaixo.

## Dados tratados e onde ficam armazenados

Todos os dados abaixo são gravados **apenas no armazenamento local do seu
computador** (no Windows, na pasta `%LOCALAPPDATA%\CoordenacaoOP`):

- **Dados institucionais:** identificação da escola, cabeçalho de documentos,
  equipe gestora, listas de turmas e configurações.
- **Dados de estudantes:** nome, número de chamada, RA/matrícula, turma,
  situação, notas e frequência importadas, indicadores de elegibilidade,
  informações de PEI e de deficiência quando aplicável.
- **Registros pedagógicos:** conselho de classe, encaminhamentos, observações,
  aluno destaque, planejamento e tarefas do Quadro de Gestão.
- **Atendimentos e contato com a família:** histórico de atendimentos,
  follow-ups e mensagens enviadas.
- **Backups:** arquivos de backup que você gera ficam onde você escolher salvar.

Você pode apagar esses dados a qualquer momento excluindo os arquivos da pasta
de dados ou desinstalando o aplicativo.

## Papéis no tratamento de dados (LGPD)

Os dados de estudantes são tratados **em nome da instituição de ensino**. A
escola/rede de ensino é a **controladora** dos dados; o profissional da
coordenação que usa o aplicativo o faz no exercício de sua função
institucional. O desenvolvedor do CoordenacaoOP **não é controlador nem
operador** desses dados, pois não tem acesso a eles.

O tratamento se apoia nas hipóteses legais aplicáveis à execução de políticas
públicas e à área de educação (Lei nº 13.709/2018 — LGPD, arts. 7º, 11 e 23,
conforme o caso). Pedidos de acesso, correção ou eliminação de dados devem ser
dirigidos à instituição de ensino responsável.

## Recursos opcionais que enviam dados a terceiros

### 1. Verificação de atualização

Para avisar sobre novas versões, o aplicativo consulta a API pública do GitHub
(`api.github.com`) e, se você aceitar atualizar, baixa o instalador assinado do
GitHub. Nessa conexão trafegam apenas a versão instalada e os metadados
técnicos normais de uma requisição HTTP (endereço IP, identificação do
aplicativo). Nenhum dado de aluno ou da escola é enviado. O tratamento desses
metadados pelo GitHub segue a política de privacidade da GitHub, Inc.

### 2. Sincronização com o grupo de trabalho (Google)

Se você ativar a sincronização, dados de turmas, alunos, Quadro de Gestão,
planejamento e PEI são gravados em planilhas do **Google Sheets na sua própria
conta Google**, mediante autenticação por OAuth do Google. Esses dados passam a
ser compartilhados com os demais coordenadores da escola que você autorizar.
O armazenamento e o compartilhamento ocorrem na sua conta Google e seguem a
política de privacidade do Google LLC. As credenciais de acesso ficam apenas no
seu computador.

### 3. Contato com a família por WhatsApp

- **Fila assistida (padrão, gratuita):** o aplicativo abre links `wa.me` no seu
  navegador/WhatsApp. A mensagem é enviada pela sua própria conta de WhatsApp;
  o desenvolvedor não intermedeia nem registra nada.
- **Envio automático pela API oficial da Meta (opcional):** se você configurar
  suas próprias credenciais da WhatsApp Business Platform, o conteúdo da
  mensagem e o número de telefone da família são transmitidos à **Meta
  Platforms, Inc.** para entrega, conforme a política de privacidade da Meta. As
  credenciais e a configuração ficam apenas no seu computador e não são
  sincronizadas.

### 4. Assistente pedagógico com IA (opcional, desligado por padrão)

Se você ativar o assistente com um provedor **em nuvem** (Google Gemini), o
texto do relatório/contexto usado para gerar o rascunho é enviado a esse
provedor, conforme a política de privacidade dele. Se você usar um modelo
**local** (Ollama), nada sai do seu computador. Este recurso deve ser usado
apenas com autorização da escola.

## Segurança

Os dados locais herdam as proteções da conta de usuário do sistema
operacional. O aplicativo valida caminhos de arquivo e esquemas de URL para
reduzir riscos de acesso indevido, e os instaladores de atualização são
verificados por assinatura digital antes de serem aplicados. Recomenda-se usar
o aplicativo em computador com conta protegida por senha e manter backups.

## Crianças e adolescentes

O aplicativo é uma ferramenta de trabalho de uso exclusivo de profissionais da
educação. Não é destinado a uso por estudantes. Dados de crianças e
adolescentes são tratados no melhor interesse do estudante e no contexto
escolar, sob responsabilidade da instituição de ensino.

## Alterações nesta política

Mudanças nesta política acompanham as versões do aplicativo e ficam
registradas neste documento, com a data de atualização no topo.

## Contato

Dúvidas sobre esta política de privacidade: **thenriques45@gmail.com**

Para exercer direitos sobre dados de estudantes (acesso, correção,
eliminação), procure a **instituição de ensino** responsável pelo tratamento.
