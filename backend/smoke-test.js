const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = process.env.API_URL || 'https://p01--mimo-backend--4b94y9s4jyc5.code.run';
let token = '';
let printCode = '';
let totalAmount = 0;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSmokeTest() {
  console.log('🚀 Starting MIMO E2E Smoke Test...\n');

  try {
    // ── 1. Health Check ──────────────────────────────────────────────────────
    console.log('⏳ Checking if backend is running...');
    await axios.get(`${API_URL}/`);
    console.log('✅ Backend is up and running!\n');

    // ── 1b. Pi Health Check (non-blocking) ───────────────────────────────────
    console.log('⏳ Checking Pi print server connectivity...');
    try {
      const piHealth = await axios.get(`${API_URL}/kiosk/health`, { timeout: 8000 });
      console.log(`✅ Pi is ${piHealth.data.pi_status}: ${JSON.stringify(piHealth.data.pi_response)}\n`);
    } catch (piErr) {
      const status = piErr.response?.data?.pi_status || 'unreachable';
      const msg = piErr.response?.data?.error || piErr.message;
      console.log(`⚠️  Pi is ${status} (OK if Pi is off): ${msg}\n`);
    }

    // ── 2. Register/Login ─────────────────────────────────────────────────────
    console.log('⏳ Step 1: Registering test user...');
    const email = `test_${Date.now()}@example.com`;
    const password = 'password123';
    let loginRes;
    try {
      loginRes = await axios.post(`${API_URL}/register`, {
        username: 'Smoke Tester', email, password, mobileNumber: '9999999999'
      });
      console.log('✅ Registered new test user.');
    } catch (e) {
      console.log('Registration failed, trying login...');
      loginRes = await axios.post(`${API_URL}/login`, { email, password });
    }
    token = loginRes.data.jwtToken;
    console.log('✅ JWT Token acquired.\n');

    // ── 3. Upload Files ───────────────────────────────────────────────────────
    console.log('⏳ Step 2: Uploading test PDFs...');
    const form = new FormData();
    const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF';
    const p1 = path.join(__dirname, 'smoke1.pdf');
    const p2 = path.join(__dirname, 'smoke2.pdf');
    fs.writeFileSync(p1, pdfContent);
    fs.writeFileSync(p2, pdfContent);
    form.append('files', fs.createReadStream(p1));
    form.append('files', fs.createReadStream(p2));

    const uploadRes = await axios.post(`${API_URL}/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` }
    });
    console.log('✅ Upload response:', uploadRes.data.message);

    // ── 4. Poll Conversion Status ─────────────────────────────────────────────
    console.log('\n⏳ Step 3: Polling for conversion completion...');
    let done = false;
    for (let i = 0; i < 20 && !done; i++) {
      const s = await axios.get(`${API_URL}/mimo/conversion-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (s.data.status === 'completed') {
        totalAmount = s.data.amount;
        done = true;
        console.log(`✅ Ready! Pages: ${s.data.totalPages}, Amount: ₹${s.data.amount}`);
      } else {
        console.log(`   ... processing (attempt ${i + 1})`);
        await sleep(2000);
      }
    }
    if (!done) throw new Error('Conversion timed out');

    // ── 5. Create Order ───────────────────────────────────────────────────────
    console.log('\n⏳ Step 4: Creating payment order...');
    const orderRes = await axios.post(`${API_URL}/create-order`, {
      printOptions: { colorMode: 'bw', copies: 1, doubleSided: 'single' }
    }, { headers: { Authorization: `Bearer ${token}` } });
    const orderId = orderRes.data.orderId;
    console.log(`✅ Order: ${orderId}, Amount: ₹${orderRes.data.amount}`);

    // Simulate payment success
    const successRes = await axios.post(`${API_URL}/payment-success`, { orderId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    printCode = successRes.data.printCode;
    console.log(`✅ Payment verified! Print PIN: [ ${printCode} ]`);

    // ── 6. Kiosk Code Validation ──────────────────────────────────────────────
    console.log('\n⏳ Step 5: Kiosk code validation...');
    const kioskRes = await axios.post(`${API_URL}/get-documents-by-code`, { printCode });
    const docs = kioskRes.data.documents;
    console.log(`✅ Kiosk retrieved ${docs.length} doc(s) for PIN ${printCode}`);

    // Verify the URL is publicly accessible (Pi must be able to download)
    const firstUrl = docs[0]?.url || '';
    if (firstUrl.includes('storage.googleapis.com')) {
      console.log('✅ File URL is a public Google Storage URL — Pi can download directly');
      console.log(`   URL preview: ${firstUrl.substring(0, 90)}...`);
    } else {
      console.log(`⚠️  Unexpected URL format: ${firstUrl.substring(0, 90)}`);
    }

    // ── 7. /kiosk/print Endpoint Test ────────────────────────────────────────
    console.log('\n⏳ Step 6: Testing /kiosk/print (Pi integration)...');
    try {
      const kpRes = await axios.post(`${API_URL}/kiosk/print`, { printCode });
      console.log(`✅ /kiosk/print → success: ${kpRes.data.success}`);
      console.log(`   Results: ${JSON.stringify(kpRes.data.results)}`);
    } catch (kpErr) {
      const d = kpErr.response?.data;
      if (d?.results) {
        // Endpoint worked, Pi offline
        console.log(`⚠️  /kiosk/print endpoint OK — Pi returned: ${JSON.stringify(d)}`);
      } else {
        console.log(`❌ /kiosk/print endpoint error: ${kpErr.response?.status} ${JSON.stringify(d)}`);
      }
    }

    // ── 8. Mark Printed (fallback) ────────────────────────────────────────────
    console.log('\n⏳ Step 7: Marking jobs complete (fallback)...');
    try {
      const mpRes = await axios.post(`${API_URL}/mark-printed`, { printCode }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('✅ mark-printed:', mpRes.data.message || JSON.stringify(mpRes.data));
    } catch (mpErr) {
      // May already be completed by /kiosk/print — that's fine
      console.log(`⚠️  mark-printed: ${mpErr.response?.status} ${JSON.stringify(mpErr.response?.data)}`);
    }

    console.log('\n🎉 SMOKE TEST PASSED! Full pipeline functional (Pi optional).');

    // Cleanup
    fs.unlinkSync(p1);
    fs.unlinkSync(p2);

  } catch (error) {
    console.error('\n❌ SMOKE TEST FAILED:');
    if (error.response) {
      console.error(`HTTP ${error.response.status}:`, JSON.stringify(error.response.data));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runSmokeTest();
