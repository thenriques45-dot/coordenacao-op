# Plano de implementação — Tela de Atendimentos

Base: `design_handoff_atendimentos/` (README + `Atendimentos.dc.html` + screenshots).
Escopo aprovado: **todas as 13 telas** (1a–1f, 2a–2e, 3a). Várias sessões / commits.

## Decisões de produto fechadas
| Questão | Decisão |
|---|---|
| Aba "Atendimentos" na ficha do aluno | **Mantém o formulário completo**; a tela nova é um 2º caminho para o mesmo dado. Adicionar só um link discreto "Abrir na tela de Atendimentos". |
| Ordem "Mais urgente primeiro" (3a) | Maior nº de condições atendidas; desempate pela menor frequência. |
| Teto da fila assistida wa.me (2a) | **Teto rígido de 40 por sessão.** Acima disso, sugerir quebrar em sessões ou usar a API. |
| Status aberto/resolvido | Não existe. Pendência = `followup_previsto` em aberto. |
| API não configurada | Controles ocultos; só link "Ativar envio automático". |

## Arquitetura atual (referência)
- **Front:** React+TS (Vite+Tauri). Telas em `modern-ui/src/features/`, roteadas por `tela` em `App.tsx` (`NavButton` na sidebar + render condicional). Estilos em `styles.css` (tokens `--surface`, `--border`… ; dark via classe `.theme-dark`, **sem hex literal no dark**). Dados via `invokeApp(cmd, args)` (`appBridge.ts`).
- **Atendimentos hoje:** aba dentro de `ClassManagement.tsx` (`AlunoDetalheGestao`), tipo `AtendimentoAluno` = `id, data, tipos[], atendido, tags[], descricao, anexos[], followups[], criado_em, atualizado_em`. Compositor wa.me em `SecaoResponsavel` (`enviarPeloWhatsapp` → `wa.me/{num}?text=` → confirm → grava atendimento "Contato com a família" + assinatura de rastreio).
- **Back:** `turmas.rs::salvar_atendimento_aluno(caminho, matricula, AtendimentoAlunoInput, bimestre) -> TurmaDetalhe`; `AtendimentoAlunoInput` em `tipos.rs:563`. `carregar_turma(caminho, bimestre) -> TurmaDetalhe` (alunos com `atendimentos` e `responsaveis`). Merge por id em `sync.rs::mesclar_atendimentos` / `mesclar_atendimento` (corpo vence por `atualizado_em`; followups unidos por id). Tipos por turma + templates em `config.rs` (`atendimento_tipos`, `mensagem_familia_templates`, `TIPO_ATENDIMENTO_CONTATO_FAMILIA`). `resolver_variaveis_mensagem` em `mensagem_familia.rs`. Vocabulário de campos/operadores do motor de relatórios em `motorRelatorios/tipos.ts` + `motor_relatorios/` (Rust).
- **Comandos** registrados em `main.rs` `invoke_handler![…]`.

---

## Fase 0 — Modelo de dados + fundação backend
Bloqueia todas as demais. Sem UI nova (ou mínima).

### Campos novos em `AtendimentoAluno` / `AtendimentoAlunoInput`
| Campo | Tipo | Notas |
|---|---|---|
| `canal` | `"manual" \| "wa_me" \| "api"` | default `"manual"` na leitura de registros antigos |
| `lote_id` | `string?` | liga ao histórico de disparos |
| `modelo_id` | `string?` | qual template gerou a mensagem |
| `atendido_nome` | `string?` | nome quando `atendido` é `responsavel`/`outro` (hoje só existe `atendido`) |
| `followup_previsto` | `{ data: string, descricao: string } \| null` | o "follow-up combinado"; substitui status. `null` ao registrar desfecho |

- `atendido`: passar a aceitar `"outro"` além de `"aluno"`/`"responsavel"` (validação em `turmas.rs:618`).
- `montar_registro` grava os campos novos. Derivado `sem_retorno` (canal wa_me/api + sem follow-up + > N dias) calculado no front, não persistido.
- `sync.rs`: campos escalares novos viajam no corpo do registro (já vence por `atualizado_em`) — **adicionar teste**. `followup_previsto` é sub-objeto do corpo → ok.

### Entidade **Disparo em lote** (nova)
Array `disparos_lote` no JSON da turma. Merge por id em `sync.rs::mesclar_disparos_lote` (novo; corpo vence por `atualizado_em`, `enviados`/`pulados`/`falhas` do lado mais recente).
Campos: `id, data_hora, modelo_id, canal, turma, destinatarios[] ({matricula, responsavel_nome, telefone}), enviados, pulados, falhas[] ({matricula, destinatario, motivo, codigo_meta?}), situacao ("em_progresso"|"pausada"|"concluida"|"concluida_pulados"|"pendencias"), custo, posicao_atual (fila assistida), criado_em, atualizado_em`.

### Entidade **Filtro salvo** (nova)
`turmaConfig.atendimento_filtros_salvos: [{ id, nome, combinador: "todas"|"qualquer", condicoes: [{campo, operador, valor}] }]`. Entra em `config.rs` (input + leitura + `salvar_config`), sem merge especial (config já sincroniza por campo).

### Credenciais da API (só nesta máquina — **não sincroniza**)
Novo módulo `whatsapp_api.rs`. Guardar em arquivo na pasta de dados do app (padrão de `github_oauth.rs`/keychain). Comandos:
- `carregar_config_whatsapp_api -> { configurada, ativo, phone_number_id, waba_id, tem_token, limite_dia, uso_hoje, status: "ativo"|"desligado"|"token_invalido" }`
- `salvar_config_whatsapp_api({ phone_number_id, waba_id, token })`
- `testar_conexao_whatsapp_api -> Result<numero_formatado, msg>`
- `desativar_whatsapp_api`
- `enviar_mensagem_whatsapp_api({ phone, template, componentes }) -> Result<{ id_meta }, { codigo, msg }>`

### Comandos de apoio
- `avaliar_condicoes_atendimento_lote({ caminho, combinador, condicoes[] }) -> [{ matricula, nome, responsavel, telefone?, frequencia, tarefas_pendentes, ultimo_contato_dias?, valores_por_campo, entra: bool, condicoes_atendidas: n }]` — reaproveita o motor de campos.
- `resolver_variaveis_mensagem_lote({ caminho, matriculas[], modelo_id, bimestre }) -> [{ matricula, texto, variaveis_sem_dado[] }]`.
- Leitura da tela: reutilizar `carregar_turma`.

---

## Fase 1 — Item de menu + Lista (1a) + estado vazio
- `App.tsx`: novo `Tela` `"atendimentos"`; `NavButton` (`MessageCircle`) entre **Turmas** e **Importar Dados**; pílula vermelha com contagem de follow-ups pendentes (soma de `followup_previsto` em aberto nas turmas carregadas).
- Novo arquivo `modern-ui/src/features/Atendimentos.tsx` — `TelaAtendimentos({ turmas, bimestre, mensagemTemplates, onNavegar })`.
  - Header: título 26px, subtítulo com contagens, seletor de turma (chip), botão secundário "Contatar famílias", primário "Novo atendimento".
  - Abas: **Atendimentos · Por aluno · Disparos em lote** (só a 1ª nesta fase).
  - Barra de filtros (busca livre, Tipo, Período, Canal, Tag, toggle "Follow-up pendente · N").
  - Tabela densa (colunas `96 | 1.15fr | 1.5fr | 150 | 132 | 96 | 120 | 40`, linha 60px) — Data, Aluno (nome + `Mat. · turma`), Tipos (selos; "Contato com a família" em acento), Atendido (`Aluno`/`Responsável · nome`/`Outro · nome`), Canal (selo `Manual`/`wa.me`/`wa.me · lote`/`API oficial`), Thread (ícone + nº followups; vermelho se `followup_previsto` aberto; `—` se vazio), Atualizado (relativo), chevron.
  - Rodapé: "Mostrando X de Y" + paginação.
  - Dados: `carregar_turma(caminho, bimestre)` → achatar `alunos[].atendimentos[]` em linhas.
  - Estado vazio "Turma sem nenhum atendimento" (2e-1).
- `styles.css`: classes novas com tokens; bloco `.theme-dark` correspondente (sem hex).

## Fase 2 — Criar atendimento (1c) + detalhe/thread (1b) + follow-up combinado
- Modal 1c (660px, abas Detalhes/Anexos): reaproveita a lógica do form atual de `ClassManagement`. Campos: Data · Quem foi atendido (segmentado: aluno/Responsável/Outro → campo de nome) · Tipos (chips de `turmaConfig.atendimento_tipos`) · Descrição · Tags (chips) · Anexos. Rodapé com nota "Follow-ups depois, na thread".
- Master-detail 1b (lista de cards `1fr` + painel 470px). Card: avatar iniciais, nome, selo de canal, data, 2 linhas de descrição (`line-clamp:2`), selos de tipo, resumo da thread. Filtros = pílulas de contagem (`Todos`, `Follow-up pendente`, `Sem retorno`, `Contato com a família`, `Disciplinar`).
- Painel de prévia = detalhe do atendimento: cabeçalho (aluno + frequência + tarefas pendentes), ações "Follow-up"/"Nova mensagem"/menu; timeline (marcador 26px + trilho 2px): **Registro inicial** (caixa `--surface-subtle`; assinatura de rastreio wa.me separada por borda tracejada), **Follow-up**, **Follow-up combinado** (marcador tracejado acento, data prevista, botão "Registrar desfecho" → limpa `followup_previsto` e grava follow-up de desfecho).
- Alternador de densidade 1a⇄1b.
- `App.tsx`: estender `onSalvarAtendimento` para carregar `canal`, `modelo_id`, `atendido_nome`, `followup_previsto`.

## Fase 3 — Compositor individual (1d)
- Extrair de `ClassManagement.tsx` para módulo compartilhado `features/mensagemFamilia.tsx`: `montarSegmentosMensagem`, `EditorMensagemChips`, `resolverChip`, helpers de telefone, fluxo `enviarPeloWhatsapp`.
- Modal 940×740, grade `1fr | 400px`. Esquerda: **1 Destinatário** (card por responsável, até 2; sem telefone → `opacity .7` + "Cadastrar"), **2 Modelo** (select + tags + link Configurações), **3 Variáveis** (grade 2col; variável sem dado ocupa 2 colunas em bloco de atenção com campo + "Remover trecho"). Direita: prévia em bolha WhatsApp (`--bolha-msg`), contador de caracteres, nota.
- Rodapé: "Abrir no WhatsApp e registrar" (44px) · "Copiar texto" · `Envio automático desligado` + "Ativar envio automático" → Configurações 2d.
- Grava atendimento `canal:"wa_me"`, `modelo_id`, tipo "Contato com a família", assinatura de rastreio. Texto de confirmação deixa explícito que o app não sabe se foi enviado.
- Acessível de 1b/1f ("Nova mensagem") e da ficha do aluno.

## Fase 4 — Modo família / aba "Por aluno" (1f)
- Grade `320 | 1fr`. Lista de alunos (contagem de contatos + estado: "último há Nd" / "sem retorno" / "sem telefone").
- Direita: cabeçalho do aluno (indicadores) + responsáveis em cards (nome, parentesco, telefone) + ações "Nova mensagem" / "Abrir ficha do aluno".
- Histórico de contato com a família (timeline `74 data | 26 marcador | 1fr`), filtro Tudo / Só mensagens / Só presencial. Ícone do marcador = meio (WhatsApp / telefone / presencial — inferido de `canal` + tipos/tags).

## Fase 5 — Configurações: envio automático (2d)
- Nova seção (em **Sistema**, pois "vale só nesta máquina"). Estados: **Desligado** (form: Phone Number ID, WABA ID, Token com olho; nota de armazenamento local; ações "Como obter", "Testar conexão", "Salvar e ativar"); **Ativo** (número, limite 250/dia + uso do dia, "Desativar"); **Token inválido** (acento, frase "O envio automático foi desligado. A fila assistida continua funcionando.", "Atualizar token").
- Liga em `whatsapp_api.rs` (Fase 0).

## Fase 6 — Montagem da fila (3a) — substitui passo 2 de 1e
- Trilho de passos (Modelo ✓ · Destinatários · Enviar). Grade `396 | 1fr` + rodapé.
- **Filtros prontos**: chips com contagem (Com tarefa pendente, Frequência < 75%, Sem acesso há 7 dias, Disciplina abaixo da média). Chip inativo `+` → vira condição na lista (chip passa a ✓ acento). Faixa **Meus filtros** (conjuntos salvos).
- **Condições**: segmented `Todas / Qualquer uma` + frase natural. Linha `[alça] Se|E · campo ▾ · operador ▾ · valor · x` sobre `--surface-subtle`. **Sem `EditorExpressao`.** Campos: Tarefas pendentes, Frequência (%), Média global, Média por disciplina, Faltas no período, Último contato com a família, Dias sem acesso à plataforma, Tipo de atendimento anterior, Tag. Operadores: numérico (`é maior que`/`é menor que`/`está entre`), data (`há mais de`/`há menos de`), texto/lista (`é`/`não é`/`contém`). "Adicionar condição". Rodapé: contador ao vivo ("N alunos"), "Salvar como filtro", "Limpar".
- **Fila** (direita): contagem selecionada + "+N na mão", **Ordem** (Mais urgente primeiro = mais condições atendidas, desempate menor frequência / Alfabética / Menor frequência / Contato mais antigo / Personalizada), "Adicionar aluno". Faixa de dica (arrastar → "Personalizada"). Linhas 52px (`22 alça | 22 check | 1.3fr aluno | 108 freq | 120 tarefas | 140 último contato | 30 menu`). Valor que justificou a entrada com bolinha semântica **+ número**. Sem telefone: `opacity .62`, checkbox off, motivo no lugar do responsável. Arrastar + alternativa por teclado / menu ("mover p/ cima/baixo").
- Rodapé: "N pelas condições + M na mão · K fora por falta de telefone" + "Voltar ao modelo" + "Continuar · Z destinatários".
- Backend: `avaliar_condicoes_atendimento_lote` (Fase 0).

## Fase 7 — Escolha de canal (de 1e) + fila assistida (2a)
- Passo 3: cartões **Fila assistida no WhatsApp** (grátis, selo "Recomendado", estimativa 15s/envio, pausar/retomar, atalho Enter, **teto 40**) e **Envio automático** (oculto se API não configurada; custo R$ 0,04/msg, limite 250/dia + uso, botão escuro "Confirmar e disparar N").
- 2a: header fixo (modelo, barra de progresso `--accent` sobre `--divider` 8px, "N enviados · M pulados · K restantes", ETA, "Pausar", "Sair e retomar depois"). Card central (borda acento): destinatário atual (aluno, "X de Y", responsável + telefone, selo variável sem dado), prévia completa em bolha, ações **"Abrir no WhatsApp"** · **"Enviei · próximo"** (`Enter`) · **"Pular"** (`→`); `Esc` = pausar — atalhos impressos. Aviso de ritmo. Coluna direita 340px: fila com estado por item + nota "cada Enviei grava um atendimento 'Contato com a família'".
- Cada "Enviei" grava atendimento `canal:"wa_me"`, `lote_id`, `modelo_id`. Progresso persistido no Disparo em lote (`posicao_atual`, situação `pausada`) para retomar entre sessões.

## Fase 8 — Lote via API (2b) + aba "Disparos em lote" (2c) + estados restantes (2e)
- 2b **Em progresso**: selo, modelo aprovado, total + custo estimado, barra escura, "X de Y", aceitos/falhas/na fila, aviso "cancelar não desfaz o cobrado", "Cancelar envio".
- 2b **Concluído**: selo de pendências, data/hora, custo cobrado real, 4 cartões-resumo (enviados / falhas / sem WhatsApp / sem telefone), tabela de falhas (`1.1fr | 1fr | 1.3fr | 190`) — Aluno, Destinatário, **Motivo** (linguagem natural + código Meta, ex. `Erro 131049 · limite de marketing`), **Ação** ("Tentar de novo" / "Enviar por wa.me" / "Registrar por telefone" / "Cadastrar telefone"). Topo: "Exportar relatório", "Tratar as N pendências".
- Loop `enviar_mensagem_whatsapp_api` com rate-limit + 250/dia; polling de status.
- 2c: tabela (`130 | 1.2fr | 150 | 110 | 96 | 96 | 130 | 130`, linha 58px) — Quando, Modelo, Canal (selo), Destinatários, Enviados, Falhas, Situação, ação. Situações: `Concluída`, `Concluída · N pulados`, `Pausada` (acento + "Retomar fila" → 2a), `N pendências` (âmbar + "Ver relatório" → 2b). Filtros Canal e Período. Linha pausada com fundo diferenciado.
- 2e restantes: **Aluno sem responsável** (bloco atenção + "Cadastrar responsável"/"Registrar sem mensagem"), **Sem internet** (lista ✓/✗ + texto), **Fila pausada · retomar** (modelo, quando parou, progresso, garantia de não reenviar, "Retomar fila"/"Descartar").

## Fase 9 — Integração ficha do aluno + acessibilidade + release
- Ficha do aluno (`ClassManagement`): mantém form completo; adicionar link discreto "Abrir na tela de Atendimentos" (thread do aluno). Garantir que os dois caminhos de gravação carregam `canal`.
- Acessibilidade: nenhum status só por cor (todo selo com texto; bolinhas sempre com número); alvos ≥ 32px (densos) / ≥ 38px (ação); foco visível (borda acento) em todos os campos; fila assistida navegável por teclado; arrastar em 3a com alternativa.
- Responsivo < 1280px: prévia de 1b colapsa em painel sobreposto; condições de 3a viram acordeão acima da fila. Largura mínima 1100px.
- `CHANGELOG.md` + `VERSION` + entrada em `NOVIDADES_POR_VERSAO` (`App.tsx`).

## Tokens CSS a criar (claro / dark) — ver README §"Tokens usados"
`--accent` `#e8202a`/`#c91a22` · `--accent-subtle` bg/border/text · `--sucesso` (canal wa.me) · `--atencao` (pendência) · `--api-oficial` (pago) · `--bolha-msg` (bolha WhatsApp) · `--divisor-linha`. Redefinir só os tokens no bloco `.theme-dark` (sem hex literal).

## Ordem de execução / dependências
```
Fase 0 ──┬── Fase 1 ── Fase 2 ── Fase 3 ── Fase 4
         ├── Fase 5 ──────────────┬── Fase 7 ── Fase 8
         └── Fase 6 ──────────────┘
Fase 9 depende de 1–8.
```
