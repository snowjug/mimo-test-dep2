import dataclasses
import random
import unittest

from guardian.classifier import classify
from guardian.collectors import expected_checks
from guardian.model import Observation, State
from tests.helpers import make_config

NOW = 1_800_000_000.0
P, F, U, N, S = State.PASS, State.FAIL, State.UNKNOWN, State.NOT_RUN, State.STALE


def healthy(**cfg):
    expected = expected_checks(make_config(**cfg))
    obs = {}
    for cid in expected:
        if cid in ("disk", "memory", "temperature") or expected[cid]:
            obs[cid] = Observation(cid, P, NOW, 1, ("OK_SYNTHETIC",))
    obs["gateway"] = Observation("gateway", P, NOW, 1, ("NEIGH_REACHABLE",))
    return obs, expected


def diagnose(changes, now=NOW, min_streak=1, **cfg):
    """changes: check id -> State (or Observation). Everything else stays PASS."""
    obs, expected = healthy(**cfg)
    for cid, v in changes.items():
        obs[cid] = v if isinstance(v, Observation) else Observation(cid, v, NOW, 1, ("TEST_EVIDENCE",))
    norm, d = classify(list(obs.values()), expected, now, 180, min_streak)
    return norm, d


def codes(d):
    return [r.code for r in d.root_causes]


def cascades(d):
    return {c.check_id: c.blocked_by for c in d.cascades}


class HealthyTest(unittest.TestCase):
    def test_healthy_when_every_required_check_passes(self):
        _, d = diagnose({})
        self.assertEqual((d.overall, d.root_causes, d.cascades, d.unknown_checks), ("HEALTHY", (), (), ()))

    def test_never_healthy_while_a_required_check_is_unknown_or_unrun_or_stale_or_missing(self):
        for state in (U, N, S):
            with self.subTest(state=state):
                self.assertEqual(diagnose({"cups_scheduler": state})[1].overall, "UNKNOWN")
        obs, expected = healthy()
        del obs["dns"]
        _, d = classify(list(obs.values()), expected, NOW, 180, 1)
        self.assertEqual(d.overall, "UNKNOWN")
        self.assertIn("dns", d.unknown_checks)

    def test_optional_unknowns_do_not_block_healthy(self):
        for cid in ("gateway", "disk", "memory", "temperature"):
            self.assertEqual(diagnose({cid: U})[1].overall, "HEALTHY", cid)

    def test_no_expected_checks_is_never_healthy(self):
        self.assertEqual(classify([], {}, NOW, 180, 1)[1].overall, "UNKNOWN")

    def test_unknown_required_check_is_listed(self):
        self.assertEqual(diagnose({"listener_unit": U})[1].unknown_checks, ("listener_unit",))


class RootCauseTest(unittest.TestCase):
    def test_each_single_root_cause(self):
        # As the collectors produce them: a failed lower layer leaves the end-to-end probes unrun.
        no_traffic = {"dns": N, "endpoint.alpha": N, "endpoint.beta": N, "tls.alpha": N, "tls.beta": N}
        cases = (({"link": F, **no_traffic}, "LINK_DOWN"), ({"ipv4": F, **no_traffic}, "NO_IPV4"),
                 ({"route": F, **no_traffic}, "INVALID_ROUTE"),
                 ({"gateway": F, **no_traffic}, "GATEWAY_UNREACHABLE"), ({"dns": F, "endpoint.alpha": N, "endpoint.beta": N, "tls.alpha": N, "tls.beta": N}, "DNS_FAILURE"),
                 ({"listener_unit": F}, "LISTENER_FAILURE"), ({"cups_scheduler": F}, "CUPS_FAILURE"),
                 ({"tailscale": F}, "TAILSCALE_FAILURE"), ({"tls.alpha": F}, "HTTPS_FAILURE"),
                 ({"endpoint.alpha": F}, "ENDPOINT_UNREACHABLE"),
                 ({"disk": F}, "DISK_LOW"), ({"memory": F}, "MEMORY_LOW"), ({"temperature": F}, "TEMPERATURE_HIGH"))
        for changes, code in cases:
            with self.subTest(code=code):
                _, d = diagnose(changes)
                self.assertEqual(codes(d), [code])
                self.assertTrue(d.root_causes[0].evidence)
                self.assertTrue(d.root_causes[0].checks)

    def test_gateway_fail_is_contradicted_when_traffic_passes(self):
        # endpoint/TLS PASS in the same cycle proves packets crossed the gateway.
        norm, d = diagnose({"gateway": F})
        self.assertEqual(d.overall, "HEALTHY")
        self.assertEqual(norm["gateway"].state, U)
        self.assertIn("CONTRADICTED_BY_TRAFFIC", norm["gateway"].evidence)

    def test_severities_and_overall(self):
        self.assertEqual(diagnose({"cups_scheduler": F})[1].overall, "FAILING")
        self.assertEqual(diagnose({"tailscale": F})[1].overall, "DEGRADED")
        self.assertEqual(diagnose({"disk": F})[1].overall, "DEGRADED")
        self.assertEqual(diagnose({"temperature": F, "cups_scheduler": F})[1].overall, "FAILING")


class CascadeTest(unittest.TestCase):
    def all_down(self, **extra):
        changes = {"endpoint.alpha": N, "endpoint.beta": N, "tls.alpha": N, "tls.beta": N, "dns": N}
        changes.update(extra)
        return changes

    def test_link_down_is_root_and_everything_above_cascades(self):
        _, d = diagnose(self.all_down(link=F, ipv4=N, route=N, gateway=N, tailscale=F))
        self.assertEqual(codes(d), ["LINK_DOWN"])
        self.assertEqual(set(cascades(d)), {"ipv4", "route", "gateway", "dns", "endpoint.alpha", "endpoint.beta",
                                            "tls.alpha", "tls.beta", "tailscale"})
        self.assertTrue(all(v == "LINK_DOWN" for v in cascades(d).values()))
        self.assertEqual(d.unknown_checks, ())

    def test_lower_failure_wins_over_higher_ones(self):
        _, d = diagnose(self.all_down(ipv4=F, route=F, dns=F, gateway=F))
        self.assertEqual(codes(d), ["NO_IPV4"])
        self.assertEqual(cascades(d)["route"], "NO_IPV4")
        self.assertEqual(cascades(d)["dns"], "NO_IPV4")

    def test_dns_failure_does_not_claim_internet_failure(self):
        _, d = diagnose({"dns": F, "endpoint.alpha": N, "endpoint.beta": N, "tls.alpha": N, "tls.beta": N})
        self.assertEqual(codes(d), ["DNS_FAILURE"])
        self.assertEqual(cascades(d)["endpoint.alpha"], "DNS_FAILURE")

    def test_dns_failure_does_not_cascade_tailscale(self):
        _, d = diagnose({"dns": F, "tailscale": F, "endpoint.alpha": N, "endpoint.beta": N,
                         "tls.alpha": N, "tls.beta": N})
        self.assertEqual(sorted(codes(d)), ["DNS_FAILURE", "TAILSCALE_FAILURE"])

    def test_all_endpoints_failing_is_internet_unreachable(self):
        _, d = diagnose({"endpoint.alpha": F, "endpoint.beta": F, "tls.alpha": N, "tls.beta": N, "tailscale": F})
        self.assertEqual(codes(d), ["INTERNET_UNREACHABLE"])
        self.assertEqual(cascades(d)["tailscale"], "INTERNET_UNREACHABLE")
        self.assertEqual(cascades(d)["tls.alpha"], "INTERNET_UNREACHABLE")

    def test_one_endpoint_failing_is_not_the_whole_internet(self):
        _, d = diagnose({"endpoint.alpha": F, "tls.alpha": N, "tailscale": F})
        self.assertEqual(sorted(codes(d)), ["ENDPOINT_UNREACHABLE", "TAILSCALE_FAILURE"])

    def test_single_configured_endpoint_failing_never_claims_internet(self):
        ep = [{"name": "only", "host": "only.example.test"}]
        _, d = diagnose({"endpoint.only": F, "tls.only": N}, endpoints=ep)
        self.assertEqual(codes(d), ["ENDPOINT_UNREACHABLE"])

    def test_tls_failure_needs_a_passing_tcp_check(self):
        _, d = diagnose({"tls.alpha": F, "endpoint.alpha": U})
        self.assertEqual(codes(d), [])
        _, d = diagnose({"tls.alpha": F})
        self.assertEqual(codes(d), ["HTTPS_FAILURE"])

    def test_services_are_not_cascaded_by_network_failure(self):
        _, d = diagnose(dict(self.all_down(link=F, ipv4=N, route=N, gateway=N), cups_scheduler=F, listener_unit=F))
        self.assertEqual(codes(d), ["LINK_DOWN", "CUPS_FAILURE", "LISTENER_FAILURE"])
        self.assertNotIn("cups_scheduler", cascades(d))
        self.assertNotIn("listener_unit", cascades(d))

    def test_multiple_independent_faults(self):
        _, d = diagnose({"dns": F, "endpoint.alpha": N, "endpoint.beta": N, "tls.alpha": N, "tls.beta": N,
                         "cups_scheduler": F, "disk": F, "tailscale": F})
        self.assertEqual(codes(d), ["DNS_FAILURE", "CUPS_FAILURE", "TAILSCALE_FAILURE", "DISK_LOW"])
        self.assertEqual(d.overall, "FAILING")


class UnknownVersusFailTest(unittest.TestCase):
    def test_unknown_never_becomes_a_root_cause(self):
        for cid in ("link", "ipv4", "route", "gateway", "dns", "endpoint.alpha", "tls.alpha", "listener_unit",
                    "cups_scheduler", "tailscale", "disk", "memory", "temperature"):
            with self.subTest(cid=cid):
                _, d = diagnose({cid: U})
                self.assertEqual(d.root_causes, ())
                self.assertNotEqual(d.overall, "FAILING")

    def test_not_run_never_becomes_a_root_cause(self):
        _, d = diagnose({"link": N, "ipv4": N, "route": N, "dns": N})
        self.assertEqual(d.root_causes, ())
        self.assertEqual(d.overall, "UNKNOWN")

    def test_unknown_upstream_with_failing_downstream_does_not_invent_a_cascade(self):
        _, d = diagnose({"link": U, "endpoint.alpha": F, "endpoint.beta": F, "tls.alpha": N, "tls.beta": N})
        self.assertEqual(codes(d), ["INTERNET_UNREACHABLE"])
        self.assertEqual(d.unknown_checks, ("link",))


class StaleAndPersistenceTest(unittest.TestCase):
    def test_old_pass_becomes_stale_and_blocks_healthy(self):
        old = Observation("cups_scheduler", P, NOW - 500, 1, ("CUPS_SCHEDULER_RUNNING",))
        norm, d = diagnose({"cups_scheduler": old})
        self.assertEqual(norm["cups_scheduler"].state, S)
        self.assertEqual(norm["cups_scheduler"].evidence[0], "WAS_PASS")
        self.assertEqual((d.overall, d.unknown_checks), ("UNKNOWN", ("cups_scheduler",)))

    def test_old_fail_is_stale_not_a_current_root_cause(self):
        old = Observation("cups_scheduler", F, NOW - 500, 1, ("CUPS_SCHEDULER_STOPPED",))
        norm, d = diagnose({"cups_scheduler": old})
        self.assertEqual(norm["cups_scheduler"].state, S)
        self.assertEqual(d.root_causes, ())

    def test_future_timestamps_are_not_trusted(self):
        future = Observation("cups_scheduler", P, NOW + 3600, 1, ("CUPS_SCHEDULER_RUNNING",))
        norm, d = diagnose({"cups_scheduler": future})
        self.assertEqual(norm["cups_scheduler"].state, U)
        self.assertEqual(d.overall, "UNKNOWN")

    def test_stale_traffic_pass_does_not_contradict_a_link_failure(self):
        old = Observation("endpoint.alpha", P, NOW - 500, 1, ("TCP_CONNECTED",))
        _, d = diagnose({"link": F, "endpoint.alpha": old, "endpoint.beta": N, "tls.alpha": N, "tls.beta": N})
        self.assertEqual(codes(d), ["LINK_DOWN"])

    def test_fail_must_persist_to_be_a_root_cause(self):
        once = Observation("cups_scheduler", F, NOW, 1, ("CUPS_SCHEDULER_STOPPED",), streak=1)
        norm, d = diagnose({"cups_scheduler": once}, min_streak=2)
        self.assertEqual(norm["cups_scheduler"].state, U)
        self.assertIn("FAIL_NOT_PERSISTENT", norm["cups_scheduler"].evidence)
        self.assertEqual(d.root_causes, ())
        twice = dataclasses.replace(once, streak=2)
        self.assertEqual(codes(diagnose({"cups_scheduler": twice}, min_streak=2)[1]), ["CUPS_FAILURE"])


class DeterminismTest(unittest.TestCase):
    def test_same_result_regardless_of_observation_order(self):
        obs, expected = healthy()
        obs["dns"] = Observation("dns", F, NOW, 1, ("DNS_RESOLUTION_FAILED",))
        obs["cups_scheduler"] = Observation("cups_scheduler", F, NOW, 1, ("CUPS_SCHEDULER_STOPPED",))
        for k in ("endpoint.alpha", "endpoint.beta", "tls.alpha", "tls.beta"):
            obs[k] = Observation(k, N, NOW, 0, ("BLOCKED_BY_DNS",))
        results = set()
        for seed in range(20):
            items = list(obs.values())
            random.Random(seed).shuffle(items)
            _, d = classify(items, expected, NOW, 180, 1)
            results.add(repr(d))
        self.assertEqual(len(results), 1)

    def test_input_observations_are_not_mutated(self):
        obs, expected = healthy()
        before = dict(obs)
        classify(list(obs.values()), expected, NOW + 10_000, 180, 1)
        self.assertEqual(obs, before)


if __name__ == "__main__":
    unittest.main()
