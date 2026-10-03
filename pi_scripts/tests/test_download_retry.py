"""download_file retries a transient failure a few times before giving up, and still returns None when it never succeeds."""
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
from test_listener_inputs import _load_listener  # noqa: E402

L = _load_listener()
URL = "https://firebasestorage.googleapis.com/v0/b/x/o/uploads%2Fa%2Fdoc.pdf?alt=media&token=t"


def flaky_blob(failures, payload=b"%PDF-1.4 real bytes " * 40):
    """A bucket whose blob download fails `failures` times, then writes the payload."""
    state = {"calls": 0}

    def download_to_filename(path):
        state["calls"] += 1
        if state["calls"] <= failures:
            raise ConnectionError("connection reset")
        with open(path, "wb") as f:
            f.write(payload)

    bucket = mock.Mock()
    bucket.name = "x"
    bucket.blob.return_value = mock.Mock(download_to_filename=download_to_filename)
    return bucket, state


class DownloadRetryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def run_download(self, bucket):
        with mock.patch.object(L, "bucket", bucket), mock.patch("time.sleep") as sleep:
            path = L.download_file(URL, "doc.pdf", dest_dir=self.tmp)
        return path, sleep

    def test_a_single_blip_is_retried_and_the_file_is_returned(self):
        bucket, state = flaky_blob(failures=1)
        path, sleep = self.run_download(bucket)
        self.assertIsNotNone(path)
        self.assertEqual(state["calls"], 2)
        self.assertEqual(sleep.call_count, 1)
        self.assertGreater(os.path.getsize(path), 0)

    def test_two_blips_then_success_still_returns_the_file(self):
        bucket, state = flaky_blob(failures=2)
        path, _ = self.run_download(bucket)
        self.assertIsNotNone(path)
        self.assertEqual(state["calls"], L.DOWNLOAD_ATTEMPTS)

    def test_a_permanent_failure_is_tried_the_bounded_number_of_times_then_returns_none(self):
        bucket, state = flaky_blob(failures=99)
        path, sleep = self.run_download(bucket)
        self.assertIsNone(path)
        self.assertEqual(state["calls"], L.DOWNLOAD_ATTEMPTS)
        self.assertEqual(sleep.call_count, L.DOWNLOAD_ATTEMPTS - 1)
        self.assertEqual(os.listdir(self.tmp), [], "the partial temp file is removed")

    def test_no_wait_when_the_first_attempt_works(self):
        bucket, _ = flaky_blob(failures=0)
        path, sleep = self.run_download(bucket)
        self.assertIsNotNone(path)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
