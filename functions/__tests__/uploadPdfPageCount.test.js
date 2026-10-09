// Billing-bypass regression test: a PDF's pageCount must always be the server-computed, real page
// count from the file bytes (via pdf-lib), never the client-declared value in the request body.
// Without this, a user could declare pageCount: 1 for a 300-page PDF and pay for a single page
// while the whole file is sent to print.
process.env.JWT_SECRET = "upload-pdf-page-count-test-secret-32chr"; // must be >= 32 chars (see src/config/env.js)
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { installAxiosStub } = require("./helpers/stubAxios");

const http = installAxiosStub();
const fake = createFakeFirestore();
fake.install();
const { postFinalizeUpload } = require("../src/controllers/upload.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const finalize = async (file) => {
  const res = response();
  await postFinalizeUpload({ user: { id: "u1" }, body: { files: [file] } }, res);
  return res;
};

// Builds a real, valid N-page PDF in memory with pdf-lib (the same library the production code
// uses to read it back), so no binary fixture file is needed.
async function buildPdf(pageCount) {
  const { PDFDocument } = require("pdf-lib");
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

const PDF_URL = "https://firebasestorage.googleapis.com/v0/b/mimo/o/uploads%2Fa%2F1_real.pdf?alt=media&token=t";

test.beforeEach(() => {
  fake.reset({});
  http.reset();
});

test("a client-declared pageCount LOWER than the real PDF page count is overridden by the server-verified count", async () => {
  const realBytes = await buildPdf(5);
  http.on("get", new RegExp(PDF_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), () => ({ data: realBytes }));

  const file = {
    name: "sneaky.pdf",
    type: "application/pdf",
    size: realBytes.length,
    url: PDF_URL,
    pageCount: 1, // client lies: declares 1 page to try to pay for less than the real file
  };

  const res = await finalize(file);

  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.totalPages, 5, "the server-verified page count (5) must win over the client's declared count (1)");
  assert.strictEqual(res.body.amount, 10, "pricing must be based on the real 5-page count, not the declared 1-page count");
  assert.strictEqual(res.body.files[0].pageCount, 5);

  const jobs = Object.values(fake.data("print_jobs"));
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].pageCount, 5, "the stored, billable pageCount must be the real server-computed count");
});

test("a client-declared pageCount that matches the real PDF page count is accepted normally", async () => {
  const realBytes = await buildPdf(3);
  http.on("get", new RegExp(PDF_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), () => ({ data: realBytes }));

  const file = {
    name: "honest.pdf",
    type: "application/pdf",
    size: realBytes.length,
    url: PDF_URL,
    pageCount: 3, // matches reality
  };

  const res = await finalize(file);

  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.totalPages, 3);
  assert.strictEqual(res.body.files[0].pageCount, 3);

  const jobs = Object.values(fake.data("print_jobs"));
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].pageCount, 3);
});

test("a corrupted/unreadable PDF is rejected with a clear 400 error instead of crashing or trusting the client count", async () => {
  const garbageBytes = Buffer.from("not a real pdf at all, just some bytes");
  http.on("get", new RegExp(PDF_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), () => ({ data: garbageBytes }));

  const file = {
    name: "broken.pdf",
    type: "application/pdf",
    size: garbageBytes.length,
    url: PDF_URL,
    pageCount: 1,
  };

  const res = await finalize(file);

  assert.strictEqual(res.code, 400);
  assert.match(res.body.error, /couldn't be read/);
  assert.deepStrictEqual(fake.data("print_jobs"), {}, "no payable job is created for an unreadable PDF");
});
