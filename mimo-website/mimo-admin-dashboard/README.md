# MIMO Admin Dashboard & Finance Portal (`mimo-website/mimo-admin-dashboard/`)

One small Vite app that serves **two portals** from the same bundle. Both read **live, date-filtered data** from the
Cloud Functions API — nothing on screen is hard-coded sample data.

| Portal | URL (prod) | For | Login token key |
|---|---|---|---|
| **Admin dashboard** | `/admin/` (+ `/admin/<tab>`) | Operations: overview, print jobs, machines, incidents, analytics, customers, config | `adminToken` |
| **Finance portal** | `/finance` (+ `/finance/<tab>`) | Money: revenue, transactions, refunds, pricing & coupons, wallet, settlements | `financeToken` |

Both log in with `POST /admin/login` (the `ADMIN_EMAIL` / `ADMIN_PASSWORD` of the API; there are no built-in credentials).

Stack: React 18 · Vite 6 · Tailwind CSS 4 · Recharts · lucide-react · Axios.

## Features that matter

* **Date filter everywhere.** A single date-range picker (Today · Yesterday · Last 7 days · Last 30 days · This month ·
  custom from/to) drives every chart, KPI and table. **Default = today.** Ranges follow *your* calendar (your browser's
  timezone is sent to the API), are capped at 400 days and cannot end in the future.
* **Comparison.** KPIs show the change vs the previous period of the same length; the "Compared with previous period"
  cards show both values side by side.
* **Live.** While the selected range includes today the pages poll the API (every 30 s by default, paused when the tab is hidden)
  and show *"Live · updated 12 s ago"* with a manual refresh. Past ranges are static.
* **Honest empty/error states.** No data → zeros or "—", never invented numbers. A failed request shows an error banner
  with *Retry* (the old behaviour of silently swallowing errors is gone).
* **The two real machines only** — MIMO 1.0 (`CV-001`, B&W) and MIMO 2.0 (`SV-002`, colour). Online/offline comes from each
  Pi's heartbeat (`system_status/<kioskId>`), paper/toner from `hardware/printers`.
* **Session safety.** Only real JWTs are sent; a `401` clears the session and returns you to the login screen.

## Folder structure

```
src/
├── main.tsx · App.tsx               Entry; App picks the Finance portal for /finance*, else the Admin dashboard
├── api.ts                           Axios client (prod = Functions API; dev = VITE_API_URL || http://localhost:3000)
├── lib/
│   ├── dateRange.ts                 Range model, presets, IST-safe API params, chart-bucket labels, % change
│   └── format.ts                    ₹ / number / time formatters
├── hooks/useLiveQuery.ts            Fetch + poll + abort stale + surface errors
├── context/                         RangeContext (shared date range) · ThemeContext · ToastContext
├── services/insights.service.ts     Typed calls to /admin/analytics · transactions · jobs · kiosks · incidents
├── types/                           API response types
├── components/
│   ├── layout/                      AdminLayout · Sidebar · Header (live fleet status, incident badge, alerts bell)
│   ├── auth/                        AdminLoginPage · FinanceLoginPage
│   ├── ui/                          DateRangePicker · LiveIndicator · shared primitives
│   └── insights/InsightBits.tsx     TrendChart · PeriodComparison · Delta · ErrorBanner (used by both portals)
└── pages/
    ├── Overview · Operations · Kiosks · Incidents · Analytics · Users · Configuration
    └── Finance/                     FinanceApp (data layer) · layout/ · components/ · pages/
                                     (Overview · Transactions · Analytics · Refunds · Pricing · Wallet · Settlements)
```

## Where each page gets its data

| Page | Endpoint(s) |
|---|---|
| Overview | `/admin/analytics`, `/admin/kiosks`, `/admin/jobs` |
| Print Operations | `/admin/jobs` (refund action → `POST /admin/refund`) |
| Kiosk Network | `/admin/kiosks` (restock buttons → `POST /admin/hardware`) |
| Incidents | `/admin/incidents`, `/admin/refund-requests`, `POST /admin/refund` |
| Analytics | `/admin/analytics` |
| Customers | `/admin/users` |
| Finance Center (tab) | `/admin/analytics`, `/admin/jobs`, `/admin/refund-requests`, `/admin/settings`, `/admin/coupons` |
| Configuration | `/admin/screensaver` (+ Firebase Storage upload for videos) |
| Finance portal | `/admin/analytics`, `/admin/transactions`, `/admin/refund-requests`, `/admin/settings`, `/admin/coupons`, `/admin/users` (Wallet only) |

Endpoint details: [`functions/README.md`](../../functions/README.md#4-live-admin-analytics-api).

## Run locally

```bash
cd mimo-website/mimo-admin-dashboard
npm install
npm run dev          # http://localhost:5174  (dev server runs at "/", so /finance works too)
```

The API defaults to `http://localhost:3000`, i.e. `npm run dev` in `../../functions`. Point elsewhere with
`VITE_API_URL=http://127.0.0.1:8092 npm run dev`. **In a production build the API URL is fixed** to the Functions API so a
stale build-time variable can never redirect the dashboard.

Type-check (there is no tsconfig checked in): use a temporary config with `strict`, `jsx: react-jsx`, `moduleResolution: bundler`.

## Build & deploy

* This app is **not deployed on its own**. `mimo-website`'s build runs `vite build` here (base `/admin/`) and copies `dist`
  into `mimo-website/dist/admin`. `vercel.json` in `mimo-website/` rewrites `/admin/*` and `/finance/*` to it.
* Because of `base: '/admin/'` the built HTML references `/admin/assets/*`. Do not change `base` without changing the rewrites.

## Adding a page or a metric

1. Need new numbers? Add/extend an endpoint in `functions/src/controllers/adminInsights.controller.js` (maths in
   `services/analytics.service.js`, with a unit test).
2. Add the type in `types/insights.types.ts` and the call in `services/insights.service.ts`.
3. In the page use `useRange()` (shared date range) + `useLiveQuery(() => insights.xxx(current()), [range], { live })`,
   render `ErrorBanner` for `error`, skeletons for `loading`, and put the range picker in the page header.
