from services.importador_dados import ImportadorCSV
from services.persistencia import PersistenciaJSON
from services.configuracao import Configuracao
from domain.turma import Turma
import os


# ======================================================
# UTIL: ESCOLHER TURMA
# ======================================================
def escolher_turma():
    pasta_base = "dados/persistidos"
    if not os.path.exists(pasta_base):
        print("Nenhuma turma salva encontrada.")
        return None

    anos = sorted(
        d for d in os.listdir(pasta_base)
        if os.path.isdir(os.path.join(pasta_base, d))
    )

    if not anos:
        print("Nenhum ano disponível.")
        return None

    print("\nAnos disponíveis:")
    for i, ano in enumerate(anos, start=1):
        print(f"{i} - {ano}")

    escolha_ano = input("Escolha o ano: ").strip()
    if not escolha_ano.isdigit():
        return None

    pasta_ano = os.path.join(pasta_base, anos[int(escolha_ano) - 1])

    arquivos = sorted(
        f for f in os.listdir(pasta_ano)
        if f.endswith(".json")
    )

    if not arquivos:
        print("Nenhuma turma encontrada.")
        return None

    print("\nTurmas disponíveis:")
    for i, nome in enumerate(arquivos, start=1):
        print(f"{i} - {nome}")

    escolha_turma = input("Escolha a turma: ").strip()
    if not escolha_turma.isdigit():
        return None

    caminho_json = os.path.join(pasta_ano, arquivos[int(escolha_turma) - 1])
    return PersistenciaJSON.carregar_turma(caminho_json)


# ======================================================
# MAIN
# ======================================================
def main():
    while True:
        print("\n=== CoordenaçãoOP ===")
        print("0 - Sair")
        print("1 - Configurações")
        print("2 - Criar nova turma (importar CSV)")
        print("3 - Abrir turma existente")
        print("4 - Atualizar turma (alunos)")
        print("5 - Importar mapão (frequência, notas e carga horária)")
        print("6 - Gerar ata do Conselho de Classe")
        print("7 - Gerar relatório para professores")
        print()

        opcao = input("Escolha uma opção: ").strip()

        # ===================== SAIR =====================
        if opcao == "0":
            print("Encerrando o CoordenaçãoOP.")
            break

        # ===================== CONFIGURAÇÕES =====================
        elif opcao == "1":
            print("\nConfigurações:")
            print("1 - Definir nota mínima")
            print("2 - Definir direção")

            sub = input("Escolha uma opção: ").strip()

            if sub == "1":
                atual = Configuracao.obter_nota_minima()
                print(f"Nota mínima atual: {atual}")

                novo = input("Nova nota mínima (Enter para manter): ").strip()
                if novo:
                    Configuracao.definir_nota_minima(float(novo.replace(",", ".")))
                    print("Nota mínima atualizada.")

            elif sub == "2":
                atual_nome, atual_pronome = Configuracao.obter_direcao()
                pronome_txt = "ELA/DELA" if atual_pronome == "F" else "ELE/DELE"
                print(f"Direção atual: {atual_nome} ({pronome_txt})")

                nome = input("Nome da direção: ").strip()
                if not nome:
                    print("Nome não informado.")
                    continue

                print("Pronome:")
                print("1 - ELA/DELA (Diretora Sra.)")
                print("2 - ELE/DELE (Diretor Sr.)")
                escolha = input("Escolha o pronome: ").strip()
                pronome = "F" if escolha == "1" else "M"

                Configuracao.definir_direcao(nome, pronome)
                print("Direção atualizada.")

        # ===================== CRIAR TURMA =====================
        elif opcao == "2":
            print("\nCiclos disponíveis:")
            print("1 - Educação Infantil (EI)")
            print("2 - Ensino Fundamental Anos Iniciais (EFAI)")
            print("3 - Ensino Fundamental Anos Finais (EFAF)")
            print("4 - Ensino Médio (EM)")

            ciclos = {
                "1": "EI",
                "2": "EFAI",
                "3": "EFAF",
                "4": "EM"
            }

            opcao_ciclo = input("Escolha o ciclo: ").strip()
            if opcao_ciclo not in ciclos:
                print("Ciclo inválido.")
                continue

            ciclo = ciclos[opcao_ciclo]

            # Séries por ciclo
            if ciclo == "EI":
                series = {
                    "1": "BERÇÁRIO I",
                    "2": "BERÇÁRIO II",
                    "3": "MATERNAL I",
                    "4": "MATERNAL II",
                    "5": "PRÉ-ESCOLA I",
                    "6": "PRÉ-ESCOLA II"
                }
            elif ciclo == "EFAI":
                series = {str(i): f"{i}º ANO" for i in range(1, 5)}
            elif ciclo == "EFAF":
                series = {str(i): f"{i}º ANO" for i in range(6, 10)}
            else:
                series = {
                    "1": "1ª SÉRIE",
                    "2": "2ª SÉRIE",
                    "3": "3ª SÉRIE"
                }

            print("\nSéries disponíveis:")
            for k, v in series.items():
                print(f"{k} - {v}")

            escolha_serie = input("Escolha a série: ").strip()
            if escolha_serie not in series:
                print("Série inválida.")
                continue

            serie = series[escolha_serie]

            turma_letra = input("Informe a turma (A, B, C): ").strip().upper()

            codigo = (
                f"{serie[0]}{turma_letra}"
                if ciclo == "EM"
                else f"{serie} {turma_letra}"
            )

            sala = input("Informe a sala: ").strip()

            print("\nPeríodos disponíveis:")
            print("1 - MANHÃ")
            print("2 - TARDE")
            print("3 - NOITE")
            print("4 - INTEGRAL (9 HORAS)")
            print("5 - INTEGRAL (7 HORAS)")

            periodos = {
                "1": "MANHÃ",
                "2": "TARDE",
                "3": "NOITE",
                "4": "INTEGRAL (9 HORAS)",
                "5": "INTEGRAL (7 HORAS)"
            }

            escolha_periodo = input("Escolha o período: ").strip()
            if escolha_periodo not in periodos:
                print("Período inválido.")
                continue

            periodo = periodos[escolha_periodo]

            ano = int(input("Informe o ano letivo: ").strip())
            caminho_csv = input("Informe o caminho do CSV: ").strip()

            turma = Turma(
                codigo=codigo,
                ano=ano,
                serie=serie,
                sala=sala,
                periodo=periodo
            )

            alunos = ImportadorCSV.importar_alunos(caminho_csv)
            for aluno in alunos:
                turma.adicionar_aluno(aluno)

            PersistenciaJSON.salvar_turma(turma)
            print("Turma criada com sucesso.")

        # ===================== ABRIR TURMA =====================
        elif opcao == "3":
            turma = escolher_turma()
            if turma:
                print(f"\nTurma {turma.codigo} ({turma.ano}) carregada.")
                print(f"Total de alunos: {len(turma.alunos)}")

        # ===================== ATUALIZAR TURMA =====================
        elif opcao == "4":
            turma = escolher_turma()
            if not turma:
                continue

            caminho_csv = input("Informe o caminho do CSV atualizado: ").strip()
            from services.atualizador_turma import AtualizadorTurma

            AtualizadorTurma.atualizar_turma(turma, caminho_csv)
            PersistenciaJSON.salvar_turma(turma)
            print("Turma atualizada com sucesso.")

        # ===================== IMPORTAR MAPÃO =====================
        elif opcao == "5":
            turma = escolher_turma()
            if not turma:
                continue

            bimestre = input("Informe o bimestre: ").strip()

            from services.importador_mapao import ImportadorMapao

            print("\nImportação de mapões:")
            print("1) Primeiro, importe o mapão de FGB (prioritário).")
            caminho_fgb = input("Caminho do mapão FGB (.xlsx): ").strip()
            if not caminho_fgb:
                print("Caminho do FGB não informado. Importação cancelada.")
                continue

            ImportadorMapao.importar(caminho_fgb, turma, bimestre)

            resp_if = input("Há mapão de IF para importar? (S/N): ").strip().upper()
            if resp_if == "S":
                caminho_if = input("Caminho do mapão IF (.xlsx): ").strip()
                if caminho_if:
                    ImportadorMapao.importar(caminho_if, turma, bimestre)
                else:
                    print("Caminho do IF não informado. Pulando IF.")

            PersistenciaJSON.salvar_turma(turma)
            print("Mapões importados com sucesso.")

        # ===================== GERAR ATA =====================
        elif opcao == "6":
            turma = escolher_turma()
            if not turma:
                continue

            bimestre = input("Informe o bimestre: ").strip()
            from services.gerador_ata import GeradorAta

            caminho = GeradorAta.gerar(turma, bimestre)
            print(f"Ata gerada em: {caminho}")

        # ===================== RELATÓRIO PROFESSORES =====================
        elif opcao == "7":
            turma = escolher_turma()
            if not turma:
                continue

            bimestre = input("Informe o bimestre: ").strip()
            from services.gerador_relatorio_professores import GeradorRelatorioProfessores

            caminho = GeradorRelatorioProfessores.gerar(turma, bimestre)
            print(f"Relatório gerado em: {caminho}")

        else:
            print("Opção inválida.")


if __name__ == "__main__":
    main()
