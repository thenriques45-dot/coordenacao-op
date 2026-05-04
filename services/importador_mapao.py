import pandas as pd
from services.acompanhamento_ajustes import AcompanhamentoAjustes
from services.leitor_aulas_mapao import extrair_aulas_por_disciplina
from services.configuracao import Configuracao
from services.normalizacao import normalizar_disciplina
from services.periodo_letivo import garantir_bimestre_operacional


class ImportadorMapao:
    @staticmethod
    def _normalizar_rotulo(valor):
        if not isinstance(valor, str):
            return ""
        return " ".join(valor.strip().upper().split())

    @staticmethod
    def _localizar_colunas_bloco(df, linha_inicio, linha_freq, inicio, fim):
        col_media = inicio
        col_faltas = inicio + 1 if inicio + 1 <= fim else None
        col_compensacao = None

        for coluna in range(inicio, fim + 1):
            rotulos = []
            for linha in range(linha_inicio + 1, min(linha_freq + 1, len(df.index))):
                rotulo = ImportadorMapao._normalizar_rotulo(df.iat[linha, coluna])
                if rotulo:
                    rotulos.append(rotulo)

            texto = " | ".join(rotulos)
            if "AC" in rotulos or ("COMP" in texto and ("AUS" in texto or "FALT" in texto or "COMPEN" in texto)):
                col_compensacao = coluna
            elif "FALT" in texto and col_faltas is None:
                col_faltas = coluna
            elif "F" in rotulos and col_faltas is None:
                col_faltas = coluna
            elif ("MED" in texto or "NOT" in texto) and col_media == inicio:
                col_media = coluna
            elif "M" in rotulos and col_media == inicio:
                col_media = coluna

        return {
            "media": col_media,
            "faltas": col_faltas,
            "compensacao": col_compensacao,
        }

    @staticmethod
    def _ler_float(valor):
        try:
            if pd.isna(valor):
                return None
        except Exception:
            pass
        try:
            return float(str(valor).replace(",", "."))
        except Exception:
            return None

    @staticmethod
    def _ler_int(valor):
        try:
            if pd.isna(valor):
                return None
        except Exception:
            pass
        try:
            return int(round(float(str(valor).replace(",", "."))))
        except Exception:
            return None

    @staticmethod
    def importar(caminho_excel, turma, bimestre, disciplinas_preservadas=None):
        bimestre = garantir_bimestre_operacional(bimestre)
        disciplinas_preservadas = set(disciplinas_preservadas or [])
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
                disciplina = normalizar_disciplina(nome.split("\n")[0])
                inicio = idx
                fim = idx

                j = idx + 1
                while j < len(cabecalho_blocos) and pd.isna(cabecalho_blocos[j]):
                    fim = j
                    j += 1

                blocos[disciplina] = ImportadorMapao._localizar_colunas_bloco(
                    df,
                    linha_inicio,
                    linha_freq,
                    inicio,
                    fim,
                )
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
            aluno.compensacao_ausencias.setdefault(bimestre, {})
            aluno.defasagens.setdefault(bimestre, {})
            aluno.medias.setdefault(bimestre, {})

            # =====================================================
            # DISCIPLINAS (média + faltas)
            # =====================================================
            for disciplina, colunas in blocos.items():
                if disciplina in disciplinas_preservadas:
                    continue

                # -------- MÉDIA --------
                media = None
                col_media = colunas.get("media")
                if col_media is not None and col_media < len(linha):
                    media = ImportadorMapao._ler_float(linha.iloc[col_media])

                if media is not None:
                    aluno.medias[bimestre][disciplina] = media

                media_vigente = aluno.medias[bimestre].get(disciplina)
                if media_vigente is not None and media_vigente < nota_minima:
                    aluno.defasagens[bimestre][disciplina] = True
                else:
                    aluno.defasagens[bimestre].pop(disciplina, None)

                # -------- FALTAS --------
                col_faltas = colunas.get("faltas")
                if col_faltas is not None and col_faltas < len(linha):
                    faltas = ImportadorMapao._ler_int(linha.iloc[col_faltas])
                    if faltas is not None:
                        aluno.frequencia[bimestre][disciplina] = faltas

                # -------- COMPENSACAO DE AUSENCIAS --------
                col_compensacao = colunas.get("compensacao")
                if col_compensacao is not None and col_compensacao < len(linha):
                    compensadas = ImportadorMapao._ler_int(linha.iloc[col_compensacao])
                    if compensadas is not None:
                        aluno.compensacao_ausencias[bimestre][disciplina] = compensadas

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

            AcompanhamentoAjustes.reconciliar_aluno(aluno, bimestre)
