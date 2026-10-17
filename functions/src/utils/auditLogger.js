const { db } = require("../config/firebase");

/**
 * Persists an immutable financial audit log entry.
 *
 * @param {Object} params
 * @param {string} params.action - Action identifier e.g. 'REFUND_APPROVE', 'EXPENSE_CREATE', 'COUPON_CREATE', 'PII_REVEAL'
 * @param {Object} params.actor - Information about caller { email, role, id, ip }
 * @param {string} [params.targetId] - Target ID (e.g. orderId, refundId, expenseId, couponCode)
 * @param {Object} [params.details] - Additional contextual data or payload
 * @param {string} [params.status='SUCCESS'] - 'SUCCESS' | 'FAILED'
 * @param {string} [params.errorMessage] - Optional error details if status is FAILED
 */
async function logFinancialAudit({
  action,
  actor = {},
  targetId = null,
  details = {},
  status = "SUCCESS",
  errorMessage = null,
}) {
  try {
    const entry = {
      action,
      actor: {
        email: actor.email || "unknown",
        role: actor.role || (actor.isAdmin ? "admin" : "finance"),
        id: actor.id || actor.userId || null,
        ip: actor.ip || null,
      },
      targetId: targetId ? String(targetId) : null,
      details: details || {},
      status,
      errorMessage: errorMessage ? String(errorMessage) : null,
      createdAt: new Date().toISOString(),
      timestampMs: Date.now(),
    };

    // Append to 'financial_audit_logs' collection
    await db.collection("financial_audit_logs").add(entry);
    return entry;
  } catch (err) {
    // Non-blocking error logging so primary business flow is not aborted, but log is emitted
    console.error("[FinancialAuditLogger] Failed to write audit record:", err.message);
    return null;
  }
}

module.exports = {
  logFinancialAudit,
};
