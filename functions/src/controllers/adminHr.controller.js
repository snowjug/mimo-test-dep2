const { db } = require("../config/firebase");

// Read-only aggregation for the Admin Command Center. Admin never writes to HR data directly — HR owns
// that through /hr/*; Admin only observes it, same least-privilege split as the Technical machine-fleet
// endpoint reusing loadKiosks() without a write path.
const sortNewestFirst = (docs, field) => {
  const ms = (v) => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : v ? new Date(v).getTime() : 0);
  return docs.sort((a, b) => ms(b[field]) - ms(a[field]));
};

// ─────────────────────────── GET /admin/employees ───────────────────────────
const getAdminEmployees = async (req, res) => {
  try {
    const snap = await db.collection("employees").limit(500).get();
    const employees = sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt");
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────── GET /admin/hr-overview ───────────────────────────
const getAdminHrOverview = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [employeesSnap, leaveSnap, attendanceSnap] = await Promise.all([
      db.collection("employees").get(),
      db.collection("leave_requests").where("status", "==", "pending").limit(50).get(),
      db.collection("attendance").where("date", "==", today).get(),
    ]);
    const employees = employeesSnap.docs.map((d) => d.data());
    const active = employees.filter((e) => e.status !== "offboarded");

    const byDepartment = {};
    active.forEach((e) => { byDepartment[e.department] = (byDepartment[e.department] || 0) + 1; });

    res.json({
      headcount: active.length,
      byDepartment,
      onboarding: employees.filter((e) => e.status === "onboarding").length,
      offboarded: employees.filter((e) => e.status === "offboarded").length,
      pendingLeaveRequests: leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      attendanceToday: {
        date: today,
        marked: attendanceSnap.size,
        present: attendanceSnap.docs.filter((d) => d.data().status === "present").length,
        onLeave: attendanceSnap.docs.filter((d) => d.data().status === "leave").length,
        absent: attendanceSnap.docs.filter((d) => d.data().status === "absent").length,
        unmarked: Math.max(0, active.length - attendanceSnap.size),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────── GET /admin/company-activity ───────────────────────────
// Same activity_log collection every department writes into (Technical, HR, Marketing); the only
// difference from each department's own /xxx/activity endpoint is that this one has no department filter.
const getAdminCompanyActivity = async (req, res) => {
  try {
    const snap = await db.collection("activity_log").limit(100).get();
    res.json({ activity: sortNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAdminEmployees,
  getAdminHrOverview,
  getAdminCompanyActivity,
};
