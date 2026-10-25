/**
 * MIMO Edge Guardian — Phase 2F unit tests for guardian/registry.js.
 * Uses the in-memory fakeFirestore harness — no network, no credentials, no production access.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
require("./helpers/quiet");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();

const {
  KIOSK_REGISTRY_COLLECTION, STATUS, DEFAULT_ROTATION_GRACE_S,
  isKeyVersionPermitted, provisionKiosk, rotateKioskKey, setKioskStatus, getKioskRecord,
} = require("../src/guardian/registry");

const KIOSK_ID = "AB-123";

beforeEach(() => {
  fake.reset({});
});

describe("isKeyVersionPermitted", () => {
  it("rejects every version for an unprovisioned (null) record", () => {
    assert.strictEqual(isKeyVersionPermitted(null, 1, Date.now()), false);
  });

  it("permits the active version", () => {
    const record = { activeKeyVersion: 2, previousKeyVersion: null, previousKeyVersionExpiresAt: null };
    assert.strictEqual(isKeyVersionPermitted(record, 2, Date.now()), true);
  });

  it("permits the previous version strictly before its expiry, rejects at/after it", () => {
    const expiresAt = new Date(1_000_000);
    const record = { activeKeyVersion: 2, previousKeyVersion: 1, previousKeyVersionExpiresAt: expiresAt };
    assert.strictEqual(isKeyVersionPermitted(record, 1, 999_999), true);
    assert.strictEqual(isKeyVersionPermitted(record, 1, 1_000_000), false);
    assert.strictEqual(isKeyVersionPermitted(record, 1, 1_000_001), false);
  });

  it("rejects a version that is neither active nor previous", () => {
    const record = { activeKeyVersion: 2, previousKeyVersion: 1, previousKeyVersionExpiresAt: new Date(Date.now() + 1000) };
    assert.strictEqual(isKeyVersionPermitted(record, 99, Date.now()), false);
  });
});

describe("provisionKiosk / rotateKioskKey / setKioskStatus", () => {
  it("provisions a brand-new kiosk as ACTIVE, version 1 by default, no rotation in progress", async () => {
    const doc = await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID });
    assert.strictEqual(doc.status, STATUS.ACTIVE);
    assert.strictEqual(doc.activeKeyVersion, 1);
    assert.strictEqual(doc.previousKeyVersion, null);
    assert.strictEqual(doc.previousKeyVersionExpiresAt, null);
  });

  it("re-provisioning an existing kiosk preserves its original provisionedAt", async () => {
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID });
    const firstStored = await getKioskRecord(fake.db, KIOSK_ID); // resolved (sentinel -> real Date), unlike the raw return value
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID, activeKeyVersion: 5 });
    const secondStored = await getKioskRecord(fake.db, KIOSK_ID);
    assert.deepStrictEqual(secondStored.provisionedAt, firstStored.provisionedAt);
    assert.strictEqual(secondStored.activeKeyVersion, 5);
  });

  it("rotateKioskKey moves the current active version to previous, with a grace expiry", async () => {
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID, activeKeyVersion: 1 });
    const rotated = await rotateKioskKey(fake.db, fake.admin, { kioskId: KIOSK_ID, newVersion: 2, graceSeconds: 100, now: () => 1_000_000 });
    assert.strictEqual(rotated.activeKeyVersion, 2);
    assert.strictEqual(rotated.previousKeyVersion, 1);
    assert.strictEqual(rotated.previousKeyVersionExpiresAt.getTime(), 1_000_000 + 100_000);
  });

  it("rotateKioskKey defaults to a 24h grace window", async () => {
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID, activeKeyVersion: 1 });
    assert.strictEqual(DEFAULT_ROTATION_GRACE_S, 24 * 60 * 60);
  });

  it("rotateKioskKey throws for an unprovisioned kiosk", async () => {
    await assert.rejects(() => rotateKioskKey(fake.db, fake.admin, { kioskId: "ZZ-999", newVersion: 2 }));
  });

  it("setKioskStatus transitions ACTIVE -> DISABLED -> ACTIVE, preserving key version fields throughout", async () => {
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID, activeKeyVersion: 3 });
    const disabled = await setKioskStatus(fake.db, fake.admin, { kioskId: KIOSK_ID, status: STATUS.DISABLED });
    assert.strictEqual(disabled.status, STATUS.DISABLED);
    assert.strictEqual(disabled.activeKeyVersion, 3);
    const reactivated = await setKioskStatus(fake.db, fake.admin, { kioskId: KIOSK_ID, status: STATUS.ACTIVE });
    assert.strictEqual(reactivated.status, STATUS.ACTIVE);
    assert.strictEqual(reactivated.activeKeyVersion, 3);
  });

  it("setKioskStatus rejects an invalid status value", async () => {
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID });
    await assert.rejects(() => setKioskStatus(fake.db, fake.admin, { kioskId: KIOSK_ID, status: "NOT_A_REAL_STATUS" }));
  });

  it("setKioskStatus throws for an unprovisioned kiosk", async () => {
    await assert.rejects(() => setKioskStatus(fake.db, fake.admin, { kioskId: "ZZ-999", status: STATUS.REVOKED }));
  });

  it("getKioskRecord returns null for an unprovisioned kiosk, the record otherwise", async () => {
    assert.strictEqual(await getKioskRecord(fake.db, KIOSK_ID), null);
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID });
    assert.ok(await getKioskRecord(fake.db, KIOSK_ID));
  });
});

describe("no secret material and no out-of-scope writes", () => {
  it("a provisioned record never contains any key, secret, or signature material", async () => {
    const doc = await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID, activeKeyVersion: 1 });
    await rotateKioskKey(fake.db, fake.admin, { kioskId: KIOSK_ID, newVersion: 2 });
    const stored = fake.data(KIOSK_REGISTRY_COLLECTION)[KIOSK_ID];
    const text = JSON.stringify(stored);
    for (const forbidden of ["masterKey", "derivedKey", "signature", "hmac", "secret"]) {
      assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), `registry record must never reference ${forbidden}`);
    }
    // The record is only ever version numbers, a status string and timestamps.
    assert.deepStrictEqual(
      Object.keys(stored).sort(),
      ["activeKeyVersion", "previousKeyVersion", "previousKeyVersionExpiresAt", "provisionedAt", "status", "updatedAt"]
    );
    void doc;
  });

  it("provisioning, rotating and status changes never write to system_status, kiosk_commands, print_jobs or guardian_health_latest", async () => {
    await provisionKiosk(fake.db, fake.admin, { kioskId: KIOSK_ID });
    await rotateKioskKey(fake.db, fake.admin, { kioskId: KIOSK_ID, newVersion: 2 });
    await setKioskStatus(fake.db, fake.admin, { kioskId: KIOSK_ID, status: STATUS.REVOKED });
    await setKioskStatus(fake.db, fake.admin, { kioskId: KIOSK_ID, status: STATUS.ACTIVE });
    for (const w of fake.log.writes) {
      assert.ok(w.path.startsWith(`${KIOSK_REGISTRY_COLLECTION}/`), `unexpected write to ${w.path}`);
    }
  });
});
