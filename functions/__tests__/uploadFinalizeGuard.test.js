// A file with no recognised type that is tiny is refused before any payable print job exists. This is the shape of the
// dragged-link bug: a 66-byte text blob named like a course code. Recognised documents and normal-sized files are not
// touched by this check.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

process.env.JWT_SECRET = "upload-finalize-guard-test-secret-32chars"; // must be >= 32 chars (see src/config/env.js)
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
const garbage = {
  name: "R24DB032  coursera",
  type: "application/octet-stream",
  size: 66,
  url: "https://firebasestorage.googleapis.com/v0/b/mimo/o/uploads%2Fa%2F1_R24DB032__coursera?alt=media&token=t",
  pageCount: 1,
};

test("the dragged-link file is refused with a clear message, and no print job is created", async () => {
  fake.reset({});
  const res = await finalize(garbage);
  assert.strictEqual(res.code, 400);
  assert.match(res.body.error, /doesn't look like a real document/);
  assert.match(res.body.error, /download the actual file/);
  assert.deepStrictEqual(fake.data("print_jobs"), {}, "nothing payable was created");
});

test("a normal-sized file with no recognised type is not refused by this check", async () => {
  fake.reset({});
  const res = await finalize({ ...garbage, size: 4096 });
  assert.notStrictEqual(res.code, 400, JSON.stringify(res.body));
});

// Billing-bypass regression test, same principle as uploadPdfPageCount.test.js but for the catch-all
// branch: there is no server-side way to read a real page count out of an unrecognised file type, so a
// client-declared pageCount must never be trusted there either — it is always billed as 1 page.
test("an unrecognised file type is always billed as 1 page, regardless of the client-declared pageCount", async () => {
  fake.reset({});
  const res = await finalize({ ...garbage, size: 4096, pageCount: 300 });
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.totalPages, 1, "an unverifiable file type must never be billed by the client's claimed page count");
  assert.strictEqual(res.body.files[0].pageCount, 1);

  const jobs = Object.values(fake.data("print_jobs"));
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].pageCount, 1, "the stored, billable pageCount must be the safe default, not the client's claim");
});
