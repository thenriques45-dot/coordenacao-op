import pandas as pd
from services.leitor_aulas_mapao import extrair_aulas_por_disciplina
from services.configuracao import Configuracao
from services.periodo_letivo import garantir_bimestre_operacional


class ImportadorMapao:
    @staticmethod
    def importar(caminho_excel, turma, bimestre):
        bimestre = garantir_bimestre_operacional(bimestre)
        df = pd.read_excel(caminho_excel, header=None)

        # ----------------------------------------
        # localizar linha do cabeçalho "ALUNO"
        # ----------------------------------------
        linha_inicio = None
        for i, valor in enumerate(df.iloc[:, 0]):
            if isinstance(valor, str) and valor.strip().upper() == "ALUNO":
                linha_inicio = i
                break

        if linha_inicio is None:
            raise ValueError("Cabeçalho 'ALUNO' não encontrado no mapão.")

        # =====================================================
        # ⭐ LINHA REAL DOS RÓTULOS (onde está Fre An(%))
        # =====================================================
        cabecalho = df.iloc[linha_inicio + 1].tolist()

        # =====================================================
        # ⭐ procurar "Fre An(%)" nas próximas linhas (robusto)
        # =====================================================
        col_frequencia = None
        linha_freq = None

        for offset in range(1, 6):  # procura até 5 linhas abaixo
            linha_teste = df.iloc[linha_inicio + offset].tolist()

            for i, col in enumerate(linha_teste):
                if isinstance(col, str):
                    nome = col.strip().upper()
                    if "FRE" in nome and "AN" in nome:
                        col_frequencia = i
                        linha_freq = linha_inicio + offset
                        break

            if col_frequencia is not None:
                break

        if col_frequencia is None:
            raise ValueError("Coluna 'Fre An(%)' não encontrada no mapão.")
        

        # ----------------------------------------
        # 1️⃣ Mapear blocos de disciplinas (linha ALUNO)
        # ----------------------------------------
        cabecalho_blocos = df.iloc[linha_inicio].tolist()

        blocos = {}
        idx = 0

        while idx < len(cabecalho_blocos):
            nome = cabecalho_blocos[idx]

            if isinstance(nome, str) and "\n" in nome:
                disciplina = nome.split("\n")[0].strip().upper()
                inicio = idx
                fim = idx

                j = idx + 1
                while j < len(cabecalho_blocos) and pd.isna(cabecalho_blocos[j]):
                    fim = j
                    j += 1

                blocos[disciplina] = (inicio, fim)
                idx = j
            else:
                idx += 1

        # ----------------------------------------
        # 2️⃣ Carga horária
        # ----------------------------------------
        carga_nova = extrair_aulas_por_disciplina(caminho_excel)

        if bimestre not in turma.carga_horaria:
            turma.carga_horaria[bimestre] = {}

        for disciplina, carga in carga_nova.items():
            turma.carga_horaria[bimestre].setdefault(disciplina, carga)

        # ----------------------------------------
        # 3️⃣ Processar alunos
        # ----------------------------------------
        nota_minima = Configuracao.obter_nota_minima()

        # ⭐ começa 2 linhas abaixo agora
        for _, linha in df.iloc[linha_freq + 1:].iterrows():

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
                continue

            aluno.frequencia.setdefault(bimestre, {})
            aluno.defasagens.setdefault(bimestre, {})
            aluno.medias.setdefault(bimestre, {})

            # =====================================================
            # DISCIPLINAS (média + faltas)
            # =====================================================
            for disciplina, (inicio, _) in blocos.items():

                # -------- MÉDIA --------
                media = None
                if inicio < len(linha):
                    valor_media = linha.iloc[inicio]
                    try:
                        media = float(valor_media) if not pd.isna(valor_media) else None
                    except:
                        media = None

                if disciplina not in aluno.medias[bimestre] and media is not None:
                    aluno.medias[bimestre][disciplina] = media

                if disciplina not in aluno.defasagens[bimestre]:
                    if media is not None and media < nota_minima:
                        aluno.defasagens[bimestre][disciplina] = True

                # -------- FALTAS --------
                col_faltas = inicio + 1
                if col_faltas >= len(linha):
                    continue

                try:
                    faltas = int(linha.iloc[col_faltas]) if not pd.isna(linha.iloc[col_faltas]) else 0
                except:
                    faltas = 0
                if disciplina not in aluno.frequencia[bimestre]:
                    aluno.frequencia[bimestre][disciplina] = faltas

            # =====================================================
            # ⭐ FREQUÊNCIA CONSOLIDADA DO MAPÃO (OFICIAL)
            # =====================================================
            try:
                # Frequência deve vir do primeiro mapão (FGB).
                if getattr(aluno, "frequencia_percentual", "") in ("", None):
                    if getattr(aluno, "ativo", True):

                        valor = linha.iloc[col_frequencia]

                        if not pd.isna(valor):
                            texto = str(valor).replace("%", "").strip().replace(",", ".")
                            num = float(texto)
                            # Se vier como fração (ex.: 0.65), converte para 65.
                            if num <= 1:
                                num = num * 100
                            aluno.frequencia_percentual = int(round(num))
                        else:
                            aluno.frequencia_percentual = ""
                    else:
                        aluno.frequencia_percentual = ""

            except:
                if getattr(aluno, "frequencia_percentual", "") in ("", None):
                    aluno.frequencia_percentual = ""
