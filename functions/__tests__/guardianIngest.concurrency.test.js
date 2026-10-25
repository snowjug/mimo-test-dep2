/**
 * MIMO Edge Guardian — Phase 2B concurrency tests for the replay transaction.
 *
 * Uses fakeFirestore's `strictTransactions` mode (functions/__tests__/helpers/fakeFirestore.js),
 * built specifically to exercise real abort-and-retry-on-conflict `runTransaction` races without a
 * live emulator — the same mode `paymentSuccessRace.test.js` uses for `claimRefund`. No real
 * Firestore Emulator is started by this file (none was authorized for this task).
 */
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const express = require("express");
require("./helpers/quiet");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore({}, { strictTransactions: true });
fake.install();

// 32 bytes / 64 hex chars -- see guardianCrypto.test.js's comment on this exact fixture.
const MASTER_KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.GUARDIAN_MASTER_KEY = MASTER_KEY_HEX;

const { createGuardianHealthRouter } = require("../src/routes/guardianHealth.routes");
const { deriveKioskKey, canonicalString, sha256Hex, hmacSha256Hex } = require("../src/guardian/crypto");
const { STATE_COLLECTION } = require("../src/guardian/ingest.service");
const { KIOSK_REGISTRY_COLLECTION, STATUS, provisionKiosk, rotateKioskKey, setKioskStatus, getKioskRecord } = require("../src/guardian/registry");

const KIOSK_ID = "AB-123";
const STREAM_ID = "33333333333333333333333333333333".slice(0, 32);
// Phase 2D: bootId is the kernel boot UUID shape (32 lowercase hex chars), not a decimal counter.
const BOOT_ID = "55555555555555555555555555555555".slice(0, 32);
const NOW_S = 1_800_000_000;

function provisionedRecord(overrides = {}) {
  return { status: STATUS.ACTIVE, activeKeyVersion: 1, previousKeyVersion: null, previousKeyVersionExpiresAt: null, ...overrides };
}

function makeSnapshot({ seq, durationMsTieBreaker = 0 }) {
  return {
    schemaVersion: 1,
    agentVersion: "0.1.0-phase1",
    kioskId: KIOSK_ID,
    seq,
    observedAt: "2027-01-15T12:00:00Z",
    cycle: { durationMs: durationMsTieBreaker, budgetMs: 20000, budgetExceeded: false, detailsDropped: false },
    checks: [],
    diagnosis: { overall: "UNKNOWN", rootCauses: [], cascades: [], unknown: [] },
  };
}

function sign({ kioskId, streamId, bootId, seq, timestamp, bodyBuffer, keyVersion = 1 }) {
  const derived = deriveKioskKey(MASTER_KEY_HEX, kioskId, keyVersion);
  const bodySha256Hex = sha256Hex(bodyBuffer);
  const canonical = canonicalString({ method: "POST", path: "/kiosk/guardian/health", kioskId, streamId, bootId, seq, timestamp, bodySha256Hex });
  return hmacSha256Hex(derived, canonical);
}

// One server for the whole file — see guardianIngest.test.js for why (a failing assertion must
// never leak an open listener and hang the process).
let server, baseUrl;

before(async () => {
  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { if (!req.rawBody) req.rawBody = buf; } }));
  app.use(createGuardianHealthRouter({ now: () => NOW_S * 1000 }));
  await new Promise((resolve) => {
    server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  fake.reset({ [KIOSK_REGISTRY_COLLECTION]: { [KIOSK_ID]: provisionedRecord() } });
});

async function postHealth({ bootId = BOOT_ID, seq, durationMsTieBreaker = 0, keyVersion = 1 }) {
  const snapshot = makeSnapshot({ seq, durationMsTieBreaker });
  const bodyBuffer = Buffer.from(JSON.stringify(snapshot), "utf8");
  const signature = sign({ kioskId: KIOSK_ID, streamId: STREAM_ID, bootId, seq, timestamp: NOW_S, bodyBuffer, keyVersion });
  const res = await fetch(`${baseUrl}/kiosk/guardian/health`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Guardian-Kiosk-Id": KIOSK_ID,
      "X-Guardian-Stream-Id": STREAM_ID,
      "X-Guardian-Boot-Id": bootId,
      "X-Guardian-Timestamp": String(NOW_S),
      "X-Guardian-Key-Version": String(keyVersion),
      "X-Guardian-Signature": signature,
    },
    body: bodyBuffer,
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe("POST /kiosk/guardian/health: concurrency", () => {
  it("8 concurrent submissions with strictly increasing seq: final state is the highest seq, never corrupted", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => postHealth({ seq: i + 1 })));

    for (const r of results) {
      assert.ok(
        (r.status === 202 && r.body.status === "accepted") ||
        (r.status === 409 && r.body.reason === "stale_seq"),
        `unexpected outcome: ${r.status} ${JSON.stringify(r.body)}`
      );
    }
    assert.ok(results.some((r) => r.status === 202), "at least one submission must have been accepted");

    const stored = fake.data(STATE_COLLECTION)[KIOSK_ID];
    assert.strictEqual(stored.lastAcceptedSeq, 8, "the final accepted state must be the highest seq, with no lost update");
  });

  it("8 concurrent submissions at the SAME seq with different bodies: exactly one wins, the rest conflict", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => postHealth({ seq: 1, durationMsTieBreaker: i }))
    );

    const accepted = results.filter((r) => r.status === 202 && r.body.status === "accepted");
    const conflicted = results.filter((r) => r.status === 409 && r.body.reason === "same_seq_different_body");

    assert.strictEqual(accepted.length, 1, "exactly one concurrent submission for the same seq must be accepted");
    assert.strictEqual(conflicted.length, 7, "every other concurrent submission for the same seq must conflict");

    const stored = fake.data(STATE_COLLECTION)[KIOSK_ID];
    assert.strictEqual(stored.lastAcceptedSeq, 1);
  });

  it("a concurrent revocation cannot be bypassed by a stale authorization read, and prior telemetry survives it", async () => {
    // First, a legitimately accepted snapshot, so there is real history to check survives.
    const first = await postHealth({ seq: 1 });
    assert.strictEqual(first.status, 202);
    const beforeRace = fake.data(STATE_COLLECTION)[KIOSK_ID];

    // Now race several ingestion attempts against a revocation, all at once.
    const results = await Promise.all([
      postHealth({ seq: 2 }),
      postHealth({ seq: 3 }),
      postHealth({ seq: 4 }),
      setKioskStatus(fake.db, fake.admin, { kioskId: KIOSK_ID, status: STATUS.REVOKED }),
      postHealth({ seq: 5 }),
      postHealth({ seq: 6 }),
    ]);
    const httpResults = results.filter((r) => r && typeof r.status === "number");
    for (const r of httpResults) {
      assert.ok([202, 403].includes(r.status), `unexpected status during the race: ${r.status} ${JSON.stringify(r.body)}`);
    }

    // Whatever the race outcome, revocation must be durably in effect afterwards -- no stale read
    // from the race can have left the kiosk able to ingest.
    const after = await postHealth({ seq: 999 });
    assert.strictEqual(after.status, 403);
    assert.strictEqual(after.body.reason, "kiosk_revoked");

    // The pre-race accepted telemetry must still be exactly there: revocation must never erase
    // guardian_health_latest history (requirement 8).
    const finalState = fake.data(STATE_COLLECTION)[KIOSK_ID];
    assert.ok(finalState, "prior telemetry must still exist after revocation");
    assert.notStrictEqual(finalState.lastAcceptedSeq, 999, "the post-revocation attempt must never have been written");
    assert.ok(
      finalState.lastAcceptedSeq === beforeRace.lastAcceptedSeq || finalState.lastAcceptedSeq > beforeRace.lastAcceptedSeq,
      "telemetry only ever moves forward from what was there before the race, never erased or rolled back"
    );
  });

  it("concurrent provisioning operations (rotate + revoke + re-provision) never corrupt the registry record", async () => {
    await provisionKiosk(fake.db, fake.admin, { kioskId: "CD-456", activeKeyVersion: 1 });

    await Promise.all([
      rotateKioskKey(fake.db, fake.admin, { kioskId: "CD-456", newVersion: 2, graceSeconds: 3600, now: () => NOW_S * 1000 }),
      setKioskStatus(fake.db, fake.admin, { kioskId: "CD-456", status: STATUS.DISABLED }),
      provisionKiosk(fake.db, fake.admin, { kioskId: "CD-456", activeKeyVersion: 3 }),
      rotateKioskKey(fake.db, fake.admin, { kioskId: "CD-456", newVersion: 4, graceSeconds: 3600, now: () => NOW_S * 1000 }).catch(() => null),
    ]);

    const finalRecord = await getKioskRecord(fake.db, "CD-456");
    assert.ok(finalRecord, "the record must still exist after the race");
    // Whichever operation "won," the record must be a single, complete, well-formed document --
    // never a torn mix of two writes (each mutation replaces the whole document inside its own
    // transaction, so fakeFirestore's strictTransactions mode guarantees this structurally).
    assert.ok(Object.values(STATUS).includes(finalRecord.status));
    assert.ok(Number.isInteger(finalRecord.activeKeyVersion) && finalRecord.activeKeyVersion >= 1);
    assert.ok("previousKeyVersion" in finalRecord);
    assert.ok("previousKeyVersionExpiresAt" in finalRecord);
    assert.ok("provisionedAt" in finalRecord);
    assert.ok("updatedAt" in finalRecord);
  });
});
