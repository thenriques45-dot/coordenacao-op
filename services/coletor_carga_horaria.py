def coletar_carga_horaria(disciplinas, bimestre):
    print(f"\nInforme o total de aulas por disciplina – {bimestre}º bimestre")
    print("(pressione Enter para pular uma disciplina)\n")

    carga = {}

    for disciplina in sorted(disciplinas):
        while True:
            valor = input(f"{disciplina}: ").strip()
            if valor == "":
                break

            if not valor.isdigit():
                print("Informe um número inteiro.")
                continue

            carga[disciplina] = int(valor)
            break

    return carga
