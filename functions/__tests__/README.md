# `functions/__tests__/` — backend tests

Run from `functions/`: `npm test` (Node's built-in `node --test`, no extra dependencies; currently **50 tests**). `npm run test:sync` runs only the kiosk contract tests. The tests use fakes and never touch Firestore, Cashfree or e-mail.

| File | Covers |
|---|---|
| `kioskSyncContract.test.js` | Kiosk request/response validation and the job state machine (`validators/kioskContract.js`, `routes/kiosk.routes.js`) |
| `rateLimit.test.js` | The Firestore-backed failure limiter (windows, limits, fail-open) |
| `analytics.test.js` | Dashboard maths: range parsing, IST buckets, revenue/refund merge, per-kiosk figures |
| `portedRoutes.test.js` | Routes ported from the legacy backend: profile-photo upload (busboy), bulk coupons, ownership check on `/mark-printed` |

Add a test whenever you add logic to `services/` — write it as a plain function over inputs so no database is needed. Failing test names are self-explanatory; run one file with `node --test __tests__/<file>`.
