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
    console.log("🚀 Starting E2E Direct Print Test for CV-001 (Kiosk 001) Monochrome Mode...");

    // 1. Create a dummy test job in Firestore
    const userId = "test-user-id";
    const jobRef = db.collection("print_jobs").doc();
    const jobId = jobRef.id;

    console.log(`📝 Creating dummy print job: ${jobId}`);
    
    // Simulate what /create-order does when a user selects Direct Print to CV-001
    await jobRef.set({
      userId,
      status: "pending",
      fileName: "DirectPrintTest_CV001_BW.pdf",
      fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      pageCount: 1,
      colorMode: "monochrome", // CV-001 should route this to Brother
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      printOptions: {
        directKioskId: "CV-001",
        copies: 1,
        colorMode: "monochrome",
        doubleSided: "single",
        pageSelection: "all",
      }
    });

    console.log(`✅ Print Job created. Calling internal /payment-success webhook...`);

    // 2. Simulate the Cashfree Webhook calling /payment-success
    console.log(`🔄 Simulating backend webhook logic (status -> printing, setting kioskId)...`);
    
    // This is EXACTLY what server.js /payment-success does:
    const docSnapshot = await jobRef.get();
    const data = docSnapshot.data();
    const directKioskId = data.printOptions?.directKioskId;

    if (directKioskId) {
      await jobRef.update({
        status: "printing",
        kioskId: directKioskId,
        "paymentStatus.status": "completed",
        "paymentStatus.paidAt": admin.firestore.FieldValue.serverTimestamp(),
        isPrinted: false,
        printerStatus: "Sent to Kiosk",
        "printStatus.status": "printing"
      });
      console.log(`✅ Backend successfully routed to Direct Print Kiosk: ${directKioskId}`);
    } else {
      console.log(`❌ ERROR: directKioskId not found in printOptions!`);
    }

    console.log(`📡 Waiting for CV-001 Raspberry Pi listener to pick it up...`);
    
    // Listen for updates on the document to see if the Pi marked it printed
    const unsubscribe = jobRef.onSnapshot((doc) => {
      const updatedData = doc.data();
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

    // Timeout after 90 seconds
    setTimeout(() => {
      console.error(`⏳ TIMEOUT: Raspberry Pi did not respond in time. It might be offline or unreachable.`);
      unsubscribe();
      process.exit(1);
    }, 90000);

  } catch (error) {
    console.error("Test Error:", error);
    process.exit(1);
  }
}

runTest();
