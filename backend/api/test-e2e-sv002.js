const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
const axios = require("axios");


async function runTest() {
  try {
    console.log("🚀 Starting E2E Direct Print Test for SV-002 (Kiosk 002) Color Mode...");

    // 1. Create a dummy test job in Firestore
    const userId = "test-user-id";
    const jobRef = db.collection("print_jobs").doc();
    const jobId = jobRef.id;

    console.log(`📝 Creating dummy print job: ${jobId}`);
    
    // Simulate what /create-order does when a user selects Direct Print to SV-002
    await jobRef.set({
      userId,
      status: "pending",
      fileName: "DirectPrintTest_SV002_Color.pdf",
      fileUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      pageCount: 1,
      colorMode: "color", // SV-002 should route this to Epson_L3250
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      printOptions: {
        directKioskId: "SV-002",
        copies: 1,
        colorMode: "color",
        doubleSided: "single",
        pageSelection: "all",
      }
    });

    console.log(`✅ Print Job created. Calling internal /payment-success webhook...`);

    // 2. Simulate the Cashfree Webhook calling /payment-success
    // We can just call it via HTTP to local server if it's running, or we can just run the DB update directly.
    // Let's run the DB update directly since we don't have the Express server running locally with the dummy token.
    
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

    console.log(`📡 Waiting for SV-002 Raspberry Pi listener to pick it up...`);
    // The tail log background task will catch the Pi output!
    
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

    // Timeout after 60 seconds
    setTimeout(() => {
      console.error(`⏳ TIMEOUT: Raspberry Pi did not respond in time.`);
      unsubscribe();
      process.exit(1);
    }, 60000);

  } catch (error) {
    console.error("Test Error:", error);
    process.exit(1);
  }
}

runTest();
