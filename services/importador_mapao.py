import pandas as pd
import re
from services.leitor_aulas_mapao import extrair_aulas_por_disciplina


class ImportadorMapao:
    @staticmethod
    def importar(caminho_excel, turma, bimestre):
        df = pd.read_excel(caminho_excel, header=None)

        # localizar linha do cabeçalho
        linha_inicio = None
        for i, valor in enumerate(df.iloc[:, 0]):
            if isinstance(valor, str) and valor.strip().upper() == "ALUNO":
                linha_inicio = i
                break

        if linha_inicio is None:
            raise ValueError("Cabeçalho 'ALUNO' não encontrado no mapão.")

        cabecalho = df.iloc[linha_inicio].tolist()

        # -----------------------------
        # 1️⃣ Mapear blocos de disciplinas
        # -----------------------------
        blocos = {}
        idx = 0

        while idx < len(cabecalho):
            nome = cabecalho[idx]

            if isinstance(nome, str) and "\n" in nome:
                disciplina = nome.split("\n")[0].strip().upper()
                inicio = idx
                fim = idx

                j = idx + 1
                while j < len(cabecalho) and pd.isna(cabecalho[j]):
                    fim = j
                    j += 1

                blocos[disciplina] = (inicio, fim)
                idx = j
            else:
                idx += 1

        # ----------------------------------------
        # 2️⃣ Carga horária (uma vez por bimestre)
        # ----------------------------------------
        if bimestre not in turma.carga_horaria:
            carga = extrair_aulas_por_disciplina(caminho_excel)
            turma.definir_carga_horaria(bimestre, carga)

        # ----------------------------------------
        # 3️⃣ Processar alunos (linha a linha)
        # ----------------------------------------
        for _, linha in df.iloc[linha_inicio + 1:].iterrows():
            nome_aluno = linha.iloc[0]

            if not isinstance(nome_aluno, str):
                continue

            nome_aluno = nome_aluno.strip().upper()

            # localizar aluno na turma
            aluno = None
            for a in turma.alunos.values():
                if a.nome.upper() == nome_aluno:
                    aluno = a
                    break

            if aluno is None:
                continue  # aluno não pertence à turma atual

            faltas_por_disciplina = {}

            for disciplina, (inicio, _) in blocos.items():
                col_faltas = inicio + 1  # 2ª coluna do bloco

                if col_faltas >= len(linha):
                    continue

                valor = linha.iloc[col_faltas]

                if pd.isna(valor):
                    faltas = 0
                else:
                    try:
                        faltas = int(valor)
                    except (ValueError, TypeError):
                        faltas = 0

                faltas_por_disciplina[disciplina] = faltas

            # grava frequência do bimestre
            aluno.frequencia[bimestre] = faltas_por_disciplina
