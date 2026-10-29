// Mission 38: extracted from functions/src/controllers/payment.controller.js's postCreateOrder/
// postPaymentSuccess AS THEY STAND ON CURRENT MAIN (commit f5c8714e) — not from the old feature branch's
// order.service.js, which Mission 36/37 found had silently drifted from two fixes already shipped to main
// (the transactional re-claim in postCreateOrder, and the removal of a hardcoded "CV-001"/kiosk-fallback
// default). This extraction is verbatim: every validation, every Firestore read/write, every transaction
// shape, and the no-hardcoded-kiosk-id behaviour are preserved exactly as current main has them. The only
// true addition is `channel === "whatsapp"`'s SV-002 colour-routing guard, which runs for NO existing caller
// (the website controller never passes `channel`), so existing behaviour is provably unchanged — proved by
// re-running main's own, untouched characterization tests against this extraction (see the Mission 38
// report).
//
// I/O boundary change only: `res.status(x).json({error})` -> `throw new OrderServiceError(x, message)`;
// `req.user`/`req.body` -> plain arguments. No business logic changed beyond the additive guard below.
const axios = require("axios");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { CASHFREE_BASE_URL, cashfreeHeaders } = require("../config/env");
const { SUPPORTED_OFFICE_EXTENSIONS } = require("../services/converter.service");
const { admin, db: defaultDb } = require("../config/firebase");
const { sendWhatsAppMessage } = require("../services/whatsapp.service");
const { getTransporter } = require("../services/email.service");
const { loadPricing } = require("../services/pricing.service");
const { generateUniquePrintCode } = require("../services/printCode.service");
const { loadMachinesMap, loadMachineTemplatesMap, describeDestination } = require("../services/machineRegistry.service");

// Upper bound for copies of one order (the customer site allows 1-99). Verbatim from payment.controller.js.
const MAX_COPIES = 100;

// The only kiosk a colour order may ever be routed to (product requirement — see CLAUDE.md's "WhatsApp
// Product Requirements": "Color routing must require SV-002 to be ACTIVE and color-capable" / "Never
// silently route color jobs to a B&W-only kiosk"). Not configurable by any caller.
const COLOR_KIOSK_ID = "SV-002";

class OrderServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "OrderServiceError";
    this.status = status;
  }
}

/**
 * Mission 38: channel-scoped colour-routing guard for WhatsApp-originated orders ONLY. Website callers never
 * pass `channel`, so this function is never invoked for them — existing website behaviour (which has no such
 * guard today) is byte-for-byte unaffected either way. Fails closed on any ambiguity (unknown machine,
 * inactive, not colour-capable, or a registry read error) and never falls back to a B&W kiosk.
 */
async function assertWhatsAppColorRoutingEligible(db) {
  let machines, templates;
  try {
    [machines, templates] = await Promise.all([loadMachinesMap(db), loadMachineTemplatesMap(db)]);
  } catch (err) {
    throw new OrderServiceError(503, "Color printing is temporarily unavailable. Please try again shortly.");
  }
  const destination = describeDestination(machines, templates, COLOR_KIOSK_ID);
  if (!destination.known || !destination.active || !destination.supportsColor) {
    throw new OrderServiceError(503, "Color printing is available only at MIMO 2.0, which is not ready to accept jobs right now. Please try again shortly.");
  }
}

/**
 * Resolves the customer's email address by checking all possible sources:
 * 1. Explicitly provided customerEmail / reqUser.email
 * 2. Firestore `users` collection by doc ID (or query by `id`/`userId`)
 * 3. Firestore `payment_transactions` collection for the given orderId
 * 4. Firestore `orders` collection for the given orderId
 * 5. Firestore `print_jobs` collection for the given orderId
 * 6. Firebase Auth user profile (if available)
 */
async function resolveCustomerEmail({ db = defaultDb, userId, orderId, reqUser, explicitEmail } = {}) {
  const isRealEmail = (e) =>
    typeof e === "string" &&
    e.trim().includes("@") &&
    !e.toLowerCase().includes("user@printmimo.tech") &&
    !e.toLowerCase().includes("placeholder");

  // 1. Explicit email passed in args or reqUser
  if (isRealEmail(explicitEmail)) return explicitEmail.trim();
  if (isRealEmail(reqUser?.email)) return reqUser.email.trim();
  if (isRealEmail(reqUser?.email_id)) return reqUser.email_id.trim();

  // 2. Check users collection by doc ID
  if (userId) {
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        const udata = userDoc.data() || {};
        const candidate = udata.email || udata.userEmail || udata.customerEmail;
        if (isRealEmail(candidate)) return candidate.trim();
      }
    } catch (_) {}

    // Fallback: check users collection where "id" == userId or "userId" == userId
    try {
      const snap = await db.collection("users").where("id", "==", userId).limit(1).get();
      if (!snap.empty) {
        const candidate = snap.docs[0].data()?.email || snap.docs[0].data()?.userEmail;
        if (isRealEmail(candidate)) return candidate.trim();
      }
    } catch (_) {}

    try {
      const snap = await db.collection("users").where("userId", "==", userId).limit(1).get();
      if (!snap.empty) {
        const candidate = snap.docs[0].data()?.email || snap.docs[0].data()?.userEmail;
        if (isRealEmail(candidate)) return candidate.trim();
      }
    } catch (_) {}
  }

  // 3. Check payment_transactions collection by orderId
  if (orderId) {
    try {
      const txnSnap = await db.collection("payment_transactions").where("orderId", "==", orderId).limit(1).get();
      if (!txnSnap.empty) {
        const tdata = txnSnap.docs[0].data() || {};
        const candidate = tdata.customerEmail || tdata.userEmail || tdata.email || tdata.customer_email;
        if (isRealEmail(candidate)) return candidate.trim();
      }
    } catch (_) {}

    // 4. Check orders collection by orderId
    try {
      const ordSnap = await db.collection("orders").where("orderId", "==", orderId).limit(1).get();
      if (!ordSnap.empty) {
        const odata = ordSnap.docs[0].data() || {};
        const candidate = odata.customerEmail || odata.userEmail || odata.email || odata.customer_email;
        if (isRealEmail(candidate)) return candidate.trim();
      }
    } catch (_) {}

    // 5. Check print_jobs by orderId
    try {
      const jobSnap = await db.collection("print_jobs").where("orderId", "==", orderId).limit(1).get();
      if (!jobSnap.empty) {
        const jdata = jobSnap.docs[0].data() || {};
        const candidate = jdata.customerEmail || jdata.userEmail || jdata.email;
        if (isRealEmail(candidate)) return candidate.trim();
      }
    } catch (_) {}
  }

  // 6. Firebase Auth fallback
  if (userId && typeof admin?.auth === "function") {
    try {
      const authUser = await admin.auth().getUser(userId);
      if (isRealEmail(authUser?.email)) return authUser.email.trim();
    } catch (_) {}
  }

  return null;
}

/**
 * Creates (or free-fulfils) an order for `jobIds` belonging to `userId`. A faithful, behavior-preserving
 * extraction of payment.controller.js's postCreateOrder (current main, lines ~18-500) — see that function's
 * own inline comments for the reasoning behind each step; none of it is repeated or altered here beyond the
 * I/O-boundary translation described at the top of this file.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} [args.db]
 * @param {string} args.userId
 * @param {string[]} args.jobIds
 * @param {object} [args.printOptions]
 * @param {string} [args.couponCode]
 * @param {number|string} [args.coinsToUse]
 * @param {{phone?:string, name?:string, email?:string}} [args.customer] - maps to req.body.customerPhone/Name/Email
 * @param {{email?:string}} [args.reqUser] - maps to req.user (for the free-order receipt e-mail fallback)
 * @param {string} [args.channel] - `"whatsapp"` additionally enforces the SV-002 colour-routing guard before
 *   anything is written. The website controller never passes this.
 * @returns {Promise<{orderId:string, paymentSessionId:string|null, amount:number, free?:boolean, printCode?:string}>}
 */
async function createOrderForUser({ db = defaultDb, userId, jobIds, printOptions, couponCode, coinsToUse, customer = {}, reqUser, channel } = {}) {
  let coinsRequested = 0;
  if (coinsToUse !== undefined && coinsToUse !== null && coinsToUse !== "") {
    coinsRequested = Number(coinsToUse);
    if (!Number.isFinite(coinsRequested) || coinsRequested < 0) {
      throw new OrderServiceError(400, "coinsToUse must be a non-negative number.");
    }
  }
  const orderId = `order_${uuidv4().replace(/-/g, "").substring(0, 10)}`;

  if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    throw new OrderServiceError(400, "Explicit non-empty jobIds array is required for checkout.");
  }

  const seenJobIds = new Set();
  const jobRefs = [];
  for (const rawJobId of jobIds) {
    if (typeof rawJobId !== "string" || !rawJobId.trim()) {
      throw new OrderServiceError(400, "Invalid jobId format in checkout selection.");
    }
    const jobId = rawJobId.trim();
    if (seenJobIds.has(jobId)) {
      throw new OrderServiceError(400, `Duplicate jobId detected in checkout request: ${jobId}`);
    }
    seenJobIds.add(jobId);
    jobRefs.push(db.collection("print_jobs").doc(jobId));
  }

  // Plain (non-transactional) read for early validation and pricing computation — same race-tolerance
  // reasoning as the controller: the actual claim decision is re-made, atomically, inside the transaction
  // immediately before the final write below.
  let targetJobs; // array of { ref, data }
  try {
    targetJobs = await Promise.all(jobRefs.map(async (ref) => {
      const jobId = ref.id;
      const doc = await ref.get();
      if (!doc.exists) {
        throw Object.assign(new Error(`Print job not found: ${jobId}`), { httpStatus: 400 });
      }
      const data = doc.data();
      if (data.userId !== userId) {
        throw Object.assign(new Error(`Unauthorized access to print job: ${jobId}`), { httpStatus: 403 });
      }
      if (data.status !== "pending") {
        throw Object.assign(
          new Error(`Print job ${jobId} is not in pending status (current status: ${data.status}).`),
          { httpStatus: 400 }
        );
      }
      if (data.removedByUser === true || data.fileDeleted === true) {
        throw Object.assign(new Error(`Print job ${jobId} has been removed or deleted.`), { httpStatus: 400 });
      }
      return { ref: doc.ref, data };
    }));
  } catch (claimErr) {
    if (claimErr && claimErr.httpStatus) throw new OrderServiceError(claimErr.httpStatus, claimErr.message);
    throw claimErr;
  }

  let discountPercentage = 0;
  if (couponCode) {
    const couponDoc = await db.collection("coupons").doc(couponCode.toUpperCase()).get();
    if (couponDoc.exists) {
      const couponData = couponDoc.data();
      const now = new Date();
      if (couponData.isActive && (!couponData.expiryDate || couponData.expiryDate.toDate() > now)) {
        discountPercentage = Math.min(100, Math.max(0, Number(couponData.discountPercentage) || 0));
      }
    }
  }

  let totalAmount = 0;
  const isBlankSheet = printOptions?.isBlankSheet === true || printOptions?.blankSheet === true;
  const sheetType = printOptions?.sheetType || "a4";
  const colorMode = printOptions?.colorMode || "bw";

  // Channel-scoped colour-routing guard (Mission 38): website callers never set `channel`, so this never runs
  // for them — B&W orders on every channel keep the existing default-kiosk policy unchanged either way.
  if (channel === "whatsapp" && colorMode === "color") {
    await assertWhatsAppColorRoutingEligible(db);
  }

  const { rates } = await loadPricing(db);
  let pricePerPage = rates.pricePerPageBW; // A4 B&W simplex
  if (colorMode === "color") {
    pricePerPage = rates.pricePerPageColor;
  } else if (isBlankSheet && sheetType === "graph") {
    pricePerPage = rates.pricePerPageGraph;
  } else if (isBlankSheet) {
    pricePerPage = rates.pricePerPageA4;
  }
  const copies = Number(printOptions?.copies || 1);
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) {
    throw new OrderServiceError(400, `copies must be a whole number between 1 and ${MAX_COPIES}.`);
  }

  const mergedFiles = [];
  let totalRawPages = 0;
  let earliestRetentionStartAt = null;

  targetJobs.forEach(({ ref, data }) => {
    const jobRetention = data.retentionStartAt || data.uploadedAt || data.createdAt;
    if (jobRetention) {
      if (!earliestRetentionStartAt) {
        earliestRetentionStartAt = jobRetention;
      } else {
        const candTime = (jobRetention.toDate ? jobRetention.toDate() : new Date(jobRetention)).getTime();
        const earliestTime = (earliestRetentionStartAt.toDate ? earliestRetentionStartAt.toDate() : new Date(earliestRetentionStartAt)).getTime();
        if (!isNaN(candTime) && !isNaN(earliestTime) && candTime < earliestTime) {
          earliestRetentionStartAt = jobRetention;
        }
      }
    }

    if (Array.isArray(data.files) && data.files.length > 0) {
      data.files.forEach((fileItem) => {
        const fileName = fileItem.originalFileName || fileItem.name;
        const fileConfig = printOptions?.fileConfigs?.[fileName] || printOptions?.fileConfigs?.[fileItem.name];
        let numPages = fileItem.pageCount || fileConfig?.pageCount || 1;
        const jobPageSelection = fileConfig?.pageSelection || fileConfig?.pagesToPrint || printOptions?.pageSelection || printOptions?.pagesToPrint || "all";
        const jobPageRange = fileConfig?.pageRange || fileConfig?.customPageRange || printOptions?.pageRange || printOptions?.customPageRange || "";

        if (jobPageSelection === "custom" && jobPageRange) {
          const ranges = String(jobPageRange).split(",");
          let customCount = 0;
          for (const r of ranges) {
            const parts = r.split("-").map((p) => parseInt(p.trim()));
            if (parts.length === 1 && !isNaN(parts[0])) {
              if (parts[0] >= 1 && parts[0] <= numPages) customCount += 1;
            } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              if (parts[0] >= 1 && parts[1] <= numPages && parts[0] <= parts[1]) {
                customCount += (parts[1] - parts[0] + 1);
              }
            }
          }
          if (customCount > 0) numPages = customCount;
        }

        totalRawPages += numPages;

        const printableName = fileItem.name;
        const originalFileUrl = fileItem.originalFileUrl || fileItem.originalUrl || null;
        const convertedStoragePath = fileItem.convertedStoragePath || null;

        mergedFiles.push({
          name: printableName,
          originalFileName: fileItem.originalFileName || fileItem.name,
          url: fileItem.url,
          originalFileUrl: originalFileUrl,
          originalUrl: originalFileUrl,
          convertedStoragePath: convertedStoragePath,
          type: fileItem.type || "application/octet-stream",
          size: fileItem.size || fileItem.fileSize || 0,
          pageCount: numPages,
        });
      });
    } else {
      const fileConfig = printOptions?.fileConfigs?.[data.fileName];
      let numPages = data.pageCount || fileConfig?.pageCount || 1;
      const jobPageSelection = fileConfig?.pageSelection || fileConfig?.pagesToPrint || printOptions?.pageSelection || printOptions?.pagesToPrint || "all";
      const jobPageRange = fileConfig?.pageRange || fileConfig?.customPageRange || printOptions?.pageRange || printOptions?.customPageRange || "";

      if (jobPageSelection === "custom" && jobPageRange) {
        const ranges = String(jobPageRange).split(",");
        let customCount = 0;
        for (const r of ranges) {
          const parts = r.split("-").map((p) => parseInt(p.trim()));
          if (parts.length === 1 && !isNaN(parts[0])) {
            if (parts[0] >= 1 && parts[0] <= numPages) customCount += 1;
          } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            if (parts[0] >= 1 && parts[1] <= numPages && parts[0] <= parts[1]) {
              customCount += (parts[1] - parts[0] + 1);
            }
          }
        }
        if (customCount > 0) numPages = customCount;
      }

      totalRawPages += numPages;

      let printableName = data.fileName;
      const isConvertedPdf = data.convertedStoragePath || (data.mimetype === "application/pdf" && SUPPORTED_OFFICE_EXTENSIONS.has(path.extname(data.fileName || "").toLowerCase()));
      if (isConvertedPdf) {
        const baseName = path.basename(data.fileName, path.extname(data.fileName));
        printableName = `${baseName}.pdf`;
      }

      const originalFileUrl = data.originalFileUrl || data.originalUrl || null;
      const convertedStoragePath = data.convertedStoragePath || null;

      mergedFiles.push({
        name: printableName,
        originalFileName: data.fileName,
        url: data.fileUrl,
        originalFileUrl: originalFileUrl,
        originalUrl: originalFileUrl,
        convertedStoragePath: convertedStoragePath,
        type: data.mimetype || "application/octet-stream",
        size: data.size || data.fileSize || 0,
        pageCount: numPages,
      });
    }
  });

  let divisor = 1;
  if (printOptions?.photoLayout === "2") divisor = 2;
  if (printOptions?.photoLayout === "4") divisor = 4;
  if (printOptions?.photoLayout === "6") divisor = 6;
  if (printOptions?.photoLayout === "9") divisor = 9;

  let actualPages = Math.ceil(totalRawPages / divisor);

  if (printOptions?.doubleSided === "double") {
    actualPages = Math.ceil(actualPages / 2);
    if (colorMode === "bw") {
      pricePerPage = rates.pricePerPageBWDuplex;
    }
  }

  const jobCost = actualPages * copies * pricePerPage;
  totalAmount += jobCost;

  const newJobRef = db.collection("print_jobs").doc();
  const newJobData = {
    userId,
    fileName: mergedFiles.length > 1 ? `Multiple Files (${mergedFiles.length})` : mergedFiles[0].name,
    fileUrl: mergedFiles[0].url,
    originalFileUrl: mergedFiles[0].originalFileUrl || null,
    convertedStoragePath: mergedFiles[0].convertedStoragePath || null,
    mimetype: mergedFiles[0].type,
    files: mergedFiles,
    size: mergedFiles.reduce((acc, f) => acc + (f.size || 0), 0),
    status: "pending",
    pageCount: totalRawPages,
    printOptions: printOptions || {},
    pricing: { pricePerPage, totalPages: actualPages, jobCost },
    orderId,
    colorMode,
    color: colorMode === "color",
    copies: copies,
    duplex: printOptions?.doubleSided === "double",
    finalCost: jobCost,
    totalCost: jobCost,
    // Current main has NO hardcoded kiosk default here (the fleet-hardcoding fix removed "CV-001") —
    // preserved exactly: null, never a literal kiosk id, when the caller doesn't supply one.
    kioskId: printOptions?.directKioskId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    retentionStartAt: earliestRetentionStartAt || admin.firestore.FieldValue.serverTimestamp(),
  };

  let coinsApplied = 0;
  if (coinsRequested > 0) {
    const userSnap = await db.collection("users").doc(userId).get();
    const balance = Number(userSnap.exists ? userSnap.data().mimo_coins?.balance : 0) || 0;
    const checkedOutIds = new Set(targetJobs.map((j) => j.ref.id));
    const otherPending = await db.collection("print_jobs").where("userId", "==", userId).where("status", "==", "pending").get();
    let reserved = 0;
    otherPending.forEach((d) => { if (!checkedOutIds.has(d.id)) reserved += Number(d.data().coinsToDeduct) || 0; });
    if (coinsRequested > balance - reserved + 1e-9) {
      throw new OrderServiceError(400, "Not enough Mimo coins.");
    }
    coinsApplied = Math.min(coinsRequested, totalAmount);
  }
  const coinsDiscount = coinsApplied * 0.5;

  const finalAmountToPay = Math.max(0, totalAmount - coinsDiscount);
  let amount = Number(finalAmountToPay.toFixed(2));
  if (discountPercentage > 0) {
    amount = Number((amount - (amount * (discountPercentage / 100))).toFixed(2));
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw new OrderServiceError(400, "Invalid order amount.");
  }

  const isFreeOrder = amount <= 0 || amount < 1.00;

  // Paid orders: create the Cashfree order BEFORE anything is written — unchanged ordering/reasoning.
  let response = null;
  if (!isFreeOrder) {
    let customerPhone = customer?.phone || "9999999999";
    let customerName = customer?.name || "Mimo User";
    let customerEmail = customer?.email || "user@printmimo.tech";
    try {
      const uDoc = await db.collection("users").doc(userId).get();
      if (uDoc.exists) {
        const uData = uDoc.data();
        if (uData.mobileNumber || uData.phone) {
          const digits = (uData.mobileNumber || uData.phone).toString().replace(/[^\d]/g, "");
          if (digits.length >= 10) customerPhone = digits.slice(-10);
        }
        if (uData.name || uData.displayName || uData.fullName || uData.username) {
          customerName = uData.name || uData.displayName || uData.fullName || uData.username;
        }
        if (uData.email) customerEmail = uData.email;
      }
    } catch (uErr) {
      console.warn("Could not fetch user details for cashfree order:", uErr);
    }

    response = await axios.post(
      `${CASHFREE_BASE_URL}/orders`,
      {
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: userId,
          customer_phone: customerPhone,
          customer_name: customerName,
          customer_email: customerEmail,
        },
        order_meta: {
          return_url: `https://printmimo.tech/payment-verify?order_id={order_id}`,
        },
      },
      { headers: cashfreeHeaders, timeout: 10000 }
    );
  }

  // Atomic, race-safe commit: re-read every source job fresh, immediately before writing. Identical to
  // current main's transaction — this is exactly the fix the old branch's extraction was missing.
  try {
    await db.runTransaction(async (tx) => {
      const freshDocs = await Promise.all(targetJobs.map(({ ref }) => tx.get(ref)));
      freshDocs.forEach((doc, i) => {
        const jobId = targetJobs[i].ref.id;
        if (!doc.exists || doc.data().status !== "pending" || doc.data().userId !== userId) {
          throw Object.assign(
            new Error(`Print job ${jobId} is no longer available for checkout (already claimed by another checkout).`),
            { httpStatus: 409 }
          );
        }
      });
      targetJobs.forEach(({ ref }) => tx.delete(ref));
      tx.set(newJobRef, newJobData);
    });
  } catch (commitErr) {
    if (commitErr && commitErr.httpStatus) throw new OrderServiceError(commitErr.httpStatus, commitErr.message);
    throw commitErr;
  }

  // ─── FREE ORDER BYPASS ──────────────────────────────────────────────────────
  if (isFreeOrder) {
    const printCode = await generateUniquePrintCode(db);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await newJobRef.update({
      status: "paid",
      printCode,
      codeCreatedAt: now,
      paymentTime: now,
      retentionStartAt: now,
      isPrinted: false,
    });

    if (coinsApplied > 0) {
      await db.collection("users").doc(userId).update({
        "mimo_coins.balance": admin.firestore.FieldValue.increment(-coinsApplied),
        "mimo_coins.total_used": admin.firestore.FieldValue.increment(coinsApplied),
      });
    }

    const isRealCustEmail = typeof customerEmail === "string" && customerEmail.includes("@") && !customerEmail.toLowerCase().includes("user@printmimo.tech");
    await db.collection("orders").add({
      orderId, userId, amount: 0, totalPages: totalRawPages, totalDocs: mergedFiles.length,
      status: "PAID", orderStatus: "completed", printJobs: [newJobRef.id],
      createdAt: now, couponCode: couponCode || null, discountPercentage,
      coinsUsed: coinsApplied,
      ...(isRealCustEmail ? { customerEmail: customerEmail.trim() } : {}),
    });

    try {
      const userEmail = await resolveCustomerEmail({ db, userId, orderId, reqUser, explicitEmail: customer?.email });
      console.log(`[EMAIL-DEBUG] Preparing to send FREE OTP. Has Email: ${!!userEmail} (${userEmail || "none"}). Has Password: ${!!process.env.GMAIL_APP_PASSWORD}`);

      const cleanPass = (process.env.GMAIL_APP_PASSWORD || "").trim().replace(/\s+/g, "");

      if (userEmail && cleanPass) {
        const mailOptions = {
          from: '"Mimo Printing" <visionprintt@gmail.com>',
          to: userEmail,
          subject: "Your Mimo Print Code is Ready!",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; text-align: center; background-color: #ffffff;">
              <h2 style="color: #093765; margin-bottom: 8px;">Mimo Print Receipt</h2>
              <p style="color: #64748b; font-size: 15px; margin-top: 0;">Thank you for using Mimo! Your free order is ready to print.</p>
              <div style="background-color: #f8fafc; padding: 24px; border-radius: 10px; margin: 24px 0; border: 1px dashed #cbd5e1;">
                <p style="margin: 0; color: #64748b; font-size: 13px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Print Code</p>
                <p style="margin: 12px 0 0; font-size: 52px; font-weight: 900; color: #0f172a; letter-spacing: 6px;">${printCode}</p>
              </div>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Enter this code on the MIMO kiosk keypad to retrieve your documents.</p>
              <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 12px;">This code is valid until your documents are printed.</p>
            </div>
          `,
        };
        const transporter = getTransporter();
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Free order receipt sent to ${userEmail}`);
      }
    } catch (emailErr) {
      console.error("[EMAIL ERROR] Failed to send free order receipt:", emailErr);
    }

    try {
      const waUserDoc = await db.collection("users").doc(userId).get();
      const waPhone = waUserDoc.exists ? waUserDoc.data().mobileNumber : null;
      if (waPhone) {
        await sendWhatsAppMessage(waPhone,
          `✅ *Mimo Print Ready!*\n\nYour print code is:\n*${printCode}*\n\nHead to the Mimo kiosk and enter this code to collect your prints. This code is valid until you print! 🖨️`
        );
      }
    } catch (waErr) {
      console.error("[WHATSAPP] Free order notification failed:", waErr);
    }

    return { orderId, paymentSessionId: null, amount: 0, printCode, free: true };
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (coinsApplied > 0) {
    await newJobRef.update({ coinsToDeduct: coinsApplied });
  }

  const isRealCustEmail = typeof customerEmail === "string" && customerEmail.includes("@") && !customerEmail.toLowerCase().includes("user@printmimo.tech");
  const paymentTxnRef = db.collection("payment_transactions").doc();
  await paymentTxnRef.set({
    orderId,
    userId,
    amount,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "INITIATED",
    ...(isRealCustEmail ? { customerEmail: customerEmail.trim() } : {}),
  });

  return { orderId, paymentSessionId: response.data.payment_session_id, amount };
}

/**
 * Issues a print code for the given order once payment has been verified. A faithful, behavior-preserving
 * extraction of payment.controller.js's postPaymentSuccess (current main, lines ~868-1039). Does NOT itself
 * verify payment — requires an `orders`/`payment_transactions` record already carrying `status:"PAID"`,
 * exactly as before.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} [args.db]
 * @param {string} args.userId
 * @param {string} [args.orderId]
 * @param {{email?:string}} [args.reqUser]
 * @param {string} [args.customerEmail]
 * @returns {Promise<{printCode:string, directKioskId:string|null}>}
 */
async function fulfillPaidOrder({ db = defaultDb, userId, orderId, reqUser, customerEmail } = {}) {
  const now = new Date();

  // The whole read-check-write sequence runs inside a single Firestore transaction, keyed by orderId —
  // identical to current main's postPaymentSuccess.
  const outcome = await db.runTransaction(async (tx) => {
    let queryRef = db.collection("print_jobs")
      .where("userId", "==", userId)
      .where("status", "in", ["pending", "paid"]);

    if (orderId) {
      queryRef = queryRef.where("orderId", "==", orderId);
    }

    const snapshot = await tx.get(queryRef);

    if (snapshot.empty) {
      return { status: 400, body: { error: "No pending jobs found" } };
    }

    let jobsToUpdate = snapshot.docs.filter((doc) => !doc.data().printCode);

    if (jobsToUpdate.length === 0) {
      const recentJob = snapshot.docs.find((doc) => doc.data().printCode);
      if (recentJob) {
        const jobData = recentJob.data();
        const directKioskId = jobData.printOptions?.directKioskId || jobData.settings?.directKioskId || jobData.kioskId || null;
        return { status: 200, alreadyIssued: true, body: { printCode: recentJob.data().printCode, directKioskId } };
      }
      return { status: 400, body: { error: "No pending jobs without code" } };
    }

    const orderIdsToCheck = new Set(jobsToUpdate.map((d) => d.data().orderId || null));
    for (const jobOrderId of orderIdsToCheck) {
      let paid = false;
      if (jobOrderId) {
        for (const collectionName of ["orders", "payment_transactions"]) {
          const found = await tx.get(db.collection(collectionName).where("orderId", "==", jobOrderId).where("userId", "==", userId));
          if (found.docs.some((d) => d.data().status === "PAID")) { paid = true; break; }
        }
      }
      if (!paid) {
        return { status: 403, body: { error: "Payment has not been confirmed for this order." } };
      }
    }

    const printCode = await generateUniquePrintCode(db, tx);
    let directKioskId = null;

    let coinsToCharge = 0;
    jobsToUpdate.forEach((doc) => {
      const data = doc.data();
      // Current main has NO kiosk fallback here (not even data.kioskId) — preserved exactly.
      const explicitKioskId = data.printOptions?.directKioskId || data.settings?.directKioskId || null;
      const targetKiosk = explicitKioskId || null;
      if (explicitKioskId) {
        directKioskId = explicitKioskId;
      }
      const jobUpdate = {
        status: "paid",
        kioskId: targetKiosk,
        paymentTime: admin.firestore.FieldValue.serverTimestamp(),
        printCode,
        codeCreatedAt: now,
        retentionStartAt: now,
        isPrinted: false,
      };
      const owed = Number(data.coinsToDeduct) || 0;
      if (owed > 0 && !data.coinsDeducted) {
        coinsToCharge += owed;
        jobUpdate.coinsDeducted = true;
      }
      tx.update(doc.ref, jobUpdate);
    });
    if (coinsToCharge > 0) {
      tx.update(db.collection("users").doc(userId), {
        "mimo_coins.balance": admin.firestore.FieldValue.increment(-coinsToCharge),
        "mimo_coins.total_used": admin.firestore.FieldValue.increment(coinsToCharge),
      });
    }

    return { status: 200, body: { printCode, directKioskId } };
  });

  if (outcome.status !== 200) {
    throw new OrderServiceError(outcome.status, outcome.body.error);
  }

  if (outcome.alreadyIssued) {
    return { ...outcome.body, alreadyIssued: true };
  }

  const { printCode, directKioskId } = outcome.body;

  try {
    const userEmail = await resolveCustomerEmail({ db, userId, orderId, reqUser, explicitEmail: customerEmail });

    console.log(`[EMAIL-DEBUG] Preparing to send OTP. Has Email: ${!!userEmail} (${userEmail || "none"}). Has Password: ${!!process.env.GMAIL_APP_PASSWORD}`);

    const cleanPass = (process.env.GMAIL_APP_PASSWORD || "").trim().replace(/\s+/g, "");

    if (userEmail && cleanPass) {
      const isColor = outcome.body?.directKioskId === "SV-002";
      const kioskGuidance = isColor
        ? "Colour printing is available on <strong>MIMO 2.0</strong>. Please enter this code at the MIMO 2.0 kiosk."
        : "Go to the MIMO Kiosk and enter this code to retrieve your documents.";

      const mailOptions = {
        from: '"Mimo Printing" <visionprintt@gmail.com>',
        to: userEmail,
        subject: "Your Mimo Print Code is Ready!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; text-align: center; background-color: #ffffff;">
            <h2 style="color: #093765; margin-bottom: 8px;">Mimo Print Receipt</h2>
            <p style="color: #64748b; font-size: 15px; margin-top: 0;">Thank you for using Mimo! Your document is ready to print.</p>
            <div style="background-color: #f8fafc; padding: 24px; border-radius: 10px; margin: 24px 0; border: 1px dashed #cbd5e1;">
              <p style="margin: 0; color: #64748b; font-size: 13px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Print Code</p>
              <p style="margin: 12px 0 0; font-size: 52px; font-weight: 900; color: #0f172a; letter-spacing: 6px;">${printCode}</p>
            </div>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">${kioskGuidance}</p>
            <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">This code is permanently valid until it is successfully printed.</p>
          </div>
        `,
      };
      const transporter = getTransporter();
      await transporter.sendMail(mailOptions);
      console.log(`[EMAIL] Receipt sent to ${userEmail}`);

      // If user doc has no email, attach it so future visits recognize this customer
      if (userId) {
        db.collection("users").doc(userId).get().then((udoc) => {
          if (udoc.exists && !udoc.data()?.email) {
            udoc.ref.update({ email: userEmail }).catch(() => {});
          }
        }).catch(() => {});
      }
    }
  } catch (emailErr) {
    console.error("[EMAIL ERROR] Failed to send receipt:", emailErr);
  }

  try {
    const waUserDoc = await db.collection("users").doc(userId).get();
    const waPhone = waUserDoc.exists ? waUserDoc.data().mobileNumber : null;
    if (waPhone) {
      await sendWhatsAppMessage(waPhone,
        `✅ *Mimo Print Ready!*\n\nPayment confirmed! Your print code is:\n*${printCode}*\n\nHead to the Mimo kiosk and enter this code to collect your prints. 🖨️`
      );
    }
  } catch (waErr) {
    console.error("[WHATSAPP] Paid order notification failed:", waErr);
  }

  return { printCode, directKioskId };
}

module.exports = { OrderServiceError, MAX_COPIES, COLOR_KIOSK_ID, createOrderForUser, fulfillPaidOrder, assertWhatsAppColorRoutingEligible };
