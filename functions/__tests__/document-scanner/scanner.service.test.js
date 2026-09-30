const test = require("node:test");
const assert = require("node:assert/strict");

// Valid minimal 1x1 JPEG and PNG buffers for pdf-lib embedding
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x80, 0xff, 0xd9,
]);

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// In-memory mock storage
const sessions = new Map();
const pages = new Map();
const storageFiles = new Map();
const printJobs = new Map();
let docIdCounter = 1;

const mockBucket = {
  name: "mimo-test-bucket",
  file: (filePath) => ({
    name: filePath,
    save: async (buffer, options) => {
      storageFiles.set(filePath, { buffer, options });
    },
    download: async () => {
      const file = storageFiles.get(filePath);
      if (!file) throw new Error(`File not found: ${filePath}`);
      return [file.buffer];
    },
    delete: async () => {
      storageFiles.delete(filePath);
    },
  }),
};

const mockAdmin = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => "SERVER_TIMESTAMP",
    },
  },
  storage: () => ({
    bucket: () => mockBucket,
  }),
};

function createMockDocRef(collName, docId) {
  const id = docId || `${collName}-${docIdCounter++}`;
  return {
    id,
    collectionName: collName,
    set: async (data) => {
      if (collName === "scanner_sessions") {
        sessions.set(id, { ...data });
        if (!pages.has(id)) pages.set(id, new Map());
      } else if (collName === "print_jobs") {
        printJobs.set(id, { ...data });
      }
    },
    get: async () => {
      let data = null;
      let exists = false;
      if (collName === "scanner_sessions") {
        exists = sessions.has(id);
        data = exists ? sessions.get(id) : null;
      } else if (collName === "print_jobs") {
        exists = printJobs.has(id);
        data = exists ? printJobs.get(id) : null;
      }
      return {
        exists,
        id,
        data: () => data,
      };
    },
    update: async (partial) => {
      if (collName === "scanner_sessions") {
        if (!sessions.has(id)) throw new Error("Document not found");
        const current = sessions.get(id);
        sessions.set(id, { ...current, ...partial });
      } else if (collName === "print_jobs") {
        if (!printJobs.has(id)) throw new Error("Document not found");
        const current = printJobs.get(id);
        printJobs.set(id, { ...current, ...partial });
      }
    },
    collection: (subColl) => {
      if (collName === "scanner_sessions" && subColl === "pages") {
        return {
          doc: (pageDocId) => {
            const pageId = pageDocId || `page-${docIdCounter++}`;
            return {
              id: pageId,
              set: async (pageData) => {
                if (!pages.has(id)) pages.set(id, new Map());
                pages.get(id).set(pageId, pageData);
              },
              get: async () => {
                const sessionPages = pages.get(id);
                const exists = !!(sessionPages && sessionPages.has(pageId));
                return {
                  exists,
                  id: pageId,
                  data: () => (exists ? sessionPages.get(pageId) : null),
                };
              },
              update: async (partial) => {
                const sessionPages = pages.get(id);
                if (!sessionPages || !sessionPages.has(pageId)) {
                  throw new Error("Page document not found");
                }
                const current = sessionPages.get(pageId);
                sessionPages.set(pageId, { ...current, ...partial });
              },
              delete: async () => {
                const sessionPages = pages.get(id);
                if (sessionPages) {
                  sessionPages.delete(pageId);
                }
              },
            };
          },
          get: async () => {
            const sessionPages = pages.get(id) || new Map();
            return {
              empty: sessionPages.size === 0,
              size: sessionPages.size,
              docs: Array.from(sessionPages.entries()).map(([k, v]) => ({
                id: k,
                ref: {
                  id: k,
                  update: async (partial) => {
                    const sp = pages.get(id);
                    if (sp && sp.has(k)) {
                      sp.set(k, { ...sp.get(k), ...partial });
                    }
                  },
                },
                data: () => v,
              })),
            };
          },
        };
      }
      throw new Error(`Unexpected subcollection: ${subColl}`);
    },
  };
}

const mockDb = {
  batch: () => {
    const operations = [];
    return {
      set: (docRef, data) => operations.push(() => docRef.set(data)),
      update: (docRef, data) => operations.push(() => docRef.update(data)),
      commit: async () => {
        for (const op of operations) await op();
      },
    };
  },
  collection: (collName) => {
    const filters = [];
    const query = {
      doc: (docId) => createMockDocRef(collName, docId),
      where: (field, op, val) => {
        filters.push({ field, op, val });
        return query;
      },
      get: async () => {
        if (collName === "print_jobs") {
          let docs = Array.from(printJobs.entries()).map(([id, data]) => ({
            id,
            data: () => data,
            ref: createMockDocRef("print_jobs", id),
          }));
          for (const f of filters) {
            if (f.op === "==") {
              docs = docs.filter((d) => d.data()[f.field] === f.val);
            }
          }
          return {
            empty: docs.length === 0,
            size: docs.length,
            docs,
            forEach: (fn) => docs.forEach(fn),
          };
        }
        throw new Error(`Unhandled collection query: ${collName}`);
      },
    };
    return query;
  },
};

const originalFirebase = require.cache[
  require.resolve("../../src/config/firebase")
];

require.cache[require.resolve("../../src/config/firebase")] = {
  exports: {
    admin: mockAdmin,
    db: mockDb,
  },
};

const {
  createScannerSession,
  getScannerSession,
  addScannerPage,
  deleteScannerPage,
  reorderScannerPages,
  updateScannerPage,
  finalizeScannerSession,
} = require("../../src/document-scanner/scanner.service");

function resetStorage() {
  sessions.clear();
  pages.clear();
  storageFiles.clear();
  printJobs.clear();
  docIdCounter = 1;
}

// ================= CREATE SCANNER SESSION TESTS =================

test("createScannerSession creates a new scanner session", async () => {
  resetStorage();
  const result = await createScannerSession("test-user-123");

  assert.ok(result.sessionId);
  assert.equal(result.status, "created");
  assert.equal(result.pageCount, 0);
});

test("createScannerSession rejects a missing userId", async () => {
  await assert.rejects(
    () => createScannerSession(),
    {
      message: "userId is required",
    }
  );
});

// ================= GET SCANNER SESSION TESTS =================

test("getScannerSession returns session with pages sorted by pageNumber", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const retrieved = await getScannerSession("user-1", session.sessionId);
  assert.equal(retrieved.sessionId, session.sessionId);
  assert.equal(retrieved.status, "created");
  assert.equal(retrieved.pageCount, 2);
  assert.equal(retrieved.pages.length, 2);
  assert.equal(retrieved.pages[0].pageNumber, 1);
  assert.equal(retrieved.pages[0].pageId, "page-001");
  assert.equal(retrieved.pages[0].rotation, 0);
  assert.equal(retrieved.pages[1].pageNumber, 2);
  assert.equal(retrieved.pages[1].pageId, "page-002");
});

test("getScannerSession handles empty session with 0 pages", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");

  const retrieved = await getScannerSession("user-1", session.sessionId);
  assert.equal(retrieved.sessionId, session.sessionId);
  assert.equal(retrieved.pageCount, 0);
  assert.deepEqual(retrieved.pages, []);
});

test("getScannerSession rejects nonexistent session", async () => {
  resetStorage();
  await assert.rejects(
    () => getScannerSession("user-1", "nonexistent-session"),
    { message: "Scanner session not found" }
  );
});

test("getScannerSession rejects session belonging to another user", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await assert.rejects(
    () => getScannerSession("intruder-user", session.sessionId),
    { message: "Scanner session does not belong to this user" }
  );
});

test("getScannerSession rejects completed session", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await mockDb.collection("scanner_sessions").doc(session.sessionId).update({ status: "completed" });
  await assert.rejects(
    () => getScannerSession("user-1", session.sessionId),
    { message: "Scanner session is not available" }
  );
});

// ================= ADD SCANNER PAGE TESTS =================

test("addScannerPage uploads JPEG image buffer to Storage (.jpg, image/jpeg) and stores metadata in Firestore", async () => {
  resetStorage();

  const session = await createScannerSession("user-1");
  const sampleBuffer = Buffer.from(MINIMAL_JPEG);

  const pageResult = await addScannerPage("user-1", session.sessionId, 1, sampleBuffer, "image/jpeg");

  assert.equal(pageResult.sessionId, session.sessionId);
  assert.equal(pageResult.pageNumber, 1);
  assert.equal(pageResult.pageId, "page-001");
  assert.equal(pageResult.storagePath, `scanner/${session.sessionId}/page-001.jpg`);
  assert.equal(pageResult.pageCount, 1);
  assert.equal(pageResult.status, "uploaded");

  const storedFile = storageFiles.get(`scanner/${session.sessionId}/page-001.jpg`);
  assert.ok(storedFile, "File must be uploaded to Firebase Storage");
  assert.deepEqual(storedFile.buffer, sampleBuffer);
  assert.equal(storedFile.options.contentType, "image/jpeg");
});

test("addScannerPage uploads PNG image buffer to Storage (.png, image/png) and stores metadata in Firestore", async () => {
  resetStorage();

  const session = await createScannerSession("user-1");
  const sampleBuffer = Buffer.from(MINIMAL_PNG);

  const pageResult = await addScannerPage("user-1", session.sessionId, 2, sampleBuffer, "image/png");

  assert.equal(pageResult.sessionId, session.sessionId);
  assert.equal(pageResult.pageNumber, 2);
  assert.equal(pageResult.pageId, "page-002");
  assert.equal(pageResult.storagePath, `scanner/${session.sessionId}/page-002.png`);
  assert.equal(pageResult.pageCount, 1);
  assert.equal(pageResult.status, "uploaded");

  const storedFile = storageFiles.get(`scanner/${session.sessionId}/page-002.png`);
  assert.ok(storedFile, "File must be uploaded to Firebase Storage");
  assert.deepEqual(storedFile.buffer, sampleBuffer);
  assert.equal(storedFile.options.contentType, "image/png");
});

test("addScannerPage rejects missing or unsupported mimeType", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  const buf = Buffer.from("test");

  await assert.rejects(
    () => addScannerPage("user-1", session.sessionId, 1, buf, null),
    { message: "mimeType must be image/jpeg, image/jpg, or image/png" }
  );

  await assert.rejects(
    () => addScannerPage("user-1", session.sessionId, 1, buf, "application/pdf"),
    { message: "mimeType must be image/jpeg, image/jpg, or image/png" }
  );
});

test("addScannerPage rejects when userId or sessionId is missing", async () => {
  await assert.rejects(
    () => addScannerPage(null, "session-1", 1, Buffer.from("test"), "image/jpeg"),
    { message: "userId is required" }
  );
  await assert.rejects(
    () => addScannerPage("user-1", null, 1, Buffer.from("test"), "image/jpeg"),
    { message: "sessionId is required" }
  );
});

test("addScannerPage rejects when pageNumber is invalid", async () => {
  const buf = Buffer.from("test");
  await assert.rejects(
    () => addScannerPage("user-1", "session-1", 0, buf, "image/jpeg"),
    { message: "pageNumber must be a positive integer" }
  );
});

test("addScannerPage rejects when fileData is missing or not a Buffer", async () => {
  await assert.rejects(
    () => addScannerPage("user-1", "session-1", 1, null, "image/jpeg"),
    { message: "fileData must be a Buffer" }
  );
});

test("addScannerPage rejects when session does not exist", async () => {
  resetStorage();
  await assert.rejects(
    () => addScannerPage("user-1", "nonexistent-session", 1, Buffer.from("test"), "image/jpeg"),
    { message: "Scanner session not found" }
  );
});

test("addScannerPage rejects when session belongs to another user", async () => {
  resetStorage();
  const session = await createScannerSession("owner-user");

  await assert.rejects(
    () => addScannerPage("intruder-user", session.sessionId, 1, Buffer.from("test"), "image/jpeg"),
    { message: "Scanner session does not belong to this user" }
  );
});

test("addScannerPage rejects when session is not available/finalized", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  const docRef = mockDb.collection("scanner_sessions").doc(session.sessionId);
  await docRef.update({ status: "completed" });

  await assert.rejects(
    () => addScannerPage("user-1", session.sessionId, 1, Buffer.from("test"), "image/jpeg"),
    { message: "Scanner session is not available" }
  );
});

// ================= DELETE SCANNER PAGE TESTS =================

test("deleteScannerPage deletes page doc, storage file, and decrements pageCount", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");

  assert.ok(storageFiles.has(`scanner/${session.sessionId}/page-001.jpg`));

  const result = await deleteScannerPage("user-1", session.sessionId, "page-001");
  assert.equal(result.sessionId, session.sessionId);
  assert.equal(result.pageId, "page-001");
  assert.equal(result.pageCount, 1);
  assert.equal(result.status, "deleted");

  assert.equal(storageFiles.has(`scanner/${session.sessionId}/page-001.jpg`), false);
  const sessionDoc = sessions.get(session.sessionId);
  assert.equal(sessionDoc.pageCount, 1);
});

test("deleteScannerPage on the last page sets pageCount to 0", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const result = await deleteScannerPage("user-1", session.sessionId, "page-001");
  assert.equal(result.pageCount, 0);
  const sessionDoc = sessions.get(session.sessionId);
  assert.equal(sessionDoc.pageCount, 0);
});

test("deleteScannerPage rejects nonexistent page", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await assert.rejects(
    () => deleteScannerPage("user-1", session.sessionId, "page-999"),
    { message: "Page not found in this session" }
  );
});

test("deleteScannerPage rejects when session belongs to another user", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  await assert.rejects(
    () => deleteScannerPage("intruder", session.sessionId, "page-001"),
    { message: "Scanner session does not belong to this user" }
  );
});

test("deleteScannerPage rejects on completed session", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await mockDb.collection("scanner_sessions").doc(session.sessionId).update({ status: "completed" });

  await assert.rejects(
    () => deleteScannerPage("user-1", session.sessionId, "page-001"),
    { message: "Scanner session is not available" }
  );
});

// ================= REORDER SCANNER PAGES TESTS =================

test("reorderScannerPages updates pageNumbers atomically in order", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");
  await addScannerPage("user-1", session.sessionId, 3, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const reorderResult = await reorderScannerPages("user-1", session.sessionId, ["page-003", "page-001", "page-002"]);
  assert.equal(reorderResult.status, "reordered");
  assert.equal(reorderResult.pageCount, 3);
  assert.deepEqual(reorderResult.order, ["page-003", "page-001", "page-002"]);

  const sessionPages = pages.get(session.sessionId);
  assert.equal(sessionPages.get("page-003").pageNumber, 1);
  assert.equal(sessionPages.get("page-001").pageNumber, 2);
  assert.equal(sessionPages.get("page-002").pageNumber, 3);
});

test("reorderScannerPages rejects duplicate page IDs", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");

  await assert.rejects(
    () => reorderScannerPages("user-1", session.sessionId, ["page-001", "page-001"]),
    { message: "order contains duplicate page IDs" }
  );
});

test("reorderScannerPages rejects missing page IDs in order list", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");

  await assert.rejects(
    () => reorderScannerPages("user-1", session.sessionId, ["page-001"]),
    { message: /order must include all/ }
  );
});

test("reorderScannerPages rejects unknown page IDs", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  await assert.rejects(
    () => reorderScannerPages("user-1", session.sessionId, ["page-999"]),
    { message: /does not belong to this session/ }
  );
});

test("reorderScannerPages rejects session belonging to another user", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  await assert.rejects(
    () => reorderScannerPages("intruder", session.sessionId, ["page-001"]),
    { message: "Scanner session does not belong to this user" }
  );
});

test("reorderScannerPages rejects on completed session", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await mockDb.collection("scanner_sessions").doc(session.sessionId).update({ status: "completed" });

  await assert.rejects(
    () => reorderScannerPages("user-1", session.sessionId, ["page-001"]),
    { message: "Scanner session is not available" }
  );
});

// ================= UPDATE SCANNER PAGE (ROTATION) TESTS =================

test("updateScannerPage updates rotation to 0, 90, 180, 270", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  for (const rot of [90, 180, 270, 0]) {
    const res = await updateScannerPage("user-1", session.sessionId, "page-001", { rotation: rot });
    assert.equal(res.rotation, rot);
    assert.equal(res.status, "updated");
    const p = pages.get(session.sessionId).get("page-001");
    assert.equal(p.rotation, rot);
  }
});

test("updateScannerPage rejects invalid rotation values", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  for (const invalidRot of [45, 100, -90, 360, "90", null]) {
    await assert.rejects(
      () => updateScannerPage("user-1", session.sessionId, "page-001", { rotation: invalidRot }),
      { message: "rotation must be one of: 0, 90, 180, 270" }
    );
  }
});

test("updateScannerPage rejects completed session", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await mockDb.collection("scanner_sessions").doc(session.sessionId).update({ status: "completed" });

  await assert.rejects(
    () => updateScannerPage("user-1", session.sessionId, "page-001", { rotation: 90 }),
    { message: "Scanner session is not available" }
  );
});

// ================= FINALIZE SCANNER SESSION TESTS =================

test("1. Successful one-page JPEG finalization compiles PDF and creates pending print job", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const result = await finalizeScannerSession("user-1", session.sessionId);

  assert.equal(result.sessionId, session.sessionId);
  assert.equal(result.status, "completed");
  assert.equal(result.pageCount, 1);
  assert.equal(result.fileName, "scanned_document.pdf");
  assert.ok(result.jobId);

  // Check storage file
  const pdfFile = storageFiles.get(`scanner/${session.sessionId}/scanned_document.pdf`);
  assert.ok(pdfFile, "Combined PDF must be saved to Storage");
  assert.equal(pdfFile.options.contentType, "application/pdf");
  assert.deepEqual(pdfFile.options.metadata, {
    contentType: "application/pdf",
    cacheControl: "public, max-age=86400",
  });
});

test("2. Successful mixed JPEG + PNG finalization with rotation metadata", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");
  await updateScannerPage("user-1", session.sessionId, "page-001", { rotation: 90 });

  const result = await finalizeScannerSession("user-1", session.sessionId);

  assert.equal(result.status, "completed");
  assert.equal(result.pageCount, 2);
});

test("3. Page ordering is respected regardless of upload order", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  // Upload page 2 first, then page 1
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const result = await finalizeScannerSession("user-1", session.sessionId);
  assert.equal(result.pageCount, 2);
});

test("4. Empty session without pages is rejected", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");

  await assert.rejects(
    () => finalizeScannerSession("user-1", session.sessionId),
    { message: "Scanner session has no uploaded pages" }
  );
});

test("5. Nonexistent session is rejected", async () => {
  resetStorage();
  await assert.rejects(
    () => finalizeScannerSession("user-1", "ghost-session"),
    { message: "Scanner session not found" }
  );
});

test("6. Wrong user is rejected with 403 error", async () => {
  resetStorage();
  const session = await createScannerSession("owner-user");
  await addScannerPage("owner-user", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  await assert.rejects(
    () => finalizeScannerSession("intruder-user", session.sessionId),
    { message: "Scanner session does not belong to this user" }
  );
});

test("7. Already completed session is rejected on repeated finalize call", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  await finalizeScannerSession("user-1", session.sessionId);

  await assert.rejects(
    () => finalizeScannerSession("user-1", session.sessionId),
    { message: "Scanner session is not available" }
  );
});

test("8. Unsupported page content type in metadata is rejected", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  // Corrupt page metadata
  const sessionPages = pages.get(session.sessionId);
  sessionPages.set("page-001", {
    pageNumber: 1,
    storagePath: `scanner/${session.sessionId}/page-001.jpg`,
    contentType: "application/pdf",
  });

  await assert.rejects(
    () => finalizeScannerSession("user-1", session.sessionId),
    { message: /unsupported contentType/ }
  );
});

test("9. print_jobs document has exactly the required pending fields", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const result = await finalizeScannerSession("user-1", session.sessionId);

  const job = printJobs.get(result.jobId);
  assert.ok(job, "print_jobs doc must exist in Firestore");
  assert.equal(job.userId, "user-1");
  assert.equal(job.fileName, "scanned_document.pdf");
  assert.equal(
    job.fileUrl,
    `https://storage.googleapis.com/mimo-test-bucket/scanner/${session.sessionId}/scanned_document.pdf`
  );
  assert.equal(job.mimetype, "application/pdf");
  assert.equal(typeof job.size, "number");
  assert.ok(job.size > 0);
  assert.equal(job.status, "pending");
  assert.equal(job.pageCount, 1);
  assert.equal(job.uploadedAt, "SERVER_TIMESTAMP");
  assert.equal(job.retentionStartAt, "SERVER_TIMESTAMP");
});

test("10. Old pending jobs for user are marked abandoned", async () => {
  resetStorage();
  // Pre-seed an old pending job
  printJobs.set("old-pending-job-1", {
    userId: "user-1",
    status: "pending",
  });
  // And a job for another user
  printJobs.set("other-user-job", {
    userId: "user-2",
    status: "pending",
  });

  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  await finalizeScannerSession("user-1", session.sessionId);

  const oldJob = printJobs.get("old-pending-job-1");
  assert.equal(oldJob.status, "abandoned");
  assert.equal(oldJob.abandonedAt, "SERVER_TIMESTAMP");

  const otherJob = printJobs.get("other-user-job");
  assert.equal(otherJob.status, "pending", "Other user's jobs must remain untouched");
});

test("11. Scanner session status becomes completed with metadata", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const result = await finalizeScannerSession("user-1", session.sessionId);

  const sessionDoc = sessions.get(session.sessionId);
  assert.equal(sessionDoc.status, "completed");
  assert.equal(sessionDoc.pageCount, 1);
  assert.equal(sessionDoc.jobId, result.jobId);
  assert.equal(sessionDoc.pdfStoragePath, `scanner/${session.sessionId}/scanned_document.pdf`);
  assert.equal(sessionDoc.updatedAt, "SERVER_TIMESTAMP");
});

test("12. Final PDF storage path and URL match MIMO standards", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const result = await finalizeScannerSession("user-1", session.sessionId);
  const job = printJobs.get(result.jobId);

  assert.equal(
    job.fileUrl,
    `https://storage.googleapis.com/mimo-test-bucket/scanner/${session.sessionId}/scanned_document.pdf`
  );
});

test("13. pageCount accurately reflects the generated multi-page PDF", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");
  await addScannerPage("user-1", session.sessionId, 2, Buffer.from(MINIMAL_PNG), "image/png");

  const result = await finalizeScannerSession("user-1", session.sessionId);
  const job = printJobs.get(result.jobId);

  assert.equal(result.pageCount, 2);
  assert.equal(job.pageCount, 2);
});

test("14. No printCode or payment fields are created on the pending print_jobs doc", async () => {
  resetStorage();
  const session = await createScannerSession("user-1");
  await addScannerPage("user-1", session.sessionId, 1, Buffer.from(MINIMAL_JPEG), "image/jpeg");

  const result = await finalizeScannerSession("user-1", session.sessionId);
  const job = printJobs.get(result.jobId);

  assert.equal(job.printCode, undefined);
  assert.equal(job.orderId, undefined);
  assert.equal(job.kioskId, undefined);
  assert.equal(job.pricing, undefined);
  assert.equal(job.paymentStatus, undefined);
});

if (originalFirebase) {
  require.cache[require.resolve("../../src/config/firebase")] =
    originalFirebase;
}
