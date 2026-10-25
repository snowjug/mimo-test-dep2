"""Local runner. Prints snapshots to stdout and nothing else: no publishing, no files written, no control actions.

  python -m guardian --config CONFIG --scenario SCENARIO --once      (fully offline, synthetic data)
  python -m guardian --config CONFIG --once                          (REAL local probes; see README)
"""
from __future__ import annotations

import argparse
import json
import signal
import sys
import threading

from .config import ConfigError, load_config
from .model import sanitize_text
from .probes import HostReader, SocketProbe
from .runner import SubprocessRunner
from .scheduler import Scheduler
from .simulation import Scenario


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="guardian", description="MIMO Edge Guardian, Phase 1 (local, read-only)")
    ap.add_argument("--config", required=True, help="path to a Guardian JSON config")
    ap.add_argument("--scenario", help="offline scenario JSON; uses synthetic command output and no network")
    ap.add_argument("--once", action="store_true", help="run a single cycle and exit")
    ap.add_argument("--cycles", type=int, help="run this many cycles and exit")
    ap.add_argument("--pretty", action="store_true", help="indent the JSON output")
    args = ap.parse_args(argv)

    try:
        config = load_config(args.config)
    except ConfigError as exc:
        for err in exc.errors:
            print("config error: " + sanitize_text(err, 200), file=sys.stderr)
        return 2

    if args.scenario:
        scenario = Scenario.load(args.scenario)
        sched = Scheduler(config, scenario.runner, scenario.probe, scenario.host)
    else:
        sched = Scheduler(config, SubprocessRunner(), SocketProbe(), HostReader())

    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, lambda *_: stop.set())
        except (ValueError, OSError):
            pass

    def emit(snap) -> None:
        print(json.dumps(snap, indent=2 if args.pretty else None, sort_keys=True), flush=True)

    cycles = 1 if args.once else args.cycles
    sched.run_forever(stop, on_snapshot=emit, max_cycles=cycles)
    return 0


if __name__ == "__main__":
    sys.exit(main())
