const express = require("express");
const { hrAuthMiddleware } = require("../middleware/auth");
const hr = require("../controllers/hr.controller");

const router = express.Router();

// Public
router.post("/hr/login", hr.postHrLogin);

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

module.exports = router;
