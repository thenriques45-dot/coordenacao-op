import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from domain.aluno import Aluno
from domain.turma import Turma
from services.importador_alunos_especiais import ImportadorAlunosEspeciais
from services.importador_dados import ImportadorCSV
from services.persistencia import PersistenciaJSON


class TestAlunosNecessidadesEspeciais(unittest.TestCase):
    def test_persistencia_salva_lista_de_deficiencias(self):
        turma = Turma("2A", 2026)
        aluno = Aluno("1", "ALUNO TESTE")
        aluno.deficiencias = ["Deficiencia auditiva", "TEA"]
        turma.adicionar_aluno(aluno)

        with TemporaryDirectory() as tmpdir:
            with patch("services.persistencia.data_dir", side_effect=lambda *parts: f"{tmpdir}\\{'\\\\'.join(parts)}"):
                caminho = PersistenciaJSON.salvar_turma(turma)
                restaurada = PersistenciaJSON.carregar_turma(caminho)

        self.assertEqual(restaurada.alunos["1"].deficiencias, ["Deficiencia auditiva", "TEA"])

    def test_importador_csv_le_coluna_de_necessidades_especiais(self):
        conteudo = "\n".join(
            [
                "linha 1",
                "linha 2",
                "RA;Dig. RA;Nome do Aluno;Nº de chamada;Situação do Aluno;Necessidades Especiais",
                "123;4;ALUNO TESTE;7;Ativo;Deficiencia visual, TEA",
            ]
        )

        with TemporaryDirectory() as tmpdir:
            caminho = Path(tmpdir) / "alunos.csv"
            with open(caminho, "w", encoding="utf-8-sig") as arquivo:
                arquivo.write(conteudo)

            alunos = ImportadorCSV.importar_alunos(caminho)

        self.assertEqual(alunos[0].deficiencias, ["Deficiencia visual", "TEA"])

    def test_importador_geral_atualiza_turma_persistida_por_ra_e_nome(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            turma = Turma("2A", 2026)
            turma.adicionar_aluno(Aluno("1234", "ALUNO POR RA"))
            turma.adicionar_aluno(Aluno("9999", "Aluno Por Nome"))
            caminho_turma = base / "2026" / "turma_2A.json"
            PersistenciaJSON.salvar_turma(turma, caminho=caminho_turma)

            caminho_csv = base / "elegiveis.csv"
            conteudo = "\n".join(
                [
                    "RA;Dig. RA;Nome do Aluno;Necessidades Especiais",
                    "123;4;OUTRO NOME;Deficiencia auditiva",
                    ";;Aluno Por Nome;TEA",
                    "777;7;ALUNO FORA;Deficiencia visual",
                ]
            )
            with open(caminho_csv, "w", encoding="utf-8-sig") as arquivo:
                arquivo.write(conteudo)

            resumo = ImportadorAlunosEspeciais.importar_para_turmas_persistidas(
                caminho_csv,
                pasta_persistidos=base,
            )
            restaurada = PersistenciaJSON.carregar_turma(caminho_turma)

        self.assertEqual(restaurada.alunos["1234"].deficiencias, ["Deficiencia auditiva"])
        self.assertEqual(restaurada.alunos["9999"].deficiencias, ["TEA"])
        self.assertEqual(resumo["alunos_atualizados"], 2)
        self.assertEqual(resumo["por_matricula"], 1)
        self.assertEqual(resumo["por_nome"], 1)
        self.assertEqual(resumo["nao_encontrados"], ["ALUNO FORA"])

    def test_importador_geral_le_csv_com_cabecalho_na_terceira_linha_e_ra_sem_digito(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            turma = Turma("2A", 2026)
            turma.adicionar_aluno(Aluno("0001127377449", "GABRIEL HENDREW DA SILVA ALVES"))
            caminho_turma = base / "2026" / "turma_2A.json"
            PersistenciaJSON.salvar_turma(turma, caminho=caminho_turma)

            caminho_csv = base / "dados.csv"
            conteudo = "\n".join(
                [
                    "Dados;30/04/2026 22:04",
                    "",
                    "Nome do Aluno;RA;Nome Escola;Tipo de Ensino;Série/Ano;Deficiência",
                    (
                        "GABRIEL HENDREW DA SILVA ALVES;000112737744;IRENE DA SILVA COSTA PROFESSORA;"
                        "NOVO ENSINO MÉDIO;2ª SERIE A NOITE ANUAL;SURDEZ LEVE OU MODERADA"
                    ),
                    (
                        "GABRIEL HENDREW DA SILVA ALVES;000112737744;IRENE DA SILVA COSTA PROFESSORA;"
                        "EXPANSÃO NOVO EM;NÃO SERIADO A TARDE ANUAL;SURDEZ LEVE OU MODERADA"
                    ),
                ]
            )
            with open(caminho_csv, "w", encoding="utf-8-sig") as arquivo:
                arquivo.write(conteudo)

            resumo = ImportadorAlunosEspeciais.importar_para_turmas_persistidas(
                caminho_csv,
                pasta_persistidos=base,
            )
            restaurada = PersistenciaJSON.carregar_turma(caminho_turma)

        self.assertEqual(restaurada.alunos["0001127377449"].deficiencias, ["SURDEZ LEVE OU MODERADA"])
        self.assertEqual(resumo["registros_csv"], 1)
        self.assertEqual(resumo["alunos_atualizados"], 1)
        self.assertEqual(resumo["por_matricula"], 1)

    def test_importador_geral_ignora_nome_ambiguo(self):
        with TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            turma = Turma("2A", 2026)
            turma.adicionar_aluno(Aluno("1", "ALUNO REPETIDO"))
            caminho_turma = base / "2026" / "turma_2A.json"
            PersistenciaJSON.salvar_turma(turma, caminho=caminho_turma)

            caminho_csv = base / "elegiveis.csv"
            conteudo = "\n".join(
                [
                    "Nome do Aluno;Necessidades Especiais",
                    "ALUNO REPETIDO;TEA",
                    "ALUNO REPETIDO;Deficiencia visual",
                ]
            )
            with open(caminho_csv, "w", encoding="utf-8-sig") as arquivo:
                arquivo.write(conteudo)

            resumo = ImportadorAlunosEspeciais.importar_para_turmas_persistidas(
                caminho_csv,
                pasta_persistidos=base,
            )
            restaurada = PersistenciaJSON.carregar_turma(caminho_turma)

        self.assertEqual(restaurada.alunos["1"].deficiencias, [])
        self.assertEqual(resumo["alunos_atualizados"], 0)
        self.assertEqual(resumo["nomes_ambiguos"], ["ALUNO REPETIDO"])


if __name__ == "__main__":
    unittest.main()
