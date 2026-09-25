const { AsyncLocalStorage } = require("async_hooks");
const axios = require("axios");
const { CASHFREE_BASE_URL, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, cashfreeHeaders } = require("../config/env");
const { admin, db } = require("../config/firebase");

const waContext = new AsyncLocalStorage();

function getWaApiUrl() {
  const store = waContext.getStore();
  const id = store?.phoneNumberId || WA_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/v19.0/${id}/messages`;
}

/**
 * Send a WhatsApp text message via Meta Cloud API.
 * @param {string} to - Phone number in international format e.g. "919876543210"
 * @param {string} message - Text to send
 */
async function sendWhatsAppMessage(to, message) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    await axios.post(getWaApiUrl(), {
      messaging_product: "whatsapp",
      to: normalized,
      type: "text",
      text: { body: message }
    }, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`[WHATSAPP] Message sent to ${normalized}`);
  } catch (err) {
    console.error(`[WHATSAPP ERROR] Failed to send to ${to}:`, err.response?.data || err.message);
  }
}

/**
 * Send a WhatsApp interactive button message.
 * @param {string} to - Phone number
 * @param {string} bodyText - The main message body
 * @param {Array} buttons - Array of {id, title} objects (max 3)
 * @param {string} [headerText] - Optional header text
 */
async function sendWhatsAppButtons(to, bodyText, buttons, headerText = null) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    const payload = {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title.substring(0, 20) }
          }))
        }
      }
    };
    if (headerText) payload.interactive.header = { type: "text", text: headerText };
    await axios.post(getWaApiUrl(), payload, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`[WHATSAPP] Button message sent to ${normalized}`);
  } catch (err) {
    console.error(`[WHATSAPP ERROR] Failed to send buttons to ${to}:`, err.response?.data || err.message);
  }
}

/**
 * Send a WhatsApp CTA URL button (opens link in browser).
 * @param {string} to - Phone number
 * @param {string} bodyText - The main message body
 * @param {string} buttonText - The button label
 * @param {string} url - The URL to open
 */
async function sendWhatsAppCTAButton(to, bodyText, buttonText, url) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    await axios.post(getWaApiUrl(), {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText },
        action: {
          name: "cta_url",
          parameters: {
            display_text: buttonText.substring(0, 20),
            url: url
          }
        }
      }
    }, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`[WHATSAPP] CTA button sent to ${normalized}`);
  } catch (err) {
    // Fallback to plain text if CTA button fails (sandbox limitation)
    console.error(`[WHATSAPP] CTA button failed, falling back to text:`, err.response?.data?.error?.message);
    await sendWhatsAppMessage(to, `${bodyText}\n\n👉 ${buttonText}:\n${url}`);
  }
}

// ── Helper: send native WhatsApp order receipt card (like Namma Metro) ─────────
async function sendWhatsAppOrderCard(to, { orderId, fileName, colorMode, copies, totalAmount, status, printCode }) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    const isPaid = status === "paid";
    const itemName = colorMode === "color" ? "🎨 Color Print" : "⚫ B&W Print";
    const amountValue = Math.round(totalAmount * 100); // in paise

    // Native WhatsApp order_status interactive card
    const payload = {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "order_status",
        body: {
          text: isPaid
            ? `✅ *Payment Confirmed!*\n\nYour Print Code is:\n\n*${printCode}*\n\nHead to any Mimo kiosk, enter this code to collect your prints! 🖨️`
            : `🧾 *Order Ready for Payment*\n\nPlease tap *Pay Now* below to complete your print order.`
        },
        action: {
          name: "review_order",
          parameters: {
            reference_id: orderId,
            type: "digital-goods",
            payment_status: isPaid ? "paid" : "pending",
            order: {
              status: isPaid ? "completed" : "pending",
              items: [
                {
                  retailer_id: `mimo-${colorMode}-print`,
                  name: itemName,
                  amount: { value: amountValue, offset: 100 },
                  quantity: copies
                }
              ],
              subtotals: []
            }
          }
        }
      }
    };

    await axios.post(getWaApiUrl(), payload, {
      headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}`, "Content-Type": "application/json" }
    });
    console.log(`[WHATSAPP] Order card sent to ${normalized} (${status})`);
  } catch (err) {
    // Fallback to text if order card not supported (e.g. sandbox)
    console.error(`[WHATSAPP] Order card failed, falling back:`, err.response?.data?.error?.message || err.message);
    if (status === "paid") {
      await sendWhatsAppMessage(to,
        `✅ *Payment Confirmed!*\n\nYour Print Code is:\n\n*${printCode}*\n\nHead to any Mimo kiosk, enter this code to collect your prints! 🖨️`
      );
    } else {
      const paymentLink = `https://api-upqxuj7evq-uc.a.run.app/wa-pay/${orderId}`;
      await sendWhatsAppMessage(to,
        `Order #${orderId.slice(-6)}\n------------------------\n*Print Job*\nQuantity ${copies}\n------------------------\nTotal            ₹${totalAmount.toFixed(2)}\n\nMimo Printing\n\n💳 *Pay Now:*\n${paymentLink}`
      );
    }
  }
}

async function _askForCoupon(from, session, sessionRef, copies) {
  const pricingDoc = await db.collection("settings").doc("pricing").get();
  const pricing = pricingDoc.exists ? pricingDoc.data() : {};

  const pricePerPage = session.colorMode === "color" ? (pricing.pricePerPageWAColor || pricing.pricePerPageColor || 10.00) : (pricing.pricePerPageWABW || pricing.pricePerPageBW || 2.80);

  const pageCount = session.pageCount || 1;
  let totalAmount = Number((copies * pageCount * pricePerPage).toFixed(2));

  // Update session
  await sessionRef.update({ state: "awaiting_coupon", copies, rawTotal: totalAmount });

  const kioskName = (session.destination === "CV-001" || session.destination === "KIOSK-001-CV") ? "🖨️ MIMO 1.0" : "🖨️ MIMO 2.0";
  const colorText = session.colorMode === "color" ? "🎨 Color" : "📄 B&W";

  const receiptText = `🧾 *MIMO PRINT SUMMARY* 🧾
➖➖➖➖➖➖➖➖➖➖➖➖➖➖
📄 *Document:* ${session.fileName}
📑 *Pages:* ${pageCount}
📍 *Kiosk:* ${kioskName}
🎨 *Color Mode:* ${colorText}
🖨️ *Copies:* ${copies}
➖➖➖➖➖➖➖➖➖➖➖➖➖➖
💵 *Total Amount:* ₹${totalAmount.toFixed(2)}

🎟️ _Have a discount coupon?_
Type the code below, or click *Skip & Pay* to proceed.`;

  await sendWhatsAppButtons(from, receiptText, [
    { id: "skip_coupon", title: "Skip & Pay" }
  ]);
}

async function _finalizePayment(from, session, sessionRef, couponCode) {
  let totalAmount = session.rawTotal || 1.00;
  let discountAmount = 0;

  if (couponCode) {
    try {
      const couponDoc = await db.collection("coupons").doc(couponCode).get();
      if (couponDoc.exists) {
        const data = couponDoc.data();
        let isExpired = false;

        if (data.expiryDate) {
          const expiryDate = data.expiryDate.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
          if (expiryDate < new Date()) isExpired = true;
        }

        if (!isExpired) {
          const discountPct = data.discountPercentage || 0;
          discountAmount = (totalAmount * discountPct) / 100;
          totalAmount = Number((totalAmount - discountAmount).toFixed(2));
          await sendWhatsAppMessage(from, `✅ Coupon applied! ₹${discountAmount.toFixed(2)} off.`);
        } else {
          await sendWhatsAppMessage(from, `❌ Coupon expired. Proceeding with original amount.`);
        }
      } else {
        await sendWhatsAppMessage(from, `❌ Invalid coupon code. Proceeding with original amount.`);
      }
    } catch (e) {
      console.error("[WHATSAPP] Coupon check error:", e);
    }
  }

  if (totalAmount <= 0) {
    // FREE ORDER
    const orderId = `WA-FREE-${require("uuid").v4().slice(0, 8).toUpperCase()}`;
    const printCode = Math.floor(1000 + Math.random() * 9000).toString();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const targetKioskId = session.kioskId || session.destination || "SV-002";
    await db.collection("print_jobs").doc(session.jobId).update({
      orderId,
      colorMode: session.colorMode,
      copies: session.copies,
      pageCount: session.pageCount,
      totalCost: 0,
      printDestination: targetKioskId,
      kioskId: targetKioskId,
      status: "paid",
      printCode,
      codeCreatedAt: now,
      paymentTime: now,
      retentionStartAt: now,
      couponUsed: couponCode || null
    });
    await sessionRef.update({ state: "idle" });
    await sendWhatsAppMessage(from, `🎉 *100% Free!* Your order is fully covered.\n\nYour Print Code is:\n*${printCode}*\n\nHead to the Mimo kiosk and enter this code! 🖨️`);
    return;
  }

  if (totalAmount < 1.00) totalAmount = 1.00; // Minimum Cashfree amount

  const orderId = `WA-${require("uuid").v4().slice(0, 8).toUpperCase()}`;
  try {
    const cfRes = await axios.post(`${CASHFREE_BASE_URL}/links`, {
      link_id: orderId,
      link_amount: totalAmount,
      link_currency: "INR",
      link_purpose: "Mimo Print Order",
      customer_details: {
        customer_phone: from.toString().replace(/[^\d]/g, "").slice(-10) || "9999999999",
        customer_name: session.userName || session.userId || "WA User"
      },
      link_meta: {
        return_url: `https://api-upqxuj7evq-uc.a.run.app/wa-pay-success/${orderId}`,
        notify_url: `https://api-upqxuj7evq-uc.a.run.app/cashfree-webhook`
      }
    }, { headers: cashfreeHeaders });

    const targetKioskId = session.kioskId || session.destination || "SV-002";
    await db.collection("print_jobs").doc(session.jobId).update({
      orderId, colorMode: session.colorMode, copies: session.copies, pageCount: session.pageCount, totalCost: totalAmount, printDestination: targetKioskId, kioskId: targetKioskId, couponUsed: couponCode || null
    });

    await sessionRef.update({ state: "idle" });

    const paymentLink = cfRes.data.link_url;

    const bodyText = `🧾 *ORDER PAID* (#${orderId.slice(-6)})
━━━━━━━━━━━━━━━━━
📄 *File:* ${session.fileName}
🔢 *Copies:* ${session.copies}
🎨 *Type:* ${session.colorMode === "color" ? "Color" : "B&W"}
━━━━━━━━━━━━━━━━━
💰 *Amount Paid:* ₹${totalAmount.toFixed(2)}

✨ Thank you for using Mimo Printing!`;
    await sendWhatsAppCTAButton(from, bodyText, "Pay Now", paymentLink);
  } catch (cfErr) {
    console.error("[WHATSAPP BOT] Cashfree order creation failed:", cfErr.response?.data || cfErr.message);
    await sendWhatsAppMessage(from, "❌ Failed to create payment order. Please try again.");
    await sessionRef.set({ state: "idle" });
  }
}

module.exports = {
  _askForCoupon,
  _finalizePayment,
  sendWhatsAppButtons,
  sendWhatsAppMessage,
  sendWhatsAppOrderCard,
  waContext,
};
