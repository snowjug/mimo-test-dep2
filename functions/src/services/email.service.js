// Lazy-loaded Nodemailer Transporter helper
const { db } = require("../config/firebase");

function isLiveEmailEnvironment() {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
  if (isTest) return false;

  const isCloudRuntime = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.NODE_ENV === "production");
  const rawPass = process.env.GMAIL_APP_PASSWORD || "";
  const cleanPass = rawPass.trim().replace(/\s+/g, "");
  const hasAppPassword = Boolean(cleanPass && cleanPass !== "placeholder_pass");

  return isCloudRuntime && hasAppPassword;
}

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

  const isProduction = isLiveEmailEnvironment();

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

/**
 * Sends an email alert to the MIMO team when a customer website issue or outage occurs.
 * Deduplicates notifications via idempotency tracking (at most one email per 15m window per problem type).
 * Safe environment policy: Never fires live external SMTP calls in dev/test/staging environments.
 *
 * @param {Object} params
 * @param {string} params.problem
 * @param {string} params.location
 * @param {string} [params.details]
 * @param {string} [params.severity]
 * @param {boolean} [params.force]
 * @returns {Promise<{ sent: boolean, id: string, duplicate?: boolean, mock?: boolean }>}
 */
async function sendWebsiteAlertEmail({ problem, location, details = "", severity = "HIGH", force = false }) {
  if (!problem) throw new Error("problem description required for website alert");

  const safeProblemKey = String(problem).toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40);
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const notificationId = `website_alert_${safeProblemKey}_${bucket}`;
  const notifRef = db.collection("email_notifications").doc(notificationId);

  if (!force) {
    const existing = await notifRef.get().catch(() => null);
    if (existing && existing.exists) {
      console.log(`[EMAIL-ALERT] Website alert already sent recently for '${problem}', skipping duplicate.`);
      return { sent: true, id: notificationId, duplicate: true };
    }
  }

  const isProduction = isLiveEmailEnvironment();
  const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const emailPayload = {
    notificationId,
    type: "WEBSITE_ISSUE_ALERT",
    problem,
    location,
    details,
    severity,
    recipient: "visionprintt@gmail.com",
    subject: `[MIMO Website Alert] Issue Detected: ${problem}`,
    body:
      `MIMO CUSTOMER WEBSITE INCIDENT ALERT\n` +
      `====================================\n\n` +
      `Severity: ${severity}\n` +
      `Time Detected: ${nowIST} IST\n\n` +
      `WHAT IS THE PROBLEM:\n` +
      `${problem}\n\n` +
      `WHERE THE PROBLEM OCCURS:\n` +
      `${location}\n\n` +
      `TECHNICAL DETAILS & EVIDENCE:\n` +
      `${details || "No additional technical traces provided."}\n\n` +
      `CUSTOMER IMPACT:\n` +
      `Customers visiting https://printmimo.tech may face difficulty accessing the site,\n` +
      `uploading documents, or proceeding to payment.\n\n` +
      `EDGE GUARDIAN DASHBOARD:\n` +
      `https://printmimo.tech/admin/guardian\n\n` +
      `Please investigate and resolve promptly.`,
    status: isProduction ? "SENDING" : "MOCKED_SAFE_ENV",
    createdAt: new Date().toISOString(),
    timestampMs: Date.now(),
  };

  if (!isProduction) {
    console.log(`[EMAIL-ALERT] [SAFE MODE] Website alert recorded in DB for '${problem}' (no live email sent).`);
    await notifRef.set({ ...emailPayload, status: "MOCKED_SAFE_ENV" }).catch(() => {});
    return { sent: true, id: notificationId, mock: true };
  }

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: '"MIMO Edge Guardian" <visionprintt@gmail.com>',
      to: "visionprintt@gmail.com",
      subject: emailPayload.subject,
      text: emailPayload.body,
    });
    await notifRef.set({ ...emailPayload, status: "DELIVERED" });
    return { sent: true, id: notificationId };
  } catch (err) {
    console.error(`[EMAIL-ALERT] Failed to deliver website email alert:`, err.message);
    await notifRef.set({ ...emailPayload, status: "FAILED", error: err.message }).catch(() => {});
    return { sent: false, id: notificationId, error: err.message };
  }
}

/**
 * Sends a notification email to a customer when a machine or printer is restored to operational status.
 *
 * @param {Object} params
 * @param {string} params.recipient - Customer's email address
 * @param {string} params.printerName - Display name of the restored machine / printer
 * @returns {Promise<{ sent: boolean, id: string, mock?: boolean }>}
 */
async function sendPrinterRestoredNotificationEmail({ recipient, printerName = "MIMO Printers" }) {
  if (!recipient || typeof recipient !== "string" || !recipient.includes("@")) {
    throw new Error("Valid recipient email required");
  }

  const notificationId = `restored_${recipient.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
  const notifRef = db.collection("email_notifications").doc(notificationId);

  const isProduction = isLiveEmailEnvironment();

  const emailPayload = {
    notificationId,
    type: "PRINTER_RESTORED_NOTIFICATION",
    recipient,
    printerName,
    subject: `[MIMO] ${printerName} is Back Online & Ready to Print!`,
    body:
      `Hello!\n\n` +
      `Great news — ${printerName} is back online and in full working condition!\n\n` +
      `You can now upload your documents and print smoothly at https://printmimo.tech/upload\n\n` +
      `Thank you for your patience while we completed maintenance!\n\n` +
      `Warm regards,\n` +
      `The MIMO Team`,
    html:
      `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">` +
      `<div style="text-align: center; margin-bottom: 20px;">` +
      `<h2 style="color: #4f46e5; margin: 0 0 4px 0; font-size: 22px; font-weight: 800;">MIMO Print Ready!</h2>` +
      `<p style="color: #64748b; font-size: 13px; margin: 0;">Service Restoration Alert</p>` +
      `</div>` +
      `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">` +
      `<p style="margin: 0 0 6px 0; font-size: 15px; font-weight: 700; color: #166534;">🎉 ${printerName} is back online!</p>` +
      `<p style="margin: 0; font-size: 13.5px; color: #14532d; line-height: 1.5;">Maintenance has concluded and the printer is fully operational. You can now send your documents to print right away.</p>` +
      `</div>` +
      `<div style="text-align: center; margin: 24px 0;">` +
      `<a href="https://printmimo.tech/upload" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Upload & Print Now</a>` +
      `</div>` +
      `<hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />` +
      `<p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.4;">` +
      `You received this email because you requested a notification on printmimo.tech when this printer was restored.<br>` +
      `The MIMO Team &bull; visionprintt@gmail.com` +
      `</p>` +
      `</div>`,
    status: isProduction ? "SENDING" : "MOCKED_SAFE_ENV",
    createdAt: new Date().toISOString(),
    timestampMs: Date.now(),
  };

  if (!isProduction) {
    console.log(`[EMAIL-ALERT] [SAFE MODE] Printer restored email notification recorded in DB for ${recipient} (${printerName}).`);
    await notifRef.set({ ...emailPayload, status: "MOCKED_SAFE_ENV" }).catch(() => {});
    return { sent: true, id: notificationId, mock: true };
  }

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: '"MIMO Printing Support" <visionprintt@gmail.com>',
      to: recipient,
      subject: emailPayload.subject,
      text: emailPayload.body,
    });
    await notifRef.set({ ...emailPayload, status: "DELIVERED" });
    return { sent: true, id: notificationId };
  } catch (err) {
    console.error(`[EMAIL-ALERT] Failed to send restored notification to ${recipient}:`, err.message);
    await notifRef.set({ ...emailPayload, status: "FAILED", error: err.message }).catch(() => {});
    return { sent: false, id: notificationId, error: err.message };
  }
}

module.exports = {
  getTransporter,
  sendRefundInitiatedAlert,
  sendWebsiteAlertEmail,
  sendPrinterRestoredNotificationEmail,
};
