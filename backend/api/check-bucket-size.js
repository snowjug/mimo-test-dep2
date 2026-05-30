const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "mimo-v2-11868.firebasestorage.app"
  });
}

async function checkSize() {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles();
  let totalBytes = 0;
  files.forEach(f => {
    totalBytes += Number(f.metadata.size || 0);
  });
  console.log(`Total Files: ${files.length}`);
  console.log(`Total Size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  process.exit(0);
}

checkSize().catch(console.error);
