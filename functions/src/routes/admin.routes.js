const express = require("express");
const { adminAuthMiddleware } = require("../middleware/auth");
const admin = require("../controllers/admin.controller");
const insights = require("../controllers/adminInsights.controller");

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
router.get("/admin/users", adminAuthMiddleware, admin.getAdminUsers);
router.get("/admin/analytics", adminAuthMiddleware, insights.getAdminAnalytics);
router.get("/admin/transactions", adminAuthMiddleware, insights.getAdminTransactions);
router.get("/admin/jobs", adminAuthMiddleware, insights.getAdminJobs);
router.get("/admin/kiosks", adminAuthMiddleware, insights.getAdminKiosks);
router.get("/admin/incidents", adminAuthMiddleware, insights.getAdminIncidents);
router.post("/admin/refund", adminAuthMiddleware, admin.postAdminRefund);
router.get("/admin/refund-requests", adminAuthMiddleware, admin.getAdminRefundRequests);

module.exports = router;
