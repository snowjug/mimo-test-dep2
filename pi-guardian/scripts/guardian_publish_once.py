#!/usr/bin/env python3
"""MIMO Edge Guardian -- Phase 2D end-to-end integration test helper.

Spawned as a *subprocess* by functions/__tests__/guardianE2E.integration.test.js (Node) to exercise
the REAL Python publisher (guardian.publisher.Publisher) and the REAL guardian.crypto signing code
against a REAL local HTTP server, without reimplementing either side in test code. It is test-only
tooling, not a Guardian module: it lives outside pi-guardian/guardian/ on purpose, so none of
tests/test_static_safety.py's invariants for that package apply to it (it is explicitly allowed to
do things a real Guardian deployment never would, like taking a key over an environment variable or
connecting over plain HTTP for `use_tls=false`).

Never run this against anything but a local test server. It never touches production Firebase,
Secret Manager, or a live kiosk, and the master key never appears here -- only an already-derived
per-kiosk key the test harness computed itself (see guardian.crypto.derive_kiosk_key, test-only
in this exact same sense).

Input: a single JSON object on the GUARDIAN_TEST_PARAMS environment variable:
  host               str, required
  port               int, required
  kiosk_id           str, required (e.g. "AB-123")
  derived_key_hex    str, required, 64 hex chars (32 bytes) -- an already-derived per-kiosk key
  key_version        int, optional, default 1 -- which version `derived_key_hex` was derived for
  seq                int, required
  overall            str, optional, default "UNKNOWN"
  stream_id          str, optional override (32 lowercase hex chars) -- default: a fresh random one
  timestamp_offset_s number, optional, default 0 -- shifts the signed request timestamp
  max_attempts       int, optional, default 1
  use_tls            bool, optional, default false (plain HTTP, for the local test server)
  connect_timeout_s  number, optional, default 5

Output: a single JSON object on stdout:
  { "status", "http_status", "attempts", "detail", "stream_id", "boot_id" }
Never the derived key, never the computed signature.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # .../pi-guardian

from guardian.probes import SocketHttpsClient  # noqa: E402
from guardian.publisher import Publisher, PublisherConfig  # noqa: E402


def make_snapshot(kiosk_id: str, seq: int, overall: str) -> dict:
    return {
        "schemaVersion": 1,
        "agentVersion": "0.1.0-phase1",
        "kioskId": kiosk_id,
        "seq": seq,
        "observedAt": "2027-01-15T12:00:00Z",
        "cycle": {"durationMs": 10, "budgetMs": 20000, "budgetExceeded": False, "detailsDropped": False},
        "checks": [],
        "diagnosis": {"overall": overall, "rootCauses": [], "cascades": [], "unknown": []},
    }


def main() -> int:
    raw = os.environ.get("GUARDIAN_TEST_PARAMS")
    if not raw:
        print(json.dumps({"status": "SCRIPT_ERROR", "detail": "GUARDIAN_TEST_PARAMS not set"}))
        return 2
    params = json.loads(raw)

    offset = float(params.get("timestamp_offset_s", 0))
    clock = (lambda: time.time() + offset) if offset else time.time

    cfg = PublisherConfig(
        host=params["host"],
        derived_key=bytes.fromhex(params["derived_key_hex"]),
        key_version=int(params.get("key_version", 1)),
        port=int(params["port"]),
        connect_timeout_s=float(params.get("connect_timeout_s", 5)),
        max_attempts=int(params.get("max_attempts", 1)),
    )
    https = SocketHttpsClient(use_tls=bool(params.get("use_tls", False)))
    publisher = Publisher(cfg, https, clock=clock)

    stream_override = params.get("stream_id")
    if stream_override:
        publisher.stream_id = stream_override

    snapshot = make_snapshot(params["kiosk_id"], int(params["seq"]), params.get("overall", "UNKNOWN"))
    result = publisher.publish(snapshot)

    print(json.dumps({
        "status": result.status,
        "http_status": result.http_status,
        "attempts": result.attempts,
        "detail": result.detail,
        "stream_id": publisher.stream_id,
        "boot_id": publisher.boot_id,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
