const { admin, db, bucket } = require("./api/firebase");
const fs = require("fs");

async function checkJobs() {
  const ids = ["dYZQIGvpAyMxdkxRuGtM", "Ssf6IRcnRY0BAIx7Hc6M", "RnNSHUGeAR8zhcHuRO07", "Vtr8NbTjHTwAdHVVufDf"];
  
  for (const id of ids) {
    const doc = await db.collection("print_jobs").doc(id).get();
    if (!doc.exists) {
      console.log(`Job ${id} does not exist.`);
      continue;
    }
    
    const data = doc.data();
    console.log(`\n================================`);
    console.log(`Job ID: ${id}`);
    console.log(`File Name: ${data.fileName}`);
    console.log(`Status: ${data.status}`);
    console.log(`isPrinted: ${data.isPrinted}`);
    console.log(`File URL: ${data.fileUrl}`);
    console.log(`Files Array:`, JSON.stringify(data.files, null, 2));
    
    // Download the file to check it using Admin SDK
    const url = data.fileUrl || (data.files && data.files[0] && data.files[0].url);
    if (url) {
      try {
        const localPath = `./downloaded_${id}.pdf`;
        // Parse the storage path from url
        let storagePath;
        if (url.includes("/o/")) {
          const part = url.split("/o/")[1].split("?")[0];
          storagePath = decodeURIComponent(part);
        } else if (url.includes("storage.googleapis.com/")) {
          // templates/blank_a4.pdf
          const part = url.split("mimo-v2-11868.firebasestorage.app/")[1];
          storagePath = decodeURIComponent(part);
        }
        
        if (storagePath) {
          console.log(`Checking path in bucket: ${storagePath}`);
          const fileRef = bucket.file(storagePath);
          const [exists] = await fileRef.exists();
          if (exists) {
            console.log(`File exists in bucket! Downloading to ${localPath}...`);
            await fileRef.download({ destination: localPath });
            const stats = fs.statSync(localPath);
            console.log(`Downloaded successfully. Size: ${stats.size} bytes`);
          } else {
            console.log(`File does NOT exist in bucket at path: ${storagePath}`);
          }
        } else {
          console.log(`Could not parse storage path from URL: ${url}`);
        }
      } catch (err) {
        console.error(`Error checking/downloading file for ${id}:`, err.message);
      }
    }
  }
}

checkJobs().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
