# CI/CD — how a push becomes a deployment

Everything here was verified against the repository and the public GitHub API of `snowjug/mimo-test-dep2` (workflow runs,
deployments, commit statuses) and by read-only requests to the public URLs. Dashboards (Vercel, Firebase, Google Cloud,
Northflank) were **not** accessed. Actions needed from a repository admin are in [`REMAINING_SETUP.md`](REMAINING_SETUP.md).

## 1. Deployment inventory

| Component | Source | Deployed to | Trigger | Auto on `main`? | Failure is visible as |
|---|---|---|---|---|---|
| Backend API (`api`) | `functions/` | Firebase Functions `us-central1`, project `mimo-v2-11868` | `deploy-functions.yml` on push to `main` touching `functions/**` (14 successful runs in history) | **Yes** | Red run in GitHub Actions |
| Firestore/scheduler triggers (6) | `functions/src/triggers/` | Firebase Functions — **live regions differ: `colourPaperUsageNotification`, `printerHardwareNotification`, `sendFailureNotification`, `lowPaperNotification` are in `asia-south1`; `api`, `autoRefundJob`, `autoCleanupStorageJob`, `scheduledFileRetentionCleanup` in `us-central1`** | same workflow, **manual opt-in only** (`deploy_triggers`) | **No** — see §5 | — |
| Customer site | `mimo-website/` | Vercel project `mimo_v2` → `printmimo.tech` | Vercel Git integration on every push | **Yes** (statuses seen on every commit) | Vercel status on the commit; `post-deploy-smoke.yml` on `main` |
| Admin + Finance | `mimo-website/mimo-admin-dashboard/` | Built into the customer site (`/admin/`, `/finance`) | same as customer site | **Yes** | same |
| Kiosk UI ×2 | `mimo-frontend-web-app/mimo-frontend/` | Two Vercel projects (`mimo-frontend`, `mimo-kiosk-backend` — project↔domain mapping is set in Vercel, inferred not verified) → `mimo-frontend-three.vercel.app`, `mimo-2-0.vercel.app` | Vercel Git integration | **Yes** | same |
| Office→PDF converter | `converter/` | Cloud Run `mimo-office-converter` (private) | `deploy-converter.yml` on push to `main` touching `converter/**` (was manual only) | **Yes** (new — not yet run) | Red run; health check |
| Legacy backend | `backend/` | Northflank `mimo-backend` (build status on every commit) + GHCR image | Northflank integration; `backend-image.yml` on `backend/**` (85 successful runs) | Yes — frozen, untouched | Northflank / Actions |
| Raspberry Pi listeners | `pi-listener/`, `pi_scripts/` | The two Pis (Tailscale + SSH) | Manual (`scripts/deployment/*.py`, SSH with password) | **No** | — (only a syntax check in CI) |
| Android kiosk shell | `LENOVO TABLET APP/` | The tablets (Device Owner, ADB) | Manual | **No** | — |
| Firestore rules/indexes | `backend/firestore.rules`, `backend/firestore.indexes.json` | Firebase | Manual `firebase deploy` | **No** | — |
| Storage rules | `firebase/storage.rules` | Firebase | Manual `firebase deploy` | **No** | — |

## 2. Pipeline

```
push / PR (any branch) ──► ci.yml  changed folders only:  functions tests · website+admin build · kiosk build ·
                                   converter syntax · Pi syntax · workflow lint          (deploys nothing)

push to main
  functions/**  ──► deploy-functions.yml   tests → live env + optional FUNCTIONS_ENV_FILE → SECURITY GATE
                                           → deploy api → public invoker → smoke test   (triggers: manual opt-in)
  converter/**  ──► deploy-converter.yml   build → deploy → invoker → health check (must be up AND private)
  backend/**    ──► backend-image.yml      (unchanged)
  any push      ──► Vercel builds the web apps ──► post-deploy-smoke.yml checks the public sites once Vercel reports success
```

Rollback: Actions → *Deploy Firebase Functions* → Run workflow (from `main`) → `ref` = an older commit or tag. Refused unless
that commit is part of `main`; the security gate and smoke test still run. Vercel rollback = revert the commit (or promote an
older deployment in Vercel, which needs its dashboard).

## 3. Backend configuration and the security gate

`functions/.env` is git-ignored and `firebase deploy` replaces a function's environment with what is in the deployed source.
The workflow therefore builds `functions/.env` at deploy time from (1) the **live function's current variables** (read-only
`gcloud run services describe api`) and (2) the optional **`FUNCTIONS_ENV_FILE`** secret, which wins on conflicts. Empty values never
overwrite real ones; only allow-listed names are written (`FIREBASE_*`, `PORT` … are dropped). The file is deleted afterwards
(`if: always()`), values are masked, and only names are ever printed.
Code and tests: `.github/scripts/functions-env.js`, `node --test .github/scripts/__tests__/functions-env.test.js`.

The deploy stops **before touching production** when:

| Condition | Exit |
|---|---|
| `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CASHFREE_ENV`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` or `GMAIL_APP_PASSWORD` is missing | 1 |
| `ADMIN_PASSWORD` is a default/common value (e.g. `admin`), < 12 chars, or equals `ADMIN_EMAIL` | 2 |
| `JWT_SECRET` is the public source-code fallback or < 32 chars | 2 |
| `CASHFREE_ENV` is neither `production` nor `sandbox` | 2 |

There is no bypass flag and no authentication code was changed.

## 4. Security review of the pipeline

| Area | Finding |
|---|---|
| Secrets in workflows | Only `FIREBASE_SERVICE_ACCOUNT` (existing) and `FUNCTIONS_ENV_FILE` (new, optional) plus `GITHUB_TOKEN`. Never echoed; env values masked; `gha-creds` file stays outside `functions/`. |
| Workflow permissions | `contents: read` everywhere except the legacy image job (`packages: write`). |
| Injection | Inputs and event data are passed through `env:`, never interpolated into shell. |
| Third-party actions | Pinned to major tags (not commit SHAs). Acceptable; pin SHAs if the org requires it. |
| Deploy scope | `--only functions:<name>` lists — a deploy can never delete other functions. |
| Deployer permissions | `FIREBASE_SERVICE_ACCOUNT` demonstrably deploys `api` and edits Cloud Run IAM. Whether it can deploy triggers (Eventarc/Secret Manager) and read the service config is **unproven until the first run** — the workflow degrades safely (see REMAINING_SETUP). |
| Public repository | The repo is public. Committed items that need cleanup in a security task: a WhatsApp token fallback in `functions/src/config/env.js`, `mimo_secret_123` in `functions/src/routes/kiosk.routes.js`, Pi SSH passwords in `backend/*.py` and `scripts/`, and `storage.rules` allowing public read/write (`if true`). None are touched here. |
| Production API auth | Live `POST /admin/login` rejects `admin/admin` today. The team's local `.env` contains it and the gate refuses it. |

## 5. What cannot be verified from here
Whether the live function currently has every required variable; that the deployer account can deploy triggers; the Vercel project ↔
folder mapping and Vercel "ignored build step" settings; branch protection. The first run of each workflow answers these and fails
with an explicit message if something is missing.

## 6. Trigger regions (found on 2026-09-26 with `firebase functions:list`)
The code in `functions/src/triggers/` sets no region, so a deploy would put every trigger in `us-central1`. Live, three notification triggers
already run in `asia-south1`, and a fourth (`lowPaperNotification`) exists live but not in the repository. Deploying from this code would
create duplicate triggers (duplicate alert e-mails) instead of updating the existing ones. Until each trigger's region is set in code to
match what is live, deploy triggers only deliberately and check `firebase functions:list` afterwards.
