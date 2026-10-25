"""Bounded, read-only command execution. Only an allowlist of inspection commands can run, never through a shell."""
from __future__ import annotations

import os
import re
import subprocess
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Sequence

MAX_OUTPUT_CHARS = 65536

OK, MISSING, TIMEOUT, PERMISSION, ERROR, REJECTED = "OK", "MISSING", "TIMEOUT", "PERMISSION", "ERROR", "REJECTED"


@dataclass(frozen=True)
class CommandResult:
    status: str
    returncode: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0


_TOKEN = re.compile(r"^[A-Za-z0-9@_.:/=-]+$")
_HOSTNAME = re.compile(r"^[A-Za-z0-9._-]{1,253}$")
_SYSTEMCTL_DASH = {"-p", "--property", "--no-pager", "--value"}


def _ip_rule(a: Sequence[str]) -> bool:
    return (len(a) >= 3 and a[0] == "-j" and a[1] in ("link", "addr", "route", "neigh") and a[2] == "show"
            and all(_TOKEN.match(t) for t in a[3:]))


def _systemctl_rule(a: Sequence[str]) -> bool:
    return bool(a) and a[0] == "show" and all(
        _TOKEN.match(t) and (not t.startswith("-") or t in _SYSTEMCTL_DASH) for t in a[1:])


_RULES: Dict[str, Callable[[Sequence[str]], bool]] = {
    "ip": _ip_rule,
    "systemctl": _systemctl_rule,
    "lpstat": lambda a: list(a) == ["-r"],
    "tailscale": lambda a: list(a) == ["status", "--json"],
    "getent": lambda a: len(a) == 2 and a[0] == "ahostsv4" and bool(_HOSTNAME.match(a[1])),
    # Phase 2 (2.6): a fixed, bounded, read-only tail of CUPS' own error log, used only to add
    # operator-facing context to an already-determined cups_scheduler FAIL -- never to decide it.
    "tail": lambda a: list(a) == ["-n", "20", "/var/log/cups/error_log"],
}


def is_read_only(argv: Sequence[str]) -> bool:
    """True only for the exact inspection command shapes Guardian uses."""
    if not argv or not all(isinstance(a, str) for a in argv):
        return False
    rule = _RULES.get(os.path.basename(argv[0]))
    return bool(rule and rule(list(argv[1:])))


class CommandRunner:
    def run(self, argv: Sequence[str], timeout_s: float) -> CommandResult:  # pragma: no cover - interface
        raise NotImplementedError


class SubprocessRunner(CommandRunner):
    def run(self, argv: Sequence[str], timeout_s: float) -> CommandResult:
        if not is_read_only(argv):
            return CommandResult(REJECTED)
        if not isinstance(timeout_s, (int, float)) or timeout_s <= 0:
            return CommandResult(REJECTED)
        env = {"PATH": os.environ.get("PATH", ""), "LC_ALL": "C", "LANG": "C"}
        for key in ("SystemRoot", "SYSTEMROOT"):
            if key in os.environ:
                env[key] = os.environ[key]
        started = time.monotonic()

        def ms() -> int:
            return int((time.monotonic() - started) * 1000)

        try:
            proc = subprocess.run(
                list(argv), stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout_s,
                shell=False, env=env, check=False,
            )
        except subprocess.TimeoutExpired:
            return CommandResult(TIMEOUT, duration_ms=ms())
        except FileNotFoundError:
            return CommandResult(MISSING, duration_ms=ms())
        except PermissionError:
            return CommandResult(PERMISSION, duration_ms=ms())
        except OSError:
            return CommandResult(ERROR, duration_ms=ms())
        return CommandResult(
            OK, proc.returncode,
            proc.stdout.decode("utf-8", "replace")[:MAX_OUTPUT_CHARS],
            proc.stderr.decode("utf-8", "replace")[:MAX_OUTPUT_CHARS],
            ms(),
        )
