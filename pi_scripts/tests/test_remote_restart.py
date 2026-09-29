"""Admin "Restart Pi": the Pi reboots once for a fresh request, waits for printing to finish, and can never loop."""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
from test_listener_inputs import _load_listener  # noqa: E402

L = _load_listener()
NOW = datetime(2026, 9, 29, 12, 0, tzinfo=timezone.utc)


class FakeRef:
    def __init__(self, data=None, fail_update=False):
        self.updates, self.data, self.fail_update = [], data, fail_update

    def update(self, data, timeout=None):
        if self.fail_update:
            raise RuntimeError("offline")
        self.updates.append(data)

    def get(self):
        return SimpleNamespace(exists=self.data is not None, to_dict=lambda: self.data)


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def time(self):
        return self.t

    def sleep(self, s):
        self.t += s


def ok_run(*a, **k):
    return SimpleNamespace(returncode=0, stdout="", stderr="")


_ids = iter(range(10**6))


def cmd(**over):
    base = {"action": "reboot", "status": "pending", "commandId": f"c{next(_ids)}", "requestedAt": NOW - timedelta(seconds=20)}
    base.update(over)
    return base


class RemoteRestartTest(unittest.TestCase):
    def setUp(self):
        L._restarts_started.clear()
        self.safe = mock.patch.object(L, "safe_update", side_effect=lambda ref, data: ref.update(data))
        self.safe.start()

    def tearDown(self):
        self.safe.stop()

    def test_fresh_request_reboots_after_marking_the_command(self):
        ref, calls = FakeRef(), []
        run = lambda c, **k: calls.append(c) or ok_run()
        out = L.handle_restart_command(cmd(), ref=ref, clock=FakeClock(), idle=lambda: True, run=run, now=NOW)
        self.assertEqual(out, "rebooting")
        self.assertEqual(calls, [L.REBOOT_COMMAND])
        self.assertEqual([u["status"] for u in ref.updates], ["waiting_idle", "rebooting"])

    def test_only_pending_reboot_commands_do_anything(self):
        for c in (cmd(status="rebooting"), cmd(status="done"), cmd(action="format"), None):
            ref, run = FakeRef(), mock.Mock()
            self.assertEqual(L.handle_restart_command(c, ref=ref, run=run, now=NOW), "ignored")
            run.assert_not_called()

    def test_old_request_is_expired_not_executed(self):
        ref, run = FakeRef(), mock.Mock()
        out = L.handle_restart_command(cmd(requestedAt=NOW - timedelta(hours=2)), ref=ref, run=run, now=NOW)
        self.assertEqual(out, "expired")
        run.assert_not_called()
        self.assertEqual(ref.updates[0]["status"], "expired")

    def test_waits_for_the_current_print_then_restarts(self):
        clock, states = FakeClock(), iter([False, False, True, True])
        out = L.handle_restart_command(cmd(), ref=FakeRef(), clock=clock, idle=lambda: next(states), run=ok_run, now=NOW)
        self.assertEqual(out, "rebooting")
        self.assertEqual(clock.t, 10)

    def test_stuck_printer_restarts_after_the_wait_limit(self):
        clock, ref = FakeClock(), FakeRef()
        out = L.handle_restart_command(cmd(), ref=ref, clock=clock, idle=lambda: False, run=ok_run, now=NOW)
        self.assertEqual(out, "rebooting")
        self.assertGreaterEqual(clock.t, L.RESTART_IDLE_WAIT_SEC)
        self.assertIn("anyway", ref.updates[-1]["message"])

    def test_no_reboot_if_the_command_cannot_be_marked(self):
        run = mock.Mock()
        with mock.patch.object(L, "safe_update"):
            out = L.handle_restart_command(cmd(), ref=FakeRef(fail_update=True), clock=FakeClock(), idle=lambda: True, run=run, now=NOW)
        self.assertEqual(out, "failed")
        run.assert_not_called()

    def test_reboot_permission_error_is_reported(self):
        ref = FakeRef()
        bad = lambda *a, **k: SimpleNamespace(returncode=1, stdout="", stderr="sudo: a password is required")
        out = L.handle_restart_command(cmd(), ref=ref, clock=FakeClock(), idle=lambda: True, run=bad, now=NOW)
        self.assertEqual(out, "failed")
        self.assertIn("password is required", ref.updates[-1]["message"])

    def test_same_command_seen_twice_reboots_once(self):
        c, calls = cmd(), []
        run = lambda x, **k: calls.append(x) or ok_run()
        L.handle_restart_command(c, ref=FakeRef(), clock=FakeClock(), idle=lambda: True, run=run, now=NOW)
        self.assertEqual(L.handle_restart_command(c, ref=FakeRef(), clock=FakeClock(), idle=lambda: True, run=run, now=NOW), "ignored")
        self.assertEqual(len(calls), 1)

    def test_boot_closes_the_command(self):
        ref = FakeRef({"status": "rebooting"})
        L.finish_restart_after_boot(ref)
        self.assertEqual(ref.updates[0]["status"], "done")
        ref = FakeRef({"status": "done"})
        L.finish_restart_after_boot(ref)
        self.assertEqual(ref.updates, [])

    def test_slightly_behind_pi_clock_counts_as_fresh(self):
        self.assertEqual(L.command_age_seconds({"requestedAt": NOW + timedelta(seconds=30)}, NOW), 0.0)


if __name__ == "__main__":
    unittest.main()
