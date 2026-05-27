const axios = require('axios');

async function runTest() {
  const API_URL = "http://localhost:9000";
  
  // 1. Login to get token
  console.log("Logging in...");
  const loginRes = await axios.post(`${API_URL}/mimo/login`, {
    email: "smoke_1779866648351@mimo.com",
    password: "password123"
  });
  const token = loginRes.data.token;
  console.log("Token acquired.");

  // 2. Simulate Payment Success for Blank Sheet
  console.log("Simulating blank sheet payment success...");
  try {
    const paymentRes = await axios.post(`${API_URL}/payment-success`, {
      printOptions: {
        isBlankSheet: true,
        sheetType: "a4",
        totalPages: 5,
        totalCost: 11.5
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log("Backend response:", paymentRes.data);
  } catch (err) {
    console.error("Backend Error:", err.response ? err.response.data : err.message);
  }
}

runTest();
