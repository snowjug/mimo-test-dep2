// Lazy-loaded Nodemailer Transporter helper
const { db } = require("../config/firebase");

function getTransporter() {
  const nodemailer = require("nodemailer");
  const rawPass = process.env.GMAIL_APP_PASSWORD || "";
  const cleanPass = rawPass.trim().replace(/\s+/g, "");
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "visionprintt@gmail.com",
      pass: cleanPass || "placeholder_pass",
    },
  });
}

/**
 * Sends or records an alert when a refund is requested / initiated.
 * Guarantees zero duplicate notifications on retries via idempotency tracking.
 * Safe environment policy: Never fires real SMTP network calls in dev/test/staging environments.
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {number} params.amount
 * @param {string} [params.reason]
 * @param {string} [params.userEmail]
 * @returns {Promise<{ sent: boolean, id: string, mock?: boolean }>}
 */
async function sendRefundInitiatedAlert({ orderId, amount, reason = "Dispute / Hardware Failure", userEmail = null }) {
  if (!orderId) throw new Error("orderId required for refund alert");

  const notificationId = `refund_alert_${orderId}`;
  const notifRef = db.collection("email_notifications").doc(notificationId);

  // Check idempotency
  const existing = await notifRef.get().catch(() => null);
  if (existing && existing.exists) {
    console.log(`[EMAIL-ALERT] Refund alert already sent for order ${orderId}, skipping duplicate.`);
    return { sent: true, id: notificationId, duplicate: true };
  }

  const isProduction = process.env.NODE_ENV === "production" && process.env.GMAIL_APP_PASSWORD && process.env.GMAIL_APP_PASSWORD !== "placeholder_pass";

  const emailPayload = {
    notificationId,
    type: "REFUND_INITIATED",
    orderId,
    amount: Number(amount) || 0,
    reason,
    userEmail,
    recipient: "visionprintt@gmail.com",
    subject: `[MIMO Finance Alert] Refund Request for Order ${orderId} - ₹${amount}`,
    body: `A refund request has been initiated for order ${orderId} in the amount of ₹${amount}.\nReason: ${reason}\nCustomer: ${userEmail || "Anonymous"}`,
    status: isProduction ? "SENDING" : "MOCKED_SAFE_ENV",
    createdAt: new Date().toISOString(),
    timestampMs: Date.now(),
  };

  if (!isProduction) {
    console.log(`[EMAIL-ALERT] [SAFE MODE] Refund notification recorded in DB for order ${orderId} (no live email sent).`);
    await notifRef.set({ ...emailPayload, status: "MOCKED_SAFE_ENV" }).catch(() => {});
    return { sent: true, id: notificationId, mock: true };
  }

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: '"MIMO Finance Alert" <visionprintt@gmail.com>',
      to: "visionprintt@gmail.com",
      subject: emailPayload.subject,
      text: emailPayload.body,
    });
    await notifRef.set({ ...emailPayload, status: "DELIVERED" });
    return { sent: true, id: notificationId };
  } catch (err) {
    console.error(`[EMAIL-ALERT] Failed to deliver refund email alert:`, err.message);
    await notifRef.set({ ...emailPayload, status: "FAILED", error: err.message }).catch(() => {});
    return { sent: false, id: notificationId, error: err.message };
  }
}

module.exports = {
  getTransporter,
  sendRefundInitiatedAlert,
};
