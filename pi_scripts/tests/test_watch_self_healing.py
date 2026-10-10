"""Tests for the self-healing Firestore job watch in pi_scripts/firebase_listener.py.

The watch's underlying gRPC stream can go silent (no error, no further callbacks) on a flaky
connection without the SDK reconnecting on its own. _ensure_job_watch_alive() is the periodic
(from heartbeat_loop) check that detects this via staleness of the last-seen snapshot timestamp
and proactively unsubscribes/reattaches. Offline only; Firebase/Firestore are stubbed.

Run:  python -B pi_scripts/tests/test_watch_self_healing.py -v
"""
import os
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_listener_inputs import _load_listener  # noqa: E402  (shared offline loader with Firebase stubs)

L = _load_listener()


class EnsureJobWatchAliveTests(unittest.TestCase):
    def setUp(self):
        L._last_snapshot_at = time.time()
        L.query_watch = mock.Mock(name="old_watch")

    def test_does_nothing_when_recent(self):
        with mock.patch.object(L, "_attach_job_watch") as attach:
            L._ensure_job_watch_alive()
        attach.assert_not_called()
        L.query_watch.unsubscribe.assert_not_called()

    def test_reattaches_when_stale(self):
        old_watch = L.query_watch
        L._last_snapshot_at -= (L.LISTENER_STALE_THRESHOLD_SECONDS + 1)
        fresh_watch = mock.Mock(name="fresh_watch")
        with mock.patch.object(L, "_attach_job_watch", return_value=fresh_watch) as attach:
            L._ensure_job_watch_alive()
        old_watch.unsubscribe.assert_called_once()
        attach.assert_called_once()
        self.assertIs(L.query_watch, fresh_watch)
        self.assertLess(time.time() - L._last_snapshot_at, 5)

    def test_not_yet_stale_is_left_alone(self):
        L._last_snapshot_at -= (L.LISTENER_STALE_THRESHOLD_SECONDS - 5)
        with mock.patch.object(L, "_attach_job_watch") as attach:
            L._ensure_job_watch_alive()
        attach.assert_not_called()

    def test_unsubscribe_failure_does_not_block_reattach(self):
        L.query_watch.unsubscribe.side_effect = Exception("boom")
        L._last_snapshot_at -= (L.LISTENER_STALE_THRESHOLD_SECONDS + 1)
        fresh_watch = mock.Mock(name="fresh_watch")
        with mock.patch.object(L, "_attach_job_watch", return_value=fresh_watch):
            L._ensure_job_watch_alive()  # must not raise
        self.assertIs(L.query_watch, fresh_watch)

    def test_reattach_failure_leaves_it_stale_for_the_next_retry(self):
        L._last_snapshot_at -= (L.LISTENER_STALE_THRESHOLD_SECONDS + 1)
        stale_before = L._last_snapshot_at
        with mock.patch.object(L, "_attach_job_watch", side_effect=Exception("Firestore unreachable")):
            L._ensure_job_watch_alive()  # must not raise
        self.assertEqual(L._last_snapshot_at, stale_before, "a failed reattach must not be marked healthy")

    def test_concurrent_callers_only_reattach_once(self):
        L._last_snapshot_at -= (L.LISTENER_STALE_THRESHOLD_SECONDS + 1)
        fresh_watch = mock.Mock(name="fresh_watch")
        with mock.patch.object(L, "_attach_job_watch", return_value=fresh_watch) as attach:
            L._ensure_job_watch_alive()
            L._ensure_job_watch_alive()  # second call sees it's already fresh now
        attach.assert_called_once()


class OnSnapshotUpdatesLastSeenTests(unittest.TestCase):
    def test_on_snapshot_bumps_last_snapshot_at_even_with_no_changes(self):
        L._last_snapshot_at = 0.0
        L.on_snapshot(None, [], None)
        self.assertGreater(L._last_snapshot_at, 0.0)


if __name__ == "__main__":
    unittest.main()
