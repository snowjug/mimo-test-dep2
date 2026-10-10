/**
 * "Krishna Demand Report" — the Finance-only user-growth/conversion report. Read-only, admin-gated.
 * Reuses normalizeOrders (the same orders+payment_transactions merge the rest of Finance relies on) so
 * paid-order totals here can never drift from what Overview/Analytics show for the same period.
 */
const { admin, db } = require("../config/firebase");
const A = require("../services/analytics.service");

const Timestamp = admin.firestore.Timestamp;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const getAdminUserGrowthReport = async (req, res) => {
  try {
    const range = A.parseRange(req.query);

    const [usersSnap, ordersSnap, txnSnap, jobsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("orders").get(),
      db.collection("payment_transactions").get(),
      db.collection("print_jobs")
        .where("createdAt", ">=", Timestamp.fromMillis(range.from))
        .where("createdAt", "<", Timestamp.fromMillis(range.to))
        .limit(5000)
        .get(),
    ]);

    // Real accounts only — a guest session (see auth.controller.js's postGuestSession) is deliberately
    // excluded from "registered users", same distinction the QR-first flow itself draws.
    const realUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => !u.isGuest);
    const totalRegisteredUsers = realUsers.length;

    const toMs = (v) => (v?.toMillis ? v.toMillis() : v?._seconds ? v._seconds * 1000 : v ? new Date(v).getTime() : null);

    const now = new Date(range.to);
    const startOfThisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const startOfPrevMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const currentMonthNewUsers = realUsers.filter((u) => { const ms = toMs(u.createdAt); return ms !== null && ms >= startOfThisMonth; }).length;
    const previousMonthNewUsers = realUsers.filter((u) => { const ms = toMs(u.createdAt); return ms !== null && ms >= startOfPrevMonth && ms < startOfThisMonth; }).length;
    const growthPct = previousMonthNewUsers > 0
      ? Math.round(((currentMonthNewUsers - previousMonthNewUsers) / previousMonthNewUsers) * 1000) / 10
      : (currentMonthNewUsers > 0 ? 100 : 0);

    // Active = printed at least once in the selected range.
    const activeUserIds = new Set();
    jobsSnap.forEach((d) => { const uid = d.data().userId; if (uid) activeUserIds.add(uid); });
    const activeUsersInRange = activeUserIds.size;
    const rangeDays = Math.max(1, Math.round((range.to - range.from) / 86400000));
    const dailyAverageUsers = Math.round((activeUsersInRange / rangeDays) * 10) / 10;

    // Merge orders + payment_transactions once (same helper the admin revenue dashboard relies on), then
    // derive both "paid at least once, ever" (conversion) and per-period/per-month totals from it.
    const merged = A.normalizeOrders(
      ordersSnap.docs.map((d) => d.data()),
      txnSnap.docs.map((d) => d.data())
    );
    const paidOrders = merged.filter((o) => o.status === "PAID");

    const payingUserIds = new Set(paidOrders.filter((o) => o.userId).map((o) => o.userId));
    const conversionRatePct = totalRegisteredUsers > 0
      ? Math.round((payingUserIds.size / totalRegisteredUsers) * 1000) / 10
      : 0;

    const paymentsInRange = paidOrders
      .filter((o) => o.paidAtMs !== null && o.paidAtMs >= range.from && o.paidAtMs < range.to)
      .reduce((sum, o) => sum + o.amount, 0);

    // Fixed trailing 6-month view (independent of the selected range) — this is what answers "August and
    // September" regardless of whatever date filter is currently active.
    const monthlyPayments = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1);
      const total = paidOrders
        .filter((o) => o.paidAtMs !== null && o.paidAtMs >= monthStart && o.paidAtMs < monthEnd)
        .reduce((sum, o) => sum + o.amount, 0);
      const d = new Date(monthStart);
      monthlyPayments.push({ month: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`, total: Math.round(total * 100) / 100 });
    }

    res.json({
      range: { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() },
      totalRegisteredUsers,
      activeUsersInRange,
      currentMonthNewUsers,
      previousMonthNewUsers,
      growthPct,
      dailyAverageUsers,
      conversionRatePct,
      paymentsInRange: Math.round(paymentsInRange * 100) / 100,
      monthlyPayments,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[ADMIN-REPORTS] Failed to build user growth report:", err.message || err);
    res.status(500).json({ error: "Could not load the user growth report" });
  }
};

module.exports = { getAdminUserGrowthReport };
