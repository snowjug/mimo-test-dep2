# `scripts/pi-setup/` — Raspberry Pi provisioning files

Reference copies of files installed **on the Pis**; changing them here does not change a machine. They were moved here from the repository root.

| File | Purpose |
|---|---|
| `mimo-listener.service` | Unit for **SV-002**: `WorkingDirectory=/home/pi/mimo`, virtualenv Python, `KIOSK_ID=SV-002`, `BW_PRINTER_NAME=Brother_HL_L2440DW_series` |
| `mimo-listener-1.service` | Old unit for the MIMO 1.0 Pi (`/home/printpi`) with `KIOSK_ID=KIOSK_1` — an invalid machine id; superseded by `-2` |
| `mimo-listener-2.service` | Unit for **CV-001** (`/home/printpi`, `KIOSK_ID=CV-001`), `BW_PRINTER_NAME=Brother_IPP`. Note: `scripts/pi-ops/deploy_all_fixes.py` writes a CV-001 unit with `Brother_HL_L5210DN_series` instead — the live value is **unverified**, check `systemctl cat mimo-listener` on the Pi |
| `pi_setup.sh` | First-time provisioning script (packages, service) — read before running; *not run in the audit* |
| `fallback_wifi.sh` | Wi-Fi fallback helper |
| `enable_unbuffered.sh` | Adds `PYTHONUNBUFFERED=1` to the unit and restarts the service |
| `kill_python.sh` | Kills stray Python processes |

Install a unit (on the Pi): copy to `/etc/systemd/system/`, `sudo systemctl daemon-reload && sudo systemctl enable --now mimo-listener`. Logs: `journalctl -u mimo-listener -f`.
Values to check in a unit: `KIOSK_ID`, `BW_PRINTER_NAME`, `COLOR_PRINTER_NAME`, `IS_MONOCHROME_ONLY`, `WorkingDirectory`/`ExecStart` (paths differ per machine — [`docs/setup/pi-hardware.md`](../../docs/setup/pi-hardware.md)).
Related: [`pi_scripts/README.md`](../../pi_scripts/README.md).
