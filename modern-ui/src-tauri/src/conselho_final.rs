// Documentos do conselho final (4º bimestre + 5º conceito): ata do resultado
// final e relatório dos professores. As regras de resultado ficam na tela
// (features/conselhoFinal/calculos.ts); aqui só se escreve o que ela manda,
// no mesmo modelo da ata do conselho bimestral.

use crate::*;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
};

const PASTA_CONSELHO_FINAL: &str = "conselho final";

#[derive(Deserialize, Clone)]
pub(crate) struct LinhaAtaFinalInput {
    pub(crate) matricula: String,
    /// "Aprovado", "Aprovado pelo Conselho", "Aprovado Parcialmente", "Retido".
    pub(crate) resultado: String,
    /// Sigla (ap, apc, app, rt) por disciplina, com o nome da lista `disciplinas`.
    pub(crate) siglas: HashMap<String, String>,
    #[serde(default)]
    pub(crate) frequencia: String,
}

#[derive(Deserialize, Clone)]
pub(crate) struct PendenciaProfessorInput {
    pub(crate) disciplina: String,
    /// "quinto" (alterar 5º conceito), "quarto" (alterar nota do 4º bimestre)
    /// ou "compensacao" (lançar compensação de ausências).
    pub(crate) tipo: String,
    pub(crate) numero: String,
    pub(crate) aluno: String,
    #[serde(default)]
    pub(crate) de: String,
    #[serde(default)]
    pub(crate) para: String,
    #[serde(default)]
    pub(crate) detalhe: String,
}

#[derive(Deserialize)]
pub(crate) struct DocumentosConselhoFinalInput {
    pub(crate) texto_ata: String,
    pub(crate) disciplinas: Vec<String>,
    pub(crate) alunos: Vec<LinhaAtaFinalInput>,
    pub(crate) pendencias: Vec<PendenciaProfessorInput>,
    pub(crate) gerar_relatorio: bool,
}

#[derive(Serialize)]
pub(crate) struct DocumentosConselhoFinalResultado {
    pub(crate) ata: String,
    pub(crate) relatorio: Option<String>,
}

pub(crate) fn pasta_documento_conselho_final(dados: &Value, raiz: &str) -> Result<PathBuf, String> {
    let codigo = dados.get("codigo").and_then(Value::as_str).unwrap_or("turma");
    let ano = dados.get("ano").and_then(Value::as_i64).unwrap_or(0);
    let serie = dados
        .get("serie")
        .and_then(Value::as_str)
        .filter(|valor| !valor.trim().is_empty())
        .unwrap_or(codigo);
    let serie = formatar_rotulo_turma_texto(serie);
    Ok(data_dir()
        .map_err(|err| err.to_string())?
        .join(raiz)
        .join(sanitizar_segmento(&ano.to_string()))
        .join(sanitizar_segmento(&serie))
        .join(PASTA_CONSELHO_FINAL))
}

pub(crate) fn arquivo_documento_conselho_final(dados: &Value, raiz: &str, prefixo: &str) -> Result<PathBuf, String> {
    let codigo = dados.get("codigo").and_then(Value::as_str).unwrap_or("turma");
    Ok(pasta_documento_conselho_final(dados, raiz)?
        .join(format!("{prefixo}_{}_conselho_final.docx", sanitizar_segmento(codigo))))
}

/// Ata e relatório do conselho final já gerados (para a lista de documentos).
pub(crate) fn documentos_conselho_final_existentes(dados: &Value) -> Vec<DocumentoConselho> {
    let mut documentos = Vec::new();
    for (raiz, prefixo, tipo) in [("atas", "ata", "ata"), ("relatorios", "relatorio_professores", "relatorio")] {
        if let Ok(path) = arquivo_documento_conselho_final(dados, raiz, prefixo) {
            if path.exists() {
                documentos.push(DocumentoConselho {
                    tipo: tipo.to_string(),
                    bimestre: "final".to_string(),
                    caminho: path.to_string_lossy().to_string(),
                });
            }
        }
    }
    documentos
}

#[tauri::command(async)]
pub(crate) fn gerar_documentos_conselho_final(
    caminho: String,
    input: DocumentosConselhoFinalInput,
) -> Result<DocumentosConselhoFinalResultado, String> {
    let _dados = travar_dados();
    let caminho = PathBuf::from(caminho);
    validar_caminho_turma(&caminho)?;
    let texto = fs::read_to_string(&caminho).map_err(|err| err.to_string())?;
    let mut dados: Value = serde_json::from_str(sem_lixo_no_fim(&texto)).map_err(|err| err.to_string())?;

    let ata = arquivo_documento_conselho_final(&dados, "atas", "ata")?;
    if let Some(pasta) = ata.parent() {
        fs::create_dir_all(pasta).map_err(|err| err.to_string())?;
    }
    escrever_ata_final_docx(&ata, &dados, &input)?;

    let relatorio = if input.gerar_relatorio {
        let arquivo = arquivo_documento_conselho_final(&dados, "relatorios", "relatorio_professores")?;
        if let Some(pasta) = arquivo.parent() {
            fs::create_dir_all(pasta).map_err(|err| err.to_string())?;
        }
        escrever_relatorio_conselho_final_docx(&arquivo, &dados, &input.pendencias)?;
        Some(arquivo)
    } else {
        None
    };

    // Guarda o texto da ata e a data, no registro da turma do conselho final.
    if let Some(objeto) = dados.as_object_mut() {
        let mapa = objeto
            .entry("conselho_final")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if !mapa.is_object() {
            *mapa = Value::Object(serde_json::Map::new());
        }
        if let Some(mapa) = mapa.as_object_mut() {
            let turma = mapa
                .entry("_turma")
                .or_insert_with(|| Value::Object(serde_json::Map::new()));
            if !turma.is_object() {
                *turma = Value::Object(serde_json::Map::new());
            }
            if let Some(turma) = turma.as_object_mut() {
                turma.insert("texto_ata".to_string(), Value::from(input.texto_ata.trim().to_string()));
                turma.insert("finalizado_em".to_string(), Value::from(Local::now().to_rfc3339()));
            }
        }
        marcar_bimestre_editado(objeto, "conselho_final", "_turma");
    }
    let texto_atualizado = serde_json::to_string_pretty(&dados).map_err(|err| err.to_string())?;
    escrever_json_atomicamente(&caminho, &texto_atualizado).map_err(|err| err.to_string())?;

    Ok(DocumentosConselhoFinalResultado {
        ata: ata.to_string_lossy().to_string(),
        relatorio: relatorio.map(|path| path.to_string_lossy().to_string()),
    })
}

pub(crate) fn montar_titulo_ata_final(dados: &Value) -> String {
    let codigo = dados.get("codigo").and_then(Value::as_str).unwrap_or("");
    let ano = dados.get("ano").and_then(Value::as_i64).unwrap_or(0);
    let sala = dados.get("sala").and_then(Value::as_str).unwrap_or("").trim();
    let mut partes = vec![format!("CONSELHO DE CLASSE FINAL - RESULTADO FINAL/{ano}")];
    if !codigo.trim().is_empty() {
        partes.push(codigo.trim().to_string());
    }
    if !sala.is_empty() {
        partes.push(format!("SALA {sala}"));
    }
    partes.join(" - ")
}

/// Linha da ata final: todos os alunos da turma, os que saíram também (com a
/// situação da matrícula e sem resultado).
pub(crate) struct LinhaAtaFinal {
    pub(crate) numero: String,
    pub(crate) nome: String,
    pub(crate) status: String,
    pub(crate) resultado: String,
    pub(crate) siglas: HashMap<String, String>,
    pub(crate) frequencia: String,
    pub(crate) linha_amarela: bool,
}

pub(crate) fn preparar_linhas_ata_final(dados: &Value, linhas: &[LinhaAtaFinalInput]) -> Vec<LinhaAtaFinal> {
    let por_matricula: HashMap<&str, &LinhaAtaFinalInput> =
        linhas.iter().map(|linha| (linha.matricula.as_str(), linha)).collect();
    let alunos = dados.get("alunos").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut saida = Vec::new();
    for (matricula, aluno) in &alunos {
        let status_raw = aluno.get("status").and_then(Value::as_str).unwrap_or("");
        let ativo = aluno.get("ativo").and_then(Value::as_bool).unwrap_or(true);
        // Aluno que a tela não mandou (inativo) fica na ata sem resultado.
        let linha = if ativo { por_matricula.get(matricula.as_str()) } else { None };
        saida.push(LinhaAtaFinal {
            numero: aluno
                .get("numero_chamada")
                .and_then(Value::as_i64)
                .map(|valor| valor.to_string())
                .unwrap_or_default(),
            nome: aluno.get("nome").and_then(Value::as_str).unwrap_or("").to_string(),
            status: status_ata(status_raw).to_string(),
            resultado: linha.map(|l| l.resultado.clone()).unwrap_or_default(),
            siglas: linha.map(|l| l.siglas.clone()).unwrap_or_default(),
            frequencia: linha.map(|l| l.frequencia.clone()).unwrap_or_default(),
            linha_amarela: matches!(status_raw, "NCOM" | "RM" | "TR"),
        });
    }
    saida.sort_by(|a, b| {
        let numero_a = a.numero.parse::<i64>().unwrap_or(i64::MAX);
        let numero_b = b.numero.parse::<i64>().unwrap_or(i64::MAX);
        (numero_a, a.nome.clone()).cmp(&(numero_b, b.nome.clone()))
    });
    saida
}

pub(crate) fn larguras_tabela_ata_final(total_disciplinas: usize) -> Vec<i32> {
    let largura_total = 11_100;
    let (numero, nome, status, resultado, freq) = (420, 2_250, 680, 1_500, 620);
    let reservado = numero + nome + status + resultado + freq;
    let disciplina = if total_disciplinas == 0 {
        500
    } else {
        ((largura_total - reservado) / total_disciplinas as i32).max(340)
    };
    let mut larguras = vec![numero, nome, status, resultado];
    larguras.extend(std::iter::repeat_n(disciplina, total_disciplinas));
    larguras.push(freq);
    larguras
}

pub(crate) fn escrever_ata_final_docx(caminho: &Path, dados: &Value, input: &DocumentosConselhoFinalInput) -> Result<(), String> {
    let titulo = montar_titulo_ata_final(dados);
    let linhas = preparar_linhas_ata_final(dados, &input.alunos);

    let mut documento = DocumentoDocx::new();
    documento.paragrafo("");
    documento.titulo_ata(&titulo);
    documento.paragrafo("");
    documento.paragrafo_justificado(&input.texto_ata, false, Some(20));
    documento.paragrafo("");

    let mut tabela = Vec::new();
    let mut cabecalho = vec![
        CelulaDocx::cabecalho("Nº"),
        CelulaDocx::cabecalho("ALUNO"),
        CelulaDocx::cabecalho("STATUS"),
        CelulaDocx::cabecalho("RESULTADO"),
    ];
    cabecalho.extend(
        input
            .disciplinas
            .iter()
            .map(|disciplina| CelulaDocx::cabecalho(&abreviar_disciplina(disciplina))),
    );
    cabecalho.push(CelulaDocx::cabecalho("FREQ (%)"));
    tabela.push(cabecalho);

    for linha in linhas {
        let cor = if linha.linha_amarela { Some("FFFF00") } else { None };
        let mut celulas = vec![
            CelulaDocx::texto(&linha.numero).centralizada().com_fundo("E6E6E6"),
            CelulaDocx::texto(&linha.nome).com_fundo("E6E6E6").alinhada("left"),
            CelulaDocx::texto(&linha.status).centralizada().fundo_opcional(cor),
            CelulaDocx::texto(&linha.resultado).centralizada().negrito().fundo_opcional(cor),
        ];
        celulas.extend(input.disciplinas.iter().map(|disciplina| {
            let sigla = linha.siglas.get(disciplina).cloned().unwrap_or_default();
            let mut celula = CelulaDocx::texto(&sigla).centralizada().fundo_opcional(cor);
            if sigla == "rt" || sigla == "app" {
                celula = celula.negrito();
            }
            celula
        }));
        celulas.push(CelulaDocx::texto(&linha.frequencia).centralizada().fundo_opcional(cor));
        tabela.push(celulas);
    }
    documento.tabela_celulas_com_larguras(tabela, &larguras_tabela_ata_final(input.disciplinas.len()), true);

    documento.paragrafo("");
    documento.tabela_celulas_com_larguras(
        vec![vec![
            CelulaDocx::texto("ap").centralizada().negrito().tamanho(16),
            CelulaDocx::texto("Aprovado").alinhada("left").tamanho(16).sem_borda(),
            CelulaDocx::texto("apc").centralizada().negrito().tamanho(16),
            CelulaDocx::texto("Aprovado pelo Conselho").alinhada("left").tamanho(16).sem_borda(),
            CelulaDocx::texto("app").centralizada().negrito().tamanho(16),
            CelulaDocx::texto("Aprovado Parcialmente (disciplina em dependência)").alinhada("left").tamanho(16).sem_borda(),
            CelulaDocx::texto("rt").centralizada().negrito().tamanho(16),
            CelulaDocx::texto("Retido").alinhada("left").tamanho(16).sem_borda(),
        ]],
        &[450, 1100, 450, 2000, 450, 4100, 450, 1100],
        false,
    );

    documento.paragrafo("");
    documento.paragrafo_negrito("ASSINATURA DOS PROFESSORES:");
    let mut assinaturas = Vec::new();
    for grupo in input.disciplinas.chunks(4) {
        let mut linha = grupo
            .iter()
            .map(|disciplina| CelulaDocx::texto(&nome_titulo(disciplina)).alinhada("left").tamanho(18).sem_borda())
            .collect::<Vec<_>>();
        while linha.len() < 4 {
            linha.push(CelulaDocx::texto("").sem_borda());
        }
        assinaturas.push(linha);
    }
    documento.tabela_celulas_com_larguras(assinaturas, &[2775, 2775, 2775, 2775], false);

    documento.paragrafo("");
    documento.tabela_celulas_com_larguras(
        vec![vec![
            CelulaDocx::texto("______________________________\nCoordenação Pedagógica")
                .centralizada()
                .tamanho(24)
                .sem_borda(),
            CelulaDocx::texto("______________________________\nDireção")
                .centralizada()
                .tamanho(24)
                .sem_borda(),
        ]],
        &[4500, 4500],
        false,
    );

    documento.salvar(caminho)
}

/// Relatório dos professores do conselho final: uma página por disciplina,
/// com o que cada professor precisa lançar na Sala do Futuro.
pub(crate) fn escrever_relatorio_conselho_final_docx(
    caminho: &Path,
    dados: &Value,
    pendencias: &[PendenciaProfessorInput],
) -> Result<(), String> {
    let codigo = dados.get("codigo").and_then(Value::as_str).unwrap_or("turma");
    let titulo = format!("Relatório dos professores – Conselho final – Turma {codigo}");
    let mut documento = DocumentoDocx::new();

    let mut por_disciplina: BTreeMap<String, Vec<&PendenciaProfessorInput>> = BTreeMap::new();
    for pendencia in pendencias {
        por_disciplina.entry(pendencia.disciplina.clone()).or_default().push(pendencia);
    }

    if por_disciplina.is_empty() {
        documento.paragrafo_negrito(&titulo);
        documento.paragrafo("");
        documento.caixa_aviso("NENHUMA PROVIDÊNCIA PARA OS PROFESSORES NESTE CONSELHO FINAL.");
        return documento.salvar(caminho);
    }

    let total = por_disciplina.len();
    for (indice, (disciplina, lista)) in por_disciplina.into_iter().enumerate() {
        documento.paragrafo_negrito(&titulo);
        documento.paragrafo("");
        documento.paragrafo_negrito(&format!("Disciplina: {}", nome_titulo(&disciplina)));
        documento.paragrafo("Providências do professor na Sala do Futuro depois do conselho final.");

        let filtrar = |tipo: &str| lista.iter().filter(|p| p.tipo == tipo).copied().collect::<Vec<_>>();
        let quinto = filtrar("quinto");
        let quarto = filtrar("quarto");
        let compensacao = filtrar("compensacao");

        let mut tarefas = Vec::new();
        if !quinto.is_empty() {
            tarefas.push("Alterar o 5º conceito na Sala do Futuro para os alunos listados abaixo.");
        }
        if !quarto.is_empty() {
            tarefas.push("Alterar a nota do 4º bimestre na Sala do Futuro para os alunos listados abaixo.");
        }
        if !compensacao.is_empty() {
            tarefas.push("Lançar a compensação de ausências (obrigatória) para os alunos listados abaixo: foram aprovados com frequência abaixo de 75%.");
        }
        for (numero, tarefa) in tarefas.iter().enumerate() {
            documento.paragrafo(&format!("{}. {tarefa}", numero + 1));
        }

        if !quinto.is_empty() {
            adicionar_tabela_relatorio(
                &mut documento,
                "Alterar o 5º conceito",
                vec!["Nº", "Aluno", "Nota no mapão", "Nota do conselho", "Decisão do conselho"],
                quinto
                    .iter()
                    .map(|p| vec![p.numero.clone(), p.aluno.clone(), p.de.clone(), p.para.clone(), p.detalhe.clone()])
                    .collect(),
                None,
            );
        }
        if !quarto.is_empty() {
            adicionar_tabela_relatorio(
                &mut documento,
                "Alterar a nota do 4º bimestre",
                vec!["Nº", "Aluno", "Nota no mapão", "Nota do conselho"],
                quarto
                    .iter()
                    .map(|p| vec![p.numero.clone(), p.aluno.clone(), p.de.clone(), p.para.clone()])
                    .collect(),
                None,
            );
        }
        if !compensacao.is_empty() {
            adicionar_tabela_relatorio(
                &mut documento,
                "Lançar compensação de ausências (obrigatória)",
                vec!["Nº", "Aluno", "Frequência no ano", "Faltas na disciplina"],
                compensacao
                    .iter()
                    .map(|p| vec![p.numero.clone(), p.aluno.clone(), p.de.clone(), p.para.clone()])
                    .collect(),
                None,
            );
        }

        if indice + 1 < total {
            documento.quebra_pagina();
        }
    }
    documento.salvar(caminho)
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn ata_final_traz_todos_os_alunos_inclusive_transferidos() {
        let dados = json!({
            "codigo": "1A",
            "alunos": {
                "111": {"nome": "ANA", "numero_chamada": 1},
                "222": {"nome": "BRUNO", "numero_chamada": 2, "ativo": false, "status": "TR"},
                "333": {"nome": "CARLA", "numero_chamada": 3}
            }
        });
        let linhas = vec![
            LinhaAtaFinalInput {
                matricula: "111".into(),
                resultado: "Aprovado".into(),
                siglas: HashMap::from([("MATEMATICA".to_string(), "ap".to_string())]),
                frequencia: "92".into(),
            },
            LinhaAtaFinalInput {
                matricula: "333".into(),
                resultado: "Aprovado Parcialmente".into(),
                siglas: HashMap::from([("MATEMATICA".to_string(), "app".to_string())]),
                frequencia: "80".into(),
            },
        ];
        let saida = preparar_linhas_ata_final(&dados, &linhas);
        assert_eq!(saida.len(), 3);
        assert_eq!(saida[0].resultado, "Aprovado");
        assert_eq!(saida[1].status, "TRANSFERIDO");
        assert!(saida[1].linha_amarela);
        assert_eq!(saida[1].resultado, "");
        assert_eq!(saida[2].siglas["MATEMATICA"], "app");
    }

    #[test]
    fn titulo_da_ata_final() {
        let dados = json!({"codigo": "1ª Série A", "ano": 2026, "sala": "12"});
        assert_eq!(
            montar_titulo_ata_final(&dados),
            "CONSELHO DE CLASSE FINAL - RESULTADO FINAL/2026 - 1ª Série A - SALA 12"
        );
    }
}

#[cfg(test)]
mod amostra {
    use super::*;
    use serde_json::json;

    /// Gera os dois documentos numa pasta temporária (CF_AMOSTRA=pasta).
    #[test]
    fn gerar_amostra_documentos() {
        let Ok(pasta) = std::env::var("CF_AMOSTRA") else { return };
        let dados = json!({
            "codigo": "1ª Série A", "ano": 2026, "sala": "12",
            "alunos": {
                "1": {"nome": "ANA BEATRIZ SOUZA", "numero_chamada": 1},
                "2": {"nome": "CARLA DIAS", "numero_chamada": 3},
                "3": {"nome": "KAUA OLIVEIRA", "numero_chamada": 11, "ativo": false, "status": "TR"}
            }
        });
        let disciplinas: Vec<String> = ["LINGUA PORTUGUESA", "MATEMATICA", "FISICA", "QUIMICA", "REDACAO E LEITURA"].iter().map(|s| s.to_string()).collect();
        let siglas = |v: [&str; 5]| disciplinas.iter().cloned().zip(v.iter().map(|s| s.to_string())).collect::<HashMap<_, _>>();
        let input = DocumentosConselhoFinalInput {
            texto_ata: "Reuniram-se os professores da turma para o Conselho de Classe Final.".into(),
            disciplinas: disciplinas.clone(),
            alunos: vec![
                LinhaAtaFinalInput { matricula: "1".into(), resultado: "Aprovado".into(), siglas: siglas(["ap", "ap", "ap", "ap", "ap"]), frequencia: "92".into() },
                LinhaAtaFinalInput { matricula: "2".into(), resultado: "Aprovado Parcialmente".into(), siglas: siglas(["ap", "apc", "app", "app", "ap"]), frequencia: "81".into() },
            ],
            pendencias: vec![
                PendenciaProfessorInput { disciplina: "MATEMATICA".into(), tipo: "quinto".into(), numero: "3".into(), aluno: "CARLA DIAS".into(), de: "4,0".into(), para: "5,0".into(), detalhe: "Aprovado pelo Conselho".into() },
                PendenciaProfessorInput { disciplina: "MATEMATICA".into(), tipo: "compensacao".into(), numero: "1".into(), aluno: "ANA BEATRIZ SOUZA".into(), de: "68%".into(), para: "31".into(), detalhe: "".into() },
            ],
            gerar_relatorio: true,
        };
        let pasta = PathBuf::from(pasta);
        escrever_ata_final_docx(&pasta.join("ata_final.docx"), &dados, &input).unwrap();
        escrever_relatorio_conselho_final_docx(&pasta.join("relatorio_final.docx"), &dados, &input.pendencias).unwrap();
    }
}
