// ── Helper: detect if print job is Color (case-insensitive across colorMode, printOptions, settings, and color flag) ──
function isColorJob(data) {
  if (!data) return false;
  if (data.color === true) return true;
  const mode = (
    data.colorMode ||
    data.printOptions?.colorMode ||
    data.settings?.colorMode ||
    ""
  ).toString().toLowerCase();
  return mode === "color";
}

// Export the main Express App
// ================= NGROK HELPER =================
const getNgrokUrl = async () => {
  if (process.env.PI_BASE_URL && !process.env.PI_BASE_URL.includes('100.108') && !process.env.PI_BASE_URL.includes('tail2146')) {
    return process.env.PI_BASE_URL;
  }
  return "https://splashed-giddily-populace.ngrok-free.dev";
};

// Helper: call the Pi print API for one file
const triggerPiPrint = async (fileUrl, copies = 1, piUrl = null, printerName = null, options = {}) => {
  const targetPiUrl = piUrl || await getNgrokUrl();
  const targetPrinter = printerName || process.env.PRINTER_NAME || "Brother_HL_L5210DN_series";
  const results = [];
  for (let i = 0; i < copies; i++) {
    const res = await fetch(`${targetPiUrl}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({
        pdfUrl: fileUrl,
        file_url: fileUrl,
        printer_name: targetPrinter,
        doubleSided: options.doubleSided || "single",
        duplex: options.doubleSided === "double",
        orientation: options.orientation || "portrait",
        photoLayout: options.photoLayout || "1",
        imageScaling: options.imageScaling || "fit",
        customScale: options.customScale || 100,
        pageRange: options.pageRange || null
      })
    });
    if (!res.ok) { const errText = await res.text(); throw new Error(`Pi HTTP error ${res.status}: ${errText}`); }
    results.push(await res.json());
  }
  return results;
};

// File types a kiosk's Pi cannot convert. Photos are stored as uploaded (only Office files are converted to PDF
// at upload), and CV-001's Pi has no HEIC decoder: a raw HEIC reached its printer on Sat 26 Sep and began
// five hours of failures. It has never printed a HEIC (0/2); SV-002 prints them (6/6).
const UNSUPPORTED_EXTENSIONS_BY_KIOSK = {
  "CV-001": new Set([".heic", ".heif"]),
};

const extensionOf = (value) => {
  const clean = String(value || "").split("?")[0].split("#")[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep raw */ }
  const match = decoded.match(/(\.[A-Za-z0-9]{1,5})$/);
  return match ? match[1].toLowerCase() : "";
};

/** Names of the files in these jobs that the given kiosk cannot print (empty when all are printable). */
function unprintableFilesForKiosk(jobs, kioskId) {
  const blocked = UNSUPPORTED_EXTENSIONS_BY_KIOSK[kioskId];
  if (!blocked) return [];
  const names = [];
  for (const job of jobs) {
    const files = Array.isArray(job.files) && job.files.length ? job.files : [{ name: job.fileName, url: job.fileUrl }];
    for (const f of files) {
      if (blocked.has(extensionOf(f.name)) || blocked.has(extensionOf(f.url))) names.push(f.name || "photo");
    }
  }
  return names;
}

const unprintableFilesMessage = (names) =>
  `Machine 1 cannot print iPhone photos (HEIC): ${names.join(", ")}. Please use Machine 2 (SV-002) for this order.`;

module.exports = {
  isColorJob,
  unprintableFilesForKiosk,
  unprintableFilesMessage,
};
