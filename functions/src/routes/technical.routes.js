const express = require("express");
const { technicalAuthMiddleware, technicalLeadOnly } = require("../middleware/auth");
const technical = require("../controllers/technical.controller");

const router = express.Router();

// Public
router.post("/technical/login", technical.postTechnicalLogin);

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

module.exports = router;
