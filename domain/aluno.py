class Aluno:
    def __init__(self, matricula, nome, numero_chamada=None, ativo=True):
        if not matricula:
            raise ValueError("Aluno precisa de matrícula válida")
        
        self.matricula = matricula
        self.nome = nome
        self.ativo = ativo
        self.numero_chamada = numero_chamada
        self.frequencia = {}    # {bimestre: {disciplina: faltas}}
        self.defasagens = {}  # {bimestre: {disciplina: True/False}}
        self.medias = {}       # {bimestre: {disciplina: media}}
        self.notas = {}        # {bimestre: [n1, n2, n3]}
        self.resultados = {}   # {bimestre: True/False}
        self.defasagem_frequencia = {}  # {bimestre: {disciplina: True/False}}
        self.encaminhamentos_conselho = {}  # {bimestre: [codigos 1..10]}


    def adicionar_notas(self, bimestre, notas):
        self.notas[bimestre] = notas
