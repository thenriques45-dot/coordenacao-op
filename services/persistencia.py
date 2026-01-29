import os
import json
from domain.turma import Turma
from domain.aluno import Aluno


class PersistenciaJSON:

    @staticmethod
    def salvar_turma(turma: Turma, pasta_base="dados/persistidos"):
        pasta_ano = os.path.join(pasta_base, str(turma.ano))
        os.makedirs(pasta_ano, exist_ok=True)

        caminho_arquivo = os.path.join(
            pasta_ano,
            f"turma_{turma.codigo}.json"
        )

        dados = {
            "codigo": turma.codigo,
            "ano": turma.ano,
            "alunos": {}
        }

        for matricula, aluno in turma.alunos.items():
            dados["alunos"][matricula] = {
                "nome": aluno.nome,
                "ativo": aluno.ativo,
                "numero_chamada": aluno.numero_chamada,
                "notas": aluno.notas,
                "resultados": aluno.resultados
            }

        with open(caminho_arquivo, "w", encoding="utf-8") as arquivo:
            json.dump(dados, arquivo, ensure_ascii=False, indent=4)

        return caminho_arquivo

    @staticmethod
    def carregar_turma(caminho_arquivo: str) -> Turma:
        with open(caminho_arquivo, encoding="utf-8") as arquivo:
            dados = json.load(arquivo)

        turma = Turma(codigo=dados["codigo"], ano=dados["ano"])

        for matricula, info in dados["alunos"].items():
            aluno = Aluno(
                matricula=matricula,
                nome=info["nome"],
                ativo=info["ativo"],
                numero_chamada=info.get("numero_chamada")
            )
            aluno.notas = info.get("notas", {})
            aluno.resultados = info.get("resultados", {})

            turma.adicionar_aluno(aluno)

        return turma
