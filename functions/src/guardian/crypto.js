/**
 * MIMO Edge Guardian — Phase 2B signing primitives.
 *
 * Implements exactly the scheme frozen in docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md
 * §2–3: HKDF-SHA256 per-kiosk key derivation from one master secret, a fixed canonical signing
 * string, and HMAC-SHA256 over it. The constant-time comparison mirrors the one already in
 * production use for INTERNAL_WEBHOOK_SECRET (src/routes/kiosk.routes.js's secretsMatch): both
 * sides are hashed to a fixed 32-byte digest first, so a length mismatch can never throw or
 * short-circuit the comparison early.
 *
 * Stdlib `crypto` only — no new dependency.
 */
const crypto = require("crypto");

const HKDF_INFO = Buffer.from("mimo-guardian-v1", "ascii");
const DERIVED_KEY_LEN = 32;

/** RFC 5869 HKDF-SHA256 (extract-then-expand), implemented over node:crypto's HMAC since Node's
 * built-in crypto.hkdfSync produces a KeyObject-shaped buffer but is otherwise equivalent; this
 * explicit implementation keeps the derivation auditable byte-for-byte against the Python side. */
function hkdfSha256(masterKey, salt, info, length = DERIVED_KEY_LEN) {
  const prk = crypto.createHmac("sha256", salt).update(masterKey).digest();
  let t = Buffer.alloc(0);
  let okm = Buffer.alloc(0);
  let counter = 1;
  while (okm.length < length) {
    t = crypto.createHmac("sha256", prk).update(Buffer.concat([t, info, Buffer.from([counter])])).digest();
    okm = Buffer.concat([okm, t]);
    counter += 1;
  }
  return okm.subarray(0, length);
}

/** Phase 2F key versioning: version 1 uses the original, unsuffixed HKDF info string byte-for-byte
 * (so every existing golden vector and test from Phase 2A-2E, computed before versioning existed,
 * stays valid with no regeneration) — version >= 2 gets a distinct `info` by suffixing it, so
 * rotating a kiosk's key version deterministically produces a different derived key from the SAME
 * master key, with no additional per-kiosk secret state stored anywhere (guardian/registry.js
 * stores only which version number is current/permitted, never a key). */
function infoForKeyVersion(keyVersion) {
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new RangeError(`keyVersion must be a positive integer, got ${keyVersion}`);
  }
  return keyVersion === 1 ? HKDF_INFO : Buffer.concat([HKDF_INFO, Buffer.from(`:kv${keyVersion}`, "ascii")]);
}

/** Derives one kiosk's signing key from the master secret, for a specific key version (default 1,
 * identical to the pre-Phase-2F, unversioned derivation). `masterKeyHex` is the raw hex-encoded
 * master secret (see guardian/secret.js); `kioskId` is used as the HKDF salt, exactly as specified
 * in the contract (§3.2) — no additional per-kiosk state needs to be stored or leaked. */
function deriveKioskKey(masterKeyHex, kioskId, keyVersion = 1) {
  const masterKey = Buffer.from(masterKeyHex, "hex");
  const salt = Buffer.from(kioskId, "ascii");
  return hkdfSha256(masterKey, salt, infoForKeyVersion(keyVersion));
}

/** The exact canonical signing string from the contract (§2.2), ASCII bytes, \n-joined:
 *   METHOD "\n" PATH "\n" KIOSK_ID "\n" STREAM_ID "\n" BOOT_ID "\n" SEQ "\n" TIMESTAMP "\n" BODY_SHA256_HEX */
function canonicalString({ method, path, kioskId, streamId, bootId, seq, timestamp, bodySha256Hex }) {
  return Buffer.from(
    [method, path, kioskId, streamId, String(bootId), String(seq), String(timestamp), bodySha256Hex].join("\n"),
    "ascii"
  );
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hmacSha256Hex(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

/** Constant-time comparison of two (hex) strings: both are hashed to a fixed 32-byte digest first
 * so a length mismatch (missing header, wrong-length signature) can never throw or short-circuit. */
function hexEqualConstantTime(a, b) {
  const ha = crypto.createHash("sha256").update(String(a || "")).digest();
  const hb = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = {
  HKDF_INFO,
  DERIVED_KEY_LEN,
  hkdfSha256,
  deriveKioskKey,
  infoForKeyVersion,
  canonicalString,
  sha256Hex,
  hmacSha256Hex,
  hexEqualConstantTime,
};
