"""Offline stand-ins for commands, sockets and host files, driven by a JSON scenario.

Used by the tests and by `python -m guardian --scenario ...` so the whole pipeline runs with no kiosk, no network
and no credentials. Scenario command outputs are synthetic, written to match documented tool formats.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Sequence

from . import probes, runner
from .probes import HostReader, HttpsClient, HttpsPostError, HttpsResponse, NetworkProbe, ProbeResult
from .runner import CommandResult, CommandRunner


class FakeClock:
    def __init__(self, start: float = 1_800_000_000.0):
        self.now = float(start)

    def time(self) -> float:
        return self.now

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class ScenarioRunner(CommandRunner):
    def __init__(self, commands: Dict[str, Dict[str, Any]], clock: Optional[FakeClock] = None):
        self.commands = commands
        self.clock = clock
        self.calls: List[List[str]] = []

    def run(self, argv: Sequence[str], timeout_s: float) -> CommandResult:
        argv = list(argv)
        self.calls.append(argv)
        if not runner.is_read_only(argv):
            return CommandResult(runner.REJECTED)
        spec = self.commands.get(" ".join(argv))
        if spec is None:
            return CommandResult(runner.MISSING)
        elapsed = float(spec.get("elapsed_s", 0))
        status = spec.get("status", runner.OK)
        if status == runner.TIMEOUT or elapsed > timeout_s:
            if self.clock:
                self.clock.advance(timeout_s)
            return CommandResult(runner.TIMEOUT, duration_ms=int(timeout_s * 1000))
        if self.clock:
            self.clock.advance(elapsed)
        if status != runner.OK:
            return CommandResult(status, duration_ms=int(elapsed * 1000))
        return CommandResult(runner.OK, spec.get("returncode", 0), spec.get("stdout", ""), spec.get("stderr", ""),
                             int(elapsed * 1000))


class ScenarioProbe(NetworkProbe):
    def __init__(self, tcp: Dict[str, List[str]], tls: Dict[str, str], clock: Optional[FakeClock] = None,
                 elapsed_s: float = 0.0):
        self.tcp, self.tls, self.clock, self.elapsed_s = tcp, tls, clock, elapsed_s
        self.calls: List[str] = []
        self._count: Dict[str, int] = {}

    def _tick(self) -> None:
        if self.clock and self.elapsed_s:
            self.clock.advance(self.elapsed_s)

    def tcp_connect(self, addr: str, port: int, timeout_s: float) -> ProbeResult:
        key = f"{addr}:{port}"
        self.calls.append("tcp " + key)
        self._tick()
        seq = self.tcp.get(key, [probes.TIMEOUT])
        i = self._count.get(key, 0)
        self._count[key] = i + 1
        return ProbeResult(seq[min(i, len(seq) - 1)])

    def tls_handshake(self, host: str, addr: str, port: int, timeout_s: float) -> ProbeResult:
        key = f"{addr}:{port}"
        self.calls.append("tls " + key)
        self._tick()
        return ProbeResult(self.tls.get(key, probes.TIMEOUT))


class ScenarioHost(HostReader):
    def __init__(self, files: Dict[str, Any], disk_free_mb: Optional[float]):
        self.files, self._disk = files, disk_free_mb

    def read_text(self, path: str) -> str:
        v = self.files.get(path)
        if v is None:
            raise FileNotFoundError(path)
        if v == "!PermissionError":
            raise PermissionError(path)
        return v

    def disk_free_mb(self, path: str) -> float:
        if self._disk is None:
            raise OSError("no disk data")
        return float(self._disk)


class FakeHttpsClient(HttpsClient):
    """Offline stand-in for guardian.probes.SocketHttpsClient, used by the publisher's own tests
    (tests/test_publisher.py). Each call to post_json() consumes the next scripted item: an
    `HttpsResponse` to return, or an `HttpsPostError` instance/kind-string to raise. Every call is
    recorded (headers included, body length only -- never logs the body itself) for assertions."""

    def __init__(self, scripted):
        self._scripted = list(scripted)
        self.calls: List[Dict[str, Any]] = []

    def post_json(self, host: str, port: int, path: str, headers: Dict[str, str], body: bytes,
                  timeout_s: float) -> HttpsResponse:
        self.calls.append({"host": host, "port": port, "path": path, "headers": dict(headers),
                            "body_len": len(body), "timeout_s": timeout_s})
        if not self._scripted:
            raise HttpsPostError(probes.ERROR)
        item = self._scripted.pop(0)
        if isinstance(item, HttpsPostError):
            raise item
        if isinstance(item, str):
            raise HttpsPostError(item)
        return item


class Scenario:
    def __init__(self, runner_: ScenarioRunner, probe: ScenarioProbe, host: ScenarioHost):
        self.runner, self.probe, self.host = runner_, probe, host

    @classmethod
    def from_dict(cls, data: Dict[str, Any], base_dir: Optional[str] = None,
                  clock: Optional[FakeClock] = None) -> "Scenario":
        def read(name: str) -> str:
            with open(os.path.join(base_dir or ".", name), "r", encoding="utf-8") as fh:
                return fh.read(65536)

        commands: Dict[str, Dict[str, Any]] = {}
        for key, spec in data.get("commands", {}).items():
            spec = dict(spec)
            if "stdout_file" in spec:
                spec["stdout"] = read(spec.pop("stdout_file"))
            commands[key] = spec
        files = {}
        for path, value in data.get("files", {}).items():
            files[path] = value if value.startswith("!") else read(value)
        return cls(
            ScenarioRunner(commands, clock),
            ScenarioProbe(data.get("tcp", {}), data.get("tls", {}), clock, float(data.get("probe_elapsed_s", 0))),
            ScenarioHost(files, data.get("disk_free_mb")),
        )

    @classmethod
    def load(cls, path: str, clock: Optional[FakeClock] = None) -> "Scenario":
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return cls.from_dict(data, os.path.dirname(os.path.abspath(path)), clock)
