# Publicação na Microsoft Store (MSIX)

O CoordenacaoOP vai para a Store como **MSIX**. A Store **assina** o pacote na
submissão — não usamos certificado de code signing próprio.

## Por que MSIX e não EXE/MSI

O tipo "EXE/MSI app" do Partner Center exige um instalador assinado com
certificado Authenticode (custo recorrente). MSIX submetido pela Store é
assinado pela Microsoft, de graça. O produto no Partner Center precisa ter sido
criado como **"Aplicativo MSIX ou PWA"** (não dá para trocar o tipo depois).

## Identidade do produto (Partner Center → Coordenação OP → Identidade do produto)

Fixos no `modern-ui/msix/AppxManifest.xml`:

| Campo | Valor |
|---|---|
| Package/Identity/Name | `ThiagoHenriqueSantos.CoordenaoOP` |
| Package/Identity/Publisher | `CN=7AB270BA-472E-4161-9899-910EEEC69DA9` |
| PublisherDisplayName | `Thiago Henrique Santos` |
| Package Family Name | `ThiagoHenriqueSantos.CoordenaoOP_akhysvd92kc4e` |
| Store ID | `9NB56ZCKQT6H` |

## Build da Store

Feature `store` do Cargo: desliga o auto-updater do Tauri (a Store atualiza) e
esconde na UI o "iniciar com o Windows" (o container do MSIX não deixa gravar a
chave de autostart). `app_info().loja == true` nesse build.

### Local (precisa do Windows SDK para o `makeappx`)

```powershell
cd modern-ui
npm run tauri build -- --config src-tauri/tauri.store.conf.json --features store
./scripts/build-msix.ps1
# -> src-tauri/target/release/msix/CoordenacaoOP_<versao>.0_x64.msix
```

### CI

**Em cada release (tag `v*`).** O `.github/workflows/release.yml` tem dois jobs
da Store, separados da release do GitHub — se eles falharem, a release e o
auto-update de quem usa a versão do GitHub saem normalmente:

- `build-store-msix` gera o `.msix` e o guarda como artifact
  `coordenacaoop-msix` da execução. Ele **não** é anexado à release: sai sem
  assinatura e não instala fora da Store.
- `publish-store` envia esse `.msix` ao Partner Center e já submete para
  certificação — **somente se os quatro secrets da seção seguinte existirem**.
  Sem nenhum deles, termina com um aviso e o envio continua manual. Com só parte
  deles, falha de propósito, para a configuração incompleta não passar
  despercebida.

**Sem criar tag.** Workflow **Store (MSIX)** (`.github/workflows/store.yml`),
disparo manual em Actions → Store (MSIX) → Run workflow. Gera o mesmo artifact.

**Envio manual.** Baixe o artifact `coordenacaoop-msix` da execução,
descompacte e envie o `.msix` em **Partner Center → Coordenação OP → Pacotes**
(sem assinar). Depois, **Enviar para certificação**.

## Envio automático à Store (configuração única)

Requisitos da Microsoft:

- O app precisa estar **publicado e disponível na Store** antes. O primeiro
  envio é sempre manual pelo Partner Center, com o questionário de
  classificação etária. Só cadastre os secrets depois disso, senão o job
  `publish-store` falha a cada tag.
- Só funciona para apps **gratuitos**.
- Quem configura precisa ter a função **Gerente** no Partner Center e ser
  **administrador global** do diretório do Entra ID usado.

O Partner Center pode aparecer em português ou inglês; os nomes em inglês estão
entre parênteses.

### 1. Diretório do Microsoft Entra ID

Partner Center → engrenagem → **Configurações da conta** (Account settings) →
**Locatários** (Tenants).

- Se já aparece um diretório, siga para o passo 2.
- Se não, clique em **Criar Microsoft Entra ID** (Create Microsoft Entra ID) e
  siga o assistente. É gratuito, e quem cria vira administrador global do
  diretório novo.

Faça isso com a conta de desenvolvedor dona do app. Não associe um diretório
institucional (da Secretaria, por exemplo): exigiria ser administrador global
dele, e a publicação do app passaria a depender de uma conta que não é sua.

### 2. Aplicativo do Entra com função Gerente

Configurações da conta → **Gerenciamento de usuários** (User management) → aba
**Aplicativos do Microsoft Entra** (Microsoft Entra applications) →
**Adicionar aplicativo do Microsoft Entra** (Add Microsoft Entra application) →
**Criar aplicativo do Microsoft Entra** (Create Microsoft Entra application).

- Nome de exibição: por exemplo `CoordenacaoOP GitHub Actions`.
- URL de resposta (Reply URL): precisa ser única no diretório e não é usada
  neste fluxo — pode ser `https://github.com/thenriques45-dot/coordenacao-op`.
- Em **Funções aplicáveis a programas de desenvolvedor** (Roles applicable to
  developer programs), marque **Gerente** (Manager).
- **Criar** (Create).

### 3. ID do locatário, ID do cliente e chave

Na mesma aba, clique no nome do aplicativo criado.

- Anote o **ID do locatário** (Tenant ID) e o **ID do cliente** (Client ID).
- Clique em **Adicionar nova chave** (Add new key) e copie o valor da **Chave**
  (Key) **na hora** — ele não aparece de novo depois que você sai da página.
- A lista de chaves mostra quando cada uma expira. Anote a data: depois dela o
  job `publish-store` passa a falhar, e é preciso criar uma chave nova e
  atualizar o secret.

### 4. ID do vendedor

Configurações da conta → **Perfil legal** (Legal profile) → aba
**Desenvolvedor** (Developer) → seção de IDs do editor (Publisher IDs) →
**ID do vendedor** (Seller ID).

### 5. Secrets no GitHub

Repositório → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, um para cada linha:

| Secret | Valor |
|---|---|
| `AZURE_AD_TENANT_ID` | ID do locatário (passo 3) |
| `AZURE_AD_APPLICATION_CLIENT_ID` | ID do cliente (passo 3) |
| `AZURE_AD_APPLICATION_SECRET` | Chave (passo 3) |
| `SELLER_ID` | ID do vendedor (passo 4) |

Com o GitHub CLI autenticado, `gh secret set AZURE_AD_TENANT_ID --repo thenriques45-dot/coordenacao-op`
pede o valor sem exibi-lo na tela (repita para os outros três).

### 6. Conferir

Na próxima tag, o job `publish-store` deve executar o passo
**Submit MSIX to Microsoft Store**, e o Partner Center deve mostrar o envio em
certificação. A certificação continua levando de horas a alguns dias.

### Cuidados

- **Não deixe rascunho aberto no Partner Center ao criar uma tag.** O
  `msstore publish` descarta o rascunho pendente e cria outro a partir do último
  envio publicado — edições de listagem não publicadas se perdem.
- **Não edite pelo Partner Center um envio criado pelo GitHub** enquanto ele
  estiver em andamento: a Microsoft avisa que isso impede a automação de
  concluí-lo e pode travar o envio, que então precisa ser apagado.
- **Para pausar** o envio automático, apague os quatro secrets: o job volta a
  só avisar. Apagar só um deles faz o job falhar.

## Versão

O MSIX usa 4 partes com revisão `.0` (ex.: `4.0.1.0`). O
`build-msix.ps1` substitui o placeholder do manifesto pela versão do
`package.json`. Cada envio à Store precisa de versão maior que a anterior.

## Migração de dados

A versão da Store grava em pasta isolada do pacote
(`%LOCALAPPDATA%\Packages\ThiagoHenriqueSantos.CoordenaoOP_akhysvd92kc4e\LocalCache\Roaming\CoordenacaoOP\`).
Quem vem da versão do GitHub **não vê os dados antigos** — precisa restaurar de
um backup. Deixar isso claro na descrição da Store.

## Coexistência

A versão da Store e a do GitHub convivem. Só a do GitHub tem auto-updater.
