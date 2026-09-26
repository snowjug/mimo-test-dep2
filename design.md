# MIMO — Design

> The **why** and the **conventions** behind the code. For the **what** (components, flows, data) read [`architecture.md`](architecture.md); for setup read the
> [root README](README.md). Statuses used below: **Implemented**, **Partial**, **Planned**, **Unverified** — see the legend in [`architecture.md` §14](architecture.md#14-feature-status-and-unverified-behaviour).

**Contents:** [1 Principles](#1-design-principles) · [2 Responsibilities](#2-application-responsibilities) · [3 Frontends](#3-frontend-design) · [4 Backend](#4-backend-module-organization) ·
[5 Database](#5-database-design-principles) · [6 API](#6-api-conventions) · [7 Auth](#7-authentication-and-authorization) · [8 Job lifecycle](#8-printing-lifecycle-and-job-state) ·
[9 Errors and logging](#9-error-handling-and-logging) · [10 Guidelines](#10-guidelines-for-future-development) · [11 Known deviations](#11-known-deviations-from-these-principles)

## 1. Design principles

1. **One source of truth.** A print job is a single Firestore document. Every component (API, kiosk, Pi, dashboards) reads it and advances its `status`; nobody keeps a private copy of the state.
2. **Pull, don't push.** The API never connects to a Pi. It changes a document and the Pi that owns that kiosk reacts. This removes tunnels and inbound firewall rules and survives restarts.
3. **Thin clients, server-side rules.** Pricing, colour rules, refunds, analytics and state transitions live in `functions/`; the UIs render what the API returns.
4. **Deployment names are contracts.** Exported function names, URLs, folder names, `firebase.json` / `.firebaserc`, and environment-variable names are wired into dashboards this repository cannot change (Vercel, Firebase, Cloud Run). Never rename or move them casually.
5. **No console access assumed.** Design so that nothing needs a manual change in an external dashboard: no composite indexes (single-field queries + in-memory filtering), secrets via environment/Secret Manager, deploys via GitHub Actions.
6. **Fail safe for the customer.** A failed print is refunded automatically; rate limiting fails open; the UI always shows a next step.
7. **Simple over clever.** Plain Express, plain Firestore, small modules, no ORM, no queue. Prefer a readable 30-line function to a framework.

## 2. Application responsibilities

| Application | Owns | Must not |
|---|---|---|
| `functions/` (API + triggers) | Auth, pricing, payments, print codes, job state, refunds, analytics maths, alerts | Talk to a Pi directly; render UI |
| `mimo-website/` | Customer journey: upload → options → pay → code | Compute prices or job states (it displays what the API says) |
| `mimo-admin-dashboard/` | Operations and finance views, refund / pricing / coupon actions | Aggregate data itself (it calls `/admin/analytics` and friends) |
| `mimo-frontend/` (kiosk UI) | Code entry and progress display | Decide whether a job may print (the API does) |
| `pi_scripts/`, `pi-listener/` | Executing the print (CUPS), reporting progress and heartbeat | Decide pricing or refunds (it reports `failed`; a trigger refunds) |
| `converter/` | Office → PDF | Any business logic |
| `LENOVO TABLET APP/` | Locking the tablet to the kiosk page | Anything else |

## 3. Frontend design

### Customer site (`mimo-website/`, React 18 + Vite + Tailwind 4)
* **Routing:** React Router (`src/app/routes.ts`); a `dashboard-layout` shell wraps the authenticated pages. Pages are one file per screen in `src/app/pages/`.
* **Components:** shadcn/Radix-style primitives in `src/app/components/ui/`; feature components sit next to the layout. Keep primitives generic and put behaviour in pages.
* **API access:** one Axios instance (`src/app/api.ts`) that attaches the customer JWT (never on `/admin/*`) and signs the user out on `401/403`.
* **State:** local component state and the browser storage for the token; no global store.
* **Static marketing site:** plain HTML in `public/` (served at `/` and `/landing`), independent of the React app.

### Admin and Finance (`mimo-website/mimo-admin-dashboard/`, React 18 + Vite)
* **Layers (top to bottom):** `pages/` → `components/insights` and `components/ui` → `hooks/useLiveQuery` → `services/insights.service.ts` → `api.ts`. Types for responses live in `types/insights.types.ts`.
* **One shared date range** (`context/RangeContext`) feeds every page; `lib/dateRange.ts` turns it into API parameters (viewer's timezone, ≤ 400 days).
* **Live data:** `useLiveQuery` fetches, polls (30 s, only while visible), cancels stale responses and surfaces errors. Pages must render *loading*, *error with Retry* and *empty* states — never placeholder numbers.
* **Two portals, one bundle:** `App.tsx` picks the Finance portal for `/finance*`, otherwise the Admin dashboard. Each keeps its own token (`financeToken`, `adminToken`).

### Kiosk UI (`mimo-frontend-web-app/mimo-frontend/`, React 19 + Vite)
* A **screen state machine** in `App.tsx` (main → code entry → printing → summary / error / maintenance); screens are presentational components in `components/screens/`.
* The machine identity is a URL parameter (`?kioskId=`) or `VITE_KIOSK_ID`. Colour/festive theming is derived from it.
* It **polls** `/kiosk/job-status` (every ~0.3–0.4 s while printing) rather than using a Firestore listener, so the kiosk needs no Firebase credentials.

## 4. Backend module organization

```
functions/index.js            exports only: api + 6 triggers (names are contracts)
functions/src/server.js       Express app: CORS, JSON parsing, router mounting
        config/               firebase.js (admin init), env.js (reads process.env once)
        middleware/           auth.js (customer / admin JWT), rateLimit.js
        routes/               URL → controller, plus middleware. No logic.
        controllers/          Parse the request, call services / Firestore, shape the response
        services/             Reusable logic with no HTTP knowledge (analytics, converter, whatsapp, email, pdf, storage, printJob)
        triggers/             Firestore + scheduler functions
        validators/           kiosk request / response / state-transition contract
```

Rules of thumb: a route file never contains logic; a controller never builds analytics (call a service); a service never touches `req`/`res`; environment variables are read in `config/env.js` (or a controller for a rarely-used one) and nowhere else in the middle of business code; a new file goes in the layer that matches its job.

## 5. Database design principles

* **Collections are by concept, not by screen:** `users`, `print_jobs`, `orders`, `payment_transactions`, `refunds`, `refund_requests`, `coupons`, `system_status`, `hardware`, `rate_limits`, … (full table in [`architecture.md` §5](architecture.md#5-firestore-data-model)). Names are `snake_case`; a few older ones (`mimo_settings`, `mimo_coin_transactions`) keep their prefix.
* **Money lives in two places on purpose:** `payment_transactions` (Cashfree payments, source of real revenue) and `orders` (also free / discounted orders). Readers merge them by `orderId`; do not "clean up" one without updating the analytics service.
* **Tolerate missing fields.** Older documents pre-date newer fields; readers default instead of failing.
* **Timestamps:** write with server timestamps; store instants, convert to the viewer's calendar at the edge (`tzOffset`).
* **Queries stay index-free:** one range or equality per query, extra filtering in memory, bounded reads (analytics cap 5 000 documents per collection). A query that needs a composite index needs someone with console access — avoid it.
* **Counters:** derive from documents (analytics) rather than maintaining increments, because increments drift when a handler fails or a delivery repeats.
* **Rules and indexes** are versioned in [`firebase/`](firebase/README.md) and deployed by hand; the production rules currently equal the repository copy.
* **Retention:** uploaded files are deleted after completion and swept after 24 h; job documents are kept.

## 6. API conventions

* JSON in, JSON out; errors are `{ "error": "message" }` with a meaningful status (`400` invalid, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict, `429` rate limited, `500` unexpected).
* Routes are flat (no `/v1`); admin routes are prefixed `/admin/`; the kiosk contract lives under `/kiosk/` plus `POST /get-documents-by-code`.
* Authentication by `Authorization: Bearer <JWT>`; webhooks by signature/secret; kiosk endpoints are open but rate limited and validated.
* Read endpoints for dashboards accept `from`, `to` (ISO instants; `to` exclusive), `tzOffset` (minutes ahead of UTC) and `limit`; ranges are validated and capped.
* Handlers are `async` and wrapped in `try/catch`; they always send exactly one response — a path that returns without responding hangs the caller until the platform timeout.
* Adding an endpoint: route line → controller function → (if data-heavy) service function with a unit test → README table row.

## 7. Authentication and authorization

| Actor | Mechanism | Notes |
|---|---|---|
| Customer | JWT `{ userId }`, 30 days | `authMiddleware`; ownership checks in controllers (e.g. `/mark-printed` filters by the caller's `userId`) |
| Admin / finance staff | `POST /admin/login` against `ADMIN_EMAIL` / `ADMIN_PASSWORD`; JWT `{ isAdmin: true }`, 24 h | `adminAuthMiddleware`; one shared login, no per-user accounts (**Planned**) |
| Finance-only login | `FINANCE_EMAIL` / `FINANCE_PASSWORD` → role `finance`, `isAdmin: false` | **Partial** — the token is rejected by `/admin/*` today |
| Kiosk | none; `kioskId` in the body | Rate limited (failed lookups per IP), colour rule enforced per machine |
| Pi | Firebase service-account key (bypasses rules) | Treat the device as a secret holder; `/kiosk/report-failure` also needs `INTERNAL_WEBHOOK_SECRET` |
| Cashfree, Meta | Webhook signature / verify token | Cashfree webhook hardening is in progress (**Partial**) |
| Converter | Cloud Run IAM + `INTERNAL_CONVERTER_SECRET` | Not public |

The API refuses to run admin logic without a real secret in production: the deploy pipeline blocks a default admin password or a weak/public `JWT_SECRET`.

## 8. Printing lifecycle and job state

The allowed transitions are encoded in `functions/src/validators/kioskContract.js` (`ALLOWED_TRANSITIONS`) and enforced on the kiosk routes.

```
pending ─► paid ─► printing ─► completed        (terminal)
   │        │         ├──────► failed ─► refunded   (terminal)
   │        │         └──────► refunded
   │        ├─► refunded / failed / cancelled
   └─► failed / cancelled
```

| Status | Written by | Meaning |
|---|---|---|
| `pending` | `/finalize-upload`, `/create-order` | Uploaded, not paid |
| `paid` | `/verify-payment`, free-order path, Cashfree webhook | Print code issued |
| `printing` | `POST /kiosk/print` | Assigned to one kiosk; the Pi reacts |
| `completed` | Pi listener, `/mark-printed`, kiosk status route | Done (terminal) |
| `failed` | Pi listener, kiosk routes | Printer reported an error |
| `refunded` | `autoRefundJob` trigger, `/admin/refund` | Money returned (terminal) |
| `cancelled` | declared in the contract | Terminal; little used today |
| `abandoned`, `cleaned` | upload flow, retention job | Housekeeping states used by code but **not** in the contract enum |

Design rules: terminal states never regress; only one kiosk may take a job; colour jobs are allowed only at `SV-002`; the Pi is the only writer of print progress (`sheetsCompleted`, `totalSheets`, `printerStatus`); refunds are triggered by the `failed` transition, not by the UI.

## 9. Error handling and logging

* **Backend:** log with a bracketed tag (`[VERIFY-PAYMENT]`, `[REFUND]`, `[STORAGE]`, `[WHATSAPP]`, `[RATE-LIMIT]`, `[WEBHOOK]`, `[EMAIL]`) and `console.error` for failures; return a short `{ error }` to the client and keep details in the logs. Never log tokens, passwords, keys or full request bodies. (Known deviation: the admin-login failure log line still prints the typed credentials — to be removed.)
* **Frontends:** surface the server message when there is one; distinguish *unreachable* (`Network Error`), *not found on an old backend* (`404`) and *server error*; always offer *Retry*.
* **Kiosk:** never leave the user on a dead screen — errors show a countdown back to the home screen; network hiccups retry after 2 s.
* **Recovery:** failed prints are refunded by trigger; the rate limiter fails open; the hourly retention job repairs leftovers; the dashboards' *Incidents* page lists what needs a human.
* **Where to look:** Cloud Run / Cloud Functions logs for `api`; `journalctl -u mimo-listener` on a Pi; the browser console for frontends. See [`docs/deployment/CI_CD.md`](docs/deployment/CI_CD.md) for deploy diagnostics.

## 10. Guidelines for future development

1. **Branch, test, pull request.** Never push to `main` directly — a merge that touches `functions/**` deploys the API. Run `cd functions && npm test` and the relevant build first.
2. **Put code in the layer that matches its job** (§4). Keep `index.js` thin.
3. **Do not break contracts:** function names, URLs, env-variable names, the kiosk request/response shapes (`validators/kioskContract.js`), folder names.
4. **New dashboard number?** Add it to the analytics service (with a test), expose it through an existing `/admin/*` endpoint, add the type and the service call, render loading/error/empty states.
5. **New Pi behaviour?** Change the listener in the correct variant (see [`pi_scripts/README.md`](pi_scripts/README.md) and [`pi-listener/README.md`](pi-listener/README.md)), test on a spare printer, deploy one machine at a time.
6. **No secrets in git** — not in code, docs, tests, logs or screenshots. Use environment variables; ask for the shared credentials file.
7. **Avoid composite indexes and unbounded reads.**
8. **Update the docs in the same pull request**, and label anything you could not verify as *unverified*.
9. **Prefer deleting dead code to commenting it out**, but not the legacy `backend/` until its retirement plan is finished ([`docs/deployment/LEGACY_BACKEND_REMOVAL.md`](docs/deployment/LEGACY_BACKEND_REMOVAL.md)).

## 11. Known deviations from these principles

* The API allows any CORS origin; `POST /payment-success` trusts the caller; Cashfree webhook hardening is in progress.
* `firebase/storage.rules` allows public read/write.
* The Pi listeners are deployed by hand and exist in two variants; the live one per machine is unverified.
* Customer-site pages contain a legacy in-app admin page (`src/app/pages/mimo-admin-dashboard`) that production no longer serves; `company-website/` is a stale copy.
* Some `docs/` files describe the pre-consolidation layout; they carry a *Historical document* banner.
