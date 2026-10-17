const express = require("express");
const { marketingAuthMiddleware } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const marketing = require("../controllers/marketing.controller");

const router = express.Router();
const { loginLimiter } = createLimiters(db);

// Public
router.post("/marketing/login", loginLimiter, marketing.postMarketingLogin);

// Authenticated
router.get("/marketing/me", marketingAuthMiddleware, marketing.getMarketingMe);
router.get("/marketing/tasks", marketingAuthMiddleware, marketing.getMarketingTasks);
router.post("/marketing/tasks", marketingAuthMiddleware, marketing.postMarketingTask);
router.patch("/marketing/tasks/:taskId", marketingAuthMiddleware, marketing.patchMarketingTask);

router.patch("/marketing/profile", marketingAuthMiddleware, marketing.patchMarketingProfile);
router.post("/marketing/profile/document/:docType", marketingAuthMiddleware, marketing.postMarketingProfileDocument);
router.post("/marketing/change-password", marketingAuthMiddleware, marketing.postMarketingChangePassword);
router.get("/marketing/chat", marketingAuthMiddleware, marketing.getMarketingChatMessages);
router.post("/marketing/chat", marketingAuthMiddleware, marketing.postMarketingChatMessage);

module.exports = router;
