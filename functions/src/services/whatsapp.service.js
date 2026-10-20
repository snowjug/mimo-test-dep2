const { AsyncLocalStorage } = require("async_hooks");
const axios = require("axios");
const { CASHFREE_BASE_URL, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, cashfreeHeaders } = require("../config/env");
const { admin, db } = require("../config/firebase");
const { loadPricing } = require("./pricing.service");
const { generateUniquePrintCode } = require("./printCode.service");
const { loadMachinesMap } = require("./machineRegistry.service");

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
 * Send a WhatsApp interactive list message. Use this instead of sendWhatsAppButtons once there are more than
 * 3 options — WhatsApp's "button" message type hard-caps at 3 buttons, but "list" supports up to 10 rows.
 * @param {string} to - Phone number
 * @param {string} bodyText - The main message body
 * @param {string} buttonText - Label of the menu button that opens the list (max 20 chars)
 * @param {Array<{id: string, title: string, description?: string}>} rows - Up to 10 rows
 * @param {string} [headerText] - Optional header text
 */
async function sendWhatsAppList(to, bodyText, buttonText, rows, headerText = null) {
  try {
    const normalized = to.replace(/[^\d]/g, "");
    const payload = {
      messaging_product: "whatsapp",
      to: normalized,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonText.substring(0, 20),
          sections: [{
            rows: rows.slice(0, 10).map(r => ({
              id: r.id,
              title: r.title.substring(0, 24),
              ...(r.description ? { description: r.description.substring(0, 72) } : {})
            }))
          }]
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
    console.log(`[WHATSAPP] List message sent to ${normalized}`);
  } catch (err) {
    console.error(`[WHATSAPP ERROR] Failed to send list to ${to}:`, err.response?.data || err.message);
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

/**
 * Mission 21 (carried into Mission 37): classifies the outcome of sending the SAME `interactive`/`cta_url`
 * message sendWhatsAppCTAButton already sends — a SIBLING function, not a replacement. sendWhatsAppCTAButton
 * is left byte-for-byte unchanged (the chatbot's behavior must not change); this exists only because the
 * Flow's durable notification state machine (createOrderOperation.js) needs a real confirmed/
 * definite-failure/ambiguous signal that sendWhatsAppCTAButton's own catch-and-fall-back-to-text design never
 * surfaces to its caller (it never throws). No new message type, no new provider, no new credential — same
 * endpoint, same payload shape, same WA_ACCESS_TOKEN.
 *
 * Classification (requirement 4/5 of Mission 21):
 *   - Meta responded with a 2xx AND the documented `messages[0].id` success shape -> "confirmed".
 *   - Meta responded with an HTTP error status (`err.response` present) -> the request was definitely
 *     rejected -> "definite_failure". Safe to retry (the message was never sent).
 *   - No HTTP response at all (timeout, DNS/network failure, connection reset) -> we cannot tell whether
 *     Meta received and processed the request before the connection broke -> "ambiguous". NEVER classified
 *     as a safe-to-retry failure, to avoid sending the user a duplicate message for a request that may have
 *     already gone through.
 * @returns {Promise<{classification:"confirmed", messageId:string}>}
 * @throws {WhatsAppSendError} with `.classification` set to "definite_failure" or "ambiguous"
 */
class WhatsAppSendError extends Error {
  constructor(classification, message, cause) {
    super(message);
    this.name = "WhatsAppSendError";
    this.classification = classification;
    this.cause = cause;
  }
}

async function sendWhatsAppCTAButtonTracked(to, bodyText, buttonText, url) {
  const normalized = to.replace(/[^\d]/g, "");
  let res;
  try {
    res = await axios.post(getWaApiUrl(), {
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
      },
      timeout: 10000, // bounded wait, matching the existing Cashfree-call convention — past this, we
      // genuinely do not know whether Meta received the request, hence "ambiguous" below, not a retry.
    });
  } catch (err) {
    if (err.response) {
      // Meta answered with an error status: the message was NOT accepted. Definite, safe to retry.
      throw new WhatsAppSendError("definite_failure", err.response.data?.error?.message || err.message, err);
    }
    // No response at all (timeout/network/connection reset): cannot distinguish "never sent" from "sent, but
    // the response never arrived." Ambiguous — never auto-retried.
    throw new WhatsAppSendError("ambiguous", err.message, err);
  }
  const messageId = res.data && Array.isArray(res.data.messages) && res.data.messages[0] && res.data.messages[0].id;
  if (!messageId) {
    // Resolved without throwing but without Meta's documented success shape: cannot tell delivered from not.
    throw new WhatsAppSendError("ambiguous", "WhatsApp API response did not confirm delivery");
  }
  console.log(`[WHATSAPP] CTA button (tracked) sent to ${normalized}`);
  return { classification: "confirmed", messageId };
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
  // Same pricing document as the web checkout (mimo_settings/pricing); the optional WhatsApp-specific fields still override it.
  const { rates, raw: pricing } = await loadPricing(db);

  const pricePerPage = session.colorMode === "color" ? (Number(pricing.pricePerPageWAColor) > 0 ? Number(pricing.pricePerPageWAColor) : rates.pricePerPageColor) : (Number(pricing.pricePerPageWABW) > 0 ? Number(pricing.pricePerPageWABW) : rates.pricePerPageBW);

  const pageCount = session.pageCount || 1;
  let totalAmount = Number((copies * pageCount * pricePerPage).toFixed(2));

  // Update session
  await sessionRef.update({ state: "awaiting_coupon", copies, rawTotal: totalAmount });

  const destMachines = await loadMachinesMap(db);
  const kioskName = `🖨️ ${destMachines.get(session.destination)?.name || session.destination || "Mimo"}`;
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
      // A disabled coupon is treated like an unknown one (same rule as the web checkout).
      if (couponDoc.exists && couponDoc.data().isActive) {
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
    const printCode = await generateUniquePrintCode(db);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const targetKioskId = session.kioskId || session.destination || "SV-002";
    // Record the ₹0 transaction so refund/failure logic (autoRefundJob, /kiosk/report-failure) has a real
    // document to read -- without this, a WhatsApp order has no orders/payment_transactions record at all,
    // and a genuinely-paid order further down would get silently misread as "free, no refund needed".
    await db.collection("payment_transactions").doc().set({
      orderId, userId: `wa:${from}`, amount: 0, createdAt: now, status: "PAID", paymentMethod: "whatsapp_free",
    });
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

    // Same reasoning as the free-order branch above: this is the record autoRefundJob and
    // /kiosk/report-failure both look up by orderId to find the real paid amount. The Cashfree webhook
    // (postCashfreeWebhook) already updates any orders/payment_transactions doc matching this orderId to
    // PAID on success -- it needs this doc to exist first, which until now it never did for WhatsApp.
    await db.collection("payment_transactions").doc().set({
      orderId, userId: `wa:${from}`, amount: totalAmount, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "INITIATED", paymentMethod: "whatsapp_link",
    });

    const targetKioskId = session.kioskId || session.destination || "SV-002";
    await db.collection("print_jobs").doc(session.jobId).update({
      orderId, colorMode: session.colorMode, copies: session.copies, pageCount: session.pageCount, totalCost: totalAmount, printDestination: targetKioskId, kioskId: targetKioskId, couponUsed: couponCode || null
    });

    await sessionRef.update({ state: "idle" });

    const paymentLink = cfRes.data.link_url;

    // Labeled as a payment request, not a confirmation: payment has not happened yet at this point
    // (the Cashfree link was just created), so this must never read as "paid" -- see the brief's
    // "never tell the customer that payment succeeded unless the backend has verified it" requirement.
    const bodyText = `🧾 *ORDER SUMMARY* (#${orderId.slice(-6)})
━━━━━━━━━━━━━━━━━
📄 *File:* ${session.fileName}
🔢 *Copies:* ${session.copies}
🎨 *Type:* ${session.colorMode === "color" ? "Color" : "B&W"}
━━━━━━━━━━━━━━━━━
💰 *Amount Due:* ₹${totalAmount.toFixed(2)}

Tap *Pay Now* below to complete your order.`;
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
  sendWhatsAppCTAButton,
  sendWhatsAppCTAButtonTracked,
  sendWhatsAppList,
  sendWhatsAppMessage,
  sendWhatsAppOrderCard,
  WhatsAppSendError,
  waContext,
};
