"""MegaCleaner Network — LAN discovery and file sharing."""

from __future__ import annotations

import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .discovery import DiscoveryService, periodic_scan
from .file_server import FileServer, try_add_firewall_rule
from .protocol import Peer


class NetworkApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("MegaCleaner — Локальная сеть")
        self.root.geometry("720x520")
        self.root.minsize(600, 420)

        self._peers: dict[str, Peer] = {}
        self._file_server: FileServer | None = None
        self._share_dir: Path | None = None
        self._scan_stop = threading.Event()

        self._discovery = DiscoveryService(on_peer=self._on_peer_found)
        self._build_ui()
        self._discovery.start()
        self._start_auto_scan()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        header = ttk.Frame(self.root, padding=12)
        header.pack(fill=tk.X)

        ttk.Label(
            header,
            text="Компьютеры в локальной сети",
            font=("Segoe UI", 14, "bold"),
        ).pack(anchor=tk.W)
        ttk.Label(
            header,
            text=f"Этот ПК: {self._discovery.hostname} ({self._discovery.local_ip})",
        ).pack(anchor=tk.W, pady=(4, 0))

        toolbar = ttk.Frame(self.root, padding=(12, 0, 12, 8))
        toolbar.pack(fill=tk.X)
        ttk.Button(toolbar, text="Обновить список", command=self._scan_now).pack(side=tk.LEFT)
        ttk.Button(toolbar, text="Открыть в браузере", command=self._open_in_browser).pack(
            side=tk.LEFT, padx=(8, 0)
        )

        list_frame = ttk.Frame(self.root, padding=(12, 0, 12, 8))
        list_frame.pack(fill=tk.BOTH, expand=True)

        columns = ("hostname", "ip", "role", "url")
        self.tree = ttk.Treeview(list_frame, columns=columns, show="headings", height=12)
        self.tree.heading("hostname", text="Имя ПК")
        self.tree.heading("ip", text="IP-адрес")
        self.tree.heading("role", text="Роль")
        self.tree.heading("url", text="Ссылка")
        self.tree.column("hostname", width=160)
        self.tree.column("ip", width=130)
        self.tree.column("role", width=100)
        self.tree.column("url", width=260)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scroll = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.tree.yview)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.configure(yscrollcommand=scroll.set)

        source_frame = ttk.LabelFrame(self.root, text="ПК-источник (раздача файлов)", padding=12)
        source_frame.pack(fill=tk.X, padx=12, pady=(0, 8))

        path_row = ttk.Frame(source_frame)
        path_row.pack(fill=tk.X)
        ttk.Label(path_row, text="Папка:").pack(side=tk.LEFT)
        self.path_var = tk.StringVar(value="Выберите папку с образом или файлами...")
        ttk.Entry(path_row, textvariable=self.path_var, state="readonly").pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=8
        )
        ttk.Button(path_row, text="Обзор...", command=self._pick_folder).pack(side=tk.LEFT)

        btn_row = ttk.Frame(source_frame)
        btn_row.pack(fill=tk.X, pady=(10, 0))
        ttk.Button(btn_row, text="Стать источником", command=self._become_source).pack(side=tk.LEFT)
        ttk.Button(btn_row, text="Остановить раздачу", command=self._stop_source).pack(
            side=tk.LEFT, padx=(8, 0)
        )

        self.status_var = tk.StringVar(value="Поиск компьютеров в сети...")
        ttk.Label(self.root, textvariable=self.status_var, padding=12).pack(anchor=tk.W)

        self._add_self_to_list()

    def _add_self_to_list(self) -> None:
        self._upsert_peer(
            Peer(self._discovery.hostname, self._discovery.local_ip, is_source=False),
            is_self=True,
        )

    def _on_peer_found(self, peer: Peer) -> None:
        self.root.after(0, lambda: self._upsert_peer(peer))

    def _upsert_peer(self, peer: Peer, is_self: bool = False) -> None:
        key = peer.ip
        existing = self._peers.get(key)
        if existing and existing.is_source and not peer.is_source:
            peer = Peer(peer.hostname, peer.ip, is_source=True, http_port=existing.http_port)

        self._peers[key] = peer
        self._refresh_tree()

        if is_self:
            return
        label = "источник" if peer.is_source else "клиент"
        self.status_var.set(f"Найден: {peer.hostname} ({peer.ip}) — {label}")

    def _refresh_tree(self) -> None:
        for item in self.tree.get_children():
            self.tree.delete(item)

        local_ip = self._discovery.local_ip
        sorted_peers = sorted(
            self._peers.values(),
            key=lambda p: (p.ip != local_ip, p.hostname.lower()),
        )

        for peer in sorted_peers:
            is_self = peer.ip == local_ip
            name = f"{peer.hostname} (этот ПК)" if is_self else peer.hostname
            role = "Источник" if peer.is_source else "Клиент"
            url = ""
            if peer.is_source and peer.http_port:
                url = f"http://{peer.ip}:{peer.http_port}/"
            self.tree.insert("", tk.END, values=(name, peer.ip, role, url))

    def _scan_now(self) -> None:
        self.status_var.set("Сканирование сети...")
        self._discovery.scan()

    def _start_auto_scan(self) -> None:
        thread = threading.Thread(
            target=periodic_scan,
            args=(self._discovery, 5.0, self._scan_stop),
            daemon=True,
        )
        thread.start()
        self._scan_now()

    def _pick_folder(self) -> None:
        folder = filedialog.askdirectory(title="Папка для раздачи по сети")
        if folder:
            self._share_dir = Path(folder)
            self.path_var.set(str(self._share_dir))

    def _become_source(self) -> None:
        if not self._share_dir or not self._share_dir.is_dir():
            messagebox.showwarning("Папка не выбрана", "Сначала выберите папку с файлами или образом.")
            return

        if self._file_server and self._file_server.is_running:
            messagebox.showinfo("Уже работает", "Раздача уже запущена на этом ПК.")
            return

        port = 8765
        self._file_server = FileServer(self._share_dir, port=port)
        try:
            self._file_server.start()
        except OSError as exc:
            messagebox.showerror("Ошибка", f"Не удалось запустить сервер:\n{exc}")
            self._file_server = None
            return

        ok, fw_msg = try_add_firewall_rule(port)
        self._discovery.announce_source(port)
        self._upsert_peer(
            Peer(
                self._discovery.hostname,
                self._discovery.local_ip,
                is_source=True,
                http_port=port,
            ),
            is_self=True,
        )

        url = self._file_server.url(self._discovery.local_ip)
        msg = f"Раздача запущена:\n{url}"
        if not ok:
            msg += f"\n\n{fw_msg}"
        self.status_var.set(f"Источник активен: {url}")
        messagebox.showinfo("Источник запущен", msg)

    def _stop_source(self) -> None:
        if self._file_server:
            self._file_server.stop()
            self._file_server = None
        self._discovery.announce_stop_source()
        self._upsert_peer(
            Peer(self._discovery.hostname, self._discovery.local_ip, is_source=False),
            is_self=True,
        )
        self.status_var.set("Раздача остановлена")

    def _selected_peer(self) -> Peer | None:
        selection = self.tree.selection()
        if not selection:
            return None
        values = self.tree.item(selection[0], "values")
        ip = values[1]
        return self._peers.get(ip)

    def _open_in_browser(self) -> None:
        peer = self._selected_peer()
        if not peer:
            messagebox.showinfo("Выбор", "Выберите компьютер в списке.")
            return
        if not peer.is_source or not peer.http_port:
            messagebox.showinfo("Не источник", "Этот ПК не раздаёт файлы. Выберите источник.")
            return
        webbrowser.open(f"http://{peer.ip}:{peer.http_port}/")

    def _on_close(self) -> None:
        self._scan_stop.set()
        self._stop_source()
        self._discovery.stop()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    NetworkApp().run()


if __name__ == "__main__":
    main()
