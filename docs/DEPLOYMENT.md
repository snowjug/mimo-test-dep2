# Deployment Notes

## Service Layout
- `mimo-frontend/MIMO`: Vite storefront on Vercel
- `mimo-backend`: Express backend on Vercel via `api/index.js`
- `mimo-kiosk/mimo-frontend`: Vite kiosk UI on Vercel

## Backend Deployment
- Uses `mimo-backend/vercel.json` to rewrite all requests to `api/index.js`.
- `api/server.js` can run locally or as a Vercel function.
- Required env vars live in `mimo-backend/api/.env.example`.

## Frontend Deployment
- Both Vite apps include a SPA rewrite to `/index.html` so direct route refreshes work.
- Frontend env examples live in the two `.env.example` files.

## Firebase Deployment
- Firestore rules file: `firestore.rules`
- Firebase CLI config: `firebase.json`
- Deploy rules with:

```bash
firebase deploy --only firestore:rules
```

- Apply Storage CORS with:

```bash
gsutil cors set cors.json gs://YOUR_BUCKET
```

## Kiosk Printing
- The kiosk sends a 4-digit PIN to the backend.
- The backend downloads the PDF from Firebase Storage and forwards it to the Raspberry Pi FastAPI print URL.

## Saved Pending Value
- Raspberry Pi IP (saved, not yet applied to runtime config): `10.72.10.61`
