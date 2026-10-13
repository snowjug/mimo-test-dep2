// Reporting-only classification (services/issueCategories.service.js): one outcome per job, evidence-labelled
// issue categories, and the dedupe rules the admin issue history relies on.
const test = require("node:test");
const assert = require("node:assert");
const C = require("../src/services/issueCategories.service");
const { PRINT_TIMEOUT_MESSAGE } = require("../src/services/printTimeout.service");

// Every failure reason the backend and both Pi listeners write into print_jobs.printerStatus, with the category a
// person reading it would pick. Strings are copied from the source (f-strings filled with sample values).
const KNOWN_REASONS = [
  [PRINT_TIMEOUT_MESSAGE, "timeout", "exact"],
  ["Job expired", "timeout", "exact"],
  ["Print timeout — no response from printer", "timeout", "inferred"],
  ["Printer out of paper", "paper", "inferred"],
  ["Paper jam detected", "paper", "inferred"],
  ["Input tray missing", "paper", "inferred"],
  ["Printer Brother_HL_L2440DW_series is out of paper. Please add paper to the tray.", "paper", "inferred"],
  ["Printer Brother_HL_L2440DW_series has a paper jam. Please clear paper jam.", "paper", "inferred"],
  ["Printer needs new toner or drum (Replace Toner). You have not been charged for this print.", "ink_toner", "inferred"],
  ["The printer did not print any page (printer shows: Toner Low). You will be refunded.", "ink_toner", "inferred"],
  ["The printer stopped after 2 of 5 sheets (printer shows: No Paper). You will be refunded.", "paper", "inferred"],
  ["The printer did not print any page (printer shows: Ready). You will be refunded.", "printer", "inferred"],
  ["Printer cover is open", "printer", "inferred"],
  ["Printer Epson_L3250 cover/door is open.", "printer", "inferred"],
  ["Printer is offline", "printer", "inferred"],
  ["Printer Epson_L3250 queue is disabled or offline", "printer", "inferred"],
  ["Printer Epson_L3250 status check failed", "printer", "inferred"],
  ["Printer status check error: boom", "printer", "inferred"],
  ["Failed to download report.pdf", "network", "inferred"],
  ["Pi processing error: something broke", "machine_pi", "inferred"],
  ["Printer monitoring unavailable on the Pi (pycups missing)", "machine_pi", "inferred"],
  ["CUPS error on Pi", "print_failure", "inferred"],
  ["CUPS print error", "print_failure", "inferred"],
  ["CUPS rejected the print job: client-error-document-format-not-supported", "print_failure", "inferred"],
  ["Uploaded file is empty or too small (12 bytes)", "print_failure", "inferred"],
  ["File could not be prepared for printing: a.docx", "print_failure", "inferred"],
  ["LibreOffice failed for a.docx", "print_failure", "inferred"],
  ["This photo format could not be printed on this machine: a.heic", "print_failure", "inferred"],
  ["Print failed", "other", "unknown"],
  ["Something nobody has seen before", "other", "unknown"],
  ["", "other", "unknown"],
  [null, "other", "unknown"],
];

test("every failure reason written in the repo maps to the expected category and basis", () => {
  for (const [text, category, basis] of KNOWN_REASONS) {
    assert.deepStrictEqual(C.classifyFailureText(text), { category, basis }, `reason: ${JSON.stringify(text)}`);
  }
});

test("the timeout message wins over its 'printer not responding' wording", () => {
  assert.strictEqual(C.classifyFailureText(PRINT_TIMEOUT_MESSAGE).category, "timeout");
});

test("the nine categories are fixed and ordered", () => {
  assert.deepStrictEqual(C.ISSUE_CATEGORIES.map((c) => c.id),
    ["paper", "printer", "network", "payment", "print_failure", "timeout", "machine_pi", "ink_toner", "other"]);
});

// ─────────────────────────────── job outcome ───────────────────────────────

const job = (over) => ({ id: "j", status: "completed", isPrinted: false, printedAtMs: NaN, failedAtMs: NaN, printerStatus: null, pages: 1, createdAtMs: 1000, ...over });

test("reportingOutcome follows the documented precedence", () => {
  const cases = [
    [{ status: "failed" }, "failed"],
    [{ status: "failed", isPrinted: true }, "failed"],
    [{ status: "error" }, "failed"],
    [{ status: "cancelled" }, "failed"],
    [{ status: "refunded", isPrinted: true }, "successful"],
    [{ status: "refunded", printedAtMs: 5 }, "successful"],
    [{ status: "refunded", failedAtMs: 5 }, "failed"],
    [{ status: "refunded", printerStatus: PRINT_TIMEOUT_MESSAGE }, "failed"],
    [{ status: "refunded", printerStatus: "Printed" }, "refunded_unprinted"],
    [{ status: "refunded" }, "refunded_unprinted"],
    [{ status: "completed" }, "successful"],
    [{ status: "printed" }, "successful"],
    [{ status: "success" }, "successful"],
    [{ status: "paid", isPrinted: true }, "successful"],
    [{ status: "paid" }, "in_progress"],
    [{ status: "printing" }, "in_progress"],
    [{ status: "pending" }, "in_progress"],
    [{ status: "abandoned" }, "abandoned"],
    [{ status: "expired" }, "abandoned"],
    [{ status: "weird" }, "unknown"],
    [{ status: "" }, "unknown"],
  ];
  for (const [over, expected] of cases) assert.strictEqual(C.reportingOutcome(job(over)), expected, JSON.stringify(over));
});

test("outcome buckets are mutually exclusive and add up to the total", () => {
  const jobs = ["completed", "failed", "refunded", "paid", "abandoned", "weird", "printed"].map((status, i) => job({ id: `j${i}`, status, pages: 2 }));
  jobs.push(job({ id: "j8", status: "refunded", isPrinted: true, pages: 3 }));
  const s = C.summarizeJobOutcomes(jobs);
  assert.strictEqual(s.total, 8);
  assert.strictEqual(s.successful + s.failed + s.refundedUnprinted + s.inProgress + s.abandoned + s.unknown, s.total);
  assert.deepStrictEqual([s.successful, s.failed, s.refundedUnprinted, s.inProgress, s.abandoned, s.unknown], [3, 1, 1, 1, 1, 1]);
  assert.strictEqual(s.pages, 7, "pages only from successful jobs");
  assert.strictEqual(s.successRate, 75, "3 / (3 + 1); refunded-unprinted is outside the denominator");
});

test("success rate is null when nothing finished", () => {
  assert.strictEqual(C.summarizeJobOutcomes([job({ status: "paid" }), job({ status: "refunded" })]).successRate, null);
  assert.strictEqual(C.summarizeJobOutcomes([]).successRate, null);
});

// ─────────────────────────────── issues and dedupe ───────────────────────────────

const machines = new Map([["CV-001", { name: "MIMO 1.0" }]]);

test("one failure issue per failed job, labelled with its evidence and no customer contact details", () => {
  const issues = C.buildIssues({
    jobs: [
      job({ id: "a", status: "failed", kioskId: "CV-001", orderId: "o1", printerStatus: "Printer out of paper", failedAtMs: 5000, userEmail: "x@y.z" }),
      job({ id: "b", status: "completed", kioskId: "CV-001" }),
    ],
    machines,
  });
  assert.strictEqual(issues.length, 1);
  const [i] = issues;
  assert.strictEqual(i.id, "job-a");
  assert.strictEqual(i.category, "paper");
  assert.strictEqual(i.basis, "inferred");
  assert.strictEqual(i.source, "job_failure");
  assert.strictEqual(i.machineName, "MIMO 1.0");
  assert.strictEqual(i.at, new Date(5000).toISOString());
  assert.strictEqual(i.rangeMs, 1000, "range membership follows the job's createdAt");
  assert.strictEqual(i.evidence.printerStatus, "Printer out of paper");
  assert.ok(!JSON.stringify(i).includes("x@y.z"));
});

test("one customer report copied onto several jobs is a single issue", () => {
  const report = { type: "blank", label: "Blank pages", kioskId: "CV-001", verdict: "needs_proof", evidence: "cannot see ink", reportedAt: new Date(9000) };
  const issues = C.buildIssues({
    jobs: [
      job({ id: "a", printCode: "1234", kioskId: "CV-001", customerIssue: report, createdAtMs: 2000 }),
      job({ id: "b", printCode: "1234", kioskId: "CV-001", customerIssue: { ...report, reportedAt: new Date(9000) }, createdAtMs: 1500 }),
    ],
    machines,
  });
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].source, "customer_report");
  assert.strictEqual(issues[0].category, "print_failure");
  assert.strictEqual(issues[0].basis, "customer");
  assert.deepStrictEqual(issues[0].jobIds.sort(), ["a", "b"]);
  assert.strictEqual(issues[0].rangeMs, 1500);
  assert.strictEqual(issues[0].evidence.verdict, "needs_proof");
});

test("reports with different timestamps stay separate; a report without one is keyed by its job", () => {
  const issues = C.buildIssues({
    jobs: [
      job({ id: "a", printCode: "1", customerIssue: { type: "blank", reportedAt: new Date(1) } }),
      job({ id: "b", printCode: "1", customerIssue: { type: "blank", reportedAt: new Date(2) } }),
      job({ id: "c", printCode: "1", customerIssue: { type: "other" } }),
    ],
  });
  assert.strictEqual(issues.length, 3);
});

test("a report on an already-failed job is attached to the failure, not counted twice", () => {
  const issues = C.buildIssues({
    jobs: [job({ id: "a", status: "failed", printerStatus: "CUPS print error", customerIssue: { type: "missing", verdict: "already_failed", reportedAt: new Date(3) } })],
  });
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].source, "job_failure");
  assert.strictEqual(issues[0].related.length, 1);
  assert.strictEqual(issues[0].related[0].type, "customer_report");
});

test("a refund request for an order that already failed is attached; others become payment issues", () => {
  const issues = C.buildIssues({
    jobs: [job({ id: "a", status: "failed", orderId: "o1", printerStatus: "Job expired" })],
    refundRequests: [
      { id: "r1", orderId: "o1", status: "pending", requestedAt: new Date(10) },
      { id: "r2", orderId: "o2", status: "pending", amount: "12", reason: "changed my mind", requestedAt: new Date(20) },
    ],
  });
  assert.strictEqual(issues.length, 2);
  const failure = issues.find((i) => i.id === "job-a");
  assert.strictEqual(failure.related[0].type, "refund_request");
  const pay = issues.find((i) => i.id === "refund-r2");
  assert.strictEqual(pay.category, "payment");
  assert.strictEqual(pay.source, "refund_request");
  assert.strictEqual(pay.evidence.amount, 12);
  assert.strictEqual(pay.rangeMs, 20);
});

test("countIssues lists every category, including empty ones", () => {
  const counts = C.countIssues([{ category: "paper", source: "job_failure" }, { category: "payment", source: "refund_request" }]);
  assert.strictEqual(counts.total, 2);
  assert.strictEqual(counts.detected, 1);
  assert.strictEqual(counts.payment, 1);
  assert.strictEqual(counts.customerReported, 0);
  assert.strictEqual(counts.byCategory.length, 9);
  assert.strictEqual(counts.byCategory.find((c) => c.category === "paper").count, 1);
  assert.strictEqual(counts.byCategory.find((c) => c.category === "timeout").count, 0);
});

test("currentAlerts reports offline, paused printers and low supplies, never as history", () => {
  const alerts = C.currentAlerts([
    { kioskId: "CV-001", name: "MIMO 1.0", online: false, lastSeen: null, secondsSinceSeen: null, printers: [{ key: "CV-001", paperPct: 1 }] },
    { kioskId: "SV-002", name: "MIMO 2.0", online: true, printerStatus: "B&W: Idle | Color: Paused/Error", printers: [
      { key: "SV-002-BW", type: "bw", paperPct: 10, paperLevel: 25, paperCapacity: 250, tonerLevel: 0, inkLevel: null },
      { key: "SV-002-COLOR", type: "color", paperPct: 3, paperLevel: 3, paperCapacity: 100, tonerLevel: null, inkLevel: 50 },
    ] },
  ]);
  assert.deepStrictEqual(alerts.map((a) => `${a.category}:${a.severity}`),
    ["machine_pi:high", "printer:high", "paper:medium", "ink_toner:medium", "paper:high"]);
  assert.ok(alerts.every((a) => a.rangeMs === undefined), "current alerts carry no range timestamp");
});
