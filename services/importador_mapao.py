from services.leitor_aulas_mapao import extrair_aulas_por_disciplina
from services.configuracao import Configuracao
import pandas as pd


class ImportadorMapao:

    @staticmethod
    def importar(caminho_excel, turma, bimestre):
        df = pd.read_excel(caminho_excel, header=None)

        nota_minima = Configuracao.obter_nota_minima()

        # localizar cabeçalho
        linha_inicio = None
        for i, valor in enumerate(df.iloc[:, 0]):
            if isinstance(valor, str) and valor.strip().upper() == "ALUNO":
                linha_inicio = i
                break

        if linha_inicio is None:
            raise ValueError("Cabeçalho não encontrado no mapão.")

        cabecalho = df.iloc[linha_inicio].tolist()

        # mapear disciplinas → coluna de média
        col_media = {}
        idx = 0
        while idx < len(cabecalho):
            nome = cabecalho[idx]
            if isinstance(nome, str) and "\n" in nome:
                disciplina = nome.split("\n")[0].strip().upper()
                col_media[disciplina] = idx
                idx += 3
            else:
                idx += 1

        # percorrer alunos
        for i in range(linha_inicio + 1, len(df)):
            nome_aluno = df.iloc[i, 0]
            if not isinstance(nome_aluno, str) or nome_aluno.strip() == "":
                break

            nome_aluno = nome_aluno.strip().upper()

            # localizar aluno na turma
            aluno = None
            for a in turma.alunos.values():
                if a.nome.upper() == nome_aluno:
                    aluno = a
                    break

            if aluno is None:
                continue

            aluno.defasagens.setdefault(bimestre, {})

            for disciplina, col in col_media.items():
                valor = df.iloc[i, col]

                if isinstance(valor, (int, float)):
                    aluno.defasagens[bimestre][disciplina] = valor < nota_minima

        # importar aulas dadas automaticamente
        try:
            aulas = extrair_aulas_por_disciplina(caminho_excel)
            if aulas:
                turma.carga_horaria[bimestre] = aulas
        except Exception:
            pass
