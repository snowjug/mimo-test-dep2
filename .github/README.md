# `.github/` — CI/CD

| Path | Purpose |
|---|---|
| `workflows/ci.yml` | On every push and pull request: detects which folders changed and runs only the relevant checks (backend tests, customer site + admin build, kiosk build, converter and Pi syntax checks, workflow lint). **Deploys nothing.** |
| `workflows/deploy-functions.yml` | Push to `main` touching `functions/**` (or manual, with an optional rollback `ref`): tests → builds the environment from the live function → **security gate** → deploys `api` → smoke test. Triggers are a manual opt-in. |
| `workflows/deploy-converter.yml` | Push to `main` touching `converter/**` (or manual): Cloud Build → Cloud Run → health check |
| `workflows/post-deploy-smoke.yml` | Runs when Vercel reports a successful production deployment and checks the public sites |
| `workflows/backend-image.yml` | Legacy: builds the frozen `backend/` Docker image (to be removed with `backend/`) |
| `scripts/functions-env.js` (+ `__tests__/`) | Builds `functions/.env` for a deploy and blocks missing/insecure configuration; masks secret values in logs |

**Secrets used:** `FIREBASE_SERVICE_ACCOUNT` (deploy credential), optional `FUNCTIONS_ENV_FILE` (dotenv text), `GITHUB_TOKEN`. Only a repository admin can add or change secrets.
**Test the gate locally:** `node --test .github/scripts/__tests__/functions-env.test.js`. **Lint workflows:** `actionlint` (CI does this when `.github/` changes).
Common failures: the deploy stopping at the gate with *Required configuration missing* / *Insecure production configuration* (fix the variable, not the gate); a red Vercel status is Vercel's own build.
Full explanation and rollback: [`docs/deployment/CI_CD.md`](../docs/deployment/CI_CD.md) · [`docs/deployment/REMAINING_SETUP.md`](../docs/deployment/REMAINING_SETUP.md).
