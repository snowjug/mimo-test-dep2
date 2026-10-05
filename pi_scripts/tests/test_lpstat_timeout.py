"""A slow lpstat answer is retried once, so a busy CUPS does not get reported as a printer error (and refunded)."""
import os
import subprocess
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
from test_listener_inputs import _load_listener  # noqa: E402

L = _load_listener()


class LpstatTimeoutTest(unittest.TestCase):
    def test_a_single_slow_answer_is_retried_and_succeeds(self):
        ok = SimpleNamespace(stdout="printer X is idle.", returncode=0)
        with mock.patch.object(L.subprocess, "run", side_effect=[subprocess.TimeoutExpired("lpstat", 8), ok]) as run:
            res = L._lpstat_p("X")
        self.assertIs(res, ok)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args.kwargs["timeout"], L.LPSTAT_TIMEOUT_SEC)

    def test_two_slow_answers_still_raise_so_the_existing_error_path_runs(self):
        with mock.patch.object(L.subprocess, "run", side_effect=subprocess.TimeoutExpired("lpstat", 8)):
            with self.assertRaises(subprocess.TimeoutExpired):
                L._lpstat_p("X")

    def test_timeout_is_longer_than_the_old_three_seconds(self):
        self.assertGreaterEqual(L.LPSTAT_TIMEOUT_SEC, 8)


if __name__ == "__main__":
    unittest.main()
