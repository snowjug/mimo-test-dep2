const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkRecentJobs() {
  const snapshot = await db.collection("print_jobs")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  if (snapshot.empty) {
    console.log("No recent jobs found.");
    return;
  }

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.fileName.includes("mimo_graph") || data.fileName.includes("blank_a4")) return;

    console.log(`\n--- Job ID: ${doc.id} ---`);
    console.log(`Status: ${data.status}`);
    console.log(`Printer Status: ${data.printerStatus}`);
    console.log(`File Name: ${data.fileName}`);
    console.log(`MimeType: ${data.mimetype}`);
    console.log(`File URL: ${data.fileUrl}`);
    console.log(`Print Options:`, JSON.stringify(data.printOptions));
  });
}

checkRecentJobs().catch(console.error).finally(() => process.exit(0));
