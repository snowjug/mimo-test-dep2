const admin = require("firebase-admin");
require("dotenv").config();

// Support both local (serviceAccountKey.json) and cloud (env vars) deployments
let credential;

if (process.env.FIREBASE_PRIVATE_KEY) {
  // Cloud deployment: build credential from environment variables
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    universe_domain: "googleapis.com",
  };
  credential = admin.credential.cert(serviceAccount);
} else {
  // Local development: load from file if it exists, otherwise log error
  try {
    const serviceAccount = require("./serviceAccountKey.json");
    credential = admin.credential.cert(serviceAccount);
  } catch (err) {
    console.error("❌ CRITICAL: No Firebase credentials found (Env vars or JSON file)");
    // Don't crash immediately, allow server to start but log the error
  }
}

if (credential) {
  admin.initializeApp({
    credential,
    storageBucket: "mimo-v2-11868.firebasestorage.app",
  });
} else {
  console.error("❌ Firebase NOT initialized - check your environment variables!");
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { admin, db, bucket };