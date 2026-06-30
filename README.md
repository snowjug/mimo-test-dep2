# MIMO V2

This repository contains the MIMO printing platform split into three parts:

- `backend/` - Node.js and Express API with Firebase Admin, Firestore, and Cashfree payment handling.
- `mimo-website/` - Main Vite + React web app for the customer experience.
- `mimo-frontend-web-app/mimo-frontend/` - Kiosk-style Vite + React app for printing and device flows.

## Branch Overview

| Branch | Description |
|---|---|
| `main` | Production branch — MIMO web platform (backend + frontend + Pi listeners) |
| `atharv-changes` | Feature branch synced with main |
| `madhan` | Feature branch synced with main |
| `revautsav-android` | **Android kiosk app (REVAUTSAV)** — isolated orphan branch, no shared history with `main` |

## Project Overview

The system supports user login, payment verification, print job creation, and kiosk-based printing workflows.

## Hardware Topology & Kiosk Configurations

The platform coordinates printing operations across two physical Kiosk stations:

### 1. Kiosk CV-001 (MIMO 1.0)
- **Configuration Host:** `printpi@printpi`
- **Supported Printers:**
  - `Brother_HL_L5210DN_series_USB` (Monochrome, supports Duplex/double-sided printing)
- **Key Details:** Served as a high-speed black and white print kiosk.

### 2. Kiosk SV-002 (MIMO 2.0)
- **Configuration Host:** `pi@pi`
- **Supported Printers:**
  - `Brother_HL_L2440DW_series` (Monochrome, supports Duplex/double-sided printing)
  - `Epson_L3250` (Color printing)
- **Key Details:** All color print jobs in the system are automatically routed by the backend to this kiosk (`SV-002`) to print on the Epson color printer.


## Live Deployments

- **Main Frontend URL**: https://printmimo.tech (or https://www.printmimo.tech)
- **Company Landing Page**: https://printmimo.tech/landing
- **Kiosk URL**: https://kisokmechine.vercel.app/

Key backend responsibilities include:

- authentication and session handling
- payment order creation and verification
- Firestore reads and writes
- print job lifecycle updates
- webhook handling for payment confirmation

## Recent Features & Optimizations

### 🛡️ Production Hardening & Reliability (v2.0)
- **Automatic Payment Refunds**: Deployed a secure, serverless auto-refund hook. When a physical print fails on the Pi (out of paper, disconnected, CUPS/conversion error), it calls `/kiosk/report-failure` to immediately trigger a Cashfree API refund, and displays a user-friendly pulsing **"💚 Refund in Progress"** status screen.
- **Robust Multi-File State Syncing**: The user upload dashboard now dynamically syncs with Firestore and session storage. Deleting a file in the UI calls `/finalize-upload` to remove its document in Firestore, avoiding ghost charges, and session storage is auto-cleared on checkout popstate to prevent completed files from leaking into new sessions.
- **Re-entered Code Detection**: Improved NumPad validation. Re-entering a print code that has already printed/refunded now queries Firestore history to display a clear `"Print code already used"` error instead of a generic 404 page.
- **Async File Processing**: Document uploads now instantly queue as `pending_conversion` instead of blocking Node.js, resolving Out-of-Memory crashes.
- **Direct PDF Streaming**: Kiosk PDF downloads use Node.js `ReadStreams` bypassing RAM buffers entirely.
- **In-Memory Cache**: 200MB maximum LRU Cache stores recent Kiosk PDFs ensuring fast downloads while strictly preventing memory leaks.
- **Mimo Coins & Print History**: Fully functional backend integration for displaying previous prints and managing virtual currency. Print History gracefully filters and maps data in-memory to bypass Firebase composite index limits.
- **Profile Enhancements**: Added secure profile photo uploads directly to Firebase Storage using long-lived Signed URLs.
- **Brute Force Protection**: Rate limiters added to Kiosk API endpoints (20 req/min).

### ⚡ High-Speed Print & Performance Wins
- **Parallel Document Downloads**: Refactored the Pi's `firebase_listener.py` to use a `ThreadPoolExecutor` to download files in parallel rather than sequentially, slicing wait times for multi-document print jobs.
- **Instant Printer Spooling**: Reduced the local `lpstat` printer online check timeout from 5s to 2s, allowing the printer to wake up and spool print jobs near-instantly.
- **300 DPI High-Speed Rendering**: Customized the Brother printer's PPD configuration file (`/etc/cups/ppd/Brother_HL_L5210DN_series.ppd`) on CV-001 to render at 300 DPI (down from the default 600 DPI). This reduced processed bitmap sizes by **4x**, cutting CPU rasterizing and USB spool times to **under 8 seconds**.
- **Bypassed CPU-Heavy Pre-Compression**: Disabled slow on-Pi PDF pre-compression (which spooled through Ghostscript on the weak Pi CPU), allowing raw optimized PDFs to feed directly to the printer spooler.
- **Kiosk Progress Fast-Finish**: Optimized the NumPad print progress bar to fast-finish (10ms per percent) the moment CUPS signals print success, letting users retrieve their papers without waiting on fake animations.

## Folder Structure

```text
backend/
mimo-website/
mimo-frontend-web-app/mimo-frontend/
docs/
```

## Local Setup

### Backend

```bash
cd backend
npm install
npm start
```

Useful backend scripts:

- `npm start` - run the Express server
- `npm run seed:firestore` - seed Firestore collections

### Main Website

```bash
cd mimo-website
npm install
npm run dev
```

Build:

```bash
npm run build
```

### Kiosk Frontend

```bash
cd mimo-frontend-web-app/mimo-frontend
npm install
npm run dev
```

Build:

```bash
npm run build
```

### Android Kiosk App (REVAUTSAV)

The Android app lives on the `revautsav-android` branch (orphan — no shared history with `main`).

```bash
# Switch to the Android branch
git checkout revautsav-android
```

Open the project in **Android Studio** and build/deploy to the kiosk device.
Refer to `KIOSK_GUIDE.md` and `ADB_Commands.md` in that branch for full setup and ADB commands.

## Environment Variables

The backend expects Firebase and payment credentials in `backend/.env`.

Important values include:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `JWT_SECRET`
- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `FRONTEND_URL`

Do not commit secrets to the repository.

## Firebase

The repo includes Firebase configuration files in `backend/`:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `.firebaserc`

Deploy Firestore rules and indexes from the `backend/` directory:

```bash
firebase deploy --only firestore:rules,firestore:indexes --config firebase.json --project mimo-v2-11868
```

## Notes

- The main website uses SPA routing, so direct route reloads should be handled by Vercel rewrites.
- Firestore seeding requires a service account with write permissions for the `mimo-v2-11868` project.
