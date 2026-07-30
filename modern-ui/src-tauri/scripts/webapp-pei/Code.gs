// Web App do PEI — CoordenacaoOP.
// Implantado automaticamente via Apps Script API (ver apps_script_api.rs).
// PLANILHA_ID é substituído pelo Rust antes do upload do conteúdo.
// TURMAS_PEI e ELEGIVEIS_POR_TURMA vêm de um arquivo separado
// (DadosPeiReais.gs), gerado dinamicamente a cada implantação — ver
// apps_script_webapp_pei_conteudo.rs.

const PLANILHA_ID = "__PLANILHA_ID__";
const ABA_RESPOSTAS = "Respostas";

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

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("PEI — CoordenacaoOP")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
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
