import json
import os


class Configuracao:
    CAMINHO_PADRAO = os.path.join("config", "criterios.json")

    @staticmethod
    def obter_nota_minima():
        if not os.path.exists(Configuracao.CAMINHO_PADRAO):
            return 5.0

        with open(Configuracao.CAMINHO_PADRAO, encoding="utf-8") as arquivo:
            dados = json.load(arquivo)

        return float(dados.get("nota_minima", 5.0))

    @staticmethod
    def definir_nota_minima(valor):
        os.makedirs(os.path.dirname(Configuracao.CAMINHO_PADRAO), exist_ok=True)

        dados = {
            "nota_minima": float(valor)
        }

        with open(Configuracao.CAMINHO_PADRAO, "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, ensure_ascii=False, indent=4)
