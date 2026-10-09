"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const N = Number(process.argv[2]) || 7;
const rows = [];
for (let i = 0; i < N; i++) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, "coldstart-child.js")], { encoding: "utf8" });
  const wall = Date.now() - t;
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  rows.push({ processWallMs: wall, ...JSON.parse(r.stdout.trim().split("\n").pop()) });
}
const pct = (k, p) => { const s = rows.map((r) => r[k]).sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 10) / 10; };
const summary = {};
for (const k of ["processWallMs", "requireMs", "firstPingMs", "firstUploadMs"]) summary[k] = { p50: pct(k, 50), p95: pct(k, 95), max: pct(k, 100) };
console.log(JSON.stringify({ samples: N, allOk: rows.every((r) => r.ok), summary, note: "fresh local Node process; excludes container start / network / Cloud Run" }, null, 1));
