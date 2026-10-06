# Flatpak e Flathub

O CoordenacaoOP para Linux sai em dois formatos:

- **AppImage** — portátil, guarda os dados ao lado do arquivo e se atualiza sozinho.
- **Flatpak** — integrado à loja do sistema (GNOME Software, Discover). Quem atualiza é a loja
  ou o comando `flatpak update`; o app não se atualiza sozinho.

ID do app: `io.github.thenriques45_dot.CoordenacaoOP` (o `-` do usuário do GitHub vira `_`,
como o Flathub exige).

## Instalar o `.flatpak` da release

Cada release do GitHub traz um `CoordenacaoOP_v<versão>_x86_64.flatpak`. Para instalar:

```bash
flatpak install --user CoordenacaoOP_v<versão>_x86_64.flatpak
```

O runtime (GNOME 51) vem do Flathub; se o Flathub ainda não estiver configurado:

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

O pacote avulso não recebe atualizações sozinho: instale o da release nova por cima. Quando o app
estiver no Flathub, instale de lá para receber as atualizações pela loja.

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

## Enviar ao Flathub (primeira vez)

O envio é um pull request no repositório `flathub/flathub`, feito pela conta do GitHub do autor
(é ela que comprova o ID `io.github.thenriques45_dot`). Resumo de
<https://docs.flathub.org/docs/for-app-authors/submission>:

1. Fork de `github.com/flathub/flathub`, a partir da branch `new-pr`.
2. Na raiz do fork, copie o manifesto e os dois JSON de fontes. No manifesto, troque a fonte
   `type: dir` por uma fonte git fixada numa tag:
   ```yaml
   - type: git
     url: https://github.com/thenriques45-dot/coordenacao-op.git
     tag: v<versão>
     commit: <hash do commit da tag>
   ```
3. Abra o PR contra `new-pr` com o título `Add io.github.thenriques45_dot.CoordenacaoOP`.
4. Responda à revisão. Pontos que costumam ser questionados: `--filesystem=home` (justificado
   acima) e as capturas de tela do `metainfo.xml`, que precisam ser URLs públicas.

Aprovado, o Flathub cria `github.com/flathub/io.github.thenriques45_dot.CoordenacaoOP`. A cada
versão nova, atualize lá a tag/commit (e os JSON de fontes, se mudaram) — à mão ou com o robô
`x-checker-data`.
