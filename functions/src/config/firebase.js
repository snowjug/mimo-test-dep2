// Initialize Firebase Admin (must be done before using it)
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

if (!admin.apps.length) {
  let credential = null;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID || "mimo-v2-11868";

  if (rawKey && clientEmail) {
    credential = admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, "\n"),
    });
  } else {
    const keyPaths = [
      path.resolve(__dirname, "../../../serviceAccountKey.json"),
      path.resolve(__dirname, "../../serviceAccountKey.json"),
      path.resolve(process.cwd(), "serviceAccountKey.json"),
    ];
    for (const kp of keyPaths) {
      if (fs.existsSync(kp)) {
        try {
          const sa = require(kp);
          credential = admin.credential.cert(sa);
          break;
        } catch (_) {}
      }
    }
  }

  const initConfig = {
    storageBucket: process.env.STORAGE_BUCKET || "mimo-v2-11868.firebasestorage.app",
  };
  if (credential) {
    initConfig.credential = credential;
  }

  admin.initializeApp(initConfig);
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = {
  admin,
  db,
};


