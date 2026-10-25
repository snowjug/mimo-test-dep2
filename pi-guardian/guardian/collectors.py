"""Read-only collectors. A probe that cannot run, times out, is denied or returns garbage is UNKNOWN, never FAIL.

FAIL is returned only when valid evidence establishes the negative result.
"""
from __future__ import annotations

import ipaddress
import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from . import probes, runner
from .config import GuardianConfig
from .model import Observation, State
from .probes import HostReader, NetworkProbe
from .runner import CommandResult, CommandRunner

MIN_OP_S = 0.25
_AUTO_IFACE = re.compile(r"^(eth\d+|en[a-z0-9]+|wlan\d+|wl[a-z0-9]+)$")
_PERMISSION_RE = re.compile(r"permission denied|operation not permitted|access denied|not permitted", re.I)

P, F, U, N = State.PASS, State.FAIL, State.UNKNOWN, State.NOT_RUN


@dataclass
class CollectContext:
    config: GuardianConfig
    runner: CommandRunner
    probe: NetworkProbe
    host: HostReader
    clock: Callable[[], float]
    monotonic: Callable[[], float]
    deadline: float
    scratch: Dict[str, Any] = field(default_factory=dict)  # per-cycle hand-off between collectors
    memory: Dict[str, Any] = field(default_factory=dict)  # survives across cycles (bounded: a few ints)

    def timeout(self, requested: float) -> float:
        """Requested timeout clipped to the cycle budget; 0 means the budget is spent."""
        t = min(requested, self.deadline - self.monotonic())
        return t if t >= MIN_OP_S else 0.0


def expected_checks(cfg: GuardianConfig) -> Dict[str, bool]:
    """check id -> required-for-HEALTHY."""
    exp: Dict[str, bool] = {"link": True, "ipv4": True, "route": True, "gateway": False}
    exp["dns"] = any(not e.is_ip_literal for e in cfg.endpoints)
    for e in cfg.endpoints:
        exp[f"endpoint.{e.name}"] = True
        if e.tls:
            exp[f"tls.{e.name}"] = True
    exp["listener_unit"] = cfg.listener_unit is not None
    exp["cups_scheduler"] = cfg.check_cups
    exp["tailscale"] = cfg.tailscale_enabled
    exp["disk"] = exp["memory"] = exp["temperature"] = False
    return exp


def _obs(ctx: CollectContext, check_id: str, state: State, started: float, evidence: Sequence[str],
         detail: str = "") -> Observation:
    ms = max(0, int(round((ctx.monotonic() - started) * 1000)))
    return Observation(check_id, state, ctx.clock(), ms, tuple(evidence), detail)


def _not_run(ctx: CollectContext, check_id: str, *codes: str) -> Observation:
    return Observation(check_id, N, ctx.clock(), 0, tuple(codes))


def _problem(res: CommandResult) -> Optional[str]:
    if res.status != runner.OK:
        return {runner.MISSING: "COMMAND_MISSING", runner.TIMEOUT: "COMMAND_TIMEOUT",
                runner.PERMISSION: "PERMISSION_DENIED"}.get(res.status, "COMMAND_ERROR")
    if res.returncode != 0:
        return "PERMISSION_DENIED" if _PERMISSION_RE.search(res.stderr + res.stdout) else "COMMAND_FAILED"
    return None


def _run(ctx: CollectContext, argv: List[str], requested: Optional[float] = None) -> Optional[CommandResult]:
    t = ctx.timeout(ctx.config.command_timeout_s if requested is None else requested)
    if t <= 0:
        return None
    return ctx.runner.run(argv, t)


def _ip_list(ctx: CollectContext, check_id: str, sub: List[str], started: float):
    """Run `ip -j ...`; return (list_of_dicts, None) or (None, early_observation)."""
    res = _run(ctx, ["ip", "-j"] + sub)
    if res is None:
        return None, _not_run(ctx, check_id, "CYCLE_BUDGET_EXHAUSTED")
    problem = _problem(res)
    if problem:
        return None, _obs(ctx, check_id, U, started, [problem])
    try:
        data = json.loads(res.stdout)
    except ValueError:
        data = None
    if not isinstance(data, list) or not all(isinstance(x, dict) for x in data):
        return None, _obs(ctx, check_id, U, started, ["MALFORMED_OUTPUT"])
    return data, None


def _select_interfaces(entries: List[dict], configured: Sequence[str]) -> List[dict]:
    if configured:
        return [e for e in entries if e.get("ifname") in configured]
    return [e for e in entries if isinstance(e.get("ifname"), str) and _AUTO_IFACE.match(e["ifname"])]


def _carrier(entry: dict) -> Optional[bool]:
    flags = entry.get("flags")
    if isinstance(flags, list):
        if "NO-CARRIER" in flags:
            return False
        if "LOWER_UP" in flags:
            return True
    op = entry.get("operstate")
    if op == "UP":
        return True
    if op in ("DOWN", "LOWERLAYERDOWN", "NOTPRESENT"):
        return False
    return None


def collect_link(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    data, early = _ip_list(ctx, "link", ["link", "show"], started)
    if early:
        return early
    selected = _select_interfaces(data, ctx.config.interfaces)
    if not selected:
        return _obs(ctx, "link", U, started, ["INTERFACE_NOT_FOUND"])
    states = {e["ifname"]: _carrier(e) for e in selected}
    ctx.scratch["selected_ifaces"] = sorted(states)
    up = sorted(n for n, c in states.items() if c is True)
    ctx.scratch["carrier_ifaces"] = up
    if up:
        return _obs(ctx, "link", P, started, ["LINK_CARRIER_PRESENT"])
    if all(c is False for c in states.values()):
        return _obs(ctx, "link", F, started, ["LINK_NO_CARRIER"])
    return _obs(ctx, "link", U, started, ["LINK_STATE_AMBIGUOUS"])


def _usable_v4(info: dict) -> Optional[bool]:
    """True usable, False link-local/loopback, None unparsable/not IPv4."""
    if info.get("family") != "inet":
        return None
    try:
        a = ipaddress.IPv4Address(info.get("local"))
    except (ValueError, TypeError):
        return None
    return not (a.is_link_local or a.is_loopback or a.is_unspecified)


def collect_ipv4(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    data, early = _ip_list(ctx, "ipv4", ["addr", "show"], started)
    if early:
        return early
    names = ctx.scratch.get("carrier_ifaces") or ctx.scratch.get("selected_ifaces")
    entries = [e for e in data if (e.get("ifname") in names)] if names else _select_interfaces(data, ctx.config.interfaces)
    if not entries:
        return _obs(ctx, "ipv4", U, started, ["INTERFACE_NOT_FOUND"])
    good, link_local_only = [], False
    for e in entries:
        infos = e.get("addr_info")
        if not isinstance(infos, list):
            return _obs(ctx, "ipv4", U, started, ["MALFORMED_OUTPUT"])
        flags = [_usable_v4(i) for i in infos if isinstance(i, dict)]
        if any(f is True for f in flags):
            good.append(e["ifname"])
        elif any(f is False for f in flags):
            link_local_only = True
    ctx.scratch["ipv4_ifaces"] = sorted(good)
    if good:
        return _obs(ctx, "ipv4", P, started, ["IPV4_ADDRESS_PRESENT"])
    return _obs(ctx, "ipv4", F, started, ["IPV4_LINK_LOCAL_ONLY" if link_local_only else "NO_IPV4_ADDRESS"])


def collect_route(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    data, early = _ip_list(ctx, "route", ["route", "show", "default"], started)
    if early:
        return early
    defaults = [r for r in data if r.get("dst") == "default" and isinstance(r.get("dev"), str)]
    if not defaults:
        return _obs(ctx, "route", F, started, ["NO_DEFAULT_ROUTE"])
    usable = ctx.scratch.get("ipv4_ifaces") or ctx.scratch.get("carrier_ifaces") or ctx.scratch.get("selected_ifaces")
    valid = [r for r in defaults if not usable or r["dev"] in usable]
    if not valid:
        return _obs(ctx, "route", F, started, ["DEFAULT_ROUTE_VIA_UNUSABLE_INTERFACE"])
    best = min(valid, key=lambda r: r.get("metric") if isinstance(r.get("metric"), int) else 0)
    ctx.scratch["gateway_ip"] = best.get("gateway") if isinstance(best.get("gateway"), str) else None
    ctx.scratch["gateway_dev"] = best["dev"]
    return _obs(ctx, "route", P, started, ["DEFAULT_ROUTE_PRESENT"])


def collect_gateway(ctx: CollectContext) -> Observation:
    """Passive: reads the kernel neighbour table, sends nothing. STALE/DELAY/PROBE/absent are inconclusive."""
    started = ctx.monotonic()
    gw = ctx.scratch.get("gateway_ip")
    if not gw:
        return _obs(ctx, "gateway", U, started, ["NO_GATEWAY_ADDRESS"])
    data, early = _ip_list(ctx, "gateway", ["neigh", "show"], started)
    if early:
        return early
    mine = [e for e in data if e.get("dst") == gw and e.get("dev") == ctx.scratch.get("gateway_dev")]
    if not mine:
        return _obs(ctx, "gateway", U, started, ["NEIGH_ENTRY_ABSENT"])
    states = mine[0].get("state")
    if not isinstance(states, list) or not all(isinstance(s, str) for s in states):
        return _obs(ctx, "gateway", U, started, ["MALFORMED_OUTPUT"])
    if "REACHABLE" in states or "PERMANENT" in states:
        return _obs(ctx, "gateway", P, started, ["NEIGH_REACHABLE"])
    if "FAILED" in states or "INCOMPLETE" in states:
        return _obs(ctx, "gateway", F, started, ["NEIGH_FAILED"])
    return _obs(ctx, "gateway", U, started, ["NEIGH_INCONCLUSIVE"])


def _parse_kv(text: str) -> Dict[str, str]:
    out = {}
    for line in text.splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip()
    return out


def collect_listener_unit(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    unit = ctx.config.listener_unit
    if unit is None:
        return _not_run(ctx, "listener_unit", "CHECK_DISABLED")
    argv = ["systemctl", "show", "-p", "LoadState", "-p", "ActiveState", "-p", "SubState", "-p", "NRestarts", unit]
    res = _run(ctx, argv)
    if res is None:
        return _not_run(ctx, "listener_unit", "CYCLE_BUDGET_EXHAUSTED")
    problem = _problem(res)
    if problem:
        return _obs(ctx, "listener_unit", U, started, [problem])
    kv = _parse_kv(res.stdout)
    active, sub, load = kv.get("ActiveState"), kv.get("SubState"), kv.get("LoadState")
    if not active:
        return _obs(ctx, "listener_unit", U, started, ["MALFORMED_OUTPUT"])
    if load == "not-found":
        return _obs(ctx, "listener_unit", U, started, ["UNIT_NOT_FOUND"])
    restarts: Optional[int] = int(kv["NRestarts"]) if kv.get("NRestarts", "").isdigit() else None
    prev = ctx.memory.get("listener_nrestarts")
    if restarts is not None:
        ctx.memory["listener_nrestarts"] = restarts
    looping = (restarts is not None and prev is not None and 0 <= prev <= restarts
               and restarts - prev >= ctx.config.listener_restart_threshold)
    if active == "activating" and sub == "auto-restart":
        return _obs(ctx, "listener_unit", F, started, ["UNIT_AUTO_RESTART"])
    if looping:
        return _obs(ctx, "listener_unit", F, started, ["UNIT_RESTART_LOOP"])
    if active == "active":
        return _obs(ctx, "listener_unit", P, started, ["UNIT_ACTIVE"])
    if active == "failed":
        return _obs(ctx, "listener_unit", F, started, ["UNIT_FAILED"])
    if active == "inactive":
        return _obs(ctx, "listener_unit", F, started, ["UNIT_INACTIVE"])
    return _obs(ctx, "listener_unit", U, started, ["UNIT_TRANSITIONING"])


_CUPS_ERROR_LOG = ["tail", "-n", "20", "/var/log/cups/error_log"]


def _cups_error_tail(ctx: CollectContext) -> str:
    """A short, best-effort excerpt of CUPS' own error log, for an operator reading a FAIL -- never
    used to decide the check's state (lpstat -r alone still does that, unchanged above). Any
    problem reading it (missing file, permission, exhausted budget) just means no extra context;
    it can never turn a PASS into a FAIL or vice versa. Only the single most recent non-empty line
    is kept -- CUPS log lines already carry their own timestamp, so even one line can sit close to
    `Observation.__post_init__`'s detail cap (model.MAX_DETAIL, 120 chars) once sanitized; that same
    sanitize_text() call strips IPs/MACs/tokens/hostnames here exactly as it already does for every
    other check's detail (CLAUDE.md: snapshots carry no addresses, hostnames, MACs, SSIDs or tokens)."""
    res = _run(ctx, _CUPS_ERROR_LOG, requested=1.0)
    if res is None or res.status != runner.OK or res.returncode != 0:
        return ""
    lines = [ln for ln in res.stdout.splitlines() if ln.strip()]
    return lines[-1] if lines else ""


def collect_cups(ctx: CollectContext) -> Observation:
    """Scheduler availability only. Queue/printer state stays with the existing printerStatus."""
    started = ctx.monotonic()
    if not ctx.config.check_cups:
        return _not_run(ctx, "cups_scheduler", "CHECK_DISABLED")
    res = _run(ctx, ["lpstat", "-r"])
    if res is None:
        return _not_run(ctx, "cups_scheduler", "CYCLE_BUDGET_EXHAUSTED")
    if res.status != runner.OK:
        return _obs(ctx, "cups_scheduler", U, started, [_problem(res)])
    text = (res.stdout + " " + res.stderr).lower()
    if "not running" in text:
        return _obs(ctx, "cups_scheduler", F, started, ["CUPS_SCHEDULER_STOPPED"], detail=_cups_error_tail(ctx))
    if res.returncode == 0 and "is running" in text:
        return _obs(ctx, "cups_scheduler", P, started, ["CUPS_SCHEDULER_RUNNING"])
    problem = _problem(res)
    return _obs(ctx, "cups_scheduler", U, started, [problem or "MALFORMED_OUTPUT"])


def collect_tailscale(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    if not ctx.config.tailscale_enabled:
        return _not_run(ctx, "tailscale", "CHECK_DISABLED")
    res = _run(ctx, ["tailscale", "status", "--json"])
    if res is None:
        return _not_run(ctx, "tailscale", "CYCLE_BUDGET_EXHAUSTED")
    problem = _problem(res)
    if problem:
        return _obs(ctx, "tailscale", U, started, [problem])
    try:
        state = json.loads(res.stdout).get("BackendState")
    except (ValueError, AttributeError):
        state = None
    if not isinstance(state, str):
        return _obs(ctx, "tailscale", U, started, ["MALFORMED_OUTPUT"])
    if state == "Running":
        return _obs(ctx, "tailscale", P, started, ["TAILSCALE_RUNNING"])
    if state == "Stopped":
        return _obs(ctx, "tailscale", F, started, ["TAILSCALE_STOPPED"])
    if state in ("NeedsLogin", "NeedsMachineAuth"):
        return _obs(ctx, "tailscale", F, started, ["TAILSCALE_NEEDS_AUTH"])
    return _obs(ctx, "tailscale", U, started, ["TAILSCALE_STATE_UNSETTLED"])


def collect_dns(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    resolved: Dict[str, str] = {}
    missed_names, unknown = [], 0
    hostnames = [e for e in ctx.config.endpoints if not e.is_ip_literal]
    for e in ctx.config.endpoints:
        if e.is_ip_literal:
            resolved[e.name] = e.host
    if not hostnames:
        ctx.scratch["resolved"] = resolved
        return _not_run(ctx, "dns", "DNS_NOT_APPLICABLE")
    for e in hostnames:
        res = _run(ctx, ["getent", "ahostsv4", e.host])
        if res is None:
            unknown += 1
            continue
        if _problem(res) and not (res.status == runner.OK and res.returncode == 2):
            unknown += 1
            continue
        if res.returncode == 2:
            missed_names.append(e.name)
            continue
        addr = None
        for line in res.stdout.splitlines():
            tok = line.split()[:1]
            if tok:
                try:
                    addr = str(ipaddress.IPv4Address(tok[0]))
                    break
                except ValueError:
                    continue
        if addr:
            resolved[e.name] = addr
        else:
            unknown += 1
    ctx.scratch["resolved"] = resolved
    ctx.scratch["dns_missed"] = sorted(missed_names)
    if any(e.name in resolved for e in hostnames):
        partial = any(e.name not in resolved for e in hostnames)
        return _obs(ctx, "dns", P, started, ["DNS_RESOLVED"] + (["DNS_PARTIAL"] if partial else []))
    if len(missed_names) == len(hostnames):
        return _obs(ctx, "dns", F, started, ["DNS_RESOLUTION_FAILED"])
    return _obs(ctx, "dns", U, started, ["DNS_INCONCLUSIVE"])


def _tcp_result(ctx: CollectContext, addr: str, port: int) -> Tuple[State, List[str]]:
    results: List[str] = []
    for _ in range(ctx.config.tcp_attempts):
        t = ctx.timeout(ctx.config.connect_timeout_s)
        if t <= 0:
            break
        r = ctx.probe.tcp_connect(addr, port, t).status
        if r == probes.OK:
            return P, ["TCP_CONNECTED"]
        results.append(r)
    if not results:
        return N, ["CYCLE_BUDGET_EXHAUSTED"]
    if probes.ERROR in results:
        return U, ["TCP_PROBE_ERROR"]
    if all(r == probes.REFUSED for r in results):
        return F, ["TCP_REFUSED"]
    if all(r == probes.UNREACHABLE for r in results):
        return F, ["TCP_UNREACHABLE"]
    if len(results) >= 2:
        return F, ["TCP_TIMEOUT_REPEATED" if all(r == probes.TIMEOUT for r in results) else "TCP_FAILED"]
    return U, ["TCP_SINGLE_NEGATIVE"]


def collect_endpoints(ctx: CollectContext) -> List[Observation]:
    out: List[Observation] = []
    resolved = ctx.scratch.get("resolved", {})
    missed = set(ctx.scratch.get("dns_missed", []))
    for e in ctx.config.endpoints:
        started = ctx.monotonic()
        eid, tid = f"endpoint.{e.name}", f"tls.{e.name}"
        addr = resolved.get(e.name)
        if addr is None:
            out.append(_not_run(ctx, eid, "BLOCKED_BY_DNS" if e.name in missed else "ADDRESS_UNRESOLVED"))
            if e.tls:
                out.append(_not_run(ctx, tid, "BLOCKED_BY_DNS" if e.name in missed else "ADDRESS_UNRESOLVED"))
            continue
        state, codes = _tcp_result(ctx, addr, e.port)
        out.append(_obs(ctx, eid, state, started, codes) if state != N else _not_run(ctx, eid, *codes))
        if not e.tls:
            continue
        if state != P:
            out.append(_not_run(ctx, tid, "BLOCKED_BY_ENDPOINT"))
            continue
        t0 = ctx.monotonic()
        t = ctx.timeout(ctx.config.connect_timeout_s)
        if t <= 0:
            out.append(_not_run(ctx, tid, "CYCLE_BUDGET_EXHAUSTED"))
            continue
        status = ctx.probe.tls_handshake(e.host, addr, e.port, t).status
        if status == probes.OK:
            out.append(_obs(ctx, tid, P, t0, ["TLS_HANDSHAKE_OK"]))
        elif status == probes.TLS_CERT:
            out.append(_obs(ctx, tid, F, t0, ["TLS_CERT_INVALID"]))
        elif status == probes.TLS_ERROR:
            out.append(_obs(ctx, tid, F, t0, ["TLS_HANDSHAKE_FAILED"]))
        else:
            out.append(_obs(ctx, tid, U, t0, ["TLS_PROBE_INCONCLUSIVE"]))
    return out


def _read(ctx: CollectContext, path: str):
    try:
        return ctx.host.read_text(path), None
    except PermissionError:
        return None, "PERMISSION_DENIED"
    except OSError:
        return None, "SOURCE_UNAVAILABLE"


def collect_disk(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    try:
        free = ctx.host.disk_free_mb(ctx.config.disk_path)
    except PermissionError:
        return _obs(ctx, "disk", U, started, ["PERMISSION_DENIED"])
    except (OSError, ValueError):
        return _obs(ctx, "disk", U, started, ["SOURCE_UNAVAILABLE"])
    low = free < ctx.config.disk_free_min_mb
    return _obs(ctx, "disk", F if low else P, started, ["DISK_FREE_LOW" if low else "DISK_FREE_OK"])


def collect_memory(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    text, err = _read(ctx, "/proc/meminfo")
    if err:
        return _obs(ctx, "memory", U, started, [err])
    m = re.search(r"^MemAvailable:\s+(\d+)\s+kB", text, re.M)
    if not m:
        return _obs(ctx, "memory", U, started, ["MALFORMED_OUTPUT"])
    low = int(m.group(1)) / 1024 < ctx.config.mem_available_min_mb
    return _obs(ctx, "memory", F if low else P, started, ["MEMORY_AVAILABLE_LOW" if low else "MEMORY_AVAILABLE_OK"])


def collect_temperature(ctx: CollectContext) -> Observation:
    started = ctx.monotonic()
    text, err = _read(ctx, "/sys/class/thermal/thermal_zone0/temp")
    if err:
        return _obs(ctx, "temperature", U, started, [err])
    if not text.strip().lstrip("-").isdigit():
        return _obs(ctx, "temperature", U, started, ["MALFORMED_OUTPUT"])
    hot = int(text.strip()) / 1000.0 > ctx.config.temp_max_c
    return _obs(ctx, "temperature", F if hot else P, started, ["TEMPERATURE_HIGH" if hot else "TEMPERATURE_OK"])


def _guard(ctx: CollectContext, check_id: str, fn: Callable[[CollectContext], Observation]) -> Observation:
    try:
        return fn(ctx)
    except Exception as exc:  # a collector bug must never take the cycle down
        return Observation(check_id, U, ctx.clock(), None, ("COLLECTOR_ERROR",), type(exc).__name__)


def collect_all(ctx: CollectContext) -> List[Observation]:
    """Cheap local checks first, slow network probes last. link/ipv4/route are definitive kernel state, so a FAIL
    there blocks everything above it (NOT_RUN). Gateway evidence is inferential and never blocks."""
    out: List[Observation] = []
    blocker: Optional[str] = None
    for check_id, fn in (("link", collect_link), ("ipv4", collect_ipv4), ("route", collect_route)):
        if blocker:
            out.append(_not_run(ctx, check_id, f"BLOCKED_BY_{blocker.upper()}"))
            continue
        o = _guard(ctx, check_id, fn)
        out.append(o)
        if o.state == F:
            blocker = check_id
    out.append(_not_run(ctx, "gateway", f"BLOCKED_BY_{blocker.upper()}") if blocker
               else _guard(ctx, "gateway", collect_gateway))
    for check_id, fn in (("listener_unit", collect_listener_unit), ("cups_scheduler", collect_cups),
                         ("disk", collect_disk), ("memory", collect_memory), ("temperature", collect_temperature),
                         ("tailscale", collect_tailscale)):
        out.append(_guard(ctx, check_id, fn))
    if blocker:
        code = f"BLOCKED_BY_{blocker.upper()}"
        out.append(_not_run(ctx, "dns", code))
        for e in ctx.config.endpoints:
            out.append(_not_run(ctx, f"endpoint.{e.name}", code))
            if e.tls:
                out.append(_not_run(ctx, f"tls.{e.name}", code))
        return out
    out.append(_guard(ctx, "dns", collect_dns))
    try:
        out.extend(collect_endpoints(ctx))
    except Exception as exc:
        for e in ctx.config.endpoints:
            out.append(Observation(f"endpoint.{e.name}", U, ctx.clock(), None, ("COLLECTOR_ERROR",), type(exc).__name__))
            if e.tls:
                out.append(Observation(f"tls.{e.name}", U, ctx.clock(), None, ("COLLECTOR_ERROR",)))
    return out
