"""Tests for the printer self-report checks in pi_scripts/firebase_listener.py.

The listener only reports "Printed" when the Brother's own page counter shows the sheets came out, refuses to
print into a toner/drum stop, and publishes the panel message for the backend's toner alert. Everything that
talks to hardware (PJL over USB, lp, lpstat, Firestore, the refund API) is faked; nothing is printed.

Run:  python -B pi_scripts/tests/test_sheet_verification.py -v
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_listener_inputs import _load_listener  # noqa: E402  (shared offline loader with Firebase stubs)

L = _load_listener()

REAL_REPLY = (
    "@PJL INFO STATUS\r\nCODE=40000\r\nDISPLAY=\"Sleep\"\r\nONLINE=TRUE\r\n"
    "@PJL INFO PAGECOUNT\r\nPAGECOUNT=16441\r\n\x0c"
)


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def time(self):
        return self.t

    def sleep(self, s):
        self.t += s


def counter_sequence(values, display="Ready"):
    """read_printer_status fake that returns the given page counts in turn (last one repeats)."""
    seq = list(values)

    def read(_printer):
        v = seq.pop(0) if len(seq) > 1 else seq[0]
        return None if v is None else {"pagecount": v, "display": display, "status_code": 10001, "online": True}
    return read


class ParseAndClassify(unittest.TestCase):
    def test_parses_real_brother_reply(self):
        info = L.parse_pjl_status(REAL_REPLY)
        self.assertEqual(info, {"pagecount": 16441, "status_code": 40000, "display": "Sleep", "online": True})

    def test_supply_states(self):
        cases = {
            "Sleep": "ok", "Ready": "ok", None: "ok", "Paper Jam": "ok",
            "Toner Low": "low", "Drum End Soon": "low",
            "Replace Toner": "empty", "Replace Drum": "empty", "No Toner": "empty",
            "Drum Stop": "empty", "Cartridge Error": "empty",
        }
        for panel, want in cases.items():
            self.assertEqual(L.classify_supply(panel), want, panel)

    def test_expected_sheets(self):
        self.assertEqual(L.expected_min_sheets(3, 4, "single"), 12)   # the 29 Sep 10:48 order
        self.assertEqual(L.expected_min_sheets(3, 2, "double"), 4)    # 2 sheets per copy
        self.assertEqual(L.expected_min_sheets(0, 0, "single"), 1)

    def test_colour_queue_detection(self):
        with mock.patch.multiple(L, BW_PRINTER_NAME="Brother_HL_L5210DN_series",
                                 COLOR_PRINTER_NAME="Brother_HL_L5210DN_series"):
            self.assertFalse(L.is_color_queue("Brother_HL_L5210DN_series"))  # CV-001: one B&W printer
        with mock.patch.multiple(L, BW_PRINTER_NAME="Brother_HL_L2440DW_series", COLOR_PRINTER_NAME="Epson_L3250"):
            self.assertTrue(L.is_color_queue("Epson_L3250"))
            self.assertFalse(L.is_color_queue("Brother_HL_L2440DW_series"))


class VerifySheets(unittest.TestCase):
    def run_verify(self, counts, expected, before=100):
        clock = FakeClock()
        with mock.patch.object(L, "read_printer_status", counter_sequence(counts)):
            return L.verify_sheets_printed("Brother_HL_L5210DN_series", before, expected, clock=clock), clock.t

    def test_all_sheets_counted(self):
        (verdict, printed), _ = self.run_verify([100, 104, 108, 112], expected=12)
        self.assertEqual((verdict, printed), ("ok", 12))

    def test_nothing_came_out(self):
        (verdict, printed), waited = self.run_verify([100], expected=12)
        self.assertEqual((verdict, printed), ("none", 0))
        self.assertGreaterEqual(waited, 60)

    def test_stopped_part_way(self):
        (verdict, printed), _ = self.run_verify([100, 102, 103], expected=12)
        self.assertEqual((verdict, printed), ("short", 3))

    def test_unknown_without_a_first_reading(self):
        self.assertEqual(L.verify_sheets_printed("x", None, 5), ("unknown", None))

    def test_unknown_when_printer_never_answers(self):
        (verdict, printed), _ = self.run_verify([None], expected=3)
        self.assertEqual((verdict, printed), ("unknown", None))


class FakeDoc:
    def __init__(self, status="printing"):
        self.id = "job-1"
        self.status = status
        self.updates = []

    def get(self):
        return mock.Mock(exists=True, to_dict=lambda: {"status": self.status})

    def update(self, data, timeout=None):
        self.updates.append(data)


class PrintFileGate(unittest.TestCase):
    def setUp(self):
        L._sheet_check_locks.clear()
        self.tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tmp_gate.pdf")
        with open(self.tmp, "wb") as f:
            f.write(b"%PDF-1.4\n" + b"x" * 400 + b"\n%%EOF\n")

    def tearDown(self):
        os.remove(self.tmp)

    def test_replace_toner_blocks_printing_and_refunds(self):
        doc = FakeDoc()
        panel = {"pagecount": 5958, "display": "Replace Toner", "status_code": 40038, "online": True}
        with mock.patch.multiple(L, BW_PRINTER_NAME="Brother_HL_L2440DW_series", COLOR_PRINTER_NAME="Epson_L3250",
                                 SHEET_CHECK_ENABLED=True), \
             mock.patch.object(L, "is_printer_online", return_value=(True, "Online")), \
             mock.patch.object(L, "validate_pdf_strict", return_value=(True, 1, "ok")), \
             mock.patch.object(L, "read_printer_status", return_value=panel), \
             mock.patch.object(L, "publish_printer_health") as publish, \
             mock.patch.object(L, "report_print_failure") as report, \
             mock.patch.object(L.subprocess, "run") as run:
            result = L.print_file([self.tmp], 1, printer_name="Brother_HL_L2440DW_series", doc_ref=doc)
        self.assertFalse(result)
        self.assertFalse(any(c.args and c.args[0][:1] == ["lp"] for c in run.call_args_list), "lp must not run")
        self.assertIn("Replace Toner", report.call_args.args[1])
        publish.assert_called_once()
        self.assertFalse(L.sheet_check_lock("Brother_HL_L2440DW_series").locked())

    def test_counter_is_passed_to_the_tracking_thread(self):
        doc = FakeDoc()
        panel = {"pagecount": 5958, "display": "Sleep", "status_code": 40000, "online": True}
        started = {}

        class FakeThread:
            def __init__(self, target, args, daemon):
                started["args"] = args

            def start(self):
                pass

        lp_result = mock.Mock(stdout="request id is Brother_HL_L2440DW_series-2061 (1 file(s))")
        with mock.patch.multiple(L, BW_PRINTER_NAME="Brother_HL_L2440DW_series", COLOR_PRINTER_NAME="Epson_L3250",
                                 SHEET_CHECK_ENABLED=True), \
             mock.patch.object(L, "is_printer_online", return_value=(True, "Online")), \
             mock.patch.object(L, "validate_pdf_strict", return_value=(True, 3, "ok")), \
             mock.patch.object(L, "get_pdf_page_count", return_value=3), \
             mock.patch.object(L, "read_printer_status", return_value=panel), \
             mock.patch.object(L.subprocess, "run", return_value=lp_result), \
             mock.patch.object(L.threading, "Thread", FakeThread):
            result = L.print_file([self.tmp], 4, printer_name="Brother_HL_L2440DW_series", doc_ref=doc)
        self.assertIsNone(result)
        self.assertEqual(started["args"][-1], {"count_before": 5958, "expected_min": 12})
        self.assertTrue(L.sheet_check_lock("Brother_HL_L2440DW_series").locked(), "thread owns the slot")
        L.end_sheet_check("Brother_HL_L2440DW_series")


class SlotAndKillSwitch(unittest.TestCase):
    def setUp(self):
        L._sheet_check_locks.clear()

    def test_kill_switch_skips_the_check(self):
        with mock.patch.object(L, "SHEET_CHECK_ENABLED", False), \
             mock.patch.object(L, "read_printer_status") as read:
            self.assertEqual(L.begin_sheet_check("Brother_HL_L5210DN_series"), (False, None, None))
        read.assert_not_called()

    def test_busy_slot_never_blocks_a_customer_for_long(self):
        L.sheet_check_lock("Brother_HL_L5210DN_series").acquire()
        with mock.patch.multiple(L, SHEET_CHECK_ENABLED=True, SHEET_SLOT_WAIT_SEC=0.05), \
             mock.patch.object(L, "read_printer_status") as read:
            self.assertEqual(L.begin_sheet_check("Brother_HL_L5210DN_series"), (False, None, None))
        read.assert_not_called()
        L.end_sheet_check("Brother_HL_L5210DN_series")

    def test_colour_printer_is_never_checked(self):
        with mock.patch.object(L, "SHEET_CHECK_ENABLED", True):
            self.assertEqual(L.begin_sheet_check("Epson_L3250"), (False, None, None))


class WaitForCupsJob(unittest.TestCase):
    def setUp(self):
        L._sheet_check_locks.clear()
        L.sheet_check_lock("Brother_HL_L5210DN_series").acquire()

    def lpstat(self, cmd, **_kw):
        out = "Brother_HL_L5210DN_series-4400 printpi 1024 now\n" if "completed" in cmd else ""
        return mock.Mock(stdout=out, returncode=0)

    def run_wait(self, verdict):
        doc = FakeDoc()
        L.active_jobs.add(doc.id)
        with mock.patch.object(L, "is_printer_online", return_value=(True, "Online")), \
             mock.patch.object(L.subprocess, "run", side_effect=self.lpstat), \
             mock.patch.object(L, "verify_sheets_printed", return_value=verdict), \
             mock.patch.object(L, "read_printer_status", return_value={"pagecount": 1, "display": "Paper Jam"}), \
             mock.patch.object(L, "publish_printer_health"), \
             mock.patch.object(L, "report_print_failure") as report, \
             mock.patch.object(L, "firestore", mock.Mock(SERVER_TIMESTAMP="TS")):
            L.wait_for_cups_job("Brother_HL_L5210DN_series-4400", doc, 60, "Brother_HL_L5210DN_series", 3, 4,
                                {"count_before": 100, "expected_min": 12})
        return doc, report

    def test_verified_job_is_marked_printed(self):
        doc, report = self.run_wait(("ok", 12))
        report.assert_not_called()
        self.assertEqual(doc.updates[-1]["status"], "completed")
        self.assertEqual((doc.updates[-1]["printVerified"], doc.updates[-1]["sheetsVerified"]), (True, 12))
        self.assertFalse(L.sheet_check_lock("Brother_HL_L5210DN_series").locked())

    def test_nothing_printed_is_reported_not_completed(self):
        doc, report = self.run_wait(("none", 0))
        self.assertFalse(any(u.get("status") == "completed" for u in doc.updates))
        self.assertIn("did not print any page", report.call_args.args[1])
        self.assertIn("Paper Jam", report.call_args.args[1])
        self.assertFalse(L.sheet_check_lock("Brother_HL_L5210DN_series").locked())

    def test_short_print_is_reported(self):
        _, report = self.run_wait(("short", 3))
        self.assertIn("stopped after 3 of 12 sheets", report.call_args.args[1])

    def test_unverifiable_job_still_completes_but_is_flagged(self):
        doc, report = self.run_wait(("unknown", None))
        report.assert_not_called()
        self.assertEqual(doc.updates[-1]["status"], "completed")
        self.assertFalse(doc.updates[-1]["printVerified"])


class HealthPublish(unittest.TestCase):
    def test_panel_message_maps_to_backend_toner_level(self):
        written = {}

        class Doc:
            def set(self, data, merge):
                written.update(data)

        fake_db = mock.Mock()
        fake_db.collection.return_value.document.return_value = Doc()
        with mock.patch.multiple(L, db=fake_db, KIOSK_ID="SV-002"), \
             mock.patch.object(L, "firestore", mock.Mock(SERVER_TIMESTAMP="TS")):
            L.publish_printer_health("Brother_HL_L2440DW_series", {"pagecount": 5958, "display": "Toner Low"})
        row = written["SV-002-BW"]
        self.assertEqual((row["supplyState"], row["tonerLevel"], row["panelMessage"]), ("low", 20, "Toner Low"))


if __name__ == "__main__":
    unittest.main()
