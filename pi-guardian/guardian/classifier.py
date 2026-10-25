"""Deterministic diagnosis. A pure function of observations: no I/O, no clock, no randomness.

Rules, in order:
 1. Expected-but-missing checks become NOT_RUN. PASS/FAIL older than stale_after_s become STALE.
 2. A FAIL seen for fewer than min_fail_streak consecutive cycles is demoted to UNKNOWN (not yet persistent).
 3. A FAIL in link/ipv4/route/gateway is demoted to UNKNOWN if an endpoint or TLS check PASSED: that traffic crossed it.
 4. The lowest failed connectivity layer is the root cause; layers above it that failed or did not run are cascades.
 5. Services, management and resources are independent planes, so several root causes can coexist.
 6. HEALTHY only if there are no root causes and every required check is PASS.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Tuple

from .model import MAX_EVIDENCE, Observation, Plane, State, plane_of

CRITICAL, MANAGEMENT, WARNING = "CRITICAL", "MANAGEMENT", "WARNING"
_SEVERITY_RANK = {CRITICAL: 0, MANAGEMENT: 1, WARNING: 2}

CHAIN = ("link", "ipv4", "route", "gateway")
CHAIN_CODES = {"link": "LINK_DOWN", "ipv4": "NO_IPV4", "route": "INVALID_ROUTE", "gateway": "GATEWAY_UNREACHABLE"}
NETWORK_ROOT_CODES = frozenset(CHAIN_CODES.values()) | {"INTERNET_UNREACHABLE"}
RESOURCE_CODES = {"disk": "DISK_LOW", "memory": "MEMORY_LOW", "temperature": "TEMPERATURE_HIGH"}

FUTURE_SKEW_S = 5.0


@dataclass(frozen=True)
class RootCause:
    code: str
    plane: Plane
    severity: str
    checks: Tuple[str, ...]
    evidence: Tuple[str, ...]


@dataclass(frozen=True)
class Cascade:
    check_id: str
    blocked_by: str  # root cause code


@dataclass(frozen=True)
class Diagnosis:
    overall: str  # HEALTHY | DEGRADED | FAILING | UNKNOWN
    root_causes: Tuple[RootCause, ...]
    cascades: Tuple[Cascade, ...]
    unknown_checks: Tuple[str, ...]


def _with(o: Observation, state: State, *markers: str) -> Observation:
    return dataclasses.replace(o, state=state, evidence=tuple(markers) + o.evidence)


def normalize(observations: Iterable[Observation], expected: Dict[str, bool], now: float,
              stale_after_s: float, min_fail_streak: int) -> Dict[str, Observation]:
    by_id: Dict[str, Observation] = {}
    for o in observations:
        by_id.setdefault(o.check_id, o)  # first observation of an id wins
    for check_id in expected:
        if check_id not in by_id:
            by_id[check_id] = Observation(check_id, State.NOT_RUN, now, None, ("COLLECTOR_MISSING",))
    for check_id, o in list(by_id.items()):
        if o.state in (State.PASS, State.FAIL):
            age = now - o.observed_at
            if age < -FUTURE_SKEW_S:
                o = _with(o, State.UNKNOWN, "TIMESTAMP_IN_FUTURE")
            elif age > stale_after_s:
                o = _with(o, State.STALE, "WAS_" + o.state.value)
        if o.state == State.FAIL and o.streak < min_fail_streak:
            o = _with(o, State.UNKNOWN, "FAIL_NOT_PERSISTENT", "WAS_FAIL")
        by_id[check_id] = o
    traffic_ok = any(o.state == State.PASS for k, o in by_id.items() if k.startswith(("endpoint.", "tls.")))
    if traffic_ok:
        for k in CHAIN:
            if k in by_id and by_id[k].state == State.FAIL:
                by_id[k] = _with(by_id[k], State.UNKNOWN, "CONTRADICTED_BY_TRAFFIC", "WAS_FAIL")
    return by_id


def _evidence(norm: Dict[str, Observation], checks: Sequence[str]) -> Tuple[str, ...]:
    seen: List[str] = []
    for c in checks:
        for code in norm[c].evidence:
            if code not in seen:
                seen.append(code)
    return tuple(seen[:MAX_EVIDENCE])


def classify(observations: Iterable[Observation], expected: Dict[str, bool], now: float,
             stale_after_s: float, min_fail_streak: int) -> Tuple[Dict[str, Observation], Diagnosis]:
    norm = normalize(observations, expected, now, stale_after_s, min_fail_streak)

    def state(c: str):
        return norm[c].state if c in norm else None

    roots: List[RootCause] = []
    cascades: List[Cascade] = []
    endpoint_ids = sorted(k for k in norm if k.startswith("endpoint."))
    tls_ids = sorted(k for k in norm if k.startswith("tls."))

    def add_root(code: str, plane: Plane, severity: str, checks: Sequence[str]) -> None:
        roots.append(RootCause(code, plane, severity, tuple(sorted(checks)), _evidence(norm, sorted(checks))))

    def cascade_if_blocked(ids: Iterable[str], code: str) -> None:
        for c in ids:
            if state(c) in (State.FAIL, State.NOT_RUN):
                cascades.append(Cascade(c, code))

    first_fail = next((c for c in CHAIN if state(c) == State.FAIL), None)
    if first_fail:
        code = CHAIN_CODES[first_fail]
        add_root(code, Plane.CONNECTIVITY, CRITICAL, [first_fail])
        above = list(CHAIN[CHAIN.index(first_fail) + 1:]) + (["dns"] if "dns" in norm else []) + endpoint_ids + tls_ids
        cascade_if_blocked(above, code)
    elif state("dns") == State.FAIL:
        add_root("DNS_FAILURE", Plane.CONNECTIVITY, CRITICAL, ["dns"])
        cascade_if_blocked(endpoint_ids + tls_ids, "DNS_FAILURE")
    else:
        failed = [e for e in endpoint_ids if state(e) == State.FAIL]
        if failed:
            if len(endpoint_ids) >= 2 and len(failed) == len(endpoint_ids):
                code = "INTERNET_UNREACHABLE"
                add_root(code, Plane.CONNECTIVITY, CRITICAL, endpoint_ids)
            else:
                code = "ENDPOINT_UNREACHABLE"
                add_root(code, Plane.CONNECTIVITY, CRITICAL, failed)
            cascade_if_blocked([f"tls.{e.split('.', 1)[1]}" for e in failed if f"tls.{e.split('.', 1)[1]}" in norm], code)
        tls_failed = [t for t in tls_ids if state(t) == State.FAIL and state("endpoint." + t.split(".", 1)[1]) == State.PASS]
        if tls_failed:
            add_root("HTTPS_FAILURE", Plane.CONNECTIVITY, CRITICAL, tls_failed)

    if state("listener_unit") == State.FAIL:
        add_root("LISTENER_FAILURE", Plane.SERVICES, CRITICAL, ["listener_unit"])
    if state("cups_scheduler") == State.FAIL:
        add_root("CUPS_FAILURE", Plane.SERVICES, CRITICAL, ["cups_scheduler"])

    if state("tailscale") == State.FAIL:
        network_root = next((r for r in roots if r.code in NETWORK_ROOT_CODES), None)
        if network_root:
            cascades.append(Cascade("tailscale", network_root.code))
        else:
            add_root("TAILSCALE_FAILURE", Plane.MANAGEMENT, MANAGEMENT, ["tailscale"])

    for check_id, code in RESOURCE_CODES.items():
        if state(check_id) == State.FAIL:
            add_root(code, Plane.RESOURCES, WARNING, [check_id])

    roots.sort(key=lambda r: (_SEVERITY_RANK[r.severity], r.plane.value, r.code))
    cascaded = {c.check_id for c in cascades}
    required = sorted(k for k, req in expected.items() if req)
    if any(r.severity == CRITICAL for r in roots):
        overall = "FAILING"
    elif roots:
        overall = "DEGRADED"
    elif required and all(state(k) == State.PASS for k in required):
        overall = "HEALTHY"
    else:
        overall = "UNKNOWN"
    unknown = tuple(k for k in required
                    if state(k) in (State.UNKNOWN, State.NOT_RUN, State.STALE) and k not in cascaded)
    return norm, Diagnosis(overall, tuple(roots), tuple(sorted(cascades, key=lambda c: c.check_id)), unknown)
