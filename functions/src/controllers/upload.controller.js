const path = require("path");
const { SUPPORTED_OFFICE_EXTENSIONS, callOfficeConverter } = require("../services/converter.service");
const { admin, db } = require("../config/firebase");
const { getPDFDocument } = require("../services/pdf.service");
const { isStoragePathReferencedByOtherActiveJob } = require("../services/storage.service");

// ================= FINAL UPLOAD (Serverless with Verified Office Conversion) =================
const postFinalizeUpload = async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || files.length === 0) return res.status(400).json({ error: "No files provided" });

    // Validate all files have real URLs before touching the database
    for (const f of files) {
      if (!f.url || f.url === "undefined" || !f.url.startsWith("http")) {
        console.error("Invalid fileUrl received:", f.url, "for file:", f.name);
        return res.status(400).json({ error: `Missing or invalid file URL for ${f.name}. Please re-upload.` });
      }
    }

    const userId = req.user.id || req.user.userId;

    // Phase 1: Validate and convert required files BEFORE performing any database writes.
    // If any conversion fails, return HTTP 422 immediately with 0 jobs written to Firestore.
    const finalizedFiles = [];
    let totalPages = 0;

    for (const f of files) {
      const ext = path.extname(f.name || "").toLowerCase();
      const isOfficeDoc = SUPPORTED_OFFICE_EXTENSIONS.has(ext);
      const isPdf = ext === ".pdf" || f.type === "application/pdf";
      const isImage = (typeof f.type === "string" && f.type.startsWith("image/")) || [".jpg", ".jpeg", ".png", ".webp", ".heic"].includes(ext);

      let resolvedPageCount = 1;
      let printableFileUrl = f.url;
      let printableMimetype = f.type || "application/octet-stream";
      let originalFileUrl = f.url;
      let convertedStoragePath = null;

      if (isPdf) {
        // PDF flow: client pdf-lib count is accurate; fallback to 1 if missing or invalid
        const rawCount = Number(f.pageCount);
        const isValidCount = Number.isInteger(rawCount) && rawCount > 0 && Number.isFinite(rawCount);
        resolvedPageCount = isValidCount ? rawCount : 1;
        printableMimetype = "application/pdf";
      } else if (isImage) {
        // Images are always 1 page
        resolvedPageCount = 1;
      } else if (isOfficeDoc) {
        // Office documents: DO NOT trust client pageCount.
        // Invoke Cloud Run converter to render PDF and extract exact page count.
        console.log(`[FINALIZE-UPLOAD] Converting Office document '${f.name}' via converter service...`);
        try {
          const conv = await callOfficeConverter({
            fileUrl: f.url,
            fileName: f.name,
            userId: userId
          });
          resolvedPageCount = conv.pageCount;
          printableFileUrl = conv.fileUrl; // Converted PDF becomes the printable file!
          printableMimetype = "application/pdf";
          convertedStoragePath = conv.storagePath;
          console.log(`[FINALIZE-UPLOAD] Office conversion succeeded for '${f.name}': ${resolvedPageCount} pages, printable PDF: ${printableFileUrl}`);
        } catch (convErr) {
          console.error(`[FINALIZE-UPLOAD ERROR] Conversion failed for '${f.name}':`, convErr.message);
          // CRITICAL: Fail fast. Do NOT create a payable job with unverified pageCount!
          return res.status(422).json({
            error: `Failed to process document '${f.name}': ${convErr.message}. Please ensure the file is valid and try again.`
          });
        }
      } else {
        // Unsupported non-office format: default to 1 or valid client count
        const rawCount = Number(f.pageCount);
        const isValidCount = Number.isInteger(rawCount) && rawCount > 0 && Number.isFinite(rawCount);
        resolvedPageCount = isValidCount ? rawCount : 1;
      }

      totalPages += resolvedPageCount;
      finalizedFiles.push({
        clientUploadId: f.clientUploadId || null,
        name: f.name,
        url: printableFileUrl,
        originalUrl: originalFileUrl,
        type: printableMimetype,
        size: f.size,
        pageCount: resolvedPageCount,
        convertedStoragePath: convertedStoragePath
      });
    }

    // Phase 2: Conversions succeeded for all files. Now update the database atomically.
    // Mark old pending jobs as abandoned to prevent ghost cart pricing while preserving storage ownership records
    const staleJobs = await db.collection("print_jobs").where("userId", "==", userId).where("status", "==", "pending").get();
    if (!staleJobs.empty) {
      const abandonBatch = db.batch();
      const now = admin.firestore.FieldValue.serverTimestamp();
      staleJobs.forEach((doc) => {
        abandonBatch.update(doc.ref, {
          status: "abandoned",
          abandonedAt: now,
          updatedAt: now
        });
      });
      await abandonBatch.commit();
    }

    // Create the pending print_jobs in Firestore with verified pageCount and converted PDF url
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const f of finalizedFiles) {
      const docRef = db.collection("print_jobs").doc();
      f.jobId = docRef.id;
      batch.set(docRef, {
        userId: userId,
        fileName: f.name,
        fileUrl: f.url, // Points to converted PDF for Office files!
        mimetype: f.type, // "application/pdf" for converted Office files!
        size: f.size,
        status: "pending",
        pageCount: f.pageCount, // Authoritative server-side page count!
        originalFileUrl: f.originalUrl !== f.url ? f.originalUrl : null,
        convertedStoragePath: f.convertedStoragePath || null,
        uploadedAt: now,
        retentionStartAt: now
      });
    }
    await batch.commit();

    res.json({
      message: "Jobs created successfully.",
      amount: totalPages * 2,
      totalPages: totalPages,
      files: finalizedFiles
    });
  } catch (err) {
    console.error("Error finalizing upload:", err);
    res.status(500).json({ error: err.message });
  }
};

// ================= GENERATE TEXT PDF =================
const postGenerateTextPdf = async (req, res, next) => {
  try {
    const { textContent, fontFamily, fontSize, lineSpacing, alignment, pageSize, margins } = req.body;
    if (!textContent) {
      return res.status(400).send("Text content is required");
    }

    // Map margin options
    let marginValue = 54; // default medium (0.75 inch)
    if (margins === "small") marginValue = 36; // 0.5 inch
    else if (margins === "large") marginValue = 72; // 1.0 inch

    // Map font family
    let mappedFont = "Helvetica";
    const fontLower = (fontFamily || "").toLowerCase();
    if (fontLower.includes("times") || fontLower.includes("georgia") || fontLower.includes("serif")) {
      mappedFont = "Times-Roman";
    } else if (fontLower.includes("courier") || fontLower.includes("mono")) {
      mappedFont = "Courier";
    }

    // Map line gap (PDFKit lineGap is extra space between lines in points)
    const size = Number(fontSize || 12);
    const lineGapValue = (parseFloat(lineSpacing || 1.15) - 1.0) * size;

    const PDFDocumentKit = require("pdfkit");

    // Generate PDF via PDFKit
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocumentKit({
        size: pageSize === "Letter" ? "LETTER" : "A4",
        margin: marginValue,
        autoFirstPage: true
      });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", err => reject(err));

      doc.font(mappedFont)
        .fontSize(size)
        .lineGap(lineGapValue)
        .text(textContent, {
          align: alignment === "justify" ? "justify" : alignment === "center" ? "center" : alignment === "right" ? "right" : "left"
        });

      doc.end();
    });

    // Get page count using pdf-lib
    const PDFDocument = getPDFDocument();
    const pdfLibDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfLibDoc.getPageCount();

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const safeFileName = "custom_document.pdf";
    const fileName = `files/${Date.now()}_${safeFileName}`;
    const fileUpload = bucket.file(fileName);
    await fileUpload.save(pdfBuffer, {
      contentType: "application/pdf",
      metadata: { cacheControl: "public, max-age=86400" },
    });
    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    res.json({
      name: "custom_document.pdf",
      url: fileUrl,
      type: "application/pdf",
      size: pdfBuffer.length,
      pageCount: pageCount
    });

  } catch (err) {
    next(err);
  }
};

// ================= CREATE BLANK JOB =================
const postCreateBlankJob = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { type, pageCount } = req.body; // "a4" or "graph"

    // 1. Mark superseded pending jobs as abandoned to prevent overcharging while preserving storage ownership records
    const existingJobs = await db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "==", "pending")
      .get();

    if (!existingJobs.empty) {
      const abandonBatch = db.batch();
      const now = admin.firestore.FieldValue.serverTimestamp();
      existingJobs.forEach((doc) => {
        abandonBatch.update(doc.ref, {
          status: "abandoned",
          abandonedAt: now,
          updatedAt: now
        });
      });
      await abandonBatch.commit();
    }

    // 2. Create the blank job
    const isGraph = type === "graph";
    const fileName = isGraph ? "mimo_graph.pdf" : "blank_a4.pdf";
    const actualUrl = isGraph
      ? "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fmimo_graph.pdf"
      : "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fblank_a4.pdf";

    // Determine exact size based on uploaded files
    const fileSize = isGraph ? 1806 : 583;
    const now = admin.firestore.FieldValue.serverTimestamp();

    const docRef = await db.collection("print_jobs").add({
      userId,
      fileName,
      documentUrl: actualUrl,
      fileUrl: actualUrl,
      mimetype: "application/pdf",
      fileSize: fileSize,
      fileType: "pdf",
      isImage: false,
      createdAt: now,
      updatedAt: now,
      retentionStartAt: now,
      status: "pending",
      pageCount: 1, // The physical PDF template is exactly 1 page. The quantity is controlled purely by 'copies'.
      files: [{ name: fileName, size: fileSize, type: "application/pdf", url: actualUrl }],
      printOptions: { copies: Number(pageCount) || 1, colorMode: "bw", layout: "single", duplexMode: "simplex", isBlankSheet: true, sheetType: type },
      pricing: { pricePerPage: isGraph ? 2.0 : 2.80, totalPages: Number(pageCount) || 1 },
      paymentStatus: { status: "pending" },
      printStatus: { status: "pending" }
    });

    res.json({ message: "Blank job queued successfully", jobId: docRef.id });
  } catch (err) {
    next(err);
  }
};

// ================= REMOVE ABANDONED FILE =================
const deleteRemoveFile = async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!fileUrl) return res.status(400).json({ error: "Missing fileUrl" });

    // Find the pending print job in Firestore
    const jobsSnapshot = await db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("fileUrl", "==", fileUrl)
      .where("status", "==", "pending")
      .get();

    if (jobsSnapshot.empty) {
      return res.status(404).json({ error: "File not found or already processed" });
    }

    const bucket = admin.storage().bucket();
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const doc of jobsSnapshot.docs) {
      const data = doc.data();
      const rawPaths = [
        data.fileUrl,
        data.originalFileUrl,
        data.convertedStoragePath
      ].filter(Boolean);

      for (const raw of rawPaths) {
        let filePath = "";
        if (raw.startsWith("gs://")) {
          const bucketName = bucket.name;
          filePath = raw.replace(`gs://${bucketName}/`, "");
        } else if (raw.includes("firebasestorage.googleapis.com")) {
          try {
            const urlObj = new URL(raw);
            const pathParts = urlObj.pathname.split("/o/");
            if (pathParts.length > 1) {
              filePath = decodeURIComponent(pathParts[1].split("?")[0]);
            }
          } catch (_) {}
        } else if (raw.includes("storage.googleapis.com")) {
          try {
            const urlObj = new URL(raw);
            const pathname = decodeURIComponent(urlObj.pathname);
            const bucketName = bucket.name;
            const prefix = `/${bucketName}/`;
            if (pathname.startsWith(prefix)) {
              filePath = pathname.slice(prefix.length);
            } else if (pathname.startsWith("/")) {
              filePath = pathname.slice(1);
            }
          } catch (_) {}
        } else if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
          filePath = raw;
        }

        // Never delete shared template files
        const isTemplate = filePath.toLowerCase().includes("templates/blank_a4.pdf") ||
                           filePath.toLowerCase().includes("templates/mimo_graph.pdf") ||
                           filePath.toLowerCase().startsWith("templates/");

        if (filePath && !isTemplate) {
          // Check if another active job still references this path globally across all users
          const isReferenced = await isStoragePathReferencedByOtherActiveJob(db, filePath, doc.id);

          if (!isReferenced) {
            await bucket.file(filePath).delete().catch((e) => {
              if (e.code !== 404) console.error("[REMOVE-FILE] Storage delete error:", e.message);
            });
          }
        }
      }

      // Preserve document record in Firestore with status: "cleaned", fileDeleted: true
      batch.update(doc.ref, {
        status: "cleaned",
        fileDeleted: true,
        fileDeletedAt: now,
        removedByUser: true,
        updatedAt: now
      });
    }

    await batch.commit();

    res.json({ message: "File successfully deleted from cloud" });
  } catch (err) {
    console.error("Error removing file:", err);
    res.status(500).json({ error: "Failed to remove file" });
  }
};

module.exports = {
  postFinalizeUpload,
  postGenerateTextPdf,
  postCreateBlankJob,
  deleteRemoveFile,
};
