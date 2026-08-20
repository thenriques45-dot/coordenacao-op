# Repositório de relatórios do CoordenacaoOP

Relatórios personalizados que qualquer coordenador pode navegar e baixar direto pela
tela "Repositório de relatórios" do app, sem precisar reconstruir do zero.

## Estrutura

- `oficiais/` — relatórios aprovados e mantidos pelo autor do app. Só ele publica aqui.
- `comunidade/` — relatórios enviados por outros coordenadores, revisados via Pull
  Request antes de entrar.

Cada arquivo é um `.json` no mesmo formato que o botão **Exportar definição** do
construtor de relatórios já produz — ou seja, a forma mais fácil de contribuir é:

1. Montar o relatório no construtor visual do app.
2. **Exportar definição** (salva um `.json` no seu computador).
3. Abrir um Pull Request neste repositório adicionando esse arquivo em
   `relatorios_repositorio/comunidade/`.

O app baixa e importa o arquivo exatamente como está — sem executar nada além de ler
os campos da definição (filtros, colunas, formato de saída etc.).
