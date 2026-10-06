"""Tests for the transformation fail-closed contract in pi_scripts/firebase_listener.py:

- image conversions composite transparency onto white (RGB/RGBA semantics preserved otherwise),
- duplex with an unknown page count or a failed duplicate stops the job,
- color normalization that fails or yields a mismatched PDF stops the job,
- a page-range slice that cannot be applied stops the job instead of printing the whole document.

Offline only, like the rest of the suite: Ghostscript/pdfinfo are faked; real Pillow runs the image code.

Run:  python -B pi_scripts/tests/test_transform_fail_closed.py -v
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from test_listener_inputs import (  # noqa: E402
    listener, make_pdf, TRUNCATED_PDF, fake_pdfinfo_result, job, entry, ListenerTestCase, FakeSubprocess,
)

from PIL import Image  # noqa: E402


# ── Part 1: transparency ──────────────────────────────────────────────────────────────────────────────────────
class ImageTransparencyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mimo_transform_test_")
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def write_image(self, name, img):
        path = os.path.join(self.tmp, name)
        img.save(path, "PNG")
        return path

    def captured_canvas(self, convert, *args):
        """Runs a real conversion function and returns the RGB image it hands to PDF encoding."""
        captured = []
        real_save = Image.Image.save

        def spy(this, fp, format=None, **kw):
            captured.append(this.copy())
            return real_save(this, fp, format, **kw)

        with mock.patch.object(Image.Image, "save", spy):
            out = convert(*args)
        self.assertIsNotNone(out, "conversion must succeed")
        self.assertEqual(len(captured), 1)
        return captured[0]

    # TEST A — transparent RGBA: transparent pixels must render white, never black
    def test_A_fully_transparent_rgba_renders_white_in_every_conversion_path(self):
        # RGB under the transparent pixels is black, so a bare convert('RGB') would print black.
        src = self.write_image("clear.png", Image.new("RGBA", (40, 40), (0, 0, 0, 0)))
        for name, convert, args in [
            ("fit", listener.convert_image_to_pdf_fit, (src, False)),
            ("fill", listener.process_image_fill, (src, None, False)),
            ("custom", listener.process_image_custom, (src, 100, False)),
        ]:
            with self.subTest(path=name):
                canvas = self.captured_canvas(convert, *args)
                rgb = canvas.convert("RGB")
                self.assertEqual(rgb.getpixel((rgb.width // 2, rgb.height // 2)), (255, 255, 255))

    def test_A2_partly_transparent_rgba_keeps_opaque_content_and_whitens_clear_part(self):
        img = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
        img.paste((0, 0, 255, 255), (0, 0, 20, 40))  # opaque blue left half, transparent right half
        src = self.write_image("half.png", img)
        canvas = self.captured_canvas(listener.convert_image_to_pdf_fit, src, False).convert("RGB")
        w, h = canvas.size
        self.assertEqual(canvas.getpixel((w // 4, h // 2)), (0, 0, 255), "opaque content must be kept")
        self.assertEqual(canvas.getpixel((3 * w // 4, h // 2)), (255, 255, 255), "transparent region must be white")

    # TEST B — ordinary RGB image: unchanged semantics
    def test_B_ordinary_rgb_image_content_is_unchanged(self):
        src = self.write_image("rgb.png", Image.new("RGB", (40, 40), (10, 200, 30)))
        canvas = self.captured_canvas(listener.convert_image_to_pdf_fit, src, False).convert("RGB")
        self.assertEqual(canvas.getpixel((canvas.width // 2, canvas.height // 2)), (10, 200, 30))

    # TEST C — an opaque RGBA image renders the same as the equivalent RGB image
    def test_C_opaque_rgba_matches_equivalent_rgb(self):
        rgb_src = self.write_image("rgb_eq.png", Image.new("RGB", (40, 40), (10, 200, 30)))
        rgba_src = self.write_image("rgba_eq.png", Image.new("RGBA", (40, 40), (10, 200, 30, 255)))
        rgb_canvas = self.captured_canvas(listener.convert_image_to_pdf_fit, rgb_src, False).convert("RGB")
        rgba_canvas = self.captured_canvas(listener.convert_image_to_pdf_fit, rgba_src, False).convert("RGB")
        self.assertEqual(rgb_canvas.tobytes(), rgba_canvas.tobytes())


# ── Parts 2-4 and the slicing question: job-level behaviour ───────────────────────────────────────────────────
class PdfinfoFailsAfter(FakeSubprocess):
    """FakeSubprocess whose pdfinfo starts failing after `ok_calls` successful calls.

    A single-file job calls pdfinfo while downloading and validating the input (2 calls) before the duplex
    stage, so ok_calls=2 makes exactly the duplex page-count lookup fail. The test asserts the failure
    message names duplex, so the test cannot pass for a different reason.
    """

    def __init__(self, ok_calls):
        super().__init__()
        self.ok_calls = ok_calls
        self.pdfinfo_calls = 0

    def __call__(self, cmd, *args, **kwargs):
        if cmd[0] == "pdfinfo":
            self.pdfinfo_calls += 1
            if self.pdfinfo_calls > self.ok_calls:
                self.calls.append(list(cmd))
                return subprocess.CompletedProcess(cmd, 1, "", "Syntax Error: Couldn't read xref table\n")
        return super().__call__(cmd, *args, **kwargs)


class TransformFailClosedTests(ListenerTestCase):
    MOCK_PRINT_FILE = False  # the real print_file/lp path proves CUPS is never reached

    def run_job(self, doc_id, pages, colorMode=None, **options):
        self.bucket.store[f"uploads/{doc_id}.pdf"] = make_pdf(pages)
        print_options = {"copies": 1}
        print_options.update(options)
        extra = {"colorMode": colorMode} if colorMode else {}
        listener.process_job(job(doc_id, [entry(f"uploads/{doc_id}.pdf")], printOptions=print_options, **extra))

    def assert_failed_without_cups(self, reason_fragment):
        self.assertEqual(self.report.call_count, 1, self.report.call_args_list)
        self.assertIn(reason_fragment, self.report.call_args[0][1])
        self.assertEqual(self.sub.lp_calls, [], "lp must never run for a failed transformation")
        self.assertNotIn("lp", self.sub.tools())
        self.wait_for_cups.assert_not_called()
        self.assert_no_leftover_files()

    # TEST D — duplex + page count unavailable: fail, no CUPS
    def test_D_duplex_with_unknown_page_count_fails_closed(self):
        fake = PdfinfoFailsAfter(ok_calls=2)
        with mock.patch.object(listener.subprocess, "run", fake):
            self.run_job("jobD", 1, doubleSided="double")
        self.assertEqual(self.report.call_count, 1, self.report.call_args_list)
        self.assertIn("duplex", self.report.call_args[0][1].lower())
        self.assertEqual(self.sub.lp_calls, [])
        self.assertNotIn("lp", self.sub.tools())
        self.wait_for_cups.assert_not_called()

    # TEST D2 — duplex copy cannot be produced: fail, the single-page original is never sent instead
    def test_D2_failed_duplex_duplication_never_sends_the_original(self):
        self.sub.gs_mode = "nonzero"
        self.run_job("jobD2", 1, doubleSided="double")
        self.assert_failed_without_cups("duplex copy")

    # TEST E — duplex normal path still duplicates a valid single-page PDF
    def test_E_duplex_normal_path_duplicates_single_page(self):
        self.run_job("jobE", 1, doubleSided="double")
        self.report.assert_not_called()
        self.assertEqual(len(self.sub.lp_calls), 1)
        (_path, pages), = self.sub.lp_calls[0]
        self.assertEqual(pages, 2, "the duplex copy must have two pages (front + back)")

    # TEST F — color normalization fails (non-zero exit): partial output removed, no substitution, no CUPS
    def test_F_color_normalization_nonzero_fails_closed(self):
        real_run = self.sub.__call__

        def partial_then_fail(cmd, *a, **kw):
            if cmd[0] == "gs" and "-dFIXEDMEDIA" in cmd:
                out = next(x.split("=", 1)[1] for x in cmd if x.startswith("-sOutputFile="))
                with open(out, "wb") as fh:
                    fh.write(TRUNCATED_PDF)
                raise subprocess.CalledProcessError(1, cmd)
            return real_run(cmd, *a, **kw)

        with mock.patch.object(listener.subprocess, "run", partial_then_fail):
            self.run_job("jobF", 2, colorMode="color")
        self.assert_failed_without_cups("Color normalization failed")

    # TEST G — color normalization times out: same fail-closed behaviour
    def test_G_color_normalization_timeout_fails_closed(self):
        real_run = self.sub.__call__

        def partial_then_timeout(cmd, *a, **kw):
            if cmd[0] == "gs" and "-dFIXEDMEDIA" in cmd:
                out = next(x.split("=", 1)[1] for x in cmd if x.startswith("-sOutputFile="))
                with open(out, "wb") as fh:
                    fh.write(b"%PDF-1.4 partial")
                raise subprocess.TimeoutExpired(cmd, kw.get("timeout"))
            return real_run(cmd, *a, **kw)

        with mock.patch.object(listener.subprocess, "run", partial_then_timeout):
            self.run_job("jobG", 2, colorMode="color")
        self.assert_failed_without_cups("Color normalization failed")

    # TEST H — successful color normalization continues with the normalized artifact
    def test_H_color_normalization_success_prints_the_normalized_file(self):
        self.run_job("jobH", 2, colorMode="color")
        self.report.assert_not_called()
        self.assertEqual(len(self.sub.lp_calls), 1)
        (submitted, pages), = self.sub.lp_calls[0]
        self.assertTrue(os.path.basename(submitted).endswith("_color_norm.pdf"), submitted)
        self.assertEqual(pages, 2)
        self.wait_for_cups.assert_called_once()

    # SLICING — a page range that cannot be applied must never print the whole document
    def test_S1_slice_pdf_pages_returns_none_when_a_page_cannot_be_extracted(self):
        src = os.path.join(self.tmp, "three.pdf")
        with open(src, "wb") as fh:
            fh.write(make_pdf(3))

        def gs_fails_on_page_two(cmd, *a, **kw):
            if cmd[0] == "gs":
                first = int(next(x for x in cmd if x.startswith("-dFirstPage=")).split("=")[1])
                if first == 2:
                    return subprocess.CompletedProcess(cmd, 1, b"", b"error")
                out = next(x.split("=", 1)[1] for x in cmd if x.startswith("-sOutputFile="))
                with open(out, "wb") as fh:
                    fh.write(make_pdf(1))
                return subprocess.CompletedProcess(cmd, 0, b"", b"")
            return fake_pdfinfo_result(cmd[1])

        with mock.patch.object(listener.subprocess, "run", gs_fails_on_page_two):
            self.assertIsNone(listener.slice_pdf_pages(src, "1-2"))
        self.assert_no_leftover_files()

    def test_S2_job_page_range_that_cannot_be_applied_fails_without_printing_everything(self):
        self.bucket.store["uploads/jobS2.pdf"] = make_pdf(3)
        snap = job("jobS2", [entry("uploads/jobS2.pdf")],
                   printOptions={"copies": 1, "pageSelection": "custom", "pageRange": "1-2", "fileConfigs": {}})
        with mock.patch.object(listener, "slice_pdf_pages", mock.Mock(return_value=None)):
            listener.process_job(snap)
        self.assertEqual(self.report.call_count, 1, self.report.call_args_list)
        self.assertEqual(self.sub.lp_calls, [], "the unsliced 3-page document must not be sent")
        self.assertNotIn("lp", self.sub.tools())

    def test_S3_per_file_page_range_that_cannot_be_applied_fails_closed(self):
        self.bucket.store["uploads/jobS3.pdf"] = make_pdf(3)
        snap = job("jobS3", [entry("uploads/jobS3.pdf")],
                   printOptions={"copies": 1, "fileConfigs": {"jobS3.pdf": {"pageSelection": "custom", "pageRange": "1-2"}}})
        with mock.patch.object(listener, "slice_pdf_pages", mock.Mock(return_value=None)):
            listener.process_job(snap)
        self.assert_failed_without_cups("Could not apply the page range")


if __name__ == "__main__":
    unittest.main()
