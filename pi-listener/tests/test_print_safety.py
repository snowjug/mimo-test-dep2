"""Offline safety tests for pi-listener/firebase_listener.py (the listener MIMO 1.0 / CV-001 runs).

The module cannot be imported in a test: at import it connects to Firebase and then loops forever. The
functions under test are therefore extracted from the source with `ast` and executed against fakes — a fake
CUPS connection, a fake `lp`/`cancel`, a fake clock and a fake Firestore document. No printer, CUPS server,
network or Firebase project is touched.

Run:  python3 -m pytest pi-listener/tests -q
"""
import ast
import os
import shutil
import subprocess as real_subprocess
import tempfile
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(os.path.dirname(HERE), "firebase_listener.py")
FUNCS = ["check_reasons_for_error", "is_printable_document", "cancel_cups_job",
         "wait_for_cups_job_completion", "print_file", "process_job"]

PDF = b"%PDF-1.4\n" + b"1 0 obj << /Type /Catalog >> endobj\n" * 10 + b"%%EOF\n"
HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x01\x02\x03" * 400
IPP_PROCESSING, IPP_STOPPED, IPP_COMPLETED = 5, 6, 9
PRINTER = "Brother_HL_L5210DN_series"


class FakeClock:
    def __init__(self):
        self.t = 1_000.0

    def time(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


class FakeRun:
    """Stands in for subprocess.run: records every command, answers lpstat/lp/pdfinfo, never prints."""

    def __init__(self):
        self.calls = []

    def __call__(self, cmd, *args, **kwargs):
        cmd = list(cmd)
        self.calls.append(cmd)
        out = ""
        if cmd[0] == "lpstat":
            out = f"printer {cmd[-1]} is idle.  enabled since today"
        elif cmd[0] == "lp":
            out = f"request id is {PRINTER}-42 (1 file(s))"
        elif cmd[0] == "pdfinfo":
            out = "Pages: 1\n"
        return types.SimpleNamespace(stdout=out, stderr="", returncode=0)

    def tool(self, name):
        return [c for c in self.calls if c[0] == name]


class FakeIPPError(Exception):
    pass


class FakeConn:
    """CUPS connection whose job state is a function of the fake clock's elapsed time."""

    def __init__(self, clock, state_fn):
        self.clock, self.start, self.state_fn, self.cancelled = clock, clock.t, state_fn, []

    def getPrinterAttributes(self, name):
        return {"printer-state-reasons": ["none"]}

    def getJobAttributes(self, job_id):
        return {"job-state": self.state_fn(self.clock.t - self.start), "job-state-reasons": ["none"]}

    def cancelJob(self, job_id):
        self.cancelled.append(job_id)

    def getJobs(self, **kwargs):
        return {}


class FakeDocRef:
    def __init__(self, data=None):
        self.updates, self.data = [], dict(data or {})

    def update(self, fields):
        self.updates.append(dict(fields))
        self.data.update(fields)

    def get(self):
        return types.SimpleNamespace(exists=True, to_dict=lambda: dict(self.data))

    def last(self, key):
        return self.data.get(key)


class ListenerCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="pi_listener_test_")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.clock = FakeClock()
        self.run = FakeRun()
        self.conn = None
        self.doc_ref = FakeDocRef({"status": "printing"})
        self.ns = self.load(cups_state=lambda elapsed: IPP_COMPLETED)

    def load(self, cups_state, cups_available=True):
        self.conn = FakeConn(self.clock, cups_state)
        cups_module = types.SimpleNamespace(Connection=lambda: self.conn, IPPError=FakeIPPError) if cups_available else None
        tree = ast.parse(open(SOURCE, encoding="utf-8").read())
        nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in FUNCS]
        self.assertEqual({n.name for n in nodes}, set(FUNCS), "a function under test disappeared from the listener")
        doc_ref = self.doc_ref
        ns = {
            "os": os,
            "time": self.clock,
            "subprocess": types.SimpleNamespace(run=self.run, CalledProcessError=real_subprocess.CalledProcessError),
            "cups": cups_module,
            "BW_PRINTER_NAME": PRINTER,
            "COLOR_PRINTER_NAME": PRINTER,
            "KIOSK_ID": "CV-001",
            "IS_MONOCHROME_ONLY": True,
            "TEMP_DIR": self.tmp,
            "active_jobs": set(),
            "firestore": types.SimpleNamespace(SERVER_TIMESTAMP="SERVER_TIMESTAMP"),
            "db": types.SimpleNamespace(collection=lambda name: types.SimpleNamespace(document=lambda _id: doc_ref)),
            "slice_pdf_pages": lambda path, rng: path,
            "update_colour_paper_usage": lambda *a: None,
            "convert_to_pdf": lambda path: None,
        }
        exec(compile(ast.Module(body=nodes, type_ignores=[]), SOURCE, "exec"), ns)
        self.ns = ns
        return ns

    def write(self, name, data):
        path = os.path.join(self.tmp, name)
        with open(path, "wb") as fh:
            fh.write(data)
        return path

    def wait(self, **kwargs):
        return self.ns["wait_for_cups_job_completion"](42, 1, False, doc_ref=self.doc_ref, printer_name=PRINTER, **kwargs)


# ── A job that is reported failed must never be left in the CUPS queue ──────────────────────────────────────
class FailedJobsAreCancelled(ListenerCase):
    def test_timed_out_job_is_cancelled_not_left_queued(self):
        # Printer never finishes: previously reported failed (and refunded) but left in the queue, so it printed
        # later when the printer recovered.
        self.load(cups_state=lambda elapsed: IPP_PROCESSING)
        self.assertFalse(self.wait())
        self.assertEqual(self.conn.cancelled, [42])
        self.assertEqual(self.doc_ref.last("status"), "failed")

    def test_stopped_job_is_cancelled(self):
        # STOPPED jobs resume when the watchdog re-enables the printer.
        self.load(cups_state=lambda elapsed: IPP_STOPPED)
        self.assertFalse(self.wait())
        self.assertEqual(self.conn.cancelled, [42])
        self.assertEqual(self.doc_ref.last("status"), "failed")

    def test_completed_job_is_not_cancelled(self):
        self.load(cups_state=lambda elapsed: IPP_COMPLETED)
        self.assertTrue(self.wait())
        self.assertEqual(self.conn.cancelled, [])
        self.assertNotEqual(self.doc_ref.last("status"), "failed")

    def test_job_waiting_behind_another_customer_is_not_cancelled(self):
        # Queued for 3 minutes behind someone else's job, then prints. The old ~76 s timeout would have
        # failed it; with cancel-on-timeout that would now also throw away a legitimate print.
        self.load(cups_state=lambda elapsed: IPP_PROCESSING if elapsed < 180 else IPP_COMPLETED)
        self.assertTrue(self.wait())
        self.assertEqual(self.conn.cancelled, [])

    def test_timeout_is_at_least_five_minutes(self):
        self.load(cups_state=lambda elapsed: IPP_PROCESSING)
        start = self.clock.t
        self.wait()
        self.assertGreaterEqual(self.clock.t - start, 300)

    def test_missing_pycups_cancels_through_the_cancel_command(self):
        self.load(cups_state=lambda elapsed: IPP_PROCESSING, cups_available=False)
        self.assertFalse(self.wait())
        self.assertEqual(self.run.tool("cancel"), [["cancel", f"{PRINTER}-42"]])


# ── Nothing but a real PDF (or plain text) may reach lp ──────────────────────────────────────────────────────
class OnlyPrintableFilesReachThePrinter(ListenerCase):
    def print_files(self, paths):
        return self.ns["print_file"](paths, 1, None, PRINTER, None, "single", False, is_color=False, doc_ref=self.doc_ref)

    def test_raw_heic_is_refused_before_lp(self):
        self.assertFalse(self.print_files([self.write("photo.heic", HEIC)]))
        self.assertEqual(self.run.tool("lp"), [], "raw image bytes must never be sent to the printer")
        self.assertEqual(self.doc_ref.last("status"), "failed")

    def test_file_named_pdf_but_not_a_pdf_is_refused(self):
        self.assertFalse(self.print_files([self.write("doc.pdf", b"<html>AccessDenied</html>" * 20)]))
        self.assertEqual(self.run.tool("lp"), [])

    def test_valid_pdf_is_submitted_exactly_once(self):
        self.assertTrue(self.print_files([self.write("doc.pdf", PDF)]))
        self.assertEqual(len(self.run.tool("lp")), 1)
        self.assertEqual(self.conn.cancelled, [])

    def test_plain_text_is_still_allowed(self):
        self.assertTrue(self.print_files([self.write("notes.txt", b"Hello MIMO\n" * 20)]))
        self.assertEqual(len(self.run.tool("lp")), 1)

    def test_missing_pycups_refuses_before_submitting(self):
        self.load(cups_state=lambda elapsed: IPP_COMPLETED, cups_available=False)
        self.assertFalse(self.print_files([self.write("doc.pdf", PDF)]))
        self.assertEqual(self.run.tool("lp"), [], "a job that cannot be monitored must not be submitted")


# ── process_job: an image that cannot be converted fails the job instead of printing raw bytes ───────────────
class UnconvertibleImagesFailTheJob(ListenerCase):
    def run_job(self, path, converted=None):
        self.ns["download_file"] = lambda url, name: path
        self.ns["convert_image_to_pdf"] = lambda *a, **k: converted
        printer = mock.Mock(return_value=True)
        self.ns["print_file"] = printer
        snap = types.SimpleNamespace(id="job1", to_dict=lambda: {
            "fileUrl": "https://example.invalid/x", "fileName": os.path.basename(path),
            "colorMode": "bw", "printOptions": {"copies": 1}, "status": "printing"})
        self.ns["process_job"](snap)
        return printer

    def test_heic_without_decoder_fails_and_never_prints(self):
        # CV-001 has never printed a HEIC (0/2); the first one on Sat 26 Sep began 5 hours of failures.
        printer = self.run_job(self.write("IMG_0001.heic", HEIC), converted=None)
        printer.assert_not_called()
        self.assertEqual(self.doc_ref.last("status"), "failed")
        self.assertIn("could not be printed", self.doc_ref.last("printerStatus"))

    def test_convertible_image_prints_the_converted_pdf(self):
        pdf = self.write("IMG_0002.jpg.pdf", PDF)
        printer = self.run_job(self.write("IMG_0002.jpg", b"\xff\xd8\xff" + b"\x00" * 200), converted=pdf)
        printer.assert_called_once()
        self.assertEqual(printer.call_args[0][0], [pdf])


# ── on_snapshot: a job already "printing" when the listener (re)connects gets the same one-time rule
# as the watchdog fallback, instead of firing unconditionally. Reproduces the CV-001 incident of 28 Sep:
# two jobs submitted while the Pi was down (13:20-16:00) both printed unattended the instant it came back
# online at 16:04, because the first Firestore snapshot after reconnecting delivered them as 'ADDED'.
SNAPSHOT_FUNCS = ["is_eligible_for_auto_resume", "on_snapshot"]
SNAPSHOT_MODULE_NAMES = ["AUTO_RESUME_MAX_AGE", "_seen_first_snapshot"]


class FakeThread:
    calls = []

    def __init__(self, target=None, args=(), kwargs=None, daemon=None):
        self.args = args

    def start(self):
        FakeThread.calls.append(self.args[0].id if self.args else None)


class FakeDbChain:
    """Supports db.collection('print_jobs').document(doc_id).update(...) — only used by the 15-minute
    job-expiry branch, unrelated to the reconnect fix, but on_snapshot always references it."""

    def __init__(self):
        self.docs = {}

    def collection(self, name):
        return self

    def document(self, doc_id):
        return self.docs.setdefault(doc_id, FakeDocRef())


class FakeQueryDocSnapshot:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data
        self.reference = FakeDocRef(data)

    def to_dict(self):
        return dict(self._data)


class FakeChange:
    def __init__(self, type_name, doc_id, data):
        self.type = types.SimpleNamespace(name=type_name)
        self.document = FakeQueryDocSnapshot(doc_id, data)


def load_snapshot_module(db):
    tree = ast.parse(open(SOURCE, encoding="utf-8").read())
    nodes = [
        n for n in tree.body
        if (isinstance(n, ast.FunctionDef) and n.name in SNAPSHOT_FUNCS)
        or (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in SNAPSHOT_MODULE_NAMES for t in n.targets))
    ]
    found = {n.name for n in nodes if isinstance(n, ast.FunctionDef)}
    assert found == set(SNAPSHOT_FUNCS), f"missing from source: {set(SNAPSHOT_FUNCS) - found}"
    ns = {
        "db": db,
        "active_jobs": set(),
        "threading": types.SimpleNamespace(Thread=FakeThread),
        "datetime": __import__("datetime").datetime,
        "timedelta": __import__("datetime").timedelta,
        "firestore": types.SimpleNamespace(SERVER_TIMESTAMP="SERVER_TIMESTAMP"),
        "process_job": mock.Mock(),
    }
    exec(compile(ast.Module(body=nodes, type_ignores=[]), SOURCE, "exec"), ns)
    return ns


class ReconnectSnapshotTests(unittest.TestCase):
    def setUp(self):
        FakeThread.calls = []
        self.ns = load_snapshot_module(FakeDbChain())

    def job(self, minutes_ago=0, **extra):
        started = self.ns["datetime"].now() - self.ns["timedelta"](minutes=minutes_ago)
        return {"status": "printing", "isPrinted": False, "printStartedAt": started, **extra}

    def fire(self, *changes):
        self.ns["on_snapshot"](None, list(changes), None)

    def test_job_already_waiting_when_the_listener_reconnects_is_resumed_once_and_marked(self):
        # Matches the real incident: a job submitted 8 minutes before the Pi came back online.
        change = FakeChange("ADDED", "job1", self.job(minutes_ago=8))
        self.fire(change)
        self.assertEqual(FakeThread.calls, ["job1"])
        self.assertEqual(change.document.reference.last("autoResumedAt"), "SERVER_TIMESTAMP")

    def test_a_job_already_given_one_resume_attempt_is_never_fired_again_on_a_later_reconnect(self):
        change = FakeChange("ADDED", "job1", self.job(minutes_ago=8, autoResumedAt="2026-09-28T16:00:00"))
        self.fire(change)
        self.assertEqual(FakeThread.calls, [])

    def test_a_job_waiting_too_long_is_not_fired_on_reconnect(self):
        change = FakeChange("ADDED", "job1", self.job(minutes_ago=50))
        self.fire(change)
        self.assertEqual(FakeThread.calls, [])
        self.assertIsNone(change.document.reference.last("autoResumedAt"))

    def test_normal_operation_after_the_first_snapshot_is_completely_unaffected(self):
        # First call (the reconnect snapshot) — any content, just to consume is_reconnect_snapshot.
        self.fire(FakeChange("ADDED", "startup-job", self.job(minutes_ago=0)))
        FakeThread.calls = []
        # Second call: a genuinely new customer job. Must fire unconditionally, with no eligibility
        # gate and no autoResumedAt marker — this is the normal, everyday path and must not regress.
        change = FakeChange("ADDED", "job2", self.job(minutes_ago=0))
        self.fire(change)
        self.assertEqual(FakeThread.calls, ["job2"])
        self.assertIsNone(change.document.reference.last("autoResumedAt"))

    def test_a_modified_event_on_the_first_snapshot_is_not_treated_as_a_reconnect_resume(self):
        # Only ADDED events represent "was already sitting there when we connected"; MODIFIED never does.
        change = FakeChange("MODIFIED", "job1", self.job(minutes_ago=50))
        self.fire(change)
        self.assertEqual(FakeThread.calls, ["job1"])
        self.assertIsNone(change.document.reference.last("autoResumedAt"))

    def test_an_already_active_job_is_never_double_fired_even_on_the_reconnect_snapshot(self):
        self.ns["active_jobs"].add("job1")
        change = FakeChange("ADDED", "job1", self.job(minutes_ago=1))
        self.fire(change)
        self.assertEqual(FakeThread.calls, [])


if __name__ == "__main__":
    unittest.main()
