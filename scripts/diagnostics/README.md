# `scripts/diagnostics/` — inspection helpers (historical)

Read-only-ish helpers used while debugging printing and e-mail. **Several embed SSH credentials or expect a service-account key file — do not copy them.** Prefer [`../pi-ops/`](../pi-ops/README.md) for Pi work.

| File | Purpose |
|---|---|
| `inspect_firestore_jobs.py`, `inspect_specific_failures.py`, `test_firestore.py` | Read `print_jobs` from Firestore (needs a key file; `test_firestore.py` points at a path inside the legacy `backend/`) |
| `get_journal.py`, `inspect_journal_filtered.py`, `inspect_sv002_logs.py`, `fetch_logs.py`, `monitor_pi.py`, `live_deep_audit.py` | Fetch/inspect listener journals from the Pis over SSH |
| `fetch_listener.py`, `listener_code2.py` | Download or keep a copy of a listener from a Pi |
| `check_email.js`, `check_user_email.py` | Check e-mail delivery / a user's address |

Requires `paramiko` (Python) or `firebase-admin` (Node). No tests.
