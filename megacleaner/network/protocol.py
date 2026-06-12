"""MegaCleaner LAN discovery protocol."""

from __future__ import annotations

import socket
from dataclasses import dataclass

PORT = 49500
MAGIC = "MEGACLEANER"
VERSION = "1"

MSG_DISCOVER = "DISCOVER"
MSG_HELLO = "HELLO"
MSG_SOURCE = "SOURCE"
MSG_STOP_SOURCE = "STOP_SOURCE"


@dataclass(frozen=True)
class Peer:
    hostname: str
    ip: str
    is_source: bool = False
    http_port: int | None = None

    @property
    def display_name(self) -> str:
        role = " [источник]" if self.is_source else ""
        return f"{self.hostname} ({self.ip}){role}"

    def to_hello(self) -> str:
        source_flag = "1" if self.is_source else "0"
        port = str(self.http_port or 0)
        return f"{MAGIC}|{VERSION}|{MSG_HELLO}|{self.hostname}|{self.ip}|{source_flag}|{port}"

    def to_source(self) -> str:
        port = str(self.http_port or 0)
        return f"{MAGIC}|{VERSION}|{MSG_SOURCE}|{self.hostname}|{self.ip}|{port}"

    @classmethod
    def from_message(cls, message: str) -> Peer | None:
        parts = message.split("|")
        if len(parts) < 5 or parts[0] != MAGIC:
            return None

        msg_type = parts[2]
        if msg_type == MSG_HELLO and len(parts) >= 7:
            return cls(
                hostname=parts[3],
                ip=parts[4],
                is_source=parts[5] == "1",
                http_port=int(parts[6]) if parts[6] != "0" else None,
            )
        if msg_type == MSG_SOURCE and len(parts) >= 6:
            return cls(
                hostname=parts[3],
                ip=parts[4],
                is_source=True,
                http_port=int(parts[5]) if parts[5] != "0" else None,
            )
        return None


def parse_message(data: bytes) -> tuple[str, Peer | None]:
    text = data.decode("utf-8", errors="ignore").strip()
    parts = text.split("|")
    if len(parts) < 3 or parts[0] != MAGIC:
        return "", None
    return parts[2], Peer.from_message(text)


def get_broadcast_address() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        local_ip = sock.getsockname()[0]
        sock.close()
        octets = local_ip.split(".")
        return ".".join(octets[:3] + ["255"])
    except OSError:
        return "255.255.255.255"


def get_local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def get_hostname() -> str:
    return socket.gethostname()
