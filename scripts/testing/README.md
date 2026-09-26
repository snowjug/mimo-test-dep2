# `scripts/testing/` — fixtures and manual verification

Not part of CI. Manual scripts and sample files.

| Path | Purpose |
|---|---|
| `fixtures/` | Sample PDF/DOCX/JPG/PNG files and captured pages for upload and print tests |
| `create_test_files.py` | Generates the sample files (needs `fpdf`, `python-docx`, `Pillow`) |
| `test_pycups_jobs.py`, `verify_live_sv002_fix.py` | Print-queue checks against a Pi (SSH) |
| `test_dev_server.py` | Requests the admin dev server (`http://localhost:5174`) |
| `verify_chrome_e2e.py` | Drives Chrome (Windows path hard-coded) |
| `check.js`, `check_pw.js` | Small Node experiments |

The older automated API tests lived in the legacy `backend/` and were not migrated. Backend tests are in [`functions/__tests__/`](../../functions/__tests__/README.md).
