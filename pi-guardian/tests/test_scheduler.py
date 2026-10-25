import os
import tempfile
import threading
import unittest
from unittest import mock

from guardian import classifier
from guardian.runner import CommandResult, CommandRunner
from guardian.scheduler import MIN_SLEEP_S, CycleOverlapError, Scheduler
from guardian.simulation import FakeClock, Scenario
from guardian.snapshot import validate_snapshot
from tests.helpers import SCEN_DIR, K_CUPS, base_scenario, build, check, make_config, roots, use


class RecordingEvent:
    """Stands in for threading.Event: records requested waits and stops after `stop_after` of them."""

    def __init__(self, stop_after):
        self.waits, self.stop_after, self._set = [], stop_after, False

    def is_set(self):
        return self._set

    def wait(self, timeout=None):
        self.waits.append(timeout)
        if len(self.waits) >= self.stop_after:
            self._set = True
        return self._set


class BlockingRunner(CommandRunner):
    def __init__(self):
        self.entered, self.release = threading.Event(), threading.Event()

    def run(self, argv, timeout_s):
        self.entered.set()
        self.release.wait(5)
        return CommandResult("MISSING")


class SchedulerTest(unittest.TestCase):
    def test_cycle_returns_valid_snapshot_and_increments_seq(self):
        sched, _, _ = build()
        a, b = sched.run_cycle(), sched.run_cycle()
        self.assertEqual((a["seq"], b["seq"]), (1, 2))
        self.assertEqual(validate_snapshot(a), [])

    def test_overlapping_cycles_are_refused(self):
        clock = FakeClock()
        blocking = BlockingRunner()
        scenario = Scenario.from_dict(base_scenario(), SCEN_DIR, clock)
        sched = Scheduler(make_config(), blocking, scenario.probe, scenario.host, clock.time, clock.monotonic)
        result = {}
        t = threading.Thread(target=lambda: result.update(snap=sched.run_cycle()))
        t.start()
        self.assertTrue(blocking.entered.wait(5))
        with self.assertRaises(CycleOverlapError):
            sched.run_cycle()
        blocking.release.set()
        t.join(5)
        self.assertFalse(t.is_alive())
        self.assertEqual(result["snap"]["seq"], 1)
        sched.run_cycle()  # the lock was released, so later cycles work

    def test_lock_released_even_if_snapshot_building_fails(self):
        sched, _, _ = build()
        with mock.patch.object(classifier, "classify", side_effect=RuntimeError("bug")):
            snap = sched.run_cycle()
        self.assertEqual(snap["diagnosis"]["overall"], "UNKNOWN")
        self.assertEqual(roots(snap), [])
        self.assertTrue(all(c["state"] == "NOT_RUN" and c["evidence"] == ["INTERNAL_ERROR"] for c in snap["checks"]))
        self.assertEqual(validate_snapshot(snap), [])
        self.assertEqual(sched.run_cycle()["diagnosis"]["overall"], "HEALTHY")

    def test_cycle_stays_inside_its_budget(self):
        scn = base_scenario()
        for spec in scn["commands"].values():
            spec["elapsed_s"] = 2.5
        sched, _, clock = build(scn, cycle_budget_s=6, cycle_interval_s=60)
        t0 = clock.monotonic()
        snap = sched.run_cycle()
        self.assertLessEqual(clock.monotonic() - t0, 6.0 + 1e-6)
        self.assertFalse(snap["cycle"]["budgetExceeded"])
        self.assertFalse([c for c in snap["checks"] if c["state"] == "FAIL"])
        self.assertTrue(any("CYCLE_BUDGET_EXHAUSTED" in c["evidence"] for c in snap["checks"]))
        self.assertEqual(snap["diagnosis"]["overall"], "UNKNOWN")

    def test_failure_must_persist_across_cycles(self):
        sched, scenario, _ = build(min_fail_streak=2)
        scenario.runner.commands[K_CUPS] = {"stdout": "scheduler is not running\n"}
        first = sched.run_cycle()
        self.assertEqual(check(first, "cups_scheduler")["state"], "UNKNOWN")
        self.assertIn("FAIL_NOT_PERSISTENT", check(first, "cups_scheduler")["evidence"])
        self.assertEqual(roots(first), [])
        second = sched.run_cycle()
        self.assertEqual(roots(second), ["CUPS_FAILURE"])
        self.assertEqual(check(second, "cups_scheduler")["streak"], 2)

    def test_recovery_resets_streak(self):
        sched, scenario, _ = build(min_fail_streak=2)
        good = scenario.runner.commands[K_CUPS]
        scenario.runner.commands[K_CUPS] = {"stdout": "scheduler is not running\n"}
        sched.run_cycle()
        scenario.runner.commands[K_CUPS] = good
        sched.run_cycle()
        scenario.runner.commands[K_CUPS] = {"stdout": "scheduler is not running\n"}
        self.assertEqual(roots(sched.run_cycle()), [])

    def test_streak_table_is_bounded_by_the_check_set(self):
        sched, _, _ = build()
        for _ in range(5):
            sched.run_cycle()
        self.assertLessEqual(len(sched._streaks), 32)


class RunForeverTest(unittest.TestCase):
    def test_sleeps_between_cycles_and_stops(self):
        sched, _, clock = build()
        stop = RecordingEvent(stop_after=3)
        seen = []
        n = sched.run_forever(stop, on_snapshot=seen.append)
        self.assertEqual((n, len(seen)), (3, 3))
        self.assertEqual(len(stop.waits), 3)
        for w in stop.waits:
            self.assertGreaterEqual(w, MIN_SLEEP_S)
            self.assertLessEqual(w, 60.0)

    def test_no_busy_loop_when_cycles_overrun_the_interval(self):
        scn = base_scenario()
        for spec in scn["commands"].values():
            spec["elapsed_s"] = 2.9
        sched, _, _ = build(scn, cycle_interval_s=10, cycle_budget_s=10)
        stop = RecordingEvent(stop_after=2)
        sched.run_forever(stop)
        self.assertTrue(all(w >= MIN_SLEEP_S for w in stop.waits))

    def test_max_cycles_and_preset_stop(self):
        sched, _, _ = build()
        self.assertEqual(sched.run_forever(RecordingEvent(99), max_cycles=2), 2)
        done = threading.Event()
        done.set()
        self.assertEqual(sched.run_forever(done), 0)

    def test_callback_errors_do_not_stop_observation(self):
        sched, _, _ = build()

        def bad(_):
            raise OSError("stdout closed")
        self.assertEqual(sched.run_forever(RecordingEvent(2), on_snapshot=bad), 2)

    def test_shutdown_has_no_side_effects(self):
        sched, scenario, _ = build()
        threads_before = threading.active_count()
        with tempfile.TemporaryDirectory() as d:
            cwd = os.getcwd()
            os.chdir(d)
            try:
                stop = threading.Event()
                t = threading.Thread(target=lambda: sched.run_forever(stop, max_cycles=None))
                t.start()
                stop.set()
                t.join(10)
                self.assertFalse(t.is_alive())
                self.assertEqual(os.listdir(d), [])
            finally:
                os.chdir(cwd)
        self.assertEqual(threading.active_count(), threads_before)
        self.assertFalse(any(c[0] not in ("ip", "systemctl", "lpstat", "tailscale", "getent")
                             for c in scenario.runner.calls))


if __name__ == "__main__":
    unittest.main()
