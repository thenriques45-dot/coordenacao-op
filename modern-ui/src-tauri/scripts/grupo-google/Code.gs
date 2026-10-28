// "Carteiro" da sincronização do grupo do CoordenacaoOP.
//
// Publicado pelo app na conta Google de quem cria o grupo e executado como
// essa pessoa: guarda os arquivos do grupo numa pasta do Drive dela e os
// entrega a quem apresentar o código do grupo. Os colegas não fazem login no
// Google.
//
// Cada arquivo tem um dono só (o manifesto e o estado de cada computador) ou
// é gravado uma vez e nunca reescrito (blobs, nomeados pelo conteúdo), então
// não existe gravação concorrente no mesmo arquivo. O índice (caminho ->
// arquivo no Drive) é a única coisa compartilhada e só é alterado sob trava.
//
// Gerado pelo app: não edite à mão (a próxima republicação sobrescreve).

var TOKEN = "__TOKEN__";
var VERSAO = 1;
var NOME_PASTA = "CoordenacaoOP — Grupo de sincronização";

var CAMINHO_PERMITIDO = /^(state\/(institutional|peers)\/[A-Za-z0-9_-]+\.json|devices\/[A-Za-z0-9_-]+\.json|state\/blobs\/[0-9a-f]+-[0-9]+)$/;
var PREFIXO_BLOB = "state/blobs/";

function doGet() {
  pasta_();
  return HtmlService.createHtmlOutput(
    "<p style='font-family:sans-serif'>Grupo de sincronização do CoordenacaoOP autorizado. " +
      "Pode fechar esta janela e voltar ao app.</p>"
  );
}

function doPost(e) {
  var pedido;
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (err) {
    return resposta_({ erro: "Pedido inválido." });
  }
  if (!pedido || pedido.t !== TOKEN) {
    return resposta_({ erro: "Código do grupo inválido." });
  }
  try {
    if (pedido.a === "info") return resposta_({ ok: true, versao: VERSAO });
    if (pedido.a === "indice") return resposta_(indiceResumido_());
    if (pedido.a === "baixar") return resposta_(baixar_(pedido.caminhos || []));
    if (pedido.a === "enviar") return resposta_(enviar_(pedido.arquivos || {}));
    if (pedido.a === "limpar") return resposta_(limpar_(Number(pedido.idadeMinimaMs) || 0));
    return resposta_({ erro: "Ação desconhecida." });
  } catch (err) {
    return resposta_({ erro: String(err) });
  }
}

function resposta_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

function pasta_() {
  var propriedades = PropertiesService.getScriptProperties();
  var id = propriedades.getProperty("PASTA_ID");
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // Pasta apagada à mão: começa outra.
    }
  }
  var pasta = DriveApp.createFolder(NOME_PASTA);
  var indice = pasta.createFile("indice.json", JSON.stringify({ arquivos: {}, blobs: {} }), "application/json");
  propriedades.setProperty("PASTA_ID", pasta.getId());
  propriedades.setProperty("INDICE_ID", indice.getId());
  return pasta;
}

function lerIndice_() {
  pasta_();
  var id = PropertiesService.getScriptProperties().getProperty("INDICE_ID");
  var indice = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString());
  indice.arquivos = indice.arquivos || {};
  indice.blobs = indice.blobs || {};
  return indice;
}

function gravarIndice_(indice) {
  var id = PropertiesService.getScriptProperties().getProperty("INDICE_ID");
  DriveApp.getFileById(id).setContent(JSON.stringify(indice));
}

function indiceResumido_() {
  var indice = lerIndice_();
  var arquivos = {};
  Object.keys(indice.arquivos).forEach(function (caminho) {
    arquivos[caminho] = indice.arquivos[caminho].d;
  });
  return { arquivos: arquivos, blobs: Object.keys(indice.blobs) };
}

function entrada_(indice, caminho) {
  if (caminho.indexOf(PREFIXO_BLOB) === 0) return indice.blobs[caminho.substring(PREFIXO_BLOB.length)];
  return indice.arquivos[caminho];
}

function baixar_(caminhos) {
  var indice = lerIndice_();
  var saida = {};
  caminhos.forEach(function (caminho) {
    var entrada = entrada_(indice, String(caminho));
    if (!entrada) return;
    saida[caminho] = Utilities.base64Encode(DriveApp.getFileById(entrada.id).getBlob().getBytes());
  });
  return { arquivos: saida };
}

function enviar_(arquivos) {
  var trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    var pasta = pasta_();
    var indice = lerIndice_();
    var gravados = 0;
    Object.keys(arquivos).forEach(function (caminho) {
      if (!CAMINHO_PERMITIDO.test(caminho)) return;
      var item = arquivos[caminho];
      var nome = caminho.replace(/\//g, "__");
      if (caminho.indexOf(PREFIXO_BLOB) === 0) {
        var nomeBlob = caminho.substring(PREFIXO_BLOB.length);
        if (indice.blobs[nomeBlob]) return;
        var blob = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(item.b), "application/octet-stream", nome));
        indice.blobs[nomeBlob] = { id: blob.getId(), em: Date.now() };
      } else {
        var anterior = indice.arquivos[caminho];
        var novo = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(item.b), "application/json", nome));
        indice.arquivos[caminho] = { id: novo.getId(), d: String(item.d || ""), em: Date.now() };
        if (anterior) {
          try {
            DriveApp.getFileById(anterior.id).setTrashed(true);
          } catch (err) {
            // Já apagado: nada a fazer.
          }
        }
      }
      gravados += 1;
    });
    gravarIndice_(indice);
    return { ok: true, gravados: gravados };
  } finally {
    trava.releaseLock();
  }
}

// Mesmo nome que o app dá a um blob: "<fnv>-<tamanho>" a partir de
// "<tamanho>:<fnv>".
function nomeDoBlob_(descricao) {
  var partes = String(descricao).split(":");
  return partes[1] + "-" + partes[0];
}

// Apaga blobs que nenhum manifesto usa e que já têm `idadeMinimaMs`.
function limpar_(idadeMinimaMs) {
  var trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    var indice = lerIndice_();
    var emUso = {};
    Object.keys(indice.arquivos).forEach(function (caminho) {
      if (caminho.indexOf("state/institutional/") !== 0) return;
      var manifesto = JSON.parse(DriveApp.getFileById(indice.arquivos[caminho].id).getBlob().getDataAsString());
      var conteudo = manifesto.conteudo || {};
      Object.keys(conteudo).forEach(function (relativo) {
        emUso[nomeDoBlob_(conteudo[relativo])] = true;
      });
    });
    var agora = Date.now();
    var apagados = 0;
    Object.keys(indice.blobs).forEach(function (nome) {
      var blob = indice.blobs[nome];
      if (emUso[nome] || agora - blob.em < idadeMinimaMs) return;
      try {
        DriveApp.getFileById(blob.id).setTrashed(true);
      } catch (err) {
        // Já apagado.
      }
      delete indice.blobs[nome];
      apagados += 1;
    });
    gravarIndice_(indice);
    return { ok: true, apagados: apagados };
  } finally {
    trava.releaseLock();
  }
}
