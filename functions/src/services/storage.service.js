// ================= 24-HOUR FILE RETENTION CLEANUP (SCHEDULED) =================
/**
 * Normalizes and extracts the relative GCS storage path from any supported URL scheme.
 */
function extractStoragePath(fileUrl, bucketName) {
  if (!fileUrl || typeof fileUrl !== "string") return null;

  if (fileUrl.startsWith("gs://")) {
    return fileUrl.replace(`gs://${bucketName}/`, "");
  }

  if (fileUrl.includes("firebasestorage.googleapis.com")) {
    try {
      const urlObj = new URL(fileUrl);
      const pathParts = urlObj.pathname.split("/o/");
      if (pathParts.length > 1) {
        return decodeURIComponent(pathParts[1].split("?")[0]);
      }
    } catch (_) {}
  }

  if (fileUrl.includes("storage.googleapis.com")) {
    try {
      const urlObj = new URL(fileUrl);
      const pathname = decodeURIComponent(urlObj.pathname);
      const prefix = `/${bucketName}/`;
      if (pathname.startsWith(prefix)) {
        return pathname.slice(prefix.length);
      } else if (pathname.startsWith("/")) {
        return pathname.slice(1);
      }
    } catch (_) {}
  }

  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  return null;
}

/**
 * Checks whether a given storage path belongs to an immutable shared template.
 */
function isProtectedTemplate(storagePath) {
  if (!storagePath || typeof storagePath !== "string") return false;
  const lower = storagePath.toLowerCase().trim();
  return lower.startsWith("templates/") ||
         lower.includes("templates/blank_a4.pdf") ||
         lower.includes("templates/mimo_graph.pdf");
}

/**
 * Extracts and deduplicates all potential storage paths associated with a print job document.
 */
function discoverStoragePaths(data, bucketName) {
  const paths = new Set();
  const add = (urlOrPath) => {
    const p = extractStoragePath(urlOrPath, bucketName);
    if (p) paths.add(p);
  };

  if (data.fileUrl) add(data.fileUrl);
  if (data.originalFileUrl) add(data.originalFileUrl);
  if (data.originalUrl) add(data.originalUrl);
  if (data.convertedStoragePath) add(data.convertedStoragePath);

  if (Array.isArray(data.files)) {
    for (const f of data.files) {
      if (!f || typeof f !== "object") continue;
      if (f.url) add(f.url);
      if (f.originalFileUrl) add(f.originalFileUrl);
      if (f.originalUrl) add(f.originalUrl);
      if (f.convertedStoragePath) add(f.convertedStoragePath);
    }
  }

  return Array.from(paths);
}

/**
 * Resolves the authoritative retention start timestamp, applying canonical fallback for legacy records.
 */
function getRetentionStartTime(data) {
  if (data.retentionStartAt) {
    const d = data.retentionStartAt.toDate ? data.retentionStartAt.toDate() : new Date(data.retentionStartAt);
    if (!isNaN(d.getTime())) return d;
  }

  // Audited fallback ordering for legacy records lacking retentionStartAt
  const fallbacks = [data.codeCreatedAt, data.paymentTime, data.uploadedAt, data.createdAt];
  for (const fb of fallbacks) {
    if (fb) {
      const d = fb.toDate ? fb.toDate() : new Date(fb);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

/**
 * Checks if another active job (pending, paid, printing) still references this storage path globally across all users.
 */
async function isStoragePathReferencedByOtherActiveJob(db, filePath, excludeJobId, _userId) {
  const activeSnapshot = await db.collection("print_jobs")
    .where("status", "in", ["pending", "paid", "printing"])
    .get();

  const matchesPath = (candidate) => {
    if (!candidate || typeof candidate !== "string") return false;
    try {
      if (candidate.includes(filePath)) return true;
      if (decodeURIComponent(candidate).includes(filePath)) return true;
      if (candidate.includes(encodeURIComponent(filePath))) return true;
    } catch (_) {}
    return false;
  };

  for (const oDoc of activeSnapshot.docs) {
    if (oDoc.id === excludeJobId) continue;
    const oData = oDoc.data();
    if (oData.fileDeleted === true) continue;

    if (matchesPath(oData.fileUrl)) return true;
    if (matchesPath(oData.originalFileUrl)) return true;
    if (matchesPath(oData.originalUrl)) return true;
    if (matchesPath(oData.convertedStoragePath)) return true;

    if (Array.isArray(oData.files)) {
      for (const f of oData.files) {
        if (!f || typeof f !== "object") continue;
        if (matchesPath(f.url)) return true;
        if (matchesPath(f.originalFileUrl)) return true;
        if (matchesPath(f.originalUrl)) return true;
        if (matchesPath(f.convertedStoragePath)) return true;
      }
    }
  }

  return false;
}

module.exports = {
  discoverStoragePaths,
  getRetentionStartTime,
  isProtectedTemplate,
  isStoragePathReferencedByOtherActiveJob,
};
