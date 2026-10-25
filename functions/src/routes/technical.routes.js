const express = require("express");
const { technicalAuthMiddleware, technicalLeadOnly } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const technical = require("../controllers/technical.controller");

const router = express.Router();
const { loginLimiter } = createLimiters(db);

// Public
router.post("/technical/login", loginLimiter, technical.postTechnicalLogin);

// Authenticated technical-team member
router.get("/technical/me", technicalAuthMiddleware, technical.getTechnicalMe);
router.get("/technical/team", technicalAuthMiddleware, technical.getTechnicalTeam);

router.get("/technical/tasks", technicalAuthMiddleware, technical.getTechnicalTasks);
router.post("/technical/tasks", technicalAuthMiddleware, technicalLeadOnly, technical.postTechnicalTask);
router.patch("/technical/tasks/:taskId", technicalAuthMiddleware, technical.patchTechnicalTask);
router.post("/technical/tasks/:taskId/comments", technicalAuthMiddleware, technical.postTechnicalTaskComment);

router.get("/technical/announcements", technicalAuthMiddleware, technical.getTechnicalAnnouncements);
router.post("/technical/announcements", technicalAuthMiddleware, technicalLeadOnly, technical.postTechnicalAnnouncement);

router.get("/technical/activity", technicalAuthMiddleware, technical.getTechnicalActivity);

router.get("/technical/machines", technicalAuthMiddleware, technical.getTechnicalMachines);

router.post("/technical/work-sessions/start", technicalAuthMiddleware, technical.postWorkSessionStart);
router.post("/technical/work-sessions/pause", technicalAuthMiddleware, technical.postWorkSessionPause);
router.post("/technical/work-sessions/resume", technicalAuthMiddleware, technical.postWorkSessionResume);
router.post("/technical/work-sessions/end", technicalAuthMiddleware, technical.postWorkSessionEnd);
router.get("/technical/work-sessions/today", technicalAuthMiddleware, technical.getWorkSessionToday);

router.post("/technical/daily-reports", technicalAuthMiddleware, technical.postDailyReport);
router.get("/technical/daily-reports", technicalAuthMiddleware, technical.getDailyReports);

router.patch("/technical/profile", technicalAuthMiddleware, technical.patchTechnicalProfile);
router.post("/technical/profile/document/:docType", technicalAuthMiddleware, technical.postTechnicalProfileDocument);
router.post("/technical/change-password", technicalAuthMiddleware, technical.postTechnicalChangePassword);
router.get("/technical/chat", technicalAuthMiddleware, technical.getTechnicalChatMessages);
router.post("/technical/chat", technicalAuthMiddleware, technical.postTechnicalChatMessage);

const tools = require("../controllers/technicalTools.controller");

// ================= 11 TECHNICAL TASKS TOOL MODULES =================
// Task 1: Failure Analytics
router.get("/technical/analytics/failures", technicalAuthMiddleware, tools.getFailureAnalytics);

// Task 2: Customer Usage Analytics
router.get("/technical/analytics/customer-usage", technicalAuthMiddleware, tools.getCustomerUsageAnalytics);

// Task 3: Maintenance Ticket System
router.get("/technical/maintenance-tickets", technicalAuthMiddleware, tools.getMaintenanceTickets);
router.post("/technical/maintenance-tickets", technicalAuthMiddleware, tools.postMaintenanceTicket);
router.patch("/technical/maintenance-tickets/:id", technicalAuthMiddleware, tools.patchMaintenanceTicket);

// Task 4: Print-Demand Heatmap
router.get("/technical/analytics/demand-heatmap", technicalAuthMiddleware, tools.getPrintDemandHeatmap);

// Task 5: Location Profitability
router.get("/technical/analytics/location-profitability", technicalAuthMiddleware, tools.getLocationProfitability);

// Task 6: Solving Printing Errors
router.get("/technical/printer/diagnostics", technicalAuthMiddleware, tools.getPrinterDiagnostics);
router.post("/technical/printer/recover", technicalAuthMiddleware, tools.postPrinterRecover);

// Task 7: Automatic Low-Paper Alerts & Refill
router.get("/technical/paper/status", technicalAuthMiddleware, tools.getPaperStatus);
router.post("/technical/paper/refill", technicalAuthMiddleware, tools.postPaperRefill);

// Task 8: Peak-Hour Analytics
router.get("/technical/analytics/peak-hours", technicalAuthMiddleware, tools.getPeakHourAnalytics);

// Task 9: Machine Profitability
router.get("/technical/analytics/machine-profitability", technicalAuthMiddleware, tools.getMachineProfitability);

// Task 10: Revenue Analytics
router.get("/technical/analytics/revenue-analytics", technicalAuthMiddleware, tools.getRevenueAnalytics);

// Task 11: Fleet Simulator
router.post("/technical/fleet/simulate", technicalAuthMiddleware, tools.postFleetSimulate);

module.exports = router;

