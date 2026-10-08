const express = require("express");
const public = require("../controllers/public.controller");
const { getPublicMachines } = require("../controllers/publicMachines.controller");

const router = express.Router();

router.get("/validate-coupon/:code", public.getValidateCoupon);
router.get("/api/settings", public.getApiSettings);
router.get("/api/screensaver", public.getApiScreensaver);
router.get("/api/stats", public.getApiStats);
router.get("/api/machines", getPublicMachines);

module.exports = router;
