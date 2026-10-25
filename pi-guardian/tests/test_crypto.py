"""Golden-vector tests for guardian/crypto.py, against the exact values in
docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md section 13 (corrected during Phase 2B --
see that document's section 13.1 note). The same vectors are checked on the Node side by
functions/__tests__/guardianCrypto.test.js; if either implementation diverges from the other in any
byte, one of the two test suites fails.
"""
import unittest

from guardian.crypto import (
    HKDF_INFO, canonical_string, derive_kiosk_key, hex_equal_constant_time, hmac_sha256_hex,
    info_for_key_version, sha256_hex,
)

# 32 bytes / 64 hex chars: the 16-byte block "00112233445566778899aabbccddeeff" written twice.
MASTER_KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
KIOSK_ID = "AB-123"
STREAM_ID = "0b7e6b8e9c1a4e3a8f0a1c2d3e4f5061"
EXPECTED_DERIVED_KEY_HEX = "5c09573e78615ab43f49260ab55ab544ca4186229d214f0d7ab3f1eb40ef36db"

VECTOR_A = {
    "boot_id": 1,
    "seq": 1,
    "timestamp": 1800000000,
    "body_utf8": (
        '{"agentVersion":"0.1.0-phase1","checks":[],"cycle":{"budgetExceeded":false,"budgetMs":20000,'
        '"detailsDropped":false,"durationMs":120},"diagnosis":{"cascades":[],"overall":"UNKNOWN",'
        '"rootCauses":[],"unknown":[]},"kioskId":"AB-123","observedAt":"2027-01-15T12:00:00Z",'
        '"schemaVersion":1,"seq":1}'
    ),
    "expected_body_sha256": "257b491532cf760fde83e635557b72cf651003d7d82c6f241d5bbaca1a89cfb9",
    "expected_signature": "62f7e23d91717f29d16d1ff8e432c7ffbcc4fa6a44d8f00dfb46cafe25979630",
}

VECTOR_B = {
    "boot_id": 1,
    "seq": 2,
    "timestamp": 1800000061,
    "body_utf8": (
        '{"agentVersion":"0.1.0-phase1","checks":[{"detail":"","durationMs":12,'
        '"evidence":["LINK_CARRIER_DOWN"],"id":"link","observedAt":"2027-01-15T12:01:00Z",'
        '"plane":"connectivity","required":true,"state":"FAIL","streak":3}],'
        '"cycle":{"budgetExceeded":false,"budgetMs":20000,"detailsDropped":false,"durationMs":340},'
        '"diagnosis":{"cascades":[],"overall":"FAILING","rootCauses":[{"checks":["link"],'
        '"code":"LINK_DOWN","evidence":["LINK_CARRIER_DOWN"],"plane":"connectivity",'
        '"severity":"CRITICAL"}],"unknown":[]},"kioskId":"AB-123","observedAt":"2027-01-15T12:01:00Z",'
        '"schemaVersion":1,"seq":2}'
    ),
    "expected_body_sha256": "8088811b0e4cba1731299c7e8fd7240afcbf45cfa427ac3a166e9dd67489133b",
    "expected_signature": "0e05a2ea3c269d7d511904cdb43fe23b699bd6fba4ecf610dbb964ce11384207",
}


class GoldenVectorTest(unittest.TestCase):
    def test_master_key_fixture_is_genuinely_32_bytes(self) -> None:
        # The exact mistake this guards against: Phase 2A's first draft of this fixture was 31
        # bytes but LOOKED like 32 in the document, because only the derived/output hex lengths
        # (always 32 bytes regardless of input) were verified, not the input key itself.
        self.assertEqual(len(bytes.fromhex(MASTER_KEY_HEX)), 32)

    def test_derives_the_exact_kiosk_key(self) -> None:
        derived = derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID)
        self.assertEqual(len(derived), 32)
        self.assertEqual(derived.hex(), EXPECTED_DERIVED_KEY_HEX)

    def test_vector_a_and_b_reproduce_body_hash_and_signature(self) -> None:
        derived = derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID)
        for vector in (VECTOR_A, VECTOR_B):
            with self.subTest(seq=vector["seq"]):
                body = vector["body_utf8"].encode("utf-8")
                body_sha256_hex = sha256_hex(body)
                self.assertEqual(body_sha256_hex, vector["expected_body_sha256"])
                canonical = canonical_string(
                    method="POST", path="/kiosk/guardian/health", kiosk_id=KIOSK_ID, stream_id=STREAM_ID,
                    boot_id=vector["boot_id"], seq=vector["seq"], timestamp=vector["timestamp"],
                    body_sha256_hex=body_sha256_hex,
                )
                signature = hmac_sha256_hex(derived, canonical)
                self.assertEqual(signature, vector["expected_signature"])
                self.assertTrue(hex_equal_constant_time(signature, vector["expected_signature"]))

    def test_a_single_flipped_byte_changes_the_signature(self) -> None:
        derived = derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID)
        tampered_body = VECTOR_A["body_utf8"].replace('"seq":1', '"seq":9').encode("utf-8")
        body_sha256_hex = sha256_hex(tampered_body)
        self.assertNotEqual(body_sha256_hex, VECTOR_A["expected_body_sha256"])
        canonical = canonical_string(
            method="POST", path="/kiosk/guardian/health", kiosk_id=KIOSK_ID, stream_id=STREAM_ID,
            boot_id=VECTOR_A["boot_id"], seq=VECTOR_A["seq"], timestamp=VECTOR_A["timestamp"],
            body_sha256_hex=body_sha256_hex,
        )
        signature = hmac_sha256_hex(derived, canonical)
        self.assertNotEqual(signature, VECTOR_A["expected_signature"])

    def test_different_kiosk_ids_derive_different_keys(self) -> None:
        a = derive_kiosk_key(MASTER_KEY_HEX, "AB-123")
        b = derive_kiosk_key(MASTER_KEY_HEX, "CD-456")
        self.assertNotEqual(a, b)

    def test_hex_equal_constant_time_never_raises_on_mismatched_lengths(self) -> None:
        self.assertFalse(hex_equal_constant_time("abc", "abcdef"))
        self.assertFalse(hex_equal_constant_time("", "a"))
        self.assertFalse(hex_equal_constant_time(None, "a"))


class KeyVersioningTest(unittest.TestCase):
    """Phase 2F: version 1 must be byte-identical to the pre-versioning derivation (so every golden
    vector above, computed before versioning existed, stays valid untouched); version >= 2 must
    derive a distinct key from the same master key and kiosk id."""

    def test_version_1_info_is_unsuffixed_and_matches_the_default(self) -> None:
        self.assertEqual(info_for_key_version(1), HKDF_INFO)
        self.assertEqual(derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID), derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID, 1))
        self.assertEqual(derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID, 1).hex(), EXPECTED_DERIVED_KEY_HEX)

    def test_version_2_derives_a_different_32_byte_key(self) -> None:
        v1 = derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID, 1)
        v2 = derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID, 2)
        self.assertEqual(len(v2), 32)
        self.assertNotEqual(v1, v2)

    def test_version_is_deterministic(self) -> None:
        a = derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID, 3)
        b = derive_kiosk_key(MASTER_KEY_HEX, KIOSK_ID, 3)
        self.assertEqual(a, b)

    def test_rejects_a_non_positive_or_non_integer_version(self) -> None:
        for bad in (0, -1, 1.5, "1", True):
            with self.subTest(bad=bad):
                with self.assertRaises((ValueError, TypeError)):
                    info_for_key_version(bad)


if __name__ == "__main__":
    unittest.main()
