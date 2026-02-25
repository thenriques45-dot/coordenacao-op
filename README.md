# CoordenacaoOP

Software de apoio à coordenação pedagógica para gestão de turmas, importação de mapões e geração de documentos (ata de conselho e relatório para professores).

## Licença

Este projeto é distribuído sob a licença **GPL-3.0-or-later**. Veja [LICENSE](LICENSE).

## Funcionalidades principais

- Cadastro e gestão de turmas
- Importação de alunos via CSV
- Importação de mapões (FGB e IF)
- Gestão de conselho por bimestre (aluno a aluno)
- Registro de encaminhamentos (ENC 1..10) por aluno
- Geração de ata de conselho (.docx)
- Geração de relatório para professores (.docx)
- Verificação de atualizações pelo menu `Ajuda > Verificar atualizacoes`

## Requisitos (execução em código-fonte)

- Python 3.11+ (recomendado 3.12)
- Dependências em `requirements.txt`

Instalação:

```bash
pip install -r requirements.txt
```

Execução da GUI:

```bash
python main_gui.py
```

## Builds para usuários finais

Os binários para Windows e Linux são publicados em **Releases** do GitHub.

- Windows: `CoordenacaoOP.exe` (zipado no release)
- Linux: `CoordenacaoOP-x86_64.AppImage`

## Estrutura de release automática

- CI de testes: `.github/workflows/ci.yml`
- Build e publicação de release por tag `v*`: `.github/workflows/release.yml`

## Como lançar uma nova versão

1. Atualize changelog e confirme testes
2. Crie a tag:
   - `git tag vX.Y.Z`
3. Publique:
   - `git push origin vX.Y.Z`
4. O GitHub Actions gera os artefatos e publica no release

## Roadmap

Veja [ROADMAP_GERENCIADOR.md](ROADMAP_GERENCIADOR.md) e [CHECKLIST_v0.9.0.md](CHECKLIST_v0.9.0.md).

## Segurança e contribuição

- Segurança: [SECURITY.md](SECURITY.md)
- Guia de contribuição: [CONTRIBUTING.md](CONTRIBUTING.md)
- Código de conduta: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
