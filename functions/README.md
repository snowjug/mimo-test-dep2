# MIMO Backend (`functions/`)

The one and only production backend of MIMO. It is an **Express 5 app running as a Firebase Cloud Function (2nd gen)**
plus a handful of Firestore/scheduler triggers. Everything the customer site, the kiosk, the admin dashboard, the
finance portal and the Raspberry Pis need from a server lives here.

| | |
|---|---|
| Runtime | Node.js 20 · Firebase Functions v2 · Express 5 |
| Public URL | `https://api-upqxuj7evq-uc.a.run.app` (function `api`, region `us-central1`) |
| Project | Firebase project `mimo-v2-11868` |
| Data | Firestore + Cloud Storage (Firebase Admin SDK) |
| Payments | Cashfree (orders, webhook, refunds) |
| Entry point | `index.js` (**names and URLs of exported functions are a deployment contract — never rename them**) |

> The old Express server in `../backend/` is **frozen legacy** and is not the production API.

---

## 1. Folder structure

```
functions/
├── index.js                     Entry point: exports `api` + all triggers (keep it this thin)
├── dev.js                       Local dev server (`npm run dev`, port 3000) — not deployed logic
├── package.json / package-lock.json
├── __tests__/                   Unit tests (node:test) — run with `npm test`
└── src/
    ├── server.js                Builds the Express app: CORS, body parsing, mounts routers
    ├── config/
    │   ├── firebase.js          Firebase Admin init → exports `admin`, `db`
    │   └── env.js               Reads process.env once (JWT secret, Cashfree, WhatsApp, converter URL…)
    ├── middleware/
    │   ├── auth.js              authMiddleware (customer JWT) · adminAuthMiddleware (admin JWT)
    │   └── rateLimit.js         Firestore-backed limiter that protects the 4-digit print code
    ├── routes/                  URL → controller maps only (no logic)
    │   ├── auth · user · upload · payment · print · public · admin · whatsapp
    │   └── kiosk.routes.js      /kiosk/* (kiosk ⇄ backend contract, validated by validators/)
    ├── controllers/             Request handlers, one file per area
    │   └── adminInsights.controller.js   Live admin analytics (see §4)
    ├── services/                Reusable logic
    │   ├── analytics.service.js Pure aggregation maths for the admin/finance dashboards
    │   ├── converter.service.js Calls the private Office→PDF Cloud Run service
    │   ├── whatsapp.service.js  WhatsApp Cloud API sending + the chat state machine
    │   └── email.service.js · pdf.service.js · printJob.service.js · storage.service.js
    ├── triggers/                Firestore / scheduler triggers (not HTTP)
    │   ├── printJob.triggers.js autoRefundJob, autoCleanupStorageJob, sendFailureNotification,
    │   │                        printerHardwareNotification, colourPaperUsageNotification
    │   └── retention.trigger.js scheduledFileRetentionCleanup (hourly)
    └── validators/kioskContract.js   Request/response/state-transition validation for /kiosk/*
```

Rule of thumb: **routes** wire URLs, **controllers** talk HTTP, **services** hold reusable logic, **triggers** react to
Firestore. Add code to the file that matches its job instead of growing `index.js`.

## 2. Run it locally

```bash
cd functions
npm install
# create functions/.env with the variables from §5 (the values are shared privately, see the root README)
npm run dev                    # http://localhost:3000  (loads .env, serves the same Express app)
npm test                       # unit tests
```

* `dev.js` initialises Firebase with the credentials in `.env` if `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL`
  are present (see `src/config/firebase.js`), otherwise it uses Application Default Credentials.
* ⚠️ Local credentials point at the **real** Firestore. Prefer the Firestore emulator
  (`firebase emulators:start --only firestore` with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`) when you experiment.
* ⚠️ `FIREBASE_*` and `PORT` are reserved names on Cloud Functions. Keep them in your local `.env` only if you never run
  `firebase deploy` from this folder with that file present (the deploy would be rejected).
* The `firebase emulators:start --only functions` runner may fail to load with firebase-functions v7 on some firebase-tools
  versions; `npm run dev` is the supported local path.

## 3. API overview

Auth types: **public**, **user** (customer JWT in `Authorization: Bearer`), **admin** (admin JWT with `isAdmin`).

| Area | Routes |
|---|---|
| Auth | `POST /register` · `POST /login` · `POST /google-login` · `POST /onboarding` (user) |
| Profile | `GET/PUT /profile` · `GET /mimo/user` · `GET /mimo/coins` · `GET /mimo/stats` · `GET /print-history` · `GET/POST /settings` · `POST /upload-profile-photo` (multipart, `photo` field) — all user |
| Upload | `POST /finalize-upload` · `POST /generate-text-pdf` · `POST /create-blank-job` · `DELETE /remove-file` — user |
| Payment | `POST /create-order` (user) · `GET /verify-payment/:orderId` · `POST /cashfree-webhook` (Cashfree signature) · `POST /check-status` · `POST /payment-success` (user) · `POST /request-refund` (user) |
| Print code | `POST /get-documents-by-code` (rate-limited) · `GET /generate-print-code` · `GET /print-summary` · `POST /mark-printed` (user, own jobs only) |
| Kiosk | `GET /kiosk/job-status` (rate-limited) · `POST /kiosk/print` (rate-limited) · `POST /kiosk/report-failure` |
| Public | `GET /validate-coupon/:code` · `GET /api/settings` · `GET /api/screensaver` |
| WhatsApp | `GET/POST /whatsapp-webhook` · `GET /wa-pay/:orderId` · `GET /wa-pay-success/:orderId` |
| Admin | `POST /admin/login` · coupons (`GET/POST /admin/coupons`, `POST /admin/coupons/bulk`, `DELETE /admin/coupons/:code`) · `GET/POST /admin/settings` · `GET/POST /admin/screensaver` · `GET/POST /admin/hardware` · `GET /admin/metrics` · `POST /admin/reset-metrics` · `GET /admin/recent-prints` · `GET /admin/users` · `POST /admin/refund` · `GET /admin/refund-requests` |
| Admin (live analytics) | `GET /admin/analytics` · `GET /admin/transactions` · `GET /admin/jobs` · `GET /admin/kiosks` · `GET /admin/incidents` — see §4 |

The authoritative list is the `src/routes/` folder.

## 4. Live admin analytics API

Powers the admin dashboard and the finance portal. All are `GET`, admin-only, read-only.

**Common query parameters**

| Param | Meaning | Default |
|---|---|---|
| `from` | Start instant (ISO 8601, inclusive) | start of today |
| `to` | End instant (ISO 8601, exclusive) | `from` + 24 h |
| `tzOffset` | Viewer's minutes **ahead of UTC** (IST = `330`) — day/hour buckets and "today" follow it | `330` |

Ranges are limited to 400 days. Up to 2 days → hourly buckets, longer → daily buckets. Invalid input returns `400`.

| Endpoint | Returns |
|---|---|
| `/admin/analytics?compare=1` | `current` and `previous` summaries (revenue, refunds, net, orders, pages, success rate, new users…), a gap-free `series`, `byKiosk`, `byPaymentMethod`, `byStatus`, `modes` (colour/duplex), `byHour` |
| `/admin/transactions?status=&limit=` | One row per order (orders ∪ payment_transactions merged by `orderId`) with method, gross, discount, kiosk, customer |
| `/admin/jobs?status=&kioskId=&limit=` | Print jobs created in the range |
| `/admin/kiosks` | Live status of every machine: heartbeat, online/offline (5 min window), printer status, paper/toner, queue, activity in the range |
| `/admin/incidents` | Open incidents: kiosk offline, paper/toner low, failed prints (in range), pending refund requests |

Design notes (see `src/services/analytics.service.js`):

* **Revenue** = paid orders (status `PAID`/`SUCCESS`/`REFUNDED`); Cashfree payments live in `payment_transactions`,
  free/fully-discounted orders in `orders`. **Refunds** come from `refundStatus === "SUCCESS"`, `status === "REFUNDED"` or
  the `refunds` collection.
* The two real machines (`CV-001` MIMO 1.0, `SV-002` MIMO 2.0) are always listed; any other `XX-000`-style id that sends a
  heartbeat is added automatically. Legacy docs such as `system_status/pi` are ignored.
* **No composite Firestore indexes are required**: every query is a single-field range/equality; extra filtering happens
  in memory. Keep it that way — creating indexes needs console access.
* Queries are capped at 5,000 documents per collection; responses set `truncated: true` beyond that.

## 5. Environment variables

Read in `src/config/env.js` and a few controllers. **Names are a contract with the deployed function; do not rename.**
Firebase loads `functions/.env` at deploy time. The repo never contains values.

| Variable | Used for |
|---|---|
| `JWT_SECRET` | Signs/verifies customer and admin tokens (**must be set in production** — the code default is public) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The admin/finance login (`POST /admin/login`); login is disabled when unset |
| `GOOGLE_CLIENT_ID` | Google sign-in audience |
| `CASHFREE_ENV`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | Cashfree (`CASHFREE_ENV=production` for live) |
| `CONVERTER_SERVICE_URL`, `INTERNAL_CONVERTER_SECRET` | Private Office→PDF converter (Cloud Run) |
| `INTERNAL_WEBHOOK_SECRET` | Shared secret for `/kiosk/report-failure` |
| `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN` | WhatsApp Cloud API |
| `GMAIL_APP_PASSWORD` | Alert e-mails (also bound as a Secret Manager secret on the triggers) |
| `PI_BASE_URL`, `PRINTER_NAME` | Legacy Pi push mode (unused by the Firestore-listener flow) |

Local-only: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `STORAGE_BUCKET`.

## 6. Print-code protection (rate limiting)

A 4-digit code is guessable, so the endpoints that accept one (`/get-documents-by-code`, `/kiosk/print`,
`/kiosk/job-status`) use `middleware/rateLimit.js`: a limiter shared across all function instances through Firestore
(`rate_limits/{scope}_{sha256(ip)}`), counting **only failed lookups** (404/409): 5/min + 20/h for code entry,
20/min + 100/h for status polling. It answers `429` with `Retry-After`, fails open if Firestore is unavailable, and
cleans up stale counters itself (no TTL setup needed).

## 7. Testing

```bash
npm test          # 50+ unit tests: kiosk contract, rate limiter, analytics maths, ported routes
```

Manual checks worth doing after a change: hit the route with no token (401), with a customer token on an admin route
(403), and with an admin token. Against the Firestore emulator you can seed data and compare
`/admin/analytics` totals with hand-calculated numbers.

## 8. Deploying

Push to `main` (touching `functions/**`) → `.github/workflows/deploy-functions.yml` runs the tests, builds `functions/.env`
from the live function's variables (+ optional `FUNCTIONS_ENV_FILE` secret), **stops if required variables are missing or
insecure** (default admin password, weak `JWT_SECRET`), deploys `functions:api` and smoke-tests it. Rollback: run the workflow with an older `ref`. Full description:
[`docs/deployment/CI_CD.md`](../docs/deployment/CI_CD.md).

* The six **triggers** are **not** deployed on push (manual opt-in): four run in `asia-south1` live while the code has no region, so a deploy would create duplicates. See `CI_CD.md` §6.
* Manual deploy from a laptop still works: put the real `.env` in `functions/` (without the `FIREBASE_*` lines, Firebase rejects them).
* Rolling back = `git revert` and let CI redeploy.

## 9. Conventions

* Keep `index.js` thin; never rename exported function names.
* New endpoint: controller function → route line → (if it reads lots of data) put the maths in `services/` and unit test it.
* Return `{ error: "message" }` with a proper status code; log details with `console.error`, never secrets.
* Do not read secrets from anywhere except `config/env.js` / `process.env`.
