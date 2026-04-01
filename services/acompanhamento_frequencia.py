from services.avaliador_frequencia import AvaliadorFrequencia


class AcompanhamentoFrequencia:
    @staticmethod
    def _bimestres_ordenados(turma):
        bimestres = set()
        for aluno in turma.alunos.values():
            bimestres.update(getattr(aluno, "frequencia", {}).keys())
            bimestres.update(getattr(aluno, "compensacao_ausencias", {}).keys())
        bimestres.update(getattr(turma, "carga_horaria", {}).keys())
        return [b for b in ("1", "2", "3", "4") if b in bimestres]

    @staticmethod
    def listar_linhas_turma(turma):
        linhas = []
        bimestres = AcompanhamentoFrequencia._bimestres_ordenados(turma)

        for aluno in turma.alunos.values():
            if not getattr(aluno, "ativo", True):
                continue

            disciplinas = set()
            for bimestre in bimestres:
                disciplinas.update(getattr(aluno, "frequencia", {}).get(bimestre, {}).keys())
                disciplinas.update(getattr(aluno, "compensacao_ausencias", {}).get(bimestre, {}).keys())
                disciplinas.update(getattr(turma, "carga_horaria", {}).get(bimestre, {}).keys())

            for disciplina in sorted(disciplinas):
                total_faltas = 0
                total_compensadas = 0
                total_aulas = 0

                for bimestre in bimestres:
                    total_faltas += int(getattr(aluno, "frequencia", {}).get(bimestre, {}).get(disciplina, 0) or 0)
                    total_compensadas += int(
                        getattr(aluno, "compensacao_ausencias", {}).get(bimestre, {}).get(disciplina, 0) or 0
                    )
                    total_aulas += int(getattr(turma, "carga_horaria", {}).get(bimestre, {}).get(disciplina, 0) or 0)

                if total_faltas == 0 and total_compensadas == 0 and total_aulas == 0:
                    continue

                saldo_pendente = max(total_faltas - total_compensadas, 0)
                percentual = (saldo_pendente / total_aulas * 100) if total_aulas else 0
                status = "OK"
                if total_aulas and (saldo_pendente / total_aulas) > AvaliadorFrequencia.LIMITE:
                    status = "EXCESSO"

                linhas.append(
                    {
                        "aluno": aluno.nome,
                        "disciplina": disciplina,
                        "faltas": total_faltas,
                        "compensadas": total_compensadas,
                        "aulas": total_aulas,
                        "saldo": saldo_pendente,
                        "percentual": percentual,
                        "status": status,
                        "bimestres": list(bimestres),
                    }
                )

        linhas.sort(key=lambda item: (0 if item["status"] == "EXCESSO" else 1, item["disciplina"], item["aluno"]))
        return linhas

    @staticmethod
    def resumo_turma(turma):
        linhas = AcompanhamentoFrequencia.listar_linhas_turma(turma)
        return {
            "total": len(linhas),
            "excesso": sum(1 for linha in linhas if linha["status"] == "EXCESSO"),
            "ok": sum(1 for linha in linhas if linha["status"] == "OK"),
            "bimestres": AcompanhamentoFrequencia._bimestres_ordenados(turma),
        }
