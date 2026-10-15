"use strict";
// Pricing reuse probe. Findings (see README "Dynamic pricing"):
//  - REUSABLE as-is: functions/src/services/pricing.service.js -> loadPricing(db) / sanitizeRates (rates only).
//  - NOT reusable: the order TOTAL (copies x pages x rate, duplex rounding, N-up divisor, coupons, coins, free
//    threshold) is inlined inside postCreateOrder (payment.controller.js ~L80-241). There is no pure priceOrder().
// So this adapter returns only authoritative RATES plus the inputs a future priceOrder() will need. It computes
// NO price on purpose: a second formula would be the "parallel pricing engine" the mission forbids.
const path = require("path");
const { createRequire } = require("module");
const functionsRequire = createRequire(path.resolve(__dirname, "../../../functions/package.json"));
const { loadPricing } = functionsRequire("./src/services/pricing.service.js");

async function pricingContext(db, { totalRawPages, colorMode, copies }) {
  const { rates } = await loadPricing(db);
  return { rates, inputs: { totalRawPages, colorMode, copies }, total: null, status: "MISSING_INTERFACE:priceOrder" };
}

module.exports = { pricingContext };
