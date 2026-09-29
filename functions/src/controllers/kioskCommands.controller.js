/**
 * Admin → kiosk remote commands. One document per kiosk: kiosk_commands/{kioskId}.
 * The Pi listener watches its own document, waits for printing to finish, marks it "rebooting" and reboots; after
 * boot it marks it "done". Statuses: pending → waiting_idle → rebooting → done (or failed / expired).
 */
const crypto = require("crypto");
const { admin, db } = require("../config/firebase");
const A = require("../services/analytics.service");

const IN_FLIGHT = ["pending", "waiting_idle", "rebooting"];
// A restart that has not finished in this long is treated as stuck, so the admin may send a new one.
const IN_FLIGHT_MAX_MS = 10 * 60 * 1000;

const postAdminKioskRestart = async (req, res) => {
  try {
    const kioskId = String(req.params.kioskId || "");
    if (!A.KIOSK_ID_PATTERN.test(kioskId)) return res.status(400).json({ error: "Unknown kiosk" });
    const [statusDoc, cmdDoc] = await Promise.all([
      db.collection("system_status").doc(kioskId).get(),
      db.collection("kiosk_commands").doc(kioskId).get(),
    ]);
    if (!A.KNOWN_KIOSKS[kioskId] && !statusDoc.exists) return res.status(404).json({ error: "Unknown kiosk" });

    const current = cmdDoc.exists ? cmdDoc.data() : null;
    if (current && IN_FLIGHT.includes(current.status) && Date.now() - A.toMillis(current.updatedAt || current.requestedAt) < IN_FLIGHT_MAX_MS) {
      return res.status(409).json({ error: "A restart is already in progress for this kiosk", status: current.status });
    }

    const commandId = crypto.randomUUID();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection("kiosk_commands").doc(kioskId).set({
      kioskId,
      action: "reboot",
      status: "pending",
      commandId,
      message: "Waiting for the Pi to pick this up.",
      requestedBy: (req.admin && req.admin.email) || "admin",
      requestedAt: now,
      updatedAt: now,
    });
    console.log(`[KIOSK-COMMAND] Reboot requested for ${kioskId} (${commandId})`);
    return res.json({ commandId, status: "pending" });
  } catch (err) {
    console.error("[KIOSK-COMMAND] Restart request failed:", err);
    return res.status(500).json({ error: "Could not send the restart request" });
  }
};

module.exports = { postAdminKioskRestart };
