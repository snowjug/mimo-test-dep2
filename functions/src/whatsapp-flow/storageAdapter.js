"use strict";
// Mission 09: the smallest Storage adapter that persists an ALREADY VALIDATED Flow file using the existing
// website convention (functions/src/controllers/upload.controller.js: `bucket.file(name).save(buffer,
// {contentType})`, then `fileUrl = https://storage.googleapis.com/${bucket.name}/${name}`), so the existing
// print-job retrieval path (storage.service.js's `extractStoragePath`, the Pi listener's plain
// `requests.get(file_url)`) can consume it without any change on that side. This file does not call
// firebase-admin itself — it takes a `bucket` (the real `admin.storage().bucket()` or a test double) as a
// parameter, exactly like durableJobStore.js/order.service.js take `db`.
//
// TRUST BOUNDARY: this module only ever uploads bytes the CALLER has already decrypted and validated
// (worker.js, after pipeline.js's integrity checks). It never accepts a client-supplied hash or path — the
// content hash returned here is always computed from the actual bytes being uploaded, and the object path is
// always derived server-side from `jobId`/`index`/a sanitised filename, never from anything else in the
// request.
const crypto = require("crypto");

const FLOW_FILES_PREFIX = "whatsapp_flow"; // not a phone number, not a secret — flowToken is an opaque session id

function sanitizeFileName(name) {
  const base = String(name || "document").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
  return base || "document";
}

/** Deterministic, collision-safe within one job: same (jobId, index, name) always resolves to the same object. */
function storagePathFor(jobId, index, name) {
  return `${FLOW_FILES_PREFIX}/${jobId}/${index}_${sanitizeFileName(name)}`;
}

/**
 * Uploads one already-decrypted, already-validated file. Idempotent: re-running this for the same
 * (jobId, index, name) overwrites the same object with the same bytes — a retry never creates an
 * uncontrolled duplicate. Verifies the upload actually landed before returning success.
 *
 * @param {object} args
 * @param {{file:(path:string)=>{save:Function, exists:Function, delete:Function}, name:string}} args.bucket
 * @param {string} args.jobId
 * @param {number} args.index
 * @param {string} args.name
 * @param {Buffer} args.bytes - plaintext, already verified by flowMedia.js's hash/HMAC checks
 * @param {string} [args.contentType]
 * @returns {Promise<{storagePath:string, fileUrl:string, size:number, contentHash:string}>}
 */
async function uploadValidatedFile({ bucket, jobId, index, name, bytes, contentType }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error("uploadValidatedFile requires non-empty, already-validated bytes");
  }
  const storagePath = storagePathFor(jobId, index, name);
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex"); // computed HERE, from the real bytes — never trusted from elsewhere
  const file = bucket.file(storagePath);

  await file.save(bytes, { contentType: contentType || "application/octet-stream", metadata: { cacheControl: "private, max-age=0" } });

  // Explicit post-write verification: do not report success merely because `.save()` resolved without
  // throwing — confirm the object is actually there before the caller (worker.js) marks anything COMPLETED.
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Upload of ${storagePath} did not verify as present after save()`);
  }

  return {
    storagePath,
    fileUrl: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
    size: bytes.length,
    contentHash,
  };
}

/** Re-verifies (at CREATE_ORDER time, not just at upload time) that a previously-recorded object still exists. */
async function verifyStoredFileExists({ bucket, storagePath }) {
  const [exists] = await bucket.file(storagePath).exists();
  return exists;
}

module.exports = { uploadValidatedFile, verifyStoredFileExists, storagePathFor, sanitizeFileName, FLOW_FILES_PREFIX };
