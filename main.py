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
        print("4 - Definir nota mínima")
        print("5 - Importar mapão (frequência e defasagens)")
        print("6 - Ler aulas dadas por disciplina (diagnóstico)")
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
            print(f"Total de alunos: {len(turma.alunos)}")

        elif opcao == "3":
            pasta_base = "dados/persistidos"

            if not os.path.exists(pasta_base):
                print("Nenhuma turma salva encontrada.")
                continue

            anos = sorted([
                d for d in os.listdir(pasta_base)
                if os.path.isdir(os.path.join(pasta_base, d))
            ])

            if not anos:
                print("Nenhum ano disponível.")
                continue

            print("\nAnos disponíveis:")
            for i, ano in enumerate(anos, start=1):
                print(f"{i} - {ano}")

            escolha_ano = input("\nEscolha o ano pelo número: ").strip()
            if not escolha_ano.isdigit():
                continue

            pasta_ano = os.path.join(pasta_base, anos[int(escolha_ano) - 1])

            arquivos = sorted([
                f for f in os.listdir(pasta_ano)
                if f.endswith(".json")
            ])

            if not arquivos:
                print("Nenhuma turma encontrada.")
                continue

            print("\nTurmas disponíveis:")
            for i, nome in enumerate(arquivos, start=1):
                print(f"{i} - {nome}")

            escolha_turma = input("\nEscolha a turma pelo número: ").strip()
            if not escolha_turma.isdigit():
                continue

            caminho_json = os.path.join(pasta_ano, arquivos[int(escolha_turma) - 1])
            turma = PersistenciaJSON.carregar_turma(caminho_json)

            caminho_csv = input("Informe o caminho do CSV atualizado de alunos: ").strip()

            from services.atualizador_turma import AtualizadorTurma
            AtualizadorTurma.atualizar_turma(turma, caminho_csv)

            PersistenciaJSON.salvar_turma(turma)

            print("Turma atualizada com sucesso.")
            print(f"Total de alunos (histórico): {len(turma.alunos)}")

        elif opcao == "4":
            from services.configuracao import Configuracao

            atual = Configuracao.obter_nota_minima()
            print(f"\nNota mínima atual: {atual}")

            novo_valor = input("Informe a nova nota mínima (ou Enter para manter): ").strip()

            if not novo_valor:
                print("Nota mínima mantida.")
                continue

            try:
                novo_valor = float(novo_valor.replace(",", "."))
            except ValueError:
                print("Valor inválido. Informe um número.")
                continue

            Configuracao.definir_nota_minima(novo_valor)
            print(f"Nota mínima atualizada para: {novo_valor}")

        elif opcao == "5":
            pasta_base = "dados/persistidos"

            if not os.path.exists(pasta_base):
                print("Nenhuma turma salva encontrada.")
                continue

            anos = sorted([
                d for d in os.listdir(pasta_base)
                if os.path.isdir(os.path.join(pasta_base, d))
            ])

            if not anos:
                print("Nenhum ano disponível.")
                continue

            print("\nAnos disponíveis:")
            for i, ano in enumerate(anos, start=1):
                print(f"{i} - {ano}")

            escolha_ano = input("\nEscolha o ano pelo número: ").strip()
            if not escolha_ano.isdigit():
                continue

            pasta_ano = os.path.join(pasta_base, anos[int(escolha_ano) - 1])

            arquivos = sorted([
                f for f in os.listdir(pasta_ano)
                if f.endswith(".json")
            ])

            if not arquivos:
                print("Nenhuma turma encontrada.")
                continue

            print("\nTurmas disponíveis:")
            for i, nome in enumerate(arquivos, start=1):
                print(f"{i} - {nome}")

            escolha_turma = input("\nEscolha a turma: ").strip()
            if not escolha_turma.isdigit():
                continue

            caminho_json = os.path.join(pasta_ano, arquivos[int(escolha_turma) - 1])
            turma = PersistenciaJSON.carregar_turma(caminho_json)

            bimestre = input("Informe o bimestre (ex: 1): ").strip()
            caminho_excel = input("Informe o caminho do mapão (.xlsx): ").strip()

            from services.importador_mapao import ImportadorMapao
            ImportadorMapao.importar(caminho_excel, turma, bimestre)

            PersistenciaJSON.salvar_turma(turma)
            print("Mapão importado com sucesso.")

        elif opcao == "6":
            caminho_excel = input("Informe o caminho do mapão (.xlsx): ").strip()

            from services.leitor_aulas_mapao import extrair_aulas_por_disciplina
            aulas = extrair_aulas_por_disciplina(caminho_excel)

            print("\nAulas dadas por disciplina:")
            for disciplina, total in aulas.items():
                print(f"- {disciplina}: {total}")

        else:
            print("Opção inválida.")


if __name__ == "__main__":
    main()
