const { admin, db, bucket } = require("./api/firebase");

async function listFiles() {
  console.log("Listing files in bucket:", bucket.name);
  const [files] = await bucket.getFiles({ prefix: 'uploads/' });
  console.log(`Found ${files.length} files under uploads/`);
  files.forEach(file => {
    console.log(`- ${file.name} (Size: ${file.metadata.size} bytes)`);
  });
}

listFiles().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
