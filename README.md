# MIMO Test Dep2

This repository contains the MIMO printing platform split into three parts:

- `backend/` - Node.js and Express API with Firebase Admin, Firestore, and Cashfree payment handling.
- `mimo-website/` - Main Vite + React web app for the customer experience.
- `mimo-frontend-web-app/mimo-frontend/` - Kiosk-style Vite + React app for printing and device flows.

## Project Overview

The system supports user login, payment verification, print job creation, and kiosk-based printing workflows.

Key backend responsibilities include:

- authentication and session handling
- payment order creation and verification
- Firestore reads and writes
- print job lifecycle updates
- webhook handling for payment confirmation

## Folder Structure

```text
backend/
mimo-website/
mimo-frontend-web-app/mimo-frontend/
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
