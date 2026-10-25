import subprocess
import unittest
from unittest import mock

from guardian import runner
from guardian.runner import SubprocessRunner, is_read_only


class ReadOnlyPolicyTest(unittest.TestCase):
    def test_accepts_exact_inspection_commands(self):
        for argv in (["ip", "-j", "link", "show"], ["ip", "-j", "route", "show", "default"],
                     ["systemctl", "show", "-p", "ActiveState", "mimo-listener.service"],
                     ["lpstat", "-r"], ["tailscale", "status", "--json"], ["getent", "ahostsv4", "a.example.test"],
                     ["tail", "-n", "20", "/var/log/cups/error_log"]):
            with self.subTest(argv=argv):
                self.assertTrue(is_read_only(argv))

    def test_rejects_anything_that_could_change_state(self):
        for argv in (["systemctl", "restart", "mimo-listener.service"], ["systemctl", "stop", "cups"],
                     ["systemctl", "show", "-H", "host", "x.service"], ["systemctl", "--user", "show", "x"],
                     ["ip", "addr", "add", "1.2.3.4/24", "dev", "eth0"], ["ip", "-j", "link", "set", "eth0", "down"],
                     ["ip", "-j", "route", "del", "default"], ["tailscale", "up"], ["tailscale", "set", "--exit-node="],
                     ["lpstat", "-p"], ["lp", "-d", "x", "file"], ["cupsenable", "x"], ["nmcli", "con", "up", "x"],
                     ["sudo", "ip", "-j", "link", "show"], ["sh", "-c", "ip -j link show"], ["getent", "passwd"],
                     ["ip", "-j", "link", "show", "eth0;reboot"], [], [""],
                     ["tail", "-f", "/var/log/cups/error_log"], ["tail", "-n", "20", "/var/log/syslog"],
                     ["tail", "-n", "200", "/var/log/cups/error_log"]):
            with self.subTest(argv=argv):
                self.assertFalse(is_read_only(argv))

    def test_non_string_argv_rejected(self):
        self.assertFalse(is_read_only(["ip", 1]))


class SubprocessRunnerTest(unittest.TestCase):
    def test_rejected_command_never_spawns(self):
        with mock.patch.object(subprocess, "run") as run:
            self.assertEqual(SubprocessRunner().run(["systemctl", "restart", "x"], 1).status, runner.REJECTED)
            self.assertEqual(SubprocessRunner().run(["lpstat", "-r"], 0).status, runner.REJECTED)
            run.assert_not_called()

    def test_runs_without_shell_with_timeout_and_no_stdin(self):
        done = subprocess.CompletedProcess(["lpstat", "-r"], 0, b"scheduler is running\n", b"")
        with mock.patch.object(subprocess, "run", return_value=done) as run:
            res = SubprocessRunner().run(["lpstat", "-r"], 2.5)
        kwargs = run.call_args.kwargs
        self.assertIs(kwargs["shell"], False)
        self.assertEqual(kwargs["timeout"], 2.5)
        self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
        self.assertEqual(run.call_args.args[0], ["lpstat", "-r"])
        self.assertEqual((res.status, res.returncode), (runner.OK, 0))
        self.assertIn("running", res.stdout)

    def test_failure_modes_map_to_statuses(self):
        cases = ((subprocess.TimeoutExpired("x", 1), runner.TIMEOUT), (FileNotFoundError(), runner.MISSING),
                 (PermissionError(), runner.PERMISSION), (OSError("boom"), runner.ERROR))
        for exc, expected in cases:
            with self.subTest(exc=type(exc).__name__), mock.patch.object(subprocess, "run", side_effect=exc):
                self.assertEqual(SubprocessRunner().run(["lpstat", "-r"], 1).status, expected)

    def test_output_is_truncated(self):
        big = subprocess.CompletedProcess(["lpstat", "-r"], 0, b"x" * 200000, b"")
        with mock.patch.object(subprocess, "run", return_value=big):
            self.assertEqual(len(SubprocessRunner().run(["lpstat", "-r"], 1).stdout), runner.MAX_OUTPUT_CHARS)

if __name__ == "__main__":
    unittest.main()
