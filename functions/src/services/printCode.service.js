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

const TERMINAL_STATUSES = new Set(["refunded", "failed", "abandoned", "cancelled"]);

/** True while a print_jobs doc still owns its printCode (redeemable, or unprinted and not terminally failed). */
const isJobHoldingCode = (data) =>
  ACTIVE_STATUSES.has(data.status) || (data.isPrinted === false && !TERMINAL_STATUSES.has(data.status));

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
  if (activeJobsSnap.docs.some((d) => isJobHoldingCode(d.data()))) {
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

/**
 * Called, inside the caller's transaction, before an ALREADY-STAMPED code is handed to a customer. A code can reach
 * a job without going through generateUniquePrintCode -- the retired legacy backend (deleteable/backend, still live
 * on 2026-11-23 and sharing this Firestore) stamps codes with a bare Math.random() and no uniqueness check, which
 * caused the 9139 "matched more than one order" incident. The customer only ever learns the code from THIS API's
 * response, so it is safe to correct it here:
 *  - another order's job still holds the same code -> allocate a fresh unique code and re-stamp this order's jobs;
 *  - otherwise, the code is ours to keep -> record a claim (if missing) so the allocator never hands it out again.
 * Reads happen before any write, as Firestore transactions require.
 * @returns {Promise<string>} the code the customer must be given.
 */
async function ensureCodeIsUnique(db, tx, { orderId, code, orderJobDocs }) {
  const codeStr = String(code);
  const claimRef = db.collection("print_code_claims").doc(codeStr);
  const [claimSnap, sameCodeSnap] = await Promise.all([
    tx.get(claimRef),
    tx.get(db.collection("print_jobs").where("printCode", "==", codeStr)),
  ]);
  const otherOrders = [...new Set(sameCodeSnap.docs
    .filter((d) => d.data().orderId !== orderId && isJobHoldingCode(d.data()))
    .map((d) => d.data().orderId || d.id))];

  if (otherOrders.length === 0) {
    const claimFresh = claimSnap.exists && Date.now() - (claimSnap.data().claimedAtMs || 0) < CODE_VALIDITY_MS;
    if (!claimFresh) tx.set(claimRef, { claimedAtMs: Date.now(), orderId, adopted: true });
    return codeStr;
  }

  const fresh = await generateUniquePrintCode(db, tx);
  console.error(`[PRINT-CODE REISSUED] order ${orderId} carried code ${codeStr}, also held by active order(s) ` +
    `${otherOrders.join(",")} -- reissued as ${fresh} before showing it to the customer`);
  orderJobDocs.forEach((d) => {
    const update = { printCode: fresh, codeCreatedAt: new Date(), codeReissuedFrom: codeStr };
    if (d.data().tokenId !== undefined) update.tokenId = fresh; // legacy jobs mirror the code into tokenId
    tx.update(d.ref, update);
  });
  return fresh;
}

module.exports = { generateUniquePrintCode, ensureCodeIsUnique, isJobHoldingCode, ACTIVE_STATUSES, MAX_ATTEMPTS, CODE_VALIDITY_MS };
