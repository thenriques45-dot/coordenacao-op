from services.importador_dados import ImportadorCSV
from services.persistencia import PersistenciaJSON
from domain.turma import Turma
import os


def main():
    while True:
        print("\n=== CoordenaçãoOP ===")
        print("0 - Sair")
        print("1 - Criar nova turma (importar CSV)")
        print("2 - Abrir turma existente")
        print("3 - Atualizar turma (alunos)")
        print()

        opcao = input("Escolha uma opção: ").strip()

        if opcao == "0":
            print("Encerrando o CoordenaçãoOP.")
            break

        elif opcao == "1":
            codigo_turma = input("Informe a turma (ex: 3A): ").strip()
            ano = int(input("Informe o ano letivo (ex: 2026): ").strip())
            caminho_csv = input("Informe o caminho do arquivo CSV: ").strip()

            turma = Turma(codigo=codigo_turma, ano=ano)

            alunos = ImportadorCSV.importar_alunos(caminho_csv)
            for aluno in alunos:
                turma.adicionar_aluno(aluno)

            caminho_saida = PersistenciaJSON.salvar_turma(turma)
            print(f"\nTurma criada e salva em: {caminho_saida}")

        elif opcao == "2":
            pasta_base = "dados/persistidos"

            if not os.path.exists(pasta_base):
                print("Nenhuma turma salva encontrada.")
                continue

            anos = [
                d for d in os.listdir(pasta_base)
                if os.path.isdir(os.path.join(pasta_base, d))
            ]

            if not anos:
                print("Nenhum ano disponível.")
                continue

            anos_ordenados = sorted(anos)

            print("\nAnos disponíveis:")
            for i, ano in enumerate(anos_ordenados, start=1):
                print(f"{i} - {ano}")

            escolha_ano = input("\nEscolha o ano pelo número: ").strip()

            if not escolha_ano.isdigit():
                print("Opção inválida.")
                continue

            indice_ano = int(escolha_ano) - 1
            if indice_ano < 0 or indice_ano >= len(anos_ordenados):
                print("Opção fora do intervalo.")
                continue

            ano_escolhido = anos_ordenados[indice_ano]
            pasta_ano = os.path.join(pasta_base, ano_escolhido)

            arquivos = [
                f for f in os.listdir(pasta_ano)
                if f.endswith(".json")
            ]

            if not arquivos:
                print("Nenhuma turma encontrada para este ano.")
                continue

            arquivos_ordenados = sorted(arquivos)

            print("\nTurmas disponíveis:")
            for i, nome in enumerate(arquivos_ordenados, start=1):
                print(f"{i} - {nome}")

            escolha_turma = input("\nEscolha a turma pelo número: ").strip()

            if not escolha_turma.isdigit():
                print("Opção inválida.")
                continue

            indice_turma = int(escolha_turma) - 1
            if indice_turma < 0 or indice_turma >= len(arquivos_ordenados):
                print("Opção fora do intervalo.")
                continue

            caminho_json = os.path.join(pasta_ano, arquivos_ordenados[indice_turma])

            turma = PersistenciaJSON.carregar_turma(caminho_json)
            print(f"\nTurma {turma.codigo} ({turma.ano}) carregada com sucesso.")

            # saída informativa (opcional)
            print(f"Total de alunos: {len(turma.alunos)}")

        elif opcao == "3":
            pasta_base = "dados/persistidos"

            if not os.path.exists(pasta_base):
                print("Nenhuma turma salva encontrada.")
                continue

            anos = [
                d for d in os.listdir(pasta_base)
                if os.path.isdir(os.path.join(pasta_base, d))
            ]

            if not anos:
                print("Nenhum ano disponível.")
                continue

            anos_ordenados = sorted(anos)

            print("\nAnos disponíveis:")
            for i, ano in enumerate(anos_ordenados, start=1):
                print(f"{i} - {ano}")

            escolha_ano = input("\nEscolha o ano pelo número: ").strip()
            if not escolha_ano.isdigit():
                print("Opção inválida.")
                continue

            indice_ano = int(escolha_ano) - 1
            if indice_ano < 0 or indice_ano >= len(anos_ordenados):
                print("Opção fora do intervalo.")
                continue

            ano_escolhido = anos_ordenados[indice_ano]
            pasta_ano = os.path.join(pasta_base, ano_escolhido)

            arquivos = [
                f for f in os.listdir(pasta_ano)
                if f.endswith(".json")
            ]

            if not arquivos:
                print("Nenhuma turma encontrada para este ano.")
                continue

            arquivos_ordenados = sorted(arquivos)

            print("\nTurmas disponíveis:")
            for i, nome in enumerate(arquivos_ordenados, start=1):
                print(f"{i} - {nome}")

            escolha_turma = input("\nEscolha a turma pelo número: ").strip()
            if not escolha_turma.isdigit():
                print("Opção inválida.")
                continue

            indice_turma = int(escolha_turma) - 1
            if indice_turma < 0 or indice_turma >= len(arquivos_ordenados):
                print("Opção fora do intervalo.")
                continue

            caminho_json = os.path.join(pasta_ano, arquivos_ordenados[indice_turma])
            turma = PersistenciaJSON.carregar_turma(caminho_json)

            caminho_csv = input("Informe o caminho do CSV atualizado de alunos: ").strip()

            from services.atualizador_turma import AtualizadorTurma
            AtualizadorTurma.atualizar_turma(turma, caminho_csv)

            PersistenciaJSON.salvar_turma(turma)

            print("Turma atualizada com sucesso.")
            print(f"Total de alunos (histórico): {len(turma.alunos)}")


        else:
            print("Opção inválida.")


if __name__ == "__main__":
    main()
