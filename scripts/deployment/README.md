# `scripts/deployment/` — older listener deploy scripts (historical)

Ad-hoc Python scripts used to push or patch the Pi listener before [`../pi-ops/`](../pi-ops/README.md) existed. **Not maintained; several embed SSH credentials.** Use `pi-ops` instead.

| File | Purpose |
|---|---|
| `deploy_listener.py` | SSH to a Pi, stop the service, download a listener from a GitHub raw URL **of a different repository**, restart |
| `deploy_duplex_fix_sv002.py` | One-off duplex fix deployment to SV-002 |
| `patch_listener.py`, `patch_preflight.py` | Patch `/home/pi/mimo/firebase_listener.py` in place |
| `manage_pr.py` | Helper that reads Git credentials to manage a pull request |

Requires `paramiko`. No tests. Risk: they modify live machines and `deploy_listener.py` may install code that is not from this repository.
