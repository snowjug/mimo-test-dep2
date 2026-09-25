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

module.exports = {
  isColorJob,
};
