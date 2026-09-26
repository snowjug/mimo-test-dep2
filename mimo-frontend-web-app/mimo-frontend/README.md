# MIMO Kiosk App (`mimo-frontend-web-app/mimo-frontend/`)

The touchscreen UI shown on each MIMO kiosk. A student walks up, types the **4-digit print code** from the website, watches
live progress and collects the printout. It runs full-screen inside the Android kiosk shell (`LENOVO TABLET APP/`) or a
browser in kiosk mode.

| | |
|---|---|
| Production | Vercel. MIMO 1.0: `https://mimo-frontend-three.vercel.app/?kioskId=CV-001` · MIMO 2.0: `https://mimo-2-0.vercel.app/?kioskId=SV-002`. The Android tablets load `mimo-kiosk-app.vercel.app` (constant in the shell app); which Vercel project serves which domain is set in Vercel and **unverified** |
| Stack | React 19 · Vite 8 · TypeScript |
| Talks to | Cloud Functions API `https://api-upqxuj7evq-uc.a.run.app` — **hard-coded** in `src/App.tsx`, `PrintingScreen.tsx` and `components/screens/adds/Adds.tsx` (no environment variable) |
| Machine identity | `?kioskId=CV-001` (MIMO 1.0) or `?kioskId=SV-002` (MIMO 2.0) in the URL, or `VITE_KIOSK_ID` at build time |

## How a print works

```
CodeEntryScreen  → POST /get-documents-by-code {printCode, kioskId}   (validates the code, colour/B&W rules per machine)
                 → POST /kiosk/print           {printCode, kioskId}   (job becomes "printing" for THIS kiosk)
PrintingScreen   → GET  /kiosk/job-status?printCode=…  every ~0.3–0.4 s (progress, done, or failed)
                   ▲ the Raspberry Pi listener sees status "printing" in Firestore, prints via CUPS,
                     and writes progress / "completed" / "failed" back
```

* Colour jobs are only accepted on `SV-002`; both machines accept black & white.
* Wrong codes are counted by a server-side rate limiter (5 failures/min); the kiosk shows the server's message.
* If a print fails, the server refunds automatically and the kiosk shows the refund banner.

## Structure

```
src/
├── App.tsx                         Screen state machine (main → code entry → printing → summary / error / maintenance)
│                                   and the /get-documents-by-code + /kiosk/print calls
├── components/screens/             MainScreen · CodeEntryScreen · PrintingScreen · SummaryScreen ·
│                                   SystemErrorScreen · MaintenanceScreen · adds/ (idle screensaver)
├── config/festivalConfig.ts        Seasonal theme switches
└── assets/, public/                Backgrounds, logos, PWA manifest
```

## Run locally

```bash
cd mimo-frontend-web-app/mimo-frontend
npm install
npm run dev      # http://localhost:5173 — open with ?kioskId=CV-001
npm run build    # tsc -b && vite build
```

`vite.config.ts` uses `base: './'` so the bundle works from any path (Vercel, or a file:// WebView).

## Deploy

Vercel builds this folder (project settings live in the Vercel dashboard, not in this repo; the two kiosk URLs above are the deployments the tablets load).
**Do not move or rename this folder** without updating that setting. After a deploy, the Android kiosk picks up the new
version on its next reload.

## Related

* `LENOVO TABLET APP/` — Kotlin WebView shell that locks the tablet into kiosk mode and loads the URL above.
* `pi_scripts/` and `pi-listener/` — the Raspberry Pi programs that do the actual printing.
* API contract: [`functions/README.md`](../../functions/README.md) and `functions/src/validators/kioskContract.js`.

## Status, known issues and safety

| | |
|---|---|
| **Implemented** | Code entry, live progress, summary, refund banner, error and maintenance screens, screensaver (config read from Firestore, falling back to `GET /api/screensaver`), per-machine theming |
| **Known issue** | ⚠ The API address is hard-coded to **production**. `npm run dev` therefore talks to the live API: wrong codes count against the rate limiter and a *real* print code would start a *real* print. To develop against a local backend, change the three constants locally (`http://localhost:3000`) and **never commit that change**. |
| **Unverified** | `npm run lint` (ESLint) exists but was not run in the documentation audit; there are no automated tests. |

## Dependencies and environment
`react`, `react-dom`; dev: Vite, TypeScript, ESLint. Only variable: `VITE_KIOSK_ID` (optional; the URL parameter `?kioskId=` wins). No secrets.

## Testing and checks
`npm run build` (type-check with `tsc -b`, then Vite build) is the check used in CI. Manual test: open `http://localhost:5173/?kioskId=SV-002` and walk through the screens with your browser's device emulation set to a landscape tablet size.

## Troubleshooting
| Symptom | Cause |
|---|---|
| "Kiosk ID not configured" | URL has no `?kioskId=` and `VITE_KIOSK_ID` is unset |
| "Too many attempts" | Rate limiter (failed lookups per IP) — wait a minute |
| "Color print… only at Machine 2" | Colour job entered at CV-001 (intended) |
| Progress stays at "Warming up printer…" | The Pi has not picked the job up: see [`pi_scripts/README.md`](../../pi_scripts/README.md) |

Related: [`architecture.md` §4.2](../../architecture.md#42-at-the-kiosk) · [`design.md` §3](../../design.md#3-frontend-design) · [`../README.md`](../README.md).
