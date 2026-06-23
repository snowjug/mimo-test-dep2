import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { MimoCoinsDisplay } from "../components/mimo-coins-display";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Upload, FileText, X, Printer, CheckCircle, AlertCircle, ImageIcon, History, Layers, Wallet, FileIcon, Grid3X3, Loader2, QrCode, FileCheck } from "lucide-react";
import { toast } from "sonner";
import api from "../api";
import { PDFDocument } from "pdf-lib";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../lib/firebase";

interface UploadedFile {
  name: string;
  size: number;
  type?: string;
  status: "uploading" | "completed" | "failed";
  progress: number;
  pageCount?: number;
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
    let pagesMetadata = 1;
    let paragraphs = 0;
    let pageBreaks = 0;

    const decompressEntry = async (dataOffset: number, compSize: number): Promise<string> => {
      if (compSize === 0) return "";
      const compressedData = buffer.slice(dataOffset, dataOffset + compSize);
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      
      // Start writing and close concurrently to prevent backpressure deadlock
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
      
      const fileNameBytes = buffer.slice(cdOffset + 46, cdOffset + 46 + fileNameLen);
      const fileName = new TextDecoder("utf-8").decode(fileNameBytes);
      
      if (localHeaderOffset + 30 <= buffer.length) {
        const lfSig = view.getUint32(localHeaderOffset, true);
        if (lfSig === 0x04034b50) {
          const lfFileNameLen = view.getUint16(localHeaderOffset + 26, true);
          const lfExtraFieldLen = view.getUint16(localHeaderOffset + 28, true);
          const dataOffset = localHeaderOffset + 30 + lfFileNameLen + lfExtraFieldLen;
          
          if (fileName === 'docProps/app.xml') {
            const text = await decompressEntry(dataOffset, compSize);
            const pagesMatch = text.match(/<Pages>(\d+)<\/Pages>/);
            const wordsMatch = text.match(/<Words>(\d+)<\/Words>/);
            pagesMetadata = pagesMatch ? parseInt(pagesMatch[1], 10) : 1;
            words = wordsMatch ? parseInt(wordsMatch[1], 10) : 0;
          }
          
          if (fileName === 'word/document.xml') {
            const text = await decompressEntry(dataOffset, compSize);
            const pMatches = text.match(/<w:p\b/g);
            paragraphs = pMatches ? pMatches.length : 0;
            
            const lrbMatches = text.match(/<w:lastRenderedPageBreak\b/g);
            const lrbCount = lrbMatches ? lrbMatches.length : 0;
            
            const brMatches = text.match(/<w:br\b[^>]*?w:type="page"/g);
            const brCount = brMatches ? brMatches.length : 0;
            
            pageBreaks = lrbCount + brCount;
          }
        }
      }
      
      cdOffset += 46 + fileNameLen + extraFieldLen + commentLen;
    }

    const estPagesByWords = Math.ceil(words / 350);
    const estPagesByParagraphs = Math.ceil(paragraphs / 22);
    const estPagesByBreaks = pageBreaks + 1;
    return Math.max(pagesMetadata, estPagesByWords, estPagesByParagraphs, estPagesByBreaks);

  } catch (err) {
    console.error("Error reading DOCX pages:", err);
  }
  
  // Fallback: rough estimation based on size
  return file.size > 2000000 ? Math.max(1, Math.floor(file.size / 500000)) : 1;
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
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploadedFilesData, setUploadedFilesData] = useState<any[]>([]); // holds full metadata with URLs
  const [isDragging, setIsDragging] = useState(false);
  const [userName, setUserName] = useState("Admin User");
  const [userStats, setUserStats] = useState({ totalDocs: 0, totalPages: 0, totalSpent: 0 });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedName = localStorage.getItem("mimo_user_name");
    if (storedName) setUserName(storedName);

    // If a print code is present, it means the user just finished a print job.
    // Clear the print session to start fresh.
    const storedPrintCode = sessionStorage.getItem("printCode");
    if (storedPrintCode) {
      sessionStorage.removeItem("printCode");
      sessionStorage.removeItem("printFiles");
      sessionStorage.removeItem("printOptions");
      sessionStorage.removeItem("uploadedImages");
      sessionStorage.removeItem("uploadAmount");
      sessionStorage.removeItem("uploadTotalPages");
      sessionStorage.removeItem("totalPages");
      sessionStorage.removeItem("printStatus");
    } else {
      // Initialize from sessionStorage if exists
      const storedPrintFiles = sessionStorage.getItem("printFiles");
      if (storedPrintFiles) {
        try {
          const parsed = JSON.parse(storedPrintFiles);
          setUploadedFilesData(parsed);
          setFiles(parsed.map((f: any) => ({
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
        } catch (err) {
          console.error("Failed to restore files from session:", err);
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
  }, []);

  const handleFileSelect = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const formData = new FormData();
    const fileArray = Array.from(fileList);

    // Extract image data URLs BEFORE upload using memory-efficient Object URLs
    const imageDataUrls: { name: string; mimetype: string; dataUrl: string }[] = [];
    for (const file of fileArray) {
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        const dataUrl = URL.createObjectURL(file);
        imageDataUrls.push({ name: file.name, mimetype: file.type, dataUrl });
      }
    }
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

    const newFiles: UploadedFile[] = fileArray.map((file) => {
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        status: "uploading",
        progress: 0,
        pageCount: 0,
      };
    });

    setFiles((prev) => [...prev, ...newFiles]);
    setUploading(true);

    try {
      // 1. Parse PDFs locally for page counts
      const filesMeta = await Promise.all(fileArray.map(async (f) => {
        let pageCount = 1;
        const nameLower = f.name.toLowerCase();
        const isDocx = nameLower.endsWith(".docx") || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const isPptx = nameLower.endsWith(".pptx") || f.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        const isXlsx = nameLower.endsWith(".xlsx") || f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (f.type === "application/pdf") {
          try {
            const arrayBuffer = await f.arrayBuffer();
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
        return { name: f.name, type: f.type, size: f.size, pageCount };
      }));

      // 2. Upload directly to Firebase Storage
      const uploadPromises = fileArray.map(async (file) => {
        const uniqueFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = ref(storage, `uploads/${userName.replace(/[^a-zA-Z0-9]/g, '_')}/${uniqueFileName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        return new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              const displayProgress = progress === 100 ? 99 : progress;
              setFiles((prev) =>
                prev.map((f) =>
                  f.name === file.name ? { ...f, progress: displayProgress } : f
                )
              );
            },
            (error) => {
              reject(error);
            },
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              const meta = filesMeta.find(m => m.name === file.name);
              resolve({ name: file.name, url: downloadURL, type: file.type, size: file.size, pageCount: meta?.pageCount || 1 });
            }
          );
        });
      });

      const uploadedFiles = await Promise.all(uploadPromises) as any[];

      // Store the full file metadata (with URLs) for later use in handlePrint
      setUploadedFilesData(prev => [...prev, ...uploadedFiles]);

      // 3. Tell backend to finalize and create database records
      // In Serverless architecture, this doesn't trigger conversion anymore. It just creates the job.
      const response = await api.post("/finalize-upload", { files: uploadedFiles });
      
      // Update UI
      setFiles((prev) =>
        prev.map((f) => {
          const isTarget = newFiles.some((nf) => nf.name === f.name);
          if (isTarget) {
            const meta = uploadedFiles.find(uf => uf.name === f.name);
            return { ...f, status: "completed", progress: 100, pageCount: meta?.pageCount || 1 };
          }
          return f;
        })
      );
      toast.success("Files ready for printing!");

      // Calculate total pages for pricing
      const totalPages = uploadedFiles.reduce((acc: number, curr: any) => acc + curr.pageCount, 0);
      setBackendTotalPages(totalPages);
      
      // Assuming a base rate of 2 per page for estimation, backend handles real calculation
      sessionStorage.setItem("uploadAmount", (totalPages * 2).toString());
      sessionStorage.setItem("uploadTotalPages", totalPages.toString());
      setUploading(false);

    } catch (err) {
      console.error(err);
      setFiles((prev) =>
        prev.map((f) =>
          newFiles.some((nf) => nf.name === f.name) ? { ...f, status: "failed", progress: 0 } : f
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
    const meta = uploadedFilesData.find((f) => f.name === fileToRemove.name);

    if (fileToRemove.status === "completed" && meta && meta.url) {
      try {
        await api.delete("/remove-file", { data: { fileUrl: meta.url } });
      } catch (err) {
        console.error("Failed to delete from cloud:", err);
      }
    }

    const updatedFiles = files.filter((_, i) => i !== index);
    const updatedData = uploadedFilesData.filter((f) => f.name !== fileToRemove.name);

    setFiles(updatedFiles);
    setUploadedFilesData(updatedData);

    // Remove from sessionStorage image list
    const existingRaw = sessionStorage.getItem("uploadedImages");
    if (existingRaw) {
      const existingImages = JSON.parse(existingRaw);
      const updatedImages = existingImages.filter((img: any) => img.name !== fileToRemove.name);
      if (updatedImages.length > 0) {
        sessionStorage.setItem("uploadedImages", JSON.stringify(updatedImages));
      } else {
        sessionStorage.removeItem("uploadedImages");
      }
    }

    // Sync Firestore with the remaining files list!
    try {
      await api.post("/finalize-upload", { files: updatedData });
    } catch (err) {
      console.error("Failed to sync remaining files with backend:", err);
    }

    // Update printFiles in sessionStorage
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
    // Use uploadedFilesData which contains the full metadata WITH Firebase download URLs
    const completedFiles = uploadedFilesData.filter(f =>
      files.some(uf => uf.name === f.name && uf.status === "completed")
    );
    sessionStorage.setItem("printFiles", JSON.stringify(completedFiles));
    navigate("/print-options");
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50/50 px-2 pt-0 pb-2 sm:px-4 sm:pt-0 sm:pb-4">
      <div className="mx-auto max-w-5xl space-y-2 sm:space-y-3">

        {/* Global Styles for Custom Fonts */}
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Outfit:wght@400;500;600&family=Chewy&family=Pacifico&display=swap');
            
            @keyframes float-hey {
              0%, 100% { transform: rotate(-10deg) translateY(0px); }
              50% { transform: rotate(-3deg) translateY(-8px); }
            }
          `}
        </style>

        {/* Header */}
        <div className="flex items-center justify-between pt-3 sm:pt-5">
          <div className="flex flex-col items-start cursor-pointer group select-none ml-2 pt-1">
            <div className="z-20 -mb-2 relative animate-[float-hey_3s_ease-in-out_infinite] hover:rotate-0 hover:scale-[1.15] transition-all duration-300">
              <span
                className="text-[3.5rem] sm:text-[6rem] bg-clip-text text-transparent bg-gradient-to-tr from-[#093765] via-blue-600 to-[#a855f7] leading-none drop-shadow-[0_8px_8px_rgba(9,55,101,0.4)] pr-2"
                style={{ fontFamily: "'Chewy', cursive", letterSpacing: "1px" }}
              >
                HEY!
              </span>
            </div>
            <h1
              className="text-2xl sm:text-5xl font-bold text-gray-900 tracking-tight z-10 -mt-1"
              style={{ fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif" }}
            >
              {userName}
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Dialog>
              <DialogTrigger asChild>
                <button 
                  className="flex items-center justify-center w-10 h-10 cursor-pointer bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-200 shadow-sm shrink-0"
                  title="How to print?"
                >
                  <svg 
                    className="w-5 h-5 text-blue-600" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="3.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                    <Printer className="w-6 h-6 text-blue-600" />
                    How to use MIMO
                  </DialogTitle>
                  <DialogDescription className="text-base">
                    Follow these simple steps to print your documents easily.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex gap-4 items-start">
                    <div className="bg-blue-100 p-2 rounded-full shrink-0"><Upload className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h4 className="font-bold text-gray-900">1. Upload Files</h4>
                      <p className="text-sm text-gray-600">Select and upload the PDF or Image files you wish to print.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="bg-blue-100 p-2 rounded-full shrink-0"><FileCheck className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h4 className="font-bold text-gray-900">2. Configure Options</h4>
                      <p className="text-sm text-gray-600">Choose your print destination, color mode, sides, layout, and number of copies.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="bg-blue-100 p-2 rounded-full shrink-0"><QrCode className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h4 className="font-bold text-gray-900">3. Get Your Print Code</h4>
                      <p className="text-sm text-gray-600">After payment, a secure 4-digit code will be generated for your print job.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="bg-blue-100 p-2 rounded-full shrink-0"><Printer className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h4 className="font-bold text-gray-900">4. Print at Kiosk</h4>
                      <p className="text-sm text-gray-600">Go to the selected MIMO printer kiosk, enter your 4-digit code on the keypad, and collect your printed document!</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <MimoCoinsDisplay />
            <div className="flex items-center gap-1 sm:gap-3 cursor-pointer p-1 sm:p-2 hover:bg-white/50 rounded-xl transition-colors" onClick={() => navigate("/user-profile")}>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-gray-700">{userName}</p>
                <p className="text-xs text-gray-500">View Profile</p>
              </div>
              <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                <AvatarFallback className="bg-gradient-to-br from-[#093765] to-blue-600 text-white">
                  {userName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-[#093765] to-blue-600 bg-clip-text text-transparent animate-in fade-in slide-in-from-left-4 duration-500">Upload Documents</h1>
        </div>

        {/* Printer Status */}
        <Card className="border-0 shadow-xl bg-gradient-to-br from-[#093765] via-blue-700 to-blue-500 text-white overflow-hidden relative group hover:shadow-2xl transition-shadow duration-300">
          <div className="absolute top-0 right-0 p-6 opacity-[0.07] group-hover:opacity-[0.14] transition-opacity duration-500 pointer-events-none">
            <Printer className="w-36 h-36 rotate-12" />
          </div>
          {/* Subtle shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
          <CardContent className="p-4 sm:p-6 relative z-10">
            <div className="flex flex-row items-center justify-between gap-3 sm:gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 sm:gap-3 mb-3">
                  <h3 className="font-extrabold text-base sm:text-xl tracking-tight">My Dashboard</h3>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-md">
                  <div className="bg-white/10 hover:bg-white/20 rounded-xl p-2 sm:p-3 text-center backdrop-blur-sm border border-white/10 transition-colors duration-200 cursor-default">
                    <div className="text-[9px] sm:text-[10px] opacity-70 flex items-center justify-center gap-1 mb-1 uppercase tracking-wider font-semibold"><History className="w-3 h-3" /> Prints</div>
                    <div className="font-black text-sm sm:text-xl">{userStats.totalDocs}</div>
                  </div>
                  <div className="bg-white/10 hover:bg-white/20 rounded-xl p-2 sm:p-3 text-center backdrop-blur-sm border border-white/10 transition-colors duration-200 cursor-default">
                    <div className="text-[9px] sm:text-[10px] opacity-70 flex items-center justify-center gap-1 mb-1 uppercase tracking-wider font-semibold"><Layers className="w-3 h-3" /> Pages</div>
                    <div className="font-black text-sm sm:text-xl">{userStats.totalPages}</div>
                  </div>
                  <div className="bg-white/10 hover:bg-white/20 rounded-xl p-2 sm:p-3 text-center backdrop-blur-sm border border-white/10 transition-colors duration-200 cursor-default">
                    <div className="text-[9px] sm:text-[10px] opacity-70 flex items-center justify-center gap-1 mb-1 uppercase tracking-wider font-semibold"><Wallet className="w-3 h-3" /> Spent</div>
                    <div className="font-black text-sm sm:text-xl">₹{Number(userStats.totalSpent).toFixed(0)}</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Area */}
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-xl">
          <div className="p-3 sm:p-5">
            <div
              className={`border-2 border-dashed transition-all duration-300 ease-in-out group cursor-pointer ${
                isDragging
                  ? "border-[#093765] bg-blue-50/60 scale-[1.01] shadow-lg shadow-blue-100"
                  : "border-slate-200 hover:border-[#093765]/60 hover:bg-blue-50/30"
              } ${
                files.length > 0
                  ? "p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-center gap-4 text-center"
                  : "p-6 sm:p-10 rounded-2xl text-center flex flex-col items-center justify-center"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {files.length > 0 ? (
                <>
                  <div className="flex items-center justify-center gap-3">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-blue-100' : 'bg-slate-100 group-hover:bg-blue-50'}`}>
                      <Upload className={`w-5 h-5 sm:w-6 sm:h-6 transition-colors duration-300 ${isDragging ? "text-[#093765]" : "text-slate-400 group-hover:text-[#093765]"}`} />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm sm:text-base font-bold text-slate-700 group-hover:text-[#093765] transition-colors">Add more files</h3>
                      <p className="text-xs text-slate-400">PDF, DOCX, Images, TXT, PPTX, &amp; more</p>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.ppt,.pptx,.xls,.xlsx" onChange={(e) => handleFileSelect(e.target.files)} />
                </>
              ) : (
                <>
                  {/* Pulsing ring + icon */}
                  <div className="relative mb-5">
                    <div className={`absolute inset-0 rounded-full transition-all duration-300 ${isDragging ? 'bg-blue-200 scale-125 opacity-40' : 'bg-transparent group-hover:bg-blue-100 group-hover:scale-110 opacity-0 group-hover:opacity-50'}`} />
                    <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all duration-300 relative z-10 border-2 ${
                      isDragging ? 'bg-blue-100 border-[#093765]' : 'bg-slate-100 border-transparent group-hover:bg-blue-50 group-hover:border-[#093765]/30'
                    }`}>
                      <Upload className={`w-7 h-7 sm:w-9 sm:h-9 transition-all duration-300 ${
                        isDragging ? "text-[#093765] scale-110" : "text-slate-400 group-hover:text-[#093765] group-hover:scale-110 group-hover:-translate-y-0.5"
                      }`} />
                    </div>
                  </div>
                  <h3 className="text-base sm:text-xl font-extrabold mb-1.5 text-slate-700 group-hover:text-[#093765] transition-colors duration-200">
                    {isDragging ? "Release to upload!" : "Click or drag files here to print"}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 mb-1 max-w-xs mx-auto">
                    PDF, DOCX, JPG, PNG, TXT, PPTX, &amp; more
                  </p>
                  <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.ppt,.pptx,.xls,.xlsx" onChange={(e) => handleFileSelect(e.target.files)} />
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Quick Print - A4 Sheet, Mimo Graph & Custom Document */}
        {files.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <button
              onClick={() => navigate("/blank-pages?type=a4")}
              className="group relative overflow-hidden rounded-2xl p-4 sm:p-5 border-0 shadow-lg bg-white/80 backdrop-blur-xl text-left transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-blue-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10 flex flex-col items-center sm:items-start gap-3">
                <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg border-2 border-slate-300 bg-white flex items-center justify-center shadow-sm group-hover:border-[#093765] group-hover:shadow-md transition-all duration-300">
                  <FileIcon className="w-6 h-6 sm:w-7 sm:h-7 text-slate-400 group-hover:text-[#093765] transition-colors duration-300" />
                </div>
                <div className="text-center sm:text-left">
                  <h3 className="font-bold text-sm sm:text-base text-slate-800 group-hover:text-[#093765] transition-colors">Blank A4 Sheet</h3>
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-16 h-16 bg-gradient-to-tl from-blue-100 to-transparent rounded-tl-full opacity-0 group-hover:opacity-60 transition-opacity duration-300" />
            </button>

            <button
              onClick={() => navigate("/blank-pages?type=graph")}
              className="group relative overflow-hidden rounded-2xl p-4 sm:p-5 border-0 shadow-lg bg-white/80 backdrop-blur-xl text-left transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-teal-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10 flex flex-col items-center sm:items-start gap-3">
                <div
                  className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg border-2 border-emerald-300 bg-white flex items-center justify-center shadow-sm group-hover:border-emerald-500 group-hover:shadow-md transition-all duration-300"
                  style={{
                    backgroundImage: "linear-gradient(rgba(16, 185, 129, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.12) 1px, transparent 1px)",
                    backgroundSize: "6px 6px",
                  }}
                >
                  <Grid3X3 className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 group-hover:text-emerald-600 transition-colors duration-300" />
                </div>
                <div className="text-center sm:text-left">
                  <h3 className="font-bold text-sm sm:text-base text-slate-800 group-hover:text-emerald-700 transition-colors">MIMO Graph</h3>
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-16 h-16 bg-gradient-to-tl from-emerald-100 to-transparent rounded-tl-full opacity-0 group-hover:opacity-60 transition-opacity duration-300" />
            </button>

            <button
              onClick={() => navigate("/text-editor")}
              className="group relative overflow-hidden rounded-2xl p-4 sm:p-5 border-0 shadow-lg bg-white/80 backdrop-blur-xl text-left transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10 flex flex-col items-center sm:items-start gap-3">
                <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg border-2 border-purple-300 bg-white flex items-center justify-center shadow-sm group-hover:border-purple-500 group-hover:shadow-md transition-all duration-300">
                  <FileText className="w-6 h-6 sm:w-7 sm:h-7 text-purple-400 group-hover:text-purple-600 transition-colors duration-300" />
                </div>
                <div className="text-center sm:text-left">
                  <h3 className="font-bold text-sm sm:text-base text-slate-800 group-hover:text-purple-700 transition-colors">Custom Document</h3>
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-16 h-16 bg-gradient-to-tl from-purple-100 to-transparent rounded-tl-full opacity-0 group-hover:opacity-60 transition-opacity duration-300" />
            </button>
          </div>
        )}

        {/* Uploaded Files */}
        {files.length > 0 && (
          <Card className="border-0 shadow-lg overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-500 gap-3">
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Uploaded Files</CardTitle>
                </div>

              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {files.map((file, index) => {
                  const isPdf = file.name.toLowerCase().endsWith('.pdf');
                  const isImage = file.type?.startsWith('image/');
                  return (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 sm:p-4 border border-slate-200 rounded-2xl bg-white hover:shadow-md hover:border-[#093765]/20 transition-all duration-200 group animate-in slide-in-from-left-2 fade-in duration-300"
                  >
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                      file.status === 'completed'
                        ? isPdf ? 'bg-red-50 text-red-500' : isImage ? 'bg-purple-50 text-purple-500' : 'bg-blue-50 text-[#093765]'
                        : file.status === 'uploading' ? 'bg-amber-50 text-amber-500' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {isImage ? <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6" /> : <FileText className="w-5 h-5 sm:w-6 sm:h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        {file.status === "completed" && (
                          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 whitespace-nowrap text-[10px] sm:text-xs">
                            {file.pageCount ? `${file.pageCount} pgs` : `~${file.type?.startsWith('image/') ? 1 : (file.size > 2000000 ? Math.floor(file.size / 500000) : 1)} pgs`}
                          </Badge>
                        )}
                        {file.status === "failed" && (
                          <Badge variant="destructive">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      {file.status === "uploading" && (
                        <div className="mt-3">
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                          {file.progress >= 99 && (
                            <p className="text-[10px] text-indigo-600 font-semibold mt-1 animate-pulse">
                              Processing on server... this may take a moment.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-5 pt-4 border-t border-slate-200 w-full">
                <Button
                  className="flex-1 h-12 text-sm sm:text-base font-black uppercase tracking-widest bg-gradient-to-r from-[#093765] to-blue-600 hover:from-[#052345] hover:to-blue-700 text-white shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-900/30 active:scale-[0.98] transition-all duration-300 rounded-xl w-full sm:w-auto"
                  disabled={files.length === 0 || files.some((f) => f.status === "uploading")}
                  onClick={handlePrint}
                >
                  Continue to Print
                </Button>
                <Button 
                  variant="outline"
                  className="flex-1 h-12 text-sm font-bold uppercase tracking-wider border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-600 bg-white hover:bg-red-50/30 rounded-xl transition-all duration-300 w-full sm:w-auto shadow-xs cursor-pointer" 
                  onClick={() => {
                  setFiles([]);
                  setUploadedFilesData([]);
                  setBackendTotalPages(0);
                  sessionStorage.removeItem("uploadedImages");
                  sessionStorage.removeItem("printFiles");
                  sessionStorage.removeItem("printOptions");
                  sessionStorage.removeItem("uploadAmount");
                  sessionStorage.removeItem("uploadTotalPages");
                }}>
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}