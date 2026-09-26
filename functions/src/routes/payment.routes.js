const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const payment = require("../controllers/payment.controller");

const router = express.Router();

router.post("/create-order", authMiddleware, payment.postCreateOrder);
router.get("/verify-payment/:orderId", payment.getVerifyPayment);
// Signature is verified from req.rawBody inside the controller (no body-parser middleware needed).
router.post("/cashfree-webhook", payment.postCashfreeWebhook);
router.post("/check-status", payment.postCheckStatus);
router.post("/payment-success", authMiddleware, payment.postPaymentSuccess);
router.post("/request-refund", authMiddleware, payment.postRequestRefund);

module.exports = router;
