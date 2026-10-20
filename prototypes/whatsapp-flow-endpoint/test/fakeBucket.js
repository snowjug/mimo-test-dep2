"use strict";
// Minimal in-memory stand-in for a Firebase Storage bucket, covering only the surface storageAdapter.js
// actually uses (`file(path).save/exists/download/delete`). Test-only; never touches real Storage.
const crypto = require("crypto");

function createFakeBucket({ failPaths = () => false } = {}) {
  const objects = new Map(); // storagePath -> {buffer, contentType}
  const saveCalls = [];
  const bucket = {
    name: "fake-mimo-bucket",
    file(storagePath) {
      return {
        save: async (buffer, opts = {}) => {
          saveCalls.push(storagePath);
          if (failPaths(storagePath)) throw new Error(`simulated upload failure for ${storagePath}`);
          objects.set(storagePath, { buffer: Buffer.from(buffer), contentType: opts.contentType });
        },
        exists: async () => [objects.has(storagePath)],
        download: async () => {
          const obj = objects.get(storagePath);
          if (!obj) throw new Error(`fakeBucket: no such object ${storagePath}`);
          return [obj.buffer];
        },
        delete: async () => { objects.delete(storagePath); },
      };
    },
  };
  return {
    bucket,
    saveCalls,
    objectCount: () => objects.size,
    hasObject: (p) => objects.has(p),
    objectBytes: (p) => objects.get(p)?.buffer,
    sha256Of: (p) => crypto.createHash("sha256").update(objects.get(p).buffer).digest("hex"),
  };
}

module.exports = { createFakeBucket };
