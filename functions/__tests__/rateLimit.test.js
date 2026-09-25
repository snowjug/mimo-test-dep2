/**
 * Print-code rate limiter (middleware/rateLimit.js) against an in-memory Firestore fake.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const { createFailureLimiter, retryAfterSeconds } = require("../src/middleware/rateLimit");

function fakeDb({ failReads = false } = {}) {
  const docs = new Map();
  const docRef = (name, id) => ({
    _k: `${name}/${id}`,
    get: async () => {
      if (failReads) throw new Error("firestore unavailable");
      const k = `${name}/${id}`;
      return { exists: docs.has(k), data: () => docs.get(k) };
    },
  });
  return {
    docs,
    collection: (name) => ({
      doc: (id) => docRef(name, id),
      where: (field, op, value) => ({
        limit: () => ({
          get: async () => {
            const hits = [...docs.entries()].filter(([k, d]) => k.startsWith(`${name}/`) && d.expireAt < value).map(([k]) => ({ ref: { _k: k } }));
            return { empty: hits.length === 0, forEach: (cb) => hits.forEach(cb) };
          },
        }),
      }),
    }),
    runTransaction: async (fn) => fn({ get: (ref) => ref.get(), set: (ref, data) => docs.set(ref._k, data) }),
    batch: () => { const keys = []; return { delete: (ref) => keys.push(ref._k), commit: async () => keys.forEach((k) => docs.delete(k)) }; },
  };
}

const LIMITS = [{ windowMs: 60_000, max: 3 }, { windowMs: 3_600_000, max: 5 }];

async function withApp(limiter, fn) {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/x", limiter, (req, res) => res.status(Number(req.query.s || 200)).json({ ok: true }));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const hit = (s, ip = "1.1.1.1") => fetch(`http://127.0.0.1:${server.address().port}/x?s=${s}`, { headers: { "x-forwarded-for": ip } });
  try { await fn(hit); } finally { server.close(); }
}

describe("failure rate limiter", () => {
  it("blocks after max failed lookups with 429 and Retry-After, per IP", async () => {
    const db = fakeDb();
    const limiter = createFailureLimiter(db, { scope: "code", limits: LIMITS, random: () => 1 });
    await withApp(limiter, async (hit) => {
      for (let i = 0; i < 3; i++) assert.strictEqual((await hit(404)).status, 404);
      const blocked = await hit(404);
      assert.strictEqual(blocked.status, 429);
      assert.ok(Number(blocked.headers.get("retry-after")) > 0);
      assert.strictEqual((await hit(200)).status, 429, "a blocked IP stays blocked even for valid requests");
      assert.strictEqual((await hit(404, "2.2.2.2")).status, 404, "other IPs are unaffected");
    });
  });

  it("does not count successful requests or non-failure statuses", async () => {
    const db = fakeDb();
    const limiter = createFailureLimiter(db, { scope: "code", limits: LIMITS, random: () => 1 });
    await withApp(limiter, async (hit) => {
      for (let i = 0; i < 20; i++) assert.strictEqual((await hit(200)).status, 200);
      for (let i = 0; i < 20; i++) assert.strictEqual((await hit(400)).status, 400);
      assert.strictEqual(db.docs.size, 0, "no Firestore writes for non-failures");
    });
  });

  it("counts 409 (already used) as a failure", async () => {
    const limiter = createFailureLimiter(fakeDb(), { scope: "code", limits: LIMITS, random: () => 1 });
    await withApp(limiter, async (hit) => {
      for (let i = 0; i < 3; i++) await hit(409);
      assert.strictEqual((await hit(200)).status, 429);
    });
  });

  it("unblocks when the window has passed", async () => {
    let t = 1_000_000;
    const limiter = createFailureLimiter(fakeDb(), { scope: "code", limits: LIMITS, now: () => t, random: () => 1 });
    await withApp(limiter, async (hit) => {
      for (let i = 0; i < 3; i++) await hit(404);
      assert.strictEqual((await hit(200)).status, 429);
      t += 61_000;
      assert.strictEqual((await hit(200)).status, 200, "per-minute window elapsed");
    });
  });

  it("enforces the hourly limit across minute windows", async () => {
    let t = 1_000_000;
    const limiter = createFailureLimiter(fakeDb(), { scope: "code", limits: LIMITS, now: () => t, random: () => 1 });
    await withApp(limiter, async (hit) => {
      for (let i = 0; i < 3; i++) await hit(404); // minute window full
      t += 61_000;
      assert.strictEqual((await hit(200)).status, 200, "minute block lifted");
      for (let i = 0; i < 2; i++) assert.strictEqual((await hit(404)).status, 404); // hourly total = 5
      t += 61_000;
      assert.strictEqual((await hit(200)).status, 429, "5 failures within the hour blocks even after the minute window");
    });
  });

  it("fails open when Firestore errors", async () => {
    const limiter = createFailureLimiter(fakeDb({ failReads: true }), { scope: "code", limits: LIMITS, random: () => 1 });
    await withApp(limiter, async (hit) => {
      assert.strictEqual((await hit(200)).status, 200);
      assert.strictEqual((await hit(404)).status, 404);
    });
  });

  it("deletes expired counter documents opportunistically", async () => {
    let t = 1_000_000;
    const db = fakeDb();
    db.docs.set("rate_limits/code_old", { expireAt: new Date(t - 1) });
    const limiter = createFailureLimiter(db, { scope: "code", limits: LIMITS, now: () => t, random: () => 0 });
    await withApp(limiter, async (hit) => { await hit(404); });
    assert.ok(!db.docs.has("rate_limits/code_old"), "stale doc removed");
    assert.strictEqual(db.docs.size, 1, "current counter kept");
  });

  it("retryAfterSeconds reports the longest remaining block", () => {
    const now = 100_000;
    const data = { w: [{ start: now - 10_000, count: 3 }, { start: now - 1_000, count: 5 }] };
    assert.strictEqual(retryAfterSeconds(data, LIMITS, now), Math.ceil((3_600_000 - 1_000) / 1000));
    assert.strictEqual(retryAfterSeconds(undefined, LIMITS, now), 0);
  });
});
