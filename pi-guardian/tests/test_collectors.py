import unittest

from guardian import collectors as C
from guardian.model import State
from guardian.runner import is_read_only
from tests.helpers import (K_ADDR, K_ALPHA, K_BETA, K_CUPS, K_CUPS_LOG, K_LINK, K_NEIGH, K_ROUTE, K_TS, K_UNIT,
                           base_scenario, context, drop, use)

P, F, U, N = State.PASS, State.FAIL, State.UNKNOWN, State.NOT_RUN


def run_one(fn, scn=None, **cfg):
    ctx, scenario, clock = context(scn, **cfg)
    return fn(ctx), ctx, scenario


class LinkIpRouteGatewayTest(unittest.TestCase):
    def test_link_up_passes(self):
        o, ctx, _ = run_one(C.collect_link)
        self.assertEqual((o.state, o.evidence), (P, ("LINK_CARRIER_PRESENT",)))
        self.assertEqual(ctx.scratch["carrier_ifaces"], ["eth0"])

    def test_link_down_is_fail(self):
        o, _, _ = run_one(C.collect_link, use(base_scenario(), K_LINK, "ip_link_down.json"))
        self.assertEqual((o.state, o.evidence), (F, ("LINK_NO_CARRIER",)))

    def test_link_ambiguous_flags_are_unknown_not_fail(self):
        o, _, _ = run_one(C.collect_link, use(base_scenario(), K_LINK, "ip_link_ambiguous.json"))
        self.assertEqual(o.state, U)

    def test_no_matching_interface_is_unknown(self):
        o, _, _ = run_one(C.collect_link, use(base_scenario(), K_LINK, "ip_link_other.json"))
        self.assertEqual((o.state, o.evidence), (U, ("INTERFACE_NOT_FOUND",)))

    def test_auto_detect_ignores_docker_and_loopback(self):
        o, ctx, _ = run_one(C.collect_link, use(base_scenario(), K_LINK, "ip_link_up.json"), interfaces=[])
        self.assertEqual(ctx.scratch["selected_ifaces"], ["eth0", "wlan0"])

    def test_ipv4_present(self):
        ctx, _, _ = context()
        C.collect_link(ctx)
        self.assertEqual(C.collect_ipv4(ctx).state, P)

    def test_missing_ipv4_is_fail(self):
        o, _, _ = run_one(C.collect_ipv4, use(base_scenario(), K_ADDR, "ip_addr_none.json"))
        self.assertEqual((o.state, o.evidence), (F, ("NO_IPV4_ADDRESS",)))

    def test_link_local_only_is_fail_with_specific_evidence(self):
        o, _, _ = run_one(C.collect_ipv4, use(base_scenario(), K_ADDR, "ip_addr_linklocal.json"))
        self.assertEqual((o.state, o.evidence), (F, ("IPV4_LINK_LOCAL_ONLY",)))

    def test_route_present_records_gateway_for_gateway_check(self):
        ctx, _, _ = context()
        for fn in (C.collect_link, C.collect_ipv4, C.collect_route):
            o = fn(ctx)
        self.assertEqual(o.state, P)
        self.assertEqual(C.collect_gateway(ctx).state, P)

    def test_no_default_route_is_invalid_route(self):
        o, _, _ = run_one(C.collect_route, use(base_scenario(), K_ROUTE, "ip_route_none.json"))
        self.assertEqual((o.state, o.evidence), (F, ("NO_DEFAULT_ROUTE",)))

    def test_default_route_via_unmonitored_interface_is_invalid(self):
        ctx, _, _ = context(use(base_scenario(), K_ROUTE, "ip_route_other_dev.json"))
        C.collect_link(ctx)
        C.collect_ipv4(ctx)
        o = C.collect_route(ctx)
        self.assertEqual((o.state, o.evidence), (F, ("DEFAULT_ROUTE_VIA_UNUSABLE_INTERFACE",)))

    def gateway_with(self, fixture):
        scn = use(base_scenario(), K_NEIGH, fixture)
        ctx, _, _ = context(scn)
        for fn in (C.collect_link, C.collect_ipv4, C.collect_route):
            fn(ctx)
        return C.collect_gateway(ctx)

    def test_gateway_neighbour_failed_is_fail(self):
        self.assertEqual(self.gateway_with("ip_neigh_failed.json").state, F)

    def test_gateway_stale_neighbour_is_inconclusive(self):
        o = self.gateway_with("ip_neigh_stale.json")
        self.assertEqual((o.state, o.evidence), (U, ("NEIGH_INCONCLUSIVE",)))

    def test_gateway_without_prior_route_is_unknown(self):
        o, _, _ = run_one(C.collect_gateway)
        self.assertEqual((o.state, o.evidence), (U, ("NO_GATEWAY_ADDRESS",)))


class ToolFailureSemanticsTest(unittest.TestCase):
    """Missing commands, timeouts, permission errors and garbage output are UNKNOWN, never FAIL."""

    CASES = (
        (K_LINK, C.collect_link), (K_ADDR, C.collect_ipv4), (K_ROUTE, C.collect_route),
        (K_UNIT, C.collect_listener_unit), (K_CUPS, C.collect_cups), (K_TS, C.collect_tailscale),
    )

    def test_missing_command(self):
        for key, fn in self.CASES:
            with self.subTest(key=key):
                o, _, _ = run_one(fn, drop(base_scenario(), key))
                self.assertEqual((o.state, o.evidence), (U, ("COMMAND_MISSING",)))

    def test_subprocess_timeout(self):
        for key, fn in self.CASES:
            with self.subTest(key=key):
                o, _, _ = run_one(fn, use(base_scenario(), key, status="TIMEOUT"))
                self.assertEqual((o.state, o.evidence), (U, ("COMMAND_TIMEOUT",)))

    def test_command_slower_than_its_timeout_is_a_timeout(self):
        o, _, _ = run_one(C.collect_cups, use(base_scenario(), K_CUPS, "lpstat_running.txt", elapsed_s=30))
        self.assertEqual((o.state, o.evidence), (U, ("COMMAND_TIMEOUT",)))

    def test_permission_errors(self):
        for key, fn in self.CASES:
            with self.subTest(key=key):
                o, _, _ = run_one(fn, use(base_scenario(), key, returncode=1, stderr="Permission denied"))
                self.assertEqual((o.state, o.evidence), (U, ("PERMISSION_DENIED",)))
                o, _, _ = run_one(fn, use(base_scenario(), key, status="PERMISSION"))
                self.assertEqual(o.state, U)

    def test_nonzero_exit_without_meaning_is_unknown(self):
        o, _, _ = run_one(C.collect_link, use(base_scenario(), K_LINK, returncode=1, stderr="Object not found"))
        self.assertEqual((o.state, o.evidence), (U, ("COMMAND_FAILED",)))

    def test_malformed_output(self):
        for key, fn in self.CASES:
            with self.subTest(key=key):
                o, _, _ = run_one(fn, use(base_scenario(), key, "garbage.txt"))
                self.assertEqual(o.state, U)
                self.assertIn(o.evidence[0], ("MALFORMED_OUTPUT",))

    def test_json_of_the_wrong_shape_is_malformed(self):
        for body in ('{"a": 1}', "[1, 2]", "null", ""):
            with self.subTest(body=body):
                o, _, _ = run_one(C.collect_link, use(base_scenario(), K_LINK, stdout=body))
                self.assertEqual((o.state, o.evidence), (U, ("MALFORMED_OUTPUT",)))

    def test_collector_exception_becomes_unknown(self):
        ctx, _, _ = context()

        def boom(_):
            raise RuntimeError("secret 192.168.1.1")
        o = C._guard(ctx, "link", boom)
        self.assertEqual((o.state, o.evidence, o.detail), (U, ("COLLECTOR_ERROR",), "RuntimeError"))


class DnsEndpointTlsTest(unittest.TestCase):
    def endpoints(self, scn=None, **cfg):
        ctx, scenario, _ = context(scn, **cfg)
        dns = C.collect_dns(ctx)
        return dns, {o.check_id: o for o in C.collect_endpoints(ctx)}, scenario

    def test_all_pass(self):
        dns, eps, _ = self.endpoints()
        self.assertEqual(dns.state, P)
        self.assertEqual({k: v.state for k, v in eps.items()},
                         {"endpoint.alpha": P, "tls.alpha": P, "endpoint.beta": P, "tls.beta": P})

    def test_dns_failure_blocks_endpoints(self):
        scn = base_scenario()
        use(scn, K_ALPHA, returncode=2)
        use(scn, K_BETA, returncode=2)
        dns, eps, scenario = self.endpoints(scn)
        self.assertEqual((dns.state, dns.evidence), (F, ("DNS_RESOLUTION_FAILED",)))
        self.assertTrue(all(o.state == N and o.evidence == ("BLOCKED_BY_DNS",) for o in eps.values()))
        self.assertEqual(scenario.probe.calls, [])

    def test_dns_partial_is_pass_with_marker(self):
        scn = use(base_scenario(), K_BETA, returncode=2)
        dns, eps, _ = self.endpoints(scn)
        self.assertEqual((dns.state, dns.evidence), (P, ("DNS_RESOLVED", "DNS_PARTIAL")))
        self.assertEqual(eps["endpoint.beta"].state, N)
        self.assertEqual(eps["endpoint.alpha"].state, P)

    def test_dns_tool_missing_is_unknown_and_endpoints_not_run(self):
        scn = drop(drop(base_scenario(), K_ALPHA), K_BETA)
        dns, eps, _ = self.endpoints(scn)
        self.assertEqual((dns.state, dns.evidence), (U, ("DNS_INCONCLUSIVE",)))
        self.assertTrue(all(o.state == N and o.evidence == ("ADDRESS_UNRESOLVED",) for o in eps.values()))

    def test_dns_garbage_is_unknown(self):
        scn = use(use(base_scenario(), K_ALPHA, "garbage.txt"), K_BETA, "garbage.txt")
        self.assertEqual(self.endpoints(scn)[0].state, U)

    def test_refused_is_fail(self):
        scn = base_scenario()
        scn["tcp"]["198.51.100.10:443"] = ["REFUSED"]
        _, eps, _ = self.endpoints(scn)
        self.assertEqual((eps["endpoint.alpha"].state, eps["endpoint.alpha"].evidence), (F, ("TCP_REFUSED",)))
        self.assertEqual(eps["tls.alpha"].evidence, ("BLOCKED_BY_ENDPOINT",))

    def test_repeated_timeouts_are_fail_but_a_single_one_is_unknown(self):
        scn = base_scenario()
        scn["tcp"]["198.51.100.10:443"] = ["TIMEOUT"]
        _, eps, _ = self.endpoints(scn)
        self.assertEqual((eps["endpoint.alpha"].state, eps["endpoint.alpha"].evidence), (F, ("TCP_TIMEOUT_REPEATED",)))
        _, eps, _ = self.endpoints(scn, tcp_attempts=1)
        self.assertEqual((eps["endpoint.alpha"].state, eps["endpoint.alpha"].evidence), (U, ("TCP_SINGLE_NEGATIVE",)))

    def test_retry_that_succeeds_is_pass(self):
        scn = base_scenario()
        scn["tcp"]["198.51.100.10:443"] = ["TIMEOUT", "OK"]
        self.assertEqual(self.endpoints(scn)[1]["endpoint.alpha"].state, P)

    def test_probe_error_is_unknown(self):
        scn = base_scenario()
        scn["tcp"]["198.51.100.10:443"] = ["ERROR", "ERROR"]
        self.assertEqual(self.endpoints(scn)[1]["endpoint.alpha"].state, U)

    def test_tls_failures(self):
        for status, state, code in (("TLS_CERT", F, "TLS_CERT_INVALID"), ("TLS_ERROR", F, "TLS_HANDSHAKE_FAILED"),
                                    ("TIMEOUT", U, "TLS_PROBE_INCONCLUSIVE")):
            with self.subTest(status=status):
                scn = base_scenario()
                scn["tls"]["198.51.100.10:443"] = status
                tls = self.endpoints(scn)[1]["tls.alpha"]
                self.assertEqual((tls.state, tls.evidence), (state, (code,)))

    def test_ip_literal_endpoint_needs_no_dns(self):
        scn = base_scenario()
        scn["tcp"]["198.51.100.30:8080"] = ["OK"]
        ctx, _, _ = context(scn, endpoints=[{"name": "lit", "host": "198.51.100.30", "port": 8080}])
        self.assertEqual(C.collect_dns(ctx).evidence, ("DNS_NOT_APPLICABLE",))
        obs = {o.check_id: o for o in C.collect_endpoints(ctx)}
        self.assertEqual(list(obs), ["endpoint.lit"])
        self.assertEqual(obs["endpoint.lit"].state, P)


class ServiceTest(unittest.TestCase):
    def unit(self, fixture, ctx=None):
        scn = use(base_scenario(), K_UNIT, fixture)
        if ctx is None:
            ctx, _, _ = context(scn)
        return C.collect_listener_unit(ctx), ctx

    def test_unit_states(self):
        for fixture, state, code in (("systemctl_active.txt", P, "UNIT_ACTIVE"), ("systemctl_failed.txt", F, "UNIT_FAILED"),
                                     ("systemctl_inactive.txt", F, "UNIT_INACTIVE"),
                                     ("systemctl_autorestart.txt", F, "UNIT_AUTO_RESTART"),
                                     ("systemctl_notfound.txt", U, "UNIT_NOT_FOUND"),
                                     ("systemctl_transitioning.txt", U, "UNIT_TRANSITIONING")):
            with self.subTest(fixture=fixture):
                o, _ = self.unit(fixture)
                self.assertEqual((o.state, o.evidence), (state, (code,)))

    def test_restart_loop_detected_across_cycles_even_while_active(self):
        ctx, _, _ = context()
        self.assertEqual(C.collect_listener_unit(ctx).state, P)  # NRestarts=0 recorded
        ctx.runner.commands[K_UNIT] = {"stdout": "LoadState=loaded\nActiveState=active\nSubState=running\nNRestarts=5\n"}
        o = C.collect_listener_unit(ctx)
        self.assertEqual((o.state, o.evidence), (F, ("UNIT_RESTART_LOOP",)))

    def test_first_observation_with_restarts_is_not_a_loop(self):
        o, _ = self.unit("systemctl_active_restarted.txt")
        self.assertEqual(o.state, P)

    def test_disabled_listener_check_is_not_run(self):
        o, _, _ = run_one(C.collect_listener_unit, listener_unit=None)
        self.assertEqual((o.state, o.evidence), (N, ("CHECK_DISABLED",)))

    def test_cups(self):
        for fixture, state, code in (("lpstat_running.txt", P, "CUPS_SCHEDULER_RUNNING"),
                                     ("lpstat_not_running.txt", F, "CUPS_SCHEDULER_STOPPED")):
            o, _, _ = run_one(C.collect_cups, use(base_scenario(), K_CUPS, fixture))
            self.assertEqual((o.state, o.evidence), (state, (code,)))
        o, _, _ = run_one(C.collect_cups, check_cups=False)
        self.assertEqual((o.state, o.evidence), (N, ("CHECK_DISABLED",)))

    def test_cups_failure_includes_a_sanitised_error_log_excerpt(self):
        """Phase 2 (2.6): on a confirmed CUPS_SCHEDULER_STOPPED, the detail carries a short tail of
        CUPS' own error log -- still sanitised/capped by Observation.__post_init__ like every other
        check's detail, so an IP in the raw log never reaches the snapshot."""
        scn = use(use(base_scenario(), K_CUPS, "lpstat_not_running.txt"), K_CUPS_LOG, "cups_error_log.txt")
        o, _, _ = run_one(C.collect_cups, scn)
        self.assertEqual((o.state, o.evidence), (F, ("CUPS_SCHEDULER_STOPPED",)))
        self.assertIn("Scheduler shutdown abnormally", o.detail)
        self.assertNotIn("192.168.1.50", o.detail)
        self.assertIn("<ip>", o.detail)

    def test_cups_failure_without_a_readable_log_has_no_detail(self):
        """The log tail is bonus context only -- its absence never changes the already-determined
        FAIL, and never blocks on it (e.g. a kiosk where this Guardian user can't read the CUPS log)."""
        o, _, _ = run_one(C.collect_cups, use(base_scenario(), K_CUPS, "lpstat_not_running.txt"))
        self.assertEqual((o.state, o.evidence), (F, ("CUPS_SCHEDULER_STOPPED",)))
        self.assertEqual(o.detail, "")

    def test_tailscale(self):
        for fixture, state in (("tailscale_running.json", P), ("tailscale_stopped.json", F), ("tailscale_starting.json", U)):
            o, _, _ = run_one(C.collect_tailscale, use(base_scenario(), K_TS, fixture))
            self.assertEqual(o.state, state, fixture)
        o, _, _ = run_one(C.collect_tailscale, tailscale_enabled=False)
        self.assertEqual(o.state, N)

    def test_tailscale_observation_carries_no_addresses_or_names(self):
        o, _, _ = run_one(C.collect_tailscale)
        self.assertNotIn("kiosk-synthetic", repr(o))


class ResourceTest(unittest.TestCase):
    def test_pass_and_fail(self):
        o, _, _ = run_one(C.collect_disk)
        self.assertEqual(o.state, P)
        scn = base_scenario()
        scn["disk_free_mb"] = 10
        self.assertEqual(run_one(C.collect_disk, scn)[0].state, F)
        scn = base_scenario()
        scn["files"]["/proc/meminfo"] = "../meminfo_low.txt"
        self.assertEqual(run_one(C.collect_memory, scn)[0].state, F)
        scn = base_scenario()
        scn["files"]["/sys/class/thermal/thermal_zone0/temp"] = "../temp_hot.txt"
        self.assertEqual(run_one(C.collect_temperature, scn)[0].state, F)

    def test_unavailable_sources_are_unknown(self):
        scn = base_scenario()
        scn["files"] = {}
        scn["disk_free_mb"] = None
        for fn in (C.collect_disk, C.collect_memory, C.collect_temperature):
            self.assertEqual(run_one(fn, scn)[0].state, U)

    def test_permission_and_garbage_are_unknown(self):
        scn = base_scenario()
        scn["files"]["/proc/meminfo"] = "!PermissionError"
        o = run_one(C.collect_memory, scn)[0]
        self.assertEqual((o.state, o.evidence), (U, ("PERMISSION_DENIED",)))
        scn = base_scenario()
        scn["files"]["/sys/class/thermal/thermal_zone0/temp"] = "../garbage.txt"
        self.assertEqual(run_one(C.collect_temperature, scn)[0].state, U)


class OrchestrationTest(unittest.TestCase):
    def test_every_command_issued_is_read_only(self):
        ctx, scenario, _ = context()
        C.collect_all(ctx)
        self.assertTrue(scenario.runner.calls)
        for argv in scenario.runner.calls:
            self.assertTrue(is_read_only(argv), argv)

    def test_link_failure_blocks_everything_above_it(self):
        ctx, scenario, _ = context(use(base_scenario(), K_LINK, "ip_link_down.json"))
        obs = {o.check_id: o for o in C.collect_all(ctx)}
        for cid in ("ipv4", "route", "gateway", "dns", "endpoint.alpha", "tls.beta"):
            self.assertEqual((obs[cid].state, obs[cid].evidence), (N, ("BLOCKED_BY_LINK",)), cid)
        self.assertEqual(scenario.probe.calls, [])
        self.assertEqual(obs["cups_scheduler"].state, P)  # independent plane still observed

    def test_gateway_failure_does_not_block_end_to_end_probes(self):
        ctx, scenario, _ = context(use(base_scenario(), K_NEIGH, "ip_neigh_failed.json"))
        obs = {o.check_id: o for o in C.collect_all(ctx)}
        self.assertEqual(obs["gateway"].state, F)
        self.assertEqual(obs["endpoint.alpha"].state, P)

    def test_cycle_budget_exhaustion_yields_not_run_never_fail(self):
        scn = base_scenario()
        use(scn, K_LINK, "ip_link_up.json", elapsed_s=2.9)
        for key in (K_ADDR, K_ROUTE, K_NEIGH, K_UNIT, K_CUPS, K_TS, K_ALPHA, K_BETA):
            scn["commands"][key]["elapsed_s"] = 2.9
        ctx, _, clock = context(scn, cycle_budget_s=5, cycle_interval_s=60)
        obs = C.collect_all(ctx)
        self.assertFalse(any(o.state == F for o in obs))
        self.assertTrue(any("CYCLE_BUDGET_EXHAUSTED" in o.evidence for o in obs))
        self.assertLessEqual(clock.monotonic() - 1_800_000_000.0, 5.0 + 0.001)

    def test_expected_checks(self):
        from tests.helpers import make_config
        exp = C.expected_checks(make_config())
        self.assertTrue(exp["link"] and exp["dns"] and exp["endpoint.alpha"] and exp["tls.beta"] and exp["tailscale"])
        self.assertFalse(exp["gateway"] or exp["disk"])
        exp = C.expected_checks(make_config(tailscale_enabled=False, check_cups=False, listener_unit=None))
        self.assertFalse(exp["tailscale"] or exp["cups_scheduler"] or exp["listener_unit"])


if __name__ == "__main__":
    unittest.main()
