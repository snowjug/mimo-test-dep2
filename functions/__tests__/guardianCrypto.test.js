/**
 * Golden-vector tests for guardian/crypto.js, against the exact values computed and recorded in
 * docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md §13 (produced there by running the real
 * Python guardian.snapshot.encode_snapshot + a stdlib HKDF/HMAC implementation). If this Node
 * implementation diverges from that Python one in any byte, these fail.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  deriveKioskKey, canonicalString, sha256Hex, hmacSha256Hex, hexEqualConstantTime,
} = require("../src/guardian/crypto");

// 32 bytes (64 hex chars): the 16-byte block "00112233445566778899aabbccddeeff" written twice.
// Length is asserted programmatically wherever this is regenerated (see the contract doc's §13.1
// correction note) -- an earlier, visually-similar 31-byte fixture passed this same test (HKDF
// accepts any input-key length) but was then rejected by guardian/secret.js's format check, which
// correctly requires exactly 32 bytes for a real master key.
const MASTER_KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const KIOSK_ID = "AB-123";
const STREAM_ID = "0b7e6b8e9c1a4e3a8f0a1c2d3e4f5061";
const EXPECTED_DERIVED_KEY_HEX = "5c09573e78615ab43f49260ab55ab544ca4186229d214f0d7ab3f1eb40ef36db";

const VECTOR_A = {
  bootId: 1,
  seq: 1,
  timestamp: 1800000000,
  bodyUtf8:
    '{"agentVersion":"0.1.0-phase1","checks":[],"cycle":{"budgetExceeded":false,"budgetMs":20000,"detailsDropped":false,"durationMs":120},"diagnosis":{"cascades":[],"overall":"UNKNOWN","rootCauses":[],"unknown":[]},"kioskId":"AB-123","observedAt":"2027-01-15T12:00:00Z","schemaVersion":1,"seq":1}',
  expectedBodySha256: "257b491532cf760fde83e635557b72cf651003d7d82c6f241d5bbaca1a89cfb9",
  expectedSignature: "62f7e23d91717f29d16d1ff8e432c7ffbcc4fa6a44d8f00dfb46cafe25979630",
};

const VECTOR_B = {
  bootId: 1,
  seq: 2,
  timestamp: 1800000061,
  bodyUtf8:
    '{"agentVersion":"0.1.0-phase1","checks":[{"detail":"","durationMs":12,"evidence":["LINK_CARRIER_DOWN"],"id":"link","observedAt":"2027-01-15T12:01:00Z","plane":"connectivity","required":true,"state":"FAIL","streak":3}],"cycle":{"budgetExceeded":false,"budgetMs":20000,"detailsDropped":false,"durationMs":340},"diagnosis":{"cascades":[],"overall":"FAILING","rootCauses":[{"checks":["link"],"code":"LINK_DOWN","evidence":["LINK_CARRIER_DOWN"],"plane":"connectivity","severity":"CRITICAL"}],"unknown":[]},"kioskId":"AB-123","observedAt":"2027-01-15T12:01:00Z","schemaVersion":1,"seq":2}',
  expectedBodySha256: "8088811b0e4cba1731299c7e8fd7240afcbf45cfa427ac3a166e9dd67489133b",
  expectedSignature: "0e05a2ea3c269d7d511904cdb43fe23b699bd6fba4ecf610dbb964ce11384207",
};

describe("guardian/crypto: golden vectors from the Phase 2A contract", () => {
  it("derives the exact kiosk key via HKDF-SHA256", () => {
    const derived = deriveKioskKey(MASTER_KEY_HEX, KIOSK_ID);
    assert.strictEqual(derived.toString("hex"), EXPECTED_DERIVED_KEY_HEX);
  });

  for (const [name, vector] of [["A", VECTOR_A], ["B", VECTOR_B]]) {
    it(`reproduces vector ${name}'s body hash, canonical string and signature`, () => {
      const body = Buffer.from(vector.bodyUtf8, "utf8");
      const bodySha256Hex = sha256Hex(body);
      assert.strictEqual(bodySha256Hex, vector.expectedBodySha256);

      const canonical = canonicalString({
        method: "POST",
        path: "/kiosk/guardian/health",
        kioskId: KIOSK_ID,
        streamId: STREAM_ID,
        bootId: vector.bootId,
        seq: vector.seq,
        timestamp: vector.timestamp,
        bodySha256Hex,
      });
      const derived = deriveKioskKey(MASTER_KEY_HEX, KIOSK_ID);
      const signature = hmacSha256Hex(derived, canonical);
      assert.strictEqual(signature, vector.expectedSignature);
      assert.ok(hexEqualConstantTime(signature, vector.expectedSignature));
    });
  }

  it("a single flipped byte in the body changes the signature (tamper detection)", () => {
    const tampered = Buffer.from(VECTOR_A.bodyUtf8.replace('"seq":1', '"seq":9'), "utf8");
    const bodySha256Hex = sha256Hex(tampered);
    assert.notStrictEqual(bodySha256Hex, VECTOR_A.expectedBodySha256);
    const canonical = canonicalString({
      method: "POST", path: "/kiosk/guardian/health", kioskId: KIOSK_ID, streamId: STREAM_ID,
      bootId: VECTOR_A.bootId, seq: VECTOR_A.seq, timestamp: VECTOR_A.timestamp, bodySha256Hex,
    });
    const derived = deriveKioskKey(MASTER_KEY_HEX, KIOSK_ID);
    const signature = hmacSha256Hex(derived, canonical);
    assert.notStrictEqual(signature, VECTOR_A.expectedSignature);
  });

  it("different kiosk ids derive different keys from the same master key", () => {
    const a = deriveKioskKey(MASTER_KEY_HEX, "AB-123");
    const b = deriveKioskKey(MASTER_KEY_HEX, "CD-456");
    assert.notStrictEqual(a.toString("hex"), b.toString("hex"));
  });

  it("hexEqualConstantTime never throws on mismatched lengths", () => {
    assert.strictEqual(hexEqualConstantTime("abc", "abcdef"), false);
    assert.strictEqual(hexEqualConstantTime("", "a"), false);
    assert.strictEqual(hexEqualConstantTime(undefined, "a"), false);
  });
});
