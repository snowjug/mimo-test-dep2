/**
 * "Krishna Demand Report" — the Finance-only user-growth/conversion report. Read-only, admin-gated.
 * Reuses normalizeOrders (the same orders+payment_transactions merge the rest of Finance relies on) so
 * paid-order totals here can never drift from what Overview/Analytics show for the same period.
 */
const { admin, db } = require("../config/firebase");
const A = require("../services/analytics.service");
const { cachedCollectionGet } = require("../utils/scanCache");

const Timestamp = admin.firestore.Timestamp;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const getAdminUserGrowthReport = async (req, res) => {
  try {
    const range = A.parseRange(req.query);

    const [usersSnap, ordersSnap, txnSnap, jobsSnap] = await Promise.all([
      cachedCollectionGet(db, "users"),
      cachedCollectionGet(db, "orders"),
      cachedCollectionGet(db, "payment_transactions"),
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
    const totalGuestUsers = usersSnap.size - totalRegisteredUsers;

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

    // Derive conversion, AOV, and repeat purchase metrics
    const totalPaidOrders = paidOrders.length;
    const totalPaidVolume = paidOrders.reduce((sum, o) => sum + o.amount, 0);
    const averageOrderValue = totalPaidOrders > 0 ? Math.round((totalPaidVolume / totalPaidOrders) * 100) / 100 : 0;

    const userOrderCounts = new Map();
    paidOrders.forEach((o) => {
      if (o.userId) {
        userOrderCounts.set(o.userId, (userOrderCounts.get(o.userId) || 0) + 1);
      }
    });
    const repeatCustomers = [...userOrderCounts.values()].filter((cnt) => cnt > 1).length;
    const repeatCustomerRatePct = payingUserIds.size > 0
      ? Math.round((repeatCustomers / payingUserIds.size) * 1000) / 10
      : 0;

    const paymentsInRange = paidOrders
      .filter((o) => o.paidAtMs !== null && o.paidAtMs >= range.from && o.paidAtMs < range.to)
      .reduce((sum, o) => sum + o.amount, 0);

    // Launch-relative monthly payments from January 2026 (IST anchor)
    const launchYear = 2026;
    const launchMonth = 0; // Jan
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const totalMonths = Math.max(1, (currentYear - launchYear) * 12 + (currentMonth - launchMonth) + 1);

    const monthlyPayments = [];
    for (let m = 0; m < totalMonths; m++) {
      const dStart = new Date(Date.UTC(launchYear, launchMonth + m, 1));
      const dEnd = new Date(Date.UTC(launchYear, launchMonth + m + 1, 1));
      const monthStart = dStart.getTime();
      const monthEnd = dEnd.getTime();
      const total = paidOrders
        .filter((o) => o.paidAtMs !== null && o.paidAtMs >= monthStart && o.paidAtMs < monthEnd)
        .reduce((sum, o) => sum + o.amount, 0);
      monthlyPayments.push({
        month: `${MONTH_NAMES[dStart.getUTCMonth()]} ${dStart.getUTCFullYear()}`,
        monthKey: `${dStart.getUTCFullYear()}-${String(dStart.getUTCMonth() + 1).padStart(2, "0")}`,
        total: Math.round(total * 100) / 100,
      });
    }

    // Cohort analysis by registration month
    const cohortsMap = new Map();
    realUsers.forEach((u) => {
      const ms = toMs(u.createdAt);
      if (!ms) return;
      const d = new Date(ms);
      const cohortKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!cohortsMap.has(cohortKey)) {
        cohortsMap.set(cohortKey, { cohortKey, userIds: new Set(), size: 0 });
      }
      const c = cohortsMap.get(cohortKey);
      c.userIds.add(u.id);
      c.size += 1;
    });

    const userPaidMonths = new Map();
    paidOrders.forEach((o) => {
      if (!o.userId || !o.paidAtMs) return;
      const d = new Date(o.paidAtMs);
      const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!userPaidMonths.has(o.userId)) userPaidMonths.set(o.userId, new Set());
      userPaidMonths.get(o.userId).add(mKey);
    });

    const cohorts = [...cohortsMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cohortKey, c]) => {
        const [cYear, cMonth] = cohortKey.split("-").map(Number);
        const retention = [];
        for (let offset = 0; offset < 6; offset++) {
          const targetDate = new Date(Date.UTC(cYear, cMonth - 1 + offset, 1));
          const targetKey = `${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, "0")}`;
          let activeCount = 0;
          c.userIds.forEach((uid) => {
            if (userPaidMonths.get(uid)?.has(targetKey)) {
              activeCount += 1;
            }
          });
          const pct = c.size > 0 ? Math.round((activeCount / c.size) * 1000) / 10 : 0;
          retention.push({ offset, activeCount, pct });
        }
        return {
          cohort: cohortKey,
          size: c.size,
          retention,
        };
      });

    res.json({
      range: { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() },
      totalRegisteredUsers,
      totalGuestUsers,
      activeUsersInRange,
      currentMonthNewUsers,
      previousMonthNewUsers,
      growthPct,
      dailyAverageUsers,
      conversionRatePct,
      averageOrderValue,
      repeatCustomerRatePct,
      paymentsInRange: Math.round(paymentsInRange * 100) / 100,
      monthlyPayments,
      cohorts,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[ADMIN-REPORTS] Failed to build user growth report:", err.message || err);
    res.status(500).json({ error: "Could not load the user growth report" });
  }
};

module.exports = { getAdminUserGrowthReport };
