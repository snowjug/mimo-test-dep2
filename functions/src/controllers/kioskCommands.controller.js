/**
 * Admin → kiosk remote commands. One document per kiosk: kiosk_commands/{kioskId}.
 * The Pi listener watches its own document, waits for printing to finish, marks it "rebooting" and reboots; after
 * boot it marks it "done". Statuses: pending → waiting_idle → rebooting → done (or failed / expired).
 */
const crypto = require("crypto");
const { admin, db } = require("../config/firebase");
const A = require("../services/analytics.service");
const R = require("../services/machineRegistry.service");

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
    const machineDoc = await db.collection("machines").doc(kioskId).get();
    if (!A.KNOWN_KIOSKS[kioskId] && !statusDoc.exists && !machineDoc.exists) return res.status(404).json({ error: "Unknown kiosk" });

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

/**
 * "Paper refilled" for one printer tray. Sets the tray to full and remembers the printer's page counter at this
 * moment, so paper left can be computed from real printed sheets afterwards (see hardwareFor in adminInsights).
 */
const postAdminRefillPaper = async (req, res) => {
  try {
    const { BW_PAPER_CAPACITY, COLOR_PAPER_CAPACITY } = require("./adminInsights.controller");
    const kioskId = String(req.params.kioskId || "");
    const printerKey = String((req.body && req.body.printerKey) || kioskId);
    if (!A.KIOSK_ID_PATTERN.test(kioskId) || !(printerKey === kioskId || printerKey.startsWith(`${kioskId}-`))) {
      return res.status(400).json({ error: "Unknown printer" });
    }
    const hwRef = db.collection("hardware").doc("printers");
    const hw = await hwRef.get();
    const printer = (hw.exists && hw.data()[printerKey]) || {};
    const isColor = printer.type === "color" || printerKey.toUpperCase().includes("COLOR");
    const capacity = isColor ? Number(printer.paperCapacity) || COLOR_PAPER_CAPACITY : BW_PAPER_CAPACITY;
    const pageCount = Number.isFinite(printer.pageCount) ? printer.pageCount : null;
    await hwRef.set({
      [printerKey]: {
        paperLevel: capacity,
        paperCapacity: capacity,
        paperRefillPageCount: pageCount,
        paperRefilledAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, { merge: true });
    return res.json({ printerKey, paperLevel: capacity, tracked: pageCount !== null });
  } catch (err) {
    console.error("[KIOSK-COMMAND] Paper refill failed:", err);
    return res.status(500).json({ error: "Could not record the refill" });
  }
};

/**
 * Self-test for a provisioned machine (brief item 12): a freshly provisioned machine stays in PROVISIONING
 * until it has a template, a location, has reported at least one heartbeat, and (if it has a printer entry)
 * that printer isn't in an error state. Only once all of those pass does this flip it to ACTIVE.
 *
 * CV-001 and SV-002 are seeded straight into ACTIVE (see scripts/seed-machine-registry.js) since they're
 * already-working production machines that predate this check — verify is only required for a *new*
 * machine's first activation, so calling (or never calling) this endpoint cannot affect them.
 */
const postAdminKioskVerify = async (req, res) => {
  try {
    const kioskId = String(req.params.kioskId || "");
    if (!A.KIOSK_ID_PATTERN.test(kioskId)) return res.status(400).json({ error: "Unknown kiosk" });

    const machineRef = db.collection("machines").doc(kioskId);
    const [machineDoc, templates, locations, hwDoc, statusDoc] = await Promise.all([
      machineRef.get(),
      R.loadMachineTemplatesMap(db),
      R.loadLocationsMap(db),
      db.collection("hardware").doc("printers").get(),
      db.collection("system_status").doc(kioskId).get(),
    ]);
    if (!machineDoc.exists) return res.status(404).json({ error: "No registry record for this kiosk yet" });

    const machine = machineDoc.data();
    const hardware = hwDoc.exists ? hwDoc.data() : {};
    const printerKeys = Object.keys(hardware).filter((k) => k === kioskId || k.startsWith(`${kioskId}-`));

    const checks = {
      hasTemplate: !!machine.templateId && templates.has(machine.templateId),
      hasLocation: !!machine.locationId && locations.has(machine.locationId),
      printerVerified: printerKeys.length > 0 && printerKeys.every((k) => hardware[k]?.status !== "Paused/Error"),
      hasReportedIn: statusDoc.exists,
    };
    const passed = Object.values(checks).every(Boolean);
    const willActivate = passed && machine.status === "PROVISIONING";

    await machineRef.set({
      selfTest: { passed, checks, checkedAt: admin.firestore.FieldValue.serverTimestamp() },
      ...(willActivate ? { status: "ACTIVE" } : {}),
    }, { merge: true });

    return res.json({ kioskId, passed, checks, status: willActivate ? "ACTIVE" : machine.status });
  } catch (err) {
    console.error("[KIOSK-COMMAND] Self-test failed:", err);
    return res.status(500).json({ error: "Could not run the self-test" });
  }
};

module.exports = { postAdminKioskRestart, postAdminRefillPaper, postAdminKioskVerify };
