"""Tests for the N-up fail-closed hardening in pi_scripts/firebase_listener.py: impose_nup() and its
caller in process_job(). N-up must no longer guess a page count on pdfinfo failure, assemble a partial
page set after a rasterization failure, accept an invalid/incomplete output artifact, or fall back to a
different CUPS `number-up` rendering path when the custom imposition fails.

Offline only: pdfinfo and Ghostscript are faked (poppler/Ghostscript are not installed in this dev
environment); real Pillow is used so impose_nup's own PNG/PDF compositing code runs unmodified. Any
unexpected subprocess call fails the test, which proves the print path was not reached on a failure.

Run:  python -B pi_scripts/tests/test_nup_fail_closed.py -v
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from test_listener_inputs import listener, make_pdf, TRUNCATED_PDF, job, entry, ListenerTestCase  # noqa: E402

from PIL import Image  # noqa: E402  (installed in this environment; used for real compositing)


def real_pdfinfo_result(path):
    """Counts pages in whatever PDF is at `path`. Unlike test_listener_inputs' fake_pdfinfo_result (which
    only understands the make_pdf() fixture's layout), this also understands a real Pillow-produced PDF —
    impose_nup's own per-page and per-sheet files are real Pillow output in these tests, not fixtures."""
    with open(path, "rb") as fh:
        data = fh.read()
    if not data.startswith(b"%PDF"):
        return subprocess.CompletedProcess(["pdfinfo", path], 1, "", "Syntax Warning: May not be a PDF file (continuing anyway)\n")
    pages = len(re.findall(rb"/Type\s*/Page(?!s)", data))
    if pages < 1:
        return subprocess.CompletedProcess(["pdfinfo", path], 1, "", "Syntax Error: Couldn't read xref table\n")
    return subprocess.CompletedProcess(["pdfinfo", path], 0, f"Pages:          {pages}\n", "")


class NupFakeSubprocess:
    """Fakes pdfinfo/gs for impose_nup(): controls page-count discovery, per-page rasterization
    failures, and the sheet-merge outcome.

    gs rasterize (png16m) writes a real tiny PNG via Pillow, so impose_nup's own Pillow compositing
    code (rotate/resize/paste) runs for real. gs merge (pdfwrite) fakes its output the same way the
    repository's existing merge tests do (a make_pdf() fixture sized to the input count) — merging
    real per-sheet PDF bytes isn't something Pillow can do, and the repo has no PDF library installed.
    """

    def __init__(self):
        self.calls = []
        self.pdfinfo_mode = "ok"    # "ok" | "fail"
        self.fail_pages = set()     # 1-based source page numbers whose rasterize must fail
        self.merge_mode = "ok"      # "ok" | "nonzero" | "invalid_output"

    def __call__(self, cmd, *args, **kwargs):
        self.calls.append(list(cmd))
        tool = cmd[0]
        if tool == "pdfinfo":
            if self.pdfinfo_mode == "fail":
                return subprocess.CompletedProcess(cmd, 1, "", "Syntax Error: Couldn't read xref table\n")
            return real_pdfinfo_result(cmd[1])
        if tool == "gs":
            out = next(a.split("=", 1)[1] for a in cmd if a.startswith("-sOutputFile="))
            # gs is invoked without text=True in impose_nup(), so stdout/stderr must be bytes here,
            # matching real subprocess.run behaviour (the code calls result.stderr.decode()).
            if "-sDEVICE=png16m" in cmd:
                pg = int(next(a for a in cmd if a.startswith("-dFirstPage=")).split("=", 1)[1])
                if pg in self.fail_pages:
                    return subprocess.CompletedProcess(cmd, 1, b"", f"rasterize error page {pg}".encode())
                Image.new("RGB", (40, 40), (255, 255, 255)).save(out, "PNG")
                return subprocess.CompletedProcess(cmd, 0, b"", b"")
            if "-sDEVICE=pdfwrite" in cmd:
                inputs = [a for a in cmd[1:] if not a.startswith("-")]
                if self.merge_mode == "nonzero":
                    if kwargs.get("check"):
                        raise subprocess.CalledProcessError(1, cmd)
                    return subprocess.CompletedProcess(cmd, 1, b"", b"gs merge error")
                with open(out, "wb") as fh:
                    fh.write(TRUNCATED_PDF if self.merge_mode == "invalid_output" else make_pdf(len(inputs)))
                return subprocess.CompletedProcess(cmd, 0, b"", b"")
        raise AssertionError(f"unexpected subprocess call in N-up test: {cmd}")

    def tools(self):
        return [c[0] for c in self.calls]


# ── Direct unit tests of impose_nup() ────────────────────────────────────────────────────────────────
class ImposeNupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mimo_nup_test_")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.sub = NupFakeSubprocess()
        patches = [
            mock.patch.object(listener, "TEMP_DIR", self.tmp),
            mock.patch.object(listener.subprocess, "run", self.sub),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def source_pdf(self, pages):
        path = os.path.join(self.tmp, f"src_{pages}.pdf")
        with open(path, "wb") as fh:
            fh.write(make_pdf(pages))
        return path

    def output_path(self):
        return os.path.join(self.tmp, "out_imposed.pdf")

    def assert_no_leftover_temp_files(self, out):
        leftovers = [f for f in os.listdir(self.tmp) if f not in (os.path.basename(out),) and not f.startswith("src_")]
        self.assertEqual(leftovers, [], f"temp page/sheet files left behind: {leftovers}")

    # TEST 1 — pdfinfo/page-count failure
    def test_01_pdfinfo_failure_fails_closed_no_guess(self):
        self.sub.pdfinfo_mode = "fail"
        src = self.source_pdf(4)
        out = self.output_path()
        ok = listener.impose_nup(src, out, "4")
        self.assertFalse(ok)
        self.assertFalse(os.path.exists(out), "no guessed/partial N-up output must be left behind")
        self.assertNotIn("-sDEVICE=png16m", [a for c in self.sub.calls for a in c],
                          "must not rasterize anything without a known page count")

    # TEST 2 — one-page rasterization failure (the original partial-artifact bug)
    def test_02_one_page_rasterization_failure_fails_whole_operation(self):
        self.sub.fail_pages = {2}
        src = self.source_pdf(3)  # page 1 -> success, page 2 -> failure, page 3 would have succeeded
        out = self.output_path()
        ok = listener.impose_nup(src, out, "4")
        self.assertFalse(ok)
        self.assertFalse(os.path.exists(out), "page 1/page 3 must not be assembled into a partial output")
        self.assert_no_leftover_temp_files(out)
        # page 3 must never even be attempted once page 2 failed
        rasterized_pages = [int(a.split("=", 1)[1]) for c in self.sub.calls if c[0] == "gs" and "-sDEVICE=png16m" in c
                             for a in c if a.startswith("-dFirstPage=")]
        self.assertNotIn(3, rasterized_pages)

    def test_02b_partial_png_from_failed_gs_call_is_removed(self):
        # Ghostscript can leave a partial image behind and then fail (or time out) before the path is
        # collected into page_imgs; that half-written file must still be cleaned up.
        real_call = self.sub.__call__

        def partial_then_fail(cmd, *a, **kw):
            if cmd[0] == "gs" and "-sDEVICE=png16m" in cmd:
                out = next(x.split("=", 1)[1] for x in cmd if x.startswith("-sOutputFile="))
                with open(out, "wb") as fh:
                    fh.write(b"\x89PNG partial")
                if "-dFirstPage=2" in cmd:
                    raise subprocess.TimeoutExpired(cmd, kw.get("timeout"))
            return real_call(cmd, *a, **kw)

        src = self.source_pdf(3)
        out = self.output_path()
        with mock.patch.object(listener.subprocess, "run", partial_then_fail):
            ok = listener.impose_nup(src, out, "4")
        self.assertFalse(ok)
        self.assertFalse(os.path.exists(out))
        self.assert_no_leftover_temp_files(out)

    # TEST 3 — defensive page-completeness invariant, independent of the immediate-fail-on-error path
    def test_03_page_completeness_invariant_catches_a_short_page_set(self):
        src = self.source_pdf(3)
        out = self.output_path()
        real_call = self.sub.__call__
        seen = {"png_calls": 0}

        def rasterize_silently_drops_one(cmd, *a, **kw):
            if cmd[0] == "gs" and "-sDEVICE=png16m" in cmd:
                seen["png_calls"] += 1
                if seen["png_calls"] == 2:
                    # Claims success (returncode 0) but never writes the output file — simulates a
                    # rasterizer that silently produced fewer images than requested, independent of
                    # the "returncode != 0" path that test_02 already covers.
                    return subprocess.CompletedProcess(cmd, 0, b"", b"")
            return real_call(cmd, *a, **kw)

        with mock.patch.object(listener.subprocess, "run", rasterize_silently_drops_one):
            ok = listener.impose_nup(src, out, "4")
        self.assertFalse(ok)
        self.assertFalse(os.path.exists(out))

    # TEST 4 — invalid / failed N-up output
    def test_04_invalid_merged_output_is_rejected_and_removed(self):
        self.sub.merge_mode = "invalid_output"
        src = self.source_pdf(8)  # 8 pages / 4-up => 2 sheets => exercises the gs merge path
        out = self.output_path()
        ok = listener.impose_nup(src, out, "4")
        self.assertFalse(ok)
        self.assertFalse(os.path.exists(out), "an invalid output artifact must be removed, not left behind")

    def test_04b_ghostscript_merge_failure_is_rejected(self):
        self.sub.merge_mode = "nonzero"
        src = self.source_pdf(8)
        out = self.output_path()
        ok = listener.impose_nup(src, out, "4")
        self.assertFalse(ok)
        self.assertFalse(os.path.exists(out))

    # TEST 6 (unit level) — the normal successful path must still work
    def test_06_normal_single_sheet_nup_succeeds(self):
        src = self.source_pdf(4)  # exactly one 4-up sheet
        out = self.output_path()
        ok = listener.impose_nup(src, out, "4")
        self.assertTrue(ok)
        ok2, pages, reason = listener.validate_pdf_strict(out)
        self.assertTrue(ok2, reason)
        self.assertEqual(pages, 1)
        self.assert_no_leftover_temp_files(out)

    def test_06b_normal_multi_sheet_nup_succeeds(self):
        src = self.source_pdf(8)  # 8 pages, 4-up -> 2 sheets -> exercises the gs merge path
        out = self.output_path()
        ok = listener.impose_nup(src, out, "4")
        self.assertTrue(ok)
        ok2, pages, reason = listener.validate_pdf_strict(out)
        self.assertTrue(ok2, reason)
        self.assertEqual(pages, 2)

    def test_06c_single_page_source_still_replicates_across_the_layout(self):
        # Pre-existing, intentional behaviour (photo printing): a genuinely single-page source is
        # replicated n times onto one sheet. This must be preserved — it is not a page-count failure.
        src = self.source_pdf(1)
        out = self.output_path()
        ok = listener.impose_nup(src, out, "4")
        self.assertTrue(ok)
        ok2, pages, reason = listener.validate_pdf_strict(out)
        self.assertTrue(ok2, reason)
        self.assertEqual(pages, 1)


# ── Integration level: process_job() must fail closed and never use CUPS number-up ──────────────────
class ProcessJobNupFailClosedTests(ListenerTestCase):
    MOCK_PRINT_FILE = False  # exercise the real print_file()/lp path to prove it is never reached on failure

    def run_nup_job(self, doc_id, pages, layout="4"):
        self.bucket.store[f"uploads/{doc_id}.pdf"] = make_pdf(pages)
        snap = job(doc_id, [entry(f"uploads/{doc_id}.pdf")], printOptions={"copies": 1, "photoLayout": layout})
        listener.process_job(snap)

    # TEST 5 — no CUPS number-up fallback
    def test_05_impose_nup_failure_fails_closed_without_any_cups_submission(self):
        with mock.patch.object(listener, "impose_nup", mock.Mock(return_value=False)):
            self.run_nup_job("jobNup5", 4)
        self.assertEqual(self.report.call_count, 1, self.report.call_args_list)
        self.assertIn("N-up layout generation failed", self.report.call_args[0][1])
        self.assertEqual(self.sub.lp_calls, [], "lp must never run after a failed N-up")
        self.assertNotIn("lp", self.sub.tools())
        self.wait_for_cups.assert_not_called()

    def test_05b_impose_nup_exception_also_fails_closed(self):
        # impose_nup is documented to return False on any internal error, never raise — but the caller
        # must not silently fall back even if it somehow did.
        with mock.patch.object(listener, "impose_nup", mock.Mock(side_effect=RuntimeError("boom"))):
            self.run_nup_job("jobNup5b", 4)
        self.assertEqual(self.report.call_count, 1, self.report.call_args_list)
        self.assertEqual(self.sub.lp_calls, [])
        self.assertNotIn("lp", self.sub.tools())

    # TEST 6 (integration level) — normal successful N-up still reaches CUPS, without number-up
    def test_06_successful_impose_nup_reaches_lp_without_number_up_option(self):
        def fake_impose(input_pdf, output_pdf, layout_num):
            with open(output_pdf, "wb") as fh:
                fh.write(make_pdf(1))
            return True

        with mock.patch.object(listener, "impose_nup", mock.Mock(side_effect=fake_impose)):
            self.run_nup_job("jobNup6", 4)
        self.report.assert_not_called()
        self.assertEqual(len(self.sub.lp_calls), 1)
        lp_cmd = next(c for c in self.sub.calls if c[0] == "lp")
        self.assertNotIn("number-up", " ".join(lp_cmd), "CUPS number-up must never be used once N-up succeeded")
        self.wait_for_cups.assert_called_once()


if __name__ == "__main__":
    unittest.main()
