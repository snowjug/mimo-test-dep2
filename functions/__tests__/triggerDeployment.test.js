// The live Cloud Functions triggers run in specific regions. A trigger deployed WITHOUT the matching region is created
// as a second copy in us-central1 (duplicate alert e-mails). This test pins the region and the event source of every
// exported trigger so that cannot happen by accident. Names, regions and event paths are deployment contracts.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

createFakeFirestore().install();
const { scheduledPrintTimeoutSweep } = require("../src/triggers/printTimeout.trigger");
const triggers = {
  ...require("../src/triggers/printJob.triggers"),
  ...require("../src/triggers/retention.trigger"),
  scheduledPrintTimeoutSweep,
};

// name -> [region, event document / schedule]   (live state checked with `firebase functions:list` on 2026-09-27)
const EXPECTED = {
  autoRefundJob: ["us-central1", "print_jobs/{jobId}"],
  autoCleanupStorageJob: ["us-central1", "print_jobs/{jobId}"],
  scheduledFileRetentionCleanup: ["us-central1", "every 1 hours"],
  sendFailureNotification: ["asia-south1", "print_jobs/{jobId}"],
  printerHardwareNotification: ["asia-south1", "hardware/printers"],
  colourPaperUsageNotification: ["asia-south1", "print_jobs/{jobId}"],
  scheduledPrintTimeoutSweep: ["us-central1", "every 2 minutes"],
};

test("the exported triggers are exactly the seven deployed ones", () => {
  assert.deepStrictEqual(Object.keys(triggers).sort(), Object.keys(EXPECTED).sort());
});

for (const [name, [region, source]] of Object.entries(EXPECTED)) {
  test(`${name} is deployed to ${region} on ${source}`, () => {
    const endpoint = triggers[name].__endpoint;
    assert.ok(endpoint, "has a deployment descriptor");
    const regions = endpoint.region && endpoint.region.length ? endpoint.region : ["us-central1"]; // firebase default
    assert.deepStrictEqual(regions, [region]);
    const filters = endpoint.eventTrigger && { ...endpoint.eventTrigger.eventFilters, ...endpoint.eventTrigger.eventFilterPathPatterns }; // exact documents vs wildcard patterns
    const actual = endpoint.scheduleTrigger ? endpoint.scheduleTrigger.schedule : filters.document;
    assert.strictEqual(actual, source);
  });
}

test("the three e-mail triggers bind the GMAIL_APP_PASSWORD secret (it must not also appear in .env)", () => {
  for (const name of ["sendFailureNotification", "printerHardwareNotification", "colourPaperUsageNotification"]) {
    const secrets = (triggers[name].__endpoint.secretEnvironmentVariables || []).map((s) => s.key);
    assert.deepStrictEqual(secrets, ["GMAIL_APP_PASSWORD"], name);
  }
});
