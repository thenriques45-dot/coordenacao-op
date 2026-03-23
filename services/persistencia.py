import json
import os
import re
from domain.turma import Turma
from domain.aluno import Aluno
from services.runtime_paths import data_dir


class PersistenciaJSON:
    @staticmethod
    def _inferir_metadados_legados(dados):
        codigo = str(dados.get("codigo", "")).strip()
        serie = dados.get("serie")
        ciclo = dados.get("ciclo")

        if not serie:
            match_em = re.fullmatch(r"([123])([A-Z])", codigo)
            if match_em:
                serie = f"{match_em.group(1)}a SERIE"
                ciclo = ciclo or "EM"
            else:
                match_ano = re.fullmatch(r"(\d)o ANO [A-Z]", codigo)
                if match_ano:
                    ano = int(match_ano.group(1))
                    serie = codigo[:-2].strip()
                    if not ciclo:
                        ciclo = "EFAI" if ano <= 5 else "EFAF"

        return {
            "serie": serie,
            "ciclo": ciclo,
            "sala": dados.get("sala"),
            "periodo": dados.get("periodo"),
        }

    @staticmethod
    def salvar_turma(turma):
        pasta = data_dir("persistidos", str(turma.ano))
        os.makedirs(pasta, exist_ok=True)

        caminho = os.path.join(pasta, f"turma_{turma.codigo}.json")

        dados = {
            "codigo": turma.codigo,
            "ano": turma.ano,
            "serie": getattr(turma, "serie", None),
            "sala": getattr(turma, "sala", None),
            "periodo": getattr(turma, "periodo", None),
            "ciclo": getattr(turma, "ciclo", None),
            "carga_horaria": turma.carga_horaria,
            "textos_ata": getattr(turma, "textos_ata", {}),
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
                "frequencia_percentual": getattr(aluno, "frequencia_percentual", ""),
                "encaminhamentos_conselho": getattr(aluno, "encaminhamentos_conselho", {}),
            }

        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=4)

        return caminho

    @staticmethod
    def carregar_turma(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            dados = json.load(f)

        metadados = PersistenciaJSON._inferir_metadados_legados(dados)
        turma = Turma(
            dados["codigo"],
            dados["ano"],
            serie=metadados["serie"],
            sala=metadados["sala"],
            periodo=metadados["periodo"],
            ciclo=metadados["ciclo"],
        )
        turma.carga_horaria = dados.get("carga_horaria", {})
        turma.textos_ata = dados.get("textos_ata", {})

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
            aluno.encaminhamentos_conselho = info.get("encaminhamentos_conselho", {})

            turma.alunos[matricula] = aluno

        return turma
