"""Shared test plumbing. Everything runs on synthetic fixtures with a fake clock; nothing touches a real system."""
import copy
import json
import os

from guardian.collectors import CollectContext, expected_checks
from guardian.config import parse_config
from guardian.scheduler import Scheduler
from guardian.simulation import FakeClock, Scenario

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
SCEN_DIR = os.path.join(FIX, "scenarios")

K_LINK = "ip -j link show"
K_ADDR = "ip -j addr show"
K_ROUTE = "ip -j route show default"
K_NEIGH = "ip -j neigh show"
K_UNIT = "systemctl show -p LoadState -p ActiveState -p SubState -p NRestarts mimo-listener.service"
K_CUPS = "lpstat -r"
K_CUPS_LOG = "tail -n 20 /var/log/cups/error_log"
K_TS = "tailscale status --json"
K_ALPHA = "getent ahostsv4 alpha.example.test"
K_BETA = "getent ahostsv4 beta.example.test"


def raw_config(**overrides):
    with open(os.path.join(FIX, "config_test.json"), encoding="utf-8") as fh:
        raw = json.load(fh)
    raw.update(overrides)
    return raw


def make_config(**overrides):
    return parse_config(raw_config(**overrides))


def base_scenario():
    with open(os.path.join(SCEN_DIR, "healthy.json"), encoding="utf-8") as fh:
        return json.load(fh)


def use(scn, key, fixture=None, **spec):
    """Point a command at a fixture file (or a raw spec) in a scenario dict."""
    scn = scn
    if fixture is not None:
        spec["stdout_file"] = "../" + fixture
    scn["commands"][key] = spec
    return scn


def drop(scn, key):
    scn["commands"].pop(key, None)
    return scn


def build(scn=None, clock=None, **cfg_overrides):
    clock = clock or FakeClock()
    scenario = Scenario.from_dict(scn or base_scenario(), SCEN_DIR, clock)
    cfg = make_config(**cfg_overrides)
    sched = Scheduler(cfg, scenario.runner, scenario.probe, scenario.host, clock.time, clock.monotonic)
    return sched, scenario, clock


def run_cycle(scn=None, **cfg_overrides):
    sched, scenario, clock = build(scn, **cfg_overrides)
    return sched.run_cycle()


def context(scn=None, clock=None, **cfg_overrides):
    clock = clock or FakeClock()
    scenario = Scenario.from_dict(scn or base_scenario(), SCEN_DIR, clock)
    cfg = make_config(**cfg_overrides)
    ctx = CollectContext(cfg, scenario.runner, scenario.probe, scenario.host, clock.time, clock.monotonic,
                         clock.monotonic() + cfg.cycle_budget_s)
    return ctx, scenario, clock


def check(snap, check_id):
    return next(c for c in snap["checks"] if c["id"] == check_id)


def roots(snap):
    return [r["code"] for r in snap["diagnosis"]["rootCauses"]]


def cascaded(snap):
    return {c["check"]: c["blockedBy"] for c in snap["diagnosis"]["cascades"]}
