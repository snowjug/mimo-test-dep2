const { admin, db } = require("../config/firebase");
const { getPDFDocument } = require("../services/pdf.service");
const { degrees } = require("pdf-lib");

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

async function getScannerSession(userId, sessionId) {
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
  const pagesList = pagesSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      pageId: doc.id,
      pageNumber: data.pageNumber,
      contentType: data.contentType,
      storagePath: data.storagePath,
      rotation: data.rotation ?? 0,
    };
  });

  pagesList.sort((a, b) => (Number(a.pageNumber) || 0) - (Number(b.pageNumber) || 0));

  return {
    sessionId,
    status: sessionData.status,
    pageCount: pagesList.length,
    pages: pagesList,
    createdAt: sessionData.createdAt,
    updatedAt: sessionData.updatedAt,
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
    rotation: 0,
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

async function deleteScannerPage(userId, sessionId, pageId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  if (!pageId) {
    throw new Error("pageId is required");
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

  const pageRef = sessionRef.collection("pages").doc(pageId);
  const pageSnapshot = await pageRef.get();

  if (!pageSnapshot.exists) {
    throw new Error("Page not found in this session");
  }

  const pageData = pageSnapshot.data();

  if (pageData.storagePath && pageData.storagePath.startsWith(`scanner/${sessionId}/`)) {
    try {
      const bucket = admin.storage().bucket();
      const fileRef = bucket.file(pageData.storagePath);
      if (typeof fileRef.delete === "function") {
        await fileRef.delete({ ignoreNotFound: true }).catch(() => {});
      }
    } catch (err) {
      console.warn(`[SCANNER SERVICE] Failed to delete storage file ${pageData.storagePath}:`, err.message);
    }
  }

  await pageRef.delete();

  const remainingPagesSnapshot = await sessionRef.collection("pages").get();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await sessionRef.update({
    pageCount: remainingPagesSnapshot.size,
    updatedAt: now,
  });

  return {
    sessionId,
    pageId,
    pageCount: remainingPagesSnapshot.size,
    status: "deleted",
  };
}

async function reorderScannerPages(userId, sessionId, order) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  if (!Array.isArray(order) || order.length === 0) {
    throw new Error("order must be a non-empty array of page IDs");
  }

  for (const id of order) {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("order must contain only valid string page IDs");
    }
  }

  const uniqueIds = new Set(order);
  if (uniqueIds.size !== order.length) {
    throw new Error("order contains duplicate page IDs");
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

  if (pagesSnapshot.size !== order.length) {
    throw new Error(`order must include all ${pagesSnapshot.size} pages in the session`);
  }

  const existingPageMap = new Map();
  pagesSnapshot.docs.forEach((doc) => {
    existingPageMap.set(doc.id, doc.ref);
  });

  for (const pageId of order) {
    if (!existingPageMap.has(pageId)) {
      throw new Error(`Page ${pageId} does not belong to this session`);
    }
  }

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  order.forEach((pageId, index) => {
    const newPageNumber = index + 1;
    const pageRef = existingPageMap.get(pageId);
    batch.update(pageRef, {
      pageNumber: newPageNumber,
      updatedAt: now,
    });
  });

  batch.update(sessionRef, {
    updatedAt: now,
  });

  await batch.commit();

  return {
    sessionId,
    order,
    pageCount: order.length,
    status: "reordered",
  };
}

async function updateScannerPage(userId, sessionId, pageId, updates) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  if (!pageId) {
    throw new Error("pageId is required");
  }

  if (!updates || typeof updates !== "object") {
    throw new Error("updates object is required");
  }

  const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);
  if (
    typeof updates.rotation !== "number" ||
    !ALLOWED_ROTATIONS.has(updates.rotation)
  ) {
    throw new Error("rotation must be one of: 0, 90, 180, 270");
  }

  const rotation = updates.rotation;

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

  const pageRef = sessionRef.collection("pages").doc(pageId);
  const pageSnapshot = await pageRef.get();

  if (!pageSnapshot.exists) {
    throw new Error("Page not found in this session");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  await pageRef.update({
    rotation,
    updatedAt: now,
  });

  await sessionRef.update({
    updatedAt: now,
  });

  return {
    sessionId,
    pageId,
    rotation,
    status: "updated",
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
    const imageBytes = new Uint8Array(imageBuffer);
    if (mime === "image/jpeg" || mime === "image/jpg") {
      embeddedImage = await pdfDoc.embedJpg(imageBytes);
    } else if (mime === "image/png") {
      embeddedImage = await pdfDoc.embedPng(imageBytes);
    }

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });

    const rotation = Number(p.rotation) || 0;
    if (rotation && [90, 180, 270].includes(rotation)) {
      page.setRotation(degrees(rotation));
    }
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const pageCount = pdfDoc.getPageCount();

  const MAX_PDF_SIZE_BYTES = 500 * 1024; // 500 KB hard limit
  if (pdfBuffer.length > MAX_PDF_SIZE_BYTES) {
    throw new Error(`Scanned document PDF size (${(pdfBuffer.length / 1024).toFixed(1)} KB) exceeds maximum allowed size of 500 KB`);
  }

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
  getScannerSession,
  addScannerPage,
  deleteScannerPage,
  reorderScannerPages,
  updateScannerPage,
  finalizeScannerSession,
};
