const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("../../serviceAccountKey.json"))
  });
}

const db = admin.firestore();

async function run() {
  await db.collection("hardware").doc("printers").set({
    "CV-001": { 
      type: "bw", 
      tonerLevel: 100, 
      paperLevel: 500, 
      status: "Online",
      name: "Kiosk 001 (Boys Hostel)" 
    },
    "SV-002-BW": { 
      type: "bw", 
      tonerLevel: 100, 
      paperLevel: 500, 
      status: "Online",
      name: "Brother HL-L2440DW" 
    },
    "SV-002-COLOR": { 
      type: "color", 
      inkLevel: 100, 
      paperLevel: 500, 
      status: "Online",
      name: "Epson EcoTank L3250" 
    }
  });
  console.log("Database seeded successfully with all 3 printers!");
}

run().catch(console.error);
