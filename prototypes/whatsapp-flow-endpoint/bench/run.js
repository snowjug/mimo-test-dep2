"use strict";
// Local benchmark. Synthetic files, loopback "CDN", stub DB. Results are LOCAL-MACHINE numbers only.
// Usage: node bench/run.js [iterations]   -> prints a table and writes bench/results-<timestamp>.json (never overwrites)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createFlowHandler } = require("../src/flowHandler");
const { createCdnFetcher } = require("../src/cdn");
const { processDocuments, nowMs } = require("../src/pipeline");
const f = require("../test/fixtures");

const ITER = Number(process.argv[2]) || 15;
const WARMUP = 2;
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const r1 = (n) => Math.round(n * 10) / 10;

async function main() {
  const keys = f.generateKeys();
  const cdn = await f.startFixtureCdn();
  const deps = { fetchCdn: createCdnFetcher({ allowLoopbackHttp: true, maxBytes: 40 * 1024 * 1024 }) };
  const bigLimits = { maxTotalBytes: 1024 * 1024 * 1024 }; // lifted so 30x heavy measures latency; policy cap is reported separately
  const handle = createFlowHandler({ privateKeyPem: keys.privateKey, appSecrets: [f.TEST_APP_SECRET], deps, db: f.stubDb(), limits: bigLimits });

  process.stderr.write("generating fixtures...\n");
  const heavyPng = f.makePng(2500, 3000, true);
  const kinds = {
    "pdf-3p": f.addDocument(cdn, "small.pdf", await f.makePdf(3)),
    "pdf-50p": f.addDocument(cdn, "p50.pdf", await f.makePdf(50)),
    "pdf-200p": f.addDocument(cdn, "p200.pdf", await f.makePdf(200)),
    "pdf-heavy(~7.5MB,20p)": f.addDocument(cdn, "heavy.pdf", await f.makePdf(20, { image: heavyPng })),
    "image-png(~0.5MB)": f.addDocument(cdn, "photo.png", f.makePng(700, 700, true)),
  };
  const sizes = Object.fromEntries(Object.entries(cdn.blobs).map(([k, v]) => [k, v.length]));
  const kindBytes = Object.fromEntries(Object.entries(kinds).map(([k, d]) => [k, sizes["/" + d.media_id]]));
  const mixed = Object.values(kinds);

  const results = [];
  let peakRss = 0;
  const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss); };

  async function measure(label, docsFor, batch, concurrency) {
    const docs = docsFor(batch);
    const walls = [], stage = { fetchMs: [], decryptMs: [], validateMs: [], pageCountMs: [] };
    let firstCall = null, failures = 0;
    const iters = label.startsWith("pdf-heavy") ? Math.max(6, Math.floor(ITER / 2)) : ITER;
    for (let i = 0; i < iters + WARMUP; i++) {
      const t0 = nowMs();
      const pr = await processDocuments(docs, deps, { concurrency, limits: bigLimits });
      sample();
      const req = f.buildEncryptedRequest({ action: "data_exchange", screen: "UPLOAD", flow_token: "bench" + i, data: { documents: docs } }, keys.publicKey);
      const raw = Buffer.from(JSON.stringify(req.body));
      const t1 = nowMs();
      const res = await handle(raw, { "x-hub-signature-256": f.sign(raw) }); // includes decrypt, pipeline, pricing lookup, response encrypt
      const wall = nowMs() - t1;
      sample();
      if (res.status !== 200 || pr.errors.length) failures++;
      if (i === 0) firstCall = wall;
      if (i >= WARMUP) {
        walls.push(wall);
        for (const k of Object.keys(stage)) stage[k].push(pr.timings[k] || 0);
      }
    }
    const row = {
      workload: label, files: batch, concurrency, samples: walls.length, failures,
      firstCallMs: r1(firstCall), p50Ms: r1(pct(walls, 50)), p95Ms: r1(pct(walls, 95)), maxMs: r1(Math.max(...walls)),
      stageP50Ms: Object.fromEntries(Object.entries(stage).map(([k, v]) => [k.replace("Ms", ""), r1(pct(v, 50))])),
      totalPlainMB: r1((batch * (kindBytes[label] || 0)) / 1048576),
    };
    results.push(row);
    process.stderr.write(`${label} x${batch} c${concurrency}: p50 ${row.p50Ms} p95 ${row.p95Ms} max ${row.maxMs}\n`);
  }

  for (const [label, doc] of Object.entries(kinds)) {
    for (const batch of [1, 10, 30]) {
      for (const c of [1, 4]) {
        await measure(label, (n) => Array.from({ length: n }, (_, i) => ({ ...doc, file_name: `f${i}.x` })), batch, c);
      }
    }
  }
  for (const batch of [10, 30]) {
    for (const c of [1, 4]) await measure("mixed(all kinds)", (n) => Array.from({ length: n }, (_, i) => ({ ...mixed[i % mixed.length], file_name: `m${i}` })), batch, c);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0].model, cores: os.cpus().length, totalMemGB: Math.round(os.totalmem() / 1e9), note: "LOCAL machine, loopback CDN: not representative of Cloud Functions or the Meta CDN" },
    iterations: ITER, warmupDiscarded: WARMUP, peakRssMB: Math.round(peakRss / 1048576),
    fixtureBytes: kindBytes, results,
  };
  let file = path.join(__dirname, `results-${Date.now()}.json`);
  if (fs.existsSync(file)) file = file.replace(".json", `-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ file: path.basename(file), ...out }, null, 1));
  await cdn.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
