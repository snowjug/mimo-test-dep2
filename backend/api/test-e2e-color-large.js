const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function runTest() {
  try {
    console.log("🚀 Starting E2E Large Color Print Test for SV-002 (Epson L3250)...");

    // 1. Create a dummy test job in Firestore
    const userId = "test-user-id";
    const jobRef = db.collection("print_jobs").doc();
    const jobId = jobRef.id;

    console.log(`📝 Creating large print job: ${jobId}`);
    
    await jobRef.set({
      userId,
      status: "pending",
      fileName: "IIIrd sem AE- 2024 Text book.pdf",
      fileUrl: "https://firebasestorage.googleapis.com/v0/b/mimo-v2-11868.firebasestorage.app/o/uploads%2Fwa_918123028797%2FIIIrd%20sem%20AE-%202024%20Text%20book.pdf?alt=media",
      pageCount: 1,
      colorMode: "color", // SV-002 should route this to Epson L3250
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      printOptions: {
        directKioskId: "SV-002",
        copies: 1,
        colorMode: "color",
        doubleSided: "single",
        pageSelection: "all",
      }
    });

    console.log(`✅ Print Job created. Routing to Kiosk SV-002...`);

    // Update status to printing to trigger the Pi listener
    await jobRef.update({
      status: "printing",
      kioskId: "SV-002",
      "paymentStatus.status": "completed",
      "paymentStatus.paidAt": admin.firestore.FieldValue.serverTimestamp(),
      isPrinted: false,
      printerStatus: "Sent to Kiosk",
      "printStatus.status": "printing"
    });

    console.log(`📡 Waiting for SV-002 Raspberry Pi listener to pick it up...`);
    
    // Listen for updates on the document to see if the Pi marked it printed
    const unsubscribe = jobRef.onSnapshot((doc) => {
      const updatedData = doc.data();
      console.log(`📡 Job Status: ${updatedData.status} | Printer Status: ${updatedData.printerStatus}`);
      if (updatedData.status === "completed" || updatedData.status === "printed" || updatedData.isPrinted === true) {
        console.log(`🎉 SUCCESS: Raspberry Pi printed the document!`);
        unsubscribe();
        process.exit(0);
      }
      if (updatedData.status === "failed") {
        console.error(`❌ ERROR: Raspberry Pi failed to print!`);
        unsubscribe();
        process.exit(1);
      }
    });

    // Timeout after 180 seconds (large print job)
    setTimeout(() => {
      console.error(`⏳ TIMEOUT: Raspberry Pi did not respond in time.`);
      unsubscribe();
      process.exit(1);
    }, 180000);

  } catch (error) {
    console.error("Test Error:", error);
    process.exit(1);
  }
}

runTest();
