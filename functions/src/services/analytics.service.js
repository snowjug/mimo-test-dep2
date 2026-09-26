/**
 * Admin analytics: turns raw Firestore documents (orders, payment_transactions, print_jobs, refunds) into the
 * numbers the admin dashboard and finance portal show.
 *
 * Everything here is pure (no Firestore access) except loadWindow(), which takes the db as an argument so the
 * whole module can be unit-tested with plain objects.
 *
 * Data model notes (verified against the code that writes these documents):
 *  - Cashfree payments live in `payment_transactions` (status INITIATED -> PAID, plus paymentMethod);
 *    free / fully-discounted orders are written to `orders` (status PAID, amount 0). Both are merged by orderId.
 *  - A refunded order has refundStatus "SUCCESS" (auto refund) or status "REFUNDED" (admin refund).
 *  - print_jobs carry kioskId, status, pageCount, printOptions {copies, colorMode, doubleSided}, createdAt, orderId.
 */

// The two production machines. Any other id that reports a heartbeat and looks like a kiosk id is added at runtime.
const KNOWN_KIOSKS = {
  "CV-001": { name: "MIMO 1.0", type: "bw", description: "Black & white" },
  "SV-002": { name: "MIMO 2.0", type: "color", description: "Colour + black & white" },
};
const KIOSK_ID_PATTERN = /^[A-Z]{2}-\d{3}$/;

const PAID_STATUSES = new Set(["PAID", "SUCCESS", "REFUNDED"]);
const FAILED_JOB_STATUSES = new Set(["failed", "refunded"]);
const DONE_JOB_STATUSES = new Set(["completed", "printed"]);
const QUEUED_JOB_STATUSES = ["paid", "printing"];

const MAX_DOCS_PER_COLLECTION = 5000;
const MAX_RANGE_DAYS = 400;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const toMillis = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  if (typeof v === "object" && typeof v._seconds === "number") return v._seconds * 1000;
  return NaN;
};
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

// ─────────────────────────────── range handling ───────────────────────────────

/**
 * Parses ?from=&to=&tzOffset= . `tzOffset` is minutes AHEAD of UTC (IST = 330) so "today" and day buckets follow
 * the viewer's calendar. Defaults to today in IST. Throws Error with .status = 400 on invalid input.
 */
function parseRange(query = {}, now = Date.now()) {
  const tzOffset = query.tzOffset === undefined ? 330 : Number(query.tzOffset);
  if (!Number.isFinite(tzOffset) || Math.abs(tzOffset) > 14 * 60) throw httpError(400, "Invalid tzOffset");
  const offsetMs = tzOffset * 60000;

  const startOfLocalDay = (ms) => Math.floor((ms + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
  let from = query.from ? new Date(query.from).getTime() : startOfLocalDay(now);
  let to = query.to ? new Date(query.to).getTime() : from + DAY_MS;
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw httpError(400, "Invalid from/to date");
  if (to <= from) throw httpError(400, "`to` must be after `from`");
  if (to - from > MAX_RANGE_DAYS * DAY_MS) throw httpError(400, `Range cannot exceed ${MAX_RANGE_DAYS} days`);

  const granularity = to - from <= 2 * DAY_MS ? "hour" : "day";
  return { from, to, tzOffset, offsetMs, granularity, length: to - from };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ─────────────────────────────── normalisers ───────────────────────────────

const STATUS_RANK = { REFUNDED: 5, PAID: 4, FAILED: 3, PENDING: 2, INITIATED: 1 };
const normStatus = (raw) => {
  const s = String(raw || "").toUpperCase();
  if (s === "SUCCESS" || s === "COMPLETED") return "PAID";
  if (["PAID", "REFUNDED", "FAILED", "PENDING", "INITIATED"].includes(s)) return s;
  if (s === "CANCELLED" || s === "EXPIRED") return "FAILED";
  return s ? "PENDING" : "INITIATED";
};

const METHOD_LABELS = {
  upi: "UPI",
  credit_card: "Card",
  debit_card: "Card",
  card: "Card",
  net_banking: "Net Banking",
  netbanking: "Net Banking",
  wallet: "Wallet",
  paylater: "Pay Later",
  emi: "EMI",
  free: "Free / Coupon",
};
const methodLabel = (raw, amount) => {
  if (!raw || raw === "unknown") return amount > 0 ? "Other" : "Free / Coupon";
  const key = String(raw).toLowerCase();
  return METHOD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Merges `orders` and `payment_transactions` documents into one record per orderId. */
function normalizeOrders(orderDocs = [], txnDocs = []) {
  const byId = new Map();
  const absorb = (d, source) => {
    const orderId = d.orderId || d.id;
    if (!orderId) return;
    const status = normStatus(d.refundStatus === "SUCCESS" ? "REFUNDED" : d.status || d.orderStatus || d.transactionStatus?.status);
    const rec = {
      orderId,
      userId: d.userId || null,
      amount: round2(num(d.amount ?? d.totals?.totalAmount ?? d.totalCost)),
      status,
      method: d.paymentMethod || null,
      createdAtMs: toMillis(d.createdAt),
      paidAtMs: toMillis(d.paymentDetails?.paidAt ?? d.transactionStatus?.completedAt ?? d.paymentTime),
      refundedAtMs: toMillis(d.refundedAt),
      couponCode: d.couponCode || null,
      discountPercentage: num(d.discountPercentage),
      coinsUsed: num(d.coinsUsed),
      refundStatus: d.refundStatus || null,
      gatewayRef: d.cashfreePaymentId || null,
      pages: num(d.totalPages),
      sources: [source],
    };
    const prev = byId.get(orderId);
    if (!prev) return byId.set(orderId, rec);
    // Same order in both collections: keep the strongest status and the richest fields.
    const best = (STATUS_RANK[rec.status] || 0) > (STATUS_RANK[prev.status] || 0) ? rec : prev;
    const other = best === rec ? prev : rec;
    byId.set(orderId, {
      ...other,
      ...Object.fromEntries(Object.entries(best).filter(([, v]) => v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v)))),
      method: best.method || other.method,
      gatewayRef: best.gatewayRef || other.gatewayRef,
      couponCode: best.couponCode || other.couponCode,
      sources: [...prev.sources, source],
    });
  };
  orderDocs.forEach((d) => absorb(d, "orders"));
  txnDocs.forEach((d) => absorb(d, "payment_transactions"));
  return [...byId.values()].map((o) => ({ ...o, method: methodLabel(o.method, o.amount) }));
}

function normalizeJobs(jobDocs = []) {
  return jobDocs.map((d) => {
    const opts = d.printOptions || {};
    const copies = Math.max(1, num(opts.copies ?? d.copies) || 1);
    const status = String(d.status || "").toLowerCase();
    const colorMode = String(opts.colorMode || d.colorMode || (d.isColor ? "color" : "bw")).toLowerCase();
    return {
      id: d.id,
      userId: d.userId || null,
      orderId: d.orderId || null,
      status,
      kioskId: d.kioskId || d.printDestination || opts.directKioskId || null,
      pages: num(d.pageCount) * copies,
      copies,
      isColor: colorMode === "color" || colorMode === "colour",
      isDuplex: opts.doubleSided === "double" || opts.duplex === true,
      cost: num(d.finalCost ?? d.totalCost),
      createdAtMs: toMillis(d.createdAt),
      fileName: d.fileName || null,
      printerStatus: d.printerStatus || null,
      isPrinted: d.isPrinted === true,
      refundStatus: d.refundStatus || null,
    };
  });
}

const isDone = (j) => DONE_JOB_STATUSES.has(j.status) || j.isPrinted;
const isFailed = (j) => FAILED_JOB_STATUSES.has(j.status);

// ─────────────────────────────── aggregation ───────────────────────────────

function summarize({ orders, jobs, newUsers = 0 }) {
  const paid = orders.filter((o) => PAID_STATUSES.has(o.status));
  const refunded = orders.filter((o) => o.status === "REFUNDED");
  const pending = orders.filter((o) => o.status === "INITIATED" || o.status === "PENDING");
  const failedPay = orders.filter((o) => o.status === "FAILED");
  const revenue = round2(paid.reduce((a, o) => a + o.amount, 0));
  const refundedAmount = round2(refunded.reduce((a, o) => a + o.amount, 0));
  const done = jobs.filter(isDone);
  const failed = jobs.filter(isFailed);
  const finished = done.length + failed.length;
  return {
    revenue,
    refundedAmount,
    netRevenue: round2(revenue - refundedAmount),
    orders: paid.length,
    paidOrders: paid.filter((o) => o.amount > 0).length,
    freeOrders: paid.filter((o) => o.amount === 0).length,
    refundCount: refunded.length,
    pendingPayments: pending.length,
    pendingAmount: round2(pending.reduce((a, o) => a + o.amount, 0)),
    failedPayments: failedPay.length,
    avgOrderValue: paid.length ? round2(revenue / paid.length) : 0,
    jobs: jobs.length,
    completedJobs: done.length,
    failedJobs: failed.length,
    pages: done.reduce((a, j) => a + j.pages, 0),
    colorPages: done.filter((j) => j.isColor).reduce((a, j) => a + j.pages, 0),
    bwPages: done.filter((j) => !j.isColor).reduce((a, j) => a + j.pages, 0),
    successRate: finished ? round2((done.length / finished) * 100) : null,
    newUsers,
  };
}

const pad = (n) => String(n).padStart(2, "0");
/** Bucket key in the viewer's local calendar: "YYYY-MM-DD" or "YYYY-MM-DDTHH". */
function bucketKey(ms, offsetMs, granularity) {
  const d = new Date(ms + offsetMs);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return granularity === "hour" ? `${day}T${pad(d.getUTCHours())}` : day;
}

function buildSeries({ orders, jobs }, range) {
  const step = range.granularity === "hour" ? HOUR_MS : DAY_MS;
  const rows = new Map();
  // Pre-fill every bucket so the chart has no gaps.
  const first = Math.floor((range.from + range.offsetMs) / step) * step - range.offsetMs;
  for (let t = first; t < range.to; t += step) {
    rows.set(bucketKey(t, range.offsetMs, range.granularity), { key: bucketKey(t, range.offsetMs, range.granularity), start: iso(t), revenue: 0, refunds: 0, orders: 0, jobs: 0, pages: 0, failed: 0 });
  }
  const at = (ms) => rows.get(bucketKey(ms, range.offsetMs, range.granularity));
  for (const o of orders) {
    const row = Number.isFinite(o.createdAtMs) && at(o.createdAtMs);
    if (!row) continue;
    if (PAID_STATUSES.has(o.status)) {
      row.revenue = round2(row.revenue + o.amount);
      row.orders += 1;
    }
    if (o.status === "REFUNDED") row.refunds = round2(row.refunds + o.amount);
  }
  for (const j of jobs) {
    const row = Number.isFinite(j.createdAtMs) && at(j.createdAtMs);
    if (!row) continue;
    row.jobs += 1;
    if (isDone(j)) row.pages += j.pages;
    if (isFailed(j)) row.failed += 1;
  }
  return [...rows.values()];
}

function breakdowns({ orders, jobs }, range) {
  const paid = orders.filter((o) => PAID_STATUSES.has(o.status));

  const jobByOrder = new Map(jobs.filter((j) => j.orderId).map((j) => [j.orderId, j]));
  const kiosks = new Map(Object.entries(KNOWN_KIOSKS).map(([id, k]) => [id, { kioskId: id, ...k, jobs: 0, completed: 0, failed: 0, pages: 0, revenue: 0 }]));
  const kioskRow = (id) => {
    if (!kiosks.has(id)) kiosks.set(id, { kioskId: id, name: id, type: "bw", description: "", jobs: 0, completed: 0, failed: 0, pages: 0, revenue: 0 });
    return kiosks.get(id);
  };
  let unassignedRevenue = 0;
  for (const j of jobs) {
    if (!j.kioskId) continue;
    const row = kioskRow(j.kioskId);
    row.jobs += 1;
    if (isDone(j)) { row.completed += 1; row.pages += j.pages; }
    if (isFailed(j)) row.failed += 1;
  }
  for (const o of paid) {
    const kid = jobByOrder.get(o.orderId)?.kioskId;
    if (kid) kioskRow(kid).revenue = round2(kioskRow(kid).revenue + o.amount);
    else unassignedRevenue = round2(unassignedRevenue + o.amount);
  }

  const methods = new Map();
  for (const o of paid) {
    const m = methods.get(o.method) || { method: o.method, amount: 0, count: 0 };
    m.amount = round2(m.amount + o.amount);
    m.count += 1;
    methods.set(o.method, m);
  }

  const statuses = new Map();
  for (const j of jobs) statuses.set(j.status || "unknown", (statuses.get(j.status || "unknown") || 0) + 1);

  const done = jobs.filter(isDone);
  const modes = {
    color: { jobs: done.filter((j) => j.isColor).length, pages: done.filter((j) => j.isColor).reduce((a, j) => a + j.pages, 0) },
    bw: { jobs: done.filter((j) => !j.isColor).length, pages: done.filter((j) => !j.isColor).reduce((a, j) => a + j.pages, 0) },
    duplex: { jobs: done.filter((j) => j.isDuplex).length, pages: done.filter((j) => j.isDuplex).reduce((a, j) => a + j.pages, 0) },
    simplex: { jobs: done.filter((j) => !j.isDuplex).length, pages: done.filter((j) => !j.isDuplex).reduce((a, j) => a + j.pages, 0) },
  };

  // Jobs per local hour of day (peak-hours chart).
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, jobs: 0 }));
  for (const j of jobs) {
    if (!Number.isFinite(j.createdAtMs)) continue;
    byHour[new Date(j.createdAtMs + range.offsetMs).getUTCHours()].jobs += 1;
  }

  return {
    byKiosk: [...kiosks.values()],
    unassignedRevenue,
    byPaymentMethod: [...methods.values()].sort((a, b) => b.amount - a.amount),
    byStatus: [...statuses.entries()].map(([status, count]) => ({ status, count })),
    modes,
    byHour,
  };
}

// ─────────────────────────────── Firestore loading ───────────────────────────────

/** Loads every document created inside [fromMs, toMs). `db` and `Timestamp` are injected. */
async function loadWindow(db, Timestamp, fromMs, toMs) {
  const lo = Timestamp.fromMillis(fromMs);
  const hi = Timestamp.fromMillis(toMs);
  const q = (collection, field) =>
    db.collection(collection).where(field, ">=", lo).where(field, "<", hi).limit(MAX_DOCS_PER_COLLECTION + 1).get();
  const [orders, txns, jobs, refunds] = await Promise.all([
    q("orders", "createdAt"),
    q("payment_transactions", "createdAt"),
    q("print_jobs", "createdAt"),
    q("refunds", "initiatedAt"),
  ]);
  const data = (snap) => snap.docs.slice(0, MAX_DOCS_PER_COLLECTION).map((d) => ({ id: d.id, ...d.data() }));
  return {
    orders: data(orders),
    txns: data(txns),
    jobs: data(jobs),
    refunds: data(refunds),
    truncated: [orders, txns, jobs, refunds].some((s) => s.docs.length > MAX_DOCS_PER_COLLECTION),
  };
}

async function countNewUsers(db, Timestamp, fromMs, toMs) {
  try {
    const snap = await db.collection("users")
      .where("createdAt", ">=", Timestamp.fromMillis(fromMs))
      .where("createdAt", "<", Timestamp.fromMillis(toMs))
      .count().get();
    return snap.data().count;
  } catch (err) {
    console.error("[ANALYTICS] new-user count failed:", err.message);
    return 0;
  }
}

/** Refund documents that are not already reflected on an order (e.g. admin refunds of legacy orders). */
function refundsAsOrders(refundDocs, knownOrderIds) {
  return refundDocs
    .filter((r) => r.orderId && !knownOrderIds.has(r.orderId) && r.status !== "CASHFREE_FAILED")
    .map((r) => ({ orderId: r.orderId, userId: r.userId, amount: num(r.refundAmount), status: "REFUNDED", createdAt: r.initiatedAt, refundStatus: "SUCCESS" }));
}

/** Full analytics payload for the admin dashboard / finance portal. */
async function getAnalytics(db, Timestamp, range, { compare = true } = {}) {
  const window = await loadWindow(db, Timestamp, range.from, range.to);
  const orders = normalizeOrders(window.orders, window.txns);
  orders.push(...normalizeOrders(refundsAsOrders(window.refunds, new Set(orders.map((o) => o.orderId)))));
  const jobs = normalizeJobs(window.jobs);
  const newUsers = await countNewUsers(db, Timestamp, range.from, range.to);

  let previous = null;
  if (compare) {
    const prevFrom = range.from - range.length;
    const prev = await loadWindow(db, Timestamp, prevFrom, range.from);
    const prevOrders = normalizeOrders(prev.orders, prev.txns);
    prevOrders.push(...normalizeOrders(refundsAsOrders(prev.refunds, new Set(prevOrders.map((o) => o.orderId)))));
    previous = {
      from: iso(prevFrom),
      to: iso(range.from),
      summary: summarize({ orders: prevOrders, jobs: normalizeJobs(prev.jobs), newUsers: await countNewUsers(db, Timestamp, prevFrom, range.from) }),
    };
  }

  return {
    range: { from: iso(range.from), to: iso(range.to), granularity: range.granularity, tzOffset: range.tzOffset },
    current: summarize({ orders, jobs, newUsers }),
    previous,
    series: buildSeries({ orders, jobs }, range),
    ...breakdowns({ orders, jobs }, range),
    truncated: window.truncated,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  KNOWN_KIOSKS,
  KIOSK_ID_PATTERN,
  QUEUED_JOB_STATUSES,
  MAX_DOCS_PER_COLLECTION,
  parseRange,
  httpError,
  toMillis,
  iso,
  num,
  round2,
  normalizeOrders,
  normalizeJobs,
  summarize,
  buildSeries,
  breakdowns,
  loadWindow,
  getAnalytics,
  isDone,
  isFailed,
};
