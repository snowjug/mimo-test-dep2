const Busboy = require("busboy");
const { v4: uuidv4 } = require("uuid");
const { admin } = require("../config/firebase");

// Same pattern already proven in user.controller.js's postUploadProfilePhoto: the Cloud Functions
// runtime consumes the request stream before Express sees it and exposes the bytes as req.rawBody,
// so multer cannot read multipart bodies here -- busboy parses req.rawBody instead.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Parses one multipart/form-data file field from a Cloud Functions request. Resolves null if the
 * request isn't multipart or the field wasn't present; rejects with {status:413} if over the size cap. */
function parseMultipartFile(req, fieldName) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data") || !req.rawBody) return resolve(null);
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_BYTES } });
    let file = null;
    let tooLarge = false;
    bb.on("file", (field, stream, info) => {
      if (field !== fieldName) return stream.resume();
      const chunks = [];
      stream.on("data", (d) => chunks.push(d));
      stream.on("limit", () => { tooLarge = true; });
      stream.on("end", () => {
        file = { buffer: Buffer.concat(chunks), filename: info.filename || fieldName, mimeType: info.mimeType };
      });
    });
    bb.on("error", reject);
    bb.on("close", () => {
      if (tooLarge) return reject(Object.assign(new Error("File too large"), { status: 413 }));
      resolve(file);
    });
    bb.end(req.rawBody);
  });
}

/** Like parseMultipartFile, but also captures ordinary text fields (e.g. a chat message's text
 * alongside its optional image attachment, in one multipart request). `file` is null if fieldName
 * wasn't present -- a pure-text submission is valid and expected to omit the file entirely. */
function parseMultipartForm(req, fileFieldName) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data") || !req.rawBody) return resolve(null);
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_BYTES } });
    const fields = {};
    let file = null;
    let tooLarge = false;
    bb.on("field", (name, value) => { fields[name] = value; });
    bb.on("file", (field, stream, info) => {
      if (field !== fileFieldName) return stream.resume();
      const chunks = [];
      stream.on("data", (d) => chunks.push(d));
      stream.on("limit", () => { tooLarge = true; });
      stream.on("end", () => {
        file = { buffer: Buffer.concat(chunks), filename: info.filename || fileFieldName, mimeType: info.mimeType };
      });
    });
    bb.on("error", reject);
    bb.on("close", () => {
      if (tooLarge) return reject(Object.assign(new Error("File too large"), { status: 413 }));
      resolve({ fields, file });
    });
    bb.end(req.rawBody);
  });
}

/** Uploads a buffer under Storage path `${pathPrefix}/${ownerId}_${Date.now()}_${safeName}` and
 * returns a Firebase download-token URL (no IAM signing permission needed, unlike a signed URL). */
async function uploadBufferToStorage(pathPrefix, ownerId, file) {
  const safeFileName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${pathPrefix}/${ownerId}_${Date.now()}_${safeFileName}`;
  const bucket = admin.storage().bucket();
  const token = uuidv4();
  await bucket.file(fileName).save(file.buffer, {
    contentType: file.mimeType,
    metadata: {
      cacheControl: "public, max-age=86400",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${token}`;
}

module.exports = { parseMultipartFile, parseMultipartForm, uploadBufferToStorage, MAX_FILE_BYTES };
