/**
 * Shared rate limiter for print-code guessing (4-digit codes are brute-forceable).
 *
 * State lives in Firestore (`rate_limits/{scope}_{sha256(ip)}`) so it is shared by every Cloud Functions
 * instance, unlike an in-memory limiter. Only FAILED lookups (404 invalid code / 409 already used) are counted,
 * so normal kiosk polling and successful prints never write. It needs no console setup: the Admin SDK bypasses
 * Firestore rules, lookups are by document ID (no index), and stale documents are deleted opportunistically.
 *
 * Fails open: if Firestore errors the request is allowed (and logged), so an outage cannot lock kiosks out.
 */
const crypto = require("crypto");

const COLLECTION = "rate_limits";
const CLEANUP_PROBABILITY = 0.02;
const CLEANUP_BATCH = 25;

const hashIp = (ip) => crypto.createHash("sha256").update(String(ip || "unknown")).digest("hex").slice(0, 32);

// Seconds until the caller may retry, or 0 when not blocked.
function retryAfterSeconds(data, limits, now) {
  let retry = 0;
  limits.forEach((limit, i) => {
    const w = data && data.w && data.w[i];
    if (w && now < w.start + limit.windowMs && w.count >= limit.max) {
      retry = Math.max(retry, Math.ceil((w.start + limit.windowMs - now) / 1000));
    }
  });
  return retry;
}

/**
 * @param db       Firestore instance
 * @param options  { scope, limits: [{ windowMs, max }], failureStatuses?, now?, random? }
 */
function createFailureLimiter(db, { scope, limits, failureStatuses = [404, 409], now = Date.now, random = Math.random }) {
  const longestWindow = Math.max(...limits.map((l) => l.windowMs));

  async function recordFailure(ref) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const t = now();
      const w = limits.map((limit, i) => {
        const cur = data.w && data.w[i];
        return cur && t < cur.start + limit.windowMs ? { start: cur.start, count: cur.count + 1 } : { start: t, count: 1 };
      });
      tx.set(ref, { scope, w, updatedAt: t, expireAt: new Date(t + longestWindow) });
    });
    if (random() < CLEANUP_PROBABILITY) {
      const stale = await db.collection(COLLECTION).where("expireAt", "<", new Date(now())).limit(CLEANUP_BATCH).get();
      if (!stale.empty) {
        const batch = db.batch();
        stale.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    }
  }

  return async function failureLimiter(req, res, next) {
    const ref = db.collection(COLLECTION).doc(`${scope}_${hashIp(req.ip)}`);
    try {
      const snap = await ref.get();
      const retry = snap.exists ? retryAfterSeconds(snap.data(), limits, now()) : 0;
      if (retry > 0) {
        res.set("Retry-After", String(retry));
        return res.status(429).json({ error: "Too many attempts. Please wait a moment and try again." });
      }
    } catch (err) {
      console.error("[RATE-LIMIT] check failed, allowing request:", err.message);
      return next();
    }

    // Record the failure BEFORE the response is sent: Cloud Run may throttle CPU once the response is out.
    const send = res.json.bind(res);
    res.json = (body) => {
      if (!failureStatuses.includes(res.statusCode)) return send(body);
      recordFailure(ref)
        .catch((err) => console.error("[RATE-LIMIT] could not record failure:", err.message))
        .then(() => send(body));
      return res;
    };
    next();
  };
}

// One shared budget for the two endpoints that accept a print code, and a looser one for status polling.
function createLimiters(db) {
  return {
    codeGuessLimiter: createFailureLimiter(db, {
      scope: "code",
      limits: [{ windowMs: 60 * 1000, max: 5 }, { windowMs: 60 * 60 * 1000, max: 20 }],
    }),
    statusLimiter: createFailureLimiter(db, {
      scope: "status",
      limits: [{ windowMs: 60 * 1000, max: 20 }, { windowMs: 60 * 60 * 1000, max: 100 }],
    }),
  };
}

module.exports = { createFailureLimiter, createLimiters, retryAfterSeconds };
