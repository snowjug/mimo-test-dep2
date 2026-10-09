// The machine registry layers real Firestore data OVER the literal KNOWN_KIOSKS-equivalent defaults, so that
// until machines/machine_templates/locations/campuses are seeded, every caller sees exactly today's behavior.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const R = require("../src/services/machineRegistry.service");

test("with no machines collection seeded, the defaults (today's CV-001/SV-002) are returned unchanged", async () => {
  const fake = createFakeFirestore({});
  const machines = await R.loadMachinesMap(fake.db);
  assert.deepStrictEqual([...machines.keys()].sort(), ["CV-001", "SV-002"]);
  assert.strictEqual(machines.get("CV-001").name, "MIMO 1.0");
  assert.strictEqual(machines.get("CV-001").shortLabel, "M1");
  assert.strictEqual(machines.get("SV-002").shortLabel, "M2");
});

test("a real machines/{id} doc overrides the default for that id, without affecting the other default", async () => {
  const fake = createFakeFirestore({ machines: { "CV-001": { name: "MIMO 1.0 (renamed)", status: "MAINTENANCE" } } });
  const machines = await R.loadMachinesMap(fake.db);
  assert.strictEqual(machines.get("CV-001").name, "MIMO 1.0 (renamed)");
  assert.strictEqual(machines.get("CV-001").status, "MAINTENANCE");
  assert.strictEqual(machines.get("CV-001").shortLabel, "M1", "fields not in the Firestore doc keep the default");
  assert.strictEqual(machines.get("SV-002").name, "MIMO 2.0", "untouched machine is unaffected");
});

test("a brand new machine (e.g. CV-003) seeded only in Firestore appears alongside the defaults", async () => {
  const fake = createFakeFirestore({ machines: { "CV-003": { name: "MIMO 3.0", type: "bw", templateId: "mimo-1.0-standard", locationId: "jain-main-block", status: "PROVISIONING" } } });
  const machines = await R.loadMachinesMap(fake.db);
  assert.deepStrictEqual([...machines.keys()].sort(), ["CV-001", "CV-003", "SV-002"]);
  assert.strictEqual(machines.get("CV-003").status, "PROVISIONING");
});

test("an unreadable machines collection falls back to defaults instead of throwing", async () => {
  const brokenDb = { collection: () => ({ get: async () => { throw new Error("permission denied"); } }) };
  const machines = await R.loadMachinesMap(brokenDb);
  assert.deepStrictEqual([...machines.keys()].sort(), ["CV-001", "SV-002"]);
});

test("templates, locations and campuses all merge the same way", async () => {
  const fake = createFakeFirestore({});
  const templates = await R.loadMachineTemplatesMap(fake.db);
  const locations = await R.loadLocationsMap(fake.db);
  const campuses = await R.loadCampusesMap(fake.db);
  assert.strictEqual(templates.get("mimo-1.0-standard").capabilities.colour, false);
  assert.strictEqual(templates.get("mimo-2.0-standard").capabilities.colour, true);
  assert.strictEqual(locations.get("cv-raman-block").campusId, "reva");
  assert.strictEqual(campuses.get("reva").name, "REVA University");
});

test("resolveCapabilities: machine-level override wins over the template default", () => {
  const template = { capabilities: { colour: false, duplex: true, paperSizes: ["A4"] } };
  const machine = { capabilities: { colour: true } };
  assert.deepStrictEqual(R.resolveCapabilities(machine, template), { colour: true, duplex: true, paperSizes: ["A4"] });
});

test("resolveCapabilities: no machine override just returns the template as-is", () => {
  const template = { capabilities: { colour: false, duplex: true } };
  assert.deepStrictEqual(R.resolveCapabilities(null, template), { colour: false, duplex: true });
});

test("computeLiveState: admin lifecycle states win over everything else", () => {
  assert.strictEqual(R.computeLiveState({ lifecycleStatus: "PROVISIONING", online: true }), "PROVISIONING");
  assert.strictEqual(R.computeLiveState({ lifecycleStatus: "MAINTENANCE", online: true, hasQueueActivity: true }), "MAINTENANCE");
  assert.strictEqual(R.computeLiveState({ lifecycleStatus: "DECOMMISSIONED", online: true }), "DECOMMISSIONED");
});

test("computeLiveState: offline beats everything except the stored lifecycle states", () => {
  assert.strictEqual(R.computeLiveState({ lifecycleStatus: "ACTIVE", online: false, printerDegraded: true, hasQueueActivity: true }), "OFFLINE");
});

test("computeLiveState: online + printer problem = DEGRADED even mid-queue", () => {
  assert.strictEqual(R.computeLiveState({ lifecycleStatus: "ACTIVE", online: true, printerDegraded: true, hasQueueActivity: true }), "DEGRADED");
});

test("computeLiveState: online + queue, no printer problem = BUSY", () => {
  assert.strictEqual(R.computeLiveState({ lifecycleStatus: "ACTIVE", online: true, printerDegraded: false, hasQueueActivity: true }), "BUSY");
});

test("computeLiveState: online, idle, healthy printer = AVAILABLE", () => {
  assert.strictEqual(R.computeLiveState({ lifecycleStatus: "ACTIVE", online: true, printerDegraded: false, hasQueueActivity: false }), "AVAILABLE");
});
