// CHARACTERIZATION TESTS: everything around an order after it is created — coupon validation, payment verification
// twice, the print-code hand-out, refund requests, status polling — plus the WhatsApp ordering path, which prices
// orders with its OWN code. KNOWN RISK / KNOWN DEFECT tests pass today and must be flipped on purpose when fixed.
const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const { fake, http, mailbox, seed, pendingJob, response, controller } = require("./helpers/orderHarness");
const publicController = require("../src/controllers/public.controller");
const whatsapp = require("../src/services/whatsapp.service");

// ───────────────────────── GET /validate-coupon/:code ─────────────────────────
test.describe("GET /validate-coupon/:code", () => {
  const call = async (code) => { const res = response(); await publicController.getValidateCoupon({ params: { code } }, res); return res; };
  test.beforeEach(() => seed({ coupons: {
    SAVE10: { isActive: true, discountPercentage: 10 },
    OFF: { isActive: false, discountPercentage: 50 },
    OLD: { isActive: true, discountPercentage: 20, expiryDate: { toDate: () => new Date("2020-01-01") } },
    NEW: { isActive: true, discountPercentage: 5, expiryDate: { toDate: () => new Date("2099-01-01") } },
  } }));

  test("valid code returns its percentage (case-insensitive)", async () => {
    assert.deepStrictEqual((await call("save10")).body, { discountPercentage: 10 });
    assert.deepStrictEqual((await call("NEW")).body, { discountPercentage: 5 });
  });
  test("unknown code: 404 'Invalid promo code'", async () => {
    const res = await call("NOPE");
    assert.strictEqual(res.code, 404);
    assert.deepStrictEqual(res.body, { error: "Invalid promo code" });
  });
  test("disabled code: 400; expired code: 400", async () => {
    assert.strictEqual((await call("OFF")).code, 400);
    assert.match((await call("OFF")).body.error, /disabled/);
    assert.strictEqual((await call("OLD")).code, 400);
    assert.match((await call("OLD")).body.error, /expired/);
  });
});

// ───────────────────────── GET /api/settings & /api/screensaver & /api/stats ─────────────────────────
test.describe("GET /api/settings", () => {
  test("returns default pricing when no settings document exists", async () => {
    seed({});
    const res = response();
    await publicController.getApiSettings({}, res);
    assert.strictEqual(res.body.pricePerPageBW, 2.80);
    assert.strictEqual(res.body.pricePerPageColor, 10.00);
  });

  test("returns saved pricing from mimo_settings/pricing", async () => {
    seed({ extra: { mimo_settings: { pricing: { pricePerPageBW: 3.00, pricePerPageColor: 12.00 } } } });
    const res = response();
    await publicController.getApiSettings({}, res);
    assert.strictEqual(res.body.pricePerPageBW, 3.00);
    assert.strictEqual(res.body.pricePerPageColor, 12.00);
  });
});

test.describe("GET /api/screensaver", () => {
  test("returns default screensaver settings when no doc exists", async () => {
    seed({});
    const res = response();
    await publicController.getApiScreensaver({}, res);
    assert.strictEqual(res.body.playSound, true);
    assert.strictEqual(res.body.idleTimeoutSeconds, 60);
  });

  test("returns saved screensaver settings", async () => {
    seed({ extra: { mimo_settings: { screensaver: { videos: ["/v1.mp4"], playSound: false, idleTimeoutSeconds: 30 } } } });
    const res = response();
    await publicController.getApiScreensaver({}, res);
    assert.deepStrictEqual(res.body.videos, ["/v1.mp4"]);
    assert.strictEqual(res.body.playSound, false);
  });
});

test.describe("GET /api/stats", () => {
  test("returns stats from pricing doc if available", async () => {
    seed({ extra: { mimo_settings: { pricing: { totalPagesPrinted: 5000, totalStudents: 350 } } } });
    const res = response();
    await publicController.getApiStats({}, res);
    assert.strictEqual(res.body.totalPagesPrinted, 5000);
    assert.strictEqual(res.body.totalStudents, 350);
    assert.strictEqual(res.body.activeKiosks, 2);
  });

  test("computes stats from print_jobs, users, and system metrics when pricing doc missing stats", async () => {
    seed({
      jobs: {
        j1: { status: "completed", pageCount: 10, printOptions: { copies: 2 } },
        j2: { status: "printed", pageCount: 5, printOptions: { copies: 1 } },
        j3: { status: "failed", pageCount: 20 }
      },
      user: { email: "u1@example.com" },
      extra: {
        system: { metrics: { totalFreePagesPrinted: 50 } }
      }
    });
    const res = response();
    await publicController.getApiStats({}, res);
    assert.strictEqual(res.body.totalPagesPrinted, 75);
    assert.strictEqual(res.body.totalStudents, 1);
    assert.strictEqual(res.body.activeKiosks, 2);
  });
});

// ───────────────────────── verification twice + print code ─────────────────────────
test.describe("GET /verify-payment twice (duplicate verification)", () => {
  // Wire the internal HTTP call to the REAL payment-success handler, so verify -> payment-success runs end to end.
  const wire = () => {
    http.on("get", /\/orders\/order_1$/, () => ({ data: { order_status: "PAID" } }));
    http.on("post", /\/payment-success$/, async (url, body, cfg) => {
      const userId = jwt.decode(cfg.headers.Authorization.split(" ")[1]).userId;
      const res = response();
      await controller.postPaymentSuccess({ user: { userId }, body }, res);
      if (res.code >= 400) throw Object.assign(new Error("payment-success failed"), { response: { data: res.body } });
      return { data: res.body };
    });
  };
  test.beforeEach(() => {
    seed({ jobs: { j1: pendingJob({ orderId: "order_1" }), j2: pendingJob({ orderId: "order_1", fileName: "b.pdf" }) },
      extra: { orders: { o1: { orderId: "order_1", userId: "u1", amount: 20, status: "INITIATED" } } } });
    wire();
  });
  const verify = async () => { const res = response(); await controller.getVerifyPayment({ params: { orderId: "order_1" } }, res); return res; };

  test("the first verification pays the order and hands out ONE code for all its jobs", async () => {
    const res = await verify();
    assert.strictEqual(res.body.order_status, "PAID");
    assert.match(res.body.printCode, /^[1-9]\d{3}$/);
    const jobs = Object.values(fake.data("print_jobs"));
    assert.deepStrictEqual(jobs.map((j) => j.status), ["paid", "paid"]);
    assert.deepStrictEqual([...new Set(jobs.map((j) => j.printCode))], [res.body.printCode]);
    assert.strictEqual(fake.data("orders").o1.status, "PAID");
  });

  test("verifying again (page refresh, retry, webhook + browser) returns the SAME code and changes nothing", async () => {
    const first = await verify();
    const writesAfterFirst = fake.log.writes.filter((w) => w.path.startsWith("print_jobs/")).length;
    const second = await verify();
    assert.strictEqual(second.body.printCode, first.body.printCode);
    assert.strictEqual(fake.log.writes.filter((w) => w.path.startsWith("print_jobs/")).length, writesAfterFirst, "no further job writes");
  });

  test("the receipt e-mail after payment carries the print code; a failing mail server does not fail the verification", async () => {
    process.env.GMAIL_APP_PASSWORD = "test-app-password";
    try {
      const res = await verify();
      assert.strictEqual(mailbox.length, 1);
      assert.strictEqual(mailbox[0].to, "u1@example.com");
      assert.ok(mailbox[0].html.includes(res.body.printCode));

      seed({ jobs: { j1: pendingJob({ orderId: "order_1" }) }, extra: { orders: { o1: { orderId: "order_1", userId: "u1", amount: 20, status: "INITIATED" } } } });
      wire();
      mailbox.failNext = true;
      const original = console.error; console.error = () => {};
      try {
        const again = await verify();
        assert.match(again.body.printCode, /^\d{4}$/, "the customer still gets the code");
      } finally { console.error = original; }
    } finally { delete process.env.GMAIL_APP_PASSWORD; }
  });

  test("print codes are drawn from 1000-9999", async () => {
    const original = Math.random;
    try {
      for (const [r, expected] of [[0, "1000"], [0.9999999, "9999"]]) {
        Math.random = () => r;
        seed({ jobs: { j1: pendingJob({ orderId: "order_1" }) }, extra: { orders: { o1: { orderId: "order_1", userId: "u1", amount: 5, status: "INITIATED" } } } });
        wire();
        assert.strictEqual((await verify()).body.printCode, expected);
      }
    } finally { Math.random = original; }
  });

  const paidOrders = { orders: { o1: { orderId: "order_1", userId: "u1", amount: 5, status: "PAID" }, o2: { orderId: "order_2", userId: "u2", amount: 5, status: "PAID" } } };
  const withRandoms = async (values, fn) => {
    const original = Math.random;
    let i = 0;
    Math.random = () => values[Math.min(i++, values.length - 1)];
    try { return await fn(); } finally { Math.random = original; }
  };

  test("two customers never share an active print code: a colliding draw is discarded and redrawn", async () => {
    seed({ jobs: { a: pendingJob({ userId: "u1", orderId: "order_1" }), b: pendingJob({ userId: "u2", orderId: "order_2" }) }, extra: paidOrders });
    const [r1, r2] = await withRandoms([0.42, 0.42, 0.9], async () => {
      const a = response(), b = response();
      await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, a);
      await controller.postPaymentSuccess({ user: { userId: "u2" }, body: { orderId: "order_2" } }, b);
      return [a, b];
    });
    assert.strictEqual(r1.code, 200);
    assert.strictEqual(r2.code, 200);
    assert.strictEqual(r1.body.printCode, "4780");
    assert.strictEqual(r2.body.printCode, "9100", "the second draw collided with the active code and was redrawn");
  });

  test("a code held only by FINISHED jobs (completed, failed, refunded) may be reused", async () => {
    seed({ jobs: { old: pendingJob({ userId: "u9", status: "completed", printCode: "4780" }), old2: pendingJob({ userId: "u9", status: "refunded", printCode: "4780" }), a: pendingJob({ userId: "u1", orderId: "order_1" }) }, extra: paidOrders });
    const res = await withRandoms([0.42], async () => { const a = response(); await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, a); return a; });
    assert.strictEqual(res.body.printCode, "4780");
  });

  test("printing jobs also hold their code", async () => {
    seed({ jobs: { busy: pendingJob({ userId: "u9", status: "printing", printCode: "4780" }), a: pendingJob({ userId: "u1", orderId: "order_1" }) }, extra: paidOrders });
    const res = await withRandoms([0.42, 0.9], async () => { const a = response(); await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, a); return a; });
    assert.strictEqual(res.body.printCode, "9100");
  });

  test("if no free code can be found the request fails cleanly and nothing is written", async () => {
    seed({ jobs: { busy: pendingJob({ userId: "u9", status: "paid", printCode: "4780" }), a: pendingJob({ userId: "u1", orderId: "order_1" }) }, extra: paidOrders });
    const original = console.error; console.error = () => {};
    let res;
    try { res = await withRandoms([0.42], async () => { const a = response(); await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_1" } }, a); return a; }); }
    finally { console.error = original; }
    assert.ok(res.code >= 500 || res.body.error, "an error is returned");
    assert.strictEqual(fake.data("print_jobs").a.status, "pending");
    assert.strictEqual(fake.data("print_jobs").a.printCode, undefined);
  });
});

// ───────────────────────── POST /request-refund ─────────────────────────
test.describe("POST /request-refund", () => {
  const order = (over = {}) => ({ orderId: "order_1", userId: "u1", amount: 25, status: "PAID", ...over });
  const call = async (body, userId = "u1") => { const res = response(); await controller.postRequestRefund({ user: { userId }, body }, res); return res; };

  test("orderId is required", async () => {
    seed({});
    assert.strictEqual((await call({})).code, 400);
  });
  test("only the owner can request a refund (404 for someone else's or unknown orders)", async () => {
    seed({ extra: { orders: { o1: order() } } });
    assert.strictEqual((await call({ orderId: "order_1" }, "u2")).code, 404);
    assert.strictEqual((await call({ orderId: "nope" })).code, 404);
  });
  test("creates a pending request with the order amount and a default reason", async () => {
    seed({ extra: { orders: { o1: order() } } });
    const res = await call({ orderId: "order_1" });
    assert.strictEqual(res.code, 200);
    assert.match(res.body.message, /Refund request submitted/);
    const [reqDoc] = Object.values(fake.data("refund_requests"));
    assert.deepStrictEqual({ userId: reqDoc.userId, orderId: reqDoc.orderId, amount: reqDoc.amount, status: reqDoc.status, reason: reqDoc.reason, resolvedBy: reqDoc.resolvedBy },
      { userId: "u1", orderId: "order_1", amount: 25, status: "pending", reason: "User requested refund", resolvedBy: null });
  });
  test("falls back to payment_transactions when the order is not in `orders`", async () => {
    seed({ extra: { payment_transactions: { t1: order({ amount: 40 }) } } });
    const res = await call({ orderId: "order_1", reason: "wrong file" });
    assert.strictEqual(res.code, 200);
    assert.strictEqual(Object.values(fake.data("refund_requests"))[0].amount, 40);
  });
  test("a second request for the same order is rejected with 409 and the existing status (duplicate refund requests)", async () => {
    seed({ extra: { orders: { o1: order() } } });
    await call({ orderId: "order_1" });
    const res = await call({ orderId: "order_1" });
    assert.strictEqual(res.code, 409);
    assert.strictEqual(res.body.status, "pending");
    assert.strictEqual(Object.keys(fake.data("refund_requests")).length, 1);
  });
  test("orders whose status says printing/completed/PRINTED are refused", async () => {
    for (const status of ["printing", "completed", "PRINTED"]) {
      seed({ extra: { orders: { o1: order({ status }) } } });
      const res = await call({ orderId: "order_1" });
      assert.strictEqual(res.code, 400, status);
      assert.match(res.body.error, /has been printed/);
    }
  });
  test("an order whose print job is printing, completed or flagged isPrinted is refused (the print state lives on the job, not the order)", async () => {
    for (const job of [{ status: "completed" }, { status: "printing" }, { status: "printed" }, { status: "paid", isPrinted: true }]) {
      seed({ jobs: { j1: pendingJob({ orderId: "order_1", ...job }) }, extra: { orders: { o1: order({ status: "PAID" }) } } });
      const res = await call({ orderId: "order_1" });
      assert.strictEqual(res.code, 400, JSON.stringify(job));
      assert.match(res.body.error, /has been printed/);
      assert.deepStrictEqual(fake.data("refund_requests"), {});
    }
  });
  test("unprinted or failed jobs may request a refund; another customer's printed job does not block it", async () => {
    for (const jobs of [{ j1: pendingJob({ orderId: "order_1", status: "paid" }) }, { j1: pendingJob({ orderId: "order_1", status: "failed" }) },
      { j1: pendingJob({ orderId: "order_1", status: "paid" }), x: pendingJob({ orderId: "order_1", userId: "u2", status: "completed" }) }]) {
      seed({ jobs, extra: { orders: { o1: order({ status: "PAID" }) } } });
      assert.strictEqual((await call({ orderId: "order_1" })).code, 200);
    }
  });
});

// ───────────────────────── POST /check-status ─────────────────────────
test.describe("POST /check-status (print-code status polling)", () => {
  const call = async (printCode) => { const res = response(); await controller.postCheckStatus({ body: { printCode } }, res); return res; };
  const jobs = (...list) => Object.fromEntries(list.map((j, i) => [`j${i}`, pendingJob({ printCode: "1234", ...j })]));

  test("400 without a code, 404 for an unknown code", async () => {
    seed({});
    assert.strictEqual((await call(undefined)).code, 400);
    assert.strictEqual((await call("9999")).code, 404);
  });
  test("paid, printing, completed and failed map to their status", async () => {
    seed({ jobs: jobs({ status: "paid" }) });
    assert.deepStrictEqual((await call("1234")).body, { status: "paid", isPrinted: false });
    seed({ jobs: jobs({ status: "printing" }) });
    assert.deepStrictEqual((await call("1234")).body, { status: "printing", isPrinted: false });
    seed({ jobs: jobs({ status: "completed" }) });
    assert.deepStrictEqual((await call("1234")).body, { status: "completed", isPrinted: true });
    seed({ jobs: jobs({ status: "failed", printerStatus: "Paper jam" }) });
    assert.deepStrictEqual((await call("1234")).body, { status: "failed", isPrinted: false });
  });
  test("with several jobs, one failure wins, then printing, and completed only when ALL are done", async () => {
    seed({ jobs: jobs({ status: "completed" }, { status: "failed" }) });
    assert.strictEqual((await call("1234")).body.status, "failed");
    seed({ jobs: jobs({ status: "completed" }, { status: "printing" }) });
    assert.strictEqual((await call("1234")).body.status, "printing");
    seed({ jobs: jobs({ status: "completed" }, { status: "paid" }) });
    assert.strictEqual((await call("1234")).body.status, "paid");
  });
  test("auto-cancelled jobs (bad file URL) are ignored; if only those exist the code is invalid", async () => {
    seed({ jobs: jobs({ status: "failed", printerStatus: "Invalid file URL" }, { status: "completed" }) });
    assert.strictEqual((await call("1234")).body.status, "completed");
    seed({ jobs: jobs({ status: "failed", printerStatus: "Cancelled by user" }) });
    const res = await call("1234");
    assert.strictEqual(res.code, 404);
  });
});

// ───────────────────────── WhatsApp ordering: its own pricing code ─────────────────────────
test.describe("WhatsApp orders (whatsapp.service _askForCoupon / _finalizePayment)", () => {
  const session = (over = {}) => ({ colorMode: "bw", pageCount: 10, jobId: "wj1", destination: "SV-002", userName: "Wa User", ...over });
  const setup = (over = {}, settings) => {
    seed({ jobs: { wj1: pendingJob() }, extra: { whatsapp_sessions: { s1: {} }, ...(settings ? { settings: { pricing: settings } } : {}) } });
    http.on("post", /sandbox\.cashfree\.com\/pg\/links$/, () => ({ data: { link_url: "https://pay.example/link" } }));
    return { ref: require("./helpers/orderHarness").fake.db.collection("whatsapp_sessions").doc("s1"), session: session(over) };
  };
  const linkCalls = () => http.calls.filter((c) => /\/pg\/links$/.test(c.url));

  test("prices copies x pages x per-page price and stores rawTotal (B&W ₹2.80, colour ₹10 by default)", async () => {
    let { ref, session: s } = setup();
    await whatsapp._askForCoupon("919876543210", s, ref, 2);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.rawTotal, 56);
    ({ ref, session: s } = setup({ colorMode: "color", pageCount: 3 }));
    await whatsapp._askForCoupon("919876543210", s, ref, 1);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.rawTotal, 30);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.state, "awaiting_coupon");
  });

  test("WhatsApp and the web checkout read the SAME pricing document (mimo_settings/pricing, edited in the admin dashboard)", async () => {
    const settings = { pricePerPageBW: 5 };
    // WhatsApp
    seed({ jobs: { wj1: pendingJob() }, extra: { whatsapp_sessions: { s1: {} }, mimo_settings: { pricing: settings } } });
    await whatsapp._askForCoupon("919876543210", session(), fake.db.collection("whatsapp_sessions").doc("s1"), 1);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.rawTotal, 50, "WhatsApp charges the configured ₹5 x 10 pages");
    // web
    seed({ extra: { mimo_settings: { pricing: settings } } });
    const web = await require("./helpers/orderHarness").checkout({});
    assert.strictEqual(web.body.amount, 50, "the web charges the same");
  });

  test("the legacy `settings/pricing` document is no longer read", async () => {
    seed({ jobs: { wj1: pendingJob() }, extra: { whatsapp_sessions: { s1: {} }, settings: { pricing: { pricePerPageBW: 99 } } } });
    await whatsapp._askForCoupon("919876543210", session(), fake.db.collection("whatsapp_sessions").doc("s1"), 1);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.rawTotal, 28);
  });

  test("WhatsApp-specific price fields (pricePerPageWABW / pricePerPageWAColor) still override the shared prices on WhatsApp only", async () => {
    const settings = { pricePerPageBW: 5, pricePerPageColor: 12, pricePerPageWABW: 4, pricePerPageWAColor: 9 };
    seed({ jobs: { wj1: pendingJob() }, extra: { whatsapp_sessions: { s1: {} }, mimo_settings: { pricing: settings } } });
    const ref = fake.db.collection("whatsapp_sessions").doc("s1");
    await whatsapp._askForCoupon("919876543210", session(), ref, 1);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.rawTotal, 40);
    await whatsapp._askForCoupon("919876543210", session({ colorMode: "color" }), ref, 1);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.rawTotal, 90);
  });

  test("a coupon percentage is applied to rawTotal; the payment link is created for the discounted amount", async () => {
    const { ref, session: s } = setup({ rawTotal: 28 });
    fake.reset({ ...fake_state(), coupons: { SAVE: { isActive: true, discountPercentage: 25 } } });
    await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 28 }, ref, "SAVE");
    assert.strictEqual(linkCalls()[0].body.link_amount, 21);
    assert.strictEqual(linkCalls()[0].body.link_currency, "INR");
    assert.match(linkCalls()[0].body.link_id, /^WA-[0-9A-F]{8}$/);
  });
  function fake_state() { return { users: { u1: {} }, print_jobs: { wj1: pendingJob() }, whatsapp_sessions: { s1: {} } }; }

  test("a disabled coupon does not apply on WhatsApp (same rule as the web checkout): the original amount is charged", async () => {
    const { ref, session: s } = setup();
    fake.reset({ ...fake_state(), coupons: { OFF: { isActive: false, discountPercentage: 50 } } });
    await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 28 }, ref, "OFF");
    assert.strictEqual(linkCalls()[0].body.link_amount, 28);
    assert.ok(http.calls.some((c) => /graph\.facebook\.com/.test(c.url) && /Invalid coupon/.test(JSON.stringify(c.body))), "the customer is told the code is invalid");
  });

  test("an expired or unknown coupon is reported and the original amount is charged", async () => {
    const { ref, session: s } = setup();
    fake.reset({ ...fake_state(), coupons: { OLD: { isActive: true, discountPercentage: 50, expiryDate: { toDate: () => new Date("2020-01-01") } } } });
    await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 28 }, ref, "OLD");
    await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 28 }, ref, "NOPE");
    assert.deepStrictEqual(linkCalls().map((c) => c.body.link_amount), [28, 28]);
  });

  test("DECISION PENDING: amounts under ₹1 are RAISED to ₹1 on WhatsApp (Cashfree minimum), while the web checkout makes them free", async () => {
    const { ref, session: s } = setup();
    fake.reset({ ...fake_state(), coupons: { SAVE: { isActive: true, discountPercentage: 95 } } });
    await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 10 }, ref, "SAVE"); // 10 - 95% = 0.50
    assert.strictEqual(linkCalls()[0].body.link_amount, 1);
  });

  test("a 100% coupon makes a WhatsApp order free: job paid with a 4-digit code, no payment link", async () => {
    const { ref, session: s } = setup();
    fake.reset({ ...fake_state(), coupons: { ALL: { isActive: true, discountPercentage: 100 } } });
    await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 28 }, ref, "ALL");
    assert.strictEqual(linkCalls().length, 0);
    const job = fake.data("print_jobs").wj1;
    assert.strictEqual(job.status, "paid");
    assert.match(job.printCode, /^[1-9]\d{3}$/);
    assert.strictEqual(job.totalCost, 0);
    assert.match(job.orderId, /^WA-FREE-[0-9A-F]{8}$/);
    assert.strictEqual(fake.data("whatsapp_sessions").s1.state, "idle");
  });

  test("a free WhatsApp order also gets a code that no active job holds", async () => {
    const { ref, session: s } = setup();
    fake.reset({ ...fake_state(), print_jobs: { wj1: pendingJob(), other: pendingJob({ userId: "u9", status: "paid", printCode: "4780" }) }, coupons: { ALL: { isActive: true, discountPercentage: 100 } } });
    const original = Math.random; let i = 0; const draws = [0.42, 0.9];
    Math.random = () => draws[Math.min(i++, draws.length - 1)];
    try { await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 28 }, ref, "ALL"); } finally { Math.random = original; }
    assert.strictEqual(fake.data("print_jobs").wj1.printCode, "9100");
  });

  test("a paid WhatsApp order attaches the order id and price to the job and waits for payment", async () => {
    const { ref, session: s } = setup();
    fake.reset(fake_state());
    await whatsapp._finalizePayment("919876543210", { ...s, rawTotal: 28, copies: 1 }, ref, null);
    const job = fake.data("print_jobs").wj1;
    assert.strictEqual(job.totalCost, 28);
    assert.match(job.orderId, /^WA-[0-9A-F]{8}$/);
    assert.strictEqual(job.status, "pending", "stays pending until the payment is confirmed");
    assert.strictEqual(job.kioskId, "SV-002");
  });
});

// ───────────────────────── GET /wa-pay-success/:orderId (WhatsApp payment return page) ─────────────────────────
test.describe("GET /wa-pay-success/:orderId", () => {
  const whatsappController = require("../src/controllers/whatsapp.controller");
  const waJob = (over = {}) => ({ userId: "u1", orderId: "WA-ABCD1234", status: "pending", fileName: "a.pdf", totalCost: 28, ...over });
  const page = async () => { const res = response(); await whatsappController.getWaPaySuccess({ params: { orderId: "WA-ABCD1234" } }, res); return res; };
  const linkStatus = (status) => http.on("get", /\/links\/WA-ABCD1234$/, () => ({ data: { link_status: status } }));
  test.beforeEach(() => { seed({ jobs: { wj1: waJob(), wj2: waJob({ fileName: "b.pdf" }) }, extra: { whatsapp_sessions: { "919876543210": { jobId: "wj1" } } } }); });

  test("a PAID payment link marks every job of the order paid with ONE code and shows the success page", async () => {
    linkStatus("PAID");
    const res = await page();
    assert.match(res.body, /Payment Success/);
    const jobs = Object.values(fake.data("print_jobs"));
    assert.deepStrictEqual(jobs.map((j) => j.status), ["paid", "paid"]);
    assert.match(jobs[0].printCode, /^[1-9]\d{3}$/);
    assert.strictEqual(jobs[0].printCode, jobs[1].printCode);
    assert.ok(http.calls.some((c) => /graph\.facebook\.com/.test(c.url)), "the customer gets the WhatsApp order card");
  });

  test("a link that is not PAID changes nothing", async () => {
    linkStatus("ACTIVE");
    await page();
    assert.deepStrictEqual(Object.values(fake.data("print_jobs")).map((j) => [j.status, j.printCode]), [["pending", undefined], ["pending", undefined]]);
  });

  test("revisiting the page does not ask Cashfree again and keeps the same code", async () => {
    linkStatus("PAID");
    await page();
    const code = Object.values(fake.data("print_jobs"))[0].printCode;
    http.calls.length = 0;
    await page();
    assert.strictEqual(http.calls.filter((c) => /\/links\//.test(c.url)).length, 0);
    assert.strictEqual(Object.values(fake.data("print_jobs"))[0].printCode, code);
  });

  test("the code avoids codes held by active jobs", async () => {
    seed({ jobs: { wj1: waJob(), other: waJob({ userId: "u9", orderId: "WA-OTHER", status: "paid", printCode: "4780" }) }, extra: { whatsapp_sessions: { "919876543210": { jobId: "wj1" } } } });
    linkStatus("PAID");
    const original = Math.random; let i = 0; const draws = [0.42, 0.9];
    Math.random = () => draws[Math.min(i++, draws.length - 1)];
    try { await page(); } finally { Math.random = original; }
    assert.strictEqual(fake.data("print_jobs").wj1.printCode, "9100");
  });
});
