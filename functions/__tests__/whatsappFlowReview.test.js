"use strict";
// Mission 38: tests for the REVIEW/order-creation boundary now that createOrderOperation.js is wired to the
// REAL functions/src/services/order.service.js (a fresh extraction of current main's postCreateOrder/
// postPaymentSuccess — see that file's header). Reuses __tests__/helpers/orderHarness.js, the SAME fake
// Firestore + axios stub the website's own order-creation characterization tests use, so the Flow path is
// exercised against the identical shared service those tests already prove matches current main.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { fake, http, seed } = require("./helpers/orderHarness");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { submitJob } = require("../src/whatsapp-flow/durableJobStore.js");
const { finishReview, DEFAULT_JOB_COLLECTION, DEFAULT_ORDER_LINK_COLLECTION } = require("../src/whatsapp-flow/flowOrchestrator.js");
const { SCREENS } = require("../src/whatsapp-flow/flowContract.js");
const { loadMachinesMap } = require("../src/services/machineRegistry.service.js");

const WA_ID = "919876543210";

function seedFlowWorld(extra = {}) {
  seed({
    jobs: {}, // the Flow creates its own print_jobs doc internally; no website-side pending job needed
    user: { email: "flowuser@example.com", username: "FlowUser", mobileNumber: WA_ID, mimo_coins: { balance: 0, total_earned: 0, total_used: 0 } },
    ...extra,
  });
}

async function seedCompletedJob(flowToken, { color = "bw", pages = 2 } = {}) {
  await submitJob({
    db: fake.db, collection: DEFAULT_JOB_COLLECTION, jobId: flowToken, fingerprint: `fp-${flowToken}`,
    payload: { waId: WA_ID, color, copies: 1, documents: [{ media_id: "m1", cdn_url: "https://mmg.whatsapp.net/x", file_name: "a.pdf", encryption_metadata: {} }] },
  });
  await fake.db.collection(DEFAULT_JOB_COLLECTION).doc(flowToken).update({
    state: "COMPLETED",
    result: { ok: true, totalPages: pages, files: [{ name: "a.pdf", url: "https://storage.example/a.pdf", storagePath: "flow/a.pdf", type: "application/pdf", size: 100, pages }] },
  });
}

test.describe("finishReview (REVIEW) order-creation boundary — real order.service.js", () => {
  test("a COMPLETED B&W job at REVIEW creates exactly one real order (paid path) and reaches SUCCESS", async () => {
    seedFlowWorld();
    await seedCompletedJob("review-ok-1", { pages: 5 }); // 5 pages * ₹2.8 = ₹14, not free

    const { response, order } = await finishReview({ db: fake.db, flowToken: "review-ok-1", waId: WA_ID });

    assert.strictEqual(response.screen, SCREENS.SUCCESS);
    assert.ok(order.orderId);
    assert.strictEqual(order.free, undefined);
    assert.ok(order.paymentSessionId, "Cashfree session id returned");
    assert.strictEqual(http.calls.filter((c) => c.method === "post" && /sandbox\.cashfree\.com/.test(c.url)).length, 1);

    // Order creation ALONE issues no print code (Phase 5.D) — only the paid-fulfilment path does that.
    const jobsSnap = await fake.db.collection("print_jobs").where("orderId", "==", order.orderId).get();
    assert.strictEqual(jobsSnap.docs.length, 1);
    assert.strictEqual(jobsSnap.docs[0].data().printCode, undefined);
    assert.strictEqual(jobsSnap.docs[0].data().status, "pending");
    // No hardcoded kiosk id (Phase 4.6/Phase 5.C): the Flow never supplies directKioskId, so this stays null.
    assert.strictEqual(jobsSnap.docs[0].data().kioskId, null);
  });

  test("a COMPLETED job with a 100%-discount coupon is NOT reachable by the Flow (Flow never supplies couponCode) — paid path is the only one exercised, by construction", async () => {
    // Documents, not asserts something new: createOrderOperation.js's call to createOrderForUser never passes
    // couponCode/coinsToUse, so the free-order bypass is reachable only via pricing landing under ₹1, covered
    // implicitly by the shared service's own characterization tests (orderCreation.characterization.test.js).
    seedFlowWorld();
    await seedCompletedJob("review-ok-1b", { pages: 5 });
    const { order } = await finishReview({ db: fake.db, flowToken: "review-ok-1b", waId: WA_ID });
    assert.strictEqual(order.free, undefined);
  });

  test("repeated REVIEW submissions for the SAME session return the SAME order — never a duplicate", async () => {
    seedFlowWorld();
    await seedCompletedJob("review-dup-1", { pages: 5 });

    const first = await finishReview({ db: fake.db, flowToken: "review-dup-1", waId: WA_ID });
    const second = await finishReview({ db: fake.db, flowToken: "review-dup-1", waId: WA_ID });
    const third = await finishReview({ db: fake.db, flowToken: "review-dup-1", waId: WA_ID });

    assert.strictEqual(second.order.orderId, first.order.orderId);
    assert.strictEqual(third.order.orderId, first.order.orderId);
    assert.strictEqual(second.order.idempotent, true);
    assert.strictEqual(third.order.idempotent, true);

    const cfCalls = http.calls.filter((c) => c.method === "post" && /sandbox\.cashfree\.com/.test(c.url));
    assert.strictEqual(cfCalls.length, 1, "Cashfree is only ever called once for repeated REVIEW submissions");

    const ordersSnap = await fake.db.collection("payment_transactions").where("orderId", "==", first.order.orderId).get();
    assert.strictEqual(ordersSnap.docs.length, 1, "only one payment_transactions record, not one per retry");
  });

  test("two CONCURRENT finishReview calls for the same session never create two orders", async () => {
    // Needs strictTransactions:true to actually model Firestore's optimistic-concurrency abort-and-retry —
    // the shared orderHarness fake (used by every other test in this file) does not enable it, same reasoning
    // as orderCreationRace.test.js's own header comment. `db` is always passed explicitly into every call
    // below, so this one test can safely use its own, separate fake instance without re-installing anything.
    const strict = createFakeFirestore(
      {
        users: { u1: { email: "flowuser@example.com", mobileNumber: WA_ID, mimo_coins: { balance: 0, total_earned: 0, total_used: 0 } } },
        print_jobs: {},
      },
      { strictTransactions: true }
    );
    await submitJob({
      db: strict.db, collection: DEFAULT_JOB_COLLECTION, jobId: "review-concurrent-1", fingerprint: "fp-c1",
      payload: { waId: WA_ID, color: "bw", copies: 1, documents: [{ media_id: "m1", cdn_url: "https://mmg.whatsapp.net/x", file_name: "a.pdf", encryption_metadata: {} }] },
    });
    await strict.db.collection(DEFAULT_JOB_COLLECTION).doc("review-concurrent-1").update({
      state: "COMPLETED",
      result: { ok: true, totalPages: 5, files: [{ name: "a.pdf", url: "https://storage.example/a.pdf", storagePath: "flow/a.pdf", type: "application/pdf", size: 100, pages: 5 }] },
    });

    const [a, b] = await Promise.all([
      finishReview({ db: strict.db, flowToken: "review-concurrent-1", waId: WA_ID }),
      finishReview({ db: strict.db, flowToken: "review-concurrent-1", waId: WA_ID }),
    ]);
    // A true concurrent race against the SAME flowToken has exactly one winner (SUCCESS, a real order) and
    // one loser — the loser either (a) also sees SUCCESS with the SAME order, if the winner had already
    // committed by the time it re-checked, or (b) is told "order creation already in progress" (REVIEW, a
    // safe refresh, never a crash and never a second order) if it was genuinely concurrent. Either way, AT
    // MOST ONE order is ever created — that is the actual invariant, not "both always see SUCCESS".
    const results = [a, b];
    const successes = results.filter((r) => r.response.screen === SCREENS.SUCCESS);
    const refused = results.filter((r) => r.response.screen === SCREENS.REVIEW);
    assert.ok(successes.length >= 1, "at least one call must succeed");
    assert.strictEqual(successes.length + refused.length, 2);
    if (refused.length) assert.strictEqual(refused[0].error.code, "ORDER_CREATION_IN_PROGRESS");
    const orderIds = new Set(successes.map((r) => r.order.orderId));
    assert.strictEqual(orderIds.size, 1, "every successful result names the SAME single order");

    const [winningOrderId] = orderIds;
    const jobsSnap = await strict.db.collection("print_jobs").where("orderId", "==", winningOrderId).get();
    assert.strictEqual(jobsSnap.docs.length, 1, "only one merged print_jobs doc exists for this order, even under a real race");

    // A later retry (e.g. Meta re-delivering the REVIEW tap after the loser's "try again") must return the
    // SAME order, never a second one — the idempotent-replay path, now reachable because the in-progress
    // claim has resolved.
    const retry = await finishReview({ db: strict.db, flowToken: "review-concurrent-1", waId: WA_ID });
    assert.strictEqual(retry.response.screen, SCREENS.SUCCESS);
    assert.strictEqual(retry.order.orderId, winningOrderId);
  });

  test("a session not yet COMPLETED is refused — no order, no Cashfree call, no partial state", async () => {
    seedFlowWorld();
    await submitJob({
      db: fake.db, collection: DEFAULT_JOB_COLLECTION, jobId: "review-pending-1", fingerprint: "fp-p1",
      payload: { waId: WA_ID, color: "bw", copies: 1, documents: [] },
    }); // left PENDING, never completed
    const { response, error } = await finishReview({ db: fake.db, flowToken: "review-pending-1", waId: WA_ID });
    assert.strictEqual(response.screen, SCREENS.REVIEW);
    assert.strictEqual(error.code, "JOB_NOT_READY");
    assert.strictEqual(http.calls.filter((c) => /sandbox\.cashfree\.com/.test(c.url)).length, 0);
    const linkDoc = await fake.db.collection(DEFAULT_ORDER_LINK_COLLECTION).doc("review-pending-1").get();
    assert.ok(!linkDoc.exists || linkDoc.data().status !== "created");
  });

  test("a mismatched sender is refused — no order is created for either identity", async () => {
    const OTHER_WA_ID = "920000000000";
    seedFlowWorld();
    await fake.db.collection("users").add({ mobileNumber: OTHER_WA_ID, email: "other@example.com" });
    await seedCompletedJob("review-mismatch-1", { pages: 5 });

    const { response, error } = await finishReview({ db: fake.db, flowToken: "review-mismatch-1", waId: OTHER_WA_ID });
    assert.strictEqual(response.screen, SCREENS.REVIEW);
    assert.strictEqual(error.code, "SESSION_JOB_MISMATCH");
    const linkDoc = await fake.db.collection(DEFAULT_ORDER_LINK_COLLECTION).doc("review-mismatch-1").get();
    assert.ok(!linkDoc.exists || linkDoc.data().status !== "created");
  });

  test("a COLOR job is refused when SV-002 is not ACTIVE/colour-capable in the registry (fails closed, never a B&W fallback)", async () => {
    seedFlowWorld();
    // No machines/machine_templates seeded -> loadMachinesMap/loadMachineTemplatesMap fall back to their
    // own DEFAULT_MACHINES/DEFAULT_TEMPLATES (see machineRegistry.service.js), which DOES mark SV-002 ACTIVE
    // and colour-capable by default. To exercise the "not eligible" branch, seed an override that disables it.
    await fake.reset({
      users: fake.data("users"),
      print_jobs: {},
      machines: { "SV-002": { machineId: "SV-002", status: "MAINTENANCE" } },
    });
    await seedCompletedJob("review-color-blocked-1", { color: "color", pages: 3 });

    const { response, error } = await finishReview({ db: fake.db, flowToken: "review-color-blocked-1", waId: WA_ID });
    assert.strictEqual(response.screen, SCREENS.REVIEW);
    assert.strictEqual(error.status, 503);
    assert.match(error.message, /MIMO 2\.0/);
    // No ORDER (orders/payment_transactions) is ever created — confirmed. A print_jobs doc IS left behind:
    // createOrderOperation.js (pre-existing, out of this mission's scope) writes the merged print_jobs doc
    // BEFORE calling createOrderForUser, and does not delete it if that call throws. Documented as a found,
    // out-of-scope issue in the Mission 38 report, not silently fixed here.
    assert.strictEqual(Object.keys(fake.data("orders")).length, 0);
    assert.strictEqual(Object.keys(fake.data("payment_transactions")).length, 0);
  });

  test("a COLOR job proceeds when SV-002 is ACTIVE and colour-capable (the real registry, default state)", async () => {
    seedFlowWorld();
    // Sanity: confirm the default registry really does mark SV-002 ACTIVE + colour-capable, so this test is
    // proving real reuse of machineRegistry.service.js, not a tautology.
    const machines = await loadMachinesMap(fake.db);
    assert.strictEqual(machines.get("SV-002").status, "ACTIVE");

    await seedCompletedJob("review-color-ok-1", { color: "color", pages: 3 }); // 3 * ₹10 = ₹30, not free
    const { response, order } = await finishReview({ db: fake.db, flowToken: "review-color-ok-1", waId: WA_ID });
    assert.strictEqual(response.screen, SCREENS.SUCCESS);
    assert.ok(order.orderId);
  });
});
