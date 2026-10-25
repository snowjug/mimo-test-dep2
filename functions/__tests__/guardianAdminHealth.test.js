/**
 * MIMO Edge Guardian — Phase 2E tests for GET /admin/guardian/health.
 * Uses the in-memory fakeFirestore harness, not a real Firestore/Firebase project — no network,
 * no credentials, no production access. Authenticates through the REAL, unmodified
 * adminAuthMiddleware (a real signed JWT), not a bypass.
 */
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
require("./helpers/quiet");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install(); // must happen before any src/ module is required

process.env.JWT_SECRET = "guardian-admin-health-test-secret-32chars"; // >= 32 chars, see src/config/env.js

const { createGuardianAdminHealthRouter } = require("../src/routes/guardianAdminHealth.routes");
const { STATE_COLLECTION } = require("../src/guardian/ingest.service");
const { getSecretKey } = require("../src/config/env");

const ADMIN_TOKEN = jwt.sign({ isAdmin: true, role: "admin", email: "admin@test" }, getSecretKey(), { expiresIn: "1h" });
const FINANCE_TOKEN = jwt.sign({ isAdmin: false, role: "finance", email: "finance@test" }, getSecretKey(), { expiresIn: "1h" });

const NOW_MS = 1_800_000_000_000; // fixed "now" the running server reads on every request
const nowFn = () => NOW_MS;

function makeSnapshot({ seq = 1, overall = "HEALTHY", rootCauses = [], checks = [] } = {}) {
  return {
    schemaVersion: 1, agentVersion: "0.1.0-phase1", kioskId: "AB-123", seq,
    observedAt: "2027-01-15T12:00:00Z",
    cycle: { durationMs: 10, budgetMs: 20000, budgetExceeded: false, detailsDropped: false },
    checks, diagnosis: { overall, rootCauses, cascades: [], unknown: [] },
  };
}

/** A minimal guardian_health_latest document, as the real ingestion route would write it
 * (see ingest.service.js) -- `ageSeconds` lets each test place it precisely relative to NOW_MS. */
function stateDoc({ kioskId = "AB-123", ageSeconds = 0, seq = 1, overall = "HEALTHY", streamId = "11".repeat(16),
                    rootCauses = [], checks = [], extra = {} } = {}) {
  return {
    snapshot: makeSnapshot({ seq, overall, rootCauses, checks }),
    streamId,
    bootId: "22".repeat(16),
    lastAcceptedSeq: seq,
    lastAcceptedTimestamp: Math.floor(NOW_MS / 1000) - ageSeconds,
    bodySha256OfLastAccepted: "33".repeat(32),
    serverReceivedAt: new Date(NOW_MS - ageSeconds * 1000),
    schemaVersion: 1,
    ...extra,
  };
}

let server, baseUrl;

before(async () => {
  const app = express();
  app.use(createGuardianAdminHealthRouter({ now: nowFn }));
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  fake.reset({});
});

async function getHealth(query = "", token = ADMIN_TOKEN) {
  const headers = {};
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/admin/guardian/health${query}`, { headers });
  const body = await res.json();
  return { status: res.status, body };
}

describe("GET /admin/guardian/health", () => {
  it("rejects unauthorized access (no token)", async () => {
    const { status } = await getHealth("", null);
    assert.strictEqual(status, 401);
  });

  it("rejects unauthorized access (malformed token)", async () => {
    const { status } = await getHealth("", "not-a-real-token");
    assert.strictEqual(status, 401);
  });

  it("rejects a non-admin (finance) token", async () => {
    const { status } = await getHealth("", FINANCE_TOKEN);
    assert.strictEqual(status, 403);
  });

  it("allows authorized admin access", async () => {
    fake.reset({ [STATE_COLLECTION]: { "AB-123": stateDoc({ ageSeconds: 0 }) } });
    const { status, body } = await getHealth();
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.kiosks));
  });

  it("returns an all-kiosk summary, sorted by kioskId", async () => {
    fake.reset({
      [STATE_COLLECTION]: {
        "CD-456": stateDoc({ kioskId: "CD-456", ageSeconds: 10, overall: "FAILING" }),
        "AB-123": stateDoc({ kioskId: "AB-123", ageSeconds: 5, overall: "HEALTHY" }),
      },
    });
    const { status, body } = await getHealth();
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body.kiosks.map((k) => k.kioskId), ["AB-123", "CD-456"]);
    assert.strictEqual(body.kiosks[0].overall, "HEALTHY");
    assert.strictEqual(body.kiosks[0].freshness, "FRESH");
    assert.strictEqual(body.kiosks[1].overall, "FAILING");
    // Summary rows never include the full snapshot or any replay bookkeeping.
    assert.strictEqual(body.kiosks[0].snapshot, undefined);
    assert.strictEqual(body.kiosks[0].bodySha256OfLastAccepted, undefined);
  });

  it("filters to a single kiosk with ?kioskId=", async () => {
    fake.reset({
      [STATE_COLLECTION]: {
        "AB-123": stateDoc({ kioskId: "AB-123", ageSeconds: 1 }),
        "CD-456": stateDoc({ kioskId: "CD-456", ageSeconds: 1 }),
      },
    });
    const { status, body } = await getHealth("?kioskId=AB-123");
    assert.strictEqual(status, 200);
    assert.strictEqual(body.kioskId, "AB-123");
    assert.strictEqual(Array.isArray(body.kiosks), false);
  });

  it("detail=1 includes the full snapshot and bootId; without it, they are absent", async () => {
    fake.reset({ [STATE_COLLECTION]: { "AB-123": stateDoc({ ageSeconds: 1, seq: 42 }) } });

    const plain = await getHealth("?kioskId=AB-123");
    assert.strictEqual(plain.body.snapshot, undefined);
    assert.strictEqual(plain.body.bootId, undefined);

    const detailed = await getHealth("?kioskId=AB-123&detail=1");
    assert.strictEqual(detailed.status, 200);
    assert.strictEqual(detailed.body.snapshot.seq, 42);
    assert.strictEqual(detailed.body.bootId, "22".repeat(16));
  });

  it("reports NO_TELEMETRY for a kiosk that has never reported (no document at all)", async () => {
    const { status, body } = await getHealth("?kioskId=ZZ-999");
    assert.strictEqual(status, 200);
    assert.strictEqual(body.kioskId, "ZZ-999");
    assert.strictEqual(body.freshness, "NO_TELEMETRY");
    assert.strictEqual(body.ageSeconds, null);
    assert.strictEqual(body.overall, null);
  });

  describe("topRootCause (Phase 2.4)", () => {
    it("is null when there is no root cause", async () => {
      fake.reset({ [STATE_COLLECTION]: { "AB-123": stateDoc({ overall: "HEALTHY" }) } });
      const { body } = await getHealth("?kioskId=AB-123");
      assert.strictEqual(body.topRootCause, null);
    });

    it("is null when there is no snapshot at all (never-reported kiosk)", async () => {
      const { body } = await getHealth("?kioskId=ZZ-999");
      assert.strictEqual(body.topRootCause, null);
    });

    it("surfaces the highest-severity root cause with the explaining check's detail", async () => {
      fake.reset({
        [STATE_COLLECTION]: {
          "AB-123": stateDoc({
            overall: "FAILING",
            rootCauses: [
              { code: "CUPS_FAILURE", plane: "services", severity: "CRITICAL", checks: ["cups_scheduler"], evidence: ["CUPS_SCHEDULER_STOPPED"] },
            ],
            checks: [
              { id: "cups_scheduler", plane: "services", required: true, state: "FAIL", observedAt: "2027-01-15T12:00:00Z",
                durationMs: 5, evidence: ["CUPS_SCHEDULER_STOPPED"], detail: "Scheduler shutdown abnormally.", streak: 3 },
            ],
          }),
        },
      });
      const { body } = await getHealth("?kioskId=AB-123");
      assert.deepStrictEqual(body.topRootCause, {
        code: "CUPS_FAILURE", severity: "CRITICAL", detail: "Scheduler shutdown abnormally.",
      });
    });

    it("falls back to a null detail when no matching check carries one", async () => {
      fake.reset({
        [STATE_COLLECTION]: {
          "AB-123": stateDoc({
            overall: "FAILING",
            rootCauses: [{ code: "LINK_DOWN", plane: "connectivity", severity: "CRITICAL", checks: ["link"], evidence: ["LINK_NO_CARRIER"] }],
            checks: [{ id: "link", plane: "connectivity", required: true, state: "FAIL", observedAt: "2027-01-15T12:00:00Z",
                       durationMs: 5, evidence: ["LINK_NO_CARRIER"], detail: "", streak: 3 }],
          }),
        },
      });
      const { body } = await getHealth("?kioskId=AB-123");
      assert.deepStrictEqual(body.topRootCause, { code: "LINK_DOWN", severity: "CRITICAL", detail: null });
    });

    it("also appears in the all-kiosks summary rows", async () => {
      fake.reset({
        [STATE_COLLECTION]: {
          "AB-123": stateDoc({
            overall: "DEGRADED",
            rootCauses: [{ code: "DISK_LOW", plane: "resources", severity: "WARNING", checks: ["disk"], evidence: ["DISK_USAGE_HIGH"] }],
            checks: [{ id: "disk", plane: "resources", required: false, state: "FAIL", observedAt: "2027-01-15T12:00:00Z",
                       durationMs: 5, evidence: ["DISK_USAGE_HIGH"], detail: "92% used.", streak: 3 }],
          }),
        },
      });
      const { body } = await getHealth();
      assert.deepStrictEqual(body.kiosks[0].topRootCause, { code: "DISK_LOW", severity: "WARNING", detail: "92% used." });
    });
  });

  describe("freshness boundary conditions", () => {
    const cases = [
      { ageSeconds: 0, expect: "FRESH" },
      { ageSeconds: 180, expect: "FRESH" },
      { ageSeconds: 181, expect: "STALE" },
      { ageSeconds: 900, expect: "STALE" },
      { ageSeconds: 901, expect: "NO_TELEMETRY" },
      { ageSeconds: 10000, expect: "NO_TELEMETRY" },
    ];
    for (const { ageSeconds, expect } of cases) {
      it(`age ${ageSeconds}s -> ${expect}`, async () => {
        fake.reset({ [STATE_COLLECTION]: { "AB-123": stateDoc({ ageSeconds }) } });
        const { body } = await getHealth("?kioskId=AB-123");
        assert.strictEqual(body.freshness, expect);
        assert.strictEqual(body.ageSeconds, ageSeconds);
      });
    }
  });

  it("rejects a malformed kioskId", async () => {
    const { status } = await getHealth("?kioskId=not-a-kiosk-id");
    assert.strictEqual(status, 400);
  });

  it("rejects a malformed detail value", async () => {
    fake.reset({ [STATE_COLLECTION]: { "AB-123": stateDoc({}) } });
    const { status } = await getHealth("?kioskId=AB-123&detail=yes");
    assert.strictEqual(status, 400);
  });

  it("rejects detail=1 without a kioskId", async () => {
    const { status } = await getHealth("?detail=1");
    assert.strictEqual(status, 400);
  });

  it("never returns master keys, derived keys, signatures or other credential-shaped fields", async () => {
    // Defense in depth: even if a stray field somehow ended up on the stored document, the route's
    // bounded response shape must not pass it through. No such field is ever actually written by
    // the real ingestion route (ingest.service.js) -- this proves the response schema itself is an
    // allowlist, not a blind passthrough of whatever is in Firestore.
    fake.reset({
      [STATE_COLLECTION]: {
        "AB-123": stateDoc({
          extra: { derivedKeyHex: "deadbeef".repeat(8), masterKey: "shouldneverappear", signature: "feedface".repeat(8) },
        }),
      },
    });
    const all = await getHealth();
    const single = await getHealth("?kioskId=AB-123&detail=1");
    for (const body of [all.body, single.body]) {
      const text = JSON.stringify(body);
      assert.ok(!text.includes("deadbeef"), "derived-key-shaped value leaked");
      assert.ok(!text.includes("shouldneverappear"), "master key leaked");
      assert.ok(!text.includes("feedface"), "signature-shaped value leaked");
    }
  });

  it("never writes to system_status, kiosk_commands, print_jobs, or anything else — this route is read-only", async () => {
    fake.reset({ [STATE_COLLECTION]: { "AB-123": stateDoc({}) } });
    const writesBefore = fake.log.writes.length;
    await getHealth();
    await getHealth("?kioskId=AB-123");
    await getHealth("?kioskId=AB-123&detail=1");
    await getHealth("?kioskId=ZZ-999"); // missing-record path too
    assert.strictEqual(fake.log.writes.length, writesBefore, "GET /admin/guardian/health must never write anything");
  });
});
