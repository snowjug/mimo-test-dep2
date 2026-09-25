const express = require("express");
const whatsapp = require("../controllers/whatsapp.controller");

const router = express.Router();

router.get("/wa-pay/:orderId", whatsapp.getWaPay);
router.get("/wa-pay-success/:orderId", whatsapp.getWaPaySuccess);
router.get("/whatsapp-webhook", whatsapp.getWhatsappWebhook);
router.post("/whatsapp-webhook", whatsapp.postWhatsappWebhook);

module.exports = router;
