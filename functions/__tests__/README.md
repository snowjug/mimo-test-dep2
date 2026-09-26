# `functions/__tests__/` — backend tests

Run from `functions/`: `npm test` (Node's built-in `node --test`, no extra dependencies; currently **232 tests**). `npm run test:sync` runs only the kiosk contract tests. The tests use fakes and never touch Firestore, Cashfree or e-mail.

| File | Covers |
|---|---|
| `kioskSyncContract.test.js` | Kiosk request/response validation and the job state machine (`validators/kioskContract.js`, `routes/kiosk.routes.js`) |
| `rateLimit.test.js` | The Firestore-backed failure limiter (windows, limits, fail-open) |
| `analytics.test.js` | Dashboard maths: range parsing, IST buckets, revenue/refund merge, per-kiosk figures |
| `paymentFlow.characterization.test.js` | **Protected.** Pins `GET /verify-payment` and `POST /payment-success` (print-code assignment) as they behave today, incl. `KNOWN RISK` cases |
| `refund.characterization.test.js` | **Protected.** Pins `autoRefundJob` and `POST /admin/refund`, incl. the concurrent double-refund risk |
| `orderPricing.characterization.test.js` | **Protected.** Pins every price rule of `POST /create-order` (page prices, double-sided, N-up, blank sheets, custom page ranges, coupons, coins, the free-order threshold) as a table |
| `orderCreation.characterization.test.js` | **Protected.** Checkout validation, job merging, the Cashfree request, free orders, gateway failure, and `KNOWN RISK` / `KNOWN DEFECT` cases found while auditing |
| `orderFollowUp.characterization.test.js` | **Protected.** Coupon validation, verifying a payment twice, print-code hand-out, refund requests, print-code status polling and the WhatsApp ordering path |
| `kioskFailureRefund.characterization.test.js` | **Protected.** `POST /kiosk/report-failure` and the three-refund-paths-at-once scenario (one failed print = one refund) |
| `triggerDeployment.test.js` | Pins the region and event source of every Cloud Functions trigger (prevents duplicate deployments) |
| `apiSurface.test.js` + `fixtures/route-table.json` | Freezes the 60 public routes and the auth middleware on money/admin endpoints (`UPDATE_SNAPSHOT=1 npm test` to update on purpose) |
| `portedRoutes.test.js` | Routes ported from the legacy backend: profile-photo upload (busboy), bulk coupons, ownership check on `/mark-printed` |

Add a test whenever you add logic to `services/` — write it as a plain function over inputs so no database is needed. Failing test names are self-explanatory; run one file with `node --test __tests__/<file>`.

**Real-database checks:** `npm run test:emulator` (needs Java and the Firebase CLI) runs `emulator/orders.emulator.js` against the real Firestore emulator on port 8099 — concurrent refund claims, batches, increments and the create-order → payment-success flow. Not part of `npm test` or CI.
**Helpers** (`helpers/`): `fakeFirestore.js` (in-memory Firestore with real query semantics, batches, transactions and dotted-path updates) and `stubAxios.js` (programmable axios stand-in). Recipe and rules: [`docs/contributing.md`](../../docs/contributing.md#4-writing-tests-the-easy-way).
**Coverage:** `npm run test:coverage` enforces per-file thresholds (a ratchet — raise them as tests are added, never lower them): `payment.controller.js` ≥ 88 % lines / 84 % branches, the refund / print-code / pricing services ≥ 90 %, `whatsapp.service.js` and `public.controller.js` ≥ 60 %, `admin.controller.js` and `printJob.triggers.js` ≥ 20 %, `rateLimit.js` and `analytics.service.js` ≥ 90 %.
**Helpers:** `helpers/orderHarness.js` (fake Firestore + axios stub + `checkout()` for `POST /create-order`) is the quickest way to write an order test.
