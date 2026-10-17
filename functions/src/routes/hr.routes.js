const express = require("express");
const { hrAuthMiddleware } = require("../middleware/auth");
const { db } = require("../config/firebase");
const { createLimiters } = require("../middleware/rateLimit");
const hr = require("../controllers/hr.controller");

const router = express.Router();
const { loginLimiter } = createLimiters(db);

// Public
router.post("/hr/login", loginLimiter, hr.postHrLogin);

// Authenticated HR
router.get("/hr/me", hrAuthMiddleware, hr.getHrMe);

router.get("/hr/employees", hrAuthMiddleware, hr.getEmployees);
router.post("/hr/employees", hrAuthMiddleware, hr.postEmployee);
router.patch("/hr/employees/:employeeId", hrAuthMiddleware, hr.patchEmployee);
router.patch("/hr/employees/:employeeId/onboarding", hrAuthMiddleware, hr.patchEmployeeOnboarding);

router.get("/hr/attendance", hrAuthMiddleware, hr.getAttendance);
router.post("/hr/attendance", hrAuthMiddleware, hr.postAttendanceBulk);

router.get("/hr/leave-requests", hrAuthMiddleware, hr.getLeaveRequests);
router.post("/hr/leave-requests", hrAuthMiddleware, hr.postLeaveRequest);
router.patch("/hr/leave-requests/:requestId", hrAuthMiddleware, hr.patchLeaveRequest);

router.get("/hr/activity", hrAuthMiddleware, hr.getHrActivity);
router.get("/hr/company-updates", hrAuthMiddleware, hr.getHrCompanyUpdates);

router.patch("/hr/profile", hrAuthMiddleware, hr.patchHrProfile);
router.post("/hr/profile/document/:docType", hrAuthMiddleware, hr.postHrProfileDocument);
router.post("/hr/change-password", hrAuthMiddleware, hr.postHrChangePassword);
router.get("/hr/chat", hrAuthMiddleware, hr.getHrChatMessages);
router.post("/hr/chat", hrAuthMiddleware, hr.postHrChatMessage);

module.exports = router;
