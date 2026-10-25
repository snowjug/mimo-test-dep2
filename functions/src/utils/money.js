/**
 * Exact monetary arithmetic module for MIMO Finance.
 * Guarantees zero floating-point drift by conducting all internal financial operations
 * in integer paise (1 Rupee = 100 Paise).
 */

/**
 * Converts rupees (number, string, or float) to integer paise.
 * Safely handles floating-point errors (e.g. 19.99 * 100 = 1998.9999999999998 -> 1999).
 * @param {number|string} rupees
 * @returns {number} Integer paise
 */
function toPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === "") return 0;
  const num = typeof rupees === "string" ? parseFloat(rupees.replace(/[^\d.-]/g, "")) : Number(rupees);
  if (!Number.isFinite(num)) return 0;
  // Multiply by 100 with rounding to eliminate IEEE 754 precision artifacts
  return Math.round(num * 100);
}

/**
 * Converts integer paise to a 2-decimal rupee number.
 * @param {number} paise
 * @returns {number} Rupee value with 2 decimal places
 */
function toRupees(paise) {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise) / 100;
}

/**
 * Formats an amount into an Indian Rupee currency string (e.g. ₹12,503.50).
 * @param {number} amount
 * @param {boolean} [isPaise=false] - If true, treats amount as paise; if false, as rupees
 * @returns {string} Formatted INR string
 */
function formatINR(amount, isPaise = false) {
  const rupees = isPaise ? toRupees(amount) : Number(amount) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Adds multiple paise amounts safely.
 * @param  {...number} paiseAmounts
 * @returns {number} Integer paise sum
 */
function sumPaise(...paiseAmounts) {
  return paiseAmounts.reduce((acc, curr) => acc + (Number.isFinite(curr) ? Math.round(curr) : 0), 0);
}

/**
 * Subtracts subtrahend from minuend in paise.
 * @param {number} minuendPaise
 * @param {number} subtrahendPaise
 * @returns {number} Integer paise
 */
function subtractPaise(minuendPaise, subtrahendPaise) {
  const m = Number.isFinite(minuendPaise) ? Math.round(minuendPaise) : 0;
  const s = Number.isFinite(subtrahendPaise) ? Math.round(subtrahendPaise) : 0;
  return m - s;
}

/**
 * Multiplies an integer paise amount by a factor (such as MDR fee percentage)
 * using standard half-up rounding (or banker's rounding).
 * @param {number} paise
 * @param {number} factor - e.g. 0.0175 for 1.75%
 * @returns {number} Integer paise
 */
function multiplyPaise(paise, factor) {
  if (!Number.isFinite(paise) || !Number.isFinite(factor)) return 0;
  return Math.round(paise * factor);
}

/**
 * Proportional allocation without penny/paisa loss (Hare-Niemeyer / Largest Remainder method).
 * Given a total amount in paise and a list of weights/ratios, distributes exactly totalPaise
 * across the items such that sum(results) === totalPaise.
 *
 * Essential for allocating order payment across multi-job orders or refund allocations.
 *
 * @param {number} totalPaise - Total integer paise to distribute
 * @param {number[]} ratios - Array of positive numeric weights (e.g. page counts or item prices)
 * @returns {number[]} Array of integer paise allocations of identical length
 */
function allocatePaise(totalPaise, ratios) {
  if (!Array.isArray(ratios) || ratios.length === 0) return [];
  if (ratios.length === 1) return [totalPaise];
  const sumWeights = ratios.reduce((a, b) => a + (Number(b) > 0 ? Number(b) : 0), 0);
  if (sumWeights <= 0) {
    // If all weights are 0, split evenly with remainder distributed to first elements
    const base = Math.floor(totalPaise / ratios.length);
    let rem = totalPaise - base * ratios.length;
    return ratios.map(() => (rem-- > 0 ? base + 1 : base));
  }

  const rawShares = ratios.map((r) => {
    const w = Number(r) > 0 ? Number(r) : 0;
    return (totalPaise * w) / sumWeights;
  });

  const baseShares = rawShares.map((s) => Math.floor(s));
  const allocatedBase = baseShares.reduce((a, b) => a + b, 0);
  let remainder = totalPaise - allocatedBase;

  // Rank by fraction descending to distribute remaining paise
  const indexedFractions = rawShares.map((s, idx) => ({ idx, fraction: s - Math.floor(s) }));
  indexedFractions.sort((a, b) => b.fraction - a.fraction);

  const result = [...baseShares];
  for (let i = 0; i < remainder; i++) {
    const targetIdx = indexedFractions[i % indexedFractions.length].idx;
    result[targetIdx] += 1;
  }

  return result;
}

module.exports = {
  toPaise,
  toRupees,
  formatINR,
  sumPaise,
  subtractPaise,
  multiplyPaise,
  allocatePaise,
};
