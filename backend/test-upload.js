const axios = require("axios");
const crypto = require("crypto");

const API_URL = "http://localhost:3000";

async function runTest() {
  console.log("🚀 Starting Load Test...");

  // 1. Register a test user to get a token
  const email = `test_${Date.now()}@mimo.com`;
  console.log(`👤 Registering test user: ${email}`);
  let token;
  try {
    const regRes = await axios.post(`${API_URL}/register`, {
      username: "Load Tester",
      password: "password123",
      email: email,
      mobileNumber: "1234567890"
    });
    token = regRes.data.jwtToken;
    console.log("✅ User registered. Token acquired.");
  } catch (e) {
    console.error("❌ Registration failed:", e.response?.data || e.message);
    return;
  }

  // 2. Generate 10 simulated large files (5MB each) -> Total 50MB
  const NUM_FILES = 10;
  const FILE_SIZE = 5 * 1024 * 1024; // 5MB
  console.log(`\n📦 Generating ${NUM_FILES} files of 5MB each (Total 50MB)...`);
  const filesMeta = [];
  const buffers = [];
  for (let i = 0; i < NUM_FILES; i++) {
    const buffer = crypto.randomBytes(FILE_SIZE);
    buffers.push(buffer);
    filesMeta.push({
      name: `load_test_${i}.pdf`,
      type: "application/pdf",
      size: FILE_SIZE
    });
  }

  // 3. Request Signed URLs
  console.log(`\n🔗 Requesting Signed URLs...`);
  const startUrlTime = Date.now();
  let urls;
  try {
    const urlRes = await axios.post(`${API_URL}/generate-upload-urls`, { files: filesMeta }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    urls = urlRes.data.urls;
    console.log(`✅ Received ${urls.length} Signed URLs in ${Date.now() - startUrlTime}ms`);
  } catch (e) {
    console.error("❌ /generate-upload-urls failed:", e.response?.data || e.message);
    return;
  }

  // 4. Upload directly to GCS in parallel
  console.log(`\n☁️ Uploading 50MB directly to Google Cloud Storage...`);
  const startUploadTime = Date.now();
  try {
    const uploadPromises = urls.map((urlData, i) => {
      return axios.put(urlData.signedUrl, buffers[i], {
        headers: { "Content-Type": urlData.type }
      });
    });
    await Promise.all(uploadPromises);
    const uploadTime = Date.now() - startUploadTime;
    const speedMbps = ((50 * 8) / (uploadTime / 1000)).toFixed(2);
    console.log(`✅ Uploaded 50MB in ${uploadTime}ms! (Speed: ~${speedMbps} Mbps)`);
  } catch (e) {
    console.error("❌ GCS Upload failed:", e.message);
    return;
  }

  // 5. Finalize Upload
  console.log(`\n✅ Finalizing upload with backend...`);
  const startFinalizeTime = Date.now();
  try {
    await axios.post(`${API_URL}/finalize-upload`, { files: urls }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✅ Finalize completed in ${Date.now() - startFinalizeTime}ms`);
  } catch (e) {
    console.error("❌ /finalize-upload failed:", e.response?.data || e.message);
    return;
  }

  console.log(`\n🎉 Load test completed successfully!`);
}

runTest();
