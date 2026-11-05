const express = require("express");
const public = require("../controllers/public.controller");
const { getPublicMachines, getPublicMachine } = require("../controllers/publicMachines.controller");
const { getPublicAds } = require("../controllers/ads.controller");
const { getPublicOutages, postNotifyWhenAvailable } = require("../controllers/outage.controller");

const router = express.Router();

router.get("/validate-coupon/:code", public.getValidateCoupon);
router.get("/api/settings", public.getApiSettings);
router.get("/api/screensaver", public.getApiScreensaver);
router.get("/api/stats", public.getApiStats);
router.get("/api/machines", getPublicMachines);
router.get("/api/machines/:machineId", getPublicMachine);
router.get("/api/ads", getPublicAds);
router.post("/api/customer-incident", public.postCustomerIncident);
router.post("/public/customer-incident", public.postCustomerIncident);

// Customer-facing kiosk outage status and notification subscriptions
router.get("/api/kiosk-outages", getPublicOutages);
router.post("/api/notify-when-available", postNotifyWhenAvailable);

module.exports = router;
