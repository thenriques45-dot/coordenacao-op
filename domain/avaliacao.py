class Avaliacao:
    NOTA_MINIMA = 4.0

    @staticmethod
    def aprovado(notas, ativo):
        if not ativo:
            return False

        notas_validas = [n for n in notas if n > Avaliacao.NOTA_MINIMA]
        return len(notas_validas) >= 2
