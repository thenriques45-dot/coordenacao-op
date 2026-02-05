import json
import os
from domain.turma import Turma
from domain.aluno import Aluno


class PersistenciaJSON:

    @staticmethod
    def salvar_turma(turma):
        pasta = os.path.join("dados", "persistidos", str(turma.ano))
        os.makedirs(pasta, exist_ok=True)

        caminho = os.path.join(pasta, f"turma_{turma.codigo}.json")

        dados = {
            "codigo": turma.codigo,
            "ano": turma.ano,
            "carga_horaria": turma.carga_horaria,
            "alunos": {}
        }

        for matricula, aluno in turma.alunos.items():
            dados["alunos"][matricula] = {
                "nome": aluno.nome,
                "ativo": aluno.ativo,
                "numero_chamada": aluno.numero_chamada,
                "notas": aluno.notas,
                "frequencia": aluno.frequencia,
                "defasagens": aluno.defasagens,
                "medias": getattr(aluno, "medias", {}),
                "defasagem_frequencia": getattr(aluno, "defasagem_frequencia", ""),
                # ✅ NOVO CAMPO SALVO
                "frequencia_percentual": getattr(aluno, "frequencia_percentual", "")
            }

        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=4)

        return caminho

    @staticmethod
    def carregar_turma(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            dados = json.load(f)

        turma = Turma(dados["codigo"], dados["ano"])
        turma.carga_horaria = dados.get("carga_horaria", {})

        for matricula, info in dados["alunos"].items():
            aluno = Aluno(
                matricula=matricula,
                nome=info["nome"],
                numero_chamada=info.get("numero_chamada"),
                ativo=info.get("ativo", True)
            )

            aluno.notas = info.get("notas", {})
            aluno.frequencia = info.get("frequencia", {})
            aluno.defasagens = info.get("defasagens", {})
            aluno.medias = info.get("medias", {})
            aluno.defasagem_frequencia = info.get("defasagem_frequencia", {})

            # ✅ NOVO CAMPO RESTAURADO
            aluno.frequencia_percentual = info.get("frequencia_percentual", "")

            turma.alunos[matricula] = aluno

        return turma
