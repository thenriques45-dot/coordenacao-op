class Aluno:
    def __init__(self, matricula, nome, ativo=True):
        self.matricula = matricula
        self.nome = nome
        self.ativo = ativo
        self.notas = {}        # {bimestre: [n1, n2, n3]}
        self.resultados = {}   # {bimestre: True/False}

    def adicionar_notas(self, bimestre, notas):
        self.notas[bimestre] = notas
