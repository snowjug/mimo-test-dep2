# Intern onboarding — your first three days

Goal: by the end of day 3 you have understood MIMO, run it locally, traced a request through the code and opened a pull request.
Commands below were checked against this repository unless marked *unverified*. Ask for the **shared credentials file** instead of copying secrets from anywhere else,
and never paste keys into chat, issues or pull requests.

## Before you start

| Tool | Version | Needed for |
|---|---|---|
| Git | any recent | everything |
| Node.js + npm | **20** (the backend declares `engines.node = 20`; newer versions work locally) | all JavaScript apps |
| Firebase CLI | `npm install -g firebase-tools` | Firestore emulator (optional but recommended) |
| Java | a recent JDK (the emulator prints the version it needs) | the Firestore emulator only |
| Python | 3.9+ | Pi tooling and its tests (optional) |
| VS Code (or similar) | — | editing |

```bash
git clone https://github.com/snowjug/mimo-test-dep2.git
cd mimo-test-dep2
git checkout -b intern/<your-name>-day1      # never work on main
```

## Day 1 — understand MIMO and run one app

1. **Read** (about 90 minutes): [`README.md`](../README.md) → [`architecture.md`](../architecture.md) §1–4 → skim [`design.md`](../design.md).
   Be able to explain, in your own words: what a print code is, why the Pis *pull* jobs from Firestore, and what happens when a print fails.
2. **Pick your track** and read that folder's README:
   * Backend → [`functions/README.md`](../functions/README.md)
   * Customer site → [`mimo-website/README.md`](../mimo-website/README.md)
   * Admin / Finance → [`mimo-website/mimo-admin-dashboard/README.md`](../mimo-website/mimo-admin-dashboard/README.md)
   * Kiosk UI → [`mimo-frontend-web-app/mimo-frontend/README.md`](../mimo-frontend-web-app/mimo-frontend/README.md)
   * Pi / hardware → [`pi_scripts/README.md`](../pi_scripts/README.md), [`scripts/pi-ops/README.md`](../scripts/pi-ops/README.md)
3. **Run the backend safely against the Firestore emulator** (recommended — the alternative is the *real* production database):
   ```bash
   # terminal 1
   firebase emulators:start --only firestore --project demo-mimo        # emulator on 127.0.0.1:8080
   # terminal 2
   cd functions && npm install
   cat > .env <<'ENV'
   JWT_SECRET=local-dev-only-secret
   ADMIN_EMAIL=dev@example.com
   ADMIN_PASSWORD=choose-something-local
   ENV
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-mimo npm run dev   # http://localhost:3000
   curl http://localhost:3000/                                          # → "Mimo Firebase Serverless is LIVE"
   ```
   The emulator itself and the Functions Framework against it were verified; the exact `npm run dev` + emulator combination is standard `firebase-admin` behaviour but was *not run end to end* in the audit.
   Payments, e-mail and WhatsApp need real third-party keys and will not work locally — that is expected.
   `functions/.env` is git-ignored; never commit it.
4. **Run your app** (see the folder README). Defaults: customer site `http://localhost:5173`, admin `http://localhost:5174`.
   ⚠ The **kiosk UI has the production API address hard-coded** — running it locally talks to *production*. Do not enter real print codes; see the workaround in its README (point the API constants at your local backend, and never commit that change).
5. **Run the tests:** `cd functions && npm test` → expect *50 pass*.

Checkpoint: you can start one app locally and the backend tests pass.

## Day 2 — trace a workflow and read the logs

1. **Trace "the kiosk looks up a print code"** end to end:
   * UI: `mimo-frontend-web-app/mimo-frontend/src/App.tsx` → `fetch(".../get-documents-by-code")`
   * Route: `functions/src/routes/print.routes.js` (`codeGuessLimiter` → `postGetDocumentsByCode`)
   * Limiter: `functions/src/middleware/rateLimit.js`
   * Logic: `functions/src/controllers/print.controller.js` (colour rule, kiosk validation)
   * Contract: `functions/src/validators/kioskContract.js`, test `functions/__tests__/kioskSyncContract.test.js`
   * Data: Firestore `print_jobs` (see [`architecture.md` §5](../architecture.md#5-firestore-data-model))
2. **Trace "an admin opens the dashboard"**: `mimo-admin-dashboard/src/pages/Overview/OverviewPage.tsx` → `services/insights.service.ts` → `GET /admin/analytics` →
   `functions/src/controllers/adminInsights.controller.js` → `services/analytics.service.js` → test `functions/__tests__/analytics.test.js`.
3. **Run the other checks:**
   ```bash
   node --test .github/scripts/__tests__/functions-env.test.js      # deploy-gate tests
   python3 scripts/pi-ops/tests/test_pi_ops.py                       # Pi tooling tests (no Pi needed)
   cd mimo-frontend-web-app/mimo-frontend && npm install && npm run build   # type-check + build
   ```
4. **Logs:** locally the terminal running `npm run dev`; in the browser the DevTools console/network tab; production logs are in Cloud Run / GitHub Actions (ask a maintainer for access — you may not have it, and that is fine); on a Pi `journalctl -u mimo-listener -f` (see [`scripts/pi-ops/README.md`](../scripts/pi-ops/README.md)).
5. Write down three questions about the code and ask a maintainer.

Checkpoint: you can point to the file for each step of a request and you have seen a test fail and pass (change an expected value, run, revert).

## Day 3 — a small change and your first pull request

1. **Pick a small task** with a maintainer. Good starters that need no production access:
   * add a missing unit test for a service in `functions/src/services/`;
   * remove the credentials from the admin-login failure log line (see [`design.md` §9](../design.md#9-error-handling-and-logging));
   * improve an empty/error state in a dashboard page;
   * fix a typo or an outdated statement in a README (label anything unverified).
2. **Branch, change, test:**
   ```bash
   git checkout -b intern/<your-name>-<topic>
   # edit…
   cd functions && npm test            # or the build/test of the app you touched
   git status                           # only the files you meant to change; no .env, no keys
   git add <files> && git commit -m "fix(scope): what and why"
   git push -u origin intern/<your-name>-<topic>
   ```
3. **Open a pull request** against `main` on GitHub. Describe what changed, how you tested it and anything unverified. `ci.yml` runs the checks for the folders you touched.
   Do **not** merge it yourself: a merge that touches `functions/**` deploys the production API.
4. Address review comments with new commits on the same branch.

## Where to get help
* Something looks wrong in the docs → fix it in your pull request.
* Credentials, Firebase/Vercel access, deploys → ask a maintainer; do not work around access limits.
* Stuck for more than 30 minutes → ask.
