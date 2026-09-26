# `functions/__tests__/` — backend tests

Run from `functions/`: `npm test` (Node's built-in `node --test`, no extra dependencies; currently **80 tests**). `npm run test:sync` runs only the kiosk contract tests. The tests use fakes and never touch Firestore, Cashfree or e-mail.

| File | Covers |
|---|---|
| `kioskSyncContract.test.js` | Kiosk request/response validation and the job state machine (`validators/kioskContract.js`, `routes/kiosk.routes.js`) |
| `rateLimit.test.js` | The Firestore-backed failure limiter (windows, limits, fail-open) |
| `analytics.test.js` | Dashboard maths: range parsing, IST buckets, revenue/refund merge, per-kiosk figures |
| `paymentFlow.characterization.test.js` | **Protected.** Pins `GET /verify-payment` and `POST /payment-success` (print-code assignment) as they behave today, incl. `KNOWN RISK` cases |
| `refund.characterization.test.js` | **Protected.** Pins `autoRefundJob` and `POST /admin/refund`, incl. the concurrent double-refund risk |
| `apiSurface.test.js` + `fixtures/route-table.json` | Freezes the 60 public routes and the auth middleware on money/admin endpoints (`UPDATE_SNAPSHOT=1 npm test` to update on purpose) |
| `portedRoutes.test.js` | Routes ported from the legacy backend: profile-photo upload (busboy), bulk coupons, ownership check on `/mark-printed` |

Add a test whenever you add logic to `services/` — write it as a plain function over inputs so no database is needed. Failing test names are self-explanatory; run one file with `node --test __tests__/<file>`.

**Helpers** (`helpers/`): `fakeFirestore.js` (in-memory Firestore with real query semantics, batches, transactions and dotted-path updates) and `stubAxios.js` (programmable axios stand-in). Recipe and rules: [`docs/contributing.md`](../../docs/contributing.md#4-writing-tests-the-easy-way).
**Coverage:** `npm run test:coverage` enforces per-file thresholds (a ratchet — raise them as tests are added, never lower them): money/refund/admin files ≥ 20 % lines today, `rateLimit.js` and `analytics.service.js` ≥ 90 %.
