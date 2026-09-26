# Remaining setup (only what cannot be automated)

Everything else in `docs/deployment/CI_CD.md` runs from a push to `main` with the credentials the repository already has.

## 1. Backend deploy — needed now (first run, 2026-09-26, stopped at the security gate)
**Who:** repository admin (`snowjug`) — collaborators cannot manage Actions secrets. **When:** once.

What the run found on the live function (names only, from the run summary):
* Present and preserved automatically: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CASHFREE_APP_ID`, `CASHFREE_ENV`, `CASHFREE_SECRET_KEY`, `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`.
* **Missing: `JWT_SECRET`** — production is signing logins with the public fallback string from the source code.
* **`GMAIL_APP_PASSWORD` is attached as a Secret Manager reference**, which a `.env` deploy would unbind, so the value must be supplied too.
* Not set (only a warning, a code default is used): `GOOGLE_CLIENT_ID`.

Steps:
1. GitHub → Settings → Secrets and variables → Actions → **New repository secret**.
2. Name `FUNCTIONS_ENV_FILE`, value — only what is missing, everything else is kept from the live function:
   ```
   JWT_SECRET="<output of: openssl rand -hex 32>"
   GMAIL_APP_PASSWORD="<from the shared credentials file>"
   ```
   (optionally `GOOGLE_CLIENT_ID`). Adding `JWT_SECRET` signs every customer and admin out once.
3. Actions → *Deploy Firebase Functions* → **Run workflow** (from `main`).

If the gate then reports `ADMIN_PASSWORD` as a default/short value, the live admin password is weak: put a strong `ADMIN_PASSWORD` in the same secret and re-run.

Until this is done the new admin/finance dashboards show error banners on production (their `/admin/*` endpoints are not deployed yet); customers, kiosks and Pis are unaffected.

## 2. Devices and rules — manual by nature (not a GitHub problem)
| What | Why it cannot be automated | Action when it changes |
|---|---|---|
| Raspberry Pi listeners | The Pis sit behind Tailscale; GitHub has no network path or SSH credential to them | From a machine on the Tailscale network: `python scripts/pi-ops/deploy_both.py` (setup in `scripts/pi-ops/README.md`); the master listener is `pi_scripts/firebase_listener.py`. `scripts/deployment/deploy_listener.py` points to another GitHub repo (`madhans7/…`) — do not use it. |
| Android kiosk app | Installed over ADB on physical tablets | Build in Android Studio and install by ADB (`LENOVO TABLET APP/KIOSK_GUIDE.md`) |
| Firestore rules/indexes (`backend/`) and `firebase/storage.rules` | Not deployed by any workflow; changing production rules automatically is a risk decision | `firebase deploy --only firestore:rules` / `storage` by someone logged into Firebase |

## 3. Optional
* **Branch protection** on `main` requiring the *CI* checks — repository admin, one time. Without it CI is advisory and Vercel deploys regardless of test results.
* **Vercel "Ignored Build Step"** to skip unrelated builds — needs Vercel dashboard access; skip unless build minutes matter.

## Nothing to do for
Vercel (customer site, admin, finance, kiosk UI) and Northflank: they deploy through their own GitHub integrations, verified on every recent commit.
