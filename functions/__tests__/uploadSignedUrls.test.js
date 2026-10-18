// POST /upload-url and POST /read-url (audit finding F-01): the customer-document bucket used to allow
// unauthenticated public read AND write on /uploads, /profiles, /screensaver, /templates. These two endpoints
// replace that with short-lived, server-minted, ownership-scoped signed URLs -- the browser never gets a
// standing credential to the bucket, only a one-shot link for exactly the object it's allowed to touch.
process.env.JWT_SECRET = "upload-signed-url-test-secret-fixture-32c";
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { postGetUploadUrl, postGetReadUrl } = require("../src/controllers/upload.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test.beforeEach(() => fake.reset({
  print_jobs: {
    mine: { userId: "u1", status: "paid", files: [{ name: "a.pdf", url: "https://storage.googleapis.com/fake-test-bucket/uploads/u1/1_a.pdf" }] },
    theirs: { userId: "u2", status: "paid", files: [{ name: "b.pdf", url: "https://storage.googleapis.com/fake-test-bucket/uploads/u2/1_b.pdf" }] },
  },
}));

test.describe("POST /upload-url", () => {
  test("mints a write URL scoped under the caller's own userId, for a known purpose", async () => {
    const res = response();
    await postGetUploadUrl({ user: { userId: "u1" }, body: { fileName: "My Résumé (final).pdf", contentType: "application/pdf", purpose: "document" } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.match(res.body.uploadUrl, /^https:\/\/fake-signed\.example\//);
    assert.match(res.body.fileUrl, /^https:\/\/storage\.googleapis\.com\/fake-test-bucket\/uploads\/u1\//, "path is scoped under the caller's own userId, not a client-supplied name");
    assert.ok(res.body.expiresInSeconds > 0 && res.body.expiresInSeconds <= 900, "short-lived, not a standing credential");
  });

  test("sanitizes the filename (no path traversal, no special characters escaping the scoped prefix)", async () => {
    const res = response();
    await postGetUploadUrl({ user: { userId: "u1" }, body: { fileName: "../../../etc/passwd", contentType: "text/plain", purpose: "document" } }, res);
    assert.strictEqual(res.code, 200);
    assert.ok(!res.body.fileUrl.includes(".."), "path traversal sequences are stripped");
    assert.match(res.body.fileUrl, /^https:\/\/storage\.googleapis\.com\/fake-test-bucket\/uploads\/u1\/\d+_passwd$/);
  });

  test("rejects an unknown purpose", async () => {
    const res = response();
    await postGetUploadUrl({ user: { userId: "u1" }, body: { fileName: "x.pdf", purpose: "screensaver-but-not-really" } }, res);
    assert.strictEqual(res.code, 400);
  });

  test("profile purpose writes under profiles/<userId>, not uploads/<userId>", async () => {
    const res = response();
    await postGetUploadUrl({ user: { userId: "u1" }, body: { fileName: "avatar.png", contentType: "image/png", purpose: "profile" } }, res);
    assert.strictEqual(res.code, 200);
    assert.match(res.body.fileUrl, /\/profiles\/u1\//);
  });
});

test.describe("POST /read-url", () => {
  test("a customer can get a read URL for their own job's file", async () => {
    const res = response();
    await postGetReadUrl({ user: { userId: "u1" }, body: { fileUrl: "https://storage.googleapis.com/fake-test-bucket/uploads/u1/1_a.pdf", jobId: "mine" } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.match(res.body.readUrl, /^https:\/\/fake-signed\.example\//);
  });

  test("a customer CANNOT get a read URL for someone else's job file, even with a jobId they don't own", async () => {
    const res = response();
    await postGetReadUrl({ user: { userId: "u1" }, body: { fileUrl: "https://storage.googleapis.com/fake-test-bucket/uploads/u2/1_b.pdf", jobId: "theirs" } }, res);
    assert.strictEqual(res.code, 403);
  });

  test("a customer cannot read an arbitrary path by omitting jobId", async () => {
    const res = response();
    await postGetReadUrl({ user: { userId: "u1" }, body: { fileUrl: "https://storage.googleapis.com/fake-test-bucket/uploads/u2/1_b.pdf" } }, res);
    assert.strictEqual(res.code, 403);
  });

  test("staff (admin) can read any file without an ownership check", async () => {
    const res = response();
    await postGetReadUrl({ user: { userId: "staff1", isAdmin: true }, body: { fileUrl: "https://storage.googleapis.com/fake-test-bucket/uploads/u2/1_b.pdf" } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  });

  test("a malformed URL (not gs://, not a recognised storage host) is rejected as unrecognised", async () => {
    const res = response();
    await postGetReadUrl({ user: { userId: "u1" }, body: { fileUrl: "https://example.com/not-storage-at-all" } }, res);
    assert.strictEqual(res.code, 400);
  });

  test("a bare non-URL string is treated as a literal path and still fails closed on ownership, not bypassed", async () => {
    const res = response();
    await postGetReadUrl({ user: { userId: "u1" }, body: { fileUrl: "uploads/u2/1_b.pdf" } }, res);
    assert.strictEqual(res.code, 403, "extractStoragePath's bare-path fallback must not become an auth bypass");
  });
});
