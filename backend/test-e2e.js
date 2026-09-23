const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const API_URL = 'http://localhost:3000';

async function runE2E() {
  console.log('--- STARTING E2E TEST ---\n');
  try {
    // 1. Register/Login
    console.log('[1] Registering / Logging in...');
    await axios.post(`${API_URL}/register`, {
      username: 'E2E User',
      email: 'e2e2@test.com',
      password: 'password123',
      mobileNumber: '9999999999'
    }).catch(() => {});

    const loginRes = await axios.post(`${API_URL}/login`, {
      email: 'e2e2@test.com',
      password: 'password123'
    });
    const token = loginRes.data.jwtToken;
    console.log(`? Logged in successfully. Token: ${token.substring(0, 15)}...`);

    // 2. Upload Document
    console.log('\n[2] Uploading a document...');
    const pdfBase64 = 'JVBERi0xLjQKMSAwIG9iaiA8PC9UeXBlL0NhdGFsb2cgL1BhZ2VzIDIgMCBSPj4gZW5kb2JqIDIgMCBvYmogPDwvVHlwZS9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxPj4gZW5kb2JqIDMgMCBvYmogPDwvVHlwZS9QYWdlIC9QYXJlbnQgMiAwIFIgL1Jlc291cmNlcyA8PC9Gb250IDw8L0YxIDQgMCBSPj4gPj4gL01lZGlhQm94IFswIDAgNjEyIDc5Ml0gL0NvbnRlbnRzIDUgMCBSPj4gZW5kb2JqIDQgMCBvYmogPDwvVHlwZS9Gb250IC9TdWJ0eXBlL1R5cGUxIC9CYXNlRm9udC9IZWx2ZXRpY2E+PiBlbmRvYmogNSAwIG9iaiA8PC9MZW5ndGggMjE+PiBzdHJlYW0KQlQgL0YxIDI0IFRmIDEwMCA3MDAgVGQgKEhlbGxvIEUyRSEpIFRqIEVUCmVuZHN0cmVhbSBlbmRvYmogeHJlZiAwIDYgMDAwMDAwMDAwMCA2NTUzNSBmIDAwMDAwMDAwMDkgMDAwMDAgbiAwMDAwMDAwMDUyIDAwMDAwIG4gMDAwMDAwMDExNCAwMDAwMCBuIDAwMDAwMDAyNDkgMDAwMDAgbiAwMDAwMDAwMzE4IDAwMDAwIG4gdHJhaWxlciA8PC9TaXplIDYgL1Jvb3QgMSAwIFI+PiBzdGFydHhyZWYgMzg5ICUlRU9G';
    fs.writeFileSync('dummy.pdf', Buffer.from(pdfBase64, 'base64'));
    const formData = new FormData();
    formData.append('files', fs.createReadStream('dummy.pdf'));
    await axios.post(`${API_URL}/upload`, formData, {
      headers: { ...formData.getHeaders(), Authorization: `Bearer ${token}` }
    });
    console.log(`? Uploaded document!`);

    // 3. Create Order
    console.log('\n[3] Creating Order...');
    const orderRes = await axios.post(`${API_URL}/create-order`, {
      printOptions: { colorMode: 'bw', copies: 1, layout: 'single' }
    }, { headers: { Authorization: `Bearer ${token}` }});
    const orderId = orderRes.data.orderId;
    console.log(`? Order Created! Order ID: ${orderId}`);

    // 4. Hit Payment Success
    console.log('\n[4] Hitting /payment-success...');
    const paymentSuccessRes = await axios.post(`${API_URL}/payment-success`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const printCode = paymentSuccessRes.data.printCode;
    console.log(`? Payment success processed! Print Code: ${printCode}`);

    // 5. Kiosk gets document
    console.log('\n[5] Kiosk fetching documents by print code...');
    const kioskDocRes = await axios.post(`${API_URL}/get-documents-by-code`, {
      printCode: printCode
    });
    const jobs = kioskDocRes.data.documents;
    console.log(`? Kiosk found ${jobs.length} jobs.`);
    if (jobs.length > 0) {
      console.log(`Job ID: ${jobs[0].id}, File URL: ${jobs[0].url}`);
    }

    // 6. Kiosk marks as printed
    console.log('\n[6] Kiosk marking job as printed...');
    const printedRes = await axios.post(`${API_URL}/mark-printed`, { printCode });
    console.log(`? Job marked as printed! Response: ${printedRes.data.message || 'OK'}`);

    console.log('\n?? E2E TEST COMPLETED SUCCESSFULLY! ??');

  } catch (error) {
    console.error('\n? E2E TEST FAILED!');
    console.error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}
runE2E();
