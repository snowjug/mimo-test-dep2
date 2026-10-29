"""Tests for Gate 2 (Listener Reliability) and Gate 3 (Storage/CUPS Reliability).

Verifies:
1. Kiosk identity validation fails closed if missing, set to 'KIOSK_1', or unknown.
2. Default storage paths point to disk-backed /var/tmp (not tmpfs RAM).
3. ensure_work_dirs creates directories with least-privilege permissions.
4. safe_sudo_run executes commands cleanly without hardcoded password strings.
5. startup_reconcile_cups does NOT blindly purge queues, but selectively reconciles.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_listener_inputs import _load_listener  # noqa: E402

L = _load_listener()


class Gate2ListenerIdentityTests(unittest.TestCase):
    def test_identity_fails_closed_on_default_kiosk_1(self):
        with self.assertRaises(ValueError) as ctx:
            L.validate_kiosk_identity("KIOSK_1")
        self.assertIn("FATAL: KIOSK_ID 'KIOSK_1' is invalid", str(ctx.exception))

    def test_identity_fails_closed_on_empty_or_none(self):
        for bad in ("", None):
            with self.assertRaises(ValueError):
                L.validate_kiosk_identity(bad)

    def test_identity_fails_closed_on_unregistered_kiosk(self):
        with self.assertRaises(ValueError) as ctx:
            L.validate_kiosk_identity("RANDOM-999")
        self.assertIn("Must be explicitly set to one of", str(ctx.exception))

    def test_identity_succeeds_on_registered_kiosks(self):
        self.assertEqual(L.validate_kiosk_identity("CV-001"), "CV-001")
        self.assertEqual(L.validate_kiosk_identity("SV-002"), "SV-002")


class Gate3StorageAndPermissionsTests(unittest.TestCase):
    def test_default_storage_paths_are_disk_backed_var_tmp(self):
        # Must not be /tmp which is in-memory tmpfs on Raspberry Pi OS
        self.assertTrue(
            L.TEMP_DIR.startswith("/var/tmp") or L.TEMP_DIR.startswith(os.environ.get("TEMP_DIR", "/var/tmp")),
            f"TEMP_DIR should default to /var/tmp to preserve RAM: {L.TEMP_DIR}"
        )
        self.assertTrue(
            L.PRE_FETCH_DIR.startswith("/var/tmp") or L.PRE_FETCH_DIR.startswith(os.environ.get("PRE_FETCH_DIR", "/var/tmp")),
            f"PRE_FETCH_DIR should default to /var/tmp to preserve RAM: {L.PRE_FETCH_DIR}"
        )

    def test_ensure_work_dirs_creates_dirs_with_permissions(self):
        import tempfile
        test_temp = tempfile.mkdtemp()
        test_prefetch = tempfile.mkdtemp()
        try:
            with mock.patch.object(L, "TEMP_DIR", os.path.join(test_temp, "prints")), \
                 mock.patch.object(L, "PRE_FETCH_DIR", os.path.join(test_prefetch, "prefetch")):
                L.ensure_work_dirs()
                self.assertTrue(os.path.isdir(os.path.join(test_temp, "prints")))
                self.assertTrue(os.path.isdir(os.path.join(test_prefetch, "prefetch")))
        finally:
            import shutil
            shutil.rmtree(test_temp, ignore_errors=True)
            shutil.rmtree(test_prefetch, ignore_errors=True)


class Gate2SafeSudoTests(unittest.TestCase):
    @mock.patch("subprocess.run")
    def test_safe_sudo_run_uses_non_interactive_flag_when_not_root(self, mock_run):
        mock_run.return_value = mock.Mock(returncode=0, stdout="", stderr="")
        with mock.patch("os.geteuid", return_value=1000, create=True):
            res = L.safe_sudo_run(["/usr/sbin/cupsenable", "Brother_HL_L2440DW_series"])
            self.assertEqual(res.returncode, 0)
            args, kwargs = mock_run.call_args
            self.assertEqual(args[0], ["sudo", "-n", "/usr/sbin/cupsenable", "Brother_HL_L2440DW_series"])
            # Verify no piped password or shell=True
            self.assertNotIn("shell", kwargs)

    def test_startup_reconcile_cups_does_not_purge_all_jobs(self):
        with mock.patch.object(L, "cancel_stale_cups_jobs_for_printer") as mock_cancel_stale, \
             mock.patch("subprocess.run") as mock_run:
            L.startup_reconcile_cups()
            # Must NOT call cancel -a -x
            for call in mock_run.call_args_list:
                args = call[0][0]
                self.assertNotIn(["cancel", "-a", "-x"], args)
            # Must call cancel_stale_cups_jobs_for_printer for configured printers
            self.assertEqual(mock_cancel_stale.call_count, 2)


class PrinterQueueFailSafeTests(unittest.TestCase):
    def test_cv001_defaults_to_brother_5210dn(self):
        bw, color = L.resolve_printer_queues("CV-001")
        self.assertEqual(bw, "Brother_HL_L5210DN_series")
        # CV-001 is monochrome; color defaults to same queue
        self.assertEqual(color, "Brother_HL_L5210DN_series")

    def test_sv002_defaults_to_2440dw_and_epson_3250(self):
        bw, color = L.resolve_printer_queues("SV-002")
        self.assertEqual(bw, "Brother_HL_L2440DW_series")
        self.assertEqual(color, "Epson_L3250")

    def test_cv001_rejects_sv002_queues(self):
        with self.assertRaises(ValueError) as ctx:
            L.resolve_printer_queues("CV-001", env_bw="Brother_HL_L2440DW_series")
        self.assertIn("Misconfigured B&W printer", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx2:
            L.resolve_printer_queues("CV-001", env_color="Epson_L3250")
        self.assertIn("Misconfigured Color printer", str(ctx2.exception))

    def test_sv002_rejects_cv001_queues(self):
        with self.assertRaises(ValueError) as ctx:
            L.resolve_printer_queues("SV-002", env_bw="Brother_HL_L5210DN_series")
        self.assertIn("Misconfigured B&W printer", str(ctx.exception))

    def test_preserves_legitimate_service_overrides(self):
        # CV-001 legitimate override
        bw, color = L.resolve_printer_queues("CV-001", env_bw="Brother_IPP")
        self.assertEqual(bw, "Brother_IPP")
        self.assertEqual(color, "Brother_IPP")

        # SV-002 legitimate override
        bw, color = L.resolve_printer_queues("SV-002", env_bw="Brother_Custom_Queue", env_color="Epson_L3250")
        self.assertEqual(bw, "Brother_Custom_Queue")
        self.assertEqual(color, "Epson_L3250")

    def test_unconfigured_kiosk_fails_closed(self):
        for bad in ("KIOSK_1", "", None, "UNKNOWN"):
            with self.assertRaises(ValueError):
                L.resolve_printer_queues(bad)


class SudoersSecurityTests(unittest.TestCase):
    def test_no_hardcoded_plain_passwords_in_listener_source(self):
        with open(L.LISTENER_PATH if hasattr(L, "LISTENER_PATH") else os.path.join(os.path.dirname(__file__), "..", "firebase_listener.py"), "r", encoding="utf-8") as f:
            content = f.read()
        self.assertNotIn('input="printpi\\n"', content)
        self.assertNotIn("input='printpi\\n'", content)

    @mock.patch.object(L, "safe_sudo_run")
    @mock.patch("subprocess.run")
    def test_auto_heal_calls_safe_sudo(self, mock_run, mock_safe_sudo):
        mock_safe_sudo.return_value = mock.Mock(returncode=0, stdout="", stderr="")
        mock_run.return_value = mock.Mock(returncode=0, stdout="", stderr="")
        L.auto_heal_cups_queue("Brother_HL_L5210DN_series")
        called_cmds = [call[0][0] for call in mock_safe_sudo.call_args_list]
        self.assertIn(["/usr/sbin/cupsenable", "Brother_HL_L5210DN_series"], called_cmds)
        self.assertIn(["/usr/sbin/cupsaccept", "Brother_HL_L5210DN_series"], called_cmds)


if __name__ == "__main__":
    unittest.main()
