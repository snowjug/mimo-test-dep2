const axios = require("axios");
const admin = require("firebase-admin");
const crypto = require("crypto");

const serviceAccount = require("../../serviceAccountKey.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();
const API_BASE = "http://localhost:3000";

async function runAudit() {
  console.log("\n==================================================");
  console.log("🚀 STARTING FULL END-TO-END AUDIT");
  console.log("==================================================\n");

  try {
    // Hardware prints only

    // ---------------------------------------------------------
    // 2. HARDWARE PRINT AUDIT
    // ---------------------------------------------------------
    console.log("\n--- 2. HARDWARE PRINT AUDIT ---");
    
    const prints = [
      {
        name: "Hardware Test 1: SV-002 Monochrome",
        url: "https://placehold.co/1000x1414/000000/ffffff.png?text=SV-002+MONOCHROME\nPI+SYSTEM\nCPU:+aarch64\nRAM:+991MB\nDisk:+14%25\nAll+Systems+Go",
        kiosk: "SV-002",
        colorMode: "monochrome",
        scaling: "fit"
      },
      {
        name: "Hardware Test 2: SV-002 Color",
        url: "https://placehold.co/1000x1414/ff00cc/ffffff.png?text=SV-002+COLOR\nPI+SYSTEM\nCPU:+aarch64\nRAM:+991MB\nDisk:+14%25\nImage+Fill+Active",
        kiosk: "SV-002",
        colorMode: "color",
        scaling: "fill"
      },
      {
        name: "Hardware Test 3: CV-001 Monochrome (USB)",
        url: "https://placehold.co/1000x1414/000000/ffffff.png?text=CV-001+MONOCHROME\nPRINTPI+SYSTEM\nCPU:+aarch64\nRAM:+2010MB\nDisk:+30%25\nAll+Systems+Go",
        kiosk: "CV-001",
        colorMode: "monochrome",
        scaling: "fit"
      }
    ];

    const pendingJobs = [];

    for (const print of prints) {
      console.log(`📝 Dispatching: ${print.name}`);
      const jobRef = db.collection("print_jobs").doc();
      await jobRef.set({
        userId: "audit_user",
        status: "printing",
        fileName: `Audit_${print.kiosk}_${print.colorMode}.png`,
        fileUrl: print.url,
        pageCount: 1,
        colorMode: print.colorMode,
        kioskId: print.kiosk,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        printOptions: {
          directKioskId: print.kiosk,
          copies: 1,
          colorMode: print.colorMode,
          doubleSided: "single",
          pageSelection: "all",
          imageScaling: print.scaling
        }
      });
      pendingJobs.push({ ref: jobRef, name: print.name });
    }

    console.log(`\n📡 Waiting for Raspberry Pis to process 3 physical hardware jobs...`);
    
    let completedCount = 0;
    
    const waitPromise = new Promise((resolve) => {
      const unsubscribes = pendingJobs.map(job => {
        return job.ref.onSnapshot(doc => {
          const data = doc.data();
          if (data.status === "completed" || data.status === "printed" || data.isPrinted === true) {
            console.log(`✅ SUCCESS: ${job.name} physical print confirmed!`);
            completedCount++;
          } else if (data.status === "failed") {
            console.error(`❌ ERROR: ${job.name} failed! Reason: ${data.printerStatus}`);
            completedCount++;
          }
          
          if (completedCount === pendingJobs.length) {
            resolve();
          }
        });
      });
      
      // Safety timeout 60 seconds
      setTimeout(() => {
        if (completedCount < pendingJobs.length) {
            console.error(`⏳ TIMEOUT: Some physical prints did not respond in time.`);
        }
        unsubscribes.forEach(u => u());
        resolve();
      }, 60000);
    });

    await waitPromise;
    console.log("\n==================================================");
    console.log("🎉 AUDIT COMPLETE");
    console.log("==================================================\n");
    process.exit(0);

  } catch (err) {
    console.error("❌ AUDIT FAILED:", err);
    process.exit(1);
  }
}

runAudit();
