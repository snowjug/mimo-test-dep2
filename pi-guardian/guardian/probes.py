"""Socket and host-file probes. Connection attempts only: no payload is sent and nothing is authenticated.

Also the Phase 2C HTTPS transport (SocketHttpsClient, at the bottom of this file): all socket/ssl use in
guardian/ is confined to this one file (tests/test_static_safety.py's
test_subprocess_only_in_runner_and_sockets_only_in_probes enforces this), so the publisher's actual
network I/O lives here rather than in publisher.py, which only builds requests and interprets responses.
This is also why it is a minimal hand-rolled HTTP/1.1 client over raw TLS sockets rather than
urllib.request/http.client: both are explicitly forbidden by test_static_safety.py's import allowlist
(FORBIDDEN_NAMES includes "http" and "urllib"), by the same Phase 1 design rule that keeps Guardian off
any higher-level network stack it does not need.
"""
from __future__ import annotations

import errno
import shutil
import socket
import ssl
from dataclasses import dataclass
from typing import Dict

OK, TIMEOUT, REFUSED, UNREACHABLE, TLS_ERROR, TLS_CERT, ERROR = (
    "OK", "TIMEOUT", "REFUSED", "UNREACHABLE", "TLS_ERROR", "TLS_CERT", "ERROR")

_UNREACHABLE_ERRNOS = {getattr(errno, n) for n in ("ENETUNREACH", "EHOSTUNREACH", "ENETDOWN") if hasattr(errno, n)}


@dataclass(frozen=True)
class ProbeResult:
    status: str


class NetworkProbe:
    def tcp_connect(self, addr: str, port: int, timeout_s: float) -> ProbeResult:  # pragma: no cover - interface
        raise NotImplementedError

    def tls_handshake(self, host: str, addr: str, port: int, timeout_s: float) -> ProbeResult:  # pragma: no cover
        raise NotImplementedError


def _classify_oserror(exc: OSError) -> str:
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return TIMEOUT
    if isinstance(exc, ConnectionRefusedError):
        return REFUSED
    if exc.errno in _UNREACHABLE_ERRNOS:
        return UNREACHABLE
    return ERROR


class SocketProbe(NetworkProbe):
    def tcp_connect(self, addr: str, port: int, timeout_s: float) -> ProbeResult:
        try:
            with socket.create_connection((addr, port), timeout=timeout_s):
                return ProbeResult(OK)
        except OSError as exc:
            return ProbeResult(_classify_oserror(exc))

    def tls_handshake(self, host: str, addr: str, port: int, timeout_s: float) -> ProbeResult:
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((addr, port), timeout=timeout_s) as raw:
                raw.settimeout(timeout_s)
                with ctx.wrap_socket(raw, server_hostname=host):
                    return ProbeResult(OK)
        except ssl.SSLCertVerificationError:
            return ProbeResult(TLS_CERT)
        except ssl.SSLError:
            return ProbeResult(TLS_ERROR)
        except OSError as exc:
            return ProbeResult(_classify_oserror(exc))


class HostReader:
    """Read-only access to /proc, /sys and disk usage, injectable for tests."""

    def read_text(self, path: str) -> str:
        with open(path, "r", encoding="ascii", errors="replace") as fh:
            return fh.read(65536)

    def disk_free_mb(self, path: str) -> float:
        return shutil.disk_usage(path).free / (1024 * 1024)


# ================= Phase 2C: HTTPS POST transport for the publisher =================

MAX_HTTPS_RESPONSE_BYTES = 65536


@dataclass(frozen=True)
class HttpsResponse:
    status_code: int
    headers: Dict[str, str]
    body: bytes


class HttpsPostError(Exception):
    """Raised when no HTTP response was obtained at all (connection/timeout/TLS/malformed-response
    failure) -- as opposed to the server returning an HTTP error status, which is a normal
    HttpsResponse the caller classifies itself. `kind` is one of the same status words SocketProbe
    uses above, so the publisher can treat them uniformly."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


class HttpsClient:
    def post_json(self, host: str, port: int, path: str, headers: Dict[str, str], body: bytes,
                  timeout_s: float) -> HttpsResponse:  # pragma: no cover - interface
        raise NotImplementedError


def _read_until_closed(tls_sock, timeout_s: float) -> bytes:
    tls_sock.settimeout(timeout_s)
    chunks = []
    total = 0
    while total < MAX_HTTPS_RESPONSE_BYTES:
        chunk = tls_sock.recv(4096)
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def _parse_http_response(raw: bytes) -> HttpsResponse:
    try:
        head, _, body = raw.partition(b"\r\n\r\n")
        lines = head.decode("iso-8859-1").split("\r\n")
        status_line = lines[0]
        status_code = int(status_line.split(" ", 2)[1])
        headers: Dict[str, str] = {}
        for line in lines[1:]:
            if ":" in line:
                k, _, v = line.partition(":")
                headers[k.strip().lower()] = v.strip()
        length = headers.get("content-length")
        if length is not None:
            body = body[: int(length)]
        return HttpsResponse(status_code, headers, body)
    except (ValueError, IndexError, UnicodeDecodeError) as exc:
        raise HttpsPostError(ERROR) from exc


def _build_request(host: str, path: str, headers: Dict[str, str], body: bytes) -> bytes:
    request_lines = [
        f"POST {path} HTTP/1.1",
        f"Host: {host}",
        "Connection: close",
        f"Content-Length: {len(body)}",
    ]
    for k, v in headers.items():
        request_lines.append(f"{k}: {v}")
    return ("\r\n".join(request_lines) + "\r\n\r\n").encode("ascii") + body


class SocketHttpsClient(HttpsClient):
    """A minimal HTTP/1.1 POST over a TLS socket. Always sends `Connection: close` so the server
    closing the socket is how we know the response is complete -- no chunked-transfer-encoding
    support, which Guardian's own backend never uses for this small, fixed-shape response.

    `use_tls=False` is test-only plumbing (Phase 2D's local end-to-end integration test): it skips
    the TLS handshake so the real client/signing/parsing code can be exercised against a local
    plain-HTTP test server with no certificate machinery, without touching anything real-kiosk-path
    uses. The default (`True`, real TLS with default certificate verification) is unchanged from
    Phase 2C and is what every non-test construction of this class uses."""

    def __init__(self, use_tls: bool = True):
        self._use_tls = use_tls

    def post_json(self, host: str, port: int, path: str, headers: Dict[str, str], body: bytes,
                  timeout_s: float) -> HttpsResponse:
        request = _build_request(host, path, headers, body)
        try:
            with socket.create_connection((host, port), timeout=timeout_s) as raw:
                raw.settimeout(timeout_s)
                if not self._use_tls:
                    raw.sendall(request)
                    return _parse_http_response(_read_until_closed(raw, timeout_s))
                ctx = ssl.create_default_context()
                with ctx.wrap_socket(raw, server_hostname=host) as tls:
                    tls.sendall(request)
                    raw_response = _read_until_closed(tls, timeout_s)
            return _parse_http_response(raw_response)
        except HttpsPostError:
            raise
        except ssl.SSLCertVerificationError:
            raise HttpsPostError(TLS_CERT)
        except ssl.SSLError:
            raise HttpsPostError(TLS_ERROR)
        except (socket.timeout, TimeoutError):
            raise HttpsPostError(TIMEOUT)
        except ConnectionRefusedError:
            raise HttpsPostError(REFUSED)
        except OSError as exc:
            if exc.errno in _UNREACHABLE_ERRNOS:
                raise HttpsPostError(UNREACHABLE)
            raise HttpsPostError(ERROR)
