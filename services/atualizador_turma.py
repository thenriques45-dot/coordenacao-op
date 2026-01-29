from services.importador_dados import ImportadorCSV


class AtualizadorTurma:
    @staticmethod
    def atualizar_turma(turma, caminho_csv_atual):
        """
        Atualiza a turma com base em um CSV oficial de alunos.
        Retorna um dicionário com o resumo das alterações.
        """

        alunos_csv = ImportadorCSV.importar_alunos(caminho_csv_atual)

        matriculas_csv = set()

        adicionados = 0
        reativados = 0
        inativados = 0

        # Processa alunos vindos do CSV
        for aluno_csv in alunos_csv:
            matriculas_csv.add(aluno_csv.matricula)

            if aluno_csv.matricula in turma.alunos:
                aluno_existente = turma.alunos[aluno_csv.matricula]

                # Reativação
                if not aluno_existente.ativo:
                    reativados += 1

                aluno_existente.nome = aluno_csv.nome
                aluno_existente.numero_chamada = aluno_csv.numero_chamada
                aluno_existente.ativo = True

            else:
                turma.adicionar_aluno(aluno_csv)
                adicionados += 1

        # Marca como inativos os que não vieram no CSV
        for matricula, aluno in turma.alunos.items():
            if matricula not in matriculas_csv and aluno.ativo:
                aluno.ativo = False
                inativados += 1

        return {
            "adicionados": adicionados,
            "reativados": reativados,
            "inativados": inativados,
            "total": adicionados + reativados + inativados
        }
