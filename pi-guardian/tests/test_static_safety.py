"""Source-level guarantees: no network clients, no Firebase, no shells, no file writes, subprocess only in runner."""
import ast
import glob
import os
import sys
import unittest

PKG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "guardian")

STDLIB_ALLOWED = {
    "__future__", "argparse", "copy", "dataclasses", "enum", "errno", "hashlib", "hmac", "ipaddress", "json",
    "math", "os", "re", "shutil", "signal", "socket", "ssl", "subprocess", "sys", "threading", "time", "typing",
}
# hashlib/hmac added for Phase 2C (guardian/crypto.py): HKDF-SHA256 key derivation and HMAC-SHA256 request
# signing, both specified by docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md to use the standard
# library. Both are genuine stdlib; this widens the allowlist, it does not relax any of the checks below
# (no shell, no third-party network/Firebase client, subprocess/sockets still confined to runner.py/probes.py).
FORBIDDEN_NAMES = ("firebase", "firestore", "google", "requests", "urllib", "http", "smtplib", "ftplib", "paramiko",
                   "boto3", "grpc", "flask", "fastapi", "pycups", "cups")


def sources():
    return {os.path.basename(p): open(p, encoding="utf-8").read() for p in glob.glob(os.path.join(PKG, "*.py"))}


def imports(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                yield a.name.split(".")[0]
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            yield (node.module or "").split(".")[0]


class StaticSafetyTest(unittest.TestCase):
    def test_only_standard_library_and_own_package_are_imported(self):
        for name, src in sources().items():
            for mod in imports(ast.parse(src)):
                self.assertTrue(mod in STDLIB_ALLOWED, f"{name} imports {mod}")
                self.assertFalse(any(mod.startswith(f) for f in FORBIDDEN_NAMES), f"{name} imports {mod}")

    def test_no_shell_execution(self):
        for name, src in sources().items():
            for needle in ("shell=True", "os.system", "os.popen", "os.exec", "os.spawn", "pty.", "eval(", "exec("):
                self.assertNotIn(needle, src, f"{name}: {needle}")

    def test_subprocess_only_in_runner_and_sockets_only_in_probes(self):
        for name, src in sources().items():
            mods = set(imports(ast.parse(src)))
            if name != "runner.py":
                self.assertNotIn("subprocess", mods, name)
            if name != "probes.py":
                self.assertFalse(mods & {"socket", "ssl"}, name)

    def test_no_file_is_opened_for_writing(self):
        for name, src in sources().items():
            for node in ast.walk(ast.parse(src)):
                if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "open":
                    mode = node.args[1] if len(node.args) > 1 else next(
                        (k.value for k in node.keywords if k.arg == "mode"), None)
                    if mode is not None:
                        self.assertTrue(isinstance(mode, ast.Constant) and not set("wax+") & set(mode.value),
                                        f"{name} opens a file with a write mode")

    def test_no_kiosk_control_surfaces_are_referenced(self):
        for name, src in sources().items():
            code = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith(("#", '"""')))
            for needle in ("kiosk_commands", "system_status", "print_jobs", "sudo", "cupsenable", "usbreset",
                           "nmcli", "serviceAccountKey", "INTERNAL_WEBHOOK_SECRET"):
                self.assertNotIn(needle, code, f"{name}: {needle}")

    def test_importing_guardian_loads_no_firebase_modules(self):
        import guardian, guardian.__main__  # noqa: F401
        loaded = [m for m in sys.modules if m.split(".")[0] in ("firebase_admin", "google", "requests", "grpc")]
        self.assertEqual(loaded, [])

    def test_executables_are_limited_to_the_read_only_allowlist(self):
        from guardian.runner import _RULES
        self.assertEqual(set(_RULES), {"ip", "systemctl", "lpstat", "tailscale", "getent", "tail"})


if __name__ == "__main__":
    unittest.main()
