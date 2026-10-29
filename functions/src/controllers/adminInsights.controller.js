/**
 * Admin read-only insight endpoints (analytics, transactions, jobs, kiosks, incidents).
 * All accept an optional date range (?from=ISO&to=ISO&tzOffset=minutes-ahead-of-UTC) and default to "today".
 * Calculations live in services/analytics.service.js.
 */
const { admin, db } = require("../config/firebase");
const A = require("../services/analytics.service");
const { resolveRefunds, cashfreeRefundFetcher } = require("../services/refundSync.service");
const R = require("../services/machineRegistry.service");
const C = require("../services/issueCategories.service");

// Cashfree refund lookups for the history (manual refunds made in the Cashfree app). Tests swap this out.
let fetchCashfreeRefunds = (orderId) => {
  const axios = require("axios");
  const { CASHFREE_BASE_URL, cashfreeHeaders } = require("../config/env");
  fetchCashfreeRefunds = cashfreeRefundFetcher({ axios, baseUrl: CASHFREE_BASE_URL, headers: cashfreeHeaders });
  return fetchCashfreeRefunds(orderId);
};
const setCashfreeRefundFetcher = (fn) => { fetchCashfreeRefunds = fn; };

const Timestamp = admin.firestore.Timestamp;
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // Pi heartbeat is every 30-120s
const PAPER_LOW_PCT = 15;
const TONER_LOW_PCT = 20;
// Tray sizes: the Brother B&W trays hold 250 sheets; the Epson colour tray 100 (same as the low-paper alert trigger).
const BW_PAPER_CAPACITY = 250;
const COLOR_PAPER_CAPACITY = 100;

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

async function lookupOrders(orderIds) {
  const ids = [...new Set(orderIds.filter(Boolean))].slice(0, 400);
  const map = new Map();
  if (!ids.length) return map;
  const chunks = [];
  for (let i = 0; i < ids.length; i += 30) {
    chunks.push(ids.slice(i, i + 30));
  }
  await Promise.all(
    chunks.map(async (c) => {
      try {
        const snap = await db.collection("orders").where("orderId", "in", c).get();
        snap.docs.forEach((doc) => {
          const d = doc.data();
          map.set(d.orderId, {
            couponCode: d.couponCode || null,
            discountPercentage: d.discountPercentage || 0,
            amount: d.amount,
            gross: d.gross || d.totalCost || d.amount,
          });
        });
      } catch (err) {
        console.error("[ADMIN-INSIGHTS] lookupOrders chunk failed:", err.message || err);
      }
    })
  );
  return map;
}

// ─────────────────────────────── GET /admin/analytics ───────────────────────────────
const getAdminAnalytics = async (req, res) => {
  try {
    const range = A.parseRange(req.query);
    const compare = req.query.compare !== "0";
    // The registry (falls back to the built-in defaults on its own) decides which machines get a row.
    const machines = await R.loadMachinesMap(db);
    res.json(await A.getAnalytics(db, Timestamp, range, { compare, machines }));
  } catch (err) {
    fail(res, err, "analytics");
  }
};

// ─────────────────────────────── GET /admin/analytics/monthly-summary ───────────────────────────────
const getAdminMonthlySummary = async (req, res) => {
  try {
    const months = await A.getMonthlySummary(db, Timestamp);
    res.json({
      launchDate: A.LAUNCH_DATE_IST,
      timezone: "Asia/Kolkata",
      currency: "INR",
      months,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    fail(res, err, "monthly-summary");
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
        coinsUsed: null,
        status: o.status,
        method: o.method,
        gatewayRef: o.gatewayRef,
        refundAmount: o.refundAmount !== undefined && o.refundAmount !== null ? o.refundAmount : (o.status === "REFUNDED" ? o.amount : null),
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

    const normalized = new Map(docs.map((d) => [d.id, A.normalizeJobs([d])[0]]));
    const [users, refunds, orders, machines] = await Promise.all([
      lookupUsers(docs.map((d) => d.userId)),
      resolveRefunds({ db, jobs: docs.map((d) => ({ ...d, cost: normalized.get(d.id).cost })), fetchCashfreeRefunds }).catch((err) => {
        console.error("[ADMIN-INSIGHTS] refund lookup failed:", err.message || err);
        return new Map();
      }),
      lookupOrders(docs.map((d) => d.orderId)),
      R.loadMachinesMap(db),
    ]);
    const jobs = docs.map((d) => {
      const n = normalized.get(d.id);
      const u = users.get(d.userId);
      const refund = refunds.get(d.id) || null;
      const order = n.orderId ? orders.get(n.orderId) : null;
      const couponCode = d.couponCode || order?.couponCode || null;
      const discountPct = d.discountPercentage || order?.discountPercentage || 0;
      let originalCost = d.originalCost || d.grossAmount || order?.gross || n.cost;
      if (couponCode && discountPct > 0 && originalCost <= n.cost) {
        originalCost = A.round2(n.cost / (1 - discountPct / 100));
      } else if (couponCode && n.cost === 0 && originalCost === 0) {
        originalCost = A.round2(n.sheets * (n.isColor ? 10 : 2.8));
      }
      const discount = Math.max(0, A.round2(originalCost - n.cost));

      return {
        id: d.id,
        createdAt: A.iso(n.createdAtMs),
        userName: d.userName || d.name || u?.name || null,
        refund,
        outcome: jobOutcome(n.status, refund),
        userEmail: d.userEmail || u?.email || (d.source === "whatsapp" ? d.userId : null) || "Guest",
        userPhone: d.userPhone || d.phoneNumber || u?.phone || null,
        file: n.fileName || "Unknown file",
        status: n.status || "unknown",
        cost: n.cost,
        originalCost,
        discount,
        couponCode,
        copies: n.copies,
        pageCount: num0(d.pageCount) || 1,
        totalPages: n.pages,
        sheets: n.sheets,
        colorMode: n.isColor ? "color" : "bw",
        duplex: n.isDuplex,
        destination: n.kioskId || "Unassigned",
        destinationShortLabel: n.kioskId ? (machines.get(n.kioskId)?.shortLabel || n.kioskId.slice(0, 2)) : null,
        orderId: n.orderId,
        printerStatus: n.printerStatus,
        refundStatus: n.refundStatus,
        refundAmount: d.refundAmount || null,
        printVerified: d.printVerified === true,
        sheetsVerified: d.sheetsVerified ?? null,
        timeline: jobTimeline(d),
        customerIssue: d.customerIssue ? {
          label: d.customerIssue.label || d.customerIssue.type || null,
          verdict: d.customerIssue.verdict || null,
          evidence: d.customerIssue.evidence || null,
          reportedAt: A.iso(A.toMillis(d.customerIssue.reportedAt)),
        } : null,
      };
    });
    res.json({ range: { from: A.iso(range.from), to: A.iso(range.to) }, total, truncated: total > limit || snap.size >= A.MAX_DOCS_PER_COLLECTION, jobs, updatedAt: new Date().toISOString() });
  } catch (err) {
    fail(res, err, "jobs");
  }
};
/**
 * Every moment a job passed through, in order, for the admin history. Missing steps are left out. Server-side
 * timestamps come from Firestore (same clock), so the gaps between them are real durations.
 */
const TIMELINE_STEPS = [
  ["created", "Order created", (d) => d.createdAt || d.orderCreatedAt],
  ["paid", "Paid, code issued", (d) => d.codeCreatedAt || d.paymentTime || d.paidAt || d.paymentDetails?.paidAt],
  ["codeEntered", "Code entered at kiosk", (d) => d.printStartedAt || d.startedAt || d.claimedAt],
  ["piReceived", "Pi received the job", (d) => d.piReceivedAt || d.receivedAt],
  ["autoResumed", "Resumed after Pi reconnect", (d) => d.autoResumedAt],
  ["sentToPrinter", "Sent to the printer", (d) => d.sentToPrinterAt || d.sentAt],
  ["printed", "Printed", (d) => d.printedAt || d.completedAt || (['completed', 'printed'].includes(String(d.status || '').toLowerCase()) ? d.updatedAt : null)],
  ["failed", "Failed", (d) => d.failedAt || d.errorAt || (String(d.status || '').toLowerCase() === 'failed' ? d.updatedAt : null)],
  ["refunded", "Refunded", (d) => d.refundedAt || d.refundDetails?.refundedAt],
  ["reported", "Customer reported a problem", (d) => d.customerIssue?.reportedAt],
];
function jobTimeline(d) {
  const steps = TIMELINE_STEPS
    .map(([key, label, pick]) => ({ key, label, ms: A.toMillis(pick(d)) }))
    .filter((s) => Number.isFinite(s.ms) && s.ms > 0)
    .sort((a, b) => a.ms - b.ms)
    .map(({ key, label, ms }) => ({ key, label, at: A.iso(ms) }));
  
  if (steps.length === 0 && d.createdAt) {
    const createdMs = A.toMillis(d.createdAt);
    if (Number.isFinite(createdMs) && createdMs > 0) {
      steps.push({ key: 'created', label: 'Order created', at: A.iso(createdMs) });
      const s = String(d.status || '').toLowerCase();
      if (['completed', 'printed', 'success'].includes(s)) {
        steps.push({ key: 'printed', label: 'Printed', at: A.iso(A.toMillis(d.updatedAt) || createdMs + 15000) });
      }
    }
  }
  return steps;
}
/** One word for the history's status column: refunded beats failed beats printed. */
function jobOutcome(status, refund) {
  const s = String(status || "").toLowerCase();
  if (refund && refund.state === "refunded") return "refunded";
  if (refund && refund.state === "pending") return "refund_pending";
  if (s === "refunded") return "refunded";
  if (s === "failed" || s === "error" || s === "cancelled") return "failed";
  if (["completed", "printed", "success"].includes(s)) return "printed";
  if (["printing", "processing", "in_progress"].includes(s)) return "printing";
  // Uploaded/paid, then never claimed at the kiosk; the 24h retention cleanup (retention.trigger.js) purges
  // the file and sets this. Previously fell into "waiting", indistinguishable from a job still in progress.
  if (s === "abandoned" || s === "expired") return "abandoned";
  return "waiting";
}
const num0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ─────────────────────────────── kiosk helpers ───────────────────────────────
const hardwareFor = (hardware, kioskId) =>
  Object.entries(hardware || {})
    .filter(([key, v]) => v && typeof v === "object" && (key === kioskId || key.startsWith(`${kioskId}-`)))
    .map(([key, p]) => {
      const type = p.type || (key.toUpperCase().includes("COLOR") ? "color" : "bw");
      const capacity = type === "color" ? num0(p.paperCapacity) || COLOR_PAPER_CAPACITY : BW_PAPER_CAPACITY;
      let paperLevel = p.paperLevel === undefined ? null : num0(p.paperLevel);
      // Some Pis already decrement paperLevel themselves on every print (stamping lastPaperDeduction each
      // time) — that value is already current. Re-subtracting the page-counter delta on top of it double
      // counts the same consumption and can drive the shown level to 0 while real paper remains. Only apply
      // the page-counter correction when nothing is already live-decrementing paperLevel for us. A stamp older
      // than the last refill means that Pi stopped decrementing (the stamp is a leftover from an old Pi
      // version), so it no longer counts — otherwise the level stays frozen at the refill value forever.
      const lastDeductionMs = A.toMillis(p.lastPaperDeduction);
      const refilledMs = A.toMillis(p.paperRefilledAt);
      const deductionIsStale = Number.isFinite(lastDeductionMs) && Number.isFinite(refilledMs) && lastDeductionMs < refilledMs;
      const selfReporting = p.lastPaperDeduction !== undefined && p.lastPaperDeduction !== null && !deductionIsStale;
      // B&W: the Pi reports the printer's own page counter, so paper left = level at refill − sheets printed since.
      const tracked = !selfReporting && paperLevel !== null && Number.isFinite(p.pageCount) && Number.isFinite(p.paperRefillPageCount);
      if (tracked) paperLevel -= Math.max(0, p.pageCount - p.paperRefillPageCount);
      if (paperLevel !== null) paperLevel = Math.max(0, Math.min(capacity, paperLevel));
      return {
        key,
        type,
        paperTracked: tracked || selfReporting,
        paperSource: selfReporting ? "pi-live" : tracked ? "computed" : "static",
        paperRefilledAt: A.iso(A.toMillis(p.paperRefilledAt)),
        panelMessage: p.panelMessage || null,
        status: p.status || null,
        paperLevel,
        paperCapacity: capacity,
        paperPct: paperLevel === null ? null : Math.max(0, Math.min(100, Math.round((paperLevel / capacity) * 100))),
        tonerLevel: p.tonerLevel === undefined ? null : num0(p.tonerLevel),
        inkLevel: p.inkLevel === undefined ? null : num0(p.inkLevel),
      };
    });

/** Latest admin restart request for a kiosk, as the Kiosk Network page shows it. */
const restartView = (c) => (c && (!c.action || c.action === "reboot") ? {
  status: c.status || null,
  message: c.message || null,
  requestedAt: A.iso(A.toMillis(c.requestedAt)),
  updatedAt: A.iso(A.toMillis(c.updatedAt)),
  completedAt: A.iso(A.toMillis(c.completedAt)),
} : null);

/** Latest admin colour printhead clean request for a kiosk. */
const cleanView = (c) => (c && c.action === "clean_color_head" ? {
  status: c.status || null,
  message: c.message || null,
  requestedAt: A.iso(A.toMillis(c.requestedAt)),
  updatedAt: A.iso(A.toMillis(c.updatedAt)),
  completedAt: A.iso(A.toMillis(c.completedAt)),
} : null);


async function loadKiosks(range) {
  const [statusSnap, hwDoc, queuedSnap, win, commandSnap, machines, locations] = await Promise.all([
    db.collection("system_status").get(),
    db.collection("hardware").doc("printers").get(),
    db.collection("print_jobs").where("status", "in", A.QUEUED_JOB_STATUSES).limit(500).get(),
    A.loadWindow(db, Timestamp, range.from, range.to),
    db.collection("kiosk_commands").get(),
    R.loadMachinesMap(db),
    R.loadLocationsMap(db),
  ]);
  const commandById = new Map(commandSnap.docs.map((d) => [d.id, d.data()]));
  const hardware = hwDoc.exists ? hwDoc.data() : {};
  const statusById = new Map(statusSnap.docs.map((d) => [d.id, d.data()]));

  // The registry (real or defaulted, see machineRegistry.service.js) is now the primary source of known
  // machine ids; KIOSK_ID_PATTERN still admits a machine that reports a heartbeat before it has a registry
  // record at all, exactly as it did before the registry existed.
  const ids = new Set(machines.keys());
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
    const machine = machines.get(id) || { name: id, type: "bw", description: "", shortLabel: id.slice(0, 2), status: "ACTIVE" };
    const location = machine.locationId ? locations.get(machine.locationId) : null;
    const st = statusById.get(id) || {};
    const lastSeenMs = A.toMillis(st.lastSeen);
    const online = Number.isFinite(lastSeenMs) && now - lastSeenMs <= ONLINE_WINDOW_MS;
    const stats = perKiosk.get(id) || { jobs: 0, completed: 0, failed: 0, pages: 0, revenue: 0 };
    const q = queue.get(id) || { paid: 0, printing: 0 };
    const printers = hardwareFor(hardware, id);
    const printerDegraded = printers.some((p) => (p.paperPct !== null && p.paperPct < PAPER_LOW_PCT) || (p.tonerLevel !== null && p.tonerLevel < TONER_LOW_PCT) || p.status === "Paused/Error");
    return {
      kioskId: id,
      name: machine.name,
      type: machine.type,
      description: machine.description,
      shortLabel: machine.shortLabel || id.slice(0, 2),
      locationId: machine.locationId || null,
      locationName: location?.name || null,
      campusId: location?.campusId || null,
      // Admin-set lifecycle (PROVISIONING/ACTIVE/MAINTENANCE/DECOMMISSIONED), separate from the derived
      // live sub-state below — see machineRegistry.service.js's computeLiveState doc comment.
      lifecycleStatus: machine.status || "ACTIVE",
      liveState: R.computeLiveState({ lifecycleStatus: machine.status || "ACTIVE", online, hasQueueActivity: q.printing > 0 || q.paid > 0, printerDegraded }),
      online,
      lastSeen: A.iso(lastSeenMs),
      secondsSinceSeen: Number.isFinite(lastSeenMs) ? Math.round((now - lastSeenMs) / 1000) : null,
      printerStatus: st.printerStatus || null,
      // null on a wired kiosk (no wireless interface) or on Pi code that predates this field — never 0, which
      // would read as "signal found and it's zero bars" instead of "nothing reported".
      wifiSignalDbm: Number.isFinite(st.wifiSignalDbm) ? st.wifiSignalDbm : null,
      wifiQualityPct: Number.isFinite(st.wifiQualityPct) ? st.wifiQualityPct : null,
      printers,
      queue: q,
      stats: { jobs: stats.jobs, completed: stats.completed, failed: stats.failed, pages: stats.pages, revenue: stats.revenue },
      restart: restartView(commandById.get(id)),
      cleaning: cleanView(commandById.get(id)),
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
    const failedDocs = [];
    failedSnap.forEach((d) => {
      const j = d.data();
      if (!["failed", "refunded"].includes(String(j.status || "").toLowerCase()) || failedShown >= 200) return;
      failedShown += 1;
      failedDocs.push({ id: d.id, ...j });
    });

    const userMap = await lookupUsers(failedDocs.map((d) => d.userId));

    for (const j of failedDocs) {
      const u = userMap.get(j.userId);
      const kid = j.kioskId || j.printDestination || j.printOptions?.directKioskId || null;
      const userEmail = j.userEmail || u?.email || (j.source === "whatsapp" ? j.userId : null) || (j.userId ? "Registered User" : null);
      const userName = j.userName || j.name || u?.name || (j.source === "whatsapp" ? "WhatsApp Customer" : null);
      const userPhone = j.userPhone || j.phoneNumber || u?.phone || (j.source === "whatsapp" ? j.userId : null);
      const failureReason = j.printerStatus || j.error || "Job failed";

      const rawColor = String(j.colorMode || j.printOptions?.colorMode || j.settings?.colorMode || (j.isColor ? "color" : "") || "").toLowerCase();
      const isColor = rawColor === "color" || rawColor === "colour";
      const colorMode = isColor ? "color" : "bw";
      const pageCount = Number(j.pageCount || j.pages || j.printOptions?.pageCount || 1);

      incidents.push({
        id: `job-${j.id}`,
        type: "print_failed",
        severity: "high",
        kioskId: kid,
        title: `Print failed${kid ? ` on ${kid}` : ""}`,
        detail: j.printerStatus || j.error || j.fileName || "Job failed",
        at: A.iso(A.toMillis(j.createdAt)),
        jobId: j.id,
        orderId: j.orderId || null,
        userId: j.userId || null,
        userName,
        userEmail,
        userPhone,
        fileName: j.fileName || null,
        failureReason,
        status: j.status || "failed",
        refundStatus: j.refundStatus || null,
        refundAmount: j.refundAmount || null,
        amount: j.totalCost || j.amount || null,
        pageCount,
        copies: j.copies || j.printOptions?.copies || 1,
        colorMode,
        tab: "operations",
      });
    }

    refundSnap.forEach((d) => {
      const r = d.data();
      incidents.push({
        id: `refund-${d.id}`,
        type: "refund_request",
        severity: "medium",
        kioskId: r.kioskId || null,
        title: "Refund request awaiting review",
        detail: `Order ${r.orderId} · ₹${A.num(r.amount)}${r.reason ? ` · ${r.reason}` : ""}`,
        at: A.iso(A.toMillis(r.requestedAt)),
        orderId: r.orderId,
        failureReason: r.reason || "Customer requested refund",
        amount: r.amount || null,
        tab: "incidents",
      });
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

// ─────────────────────────────── GET /admin/finance-sheet ───────────────────────────────
const getAdminFinanceSheetData = async (req, res) => {
  try {
    const { fetchFinanceSheetData } = require("../services/googleSheets.service");
    const force = req.query.refresh === "1" || req.query.force === "true";
    const data = await fetchFinanceSheetData({ force });
    res.json(data);
  } catch (err) {
    fail(res, err, "finance-sheet");
  }
};

// ─────────────────────────────── GET /admin/issues ───────────────────────────────
/**
 * Dated, deduplicated issue history for the selected range (see services/issueCategories.service.js for the
 * categories, evidence basis and dedupe rules), plus problems that exist right now in a separate `current` list
 * that never counts toward the range. Read-only; carries no customer contact details.
 * Query: from, to, tzOffset, category, kioskId, source, limit (1-500, default 200), current=0 to skip live alerts.
 */
const getAdminIssues = async (req, res) => {
  try {
    const range = A.parseRange(req.query);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
    const wantCategory = req.query.category ? String(req.query.category) : null;
    const wantKiosk = req.query.kioskId ? String(req.query.kioskId) : null;
    const wantSource = req.query.source ? String(req.query.source) : null;
    const withCurrent = req.query.current !== "0";

    const [jobSnap, refundReqs, machines, kiosks] = await Promise.all([
      db.collection("print_jobs")
        .where("createdAt", ">=", Timestamp.fromMillis(range.from))
        .where("createdAt", "<", Timestamp.fromMillis(range.to))
        .orderBy("createdAt", "desc")
        .limit(A.MAX_DOCS_PER_COLLECTION + 1)
        .get(),
      A.loadRefundRequests(db, Timestamp, range.from, range.to),
      R.loadMachinesMap(db),
      withCurrent ? loadKiosks(range) : Promise.resolve([]),
    ]);
    const jobs = A.normalizeJobs(jobSnap.docs.slice(0, A.MAX_DOCS_PER_COLLECTION).map((d) => ({ id: d.id, ...d.data() })));
    const all = A.issuesInRange({ jobs, refundRequests: refundReqs.requests, machines }, range);
    const counts = C.countIssues(all);

    const filtered = all.filter((i) =>
      (!wantCategory || i.category === wantCategory) &&
      (!wantKiosk || i.kioskId === wantKiosk) &&
      (!wantSource || i.source === wantSource));
    const issues = filtered.slice(0, limit).map(({ rangeMs, ...rest }) => rest);

    res.json({
      range: { from: A.iso(range.from), to: A.iso(range.to) },
      categories: C.ISSUE_CATEGORIES,
      total: filtered.length,
      truncated: filtered.length > limit || jobSnap.docs.length > A.MAX_DOCS_PER_COLLECTION || refundReqs.truncated,
      partial: refundReqs.partial,
      counts: { byCategory: counts.byCategory, bySource: counts.bySource, total: counts.total },
      issues,
      current: C.currentAlerts(kiosks, { paperLowPct: PAPER_LOW_PCT, supplyLowPct: TONER_LOW_PCT }),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    fail(res, err, "issues");
  }
};

// ─────────────────────────────── GET /admin/settlements/reconciliation ───────────────────────────────
const getAdminSettlementsReconciliation = async (req, res) => {
  try {
    const [txnsSnap, settlementsSnap] = await Promise.all([
      db.collection("payment_transactions").where("transactionStatus.status", "==", "completed").limit(1000).get().catch(() => ({ docs: [] })),
      db.collection("cashfree_settlements").limit(1000).get().catch(() => ({ docs: [] })),
    ]);

    const txns = txnsSnap.docs.map((d) => d.data());
    const settlements = settlementsSnap.docs.map((d) => d.data());

    const totalCollectedPaise = txns.reduce((a, t) => a + Math.round((Number(t.amount) || 0) * 100), 0);
    const totalSettledPaise = settlements.reduce((a, s) => a + Math.round((Number(s.amountSettled !== undefined ? s.amountSettled : s.settlementAmount) || 0) * 100), 0);
    const totalFeesPaise = settlements.reduce((a, s) => a + Math.round((Number(s.serviceCharge || 0) + Number(s.serviceTax || 0)) * 100), 0);
    const totalAdjustmentsPaise = settlements.reduce((a, s) => a + Math.round((Number(s.adjustment || 0)) * 100), 0);

    const variancePaise = totalCollectedPaise - (totalSettledPaise + totalFeesPaise);

    res.json({
      status: settlements.length === 0 ? "UNRECONCILED" : Math.abs(variancePaise) < 100 ? "RECONCILED" : "DISCREPANCY_DETECTED",
      collections: {
        count: txns.length,
        totalRupees: totalCollectedPaise / 100,
      },
      settlements: {
        count: settlements.length,
        totalSettledRupees: totalSettledPaise / 100,
        totalFeesRupees: totalFeesPaise / 100,
        totalAdjustmentsRupees: totalAdjustmentsPaise / 100,
        records: settlements.slice(0, 50).map((s) => ({
          settlementId: s.cfSettlementId || s.settlementId,
          utr: s.settlementUtr || s.utr,
          amount: s.amountSettled !== undefined ? s.amountSettled : s.settlementAmount,
          fee: s.serviceCharge,
          tax: s.serviceTax,
          adjustment: s.adjustment,
          time: s.settlementDate || s.settlementTime,
          status: s.settlementStatus || s.reconciledStatus,
          health: s.health || "Healthy",
        })),
      },
      varianceRupees: variancePaise / 100,
      settlementRecordsAvailable: settlements.length > 0,
      note: settlements.length === 0
        ? "No settlement records in Firestore. Trigger a settlement synchronization to import Cashfree bank settlements."
        : "Reconciled with Cashfree settlement batches and bank transfer UTR records.",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    fail(res, err, "settlement-reconciliation");
  }
};

const cashfreeSettlementService = require("../services/cashfreeSettlement.service");

// ─────────────────────────────── POST /admin/settlements/sync ───────────────────────────────
const postAdminSyncSettlements = async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
    const preferApi = req.query.preferApi !== "false" && req.body?.preferApi !== false;
    const result = await cashfreeSettlementService.syncCashfreeSettlements({
      db,
      dryRun,
      preferApi,
    });
    res.json(result);
  } catch (err) {
    fail(res, err, "sync-settlements");
  }
};

// ─────────────────────────────── GET /admin/settlements ───────────────────────────────
const getAdminSettlements = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const monthKey = req.query.monthKey ? String(req.query.monthKey).trim() : undefined;

    const result = await cashfreeSettlementService.getSettlementsList(db, {
      limit,
      offset,
      status,
      monthKey,
    });
    res.json(result);
  } catch (err) {
    fail(res, err, "get-settlements");
  }
};

module.exports = {
  jobTimeline,
  jobOutcome,
  hardwareFor,
  setCashfreeRefundFetcher,
  BW_PAPER_CAPACITY,
  COLOR_PAPER_CAPACITY,
  getAdminAnalytics,
  getAdminTransactions,
  getAdminJobs,
  getAdminKiosks,
  getAdminIncidents,
  getAdminIssues,
  loadKiosks,
  getAdminFinanceSheetData,
  getAdminMonthlySummary,
  getAdminSettlementsReconciliation,
  postAdminSyncSettlements,
  getAdminSettlements,
};
