# CV-001 (MIMO 1.0) listener

MIMO 1.0's Pi (`printpi`, Brother HL-L5210DN) runs `/home/printpi/firebase_listener.py`, deployed by hand. That
file is **not** the same as `pi_scripts/firebase_listener.py` in this repository (verified 2026-10-24: md5
`29902ee8…` on the device vs. a ~460-line difference from the repo file) and it is not committed here because it
contains machine credentials. Changes to it are kept here as patches against the deployed file.

| Patch | Applies to (md5 before) | What it does |
|---|---|---|
| `progress-sync.patch` | `29902ee88e86e8c81ccc5a110cd0f513` | Kiosk progress follows the printer's page counter: writes `totalSheets` and `sheetsCompleted` (capped at N-1) as sheets are counted, `completed` only after the last one plus `SHEET_EXIT_CLEARANCE_SEC`; duplex never completes early whether the counter counts sheets or sides. |

Tests (run against the real file, which stays off GitHub):

```bash
CV001_LISTENER_PATH=/path/to/firebase_listener.py python -B pi_scripts/tests/test_cv001_progress_sync.py -v
```

Deploy: back up the device file, `patch` it (or copy the tested file), `python3 -m py_compile`, then
`sudo systemctl restart mimo-listener` while no job is printing. Rollback: copy the backup back and restart.
Tunables (systemd `Environment=`): `SHEET_EXIT_CLEARANCE_SEC` (default 1.0), `DUPLEX_SETTLE_SEC` (default 10).
