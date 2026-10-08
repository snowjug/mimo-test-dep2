// Closes a pre-existing gap the fleet-architecture audit found: getAdminKiosks and getAdminJobs had zero test
// coverage, before or after the registry work, despite being the two admin-dashboard endpoints that changed
// the most (shortLabel, locationName, lifecycleStatus, liveState, destinationShortLabel all added here).
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { getAdminKiosks, getAdminJobs } = require("../src/controllers/adminInsights.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const kiosks = async (query = {}) => { const res = response(); await getAdminKiosks({ query }, res); return res; };
const jobs = async (query = {}) => { const res = response(); await getAdminJobs({ query }, res); return res; };

test("getAdminKiosks with no registry seeded returns exactly CV-001 and SV-002 with defaulted registry fields", async () => {
  fake.reset({});
  const res = await kiosks();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.kiosks.map((k) => [k.kioskId, k]));
  assert.deepStrictEqual(Object.keys(byId).sort(), ["CV-001", "SV-002"]);
  assert.strictEqual(byId["CV-001"].name, "MIMO 1.0");
  assert.strictEqual(byId["CV-001"].shortLabel, "M1");
  assert.strictEqual(byId["CV-001"].lifecycleStatus, "ACTIVE");
  assert.strictEqual(byId["CV-001"].liveState, "OFFLINE"); // no system_status heartbeat seeded
  assert.strictEqual(byId["SV-002"].locationName, "Central Library");
});

test("getAdminKiosks picks up a registry-only third machine alongside the defaults, unmodified", async () => {
  fake.reset({
    machines: { "CV-003": { name: "MIMO 3.0", status: "ACTIVE", shortLabel: "M3", locationId: "jain-university" } },
    locations: { "jain-university": { name: "Jain University" } },
    system_status: { "CV-003": { lastSeen: new Date() } },
  });
  const res = await kiosks();
  const byId = Object.fromEntries(res.body.kiosks.map((k) => [k.kioskId, k]));
  assert.deepStrictEqual(Object.keys(byId).sort(), ["CV-001", "CV-003", "SV-002"]);
  assert.strictEqual(byId["CV-003"].shortLabel, "M3");
  assert.strictEqual(byId["CV-003"].locationName, "Jain University");
  assert.strictEqual(byId["CV-003"].liveState, "AVAILABLE");
  // CV-001/SV-002 must be completely unaffected by CV-003 existing.
  assert.strictEqual(byId["CV-001"].name, "MIMO 1.0");
  assert.strictEqual(byId["SV-002"].name, "MIMO 2.0");
});

test("getAdminKiosks reflects a machine put into MAINTENANCE in the registry", async () => {
  fake.reset({ machines: { "SV-002": { status: "MAINTENANCE" } } });
  const res = await kiosks();
  const sv002 = res.body.kiosks.find((k) => k.kioskId === "SV-002");
  assert.strictEqual(sv002.lifecycleStatus, "MAINTENANCE");
  assert.strictEqual(sv002.liveState, "MAINTENANCE");
  // The merge is additive: fields not overridden (name/type/description) still come from the default.
  assert.strictEqual(sv002.name, "MIMO 2.0");
});

test("getAdminJobs includes destinationShortLabel from the registry's shortLabel, falling back to the id slice", async () => {
  fake.reset({
    print_jobs: {
      j1: { kioskId: "CV-001", userId: "u1", status: "completed", createdAt: new Date(), fileName: "a.pdf", pageCount: 1 },
      j2: { kioskId: "ZZ-999", userId: "u1", status: "completed", createdAt: new Date(), fileName: "b.pdf", pageCount: 1 },
    },
  });
  const res = await jobs();
  assert.strictEqual(res.code, 200);
  const byId = Object.fromEntries(res.body.jobs.map((j) => [j.id, j]));
  assert.strictEqual(byId.j1.destinationShortLabel, "M1");
  assert.strictEqual(byId.j2.destinationShortLabel, "ZZ", "an id with no registry entry falls back to its own first two letters");
});
