// Proves the fix for the fleet-architecture audit's confirmed blocker: print.controller.js and kiosk.routes.js
// used to hard-reject any kioskId other than the literal strings "CV-001"/"SV-002" at the real print-job
// routing path, so a registry-only third machine could never actually process a job even once it existed,
// passed self-test, and went ACTIVE. Both entry points now read the registry instead.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { isColorJob } = require("../src/services/printJob.service");
const { postGetDocumentsByCode } = require("../src/controllers/print.controller");
const { createKioskRouter } = require("../src/routes/kiosk.routes");

const router = createKioskRouter({ db: fake.db, admin: fake.admin, isColorJob, CASHFREE_BASE_URL: "", cashfreeHeaders: {}, axios: null });
const printLayer = router.stack.find((l) => l.route && l.route.path === "/print" && l.route.methods.post).route.stack;
const kioskPrint = printLayer[printLayer.length - 1].handle; // skip the rate limiter

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, set() { return this; } };
}
const job = (over = {}) => ({
  userId: "u1", printCode: "4821", status: "paid", colorMode: "bw", createdAt: new Date(),
  fileName: "notes.pdf", fileUrl: "https://example.invalid/notes.pdf",
  files: [{ name: "notes.pdf", url: "https://example.invalid/notes.pdf", type: "application/pdf" }],
  ...over,
});
const getDocuments = async (kioskId) => { const res = response(); await postGetDocumentsByCode({ body: { printCode: "4821", kioskId } }, res); return res; };
const releaseToPi = async (kioskId) => { const res = response(); await kioskPrint({ body: { printCode: "4821", kioskId } }, res); return res; };

const REGISTRY_SEED = {
  machines: {
    "CV-003": { name: "MIMO 3.0", status: "ACTIVE", templateId: "mimo-1.0-standard" },
    "SV-003": { name: "MIMO 2.0b", status: "ACTIVE", templateId: "mimo-2.0-standard" },
    "CV-004": { name: "MIMO 4.0", status: "PROVISIONING", templateId: "mimo-1.0-standard" },
  },
  machine_templates: {
    "mimo-1.0-standard": { name: "MIMO 1.0 Standard", capabilities: { colour: false } },
    "mimo-2.0-standard": { name: "MIMO 2.0 Standard", capabilities: { colour: true } },
  },
};

test("a B&W job is accepted at a registry-only, bw-capable third machine (CV-003)", async () => {
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "bw" }) } });
  assert.strictEqual((await getDocuments("CV-003")).code, 200);
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "bw" }) } });
  await releaseToPi("CV-003");
  assert.strictEqual(fake.data("print_jobs").j1.status, "printing");
});

test("a colour job is rejected at CV-003 (bw-only) by both entry points, with the job left unclaimed", async () => {
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "color" }) } });
  const docsRes = await getDocuments("CV-003");
  assert.strictEqual(docsRes.code, 400);
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "color" }) } });
  const printRes = await releaseToPi("CV-003");
  assert.strictEqual(printRes.code, 400);
  assert.strictEqual(fake.data("print_jobs").j1.status, "paid");
});

test("a colour job is accepted at a registry-only, colour-capable third machine (SV-003)", async () => {
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "color" }) } });
  assert.strictEqual((await getDocuments("SV-003")).code, 200);
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "color" }) } });
  await releaseToPi("SV-003");
  assert.strictEqual(fake.data("print_jobs").j1.status, "printing");
});

test("a PROVISIONING machine (CV-004) is refused even for an otherwise-valid B&W job", async () => {
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "bw" }) } });
  assert.strictEqual((await getDocuments("CV-004")).code, 400);
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "bw" }) } });
  const res = await releaseToPi("CV-004");
  assert.strictEqual(res.code, 400);
  assert.strictEqual(fake.data("print_jobs").j1.status, "paid");
});

test("a totally unknown kiosk id is still refused (unchanged pre-registry behavior)", async () => {
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "bw" }) } });
  assert.strictEqual((await getDocuments("ZZ-999")).code, 400);
});

test("CV-001 and SV-002 keep working exactly as before once other machines exist in the registry", async () => {
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "bw" }) } });
  assert.strictEqual((await getDocuments("CV-001")).code, 200);
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "color" }) } });
  assert.strictEqual((await getDocuments("CV-001")).code, 400, "CV-001 still can't take a colour job");
  fake.reset({ ...REGISTRY_SEED, print_jobs: { j1: job({ colorMode: "color" }) } });
  assert.strictEqual((await getDocuments("SV-002")).code, 200);
});
