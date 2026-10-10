const express = require("express");
const { marketingAuthMiddleware } = require("../middleware/auth");
const marketing = require("../controllers/marketing.controller");

const router = express.Router();

// Public
router.post("/marketing/login", marketing.postMarketingLogin);

// Authenticated
router.get("/marketing/me", marketingAuthMiddleware, marketing.getMarketingMe);
router.get("/marketing/tasks", marketingAuthMiddleware, marketing.getMarketingTasks);
router.post("/marketing/tasks", marketingAuthMiddleware, marketing.postMarketingTask);
router.patch("/marketing/tasks/:taskId", marketingAuthMiddleware, marketing.patchMarketingTask);

module.exports = router;
