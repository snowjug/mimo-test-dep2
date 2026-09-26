# Pi operations tools

SSH tools for the two kiosk Raspberry Pis, migrated from the legacy `backend/` folder. **No host, user or password is stored in code.**

## Setup
```bash
pip install -r scripts/pi-ops/requirements.txt
cp scripts/pi-ops/pi-hosts.example.env scripts/pi-ops/pi-hosts.env   # git-ignored — fill in from the shared credentials file
```
Per Pi (`CV-001` → `PI_CV001_*`, `SV-002` → `PI_SV002_*`): `HOST`, `USER`, and `PASSWORD` **or** `KEY_FILE` (preferred), optional `SUDO_PASSWORD`, `LAN_HOST`.
Unknown SSH host keys only produce a warning; set `PI_ACCEPT_NEW_HOST_KEYS=1` to trust them automatically.

## Everyday operations — `pi_ops.py`
```bash
python scripts/pi-ops/pi_ops.py SV-002 status
python scripts/pi-ops/pi_ops.py CV-001 logs -n 200 -g "error"
python scripts/pi-ops/pi_ops.py SV-002 printers
python scripts/pi-ops/pi_ops.py CV-001 restart          # asks for confirmation (-y skips)
```
Commands: `status logs service restart stop start printers processes files listener tools pull`. This replaces ~20 one-off scripts from `backend/api/*.js`.

## Deploying the listener
These scripts push `pi_scripts/firebase_listener.py` to **both** Pis. ⚠ The repository has a second variant, `pi-listener/` (the recent MIMO 2.0 work), and which one each machine should run is **unverified** — diff the file on the device first (`pi_ops.py <kiosk> listener`).

| Script | What it does |
|---|---|
| `deploy_both.py` | Uploads the listener to SV-002 (base64 over SSH) and CV-001 (SFTP), restarts the services |
| `deploy_all_fixes.py` | Full deploy: listener + systemd unit + CUPS/USB fixes on both Pis (SV-002 is reached via CV-001, needs `PI_SV002_LAN_HOST`) |
| `deploy_pi.py` | Quick SFTP deploy to SV-002 only |
| `update_printpi_service.py` | Fixes the CV-001 systemd unit (printer queue name) |

## Diagnostics and one-time fixes
`check_epson_options.py`, `check_epson_state.py`, `check_usb_processes.py`, `check_printpi_jobs.py`, `check_pi.py`, `diagnose_sv002.py`,
`configure_pi_usb_brother.py`, `test_epson_print.py`, `test_print_options.py`, and `ssh_run.py <CV-001|SV-002> "<command>"` for anything else.
In command strings `@SUDO@` expands to `echo '<password>' | sudo -S` at send time (see `pi_config.py`).

⚠️ Deploy/config scripts change live machines. Read the script first; these were migrated as-is apart from credentials and paths and were **not** run against real Pis.

## Tests
`python3 scripts/pi-ops/tests/test_pi_ops.py` — offline; also fails if a password, IP address or `'printpi'` literal reappears in a script.
