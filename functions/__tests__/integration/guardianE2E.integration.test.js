/**
 * MIMO Edge Guardian — Phase 2D end-to-end integration test.
 *
 * Exercises the REAL Python publisher (pi-guardian/guardian/publisher.py, driven through
 * pi-guardian/scripts/guardian_publish_once.py, spawned as a real subprocess) against the REAL
 * Express route (src/routes/guardianHealth.routes.js) running as a real local HTTP server, backed
 * by the fakeFirestore in-memory harness. Neither side is reimplemented here: Python does the
 * actual signing and the actual HTTP POST; Node runs the actual route and replay transaction.
 *
 * Isolation (task requirement 4): this file never touches a real Firestore/Firebase project
 * (fakeFirestore.install() replaces the config/firebase module before the route is required), uses
 * a hardcoded TEST-ONLY master key (not a real secret, never read from the environment the way
 * production does), binds only to 127.0.0.1, and the Python side connects over plain HTTP
 * (`use_tls: false`, see guardian/probes.py's SocketHttpsClient docstring) to that same loopback
 * server — there is no code path here that could reach a production host or a live kiosk.
 *
 * Deliberately NOT named `*.test.js` directly under __tests__/ (same reason as
 * __tests__/emulator/): `npm test`'s glob (`__tests__/*.test.js`) does not reach into
 * subdirectories, so this never runs as part of the default fast suite. Run explicitly with
 * `npm run test:e2e:guardian`. Skips itself (not a failure) if `python3` is not on PATH.
 */
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
require("../helpers/quiet");
const { createFakeFirestore } = require("../helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install(); // must happen before any src/ module is required — no real Firebase/Firestore

// 32 bytes / 64 hex chars. TEST-ONLY fixture, never a real secret, never used in production. Both
// "sides" of this test (the Node server and the Python publisher) are handed this same value only
// because this harness plays the role production's provisioning step would play — see
// docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md section 4.3. Production Secret Manager
// is never created, read, or reachable from this file.
const MASTER_KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.GUARDIAN_MASTER_KEY = MASTER_KEY_HEX;

const { createGuardianHealthRouter } = require("../../src/routes/guardianHealth.routes");
const { deriveKioskKey } = require("../../src/guardian/crypto");
const { STATE_COLLECTION } = require("../../src/guardian/ingest.service");
const { KIOSK_REGISTRY_COLLECTION, STATUS } = require("../../src/guardian/registry");

const KIOSK_ID = "AB-123";
function provisionedRecord(overrides = {}) {
  return { status: STATUS.ACTIVE, activeKeyVersion: 1, previousKeyVersion: null, previousKeyVersionExpiresAt: null, ...overrides };
}
const PUBLISH_SCRIPT = path.join(__dirname, "..", "..", "..", "pi-guardian", "scripts", "guardian_publish_once.py");
const DERIVED_KEY_HEX = deriveKioskKey(MASTER_KEY_HEX, KIOSK_ID).toString("hex");

function pythonAvailable() {
  const r = spawnSync("python3", ["--version"]);
  return r.status === 0;
}
const PYTHON_AVAILABLE = pythonAvailable();

/** Spawns the real Python publisher once and returns its parsed stdout JSON result. Never passes
 * the master key -- only an already-derived per-kiosk key, exactly like a provisioned kiosk.
 *
 * Uses the ASYNC `spawn`, not `spawnSync`: the Python subprocess makes a real HTTP request back to
 * this SAME Node process's server (the one `before` started), and `spawnSync` blocks Node's one
 * thread until the child exits -- which would stop the Node event loop from ever servicing that
 * incoming request, so the child would wait for a response that can never arrive while Node waits
 * for the child. (A real, first-hit deadlock during this task -- not a hypothetical: it is exactly
 * what made every test that needed a real round trip fail with NETWORK_ERROR/timeout before this
 * was switched from spawnSync to spawn.) */
function runPublisher(params) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [PUBLISH_SCRIPT], {
      env: { ...process.env, GUARDIAN_TEST_PARAMS: JSON.stringify(params) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("guardian_publish_once.py timed out")); }, 15000);
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`guardian_publish_once.py exited ${code}: ${stderr || stdout}`));
      }
      const lastLine = stdout.trim().split("\n").filter(Boolean).pop();
      try {
        resolve(JSON.parse(lastLine));
      } catch (err) {
        reject(new Error(`could not parse publisher output: ${stdout}`));
      }
    });
  });
}

let server;

before(async () => {
  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { if (!req.rawBody) req.rawBody = buf; } }));
  app.use(createGuardianHealthRouter());
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  fake.reset({ [KIOSK_REGISTRY_COLLECTION]: { [KIOSK_ID]: provisionedRecord() } });
});

function port() {
  return server.address().port;
}

describe(
  "Phase 2D end-to-end: real Python publisher -> real Node route",
  { skip: !PYTHON_AVAILABLE && "python3 not found on PATH" },
  () => {
    it("a valid Python-generated signature is accepted, and the snapshot reaches guardian_health_latest/{kioskId}", async () => {
      const result = await runPublisher({
        host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1,
      });
      assert.strictEqual(result.status, "ACCEPTED");
      assert.strictEqual(result.http_status, 202);
      const stored = fake.data(STATE_COLLECTION)[KIOSK_ID];
      assert.ok(stored, "the snapshot must have reached guardian_health_latest");
      assert.strictEqual(stored.lastAcceptedSeq, 1);
      assert.strictEqual(stored.streamId, result.stream_id);
      assert.strictEqual(stored.snapshot.kioskId, KIOSK_ID);
      assert.match(stored.bootId, /^[0-9a-f]{32}$/, "bootId must be the kernel-boot-UUID shape, not a decimal counter");
    });

    it("an identical retry (same stream/seq/body) is acknowledged without another write", async () => {
      const fixedStream = "ab".repeat(16);
      const base = { host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1, stream_id: fixedStream };
      const first = await runPublisher(base);
      assert.strictEqual(first.status, "ACCEPTED");
      const writesBefore = fake.log.writes.length;
      const second = await runPublisher(base); // a fresh process, same signed content -> an identical retry
      assert.strictEqual(second.status, "DUPLICATE");
      assert.strictEqual(fake.log.writes.length, writesBefore, "a duplicate must not write again");
    });

    it("an invalid signature (Python signs with a different kiosk's key) is rejected", async () => {
      const wrongKeyHex = deriveKioskKey(MASTER_KEY_HEX, "CD-456").toString("hex");
      const result = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: wrongKeyHex, seq: 1 });
      assert.strictEqual(result.status, "CLIENT_ERROR");
      assert.strictEqual(result.http_status, 401);
    });

    it("a conflicting sequence (same stream/seq, different body) is rejected", async () => {
      const fixedStream = "cd".repeat(16);
      const first = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1, overall: "UNKNOWN", stream_id: fixedStream });
      assert.strictEqual(first.status, "ACCEPTED");
      const second = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1, overall: "FAILING", stream_id: fixedStream });
      assert.strictEqual(second.status, "CONFLICT");
      assert.strictEqual(second.http_status, 409);
      assert.match(second.detail, /same_seq_different_body/);
    });

    it("a stale (lower) sequence in the same stream is rejected", async () => {
      const fixedStream = "ef".repeat(16);
      const first = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 5, stream_id: fixedStream });
      assert.strictEqual(first.status, "ACCEPTED");
      const second = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 3, stream_id: fixedStream });
      assert.strictEqual(second.status, "CONFLICT");
      assert.strictEqual(second.http_status, 409);
      assert.match(second.detail, /stale_seq/);
    });

    it("an invalid snapshot is rejected before ever being sent (the real Python validator catches it)", async () => {
      const writesBefore = fake.log.writes.length;
      const result = await runPublisher({
        host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1,
        overall: "NOT_A_REAL_OVERALL_VALUE",
      });
      assert.strictEqual(result.status, "CLIENT_ERROR");
      assert.strictEqual(result.http_status, null, "an invalid snapshot must never reach the network at all");
      assert.strictEqual(fake.log.writes.length, writesBefore);
    });

    it("a real network failure (nothing listening) does not crash the publisher, and a later cycle still succeeds", async () => {
      const deadPort = { host: "127.0.0.1", port: 1, kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1, connect_timeout_s: 1, max_attempts: 1 };
      const failed = await runPublisher(deadPort);
      assert.strictEqual(failed.status, "NETWORK_ERROR");
      const later = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 2 });
      assert.strictEqual(later.status, "ACCEPTED", "a prior network failure must not affect a later, independent publish");
    });

    it("an unprovisioned kiosk is rejected by the real pipeline, even with an otherwise-valid signature", async () => {
      fake.reset({}); // no guardian_kiosks record at all for KIOSK_ID
      const result = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1 });
      assert.strictEqual(result.status, "CLIENT_ERROR");
      assert.strictEqual(result.http_status, 401);
    });

    it("a revoked kiosk is rejected by the real pipeline, even with an otherwise-valid signature", async () => {
      fake.reset({ [KIOSK_REGISTRY_COLLECTION]: { [KIOSK_ID]: provisionedRecord({ status: STATUS.REVOKED }) } });
      const result = await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1 });
      assert.strictEqual(result.http_status, 403);
    });

    it("never writes to system_status, kiosk_commands or print_jobs for any outcome above", async () => {
      await runPublisher({ host: "127.0.0.1", port: port(), kiosk_id: KIOSK_ID, derived_key_hex: DERIVED_KEY_HEX, seq: 1 });
      for (const w of fake.log.writes) {
        assert.ok(
          !["system_status", "kiosk_commands", "print_jobs"].some((c) => w.path.startsWith(`${c}/`)),
          `unexpected write to ${w.path}`
        );
      }
    });
  }
);
