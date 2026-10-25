"""Strictly validated Guardian configuration. Unknown keys, wrong types and out-of-range values are rejected."""
from __future__ import annotations

import ipaddress
import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

MAX_CONFIG_BYTES = 65536
MAX_ENDPOINTS = 6

_KIOSK_ID_RE = re.compile(r"^[A-Z]{2}-\d{3}$")  # same shape as KIOSK_ID_PATTERN in functions/
_IFACE_RE = re.compile(r"^[a-z][a-z0-9_.-]{0,14}$")
_NAME_RE = re.compile(r"^[a-z0-9_]{1,24}$")
_UNIT_RE = re.compile(r"^[A-Za-z0-9@_.:-]{1,64}\.service$")
_HOST_RE = re.compile(
    r"^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)


class ConfigError(ValueError):
    def __init__(self, errors: List[str]):
        self.errors = list(errors)
        super().__init__("; ".join(self.errors))


@dataclass(frozen=True)
class Endpoint:
    name: str
    host: str
    port: int
    tls: bool

    @property
    def is_ip_literal(self) -> bool:
        return _is_ip(self.host)


@dataclass(frozen=True)
class GuardianConfig:
    kiosk_id: str = "ZZ-000"  # synthetic placeholder, not a real kiosk
    interfaces: Tuple[str, ...] = ()
    cycle_interval_s: float = 60.0
    cycle_budget_s: float = 20.0
    command_timeout_s: float = 3.0
    connect_timeout_s: float = 3.0
    tcp_attempts: int = 2
    stale_after_s: float = 180.0
    min_fail_streak: int = 2
    endpoints: Tuple[Endpoint, ...] = ()
    listener_unit: Optional[str] = "mimo-listener.service"
    listener_restart_threshold: int = 3
    check_cups: bool = True
    tailscale_enabled: bool = False
    disk_path: str = "/"
    disk_free_min_mb: float = 200.0
    mem_available_min_mb: float = 50.0
    temp_max_c: float = 80.0


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def _num(raw: Dict[str, Any], key: str, default: float, lo: float, hi: float, errors: List[str]) -> float:
    if key not in raw:
        return default
    v = raw[key]
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v:
        errors.append(f"{key}: must be a number")
        return default
    if not lo <= v <= hi:
        errors.append(f"{key}: must be between {lo} and {hi}")
        return default
    return float(v)


def _int(raw: Dict[str, Any], key: str, default: int, lo: int, hi: int, errors: List[str]) -> int:
    if key not in raw:
        return default
    v = raw[key]
    if isinstance(v, bool) or not isinstance(v, int):
        errors.append(f"{key}: must be an integer")
        return default
    if not lo <= v <= hi:
        errors.append(f"{key}: must be between {lo} and {hi}")
        return default
    return v


def _bool(raw: Dict[str, Any], key: str, default: bool, errors: List[str]) -> bool:
    if key not in raw:
        return default
    if not isinstance(raw[key], bool):
        errors.append(f"{key}: must be true or false")
        return default
    return raw[key]


def _parse_endpoints(value: Any, errors: List[str]) -> Tuple[Endpoint, ...]:
    if not isinstance(value, list) or not value:
        errors.append("endpoints: must be a non-empty list (at least one is required; two or more recommended)")
        return ()
    if len(value) > MAX_ENDPOINTS:
        errors.append(f"endpoints: at most {MAX_ENDPOINTS} allowed")
        return ()
    out: List[Endpoint] = []
    seen = set()
    for i, item in enumerate(value):
        where = f"endpoints[{i}]"
        if not isinstance(item, dict):
            errors.append(f"{where}: must be an object")
            continue
        unknown = set(item) - {"name", "host", "port", "tls"}
        if unknown:
            errors.append(f"{where}: unknown keys {sorted(unknown)}")
        name, host = item.get("name"), item.get("host")
        port = item.get("port", 443)
        if not isinstance(name, str) or not _NAME_RE.match(name):
            errors.append(f"{where}.name: must match {_NAME_RE.pattern}")
            continue
        if name in seen:
            errors.append(f"{where}.name: duplicate '{name}'")
            continue
        if not isinstance(host, str) or not (_is_ip(host) or _HOST_RE.match(host)):
            errors.append(f"{where}.host: must be a bare hostname or IP address (no scheme, path or port)")
            continue
        if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
            errors.append(f"{where}.port: must be an integer 1-65535")
            continue
        tls = item.get("tls", port == 443)
        if not isinstance(tls, bool):
            errors.append(f"{where}.tls: must be true or false")
            continue
        seen.add(name)
        out.append(Endpoint(name, host, port, tls))
    return tuple(out)


_KNOWN_KEYS = {f for f in GuardianConfig.__dataclass_fields__}


def parse_config(raw: Any) -> GuardianConfig:
    errors: List[str] = []
    if not isinstance(raw, dict):
        raise ConfigError(["config must be a JSON object"])
    unknown = set(raw) - _KNOWN_KEYS
    if unknown:
        errors.append(f"unknown keys: {sorted(unknown)}")
    d = GuardianConfig()

    kiosk_id = raw.get("kiosk_id", d.kiosk_id)
    if not isinstance(kiosk_id, str) or not _KIOSK_ID_RE.match(kiosk_id):
        errors.append("kiosk_id: must look like 'AB-123'")
        kiosk_id = d.kiosk_id

    ifaces = raw.get("interfaces", [])
    if not isinstance(ifaces, list) or len(ifaces) > 4 \
            or not all(isinstance(i, str) and _IFACE_RE.match(i) for i in ifaces):
        errors.append("interfaces: must be a list of at most 4 interface names (empty = auto-detect)")
        ifaces = []

    unit = raw.get("listener_unit", d.listener_unit)
    if unit is not None and (not isinstance(unit, str) or not _UNIT_RE.match(unit)):
        errors.append("listener_unit: must be a '*.service' name or null")
        unit = d.listener_unit

    disk_path = raw.get("disk_path", d.disk_path)
    if not isinstance(disk_path, str) or not disk_path or len(disk_path) > 200 or "\x00" in disk_path:
        errors.append("disk_path: must be a non-empty path string")
        disk_path = d.disk_path

    interval = _num(raw, "cycle_interval_s", d.cycle_interval_s, 10, 3600, errors)
    budget = _num(raw, "cycle_budget_s", d.cycle_budget_s, 2, 120, errors)
    cmd_timeout = _num(raw, "command_timeout_s", d.command_timeout_s, 0.5, 10, errors)
    conn_timeout = _num(raw, "connect_timeout_s", d.connect_timeout_s, 0.5, 10, errors)
    stale = _num(raw, "stale_after_s", d.stale_after_s, 10, 86400, errors)
    if budget > interval:
        errors.append("cycle_budget_s: must not exceed cycle_interval_s")
    if stale < interval:
        errors.append("stale_after_s: must be at least cycle_interval_s")

    cfg = GuardianConfig(
        kiosk_id=kiosk_id,
        interfaces=tuple(ifaces),
        cycle_interval_s=interval,
        cycle_budget_s=budget,
        command_timeout_s=cmd_timeout,
        connect_timeout_s=conn_timeout,
        tcp_attempts=_int(raw, "tcp_attempts", d.tcp_attempts, 1, 3, errors),
        stale_after_s=stale,
        min_fail_streak=_int(raw, "min_fail_streak", d.min_fail_streak, 1, 5, errors),
        endpoints=_parse_endpoints(raw.get("endpoints"), errors),
        listener_unit=unit,
        listener_restart_threshold=_int(raw, "listener_restart_threshold", d.listener_restart_threshold, 1, 100, errors),
        check_cups=_bool(raw, "check_cups", d.check_cups, errors),
        tailscale_enabled=_bool(raw, "tailscale_enabled", d.tailscale_enabled, errors),
        disk_path=disk_path,
        disk_free_min_mb=_num(raw, "disk_free_min_mb", d.disk_free_min_mb, 1, 10_000_000, errors),
        mem_available_min_mb=_num(raw, "mem_available_min_mb", d.mem_available_min_mb, 1, 1_000_000, errors),
        temp_max_c=_num(raw, "temp_max_c", d.temp_max_c, 30, 120, errors),
    )
    if errors:
        raise ConfigError(errors)
    return cfg


def load_config(path: str) -> GuardianConfig:
    """Read-only. The file is size-bounded and must be a JSON object."""
    try:
        with open(path, "rb") as fh:
            data = fh.read(MAX_CONFIG_BYTES + 1)
    except OSError as exc:
        raise ConfigError([f"cannot read config: {type(exc).__name__}"])
    if len(data) > MAX_CONFIG_BYTES:
        raise ConfigError([f"config file larger than {MAX_CONFIG_BYTES} bytes"])
    try:
        raw = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise ConfigError(["config is not valid UTF-8 JSON"])
    return parse_config(raw)
