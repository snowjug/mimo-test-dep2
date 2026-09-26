// Single source of truth for per-page prices: the `mimo_settings/pricing` document that the admin dashboard edits
// (the same document GET /api/settings serves to the customer site). Missing, invalid or non-positive values fall
// back to the defaults below, so a broken settings document can never make prices free or block a checkout.

const DEFAULT_RATES = Object.freeze({
  pricePerPageBW: 2.8,
  pricePerPageColor: 10,
  pricePerPageA4: 2.8,
  pricePerPageBWDuplex: 3.3,
  pricePerPageGraph: 2,
});

function sanitizeRates(raw = {}) {
  const rates = {};
  for (const [key, fallback] of Object.entries(DEFAULT_RATES)) {
    const n = Number(raw[key]);
    rates[key] = Number.isFinite(n) && n > 0 ? n : fallback;
  }
  return rates;
}

/** @returns {Promise<{rates: object, raw: object}>} rates are validated; raw is the stored document (for channel-specific overrides). */
async function loadPricing(db) {
  let raw = {};
  try {
    const doc = await db.collection("mimo_settings").doc("pricing").get();
    raw = doc.exists ? doc.data() || {} : {};
  } catch (err) {
    console.warn("[PRICING] could not read mimo_settings/pricing, using defaults:", err.message);
  }
  return { rates: sanitizeRates(raw), raw };
}

module.exports = { DEFAULT_RATES, sanitizeRates, loadPricing };
