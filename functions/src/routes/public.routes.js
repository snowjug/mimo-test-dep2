const express = require("express");
const public = require("../controllers/public.controller");

const router = express.Router();

router.get("/validate-coupon/:code", public.getValidateCoupon);
router.get("/api/settings", public.getApiSettings);
router.get("/api/screensaver", public.getApiScreensaver);

module.exports = router;
