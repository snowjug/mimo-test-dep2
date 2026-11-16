const { db } = require("../config/firebase");
const { sendPrinterRestoredNotificationEmail } = require("./email.service");

const SETTINGS_DOC_REF = db.collection("mimo_settings").doc("outage_overrides");
const HARDWARE_DOC_REF = db.collection("hardware").doc("printers");
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
 * Incorporates both manual admin overrides and live hardware printer supplies (paper / toner / ink exhaustion).
 */
function summarizeOutages(data = {}, hardwareData = {}) {
  let allDown = Boolean(data.allDown);
  let mimo1Down = Boolean(data.mimo1Down);
  let mimo2BwDown = Boolean(data.mimo2BwDown);
  let mimo2ColorDown = Boolean(data.mimo2ColorDown);

  const cv001 = hardwareData["CV-001"] || hardwareData["CV-001-BW"] || {};
  const sv002Bw = hardwareData["SV-002-BW"] || hardwareData["SV-002"] || {};
  const sv002Color = hardwareData["SV-002-COLOR"] || {};

  // Supply exhaustion checks: level <= 0 means completely out of supply
  const cv001PaperOut = Number.isFinite(Number(cv001.paperLevel)) && Number(cv001.paperLevel) <= 0;
  const cv001TonerOut = Number.isFinite(Number(cv001.tonerLevel)) && Number(cv001.tonerLevel) <= 0;

  const sv002BwPaperOut = Number.isFinite(Number(sv002Bw.paperLevel)) && Number(sv002Bw.paperLevel) <= 0;
  const sv002BwTonerOut = Number.isFinite(Number(sv002Bw.tonerLevel)) && Number(sv002Bw.tonerLevel) <= 0;

  const sv002ColorPaperOut = Number.isFinite(Number(sv002Color.paperLevel)) && Number(sv002Color.paperLevel) <= 0;
  const sv002ColorInkOut =
    (Number.isFinite(Number(sv002Color.inkLevel)) && Number(sv002Color.inkLevel) <= 0) ||
    (Number.isFinite(Number(sv002Color.tonerLevel)) && Number(sv002Color.tonerLevel) <= 0);

  // If a printer has no paper or no toner/ink, it cannot print and is marked down
  if (cv001PaperOut || cv001TonerOut) mimo1Down = true;
  if (sv002BwPaperOut || sv002BwTonerOut) mimo2BwDown = true;
  if (sv002ColorPaperOut || sv002ColorInkOut) mimo2ColorDown = true;

  if (mimo1Down && mimo2BwDown) {
    allDown = true;
  }

  const hardwareAlerts = {
    mimo1: {
      kioskId: "CV-001",
      name: "MIMO 1.0",
      paperOut: cv001PaperOut,
      tonerOut: cv001TonerOut,
      hasIssue: cv001PaperOut || cv001TonerOut,
      problem: cv001PaperOut ? "Paper is not in MIMO 1.0" : (cv001TonerOut ? "Toner is exhausted in MIMO 1.0" : null),
      message: cv001PaperOut
        ? "Paper is not in MIMO 1.0. Getting a printout is not possible on this machine. Please go and take your printout in MIMO 2.0 where paper is available."
        : (cv001TonerOut
          ? "Toner is exhausted in MIMO 1.0. Getting a printout is not possible on this machine. Please go and take your printout in MIMO 2.0."
          : null),
      suggestedMachine: "MIMO 2.0",
      suggestedKioskId: "SV-002",
    },
    mimo2_bw: {
      kioskId: "SV-002",
      name: "MIMO 2.0 (B&W)",
      paperOut: sv002BwPaperOut,
      tonerOut: sv002BwTonerOut,
      hasIssue: sv002BwPaperOut || sv002BwTonerOut,
      problem: sv002BwPaperOut ? "Paper is not in MIMO 2.0 (B&W)" : (sv002BwTonerOut ? "Toner is exhausted in MIMO 2.0 (B&W)" : null),
      message: sv002BwPaperOut
        ? "Paper is not in MIMO 2.0 (B&W). Getting a printout is not possible on this machine. Please go and take your printout in MIMO 1.0 where paper is available."
        : (sv002BwTonerOut
          ? "Toner is exhausted in MIMO 2.0 (B&W). Getting a printout is not possible on this machine. Please go and take your printout in MIMO 1.0."
          : null),
      suggestedMachine: "MIMO 1.0",
      suggestedKioskId: "CV-001",
    },
    mimo2_color: {
      kioskId: "SV-002",
      name: "MIMO 2.0 (Colour)",
      paperOut: sv002ColorPaperOut,
      inkOut: sv002ColorInkOut,
      hasIssue: sv002ColorPaperOut || sv002ColorInkOut,
      problem: sv002ColorPaperOut ? "Colour paper is out in MIMO 2.0" : (sv002ColorInkOut ? "Colour ink is exhausted in MIMO 2.0" : null),
      message: sv002ColorPaperOut
        ? "Colour paper is out in MIMO 2.0. Getting a colour printout is currently not possible."
        : (sv002ColorInkOut
          ? "Colour ink is exhausted in MIMO 2.0. Getting a colour printout is currently not possible."
          : null),
      suggestedMachine: null,
      suggestedKioskId: null,
    },
  };

  const hasActiveOutage = allDown || mimo1Down || mimo2BwDown || mimo2ColorDown;

  const activeNotices = [];
  if (allDown) {
    if (cv001PaperOut && sv002BwPaperOut) {
      activeNotices.push("Both MIMO 1.0 and MIMO 2.0 are out of paper. Getting printouts is currently not possible.");
    } else {
      activeNotices.push("Both MIMO 1.0 and MIMO 2.0 machines are currently offline for maintenance.");
    }
  } else {
    if (hardwareAlerts.mimo1.message) {
      activeNotices.push(hardwareAlerts.mimo1.message);
    } else if (mimo1Down) {
      activeNotices.push("MIMO 1.0 is currently not working. MIMO 2.0 is operational and ready for your prints.");
    }

    if (hardwareAlerts.mimo2_bw.message) {
      activeNotices.push(hardwareAlerts.mimo2_bw.message);
    } else if (mimo2BwDown) {
      activeNotices.push("MIMO 2.0 Black & White printer is currently not working. B&W is available on MIMO 1.0.");
    }

    if (hardwareAlerts.mimo2_color.message) {
      activeNotices.push(hardwareAlerts.mimo2_color.message);
    } else if (mimo2ColorDown) {
      activeNotices.push("MIMO 2.0 Colour printer is currently not working. Black & white is available on both MIMO 1.0 and MIMO 2.0.");
    }
  }

  return {
    allDown,
    mimo1Down,
    mimo2BwDown,
    mimo2ColorDown,
    hardwareAlerts,
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
    const [settingsSnap, hwSnap] = await Promise.all([
      SETTINGS_DOC_REF.get().catch(() => null),
      HARDWARE_DOC_REF.get().catch(() => null),
    ]);
    const settingsData = settingsSnap && settingsSnap.exists ? settingsSnap.data() || {} : {};
    const hardwareData = hwSnap && hwSnap.exists ? hwSnap.data() || {} : {};
    return summarizeOutages(settingsData, hardwareData);
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

  const updatedStatus = await getOutageStatus();
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
  summarizeOutages,
  DEFAULT_OUTAGES,
};
