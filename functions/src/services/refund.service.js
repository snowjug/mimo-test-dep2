// Shared guard for every code path that can refund an order (automatic trigger, admin refund, kiosk failure report).
// Before calling the payment gateway a path CLAIMS the refund on the order document inside a Firestore transaction, so
// concurrent or repeated deliveries cannot both reach the gateway, and an order that was already refunded by ANY path
// is never refunded again. Refund ids are derived from the order (not random or time based) so the gateway can also
// recognise a repeated request.

const STALE_CLAIM_MS = 10 * 60 * 1000; // a claim older than this is treated as abandoned (crashed run) and may be retaken

/**
 * @returns {Promise<{claimed: boolean, reason?: string, data?: object, previousRefundStatus?: string|null}>}
 */
async function claimRefund(db, orderRef, nowMs = Date.now()) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    const data = snap.exists ? snap.data() : null;
    if (!data) return { claimed: false, reason: "not_found" };
    if (data.status === "REFUNDED" || data.refundStatus === "SUCCESS") return { claimed: false, reason: "already_refunded", data };
    if (data.refundStatus === "PROCESSING" && nowMs - (Number(data.refundClaimedAt) || 0) < STALE_CLAIM_MS) {
      return { claimed: false, reason: "in_progress", data };
    }
    tx.update(orderRef, { refundStatus: "PROCESSING", refundClaimedAt: nowMs });
    return { claimed: true, data, previousRefundStatus: data.refundStatus === undefined ? null : data.refundStatus };
  });
}

/** Undo a claim when the gateway call did not happen or was rejected without any other record being written. */
async function releaseRefund(orderRef, previousRefundStatus, FieldValue) {
  await orderRef.update({
    refundStatus: previousRefundStatus === null || previousRefundStatus === undefined ? FieldValue.delete() : previousRefundStatus,
    refundClaimedAt: FieldValue.delete(),
  });
}

/** Deterministic gateway refund id: `<prefix>_<orderId>`, restricted to the characters and length Cashfree accepts. */
function refundIdFor(prefix, orderId) {
  return `${prefix}_${String(orderId)}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}

const REFUND_BLOCKED_MESSAGES = {
  already_refunded: "This order has already been refunded.",
  in_progress: "A refund for this order is already being processed.",
  not_found: "Order not found.",
};

module.exports = { claimRefund, releaseRefund, refundIdFor, REFUND_BLOCKED_MESSAGES, STALE_CLAIM_MS };
