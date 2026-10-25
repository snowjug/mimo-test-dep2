/**
 * MIMO Edge Guardian — Phase 2B ingestion route tests (POST /kiosk/guardian/health).
 * Uses the in-memory fakeFirestore harness (functions/__tests__/helpers/fakeFirestore.js), not a
 * real Firestore/Firebase project — no network, no credentials, no production access.
 */
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const express = require("express");
require("./helpers/quiet");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install(); // must happen before any src/ module is required

// 32 bytes / 64 hex chars -- see guardianCrypto.test.js's comment on this exact fixture.
const MASTER_KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.GUARDIAN_MASTER_KEY = MASTER_KEY_HEX;

const { createGuardianHealthRouter } = require("../src/routes/guardianHealth.routes");
const { deriveKioskKey, canonicalString, sha256Hex, hmacSha256Hex } = require("../src/guardian/crypto");
const { STATE_COLLECTION } = require("../src/guardian/ingest.service");
const { KIOSK_REGISTRY_COLLECTION, STATUS } = require("../src/guardian/registry");

const KIOSK_ID = "AB-123";
const STREAM_1 = "11111111111111111111111111111111".slice(0, 32);
const STREAM_2 = "22222222222222222222222222222222".slice(0, 32);
// Phase 2D: bootId is the kernel boot UUID shape (32 lowercase hex chars), not a decimal counter.
const BOOT_1 = "33333333333333333333333333333333".slice(0, 32);
const BOOT_2 = "44444444444444444444444444444444".slice(0, 32);

let FAKE_NOW_S = 1_800_000_000; // mutable "now" (unix seconds) the running server reads on every request
const nowFn = () => FAKE_NOW_S * 1000;

function makeSnapshot({ seq, kioskId = KIOSK_ID, overall = "UNKNOWN" } = {}) {
  return {
    schemaVersion: 1,
    agentVersion: "0.1.0-phase1",
    kioskId,
    seq,
    observedAt: "2027-01-15T12:00:00Z",
    cycle: { durationMs: 10, budgetMs: 20000, budgetExceeded: false, detailsDropped: false },
    checks: [],
    diagnosis: { overall, rootCauses: [], cascades: [], unknown: [] },
  };
}

function sign({ kioskId, streamId, bootId, seq, timestamp, bodyBuffer, masterKeyHex = MASTER_KEY_HEX, keyVersion = 1 }) {
  const derived = deriveKioskKey(masterKeyHex, kioskId, keyVersion);
  const bodySha256Hex = sha256Hex(bodyBuffer);
  const canonical = canonicalString({
    method: "POST", path: "/kiosk/guardian/health", kioskId, streamId, bootId, seq, timestamp, bodySha256Hex,
  });
  return hmacSha256Hex(derived, canonical);
}

/** The default Phase 2F provisioning record `beforeEach` seeds for KIOSK_ID: active, version 1, no
 * rotation in progress. Individual tests override via a second fake.reset() call. */
function provisionedRecord(overrides = {}) {
  return {
    status: STATUS.ACTIVE,
    activeKeyVersion: 1,
    previousKeyVersion: null,
    previousKeyVersionExpiresAt: null,
    ...overrides,
  };
}

// One server for the whole file (started in `before`, closed in `after`) so a failing assertion in
// one test can never leak an open listener that hangs the process — each test only resets the fake
// Firestore store, never the HTTP server itself.
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { if (!req.rawBody) req.rawBody = buf; } }));
  app.use(createGuardianHealthRouter({ now: nowFn }));
  await new Promise((resolve) => {
    server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  fake.reset({ [KIOSK_REGISTRY_COLLECTION]: { [KIOSK_ID]: provisionedRecord() } });
  FAKE_NOW_S = 1_800_000_000;
});

/** Sends a POST, defaulting every header to a valid, correctly-signed request; any field can be
 * overridden to construct a specific negative/edge case. Returns the fetch Response. */
async function postHealth({
  kioskId = KIOSK_ID, streamId = STREAM_1, bootId = BOOT_1, seq = 1, timestamp = FAKE_NOW_S,
  overall = "UNKNOWN", bodyOverride = null, signatureOverride = null, headerKioskId = null,
  contentType = "application/json", masterKeyHex = MASTER_KEY_HEX, keyVersion = 1, keyVersionHeaderOverride = null,
} = {}) {
  const snapshot = makeSnapshot({ seq, kioskId, overall });
  const bodyBuffer = bodyOverride !== null ? Buffer.from(bodyOverride, "utf8") : Buffer.from(JSON.stringify(snapshot), "utf8");
  const signature = signatureOverride !== null
    ? signatureOverride
    : sign({ kioskId: headerKioskId || kioskId, streamId, bootId, seq, timestamp, bodyBuffer, masterKeyHex, keyVersion });

  return fetch(`${baseUrl}/kiosk/guardian/health`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-Guardian-Kiosk-Id": headerKioskId || kioskId,
      "X-Guardian-Stream-Id": streamId,
      "X-Guardian-Boot-Id": bootId,
      "X-Guardian-Timestamp": String(timestamp),
      "X-Guardian-Key-Version": keyVersionHeaderOverride !== null ? keyVersionHeaderOverride : String(keyVersion),
      "X-Guardian-Signature": signature,
    },
    body: bodyBuffer,
  });
}

describe("POST /kiosk/guardian/health", () => {
  it("accepts the first valid submission for a never-seen kiosk", async () => {
    const res = await postHealth({ seq: 1 });
    assert.strictEqual(res.status, 202);
    assert.deepStrictEqual(await res.json(), { status: "accepted" });
    const stored = fake.data(STATE_COLLECTION)[KIOSK_ID];
    assert.strictEqual(stored.lastAcceptedSeq, 1);
    assert.strictEqual(stored.streamId, STREAM_1);
  });

  it("accepts an increasing seq in the same stream", async () => {
    await postHealth({ seq: 1 });
    const res = await postHealth({ seq: 2 });
    assert.strictEqual(res.status, 202);
    assert.strictEqual(fake.data(STATE_COLLECTION)[KIOSK_ID].lastAcceptedSeq, 2);
  });

  it("tolerates a gap in seq within the same stream (a skipped publish is not a conflict)", async () => {
    await postHealth({ seq: 1 });
    const res = await postHealth({ seq: 5 });
    assert.strictEqual(res.status, 202);
    assert.strictEqual(fake.data(STATE_COLLECTION)[KIOSK_ID].lastAcceptedSeq, 5);
  });

  it("acknowledges an exact duplicate retry idempotently, with no new write", async () => {
    await postHealth({ seq: 1 });
    const before_ = JSON.stringify(fake.data(STATE_COLLECTION)[KIOSK_ID]);
    const writesBefore = fake.log.writes.length;
    const res = await postHealth({ seq: 1 }); // identical kioskId/stream/seq/body
    assert.strictEqual(res.status, 202);
    assert.deepStrictEqual(await res.json(), { status: "duplicate" });
    assert.strictEqual(fake.log.writes.length, writesBefore, "a duplicate must not write again");
    assert.strictEqual(JSON.stringify(fake.data(STATE_COLLECTION)[KIOSK_ID]), before_);
  });

  it("rejects the same stream+seq with a different payload as a conflict", async () => {
    await postHealth({ seq: 1, overall: "UNKNOWN" });
    const res = await postHealth({ seq: 1, overall: "FAILING" }); // same seq/stream, different body
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).reason, "same_seq_different_body");
  });

  it("rejects a lower seq than already accepted in the same stream", async () => {
    await postHealth({ seq: 5 });
    const res = await postHealth({ seq: 3 });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).reason, "stale_seq");
    assert.strictEqual(fake.data(STATE_COLLECTION)[KIOSK_ID].lastAcceptedSeq, 5, "the newer accepted state must survive");
  });

  it("accepts a new stream when its timestamp is after the last accepted timestamp (a real restart)", async () => {
    await postHealth({ streamId: STREAM_1, bootId: BOOT_1, seq: 7, timestamp: FAKE_NOW_S });
    const res = await postHealth({ streamId: STREAM_2, bootId: BOOT_2, seq: 1, timestamp: FAKE_NOW_S + 5 });
    assert.strictEqual(res.status, 202);
    const stored = fake.data(STATE_COLLECTION)[KIOSK_ID];
    assert.strictEqual(stored.streamId, STREAM_2);
    assert.strictEqual(stored.lastAcceptedSeq, 1);
    assert.strictEqual(stored.lastAcceptedTimestamp, FAKE_NOW_S + 5);
  });

  it("a new stream is accepted (or rejected) independently of bootId's numeric/lexicographic value", async () => {
    // BOOT_2 < BOOT_1 is false lexicographically here on purpose -- flip it: use a "smaller-looking"
    // bootId for the later, legitimate restart to prove bootId ordering is not what gates this.
    await postHealth({ streamId: STREAM_1, bootId: BOOT_2, seq: 7, timestamp: FAKE_NOW_S });
    const res = await postHealth({ streamId: STREAM_2, bootId: BOOT_1, seq: 1, timestamp: FAKE_NOW_S + 5 });
    assert.strictEqual(res.status, 202, "a numerically/lexicographically SMALLER bootId must still be accepted if its timestamp is newer");
  });

  it("rejects a new stream whose timestamp is not after the last accepted timestamp (replay of an old boot)", async () => {
    await postHealth({ streamId: STREAM_1, bootId: BOOT_1, seq: 7, timestamp: FAKE_NOW_S });
    // A different stream AND a different (even a "larger") bootId no longer matters -- only the
    // timestamp ordering does.
    const res = await postHealth({ streamId: STREAM_2, bootId: BOOT_2, seq: 1, timestamp: FAKE_NOW_S });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).reason, "stale_or_replayed_stream");
    const stored = fake.data(STATE_COLLECTION)[KIOSK_ID];
    assert.strictEqual(stored.streamId, STREAM_1, "the rejected stream must never become the accepted state");
  });

  it("tolerates a modest clock skew on a cross-stream restart, as long as it is within the freshness window", async () => {
    // The kiosk's clock is a little behind (-100s), then a restart happens with the clock still
    // a little behind but having moved forward relative to its own last accepted request -- both
    // requests are within the stale/future window independently, and the second's timestamp is
    // after the first's, so the restart must be accepted.
    await postHealth({ streamId: STREAM_1, bootId: BOOT_1, seq: 1, timestamp: FAKE_NOW_S - 100 });
    const res = await postHealth({ streamId: STREAM_2, bootId: BOOT_2, seq: 1, timestamp: FAKE_NOW_S - 90 });
    assert.strictEqual(res.status, 202);
  });

  it("rejects an invalid signature", async () => {
    const res = await postHealth({ signatureOverride: "0".repeat(64) });
    assert.strictEqual(res.status, 401);
  });

  it("rejects a tampered body that no longer matches the signature", async () => {
    const snapshot = makeSnapshot({ seq: 1 });
    const bodyBuffer = Buffer.from(JSON.stringify(snapshot), "utf8");
    const signature = sign({ kioskId: KIOSK_ID, streamId: STREAM_1, bootId: BOOT_1, seq: 1, timestamp: FAKE_NOW_S, bodyBuffer });
    const tamperedBody = Buffer.from(JSON.stringify(makeSnapshot({ seq: 1, overall: "FAILING" })), "utf8");
    const res = await fetch(`${baseUrl}/kiosk/guardian/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guardian-Kiosk-Id": KIOSK_ID,
        "X-Guardian-Stream-Id": STREAM_1,
        "X-Guardian-Boot-Id": BOOT_1,
        "X-Guardian-Timestamp": String(FAKE_NOW_S),
        "X-Guardian-Key-Version": "1",
        "X-Guardian-Signature": signature, // valid for the ORIGINAL body, not this one
      },
      body: tamperedBody,
    });
    assert.strictEqual(res.status, 401);
  });

  it("rejects a kioskId mismatch between header and body", async () => {
    const res = await postHealth({ kioskId: "CD-456", headerKioskId: "AB-123" });
    assert.strictEqual(res.status, 400);
  });

  it("rejects malformed JSON before any crypto or Firestore work", async () => {
    const writesBefore = fake.log.writes.length;
    const res = await fetch(`${baseUrl}/kiosk/guardian/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guardian-Kiosk-Id": KIOSK_ID,
        "X-Guardian-Stream-Id": STREAM_1,
        "X-Guardian-Boot-Id": BOOT_1,
        "X-Guardian-Timestamp": String(FAKE_NOW_S),
        "X-Guardian-Key-Version": "1",
        "X-Guardian-Signature": "a".repeat(64),
      },
      body: "{not valid json",
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(fake.log.writes.length, writesBefore);
  });

  it("rejects a body over the 8192-byte limit", async () => {
    const res = await postHealth({ bodyOverride: JSON.stringify({ pad: "x".repeat(8300) }) });
    assert.strictEqual(res.status, 413);
  });

  it("rejects a request missing a required Guardian header", async () => {
    const snapshot = makeSnapshot({ seq: 1 });
    const bodyBuffer = Buffer.from(JSON.stringify(snapshot), "utf8");
    const res = await fetch(`${baseUrl}/kiosk/guardian/health`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guardian-Kiosk-Id": KIOSK_ID,
        "X-Guardian-Stream-Id": STREAM_1,
        "X-Guardian-Boot-Id": BOOT_1,
        // X-Guardian-Timestamp intentionally omitted
        "X-Guardian-Key-Version": "1",
        "X-Guardian-Signature": "a".repeat(64),
      },
      body: bodyBuffer,
    });
    assert.strictEqual(res.status, 400);
  });

  it("rejects a schema-invalid snapshot body", async () => {
    const res = await postHealth({ bodyOverride: JSON.stringify({ schemaVersion: 1, extra: "nope" }) });
    assert.strictEqual(res.status, 400);
  });

  it("rejects a stale timestamp", async () => {
    const res = await postHealth({ timestamp: FAKE_NOW_S - 301 });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).reason, "stale_timestamp");
  });

  it("rejects a future timestamp beyond the allowed skew", async () => {
    const res = await postHealth({ timestamp: FAKE_NOW_S + 31 });
    assert.strictEqual(res.status, 409);
    assert.strictEqual((await res.json()).reason, "timestamp_in_future");
  });

  it("rejects a revoked kiosk even with an otherwise-valid signature", async () => {
    fake.reset({ [KIOSK_REGISTRY_COLLECTION]: { [KIOSK_ID]: provisionedRecord({ status: STATUS.REVOKED }) } });
    const res = await postHealth({ seq: 1 });
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await res.json()).reason, "kiosk_revoked");
  });

  it("rejects a disabled kiosk even with an otherwise-valid signature", async () => {
    fake.reset({ [KIOSK_REGISTRY_COLLECTION]: { [KIOSK_ID]: provisionedRecord({ status: STATUS.DISABLED }) } });
    const res = await postHealth({ seq: 1 });
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await res.json()).reason, "kiosk_disabled");
  });

  it("rejects a kiosk that was never provisioned at all (format-valid kioskId is not authorization)", async () => {
    fake.reset({}); // no guardian_kiosks record for KIOSK_ID
    const res = await postHealth({ seq: 1 });
    assert.strictEqual(res.status, 401);
  });

  it("rejects an unsupported key version", async () => {
    // Provisioned and ACTIVE, but signed with a version the registry does not recognise at all.
    const res = await postHealth({ seq: 1, keyVersion: 7 });
    assert.strictEqual(res.status, 401);
    assert.strictEqual((await res.json()).reason, "unsupported_key_version");
  });

  it("accepts the previous key version during its rotation grace window, and the new version too", async () => {
    fake.reset({
      [KIOSK_REGISTRY_COLLECTION]: {
        [KIOSK_ID]: provisionedRecord({
          activeKeyVersion: 2, previousKeyVersion: 1, previousKeyVersionExpiresAt: new Date((FAKE_NOW_S + 3600) * 1000),
        }),
      },
    });
    const withOldVersion = await postHealth({ seq: 1, keyVersion: 1 });
    assert.strictEqual(withOldVersion.status, 202);
    const withNewVersion = await postHealth({ seq: 2, keyVersion: 2 });
    assert.strictEqual(withNewVersion.status, 202);
  });

  it("rejects the previous key version once its rotation grace window has expired", async () => {
    fake.reset({
      [KIOSK_REGISTRY_COLLECTION]: {
        [KIOSK_ID]: provisionedRecord({
          activeKeyVersion: 2, previousKeyVersion: 1, previousKeyVersionExpiresAt: new Date((FAKE_NOW_S - 1) * 1000),
        }),
      },
    });
    const res = await postHealth({ seq: 1, keyVersion: 1 });
    assert.strictEqual(res.status, 401);
    assert.strictEqual((await res.json()).reason, "unsupported_key_version");
  });

  it("fails safe with 503 when GUARDIAN_MASTER_KEY is not configured, without crashing", async () => {
    const original = process.env.GUARDIAN_MASTER_KEY;
    delete process.env.GUARDIAN_MASTER_KEY;
    try {
      const res = await postHealth({ seq: 1 });
      assert.strictEqual(res.status, 503);
    } finally {
      process.env.GUARDIAN_MASTER_KEY = original;
    }
  });

  it("never writes to system_status, kiosk_commands or print_jobs for any outcome above", async () => {
    await postHealth({ seq: 1 });
    await postHealth({ seq: 1 }); // duplicate
    await postHealth({ seq: 0 }); // stale
    fake.reset({ [KIOSK_REGISTRY_COLLECTION]: { [KIOSK_ID]: provisionedRecord({ status: STATUS.REVOKED }) } });
    await postHealth({ seq: 1 }); // revoked
    for (const w of fake.log.writes) {
      assert.ok(
        !["system_status", "kiosk_commands", "print_jobs"].some((c) => w.path.startsWith(`${c}/`)),
        `unexpected write to ${w.path}`
      );
    }
  });
});
