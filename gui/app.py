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
from services.backup import BackupDados
from services.configuracao import Configuracao
from services.gerador_ata import GeradorAta
from services.gerador_relatorio_professores import GeradorRelatorioProfessores
from services.importador_mapao import ImportadorMapao
from services.periodo_letivo import CONCEITO_FINAL, garantir_bimestre_operacional, normalizar_periodo
from services.persistencia import PersistenciaJSON
from services.runtime_paths import data_dir
from services.updater import REPO_NAME, REPO_OWNER, check_for_updates, open_release_page
from services.version import APP_NAME, APP_VERSION

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
REPO_URL = f"https://github.com/{REPO_OWNER}/{REPO_NAME}"
PERIODO_EXIBICAO = {
    "1": "1o bimestre",
    "2": "2o bimestre",
    "3": "3o bimestre",
    "4": "4o bimestre",
    CONCEITO_FINAL: "5o conceito",
}
PERIODO_POR_EXIBICAO = {valor: chave for chave, valor in PERIODO_EXIBICAO.items()}
BIMESTRE_EXIBICAO = tuple(PERIODO_EXIBICAO[b] for b in ("1", "2", "3", "4"))
TODOS_PERIODOS_EXIBICAO = tuple(PERIODO_EXIBICAO[p] for p in ("1", "2", "3", "4", CONCEITO_FINAL))


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

        self.title(f"{APP_NAME} v{APP_VERSION}")
        self.geometry("1180x720")
        self.minsize(1040, 640)

        self.turma = None
        self.turma_caminho = None
        self.turma_session = None
        self.turma_window_registry = TurmaWindowRegistry()

        self.turma_status = tk.StringVar(value="Turma atual: nenhuma")
        self.bimestre_var = tk.StringVar(value=PERIODO_EXIBICAO["1"])
        self.data_conselho_var = tk.StringVar()
        self.csv_update_var = tk.StringVar()
        self.mapao_fgb_var = tk.StringVar()
        self.mapao_if_var = tk.StringVar()
        self.status_mapao_var = tk.StringVar(value="Mapao: -")
        self.status_ata_var = tk.StringVar(value="Ata: -")
        self.status_relatorio_var = tk.StringVar(value="Relatorio: -")
        self.status_pendencias_var = tk.StringVar(value="Pendencias frequencia: -")
        self.catalogo_resumo_var = tk.StringVar(value="Nenhuma turma encontrada.")
        self.proximo_passo_var = tk.StringVar(value="Abra uma turma ou crie uma nova para comecar.")

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
        self.bimestre_var.trace_add("write", lambda *_args: self._atualizar_status_bimestre())
        self.after(50, self._ajustar_janela_principal_inicial)
        self.after(150, self._talvez_abrir_wizard_inicial)

    def _build_menu(self):
        menu = tk.Menu(self)

        menu_arquivo = tk.Menu(menu, tearoff=0)
        menu_arquivo.add_command(
            label=f"Abrir turma... ({self.platform_ui.open_shortcut_label})",
            command=self._abrir_turma,
        )
        menu_arquivo.add_command(label="Assistente inicial...", command=self._abrir_wizard_primeiros_passos)
        menu_arquivo.add_command(label="Criar nova turma...", command=self._abrir_dialogo_criar_turma)
        menu_arquivo.add_command(label="Gerir turma...", command=self._abrir_dialogo_gerir_turma)
        menu_arquivo.add_checkbutton(
            label="Gestao em nova janela (experimental)",
            variable=self.gestao_nova_janela_var,
        )
        menu_arquivo.add_command(label="Excluir turma selecionada...", command=self._excluir_turma_selecionada)
        menu_arquivo.add_command(label="Gerenciar alunos...", command=self._abrir_dialogo_gerenciar_alunos)
        menu_arquivo.add_separator()
        menu_arquivo.add_command(label="Exportar dados...", command=self._exportar_backup)
        menu_arquivo.add_command(label="Adicionar dados de backup...", command=self._importar_backup)
        menu_arquivo.add_command(label="Substituir dados pelo backup...", command=self._restaurar_backup)
        menu_arquivo.add_separator()
        menu_arquivo.add_command(
            label=f"Sair ({self.platform_ui.quit_shortcut_label})",
            command=self.destroy,
        )
        menu.add_cascade(label="Arquivo", menu=menu_arquivo)

        menu_ajuda = tk.Menu(menu, tearoff=0)
        menu_ajuda.add_command(label=f"Versao atual: v{APP_VERSION}", state="disabled")
        menu_ajuda.add_separator()
        menu_ajuda.add_command(label="Verificar atualizacoes", command=self._verificar_atualizacoes)
        menu_ajuda.add_command(label="Sobre", command=self._mostrar_sobre)
        menu.add_cascade(label="Ajuda", menu=menu_ajuda)

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

        root = ttk.Frame(self, padding=20, style="App.TFrame")
        root.grid(row=0, column=0, sticky="nsew")
        root.columnconfigure(0, weight=7)
        root.columnconfigure(1, weight=4)
        root.rowconfigure(1, weight=1)
        root.rowconfigure(2, weight=1)

        hero = ttk.Frame(root, style="App.TFrame")
        hero.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 16))
        hero.columnconfigure(0, weight=1)

        ttk.Label(hero, text=APP_NAME, style="HeroTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            hero,
            text=(
                "Gestao pedagogica de turmas, importacao de mapoes e geracao de documentos "
                "em uma interface mais clara para a rotina da coordenacao."
            ),
            style="HeroSubtitle.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(4, 0))

        hero_actions = ttk.Frame(hero, style="App.TFrame")
        hero_actions.grid(row=0, column=1, rowspan=2, sticky="e")
        ttk.Button(hero_actions, text="Abrir turma", style="Accent.TButton", command=self._abrir_turma).grid(
            row=0, column=0, sticky="ew"
        )
        ttk.Button(hero_actions, text="Criar nova turma", command=self._abrir_dialogo_criar_turma).grid(
            row=0, column=1, sticky="ew", padx=(8, 0)
        )

        catalogo = ttk.Frame(root, padding=16, style="Surface.TFrame")
        catalogo.grid(row=1, column=0, sticky="nsew", padx=(0, 12))
        catalogo.columnconfigure(0, weight=1)
        catalogo.rowconfigure(3, weight=1)

        ttk.Label(catalogo, text="Turmas", style="SectionTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            catalogo,
            textvariable=self.catalogo_resumo_var,
            style="SurfaceMuted.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(4, 0))

        filtros = ttk.Frame(catalogo, style="Surface.TFrame")
        filtros.grid(row=2, column=0, sticky="ew", pady=(14, 10))
        filtros.columnconfigure(3, weight=1)

        ttk.Label(filtros, text="Ano", style="Surface.TLabel").grid(row=0, column=0, sticky="w")
        self.combo_ano = ttk.Combobox(
            filtros,
            textvariable=self.filtro_ano_var,
            state="readonly",
            values=("Todos",),
            width=14,
        )
        self.combo_ano.grid(row=0, column=1, sticky="w", padx=(8, 16))
        self.combo_ano.bind("<<ComboboxSelected>>", self._on_filtro_alterado)

        ttk.Label(filtros, text="Buscar turma", style="Surface.TLabel").grid(row=0, column=2, sticky="w")
        busca_entry = ttk.Entry(filtros, textvariable=self.busca_turma_var)
        busca_entry.grid(row=0, column=3, sticky="ew", padx=(8, 0))
        busca_entry.bind("<KeyRelease>", self._on_filtro_alterado)

        toolbar = ttk.Frame(catalogo, style="Surface.TFrame")
        toolbar.grid(row=4, column=0, sticky="ew", pady=(10, 0))
        ttk.Button(toolbar, text="Atualizar lista", command=self._carregar_catalogo_turmas).grid(
            row=0, column=0, sticky="w"
        )
        ttk.Button(toolbar, text="Abrir selecionada", command=self._abrir_turma_da_lista).grid(
            row=0, column=1, sticky="w", padx=(8, 0)
        )
        ttk.Button(toolbar, text="Excluir selecionada", command=self._excluir_turma_selecionada).grid(
            row=0, column=2, sticky="w", padx=(8, 0)
        )

        tree_wrap = ttk.Frame(catalogo, style="Surface.TFrame")
        tree_wrap.grid(row=3, column=0, sticky="nsew")
        tree_wrap.columnconfigure(0, weight=1)
        tree_wrap.rowconfigure(0, weight=1)

        self.tree_turmas = ttk.Treeview(
            tree_wrap,
            columns=("ano", "codigo", "arquivo"),
            show="headings",
            height=12,
        )
        self.tree_turmas.heading("ano", text="Ano")
        self.tree_turmas.heading("codigo", text="Turma")
        self.tree_turmas.heading("arquivo", text="Arquivo")
        self.tree_turmas.column("ano", width=80, anchor="center")
        self.tree_turmas.column("codigo", width=120, anchor="center")
        self.tree_turmas.column("arquivo", width=520, anchor="w")
        self.tree_turmas.grid(row=0, column=0, sticky="nsew")
        self.tree_turmas.bind("<Double-1>", self._abrir_gestao_da_turma_da_lista)

        scroll = ttk.Scrollbar(tree_wrap, orient="vertical", command=self.tree_turmas.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        self.tree_turmas.configure(yscrollcommand=scroll.set)

        acoes = ttk.Frame(root, padding=16, style="Surface.TFrame")
        acoes.grid(row=2, column=0, sticky="nsew", padx=(0, 12), pady=(12, 0))
        acoes.columnconfigure((0, 1), weight=1)

        ttk.Label(acoes, text="Acoes rapidas", style="SectionTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            acoes,
            textvariable=self.proximo_passo_var,
            style="SurfaceMuted.TLabel",
        ).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 12))

        periodo_bar = ttk.Frame(acoes, style="Surface.TFrame")
        periodo_bar.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(0, 12))
        periodo_bar.columnconfigure(3, weight=1)

        ttk.Label(periodo_bar, text="Periodo de trabalho", style="Surface.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            periodo_bar,
            textvariable=self.bimestre_var,
            values=TODOS_PERIODOS_EXIBICAO,
            state="readonly",
            width=22,
        ).grid(row=0, column=1, sticky="w", padx=(8, 16))
        ttk.Label(periodo_bar, text="Data do conselho", style="Surface.TLabel").grid(row=0, column=2, sticky="w")
        ttk.Entry(periodo_bar, textvariable=self.data_conselho_var, width=18).grid(
            row=0, column=3, sticky="w", padx=(8, 0)
        )

        botoes_acao = [
            ("Gerir turma selecionada", self._abrir_dialogo_gerir_turma),
            ("Gerenciar alunos", self._abrir_dialogo_gerenciar_alunos),
            ("Atualizar turma por CSV", self._abrir_dialogo_atualizar_turma_csv),
            ("Importar mapoes", self._abrir_dialogo_importar_mapoes),
            ("Gerar ata", self._gerar_ata),
            ("Gerar relatorio", self._gerar_relatorio),
        ]
        for indice, (texto, comando) in enumerate(botoes_acao):
            row = 3 + (indice // 2)
            column = indice % 2
            padx = (0, 8) if column == 0 else (8, 0)
            ttk.Button(acoes, text=texto, command=comando).grid(
                row=row,
                column=column,
                sticky="ew",
                padx=padx,
                pady=(0, 8),
            )

        lateral = ttk.Frame(root, padding=16, style="Sidebar.TFrame")
        lateral.grid(row=1, column=1, rowspan=2, sticky="nsew", pady=(0, 0))
        lateral.columnconfigure(0, weight=1)

        ttk.Label(lateral, text="Painel da turma", style="CardTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(lateral, textvariable=self.turma_status, style="SidebarMuted.TLabel", wraplength=320).grid(
            row=1, column=0, sticky="w", pady=(6, 14)
        )

        resumo = ttk.LabelFrame(lateral, text="Status do periodo", padding=12)
        resumo.grid(row=2, column=0, sticky="ew")
        resumo.columnconfigure(0, weight=1)
        for idx, status_var in enumerate(
            (
                self.status_mapao_var,
                self.status_ata_var,
                self.status_relatorio_var,
                self.status_pendencias_var,
            )
        ):
            ttk.Label(resumo, textvariable=status_var).grid(row=idx, column=0, sticky="w", pady=(0, 6))

        orientacao = ttk.LabelFrame(lateral, text="Fluxo sugerido", padding=12)
        orientacao.grid(row=3, column=0, sticky="ew", pady=(12, 0))
        orientacao.columnconfigure(0, weight=1)
        orientacao_textos = (
            "1. Abra ou crie uma turma.",
            "2. Atualize os alunos por CSV quando necessario.",
            "3. Importe os mapoes do periodo.",
            "4. Gere ata e relatorio ao final do conselho.",
        )
        for idx, texto in enumerate(orientacao_textos):
            ttk.Label(orientacao, text=texto).grid(row=idx, column=0, sticky="w", pady=(0, 4))

        config = ttk.LabelFrame(lateral, text="Configuracoes", padding=12)
        config.grid(row=4, column=0, sticky="nsew", pady=(12, 0))
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
                caminho = os.path.join(pasta_ano, arquivo)
                try:
                    turma = PersistenciaJSON.carregar_turma(caminho)
                    codigo_exibicao = self._rotulo_turma(turma)
                except Exception:
                    codigo_exibicao = arquivo.replace("turma_", "").replace(".json", "")
                resultados.append((ano, codigo_exibicao, caminho))
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
        exibidas = 0

        for item in self.tree_turmas.get_children():
            self.tree_turmas.delete(item)

        for ano, codigo, caminho in self.catalogo_turmas:
            if filtro_ano != "Todos" and ano != filtro_ano:
                continue
            if busca and busca not in codigo.lower() and busca not in os.path.basename(caminho).lower():
                continue
            self.tree_turmas.insert("", "end", values=(ano, codigo, caminho))
            exibidas += 1

        total = len(self.catalogo_turmas)
        if total == 0:
            self.catalogo_resumo_var.set("Nenhuma turma encontrada ainda.")
        elif exibidas == total:
            self.catalogo_resumo_var.set(f"{total} turma(s) disponivel(is).")
        else:
            self.catalogo_resumo_var.set(f"Exibindo {exibidas} de {total} turma(s).")

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

    def _abrir_gestao_da_turma_da_lista(self, _event=None):
        selecionado = self.tree_turmas.focus()
        if not selecionado:
            return
        valores = self.tree_turmas.item(selecionado, "values")
        if not valores:
            return
        self._abrir_turma_por_caminho(valores[2])
        self._abrir_dialogo_gerir_turma()

    def _abrir_turma_por_caminho(self, caminho):
        try:
            self.turma = PersistenciaJSON.carregar_turma(caminho)
            self.turma_caminho = caminho
            self.turma_session = TurmaSession(self.turma, caminho)
            self._atualizar_status_turma()
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao abrir turma:\n{exc}")

    def _resetar_estado_local(self):
        self.turma = None
        self.turma_caminho = None
        self.turma_session = None
        self._carregar_configuracoes()
        self._carregar_catalogo_turmas()
        self._atualizar_status_turma()

    def _exportar_backup(self):
        caminho = filedialog.asksaveasfilename(
            title="Exportar backup",
            initialdir=BackupDados.pasta_padrao_backup(),
            initialfile=BackupDados.nome_padrao_backup(),
            defaultextension=".zip",
            filetypes=[("Backup ZIP", "*.zip"), ("Todos", "*.*")],
        )
        if not caminho:
            return

        try:
            info = BackupDados.exportar_backup(caminho)
            messagebox.showinfo(
                "Backup",
                f"Backup exportado com sucesso.\n\nArquivo:\n{info['caminho']}\n\nItens copiados: {info['arquivos']}",
            )
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao exportar backup:\n{exc}")

    def _restaurar_backup(self):
        caminho = filedialog.askopenfilename(
            title="Selecionar backup",
            initialdir=BackupDados.pasta_padrao_backup(),
            filetypes=[("Backup ZIP", "*.zip"), ("Todos", "*.*")],
        )
        if not caminho:
            return

        confirma = messagebox.askyesno(
            "Substituir dados pelo backup",
            "Esta opcao vai substituir os dados locais atuais por aqueles contidos no backup.\n\n"
            "Antes disso, o aplicativo criara automaticamente um backup de seguranca do estado atual.\n\n"
            "Deseja continuar?",
        )
        if not confirma:
            return

        try:
            info = BackupDados.restaurar_backup(caminho, criar_backup_seguranca=True)
            self._resetar_estado_local()
            mensagem = f"Backup restaurado com sucesso.\n\nItens restaurados: {info['arquivos_restaurados']}"
            if info.get("backup_seguranca"):
                mensagem += f"\n\nBackup de seguranca salvo em:\n{info['backup_seguranca']}"
            messagebox.showinfo("Substituir dados pelo backup", mensagem)
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao substituir os dados locais:\n{exc}")

    def _importar_backup(self):
        caminho = filedialog.askopenfilename(
            title="Selecionar backup para importacao",
            initialdir=BackupDados.pasta_padrao_backup(),
            filetypes=[("Backup ZIP", "*.zip"), ("Todos", "*.*")],
        )
        if not caminho:
            return

        confirma = messagebox.askyesno(
            "Adicionar dados de backup",
            "Esta opcao vai adicionar ao aplicativo os dados que ainda nao existirem nesta maquina.\n\n"
            "Se houver turma ou arquivo com o mesmo nome, o dado local sera mantido e o item do backup sera ignorado.\n\n"
            "Deseja continuar?",
        )
        if not confirma:
            return

        try:
            info = BackupDados.importar_backup_mesclando(caminho)
            self._resetar_estado_local()
            mensagem = (
                f"Importacao concluida.\n\n"
                f"Itens importados: {info['arquivos_importados']}\n"
                f"Conflitos ignorados: {len(info['conflitos'])}"
            )
            if info["conflitos"]:
                exemplos = "\n".join(info["conflitos"][:5])
                mensagem += f"\n\nExemplos de conflitos mantidos localmente:\n{exemplos}"
                if len(info["conflitos"]) > 5:
                    mensagem += "\n..."
            messagebox.showinfo("Adicionar dados de backup", mensagem)
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao adicionar os dados do backup:\n{exc}")

    def _atualizar_status_turma(self):
        if self.turma is None:
            self.turma_caminho = None
            self.turma_session = None
            self.turma_status.set("Turma atual: nenhuma")
            self.proximo_passo_var.set("Abra uma turma ou crie uma nova para comecar.")
            self._atualizar_status_bimestre()
            return
        self.turma_status.set(
            f"Turma atual: {self._rotulo_turma(self.turma)} ({self.turma.ano}) - {len(self.turma.alunos)} alunos"
        )
        self.proximo_passo_var.set(
            "Com a turma aberta, atualize alunos, importe mapoes e gere os documentos do periodo."
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
        return f"{serie} {letra}"

    def _rotulo_turma(self, turma):
        codigo = getattr(turma, "codigo", "")
        serie = getattr(turma, "serie", "")
        ciclo = getattr(turma, "ciclo", "")

        if ciclo == "EM" and serie and len(codigo) == 2 and codigo[0] in {"1", "2", "3"} and codigo[1].isalpha():
            return f"{serie} {codigo[1].upper()}"

        return codigo

    def _centralizar_janela(self, janela, largura=None, altura=None):
        janela.update_idletasks()
        largura = largura or janela.winfo_reqwidth()
        altura = altura or janela.winfo_reqheight()

        largura_base = self.winfo_width() or self.winfo_reqwidth() or largura
        altura_base = self.winfo_height() or self.winfo_reqheight() or altura
        x_base = self.winfo_rootx()
        y_base = self.winfo_rooty()

        x = x_base + max((largura_base - largura) // 2, 20)
        y = y_base + max((altura_base - altura) // 2, 20)
        janela.geometry(f"{largura}x{altura}+{x}+{y}")

    def _ajustar_dialogo_ao_conteudo(self, dialog, largura_min=None, altura_min=None, redimensionavel=True):
        dialog.update_idletasks()
        largura = max(dialog.winfo_reqwidth() + 24, largura_min or 0)
        altura = max(dialog.winfo_reqheight() + 24, altura_min or 0)
        dialog.minsize(largura, altura)
        dialog.resizable(redimensionavel, redimensionavel)
        self._centralizar_janela(dialog, largura, altura)

    def _ajustar_janela_principal_inicial(self):
        self.update_idletasks()

        largura_req = max(self.winfo_reqwidth() + 24, 1180)
        altura_req = max(self.winfo_reqheight() + 24, 720)
        largura_tela = self.winfo_screenwidth()
        altura_tela = self.winfo_screenheight()

        largura = min(largura_req, max(largura_tela - 120, 960))
        altura = min(altura_req, max(altura_tela - 120, 700))

        self.minsize(min(largura_req, largura_tela - 80), min(altura_req, altura_tela - 80))
        self._centralizar_janela(self, largura, altura)

    def _talvez_abrir_wizard_inicial(self):
        if self.catalogo_turmas:
            return
        if not Configuracao.configuracao_inicial_pendente():
            return
        self._abrir_wizard_primeiros_passos()

    def _criar_turma_por_dados(self, ciclo, serie, letra, sala, periodo, ano_txt, caminho_csv):
        ciclo = ciclo.strip()
        serie = serie.strip()
        letra = letra.strip().upper()
        sala = sala.strip()
        periodo = periodo.strip()
        ano_txt = ano_txt.strip()
        caminho_csv = caminho_csv.strip()

        if ciclo not in CICLOS:
            raise ValueError("Ciclo invalido.")
        if not serie or not letra:
            raise ValueError("Serie e turma sao obrigatorias.")
        if not caminho_csv:
            raise ValueError("Informe o CSV da turma.")

        try:
            ano = int(ano_txt)
        except ValueError as exc:
            raise ValueError("Ano letivo invalido.") from exc

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
        return turma

    def _obter_data_conselho_atual(self, silencioso=False):
        data_texto = self.data_conselho_var.get().strip()
        if not data_texto:
            return date.today()
        try:
            return datetime.strptime(data_texto, "%d/%m/%Y").date()
        except ValueError:
            if not silencioso:
                messagebox.showwarning("Data", "Use o formato DD/MM/AAAA para a data do conselho.")
            return None

    def _texto_ata_salvo(self, bimestre):
        textos_ata = getattr(self.turma, "textos_ata", {}) if self.turma is not None else {}
        texto_bimestre = textos_ata.get(str(bimestre), {})
        if not isinstance(texto_bimestre, dict):
            return {}
        return {
            "cabecalho": str(texto_bimestre.get("cabecalho", "")).strip(),
            "corpo": str(texto_bimestre.get("corpo", "")).strip(),
        }

    def _texto_ata_sugerido(self, bimestre, data_conselho=None):
        if self.turma is None:
            return {"cabecalho": "", "corpo": ""}
        data_base = data_conselho or self._obter_data_conselho_atual(silencioso=True) or date.today()
        cabecalho, corpo = GeradorAta.montar_intro_padrao(self.turma, data_base)
        return {"cabecalho": cabecalho, "corpo": corpo}

    def _texto_ata_para_edicao(self, bimestre, data_conselho=None):
        sugerido = self._texto_ata_sugerido(bimestre, data_conselho=data_conselho)
        salvo = self._texto_ata_salvo(bimestre)
        return {
            "cabecalho": salvo.get("cabecalho") or sugerido["cabecalho"],
            "corpo": salvo.get("corpo") or sugerido["corpo"],
        }

    def _salvar_texto_ata_bimestre(self, bimestre, cabecalho, corpo, data_conselho=None):
        if self.turma is None:
            return
        bimestre = str(bimestre)
        cabecalho = cabecalho.strip()
        corpo = corpo.strip()
        sugerido = self._texto_ata_sugerido(bimestre, data_conselho=data_conselho)

        textos_ata = getattr(self.turma, "textos_ata", {})
        if not isinstance(textos_ata, dict):
            textos_ata = {}

        if cabecalho == sugerido["cabecalho"] and corpo == sugerido["corpo"]:
            textos_ata.pop(bimestre, None)
        else:
            textos_ata[bimestre] = {"cabecalho": cabecalho, "corpo": corpo}

        self.turma.textos_ata = textos_ata
        self._salvar_turma()

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

        def render_painel_conselho():
            for child in conselho.winfo_children():
                child.destroy()

            bimestres = self._bimestres_com_dados()
            if not bimestres:
                ttk.Label(
                    conselho,
                    text="Sem dados para conselho.\nImporte mapao/medias primeiro.",
                ).grid(row=0, column=0, sticky="w")
                return

            for i, b in enumerate(bimestres):
                acao = "Gerir" if self._tem_conselho_registrado(b) else "Realizar"
                ttk.Button(
                    conselho,
                    text=f"{acao} conselho do {b}º bimestre",
                    command=lambda bb=b: abrir_conselho_com_refresh(bb),
                ).grid(row=i, column=0, sticky="ew", pady=(0, 6))

        def abrir_conselho_com_refresh(b):
            janela = self._abrir_tela_conselho(b)
            if janela is not None:
                janela.bind("<Destroy>", lambda _e: render_painel_conselho(), add="+")

        ttk.Label(frame, text="Periodo").grid(row=1, column=0, sticky="w", pady=(10, 0))
        ttk.Combobox(
            frame,
            textvariable=self.bimestre_var,
            values=TODOS_PERIODOS_EXIBICAO,
            state="readonly",
            width=24,
        ).grid(row=1, column=1, sticky="w", pady=(10, 0))

        botoes = ttk.Frame(frame)
        botoes.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(14, 0))
        botoes.columnconfigure((0, 1), weight=1)
        ttk.Button(
            botoes,
            text="Atualizar turma por CSV",
            command=self._abrir_dialogo_atualizar_turma_csv,
        ).grid(
            row=0, column=0, sticky="ew", padx=(0, 6)
        )
        ttk.Button(
            botoes,
            text="Importar mapoes",
            command=lambda: self._abrir_dialogo_importar_mapoes(callback_sucesso=render_painel_conselho),
        ).grid(
            row=0, column=1, sticky="ew", padx=(6, 0)
        )
        ttk.Button(botoes, text="Gerenciar alunos", command=self._abrir_dialogo_gerenciar_alunos).grid(
            row=1, column=0, sticky="ew", padx=(0, 6), pady=(8, 0)
        )
        ttk.Button(
            botoes,
            text="Excluir turma",
            command=lambda: self._excluir_turma_selecionada(fechar_dialogo=dialog),
        ).grid(
            row=1, column=1, sticky="ew", padx=(6, 0), pady=(8, 0)
        )
        ttk.Button(botoes, text="Fechar", command=dialog.destroy).grid(
            row=2, column=0, columnspan=2, sticky="ew", pady=(8, 0)
        )
        render_painel_conselho()
        self._ajustar_dialogo_ao_conteudo(dialog, largura_min=980, altura_min=620, redimensionavel=True)

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
        dialog.geometry("1200x720")

        if not self.data_conselho_var.get().strip():
            self.data_conselho_var.set(date.today().strftime("%d/%m/%Y"))

        root = ttk.Frame(dialog, padding=12)
        root.grid(sticky="nsew")
        root.columnconfigure(0, weight=1)
        root.columnconfigure(1, weight=1)
        root.rowconfigure(2, weight=1)
        root.rowconfigure(3, weight=1)

        aluno_pos_var = tk.StringVar()
        aluno_nome_var = tk.StringVar()
        aluno_numero_var = tk.StringVar()

        topo_esquerda = ttk.Frame(root)
        topo_esquerda.grid(row=0, column=0, sticky="w")
        ttk.Label(topo_esquerda, textvariable=aluno_pos_var).grid(row=0, column=0, sticky="w")

        ttk.Label(root, textvariable=aluno_nome_var).grid(row=1, column=0, sticky="w", pady=(6, 0))
        ttk.Label(root, textvariable=aluno_numero_var).grid(row=1, column=1, sticky="e", pady=(6, 0))

        notas_box = ttk.LabelFrame(root, text="Disciplinas e notas", padding=8)
        notas_box.grid(row=2, column=1, rowspan=2, sticky="nsew", pady=(8, 0), padx=(10, 0))
        notas_box.columnconfigure(0, weight=1)
        notas_box.rowconfigure(0, weight=1)
        tree_notas = ttk.Treeview(
            notas_box,
            columns=("disciplina", "media_original", "media_ajustada", "situacao"),
            show="headings",
            height=8,
        )
        tree_notas.heading("disciplina", text="Disciplina")
        tree_notas.heading("media_original", text="Media original")
        tree_notas.heading("media_ajustada", text="Media conselho")
        tree_notas.heading("situacao", text="Situacao")
        tree_notas.column("disciplina", width=210, anchor="w")
        tree_notas.column("media_original", width=90, anchor="center")
        tree_notas.column("media_ajustada", width=90, anchor="center")
        tree_notas.column("situacao", width=130, anchor="center")
        tree_notas.tag_configure("abaixo", foreground="#b00020")
        tree_notas.tag_configure("limite", foreground="#b36b00")
        tree_notas.tag_configure("adequada", foreground="#127a2a")
        tree_notas.tag_configure("ajustada", foreground="#0b5cab")
        tree_notas.grid(row=0, column=0, sticky="nsew")
        ttk.Label(
            notas_box,
            text="Ajustes feitos aqui nao alteram a Sala do Futuro automaticamente.",
            foreground="#7a3d00",
        ).grid(row=1, column=0, sticky="w", pady=(8, 0))

        botoes_notas = ttk.Frame(notas_box)
        botoes_notas.grid(row=2, column=0, sticky="ew", pady=(8, 0))

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
        tree_freq.column("disciplina", width=240, anchor="w")
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
        controle.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        controle.columnconfigure((0, 1, 2), weight=1)
        nota_minima = Configuracao.obter_nota_minima()
        estado["salvando_texto_ata"] = False
        estado["agendamento_texto_ata"] = None

        def _ajustes_media(aluno):
            return getattr(aluno, "ajustes_medias_conselho", {}).get(bimestre, {})

        def _media_vigente(aluno, disciplina, media_original):
            ajuste = _ajustes_media(aluno).get(disciplina, {})
            media_ajustada = ajuste.get("media_ajustada")
            if media_ajustada is None:
                return media_original
            return media_ajustada

        def _classificar_media(media):
            if media < nota_minima:
                return "ABAIXO MINIMA", "abaixo"
            if media == nota_minima:
                return "NO LIMITE", "limite"
            return "ADEQUADA", "adequada"

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

        def salvar_ajuste_media_atual(disciplina, media_original, media_ajustada, observacao):
            aluno = alunos[estado["idx"]]
            aluno.ajustes_medias_conselho.setdefault(bimestre, {})
            ajustes_bim = aluno.ajustes_medias_conselho[bimestre]

            if media_ajustada is None:
                ajustes_bim.pop(disciplina, None)
                if not ajustes_bim:
                    aluno.ajustes_medias_conselho.pop(bimestre, None)
            else:
                ajustes_bim[disciplina] = {
                    "media_original": media_original,
                    "media_ajustada": media_ajustada,
                    "observacao": observacao.strip(),
                }

            self._salvar_turma()

        def salvar_texto_ata_atual(cabecalho, corpo):
            data_conselho = self._obter_data_conselho_atual(silencioso=True) or date.today()
            self._salvar_texto_ata_bimestre(
                bimestre,
                cabecalho,
                corpo,
                data_conselho=data_conselho,
            )

        def escolher_caminho_ata():
            return filedialog.asksaveasfilename(
                title="Salvar ata do conselho",
                initialdir=data_dir("atas"),
                initialfile=f"ata_{self.turma.codigo}_bimestre_{bimestre}.docx",
                defaultextension=".docx",
                filetypes=[("Documento Word", "*.docx"), ("Todos", "*.*")],
            )

        def escolher_caminho_relatorio():
            return filedialog.asksaveasfilename(
                title="Salvar relatorio para professores",
                initialdir=data_dir("relatorios"),
                initialfile=f"relatorio_professores_{self.turma.codigo}_bim_{bimestre}.docx",
                defaultextension=".docx",
                filetypes=[("Documento Word", "*.docx"), ("Todos", "*.*")],
            )

        def abrir_finalizacao():
            salvar_encaminhamentos_atual()

            final = tk.Toplevel(dialog)
            final.title("Finalizar conselho")
            final.transient(dialog)
            final.grab_set()
            final.geometry("860x620")

            frame = ttk.Frame(final, padding=12)
            frame.grid(sticky="nsew")
            frame.columnconfigure(0, weight=1)
            frame.rowconfigure(4, weight=1)
            frame.rowconfigure(6, weight=1)

            gerar_ata_var = tk.BooleanVar(value=False)
            gerar_relatorio_var = tk.BooleanVar(value=False)
            caminho_ata_var = tk.StringVar()
            caminho_relatorio_var = tk.StringVar()

            ttk.Label(frame, text="Data do conselho (DD/MM/AAAA)").grid(row=0, column=0, sticky="w")
            ttk.Entry(frame, textvariable=self.data_conselho_var, width=16).grid(row=1, column=0, sticky="w", pady=(4, 0))

            def texto_atual():
                return self._texto_ata_para_edicao(
                    bimestre,
                    data_conselho=self._obter_data_conselho_atual(silencioso=True) or date.today(),
                )

            cabecalho_inicial = texto_atual()
            texto_cabecalho_ata = tk.Text(frame, height=6, wrap="word")
            texto_corpo_ata = tk.Text(frame, height=12, wrap="word")

            ttk.Label(frame, text="Cabeçalho dinâmico da abertura").grid(row=2, column=0, sticky="w", pady=(10, 0))
            texto_cabecalho_ata.grid(row=3, column=0, sticky="nsew", pady=(4, 0))
            texto_cabecalho_ata.insert("1.0", cabecalho_inicial["cabecalho"])

            topo_texto = ttk.Frame(frame)
            topo_texto.grid(row=4, column=0, sticky="ew", pady=(10, 0))
            topo_texto.columnconfigure(0, weight=1)
            ttk.Label(topo_texto, text="Texto-base do conselho").grid(row=0, column=0, sticky="w")
            ttk.Button(
                topo_texto,
                text="Restaurar texto padrao",
                command=lambda: restaurar_texto_padrao(),
            ).grid(row=0, column=1, sticky="e")

            texto_corpo_ata.grid(row=5, column=0, sticky="nsew", pady=(4, 0))
            texto_corpo_ata.insert("1.0", cabecalho_inicial["corpo"])

            docs_box = ttk.LabelFrame(frame, text="Documentacao", padding=8)
            docs_box.grid(row=6, column=0, sticky="nsew", pady=(12, 0))
            docs_box.columnconfigure(1, weight=1)

            def agendar_salvar_texto(_event=None):
                if estado["salvando_texto_ata"]:
                    return
                if estado["agendamento_texto_ata"] is not None:
                    final.after_cancel(estado["agendamento_texto_ata"])
                estado["agendamento_texto_ata"] = final.after(400, salvar_texto_digitado)

            def salvar_texto_digitado():
                estado["agendamento_texto_ata"] = None
                estado["salvando_texto_ata"] = True
                try:
                    salvar_texto_ata_atual(
                        texto_cabecalho_ata.get("1.0", "end").strip(),
                        texto_corpo_ata.get("1.0", "end").strip(),
                    )
                finally:
                    estado["salvando_texto_ata"] = False

            def restaurar_texto_padrao():
                data_conselho = self._obter_data_conselho_atual(silencioso=True) or date.today()
                texto = self._texto_ata_sugerido(bimestre, data_conselho=data_conselho)
                texto_cabecalho_ata.delete("1.0", "end")
                texto_cabecalho_ata.insert("1.0", texto["cabecalho"])
                texto_corpo_ata.delete("1.0", "end")
                texto_corpo_ata.insert("1.0", texto["corpo"])
                salvar_texto_digitado()

            def selecionar_ata():
                if gerar_ata_var.get():
                    caminho = escolher_caminho_ata()
                    if caminho:
                        caminho_ata_var.set(caminho)
                    else:
                        gerar_ata_var.set(False)
                        caminho_ata_var.set("")
                else:
                    caminho_ata_var.set("")

            def selecionar_relatorio():
                if gerar_relatorio_var.get():
                    caminho = escolher_caminho_relatorio()
                    if caminho:
                        caminho_relatorio_var.set(caminho)
                    else:
                        gerar_relatorio_var.set(False)
                        caminho_relatorio_var.set("")
                else:
                    caminho_relatorio_var.set("")

            ttk.Checkbutton(
                docs_box,
                text="Gerar ata deste conselho",
                variable=gerar_ata_var,
                command=selecionar_ata,
            ).grid(row=0, column=0, sticky="w")
            ttk.Label(docs_box, textvariable=caminho_ata_var).grid(row=0, column=1, sticky="w", padx=(8, 0))

            ttk.Checkbutton(
                docs_box,
                text="Gerar relatorio de encaminhamento aos professores",
                variable=gerar_relatorio_var,
                command=selecionar_relatorio,
            ).grid(row=1, column=0, sticky="w", pady=(8, 0))
            ttk.Label(docs_box, textvariable=caminho_relatorio_var, wraplength=420).grid(
                row=1, column=1, sticky="w", padx=(8, 0), pady=(8, 0)
            )

            texto_cabecalho_ata.bind("<KeyRelease>", agendar_salvar_texto)
            texto_corpo_ata.bind("<KeyRelease>", agendar_salvar_texto)

            botoes = ttk.Frame(frame)
            botoes.grid(row=7, column=0, sticky="e", pady=(12, 0))

            def retornar():
                if estado["agendamento_texto_ata"] is not None:
                    final.after_cancel(estado["agendamento_texto_ata"])
                    estado["agendamento_texto_ata"] = None
                salvar_texto_digitado()
                final.destroy()

            def finalizar():
                if estado["agendamento_texto_ata"] is not None:
                    final.after_cancel(estado["agendamento_texto_ata"])
                    estado["agendamento_texto_ata"] = None

                data_conselho = self._obter_data_conselho_atual(silencioso=True)
                if data_conselho is None:
                    messagebox.showwarning("Data", "Use o formato DD/MM/AAAA para a data do conselho.")
                    return

                salvar_encaminhamentos_atual()
                salvar_texto_digitado()

                if not gerar_ata_var.get() and not gerar_relatorio_var.get():
                    continuar = messagebox.askyesno(
                        "Finalizar sem documentos",
                        (
                            "Nenhuma documentacao foi marcada para geracao.\n\n"
                            "Deseja finalizar o conselho mesmo assim?"
                        ),
                    )
                    if not continuar:
                        return

                if gerar_ata_var.get() and not caminho_ata_var.get().strip():
                    messagebox.showwarning("Ata", "Selecione o local para salvar a ata.")
                    return
                if gerar_relatorio_var.get() and not caminho_relatorio_var.get().strip():
                    messagebox.showwarning("Relatorio", "Selecione o local para salvar o relatorio.")
                    return

                if gerar_ata_var.get():
                    caminho = self._gerar_ata_bimestre_com_caminho(
                        bimestre,
                        caminho_destino=caminho_ata_var.get().strip(),
                        data_conselho=data_conselho,
                    )
                    if not caminho:
                        return

                if gerar_relatorio_var.get():
                    caminho = self._gerar_relatorio_bimestre_com_caminho(
                        bimestre,
                        caminho_destino=caminho_relatorio_var.get().strip(),
                    )
                    if not caminho:
                        return

                final.destroy()
                dialog.destroy()
                messagebox.showinfo("Conselho", "Conselho finalizado com sucesso.")

            ttk.Button(botoes, text="Retornar ao conselho", command=retornar).grid(row=0, column=0, padx=(0, 8))
            ttk.Button(botoes, text="Finalizar", command=finalizar).grid(row=0, column=1)

            self._ajustar_dialogo_ao_conteudo(final, largura_min=860, altura_min=620, redimensionavel=True)

        def fechar_conselho():
            salvar_encaminhamentos_atual()
            dialog.destroy()

        dialog.protocol("WM_DELETE_WINDOW", fechar_conselho)

        def editar_media_disciplina():
            selecionado = tree_notas.focus()
            if not selecionado:
                messagebox.showwarning("Conselho", "Selecione uma disciplina para ajustar a media.")
                return

            valores = tree_notas.item(selecionado, "values")
            if not valores:
                return

            disciplina = valores[0]
            aluno = alunos[estado["idx"]]
            media_original = getattr(aluno, "medias", {}).get(bimestre, {}).get(disciplina)
            ajuste_atual = _ajustes_media(aluno).get(disciplina, {})

            editor = tk.Toplevel(dialog)
            editor.title("Ajustar media do conselho")
            editor.transient(dialog)
            editor.grab_set()
            editor.resizable(False, False)

            frame = ttk.Frame(editor, padding=12)
            frame.grid(sticky="nsew")
            frame.columnconfigure(1, weight=1)

            media_var = tk.StringVar(
                value=""
                if ajuste_atual.get("media_ajustada") is None
                else f"{ajuste_atual['media_ajustada']:.1f}"
            )

            ttk.Label(frame, text="Disciplina").grid(row=0, column=0, sticky="w")
            ttk.Label(frame, text=disciplina).grid(row=0, column=1, sticky="w")

            ttk.Label(frame, text="Media original").grid(row=1, column=0, sticky="w", pady=(8, 0))
            ttk.Label(frame, text=f"{media_original:.1f}").grid(row=1, column=1, sticky="w", pady=(8, 0))

            ttk.Label(frame, text="Media ajustada no conselho").grid(row=2, column=0, sticky="w", pady=(8, 0))
            ttk.Entry(frame, textvariable=media_var, width=12).grid(row=2, column=1, sticky="w", pady=(8, 0))

            ttk.Label(
                frame,
                text="Observacao para o relatorio / lancamento manual",
            ).grid(row=3, column=0, columnspan=2, sticky="w", pady=(8, 0))
            texto_obs = tk.Text(frame, height=4, width=48, wrap="word")
            texto_obs.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(4, 0))
            texto_obs.insert("1.0", ajuste_atual.get("observacao", ""))

            ttk.Label(
                frame,
                text="A media ajustada precisa ser registrada manualmente depois na Sala do Futuro.",
                foreground="#7a3d00",
            ).grid(row=5, column=0, columnspan=2, sticky="w", pady=(8, 0))

            botoes = ttk.Frame(frame)
            botoes.grid(row=6, column=0, columnspan=2, sticky="e", pady=(12, 0))

            def confirmar():
                bruto = media_var.get().strip().replace(",", ".")
                observacao = texto_obs.get("1.0", "end").strip()
                if not bruto:
                    messagebox.showwarning("Conselho", "Informe a media ajustada ou use 'Remover ajuste'.")
                    return
                try:
                    media_ajustada = float(bruto)
                except ValueError:
                    messagebox.showwarning("Conselho", "Use um numero valido para a media ajustada.")
                    return
                if media_ajustada < 0 or media_ajustada > 10:
                    messagebox.showwarning("Conselho", "A media ajustada deve ficar entre 0 e 10.")
                    return

                salvar_ajuste_media_atual(disciplina, media_original, media_ajustada, observacao)
                carregar_aluno()
                editor.destroy()

            def remover():
                salvar_ajuste_media_atual(disciplina, media_original, None, "")
                carregar_aluno()
                editor.destroy()

            ttk.Button(botoes, text="Salvar ajuste", command=confirmar).grid(row=0, column=0, padx=(0, 8))
            ttk.Button(botoes, text="Remover ajuste", command=remover).grid(row=0, column=1, padx=(0, 8))
            ttk.Button(botoes, text="Cancelar", command=editor.destroy).grid(row=0, column=2)

            self._ajustar_dialogo_ao_conteudo(editor, largura_min=520, altura_min=320, redimensionavel=False)
            editor.wait_visibility()
            editor.focus_force()

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
                ajuste = _ajustes_media(aluno).get(disciplina, {})
                media_ajustada = ajuste.get("media_ajustada")
                media_vigente = _media_vigente(aluno, disciplina, media)
                situacao, tag_base = _classificar_media(media_vigente)
                tag = "ajustada" if media_ajustada is not None else tag_base
                ordem = 0 if media_vigente < nota_minima else 1 if media_vigente == nota_minima else 2
                linhas_notas.append(
                    (
                        ordem,
                        disciplina,
                        media,
                        media_ajustada,
                        situacao,
                        tag,
                    )
                )

            linhas_notas.sort(key=lambda x: (x[0], x[1]))
            for _, disciplina, media, media_ajustada, situacao, tag in linhas_notas:
                tree_notas.insert(
                    "", "end",
                    values=(
                        disciplina,
                        f"{media:.1f}",
                        "" if media_ajustada is None else f"{media_ajustada:.1f}",
                        situacao,
                    ),
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

        ttk.Button(controle, text="Aluno anterior", command=lambda: proximo(-1)).grid(
            row=0, column=0, sticky="ew", padx=(0, 6)
        )
        ttk.Button(controle, text="Proximo aluno", command=lambda: proximo(1)).grid(
            row=0, column=1, sticky="ew", padx=(6, 6)
        )
        ttk.Button(
            controle,
            text="Concluir conselho e gerar documentacao",
            command=abrir_finalizacao,
        ).grid(row=0, column=2, sticky="ew", padx=(6, 0))

        ttk.Button(
            botoes_notas,
            text="Ajustar media selecionada",
            command=editar_media_disciplina,
        ).grid(row=0, column=0, sticky="w")

        carregar_aluno()
        tree_notas.bind("<Double-1>", lambda _e: editar_media_disciplina())
        dialog.bind("<Left>", lambda _e: proximo(-1))
        dialog.bind("<Right>", lambda _e: proximo(1))
        self._ajustar_dialogo_ao_conteudo(dialog, largura_min=980, altura_min=720, redimensionavel=True)
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
            try:
                self._criar_turma_por_dados(
                    ciclo_var.get(),
                    serie_var.get(),
                    letra_var.get(),
                    sala_var.get(),
                    periodo_var.get(),
                    ano_var.get(),
                    csv_var.get(),
                )
                messagebox.showinfo("Criar turma", "Turma criada com sucesso.")
                dialog.destroy()
            except ValueError as exc:
                messagebox.showwarning("Criar turma", str(exc))
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

        ttk.Label(frame, text="Numero da sala").grid(row=3, column=0, sticky="w", pady=(8, 0))
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
        self._ajustar_dialogo_ao_conteudo(dialog, largura_min=680, altura_min=420, redimensionavel=False)

    def _abrir_wizard_primeiros_passos(self):
        dialog = tk.Toplevel(self)
        dialog.title("Primeiros passos")
        dialog.transient(self)
        dialog.grab_set()

        root = ttk.Frame(dialog, padding=18, style="Surface.TFrame")
        root.grid(sticky="nsew")
        root.columnconfigure(0, weight=1)

        ttk.Label(root, text="Assistente inicial", style="SectionTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            root,
            text=(
                "Configure os dados basicos do aplicativo e, se quiser, ja crie a primeira turma "
                "para comecar a usar o sistema."
            ),
            style="SurfaceMuted.TLabel",
            wraplength=720,
        ).grid(row=1, column=0, sticky="w", pady=(4, 14))

        etapa1 = ttk.LabelFrame(root, text="1. Configuracoes iniciais", padding=12)
        etapa1.grid(row=2, column=0, sticky="ew")
        etapa1.columnconfigure(1, weight=1)

        nota_var = tk.StringVar(value=self.nota_minima_var.get() or "5.0")
        nome_direcao_inicial, pronome_direcao_inicial = Configuracao.obter_direcao()
        if nome_direcao_inicial == Configuracao.DIRECAO_PADRAO:
            nome_direcao_inicial = ""
        direcao_nome_var = tk.StringVar(value=nome_direcao_inicial)
        direcao_pronome_var = tk.StringVar(value=pronome_direcao_inicial)

        ttk.Label(etapa1, text="Nota minima").grid(row=0, column=0, sticky="w")
        ttk.Entry(etapa1, textvariable=nota_var, width=12).grid(row=0, column=1, sticky="w")
        ttk.Label(etapa1, text="Nome da direcao").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(etapa1, textvariable=direcao_nome_var).grid(row=1, column=1, sticky="ew", pady=(8, 0))
        ttk.Label(etapa1, text="Pronome").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Combobox(
            etapa1,
            textvariable=direcao_pronome_var,
            values=("F", "M"),
            state="readonly",
            width=8,
        ).grid(row=2, column=1, sticky="w", pady=(8, 0))

        etapa2 = ttk.LabelFrame(root, text="2. Primeira turma", padding=12)
        etapa2.grid(row=3, column=0, sticky="ew", pady=(12, 0))
        etapa2.columnconfigure(1, weight=1)

        ciclo_var = tk.StringVar(value="EM")
        serie_var = tk.StringVar(value=series_por_ciclo("EM")[0])
        letra_var = tk.StringVar(value="A")
        sala_var = tk.StringVar()
        periodo_var = tk.StringVar(value=PERIODOS[0])
        ano_var = tk.StringVar(value=str(datetime.now().year))
        csv_var = tk.StringVar()
        codigo_preview_var = tk.StringVar()

        def atualizar_series_wizard(_event=None):
            valores = series_por_ciclo(ciclo_var.get())
            combo_serie["values"] = valores
            if serie_var.get() not in valores:
                serie_var.set(valores[0])
            codigo_preview_var.set(self._codigo_turma(serie_var.get(), letra_var.get() or "A", ciclo_var.get()))

        def atualizar_codigo_wizard(_event=None):
            codigo_preview_var.set(self._codigo_turma(serie_var.get(), letra_var.get() or "A", ciclo_var.get()))

        ttk.Label(etapa2, text="Ciclo").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            etapa2,
            textvariable=ciclo_var,
            values=tuple(CICLOS.keys()),
            state="readonly",
            width=12,
        ).grid(row=0, column=1, sticky="w")
        etapa2.winfo_children()[-1].bind("<<ComboboxSelected>>", atualizar_series_wizard)

        ttk.Label(etapa2, text="Serie").grid(row=1, column=0, sticky="w", pady=(8, 0))
        combo_serie = ttk.Combobox(
            etapa2,
            textvariable=serie_var,
            values=series_por_ciclo(ciclo_var.get()),
            state="readonly",
            width=20,
        )
        combo_serie.grid(row=1, column=1, sticky="w", pady=(8, 0))
        combo_serie.bind("<<ComboboxSelected>>", atualizar_codigo_wizard)

        ttk.Label(etapa2, text="Turma").grid(row=2, column=0, sticky="w", pady=(8, 0))
        entry_letra = ttk.Entry(etapa2, textvariable=letra_var, width=6)
        entry_letra.grid(row=2, column=1, sticky="w", pady=(8, 0))
        entry_letra.bind("<KeyRelease>", atualizar_codigo_wizard)

        ttk.Label(etapa2, text="Numero da sala").grid(row=3, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(etapa2, textvariable=sala_var, width=12).grid(row=3, column=1, sticky="w", pady=(8, 0))

        ttk.Label(etapa2, text="Periodo").grid(row=4, column=0, sticky="w", pady=(8, 0))
        ttk.Combobox(
            etapa2,
            textvariable=periodo_var,
            values=PERIODOS,
            state="readonly",
            width=20,
        ).grid(row=4, column=1, sticky="w", pady=(8, 0))

        ttk.Label(etapa2, text="Ano letivo").grid(row=5, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(etapa2, textvariable=ano_var, width=12).grid(row=5, column=1, sticky="w", pady=(8, 0))

        ttk.Label(etapa2, text="CSV de alunos").grid(row=6, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(etapa2, textvariable=csv_var, width=48).grid(row=6, column=1, sticky="ew", pady=(8, 0))
        ttk.Button(
            etapa2,
            text="Selecionar",
            command=lambda: self._selecionar_arquivo(csv_var, [("CSV", "*.csv"), ("Todos", "*.*")]),
        ).grid(row=6, column=2, padx=(8, 0), pady=(8, 0))

        ttk.Label(etapa2, text="Codigo gerado").grid(row=7, column=0, sticky="w", pady=(10, 0))
        ttk.Label(etapa2, textvariable=codigo_preview_var).grid(row=7, column=1, sticky="w", pady=(10, 0))
        atualizar_series_wizard()

        def salvar_configuracoes_basicas():
            valor = nota_var.get().strip().replace(",", ".")
            nome = direcao_nome_var.get().strip()
            pronome = direcao_pronome_var.get().strip().upper()
            if not nome:
                raise ValueError("Informe o nome da direcao.")
            if pronome not in {"F", "M"}:
                raise ValueError("Pronome invalido.")
            Configuracao.definir_nota_minima(float(valor))
            Configuracao.definir_direcao(nome, pronome)
            self._carregar_configuracoes()

        def salvar_sem_turma():
            try:
                salvar_configuracoes_basicas()
                messagebox.showinfo("Primeiros passos", "Configuracoes iniciais salvas.")
                dialog.destroy()
            except ValueError as exc:
                messagebox.showwarning("Primeiros passos", str(exc))
            except Exception as exc:
                messagebox.showerror("Erro", f"Nao foi possivel salvar as configuracoes:\n{exc}")

        def salvar_e_criar_turma():
            try:
                salvar_configuracoes_basicas()
                self._criar_turma_por_dados(
                    ciclo_var.get(),
                    serie_var.get(),
                    letra_var.get(),
                    sala_var.get(),
                    periodo_var.get(),
                    ano_var.get(),
                    csv_var.get(),
                )
                messagebox.showinfo("Primeiros passos", "Configuracoes salvas e primeira turma criada.")
                dialog.destroy()
            except ValueError as exc:
                messagebox.showwarning("Primeiros passos", str(exc))
            except Exception as exc:
                messagebox.showerror("Erro", f"Nao foi possivel concluir o assistente:\n{exc}")

        botoes = ttk.Frame(root, style="Surface.TFrame")
        botoes.grid(row=4, column=0, sticky="ew", pady=(16, 0))
        ttk.Button(botoes, text="Fechar", command=dialog.destroy).grid(row=0, column=0, sticky="w")
        ttk.Button(botoes, text="Salvar configuracoes", command=salvar_sem_turma).grid(
            row=0, column=1, sticky="e", padx=(8, 0)
        )
        ttk.Button(botoes, text="Salvar e criar primeira turma", style="Accent.TButton", command=salvar_e_criar_turma).grid(
            row=0, column=2, sticky="e", padx=(8, 0)
        )

        self._ajustar_dialogo_ao_conteudo(dialog, largura_min=820, altura_min=660, redimensionavel=True)

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
        self._ajustar_dialogo_ao_conteudo(dialog, largura_min=980, altura_min=640, redimensionavel=True)

    def _exigir_turma(self):
        if self.turma is None:
            messagebox.showwarning("Turma", "Abra uma turma antes de executar esta operacao.")
            return False
        return True

    def _obter_bimestre(self):
        entrada = self.bimestre_var.get().strip()
        entrada = PERIODO_POR_EXIBICAO.get(entrada, entrada)
        if not entrada:
            messagebox.showwarning("Bimestre", "Informe o bimestre.")
            return None
        try:
            bimestre = garantir_bimestre_operacional(entrada)
            self.bimestre_var.set(PERIODO_EXIBICAO.get(bimestre, bimestre))
            return bimestre
        except ValueError as exc:
            messagebox.showwarning("Bimestre", str(exc))
            return None

    def _abrir_dialogo_atualizar_turma_csv(self):
        if not self._exigir_turma():
            return

        dialog = tk.Toplevel(self)
        dialog.title("Atualizar turma por CSV")
        dialog.transient(self)
        dialog.grab_set()
        dialog.resizable(False, False)

        frame = ttk.Frame(dialog, padding=12)
        frame.grid(sticky="nsew")
        frame.columnconfigure(1, weight=1)

        caminho_var = tk.StringVar(value=self.csv_update_var.get().strip())
        ttk.Label(frame, text="CSV atualizado").grid(row=0, column=0, sticky="w")
        ttk.Entry(frame, textvariable=caminho_var, width=54).grid(row=0, column=1, sticky="ew")
        ttk.Button(
            frame,
            text="Selecionar",
            command=lambda: self._selecionar_arquivo(
                caminho_var,
                [("CSV", "*.csv"), ("Todos", "*.*")],
            ),
        ).grid(row=0, column=2, padx=(8, 0))

        botoes = ttk.Frame(frame)
        botoes.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        botoes.columnconfigure((0, 1), weight=1)

        def confirmar():
            caminho_csv = caminho_var.get().strip()
            if not caminho_csv:
                messagebox.showwarning("CSV", "Informe o caminho do CSV atualizado.")
                return
            try:
                AtualizadorTurma.atualizar_turma(self.turma, caminho_csv)
                self.csv_update_var.set(caminho_csv)
                self._salvar_turma()
                messagebox.showinfo("Turma", "Turma atualizada com sucesso.")
                dialog.destroy()
            except Exception as exc:
                messagebox.showerror("Erro", f"Falha ao atualizar turma:\n{exc}")

        ttk.Button(botoes, text="Atualizar", command=confirmar).grid(row=0, column=0, sticky="ew", padx=(0, 6))
        ttk.Button(botoes, text="Cancelar", command=dialog.destroy).grid(
            row=0, column=1, sticky="ew", padx=(6, 0)
        )
        self._ajustar_dialogo_ao_conteudo(dialog, largura_min=760, altura_min=180, redimensionavel=False)

    def _abrir_dialogo_importar_mapoes(self, callback_sucesso=None):
        if not self._exigir_turma():
            return

        dialog = tk.Toplevel(self)
        dialog.title("Importar mapoes")
        dialog.transient(self)
        dialog.grab_set()
        dialog.resizable(False, False)

        frame = ttk.Frame(dialog, padding=12)
        frame.grid(sticky="nsew")
        frame.columnconfigure(1, weight=1)

        periodo_atual = PERIODO_POR_EXIBICAO.get(self.bimestre_var.get().strip(), "")
        bimestre_inicial = periodo_atual if periodo_atual in {"1", "2", "3", "4"} else "1"
        bimestre_var = tk.StringVar(value=PERIODO_EXIBICAO[bimestre_inicial])
        mapao_fgb_var = tk.StringVar(value=self.mapao_fgb_var.get().strip())
        mapao_if_var = tk.StringVar(value=self.mapao_if_var.get().strip())

        ttk.Label(frame, text="Bimestre").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            frame,
            textvariable=bimestre_var,
            values=BIMESTRE_EXIBICAO,
            state="readonly",
            width=24,
        ).grid(row=0, column=1, sticky="w")

        ttk.Label(frame, text="Mapao FGB (.xlsx)").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(frame, textvariable=mapao_fgb_var, width=54).grid(row=1, column=1, sticky="ew", pady=(8, 0))
        ttk.Button(
            frame,
            text="Selecionar",
            command=lambda: self._selecionar_arquivo(
                mapao_fgb_var,
                [("Excel", "*.xlsx"), ("Todos", "*.*")],
            ),
        ).grid(row=1, column=2, padx=(8, 0), pady=(8, 0))

        ttk.Label(frame, text="Mapao IF (.xlsx) opcional").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(frame, textvariable=mapao_if_var, width=54).grid(row=2, column=1, sticky="ew", pady=(8, 0))
        ttk.Button(
            frame,
            text="Selecionar",
            command=lambda: self._selecionar_arquivo(
                mapao_if_var,
                [("Excel", "*.xlsx"), ("Todos", "*.*")],
            ),
        ).grid(row=2, column=2, padx=(8, 0), pady=(8, 0))

        botoes = ttk.Frame(frame)
        botoes.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(12, 0))
        botoes.columnconfigure((0, 1), weight=1)

        def confirmar():
            bimestre_sel = PERIODO_POR_EXIBICAO.get(bimestre_var.get().strip(), "")
            self.bimestre_var.set(PERIODO_EXIBICAO.get(bimestre_sel, bimestre_var.get().strip()))
            sucesso = self._importar_mapoes(
                bimestre=bimestre_sel,
                caminho_fgb=mapao_fgb_var.get().strip(),
                caminho_if=mapao_if_var.get().strip(),
                callback_sucesso=callback_sucesso,
            )
            if sucesso:
                self.mapao_fgb_var.set(mapao_fgb_var.get().strip())
                self.mapao_if_var.set(mapao_if_var.get().strip())
                dialog.destroy()

        ttk.Button(botoes, text="Importar", command=confirmar).grid(row=0, column=0, sticky="ew", padx=(0, 6))
        ttk.Button(botoes, text="Cancelar", command=dialog.destroy).grid(
            row=0, column=1, sticky="ew", padx=(6, 0)
        )
        self._ajustar_dialogo_ao_conteudo(dialog, largura_min=820, altura_min=260, redimensionavel=False)

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

    def _importar_mapoes(self, bimestre=None, caminho_fgb=None, caminho_if=None, callback_sucesso=None):
        if not self._exigir_turma():
            return False

        bimestre = bimestre or self._obter_bimestre()
        if not bimestre:
            return False

        caminho_fgb = (caminho_fgb or self.mapao_fgb_var.get().strip()).strip()
        caminho_if = (caminho_if or self.mapao_if_var.get().strip()).strip()
        if not caminho_fgb:
            messagebox.showwarning("Mapao", "Informe o caminho do mapao FGB.")
            return False

        try:
            ImportadorMapao.importar(caminho_fgb, self.turma, bimestre)
            if caminho_if:
                ImportadorMapao.importar(caminho_if, self.turma, bimestre)
            self._salvar_turma()
            if callback_sucesso is not None:
                callback_sucesso()
            messagebox.showinfo("Mapao", "Mapoes importados com sucesso.")
            return True
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao importar mapao:\n{exc}")
            return False

    def _gerar_relatorio(self):
        if not self._exigir_turma():
            return
        bimestre = self._obter_bimestre()
        if not bimestre:
            return
        self._gerar_relatorio_bimestre(bimestre)

    def _gerar_relatorio_bimestre(self, bimestre):
        return self._gerar_relatorio_bimestre_com_caminho(bimestre)

    def _gerar_relatorio_bimestre_com_caminho(self, bimestre, caminho_destino=None):
        if not self._exigir_turma():
            return None
        caminho_sugerido = f"relatorio_professores_{self.turma.codigo}_bim_{bimestre}.docx"
        caminho = caminho_destino
        if not caminho:
            caminho = filedialog.asksaveasfilename(
                title="Salvar relatorio para professores",
                initialdir=data_dir("relatorios"),
                initialfile=caminho_sugerido,
                defaultextension=".docx",
                filetypes=[("Documento Word", "*.docx"), ("Todos", "*.*")],
            )
        if not caminho:
            return None

        try:
            caminho = GeradorRelatorioProfessores.gerar(self.turma, bimestre, caminho_saida=caminho)
            messagebox.showinfo("Relatorio", f"Relatorio gerado em:\n{caminho}")
            return caminho
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao gerar relatorio:\n{exc}")
            return None

    def _gerar_ata_bimestre(self, bimestre):
        return self._gerar_ata_bimestre_com_caminho(bimestre)

    def _gerar_ata_bimestre_com_caminho(self, bimestre, caminho_destino=None, data_conselho=None):
        if not self._exigir_turma():
            return None

        if data_conselho is None:
            data_texto = self.data_conselho_var.get().strip()
            data_conselho = date.today()
            if data_texto:
                try:
                    data_conselho = datetime.strptime(data_texto, "%d/%m/%Y").date()
                except ValueError:
                    messagebox.showwarning("Data", "Use o formato DD/MM/AAAA para a data do conselho.")
                    return None

        caminho_sugerido = f"ata_{self.turma.codigo}_bimestre_{bimestre}.docx"
        if not caminho_destino:
            caminho_destino = filedialog.asksaveasfilename(
                title="Salvar ata do conselho",
                initialdir=data_dir("atas"),
                initialfile=caminho_sugerido,
                defaultextension=".docx",
                filetypes=[("Documento Word", "*.docx"), ("Todos", "*.*")],
            )
        if not caminho_destino:
            return None

        try:
            texto_ata = self._texto_ata_para_edicao(bimestre, data_conselho=data_conselho)
            caminho = GeradorAta.gerar(
                self.turma,
                bimestre,
                data_conselho=data_conselho,
                confirmar_continuacao=self._confirmar_continuacao_ata,
                log=self._log,
                caminho_saida=caminho_destino,
                intro_cabecalho=texto_ata["cabecalho"],
                intro_corpo=texto_ata["corpo"],
            )
            if caminho:
                messagebox.showinfo("Ata", f"Ata gerada em:\n{caminho}")
            return caminho
        except Exception as exc:
            messagebox.showerror("Erro", f"Falha ao gerar ata:\n{exc}")
            return None

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

    def _verificar_atualizacoes(self):
        info = check_for_updates(APP_VERSION)
        if not info.get("ok"):
            messagebox.showwarning("Atualizacoes", info.get("error", "Falha desconhecida."))
            return

        if info.get("update_available"):
            latest_tag = info.get("latest_tag") or info.get("latest_version")
            msg = (
                f"Nova versao disponivel: {latest_tag}\n"
                f"Versao atual: v{APP_VERSION}\n\n"
                "Deseja abrir a pagina de release para atualizar?"
            )
            if messagebox.askyesno("Atualizacoes", msg):
                open_release_page(info.get("release_url"))
            return

        messagebox.showinfo(
            "Atualizacoes",
            f"Voce ja esta na versao mais recente (v{APP_VERSION}).",
        )

    def _mostrar_sobre(self):
        mensagem = (
            f"{APP_NAME}\n"
            f"Versao: v{APP_VERSION}\n\n"
            "Aplicativo para apoiar a coordenacao pedagogica na gestao de turmas,\n"
            "importacao de mapoes e geracao de ata/relatorios por bimestre.\n\n"
            f"Codigo-fonte: {REPO_URL}\n"
            "Licenca: GPL-3.0"
        )
        if messagebox.askyesno("Sobre", f"{mensagem}\n\nAbrir repositorio no GitHub?"):
            open_release_page(REPO_URL)
