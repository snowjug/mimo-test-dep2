import copy
import json
import unittest

from guardian.snapshot import (MAX_SNAPSHOT_BYTES, TARGET_BYTES, SnapshotError, encode_snapshot, validate_snapshot)
from tests.helpers import base_scenario, check, make_config, run_cycle, use, K_ALPHA, K_BETA


def many_endpoints(n=6):
    return [{"name": f"endpoint_number_{i:02d}"[:24], "host": f"e{i}.example.test", "port": 443} for i in range(n)]


class SnapshotTest(unittest.TestCase):
    def test_healthy_snapshot_is_valid_versioned_and_small(self):
        snap = run_cycle()
        self.assertEqual(validate_snapshot(snap), [])
        self.assertEqual(snap["schemaVersion"], 1)
        self.assertEqual(snap["diagnosis"]["overall"], "HEALTHY")
        self.assertLess(len(encode_snapshot(snap)), TARGET_BYTES)

    def test_encoding_is_deterministic_json(self):
        snap = run_cycle()
        self.assertEqual(encode_snapshot(snap), encode_snapshot(copy.deepcopy(snap)))
        self.assertEqual(json.loads(encode_snapshot(snap)), snap)

    def test_every_check_carries_the_required_fields(self):
        snap = run_cycle()
        for c in snap["checks"]:
            self.assertEqual(set(c), {"id", "plane", "required", "state", "observedAt", "durationMs", "evidence",
                                      "detail", "streak"})
            self.assertTrue(c["evidence"])
        self.assertTrue(check(snap, "link")["required"])
        self.assertFalse(check(snap, "gateway")["required"])

    def test_worst_case_snapshot_stays_within_hard_limit(self):
        eps = many_endpoints(6)
        scn = base_scenario()
        for e in eps:
            scn["commands"][f"getent ahostsv4 {e['host']}"] = {"status": "TIMEOUT"}
        snap = run_cycle(scn, endpoints=eps)
        self.assertEqual(validate_snapshot(snap), [])
        self.assertLessEqual(len(encode_snapshot(snap)), MAX_SNAPSHOT_BYTES)
        self.assertLessEqual(len(snap["checks"]), 32)

    def test_details_are_dropped_when_over_target_size(self):
        eps = many_endpoints(6)
        scn = base_scenario()
        scn["commands"]["ip -j link show"] = {"stdout": "x" * 50}
        snap = run_cycle(scn, endpoints=eps)
        if not snap["cycle"]["detailsDropped"]:
            self.assertLessEqual(len(encode_snapshot(snap)), TARGET_BYTES)
        else:
            self.assertTrue(all(c["detail"] == "" for c in snap["checks"]))

    def test_no_addresses_or_names_in_snapshot(self):
        text = encode_snapshot(run_cycle())
        for leaked in ("192.168.50", "198.51.100", "aa:bb:cc", "example.test", "kiosk-synthetic", "eth0"):
            self.assertNotIn(leaked, text)

    def test_validation_rejects_tampering(self):
        good = run_cycle()
        mutations = {
            "extra top-level key": lambda s: s.update(extra=1),
            "missing key": lambda s: s.pop("cycle"),
            "wrong version": lambda s: s.update(schemaVersion=2),
            "bad kiosk id": lambda s: s.update(kioskId="kiosk-1"),
            "bad timestamp": lambda s: s.update(observedAt="yesterday"),
            "bad state": lambda s: s["checks"][0].update(state="BROKEN"),
            "bad check id": lambda s: s["checks"][0].update(id="firebase"),
            "extra check key": lambda s: s["checks"][0].update(extra=1),
            "bad evidence": lambda s: s["checks"][0].update(evidence=["lower"]),
            "negative duration": lambda s: s["checks"][0].update(durationMs=-5),
            "ip in detail": lambda s: s["checks"][0].update(detail="gw 192.168.1.1"),
            "bad overall": lambda s: s["diagnosis"].update(overall="GREAT"),
            "unknown root check": lambda s: s["diagnosis"]["rootCauses"].append(
                {"code": "X", "plane": "services", "severity": "CRITICAL", "checks": ["nope"], "evidence": ["A_B"]}),
            "too many checks": lambda s: s.update(checks=s["checks"] * 4),
            "oversize": lambda s: s["checks"][0].update(evidence=["A_" + "B" * 40] * 8) or s.update(
                checks=[dict(s["checks"][0], id=f"endpoint.x{i}") for i in range(30)]),
        }
        for name, mutate in mutations.items():
            with self.subTest(name):
                bad = copy.deepcopy(good)
                mutate(bad)
                self.assertTrue(validate_snapshot(bad), name)
                with self.assertRaises(SnapshotError):
                    encode_snapshot(bad)

    def test_non_dict_is_invalid(self):
        for value in (None, [], "x", 3):
            self.assertTrue(validate_snapshot(value))

    def test_failure_snapshot_carries_diagnosis_with_evidence(self):
        scn = use(use(base_scenario(), K_ALPHA, returncode=2), K_BETA, returncode=2)
        snap = run_cycle(scn)
        root = snap["diagnosis"]["rootCauses"][0]
        self.assertEqual((root["code"], root["plane"], root["severity"]), ("DNS_FAILURE", "connectivity", "CRITICAL"))
        self.assertEqual(root["evidence"], ["DNS_RESOLUTION_FAILED"])
        self.assertEqual(snap["diagnosis"]["overall"], "FAILING")


if __name__ == "__main__":
    unittest.main()
