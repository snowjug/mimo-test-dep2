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

**Which listener runs — unverified.** The repository has two listener variants and both were edited in September 2026: [`pi_scripts/firebase_listener.py`](../../pi_scripts/README.md) (larger; includes the `report-failure` call and colour-sheet accounting) and
[`pi-listener/firebase_listener.py`](../../pi-listener/README.md) (smaller; the MIMO 2.0 paper/printer-error detection and 120 s print deadline). The scripts in `scripts/pi-ops/` push the `pi_scripts` variant to both machines and call it the "master copy", which does **not** prove what is installed today.
Compare the file on each Pi with both variants before deploying.

Reachability: both Pis are reached over Tailscale; SV-002 also has a LAN address that `deploy_all_fixes.py` uses to hop from CV-001.
