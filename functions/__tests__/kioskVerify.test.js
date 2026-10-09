// Self-test gate (brief item 12): a freshly provisioned machine can't go ACTIVE until it has a template, a
// location, has reported in, and its printer isn't erroring. CV-001/SV-002 are seeded straight into ACTIVE and
// never need this, so this only exercises the path a future CV-003 would go through.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { postAdminKioskVerify } = require("../src/controllers/kioskCommands.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const verify = async (kioskId) => {
  const res = response();
  await postAdminKioskVerify({ params: { kioskId } }, res);
  return res;
};

test("a machine with no registry record yet cannot be verified", async () => {
  fake.reset({});
  const res = await verify("CV-003");
  assert.strictEqual(res.code, 404);
});

test("a provisioned machine missing a heartbeat and printer fails every relevant check", async () => {
  fake.reset({
    machines: { "CV-003": { name: "MIMO 3.0", status: "PROVISIONING", templateId: "mimo-1.0-standard", locationId: "jain-university" } },
    machine_templates: { "mimo-1.0-standard": { name: "MIMO 1.0 Standard" } },
    locations: { "jain-university": { name: "Jain University" } },
  });
  const res = await verify("CV-003");
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.passed, false);
  assert.strictEqual(res.body.checks.hasTemplate, true);
  assert.strictEqual(res.body.checks.hasLocation, true);
  assert.strictEqual(res.body.checks.hasReportedIn, false);
  assert.strictEqual(res.body.checks.printerVerified, false);
  assert.strictEqual(res.body.status, "PROVISIONING");
  assert.strictEqual(fake.data("machines")["CV-003"].status, "PROVISIONING");
});

test("a provisioned machine that has reported in with a healthy printer is activated", async () => {
  fake.reset({
    machines: { "CV-003": { name: "MIMO 3.0", status: "PROVISIONING", templateId: "mimo-1.0-standard", locationId: "jain-university" } },
    machine_templates: { "mimo-1.0-standard": { name: "MIMO 1.0 Standard" } },
    locations: { "jain-university": { name: "Jain University" } },
    system_status: { "CV-003": { lastSeen: new Date() } },
    hardware: { printers: { "CV-003": { status: "OK" } } },
  });
  const res = await verify("CV-003");
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.passed, true);
  assert.strictEqual(res.body.status, "ACTIVE");
  assert.strictEqual(fake.data("machines")["CV-003"].status, "ACTIVE");
  assert.strictEqual(fake.data("machines")["CV-003"].selfTest.passed, true);
});

test("a printer in an error state blocks activation even once everything else is in place", async () => {
  fake.reset({
    machines: { "CV-003": { name: "MIMO 3.0", status: "PROVISIONING", templateId: "mimo-1.0-standard", locationId: "jain-university" } },
    machine_templates: { "mimo-1.0-standard": { name: "MIMO 1.0 Standard" } },
    locations: { "jain-university": { name: "Jain University" } },
    system_status: { "CV-003": { lastSeen: new Date() } },
    hardware: { printers: { "CV-003": { status: "Paused/Error" } } },
  });
  const res = await verify("CV-003");
  assert.strictEqual(res.body.passed, false);
  assert.strictEqual(res.body.checks.printerVerified, false);
  assert.strictEqual(res.body.status, "PROVISIONING");
});

test("re-verifying an already-ACTIVE machine never changes its status", async () => {
  fake.reset({
    machines: { "SV-002": { name: "MIMO 2.0", status: "ACTIVE", templateId: "mimo-2.0-standard", locationId: "central-library" } },
    machine_templates: { "mimo-2.0-standard": { name: "MIMO 2.0 Standard" } },
    locations: { "central-library": { name: "Central Library" } },
    system_status: { "SV-002": { lastSeen: new Date() } },
    hardware: { printers: { "SV-002-COLOR": { status: "OK" } } },
  });
  const res = await verify("SV-002");
  assert.strictEqual(res.body.status, "ACTIVE");
  assert.strictEqual(fake.data("machines")["SV-002"].status, "ACTIVE");
});
