#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod backup;
mod config;
mod conselho_pendrive;
mod docx;
mod fotos;
mod ia;
mod importador_alunos;
mod importador_mapao;
mod infra;
mod pei;
mod pendencias;
mod planejamento;
mod prova_paulista;
mod shell;
mod sync;
mod tipos;
mod turmas;

// Re-exporta tudo na raiz do crate: os módulos (e o mod tests) enxergam
// os itens uns dos outros como antes da divisão do arquivo. O allow cobre os
// módulos autocontidos, cujos itens ninguém referencia pela raiz.
#[allow(unused_imports)]
pub(crate) use {
    backup::*, config::*, conselho_pendrive::*, docx::*, fotos::*, ia::*, importador_alunos::*,
    importador_mapao::*, infra::*, pei::*, pendencias::*, planejamento::*, prova_paulista::*,
    shell::*, sync::*, tipos::*, turmas::*,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn main() {
    tauri::Builder::default()
        // Instância única: ao relançar pelo ícone, foca a janela existente
        // (que pode estar na bandeja) em vez de abrir outra. Deve ser o 1º plugin.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(janela) = app.get_webview_window("main") {
                let _ = janela.show();
                let _ = janela.unminimize();
                let _ = janela.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let abrir = MenuItem::with_id(app, "abrir", "Abrir", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair])?;

            let icone = app
                .default_window_icon()
                .ok_or("ícone padrão da janela não encontrado")?
                .clone();
            TrayIconBuilder::new()
                .icon(icone)
                .tooltip("CoordenacaoOP")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(janela) = app.get_webview_window("main") {
                            let _ = janela.show();
                            let _ = janela.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "abrir" => {
                        if let Some(janela) = app.get_webview_window("main") {
                            let _ = janela.show();
                            let _ = janela.set_focus();
                        }
                    }
                    "sair" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|janela, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Se esconder falhar, deixa a janela fechar normalmente em vez de travar.
                if janela.hide().is_ok() {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            config::app_info,
            config::carregar_configuracoes,
            config::salvar_configuracoes,
            infra::salvar_estado_ui,
            infra::carregar_estado_ui,
            config::salvar_cabecalho_ata,
            config::carregar_perfil_turma,
            config::salvar_perfil_turma,
            config::carregar_alunos_destaque,
            config::salvar_alunos_destaque,
            sync::publicar_estado_sincronizacao,
            sync::carregar_estado_sincronizacao,
            sync::carregar_estados_sincronizacao,
            sync::publicar_dados_institucionais_sincronizacao,
            sync::carregar_dados_institucionais_sincronizacao,
            backup::exportar_backup,
            backup::exportar_backup_seletivo,
            backup::importar_backup,
            backup::importar_backup_por_caminho,
            importador_alunos::importar_alunos_elegiveis,
            importador_mapao::analisar_diagnostico_aprendizagem,
            importador_mapao::aplicar_diagnostico_aprendizagem,
            ia::verificar_atualizacao,
            shell::enviar_notificacao,
            ia::diagnosticar_ia_local,
            ia::iniciar_ollama_local,
            ia::baixar_modelo_ia_local,
            ia::requisicao_ia_json,
            shell::abrir_url,
            shell::abrir_pasta,
            shell::preparar_anexo_kanban,
            shell::abrir_anexo_kanban,
            shell::preparar_anexo_atendimento,
            shell::abrir_anexo_atendimento,
            turmas::listar_turmas,
            turmas::criar_turma,
            turmas::editar_turma,
            turmas::excluir_turma,
            importador_mapao::analisar_mapoes_lote,
            importador_mapao::aplicar_mapoes_lote,
            turmas::carregar_turma,
            turmas::salvar_ajustes_media,
            turmas::salvar_encaminhamentos,
            turmas::salvar_tempo_conselho,
            turmas::salvar_coordenador_turma,
            turmas::salvar_elegibilidade_aluno,
            turmas::salvar_lideranca_aluno,
            turmas::salvar_educacao_especial_aluno,
            shell::definir_fullscreen,
            docx::abrir_ata,
            docx::abrir_relatorio_professores,
            docx::listar_documentos_conselho,
            docx::abrir_documento_conselho,
            docx::gerar_relatorio_alunos_criticos,
            docx::gerar_relatorio_alteracoes_notas,
            turmas::carregar_relatorio_atendimentos,
            turmas::salvar_atendimento_aluno,
            turmas::salvar_finalizacao_conselho,
            conselho_pendrive::preparar_pendrive_conselho,
            conselho_pendrive::reintegrar_pendrive_conselho,
            conselho_pendrive::detectar_pendrives_conselho,
            conselho_pendrive::listar_conselhos_externos,
            conselho_pendrive::cancelar_conselho_externo,
            pei::buscar_pei_planilha,
            pei::salvar_url_pei,
            pei::carregar_url_pei,
            pei::abrir_pei_docx,
            pei::gerar_peis_lote,
            pei::listar_alunos_elegiveis_com_disciplinas,
            turmas::listar_disciplinas_turma,
            pendencias::gerar_relatorio_pendencias,
            pendencias::gerar_relatorio_pendencia_lancamento,
            fotos::importar_fotos_turma,
            fotos::carregar_foto_aluno,
            fotos::salvar_posicao_foto,
            fotos::definir_foto_aluno,
            fotos::remover_foto_aluno,
            importador_alunos::analisar_lote_alunos,
            importador_alunos::aplicar_lote_alunos,
            importador_alunos::analisar_tarefas,
            importador_alunos::aplicar_tarefas,
            importador_alunos::gerar_relatorio_tarefas,
            prova_paulista::analisar_prova_paulista,
            prova_paulista::aplicar_prova_paulista,
            prova_paulista::gerar_relatorio_prova_paulista,
            planejamento::buscar_planejamentos,
            planejamento::salvar_config_planejamento,
            planejamento::carregar_config_planejamento,
            planejamento::obter_script_planejamento,
            planejamento::versao_script_planejamento,
            planejamento::abrir_planejamento_docx,
            planejamento::gerar_planejamentos_lote
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a nova interface do CoordenacaoOP");
}

#[cfg(test)]
mod tests {
    use super::*;
    use calamine::Data;
    use chrono::NaiveDate;
    use std::{env, fs, path::Path};

    #[test]
    fn merge_de_turma_traz_conselho_finalizado_em_outra_maquina() {
        let local = json!({
            "codigo": "2A",
            "alunos": {},
            "conselhos": {"2": {"gerar_ata": false, "gerar_relatorio": false}},
            "textos_ata": {"2": {"cabecalho": "", "corpo": "rascunho local"}}
        });
        let incoming = json!({
            "codigo": "2A",
            "alunos": {},
            "conselhos": {"2": {
                "gerar_ata": true,
                "gerar_relatorio": true,
                "tempo_segundos": 3600,
                "finalizado_em": "2026-07-01T10:00:00-03:00"
            }},
            "textos_ata": {"2": {"cabecalho": "", "corpo": "ata do conselho"}}
        });

        let resultado = mesclar_arquivo_turma(&local, &incoming);

        assert!(conselho_foi_finalizado(&resultado["conselhos"]["2"]));
        assert_eq!(
            resultado["conselhos"]["2"]["finalizado_em"],
            json!("2026-07-01T10:00:00-03:00")
        );
        assert_eq!(resultado["textos_ata"]["2"]["corpo"], json!("ata do conselho"));
    }

    #[test]
    fn merge_de_turma_nao_regride_conselho_ja_finalizado() {
        let local = json!({
            "conselhos": {"1": {
                "gerar_ata": true,
                "gerar_relatorio": true,
                "finalizado_em": "2026-05-10T09:00:00-03:00"
            }},
            "textos_ata": {"1": {"cabecalho": "", "corpo": "ata final"}}
        });
        let incoming = json!({
            "conselhos": {"1": {"gerar_ata": false, "gerar_relatorio": false}},
            "textos_ata": {"1": {"cabecalho": "", "corpo": "rascunho antigo"}}
        });

        let resultado = mesclar_arquivo_turma(&local, &incoming);

        assert!(conselho_foi_finalizado(&resultado["conselhos"]["1"]));
        assert_eq!(resultado["textos_ata"]["1"]["corpo"], json!("ata final"));
    }
    use serde_json::json;
    use std::io::Read;

    fn texto_documento_docx(caminho: &Path) -> String {
        let arquivo = fs::File::open(caminho).unwrap();
        let mut zip = zip::ZipArchive::new(arquivo).unwrap();
        let mut documento = zip.by_name("word/document.xml").unwrap();
        let mut texto = String::new();
        documento.read_to_string(&mut texto).unwrap();
        texto
    }

    #[test]
    fn salvar_ajuste_media_usa_formato_do_app_classico() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "medias": { "1": { "MATEMATICA": 4.0 } }
                }
            }
        });

        aplicar_ajustes_media(
            &mut dados,
            "123",
            "1",
            vec![AjusteMediaInput {
                disciplina: "MATEMATICA".to_string(),
                media_original: Some(4.0),
                media_ajustada: Some(5.5),
                observacao: Some("Ajustar apos conselho".to_string()),
            }],
        )
        .unwrap();

        let ajuste = &dados["alunos"]["123"]["ajustes_medias_conselho"]["1"]["MATEMATICA"];
        assert_eq!(ajuste["media_original"], json!(4.0));
        assert_eq!(ajuste["media_ajustada"], json!(5.5));
        assert_eq!(ajuste["observacao"], json!("Ajustar apos conselho"));
    }

    #[test]
    fn salvar_ajuste_media_em_branco_remove_registro() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "ajustes_medias_conselho": {
                        "1": {
                            "MATEMATICA": {
                                "media_original": 4.0,
                                "media_ajustada": 5.5,
                                "observacao": ""
                            }
                        }
                    }
                }
            }
        });

        aplicar_ajustes_media(
            &mut dados,
            "123",
            "1",
            vec![AjusteMediaInput {
                disciplina: "MATEMATICA".to_string(),
                media_original: Some(4.0),
                media_ajustada: None,
                observacao: None,
            }],
        )
        .unwrap();

        assert!(dados["alunos"]["123"]["ajustes_medias_conselho"]
            .as_object()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn salvar_encaminhamentos_usa_lista_ordenada_sem_repeticao() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE"
                }
            }
        });

        aplicar_encaminhamentos(&mut dados, "123", "1", vec![3, 1, 3, 12]).unwrap();

        assert_eq!(
            dados["alunos"]["123"]["encaminhamentos_conselho"]["1"],
            json!([1, 3])
        );
    }

    #[test]
    fn salvar_encaminhamentos_vazio_remove_bimestre() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "encaminhamentos_conselho": {
                        "1": [1, 3]
                    }
                }
            }
        });

        aplicar_encaminhamentos(&mut dados, "123", "1", vec![]).unwrap();

        assert!(dados["alunos"]["123"]["encaminhamentos_conselho"]
            .as_object()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn salvar_finalizacao_guarda_texto_ata_e_tempo() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {}
        });

        aplicar_finalizacao_conselho(
            &mut dados,
            "1",
            FinalizacaoConselhoInput {
                texto: "Texto completo da ata".to_string(),
                tempo_segundos: 3723,
                gerar_ata: true,
                gerar_relatorio: false,
            },
        )
        .unwrap();

        assert_eq!(dados["textos_ata"]["1"]["cabecalho"], json!(""));
        assert_eq!(
            dados["textos_ata"]["1"]["corpo"],
            json!("Texto completo da ata")
        );
        assert_eq!(dados["conselhos"]["1"]["tempo_segundos"], json!(3723));
        assert_eq!(dados["conselhos"]["1"]["gerar_ata"], json!(true));
        assert_eq!(dados["conselhos"]["1"]["gerar_relatorio"], json!(false));
    }

    #[test]
    fn data_da_ata_fica_por_extenso() {
        let data = NaiveDate::from_ymd_opt(2026, 5, 6).unwrap();

        assert_eq!(
            data_por_extenso(data),
            "seis de maio de dois mil e vinte e seis"
        );
    }

    #[test]
    fn situacao_encerrado_no_mapao_conta_como_aluno_ativo() {
        assert!(situacao_ativa_mapao(Some(&Data::String(
            "Encerrado".to_string()
        ))));
        assert!(!situacao_ativa_mapao(Some(&Data::String(
            "Transferido".to_string()
        ))));
    }

    #[test]
    fn documentos_do_conselho_incluem_tabelas_do_modelo_antigo() {
        let dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "serie": "2a SERIE",
            "sala": "05",
            "carga_horaria": {"1": {"MATEMATICA": 20, "HISTORIA": 20}},
            "alunos": {
                "1": {
                    "nome": "ALUNO TESTE",
                    "ativo": true,
                    "numero_chamada": 1,
                    "frequencia_percentual": 80,
                    "medias": {"1": {"MATEMATICA": 4.0, "HISTORIA": 4.0}},
                    "frequencia": {"1": {"MATEMATICA": 6, "HISTORIA": 0}},
                    "ajustes_medias_conselho": {
                        "1": {
                            "MATEMATICA": {
                                "media_original": 4.0,
                                "media_ajustada": 5.5,
                                "observacao": "Ajustar no diario"
                            }
                        }
                    },
                    "encaminhamentos_conselho": {"1": [3]}
                }
            }
        });
        let pasta = env::temp_dir().join(format!("coordenacaoop_docx_test_{}", std::process::id()));
        fs::create_dir_all(&pasta).unwrap();
        let ata = pasta.join("ata.docx");
        let relatorio = pasta.join("relatorio.docx");

        let config_teste = ConfiguracoesApp {
            direcao_nome: "DIRECAO".to_string(),
            direcao_pronome: "F".to_string(),
            nota_minima: 5.0,
            cabecalho_ata: None,
            lider_ativo: false,
            lider_rotulo: "Líder de sala".to_string(),
            elegivel_ativo: false,
            elegivel_rotulo: "Elegível".to_string(),
            atendimento_tipos: vec![],
            perfil_turma_ativo: false,
            perfil_turma_criterios: vec![],
            aluno_destaque_ativo: false,
            aluno_destaque_criterios: vec![],
        };
        escrever_ata_docx(&ata, &dados, "1", "Texto base da ata", &config_teste).unwrap();
        escrever_relatorio_professores_docx(&relatorio, &dados, "1").unwrap();

        let xml_ata = texto_documento_docx(&ata);
        assert!(xml_ata.contains("CONSELHO DE CLASSE"));
        assert!(xml_ata.contains("Outras observações e encaminhamentos"));
        assert!(xml_ata.contains("ASSINATURA DOS PROFESSORES"));

        let xml_relatorio = texto_documento_docx(&relatorio);
        assert!(xml_relatorio.contains("Relatório Pedagógico"));
        assert!(xml_relatorio.contains("Ajustar notas na Sala do Futuro"));
        assert!(xml_relatorio.contains("Ajustar no diario"));
        assert!(xml_relatorio.contains("NÃO HÁ AJUSTES DE NOTA NA SALA DO FUTURO"));
        assert!(xml_relatorio.matches("Relatório Pedagógico").count() >= 2);
    }

    #[test]
    fn parse_csv_pei_detecta_colunas_e_bimestre() {
        // Cabeçalhos reais da planilha de PEI do Google Forms
        let csv = "\"Carimbo de data/hora\",\"Endereço de e-mail\",\"Nome do Professor\",\"Nome do Estudante\",\"Componente Curricular\",\"Bimestre\",\"Quais conteúdos e habilidades do Currículo da Rede Estadual Paulista serão desenvolvidos no bimestre?\",\"Quais estratégias, intervenções pedagógicas e recursos de acessibilidade serão utilizados?\",\"Quais instrumentos serão utilizados para acompanhar o aprendizado?\",\"Quais vídeos, livros, jogos ou outras atividades podem ser indicados?\"\n\"26/05/2026 08:23:34\",\"prof@edu.sp.gov.br\",\"Ana Silva\",\"JOAO PEDRO SANTOS - 7° ANO A TARDE\",\"História\",\"1º Bimestre\",\"Modernidade e suas implicações\",\"Comparações visuais e debates\",\"Mapas mentais e textos adaptados\",\"Vídeos do YouTube e HQs\"\n";

        let registros = parsear_csv_pei(csv).expect("parse deve funcionar");
        assert_eq!(registros.len(), 1, "deve ter 1 registro");

        let r = &registros[0];
        assert_eq!(r.professor, "Ana Silva");
        assert_eq!(r.nome_aluno, "JOAO PEDRO SANTOS");
        assert_eq!(r.turma_aluno, "7° ANO A TARDE");
        assert_eq!(r.disciplina, "História");
        assert_eq!(r.bimestre, "1", "bimestre deve ser '1', não '1º Bimestre'");
        assert!(!r.conteudos.is_empty(), "conteúdos não deve ser vazio");
        assert!(!r.estrategias.is_empty(), "estratégias não deve ser vazio");
        assert!(!r.instrumentos.is_empty(), "instrumentos não deve ser vazio");
        assert!(!r.recursos.is_empty(), "recursos não deve ser vazio");
    }

    #[test]
    fn separar_nome_turma_pei_funciona() {
        let (nome, turma) = separar_nome_turma_pei("JOAO PEDRO SANTOS - 7° ANO A TARDE");
        assert_eq!(nome, "JOAO PEDRO SANTOS");
        assert_eq!(turma, "7° ANO A TARDE");

        let (nome2, turma2) = separar_nome_turma_pei("ANA CLARA");
        assert_eq!(nome2, "ANA CLARA");
        assert_eq!(turma2, "");
    }
}
