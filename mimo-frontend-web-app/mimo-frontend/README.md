# MIMO Kiosk App (`mimo-frontend-web-app/mimo-frontend/`)

The touchscreen UI shown on each MIMO kiosk. A student walks up, types the **4-digit print code** from the website, watches
live progress and collects the printout. It runs full-screen inside the Android kiosk shell (`LENOVO TABLET APP/`) or a
browser in kiosk mode.

| | |
|---|---|
| Production | Vercel. MIMO 1.0: `https://mimo-frontend-three.vercel.app/?kioskId=CV-001` · MIMO 2.0: `https://mimo-2-0.vercel.app/?kioskId=SV-002` |
| Stack | React 19 · Vite 8 · TypeScript |
| Talks to | Cloud Functions API `https://api-upqxuj7evq-uc.a.run.app` |
| Machine identity | `?kioskId=CV-001` (MIMO 1.0) or `?kioskId=SV-002` (MIMO 2.0) in the URL, or `VITE_KIOSK_ID` at build time |

## How a print works

```
CodeEntryScreen  → POST /get-documents-by-code {printCode, kioskId}   (validates the code, colour/B&W rules per machine)
                 → POST /kiosk/print           {printCode, kioskId}   (job becomes "printing" for THIS kiosk)
PrintingScreen   → GET  /kiosk/job-status?printCode=…  every ~4 s     (progress, done, or failed)
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
