"""Versioned, bounded, validated health snapshot (a plain dict, JSON-serialisable). Local only: never sent anywhere."""
from __future__ import annotations

import dataclasses
import json
import re
from typing import Any, Dict, Iterable, List

from . import SCHEMA_VERSION, __version__
from .classifier import Diagnosis
from .config import GuardianConfig
from .model import EVIDENCE_RE, FIXED_CHECKS, MAX_DETAIL, MAX_EVIDENCE, Observation, Plane, State, is_valid_check_id, \
    iso_utc, plane_of

TARGET_BYTES = 4096
MAX_SNAPSHOT_BYTES = 8192
MAX_CHECKS = 32

_ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_KIOSK_RE = re.compile(r"^[A-Z]{2}-\d{3}$")
_VERSION_RE = re.compile(r"^[0-9A-Za-z.+-]{1,32}$")
_OVERALL = {"HEALTHY", "DEGRADED", "FAILING", "UNKNOWN"}
_SEVERITIES = {"CRITICAL", "MANAGEMENT", "WARNING"}
_LEAK_RES = (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b"))

TOP_KEYS = {"schemaVersion", "agentVersion", "kioskId", "seq", "observedAt", "cycle", "checks", "diagnosis"}
CYCLE_KEYS = {"durationMs", "budgetMs", "budgetExceeded", "detailsDropped"}
CHECK_KEYS = {"id", "plane", "required", "state", "observedAt", "durationMs", "evidence", "detail", "streak"}
DIAG_KEYS = {"overall", "rootCauses", "cascades", "unknown"}


class SnapshotError(ValueError):
    pass


def _encode(snapshot: Dict[str, Any]) -> str:
    return json.dumps(snapshot, separators=(",", ":"), sort_keys=True)


def build_snapshot(config: GuardianConfig, observations: Iterable[Observation], diagnosis: Diagnosis,
                   expected: Dict[str, bool], now: float, seq: int, duration_ms: int,
                   budget_exceeded: bool) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []
    for o in sorted(observations, key=lambda x: x.check_id):
        checks.append({
            "id": o.check_id, "plane": plane_of(o.check_id).value, "required": bool(expected.get(o.check_id, False)),
            "state": o.state.value, "observedAt": iso_utc(o.observed_at), "durationMs": o.duration_ms,
            "evidence": list(o.evidence), "detail": o.detail, "streak": o.streak,
        })
    snap: Dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION, "agentVersion": __version__, "kioskId": config.kiosk_id, "seq": seq,
        "observedAt": iso_utc(now),
        "cycle": {"durationMs": duration_ms, "budgetMs": int(config.cycle_budget_s * 1000),
                  "budgetExceeded": budget_exceeded, "detailsDropped": False},
        "checks": checks,
        "diagnosis": {
            "overall": diagnosis.overall,
            "rootCauses": [{"code": r.code, "plane": r.plane.value, "severity": r.severity,
                            "checks": list(r.checks), "evidence": list(r.evidence)} for r in diagnosis.root_causes],
            "cascades": [{"check": c.check_id, "blockedBy": c.blocked_by} for c in diagnosis.cascades],
            "unknown": list(diagnosis.unknown_checks),
        },
    }
    if len(_encode(snap)) > TARGET_BYTES:
        for c in snap["checks"]:
            c["detail"] = ""
        snap["cycle"]["detailsDropped"] = True
    errors = validate_snapshot(snap)
    if errors:
        raise SnapshotError("; ".join(errors[:5]))
    return snap


def _strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from _strings(v)


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def validate_snapshot(snap: Any) -> List[str]:
    """Returns a list of problems; empty means valid."""
    e: List[str] = []
    if not isinstance(snap, dict):
        return ["snapshot must be an object"]
    if set(snap) != TOP_KEYS:
        return [f"top-level keys must be exactly {sorted(TOP_KEYS)}"]
    if snap["schemaVersion"] != SCHEMA_VERSION or not _is_int(snap["schemaVersion"]):
        e.append("unsupported schemaVersion")
    if not (isinstance(snap["agentVersion"], str) and _VERSION_RE.match(snap["agentVersion"])):
        e.append("bad agentVersion")
    if not (isinstance(snap["kioskId"], str) and _KIOSK_RE.match(snap["kioskId"])):
        e.append("bad kioskId")
    if not _is_int(snap["seq"]) or snap["seq"] < 0:
        e.append("bad seq")
    if not (isinstance(snap["observedAt"], str) and _ISO_RE.match(snap["observedAt"])):
        e.append("bad observedAt")
    cyc = snap["cycle"]
    if not isinstance(cyc, dict) or set(cyc) != CYCLE_KEYS or not _is_int(cyc.get("durationMs")) \
            or not _is_int(cyc.get("budgetMs")) or not isinstance(cyc.get("budgetExceeded"), bool) \
            or not isinstance(cyc.get("detailsDropped"), bool):
        e.append("bad cycle block")
    checks = snap["checks"]
    if not isinstance(checks, list) or len(checks) > MAX_CHECKS:
        e.append(f"checks must be a list of at most {MAX_CHECKS}")
        checks = []
    ids = set()
    for c in checks:
        if not isinstance(c, dict) or set(c) != CHECK_KEYS:
            e.append("bad check entry keys")
            continue
        if not is_valid_check_id(c["id"]) or c["id"] in ids:
            e.append(f"bad or duplicate check id {c.get('id')!r}")
            continue
        ids.add(c["id"])
        if c["plane"] != plane_of(c["id"]).value:
            e.append(f"{c['id']}: plane mismatch")
        if c["state"] not in {s.value for s in State}:
            e.append(f"{c['id']}: bad state")
        if not isinstance(c["required"], bool):
            e.append(f"{c['id']}: bad required")
        if not (isinstance(c["observedAt"], str) and _ISO_RE.match(c["observedAt"])):
            e.append(f"{c['id']}: bad observedAt")
        if c["durationMs"] is not None and (not _is_int(c["durationMs"]) or c["durationMs"] < 0):
            e.append(f"{c['id']}: bad durationMs")
        ev = c["evidence"]
        if not isinstance(ev, list) or len(ev) > MAX_EVIDENCE \
                or not all(isinstance(x, str) and EVIDENCE_RE.match(x) for x in ev):
            e.append(f"{c['id']}: bad evidence")
        if not isinstance(c["detail"], str) or len(c["detail"]) > MAX_DETAIL:
            e.append(f"{c['id']}: bad detail")
        if not _is_int(c["streak"]) or c["streak"] < 1:
            e.append(f"{c['id']}: bad streak")
    d = snap["diagnosis"]
    if not isinstance(d, dict) or set(d) != DIAG_KEYS or d.get("overall") not in _OVERALL:
        e.append("bad diagnosis block")
    else:
        for r in d["rootCauses"]:
            if not isinstance(r, dict) or set(r) != {"code", "plane", "severity", "checks", "evidence"} \
                    or r["severity"] not in _SEVERITIES or not isinstance(r["checks"], list) or not r["checks"]:
                e.append("bad root cause entry")
            elif not set(r["checks"]) <= ids:
                e.append("root cause references unknown check")
        for c in d["cascades"]:
            if not isinstance(c, dict) or set(c) != {"check", "blockedBy"} or c["check"] not in ids:
                e.append("bad cascade entry")
        if not isinstance(d["unknown"], list) or not set(d["unknown"]) <= ids:
            e.append("bad unknown list")
    if any(p.search(s) for s in _strings(snap) for p in _LEAK_RES):
        e.append("snapshot contains an unsanitised address")
    try:
        size = len(_encode(snap))
    except (TypeError, ValueError):
        return e + ["snapshot is not JSON serialisable"]
    if size > MAX_SNAPSHOT_BYTES:
        e.append(f"snapshot is {size} bytes, over the {MAX_SNAPSHOT_BYTES} limit")
    return e


def encode_snapshot(snap: Dict[str, Any]) -> str:
    errors = validate_snapshot(snap)
    if errors:
        raise SnapshotError("; ".join(errors[:5]))
    return _encode(snap)
