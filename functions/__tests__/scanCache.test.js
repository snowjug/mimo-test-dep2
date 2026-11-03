// cachedValue() is what keeps admin dashboards from re-reading the same Firestore windows on every call. The
// cache is off under `node --test` (so cached data can't leak between other tests); these tests switch it back on
// for themselves only.
const test = require("node:test");
const assert = require("node:assert");

const { cachedValue, clearScanCache } = require("../src/utils/scanCache");

function withCacheEnabled(fn) {
  return async () => {
    const saved = { ctx: process.env.NODE_TEST_CONTEXT, env: process.env.NODE_ENV };
    delete process.env.NODE_TEST_CONTEXT;
    process.env.NODE_ENV = "development";
    clearScanCache();
    try {
      await fn();
    } finally {
      clearScanCache();
      if (saved.ctx === undefined) delete process.env.NODE_TEST_CONTEXT; else process.env.NODE_TEST_CONTEXT = saved.ctx;
      if (saved.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.env;
    }
  };
}

const counter = () => {
  let calls = 0;
  return { load: async () => ({ call: ++calls }), get calls() { return calls; } };
};

test("cachedValue shares one load between callers with the same key", withCacheEnabled(async () => {
  const c = counter();
  const [a, b] = await Promise.all([cachedValue("window:1:2", c.load), cachedValue("window:1:2", c.load)]);
  const later = await cachedValue("window:1:2", c.load);
  assert.strictEqual(c.calls, 1);
  assert.strictEqual(a, b);
  assert.strictEqual(later, a);
}));

test("cachedValue keeps different keys apart", withCacheEnabled(async () => {
  const c = counter();
  await cachedValue("window:1:2", c.load);
  await cachedValue("window:2:3", c.load);
  assert.strictEqual(c.calls, 2);
}));

test("cachedValue never serves a failed load again", withCacheEnabled(async () => {
  let calls = 0;
  const flaky = async () => { calls += 1; if (calls === 1) throw new Error("unavailable"); return "ok"; };
  await assert.rejects(cachedValue("k", flaky), /unavailable/);
  assert.strictEqual(await cachedValue("k", flaky), "ok");
  assert.strictEqual(calls, 2);
}));

test("cachedValue reloads once the TTL has passed", withCacheEnabled(async () => {
  const c = counter();
  await cachedValue("k", c.load, 20);
  await new Promise((r) => setTimeout(r, 40));
  await cachedValue("k", c.load, 20);
  assert.strictEqual(c.calls, 2);
}));

test("cachedValue is a pass-through while running under node --test", async () => {
  const c = counter();
  await cachedValue("k", c.load);
  await cachedValue("k", c.load);
  assert.strictEqual(c.calls, 2);
});
