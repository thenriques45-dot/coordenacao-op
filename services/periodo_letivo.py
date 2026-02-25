VALID_BIMESTRES = ("1", "2", "3", "4")
CONCEITO_FINAL = "5C"
VALID_PERIODOS = VALID_BIMESTRES + (CONCEITO_FINAL,)


def normalizar_periodo(valor):
    if valor is None:
        return ""

    texto = str(valor).strip().upper()
    texto = texto.replace(" ", "")
    texto = texto.replace("º", "")

    if texto in {"5", "5O", "5C", "5CONCEITO", "CONCEITOFINAL"}:
        return CONCEITO_FINAL
    return texto


def garantir_periodo_letivo(periodo, permitir_5c=True):
    p = normalizar_periodo(periodo)
    permitidos = VALID_PERIODOS if permitir_5c else VALID_BIMESTRES
    if p not in permitidos:
        if permitir_5c:
            raise ValueError("Periodo letivo invalido. Use 1, 2, 3, 4 ou 5C.")
        raise ValueError("Bimestre invalido. Use 1, 2, 3 ou 4.")
    return p


def garantir_bimestre_operacional(bimestre):
    return garantir_periodo_letivo(bimestre, permitir_5c=False)
