const PAID_ORDER_STATUSES = new Set(["PAID", "SUCCESS", "COMPLETED", "REFUNDED"]);
const PAID_JOB_STATUSES = new Set(["paid", "printing", "completed", "printed", "refunded"]);

function normalizeCouponCode(raw) {
  if (!raw || typeof raw !== "string") return null;
  const clean = raw.trim().toUpperCase();
  return clean || null;
}

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value._seconds === "number") return new Date(value._seconds * 1000).toISOString();
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function isConfirmedOrder(docData) {
  if (!docData) return false;
  const s = String(docData.status || docData.orderStatus || docData.transactionStatus?.status || "").toUpperCase();
  return PAID_ORDER_STATUSES.has(s) || docData.refundStatus === "SUCCESS";
}

function isConfirmedJob(docData) {
  if (!docData) return false;
  const s = String(docData.status || "").toLowerCase();
  return PAID_JOB_STATUSES.has(s) || docData.isPrinted === true || Boolean(docData.printCode);
}

/**
 * Safely increments `coupons/{code}.usedCount` once a payment/free fulfillment is confirmed.
 * Never throws so coupon accounting can never block printing or print-code issuance.
 */
async function incrementCouponRedemption(db, adminSdk, rawCode) {
  const code = normalizeCouponCode(rawCode);
  if (!code || !db) return false;
  try {
    const couponRef = db.collection("coupons").doc(code);
    const snap = await couponRef.get();
    if (!snap || !snap.exists) return false;

    const incrementFn = adminSdk?.firestore?.FieldValue?.increment;
    if (typeof incrementFn === "function") {
      await couponRef.update({ usedCount: incrementFn(1) });
    } else {
      const current = Number(snap.data()?.usedCount) || 0;
      await couponRef.update({ usedCount: current + 1 });
    }
    return true;
  } catch (err) {
    console.warn(`[COUPON] Failed to increment redemption for ${code}:`, err?.message || err);
    return false;
  }
}

/**
 * Aggregates confirmed coupon redemptions across `orders`, `payment_transactions`, and `print_jobs`
 * (including legacy WhatsApp `couponUsed` jobs), deduplicated by orderId so every redemption is counted once.
 */
async function computeCouponRedemptionStats(db) {
  const [couponSnap, ordersSnap, txnSnap, jobsCodeSnap, jobsUsedSnap] = await Promise.all([
    db.collection("coupons").get().catch(() => ({ docs: [] })),
    db.collection("orders").where("couponCode", "!=", null).limit(1000).get().catch(() => ({ docs: [] })),
    db.collection("payment_transactions").where("couponCode", "!=", null).limit(1000).get().catch(() => ({ docs: [] })),
    db.collection("print_jobs").where("couponCode", "!=", null).limit(1000).get().catch(() => ({ docs: [] })),
    db.collection("print_jobs").where("couponUsed", "!=", null).limit(1000).get().catch(() => ({ docs: [] })),
  ]);

  const stats = new Map();
  const seenOrdersByCode = new Map();

  const ensureEntry = (code, seed = {}) => {
    if (!stats.has(code)) {
      stats.set(code, {
        code,
        discountPercentage: seed.discountPercentage || 0,
        active: seed.active !== undefined ? seed.active : true,
        expiresAt: seed.expiresAt || null,
        storedUsedCount: seed.storedUsedCount || 0,
        redemptionCount: 0,
        totalDiscountINR: 0,
        uniqueUsers: new Set(),
        orders: [],
        lastRedeemedAt: null,
      });
      seenOrdersByCode.set(code, new Map());
    }
    return stats.get(code);
  };

  couponSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const code = normalizeCouponCode(data.code || doc.id);
    if (!code) return;
    ensureEntry(code, {
      discountPercentage: Number(data.discountPercentage) || 0,
      active: data.isActive !== false && data.active !== false,
      expiresAt: toIsoDate(data.expiryDate || data.expiresAt),
      storedUsedCount: Number(data.usedCount) || 0,
    });
  });

  const recordOrder = (doc, source) => {
    const d = doc.data() || {};
    const code = normalizeCouponCode(d.couponCode || d.couponUsed);
    if (!code) return;
    if (source === "print_jobs" ? !isConfirmedJob(d) : !isConfirmedOrder(d)) return;

    const entry = ensureEntry(code, { discountPercentage: Number(d.discountPercentage) || 0 });
    const orderKey = d.orderId ? String(d.orderId) : `${source}:${doc.id}`;
    const orderMap = seenOrdersByCode.get(code);

    const explicitDiscount = d.discountAmount !== undefined && d.discountAmount !== null
      ? Number(d.discountAmount)
      : (d.discount !== undefined && d.discount !== null ? Number(d.discount) : null);
    const gross = Number(d.gross ?? d.originalCost ?? d.grossAmount ?? d.totalCost ?? d.amount ?? 0);
    const paid = Number(d.amount ?? d.finalCost ?? d.totalCost ?? 0);
    const derivedDiscount = explicitDiscount !== null && Number.isFinite(explicitDiscount)
      ? Math.max(0, explicitDiscount)
      : Math.max(0, gross - paid);
    const orderTime = toIsoDate(d.paymentTime || d.paidAt || d.createdAt);

    const prev = orderMap.get(orderKey);
    if (!prev) {
      orderMap.set(orderKey, { discount: derivedDiscount, userId: d.userId || null, time: orderTime });
      entry.orders.push(orderKey);
    } else {
      if (derivedDiscount > prev.discount) prev.discount = derivedDiscount;
      if (!prev.userId && d.userId) prev.userId = d.userId;
      if (orderTime && (!prev.time || orderTime > prev.time)) prev.time = orderTime;
    }
  };

  ordersSnap.docs.forEach((doc) => recordOrder(doc, "orders"));
  txnSnap.docs.forEach((doc) => recordOrder(doc, "payment_transactions"));
  jobsCodeSnap.docs.forEach((doc) => recordOrder(doc, "print_jobs"));
  jobsUsedSnap.docs.forEach((doc) => recordOrder(doc, "print_jobs"));

  const byCode = new Map();
  stats.forEach((entry, code) => {
    const orderMap = seenOrdersByCode.get(code);
    let totalDiscount = 0;
    for (const info of orderMap.values()) {
      totalDiscount += info.discount;
      if (info.userId) entry.uniqueUsers.add(info.userId);
      if (info.time && (!entry.lastRedeemedAt || info.time > entry.lastRedeemedAt)) {
        entry.lastRedeemedAt = info.time;
      }
    }
    const computedCount = orderMap.size;
    const redemptionCount = Math.max(entry.storedUsedCount, computedCount);
    byCode.set(code, {
      code,
      discountPercentage: entry.discountPercentage,
      active: entry.active,
      expiresAt: entry.expiresAt,
      redemptionCount,
      totalDiscountINR: Math.round(totalDiscount * 100) / 100,
      uniqueUsersCount: entry.uniqueUsers.size,
      orders: entry.orders,
      lastRedeemedAt: entry.lastRedeemedAt,
    });
  });

  return byCode;
}

module.exports = {
  normalizeCouponCode,
  incrementCouponRedemption,
  computeCouponRedemptionStats,
};
