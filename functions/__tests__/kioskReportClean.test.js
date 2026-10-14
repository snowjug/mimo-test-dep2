const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.INTERNAL_WEBHOOK_SECRET = "test-internal-secret-12345";

const fake = createFakeFirestore();
fake.install();
const { isColorJob } = require("../src/services/printJob.service");
const { createKioskRouter } = require("../src/routes/kiosk.routes");

const router = createKioskRouter({
  db: fake.db,
  admin: fake.admin,
  isColorJob,
  CASHFREE_BASE_URL: "",
  cashfreeHeaders: {},
  axios: null,
});

const layer = router.stack.find((l) => l.route && l.route.path === "/report-clean" && l.route.methods.post).route.stack;
const reportClean = layer[layer.length - 1].handle;

function response() {
  return {
    code: 200,
    body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    set() { return this; }
  };
}

const post = async (body) => {
  const res = response();
  await reportClean({ body }, res);
  return res;
};

test.describe("POST /kiosk/report-clean route", () => {
  test("rejects request with invalid or missing secret with 403", async () => {
    const res1 = await post({ kioskId: "SV-002", status: "completed" });
    assert.strictEqual(res1.code, 403);
    assert.strictEqual(res1.body.error, "Invalid webhook secret");

    const res2 = await post({ kioskId: "SV-002", secret: "wrong-secret", status: "completed" });
    assert.strictEqual(res2.code, 403);
    assert.strictEqual(res2.body.error, "Invalid webhook secret");
  });

  test("accepts valid cleaning report, writes to printer_maintenance, and returns success", async () => {
    fake.reset({});
    const res = await post({
      kioskId: "SV-002",
      printerName: "Epson_L3250",
      secret: "test-internal-secret-12345",
      status: "completed",
      detail: "Automated daily 6:00 AM colour ink head cleaning finished successfully.",
    });

    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.success, true);

    const maintenanceDocs = fake.data("printer_maintenance");
    assert.ok(maintenanceDocs, "printer_maintenance collection should exist");
    const docEntries = Object.values(maintenanceDocs);
    assert.strictEqual(docEntries.length, 1);
    assert.strictEqual(docEntries[0].kioskId, "SV-002");
    assert.strictEqual(docEntries[0].printerName, "Epson_L3250");
    assert.strictEqual(docEntries[0].type, "color_ink_cleaning");
    assert.strictEqual(docEntries[0].status, "completed");
  });
});
