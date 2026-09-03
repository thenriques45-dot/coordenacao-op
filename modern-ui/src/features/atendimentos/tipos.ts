// Tipos compartilhados da Tela de Atendimentos — espelham o schema Rust
// (tipos.rs::{AtendimentoAluno, AtendimentoFollowUp, AtendimentoAlunoInput,
// FollowupPrevisto} e turmas.rs::salvar_atendimento_aluno). Qualquer mudança
// de forma aqui acompanha o `#[derive(Serialize, Deserialize)]` do lado Rust.

export type CanalAtendimento = "manual" | "wa_me" | "api";

export type ResponsavelAluno = {
  nome: string;
  parentesco: string;
  parentesco_desc?: string | null;
  telefone: string;
};

// Subconjunto de TurmaResumo (App.tsx / tipos.rs::TurmaResumo) que a Tela de
// Atendimentos usa — seletor de turma, subtítulo e pílula da sidebar.
export type TurmaResumoAtendimentos = {
  codigo: string;
  serie: string | null;
  sala: string | null;
  periodo: string | null;
  caminho: string;
  alunos_ativos: number;
  total_atendimentos?: number;
  followups_pendentes?: number;
};

// Subconjunto de AlunoDetalhe (tipos.rs::AlunoDetalhe) devolvido por
// `carregar_turma` que a lista de atendimentos precisa.
export type AlunoAtendimentos = {
  matricula: string;
  nome: string;
  ativo: boolean;
  numero_chamada: number | null;
  frequencia_percentual: number | null;
  atendimentos: AtendimentoAluno[];
  responsaveis: ResponsavelAluno[];
};

export type TurmaDetalheAtendimentos = {
  codigo: string;
  bimestre: string;
  alunos: AlunoAtendimentos[];
};

// Uma linha da tabela densa (artboard 1a): um atendimento principal + o aluno
// a que pertence + campos derivados para selos e filtros.
export type LinhaAtendimento = {
  atendimento: AtendimentoAluno;
  matricula: string;
  alunoNome: string;
  numeroChamada: number | null;
  turmaCodigo: string;
  totalFollowups: number;
  followupPendente: boolean;
  semRetorno: boolean;
  atendidoLabel: string;
};

// O "follow-up combinado" — compromisso datado que substitui o campo de status.
// Mora no atendimento principal; some quando o desfecho é registrado.
export type FollowupPrevisto = {
  data: string;
  descricao: string;
};

export type AtendimentoAnexo = {
  id: string;
  nome: string;
  tipo: string;
  dados: string;
  caminho: string | null;
  origem: string;
};

export type AtendimentoFollowUp = {
  id: string;
  data: string;
  tipos: string[];
  atendido: string;
  atendido_nome?: string | null;
  tags: string[];
  descricao: string;
  anexos: AtendimentoAnexo[];
  canal: CanalAtendimento;
  modelo_id?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
};

export type AtendimentoAluno = {
  id: string;
  data: string;
  tipos: string[];
  atendido: string;
  atendido_nome?: string | null;
  tags: string[];
  descricao: string;
  anexos: AtendimentoAnexo[];
  followups?: AtendimentoFollowUp[];
  canal: CanalAtendimento;
  lote_id?: string | null;
  modelo_id?: string | null;
  followup_previsto?: FollowupPrevisto | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
};

// Entrada de `salvar_atendimento_aluno`. `parent_id` presente = follow-up de um
// atendimento; `id` presente = edição. `followup_previsto`:
//   - ausente (undefined) → não mexe no follow-up combinado atual;
//   - null                → limpa (registrar desfecho);
//   - objeto              → define/reagenda (data vazia também limpa).
export type AtendimentoAlunoInput = {
  id?: string;
  parent_id?: string;
  data: string;
  tipos: string[];
  atendido: string;
  atendido_nome?: string;
  tags: string[];
  descricao: string;
  anexos: AtendimentoAnexo[];
  canal?: CanalAtendimento;
  lote_id?: string;
  modelo_id?: string;
  followup_previsto?: FollowupPrevisto | null;
};
