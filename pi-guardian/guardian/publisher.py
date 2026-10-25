"""Phase 2C HTTPS publisher: signs and sends Phase 1 snapshots to POST /kiosk/guardian/health.

Implements exactly the signing scheme in
docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md sections 2-3.

Master-key isolation (hard requirement, structurally enforced, not just documented): this module
NEVER holds, derives, accepts, or logs the Guardian master secret. `PublisherConfig.derived_key` is
the per-kiosk signing key the backend already derived and provisioned to this kiosk out of band
(contract section 4.3) -- there is no parameter, method, or import anywhere in this file that
accepts a master key or calls guardian.crypto.derive_kiosk_key/hkdf_sha256. (Those exist in
crypto.py only for that module's own cross-language verification tests.)
tests/test_publisher.py's test_master_key_is_never_referenced_by_the_publisher_module asserts this
mechanically, by scanning this file's own source for the forbidden substrings.

Failure isolation: publish() can never raise -- every failure path returns a PublishResult.
Combined with guardian/scheduler.py's existing behaviour (an on_snapshot callback's exception is
swallowed, scheduler.py:86), a total publisher outage is exactly as safe as Phase 1 already
requires: local observation and the next scheduled cycle are completely unaffected. publish() also
bounds its own total wall-clock time (`PublisherConfig.publish_budget_s`) so even bounded retries
cannot meaningfully delay the next cycle.

Bounded retries vs. the contract's "one attempt per cycle" language (section 10): the contract
describes the backend-facing *steady-state* design as one attempt per cycle, relying on the next
cycle for a safe retry. This task explicitly asks for bounded in-call retries with backoff, which
is a slightly different (not incompatible) policy: this implementation keeps retries few (default
3 attempts), fast (small capped backoff) and strictly time-boxed (`publish_budget_s`, default well
under Guardian's own `cycle_budget_s` floor of 10s), so it cannot block or meaningfully delay
collection -- the actual safety property the contract's language was protecting. See the final
report for this phase for the explicit call-out.

`bootId` format and the stream-transition decision (Phase 2D correction): `bootId` is the Pi's
kernel boot UUID (`/proc/sys/kernel/random/boot_id` -- a value the Linux kernel generates fresh at
every boot, with no persistence needed on our side at all), lowercase hex with the dashes stripped
-- NOT a decimal integer, and NOT something this module invents by counting or timestamping. Phase
2C's first version of this file used `boot_id = int(clock())`, which does not match the contract's
intended "kernel boot UUID" design; this was corrected in Phase 2D. Reading that one kernel file is
a plain read-only `open()` call (never a write -- tests/test_static_safety.py only forbids write
modes), done through the existing injectable `HostReader` abstraction (guardian/probes.py), exactly
the same pattern Phase 1's own memory/temperature checks already use for other `/proc`/`/sys`
files. On any host where that file does not exist (anywhere off a real Linux kernel -- including
every dev/CI machine this was tested on), discovery falls back to a random 16-byte hex value,
generated once per process the same way `stream_id` already is.

Because a UUID carries no ordering information, the backend (Phase 2D) no longer decides "is this a
legitimate new stream" by comparing `bootId` values at all -- see
functions/src/guardian/ingest.service.js's module docstring. It instead requires a new stream's
signed `timestamp` to be strictly after the last request it accepted for this kiosk (in any
stream). `bootId` is sent and stored purely for operator-visible diagnostics ("this kiosk has
rebooted with these boot ids"); nothing in this module or the backend treats it as orderable.
"""
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional

from .crypto import canonical_string, hmac_sha256_hex, sha256_hex
from .model import sanitize_text
from .probes import HostReader, HttpsClient, HttpsPostError, HttpsResponse
from .snapshot import encode_snapshot

# The kernel generates a fresh UUID here at every boot (see man random(4)); reading it needs no
# local persistence at all. Content is e.g. "550e8400-e29b-41d4-a716-446655440000\n".
KERNEL_BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id"
_HEX32_RE = re.compile(r"^[0-9a-f]{32}$")


def _discover_boot_id(host: HostReader, random_bytes: Callable[[int], bytes]) -> str:
    """The kernel's own per-boot UUID, dashes stripped and lowercased; a fresh random value if that
    file is unreadable (any non-Linux host, or a Linux host without this proc entry)."""
    try:
        raw = host.read_text(KERNEL_BOOT_ID_PATH).strip().replace("-", "").lower()
    except OSError:
        raw = ""
    return raw if _HEX32_RE.match(raw) else random_bytes(16).hex()

POST_PATH = "/kiosk/guardian/health"

ACCEPTED, DUPLICATE, CONFLICT, CLIENT_ERROR, RATE_LIMITED, UNAVAILABLE, SERVER_ERROR, NETWORK_ERROR, \
    SKIPPED_BACKOFF = (
        "ACCEPTED", "DUPLICATE", "CONFLICT", "CLIENT_ERROR", "RATE_LIMITED", "UNAVAILABLE",
        "SERVER_ERROR", "NETWORK_ERROR", "SKIPPED_BACKOFF",
    )
_RETRYABLE = frozenset({RATE_LIMITED, UNAVAILABLE, SERVER_ERROR, NETWORK_ERROR})

# Contract section 10: clamp Retry-After so a misconfigured/hostile backend can never silence a
# kiosk's reporting indefinitely.
MAX_RETRY_AFTER_S = 600.0
MAX_DETAIL_LEN = 120


@dataclass(frozen=True)
class PublishResult:
    status: str
    http_status: "int | None" = None
    attempts: int = 0
    detail: str = ""


@dataclass(frozen=True, repr=False)
class PublisherConfig:
    host: str
    derived_key: bytes  # the per-kiosk signing key ONLY -- never a master key (see module docstring)
    # Phase 2F: which key version `derived_key` was actually derived for. This is a plain,
    # non-secret config value -- the Pi does not compute it (it never calls derive_kiosk_key, see
    # module docstring); whoever provisions a kiosk hands it both `derived_key` and the matching
    # `key_version` together, exactly as it would hand over `derived_key` alone today. Sent as the
    # X-Guardian-Key-Version header so the backend knows which version to verify against.
    key_version: int = 1
    port: int = 443
    path: str = POST_PATH
    connect_timeout_s: float = 5.0
    max_attempts: int = 3
    backoff_base_s: float = 0.5
    backoff_max_s: float = 2.0
    publish_budget_s: float = 8.0  # the whole publish() call, including all retries, is capped at this

    def __post_init__(self) -> None:
        if not isinstance(self.derived_key, bytes) or len(self.derived_key) != 32:
            raise ValueError("derived_key must be exactly 32 bytes (a per-kiosk key, never a master key)")
        if not isinstance(self.key_version, int) or isinstance(self.key_version, bool) or self.key_version < 1:
            raise ValueError(f"key_version must be a positive integer, got {self.key_version!r}")

    def __repr__(self) -> str:
        # dataclass(repr=False) above suppresses the auto-generated repr, which would otherwise
        # print derived_key's raw bytes -- e.g. in a traceback, a debugger, or `logging.info(cfg)`.
        return (f"PublisherConfig(host={self.host!r}, derived_key=<redacted 32 bytes>, "
                f"key_version={self.key_version!r}, port={self.port!r}, "
                f"path={self.path!r}, connect_timeout_s={self.connect_timeout_s!r}, "
                f"max_attempts={self.max_attempts!r})")


class Publisher:
    """One instance per Guardian process. Use as a Scheduler on_snapshot callback via `.publish`,
    e.g. `Scheduler(...).run_forever(stop, on_snapshot=lambda snap: publisher.publish(snap))`."""

    def __init__(self, config: PublisherConfig, https: HttpsClient, clock: Callable[[], float] = time.time,
                 sleep: Callable[[float], None] = time.sleep, random_bytes: Callable[[int], bytes] = os.urandom,
                 host: Optional[HostReader] = None):
        self._cfg = config
        self._https = https
        self._clock = clock
        self._sleep = sleep
        self.stream_id = random_bytes(16).hex()
        self.boot_id = _discover_boot_id(host or HostReader(), random_bytes)
        self._paused_until: float = 0.0

    def publish(self, snapshot: Dict) -> PublishResult:
        """Signs and sends one snapshot. Never raises. `snapshot` must already be a valid, frozen
        Phase 1 snapshot dict (e.g. straight from Scheduler.run_cycle()/build_snapshot()) --
        this function re-encodes it with encode_snapshot(), which re-validates it, so a malformed
        snapshot fails loudly here rather than being silently sent."""
        now = self._clock()
        if now < self._paused_until:
            return PublishResult(SKIPPED_BACKOFF, detail="backoff window from a previous 429/503")

        try:
            body = encode_snapshot(snapshot).encode("utf-8")
        except Exception as exc:  # noqa: BLE001 - publish() must never raise
            return PublishResult(CLIENT_ERROR, detail=sanitize_text(f"invalid snapshot: {type(exc).__name__}", MAX_DETAIL_LEN))

        seq = snapshot.get("seq")
        kiosk_id = snapshot.get("kioskId")
        deadline = now + self._cfg.publish_budget_s

        attempts = 0
        last: Optional[PublishResult] = None
        while attempts < self._cfg.max_attempts and self._clock() < deadline:
            attempts += 1
            try:
                outcome = self._attempt(kiosk_id, seq, body, deadline)
            except Exception as exc:  # noqa: BLE001 - publish() must never raise
                outcome = PublishResult(NETWORK_ERROR, detail=sanitize_text(f"unexpected: {type(exc).__name__}", MAX_DETAIL_LEN))
            last = PublishResult(outcome.status, outcome.http_status, attempts, outcome.detail)
            if outcome.status not in _RETRYABLE:
                return last
            self._maybe_backoff(attempts, deadline)

        return last if last is not None else PublishResult(NETWORK_ERROR, attempts=attempts, detail="exhausted")

    def _attempt(self, kiosk_id, seq, body: bytes, deadline: float) -> PublishResult:
        timestamp = int(self._clock())
        body_sha256_hex = sha256_hex(body)
        canonical = canonical_string(
            method="POST", path=self._cfg.path, kiosk_id=kiosk_id, stream_id=self.stream_id,
            boot_id=self.boot_id, seq=seq, timestamp=timestamp, body_sha256_hex=body_sha256_hex,
        )
        signature = hmac_sha256_hex(self._cfg.derived_key, canonical)
        headers = {
            "Content-Type": "application/json",
            "X-Guardian-Kiosk-Id": kiosk_id,
            "X-Guardian-Stream-Id": self.stream_id,
            "X-Guardian-Boot-Id": self.boot_id,
            "X-Guardian-Timestamp": str(timestamp),
            "X-Guardian-Key-Version": str(self._cfg.key_version),
            "X-Guardian-Signature": signature,
        }
        remaining = max(0.1, min(self._cfg.connect_timeout_s, deadline - self._clock()))
        try:
            response = self._https.post_json(self._cfg.host, self._cfg.port, self._cfg.path, headers, body, remaining)
        except HttpsPostError as exc:
            return PublishResult(NETWORK_ERROR, detail=sanitize_text(exc.kind, MAX_DETAIL_LEN))
        outcome = self._classify(response)
        if response.status_code in (429, 503):
            self._apply_retry_after(response.headers)
        return outcome

    def _classify(self, response: HttpsResponse) -> PublishResult:
        code = response.status_code
        detail = self._safe_detail(response)
        if code == 202:
            status = ACCEPTED
            try:
                parsed = json.loads(response.body.decode("utf-8")) if response.body else {}
                if isinstance(parsed, dict) and parsed.get("status") == "duplicate":
                    status = DUPLICATE
            except (ValueError, UnicodeDecodeError):
                pass
            return PublishResult(status, http_status=code, detail=detail)
        if code == 409:
            return PublishResult(CONFLICT, http_status=code, detail=detail)
        if code in (400, 401, 403, 413):
            return PublishResult(CLIENT_ERROR, http_status=code, detail=detail)
        if code == 429:
            return PublishResult(RATE_LIMITED, http_status=code, detail=detail)
        if code == 503:
            return PublishResult(UNAVAILABLE, http_status=code, detail=detail)
        if 500 <= code < 600:
            return PublishResult(SERVER_ERROR, http_status=code, detail=detail)
        return PublishResult(CLIENT_ERROR, http_status=code, detail=detail or "unexpected status")

    @staticmethod
    def _safe_detail(response: HttpsResponse) -> str:
        """A short, sanitised diagnostic string from the response body -- never the request we
        sent, so it can never contain our own signature or key material."""
        if not response.body:
            return ""
        try:
            return sanitize_text(response.body.decode("utf-8", "replace"), MAX_DETAIL_LEN)
        except Exception:  # noqa: BLE001 - diagnostics must never raise
            return ""

    def _apply_retry_after(self, headers: Dict[str, str]) -> None:
        raw = headers.get("retry-after")
        if raw is None:
            return
        try:
            seconds = min(float(raw), MAX_RETRY_AFTER_S)
        except ValueError:
            return
        self._paused_until = max(self._paused_until, self._clock() + max(0.0, seconds))

    def _maybe_backoff(self, attempt: int, deadline: float) -> None:
        if attempt >= self._cfg.max_attempts:
            return
        delay = min(self._cfg.backoff_base_s * (2 ** (attempt - 1)), self._cfg.backoff_max_s)
        delay = min(delay, max(0.0, deadline - self._clock()))
        if delay > 0:
            self._sleep(delay)
