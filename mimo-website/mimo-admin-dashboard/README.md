# Mimo Admin Dashboard

A standalone React + Vite admin panel for the **Mimo Smart Print Kiosk** system.

## Features
- 📊 Real-time metrics (Revenue, Orders, Pages Printed, Pi Status)
- 🎟️ Coupon management (bulk generator + custom codes)
- 📈 Revenue analytics chart
- 🔐 JWT-based admin authentication

## Setup

```bash
cd mimo-website/mimo-admin-dashboard
npm install
npm run dev       # Development server on port 5174 (served at /, API defaults to http://localhost:5001 = `npm run dev` in functions/)
npm run build     # Production build (base /admin/; mimo-website's build copies it into dist/admin)
```

Routes: `/admin/` (admin dashboard) and `/finance` (finance portal). In production `/finance` is rewritten to the admin
bundle by `mimo-website/vercel.json`.

## Credentials
There are no built-in credentials. Admin and finance logins are verified by the API (`POST /admin/login`) against the
`ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables of the Cloud Function.

## API
Connected to: `https://api-upqxuj7evq-uc.a.run.app`
