# MIMO — Self-Service Cloud Printing

Print without USB drives or queues: **upload on the website → pay → get a 4-digit code → type it on a kiosk → collect
the printout.** Two kiosks run in production.

| Machine | ID | Printers |
|---|---|---|
| **MIMO 1.0** | `CV-001` | Black & white — Brother HL-L5210DN |
| **MIMO 2.0** | `SV-002` | Black & white — Brother HL-L2440DW · Colour — Epson L3250 |

**Contents:** [How it works](#how-it-works) · [Repository map](#repository-map) · [URLs](#apps-and-urls) ·
[Getting started](#getting-started) · [Dashboards](#admin-dashboard--finance-portal) · [Raspberry Pis](#raspberry-pis) ·
[Deployment](#deployment) · [Testing](#testing) · [Security](#security-notes) · [Troubleshooting](#troubleshooting) ·
[More docs](#more-documentation)

> The full design (data model, flows, security, failure modes) is in
> [`docs/architecture/architecture.md`](docs/architecture/architecture.md).

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

1. The student uploads straight to Cloud Storage; the API verifies the file (Office → PDF via `converter/`).
2. They pay with Cashfree (or the order is free / covered by a coupon). The API issues a **4-digit print code**.
3. At the kiosk the code is checked (rate-limited) and the job is set to `printing` **for that kiosk**.
4. That kiosk's Pi sees the change in Firestore, prints through CUPS and writes progress → `completed` / `failed`.
5. A failed print is **refunded automatically**.
6. Staff follow everything live in the **admin dashboard** and **finance portal**.

## Repository map

```
.
├── functions/                  THE backend — Firebase Cloud Functions (Node 20, Express 5)     → functions/README.md
├── mimo-website/               Customer web app · static marketing site · Android wrapper       → mimo-website/README.md
│   └── mimo-admin-dashboard/   Admin (/admin) + Finance (/finance) portals, live data           → its README.md
├── mimo-frontend-web-app/
│   └── mimo-frontend/          Kiosk touchscreen UI                                             → its README.md
├── LENOVO TABLET APP/          Android kiosk shell (Kotlin WebView) + ADB lock/unlock helpers
├── pi-listener/, pi_scripts/   Raspberry Pi print listeners (Python)
├── converter/                  Office → PDF service (LibreOffice on Cloud Run)
├── scripts/                    Tooling, not deployed: pi-setup/ · deployment/ · diagnostics/ · testing/
├── docs/                       architecture/ · deployment/ · setup/ · historical notes
├── firebase/                   storage.rules
├── company-website/            Older static site copy — stale, the live one is mimo-website/public
├── backend/                    LEGACY Express server — frozen, not used by production
├── .github/                    CI/CD workflows and their scripts
└── README.md · firebase.json · .firebaserc · .gitignore
```

**Ground rules**

* `functions/` is the only backend. Do not add features to `backend/`: it stays because an external process may still use
  its Docker image, and it holds the Firestore rules/indexes files.
* Exported function names in `functions/index.js`, `firebase.json` / `.firebaserc` and the frontend folder names are
  **deployment contracts** — Vercel and Firebase settings live in dashboards outside this repo. Never rename or move them.
* Keep the repository root clean: put new files inside the folder they belong to.

## Apps and URLs

| What | URL |
|---|---|
| Customer web app | https://printmimo.tech |
| Landing page | https://printmimo.tech/landing |
| Admin dashboard | https://printmimo.tech/admin/ |
| Finance portal | https://printmimo.tech/finance |
| API | https://api-upqxuj7evq-uc.a.run.app |
| Kiosk MIMO 1.0 | https://mimo-frontend-three.vercel.app/?kioskId=CV-001 |
| Kiosk MIMO 2.0 | https://mimo-2-0.vercel.app/?kioskId=SV-002 |

Firebase project: `mimo-v2-11868`.

## Getting started

Prerequisites: Node.js 20 and Git. Python 3.9+ only for the Pi scripts; the Firebase CLI only for manual deploys.

```bash
git clone https://github.com/snowjug/mimo-test-dep2.git
cd mimo-test-dep2
```

**Secrets first.** Credentials are never in git. Get the shared credentials file (link at the end of this README) and put
`functions/.env` in place; the variable names are listed in [`functions/README.md`](functions/README.md#5-environment-variables).

| I want to work on… | Run | Opens |
|---|---|---|
| Backend | `cd functions && npm install && npm run dev` (tests: `npm test`) | http://localhost:3000 |
| Customer site | `cd mimo-website && npm install && npm run dev` | http://localhost:5173 |
| Admin / Finance | `cd mimo-website/mimo-admin-dashboard && npm install && npm run dev` | http://localhost:5174 (talks to the API on :3000) |
| Kiosk UI | `cd mimo-frontend-web-app/mimo-frontend && npm install && npm run dev` | http://localhost:5173/?kioskId=SV-002 (Vite picks the next free port if 5173 is taken) |

The customer site and kiosk UI call the production API unless you set `VITE_API_URL=http://localhost:3000`.
**A local backend with real credentials talks to the real Firestore** — use the Firestore emulator for experiments.

## Admin dashboard & finance portal

* Log in with the admin credentials configured on the API (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
* Every page is **live** and driven by a **date range** — default today; presets, custom dates and a comparison with the
  previous period. No sample data: an empty range shows zeros.
* Shows exactly the two real machines with heartbeat, paper and toner state.
* Details: [`mimo-website/mimo-admin-dashboard/README.md`](mimo-website/mimo-admin-dashboard/README.md).

## Raspberry Pis

Each kiosk has a Pi running a Python listener as the systemd service `mimo-listener`
(unit files and setup helpers: `scripts/pi-setup/`, `KIOSK_ID` set per machine). It watches `print_jobs` for
`status == "printing"` for its kiosk, prints through CUPS, writes progress, and updates `system_status/<kioskId>` every ~30 s —
that heartbeat is what shows a machine as *online* on the dashboard.

```bash
sudo journalctl -u mimo-listener -f      # logs
sudo systemctl restart mimo-listener     # restart
lpstat -p -d                             # printer state
```

Which of `pi-listener/` or `pi_scripts/` runs on which Pi is not confirmed by file hash — check before editing either.

## Deployment

Pushing to `main` deploys automatically. Details: [`docs/deployment/CI_CD.md`](docs/deployment/CI_CD.md); the few things a
repository admin must do once: [`docs/deployment/REMAINING_SETUP.md`](docs/deployment/REMAINING_SETUP.md).

| Part | How |
|---|---|
| Backend `api` + 6 triggers | Push touching `functions/**` → `deploy-functions.yml`: tests → env from the live function (+ optional `FUNCTIONS_ENV_FILE` secret) → **refuses to deploy with missing or insecure config** → deploy → smoke test → triggers. Rollback: re-run the workflow with an older `ref`. |
| Customer site, admin, finance, kiosk UI | Vercel's GitHub integration on every push; `post-deploy-smoke.yml` then checks the public sites. |
| Office converter | `deploy-converter.yml` on pushes touching `converter/**`, with a health check. |
| Legacy backend | Northflank + `backend-image.yml` — frozen, leave alone. |
| Raspberry Pis, Android tablets, Firebase rules | **Manual** (physical devices / rules) — see REMAINING_SETUP. |
| Checks | `ci.yml` tests and builds only the apps a branch or PR touches; it deploys nothing. |

## Testing

```bash
(cd functions && npm test)                                        # backend unit tests
node --test .github/scripts/__tests__/functions-env.test.js       # deployment-gate tests
(cd mimo-website && npm run build)                                # customer site + admin build
(cd mimo-frontend-web-app/mimo-frontend && npm run build)         # kiosk UI type-check + build
```

## Security notes

* Never commit `.env`, `serviceAccountKey.json` or any key (they are git-ignored). Do not paste secrets into issues or chat.
* `JWT_SECRET` and a strong `ADMIN_PASSWORD` **must** be set in production; the deploy pipeline refuses to publish without them.
* The print code is only 4 digits, so lookups are rate-limited — keep `middleware/rateLimit.js` on those routes.
* Work on a feature branch and open a pull request; `main` deploys the API automatically.
* Known follow-ups, not yet changed: `POST /payment-success` trusts the caller instead of confirming with Cashfree; CORS allows
  any origin; `firebase/storage.rules` allows public read/write; some fallback secrets and Pi passwords are committed in this public
  repo and need rotating. See [`docs/CRITICAL_ISSUES_ANALYSIS.md`](docs/CRITICAL_ISSUES_ANALYSIS.md) and `CI_CD.md` §4.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Dashboard shows an error banner | API unreachable, session expired, or the API is an older version without the `/admin/*` insight routes — click *Retry*, check `curl https://api-upqxuj7evq-uc.a.run.app/`, restart your local backend |
| Machine shows *offline* | No heartbeat for 5 min: power, Wi-Fi, or `mimo-listener` stopped |
| `401` from the API | Missing or expired JWT — log in again |
| `429` at the kiosk | Too many wrong print codes from that IP — wait a minute |
| Works locally, not in production | Missing variable on the deployed function, or a stale Vercel build |
| Admin assets 404 in production | The admin build must use base `/admin/` (already so for `vite build`) |

## More documentation

| | |
|---|---|
| [`docs/architecture/architecture.md`](docs/architecture/architecture.md) | Full architecture |
| [`functions/README.md`](functions/README.md) | Backend: structure, API, env vars, tests, deploy |
| [`mimo-website/README.md`](mimo-website/README.md) | Customer website |
| [`mimo-website/mimo-admin-dashboard/README.md`](mimo-website/mimo-admin-dashboard/README.md) | Admin + finance portal |
| [`mimo-frontend-web-app/mimo-frontend/README.md`](mimo-frontend-web-app/mimo-frontend/README.md) | Kiosk UI |
| [`docs/deployment/`](docs/deployment) | CI/CD, remaining setup, and older (historical) notes |

---

## Credentials (private)

Environment variables and service credentials are shared privately on Google Drive. Never commit them.

📁 **[Environment variables & credentials (Google Drive)](https://drive.google.com/file/d/1VURWsFEovVIUPC2dxNqrPfkcpAye42IU/view?usp=sharing)**
