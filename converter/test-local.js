const fs = require("fs");
const path = require("path");
const os = require("os");
const { PDFDocument } = require("pdf-lib");
const { runLibreOfficeConversion, getLibreOfficeBinary } = require("./index");

// Frontend heuristic implementation for comparison (from upload-file.tsx)
async function frontendEstimateDocx(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // Find EOCD signature: 0x06054b50
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

    let words = 0;
    let pagesMetadata = 1;
    let paragraphs = 0;
    let pageBreaks = 0;

    const zlib = require("zlib");
    const decompress = (dataOffset, compSize) => {
      if (compSize === 0) return "";
      const compressed = buffer.subarray(dataOffset, dataOffset + compSize);
      try {
        return zlib.inflateRawSync(compressed).toString("utf-8");
      } catch (e) {
        return "";
      }
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

      const fileName = buffer.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen).toString("utf-8");

      if (localHeaderOffset + 30 <= buffer.length) {
        const lfSig = view.getUint32(localHeaderOffset, true);
        if (lfSig === 0x04034b50) {
          const lfFileNameLen = view.getUint16(localHeaderOffset + 26, true);
          const lfExtraFieldLen = view.getUint16(localHeaderOffset + 28, true);
          const dataOffset = localHeaderOffset + 30 + lfFileNameLen + lfExtraFieldLen;

          if (fileName === "docProps/app.xml") {
            const text = decompress(dataOffset, compSize);
            const pagesMatch = text.match(/<Pages>(\d+)<\/Pages>/);
            const wordsMatch = text.match(/<Words>(\d+)<\/Words>/);
            pagesMetadata = pagesMatch ? parseInt(pagesMatch[1], 10) : 1;
            words = wordsMatch ? parseInt(wordsMatch[1], 10) : 0;
          }

          if (fileName === "word/document.xml") {
            const text = decompress(dataOffset, compSize);
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
    return {
      pagesMetadata,
      words,
      estPagesByWords,
      paragraphs,
      estPagesByParagraphs,
      pageBreaks,
      estPagesByBreaks,
      calculatedEstimate: Math.max(pagesMetadata, estPagesByWords, estPagesByParagraphs, estPagesByBreaks)
    };
  } catch (err) {
    return { error: err.message, calculatedEstimate: 1 };
  }
}

async function testSingleFile(inputPath) {
  const fileName = path.basename(inputPath);
  console.log(`\n======================================================`);
  console.log(`TESTING FILE: ${fileName}`);
  console.log(`File size: ${(fs.statSync(inputPath).size / 1024).toFixed(1)} KB`);
  console.log(`Input path: ${inputPath}`);

  // 1. Run frontend heuristic
  const heuristic = await frontendEstimateDocx(inputPath);
  console.log(`\n[1] Frontend Heuristic Analysis:`);
  console.log(`    - pagesMetadata (<Pages>): ${heuristic.pagesMetadata}`);
  console.log(`    - words (<Words>): ${heuristic.words} -> Math.ceil(words/350) = ${heuristic.estPagesByWords}`);
  console.log(`    - paragraphs (<w:p>): ${heuristic.paragraphs} -> Math.ceil(p/22) = ${heuristic.estPagesByParagraphs}`);
  console.log(`    - pageBreaks (<w:br> + <w:lastRendered>): ${heuristic.pageBreaks} -> breaks+1 = ${heuristic.estPagesByBreaks}`);
  console.log(`    >>> FLAGGED HEURISTIC OUTPUT: ${heuristic.calculatedEstimate} pages`);

  // 2. Run LibreOffice conversion
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lo_test_"));
  const safeBaseName = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9._-]/g, "_");
  const localInput = path.join(tempDir, `${safeBaseName}${path.extname(fileName)}`);
  fs.copyFileSync(inputPath, localInput);

  const startTime = Date.now();
  try {
    console.log(`\n[2] Running LibreOffice conversion via '${getLibreOfficeBinary()}'...`);
    await runLibreOfficeConversion(localInput, tempDir, 60000);
    const duration = Date.now() - startTime;
    console.log(`    ✅ Conversion completed in ${duration}ms`);

    // 3. Locate generated PDF
    const expectedPdf = path.join(tempDir, `${safeBaseName}.pdf`);
    if (!fs.existsSync(expectedPdf)) {
      throw new Error(`Output PDF not found at ${expectedPdf}`);
    }
    const pdfStats = fs.statSync(expectedPdf);
    console.log(`    ✅ Output PDF created: ${expectedPdf} (${(pdfStats.size / 1024).toFixed(1)} KB)`);

    // 4. Load PDF with pdf-lib and get exact page count
    console.log(`\n[3] Parsing output PDF with pdf-lib...`);
    const pdfBytes = fs.readFileSync(expectedPdf);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const realPageCount = pdfDoc.getPageCount();
    console.log(`    ✅ pdf-lib successfully parsed PDF!`);
    console.log(`    >>> REAL RENDERED PAGE COUNT: ${realPageCount} pages`);

    // 5. Comparison
    console.log(`\n[4] VERDICT:`);
    console.log(`    Frontend Heuristic Guess: ${heuristic.calculatedEstimate} pages`);
    console.log(`    Actual LibreOffice Pages: ${realPageCount} pages`);
    if (heuristic.calculatedEstimate !== realPageCount) {
      console.log(`    ⚠️  HEURISTIC WAS WRONG BY ${Math.abs(heuristic.calculatedEstimate - realPageCount)} PAGES!`);
    } else {
      console.log(`    Match on this file.`);
    }

    return {
      fileName,
      success: true,
      heuristic: heuristic.calculatedEstimate,
      realPageCount,
      durationMs: duration
    };
  } catch (err) {
    console.error(`    ❌ Conversion failed: ${err.message}`);
    return {
      fileName,
      success: false,
      error: err.message
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

async function runAllTests() {
  console.log("Starting LibreOffice Local Conversion Tests...");
  console.log(`LibreOffice binary: ${getLibreOfficeBinary()}`);

  const candidates = [
    path.join(__dirname, "..", "test_doc.docx"),
    path.join(os.homedir(), "Downloads", "Mimo_Assignment.docx"),
    path.join(os.homedir(), "Downloads", "Amrutha_Report.docx"),
    path.join(os.homedir(), "Downloads", "Clothing_Rental_Management_System_Report.docx"),
    path.join(os.homedir(), "Downloads", "my report.docx")
  ];

  const results = [];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const r = await testSingleFile(p);
      results.push(r);
    }
  }

  console.log("\n======================================================");
  console.log("SUMMARY OF LOCAL CONVERSION TESTS:");
  console.table(results);
}

runAllTests().catch(console.error);
