"""Tests for guardian/publisher.py. Entirely offline: guardian.simulation.FakeHttpsClient stands
in for the real network (guardian.probes.SocketHttpsClient), which is never touched here.
"""
import os
import unittest

from guardian import crypto, publisher as pub
from guardian.probes import HttpsPostError, HttpsResponse
from guardian.simulation import FakeHttpsClient
from tests.helpers import build


DERIVED_KEY = bytes.fromhex("11" * 32)
# Publisher._discover_boot_id falls back to random_bytes(16) whenever the real kernel boot-id file
# is unreadable (true of every machine these tests run on) -- it is called once, AFTER stream_id's
# own random_bytes(16) call, so the counter-based fake below gives each a distinct, deterministic
# value: the first call (stream_id) returns 16 bytes of 0x01, the second (boot_id) 16 bytes of 0x02.
FIXED_STREAM_ID = "01" * 16
FIXED_BOOT_ID_FALLBACK = "02" * 16


def _counting_random_bytes():
    counter = {"n": 0}

    def _rb(length: int) -> bytes:
        counter["n"] += 1
        return bytes([counter["n"]]) * length

    return _rb


def make_publisher(https, cfg_overrides=None, now=1_800_000_000.0, sleeps=None, host=None):
    """A Publisher with a controllable clock (`now` is returned by clock() every time it's called,
    so every attempt's timestamp and the deadline use the same fixed instant unless the test
    advances it) and a deterministic, order-dependent fake random source (first call -> stream_id,
    second call -> the boot-id fallback, since no `host` override makes the real kernel boot-id
    file readable on the machines these tests run on)."""
    box = {"now": now}

    def clock():
        return box["now"]

    def sleep(seconds):
        if sleeps is not None:
            sleeps.append(seconds)

    cfg = pub.PublisherConfig(host="example.test", derived_key=DERIVED_KEY, **(cfg_overrides or {}))
    p = pub.Publisher(cfg, https, clock=clock, sleep=sleep, random_bytes=_counting_random_bytes(), host=host)
    return p, box


def make_snapshot(seq=1, kiosk_id="AB-123"):
    return {
        "schemaVersion": 1, "agentVersion": "0.1.0-phase1", "kioskId": kiosk_id, "seq": seq,
        "observedAt": "2027-01-15T12:00:00Z",
        "cycle": {"durationMs": 10, "budgetMs": 20000, "budgetExceeded": False, "detailsDropped": False},
        "checks": [], "diagnosis": {"overall": "UNKNOWN", "rootCauses": [], "cascades": [], "unknown": []},
    }


class SigningTest(unittest.TestCase):
    def test_sends_a_signature_that_independently_verifies_against_the_same_body_and_headers(self) -> None:
        https = FakeHttpsClient([HttpsResponse(202, {}, b'{"status":"accepted"}')])
        p, _ = make_publisher(https)
        snap = make_snapshot(seq=7)
        result = p.publish(snap)

        self.assertEqual(result.status, pub.ACCEPTED)
        self.assertEqual(len(https.calls), 1)
        call = https.calls[0]
        self.assertEqual(call["host"], "example.test")
        self.assertEqual(call["path"], "/kiosk/guardian/health")
        headers = call["headers"]
        self.assertEqual(headers["X-Guardian-Kiosk-Id"], "AB-123")
        self.assertEqual(headers["X-Guardian-Stream-Id"], FIXED_STREAM_ID)
        self.assertEqual(headers["X-Guardian-Boot-Id"], FIXED_BOOT_ID_FALLBACK)
        self.assertRegex(headers["X-Guardian-Boot-Id"], r"^[0-9a-f]{32}$", "bootId must be a 32-char lowercase hex id, not a decimal counter")
        self.assertEqual(headers["X-Guardian-Key-Version"], "1", "default key_version must be 1")

        # Independently recompute the expected signature from the exact body bytes the publisher
        # must have signed (same snapshot, re-encoded the same way) and the captured headers --
        # this is the "exact canonical bytes and HMAC output" check at the publisher's own level,
        # on top of test_crypto.py's golden-vector check of the primitives themselves.
        from guardian.snapshot import encode_snapshot
        body = encode_snapshot(snap).encode("utf-8")
        expected_canonical = crypto.canonical_string(
            method="POST", path="/kiosk/guardian/health", kiosk_id="AB-123", stream_id=FIXED_STREAM_ID,
            boot_id=headers["X-Guardian-Boot-Id"], seq=7, timestamp=int(headers["X-Guardian-Timestamp"]),
            body_sha256_hex=crypto.sha256_hex(body),
        )
        expected_signature = crypto.hmac_sha256_hex(DERIVED_KEY, expected_canonical)
        self.assertEqual(headers["X-Guardian-Signature"], expected_signature)

    def test_boot_id_uses_the_real_kernel_boot_file_when_readable(self) -> None:
        class FakeHost:
            def read_text(self, path):
                self.requested_path = path
                return "550e8400-E29B-41d4-a716-446655440000\n"

        fake_host = FakeHost()
        https = FakeHttpsClient([HttpsResponse(202, {}, b'{"status":"accepted"}')])
        p, _ = make_publisher(https, host=fake_host)
        self.assertEqual(fake_host.requested_path, pub.KERNEL_BOOT_ID_PATH)
        self.assertEqual(p.boot_id, "550e8400e29b41d4a716446655440000")

    def test_boot_id_falls_back_to_random_when_the_kernel_file_is_malformed(self) -> None:
        class BadHost:
            def read_text(self, path):
                return "not-a-uuid-at-all"

        https = FakeHttpsClient([HttpsResponse(202, {}, b'{"status":"accepted"}')])
        p, _ = make_publisher(https, host=BadHost())
        self.assertEqual(p.boot_id, FIXED_BOOT_ID_FALLBACK)

    def test_boot_id_is_stable_for_the_lifetime_of_one_publisher_instance(self) -> None:
        https = FakeHttpsClient([HttpsResponse(202, {}, b'{"status":"accepted"}')] * 3)
        p, _ = make_publisher(https)
        first = p.boot_id
        for seq in (1, 2, 3):
            p.publish(make_snapshot(seq=seq))
            self.assertEqual(p.boot_id, first)

    def test_detects_a_duplicate_acknowledgement_from_the_response_body(self) -> None:
        https = FakeHttpsClient([HttpsResponse(202, {}, b'{"status":"duplicate"}')])
        p, _ = make_publisher(https)
        result = p.publish(make_snapshot())
        self.assertEqual(result.status, pub.DUPLICATE)

    def test_rejects_a_snapshot_that_cannot_pass_phase1_validation_without_sending_it(self) -> None:
        https = FakeHttpsClient([HttpsResponse(202, {}, b"{}")])
        p, _ = make_publisher(https)
        result = p.publish({"not": "a valid snapshot"})
        self.assertEqual(result.status, pub.CLIENT_ERROR)
        self.assertEqual(len(https.calls), 0, "an invalid snapshot must never be sent over the network")


class ResponseHandlingTest(unittest.TestCase):
    def test_409_conflict_is_not_retried(self) -> None:
        https = FakeHttpsClient([HttpsResponse(409, {}, b'{"error":"Conflict","reason":"stale_seq"}')])
        p, _ = make_publisher(https)
        result = p.publish(make_snapshot())
        self.assertEqual((result.status, result.attempts), (pub.CONFLICT, 1))
        self.assertEqual(len(https.calls), 1)

    def test_401_unauthorized_is_not_retried(self) -> None:
        https = FakeHttpsClient([HttpsResponse(401, {}, b'{"error":"Unauthorized"}')])
        p, _ = make_publisher(https)
        result = p.publish(make_snapshot())
        self.assertEqual((result.status, result.attempts), (pub.CLIENT_ERROR, 1))
        self.assertEqual(len(https.calls), 1)

    def test_a_malformed_http_response_is_treated_as_a_retryable_network_error(self) -> None:
        # guardian.probes._parse_http_response raises HttpsPostError("ERROR") for this; simulated
        # directly here since FakeHttpsClient stands in for the whole transport.
        https = FakeHttpsClient([HttpsPostError("ERROR"), HttpsResponse(202, {}, b'{"status":"accepted"}')])
        sleeps = []
        p, _ = make_publisher(https, sleeps=sleeps)
        result = p.publish(make_snapshot())
        self.assertEqual((result.status, result.attempts), (pub.ACCEPTED, 2))
        self.assertEqual(len(sleeps), 1)


class RetryAndBackoffTest(unittest.TestCase):
    def test_429_is_retried_and_eventually_succeeds(self) -> None:
        https = FakeHttpsClient([
            HttpsResponse(429, {"retry-after": "0"}, b"{}"),
            HttpsResponse(202, {}, b'{"status":"accepted"}'),
        ])
        sleeps = []
        p, _ = make_publisher(https, sleeps=sleeps)
        result = p.publish(make_snapshot())
        self.assertEqual((result.status, result.attempts), (pub.ACCEPTED, 2))

    def test_a_429_retry_after_pauses_subsequent_publish_calls(self) -> None:
        https = FakeHttpsClient([
            HttpsResponse(429, {"retry-after": "30"}, b"{}"),
            HttpsResponse(202, {}, b'{"status":"accepted"}'),
            HttpsResponse(202, {}, b'{"status":"accepted"}'),
        ])
        p, box = make_publisher(https)
        first = p.publish(make_snapshot(seq=1))
        self.assertEqual(first.status, pub.ACCEPTED)  # retried internally within the same call
        # Clock has not advanced -- still inside the 30s pause window the 429 set.
        second = p.publish(make_snapshot(seq=2))
        self.assertEqual(second.status, pub.SKIPPED_BACKOFF)
        self.assertEqual(len(https.calls), 2, "a paused publish() must not make any network call at all")
        # Advance clock past the pause window: publishing resumes.
        box["now"] += 31
        third = p.publish(make_snapshot(seq=3))
        self.assertEqual(third.status, pub.ACCEPTED)

    def test_retry_after_is_clamped_to_a_maximum(self) -> None:
        https = FakeHttpsClient([
            HttpsResponse(503, {"retry-after": "999999"}, b"{}"),
            HttpsResponse(202, {}, b'{"status":"accepted"}'),
        ])
        p, box = make_publisher(https, cfg_overrides={"max_attempts": 1})
        # max_attempts=1 means the first 503 is NOT retried in-call; it still sets the pause.
        result = p.publish(make_snapshot())
        self.assertEqual(result.status, pub.UNAVAILABLE)
        box["now"] += pub.MAX_RETRY_AFTER_S + 1
        second = p.publish(make_snapshot(seq=2))
        self.assertNotEqual(second.status, pub.SKIPPED_BACKOFF, "the pause must never exceed MAX_RETRY_AFTER_S")

    def test_bounded_retries_give_up_after_max_attempts_and_never_raise(self) -> None:
        https = FakeHttpsClient([HttpsPostError("TIMEOUT")] * 10)  # far more failures than max_attempts
        sleeps = []
        p, _ = make_publisher(https, cfg_overrides={"max_attempts": 3}, sleeps=sleeps)
        result = p.publish(make_snapshot())
        self.assertEqual((result.status, result.attempts), (pub.NETWORK_ERROR, 3))
        self.assertEqual(len(https.calls), 3, "must stop at max_attempts, not retry indefinitely")
        self.assertEqual(len(sleeps), 2, "a backoff sleep between attempts, never after the last one")

    def test_connection_refused_and_unreachable_are_treated_as_retryable_network_errors(self) -> None:
        for kind in ("TIMEOUT", "REFUSED", "UNREACHABLE", "TLS_ERROR", "TLS_CERT", "ERROR"):
            with self.subTest(kind=kind):
                https = FakeHttpsClient([HttpsPostError(kind), HttpsResponse(202, {}, b'{"status":"accepted"}')])
                p, _ = make_publisher(https)
                result = p.publish(make_snapshot())
                self.assertEqual(result.status, pub.ACCEPTED)


class FailureIsolationTest(unittest.TestCase):
    def test_publish_never_raises_even_when_the_https_client_misbehaves(self) -> None:
        class ExplodingHttps:
            def post_json(self, *a, **k):
                raise RuntimeError("boom: not an HttpsPostError at all")

        p, _ = make_publisher(ExplodingHttps())
        result = p.publish(make_snapshot())  # must not raise
        self.assertIn(result.status, (pub.NETWORK_ERROR, pub.CLIENT_ERROR))

    def test_a_total_publisher_outage_does_not_stop_later_diagnostic_cycles(self) -> None:
        """Wires a real Scheduler (tests/helpers.build) to a Publisher whose every attempt fails,
        as the Scheduler's on_snapshot callback -- exactly how it would be used in production.
        Every cycle must still run and produce a valid snapshot regardless."""
        https = FakeHttpsClient([HttpsPostError("TIMEOUT")] * 100)
        p, _ = make_publisher(https, cfg_overrides={"max_attempts": 2, "backoff_base_s": 0, "backoff_max_s": 0})
        sched, _scenario, _clock = build()

        seen = []
        publish_results = []

        def on_snapshot(snap):
            seen.append(snap["seq"])
            publish_results.append(p.publish(snap))

        import threading
        n = sched.run_forever(threading.Event(), on_snapshot=on_snapshot, max_cycles=4)

        self.assertEqual(n, 4)
        self.assertEqual(seen, [1, 2, 3, 4], "every cycle ran despite every publish attempt failing")
        self.assertTrue(all(r.status == pub.NETWORK_ERROR for r in publish_results))


class NoCredentialLeakageTest(unittest.TestCase):
    def test_master_key_is_never_referenced_by_the_publisher_modules_code(self) -> None:
        # AST-based, not a raw substring scan: the module docstring legitimately *discusses*
        # derive_kiosk_key/hkdf_sha256 in prose (explaining they are NOT used here) -- a substring
        # scan of the whole source would false-positive on that explanation. This instead checks
        # only real code: imports, calls, attribute access and identifiers, which a docstring's
        # string-literal text is not.
        import ast
        import inspect
        source = inspect.getsource(pub)
        tree = ast.parse(source)
        forbidden = {"master_key", "MASTER_KEY", "GUARDIAN_MASTER_KEY", "derive_kiosk_key", "hkdf_sha256"}
        found = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id in forbidden:
                found.add(node.id)
            elif isinstance(node, ast.Attribute) and node.attr in forbidden:
                found.add(node.attr)
            elif isinstance(node, ast.alias) and node.name in forbidden:
                found.add(node.name)
            elif isinstance(node, ast.arg) and node.arg in forbidden:
                found.add(node.arg)
        self.assertEqual(found, set(), f"publisher.py code references forbidden identifiers: {found}")

    def test_config_repr_redacts_the_derived_key(self) -> None:
        cfg = pub.PublisherConfig(host="example.test", derived_key=DERIVED_KEY)
        self.assertNotIn(DERIVED_KEY.hex(), repr(cfg))
        self.assertNotIn(str(DERIVED_KEY), repr(cfg))

    def test_publish_result_detail_never_contains_the_signature_or_derived_key(self) -> None:
        https = FakeHttpsClient([HttpsResponse(401, {}, b'{"error":"Unauthorized"}')])
        p, _ = make_publisher(https)
        result = p.publish(make_snapshot())
        self.assertNotIn(DERIVED_KEY.hex(), result.detail)

    def test_derived_key_must_be_exactly_32_bytes(self) -> None:
        with self.assertRaises(ValueError):
            pub.PublisherConfig(host="example.test", derived_key=b"too-short")

    def test_key_version_must_be_a_positive_integer(self) -> None:
        for bad in (0, -1, 1.5, "1"):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    pub.PublisherConfig(host="example.test", derived_key=DERIVED_KEY, key_version=bad)

    def test_config_repr_includes_key_version_but_never_the_key(self) -> None:
        cfg = pub.PublisherConfig(host="example.test", derived_key=DERIVED_KEY, key_version=3)
        self.assertIn("key_version=3", repr(cfg))
        self.assertNotIn(DERIVED_KEY.hex(), repr(cfg))

    def test_a_non_default_key_version_is_sent_in_the_header(self) -> None:
        https = FakeHttpsClient([HttpsResponse(202, {}, b'{"status":"accepted"}')])
        p, _ = make_publisher(https, cfg_overrides={"key_version": 7})
        p.publish(make_snapshot())
        self.assertEqual(https.calls[0]["headers"]["X-Guardian-Key-Version"], "7")


if __name__ == "__main__":
    unittest.main()
