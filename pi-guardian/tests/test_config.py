import json
import os
import tempfile
import unittest

from guardian.config import ConfigError, GuardianConfig, load_config, parse_config
from tests.helpers import FIX, raw_config


def errors_of(raw):
    with unittest.TestCase().assertRaises(ConfigError) as cm:
        parse_config(raw)
    return cm.exception.errors


class ConfigTest(unittest.TestCase):
    def test_valid_config_loads_from_file(self):
        cfg = load_config(os.path.join(FIX, "config_test.json"))
        self.assertEqual(cfg.kiosk_id, "ZZ-000")
        self.assertEqual([e.name for e in cfg.endpoints], ["alpha", "beta"])
        self.assertTrue(cfg.endpoints[0].tls)

    def test_defaults_are_conservative(self):
        cfg = parse_config({"endpoints": [{"name": "a", "host": "a.example.test"}]})
        d = GuardianConfig()
        self.assertEqual((cfg.cycle_interval_s, cfg.cycle_budget_s, cfg.command_timeout_s), (60.0, 20.0, 3.0))
        self.assertEqual(cfg.min_fail_streak, 2)
        self.assertFalse(cfg.tailscale_enabled)
        self.assertEqual(d.kiosk_id, "ZZ-000")

    def test_endpoints_are_required(self):
        self.assertTrue(any("endpoints" in e for e in errors_of({})))
        self.assertTrue(any("endpoints" in e for e in errors_of({"endpoints": []})))

    def test_unknown_keys_rejected(self):
        self.assertTrue(any("unknown keys" in e for e in errors_of(raw_config(firebase_project="x"))))

    def test_wrong_types_and_ranges_rejected(self):
        for key, value in (("cycle_interval_s", "60"), ("cycle_interval_s", 1), ("command_timeout_s", 99),
                           ("tcp_attempts", 0), ("tcp_attempts", 2.5), ("check_cups", "yes"),
                           ("tailscale_enabled", 1), ("min_fail_streak", True), ("kiosk_id", "kiosk1"),
                           ("interfaces", "eth0"), ("interfaces", ["Eth 0"]), ("listener_unit", "mimo-listener"),
                           ("disk_path", ""), ("temp_max_c", 5)):
            with self.subTest(key=key, value=value):
                self.assertTrue(errors_of(raw_config(**{key: value})))

    def test_budget_and_stale_cross_checks(self):
        self.assertTrue(any("cycle_budget_s" in e for e in errors_of(raw_config(cycle_interval_s=30, cycle_budget_s=60))))
        self.assertTrue(any("stale_after_s" in e for e in errors_of(raw_config(stale_after_s=20))))

    def test_endpoint_validation(self):
        bad = [{"name": "a", "host": "https://a.example.test"}, {"name": "a", "host": "a.example.test/path"},
               {"name": "a", "host": "a.example.test:443"}, {"name": "A!", "host": "a.example.test"},
               {"name": "a", "host": "a.example.test", "port": 70000}, {"name": "a", "host": "a b"},
               {"name": "a", "host": "x.example.test", "extra": 1}, "a.example.test"]
        for ep in bad:
            with self.subTest(ep=ep):
                self.assertTrue(errors_of(raw_config(endpoints=[ep])))

    def test_duplicate_names_and_too_many_endpoints(self):
        ep = {"name": "a", "host": "a.example.test"}
        self.assertTrue(any("duplicate" in e for e in errors_of(raw_config(endpoints=[ep, ep]))))
        many = [{"name": f"e{i}", "host": f"e{i}.example.test"} for i in range(7)]
        self.assertTrue(any("at most" in e for e in errors_of(raw_config(endpoints=many))))

    def test_ip_literal_endpoint_and_tls_default(self):
        cfg = parse_config(raw_config(endpoints=[{"name": "ip", "host": "198.51.100.9", "port": 8080}]))
        self.assertTrue(cfg.endpoints[0].is_ip_literal)
        self.assertFalse(cfg.endpoints[0].tls)

    def test_all_errors_reported_together(self):
        errs = errors_of({"kiosk_id": "x", "tcp_attempts": 9, "endpoints": []})
        self.assertGreaterEqual(len(errs), 3)

    def test_file_problems_are_config_errors(self):
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "bad.json")
            with open(bad, "w") as fh:
                fh.write("{not json")
            big = os.path.join(d, "big.json")
            with open(big, "w") as fh:
                fh.write(" " * 70000)
            for path in (bad, big, os.path.join(d, "missing.json")):
                with self.assertRaises(ConfigError):
                    load_config(path)
            arr = os.path.join(d, "arr.json")
            with open(arr, "w") as fh:
                json.dump([1], fh)
            with self.assertRaises(ConfigError):
                load_config(arr)


if __name__ == "__main__":
    unittest.main()
