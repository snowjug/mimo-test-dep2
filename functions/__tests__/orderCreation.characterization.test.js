// CHARACTERIZATION TESTS: POST /create-order beyond pricing — validation, job merging, the Cashfree request,
// free orders, and duplicate/abuse cases. KNOWN RISK / KNOWN DEFECT tests document weaknesses found while auditing;
// they pass today and must be flipped ON PURPOSE when the behaviour is fixed (see docs/contributing.md).
const test = require("node:test");
const assert = require("node:assert");
const { fake, http, mailbox, markPaid, seed, checkout, cashfreeCalls, pendingJob, mergedJobs, response, controller } = require("./helpers/orderHarness");

test.describe("validation of the checkout request", () => {
  test.beforeEach(() => seed({ jobs: {
    j1: pendingJob(), other: pendingJob({ userId: "u2" }), paid: pendingJob({ status: "paid" }),
    removed: pendingJob({ removedByUser: true }), deleted: pendingJob({ fileDeleted: true }),
  } }));

  const rejects = async (body, code, pattern) => {
    const res = await checkout(body);
    assert.strictEqual(res.code, code, JSON.stringify(res.body));
    if (pattern) assert.match(res.body.error, pattern);
    assert.strictEqual(cashfreeCalls().length, 0, "no gateway call");
    assert.ok(fake.data("print_jobs").j1, "nothing was merged or deleted");
  };

  test("jobIds is required, must be a non-empty array", async () => {
    await rejects({ jobIds: undefined }, 400, /non-empty jobIds/);
    await rejects({ jobIds: [] }, 400, /non-empty jobIds/);
    await rejects({ jobIds: "j1" }, 400, /non-empty jobIds/);
  });
  test("every jobId must be a non-blank string", async () => {
    await rejects({ jobIds: [42] }, 400, /Invalid jobId/);
    await rejects({ jobIds: ["  "] }, 400, /Invalid jobId/);
  });
  test("the same job twice in one request is rejected (duplicate line items)", async () => {
    await rejects({ jobIds: ["j1", "j1"] }, 400, /Duplicate jobId/);
    await rejects({ jobIds: ["j1", " j1 "] }, 400, /Duplicate jobId/);
  });
  test("an unknown job is rejected", async () => rejects({ jobIds: ["j1", "ghost"] }, 400, /not found: ghost/));
  test("someone else's job is rejected with 403", async () => rejects({ jobIds: ["j1", "other"] }, 403, /Unauthorized/));
  test("only pending jobs can be checked out (a paid job cannot be paid for twice)", async () => rejects({ jobIds: ["paid"] }, 400, /not in pending status/));
  test("removed or file-deleted jobs are rejected", async () => {
    await rejects({ jobIds: ["removed"] }, 400, /removed or deleted/);
    await rejects({ jobIds: ["deleted"] }, 400, /removed or deleted/);
  });
});

test.describe("what a successful paid checkout does", () => {
  test.beforeEach(() => seed({ jobs: { j1: pendingJob({ pageCount: 5 }) } }));

  test("returns the Cashfree session and records an INITIATED payment transaction", async () => {
    const res = await checkout({ printOptions: {} });
    assert.match(res.body.orderId, /^order_[0-9a-f]{10}$/);
    assert.deepStrictEqual(res.body, { orderId: res.body.orderId, paymentSessionId: "session_test", amount: 14 });
    const [txn] = Object.values(fake.data("payment_transactions"));
    assert.deepStrictEqual({ orderId: txn.orderId, userId: txn.userId, amount: txn.amount, status: txn.status }, { orderId: res.body.orderId, userId: "u1", amount: 14, status: "INITIATED" });
  });

  test("replaces the pending job by ONE new pending job that carries the order id and the pricing", async () => {
    const res = await checkout({ printOptions: {} });
    const jobs = fake.data("print_jobs");
    assert.ok(!jobs.j1, "the original pending job is deleted");
    const [job] = Object.values(jobs);
    assert.strictEqual(job.status, "pending");
    assert.strictEqual(job.orderId, res.body.orderId);
    assert.strictEqual(job.userId, "u1");
    assert.strictEqual(job.kioskId, "CV-001", "default kiosk when none is chosen");
    assert.strictEqual(job.files.length, 1);
    assert.strictEqual(job.files[0].pageCount, 5);
    assert.strictEqual(job.color, false);
  });

  test("a kiosk chosen in the print options is stored on the job", async () => {
    await checkout({ printOptions: { directKioskId: "SV-002", colorMode: "color" } });
    const [job] = Object.values(fake.data("print_jobs"));
    assert.strictEqual(job.kioskId, "SV-002");
    assert.strictEqual(job.color, true);
  });

  test("generates an order id `order_<10 hex>` when the client sends none", async () => {
    const res = await checkout({});
    assert.match(res.body.orderId, /^order_[0-9a-f]{10}$/);
  });

  test("Cashfree receives the order id, amount, INR, customer details and the payment-verify return URL", async () => {
    const res = await checkout({});
    const [call] = cashfreeCalls();
    assert.strictEqual(call.body.order_id, res.body.orderId);
    assert.strictEqual(call.body.order_amount, 14);
    assert.strictEqual(call.body.order_currency, "INR");
    assert.strictEqual(call.body.order_meta.return_url, "https://printmimo.tech/payment-verify?order_id={order_id}");
    assert.strictEqual(call.config.timeout, 10000);
    assert.ok(call.config.headers["x-client-id"] && call.config.headers["x-api-version"]);
  });

  test("customer details come from the user profile: last 10 digits of the phone, name precedence, e-mail", async () => {
    seed({ user: { mobileNumber: "+91 98765-43210", name: "Asha", username: "ignored", email: "asha@example.com" } });
    await checkout({});
    assert.deepStrictEqual(cashfreeCalls()[0].body.customer_details, { customer_id: "u1", customer_phone: "9876543210", customer_name: "Asha", customer_email: "asha@example.com" });
  });

  test("without profile data the request body or placeholders are used", async () => {
    seed({ user: {} });
    await checkout({ customerName: "Given Name" });
    const d = cashfreeCalls()[0].body.customer_details;
    assert.deepStrictEqual([d.customer_phone, d.customer_name, d.customer_email], ["9999999999", "Given Name", "user@printmimo.tech"]);
  });

  test("the paid path does NOT create an `orders` record and issues no print code (that happens after payment)", async () => {
    const res = await checkout({});
    assert.strictEqual(res.body.free, undefined);
    assert.deepStrictEqual(fake.data("orders"), {});
    assert.strictEqual(Object.values(fake.data("print_jobs"))[0].printCode, undefined);
  });
});

test.describe("failures of the gateway", () => {
  test("if Cashfree refuses the order nothing is written: the customer's pending jobs, coins and records are untouched and the checkout can be retried", async () => {
    seed({ jobs: { j1: pendingJob(), j2: pendingJob({ fileName: "b.pdf" }) }, user: { mimo_coins: { balance: 20, total_earned: 20, total_used: 0 } } });
    http.reset();
    http.on("post", /sandbox\.cashfree\.com/, () => { throw Object.assign(new Error("gateway down"), { response: { data: { message: "down" } } }); });
    const res = await checkout({ jobIds: ["j1", "j2"], coinsToUse: 4 });
    assert.strictEqual(res.code, 500);
    assert.deepStrictEqual(res.body, { error: "Failed to create payment order" });
    assert.deepStrictEqual(Object.keys(fake.data("print_jobs")).sort(), ["j1", "j2"], "both original jobs are still there, unmerged");
    assert.deepStrictEqual(fake.data("payment_transactions"), {});
    assert.strictEqual(fake.data("users").u1.mimo_coins.balance, 20);
    assert.strictEqual(fake.log.writes.length, 0, "not a single write happened");

    http.reset();
    http.on("post", /sandbox\.cashfree\.com/, () => ({ data: { payment_session_id: "retry_session" } }));
    const retry = await checkout({ jobIds: ["j1", "j2"], coinsToUse: 4 });
    assert.strictEqual(retry.code, 200);
    assert.strictEqual(retry.body.paymentSessionId, "retry_session");
  });

  test("the Cashfree order is created before the jobs are merged (a failure after the gateway call leaves only an unused gateway order)", async () => {
    seed({});
    await checkout({});
    assert.strictEqual(cashfreeCalls().length, 1);
    assert.ok(!fake.data("print_jobs").j1);
  });
});

test.describe("free orders (payable amount below ₹1)", () => {
  const free = () => checkout({ printOptions: {}, couponCode: "ALL", coinsToUse: 0 });
  const seedFree = () => seed({ coupons: { ALL: { isActive: true, discountPercentage: 100 } }, user: { email: "u1@example.com", mobileNumber: "9876543210", mimo_coins: { balance: 10, total_earned: 10, total_used: 0 } } });
  test.beforeEach(seedFree);

  test("skips the gateway, issues the print code at once and returns free:true", async () => {
    const res = await free();
    assert.strictEqual(res.code, 200);
    assert.match(res.body.printCode, /^[1-9]\d{3}$/);
    assert.deepStrictEqual({ ...res.body, printCode: "x", orderId: "x" }, { orderId: "x", paymentSessionId: null, amount: 0, printCode: "x", free: true });
    assert.strictEqual(cashfreeCalls().length, 0);
    const [job] = Object.values(fake.data("print_jobs"));
    assert.strictEqual(job.status, "paid");
    assert.strictEqual(job.printCode, res.body.printCode);
    assert.strictEqual(job.isPrinted, false);
    assert.ok(job.retentionStartAt && job.codeCreatedAt && job.paymentTime);
  });

  test("records an `orders` document as PAID with amount 0, the coupon and coins used", async () => {
    const res = await checkout({ couponCode: "ALL" });
    const [order] = Object.values(fake.data("orders"));
    assert.deepStrictEqual({ orderId: order.orderId, amount: order.amount, status: order.status, orderStatus: order.orderStatus, couponCode: order.couponCode, discountPercentage: order.discountPercentage, coinsUsed: order.coinsUsed },
      { orderId: res.body.orderId, amount: 0, status: "PAID", orderStatus: "completed", couponCode: "ALL", discountPercentage: 100, coinsUsed: 0 });
    assert.strictEqual(order.printJobs.length, 1);
  });

  test("coins used on a free order are deducted from the balance and added to total_used", async () => {
    seed({ jobs: { j1: pendingJob({ pageCount: 1 }) }, coupons: { ALL: { isActive: true, discountPercentage: 100 } },
      user: { mimo_coins: { balance: 10, total_earned: 10, total_used: 0 } } });
    const res = await checkout({ coinsToUse: 2, couponCode: "ALL" }); // 2.80 - 1.00 coins-discount = 1.80, coupon 100% -> free
    assert.strictEqual(res.body.free, true);
    assert.deepStrictEqual(fake.data("users").u1.mimo_coins, { balance: 8, total_earned: 10, total_used: 2 });
    assert.strictEqual(Object.values(fake.data("orders"))[0].coinsUsed, 2);
  });

  test("a WhatsApp message with the code is sent when the user has a mobile number", async () => {
    await free();
    const wa = http.calls.filter((c) => /graph\.facebook\.com/.test(c.url));
    assert.strictEqual(wa.length, 1);
    assert.match(JSON.stringify(wa[0].body), /print code/i);
  });

  test("the free-order receipt e-mail carries the print code and goes to the customer", async () => {
    process.env.GMAIL_APP_PASSWORD = "test-app-password";
    try {
      const res = await free();
      assert.strictEqual(mailbox.length, 1);
      assert.strictEqual(mailbox[0].to, "u1@example.com");
      assert.match(mailbox[0].subject, /Print Code/);
      assert.ok(mailbox[0].html.includes(res.body.printCode), "the e-mail contains the code");
    } finally { delete process.env.GMAIL_APP_PASSWORD; }
  });

  test("no e-mail is attempted without a Gmail app password, and a failing mail server never fails the order", async () => {
    await free();
    assert.strictEqual(mailbox.length, 0);
    seedFree(); // the first checkout consumed the pending job
    process.env.GMAIL_APP_PASSWORD = "test-app-password";
    mailbox.failNext = true;
    const original = console.error; console.error = () => {};
    try {
      const res = await free();
      assert.strictEqual(res.code, 200);
      assert.match(res.body.printCode, /^\d{4}$/);
    } finally { console.error = original; delete process.env.GMAIL_APP_PASSWORD; }
  });
});

test.describe("coins", () => {
  const owns = (balance) => ({ mimo_coins: { balance, total_earned: balance, total_used: 0 } });
  const balanceOf = () => fake.data("users").u1.mimo_coins.balance;

  test("coins the customer does not own are refused: nothing is written, the balance is untouched", async () => {
    seed({ user: owns(0) });
    const res = await checkout({ coinsToUse: 1000, printOptions: {} });
    assert.strictEqual(res.code, 400);
    assert.deepStrictEqual(res.body, { error: "Not enough Mimo coins." });
    assert.ok(fake.data("print_jobs").j1, "the pending job is still there");
    assert.strictEqual(balanceOf(), 0);
    assert.strictEqual(cashfreeCalls().length, 0);
  });

  test("coins cannot exceed the balance by even one", async () => {
    seed({ user: owns(10) });
    assert.strictEqual((await checkout({ coinsToUse: 11 })).code, 400);
    seed({ user: owns(10) });
    assert.strictEqual((await checkout({ coinsToUse: 10 })).code, 200);
  });

  test("coins cover at most half of the price: 1000 coins on a ₹28 order apply 28 coins (₹14) and the rest is paid", async () => {
    seed({});
    const res = await checkout({ coinsToUse: 1000 });
    assert.strictEqual(res.body.free, undefined);
    assert.strictEqual(res.body.amount, 14);
    assert.strictEqual(cashfreeCalls()[0].body.order_amount, 14);
    assert.strictEqual(Object.values(fake.data("print_jobs"))[0].coinsToDeduct, 28);
  });

  test("fractional coins are allowed (the customer site sends them); negative, non-numeric and infinite values are refused", async () => {
    seed({});
    assert.strictEqual((await checkout({ coinsToUse: 2.5 })).code, 200);
    for (const bad of [-1, "abc", Infinity, NaN]) {
      seed({});
      const res = await checkout({ coinsToUse: bad });
      assert.strictEqual(res.code, 400, String(bad));
      assert.match(res.body.error, /coinsToUse/);
      assert.ok(fake.data("print_jobs").j1, "nothing was merged");
    }
  });

  test("paid path: coins are RESERVED at checkout and deducted once when the payment is confirmed", async () => {
    seed({ user: owns(50) });
    const created = await checkout({ coinsToUse: 4 });
    const orderId = created.body.orderId;
    assert.strictEqual(balanceOf(), 50, "not deducted yet");
    const [job] = Object.entries(fake.data("print_jobs"));
    assert.strictEqual(job[1].coinsToDeduct, 4);
    await markPaid(orderId); // what /verify-payment does once Cashfree confirms the payment

    const res = response();
    await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId } }, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(fake.data("users").u1.mimo_coins, { balance: 46, total_earned: 50, total_used: 4 });
    assert.strictEqual(fake.data("print_jobs")[job[0]].coinsDeducted, true);

    const again = response();
    await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId } }, again);
    assert.strictEqual(again.body.printCode, res.body.printCode, "same code");
    assert.strictEqual(balanceOf(), 46, "coins are charged exactly once");
  });

  test("coins reserved by one unpaid order cannot be spent again on a second order", async () => {
    seed({ jobs: { j1: pendingJob(), j2: pendingJob({ fileName: "b.pdf" }) }, user: owns(10) });
    assert.strictEqual((await checkout({ jobIds: ["j1"], coinsToUse: 8 })).code, 200);
    const second = await checkout({ jobIds: ["j2"], coinsToUse: 8 });
    assert.strictEqual(second.code, 400);
    assert.match(second.body.error, /Not enough Mimo coins/);
    assert.strictEqual((await checkout({ jobIds: ["j2"], coinsToUse: 2 })).code, 200);
  });

  test("defence in depth: a job flagged coinsDeducted is never charged again even if its code is (re)issued", async () => {
    seed({ jobs: { j1: pendingJob({ orderId: "order_z", coinsToDeduct: 4, coinsDeducted: true }) }, user: owns(50), extra: { orders: { oz: { orderId: "order_z", userId: "u1", amount: 20, status: "PAID" } } } });
    const res = response();
    await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: "order_z" } }, res);
    assert.strictEqual(res.code, 200);
    assert.strictEqual(balanceOf(), 50);
  });

  test("an order without coins never touches the user's coin balance at payment confirmation", async () => {
    seed({ user: owns(50) });
    const created = await checkout({});
    await markPaid(created.body.orderId);
    const res = response();
    await controller.postPaymentSuccess({ user: { userId: "u1" }, body: { orderId: created.body.orderId } }, res);
    assert.strictEqual(balanceOf(), 50);
    assert.ok(!fake.log.writes.some((w) => w.path === "users/u1"));
  });
});

test.describe("copies and amounts are validated", () => {
  test("a job whose page count is corrupt cannot produce a NaN amount: the checkout is refused before anything is written", async () => {
    seed({ jobs: { j1: pendingJob({ pageCount: "abc" }) } });
    const res = await checkout({});
    assert.strictEqual(res.code, 400);
    assert.deepStrictEqual(res.body, { error: "Invalid order amount." });
    assert.ok(fake.data("print_jobs").j1, "the pending job is untouched");
    assert.strictEqual(cashfreeCalls().length, 0);
  });

  test("copies must be a whole number from 1 to 100; nothing is written when it is not", async () => {
    for (const bad of [-1, 1.5, "abc", 101, 1000000]) {
      seed({});
      const res = await checkout({ printOptions: { copies: bad } });
      assert.strictEqual(res.code, 400, String(bad));
      assert.match(res.body.error, /copies must be a whole number/);
      assert.ok(fake.data("print_jobs").j1, "the pending job is untouched");
      assert.strictEqual(cashfreeCalls().length, 0);
    }
  });
  test("copies 1 to 100 are accepted; a missing or zero value means 1", async () => {
    for (const [copies, expected] of [[1, 28], [100, 2800], [undefined, 28], [0, 28], ["3", 84]]) {
      seed({});
      const res = await checkout({ printOptions: { copies } });
      assert.strictEqual(res.code, 200, String(copies));
      assert.strictEqual(res.body.amount, expected);
    }
  });
  test("a coupon percentage above 100 is treated as 100 (free), a negative or invalid one as 0", async () => {
    seed({ coupons: { HUGE: { isActive: true, discountPercentage: 400 } } });
    const free = await checkout({ couponCode: "HUGE" });
    assert.strictEqual(free.body.free, true);
    assert.strictEqual(free.body.amount, 0);
    seed({ coupons: { NEG: { isActive: true, discountPercentage: -50 }, BAD: { isActive: true, discountPercentage: "x" } } });
    assert.strictEqual((await checkout({ couponCode: "NEG" })).body.amount, 28);
    seed({ coupons: { BAD: { isActive: true, discountPercentage: "x" } } });
    assert.strictEqual((await checkout({ couponCode: "BAD" })).body.amount, 28);
  });
});

test.describe("abuse and edge cases", () => {
  test("an order id supplied by the client is ignored: a new id is always generated, so nobody can attach a job to an existing order", async () => {
    seed({ extra: { orders: { existing: { orderId: "order_taken", userId: "u9", amount: 50, status: "PAID" } } } });
    const res = await checkout({ orderId: "order_taken" });
    assert.strictEqual(res.code, 200);
    assert.notStrictEqual(res.body.orderId, "order_taken");
    assert.match(res.body.orderId, /^order_[0-9a-f]{10}$/);
    assert.strictEqual(Object.values(fake.data("print_jobs"))[0].orderId, res.body.orderId);
    assert.strictEqual(cashfreeCalls()[0].body.order_id, res.body.orderId);
    assert.deepStrictEqual(fake.data("orders").existing, { orderId: "order_taken", userId: "u9", amount: 50, status: "PAID" }, "the other customer's order is untouched");
  });

  test("checking out the same jobs twice: the second attempt fails because the first replaced them", async () => {
    seed({});
    const first = await checkout({});
    assert.strictEqual(first.code, 200);
    const second = await checkout({});
    assert.strictEqual(second.code, 400);
    assert.match(second.body.error, /Print job not found: j1/);
    assert.strictEqual(cashfreeCalls().length, 1, "only one payment session was created");
  });

  test("two customers cannot check out each other's jobs", async () => {
    seed({});
    const res = await checkout({}, "u2");
    assert.strictEqual(res.code, 403);
  });

  test("print codes of free orders are unique among active jobs too", async () => {
    const original = Math.random;
    let i = 0; const draws = [0.42, 0.9];
    try {
      seed({ jobs: { j1: pendingJob(), other: pendingJob({ userId: "u9", status: "paid", printCode: "4780" }) }, coupons: { ALL: { isActive: true, discountPercentage: 100 } } });
      Math.random = () => draws[Math.min(i++, draws.length - 1)];
      const res = await checkout({ couponCode: "ALL" });
      assert.strictEqual(res.body.printCode, "9100", "4780 belongs to an active job, so it was redrawn");
    } finally { Math.random = original; }
  });

  test("print-code generation: the free path draws from 1000-9999", async () => {
    const original = Math.random;
    try {
      for (const [r, expected] of [[0, "1000"], [0.5, "5500"], [0.9999999, "9999"]]) {
        Math.random = () => r;
        seed({ coupons: { ALL: { isActive: true, discountPercentage: 100 } } });
        const res = await checkout({ couponCode: "ALL" });
        assert.strictEqual(res.body.printCode, expected);
      }
    } finally { Math.random = original; }
  });
});
void response; void controller; void mergedJobs;
