import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MimoHeader } from "../components/mimo-header";
import { ActionBar, ActionBarSpacer, Group, PrimaryButton, Row, StatusPill, TextButton } from "../components/mimo/ui";
import { FileText, X, ImageIcon, File as FileIcon, Grid3X3, Copy, Plus, PenLine, Camera, Loader2, ChevronRight, Clock } from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { AdBanner } from "../components/AdBanner";
import { getTimeLeft, isCodeActive } from "../utils/print-code-expiry";
import { describeUploadFailure, failedFilesMessage } from "../utils/upload-errors";

interface UploadedFile {
  clientUploadId?: string;
  name: string;
  size: number;
  type?: string;
  status: "uploading" | "completed" | "failed";
  progress: number;
  pageCount?: number;
}

interface ActivePrintCodeJob {
  id: string;
  printCode: string;
  status: string;
  printerStatus?: string;
  fileName?: string;
  file?: string;
  createdAtTime?: number;
  createdAt?: any;
  totalPages?: number;
  totalPagesToPrint?: number;
  copiesRequested?: number;
  copies?: number;
  colorMode?: string;
  pageCount?: number;
  details?: string;
  cost?: string;
  date?: string;
  isPrinted?: boolean;
}

interface ActiveUpload {
  clientUploadId: string;
  name: string;
  file?: File;
  uploadTask?: any;
  downloadURL?: string;
  jobId?: string;
  isCancelled: boolean;
}

const estimateDocxPages = async (file: File): Promise<number> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    // Find End of Central Directory (EOCD) signature: 0x06054b50
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return 1;
    }

    const cdCount = view.getUint16(eocdOffset + 10, true);
    const cdStartOffset = view.getUint32(eocdOffset + 16, true);

    let words = 0;
    let pagesMetadata = 0;
    let paragraphs = 0;
    let pageBreaks = 0;

    const decompressEntry = async (
      dataOffset: number,
      compSize: number
    ): Promise<string> => {
      if (compSize === 0) return "";

      const compressedData = buffer.slice(
        dataOffset,
        dataOffset + compSize
      );

      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();

      const writePromise = writer.write(compressedData).then(() => writer.close());
      const response = new Response(ds.readable);
      const text = await response.text();

      await writePromise;
      return text;
    };

    let cdOffset = cdStartOffset;

    for (let i = 0; i < cdCount; i++) {
      if (cdOffset + 46 > buffer.length) break;

      const sig = view.getUint32(cdOffset, true);
      if (sig !== 0x02014b50) break;

      const compSize = view.getUint32(cdOffset + 20, true);
      const fileNameLen = view.getUint16(cdOffset + 28, true);
      const extraFieldLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);
      const localHeaderOffset = view.getUint32(cdOffset + 42, true);

      const fileNameBytes = buffer.slice(
        cdOffset + 46,
        cdOffset + 46 + fileNameLen
      );

      const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

      if (localHeaderOffset + 30 <= buffer.length) {
        const lfSig = view.getUint32(localHeaderOffset, true);

        if (lfSig === 0x04034b50) {
          const lfFileNameLen = view.getUint16(
            localHeaderOffset + 26,
            true
          );

          const lfExtraFieldLen = view.getUint16(
            localHeaderOffset + 28,
            true
          );

          const dataOffset =
            localHeaderOffset +
            30 +
            lfFileNameLen +
            lfExtraFieldLen;

          if (fileName === "docProps/app.xml") {
            const text = await decompressEntry(dataOffset, compSize);

            const pagesMatch = text.match(/<Pages>(\d+)<\/Pages>/);
            const wordsMatch = text.match(/<Words>(\d+)<\/Words>/);

            if (pagesMatch) {
              pagesMetadata = parseInt(pagesMatch[1], 10);
            }

            if (wordsMatch) {
              words = parseInt(wordsMatch[1], 10);
            }
          }

          if (fileName === "word/document.xml") {
            const text = await decompressEntry(dataOffset, compSize);

            const pMatches = text.match(/<w:p\b/g);
            paragraphs = pMatches ? pMatches.length : 0;

            const lrbMatches = text.match(
              /<w:lastRenderedPageBreak\b/g
            );

            const brMatches = text.match(
              /<w:br\b[^>]*?w:type="page"/g
            );

            const lrbCount = lrbMatches ? lrbMatches.length : 0;
            const brCount = brMatches ? brMatches.length : 0;

            pageBreaks = lrbCount + brCount;
          }
        }
      }

      cdOffset +=
        46 +
        fileNameLen +
        extraFieldLen +
        commentLen;
    }

    // Word's stored page count is the best available client-side
    // estimate because it comes from the document's saved layout data.
    if (pagesMetadata > 0) {
      return pagesMetadata;
    }

    // Explicit page breaks provide a reliable lower-bound estimate.
    if (pageBreaks > 0) {
      return pageBreaks + 1;
    }

    // Fallback estimates when Word page metadata is unavailable.
    const estPagesByWords = words > 0 ? Math.ceil(words / 350) : 0;
    const estPagesByParagraphs =
      paragraphs > 0 ? Math.ceil(paragraphs / 22) : 0;

    const estimates = [
      estPagesByWords,
      estPagesByParagraphs,
    ].filter((value) => value > 0);

    return estimates.length > 0 ? Math.max(...estimates) : 1;

  } catch (err) {
    console.error("Error reading DOCX pages:", err);
  }

  // Fallback: rough estimation based on file size.
  return file.size > 2000000
    ? Math.max(1, Math.floor(file.size / 500000))
    : 1;
};

/**
 * Count actual slides in a PPTX file by scanning the ZIP central directory
 * for entries matching ppt/slides/slide{N}.xml
 */
const estimatePptxSlides = async (file: File): Promise<number> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    // Find End of Central Directory (EOCD) signature: 0x06054b50
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) return 1;

    const cdCount = view.getUint16(eocdOffset + 10, true);
    const cdStartOffset = view.getUint32(eocdOffset + 16, true);

    let slideCount = 0;
    let cdOffset = cdStartOffset;

    for (let i = 0; i < cdCount; i++) {
      if (cdOffset + 46 > buffer.length) break;
      const sig = view.getUint32(cdOffset, true);
      if (sig !== 0x02014b50) break;

      const fileNameLen = view.getUint16(cdOffset + 28, true);
      const extraFieldLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);

      const fileNameBytes = buffer.slice(cdOffset + 46, cdOffset + 46 + fileNameLen);
      const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

      // Match ppt/slides/slide1.xml, ppt/slides/slide2.xml, etc.
      if (/^ppt\/slides\/slide\d+\.xml$/.test(fileName)) {
        slideCount++;
      }

      cdOffset += 46 + fileNameLen + extraFieldLen + commentLen;
    }

    return Math.max(1, slideCount);
  } catch (err) {
    console.error("Error reading PPTX slides:", err);
    return 1;
  }
};

/**
 * Count worksheets in an XLSX file by scanning the ZIP central directory
 * for entries matching xl/worksheets/sheet{N}.xml
 */
const estimateXlsxSheets = async (file: File): Promise<number> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) return 1;

    const cdCount = view.getUint16(eocdOffset + 10, true);
    const cdStartOffset = view.getUint32(eocdOffset + 16, true);

    let sheetCount = 0;
    let cdOffset = cdStartOffset;

    for (let i = 0; i < cdCount; i++) {
      if (cdOffset + 46 > buffer.length) break;
      const sig = view.getUint32(cdOffset, true);
      if (sig !== 0x02014b50) break;

      const fileNameLen = view.getUint16(cdOffset + 28, true);
      const extraFieldLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);

      const fileNameBytes = buffer.slice(cdOffset + 46, cdOffset + 46 + fileNameLen);
      const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(fileName)) {
        sheetCount++;
      }

      cdOffset += 46 + fileNameLen + extraFieldLen + commentLen;
    }

    return Math.max(1, sheetCount);
  } catch (err) {
    console.error("Error reading XLSX sheets:", err);
    return 1;
  }
};

export function UploadFile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploadedFilesData, setUploadedFilesData] = useState<any[]>([]); // holds full metadata with URLs
  const [isDragging, setIsDragging] = useState(false);
  const [userName, setUserName] = useState("Admin User");
  const [userStats, setUserStats] = useState({ totalDocs: 0, totalPages: 0, totalSpent: 0 });
  const [uploading, setUploading] = useState(false);
  // QR-first printing: this is the page a kiosk's QR code points straight at. A brand-new visitor has no
  // account yet, so before any other API call fires, silently mint a lightweight guest identity (random
  // display name, no email/password) — the rest of this page, and payment/print after it, then just work.
  const [identityReady, setIdentityReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef<Map<string, ActiveUpload>>(new Map());
  const cancelledUploadIdsRef = useRef<Set<string>>(new Set());
  const filesRef = useRef<UploadedFile[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Runs once, before every other API call on this page. A returning guest or a logged-in user already
  // has a token and this is a no-op; a brand-new visitor gets a real `users` doc (same shape as a normal
  // account, just without email/password) so the existing upload/print/payment pipeline works unchanged.
  useEffect(() => {
    const ensureIdentity = async () => {
      const hasToken = sessionStorage.getItem("jwtToken") || localStorage.getItem("jwtToken");
      if (!hasToken) {
        try {
          const res = await api.post("/guest-session");
          localStorage.setItem("jwtToken", res.data.jwtToken);
          localStorage.setItem("mimo_user_name", res.data.name);
          localStorage.setItem("mimo_is_guest", "true");
        } catch (err) {
          console.error("Could not start guest session:", err);
        }
      }
      setIdentityReady(true);
    };
    ensureIdentity();
  }, []);

  const [activePrintCodes, setActivePrintCodes] = useState<ActivePrintCodeJob[]>([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const fetchActiveCodes = async () => {
    try {
      const historyRes = await api.get("/print-history");
      if (Array.isArray(historyRes.data)) {
        const now = Date.now();
        const unused = historyRes.data.filter((job: any) => isCodeActive(job, now));
        setActivePrintCodes(unused);
      }
    } catch (err) {
      // Ignore background errors
    }
  };

  useEffect(() => {
    if (!identityReady) return;
    fetchActiveCodes();

    const handleFocus = () => {
      fetchActiveCodes();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [identityReady]);

  // Poll every 10 seconds while active unused codes exist
  useEffect(() => {
    if (activePrintCodes.length === 0) return;

    const intervalId = setInterval(() => {
      fetchActiveCodes();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [activePrintCodes.length]);

  // Live countdown clock tick every second while active unused codes exist
  useEffect(() => {
    if (activePrintCodes.length === 0) return;

    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activePrintCodes.length]);

  useEffect(() => {
    if (!identityReady) return;
    const storedName = localStorage.getItem("mimo_user_name");
    if (storedName) setUserName(storedName);

    const storedPrintCode = sessionStorage.getItem("printCode");
    const storedPrintOptions = sessionStorage.getItem("printOptions");
    const isReturningFromOptions = Boolean((location.state as any)?.returnFromOptions);

    // If print code is present (completed job), OR if there is an uncompleted checkout session
    // and the user did not explicitly navigate back from print-options, clear the stale session to start fresh.
    if (storedPrintCode || (storedPrintOptions && !isReturningFromOptions)) {
      sessionStorage.removeItem("printCode");
      sessionStorage.removeItem("printFiles");
      sessionStorage.removeItem("printOptions");
      sessionStorage.removeItem("uploadedImages");
      sessionStorage.removeItem("uploadAmount");
      sessionStorage.removeItem("uploadTotalPages");
      sessionStorage.removeItem("totalPages");
      sessionStorage.removeItem("printStatus");
      setUploadedFilesData([]);
      setFiles([]);
      setBackendTotalPages(0);
    } else {
      // Initialize from sessionStorage if exists
      const storedPrintFiles = sessionStorage.getItem("printFiles");
      if (storedPrintFiles) {
        try {
          const parsed = JSON.parse(storedPrintFiles);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setUploadedFilesData(parsed);
            setFiles(parsed.map((f: any) => ({
              clientUploadId: f.clientUploadId || `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: f.name,
              size: f.size,
              type: f.type,
              status: "completed",
              progress: 100,
              pageCount: f.pageCount || 1
            })));
            // Re-calculate total pages
            const totalPages = parsed.reduce((acc: number, curr: any) => acc + (curr.pageCount || 1), 0);
            setBackendTotalPages(totalPages);
          }
        } catch (err) {
          console.error("Failed to restore files from session:", err);
          sessionStorage.removeItem("printFiles");
        }
      }
    }

    const fetchData = async () => {
      try {
        const userResponse = await api.get("/mimo/user");
        if (userResponse.data.name) {
          setUserName(userResponse.data.name);
          localStorage.setItem("mimo_user_name", userResponse.data.name);
        }

        await api.get("/mimo/coins");

        const statsResponse = await api.get("/mimo/stats");
        setUserStats(statsResponse.data);
      } catch (err) {
        console.error("Error fetching user data", err);
      }
    };
    fetchData();
  }, [identityReady]);

  const handleFileSelect = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const formData = new FormData();
    const fileArray = Array.from(fileList);

    const newFiles: UploadedFile[] = fileArray.map((file) => {
      const clientUploadId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      return {
        clientUploadId,
        name: file.name,
        size: file.size,
        type: file.type,
        status: "uploading",
        progress: 0,
        pageCount: 0,
      };
    });

    newFiles.forEach((nf, idx) => {
      activeUploadsRef.current.set(nf.clientUploadId!, {
        clientUploadId: nf.clientUploadId!,
        name: nf.name,
        file: fileArray[idx],
        isCancelled: false,
      });
    });

    // Extract image data URLs BEFORE upload using memory-efficient Object URLs
    const imageDataUrls: { clientUploadId: string; name: string; mimetype: string; dataUrl: string }[] = [];
    newFiles.forEach((nf, idx) => {
      const file = fileArray[idx];
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        const dataUrl = URL.createObjectURL(file);
        imageDataUrls.push({ clientUploadId: nf.clientUploadId!, name: file.name, mimetype: file.type, dataUrl });
      }
    });
    const existingRaw = sessionStorage.getItem("uploadedImages");
    let existingImages = [];
    if (existingRaw) {
      existingImages = JSON.parse(existingRaw);
    }
    const combinedImages = [...existingImages, ...imageDataUrls];

    if (combinedImages.length > 0) {
      sessionStorage.setItem("uploadedImages", JSON.stringify(combinedImages));
    } else {
      sessionStorage.removeItem("uploadedImages");
    }

    setFiles((prev) => [...prev, ...newFiles]);
    setUploading(true);

    try {
      // 1. Parse PDFs locally for page counts keyed by clientUploadId
      const filesMeta = await Promise.all(newFiles.map(async (nf) => {
        const tracker = activeUploadsRef.current.get(nf.clientUploadId!)!;
        const f = tracker.file!;
        let pageCount = 1;
        const nameLower = f.name.toLowerCase();
        const isDocx = nameLower.endsWith(".docx") || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const isPptx = nameLower.endsWith(".pptx") || f.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        const isXlsx = nameLower.endsWith(".xlsx") || f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (f.type === "application/pdf") {
          try {
            const arrayBuffer = await f.arrayBuffer();
            // Loaded on demand: pdf-lib is ~400 KB and only needed once a PDF is picked.
            const { PDFDocument } = await import("pdf-lib");
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            pageCount = pdfDoc.getPageCount();
          } catch (err) {
            console.error("Failed to parse PDF on client:", err);
          }
        } else if (isDocx) {
          pageCount = await estimateDocxPages(f);
        } else if (isPptx) {
          pageCount = await estimatePptxSlides(f);
        } else if (isXlsx) {
          pageCount = await estimateXlsxSheets(f);
        } else if (!f.type.startsWith("image/")) {
          // Fallback for legacy .doc, .ppt, .xls, .txt — 1 page estimate
          pageCount = 1;
        }
        return { clientUploadId: nf.clientUploadId!, name: f.name, type: f.type, size: f.size, pageCount };
      }));

      // 2. Upload via a short-lived, server-minted signed URL (POST /upload-url) rather than writing
      // directly to Cloud Storage with the client SDK -- the bucket no longer grants public write access
      // (see firebase/storage.rules), so the backend mints a one-shot, write-only credential scoped to
      // this user's own uploads/ prefix for exactly this file, and the browser PUTs the bytes to that.
      // XMLHttpRequest (not fetch) is used specifically because it's the only browser API that exposes
      // upload progress events and a clean abort() for cancellation, matching what uploadBytesResumable
      // gave us before.
      const uploadPromises = newFiles.map(async (nf) => {
        const tracker = activeUploadsRef.current.get(nf.clientUploadId!)!;
        const file = tracker.file!;

        return new Promise<any>((resolve) => {
          (async () => {
            try {
              const { data: urlData } = await api.post("/upload-url", {
                fileName: file.name,
                contentType: file.type || "application/octet-stream",
                purpose: "document",
              });

              if (cancelledUploadIdsRef.current.has(nf.clientUploadId!)) {
                resolve(null);
                return;
              }

              const xhr = new XMLHttpRequest();
              // Same shape the old Firebase uploadTask exposed (a .cancel() method), so removeFile()'s
              // existing cancellation call site (tracker.uploadTask.cancel()) needs no changes.
              tracker.uploadTask = { cancel: () => xhr.abort() };

              xhr.upload.onprogress = (e) => {
                if (cancelledUploadIdsRef.current.has(nf.clientUploadId!) || !e.lengthComputable) return;
                const progress = Math.round((e.loaded / e.total) * 100);
                const displayProgress = progress === 100 ? 99 : progress;
                setFiles((prev) =>
                  prev.map((f) =>
                    f.clientUploadId === nf.clientUploadId ? { ...f, progress: displayProgress } : f
                  )
                );
              };

              xhr.onabort = () => {
                console.log(`[UPLOAD] Upload intentionally cancelled for ${nf.name} (${nf.clientUploadId})`);
                resolve(null);
              };

              xhr.onerror = () => {
                if (cancelledUploadIdsRef.current.has(nf.clientUploadId!)) {
                  resolve(null);
                  return;
                }
                console.error(`[UPLOAD ERROR] ${nf.name}: network error`);
                resolve({ error: new Error("Network error during upload"), clientUploadId: nf.clientUploadId, name: nf.name });
              };

              xhr.onload = () => {
                // RACE CHECK: cancelled right as the upload finished -- discard and clean up the object.
                if (cancelledUploadIdsRef.current.has(nf.clientUploadId!)) {
                  console.log(`[UPLOAD RACE] Upload completed after cancellation for ${nf.name}. Discarding and cleaning up.`);
                  api.delete("/remove-file", { data: { fileUrl: urlData.fileUrl } }).catch(() => {});
                  resolve(null);
                  return;
                }
                if (xhr.status < 200 || xhr.status >= 300) {
                  console.error(`[UPLOAD ERROR] ${nf.name}: HTTP ${xhr.status}`);
                  resolve({ error: new Error(`Upload failed (HTTP ${xhr.status})`), clientUploadId: nf.clientUploadId, name: nf.name });
                  return;
                }
                tracker.downloadURL = urlData.fileUrl;
                const meta = filesMeta.find((m) => m.clientUploadId === nf.clientUploadId);
                resolve({
                  clientUploadId: nf.clientUploadId,
                  name: file.name,
                  url: urlData.fileUrl,
                  type: file.type,
                  size: file.size,
                  pageCount: meta?.pageCount || 1,
                });
              };

              xhr.open("PUT", urlData.uploadUrl);
              xhr.setRequestHeader("Content-Type", urlData.contentType);
              xhr.send(file);
            } catch (err: any) {
              if (cancelledUploadIdsRef.current.has(nf.clientUploadId!)) {
                resolve(null);
                return;
              }
              console.error(`[UPLOAD ERROR] ${nf.name}:`, err);
              resolve({ error: err, clientUploadId: nf.clientUploadId, name: nf.name });
            }
          })();
        });
      });

      const uploadResults = await Promise.all(uploadPromises);

      // Separate errors and non-cancelled successes
      const failedFiles = uploadResults.filter((r): r is any => r && r.error);
      const validUploadedFiles = uploadResults.filter(
        (r): r is any => r && !r.error && !cancelledUploadIdsRef.current.has(r.clientUploadId)
      );

      // Update UI for failed uploads
      if (failedFiles.length > 0) {
        setFiles((prev) =>
          prev.map((f) =>
            failedFiles.some((ff) => ff.clientUploadId === f.clientUploadId)
              ? { ...f, status: "failed", progress: 0 }
              : f
          )
        );
        toast.error(failedFilesMessage(failedFiles.map((ff) => ff.name)));
      }

      // If no valid non-cancelled files, terminate sequence
      if (validUploadedFiles.length === 0) {
        setUploading(false);
        return;
      }

      // Filter existing uploadedFilesData to exclude any cancelled files and ensure they match currently completed UI files
      const currentActiveFiles = uploadedFilesData.filter((d) =>
        !cancelledUploadIdsRef.current.has(d.clientUploadId) &&
        filesRef.current.some(
          (f) => f.clientUploadId === d.clientUploadId && f.status === "completed"
        )
      );

      const filesToFinalize = [...currentActiveFiles, ...validUploadedFiles].map((f) => ({
        clientUploadId: f.clientUploadId,
        name: f.name,
        url: f.url,
        type: f.type,
        size: f.size,
        pageCount: f.pageCount,
      }));

      // 3. Tell backend to finalize, perform conversion, and create database records
      const response = await api.post("/finalize-upload", { files: filesToFinalize });

      let backendFiles: any[] = [];
      if (response && response.data && Array.isArray(response.data.files)) {
        backendFiles = response.data.files;
      }

      // Post-finalize race check: Correlate ALL files that were sent to /finalize-upload
      const finalizedAllActive: any[] = [];
      for (const item of filesToFinalize) {
        if (!item.clientUploadId) continue;

        // Correlate backendFiles strictly by clientUploadId or positional index in filesToFinalize (safe fallback to name)
        const finalizeIndex = filesToFinalize.findIndex((f) => f.clientUploadId === item.clientUploadId);
        const bf = backendFiles.find((b: any) => b.clientUploadId === item.clientUploadId)
          || (finalizeIndex >= 0 && finalizeIndex < backendFiles.length ? backendFiles[finalizeIndex] : undefined)
          || backendFiles.find((b: any) => b.name === item.name);

        if (cancelledUploadIdsRef.current.has(item.clientUploadId)) {
          console.log(`[FINALIZE RACE] File was cancelled while /finalize-upload was in flight: ${item.name} (${item.clientUploadId})`);
          const cleanupUrl = bf?.url || item.url;
          if (cleanupUrl) {
            api.delete("/remove-file", { data: { fileUrl: cleanupUrl } }).catch(() => {});
          }
          continue;
        }

        if (bf) {
          finalizedAllActive.push({
            clientUploadId: item.clientUploadId,
            jobId: bf.jobId || item.jobId, // Fresh jobId from backend for EVERY finalized file
            name: item.name,
            url: bf.url || item.url,
            type: bf.type || item.type,
            size: item.size,
            pageCount: typeof bf.pageCount === "number" ? bf.pageCount : item.pageCount,
          });
        } else {
          finalizedAllActive.push(item);
        }
      }

      // Update uploadedFilesData with explicit fresh jobIds for all active files
      setUploadedFilesData(finalizedAllActive);
      sessionStorage.setItem("printFiles", JSON.stringify(finalizedAllActive));

      // Update UI files (strictly correlated by clientUploadId)
      setFiles((prev) =>
        prev.map((f) => {
          const matchingFinal = finalizedAllActive.find((uf) =>
            uf.clientUploadId === f.clientUploadId
          );
          if (matchingFinal) {
            return { ...f, status: "completed", progress: 100, pageCount: matchingFinal.pageCount || 1 };
          }
          return f;
        })
      );
      toast.success("Files ready for printing!");

      const totalPages = finalizedAllActive.reduce((acc: number, curr: any) => acc + (curr.pageCount || 1), 0);
      setBackendTotalPages(totalPages);

      sessionStorage.setItem("uploadAmount", (totalPages * 2).toString());
      sessionStorage.setItem("uploadTotalPages", totalPages.toString());
      setUploading(false);

    } catch (err) {
      console.error(err);
      setFiles((prev) =>
        prev.map((f) =>
          newFiles.some((nf) => nf.clientUploadId === f.clientUploadId) ? { ...f, status: "failed", progress: 0 } : f
        )
      );
      toast.error(describeUploadFailure(err));
      setUploading(false);
    }
  };

  const [backendTotalPages, setBackendTotalPages] = useState(0);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = async (index: number) => {
    const fileToRemove = files[index];
    if (!fileToRemove) return;

    const clientUploadId = fileToRemove.clientUploadId;

    // 1. Mark as cancelled FIRST so any in-flight completion callback drops it
    if (clientUploadId) {
      cancelledUploadIdsRef.current.add(clientUploadId);
      const tracker = activeUploadsRef.current.get(clientUploadId);
      if (tracker) {
        tracker.isCancelled = true;
        if (tracker.uploadTask) {
          try {
            tracker.uploadTask.cancel();
            console.log(`[REMOVE-FILE] Cancelled in-flight uploadTask for ${fileToRemove.name}`);
          } catch (cancelErr) {
            console.warn("Error cancelling upload task:", cancelErr);
          }
        }
      }
    }

    // 2. If a backend record or storage URL exists, call /remove-file
    const meta = uploadedFilesData.find((f) => f.clientUploadId === clientUploadId);
    const fileUrl = meta?.url || (clientUploadId ? activeUploadsRef.current.get(clientUploadId)?.downloadURL : undefined);

    if (fileUrl) {
      try {
        await api.delete("/remove-file", { data: { fileUrl } });
        console.log(`[REMOVE-FILE] Cleaned cloud resource for ${fileToRemove.name} (${clientUploadId})`);
      } catch (err) {
        console.error("Failed to delete from cloud:", err);
      }
    }

    // 3. Update frontend files array and uploadedFilesData
    const updatedFiles = files.filter((_, i) => i !== index);
    const updatedData = uploadedFilesData.filter((f) => f.clientUploadId !== clientUploadId);

    setFiles(updatedFiles);
    setUploadedFilesData(updatedData);

    // 4. Remove from sessionStorage image list
    const existingRaw = sessionStorage.getItem("uploadedImages");
    if (existingRaw) {
      const existingImages = JSON.parse(existingRaw);
      const updatedImages = existingImages.filter((img: any) =>
        img.clientUploadId ? img.clientUploadId !== clientUploadId : img.name !== fileToRemove.name
      );
      if (updatedImages.length > 0) {
        sessionStorage.setItem("uploadedImages", JSON.stringify(updatedImages));
      } else {
        sessionStorage.removeItem("uploadedImages");
      }
    }

    // 5. Update printFiles in sessionStorage (NO bogus /finalize-upload call here!)
    if (updatedData.length > 0) {
      sessionStorage.setItem("printFiles", JSON.stringify(updatedData));
      const totalPages = updatedData.reduce((acc: number, curr: any) => acc + (curr.pageCount || 1), 0);
      setBackendTotalPages(totalPages);
      sessionStorage.setItem("uploadTotalPages", totalPages.toString());
      sessionStorage.setItem("uploadAmount", (totalPages * 2).toString());
    } else {
      sessionStorage.removeItem("printFiles");
      sessionStorage.removeItem("printOptions");
      sessionStorage.removeItem("uploadAmount");
      sessionStorage.removeItem("uploadTotalPages");
      setBackendTotalPages(0);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const displayTotalPages = backendTotalPages || files.filter((f) => f.status === "completed").reduce((acc, f) => acc + (f.pageCount || 1), 0);

  const handlePrint = () => {
    // Use uploadedFilesData which contains the full metadata WITH Firebase download URLs and explicit jobIds
    let completedFiles = uploadedFilesData.filter((f) => f && f.jobId);
    if (completedFiles.length === 0) {
      const stored = sessionStorage.getItem("printFiles");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          completedFiles = parsed.filter((f: any) => f && f.jobId);
        } catch (_) {}
      }
    }
    sessionStorage.setItem("printFiles", JSON.stringify(completedFiles));
    navigate("/print-options");
  };

  const firstName = userName && userName !== "Admin User" ? userName.split(" ")[0] : "";
  const hasUploading = files.some((f) => f.status === "uploading");

  const clearAll = () => {
    setFiles([]);
    setUploadedFilesData([]);
    setBackendTotalPages(0);
    sessionStorage.removeItem("uploadedImages");
    sessionStorage.removeItem("printFiles");
    sessionStorage.removeItem("printOptions");
    sessionStorage.removeItem("uploadAmount");
    sessionStorage.removeItem("uploadTotalPages");
  };

  // Hold the whole page (including MimoHeader, which fires its own unguarded /mimo/user fetch) until the
  // identity bootstrap above has resolved. Without this gate, MimoHeader's request can race ahead with no
  // token, 401, and trip the global axios interceptor's hard redirect to "/" before the guest session the
  // user is waiting on even finishes being created.
  if (!identityReady) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3">
        <Loader2 className="size-6 animate-spin text-ink-3" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 max-w-lg mx-auto">
      <MimoHeader />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.ppt,.pptx,.xls,.xlsx"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <div className="rise-in pt-2 pb-4">
        <h1 className="text-[26px] sm:text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink">
          {firstName ? `Hi, ${firstName}` : "Hi there"}
        </h1>
        <p className="mt-1 text-[14.5px] text-ink-2">What are we printing today?</p>
      </div>

      {/* Active print codes (Horizontal scroll like announcements) */}
      {activePrintCodes.length > 0 && (
        <section className="mb-2.5" aria-label="Ready to print">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-3">
              Ready to print {activePrintCodes.length > 1 && `(${activePrintCodes.length})`}
            </h2>
            <span className="text-[11px] text-ink-3">Tap code to copy</span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
            {activePrintCodes.map((job: any) => {
              const isColor = job.colorMode === "color" || (job.details && job.details.toLowerCase().includes("color"));
              const pageText = job.pageCount
                ? `${job.pageCount} ${job.pageCount === 1 ? "page" : "pages"}`
                : job.details
                ? job.details.split("•")[0].trim()
                : "1 page";
              const copies = job.copies || 1;

              const timeLeft = getTimeLeft(job, currentTime);

              return (
                <div
                  key={job.id || job.printCode}
                  onClick={() => {
                    navigator.clipboard.writeText(job.printCode);
                    toast.success(`Print code ${job.printCode} copied!`);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigator.clipboard.writeText(job.printCode);
                      toast.success(`Print code ${job.printCode} copied!`);
                    }
                  }}
                  className={`press ${activePrintCodes.length > 1 ? "w-[75%] max-w-[270px]" : "w-full"} shrink-0 snap-start rounded-[16px] bg-surface p-2.5 sm:p-3 border border-hairline shadow-xs cursor-pointer active:bg-surface-2 transition-all flex flex-col justify-between`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <span className="text-[20px] sm:text-[22px] font-bold leading-none tracking-[0.05em] tabular-nums text-brand">
                        {job.printCode}
                      </span>
                      <p className="mt-0.5 font-medium text-[12.5px] text-ink line-clamp-1">
                        {job.file || "Document"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-text">
                        {isColor ? "Colour" : "B&W"}
                      </span>
                      <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-ink-3">
                        <Copy className="size-3.5" />
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-hairline flex items-center justify-between text-[11px] text-ink-3">
                    <span>{pageText}{copies > 1 ? ` • ${copies} copies` : ""}</span>
                    <span
                      className={`inline-flex items-center gap-1 font-medium tabular-nums transition-colors ${
                        timeLeft.isExpired
                          ? "text-rose-600 dark:text-rose-400 font-semibold"
                          : timeLeft.urgency === "critical"
                          ? "text-amber-600 dark:text-amber-400 font-semibold"
                          : timeLeft.urgency === "warning"
                          ? "text-amber-600/90 dark:text-amber-400/90"
                          : "text-ink-2"
                      }`}
                      title={timeLeft.validTillText ? `Valid till ${timeLeft.validTillText}` : undefined}
                      aria-label={timeLeft.validTillText ? `${timeLeft.text}, valid till ${timeLeft.validTillText}` : timeLeft.text}
                    >
                      <Clock
                        className={`size-3 shrink-0 ${
                          timeLeft.urgency === "critical" ? "animate-pulse text-amber-500" : "text-ink-3"
                        }`}
                      />
                      <span>{timeLeft.text}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Upload with Scan button integrated into right corner */}
      {files.length === 0 ? (
        <div
          data-tour="upload-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          className={`press relative flex w-full flex-col justify-between rounded-[22px] bg-brand p-4 sm:p-5 text-left text-on-brand cursor-pointer overflow-hidden shadow-sm transition-all ${isDragging ? "ring-4 ring-brand-soft" : ""}`}
        >
          {/* Top row: Plus on left, Scan Document button on right corner with fluid animation */}
          <div className="flex w-full items-start justify-between">
            <span className="flex size-10 sm:size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-xs">
              <Plus className="size-5 sm:size-6 text-white" strokeWidth={2.2} />
            </span>
            {/* Scan button with clean expanding wave animation (No glowing, big & long waves) */}
            <div className="relative group flex items-center justify-center">
              <span className="scan-wave" aria-hidden="true" />
              <span className="scan-wave scan-wave-delay-1" aria-hidden="true" />
              <span className="scan-wave scan-wave-delay-2" aria-hidden="true" />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/document-scanner");
                }}
                aria-label="Scan document"
                className="press relative z-10 flex items-center gap-1.5 rounded-full bg-white/20 hover:bg-white/25 active:bg-white/30 backdrop-blur-md px-4 py-2 text-white border border-white/25 shadow-sm"
              >
                <Camera className="size-4 shrink-0" strokeWidth={2} />
                <span className="text-[13.5px] font-semibold tracking-wide">Scan</span>
              </button>
            </div>
          </div>

          <div className="mt-5 sm:mt-6">
            <span className="block text-[19px] sm:text-[21px] font-bold leading-tight tracking-tight">Choose files to print</span>
            <span className="mt-1 block text-[13.5px] text-white/80">PDF, Word, PowerPoint, Excel, text or photos</span>
          </div>
        </div>
      ) : (
        <Group
          title="Files"
          footer={
            hasUploading
              ? "Uploading. Office files are converted to PDF on our side, which can take a moment."
              : `${displayTotalPages} ${displayTotalPages === 1 ? "page" : "pages"} in total`
          }
        >
          {files.map((file, index) => {
            const isImage = file.type?.startsWith("image/");
            const pagesLabel = file.pageCount
              ? `${file.pageCount} ${file.pageCount === 1 ? "page" : "pages"}`
              : `about ${isImage ? 1 : (file.size > 2000000 ? Math.floor(file.size / 500000) : 1)} pages`;
            return (
              <div key={file.clientUploadId || index} className="relative flex items-center gap-3 border-t border-hairline px-4 py-3 first:border-t-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-ink-2">
                  {isImage ? <ImageIcon className="size-5" strokeWidth={1.75} /> : <FileText className="size-5" strokeWidth={1.75} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{file.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
                    {file.status === "completed" && <span className="tabular-nums">{pagesLabel}, {formatFileSize(file.size)}</span>}
                    {file.status === "uploading" && (
                      <span className="tabular-nums">{file.progress >= 99 ? "Processing" : `Uploading ${file.progress}%`}</span>
                    )}
                    {file.status === "failed" && <StatusPill tone="danger">Upload failed</StatusPill>}
                  </span>
                  {file.status === "uploading" && (
                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={file.progress} aria-valuemin={0} aria-valuemax={100}>
                      <span
                        className={`block h-full rounded-full bg-brand transition-[width] duration-300 ${file.progress >= 99 ? "motion-safe:animate-pulse" : ""}`}
                        style={{ width: `${file.progress}%` }}
                      />
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="press flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
                >
                  <X className="size-[18px]" />
                </button>
              </div>
            );
          })}
          <Row
            icon={<Plus className="size-5" />}
            label={<span className="text-brand-text">Add more files</span>}
            onClick={() => fileInputRef.current?.click()}
          />
        </Group>
      )}

      {/* 3 Horizontal Compartments (Clean, static, professional) */}
      {files.length === 0 && (
        <div className="mt-3.5 sm:mt-4 grid grid-cols-3 gap-2.5">
          {/* Compartment 1: Blank A4 sheet */}
          <div
            onClick={() => navigate("/blank-pages?type=a4")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/blank-pages?type=a4");
            }}
            className="press flex flex-col items-center justify-between p-2.5 sm:p-3 rounded-[16px] bg-surface border border-hairline/60 shadow-xs text-center cursor-pointer active:bg-surface-2 hover:border-brand/30 transition-all group"
          >
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-surface-2 text-ink mb-1.5 group-hover:scale-105 transition-transform">
              <FileIcon className="size-4" strokeWidth={1.75} />
            </span>
            <p className="text-[12px] font-semibold text-ink leading-tight line-clamp-1">
              Blank A4 sheet
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/blank-pages?type=a4");
              }}
              className="mt-2 w-full py-1 text-[11px] font-semibold rounded-full bg-brand-soft text-brand-text group-hover:bg-brand/15 active:scale-95 transition-all text-center"
            >
              Print
            </button>
          </div>

          {/* Compartment 2: MIMO graph paper */}
          <div
            onClick={() => navigate("/blank-pages?type=graph")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/blank-pages?type=graph");
            }}
            className="press flex flex-col items-center justify-between p-2.5 sm:p-3 rounded-[16px] bg-surface border border-hairline/60 shadow-xs text-center cursor-pointer active:bg-surface-2 hover:border-brand/30 transition-all group"
          >
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-surface-2 text-ink mb-1.5 group-hover:scale-105 transition-transform">
              <Grid3X3 className="size-4" strokeWidth={1.75} />
            </span>
            <p className="text-[12px] font-semibold text-ink leading-tight line-clamp-1">
              MIMO graph paper
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/blank-pages?type=graph");
              }}
              className="mt-2 w-full py-1 text-[11px] font-semibold rounded-full bg-brand-soft text-brand-text group-hover:bg-brand/15 active:scale-95 transition-all text-center"
            >
              Print
            </button>
          </div>

          {/* Compartment 3: Type a document */}
          <div
            onClick={() => navigate("/text-editor")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/text-editor");
            }}
            className="press flex flex-col items-center justify-between p-2.5 sm:p-3 rounded-[16px] bg-surface border border-hairline/60 shadow-xs text-center cursor-pointer active:bg-surface-2 hover:border-brand/30 transition-all group"
          >
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-surface-2 text-ink mb-1.5 group-hover:scale-105 transition-transform">
              <PenLine className="size-4" strokeWidth={1.75} />
            </span>
            <p className="text-[12px] font-semibold text-ink leading-tight line-clamp-1">
              Type a document
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/text-editor");
              }}
              className="mt-2 w-full py-1 text-[11px] font-semibold rounded-full bg-brand-soft text-brand-text group-hover:bg-brand/15 active:scale-95 transition-all text-center"
            >
              Write
            </button>
          </div>
        </div>
      )}

      {/* Activity */}
      {files.length === 0 && (
        <section className="mt-5 sm:mt-6" aria-label="Your activity">
          <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Your activity</h2>
          <dl className="grid grid-cols-3 divide-x divide-hairline rounded-[20px] bg-surface py-3 border border-hairline/60 shadow-xs">
            {[
              { label: "Prints", value: userStats.totalDocs },
              { label: "Pages", value: userStats.totalPages },
              { label: "Spent", value: `₹${Number(userStats.totalSpent).toFixed(0)}` },
            ].map((s) => (
              <div key={s.label} className="flex flex-col-reverse px-3 text-center">
                <dt className="text-[11.5px] font-medium text-ink-3 mt-0.5">{s.label}</dt>
                <dd className="text-[20px] sm:text-[22px] font-bold tabular-nums tracking-tight text-ink">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Announcements / Advertisements (Shown in all states, hides cleanly with 0 skeleton if empty) */}
      <AdBanner />

      {files.length > 0 && (
        <>
          <ActionBarSpacer size={140} />
          <ActionBar>
            <PrimaryButton data-tour="upload-continue" disabled={files.length === 0 || hasUploading} onClick={handlePrint}>
              Continue
            </PrimaryButton>
            <TextButton onClick={clearAll} className="mt-1 w-full text-ink-2">
              Clear all
            </TextButton>
          </ActionBar>
        </>
      )}
    </div>
  );
}
