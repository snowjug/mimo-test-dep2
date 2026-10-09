const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const payment = require("../controllers/payment.controller");

const router = express.Router();
const { codeGuessLimiter } = createLimiters(db);

router.post("/create-order", authMiddleware, payment.postCreateOrder);
router.get("/verify-payment/:orderId", payment.getVerifyPayment);
// Signature is verified from req.rawBody inside the controller (no body-parser middleware needed).
router.post("/cashfree-webhook", payment.postCashfreeWebhook);
// Same printCode-brute-force protection as /print/get-documents-by-code (same 4-digit code, same attack).
router.post("/check-status", codeGuessLimiter, payment.postCheckStatus);
router.post("/payment-success", authMiddleware, payment.postPaymentSuccess);
router.post("/request-refund", authMiddleware, payment.postRequestRefund);

module.exports = router;
