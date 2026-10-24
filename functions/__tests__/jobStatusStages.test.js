/**
 * /kiosk/job-status passes through the Pi's own timeline stamps (piReceivedAt, sentToPrinterAt) for a printing job.
 * Pins: additive and null-safe, never inferred from time, only on "printing", existing fields unchanged.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { sessionStages } = require("../src/services/printStages.service");
const { createKioskRouter } = require("../src/routes/kiosk.routes");
const { validateKioskJobStatusResponse } = require("../src/validators/kioskContract");

const ts = (iso) => ({ toDate: () => new Date(iso) });
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

describe("sessionStages", () => {
  it("passes through both stamps when present", () => {
    assert.deepEqual(sessionStages([{ piReceivedAt: ts(iso(9000)), sentToPrinterAt: ts(iso(3000)) }]),
      { piReceivedAt: iso(9000), sentToPrinterAt: iso(3000) });
  });

  it("is null for a stamp the Pi has not written yet (never inferred)", () => {
    assert.deepEqual(sessionStages([{ piReceivedAt: ts(iso(2000)) }]), { piReceivedAt: iso(2000), sentToPrinterAt: null });
    assert.deepEqual(sessionStages([{}]), { piReceivedAt: null, sentToPrinterAt: null });
  });

  it("multi-file session: reached only when every job has it, at the latest stamp", () => {
    const docs = [{ piReceivedAt: ts(iso(8000)), sentToPrinterAt: ts(iso(4000)) }, { piReceivedAt: ts(iso(7000)) }];
    assert.deepEqual(sessionStages(docs), { piReceivedAt: iso(7000), sentToPrinterAt: null });
  });

  it("accepts plain dates / ISO strings and ignores garbage", () => {
    assert.equal(sessionStages([{ piReceivedAt: iso(1000) }]).piReceivedAt, iso(1000));
    assert.equal(sessionStages([{ piReceivedAt: "not a date" }]).piReceivedAt, null);
    assert.deepEqual(sessionStages([]), { piReceivedAt: null, sentToPrinterAt: null });
  });
});

// ── the real route handler against a fake Firestore ───────────────────────────────────────────────────────────
function fakeDb(jobs) {
  return {
    collection: (name) => ({
      where: () => ({ get: async () => ({ empty: jobs.length === 0, docs: jobs.map((j, i) => ({ id: `job${i}`, data: () => j })) }) }),
      doc: () => ({ get: async () => ({ exists: false }), update: async () => {} }),
      name,
    }),
  };
}

async function jobStatus(jobs) {
  const router = createKioskRouter({ db: fakeDb(jobs), admin: { firestore: { FieldValue: { serverTimestamp: () => "TS" } } },
    isColorJob: () => false });
  const layer = router.stack.find((l) => l.route && l.route.path === "/job-status");
  const handler = layer.route.stack[layer.route.stack.length - 1].handle; // skip the rate limiter
  let body;
  await handler({ query: { printCode: "4821" } }, { status() { return this; }, json(b) { body = b; return this; } });
  return body;
}

const base = { printCode: "4821", pageCount: 3, printOptions: { copies: 1 }, createdAt: ts(iso(60000)) };

describe("GET /kiosk/job-status with Pi stamps", () => {
  it("printing, Pi received and sent: both stamps, existing fields unchanged", async () => {
    const body = await jobStatus([{ ...base, status: "printing", printStartedAt: ts(iso(20000)), totalSheets: 3,
      sheetsCompleted: 0, piReceivedAt: ts(iso(19000)), sentToPrinterAt: ts(iso(13000)) }]);
    assert.deepEqual(body, { status: "printing", isPrinted: false, sheetsCompleted: 0, totalSheets: 3,
      piReceivedAt: iso(19000), sentToPrinterAt: iso(13000) });
    assert.equal(validateKioskJobStatusResponse(body).valid, true);
  });

  it("printing before the Pi picked it up: stamps are null", async () => {
    const body = await jobStatus([{ ...base, status: "printing", printStartedAt: ts(iso(1000)) }]);
    assert.equal(body.status, "printing");
    assert.equal(body.piReceivedAt, null);
    assert.equal(body.sentToPrinterAt, null);
    assert.equal(body.totalSheets, 3, "falls back to pageCount x copies as before");
  });

  it("completed and failed responses are unchanged (no stage fields)", async () => {
    const done = await jobStatus([{ ...base, status: "completed", isPrinted: true, piReceivedAt: ts(iso(30000)) }]);
    assert.deepEqual(done, { status: "completed", isPrinted: true, sheetsCompleted: 3, totalSheets: 3 });
    const failed = await jobStatus([{ ...base, status: "failed", printerStatus: "Jam Inside", printStartedAt: ts(iso(30000)),
      piReceivedAt: ts(iso(29000)) }]);
    assert.equal(failed.status, "failed");
    assert.equal(failed.printerStatus, "Jam Inside");
    assert.equal("piReceivedAt" in failed, false);
  });
});
