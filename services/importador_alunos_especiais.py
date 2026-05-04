import csv
import os

from services.normalizacao import normalizar_disciplina, normalizar_lista_texto, normalizar_nome
from services.persistencia import PersistenciaJSON
from services.runtime_paths import data_dir


COLUNAS_RA = {"RA", "R.A.", "REGISTRO DO ALUNO", "MATRICULA", "MATRICULA RA"}
COLUNAS_DIGITO_RA = {"DIG RA", "DIG. RA", "DIGITO RA", "DIGITO DO RA"}
COLUNAS_NOME = {"NOME", "NOME DO ALUNO", "ALUNO", "ESTUDANTE", "NOME COMPLETO"}
COLUNAS_DEFICIENCIA = {
    "DEFICIENCIA",
    "DEFICIENCIAS",
    "TIPO DE DEFICIENCIA",
    "NECESSIDADE ESPECIAL",
    "NECESSIDADES ESPECIAIS",
    "NEE",
    "PUBLICO ALVO",
    "PUBLICO ALVO AEE",
    "ELEGIVEL",
    "ALUNO ELEGIVEL",
}
MARCADORES_NEGATIVOS = {"", "NAO", "N", "NAO SE APLICA", "NAO POSSUI", "SEM DEFICIENCIA"}
MARCADORES_POSITIVOS = {"SIM", "S", "ELEGIVEL", "ALUNO ELEGIVEL"}


class ImportadorAlunosEspeciais:
    @staticmethod
    def importar_para_turmas_persistidas(caminho_csv, pasta_persistidos=None):
        registros = ImportadorAlunosEspeciais.ler_csv(caminho_csv)
        pasta_base = pasta_persistidos or data_dir("persistidos")
        resumo = {
            "registros_csv": len(registros),
            "turmas_lidas": 0,
            "turmas_atualizadas": 0,
            "alunos_atualizados": 0,
            "por_matricula": 0,
            "por_nome": 0,
            "nao_encontrados": [],
            "nomes_ambiguos": [],
        }

        if not registros or not os.path.isdir(pasta_base):
            resumo["nao_encontrados"] = [
                r["nome"] or r["matricula"] for r in registros if r["nome"] or r["matricula"]
            ]
            return resumo

        encontrados = set()
        ambiguos = set()
        registros_por_matricula = ImportadorAlunosEspeciais._indexar_por_matricula(registros)
        registros_por_nome = {}
        for registro in registros:
            if registro["nome_normalizado"]:
                registros_por_nome.setdefault(registro["nome_normalizado"], []).append(registro)

        for caminho in ImportadorAlunosEspeciais._iterar_arquivos_turma(pasta_base):
            turma = PersistenciaJSON.carregar_turma(caminho)
            resumo["turmas_lidas"] += 1
            alterou_turma = False

            for aluno in turma.alunos.values():
                registro = None
                modo = None
                matricula = str(getattr(aluno, "matricula", "")).strip()
                candidatos_matricula = ImportadorAlunosEspeciais._buscar_por_matricula(
                    matricula,
                    registros_por_matricula,
                )
                if len(candidatos_matricula) == 1:
                    registro = candidatos_matricula[0]
                    modo = "matricula"
                else:
                    nome_aluno = normalizar_nome(getattr(aluno, "nome", ""))
                    candidatos = registros_por_nome.get(nome_aluno, [])
                    if len(candidatos) == 1:
                        registro = candidatos[0]
                        modo = "nome"
                    elif len(candidatos) > 1:
                        ambiguos.add(getattr(aluno, "nome", nome_aluno))

                if not registro:
                    continue

                novas_deficiencias = normalizar_lista_texto(registro["deficiencias"])
                if not novas_deficiencias:
                    continue

                if normalizar_lista_texto(getattr(aluno, "deficiencias", [])) == novas_deficiencias:
                    encontrados.add(id(registro))
                    continue

                aluno.deficiencias = novas_deficiencias
                encontrados.add(id(registro))
                alterou_turma = True
                resumo["alunos_atualizados"] += 1
                if modo == "matricula":
                    resumo["por_matricula"] += 1
                elif modo == "nome":
                    resumo["por_nome"] += 1

            if alterou_turma:
                PersistenciaJSON.salvar_turma(turma, caminho=caminho)
                resumo["turmas_atualizadas"] += 1

        resumo["nao_encontrados"] = [
            r["nome"] or r["matricula"]
            for r in registros
            if id(r) not in encontrados and (r["nome"] or r["matricula"])
        ]
        resumo["nomes_ambiguos"] = sorted(ambiguos)
        return resumo

    @staticmethod
    def ler_csv(caminho_csv):
        with open(caminho_csv, encoding="utf-8-sig", newline="") as arquivo:
            amostra = arquivo.read(4096)
            arquivo.seek(0)
            try:
                dialeto = csv.Sniffer().sniff(amostra, delimiters=";,")
                leitor = ImportadorAlunosEspeciais._criar_leitor_com_cabecalho(arquivo, dialeto=dialeto)
            except csv.Error:
                leitor = ImportadorAlunosEspeciais._criar_leitor_com_cabecalho(arquivo, delimiter=";")

            registros = []
            for linha in leitor:
                registro = ImportadorAlunosEspeciais._normalizar_linha(linha)
                if registro["deficiencias"] and (registro["matricula"] or registro["nome"]):
                    registros.append(registro)
            return ImportadorAlunosEspeciais._consolidar_por_matricula(registros)

    @staticmethod
    def _normalizar_linha(linha):
        valores = {}
        for coluna, valor in linha.items():
            valores[normalizar_disciplina(coluna)] = valor

        ra = ImportadorAlunosEspeciais._primeiro_valor(valores, COLUNAS_RA)
        digito = ImportadorAlunosEspeciais._primeiro_valor(valores, COLUNAS_DIGITO_RA)
        matricula = f"{ra}{digito}".strip() if ra and digito else ra.strip()
        nome = ImportadorAlunosEspeciais._primeiro_valor(valores, COLUNAS_NOME)
        deficiencias = ImportadorAlunosEspeciais._extrair_deficiencias(valores)

        return {
            "matricula": ImportadorAlunosEspeciais._normalizar_matricula(matricula),
            "nome": " ".join(nome.split()),
            "nome_normalizado": normalizar_nome(nome),
            "deficiencias": deficiencias,
        }

    @staticmethod
    def _criar_leitor_com_cabecalho(arquivo, dialeto=None, delimiter=None):
        if dialeto is not None:
            linhas = list(csv.reader(arquivo, dialect=dialeto))
        else:
            linhas = list(csv.reader(arquivo, delimiter=delimiter or ";"))
        if not linhas:
            return []

        indice_cabecalho = 0
        for indice, linha in enumerate(linhas):
            if ImportadorAlunosEspeciais._linha_parece_cabecalho(linha):
                indice_cabecalho = indice
                break

        cabecalho = linhas[indice_cabecalho]
        return [
            dict(zip(cabecalho, linha))
            for linha in linhas[indice_cabecalho + 1:]
            if any(str(valor).strip() for valor in linha)
        ]

    @staticmethod
    def _linha_parece_cabecalho(linha):
        colunas = {normalizar_disciplina(coluna) for coluna in linha}
        tem_nome = bool(colunas & {normalizar_disciplina(c) for c in COLUNAS_NOME})
        tem_ra = bool(colunas & {normalizar_disciplina(c) for c in COLUNAS_RA})
        tem_deficiencia = bool(colunas & COLUNAS_DEFICIENCIA)
        return tem_nome and (tem_ra or tem_deficiencia)

    @staticmethod
    def _normalizar_matricula(valor):
        texto = "".join(ch for ch in str(valor).strip() if ch.isalnum())
        return texto.upper()

    @staticmethod
    def _variantes_matricula(valor):
        matricula = ImportadorAlunosEspeciais._normalizar_matricula(valor)
        if not matricula:
            return []

        variantes = {matricula}
        sem_zeros = matricula.lstrip("0")
        if sem_zeros:
            variantes.add(sem_zeros)
        if len(matricula) > 1:
            sem_digito = matricula[:-1]
            variantes.add(sem_digito)
            sem_digito_sem_zeros = sem_digito.lstrip("0")
            if sem_digito_sem_zeros:
                variantes.add(sem_digito_sem_zeros)
        return sorted(variantes)

    @staticmethod
    def _indexar_por_matricula(registros):
        indice = {}
        for registro in registros:
            for variante in ImportadorAlunosEspeciais._variantes_matricula(registro["matricula"]):
                indice.setdefault(variante, []).append(registro)
        return indice

    @staticmethod
    def _buscar_por_matricula(matricula, indice):
        candidatos = []
        vistos = set()
        for variante in ImportadorAlunosEspeciais._variantes_matricula(matricula):
            for registro in indice.get(variante, []):
                if id(registro) in vistos:
                    continue
                vistos.add(id(registro))
                candidatos.append(registro)
        return candidatos

    @staticmethod
    def _consolidar_por_matricula(registros):
        consolidados = []
        por_matricula = {}
        for registro in registros:
            matricula = registro["matricula"]
            if not matricula:
                consolidados.append(registro)
                continue

            existente = por_matricula.get(matricula)
            if existente is None:
                por_matricula[matricula] = registro
                consolidados.append(registro)
                continue

            existente["deficiencias"] = normalizar_lista_texto(
                [*existente["deficiencias"], *registro["deficiencias"]]
            )
            if not existente["nome"] and registro["nome"]:
                existente["nome"] = registro["nome"]
                existente["nome_normalizado"] = registro["nome_normalizado"]
        return consolidados

    @staticmethod
    def _primeiro_valor(valores, colunas):
        for coluna in colunas:
            valor = valores.get(normalizar_disciplina(coluna), "")
            if valor is not None and str(valor).strip():
                return str(valor).strip()
        return ""

    @staticmethod
    def _extrair_deficiencias(valores):
        deficiencias = []
        for coluna, valor in valores.items():
            if coluna not in COLUNAS_DEFICIENCIA:
                continue
            texto_normalizado = normalizar_disciplina(valor)
            if texto_normalizado in MARCADORES_NEGATIVOS:
                continue
            if texto_normalizado in MARCADORES_POSITIVOS:
                deficiencias.append("Aluno elegivel")
                continue
            deficiencias.extend(normalizar_lista_texto(valor))
        return normalizar_lista_texto(deficiencias)

    @staticmethod
    def _iterar_arquivos_turma(pasta_base):
        for raiz, _, arquivos in os.walk(pasta_base):
            for arquivo in sorted(arquivos):
                if arquivo.startswith("turma_") and arquivo.endswith(".json"):
                    yield os.path.join(raiz, arquivo)
