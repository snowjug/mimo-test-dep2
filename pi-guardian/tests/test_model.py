import unittest

from guardian.model import Observation, State, plane_of, sanitize_text, Plane


class ObservationTest(unittest.TestCase):
    def test_valid_observation_and_state_coercion(self):
        o = Observation("link", "PASS", 1.0, 5, ("LINK_CARRIER_PRESENT",), "ok")
        self.assertIs(o.state, State.PASS)
        self.assertEqual(o.streak, 1)

    def test_unknown_check_id_rejected(self):
        with self.assertRaises(ValueError):
            Observation("firebase", State.PASS, 1.0)
        with self.assertRaises(ValueError):
            Observation("endpoint.Bad-Name", State.PASS, 1.0)

    def test_dynamic_ids_accepted_and_connectivity_plane(self):
        self.assertEqual(plane_of("endpoint.alpha"), Plane.CONNECTIVITY)
        self.assertEqual(plane_of("tls.alpha"), Plane.CONNECTIVITY)

    def test_bad_evidence_code_rejected(self):
        for bad in ("lower_case", "HAS SPACE", "X", "A" * 60):
            with self.assertRaises(ValueError):
                Observation("link", State.PASS, 1.0, None, (bad,))

    def test_evidence_deduplicated_and_bounded(self):
        codes = tuple(f"CODE_{i}" for i in range(20)) + ("CODE_1",)
        o = Observation("link", State.PASS, 1.0, None, codes)
        self.assertEqual(len(o.evidence), 8)
        self.assertEqual(len(set(o.evidence)), 8)

    def test_bad_numbers_rejected(self):
        for kwargs in ({"observed_at": float("nan")}, {"duration_ms": -1}, {"streak": 0}, {"observed_at": True}):
            args = {"check_id": "link", "state": State.PASS, "observed_at": 1.0}
            args.update(kwargs)
            with self.assertRaises(ValueError):
                Observation(**args)

    def test_detail_is_sanitised_on_construction(self):
        o = Observation("link", State.UNKNOWN, 1.0, None, (), "gw 192.168.1.1 mac aa:bb:cc:dd:ee:ff psk=hunter2")
        self.assertNotIn("192.168", o.detail)
        self.assertNotIn("hunter2", o.detail)
        self.assertNotIn("aa:bb", o.detail)


class SanitizeTest(unittest.TestCase):
    def test_removes_ipv4_mac_ipv6(self):
        s = sanitize_text("from 10.1.2.3 to fe80::1ff:fe23:4567:890a via aa-bb-cc-dd-ee-ff")
        self.assertEqual(s, "from <ip> to <ip6> via <mac>")

    def test_removes_key_value_secrets_and_tokens(self):
        s = sanitize_text("password: swordfish token=abc123 tskey-auth-kABCDEF12345 " + "A" * 40)
        for leak in ("swordfish", "abc123", "tskey-auth", "A" * 40):
            self.assertNotIn(leak, s)

    def test_removes_tailscale_hostnames(self):
        self.assertNotIn("tail1234", sanitize_text("host kiosk.tail1234.ts.net up"))

    def test_control_characters_and_non_ascii(self):
        s = sanitize_text("a\x00b\x1b[31mé\n\tc")
        self.assertTrue(all(32 <= ord(ch) < 127 for ch in s))

    def test_bounded(self):
        self.assertLessEqual(len(sanitize_text("x " * 1000)), 120)
        self.assertEqual(sanitize_text(None), "")


if __name__ == "__main__":
    unittest.main()
