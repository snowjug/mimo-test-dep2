const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const path = require('path');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'mimo-v2-11868.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const UPLOAD_DIR = '../'; // Files are in mimo-test-dep2 root

async function uploadFile(fileName) {
  const filePath = path.join(UPLOAD_DIR, fileName);
  const destination = `test_e2e/${fileName}`;
  console.log(`Uploading ${fileName}...`);
  await bucket.upload(filePath, {
    destination: destination,
    public: true, // Make URL accessible
  });
  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
  console.log(`Uploaded: ${fileUrl}`);
  return fileUrl;
}

async function runE2E() {
  try {
    const userId = "test_e2e_user";
    const now = admin.firestore.FieldValue.serverTimestamp();

    // 1. Upload the files
    const pdfUrl = await uploadFile("test_5_pages.pdf");
    const docUrl = await uploadFile("test_doc.docx");
    const imgUrl = await uploadFile("test_image.jpg");

    const blankUrl = "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fblank_a4.pdf";
    const graphUrl = "https://storage.googleapis.com/mimo-v2-11868.firebasestorage.app/templates%2Fmimo_graph.pdf";

    console.log("Files uploaded. Creating jobs...");

    const jobs = [
      // Case 1: Different Formats (Word Doc & Image)
      {
        fileName: "test_doc.docx",
        fileUrl: docUrl,
        status: "printing",
        kioskId: "CV-001",
        pageCount: 1,
        copies: 1,
        colorMode: "monochrome",
        printOptions: {},
        createdAt: now,
        updatedAt: now,
        userId
      },
      {
        fileName: "test_image.jpg",
        fileUrl: imgUrl,
        status: "printing",
        kioskId: "CV-001",
        pageCount: 1,
        copies: 1,
        colorMode: "monochrome",
        printOptions: { imageScaling: "fill" },
        createdAt: now,
        updatedAt: now,
        userId
      },
      // Case 2: 5 Pages PDF
      {
        fileName: "test_5_pages.pdf",
        fileUrl: pdfUrl,
        status: "printing",
        kioskId: "CV-001",
        pageCount: 5,
        copies: 1,
        colorMode: "monochrome",
        printOptions: {},
        createdAt: now,
        updatedAt: now,
        userId
      },
      // Case 3: Blank Sheet and Mimo Graph
      {
        fileName: "blank_a4.pdf",
        fileUrl: blankUrl,
        status: "printing",
        kioskId: "CV-001",
        pageCount: 1,
        copies: 1,
        colorMode: "monochrome",
        printOptions: { isBlankSheet: true, sheetType: "a4" },
        createdAt: now,
        updatedAt: now,
        userId
      },
      {
        fileName: "mimo_graph.pdf",
        fileUrl: graphUrl,
        status: "printing",
        kioskId: "CV-001",
        pageCount: 1,
        copies: 1,
        colorMode: "monochrome",
        printOptions: { isBlankSheet: true, sheetType: "graph" },
        createdAt: now,
        updatedAt: now,
        userId
      }
    ];

    for (const job of jobs) {
      const ref = await db.collection("print_jobs").add(job);
      console.log(`Injected job ${ref.id} for ${job.fileName}`);
    }

    console.log("E2E Test jobs successfully deployed to Firestore!");
    process.exit(0);
  } catch (err) {
    console.error("Error running E2E:", err);
    process.exit(1);
  }
}

runE2E();
