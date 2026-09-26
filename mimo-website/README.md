# MIMO Customer Website (`mimo-website/`)

The public face of MIMO: students sign in, upload documents, choose print options, pay, and receive a **4-digit print
code** to use at a kiosk. This folder also produces the **static marketing pages** and bundles the **admin dashboard**
and **finance portal** into the same deployment.

| | |
|---|---|
| Production | https://printmimo.tech (Vercel) — landing `/landing`, app `/`, admin `/admin/`, finance `/finance` |
| Stack | React 18 · Vite 6 · TypeScript · Tailwind CSS 4 · Radix/shadcn-style UI · React Router 7 |
| Talks to | The Cloud Functions API (`https://api-upqxuj7evq-uc.a.run.app`) and Firebase Storage (direct uploads) |
| Mobile | Capacitor wrapper in `android/` (`com.mimo.print`, loads `printmimo.tech`) |

## What is in here

```
mimo-website/
├── src/
│   ├── main.tsx · App.tsx           App shell, Google OAuth provider, router
│   ├── app/api.ts                   Axios client (production = the Functions API, dev = VITE_API_URL || localhost:3000)
│   ├── app/routes.ts                Routes: /login · /register · /onboarding · / (upload) · /print-options · /payment ·
│   │                                /print-code · /profile · /settings · /text-editor
│   ├── app/pages/                   One file per screen (+ payment-verify, find-machine, direct-success)
│   ├── app/components/              Header, layout, shadcn-style ui/
│   └── lib/firebase.ts              Firebase web config (public) — used for direct Storage uploads
├── public/                          Static marketing site: index.html (landing), blog/, legal pages, images, sitemap
├── app.html                         Vite entry for the SPA (index.html is the static landing page)
├── mimo-admin-dashboard/            Admin + Finance app — has its own README
├── android/ + capacitor.config.json Capacitor Android wrapper
├── vercel.json                      URL rewrites (see below)
└── vite.config.ts
```

> `src/app/pages/mimo-admin-dashboard/` is an **older in-app admin page**. In production `/admin/` is served by the standalone
> `mimo-admin-dashboard/` bundle (Vercel rewrites), so that page is only reachable in local dev.

## The customer journey (what the pages do)

1. **Login / Register / Google sign-in** → JWT stored in the browser (`POST /login`, `/register`, `/google-login`).
2. **Upload** → files go **directly to Firebase Storage**; the app then calls `POST /finalize-upload`
   (Office documents are converted to PDF server-side, page count is verified).
3. **Print options** → copies, colour/B&W, duplex, N-up layout, page ranges, target machine.
4. **Payment** → `POST /create-order` → Cashfree checkout → `/payment-verify` (+ webhook on the server).
   Free orders (100 % coupon / coins) skip the gateway.
5. **Print code** → 4-digit code (also e-mailed / WhatsApped). Enter it at a kiosk.

## Run locally

```bash
cd mimo-website
npm install
npm run dev            # http://localhost:5173
```

Environment (`.env`, not committed; names in `.env.example`): `VITE_API_URL` (dev only — production always uses the
Functions API), `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (legacy, currently unused by the main flow).
To develop against a local backend run `npm run dev` in `../functions` (port 5001) and set `VITE_API_URL=http://localhost:5001`.

## Build & deploy

```bash
npm run build
```

`npm run build` = build the customer app → `npm install && npm run build` in `mimo-admin-dashboard/` → copy its `dist`
into `dist/admin`. **The admin is built with `base: '/admin/'`**, so its assets load from `/admin/assets/`.

`vercel.json` rewrites: `/` and `/landing` → static landing page; `/admin`, `/admin/*`, `/finance`, `/finance/*` → the
admin bundle; static legal/blog pages; everything else → `app.html` (the SPA).

Vercel project settings (root directory `mimo-website`, build `npm run build`, output `dist`) live in the Vercel
dashboard, not in this repo. A push builds the whole folder, including the admin dashboard.

## Notes

* `company-website/` at the repo root is an older, **diverged** copy of the static pages (it is not what Vercel deploys).
  Edit `public/` here; treat `company-website/` as a stale archive.
* Mobile app: `npx cap sync android` after `npm run build`, then open `android/` in Android Studio.
