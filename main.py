from domain.aluno import Aluno
from domain.turma import Turma
from domain.avaliacao import Avaliacao

# cria turma
turma = Turma("3A", 2025)

# cria aluno
aluno = Aluno("123", "João Silva", ativo=True)
aluno.adicionar_notas(1, [6.0, 5.0, 3.0])

# adiciona aluno à turma
turma.adicionar_aluno(aluno)

# avalia aluno
resultado = Avaliacao.aprovado(aluno.notas[1], aluno.ativo)

print("Aluno:", aluno.nome)
print("Aprovado no 1º bimestre?", resultado)
