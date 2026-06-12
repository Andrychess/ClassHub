"""UDP discovery for MegaCleaner peers on the local network."""

from __future__ import annotations

import socket
import threading
import time
from collections.abc import Callable

from .protocol import (
    MSG_DISCOVER,
    MSG_HELLO,
    MSG_SOURCE,
    MSG_STOP_SOURCE,
    PORT,
    Peer,
    get_broadcast_address,
    get_hostname,
    get_local_ip,
    parse_message,
)


class DiscoveryService:
    def __init__(self, on_peer: Callable[[Peer], None] | None = None) -> None:
        self._on_peer = on_peer
        self._hostname = get_hostname()
        self._local_ip = get_local_ip()
        self._is_source = False
        self._http_port: int | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._sock: socket.socket | None = None

    @property
    def local_ip(self) -> str:
        return self._local_ip

    @property
    def hostname(self) -> str:
        return self._hostname

    def set_source(self, http_port: int | None) -> None:
        self._is_source = http_port is not None
        self._http_port = http_port

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._listen, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._sock:
            try:
                self._sock.close()
            except OSError:
                pass

    def scan(self) -> None:
        self._send(MSG_DISCOVER)

    def announce_source(self, http_port: int) -> None:
        self.set_source(http_port)
        peer = Peer(self._hostname, self._local_ip, is_source=True, http_port=http_port)
        self._send(peer.to_source())

    def announce_stop_source(self) -> None:
        self.set_source(None)
        self._send(MSG_STOP_SOURCE)

    def _listen(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.bind(("", PORT))
        sock.settimeout(0.5)
        self._sock = sock

        while not self._stop.is_set():
            try:
                data, addr = sock.recvfrom(4096)
            except OSError:
                if self._stop.is_set():
                    break
                continue

            msg_type, peer = parse_message(data)
            if not msg_type:
                continue

            if msg_type == MSG_DISCOVER:
                self._reply_hello(sock, addr[0])
            elif msg_type in (MSG_HELLO, MSG_SOURCE) and peer:
                if peer.ip != self._local_ip and self._on_peer:
                    self._on_peer(peer)

    def _reply_hello(self, sock: socket.socket, target_ip: str) -> None:
        peer = Peer(
            self._hostname,
            self._local_ip,
            is_source=self._is_source,
            http_port=self._http_port,
        )
        payload = peer.to_hello().encode("utf-8")
        try:
            sock.sendto(payload, (target_ip, PORT))
        except OSError:
            pass

    def _send(self, payload: str) -> None:
        message = payload.encode("utf-8")
        if "|" not in payload:
            message = f"MEGACLEANER|1|{payload}".encode("utf-8")

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            sock.sendto(message, (get_broadcast_address(), PORT))
            sock.sendto(message, ("255.255.255.255", PORT))
        finally:
            sock.close()


def periodic_scan(service: DiscoveryService, interval: float, stop_event: threading.Event) -> None:
    while not stop_event.wait(interval):
        service.scan()
