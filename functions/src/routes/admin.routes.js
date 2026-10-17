const express = require("express");
const { adminAuthMiddleware, staffAuthMiddleware, financeOrAdminAuthMiddleware } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const admin = require("../controllers/admin.controller");
const insights = require("../controllers/adminInsights.controller");
const kioskCommands = require("../controllers/kioskCommands.controller");
const adminHr = require("../controllers/adminHr.controller");
const adminReports = require("../controllers/adminReports.controller");
const adminGang = require("../controllers/adminGang.controller");
const ads = require("../controllers/ads.controller");
const tools = require("../controllers/technicalTools.controller");

const router = express.Router();
const { loginLimiter } = createLimiters(db);

router.post("/admin/login", loginLimiter, admin.postAdminLogin);
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
router.get("/admin/users", financeOrAdminAuthMiddleware, admin.getAdminUsers);
router.get("/admin/analytics", financeOrAdminAuthMiddleware, insights.getAdminAnalytics);
router.get("/admin/analytics/monthly-summary", financeOrAdminAuthMiddleware, insights.getAdminMonthlySummary);

// Executive, Financial & Fleet Intelligence Reports (Finance & Admin)
router.get("/admin/analytics/location-profitability", financeOrAdminAuthMiddleware, tools.getLocationProfitability);
router.get("/admin/analytics/machine-profitability", financeOrAdminAuthMiddleware, tools.getMachineProfitability);
router.post("/admin/analytics/fleet-simulate", financeOrAdminAuthMiddleware, tools.postFleetSimulate);
router.get("/admin/analytics/failures", financeOrAdminAuthMiddleware, tools.getFailureAnalytics);
router.get("/admin/analytics/customer-usage", financeOrAdminAuthMiddleware, tools.getCustomerUsageAnalytics);
router.get("/admin/analytics/demand-heatmap", financeOrAdminAuthMiddleware, tools.getPrintDemandHeatmap);
router.get("/admin/analytics/peak-hours", financeOrAdminAuthMiddleware, tools.getPeakHourAnalytics);
router.get("/admin/analytics/revenue-analytics", financeOrAdminAuthMiddleware, tools.getRevenueAnalytics);

router.get("/admin/transactions", financeOrAdminAuthMiddleware, insights.getAdminTransactions);
router.get("/admin/jobs", adminAuthMiddleware, insights.getAdminJobs);
router.get("/admin/kiosks", adminAuthMiddleware, insights.getAdminKiosks);
router.post("/admin/kiosks/:kioskId/restart", adminAuthMiddleware, kioskCommands.postAdminKioskRestart);
router.post("/admin/kiosks/:kioskId/refill-paper", adminAuthMiddleware, kioskCommands.postAdminRefillPaper);
router.post("/admin/kiosks/:kioskId/verify", adminAuthMiddleware, kioskCommands.postAdminKioskVerify);
router.get("/admin/incidents", adminAuthMiddleware, insights.getAdminIncidents);
router.get("/admin/finance-sheet", financeOrAdminAuthMiddleware, insights.getAdminFinanceSheetData);
router.get("/admin/issues", adminAuthMiddleware, insights.getAdminIssues);
router.post("/admin/refund", financeOrAdminAuthMiddleware, admin.postAdminRefund);
router.post("/admin/refund/bulk", financeOrAdminAuthMiddleware, admin.postAdminBulkRefund);
router.get("/admin/refund-requests", financeOrAdminAuthMiddleware, admin.getAdminRefundRequests);
router.get("/admin/financial-audit-logs", financeOrAdminAuthMiddleware, admin.getAdminFinancialAuditLogs);
router.get("/admin/coupons/analytics", financeOrAdminAuthMiddleware, admin.getAdminCouponsAnalytics);
router.get("/admin/expenses", financeOrAdminAuthMiddleware, admin.getAdminExpenses);
router.post("/admin/expenses", financeOrAdminAuthMiddleware, admin.postAdminExpense);
router.patch("/admin/expenses/:id", financeOrAdminAuthMiddleware, admin.patchAdminExpense);
router.delete("/admin/expenses/:id", financeOrAdminAuthMiddleware, admin.deleteAdminExpense);
router.get("/admin/settlements/reconciliation", financeOrAdminAuthMiddleware, insights.getAdminSettlementsReconciliation);
router.post("/admin/settlements/sync", financeOrAdminAuthMiddleware, insights.postAdminSyncSettlements);
router.get("/admin/settlements", financeOrAdminAuthMiddleware, insights.getAdminSettlements);

router.get("/admin/employees", adminAuthMiddleware, adminHr.getAdminEmployees);
router.get("/admin/hr-overview", adminAuthMiddleware, adminHr.getAdminHrOverview);
router.get("/admin/company-activity", adminAuthMiddleware, adminHr.getAdminCompanyActivity);
router.get("/admin/user-growth-report", financeOrAdminAuthMiddleware, adminReports.getAdminUserGrowthReport);

// MIMO GANG — unified Technical/HR/Marketing view, admin-editable
router.get("/admin/gang/login-streaks", adminAuthMiddleware, adminGang.getLoginStreaks);
router.get("/admin/gang/technical-tasks", adminAuthMiddleware, adminGang.getAdminTechnicalTasks);
router.post("/admin/gang/technical-tasks", adminAuthMiddleware, adminGang.postAdminTechnicalTask);
router.patch("/admin/gang/technical-tasks/:taskId", adminAuthMiddleware, adminGang.patchAdminTechnicalTask);
router.get("/admin/gang/marketing-tasks", adminAuthMiddleware, adminGang.getAdminMarketingTasks);
router.post("/admin/gang/marketing-tasks", adminAuthMiddleware, adminGang.postAdminMarketingTask);
router.patch("/admin/gang/marketing-tasks/:taskId", adminAuthMiddleware, adminGang.patchAdminMarketingTask);
router.patch("/admin/gang/employees/:employeeId", adminAuthMiddleware, adminGang.patchAdminEmployee);
router.patch("/admin/gang/employees/:employeeId/onboarding", adminAuthMiddleware, adminGang.patchAdminEmployeeOnboarding);
router.patch("/admin/gang/leave-requests/:requestId", adminAuthMiddleware, adminGang.patchAdminLeaveRequest);

// ── AD / ANNOUNCEMENT MANAGEMENT ─────────────────────────────────────────
router.get("/admin/ads", adminAuthMiddleware, ads.getAdminAds);
router.post("/admin/ads", adminAuthMiddleware, ads.postAdminAd);
router.post("/admin/ads/upload-image", adminAuthMiddleware, ads.postAdminAdImage);
router.post("/admin/ads/reorder", adminAuthMiddleware, ads.postAdminAdsReorder);
router.patch("/admin/ads/:adId", adminAuthMiddleware, ads.patchAdminAd);
router.delete("/admin/ads/:adId", adminAuthMiddleware, ads.deleteAdminAd);

// Shared role-level profile/chat for Admin and Finance (both use a single shared login per role, not
// individual accounts -- see admin.controller.js's env-var-based postAdminLogin).
router.get("/staff/profile", staffAuthMiddleware, admin.getStaffProfile);
router.patch("/staff/profile", staffAuthMiddleware, admin.patchStaffProfile);
router.post("/staff/profile/document/:docType", staffAuthMiddleware, admin.postStaffProfileDocument);
router.get("/staff/chat", staffAuthMiddleware, admin.getStaffChatMessages);
router.post("/staff/chat", staffAuthMiddleware, admin.postStaffChatMessage);

module.exports = router;
