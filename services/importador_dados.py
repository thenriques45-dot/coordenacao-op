import csv
from domain.aluno import Aluno
from services.normalizacao import normalizar_disciplina, normalizar_lista_texto


COLUNAS_DEFICIENCIA = {
    "DEFICIENCIA",
    "DEFICIENCIAS",
    "TIPO DE DEFICIENCIA",
    "NECESSIDADE ESPECIAL",
    "NECESSIDADES ESPECIAIS",
    "NEE",
    "PUBLICO ALVO",
    "PUBLICO ALVO AEE",
}

MARCADORES_NEGATIVOS = {"", "NAO", "N", "NAO SE APLICA", "NAO POSSUI", "SEM DEFICIENCIA"}
MARCADORES_POSITIVOS = {"SIM", "S", "ELEGIVEL", "ALUNO ELEGIVEL"}


class ImportadorCSV:
    @staticmethod
    def importar_alunos(caminho_csv):
        alunos = []

        with open(caminho_csv, encoding="utf-8-sig") as arquivo:
            leitor = csv.reader(arquivo, delimiter=';')
            linhas = list(leitor)


            LINHA_CABECALHO = 2

            cabecalho = linhas[LINHA_CABECALHO]
            dados = linhas[LINHA_CABECALHO + 1:]

            for linha in dados:
                registro = dict(zip(cabecalho, linha))

                ra = registro.get("RA", "").strip()
                digito = registro.get("Dig. RA", "").strip()

                if not ra or not digito:
                    continue

                matricula = ra + digito

                nome = registro.get("Nome do Aluno", "").strip()

                numero_chamada_txt = registro.get("Nº de chamada", "").strip()
                if numero_chamada_txt.isdigit():
                    numero_chamada = int(numero_chamada_txt)
                else:
                    numero_chamada = None

                situacao = registro.get("Situação do Aluno", "").lower()
                ativo = situacao in ("ativo", "matriculado", "frequente")

                aluno = Aluno(
                    matricula=matricula,
                    nome=nome,
                    ativo=ativo,
                    numero_chamada=numero_chamada
                )
                aluno.deficiencias = ImportadorCSV._extrair_deficiencias(registro)

                alunos.append(aluno)

        return alunos

    @staticmethod
    def _extrair_deficiencias(registro):
        deficiencias = []
        for coluna, valor in registro.items():
            if normalizar_disciplina(coluna) not in COLUNAS_DEFICIENCIA:
                continue

            texto_normalizado = normalizar_disciplina(valor)
            if texto_normalizado in MARCADORES_NEGATIVOS:
                continue
            if texto_normalizado in MARCADORES_POSITIVOS:
                deficiencias.append("Aluno elegivel")
                continue
            deficiencias.extend(normalizar_lista_texto(valor))

        return normalizar_lista_texto(deficiencias)
