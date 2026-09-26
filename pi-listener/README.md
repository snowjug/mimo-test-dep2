# `pi-listener/` — Raspberry Pi print listener (MIMO 2.0 work, smaller variant)

**Responsibility:** the same job as [`pi_scripts/firebase_listener.py`](../pi_scripts/README.md) — watch Firestore, print through CUPS, report progress and heartbeat — in a smaller variant (≈980 lines).
Its recent history is about MIMO 2.0 (`SV-002`): physical paper/printer error detection, a 120 s print deadline, duplex timeout and colour completion sync (latest change 2026-09-24).
**Which variant runs on which Pi is unverified.** It lacks the `report-failure` API call, the image pipeline and the prefetch watcher of the larger variant, so compare them before choosing what to deploy.

| File | Purpose |
|---|---|
| `firebase_listener.py` | `on_snapshot` on `print_jobs` (status `printing` for `KIOSK_ID`), `process_job`, `print_file`, `heartbeat_loop` |

**Communication, environment and troubleshooting:** identical in shape to the other variant — see [`pi_scripts/README.md`](../pi_scripts/README.md). Environment variables read here: `KIOSK_ID`, `BW_PRINTER_NAME`, `COLOR_PRINTER_NAME`, `IS_MONOCHROME_ONLY`.
Needs `serviceAccountKey.json`, `firebase-admin`, `requests` and CUPS. No automated tests; CI only compiles it.

Related: [`architecture.md` §9](../architecture.md#9-raspberry-pi-and-kiosk-hardware) · [`docs/setup/pi-hardware.md`](../docs/setup/pi-hardware.md).
