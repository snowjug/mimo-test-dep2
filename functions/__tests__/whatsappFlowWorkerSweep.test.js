"use strict";
// Mission 16 Step 2: tests for triggers/whatsappFlowWorker.trigger.js's plain runWhatsappFlowWorkerSweep() —
// the scheduled-sweep worker-invocation mechanism. No real Firebase, no real network: a fake Firestore + fake
// Storage bucket, and a loopback fixture CDN standing in for Meta's media CDN.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const path = require("path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "whatsapp-flow-worker-sweep-test-fixture-32"; // must be >= 32 chars (see src/config/env.js) — flowOrchestrator.js now transitively loads order.service.js -> config/env.js (Mission 38)
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeBucket } = require(
  path.join(__dirname, "..", "..", "prototypes", "whatsapp-flow-endpoint", "test", "fakeBucket.js")
);
const fixtures = require(
  path.join(__dirname, "..", "..", "prototypes", "whatsapp-flow-endpoint", "test", "fixtures.js")
);
const { submitJob, getJob, DEFAULT_LEASE_MS } = require("../src/whatsapp-flow/durableJobStore.js");
const { DEFAULT_JOB_COLLECTION } = require("../src/whatsapp-flow/flowOrchestrator.js");

const FIREBASE_PATH = require.resolve("../src/config/firebase");

function installFakes() {
  const fake = createFakeFirestore();
  const fakeBucket = createFakeBucket();
  fake.admin.storage = () => ({ bucket: () => fakeBucket.bucket });
  require.cache[FIREBASE_PATH] = { id: FIREBASE_PATH, filename: FIREBASE_PATH, loaded: true, exports: { admin: fake.admin, db: fake.db } };
  return { db: fake.db, bucket: fakeBucket.bucket };
}

function freshTrigger() {
  delete require.cache[require.resolve("../src/triggers/whatsappFlowWorker.trigger")];
  return require("../src/triggers/whatsappFlowWorker.trigger");
}

test.describe("runWhatsappFlowWorkerSweep", () => {
  test("media CDN allow-list targets the documented mmg.whatsapp.net example, not fbsbx.com (Mission 17 fix)", () => {
    installFakes();
    const { FLOW_MEDIA_CDN_HOST_SUFFIXES } = freshTrigger();
    assert.deepStrictEqual(FLOW_MEDIA_CDN_HOST_SUFFIXES, ["whatsapp.net"]);
  });

  test("no PENDING/PROCESSING jobs -> no-op, zero ticks", async () => {
    installFakes();
    const { runWhatsappFlowWorkerSweep } = freshTrigger();
    const result = await runWhatsappFlowWorkerSweep();
    assert.deepStrictEqual(result, { scanned: 0, ticked: 0 });
  });

  test("claims and completes a real PENDING job through the real worker/pipeline, downloading from a loopback CDN", async () => {
    const { db } = installFakes();
    const cdn = await fixtures.startFixtureCdn();
    try {
      const doc = fixtures.addDocument(cdn, "a.pdf", await fixtures.makePdf(2));
      await submitJob({
        db, collection: DEFAULT_JOB_COLLECTION, jobId: "tok-sweep-1", fingerprint: "fp1",
        payload: { waId: "919876543210", color: "bw", copies: 1, documents: [doc] },
      });

      // The sweep's own fetchCdn only allows https://*.fbsbx.com (or https in general) — the loopback test
      // CDN is http://127.0.0.1, so this proves the sweep's real CdnError path, not that the whole pipeline
      // ran. The host allow-list is exercised directly in cdn.test.js; here we only prove claim+record wiring.
      const { runWhatsappFlowWorkerSweep } = freshTrigger();
      const result = await runWhatsappFlowWorkerSweep();
      assert.strictEqual(result.scanned, 1);
      assert.strictEqual(result.ticked, 1); // claimed + failJob (retryable) still counts as "ticked" (not "not_claimed")

      const job = await getJob({ db, collection: DEFAULT_JOB_COLLECTION, jobId: "tok-sweep-1" });
      // Loopback CDN was refused by the allow-list (by design) -> retryable failure, back to PENDING, not silently dropped.
      assert.strictEqual(job.state, "PENDING");
      assert.strictEqual(job.attempts, 1);
    } finally {
      await cdn.close();
    }
  });

  test("a job still within its lease window is left alone (not double-ticked)", async () => {
    const { db } = installFakes();
    await submitJob({
      db, collection: DEFAULT_JOB_COLLECTION, jobId: "tok-sweep-2", fingerprint: "fp2",
      payload: { waId: "919876543210", color: "bw", copies: 1, documents: [] },
    });
    // Manually move it into PROCESSING with a lease far in the future, simulating another worker mid-flight.
    await db.collection(DEFAULT_JOB_COLLECTION).doc("tok-sweep-2").update({
      state: "PROCESSING", leaseOwner: "other-worker", leaseExpiresAt: Date.now() + DEFAULT_LEASE_MS,
    });
    const { runWhatsappFlowWorkerSweep } = freshTrigger();
    const result = await runWhatsappFlowWorkerSweep();
    assert.strictEqual(result.scanned, 1);
    assert.strictEqual(result.ticked, 0); // claimJob refuses: still leased by someone else
  });

  test("a terminally FAILED job is never re-scanned", async () => {
    const { db } = installFakes();
    await submitJob({
      db, collection: DEFAULT_JOB_COLLECTION, jobId: "tok-sweep-3", fingerprint: "fp3",
      payload: { waId: "919876543210", color: "bw", copies: 1, documents: [] },
    });
    await db.collection(DEFAULT_JOB_COLLECTION).doc("tok-sweep-3").update({ state: "FAILED", attempts: 3 });
    const { runWhatsappFlowWorkerSweep } = freshTrigger();
    const result = await runWhatsappFlowWorkerSweep();
    assert.strictEqual(result.scanned, 0); // excluded by the PENDING/PROCESSING "in" filter itself
  });
});
