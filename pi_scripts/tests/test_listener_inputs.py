"""Phase 1 / Part 1 tests for pi_scripts/firebase_listener.py: input acquisition, cache, prefetch and validation.

Offline only. Firebase, Google Cloud, requests, Cloud Storage, pdfinfo, Ghostscript, CUPS and the failure-report
API are all replaced by fakes; files are written only inside a temporary directory. Any unexpected subprocess
(for example `lp` or `cancel`) makes a test fail, which proves the print path was not reached.

Run:  python -B pi_scripts/tests/test_listener_inputs.py -v
"""
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
LISTENER_PATH = os.path.join(os.path.dirname(HERE), "firebase_listener.py")

# The listener logs emoji; keep test output working on consoles that are not UTF-8 (e.g. Windows cp1252).
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


# ── Stub the external modules the listener imports at module level ─────────────────────────────────────────────
def _install_import_stubs():
    fb = types.ModuleType("firebase_admin")
    fb.credentials = types.SimpleNamespace(Certificate=mock.Mock(name="Certificate"))
    fb.firestore = types.SimpleNamespace(client=mock.Mock(name="firestore.client"), SERVER_TIMESTAMP="SERVER_TIMESTAMP")
    fb.storage = types.SimpleNamespace(bucket=mock.Mock(name="storage.bucket"))
    fb.initialize_app = mock.Mock(name="initialize_app")
    stubs = {"firebase_admin": fb}
    base_query = types.ModuleType("google.cloud.firestore_v1.base_query")
    base_query.FieldFilter = mock.Mock(name="FieldFilter")
    for name in ("google", "google.cloud", "google.cloud.firestore_v1"):
        stubs[name] = types.ModuleType(name)
    stubs["google.cloud.firestore_v1.base_query"] = base_query
    try:
        import requests  # noqa: F401
    except ImportError:
        stubs["requests"] = types.ModuleType("requests")
    for name, module in stubs.items():
        sys.modules.setdefault(name, module)


def _load_listener():
    _install_import_stubs()
    spec = importlib.util.spec_from_file_location("firebase_listener_under_test", LISTENER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # __name__ != "__main__": no Firebase, threads, watchers or CUPS purge
    module.SHEET_CHECK_ENABLED = False
    module.DOWNLOAD_RETRY_DELAYS_SEC = (0, 0)  # retries still happen, without real waits in the suite  # these tests cover inputs; the printer page-counter check has its own tests
    return module


listener = _load_listener()


# ── PDF fixtures ───────────────────────────────────────────────────────────────────────────────────────────────
def make_pdf(pages=1):
    """A small but structurally valid PDF (real xref table) with the given number of pages."""
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>"]
    kids = " ".join(f"{3 + i} 0 R" for i in range(pages))
    objs.append(f"<< /Type /Pages /Kids [{kids}] /Count {pages} >>".encode())
    for _ in range(pages):
        objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


VALID_PDF = make_pdf(2)
TRUNCATED_PDF = VALID_PDF[: len(VALID_PDF) // 2]            # starts with %PDF, cut off mid-file
HEADER_ONLY_PDF = b"%PDF-1.4\n" + b"x" * 200 + b"\n%%EOF\n"  # starts with %PDF, ends with %%EOF, no structure


def fake_pdfinfo_result(path):
    """Imitates poppler's pdfinfo on the fixtures above."""
    with open(path, "rb") as fh:
        data = fh.read()
    if not data.startswith(b"%PDF"):
        return subprocess.CompletedProcess(["pdfinfo", path], 1, "", "Syntax Warning: May not be a PDF file (continuing anyway)\nSyntax Error: Couldn't find trailer dictionary\n")
    m = re.search(rb"/Type /Pages /Kids \[[^\]]*\] /Count (\d+)", data)
    if not m:
        return subprocess.CompletedProcess(["pdfinfo", path], 1, "", "Syntax Error: Couldn't read xref table\n")
    return subprocess.CompletedProcess(["pdfinfo", path], 0, f"Producer: test\nPages:          {int(m.group(1))}\nPage size: 595 x 842 pts\n", "")


def fake_page_count(path):
    res = fake_pdfinfo_result(path)
    return int(res.stdout.split("Pages:")[1].split()[0]) if res.returncode == 0 else None


class FakeSubprocess:
    """Replacement for listener.subprocess.run.

    pdfinfo, gs (merge) and lp are simulated; anything else is an error. gs_mode selects the Ghostscript outcome:
    ok (writes a PDF with the sum of the input pages), nonzero, timeout, missing, no_output, invalid_output,
    wrong_pages. lp records the files it receives (with their page counts at submission time).
    """

    def __init__(self):
        self.calls = []
        self.gs_mode = "ok"
        self.lp_calls = []  # list of [(path, page_count), ...] per lp invocation

    def __call__(self, cmd, *args, **kwargs):
        self.calls.append(list(cmd))
        tool = cmd[0]
        if tool == "pdfinfo":
            return fake_pdfinfo_result(cmd[1])
        if tool == "gs":
            if self.gs_mode == "missing":
                raise FileNotFoundError(2, "No such file or directory", "gs")
            if self.gs_mode == "timeout":
                raise subprocess.TimeoutExpired(cmd, kwargs.get("timeout"))
            if self.gs_mode == "nonzero":
                if kwargs.get("check"):
                    raise subprocess.CalledProcessError(1, cmd)
                return subprocess.CompletedProcess(cmd, 1, "", "gs error")
            out = next(a.split("=", 1)[1] for a in cmd if a.startswith("-sOutputFile="))
            inputs = [a for a in cmd[1:] if not a.startswith("-")]
            total = sum(fake_page_count(i) or 0 for i in inputs)
            if self.gs_mode == "no_output":
                return subprocess.CompletedProcess(cmd, 0, "", "")
            with open(out, "wb") as fh:
                if self.gs_mode == "invalid_output":
                    fh.write(TRUNCATED_PDF)
                elif self.gs_mode == "wrong_pages":
                    fh.write(make_pdf(total + 1))
                else:
                    fh.write(make_pdf(total))
            return subprocess.CompletedProcess(cmd, 0, "", "")
        if tool == "lp":
            files = [a for a in cmd[1:] if os.path.isfile(a)]
            self.lp_calls.append([(f, fake_page_count(f)) for f in files])
            return subprocess.CompletedProcess(cmd, 0, "request id is TestPrinter-7 (1 file(s))\n", "")
        raise AssertionError(f"unexpected subprocess call (print path must not be reached): {cmd}")

    def tools(self):
        return [c[0] for c in self.calls]


# ── Fake Cloud Storage / Firestore ─────────────────────────────────────────────────────────────────────────────
class FakeBlob:
    def __init__(self, bucket, path):
        self.bucket, self.path = bucket, path

    def download_to_filename(self, filename):
        with self.bucket.lock:
            self.bucket.downloads.append(self.path)
        content = self.bucket.store[self.path]
        if isinstance(content, Exception):
            raise content
        if callable(content):
            return content(filename)
        with open(filename, "wb") as fh:
            fh.write(content)


class FakeBucket:
    name = "test-bucket"

    def __init__(self, store=None):
        self.store = dict(store or {})
        self.downloads = []
        self.lock = threading.Lock()

    def blob(self, path):
        return FakeBlob(self, path)


def url_for(blob_path):
    return f"https://storage.googleapis.com/{FakeBucket.name}/{blob_path}"


class FakeDocRef:
    def __init__(self, doc_id):
        self.id = doc_id
        self.updates = []

    def update(self, data, **kwargs):
        self.updates.append(data)


class FakeDB:
    def __init__(self):
        self.refs = {}

    def collection(self, _name):
        return self

    def document(self, doc_id):
        return self.refs.setdefault(doc_id, FakeDocRef(doc_id))


class FakeSnapshot:
    def __init__(self, doc_id, data):
        self.id, self._data = doc_id, data

    def to_dict(self):
        return dict(self._data)


def job(doc_id, files, **extra):
    data = {"fileUrl": files[0]["url"] if files else None, "fileName": "Multiple Files", "colorMode": "bw",
            "printOptions": {"copies": 1}, "files": files, "status": "printing"}
    data.update(extra)
    return FakeSnapshot(doc_id, data)


def entry(blob_path, name=None, mime="application/pdf"):
    return {"url": url_for(blob_path), "name": name or os.path.basename(blob_path), "type": mime}


# ── Base test case: isolated work dirs + all boundaries mocked ─────────────────────────────────────────────────
class ListenerTestCase(unittest.TestCase):
    MOCK_PRINT_FILE = True  # Part 2 tests run the real print_file with a fake lp

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mimo_listener_test_")
        self.temp_dir = os.path.join(self.tmp, "prints")
        self.cache_dir = os.path.join(self.tmp, "prefetch")
        os.makedirs(self.temp_dir)
        os.makedirs(self.cache_dir)
        self.bucket = FakeBucket()
        self.db = FakeDB()
        self.sub = FakeSubprocess()
        self.report = mock.Mock(name="report_print_failure")
        self.print_file = mock.Mock(name="print_file", return_value=None)  # None = async CUPS path accepted
        patches = [
            mock.patch.object(listener, "TEMP_DIR", self.temp_dir),
            mock.patch.object(listener, "PRE_FETCH_DIR", self.cache_dir),
            mock.patch.object(listener, "bucket", self.bucket),
            mock.patch.object(listener, "db", self.db),
            mock.patch.object(listener.subprocess, "run", self.sub),
            mock.patch.object(listener, "report_print_failure", self.report),
        ]
        if self.MOCK_PRINT_FILE:
            patches.append(mock.patch.object(listener, "print_file", self.print_file))
        else:
            # Real print_file: printer reported online, CUPS completion thread not started.
            self.wait_for_cups = mock.Mock(name="wait_for_cups_job")
            patches += [
                mock.patch.object(listener, "is_printer_online", mock.Mock(return_value=(True, "Online"))),
                mock.patch.object(listener, "wait_for_cups_job", self.wait_for_cups),
            ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def write(self, path, data):
        with open(path, "wb") as fh:
            fh.write(data)
        return path

    def cache_path(self, doc_id, idx, name):
        return listener.prefetch_cache_path(doc_id, idx, name)

    def assert_failed_once_without_printing(self):
        self.assertEqual(self.report.call_count, 1, f"expected exactly one failure report, got {self.report.call_args_list}")
        self.print_file.assert_not_called()
        self.assertNotIn("gs", self.sub.tools(), "merge must not run after an input failure")

    def assert_no_leftover_files(self):
        leftovers = os.listdir(self.temp_dir)
        self.assertEqual(leftovers, [], f"temporary files left behind: {leftovers}")


# ── 1-3: strict PDF validator ──────────────────────────────────────────────────────────────────────────────────
class StrictValidatorTests(ListenerTestCase):
    def test_01_valid_pdf_passes(self):
        path = self.write(os.path.join(self.tmp, "ok.pdf"), VALID_PDF)
        ok, pages, reason = listener.validate_pdf_strict(path)
        self.assertTrue(ok, reason)
        self.assertEqual(pages, 2)

    def test_02_truncated_pdf_with_pdf_header_fails(self):
        path = self.write(os.path.join(self.tmp, "cut.pdf"), TRUNCATED_PDF)
        self.assertTrue(TRUNCATED_PDF.startswith(b"%PDF"))
        ok, pages, reason = listener.validate_pdf_strict(path)
        self.assertFalse(ok)
        self.assertIsNone(pages)
        self.assertIn("truncated", reason)

    def test_02b_pdf_header_and_eof_but_no_structure_fails(self):
        path = self.write(os.path.join(self.tmp, "junk.pdf"), HEADER_ONLY_PDF)
        ok, pages, _ = listener.validate_pdf_strict(path)
        self.assertFalse(ok)
        self.assertIsNone(pages)

    def test_03_pdfinfo_failure_fails_validation(self):
        path = self.write(os.path.join(self.tmp, "ok.pdf"), VALID_PDF)
        failing = mock.Mock(return_value=subprocess.CompletedProcess(["pdfinfo"], 1, "", "Syntax Error: Couldn't read xref table\n"))
        with mock.patch.object(listener.subprocess, "run", failing):
            ok, pages, _ = listener.validate_pdf_strict(path)
        self.assertFalse(ok)
        self.assertIsNone(pages, "a pdfinfo failure must never be reported as 1 page")

    def test_03b_missing_pdfinfo_fails_validation(self):
        path = self.write(os.path.join(self.tmp, "ok.pdf"), VALID_PDF)
        with mock.patch.object(listener.subprocess, "run", mock.Mock(side_effect=FileNotFoundError("pdfinfo"))):
            ok, pages, reason = listener.validate_pdf_strict(path)
        self.assertFalse(ok)
        self.assertIsNone(pages)
        self.assertIn("pdfinfo is not installed", reason)

    def test_03c_repaired_pdf_is_rejected(self):
        path = self.write(os.path.join(self.tmp, "ok.pdf"), VALID_PDF)
        repaired = subprocess.CompletedProcess(["pdfinfo"], 0, "Pages: 2\n", "Internal Error: xref num 7 not found but needed, try to reconstruct\n")
        with mock.patch.object(listener.subprocess, "run", mock.Mock(return_value=repaired)):
            ok, _, _ = listener.validate_pdf_strict(path)
        self.assertFalse(ok)

    def test_03d_zero_pages_and_missing_page_count_fail(self):
        path = self.write(os.path.join(self.tmp, "ok.pdf"), VALID_PDF)
        for stdout in ("Pages: 0\n", "Producer: x\n"):
            with mock.patch.object(listener.subprocess, "run", mock.Mock(return_value=subprocess.CompletedProcess(["pdfinfo"], 0, stdout, ""))):
                ok, pages, _ = listener.validate_pdf_strict(path)
            self.assertFalse(ok, stdout)
            self.assertIsNone(pages)

    def test_03e_missing_and_tiny_files_fail(self):
        self.assertFalse(listener.validate_pdf_strict(os.path.join(self.tmp, "nope.pdf"))[0])
        tiny = self.write(os.path.join(self.tmp, "tiny.pdf"), b"%PDF-1.4\n%%EOF\n")
        self.assertFalse(listener.validate_pdf_strict(tiny)[0])


# ── 4-9, 12: process_job acquisition / processing / hand-off ───────────────────────────────────────────────────
class ProcessJobInputTests(ListenerTestCase):
    def run_job(self, snapshot):
        listener.process_job(snapshot)
        return self.db.document(snapshot.id)

    def handed_off_paths(self):
        self.assertEqual(self.print_file.call_count, 1)
        return self.print_file.call_args[0][0]

    def test_04_missing_cache_fresh_download_succeeds(self):
        self.bucket.store["uploads/a.pdf"] = VALID_PDF
        self.run_job(job("job04", [entry("uploads/a.pdf")]))
        self.report.assert_not_called()
        self.assertEqual(self.bucket.downloads, ["uploads/a.pdf"])
        self.assertEqual(len(self.handed_off_paths()), 1)
        self.assert_no_leftover_files()

    def test_05_corrupt_cache_is_purged_and_redownloaded(self):
        cache = self.write(self.cache_path("job05", 0, "a.pdf"), TRUNCATED_PDF)
        self.bucket.store["uploads/a.pdf"] = VALID_PDF
        self.run_job(job("job05", [entry("uploads/a.pdf")]))
        self.assertFalse(os.path.exists(cache), "invalid cache entry must be purged")
        self.assertEqual(self.bucket.downloads, ["uploads/a.pdf"], "a fresh download must be attempted")
        self.report.assert_not_called()
        self.assertEqual(len(self.handed_off_paths()), 1)

    def test_06_corrupt_cache_and_corrupt_fresh_download_fails(self):
        cache = self.write(self.cache_path("job06", 0, "a.pdf"), TRUNCATED_PDF)
        self.bucket.store["uploads/a.pdf"] = HEADER_ONLY_PDF
        self.run_job(job("job06", [entry("uploads/a.pdf")]))
        self.assert_failed_once_without_printing()
        self.assertIn("Downloaded file is invalid", self.report.call_args[0][1], "must be stopped at acquisition")
        self.assertFalse(os.path.exists(cache), "the invalid cache must never be used as a fallback")
        self.assert_no_leftover_files()

    def test_07_download_failure_fails_job(self):
        self.bucket.store["uploads/a.pdf"] = VALID_PDF
        self.bucket.store["uploads/b.pdf"] = ConnectionError("network down")
        self.run_job(job("job07", [entry("uploads/a.pdf"), entry("uploads/b.pdf")]))
        self.assert_failed_once_without_printing()
        self.assertIn("b.pdf", self.report.call_args[0][1])
        self.assert_no_leftover_files()

    def test_07b_early_download_failure_still_cleans_up_other_downloads(self):
        # The failing download finishes first while the others are still in flight: their temp files must
        # still be tracked and removed.
        def slow_valid(filename):
            time.sleep(0.2)
            with open(filename, "wb") as fh:
                fh.write(VALID_PDF)

        self.bucket.store["uploads/bad.pdf"] = ConnectionError("fails immediately")
        files = [entry("uploads/bad.pdf")]
        for i in range(3):
            self.bucket.store[f"uploads/slow{i}.pdf"] = slow_valid
            files.append(entry(f"uploads/slow{i}.pdf"))
        self.run_job(job("job07b", files))
        self.assert_failed_once_without_printing()
        self.assertIn("bad.pdf", self.report.call_args[0][1])
        self.assert_no_leftover_files()

    def test_08_office_conversion_failure_fails_job(self):
        buf_path = os.path.join(self.tmp, "src.docx")
        with zipfile.ZipFile(buf_path, "w") as zf:
            zf.writestr("word/document.xml", "<w:document/>")
        with open(buf_path, "rb") as fh:
            self.bucket.store["uploads/report.docx"] = fh.read()
        with mock.patch.object(listener, "convert_to_pdf", mock.Mock(return_value=None)):
            self.run_job(job("job08", [entry("uploads/report.docx", mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document")]))
        self.assert_failed_once_without_printing()
        self.assertIn("LibreOffice failed", self.report.call_args[0][1])
        self.assert_no_leftover_files()

    def test_08b_image_processing_failure_fails_job(self):
        fake_image_mod = types.ModuleType("PIL.Image")
        fake_image_mod.open = mock.MagicMock()
        fake_pil = types.ModuleType("PIL")
        fake_pil.Image = fake_image_mod
        self.bucket.store["uploads/photo.jpg"] = b"\xff\xd8\xff" + b"0" * 500
        with mock.patch.dict(sys.modules, {"PIL": fake_pil, "PIL.Image": fake_image_mod}), \
                mock.patch.object(listener, "convert_image_to_pdf_fit", mock.Mock(return_value=None)):
            self.run_job(job("job08b", [entry("uploads/photo.jpg", mime="image/jpeg")]))
        self.assert_failed_once_without_printing()
        self.assertIn("Image processing failed", self.report.call_args[0][1])

    def test_09_expected_seven_valid_six_fails_before_print(self):
        files = []
        for i in range(7):
            self.bucket.store[f"uploads/f{i}.pdf"] = VALID_PDF
            files.append(entry(f"uploads/f{i}.pdf"))
        self.bucket.store["uploads/f4.pdf"] = TRUNCATED_PDF  # one of seven is corrupt
        self.run_job(job("job09", files))
        self.assert_failed_once_without_printing()
        self.assertIn("Downloaded file is invalid", self.report.call_args[0][1], "must be stopped at acquisition")
        self.assertIn("f4.pdf", self.report.call_args[0][1])
        self.assert_no_leftover_files()

    def test_09b_entry_without_url_fails_job(self):
        self.bucket.store["uploads/a.pdf"] = VALID_PDF
        files = [entry("uploads/a.pdf"), {"name": "b.pdf", "type": "application/pdf"}]
        self.run_job(job("job09b", files))
        self.assert_failed_once_without_printing()

    def test_09c_processed_output_is_validated_before_hand_off(self):
        # A conversion that "succeeds" but yields an invalid PDF must not reach the merge.
        zpath = os.path.join(self.tmp, "src.docx")
        with zipfile.ZipFile(zpath, "w") as zf:
            zf.writestr("word/document.xml", "<w:document/>")
        with open(zpath, "rb") as fh:
            self.bucket.store["uploads/r.docx"] = fh.read()
        bad_out = self.write(os.path.join(self.temp_dir, "converted_bad.pdf"), TRUNCATED_PDF)
        self.bucket.store["uploads/ok.pdf"] = VALID_PDF
        with mock.patch.object(listener, "convert_to_pdf", mock.Mock(return_value=bad_out)):
            self.run_job(job("job09c", [entry("uploads/ok.pdf"), entry("uploads/r.docx", mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document")]))
        self.assert_failed_once_without_printing()
        self.assertIn("not a valid PDF", self.report.call_args[0][1])
        self.assert_no_leftover_files()

    def test_09d_multi_file_success_hands_off_all_inputs(self):
        files = []
        for i in range(3):
            self.bucket.store[f"uploads/m{i}.pdf"] = make_pdf(i + 1)
            files.append(entry(f"uploads/m{i}.pdf"))
        self.run_job(job("job09d", files))
        self.report.assert_not_called()
        gs_calls = [c for c in self.sub.calls if c[0] == "gs"]
        self.assertEqual(len(gs_calls), 1)
        merge_inputs = [a for a in gs_calls[0] if not a.startswith("-") and a != "gs"]
        self.assertEqual(len(merge_inputs), 3, "all three validated inputs must be handed to the merge")
        self.assertEqual(len(set(merge_inputs)), 3)
        self.assertEqual(len(self.handed_off_paths()), 1)
        self.assert_no_leftover_files()

    def test_12_valid_single_file_existing_path_still_works(self):
        self.bucket.store["uploads/single.pdf"] = VALID_PDF
        self.run_job(job("job12", [entry("uploads/single.pdf")]))
        self.report.assert_not_called()
        paths = self.handed_off_paths()
        self.assertEqual(len(paths), 1)
        args = self.print_file.call_args
        self.assertEqual(args[0][1], 1)                                   # copies
        self.assertEqual(args[0][3], listener.BW_PRINTER_NAME)            # printer
        self.assertIs(args.kwargs["doc_ref"], self.db.document("job12"))  # async completion tracking kept
        self.assertNotIn("gs", self.sub.tools())                          # single file: no merge

    def test_12b_legacy_job_without_files_array_still_works(self):
        self.bucket.store["uploads/legacy.pdf"] = VALID_PDF
        snap = FakeSnapshot("job12b", {"fileUrl": url_for("uploads/legacy.pdf"), "fileName": "legacy.pdf",
                                        "mimetype": "application/pdf", "colorMode": "bw", "printOptions": {}})
        self.run_job(snap)
        self.report.assert_not_called()
        self.assertEqual(len(self.handed_off_paths()), 1)

    def test_cleanup_does_not_touch_other_jobs_cache(self):
        other = self.write(self.cache_path("otherjob", 0, "x.pdf"), VALID_PDF)
        self.bucket.store["uploads/a.pdf"] = VALID_PDF
        self.run_job(job("jobC", [entry("uploads/a.pdf")]))
        self.assertTrue(os.path.exists(other))

    def test_valid_cache_hit_is_used_without_download(self):
        self.write(self.cache_path("jobH", 0, "a.pdf"), VALID_PDF)
        self.bucket.store["uploads/a.pdf"] = ConnectionError("must not be downloaded")
        self.run_job(job("jobH", [entry("uploads/a.pdf")]))
        self.report.assert_not_called()
        self.assertEqual(self.bucket.downloads, [])
        self.assertEqual(len(self.handed_off_paths()), 1)


# ── 10: unique download paths ──────────────────────────────────────────────────────────────────────────────────
class UniqueDownloadPathTests(ListenerTestCase):
    def test_10_same_name_concurrent_downloads_never_share_a_path(self):
        def slow_writer(payload):
            def write(filename):
                with open(filename, "wb") as fh:
                    for i in range(0, len(payload), 64):
                        fh.write(payload[i:i + 64])
                        time.sleep(0.001)
            return write

        payload_a, payload_b = make_pdf(1), make_pdf(3)
        self.bucket.store["uploads/u1/scan.pdf"] = slow_writer(payload_a)
        self.bucket.store["uploads/u2/scan.pdf"] = slow_writer(payload_b)
        with mock.patch.object(listener.time, "time", return_value=1_700_000_000.0):  # same second for both
            with ThreadPoolExecutor(max_workers=2) as pool:
                fa = pool.submit(listener.download_file, url_for("uploads/u1/scan.pdf"), "scan.pdf")
                fb = pool.submit(listener.download_file, url_for("uploads/u2/scan.pdf"), "scan.pdf")
                path_a, path_b = fa.result(), fb.result()
        self.assertIsNotNone(path_a)
        self.assertIsNotNone(path_b)
        self.assertNotEqual(path_a, path_b)
        self.assertFalse(os.path.samefile(path_a, path_b), "two downloads must never share an inode")
        with open(path_a, "rb") as fh:
            self.assertEqual(fh.read(), payload_a)
        with open(path_b, "rb") as fh:
            self.assertEqual(fh.read(), payload_b)
        self.assertTrue(path_a.endswith(".pdf") and path_b.endswith(".pdf"), "extension must be preserved")

    def test_10b_failed_download_removes_temp_file(self):
        self.bucket.store["uploads/x.pdf"] = ConnectionError("boom")
        self.assertIsNone(listener.download_file(url_for("uploads/x.pdf"), "x.pdf"))
        self.assert_no_leftover_files()

    def test_10c_extensionless_upload_gets_type_extension(self):
        self.assertEqual(listener.effective_file_name({"name": "scan", "type": "application/pdf"}), "scan.pdf")
        self.assertEqual(listener.effective_file_name({"name": "IMG_1", "type": "image/jpeg"}), "IMG_1.jpg")
        self.assertEqual(listener.effective_file_name({"name": "a.pdf", "type": "image/png"}), "a.pdf")


# ── 11: prefetch ───────────────────────────────────────────────────────────────────────────────────────────────
class PrefetchTests(ListenerTestCase):
    def test_11_prefetch_partial_failure_is_isolated_and_retryable(self):
        self.bucket.store["uploads/p0.pdf"] = VALID_PDF
        self.bucket.store["uploads/p1.pdf"] = ConnectionError("temporary failure")
        self.bucket.store["uploads/p2.pdf"] = TRUNCATED_PDF
        files = [entry("uploads/p0.pdf"), entry("uploads/p1.pdf"), entry("uploads/p2.pdf")]
        snap = FakeSnapshot("job11", {"files": files, "status": "paid"})

        with mock.patch("time.sleep"):  # the transient failure is retried; don't wait for real
            listener.prefetch_job(snap)  # must not raise, must not report

        # A transient failure is retried a bounded number of times before the entry is given up. Healthy entries are
        # fetched once, and a failed entry must not stop the remaining entries.
        self.assertEqual(self.bucket.downloads.count("uploads/p0.pdf"), 1)
        self.assertEqual(self.bucket.downloads.count("uploads/p2.pdf"), 1)
        self.assertEqual(self.bucket.downloads.count("uploads/p1.pdf"), listener.DOWNLOAD_ATTEMPTS)
        self.assertTrue(listener.validate_pdf_strict(self.cache_path("job11", 0, "p0.pdf"))[0])
        self.assertFalse(os.path.exists(self.cache_path("job11", 1, "p1.pdf")), "failed download must not be published")
        self.assertFalse(os.path.exists(self.cache_path("job11", 2, "p2.pdf")), "invalid download must not be published")
        self.assertEqual([n for n in os.listdir(self.cache_dir) if n.startswith(".partial_")], [], "no partial files left")
        self.report.assert_not_called()

        # process_job retries only the missing entries and succeeds once the sources are good.
        self.bucket.store["uploads/p1.pdf"] = VALID_PDF
        self.bucket.store["uploads/p2.pdf"] = VALID_PDF
        self.bucket.downloads.clear()
        listener.process_job(FakeSnapshot("job11", {"files": files, "colorMode": "bw", "printOptions": {}}))
        self.report.assert_not_called()
        self.assertEqual(sorted(self.bucket.downloads), ["uploads/p1.pdf", "uploads/p2.pdf"])
        self.assertEqual(self.print_file.call_count, 1)

    def test_11b_partial_download_is_never_visible_under_cache_name(self):
        seen_during_download = []
        cache = self.cache_path("job11b", 0, "big.pdf")

        def writer(filename):
            with open(filename, "wb") as fh:
                fh.write(VALID_PDF[:50])
                fh.flush()
                seen_during_download.append(os.path.exists(cache))
                fh.write(VALID_PDF[50:])

        self.bucket.store["uploads/big.pdf"] = writer
        self.assertTrue(listener.prefetch_one_file("job11b", 0, entry("uploads/big.pdf"), 1))
        self.assertEqual(seen_during_download, [False], "cache name must not exist while downloading")
        with open(cache, "rb") as fh:
            self.assertEqual(fh.read(), VALID_PDF)

    def test_11c_prefetch_replaces_invalid_existing_cache(self):
        cache = self.write(self.cache_path("job11c", 0, "a.pdf"), TRUNCATED_PDF)
        self.bucket.store["uploads/a.pdf"] = VALID_PDF
        self.assertTrue(listener.prefetch_one_file("job11c", 0, entry("uploads/a.pdf"), 1))
        with open(cache, "rb") as fh:
            self.assertEqual(fh.read(), VALID_PDF)


# ── Part 2: fail-closed merge + final pre-lp gate (real print_file, fake gs/lp) ────────────────────────────────
class MergeAndFinalGateTests(ListenerTestCase):
    MOCK_PRINT_FILE = False

    def multi_file_job(self, doc_id, page_counts, **extra):
        files = []
        for i, pages in enumerate(page_counts):
            self.bucket.store[f"uploads/{doc_id}_{i}.pdf"] = make_pdf(pages)
            files.append(entry(f"uploads/{doc_id}_{i}.pdf"))
        return job(doc_id, files, **extra)

    def assert_merge_failed_closed(self, reason_fragment):
        self.assertEqual(self.report.call_count, 1, self.report.call_args_list)
        self.assertIn(reason_fragment, self.report.call_args[0][1])
        self.assertEqual(self.sub.lp_calls, [], "lp must not run after a merge failure")
        self.assertNotIn("lp", self.sub.tools())
        self.wait_for_cups.assert_not_called()
        self.assert_no_leftover_files()  # merge output removed, no unmerged inputs left behind

    def test_A_n_valid_pdfs_merge_and_lp_receives_merged_pdf(self):
        listener.process_job(self.multi_file_job("jobA", [1, 2, 3]))
        self.report.assert_not_called()
        self.assertEqual(len(self.sub.lp_calls), 1)
        submitted = self.sub.lp_calls[0]
        self.assertEqual(len(submitted), 1, "lp must receive exactly one (merged) file, never the unmerged inputs")
        self.assertTrue(submitted[0][0].endswith("_merged_all.pdf"), submitted[0][0])
        self.assertEqual(len([c for c in self.sub.calls if c[0] == "gs"]), 1, "exactly one Ghostscript merge")
        self.wait_for_cups.assert_called_once()
        self.assert_no_leftover_files()

    def test_B_ghostscript_nonzero_exit_fails_job(self):
        self.sub.gs_mode = "nonzero"
        listener.process_job(self.multi_file_job("jobB", [1, 2]))
        self.assert_merge_failed_closed("exit code 1")

    def test_C_ghostscript_timeout_fails_job(self):
        self.sub.gs_mode = "timeout"
        listener.process_job(self.multi_file_job("jobC", [1, 2]))
        self.assert_merge_failed_closed("timed out after 60s")
        gs_call = next(c for c in self.sub.calls if c[0] == "gs")
        self.assertIn("-sDEVICE=pdfwrite", gs_call)

    def test_C2_merge_timeout_is_still_60_seconds(self):
        self.assertEqual(listener.GS_MERGE_TIMEOUT_SEC, 60)
        seen = {}
        original = self.sub.__call__

        def spy(cmd, *a, **kw):
            if cmd[0] == "gs":
                seen.update(kw)
            return original(cmd, *a, **kw)

        with mock.patch.object(listener.subprocess, "run", spy):
            listener.process_job(self.multi_file_job("jobC2", [1, 1]))
        self.assertEqual(seen.get("timeout"), 60)
        self.assertTrue(seen.get("check"))

    def test_D_ghostscript_missing_fails_job(self):
        self.sub.gs_mode = "missing"
        listener.process_job(self.multi_file_job("jobD", [1, 2]))
        self.assert_merge_failed_closed("not installed")

    def test_E_ghostscript_invalid_output_fails_job(self):
        self.sub.gs_mode = "invalid_output"
        listener.process_job(self.multi_file_job("jobE", [1, 2]))
        self.assert_merge_failed_closed("merged output invalid")

    def test_E2_ghostscript_no_output_fails_job(self):
        self.sub.gs_mode = "no_output"
        listener.process_job(self.multi_file_job("jobE2", [1, 2]))
        self.assert_merge_failed_closed("merged output invalid")

    def test_F_merged_page_count_mismatch_fails_job(self):
        self.sub.gs_mode = "wrong_pages"
        listener.process_job(self.multi_file_job("jobF", [2, 3]))
        self.assert_merge_failed_closed("merged page count 6 != 5")

    def test_G_final_gate_blocks_lp_for_invalid_file(self):
        bad = self.write(os.path.join(self.tmp, "final.pdf"), TRUNCATED_PDF)
        doc_ref = self.db.document("jobG")
        result = listener.print_file([bad], 1, None, listener.BW_PRINTER_NAME, doc_ref=doc_ref)
        self.assertIs(result, False)
        self.assertNotIn("lp", self.sub.tools(), "lp must not execute when the final check fails")
        self.report.assert_not_called()  # print_file does not report; process_job owns reporting
        self.wait_for_cups.assert_not_called()

    def test_G2_final_gate_in_process_job_reports_once_and_never_calls_lp(self):
        # The job-level page range is applied inside print_file (unchanged behaviour); make that slice produce a
        # corrupt file so only the final pre-lp gate can stop it.
        corrupt = self.write(os.path.join(self.tmp, "sliced_corrupt.pdf"), TRUNCATED_PDF)
        self.bucket.store["uploads/g2.pdf"] = make_pdf(3)
        snap = job("jobG2", [entry("uploads/g2.pdf")],
                   printOptions={"copies": 1, "pageSelection": "custom", "pageRange": "1-2", "fileConfigs": {}})
        with mock.patch.object(listener, "slice_pdf_pages", mock.Mock(return_value=corrupt)):
            listener.process_job(snap)
        self.assertEqual(self.sub.lp_calls, [])
        self.assertNotIn("lp", self.sub.tools())
        self.assertEqual(self.report.call_count, 1)
        self.assertEqual(self.report.call_args[0][1], "CUPS error on Pi")

    def test_G3_final_gate_accepts_valid_single_file(self):
        good = self.write(os.path.join(self.tmp, "ok.pdf"), make_pdf(2))
        result = listener.print_file([good], 1, None, listener.BW_PRINTER_NAME, doc_ref=self.db.document("jobG3"))
        self.assertIsNone(result)  # async path: accepted by CUPS
        self.assertEqual(self.sub.lp_calls, [[(good, 2)]])

    def test_H_merged_output_has_exact_total_page_count(self):
        listener.process_job(self.multi_file_job("jobH", [2, 4, 1, 3]))
        self.report.assert_not_called()
        self.assertEqual(len(self.sub.lp_calls), 1)
        (_path, pages), = self.sub.lp_calls[0]
        self.assertEqual(pages, 10, "merged PDF must contain exactly the sum of the input pages")

    def test_invalid_merge_input_never_reaches_ghostscript(self):
        a = self.write(os.path.join(self.temp_dir, "in_a.pdf"), make_pdf(1))
        b = self.write(os.path.join(self.temp_dir, "in_b.pdf"), TRUNCATED_PDF)
        out = listener.new_temp_pdf_path("merged_all")
        ok, pages, reason = listener.merge_pdfs_strict([a, b], out, listener.GS_BW_COMPRESS)
        self.assertFalse(ok)
        self.assertIsNone(pages)
        self.assertIn("merge input invalid", reason)
        self.assertNotIn("gs", self.sub.tools())

    def test_nup_multi_file_uses_the_single_fail_closed_merge(self):
        # With N-up and several files the only Ghostscript merge is the fail-closed one; a failing merge stops the
        # job before any layout work or printing.
        self.sub.gs_mode = "nonzero"
        snap = self.multi_file_job("jobNup", [1, 1], printOptions={"copies": 1, "photoLayout": "4"})
        with mock.patch.object(listener, "impose_nup", mock.Mock(side_effect=AssertionError("must not run"))):
            listener.process_job(snap)
        self.assert_merge_failed_closed("Could not merge")
        self.assertEqual(len([c for c in self.sub.calls if c[0] == "gs"]), 1)


class AutoResumeEligibilityTests(unittest.TestCase):
    """is_eligible_for_auto_resume: the strict rule that stops the watchdog fallback from
    silently reprinting a backlog of stuck jobs with no customer instruction (see the function's
    own docstring in firebase_listener.py for the incident this fixes)."""

    NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def test_fresh_job_is_eligible(self):
        data = {"printStartedAt": self.NOW - timedelta(seconds=5)}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertTrue(eligible, reason)

    def test_job_already_auto_resumed_is_never_eligible_again(self):
        # Even if it is otherwise perfectly fresh — one attempt only, ever.
        data = {"printStartedAt": self.NOW - timedelta(seconds=5), "autoResumedAt": self.NOW - timedelta(seconds=4)}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertFalse(eligible)
        self.assertIn("already given one auto-resume attempt", reason)

    def test_job_older_than_max_age_is_not_eligible(self):
        data = {"printStartedAt": self.NOW - timedelta(hours=3)}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertFalse(eligible)
        self.assertIn("too old", reason)

    def test_job_just_under_the_max_age_boundary_is_still_eligible(self):
        data = {"printStartedAt": self.NOW - (listener.AUTO_RESUME_MAX_AGE - timedelta(seconds=1))}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertTrue(eligible, reason)

    def test_job_just_over_the_max_age_boundary_is_not_eligible(self):
        data = {"printStartedAt": self.NOW - (listener.AUTO_RESUME_MAX_AGE + timedelta(seconds=1))}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertFalse(eligible)

    def test_job_already_tracked_in_process_is_not_re_resumed(self):
        data = {"printStartedAt": self.NOW - timedelta(seconds=5)}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, {"j1"}, self.NOW)
        self.assertFalse(eligible)
        self.assertIn("already tracked as active", reason)

    def test_job_with_no_timestamp_at_all_is_not_eligible(self):
        eligible, reason = listener.is_eligible_for_auto_resume("j1", {}, set(), self.NOW)
        self.assertFalse(eligible)
        self.assertIn("no timestamp", reason)

    def test_prefers_printStartedAt_over_createdAt_and_updatedAt(self):
        # printStartedAt says "just started" (eligible); createdAt/updatedAt say "ancient" — if the
        # wrong field won, this job would be wrongly rejected as too old.
        data = {
            "printStartedAt": self.NOW - timedelta(seconds=5),
            "createdAt": self.NOW - timedelta(hours=10),
            "updatedAt": self.NOW - timedelta(hours=10),
        }
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertTrue(eligible, reason)

    def test_falls_back_to_createdAt_when_printStartedAt_missing(self):
        data = {"createdAt": self.NOW - timedelta(seconds=5)}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertTrue(eligible, reason)

    def test_falsy_autoResumedAt_does_not_block_eligibility(self):
        # A stray falsy value (None/""), as opposed to a real marker, must not be treated as "already resumed".
        data = {"printStartedAt": self.NOW - timedelta(seconds=5), "autoResumedAt": None}
        eligible, reason = listener.is_eligible_for_auto_resume("j1", data, set(), self.NOW)
        self.assertTrue(eligible, reason)


class _FakeChangeType:
    def __init__(self, name):
        self.name = name


class _FakeChange:
    def __init__(self, type_name, document):
        self.type = _FakeChangeType(type_name)
        self.document = document


class PrefetchFreshnessTests(ListenerTestCase):
    def test_fresh_job_is_fresh(self):
        doc = {"createdAt": datetime.now(timezone.utc)}
        self.assertTrue(listener._is_prefetch_candidate_fresh(doc))

    def test_old_job_is_not_fresh(self):
        doc = {"createdAt": datetime.now(timezone.utc) - timedelta(seconds=listener.PREFETCH_MAX_JOB_AGE_SECONDS + 1)}
        self.assertFalse(listener._is_prefetch_candidate_fresh(doc))

    def test_missing_timestamp_fails_open(self):
        self.assertTrue(listener._is_prefetch_candidate_fresh({}))

    def test_naive_timestamp_fails_open_instead_of_raising(self):
        # A naive datetime (no tzinfo) compared against an aware "now" must not raise.
        doc = {"createdAt": datetime.now() - timedelta(seconds=listener.PREFETCH_MAX_JOB_AGE_SECONDS + 1)}
        self.assertTrue(listener._is_prefetch_candidate_fresh(doc))


# ── Bounded prefetch dispatch: replaces one unbounded thread per snapshot change ────────────────────────────────
class PrefetchConcurrencyTests(ListenerTestCase):
    def test_fresh_paid_job_is_submitted_to_bounded_pool(self):
        snap = FakeSnapshot("jobF1", {"status": "paid", "createdAt": datetime.now(timezone.utc)})
        fake_pool = mock.Mock(name="prefetch_pool")
        with mock.patch.object(listener, "_prefetch_pool", fake_pool):
            listener.on_prefetch_snapshot(None, [_FakeChange("ADDED", snap)], None)
        fake_pool.submit.assert_called_once_with(listener.prefetch_job, snap)

    def test_stale_backlog_job_is_skipped_on_reconnect(self):
        # This is the exact scenario that used to cause a download-burst lag spike: Firestore
        # delivers the whole existing backlog as 'ADDED' changes on listener (re)connect.
        old = datetime.now(timezone.utc) - timedelta(seconds=listener.PREFETCH_MAX_JOB_AGE_SECONDS + 60)
        snap = FakeSnapshot("jobF2", {"status": "paid", "createdAt": old})
        fake_pool = mock.Mock(name="prefetch_pool")
        with mock.patch.object(listener, "_prefetch_pool", fake_pool):
            listener.on_prefetch_snapshot(None, [_FakeChange("ADDED", snap)], None)
        fake_pool.submit.assert_not_called()

    def test_missing_timestamp_still_dispatches(self):
        snap = FakeSnapshot("jobF3", {"status": "pending"})
        fake_pool = mock.Mock(name="prefetch_pool")
        with mock.patch.object(listener, "_prefetch_pool", fake_pool):
            listener.on_prefetch_snapshot(None, [_FakeChange("ADDED", snap)], None)
        fake_pool.submit.assert_called_once_with(listener.prefetch_job, snap)

    def test_non_candidate_status_is_ignored(self):
        snap = FakeSnapshot("jobF4", {"status": "printing", "createdAt": datetime.now(timezone.utc)})
        fake_pool = mock.Mock(name="prefetch_pool")
        with mock.patch.object(listener, "_prefetch_pool", fake_pool):
            listener.on_prefetch_snapshot(None, [_FakeChange("MODIFIED", snap)], None)
        fake_pool.submit.assert_not_called()

    def test_prefetch_pool_is_bounded(self):
        self.assertLessEqual(listener._prefetch_pool._max_workers, listener.PREFETCH_MAX_CONCURRENT)


# ── Prefetch cache eviction: protects active prints, respects age + size caps ───────────────────────────────────
class PrefetchCacheCleanupTests(ListenerTestCase):
    def _touch(self, name, age_seconds, size=10):
        path = os.path.join(self.cache_dir, name)
        with open(path, "wb") as fh:
            fh.write(b"x" * size)
        mtime = time.time() - age_seconds
        os.utime(path, (mtime, mtime))
        return path

    def test_evicts_stale_file_past_max_age(self):
        path = self._touch("docOld_0.pdf", listener.PREFETCH_CACHE_MAX_AGE_SECONDS + 60)
        listener.cleanup_prefetch_cache()
        self.assertFalse(os.path.exists(path))

    def test_keeps_recent_file(self):
        path = self._touch("docNew_0.pdf", 5)
        listener.cleanup_prefetch_cache()
        self.assertTrue(os.path.exists(path))

    def test_never_evicts_file_whose_job_is_active_even_if_stale(self):
        path = self._touch("docActive_0.pdf", listener.PREFETCH_CACHE_MAX_AGE_SECONDS + 600)
        listener.active_jobs.add("docActive")
        self.addCleanup(listener.active_jobs.discard, "docActive")
        listener.cleanup_prefetch_cache()
        self.assertTrue(os.path.exists(path), "a file for a job currently being printed must never be evicted")

    def test_ignores_partial_in_progress_downloads(self):
        path = self._touch(".partial_docX_0.pdf", listener.PREFETCH_CACHE_MAX_AGE_SECONDS + 600)
        listener.cleanup_prefetch_cache()
        self.assertTrue(os.path.exists(path), "an in-progress download must never be touched by cleanup")

    def test_enforces_total_size_cap_oldest_first(self):
        # Three same-size files, all within the age limit, but together over the size cap.
        old = self._touch("docA_0.pdf", 300, size=100)
        mid = self._touch("docB_0.pdf", 200, size=100)
        new = self._touch("docC_0.pdf", 100, size=100)
        listener.cleanup_prefetch_cache(max_age_seconds=10_000, max_total_bytes=150)
        self.assertFalse(os.path.exists(old), "oldest file must be evicted first to respect the size cap")
        self.assertFalse(os.path.exists(mid), "second-oldest must also go once the cap still isn't met")
        self.assertTrue(os.path.exists(new), "newest file must survive once the cap is satisfied")

    def test_does_not_evict_anything_under_both_caps(self):
        path = self._touch("docSmall_0.pdf", 5, size=10)
        listener.cleanup_prefetch_cache()
        self.assertTrue(os.path.exists(path))


class ImportSafetyTests(unittest.TestCase):
    def test_import_does_not_start_listener(self):
        self.assertIsNone(listener.db, "importing must not initialise Firebase")
        self.assertIsNone(listener.bucket)
        self.assertTrue(callable(listener.init_firebase))
        self.assertTrue(callable(listener.ensure_work_dirs))


if __name__ == "__main__":
    unittest.main()
