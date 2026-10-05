const Busboy = require("busboy");
const {
  createScannerSession,
  getScannerSession,
  addScannerPage,
  deleteScannerPage,
  reorderScannerPages,
  updateScannerPage,
  finalizeScannerSession,
} = require("./scanner.service");

const MAX_PAGE_BYTES = 10 * 1024 * 1024; // 10MB limit
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

function parseScannerPageUpload(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data")) {
      return resolve(null);
    }

    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_PAGE_BYTES },
    });

    let file = null;
    const fields = {};
    let tooLarge = false;

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (fieldname, stream, info) => {
      const chunks = [];
      stream.on("data", (d) => chunks.push(d));
      stream.on("limit", () => {
        tooLarge = true;
      });
      stream.on("end", () => {
        file = {
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimeType: (info.mimeType || "").toLowerCase(),
        };
      });
    });

    bb.on("error", reject);
    bb.on("close", () => {
      if (tooLarge) {
        return reject(Object.assign(new Error("File too large (max 10MB)"), { status: 413 }));
      }
      resolve({ file, fields });
    });

    if (req.rawBody && (Buffer.isBuffer(req.rawBody) || typeof req.rawBody === "string")) {
      bb.end(req.rawBody);
    } else if (typeof req.pipe === "function") {
      if (typeof req.on === "function") {
        req.on("error", reject);
      }
      req.pipe(bb);
    } else {
      resolve(null);
    }
  });
}

const postCreateSession = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await createScannerSession(userId);
    res.status(201).json(result);
  } catch (err) {
    console.error("[SCANNER CONTROLLER] Error creating session:", err);
    res.status(500).json({ error: err.message || "Failed to create scanner session" });
  }
};

const getSession = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const result = await getScannerSession(userId, sessionId);
    res.status(200).json(result);
  } catch (err) {
    console.error("[SCANNER CONTROLLER] Error getting session:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes("does not belong")) {
      return res.status(403).json({ error: err.message });
    }
    if (
      err.message.includes("is required") ||
      err.message.includes("not available")
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Failed to get scanner session" });
  }
};

const postAddPage = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const parsed = await parseScannerPageUpload(req);
    if (!parsed || !parsed.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const { file, fields } = parsed;

    // Validate MIME type (JPEG and PNG only)
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      return res.status(400).json({
        error: `Unsupported image type: ${file.mimeType || "unknown"}. Only JPEG and PNG are supported.`,
      });
    }

    const rawPageNumber = fields.pageNumber ?? req.body?.pageNumber;
    if (rawPageNumber === undefined || rawPageNumber === null || String(rawPageNumber).trim() === "") {
      return res.status(400).json({ error: "pageNumber is required" });
    }

    const pageNumber = Number(rawPageNumber);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return res.status(400).json({ error: "pageNumber must be a positive integer" });
    }

    const result = await addScannerPage(userId, sessionId, pageNumber, file.buffer, file.mimeType);
    res.status(200).json(result);
  } catch (err) {
    console.error("[SCANNER CONTROLLER] Error adding page:", err);
    if (err.status === 413) {
      return res.status(413).json({ error: "Photo too large (max 10MB)" });
    }
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes("does not belong")) {
      return res.status(403).json({ error: err.message });
    }
    if (
      err.message.includes("is required") ||
      err.message.includes("must be") ||
      err.message.includes("not available")
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Failed to add scanner page" });
  }
};

const deletePage = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId, pageId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    if (!pageId) {
      return res.status(400).json({ error: "pageId is required" });
    }

    const result = await deleteScannerPage(userId, sessionId, pageId);
    res.status(200).json(result);
  } catch (err) {
    console.error("[SCANNER CONTROLLER] Error deleting page:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes("does not belong")) {
      return res.status(403).json({ error: err.message });
    }
    if (
      err.message.includes("is required") ||
      err.message.includes("not available")
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Failed to delete scanner page" });
  }
};

const postReorderPages = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const { order } = req.body || {};
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array of page IDs" });
    }

    const result = await reorderScannerPages(userId, sessionId, order);
    res.status(200).json(result);
  } catch (err) {
    console.error("[SCANNER CONTROLLER] Error reordering pages:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes("does not belong")) {
      return res.status(403).json({ error: err.message });
    }
    if (
      err.message.includes("is required") ||
      err.message.includes("not available") ||
      err.message.includes("order") ||
      err.message.includes("duplicate") ||
      err.message.includes("belong") ||
      err.message.includes("missing") ||
      err.message.includes("include all") ||
      err.message.includes("no uploaded pages")
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Failed to reorder scanner pages" });
  }
};

const patchPage = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId, pageId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    if (!pageId) {
      return res.status(400).json({ error: "pageId is required" });
    }

    const result = await updateScannerPage(userId, sessionId, pageId, req.body);
    res.status(200).json(result);
  } catch (err) {
    console.error("[SCANNER CONTROLLER] Error updating page:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes("does not belong")) {
      return res.status(403).json({ error: err.message });
    }
    if (
      err.message.includes("is required") ||
      err.message.includes("not available") ||
      err.message.includes("rotation") ||
      err.message.includes("updates")
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Failed to update scanner page" });
  }
};

const postFinalizeSession = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const result = await finalizeScannerSession(userId, sessionId);
    res.status(200).json(result);
  } catch (err) {
    console.error("[SCANNER CONTROLLER] Error finalizing session:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes("does not belong")) {
      return res.status(403).json({ error: err.message });
    }
    if (
      err.message.includes("is required") ||
      err.message.includes("not available") ||
      err.message.includes("no uploaded pages") ||
      err.message.includes("metadata") ||
      err.message.includes("unsupported")
    ) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Failed to finalize scanner session" });
  }
};

module.exports = {
  parseScannerPageUpload,
  postCreateSession,
  getSession,
  postAddPage,
  deletePage,
  postReorderPages,
  patchPage,
  postFinalizeSession,
};
