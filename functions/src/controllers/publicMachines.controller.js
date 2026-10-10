/**
 * Customer-facing machine discovery, driven by the machine registry (machineRegistry.service.js) instead of
 * the hardcoded array that used to live in mimo-website/src/app/pages/find-machine.tsx.
 *
 * Read-only, unauthenticated (same as the other /api/* routes in public.controller.js) — nothing here exposes
 * more than the old hardcoded array already did (name, location, coordinates), plus live status the hardcoded
 * version never had at all.
 */
const { db } = require("../config/firebase");
const R = require("../services/machineRegistry.service");

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // same window adminInsights.controller.js uses

function toMillis(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  return NaN;
}

async function loadMachineContext() {
  const [machines, templates, locations, campuses, statusSnap, hwDoc] = await Promise.all([
    R.loadMachinesMap(db),
    R.loadMachineTemplatesMap(db),
    R.loadLocationsMap(db),
    R.loadCampusesMap(db),
    db.collection("system_status").get(),
    db.collection("hardware").doc("printers").get(),
  ]);
  return {
    machines,
    templates,
    locations,
    campuses,
    statusById: new Map(statusSnap.docs.map((d) => [d.id, d.data()])),
    hardware: hwDoc.exists ? hwDoc.data() : {},
  };
}

/** Shared by the list and single-machine endpoints so a QR scan sees exactly what /api/machines sees —
 * no separate, driftable copy of "is this machine actually available right now". */
function buildMachineView(machineId, machine, ctx) {
  const template = machine.templateId ? ctx.templates.get(machine.templateId) : null;
  const location = machine.locationId ? ctx.locations.get(machine.locationId) : null;
  const campus = location?.campusId ? ctx.campuses.get(location.campusId) : null;
  const st = ctx.statusById.get(machineId) || {};
  const lastSeenMs = toMillis(st.lastSeen);
  const now = Date.now();
  const online = Number.isFinite(lastSeenMs) && now - lastSeenMs <= ONLINE_WINDOW_MS;
  // Paper-low across any printer this machine owns counts as "degraded" for discovery purposes — a
  // customer deciding where to walk (or whether to upload right now) cares whether it can actually print,
  // not the raw percentage.
  const printerKeys = Object.keys(ctx.hardware).filter((k) => k === machineId || k.startsWith(`${machineId}-`));
  const degraded = printerKeys.some((k) => ctx.hardware[k]?.status === "Paused/Error");
  const liveState = R.computeLiveState({ lifecycleStatus: machine.status || "ACTIVE", online, hasQueueActivity: false, printerDegraded: degraded });

  return {
    machineId,
    displayName: machine.name || machineId,
    locationName: location?.name || null,
    details: location?.details || null,
    campusName: campus?.name || null,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    capabilities: R.resolveCapabilities(machine, template),
    // "available" mirrors the old hardcoded array's isAvailable flag: true only once the machine is a
    // real, active, reachable machine — a PROVISIONING or DECOMMISSIONED machine never shows as available,
    // regardless of heartbeat, so a half-set-up machine never gets picked by a customer standing in front
    // of the wrong device (or scanning its QR code).
    available: machine.status === "ACTIVE",
    online,
    liveState,
  };
}

// ================= GET /api/machines (public discovery) =================
const getPublicMachines = async (req, res) => {
  try {
    const ctx = await loadMachineContext();
    const list = [...ctx.machines.entries()].map(([machineId, machine]) => buildMachineView(machineId, machine, ctx));
    res.json({ machines: list.sort((a, b) => a.machineId.localeCompare(b.machineId)) });
  } catch (err) {
    console.error("[PUBLIC-MACHINES] Failed to load machine discovery list:", err.message || err);
    res.status(500).json({ error: "Could not load machine list" });
  }
};

// ================= GET /api/machines/:machineId (QR entry — single machine, public) =================
const getPublicMachine = async (req, res) => {
  try {
    const { machineId } = req.params;
    const ctx = await loadMachineContext();
    const machine = ctx.machines.get(machineId);
    if (!machine) return res.status(404).json({ error: "Unknown machine" });
    res.json({ machine: buildMachineView(machineId, machine, ctx) });
  } catch (err) {
    console.error("[PUBLIC-MACHINES] Failed to load machine:", err.message || err);
    res.status(500).json({ error: "Could not load machine" });
  }
};

module.exports = { getPublicMachines, getPublicMachine };
