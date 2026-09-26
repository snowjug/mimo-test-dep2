# Contributing to MIMO — how to change things without breaking production

MIMO handles real money and physical machines, and a merge to `main` that touches `functions/**` deploys the production API. These rules let you work on your own module safely.
Read [`design.md` §10](../design.md#10-guidelines-for-future-development) for the principles and [`onboarding.md`](onboarding.md) for your first three days.

## 1. Three tiers of code

| Tier | What | Who / how |
|---|---|---|
| **0 — free** | Admin and Finance UI pages, customer-site pages, static marketing pages, docs, dashboard maths in `services/analytics.service.js` | Any contributor. Normal review. |
| **1 — tested** | Uploads, auth flows, kiosk routes, WhatsApp, e-mail, converter, other backend controllers and services | Contributor + tests for what you change. Normal review. |
| **2 — protected** | **Payments, refunds, job state, authentication, triggers, middleware, validators, routes, config**, `functions/package.json`, `firebase/`, `.github/`, Pi listeners (exact list: [`.github/CODEOWNERS`](../.github/CODEOWNERS)) | Only after agreeing the change with a maintainer. A code owner must approve the pull request. Interns do not edit these on their own. |

If you are unsure which tier a file belongs to, ask before editing.

## 2. The safety net (what protects production)

| Safeguard | What it stops | Where |
|---|---|---|
| **Characterization tests** | Silent changes to payment, verify-payment, print-code and refund behaviour. They pin *today's* behaviour, including known weaknesses (`KNOWN RISK` tests) | `functions/__tests__/paymentFlow.characterization.test.js`, `refund.characterization.test.js` |
| **API surface test** | A route being added, removed, renamed, or losing its auth middleware | `functions/__tests__/apiSurface.test.js` + `fixtures/route-table.json` |
| **Kiosk contract tests** | Changing what the kiosk may send or the job state machine | `kioskSyncContract.test.js` |
| **Coverage gate** (ratchet) | Money/refund/dashboard code losing test coverage — thresholds may go **up**, never down | `npm run test:coverage` (CI) |
| **Secret scan** | Adding a key, token, password or private address | `.github/scripts/secret-scan.js` (CI, added lines only) |
| **Deploy gate** | Deploying with missing or insecure configuration | `.github/scripts/functions-env.js` |
| **Post-deploy smoke tests** | A deploy that leaves the API or sites broken | `deploy-functions.yml`, `post-deploy-smoke.yml` |
| **CODEOWNERS + PR template** | Unreviewed changes to Tier 2 files (enforced once an admin enables "Require review from Code Owners") | `.github/` |

## 3. Changing protected behaviour on purpose
1. Agree the change with a maintainer first, and write down what should be different and why.
2. Change the code **and** update the characterization test that pinned the old behaviour. A `KNOWN RISK` test that now fails is good news — flip its assertion and rename it (drop `KNOWN RISK`) so the test describes the new, safe behaviour.
3. Explain the changed test in the pull request (section *Protected-code changes only* of the template).
4. Never weaken a test to make it pass without an explanation. Never lower a coverage threshold.
5. If the API surface changed on purpose: `cd functions && UPDATE_SNAPSHOT=1 npm test` and commit `__tests__/fixtures/route-table.json`.
6. Deploy behaviour changes on their own, off-peak, and watch the logs; rollback is the *Deploy Firebase Functions* workflow with an older `ref`.

## 4. Writing tests (the easy way)
Two helpers make payment-style tests possible without a database or a network:

```js
const { createFakeFirestore } = require("./helpers/fakeFirestore");   // in-memory Firestore: where/limit/batch/transaction/dotted updates
const { installAxiosStub } = require("./helpers/stubAxios");           // programmable stand-in for axios (Cashfree, internal calls)

const fake = createFakeFirestore(); fake.install();                    // BEFORE requiring the code under test
const http = installAxiosStub();
const { getVerifyPayment } = require("../src/controllers/payment.controller");

fake.reset({ orders: { o1: { orderId: "order_1", userId: "u1", amount: 25 } } });
http.on("get", /\/orders\/order_1$/, () => ({ data: { order_status: "PAID" } }));
// call the handler with a fake req/res, then assert on fake.data("orders") and http.calls
```
Triggers expose `.run(event)`, so `autoRefundJob.run({ params, data: { before: { data: () => … }, after: { data: () => … } } })` works in tests.
Prefer table-driven tests for money maths, and one `test` per behaviour with a name that reads like a sentence.

## 5. Everyday commands
```bash
cd functions && npm test                 # all backend tests (80)
cd functions && npm run test:coverage    # coverage gate (same as CI)
node --test .github/scripts/__tests__/*.test.js
node .github/scripts/secret-scan.js origin/main HEAD    # would CI find a secret in your change?
```

## 6. Definition of done for a pull request
Tests pass locally · new behaviour has a test · no contract renamed · no secrets · docs updated · the PR template is filled in · you did **not** merge it yourself.

## 7. Where this is heading
The backend is being organised into modules (`payments`, `refunds`, `print-jobs`, `uploads`, …) with one owner-reviewed core; the characterization tests are the safety net for that refactor. Until then, the protected *files* are listed in CODEOWNERS.
