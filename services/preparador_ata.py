from services.configuracao import Configuracao


STATUS_MAPA = {
    "NCOM": "NCOM",
    "RM": "REMANEJADO",
    "TR": "TRANSFERIDO"
}


class PreparadorAta:
    @staticmethod
    def _media_para_ata(aluno, bimestre, disciplina):
        medias_bim = getattr(aluno, "medias", {}).get(bimestre, {})
        media_mapao = medias_bim.get(disciplina)
        ajustes_bim = getattr(aluno, "ajustes_medias_conselho", {}).get(bimestre, {})
        ajuste = ajustes_bim.get(disciplina, {}) if isinstance(ajustes_bim, dict) else {}

        if isinstance(ajuste, dict) and ajuste.get("media_ajustada") is not None:
            return ajuste.get("media_ajustada")

        return media_mapao

    @staticmethod
    def levantar_disciplinas(turma):
        """
        Retorna lista ordenada de todas as disciplinas
        presentes na turma (mapão + eletivas).
        """
        disciplinas = set()

        for carga_bim in turma.carga_horaria.values():
            disciplinas.update(carga_bim.keys())

        for aluno in turma.alunos.values():
            for def_bim in aluno.defasagens.values():
                disciplinas.update(def_bim.keys())

        return sorted(disciplinas)

    # ======================================================
    # PREPARAÇÃO DOS ALUNOS (SEM CÁLCULO DE FREQUÊNCIA)
    # ======================================================
    @staticmethod
    def preparar_alunos(turma, bimestre):
        """
        Frequência vem DIRETO do mapão:
        aluno.frequencia_percentual
        (inteiro, sem cálculo).
        """
        alunos_tabela = []
        nota_minima = Configuracao.obter_nota_minima()

        for aluno in turma.alunos.values():

            # -------- STATUS --------
            status_raw = getattr(aluno, "status", None)
            status_texto = STATUS_MAPA.get(status_raw, "")
            linha_amarela = status_raw in STATUS_MAPA
            encaminhamento = status_texto if linha_amarela else ""
            encaminhamentos_conselho = getattr(aluno, "encaminhamentos_conselho", {})
            codigos = encaminhamentos_conselho.get(bimestre, [])
            if not isinstance(codigos, list):
                codigos = []
            if codigos:
                codigos_txt = ", ".join(str(c) for c in sorted(set(codigos)))
                encaminhamento = f"{encaminhamento} | {codigos_txt}" if encaminhamento else codigos_txt

            # -------- DEFASAGENS --------
            defasagens = set()
            disciplinas_bimestre = set()
            disciplinas_bimestre.update(getattr(aluno, "defasagens", {}).get(bimestre, {}).keys())
            disciplinas_bimestre.update(getattr(aluno, "medias", {}).get(bimestre, {}).keys())
            disciplinas_bimestre.update(
                getattr(aluno, "ajustes_medias_conselho", {}).get(bimestre, {}).keys()
            )
            for disciplina in disciplinas_bimestre:
                media_vigente = PreparadorAta._media_para_ata(aluno, bimestre, disciplina)
                if media_vigente is not None and media_vigente < nota_minima:
                    defasagens.add(disciplina)

            # -------- FREQUÊNCIA (DIRETO DO MAPÃO) --------
            freq_pct = ""

            if getattr(aluno, "ativo", True):
                valor = getattr(aluno, "frequencia_percentual", "")

                if valor not in ("", None):
                    try:
                        freq_pct = f"{int(valor)}%"
                    except (ValueError, TypeError):
                        freq_pct = ""

            alunos_tabela.append({
                "numero": aluno.numero_chamada,
                "nome": aluno.nome,
                "status": status_texto,
                "status_raw": status_raw,
                "defasagens": defasagens,
                "frequencia_percentual": freq_pct,
                "encaminhamento": encaminhamento,
                "linha_amarela": linha_amarela
            })

        return alunos_tabela
