// Admin "Restart Pi" writes one command per kiosk that the Pi listener acts on. It must refuse a second restart while
// one is still running, and unknown kiosk ids. The job timeline gives the admin history every moment a job passed.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { postAdminKioskRestart } = require("../src/controllers/kioskCommands.controller");
const { jobTimeline } = require("../src/controllers/adminInsights.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const restart = async (kioskId) => {
  const res = response();
  await postAdminKioskRestart({ params: { kioskId }, admin: { email: "ops@mimo" } }, res);
  return res;
};

test("a restart request is written as a pending reboot command for that kiosk", async () => {
  fake.reset({ system_status: { "SV-002": { lastSeen: new Date() } } });
  const res = await restart("SV-002");
  assert.strictEqual(res.code, 200);
  const cmd = fake.data("kiosk_commands")["SV-002"];
  assert.strictEqual(cmd.action, "reboot");
  assert.strictEqual(cmd.status, "pending");
  assert.strictEqual(cmd.commandId, res.body.commandId);
  assert.strictEqual(cmd.requestedBy, "ops@mimo");
});

test("a second restart while one is running is refused", async () => {
  fake.reset({ kiosk_commands: { "CV-001": { status: "waiting_idle", updatedAt: new Date() } } });
  const res = await restart("CV-001");
  assert.strictEqual(res.code, 409);
  assert.strictEqual(fake.data("kiosk_commands")["CV-001"].status, "waiting_idle");
});

test("a restart stuck for over 10 minutes can be retried", async () => {
  fake.reset({ kiosk_commands: { "CV-001": { status: "pending", updatedAt: new Date(Date.now() - 11 * 60 * 1000) } } });
  assert.strictEqual((await restart("CV-001")).code, 200);
});

test("unknown or malformed kiosk ids are rejected", async () => {
  fake.reset({});
  assert.strictEqual((await restart("../x")).code, 400);
  assert.strictEqual((await restart("ZZ-999")).code, 404);
  assert.deepStrictEqual(fake.data("kiosk_commands"), {});
});

test("a machine known only through the registry (no heartbeat yet) is still recognized", async () => {
  // A freshly provisioned machine: registered in machines/{id}, but hasn't sent its first heartbeat to
  // system_status yet. Restart should still be accepted — the whole point of the registry is that a machine
  // is "known" the moment it has a registry record, not only once it has reported in.
  fake.reset({ machines: { "CV-003": { name: "MIMO 3.0", status: "PROVISIONING" } } });
  const res = await restart("CV-003");
  assert.strictEqual(res.code, 200);
});

test("the job timeline lists the steps that happened, in time order", () => {
  const t = (s) => new Date(`2026-09-29T10:${s}Z`);
  const steps = jobTimeline({
    createdAt: t("40:00"), codeCreatedAt: t("41:00"), printStartedAt: t("48:00"), piReceivedAt: t("48:01"),
    sentToPrinterAt: t("48:09"), printedAt: t("49:30"), customerIssue: { reportedAt: t("49:50") },
  });
  assert.deepStrictEqual(steps.map((s) => s.key), ["created", "paid", "codeEntered", "piReceived", "sentToPrinter", "printed", "reported"]);
  assert.strictEqual(steps[4].at, "2026-09-29T10:48:09.000Z");
  assert.deepStrictEqual(jobTimeline({ createdAt: t("40:00") }).map((s) => s.key), ["created"]);
});
