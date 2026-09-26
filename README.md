# MIMO — Self-Service Cloud Printing

MIMO lets students print without USB drives or queues: **upload a document on the website → pay → get a 4-digit code → type it on a kiosk → collect the printout.**
Two kiosks are in production; a Raspberry Pi in each one does the actual printing.

| Machine | ID | Printers |
|---|---|---|
| **MIMO 1.0** | `CV-001` | Black & white — Brother HL-L5210DN |
| **MIMO 2.0** | `SV-002` | Black & white — Brother HL-L2440DW · Colour — Epson L3250 |

> **New here?** Read [How it works](#how-it-works), then follow the [three-day onboarding path](docs/onboarding.md). Deep dives: [`architecture.md`](architecture.md) (components, flows, data) and
> [`design.md`](design.md) (conventions and reasoning).

**Contents:** [How it works](#how-it-works) · [Features](#features-and-status) · [Tech stack](#technology-stack) · [Repository structure](#repository-structure) · [URLs](#urls) ·
[Prerequisites](#prerequisites) · [Local development](#local-development) · [Environment variables](#environment-variables) · [Testing](#testing) · [Deployment](#deployment) ·
[Onboarding](#new-intern-onboarding) · [Security](#security-notes) · [Troubleshooting](#troubleshooting) · [Documentation map](#documentation-map)

---

## How it works

```
   Student (browser / app / WhatsApp)                Kiosk tablet
   mimo-website                                      mimo-frontend
        │ upload · pay · get code                        │ enter code · watch progress
        ▼                                                ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ functions/  Firebase Cloud Function `api` (Express) + triggers │
   │ auth · pricing · payments · print codes · refunds · analytics  │
   └───────┬───────────────────────────────────────────┬────────────┘
           │                                           │
   Firestore + Cloud Storage                  Cashfree · WhatsApp · e-mail · converter
           │  job status becomes "printing"
           ▼
   Raspberry Pi (one per kiosk) ── CUPS ──► printer
   watches Firestore · prints · reports progress and a heartbeat
```

1. The student uploads straight to Cloud Storage; the API verifies the file (Office → PDF through `converter/`).
2. They pay with Cashfree (or the order is free / covered by a coupon). The API issues a **4-digit print code**.
3. At the kiosk the code is checked (rate limited) and the job is set to `printing` **for that kiosk**.
4. That kiosk's Pi sees the change in Firestore, prints through CUPS and writes progress → `completed` / `failed`.
5. A failed print is **refunded automatically**.
6. Staff follow everything live in the **admin dashboard** and the **finance portal**.

## Features and status

Legend — **Implemented**: in the code and used in production or tests · **Partial**: present but incomplete or being fixed · **Planned**: not in the code · **Unverified**: not confirmed by the documentation audit.
The complete table is in [`architecture.md` §14](architecture.md#14-feature-status-and-unverified-behaviour).

| Feature | Status |
|---|---|
| Customer account, upload (PDF / images / Office), print options, coupons, coins | Implemented |
| Cashfree payment, print code, refund requests, automatic refunds | Implemented |
| Kiosk code entry, live progress, screensaver | Implemented |
| Pi print listener with heartbeat, paper/toner alerts by e-mail | Implemented (live listener per machine **unverified**) |
| Admin dashboard and finance portal with live data and date ranges | Implemented |
| WhatsApp ordering | Implemented, **unverified** end to end |
| Cashfree webhook | **Partial** — hardening in progress |
| Separate finance login | **Partial** |
| Per-user admin accounts, bank settlement reconciliation, BigQuery export | **Planned** |

**Known issues** (see [`architecture.md` §13](architecture.md#13-known-limitations)): `POST /payment-success` trusts the caller · CORS allows any origin · `firebase/storage.rules` allows public read/write ·
some historical documents and folders are stale (`company-website/`, `docs/*` marked *Historical*) · the kiosk UI has the production API address hard-coded.

## Technology stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express 5, Firebase Cloud Functions v2 (`functions/`) |
| Data | Firestore, Cloud Storage, Secret Manager (Firebase project `mimo-v2-11868`) |
| Payments / messaging | Cashfree, WhatsApp Cloud API, Gmail SMTP |
| Customer site | React 18, Vite 6, Tailwind CSS 4, Radix UI, React Router 7, Capacitor (Android wrapper) |
| Admin + Finance | React 18, Vite 6, Tailwind CSS 4, Recharts |
| Kiosk UI | React 19, Vite 8, TypeScript; Android WebView shell in Kotlin |
| Pi | Python 3, `firebase-admin`, CUPS |
| Converter | Node 20 + LibreOffice on Cloud Run |
| CI/CD | GitHub Actions, Vercel (web apps), Firebase CLI |

## Repository structure

```
.
├── functions/                  THE backend — Firebase Cloud Functions (Node 20, Express 5)      → functions/README.md
├── mimo-website/               Customer web app · static marketing site · Android wrapper       → mimo-website/README.md
│   └── mimo-admin-dashboard/   Admin (/admin) + Finance (/finance) portals, live data           → its README.md
├── mimo-frontend-web-app/
│   └── mimo-frontend/          Kiosk touchscreen UI                                             → its README.md
├── LENOVO TABLET APP/          Android kiosk shell (Kotlin WebView) + ADB helpers               → its README.md
├── pi_scripts/, pi-listener/   Raspberry Pi print listeners (two variants)                      → their READMEs
├── converter/                  Office → PDF service (LibreOffice on Cloud Run)                  → converter/README.md
├── scripts/                    Tooling, not deployed: pi-ops/ · pi-setup/ · deployment/ · diagnostics/ · testing/   → scripts/README.md
├── firebase/                   Firestore + Storage rules, Firestore indexes                     → firebase/README.md
├── docs/                       Onboarding, deployment/CI-CD, historical notes                   → docs/README.md
├── .github/                    CI/CD workflows and their scripts                                → .github/README.md
├── company-website/            Older static site copy — stale                                   → company-website/README.md
├── backend/                    LEGACY Express server — frozen, being retired                    → backend/README.md
└── README.md · architecture.md · design.md · firebase.json · .firebaserc · .gitignore
```

**Ground rules:** `functions/` is the only backend (do not add features to `backend/`). Exported function names in `functions/index.js`, `firebase.json` / `.firebaserc`, the frontend folder names and the environment-variable names are
**deployment contracts** — Vercel, Firebase and Cloud Run settings live in dashboards outside this repository. Keep the repository root clean: new files go inside the folder they belong to.

## URLs

| What | URL |
|---|---|
| Customer web app | https://printmimo.tech |
| Landing page | https://printmimo.tech/landing |
| Admin dashboard | https://printmimo.tech/admin/ |
| Finance portal | https://printmimo.tech/finance |
| API | https://api-upqxuj7evq-uc.a.run.app |
| Kiosk MIMO 1.0 / 2.0 | `?kioskId=CV-001` / `?kioskId=SV-002` on the kiosk deployments (see [`mimo-frontend-web-app/mimo-frontend/README.md`](mimo-frontend-web-app/mimo-frontend/README.md)) |

## Prerequisites

Git · Node.js 20 and npm · (optional) Firebase CLI `npm install -g firebase-tools` and a JDK for the Firestore emulator · (optional) Python 3.9+ for the Pi tools.

```bash
git clone https://github.com/snowjug/mimo-test-dep2.git
cd mimo-test-dep2
```

## Local development

| I want to work on… | Run | Opens |
|---|---|---|
| Backend | `cd functions && npm install && npm run dev` | http://localhost:3000 |
| Customer site | `cd mimo-website && npm install && npm run dev` | http://localhost:5173 (API defaults to `http://localhost:3000` in dev; override with `VITE_API_URL`) |
| Admin / Finance | `cd mimo-website/mimo-admin-dashboard && npm install && npm run dev` | http://localhost:5174 (API defaults to `http://localhost:3000`) |
| Kiosk UI | `cd mimo-frontend-web-app/mimo-frontend && npm install && npm run dev` | http://localhost:5173/?kioskId=SV-002 (Vite picks the next free port) — ⚠ talks to the **production** API, see its README |

**A local backend that has real credentials talks to the real Firestore.** Use the Firestore emulator for experiments — the recipe is in [`docs/onboarding.md`](docs/onboarding.md#day-1--understand-mimo-and-run-one-app).

## Environment variables

Secrets are never committed. Real values are in the shared credentials file (link at the end of this README); interns should normally not need production secrets — use the emulator.
Safe local example for `functions/.env` (git-ignored):

```env
JWT_SECRET=local-dev-only-secret
ADMIN_EMAIL=dev@example.com
ADMIN_PASSWORD=choose-something-local
# Optional integrations — leave unset locally; the features that need them will simply not work:
# CASHFREE_ENV=sandbox
# CASHFREE_APP_ID=…    CASHFREE_SECRET_KEY=…
# GMAIL_APP_PASSWORD=…
# WA_PHONE_NUMBER_ID=… WA_ACCESS_TOKEN=… WA_VERIFY_TOKEN=…
```

The full variable list with purposes is in [`functions/README.md`](functions/README.md#5-environment-variables). Front-end variables: `VITE_API_URL` (customer site and admin, dev only), `VITE_KIOSK_ID` (kiosk UI).
Pi tools read `PI_*` variables from `scripts/pi-ops/pi-hosts.env` ([template](scripts/pi-ops/pi-hosts.example.env)).

## Testing

```bash
(cd functions && npm test)                                        # backend unit tests (50)
node --test .github/scripts/__tests__/functions-env.test.js       # deployment-gate tests
python3 scripts/pi-ops/tests/test_pi_ops.py                       # Pi tooling tests, offline
(cd mimo-website && npm run build)                                # customer site + admin build
(cd mimo-frontend-web-app/mimo-frontend && npm run build)         # kiosk UI type-check + build
```

On GitHub, `ci.yml` runs the relevant checks for the folders a branch or pull request touches.

## Deployment

Pushing to `main` deploys automatically — **never push to `main` directly; open a pull request.** Details: [`docs/deployment/CI_CD.md`](docs/deployment/CI_CD.md);
what only an administrator can do: [`docs/deployment/REMAINING_SETUP.md`](docs/deployment/REMAINING_SETUP.md).

| Part | How |
|---|---|
| Backend `api` | Push touching `functions/**` → `deploy-functions.yml`: tests → env from the live function (+ optional `FUNCTIONS_ENV_FILE` secret) → **refuses to deploy with missing or insecure config** → deploy → smoke test. Rollback: re-run the workflow with an older `ref`. |
| Six triggers | Manual opt-in (their live regions differ from the code — see `CI_CD.md`) |
| Customer site, admin, finance, kiosk UI | Vercel's GitHub integration on every push; `post-deploy-smoke.yml` checks the public sites |
| Office converter | `deploy-converter.yml` on pushes touching `converter/**`, with a health check |
| Legacy backend | Northflank + Vercel + `backend-image.yml` — frozen, retirement in [`docs/deployment/LEGACY_BACKEND_REMOVAL.md`](docs/deployment/LEGACY_BACKEND_REMOVAL.md) |
| Raspberry Pis, Android tablets, Firebase rules | **Manual** — see REMAINING_SETUP and [`scripts/pi-ops/README.md`](scripts/pi-ops/README.md) |

## New intern onboarding

[`docs/onboarding.md`](docs/onboarding.md) is the full path. In short:

* **Day 1** — read this README and `architecture.md`; set up Node 20; run your app locally (backend against the emulator); run `cd functions && npm test`.
* **Day 2** — trace a request from the UI through routes → controllers → Firestore; run the other test suites; find the logs.
* **Day 3** — pick a small task, work on `intern/<your-name>-<topic>`, test, push the branch and open a pull request (do not merge it yourself).

## Security notes

* Never commit `.env` files, `serviceAccountKey.json` or any key (they are git-ignored). Never paste secrets into issues, chats or pull requests.
* `JWT_SECRET` and a strong `ADMIN_PASSWORD` **must** be set in production; the deploy pipeline refuses to publish without them.
* The 4-digit print code is protected by a Firestore-backed rate limiter — keep it on those routes.
* Work on a branch and open a pull request; a merge to `main` deploys the API.
* Known follow-ups: see [Features and status](#features-and-status) and [`docs/CRITICAL_ISSUES_ANALYSIS.md`](docs/CRITICAL_ISSUES_ANALYSIS.md) (historical).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Dashboard shows an error banner | API unreachable, session expired, or an older API without the `/admin/*` insight routes — click *Retry*, restart your local backend |
| `404` for `/admin/analytics` | You are talking to an API version that predates the dashboards |
| Machine shows *offline* | No heartbeat for 5 minutes: power, Wi-Fi, or `mimo-listener` stopped |
| `401` from the API | Missing or expired JWT — log in again |
| `429` at the kiosk | Too many wrong print codes from that IP — wait a minute |
| Works locally, not in production | Missing variable on the deployed function, or a stale Vercel build |
| Admin assets 404 in production | The admin build must use base `/admin/` (already so for `vite build`) |

## Documentation map

| | |
|---|---|
| [`architecture.md`](architecture.md) · [`design.md`](design.md) | System architecture · conventions and reasoning |
| [`docs/onboarding.md`](docs/onboarding.md) · [`docs/README.md`](docs/README.md) | Intern path · documentation index |
| [`functions/README.md`](functions/README.md) | Backend: API, env vars, tests |
| [`mimo-website/README.md`](mimo-website/README.md) · [admin](mimo-website/mimo-admin-dashboard/README.md) · [kiosk](mimo-frontend-web-app/mimo-frontend/README.md) | Front ends |
| [`scripts/README.md`](scripts/README.md) · [`pi_scripts/README.md`](pi_scripts/README.md) · [`pi-listener/README.md`](pi-listener/README.md) | Pi tooling and listeners |
| [`.github/README.md`](.github/README.md) · [`docs/deployment/CI_CD.md`](docs/deployment/CI_CD.md) | Pipelines |

---

## Credentials (private)

Environment variables and service credentials are shared privately on Google Drive. Never commit them.

📁 **[Environment variables & credentials (Google Drive)](https://drive.google.com/file/d/1VURWsFEovVIUPC2dxNqrPfkcpAye42IU/view?usp=sharing)**
