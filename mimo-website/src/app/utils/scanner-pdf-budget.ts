/**
 * MIMO Document Scanner - 500 KB PDF fitting
 *
 * Re-encodes every scanned page for the final page count, builds the PDF exactly the way the backend does
 * (functions/src/document-scanner/scanner.service.js: one A4 page per scan, image scaled to fit, same pdf-lib
 * version) and measures the real bytes. Quality, then resolution, steps down until the PDF fits.
 */

export const MAX_PDF_BYTES = 500 * 1024;
// The backend rebuilds the PDF from the same JPEGs; leave room for its metadata (dates, producer) differing.
const TARGET_PDF_BYTES = MAX_PDF_BYTES - 8 * 1024;

export const A4_PORTRAIT = { width: 595.28, height: 841.89 };

// Ordered from best to smallest. Resolution only drops once quality alone can no longer get there.
const SCALES = [1, 0.85, 0.72, 0.6, 0.5];
const QUALITIES = [0.82, 0.72, 0.62, 0.54, 0.46, 0.4];
export const FIT_STEPS = SCALES.flatMap((scale) => QUALITIES.map((quality) => ({ scale, quality })));

export interface FittedPdf {
  jpegs: Blob[];
  pdfBytes: number;
  step: number;
  scale: number;
  quality: number;
}

/** A4 page in points for an image, portrait or landscape to match it, with the image scaled to fit and centred. */
export function a4Layout(imageWidth: number, imageHeight: number) {
  const landscape = imageWidth > imageHeight;
  const pageWidth = landscape ? A4_PORTRAIT.height : A4_PORTRAIT.width;
  const pageHeight = landscape ? A4_PORTRAIT.width : A4_PORTRAIT.height;
  const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

async function buildPdf(jpegs: Uint8Array[]): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const bytes of jpegs) {
    const img = await doc.embedJpg(bytes);
    const l = a4Layout(img.width, img.height);
    const page = doc.addPage([l.pageWidth, l.pageHeight]);
    page.drawImage(img, { x: l.x, y: l.y, width: l.width, height: l.height });
  }
  return (await doc.save()).length;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read a scanned page"));
    img.src = src;
  });
}

function encode(img: HTMLImageElement, scale: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas unavailable"));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encoding failed"))), "image/jpeg", quality)
  );
}

/**
 * Find the best-quality encoding of all pages whose final PDF fits under 500 KB, starting at `fromStep`
 * (used to go one step smaller if the backend still measures the PDF as too large). Returns null when even
 * the smallest step does not fit — the document cannot be reduced further without becoming unreadable.
 */
export async function fitPagesToPdfLimit(pageDataUrls: string[], fromStep = 0): Promise<FittedPdf | null> {
  const images = await Promise.all(pageDataUrls.map(loadImage));
  for (let step = fromStep; step < FIT_STEPS.length; step++) {
    const { scale, quality } = FIT_STEPS[step];
    const jpegs = await Promise.all(images.map((img) => encode(img, scale, quality)));
    const bytes = await Promise.all(jpegs.map(async (b) => new Uint8Array(await b.arrayBuffer())));
    const pdfBytes = await buildPdf(bytes);
    if (pdfBytes <= TARGET_PDF_BYTES) {
      return { jpegs, pdfBytes, step, scale, quality };
    }
  }
  return null;
}
