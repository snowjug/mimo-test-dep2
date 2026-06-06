require('dotenv').config();
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});
admin.firestore().collection('system').doc('metrics').get().then(doc => {
  console.log(JSON.stringify(doc.data(), null, 2));
  process.exit(0);
}).catch(console.error);
