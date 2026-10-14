"""Regression test: process_job() dispatch must go through a single-worker pool, not an unbounded
threading.Thread(...).start() per matching job.

Root cause this guards against: on_snapshot() (and the watchdog's stuck-job fallback) used to spawn a
bare daemon thread per matching print_jobs document, with no serialization between them. If an earlier
job was still mid-flight (slow download, CUPS submission, etc.) when a second, unrelated job arrived,
both could run concurrently -- so a customer whose print appeared to fail and who walked away could have
their job physically land on the tray during the NEXT, unrelated customer's kiosk redemption. Routing
every submission through _print_pool (max_workers=1) forces strict, submission-ordered, one-job-at-a-
time processing. See firebase_listener.py's _print_pool / _run_process_job for the full writeup.

Run:  python -B pi_scripts/tests/test_print_serialization.py -v
"""
import os
import sys
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_listener_inputs import _load_listener, FakeSnapshot, _FakeChange, job  # noqa: E402

listener = _load_listener()


class PrintJobDispatchGoesThroughSingleWorkerPoolTests(unittest.TestCase):
    def setUp(self):
        listener.active_jobs.clear()
        # Skip the reconnect-snapshot branch (which needs doc.reference.update, absent on FakeSnapshot) so
        # a plain 'ADDED' change takes the ordinary new-job path, matching real steady-state behavior.
        listener._seen_first_snapshot = True
        self.addCleanup(listener.active_jobs.clear)

    def test_new_printing_job_is_submitted_to_the_print_pool_not_a_raw_thread(self):
        snap = job("jobP1", files=[])
        fake_pool = mock.Mock(name="print_pool")
        with mock.patch.object(listener, "_print_pool", fake_pool):
            listener.on_snapshot(None, [_FakeChange("ADDED", snap)], None)
        fake_pool.submit.assert_called_once_with(listener._run_process_job, snap)
        self.assertIn("jobP1", listener.active_jobs)

    def test_watchdog_stuck_job_fallback_also_uses_the_print_pool(self):
        # The watchdog's own stuck-job fallback (separate from on_snapshot) used to spawn its own raw
        # thread too -- same bug, same fix, same pool.
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "firebase_listener.py"), encoding="utf-8") as fh:
            src = fh.read()
        self.assertNotIn("threading.Thread(target=process_job", src, "a raw thread spawn for process_job survived the fix")
        self.assertEqual(src.count("_print_pool.submit(_run_process_job, doc)"), 2, "expected both call sites (on_snapshot and the watchdog fallback) to use the pool")

    def test_print_pool_has_exactly_one_worker(self):
        # The entire point of the pool: at most one process_job() runs at a time per kiosk, so a job
        # still mid-flight can never overlap with the next customer's job.
        self.assertEqual(listener._print_pool._max_workers, 1)

    def test_submitted_jobs_actually_run_strictly_one_at_a_time(self):
        overlap = {"count": 0, "max": 0}
        lock = threading.Lock()

        def fake_process_job(doc):
            with lock:
                overlap["count"] += 1
                overlap["max"] = max(overlap["max"], overlap["count"])
            time.sleep(0.05)
            with lock:
                overlap["count"] -= 1

        with mock.patch.object(listener, "process_job", fake_process_job):
            futures = [listener._print_pool.submit(listener._run_process_job, job(f"jobS{i}", files=[])) for i in range(5)]
            for f in futures:
                f.result(timeout=5)

        self.assertEqual(overlap["max"], 1, "more than one process_job() ran concurrently -- serialization is broken")

    def test_an_exception_before_process_jobs_own_try_block_is_logged_not_swallowed(self):
        # process_job() already catches its own exceptions internally, but _run_process_job exists to
        # guard the few lines before that try block (doc parsing, stamp_job). A Future silently drops an
        # exception unless something reads .result() -- this proves the wrapper still surfaces it, instead
        # of a real failure there vanishing unlogged the way pool.submit(process_job, doc) directly would.
        with mock.patch.object(listener, "process_job", side_effect=RuntimeError("boom before try block")):
            with mock.patch("traceback.print_exc") as print_exc:
                future = listener._print_pool.submit(listener._run_process_job, job("jobE1", files=[]))
                future.result(timeout=5)  # _run_process_job must swallow it, not re-raise into the pool
        print_exc.assert_called_once()


if __name__ == "__main__":
    unittest.main()
