import json
import os
from services.runtime_paths import config_dir


class Configuracao:
    CAMINHO_PADRAO = config_dir("configuracoes.json")
    CAMINHO_LEGADO = config_dir("criterios.json")

    # ===================== LEITURA =====================

    @staticmethod
    def _carregar():
        if os.path.exists(Configuracao.CAMINHO_PADRAO):
            with open(Configuracao.CAMINHO_PADRAO, encoding="utf-8") as f:
                return json.load(f)

        # migração automática do arquivo legado
        if os.path.exists(Configuracao.CAMINHO_LEGADO):
            with open(Configuracao.CAMINHO_LEGADO, encoding="utf-8") as f:
                dados = json.load(f)
            Configuracao._salvar(dados)
            return dados

        return {}

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

    # ===================== DIREÇÃO =====================

    @staticmethod
    def obter_direcao():
        dados = Configuracao._carregar()
        nome = dados.get("direcao_nome", "________________________________")
        pronome = dados.get("direcao_pronome", "F")  # F = ela/dela, M = ele/dele
        return nome, pronome

    @staticmethod
    def definir_direcao(nome, pronome):
        dados = Configuracao._carregar()
        dados["direcao_nome"] = nome.strip().upper()
        dados["direcao_pronome"] = pronome.strip().upper()
        Configuracao._salvar(dados)
