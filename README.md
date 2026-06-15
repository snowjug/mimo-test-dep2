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
**Production Hardening (v2.0):**
- **Async File Processing:** Document uploads now instantly queue as `pending_conversion` instead of blocking Node.js, resolving Out-of-Memory crashes.
- **Frontend Polling:** UI gracefully holds upload progress at 99% until the background worker completes file parsing.
- **Direct PDF Streaming:** Kiosk PDF downloads use Node.js `ReadStreams` bypassing RAM buffers entirely.
- **In-Memory Cache:** 200MB maximum LRU Cache stores recent Kiosk PDFs ensuring fast downloads while strictly preventing memory leaks.
- **Mimo Coins & Print History:** Fully functional backend integration for displaying previous prints and managing virtual currency. Print History gracefully filters and maps data in-memory to bypass Firebase composite index limits.
- **Profile Enhancements:** Added secure profile photo uploads directly to Firebase Storage using long-lived Signed URLs.
- **Kiosk UI Polish:** Replaced the bulky full-screen loading overlay with a sleek, inline button spinner on the numpad screen.
- **Brute Force Protection:** Rate limiters added to Kiosk API endpoints (20 req/min).
- **Index Optimization:** Re-architected backend queries for Server-Sent Events (SSE) and history to filter in-memory, completely removing the need for strict composite indexes.
- **Hardware Integration (Pi Architecture):** The Node backend dynamically supports both Firebase Listener "Pull" architectures (for the Old Pi) and FastAPI "Push" mechanisms (for the New Pi).
- **Permanent Pi Tunnel (ngrok):** Replaced unreliable temporary tunnels and Tailscale conflicts with a permanent ngrok static domain configuration, auto-starting via systemd on the Pi for 100% uptime.
- **E2E Stability:** Fixed frontend React crashes on payment failure and implemented strict error handling in the background PDF processor to prevent infinite retry loops on corrupted uploads.
- **Production Payments:** Fully integrated Cashfree Production APIs for live order creation and automatic refunds on hardware failure.

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
