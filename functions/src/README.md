# `functions/src/` — backend source layout

The Express application behind the `api` Cloud Function, split by responsibility (the split is described in [`design.md` §4](../../design.md#4-backend-module-organization)). `../index.js` only exports; **exported names are deployment contracts**.

| Folder / file | Responsibility | Look here when… |
|---|---|---|
| `server.js` | Builds the Express app: CORS, JSON parsing, mounts every router, the kiosk router with its dependencies | a request never reaches a route |
| `config/firebase.js`, `config/env.js` | Firebase Admin init (uses the runtime identity in production, key variables locally); reads `process.env` once (JWT secret, Cashfree, WhatsApp, converter) | a variable seems ignored |
| `middleware/auth.js` | `authMiddleware` (customer JWT), `adminAuthMiddleware` (`isAdmin`) | 401 / 403 |
| `middleware/rateLimit.js` | Firestore-backed limiter for print-code guessing (429) | a kiosk is locked out |
| `routes/*.routes.js` | URL → handler wiring only (`auth`, `user`, `upload`, `payment`, `print`, `public`, `admin`, `whatsapp`, `kiosk`) | you need the URL of a handler |
| `controllers/*.controller.js` | HTTP in/out, one file per area (`adminInsights` = dashboard endpoints) | changing behaviour of an endpoint |
| `services/*.js` | Reusable logic without `req`/`res`: `analytics`, `converter`, `whatsapp`, `email`, `pdf`, `printJob`, `storage` | logic is shared or needs a unit test |
| `triggers/*.js` | Firestore / scheduler functions: refunds, cleanup, alert e-mails, hourly retention | something happens "by itself" |
| `validators/kioskContract.js` | Kiosk request / response / state-transition contract | changing what the kiosk may send |

Environment variables and the endpoint list: [`../README.md`](../README.md). Tests: [`../__tests__/README.md`](../__tests__/README.md).
