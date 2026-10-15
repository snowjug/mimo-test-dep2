"use strict";
// Per-request document pipeline: download -> verify/decrypt -> validate -> page count, with per-stage timings
// and guaranteed temp cleanup. Page counting uses the SAME call as production
// (functions/src/controllers/whatsapp.controller.js: getPDFDocument().load(buf, {ignoreEncryption:true}).getPageCount()).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");
const { decryptMedia, sniffKind, MediaError } = require("./flowMedia");

// Reuse the repository's own pdf-lib wrapper (read-only require; production code is not modified).
const functionsRequire = createRequire(path.resolve(__dirname, "../../../functions/package.json"));
const { getPDFDocument } = functionsRequire("./src/services/pdf.service.js");

const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 30,                       // [DOC] DocumentPicker max-uploaded-documents upper bound
  maxFileBytes: 25 * 1024 * 1024,     // [DOC] max-file-size-kb default/upper bound 25600
  maxTotalBytes: 150 * 1024 * 1024,   // [PROTOTYPE POLICY] memory guard for a 512MiB function; not a Meta number
  maxPagesPerFile: 500,               // [PROTOTYPE POLICY]
});

const nowMs = () => Number(process.hrtime.bigint()) / 1e6;
const timed = async (timings, key, fn) => {
  const t = nowMs();
  try { return await fn(); } finally { timings[key] = (timings[key] || 0) + (nowMs() - t); }
};

async function processOne(doc, deps, workDir, limits) {
  const timings = {};
  if (!doc || typeof doc.cdn_url !== "string") throw new MediaError("BAD_DOCUMENT", "cdn_url missing");
  const encrypted = await timed(timings, "fetchMs", () => deps.fetchCdn(doc.cdn_url));
  const plain = await timed(timings, "decryptMs", async () => decryptMedia(encrypted, doc.encryption_metadata, { maxPlainBytes: limits.maxFileBytes }));
  const kind = await timed(timings, "validateMs", async () => {
    const k = sniffKind(plain);
    if (k === "zip-office-needs-conversion") throw new MediaError("NEEDS_CONVERSION", "Office files require the conversion pipeline (not exercised in this prototype)");
    if (k === "unknown") throw new MediaError("UNSUPPORTED_TYPE");
    return k;
  });
  // Write to a per-request temp dir (mirrors the production need to persist before creating a job) so cleanup is testable.
  const file = path.join(workDir, `${Math.random().toString(36).slice(2)}.${kind}`);
  await fs.promises.writeFile(file, plain);
  let pages = 1;
  if (kind === "pdf") {
    pages = await timed(timings, "pageCountMs", async () => {
      try {
        const PDFDocument = getPDFDocument();
        return (await PDFDocument.load(plain, { ignoreEncryption: true })).getPageCount();
      } catch { throw new MediaError("PDF_UNREADABLE"); }
    });
    if (pages < 1 || pages > limits.maxPagesPerFile) throw new MediaError("PAGE_LIMIT");
  }
  return { name: String(doc.file_name || "document").slice(0, 120), kind, bytes: plain.length, pages, timings };
}

/**
 * @param {object[]} docs  Flow media array
 * @param {{fetchCdn:Function}} deps
 * @param {{concurrency?:number, limits?:object, tmpRoot?:string}} opts
 * @returns {{files:object[], errors:object[], totalPages:number, timings:object, totalMs:number}}
 * Never returns partial success as success: callers must check `errors`.
 */
async function processDocuments(docs, deps, opts = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(opts.limits || {}) };
  const t0 = nowMs();
  if (!Array.isArray(docs) || docs.length === 0) return { files: [], errors: [{ index: -1, code: "NO_FILES" }], totalPages: 0, timings: {}, totalMs: 0 };
  if (docs.length > limits.maxFiles) return { files: [], errors: [{ index: -1, code: "TOO_MANY_FILES" }], totalPages: 0, timings: {}, totalMs: nowMs() - t0 };
  const workDir = await fs.promises.mkdtemp(path.join(opts.tmpRoot || os.tmpdir(), "flowproto-"));
  const files = new Array(docs.length);
  const errors = [];
  let totalBytes = 0;
  const concurrency = Math.max(1, opts.concurrency || 1);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, docs.length) }, async () => {
      while (next < docs.length) {
        const i = next++;
        try {
          const r = await processOne(docs[i], deps, workDir, limits);
          totalBytes += r.bytes;
          if (totalBytes > limits.maxTotalBytes) throw new MediaError("TOTAL_TOO_LARGE");
          files[i] = r;
        } catch (e) {
          errors.push({ index: i, code: e.code || "INTERNAL", message: e.code ? undefined : "unexpected error" });
        }
      }
    }));
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }); // cleanup on success AND failure
  }
  const ok = files.filter(Boolean);
  const timings = {};
  for (const f of ok) for (const [k, v] of Object.entries(f.timings)) timings[k] = (timings[k] || 0) + v;
  return { files: ok, errors: errors.sort((a, b) => a.index - b.index), totalPages: ok.reduce((n, f) => n + f.pages, 0), timings, totalMs: nowMs() - t0, workDir };
}

module.exports = { processDocuments, DEFAULT_LIMITS, nowMs };
