const { db } = require("../config/firebase");
const { sendPrinterRestoredNotificationEmail } = require("./email.service");

const SETTINGS_DOC_REF = db.collection("mimo_settings").doc("outage_overrides");
const SUBSCRIBERS_COLL = db.collection("printer_restored_subscribers");

const DEFAULT_OUTAGES = {
  mimo1Down: false,
  mimo2BwDown: false,
  mimo2ColorDown: false,
  allDown: false,
  customNotice: "",
  updatedAt: null,
  updatedBy: null,
};

/**
 * Returns human-readable outage summaries and active flags.
 */
function summarizeOutages(data) {
  const allDown = Boolean(data.allDown);
  const mimo1Down = Boolean(data.mimo1Down);
  const mimo2BwDown = Boolean(data.mimo2BwDown);
  const mimo2ColorDown = Boolean(data.mimo2ColorDown);
  const hasActiveOutage = allDown || mimo1Down || mimo2BwDown || mimo2ColorDown;

  const activeNotices = [];
  if (allDown) {
    activeNotices.push("Both MIMO 1.0 and MIMO 2.0 machines are currently offline for maintenance.");
  } else {
    if (mimo1Down) activeNotices.push("MIMO 1.0 is currently not working.");
    if (mimo2ColorDown) activeNotices.push("MIMO 2.0 Colour printer is currently not working.");
    if (mimo2BwDown) activeNotices.push("MIMO 2.0 Black & White printer is currently not working.");
  }

  return {
    allDown,
    mimo1Down,
    mimo2BwDown,
    mimo2ColorDown,
    customNotice: data.customNotice || "",
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
    hasActiveOutage,
    activeNotices,
  };
}

/**
 * Fetches the current kiosk outage & maintenance status.
 */
async function getOutageStatus() {
  try {
    const snap = await SETTINGS_DOC_REF.get();
    if (!snap.exists) {
      return summarizeOutages(DEFAULT_OUTAGES);
    }
    return summarizeOutages(snap.data() || {});
  } catch (err) {
    console.error("[OUTAGE-SERVICE] getOutageStatus error:", err.message);
    return summarizeOutages(DEFAULT_OUTAGES);
  }
}

/**
 * Counts subscribers waiting for a notification when printers are restored.
 */
async function getPendingSubscriberCount() {
  try {
    const snap = await SUBSCRIBERS_COLL.where("notified", "==", false).get();
    return snap.size;
  } catch (err) {
    console.error("[OUTAGE-SERVICE] getPendingSubscriberCount error:", err.message);
    return 0;
  }
}

/**
 * Subscribes a customer's email to receive an alert when a printer/machine is back online.
 */
async function subscribeCustomerEmail({ email, scope = "all" }) {
  if (!email || typeof email !== "string") {
    throw new Error("Email is required");
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error("Invalid email address format");
  }

  const validScopes = ["all", "mimo1", "mimo2_bw", "mimo2_color"];
  const cleanScope = validScopes.includes(scope) ? scope : "all";
  const docId = `sub_${cleanEmail.replace(/[^a-z0-9]/g, "_")}`;

  const payload = {
    email: cleanEmail,
    scope: cleanScope,
    notified: false,
    createdAt: new Date().toISOString(),
    timestampMs: Date.now(),
  };

  await SUBSCRIBERS_COLL.doc(docId).set(payload, { merge: true });
  console.log(`[OUTAGE-SERVICE] Subscribed ${cleanEmail} for '${cleanScope}' restoration notification.`);

  return {
    success: true,
    email: cleanEmail,
    scope: cleanScope,
    message: "You're all set! We will email you the moment the printer is back online.",
  };
}

/**
 * Dispatches notification emails to customers who subscribed for printer restoration alerts.
 */
async function notifySubscribersOnRestoration(restoredScopes) {
  if (!restoredScopes || !restoredScopes.length) return { sentCount: 0 };

  try {
    // Reset any mock-sent subscribers so they can receive real email in production
    const snapMock = await SUBSCRIBERS_COLL.where("mock", "==", true).get().catch(() => ({ docs: [] }));
    for (const d of snapMock.docs) {
      await d.ref.update({ notified: false, mock: false }).catch(() => {});
    }

    const snap = await SUBSCRIBERS_COLL.where("notified", "==", false).get();
    if (snap.empty) {
      console.log("[OUTAGE-SERVICE] No pending subscribers to notify.");
      return { sentCount: 0 };
    }

    let sentCount = 0;
    const isAllRestored = restoredScopes.includes("all");

    for (const doc of snap.docs) {
      const sub = doc.data();
      const shouldNotify =
        isAllRestored ||
        sub.scope === "all" ||
        restoredScopes.includes(sub.scope);

      if (shouldNotify) {
        let printerLabel = "MIMO Printers";
        if (isAllRestored || sub.scope === "all") {
          printerLabel = "Both MIMO 1.0 & MIMO 2.0 Kiosks";
        } else if (sub.scope === "mimo1") {
          printerLabel = "MIMO 1.0 Kiosk";
        } else if (sub.scope === "mimo2_color") {
          printerLabel = "MIMO 2.0 Colour Printer";
        } else if (sub.scope === "mimo2_bw") {
          printerLabel = "MIMO 2.0 Black & White Printer";
        }

        try {
          const sendResult = await sendPrinterRestoredNotificationEmail({
            recipient: sub.email,
            printerName: printerLabel,
          });
          if (sendResult.sent) {
            await doc.ref.update({
              notified: true,
              notifiedAt: new Date().toISOString(),
              restoredScopes,
              mock: Boolean(sendResult.mock),
            });
            sentCount++;
          }
        } catch (mailErr) {
          console.error(`[OUTAGE-SERVICE] Failed to notify ${sub.email}:`, mailErr.message);
        }
      }
    }

    console.log(`[OUTAGE-SERVICE] Successfully notified ${sentCount} subscribers for restored scopes: ${restoredScopes.join(", ")}`);
    return { sentCount };
  } catch (err) {
    console.error("[OUTAGE-SERVICE] notifySubscribersOnRestoration error:", err.message);
    return { sentCount: 0 };
  }
}

/**
 * Updates outage overrides and dispatches restoration emails if any outage was resolved.
 */
async function updateOutageStatus(updates, updatedBy = "admin") {
  if (updates.testEmailRecipient) {
    const testResult = await sendPrinterRestoredNotificationEmail({
      recipient: updates.testEmailRecipient,
      printerName: updates.testPrinterName || "MIMO 2.0 Colour Printer",
    });
    const current = await getOutageStatus();
    return { ...current, testEmailResult: testResult };
  }
  const current = await getOutageStatus();

  const newMimo1 = updates.mimo1Down !== undefined ? Boolean(updates.mimo1Down) : current.mimo1Down;
  const newMimo2Bw = updates.mimo2BwDown !== undefined ? Boolean(updates.mimo2BwDown) : current.mimo2BwDown;
  const newMimo2Color = updates.mimo2ColorDown !== undefined ? Boolean(updates.mimo2ColorDown) : current.mimo2ColorDown;
  const newAllDown = updates.allDown !== undefined ? Boolean(updates.allDown) : current.allDown;
  const newCustomNotice = updates.customNotice !== undefined ? String(updates.customNotice) : current.customNotice;

  // Detect which machines/printers were just restored from down to working
  const restoredScopes = [];
  if (current.allDown && !newAllDown) restoredScopes.push("all");
  if (current.mimo1Down && !newMimo1) restoredScopes.push("mimo1");
  if (current.mimo2BwDown && !newMimo2Bw) restoredScopes.push("mimo2_bw");
  if (current.mimo2ColorDown && !newMimo2Color) restoredScopes.push("mimo2_color");

  const savePayload = {
    mimo1Down: newMimo1,
    mimo2BwDown: newMimo2Bw,
    mimo2ColorDown: newMimo2Color,
    allDown: newAllDown,
    customNotice: newCustomNotice,
    updatedAt: new Date().toISOString(),
    updatedBy: String(updatedBy || "admin"),
  };

  await SETTINGS_DOC_REF.set(savePayload, { merge: true });

  let notifyResult = { sentCount: 0 };
  if (restoredScopes.length > 0) {
    notifyResult = await notifySubscribersOnRestoration(restoredScopes);
  }

  const updatedStatus = summarizeOutages(savePayload);
  return {
    ...updatedStatus,
    restoredScopes,
    emailsSent: notifyResult.sentCount,
  };
}

module.exports = {
  getOutageStatus,
  getPendingSubscriberCount,
  subscribeCustomerEmail,
  updateOutageStatus,
  notifySubscribersOnRestoration,
  DEFAULT_OUTAGES,
};
