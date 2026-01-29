from domain.aluno import Aluno


class Turma:
    def __init__(self, codigo, ano):
        self.codigo = codigo
        self.ano = ano
        self.alunos = {}

    def adicionar_aluno(self, aluno: Aluno):
        self.alunos[aluno.matricula] = aluno
