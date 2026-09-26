# `scripts/` — tooling (never deployed)

One-off and operational scripts, grouped by purpose. **Nothing here runs in production automatically.** Many were written for Windows machines and contain example paths; the older groups also contain embedded SSH credentials and addresses of the Pis — do not copy them, and prefer [`pi-ops/`](pi-ops/README.md), which reads everything from environment variables.

| Folder | What | Notes |
|---|---|---|
| [`pi-ops/`](pi-ops/README.md) | SSH tools for the two Pis (status, logs, deploy the listener, fixes), with tests | **Use this one.** Credentials from environment only |
| [`pi-setup/`](pi-setup/README.md) | systemd units and Pi provisioning scripts | Reference copies of what is installed on the Pis |
| [`deployment/`](deployment/README.md) | Older listener deploy/patch scripts | Historical; contain credentials |
| [`diagnostics/`](diagnostics/README.md) | Inspect Firestore jobs, journals and e-mail delivery | Historical; several contain credentials |
| [`testing/`](testing/README.md) | Test fixtures and manual verification scripts | Manual, not part of CI |

Tests: only `pi-ops/tests/test_pi_ops.py` (`python3 scripts/pi-ops/tests/test_pi_ops.py`). CI compiles `scripts/pi-ops` and runs that test when it changes.
Related: [`docs/deployment/REMAINING_SETUP.md`](../docs/deployment/REMAINING_SETUP.md).
