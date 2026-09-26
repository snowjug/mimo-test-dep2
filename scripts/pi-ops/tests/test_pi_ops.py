"""Offline tests for the Pi tooling: no network, no paramiko required (a stub is used when it is not installed).

Run:  python3 scripts/pi-ops/tests/test_pi_ops.py
"""
import os
import re
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
sys.path.insert(0, str(PKG))

try:
    import paramiko  # noqa: F401
except ImportError:  # keep the tests runnable everywhere
    stub = types.ModuleType("paramiko")

    class SSHClient:
        def __init__(self):
            self.sent = []
            self.connected_with = None

        def load_system_host_keys(self): pass
        def set_missing_host_key_policy(self, policy): self.policy = policy
        def connect(self, host, **kwargs): self.connected_with = (host, kwargs)
        def exec_command(self, command, *a, **k): self.sent.append(command); return (None, None, None)
        def close(self): pass

    stub.SSHClient = SSHClient
    stub.AutoAddPolicy = type("AutoAddPolicy", (), {})
    stub.WarningPolicy = type("WarningPolicy", (), {})
    sys.modules["paramiko"] = stub

import pi_config as pi  # noqa: E402
import pi_ops  # noqa: E402

ENV = {
    "PI_CV001_HOST": "cv.example", "PI_CV001_USER": "cvuser", "PI_CV001_PASSWORD": "cv pass'word",
    "PI_SV002_HOST": "sv.example", "PI_SV002_USER": "svuser", "PI_SV002_PASSWORD": "svpass",
    "PI_SV002_SUDO_PASSWORD": "svsudo", "PI_SV002_LAN_HOST": "192.0.2.10",
}


def clean_env(**extra):
    base = {k: v for k, v in os.environ.items() if not k.startswith("PI_")}
    base.update(ENV)
    base.update(extra)
    return mock.patch.dict(os.environ, base, clear=True)


class ExpandTests(unittest.TestCase):
    def test_sudo_uses_connected_kiosk_and_quotes_password(self):
        with clean_env(), mock.patch.object(pi, "ENV_FILE", HERE / "missing.env"):
            self.assertEqual(pi.expand("@SUDO@ systemctl stop x", "CV-001"), "echo 'cv pass'\"'\"'word' | sudo -S systemctl stop x")

    def test_explicit_kiosk_and_lan_host(self):
        with clean_env(), mock.patch.object(pi, "ENV_FILE", HERE / "missing.env"):
            out = pi.expand("ssh pi@@LAN:SV-002@ \"@SUDO:SV-002@ ls\"", "CV-001")
            self.assertEqual(out, "ssh pi@192.0.2.10 \"echo svsudo | sudo -S ls\"")

    def test_missing_setting_names_the_variable(self):
        with clean_env(), mock.patch.object(pi, "ENV_FILE", HERE / "missing.env"):
            os.environ.pop("PI_CV001_PASSWORD")
            with self.assertRaises(pi.ConfigError) as ctx:
                pi.expand("@SUDO@ id", "CV-001")
            self.assertIn("PI_CV001_PASSWORD", str(ctx.exception))

    def test_unknown_kiosk_rejected(self):
        with self.assertRaises(pi.ConfigError):
            pi.normalize("XX-999")


class ClientTests(unittest.TestCase):
    def test_connect_uses_password_or_key(self):
        with clean_env(), mock.patch.object(pi, "ENV_FILE", HERE / "missing.env"):
            c = pi.new_client()
            pi.connect(c, "sv-002", timeout=5)
            host, kw = c.connected_with
            self.assertEqual((host, kw["username"], kw["password"], kw["timeout"]), ("sv.example", "svuser", "svpass", 5))
        with clean_env(PI_SV002_KEY_FILE="~/k"), mock.patch.object(pi, "ENV_FILE", HERE / "missing.env"):
            c = pi.new_client()
            pi.connect(c, "SV-002")
            self.assertIn("key_filename", c.connected_with[1])
            self.assertNotIn("password", c.connected_with[1])


class CommandTests(unittest.TestCase):
    def test_logs_with_filter_is_shell_safe(self):
        cmd = pi_ops.build_command("logs", 20, "a; rm -rf /")
        self.assertIn("grep -i 'a; rm -rf /'", cmd)
        self.assertTrue(cmd.endswith("tail -n 20"))

    def test_mutating_commands_use_sudo_placeholder(self):
        for name in ("restart", "stop", "start", "pull"):
            self.assertIn("@SUDO@", pi_ops.build_command(name))

    def test_unknown_command(self):
        with self.assertRaises(ValueError):
            pi_ops.build_command("rm")


class NoHardcodedCredentialsTests(unittest.TestCase):
    """Guards the migration: nothing in scripts/pi-ops may embed a host, IP or password again."""

    def test_no_literals_in_python_files(self):
        bad = []
        for path in PKG.glob("*.py"):
            for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if re.search(r"password\s*=\s*['\"][^'\"]+['\"]", line) and path.name != "pi_config.py":
                    bad.append(f"{path.name}:{n} password literal")
                if re.search(r"echo\s+['\"][^'\"@{<]+['\"]\s*\|\s*sudo", line):
                    bad.append(f"{path.name}:{n} echo password | sudo")
                if re.search(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", line) and "example" not in line and "192.0.2" not in line:
                    bad.append(f"{path.name}:{n} IP address")
                if re.search(r"['\"]printpi['\"]", line):
                    bad.append(f"{path.name}:{n} 'printpi' literal")
        self.assertEqual(bad, [])

    def test_example_env_has_no_values(self):
        for line in (PKG / "pi-hosts.example.env").read_text().splitlines():
            if re.match(r"PI_\w+_(PASSWORD|SUDO_PASSWORD|HOST|LAN_HOST)=.+", line):
                self.fail(f"example env must not contain a value: {line.split('=')[0]}")


if __name__ == "__main__":
    unittest.main()
