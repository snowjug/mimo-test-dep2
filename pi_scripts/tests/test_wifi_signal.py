"""WiFi signal strength for the admin dashboard's network-health view. Must never raise — a wired kiosk has
no wireless interface at all, and that is a normal case, not an error."""
import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
from test_listener_inputs import _load_listener  # noqa: E402

L = _load_listener()


def run_result(stdout):
    return SimpleNamespace(stdout=stdout, returncode=0)


class WifiQualityPctTest(unittest.TestCase):
    def test_strong_signal_is_100_percent(self):
        self.assertEqual(L.wifi_quality_pct(-30), 100)
        self.assertEqual(L.wifi_quality_pct(-50), 100)

    def test_weak_signal_is_0_percent(self):
        self.assertEqual(L.wifi_quality_pct(-100), 0)
        self.assertEqual(L.wifi_quality_pct(-120), 0)

    def test_midpoint_signal_is_roughly_half(self):
        self.assertEqual(L.wifi_quality_pct(-75), 50)

    def test_none_in_none_out(self):
        self.assertIsNone(L.wifi_quality_pct(None))


class ReadWifiSignalTest(unittest.TestCase):
    def test_parses_signal_from_the_first_interface_with_a_link(self):
        iw_dev = run_result("phy#0\n\tInterface wlan0\n\t\ttype managed")
        iw_link = run_result("Connected to aa:bb:cc:dd:ee:ff (on wlan0)\n\tsignal: -52 dBm\n\ttx bitrate: 144.4 MBit/s")
        with mock.patch.object(L.subprocess, "run", side_effect=[iw_dev, iw_link]):
            dbm, pct = L.read_wifi_signal()
        self.assertEqual(dbm, -52)
        self.assertEqual(pct, 96)

    def test_no_wireless_interface_returns_none_none_not_an_error(self):
        with mock.patch.object(L.subprocess, "run", return_value=run_result("")):
            dbm, pct = L.read_wifi_signal()
        self.assertIsNone(dbm)
        self.assertIsNone(pct)

    def test_iw_not_installed_is_handled_gracefully(self):
        with mock.patch.object(L.subprocess, "run", side_effect=FileNotFoundError("iw not found")):
            dbm, pct = L.read_wifi_signal()
        self.assertIsNone(dbm)
        self.assertIsNone(pct)

    def test_link_query_failure_on_one_interface_does_not_raise(self):
        iw_dev = run_result("Interface wlan0")
        with mock.patch.object(L.subprocess, "run", side_effect=[iw_dev, TimeoutError("hung")]):
            dbm, pct = L.read_wifi_signal()
        self.assertIsNone(dbm)
        self.assertIsNone(pct)


if __name__ == "__main__":
    unittest.main()
