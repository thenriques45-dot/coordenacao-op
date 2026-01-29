import csv
from domain.aluno import Aluno


class ImportadorCSV:
    @staticmethod
    def importar_alunos(caminho_csv):
        alunos = []

        with open(caminho_csv, newline='', encoding='utf-8') as arquivo:
            leitor = csv.DictReader(arquivo)

            for linha in leitor:
                matricula = linha["matricula"]
                nome = linha["nome"]

                # campo ativo pode vir de várias formas
                ativo_str = linha.get("ativo", "true").lower()
                ativo = ativo_str in ("true", "1", "sim", "ativo")

                aluno = Aluno(matricula, nome, ativo)
                alunos.append(aluno)

        return alunos
