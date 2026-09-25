const axios = require("axios");
const { CASHFREE_BASE_URL, WA_ACCESS_TOKEN, WA_VERIFY_TOKEN, cashfreeHeaders } = require("../config/env");
const { _askForCoupon, _finalizePayment, sendWhatsAppButtons, sendWhatsAppMessage, sendWhatsAppOrderCard, waContext } = require("../services/whatsapp.service");
const { admin, db } = require("../config/firebase");
const { getPDFDocument } = require("../services/pdf.service");

// ================= WHATSAPP HOSTED CHECKOUT PAGE =================
// This serves a self-contained payment page for users coming from WhatsApp links.
// It bypasses the React frontend (which requires sessionStorage/login).
const getWaPay = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Fetch the order from Cashfree to get the payment_session_id
    const cfRes = await axios.get(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
      headers: cashfreeHeaders
    });

    const paymentSessionId = cfRes.data.payment_session_id;
    const orderStatus = cfRes.data.order_status;

    if (orderStatus === "PAID") {
      return res.send(`
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Mimo - Already Paid</title>
        <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0fdf4;flex-direction:column;text-align:center;padding:20px;}h2{color:#16a34a;}p{color:#555;}</style>
        </head><body><h2>✅ Payment Already Received!</h2><p>Your print code was sent to you on WhatsApp. Head to the Mimo kiosk to collect your prints!</p></body></html>
      `);
    }

    if (!paymentSessionId) {
      return res.status(400).send(`
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Mimo - Link Expired</title>
        <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fef2f2;flex-direction:column;text-align:center;padding:20px;}h2{color:#dc2626;}p{color:#555;}</style>
        </head><body><h2>❌ Link Expired</h2><p>This payment link is no longer valid. Please send your PDF to the bot again to generate a new link.</p></body></html>
      `);
    }

    const cashfreeMode = process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
    const returnUrl = `https://api-upqxuj7evq-uc.a.run.app/wa-pay-success/${orderId}`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mimo Secure Payment</title>
        <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%); }
          .card { background: white; border-radius: 20px; padding: 40px 30px; text-align: center; box-shadow: 0 20px 60px rgba(9,55,101,0.12); max-width: 380px; width: 90%; }
          .logo { width: 60px; height: 60px; background: #093765; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px; }
          h2 { color: #093765; font-size: 22px; font-weight: 800; margin-bottom: 8px; }
          p { color: #64748b; font-size: 14px; margin-bottom: 28px; line-height: 1.5; }
          .loader { border: 3px solid #e2e8f0; border-top: 3px solid #093765; border-radius: 50%; width: 36px; height: 36px; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .status { font-size: 13px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">🖨️</div>
          <h2>Mimo Secure Checkout</h2>
          <p>Loading your payment page...<br>Please do not close this window.</p>
          <div class="loader"></div>
          <p class="status">Order ID: ${orderId}</p>
        </div>
        <script>
          window.addEventListener('load', function() {
            try {
              const cashfree = Cashfree({ mode: "${cashfreeMode}" });
              cashfree.checkout({
                paymentSessionId: "${paymentSessionId}",
                redirectTarget: "_self"
              });
            } catch(e) {
              document.querySelector('p').textContent = 'Failed to load payment. Please try again.';
              document.querySelector('.loader').style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("[WA PAY ERROR]", err.response?.data || err.message);
    res.status(500).send(`
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Mimo - Error</title>
      <style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fef2f2;flex-direction:column;text-align:center;padding:20px;}h2{color:#dc2626;}p{color:#555;}</style>
      </head><body><h2>Something went wrong</h2><p>Please send your PDF to the bot again to get a fresh payment link.</p></body></html>
    `);
  }
};

// ================= WHATSAPP PAYMENT SUCCESS PAGE =================
const getWaPaySuccess = async (req, res) => {
  const orderId = req.params.orderId;
  // Trigger the payment-success handler internally
  try {
    const waJobs = await db.collection("print_jobs").where("orderId", "==", orderId).get();
    let printCode = null;
    waJobs.forEach(d => { if (d.data().printCode) printCode = d.data().printCode; });

    if (!printCode) {
      // Payment just completed, trigger fulfillment
      const cfStatus = await axios.get(`${CASHFREE_BASE_URL}/links/${orderId}`, { headers: cashfreeHeaders });
      if (cfStatus.data.link_status === "PAID") {
        printCode = Math.floor(1000 + Math.random() * 9000).toString();
        const now = admin.firestore.FieldValue.serverTimestamp();
        const batch = db.batch();
        waJobs.forEach(d => batch.update(d.ref, {
          status: "paid",
          printCode,
          codeCreatedAt: now,
          paymentTime: now,
          retentionStartAt: now
        }));
        await batch.commit();

        // Notify on WhatsApp with native order card
        const waSession = await db.collection("whatsapp_sessions").where("jobId", "==", waJobs.docs[0]?.id).get();
        if (!waSession.empty) {
          const phone = waSession.docs[0].id;
          const jobData = waJobs.docs[0].data();
          const botPhoneNumberId = jobData.botPhoneNumberId || process.env.WA_PHONE_NUMBER_ID || "943206795552432";
          await waContext.run({ phoneNumberId: botPhoneNumberId }, async () => {
            await sendWhatsAppOrderCard(phone, {
              orderId,
              fileName: jobData.fileName || "Document",
              colorMode: jobData.colorMode || "bw",
              copies: jobData.copies || 1,
              totalAmount: jobData.totalCost || 0,
              status: "paid",
              printCode
            });
          });
        }
      }
    }

    res.send(`
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Mimo - Payment Success!</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#f0fdf4,#dcfce7);flex-direction:column;text-align:center;padding:20px;}
      .card{background:white;border-radius:20px;padding:40px 30px;box-shadow:0 20px 60px rgba(0,0,0,0.08);max-width:360px;width:90%;}
      .check{font-size:64px;margin-bottom:16px;}h2{color:#16a34a;font-size:22px;font-weight:800;margin-bottom:8px;}p{color:#64748b;font-size:14px;line-height:1.6;}
      .code{background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:16px;margin:20px 0;font-size:42px;font-weight:900;color:#093765;letter-spacing:8px;}</style>
      </head><body><div class="card"><div class="check">✅</div><h2>Payment Successful!</h2>
      ${printCode ? `<p>Your Print Code is</p><div class="code">${printCode}</div><p>Head to any Mimo kiosk and enter this code to collect your prints!</p>` : `<p>Your print code has been sent to you on WhatsApp!</p>`}
      </div></body></html>
    `);
  } catch (err) {
    console.error("[WA-PAY-SUCCESS ERROR]", err.message);
    res.send("Payment received! Your print code has been sent via WhatsApp.");
  }
};

// ================= WHATSAPP WEBHOOK VERIFICATION (Option B) =================
const getWhatsappWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    console.log("[WHATSAPP] Webhook verified successfully.");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// ================= WHATSAPP BOT MESSAGE HANDLER (Option B) =================
const postWhatsappWebhook = async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return res.sendStatus(200);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const phoneNumberId = value?.metadata?.phone_number_id;
    return waContext.run({ phoneNumberId }, async () => {

      const messages = value?.messages;
      if (!messages || messages.length === 0) return res.sendStatus(200);

      const msg = messages[0];
      const from = msg.from; // e.g. "919876543210"
      const msgType = msg.type;

      const msgId = msg.id;

      // Strict Idempotency Check: Prevent race conditions by forcing an atomic write
      try {
        await db.collection("whatsapp_msg_ids").doc(msgId).create({
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        if (e.code === 6 || e.message.includes("ALREADY_EXISTS")) {
          console.log(`[WHATSAPP] Race condition prevented! Duplicate message ${msgId} ignored.`);
          return res.sendStatus(200);
        }
      }

      // Load or create bot session from Firestore
      const sessionRef = db.collection("whatsapp_sessions").doc(from);
      const sessionDoc = await sessionRef.get();
      const session = sessionDoc.exists ? sessionDoc.data() : { state: "idle" };

      // ── Handle PDF/document upload ──────────────────────────────────────────
      if (msgType === "document" || msgType === "image") {
        const doc = msg.document || msg.image;
        const mimeType = doc.mime_type || "";

        const isPdf = mimeType.includes("pdf");
        const isImage = mimeType.includes("image/jpeg") || mimeType.includes("image/png") || mimeType.includes("image/jpg");

        if (!isPdf && !isImage) {
          await sendWhatsAppMessage(from, "❌ Sorry, we only support standard PDF, JPG, and PNG files. Word documents (.doc/.docx) are NOT supported. Please convert your file to a PDF and upload again.");
          return res.sendStatus(200);
        }

        // Download file from Meta servers and upload to Firebase Storage
        let fileUrl = "";
        let buffer = null;
        try {
          const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${doc.id}`, {
            headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` }
          });
          const downloadUrl = mediaRes.data.url;
          const fileRes = await axios.get(downloadUrl, {
            headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` },
            responseType: "arraybuffer"
          });
          buffer = Buffer.from(fileRes.data);
          const fileName = doc.filename || (isImage ? `whatsapp_${Date.now()}.jpg` : `whatsapp_${Date.now()}.pdf`);
          const bucket = admin.storage().bucket();
          const fileRef = bucket.file(`uploads/wa_${from}/${fileName}`);
          const cType = isImage ? mimeType : "application/pdf";
          await fileRef.save(buffer, { contentType: cType, metadata: { contentType: cType } });
          const { getDownloadURL } = require("firebase-admin/storage");
          fileUrl = await getDownloadURL(fileRef);
          console.log(`[WHATSAPP BOT] File uploaded for ${from}: ${fileName}`);
        } catch (uploadErr) {
          console.error("[WHATSAPP BOT] File upload failed:", uploadErr);
          await sendWhatsAppMessage(from, "❌ Sorry, we couldn't process your file. Please try again.");
          return res.sendStatus(200);
        }

        // Find or create a user account for this WhatsApp number
        let userId;
        const usersSnap = await db.collection("users").where("mobileNumber", "==", from).get();
        if (!usersSnap.empty) {
          userId = usersSnap.docs[0].id;
        } else {
          // Create a lightweight guest account linked to this WhatsApp number
          const guestRef = await db.collection("users").add({
            email: `wa_${from}@mimo.guest`,
            username: `WA User ${from.slice(-4)}`,
            mobileNumber: from,
            isWhatsAppUser: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          userId = guestRef.id;
        }

        const ext = isImage ? (mimeType.includes("png") ? "png" : "jpg") : "pdf";
        const actualFileName = doc.filename || `whatsapp_${Date.now()}.${ext}`;

        const now = admin.firestore.FieldValue.serverTimestamp();
        // Create a print job in Firestore
        const jobRef = await db.collection("print_jobs").add({
          userId,
          fileName: actualFileName,
          documentUrl: fileUrl,
          fileUrl,
          mimetype: isImage ? mimeType : "application/pdf",
          fileSize: doc.file_size || 0,
          fileType: isImage ? "image" : "pdf",
          isImage: isImage,
          createdAt: now,
          updatedAt: now,
          retentionStartAt: now,
          status: "pending",
          source: "whatsapp"
        });

        // Count PDF Pages
        let pageCount = 1;
        if (isPdf) {
          try {
            const PDFDocument = getPDFDocument();
            const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
            pageCount = pdfDoc.getPageCount();
          } catch (err) {
            console.error("Failed to parse PDF pages with pdf-lib:", err);
            await sendWhatsAppMessage(from, "❌ Sorry, I couldn't read the pages in this PDF. It might be corrupted, password-protected, or in an unsupported format. Please save it as a standard PDF and try again.");
            return res.sendStatus(200);
          }
        } else if (isImage) {
          pageCount = 1;
        }

        // Save session state
        await sessionRef.set({
          state: "awaiting_destination",
          jobId: jobRef.id,
          userId,
          fileName: actualFileName,
          colorMode: "bw",
          copies: 1,
          pageCount
        });

        await sendWhatsAppButtons(from,
          `📄 *${doc.filename || (isImage ? "Image" : "Document")}* uploaded successfully! (${pageCount} pages)\n\nPlease select Print Destination:`,
          [
            { id: "dest_cv", title: "📍 MIMO 1.0" },
            { id: "dest_sv", title: "📍 MIMO 2.0" }
          ]
        );
        return res.sendStatus(200);
      }

      // ── Handle interactive button replies ───────────────────────────────────────
      if (msgType === "interactive" && msg.interactive.type === "button_reply") {
        const buttonId = msg.interactive.button_reply.id;

        if (session.state === "awaiting_destination") {
          if (buttonId === "dest_cv") {
            // MIMO V1 (CV-001) is B&W only, skip color selection
            await sessionRef.update({ state: "awaiting_copies", destination: "CV-001", kioskId: "CV-001", colorMode: "bw" });
            await sendWhatsAppButtons(from, "How many copies?", [
              { id: "copies_1", title: "1 Copy" },
              { id: "copies_2", title: "2 Copies" },
              { id: "copies_3", title: "3 Copies" }
            ], "Select copies or type a number");
          } else if (buttonId === "dest_sv") {
            // MIMO V2 (SV-002 / pi@pi) has both options
            await sessionRef.update({ state: "awaiting_color", destination: "SV-002", kioskId: "SV-002" });
            await sendWhatsAppButtons(from, "Please select Print Type:", [
              { id: "color_bw", title: "⚫ B&W (₹2.80/pg)" },
              { id: "color_color", title: "🎨 Color (₹10.00/pg)" }
            ]);
          }
          return res.sendStatus(200);
        }

        if (session.state === "awaiting_color") {
          const colorMode = buttonId === "color_color" ? "color" : "bw";
          await sessionRef.update({ state: "awaiting_copies", colorMode });
          await sendWhatsAppButtons(from, "How many copies?", [
            { id: "copies_1", title: "1 Copy" },
            { id: "copies_2", title: "2 Copies" },
            { id: "copies_3", title: "3 Copies" }
          ], "Select copies or type a number");
          return res.sendStatus(200);
        }

        if (session.state === "awaiting_copies" && buttonId.startsWith("copies_")) {
          const copies = parseInt(buttonId.replace("copies_", ""));
          await _askForCoupon(from, session, sessionRef, copies);
          return res.sendStatus(200);
        }

        if (session.state === "awaiting_coupon" && buttonId === "skip_coupon") {
          await _finalizePayment(from, session, sessionRef, null);
          return res.sendStatus(200);
        }

        if (buttonId === "need_more_prints") {
          await sessionRef.set({ state: "idle" });
          await sendWhatsAppMessage(from,
            `📄 *Ready for your next print!*\n\nPlease send me a *PDF file* or *Photo (JPG/PNG)* to print.`
          );
          return res.sendStatus(200);
        }
        return res.sendStatus(200);
      }

      // ── Handle text replies ───────────────────────────────────────────────────
      if (msgType === "text") {
        const textBody = msg.text.body.trim();

        if (session.state === "awaiting_copies") {
          const copies = parseInt(textBody);
          if (!isNaN(copies) && copies > 0 && copies <= 100) {
            await _askForCoupon(from, session, sessionRef, copies);
          } else {
            await sendWhatsAppMessage(from, "Please enter a valid number of copies (1-100).");
          }
          return res.sendStatus(200);
        }

        if (session.state === "awaiting_coupon") {
          await _finalizePayment(from, session, sessionRef, textBody.trim().toUpperCase());
          return res.sendStatus(200);
        }

        // Default: Welcome message
        await sendWhatsAppMessage(from,
          `👋 *Welcome to Mimo Printing!*\n\nSend me a *PDF file* and I'll guide you through printing it at any Mimo kiosk.\n\n📄 Upload PDF → ⚙️ Select Settings → 💳 Pay → 🖨️ Collect!`
        );
        return res.sendStatus(200);
      }

      // Unsupported message type
      await sendWhatsAppMessage(from, "Please send a *PDF, JPG, or PNG document* to get started! 📄");
      return res.sendStatus(200);

    }); // END waContext.run
  } catch (err) {
    console.error("[WHATSAPP BOT ERROR]", err);
    return res.sendStatus(200); // 200 to prevent infinite Meta retries on fatal errors
  }
};

module.exports = {
  getWaPay,
  getWaPaySuccess,
  getWhatsappWebhook,
  postWhatsappWebhook,
};
