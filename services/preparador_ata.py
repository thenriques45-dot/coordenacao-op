from services.configuracao import Configuracao


STATUS_MAPA = {
    "NCOM": "NCOM",
    "RM": "REMANEJADO",
    "TR": "TRANSFERIDO"
}


class PreparadorAta:

    @staticmethod
    def levantar_disciplinas(turma):
        """
        Retorna lista ordenada de todas as disciplinas
        presentes na turma (mapão + eletivas).
        """
        disciplinas = set()

        for carga_bim in turma.carga_horaria.values():
            disciplinas.update(carga_bim.keys())

        for aluno in turma.alunos.values():
            for def_bim in aluno.defasagens.values():
                disciplinas.update(def_bim.keys())

        return sorted(disciplinas)

    # ======================================================
    # PREPARAÇÃO DOS ALUNOS (SEM CÁLCULO DE FREQUÊNCIA)
    # ======================================================
    @staticmethod
    def preparar_alunos(turma, bimestre):
        """
        Frequência vem DIRETO do mapão:
        aluno.frequencia_percentual
        (inteiro, sem cálculo).
        """
        alunos_tabela = []

        for aluno in turma.alunos.values():

            # -------- STATUS --------
            status_raw = getattr(aluno, "status", None)
            status_texto = STATUS_MAPA.get(status_raw, "")
            linha_amarela = status_raw in STATUS_MAPA
            encaminhamento = status_texto if linha_amarela else ""

            # -------- DEFASAGENS --------
            defasagens = set()
            if bimestre in aluno.defasagens:
                for disciplina, em_def in aluno.defasagens[bimestre].items():
                    if em_def:
                        defasagens.add(disciplina)

            # -------- FREQUÊNCIA (DIRETO DO MAPÃO) --------
            freq_pct = ""

            if getattr(aluno, "ativo", True):
                valor = getattr(aluno, "frequencia_percentual", "")

                if valor not in ("", None):
                    try:
                        freq_pct = f"{int(valor)}%"
                    except (ValueError, TypeError):
                        freq_pct = ""

            alunos_tabela.append({
                "numero": aluno.numero_chamada,
                "nome": aluno.nome,
                "status": status_texto,
                "status_raw": status_raw,
                "defasagens": defasagens,
                "frequencia_percentual": freq_pct,
                "encaminhamento": encaminhamento,
                "linha_amarela": linha_amarela
            })

        return alunos_tabela
