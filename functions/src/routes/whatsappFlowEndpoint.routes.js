"use strict";
// Mission 16: route registration for the real Meta WhatsApp Flow Data Exchange endpoint. Additive only —
// does not touch the existing chatbot webhook routes (routes/whatsapp.routes.js) or their controller.
const express = require("express");
const { postFlowDataExchange } = require("../controllers/whatsappFlow.controller");

const router = express.Router();

// Single POST endpoint: Meta calls this directly (configured as the Flow's "Endpoint URI" in the Flow
// Builder), not through the webhook subscription machinery the chatbot uses. No GET/verification handshake
// is part of this protocol (unlike the webhook's hub.challenge verification).
router.post("/whatsapp-flow-endpoint", postFlowDataExchange);

module.exports = router;
