import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MimoHeader } from "../components/mimo-header";
import { ActionBar, ActionBarSpacer, Group, PrimaryButton, Row, StatusPill, TextButton } from "../components/mimo/ui";
import { FileText, X, ImageIcon, File as FileIcon, Grid3X3, Copy, Plus, PenLine, MapPin, Camera, Loader2, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { AdBanner } from "../components/AdBanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
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

    if (pagesMetadata > 0) {
      return pagesMetadata;
    }

    if (pageBreaks > 0) {
      return pageBreaks + 1;
    }

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

  return file.size > 2000000
    ? Math.max(1, Math.floor(file.size / 500000))
    : 1;
};

const estimatePptxSlides = async (file: File): Promise<number> => {
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
  const [uploadedFilesData, setUploadedFilesData] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [userName, setUserName] = useState("Admin User");
  const [userStats, setUserStats] = useState({ totalDocs: 0, totalPages: 0, totalSpent: 0 });
  const [uploading, setUploading] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef<Map<string, ActiveUpload>>(new Map());
  const cancelledUploadIdsRef = useRef<Set<string>>(new Set());
  const filesRef = useRef<UploadedFile[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

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

          const jobTimestamp = typeof job.createdAtTime === "number" && job.createdAtTime > 0
            ? job.createdAtTime
            : job.date
            ? new Date(job.date).getTime()
            : 0;

          if (!jobTimestamp || isNaN(jobTimestamp)) {
            return false;
          }

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
          pageCount = 1;
        }
        return { clientUploadId: nf.clientUploadId!, name: f.name, type: f.type, size: f.size, pageCount };
      }));

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
              if (cancelledUploadIdsRef.current.has(nf.clientUploadId!) || error?.code === "storage/canceled") {
                console.log(`[UPLOAD] Upload intentionally cancelled for ${nf.name} (${nf.clientUploadId})`);
                resolve(null);
                return;
              }
              console.error(`[UPLOAD ERROR] ${nf.name}:`, error);
              resolve({ error, clientUploadId: nf.clientUploadId, name: nf.name });
            },
            async () => {
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

      const failedFiles = uploadResults.filter((r): r is any => r && r.error);
      const validUploadedFiles = uploadResults.filter(
        (r): r is any => r && !r.error && !cancelledUploadIdsRef.current.has(r.clientUploadId)
      );

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

      if (validUploadedFiles.length === 0) {
        setUploading(false);
        return;
      }

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

      const response = await api.post("/finalize-upload", { files: filesToFinalize });

      let backendFiles: any[] = [];
      if (response && response.data && Array.isArray(response.data.files)) {
        backendFiles = response.data.files;
      }

      const finalizedAllActive: any[] = [];
      for (const item of filesToFinalize) {
        if (!item.clientUploadId) continue;

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
            jobId: bf.jobId || item.jobId,
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

      setUploadedFilesData(finalizedAllActive);
      sessionStorage.setItem("printFiles", JSON.stringify(finalizedAllActive));

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

    if (clientUploadId) {
      cancelledUploadIdsRef.current.add(clientUploadId);
      const tracker = activeUploadsRef.current.get(clientUploadId);
      if (tracker) {
        tracker.isCancelled = true;
        if (tracker.uploadTask) {
          try {
            tracker.uploadTask.cancel();
          } catch (cancelErr) {
            console.warn("Error cancelling upload task:", cancelErr);
          }
        }
      }
    }

    const meta = uploadedFilesData.find((f) => f.clientUploadId === clientUploadId);
    const fileUrl = meta?.url || (clientUploadId ? activeUploadsRef.current.get(clientUploadId)?.downloadURL : undefined);

    if (fileUrl) {
      try {
        await api.delete("/remove-file", { data: { fileUrl } });
      } catch (err) {
        console.error("Failed to delete from cloud:", err);
      }
    }

    const updatedFiles = files.filter((_, i) => i !== index);
    const updatedData = uploadedFilesData.filter((f) => f.clientUploadId !== clientUploadId);

    setFiles(updatedFiles);
    setUploadedFilesData(updatedData);

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
  const totalFileSize = files.reduce((acc, f) => acc + f.size, 0);

  const handlePrint = () => {
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

  if (!identityReady) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-canvas px-4 pb-10">
      <MimoHeader />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.ppt,.pptx,.xls,.xlsx"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* ── Hero greeting + Mascot ── */}
      <div className="rise-in flex items-center justify-between pt-3 pb-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-[26px] sm:text-[28px] font-extrabold leading-tight tracking-tight text-ink">
            <span>Hi, <span className="text-brand">{firstName || "there"}</span></span>
            <span className="text-yellow-400 text-[18px]">✨</span>
          </h1>
          <p className="mt-0.5 text-[13px] sm:text-[14px] text-ink-3">
            {files.length > 0 ? "What are we printing today?" : "Let's get your documents printed"}
          </p>
        </div>

        {/* 3D Robot Mascot */}
        <div className="flex size-[64px] sm:size-[72px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-500/10 via-sky-500/15 to-indigo-500/10 border border-blue-100/80 shadow-xs">
          <span className="text-[34px] sm:text-[38px]" aria-hidden>🤖</span>
        </div>
      </div>

      {/* ── Active print codes ── */}
      {activePrintCodes.length > 0 && (
        <section className="mb-4" aria-label="Ready to print">
          <p className="mb-2 px-0.5 text-[12px] font-bold text-ink-3 uppercase tracking-wider">Ready to print</p>
          <div className="overflow-hidden rounded-[20px] bg-surface shadow-xs border border-hairline">
            {activePrintCodes.map((job: any) => {
              const isColor = job.colorMode === "color" || (job.details && job.details.toLowerCase().includes("color"));
              const pageText = job.pageCount
                ? `${job.pageCount} ${job.pageCount === 1 ? "page" : "pages"}`
                : job.details
                ? job.details.split("•")[0].trim()
                : "1 page";
              const copies = job.copies || 1;

              return (
                <button
                  key={job.id || job.printCode}
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(job.printCode);
                    toast.success(`Print code ${job.printCode} copied!`);
                  }}
                  aria-label={`Copy print code ${job.printCode}`}
                  className="flex w-full items-center gap-3 border-t border-hairline px-4 py-3 text-left transition-colors first:border-t-0 active:bg-surface-2"
                >
                  <span className="text-[26px] font-extrabold leading-none tracking-[0.08em] tabular-nums text-brand">{job.printCode}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{job.file || "Document"}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">
                      {pageText}, {isColor ? "colour" : "B&W"}{copies > 1 ? `, ${copies} copies` : ""}
                    </span>
                  </span>
                  <Copy className="size-4 shrink-0 text-ink-3" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Upload / File list zone ── */}
      {files.length === 0 ? (
        <>
          {/* Hero upload cards (2-column balanced grid matching reference 1) */}
          <div
            data-tour="upload-dropzone"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`grid grid-cols-2 gap-3 transition-all ${isDragging ? "opacity-70" : ""}`}
          >
            {/* Upload files card */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="press group relative flex flex-col justify-between overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 p-4 text-left shadow-lg shadow-blue-500/20 min-h-[175px] cursor-pointer"
              aria-label="Upload files from your device"
            >
              {/* Stacked 3D sheets decoration */}
              <div className="absolute right-2 top-4 pointer-events-none opacity-30 group-hover:opacity-40 transition-opacity">
                <div className="w-14 h-18 bg-white/40 rounded-lg transform rotate-12 shadow-sm" />
                <div className="w-14 h-18 bg-white/50 rounded-lg transform rotate-6 -mt-16 mr-2 shadow-sm" />
                <div className="w-14 h-18 bg-white/70 rounded-lg transform -rotate-3 -mt-16 mr-4 shadow-sm" />
              </div>

              {/* Plus icon circle */}
              <span className="relative z-10 flex size-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-xs text-white">
                <Plus className="size-5" strokeWidth={2.5} />
              </span>

              {/* Bottom text + arrow */}
              <div className="relative z-10 mt-auto flex items-end justify-between">
                <div>
                  <span className="block text-[18px] font-extrabold leading-tight text-white">Upload Files</span>
                  <span className="mt-1 block text-[11px] text-white/80 line-clamp-1">PDF, Word, photos</span>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-brand shadow-sm ml-1">
                  <ChevronRight className="size-4" strokeWidth={2.5} />
                </span>
              </div>
            </button>

            {/* Scan document card */}
            <button
              type="button"
              onClick={() => navigate("/document-scanner")}
              className="press group relative flex flex-col justify-between overflow-hidden rounded-[24px] bg-[#e8faf4] border border-[#c6f3e4] p-4 text-left shadow-xs min-h-[175px] cursor-pointer"
              aria-label="Scan a document with camera"
            >
              {/* Camera icon circle */}
              <span className="relative z-10 flex size-10 items-center justify-center rounded-full bg-[#d0f5e9] text-emerald-600">
                <Camera className="size-5" strokeWidth={2.25} />
              </span>

              {/* Center phone scanner hint */}
              <div className="absolute right-3 top-8 pointer-events-none opacity-30 text-[38px]">
                📱
              </div>

              {/* Bottom text + arrow */}
              <div className="relative z-10 mt-auto flex items-end justify-between">
                <div>
                  <span className="block text-[16px] font-bold leading-tight text-ink">Scan Document</span>
                  <span className="mt-1 block text-[11px] text-ink-3">Camera & crop</span>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm ml-1">
                  <ChevronRight className="size-4" strokeWidth={2.5} />
                </span>
              </div>
            </button>
          </div>

          {/* Quick actions row matching reference image 1 */}
          <Dialog open={isTemplatesOpen} onOpenChange={setIsTemplatesOpen}>
            <div className="mt-3.5 grid grid-cols-4 gap-2">
              {[
                { icon: <FileIcon className="size-4" />, label: "Blank Page", color: "text-purple-600 bg-purple-50", action: () => navigate("/blank-pages?type=a4") },
                { icon: <PenLine className="size-4" />, label: "Text Editor", color: "text-amber-600 bg-amber-50", action: () => navigate("/text-editor") },
                { icon: <Grid3X3 className="size-4" />, label: "Templates", color: "text-rose-500 bg-rose-50", action: () => setIsTemplatesOpen(true) },
                { icon: <span className="text-[14px]">⚙️</span>, label: "More", color: "text-slate-600 bg-slate-100", action: () => setIsTemplatesOpen(true) },
              ].map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={item.action}
                  className="press flex flex-col justify-between rounded-[18px] bg-surface p-2.5 shadow-xs border border-hairline/80 min-h-[72px] text-left"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`flex size-7 items-center justify-center rounded-[10px] ${item.color}`}>
                      {item.icon}
                    </span>
                    <ChevronRight className="size-3 text-ink-4" />
                  </div>
                  <span className="mt-1 block text-[11px] font-bold text-ink leading-tight">{item.label}</span>
                </button>
              ))}
            </div>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Quick print options</DialogTitle>
                <DialogDescription>Print without uploading files from your device.</DialogDescription>
              </DialogHeader>
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => { setIsTemplatesOpen(false); navigate("/blank-pages?type=a4"); }}
                  className="press flex w-full items-center gap-3.5 rounded-[16px] bg-surface-2 hover:bg-surface-3 p-3.5 text-left transition-colors cursor-pointer"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface text-ink shadow-xs">
                    <FileIcon className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">Blank A4 sheet</span>
                    <span className="text-[13px] text-ink-3">Plain paper, no upload needed</span>
                  </span>
                  <ChevronRight className="size-4 text-ink-4" />
                </button>

                <button
                  type="button"
                  onClick={() => { setIsTemplatesOpen(false); navigate("/blank-pages?type=graph"); }}
                  className="press flex w-full items-center gap-3.5 rounded-[16px] bg-surface-2 hover:bg-surface-3 p-3.5 text-left transition-colors cursor-pointer"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface text-ink shadow-xs">
                    <Grid3X3 className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">MIMO graph paper</span>
                    <span className="text-[13px] text-ink-3">Squared sheets for maths and drawings</span>
                  </span>
                  <ChevronRight className="size-4 text-ink-4" />
                </button>

                <button
                  type="button"
                  onClick={() => { setIsTemplatesOpen(false); navigate("/text-editor"); }}
                  className="press flex w-full items-center gap-3.5 rounded-[16px] bg-surface-2 hover:bg-surface-3 p-3.5 text-left transition-colors cursor-pointer"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface text-ink shadow-xs">
                    <PenLine className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">Type a document</span>
                    <span className="text-[13px] text-ink-3">Write or paste text, then print it</span>
                  </span>
                  <ChevronRight className="size-4 text-ink-4" />
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Stats card */}
          <section className="mt-4" aria-label="Your activity">
            <div className="flex items-center gap-4 rounded-[20px] bg-surface px-4 py-3.5 shadow-sm border border-hairline">
              {[
                { icon: "📄", label: "Prints", value: userStats.totalDocs, color: "bg-blue-50" },
                { icon: "📋", label: "Pages", value: userStats.totalPages, color: "bg-green-50" },
                { icon: "💰", label: "Spent", value: `₹${Number(userStats.totalSpent).toFixed(0)}`, color: "bg-yellow-50" },
              ].map((s, i) => (
                <div key={s.label} className={`flex flex-1 items-center gap-2.5 ${i > 0 ? "border-l border-hairline pl-4" : ""}`}>
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${s.color} text-[18px]`}>{s.icon}</span>
                  <div>
                    <p className="text-[18px] font-bold tabular-nums leading-none text-ink">{s.value}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Ad banner */}
          <AdBanner />
        </>
      ) : (
        /* ── Selected files view ── */
        <>
          <div className="mt-2 mb-4 flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-ink">Selected files</h2>
            <span className="text-[13px] text-ink-3">
              {files.length} {files.length === 1 ? "file" : "files"} · {formatFileSize(totalFileSize)}
            </span>
          </div>

          <div className="overflow-hidden rounded-[20px] bg-surface shadow-sm border border-hairline">
            {files.map((file, index) => {
              const isImage = file.type?.startsWith("image/");
              const pagesLabel = file.pageCount
                ? `${file.pageCount} ${file.pageCount === 1 ? "page" : "pages"}`
                : `about ${isImage ? 1 : (file.size > 2000000 ? Math.floor(file.size / 500000) : 1)} pages`;
              return (
                <div key={file.clientUploadId || index} className="relative flex items-center gap-3 border-t border-hairline px-4 py-3 first:border-t-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-2 text-ink-3">
                    {isImage ? <ImageIcon className="size-5" strokeWidth={1.75} /> : <FileText className="size-5" strokeWidth={1.75} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{file.name}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
                      {file.status === "completed" && <span className="tabular-nums">{pagesLabel} · {formatFileSize(file.size)}</span>}
                      {file.status === "uploading" && (
                        <span className="tabular-nums">{file.progress >= 99 ? "Processing…" : `Uploading ${file.progress}%`}</span>
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
                    className="press flex size-8 shrink-0 items-center justify-center rounded-full text-ink-4 active:bg-surface-2"
                  >
                    <X className="size-[16px]" />
                  </button>
                </div>
              );
            })}

            {/* Add more */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="press flex w-full items-center gap-3 border-t border-hairline px-4 py-3 text-left transition-colors active:bg-surface-2"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand">
                <Plus className="size-5" strokeWidth={2.5} />
              </span>
              <span className="text-[14px] font-semibold text-brand-text">Add more files</span>
            </button>
          </div>

          {/* Continue summary illustration */}
          <div className="mt-6 flex flex-col items-center gap-1 py-4">
            <div className="flex size-16 items-center justify-center rounded-[20px] bg-brand-soft text-brand text-[32px]">
              📄
            </div>
            <p className="mt-2 text-[14px] text-ink-3">
              {displayTotalPages} {displayTotalPages === 1 ? "page" : "pages"} in total
            </p>
          </div>

          <ActionBarSpacer size={140} />
          <ActionBar>
            <PrimaryButton
              data-tour="upload-continue"
              disabled={files.length === 0 || hasUploading}
              onClick={handlePrint}
              className="rounded-full text-[16px] font-bold"
            >
              Continue <ChevronRight className="size-5" />
            </PrimaryButton>
            <button
              type="button"
              onClick={clearAll}
              className="press mt-2 flex w-full items-center justify-center gap-2 text-[14px] font-medium text-ink-3"
            >
              <Trash2 className="size-4" /> Clear all
            </button>
          </ActionBar>
        </>
      )}
    </div>
  );
}
