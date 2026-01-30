class Turma:
    def __init__(self, codigo, ano):
        self.codigo = codigo
        self.ano = ano
        self.alunos = {}          # {matricula: Aluno}
        self.carga_horaria = {}   # {bimestre: {disciplina: total_aulas}}

    def adicionar_aluno(self, aluno):
        self.alunos[aluno.matricula] = aluno

    def definir_carga_horaria(self, bimestre, carga):
        self.carga_horaria[bimestre] = carga
