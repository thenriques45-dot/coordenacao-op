# Configurações v2 + rename Diagnóstica

Branch `feat/configuracoes-v2`, a partir de `feat/tela-atendimentos`. Entra no release 4.0.
Baseado em `design_handoff_configuracoes_v2/`.

## Rename AvD → Diagnóstica (commit `c58d95f`)
"AvD1"/"AvD2" viraram "Diagnóstica 1"/"Diagnóstica 2" **só nos textos visíveis** (telas de
conselho, ficha do aluno, importador do Diagnóstico SARESP, NOVIDADES). O parser do relatório
"Aprendizagem Equivalente" (`importador_mapao.rs`) continua lendo "Sem AvD1"/"Sem AvD2" porque
é o texto que a SEDUC gera na planilha.

## Andamento

- **F1–F3** ✅ (`dd753ed`) — nav de 4 grupos com contraste real (Institucional / Conselho /
  Este computador / Integrações), item de 1 linha; busca no topo que casa seção **e** campo
  (índice estático sem acento, navegação ↑↓/Enter/Esc, rola até a âncora e destaca); seção
  inicial **"Visão geral"** (faixa de manutenção + grade 2×2 de cards por grupo com estado real
  + painel "Saiu de Configurações"). Funde "Sincronização de grupo" + "Turmas e alunos" em
  "Sincronização"; "Envio automático" vira "WhatsApp"; "Manutenção de dados" vai para
  "Este computador".
- **F4** ✅ (`949c6f3`) — `<CabecalhoSecao>` (trilha + título + descrição + slot de ação)
  em todas as seções; Instituição reconstruída no padrão 1d (artigos, campos em 2 colunas,
  nota de consequência, miniatura da ATA).
- **F5** ✅ (`8f0d672`) — modelos de mensagem saem de Configurações para
  **Atendimentos → "Gerenciar modelos"** (modal). Novo comando `salvar_modelos_mensagem`
  troca só esse campo da config. "Tipos de atendimento" fica em Institucional › Turmas
  (é lista única da escola — a alternativa do próprio handoff).
- **Tema escuro** ✅ (`08aa7a9`).

## Equipe gestora (F1–F5, commits `f4c7761`…`7f616d0`)

Base para os **perfis de uso**. Nova seção **Configurações › Institucional › Equipe gestora**:
direção (nome + gênero), e listas de tamanho variável de **vice-direção** e **coordenação**,
cada pessoa com gênero "F" / "M" / "não informar".

- **Modelo (Rust)** — `MembroEquipe` / `EquipeGestora` em `configuracoes.json`. Migra dos campos
  planos `direcao_nome` / `direcao_pronome` / `vice_direcao` e os regrava derivados na gravação
  (leitores antigos — `obter_direcao_configurada`, PEI — seguem intactos). Comando
  `salvar_equipe_gestora` (troca só esse campo, carimba `atualizado_em`).
- **Vínculo com o grupo de trabalho** — `equipe.ts`: `resolverPessoa` casa o nome do membro
  (curto) com uma entrada da equipe, por vínculo manual ou pelo `nomesCompativeis` existente
  ("Wilton" ⊂ "Wilton Bortolleto"). O casamento automático **já vale** (selo "automático" na
  tabela), sem gravar nada; `vinculos` guarda só os overrides manuais e o "não vincular".
- **Sync** — `equipeGestora` viaja no payload de estado do grupo (`configuracoes.json` fica
  fora do `data_dir()` sincronizado); adota a recebida quando o `atualizado_em` é mais novo.
- **Consumidores** — ATA flexiona a direção pelo gênero da equipe ("Direção" / "a direção"
  quando "não informar"); PEI resolve @menção e o select de direção pelo roster; Kanban mostra
  o nome completo do responsável.
- **Fora**: perfis de uso / permissões; concordância de gênero no relatório do assistente
  (o texto não cita o coordenador hoje).

## Fora deste ciclo

- Padrão de conteúdo 1d completo só em Instituição; as demais seções recebem o cabeçalho novo
  mas mantêm o corpo atual.
- "Modelos de relatório" e "Parâmetros de execução" (mudança 1c) — nunca existiram em
  Configurações; o handoff previa que iam surgir lá e propõe que nasçam no Construtor de
  Relatórios. Sem construtor ainda, nada a migrar.
- "Filtros de fila salvos" — a feature de salvar filtro nunca foi implementada.

## Verificação

- `tsc` + `vite build` limpos; 134 testes Rust passam.
- Conferido no dev server (tema claro e escuro): nav, busca + dropdown, Visão geral, cabeçalho
  de seção, Instituição 1d, modal "Gerenciar modelos".
- Conferido no app nativo com dados reais (claro e escuro): Visão geral com o estado real de
  cada seção, busca que casa campo + Enter que navega e rola até o ponto, Instituição no
  padrão 1d com a miniatura da ATA, Sincronização fundida, e o modal "Gerenciar modelos" —
  editar um título, Salvar e reabrir confirmou que `salvar_modelos_mensagem` persiste
  (fluxo end-to-end OK).
