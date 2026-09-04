
// Structs e tipos compartilhados entre os módulos (DTOs dos comandos).
// Extraído de main.rs; os itens são pub(crate) e os módulos se enxergam
// através dos re-exports globais feitos no main.rs (use crate::*).


use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};


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

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct OpcaoEncaminhamento {
    pub(crate) numero: i64,
    pub(crate) texto: String,
}

/// Modelo de mensagem para o responsável (contato com a família via WhatsApp).
/// `corpo` pode conter variáveis entre chaves (ex.: `{aluno}`,
/// `{tarefas_pendentes}`) que a tela do aluno substitui pelos valores reais.
/// `tags` são aplicadas ao atendimento registrado quando a mensagem é enviada.
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct MensagemTemplate {
    pub(crate) id: String,
    pub(crate) titulo: String,
    pub(crate) corpo: String,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
}

/// Uma pessoa da equipe gestora (direção, vice-direção ou coordenação).
/// `genero`: "F" | "M" | "" (não informado → formas neutras nos textos).
#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct MembroEquipe {
    #[serde(default)]
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) nome: String,
    #[serde(default)]
    pub(crate) genero: String,
}

/// Escolha MANUAL de com quem casar um membro do grupo de trabalho.
/// O casamento automático (por nome compatível) não é gravado — é resolvido
/// ao vivo no frontend. `membro_id` vazio = "não vincular".
#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct VinculoMembroEquipe {
    #[serde(default)]
    pub(crate) nome_curto: String,
    #[serde(default)]
    pub(crate) membro_id: String,
}

/// Equipe gestora da escola. Fonte da verdade para nome + gênero das pessoas
/// que assinam documentos e aparecem no grupo de trabalho.
#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct EquipeGestora {
    #[serde(default)]
    pub(crate) direcao: MembroEquipe,
    #[serde(default)]
    pub(crate) vices: Vec<MembroEquipe>,
    #[serde(default)]
    pub(crate) coordenacoes: Vec<MembroEquipe>,
    #[serde(default)]
    pub(crate) vinculos: Vec<VinculoMembroEquipe>,
    /// RFC3339 — usado para "mais novo vence" na sincronização de grupo.
    #[serde(default)]
    pub(crate) atualizado_em: String,
}

#[derive(Serialize)]
pub(crate) struct ConfiguracoesApp {
    pub(crate) direcao_nome: String,
    pub(crate) direcao_pronome: String,
    // Nomes dos vice-diretores — assinam o PEI quando indicados por turma.
    // Derivado de `equipe_gestora.vices` na gravação (compat com leitores antigos).
    pub(crate) vice_direcao: Vec<String>,
    // Equipe gestora completa (direção + vices + coordenações + vínculos).
    pub(crate) equipe_gestora: EquipeGestora,
    pub(crate) nota_minima: f64,
    pub(crate) cabecalho_ata: Option<String>,
    pub(crate) lider_ativo: bool,
    pub(crate) lider_rotulo: String,
    pub(crate) elegivel_ativo: bool,
    pub(crate) elegivel_rotulo: String,
    pub(crate) atendimento_tipos: Vec<String>,
    pub(crate) encaminhamento_opcoes: Vec<OpcaoEncaminhamento>,
    pub(crate) mensagem_familia_templates: Vec<MensagemTemplate>,
    pub(crate) perfil_turma_ativo: bool,
    pub(crate) perfil_turma_criterios: Vec<CriterioPerfil>,
    pub(crate) aluno_destaque_ativo: bool,
    pub(crate) aluno_destaque_criterios: Vec<CriterioDestaque>,
    pub(crate) modo_notas_ata: String,
    // Datas de corte (YYYY-MM-DD) usadas para decidir qual semestre está
    // ativo (1º/2º bimestre ou 3º/4º) — usado pelo Planejamento e pelo PEI
    // para colorir seus indicadores de status de entrega.
    pub(crate) prazo_1_semestre: String,
    pub(crate) prazo_2_semestre: String,
    // Datas de início de cada bimestre (YYYY-MM-DD, "" = não informado).
    // Sempre 4 posições. Usadas para resolver automaticamente o "bimestre
    // atual" a partir da data de hoje. Ver `resolver_bimestre_atual`.
    #[serde(default)]
    pub(crate) bimestre_datas_inicio: Vec<String>,
    // Fixa manualmente o bimestre atual ("" = automático; "1".."4" = fixo).
    #[serde(default)]
    pub(crate) bimestre_pin: String,
}

/// Resultado de `resolver_bimestre_atual`: o bimestre em vigor ("1".."4") e
/// de onde veio essa decisão, para a interface poder explicar ao usuário.
#[derive(Serialize)]
pub(crate) struct BimestreAtualResposta {
    pub(crate) valor: String,
    /// "manual" (pin), "datas" (calendário da config), "dados" (maior
    /// bimestre já importado) ou "padrao" (nada configurado → 1º).
    pub(crate) origem: String,
}

#[derive(Deserialize)]
pub(crate) struct ConfiguracoesInput {
    pub(crate) direcao_nome: String,
    pub(crate) direcao_pronome: String,
    #[serde(default)]
    pub(crate) vice_direcao: Vec<String>,
    // Quando presente, é a fonte da verdade: os campos planos acima são
    // derivados dela na gravação.
    #[serde(default)]
    pub(crate) equipe_gestora: Option<EquipeGestora>,
    pub(crate) nota_minima: f64,
    pub(crate) lider_ativo: bool,
    pub(crate) lider_rotulo: String,
    pub(crate) elegivel_ativo: bool,
    pub(crate) elegivel_rotulo: String,
    #[serde(default)]
    pub(crate) atendimento_tipos: Vec<String>,
    #[serde(default)]
    pub(crate) encaminhamento_opcoes: Vec<OpcaoEncaminhamento>,
    #[serde(default)]
    pub(crate) mensagem_familia_templates: Vec<MensagemTemplate>,
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
    #[serde(default)]
    pub(crate) prazo_1_semestre: String,
    #[serde(default)]
    pub(crate) prazo_2_semestre: String,
    #[serde(default)]
    pub(crate) bimestre_datas_inicio: Vec<String>,
    #[serde(default)]
    pub(crate) bimestre_pin: String,
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
    // Assinantes do PEI configurados nesta turma (ver salvar_pessoas_pei_turma).
    // `pei_prof_especializado` cobre tanto "Especializado da Educação Especial"
    // quanto "Ensino Colaborativo" — na prática é a mesma pessoa.
    pub(crate) pei_coordenador_gestao: Option<String>,
    pub(crate) pei_prof_especializado: Option<String>,
    pub(crate) pei_direcao: Option<String>,
    pub(crate) lider_sala: Option<String>,
    pub(crate) vice_lider_sala: Option<String>,
    pub(crate) total_alunos: usize,
    pub(crate) alunos_ativos: usize,
    pub(crate) alunos_elegiveis: usize,
    pub(crate) nomes_alunos: Vec<String>,
    pub(crate) conselhos_com_ajustes: usize,
    pub(crate) conselho_finalizado: bool,
    // Atendimentos registrados na turma (registros principais, sem contar
    // follow-ups aninhados) e quantos deles têm follow-up combinado em aberto.
    // Alimentam o subtítulo e a pílula da sidebar na Tela de Atendimentos.
    pub(crate) total_atendimentos: usize,
    pub(crate) followups_pendentes: usize,
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

/// Canal de origem do atendimento — dá o selo na lista da tela de Atendimentos
/// e liga o registro ao histórico de disparos em lote. Registros antigos, sem
/// o campo, contam como "manual".
pub(crate) fn canal_atendimento_padrao() -> String {
    "manual".to_string()
}

pub(crate) fn normalizar_canal_atendimento(valor: Option<&str>) -> String {
    match valor.map(str::trim) {
        Some("wa_me") => "wa_me".to_string(),
        Some("api") => "api".to_string(),
        _ => canal_atendimento_padrao(),
    }
}

/// "Follow-up combinado": o compromisso datado que substitui o campo de status.
/// Mora no atendimento principal; some quando o desfecho é registrado.
#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct FollowupPrevisto {
    pub(crate) data: String,
    #[serde(default)]
    pub(crate) descricao: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct AtendimentoAluno {
    pub(crate) id: String,
    pub(crate) data: String,
    #[serde(default)]
    pub(crate) tipos: Vec<String>,
    pub(crate) atendido: String,
    #[serde(default)]
    pub(crate) atendido_nome: Option<String>,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
    pub(crate) descricao: String,
    #[serde(default)]
    pub(crate) anexos: Vec<KanbanAnexoResultado>,
    #[serde(default)]
    pub(crate) followups: Vec<AtendimentoFollowUp>,
    #[serde(default = "canal_atendimento_padrao")]
    pub(crate) canal: String,
    #[serde(default)]
    pub(crate) lote_id: Option<String>,
    #[serde(default)]
    pub(crate) modelo_id: Option<String>,
    #[serde(default)]
    pub(crate) followup_previsto: Option<FollowupPrevisto>,
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
    pub(crate) atendido_nome: Option<String>,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
    pub(crate) descricao: String,
    #[serde(default)]
    pub(crate) anexos: Vec<KanbanAnexoResultado>,
    #[serde(default = "canal_atendimento_padrao")]
    pub(crate) canal: String,
    #[serde(default)]
    pub(crate) modelo_id: Option<String>,
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
    pub(crate) encaminhamentos_bimestres: Vec<EncaminhamentosBimestre>,
    pub(crate) deliberado: bool,
    pub(crate) atendimentos: Vec<AtendimentoAluno>,
    pub(crate) responsaveis: Vec<Responsavel>,
    pub(crate) diagnostico_aprendizagem: Option<DiagnosticoAprendizagem>,
    pub(crate) disciplinas: Vec<DisciplinaDetalhe>,
}

/// Responsável pelo estudante — usado para o contato com a família (mensagem
/// via WhatsApp) e registrado junto ao aluno no JSON da turma. `parentesco`
/// é sempre "mae" | "pai" | "outro"; `parentesco_desc` só é preenchido quando
/// "outro" (ex.: "avó", "tia"). `telefone` é guardado só com dígitos.
#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct Responsavel {
    pub(crate) nome: String,
    pub(crate) parentesco: String,
    #[serde(default)]
    pub(crate) parentesco_desc: Option<String>,
    pub(crate) telefone: String,
    /// Marcado quando o número foi tentado no WhatsApp e não é (ex.: fixo,
    /// número trocado). O telefone continua salvo — só deixa de contar como
    /// "tem WhatsApp" nas filas de contato e nos relatórios, pra não tentar
    /// mandar mensagem pra um número que já se sabe que não funciona.
    #[serde(default)]
    pub(crate) nao_whatsapp: bool,
}

#[derive(Deserialize)]
pub(crate) struct ResponsaveisAlunoInput {
    pub(crate) responsaveis: Vec<Responsavel>,
}

/// Entrada do preenchimento rápido de responsável (fila de contato em lote,
/// ver `adicionar_responsavel_rapido`) — os mesmos campos de `Responsavel`,
/// só que um de cada vez, para completar durante a triagem da fila.
#[derive(Deserialize)]
pub(crate) struct ResponsavelRapidoInput {
    pub(crate) nome: String,
    pub(crate) parentesco: String,
    #[serde(default)]
    pub(crate) parentesco_desc: Option<String>,
    pub(crate) telefone: String,
}

#[derive(Serialize)]
pub(crate) struct EncaminhamentosBimestre {
    pub(crate) bimestre: String,
    pub(crate) codigos: Vec<i64>,
}

#[derive(Serialize)]
pub(crate) struct DiagnosticoAprendizagem {
    pub(crate) turma_origem: Option<String>,
    pub(crate) cd_escola: Option<String>,
    pub(crate) cd_diretoria: Option<String>,
    pub(crate) portugues: DiagnosticoComponente,
    pub(crate) matematica: DiagnosticoComponente,
    pub(crate) atualizado_em: Option<String>,
}

/// Diagnóstico de um componente (Português ou Matemática). A prova acontece
/// duas vezes no ano (AvD1 e AvD2); guardamos as duas ondas + a evolução
/// que a própria planilha traz. `status`/`aprendizagem_equivalente` são o
/// valor "corrente" para as telas — AvD2 quando existe, senão AvD1, ou
/// "Não mensurado" quando o aluno não fez nenhuma das duas.
#[derive(Serialize)]
pub(crate) struct DiagnosticoComponente {
    pub(crate) aprendizagem_equivalente: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) nivel_avd1: Option<String>,
    pub(crate) equivalente_avd1: Option<String>,
    pub(crate) nivel_avd2: Option<String>,
    pub(crate) equivalente_avd2: Option<String>,
    pub(crate) evolucao: Option<String>,
    pub(crate) mensurado: bool,
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
    #[serde(default)]
    pub(crate) pei_coordenador_gestao: Option<String>,
    #[serde(default)]
    pub(crate) pei_prof_especializado: Option<String>,
    #[serde(default)]
    pub(crate) pei_direcao: Option<String>,
    pub(crate) carga_horaria: Option<serde_json::Map<String, Value>>,
    pub(crate) textos_ata: Option<serde_json::Map<String, Value>>,
    pub(crate) conselhos: Option<serde_json::Map<String, Value>>,
    pub(crate) alunos: Option<serde_json::Map<String, Value>>,
    // Disciplinas cujas notas vieram de um mapão de "Tipo de Ensino:
    // Expansão" (turmas não seriadas de itinerário/aprofundamento, sem
    // Plano de Ensino do professor) — ver aplicar_mapoes_lote e
    // listar_disciplinas_turma. As notas continuam misturadas normalmente
    // nos alunos/conselho; só a listagem de disciplinas do Planejamento
    // (e o dropdown de componente curricular do Web App) exclui estas.
    pub(crate) disciplinas_expansao: Option<Vec<String>>,
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

// Assinantes do PEI de uma turma — cada campo vazio tem um fallback aplicado
// em pei::resolver_assinantes_pei (especializado/colaborativo caem no
// coordenador de gestão; direção cai em direcao_nome).
#[derive(Deserialize)]
pub(crate) struct PessoasPeiTurmaInput {
    #[serde(default)]
    pub(crate) coordenador_gestao: String,
    #[serde(default)]
    pub(crate) prof_especializado: String,
    #[serde(default)]
    pub(crate) direcao: String,
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
pub(crate) struct AtendimentoAlunoInput {
    pub(crate) id: Option<String>,
    pub(crate) parent_id: Option<String>,
    pub(crate) data: String,
    pub(crate) tipos: Vec<String>,
    pub(crate) atendido: String,
    #[serde(default)]
    pub(crate) atendido_nome: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) descricao: String,
    pub(crate) anexos: Vec<KanbanAnexoResultado>,
    #[serde(default)]
    pub(crate) canal: Option<String>,
    #[serde(default)]
    pub(crate) lote_id: Option<String>,
    #[serde(default)]
    pub(crate) modelo_id: Option<String>,
    // Option<Option<_>>: ausente = não mexe no follow-up combinado; `null` =
    // limpar (registrar desfecho); objeto = definir/reagendar.
    #[serde(default)]
    pub(crate) followup_previsto: Option<Option<FollowupPrevisto>>,
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

/// Uma linha da planilha "Aprendizagem Equivalente" das Devolutivas
/// Pedagógicas (Prova Paulista / AvD). Colunas F–H = Português (AvD1, AvD2,
/// Evolução); colunas I–K = Matemática. Os campos guardam o texto cru da
/// célula (ex.: "Básico (7º ano)", "Sem AvD2", "Avançou", "-") — a quebra
/// em nível/ano equivalente acontece na aplicação.
#[derive(Clone)]
pub(crate) struct RegistroDiagnostico {
    pub(crate) ra: String,
    pub(crate) turma: String,
    pub(crate) estudante: String,
    pub(crate) portugues_avd1: String,
    pub(crate) portugues_avd2: String,
    pub(crate) portugues_evolucao: String,
    pub(crate) matematica_avd1: String,
    pub(crate) matematica_avd2: String,
    pub(crate) matematica_evolucao: String,
}

/// Cabeçalho do arquivo de diagnóstico: a coluna TURMA vem genérica
/// ("1ª série"); a turma real, a escola e a diretoria só aparecem no rodapé
/// "Filtros aplicados:" (uma única célula com quebras de linha).
#[derive(Clone, Default)]
pub(crate) struct CabecalhoDiagnostico {
    pub(crate) turma: Option<String>,
    pub(crate) cd_escola: Option<String>,
    pub(crate) cd_diretoria: Option<String>,
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
    // true quando a célula "Tipo de Ensino:" do cabeçalho do mapão contém
    // "Expansão" (ex.: "110 - EXPANSÃO NOVO EM") — turma não seriada de
    // itinerário/aprofundamento. Ver ler_mapao_bytes.
    pub(crate) eh_expansao: bool,
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
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
    // Caminho do arquivo da turma — usado pela tela de PEI para gravar o
    // responsável do aluno (salvar_responsavel_pei_aluno).
    pub(crate) turma_caminho: String,
    pub(crate) disciplinas: Vec<String>,
    pub(crate) disciplinas_por_bimestre: BTreeMap<String, Vec<String>>,
    // Nome do responsável pelo estudante, para impressão acima da linha de
    // assinatura do PEI (campo `responsavel_pei` no objeto do aluno).
    pub(crate) responsavel: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct GerarPeisLoteResultado {
    pub(crate) pasta: String,
    pub(crate) arquivos: usize,
    // Quantos registros bateram com o índice local (mesmo conteúdo já
    // gerado) e não precisaram reescrever o docx — ver gerar_peis_lote.
    pub(crate) pulados: usize,
    pub(crate) erros: Vec<String>,
    // Índice local mesclado (anterior + esta leva), já persistido em
    // relatorios/pei/_indice.json — o frontend usa isto (não o retorno cru
    // da planilha) como estado de acompanhamento, para um erro de leitura
    // pontual não apagar documentos já gerados da tela.
    pub(crate) registros: Vec<RegistroPei>,
}

// Retorno de carregar_peis_locais: popula a tela de acompanhamento a partir
// do índice já em disco, sem depender de nenhum fetch na planilha.
#[derive(Serialize)]
pub(crate) struct PeisLocaisResultado {
    pub(crate) pasta: String,
    pub(crate) registros: Vec<RegistroPei>,
}

// Configuração do PEI: caminho manual (Forms legado, URL crua) + caminho
// automático (Web App + planilha via OAuth), mesmo modelo de
// ConfigPlanejamento. `url_legado` assume o valor do antigo config.json
// (que guardava só a URL como texto puro) na migração — ver
// pei::carregar_config_pei.
#[derive(Serialize, Deserialize, Default, Clone)]
pub(crate) struct ConfigPei {
    #[serde(default)]
    pub(crate) url_legado: String,
    #[serde(default)]
    pub(crate) planilha_automatica_id: String,
    #[serde(default)]
    pub(crate) webapp_url: String,
    #[serde(default)]
    pub(crate) apps_script_projeto_id: String,
    #[serde(default)]
    pub(crate) apps_script_deployment_id: String,
    // Token de leitura do Web App: permite que outros coordenadores busquem
    // as respostas via HTTP simples (?respostas=TOKEN), sem OAuth nem
    // compartilhar a planilha — ver Code.gs (scripts/webapp-pei) e
    // sheets_api::buscar_respostas_via_webapp. Gerado automaticamente no
    // provisionamento quando vazio.
    #[serde(default)]
    pub(crate) token_leitura: String,
    // userId (workgroupSync.ts) do coordenador que rodou "Criar
    // automaticamente" — só o id, não nome/foto (esses vêm do roster de
    // perfis já sincronizado, ver WorkgroupSyncMember). Usado pelo
    // frontend para decidir se mostra "Fulano já configurou isso" em vez
    // de forçar a tela de configuração, e para avisar antes de criar uma
    // config paralela. Opaco para o backend — só é lido/escrito pelo
    // frontend (tipos.rs só precisa aceitar e devolver o campo).
    #[serde(default)]
    pub(crate) configurado_por_user_id: String,
}

// Retorno de provisionar_pei_automatico: os recursos criados/reaproveitados
// no Google (planilha, projeto Apps Script, implantação).
#[derive(Serialize, Clone)]
pub(crate) struct ProvisionamentoPeiResultado {
    pub(crate) webapp_url: String,
    pub(crate) planilha_id: String,
    pub(crate) planilha_url: String,
    pub(crate) apps_script_projeto_id: String,
    pub(crate) apps_script_deployment_id: String,
    pub(crate) token_leitura: String,
}

// Um registro já processado = um Plano de Ensino por turma.
// Uma resposta da planilha pode cobrir várias turmas (Turma A..G); cada turma
// vira um RegistroPlanejamento (mesmo conteúdo, pasta própria).
#[derive(Serialize, Deserialize, Clone, PartialEq)]
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
    // Quantos registros bateram com o índice local (mesmo conteúdo já
    // gerado) e não precisaram reescrever o docx — ver gerar_planejamentos_lote.
    pub(crate) pulados: usize,
    pub(crate) erros: Vec<String>,
    // Índice local mesclado (anterior + esta leva), já persistido em
    // relatorios/planejamento/_indice.json — o frontend usa isto (não o
    // retorno cru da planilha) como estado de acompanhamento, para um erro
    // de leitura pontual não apagar documentos já gerados da tela.
    pub(crate) registros: Vec<RegistroPlanejamento>,
}

// Retorno de carregar_planejamentos_locais: popula a tela de acompanhamento
// a partir do índice já em disco, sem depender de nenhum fetch na planilha.
#[derive(Serialize)]
pub(crate) struct PlanejamentosLocaisResultado {
    pub(crate) pasta: String,
    pub(crate) registros: Vec<RegistroPlanejamento>,
}

// Configuração: uma planilha de respostas por segmento + versão do currículo.
// Cada segmento já cobre o ano letivo inteiro (1º ao 4º bimestre) num só
// Forms, então não há mais separação por semestre.
// Anos Iniciais fica de fora por enquanto — sem Currículo Priorizado próprio.
#[derive(Serialize, Deserialize, Default, Clone)]
pub(crate) struct ConfigPlanejamento {
    #[serde(default)]
    pub(crate) anos_finais: String,
    #[serde(default)]
    pub(crate) medio: String,
    #[serde(default)]
    pub(crate) versao: String,
    // Caminho automático (Web App + planilha criados via OAuth), aditivo ao
    // caminho manual acima — os dois convivem, buscar_planejamentos une os
    // registros das duas fontes. Todos com default para não quebrar configs
    // já salvos em produção antes desta etapa.
    #[serde(default)]
    pub(crate) planilha_automatica_id: String,
    #[serde(default)]
    pub(crate) webapp_url: String,
    #[serde(default)]
    pub(crate) apps_script_projeto_id: String,
    #[serde(default)]
    pub(crate) apps_script_deployment_id: String,
    // Componentes que o coordenador confirma manualmente para uma série/ano
    // mesmo sem dado real nas turmas importadas (ex.: "Sociologia" para 1ª e
    // 2ª Série, hoje só chega via mapão de expansão/itinerário que o
    // importador ainda não reconhece).
    #[serde(default)]
    pub(crate) componentes_extras_medio: std::collections::BTreeMap<String, Vec<String>>,
    #[serde(default)]
    pub(crate) componentes_extras_anos_finais: std::collections::BTreeMap<String, Vec<String>>,
    // Token de leitura do Web App: permite que outros coordenadores busquem
    // as respostas via HTTP simples (?respostas=TOKEN), sem OAuth nem
    // compartilhar a planilha — ver Code.gs (scripts/webapp) e
    // sheets_api::buscar_respostas_via_webapp. Gerado automaticamente no
    // provisionamento quando vazio.
    #[serde(default)]
    pub(crate) token_leitura: String,
    // userId (workgroupSync.ts) do coordenador que rodou "Criar
    // automaticamente" — ver campo equivalente em ConfigPei.
    #[serde(default)]
    pub(crate) configurado_por_user_id: String,
}

// Retorno de provisionar_planejamento_automatico: os três recursos criados/
// reaproveitados no Google (planilha, projeto Apps Script, implantação).
#[derive(Serialize, Clone)]
pub(crate) struct ProvisionamentoPlanejamentoResultado {
    pub(crate) webapp_url: String,
    pub(crate) planilha_id: String,
    pub(crate) planilha_url: String,
    pub(crate) apps_script_projeto_id: String,
    pub(crate) apps_script_deployment_id: String,
    pub(crate) token_leitura: String,
}
