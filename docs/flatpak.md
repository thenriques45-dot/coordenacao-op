# Flatpak e Flathub

O CoordenacaoOP para Linux sai em dois formatos:

- **AppImage** — portátil, guarda os dados ao lado do arquivo e se atualiza sozinho.
- **Flatpak** — integrado à loja do sistema (GNOME Software, Discover). Quem atualiza é a loja
  ou o comando `flatpak update`; o app não se atualiza sozinho.

ID do app: `io.github.thenriques45_dot.CoordenacaoOP` (o `-` do usuário do GitHub vira `_`,
como o Flathub exige).

## Instalar

Pelo repositório Flatpak do projeto, publicado no GitHub Pages: abra
<https://thenriques45-dot.github.io/coordenacao-op/> e clique em **Instalar o CoordenacaoOP**, ou:

```bash
flatpak install --user https://thenriques45-dot.github.io/coordenacao-op/coordenacaoop.flatpakref
```

O `.flatpak` anexado a cada release (`CoordenacaoOP_v<versão>_x86_64.flatpak`) também funciona e
aponta para o mesmo repositório:

```bash
flatpak install --user CoordenacaoOP_v<versão>_x86_64.flatpak
```

Nos dois casos as versões novas chegam pela loja do sistema ou por `flatpak update`. O runtime
(GNOME 51) vem do Flathub, que é configurado sozinho na instalação.

## Levar os dados do AppImage para o Flatpak

O Flatpak guarda os dados em `~/.var/app/io.github.thenriques45_dot.CoordenacaoOP/data/coordenacaoop`,
separados dos do AppImage. Para levar tudo:

1. No AppImage: **Configurações → Backup**, exporte um backup com todos os ciclos.
2. No Flatpak: **Configurações → Backup**, restaure esse arquivo.

Quem usa a sincronização com o grupo recebe turmas e tarefas compartilhadas pela pasta do grupo
assim que a configurar no Flatpak. As configurações do assistente de IA (que guardam a chave de
API) não entram no backup: preencha de novo.

## Permissões

| Permissão | Para quê |
|---|---|
| `--filesystem=home` | pasta compartilhada do grupo, anexos do Kanban, importações e relatórios |
| `--filesystem=/run/media` | pendrive do conselho de classe |
| `--share=network` | sincronização, login Google/GitHub, assistente de IA |
| `--talk-name=org.kde.StatusNotifierWatcher`, `xdg-run/tray-icon` | ícone na bandeja |

Limitação conhecida: o botão que inicia o Ollama local não funciona no sandbox (o Flatpak não
executa programas do sistema). Com o Ollama já rodando, o assistente conversa com ele normalmente.

## Build local

Na raiz do repositório:

```bash
flatpak install --user flathub org.flatpak.Builder
flatpak run org.flatpak.Builder --user --install --install-deps-from=flathub --force-clean \
  build-flatpak flatpak/io.github.thenriques45_dot.CoordenacaoOP.yml
flatpak run io.github.thenriques45_dot.CoordenacaoOP
```

O build é offline: as dependências do Cargo e do npm vêm de `flatpak/cargo-sources.json` e
`flatpak/node-sources.json`. **Sempre que mudar `Cargo.lock` ou `package-lock.json`, rode
`flatpak/gerar-fontes.sh`** e faça commit dos dois JSON junto — senão o build do Flatpak falha
na release.

## Repositório Flatpak próprio (atualização automática)

O job `build-flatpak` do workflow de release gera um repositório Flatpak assinado com GPG e o job
`publish-flatpak-repo` o publica na branch `gh-pages`, servida pelo GitHub Pages. A branch guarda só
a versão mais recente. Sem o secret de assinatura, a release sai só com o `.flatpak` avulso, que
não se atualiza.

Configuração (uma vez só):

1. **Gerar a chave de assinatura.** No Linux, ou no Git Bash do Windows (o Git para Windows já traz
   o `gpg`):
   ```bash
   gpg --batch --passphrase '' --quick-gen-key "CoordenacaoOP Flatpak" rsa4096 sign never
   gpg --armor --export-secret-keys "CoordenacaoOP Flatpak" > coordenacaoop-flatpak-privada.asc
   ```
2. **Cadastrar o secret.** Em *Settings → Secrets and variables → Actions → New repository
   secret*, crie `FLATPAK_GPG_PRIVATE_KEY` com o conteúdo inteiro do arquivo `.asc`.
3. **Guardar o `.asc` num lugar seguro e apagar a cópia solta.** Quem já instalou confia nessa
   chave: se ela se perder, as atualizações param e todo mundo precisa reinstalar.
4. **Publicar uma release** (tag `v*`). Ela cria a branch `gh-pages`.
5. **Ligar o GitHub Pages.** Em *Settings → Pages*, em *Build and deployment*, escolha *Deploy from
   a branch*, branch `gh-pages`, pasta `/ (root)`.

## Flathub

Enviar ao Flathub esbarra na política de IA dele: o manifesto da submissão não pode ter conteúdo
gerado ou assistido por IA, e o PR e as respostas da revisão também precisam ser do autor
(<https://docs.flathub.org/docs/for-app-authors/requirements>). Por isso o caminho adotado é o
repositório próprio acima.
