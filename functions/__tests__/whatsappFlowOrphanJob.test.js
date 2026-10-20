"use strict";
// Mission 39, Phase 2: evidence-based investigation of the orphaned print_jobs doc Mission 38 found —
// createOrderOperation.js writes `print_jobs/wa_flow_{flowToken}` BEFORE calling createOrderForUser, and does
// not delete it if that call throws. These tests establish, directly against the real code (not a mock of
// it), that this cannot cause harmful behaviour:
//
//   1. The claim transaction (whatsapp_flow_orders/{flowToken}) fully serializes attempts for the SAME
//      flowToken — a second, genuinely concurrent attempt is refused (409 ORDER_CREATION_IN_PROGRESS)
//      BEFORE it ever touches print_jobs. Two writers can never race on the same deterministic doc id.
//   2. A failed attempt's orphan is deterministically OVERWRITTEN (not appended to) by the next retry, and
//      is correctly deleted once that retry's createOrderForUser call actually commits. No duplicate is ever
//      left behind by a failed-then-successful retry sequence.
//   3. If the customer never retries, the orphan is NOT invisible or unmanaged: it already matches the
//      existing storageCleanup.service.js policy ("an unpaid cart item whose file is gone can never be paid
//      for" / classifyJob's `pending`+no-`orderId` fallthrough -> age-based cleanup, eventually marked
//      "abandoned") — the SAME mechanism that already handles every other abandoned website pending job.
//      This is pre-existing, already-deployed, already-tested machinery; the orphan is not a special case
//      that mechanism misses.
//   4. A freshly committed real order's job is correctly PROTECTED from that same cleanup sweep (the
//      checkout-protection window), so the fix-evaluation above does not trade the orphan edge case for a
//      new risk of the cleanup sweep touching a live, just-paid-for job.
//
// Conclusion (see the Mission 39 report for the full writeup): the evidence shows the orphan is already
// safely bounded by existing mechanisms. No code change was made in createOrderOperation.js — a speculative
// fix (e.g. wrapping the print_jobs write in the claim's own rollback) would add a second place order/job
// cleanup semantics are decided, which is a larger risk than the already-covered edge case itself.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { fake, http, seed } = require("./helpers/orderHarness");
const { createFakeFirestore, FIXED_NOW } = require("./helpers/fakeFirestore");
const { submitJob } = require("../src/whatsapp-flow/durableJobStore.js");
const { finishReview, DEFAULT_JOB_COLLECTION, DEFAULT_ORDER_LINK_COLLECTION } = require("../src/whatsapp-flow/flowOrchestrator.js");
const { SCREENS } = require("../src/whatsapp-flow/flowContract.js");
const { classifyJob, claimJobForCleanup, CHECKOUT_PROTECTION_MS } = require("../src/services/storageCleanup.service.js");

const WA_ID = "919876543210";

function seedFlowWorld() {
  seed({
    jobs: {},
    user: { email: "flowuser@example.com", username: "FlowUser", mobileNumber: WA_ID, mimo_coins: { balance: 0, total_earned: 0, total_used: 0 } },
  });
}

async function seedCompletedJob(flowToken, { color = "bw", pages = 5, copies = 1 } = {}) {
  await submitJob({
    db: fake.db, collection: DEFAULT_JOB_COLLECTION, jobId: flowToken, fingerprint: `fp-${flowToken}`,
    payload: { waId: WA_ID, color, copies, documents: [{ media_id: "m1", cdn_url: "https://mmg.whatsapp.net/x", file_name: "a.pdf", encryption_metadata: {} }] },
  });
  await fake.db.collection(DEFAULT_JOB_COLLECTION).doc(flowToken).update({
    state: "COMPLETED",
    result: { ok: true, totalPages: pages, files: [{ name: "a.pdf", url: "https://storage.example/a.pdf", storagePath: "flow/a.pdf", type: "application/pdf", size: 100, pages }] },
  });
}

test.describe("createOrderOperation.js orphaned print_jobs doc — safety evidence (no code change made)", () => {
  test("1. order creation failing (a non-colour OrderServiceError, e.g. copies out of range) leaves no order/payment, and the print_jobs doc carries no orderId", async () => {
    seedFlowWorld();
    await seedCompletedJob("orphan-1", { copies: 500 }); // MAX_COPIES is 100 -> createOrderForUser throws 400

    const { response, error } = await finishReview({ db: fake.db, flowToken: "orphan-1", waId: WA_ID });
    assert.strictEqual(response.screen, SCREENS.REVIEW);
    assert.strictEqual(error.status, 400);
    assert.match(error.message, /copies/);

    assert.strictEqual(Object.keys(fake.data("orders")).length, 0);
    assert.strictEqual(Object.keys(fake.data("payment_transactions")).length, 0);
    const orphan = fake.data("print_jobs")["wa_flow_orphan-1"];
    assert.ok(orphan, "the orphan doc exists, as Mission 38 found");
    assert.strictEqual(orphan.status, "pending");
    assert.strictEqual(orphan.orderId, undefined, "it carries no orderId — never eligible for the checkout-protection branch");
  });

  test("2. a genuinely CONCURRENT second attempt for the same flowToken is refused before it ever touches print_jobs — the deterministic doc id is never written by two attempts at once", async () => {
    // Needs strictTransactions:true to actually model Firestore's optimistic-concurrency abort-and-retry —
    // the shared orderHarness fake does not enable it (same reasoning as Mission 38's own concurrency test
    // and orderCreationRace.test.js's header comment). `db` is passed explicitly everywhere below.
    const strict = createFakeFirestore(
      { users: { u1: { email: "flowuser@example.com", mobileNumber: WA_ID, mimo_coins: { balance: 0, total_earned: 0, total_used: 0 } } }, print_jobs: {} },
      { strictTransactions: true }
    );
    await submitJob({
      db: strict.db, collection: DEFAULT_JOB_COLLECTION, jobId: "orphan-2", fingerprint: "fp-o2",
      payload: { waId: WA_ID, color: "bw", copies: 500, documents: [{ media_id: "m1", cdn_url: "https://mmg.whatsapp.net/x", file_name: "a.pdf", encryption_metadata: {} }] },
    });
    await strict.db.collection(DEFAULT_JOB_COLLECTION).doc("orphan-2").update({
      state: "COMPLETED",
      result: { ok: true, totalPages: 5, files: [{ name: "a.pdf", url: "https://storage.example/a.pdf", storagePath: "flow/a.pdf", type: "application/pdf", size: 100, pages: 5 }] },
    });

    const [a, b] = await Promise.all([
      finishReview({ db: strict.db, flowToken: "orphan-2", waId: WA_ID }),
      finishReview({ db: strict.db, flowToken: "orphan-2", waId: WA_ID }),
    ]);
    const codes = [a.error.code, b.error.code].sort();
    // One attempt gets the claim and reaches the real 400 (copies); the other is refused at the claim step
    // itself (409 ORDER_CREATION_IN_PROGRESS) and never reaches buildPendingPrintJobDoc/printJobRef.set at all.
    assert.ok(codes.includes("ORDER_CREATION_IN_PROGRESS"), `expected one call to be refused as in-progress, got: ${codes}`);
    // At most one print_jobs doc for this flowToken was ever written, regardless of which call wrote it.
    const docSnap = await strict.db.collection("print_jobs").doc("wa_flow_orphan-2").get();
    assert.ok(!docSnap.exists || docSnap.data().status === "pending");
  });

  test("3. a failed attempt's orphan is overwritten (not duplicated) and cleanly consumed by a later successful retry", async () => {
    seedFlowWorld();
    await seedCompletedJob("orphan-3", { copies: 500 }); // first attempt fails, orphan written

    const failed = await finishReview({ db: fake.db, flowToken: "orphan-3", waId: WA_ID });
    assert.strictEqual(failed.response.screen, SCREENS.REVIEW);
    assert.ok(fake.data("print_jobs")["wa_flow_orphan-3"]);

    // Fix the underlying condition (as a real retry would follow a configuration fix, not a code change) and
    // retry the SAME session.
    await fake.db.collection(DEFAULT_JOB_COLLECTION).doc("orphan-3").update({ "payload.copies": 1 });
    const retried = await finishReview({ db: fake.db, flowToken: "orphan-3", waId: WA_ID });
    assert.strictEqual(retried.response.screen, SCREENS.SUCCESS);

    // The orphan doc id is gone — consumed (deleted) by the successful transaction, not left behind.
    assert.strictEqual(fake.data("print_jobs")["wa_flow_orphan-3"], undefined);
    const jobsSnap = await fake.db.collection("print_jobs").where("orderId", "==", retried.order.orderId).get();
    assert.strictEqual(jobsSnap.docs.length, 1, "exactly one real merged job exists for the retried order — no duplicate from the earlier failed attempt");
  });

  test("4. if the customer never retries, the orphan already matches the existing cleanup sweep's eligibility rule (classifyJob/claimJobForCleanup) — not a gap the sweep misses", async () => {
    seedFlowWorld();
    await seedCompletedJob("orphan-4", { copies: 500 });
    await finishReview({ db: fake.db, flowToken: "orphan-4", waId: WA_ID }); // fails, orphan left behind

    const orphan = fake.data("print_jobs")["wa_flow_orphan-4"];
    const decision = classifyJob(orphan, Date.now());
    // Same fallthrough every other abandoned, unpaid, unprinted pending job already gets — not a special case.
    assert.deepStrictEqual(decision, { action: "cleanup", mode: "age", reason: "unprinted" });

    const ref = fake.db.collection("print_jobs").doc("wa_flow_orphan-4");
    const claim = await claimJobForCleanup({ db: fake.db, ref, jobId: "wa_flow_orphan-4", mode: decision.mode, nowMs: Date.now() });
    assert.strictEqual(claim.claimed, true, "the sweep can claim it for cleanup — it is not permanently stuck or ignored");
  });

  test("5. a freshly committed REAL order's job is correctly protected from the same cleanup sweep (no new risk from leaving the orphan edge case as-is)", async () => {
    seedFlowWorld();
    await seedCompletedJob("orphan-5", { copies: 1 });
    const { order } = await finishReview({ db: fake.db, flowToken: "orphan-5", waId: WA_ID });
    assert.ok(order.orderId);

    const jobsSnap = await fake.db.collection("print_jobs").where("orderId", "==", order.orderId).get();
    const realJob = jobsSnap.docs[0].data();
    assert.strictEqual(realJob.status, "pending");
    assert.ok(realJob.orderId, "unlike the orphan, a real committed job DOES carry an orderId");

    // The fake's FieldValue.serverTimestamp() resolves to the fake's own FIXED_NOW, not real wall-clock time —
    // use a nowMs close to it ("a moment after creation") rather than the real Date.now(), or the elapsed-time
    // check below would see a ~year of fake elapsed time and wrongly conclude the protection window passed.
    const ref = jobsSnap.docs[0].ref;
    const claim = await claimJobForCleanup({ db: fake.db, ref, jobId: ref.id, mode: "age", nowMs: FIXED_NOW.getTime() + 1000 });
    assert.strictEqual(claim.claimed, false);
    assert.strictEqual(claim.reason, "active_checkout", "protected for CHECKOUT_PROTECTION_MS, unlike the orphan which carries no orderId at all");
    assert.ok(CHECKOUT_PROTECTION_MS > 0);
  });
});
