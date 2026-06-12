const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "mimo-v2-11868.firebasestorage.app"
});

const bucket = admin.storage().bucket();

async function uploadFiles() {
  try {
    console.log("Uploading MIMO Graph.pdf...");
    await bucket.upload(path.join(__dirname, "..", "mimo-website", "MIMO Graph.pdf"), {
      destination: "templates/mimo_graph.pdf",
      metadata: { contentType: "application/pdf", cacheControl: "public, max-age=0" }
    });
    console.log("MIMO Graph uploaded successfully.");

    console.log("Uploading A4 Sheet.pdf...");
    await bucket.upload(path.join(__dirname, "..", "mimo-website", "A4 Sheet.pdf"), {
      destination: "templates/blank_a4.pdf",
      metadata: { contentType: "application/pdf", cacheControl: "public, max-age=0" }
    });
    console.log("A4 Sheet uploaded successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Upload failed:", error);
    process.exit(1);
  }
}

uploadFiles();
