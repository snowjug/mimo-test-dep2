// A raw HEIC photo reached CV-001's printer on Sat 26 Sep (its Pi has no HEIC decoder; photos are stored as
// uploaded) and started five hours of failed prints. Both kiosk entry points must now refuse it at CV-001 with a
// clear message, before the job is released to the Pi — and keep accepting it at SV-002, which prints HEIC.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { isColorJob, unprintableFilesForKiosk } = require("../src/services/printJob.service");
const { postGetDocumentsByCode } = require("../src/controllers/print.controller");
const { createKioskRouter } = require("../src/routes/kiosk.routes");

const router = createKioskRouter({ db: fake.db, admin: fake.admin, isColorJob, CASHFREE_BASE_URL: "", cashfreeHeaders: {}, axios: null });
const printLayer = router.stack.find((l) => l.route && l.route.path === "/print" && l.route.methods.post).route.stack;
const kioskPrint = printLayer[printLayer.length - 1].handle; // skip the rate limiter

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, set() { return this; } };
}
const heicJob = (over = {}) => ({
  userId: "u1", printCode: "4821", status: "paid", colorMode: "bw", createdAt: new Date(),
  fileName: "IMG_0042.heic", fileUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/uploads%2Fu1%2F1_IMG_0042.heic?alt=media",
  files: [{ name: "IMG_0042.heic", url: "https://firebasestorage.googleapis.com/v0/b/x/o/uploads%2Fu1%2F1_IMG_0042.heic?alt=media", type: "image/heic" }],
  ...over,
});
const pdfJob = (over = {}) => heicJob({
  fileName: "notes.pdf", fileUrl: "https://example.invalid/notes.pdf",
  files: [{ name: "notes.pdf", url: "https://example.invalid/notes.pdf", type: "application/pdf" }], ...over,
});
const getDocuments = async (kioskId) => { const res = response(); await postGetDocumentsByCode({ body: { printCode: "4821", kioskId } }, res); return res; };
const releaseToPi = async (kioskId) => { const res = response(); await kioskPrint({ body: { printCode: "4821", kioskId } }, res); return res; };

test("HEIC is refused at CV-001 by get-documents-by-code with a message pointing to Machine 2", async () => {
  fake.reset({ print_jobs: { j1: heicJob() } });
  const res = await getDocuments("CV-001");
  assert.strictEqual(res.code, 400);
  assert.match(res.body.error, /Machine 1 cannot print iPhone photos \(HEIC\)/);
  assert.match(res.body.error, /IMG_0042\.heic/);
  assert.match(res.body.error, /Machine 2/);
});

test("HEIC is refused at CV-001 by /kiosk/print and the job is NOT released to the Pi", async () => {
  fake.reset({ print_jobs: { j1: heicJob() } });
  const res = await releaseToPi("CV-001");
  assert.strictEqual(res.code, 400);
  assert.strictEqual(fake.data("print_jobs").j1.status, "paid", "the job must stay paid (not printing) so the student can use Machine 2");
});

test("the same HEIC job is still accepted at SV-002", async () => {
  fake.reset({ print_jobs: { j1: heicJob() } });
  assert.strictEqual((await getDocuments("SV-002")).code, 200);
  fake.reset({ print_jobs: { j1: heicJob() } });
  const res = await releaseToPi("SV-002");
  assert.notStrictEqual(res.code, 400, JSON.stringify(res.body));
  assert.strictEqual(fake.data("print_jobs").j1.status, "printing");
});

test("ordinary PDFs are unaffected at CV-001", async () => {
  fake.reset({ print_jobs: { j1: pdfJob() } });
  assert.strictEqual((await getDocuments("CV-001")).code, 200);
  fake.reset({ print_jobs: { j1: pdfJob() } });
  await releaseToPi("CV-001");
  assert.strictEqual(fake.data("print_jobs").j1.status, "printing");
});

test("detection covers uppercase names, .heif, legacy jobs without files[] and a HEIC inside a multi-file order", () => {
  assert.deepStrictEqual(unprintableFilesForKiosk([{ fileName: "PHOTO.HEIC" }], "CV-001"), ["PHOTO.HEIC"]);
  assert.deepStrictEqual(unprintableFilesForKiosk([{ fileName: "a.heif" }], "CV-001"), ["a.heif"]);
  assert.deepStrictEqual(
    unprintableFilesForKiosk([{ files: [{ name: "a.pdf", url: "u/a.pdf" }, { name: "b.heic", url: "u/b.heic" }] }], "CV-001"),
    ["b.heic"],
  );
  assert.deepStrictEqual(unprintableFilesForKiosk([{ fileName: "b.heic" }], "SV-002"), []);
  assert.deepStrictEqual(unprintableFilesForKiosk([{ fileName: "scan.jpg" }, { fileName: "doc.pdf" }], "CV-001"), []);
});
