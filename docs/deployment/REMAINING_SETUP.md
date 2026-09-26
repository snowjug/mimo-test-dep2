# Remaining setup (only what cannot be automated)

Everything else in `docs/deployment/CI_CD.md` runs from a push to `main` with the credentials the repository already has.

## 1. Only if the first backend run stops at the security gate
**Who:** repository admin (`snowjug`) — collaborators cannot manage Actions secrets. **When:** once (redo only when rotating credentials).

The run log says exactly which variables are missing or insecure. Then:
1. GitHub → Settings → Secrets and variables → Actions → **New repository secret**.
2. Name: `FUNCTIONS_ENV_FILE`. Value: the production `functions/.env` from the shared credentials file, with a **strong `ADMIN_PASSWORD` (12+ chars)**
   and a **random `JWT_SECRET` (32+ chars)**; leave out the `FIREBASE_*` lines.
3. Actions → *Deploy Firebase Functions* → **Run workflow** (from `main`).

Not needed if the live function already has strong values (the run then passes on its own). Production currently rejects `admin/admin`,
which suggests it does, but that cannot be confirmed without console access.

## 2. Devices and rules — manual by nature (not a GitHub problem)
| What | Why it cannot be automated | Action when it changes |
|---|---|---|
| Raspberry Pi listeners | The Pis sit behind Tailscale; GitHub has no network path or SSH credential to them | On the Pi: replace `firebase_listener.py` from `main`, `sudo systemctl restart mimo-listener`. Confirm first which folder (`pi-listener/` or `pi_scripts/`) each Pi runs. `scripts/deployment/deploy_listener.py` points to another GitHub repo (`madhans7/…`) — do not use it as is. |
| Android kiosk app | Installed over ADB on physical tablets | Build in Android Studio and install by ADB (`LENOVO TABLET APP/KIOSK_GUIDE.md`) |
| Firestore rules/indexes (`backend/`) and `firebase/storage.rules` | Not deployed by any workflow; changing production rules automatically is a risk decision | `firebase deploy --only firestore:rules` / `storage` by someone logged into Firebase |

## 3. Optional
* **Branch protection** on `main` requiring the *CI* checks — repository admin, one time. Without it CI is advisory and Vercel deploys regardless of test results.
* **Vercel "Ignored Build Step"** to skip unrelated builds — needs Vercel dashboard access; skip unless build minutes matter.

## Nothing to do for
Vercel (customer site, admin, finance, kiosk UI) and Northflank: they deploy through their own GitHub integrations, verified on every recent commit.
