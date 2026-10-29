// Admin "Clean Colour Ink Head" writes a clean_color_head command per kiosk that the Pi listener acts on.
// It must refuse a second clean while one is in progress, validate kiosk ids, and write action="clean_color_head".
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "kiosk-clean-test-secret-fixture-32chars";
const fake = createFakeFirestore();
fake.install();
const { postAdminKioskCleanColorHead } = require("../src/controllers/kioskCommands.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const clean = async (kioskId) => {
  const res = response();
  await postAdminKioskCleanColorHead({ params: { kioskId }, admin: { email: "admin@mimo" } }, res);
  return res;
};

test("a clean colour head request is written as a pending clean_color_head command", async () => {
  fake.reset({ system_status: { "SV-002": { lastSeen: new Date() } } });
  const res = await clean("SV-002");
  assert.strictEqual(res.code, 200);
  const cmd = fake.data("kiosk_commands")["SV-002"];
  assert.strictEqual(cmd.action, "clean_color_head");
  assert.strictEqual(cmd.status, "pending");
  assert.strictEqual(cmd.commandId, res.body.commandId);
  assert.strictEqual(cmd.requestedBy, "admin@mimo");
  assert.strictEqual(res.body.action, "clean_color_head");
});

test("a second clean request while one is running is refused with 409", async () => {
  fake.reset({ kiosk_commands: { "SV-002": { status: "cleaning", updatedAt: new Date() } } });
  const res = await clean("SV-002");
  assert.strictEqual(res.code, 409);
  assert.strictEqual(fake.data("kiosk_commands")["SV-002"].status, "cleaning");
});

test("a clean command stuck for over 10 minutes can be retried", async () => {
  fake.reset({ kiosk_commands: { "SV-002": { status: "pending", updatedAt: new Date(Date.now() - 11 * 60 * 1000) } } });
  const res = await clean("SV-002");
  assert.strictEqual(res.code, 200);
  assert.strictEqual(fake.data("kiosk_commands")["SV-002"].status, "pending");
});

test("unknown or malformed kiosk ids are rejected", async () => {
  fake.reset({});
  assert.strictEqual((await clean("../invalid")).code, 400);
  assert.strictEqual((await clean("ZZ-999")).code, 404);
  assert.deepStrictEqual(fake.data("kiosk_commands"), {});
});

test("a machine registered in registry is recognized for colour clean", async () => {
  fake.reset({ machines: { "SV-002": { name: "MIMO 2.0 (Colour)", status: "ACTIVE" } } });
  const res = await clean("SV-002");
  assert.strictEqual(res.code, 200);
});
