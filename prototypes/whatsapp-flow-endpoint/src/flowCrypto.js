"use strict";
// WhatsApp Flows endpoint cryptography. Protocol evidence: Meta "Implementing Endpoint for Flows" page
// (data_api_version 3.0), read 2026-10-09. Each decision is tagged [DOC] (stated by Meta's page) or [ASSUMED].
const crypto = require("crypto");

class FlowDecryptionError extends Error {}

/** [DOC] X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw request body). [DOC] accept old+new secret while rotating. */
function verifySignature(rawBody, headerValue, appSecrets) {
  if (!Buffer.isBuffer(rawBody) || typeof headerValue !== "string") return false;
  const secrets = (Array.isArray(appSecrets) ? appSecrets : [appSecrets]).filter(Boolean);
  const m = /^sha256=([0-9a-f]{64})$/i.exec(headerValue.trim());
  if (!m || secrets.length === 0) return false;
  const given = Buffer.from(m[1], "hex");
  return secrets.some((s) => crypto.timingSafeEqual(crypto.createHmac("sha256", s).update(rawBody).digest(), given));
}

const b64 = (value, name) => {
  if (typeof value !== "string" || value.length === 0) throw new FlowDecryptionError(`${name} missing`);
  return Buffer.from(value, "base64");
};

/**
 * [DOC] AES key: RSA-OAEP, SHA-256 and MGF1 SHA-256, yields 128-bit key.
 * [DOC] Payload: AES-GCM with that key and initial_vector; the 16-byte auth tag is appended to the ciphertext.
 * Node's `oaepHash` sets both the OAEP digest and the MGF1 digest, which matches the documented parameters.
 * [ASSUMED] IV length 12 or 16 bytes (Meta's page does not state the length); anything else is rejected.
 */
function decryptRequest(body, privateKeyPem) {
  if (!body || typeof body !== "object") throw new FlowDecryptionError("body is not an object");
  const encKey = b64(body.encrypted_aes_key, "encrypted_aes_key");
  const data = b64(body.encrypted_flow_data, "encrypted_flow_data");
  const iv = b64(body.initial_vector, "initial_vector");
  if (iv.length !== 12 && iv.length !== 16) throw new FlowDecryptionError("bad iv length");
  if (data.length < 17) throw new FlowDecryptionError("ciphertext too short");

  let aesKey;
  try {
    aesKey = crypto.privateDecrypt(
      { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      encKey
    );
  } catch (e) {
    throw new FlowDecryptionError("rsa decrypt failed");
  }
  if (aesKey.length !== 16) throw new FlowDecryptionError("aes key is not 128-bit");

  try {
    const tag = data.subarray(data.length - 16);
    const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
    return { decryptedBody: JSON.parse(plain.toString("utf8")), aesKey, iv };
  } catch (e) {
    throw new FlowDecryptionError("aes-gcm decrypt/parse failed");
  }
}

/**
 * [DOC] Response IV = request IV with every bit flipped; same AES key; empty AAD; 16-byte tag appended to the
 * ciphertext; the whole thing base64-encoded and returned as plain text.
 */
function encryptResponse(responseObject, aesKey, requestIv) {
  const flipped = Buffer.from(requestIv.map((byte) => byte ^ 0xff));
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flipped, { authTagLength: 16 });
  const out = Buffer.concat([cipher.update(JSON.stringify(responseObject), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return out.toString("base64");
}

module.exports = { FlowDecryptionError, verifySignature, decryptRequest, encryptResponse };
