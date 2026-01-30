import pandas as pd
from services.leitor_aulas_mapao import extrair_aulas_por_disciplina
from services.configuracao import Configuracao


class ImportadorMapao:
    @staticmethod
    def importar(caminho_excel, turma, bimestre):
        df = pd.read_excel(caminho_excel, header=None)

        # ----------------------------------------
        # localizar linha do cabeçalho
        # ----------------------------------------
        linha_inicio = None
        for i, valor in enumerate(df.iloc[:, 0]):
            if isinstance(valor, str) and valor.strip().upper() == "ALUNO":
                linha_inicio = i
                break

        if linha_inicio is None:
            raise ValueError("Cabeçalho 'ALUNO' não encontrado no mapão.")

        cabecalho = df.iloc[linha_inicio].tolist()

        # ----------------------------------------
        # 1️⃣ Mapear blocos de disciplinas
        # ----------------------------------------
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
        # 2️⃣ Carga horária (MERGE por bimestre)
        # ----------------------------------------
        carga_nova = extrair_aulas_por_disciplina(caminho_excel)

        if bimestre not in turma.carga_horaria:
            turma.carga_horaria[bimestre] = {}

        # merge seguro de carga horária
        turma.carga_horaria[bimestre].update(carga_nova)

        # ----------------------------------------
        # 3️⃣ Processar alunos
        # ----------------------------------------
        nota_minima = Configuracao.obter_nota_minima()

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
                continue  # aluno não pertence à turma

            # inicializações seguras
            aluno.frequencia.setdefault(bimestre, {})
            aluno.defasagens.setdefault(bimestre, {})

            for disciplina, (inicio, _) in blocos.items():

                # ===================== MÉDIA =====================
                col_media = inicio
                media = None

                if col_media < len(linha):
                    valor_media = linha.iloc[col_media]
                    try:
                        media = float(valor_media) if not pd.isna(valor_media) else None
                    except (ValueError, TypeError):
                        media = None

                # registra somente defasagens (média < nota mínima)
                if media is not None and media < nota_minima:
                    aluno.defasagens[bimestre][disciplina] = True

                # ===================== FALTAS =====================
                col_faltas = inicio + 1
                if col_faltas >= len(linha):
                    continue

                valor_faltas = linha.iloc[col_faltas]
                try:
                    faltas = int(valor_faltas) if not pd.isna(valor_faltas) else 0
                except (ValueError, TypeError):
                    faltas = 0

                faltas_atuais = aluno.frequencia[bimestre].get(disciplina)

                # REGRA DE OURO:
                # - não sobrescreve valor existente
                # - só grava se for disciplina nova ou faltas > 0
                if faltas_atuais is None or faltas > 0:
                    aluno.frequencia[bimestre][disciplina] = faltas
