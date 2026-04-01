from services.periodo_letivo import garantir_bimestre_operacional


class AcompanhamentoAjustes:
    STATUS_PENDENTE = "pendente"
    STATUS_APLICADO = "aplicado"
    STATUS_DIVERGENTE = "divergente"

    @staticmethod
    def _iguais(a, b, tolerancia=0.05):
        if a is None or b is None:
            return False
        return abs(float(a) - float(b)) < tolerancia

    @staticmethod
    def classificar_ajuste(ajuste, media_atual):
        media_ajustada = ajuste.get("media_ajustada")
        media_original = ajuste.get("media_original")

        if media_ajustada is None:
            return None
        if media_atual is None:
            return AcompanhamentoAjustes.STATUS_PENDENTE
        if AcompanhamentoAjustes._iguais(media_atual, media_ajustada):
            return AcompanhamentoAjustes.STATUS_APLICADO
        if media_original is not None and AcompanhamentoAjustes._iguais(media_atual, media_original):
            return AcompanhamentoAjustes.STATUS_PENDENTE
        return AcompanhamentoAjustes.STATUS_DIVERGENTE

    @staticmethod
    def reconciliar_aluno(aluno, bimestre):
        bimestre = garantir_bimestre_operacional(bimestre)
        medias_bim = getattr(aluno, "medias", {}).get(bimestre, {})
        ajustes_bim = getattr(aluno, "ajustes_medias_conselho", {}).get(bimestre, {})

        for disciplina, ajuste in ajustes_bim.items():
            if not isinstance(ajuste, dict):
                continue
            media_atual = medias_bim.get(disciplina)
            ajuste["media_mapao_atual"] = media_atual
            ajuste["status_aplicacao"] = AcompanhamentoAjustes.classificar_ajuste(ajuste, media_atual)

    @staticmethod
    def reconciliar_turma(turma, bimestre):
        bimestre = garantir_bimestre_operacional(bimestre)
        for aluno in turma.alunos.values():
            AcompanhamentoAjustes.reconciliar_aluno(aluno, bimestre)
        return AcompanhamentoAjustes.resumo_turma(turma, bimestre)

    @staticmethod
    def listar_linhas_turma(turma, bimestre):
        bimestre = garantir_bimestre_operacional(bimestre)
        linhas = []

        for aluno in turma.alunos.values():
            if not getattr(aluno, "ativo", True):
                continue
            ajustes_bim = getattr(aluno, "ajustes_medias_conselho", {}).get(bimestre, {})
            for disciplina, ajuste in sorted(ajustes_bim.items()):
                if not isinstance(ajuste, dict) or ajuste.get("media_ajustada") is None:
                    continue
                media_atual = ajuste.get("media_mapao_atual")
                status = ajuste.get("status_aplicacao") or AcompanhamentoAjustes.classificar_ajuste(
                    ajuste,
                    media_atual,
                )
                linhas.append(
                    {
                        "aluno": aluno.nome,
                        "disciplina": disciplina,
                        "media_original": ajuste.get("media_original"),
                        "media_ajustada": ajuste.get("media_ajustada"),
                        "media_mapao_atual": media_atual,
                        "status_aplicacao": status,
                        "observacao": ajuste.get("observacao", "").strip(),
                    }
                )

        linhas.sort(key=lambda item: (item["status_aplicacao"] or "", item["disciplina"], item["aluno"]))
        return linhas

    @staticmethod
    def resumo_turma(turma, bimestre):
        contagem = {
            AcompanhamentoAjustes.STATUS_PENDENTE: 0,
            AcompanhamentoAjustes.STATUS_APLICADO: 0,
            AcompanhamentoAjustes.STATUS_DIVERGENTE: 0,
        }
        for linha in AcompanhamentoAjustes.listar_linhas_turma(turma, bimestre):
            status = linha["status_aplicacao"]
            if status in contagem:
                contagem[status] += 1
        contagem["total"] = sum(contagem.values())
        return contagem

    @staticmethod
    def rotulo_status(status):
        return {
            AcompanhamentoAjustes.STATUS_PENDENTE: "Pendente",
            AcompanhamentoAjustes.STATUS_APLICADO: "Aplicado",
            AcompanhamentoAjustes.STATUS_DIVERGENTE: "Divergente",
        }.get(status, "-")
