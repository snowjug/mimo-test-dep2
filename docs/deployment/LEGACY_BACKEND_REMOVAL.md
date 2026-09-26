# Legacy `backend/` — removal status

The plan and evidence. Nothing in this file was executed against production.

| Step | What | Who / needs | Status |
|---|---|---|---|
| 0 | Evidence checks | read-only | **Done** (below) |
| 1 | Preserve rules, indexes, Pi tooling; strip credentials from migrated scripts | repo | **Done** — commit `fb49d8c1` |
| 2 | Stop the two live copies (reversible pause) | `snowjug`: Northflank + Vercel dashboards | **Not done — needs dashboard access** |
| 3 | Delete `backend/` and `.github/workflows/backend-image.yml` | repo | **Ready, waiting for approval** (see below) |
| 4 | Rotate credentials the legacy servers held | Google Cloud IAM | **Blocked** — key usage unknown (see below) |

## Step 0 — evidence
* No code in `functions/`, the frontends, kiosk UI, tablet app, Pi scripts or the converter uses `backend/`. Every client calls `api-upqxuj7evq-uc.a.run.app`.
* The legacy server is live in **two** places: Northflank (`…code.run`, "Mimo Backend is LIVE") and Vercel project `mimo-kiosk-backend`
  (`mimo-kiosk-backend.vercel.app`). Both use the production Firestore; both keep serving their last good build if the folder is deleted.
* **Callers checked in Cloud Run request logs of the Functions API (14 days):** the Meta WhatsApp webhook (300+ POSTs, HTTP 200) and the Cashfree webhook
  (all 504 — see CI_CD.md §7) both reach the **Functions API**, not the legacy hosts. Traffic to the legacy hosts themselves is not visible without their dashboards.
* Legacy-only routes (`/cron/cleanup-files`, `/kiosk/health`, `/mimo/conversion-*`, `/generate-upload-urls`, two `/test-*`) are called by nothing in the repo.
* Recent commits to `backend/` (2026-09-21..23, three teammates) were mirrored in `functions/`; no known drift.
* Deployed Firestore and Storage rules equal the repo copies now in `firebase/`; the live index set is a subset of `firebase/firestore.indexes.json`.

## Step 2 — for the repository owner (`snowjug`), about 10 minutes
1. **Look before pausing:** Northflank service `mimo-backend` → Logs/Metrics, and Vercel project `mimo-kiosk-backend` → Logs — any requests in the last 14 days from something other than health checks or crawlers?
2. **Pause, do not delete:** Northflank → `mimo-backend` → *Pause*. Vercel → `mimo-kiosk-backend` → Settings → Git → *Disconnect* (or Pause). Both are reversible.
3. Watch for one to two weeks: WhatsApp ordering, payments, kiosk printing, e-mail alerts. If anything breaks, resume.
4. Only then delete the Northflank service, the Vercel project and the GHCR package `mimo-backend`.

## Step 3 — repository removal (ready)
```bash
git rm -r backend .github/workflows/backend-image.yml
```
then update the docs that still describe the legacy backend (README repo map and ground rules, `architecture.md` component and deployment tables, `CI_CD.md`
inventory, `functions/README.md` first paragraph, `firebase/README.md`, `docs/setup/pi-hardware.md`) and point `scripts/diagnostics/test_firestore.py` at the
root `serviceAccountKey.json`. Reversible with `git revert`; history keeps everything, including the `private.md` that is tracked today.
Expect: the Northflank and Vercel builds fail on the next push (red status) until Step 2 disconnects them, and open branches that edit `backend/` will conflict.
Leftover git-ignored local files in `backend/` (`node_modules`, `api/.env`) stay on disk.

## Step 4 — credentials (blocked, not rotated)
* `firebase-adminsdk-fbsvc@…` has **3 user-managed keys** (ids starting `d06a8506`, `f159c3b8`, `f4edf52a`). The key `f159c3b8` is in the legacy `backend/api/.env` **and** in the
  local root `serviceAccountKey.json`; the Pis probably hold a copy too. Deleting it before every holder is known would take the Pis or scripts offline.
* Safe order: inventory who holds which key (on each Pi: `python3 -c "import json;print(json.load(open('<path>/serviceAccountKey.json'))['private_key_id'])"`),
  create a new key for the Pis/functions, switch them, then delete the old keys. No key file is committed in git.
* Also rotate what the legacy servers may hold: `JWT_SECRET` of the legacy backend, Cashfree test keys in `backend/.env`, and the Pi passwords in `backend/private.md` and the old scripts.
