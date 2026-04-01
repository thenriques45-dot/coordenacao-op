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
