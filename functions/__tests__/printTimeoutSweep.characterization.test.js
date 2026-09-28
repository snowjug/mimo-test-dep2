// CHARACTERIZATION TESTS for scheduledPrintTimeoutSweep: the proactive backstop that resolves
// print_jobs stuck in "printing" even if nobody ever polls /kiosk/job-status again.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { runPrintTimeoutSweep } = require("../src/triggers/printTimeout.trigger");

// A B&W 1-page job's timeout is 600s + 15s = 615s. A colour 1-page job's is 600s + 360s = 960s.
const BW_TIMEOUT_MS = 615 * 1000;
const COLOR_TIMEOUT_MS = 960 * 1000;

function job(overrides = {}) {
  return {
    status: "printing",
    kioskId: "SV-002",
    colorMode: "bw",
    pageCount: 1,
    printOptions: { copies: 1 },
    printStartedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test.beforeEach(() => {
  fake.reset({});
});

test("a B&W job well past its 615s timeout is marked failed with the timeout reason", async () => {
  fake.reset({ print_jobs: { j1: job({ printStartedAt: new Date(Date.now() - (BW_TIMEOUT_MS + 5000)) }) } });
  await runPrintTimeoutSweep();
  const after = fake.data("print_jobs").j1;
  assert.strictEqual(after.status, "failed");
  assert.strictEqual(after.printerStatus, "Print timeout: Printer not responding (check power/cable)");
});

test("a B&W job well within its 615s timeout is left untouched", async () => {
  fake.reset({ print_jobs: { j1: job({ printStartedAt: new Date(Date.now() - 5000) }) } });
  await runPrintTimeoutSweep();
  const after = fake.data("print_jobs").j1;
  assert.strictEqual(after.status, "printing");
});

test("a colour job gets the longer 960s budget: still alive at 700s elapsed (would already be dead as B&W)", async () => {
  fake.reset({ print_jobs: { j1: job({ colorMode: "color", printStartedAt: new Date(Date.now() - 700 * 1000) }) } });
  await runPrintTimeoutSweep();
  const after = fake.data("print_jobs").j1;
  assert.strictEqual(after.status, "printing", "a colour job at 700s must not be killed by the B&W 615s budget");
});

test("a colour job past its own 960s budget is marked failed", async () => {
  fake.reset({ print_jobs: { j1: job({ colorMode: "color", printStartedAt: new Date(Date.now() - (COLOR_TIMEOUT_MS + 5000)) }) } });
  await runPrintTimeoutSweep();
  const after = fake.data("print_jobs").j1;
  assert.strictEqual(after.status, "failed");
});

test("a job that is not status=printing is never touched, however old", async () => {
  fake.reset({ print_jobs: { j1: job({ status: "completed", isPrinted: true, printStartedAt: new Date(Date.now() - 999999999) }) } });
  await runPrintTimeoutSweep();
  const after = fake.data("print_jobs").j1;
  assert.strictEqual(after.status, "completed");
  assert.strictEqual(after.printerStatus, undefined);
});

test("multiple copies and pages extend the B&W budget: 30 pages x 2 copies at 20 minutes elapsed is still alive", async () => {
  // 600s + 60 pages * 15s = 1500s (25 min) budget; 20 min elapsed must not be killed.
  fake.reset({
    print_jobs: {
      j1: job({ pageCount: 30, printOptions: { copies: 2 }, printStartedAt: new Date(Date.now() - 20 * 60 * 1000) }),
    },
  });
  await runPrintTimeoutSweep();
  const after = fake.data("print_jobs").j1;
  assert.strictEqual(after.status, "printing");
});

test("re-running the sweep on an already-failed job is a no-op (idempotent)", async () => {
  fake.reset({
    print_jobs: {
      j1: job({ status: "failed", printerStatus: "some earlier reason", printStartedAt: new Date(Date.now() - 999999999) }),
    },
  });
  await runPrintTimeoutSweep();
  const after = fake.data("print_jobs").j1;
  assert.strictEqual(after.printerStatus, "some earlier reason", "must not overwrite an already-resolved job's reason");
});
