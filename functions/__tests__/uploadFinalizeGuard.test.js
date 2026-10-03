// A file with no recognised type that is tiny is refused before any payable print job exists. This is the shape of the
// dragged-link bug: a 66-byte text blob named like a course code. Recognised documents and normal-sized files are not
// touched by this check.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

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
