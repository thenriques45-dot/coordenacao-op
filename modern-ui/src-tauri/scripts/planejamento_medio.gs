/**
 * FORMULÁRIO DE PLANEJAMENTO DOCENTE — ENSINO MÉDIO
 * Secretaria de Educação do Estado de São Paulo
 *
 * COMO USAR:
 * 1. Acesse script.google.com e crie um novo projeto ou abra o script existente
 * 2. Cole todo este código no editor
 * 3. Para atualizar um Forms já criado, preencha ID_FORMULARIO_EXISTENTE
 * 4. Clique em "Executar" (▶) na função criarFormulario
 * 5. Autorize as permissões solicitadas
 * 6. O link do Forms atualizado aparecerá no Log (Ctrl+Enter)
 *
 * COMPONENTES COM ESCOPO COMPLETO (Guia do Currículo Priorizado — EM):
 *   Arte ........... 1ª série (1º/2º bim)
 *   Biologia ....... 1ª e 2ª séries (1º/2º bim)
 *   Educação Física  1ª série (1º/2º bim, 14 aulas); 2ª e 3ª séries (1º/2º bim, 7 aulas)
 *   Filosofia ...... 1ª série (1º/2º bim)
 *   Física ......... 1ª, 2ª e 3ª séries (1º/2º bim)
 *   Geografia ...... 1ª e 2ª séries (1º/2º bim)
 *   História ....... 1ª, 2ª e 3ª séries (1º/2º bim)
 *   Inglês ......... 1ª e 2ª séries (1º/2º bim; aulas Plataforma EF consolidadas)
 *   Língua Portuguesa  1ª, 2ª e 3ª séries (1º/2º bim, 28 aulas)
 *   Matemática ..... 1ª, 2ª e 3ª séries (1º/2º bim, 28 aulas)
 *   Química ........ 1ª e 2ª séries (1º/2º bim)
 *   Sociologia ..... 2ª série (1º/2º bim)
 * COMPONENTES SEM CURRÍCULO PRIORIZADO (campo de texto livre):
 *                                   Orientação de Estudo em Língua Portuguesa
 *                                   Orientação de Estudo em Matemática
 *
 * PARA ADICIONAR NOVOS ESCOPOS:
 * Localize o objeto ESCOPOS_POR_COMPONENTE e siga o padrão dos componentes
 * já preenchidos (chave = "Xª Série — Nº Bimestre", valor = array de strings).
 */

const ID_FORMULARIO_EXISTENTE = "1E7Yi4ucUaX3Qtl4ezd3zFq90zt-zmuRJWT7FRk2ESwc";

function obterFormulario_() {
  if (
    ID_FORMULARIO_EXISTENTE &&
    ID_FORMULARIO_EXISTENTE !== "COLE_AQUI_O_ID_DO_FORMULARIO"
  ) {
    return FormApp.openById(ID_FORMULARIO_EXISTENTE);
  }

  return FormApp.create("Planejamento Docente — Ensino Médio");
}

function limparItensFormulario_(form) {
  var itens = form.getItems();

  itens.forEach(function(item) {
    try {
      if (item.getType() === FormApp.ItemType.PAGE_BREAK) {
        item.asPageBreakItem().setGoToPage(FormApp.PageNavigationType.CONTINUE);
      }
    } catch (erro) {
      Logger.log("Não foi possível limpar navegação de uma seção: " + erro);
    }
  });

  itens.forEach(function(item) {
    try {
      if (item.getType() === FormApp.ItemType.LIST) {
        item.asListItem().setChoiceValues(["Temporário"]);
      } else if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
        item.asMultipleChoiceItem().setChoiceValues(["Temporário"]);
      } else if (item.getType() === FormApp.ItemType.CHECKBOX) {
        item.asCheckboxItem().setChoiceValues(["Temporário"]);
      }
    } catch (erro) {
      Logger.log("Não foi possível limpar alternativas de um item: " + erro);
    }
  });

  itens = form.getItems();
  for (var i = itens.length - 1; i >= 0; i--) {
    form.deleteItem(itens[i]);
  }
}

function criarFormulario() {

  // ─── DADOS DO ESCOPO-SEQUÊNCIA ────────────────────────────────────────────

  const ESCOPOS_POR_COMPONENTE = {

    // ══════════════════════════════════════════════════════════════════════
    // FILOSOFIA  (Guia do Currículo Priorizado — EM — Filosofia)
    // ══════════════════════════════════════════════════════════════════════
    "Filosofia": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Por que filosofia? | A filosofia e a formação para a cidadania (AE1 | EM13CHS101)",
        "Aula 2 — Origens da filosofia | As origens da filosofia; hipóteses sobre o nascimento da filosofia (AE1 | EM13CHS101)",
        "Aula 3 — Atitude filosófica: a exigência pela argumentação | O diálogo como forma de expressão; argumentação nos diálogos filosóficos (AE1 | EM13CHS101)",
        "Aula 4 — A atitude filosófica: a análise dos argumentos | Lógica e discurso argumentativo; falácias formais e informais (AE1 | EM13CHS101)",
        "Aula 5 — Mito e Filosofia | A narrativa mitológica e o discurso filosófico (AE1 | EM13CHS101)",
        "Aula 6 — Períodos da História da Filosofia | Períodos da história da Filosofia (AE1 | EM13CHS101)",
        "Aula 7 — Campos de investigação da Filosofia | Campos de investigação da Filosofia (AE1 | EM13CHS101)",
        "Aula 8 — Escola de Atenas | Filosofia de Platão e Aristóteles na obra Escola de Atenas (AE1 | EM13CHS101)",
        "Aula 9 — A arte pode motivar a reflexão filosófica? | A arte como objeto da reflexão; Estética como campo filosófico (AE2 | EM13CHS104)",
        "Aula 10 — O belo, o feio e o gosto | Os conceitos fundamentais da Estética (AE2 | EM13CHS104)",
        "Aula 11 — A atitude crítica | O conceito de crítica; a atitude crítica em filosofia (AE2 | EM13CHS104)",
        "Aula 12 — Breves considerações sobre a reflexão estética | Reflexão filosófica e experiência estética (AE2 | EM13CHS104)",
        "Aula 13 — A arte em diálogo com o mundo contemporâneo | A produção de significados e a reflexão estética (AE2 | EM13CHS104)",
        "Aula 14 — Análise crítica de obra de arte | Organização e produção de uma análise crítica (AE2 | EM13CHS104)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Desafios éticos nas relações intergeracionais | Estereótipos geracionais; etarismo; valores éticos (AE3 | EM13CHS205)",
        "Aula 2 — Diálogo e responsabilidade entre gerações | Convívio intergeracional; Estatutos (ECA, Juventude, Pessoa Idosa) (AE3 | EM13CHS205)",
        "Aula 3 — O olhar do outro nas relações intergeracionais | A noção de olhar do outro segundo Sartre (AE3 | EM13CHS205)",
        "Aula 4 — Aula desafio: campanha relações intergeracionais | Protagonismo juvenil; produção de campanha escolar (AE3 | EM13CHS205)",
        "Aula 5 — Contribuições do pensamento filosófico para a análise da violência | Filosofia da violência: Hannah Arendt (AE4 | EM13CHS503)",
        "Aula 6 — A ideia de dignidade humana como princípio fundamental dos Direitos Humanos | Pico della Mirandola e Kant; dignidade humana e Constituição (AE4 | EM13CHS503)",
        "Aula 7 — O republicanismo e sua relação com a democracia e os direitos humanos | Liberdade republicana; virtudes cívicas (AE4 | EM13CHS503)",
        "Aula 8 — Autoritarismo e desigualdade como desafios à democracia e aos Direitos Humanos | Ética da alteridade de Lévinas (AE4 | EM13CHS503)",
        "Aula 9 — [Complementar] Filosofia e desafios contemporâneos à Democracia | Síntese dos temas anteriores (EM13CHS503)",
        "Aula 10 — Quais são as condições da legitimidade do poder soberano? | O problema filosófico do poder soberano (AE5 | EM13CHS603)",
        "Aula 11 — Teoria do direito divino e contratualismo | Direito divino ao poder; contrato social de Hobbes (AE5 | EM13CHS603)",
        "Aula 12 — O papel do Estado e a liberdade individual | Contratualismo de Locke; liberalismo (AE5 | EM13CHS603)",
        "Aula 13 — Vontade geral e soberania popular | Contratualismo de Rousseau; soberania popular (AE5 | EM13CHS603)",
        "Aula 14 — [Complementar] Um olhar da atualidade para o contratualismo clássico | Legado de Hobbes, Locke e Rousseau (EM13CHS603)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "2ª Série — 2º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "2ª Série — 3º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "2ª Série — 4º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 1º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 2º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 3º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 4º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
    },

    // ══════════════════════════════════════════════════════════════════════
    // BIOLOGIA  (Guia do Currículo Priorizado — EM — Biologia)
    // ══════════════════════════════════════════════════════════════════════
    "Biologia": {
      // ── 1ª SÉRIE ─────────────────────────────────────────────────────
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Fluxo de energia: cadeias e teias alimentares | Fatores bióticos e abióticos; cadeias e teias alimentares; nicho ecológico (AE1 | EM13CNT101)",
        "Aula 2 — Fluxo de energia: níveis tróficos | Pirâmides ecológicas (AE1 | EM13CNT101)",
        "Aula 3 — Fluxo de matéria e energia: sucessão ecológica | Comunidade biológica; fluxo de matéria e energia; sucessão ecológica (AE1 | EM13CNT101)",
        "Aula 4 — Biomas terrestres brasileiros | Biomas terrestres brasileiros (AE1 | EM13CNT101)",
        "Aula 5 — Metabolismo energético: fotossíntese | Conceitos básicos da fotossíntese; metabolismo energético (AE1 | EM13CNT101)",
        "Aula 6 — Metabolismo energético: respiração celular | Conceitos básicos da respiração celular (AE1 | EM13CNT101)",
        "Aula 7 — Situações do cotidiano relacionadas à respiração celular | Respiração celular aplicada (AE1 | EM13CNT101)",
        "Aula 8 — Fotossíntese e respiração celular | Comparação: processos, reagentes e produtos (AE1 | EM13CNT101)",
        "Aula 9 — Ameaças ao equilíbrio do ecossistema | Equilíbrio sistêmico; relações ecológicas; fatores abióticos (AE1 | EM13CNT101)",
        "Aula 10 — Ações antrópicas que afetam os ecossistemas brasileiros | Ação antrópica; degradação ambiental; impactos (AE1 | EM13CNT101)",
        "Aula 11 — Soluções para ameaças ao equilíbrio do ecossistema | Reflorestamento; agroecologia; compensação ambiental (AE1 | EM13CNT101)",
        "Aula 12 — Energia limpa e sustentável | Biocombustíveis; biomassa; ODS 7 (AE1 | EM13CNT101)",
        "Aula 13 — Ecologia | Biosfera, população, comunidade, hábitat, nicho ecológico (AE1 | EM13CNT101)",
        "Aula 14 — O jogo dos quatis: aplicando conceitos de ecologia | Aplicação dos conceitos básicos de ecologia (AE1 | EM13CNT101)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Efeito estufa: manutenção da vida | Efeito estufa; composição da atmosfera (AE2 | EM13CNT102)",
        "Aula 2 — Eventos climáticos extremos | Tempo e clima; aquecimento global; mudanças climáticas (AE2 | EM13CNT102)",
        "Aula 3 — Educação para Redução de Riscos e Desastres (ERRD) | Riscos de desastres (AE2 | EM13CNT102)",
        "Aula 4 — Matriz energética: fontes renováveis | Fontes renováveis; impactos (AE3 | EM13CNT106)",
        "Aula 5 — Matriz energética: fontes não renováveis | Fontes não renováveis; impactos (AE3 | EM13CNT106)",
        "Aula 6 — [Aula desafio] O que está aquecendo nosso planeta? | Impactos antrópicos no ambiente (AE2 | EM13CNT303)",
        "Aula 7 — [Aula desafio] Divulgação científica e letramento climático | Mudanças climáticas; elaboração de hipóteses (AE2 | EM13CNT301)",
        "Aula 8 — Tipos de poluição | Tipos de poluição; consequências no ar e na água; saneamento básico (AE4 | EM13CNT306)",
        "Aula 9 — Impactos da poluição nos sistemas fisiológicos: visão | Sistema fisiológico — visão (AE4 | EM13CNT306)",
        "Aula 10 — Impactos da poluição nos sistemas fisiológicos: audição | Sistema fisiológico — audição (AE4 | EM13CNT306)",
        "Aula 11 — Sistema respiratório | Anatomia e fisiologia do sistema respiratório (AE4 | EM13CNT306)",
        "Aula 12 — Sistema cardiovascular | Anatomia e fisiologia do sistema cardiovascular (AE4 | EM13CNT306)",
        "Aula 13 — [Complementar] Impactos da poluição nos sistemas respiratório e cardiovascular | (EM13CNT306)",
        "Aula 14 — [Complementar] Biomateriais: a ciência dos materiais | Biomateriais; propriedades físicas e químicas (EM13CNT306)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      // ── 2ª SÉRIE ─────────────────────────────────────────────────────
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Radiação: potencialidades e riscos | Aplicação da radiação em diagnóstico e tratamento (AE1 | EM13CNT103)",
        "Aula 2 — Radiação solar | Radiação ultravioleta; efeitos da radiação no DNA (AE1 | EM13CNT103)",
        "Aula 3 — Mitose e câncer | Mitose; relação entre mitose e câncer (AE2 | EM13CNT103)",
        "Aula 4 — Meiose | Meiose; gametogênese humana (AE2 | EM13CNT103)",
        "Aula 5 — Impactos da intervenção humana | Desmatamento; queimadas; mudanças climáticas (AE3 | EM13CNT203)",
        "Aula 6 — Mineração | Mineração; impactos no ecossistema e na população (AE3 | EM13CNT203)",
        "Aula 7 — Monocultura | Monocultura; impactos no clima e na população (AE3 | EM13CNT203)",
        "Aula 8 — Ações de intervenção para mitigar impactos associando-os aos ODS | Desmatamento; queimadas; mineração; monocultura (AE3 | EM13CNT203)",
        "Aula 9 — Crises: hídrica e elétrica | Rios voadores; consequências das crises hídrica e elétrica (AE3 | EM13CNT203)",
        "Aula 10 — Zoonoses | Definição de zoonoses; ciclo zoonótico; medidas profiláticas (AE3 | EM13CNT203)",
        "Aula 11 — Áreas de Preservação Permanente | APP; bioma Cerrado; serviços ecossistêmicos (AE3 | EM13CNT203)",
        "Aula 12 — Perda de hábitat e interações entre os seres vivos | Perda de hábitat; corredores ecológicos (AE3 | EM13CNT203)",
        "Aula 13 — Áreas verdes urbanas | Função ecológica das áreas verdes urbanas (AE3 | EM13CNT203)",
        "Aula 14 — Revitalização de área verde urbana degradada | Projeto de revitalização ambiental (AE3 | EM13CNT203)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Preservação e conservação | Efeito de borda; preservação e conservação; ciência cidadã (AE3 | EM13CNT206)",
        "Aula 2 — Unidades de Conservação | Unidades de conservação; biodiversidade (AE3 | EM13CNT206)",
        "Aula 3 — Bioacumulação | Bioacumulação; bioconcentração; biomagnificação; bioindicadores (AE4 | EM13CNT104)",
        "Aula 4 — Defensivos agrícolas | Defensivos agrícolas; bioacumulação trófica; descarte de resíduos (AE4 | EM13CNT104)",
        "Aula 5 — Polinização e controle biológico | Polinização; relações ecológicas; controle biológico (AE4 | EM13CNT104)",
        "Aula 6 — [Aula desafio] O caso do vírus Machupo | Alteração em cadeias alimentares; biomagnificação (AE3 | EM13CNT301)",
        "Aula 7 — [Aula desafio] Alterações ambientais e saúde no caso do vírus Machupo | Relação ambiente e doenças; profilaxia (AE3 | EM13CNT301)",
        "Aula 8 — Comparando vírus e células: estrutura e características essenciais | Capsídeo; material genético; parasita intracelular (AE3 | EM13CNT206)",
        "Aula 9 — Organismos geneticamente modificados são transgênicos? | OGM; transgênicos; biossegurança (AE5 | EM13CNT206)",
        "Aula 10 — Transgênicos: o que precisamos saber sobre eles? | Transgênicos; transgenes; melhoramento genético; bioética (AE5 | EM13CNT206)",
        "Aula 11 — Biossegurança e diversidade genética | Diversidade genética; biodiversidade; bioética e biossegurança (AE5 | EM13CNT206)",
        "Aula 12 — Manipulação genética e biodiversidade | Manipulação genética; riscos da perda da biodiversidade (AE5 | EM13CNT206)",
        "Aula 13 — [Complementar] Hábitos de consumo | Microplástico; ODS 12; consumo sustentável (EM13CNT309)",
        "Aula 14 — [Complementar] Greenwashing: nem tudo é o que parece | Greenwashing; consumo sustentável (EM13CNT309)",
      ],
      "2ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "3ª Série — 1º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 2º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 3º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 4º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
    },

    // ══════════════════════════════════════════════════════════════════════
    // COMPONENTES SEM CURRÍCULO PRIORIZADO — campo de texto livre
    // ══════════════════════════════════════════════════════════════════════
    "Orientação de Estudo em Língua Portuguesa": { "semCurriculo": true },
    "Orientação de Estudo em Matemática":         { "semCurriculo": true },

    // ══════════════════════════════════════════════════════════════════════
    // DEMAIS COMPONENTES — adicione os dados conforme receber os PDFs
    // ══════════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════
    // ARTE  (Guia do Currículo Priorizado — EM — Arte)
    // ══════════════════════════════════════════════════════════════════════
    "Arte": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Arte, Poder e Sociedade | Função Social da Arte; Cultura Contemporânea; Processo Criativo (AE1 | EM13LGG103)",
        "Aula 2 — Corpo, Identidade e Gesto Social | Linguagens Artísticas; Danças Sociais; Expressão Identitária (AE3 | EM13LGG102)",
        "Aula 3 — Desconstruindo Estereótipos | Artes do Corpo; Linguagens Artísticas; Estereótipos Sociais (AE2 | EM13LGG201)",
        "Aula 4 — Os Discursos das Mídias: Planejar! | Arte e Mídia; Análise Crítica; Função Social da Arte (AE1 | EM13LGG103)",
        "Aula 5 — Os Discursos das Mídias: Recriar! | Arte e Mídia; Função Social da Arte; Processo Criativo (AE2 | EM13LGG201)",
        "Aula 6 — Música e Crítica Social | Criação Musical; Manifestação Artística; Cultura Contemporânea (AE2 | EM13LGG201)",
        "Aula 7 — Construindo Intervenções | Criação Musical; Manifestação Artística; Cultura Contemporânea (AE3 | EM13LGG102)",
        "Aula 8 — Refinando as Propostas | Discurso Crítico; Crítica de Arte; Criação Artística (AE3 | EM13LGG102)",
        "Aula 9 — Criando uma Performance | Performatividade; Intervenção Artística; Manifestação Artística (AE3 | EM13LGG102)",
        "Aula 10 — Experimentando performances | Criação Artística; Intervenção Artística; Manifestação Artística (AE1 | EM13LGG103)",
        "Aula 11 — Experimentando performances II | Criação Artística; Intervenção Artística; Manifestação Artística (AE2 | EM13LGG201)",
        "Aula 12 — Reelaborando as performances | Criação Artística; Crítica de Arte; Manifestação Artística (AE3 | EM13LGG102)",
        "Aula 13 — Reelaborando as performances II | Criação Artística; Crítica de Arte; Manifestação Artística (AE3 | EM13LGG102)",
        "Aula 14 — Reflexão Final: Arte para ser no mundo | Linguagens Artísticas; Cultura Contemporânea; Expressão Artística (AE1 | EM13LGG103)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — A Arte no Espírito do Tempo | Patrimônio Cultural; Pesquisa em arte; Análise histórica e cultural (AE4 | EM13LGG305)",
        "Aula 2 — A Arte do Manifesto Artístico | Manifestos coletivos; Movimentos artísticos; Processos criativos (AE5 | EM13LGG301)",
        "Aula 3 — Os Desafios de Criar Junto | Coletivos artísticos; Movimentos artísticos; Pesquisa em Arte (AE5 | EM13LGG301)",
        "Aula 4 — A Arte de Promover Impacto | Coletivos artísticos; Movimentos artísticos; Pesquisa em Arte (AE5 | EM13LGG301)",
        "Aula 5 — A Pesquisa Estética | Manifesto artístico; Estética Relacional; Processo colaborativo (AE4 | EM13LGG305)",
        "Aula 6 — Processos Colaborativos: Criando junto! | Processos de criação; Movimentos artísticos; Processo Colaborativo (AE5 | EM13LGG301)",
        "Aula 7 — Nasce um Movimento: Nosso manifesto | Manifesto artístico; Impacto cultural; Processo colaborativo (AE4 | EM13LGG305)",
        "Aula 8 — Cooperando em Criações Individuais | Processos de criação; Movimentos artísticos; Compartilhamento de Práticas (AE4 | EM13LGG305)",
        "Aula 9 — Nosso Projeto Coletivo | Processos de criação; Arte colaborativa; Movimentos artísticos (AE5 | EM13LGG301)",
        "Aula 10 — Um Movimento Vivo! | Processos de criação; Processos colaborativos; Movimentos artísticos (AE4 | EM13LGG305)",
        "Aula 11 — Construindo os Projetos: Fortalecendo o Coletivo | Processos de criação; Processos colaborativos; Movimentos artísticos (AE5 | EM13LGG301)",
        "Aula 12 — Apresentando o Movimento | Processos de criação; Processos colaborativos; Movimentos artísticos (AE4 | EM13LGG305)",
        "Aula 13 — Expandindo o Movimento | Processos de criação; Processos colaborativos; Movimentos artísticos (AE5 | EM13LGG301)",
        "Aula 14 — Espírito do Tempo: A Era da Participação | Contexto Histórico e Cultural; Zeitgeist; Movimentos artísticos (AE4 | EM13LGG305)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "2ª Série — 2º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 1º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
      "3ª Série — 2º Bimestre": ["[Aguardando dados — adicione as aulas no script]"],
    },
    // ══════════════════════════════════════════════════════════════════════
    // EDUCAÇÃO FÍSICA  (Guia do Currículo Priorizado — EM — Educação Física)
    // ══════════════════════════════════════════════════════════════════════
    "Educação Física": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Esporte de invasão: As várias caras do Futebol | Futebol como prática democrática; campo, society, futsal, fútbol callejero (AE1 | EM13LGG102)",
        "Aula 2 — Futebol de Campo adaptado | Futebol de campo adaptado ao espaço escolar (AE1 | EM13LGG102)",
        "Aula 3 — Partida de Futebol de Campo | Prática do futebol de campo adaptado (AE1 | EM13LGG102)",
        "Aula 4 — Futebol Society adaptado | Futebol society adaptado ao espaço escolar (AE1 | EM13LGG102)",
        "Aula 5 — Partida de Futebol Society | Prática do futebol society (AE1 | EM13LGG102)",
        "Aula 6 — Brincando de futsal | Jogos pré-desportivos do futsal (AE1 | EM13LGG102)",
        "Aula 7 — Avançando nos fundamentos do Futsal | Exercícios coletivos: fundamentos do futsal (AE1 | EM13LGG102)",
        "Aula 8 — Uma partida de Futsal | Prática do Futsal (AE1 | EM13LGG102)",
        "Aula 9 — Conhecendo o Fútbol Callejero | Regras, objetivos e vivências do fútbol callejero (AE1 | EM13LGG102)",
        "Aula 10 — Vivenciando o Fútbol Callejero | Prática do fútbol callejero (AE1 | EM13LGG102)",
        "Aula 11 — Meu Futebol predileto | Vivência de um futebol elencado pela turma (AE1 | EM13LGG102)",
        "Aula 12 — Esporte Paralímpico: Goalball | História dos esportes paralímpicos; modalidades; goalball (AE2 | EM13LGG305)",
        "Aula 13 — Goalball: inclusão, cultura e atuação social | Goalball adaptado ao espaço escolar (AE2 | EM13LGG305)",
        "Aula 14 — Vivenciando o Goalball | Prática do goalball (AE2 | EM13LGG305)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Esporte de invasão ou territorial: Rugby e Futebol americano | Surgimento, fundamentos e regras (AE3 | EM13LGG403)",
        "Aula 2 — Aprendendo a jogar Rugby | Regras e possíveis adaptações do Rugby (AE3 | EM13LGG403)",
        "Aula 3 — Exercícios de Rugby | Desenvolvimento técnico e condicionamento físico (AE3 | EM13LGG403)",
        "Aula 4 — Partida de Rugby | Prática do Rugby (AE3 | EM13LGG403)",
        "Aula 5 — Aprendendo a jogar Futebol Americano | Regras e possíveis adaptações do futebol americano (AE3 | EM13LGG403)",
        "Aula 6 — Treino de Futebol Americano | Exercícios de preparação física e treinamento técnico (AE3 | EM13LGG403)",
        "Aula 7 — Partida de Futebol Americano | Prática do futebol americano (AE3 | EM13LGG403)",
        "Aula 8 — Explorando Danças do Brasil e do Mundo | Samba de roda; carnaval; ballet; dança contemporânea (AE4 | EM13LGG201)",
        "Aula 9 — Samba de Roda: Música e Ritmo | Musicalidade, ritmo e expressão corporal (AE4 | EM13LGG201)",
        "Aula 10 — Samba de Roda: Passo a Passo | Passos básicos: ginga, miudinho e trança (AE4 | EM13LGG201)",
        "Aula 11 — Carnaval na Escola | Simulação de um desfile de escola de samba (AE4 | EM13LGG201)",
        "Aula 12 — Ballet | Posições e movimentos básicos do Ballet (AE4 | EM13LGG201)",
        "Aula 13 — Dança contemporânea | Exploração livre de movimentos e improvisação guiada (AE4 | EM13LGG201)",
        "Aula 14 — Dança contemporânea: criação coletiva | Criação coletiva para dança contemporânea (AE4 | EM13LGG201)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Esporte de Rede/quadra dividida: Tênis de mesa e Tênis de campo | Diferenças, fundamentos e regras (AE1 | EM13LGG301)",
        "Aula 2 — Fundamentos do Tênis de Mesa | Postura, saque, recepção, golpes e empunhadura (AE1 | EM13LGG301)",
        "Aula 3 — Arbitragem no Tênis de Mesa | Regras e arbitragem (AE1 | EM13LGG301)",
        "Aula 4 — Tênis de mesa ou Ping-Pong? | Diferença entre ping-pong e tênis de mesa (AE1 | EM13LGG301)",
        "Aula 5 — Fundamentos do Tênis de Campo | Postura, saque, recepção, golpes e empunhadura (AE1 | EM13LGG301)",
        "Aula 6 — Arbitragem no Tênis de Campo | Regras e arbitragem (AE1 | EM13LGG301)",
        "Aula 7 — Tênis de Campo adaptado | Jogo de tênis adaptado ao espaço escolar (AE1 | EM13LGG301)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Danças circulares, Dabke e Fandango | História e origem; chegada ao Brasil; contexto cultural (AE2 | EM13LGG203)",
        "Aula 2 — Danças circulares: primeiro contato | Ritmo, musicalidade e diversidade cultural (AE2 | EM13LGG203)",
        "Aula 3 — A prática das danças circulares | Formação do círculo e passos básicos (AE2 | EM13LGG203)",
        "Aula 4 — Dabke: primeiro contato | Ritmo, musicalidade e relevância cultural (AE2 | EM13LGG203)",
        "Aula 5 — Roda de Dabke | Formação e passos na roda (AE2 | EM13LGG203)",
        "Aula 6 — Fandango: primeiro contato | Ritmo, musicalidade e olhar cultural (AE2 | EM13LGG203)",
        "Aula 7 — Fandango em pares | Formação, passo de base, passo cruzado e giro (AE2 | EM13LGG203)",
      ],
      "3ª Série — 1º Bimestre": [
        "Aula 1 — Modalidades Esportivas Pouco Praticadas no Brasil | Punhobol; Kin-Ball; Tchoukball; Ultimate Frisbee (AE1 | EM13LGG401)",
        "Aula 2 — Aprendendo a jogar Punhobol e/ou Kimball | Regras e possíveis adaptações (AE1 | EM13LGG401)",
        "Aula 3 — Partida de Punhobol e/ou Kimball | Prática do Punhobol e/ou Kimball (AE1 | EM13LGG401)",
        "Aula 4 — Aprendendo a jogar Tchoukball | Regras e possíveis adaptações do Tchoukball (AE1 | EM13LGG401)",
        "Aula 5 — Partida de Tchoukball | Prática do Tchoukball (AE1 | EM13LGG401)",
        "Aula 6 — Aprendendo a jogar Ultimate Frisbee | Regras e possíveis adaptações do Ultimate Frisbee (AE1 | EM13LGG401)",
        "Aula 7 — Partida de Ultimate Frisbee | Prática do Ultimate Frisbee (AE1 | EM13LGG401)",
      ],
      "3ª Série — 2º Bimestre": [
        "Aula 1 — Esportes de quadra de areia | Vôlei de praia; Futevôlei; Beach tennis; Frescobol (AE2 | EM13LGG301)",
        "Aula 2 — Vôlei de praia adaptado | Regras, possíveis adaptações e prática (AE2 | EM13LGG301)",
        "Aula 3 — Futevôlei: primeiro contato | Regras e possíveis adaptações do Futevôlei (AE2 | EM13LGG301)",
        "Aula 4 — Futevôlei: vivência | Prática de Futevôlei (AE2 | EM13LGG301)",
        "Aula 5 — Beach tennis adaptado | Regras, possíveis adaptações e prática do Beach tennis (AE2 | EM13LGG301)",
        "Aula 6 — Frescobol: primeiro contato | Regras e possíveis adaptações do Frescobol (AE2 | EM13LGG301)",
        "Aula 7 — Frescobol: vivência | Prática de Frescobol (AE2 | EM13LGG301)",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // FÍSICA  (Guia do Currículo Priorizado — EM — Física)
    // ══════════════════════════════════════════════════════════════════════
    "Física": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Movimento e Repouso: Tudo é uma questão de referencial | Conceitos iniciais para a descrição do movimento (AE1 | EM13CNT204)",
        "Aula 2 — A simplicidade da função horária do MRU | Função horária e representações gráficas do MRU (AE1 | EM13CNT204)",
        "Aula 3 — Movimento Uniforme: Do cálculo à interpretação | MRU em representações gráficas e equações (AE1 | EM13CNT204)",
        "Aula 4 — Equações do MRUV: Além da velocidade constante | Equações horárias do MRUV e equação de Torricelli (AE1 | EM13CNT204)",
        "Aula 5 — MRUV: Da teoria à prática de resolução de problemas | MRUV: cálculos com análise gráfica (AE1 | EM13CNT204)",
        "Aula 6 — Movimentos Verticais: Governados pela gravidade | Queda livre e lançamento vertical: descrição do movimento (AE1 | EM13CNT204)",
        "Aula 7 — Movimentos Verticais: Da queda ao lançamento | Queda livre e lançamento vertical: problemas e representações gráficas (AE1 | EM13CNT204)",
        "Aula 8 — Lançamentos no Plano: Além da trajetória retilínea | Movimento horizontal e oblíquo: decomposição e grandezas (AE1 | EM13CNT204)",
        "Aula 9 — Movimento Circular Uniforme: Entre rotações e transmissões | Movimento Circular Uniforme (AE1 | EM13CNT204)",
        "Aula 10 — Movimento Circular Uniforme: Hora de resolver problemas | MCU: acoplamento de polias (AE1 | EM13CNT204)",
        "Aula 11 — Força e suas Medidas: Entendendo grandezas escalares e vetoriais | Grandezas escalares e vetoriais; representação gráfica de vetores (AE2 | EM13CNT204)",
        "Aula 12 — Operações com vetores na Física | Adição, subtração, multiplicação por escalar e decomposição (AE2 | EM13CNT204)",
        "Aula 13 — Inércia: de Aristóteles a Newton | Primeira Lei de Newton: inércia (AE2 | EM13CNT204)",
        "Aula 14 — Movimento sem esforço? Resolvendo problemas sobre inércia | Primeira Lei de Newton: resolução de problemas (AE2 | EM13CNT204)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Segunda Lei de Newton: Quando a força muda o movimento | Relação entre força resultante, massa e aceleração (AE2 | EM13CNT204)",
        "Aula 2 — Terceira Lei de Newton: ação e reação | Pares de forças ação-reação entre corpos (AE2 | EM13CNT204)",
        "Aula 3 — No toque ou à distância: Como as forças se manifestam? | Forças de contato e forças de campo (AE2 | EM13CNT204)",
        "Aula 4 — Deslizando sem atrito: Ação das forças de contato | Forças de contato em blocos sem atrito (AE2 | EM13CNT204)",
        "Aula 5 — Menos força, mais distância: analisando as polias | Movimento de blocos e tração em cordas com polias (AE2 | EM13CNT204)",
        "Aula 6 — Quando escorregar não é uma opção: O papel do atrito estático | Força de atrito estático (AE2 | EM13CNT204)",
        "Aula 7 — Escorregou? O atrito alivia! | Força de atrito dinâmico (AE2 | EM13CNT204)",
        "Aula 8 — A mola que resiste: Entendendo a força elástica | Força elástica e deformação (AE2 | EM13CNT204)",
        "Aula 9 — Plano inclinado: a Física das rampas | Força peso e decomposição em plano inclinado (AE2 | EM13CNT204)",
        "Aula 10 — Nem toda força realiza trabalho | Relação entre força e deslocamento; trabalho (AE3 | EM13CNT101)",
        "Aula 11 — Teorema da energia cinética: Além das forças constantes | Trabalho de forças inclinadas e energia cinética (AE3 | EM13CNT101)",
        "Aula 12 — [Complementar] Energia cinética e trabalho: Aplicações e estratégias de resolução | Trabalho de forças inclinadas e energia cinética (EM13CNT101)",
        "Aula 13 — Forças conservativas e não conservativas: Impactos na energia mecânica | Forças conservativas e não conservativas (AE3 | EM13CNT101)",
        "Aula 14 — [Complementar] Trabalho de forças conservativas e não conservativas | Forças conservativas e não conservativas (EM13CNT101)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Traduzindo a agitação das partículas em números: Compreendendo a temperatura | Calor, temperatura e relações com a matéria (AE1 | EM13CNT102)",
        "Aula 2 — Resolvendo problemas de temperatura | Escalas termométricas e variação de temperatura (AE1 | EM13CNT102)",
        "Aula 3 — Entre graus e milímetros: prevendo a mudança nas dimensões dos sólidos | Dilatação térmica dos sólidos (AE1 | EM13CNT102)",
        "Aula 4 — Expandir para entender: a diferença de temperatura nos materiais sólidos | Cálculo e aplicações da dilatação térmica em sólidos (AE1 | EM13CNT102)",
        "Aula 5 — Quando o calor eleva a temperatura: Entendendo o calor sensível | Calor sensível e capacidade térmica (AE1 | EM13CNT102)",
        "Aula 6 — Mudança de fase: O calor que não aumenta a temperatura | Calor latente, mudanças de estado e trocas de calor (AE1 | EM13CNT102)",
        "Aula 7 — Da condução à radiação: Entendendo a propagação do calor | Formas de propagação do calor (AE1 | EM13CNT102)",
        "Aula 8 — Do gelo ao vapor: Investigando calor sensível e latente | Trocas de calor com variação de temperatura e mudança de fase (AE1 | EM13CNT102)",
        "Aula 9 — Isotérmica, isobárica, isométrica — Qual é a diferença? | Transformações dos gases ideais e suas leis (AE1 | EM13CNT102)",
        "Aula 10 — Leis dos gases em prática: De seringas a panelas de pressão | Pressão, volume e temperatura dos gases ideais (AE1 | EM13CNT102)",
        "Aula 11 — Clapeyron em contexto: Variáveis de estado na prática | Lei geral dos gases; comportamento dos gases ideais (AE1 | EM13CNT102)",
        "Aula 12 — Clapeyron na prática: Investigando o comportamento dos gases | Aplicações da Lei Geral dos Gases (AE1 | EM13CNT102)",
        "Aula 13 — Modelo do Gás Perfeito: Da Teoria às Aplicações | Modelo do gás perfeito; energia cinética das moléculas (AE1 | EM13CNT102)",
        "Aula 14 — Atividades de revisão: Modelo do Gás Perfeito | Modelo do gás perfeito; energia interna do gás (AE1 | EM13CNT102)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Introdução a Termodinâmica | Energia interna, trabalho e calor (AE2 | EM13CNT102)",
        "Aula 2 — A conservação da Energia: Primeira Lei da Termodinâmica | Primeira Lei da Termodinâmica (AE2 | EM13CNT102)",
        "Aula 3 — Processos Termodinâmicos Particulares | Primeira Lei em diferentes transformações gasosas (AE2 | EM13CNT102)",
        "Aula 4 — Ciclos Termodinâmicos | Primeira Lei em transformações cíclicas (AE2 | EM13CNT102)",
        "Aula 5 — 1ª Lei da Termodinâmica: Exercícios propostos | Primeira Lei da Termodinâmica (AE2 | EM13CNT102)",
        "Aula 6 — Calores específicos dos gases perfeitos | Calor específico a pressão e a volume constante (AE2 | EM13CNT102)",
        "Aula 7 — Rendimento das máquinas térmicas: Do calor ao trabalho útil | Máquinas térmicas e a Segunda Lei da Termodinâmica (AE2 | EM13CNT102)",
        "Aula 8 — Da isotérmica à adiabática: Etapas e rendimento do Ciclo de Carnot | Ciclo de Carnot, rendimento e limite de eficiência (AE2 | EM13CNT102)",
        "Aula 9 — [Aula desafio] Motor Stirling - Passado e Presente | Contexto histórico sobre o motor Stirling (EM13CNT102)",
        "Aula 10 — [Aula desafio] Possibilidade para os carros elétricos | Motor Stirling como possível gerador para carros elétricos (EM13CNT102)",
        "Aula 11 — Da fonte fria à quente: O caminho do calor no refrigerador | Funcionamento e princípios termodinâmicos dos refrigeradores (AE2 | EM13CNT102)",
        "Aula 12 — Do rendimento das máquinas térmicas à eficiência dos refrigeradores | Rendimento de máquinas térmicas e eficiência dos refrigeradores (AE2 | EM13CNT102)",
        "Aula 13 — [Complementar] Da compressão à combustão: Exercícios do Ciclo Otto | Etapas, diagrama PV e rendimento do Ciclo Otto (AE2 | EM13CNT102)",
        "Aula 14 — [Complementar] Relações termodinâmicas no Ciclo Otto | Etapas do Ciclo Otto e cálculo de rendimento (AE2 | EM13CNT102)",
      ],
      "3ª Série — 1º Bimestre": [
        "Aula 1 — Quando o condutor encontra o equilíbrio | Carga elétrica, condutores e isolantes, eletrização (AE1 | EM13CNT107)",
        "Aula 2 — Da eletrização à conservação da carga elétrica: Problemas propostos | Eletrização e conservação da carga elétrica (AE1 | EM13CNT107)",
        "Aula 3 — Força elétrica vs. gravidade: O padrão do inverso do quadrado | Lei de Coulomb (AE1 | EM13CNT107)",
        "Aula 4 — A força elétrica e o inverso do quadrado da distância: exercícios com a Lei de Coulomb | Lei de Coulomb (AE1 | EM13CNT107)",
        "Aula 5 — Representando o campo elétrico: Definição, cálculo e linhas de força | Vetor campo elétrico (AE1 | EM13CNT107)",
        "Aula 6 — Resolvendo problemas de campo elétrico | Vetor campo elétrico de cargas pontuais (AE1 | EM13CNT107)",
        "Aula 7 — Quando os campos se encontram: O princípio da superposição | Princípio da superposição de campos (AE1 | EM13CNT107)",
        "Aula 8 — Resolvendo problemas com a superposição de campos elétricos | Princípio da superposição de campos (AE1 | EM13CNT107)",
        "Aula 9 — Quando o campo não basta: O papel do potencial elétrico | Potencial elétrico de cargas pontuais (AE1 | EM13CNT107)",
        "Aula 10 — Resolvendo problemas de potencial elétrico | Potencial elétrico e trabalho da força elétrica (AE1 | EM13CNT107)",
        "Aula 11 — Conservação da energia mecânica: Só uma parte da história | Energia mecânica e forças não conservativas (EM13CNT101)",
        "Aula 12 — Teorema da Energia Cinética: Aplicações em exercícios | Teorema da Energia Cinética (EM13CNT101)",
        "Aula 13 — Resolver para Entender: Exercícios sobre Movimento Retilíneo Uniforme | MRU: velocidade constante e gráficos (EM13CNT204)",
        "Aula 14 — Entre equações e gráficos: Exercícios de MRUV | Equações horárias e gráficos do MRUV (EM13CNT204)",
      ],
      "3ª Série — 2º Bimestre": [
        "Aula 1 — Do real ao convencional: Entendendo o sentido da corrente elétrica | Corrente elétrica: definição, intensidade e sentidos (AE2 | EM13CNT107)",
        "Aula 2 — Da Lei de Ohm ao efeito Joule | Primeira Lei de Ohm (AE2 | EM13CNT107)",
        "Aula 3 — Entre o linear e o não linear | Resistores ôhmicos e não ôhmicos; Primeira Lei de Ohm (AE2 | EM13CNT107)",
        "Aula 4 — Custo e consumo de energia elétrica | Potência elétrica; consumo de energia (AE2 | EM13CNT107)",
        "Aula 5 — Do Watt ao Real: Potência, consumo e custo na energia elétrica | Potência elétrica e custo da energia (AE2 | EM13CNT107)",
        "Aula 6 — Um só caminho para a corrente: Entendendo resistores em série | Resistores associados em série (AE2 | EM13CNT107)",
        "Aula 7 — Vários caminhos, mesma DDP: Entendendo resistores em paralelo | Resistores associados em paralelo (AE2 | EM13CNT107)",
        "Aula 8 — Resistores em paralelo: A soma que diminui | Resistores associados em paralelo (AE2 | EM13CNT107)",
        "Aula 9 — Do simples ao composto: analisando associações mistas de resistores | Associação mista de resistores (AE2 | EM13CNT107)",
        "Aula 10 — Resistência elétrica e as dimensões do fio | Segunda Lei de Ohm; influência da temperatura na resistividade (AE2 | EM13CNT107)",
        "Aula 11 — Quando forças agem rápido: Impulso e quantidade de movimento | Impulso, quantidade de movimento e teorema do impulso (EM13CNT101)",
        "Aula 12 — Espelhos planos e reflexão da luz: análise e prática | Reflexão da luz e leis da reflexão em espelhos planos (EM13CNT306)",
        "Aula 13 — [Complementar] Espelhos esféricos: identificando raios e construindo imagens | Trajetória de raios e imagens em espelhos esféricos (EM13CNT306)",
        "Aula 14 — [Complementar] Da equação de Gauss ao aumento linear: problemas ópticos | Equação de Gauss e aumento linear transversal (EM13CNT306)",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // GEOGRAFIA  (Guia do Currículo Priorizado — EM — Geografia)
    // ══════════════════════════════════════════════════════════════════════
    "Geografia": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Climatologia e meteorologia | Diferenças entre climatologia e meteorologia; tempo e clima (AE1 | EM13CHS304)",
        "Aula 2 — Atmosfera | Camadas da atmosfera; circulação geral da atmosfera (AE1 | EM13CHS304)",
        "Aula 3 — Elementos e controles climáticos | Elementos e controles climáticos (AE1 | EM13CHS304)",
        "Aula 4 — Climograma | Elementos de um climograma; biomas associados (AE1 | EM13CHS304)",
        "Aula 5 — Elaboração de climogramas | Climogramas de diferentes regiões do mundo (AE1 | EM13CHS304)",
        "Aula 6 — Recursos hídricos | Distribuição da água na Terra; bacia hidrográfica (AE2 | EM13CHS103)",
        "Aula 7 — Gestão sustentável dos recursos hídricos | Políticas públicas e práticas de gestão sustentável (AE2 | EM13CHS206)",
        "Aula 8 — Relevo | Processos endógenos e exógenos de formação do relevo (AE2 | EM13CHS103)",
        "Aula 9 — Relevo e ocupação humana | Regiões geomorfológicas do Brasil; relevo e ocupação (AE1 | EM13CHS304)",
        "Aula 10 — Riscos geológicos | Processos de degradação do relevo; riscos e desastres (AE1 | EM13CHS304)",
        "Aula 11 — Prevenção e mitigação de impactos | Prevenção e mitigação de desastres relacionados ao relevo (AE1 | EM13CHS304)",
        "Aula 12 — Principais biomas do planeta Terra | Conceito de bioma; principais biomas da Terra (AE2 | EM13CHS103)",
        "Aula 13 — Biomas do estado de São Paulo | Biomas do estado de São Paulo (AE2 | EM13CHS103)",
        "Aula 14 — Sistema Nacional de Unidades de Conservação (SNUC) | SNUC; unidades de conservação no Brasil (AE1 | EM13CHS304)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Principais elementos dos mapas | Cartografia; elementos dos mapas; projeções cartográficas (AE3 | EM13CHS106)",
        "Aula 2 — Mapas qualitativos e quantitativos | Cartografia temática (AE3 | EM13CHS106)",
        "Aula 3 — Cartografia tátil | Cartografia tátil (AE3 | EM13CHS106)",
        "Aula 4 — Elaboração de mapas táteis | Criação de produtos cartográficos (AE3 | EM13CHS106)",
        "Aula 5 — Sensoriamento remoto | Definição e origens do sensoriamento remoto (AE3 | EM13CHS106)",
        "Aula 6 — Sistema de Informações Geográficas (SIG) | Definição, histórico e evolução do SIG (AE3 | EM13CHS106)",
        "Aula 7 — Produção de mapas temáticos | Produção de mapas por geoprocessamento (AE3 | EM13CHS106)",
        "Aula 8 — Globalização | Conceito de globalização e seus impactos (AE4 | EM13CHS404)",
        "Aula 9 — Cadeias produtivas | Conceito de produção; cadeias produtivas (AE5 | EM13CHS302)",
        "Aula 10 — [Complementar] Impactos da globalização na produção | Impactos ambientais e sociais da produção (EM13CHS304)",
        "Aula 11 — Indústria 4.0 e automação | Indústria 4.0 e automação (AE1 | EM13CHS304)",
        "Aula 12 — Blocos econômicos | Regionalismos e blocos econômicos (AE6 | EM13CHS306)",
        "Aula 13 — [Complementar] Sociedade de consumo | Sociedade de consumo (EM13CHS502)",
        "Aula 14 — Globalização e impacto na cultura | Globalização cultural; homogeneização cultural (AE6 | EM13CHS303)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Demografia | Conceitos de demografia; transição demográfica (AE1 | EM13CHS205)",
        "Aula 2 — Demografia brasileira | Dados e características da população brasileira (AE1 | EM13CHS205)",
        "Aula 3 — Pesquisas demográficas | Demografia da comunidade escolar (AE1 | EM13CHS205)",
        "Aula 4 — Demografia da comunidade escolar | Organização e apresentação dos dados da escola (AE1 | EM13CHS205)",
        "Aula 5 — Economia do Brasil | Evolução da economia brasileira (séculos XVIII, XIX e XX) (AE2 | EM13CHS201)",
        "Aula 6 — O Brasil na economia mundial | Economia brasileira atual; PIB; papel do Brasil no mundo (AE3 | EM13CHS606)",
        "Aula 7 — Brasil: indicadores socioeconômicos | Indicadores socioeconômicos do Brasil (AE3 | EM13CHS606)",
        "Aula 8 — Desigualdade socioeconômica | Desigualdade e distribuição de renda no Brasil (AE3 | EM13CHS402)",
        "Aula 9 — O trabalho no Brasil | Mercado de trabalho; direitos e reformas trabalhistas (AE3 | EM13CHS403)",
        "Aula 10 — Estado, nação e território | Conceitos de Estado, nação e território (AE4 | EM13CHS203)",
        "Aula 11 — Formação dos Estados e das nações no mundo | Estado moderno; formação das nações (AE4 | EM13CHS203)",
        "Aula 12 — Povos sem Estado | Povos sem Estado; conflitos por autonomia ou reconhecimento (AE4 | EM13CHS203)",
        "Aula 13 — Conflitos territoriais e geopolítica contemporânea | Conflitos territoriais atuais; papel da ONU (AE4 | EM13CHS203)",
        "Aula 14 — Identidade, pertencimento e território | Territorialidade e identidade; diásporas (AE4 | EM13CHS203)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — A expansão da urbanização no Brasil ao longo dos séculos | Urbanização no Brasil (AE5 | EM13CHS203)",
        "Aula 2 — Impactos socioambientais da urbanização | Impactos socioambientais do processo de urbanização (AE5 | EM13CHS203)",
        "Aula 3 — Urbanização mundial | Processo de urbanização mundial (AE5 | EM13CHS203)",
        "Aula 4 — Urbanização acelerada | Megacidades e metrópoles globais (AE5 | EM13CHS203)",
        "Aula 5 — Problemas urbanos e desigualdades socioespaciais | Problemas urbanos e desigualdades socioespaciais (AE5 | EM13CHS203)",
        "Aula 6 — Desafios contemporâneos das cidades | Smart cities; sustentabilidade e bem-estar urbano (AE4 | EM13CHS105)",
        "Aula 7 — Transformações e Contrastes no Espaço Agrário Brasileiro | Espaço agrário brasileiro; modelos de produção rural (AE6 | EM13CHS203)",
        "Aula 8 — Modelos agrícolas em contraste | Contrastes dos modelos agrícolas (AE6 | EM13CHS203)",
        "Aula 9 — A ONU e os Desafios do Cenário Agrário Mundial | Papel da ONU no espaço agrário (AE6 | EM13CHS203)",
        "Aula 10 — O Agronegócio e a Expansão das Novas Fronteiras Agrícolas | Agronegócio e novas fronteiras agrícolas (AE6 | EM13CHS203)",
        "Aula 11 — [Complementar] Pesquisa e cenário agrícola | Pesquisa e cenário agrícola (EM13CHS203)",
        "Aula 12 — [Complementar] O Brasil no cenário agrícola | O Brasil no cenário agrícola (EM13CHS203)",
        "Aula 13 — Territórios Indígenas | Territórios indígenas: importância cultural, social e geográfica (AE4 | EM13CHS106)",
        "Aula 14 — Demarcações dos territórios indígenas | Demarcações de territórios; marco temporal (AE4 | EM13CHS106)",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // HISTÓRIA  (Guia do Currículo Priorizado — EM — História)
    // ══════════════════════════════════════════════════════════════════════
    "História": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — A produção do conhecimento histórico: o ofício do historiador | Conhecimento histórico; fontes; narrativa historiográfica (AE1 | EM13CHS101)",
        "Aula 2 — A memória evanescente: o que é lembrado e o que é esquecido | Narrativas e sentidos de passados; tipologias de fontes (AE1 | EM13CHS101)",
        "Aula 3 — Um começo para tudo: como conhecer as origens da humanidade? | Conhecimento interdisciplinar; cultura material; crítica à Pré-história (AE1 | EM13CHS101)",
        "Aula 4 — A história antes da escrita: vestígios materiais | Arqueologia; sociedades pré-escrita; cultura material (AE1 | EM13CHS101)",
        "Aula 5 — Teorias, evidências e a reescrita da história: o povoamento da América | Povoamento do continente americano; arqueologia; Niède Guidon (AE2 | EM13CHS106)",
        "Aula 6 — Os rastros do espaço natural brasileiro: Sambaquieiros e a Serra da Capivara | Sítios arqueológicos; etnologia; sambaquis (AE2 | EM13CHS106)",
        "Aula 7 — Povos pré-cabralinos da Amazônia: a natureza e os objetos que contam histórias | Arqueologia brasileira; terra preta; cerâmica amazônica (AE2 | EM13CHS106)",
        "Aula 8 — Índices e sinais: as principais sociedades indígenas mesoamericanas | Cultura material; sociedades indígenas mesoamericanas (AE2 | EM13CHS106)",
        "Aula 9 — Vestígios urbanos: a constituição das mais antigas cidades (Parte I) | Sedentarização; primeiras cidades: Uruk, Çatal Hüyük, Jericó (AE3 | EM13CHS206)",
        "Aula 10 — Vestígios urbanos: a constituição das mais antigas cidades (Parte II) | Mohenjo-Daro, Harapa, Caral-Supe (AE3 | EM13CHS206)",
        "Aula 11 — Os usos do espaço nas cidades: semelhanças e diferenças | Comparação das primeiras cidades da Antiguidade (AE3 | EM13CHS206)",
        "Aula 12 — Egito e Kush: as diferentes Áfricas | Egito e Reino de Kush (Núbia) (AE3 | EM13CHS206)",
        "Aula 13 — Ur, Uruk e Nipur: o desenvolvimento urbano na Mesopotâmia | Processos civilizatórios; Mesopotâmia (AE3 | EM13CHS206)",
        "Aula 14 — De Ur a Canaã: os Hebreus e a Terra Prometida | Hebreus; diáspora; territorialidades (AE3 | EM13CHS206)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Cidades-Estado na Antiguidade: a política e a identidade das pólis gregas | Grécia: do oîkos às pólis; legado clássico (AE3 | EM13CHS206)",
        "Aula 2 — As Guerras Médicas e do Peloponeso e suas consequências para a Grécia | Guerra do Peloponeso; fontes históricas (AE3 | EM13CHS206)",
        "Aula 3 — Narrativas da história: Tucídides conta a história | Fontes históricas; relatos de Tucídides (AE3 | EM13CHS206)",
        "Aula 4 — Bárbaros e Gregos: a Conquista Macedônica e o Legado Helênico | Império Macedônico; cultura helênica (AE3 | EM13CHS105)",
        "Aula 5 — A Formação da Roma Antiga | Roma Antiga; Monarquia; fontes históricas (AE3 | EM13CHS206)",
        "Aula 6 — A República Romana e seus espaços públicos | Monarquia e República Romana (AE3 | EM13CHS206)",
        "Aula 7 — Construindo o Império Romano: Civilização x Bárbaros e Conquistas Territoriais | Império Romano; conquistas; escravidão (AE3 | EM13CHS105)",
        "Aula 8 — [Complementar] Bárbaros e Civilizados: a permanência dos conceitos de Civilização e barbárie | Grécia e Roma; história conceitual (EM13CHS105)",
        "Aula 9 — Estrutura feudal: ruralização da Europa e a vida do servo | Ruralização; feudalismo; senhores e servos (AE3 | EM13CHS206)",
        "Aula 10 — A Idade Média: periodização, Cruzadas e historiografia | Alta e Baixa Idade Média; Cruzadas (AE3 | EM13CHS206)",
        "Aula 11 — [Aula desafio] O Império Romano continua (no Oriente): a estrutura social e a arte do Império Bizantino | Estrutura social bizantina; Igreja de Santa Sofia (AE3 | EM13CHS206)",
        "Aula 12 — Renascimento e Revolução Científica: conceitos, desafios e transformações artísticas | Renascimento; Revolução Científica; Renascimento nas artes (AE4 | EM13CHS105)",
        "Aula 13 — [Complementar] Humanismo e estética no Renascimento: análise de obras como fontes históricas | Artistas renascentistas; humanismo (EM13CHS105)",
        "Aula 14 — Reforma protestante e contrarreforma: quebra e continuidade da Igreja Católica | Reforma Protestante; Contrarreforma (AE4 | EM13CHS203)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — As abomináveis ideias francesas: o Iluminismo e as bases da sociedade burguesa | Iluminismo; liberalismo; contrato social; fim do Antigo Regime (AE1 | EM13CHS605)",
        "Aula 2 — Revolução Francesa: de súditos a cidadãos | Revolução Francesa; Declaração de Direitos do Homem e do Cidadão (1789) (AE1 | EM13CHS605)",
        "Aula 3 — Marchemos, marchemos: avante cidadãos! | Assembleia Constituinte; Convenção; Diretório (AE1 | EM13CHS605)",
        "Aula 4 — O Período Napoleônico: da consolidação das conquistas burguesas à reação conservadora | Período Napoleônico; Congresso de Viena (1815) (AE1 | EM13CHS605)",
        "Aula 5 — E Pluribus Unum: Nós, o povo dos Estados Unidos? | Independência dos EUA; federalismo; cidadania (AE1 | EM13CHS605)",
        "Aula 6 — Os ecos da Revolução Francesa no Caribe: São Domingos e o jacobinismo negro | Insurreição dos escravizados; República negra no Haiti (AE1 | EM13CHS605)",
        "Aula 7 — Processos de independência da América Espanhola: quais os projetos de nação? | Independência da América Espanhola; projetos nacionais (AE2 | EM13CHS103)",
        "Aula 8 — Anticolonialismo na América Portuguesa: infidelidade ao rei! | Rebeliões; Conjuração Mineira e Baiana (1789-1798) (AE2 | EM13CHS103)",
        "Aula 9 — Uma corte ao mar: D. João VI e seu reino nos trópicos | Bloqueio Continental; abertura dos portos (1808); período joanino (AE2 | EM13CHS103)",
        "Aula 10 — A hora e a vez de Pedro: vai o pai, fica o filho! | Rebelião do Porto; Independência; conflitos regionais (AE2 | EM13CHS204)",
        "Aula 11 — Uma nação imaginada: o quadro Independência ou morte! | Iconografia; pintura histórica (AE2 | EM13CHS204)",
        "Aula 12 — O Império do Brasil: continuidades e rupturas das tradições políticas | Primeiro Reinado; Constituição de 1824; abdicação de Pedro I (AE3 | EM13CHS204)",
        "Aula 13 — Centralismo e autogoverno provincial: os antagonismos políticos do Período Regencial | Ato Adicional de 1834; rebeliões regenciais (AE3 | EM13CHS204)",
        "Aula 14 — Enfim, uma nação nos Trópicos! | Invenção da nação; romantismo e nacionalismo; Guerra do Paraguai (AE3 | EM13CHS204)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Segundo Reinado: uma abolição gradual? | Lei Eusébio de Queirós; Lei de Terras; abolição (AE3 | EM13CHS606)",
        "Aula 2 — Economia no Segundo Reinado: café e modernização conservadora | Economia cafeeira; modernização no Segundo Reinado (AE3 | EM13CHS606)",
        "Aula 3 — A Babel de imigrantes | Imigração; economia cafeeira; transição para a Primeira República (AE3 | EM13CHS606)",
        "Aula 4 — A imagem do Brasil na Primeira República: um retrato da exclusão | Desigualdade social e racial; teorias racialistas; branqueamento (AE4 | EM13CHS606)",
        "Aula 5 — Do outro lado residem os outros: questões sociais e agrárias no Brasil | Conflitos na Primeira República: Canudos (AE4 | EM13CHS606)",
        "Aula 6 — A guerra que veio de trem: qual o caminho da Brazil Railway Company? | Conflitos na Primeira República: Contestado (AE4 | EM13CHS606)",
        "Aula 7 — [Complementar] O Brasil do Sertão | Cangaço; coronelismo; Império e Primeira República (EM13CHS606)",
        "Aula 8 — Uma Paris Tropical: a modernização do Rio de Janeiro via bota abaixo | Reforma urbana; favelização; políticas higienistas (AE4 | EM13CHS606)",
        "Aula 9 — A capital insalubre: higienismo e a Revolta da Vacina | Higienismo; Revolta da Vacina; exclusão e cidadania (AE4 | EM13CHS606)",
        "Aula 10 — Os povos indígenas e o papel do Estado republicano | Legislação indigenista; Marechal Rondon; SPI; FUNAI (AE4 | EM13CHS606)",
        "Aula 11 — A democracia racial e a negação do racismo no Brasil | Democracia racial; racismo no Brasil (AE5 | EM13CHS502)",
        "Aula 12 — Da Casa-grande ao mito da democracia racial | Gilberto Freyre; Casa-Grande & Senzala; Florestan Fernandes (AE5 | EM13CHS502)",
        "Aula 13 — [Complementar] O patriarcalismo no Brasil: a família, o açúcar e a violência da escravidão | Relações patriarcais; sociedade açucareira; escravidão (EM13CHS502)",
        "Aula 14 — Patrimonialismo: as raízes cordiais do Brasil | Patrimonialismo; Sérgio Buarque de Holanda: a cordialidade (AE5 | EM13CHS502)",
      ],
      "3ª Série — 1º Bimestre": [
        "Aula 1 — As sociedades do progresso: a segunda revolução industrial | Segunda Revolução Industrial; expansão industrial; transformações técnicas (AE1 | EM13CHS402)",
        "Aula 2 — A sociedade do trabalho: transformações técnicas e sociais | Imperialismo; transformações nas relações e condições de trabalho (AE1 | EM13CHS402)",
        "Aula 3 — A dominação europeia da África e Ásia: colônias, protetorados e áreas de influência | Expansão colonial; imperialismo; Conferência de Berlim (AE1 | EM13CHS102)",
        "Aula 4 — O fardo do homem branco: o etnocentrismo racista do século XIX | Imperialismo; cientificismo racialista; colonialidade (AE1 | EM13CHS102)",
        "Aula 5 — O futuro do passado: os avanços científicos a serviço da civilização | Transformações científicas; Exposições Universais (AE1 | EM13CHS102)",
        "Aula 6 — No loop da montanha russa: a ciência, o progresso e a guerra | Avanços da ciência; progresso e guerras mundiais (AE1 | EM13CHS504)",
        "Aula 7 — A Belle Époque e os valores liberais | Belle Époque; liberalismo excludente; avanços técnicos (AE1 | EM13CHS504)",
        "Aula 8 — Potências em conflito: a Grande Guerra | Rivalidades imperialistas; Primeira Guerra Mundial (AE1 | EM13CHS504)",
        "Aula 9 — Os desdobramentos da Primeira Guerra e acordos de paz | Fim da Primeira Guerra; Tratado de Versalhes (AE1 | EM13CHS504)",
        "Aula 10 — EUA nos anos 1920 e 1930: a prosperidade, a crise e a Grande Depressão | American way of life; crise de 1929 (AE1 | EM13CHS504)",
        "Aula 11 — O governo democrata e intervencionista de Roosevelt: o New Deal | New Deal; crise do capitalismo (AE1 | EM13CHS504)",
        "Aula 12 — A Rússia pré-revolucionária: o ensaio geral | Revoluções Russas; contexto pré-revolucionário (AE2 | EM13CHS504)",
        "Aula 13 — As Revoluções Russas | Revoluções Russas; fases e desdobramentos (AE2 | EM13CHS504)",
        "Aula 14 — Da Rússia socialista ao stalinismo | Revolução Russa; stalinismo (AE2 | EM13CHS504)",
      ],
      "3ª Série — 2º Bimestre": [
        "Aula 1 — Uma marcha sobre Roma: o fascismo no poder | Ascensão do fascismo; totalitarismo (AE3 | EM13CHS203)",
        "Aula 2 — Crise da democracia liberal: a ascensão do nazismo | Ascensão do nazismo; totalitarismo (AE3 | EM13CHS203)",
        "Aula 3 — O espaço vital: o expansionismo alemão e a 2ª Guerra Mundial | 2ª Guerra Mundial; expansionismo alemão (Lebensraum) (AE3 | EM13CHS203)",
        "Aula 4 — O Estado Nazista e a Volksgemeinschaft: a disseminação ideológica | Volksgemeinschaft; propaganda; concepção de Estado (AE3 | EM13CHS203)",
        "Aula 5 — O começo do fim: a ofensiva dos Aliados na Segunda Guerra Mundial | 2ª Guerra Mundial: desdobramentos finais (AE3 | EM13CHS203)",
        "Aula 6 — A negação do outro: a ideologia nazista | Racismo e antissemitismo; Noite dos Cristais (AE3 | EM13CHS503)",
        "Aula 7 — A banalidade do mal: a solução final e o Holocausto | Holocausto; Solução Final (AE3 | EM13CHS503)",
        "Aula 8 — [Complementar] O conflito judaico-palestino: do imperialismo à criação do Estado de Israel | Conflito israelo-palestino; criação do Estado de Israel (EM13CHS203)",
        "Aula 9 — O Apartheid: segregação e racismo na África do Sul | Apartheid na África do Sul (AE4 | EM13CHS503)",
        "Aula 10 — Separados e não tão iguais: a segregação racial e a violência institucional nos EUA | Segregação racial nos EUA; luta por Direitos Civis (AE4 | EM13CHS503)",
        "Aula 11 — A condição feminina: dos recônditos ao mundo urbano-industrial | Condição feminina; papéis sociais antes e após os conflitos mundiais (AE5 | EM13CHS303)",
        "Aula 12 — A política da boa vizinhança: In South American Way | Política da Boa Vizinhança; americanização; Estado Novo (AE5 | EM13CHS303)",
        "Aula 13 — [Complementar] A nova ordem econômica: conferência de Bretton Woods | Bretton Woods; FMI, BIRD e GATT (EM13CHS604)",
        "Aula 14 — Das cinzas à paz: as origens históricas da ONU | Fim da Segunda Guerra; ONU; organismos internacionais (AE4 | EM13CHS604)",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // INGLÊS / LÍNGUA INGLESA  (Guia do Currículo Priorizado — EM — Língua Inglesa)
    // Obs.: cada bimestre tem 20 aulas, alternando as aulas de conteúdo com
    // aulas de "Plataforma EF" (trilha de estudos individual de proficiência).
    // As aulas Plataforma EF foram consolidadas em uma única opção por bimestre.
    // ══════════════════════════════════════════════════════════════════════
    "Inglês": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Learning English nowadays (Part 1) | Leitura; palavras cognatas; estratégias de compreensão de textos (AE1 | EM13LGG102)",
        "Aula 3 — Learning English nowadays (Part 2) | Leitura; vocabulário temático; informações gerais e específicas (AE1 | EM13LGG102)",
        "Aula 5 — Learning English nowadays (Part 3) | Leitura; identificação de informações; posicionamento crítico (AE1 | EM13LGG102)",
        "Aula 7 — Learning English nowadays (Part 4) | Estratégias de leitura para resolução de exercícios de vestibular (AE1 | EM13LGG102)",
        "Aula 9 — Learning English nowadays (Part 5) | Simple present tense; compreensão e produção textual (AE2 | EM13LGG103)",
        "Aula 11 — Learning English nowadays (Part 6) | Simple present tense; elementos linguísticos específicos (AE2 | EM13LGG103)",
        "Plataforma EF (demais aulas) — Trilha de estudos individual; aprimoramento da proficiência em língua inglesa",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Evolution in Communication (Part 1) | Leitura de tirinhas; vocabulário temático; estratégias de compreensão (AE1 | EM13LGG102)",
        "Aula 3 — Evolution in Communication (Part 2) | Leitura de tirinhas; informações gerais e específicas (AE1 | EM13LGG102)",
        "Aula 5 — Evolution in Communication (Part 3) | Estratégias de leitura para questões de múltipla escolha (AE1 | EM13LGG102)",
        "Aula 7 — Evolution in Communication (Part 4) | Estratégias de leitura para exercícios de vestibular (AE1 | EM13LGG102)",
        "Aula 9 — Evolution in Communication (Part 5) | Past simple tense; advérbios de frequência (AE2 | EM13LGG103)",
        "Aula 11 — Evolution in Communication (Part 6) | Future tense; uso de \"should\" em conselhos e recomendações (AE2 | EM13LGG103)",
        "Plataforma EF (demais aulas) — Trilha de estudos individual; aprimoramento da proficiência em língua inglesa",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Fitness and health (Part 1) | Leitura; inferência de significado pelo contexto; vocabulário temático (AE1 | EM13LGG102)",
        "Aula 3 — Fitness and health (Part 2) | Leitura; inferência; posicionamento crítico diante do texto (AE1 | EM13LGG102)",
        "Aula 5 — Fitness and health (Part 3) | Leitura; criação de hipóteses; vocabulário temático (AE1 | EM13LGG102)",
        "Aula 7 — Fitness and health (Part 4) | Leitura como recurso para ampliação de vocabulário (AE1 | EM13LGG102)",
        "Aula 9 — Fitness and health (Part 5) | Compreensão e produção textual; gramática específica (AE2 | EM13LGG103)",
        "Aula 11 — Fitness and health (Part 6) | Compreensão e produção textual; gramática específica (AE2 | EM13LGG103)",
        "Plataforma EF (demais aulas) — Trilha de estudos individual; aprimoramento da proficiência em língua inglesa",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Science Revolution (Part 1) | Leitura; pronomes e referências; vocabulário temático (AE1 | EM13LGG102)",
        "Aula 3 — Science Revolution (Part 2) | Leitura; inferência de significado pelo contexto (AE1 | EM13LGG102)",
        "Aula 5 — Science Revolution (Part 3) | Leitura; tempo verbal e compreensão textual (AE1 | EM13LGG102)",
        "Aula 7 — Science Revolution (Part 4) | Leitura crítica de textos; estratégias de compreensão (AE1 | EM13LGG102)",
        "Aula 9 — Science Revolution (Part 5) | Passive voice; compreensão e produção textual (AE2 | EM13LGG102)",
        "Aula 11 — Science Revolution (Part 6) | Passive voice; efeito de sentido no uso da voz passiva (AE2 | EM13LGG102)",
        "Plataforma EF (demais aulas) — Trilha de estudos individual; aprimoramento da proficiência em língua inglesa",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // LÍNGUA PORTUGUESA  (Guia do Currículo Priorizado — EM — Língua Portuguesa)
    // ══════════════════════════════════════════════════════════════════════
    "Língua Portuguesa": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — A literatura medieval portuguesa e suas influências | Idade Média em Portugal; cultura galego-portuguesa; flexão verbal (AE1 | EM13LGG601)",
        "Aula 2 — As origens do Trovadorismo | Trovadorismo séc. XII; conjugações verbais regulares e irregulares (AE1 | EM13LGG601)",
        "Aula 3 — Versos medievais em ritmos atuais – Parte 1 | Cantigas: amor, amigo, escárnio e maldizer (AE1 | EM13LGG601)",
        "Aula 4 — Versos medievais em ritmos atuais – Parte 2 | Verbos; flexão verbal (AE2 | EM13LP08)",
        "Aula 5 — Gil Vicente e O Auto da Barca do Inferno – Parte 1 | Segunda época medieval; O Auto da Barca do Inferno (AE1 | EM13LGG601)",
        "Aula 6 — Gil Vicente e O Auto da Barca do Inferno – Parte 2 | Elementos mórficos; formação de palavras (AE2 | EM13LP08)",
        "Aula 7 — O Classicismo e Os Lusíadas – Parte 1 | Classicismo; Os Lusíadas; vida e obra de Camões (AE1 | EM13LGG601)",
        "Aula 8 — O Classicismo e Os Lusíadas – Parte 2 | Tipos de sujeito (simples, composto, oculto, indeterminado) (AE2 | EM13LP08)",
        "Aula 9 — Quem tem medo de poesia falada? – Parte 1 | Poema falado: slam; versificação (AE3 | EM13LP16)",
        "Aula 10 — Quem tem medo de poesia falada? – Parte 2 | Slam; linguagem informal e variedades linguísticas (AE2 | EM13LP09)",
        "Aula 11 — Um texto em outros textos | Intertextualidade; paráfrase e paródia (AE4 | EM13LP03)",
        "Aula 12 — Sentidos reais, sentidos simbólicos | Denotação e conotação em textos literários (AE4 | EM13LP06)",
        "Aula 13 — Clássicos e marginais – Parte 1 | Literatura marginal; contracultura (AE1 | EM13LP49)",
        "Aula 14 — Clássicos e marginais – Parte 2 | Norma-padrão e variação linguística; ortografia (AE2 | EM13LP09)",
        "Aula 15 — Literatura periférica – Parte 1 | Compreensão de texto; literatura periférica (AE5 | EM13LP46)",
        "Aula 16 — Literatura periférica – Parte 2 | Advérbios e locuções adverbiais (AE2 | EM13LP08)",
        "Aula 17 — Charges e cartuns – Parte 1 | Linguagem verbal e não verbal: charges e cartuns (AE4 | EM13LGG103)",
        "Aula 18 — Charges e cartuns – Parte 2 | Regência verbal e nominal (AE2 | EM13LP08)",
        "Aula 19 — A cara dos textos noticiosos | Leitura de notícia (AE6 | EM13LP38)",
        "Aula 20 — Marcas jornalísticas em temas de amplo interesse | Leitura de reportagem (AE7 | EM13LP45)",
        "Aula 21 — Imagens que contam histórias | Fotonotícias; fotorreportagens; fotodenúncias (AE7 | EM13LP45)",
        "Aula 22 — Outras formas de ver os dados | Leitura e análise de infográficos (AE7 | EM13LP45)",
        "Aula 23 — Visões de mundo | Leitura de artigo de opinião (AE7 | EM13LP45)",
        "Aula 24 — Como você opinaria? | Resenha crítica; recursos linguísticos (AE7 | EM13LP45)",
        "Aula 25 — Moldando palavras – Parte 1 | Morfologia: estrutura das palavras (AE2 | EM13LP09)",
        "Aula 26 — Moldando palavras – Parte 2 | Processos de formação de palavras: derivação (AE2 | EM13LP09)",
        "Aula 27 — Revisão e retomada – Parte 1 | Trovadorismo; Classicismo; literatura marginal; O Auto da Barca do Inferno; Os Lusíadas (EM13LP28)",
        "Aula 28 — Revisão e retomada – Parte 2 | Flexão verbal; concordância; formação de palavras; advérbios; regência (EM13LP09)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Anuncie aqui! – Parte 1 | Textos publicitários; estrutura e função social (AE8 | EM13LP44A)",
        "Aula 2 — Anuncie aqui! – Parte 2 | Neologismo; estrangeirismo (AE4 | EM13LP06)",
        "Aula 3 — Novas formas de fazer publicidade – Parte 1 | Publicidade em diferentes mídias; ortografia (AE8 | EM13LP44A)",
        "Aula 4 — Novas formas de fazer publicidade – Parte 2 | Acentuação de palavras (AE4 | EM13LP06)",
        "Aula 5 — Do interesse de todos – Parte 1 | Texto de opinião; movimentos argumentativos (AE7 | EM13LP05)",
        "Aula 6 — Do interesse de todos – Parte 2 | Concordância verbal com sujeito composto (AE2 | EM13LP08)",
        "Aula 7 — Em alto e bom som | Gênero debate (AE9 | EM13LGG303)",
        "Aula 8 — O Debate – Parte 1: preparação | Preparação para o debate oral (AE9 | EM13LP27)",
        "Aula 9 — O Debate – Parte 2: apresentação | Apresentação do debate; tópicos polêmicos (AE9 | EM13LP27)",
        "Aula 10 — O Debate – Parte 3: avaliação | Avaliação dos grupos do debate (AE9 | EM13LP27)",
        "Aula 11 — Artigo de Opinião – Parte 1 | Leitura de artigo de opinião (AE7 | EM13LP45)",
        "Aula 12 — Artigo de Opinião – Parte 2 | Elementos coesivos (AE4 | EM13LP06)",
        "Aula 13 — Leitor antenado | Fatos e opiniões; pronomes demonstrativos (AE6 | EM13LP38)",
        "Aula 14 — Mesmo tema, visões diferentes! | Análise de manchetes; presente histórico (AE6 | EM13LP38)",
        "Aula 15 — A opinião do leitor – Parte 1 | Leitura de carta do leitor (AE7 | EM13LP05)",
        "Aula 16 — A opinião do leitor – Parte 2 | Regência nominal e verbal (AE2 | EM13LP08)",
        "Aula 17 — Histórias que a vida conta – Parte 1 | Leitura de crônica (AE1 | EM13LP49)",
        "Aula 18 — Histórias que a vida conta – Parte 2 | Período composto por coordenação e subordinação (AE2 | EM13LP08)",
        "Aula 19 — Palavras com efeitos especiais – Parte 1 | Leitura e compreensão de poema (AE1 | EM13LP49)",
        "Aula 20 — Palavras com efeitos especiais – Parte 2 | Figuras de linguagem (comparação, metáfora, antítese, eufemismo) (AE1 | EM13LP49)",
        "Aula 21 — Vidas literárias: Fernando Pessoa – Parte 1 | Biografia; heterônimos (AE1 | EM13LP49)",
        "Aula 22 — Vidas literárias: Fernando Pessoa – Parte 2 | Poemas de Pessoa; figuras de linguagem (hipérbole, paradoxo, personificação) (AE1 | EM13LP48)",
        "Aula 23 — A linguagem literária – Parte 1 | Sonoridade nos textos poéticos (rima, aliteração, assonância) (AE1 | EM13LP49)",
        "Aula 24 — A linguagem literária – Parte 2 | Período composto por coordenação (AE10 | EM13LP52)",
        "Aula 25 — [Complementar] Mundos alternativos: ficção científica – Parte 1 | Conto de ficção científica (EM13LP46)",
        "Aula 26 — [Complementar] Mundos alternativos: ficção científica – Parte 2 | Período composto por subordinação (EM13LP46)",
        "Aula 27 — [Complementar] Revisão bimestral – Parte 1 | Literatura: poemas e figuras de linguagem (EM13LP28)",
        "Aula 28 — [Complementar] Revisão bimestral – Parte 2 | Período composto por subordinação e coordenação (EM13LP28)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Comecemos com a literatura – Parte 1 | Texto literário e não literário (AE1 | EM13LGG101)",
        "Aula 2 — Comecemos com a literatura – Parte 2 | Estrutura da oração (sujeito, predicado) (AE2 | EM13LP08)",
        "Aula 3 — Poesia em foco – Parte 1 | Poema: marcas do gênero; contexto de produção (AE3 | EM13LP52)",
        "Aula 4 — Poesia em foco – Parte 2 | Estrutura da oração; complementos verbais e nominais (AE2 | EM13LP08)",
        "Aula 5 — Lendo Gregório de Matos | Gregório de Matos; poesia satírica (AE3 | EM13LP52)",
        "Aula 6 — Arcadismo | Arcadismo: período e características (AE3 | EM13LP52)",
        "Aula 7 — Depois da Era Clássica – Parte 1 | Barroco e Arcadismo: períodos e características (AE3 | EM13LP52)",
        "Aula 8 — Depois da Era Clássica – Parte 2 | Barroco; emprego do verbo haver (AE3 | EM13LP52)",
        "Aula 9 — Neoclassicismo e Pré-Romantismo português – Parte 1 | Neoclassicismo e Pré-Romantismo (AE3 | EM13LP52)",
        "Aula 10 — Neoclassicismo e Pré-Romantismo português – Parte 2 | Conjunção mas e advérbio mais (AE2 | EM13LP08)",
        "Aula 11 — Leitura de gráficos | Textos multimodais diversos (AE4 | EM13LP45)",
        "Aula 12 — Leitura de infográficos | Textos multimodais diversos (AE4 | EM13LP45)",
        "Aula 13 — Divulgação científica | Texto de divulgação científica (AE5 | EM13LP31)",
        "Aula 14 — Características de textos destinados a divulgar ciência | Estrutura; progressão temática (AE5 | EM13LP02)",
        "Aula 15 — Resumir é um poder – Parte 1 | Gênero resumo; citação direta e paráfrase (AE6 | EM13LP12)",
        "Aula 16 — Resumir é um poder – Parte 2 | Conectivos – conjunções e locuções conjuntivas (AE2 | EM13LP08)",
        "Aula 17 — O essencial é visível nas sinopses | Gênero sinopse (AE7 | EM13LP53)",
        "Aula 18 — Conhecimentos acumulados | Verbete enciclopédico; denotação e conotação (AE8 | EM13LP02A)",
        "Aula 19 — Opinar ou não opinar, eis a questão – Parte 1 | Artigo de opinião (AE4 | EM13LP38)",
        "Aula 20 — Opinar ou não opinar, eis a questão – Parte 2 | Modalizadores discursivos (AE8 | EM13LP07)",
        "Aula 21 — Leitura crítica de charges – Parte 1 | Charge: características; linguagem verbal e não verbal (AE9 | EM13LGG102)",
        "Aula 22 — Leitura crítica de charges – Parte 2 | Leitura crítica de charge; uso de pronomes (AE2 | EM13LGG102)",
        "Aula 23 — Anúncio Publicitário/Propaganda – Parte 1 | Anúncio publicitário; persuasão; modo imperativo (AE10 | EM13LP44C)",
        "Aula 24 — Anúncio Publicitário/Propaganda – Parte 2 | Slogan; função apelativa; tipo textual injuntivo (AE10 | EM13LP44C)",
        "Aula 25 — Anúncio Publicitário/Propaganda – Parte 3 | Slogan; pontuação (AE2 | EM13LP08)",
        "Aula 26 — Denunciar é preciso | Leitura de cartaz; modo imperativo (AE4 | EM13LP45)",
        "Aula 27 — Literatura em movimento – Parte 1 | Contexto dos textos literários (Barroco, Arcadismo, Pré-Romantismo); intertextualidade (AE1 | EM13LGG101)",
        "Aula 28 — Literatura em movimento – Parte 2 | Morfossintaxe e estilo nos textos literários (AE2 | EM13LP08)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Conto – Parte 1 | Gênero conto; foco narrativo (AE11 | EM13LP49)",
        "Aula 2 — Conto – Parte 2 | Gênero conto; elementos da narrativa (AE11 | EM13LP49)",
        "Aula 3 — Conto – Parte 3 | Conto breve; classes de palavras (AE8 | EM13LP06)",
        "Aula 4 — Conto – Parte 4 | Advérbios e locuções adverbiais (AE11 | EM13LP49)",
        "Aula 5 — Romantismo no ar – Parte 1 | Introdução ao Romantismo; Romantismo em Portugal (AE1 | EM13LP50)",
        "Aula 6 — Romantismo no ar – Parte 2 | Romantismo em Portugal (AE1 | EM13LP50)",
        "Aula 7 — Romantismo no Brasil – José de Alencar | Romantismo no Brasil; literatura indianista (AE11 | EM13LP48)",
        "Aula 8 — Romantismo indianista e vozes indígenas contemporâneas | Literatura comparada; voz passiva e ativa (AE11 | EM13LP48)",
        "Aula 9 — Ressignificando a literatura indígena – Parte 1 | Leitura de conto indígena (AE3 | EM13LP52)",
        "Aula 10 — Ressignificando a literatura indígena – Parte 2 | Acentuação (AE2 | EM13LP08)",
        "Aula 11 — Ressignificando a literatura indígena – Parte 3 | Leitura de conto indígena (AE3 | EM13LP52)",
        "Aula 12 — Ressignificando a literatura indígena – Parte 4 | Paragrafação (AE2 | EM13LP52)",
        "Aula 13 — [Complementar] Assumindo uma posição – Parte 1 | Artigo de opinião; viés de confirmação (EM13LP02B)",
        "Aula 14 — [Complementar] Assumindo uma posição – Parte 2 | Coesão e coerência; operadores lógico-discursivos (EM13LP06)",
        "Aula 15 — Romantismo na voz de Maria Firmina dos Reis | Abolicionismo na literatura romântica; Maria Firmina dos Reis (AE3 | EM13LP52)",
        "Aula 16 — Romantismo na voz de Narcisa Amália | Mulheres na literatura romântica; Narcisa Amália (AE3 | EM13LP52)",
        "Aula 17 — Resenha crítica – Parte 1 | Resenha crítica; adjetivos e orações adjetivas (AE6 | EM13LP15)",
        "Aula 18 — Resenha crítica – Parte 2 | Escrita e compartilhamento de resenhas (AE6 | EM13LP15)",
        "Aula 19 — Livro em crise | Artigo de opinião; conectores sequenciais e referenciais (AE8 | EM13LP01)",
        "Aula 20 — Crise da leitura: mito ou realidade? | Leitura e análise de resultados de pesquisa (AE9 | EM13LGG102)",
        "Aula 21 — Pesquisas em tempos digitais – Parte 1 | Pesquisa científica; curadoria de informações (AE5 | EM13LP30)",
        "Aula 22 — Pesquisas em tempos digitais – Parte 2 | Referências bibliográficas; citação direta e indireta (AE5 | EM13LP30)",
        "Aula 23 — Pesquisas em tempos digitais – Parte 3 | Curadoria de textos científicos; artigo científico (AE9 | EM13LP32A)",
        "Aula 24 — Pesquisas em tempos digitais – Parte 4 | Texto científico; colocação pronominal (AE9 | EM13LP32A)",
        "Aula 25 — [Complementar] O universo dos textos literários – Parte 1 | Leitura e análise de crônica (EM13LP52)",
        "Aula 26 — [Complementar] O universo dos textos literários – Parte 2 | Pronomes demonstrativos (EM13LP06)",
        "Aula 27 — Divulgando ciência – Parte 1 | Planejamento de texto de divulgação científica; banner (AE12 | EM13LP34)",
        "Aula 28 — Divulgando ciência – Parte 2 | Apresentação de texto de divulgação científica (AE12 | EM13LGG301)",
      ],
      "3ª Série — 1º Bimestre": [
        "Aula 1 — Entenda o Pré-modernismo | Pré-Modernismo; Euclides da Cunha; Lima Barreto; Augusto dos Anjos (AE2 | EM13LGG101)",
        "Aula 2 — Quem são os modernistas? | Poética de Oswald de Andrade; revistas modernistas; ortografia (AE2 | EM13LP52)",
        "Aula 3 — Manifesto antropófago | Conceito de manifesto e antropofagia (AE3 | EM13LP49)",
        "Aula 4 — Penso, logo me expresso | Artigo de opinião; elementos coesivos (AE4 | EM13LGG303)",
        "Aula 5 — Movimentos argumentativos | Tese, argumentos, refutação (AE4 | EM13LGG303)",
        "Aula 6 — Compartilhando descobertas | Comparação de dados em textos de divulgação científica (AE5 | EM13LP32B)",
        "Aula 7 — A construção da opinião com a voz de um jornal – Parte 1 | Editorial (AE6 | EM13LP36)",
        "Aula 8 — A construção da opinião com a voz de um jornal – Parte 2 | Orações coordenadas sindéticas (AE7 | EM13LP08)",
        "Aula 9 — Novas formas de convencer você – Parte 1 | Publicidade em contexto digital (advergame, social advertising, unboxing) (AE6 | EM13LP44A)",
        "Aula 10 — Novas formas de convencer você – Parte 2 | Paralelismo sintático (AE7 | EM13LP08)",
        "Aula 11 — Romances românticos | Gênero romance; Romantismo; Iracema e Senhora, de José de Alencar (AE8 | EM13LP50)",
        "Aula 12 — Romances realistas | Realismo; Dom Casmurro, de Machado de Assis (AE8 | EM13LP50)",
        "Aula 13 — Romantismo x Realismo – Parte 1 | Diferenças entre romances românticos e realistas (AE8 | EM13LP50)",
        "Aula 14 — Romantismo x Realismo – Parte 2 | Figuras de linguagem: metonímia e sinestesia (AE7 | EM13LP08)",
        "Aula 15 — Entre versos e vozes: explorando características do poema – Parte 1 | Comparação de literaturas (portuguesa, africana, brasileira, indígena, latino-americana) (AE2 | EM13LP52)",
        "Aula 16 — Entre versos e vozes: explorando características do poema – Parte 2 | Comparação de literaturas (AE2 | EM13LP52)",
        "Aula 17 — Contos do século XIX: Machado de Assis – Parte 1 | Conto Pai contra mãe; contexto de produção (AE2 | EM13LP52)",
        "Aula 18 — Contos do século XIX: Machado de Assis – Parte 2 | Retomada do conto Pai contra mãe (AE2 | EM13LP52)",
        "Aula 19 — Contos do século XIX – Parte 1 | Leitura e compreensão de conto (AE2 | EM13LP52)",
        "Aula 20 — Contos do século XIX – Parte 2 | Análise de conto; figura de linguagem: personificação (AE2 | EM13LP52)",
        "Aula 21 — Contos do século XX: Guimarães Rosa – Parte 1 | Conto de Guimarães Rosa (AE2 | EM13LP52)",
        "Aula 22 — Contos do século XX: Guimarães Rosa – Parte 2 | Efeitos de sentido; variação linguística (AE2 | EM13LP52)",
        "Aula 23 — Contos do século XX: Lygia F. Telles – Parte 1 | Leitura e análise de conto (AE2 | EM13LP52)",
        "Aula 24 — Contos do século XX: Lygia F. Telles – Parte 2 | Análise de conto; contexto de produção (AE2 | EM13LP08)",
        "Aula 25 — Notícias que impactam – Parte 1 | Leitura de notícia; visão de mundo no texto (AE6 | EM13LGG102)",
        "Aula 26 — Notícias que impactam – Parte 2 | Gênero notícia; sinais de pontuação (AE7 | EM13LP08)",
        "Aula 27 — Desconstruindo a reportagem – Parte 1 | Leitura de reportagem; regência verbal e nominal (AE6 | EM13LP42)",
        "Aula 28 — Desconstruindo a reportagem – Parte 2 | Operadores lógico-discursivos (AE7 | EM13LP08)",
      ],
      "3ª Série — 2º Bimestre": [
        "Aula 1 — Por dentro das normas – Parte 1 | Estatuto da Pessoa Idosa (texto normativo) (AE9 | EM13LP26C)",
        "Aula 2 — Por dentro das normas – Parte 2 | Ordem direta e inversões (AE7 | EM13LP08)",
        "Aula 3 — Textos contemporâneos na construção da opinião – Parte 1 | Leitura de artigo de opinião (AE4 | EM13LP02C)",
        "Aula 4 — Textos contemporâneos na construção da opinião – Parte 2 | Conjunções e elementos coesivos (AE7 | EM13LP08)",
        "Aula 5 — Textos contemporâneos na construção da opinião – Parte 3 | Fato e opinião; relações lógico-discursivas (AE4 | EM13LP02C)",
        "Aula 6 — Textos contemporâneos na construção da opinião – Parte 4 | Regência verbal e nominal (AE7 | EM13LP08)",
        "Aula 7 — Oralidade: Entrevista – Parte 1 | Entrevista oral; marcas de oralidade; variação linguística (AE10 | EM13LP10)",
        "Aula 8 — Oralidade: Entrevista – Parte 2 | Marcas de oralidade em textos transcritos; tipos de transcrição (AE10 | EM13LGG401)",
        "Aula 9 — [Complementar] O que o texto revela | Leitura de poema; visões de mundo dos séculos XVIII e XIX (EM13LP48)",
        "Aula 10 — [Complementar] Os movimentos da literatura: influências e inovações | Processo de constituição da literatura (EM13LP48)",
        "Aula 11 — Vanguardas europeias | Definições e características das vanguardas europeias (AE8 | EM13LGG602)",
        "Aula 12 — Semana de Arte Moderna | Semana de Arte Moderna; poética de Manuel Bandeira (AE3 | EM13LGG601)",
        "Aula 13 — Primeira geração modernista – Parte 1 | Primeira geração modernista; poética de Mário de Andrade (AE3 | EM13LGG601)",
        "Aula 14 — Primeira geração modernista – Parte 2 | Poética de Oswald de Andrade (AE3 | EM13LGG601)",
        "Aula 15 — Segunda geração modernista: Poesia da década de 1930 – Parte 1 | Poética de Carlos Drummond de Andrade (AE3 | EM13LP49)",
        "Aula 16 — Segunda geração modernista: Poesia da década de 1930 – Parte 2 | Poética de Murilo Mendes (AE3 | EM13LP49)",
        "Aula 17 — Segunda geração modernista: Prosa de 30 – Parte 1 | Prosa regionalista; Rachel de Queiroz (O Quinze) (AE3 | EM13LP48)",
        "Aula 18 — Segunda geração modernista: Prosa de 30 – Parte 2 | Prosa de Graciliano Ramos (Vidas Secas) (AE3 | EM13LP48)",
        "Aula 19 — Segunda geração modernista: Prosa de 30 – Parte 3 | Prosa de Jorge Amado (Capitães da Areia) (AE3 | EM13LP48)",
        "Aula 20 — Visões diversas em editoriais – Parte 1 | Leitura e análise de editorial (AE6 | EM13LP37A)",
        "Aula 21 — Visões diversas em editoriais – Parte 2 | Modalização textual (AE6 | EM13LP07)",
        "Aula 22 — Visões diversas em editoriais – Parte 3 | Leitura e análise de editorial (AE6 | EM13LP37A)",
        "Aula 23 — Visões diversas em editoriais – Parte 4 | Modalização textual (AE6 | EM13LP07)",
        "Aula 24 — Os olhares do cotidiano: o gênero crônica – Parte 1 | Leitura e análise de crônica (AE3 | EM13LP49)",
        "Aula 25 — Os olhares do cotidiano: o gênero crônica – Parte 2 | Estratégias linguísticas na crônica (AE3 | EM13LP49)",
        "Aula 26 — Os olhares do cotidiano: o gênero crônica – Parte 3 | Intertextualidade; polissemia (AE8 | EM13LP03)",
        "Aula 27 — [Complementar] Desenhando a sociedade: a charge como texto literário – Parte 1 | Leitura e análise de charge (EM13LGG202)",
        "Aula 28 — [Complementar] Desenhando a sociedade: a charge como texto literário – Parte 2 | Leitura e análise de charge (EM13LGG104)",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // MATEMÁTICA  (Guia do Currículo Priorizado — EM — Matemática)
    // ══════════════════════════════════════════════════════════════════════
    "Matemática": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Os números no mundo real: criptografia | Identificação do uso dos números no mundo real (AE1 | EM13MAT103)",
        "Aula 2 — Problemas de adição e subtração com números racionais | Adição e subtração de racionais (AE1 | EF07MA12)",
        "Aula 3 — Problemas de multiplicação e divisão com números racionais | Multiplicação e divisão de racionais (AE1 | EF07MA12)",
        "Aula 4 — Revisão: Operações com números racionais | Operações com racionais (AE1 | EF07MA12)",
        "Aula 5 — Potenciação com números racionais | Potenciação de racionais (AE1 | EF08MA01)",
        "Aula 6 — Radiciação com números racionais | Radiciação de racionais (AE1 | EF08MA02)",
        "Aula 7 — Resolução de problemas envolvendo operações com números racionais | Potenciação e radiciação com racionais (AE1 | EF07MA12)",
        "Aula 8 — Aula de verificação: Multiplicação e potenciação com números racionais | Multiplicação e potenciação com racionais (AE1 | EF07MA12)",
        "Aula 9 — A volta do teorema de Pitágoras | Demonstração geométrica; área de figuras planas (AE2 | EF09MA14)",
        "Aula 10 — O teorema de Pitágoras e as raízes quadradas – Parte 1 | Aplicação direta; cálculo de raízes quadradas (AE2 | EF09MA14)",
        "Aula 11 — O teorema de Pitágoras e as raízes quadradas – Parte 2 | Aplicação; estratégias de cálculo com radiciação (AE2 | EF09MA14)",
        "Aula 12 — Revisão: Teorema de Pitágoras | Teorema de Pitágoras (AE2 | EF09MA14)",
        "Aula 13 — Radiciação e os resultados não racionais | Diagonal do quadrado; radicais não racionais (AE2 | EF09MA03)",
        "Aula 14 — Estratégias de cálculo envolvendo radiciação | Decomposição em fatores primos; simplificação de radicais (AE2 | EF09MA03)",
        "Aula 15 — Resolução de problemas envolvendo radiciação | Aplicação do teorema de Pitágoras; radicais (AE2 | EF09MA14)",
        "Aula 16 — Aula de verificação: Teorema de Pitágoras e radiciação | Teorema de Pitágoras e radiciação (AE2 | EF09MA14)",
        "Aula 17 — Explorando o conjunto dos números racionais | Representações decimais; ideia de número irracional (AE1 | EF09MA01)",
        "Aula 18 — Fração geratriz de dízima periódica | Dízimas periódicas e fração geratriz (AE1 | EF08MA05)",
        "Aula 19 — Números irracionais e sua localização na reta | Números racionais e irracionais; localização na reta (AE1 | EF09MA02)",
        "Aula 20 — Revisão: Dízimas periódicas | Números racionais; fração geratriz (AE1 | EF07MA12)",
        "Aula 21 — A continuidade da reta numérica | Noção de intervalo; comparação de racionais e irracionais (AE1 | EF09MA02)",
        "Aula 22 — O conjunto dos números reais | Conjunto dos reais; subconjuntos numéricos (AE1 | EF09MA02)",
        "Aula 23 — Resolução de problemas envolvendo números reais | Operações com números reais (AE1 | EF09MA04)",
        "Aula 24 — Aula de verificação: Números racionais e irracionais | Conjunto dos reais; operações (AE1 | EF09MA02)",
        "Aula 25 — Aula de revisão: Multiplicação e potenciação com números racionais | Multiplicação e potenciação com racionais (EF07MA12)",
        "Aula 26 — Aula de revisão: Teorema de Pitágoras e Radiciação | Teorema de Pitágoras; radiciação (EF09MA14)",
        "Aula 27 — Aula de revisão: Números racionais e irracionais | Conjunto dos reais; operações (EF09MA02)",
        "Aula 28 — Revisão: Números reais | Conjunto dos reais; operações; localização na reta (EF09MA02)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Retomando equações do 1º grau | Resolução de equações do 1º grau (AE4 | EF07MA18)",
        "Aula 2 — Modelagem algébrica de problemas do 1º grau – Parte 1 | Resolução de problemas do 1º grau (AE4 | EF07MA18)",
        "Aula 3 — Modelagem algébrica de problemas do 1º grau – Parte 2 | Resolução de problemas do 1º grau (AE4 | EF07MA18)",
        "Aula 4 — Revisão: Problemas com equações do 1º grau | Problemas do 1º grau (ax+b=c) (AE4 | EF07MA18)",
        "Aula 5 — Grandezas de espécies diferentes | Relação entre grandezas; razão e proporção (AE4 | EF09MA07)",
        "Aula 6 — Resolução de problemas com grandezas de espécies diferentes | Relação entre grandezas (AE4 | EF09MA07)",
        "Aula 7 — Resolução de problemas envolvendo equações do 1º grau e relação entre grandezas | Equações do 1º grau e relação entre grandezas (AE4 | EF07MA18)",
        "Aula 8 — Aula de verificação: Resolução de problemas sobre equações do 1º grau | Equações do 1º grau e relação entre grandezas (AE4 | EF07MA18)",
        "Aula 9 — Explorando a relação entre grandezas | Relação entre grandezas (AE3 | EM13MAT101)",
        "Aula 10 — Relação entre grandezas: representação algébrica | Representação algébrica entre grandezas dependentes (AE3 | EM13MAT101)",
        "Aula 11 — Relação entre grandezas: representação gráfica | Representação gráfica entre grandezas dependentes (AE3 | EM13MAT101)",
        "Aula 12 — Revisão: Conceito de função | Representações algébrica e gráfica de grandezas dependentes (AE3 | EM13MAT101)",
        "Aula 13 — Relação entre grandezas: o conceito de função | Formalização do conceito de função (AE3 | EF09MA06)",
        "Aula 14 — Representação de funções | Representações de funções (AE3 | EF09MA06)",
        "Aula 15 — Função como relação de dependência entre duas grandezas | O conceito de função (AE3 | EF09MA06)",
        "Aula 16 — Aula de verificação: Conceito de função | O conceito de função (AE3 | EF09MA06)",
        "Aula 17 — Explorando o conceito de função | Função afim (AE4 | EM13MAT302)",
        "Aula 18 — Função afim | Conceito de função afim (AE4 | EM13MAT302)",
        "Aula 19 — Representações da função afim | Gráfico de função afim (AE4 | EM13MAT302)",
        "Aula 20 — Revisão: Função afim e representação gráfica | Função afim (AE4 | EM13MAT302)",
        "Aula 21 — Lei de formação e gráfico de uma função afim | Função afim (AE4 | EM13MAT401)",
        "Aula 22 — Proporcionalidade e função linear | Caso particular de função afim (AE4 | EM13MAT401)",
        "Aula 23 — Função afim: resolução de problemas | Função afim (AE4 | EM13MAT401)",
        "Aula 24 — Aula de verificação: Função afim | Função afim (AE4 | EM13MAT401)",
        "Aula 25 — [Complementar] Revisão: Equações do 1º grau – problemas | Equações do 1º grau e relação entre grandezas (EF07MA18)",
        "Aula 26 — [Complementar] Revisão: Conceito de função | Conceito de função (EM13MAT501)",
        "Aula 27 — [Complementar] Aula de revisão: Função afim | Função afim (EM13MAT401)",
        "Aula 28 — [Complementar] Revisão: Função afim - conceitos e aplicações | Função afim (EM13MAT401)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Potenciação e unidades de medidas | Potenciação com expoentes inteiros (AE1 | EF08MA01)",
        "Aula 2 — Problemas com potências de expoentes inteiros | Potenciação com expoentes inteiros (AE1 | EF08MA01)",
        "Aula 3 — Problemas com potências de expoentes fracionários | Potências com expoente fracionário; propriedades (AE1 | EF09MA03)",
        "Aula 4 — Revisão: Potenciação com números racionais | Potências de expoente inteiro e fracionário (AE1 | EF08MA01)",
        "Aula 5 — Medidas e notação científica | Notação científica (AE1 | EM13MAT103)",
        "Aula 6 — Notação científica: operações e problemas | Notação científica: operações (AE1 | EM13MAT103)",
        "Aula 7 — Problemas do cotidiano envolvendo potenciação e notação científica | Potenciação e notação científica (AE1 | EM13MAT313)",
        "Aula 8 — Aula de verificação: Potenciação e notação científica | Potenciação, notação científica e operações com reais (AE1 | EM13MAT313)",
        "Aula 9 — Estratégias de resolução de equações do 1º grau | Expressões algébricas e equações do 1º grau (AE2 | EF07MA18)",
        "Aula 10 — Modelagem algébrica de problemas do 1º grau | Resolução de problemas do 1º grau (AE2 | EF07MA18)",
        "Aula 11 — Fatoração por produtos notáveis | Fatoração de expressões algébricas; produtos notáveis (AE2 | EF09MA09)",
        "Aula 12 — Revisão: Produtos notáveis e equações do 1º grau | Fatoração; equações do 1º grau (AE2 | EF09MA09)",
        "Aula 13 — Estratégias de resolução de equações do 2º grau – Parte 1 | Equações do 2º grau incompletas; fatoração (AE2 | EF09MA09)",
        "Aula 14 — Estratégias de resolução de equações do 2º grau – Parte 2 | Equações do 2º grau; fórmula resolutiva (AE2 | EF09MA09)",
        "Aula 15 — Resolução de problemas do 1º e do 2º grau | Equações do 1º grau, fatoração e equações do 2º grau (AE2 | EF07MA18)",
        "Aula 16 — Aula de verificação: Equações do 1º e do 2º grau | Equações do 1º e 2º grau (AE2 | EF07MA18)",
        "Aula 17 — Crescimento exponencial | Sequências numéricas com crescimento exponencial (AE3 | EM13MAT304)",
        "Aula 18 — Propriedades da potenciação | Propriedades da potenciação (AE3 | EM13MAT304)",
        "Aula 19 — Equações exponenciais | Conceito e resolução de equações exponenciais (AE3 | EM13MAT304)",
        "Aula 20 — Revisão: Resolução de equações exponenciais | Equações exponenciais (AE3 | EM13MAT304)",
        "Aula 21 — Estratégias de resolução de equações exponenciais – Parte 1 | Resolução de equações exponenciais (AE3 | EM13MAT304)",
        "Aula 22 — Estratégias de resolução de equações exponenciais – Parte 2 | Equações exponenciais com mudança de variável (AE3 | EM13MAT304)",
        "Aula 23 — Resolução de problemas envolvendo equações exponenciais | Resolução de equações exponenciais (AE3 | EM13MAT304)",
        "Aula 24 — Aula de verificação: Potenciação e equações exponenciais | Resolução de equações exponenciais (AE3 | EM13MAT304)",
        "Aula 25 — Aula de revisão: Potenciação e notação científica | Potenciação e notação científica (EM13MAT313)",
        "Aula 26 — Aula de revisão: Equações do 1º grau, fatoração e equações do 2º grau | Equações do 1º e 2º grau; fatoração (EF07MA18)",
        "Aula 27 — Aula de revisão: Equações exponenciais | Equações exponenciais (EM13MAT304)",
        "Aula 28 — Revisão: Estratégias de resolução de equações exponenciais | Equações exponenciais (EM13MAT304)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Explorando equações exponenciais | Resolução de equações exponenciais (AE3 | EM13MAT304)",
        "Aula 2 — Função exponencial | Conceito de função exponencial (AE3 | EM13MAT304)",
        "Aula 3 — Modelagem algébrica envolvendo a função exponencial | Modelagem com função exponencial (AE3 | EM13MAT304)",
        "Aula 4 — Revisão: Função exponencial | Função exponencial (AE3 | EM13MAT304)",
        "Aula 5 — Gráfico da função exponencial | Representação gráfica de funções exponenciais (AE3 | EM13MAT304)",
        "Aula 6 — Análise de gráficos de funções exponenciais | Gráficos de funções exponenciais (AE3 | EM13MAT304)",
        "Aula 7 — Resolução de problemas relacionados a funções exponenciais | Problemas modelados por funções exponenciais (AE3 | EM13MAT304)",
        "Aula 8 — Aula de verificação: Funções exponenciais | Problemas modelados por funções exponenciais (AE3 | EM13MAT304)",
        "Aula 9 — Explorando logaritmos | O conceito de logaritmo (AE4 | EM13MAT305)",
        "Aula 10 — Propriedades dos logaritmos – Parte 1 | Propriedades operatórias dos logaritmos (AE4 | EM13MAT305)",
        "Aula 11 — Propriedades dos logaritmos – Parte 2 | Propriedades operatórias dos logaritmos (AE4 | EM13MAT305)",
        "Aula 12 — Revisão: Propriedades operatórias dos logaritmos | Propriedades operatórias dos logaritmos (AE4 | EM13MAT305)",
        "Aula 13 — Equações logarítmicas – Parte 1 | Equações logarítmicas (AE4 | EM13MAT305)",
        "Aula 14 — Equações logarítmicas – Parte 2 | Equações logarítmicas (AE4 | EM13MAT305)",
        "Aula 15 — Aplicações de logaritmos | Aplicações de logaritmos (AE4 | EM13MAT305)",
        "Aula 16 — Resolução de problemas envolvendo logaritmos | Logaritmos (AE4 | EM13MAT305)",
        "Aula 17 — Explorando equações exponenciais e logarítmica | Equações logarítmicas (AE4 | EM13MAT403)",
        "Aula 18 — Função logarítmica | Conceito de função logarítmica (AE4 | EM13MAT305)",
        "Aula 19 — Modelagem algébrica envolvendo a função logarítmica | Modelagem com função logarítmica (AE4 | EM13MAT305)",
        "Aula 20 — Revisão: Equações logarítmicas - problemas | Funções logarítmicas (AE4 | EM13MAT305)",
        "Aula 21 — Gráfico da função logarítmica | Representação gráfica de funções logarítmicas (AE4 | EM13MAT305)",
        "Aula 22 — Análise de gráficos de funções logarítmicas | Gráficos de funções logarítmicas (AE4 | EM13MAT305)",
        "Aula 23 — Função logarítmica – Resolução de problemas | Funções logarítmicas (AE4 | EM13MAT305)",
        "Aula 24 — Aula de verificação: Função logarítmica | Funções logarítmicas (AE4 | EM13MAT305)",
        "Aula 25 — [Complementar] Aula de revisão: Função exponencial | Função exponencial (EM13MAT304)",
        "Aula 26 — [Complementar] Aula de revisão: Logaritmos | Logaritmos (EM13MAT305)",
        "Aula 27 — [Complementar] Aula de revisão: Função logarítmica | Função logarítmica (EM13MAT305)",
        "Aula 28 — [Complementar] Revisão: Função logarítmica | Função logarítmica (EM13MAT305)",
      ],
      "3ª Série — 1º Bimestre": [
        "Aula 1 — Equações do 1º grau e proporcionalidade | Equação do 1º grau; razão entre grandezas de espécies diferentes (AE1 | EF07MA18)",
        "Aula 2 — Problemas com equações do 1º grau com uma incógnita | Resolução de equações e problemas do 1º grau (AE1 | EF07MA18)",
        "Aula 3 — Problemas com equações incompletas do 2º grau | Equações do 2º grau (ax²=b) (AE1 | EF08MA09)",
        "Aula 4 — Revisão: Resolução de problemas com equações do 1º e 2º graus | Equações do 1º e 2º grau (AE1 | EF07MA18)",
        "Aula 5 — Problemas com equações completas do 2º grau | Equações do 2º grau (forma completa) (AE1 | EF09MA09)",
        "Aula 6 — A fórmula resolutiva para equações do 2º grau | Equações do 2º grau (fórmula resolutiva) (AE1 | EF09MA09)",
        "Aula 7 — Problemas do cotidiano com equações do 1º e 2º grau | Equações do 1º e 2º grau (AE1 | EF07MA18)",
        "Aula 8 — Aula de verificação: Equações do 2º grau | Equações do 2º grau (fórmula resolutiva) (AE1 | EF09MA09)",
        "Aula 9 — Sistemas lineares do 1º grau: duas equações e duas incógnitas | Sistemas de duas equações do 1º grau (AE2 | EM13MAT301)",
        "Aula 10 — Resolução de sistema linear: método da substituição | Sistemas lineares; método da substituição (AE2 | EM13MAT301)",
        "Aula 11 — Resolução de sistema linear: método da adição | Sistemas lineares; método da adição (AE2 | EM13MAT301)",
        "Aula 12 — Revisão: Resolução de sistemas lineares com duas equações | Sistemas lineares 2x2 (AE2 | EM13MAT301)",
        "Aula 13 — Interpretação geométrica de um sistema linear com duas equações e duas incógnitas | Plano cartesiano e sistemas lineares (AE2 | EM13MAT301)",
        "Aula 14 — Discussão de um sistema linear | Possibilidades de solução; interpretação geométrica (AE2 | EM13MAT301)",
        "Aula 15 — Resolução de problemas envolvendo sistemas de equações lineares a duas incógnitas | Sistemas de equações lineares (AE2 | EM13MAT301)",
        "Aula 16 — Aula de verificação: sistema de equações lineares com duas incógnitas | Sistemas com duas equações lineares (AE2 | EM13MAT301)",
        "Aula 17 — Sistemas lineares de três equações a três incógnitas | Sistemas lineares 3x3 (AE2 | EM13MAT301)",
        "Aula 18 — Método do escalonamento – Parte 1 | Sistema linear 3x3; escalonamento (AE2 | EM13MAT301)",
        "Aula 19 — Método do escalonamento – Parte 2 | Sistema linear 3x3; escalonamento (AE2 | EM13MAT301)",
        "Aula 20 — Revisão: Resolução de sistemas lineares com três equações | Sistema linear 3x3 por escalonamento (AE2 | EM13MAT301)",
        "Aula 21 — Classificação de sistemas lineares – Parte 1 | Classificação: possível determinado/indeterminado/impossível (AE2 | EM13MAT301)",
        "Aula 22 — Classificação de sistemas lineares – Parte 2 | Classificação de sistemas lineares (AE2 | EM13MAT301)",
        "Aula 23 — Resolução de problemas utilizando sistemas de equações lineares | Sistemas 3x3 por escalonamento (AE2 | EM13MAT301)",
        "Aula 24 — Aula de verificação: Discussão de um sistema linear de três equações a três incógnitas | Discussão de sistema linear 3x3 (AE2 | EM13MAT301)",
        "Aula 25 — Aula de revisão: equações polinomiais do 1º e do 2º grau | Equações do 1º e 2º grau (EF09MA09)",
        "Aula 26 — Aula de revisão: sistemas lineares com duas equações a duas incógnitas | Sistemas lineares 2x2 (EF08MA08)",
        "Aula 27 — Aula de revisão: sistemas lineares com três equações a três incógnitas | Sistemas lineares 3x3 (EM13MAT301)",
        "Aula 28 — Revisão: Métodos de resolução de sistemas lineares | Sistemas lineares (EM13MAT301)",
      ],
      "3ª Série — 2º Bimestre": [
        "Aula 1 — Princípio multiplicativo da contagem | Princípio fundamental da contagem (AE3 | EM13MAT310)",
        "Aula 2 — Cálculo do número de permutações simples | Permutações simples; fatorial (AE3 | EM13MAT310)",
        "Aula 3 — Cálculo do número de arranjos simples | Arranjos simples (AE3 | EM13MAT310)",
        "Aula 4 — Revisão: Problemas de contagem | Contagem e agrupamentos (AE3 | EM13MAT310)",
        "Aula 5 — Cálculo do número de combinações simples | Combinações simples (AE3 | EM13MAT310)",
        "Aula 6 — Permutação, Arranjo Simples e Combinação Simples | Permutações, arranjos e combinações simples (AE3 | EM13MAT310)",
        "Aula 7 — Resolução de problemas relacionados à Análise Combinatória | Contagem e agrupamentos (AE3 | EM13MAT310)",
        "Aula 8 — Aula de verificação: Análise Combinatória | Contagem e agrupamentos (AE3 | EM13MAT310)",
        "Aula 9 — Noções de probabilidade | Noções de probabilidades; árvore de possibilidades (AE4 | EF06MA30)",
        "Aula 10 — Experimentos, espaço amostral e eventos | Experimentos aleatórios (AE4 | EM13MAT311)",
        "Aula 11 — Cálculo da probabilidade de um evento – Parte 1 | Conceito de probabilidade (AE4 | EM13MAT311)",
        "Aula 12 — Revisão: Conceito de probabilidade | Conceito de probabilidade (AE4 | EM13MAT311)",
        "Aula 13 — Cálculo da probabilidade de um evento – Parte 2 | Propriedades: evento impossível, certo, complementares (AE4 | EM13MAT311)",
        "Aula 14 — Cálculo da probabilidade de um evento – Parte 3 | Probabilidades de eventos com Análise Combinatória (AE4 | EM13MAT311)",
        "Aula 15 — Características do cálculo de probabilidades | Cálculo de probabilidades (AE4 | EM13MAT311)",
        "Aula 16 — Resolução de problemas de probabilidade | Cálculo de probabilidades (AE4 | EM13MAT311)",
        "Aula 17 — Probabilidade e Análise Combinatória | Análise combinatória e probabilidades (AE4 | EM13MAT311)",
        "Aula 18 — Adição de probabilidades – Parte 1 | Relação para a adição de eventos (AE5 | EM13MAT312)",
        "Aula 19 — Adição de probabilidades – Parte 2 | Adição de probabilidades (AE5 | EM13MAT312)",
        "Aula 20 — Revisão: Eventos e probabilidades | Adição de probabilidades (AE5 | EM13MAT312)",
        "Aula 21 — Probabilidade condicional | Probabilidade condicional; eventos dependentes e independentes (AE5 | EM13MAT312)",
        "Aula 22 — Multiplicação de probabilidades | Multiplicação de probabilidades; eventos sucessivos (AE5 | EM13MAT312)",
        "Aula 23 — Resolução de problemas envolvendo probabilidades | Probabilidade em eventos sucessivos (AE5 | EM13MAT312)",
        "Aula 24 — Aula de verificação: Cálculo de probabilidades | Adição e multiplicação de probabilidades (AE5 | EM13MAT312)",
        "Aula 25 — [Complementar] Aula de revisão: Análise Combinatória | Problemas de contagem (EM13MAT310)",
        "Aula 26 — [Complementar] Aula de revisão: Cálculo de probabilidades – Parte 1 | Probabilidades em eventos simples (EM13MAT312)",
        "Aula 27 — [Complementar] Aula de revisão: Cálculo de probabilidades – Parte 2 | Adição e multiplicação de probabilidades (EM13MAT312)",
        "Aula 28 — [Complementar] Revisão: Probabilidade de eventos independentes | Cálculo de probabilidades (EM13MAT312)",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // QUÍMICA  (Guia do Currículo Priorizado — EM — Química)
    // ══════════════════════════════════════════════════════════════════════
    "Química": {
      "1ª Série — 1º Bimestre": [
        "Aula 1 — Do que são feitas as coisas? | Matéria, constituição e átomo; teoria atômica de Dalton (AE1 | EM13CNT201)",
        "Aula 2 — Para que servem os modelos? | Modelos; evolução dos modelos atômicos (AE1 | EM13CNT201)",
        "Aula 3 — Descobertas sobre a constituição da matéria | Modelos atômicos; experimento de Rutherford (AE1 | EM13CNT201)",
        "Aula 4 — Partículas atômicas | Modelo de Rutherford; número atômico e de massa; isótopos (AE1 | EM13CNT201)",
        "Aula 5 — Modelo de Bohr e modelos atuais | Modelo de Bohr; transições eletrônicas; modelo quântico (AE1 | EM13CNT201)",
        "Aula 6 — Distribuição eletrônica | Níveis e subníveis de energia; princípio de Pauli; regra de Hund (AE1 | EM13CNT201)",
        "Aula 7 — Elementos e substâncias que constituem o Sistema Solar | Tabela periódica; evolução estelar (AE2 | EM13CNT209)",
        "Aula 8 — A descoberta do fósforo e a organização dos elementos | Classificação periódica; história da tabela periódica (AE2 | EM13CNT209)",
        "Aula 9 — Radioisótopos | Características dos radioisótopos; partículas alfa, beta e gama (AE2 | EM13CNT103)",
        "Aula 10 — A formação do Universo e os elementos químicos | Nucleossíntese; formação dos elementos químicos (AE2 | EM13CNT202)",
        "Aula 11 — A tabela periódica | Propriedades periódicas; ligações químicas (AE2 | EM13CNT202)",
        "Aula 12 — Como os átomos formam as substâncias? | Ligações químicas; teoria do octeto; camada de valência (AE3 | EM13CNT202)",
        "Aula 13 — Produção de sal e as ligações iônicas | Ligação iônica; cátions e ânions; fórmula de Lewis (AE3 | EM13CNT202)",
        "Aula 14 — Molécula essencial à vida e as ligações covalentes | Ligação covalente; compartilhamento de elétrons; fórmula estrutural (AE3 | EM13CNT202)",
      ],
      "1ª Série — 2º Bimestre": [
        "Aula 1 — Aula desafio: o derramamento de petróleo | Forças de interação interpartículas; misturas; solubilidade (AE3 | EM13CNT202)",
        "Aula 2 — Aula desafio: o derramamento de petróleo (continuação) | Eletronegatividade; geometria molecular; polaridade (AE3 | EM13CNT202)",
        "Aula 3 — Geometria molecular | Teoria VSEPR; geometria molecular (AE3 | EM13CNT202)",
        "Aula 4 — Forças de interação interpartículas | Polaridade; solubilidade; pontos de fusão e ebulição (AE3 | EM13CNT202)",
        "Aula 5 — [Complementar] Ideias da ciência sobre o início da vida | Origem da vida; aminoácidos, DNA e RNA (EM13CNT202)",
        "Aula 6 — Aminoácidos e proteínas: a base da vida | Interações intermoleculares; estrutura de aminoácidos e proteínas (AE3 | EM13CNT202)",
        "Aula 7 — Estrutura das proteínas e as interações moleculares | Interações intermoleculares; aminoácidos e proteínas (AE3 | EM13CNT202)",
        "Aula 8 — [Complementar] Bases, açúcares e ligações: entenda o DNA e o RNA | Interações intermoleculares; DNA e RNA (EM13CNT202)",
        "Aula 9 — Transformações | Transformações químicas; reagentes e produtos (AE4 | EM13CNT101)",
        "Aula 10 — Transformações: Oxidação da palha de aço | Equação química; linguagem própria da Química (AE4 | EM13CNT101)",
        "Aula 11 — Transformações nos processos produtivos | Processos produtivos; impactos socioambientais (AE4 | EM13CNT101)",
        "Aula 12 — A poesia da Química | Transformações físicas e químicas; rearranjo dos átomos (AE4 | EM13CNT101)",
        "Aula 13 — Reações que liberam e absorvem energia | Reações endotérmicas e exotérmicas (AE4 | EM13CNT101)",
        "Aula 14 — Reações de combustão | Combustão; combustível, comburente e fonte de ignição (AE4 | EM13CNT101)",
      ],
      "1ª Série — 3º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "1ª Série — 4º Bimestre": ["[Aguardando atualização do Guia do Currículo Priorizado]"],
      "2ª Série — 1º Bimestre": [
        "Aula 1 — Composição e propriedades dos materiais | Composição e propriedades dos materiais (AE1 | EM13CNT104)",
        "Aula 2 — Barragens e mineração | Ciclos biogeoquímicos; impactos da mineração e de barragens (AE1 | EM13CNT203)",
        "Aula 3 — Metais tóxicos: riscos à saúde e ao meio ambiente | Toxicidade das substâncias; metais pesados (AE1 | EM13CNT203)",
        "Aula 4 — Embalagens plásticas: riscos à saúde por uso inadequado | Composição, toxicidade e reatividade dos plásticos (AE1 | EM13CNT104)",
        "Aula 5 — Impactos provenientes do descarte incorreto dos plásticos | Poluição; reciclagem; gestão sustentável (AE1 | EM13CNT104)",
        "Aula 6 — Resíduos sólidos | Resíduos sólidos urbanos; políticas públicas (AE1 | EM13CNT206)",
        "Aula 7 — Efeito estufa e o cálculo das emissões de CO2 | Efeito estufa; equilíbrio térmico; emissão de CO2 (AE2 | EM13CNT102)",
        "Aula 8 — Dependência do mundo quanto ao uso de combustíveis não renováveis | Entalpia de combustão; recursos não renováveis (AE2 | EM13CNT309)",
        "Aula 9 — Comparação de poder calorífico e alternativas sustentáveis | Poder calorífico; energias alternativas (AE2 | EM13CNT309)",
        "Aula 10 — Recursos renováveis | Produção de biocombustíveis (AE2 | EM13CNT309)",
        "Aula 11 — Combustíveis alternativos | Biodiesel, etanol e biogás (AE2 | EM13CNT309)",
        "Aula 12 — Ampliando repertório energético | Entalpia de formação; energia de ligação; poder calorífico (AE2 | EM13CNT309)",
        "Aula 13 — Vantagens e desvantagens dos combustíveis alternativos | Combustíveis alternativos; Lei de Hess (AE2 | EM13CNT309)",
        "Aula 14 — Aspectos quantitativos da termoquímica | Energia de ligação; Lei de Hess (AE2 | EM13CNT309)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Introdução à química orgânica | Teoria da força vital; postulados de Kekulé; hibridização do carbono (AE3 | EM13CNT207)",
        "Aula 2 — Cadeias carbônicas | Representações das cadeias carbônicas (AE3 | EM13CNT207)",
        "Aula 3 — Hidrocarbonetos | Estrutura, nomenclatura e classificação dos hidrocarbonetos (AE3 | EM13CNT207)",
        "Aula 4 — Hidrocarbonetos ramificados | Estrutura e nomenclatura dos hidrocarbonetos ramificados (AE3 | EM13CNT207)",
        "Aula 5 — Identificando funções orgânicas oxigenadas | Álcool, fenol, aldeído e ácido carboxílico (AE3 | EM13CNT207)",
        "Aula 6 — Explorando as funções oxigenadas | Cetonas, éteres e ésteres (AE3 | EM13CNT207)",
        "Aula 7 — Funções orgânicas nitrogenadas e halogenadas | Funções orgânicas nitrogenadas e halogenadas (AE3 | EM13CNT207)",
        "Aula 8 — As drogas e a sociedade | ODS 3; drogas (AE3 | EM13CNT207)",
        "Aula 9 — [Complementar] Poluentes orgânicos persistentes e o saneamento básico | Poluentes orgânicos persistentes (EM13CNT310)",
        "Aula 10 — Estrutura e propriedade de micro e macro nutrientes | Vitaminas, proteínas, carboidratos e ácidos graxos; isomeria (AE4 | EM13CNT310)",
        "Aula 11 — [Complementar] Políticas públicas contra a insegurança alimentar | Agrotóxicos e fertilizantes: estrutura e composição (EM13CNT310)",
        "Aula 12 — Agrotóxicos e fertilizantes | Agrotóxicos e fertilizantes: estrutura e composição (AE4 | EM13CNT304)",
        "Aula 13 — Polímeros | Polímeros e isomeria; reações de polimerização (AE5 | EM13CNT304)",
        "Aula 14 — Síntese de polímeros | Polímeros e isomeria; boas práticas laboratoriais (AE5 | EM13CNT304)",
      ],
    },
    // ══════════════════════════════════════════════════════════════════════
    // SOCIOLOGIA  (Guia do Currículo Priorizado — EM — Sociologia)
    // Obs.: o Guia publicado contempla apenas a 2ª série (1º e 2º bimestres).
    // ══════════════════════════════════════════════════════════════════════
    "Sociologia": {
      "2ª Série — 1º Bimestre": [
        "Aula 1 — A Sociologia no Ensino Médio | Lugar da Sociologia nas Ciências Humanas; temas da 2ª série (AE1 | EM13CHS101)",
        "Aula 2 — O surgimento da Sociologia | Surgimento da Sociologia; Auguste Comte (AE1 | EM13CHS101)",
        "Aula 3 — A sociedade em Émile Durkheim | Fatos sociais; consciência coletiva; instituições sociais (AE1 | EM13CHS101)",
        "Aula 4 — Indivíduo e sociedade: a perspectiva de Émile Durkheim | Relação indivíduo-sociedade em Durkheim (AE1 | EM13CHS101)",
        "Aula 5 — A sociedade em Max Weber | Ação social: sentido e orientação; tipos de ação social (AE1 | EM13CHS101)",
        "Aula 6 — Indivíduo e sociedade: a perspectiva de Max Weber | Indivíduo como ator social; atribuição de sentido (AE1 | EM13CHS101)",
        "Aula 7 — A Sociologia no Ensino Médio (retomada) | Lugar da Sociologia; temas da 2ª série (AE1 | EM13CHS101)",
        "Aula 8 — Indivíduo e sociedade: a perspectiva de Karl Marx | Relação dialética; ideologia; alienação; ação coletiva (AE1 | EM13CHS101)",
        "Aula 9 — Cultura e sociedade | Definição de cultura nas ciências sociais (Tylor, Malinowski, Geertz) (AE2 | EM13CHS104)",
        "Aula 10 — Aprendendo a viver em sociedade: socialização e interação social | Socialização primária e secundária; sociabilidade (AE2 | EM13CHS104)",
        "Aula 11 — Eu, nós, eles: a construção social das identidades | Identidade social e pessoal (AE2 | EM13CHS104)",
        "Aula 12 — Identidade cultural e as relações entre culturas | Identidade cultural; etnocentrismo x relativismo cultural (AE2 | EM13CHS104)",
        "Aula 13 — O fazer sociológico | Estranhamento e desnaturalização; olhar sociológico (AE3 | EM13CHS103)",
        "Aula 14 — Praticando o olhar sociológico: identificando e analisando processos sociais | Análise de estudo de caso (AE3 | EM13CHS103)",
      ],
      "2ª Série — 2º Bimestre": [
        "Aula 1 — Os desafios da convivência em sociedade | Convivência em sociedade; produção social das diferenças (AE4 | EM13CHS401)",
        "Aula 2 — Marcadores sociais das diferenças | Marcadores sociais; preconceito, discriminação e intolerância (AE4 | EM13CHS401)",
        "Aula 3 — Estratificação social e diferenças | Processos de estratificação social; desigualdade (AE4 | EM13CHS401)",
        "Aula 4 — Estratificação social e classes sociais | Classe social; Marx e Weber; mobilidade social (AE4 | EM13CHS401)",
        "Aula 5 — As violências que nos afetam | Conceito de violência nas ciências sociais (AE5 | EM13CHS503)",
        "Aula 6 — A dimensão simbólica da violência | Violência simbólica; mecanismos (AE5 | EM13CHS503)",
        "Aula 7 — [Complementar] Relações de classe, desigualdades e violências | Relações de classe; violência de classe (EM13CHS502)",
        "Aula 8 — [Complementar] Análise de situações: relações de classe e desigualdades sociais no Brasil | Dados sobre desigualdades de classe (EM13CHS502)",
        "Aula 9 — Relações étnico-raciais, desigualdades e violências | Raça e etnia; racismo estrutural (AE6 | EM13CHS502)",
        "Aula 10 — Análise de situações: as relações étnico-raciais no Brasil | Desigualdades étnico-raciais; combate ao racismo (AE6 | EM13CHS502)",
        "Aula 11 — Relações sociais de gênero, desigualdades e violências | Gênero; tipos de violência de gênero (AE6 | EM13CHS502)",
        "Aula 12 — Análise de situações: as relações sociais de gênero no Brasil | Desigualdades de gênero; combate ao machismo (AE6 | EM13CHS502)",
        "Aula 13 — Diferentes sim, iguais também: os direitos de todos os seres humanos | Dignidade humana; Declaração Universal dos DH de 1948 (AE7 | EM13CHS605)",
        "Aula 14 — [Aula desafio] O estado dos Direitos Humanos | Direitos humanos no Brasil e no mundo (AE7 | EM13CHS605)",
      ],
    },
  };

  // ─── LISTAS AUXILIARES ────────────────────────────────────────────────────

  const COMPONENTES = Object.keys(ESCOPOS_POR_COMPONENTE).sort();
  const SERIES      = ["1ª Série", "2ª Série", "3ª Série"];
  const BIMESTRES   = ["1º Bimestre", "2º Bimestre"];
  const TURMAS      = ["A","B","C","D","E","F"].map(l => "Turma " + l);

  function blocoDeBimestreAtivo(blocoLabel) {
    return BIMESTRES.some(function(bimestre) {
      return blocoLabel.indexOf(bimestre) !== -1;
    });
  }

  const ESTRATEGIAS = [
    "Aula expositiva dialogada",
    "Discussão em grupo / roda de conversa",
    "Seminário",
    "Estudo de texto / leitura comentada",
    "Resolução de exercícios",
    "Trabalho em duplas ou trios",
    "Pesquisa orientada",
    "Produção escrita (redação, fichamento, análise)",
    "Análise de imagem / obra de arte / fonte histórica",
    "Debate estruturado",
    "Gamificação / dinâmica lúdica",
    "Projeto interdisciplinar",
    "Visita cultural (museu, exposição etc.)",
    "Uso de vídeo / documentário",
    "Podcast / produção de áudio",
    "Outra estratégia (descreva no campo de texto)",
  ];

  const RECURSOS = [
    "Livro didático / material impresso da Rede",
    "Slides do material digital (Escola Total / CMSP)",
    "Vídeo (YouTube, CMSP, plataformas educacionais)",
    "Quadro e giz / quadro branco",
    "Computador / notebook",
    "Projetor / TV",
    "Celular / tablet dos estudantes",
    "Texto complementar impresso",
    "Obra de arte / imagem / mapa",
    "Podcast / áudio",
    "Jogo / material manipulativo",
    "Plataforma digital (Google Classroom, Forms, Padlet etc.)",
    "Laboratório (ciências, informática)",
    "Espaço externo à sala de aula",
  ];

  // ─── CRIAÇÃO DO FORMULÁRIO ────────────────────────────────────────────────

  const form = obterFormulario_();
  limparItensFormulario_(form);
  form.setTitle("Planejamento Docente — Ensino Médio");
  form.setDescription(
    "Preencha este formulário para registrar o planejamento das suas aulas, " +
    "em alinhamento com o Currículo Priorizado da Secretaria de Educação do Estado de São Paulo.\n\n" +
    "Campos marcados com * são obrigatórios."
  );
  form.setCollectEmail(true);
  form.setProgressBar(true);

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 1 — IDENTIFICAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  form.addSectionHeaderItem()
    .setTitle("1. Identificação")
    .setHelpText("Informe seus dados e o contexto da aula planejada.");

  form.addTextItem()
    .setTitle("Nome completo do(a) professor(a) *")
    .setHelpText("Ex.: Maria da Silva")
    .setRequired(true);

  // Item de componente — choices com navegação condicional serão definidos depois
  const itemComponente = form.addListItem()
    .setTitle("Componente curricular *")
    .setRequired(true);

  itemComponente.setChoiceValues(COMPONENTES); // provisório; refeito ao final

  form.addListItem()
    .setTitle("Série *")
    .setRequired(true)
    .setChoiceValues(SERIES);

  form.addCheckboxItem()
    .setTitle("Turma(s) *")
    .setHelpText("Selecione todas as turmas para as quais este planejamento se aplica.")
    .setChoiceValues(TURMAS)
    .setRequired(true);

  form.addListItem()
    .setTitle("Bimestre *")
    .setRequired(true)
    .setChoiceValues(BIMESTRES);

  form.addTextItem()
    .setTitle("Data prevista para a(s) aula(s)")
    .setHelpText("Ex.: 03/06/2026  ou  03/06 a 07/06/2026");

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 2 — AULAS E OBJETIVOS  (uma seção por componente)
  //
  // Lógica de navegação:
  //   • Ao escolher o componente na Seção 1, o respondente é enviado
  //     diretamente para a seção daquele componente.
  //   • Componentes COM escopo: checkboxes agrupados por série/bimestre.
  //   • Componentes SEM currículo priorizado: campo de texto livre.
  //   • Componentes placeholder: campo de texto aberto (aguardando PDF).
  //   • Ao final de cada seção de componente, o respondente é encaminhado
  //     para a Seção 3 (Estratégias e Recursos).
  // ══════════════════════════════════════════════════════════════════════════

  const secoesPorComponente = {};

  COMPONENTES.forEach(function(componente) {
    var escopo = ESCOPOS_POR_COMPONENTE[componente];

    var secao = form.addPageBreakItem()
      .setTitle("Aulas e Objetivos — " + componente)
      .setHelpText(
        escopo && !escopo.placeholder && !escopo.semCurriculo
          ? "Selecione as aulas do Escopo-Sequência que você planeja trabalhar neste período. " +
            "As aulas estão organizadas por série e bimestre."
          : "Descreva as aulas e os objetivos previstos para este período."
      );

    secoesPorComponente[componente] = secao;

    if (escopo && !escopo.placeholder && !escopo.semCurriculo) {
      // ── Componente com escopo completo: checkboxes por bloco série/bimestre
      Object.keys(escopo).filter(blocoDeBimestreAtivo).forEach(function(blocoLabel) {
        var aulas = escopo[blocoLabel];
        form.addCheckboxItem()
          .setTitle("Aulas — " + blocoLabel)
          .setHelpText("Marque as aulas que fazem parte deste planejamento.")
          .setChoiceValues(aulas);
      });

    } else if (escopo && escopo.semCurriculo) {
      // ── Componente sem currículo priorizado: campo de texto livre
      form.addParagraphTextItem()
        .setTitle("Aulas e objetivos planejados *")
        .setHelpText(
          "Este componente não possui Currículo Priorizado publicado. " +
          "Descreva as aulas, os conteúdos e os objetivos de aprendizagem previstos."
        )
        .setRequired(true);

    } else {
      // ── Placeholder: escopo ainda não inserido
      form.addParagraphTextItem()
        .setTitle("Aulas e objetivos planejados")
        .setHelpText(
          "O Escopo-Sequência deste componente ainda não foi inserido no sistema. " +
          "Descreva as aulas e conteúdos previstos."
        );
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 3 — ESTRATÉGIAS DIDÁTICAS E RECURSOS
  // ══════════════════════════════════════════════════════════════════════════

  var secaoEstrategias = form.addPageBreakItem()
    .setTitle("2. Estratégias Didáticas e Recursos")
    .setHelpText("Como você vai conduzir e apoiar a aprendizagem?");

  form.addCheckboxItem()
    .setTitle("Estratégias didáticas *")
    .setHelpText("Selecione todas as estratégias previstas para esta aula/sequência.")
    .setChoiceValues(ESTRATEGIAS)
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("Descreva as estratégias didáticas *")
    .setHelpText(
      "Explique como as estratégias selecionadas serão aplicadas: " +
      "organização da turma, sequência de atividades, tempo previsto etc."
    )
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle("Recursos pedagógicos *")
    .setHelpText("Selecione os recursos que serão utilizados.")
    .setChoiceValues(RECURSOS)
    .setRequired(true);

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 4 — AVALIAÇÃO DOS OBJETIVOS DE APRENDIZAGEM
  // ══════════════════════════════════════════════════════════════════════════

  form.addPageBreakItem()
    .setTitle("3. Avaliação dos Objetivos de Aprendizagem")
    .setHelpText(
      "Reflita sobre como será verificado o alcance dos objetivos previstos."
    );

  form.addCheckboxItem()
    .setTitle("Instrumento(s) de avaliação previstos")
    .setChoiceValues([
      "Observação do desempenho em atividades",
      "Atividade escrita (exercícios, fichamento, análise)",
      "Prova / avaliação somativa",
      "Apresentação oral / seminário",
      "Trabalho em grupo",
      "Produção criativa (campanha, podcast, vídeo etc.)",
      "Autoavaliação dos estudantes",
      "Avaliação por pares",
      "Portfólio",
      "Prova Paulista (alinhamento)",
      "Outro instrumento",
    ]);

  form.addParagraphTextItem()
    .setTitle("Como você avaliará o alcance dos objetivos de aprendizagem? *")
    .setHelpText(
      "Descreva os critérios e procedimentos de avaliação previstos, " +
      "relacionando-os às Aprendizagens Essenciais e aos descritores da Prova Paulista."
    )
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("Observações / adaptações curriculares")
    .setHelpText(
      "Registre adaptações para estudantes com NEE, estratégias de recomposição " +
      "de aprendizagem, diferenciação para turmas avançadas ou qualquer outra observação relevante."
    );

  // ══════════════════════════════════════════════════════════════════════════
  // NAVEGAÇÃO CONDICIONAL: componente → seção correta de Aulas e Objetivos
  // ══════════════════════════════════════════════════════════════════════════

  var choicesComponente = COMPONENTES.map(function(componente) {
    return itemComponente.createChoice(componente, secoesPorComponente[componente]);
  });
  itemComponente.setChoices(choicesComponente);

  // Todas as seções de componente redirecionam para Estratégias ao terminar
  COMPONENTES.forEach(function(componente) {
    secoesPorComponente[componente].setGoToPage(secaoEstrategias);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LOG FINAL
  // ══════════════════════════════════════════════════════════════════════════

  var url     = form.getPublishedUrl();
  var editUrl = form.getEditUrl();

  Logger.log("=================================================");
  Logger.log("Formulário criado/atualizado com sucesso!");
  Logger.log("Link para responder : " + url);
  Logger.log("Link para editar    : " + editUrl);
  Logger.log("=================================================");

  return { url: url, editUrl: editUrl };
}
