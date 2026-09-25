/**
 * Tests for the routes ported from the legacy Express server (profile photo upload, bulk coupons).
 * Firebase Admin is stubbed; nothing here touches Firestore or Storage.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const express = require("express");

const { admin, db } = require("../src/config/firebase");

// What the Cloud Functions runtime does to every request body before Express sees it:
// JSON is parsed, everything else (including multipart) is consumed as a raw Buffer in req.rawBody.
const frameworkBodyParsing = (limit) => [
  express.json({ limit }),
  express.raw({ type: "*/*", limit, verify: (req, res, buf) => { req.rawBody = buf; } }),
];

const withServer = async (setup, fn, limit = "10mb") => {
  const app = express();
  app.use(...frameworkBodyParsing(limit));
  setup(app);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
};
const asUser = (req, res, next) => { req.user = { userId: "user1" }; next(); };

describe("POST /upload-profile-photo (busboy on req.rawBody)", () => {
  let saved, userUpdate, origStorage, origCollection;
  before(() => {
    origStorage = Object.getOwnPropertyDescriptor(admin, "storage");
    origCollection = db.collection;
    Object.defineProperty(admin, "storage", {
      configurable: true,
      value: () => ({ bucket: () => ({ name: "test-bucket", file: (name) => ({ save: async (buf, opts) => { saved = { name, size: buf.length, opts }; } }) }) }),
    });
    db.collection = (c) => ({ doc: (id) => ({ update: async (data) => { userUpdate = { c, id, data }; } }) });
  });
  after(() => {
    if (origStorage) Object.defineProperty(admin, "storage", origStorage);
    db.collection = origCollection;
  });

  const { postUploadProfilePhoto } = require("../src/controllers/user.controller");
  const route = (app) => app.post("/upload-profile-photo", asUser, postUploadProfilePhoto);

  it("stores the photo and returns a download-token URL", async () => {
    await withServer(route, async (base) => {
      const fd = new FormData();
      fd.append("photo", new Blob([Buffer.alloc(2048, 7)], { type: "image/png" }), "my pic.png");
      const res = await fetch(`${base}/upload-profile-photo`, { method: "POST", body: fd });
      assert.strictEqual(res.status, 200);
      const { photoUrl } = await res.json();
      assert.match(photoUrl, /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\/o\/profiles%2Fuser1_\d+_my_pic\.png\?alt=media&token=[0-9a-f-]{36}$/);
      assert.strictEqual(saved.size, 2048);
      assert.strictEqual(saved.opts.contentType, "image/png");
      assert.ok(saved.opts.metadata.metadata.firebaseStorageDownloadTokens);
      assert.deepStrictEqual(userUpdate, { c: "users", id: "user1", data: { photoUrl } });
    });
  });

  it("returns 400 when no photo field is sent", async () => {
    await withServer(route, async (base) => {
      const fd = new FormData();
      fd.append("other", "x");
      const res = await fetch(`${base}/upload-profile-photo`, { method: "POST", body: fd });
      assert.strictEqual(res.status, 400);
    });
  });

  it("returns 400 for a non-multipart request", async () => {
    await withServer(route, async (base) => {
      const res = await fetch(`${base}/upload-profile-photo`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      assert.strictEqual(res.status, 400);
    });
  });

  it("returns 413 above 10MB", async () => {
    await withServer(route, async (base) => {
      const fd = new FormData();
      fd.append("photo", new Blob([Buffer.alloc(10 * 1024 * 1024 + 10, 1)], { type: "image/png" }), "big.png");
      const res = await fetch(`${base}/upload-profile-photo`, { method: "POST", body: fd });
      assert.strictEqual(res.status, 413);
    }, "20mb");
  });
});

describe("POST /admin/coupons/bulk", () => {
  it("stores expiryDate as a Date (Firestore Timestamp), not an ISO string", async () => {
    const written = [];
    const orig = db.batch;
    db.batch = () => ({ set: (ref, data) => written.push({ id: ref.id, data }), commit: async () => {} });
    const origCol = db.collection;
    db.collection = (c) => ({ doc: (id) => ({ id }) });
    try {
      const { postAdminCouponsBulk } = require("../src/controllers/admin.controller");
      await withServer((app) => app.post("/b", postAdminCouponsBulk), async (base) => {
        const res = await fetch(`${base}/b`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefix: "abc", count: 3, discountPercentage: 20, expiryDate: "2030-01-01" }) });
        const body = await res.json();
        assert.strictEqual(body.count, 3);
        assert.strictEqual(written.length, 3);
        for (const w of written) {
          assert.ok(w.data.expiryDate instanceof Date, "expiryDate must be a Date so Firestore stores a Timestamp");
          assert.match(w.id, /^ABC-[A-Z0-9]{1,4}$/);
        }
      });
    } finally { db.batch = orig; db.collection = origCol; }
  });
});

describe("POST /mark-printed ownership", () => {
  it("queries only the caller's own jobs (userId filter)", async () => {
    const filters = [];
    const origCol = db.collection;
    const chain = { where: (f, op, v) => { filters.push([f, op, v]); return chain; }, get: async () => ({ empty: true, docs: [] }) };
    db.collection = () => chain;
    try {
      const { postMarkPrinted } = require("../src/controllers/print.controller");
      await withServer((app) => app.post("/m", (req, res, next) => { req.user = { userId: "owner1" }; next(); }, postMarkPrinted), async (base) => {
        const res = await fetch(`${base}/m`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ printCode: "4321" }) });
        assert.strictEqual(res.status, 404);
        assert.deepStrictEqual(filters, [["printCode", "==", "4321"], ["userId", "==", "owner1"]]);
      });
    } finally { db.collection = origCol; }
  });
});
