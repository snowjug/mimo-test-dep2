/**
 * Admin read-only insight endpoints (analytics, transactions, jobs, kiosks, incidents).
 * All accept an optional date range (?from=ISO&to=ISO&tzOffset=minutes-ahead-of-UTC) and default to "today".
 * Calculations live in services/analytics.service.js.
 */
const { admin, db } = require("../config/firebase");
const A = require("../services/analytics.service");

const Timestamp = admin.firestore.Timestamp;
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // Pi heartbeat is every 30-120s
const PAPER_LOW_PCT = 15;
const TONER_LOW_PCT = 20;

const humanAgo = (sec) => (sec < 90 ? `${sec}s ago` : sec < 5400 ? `${Math.round(sec / 60)} min ago` : sec < 129600 ? `${Math.round(sec / 3600)} h ago` : `${Math.round(sec / 86400)} days ago`);

const fail = (res, err, label) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(`[ADMIN-INSIGHTS] ${label} failed:`, err);
  return res.status(500).json({ error: `Failed to load ${label}` });
};

/** userId -> email/phone via one batched read. */
async function lookupUsers(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 400);
  const map = new Map();
  if (!ids.length) return map;
  const snaps = await db.getAll(...ids.map((id) => db.collection("users").doc(id)));
  snaps.forEach((s) => {
    if (s.exists) {
      const u = s.data();
      map.set(s.id, { email: u.email || null, phone: u.mobileNumber || u.phoneNumber || null, name: u.username || u.name || null });
    }
  });
  return map;
}

// ─────────────────────────────── GET /admin/analytics ───────────────────────────────
const getAdminAnalytics = async (req, res) => {
  try {
    const range = A.parseRange(req.query);
    const compare = req.query.compare !== "0";
    res.json(await A.getAnalytics(db, Timestamp, range, { compare }));
  } catch (err) {
    fail(res, err, "analytics");
  }
};

// ─────────────────────────────── GET /admin/transactions ───────────────────────────────
const getAdminTransactions = async (req, res) => {
  try {
    const range = A.parseRange(req.query);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000);
    const wantStatus = req.query.status ? String(req.query.status).toUpperCase() : null;

    const win = await A.loadWindow(db, Timestamp, range.from, range.to);
    const orders = A.normalizeOrders(win.orders, win.txns);
    const jobs = A.normalizeJobs(win.jobs);
    const jobByOrder = new Map(jobs.filter((j) => j.orderId).map((j) => [j.orderId, j]));

    let rows = orders.filter((o) => !wantStatus || o.status === wantStatus);
    rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    const total = rows.length;
    rows = rows.slice(0, limit);

    const users = await lookupUsers(rows.map((o) => o.userId));
    const transactions = rows.map((o) => {
      const job = jobByOrder.get(o.orderId);
      const gross = job && job.cost > 0 ? Math.max(job.cost, o.amount) : o.amount;
      return {
        id: o.orderId,
        orderId: o.orderId,
        userId: o.userId,
        userEmail: users.get(o.userId)?.email || null,
        userName: users.get(o.userId)?.name || null,
        amount: o.amount,
        gross: A.round2(gross),
        discount: A.round2(Math.max(0, gross - o.amount)),
        couponCode: o.couponCode,
        coinsUsed: o.coinsUsed,
        status: o.status,
        method: o.method,
        gatewayRef: o.gatewayRef,
        kioskId: job?.kioskId || null,
        pages: job?.pages || o.pages || 0,
        createdAt: A.iso(o.createdAtMs),
        paidAt: A.iso(o.paidAtMs),
        refundedAt: A.iso(o.refundedAtMs),
      };
    });
    res.json({ range: { from: A.iso(range.from), to: A.iso(range.to) }, total, truncated: win.truncated || total > limit, transactions, updatedAt: new Date().toISOString() });
  } catch (err) {
    fail(res, err, "transactions");
  }
};

// ─────────────────────────────── GET /admin/jobs ───────────────────────────────
const getAdminJobs = async (req, res) => {
  try {
    const range = A.parseRange(req.query);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 1000);
    const wantStatus = req.query.status ? String(req.query.status).toLowerCase() : null;
    const wantKiosk = req.query.kioskId ? String(req.query.kioskId) : null;

    const snap = await db.collection("print_jobs")
      .where("createdAt", ">=", Timestamp.fromMillis(range.from))
      .where("createdAt", "<", Timestamp.fromMillis(range.to))
      .orderBy("createdAt", "desc")
      .limit(A.MAX_DOCS_PER_COLLECTION)
      .get();

    let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (wantStatus) docs = docs.filter((d) => String(d.status || "").toLowerCase() === wantStatus);
    if (wantKiosk) docs = docs.filter((d) => (d.kioskId || d.printDestination) === wantKiosk);
    const total = docs.length;
    docs = docs.slice(0, limit);

    const users = await lookupUsers(docs.map((d) => d.userId));
    const jobs = docs.map((d) => {
      const [n] = A.normalizeJobs([d]);
      const u = users.get(d.userId);
      return {
        id: d.id,
        createdAt: A.iso(n.createdAtMs),
        userEmail: d.userEmail || u?.email || (d.source === "whatsapp" ? d.userId : null) || "Guest",
        userPhone: d.userPhone || d.phoneNumber || u?.phone || null,
        file: n.fileName || "Unknown file",
        status: n.status || "unknown",
        cost: n.cost,
        copies: n.copies,
        pageCount: num0(d.pageCount),
        totalPages: n.pages,
        colorMode: n.isColor ? "color" : "bw",
        duplex: n.isDuplex,
        destination: n.kioskId || "Unassigned",
        orderId: n.orderId,
        printerStatus: n.printerStatus,
        refundStatus: n.refundStatus,
        refundAmount: d.refundAmount || null,
      };
    });
    res.json({ range: { from: A.iso(range.from), to: A.iso(range.to) }, total, truncated: total > limit || snap.size >= A.MAX_DOCS_PER_COLLECTION, jobs, updatedAt: new Date().toISOString() });
  } catch (err) {
    fail(res, err, "jobs");
  }
};
const num0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ─────────────────────────────── kiosk helpers ───────────────────────────────
const hardwareFor = (hardware, kioskId) =>
  Object.entries(hardware || {})
    .filter(([key, v]) => v && typeof v === "object" && (key === kioskId || key.startsWith(`${kioskId}-`)))
    .map(([key, p]) => {
      const capacity = num0(p.paperCapacity) || 500;
      const paperLevel = p.paperLevel === undefined ? null : num0(p.paperLevel);
      return {
        key,
        type: p.type || (key.toUpperCase().includes("COLOR") ? "color" : "bw"),
        status: p.status || null,
        paperLevel,
        paperCapacity: capacity,
        paperPct: paperLevel === null ? null : Math.max(0, Math.min(100, Math.round((paperLevel / capacity) * 100))),
        tonerLevel: p.tonerLevel === undefined ? null : num0(p.tonerLevel),
        inkLevel: p.inkLevel === undefined ? null : num0(p.inkLevel),
      };
    });

async function loadKiosks(range) {
  const [statusSnap, hwDoc, queuedSnap, win] = await Promise.all([
    db.collection("system_status").get(),
    db.collection("hardware").doc("printers").get(),
    db.collection("print_jobs").where("status", "in", A.QUEUED_JOB_STATUSES).limit(500).get(),
    A.loadWindow(db, Timestamp, range.from, range.to),
  ]);
  const hardware = hwDoc.exists ? hwDoc.data() : {};
  const statusById = new Map(statusSnap.docs.map((d) => [d.id, d.data()]));

  const ids = new Set(Object.keys(A.KNOWN_KIOSKS));
  statusById.forEach((_, id) => { if (A.KIOSK_ID_PATTERN.test(id)) ids.add(id); });

  const orders = A.normalizeOrders(win.orders, win.txns);
  const jobs = A.normalizeJobs(win.jobs);
  const perKiosk = new Map(A.breakdowns({ orders, jobs }, range).byKiosk.map((k) => [k.kioskId, k]));
  const queue = new Map();
  queuedSnap.forEach((d) => {
    const data = d.data();
    const id = data.kioskId || data.printDestination;
    if (!id) return;
    const q = queue.get(id) || { paid: 0, printing: 0 };
    if (data.status === "printing") q.printing += 1; else q.paid += 1;
    queue.set(id, q);
  });

  const now = Date.now();
  const kiosks = [...ids].sort().map((id) => {
    const meta = A.KNOWN_KIOSKS[id] || { name: id, type: "bw", description: "" };
    const st = statusById.get(id) || {};
    const lastSeenMs = A.toMillis(st.lastSeen);
    const online = Number.isFinite(lastSeenMs) && now - lastSeenMs <= ONLINE_WINDOW_MS;
    const stats = perKiosk.get(id) || { jobs: 0, completed: 0, failed: 0, pages: 0, revenue: 0 };
    return {
      kioskId: id,
      name: meta.name,
      type: meta.type,
      description: meta.description,
      online,
      lastSeen: A.iso(lastSeenMs),
      secondsSinceSeen: Number.isFinite(lastSeenMs) ? Math.round((now - lastSeenMs) / 1000) : null,
      printerStatus: st.printerStatus || null,
      printers: hardwareFor(hardware, id),
      queue: queue.get(id) || { paid: 0, printing: 0 },
      stats: { jobs: stats.jobs, completed: stats.completed, failed: stats.failed, pages: stats.pages, revenue: stats.revenue },
    };
  });
  return kiosks;
}

// ─────────────────────────────── GET /admin/kiosks ───────────────────────────────
const getAdminKiosks = async (req, res) => {
  try {
    const range = A.parseRange(req.query);
    const kiosks = await loadKiosks(range);
    res.json({
      range: { from: A.iso(range.from), to: A.iso(range.to) },
      summary: { total: kiosks.length, online: kiosks.filter((k) => k.online).length, offline: kiosks.filter((k) => !k.online).length },
      kiosks,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    fail(res, err, "kiosks");
  }
};

// ─────────────────────────────── GET /admin/incidents ───────────────────────────────
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const getAdminIncidents = async (req, res) => {
  try {
    const range = A.parseRange(req.query);
    const [kiosks, failedSnap, refundSnap] = await Promise.all([
      loadKiosks(range),
      // Range filter only: adding an `in` filter on status would need a composite index (which needs console access).
      db.collection("print_jobs")
        .where("createdAt", ">=", Timestamp.fromMillis(range.from))
        .where("createdAt", "<", Timestamp.fromMillis(range.to))
        .orderBy("createdAt", "desc")
        .limit(A.MAX_DOCS_PER_COLLECTION)
        .get(),
      db.collection("refund_requests").where("status", "==", "pending").limit(100).get(),
    ]);

    const incidents = [];
    for (const k of kiosks) {
      if (!k.online) {
        incidents.push({ id: `offline-${k.kioskId}`, type: "kiosk_offline", severity: "high", kioskId: k.kioskId, title: `${k.kioskId} is offline`, detail: k.secondsSinceSeen === null ? "No heartbeat received yet" : `Last heartbeat ${humanAgo(k.secondsSinceSeen)}`, at: k.lastSeen, tab: "kiosks" });
      }
      for (const p of k.printers) {
        if (p.paperPct !== null && p.paperPct < PAPER_LOW_PCT) incidents.push({ id: `paper-${p.key}`, type: "paper_low", severity: p.paperPct < 5 ? "high" : "medium", kioskId: k.kioskId, title: `Paper low on ${k.kioskId}`, detail: `${p.paperLevel} of ${p.paperCapacity} sheets left (${p.paperPct}%)`, at: null, tab: "kiosks" });
        const supply = p.tonerLevel ?? p.inkLevel;
        if (supply !== null && supply < TONER_LOW_PCT) incidents.push({ id: `supply-${p.key}`, type: "supply_low", severity: "medium", kioskId: k.kioskId, title: `${p.type === "color" ? "Ink" : "Toner"} low on ${k.kioskId}`, detail: `${supply}% remaining`, at: null, tab: "kiosks" });
      }
    }
    let failedShown = 0;
    failedSnap.forEach((d) => {
      const j = d.data();
      if (!["failed", "refunded"].includes(String(j.status || "").toLowerCase()) || failedShown >= 200) return;
      failedShown += 1;
      incidents.push({ id: `job-${d.id}`, type: "print_failed", severity: "high", kioskId: j.kioskId || j.printDestination || null, title: `Print failed${j.kioskId ? ` on ${j.kioskId}` : ""}`, detail: j.printerStatus || j.error || j.fileName || "Job failed", at: A.iso(A.toMillis(j.createdAt)), jobId: d.id, orderId: j.orderId || null, refundStatus: j.refundStatus || null, tab: "operations" });
    });
    refundSnap.forEach((d) => {
      const r = d.data();
      incidents.push({ id: `refund-${d.id}`, type: "refund_request", severity: "medium", kioskId: null, title: "Refund request awaiting review", detail: `Order ${r.orderId} · ₹${A.num(r.amount)}${r.reason ? ` · ${r.reason}` : ""}`, at: A.iso(A.toMillis(r.requestedAt)), orderId: r.orderId, tab: "incidents" });
    });

    incidents.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (A.toMillis(b.at) || 0) - (A.toMillis(a.at) || 0));
    res.json({
      range: { from: A.iso(range.from), to: A.iso(range.to) },
      counts: { open: incidents.length, high: incidents.filter((i) => i.severity === "high").length, medium: incidents.filter((i) => i.severity === "medium").length },
      incidents,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    fail(res, err, "incidents");
  }
};

module.exports = {
  getAdminAnalytics,
  getAdminTransactions,
  getAdminJobs,
  getAdminKiosks,
  getAdminIncidents,
};
