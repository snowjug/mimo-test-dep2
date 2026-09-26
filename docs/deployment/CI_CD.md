# CI/CD — how a `git push` becomes a deployment

Evidence for this document comes from the repository and from the public GitHub API (workflow runs, deployments and
commit statuses of `snowjug/mimo-test-dep2`). Dashboards (Vercel, Firebase, Google Cloud) were **not** inspected.

## 1. Current architecture

| Part | Where it runs | Deployed by | Trigger | Needs repo secret |
|---|---|---|---|---|
| Backend API `api` | Firebase Functions (`mimo-v2-11868`, us-central1) | `deploy-functions.yml` | push to `main` touching `functions/**` | `FIREBASE_SERVICE_ACCOUNT` (exists: 14 successful runs) |
| 6 Firestore/scheduler triggers | Firebase Functions | same workflow, **manual run with "include_triggers"** | manual only | same |
| Office→PDF converter | Cloud Run `mimo-office-converter` | `deploy-converter.yml` | push to `main` touching `converter/**`, or manual | same |
| Web apps (customer site + admin + finance, kiosk UI ×2, and possibly the legacy backend) | **Three Vercel projects are connected to this repo** and report commit statuses: `mimo_v2`, `mimo-frontend` (its folder link is `mimo-frontend-web-app/mimo-frontend/.vercel`), `mimo-kiosk-backend`. The exact project ↔ folder mapping is set in Vercel and is not verifiable from the repo. | Vercel itself | every push (Production on `main`, Preview on other branches) | none in GitHub |
| Legacy backend `backend/` | Northflank service `mimo-backend` (build status on every commit) + GHCR image | Northflank / `backend-image.yml` | pushes touching `backend/**` (image); Northflank on every push | `GITHUB_TOKEN` only |
| Raspberry Pi listeners | The devices | manual (`scripts/deployment/`) | — | — |

Frozen: `backend/`, `backend-image.yml`. Untouched by this work.

**Already automatic:** API (`api`), all Vercel apps, legacy image. **Was manual:** converter, triggers.

## 2. What the pipeline does now

```
push / PR ─► ci.yml (any branch except main) ── tests + builds only the apps whose files changed, deploys nothing
push to main
   ├─ functions/**  ─► deploy-functions.yml: tests ─► read live env ─► build .env ─► SECURITY GATE ─► deploy api ─► smoke test
   ├─ converter/**  ─► deploy-converter.yml
   ├─ backend/**    ─► backend-image.yml (unchanged)
   └─ everything    ─► Vercel builds mimo-website (+admin/finance) and the kiosk UI itself
```

### Backend environment variables (the important part)
`functions/.env` is git-ignored, so CI cannot read it, and `firebase deploy` replaces a function's environment with what
is in the deployed source. To avoid dropping production variables the workflow builds `functions/.env` at deploy time from:

1. the **live function's current variables** (read-only `gcloud run services describe api`), then
2. the optional **`FUNCTIONS_ENV_FILE`** repository secret (a dotenv file), which wins on conflicts. Empty values never overwrite.

Only allow-listed names are written; reserved names (`FIREBASE_*`, `PORT`, …) are dropped. Values are masked in logs and the
generated file is deleted at the end (`if: always()`). Logic and tests: `.github/scripts/functions-env.js`
(`node --test .github/scripts/__tests__/functions-env.test.js`).

**The deploy fails, before touching production, when:**

| Condition | Exit | Message names |
|---|---|---|
| Any of `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CASHFREE_ENV`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `GMAIL_APP_PASSWORD` is missing | 1 | the missing names |
| `ADMIN_PASSWORD` is a default/common value (e.g. `admin`), shorter than 12 characters, or equals `ADMIN_EMAIL` | 2 | the rule |
| `JWT_SECRET` is the public source-code fallback or shorter than 32 characters | 2 | the rule |
| `CASHFREE_ENV` is neither `production` nor `sandbox` | 2 | the rule |

There is deliberately **no bypass flag**. Authentication code is unchanged; the gate only refuses to publish an insecure setup.

After the deploy it re-applies the public invoker binding and smoke-tests the live API: `GET /` = 200,
`GET /admin/analytics` without token = 401 (proves the new routes are live) and a bad admin login = 401.

## 3. One-time requirements (cannot be automated from the repo)

| # | Requirement | Who | Why |
|---|---|---|---|
| 1 | Add repository secret **`FUNCTIONS_ENV_FILE`** = the production `functions/.env` **with a strong `ADMIN_PASSWORD` and `JWT_SECRET`** (Settings → Secrets and variables → Actions) | **Repository admin (`snowjug`)** — collaborators with write access cannot manage Actions secrets | Only if the live function's environment is missing values or holds the insecure ones. If production already has strong values the live snapshot suffices and no secret is needed. |
| 2 | Confirm the existing `FIREBASE_SERVICE_ACCOUNT` secret still works | visible from run history: yes (latest success 2026-09-23) | Already satisfied |
| 3 | (Optional) Branch protection on `main` requiring the `CI` checks | Repository admin | Without it CI is advisory: Vercel deploys regardless of CI results |

Not verifiable from here: whether the live function currently has all variables (its last deploys ran without a `.env`), the
Vercel project ↔ folder mapping, and Vercel's "Ignored Build Step" settings. The first automatic run answers the first
question by itself: it either succeeds or stops with a message listing what is missing.

## 4. Security items that block a production deploy (postponed by request, still enforced)

1. Admin/finance login uses `ADMIN_EMAIL` / `ADMIN_PASSWORD`; the values in the team's `.env` are `admin` / `admin`.
2. `JWT_SECRET` falls back to a public string in `src/config/env.js` when unset (forgeable admin and user tokens).
3. Hard-coded fallbacks for a WhatsApp token and the internal webhook secret exist in source and in git history.
4. `POST /payment-success` trusts the caller; CORS allows every origin.

The gate enforces 1 and 2. Items 3–4 are not gated (code changes, not configuration) and stay open for the security task.

## 5. Notes and limits

* Vercel deploys every push to all three connected projects — that is dashboard-controlled.
  Restricting builds to changed folders needs an `ignoreCommand` per project; not added because it cannot be verified from here.
* `deploy-converter.yml` now uses `--update-env-vars` (was `--set-env-vars`, which would erase any other variable on the service).
* Manual deploy of triggers: Actions → *Deploy Firebase Functions* → Run workflow (from `main`) → tick **include_triggers**.
* Rolling back: revert the commit on `main`; the workflow redeploys the previous code.
