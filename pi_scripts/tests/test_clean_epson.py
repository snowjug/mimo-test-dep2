"""
Unit tests for automated colour ink cleaning (clean_epson.py)
and firebase_listener clean_color_head command integration.
"""

import os
import sys
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import clean_epson as CE


class FakeClock:
    def __init__(self, start=0.0):
        self.t = start

    def time(self):
        return self.t

    def sleep(self, s):
        self.t += s


class CleanEpsonSafetyTests(unittest.TestCase):
    def test_is_printer_idle_detects_busy_queue(self):
        # When CUPS output shows a job for Epson_L3250
        busy_run = lambda *a, **k: SimpleNamespace(returncode=0, stdout="Epson_L3250-410 pi 1024 Wed Oct 14 06:00:00 2026\n", stderr="")
        self.assertFalse(CE.is_printer_idle("Epson_L3250", run_cmd=busy_run))

    def test_is_printer_idle_detects_idle_queue(self):
        idle_run = lambda *a, **k: SimpleNamespace(returncode=0, stdout="", stderr="")
        self.assertTrue(CE.is_printer_idle("Epson_L3250", run_cmd=idle_run))

    def test_wait_until_idle_waits_for_active_job_to_complete(self):
        clock = FakeClock()
        # Printer starts busy, then becomes idle on the 2nd poll
        polls = iter([
            SimpleNamespace(returncode=0, stdout="Epson_L3250-101 pi 2048", stderr=""),
            SimpleNamespace(returncode=0, stdout="", stderr="")
        ])
        run_cmd = lambda *a, **k: next(polls)
        idle = CE.wait_until_idle("Epson_L3250", max_wait_sec=60, poll_sec=10, run_cmd=run_cmd, clock=clock)
        self.assertTrue(idle)
        self.assertGreaterEqual(clock.t, 10.0)

    def test_wait_until_idle_aborts_safely_when_printer_stays_busy(self):
        clock = FakeClock()
        # Printer stays continuously busy
        always_busy = lambda *a, **k: SimpleNamespace(returncode=0, stdout="Epson_L3250-999 pi 50000", stderr="")
        idle = CE.wait_until_idle("Epson_L3250", max_wait_sec=50, poll_sec=10, run_cmd=always_busy, clock=clock)
        # Must return False to abort cleaning and NEVER disturb customer prints
        self.assertFalse(idle)
        self.assertGreaterEqual(clock.t, 50.0)

    def test_execute_head_cleaning_submits_raw_escp_to_cups_when_idle(self):
        clock = FakeClock()
        commands_run = []

        def mock_run(cmd, *a, **k):
            commands_run.append(cmd)
            if cmd[0] == "lpstat":
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return SimpleNamespace(returncode=0, stdout="request id is Epson_L3250-450 (1 file(s))\n", stderr="")

        ok, msg = CE.execute_head_cleaning("Epson_L3250", run_cmd=mock_run, clock=clock)
        self.assertTrue(ok)
        self.assertIn("submitted successfully", msg)
        # Verify lp command was called with -d Epson_L3250 and -o raw
        lp_call = [c for c in commands_run if c[0] == "lp"]
        self.assertEqual(len(lp_call), 1)
        self.assertEqual(lp_call[0][1], "-d")
        self.assertEqual(lp_call[0][2], "Epson_L3250")
        self.assertEqual(lp_call[0][3], "-o")
        self.assertEqual(lp_call[0][4], "raw")

    def test_execute_head_cleaning_aborts_when_printer_is_busy(self):
        clock = FakeClock()
        commands_run = []

        def mock_run(cmd, *a, **k):
            commands_run.append(cmd)
            # lpstat reports busy
            return SimpleNamespace(returncode=0, stdout="Epson_L3250-101 active customer job", stderr="")

        ok, msg = CE.execute_head_cleaning("Epson_L3250", run_cmd=mock_run, clock=clock)
        self.assertFalse(ok)
        self.assertIn("Cleaning aborted to protect customer prints", msg)
        # lp must NOT have been called!
        lp_calls = [c for c in commands_run if c[0] == "lp"]
        self.assertEqual(len(lp_calls), 0, "lp must NEVER be called while customer is printing")


class CleanEpsonNotificationTests(unittest.TestCase):
    def test_send_cleaning_notification_dispatches_to_visionprintt(self):
        now = datetime(2026, 10, 14, 6, 0, 0)
        with mock.patch("clean_epson.requests") as mock_req:
            mock_req.post.return_value = SimpleNamespace(status_code=200)
            sent = CE.send_cleaning_notification(
                kiosk_id="SV-002",
                printer_name="Epson_L3250",
                success=True,
                detail="Cleaning is done in colour printer ink",
                now=now
            )
            self.assertTrue(sent)
            mock_req.post.assert_called_once()
            call_kwargs = mock_req.post.call_args[1]
            payload = call_kwargs["json"]
            self.assertEqual(payload["kioskId"], "SV-002")
            self.assertEqual(payload["printerName"], "Epson_L3250")
            self.assertEqual(payload["status"], "completed")
            self.assertIn("colour printer ink", payload["detail"])


class CleanEpsonScheduleTests(unittest.TestCase):
    def test_seconds_until_target_time_before_6am(self):
        # 5:30 AM today -> exactly 30 minutes (1800 seconds) to 6:00 AM today
        now = datetime(2026, 10, 14, 5, 30, 0)
        sec = CE.seconds_until_target_time(target_hour=6, target_minute=0, now=now)
        self.assertEqual(sec, 1800.0)

    def test_seconds_until_target_time_after_6am(self):
        # 6:30 AM today -> 23.5 hours (84600 seconds) to 6:00 AM tomorrow
        now = datetime(2026, 10, 14, 6, 30, 0)
        sec = CE.seconds_until_target_time(target_hour=6, target_minute=0, now=now)
        self.assertEqual(sec, 23.5 * 3600.0)


class FirebaseListenerCleanCommandTests(unittest.TestCase):
    def test_handle_clean_head_command_executes_and_marks_done(self):
        from test_listener_inputs import _load_listener
        L = _load_listener()

        class FakeRef:
            def __init__(self):
                self.updates = []
            def update(self, d, **k):
                self.updates.append(d)

        ref = FakeRef()
        cmd = {"action": "clean_color_head", "status": "pending", "commandId": "cmd123"}

        with mock.patch("clean_epson.execute_head_cleaning", return_value=(True, "Cleaned successfully")):
            with mock.patch("clean_epson.send_cleaning_notification", return_value=True):
                status = L.handle_clean_head_command(cmd, ref=ref, clock=FakeClock())
                self.assertEqual(status, "done")
                statuses = [u["status"] for u in ref.updates]
                self.assertEqual(statuses, ["cleaning", "done"])

    def test_handle_clean_head_command_ignores_other_actions(self):
        from test_listener_inputs import _load_listener
        L = _load_listener()
        ref = mock.Mock()
        self.assertEqual(L.handle_clean_head_command({"action": "other", "status": "pending"}, ref=ref), "ignored")
        ref.update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
