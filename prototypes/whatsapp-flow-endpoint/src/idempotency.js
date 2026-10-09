"use strict";
// PROTOTYPE-LEVEL idempotency simulation (single process, in memory). It shows the intended contract only:
// identical request -> identical outcome; concurrent duplicates share one execution; failures are never cached
// as successes. It is NOT a guarantee for multi-instance Cloud Functions: that needs a Firestore lease/transaction
// (workstream B) and a deployed test.
const crypto = require("crypto");

const stable = (v) => (v && typeof v === "object" ? (Array.isArray(v) ? `[${v.map(stable)}]` : `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k]))}}`) : JSON.stringify(v));
const requestKey = (d) => crypto.createHash("sha256").update(stable({ t: d.flow_token, a: d.action, s: d.screen, d: d.data })).digest("hex");

function createIdempotency() {
  const done = new Map();
  const inflight = new Map();
  const stats = { executions: 0, replays: 0, joined: 0 };
  async function run(key, fn) {
    if (done.has(key)) { stats.replays++; return done.get(key); }
    if (inflight.has(key)) { stats.joined++; return inflight.get(key); }
    const p = (async () => { stats.executions++; return fn(); })();
    inflight.set(key, p);
    try {
      const result = await p;
      done.set(key, result); // only successful (non-throwing) outcomes are remembered
      return result;
    } finally { inflight.delete(key); }
  }
  return { run, stats, size: () => done.size };
}

module.exports = { createIdempotency, requestKey };
