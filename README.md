# 🖨️ MIMO V2 — Intelligent Cloud Print Platform

> **MIMO** is a production-grade automated self-service printing platform. Students upload their documents from any device, pay online, walk to a kiosk, enter a 4-digit code, and collect their prints — no USB drives, no queues.

---

## 🔐 Environment Variables & Credentials

> [!IMPORTANT]
> All real API keys, Firebase credentials, and service account secrets are stored on Google Drive.
> **Download them before starting any local development.**
>
> 📁 **[Download Environment Variables (Google Drive)](https://drive.google.com/file/d/1VURWsFEovVIUPC2dxNqrPfkcpAye42IU/view?usp=sharing)**
>
> ⚠️ **NEVER commit `.env` files, `serviceAccountKey.json`, or any raw secrets to GitHub.**

---

## 🏗️ System Architecture — How MIMO Works End to End

```
User Device (Browser)
      │
      ▼
mimo-website (Vite + React)       ◄── Customer uploads docs, pays via Cashfree
      │
      ▼
functions/ (Firebase Cloud Function `api`, Express) ◄── Creates Firestore print job, generates 4-digit code
      │
      ▼
Firestore (Firebase)              ◄── Real-time database; stores print jobs, user accounts
      │
      ▼
Raspberry Pi (pi-listener)        ◄── Python script watches Firestore; triggers CUPS printer
      │
      ▼
CUPS Printer (Physical)           ◄── Brother / Epson prints the document
      │
      ▼
Kiosk Touchscreen (mimo-frontend) ◄── User enters code, watches real-time print progress
```

---

## 📁 Project Folder Structure

```
mimo-test-dep2/
├── functions/                THE backend — Firebase Cloud Functions (`api` + Firestore/scheduler triggers)
│   ├── index.js              Entry point: exports the deployed functions (names/URLs are a contract)
│   ├── src/                  server.js (Express app) · config/ · middleware/ (auth, rateLimit) · routes/
│   │                         controllers/ · services/ · triggers/ · validators/
│   └── __tests__/            Unit tests (`npm test`)
├── mimo-website/             Customer web app (Vite + React) + admin dashboard (mimo-admin-dashboard/) + Capacitor android/
├── mimo-frontend-web-app/
│   └── mimo-frontend/        Kiosk touchscreen UI (Vite + React)
├── LENOVO TABLET APP/        Android kiosk shell (Kotlin WebView) + ADB lock/unlock scripts
├── company-website/          Static company site (copy of mimo-website/public — see docs)
├── converter/                Office→PDF service (LibreOffice, Cloud Run `mimo-office-converter`)
├── pi_scripts/               Pi listener (MIMO 1.0 / CV-001 lineage) + helpers
├── pi-listener/              Pi listener (MIMO 2.0 / SV-002 lineage)
├── mimo-listener*.service  pi_setup.sh  fallback_wifi.sh …   Pi provisioning files
├── scripts/                  One-off tooling, not deployed: deployment/ · diagnostics/ · testing/ (+ testing/fixtures/)
├── backend/                  ⚠️ LEGACY Express server — FROZEN, not the production API (see below)
├── docs/                     architecture/ · deployment/ · setup/ — older notes (several are historical, see banners)
├── firebase.json  .firebaserc  storage.rules
└── .github/workflows/        deploy-functions.yml · deploy-converter.yml · backend-image.yml (legacy image)
```

> **`backend/` is frozen legacy.** Production traffic goes to `functions/`. `backend/` is kept untouched only because an
> external process may still consume its Docker image (`backend-image.yml`); it also holds the Firestore rules/indexes
> (`backend/firestore.rules`, `backend/firebase.json`). Do not add features there. Pi listener file names are unchanged —
> which listener runs on which Pi still needs confirming by hash.

---

## 🌿 Git Branch Guide

| Branch | Owner | Purpose |
|---|---|---|
| `main` | Team | **Production** — all stable, tested code lives here |
| `atharv-changes` | Atharv | Feature development branch |
| `revautsav-android` | Revautsav | Android kiosk app (separate history, Android Studio project) |

> [!TIP]
> As an intern, **always create your own branch** before making changes:
> ```bash
> git checkout -b intern/yourname-feature-name
> ```
> Never push directly to `main`.

---

## 🛠️ Tools You Need to Install First

| Tool | Why You Need It | Download |
|---|---|---|
| **Node.js v18+** | Runs the backend server and all React frontends | [nodejs.org](https://nodejs.org/) |
| **npm** | Installs JavaScript packages (comes with Node.js) | Package |
| **Git** | Version control, cloning this repo | [git-scm.com](https://git-scm.com/) |
| **Python 3.9+** | Run the Raspberry Pi listener scripts locally | [python.org](https://www.python.org/) |
| **Firebase CLI** | Deploy Firestore rules, Firebase Functions | `npm install -g firebase-tools` |
| **VS Code** | Recommended code editor | [code.visualstudio.com](https://code.visualstudio.com/) |
| **Android Studio** | Only if working on `revautsav-android` branch | [developer.android.com](https://developer.android.com/studio) |

---

## 🚀 Step-by-Step Local Setup for New Interns

### Step 1 — Clone the Repo
```bash
git clone https://github.com/visionprintt/Mimo_V2.git
cd Mimo_V2
```

### Step 2 — Get Credentials
1. Open the **[GDrive Environment Variables link](https://drive.google.com/file/d/1VURWsFEovVIUPC2dxNqrPfkcpAye42IU/view?usp=sharing)**
2. Download the zip / file shared
3. Place files in correct locations:
   - `functions/.env` ← Cloud Functions secrets (Firebase deploys read this file; keep the same variable names)
   - `backend/.env` ← legacy Express server only
   - `backend/serviceAccountKey.json` or project root ← Firebase Admin SDK (used by ad-hoc scripts in `scripts/`)

### Step 3 — Install Dependencies

```bash
(cd functions && npm install)                                # backend (Cloud Functions)
(cd mimo-website && npm install)                             # customer app + admin build
(cd mimo-frontend-web-app/mimo-frontend && npm install)      # kiosk UI
```

### Step 4 — Run

```bash
(cd functions && npm test)                                   # unit tests
(cd mimo-website && npm run dev)                             # http://localhost:5173
(cd mimo-frontend-web-app/mimo-frontend && npm run dev)      # http://localhost:5174
```

The backend is a Firebase Cloud Function, so there is no `npm start`. Frontends call the deployed API
(`https://api-upqxuj7evq-uc.a.run.app`) unless `VITE_API_URL` is set in dev.

---

## 🌐 Live Production URLs

| Service | URL |
|---|---|
| Customer Web App | [https://printmimo.tech](https://printmimo.tech) |
| Landing Page | [https://printmimo.tech/landing](https://printmimo.tech/landing) |
| Admin Dashboard | [https://printmimo.tech/admin](https://printmimo.tech/admin) |
| Kiosk SV-002 | [https://mimo-2-0.vercel.app/?kioskId=SV-002](https://mimo-2-0.vercel.app/?kioskId=SV-002) |
| Kiosk CV-001 | [https://mimo-frontend-three.vercel.app/?kioskId=CV-001](https://mimo-frontend-three.vercel.app/?kioskId=CV-001) |
| Backend Cloud API | [https://api-upqxuj7evq-uc.a.run.app](https://api-upqxuj7evq-uc.a.run.app) |

---

## 🖥️ Physical Kiosk Hardware (Production)

Two physical kiosk stations are running in production:

| Kiosk ID | Name | Tailscale IP | B&W Printer | Color Printer |
|---|---|---|---|---|
| **SV-002** | MIMO 2.0 | `100.107.95.16` | Brother HL-L2440DW | Epson L3250 |
| **CV-001** | MIMO 1.0 | `100.70.107.44` | Brother HL-L5210DN | — |

Each kiosk has a **Raspberry Pi** running a `firebase_listener.py` (from `pi_scripts/` or `pi-listener/`) as a systemd service (`mimo-listener`). The Pi watches Firestore for new `"printing"` status jobs assigned to its `kioskId`.

---

## ❓ Intern FAQs

### Q: What happens when a user pays and enters the print code at the kiosk?

1. User pays via Cashfree on `mimo-website` → backend creates a Firestore doc in `/printJobs/{jobId}` with status `"paid"` and a `printCode`.
2. User walks to kiosk, enters the 4-digit `printCode` on `NumpadScreen.tsx`.
3. Kiosk calls `/kiosk/start-print` → backend verifies code → updates Firestore status to `"printing"`.
4. The **Raspberry Pi's `firebase_listener.py`** detects the Firestore status change.
5. Pi downloads the PDF via signed URL → calls `lpr` to send it to the CUPS printer.
6. Kiosk polls Firestore every 2s and shows a live progress bar on `PrintingScreen.tsx`.
7. Pi sets status to `"completed"` → kiosk shows 100% and success screen.

---

### Q: What is Cashfree? Why do we use it?

**Cashfree** is an Indian payment gateway (like Stripe for India). We use it because:
- Supports UPI, Cards, NetBanking
- Has a proper refund API (important — if printing fails, we auto-refund!)
- Required env vars: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`

---

### Q: What is Firestore? How does real-time sync work?

**Firestore** is Google's NoSQL cloud database. It supports **real-time listeners** — when data changes, all connected clients are instantly notified without polling.

We use it to:
- Store print jobs (`/printJobs`)
- Store user accounts (`/users`)
- Store kiosk settings, pricing, and coupon codes

The Pi listener uses `firebase-admin` Python SDK to watch for status changes.

---

### Q: What is Tailscale? Why do the Raspberry Pis use it?

**Tailscale** creates a secure private VPN network between our backend server and the Raspberry Pis. Without it, the Pis would need public IPs (expensive & insecure). With Tailscale:
- The Pi has a private IP like `100.107.95.16`
- The backend can SSH or send HTTP requests directly to the Pi
- No firewall rules needed

---

### Q: What is CUPS? Why does it matter?

**CUPS** (Common Unix Printing System) is the Linux printing daemon running on the Raspberry Pi. It manages printer queues and handles `lpr` print commands.

Common CUPS commands used in our system:
```bash
lpstat -p                          # Check printer status
sudo cupsenable <printer_name>     # Enable a disabled printer
sudo cupsaccept <printer_name>     # Allow printer to accept jobs
sudo cancel -a <printer_name>      # Cancel all stuck jobs in queue
lpr -P <printer_name> file.pdf     # Send PDF to printer
```

---

### Q: I got a `401 Unauthorized` error calling the API. Why?

All admin and kiosk API endpoints require a **JWT Bearer token** in the `Authorization` header. Get a token by calling:
```
POST /admin/login
{ "email": "admin@email.com", "password": "..." }
```
Then add `Authorization: Bearer <token>` to every subsequent request.

---

### Q: How do I add a new API endpoint?

Add the handler to the matching file in `functions/src/controllers/`, then map it in `functions/src/routes/`
(routers are mounted from `functions/src/server.js`). Shared logic goes in `services/`, auth in `middleware/auth.js`.
Code-guessing endpoints use `middleware/rateLimit.js` (Firestore-backed, shared across instances).

---

### Q: How do I deploy backend changes to production?

Pushes to `main` that touch `functions/**` deploy the `api` function via `.github/workflows/deploy-functions.yml`
(`firebase deploy --only functions:api`). The Firestore/scheduler trigger functions are **not** deployed by CI.
CI has no environment step: `functions/.env` (or values already set on the function) supplies the env vars.

---

### Q: My changes work locally but not in production — why?

Common causes:
1. **Missing env variable on production** — check the function's environment config (`functions/.env` at deploy time).
2. **Firestore security rules blocking the request** — check `firestore.rules`.
3. **CORS** — the function allows any origin (`cors({ origin: true })`); look at request headers/auth instead.
4. **Old build cached** — hard refresh or clear Vercel deployment cache.

---

## 🔒 Security Rules for All Interns

1. ❌ **Never commit `.env` files** — they are in `.gitignore` for a reason.
2. ❌ **Never commit `serviceAccountKey.json`** — this gives full Firebase admin access.
3. ✅ **Always create a feature branch** before coding: `git checkout -b intern/name-feature`
4. ✅ **Open a Pull Request** (PR) against `main`, don't push directly.
5. ✅ **Use `.env.example`** to document any new environment variable you add.
6. ✅ **Test locally before pushing** — run `npm run build` to catch errors.

---

## 🔧 Useful Commands Quick Reference

```bash
# Check the deployed API is up
curl https://api-upqxuj7evq-uc.a.run.app/

# Deploy Firestore rules only
firebase deploy --only firestore:rules --config backend/firebase.json --project mimo-v2-11868

# View Pi listener logs (on Raspberry Pi)
sudo journalctl -u mimo-listener -f

# Restart Pi listener service
sudo systemctl restart mimo-listener

# Check CUPS printer queue
lpstat -p -d

# Build kiosk frontend for production
cd mimo-frontend-web-app/mimo-frontend
npm run build
```

---

## 📞 Who to Contact

If you're stuck or have questions about the codebase, check with your team lead. This README covers 90% of what you need to get started — the remaining 10% is in the code comments!
