const admin = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "mimo-v2-11868.firebasestorage.app"
  });
}

async function checkBucket() {
  const bucket = admin.storage().bucket();
  const [metadata] = await bucket.getMetadata();
  console.log("Bucket Location:", metadata.location);
  console.log("Bucket Location Type:", metadata.locationType);
  process.exit(0);
}

checkBucket().catch(console.error);
