class AvaliadorFrequencia:
    LIMITE = 0.25  # 25%

    @staticmethod
    def avaliar(turma, bimestre):
        if bimestre not in turma.carga_horaria:
            return 0  # nada avaliado

        carga = turma.carga_horaria[bimestre]
        alteracoes = 0

        for aluno in turma.alunos.values():
            if bimestre not in aluno.frequencia:
                continue

            aluno.defasagem_frequencia.setdefault(bimestre, {})

            for disciplina, faltas in aluno.frequencia[bimestre].items():
                total_aulas = carga.get(disciplina)

                if not total_aulas or total_aulas <= 0:
                    continue

                estourou = (faltas / total_aulas) > AvaliadorFrequencia.LIMITE

                anterior = aluno.defasagem_frequencia[bimestre].get(disciplina)
                aluno.defasagem_frequencia[bimestre][disciplina] = estourou

                if anterior != estourou:
                    alteracoes += 1

        return alteracoes
