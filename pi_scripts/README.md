# `pi_scripts/` — Raspberry Pi print listener (larger variant)

**Responsibility:** the Python program that runs on a kiosk's Raspberry Pi. It watches Firestore for jobs assigned to its kiosk, downloads the files, prints them through CUPS, reports progress and sends a heartbeat.
There are **two listener variants** in this repository — this one and [`pi-listener/`](../pi-listener/README.md). Both were edited in September 2026. **Which file runs on which Pi is unverified**; the deployment scripts in [`scripts/pi-ops/`](../scripts/pi-ops/README.md) push *this* variant to both machines. Diff before deploying.

## Contents
| File | Purpose |
|---|---|
| `firebase_listener.py` (≈1 650 lines) | The listener: `on_snapshot` on `print_jobs` (status `printing` for `KIOSK_ID`), `process_job`, `print_file` (CUPS options: colour/B&W, duplex, copies, N-up, page ranges), image handling (Pillow, optional HEIC), a prefetch watcher, `heartbeat_loop` → `system_status/<KIOSK_ID>`, and a call to `POST /kiosk/report-failure` when a print fails |
| `check_jobs.py` | Small Firestore job inspection helper (expects `serviceAccountKey.json` at a fixed Pi path) |
| `clean_epson.py` | Epson auto-clean routine for the Pi (logs to `/home/pi/mimo/clean_epson.log`) |
| `inject_live_job.py` | Writes a test print job (sample images fetched from a raw GitHub URL of another repository) into Firestore for a kiosk given on the command line — **touches whatever database its key points at**; use only with a test kiosk |

## How it talks to other modules
* **Firestore** (via a service-account key file `serviceAccountKey.json`): reads/updates `print_jobs`, writes `system_status/<KIOSK_ID>` and uses the `hardware` collection for printer supply state.
* **Cloud Storage**: downloads job files through the signed URLs stored on the job.
* **API**: `POST /kiosk/report-failure` (with `INTERNAL_WEBHOOK_SECRET`) and a periodic `GET /` ping. The API turns `failed` into a refund (`autoRefundJob`).
* **CUPS** (`lp`, `lpstat`, `pycups` when installed) for printing.

## Environment variables (set in the systemd unit — see [`scripts/pi-setup/`](../scripts/pi-setup/README.md))
| Variable | Meaning |
|---|---|
| `KIOSK_ID` | `CV-001` or `SV-002` (code default `KIOSK_1` is not a valid machine) |
| `BW_PRINTER_NAME`, `COLOR_PRINTER_NAME` | CUPS queue names (see [`docs/setup/pi-hardware.md`](../docs/setup/pi-hardware.md)) |
| `IS_MONOCHROME_ONLY` | `true` on the B&W-only machine |
| `BACKEND_URL`, `INTERNAL_WEBHOOK_SECRET` | API base URL and the shared secret for `report-failure` (defaults exist in code; set explicitly) |
| `SIMULATE_DEV` | Development switch |

Python packages: `firebase-admin`, `requests`, `Pillow`, optionally `pycups` and `pillow-heif`. System packages: CUPS, printer drivers, LibreOffice/qpdf/pdftk as used by the script. There is no `requirements.txt` — *unverified* list from the imports.

## Running and testing
On a Pi with the key file in the working directory: `python3 firebase_listener.py` (normally as the `mimo-listener` systemd service). There are **no automated tests**; test on a spare printer and watch `journalctl -u mimo-listener -f`. `python3 -m py_compile firebase_listener.py` is run in CI (syntax only).

## Common problems
| Symptom | Cause |
|---|---|
| Machine *offline* on the dashboard | No heartbeat for 5 min — service stopped, Wi-Fi/Tailscale down |
| Job stays `printing` | Listener stopped, wrong `KIOSK_ID`, or CUPS queue paused (`cupsenable`, `cupsaccept`) |
| Colour job rejected at CV-001 | Intentional: colour prints only at SV-002 |
| Firebase auth error | Wrong/expired `serviceAccountKey.json` |

Related: [`architecture.md` §9](../architecture.md#9-raspberry-pi-and-kiosk-hardware) · [`design.md` §8](../design.md#8-printing-lifecycle-and-job-state).
