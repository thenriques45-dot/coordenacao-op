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
            return
