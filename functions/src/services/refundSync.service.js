/**
 * Refund state for the admin print history.
 *
 * A job can be refunded three ways: automatically when the print fails, from the admin panel, or by hand in the
 * Cashfree app. Only the first two write to Firestore, and the admin-panel refund updates the order but not a job that
 * already printed. So the history reads the job, then its order, then asks Cashfree directly, and keeps what Cashfree
 * said in cashfree_refund_sync/{orderId} so each order is asked at most once every RECHECK_MS (never again once
 * refunded).
 */
const SYNC_COLLECTION = "cashfree_refund_sync";
const RECHECK_MS = 15 * 60 * 1000;
const ERROR_RECHECK_MS = 5 * 60 * 1000;
const MAX_ORDER_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_CALLS_PER_REQUEST = 25;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 4000;

const toMillis = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  return NaN;
};
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const up = (v) => String(v || "").toUpperCase();

/** What Firestore already knows: the job itself, or its order (admin-panel refunds land on the order). */
function refundFromFirestore(job, order) {
  if (job.status === "refunded" || ["SUCCESS", "REFUNDED"].includes(up(job.refundStatus))) {
    return { state: "refunded", amount: Number(job.refundAmount) || null, at: iso(toMillis(job.refundedAt)), source: "auto" };
  }
  if (order) {
    if (up(order.refundStatus) === "SUCCESS" || up(order.status) === "REFUNDED") {
      return { state: "refunded", amount: Number(order.refundAmount) || null, at: iso(toMillis(order.refundedAt)), source: "admin" };
    }
    if (["PENDING", "PROCESSING", "ONHOLD"].includes(up(order.refundStatus))) {
      return { state: "pending", amount: Number(order.refundAmount) || null, at: null, source: "admin" };
    }
  }
  return null;
}

/** Cashfree's list of refunds for one order → the state that matters (a successful refund wins). */
function refundFromCashfree(refunds) {
  const list = Array.isArray(refunds) ? refunds : [];
  const done = list.filter((r) => up(r.refund_status) === "SUCCESS");
  if (done.length) {
    const amount = done.reduce((s, r) => s + (Number(r.refund_amount) || 0), 0);
    const times = done.map((r) => toMillis(r.processed_at || r.created_at)).filter(Number.isFinite);
    return { state: "refunded", amount: Math.round(amount * 100) / 100, at: times.length ? iso(Math.max(...times)) : null, source: "cashfree" };
  }
  const pending = list.find((r) => ["PENDING", "ONHOLD"].includes(up(r.refund_status)));
  if (pending) return { state: "pending", amount: Number(pending.refund_amount) || null, at: null, source: "cashfree" };
  return null;
}

async function loadByOrderId(db, collection, orderIds) {
  const map = new Map();
  for (let i = 0; i < orderIds.length; i += 30) {
    const snap = await db.collection(collection).where("orderId", "in", orderIds.slice(i, i + 30)).get();
    snap.forEach((d) => { const o = d.data(); if (!map.has(o.orderId)) map.set(o.orderId, o); });
  }
  return map;
}

/**
 * jobs: raw print_jobs docs ({id, orderId, cost/price, createdAt, status, ...}).
 * Returns Map(jobId → {state: "refunded"|"pending", amount, at, source} | null).
 */
async function resolveRefunds({ db, jobs, fetchCashfreeRefunds, now = Date.now(), log = console }) {
  const result = new Map(jobs.map((j) => [j.id, null]));
  const orderIds = [...new Set(jobs.map((j) => j.orderId).filter(Boolean))];
  if (!orderIds.length) return result;

  const [orders, txns, syncs] = await Promise.all([
    loadByOrderId(db, "orders", orderIds),
    loadByOrderId(db, "payment_transactions", orderIds),
    loadByOrderId(db, SYNC_COLLECTION, orderIds),
  ]);
  const orderOf = (j) => orders.get(j.orderId) || txns.get(j.orderId) || null;

  const toCheck = [];
  for (const job of jobs) {
    const known = refundFromFirestore(job, orderOf(job));
    if (known) { result.set(job.id, known); continue; }
    if (!job.orderId) continue;
    const sync = syncs.get(job.orderId);
    if (sync && sync.result) result.set(job.id, sync.result);

    const paid = Number(job.cost ?? job.price ?? job.totalCost ?? orderOf(job)?.amount ?? 0) > 0;
    const recent = now - toMillis(job.createdAt) < MAX_ORDER_AGE_MS;
    const settled = !!(sync && sync.result && sync.result.state === "refunded");
    const age = sync ? now - toMillis(sync.checkedAt) : Infinity;
    const due = age > (sync && sync.error ? ERROR_RECHECK_MS : RECHECK_MS);
    if (paid && recent && !settled && due) toCheck.push(job);
  }

  // Newest first; one call per order even if the order has several jobs.
  const seen = new Set();
  const queue = toCheck
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .filter((j) => (seen.has(j.orderId) ? false : seen.add(j.orderId)))
    .slice(0, MAX_CALLS_PER_REQUEST);
  const deadline = Date.now() + TIME_BUDGET_MS;

  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const job = queue.shift();
      const ref = db.collection(SYNC_COLLECTION).doc(job.orderId);
      try {
        const found = refundFromCashfree(await fetchCashfreeRefunds(job.orderId));
        await ref.set({ orderId: job.orderId, checkedAt: new Date(now), result: found, error: null });
        jobs.filter((j) => j.orderId === job.orderId).forEach((j) => result.set(j.id, found));
      } catch (err) {
        const msg = (err.response && err.response.data && err.response.data.message) || err.message || String(err);
        log.warn(`[REFUND-SYNC] Cashfree lookup failed for ${job.orderId}: ${msg}`);
        await ref.set({ orderId: job.orderId, checkedAt: new Date(now), error: String(msg).slice(0, 200) }, { merge: true }).catch(() => {});
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return result;
}

/** GET /orders/{id}/refunds. An order Cashfree does not know (free / coupon orders) has no refunds. */
function cashfreeRefundFetcher({ axios, baseUrl, headers }) {
  return async (orderId) => {
    try {
      const res = await axios.get(`${baseUrl}/orders/${encodeURIComponent(orderId)}/refunds`, { headers, timeout: 6000 });
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      if (err.response && err.response.status === 404) return [];
      throw err;
    }
  };
}

module.exports = { resolveRefunds, refundFromFirestore, refundFromCashfree, cashfreeRefundFetcher, SYNC_COLLECTION, RECHECK_MS };
