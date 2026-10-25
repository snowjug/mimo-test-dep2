"""Observation model and output sanitisation."""
from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import Tuple


class State(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    UNKNOWN = "UNKNOWN"
    NOT_RUN = "NOT_RUN"
    STALE = "STALE"


class Plane(str, Enum):
    CONNECTIVITY = "connectivity"
    SERVICES = "services"
    MANAGEMENT = "management"
    RESOURCES = "resources"


FIXED_CHECKS = {
    "link": Plane.CONNECTIVITY,
    "ipv4": Plane.CONNECTIVITY,
    "route": Plane.CONNECTIVITY,
    "gateway": Plane.CONNECTIVITY,
    "dns": Plane.CONNECTIVITY,
    "listener_unit": Plane.SERVICES,
    "cups_scheduler": Plane.SERVICES,
    "tailscale": Plane.MANAGEMENT,
    "disk": Plane.RESOURCES,
    "memory": Plane.RESOURCES,
    "temperature": Plane.RESOURCES,
}
_DYNAMIC_RE = re.compile(r"^(endpoint|tls)\.([a-z0-9_]{1,24})$")
EVIDENCE_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,47}$")
MAX_EVIDENCE = 8
MAX_DETAIL = 120


def is_valid_check_id(check_id: str) -> bool:
    return isinstance(check_id, str) and (check_id in FIXED_CHECKS or bool(_DYNAMIC_RE.match(check_id)))


def plane_of(check_id: str) -> Plane:
    if check_id in FIXED_CHECKS:
        return FIXED_CHECKS[check_id]
    if _DYNAMIC_RE.match(check_id or ""):
        return Plane.CONNECTIVITY
    raise ValueError(f"unknown check id: {check_id!r}")


# Order matters: secrets first, then MAC before IPv6 (a MAC would otherwise match the IPv6 pattern).
_SANITIZERS = (
    (re.compile(r"\btskey-[A-Za-z0-9-]+"), "<redacted>"),
    (re.compile(r"(?i)\b(pass(?:word|wd|phrase)?|psk|secret|token|api[_-]?key|private[_-]?key|authkey|key)\b\s*[=:]\s*\S+"),
     r"\1=<redacted>"),
    (re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b"), "<mac>"),
    (re.compile(r"(?<![\w:])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:])"), "<ip6>"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "<ip>"),
    (re.compile(r"\b[\w.-]+\.ts\.net\b"), "<host>"),
    (re.compile(r"\b[A-Za-z0-9+/_\-]{32,}={0,2}"), "<redacted>"),
)
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]+")


def sanitize_text(text: object, max_len: int = MAX_DETAIL) -> str:
    """Bounded, ASCII-only text with addresses, MACs, tokens and key=value secrets removed."""
    s = "" if text is None else str(text)
    s = _CONTROL_RE.sub(" ", s)
    for pattern, repl in _SANITIZERS:
        s = pattern.sub(repl, s)
    s = " ".join(s.split())
    s = s.encode("ascii", "replace").decode("ascii")
    if len(s) > max_len:
        s = s[: max(0, max_len - 3)] + "..."
    return s


def iso_utc(epoch: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


@dataclass(frozen=True)
class Observation:
    """One check result. `streak` is how many consecutive cycles this check has had the same state."""

    check_id: str
    state: State
    observed_at: float
    duration_ms: "int | None" = None
    evidence: Tuple[str, ...] = ()
    detail: str = ""
    streak: int = 1

    def __post_init__(self) -> None:
        if not is_valid_check_id(self.check_id):
            raise ValueError(f"unknown check id: {self.check_id!r}")
        object.__setattr__(self, "state", State(self.state))
        if isinstance(self.observed_at, bool) or not isinstance(self.observed_at, (int, float)) \
                or not math.isfinite(self.observed_at):
            raise ValueError("observed_at must be a finite number")
        if self.duration_ms is not None:
            if isinstance(self.duration_ms, bool) or not isinstance(self.duration_ms, int) or self.duration_ms < 0:
                raise ValueError("duration_ms must be a non-negative int or None")
        if isinstance(self.streak, bool) or not isinstance(self.streak, int) or self.streak < 1:
            raise ValueError("streak must be an int >= 1")
        seen = []
        for code in self.evidence:
            if not isinstance(code, str) or not EVIDENCE_RE.match(code):
                raise ValueError(f"invalid evidence code: {code!r}")
            if code not in seen:
                seen.append(code)
        object.__setattr__(self, "evidence", tuple(seen[:MAX_EVIDENCE]))
        object.__setattr__(self, "detail", sanitize_text(self.detail))
