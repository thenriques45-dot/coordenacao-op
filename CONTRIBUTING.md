# Contribuindo com o CoordenacaoOP

Obrigado por contribuir.

## Fluxo recomendado

1. Abra uma issue descrevendo bug ou melhoria
2. Crie um branch a partir de `main`
3. Faça alterações pequenas e focadas
4. Garanta que os testes passam:
   - `python -m unittest -v`
5. Abra Pull Request com contexto claro

## Padrões técnicos

- Mantenha compatibilidade com Windows e Linux
- Evite mudanças destrutivas no modelo de dados sem migração
- Priorize clareza de código e validações explícitas

## Commits

Use mensagens objetivas, por exemplo:

- `Corrige validação de bimestre na GUI`
- `Adiciona importação de mapão IF`

## Pull Request checklist

- [ ] Código compila/roda localmente
- [ ] Testes passam
- [ ] Mudança está documentada
- [ ] Impactos de compatibilidade foram considerados
