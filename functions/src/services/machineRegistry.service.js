/**
 * Canonical machine registry — the foundation for "one machine = one registry record", not a code change.
 *
 * Reads layer OVER today's hardcoded KNOWN_KIOSKS (analytics.service.js), never replace it: every function
 * here merges real `machines`/`machine_templates`/`locations`/`campuses` Firestore docs on top of a literal
 * default derived from KNOWN_KIOSKS. Until those collections are seeded, every caller sees EXACTLY today's
 * behavior — adding the registry is additive by construction, not a migration that can break CV-001/SV-002.
 *
 * Deliberately NOT touching analytics.service.js's own KNOWN_KIOSKS: that module documents itself as pure
 * (no Firestore access, unit-tested with plain objects) specifically so the admin analytics math stays
 * testable without mocking a database. This service is the async, Firestore-backed layer other controllers
 * call into; analytics.service.js's pure functions are untouched.
 */
const KIOSK_ID_PATTERN = /^[A-Z]{2}-\d{3}$/;

// Mirrors today's KNOWN_KIOSKS exactly, plus the fields the registry adds (shortLabel, templateId, locationId,
// status). This is both the fallback when `machines/{id}` doesn't exist yet, AND the reference data the seed
// script (scripts/seed-machine-registry.js) writes into Firestore for CV-001 and SV-002.
const DEFAULT_MACHINES = {
  "CV-001": {
    name: "MIMO 1.0",
    type: "bw",
    description: "Black & white",
    shortLabel: "M1",
    templateId: "mimo-1.0-standard",
    locationId: "cv-raman-block",
    status: "ACTIVE",
  },
  "SV-002": {
    name: "MIMO 2.0",
    type: "color",
    description: "Colour + black & white",
    shortLabel: "M2",
    templateId: "mimo-2.0-standard",
    locationId: "central-library",
    status: "ACTIVE",
  },
};

const DEFAULT_TEMPLATES = {
  "mimo-1.0-standard": {
    name: "MIMO 1.0 Standard",
    capabilities: { colour: false, duplex: true, paperSizes: ["A4"] },
  },
  "mimo-2.0-standard": {
    name: "MIMO 2.0 Standard",
    capabilities: { colour: true, duplex: true, paperSizes: ["A4"] },
  },
};

const DEFAULT_LOCATIONS = {
  "cv-raman-block": { name: "CV Raman Block", details: "1st Floor, Entrance", campusId: "reva", latitude: 13.116712, longitude: 77.634768 },
  "central-library": { name: "Central Library", details: "Entrance (Left Side)", campusId: "reva", latitude: 13.1147477, longitude: 77.635318 },
};

const DEFAULT_CAMPUSES = {
  reva: { name: "REVA University" },
};

const MACHINE_LIFECYCLE_STATUSES = ["PROVISIONING", "ACTIVE", "MAINTENANCE", "DECOMMISSIONED"];
// What the brief calls AVAILABLE/BUSY/DEGRADED/OFFLINE — derived at read time, never stored, so it can never
// go stale the way a stored "status" field would if a write was ever missed.
const LIVE_STATES = ["AVAILABLE", "BUSY", "DEGRADED", "OFFLINE"];

async function loadGenericRegistry(db, collectionName, defaults, idField) {
  const map = new Map(Object.entries(defaults).map(([id, v]) => [id, { [idField]: id, ...v }]));
  try {
    const snap = await db.collection(collectionName).get();
    snap.forEach((doc) => {
      const existing = map.get(doc.id) || { [idField]: doc.id };
      map.set(doc.id, { ...existing, ...doc.data(), [idField]: doc.id });
    });
  } catch (err) {
    // A missing/unreadable collection must never take down a page that used to work with the literal
    // defaults alone — log and fall back, the same way a missing env var falls back on the Pi.
    console.warn(`[MACHINE-REGISTRY] Could not read "${collectionName}", using defaults only:`, err.message || err);
  }
  return map;
}

const loadMachinesMap = (db) => loadGenericRegistry(db, "machines", DEFAULT_MACHINES, "machineId");
const loadMachineTemplatesMap = (db) => loadGenericRegistry(db, "machine_templates", DEFAULT_TEMPLATES, "templateId");
const loadLocationsMap = (db) => loadGenericRegistry(db, "locations", DEFAULT_LOCATIONS, "locationId");
const loadCampusesMap = (db) => loadGenericRegistry(db, "campuses", DEFAULT_CAMPUSES, "campusId");

/** Effective capabilities = template defaults with machine-level overrides on top (brief §17). */
function resolveCapabilities(machine, template) {
  return { ...(template?.capabilities || {}), ...(machine?.capabilities || {}) };
}

/**
 * The brief's PROVISIONING -> ONLINE -> AVAILABLE/BUSY/DEGRADED/OFFLINE -> MAINTENANCE -> DECOMMISSIONED
 * lifecycle, split in two: `lifecycleStatus` is admin-set and stored (MACHINE_LIFECYCLE_STATUSES); the
 * live sub-state is always computed, never stored, so it can't drift from reality the way a cached field could.
 */
function computeLiveState({ lifecycleStatus, online, hasQueueActivity, printerDegraded }) {
  if (lifecycleStatus === "PROVISIONING") return "PROVISIONING";
  if (lifecycleStatus === "MAINTENANCE") return "MAINTENANCE";
  if (lifecycleStatus === "DECOMMISSIONED") return "DECOMMISSIONED";
  if (!online) return "OFFLINE";
  if (printerDegraded) return "DEGRADED";
  if (hasQueueActivity) return "BUSY";
  return "AVAILABLE";
}

module.exports = {
  KIOSK_ID_PATTERN,
  DEFAULT_MACHINES,
  DEFAULT_TEMPLATES,
  DEFAULT_LOCATIONS,
  DEFAULT_CAMPUSES,
  MACHINE_LIFECYCLE_STATUSES,
  LIVE_STATES,
  loadMachinesMap,
  loadMachineTemplatesMap,
  loadLocationsMap,
  loadCampusesMap,
  resolveCapabilities,
  computeLiveState,
};
