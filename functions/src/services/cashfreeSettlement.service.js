const axios = require("axios");
const { toPaise, toRupees, sumPaise } = require("../utils/money");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const DEFAULT_MBIS_SHEET_ID = "1QHfXru9IrOXWp0x8QVWTgA7WnCGe7rMlwjO-HdWjuds";
const CASHFREE_API_VERSION = "2023-08-01";
const CASHFREE_SETTLEMENTS_URL = "https://api.cashfree.com/pg/settlements";

/**
 * Normalizes status strings from Cashfree or spreadsheet rows.
 */
function classifySettlementStatus(rawStatus, amountSettled, remarks = "") {
  const norm = String(rawStatus || "UNKNOWN").toUpperCase().trim();
  const rem = String(remarks || "").trim();

  if (norm.includes("PAID") || norm.includes("SETTLED") || norm.includes("SUCCESS")) {
    if (amountSettled > 0) return "Settled";
    if (rem.toLowerCase().includes("insufficient")) return "Skipped";
    return "Pending Settlement";
  }
  if (norm.includes("FAILED")) return "Failed";
  if (norm.includes("CANCEL")) return "Cancelled";
  if (norm.includes("REFUND")) return "Refunded";
  return norm;
}

function calculateSettlementHealth(paymentAmount, amountSettled) {
  if (paymentAmount <= 0) return "Healthy";
  const ratio = amountSettled / paymentAmount;
  if (ratio >= 0.98 && amountSettled > 0) return "Excellent";
  if (ratio >= 0.90) return "Healthy";
  if (amountSettled > 0) return "Partial";
  return "Unsettled";
}

/**
 * Normalizes date string into YYYY-MM-DD and epoch ms (Asia/Kolkata timezone).
 */
function parseDateAndTimestamp(rawDate) {
  if (!rawDate) {
    const now = new Date();
    return {
      dateStr: now.toISOString().slice(0, 10),
      timeMs: now.getTime(),
    };
  }

  const str = String(rawDate).trim();
  let timeMs = Date.parse(str);
  let dateStr = str.slice(0, 10);

  if (!Number.isNaN(timeMs)) {
    // If string has date format like YYYY-MM-DDTHH:mm:ss+05:30
    const d = new Date(timeMs);
    dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    // Exact YYYY-MM-DD (treat as start of IST day: UTC - 5h30m)
    const [y, m, d] = str.split("-").map(Number);
    timeMs = Date.UTC(y, m - 1, d, 0, 0, 0) - (330 * 60 * 1000);
    dateStr = str;
  } else {
    const now = new Date();
    timeMs = now.getTime();
    dateStr = now.toISOString().slice(0, 10);
  }

  return { dateStr, timeMs };
}

/**
 * Normalizes a raw settlement object into canonical schema with exact integer paise.
 */
function normalizeSettlementItem(item, source = "cashfree_api") {
  const cfSettlementId = String(item.cf_settlement_id || item.settlement_id || item.cfSettlementId || "").trim();
  const settlementUtr = String(item.settlement_utr || item.utr || item.settlementUtr || "").trim();
  const orderId = String(item.order_id || item.orderId || "N/A").trim();
  const cfOrderId = String(item.cf_order_id || item.cfOrderId || "N/A").trim();

  const { dateStr, timeMs } = parseDateAndTimestamp(item.settlement_date || item.settlementDate || item.date);

  const paymentAmount = Number(item.payment_amount !== undefined ? item.payment_amount : item.paymentAmount) || 0;
  const amountSettled = Number(item.amount_settled !== undefined ? item.amount_settled : item.amountSettled) || 0;
  const serviceCharge = Number(item.service_charge !== undefined ? item.service_charge : item.serviceCharge) || 0;
  const serviceTax = Number(item.service_tax !== undefined ? item.service_tax : item.serviceTax) || 0;
  const adjustment = Number(item.adjustment !== undefined ? item.adjustment : 0) || 0;

  const rawStatus = String(item.status || item.raw_status || "UNKNOWN").toUpperCase().trim();
  const remarks = String(item.remarks || "").trim();

  const settlementStatus = classifySettlementStatus(rawStatus, amountSettled, remarks);
  const health = calculateSettlementHealth(paymentAmount, amountSettled);

  return {
    cfSettlementId,
    settlementId: cfSettlementId,
    settlementUtr,
    utr: settlementUtr,
    orderId,
    cfOrderId,
    settlementDate: dateStr,
    settlementTimeMs: timeMs,
    monthKey: dateStr.slice(0, 7),
    paymentAmount: toRupees(toPaise(paymentAmount)),
    paymentPaise: toPaise(paymentAmount),
    amountSettled: toRupees(toPaise(amountSettled)),
    settledPaise: toPaise(amountSettled),
    settlementAmount: toRupees(toPaise(amountSettled)), // alias for backward compatibility
    serviceCharge: toRupees(toPaise(serviceCharge)),
    serviceChargePaise: toPaise(serviceCharge),
    serviceTax: toRupees(toPaise(serviceTax)),
    serviceTaxPaise: toPaise(serviceTax),
    adjustment: toRupees(toPaise(adjustment)),
    adjustmentPaise: toPaise(adjustment),
    rawStatus,
    settlementStatus,
    reconciledStatus: settlementStatus === "Settled" ? "RECONCILED" : "PENDING_SETTLEMENT",
    remarks: remarks || (settlementStatus === "Settled" ? "Settlement processed successfully." : "N/A"),
    health,
    source,
  };
}

/**
 * Fetches settlements directly from the Cashfree REST API.
 */
async function fetchSettlementsFromCashfree({
  clientId,
  clientSecret,
  startDate = "2024-01-01",
  endDate,
  httpPost = axios.post,
} = {}) {
  if (!clientId || !clientSecret) {
    throw new Error("Cashfree API credentials (CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET) missing.");
  }

  const startDt = new Date(startDate.slice(0, 10));
  const endDt = endDate ? new Date(endDate.slice(0, 10)) : new Date();
  const allSettlements = [];

  let currentStart = startDt;
  const headers = {
    "Content-Type": "application/json",
    "x-api-version": CASHFREE_API_VERSION,
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
  };

  while (currentStart <= endDt) {
    const currentEnd = new Date(Math.min(currentStart.getTime() + 300 * 86400000, endDt.getTime()));
    const startIso = currentStart.toISOString().slice(0, 10) + "T00:00:00Z";
    const endIso = currentEnd.toISOString().slice(0, 10) + "T23:59:59Z";

    let cursor = null;
    while (true) {
      const body = {
        product: "PG",
        pagination: { limit: 1000 },
        filters: {
          start_date: startIso,
          end_date: endIso,
        },
      };
      if (cursor) body.pagination.cursor = cursor;

      const res = await httpPost(CASHFREE_SETTLEMENTS_URL, body, { headers, timeout: 30000 });
      if (res.status !== 200) {
        throw new Error(`Cashfree API Error ${res.status}: ${JSON.stringify(res.data)}`);
      }

      const items = res.data?.data || [];
      allSettlements.push(...items);

      cursor = res.data?.cursor;
      if (!cursor || items.length === 0) break;
    }

    currentStart = new Date(currentEnd.getTime() + 86400000);
  }

  return allSettlements;
}

/**
 * Fetches settlements from the MBIS Google Sheet (tab 'Settlements' gid=0).
 */
async function fetchSettlementsFromGoogleSheet({
  sheetId = DEFAULT_MBIS_SHEET_ID,
  httpGet = axios.get,
} = {}) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;
  const res = await httpGet(url, { timeout: 15000 });
  const rawText = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  const jsonStr = rawText
    .replace(/^[/*\sO_o]+google\.visualization\.Query\.setResponse\(/, "")
    .replace(/\);?\s*$/, "");
  const parsed = JSON.parse(jsonStr);

  const rows = parsed.table?.rows || [];
  const items = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    if (!r || !r.c) continue;
    const c = r.c;

    const dateVal = c[0] ? (c[0].f || c[0].v) : null;
    const cfSettlementId = c[1] ? (c[1].f || c[1].v) : null;
    if (!cfSettlementId || !dateVal || String(dateVal).toLowerCase() === "date") continue;

    items.push({
      date: String(dateVal).trim(),
      cf_settlement_id: String(cfSettlementId).trim(),
      settlement_utr: c[2] ? (c[2].f || c[2].v) : "",
      order_id: c[3] ? (c[3].f || c[3].v) : "N/A",
      cf_order_id: c[4] ? (c[4].f || c[4].v) : "N/A",
      payment_amount: c[5]?.v !== undefined ? Number(c[5].v) : 0,
      amount_settled: c[6]?.v !== undefined ? Number(c[6].v) : 0,
      service_charge: c[7]?.v !== undefined ? Number(c[7].v) : 0,
      service_tax: c[8]?.v !== undefined ? Number(c[8].v) : 0,
      adjustment: c[9]?.v !== undefined ? Number(c[9].v) : 0,
      status: c[10] ? (c[10].f || c[10].v) : "PAID",
      remarks: c[12] ? (c[12].f || c[12].v) : "",
    });
  }

  return items;
}

/**
 * Main ingestion & reconciliation pipeline.
 * Pulls from Cashfree API (or Google Sheets fallback), deduplicates,
 * validates, computes monetary sums in paise, and writes to Firestore.
 */
async function syncCashfreeSettlements({
  db,
  dryRun = false,
  preferApi = true,
  clientId = process.env.CASHFREE_CLIENT_ID,
  clientSecret = process.env.CASHFREE_CLIENT_SECRET,
  sheetId = DEFAULT_MBIS_SHEET_ID,
  httpPost = axios.post,
  httpGet = axios.get,
} = {}) {
  const syncStartTime = Date.now();
  let rawItems = [];
  let source = "cashfree_api";
  let syncSourceWarning = null;

  // 1. Try Cashfree API first if preferred and credentials present
  if (preferApi && clientId && clientSecret) {
    try {
      rawItems = await fetchSettlementsFromCashfree({ clientId, clientSecret, httpPost });
    } catch (apiErr) {
      console.warn("[SETTLEMENT-SYNC] Cashfree API fetch failed, falling back to MBIS Google Sheet:", apiErr.message);
      syncSourceWarning = `Cashfree API returned error (${apiErr.message}). Ingested from MBIS Google Sheet fallback.`;
      source = "mbis_google_sheet";
      rawItems = await fetchSettlementsFromGoogleSheet({ sheetId, httpGet });
    }
  } else {
    source = "mbis_google_sheet";
    rawItems = await fetchSettlementsFromGoogleSheet({ sheetId, httpGet });
  }

  const rowsDiscovered = rawItems.length;
  const duplicatesDetected = [];
  const normalizedMap = new Map();

  // 2. Strict in-memory deduplication and normalization
  for (const raw of rawItems) {
    const item = normalizeSettlementItem(raw, source);
    if (!item.cfSettlementId) continue;

    if (normalizedMap.has(item.cfSettlementId)) {
      duplicatesDetected.push({
        cfSettlementId: item.cfSettlementId,
        date: item.settlementDate,
        amountSettled: item.amountSettled,
      });
      // Skip redundant duplicate append
      continue;
    }
    normalizedMap.set(item.cfSettlementId, item);
  }

  const uniqueSettlements = [...normalizedMap.values()];
  const rowsAccepted = uniqueSettlements.length;

  // 3. Compute aggregate totals in integer paise
  let totalPaymentPaise = 0;
  let totalSettledPaise = 0;
  let totalServiceChargePaise = 0;
  let totalServiceTaxPaise = 0;
  let totalAdjustmentPaise = 0;

  const monthlyTotals = {};

  for (const s of uniqueSettlements) {
    totalPaymentPaise += s.paymentPaise;
    totalSettledPaise += s.settledPaise;
    totalServiceChargePaise += s.serviceChargePaise;
    totalServiceTaxPaise += s.serviceTaxPaise;
    totalAdjustmentPaise += s.adjustmentPaise;

    const mKey = s.monthKey;
    if (!monthlyTotals[mKey]) {
      monthlyTotals[mKey] = {
        month: mKey,
        count: 0,
        paymentAmount: 0,
        amountSettled: 0,
        serviceCharge: 0,
        serviceTax: 0,
        adjustment: 0,
      };
    }
    monthlyTotals[mKey].count += 1;
    monthlyTotals[mKey].paymentAmount = toRupees(toPaise(monthlyTotals[mKey].paymentAmount) + s.paymentPaise);
    monthlyTotals[mKey].amountSettled = toRupees(toPaise(monthlyTotals[mKey].amountSettled) + s.settledPaise);
    monthlyTotals[mKey].serviceCharge = toRupees(toPaise(monthlyTotals[mKey].serviceCharge) + s.serviceChargePaise);
    monthlyTotals[mKey].serviceTax = toRupees(toPaise(monthlyTotals[mKey].serviceTax) + s.serviceTaxPaise);
    monthlyTotals[mKey].adjustment = toRupees(toPaise(monthlyTotals[mKey].adjustment) + s.adjustmentPaise);
  }

  // 4. Batch persistence to Firestore (if db provided and not dry-run)
  let rowsUpdated = 0;
  if (db && !dryRun) {
    const coll = db.collection("cashfree_settlements");
    const BATCH_SIZE = 450;
    for (let i = 0; i < uniqueSettlements.length; i += BATCH_SIZE) {
      const chunk = uniqueSettlements.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const item of chunk) {
        const docRef = coll.doc(`cf_${item.cfSettlementId}`);
        batch.set(docRef, { ...item, syncedAt: new Date().toISOString() }, { merge: true });
        rowsUpdated++;
      }
      await batch.commit();
    }

    // Record sync run in audit collection
    try {
      await db.collection("financial_import_runs").add({
        type: "cashfree_settlements_sync",
        source,
        rowsDiscovered,
        rowsAccepted,
        rowsUpdated,
        duplicatesDetectedCount: duplicatesDetected.length,
        totalPaymentAmount: toRupees(totalPaymentPaise),
        totalSettledAmount: toRupees(totalSettledPaise),
        totalFees: toRupees(totalServiceChargePaise + totalServiceTaxPaise),
        totalAdjustments: toRupees(totalAdjustmentPaise),
        durationMs: Date.now() - syncStartTime,
        createdAt: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn("[SETTLEMENT-SYNC] Could not write financial_import_runs log:", auditErr.message);
    }
  }

  return {
    success: true,
    dryRun,
    source,
    warning: syncSourceWarning,
    durationMs: Date.now() - syncStartTime,
    auditSummary: {
      rowsDiscovered,
      rowsAccepted,
      rowsUpdated: dryRun ? 0 : rowsUpdated,
      rowsSkipped: rowsDiscovered - rowsAccepted,
      duplicatesDetected: duplicatesDetected.length,
      duplicates: duplicatesDetected,
    },
    financialTotals: {
      totalPaymentAmount: toRupees(totalPaymentPaise),
      totalSettledAmount: toRupees(totalSettledPaise),
      totalServiceCharges: toRupees(totalServiceChargePaise),
      totalServiceTax: toRupees(totalServiceTaxPaise),
      totalPlatformFriction: toRupees(totalServiceChargePaise + totalServiceTaxPaise),
      totalAdjustments: toRupees(totalAdjustmentPaise),
      settlementRatePercent: totalPaymentPaise > 0 ? round2((totalSettledPaise / totalPaymentPaise) * 100) : 0,
    },
    monthlyBreakdown: monthlyTotals,
    reconciledStatus: duplicatesDetected.length === 0 ? "PERFECT_RECONCILIATION" : "DUPLICATES_ISOLATED_AND_RECONCILED",
  };
}

/**
 * Retrieves paginated settlement records from Firestore.
 */
async function getSettlementsList(db, { limit = 50, offset = 0, status, monthKey } = {}) {
  if (!db) return { records: [], total: 0 };
  let query = db.collection("cashfree_settlements").orderBy("settlementTimeMs", "desc");

  if (monthKey) {
    query = query.where("monthKey", "==", monthKey);
  }
  if (status) {
    query = query.where("settlementStatus", "==", status);
  }

  const snap = await query.limit(limit + offset).get();
  const allDocs = snap.docs.map((d) => d.data());
  const paged = allDocs.slice(offset, offset + limit);

  return {
    records: paged,
    total: allDocs.length,
    offset,
    limit,
  };
}

module.exports = {
  normalizeSettlementItem,
  classifySettlementStatus,
  calculateSettlementHealth,
  parseDateAndTimestamp,
  fetchSettlementsFromCashfree,
  fetchSettlementsFromGoogleSheet,
  syncCashfreeSettlements,
  getSettlementsList,
  DEFAULT_MBIS_SHEET_ID,
};
