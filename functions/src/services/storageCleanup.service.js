// ================= STORAGE CLEANUP POLICIES =================
// Two scheduled passes built on the primitives in storage.service.js. Both are plain async functions (dependencies and the
// clock are injected) so they can be unit tested without Firebase.
//
//   Policy A  a job that the Pi/backend reports as successfully printed -> delete all its customer files now
//   Policy B  everything else      -> delete an object 24 h after its real Cloud Storage upload time (GCS timeCreated)
//   Exception a PAID job that has not printed is never touched by age-based cleanup, and neither are jobs that are
//             printing / converting / processing. Cleanup never changes payment, refund or print-code state.
//
//   runJobRetentionPass      resumable sweep over print_jobs (cursor = last fully handled document id)
//   runOrphanStoragePass     resumable sweep over the customer prefixes of the bucket (cursor = last object name)

const {
  RETENTION_MS,
  CUSTOMER_PREFIXES,
  validateCustomerPath,
  loadActiveReferenceIndex,
  addRecentReferences,
  isReferencedByOther,
  cleanupJobObjects,
  buildCleanupUpdate,
  deleteObject,
  toMillis,
} = require("./storage.service");

const STATE_COLLECTION = "system_state";
const JOBS_STATE_DOC = "storage_cleanup_jobs";
const ORPHAN_STATE_DOC = "storage_cleanup_orphans";

const PRESERVE_STATUSES = new Set(["printing", "pending_conversion", "processing"]);
const SUCCESS_STATUSES = new Set(["completed", "printed"]);
const ACTIVE_PRINT_GRACE_MS = 30 * 60 * 1000;
const LEASE_MS = 12 * 60 * 1000;
const RECENT_REFERENCE_WINDOW_MS = 10 * 60 * 1000;
const CHECKOUT_PROTECTION_MS = 6 * 60 * 60 * 1000;

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const defaults = (env = process.env) => ({
  retentionMs: num(env.STORAGE_RETENTION_MS, RETENTION_MS),
  jobPageSize: num(env.RETENTION_PAGE_SIZE, 300),
  jobMaxScanned: num(env.RETENTION_MAX_DOCS_PER_RUN, 1500),
  jobMaxCleaned: num(env.RETENTION_MAX_JOBS_PER_RUN, 150),
  orphanPageSize: num(env.ORPHAN_PAGE_SIZE, 250),
  orphanMaxScanned: num(env.ORPHAN_MAX_OBJECTS_PER_RUN, 1000),
  deleteConcurrency: num(env.STORAGE_DELETE_CONCURRENCY, 4),
  timeBudgetMs: num(env.STORAGE_CLEANUP_TIME_BUDGET_MS, 240000),
  // "delete" actually removes objects; anything else is a dry run that only counts what it WOULD delete.
  orphanMode: String(env.ORPHAN_CLEANUP_MODE || "dry-run").toLowerCase() === "delete" ? "delete" : "dry-run",
});

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

// ----------------------------- run lease + cursor -----------------------------

async function acquireLease(db, docId, { nowMs, runId, leaseMs = LEASE_MS }) {
  const ref = db.collection(STATE_COLLECTION).doc(docId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : {};
    if (cur.leaseUntilMs && cur.leaseUntilMs > nowMs) return { acquired: false, state: cur };
    tx.set(ref, { leaseUntilMs: nowMs + leaseMs, leaseRunId: runId, leaseStartedMs: nowMs }, { merge: true });
    return { acquired: true, state: cur };
  });
}
async function releaseLease(db, docId, runId, extra = {}) {
  const ref = db.collection(STATE_COLLECTION).doc(docId);
  const snap = await ref.get();
  const cur = snap.exists ? snap.data() : {};
  if (cur.leaseRunId && cur.leaseRunId !== runId) return; // another run took over; do not release its lease
  await ref.set({ leaseUntilMs: 0, ...extra }, { merge: true });
}
const saveState = (db, docId, patch) => db.collection(STATE_COLLECTION).doc(docId).set(patch, { merge: true });

// ----------------------------- job policy -----------------------------

/**
 * Pure policy decision for one print job document.
 * -> { action: "skip", reason } | { action: "cleanup", mode: "immediate" | "age", reason }
 */
function classifyJob(data, nowMs) {
  if (!data || typeof data !== "object") return { action: "skip", reason: "no_data" };
  if (data.fileDeleted === true) return { action: "skip", reason: "already_deleted" };
  if (data.cleanupState === "no_customer_objects") return { action: "skip", reason: "no_customer_objects" };
  if (data.cleanupState === "unmanaged_objects") return { action: "skip", reason: "unmanaged_objects" };
  if (PRESERVE_STATUSES.has(data.status)) return { action: "skip", reason: "active" };
  if (data.status === "paid") return { action: "skip", reason: "paid_unprinted" };
  const printStarted = toMillis(data.printStartedAt);
  if (printStarted !== null && nowMs - printStarted < ACTIVE_PRINT_GRACE_MS) return { action: "skip", reason: "recent_print" };
  const next = toMillis(data.cleanupNextAttemptAt);
  if (next !== null && next > nowMs) return { action: "skip", reason: "backoff" };
  if (SUCCESS_STATUSES.has(data.status)) return { action: "cleanup", mode: "immediate", reason: "printed" };
  if (data.removedByUser === true) return { action: "cleanup", mode: "immediate", reason: "removed_by_user" };
  return { action: "cleanup", mode: "age", reason: "unprinted" };
}

/**
 * Atomically re-reads and claims a job document before touching Storage files.
 * Protects against payment/cleanup races and checkout concurrency.
 */
async function claimJobForCleanup({ db, ref, jobId, mode, nowMs }) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { claimed: false, reason: "not_found" };
    const cur = snap.data();
    const decision = classifyJob(cur, nowMs);
    if (decision.action === "skip") {
      return { claimed: false, reason: decision.reason, data: cur };
    }
    // Checkout window protection for pending jobs with active checkout orders:
    if (cur.status === "pending" && cur.orderId) {
      const orderTime = toMillis(cur.orderCreatedAt) ||
        toMillis(cur.updatedAt) ||
        toMillis(cur.createdAt) ||
        toMillis(cur.retentionStartAt) || 0;
      if (orderTime === 0 || nowMs - orderTime < CHECKOUT_PROTECTION_MS) {
        return { claimed: false, reason: "active_checkout", data: cur };
      }
    }
    // Atomically claim the document for this cleanup pass
    const claimUpdate = {
      cleanupState: "claiming",
      cleanupClaimedAt: new Date(nowMs),
      cleanupLeaseExpiresAt: new Date(nowMs + LEASE_MS),
    };
    tx.update(ref, claimUpdate);
    return { claimed: true, mode: decision.mode, data: { ...cur, ...claimUpdate } };
  });
}

/** Applies cleanupJobObjects to a job and writes the truthful result concurrency-safely. */
async function cleanJobDocument({ db, admin, bucket, ref, jobId, data, mode, nowMs, retentionMs, index, extraOnComplete = {} }) {
  const FieldValue = admin.firestore.FieldValue;
  const claim = await claimJobForCleanup({ db, ref, jobId, mode, nowMs });
  if (!claim.claimed) {
    return { complete: false, skipped: true, reason: claim.reason, objects: [], data: claim.data || data };
  }
  const result = await cleanupJobObjects({ db, bucket, jobId, data: claim.data || data, mode: claim.mode || mode, nowMs, retentionMs, index });

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return;
    const current = fresh.data();
    const update = buildCleanupUpdate(result, { FieldValue, nowMs, attemptsSoFar: Number(current.cleanupAttempts || (claim.data && claim.data.cleanupAttempts) || 0) });

    const isProtectedOrPaid = PRESERVE_STATUSES.has(current.status) ||
      SUCCESS_STATUSES.has(current.status) ||
      current.status === "paid" ||
      !!current.printCode ||
      !!current.paymentTime;

    if (result.complete && result.removedSomething && current.status === "pending" && !isProtectedOrPaid) {
      // An unpaid cart item whose file is gone can never be paid for
      update.status = "abandoned";
      update.abandonedAt = FieldValue.serverTimestamp();
    }
    if (result.complete) Object.assign(update, extraOnComplete);
    tx.update(ref, update);
  });

  return result;
}

const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

/**
 * One bounded, resumable pass over print_jobs. Safe to call repeatedly: each call continues from the persisted cursor,
 * which only advances past documents that were fully handled, so an interrupted run never skips an eligible job and
 * already-cleaned documents cost nothing but a skipped read (they cannot starve unprocessed ones).
 */
async function runJobRetentionPass({ db, admin, bucket, nowMs = Date.now(), log = console, config = defaults(), clock = () => Date.now(), runId = `run_${nowMs}` }) {
  const counters = { scanned: 0, cleaned: 0, partial: 0, failed: 0, skipped: {}, objects: {}, wrapped: false, aborted: null };
  const lease = await acquireLease(db, JOBS_STATE_DOC, { nowMs, runId });
  if (!lease.acquired) { counters.aborted = "lease_held"; log.log(`[RETENTION] skipped: another run holds the lease`); return counters; }
  const startMs = clock();
  let cursor = lease.state.jobCursor || null;
  try {
    const index = await loadActiveReferenceIndex(db, bucket.name);
    if (!index.complete) { counters.aborted = "reference_index_incomplete"; log.error("[RETENTION] reference index incomplete; deleting nothing this run"); return counters; }
    const indexLoadedMs = clock();

    outer:
    for (;;) {
      let q = db.collection("print_jobs").orderBy("__name__").limit(config.jobPageSize);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) { counters.wrapped = true; cursor = null; break; }
      // jobs created while this run was scanning must be visible to the reference check
      await addRecentReferences(db, bucket.name, index, indexLoadedMs - RECENT_REFERENCE_WINDOW_MS);

      for (const doc of snap.docs) {
        if (counters.scanned >= config.jobMaxScanned || counters.cleaned + counters.partial + counters.failed >= config.jobMaxCleaned || clock() - startMs > config.timeBudgetMs) break outer;
        counters.scanned += 1;
        let data = doc.data();
        let decision = classifyJob(data, nowMs);
        if (decision.action === "skip") { bump(counters.skipped, decision.reason); cursor = doc.id; continue; }

        // re-read right before touching Storage: the job may have started printing / been paid in the meantime
        const fresh = await doc.ref.get();
        if (!fresh.exists) { bump(counters.skipped, "vanished"); cursor = doc.id; continue; }
        data = fresh.data();
        decision = classifyJob(data, nowMs);
        if (decision.action === "skip") { bump(counters.skipped, decision.reason); cursor = doc.id; continue; }

        let result;
        try {
          result = await cleanJobDocument({ db, admin, bucket, ref: doc.ref, jobId: doc.id, data, mode: decision.mode, nowMs, retentionMs: config.retentionMs, index });
        } catch (err) {
          bump(counters, "failed");
          log.error(`[RETENTION] job ${doc.id}: cleanup threw: ${String(err && err.message).slice(0, 200)}`);
          cursor = doc.id; // retried on the next sweep; the job document was not marked deleted
          continue;
        }
        if (result.skipped) {
          bump(counters.skipped, result.reason);
          cursor = doc.id;
          continue;
        }
        for (const o of result.objects) bump(counters.objects, o.outcome);
        if (result.complete) bump(counters, "cleaned"); else if (result.objects.some((o) => o.outcome === "failed")) bump(counters, "failed"); else bump(counters, "partial");
        cursor = doc.id;
      }
      await saveState(db, JOBS_STATE_DOC, { jobCursor: cursor, jobCursorUpdatedMs: clock() });
      if (snap.docs.length < config.jobPageSize) { counters.wrapped = true; cursor = null; break; }
    }
  } finally {
    await releaseLease(db, JOBS_STATE_DOC, runId, { jobCursor: cursor, lastRunMs: nowMs, lastCounters: JSON.parse(JSON.stringify(counters)),
      ...(counters.wrapped ? { lastSweepCompletedMs: nowMs } : {}) }).catch((e) => log.error(`[RETENTION] could not release lease: ${e.message}`));
  }
  log.log(`[RETENTION] scanned=${counters.scanned} cleaned=${counters.cleaned} partial=${counters.partial} failed=${counters.failed} skipped=${JSON.stringify(counters.skipped)} objects=${JSON.stringify(counters.objects)} wrapped=${counters.wrapped}`);
  return counters;
}

// ----------------------------- orphan pass -----------------------------

/**
 * One bounded, resumable pass over the customer prefixes of the bucket. An object is deleted only when ALL hold:
 * approved customer prefix, not a protected asset, real upload time (GCS timeCreated) at least retentionMs ago, and not
 * referenced by a job that still needs it (pending / paid / printing / pending_conversion / processing). Objects that
 * belong to finished jobs are also deleted here (the job sweep then sees them as missing and records the marker).
 */
async function runOrphanStoragePass({ db, admin, bucket, nowMs = Date.now(), log = console, config = defaults(), clock = () => Date.now(), runId = `orphan_${nowMs}` }) {
  const counters = { scanned: 0, eligible: 0, deleted: 0, missing: 0, failed: 0, wouldDelete: 0, skipped: {}, pagesRead: 0, listErrors: 0, mode: config.orphanMode, aborted: null, sweepCompleted: false };
  const lease = await acquireLease(db, ORPHAN_STATE_DOC, { nowMs, runId, leaseMs: 15 * 60 * 1000 });
  if (!lease.acquired) { counters.aborted = "lease_held"; return counters; }
  const startMs = clock();
  let prefixIndex = Number(lease.state.prefixIndex) || 0;
  let lastName = lease.state.lastName || null;
  try {
    const index = await loadActiveReferenceIndex(db, bucket.name);
    if (!index.complete) { counters.aborted = "reference_index_incomplete"; log.error("[ORPHAN] reference index incomplete; deleting nothing this run"); return counters; }
    const indexLoadedMs = clock();

    while (counters.scanned < config.orphanMaxScanned && clock() - startMs <= config.timeBudgetMs) {
      const prefix = CUSTOMER_PREFIXES[prefixIndex];
      let files;
      try {
        const query = { prefix, maxResults: config.orphanPageSize, autoPaginate: false };
        if (lastName) query.startOffset = lastName;
        [files] = await bucket.getFiles(query);
      } catch (err) {
        counters.listErrors += 1;
        log.error(`[ORPHAN] listing ${prefix} failed (cursor kept, will retry): ${String(err && err.message).slice(0, 200)}`);
        break; // cursor is NOT advanced: the same page is retried next run
      }
      counters.pagesRead += 1;
      const page = (files || []).filter((f) => f.name !== lastName);
      const candidates = [];
      for (const f of page) {
        counters.scanned += 1;
        const v = validateCustomerPath(f.name);
        if (!v.ok) { bump(counters.skipped, v.reason); continue; }
        const created = f.metadata && f.metadata.timeCreated ? new Date(f.metadata.timeCreated).getTime() : NaN;
        if (!Number.isFinite(created)) { bump(counters.skipped, "unknown_age"); continue; }
        if (nowMs - created < config.retentionMs) { bump(counters.skipped, "too_young"); continue; }
        if (isReferencedByOther(index, f.name, null)) { bump(counters.skipped, "referenced"); continue; }
        const gen = f.generation || (f.metadata && f.metadata.generation) || null;
        candidates.push({ name: f.name, generation: gen });
      }
      if (candidates.length) {
        // close the upload -> finalize race for this batch: pick up jobs created since the index was built
        await addRecentReferences(db, bucket.name, index, indexLoadedMs - RECENT_REFERENCE_WINDOW_MS);
        const safe = candidates.filter((item) => {
          if (isReferencedByOther(index, item.name, null)) {
            bump(counters.skipped, "referenced_recent");
            return false;
          }
          return true;
        });
        counters.eligible += safe.length;
        if (config.orphanMode === "delete") {
          const results = await mapLimit(safe, config.deleteConcurrency, (item) => deleteObject(bucket, item.name, { generation: item.generation }));
          for (const r of results) {
            if (r.outcome === "deleted") bump(counters, "deleted");
            else if (r.outcome === "missing") bump(counters, "missing");
            else if (r.outcome === "changed") bump(counters.skipped, "changed");
            else bump(counters, "failed");
          }
        } else {
          counters.wouldDelete += safe.length;
        }
      }
      if (page.length) lastName = page[page.length - 1].name;
      if ((files || []).length < config.orphanPageSize) { // end of this prefix
        prefixIndex += 1; lastName = null;
        if (prefixIndex >= CUSTOMER_PREFIXES.length) { prefixIndex = 0; counters.sweepCompleted = true; await saveState(db, ORPHAN_STATE_DOC, { prefixIndex, lastName }); break; }
      }
      await saveState(db, ORPHAN_STATE_DOC, { prefixIndex, lastName });
    }
  } finally {
    await releaseLease(db, ORPHAN_STATE_DOC, runId, { prefixIndex, lastName, lastRunMs: nowMs, lastCounters: JSON.parse(JSON.stringify(counters)),
      ...(counters.sweepCompleted ? { lastSweepCompletedMs: nowMs } : {}) }).catch((e) => log.error(`[ORPHAN] could not release lease: ${e.message}`));
  }
  log.log(`[ORPHAN] mode=${counters.mode} scanned=${counters.scanned} eligible=${counters.eligible} deleted=${counters.deleted} missing=${counters.missing} failed=${counters.failed} wouldDelete=${counters.wouldDelete} skipped=${JSON.stringify(counters.skipped)} pages=${counters.pagesRead} listErrors=${counters.listErrors} sweepCompleted=${counters.sweepCompleted}`);
  return counters;
}

module.exports = {
  defaults,
  classifyJob,
  claimJobForCleanup,
  cleanJobDocument,
  runJobRetentionPass,
  runOrphanStoragePass,
  acquireLease,
  releaseLease,
  mapLimit,
  CHECKOUT_PROTECTION_MS,
  JOBS_STATE_DOC,
  ORPHAN_STATE_DOC,
  STATE_COLLECTION,
};
