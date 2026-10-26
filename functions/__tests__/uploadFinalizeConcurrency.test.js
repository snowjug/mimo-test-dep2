"use strict";
// Multi-file uploads: the Office files of one /finalize-upload batch are converted concurrently (a batch takes about
// as long as its slowest file, not the sum), results keep the order the files were sent in, mixed batches work, and
// a failure still discards the outputs of conversions that were running for other files. Converter and Storage are
// in-memory fakes (same harness as storageUploadLifecycle.test.js).
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createHarness, HOUR } = require("./helpers/cleanupHarness");

process.env.JWT_SECRET = "upload-finalize-concurrency-test-secret-32c";
const h = createHarness();

let converterImpl = async () => { throw new Error("converter not stubbed"); };
const convPath = require.resolve("../src/services/converter.service");
require.cache[convPath] = {
  id: convPath, filename: convPath, loaded: true,
  exports: { SUPPORTED_OFFICE_EXTENSIONS: new Set([".docx", ".doc", ".pptx", ".ppt"]), callOfficeConverter: (args) => converterImpl(args) },
};
const { postFinalizeUpload } = require("../src/controllers/upload.controller");

const response = () => ({ code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const finalize = async (files) => { const res = response(); await postFinalizeUpload({ user: { id: "u1" }, body: { files } }, res); return res; };
const doc = (name, type = "application/msword") => ({ name, type, size: 5000, url: h.url(`uploads/u1/${name}`), clientUploadId: name });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stem = (n) => n.replace(/\.[^.]+$/, "");

test("the Office files of one batch are converted concurrently, not one after another", async () => {
  h.reset();
  for (const n of ["a.docx", "b.pptx", "c.docx"]) h.bucket.put(`uploads/u1/${n}`, h.ago(1 * HOUR));
  let running = 0;
  let peak = 0;
  converterImpl = async ({ fileName }) => {
    running += 1;
    peak = Math.max(peak, running);
    await sleep(150);
    running -= 1;
    const p = `converted/u1/${stem(fileName)}.pdf`;
    h.bucket.put(p, h.ago(0));
    return { pageCount: 2, fileUrl: h.url(p), storagePath: p };
  };
  const started = Date.now();
  const res = await finalize([doc("a.docx"), doc("b.pptx"), doc("c.docx")]);
  const elapsed = Date.now() - started;
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.strictEqual(peak, 3, "all three conversions were running at the same time");
  assert.ok(elapsed < 400, `took ${elapsed} ms; sequential conversion would take about 450 ms`);
  assert.strictEqual(Object.keys(h.fake.data("print_jobs")).length, 3);
});

test("results keep the order the files were sent in, even when they finish in the opposite order", async () => {
  h.reset();
  for (const n of ["first.docx", "second.docx", "third.docx"]) h.bucket.put(`uploads/u1/${n}`, h.ago(1 * HOUR));
  const delays = { "first.docx": 120, "second.docx": 60, "third.docx": 10 };
  converterImpl = async ({ fileName }) => {
    await sleep(delays[fileName]);
    const p = `converted/u1/${stem(fileName)}.pdf`;
    h.bucket.put(p, h.ago(0));
    return { pageCount: { "first.docx": 1, "second.docx": 2, "third.docx": 3 }[fileName], fileUrl: h.url(p), storagePath: p };
  };
  const res = await finalize([doc("first.docx"), doc("second.docx"), doc("third.docx")]);
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.deepStrictEqual(res.body.files.map((f) => f.name), ["first.docx", "second.docx", "third.docx"]);
  assert.deepStrictEqual(res.body.files.map((f) => f.pageCount), [1, 2, 3]);
  assert.strictEqual(res.body.totalPages, 6);
});

test("a mixed batch of Word, PowerPoint and an image is accepted; the image counts as one page", async () => {
  h.reset();
  h.bucket.put("uploads/u1/report.docx", h.ago(1 * HOUR)).put("uploads/u1/slides.pptx", h.ago(1 * HOUR)).put("uploads/u1/photo.png", h.ago(1 * HOUR));
  converterImpl = async ({ fileName }) => {
    const p = `converted/u1/${stem(fileName)}.pdf`;
    h.bucket.put(p, h.ago(0));
    return { pageCount: fileName === "report.docx" ? 4 : 12, fileUrl: h.url(p), storagePath: p };
  };
  const res = await finalize([doc("report.docx"), doc("slides.pptx", "application/vnd.ms-powerpoint"), { ...doc("photo.png", "image/png") }]);
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.deepStrictEqual(res.body.files.map((f) => f.pageCount), [4, 12, 1]);
  assert.strictEqual(res.body.totalPages, 17);
});

test("when one file fails, the output of a conversion still running for another file is discarded, with no unhandled rejection", async () => {
  h.reset();
  h.bucket.put("uploads/u1/bad.docx", h.ago(1 * HOUR)).put("uploads/u1/slow.docx", h.ago(1 * HOUR));
  const unhandled = [];
  const onUnhandled = (err) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  try {
    converterImpl = async ({ fileName }) => {
      if (fileName === "bad.docx") throw new Error("corrupt document");
      await sleep(120); // still running when the first file has already failed
      h.bucket.put("converted/u1/slow.pdf", h.ago(0));
      return { pageCount: 5, fileUrl: h.url("converted/u1/slow.pdf"), storagePath: "converted/u1/slow.pdf" };
    };
    const res = await finalize([doc("bad.docx"), doc("slow.docx")]);
    await sleep(20);
    assert.strictEqual(res.code, 422);
    assert.match(res.body.error, /Failed to process document 'bad.docx': corrupt document/);
    assert.strictEqual(h.bucket.has("converted/u1/slow.pdf"), false, "the in-flight conversion output was removed");
    assert.deepStrictEqual(h.fake.data("print_jobs"), {}, "no job was created for any file of the failed batch");
    assert.deepStrictEqual(unhandled, [], "no unhandled promise rejection");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
