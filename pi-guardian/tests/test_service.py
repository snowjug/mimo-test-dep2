"""Tests for guardian/service.py. Only exercises publisher_from_env's validation and main()'s
config-error path -- never actually starts Scheduler.run_forever (that's an infinite loop by
design; its wiring is covered indirectly by test_static_safety.py's import checks plus
test_scheduler.py/test_publisher.py's own coverage of each half)."""
import json
import os
import tempfile
import unittest

from guardian import service


VALID_ENV = {
    "GUARDIAN_API_HOST": "api.example.test",
    "GUARDIAN_DERIVED_KEY_HEX": "11" * 32,
}


class PublisherFromEnvTest(unittest.TestCase):
    def test_missing_host_raises(self):
        env = dict(VALID_ENV)
        del env["GUARDIAN_API_HOST"]
        with self.assertRaises(SystemExit):
            service.publisher_from_env(env)

    def test_missing_key_raises(self):
        env = dict(VALID_ENV)
        del env["GUARDIAN_DERIVED_KEY_HEX"]
        with self.assertRaises(SystemExit):
            service.publisher_from_env(env)

    def test_malformed_key_raises(self):
        env = dict(VALID_ENV)
        env["GUARDIAN_DERIVED_KEY_HEX"] = "not-hex"
        with self.assertRaises(SystemExit):
            service.publisher_from_env(env)

    def test_short_key_raises(self):
        env = dict(VALID_ENV)
        env["GUARDIAN_DERIVED_KEY_HEX"] = "11" * 16  # 16 bytes, not 32
        with self.assertRaises(SystemExit):
            service.publisher_from_env(env)

    def test_non_integer_key_version_raises(self):
        env = dict(VALID_ENV)
        env["GUARDIAN_KEY_VERSION"] = "not-a-number"
        with self.assertRaises(SystemExit):
            service.publisher_from_env(env)

    def test_valid_env_builds_a_publisher(self):
        publisher = service.publisher_from_env(VALID_ENV)
        self.assertEqual(publisher._cfg.host, "api.example.test")
        self.assertEqual(publisher._cfg.key_version, 1)

    def test_valid_env_with_explicit_key_version(self):
        env = dict(VALID_ENV, GUARDIAN_KEY_VERSION="2")
        publisher = service.publisher_from_env(env)
        self.assertEqual(publisher._cfg.key_version, 2)


class MainConfigErrorTest(unittest.TestCase):
    def test_bad_config_file_returns_2_without_needing_publisher_env(self):
        # Deliberately no GUARDIAN_API_HOST/GUARDIAN_DERIVED_KEY_HEX in the environment: a bad
        # config must fail before main() ever looks at publisher env vars.
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "bad-config.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump({"kiosk_id": "not-a-valid-id"}, fh)
            self.assertEqual(service.main(["--config", path]), 2)

    def test_missing_config_file_returns_2(self):
        self.assertEqual(service.main(["--config", "/nonexistent/path/guardian-config.json"]), 2)


if __name__ == "__main__":
    unittest.main()
