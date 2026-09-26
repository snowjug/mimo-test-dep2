# `docs/` — documentation index

The main documents live at the repository root: [`README.md`](../README.md) (start here), [`architecture.md`](../architecture.md) (how the system fits together) and
[`design.md`](../design.md) (conventions and reasoning). This folder holds the rest.

| Path | What | Status |
|---|---|---|
| [`onboarding.md`](onboarding.md) | Three-day path for new interns | Current |
| [`deployment/CI_CD.md`](deployment/CI_CD.md) | How a push becomes a deployment, secrets, security gate, rollback | Current |
| [`deployment/REMAINING_SETUP.md`](deployment/REMAINING_SETUP.md) | The few actions only a repository administrator can do | Current |
| [`deployment/LEGACY_BACKEND_REMOVAL.md`](deployment/LEGACY_BACKEND_REMOVAL.md) | Plan and status for retiring the old `backend/` | Current (in progress) |
| [`deployment/DEPLOYMENT.md`](deployment/DEPLOYMENT.md), [`NORTHFLANK_FREE_TIER_OPTIMIZATION.md`](deployment/NORTHFLANK_FREE_TIER_OPTIMIZATION.md), [`PRODUCTION_DEPLOYMENT_GUIDE.md`](deployment/PRODUCTION_DEPLOYMENT_GUIDE.md) | Pre-consolidation deployment notes | **Historical** |
| [`architecture/FIREBASE_SCHEMA_DESIGN.md`](architecture/FIREBASE_SCHEMA_DESIGN.md) | A Firestore schema / BigQuery-export design proposal | **Proposal** — partly matches the real collections, the BigQuery export is not implemented |
| [`setup/pi-hardware.md`](setup/pi-hardware.md) | Non-secret hardware facts for the two kiosks | Current |
| `setup/Printpi(old pi) Production Setup Readme.pdf` | Original Pi setup notes | Historical, unverified |
| [`CRITICAL_ISSUES_ANALYSIS.md`](CRITICAL_ISSUES_ANALYSIS.md), [`troubleshooting_log.md`](troubleshooting_log.md) | Old analysis and a debugging diary | **Historical** |

Rules: one topic, one document (link instead of copying); label anything you could not verify; never put secrets, tokens or private addresses in any document.
