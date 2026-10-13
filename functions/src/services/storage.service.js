// ================= CLOUD STORAGE LIFECYCLE PRIMITIVES =================
// Everything that touches customer files in Cloud Storage goes through this module so that the rules are written once:
//
//   * only objects under an approved CUSTOMER prefix can ever be deleted (never templates/, profiles/, screensaver/ ...);
//   * a deletion has exactly one of three confirmed outcomes: "deleted", "missing" (404) or "failed" (anything else);
//   * Firestore markers (`fileDeleted`) are set only when every non-protected object is deleted or verified missing;
//   * an object another active job still needs is never deleted.
//
// See docs/deployment/STORAGE_CLEANUP.md for the policies built on top of these primitives.

const RETENTION_MS = 24 * 60 * 60 * 1000;

// Prefixes that hold CUSTOMER content and may be cleaned. `uploads/` = browser uploads (and WhatsApp intake),
// `converted/` = Office -> PDF output of the converter service, `files/` = PDFs generated from the text editor.
const CUSTOMER_PREFIXES = ["uploads/", "converted/", "files/"];

// A print job in one of these states still needs its files (or might become payable / printable).
const ACTIVE_REFERENCE_STATUSES = ["pending", "paid", "printing", "pending_conversion", "processing"];

function getBucketSpellings(bucketName) {
  if (!bucketName || typeof bucketName !== "string") return [];
  const list = [bucketName];
  if (bucketName.endsWith(".firebasestorage.app")) {
    list.push(bucketName.replace(/\.firebasestorage\.app$/, ".appspot.com"));
  } else if (bucketName.endsWith(".appspot.com")) {
    list.push(bucketName.replace(/\.appspot\.com$/, ".firebasestorage.app"));
  }
  return list;
}

/** Normalises any supported URL / path form to a relative object path, or null when it is not an object of this bucket. */
function extractStoragePath(fileUrl, bucketName, { mode = "strict" } = {}) {
  if (!fileUrl || typeof fileUrl !== "string") return null;

  const allowedBuckets = mode === "reference" ? getBucketSpellings(bucketName) : (bucketName ? [bucketName] : []);

  if (fileUrl.startsWith("gs://")) {
    for (const b of allowedBuckets) {
      const prefix = `gs://${b}/`;
      if (fileUrl.startsWith(prefix)) return fileUrl.slice(prefix.length);
    }
    return null;
  }

  if (fileUrl.includes("firebasestorage.googleapis.com")) {
    try {
      const urlObj = new URL(fileUrl);
      // /v0/b/<bucket>/o/<encoded path>
      const m = urlObj.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (m) {
        if (allowedBuckets.length && !allowedBuckets.includes(m[1])) return null;
        return decodeURIComponent(m[2]);
      }
      const pathParts = urlObj.pathname.split("/o/");
      if (pathParts.length > 1 && mode === "reference") return decodeURIComponent(pathParts[1].split("?")[0]);
    } catch (_) {}
    return null;
  }

  if (fileUrl.includes("storage.googleapis.com")) {
    try {
      const urlObj = new URL(fileUrl);
      const pathname = decodeURIComponent(urlObj.pathname);
      for (const b of allowedBuckets) {
        const prefix = `/${b}/`;
        if (pathname.startsWith(prefix)) return pathname.slice(prefix.length);
      }
      return null;
    } catch (_) {}
    return null;
  }

  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  return null;
}

/** Shared immutable templates and other system assets (blank sheets, graph paper). Never customer files. */
function isProtectedTemplate(storagePath) {
  if (!storagePath || typeof storagePath !== "string") return false;
  const lower = storagePath.toLowerCase().trim();
  return lower.startsWith("templates/") ||
         lower.includes("templates/blank_a4.pdf") ||
         lower.includes("templates/mimo_graph.pdf");
}

/**
 * Decides whether a normalised path may ever be deleted by the cleanup code.
 * Returns { ok: true } or { ok: false, reason } with reason "protected" | "invalid" | "outside_customer_prefix".
 */
function validateCustomerPath(storagePath) {
  if (!storagePath || typeof storagePath !== "string") return { ok: false, reason: "invalid" };
  if (isProtectedTemplate(storagePath)) return { ok: false, reason: "protected" };
  if (storagePath.includes("\0") || storagePath.includes("\\") || storagePath.startsWith("/")) return { ok: false, reason: "invalid" };
  if (storagePath.split("/").some((seg) => seg === ".." || seg === ".")) return { ok: false, reason: "invalid" };
  if (!CUSTOMER_PREFIXES.some((p) => storagePath.startsWith(p))) return { ok: false, reason: "outside_customer_prefix" };
  if (storagePath.endsWith("/")) return { ok: false, reason: "invalid" };
  return { ok: true };
}

/** Every raw reference to a Storage object found on a print job document (untransformed, de-duplicated). */
function collectRawReferences(data) {
  const refs = new Set();
  const add = (v) => { if (v && typeof v === "string") refs.add(v); };
  if (!data || typeof data !== "object") return [];
  add(data.fileUrl); add(data.originalFileUrl); add(data.originalUrl); add(data.convertedStoragePath);
  add(data.documentUrl);
  if (Array.isArray(data.files)) {
    for (const f of data.files) {
      if (!f || typeof f !== "object") continue;
      add(f.url); add(f.originalFileUrl); add(f.originalUrl); add(f.convertedStoragePath);
    }
  }
  return [...refs];
}

/** Normalised, de-duplicated object paths referenced by a job (any prefix; callers validate before deleting). */
function discoverStoragePaths(data, bucketName, { mode = "reference" } = {}) {
  const paths = new Set();
  for (const raw of collectRawReferences(data)) {
    const p = extractStoragePath(raw, bucketName, { mode });
    if (p) paths.add(p);
  }
  return Array.from(paths);
}

const toMillis = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Legacy helper kept for callers/tests: job-level timestamp fallbacks (NOT used as the upload-age authority any more). */
function getRetentionStartTime(data) {
  if (data.retentionStartAt) {
    const ms = toMillis(data.retentionStartAt);
    if (ms !== null) return new Date(ms);
  }
  for (const fb of [data.codeCreatedAt, data.paymentTime, data.uploadedAt, data.createdAt]) {
    const ms = toMillis(fb);
    if (ms !== null) return new Date(ms);
  }
  return null;
}

// ----------------------------- reference index -----------------------------

/**
 * One bounded read of every print job that still needs its files, indexed by object path.
 * One query per status (equality + snapshot pagination = Firestore's default order, no composite index needed).
 * Returns { byPath: Map<path, Set<jobId>>, complete, jobs }. `complete: false` means the safety cap was hit; callers MUST
 * then refuse to delete anything on the strength of this index.
 */
async function loadActiveReferenceIndex(db, bucketName, { statuses = ACTIVE_REFERENCE_STATUSES, pageSize = 500, maxDocs = 20000, excludeStatuses = [] } = {}) {
  const byPath = new Map();
  let jobs = 0;
  let complete = true;
  const addJob = (id, data) => {
    for (const p of discoverStoragePaths(data, bucketName, { mode: "reference" })) {
      if (!byPath.has(p)) byPath.set(p, new Set());
      byPath.get(p).add(id);
    }
  };
  for (const status of statuses) {
    if (excludeStatuses.includes(status)) continue;
    let lastDoc = null;
    for (;;) {
      let q = db.collection("print_jobs").where("status", "==", status).limit(pageSize);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      for (const doc of snap.docs) {
        const data = doc.data();
        jobs += 1;
        if (data && data.fileDeleted === true) continue;
        addJob(doc.id, data);
      }
      if (snap.docs.length < pageSize) break;
      lastDoc = snap.docs[snap.docs.length - 1];
      if (jobs >= maxDocs) { complete = false; break; }
    }
    if (!complete) break;
  }
  return { byPath, complete, jobs, addJob };
}

/** Adds jobs created/updated after `sinceMs` (closes the upload -> finalize race for a delete batch that is about to run). */
async function addRecentReferences(db, bucketName, index, sinceMs) {
  const since = new Date(sinceMs);
  let added = 0;
  for (const field of ["uploadedAt", "createdAt", "updatedAt"]) {
    const snap = await db.collection("print_jobs").where(field, ">=", since).limit(500).get();
    if (snap.docs.length >= 500) {
      // Limit capped: cannot prove complete coverage of all recent references
      index.complete = false;
    }
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data || data.fileDeleted === true) continue;
      if (!ACTIVE_REFERENCE_STATUSES.includes(data.status)) continue;
      index.addJob(doc.id, data);
      added += 1;
    }
  }
  return added;
}

const isReferencedByOther = (index, path, excludeJobId) => {
  const ids = index.byPath.get(path);
  if (!ids) return false;
  for (const id of ids) if (id !== excludeJobId) return true;
  return false;
};

/** Backwards-compatible single-path check (scans active jobs). Prefer loadActiveReferenceIndex for more than one path. */
async function isStoragePathReferencedByOtherActiveJob(db, filePath, excludeJobId, _userId, bucketName) {
  const index = await loadActiveReferenceIndex(db, bucketName);
  if (!index.complete) return true; // cannot prove it is unreferenced -> treat as referenced
  return isReferencedByOther(index, filePath, excludeJobId);
}

// ----------------------------- deletion -----------------------------

const isNotFound = (err) => !!err && (err.code === 404 || err.code === "404" || err.status === 404 || /No such object|Not Found/i.test(String(err.message || "")));
const isPreconditionFailed = (err) => !!err && (err.code === 412 || err.code === "412" || err.status === 412 || /precondition/i.test(String(err.message || "")));
const safeMessage = (err) => String((err && err.message) || err || "unknown error").replace(/https?:\/\/\S+/g, "<url>").slice(0, 200);

/** Deletes one object. Never throws. outcome: "deleted" | "missing" | "changed" | "failed". */
async function deleteObject(bucket, path, { generation } = {}) {
  try {
    const opts = {};
    if (generation !== undefined && generation !== null) {
      opts.ifGenerationMatch = generation;
    }
    await bucket.file(path).delete(opts);
    return { path, outcome: "deleted" };
  } catch (err) {
    if (isNotFound(err)) return { path, outcome: "missing" };
    if (isPreconditionFailed(err)) return { path, outcome: "changed", error: safeMessage(err) };
    return { path, outcome: "failed", error: safeMessage(err) };
  }
}

/** Reads the real upload time of an object. outcome: "ok" (timeCreatedMs, generation) | "missing" | "failed". */
async function readObjectAge(bucket, path) {
  try {
    const [meta] = await bucket.file(path).getMetadata();
    const ms = meta && meta.timeCreated ? new Date(meta.timeCreated).getTime() : NaN;
    if (!Number.isFinite(ms)) return { path, outcome: "unknown_age" };
    const generation = meta && meta.generation !== undefined ? meta.generation : null;
    return { path, outcome: "ok", timeCreatedMs: ms, generation };
  } catch (err) {
    if (isNotFound(err)) return { path, outcome: "missing" };
    return { path, outcome: "failed", error: safeMessage(err) };
  }
}

/**
 * Cleans every customer object of one job.
 *
 *   mode "immediate"   delete now (confirmed successful print, user removal)
 *   mode "age"         delete an object only when its real GCS upload time is >= retentionMs old
 *
 * Returns { objects: [{ path, outcome }], complete, removedSomething, hasUnmanaged, retryAfterMs, counts, referencesFound } where
 *   outcome: deleted | missing | protected | unmanaged_prefix | rejected | referenced | too_young | unknown_age | changed | failed
 *   complete: all customer objects are deleted or verified missing (or protected system template)
 */
async function cleanupJobObjects({ db, bucket, jobId, data, mode = "immediate", nowMs = Date.now(), retentionMs = RETENTION_MS, index = null, referenceCheck = true }) {
  const bucketName = bucket.name;
  const paths = discoverStoragePaths(data, bucketName, { mode: "strict" });
  // refs that did not resolve to an object path of this bucket (foreign bucket / malformed) are "rejected", never deleted
  const rawCount = collectRawReferences(data).length;
  const objects = [];
  let retryAfterMs = null;
  const wait = (ms) => { retryAfterMs = retryAfterMs === null ? ms : Math.min(retryAfterMs, ms); };

  const candidates = [];
  for (const p of paths) {
    const v = validateCustomerPath(p);
    if (!v.ok) {
      if (v.reason === "protected") {
        objects.push({ path: p, outcome: "protected", reason: v.reason });
      } else if (v.reason === "outside_customer_prefix") {
        objects.push({ path: p, outcome: "unmanaged_prefix", reason: v.reason });
      } else {
        objects.push({ path: p, outcome: "rejected", reason: v.reason });
      }
      continue;
    }
    candidates.push(p);
  }

  if (referenceCheck && candidates.length && !index) {
    index = await loadActiveReferenceIndex(db, bucketName);
  }

  for (const p of candidates) {
    if (referenceCheck && index) {
      if (!index.complete || isReferencedByOther(index, p, jobId)) {
        objects.push({ path: p, outcome: "referenced" });
        wait(60 * 60 * 1000);
        continue;
      }
    }
    let generation = null;
    if (mode === "age") {
      const age = await readObjectAge(bucket, p);
      if (age.outcome === "missing") { objects.push({ path: p, outcome: "missing" }); continue; }
      if (age.outcome === "failed") { objects.push({ path: p, outcome: "failed", error: age.error }); wait(15 * 60 * 1000); continue; }
      if (age.outcome === "unknown_age") { objects.push({ path: p, outcome: "unknown_age" }); wait(6 * 60 * 60 * 1000); continue; }
      const dueMs = age.timeCreatedMs + retentionMs - nowMs;
      if (dueMs > 0) { objects.push({ path: p, outcome: "too_young" }); wait(dueMs); continue; }
      generation = age.generation;
    }
    const del = await deleteObject(bucket, p, { generation });
    objects.push(del);
    if (del.outcome === "changed") {
      wait(15 * 60 * 1000); // Leave object eligible for future safe check
    } else if (del.outcome === "failed") {
      wait(15 * 60 * 1000);
    }
  }

  const counts = {};
  for (const o of objects) counts[o.outcome] = (counts[o.outcome] || 0) + 1;
  const terminal = new Set(["deleted", "missing", "protected"]);
  const hasUnmanaged = objects.some((o) => o.outcome === "unmanaged_prefix");
  const complete = !hasUnmanaged && objects.every((o) => terminal.has(o.outcome));
  const removedSomething = objects.some((o) => o.outcome === "deleted" || o.outcome === "missing");
  return { objects, complete, removedSomething, hasUnmanaged, retryAfterMs, counts, referencesFound: rawCount };
}

/**
 * Firestore update that records the REAL result of cleanupJobObjects. `fileDeleted: true` only when the job is complete
 * AND at least one object was deleted/verified missing. Never touches status / payment / print fields.
 */
function buildCleanupUpdate(result, { FieldValue, nowMs = Date.now(), attemptsSoFar = 0 }) {
  const update = {
    cleanupLastAttemptAt: new Date(nowMs),
    cleanupAttempts: attemptsSoFar + 1,
  };
  const failed = result.objects.find((o) => o.outcome === "failed");
  if (result.hasUnmanaged) {
    update.cleanupState = "unmanaged_objects";
    const remaining = result.objects.filter((o) => !["deleted", "missing", "protected"].includes(o.outcome));
    update.cleanupRemaining = remaining.slice(0, 50).map((o) => `${o.outcome}:${o.path}`);
    update.cleanupError = "Job references objects outside approved customer prefixes";
    update.cleanupNextAttemptAt = new Date(nowMs + 24 * 60 * 60 * 1000);
  } else if (result.complete) {
    update.cleanupState = result.removedSomething ? "completed" : "no_customer_objects";
    update.cleanupNextAttemptAt = FieldValue.delete();
    update.cleanupError = FieldValue.delete();
    update.cleanupRemaining = FieldValue.delete();
    if (result.removedSomething) {
      update.fileDeleted = true;
      update.fileDeletedAt = FieldValue.serverTimestamp();
    }
  } else {
    update.cleanupState = failed ? "failed" : "partial";
    const remaining = result.objects.filter((o) => !["deleted", "missing", "protected"].includes(o.outcome));
    update.cleanupRemaining = remaining.slice(0, 50).map((o) => `${o.outcome}:${o.path}`);
    if (failed) update.cleanupError = failed.error || "storage deletion failed"; else update.cleanupError = FieldValue.delete();
    const delay = Math.max(60 * 1000, Math.min(result.retryAfterMs || 60 * 60 * 1000, 24 * 60 * 60 * 1000));
    // failed deletes back off exponentially with the attempt count
    const backoff = failed ? Math.min(delay * 2 ** Math.min(attemptsSoFar, 4), 6 * 60 * 60 * 1000) : delay;
    update.cleanupNextAttemptAt = new Date(nowMs + backoff);
  }
  return update;
}

module.exports = {
  RETENTION_MS,
  CUSTOMER_PREFIXES,
  ACTIVE_REFERENCE_STATUSES,
  extractStoragePath,
  isProtectedTemplate,
  validateCustomerPath,
  collectRawReferences,
  discoverStoragePaths,
  getRetentionStartTime,
  loadActiveReferenceIndex,
  addRecentReferences,
  isReferencedByOther,
  isStoragePathReferencedByOtherActiveJob,
  isNotFound,
  deleteObject,
  readObjectAge,
  cleanupJobObjects,
  buildCleanupUpdate,
  toMillis,
  getBucketSpellings,
};
