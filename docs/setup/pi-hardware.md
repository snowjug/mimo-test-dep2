# Kiosk hardware reference (non-secret)

Extracted from the legacy `backend/private.md` (which also holds passwords and stays out of this file). Addresses and credentials are in the
shared credentials file; `scripts/pi-ops/pi-hosts.example.env` lists the variables.

| | MIMO 1.0 | MIMO 2.0 |
|---|---|---|
| Kiosk ID | `CV-001` | `SV-002` |
| Pi hostname / user | `printpi` / `printpi` | `pi` / `pi` |
| Service | `mimo-listener` (systemd), `KIOSK_ID=CV-001`, `IS_MONOCHROME_ONLY=true` | `mimo-listener` (systemd), `KIOSK_ID=SV-002` |
| B&W printer (CUPS) | `Brother_HL_L5210DN_series` | `Brother_HL_L2440DW_series` |
| Colour printer (CUPS) | none (points at the same Brother queue) | `Epson_L3250` |
| Listener path on the Pi | `/home/printpi/firebase_listener.py` | `/home/pi/mimo/firebase_listener.py` |

**Which listener runs:** `scripts/pi-ops/deploy_all_fixes.py` states that *"the master copy is in `pi_scripts/firebase_listener.py`"* and deploys it to
both Pis, so `pi_scripts/` is the live listener and `pi-listener/` is most likely a stale copy. This comes from the deployment tooling, not from
hashing the files on the devices.

Reachability: both Pis are reached over Tailscale; SV-002 also has a LAN address that `deploy_all_fixes.py` uses to hop from CV-001.
