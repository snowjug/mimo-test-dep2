
# `pi-guardian/`: MIMO Edge Guardian, Phase 1 (local core)

A read-only observation and diagnosis agent for a kiosk Raspberry Pi. **Phase 1 is local only**: it observes, classifies and
prints a health snapshot to stdout. It does not publish anything, contact Firebase or the MIMO backend, need credentials,
write files, repair, restart or reconfigure anything, and is not installed as a service.

It is independent of the print listener (`pi_scripts/`, `pi-listener/`): no shared code, no shared files, no dependency in either direction.
Design background: [`docs/architecture/MIMO_EDGE_GUARDIAN_ARCHITECTURE_v0.1.md`](../docs/architecture/MIMO_EDGE_GUARDIAN_ARCHITECTURE_v0.1.md).

## Run the tests (no kiosk, no network, no credentials)
```bash
cd pi-guardian
python -m unittest discover -s tests -t .          # stdlib only, no pip install
```
Verified on Python 3.11 (the Pi OS version) and 3.14. Code avoids syntax newer than 3.9, but only 3.11 and 3.14 were run.

## Run it
Offline, using synthetic fixtures (safe anywhere):
```bash
python -m guardian --config tests/fixtures/config_test.json --scenario tests/fixtures/scenarios/healthy.json --once --pretty
```
Against the real machine (read-only local probes, see "What real mode does"):
```bash
python -m guardian --config path/to/your-config.json --once
```
`config/example-config.json` is an example and is never loaded automatically. Options: `--once`, `--cycles N`, `--pretty`.
Ctrl+C / SIGTERM stops after the current cycle (at most `cycle_budget_s`). Exit code 2 means invalid config.

### What real mode does
- Runs only these commands, never through a shell, each with a timeout: `ip -j link|addr|route|neigh show`, `systemctl show -p ... <unit>`,
  `lpstat -r`, `tailscale status --json` (only if enabled), `getent ahostsv4 <host>`. Anything else is rejected before it can start (`guardian/runner.py`).
- Reads `/proc/meminfo`, the CPU thermal file and free disk space.
- Makes TCP connections (and a TLS handshake) to the **hostnames you list in `endpoints`**, and resolves them through the system resolver.
  No request, header or data is sent and nothing is authenticated. This is the only network traffic, and only when you point it at a config.
  Endpoints are required, so Guardian never contacts a host you did not choose.

## Layout
| File | Responsibility |
|---|---|
| `guardian/model.py` | `State` (PASS/FAIL/UNKNOWN/NOT_RUN/STALE), `Observation`, text sanitiser |
| `guardian/config.py` | Strict config validation (unknown keys, types, ranges, cross-checks) |
| `guardian/runner.py` | Read-only command allowlist and bounded subprocess runner |
| `guardian/probes.py` | TCP/TLS connect probes and host-file reader |
| `guardian/collectors.py` | The checks, dependency gating and the cycle time budget |
| `guardian/classifier.py` | Deterministic root-cause / cascade / HEALTHY rules (pure function) |
| `guardian/snapshot.py` | Snapshot builder, validator and size limits |
| `guardian/scheduler.py` | One cycle at a time, `run_forever` loop |
| `guardian/simulation.py` | Offline stand-ins used by tests and `--scenario` |
| `tests/` | Unit and end-to-end tests; `tests/fixtures/` holds synthetic data |

## Checks
| Plane | Check ids | Required for HEALTHY |
|---|---|---|
| connectivity | `link`, `ipv4`, `route`, `dns`, `endpoint.<name>`, `tls.<name>` | yes (`dns` only if an endpoint is a hostname; `tls.*` only for TLS endpoints) |
| connectivity | `gateway` (passive neighbour-table read) | no (informational) |
| services | `listener_unit` (systemd state), `cups_scheduler` | yes (unless disabled in config) |
| management | `tailscale` | only if `tailscale_enabled` |
| resources | `disk`, `memory`, `temperature` | no (a FAIL gives DEGRADED) |

## Semantics
- **FAIL needs valid negative evidence.** A missing command, timeout, permission error, malformed output or an exhausted time budget is
  `UNKNOWN` (or `NOT_RUN` when never attempted), never `FAIL`.
- **Timeouts**: a single TCP timeout is UNKNOWN; `tcp_attempts` consecutive timeouts, a refusal or an unreachable error is FAIL.
- **Persistence**: a FAIL seen for fewer than `min_fail_streak` consecutive cycles is reported as UNKNOWN (`FAIL_NOT_PERSISTENT`).
- **Stale**: PASS/FAIL older than `stale_after_s` becomes `STALE` and counts as neither; timestamps in the future are not trusted.
- **Root cause vs cascade** (connectivity, lowest failed layer wins): `link` > `ipv4` > `route` > `gateway` > `dns` > `endpoint.*` > `tls.*`.
  Layers above the root that failed or did not run are cascades. `link`/`ipv4`/`route` FAIL stops the probes above them (NOT_RUN).
  A gateway/link/route FAIL is dropped to UNKNOWN (`CONTRADICTED_BY_TRAFFIC`) if an endpoint or TLS check passed in the same cycle.
- **Independent planes**: CUPS, the listener unit, Tailscale and resources never cascade from network faults (Tailscale is the one exception: it
  becomes a cascade of a network root cause that would break it). Several root causes can coexist.
- **Diagnosis codes**: `LINK_DOWN`, `NO_IPV4`, `INVALID_ROUTE`, `GATEWAY_UNREACHABLE`, `DNS_FAILURE`, `INTERNET_UNREACHABLE` (two or more endpoints,
  all FAIL), `ENDPOINT_UNREACHABLE`, `HTTPS_FAILURE`, `LISTENER_FAILURE`, `CUPS_FAILURE`, `TAILSCALE_FAILURE`, `DISK_LOW`, `MEMORY_LOW`, `TEMPERATURE_HIGH`.
- **Overall**: `FAILING` (a critical root cause), `DEGRADED` (only management/resource causes), `HEALTHY` (no root cause **and** every required check PASS), else `UNKNOWN`.

## Snapshot
Schema version 1, a JSON object with `schemaVersion, agentVersion, kioskId, seq, observedAt, cycle, checks[], diagnosis`. Validated by
`validate_snapshot`; target 4 KB (details are dropped above that), hard limit 8 KB, at most 32 checks. Evidence is machine-readable codes only. Free text is
sanitised and capped at 120 characters. Addresses, MACs, interface names, hostnames, SSIDs and tokens are not included.

## Configuration
See `guardian/config.py`. All keys are optional except `endpoints`. Defaults are conservative: 60 s cycle, 20 s total budget, 3 s per command and per
connection, 2 TCP attempts, 3 s clip to the remaining budget, `min_fail_streak` 2, Tailscale off. **Unverified assumptions** (no kiosk was inspected):
the listener unit name `mimo-listener.service` (from `scripts/pi-setup/`), auto-detected interfaces (`eth*`, `en*`, `wlan*`, `wl*` when `interfaces` is empty),
and the disk/memory/temperature thresholds (200 MB, 50 MB, 80 C).

## Limits of Phase 1
- Fixtures are hand-written to match the documented format of each tool; they have **not** been checked against output captured from a real kiosk.
- A kiosk with no network cannot publish its own diagnosis. That matters in Phase 2.
- `getent` cannot distinguish "name does not exist" from "resolver unreachable", so exit code 2 is treated as a DNS failure.
- No jitter between cycles, no persistence across restarts (streaks and restart counters are in memory), no history.
