// Customer-facing machine discovery, replacing the hardcoded array in find-machine.tsx with live registry data.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { getPublicMachines } = require("../src/controllers/publicMachines.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test("with no registry seeded, the defaults (CV-001, SV-002) are returned with full location detail", async () => {
  fake.reset({});
  const res = response();
  await getPublicMachines({}, res);
  assert.strictEqual(res.code, 200);
  const cv001 = res.body.machines.find((m) => m.machineId === "CV-001");
  assert.strictEqual(cv001.displayName, "MIMO 1.0");
  assert.strictEqual(cv001.locationName, "CV Raman Block");
  assert.strictEqual(cv001.campusName, "REVA University");
  assert.strictEqual(cv001.latitude, 13.116712);
  assert.strictEqual(cv001.capabilities.colour, false);
  assert.strictEqual(cv001.available, true);
});

test("a PROVISIONING machine never shows as available, regardless of heartbeat", async () => {
  fake.reset({
    machines: { "CV-003": { name: "MIMO 3.0", status: "PROVISIONING", templateId: "mimo-1.0-standard" } },
    system_status: { "CV-003": { lastSeen: new Date() } },
  });
  const res = response();
  await getPublicMachines({}, res);
  const cv003 = res.body.machines.find((m) => m.machineId === "CV-003");
  assert.strictEqual(cv003.available, false);
  assert.strictEqual(cv003.liveState, "PROVISIONING");
});

test("a machine with a recent heartbeat is online; one with none is not", async () => {
  fake.reset({ system_status: { "CV-001": { lastSeen: new Date() } } });
  const res = response();
  await getPublicMachines({}, res);
  const byId = Object.fromEntries(res.body.machines.map((m) => [m.machineId, m]));
  assert.strictEqual(byId["CV-001"].online, true);
  assert.strictEqual(byId["SV-002"].online, false);
});

test("a printer in Paused/Error state marks its machine DEGRADED for discovery", async () => {
  fake.reset({
    system_status: { "SV-002": { lastSeen: new Date() } },
    hardware: { printers: { "SV-002-COLOR": { status: "Paused/Error" } } },
  });
  const res = response();
  await getPublicMachines({}, res);
  const sv002 = res.body.machines.find((m) => m.machineId === "SV-002");
  assert.strictEqual(sv002.liveState, "DEGRADED");
});
