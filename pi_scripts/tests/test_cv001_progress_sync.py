"""Kiosk progress sync for the listener that runs on MIMO 1.0 (CV-001, Brother HL-L5210DN).

The CV-001 listener is deployed by hand and is not in this repository (it carries machine credentials), so these
tests load the real file from a path: CV001_LISTENER_PATH=/path/to/firebase_listener.py. Without it they are skipped.
The fix itself is pi_scripts/cv001/progress-sync.patch. Hardware, Firestore and CUPS are faked; nothing is printed.

Run:  CV001_LISTENER_PATH=... python -B pi_scripts/tests/test_cv001_progress_sync.py -v
"""
import importlib.util
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_listener_inputs import _install_import_stubs  # noqa: E402  (shared Firebase/google import stubs)

PATH = os.environ.get("CV001_LISTENER_PATH")
PRINTER = "Brother_HL_L5210DN_series"


def _load():
    _install_import_stubs()
    spec = importlib.util.spec_from_file_location("cv001_listener_under_test", PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


L = _load() if PATH else None


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def time(self):
        return self.t

    def sleep(self, s):
        self.t += s


def counter(values):
    """read_printer_status fake: one value per poll, the last one repeats. None = printer did not answer."""
    seq = list(values)

    def read(_printer):
        v = seq.pop(0) if len(seq) > 1 else seq[0]
        return None if v is None else {"pagecount": v, "display": "Ready", "status_code": 10001, "online": True}
    return read


class FakeDoc:
    id = "job-1"

    def __init__(self):
        self.updates = []

    def get(self):
        return mock.Mock(exists=True, to_dict=lambda: {"status": "printing"})

    def update(self, data, timeout=None):
        self.updates.append(dict(data))


@unittest.skipUnless(PATH, "set CV001_LISTENER_PATH to the CV-001 listener file")
class Verify(unittest.TestCase):
    def run_verify(self, values, expected_min, expected_max=None, settle_sec=10):
        clock, seen = FakeClock(), []
        with mock.patch.object(L, "read_printer_status", side_effect=counter(values)):
            verdict = L.verify_sheets_printed(PRINTER, 100, expected_min, clock=clock, on_progress=seen.append,
                                              expected_max=expected_max, settle_sec=settle_sec)
        return verdict, seen, clock.t

    def test_single_sheet_reports_no_partial_progress_and_completes_on_the_counter_step(self):
        verdict, seen, t = self.run_verify([100, 100, 100, 101], 1)
        self.assertEqual(verdict, ("ok", 1))
        self.assertEqual(seen, [], "a 1-sheet job has no partial state: 0% until verified, then 100%")
        self.assertLess(t, 1.0, "verdict on the poll that sees the step, not after a delay")

    def test_multi_sheet_reports_each_verified_sheet_but_never_the_last(self):
        verdict, seen, _ = self.run_verify([100, 101, 101, 102, 103, 103, 104, 105], 5)
        self.assertEqual(verdict, ("ok", 5))
        self.assertEqual(seen, [1, 2, 3, 4], "the final sheet is only ever signalled by the completed verdict")

    def test_duplicate_missing_and_backwards_readings_keep_progress_monotonic(self):
        verdict, seen, _ = self.run_verify([100, None, 102, 102, 101, None, 102, 103, 104], 4)
        self.assertEqual(verdict, ("ok", 4))
        self.assertEqual(seen, [2, 3], "no repeats, no step back on a glitch, capped at N-1")

    def test_counter_jump_after_a_gap_catches_up_in_one_report(self):
        # PJL is unreadable while CUPS still holds the USB device; the first reading can already be several sheets on.
        verdict, seen, _ = self.run_verify([None, None, 103, 106, 110], 10)
        self.assertEqual(verdict, ("ok", 10))
        self.assertEqual(seen, [3, 6, 9])

    def test_duplex_sides_counting_printer_completes_at_the_last_side_not_halfway(self):
        # 3 sheets duplex. A sides-counting counter passes 3 halfway through: that must not be "done".
        verdict, seen, t = self.run_verify([100, 101, 102, 103, 104, 105, 106], 3, expected_max=6)
        self.assertEqual(verdict, ("ok", 6))
        self.assertEqual(seen, [1, 2], "conservative: 2 sides = 1 sheet, capped at 2 of 3")
        self.assertLess(t, 2.0, "no settle wait once every side is counted")

    def test_duplex_sheet_counting_printer_completes_after_the_counter_settles(self):
        verdict, seen, t = self.run_verify([100, 101, 102, 103], 3, expected_max=6, settle_sec=10)
        self.assertEqual(verdict, ("ok", 3))
        self.assertGreaterEqual(t, 10.0, "counter must stand still for settle_sec at the sheet count")
        self.assertLess(t, 11.0, "and not much longer")
        self.assertEqual(seen, [1], "never ahead of the paper whichever way the printer counts")

    def test_duplex_pause_mid_job_shorter_than_settle_is_not_completion(self):
        # sides-counting, counter reaches the sheet count (3) and pauses 5 s before the remaining sides
        values = [100, 101, 102, 103] + [103] * 20 + [104, 105, 106]
        verdict, _, t = self.run_verify(values, 3, expected_max=6, settle_sec=10)
        self.assertEqual(verdict, ("ok", 6))
        self.assertGreater(t, 5.0)

    def test_stalled_job_is_short_not_ok(self):
        verdict, seen, _ = self.run_verify([100, 101, 102], 5)
        self.assertEqual(verdict, ("short", 2))
        self.assertEqual(seen, [1, 2])

    def test_nothing_out_is_none(self):
        verdict, seen, _ = self.run_verify([100], 2)
        self.assertEqual(verdict, ("none", 0))
        self.assertEqual(seen, [])

    def test_printer_never_answers_is_unknown(self):
        self.assertEqual(self.run_verify([None], 3)[0], ("unknown", None))

    def test_progress_callback_failure_does_not_stop_verification(self):
        clock = FakeClock()
        with mock.patch.object(L, "read_printer_status", side_effect=counter([100, 101, 102, 103])):
            verdict = L.verify_sheets_printed(PRINTER, 100, 3, clock=clock,
                                              on_progress=mock.Mock(side_effect=RuntimeError("firestore down")))
        self.assertEqual(verdict, ("ok", 3))


@unittest.skipUnless(PATH, "set CV001_LISTENER_PATH to the CV-001 listener file")
class Tracking(unittest.TestCase):
    """wait_for_cups_job: what the kiosk's /kiosk/job-status will read from Firestore, in order."""

    def setUp(self):
        L._sheet_check_locks.clear()
        L.sheet_check_lock(PRINTER).acquire()

    @staticmethod
    def lpstat(cmd, **_kw):
        out = f"{PRINTER}-5036 printpi 1024 now\n" if "completed" in cmd else ""
        return mock.Mock(stdout=out, returncode=0)

    def run_wait(self, values, sheet_check, clearance=1.0):
        doc, sleeps = FakeDoc(), []
        L.active_jobs.add(doc.id)
        clock = FakeClock()
        real_verify = L.verify_sheets_printed
        with mock.patch.object(L, "is_printer_online", return_value=(True, "Online")), \
             mock.patch.object(L.subprocess, "run", side_effect=self.lpstat), \
             mock.patch.object(L, "read_printer_status", side_effect=counter(values)), \
             mock.patch.object(L, "verify_sheets_printed",
                               side_effect=lambda *a, **k: real_verify(*a, clock=clock, **k)), \
             mock.patch.object(L, "publish_printer_health"), \
             mock.patch.object(L, "report_print_failure") as report, \
             mock.patch.object(L, "SHEET_EXIT_CLEARANCE_SEC", clearance), \
             mock.patch.object(L.time, "sleep", side_effect=sleeps.append), \
             mock.patch.object(L, "firestore", mock.Mock(SERVER_TIMESTAMP="TS")):
            L.wait_for_cups_job(f"{PRINTER}-5036", doc, 60, PRINTER, sheet_check["expected_min"], 1, sheet_check)
        return doc, report, sleeps

    def test_multi_sheet_writes_total_then_each_sheet_then_completed_last(self):
        doc, report, sleeps = self.run_wait([100, 101, 102, 103, 104, 105],
                                            {"count_before": 100, "expected_min": 5, "expected_max": 5})
        report.assert_not_called()
        self.assertEqual(doc.updates[0], {"totalSheets": 5, "sheetsCompleted": 0})
        self.assertEqual([u["sheetsCompleted"] for u in doc.updates[1:-1]], [1, 2, 3, 4])
        last = doc.updates[-1]
        self.assertEqual((last["status"], last["sheetsCompleted"], last["printVerified"]), ("completed", 5, True))
        self.assertIn(1.0, sleeps, "exit clearance runs between the last counter step and 'completed'")
        self.assertFalse(L.sheet_check_lock(PRINTER).locked())

    def test_single_sheet_goes_straight_from_zero_to_completed(self):
        doc, _, _ = self.run_wait([100, 100, 101], {"count_before": 100, "expected_min": 1, "expected_max": 1})
        self.assertEqual(doc.updates[0], {"totalSheets": 1, "sheetsCompleted": 0})
        self.assertEqual(doc.updates[-1]["status"], "completed")
        self.assertEqual(len(doc.updates), 2, "no partial progress for one sheet")

    def test_short_print_reports_failure_and_never_completes(self):
        doc, report, _ = self.run_wait([100, 101, 102], {"count_before": 100, "expected_min": 5, "expected_max": 5})
        self.assertFalse(any(u.get("status") == "completed" for u in doc.updates))
        self.assertIn("stopped after 2 of 5 sheets", report.call_args.args[1])
        self.assertTrue(all(u.get("sheetsCompleted", 0) < 5 for u in doc.updates))

    def test_zero_clearance_skips_the_wait(self):
        _, _, sleeps = self.run_wait([100, 101], {"count_before": 100, "expected_min": 1}, clearance=0)
        self.assertNotIn(0, sleeps)

    def test_old_sheet_check_without_expected_max_still_works(self):
        doc, _, _ = self.run_wait([100, 101, 102], {"count_before": 100, "expected_min": 2})
        self.assertEqual(doc.updates[-1]["status"], "completed")


@unittest.skipUnless(PATH, "set CV001_LISTENER_PATH to the CV-001 listener file")
class SheetCheckShape(unittest.TestCase):
    def test_duplex_allows_for_a_sides_counting_counter(self):
        self.assertEqual(L.expected_min_sheets(5, 2, "double"), 6)
        self.assertEqual(L.expected_min_sheets(5, 2, "single"), 10)


if __name__ == "__main__":
    unittest.main()
