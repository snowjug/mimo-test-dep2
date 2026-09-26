# MIMO — Self-Service Cloud Printing

MIMO lets students print without USB drives or queues: **upload a document on the website → pay → get a 4-digit code →
type it on a kiosk → collect the printout.** Two kiosks run in production.

| Machine | ID | Printers |
|---|---|---|
| **MIMO 1.0** | `CV-001` | Black & white (Brother HL-L5210DN) |
| **MIMO 2.0** | `SV-002` | Black & white (Brother HL-L2440DW) + colour (Epson L3250) |

> New here? Read [How it works](#how-it-works), then [Repository map](#repository-map), then set up the part you will
> work on. The deep dive is in [`docs/architecture/architecture.md`](docs/architecture/architecture.md).

---

## How it works

```
 Student's phone/laptop                         Kiosk touchscreen (Android tablet)
 mimo-website (React)                           mimo-frontend (React, full-screen)
        │  upload · pay · get code                     │  enter code · watch progress
        ▼                                              ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  functions/  — Firebase Cloud Function `api` (Express)  + Firestore triggers │
 │  auth · pricing · Cashfree payments · print codes · refunds · analytics     │
 └───────────────┬───────────────────────────────┬──────────────────────────┘
                 │                               │
         Firestore + Cloud Storage        Cashfree (payments) · WhatsApp · e-mail
                 │  status becomes "printing"
                 ▼
 Raspberry Pi per kiosk (pi-listener / pi_scripts)  ── CUPS ──►  physical printer
        watches Firestore, downloads the PDF, prints, reports progress + heartbeat
```

1. The student uploads files straight to Cloud Storage; the API verifies them (Office files → PDF via `converter/`).
2. They pay through Cashfree (or a free/coupon order). The API issues a **4-digit print code**.
3. At the kiosk they enter the code. The API checks it (rate-limited) and marks the job `printing` **for that kiosk**.
4. The kiosk's Raspberry Pi sees the change in Firestore, prints via CUPS, and writes progress → `completed` / `failed`.
5. A failed print is **refunded automatically** (Firestore trigger → Cashfree).
6. Staff watch everything live in the **admin dashboard** and **finance portal**.

## Repository map

```
.
├── functions/                    ★ THE backend: Firebase Cloud Functions (Node 20, Express 5)      → functions/README.md
├── mimo-website/                 Customer web app + static marketing pages + Android (Capacitor)   → mimo-website/README.md
│   └── mimo-admin-dashboard/     Admin dashboard (/admin) + Finance portal (/finance), live data   → its README.md
├── mimo-frontend-web-app/
│   └── mimo-frontend/            Kiosk touchscreen UI                                              → its README.md
├── LENOVO TABLET APP/            Android kiosk shell (Kotlin WebView) + ADB lock/unlock scripts
├── pi-listener/ · pi_scripts/    Raspberry Pi print listeners (Python) — see "Raspberry Pis" below
├── mimo-listener*.service · pi_setup.sh · fallback_wifi.sh …   Pi provisioning (systemd units, setup)
├── converter/                    Office → PDF service (LibreOffice on Cloud Run: `mimo-office-converter`)
├── scripts/                      One-off tooling (not deployed): deployment/ · diagnostics/ · testing/
├── docs/                         architecture/ · deployment/ · setup/ · historical notes
├── company-website/              Older static site copy (stale; the live one is mimo-website/public)
├── backend/                      ⚠ LEGACY Express server — FROZEN, not used by production
└── firebase.json · .firebaserc · storage.rules · .github/workflows/
```

**Ground rules**

* `functions/` is the only backend. Do not add features to `backend/`; it is kept because an external process may still
  use its Docker image (`backend-image.yml`) and it holds the Firestore rules/indexes files.
* Exported function names and URLs in `functions/index.js`, the `firebase.json`/`.firebaserc` project wiring and the
  frontend folder names are **deployment contracts** (Vercel/Firebase settings live in dashboards, not in this repo).
  Never rename or move them.

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

Prerequisites: Node.js 20, npm, Git. Python 3.9+ only for Pi scripts, Firebase CLI only for manual deploys.

```bash
git clone https://github.com/snowjug/mimo-test-dep2.git
cd mimo-test-dep2
```

**Secrets first.** Real credentials are never in git. Get the shared credentials file (link at the bottom of this README) and
put `functions/.env` in place. Variable names are documented in [`functions/README.md`](functions/README.md#5-environment-variables).

| I want to work on… | Run |
|---|---|
| Backend | `cd functions && npm install && npm run dev` → http://localhost:3000 · `npm test` |
| Customer site | `cd mimo-website && npm install && npm run dev` → http://localhost:5173 |
| Admin / Finance | `cd mimo-website/mimo-admin-dashboard && npm install && npm run dev` → http://localhost:5174 (uses the API on :3000) |
| Kiosk UI | `cd mimo-frontend-web-app/mimo-frontend && npm install && npm run dev` → http://localhost:5173/?kioskId=SV-002 |

Frontends call the production API unless you point them at a local one with `VITE_API_URL=http://localhost:3000`
(the admin dashboard does this by default in dev). **A local backend with real credentials talks to the real
Firestore** — prefer the Firestore emulator when experimenting.

## Admin dashboard & finance portal at a glance

* Sign in with the admin credentials configured on the API (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
* Every page is **live** and driven by a **date range** (default: today; presets, custom dates, comparison with the
  previous period). No sample data: an empty range shows zeros.
* Shows exactly the two real machines and their heartbeat/paper/toner state.
* Details: [`mimo-website/mimo-admin-dashboard/README.md`](mimo-website/mimo-admin-dashboard/README.md).

## Raspberry Pis

Each kiosk has a Pi running a Python listener as the systemd service `mimo-listener`
(`mimo-listener.service`, `KIOSK_ID` set per machine). It watches `print_jobs` for `status == "printing"` for its kiosk,
prints through CUPS, updates progress, and writes a heartbeat to `system_status/<kioskId>` every ~30 s (this is what makes a
machine show *online* on the dashboard).

```bash
sudo journalctl -u mimo-listener -f      # logs
sudo systemctl restart mimo-listener     # restart
lpstat -p -d                             # printer state
```

Which of `pi-listener/` or `pi_scripts/` runs on which Pi has not been confirmed by file hash — check before editing either.

## Deployment

Pushing to `main` deploys automatically; details, secrets and the safety gate are in
[`docs/deployment/CI_CD.md`](docs/deployment/CI_CD.md).

| Part | How |
|---|---|
| Backend `api` | Push to `main` touching `functions/**` → `deploy-functions.yml`: tests → builds the env from the live function (+ optional `FUNCTIONS_ENV_FILE` secret) → **refuses to deploy with missing or insecure config** (default admin password, weak JWT secret) → deploys → smoke-tests. |
| Triggers (6) | Actions → *Deploy Firebase Functions* → Run workflow → tick *include_triggers*. |
| Customer site + admin + finance | Vercel builds `mimo-website` on push (`npm run build` also builds the admin app into `dist/admin`). |
| Kiosk UI | Vercel builds `mimo-frontend-web-app/mimo-frontend` on push. |
| Office converter | `deploy-converter.yml` on pushes touching `converter/**` (or manually). |
| Legacy image | `backend-image.yml` — frozen, leave alone. |
| Checks | `ci.yml` runs tests/builds for the apps a branch or PR touches; it deploys nothing. |

After a backend deploy the workflow itself verifies `GET /` and `GET /admin/analytics` (401 = new routes are live).

## Testing

```bash
(cd functions && npm test)                                           # unit tests (kiosk contract, rate limiter, analytics, routes)
(cd mimo-website && npm run build)                                   # builds customer app + admin
(cd mimo-frontend-web-app/mimo-frontend && npm run build)            # type-checks and builds the kiosk UI
```

## Security notes

* Never commit `.env`, `serviceAccountKey.json`, or any key (they are git-ignored). Do not paste secrets into issues or chat.
* `JWT_SECRET` **must** be set in production; the code fallback is public.
* The print code is only 4 digits, so lookups are rate-limited (Firestore-backed) — keep `middleware/rateLimit.js` on those routes.
* Work on a feature branch and open a pull request; `main` deploys the API automatically.
* Known follow-ups (not yet changed): `POST /payment-success` trusts the caller instead of verifying with Cashfree; the API
  allows any CORS origin; review credential hygiene (rotation) with the team. See `docs/CRITICAL_ISSUES_ANALYSIS.md`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Dashboard shows an error banner / nothing loads | API unreachable or your session expired — use *Retry*; check `curl https://api-upqxuj7evq-uc.a.run.app/` |
| Machine shows *offline* | The Pi has not written a heartbeat for 5 min: power, Wi-Fi, or `mimo-listener` stopped |
| `401` from the API | Missing/expired JWT — log in again (`POST /admin/login` for admin routes) |
| `429` at the kiosk | Too many wrong print codes from that IP; wait a minute |
| Works locally, not in production | Missing environment variable on the deployed function, or stale Vercel build |
| Admin assets 404 on production | The admin build must use base `/admin/` (already the case for `vite build`) |

## More documentation

| | |
|---|---|
| [`docs/architecture/architecture.md`](docs/architecture/architecture.md) | Full system architecture, data model, analytics design |
| [`functions/README.md`](functions/README.md) | Backend: structure, API, env vars, testing, deploy |
| [`mimo-website/README.md`](mimo-website/README.md) | Customer website |
| [`mimo-website/mimo-admin-dashboard/README.md`](mimo-website/mimo-admin-dashboard/README.md) | Admin + finance portal |
| [`mimo-frontend-web-app/mimo-frontend/README.md`](mimo-frontend-web-app/mimo-frontend/README.md) | Kiosk UI |
| [`docs/deployment/`](docs/deployment) · [`docs/troubleshooting_log.md`](docs/troubleshooting_log.md) | Historical notes (pre-consolidation) |

---

## Credentials (private)

Environment variables and service credentials are shared privately on Google Drive. Never commit them.

📁 **[Environment variables & credentials (Google Drive)](https://drive.google.com/file/d/1VURWsFEovVIUPC2dxNqrPfkcpAye42IU/view?usp=sharing)**
