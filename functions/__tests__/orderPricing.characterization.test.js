// CHARACTERIZATION TESTS: how POST /create-order prices a print order today.
// Table-driven so a price change has to be made on purpose. Prices are server-side: B&W ₹2.80, colour ₹10.00,
// double-sided B&W ₹3.30 per sheet, blank graph sheet ₹2.00; 1 coin = ₹0.50; coupons are a percentage;
// orders below ₹1.00 are treated as free and skip the payment gateway.
const test = require("node:test");
const assert = require("node:assert");
const { seed, checkout, cashfreeCalls, pendingJob, mergedJobs, fake } = require("./helpers/orderHarness");

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || "amount"}: expected ${b}, got ${a}`);

/** Prices `pages` pages (one job) with the given options and returns { amount, free, pricing }. */
async function price({ pages = 10, options = {}, coupon, coins, jobs, coupons, settings } = {}) {
  seed({ jobs: jobs || { j1: pendingJob({ pageCount: pages }) }, coupons, extra: settings ? { mimo_settings: { pricing: settings } } : {} });
  const res = await checkout({ printOptions: options, couponCode: coupon, coinsToUse: coins, jobIds: Object.keys(jobs || { j1: 1 }) });
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  const job = mergedJobs().find(([, j]) => j.pricing)[1];
  return { amount: res.body.amount, free: res.body.free === true, pricing: job.pricing, res, job };
}

test.describe("page price tables", () => {
  const rows = [
    // [name, pages, options, expected amount]
    ["B&W simplex: ₹2.80 per page", 10, {}, 28],
    ["single B&W page", 1, {}, 2.8],
    ["colour: ₹10 per page", 10, { colorMode: "color" }, 100],
    ["copies multiply the price", 5, { copies: 3 }, 42],
    ["double-sided B&W halves the sheets and costs ₹3.30 per sheet", 10, { doubleSided: "double" }, 16.5],
    ["double-sided colour halves the sheets, price stays ₹10", 10, { doubleSided: "double", colorMode: "color" }, 50],
    ["double-sided with an odd page count rounds sheets UP", 5, { doubleSided: "double" }, 9.9],
    ["2-up photo layout halves the pages", 10, { photoLayout: "2" }, 14],
    ["4-up photo layout: ceil(10/4)=3 pages", 10, { photoLayout: "4" }, 8.4],
    ["6-up photo layout: ceil(10/6)=2 pages", 10, { photoLayout: "6" }, 5.6],
    ["9-up photo layout: ceil(10/9)=2 pages", 10, { photoLayout: "9" }, 5.6],
    ["2-up plus double-sided: ceil(ceil(10/2)/2)=3 sheets at ₹3.30", 10, { photoLayout: "2", doubleSided: "double" }, 9.9],
    ["unknown photo layout is ignored", 10, { photoLayout: "3" }, 28],
    ["blank graph sheets cost ₹2.00", 4, { isBlankSheet: true, sheetType: "graph" }, 8],
    ["blank A4 sheets are ordinary B&W pages", 4, { isBlankSheet: true, sheetType: "a4" }, 11.2],
    ["the legacy blankSheet flag works too", 4, { blankSheet: true, sheetType: "graph" }, 8],
    ["colour wins over the graph-sheet price", 4, { isBlankSheet: true, sheetType: "graph", colorMode: "color" }, 40],
  ];
  for (const [name, pages, options, expected] of rows) {
    test(name, async () => {
      const r = await price({ pages, options });
      close(r.amount, expected);
      assert.strictEqual(r.free, false);
    });
  }

  test("the merged job records how it was priced", async () => {
    const r = await price({ pages: 10, options: { doubleSided: "double", copies: 2 } });
    assert.deepStrictEqual({ ...r.pricing, jobCost: Number(r.pricing.jobCost.toFixed(2)) }, { pricePerPage: 3.3, totalPages: 5, jobCost: 33 });
    assert.strictEqual(r.job.totalCost, r.job.finalCost);
    assert.strictEqual(r.job.pageCount, 10, "pageCount keeps the RAW page count");
    assert.strictEqual(r.job.duplex, true);
    assert.strictEqual(r.job.copies, 2);
  });
});

test.describe("custom page selections", () => {
  const custom = (pageRange, pages = 10) => price({ pages, options: { pageSelection: "custom", pageRange } });
  test("ranges and single pages are counted: '1-3,5' = 4 pages", async () => close((await custom("1-3,5")).amount, 11.2));
  test("a single range: '2-4' = 3 pages", async () => close((await custom("2-4")).amount, 8.4));
  test("out-of-range pages are ignored, valid ones still count: '1,20' = 1 page", async () => close((await custom("1,20")).amount, 2.8));
  test("if no part of the selection is valid the FULL document is charged", async () => {
    close((await custom("20-30")).amount, 28);
    close((await custom("abc")).amount, 28);
  });
  test("reversed ranges are ignored: '5-2' -> full document", async () => close((await custom("5-2")).amount, 28));
  test("without pageSelection=custom the range is ignored", async () => {
    const r = await price({ pages: 10, options: { pageRange: "1-2" } });
    close(r.amount, 28);
  });
  test("per-file configuration applies to that file only", async () => {
    const jobs = { j1: pendingJob({ fileName: "a.pdf", pageCount: 10 }), j2: pendingJob({ fileName: "b.pdf", pageCount: 10 }) };
    const r = await price({ jobs, options: { fileConfigs: { "a.pdf": { pageSelection: "custom", pageRange: "1-2" } } } });
    close(r.amount, (2 + 10) * 2.8);
  });
});

test.describe("several pending jobs in one checkout", () => {
  test("pages are summed into ONE merged job and the originals are deleted", async () => {
    const jobs = { j1: pendingJob({ pageCount: 3, fileName: "a.pdf" }), j2: pendingJob({ pageCount: 4, fileName: "b.pdf" }) };
    const r = await price({ jobs });
    close(r.amount, 19.6);
    assert.strictEqual(r.job.files.length, 2);
    assert.strictEqual(r.job.fileName, "Multiple Files (2)");
    assert.strictEqual(r.job.pageCount, 7);
    const stored = Object.keys(fake.data("print_jobs"));
    assert.ok(!stored.includes("j1") && !stored.includes("j2"), "original pending jobs are gone");
    assert.strictEqual(stored.length, 1);
  });
});

test.describe("coupons and coins", () => {
  const coupon = (pct, extra = {}) => ({ SAVE: { isActive: true, discountPercentage: pct, ...extra } });

  test("a percentage coupon reduces the price: 10% of ₹28 = ₹25.20", async () => close((await price({ coupon: "SAVE", coupons: coupon(10) })).amount, 25.2));
  test("coupon codes are case-insensitive", async () => close((await price({ coupon: "save", coupons: coupon(10) })).amount, 25.2));
  test("the coupon amount is rounded to paise: 15% of ₹2.80 = ₹2.38", async () => close((await price({ pages: 1, coupon: "SAVE", coupons: coupon(15) })).amount, 2.38));
  test("a 100% coupon makes the order free", async () => {
    const r = await price({ coupon: "SAVE", coupons: coupon(100) });
    assert.strictEqual(r.free, true);
    assert.strictEqual(r.amount, 0);
  });
  test("an unknown, inactive or expired coupon is silently ignored (the order is created at full price)", async () => {
    close((await price({ coupon: "NOPE", coupons: coupon(10) })).amount, 28);
    close((await price({ coupon: "SAVE", coupons: coupon(10, { isActive: false }) })).amount, 28);
    const expired = { toDate: () => new Date("2020-01-01") };
    close((await price({ coupon: "SAVE", coupons: coupon(10, { expiryDate: expired }) })).amount, 28);
  });
  test("a coupon with a future expiry date is applied", async () => {
    const future = { toDate: () => new Date("2099-01-01") };
    close((await price({ coupon: "SAVE", coupons: coupon(10, { expiryDate: future }) })).amount, 25.2);
  });
  test("1 coin is worth ₹0.50: 4 coins take ₹2 off", async () => close((await price({ coins: 4 })).amount, 26));
  test("coins are applied BEFORE the coupon percentage: (28 - 2) x 0.9 = 23.40", async () => close((await price({ coins: 4, coupon: "SAVE", coupons: coupon(10) })).amount, 23.4));
});

test.describe("free-order threshold (anything under ₹1.00 skips the gateway)", () => {
  const cheap = (pct) => price({ pages: 1, options: { colorMode: "color" }, coupon: "SAVE", coupons: { SAVE: { isActive: true, discountPercentage: pct } } }); // ₹10 page
  test("₹0.90 payable -> free order", async () => {
    const r = await cheap(91);
    assert.strictEqual(r.free, true);
    assert.strictEqual(cashfreeCalls().length, 0);
  });
  test("exactly ₹1.00 payable -> goes to Cashfree", async () => {
    const r = await cheap(90);
    assert.strictEqual(r.free, false);
    close(r.amount, 1);
    assert.strictEqual(cashfreeCalls().length, 1);
    assert.strictEqual(cashfreeCalls()[0].body.order_amount, r.amount);
  });
  test("the amount sent to Cashfree equals the amount returned to the browser", async () => {
    const r = await price({ pages: 7, options: { colorMode: "color" }, coupon: "SAVE", coupons: { SAVE: { isActive: true, discountPercentage: 20 } } });
    assert.strictEqual(cashfreeCalls()[0].body.order_amount, r.amount);
    assert.strictEqual(cashfreeCalls()[0].body.order_currency, "INR");
    close(r.amount, 56);
  });
});

test.describe("prices come from mimo_settings/pricing (the document the admin dashboard edits)", () => {
  const settings = { pricePerPageBW: 5, pricePerPageColor: 12, pricePerPageA4: 4, pricePerPageBWDuplex: 6, pricePerPageGraph: 3 };
  test("every rate is honoured", async () => {
    close((await price({ settings })).amount, 50);                                                       // B&W
    close((await price({ settings, options: { colorMode: "color" } })).amount, 120);                      // colour
    close((await price({ settings, pages: 4, options: { isBlankSheet: true, sheetType: "graph" } })).amount, 12); // graph sheet
    close((await price({ settings, pages: 4, options: { isBlankSheet: true, sheetType: "a4" } })).amount, 16);    // blank A4
    close((await price({ settings, options: { doubleSided: "double" } })).amount, 30);                   // 5 sheets x 6
  });
  test("the values stored in production today (numbers or numeric strings) price exactly like the built-in defaults", async () => {
    const live = { pricePerPageColor: "10", pricePerPageBWDuplex: 3.3, pricePerPageA4: 2.8, pricePerPageBW: 2.8, pricePerPageGraph: "2" };
    for (const options of [{}, { colorMode: "color" }, { doubleSided: "double" }, { isBlankSheet: true, sheetType: "graph" }]) {
      const withLive = (await price({ settings: live, options })).amount;
      const withDefaults = (await price({ options })).amount;
      close(withLive, withDefaults, JSON.stringify(options));
    }
  });
  test("missing, zero, negative or non-numeric rates fall back to the defaults — a bad settings document can never make printing free", async () => {
    close((await price({ settings: { pricePerPageBW: 0 } })).amount, 28);
    close((await price({ settings: { pricePerPageBW: -3 } })).amount, 28);
    close((await price({ settings: { pricePerPageBW: "abc", pricePerPageColor: null } })).amount, 28);
    close((await price({ settings: { pricePerPageBW: "abc" }, options: { colorMode: "color" } })).amount, 100);
    close((await price({ settings: {} })).amount, 28);
  });
  test("the merged job records the rate that was used", async () => {
    const r = await price({ settings, pages: 2 });
    assert.strictEqual(r.pricing.pricePerPage, 5);
  });
});
