// Print codes are 4 digits (1000-9999). Two active jobs must never share a code, otherwise one customer's code would
// release another customer's documents at the kiosk.
//
// Allocation is atomic: each candidate code is claimed via an all-or-nothing Firestore transaction against a
// dedicated print_code_claims/{code} document, not a plain read-then-return check against print_jobs. The old
// read-then-return approach left a real window between "is this code free?" and the caller actually writing the
// print_jobs doc with it — two concurrent allocations could both see the code as free and both be handed it.
// Confirmed as the root cause of a real production incident: a customer's own, correctly-paid code served a
// DIFFERENT customer's print job, because the two jobs had collided onto the same code and the kiosk's own
// "most recent job wins" tie-break (kiosk.routes.js's POST /print) silently picked the wrong one.
//
// A claim auto-expires after CODE_VALIDITY_MS (matching the 24h window print codes are already documented to
// stay valid for elsewhere in the app -- see upload-file.tsx's "Codes stay valid for 24 hours"), so no caller
// needs to explicitly release a code when its job finishes; a stale claim just becomes reclaimable on its own.
const crypto = require("crypto");

const ACTIVE_STATUSES = new Set(["paid", "printing"]);
const MAX_ATTEMPTS = 25;
const CODE_VALIDITY_MS = 24 * 60 * 60 * 1000;

// crypto.randomInt's upper bound is exclusive, so (1000, 10000) is the 1000-9999 inclusive range.
const randomCode = () => crypto.randomInt(1000, 10000).toString();

/** Runs the check-and-claim against whatever transaction-like object is given (a real transaction, or the
 * per-attempt one generateUniquePrintCode opens itself) -- reads and the claim write all join the SAME
 * transaction's read/write set either way, which is what makes the claim atomic. */
async function tryClaim(txLike, claimRef, jobsQuery) {
  const [claimSnap, activeJobsSnap] = await Promise.all([
    txLike.get(claimRef),
    // Defensive, in addition to the claim above: a job created before this fix shipped (or written by some
    // other path that bypasses this function entirely) still has its printCode set directly on the
    // print_jobs doc, with no corresponding print_code_claims entry -- the claim alone wouldn't see it.
    txLike.get(jobsQuery),
  ]);
  const now = Date.now();
  if (claimSnap.exists && now - (claimSnap.data().claimedAtMs || 0) < CODE_VALIDITY_MS) {
    return false; // still claimed by a previous allocation, not yet expired
  }
  if (activeJobsSnap.docs.some((d) => ACTIVE_STATUSES.has(d.data().status))) {
    return false; // held by a still-active job directly, independent of the claim
  }
  txLike.set(claimRef, { claimedAtMs: now });
  return true;
}

/**
 * @param db Firestore instance.
 * @param tx Optional, an ALREADY-OPEN transaction this call should participate in, instead of opening its
 *   own. Firestore does not support nested transactions -- a caller that already wraps its own read-decide-
 *   write flow in db.runTransaction (e.g. postPaymentSuccess) must pass that same `tx` here so the claim's
 *   read and write join the SAME transaction, relying on ITS abort-and-retry for atomicity, rather than
 *   this function opening a second, independent, illegally-nested one.
 */
async function generateUniquePrintCode(db, tx = null) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = randomCode();
    const claimRef = db.collection("print_code_claims").doc(code);
    const jobsQuery = db.collection("print_jobs").where("printCode", "==", code);
    const claimed = tx
      ? await tryClaim(tx, claimRef, jobsQuery)
      : await db.runTransaction((innerTx) => tryClaim(innerTx, claimRef, jobsQuery));
    if (claimed) return code;
  }
  throw new Error("Could not allocate a unique print code");
}

module.exports = { generateUniquePrintCode, ACTIVE_STATUSES, MAX_ATTEMPTS, CODE_VALIDITY_MS };
