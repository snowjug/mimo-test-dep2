"use strict";
// Decryption of media delivered by Flow media-upload components. Evidence: Meta "Media Upload Components" page
// (read 2026-10-09): AES-256-CBC + HMAC-SHA256 + PKCS7; CDN keeps files <= 20 days; steps 1-5 below are [DOC].
// [ASSUMED] metadata field names (encrypted_hash, iv, encryption_key, hmac_key, plaintext_hash) and that all are
// base64: the page lists the concepts but this session did not retrieve a raw sample payload.
const crypto = require("crypto");

class MediaError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const MAC_LEN = 10; // [DOC] first 10 bytes of the computed HMAC are appended to the file
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest();
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

function metaBuffers(meta) {
  const need = ["encrypted_hash", "iv", "encryption_key", "hmac_key", "plaintext_hash"];
  if (!meta || typeof meta !== "object") throw new MediaError("BAD_METADATA", "encryption_metadata missing");
  const out = {};
  for (const k of need) {
    if (typeof meta[k] !== "string" || !meta[k]) throw new MediaError("BAD_METADATA", `encryption_metadata.${k} missing`);
    out[k] = Buffer.from(meta[k], "base64");
  }
  if (out.encryption_key.length !== 32) throw new MediaError("BAD_METADATA", "encryption_key must be 32 bytes");
  if (out.iv.length !== 16) throw new MediaError("BAD_METADATA", "iv must be 16 bytes");
  return out;
}

/** @returns {Buffer} verified plaintext. Throws MediaError (never returns unverified bytes). */
function decryptMedia(encrypted, meta, { maxPlainBytes }) {
  const m = metaBuffers(meta);
  if (!Buffer.isBuffer(encrypted) || encrypted.length <= MAC_LEN) throw new MediaError("TRUNCATED", "file too short");
  // CBC ciphertext is at most plaintext + 16 (padding); reject before doing any hashing work.
  if (encrypted.length - MAC_LEN > maxPlainBytes + 16) throw new MediaError("TOO_LARGE", "encrypted file exceeds limit");
  if (!eq(sha256(encrypted), m.encrypted_hash)) throw new MediaError("ENCRYPTED_HASH_MISMATCH"); // step 2
  const ciphertext = encrypted.subarray(0, encrypted.length - MAC_LEN);
  const appended = encrypted.subarray(encrypted.length - MAC_LEN);
  if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) throw new MediaError("BAD_CIPHERTEXT_LENGTH");
  const mac = crypto.createHmac("sha256", m.hmac_key).update(m.iv).update(ciphertext).digest().subarray(0, MAC_LEN);
  if (!eq(mac, appended)) throw new MediaError("HMAC_MISMATCH"); // step 3
  let plain;
  try { // step 4
    const d = crypto.createDecipheriv("aes-256-cbc", m.encryption_key, m.iv);
    plain = Buffer.concat([d.update(ciphertext), d.final()]);
  } catch { throw new MediaError("DECRYPT_FAILED"); }
  if (plain.length > maxPlainBytes) throw new MediaError("TOO_LARGE", "plaintext exceeds limit");
  if (!eq(sha256(plain), m.plaintext_hash)) throw new MediaError("PLAINTEXT_HASH_MISMATCH"); // step 5
  return plain;
}

/** Magic-byte sniffing. Office files are ZIP containers and need the (not exercised) conversion pipeline. */
function sniffKind(buf) {
  if (buf.length >= 5 && buf.subarray(0, Math.min(buf.length, 1024)).includes(Buffer.from("%PDF-"))) return "pdf";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4) return "zip-office-needs-conversion";
  return "unknown";
}

module.exports = { MediaError, decryptMedia, sniffKind, MAC_LEN };
