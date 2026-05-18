const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = 'http://localhost:3000';
let token = '';
let printCode = '';
let totalAmount = 0;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSmokeTest() {
  console.log('🚀 Starting MIMO E2E Smoke Test...\n');

  try {
    // 1. Health Check
    console.log('⏳ Checking if server is running...');
    await axios.get(`${API_URL}/`);
    console.log('✅ Server is up and running!\n');

    // 2. Register/Login (User A)
    console.log('⏳ Step 1: Logging in as Test User...');
    const email = `test_${Date.now()}@example.com`;
    const password = 'password123';
    
    let loginRes;
    try {
      loginRes = await axios.post(`${API_URL}/register`, {
        username: 'Smoke Tester',
        email,
        password,
        mobileNumber: '9999999999'
      });
      console.log('✅ Registered new test user.');
    } catch(e) {
      console.log('Registration failed (might exist), trying login...');
      loginRes = await axios.post(`${API_URL}/login`, { email, password });
    }
    token = loginRes.data.jwtToken;
    console.log('✅ Successfully acquired JWT Token.\n');

    // 3. Upload multiple files
    console.log('⏳ Step 2: Uploading multiple documents...');
    const form = new FormData();
    
    // Create two dummy PDFs
    const dummyPath1 = path.join(__dirname, 'smoke1.pdf');
    const dummyPath2 = path.join(__dirname, 'smoke2.pdf');
    fs.writeFileSync(dummyPath1, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF');
    fs.writeFileSync(dummyPath2, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF');
    
    form.append('files', fs.createReadStream(dummyPath1));
    form.append('files', fs.createReadStream(dummyPath2));

    const uploadRes = await axios.post(`${API_URL}/upload`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      }
    });
    console.log('✅ Upload API responded:', uploadRes.data.message);

    // 4. Poll for conversion status
    console.log('\n⏳ Step 3: Polling for Background Conversion...');
    let isCompleted = false;
    let attempts = 0;
    while (!isCompleted && attempts < 15) {
      const statusRes = await axios.get(`${API_URL}/mimo/conversion-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (statusRes.data.status === 'completed') {
        isCompleted = true;
        totalAmount = statusRes.data.amount;
        console.log(`✅ Conversion completed! Total Pages: ${statusRes.data.totalPages}, Amount: ₹${statusRes.data.amount}`);
      } else {
        console.log(`   ... still processing (attempt ${attempts + 1})`);
        await sleep(3000);
      }
      attempts++;
    }
    
    if (!isCompleted) {
      throw new Error("Conversion timed out! Background processor might not be running.");
    }

    // 5. Payment Creation & Success
    console.log('\n⏳ Step 4: Initiating Payment...');
    const orderRes = await axios.post(`${API_URL}/create-order`, { amount: totalAmount }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const orderId = orderRes.data.orderId;
    console.log(`✅ Order created successfully: ${orderId}`);

    // Mocking Payment Success (since we can't do browser redirect here)
    const successRes = await axios.post(`${API_URL}/payment-success`, { orderId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    printCode = successRes.data.printCode;
    console.log(`✅ Payment verified successfully! Print PIN Code generated: [ ${printCode} ]`);

    // 6. Kiosk Validation
    console.log('\n⏳ Step 5: Kiosk Verification...');
    const kioskRes = await axios.post(`${API_URL}/get-documents-by-code`, { printCode });
    const docs = kioskRes.data.documents;
    console.log(`✅ Kiosk successfully retrieved ${docs.length} documents using PIN ${printCode}.`);
    
    // 7. Kiosk Print Mark
    console.log('\n⏳ Step 6: Kiosk triggering Print...');
    const printRes = await axios.post(`${API_URL}/mark-printed`, { printCode }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Print job marked as COMPLETE:', printRes.data.message);

    console.log('\n🎉 SMOKE TEST PASSED! The entire Mimo architecture is fully functional end-to-end.');

    // Cleanup
    fs.unlinkSync(dummyPath1);
    fs.unlinkSync(dummyPath2);
    
  } catch (error) {
    console.error('\n❌ SMOKE TEST FAILED:');
    if (error.response) {
      console.error(error.response.status, error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

runSmokeTest();
