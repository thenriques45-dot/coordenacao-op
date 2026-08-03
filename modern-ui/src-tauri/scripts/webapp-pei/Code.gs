// Web App do PEI — CoordenacaoOP.
// Implantado automaticamente via Apps Script API (ver apps_script_api.rs).
// PLANILHA_ID é substituído pelo Rust antes do upload do conteúdo.
// TURMAS_PEI e ELEGIVEIS_POR_TURMA vêm de um arquivo separado
// (DadosPeiReais.gs), gerado dinamicamente a cada implantação — ver
// apps_script_webapp_pei_conteudo.rs.

const PLANILHA_ID = "__PLANILHA_ID__";
const ABA_RESPOSTAS = "Respostas";
const TOKEN_LEITURA = "__TOKEN_LEITURA__";

// Lista fixa (mesma do Google Forms legado do PEI) — usada quando o aluno
// elegível selecionado não tem nenhuma disciplina real cadastrada, para não
// travar o professor sem opção de componente.
const COMPONENTES_CURRICULARES_PEI = [
  "Língua Portuguesa", "Arte", "Educação Física", "Geografia", "História",
  "Matemática", "Projeto de Vida", "Língua Inglesa", "Ciências",
  "Redação e Leitura", "Orientação de Estudo - Matemática",
  "Orientação de Estudo - Português", "Tecnologia e Inovação",
  "Educação Financeira", "Biologia", "Física", "Química", "Filosofia",
  "Sociologia",
];

const BIMESTRES_PEI = ["1º Bimestre", "2º Bimestre", "3º Bimestre", "4º Bimestre"];

function doGet(e) {
  var tokenRecebido = e && e.parameter && e.parameter.respostas;
  if (tokenRecebido) {
    return responderLeituraRespostas_(tokenRecebido);
  }
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("PEI — CoordenacaoOP")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// Rota de leitura para outros coordenadores: com o token correto, devolve as
// respostas em JSON (mesmo formato de linhas que a Sheets API autenticada já
// entrega), sem exigir OAuth nem compartilhar a planilha — quem já tem o
// link de leitura (só o coordenador que implantou deveria repassá-lo) lê os
// dados através deste Web App, que roda com a permissão de quem o publicou.
// Contém dados sensíveis dos estudantes (PEI) — o link de leitura não deve
// ser divulgado para professores nem publicado em lugar público.
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
// script pelo menos uma vez, POR PROJETO (a autorização já concedida ao
// Web App de Planejamento não vale para este). Rode esta função
// MANUALMENTE uma única vez pelo editor (script.google.com → selecionar
// "autorizarEnvioEmail" no menu de funções → Executar ▶ → autorizar
// "Enviar e-mail em seu nome"). Depois disso, o envio dentro do Web App
// (registrarPei) passa a funcionar normalmente, sem precisar rodar isso de novo.
function autorizarEnvioEmail() {
  var meuEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({
    to: meuEmail,
    subject: "CoordenacaoOP — autorização de e-mail concluída",
    body: "Se você recebeu este e-mail, o envio de cópias por e-mail do PEI já está liberado.",
  });
}

function obterDadosPei() {
  return {
    turmas: TURMAS_PEI,
    elegiveisPorTurma: ELEGIVEIS_POR_TURMA,
    componentesFixos: COMPONENTES_CURRICULARES_PEI,
    bimestres: BIMESTRES_PEI,
  };
}

function registrarPei(dados) {
  var planilha = SpreadsheetApp.openById(PLANILHA_ID);
  var aba = planilha.getSheetByName(ABA_RESPOSTAS) || planilha.getSheets()[0];
  aba.appendRow([
    new Date(),
    dados.email || "",
    dados.professor || "",
    dados.nomeEstudanteCompleto || "",
    dados.nomeAluno || "",
    dados.turmaAluno || "",
    dados.disciplina || "",
    dados.bimestre || "",
    dados.conteudos || "",
    dados.estrategias || "",
    dados.instrumentos || "",
    dados.recursos || "",
  ]);

  // Cópia por e-mail é melhor-esforço: se falhar, não deve derrubar o
  // envio — o registro já foi salvo na planilha. O motivo do erro volta
  // para o cliente (em vez de só no log do Apps Script).
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
    "Recebemos o PEI a seguir:",
    "",
    "Aluno: " + (dados.nomeAluno || ""),
    "Turma: " + (dados.turmaAluno || ""),
    "Componente: " + (dados.disciplina || ""),
    dados.bimestre ? "Bimestre: " + dados.bimestre + "º" : "",
    "",
    "Conteúdos e habilidades: " + (dados.conteudos || "—"),
    "Estratégias e recursos de acessibilidade: " + (dados.estrategias || "—"),
    "Instrumentos de acompanhamento: " + (dados.instrumentos || "—"),
    "Recursos indicados: " + (dados.recursos || "—"),
    "",
    "Este é um e-mail automático de confirmação — não é preciso responder.",
  ].filter(function (linha) { return linha !== ""; });

  MailApp.sendEmail({
    to: dados.email,
    subject: "Confirmação — PEI enviado (" + (dados.nomeAluno || "") + ")",
    body: linhas.join("\n"),
  });
}
