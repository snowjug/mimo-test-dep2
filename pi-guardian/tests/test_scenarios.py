"""End to end: scenario -> collectors -> classifier -> snapshot, one cycle each."""
import unittest

from tests.helpers import (K_ADDR, K_ALPHA, K_BETA, K_CUPS, K_LINK, K_NEIGH, K_ROUTE, K_TS, K_UNIT, base_scenario,
                           cascaded, check, drop, roots, run_cycle, use)

ALL_KEYS = (K_LINK, K_ADDR, K_ROUTE, K_NEIGH, K_UNIT, K_CUPS, K_TS, K_ALPHA, K_BETA)


class ScenarioTest(unittest.TestCase):
    def test_healthy(self):
        snap = run_cycle()
        self.assertEqual((snap["diagnosis"]["overall"], roots(snap), snap["diagnosis"]["unknown"]), ("HEALTHY", [], []))

    def test_link_failure(self):
        snap = run_cycle(use(base_scenario(), K_LINK, "ip_link_down.json"))
        self.assertEqual(roots(snap), ["LINK_DOWN"])
        self.assertEqual(cascaded(snap)["dns"], "LINK_DOWN")
        self.assertEqual(cascaded(snap)["tls.alpha"], "LINK_DOWN")
        self.assertEqual(check(snap, "endpoint.alpha")["state"], "NOT_RUN")
        self.assertEqual(snap["diagnosis"]["overall"], "FAILING")

    def test_missing_ipv4(self):
        snap = run_cycle(use(base_scenario(), K_ADDR, "ip_addr_none.json"))
        self.assertEqual(roots(snap), ["NO_IPV4"])
        self.assertEqual(check(snap, "route")["evidence"], ["BLOCKED_BY_IPV4"])

    def test_invalid_route(self):
        snap = run_cycle(use(base_scenario(), K_ROUTE, "ip_route_none.json"))
        self.assertEqual(roots(snap), ["INVALID_ROUTE"])
        self.assertEqual(check(snap, "link")["state"], "PASS")

    def test_dns_failure_is_not_reported_as_internet_failure(self):
        snap = run_cycle(use(use(base_scenario(), K_ALPHA, returncode=2), K_BETA, returncode=2))
        self.assertEqual(roots(snap), ["DNS_FAILURE"])
        self.assertNotIn("INTERNET_UNREACHABLE", roots(snap))
        self.assertEqual(cascaded(snap)["endpoint.alpha"], "DNS_FAILURE")

    def test_all_endpoints_unreachable(self):
        scn = base_scenario()
        scn["tcp"] = {"198.51.100.10:443": ["TIMEOUT"], "198.51.100.20:443": ["REFUSED"]}
        snap = run_cycle(scn)
        self.assertEqual(roots(snap), ["INTERNET_UNREACHABLE"])
        self.assertEqual(cascaded(snap)["tailscale"] if check(snap, "tailscale")["state"] == "FAIL" else "n/a", "n/a")

    def test_one_endpoint_unreachable(self):
        scn = base_scenario()
        scn["tcp"]["198.51.100.20:443"] = ["REFUSED"]
        snap = run_cycle(scn)
        self.assertEqual(roots(snap), ["ENDPOINT_UNREACHABLE"])
        self.assertEqual(snap["diagnosis"]["rootCauses"][0]["checks"], ["endpoint.beta"])

    def test_tls_failure(self):
        scn = base_scenario()
        scn["tls"]["198.51.100.10:443"] = "TLS_CERT"
        snap = run_cycle(scn)
        self.assertEqual(roots(snap), ["HTTPS_FAILURE"])
        self.assertEqual(snap["diagnosis"]["rootCauses"][0]["evidence"], ["TLS_CERT_INVALID"])

    def test_listener_unavailable(self):
        for fixture in ("systemctl_failed.txt", "systemctl_inactive.txt", "systemctl_autorestart.txt"):
            with self.subTest(fixture):
                snap = run_cycle(use(base_scenario(), K_UNIT, fixture))
                self.assertEqual(roots(snap), ["LISTENER_FAILURE"])
                self.assertEqual(check(snap, "cups_scheduler")["state"], "PASS")  # services are independent

    def test_cups_unavailable_does_not_blame_the_listener_or_network(self):
        snap = run_cycle(use(base_scenario(), K_CUPS, "lpstat_not_running.txt"))
        self.assertEqual(roots(snap), ["CUPS_FAILURE"])
        self.assertEqual(check(snap, "listener_unit")["state"], "PASS")

    def test_tailscale_failure_with_healthy_internet_is_management_only(self):
        snap = run_cycle(use(base_scenario(), K_TS, "tailscale_stopped.json"))
        self.assertEqual(roots(snap), ["TAILSCALE_FAILURE"])
        self.assertEqual(snap["diagnosis"]["rootCauses"][0]["severity"], "MANAGEMENT")
        self.assertEqual(snap["diagnosis"]["overall"], "DEGRADED")

    def test_multiple_independent_faults(self):
        scn = use(use(use(base_scenario(), K_CUPS, "lpstat_not_running.txt"), K_UNIT, "systemctl_failed.txt"),
                  K_TS, "tailscale_stopped.json")
        scn["disk_free_mb"] = 5
        snap = run_cycle(scn)
        self.assertEqual(sorted(roots(snap)), ["CUPS_FAILURE", "DISK_LOW", "LISTENER_FAILURE", "TAILSCALE_FAILURE"])
        self.assertEqual(snap["diagnosis"]["overall"], "FAILING")

    def test_network_and_service_faults_coexist(self):
        scn = use(use(base_scenario(), K_LINK, "ip_link_down.json"), K_CUPS, "lpstat_not_running.txt")
        snap = run_cycle(scn)
        self.assertEqual(roots(snap), ["LINK_DOWN", "CUPS_FAILURE"])

    def test_every_diagnostic_command_missing_is_unknown_never_fail(self):
        scn = base_scenario()
        for key in ALL_KEYS:
            drop(scn, key)
        snap = run_cycle(scn)
        self.assertEqual(roots(snap), [])
        self.assertFalse([c for c in snap["checks"] if c["state"] == "FAIL"])
        self.assertEqual(snap["diagnosis"]["overall"], "UNKNOWN")
        self.assertEqual(check(snap, "link")["evidence"], ["COMMAND_MISSING"])

    def test_every_command_timing_out_is_unknown_never_fail(self):
        scn = base_scenario()
        for key in ALL_KEYS:
            use(scn, key, status="TIMEOUT")
        snap = run_cycle(scn)
        self.assertEqual(roots(snap), [])
        self.assertFalse([c for c in snap["checks"] if c["state"] == "FAIL"])
        self.assertEqual(snap["diagnosis"]["overall"], "UNKNOWN")

    def test_every_command_denied_is_unknown_never_fail(self):
        scn = base_scenario()
        for key in ALL_KEYS:
            use(scn, key, returncode=1, stderr="Permission denied")
        snap = run_cycle(scn)
        self.assertFalse([c for c in snap["checks"] if c["state"] == "FAIL"])
        self.assertEqual(snap["diagnosis"]["overall"], "UNKNOWN")

    def test_malformed_output_everywhere_is_unknown_never_fail(self):
        scn = base_scenario()
        for key in ALL_KEYS:
            use(scn, key, "garbage.txt")
        snap = run_cycle(scn)
        self.assertFalse([c for c in snap["checks"] if c["state"] == "FAIL"])
        self.assertEqual(snap["diagnosis"]["overall"], "UNKNOWN")

    def test_unknown_probe_does_not_hide_a_real_fault(self):
        scn = use(use(base_scenario(), K_TS, status="TIMEOUT"), K_CUPS, "lpstat_not_running.txt")
        snap = run_cycle(scn)
        self.assertEqual(roots(snap), ["CUPS_FAILURE"])
        self.assertEqual(check(snap, "tailscale")["state"], "UNKNOWN")

    def test_gateway_fail_with_working_internet_does_not_cause_a_false_root_cause(self):
        snap = run_cycle(use(base_scenario(), K_NEIGH, "ip_neigh_failed.json"))
        self.assertEqual(roots(snap), [])
        self.assertEqual(snap["diagnosis"]["overall"], "HEALTHY")
        self.assertEqual(check(snap, "gateway")["evidence"][0], "CONTRADICTED_BY_TRAFFIC")

    def test_optional_checks_disabled_by_config(self):
        snap = run_cycle(drop(drop(base_scenario(), K_TS), K_CUPS), tailscale_enabled=False, check_cups=False)
        self.assertEqual(snap["diagnosis"]["overall"], "HEALTHY")
        self.assertEqual(check(snap, "tailscale")["state"], "NOT_RUN")
        self.assertFalse(check(snap, "cups_scheduler")["required"])


if __name__ == "__main__":
    unittest.main()
