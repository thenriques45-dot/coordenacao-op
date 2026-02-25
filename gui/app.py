import os
import tkinter as tk
from datetime import date, datetime
from tkinter import filedialog, messagebox, ttk

from domain.turma import Turma
from gui.platform_ui import apply_theme, detect_platform_ui
from gui.session import TurmaSession, TurmaWindowRegistry
from services.encaminhamentos import ENCAMINHAMENTOS
from services.importador_dados import ImportadorCSV
from services.atualizador_turma import AtualizadorTurma
from services.configuracao import Configuracao
from services.gerador_ata import GeradorAta
from services.gerador_relatorio_professores import GeradorRelatorioProfessores
from services.importador_mapao import ImportadorMapao
from services.periodo_letivo import CONCEITO_FINAL, garantir_bimestre_operacional, normalizar_periodo
from services.persistencia import PersistenciaJSON
from services.runtime_paths import data_dir

CICLOS = {
    "EI": "Educacao Infantil",
    "EFAI": "Fundamental Anos Iniciais",
    "EFAF": "Fundamental Anos Finais",
    "EM": "Ensino Medio",
}

PERIODOS = (
    "MANHA",
    "TARDE",
    "NOITE",
    "INTEGRAL (9 HORAS)",
    "INTEGRAL (7 HORAS)",
)


def series_por_ciclo(ciclo):
    if ciclo == "EI":
        return (
            "BERCARIO I",
            "BERCARIO II",
            "MATERNAL I",
            "MATERNAL II",
            "PRE-ESCOLA I",
            "PRE-ESCOLA II",
        )
    if ciclo == "EFAI":
        return tuple(f"{i}o ANO" for i in range(1, 6))
    if ciclo == "EFAF":
        return tuple(f"{i}o ANO" for i in range(6, 10))
    return ("1a SERIE", "2a SERIE", "3a SERIE")


class CoordenacaoApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.platform_ui = detect_platform_ui()
        apply_theme(self.platform_ui)

        self.title("CoordenacaoOP")
        self.geometry("980x560")
        self.minsize(900, 520)

        self.turma = None
        self.turma_caminho = None
        self.turma_session = None
        self.turma_window_registry = TurmaWindowRegistry()

        self.turma_status = tk.StringVar(value="Turma atual: nenhuma")
        self.bimestre_var = tk.StringVar()
        self.data_conselho_var = tk.StringVar()
        self.csv_update_var = tk.StringVar()
        self.mapao_fgb_var = tk.StringVar()
        self.mapao_if_var = tk.StringVar()
        self.status_mapao_var = tk.StringVar(value="Mapao: -")
        self.status_ata_var = tk.StringVar(value="Ata: -")
        self.status_relatorio_var = tk.StringVar(value="Relatorio: -")
        self.status_pendencias_var = tk.StringVar(value="Pendencias frequencia: -")

        self.nota_minima_var = tk.StringVar()
        self.direcao_nome_var = tk.StringVar()
        self.direcao_pronome_var = tk.StringVar(value="F")
        self.filtro_ano_var = tk.StringVar(value="Todos")
        self.busca_turma_var = tk.StringVar()
        self.gestao_nova_janela_var = tk.BooleanVar(value=False)

        self._build_menu()
        self._build_layout()
        self._bind_shortcuts()
        self._carregar_configuracoes()
        self._carregar_catalogo_turmas()
        self.bimestre_var.trace_add("write", lambda *_: self._atualizar_status_bimestre())

    def _build_menu(self):
        menu = tk.Menu(self)

        menu_arquivo = tk.Menu(menu, tearoff=0)
        menu_arquivo.add_command(
            label=f"Abrir turma... ({self.platform_ui.open_shortcut_label})",
            command=self._abrir_turma,
        )
        menu_arquivo.add_command(label="Criar nova turma...", command=self._abrir_dialogo_criar_turma)
        menu_arquivo.add_command(label="Gerir turma...", command=self._abrir_dialogo_gerir_turma)
        menu_arquivo.add_checkbutton(
            label="Gestao em nova janela (experimental)",
            variable=self.gestao_nova_janela_var,
        )
        menu_arquivo.add_command(label="Excluir turma selecionada...", command=self._excluir_turma_selecionada)
        menu_arquivo.add_command(label="Gerenciar alunos...", command=self._abrir_dialogo_gerenciar_alunos)
        menu_arquivo.add_separator()
        menu_arquivo.add_command(
            label=f"Sair ({self.platform_ui.quit_shortcut_label})",
            command=self.destroy,
        )
        menu.add_cascade(label="Arquivo", menu=menu_arquivo)

        self.config(menu=menu)

    def _bind_shortcuts(self):
        self.bind_all(self.platform_ui.open_shortcut_event, self._on_open_shortcut)
        self.bind_all(self.platform_ui.quit_shortcut_event, self._on_quit_shortcut)

    def _on_open_shortcut(self, _event):
        self._abrir_turma()

    def _on_quit_shortcut(self, _event):
        self.destroy()

    def _build_layout(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        root = ttk.Frame(self, padding=16)
        root.grid(row=0, column=0, sticky="nsew")
        root.columnconfigure(0, weight=3)
        root.columnconfigure(1, weight=2)
        root.rowconfigure(1, weight=1)

        topo = ttk.LabelFrame(root, text="Turma", padding=12)
        topo.grid(row=0, column=0, columnspan=2, sticky="ew")
        topo.columnconfigure(2, weight=1)
        topo.rowconfigure(2, weight=1)

        ttk.Button(topo, text="Abrir turma por arquivo...", command=self._abrir_turma).grid(
            row=0, column=0, sticky="w"
        )
        ttk.Button(topo, text="Atualizar lista", command=self._carregar_catalogo_turmas).grid(
            row=0, column=1, padx=(8, 0), sticky="w"
        )
        ttk.Button(topo, text="Excluir selecionada", command=self._excluir_turma_selecionada).grid(
            row=0, column=2, padx=(8, 0), sticky="w"
        )
        ttk.Label(topo, textvariable=self.turma_status).grid(
            row=0, column=3, padx=(12, 0), sticky="w"
        )

        ttk.Label(topo, text="Ano").grid(row=1, column=0, pady=(10, 0), sticky="w")
        self.combo_ano = ttk.Combobox(
            topo,
            textvariable=self.filtro_ano_var,
            state="readonly",
            values=("Todos",),
            width=12,
        )
        self.combo_ano.grid(row=1, column=1, pady=(10, 0), sticky="w")
        self.combo_ano.bind("<<ComboboxSelected>>", self._on_filtro_alterado)

        ttk.Label(topo, text="Buscar turma").grid(row=1, column=3, pady=(10, 0), padx=(12, 0), sticky="w")
        busca_entry = ttk.Entry(topo, textvariable=self.busca_turma_var)
        busca_entry.grid(row=1, column=3, pady=(10, 0), padx=(110, 0), sticky="ew")
        busca_entry.bind("<KeyRelease>", self._on_filtro_alterado)

        self.tree_turmas = ttk.Treeview(
            topo,
            columns=("ano", "codigo", "arquivo"),
            show="headings",
            height=6,
        )
        self.tree_turmas.heading("ano", text="Ano")
        self.tree_turmas.heading("codigo", text="Turma")
        self.tree_turmas.heading("arquivo", text="Arquivo")
        self.tree_turmas.column("ano", width=80, anchor="center")
        self.tree_turmas.column("codigo", width=130, anchor="center")
        self.tree_turmas.column("arquivo", width=540, anchor="w")
        self.tree_turmas.grid(row=2, column=0, columnspan=4, pady=(8, 0), sticky="nsew")
        self.tree_turmas.bind("<Double-1>", self._abrir_turma_da_lista)

        scroll = ttk.Scrollbar(topo, orient="vertical", command=self.tree_turmas.yview)
        scroll.grid(row=2, column=4, pady=(8, 0), sticky="ns")
        self.tree_turmas.configure(yscrollcommand=scroll.set)

        acoes = ttk.LabelFrame(root, text="Acoes", padding=12)
        acoes.grid(row=1, column=0, sticky="ew", pady=(12, 0), padx=(0, 8))
        acoes.columnconfigure((0, 1), weight=1)
        ttk.Button(acoes, text="Criar nova turma", command=self._abrir_dialogo_criar_turma).grid(
            row=0, column=0, sticky="ew", padx=(0, 6)
        )
        ttk.Button(acoes, text="Gerir turma selecionada", command=self._abrir_dialogo_gerir_turma).grid(
            row=0, column=1, sticky="ew", padx=(6, 0)
        )

        config = ttk.LabelFrame(root, text="Configuracoes", padding=12)
        config.grid(row=0, column=1, rowspan=2, sticky="nsew", pady=(0, 0), padx=(8, 0))
        config.columnconfigure(1, weight=1)

        ttk.Label(config, text="Nota minima").grid(row=0, column=0, sticky="w")
        ttk.Entry(config, textvariable=self.nota_minima_var).grid(row=0, column=1, sticky="ew")
        ttk.Button(config, text="Salvar nota minima", command=self._salvar_nota_minima).grid(
            row=1, column=0, columnspan=2, sticky="ew", pady=(8, 0)
        )

        ttk.Separator(config).grid(row=2, column=0, columnspan=2, sticky="ew", pady=12)

        ttk.Label(config, text="Nome direcao").grid(row=3, column=0, sticky="w")
        ttk.Entry(config, textvariable=self.direcao_nome_var).grid(row=3, column=1, sticky="ew")

        ttk.Label(config, text="Pronome").grid(row=4, column=0, sticky="w", pady=(8, 0))
        ttk.Combobox(
            config,
            textvariable=self.direcao_pronome_var,
            values=("F", "M"),
            state="readonly",
            width=5,
        ).grid(row=4, column=1, sticky="w", pady=(8, 0))

        ttk.Button(config, text="Salvar direcao", command=self._salvar_direcao).grid(
            row=5, column=0, columnspan=2, sticky="ew", pady=(8, 0)
        )

    def _carregar_configuracoes(self):
        self.nota_minima_var.set(str(Configuracao.obter_nota_minima()))
        nome, pronome = Configuracao.obter_direcao()
        self.direcao_nome_var.set(nome)
        self.direcao_pronome_var.set(pronome)

    def _listar_turmas(self):
        pasta_base = data_dir("persistidos")
        resultados = []
        if not os.path.isdir(pasta_base):
            return resultados

        for ano in sorted(os.listdir(pasta_base)):
            pasta_ano = os.path.join(pasta_base, ano)
            if not os.path.isdir(pasta_ano):
                continue
            for arquivo in sorted(os.listdir(pasta_ano)):
                if not arquivo.endswith(".json"):
                    continue
                codigo = arquivo.replace("turma_", "").replace(".json", "")
                caminho = os.path.join(pasta_ano, arquivo)
                resultados.append((ano, codigo, caminho))
        return resultados

    def _carregar_catalogo_turmas(self):
        self.catalogo_turmas = self._listar_turmas()
        anos = sorted({ano for ano, _, _ in self.catalogo_turmas})
        self.combo_ano["values"] = ("Todos", *anos) if anos else ("Todos",)
        if self.filtro_ano_var.get() not in self.combo_ano["values"]:
            self.filtro_ano_var.set("Todos")
        self._aplicar_filtros_catalogo()

    def _aplicar_filtros_catalogo(self):
        filtro_ano = self.filtro_ano_var.get()
        busca = self.busca_turma_var.get().strip().lower()

        for item in self.tree_turmas.get_children():
            self.tree_turmas.delete(item)

        for ano, codigo, caminho in self.catalogo_turmas:
            if filtro_ano != "Todos" and ano != filtro_ano:
                continue
            if busca and busca not in codigo.lower() and busca not in os.path.basename(caminho).lower():
                continue
            self.tree_turmas.insert("", "end", values=(ano, codigo, caminho))

    def _on_filtro_alterado(self, _event=None):
        self._aplicar_filtros_catalogo()

    def _selecionar_arquivo(self, destino_var, tipos):
        caminho = filedialog.askopenfilename(filetypes=tipos)
        if caminho:
            destino_var.set(caminho)

    def _abrir_turma(self):
        caminho = filedialog.askopenfilename(
            title="Selecionar turma",
            initialdir=data_dir("persistidos"),
            filetypes=[("JSON", "*.json"), ("Todos", "*.*")],
        )
        if not caminho:
            return

        self._abrir_turma_por_caminho(caminho)

    def _abrir_turma_da_lista(self, _event=None):
        selecionado = self.tree_turmas.focus()
        if not selecionado:
            return
        valores = self.tree_turmas.item(selecionado, "values")
        if not valores:
            return
        self._abrir_turma_por_caminho(valores[2])

    def _abrir_turma_por_caminho(self, caminho):
        try:
            self.turma = PersistenciaJSON.carregar_turma(caminho)
            self.turma_caminho = caminho
            self.turma_session = TurmaSession(self.turma, caminho)
            self._atualizar_status_turma()
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao abrir turma:\n{exc}")

    def _atualizar_status_turma(self):
        if self.turma is None:
            self.turma_caminho = None
            self.turma_session = None
            self.turma_status.set("Turma atual: nenhuma")
            self._atualizar_status_bimestre()
            return
        self.turma_status.set(
            f"Turma atual: {self.turma.codigo} ({self.turma.ano}) - {len(self.turma.alunos)} alunos"
        )
        self._atualizar_status_bimestre()

    def _atualizar_status_bimestre(self):
        bimestre = normalizar_periodo(self.bimestre_var.get())
        if self.turma is None or not bimestre:
            self.status_mapao_var.set("Mapao: -")
            self.status_ata_var.set("Ata: -")
            self.status_relatorio_var.set("Relatorio: -")
            self.status_pendencias_var.set("Pendencias frequencia: -")
            return

        if bimestre not in {"1", "2", "3", "4"}:
            self.status_mapao_var.set("Mapao: n/a (use 1..4)")
            self.status_ata_var.set("Ata: n/a (use 1..4)")
            self.status_relatorio_var.set("Relatorio: n/a (use 1..4)")
            self.status_pendencias_var.set("Pendencias frequencia: n/a")
            return

        codigo = self.turma.codigo
        carga_bimestre = self.turma.carga_horaria.get(bimestre, {})
        mapao_ok = bool(carga_bimestre)
        caminho_ata = os.path.join(data_dir("atas"), f"ata_{codigo}_bimestre_{bimestre}.docx")
        caminho_relatorio = os.path.join(
            data_dir("relatorios"), f"relatorio_professores_{codigo}_bim_{bimestre}.docx"
        )
        caminho_pendencias = os.path.join(
            data_dir("relatorios"), f"faltando_frequencia_{codigo}_bim_{bimestre}.txt"
        )

        self.status_mapao_var.set(f"Mapao: {'OK' if mapao_ok else 'PENDENTE'}")
        self.status_ata_var.set(f"Ata: {'GERADA' if os.path.exists(caminho_ata) else 'NAO GERADA'}")
        self.status_relatorio_var.set(
            f"Relatorio: {'GERADO' if os.path.exists(caminho_relatorio) else 'NAO GERADO'}"
        )
        self.status_pendencias_var.set(
            f"Pendencias frequencia: {'EXISTE RELATORIO' if os.path.exists(caminho_pendencias) else 'SEM RELATORIO'}"
        )

    def _codigo_turma(self, serie, turma_letra, ciclo):
        letra = turma_letra.strip().upper()
        if ciclo == "EM":
            return f"{serie[0]}{letra}"
        return f"{serie} {letra}"

    def _garantir_turma_selecionada(self):
        if self.turma is not None:
            return True

        selecionado = self.tree_turmas.focus()
        if selecionado:
            valores = self.tree_turmas.item(selecionado, "values")
            if valores and len(valores) >= 3:
                self._abrir_turma_por_caminho(valores[2])
                return self.turma is not None

        messagebox.showwarning("Turma", "Selecione ou abra uma turma para continuar.")
        return False

    def _abrir_dialogo_gerir_turma(self):
        if not self._garantir_turma_selecionada():
            return

        session_key = self.turma_session.key if self.turma_session else None
        if session_key:
            existente = self.turma_window_registry.get_window(session_key)
            if existente is not None:
                existente.lift()
                existente.focus_force()
                return

        dialog = tk.Toplevel(self)
        dialog.title(f"Gerir turma - {self.turma.codigo}")
        if not self.gestao_nova_janela_var.get():
            dialog.transient(self)
            dialog.grab_set()
        dialog.geometry("860x540")

        if session_key:
            self.turma_window_registry.register(session_key, dialog)

            def _on_close():
                self.turma_window_registry.unregister(session_key)
                dialog.destroy()

            dialog.protocol("WM_DELETE_WINDOW", _on_close)

        frame = ttk.Frame(dialog, padding=12)
        frame.grid(sticky="nsew")
        frame.columnconfigure(1, weight=1)
        frame.columnconfigure(3, weight=1)

        ttk.Label(
            frame,
            text=f"Turma atual: {self.turma.codigo} ({self.turma.ano}) - {len(self.turma.alunos)} alunos",
        ).grid(row=0, column=0, columnspan=3, sticky="w")

        conselho = ttk.LabelFrame(frame, text="Conselho por bimestre", padding=8)
        conselho.grid(row=0, column=3, rowspan=8, sticky="nsew", padx=(12, 0))
        conselho.columnconfigure(0, weight=1)

        bimestres = self._bimestres_com_dados()
        botoes_conselho = {}

        def atualizar_botoes_conselho():
            for b, botao in botoes_conselho.items():
                acao = "Gerir" if self._tem_conselho_registrado(b) else "Realizar"
                botao.configure(text=f"{acao} conselho do {b}º bimestre")

        def abrir_conselho_com_refresh(b):
            janela = self._abrir_tela_conselho(b)
            if janela is not None:
                janela.bind("<Destroy>", lambda _e: atualizar_botoes_conselho(), add="+")

        if not bimestres:
            ttk.Label(
                conselho,
                text="Sem dados para conselho.\nImporte mapao/medias primeiro.",
            ).grid(row=0, column=0, sticky="w")
        else:
            for i, b in enumerate(bimestres):
                acao = "Gerir" if self._tem_conselho_registrado(b) else "Realizar"
                botao = ttk.Button(
                    conselho,
                    text=f"{acao} conselho do {b}º bimestre",
                    command=lambda bb=b: abrir_conselho_com_refresh(bb),
                )
                botao.grid(row=i, column=0, sticky="ew", pady=(0, 6))
                botoes_conselho[b] = botao

        ttk.Label(frame, text="Bimestre").grid(row=1, column=0, sticky="w", pady=(10, 0))
        ttk.Entry(frame, textvariable=self.bimestre_var, width=12).grid(
            row=1, column=1, sticky="w", pady=(10, 0)
        )

        ttk.Label(frame, text="Data conselho (DD/MM/AAAA)").grid(
            row=2, column=0, sticky="w", pady=(8, 0)
        )
        ttk.Entry(frame, textvariable=self.data_conselho_var).grid(
            row=2, column=1, sticky="ew", pady=(8, 0)
        )

        ttk.Label(frame, text="CSV atualizado").grid(row=3, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(frame, textvariable=self.csv_update_var).grid(
            row=3, column=1, sticky="ew", pady=(8, 0)
        )
        ttk.Button(
            frame,
            text="Selecionar",
            command=lambda: self._selecionar_arquivo(
                self.csv_update_var,
                [("CSV", "*.csv"), ("Todos", "*.*")],
            ),
        ).grid(row=3, column=2, padx=(8, 0), pady=(8, 0))

        ttk.Label(frame, text="Mapao FGB (.xlsx)").grid(row=4, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(frame, textvariable=self.mapao_fgb_var).grid(
            row=4, column=1, sticky="ew", pady=(8, 0)
        )
        ttk.Button(
            frame,
            text="Selecionar",
            command=lambda: self._selecionar_arquivo(
                self.mapao_fgb_var,
                [("Excel", "*.xlsx"), ("Todos", "*.*")],
            ),
        ).grid(row=4, column=2, padx=(8, 0), pady=(8, 0))

        ttk.Label(frame, text="Mapao IF (.xlsx) opcional").grid(
            row=5, column=0, sticky="w", pady=(8, 0)
        )
        ttk.Entry(frame, textvariable=self.mapao_if_var).grid(
            row=5, column=1, sticky="ew", pady=(8, 0)
        )
        ttk.Button(
            frame,
            text="Selecionar",
            command=lambda: self._selecionar_arquivo(
                self.mapao_if_var,
                [("Excel", "*.xlsx"), ("Todos", "*.*")],
            ),
        ).grid(row=5, column=2, padx=(8, 0), pady=(8, 0))

        botoes = ttk.Frame(frame)
        botoes.grid(row=6, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        botoes.columnconfigure((0, 1), weight=1)
        ttk.Button(botoes, text="Atualizar turma por CSV", command=self._atualizar_turma).grid(
            row=0, column=0, sticky="ew", padx=(0, 6)
        )
        ttk.Button(botoes, text="Importar mapoes", command=self._importar_mapoes).grid(
            row=0, column=1, sticky="ew", padx=(6, 0)
        )
        ttk.Button(botoes, text="Gerar relatorio professores", command=self._gerar_relatorio).grid(
            row=1, column=0, sticky="ew", padx=(0, 6), pady=(8, 0)
        )
        ttk.Label(botoes, text="Ata gerada a partir da tela de conselho.").grid(
            row=1, column=1, sticky="w", padx=(6, 0), pady=(10, 0)
        )
        ttk.Button(botoes, text="Gerenciar alunos", command=self._abrir_dialogo_gerenciar_alunos).grid(
            row=2, column=0, sticky="ew", padx=(0, 6), pady=(8, 0)
        )
        ttk.Button(
            botoes,
            text="Excluir turma",
            command=lambda: self._excluir_turma_selecionada(fechar_dialogo=dialog),
        ).grid(
            row=2, column=1, sticky="ew", padx=(6, 0), pady=(8, 0)
        )
        ttk.Button(botoes, text="Fechar", command=dialog.destroy).grid(
            row=3, column=0, columnspan=2, sticky="ew", pady=(8, 0)
        )

        status = ttk.LabelFrame(frame, text="Status do bimestre", padding=10)
        status.grid(row=7, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        status.columnconfigure(0, weight=1)
        ttk.Label(status, textvariable=self.status_mapao_var).grid(row=0, column=0, sticky="w")
        ttk.Label(status, textvariable=self.status_ata_var).grid(row=1, column=0, sticky="w", pady=(4, 0))
        ttk.Label(status, textvariable=self.status_relatorio_var).grid(row=2, column=0, sticky="w", pady=(4, 0))
        ttk.Label(status, textvariable=self.status_pendencias_var).grid(row=3, column=0, sticky="w", pady=(4, 0))

        self._atualizar_status_bimestre()

    def _excluir_turma_selecionada(self, fechar_dialogo=None):
        caminho = None
        codigo = ""
        ano = ""

        if fechar_dialogo is not None and self.turma is not None and self.turma_caminho:
            caminho = self.turma_caminho
            codigo = self.turma.codigo
            ano = str(self.turma.ano)
        else:
            selecionado = self.tree_turmas.focus()
            if not selecionado:
                messagebox.showwarning("Excluir turma", "Selecione uma turma na lista.")
                return
            valores = self.tree_turmas.item(selecionado, "values")
            if not valores or len(valores) < 3:
                messagebox.showwarning("Excluir turma", "Nao foi possivel identificar o arquivo da turma.")
                return
            ano, codigo, caminho = valores[0], valores[1], valores[2]

        confirma = messagebox.askyesno(
            "Confirmar exclusao",
            (
                f"Excluir a turma {codigo} ({ano})?\n\n"
                f"Arquivo:\n{caminho}\n\n"
                "Esta acao remove apenas o JSON da turma e nao pode ser desfeita."
            ),
        )
        if not confirma:
            return

        try:
            if not os.path.exists(caminho):
                messagebox.showwarning("Excluir turma", "Arquivo da turma nao existe mais.")
                self._carregar_catalogo_turmas()
                return

            os.remove(caminho)

            pasta_ano = os.path.dirname(caminho)
            try:
                if os.path.isdir(pasta_ano) and not os.listdir(pasta_ano):
                    os.rmdir(pasta_ano)
            except OSError:
                pass

            if self.turma_caminho and os.path.normcase(self.turma_caminho) == os.path.normcase(caminho):
                self.turma = None
                self.turma_caminho = None
                self.turma_session = None
                self._atualizar_status_turma()

            self._carregar_catalogo_turmas()
            if fechar_dialogo is not None and fechar_dialogo.winfo_exists():
                fechar_dialogo.destroy()
            messagebox.showinfo("Excluir turma", "Turma excluida com sucesso.")
        except Exception as exc:
            messagebox.showerror("Erro", f"Nao foi possivel excluir a turma:\n{exc}")

    def _disciplinas_da_turma(self):
        if self.turma is None:
            return []

        disciplinas = set()
        for carga in self.turma.carga_horaria.values():
            if isinstance(carga, dict):
                disciplinas.update(carga.keys())

        for aluno in self.turma.alunos.values():
            for medias in getattr(aluno, "medias", {}).values():
                if isinstance(medias, dict):
                    disciplinas.update(medias.keys())

        return sorted(d for d in disciplinas if d)

    def _bimestres_com_dados(self):
        if self.turma is None:
            return []

        encontrados = set()

        for b in self.turma.carga_horaria.keys():
            if str(b) in {"1", "2", "3", "4"}:
                encontrados.add(str(b))

        for aluno in self.turma.alunos.values():
            for origem in (
                getattr(aluno, "medias", {}),
                getattr(aluno, "frequencia", {}),
                getattr(aluno, "defasagens", {}),
            ):
                for b in origem.keys():
                    if str(b) in {"1", "2", "3", "4"}:
                        encontrados.add(str(b))

        return sorted(encontrados, key=int)

    def _tem_conselho_registrado(self, bimestre):
        if self.turma is None:
            return False
        for aluno in self.turma.alunos.values():
            codigos = getattr(aluno, "encaminhamentos_conselho", {}).get(bimestre, [])
            if isinstance(codigos, list) and codigos:
                return True
        return False

    def _abrir_tela_conselho(self, bimestre):
        if not self._exigir_turma():
            return

        alunos = [
            a for a in self.turma.alunos.values()
            if getattr(a, "ativo", True)
        ]
        alunos.sort(key=lambda a: (a.numero_chamada is None, a.numero_chamada or 9999, a.nome))

        if not alunos:
            messagebox.showwarning("Conselho", "Nao ha alunos ativos para realizar o conselho.")
            return

        dialog = tk.Toplevel(self)
        dialog.title(f"Conselho - {bimestre}º bimestre - {self.turma.codigo}")
        dialog.transient(self)
        dialog.grab_set()
        dialog.geometry("1020x640")

        if not self.data_conselho_var.get().strip():
            self.data_conselho_var.set(date.today().strftime("%d/%m/%Y"))

        root = ttk.Frame(dialog, padding=12)
        root.grid(sticky="nsew")
        root.columnconfigure(1, weight=1)
        root.rowconfigure(2, weight=1)
        root.rowconfigure(3, weight=0)

        aluno_pos_var = tk.StringVar()
        aluno_nome_var = tk.StringVar()
        aluno_numero_var = tk.StringVar()
        aluno_foto_var = tk.StringVar(value="Foto do aluno: (pendente implementacao)")

        ttk.Label(root, textvariable=aluno_pos_var).grid(row=0, column=0, columnspan=2, sticky="w")
        ttk.Label(root, textvariable=aluno_nome_var).grid(row=1, column=0, columnspan=2, sticky="w", pady=(6, 0))
        ttk.Label(root, textvariable=aluno_numero_var).grid(row=1, column=1, sticky="e", pady=(6, 0))
        ttk.Label(root, text="Data do conselho (DD/MM/AAAA)").grid(row=0, column=1, sticky="e")
        ttk.Entry(root, textvariable=self.data_conselho_var, width=14).grid(row=0, column=1, sticky="e", padx=(0, 180))
        ttk.Label(root, textvariable=aluno_foto_var).grid(row=2, column=0, sticky="nw", pady=(8, 0))

        notas_box = ttk.LabelFrame(root, text="Disciplinas e notas", padding=8)
        notas_box.grid(row=2, column=1, rowspan=2, sticky="nsew", pady=(8, 0), padx=(10, 0))
        notas_box.columnconfigure(0, weight=1)
        notas_box.rowconfigure(0, weight=1)
        tree_notas = ttk.Treeview(
            notas_box,
            columns=("disciplina", "media", "situacao"),
            show="headings",
            height=8,
        )
        tree_notas.heading("disciplina", text="Disciplina")
        tree_notas.heading("media", text="Media")
        tree_notas.heading("situacao", text="Situacao")
        tree_notas.column("disciplina", width=280, anchor="w")
        tree_notas.column("media", width=80, anchor="center")
        tree_notas.column("situacao", width=120, anchor="center")
        tree_notas.tag_configure("abaixo", foreground="#b00020")
        tree_notas.tag_configure("limite", foreground="#b36b00")
        tree_notas.tag_configure("adequada", foreground="#127a2a")
        tree_notas.grid(row=0, column=0, sticky="nsew")

        freq_box = ttk.LabelFrame(root, text="Frequencia por disciplina", padding=8)
        freq_box.grid(row=3, column=0, columnspan=1, sticky="new", pady=(10, 0))
        freq_box.columnconfigure(0, weight=1)
        freq_box.rowconfigure(0, weight=0)
        tree_freq = ttk.Treeview(
            freq_box,
            columns=("disciplina", "faltas", "aulas", "percentual"),
            show="headings",
            height=8,
        )
        tree_freq.heading("disciplina", text="Disciplina")
        tree_freq.heading("faltas", text="Faltas")
        tree_freq.heading("aulas", text="Aulas")
        tree_freq.heading("percentual", text="% Faltas")
        tree_freq.column("disciplina", width=280, anchor="w")
        tree_freq.column("faltas", width=80, anchor="center")
        tree_freq.column("aulas", width=80, anchor="center")
        tree_freq.column("percentual", width=100, anchor="center")
        tree_freq.grid(row=0, column=0, sticky="nsew")

        enc_box = ttk.LabelFrame(root, text="Encaminhamentos (ENC 1..10)", padding=8)
        enc_box.grid(row=2, column=0, sticky="nsew", pady=(8, 0))
        enc_vars = {}
        estado = {"idx": 0, "carregando_enc": False}

        def on_toggle_encaminhamento():
            if estado["carregando_enc"]:
                return
            salvar_encaminhamentos_atual()

        for i in range(1, 11):
            var = tk.BooleanVar(value=False)
            enc_vars[i] = var
            col = 0 if i <= 5 else 1
            row = i - 1 if i <= 5 else i - 6
            tk.Checkbutton(
                enc_box,
                text=f"{i}. {ENCAMINHAMENTOS[i]}",
                variable=var,
                command=on_toggle_encaminhamento,
                wraplength=300,
                justify="left",
                anchor="w",
            ).grid(row=row, column=col, sticky="w", padx=(0, 12), pady=(2, 0))
        ttk.Label(enc_box, text="Salvamento automatico: marcar/desmarcar ja atualiza.").grid(
            row=5, column=0, columnspan=2, sticky="w", pady=(8, 0)
        )

        controle = ttk.Frame(root)
        controle.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        controle.columnconfigure((0, 1, 2, 3), weight=1)
        nota_minima = Configuracao.obter_nota_minima()

        def salvar_encaminhamentos_atual():
            aluno = alunos[estado["idx"]]
            codigos = [k for k, v in enc_vars.items() if v.get()]
            if codigos:
                aluno.encaminhamentos_conselho.setdefault(bimestre, [])
                aluno.encaminhamentos_conselho[bimestre] = sorted(codigos)
            else:
                aluno.encaminhamentos_conselho.get(bimestre, [])
                if bimestre in aluno.encaminhamentos_conselho:
                    aluno.encaminhamentos_conselho.pop(bimestre, None)
            self._salvar_turma()

        def carregar_aluno():
            aluno = alunos[estado["idx"]]
            aluno_pos_var.set(f"Aluno {estado['idx'] + 1} de {len(alunos)}")
            aluno_nome_var.set(f"Nome: {aluno.nome}")
            numero_txt = "" if aluno.numero_chamada is None else str(aluno.numero_chamada)
            aluno_numero_var.set(f"Nº chamada: {numero_txt}")

            for item in tree_notas.get_children():
                tree_notas.delete(item)
            for item in tree_freq.get_children():
                tree_freq.delete(item)

            medias = getattr(aluno, "medias", {}).get(bimestre, {})
            linhas_notas = []
            for disciplina, media in sorted(medias.items()):
                if media is None:
                    continue
                if media < nota_minima:
                    linhas_notas.append((0, disciplina, media, "ABAIXO MINIMA", "abaixo"))
                elif media == nota_minima:
                    linhas_notas.append((1, disciplina, media, "NO LIMITE", "limite"))
                else:
                    linhas_notas.append((2, disciplina, media, "ADEQUADA", "adequada"))

            linhas_notas.sort(key=lambda x: (x[0], x[1]))
            for _, disciplina, media, situacao, tag in linhas_notas:
                tree_notas.insert(
                    "", "end",
                    values=(disciplina, f"{media:.1f}", situacao),
                    tags=(tag,),
                )

            faltas_bim = getattr(aluno, "frequencia", {}).get(bimestre, {})
            carga_bim = self.turma.carga_horaria.get(bimestre, {})
            disciplinas_freq = sorted(set(faltas_bim.keys()) | set(carga_bim.keys()))
            for disciplina in disciplinas_freq:
                faltas = faltas_bim.get(disciplina, 0) or 0
                total = carga_bim.get(disciplina, 0) or 0
                percentual = (faltas / total * 100) if total else 0
                tree_freq.insert(
                    "", "end",
                    values=(disciplina, str(faltas), str(total), f"{percentual:.1f}%"),
                )

            selecionados = set(getattr(aluno, "encaminhamentos_conselho", {}).get(bimestre, []))
            estado["carregando_enc"] = True
            for codigo, var in enc_vars.items():
                var.set(codigo in selecionados)
            estado["carregando_enc"] = False

        def proximo(delta):
            salvar_encaminhamentos_atual()
            novo = estado["idx"] + delta
            if novo < 0 or novo >= len(alunos):
                return
            estado["idx"] = novo
            carregar_aluno()

        def concluir():
            salvar_encaminhamentos_atual()
            messagebox.showinfo("Conselho", "Encaminhamentos salvos para este bimestre.")
            dialog.destroy()

        ttk.Button(controle, text="Aluno anterior", command=lambda: proximo(-1)).grid(
            row=0, column=0, sticky="ew", padx=(0, 6)
        )
        ttk.Button(controle, text="Proximo aluno", command=lambda: proximo(1)).grid(
            row=0, column=1, sticky="ew", padx=(6, 6)
        )
        ttk.Button(controle, text="Concluir conselho", command=concluir).grid(
            row=0, column=2, sticky="ew", padx=(6, 0)
        )
        ttk.Button(
            controle,
            text="Gerar ata deste conselho",
            command=lambda: self._gerar_ata_bimestre(bimestre),
        ).grid(row=0, column=3, sticky="ew", padx=(6, 0))

        carregar_aluno()
        return dialog

    def _abrir_dialogo_criar_turma(self):
        dialog = tk.Toplevel(self)
        dialog.title("Criar nova turma")
        dialog.transient(self)
        dialog.grab_set()
        dialog.resizable(False, False)
        frame = ttk.Frame(dialog, padding=12)
        frame.grid(sticky="nsew")

        ciclo_var = tk.StringVar(value="EM")
        serie_var = tk.StringVar(value=series_por_ciclo("EM")[0])
        letra_var = tk.StringVar(value="A")
        sala_var = tk.StringVar()
        periodo_var = tk.StringVar(value=PERIODOS[0])
        ano_var = tk.StringVar(value=str(datetime.now().year))
        csv_var = tk.StringVar()

        def atualizar_series(_event=None):
            valores = series_por_ciclo(ciclo_var.get())
            combo_serie["values"] = valores
            if serie_var.get() not in valores:
                serie_var.set(valores[0])
            codigo_preview_var.set(
                self._codigo_turma(serie_var.get(), letra_var.get() or "A", ciclo_var.get())
            )

        def atualizar_codigo(_event=None):
            codigo_preview_var.set(
                self._codigo_turma(serie_var.get(), letra_var.get() or "A", ciclo_var.get())
            )

        def selecionar_csv():
            caminho = filedialog.askopenfilename(
                title="Selecionar CSV da turma",
                filetypes=[("CSV", "*.csv"), ("Todos", "*.*")],
            )
            if caminho:
                csv_var.set(caminho)

        def salvar_turma():
            ciclo = ciclo_var.get().strip()
            serie = serie_var.get().strip()
            letra = letra_var.get().strip().upper()
            sala = sala_var.get().strip()
            periodo = periodo_var.get().strip()
            ano_txt = ano_var.get().strip()
            caminho_csv = csv_var.get().strip()

            if ciclo not in CICLOS:
                messagebox.showwarning("Criar turma", "Ciclo invalido.")
                return
            if not serie or not letra:
                messagebox.showwarning("Criar turma", "Serie e turma sao obrigatorias.")
                return
            if not caminho_csv:
                messagebox.showwarning("Criar turma", "Informe o CSV da turma.")
                return
            try:
                ano = int(ano_txt)
            except ValueError:
                messagebox.showwarning("Criar turma", "Ano letivo invalido.")
                return

            try:
                turma = Turma(
                    codigo=self._codigo_turma(serie, letra, ciclo),
                    ano=ano,
                    serie=serie,
                    sala=sala,
                    periodo=periodo,
                    ciclo=ciclo,
                )
                for aluno in ImportadorCSV.importar_alunos(caminho_csv):
                    turma.adicionar_aluno(aluno)
                self.turma_caminho = PersistenciaJSON.salvar_turma(turma)
                self.turma = turma
                self.turma_session = TurmaSession(turma, self.turma_caminho)
                self._atualizar_status_turma()
                self._carregar_catalogo_turmas()
                messagebox.showinfo("Criar turma", "Turma criada com sucesso.")
                dialog.destroy()
            except Exception as exc:
                messagebox.showerror("Erro", f"Falha ao criar turma:\n{exc}")

        ttk.Label(frame, text="Ciclo").grid(row=0, column=0, sticky="w")
        combo_ciclo = ttk.Combobox(
            frame,
            textvariable=ciclo_var,
            values=tuple(CICLOS.keys()),
            state="readonly",
            width=12,
        )
        combo_ciclo.grid(row=0, column=1, sticky="w")
        combo_ciclo.bind("<<ComboboxSelected>>", atualizar_series)

        ttk.Label(frame, text="Serie").grid(row=1, column=0, sticky="w", pady=(8, 0))
        combo_serie = ttk.Combobox(
            frame,
            textvariable=serie_var,
            values=series_por_ciclo(ciclo_var.get()),
            state="readonly",
            width=20,
        )
        combo_serie.grid(row=1, column=1, sticky="w", pady=(8, 0))
        combo_serie.bind("<<ComboboxSelected>>", atualizar_codigo)

        ttk.Label(frame, text="Turma").grid(row=2, column=0, sticky="w", pady=(8, 0))
        entry_letra = ttk.Entry(frame, textvariable=letra_var, width=6)
        entry_letra.grid(row=2, column=1, sticky="w", pady=(8, 0))
        entry_letra.bind("<KeyRelease>", atualizar_codigo)

        ttk.Label(frame, text="Sala").grid(row=3, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(frame, textvariable=sala_var, width=12).grid(row=3, column=1, sticky="w", pady=(8, 0))

        ttk.Label(frame, text="Periodo").grid(row=4, column=0, sticky="w", pady=(8, 0))
        ttk.Combobox(
            frame,
            textvariable=periodo_var,
            values=PERIODOS,
            state="readonly",
            width=20,
        ).grid(row=4, column=1, sticky="w", pady=(8, 0))

        ttk.Label(frame, text="Ano letivo").grid(row=5, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(frame, textvariable=ano_var, width=12).grid(row=5, column=1, sticky="w", pady=(8, 0))

        ttk.Label(frame, text="CSV de alunos").grid(row=6, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(frame, textvariable=csv_var, width=45).grid(row=6, column=1, sticky="ew", pady=(8, 0))
        ttk.Button(frame, text="Selecionar", command=selecionar_csv).grid(
            row=6, column=2, padx=(8, 0), pady=(8, 0), sticky="w"
        )

        codigo_preview_var = tk.StringVar()
        ttk.Label(frame, text="Codigo gerado").grid(row=7, column=0, sticky="w", pady=(10, 0))
        ttk.Label(frame, textvariable=codigo_preview_var).grid(row=7, column=1, sticky="w", pady=(10, 0))
        atualizar_series()

        botoes = ttk.Frame(frame)
        botoes.grid(row=8, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        botoes.columnconfigure((0, 1), weight=1)
        ttk.Button(botoes, text="Cancelar", command=dialog.destroy).grid(row=0, column=0, sticky="ew", padx=(0, 6))
        ttk.Button(botoes, text="Criar turma", command=salvar_turma).grid(row=0, column=1, sticky="ew", padx=(6, 0))

    def _abrir_dialogo_gerenciar_alunos(self):
        if not self._exigir_turma():
            return

        dialog = tk.Toplevel(self)
        dialog.title(f"Gerenciar alunos - {self.turma.codigo}")
        dialog.transient(self)
        dialog.grab_set()
        dialog.geometry("860x460")

        root = ttk.Frame(dialog, padding=12)
        root.grid(sticky="nsew")
        root.columnconfigure(0, weight=1)
        root.rowconfigure(1, weight=1)

        filtro_var = tk.StringVar()
        ttk.Label(root, text="Buscar aluno").grid(row=0, column=0, sticky="w")
        busca_entry = ttk.Entry(root, textvariable=filtro_var)
        busca_entry.grid(row=0, column=0, sticky="e", padx=(0, 220))

        tree = ttk.Treeview(
            root,
            columns=("matricula", "nome", "numero", "ativo"),
            show="headings",
            height=12,
        )
        tree.heading("matricula", text="Matricula")
        tree.heading("nome", text="Nome")
        tree.heading("numero", text="No")
        tree.heading("ativo", text="Ativo")
        tree.column("matricula", width=120, anchor="center")
        tree.column("nome", width=420, anchor="w")
        tree.column("numero", width=70, anchor="center")
        tree.column("ativo", width=70, anchor="center")
        tree.grid(row=1, column=0, sticky="nsew", pady=(8, 0))

        scroll = ttk.Scrollbar(root, orient="vertical", command=tree.yview)
        scroll.grid(row=1, column=1, sticky="ns", pady=(8, 0))
        tree.configure(yscrollcommand=scroll.set)

        form = ttk.LabelFrame(root, text="Edicao", padding=10)
        form.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        form.columnconfigure(1, weight=1)

        matricula_var = tk.StringVar()
        nome_var = tk.StringVar()
        numero_var = tk.StringVar()
        ativo_var = tk.BooleanVar(value=True)
        disciplina_5c_var = tk.StringVar()
        valor_5c_var = tk.StringVar()

        ttk.Label(form, text="Matricula").grid(row=0, column=0, sticky="w")
        ttk.Entry(form, textvariable=matricula_var, state="readonly", width=18).grid(row=0, column=1, sticky="w")
        ttk.Label(form, text="Nome").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(form, textvariable=nome_var).grid(row=1, column=1, sticky="ew", pady=(8, 0))
        ttk.Label(form, text="No chamada").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(form, textvariable=numero_var, width=12).grid(row=2, column=1, sticky="w", pady=(8, 0))
        ttk.Checkbutton(form, text="Ativo", variable=ativo_var).grid(row=3, column=1, sticky="w", pady=(8, 0))
        ttk.Separator(form).grid(row=4, column=0, columnspan=2, sticky="ew", pady=(10, 4))

        ttk.Label(form, text=f"{CONCEITO_FINAL} disciplina").grid(row=5, column=0, sticky="w")
        disciplinas = self._disciplinas_da_turma()
        combo_disc_5c = ttk.Combobox(
            form,
            textvariable=disciplina_5c_var,
            values=disciplinas,
            state="readonly",
            width=26,
        )
        combo_disc_5c.grid(row=5, column=1, sticky="w")
        if disciplinas:
            disciplina_5c_var.set(disciplinas[0])

        ttk.Label(form, text=f"Valor {CONCEITO_FINAL}").grid(row=6, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(form, textvariable=valor_5c_var, width=12).grid(row=6, column=1, sticky="w", pady=(8, 0))

        def obter_alunos_filtrados():
            termo = filtro_var.get().strip().lower()
            alunos = list(self.turma.alunos.values())
            alunos.sort(key=lambda a: (a.numero_chamada is None, a.numero_chamada or 9999, a.nome))
            if not termo:
                return alunos
            return [
                aluno
                for aluno in alunos
                if termo in aluno.nome.lower() or termo in aluno.matricula.lower()
            ]

        def repopular_lista(_event=None):
            for item in tree.get_children():
                tree.delete(item)
            for aluno in obter_alunos_filtrados():
                tree.insert(
                    "",
                    "end",
                    iid=aluno.matricula,
                    values=(
                        aluno.matricula,
                        aluno.nome,
                        "" if aluno.numero_chamada is None else aluno.numero_chamada,
                        "Sim" if aluno.ativo else "Nao",
                    ),
                )

        def carregar_aluno(_event=None):
            selecionado = tree.focus()
            if not selecionado:
                return
            aluno = self.turma.alunos.get(selecionado)
            if aluno is None:
                return
            matricula_var.set(aluno.matricula)
            nome_var.set(aluno.nome)
            numero_var.set("" if aluno.numero_chamada is None else str(aluno.numero_chamada))
            ativo_var.set(bool(aluno.ativo))
            carregar_5c_aluno()

        def carregar_5c_aluno(_event=None):
            matricula = matricula_var.get().strip()
            disciplina = disciplina_5c_var.get().strip()
            valor_5c_var.set("")
            if not matricula or not disciplina:
                return

            aluno = self.turma.alunos.get(matricula)
            if aluno is None:
                return

            medias_5c = getattr(aluno, "medias", {}).get(CONCEITO_FINAL, {})
            if isinstance(medias_5c, dict) and disciplina in medias_5c:
                valor_5c_var.set(str(medias_5c[disciplina]))

        def salvar_alteracoes():
            matricula = matricula_var.get().strip()
            if not matricula:
                messagebox.showwarning("Alunos", "Selecione um aluno na lista.")
                return
            aluno = self.turma.alunos.get(matricula)
            if aluno is None:
                messagebox.showwarning("Alunos", "Aluno selecionado nao existe mais.")
                return

            nome = nome_var.get().strip()
            numero_txt = numero_var.get().strip()
            if not nome:
                messagebox.showwarning("Alunos", "Nome nao pode ficar vazio.")
                return
            numero = None
            if numero_txt:
                try:
                    numero = int(numero_txt)
                except ValueError:
                    messagebox.showwarning("Alunos", "Numero de chamada invalido.")
                    return

            aluno.nome = nome
            aluno.numero_chamada = numero
            aluno.ativo = bool(ativo_var.get())

            self._salvar_turma()
            self._atualizar_status_turma()
            repopular_lista()
            if matricula in tree.get_children():
                tree.selection_set(matricula)
                tree.focus(matricula)
            messagebox.showinfo("Alunos", "Alteracoes salvas.")

        def salvar_5c():
            matricula = matricula_var.get().strip()
            disciplina = disciplina_5c_var.get().strip()
            valor_txt = valor_5c_var.get().strip().replace(",", ".")
            if not matricula:
                messagebox.showwarning("5C", "Selecione um aluno na lista.")
                return
            if not disciplina:
                messagebox.showwarning("5C", "Selecione uma disciplina.")
                return

            aluno = self.turma.alunos.get(matricula)
            if aluno is None:
                messagebox.showwarning("5C", "Aluno nao encontrado.")
                return

            aluno.medias.setdefault(CONCEITO_FINAL, {})
            if valor_txt == "":
                aluno.medias[CONCEITO_FINAL].pop(disciplina, None)
                if not aluno.medias[CONCEITO_FINAL]:
                    aluno.medias.pop(CONCEITO_FINAL, None)
            else:
                try:
                    valor = float(valor_txt)
                except ValueError:
                    messagebox.showwarning("5C", "Valor invalido para 5C.")
                    return
                aluno.medias[CONCEITO_FINAL][disciplina] = valor

            self._salvar_turma()
            self._atualizar_status_turma()
            messagebox.showinfo("5C", "Conceito salvo.")

        filtro_var.trace_add("write", lambda *_: repopular_lista())
        tree.bind("<<TreeviewSelect>>", carregar_aluno)
        combo_disc_5c.bind("<<ComboboxSelected>>", carregar_5c_aluno)
        repopular_lista()

        botoes = ttk.Frame(form)
        botoes.grid(row=7, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        botoes.columnconfigure((0, 1, 2), weight=1)
        ttk.Button(botoes, text="Salvar alteracoes", command=salvar_alteracoes).grid(
            row=0, column=0, sticky="ew", padx=(0, 6)
        )
        ttk.Button(botoes, text=f"Salvar {CONCEITO_FINAL}", command=salvar_5c).grid(
            row=0, column=1, sticky="ew", padx=(6, 6)
        )
        ttk.Button(botoes, text="Fechar", command=dialog.destroy).grid(
            row=0, column=2, sticky="ew", padx=(6, 0)
        )

    def _exigir_turma(self):
        if self.turma is None:
            messagebox.showwarning("Turma", "Abra uma turma antes de executar esta operacao.")
            return False
        return True

    def _obter_bimestre(self):
        entrada = self.bimestre_var.get().strip()
        if not entrada:
            messagebox.showwarning("Bimestre", "Informe o bimestre.")
            return None
        try:
            bimestre = garantir_bimestre_operacional(entrada)
            if bimestre != entrada:
                self.bimestre_var.set(bimestre)
            return bimestre
        except ValueError as exc:
            messagebox.showwarning("Bimestre", str(exc))
            return None

    def _salvar_turma(self):
        self.turma_caminho = PersistenciaJSON.salvar_turma(self.turma)
        self.turma_session = TurmaSession(self.turma, self.turma_caminho)
        self._carregar_catalogo_turmas()
        self._atualizar_status_bimestre()

    def _salvar_nota_minima(self):
        valor = self.nota_minima_var.get().strip().replace(",", ".")
        try:
            Configuracao.definir_nota_minima(float(valor))
            messagebox.showinfo("Configuracoes", "Nota minima atualizada.")
        except Exception as exc:
            messagebox.showerror("Erro", f"Valor invalido para nota minima:\n{exc}")

    def _salvar_direcao(self):
        nome = self.direcao_nome_var.get().strip()
        pronome = self.direcao_pronome_var.get().strip().upper()
        if not nome:
            messagebox.showwarning("Configuracoes", "Informe o nome da direcao.")
            return
        if pronome not in {"F", "M"}:
            messagebox.showwarning("Configuracoes", "Pronome invalido.")
            return
        try:
            Configuracao.definir_direcao(nome, pronome)
            messagebox.showinfo("Configuracoes", "Direcao atualizada.")
        except Exception as exc:
            messagebox.showerror("Erro", f"Nao foi possivel salvar direcao:\n{exc}")

    def _atualizar_turma(self):
        if not self._exigir_turma():
            return
        caminho_csv = self.csv_update_var.get().strip()
        if not caminho_csv:
            messagebox.showwarning("CSV", "Informe o caminho do CSV atualizado.")
            return

        try:
            AtualizadorTurma.atualizar_turma(self.turma, caminho_csv)
            self._salvar_turma()
            messagebox.showinfo("Turma", "Turma atualizada com sucesso.")
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao atualizar turma:\n{exc}")

    def _importar_mapoes(self):
        if not self._exigir_turma():
            return

        bimestre = self._obter_bimestre()
        if not bimestre:
            return

        caminho_fgb = self.mapao_fgb_var.get().strip()
        caminho_if = self.mapao_if_var.get().strip()
        if not caminho_fgb:
            messagebox.showwarning("Mapao", "Informe o caminho do mapao FGB.")
            return

        try:
            ImportadorMapao.importar(caminho_fgb, self.turma, bimestre)
            if caminho_if:
                ImportadorMapao.importar(caminho_if, self.turma, bimestre)
            self._salvar_turma()
            messagebox.showinfo("Mapao", "Mapoes importados com sucesso.")
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao importar mapao:\n{exc}")

    def _gerar_relatorio(self):
        if not self._exigir_turma():
            return
        bimestre = self._obter_bimestre()
        if not bimestre:
            return

        caminho_sugerido = f"relatorio_professores_{self.turma.codigo}_bim_{bimestre}.docx"
        caminho = filedialog.asksaveasfilename(
            title="Salvar relatorio para professores",
            initialdir=data_dir("relatorios"),
            initialfile=caminho_sugerido,
            defaultextension=".docx",
            filetypes=[("Documento Word", "*.docx"), ("Todos", "*.*")],
        )
        if not caminho:
            return

        try:
            caminho = GeradorRelatorioProfessores.gerar(self.turma, bimestre, caminho_saida=caminho)
            messagebox.showinfo("Relatorio", f"Relatorio gerado em:\n{caminho}")
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao gerar relatorio:\n{exc}")

    def _gerar_ata_bimestre(self, bimestre):
        if not self._exigir_turma():
            return

        data_texto = self.data_conselho_var.get().strip()
        data_conselho = date.today()
        if data_texto:
            try:
                data_conselho = datetime.strptime(data_texto, "%d/%m/%Y").date()
            except ValueError:
                messagebox.showwarning("Data", "Use o formato DD/MM/AAAA para a data do conselho.")
                return

        caminho_sugerido = f"ata_{self.turma.codigo}_bimestre_{bimestre}.docx"
        caminho_destino = filedialog.asksaveasfilename(
            title="Salvar ata do conselho",
            initialdir=data_dir("atas"),
            initialfile=caminho_sugerido,
            defaultextension=".docx",
            filetypes=[("Documento Word", "*.docx"), ("Todos", "*.*")],
        )
        if not caminho_destino:
            return

        try:
            caminho = GeradorAta.gerar(
                self.turma,
                bimestre,
                data_conselho=data_conselho,
                confirmar_continuacao=self._confirmar_continuacao_ata,
                log=self._log,
                caminho_saida=caminho_destino,
            )
            if caminho:
                messagebox.showinfo("Ata", f"Ata gerada em:\n{caminho}")
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao gerar ata:\n{exc}")

    def _gerar_ata(self):
        bimestre = self._obter_bimestre()
        if not bimestre:
            return
        self._gerar_ata_bimestre(bimestre)

    def _confirmar_continuacao_ata(self, sem_freq, caminho_rel):
        nomes = ", ".join(sem_freq[:4])
        if len(sem_freq) > 4:
            nomes = f"{nomes}, ..."
        mensagem = (
            "Ha alunos sem frequencia importada.\n\n"
            f"Exemplos: {nomes}\n\n"
            f"Relatorio salvo em:\n{caminho_rel}\n\n"
            "Deseja continuar mesmo assim?"
        )
        return messagebox.askyesno("Confirmacao", mensagem)

    def _log(self, *args):
        print(*args)
