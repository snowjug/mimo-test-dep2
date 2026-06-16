const fs = require('fs');
const path = 'c:/Users/HP/Desktop/mimo-test-dep2/backend/api/server.js';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `    const newJobRef = db.collection("print_jobs").doc();
    batchUpdate.set(newJobRef, { 
      userId,
      fileName: mergedFiles.length > 1 ? \`Multiple Files (\${mergedFiles.length})\` : mergedFiles[0].name,
      fileUrl: mergedFiles[0].url, // legacy support for older apps
      mimetype: mergedFiles[0].type, // legacy support
      files: mergedFiles, // The full array of files to print
      size: mergedFiles.reduce((acc, f) => acc + (f.size || 0), 0),
      status: "paid",
      pageCount: totalRawPages,
      printOptions: printOptions || {},
      pricing: { pricePerPage, totalPages: actualPages, jobCost },
      orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });`;

const replacementStr = `    const newJobRef = db.collection("print_jobs").doc();
    batchUpdate.set(newJobRef, { 
      userId,
      fileName: mergedFiles.length > 1 ? \`Multiple Files (\${mergedFiles.length})\` : mergedFiles[0].name,
      fileUrl: mergedFiles[0].url, // legacy support for older apps
      mimetype: mergedFiles[0].type, // legacy support
      files: mergedFiles, // The full array of files to print
      size: mergedFiles.reduce((acc, f) => acc + (f.size || 0), 0),
      status: "paid",
      pageCount: totalRawPages,
      printOptions: printOptions || {},
      pricing: { pricePerPage, totalPages: actualPages, jobCost },
      orderId,
      colorMode,
      color: colorMode === "color",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Successfully patched server.js");
} else {
  console.log("Could not find the target string in server.js");
}
