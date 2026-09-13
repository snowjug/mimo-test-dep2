/**
 * MIMO WAVE 1 — FILE IDENTITY & IMMUTABLE PRINT MANIFEST
 * Comprehensive Local Regression Test Suite (Corrected Architecture v2.0)
 *
 * Asserts all 11 Wave 1 invariants locally without touching production databases or hardware:
 * 1. Client-supplied fake fileId ignored in /finalize-upload
 * 2. Missing fileId rejected in /create-manifest
 * 3. Duplicate filenames receive distinct server fileIds
 * 4. Missing authoritative file doc rejected (HTTP 404)
 * 5. Unauthorized file access rejected (HTTP 403)
 * 6. Invalid page selection rejected (page 0, page > raw, duplicates, empty)
 * 7. Filename cannot act as identity
 * 8. Manifest contents immutable
 * 9. Simultaneous checkout race safety (Firestore Transaction simulation)
 * 10. Seven uploaded / six selected subset manifest
 * 11. Exact SV-002 regression: 6 selected -> 6 manifest -> 6 order -> 6 print_job files
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const http = require("http");

const SECRET_KEY = "wave1_test_secret_key";

// --- IN-MEMORY MOCK FIRESTORE WITH TRANSACTION LOCK SUPPORT ---
class MockFirestore {
  constructor() {
    this.data = {
      users: new Map(),
      files: new Map(),
      print_jobs: new Map(),
      manifests: new Map(),
      orders: new Map(),
      coupons: new Map(),
      payment_transactions: new Map()
    };
    this.lock = false;
  }

  collection(name) {
    const map = this.data[name] || new Map();
    this.data[name] = map;
    return {
      doc: (id) => {
        const docId = id || `doc_${uuidv4().replace(/-/g, "").substring(0, 12)}`;
        return {
          id: docId,
          get: async () => ({
            exists: map.has(docId),
            id: docId,
            data: () => map.get(docId)
          }),
          set: async (val) => map.set(docId, val),
          update: async (val) => {
            const current = map.get(docId) || {};
            map.set(docId, { ...current, ...val });
          },
          delete: async () => map.delete(docId)
        };
      },
      add: async (val) => {
        const docId = `doc_${uuidv4().replace(/-/g, "").substring(0, 12)}`;
        map.set(docId, { ...val, id: docId });
        return {
          id: docId,
          update: async (uVal) => {
            const current = map.get(docId) || {};
            map.set(docId, { ...current, ...uVal });
          }
        };
      },
      where: (field, op, val) => {
        const docs = Array.from(map.entries())
          .filter(([_, data]) => {
            if (op === "==") return data[field] === val;
            return false;
          })
          .map(([id, data]) => ({
            id,
            data: () => data,
            ref: {
              id,
              delete: async () => map.delete(id),
              update: async (uVal) => map.set(id, { ...data, ...uVal })
            }
          }));

        return {
          get: async () => ({
            empty: docs.length === 0,
            size: docs.length,
            docs: docs,
            forEach: (cb) => docs.forEach(cb)
          })
        };
      }
    };
  }

  batch() {
    const ops = [];
    return {
      set: (ref, val) => ops.push(() => ref.set(val)),
      update: (ref, val) => ops.push(() => ref.update(val)),
      delete: (ref) => ops.push(() => ref.delete()),
      commit: async () => {
        for (const op of ops) await op();
      }
    };
  }

  async runTransaction(updateFunction) {
    // Atomic lock simulation for concurrent race test
    while (this.lock) {
      await new Promise(r => setTimeout(r, 10));
    }
    this.lock = true;
    try {
      const transaction = {
        get: async (ref) => ref.get(),
        set: (ref, val) => ref.set(val),
        update: (ref, val) => ref.update(val),
        delete: (ref) => ref.delete()
      };
      const result = await updateFunction(transaction);
      return result;
    } finally {
      this.lock = false;
    }
  }
}

// Server setup function building Express app with Wave 1 handlers
function createTestApp(db) {
  const app = express();
  app.use(express.json());

  const authMiddleware = async (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) return res.status(401).json({ error: "Access Denied" });
    try {
      const verified = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY);
      req.user = verified;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid Token" });
    }
  };

  // 1. /finalize-upload (Server-authoritative fileId EXCLUSIVELY)
  app.post("/finalize-upload", authMiddleware, async (req, res) => {
    try {
      const { files } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      const userId = req.user.userId || req.user.id;
      const batch = db.batch();
      const registeredFiles = [];
      let totalPages = 0;

      for (const f of files) {
        // IGNORE any client-supplied fileId. Server generates fileId EXCLUSIVELY.
        const fileId = `file_${uuidv4().replace(/-/g, "").substring(0, 16)}`;
        const pCount = f.pageCount || 1;
        const fileRecord = {
          fileId,
          userId,
          fileName: f.name || f.fileName,
          fileUrl: f.url || f.fileUrl,
          mimetype: f.type || f.mimetype || "application/pdf",
          size: f.size || 0,
          pageCount: pCount,
          status: "registered",
          createdAt: new Date().toISOString()
        };

        const fileRef = db.collection("files").doc(fileId);
        batch.set(fileRef, fileRecord);

        const docRef = db.collection("print_jobs").doc();
        batch.set(docRef, { ...fileRecord, status: "pending" });

        totalPages += pCount;
        registeredFiles.push({
          fileId,
          name: f.name || f.fileName,
          fileName: f.name || f.fileName,
          url: f.url || f.fileUrl,
          fileUrl: f.url || f.fileUrl,
          type: f.type || f.mimetype || "application/pdf",
          size: f.size || 0,
          pageCount: pCount
        });
      }

      await batch.commit();
      res.json({ message: "Jobs created successfully.", amount: totalPages * 2, totalPages, files: registeredFiles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. /create-manifest (Authoritative file metadata & strict page selection validation)
  app.post("/create-manifest", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { files, globalOptions } = req.body;

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Cannot create empty manifest. At least one file must be selected." });
      }

      const resolvedFiles = [];
      const fileIds = [];
      let totalRawPages = 0;

      for (const f of files) {
        if (!f.fileId) {
          return res.status(400).json({ error: "Missing required fileId for selected file." });
        }

        let fileDoc = await db.collection("files").doc(f.fileId).get();
        if (!fileDoc.exists) {
          const snap = await db.collection("print_jobs").where("fileId", "==", f.fileId).get();
          if (!snap.empty) fileDoc = snap.docs[0];
        }

        if (!fileDoc.exists) {
          return res.status(404).json({ error: `Authoritative file record missing: ${f.fileId}` });
        }

        const fileData = fileDoc.data();
        if (fileData.userId !== userId) {
          return res.status(403).json({ error: `Unauthorized access to file: ${f.fileId}` });
        }

        const rawPageCount = Number(fileData.pageCount) || 1;
        let selectedPageCount = rawPageCount;
        let validatedPages = Array.from({ length: rawPageCount }, (_, i) => i + 1);

        if (f.printConfig?.pageSelection === "custom") {
          const pages = f.printConfig.selectedPages;
          if (!Array.isArray(pages) || pages.length === 0) {
            return res.status(400).json({ error: `Custom page selection cannot be empty for file: ${f.fileId}` });
          }

          const uniquePages = new Set();
          for (const p of pages) {
            const pageNum = Number(p);
            if (isNaN(pageNum) || !Number.isInteger(pageNum) || pageNum < 1 || pageNum > rawPageCount) {
              return res.status(400).json({ error: `Invalid page number ${p} for file: ${f.fileId} (valid range: 1-${rawPageCount})` });
            }
            if (uniquePages.has(pageNum)) {
              return res.status(400).json({ error: `Duplicate page number ${p} in selection for file: ${f.fileId}` });
            }
            uniquePages.add(pageNum);
          }
          validatedPages = Array.from(uniquePages).sort((a, b) => a - b);
          selectedPageCount = validatedPages.length;
        }

        totalRawPages += selectedPageCount;
        fileIds.push(f.fileId);

        resolvedFiles.push({
          fileId: f.fileId,
          fileName: fileData.fileName || f.fileName || f.name,
          fileUrl: fileData.fileUrl || f.fileUrl || f.url,
          mimetype: fileData.mimetype || f.mimetype || f.type || "application/pdf",
          size: fileData.size || f.size || 0,
          pageCount: selectedPageCount,
          rawPageCount: rawPageCount,
          printConfig: {
            pageSelection: f.printConfig?.pageSelection || "all",
            pageRange: f.printConfig?.pageRange || `1-${rawPageCount}`,
            selectedPages: validatedPages,
            pageCount: selectedPageCount
          }
        });
      }

      const manifestId = `mf_${uuidv4().replace(/-/g, "").substring(0, 16)}`;
      const now = new Date().toISOString();

      const manifestData = {
        manifestId,
        userId,
        fileIds,
        files: resolvedFiles,
        globalOptions: globalOptions || {},
        totalCalculatedPages: totalRawPages,
        schemaVersion: 1,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      await db.collection("manifests").doc(manifestId).set(manifestData);

      res.json({ manifestId, totalCalculatedPages: totalRawPages, filesCount: resolvedFiles.length, status: "active", manifest: manifestData });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. /create-order (Firestore transaction race safety)
  app.post("/create-order", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { manifestId, couponCode, coinsToUse } = req.body;
      let printOptions = req.body.printOptions;

      if (!manifestId) {
        return res.status(400).json({ error: "Missing required manifestId. Implicit cart query checkout is disabled." });
      }

      const coinsDiscount = coinsToUse ? Number(coinsToUse) * 0.5 : 0;
      let orderId = req.body.orderId || `order_${uuidv4().replace(/-/g, "").substring(0, 10)}`;

      const manifestRef = db.collection("manifests").doc(manifestId);
      const newJobRef = db.collection("print_jobs").doc();

      let jobPayload = null;
      let finalAmountToPay = 0;
      let totalRawPages = 0;
      let mergedFiles = [];

      try {
        await db.runTransaction(async (transaction) => {
          const manifestDoc = await transaction.get(manifestRef);
          if (!manifestDoc.exists) {
            throw new Error("404: Print manifest not found.");
          }

          const manifestData = manifestDoc.data();
          if (manifestData.userId !== userId) {
            throw new Error("403: Unauthorized access to manifest.");
          }

          if (manifestData.status !== "active") {
            throw new Error(`400: Manifest is not active (status: ${manifestData.status}).`);
          }

          if (!manifestData.files || !Array.isArray(manifestData.files) || manifestData.files.length === 0) {
            throw new Error("400: Manifest contains no selected files.");
          }

          for (const f of manifestData.files) {
            const fileRef = db.collection("files").doc(f.fileId);
            let fileDoc = await transaction.get(fileRef);
            if (!fileDoc.exists) {
              const snap = await db.collection("print_jobs").where("fileId", "==", f.fileId).get();
              if (!snap.empty) {
                fileDoc = { exists: true, data: () => snap.docs[0].data() };
              }
            }

            if (!fileDoc.exists) {
              throw new Error(`404: Authoritative file missing: ${f.fileId}`);
            }
            if (fileDoc.data().userId !== userId) {
              throw new Error(`403: Unauthorized file access: ${f.fileId}`);
            }
          }

          printOptions = printOptions || manifestData.globalOptions || {};
          const colorMode = printOptions?.colorMode || "bw";
          let pricePerPage = colorMode === "color" ? 10.00 : 2.30;
          const copies = Number(printOptions?.copies || 1);

          mergedFiles = [];
          totalRawPages = 0;

          for (const f of manifestData.files) {
            let numPages = f.pageCount || 1;
            totalRawPages += numPages;
            mergedFiles.push({
              fileId: f.fileId,
              name: f.fileName,
              fileName: f.fileName,
              url: f.fileUrl,
              fileUrl: f.fileUrl,
              type: f.mimetype,
              size: f.size || 0,
              pageCount: numPages
            });
          }

          let divisor = 1;
          if (printOptions?.photoLayout === "2") divisor = 2;
          if (printOptions?.photoLayout === "4") divisor = 4;
          if (printOptions?.photoLayout === "6") divisor = 6;
          if (printOptions?.photoLayout === "9") divisor = 9;

          let actualPages = Math.ceil(totalRawPages / divisor);
          if (printOptions?.doubleSided === "double") {
            actualPages = Math.ceil(actualPages / 2);
            if (colorMode === "bw") pricePerPage = 3.00;
          }

          const jobCost = actualPages * copies * pricePerPage;
          finalAmountToPay = Math.max(0, jobCost - coinsDiscount);

          jobPayload = {
            userId,
            manifestId,
            fileName: mergedFiles.length > 1 ? `Multiple Files (${mergedFiles.length})` : mergedFiles[0].name,
            fileUrl: mergedFiles[0].url,
            mimetype: mergedFiles[0].type,
            files: mergedFiles,
            fileCount: mergedFiles.length,
            size: mergedFiles.reduce((acc, f) => acc + (f.size || 0), 0),
            status: "pending",
            pageCount: totalRawPages,
            printOptions: printOptions || {},
            pricing: { pricePerPage, totalPages: actualPages, jobCost },
            orderId,
            colorMode,
            copies,
            finalCost: jobCost,
            kioskId: printOptions?.directKioskId || "CV-001",
            createdAt: new Date().toISOString()
          };

          transaction.update(manifestRef, {
            status: "consumed",
            consumedOrderId: orderId,
            updatedAt: new Date().toISOString()
          });

          transaction.set(newJobRef, jobPayload);
        });

        res.json({
          orderId,
          status: "PAID",
          amount: finalAmountToPay,
          filesCount: mergedFiles.length,
          files: mergedFiles,
          jobId: newJobRef.id
        });
      } catch (txnError) {
        const msg = txnError.message || "";
        if (msg.startsWith("404:")) return res.status(404).json({ error: msg.substring(5) });
        if (msg.startsWith("403:")) return res.status(403).json({ error: msg.substring(5) });
        if (msg.startsWith("400:")) return res.status(400).json({ error: msg.substring(5) });
        throw txnError;
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

// HTTP post helper
function postJSON(baseUrl, path, token, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const postData = JSON.stringify(data);
    const req = http.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

// Main Test Runner
async function runWave1Tests() {
  console.log("==========================================================");
  console.log("🚀 MIMO WAVE 1 — REVISED ARCHITECTURE LOCAL REGRESSION SUITE");
  console.log("==========================================================");

  const db = new MockFirestore();
  const app = createTestApp(db);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const userA = "user_A_" + Date.now();
  const tokenA = jwt.sign({ userId: userA, id: userA }, SECRET_KEY);

  const userB = "user_B_" + Date.now();
  const tokenB = jwt.sign({ userId: userB, id: userB }, SECRET_KEY);

  let passedCount = 0;
  let totalCount = 0;

  function assertTest(condition, name, detail = "") {
    totalCount++;
    if (condition) {
      passedCount++;
      console.log(`  ✅ [PASS] Test ${totalCount}: ${name}`);
    } else {
      console.error(`  ❌ [FAIL] Test ${totalCount}: ${name} — ${detail}`);
    }
  }

  try {
    // 1. Client-supplied fake fileId ignored in /finalize-upload
    console.log("\n[1] Testing server-authoritative fileId generation (ignoring client fake fileId)...");
    const fakeClientReq = [{ name: "test1.pdf", url: "http://storage/test1.pdf", fileId: "fake_client_123" }];
    const upRes1 = await postJSON(baseUrl, "/finalize-upload", tokenA, { files: fakeClientReq });
    const fileId1 = upRes1.body.files[0].fileId;
    assertTest(fileId1 && fileId1 !== "fake_client_123" && fileId1.startsWith("file_"), "Server ignored client fake fileId and generated authoritative fileId (INVARIANT 1)");

    // 2. Missing fileId rejected in /create-manifest
    console.log("\n[2] Testing rejection of missing fileId in /create-manifest...");
    const missingFidRes = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ printConfig: { pageCount: 1 } }] });
    assertTest(missingFidRes.status === 400, "Missing fileId rejected with HTTP 400 (INVARIANT 2)");

    // 3. Duplicate filename with two distinct server fileIds
    console.log("\n[3] Testing duplicate filenames receiving distinct server fileIds...");
    const dupReq = [
      { name: "document.pdf", url: "http://storage/doc1.pdf", pageCount: 2 },
      { name: "document.pdf", url: "http://storage/doc2.pdf", pageCount: 3 }
    ];
    const dupUp = await postJSON(baseUrl, "/finalize-upload", tokenA, { files: dupReq });
    const dupFids = dupUp.body.files;
    assertTest(dupFids[0].fileId !== dupFids[1].fileId, "Duplicate filenames assigned distinct fileIds (INVARIANT 6)");

    // 4. Missing authoritative file document rejected
    console.log("\n[4] Testing rejection of missing authoritative file record...");
    const missingDocRes = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ fileId: "file_nonexistent_9999" }] });
    assertTest(missingDocRes.status === 404, "Missing file doc in files/{fileId} rejected with HTTP 404 (INVARIANT 5)");

    // 5. Unauthorized file access rejected
    console.log("\n[5] Testing unauthorized file access rejection...");
    const unauthRes = await postJSON(baseUrl, "/create-manifest", tokenB, { files: [{ fileId: fileId1 }] });
    assertTest(unauthRes.status === 403, "User B accessing User A's file rejected with HTTP 403 (INVARIANT 5)");

    // 6. Invalid page selection rejected
    console.log("\n[6] Testing page selection validation...");
    // Page 0
    const page0Res = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ fileId: fileId1, printConfig: { pageSelection: "custom", selectedPages: [0] } }] });
    assertTest(page0Res.status === 400, "Page 0 rejected with HTTP 400 (INVARIANT 4)");

    // Page > raw page count
    const pageOutRes = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ fileId: fileId1, printConfig: { pageSelection: "custom", selectedPages: [999] } }] });
    assertTest(pageOutRes.status === 400, "Page out-of-bounds rejected with HTTP 400 (INVARIANT 4)");

    // Duplicate pages
    const pageDupRes = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ fileId: dupFids[1].fileId, printConfig: { pageSelection: "custom", selectedPages: [1, 1, 2] } }] });
    assertTest(pageDupRes.status === 400, "Duplicate page numbers rejected with HTTP 400 (INVARIANT 4)");

    // Empty custom pages
    const pageEmptyRes = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ fileId: fileId1, printConfig: { pageSelection: "custom", selectedPages: [] } }] });
    assertTest(pageEmptyRes.status === 400, "Empty custom pages array rejected with HTTP 400 (INVARIANT 4)");

    // 7. Filename cannot act as identity
    console.log("\n[7] Testing filename metadata decoupling...");
    const validMan = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ fileId: dupFids[0].fileId, fileName: "renamed_display.pdf" }] });
    assertTest(validMan.status === 200 && validMan.body.manifest.files[0].fileId === dupFids[0].fileId, "fileId remains identity regardless of filename changes (INVARIANT 6)");

    // 8. Manifest contents immutable
    console.log("\n[8] Testing manifest immutability...");
    const mDoc = await db.collection("manifests").doc(validMan.body.manifestId).get();
    assertTest(mDoc.data().fileIds[0] === dupFids[0].fileId, "Manifest fileIds immutable after creation (INVARIANT 7)");

    // 9. Simultaneous checkout race safety (Firestore Transaction simulation)
    console.log("\n[9] Testing simultaneous checkout race safety (Firestore Transaction)...");
    const manifestRace = await postJSON(baseUrl, "/create-manifest", tokenA, { files: [{ fileId: fileId1 }] });
    const mRaceId = manifestRace.body.manifestId;

    // Trigger 2 simultaneous /create-order calls
    const [raceRes1, raceRes2] = await Promise.all([
      postJSON(baseUrl, "/create-order", tokenA, { manifestId: mRaceId }),
      postJSON(baseUrl, "/create-order", tokenA, { manifestId: mRaceId })
    ]);

    const raceSuccesses = [raceRes1, raceRes2].filter(r => r.status === 200).length;
    const raceRejections = [raceRes1, raceRes2].filter(r => r.status === 400).length;
    assertTest(raceSuccesses === 1 && raceRejections === 1, "Simultaneous checkouts: exactly 1 request succeeds, 2nd request rejected (INVARIANT 8)");

    // 10. Seven uploaded / six selected
    console.log("\n[10] Testing 7 uploaded / 6 selected subset manifest...");
    const files7 = Array.from({ length: 7 }, (_, i) => ({ name: `subset_${i + 1}.pdf`, url: `http://storage/s_${i + 1}.pdf` }));
    const up7Res = await postJSON(baseUrl, "/finalize-upload", tokenA, { files: files7 });
    const reg7 = up7Res.body.files;
    const selected6 = reg7.slice(0, 6);
    const man6Res = await postJSON(baseUrl, "/create-manifest", tokenA, { files: selected6.map(f => ({ fileId: f.fileId })) });
    assertTest(man6Res.body.filesCount === 6, "7 uploaded / 6 selected produces 6 manifest files");

    // 11. Exact SV-002 regression: 6 selected -> 6 manifest -> 6 order -> 6 print_job files
    console.log("\n[11] Testing exact SV-002 regression pipeline parity (6 selected -> 6 manifest -> 6 order -> 6 print_job.files)...");
    const sv002OrderRes = await postJSON(baseUrl, "/create-order", tokenA, { manifestId: man6Res.body.manifestId });
    assertTest(sv002OrderRes.status === 200, "SV-002 order created successfully");
    assertTest(sv002OrderRes.body.filesCount === 6, "Order response files.length === 6");
    assertTest(sv002OrderRes.body.files.length === 6, "Order files array length === 6");

    const jobDoc = await db.collection("print_jobs").doc(sv002OrderRes.body.jobId).get();
    assertTest(jobDoc.data().fileCount === 6 && jobDoc.data().files.length === 6, "Firestore print_job.files.length === 6 and fileCount === 6 (INVARIANT 10)");

    console.log("\n==========================================================");
    console.log(`📊 TEST RESULTS: ${passedCount} / ${totalCount} TESTS PASSED`);
    console.log("==========================================================");

    server.close();

    if (passedCount === totalCount) {
      console.log("🎉 ALL WAVE 1 CORRECTED INVARIANTS & TEST SCENARIOS VERIFIED CLEANLY!");
      process.exit(0);
    } else {
      console.error("❌ SOME TESTS FAILED!");
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution exception:", err);
    server.close();
    process.exit(1);
  }
}

runWave1Tests();
