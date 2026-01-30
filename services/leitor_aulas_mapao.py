import re
import pandas as pd


def extrair_aulas_por_disciplina(caminho_excel):
    df = pd.read_excel(caminho_excel, header=None)

    # localizar linha do cabeçalho
    linha_inicio = None
    for i, valor in enumerate(df.iloc[:, 0]):
        if isinstance(valor, str) and valor.strip().upper() == "ALUNO":
            linha_inicio = i
            break

    if linha_inicio is None:
        raise ValueError("Cabeçalho não encontrado.")

    cabecalho = df.iloc[linha_inicio].tolist()

    # 1️⃣ Mapear blocos de disciplinas (inicio, fim)
    blocos = {}
    idx = 0
    while idx < len(cabecalho):
        nome = cabecalho[idx]
        if isinstance(nome, str) and "\n" in nome:
            disciplina = nome.split("\n")[0].strip().upper()
            inicio = idx
            fim = idx

            # avançar enquanto as próximas colunas forem NaN
            j = idx + 1
            while j < len(cabecalho) and pd.isna(cabecalho[j]):
                fim = j
                j += 1

            blocos[disciplina] = (inicio, fim)
            idx = j
        else:
            idx += 1

    # 2️⃣ Procurar "Aulas Dadas" e associar ao bloco correto
    aulas_por_disciplina = {}

    for _, linha in df.iterrows():
        for col_idx, celula in enumerate(linha):
            if not isinstance(celula, str):
                continue

            texto = celula.upper()
            if "AULAS DADAS" not in texto:
                continue

            match = re.search(r"AULAS DADAS\s*:\s*(\d+)", texto)
            if not match:
                continue

            total = int(match.group(1))

            # descobrir a qual bloco pertence
            for disciplina, (ini, fim) in blocos.items():
                if ini <= col_idx <= fim:
                    aulas_por_disciplina[disciplina] = total
                    break

    return aulas_por_disciplina
