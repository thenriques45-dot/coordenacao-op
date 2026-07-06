#![allow(unused_imports)]

// Structs e tipos compartilhados entre os módulos (DTOs dos comandos).
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).

use crate::*;

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx, XlsxError};
use rust_xlsxwriter::{Format, Workbook};
use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs, io,
    hash::{Hash, Hasher},
    io::Cursor,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, MutexGuard, PoisonError},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};


#[derive(Serialize)]
pub(crate) struct AppInfo {
    pub(crate) name: &'static str,
    pub(crate) stage: &'static str,
    pub(crate) version: &'static str,
    pub(crate) data_dir: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct OpcaoCriterioPerfil {
    pub(crate) nivel: String,
    pub(crate) label: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct CriterioPerfil {
    pub(crate) id: String,
    pub(crate) nome: String,
    pub(crate) opcoes: Vec<OpcaoCriterioPerfil>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct CriterioDestaque {
    pub(crate) id: String,
    pub(crate) titulo: String,
    pub(crate) icone: String,
}

#[derive(Serialize)]
pub(crate) struct ConfiguracoesApp {
    pub(crate) direcao_nome: String,
    pub(crate) direcao_pronome: String,
    pub(crate) nota_minima: f64,
    pub(crate) cabecalho_ata: Option<String>,
    pub(crate) lider_ativo: bool,
    pub(crate) lider_rotulo: String,
    pub(crate) elegivel_ativo: bool,
    pub(crate) elegivel_rotulo: String,
    pub(crate) atendimento_tipos: Vec<String>,
    pub(crate) perfil_turma_ativo: bool,
    pub(crate) perfil_turma_criterios: Vec<CriterioPerfil>,
    pub(crate) aluno_destaque_ativo: bool,
    pub(crate) aluno_destaque_criterios: Vec<CriterioDestaque>,
    pub(crate) modo_notas_ata: String,
}

#[derive(Deserialize)]
pub(crate) struct ConfiguracoesInput {
    pub(crate) direcao_nome: String,
    pub(crate) direcao_pronome: String,
    pub(crate) nota_minima: f64,
    pub(crate) lider_ativo: bool,
    pub(crate) lider_rotulo: String,
    pub(crate) elegivel_ativo: bool,
    pub(crate) elegivel_rotulo: String,
    #[serde(default)]
    pub(crate) atendimento_tipos: Vec<String>,
    #[serde(default)]
    pub(crate) perfil_turma_ativo: bool,
    #[serde(default)]
    pub(crate) perfil_turma_criterios: Vec<CriterioPerfil>,
    #[serde(default)]
    pub(crate) aluno_destaque_ativo: bool,
    #[serde(default)]
    pub(crate) aluno_destaque_criterios: Vec<CriterioDestaque>,
    #[serde(default = "modo_notas_ata_padrao")]
    pub(crate) modo_notas_ata: String,
}

#[derive(Deserialize)]
pub(crate) struct ImagemCabecalhoInput {
    pub(crate) nome: String,
    pub(crate) bytes: Vec<u8>,
}

#[derive(Deserialize)]
pub(crate) struct SyncStateInput {
    pub(crate) pasta: String,
    pub(crate) device_id: String,
    pub(crate) payload: Value,
}

#[derive(Serialize)]
pub(crate) struct SyncStateResultado {
    pub(crate) caminho: String,
    pub(crate) atualizado_em: String,
}

#[derive(Deserialize)]
pub(crate) struct SyncInstitutionalInput {
    pub(crate) pasta: String,
    pub(crate) device_id: String,
}

#[derive(Serialize)]
pub(crate) struct SyncInstitutionalResultado {
    pub(crate) caminho: Option<String>,
    pub(crate) arquivos: usize,
    pub(crate) atualizado_em: String,
    pub(crate) backup_seguranca: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct KanbanAnexoResultado {
    pub(crate) id: String,
    pub(crate) nome: String,
    pub(crate) tipo: String,
    pub(crate) dados: String,
    pub(crate) caminho: Option<String>,
    pub(crate) origem: String,
}

#[derive(Deserialize)]
pub(crate) struct BackupImportInput {
    pub(crate) nome: String,
    pub(crate) bytes: Vec<u8>,
    pub(crate) modo: String,
}

#[derive(Deserialize)]
pub(crate) struct CsvImportInput {
    pub(crate) nome: String,
    pub(crate) bytes: Vec<u8>,
}

#[derive(Deserialize)]
pub(crate) struct BackupExportInput {
    pub(crate) ciclos: Option<Vec<String>>,
}

#[derive(Serialize)]
pub(crate) struct BackupResultado {
    pub(crate) caminho: Option<String>,
    pub(crate) arquivos: usize,
    pub(crate) arquivos_importados: usize,
    pub(crate) conflitos: Vec<String>,
    pub(crate) backup_seguranca: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct GithubRelease {
    pub(crate) tag_name: String,
    pub(crate) html_url: String,
}

#[derive(Serialize)]
pub(crate) struct AtualizacaoInfo {
    pub(crate) versao_atual: String,
    pub(crate) versao_disponivel: Option<String>,
    pub(crate) disponivel: bool,
    pub(crate) url: Option<String>,
    pub(crate) mensagem: String,
}

#[derive(Serialize)]
pub(crate) struct DiagnosticoIaLocal {
    pub(crate) ollama_instalado: bool,
    pub(crate) servidor_ativo: bool,
    pub(crate) modelo_instalado: bool,
    pub(crate) modelos: Vec<String>,
    pub(crate) mensagem: String,
}

#[derive(Deserialize)]
pub(crate) struct ModeloIaInput {
    pub(crate) modelo: String,
}

#[derive(Deserialize)]
pub(crate) struct RequisicaoIaJsonInput {
    pub(crate) url: String,
    pub(crate) headers: BTreeMap<String, String>,
    pub(crate) body: Value,
}

#[derive(Serialize)]
pub(crate) struct RequisicaoIaJsonResultado {
    pub(crate) status: u16,
    pub(crate) body: Value,
}

#[derive(Deserialize)]
pub(crate) struct OllamaTagsResponse {
    pub(crate) models: Option<Vec<OllamaModelInfo>>,
}

#[derive(Deserialize)]
pub(crate) struct OllamaModelInfo {
    pub(crate) name: String,
}

#[derive(Clone)]
pub(crate) struct RegistroElegivelCsv {
    pub(crate) matricula: String,
    pub(crate) nome: String,
    pub(crate) nome_normalizado: String,
    pub(crate) deficiencias: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct ResultadoImportacaoElegiveis {
    pub(crate) registros_csv: usize,
    pub(crate) turmas_lidas: usize,
    pub(crate) turmas_atualizadas: usize,
    pub(crate) alunos_atualizados: usize,
    pub(crate) por_matricula: usize,
    pub(crate) por_nome: usize,
    pub(crate) nao_encontrados: Vec<String>,
    pub(crate) nomes_ambiguos: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct TurmaResumo {
    pub(crate) codigo: String,
    pub(crate) ano: i64,
    pub(crate) serie: Option<String>,
    pub(crate) sala: Option<String>,
    pub(crate) periodo: Option<String>,
    pub(crate) ciclo: Option<String>,
    pub(crate) coordenador_turma: Option<String>,
    pub(crate) lider_sala: Option<String>,
    pub(crate) vice_lider_sala: Option<String>,
    pub(crate) total_alunos: usize,
    pub(crate) alunos_ativos: usize,
    pub(crate) alunos_elegiveis: usize,
    pub(crate) nomes_alunos: Vec<String>,
    pub(crate) conselhos_com_ajustes: usize,
    pub(crate) conselho_finalizado: bool,
    // Bimestre -> data da finalização (RFC3339; vazio em registros antigos).
    pub(crate) conselhos_finalizados: BTreeMap<String, String>,
    // Bimestres com conselho preparado em pendrive e ainda não reintegrado.
    pub(crate) em_conselho_externo: Vec<String>,
    pub(crate) caminho: String,
}

#[derive(Serialize)]
pub(crate) struct TurmaDetalhe {
    pub(crate) codigo: String,
    pub(crate) ano: i64,
    pub(crate) coordenador_turma: Option<String>,
    pub(crate) bimestre: String,
    pub(crate) tempo_conselho_segundos: i64,
    pub(crate) texto_ata: String,
    pub(crate) alunos: Vec<AlunoDetalhe>,
}

#[derive(Serialize)]
pub(crate) struct FinalizacaoResultado {
    pub(crate) turma: TurmaDetalhe,
    pub(crate) ata: Option<String>,
    pub(crate) relatorio: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct DocumentoConselho {
    pub(crate) tipo: String,
    pub(crate) bimestre: String,
    pub(crate) caminho: String,
}

#[derive(Deserialize)]
pub(crate) struct AbrirDocumentoConselhoInput {
    pub(crate) caminho: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct AtendimentoAluno {
    pub(crate) id: String,
    pub(crate) data: String,
    #[serde(default)]
    pub(crate) tipos: Vec<String>,
    pub(crate) atendido: String,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
    pub(crate) descricao: String,
    #[serde(default)]
    pub(crate) anexos: Vec<KanbanAnexoResultado>,
    #[serde(default)]
    pub(crate) followups: Vec<AtendimentoFollowUp>,
    pub(crate) criado_em: Option<String>,
    pub(crate) atualizado_em: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct AtendimentoFollowUp {
    pub(crate) id: String,
    pub(crate) data: String,
    #[serde(default)]
    pub(crate) tipos: Vec<String>,
    pub(crate) atendido: String,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
    pub(crate) descricao: String,
    #[serde(default)]
    pub(crate) anexos: Vec<KanbanAnexoResultado>,
    pub(crate) criado_em: Option<String>,
    pub(crate) atualizado_em: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct AlunoDetalhe {
    pub(crate) matricula: String,
    pub(crate) nome: String,
    pub(crate) ativo: bool,
    pub(crate) numero_chamada: Option<i64>,
    pub(crate) elegivel: bool,
    pub(crate) lideranca_sala: Option<String>,
    pub(crate) deficiencias: Vec<String>,
    pub(crate) comentario_educacao_especial: Option<String>,
    pub(crate) frequencia_percentual: Option<f64>,
    pub(crate) encaminhamentos: Vec<i64>,
    pub(crate) deliberado: bool,
    pub(crate) atendimentos: Vec<AtendimentoAluno>,
    pub(crate) diagnostico_aprendizagem: Option<DiagnosticoAprendizagem>,
    pub(crate) disciplinas: Vec<DisciplinaDetalhe>,
}

#[derive(Serialize)]
pub(crate) struct DiagnosticoAprendizagem {
    pub(crate) turma_origem: Option<String>,
    pub(crate) portugues: DiagnosticoComponente,
    pub(crate) matematica: DiagnosticoComponente,
    pub(crate) atualizado_em: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct DiagnosticoComponente {
    pub(crate) aprendizagem_equivalente: Option<String>,
    pub(crate) status: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct AtribuicaoNota {
    pub(crate) por: String,
    pub(crate) em: String,
}

#[derive(Serialize)]
pub(crate) struct DisciplinaDetalhe {
    pub(crate) nome: String,
    pub(crate) media_original: Option<f64>,
    pub(crate) media_conselho: Option<f64>,
    pub(crate) quinto_conceito: Option<f64>,
    pub(crate) observacao_conselho: Option<String>,
    pub(crate) faltas: Option<f64>,
    pub(crate) total_aulas: Option<f64>,
    pub(crate) faltas_acumuladas: Option<f64>,
    pub(crate) total_aulas_acumuladas: Option<f64>,
    pub(crate) historico_bimestres: Vec<NotaBimestre>,
    pub(crate) situacao: String,
    pub(crate) atribuicao_media: Option<AtribuicaoNota>,
}

#[derive(Serialize)]
pub(crate) struct NotaBimestre {
    pub(crate) bimestre: String,
    pub(crate) media: f64,
}

#[derive(Deserialize, Serialize)]
pub(crate) struct TurmaArquivo {
    pub(crate) codigo: String,
    pub(crate) ano: i64,
    pub(crate) serie: Option<String>,
    pub(crate) sala: Option<String>,
    pub(crate) periodo: Option<String>,
    pub(crate) ciclo: Option<String>,
    pub(crate) coordenador_turma: Option<String>,
    pub(crate) carga_horaria: Option<serde_json::Map<String, Value>>,
    pub(crate) textos_ata: Option<serde_json::Map<String, Value>>,
    pub(crate) conselhos: Option<serde_json::Map<String, Value>>,
    pub(crate) alunos: Option<serde_json::Map<String, Value>>,
}

#[derive(Deserialize)]
pub(crate) struct AjusteMediaInput {
    pub(crate) disciplina: String,
    pub(crate) media_original: Option<f64>,
    pub(crate) media_ajustada: Option<f64>,
    pub(crate) observacao: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct FinalizacaoConselhoInput {
    pub(crate) texto: String,
    pub(crate) tempo_segundos: i64,
    pub(crate) gerar_ata: bool,
    pub(crate) gerar_relatorio: bool,
}

pub(crate) fn modo_notas_ata_padrao() -> String {
    "x_vermelhas".to_string()
}

pub(crate) fn modo_notas_ata_valido(valor: &str) -> bool {
    matches!(valor, "x_vermelhas" | "todas" | "somente_vermelhas")
}

#[derive(Deserialize)]
pub(crate) struct CoordenadorTurmaInput {
    pub(crate) coordenador: String,
}

#[derive(Deserialize)]
pub(crate) struct ElegibilidadeAlunoInput {
    pub(crate) elegivel: bool,
}

#[derive(Deserialize)]
pub(crate) struct LiderancaAlunoInput {
    pub(crate) lideranca: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct EducacaoEspecialAlunoInput {
    pub(crate) deficiencias: Vec<String>,
    pub(crate) comentario: String,
}

#[derive(Deserialize)]
pub(crate) struct RelatorioAlunosCriticosInput {
    pub(crate) serie: Option<String>,
    pub(crate) bimestre: String,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAlunosCriticosResultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) turmas: usize,
    pub(crate) alunos: usize,
}

#[derive(Deserialize)]
pub(crate) struct RelatorioAlteracoesNotasInput {
    pub(crate) serie: Option<String>,
    pub(crate) bimestre: String,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAlteracoesNotasResultado {
    pub(crate) caminho: String,
    pub(crate) pasta: String,
    pub(crate) turmas: usize,
    pub(crate) pendentes: usize,
    pub(crate) alteradas: usize,
}

#[derive(Deserialize)]
pub(crate) struct AtendimentoAlunoInput {
    pub(crate) id: Option<String>,
    pub(crate) parent_id: Option<String>,
    pub(crate) data: String,
    pub(crate) tipos: Vec<String>,
    pub(crate) atendido: String,
    pub(crate) tags: Vec<String>,
    pub(crate) descricao: String,
    pub(crate) anexos: Vec<KanbanAnexoResultado>,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAtendimentosResultado {
    pub(crate) alunos_atendidos: Vec<RelatorioAtendimentoAluno>,
    pub(crate) alunos_nao_atendidos: Vec<RelatorioAtendimentoAlunoBasico>,
    pub(crate) eventos: Vec<RelatorioAtendimentoEvento>,
    pub(crate) total_turmas: usize,
    pub(crate) total_alunos_ativos: usize,
    pub(crate) total_atendimentos: usize,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAtendimentoAluno {
    pub(crate) turma: String,
    pub(crate) matricula: String,
    pub(crate) nome: String,
    pub(crate) atendimentos: usize,
    pub(crate) casos: usize,
    pub(crate) seguimentos: usize,
    pub(crate) tipos: Vec<RelatorioAtendimentoContagem>,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAtendimentoAlunoBasico {
    pub(crate) turma: String,
    pub(crate) matricula: String,
    pub(crate) nome: String,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAtendimentoContagem {
    pub(crate) nome: String,
    pub(crate) total: usize,
}

#[derive(Serialize)]
pub(crate) struct RelatorioAtendimentoEvento {
    pub(crate) turma: String,
    pub(crate) matricula: String,
    pub(crate) aluno: String,
    pub(crate) data: String,
    pub(crate) mes: String,
    pub(crate) tipos: Vec<String>,
    pub(crate) tags: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct NovoAlunoInput {
    pub(crate) matricula: String,
    pub(crate) nome: String,
    pub(crate) numero_chamada: Option<i64>,
    pub(crate) ativo: bool,
    pub(crate) deficiencias: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct NovaTurmaInput {
    pub(crate) codigo: String,
    pub(crate) ano: i64,
    pub(crate) serie: String,
    pub(crate) sala: String,
    pub(crate) periodo: String,
    pub(crate) ciclo: String,
    pub(crate) alunos: Vec<NovoAlunoInput>,
    pub(crate) substituir_alunos: Option<bool>,
}

#[derive(Deserialize, Clone)]
pub(crate) struct ArquivoMapaoInput {
    pub(crate) nome: String,
    pub(crate) bytes: Vec<u8>,
}

#[derive(Deserialize)]
pub(crate) struct ImportacaoMapoesInput {
    pub(crate) bimestre: String,
    pub(crate) arquivos: Vec<ArquivoMapaoInput>,
    pub(crate) device_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct ImportacaoDiagnosticoInput {
    pub(crate) arquivos: Vec<ArquivoMapaoInput>,
}

#[derive(Clone)]
pub(crate) struct RegistroDiagnostico {
    pub(crate) turma: String,
    pub(crate) estudante: String,
    pub(crate) portugues_ano: String,
    pub(crate) portugues_status: String,
    pub(crate) matematica_ano: String,
    pub(crate) matematica_status: String,
}

#[derive(Serialize)]
pub(crate) struct PreviaArquivoDiagnostico {
    pub(crate) nome: String,
    pub(crate) registros_lidos: usize,
    pub(crate) correspondencias: usize,
    pub(crate) nao_encontrados: usize,
    pub(crate) nomes_nao_encontrados: Vec<String>,
    pub(crate) duplicados: usize,
    pub(crate) nomes_duplicados: Vec<String>,
    pub(crate) turmas_identificadas: Vec<String>,
    pub(crate) erro: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct PreviaImportacaoDiagnostico {
    pub(crate) arquivos: Vec<PreviaArquivoDiagnostico>,
    pub(crate) total_registros: usize,
    pub(crate) total_correspondencias: usize,
    pub(crate) total_nao_encontrados: usize,
    pub(crate) total_duplicados: usize,
}

#[derive(Serialize)]
pub(crate) struct ResultadoImportacaoDiagnostico {
    pub(crate) previa: PreviaImportacaoDiagnostico,
    pub(crate) turmas_atualizadas: usize,
    pub(crate) alunos_atualizados: usize,
}

#[derive(Serialize, Clone)]
pub(crate) struct PreviaArquivoMapao {
    pub(crate) nome: String,
    pub(crate) turma_alvo: Option<String>,
    pub(crate) turma_caminho: Option<String>,
    pub(crate) alunos_lidos: usize,
    pub(crate) disciplinas_lidas: usize,
    pub(crate) correspondencias: usize,
    pub(crate) nao_encontrados: usize,
    pub(crate) nomes_nao_encontrados: Vec<String>,
    pub(crate) duplicados: usize,
    pub(crate) nomes_duplicados: Vec<String>,
    pub(crate) erro: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct PreviaImportacaoMapoes {
    pub(crate) arquivos: Vec<PreviaArquivoMapao>,
    pub(crate) total_correspondencias: usize,
    pub(crate) total_nao_encontrados: usize,
    pub(crate) total_duplicados: usize,
}

#[derive(Serialize)]
pub(crate) struct ResultadoImportacaoMapoes {
    pub(crate) arquivos: Vec<PreviaArquivoMapao>,
    pub(crate) turmas_atualizadas: usize,
    pub(crate) alunos_atualizados: usize,
}

#[derive(Clone)]
pub(crate) struct DisciplinaMapao {
    pub(crate) nome: String,
    pub(crate) media_col: usize,
    pub(crate) faltas_col: Option<usize>,
    pub(crate) compensacao_col: Option<usize>,
    pub(crate) aulas: Option<f64>,
}

// (disciplina, média, faltas, compensação de ausências)
pub(crate) type NotasDisciplinaMapao = (DisciplinaMapao, Option<f64>, Option<f64>, Option<f64>);

#[derive(Clone)]
pub(crate) struct AlunoMapao {
    pub(crate) nome: String,
    pub(crate) numero_chamada: Option<i64>,
    pub(crate) frequencia_percentual: Option<f64>,
    pub(crate) disciplinas: Vec<NotasDisciplinaMapao>,
}

pub(crate) struct DadosMapao {
    pub(crate) alunos: Vec<AlunoMapao>,
    pub(crate) disciplinas: BTreeSet<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RegistroPei {
    pub(crate) timestamp: String,
    pub(crate) email: String,
    pub(crate) professor: String,
    pub(crate) nome_estudante_completo: String,
    pub(crate) nome_aluno: String,
    pub(crate) turma_aluno: String,
    pub(crate) disciplina: String,
    pub(crate) bimestre: String,
    pub(crate) conteudos: String,
    pub(crate) estrategias: String,
    pub(crate) instrumentos: String,
    pub(crate) recursos: String,
}

#[derive(Serialize)]
pub(crate) struct AlunoElegiveisComDisciplinas {
    pub(crate) matricula: String,
    pub(crate) nome: String,
    pub(crate) turma: String,
    pub(crate) disciplinas: Vec<String>,
    pub(crate) disciplinas_por_bimestre: BTreeMap<String, Vec<String>>,
    pub(crate) bimestres_com_medias: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct GerarPeisLoteResultado {
    pub(crate) pasta: String,
    pub(crate) arquivos: usize,
    pub(crate) erros: Vec<String>,
}

// Um registro já processado = um Plano de Ensino por turma.
// Uma resposta da planilha pode cobrir várias turmas (Turma A..G); cada turma
// vira um RegistroPlanejamento (mesmo conteúdo, pasta própria).
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct RegistroPlanejamento {
    pub(crate) professor: String,
    pub(crate) disciplina: String,    // componente curricular
    pub(crate) ano: String,           // resposta da coluna "Ano"/"Série" (ex.: "8º Ano")
    pub(crate) turma: String,         // turma expandida (ex.: "8º A") — chave da grade/pasta
    pub(crate) turmas: String,        // todas as turmas da resposta (ex.: "A, B, C")
    pub(crate) bimestre: String,      // "1".."4"
    pub(crate) unidade_tematica: String,    // linhas separadas por \n
    pub(crate) objetos_conhecimento: String,
    pub(crate) habilidades: String,
    pub(crate) estrategias: String,
    pub(crate) recursos: String,
    pub(crate) avaliacao: String,
    pub(crate) adaptacao_curricular: String,
    pub(crate) verificacao_objetivo: String,
}

#[derive(Serialize)]
pub(crate) struct GerarPlanejamentosLoteResultado {
    pub(crate) pasta: String,
    pub(crate) arquivos: usize,
    pub(crate) erros: Vec<String>,
}

// Configuração: até 4 planilhas (segmento × semestre) + versão do currículo.
#[derive(Serialize, Deserialize, Default, Clone)]
pub(crate) struct ParPlanejamento {
    #[serde(default)]
    pub(crate) sem1: String,
    #[serde(default)]
    pub(crate) sem2: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub(crate) struct ConfigPlanejamento {
    #[serde(default)]
    pub(crate) fundamental: ParPlanejamento,
    #[serde(default)]
    pub(crate) medio: ParPlanejamento,
    #[serde(default)]
    pub(crate) versao: String,
}
