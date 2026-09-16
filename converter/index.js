const express = require("express");
const admin = require("firebase-admin");
const { PDFDocument } = require("pdf-lib");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
app.use(express.json({ limit: "25mb" }));

// ── Environment Configuration ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "8080", 10);
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "mimo-v2-11868.firebasestorage.app";
const INTERNAL_SECRET = process.env.INTERNAL_CONVERTER_SECRET || "";
const CONVERSION_TIMEOUT_MS = parseInt(process.env.CONVERSION_TIMEOUT_MS || "60000", 10);

// Supported document extensions
const SUPPORTED_OFFICE_EXTENSIONS = new Set([
  ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls",
  ".odt", ".ods", ".odp", ".rtf", ".txt"
]);

// ── Initialize Firebase Admin ────────────────────────────────────────────────
// In Cloud Run, Application Default Credentials (ADC) are discovered automatically.
let bucket = null;
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      storageBucket: STORAGE_BUCKET
    });
  }
  bucket = admin.storage().bucket();
  console.log(`[INIT] Firebase Admin initialized with bucket: ${STORAGE_BUCKET}`);
} catch (initErr) {
  console.warn(`[INIT] Firebase Admin initialization warning: ${initErr.message}. (Local tests can still use direct files).`);
}

// ── Resolve LibreOffice Binary ───────────────────────────────────────────────
function getLibreOfficeBinary() {
  if (process.env.LIBREOFFICE_PATH && fs.existsSync(process.env.LIBREOFFICE_PATH)) {
    return process.env.LIBREOFFICE_PATH;
  }

  // Windows standard paths
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return "soffice.com";
  }

  // Linux standard paths (Cloud Run container)
  const linuxCandidates = [
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
    "/usr/lib/libreoffice/program/soffice"
  ];
  for (const cand of linuxCandidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return "libreoffice";
}

// ── Helper: Extract Storage Path from URL ────────────────────────────────────
function extractStoragePathFromUrl(fileUrl, bucketName) {
  if (!fileUrl || typeof fileUrl !== "string") return null;

  if (fileUrl.startsWith("gs://")) {
    return fileUrl.replace(`gs://${bucketName}/`, "");
  }

  if (fileUrl.includes("firebasestorage.googleapis.com")) {
    const urlObj = new URL(fileUrl);
    const pathParts = urlObj.pathname.split("/o/");
    if (pathParts.length > 1) {
      return decodeURIComponent(pathParts[1].split("?")[0]);
    }
  }

  if (fileUrl.includes("storage.googleapis.com")) {
    const urlObj = new URL(fileUrl);
    const pathname = decodeURIComponent(urlObj.pathname);
    const prefix = `/${bucketName}/`;
    if (pathname.startsWith(prefix)) {
      return pathname.slice(prefix.length);
    }
  }

  return null;
}

// ── Authentication Middleware ────────────────────────────────────────────────
function authenticateRequest(req, res, next) {
  // If no internal secret is configured, Cloud Run IAM handles service-to-service auth
  if (!INTERNAL_SECRET) {
    return next();
  }

  const incomingSecret =
    req.headers["x-internal-secret"] ||
    (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (!incomingSecret || incomingSecret !== INTERNAL_SECRET) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid or missing internal converter secret",
      code: "UNAUTHORIZED"
    });
  }

  next();
}

// ── Health Check Endpoint ────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "healthy",
    service: "mimo-office-converter",
    libreoffice: getLibreOfficeBinary(),
    platform: process.platform,
    nodeVersion: process.version
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ── Core Conversion Function ─────────────────────────────────────────────────
async function runLibreOfficeConversion(inputFilePath, outputDir, timeoutMs = CONVERSION_TIMEOUT_MS) {
  const libreBinary = getLibreOfficeBinary();

  // Create an isolated profile directory in the temporary workspace to prevent lock collisions
  const profileDir = path.join(outputDir, "lo_profile");
  fs.mkdirSync(profileDir, { recursive: true });
  const profileUri = (process.platform === "win32" ? "/" : "") + profileDir.replace(/\\/g, "/");

  const args = [
    "--headless",
    "--nologo",
    "--nodefault",
    "--nofirststartwizard",
    `-env:UserInstallation=file://${profileUri}`,
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    inputFilePath
  ];

  return new Promise((resolve, reject) => {
    let killed = false;
    const child = execFile(libreBinary, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed || killed) {
          return reject(new Error(`LibreOffice conversion timed out after ${timeoutMs}ms`));
        }
        return reject(new Error(`LibreOffice exited with error: ${error.message}. Stderr: ${stderr || "(none)"}`));
      }
      resolve({ stdout, stderr });
    });

    // Enforce hard process kill if timeout occurs
    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill("SIGKILL");
      } catch (_) {}
    }, timeoutMs + 1000);

    child.on("exit", () => clearTimeout(timer));
  });
}

// ── POST /convert Endpoint ───────────────────────────────────────────────────
app.post("/convert", authenticateRequest, async (req, res) => {
  const startTime = Date.now();
  let tempWorkDir = null;

  try {
    let { storagePath, fileUrl, fileName, jobId, localFilePath } = req.body;

    // Resolve Storage Path
    if (!storagePath && fileUrl) {
      storagePath = extractStoragePathFromUrl(fileUrl, STORAGE_BUCKET);
    }

    // Derive unique base name and extension from storagePath (which contains the unique timestamp/prefix), fallback to fileName
    const storageFileName = storagePath ? path.basename(storagePath) : (localFilePath ? path.basename(localFilePath) : (fileName || "document.docx"));
    const ext = path.extname(storageFileName).toLowerCase();

    // Validate extension
    if (!SUPPORTED_OFFICE_EXTENSIONS.has(ext) && ext !== ".pdf") {
      return res.status(400).json({
        success: false,
        error: `Unsupported file format: '${ext}'. Supported formats: ${Array.from(SUPPORTED_OFFICE_EXTENSIONS).join(", ")}`,
        code: "UNSUPPORTED_FORMAT"
      });
    }

    // Prevent path traversal
    if (storagePath && storagePath.includes("..")) {
      return res.status(400).json({
        success: false,
        error: "Invalid storage path: traversal not permitted",
        code: "INVALID_PATH"
      });
    }

    // Create isolated temporary directory
    tempWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "mimo_conv_"));
    const safeBaseName = path.basename(storageFileName, ext).replace(/[^a-zA-Z0-9._-]/g, "_");
    const localInputPath = path.join(tempWorkDir, `${safeBaseName}${ext}`);

    // Download file from Storage (or read from local file if passed in test mode)
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.copyFileSync(localFilePath, localInputPath);
    } else if (storagePath) {
      if (!bucket) {
        throw new Error("Firebase Storage bucket not configured or initialized");
      }
      const fileObj = bucket.file(storagePath);
      const [exists] = await fileObj.exists();
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: `Source file does not exist in Storage at path: ${storagePath}`,
          code: "FILE_NOT_FOUND"
        });
      }
      await fileObj.download({ destination: localInputPath });
    } else {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: 'storagePath' or 'fileUrl'",
        code: "MISSING_SOURCE"
      });
    }

    let generatedPdfPath = null;
    let pageCount = 0;

    if (ext === ".pdf") {
      // If already a PDF, verify and extract page count directly without conversion
      generatedPdfPath = localInputPath;
      const pdfBytes = fs.readFileSync(generatedPdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
    } else {
      // Execute headless LibreOffice conversion
      await runLibreOfficeConversion(localInputPath, tempWorkDir, CONVERSION_TIMEOUT_MS);

      // LibreOffice names output file by base name + .pdf
      const expectedPdfName = `${safeBaseName}.pdf`;
      generatedPdfPath = path.join(tempWorkDir, expectedPdfName);

      // Check if output exists
      if (!fs.existsSync(generatedPdfPath)) {
        // Fallback: check for any generated PDF in the directory
        const filesInDir = fs.readdirSync(tempWorkDir);
        const pdfFile = filesInDir.find(f => f.toLowerCase().endsWith(".pdf"));
        if (pdfFile) {
          generatedPdfPath = path.join(tempWorkDir, pdfFile);
        } else {
          throw new Error("LibreOffice finished but no PDF output file was produced");
        }
      }

      const pdfStats = fs.statSync(generatedPdfPath);
      if (pdfStats.size === 0) {
        throw new Error("LibreOffice produced an empty (0 bytes) PDF");
      }

      // Load PDF via pdf-lib to get exact rendered page count
      const pdfBytes = fs.readFileSync(generatedPdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();

      if (pageCount < 1) {
        throw new Error("pdf-lib reported 0 pages for converted PDF");
      }
    }

    // Determine deterministic Storage path for converted PDF
    // Example: converted/{userOrJobId}/{safeBaseName}.pdf
    let convertedStoragePath = null;
    let convertedFileUrl = null;

    if (storagePath && bucket) {
      // Deduce user directory from uploads/{user}/... if present
      let userSubDir = "general";
      if (storagePath.startsWith("uploads/")) {
        const parts = storagePath.split("/");
        if (parts.length >= 3) {
          userSubDir = parts[1];
        }
      }
      if (jobId) {
        userSubDir = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
      }

      convertedStoragePath = `converted/${userSubDir}/${safeBaseName}.pdf`;

      await bucket.upload(generatedPdfPath, {
        destination: convertedStoragePath,
        contentType: "application/pdf",
        metadata: {
          cacheControl: "public, max-age=86400",
          metadata: {
            originalStoragePath: storagePath,
            convertedAt: new Date().toISOString(),
            pageCount: String(pageCount)
          }
        }
      });

      convertedFileUrl = `https://storage.googleapis.com/${STORAGE_BUCKET}/${convertedStoragePath}`;
    }

    const durationMs = Date.now() - startTime;
    console.log(`[CONVERT] Successfully converted ${storageFileName} -> ${pageCount} pages in ${durationMs}ms`);

    return res.json({
      success: true,
      pageCount: pageCount,
      storagePath: convertedStoragePath,
      fileUrl: convertedFileUrl,
      originalStoragePath: storagePath || null,
      originalFileName: storageFileName,
      durationMs: durationMs
    });

  } catch (err) {
    console.error("[CONVERT ERROR]", err);
    return res.status(500).json({
      success: false,
      error: `Conversion failed: ${err.message}`,
      code: "CONVERSION_ERROR"
    });
  } finally {
    // Clean up temporary workspace directory
    if (tempWorkDir && fs.existsSync(tempWorkDir)) {
      try {
        fs.rmSync(tempWorkDir, { recursive: true, force: true });
      } catch (cleanErr) {
        console.warn(`[CLEANUP] Failed to remove temp directory ${tempWorkDir}:`, cleanErr.message);
      }
    }
  }
});

// ── Start Server ─────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Mimo Office Converter service listening on port ${PORT}`);
    console.log(`LibreOffice binary: ${getLibreOfficeBinary()}`);
  });
}

module.exports = { app, runLibreOfficeConversion, getLibreOfficeBinary };
