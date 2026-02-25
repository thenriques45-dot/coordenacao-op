import os
from dataclasses import dataclass


@dataclass
class TurmaSession:
    turma: object
    caminho: str

    @property
    def key(self):
        return os.path.normcase(os.path.abspath(self.caminho))


class TurmaWindowRegistry:
    def __init__(self):
        self._windows = {}

    def get_window(self, session_key):
        win = self._windows.get(session_key)
        if win is not None and win.winfo_exists():
            return win
        if session_key in self._windows:
            del self._windows[session_key]
        return None

    def register(self, session_key, window):
        self._windows[session_key] = window

    def unregister(self, session_key):
        self._windows.pop(session_key, None)
