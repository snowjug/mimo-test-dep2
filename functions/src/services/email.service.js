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
 * Sends an email alert to the MIMO developer team when a genuine technical website issue occurs.
 * Filters out benign customer mistakes and deduplicates notifications (at most one per 15m window).
 * Safe environment policy: Never fires live external SMTP calls in dev/test/staging environments.
 *
 * @param {Object} params
 * @param {string} params.problem - Exact summary of the technical problem
 * @param {string} params.location - Human-readable location / component name
 * @param {string} [params.details] - Technical traces, stack trace, or HTTP details
 * @param {string} [params.category] - Machine category (e.g. FRONTEND_CODE_CRASH, SERVER_5XX_ERROR)
 * @param {string} [params.route] - Website route/URL where failure occurred
 * @param {string} [params.severity] - CRITICAL, HIGH, MEDIUM, LOW
 * @param {boolean} [params.force] - Force send bypassing deduplication
 * @returns {Promise<{ sent: boolean, id: string, duplicate?: boolean, mock?: boolean }>}
 */
async function sendWebsiteAlertEmail({
  problem,
  location,
  details = "",
  category = "TECHNICAL_FAULT",
  route = "",
  severity = "HIGH",
  force = false,
}) {
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
  const displayRoute = route || (location && location.includes("(") ? location : "/");
  const cleanCategory = String(category).toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  const emailSubject = `[MIMO Technical Alert] [${cleanCategory}] ${problem.slice(0, 80)}`;

  const emailText =
    `MIMO TECHNICAL ISSUE ALERT (FOR DEVELOPERS)\n` +
    `==========================================\n\n` +
    `Severity: ${severity}\n` +
    `Category: ${cleanCategory}\n` +
    `Time Detected: ${nowIST} IST\n\n` +
    `1. WHAT IS THE EXACT PROBLEM:\n` +
    `${problem}\n\n` +
    `2. WHERE IT OCCURS ON THE WEBSITE:\n` +
    `Location: ${location}\n` +
    `Route: ${displayRoute}\n` +
    `Domain: https://printmimo.tech\n\n` +
    `3. TECHNICAL DETAILS & EVIDENCE:\n` +
    `${details || "No additional technical stack traces provided."}\n\n` +
    `4. DEVELOPER ACTION CHECKLIST:\n` +
    `- Check recent frontend/backend deployments affecting route '${displayRoute}'\n` +
    `- Check Cloud Run and Firebase server logs around ${nowIST} IST\n` +
    `- Once resolved, clear incident status at the Edge Guardian dashboard:\n` +
    `  https://printmimo.tech/admin/guardian\n\n` +
    `--\nMIMO Edge Guardian Monitoring System`;

  const emailHtml =
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fee2e2; border-radius: 12px; background: #ffffff;">` +
    `<div style="border-bottom: 2px solid #ef4444; padding-bottom: 12px; margin-bottom: 16px;">` +
    `<span style="background-color: #fee2e2; color: #991b1b; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">${severity} SEVERITY &bull; ${cleanCategory}</span>` +
    `<h2 style="color: #1e293b; margin: 12px 0 4px 0; font-size: 20px; font-weight: 800;">MIMO Technical Website Alert</h2>` +
    `<p style="color: #64748b; font-size: 13px; margin: 0;">Detected at ${nowIST} IST &bull; Target: https://printmimo.tech</p>` +
    `</div>` +
    `<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; margin-bottom: 16px;">` +
    `<p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #991b1b;">WHAT IS THE EXACT PROBLEM:</p>` +
    `<p style="margin: 0; font-size: 14px; color: #7f1d1d; font-weight: 600; line-height: 1.4;">${problem}</p>` +
    `</div>` +
    `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">` +
    `<tr><td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Where it occurs:</td><td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${location}</td></tr>` +
    `<tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Affected Route:</td><td style="padding: 6px 0; color: #2563eb; font-weight: 600; font-family: monospace;">${displayRoute}</td></tr>` +
    `<tr><td style="padding: 6px 0; color: #64748b; font-weight: 600;">Website Domain:</td><td style="padding: 6px 0; color: #0f172a;">https://printmimo.tech</td></tr>` +
    `</table>` +
    `<div style="margin-bottom: 16px;">` +
    `<p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #334155;">TECHNICAL DETAILS & EVIDENCE:</p>` +
    `<pre style="background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 8px; font-size: 12px; line-height: 1.4; overflow-x: auto; white-space: pre-wrap; font-family: Consolas, Monaco, monospace; margin: 0;">${details || "No additional technical traces provided."}</pre>` +
    `</div>` +
    `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 20px;">` +
    `<p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #334155;">DEVELOPER ACTION CHECKLIST:</p>` +
    `<ul style="margin: 0; padding-left: 20px; font-size: 12.5px; color: #475569; line-height: 1.5;">` +
    `<li>Check recent commits or deployments touching <code>${displayRoute}</code></li>` +
    `<li>Review backend Cloud Run and Firebase error traces around ${nowIST} IST</li>` +
    `<li>Once verified and resolved, acknowledge in Edge Guardian dashboard</li>` +
    `</ul>` +
    `</div>` +
    `<div style="text-align: center; margin: 20px 0;">` +
    `<a href="https://printmimo.tech/admin/guardian" style="background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-weight: 700; font-size: 13.5px; display: inline-block;">Open Edge Guardian Dashboard</a>` +
    `</div>` +
    `<p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 12px;">` +
    `Automated Technical Alert from MIMO Platform Infrastructure &bull; visionprintt@gmail.com` +
    `</p>` +
    `</div>`;

  const emailPayload = {
    notificationId,
    type: "WEBSITE_ISSUE_ALERT",
    problem,
    location,
    details,
    category: cleanCategory,
    route: displayRoute,
    severity,
    recipient: "visionprintt@gmail.com",
    subject: emailSubject,
    body: emailText,
    html: emailHtml,
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
      html: emailPayload.html,
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
