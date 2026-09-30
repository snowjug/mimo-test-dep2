const { admin, db } = require("../config/firebase");
const { getPDFDocument } = require("../services/pdf.service");

async function createScannerSession(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const sessionRef = db.collection("scanner_sessions").doc();

  const sessionData = {
    userId,
    status: "created",
    pageCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await sessionRef.set(sessionData);

  return {
    sessionId: sessionRef.id,
    status: sessionData.status,
    pageCount: sessionData.pageCount,
  };
}

async function addScannerPage(userId, sessionId, pageNumber, fileData, mimeType) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error("pageNumber must be a positive integer");
  }

  if (!fileData || !Buffer.isBuffer(fileData)) {
    throw new Error("fileData must be a Buffer");
  }

  const normalizedMime = (mimeType || "").toLowerCase();
  let extension;
  let resolvedContentType;

  if (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg") {
    extension = "jpg";
    resolvedContentType = "image/jpeg";
  } else if (normalizedMime === "image/png") {
    extension = "png";
    resolvedContentType = "image/png";
  } else {
    throw new Error("mimeType must be image/jpeg, image/jpg, or image/png");
  }

  const sessionRef = db.collection("scanner_sessions").doc(sessionId);
  const sessionSnapshot = await sessionRef.get();

  if (!sessionSnapshot.exists) {
    throw new Error("Scanner session not found");
  }

  const sessionData = sessionSnapshot.data();

  if (sessionData.userId !== userId) {
    throw new Error("Scanner session does not belong to this user");
  }

  if (sessionData.status !== "created") {
    throw new Error("Scanner session is not available");
  }

  const pageId = `page-${String(pageNumber).padStart(3, "0")}`;
  const storagePath = `scanner/${sessionId}/${pageId}.${extension}`;

  const bucket = admin.storage().bucket();
  const fileRef = bucket.file(storagePath);

  await fileRef.save(fileData, {
    contentType: resolvedContentType,
    metadata: {
      contentType: resolvedContentType,
      cacheControl: "private, max-age=86400",
    },
  });

  const pageRef = sessionRef.collection("pages").doc(pageId);

  const pageData = {
    pageNumber,
    storagePath,
    contentType: resolvedContentType,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await pageRef.set(pageData);

  const pagesSnapshot = await sessionRef.collection("pages").get();

  await sessionRef.update({
    pageCount: pagesSnapshot.size,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    sessionId,
    pageNumber,
    pageId,
    storagePath,
    pageCount: pagesSnapshot.size,
    status: "uploaded",
  };
}

async function finalizeScannerSession(userId, sessionId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const sessionRef = db.collection("scanner_sessions").doc(sessionId);
  const sessionSnapshot = await sessionRef.get();

  if (!sessionSnapshot.exists) {
    throw new Error("Scanner session not found");
  }

  const sessionData = sessionSnapshot.data();

  if (sessionData.userId !== userId) {
    throw new Error("Scanner session does not belong to this user");
  }

  if (sessionData.status !== "created") {
    throw new Error("Scanner session is not available");
  }

  const pagesSnapshot = await sessionRef.collection("pages").get();

  if (pagesSnapshot.empty || pagesSnapshot.size === 0) {
    throw new Error("Scanner session has no uploaded pages");
  }

  // Load scanner pages ordered by pageNumber ascending
  const pageDocs = pagesSnapshot.docs.map((doc) => doc.data());
  pageDocs.sort((a, b) => (Number(a.pageNumber) || 0) - (Number(b.pageNumber) || 0));

  // Validate each page metadata
  for (const p of pageDocs) {
    if (!p.storagePath) {
      throw new Error("Invalid page metadata: missing storagePath");
    }
    const mime = (p.contentType || "").toLowerCase();
    if (mime !== "image/jpeg" && mime !== "image/jpg" && mime !== "image/png") {
      throw new Error(`Invalid page metadata: unsupported contentType ${p.contentType}`);
    }
  }

  const PDFDocument = getPDFDocument();
  const pdfDoc = await PDFDocument.create();
  const bucket = admin.storage().bucket();

  for (const p of pageDocs) {
    const [imageBuffer] = await bucket.file(p.storagePath).download();
    const mime = (p.contentType || "").toLowerCase();
    let embeddedImage;
    if (mime === "image/jpeg" || mime === "image/jpg") {
      embeddedImage = await pdfDoc.embedJpg(imageBuffer);
    } else if (mime === "image/png") {
      embeddedImage = await pdfDoc.embedPng(imageBuffer);
    }

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const pageCount = pdfDoc.getPageCount();

  const finalPdfStoragePath = `scanner/${sessionId}/scanned_document.pdf`;
  const finalPdfFile = bucket.file(finalPdfStoragePath);

  await finalPdfFile.save(pdfBuffer, {
    contentType: "application/pdf",
    metadata: {
      contentType: "application/pdf",
      cacheControl: "public, max-age=86400",
    },
  });

  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${finalPdfStoragePath}`;

  // Find the user's existing print_jobs with userId == current user and status == "pending"
  const staleJobs = await db.collection("print_jobs")
    .where("userId", "==", userId)
    .where("status", "==", "pending")
    .get();

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!staleJobs.empty) {
    staleJobs.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "abandoned",
        abandonedAt: now,
        updatedAt: now,
      });
    });
  }

  const printJobRef = db.collection("print_jobs").doc();
  batch.set(printJobRef, {
    userId,
    fileName: "scanned_document.pdf",
    fileUrl,
    mimetype: "application/pdf",
    size: pdfBuffer.length,
    status: "pending",
    pageCount,
    uploadedAt: now,
    retentionStartAt: now,
  });

  batch.update(sessionRef, {
    status: "completed",
    pageCount,
    updatedAt: now,
    jobId: printJobRef.id,
    pdfStoragePath: finalPdfStoragePath,
  });

  await batch.commit();

  return {
    sessionId,
    jobId: printJobRef.id,
    status: "completed",
    pageCount,
    fileName: "scanned_document.pdf",
  };
}

module.exports = {
  createScannerSession,
  addScannerPage,
  finalizeScannerSession,
};
