import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MimoHeader } from "../components/mimo-header";
import { ActionBar, ActionBarSpacer, Group, PrimaryButton, Row, StatusPill, TextButton } from "../components/mimo/ui";
import { FileText, X, ImageIcon, File as FileIcon, Grid3X3, Copy, Plus, PenLine, MapPin, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { HackathonBanner } from "../components/HackathonBanner";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../lib/firebase";

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
  totalPages?: number;
  totalPagesToPrint?: number;
  copiesRequested?: number;
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

  const fetchActiveCodes = async () => {
    try {
      const historyRes = await api.get("/print-history");
      if (Array.isArray(historyRes.data)) {
        const now = Date.now();
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

        const unused = historyRes.data.filter((job: any) => {
          if (job.status !== "paid" || !job.printCode || job.printCode === "-" || job.isPrinted === true) {
            return false;
          }

          // Calculate creation timestamp in ms from createdAtTime or ISO date string
          const jobTimestamp = typeof job.createdAtTime === "number" && job.createdAtTime > 0
            ? job.createdAtTime
            : job.date
            ? new Date(job.date).getTime()
            : 0;

          if (!jobTimestamp || isNaN(jobTimestamp)) {
            return false;
          }

          // Retain for a maximum of 24 hours from creation
          const ageMs = now - jobTimestamp;
          return ageMs >= 0 && ageMs <= TWENTY_FOUR_HOURS_MS;
        });

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

      // 2. Upload directly to Firebase Storage with task tracking & cancellation support
      const uploadPromises = newFiles.map(async (nf) => {
        const tracker = activeUploadsRef.current.get(nf.clientUploadId!)!;
        const file = tracker.file!;
        const uniqueFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = ref(storage, `uploads/${userName.replace(/[^a-zA-Z0-9]/g, '_')}/${uniqueFileName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        tracker.uploadTask = uploadTask;

        return new Promise<any>((resolve) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              if (cancelledUploadIdsRef.current.has(nf.clientUploadId!)) {
                return;
              }
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              const displayProgress = progress === 100 ? 99 : progress;
              setFiles((prev) =>
                prev.map((f) =>
                  f.clientUploadId === nf.clientUploadId ? { ...f, progress: displayProgress } : f
                )
              );
            },
            (error: any) => {
              // Handle cancellation gracefully without throwing or rejecting concurrent uploads
              if (cancelledUploadIdsRef.current.has(nf.clientUploadId!) || error?.code === "storage/canceled") {
                console.log(`[UPLOAD] Upload intentionally cancelled for ${nf.name} (${nf.clientUploadId})`);
                resolve(null);
                return;
              }
              console.error(`[UPLOAD ERROR] ${nf.name}:`, error);
              resolve({ error, clientUploadId: nf.clientUploadId, name: nf.name });
            },
            async () => {
              // RACE CHECK 1: Was this upload cancelled before completion callback fired?
              if (cancelledUploadIdsRef.current.has(nf.clientUploadId!)) {
                console.log(`[UPLOAD RACE] Upload completed after cancellation for ${nf.name}. Discarding and cleaning up.`);
                try {
                  const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                  await api.delete("/remove-file", { data: { fileUrl: downloadURL } }).catch(() => {});
                } catch (_) {}
                resolve(null);
                return;
              }

              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                // RACE CHECK 2: Cancelled while fetching download URL?
                if (cancelledUploadIdsRef.current.has(nf.clientUploadId!)) {
                  await api.delete("/remove-file", { data: { fileUrl: downloadURL } }).catch(() => {});
                  resolve(null);
                  return;
                }
                tracker.downloadURL = downloadURL;
                const meta = filesMeta.find((m) => m.clientUploadId === nf.clientUploadId);
                resolve({
                  clientUploadId: nf.clientUploadId,
                  name: file.name,
                  url: downloadURL,
                  type: file.type,
                  size: file.size,
                  pageCount: meta?.pageCount || 1,
                });
              } catch (urlErr) {
                console.error("Failed to get download URL:", urlErr);
                resolve({ error: urlErr, clientUploadId: nf.clientUploadId, name: nf.name });
              }
            }
          );
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
        toast.error("Upload failed for one or more files");
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
      toast.error("Upload failed");
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
    <div className="px-4 pb-10">
      <MimoHeader />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.ppt,.pptx,.xls,.xlsx"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <div className="rise-in pt-3 pb-6">
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
          {firstName ? `Hi, ${firstName}` : "Hi there"}
        </h1>
        <p className="mt-1.5 text-[16px] text-ink-2">What are we printing today?</p>
      </div>

      {/* Active print codes */}
      {activePrintCodes.length > 0 && (
        <Group title="Ready to print" footer="Tap a code to copy it. Codes stay valid for 24 hours." className="mb-6">
          {activePrintCodes.map((job: any) => {
            const isColor = job.colorMode === "color" || (job.details && job.details.toLowerCase().includes("color"));
            const pageText = job.pageCount
              ? `${job.pageCount} ${job.pageCount === 1 ? "page" : "pages"}`
              : job.details
              ? job.details.split("•")[0].trim()
              : "1 page";
            const copies = job.copies || 1;

            // Calculate Valid till: creation timestamp + 24 hours
            const jobTimestamp = typeof job.createdAtTime === "number" && job.createdAtTime > 0
              ? job.createdAtTime
              : job.date
              ? new Date(job.date).getTime()
              : 0;

            let validTillText = "";
            if (jobTimestamp && !isNaN(jobTimestamp)) {
              const expiryDate = new Date(jobTimestamp + 24 * 60 * 60 * 1000);
              const day = expiryDate.getDate();
              const month = expiryDate.toLocaleString("en-US", { month: "short" });
              const time = expiryDate.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
              validTillText = `${day} ${month}, ${time}`;
            }

            return (
              <button
                key={job.id || job.printCode}
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(job.printCode);
                  toast.success(`Print code ${job.printCode} copied!`);
                }}
                aria-label={`Copy print code ${job.printCode}`}
                className="flex w-full items-center gap-4 border-t border-hairline px-4 py-3 text-left transition-colors first:border-t-0 active:bg-surface-2"
              >
                <span className="text-[28px] font-semibold leading-none tracking-[0.08em] tabular-nums text-ink">{job.printCode}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{job.file || "Document"}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-3">
                    {pageText}, {isColor ? "colour" : "B&W"}{copies > 1 ? `, ${copies} copies` : ""}
                    {validTillText && <span className="block">Valid till {validTillText}</span>}
                  </span>
                </span>
                <Copy className="size-4 shrink-0 text-ink-3" />
              </button>
            );
          })}
        </Group>
      )}

      {/* Upload */}
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`press flex w-full flex-col items-start rounded-[24px] bg-brand p-5 text-left text-on-brand ${isDragging ? "ring-4 ring-brand-soft" : ""}`}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-white/15">
            <Plus className="size-6" strokeWidth={2} />
          </span>
          <span className="mt-8 text-[22px] font-semibold leading-tight tracking-tight">Choose files to print</span>
          <span className="mt-1 text-[15px] text-white/75">PDF, Word, PowerPoint, Excel, text or photos</span>
        </button>
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

      {/* Quick print */}
      {files.length === 0 && (
        <Group title="Quick print" className="mt-8">
          <Row
            icon={<FileIcon className="size-5" strokeWidth={1.75} />}
            label="Blank A4 sheet"
            detail="Plain paper, no upload needed"
            chevron
            onClick={() => navigate("/blank-pages?type=a4")}
          />
          <Row
            icon={<Grid3X3 className="size-5" strokeWidth={1.75} />}
            label="MIMO graph paper"
            detail="Squared sheets for maths and drawings"
            chevron
            onClick={() => navigate("/blank-pages?type=graph")}
          />
          <Row
            icon={<PenLine className="size-5" strokeWidth={1.75} />}
            label="Type a document"
            detail="Write or paste text, then print it"
            chevron
            onClick={() => navigate("/text-editor")}
          />
          <Row
            icon={<Camera className="size-5" strokeWidth={1.75} />}
            label="Scan a document"
            detail="Capture with your camera, crop and print"
            chevron
            onClick={() => navigate("/document-scanner")}
          />
        </Group>
      )}

      {files.length === 0 && (
        <Group className="mt-4">
          <Row
            icon={<MapPin className="size-5" strokeWidth={1.75} />}
            label="Find a kiosk"
            detail="Locations and which one prints colour"
            chevron
            onClick={() => navigate("/find-machine")}
          />
        </Group>
      )}

      {/* Activity */}
      {files.length === 0 && (
        <section className="mt-8" aria-label="Your activity">
          <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">Your activity</h2>
          <dl className="grid grid-cols-3 divide-x divide-hairline rounded-[20px] bg-surface py-4">
            {[
              { label: "Prints", value: userStats.totalDocs },
              { label: "Pages", value: userStats.totalPages },
              { label: "Spent", value: `₹${Number(userStats.totalSpent).toFixed(0)}` },
            ].map((s) => (
              <div key={s.label} className="flex flex-col-reverse px-3 text-center">
                <dt className="mt-0.5 text-[13px] text-ink-3">{s.label}</dt>
                <dd className="text-[22px] font-semibold tabular-nums tracking-tight text-ink">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {files.length === 0 && <HackathonBanner />}

      {files.length > 0 && (
        <>
          <ActionBarSpacer size={140} />
          <ActionBar>
            <PrimaryButton disabled={files.length === 0 || hasUploading} onClick={handlePrint}>
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
