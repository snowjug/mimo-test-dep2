const express = require("express");
const { adminAuthMiddleware } = require("../middleware/auth");
const admin = require("../controllers/admin.controller");

const router = express.Router();

router.post("/admin/login", admin.postAdminLogin);
router.get("/admin/coupons", adminAuthMiddleware, admin.getAdminCoupons);
router.post("/admin/coupons", adminAuthMiddleware, admin.postAdminCoupons);
router.post("/admin/coupons/bulk", adminAuthMiddleware, admin.postAdminCouponsBulk);
router.delete("/admin/coupons/:code", adminAuthMiddleware, admin.deleteAdminCoupons);
router.get("/admin/settings", adminAuthMiddleware, admin.getAdminSettings);
router.post("/admin/settings", adminAuthMiddleware, admin.postAdminSettings);
router.get("/admin/screensaver", adminAuthMiddleware, admin.getAdminScreensaver);
router.post("/admin/screensaver", adminAuthMiddleware, admin.postAdminScreensaver);
router.get("/admin/hardware", adminAuthMiddleware, admin.getAdminHardware);
router.post("/admin/hardware", adminAuthMiddleware, admin.postAdminHardware);
router.get("/admin/metrics", adminAuthMiddleware, admin.getAdminMetrics);
router.post("/admin/reset-metrics", adminAuthMiddleware, admin.postAdminResetMetrics);
router.get("/admin/recent-prints", adminAuthMiddleware, admin.getAdminRecentPrints);
router.post("/admin/refund", adminAuthMiddleware, admin.postAdminRefund);
router.get("/admin/refund-requests", adminAuthMiddleware, admin.getAdminRefundRequests);

module.exports = router;
