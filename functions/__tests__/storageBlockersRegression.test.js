// ================= STORAGE BLOCKERS REGRESSION TESTS =================
// Targeted regression tests for adversarial review blockers B1 through B5,
// and additional safety verifications.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createHarness, BUCKET, NOW, HOUR, ago } = require("./helpers/cleanupHarness");

process.env.JWT_SECRET = "blocker-regression-test-secret-32chars";
const h = createHarness();

const S = require("../src/services/storage.service");
const C = require("../src/services/storageCleanup.service");
const uploadController = require("../src/controllers/upload.controller");

const pass = (over = {}, nowMs = NOW) =>
  C.runJobRetentionPass({
    db: h.db,
    admin: h.admin,
    bucket: h.bucket,
    nowMs,
    log: h.silent,
    config: h.config(over),
    clock: () => nowMs,
  });

const orphanPass = (over = {}, nowMs = NOW) =>
  C.runOrphanStoragePass({
    db: h.db,
    admin: h.admin,
    bucket: h.bucket,
    nowMs,
    log: h.silent,
    config: h.config(over),
    clock: () => nowMs,
  });

// ============================================================================
// BLOCKER B1: Payment / Cleanup Race and Concurrency-Safe Design
// ============================================================================

test("B1.1: Payment wins before cleanup claim - cleanup aborts and preserves files", async () => {
  h.reset();
  await h.addJob("j_race1", {
    status: "pending",
    objects: { "uploads/u1/doc.pdf": 30 },
  });

  // Simulated concurrent payment marks job paid
  await h.db.collection("print_jobs").doc("j_race1").update({
    status: "paid",
    printCode: "9988",
    paymentTime: new Date(NOW),
  });

  // Cleanup runs after payment won
  const counters = await pass();

  // File must NOT be deleted
  assert.strictEqual(h.bucket.has("uploads/u1/doc.pdf"), true);
  const job = h.job("j_race1");
  assert.strictEqual(job.status, "paid");
  assert.strictEqual(job.fileDeleted, undefined);
  assert.strictEqual(counters.skipped.paid_unprinted, 1);
});

test("B1.2: Cleanup claim wins before payment - finalizer transaction preserves paid status", async () => {
  h.reset();
  const fileKey = "uploads/u1/race2.pdf";
  await h.addJob("j_race2", {
    status: "pending",
    objects: { [fileKey]: 30 },
  });

  const ref = h.db.collection("print_jobs").doc("j_race2");

  // Step 1: Claim is established
  const claim = await C.claimJobForCleanup({
    db: h.db,
    ref,
    jobId: "j_race2",
    mode: "age",
    nowMs: NOW,
  });
  assert.strictEqual(claim.claimed, true);
  assert.strictEqual(h.job("j_race2").cleanupState, "claiming");

  // Step 2: External payment lands concurrently before cleanup commits
  await ref.update({
    status: "paid",
    printCode: "7777",
    paymentTime: new Date(NOW),
  });

  // Step 3: Cleanup finalizes
  const result = await S.cleanupJobObjects({
    db: h.db,
    bucket: h.bucket,
    jobId: "j_race2",
    data: claim.data,
    mode: "age",
    nowMs: NOW,
    retentionMs: 24 * HOUR,
  });

  // Commit inside cleanJobDocument-style transaction
  await h.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data();
    const update = S.buildCleanupUpdate(result, {
      FieldValue: h.admin.firestore.FieldValue,
      nowMs: NOW,
    });
    const isProtected =
      cur.status === "paid" || !!cur.printCode || !!cur.paymentTime;
    if (result.complete && result.removedSomething && cur.status === "pending" && !isProtected) {
      update.status = "abandoned";
    }
    tx.update(ref, update);
  });

  const finalJob = h.job("j_race2");
  // Status must REMAIN paid, NEVER overwritten to abandoned!
  assert.strictEqual(finalJob.status, "paid");
  assert.strictEqual(finalJob.printCode, "7777");
});

test("B1.3: Active checkout protection window (6 hours) skips pending jobs with active orders", async () => {
  h.reset();
  // Object is 30 hours old, but user has an active checkout created 30 minutes ago
  await h.addJob("j_checkout", {
    status: "pending",
    objects: { "uploads/u1/cart.pdf": 30 },
    extra: {
      orderId: "order_active_123",
      updatedAt: new Date(NOW - 30 * 60 * 1000), // 30 minutes ago
      createdAt: new Date(NOW - 30 * 60 * 1000),
    },
  });

  const counters = await pass();
  assert.strictEqual(counters.skipped.active_checkout, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/cart.pdf"), true);
  const job = h.job("j_checkout");
  assert.strictEqual(job.status, "pending");
  assert.strictEqual(job.fileDeleted, undefined);
});

test("B1.4: Expired checkout order (>6 hours) is eligible for cleanup after 24h retention", async () => {
  h.reset();
  await h.addJob("j_expired_checkout", {
    status: "pending",
    objects: { "uploads/u1/old_cart.pdf": 30 },
    extra: {
      orderId: "order_expired_999",
      orderCreatedAt: new Date(NOW - 7 * HOUR), // 7 hours ago (> 6h window)
      updatedAt: new Date(NOW - 7 * HOUR),
      createdAt: new Date(NOW - 7 * HOUR),
    },
  });

  const counters = await pass();
  assert.strictEqual(counters.cleaned, 1);
  assert.strictEqual(h.bucket.has("uploads/u1/old_cart.pdf"), false);
  const job = h.job("j_expired_checkout");
  assert.strictEqual(job.status, "abandoned");
  assert.strictEqual(job.fileDeleted, true);
  assert.strictEqual(job.cleanupState, "completed");
});

// ============================================================================
// BLOCKER B2: Query / Index Compatibility and Pagination Safety
// ============================================================================

test("B2.1: loadActiveReferenceIndex paginates correctly with snapshot cursor across multiple pages", async () => {
  h.reset();
  // Create 6 active pending jobs
  for (let i = 1; i <= 6; i++) {
    await h.db.collection("print_jobs").doc(`job_${i}`).set({
      status: "pending",
      fileUrl: `https://storage.googleapis.com/${BUCKET}/uploads/u/doc_${i}.pdf`,
    });
  }

  // Load with small pageSize = 2 to force 3 pages of pagination
  const index = await S.loadActiveReferenceIndex(h.db, BUCKET, {
    pageSize: 2,
    statuses: ["pending"],
  });

  assert.strictEqual(index.complete, true);
  assert.strictEqual(index.jobs, 6);
  for (let i = 1; i <= 6; i++) {
    assert.strictEqual(index.byPath.has(`uploads/u/doc_${i}.pdf`), true);
  }
});

test("B2.2: remove-file fails closed (HTTP 500) if reference index loading throws", async () => {
  h.reset();
  const fileUrl = `https://storage.googleapis.com/${BUCKET}/uploads/u1/to_remove.pdf`;
  h.bucket.put("uploads/u1/to_remove.pdf", h.ago(10 * HOUR));
  await h.db.collection("print_jobs").doc("j_rem").set({
    userId: "user_test",
    fileUrl,
    status: "pending",
  });

  const req = {
    user: { id: "user_test" },
    body: { fileUrl },
  };

  let statusCode = 0;
  let responseBody = null;
  const res = {
    status(code) { statusCode = code; return res; },
    json(body) { responseBody = body; return res; },
  };

  // Temporarily force loadActiveReferenceIndex failure
  const origIndexFn = S.loadActiveReferenceIndex;
  // Overload db.collection to throw when loading active reference index
  const origCol = h.db.collection;
  h.db.collection = (name) => {
    if (name === "print_jobs") {
      const q = origCol(name);
      return {
        ...q,
        where: (field, op, val) => {
          if (field === "status") {
            return {
              limit: () => ({
                get: async () => {
                  throw new Error("Simulated index read error");
                },
              }),
            };
          }
          return q.where(field, op, val);
        },
      };
    }
    return origCol(name);
  };

  try {
    await uploadController.deleteRemoveFile(req, res);
  } finally {
    h.db.collection = origCol;
  }

  assert.strictEqual(statusCode, 500);
  assert.ok(responseBody && responseBody.error.includes("reference index"));
  // Job must NOT be marked cleaned
  const job = h.job("j_rem");
  assert.strictEqual(job.status, "pending");
  assert.strictEqual(job.removedByUser, undefined);
  // Storage object must remain intact
  assert.strictEqual(h.bucket.has("uploads/u1/to_remove.pdf"), true);
});

// ============================================================================
// BLOCKER B3: Generation-Guarded Deletion
// ============================================================================

test("B3.1: deleteObject with ifGenerationMatch fails with 412 outcome changed when generation changed", async () => {
  h.reset();
  const path = "converted/u1/doc.pdf";
  h.bucket.put(path, h.ago(30 * HOUR));
  const gen1 = h.bucket.getGeneration(path);

  // Object is overwritten with a newer generation
  h.bucket.put(path, h.ago(1 * HOUR));
  const gen2 = h.bucket.getGeneration(path);
  assert.notStrictEqual(gen1, gen2);

  // Attempting to delete using the old generation precondition
  const outcome = await S.deleteObject(h.bucket, path, { generation: gen1 });
  assert.strictEqual(outcome.outcome, "changed");
  // The newer object must be preserved!
  assert.strictEqual(h.bucket.has(path), true);

  // Attempting to delete using the matching generation succeeds
  const matchOutcome = await S.deleteObject(h.bucket, path, { generation: gen2 });
  assert.strictEqual(matchOutcome.outcome, "deleted");
  assert.strictEqual(h.bucket.has(path), false);
});

test("B3.2: Orphan sweep skips deletion when generation changes between listing and deletion", async () => {
  h.reset();
  const path = "converted/u1/doc.pdf";
  h.bucket.put(path, h.ago(30 * HOUR));
  const origGen = h.bucket.getGeneration(path);

  // Overwrite hook: right before deleteObject is called, simulate race where object is updated
  const origFile = h.bucket.file.bind(h.bucket);
  h.bucket.file = (n) => {
    const f = origFile(n);
    const origDel = f.delete.bind(f);
    f.delete = async (opts) => {
      // Overwrite the bucket object to increment generation
      h.bucket.put(n, h.ago(1 * HOUR));
      return origDel(opts);
    };
    return f;
  };

  const counters = await orphanPass();
  h.bucket.file = origFile;

  // The changed object was not deleted!
  assert.strictEqual(counters.deleted, 0);
  assert.strictEqual(counters.skipped.changed, 1);
  assert.strictEqual(h.bucket.has(path), true);
});

test("B3.3: Job cleanup does not mark fileDeleted: true when generation changed", async () => {
  h.reset();
  const path = "converted/u1/doc.pdf";
  h.bucket.put(path, h.ago(30 * HOUR));

  await h.addJob("j_gen_mismatch", {
    status: "failed",
    objects: { [path]: 30 },
  });

  // Hook readObjectAge to return gen 1, but bucket object is bumped to gen 2
  const origFile = h.bucket.file.bind(h.bucket);
  h.bucket.file = (n) => {
    const f = origFile(n);
    const origGetMeta = f.getMetadata.bind(f);
    f.getMetadata = async () => {
      const [meta] = await origGetMeta();
      // Right after age check, bump generation in bucket
      h.bucket.put(n, h.ago(29 * HOUR));
      return [meta];
    };
    return f;
  };

  await pass();
  h.bucket.file = origFile;

  const job = h.job("j_gen_mismatch");
  assert.strictEqual(job.fileDeleted, undefined);
  assert.strictEqual(job.cleanupState, "partial");
  assert.strictEqual(h.bucket.has(path), true);
});

// ============================================================================
// BLOCKER B4: Bucket URL Spelling and Reference Safety
// ============================================================================

test("B4.1: Canonical and legacy alias spellings are discovered in reference mode but strictly validated for deletion", () => {
  const canonical = "mimo-v2-11868.firebasestorage.app";
  const legacy = "mimo-v2-11868.appspot.com";
  const path = "uploads/u1/file.pdf";

  const canonicalUrl = `https://firebasestorage.googleapis.com/v0/b/${canonical}/o/${encodeURIComponent(path)}`;
  const legacyUrl = `https://firebasestorage.googleapis.com/v0/b/${legacy}/o/${encodeURIComponent(path)}`;
  const foreignUrl = `https://firebasestorage.googleapis.com/v0/b/other-project.firebasestorage.app/o/${encodeURIComponent(path)}`;
  const malformedUrl = "https://firebasestorage.googleapis.com/invalid";

  // Strict mode (deletion validation)
  assert.strictEqual(S.extractStoragePath(canonicalUrl, canonical, { mode: "strict" }), path);
  assert.strictEqual(S.extractStoragePath(legacyUrl, canonical, { mode: "strict" }), null);
  assert.strictEqual(S.extractStoragePath(foreignUrl, canonical, { mode: "strict" }), null);
  assert.strictEqual(S.extractStoragePath(malformedUrl, canonical, { mode: "strict" }), null);

  // Reference discovery mode (conservative protection)
  assert.strictEqual(S.extractStoragePath(canonicalUrl, canonical, { mode: "reference" }), path);
  assert.strictEqual(S.extractStoragePath(legacyUrl, canonical, { mode: "reference" }), path);
  assert.strictEqual(S.extractStoragePath(foreignUrl, canonical, { mode: "reference" }), null);
  assert.strictEqual(S.extractStoragePath(malformedUrl, canonical, { mode: "reference" }), null);

  // gs:// protocol
  assert.strictEqual(S.extractStoragePath(`gs://${canonical}/${path}`, canonical, { mode: "strict" }), path);
  assert.strictEqual(S.extractStoragePath(`gs://${legacy}/${path}`, canonical, { mode: "strict" }), null);
  assert.strictEqual(S.extractStoragePath(`gs://${legacy}/${path}`, canonical, { mode: "reference" }), path);
  assert.strictEqual(S.extractStoragePath(`gs://other-project/${path}`, canonical, { mode: "reference" }), null);

  // storage.googleapis.com
  assert.strictEqual(S.extractStoragePath(`https://storage.googleapis.com/${canonical}/${path}`, canonical, { mode: "strict" }), path);
  assert.strictEqual(S.extractStoragePath(`https://storage.googleapis.com/${legacy}/${path}`, canonical, { mode: "strict" }), null);
  assert.strictEqual(S.extractStoragePath(`https://storage.googleapis.com/${legacy}/${path}`, canonical, { mode: "reference" }), path);
});

test("B4.2: Active job referencing legacy bucket spelling is protected from orphan deletion", async () => {
  h.reset();
  const canonicalBucket = "test-project.firebasestorage.app";
  const legacyBucket = "test-project.appspot.com";
  const path = "uploads/u1/legacy_ref.pdf";

  // In-memory bucket configured with canonical name
  h.bucket.name = canonicalBucket;
  h.bucket.put(path, h.ago(50 * HOUR));

  try {
    // Active print job references object using the legacy .appspot.com URL
    const legacyUrl = `https://firebasestorage.googleapis.com/v0/b/${legacyBucket}/o/${encodeURIComponent(path)}`;
    await h.db.collection("print_jobs").doc("j_legacy").set({
      status: "pending",
      fileUrl: legacyUrl,
    });

    const counters = await orphanPass();

    // Object must be protected because reference was discovered via alias
    assert.strictEqual(counters.skipped.referenced, 1);
    assert.strictEqual(counters.deleted, 0);
    assert.strictEqual(h.bucket.has(path), true);
  } finally {
    h.bucket.name = BUCKET;
  }
});

// ============================================================================
// BLOCKER B5: Non-Approved-Prefix References and Truthful Markers
// ============================================================================

test("B5.1: One approved object plus one unmanaged object (scanner/): approved deleted, unmanaged kept, cleanupState is unmanaged_objects", async () => {
  h.reset();
  const approvedPath = "uploads/u1/valid.pdf";
  const scannerPath = "scanner/sess1/scanned_document.pdf";
  h.bucket.put(approvedPath, h.ago(30 * HOUR));
  h.bucket.put(scannerPath, h.ago(30 * HOUR));

  await h.addJob("j_mixed", {
    status: "completed",
    objects: { [approvedPath]: 30 },
    extra: {
      isPrinted: true,
      files: [
        { name: "valid.pdf", url: h.url(approvedPath) },
        { name: "scanned.pdf", url: h.url(scannerPath) },
      ],
    },
  });

  await pass();

  // Approved object deleted, scanner object preserved
  assert.strictEqual(h.bucket.has(approvedPath), false);
  assert.strictEqual(h.bucket.has(scannerPath), true);

  const job = h.job("j_mixed");
  // Crucial: fileDeleted must NOT be set to true because unmanaged object remains!
  assert.strictEqual(job.fileDeleted, undefined);
  assert.strictEqual(job.cleanupState, "unmanaged_objects");
  assert.ok(job.cleanupRemaining.some((r) => r.includes("unmanaged_prefix:scanner/")));
});

test("B5.2: Unmanaged-only job: not marked deleted, cleanupState is unmanaged_objects, skipped by next pass", async () => {
  h.reset();
  const scannerPath = "scanner/sess2/scanned_document.pdf";
  h.bucket.put(scannerPath, h.ago(30 * HOUR));

  await h.db.collection("print_jobs").doc("j_scanner_only").set({
    status: "completed",
    fileUrl: h.url(scannerPath),
    isPrinted: true,
  });

  const pass1 = await pass();
  const job = h.job("j_scanner_only");
  assert.strictEqual(job.fileDeleted, undefined);
  assert.strictEqual(job.cleanupState, "unmanaged_objects");
  assert.strictEqual(h.bucket.has(scannerPath), true);

  // Subsequent pass skips cleanly without spamming
  const pass2 = await pass();
  assert.strictEqual(pass2.skipped.unmanaged_objects, 1);
});

test("B5.3: Protected system template: not deleted, cleanupState is no_customer_objects", async () => {
  h.reset();
  const templatePath = "templates/blank_a4.pdf";
  h.bucket.put(templatePath, h.ago(100 * HOUR));

  await h.db.collection("print_jobs").doc("j_template_only").set({
    status: "completed",
    fileUrl: h.url(templatePath),
    isPrinted: true,
  });

  await pass();

  assert.strictEqual(h.bucket.has(templatePath), true);
  const job = h.job("j_template_only");
  assert.strictEqual(job.fileDeleted, undefined);
  assert.strictEqual(job.cleanupState, "no_customer_objects");
});

test("B5.4: One approved object plus one protected template: approved deleted, template kept, complete: true", async () => {
  h.reset();
  const approvedPath = "uploads/u1/doc.pdf";
  const templatePath = "templates/blank_a4.pdf";
  h.bucket.put(approvedPath, h.ago(30 * HOUR));
  h.bucket.put(templatePath, h.ago(100 * HOUR));

  await h.addJob("j_tmpl_mixed", {
    status: "completed",
    objects: { [approvedPath]: 30 },
    extra: {
      isPrinted: true,
      files: [
        { name: "doc.pdf", url: h.url(approvedPath) },
        { name: "blank.pdf", url: h.url(templatePath) },
      ],
    },
  });

  await pass();

  assert.strictEqual(h.bucket.has(approvedPath), false);
  assert.strictEqual(h.bucket.has(templatePath), true);

  const job = h.job("j_tmpl_mixed");
  assert.strictEqual(job.fileDeleted, true);
  assert.strictEqual(job.cleanupState, "completed");
});

// ============================================================================
// ADDITIONAL VERIFICATIONS: Real Timestamps and Safety Caps
// ============================================================================

test("AV.1: Real Firestore Timestamp objects are handled properly by toMillis and classifyJob", () => {
  const ts = h.admin.firestore.Timestamp.fromDate(new Date(NOW - 10 * HOUR));
  const millis = S.toMillis(ts);
  assert.strictEqual(millis, NOW - 10 * HOUR);

  // classifyJob with Timestamp
  const futureTs = h.admin.firestore.Timestamp.fromDate(new Date(NOW + 1 * HOUR));
  const decision = C.classifyJob({
    status: "pending",
    cleanupNextAttemptAt: futureTs,
  }, NOW);
  assert.strictEqual(decision.action, "skip");
  assert.strictEqual(decision.reason, "backoff");
});

test("AV.2: loadActiveReferenceIndex fails closed when safety cap (maxDocs) is exceeded", async () => {
  h.reset();
  for (let i = 1; i <= 5; i++) {
    await h.db.collection("print_jobs").doc(`j_${i}`).set({
      status: "pending",
      fileUrl: h.url(`uploads/u/doc_${i}.pdf`),
    });
  }

  // maxDocs = 3 (less than 5 jobs)
  const index = await S.loadActiveReferenceIndex(h.db, BUCKET, {
    maxDocs: 3,
    pageSize: 2,
    statuses: ["pending"],
  });

  assert.strictEqual(index.complete, false);
});

test("AV.3: addRecentReferences marks index.complete = false when query hits 500 limit cap", async () => {
  h.reset();
  const index = {
    byPath: new Map(),
    complete: true,
    addJob() {},
  };

  // Mock collection where snap.docs has length 500
  const origCol = h.db.collection;
  h.db.collection = (name) => ({
    where: () => ({
      limit: () => ({
        get: async () => ({
          docs: new Array(500).fill({ data: () => ({ status: "pending" }) }),
        }),
      }),
    }),
  });

  try {
    await S.addRecentReferences(h.db, BUCKET, index, NOW - 10 * 60 * 1000);
  } finally {
    h.db.collection = origCol;
  }

  assert.strictEqual(index.complete, false);
});
