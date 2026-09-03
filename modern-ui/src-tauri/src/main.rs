#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod apps_script_api;
mod atendimentos_lote;
mod apps_script_webapp_conteudo;
mod apps_script_webapp_pei_conteudo;
mod backup;
mod config;
mod conselho_pendrive;
mod diagnosticos;
mod docx;
mod fotos;
mod github_oauth;
mod google_oauth;
mod ia;
mod importador_alunos;
mod importador_expansoes;
mod importador_mapao;
mod infra;
mod mensagem_familia;
mod motor_relatorios;
mod pei;
mod pendencias;
mod planejamento;
mod prova_paulista;
mod sheets_api;
mod shell;
mod sync;
mod tipos;
mod turmas;
mod whatsapp_api;

// Re-exporta tudo na raiz do crate: os módulos (e o mod tests) enxergam
// os itens uns dos outros como antes da divisão do arquivo. O allow cobre os
// módulos autocontidos, cujos itens ninguém referencia pela raiz.
#[allow(unused_imports)]
pub(crate) use {
    apps_script_api::*, atendimentos_lote::*, apps_script_webapp_conteudo::*, apps_script_webapp_pei_conteudo::*, backup::*, config::*,
    conselho_pendrive::*, diagnosticos::*, docx::*, fotos::*, github_oauth::*, google_oauth::*, ia::*, importador_alunos::*,
    importador_expansoes::*, importador_mapao::*, infra::*, mensagem_familia::*, motor_relatorios::*, pei::*, pendencias::*, planejamento::*, prova_paulista::*,
    sheets_api::*, shell::*, sync::*, tipos::*, turmas::*, whatsapp_api::*,
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
            config::resolver_bimestre_atual,
            config::fixar_bimestre_pin,
            sync::publicar_estado_sincronizacao,
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
            importador_mapao::analisar_disciplinas_duplicadas,
            importador_mapao::corrigir_disciplinas_duplicadas,
            turmas::carregar_turma,
            turmas::salvar_ajustes_media,
            turmas::salvar_encaminhamentos,
            turmas::salvar_aluno_deliberado,
            turmas::salvar_tempo_conselho,
            turmas::salvar_coordenador_turma,
            turmas::salvar_pessoas_pei_turma,
            turmas::salvar_responsavel_pei_aluno,
            turmas::salvar_elegibilidade_aluno,
            turmas::salvar_lideranca_aluno,
            turmas::salvar_educacao_especial_aluno,
            turmas::salvar_responsaveis_aluno,
            shell::definir_fullscreen,
            docx::abrir_ata,
            docx::abrir_relatorio_professores,
            docx::listar_documentos_conselho,
            docx::abrir_documento_conselho,
            turmas::carregar_relatorio_atendimentos,
            turmas::salvar_atendimento_aluno,
            turmas::definir_followup_previsto,
            mensagem_familia::resolver_variaveis_mensagem,
            atendimentos_lote::avaliar_condicoes_atendimento_lote,
            whatsapp_api::carregar_config_whatsapp_api,
            whatsapp_api::salvar_config_whatsapp_api,
            whatsapp_api::desativar_whatsapp_api,
            whatsapp_api::testar_conexao_whatsapp_api,
            whatsapp_api::enviar_mensagem_whatsapp_api,
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
            pei::exportar_pei_aluno,
            pei::gerar_peis_lote,
            pei::carregar_peis_locais,
            pei::listar_alunos_elegiveis_com_disciplinas,
            pei::salvar_config_pei,
            pei::carregar_config_pei,
            pei::buscar_peis,
            pei::importar_config_pei_por_link,
            apps_script_api::provisionar_pei_automatico,
            turmas::listar_disciplinas_turma,
            pendencias::gerar_relatorio_pendencias,
            fotos::importar_fotos_turma,
            fotos::carregar_foto_aluno,
            fotos::salvar_posicao_foto,
            fotos::definir_foto_aluno,
            fotos::remover_foto_aluno,
            importador_alunos::analisar_lote_alunos,
            importador_alunos::aplicar_lote_alunos,
            importador_alunos::analisar_tarefas,
            importador_alunos::aplicar_tarefas,
            importador_expansoes::analisar_expansoes,
            importador_expansoes::aplicar_expansoes,
            diagnosticos::verificar_alunos_multiplas_turmas,
            diagnosticos::dispensar_caso_multiplas_turmas,
            prova_paulista::analisar_prova_paulista,
            prova_paulista::aplicar_prova_paulista,
            motor_relatorios::listar_definicoes_relatorio,
            motor_relatorios::listar_campos_disponiveis,
            motor_relatorios::listar_disciplinas_conhecidas,
            motor_relatorios::executar_relatorio_generico,
            motor_relatorios::pre_visualizar_relatorio,
            motor_relatorios::salvar_definicao_relatorio,
            motor_relatorios::excluir_definicao_relatorio,
            motor_relatorios::exportar_definicao_relatorio,
            motor_relatorios::importar_definicao_relatorio,
            motor_relatorios::listar_repositorio_relatorios,
            motor_relatorios::baixar_relatorio_repositorio,
            motor_relatorios::publicar_relatorio_repositorio,
            github_oauth::verificar_login_github,
            github_oauth::iniciar_login_github,
            github_oauth::concluir_login_github,
            github_oauth::esquecer_login_github,
            planejamento::buscar_planejamentos,
            planejamento::salvar_config_planejamento,
            planejamento::carregar_config_planejamento,
            planejamento::importar_config_planejamento_por_link,
            planejamento::obter_script_planejamento,
            planejamento::versao_script_planejamento,
            planejamento::abrir_planejamento_docx,
            planejamento::gerar_planejamentos_lote,
            planejamento::carregar_planejamentos_locais,
            apps_script_api::provisionar_planejamento_automatico
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

    // Cada dispositivo pode ter importado o mapão de um bimestre diferente antes de
    // sincronizar; o merge de "frequencia" precisa somar os bimestres em vez de trocar
    // o objeto inteiro, senão o total de faltas do ano some quando um lado sincroniza
    // por cima do outro.
    #[test]
    fn merge_de_turma_soma_faltas_de_bimestres_so_locais_e_so_do_incoming() {
        let local = json!({
            "codigo": "2A",
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "frequencia": {"3": {"MATEMATICA": 2.0}}
                }
            }
        });
        let incoming = json!({
            "codigo": "2A",
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "frequencia": {"1": {"MATEMATICA": 1.0}, "2": {"MATEMATICA": 3.0}}
                }
            }
        });

        let resultado = mesclar_arquivo_turma(&local, &incoming);

        let frequencia = &resultado["alunos"]["123"]["frequencia"];
        assert_eq!(frequencia["1"]["MATEMATICA"], json!(1.0));
        assert_eq!(frequencia["2"]["MATEMATICA"], json!(3.0));
        assert_eq!(frequencia["3"]["MATEMATICA"], json!(2.0));
    }

    // "Fre An(%)" é cumulativo: o valor do bimestre mais recente já inclui os
    // anteriores. Um sync trazendo um mapão mais antigo (de um dispositivo que ainda
    // não importou o bimestre atual) não pode fazer a frequência exibida regredir.
    #[test]
    fn merge_de_turma_nao_regride_frequencia_percentual_para_bimestre_mais_antigo() {
        let local = json!({
            "codigo": "2A",
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "frequencia_percentual": 88,
                    "frequencia_percentual_bimestre": "3"
                }
            }
        });
        let incoming = json!({
            "codigo": "2A",
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "frequencia_percentual": 95,
                    "frequencia_percentual_bimestre": "1"
                }
            }
        });

        let resultado = mesclar_arquivo_turma(&local, &incoming);

        assert_eq!(resultado["alunos"]["123"]["frequencia_percentual"], json!(88));
        assert_eq!(resultado["alunos"]["123"]["frequencia_percentual_bimestre"], json!("3"));
    }

    // Reintegração de pendrive chama mesclar_arquivo_turma(&valor_pendrive,
    // &valor_local): o pendrive entra como "local" do merge, então marcações
    // feitas durante o conselho fora da escola (encaminhamentos, aluno já
    // deliberado) precisam sobreviver à volta, mesmo que a máquina de origem
    // tenha dados antigos/diferentes para esses campos.
    #[test]
    fn merge_de_turma_traz_encaminhamentos_e_deliberado_do_pendrive() {
        let valor_pendrive = json!({
            "codigo": "2A",
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "encaminhamentos_conselho": {"1": [3, 9]},
                    "deliberados_conselho": {"1": true}
                }
            }
        });
        let valor_local = json!({
            "codigo": "2A",
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE",
                    "encaminhamentos_conselho": {},
                    "deliberados_conselho": {}
                }
            }
        });

        let resultado = mesclar_arquivo_turma(&valor_pendrive, &valor_local);

        assert_eq!(
            resultado["alunos"]["123"]["encaminhamentos_conselho"]["1"],
            json!([3, 9])
        );
        assert_eq!(resultado["alunos"]["123"]["deliberados_conselho"]["1"], json!(true));
    }
    use serde_json::{json, Value};
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
    fn aluno_deliberado_marca_e_desmarca_por_bimestre() {
        let mut dados = json!({
            "codigo": "2A",
            "ano": 2026,
            "alunos": {
                "123": {
                    "nome": "ALUNO TESTE"
                }
            }
        });

        aplicar_aluno_deliberado(&mut dados, "123", "1", true).unwrap();
        assert_eq!(dados["alunos"]["123"]["deliberados_conselho"]["1"], json!(true));
        assert!(extrair_aluno_deliberado(&dados["alunos"]["123"], "1"));
        assert!(!extrair_aluno_deliberado(&dados["alunos"]["123"], "2"));

        aplicar_aluno_deliberado(&mut dados, "123", "1", false).unwrap();
        assert!(dados["alunos"]["123"]["deliberados_conselho"]
            .as_object()
            .unwrap()
            .is_empty());
        assert!(!extrair_aluno_deliberado(&dados["alunos"]["123"], "1"));
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
            vice_direcao: vec![],
            nota_minima: 5.0,
            cabecalho_ata: None,
            lider_ativo: false,
            lider_rotulo: "Líder de sala".to_string(),
            elegivel_ativo: false,
            elegivel_rotulo: "Elegível".to_string(),
            atendimento_tipos: vec![],
            encaminhamento_opcoes: encaminhamento_opcoes_padrao(),
            mensagem_familia_templates: vec![],
            perfil_turma_ativo: false,
            perfil_turma_criterios: vec![],
            aluno_destaque_ativo: false,
            aluno_destaque_criterios: vec![],
            modo_notas_ata: modo_notas_ata_padrao(),
            prazo_1_semestre: String::new(),
            prazo_2_semestre: String::new(),
            bimestre_datas_inicio: vec![String::new(); 4],
            bimestre_pin: String::new(),
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

    // Mapão de "Tipo de Ensino: Expansão" (turma não seriada de
    // itinerário/aprofundamento — código "110" no SED): as disciplinas dele
    // recebem nota normalmente, mas não devem virar pendência de Plano de
    // Ensino no Planejamento. Ver mapao_eh_expansao/disciplinas_expansao.
    #[test]
    fn mapao_deteta_tipo_de_ensino_expansao() {
        let linhas: Vec<Vec<Data>> = vec![
            vec![Data::String("Ano Letivo:".into()), Data::String("2026".into())],
            vec![
                Data::String("Tipo de Ensino:".into()),
                Data::String("110 - EXPANSÃO NOVO EM".into()),
            ],
            vec![Data::String("Turma:".into()), Data::String("NÃO SERIADO A TARDE".into())],
        ];
        assert!(mapao_eh_expansao(&linhas, linhas.len()));
    }

    #[test]
    fn mapao_regular_nao_e_marcado_como_expansao() {
        let linhas: Vec<Vec<Data>> = vec![
            vec![Data::String("Ano Letivo:".into()), Data::String("2026".into())],
            vec![Data::String("Tipo de Ensino:".into()), Data::String("100 - Regular".into())],
            vec![Data::String("Turma:".into()), Data::String("1ª Série A".into())],
        ];
        assert!(!mapao_eh_expansao(&linhas, linhas.len()));
    }

    // Reproduz o caso real reportado: "ORIENTACAO DE ESTUDO - LINGUA
    // PORTUGUESA" (hífen, resíduo de antes da normalização atual existir) e
    // "ORIENTACAO DE ESTUDO LINGUA PORTUGUESA" (sem hífen, forma que
    // qualquer importação atual já grava) precisam cair no mesmo grupo.
    #[test]
    fn agrupar_grafias_duplicadas_reconhece_variacao_de_hifen() {
        let medias = json!({
            "1": {
                "ORIENTACAO DE ESTUDO - LINGUA PORTUGUESA": {"v": 7.0},
                "ORIENTACAO DE ESTUDO LINGUA PORTUGUESA": {"v": 6.0, "em": "2026-08-13T10:00:00-03:00"},
                "MATEMATICA": {"v": 8.0}
            }
        })
        .as_object()
        .unwrap()
        .clone();
        let grupos = agrupar_grafias_duplicadas(&medias);
        assert_eq!(grupos.len(), 1, "MATEMATICA não devia entrar — só tem uma grafia");
        let variantes = grupos.get("ORIENTACAO DE ESTUDO LINGUA PORTUGUESA").unwrap();
        assert_eq!(variantes.len(), 2);
    }

    // O caso real: a grafia com hífen só tem valor cru (sem "em", formato
    // legado); a sem hífen tem timestamp real. A com timestamp tem que
    // vencer — é sempre a mais nova/confiável nesse cenário.
    #[test]
    fn desduplicar_disciplinas_aluno_prefere_valor_com_timestamp() {
        let mut medias = json!({
            "1": {
                "ORIENTACAO DE ESTUDO - MATEMATICA": 3.0,
                "ORIENTACAO DE ESTUDO MATEMATICA": {"v": 3.5, "em": "2026-08-13T10:00:00-03:00"}
            }
        })
        .as_object()
        .unwrap()
        .clone();

        let fundidas = desduplicar_disciplinas_aluno(&mut medias);
        assert_eq!(fundidas.len(), 1);

        let bimestre1 = medias.get("1").unwrap().as_object().unwrap();
        assert_eq!(bimestre1.len(), 1, "só devia sobrar a chave canônica");
        assert!(bimestre1.contains_key("ORIENTACAO DE ESTUDO MATEMATICA"));
        assert_eq!(bimestre1["ORIENTACAO DE ESTUDO MATEMATICA"]["v"], json!(3.5));
    }

    // Quando só a grafia com hífen tem valor num bimestre (caso real: ela é
    // 100% bimestre 1), o valor não pode ser perdido na fusão — só muda de
    // chave.
    #[test]
    fn desduplicar_disciplinas_aluno_preserva_valor_unico_sem_timestamp() {
        let mut medias = json!({
            "1": { "ORIENTACAO DE ESTUDO - MATEMATICA": 3.0 },
            "2": { "ORIENTACAO DE ESTUDO MATEMATICA": {"v": 4.0, "em": "2026-08-13T10:00:00-03:00"} }
        })
        .as_object()
        .unwrap()
        .clone();

        desduplicar_disciplinas_aluno(&mut medias);

        assert_eq!(medias["1"]["ORIENTACAO DE ESTUDO MATEMATICA"], json!(3.0));
        assert_eq!(medias["2"]["ORIENTACAO DE ESTUDO MATEMATICA"]["v"], json!(4.0));
    }

    #[test]
    fn desduplicar_disciplinas_aluno_e_idempotente() {
        let mut medias = json!({
            "1": {
                "ORIENTACAO DE ESTUDO - MATEMATICA": 3.0,
                "ORIENTACAO DE ESTUDO MATEMATICA": {"v": 3.5, "em": "2026-08-13T10:00:00-03:00"}
            }
        })
        .as_object()
        .unwrap()
        .clone();

        desduplicar_disciplinas_aluno(&mut medias);
        let fundidas_segunda_vez = desduplicar_disciplinas_aluno(&mut medias);
        assert!(fundidas_segunda_vez.is_empty(), "rodar de novo não deveria achar mais nada pra fundir");
    }

    #[test]
    fn disciplina_sem_duplicata_nao_e_alterada() {
        let mut medias = json!({ "1": { "MATEMATICA": {"v": 8.0, "em": "2026-08-13T10:00:00-03:00"} } })
            .as_object()
            .unwrap()
            .clone();
        let fundidas = desduplicar_disciplinas_aluno(&mut medias);
        assert!(fundidas.is_empty());
        assert_eq!(medias["1"]["MATEMATICA"]["v"], json!(8.0));
    }

    // Caso real: a grafia com hífen também sobrou em `frequencia` (não só em
    // `medias`). A "Manutenção de dados" antiga só olhava `medias`, então a
    // linha fantasma continuava aparecendo com a frequência da grafia velha.
    #[test]
    fn agrupar_grafias_duplicadas_aluno_pega_frequencia() {
        let aluno = json!({
            "medias": { "1": { "ORIENTACAO DE ESTUDO MATEMATICA": {"v": 6.0} } },
            "frequencia": {
                "1": {
                    "ORIENTACAO DE ESTUDO - MATEMATICA": 7,
                    "ORIENTACAO DE ESTUDO MATEMATICA": 7.0
                }
            }
        });
        let grupos = agrupar_grafias_duplicadas_aluno(&aluno);
        assert_eq!(grupos.len(), 1);
        assert_eq!(grupos["ORIENTACAO DE ESTUDO MATEMATICA"].len(), 2);
    }

    // extrair_disciplinas não pode gerar duas linhas quando a grafia antiga
    // sobreviveu em algum dos mapas (aqui: só em `frequencia`).
    #[test]
    fn extrair_disciplinas_funde_grafia_residual_em_frequencia() {
        let info = json!({
            "medias": { "1": { "ORIENTACAO DE ESTUDO MATEMATICA": 6.0 } },
            "frequencia": { "1": { "ORIENTACAO DE ESTUDO - MATEMATICA": 3 } }
        });
        let carga = json!({ "1": { "ORIENTACAO DE ESTUDO MATEMATICA": 20 } })
            .as_object()
            .unwrap()
            .clone();
        let disciplinas = extrair_disciplinas(&info, "1", &carga);
        assert_eq!(disciplinas.len(), 1, "grafia com/sem hífen é uma matéria só");
        assert_eq!(disciplinas[0].nome, "ORIENTACAO DE ESTUDO MATEMATICA");
        assert_eq!(disciplinas[0].media_original, Some(6.0));
        assert_eq!(disciplinas[0].faltas, Some(3.0));
    }

    // Regressão: com um bimestre mais recente selecionado e ainda sem
    // lançamento, o boletim do aluno deve continuar listando as disciplinas
    // com notas dos bimestres anteriores (o rol de disciplinas é do ano, não
    // do bimestre). Antes, extrair_disciplinas só olhava o bimestre pedido e
    // devolvia lista vazia.
    #[test]
    fn extrair_disciplinas_mantem_disciplinas_de_bimestres_anteriores() {
        let info = json!({
            "medias": {
                "1": { "MATEMATICA": 6.0, "HISTORIA": 7.5 },
                "2": { "MATEMATICA": 5.5, "HISTORIA": 8.0 }
            },
            "frequencia": {
                "1": { "MATEMATICA": 2, "HISTORIA": 0 },
                "2": { "MATEMATICA": 1, "HISTORIA": 3 }
            }
        });
        let carga = json!({
            "1": { "MATEMATICA": 40, "HISTORIA": 20 },
            "2": { "MATEMATICA": 40, "HISTORIA": 20 }
        })
        .as_object()
        .unwrap()
        .clone();

        // 3º bimestre selecionado, nada lançado nele.
        let disciplinas = extrair_disciplinas(&info, "3", &carga);
        assert_eq!(disciplinas.len(), 2, "as duas disciplinas do ano continuam na lista");

        let matematica = disciplinas
            .iter()
            .find(|d| d.nome == "MATEMATICA")
            .expect("MATEMATICA presente");
        // Sem nota no 3º bimestre, mas o histórico traz 1º e 2º.
        assert_eq!(matematica.media_original, None);
        assert_eq!(matematica.situacao, "sem-nota");
        let bimestres: Vec<&str> = matematica
            .historico_bimestres
            .iter()
            .map(|h| h.bimestre.as_str())
            .collect();
        assert_eq!(bimestres, vec!["1", "2"]);
        // Frequência acumulada considera o ano todo.
        assert_eq!(matematica.faltas_acumuladas, Some(3.0));
        assert_eq!(matematica.total_aulas_acumuladas, Some(80.0));
    }

    // O resumo da turma conta os atendimentos e quantos têm follow-up
    // combinado em aberto — alimenta o subtítulo e a pílula da sidebar.
    #[test]
    fn resumir_turma_conta_atendimentos_e_followups_pendentes() {
        let turma: TurmaArquivo = serde_json::from_value(json!({
            "codigo": "2ª Série A",
            "ano": 2026,
            "serie": "2ª Série",
            "sala": "01",
            "periodo": "Manhã",
            "ciclo": "EM",
            "carga_horaria": {},
            "conselhos": {},
            "alunos": {
                "1": { "nome": "ALUNO UM", "ativo": true, "atendimentos": [
                    { "id": "a1", "followup_previsto": { "data": "2026-09-30", "descricao": "x" } },
                    { "id": "a2" }
                ]},
                "2": { "nome": "ALUNO DOIS", "ativo": true, "atendimentos": [
                    { "id": "a3", "followup_previsto": {} }
                ]},
                "3": { "nome": "ALUNO TRES", "ativo": true }
            }
        }))
        .unwrap();
        let resumo = resumir_turma(turma, std::path::PathBuf::from("turma_2a.json"));
        assert_eq!(resumo.total_atendimentos, 3);
        assert_eq!(resumo.followups_pendentes, 1, "objeto vazio não conta como pendência");
    }

    // followup_previsto no input tem 3 estados (Option<Option<_>>): ausente
    // não mexe no combinado, `null` limpa (registrar desfecho), objeto define.
    // Data vazia também limpa.
    #[test]
    fn normalizar_followup_previsto_input_cobre_os_tres_estados() {
        // Ausente: não mexe.
        assert_eq!(normalizar_followup_previsto_input(&None), None);

        // null explícito: limpar.
        assert_eq!(normalizar_followup_previsto_input(&Some(None)), Some(None));

        // Objeto com data: definir (com trim).
        let definir = Some(Some(FollowupPrevisto {
            data: " 2026-08-30 ".to_string(),
            descricao: "  Conferir entrega  ".to_string(),
        }));
        assert_eq!(
            normalizar_followup_previsto_input(&definir),
            Some(Some(json!({ "data": "2026-08-30", "descricao": "Conferir entrega" })))
        );

        // Objeto sem data: limpar.
        let sem_data = Some(Some(FollowupPrevisto {
            data: "  ".to_string(),
            descricao: "sobra".to_string(),
        }));
        assert_eq!(normalizar_followup_previsto_input(&sem_data), Some(None));
    }

    // Só "Projeto de Vida" não tem professor de componente que escreva Plano
    // de Ensino nem PEI — confirmado pelo coordenador em 10/08/2026. Redação
    // e Leitura e Orientação de Estudo são disciplinas regulares normais,
    // não entram aqui. Ver disciplina_e_de_apoio_sem_documento.
    #[test]
    fn disciplina_de_apoio_e_reconhecida_independente_de_grafia() {
        for nome in ["PROJETO DE VIDA", "Projeto de Vida", "projeto de vida"] {
            assert!(
                disciplina_e_de_apoio_sem_documento(nome),
                "esperava que {nome} fosse reconhecida como disciplina de apoio"
            );
        }
    }

    #[test]
    fn disciplina_regular_nao_e_confundida_com_disciplina_de_apoio() {
        for nome in [
            "MATEMATICA",
            "EDUCACAO FISICA",
            "LINGUA INGLESA",
            "Vida",
            "REDACAO E LEITURA",
            "Redação e Leitura",
            "ORIENTACAO DE ESTUDO MATEMATICA",
            "Orientação de Estudo - Matemática",
        ] {
            assert!(
                !disciplina_e_de_apoio_sem_documento(nome),
                "não esperava que {nome} fosse reconhecida como disciplina de apoio"
            );
        }
    }

    // Mapão normal e mapão de expansão podem grafar a mesma disciplina de
    // formas diferentes (acento, caixa) — só a grafia do mapão normal deve
    // valer, pra não duplicar a linha na tela (ex.: "Língua Inglesa" no
    // normal + "LINGUA INGLESA" no de expansão viravam duas disciplinas).
    #[test]
    fn reconhece_disciplina_regular_com_grafia_diferente() {
        let carga = json!({
            "1": {"Língua Inglesa": 2},
            "2": {"Matemática": 4}
        });
        let carga = carga.as_object().unwrap();
        assert!(ja_existe_disciplina_regular(Some(carga), "LINGUA INGLESA"));
        assert!(ja_existe_disciplina_regular(Some(carga), "lingua inglesa"));
        assert!(ja_existe_disciplina_regular(Some(carga), "Língua Inglesa"));
        assert!(!ja_existe_disciplina_regular(Some(carga), "GEOGRAFIA"));
        assert!(!ja_existe_disciplina_regular(None, "MATEMATICA"));
    }

    // Regressão: um peer com versão antiga do app grava o código da turma sem
    // formatação ("2a SERIE A") enquanto este dispositivo já tem a mesma turma
    // com o código formatado ("2ª Série A"). Como os nomes de arquivo divergem,
    // mesclar_diretorio_persistidos (que casa por nome exato) não os une — a
    // turma aparecia duplicada na listagem. desduplicar_turmas_por_codigo deve
    // juntar os dois num só arquivo, mantendo o nome/formatação já corretos e
    // sem perder alunos nem o ajuste de nota lançado no lado bom.
    #[test]
    fn desduplicar_turmas_por_codigo_une_arquivos_com_nomes_diferentes() {
        let pasta = env::temp_dir().join(format!("coordenacaoop_dedupe_test_{}", std::process::id()));
        let ano_dir = pasta.join("2026");
        if pasta.exists() {
            fs::remove_dir_all(&pasta).unwrap();
        }
        fs::create_dir_all(&ano_dir).unwrap();

        let bom = json!({
            "codigo": "2ª Série A",
            "ano": 2026,
            "serie": "2ª Série",
            "sala": "04",
            "periodo": "Manhã",
            "ciclo": "EM",
            "carga_horaria": {},
            "conselhos": {},
            "alunos": {
                "1": {
                    "nome": "ALUNO UM",
                    "ativo": true,
                    "ajustes_medias_conselho": {"1": {"MATEMATICA": {"media_original": 4.0, "media_ajustada": 5.5, "observacao": ""}}}
                }
            }
        });
        let cru = json!({
            "codigo": "2a SERIE A",
            "ano": 2026,
            "serie": "2a SERIE",
            "sala": "04",
            "periodo": "Manhã",
            "ciclo": "EM",
            "carga_horaria": {},
            "conselhos": {},
            "alunos": {
                "1": {"nome": "ALUNO UM", "ativo": true},
                "2": {"nome": "ALUNO DOIS", "ativo": true}
            }
        });

        let caminho_bom = ano_dir.join("turma_2a S_rie A.json");
        let caminho_cru = ano_dir.join("turma_2a SERIE A.json");
        fs::write(&caminho_bom, serde_json::to_string_pretty(&bom).unwrap()).unwrap();
        fs::write(&caminho_cru, serde_json::to_string_pretty(&cru).unwrap()).unwrap();

        desduplicar_turmas_por_codigo(&pasta).unwrap();

        assert!(caminho_bom.exists(), "arquivo com nome formatado deveria permanecer");
        assert!(!caminho_cru.exists(), "arquivo cru duplicado deveria ser removido");

        let resultado: Value = serde_json::from_str(&fs::read_to_string(&caminho_bom).unwrap()).unwrap();
        assert_eq!(resultado["codigo"], json!("2ª Série A"));
        assert_eq!(resultado["alunos"].as_object().unwrap().len(), 2);
        assert_eq!(
            resultado["alunos"]["1"]["ajustes_medias_conselho"]["1"]["MATEMATICA"]["media_ajustada"],
            json!(5.5)
        );
        assert_eq!(resultado["alunos"]["2"]["nome"], json!("ALUNO DOIS"));

        fs::remove_dir_all(&pasta).unwrap();
    }

    #[test]
    fn desduplicar_turmas_por_codigo_nao_mexe_quando_nao_ha_duplicata() {
        let pasta = env::temp_dir().join(format!("coordenacaoop_dedupe_unico_test_{}", std::process::id()));
        let ano_dir = pasta.join("2026");
        if pasta.exists() {
            fs::remove_dir_all(&pasta).unwrap();
        }
        fs::create_dir_all(&ano_dir).unwrap();

        let turma = json!({"codigo": "6º Ano A", "ano": 2026, "alunos": {}});
        let caminho = ano_dir.join("turma_6o Ano A.json");
        fs::write(&caminho, serde_json::to_string_pretty(&turma).unwrap()).unwrap();

        desduplicar_turmas_por_codigo(&pasta).unwrap();
        assert!(caminho.exists());

        fs::remove_dir_all(&pasta).unwrap();
    }
}
