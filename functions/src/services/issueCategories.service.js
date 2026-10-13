/**
 * Reporting-only classification for the admin dashboard: one outcome per print job, and one issue per real
 * problem. Pure (no Firestore access) so it can be unit-tested with plain objects, like analytics.service.js.
 *
 * Nothing here changes a workflow status. A job's stored `status` is read, never rewritten; the reporting outcome
 * exists only so every dashboard number uses the same, mutually exclusive buckets.
 *
 * Issue categories are evidence-labelled:
 *  - basis "exact":    the system's own fixed message (print-timeout sweep, Pi's "Job expired", heartbeat state)
 *  - basis "inferred": matched from a free-text failure reason; the raw text is always returned as evidence
 *  - basis "customer": raised by a customer (problem report, refund request), not proven by the machine
 *  - basis "unknown":  no reason recorded, or a reason no rule recognises (category "other")
 */
const { PRINT_TIMEOUT_MESSAGE } = require("./printTimeout.service");

const ISSUE_CATEGORIES = [
  { id: "paper", label: "Paper" },
  { id: "printer", label: "Printer" },
  { id: "network", label: "Network" },
  { id: "payment", label: "Payment" },
  { id: "print_failure", label: "Print failure" },
  { id: "timeout", label: "Timeout" },
  { id: "machine_pi", label: "Machine / Pi" },
  { id: "ink_toner", label: "Ink / Toner" },
  { id: "other", label: "Other / Unknown" },
];
const CATEGORY_LABEL = Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c.id, c.label]));

// Messages the system itself writes with a fixed meaning (printTimeout.service.js; both Pi listeners' 15-minute
// expiry). Matched in full, so they are "exact" rather than "inferred".
const EXACT_MESSAGES = new Map([
  [PRINT_TIMEOUT_MESSAGE.toLowerCase(), "timeout"],
  ["job expired", "timeout"],
]);

// First match wins. Order matters: the timeout message mentions "printer not responding", and a short-print
// reason embeds the panel text ("printer shows: Toner Low"), so the specific causes are tested first.
const FAILURE_RULES = [
  ["timeout", /print timeout|job expired|timed out/],
  ["paper", /out of paper|\bjam\b|media-(empty|jam|needed)|add paper|load paper|no paper|paper empty|input tray/],
  ["ink_toner", /toner|drum|\bink\b|cartridge/],
  ["printer", /cover|door|printer is offline|queue is disabled|paused|did not print any page|stopped after|printer .*status check/],
  ["network", /failed to download|network|connection|unreachable/],
  // Only the Pi's own failures; "CUPS error on Pi" is a print failure and falls through to the next rule.
  ["machine_pi", /pi processing error|monitoring unavailable/],
  ["print_failure", /file|pdf|libreoffice|photo format|cups|could not be prepared/],
];

/** Category for a failed job's recorded reason (printerStatus). Never guesses: unmatched text is "other". */
function classifyFailureText(text) {
  const raw = String(text || "").trim();
  if (!raw) return { category: "other", basis: "unknown" };
  const t = raw.toLowerCase();
  if (EXACT_MESSAGES.has(t)) return { category: EXACT_MESSAGES.get(t), basis: "exact" };
  for (const [category, re] of FAILURE_RULES) if (re.test(t)) return { category, basis: "inferred" };
  return { category: "other", basis: "unknown" };
}

// ─────────────────────────────── job outcome ───────────────────────────────

const FAILED_STATUSES = new Set(["failed", "error", "cancelled"]);
const SUCCESS_STATUSES = new Set(["completed", "printed", "success"]);
const IN_PROGRESS_STATUSES = new Set(["pending", "paid", "printing", "processing", "uploaded", "in_progress"]);
const ABANDONED_STATUSES = new Set(["abandoned", "expired"]);
// printerStatus values that are NOT a failure reason (written on success, or a display default).
const NON_FAILURE_PRINTER_STATUS = new Set(["", "printed", "completed", "pending", "waiting", "printing"]);

const OUTCOMES = ["successful", "failed", "refunded_unprinted", "in_progress", "abandoned", "unknown"];

const hasFailureReason = (j) => !NON_FAILURE_PRINTER_STATUS.has(String(j.printerStatus || "").trim().toLowerCase());

/**
 * Exactly one reporting outcome per job (a normalised job from analytics.service.normalizeJobs). First rule wins:
 *  1. failed/error/cancelled status                         -> failed
 *  2. refunded: printed first                               -> successful (the refund shows in revenue)
 *               failedAt or a failure reason recorded       -> failed (an admin refund overwrote "failed")
 *               otherwise                                   -> refunded_unprinted (not in the success rate)
 *  3. completed/printed/success status, or isPrinted        -> successful
 *  4. still queued or printing                              -> in_progress
 *  5. abandoned/expired                                     -> abandoned
 *  6. anything else                                         -> unknown
 */
function reportingOutcome(j) {
  const s = String(j.status || "").toLowerCase();
  const printed = j.isPrinted === true || Number.isFinite(j.printedAtMs);
  if (FAILED_STATUSES.has(s)) return "failed";
  if (s === "refunded") {
    if (printed) return "successful";
    if (Number.isFinite(j.failedAtMs) || hasFailureReason(j)) return "failed";
    return "refunded_unprinted";
  }
  if (SUCCESS_STATUSES.has(s) || j.isPrinted === true) return "successful";
  if (IN_PROGRESS_STATUSES.has(s)) return "in_progress";
  if (ABANDONED_STATUSES.has(s)) return "abandoned";
  return "unknown";
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Job KPIs from mutually exclusive outcomes; the bucket counts always add up to `total`. */
function summarizeJobOutcomes(jobs) {
  const c = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  let pages = 0;
  for (const j of jobs) {
    const o = reportingOutcome(j);
    c[o] += 1;
    if (o === "successful") pages += j.pages || 0;
  }
  const finished = c.successful + c.failed;
  return {
    total: jobs.length,
    successful: c.successful,
    failed: c.failed,
    refundedUnprinted: c.refunded_unprinted,
    inProgress: c.in_progress,
    abandoned: c.abandoned,
    unknown: c.unknown,
    successRate: finished ? round2((c.successful / finished) * 100) : null,
    pages,
  };
}

// ─────────────────────────────── issues ───────────────────────────────

const toMs = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  if (typeof v === "object" && typeof v._seconds === "number") return v._seconds * 1000;
  return NaN;
};
const isoOf = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const first = (...v) => v.find((x) => Number.isFinite(x));

/**
 * Deduplicated issues for a set of jobs (normalised) and refund requests (raw docs with `id`).
 * Dedupe rules:
 *  1. one job-failure issue per job id;
 *  2. one customer report = one issue: the kiosk writes the same report object (one server timestamp) onto every
 *     recent job with that print code, so those copies are grouped by printCode|kioskId|reportedAt;
 *  3. a report on a job that already has a failure issue (or with verdict "already_failed") is attached to that
 *     failure as related evidence, not counted again;
 *  4. a refund request whose orderId already belongs to a failure issue is attached to it, not counted again.
 * `rangeMs` is the instant that decides range membership (the job's createdAt, or the request's requestedAt).
 * No customer contact details are copied into an issue.
 */
function buildIssues({ jobs = [], refundRequests = [], machines = new Map() } = {}) {
  const machineName = (id) => (id ? (machines.get(id) && machines.get(id).name) || id : null);
  const issues = [];
  const failureByJob = new Map();
  const failureByOrder = new Map();

  for (const j of jobs) {
    if (reportingOutcome(j) !== "failed") continue;
    const { category, basis } = classifyFailureText(j.printerStatus);
    const issue = {
      id: `job-${j.id}`,
      category,
      basis,
      source: "job_failure",
      severity: "high",
      kioskId: j.kioskId || null,
      machineName: machineName(j.kioskId),
      at: isoOf(first(j.failedAtMs, j.createdAtMs)),
      rangeMs: j.createdAtMs,
      jobId: j.id,
      jobIds: [j.id],
      orderId: j.orderId || null,
      title: `${CATEGORY_LABEL[category]}${j.kioskId ? ` on ${machineName(j.kioskId)}` : ""}`,
      evidence: { printerStatus: j.printerStatus || null, printVerified: j.printVerified === true, sheetsVerified: j.sheetsVerified ?? null },
      related: [],
    };
    issues.push(issue);
    failureByJob.set(j.id, issue);
    if (j.orderId && !failureByOrder.has(j.orderId)) failureByOrder.set(j.orderId, issue);
  }

  const reports = new Map();
  for (const j of jobs) {
    const ci = j.customerIssue;
    if (!ci || typeof ci !== "object") continue;
    const reportedMs = toMs(ci.reportedAt);
    const key = Number.isFinite(reportedMs) ? `${j.printCode || ""}|${ci.kioskId || j.kioskId || ""}|${reportedMs}` : `job:${j.id}`;
    const r = reports.get(key) || { ci, reportedMs, jobs: [] };
    r.jobs.push(j);
    reports.set(key, r);
  }
  for (const [key, r] of reports) {
    const related = {
      type: "customer_report",
      label: r.ci.label || r.ci.type || null,
      verdict: r.ci.verdict || null,
      note: r.ci.evidence || null,
      at: isoOf(r.reportedMs),
      jobIds: r.jobs.map((j) => j.id),
    };
    const failure = r.jobs.map((j) => failureByJob.get(j.id)).find(Boolean);
    if (failure) {
      failure.related.push(related);
      continue;
    }
    const lead = r.jobs[0];
    const kioskId = r.ci.kioskId || lead.kioskId || null;
    issues.push({
      id: `report-${key}`,
      category: "print_failure",
      basis: "customer",
      source: "customer_report",
      severity: "medium",
      kioskId,
      machineName: machineName(kioskId),
      at: isoOf(first(r.reportedMs, lead.createdAtMs)),
      rangeMs: Math.min(...r.jobs.map((j) => (Number.isFinite(j.createdAtMs) ? j.createdAtMs : Infinity))),
      jobId: lead.id,
      jobIds: related.jobIds,
      orderId: lead.orderId || null,
      title: `Customer reported: ${related.label || "a problem"}`,
      evidence: { verdict: related.verdict, note: related.note, printVerified: lead.printVerified === true, sheetsVerified: lead.sheetsVerified ?? null },
      related: [],
    });
  }

  for (const rr of refundRequests) {
    const requestedMs = toMs(rr.requestedAt);
    const failure = rr.orderId ? failureByOrder.get(rr.orderId) : null;
    if (failure) {
      failure.related.push({ type: "refund_request", status: rr.status || null, at: isoOf(requestedMs), requestId: rr.id });
      continue;
    }
    issues.push({
      id: `refund-${rr.id}`,
      category: "payment",
      basis: "customer",
      source: "refund_request",
      severity: "low",
      kioskId: null,
      machineName: null,
      at: isoOf(requestedMs),
      rangeMs: requestedMs,
      jobId: null,
      jobIds: [],
      orderId: rr.orderId || null,
      title: "Refund requested by customer",
      evidence: { status: rr.status || null, amount: Number.isFinite(Number(rr.amount)) ? Number(rr.amount) : null, reason: rr.reason || null },
      related: [],
    });
  }

  issues.sort((a, b) => (toMs(b.at) || 0) - (toMs(a.at) || 0));
  return issues;
}

/** Totals for a list of issues; every category is present (0 when empty) so charts keep a stable order. */
function countIssues(issues) {
  const byCategory = new Map(ISSUE_CATEGORIES.map((c) => [c.id, 0]));
  const bySource = { job_failure: 0, customer_report: 0, refund_request: 0 };
  for (const i of issues) {
    byCategory.set(i.category, (byCategory.get(i.category) || 0) + 1);
    bySource[i.source] = (bySource[i.source] || 0) + 1;
  }
  return {
    total: issues.length,
    detected: bySource.job_failure,
    customerReported: bySource.customer_report,
    payment: bySource.refund_request,
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, label: CATEGORY_LABEL[category], count })),
    bySource,
  };
}

/**
 * Problems that exist right now (from the live kiosk view), kept apart from the dated history: they have no
 * reliable start time and are never added to range totals. Thresholds mirror GET /admin/incidents.
 */
function currentAlerts(kiosks = [], { paperLowPct = 15, supplyLowPct = 20 } = {}) {
  const out = [];
  for (const k of kiosks) {
    const base = { kioskId: k.kioskId, machineName: k.name || k.kioskId, at: k.lastSeen || null };
    if (!k.online) {
      out.push({ ...base, id: `now-offline-${k.kioskId}`, category: "machine_pi", basis: "exact", severity: "high", title: `${k.name || k.kioskId} is offline`, evidence: { note: "No heartbeat for over 5 minutes. A network outage and a stopped Pi look the same from here.", secondsSinceSeen: k.secondsSinceSeen ?? null } });
      continue;
    }
    if (/paused\/error/i.test(k.printerStatus || "")) {
      out.push({ ...base, id: `now-printer-${k.kioskId}`, category: "printer", basis: "exact", severity: "high", title: `Printer queue paused or in error on ${k.name || k.kioskId}`, evidence: { printerStatus: k.printerStatus } });
    }
    for (const p of k.printers || []) {
      if (p.paperPct !== null && p.paperPct !== undefined && p.paperPct < paperLowPct) {
        out.push({ ...base, id: `now-paper-${p.key}`, category: "paper", basis: "inferred", severity: p.paperPct < 5 ? "high" : "medium", title: `Paper low on ${k.name || k.kioskId}`, evidence: { printerKey: p.key, paperLevel: p.paperLevel, paperCapacity: p.paperCapacity, paperPct: p.paperPct } });
      }
      const supply = p.tonerLevel ?? p.inkLevel;
      if (supply !== null && supply !== undefined && supply < supplyLowPct) {
        out.push({ ...base, id: `now-supply-${p.key}`, category: "ink_toner", basis: "inferred", severity: "medium", title: `${p.type === "color" ? "Ink" : "Toner"} low on ${k.name || k.kioskId}`, evidence: { printerKey: p.key, reportedLevel: supply, panelMessage: p.panelMessage || null } });
      }
    }
  }
  return out;
}

module.exports = {
  ISSUE_CATEGORIES,
  OUTCOMES,
  classifyFailureText,
  reportingOutcome,
  summarizeJobOutcomes,
  buildIssues,
  countIssues,
  currentAlerts,
};
