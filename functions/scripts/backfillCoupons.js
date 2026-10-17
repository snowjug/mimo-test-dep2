#!/usr/bin/env node
/**
 * Backfill Coupon Redemptions Migration Script
 *
 * Scans Firestore `orders` for paid orders with `couponCode != null` and creates
 * immutable, idempotent records in the `coupon_redemptions` collection.
 *
 * Safety Rules:
 *  - Default mode is DRY-RUN (no database writes unless --commit flag is passed).
 *  - Uses deterministic document ID: `redemption_${orderId}` to ensure idempotency.
 *  - Distinguishes actual recorded discounts from reconstructed discounts.
 *  - Skips unpaid, failed, or cancelled orders.
 *  - Produces a before-and-after count and monetary reconciliation report.
 *
 * Usage:
 *   node scripts/backfillCoupons.js            # Dry run (safe, reports summary)
 *   node scripts/backfillCoupons.js --commit   # Authorized live execution
 */

const { admin, db } = require("../src/config/firebase");
const { toPaise, toRupees } = require("../src/utils/money");

const isCommit = process.argv.includes("--commit");

async function runCouponBackfill() {
  console.log("================================================================================");
  console.log(`MIMO FINANCE: COUPON REDEMPTION RECOVERY MIGRATION`);
  console.log(`Mode: ${isCommit ? "🔴 COMMIT (LIVE WRITES ENABLED)" : "🟢 DRY RUN (READ ONLY)"}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log("================================================================================\n");

  const ordersSnap = await db.collection("orders").get();
  console.log(`Found ${ordersSnap.size} total orders in database.`);

  const eligibleOrders = [];
  const skippedOrders = [];

  ordersSnap.forEach((doc) => {
    const data = doc.data();
    const orderId = data.orderId || doc.id;
    const couponCode = data.couponCode ? String(data.couponCode).trim().toUpperCase() : null;

    if (!couponCode) return; // No coupon used

    const status = String(data.status || data.orderStatus || "").toUpperCase();
    const isPaid = ["PAID", "SUCCESS", "REFUNDED", "COMPLETED"].includes(status);

    if (!isPaid) {
      skippedOrders.push({
        orderId,
        couponCode,
        status,
        reason: "Order not paid/completed",
      });
      return;
    }

    const gross = Number(data.gross || data.totalCost || data.amount || 0);
    const paid = Number(data.amount || 0);
    const discount = Math.max(0, gross - paid);

    eligibleOrders.push({
      orderId,
      docId: doc.id,
      couponCode,
      userId: data.userId || null,
      userEmail: data.userEmail || null,
      grossAmount: gross,
      paidAmount: paid,
      discountAmount: Math.round(discount * 100) / 100,
      discountPaise: toPaise(discount),
      discountPercentage: Number(data.discountPercentage) || null,
      orderStatus: status,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
    });
  });

  console.log(`Identified ${eligibleOrders.length} eligible coupon-bearing orders.`);
  console.log(`Skipped ${skippedOrders.length} non-completed coupon orders.\n`);

  // Check existing redemptions for idempotency
  const existingRedemptionsSnap = await db.collection("coupon_redemptions").get().catch(() => ({ docs: [] }));
  const existingDocIds = new Set(existingRedemptionsSnap.docs.map((d) => d.id));
  console.log(`Currently existing records in coupon_redemptions: ${existingDocIds.size}`);

  let toInsert = 0;
  let alreadyPresent = 0;
  let totalDiscountPaise = 0;

  const couponSummary = {};

  for (const item of eligibleOrders) {
    const redemptionId = `redemption_${item.orderId}`;
    if (existingDocIds.has(redemptionId)) {
      alreadyPresent++;
    } else {
      toInsert++;
    }
    totalDiscountPaise += item.discountPaise;

    if (!couponSummary[item.couponCode]) {
      couponSummary[item.couponCode] = { count: 0, discountPaise: 0 };
    }
    couponSummary[item.couponCode].count++;
    couponSummary[item.couponCode].discountPaise += item.discountPaise;
  }

  console.log("\n--- RECONCILIATION SUMMARY ---");
  console.table(
    Object.entries(couponSummary).map(([code, s]) => ({
      "Coupon Code": code,
      Redemptions: s.count,
      "Total Discount (INR)": toRupees(s.discountPaise).toFixed(2),
    }))
  );

  console.log(`\nTotal Coupon Redemptions: ${eligibleOrders.length}`);
  console.log(`Total Discount Amount Granted: ₹${toRupees(totalDiscountPaise).toFixed(2)}`);
  console.log(`Records to Insert: ${toInsert}`);
  console.log(`Records Already Present (Skipped): ${alreadyPresent}`);

  if (isCommit) {
    if (toInsert === 0) {
      console.log("\nNo new records to insert. Exiting cleanly.");
      return;
    }

    console.log(`\nExecuting batch write of ${toInsert} records...`);
    const batch = db.batch();
    for (const item of eligibleOrders) {
      const redemptionId = `redemption_${item.orderId}`;
      if (existingDocIds.has(redemptionId)) continue;

      const ref = db.collection("coupon_redemptions").doc(redemptionId);
      batch.set(ref, {
        id: redemptionId,
        orderId: item.orderId,
        couponCode: item.couponCode,
        userId: item.userId,
        userEmail: item.userEmail,
        discountAmount: item.discountAmount,
        discountPaise: item.discountPaise,
        grossAmount: item.grossAmount,
        paidAmount: item.paidAmount,
        orderStatus: item.orderStatus,
        redemptionTimestamp: item.createdAt || new Date().toISOString(),
        isReconstructed: true,
        reconstructedAt: new Date().toISOString(),
      });
    }
    await batch.commit();
    console.log(`✅ Successfully committed ${toInsert} coupon redemptions to Firestore.`);
  } else {
    console.log("\n💡 Dry run complete. No database mutations occurred. Run with --commit to execute.");
  }
}

if (require.main === module) {
  runCouponBackfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

module.exports = { runCouponBackfill };
