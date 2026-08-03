// Web App de Planejamento — CoordenacaoOP.
// Implantado automaticamente via Apps Script API (ver apps_script_api.rs).
// PLANILHA_ID é substituído pelo Rust antes do upload do conteúdo.
// COMPONENTES_EXTRAS_* e o restante dos dados (Dados*.gs, DadosReais.gs) são
// arquivos separados no mesmo projeto — ver apps_script_webapp_conteudo.rs.

const PLANILHA_ID = "__PLANILHA_ID__";
const ABA_RESPOSTAS = "Respostas";
const TOKEN_LEITURA = "__TOKEN_LEITURA__";

function doGet(e) {
  var tokenRecebido = e && e.parameter && e.parameter.respostas;
  if (tokenRecebido) {
    return responderLeituraRespostas_(tokenRecebido);
  }
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Planejamento Docente — CoordenacaoOP")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// Rota de leitura para outros coordenadores: com o token correto, devolve as
// respostas em JSON (mesmo formato de linhas que a Sheets API autenticada já
// entrega), sem exigir OAuth nem compartilhar a planilha — quem já tem o
// link de leitura (só o coordenador que implantou deveria repassá-lo) lê os
// dados através deste Web App, que roda com a permissão de quem o publicou.
function responderLeituraRespostas_(tokenRecebido) {
  if (!TOKEN_LEITURA || tokenRecebido !== TOKEN_LEITURA) {
    return ContentService.createTextOutput(
      JSON.stringify({ erro: "Token inválido." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  var planilha = SpreadsheetApp.openById(PLANILHA_ID);
  var aba = planilha.getSheetByName(ABA_RESPOSTAS) || planilha.getSheets()[0];
  var valores = aba.getDataRange().getValues();
  var linhas = valores.slice(1).map(function (linha) {
    return linha.map(function (celula) {
      if (Object.prototype.toString.call(celula) === "[object Date]") {
        return celula.toISOString();
      }
      return String(celula);
    });
  });
  return ContentService.createTextOutput(
    JSON.stringify({ valores: linhas })
  ).setMimeType(ContentService.MimeType.JSON);
}

// Envio de e-mail (MailApp) não é herdado do OAuth externo usado para
// implantar via API — o Google exige uma autorização interativa própria do
// script pelo menos uma vez. Rode esta função MANUALMENTE uma única vez
// pelo editor (script.google.com → selecionar "autorizarEnvioEmail" no menu
// de funções → Executar ▶ → autorizar "Enviar e-mail em seu nome"). Depois
// disso, o envio dentro do Web App (registrarPlanejamento) passa a
// funcionar normalmente, sem precisar rodar isso de novo.
function autorizarEnvioEmail() {
  var meuEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({
    to: meuEmail,
    subject: "CoordenacaoOP — autorização de e-mail concluída",
    body: "Se você recebeu este e-mail, o envio de cópias por e-mail do Planejamento já está liberado.",
  });
}

// ── Normalização e filtros (mesma regra usada nos .gs legados) ─────────────

function normalizarNome_(texto) {
  if (!texto) return "";
  var mapa = {
    "Á": "A", "À": "A", "Â": "A", "Ã": "A", "Ä": "A",
    "á": "A", "à": "A", "â": "A", "ã": "A", "ä": "A",
    "É": "E", "È": "E", "Ê": "E", "Ë": "E",
    "é": "E", "è": "E", "ê": "E", "ë": "E",
    "Í": "I", "Ì": "I", "Î": "I", "Ï": "I",
    "í": "I", "ì": "I", "î": "I", "ï": "I",
    "Ó": "O", "Ò": "O", "Ô": "O", "Õ": "O", "Ö": "O",
    "ó": "O", "ò": "O", "ô": "O", "õ": "O", "ö": "O",
    "Ú": "U", "Ù": "U", "Û": "U", "Ü": "U",
    "ú": "U", "ù": "U", "û": "U", "ü": "U",
    "Ç": "C", "ç": "C", "Ñ": "N", "ñ": "N",
  };
  var resultado = "";
  for (var i = 0; i < texto.length; i++) {
    var ch = texto.charAt(i);
    resultado += mapa[ch] || ch.toUpperCase();
  }
  return resultado.trim().replace(/\s+/g, " ");
}

function ehBlocoReal_(aulas, verificaPlaceholder) {
  if (!aulas || aulas.length === 0) return false;
  if (verificaPlaceholder && aulas.length === 1 && aulas[0].indexOf("[Aguardando dados") === 0) {
    return false;
  }
  return true;
}

function bimestresValidos_(escopoComponente, unidade, bimestres, verificaPlaceholder) {
  return bimestres.filter(function (bimestre) {
    return ehBlocoReal_(escopoComponente[unidade + " — " + bimestre], verificaPlaceholder);
  });
}

function escopoTemAlgumDadoReal_(escopoComponente, unidades, bimestres, verificaPlaceholder) {
  return unidades.some(function (unidade) {
    return bimestresValidos_(escopoComponente, unidade, bimestres, verificaPlaceholder).length > 0;
  });
}

// ── Dados por segmento, sob demanda (carregamento tardio) ──────────────────

function configSegmento_(segmento) {
  if (segmento === "medio") {
    return {
      escopos: ESCOPOS_POR_COMPONENTE_MEDIO,
      componentesCurados: COMPONENTES_MEDIO,
      unidades: SERIES_MEDIO,
      rotuloUnidade: "Série",
      turmasPorUnidade: TURMAS_POR_SERIE_MEDIO,
      disciplinasReaisPorUnidade: DISCIPLINAS_REAIS_POR_SERIE_MEDIO,
      bimestres: BIMESTRES_MEDIO,
      estrategias: ESTRATEGIAS_MEDIO,
      recursos: RECURSOS_MEDIO,
      instrumentos: INSTRUMENTOS_AVALIACAO_MEDIO,
      verificaPlaceholder: true,
      componentesExtras: typeof COMPONENTES_EXTRAS_MEDIO !== "undefined" ? COMPONENTES_EXTRAS_MEDIO : {},
    };
  }
  if (segmento === "anos_finais") {
    return {
      escopos: ESCOPOS_POR_COMPONENTE_ANOS_FINAIS,
      componentesCurados: COMPONENTES_ANOS_FINAIS,
      unidades: ANOS_ANOS_FINAIS,
      rotuloUnidade: "Ano",
      turmasPorUnidade: TURMAS_POR_ANO_ANOS_FINAIS,
      disciplinasReaisPorUnidade: DISCIPLINAS_REAIS_POR_ANO_ANOS_FINAIS,
      bimestres: BIMESTRES_ANOS_FINAIS,
      estrategias: ESTRATEGIAS_ANOS_FINAIS,
      recursos: RECURSOS_ANOS_FINAIS,
      instrumentos: INSTRUMENTOS_AVALIACAO_ANOS_FINAIS,
      verificaPlaceholder: false,
      componentesExtras: typeof COMPONENTES_EXTRAS_ANOS_FINAIS !== "undefined" ? COMPONENTES_EXTRAS_ANOS_FINAIS : {},
    };
  }
  throw new Error("Segmento inválido: " + segmento);
}

// Chamado pelo cliente (google.script.run) só depois que o professor escolhe
// o segmento — evita mandar os dois segmentos (~900KB juntos) de uma vez.
function obterDadosSegmento(segmento) {
  var config = configSegmento_(segmento);

  // Componente aparece numa unidade (Série/Ano) se: uma disciplina real de
  // alguma turma daquela unidade casa com o nome curado (normalizado), OU
  // foi adicionado manualmente pelo coordenador (componentesExtras), OU —
  // só para componentes COM Escopo-Sequência real (não "sem currículo") —
  // o componente nunca teve dado real cadastrado em nenhuma unidade
  // (fallback: mantém visível até alguém preencher o currículo).
  var componentesPorUnidade = {};
  config.unidades.forEach(function (unidade) {
    var reais = (config.disciplinasReaisPorUnidade[unidade] || []).map(normalizarNome_);
    var extras = (config.componentesExtras[unidade] || []).map(normalizarNome_);
    componentesPorUnidade[unidade] = config.componentesCurados.filter(function (componente) {
      var normalizado = normalizarNome_(componente);
      if (reais.indexOf(normalizado) !== -1) return true;
      if (extras.indexOf(normalizado) !== -1) return true;
      var escopo = config.escopos[componente];
      if (escopo.semCurriculo) return false;
      return !escopoTemAlgumDadoReal_(escopo, config.unidades, config.bimestres, config.verificaPlaceholder);
    });
  });

  return {
    escopos: config.escopos,
    unidades: config.unidades,
    rotuloUnidade: config.rotuloUnidade,
    bimestres: config.bimestres,
    estrategias: config.estrategias,
    recursos: config.recursos,
    instrumentos: config.instrumentos,
    turmasPorUnidade: config.turmasPorUnidade,
    componentesPorUnidade: componentesPorUnidade,
    verificaPlaceholder: config.verificaPlaceholder,
  };
}

// ── Envio ────────────────────────────────────────────────────────────────

function registrarPlanejamento(dados) {
  var planilha = SpreadsheetApp.openById(PLANILHA_ID);
  var aba = planilha.getSheetByName(ABA_RESPOSTAS) || planilha.getSheets()[0];
  aba.appendRow([
    new Date(),
    dados.segmento || "",
    dados.professor || "",
    dados.unidade || "",
    (dados.turmas || []).join("; "),
    dados.componente || "",
    dados.bimestre || "",
    JSON.stringify(dados.aulas || []),
    dados.estrategias || "",
    dados.recursos || "",
    dados.instrumentos || "",
    dados.avaliacao || "",
    dados.observacoes || "",
  ]);

  // Cópia por e-mail é melhor-esforço: se falhar (quota, escopo, endereço
  // inválido etc.), não deve derrubar o envio — o registro já foi salvo na
  // planilha. O motivo do erro volta para o cliente (em vez de só no log do
  // Apps Script) para não ficar invisível.
  var resultado = { ok: true, emailSolicitado: !!dados.email, emailEnviado: false, avisoEmail: "" };
  if (dados.email) {
    try {
      enviarCopiaEmail_(dados);
      resultado.emailEnviado = true;
    } catch (erro) {
      resultado.avisoEmail = String(erro && erro.message ? erro.message : erro);
      Logger.log("Falha ao enviar cópia por e-mail: " + erro);
    }
  }

  return resultado;
}

function enviarCopiaEmail_(dados) {
  var linhas = [
    "Olá, " + (dados.professor || "") + "!",
    "",
    "Recebemos o planejamento a seguir:",
    "",
    "Segmento: " + (dados.segmento === "medio" ? "Ensino Médio" : "Anos Finais"),
    (dados.unidade || "") + " — Turma(s): " + (dados.turmas || []).join(", "),
    "Componente: " + (dados.componente || ""),
    dados.bimestre ? "Bimestre: " + dados.bimestre + "º" : "",
    "",
    "Aulas/objetivos planejados:",
  ]
    .concat((dados.aulas || []).map(function (aula) { return "• " + aula; }))
    .concat([
      "",
      "Estratégias: " + (dados.estrategias || "—"),
      "Recursos: " + (dados.recursos || "—"),
      "Instrumentos de avaliação: " + (dados.instrumentos || "—"),
      "Como avaliará: " + (dados.avaliacao || "—"),
      dados.observacoes ? "Observações: " + dados.observacoes : "",
      "",
      "Este é um e-mail automático de confirmação — não é preciso responder.",
    ])
    .filter(function (linha) { return linha !== ""; });

  MailApp.sendEmail({
    to: dados.email,
    subject: "Confirmação — Planejamento enviado (" + (dados.componente || "") + ")",
    body: linhas.join("\n"),
  });
}
