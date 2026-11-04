/**
 * Keeps the admin and finance API usable only from the real MIMO dashboard.
 *
 * Why: anyone running the admin dashboard on their own machine (npm run dev -> http://localhost:5173) while
 * pointing it at the production API produced real production traffic and Firestore reads. A browser always sends
 * its page's Origin on cross-origin API calls and page scripts cannot change it, so rejecting every Origin that
 * is not on the allow-list stops a locally-run dashboard (or any other website) from using the production admin
 * and finance endpoints at all.
 *
 * What it does NOT do: a request with no Origin header (curl, a script) is not judged here -- those still need a
 * valid, unexpired admin/finance token, which now requires the real ADMIN_/FINANCE_ credentials. This guard is
 * one layer, not the lock.
 *
 * Only enforced on the deployed service (Cloud Run sets K_SERVICE). Local development against the emulator is
 * unaffected, and the local-to-production write block lives in blockProductionWrites.js.
 */

const DEFAULT_ORIGINS = ["https://printmimo.tech", "https://www.printmimo.tech"];

function allowedOrigins(env = process.env) {
  const configured = String(env.ADMIN_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ORIGINS;
}

function adminOriginGuard(req, res, next) {
  if (!process.env.K_SERVICE) return next(); // not the deployed service: local emulator/dev
  const origin = req.header("Origin");
  if (!origin) return next();
  if (allowedOrigins().includes(String(origin).replace(/\/+$/, "").toLowerCase())) return next();
  console.warn(`[ADMIN-ORIGIN] blocked ${req.method} ${req.originalUrl || req.url} from origin ${String(origin).slice(0, 80)}`);
  return res.status(403).json({ error: "Admin and finance access is only allowed from the official dashboard." });
}

module.exports = { adminOriginGuard, allowedOrigins };
