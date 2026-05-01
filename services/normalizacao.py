import unicodedata


def normalizar_disciplina(valor):
    if valor is None:
        return ""
    texto = str(valor).strip()
    if not texto:
        return ""

    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(ch for ch in texto if unicodedata.category(ch) != "Mn")
    texto = " ".join(texto.upper().split())
    return texto


def normalizar_lista_texto(valor):
    if valor is None:
        return []

    if isinstance(valor, (list, tuple, set)):
        itens = valor
    else:
        texto = str(valor).replace(";", "\n").replace(",", "\n")
        itens = texto.splitlines()

    normalizados = []
    vistos = set()
    for item in itens:
        texto = " ".join(str(item).strip().split())
        if not texto:
            continue
        chave = normalizar_disciplina(texto)
        if chave in vistos:
            continue
        vistos.add(chave)
        normalizados.append(texto)

    return normalizados


def normalizar_nome(valor):
    return normalizar_disciplina(valor)
