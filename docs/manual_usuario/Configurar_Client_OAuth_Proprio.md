# Como criar seu próprio client do Google (Web App automático de Planejamento e PEI)

> **Isso só é necessário para quem CRIA o Web App** (o primeiro clique em "Criar
> automaticamente"). Os demais coordenadores da mesma escola **não precisam disso, nem
> de conta Google nenhuma**: quem já criou o Web App pode copiar o botão **"Copiar link
> para coordenadores"** (nas telas de Planejamento e PEI, depois de configurado) e
> mandar esse link para os colegas. Cada um cola o link recebido no campo "Já tem um Web
> App configurado por outro coordenador?" e passa a ver os mesmos dados — sem OAuth, sem
> compartilhar planilha no Drive, sem cadastrar ninguém como usuário de teste. O
> tutorial abaixo é só para quem vai criar o Web App do zero.

## Quando você precisa disso

O botão **Criar automaticamente** (nas telas de Planejamento e PEI) cria e publica um Web App no Google da própria escola, sem precisar colar script manualmente nem compartilhar planilha. Para isso, ele usa uma autorização OAuth do Google — e, por padrão, essa autorização usa um client compartilhado por todas as instalações do CoordenacaoOP.

Enquanto esse client compartilhado estiver em modo "Testando" no Google Cloud (o que é o caso hoje), **só contas cadastradas manualmente como "usuário de teste" conseguem autorizar**. Se você tentar usar "Criar automaticamente" e o Google mostrar uma tela de erro do tipo "Acesso bloqueado: solicitação inválida" ou "Este app não foi verificado pelo Google", é exatamente isso — sua conta não está na lista de testes do client compartilhado.

A solução, sem precisar esperar o autor do app resolver isso, é criar o **seu próprio client OAuth** no Google Cloud (gratuito) e configurar o CoordenacaoOP para usá-lo. Leva uns 10–15 minutos e só precisa ser feito uma vez por escola/instalação.

Se você **não** usa "Criar automaticamente" (só o caminho manual, colando script no Apps Script), não precisa fazer nada disso.

## Passo a passo no Google Cloud

1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) com a conta Google que a coordenação usa.
2. Crie um projeto novo (menu no topo → **Novo projeto**). Dê qualquer nome, ex.: "CoordenacaoOP — minha escola".
3. No menu lateral, vá em **APIs e serviços → Biblioteca** e ative estas duas APIs (busque pelo nome e clique em **Ativar** em cada uma):
   - **Google Apps Script API**
   - **Google Sheets API**
4. Vá em **APIs e serviços → Tela de permissão OAuth**:
   - Tipo de usuário: **Externo**.
   - Preencha nome do app, e-mail de suporte e e-mail de contato do desenvolvedor (pode ser o seu mesmo).
   - Em **Escopos**, clique em **Adicionar ou remover escopos** e cole manualmente (aba "Escopos manuais") estes quatro, um por linha:
     ```
     https://www.googleapis.com/auth/script.projects
     https://www.googleapis.com/auth/script.deployments
     https://www.googleapis.com/auth/spreadsheets
     https://www.googleapis.com/auth/script.send_mail
     ```
   - Em **Usuários de teste**, adicione o(s) e-mail(s) Google que vão usar o CoordenacaoOP nesta escola (normalmente, só o seu).
5. Vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo para computador** (Desktop app).
   - Dê um nome qualquer e clique em **Criar**.
6. O Google mostra o **ID do cliente** e a **Chave secreta do cliente** — copie os dois, você vai precisar deles no próximo passo.

## Configurando o CoordenacaoOP para usar seu client

O CoordenacaoOP lê um arquivo opcional `google_oauth.json` na pasta de configuração do app. Se esse arquivo existir e tiver os dois campos preenchidos, ele passa a ser usado no lugar do client compartilhado — sem precisar recompilar nada.

1. Localize a pasta de configuração do app:
   - **Instalação padrão no Windows**: `%APPDATA%\CoordenacaoOP\config` (cole esse caminho na barra de endereços do Explorer).
   - **Versão portátil**: a pasta `config` fica ao lado do executável `CoordenacaoOP.exe`.
   - Se a pasta `config` ainda não existir, crie-a manualmente (ela é criada automaticamente na primeira vez que você salva algo em Configurações, mas você pode criá-la antes).
2. Dentro dela, crie um arquivo de texto chamado `google_oauth.json` com este conteúdo, substituindo pelos valores copiados do Google Cloud:
   ```json
   {
     "client_id": "COLE_SEU_CLIENT_ID_AQUI",
     "client_secret": "COLE_SUA_CHAVE_SECRETA_AQUI"
   }
   ```
3. Salve o arquivo e reabra o CoordenacaoOP (se estiver aberto).
4. Vá em Planejamento ou PEI → **Planilhas**/**Planilha** → aba **Automático** → **Criar automaticamente**. A tela de autorização do Google que abrir agora deve ser a do seu próprio projeto (mostrando o nome que você deu no passo 4 da seção anterior, não mais um app genérico).

## Se algo der errado

- **Continua abrindo a tela do client compartilhado**: confira se o arquivo está exatamente em `.../config/google_oauth.json` (não `.../dados/config/...`) e se o JSON está bem formado (aspas duplas, vírgula entre os dois campos, sem vírgula sobrando no final).
- **"Acesso bloqueado" mesmo com seu próprio client**: confira se o e-mail usado para autorizar está na lista de "Usuários de teste" da tela de permissão OAuth do seu projeto.
- **Erro de escopo/permissão ao criar a planilha ou o Web App**: confirme que as duas APIs (Apps Script e Sheets) estão realmente ativadas no seu projeto — é um passo separado da tela de permissão OAuth.
