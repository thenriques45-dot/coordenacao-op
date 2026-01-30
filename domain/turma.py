class Turma:
    def __init__(self, codigo, ano, serie=None, sala=None, periodo=None, ciclo=None):
        self.codigo = codigo              # ex: "1A"
        self.ano = ano                    # ex: 2026
        self.ciclo = ciclo                # EI | EFAI | EFAF | EM
        self.serie = serie                # ex: "1ª SÉRIE"
        self.sala = sala                  # ex: "04"
        self.periodo = periodo            # ex: "NOITE"

        self.alunos = {}                  # {matricula: Aluno}
        self.carga_horaria = {}           # {bimestre: {disciplina: total_aulas}}

    def adicionar_aluno(self, aluno):
        self.alunos[aluno.matricula] = aluno

    def definir_carga_horaria(self, bimestre, carga):
        self.carga_horaria[bimestre] = carga
