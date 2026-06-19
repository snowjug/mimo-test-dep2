const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");
const { exec } = require("child_process");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const startTime = Date.now();

console.log("📡 Listening for print jobs triggered by user (OTP entry)...");

db.collection("print_jobs")
  .where("createdAt", ">", new Date(startTime - 2 * 60 * 1000)) // created in the last 2 minutes or future
  .onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      const data = change.doc.data();
      const docId = change.doc.id;
      const type = change.type;
      
      const createdStr = data.createdAt ? data.createdAt.toDate().toLocaleTimeString() : "Pending Server Time";
      console.log(`\n🔔 [${type.toUpperCase()}] Job ${docId} | Code: ${data.printCode || "N/A"} | File: ${data.fileName} | Status: ${data.status} | Kiosk: ${data.kioskId} | Copies: ${data.copies || data.printOptions?.copies || 1} | Time: ${createdStr}`);
      
      if (data.status === "printing" || data.status === "completed" || data.status === "failed") {
        const targetHost = data.kioskId === "SV-002" ? "pi" : "printpi";
        console.log(`⏳ Fetching logs from ${targetHost} for job ${docId} (Status: ${data.status})...`);
        
        exec(`C:\\Users\\HP\\AppData\\Local\\Programs\\Python\\Python313\\python.exe C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\ec234d09-551a-42d9-97f9-9bf9139100f1\\scratch\\monitor_both_pis.py`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error checking logs: ${error.message}`);
            return;
          }
          // Print only the section of the target host to save space
          const separator = "==========================================";
          const sections = stdout.split(separator);
          for (const sec of sections) {
            if (sec.includes(`LOGS FOR ${targetHost}`)) {
              console.log(separator + sec);
            }
          }
        });
      }
    });
  }, error => {
    console.error("Firestore Listen Error:", error);
  });
