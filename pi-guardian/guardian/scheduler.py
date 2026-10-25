"""Sequential, bounded collection cycles. One cycle at a time, no thread pool, no queue, no retry loop, no history."""
from __future__ import annotations

import dataclasses
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import classifier, collectors
from .collectors import CollectContext, expected_checks
from .config import GuardianConfig
from .model import Observation, State
from .probes import HostReader, NetworkProbe
from .runner import CommandRunner
from .snapshot import build_snapshot

MIN_SLEEP_S = 1.0
BUDGET_GRACE_S = 2.0  # allowance for process teardown before a cycle is flagged as having overrun


class CycleOverlapError(RuntimeError):
    pass


class Scheduler:
    def __init__(self, config: GuardianConfig, runner: CommandRunner, probe: NetworkProbe, host: HostReader,
                 clock: Callable[[], float] = time.time, monotonic: Callable[[], float] = time.monotonic):
        self.config, self.runner, self.probe, self.host = config, runner, probe, host
        self.clock, self.monotonic = clock, monotonic
        self._lock = threading.Lock()
        self._seq = 0
        self._memory: Dict[str, Any] = {}
        self._streaks: Dict[str, Tuple[State, int]] = {}  # one entry per known check id: bounded by config

    def _apply_streaks(self, observations: List[Observation]) -> List[Observation]:
        out = []
        for o in observations:
            prev = self._streaks.get(o.check_id)
            n = prev[1] + 1 if prev and prev[0] == o.state else 1
            self._streaks[o.check_id] = (o.state, n)
            out.append(dataclasses.replace(o, streak=n))
        return out

    def run_cycle(self) -> Dict[str, Any]:
        if not self._lock.acquire(blocking=False):
            raise CycleOverlapError("a collection cycle is already running")
        try:
            return self._cycle()
        finally:
            self._lock.release()

    def _cycle(self) -> Dict[str, Any]:
        cfg = self.config
        expected = expected_checks(cfg)
        self._seq += 1
        started = self.monotonic()
        ctx = CollectContext(cfg, self.runner, self.probe, self.host, self.clock, self.monotonic,
                             started + cfg.cycle_budget_s, memory=self._memory)
        try:
            observations = self._apply_streaks(collectors.collect_all(ctx))
            duration_ms = int((self.monotonic() - started) * 1000)
            exceeded = (self.monotonic() - started) > cfg.cycle_budget_s + BUDGET_GRACE_S
            norm, diagnosis = classifier.classify(observations, expected, self.clock(), cfg.stale_after_s,
                                                  cfg.min_fail_streak)
            return build_snapshot(cfg, norm.values(), diagnosis, expected, self.clock(), self._seq, duration_ms, exceeded)
        except Exception:
            # Never let an internal bug escape: report every expected check as NOT_RUN so nothing reads as healthy.
            now = self.clock()
            fallback = [Observation(c, State.NOT_RUN, now, None, ("INTERNAL_ERROR",)) for c in sorted(expected)]
            diagnosis = classifier.Diagnosis("UNKNOWN", (), (), tuple(sorted(k for k, r in expected.items() if r)))
            return build_snapshot(cfg, fallback, diagnosis, expected, now, self._seq,
                                  int((self.monotonic() - started) * 1000), False)

    def run_forever(self, stop: threading.Event, on_snapshot: Optional[Callable[[Dict[str, Any]], None]] = None,
                    max_cycles: Optional[int] = None) -> int:
        """Run cycles until `stop` is set (or max_cycles). Sleeps on the event, so there is no busy loop; a late
        cycle is not followed by catch-up cycles. Returns the number of cycles run."""
        n = 0
        while not stop.is_set() and (max_cycles is None or n < max_cycles):
            began = self.monotonic()
            snap = self.run_cycle()
            n += 1
            if on_snapshot is not None:
                try:
                    on_snapshot(snap)
                except Exception:
                    pass  # an output problem must not stop observation
            if max_cycles is not None and n >= max_cycles:
                break
            stop.wait(max(MIN_SLEEP_S, self.config.cycle_interval_s - (self.monotonic() - began)))
        return n
