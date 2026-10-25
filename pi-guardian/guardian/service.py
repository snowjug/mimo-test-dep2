"""Production continuous-run entrypoint. Wires the real Phase 1 Scheduler (local, read-only
collection) to the real Phase 2C/2F Publisher (HTTPS reporting to the backend), exactly as
publisher.py's own module docstring documents it should be used:
`Scheduler(...).run_forever(stop, on_snapshot=lambda snap: publisher.publish(snap))`.

Unlike guardian/__main__.py (Phase 1, prints each snapshot to stdout and never publishes -- see
that module's own docstring), this is the entrypoint meant to run as a long-lived service on a real
kiosk:

  python -m guardian.service --config /etc/mimo-guardian/guardian-config.json

It never prints a snapshot (avoids leaking kiosk health detail into service logs) and never accepts
a master key -- only an already-derived per-kiosk key, read from this process's environment (meant
to be supplied via systemd's EnvironmentFile=, a root-only-readable file created on the device,
never committed to this repository and never passed as a command-line argument, where it would be
visible to any other local process via `ps`). See deploy/README.md for the full setup.

Required environment variables (mirrors guardian.publisher.PublisherConfig):
  GUARDIAN_API_HOST         e.g. "api-upqxuj7evq-uc.a.run.app" (no scheme, no path)
  GUARDIAN_DERIVED_KEY_HEX  64 hex characters (32 bytes) -- the per-kiosk key, never the master key
  GUARDIAN_KEY_VERSION      optional, default "1"
"""
from __future__ import annotations

import argparse
import os
import re
import signal
import sys
import threading
from typing import Dict

from .config import ConfigError, load_config
from .model import sanitize_text
from .probes import HostReader, SocketHttpsClient, SocketProbe
from .publisher import Publisher, PublisherConfig
from .runner import SubprocessRunner
from .scheduler import Scheduler

_HEX64_RE = re.compile(r"^[0-9a-fA-F]{64}$")


def publisher_from_env(env: Dict[str, str]) -> Publisher:
    """Builds a real Publisher from environment variables. Raises SystemExit with a clear,
    secret-free message on any missing/malformed value -- a misconfigured service must fail loudly
    at startup, not silently skip publishing forever."""
    host = env.get("GUARDIAN_API_HOST")
    if not host:
        raise SystemExit("GUARDIAN_API_HOST is required")
    key_hex = env.get("GUARDIAN_DERIVED_KEY_HEX")
    if not key_hex or not _HEX64_RE.match(key_hex):
        raise SystemExit("GUARDIAN_DERIVED_KEY_HEX must be set to 64 hex characters (32 bytes)")
    key_version_raw = env.get("GUARDIAN_KEY_VERSION", "1")
    try:
        key_version = int(key_version_raw)
    except ValueError:
        raise SystemExit(f"GUARDIAN_KEY_VERSION must be an integer, got {key_version_raw!r}")

    cfg = PublisherConfig(host=host, derived_key=bytes.fromhex(key_hex), key_version=key_version)
    return Publisher(cfg, SocketHttpsClient(use_tls=True))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="guardian.service",
        description="MIMO Edge Guardian -- continuous local observation + HTTPS reporting service",
    )
    ap.add_argument("--config", required=True, help="path to a Guardian JSON config")
    args = ap.parse_args(argv)

    try:
        config = load_config(args.config)
    except ConfigError as exc:
        for err in exc.errors:
            print("config error: " + sanitize_text(err, 200), file=sys.stderr)
        return 2

    publisher = publisher_from_env(os.environ)
    sched = Scheduler(config, SubprocessRunner(), SocketProbe(), HostReader())

    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, lambda *_: stop.set())
        except (ValueError, OSError):
            pass

    sched.run_forever(stop, on_snapshot=publisher.publish)
    return 0


if __name__ == "__main__":
    sys.exit(main())
