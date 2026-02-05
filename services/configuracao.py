import json
import os


class Configuracao:
    CAMINHO_PADRAO = os.path.join("config", "criterios.json")

    # ===================== LEITURA =====================

    @staticmethod
    def _carregar():
        if not os.path.exists(Configuracao.CAMINHO_PADRAO):
            return {}

        with open(Configuracao.CAMINHO_PADRAO, encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def _salvar(dados):
        os.makedirs(os.path.dirname(Configuracao.CAMINHO_PADRAO), exist_ok=True)
        with open(Configuracao.CAMINHO_PADRAO, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=4)

    # ===================== NOTA MÍNIMA =====================

    @staticmethod
    def obter_nota_minima():
        dados = Configuracao._carregar()
        return float(dados.get("nota_minima", 5.0))

    @staticmethod
    def definir_nota_minima(valor):
        dados = Configuracao._carregar()
        dados["nota_minima"] = float(valor)
        Configuracao._salvar(dados)

    # ===================== DIRETORA =====================

    @staticmethod
    def obter_diretora():
        dados = Configuracao._carregar()
        return dados.get("diretora", "________________________________")

    @staticmethod
    def definir_diretora(nome):
        dados = Configuracao._carregar()
        dados["diretora"] = nome.strip().upper()
        Configuracao._salvar(dados)
