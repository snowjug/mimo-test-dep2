// Initialize Firebase Admin (must be done before using it)
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

module.exports = {
  admin,
  db,
};
