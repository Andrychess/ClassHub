"""Simple HTTP file server for sharing folders from the source PC."""

from __future__ import annotations

import functools
import http.server
import os
import socketserver
import threading
from pathlib import Path


class FileServer:
    def __init__(self, directory: Path, port: int = 8765) -> None:
        self.directory = directory.resolve()
        self.port = port
        self._httpd: socketserver.TCPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.is_running:
            return
        if not self.directory.is_dir():
            raise FileNotFoundError(f"Папка не найдена: {self.directory}")

        handler = functools.partial(
            http.server.SimpleHTTPRequestHandler,
            directory=str(self.directory),
        )
        self._httpd = socketserver.TCPServer(("0.0.0.0", self.port), handler)
        self._httpd.allow_reuse_address = True
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._httpd:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None
        self._thread = None

    def url(self, ip: str) -> str:
        return f"http://{ip}:{self.port}/"


def try_add_firewall_rule(port: int) -> tuple[bool, str]:
    """Add Windows Firewall rule (requires admin). Returns (success, message)."""
    rule_name = f"MegaCleaner HTTP {port}"
    cmd = (
        f'netsh advfirewall firewall add rule name="{rule_name}" '
        f"dir=in action=allow protocol=TCP localport={port}"
    )
    try:
        import subprocess

        result = subprocess.run(
            ["powershell", "-Command", cmd],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode == 0:
            return True, f"Правило брандмауэра добавлено (порт {port})"
        return False, "Не удалось открыть порт в брандмауэре. Запустите от администратора."
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
