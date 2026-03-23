import platform
from dataclasses import dataclass
from tkinter import ttk


@dataclass(frozen=True)
class PlatformUI:
    os_name: str
    open_shortcut_label: str
    quit_shortcut_label: str
    open_shortcut_event: str
    quit_shortcut_event: str
    preferred_themes: tuple[str, ...]


def detect_platform_ui() -> PlatformUI:
    system = platform.system().lower()

    if system == "darwin":
        return PlatformUI(
            os_name="macos",
            open_shortcut_label="Cmd+O",
            quit_shortcut_label="Cmd+Q",
            open_shortcut_event="<Command-o>",
            quit_shortcut_event="<Command-q>",
            preferred_themes=("aqua", "clam"),
        )

    if system == "windows":
        return PlatformUI(
            os_name="windows",
            open_shortcut_label="Ctrl+O",
            quit_shortcut_label="Ctrl+Q",
            open_shortcut_event="<Control-o>",
            quit_shortcut_event="<Control-q>",
            preferred_themes=("vista", "xpnative", "clam"),
        )

    return PlatformUI(
        os_name="linux",
        open_shortcut_label="Ctrl+O",
        quit_shortcut_label="Ctrl+Q",
        open_shortcut_event="<Control-o>",
        quit_shortcut_event="<Control-q>",
        preferred_themes=("clam", "alt", "default"),
    )


def apply_theme(platform_ui: PlatformUI) -> None:
    style = ttk.Style()
    available = set(style.theme_names())

    for theme in platform_ui.preferred_themes:
        if theme in available:
            style.theme_use(theme)
            break

    if platform_ui.os_name == "windows":
        font_family = "Segoe UI"
        palette = {
            "bg": "#f3f4f6",
            "surface": "#ffffff",
            "surface_alt": "#f8fafc",
            "border": "#d6d9df",
            "text": "#111827",
            "muted": "#5b6472",
            "accent": "#0f6cbd",
            "accent_soft": "#dbeafe",
        }
    elif platform_ui.os_name == "linux":
        font_family = "Cantarell"
        palette = {
            "bg": "#f6f5f4",
            "surface": "#ffffff",
            "surface_alt": "#fafafa",
            "border": "#d1d5db",
            "text": "#1f2937",
            "muted": "#6b7280",
            "accent": "#3584e4",
            "accent_soft": "#dbeafe",
        }
    else:
        font_family = "SF Pro Text"
        palette = {
            "bg": "#f5f5f7",
            "surface": "#ffffff",
            "surface_alt": "#fafafa",
            "border": "#d1d5db",
            "text": "#111827",
            "muted": "#6b7280",
            "accent": "#0a84ff",
            "accent_soft": "#dbeafe",
        }

    style.configure(".", font=(font_family, 10), foreground=palette["text"])
    style.configure("TFrame", background=palette["bg"])
    style.configure("App.TFrame", background=palette["bg"])
    style.configure("Surface.TFrame", background=palette["surface"])
    style.configure("Sidebar.TFrame", background=palette["surface_alt"])
    style.configure("TLabelframe", background=palette["surface"], bordercolor=palette["border"])
    style.configure("TLabelframe.Label", background=palette["surface"], foreground=palette["text"], font=(font_family, 10, "bold"))
    style.configure("TLabel", background=palette["bg"], foreground=palette["text"])
    style.configure("Surface.TLabel", background=palette["surface"], foreground=palette["text"])
    style.configure("Sidebar.TLabel", background=palette["surface_alt"], foreground=palette["text"])
    style.configure("Muted.TLabel", background=palette["bg"], foreground=palette["muted"])
    style.configure("SurfaceMuted.TLabel", background=palette["surface"], foreground=palette["muted"])
    style.configure("SidebarMuted.TLabel", background=palette["surface_alt"], foreground=palette["muted"])
    style.configure("HeroTitle.TLabel", background=palette["bg"], foreground=palette["text"], font=(font_family, 20, "bold"))
    style.configure("HeroSubtitle.TLabel", background=palette["bg"], foreground=palette["muted"], font=(font_family, 10))
    style.configure("SectionTitle.TLabel", background=palette["surface"], foreground=palette["text"], font=(font_family, 11, "bold"))
    style.configure("CardTitle.TLabel", background=palette["surface_alt"], foreground=palette["text"], font=(font_family, 10, "bold"))
    style.configure("StatusValue.TLabel", background=palette["surface_alt"], foreground=palette["text"], font=(font_family, 11, "bold"))
    style.configure("Accent.TButton", padding=(12, 8), font=(font_family, 10, "bold"))
    style.configure("TButton", padding=(10, 7))
    style.configure("TEntry", padding=6)
    style.configure("TCombobox", padding=4)
    style.configure("Treeview", rowheight=28, fieldbackground=palette["surface"], background=palette["surface"], foreground=palette["text"], bordercolor=palette["border"])
    style.configure("Treeview.Heading", font=(font_family, 10, "bold"))
    style.map("Treeview", background=[("selected", palette["accent_soft"])], foreground=[("selected", palette["text"])])
    style.configure("TSeparator", background=palette["border"])
