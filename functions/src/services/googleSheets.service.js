const axios = require("axios");

const DEFAULT_SHEET_ID = "18ZDXG0nQZ6z7kUx7lShOFyOQ9gNOq2nc3iXfrYLrlfI";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const GIDS = {
  JOURNAL: "0",
  EXPENSES_2025: "2119576488",
  EXPENSES_2026: "1130673006",
  INFORMATION: "1998883120",
  PSR: "1895235794",
};

const MONTH_MAP = {
  JANUARY: "01",
  FEBRUARY: "02",
  MARCH: "03",
  APRIL: "04",
  MAY: "05",
  JUNE: "06",
  JULY: "07",
  AUGUST: "08",
  SEPTEMBER: "09",
  OCTOBER: "10",
  NOVEMBER: "11",
  DECEMBER: "12",
};

let sheetCache = {
  data: null,
  lastSyncedAt: null,
  cachedAt: 0,
  syncError: null,
};

/**
 * Resets or overrides cache (used in unit tests).
 */
function resetSheetCache(initialState = null) {
  sheetCache = initialState || {
    data: null,
    lastSyncedAt: null,
    cachedAt: 0,
    syncError: null,
  };
}

/**
 * Helper to parse GViz JSON response from Google Sheets.
 */
function parseGvizResponse(rawText) {
  if (typeof rawText !== "string") return null;
  const jsonStr = rawText
    .replace(/^[/*\sO_o]+google\.visualization\.Query\.setResponse\(/, "")
    .replace(/\);?\s*$/, "");
  return JSON.parse(jsonStr);
}

/**
 * Formats a number cleanly to 2 decimal places.
 */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseDayNumber(raw) {
  if (!raw) return "01";
  const m = String(raw).match(/\d+/);
  return m ? m[0].padStart(2, "0") : "01";
}

/**
 * Parses itemized monthly expenses from 2025 / 2026 expense report tabs.
 */
function parseExpenseRows(rows, year) {
  let curMonth = year === 2025 ? "MARCH" : "JANUARY";
  const items = [];

  (rows || []).forEach((r, idx) => {
    const c = r?.c || [];
    const colA = c[0] ? (c[0].f || c[0].v) : null;
    const colB = c[1] ? (c[1].f || c[1].v) : null;
    const colC = c[2] ? (c[2].v !== undefined ? Number(c[2].v) : null) : null;
    const colD = c[3] ? (c[3].f || c[3].v) : null;

    if (colA && MONTH_MAP[String(colA).trim().toUpperCase()]) {
      curMonth = String(colA).trim().toUpperCase();
    }

    if (
      curMonth !== "SUMMARY" &&
      colB &&
      colB !== "Category" &&
      colB !== "Total" &&
      colC !== null &&
      !isNaN(colC) &&
      colC > 0
    ) {
      const monthNum = MONTH_MAP[curMonth] || "01";
      const dayNum = parseDayNumber(colA);
      const isoDate = `${year}-${monthNum}-${dayNum}`;
      items.push({
        id: `exp-${year}-${idx}`,
        date: isoDate,
        type: "expense",
        category: String(colB).trim(),
        description: `${String(colB).trim()} (${colD ? `Paid by ${colD}` : "Expense"})`,
        amount: round2(colC),
        paidBy: colD ? String(colD).trim() : "Company",
        reference: `EXP-${year}-${idx}`,
        year,
        monthKey: `${year}-${monthNum}`,
        monthName: curMonth,
        status: "approved",
      });
    }
  });

  return items;
}

/**
 * Parses PSR founder investment and profit sharing ratios.
 */
function parsePsrTable(rows) {
  const founders = [];
  (rows || []).slice(0, 2).forEach((r) => {
    const c = r?.c || [];
    const name = c[0]?.v ? String(c[0].v).trim() : null;
    const totalInv = c[1]?.v !== undefined ? Number(c[1].v) : null;
    const netInv = c[3]?.v !== undefined ? Number(c[3].v) : null;
    const ownershipPct = c[4]?.v !== undefined ? Number(c[4].v) : null;
    const profitSharePct = c[5]?.v !== undefined ? Number(c[5].v) : null;

    if (name && totalInv !== null) {
      founders.push({
        name,
        totalInvestment: round2(totalInv),
        netInvestment: round2(netInv || totalInv),
        ownershipPct: round2((ownershipPct || 0) * 100),
        profitSharePct: round2((profitSharePct || 0) * 100),
      });
    }
  });

  const totalRow = rows?.[2]?.c || [];
  const totalInvestment = totalRow[3]?.v !== undefined ? round2(Number(totalRow[3].v)) : 212291;

  return {
    founders,
    totalInvestment,
  };
}

/**
 * Parses double-entry accounting transactions from the Journal Entries tab.
 */
function parseJournalTable(rows) {
  const transactions = [];
  let pendingTx = null;

  (rows || []).forEach((r, idx) => {
    const c = r?.c || [];
    const dateStr = c[0] ? (c[0].f || c[0].v) : null;
    const particular = c[1] ? (c[1].f || c[1].v) : null;
    const debit = c[3] ? (c[3].v !== undefined ? Number(c[3].v) : null) : null;
    const credit = c[4] ? (c[4].v !== undefined ? Number(c[4].v) : null) : null;

    if (particular === "Grand Total") return;

    if (dateStr && String(dateStr).trim()) {
      if (pendingTx) transactions.push(pendingTx);
      pendingTx = {
        id: `je-${idx}`,
        date: String(dateStr).trim(),
        debitAccount: particular ? String(particular).trim() : null,
        debitAmount: debit !== null && !isNaN(debit) ? round2(debit) : null,
        creditAccount: null,
        creditAmount: null,
        narration: null,
      };
    } else if (pendingTx) {
      if (particular && String(particular).startsWith("To ")) {
        pendingTx.creditAccount = String(particular).trim();
        pendingTx.creditAmount = credit !== null && !isNaN(credit) ? round2(credit) : null;
      } else if (particular && (String(particular).startsWith("(") || String(particular).startsWith("Being"))) {
        pendingTx.narration = String(particular).trim();
      }
    }
  });
  if (pendingTx) transactions.push(pendingTx);
  return transactions;
}

/**
 * Legacy compatibility: parses settlements table if provided a settlement sheet.
 */
function parseSettlementsTable(gvizData) {
  if (!gvizData?.table?.rows) return [];
  const rows = gvizData.table.rows;
  const entries = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    if (!r || !r.c) continue;
    const cells = r.c;
    const dateVal = cells[0]?.v ? String(cells[0].v).trim() : null;
    const paymentAmount = Number(cells[5]?.v);
    if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal) || !Number.isFinite(paymentAmount) || paymentAmount < 0) {
      continue;
    }
    entries.push({
      id: `rev-${dateVal}-${idx}`,
      date: dateVal,
      type: "revenue",
      category: "revenue",
      description: "Payment Settlement",
      amount: round2(paymentAmount),
      status: "approved",
    });
  }
  return entries;
}

function isSettledStatus(settlementStatus) {
  const norm = String(settlementStatus || "").trim().toUpperCase();
  if (!norm) return false;
  if (
    norm.includes("UNSETTLED") ||
    norm.includes("NOT SETTLED") ||
    norm.includes("NON-SETTLED") ||
    norm.includes("FAILED") ||
    norm.includes("PENDING") ||
    norm.includes("SKIPPED")
  ) {
    return false;
  }
  return norm.includes("SETTLED") || norm === "SUCCESS" || norm === "COMPLETED";
}

function isPendingStatus(settlementStatus, rawStatus) {
  const normS = String(settlementStatus || "").trim().toUpperCase();
  const normR = String(rawStatus || "").trim().toUpperCase();
  return normS.includes("PENDING") || normR === "PENDING" || normS.includes("IN FLIGHT");
}

function isRevenueEligible(rawStatus, settlementStatus) {
  const normRaw = String(rawStatus || "").trim().toUpperCase();
  const normSettlement = String(settlementStatus || "").trim().toUpperCase();
  if (!normRaw && !normSettlement) return false;
  if (normRaw === "PAID" || isSettledStatus(normSettlement) || isPendingStatus(normSettlement, normRaw)) return true;
  return false;
}

/**
 * Fetches and transforms financial records from Google Sheets with caching and resilience.
 */
async function fetchFinanceSheetData({ sheetId = DEFAULT_SHEET_ID, force = false, httpGet = axios.get } = {}) {
  const now = Date.now();
  const isCacheFresh = sheetCache.data && now - sheetCache.cachedAt < CACHE_TTL_MS && !force;

  if (isCacheFresh) {
    return {
      ...sheetCache.data,
      cached: true,
      lastSyncedAt: sheetCache.lastSyncedAt,
      syncError: sheetCache.syncError,
    };
  }

  const fetchTab = async (gid) => {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
    const response = await httpGet(url, { timeout: 10000 });
    const rawText = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    const parsed = parseGvizResponse(rawText);
    if (!parsed || !parsed.table) {
      throw new Error(`Invalid response structure from Google Sheets gid=${gid}.`);
    }
    return parsed;
  };

  try {
    const [er2026Gviz, er2025Gviz, journalGviz, psrGviz] = await Promise.all([
      fetchTab(GIDS.EXPENSES_2026),
      fetchTab(GIDS.EXPENSES_2025),
      fetchTab(GIDS.JOURNAL),
      fetchTab(GIDS.PSR),
    ]);

    const items2026 = parseExpenseRows(er2026Gviz.table?.rows, 2026);
    const items2025 = parseExpenseRows(er2025Gviz.table?.rows, 2025);
    const allExpenses = [...items2026, ...items2025].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

    const totalExpenses = round2(allExpenses.reduce((acc, e) => acc + e.amount, 0));
    const totalExpenses2026 = round2(items2026.reduce((acc, e) => acc + e.amount, 0));
    const totalExpenses2025 = round2(items2025.reduce((acc, e) => acc + e.amount, 0));

    const monthlyTotals = {};
    allExpenses.forEach((e) => {
      monthlyTotals[e.monthKey] = round2((monthlyTotals[e.monthKey] || 0) + e.amount);
    });

    const categoryTotals = {};
    allExpenses.forEach((e) => {
      categoryTotals[e.category] = round2((categoryTotals[e.category] || 0) + e.amount);
    });

    const journalEntries = parseJournalTable(journalGviz.table?.rows);
    const psrData = parsePsrTable(psrGviz.table?.rows);

    const parsedData = {
      sheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      expenses: {
        totalExpenses,
        totalExpenses2026,
        totalExpenses2025,
        count: allExpenses.length,
        items: allExpenses,
        monthlyTotals,
        categoryTotals,
        isAvailable: true,
      },
      journal: {
        count: journalEntries.length,
        items: journalEntries,
      },
      psr: {
        founders: psrData.founders,
        totalInvestment: psrData.totalInvestment,
      },
      revenue: {
        totalGrossRevenue: 0,
        totalConfirmedSettled: 0,
        totalPendingSettlement: 0,
        totalSettled: 0,
        totalServiceCharges: 0,
        totalGst: 0,
        totalAdjustments: 0,
        count: 0,
        items: [],
        monthlyTotals: {},
        isAvailable: false,
        note: "This Google Sheet tracks operational expenditure and founder investments.",
      },
      summary: {
        netPL: round2(-totalExpenses),
        isPlAvailable: true,
      },
    };

    const syncedAtIso = new Date().toISOString();
    sheetCache = {
      data: parsedData,
      lastSyncedAt: syncedAtIso,
      cachedAt: now,
      syncError: null,
    };

    return {
      ...parsedData,
      cached: false,
      lastSyncedAt: syncedAtIso,
      syncError: null,
    };
  } catch (err) {
    console.error("[GOOGLE-SHEETS-SYNC] Sync failed:", err.message || err);

    // If we have previous valid cached data, retain it and report the sync warning
    if (sheetCache.data) {
      sheetCache.syncError = `Could not refresh spreadsheet (${err.message || "Network error"}). Showing last valid cached data.`;
      return {
        ...sheetCache.data,
        cached: true,
        lastSyncedAt: sheetCache.lastSyncedAt,
        syncError: sheetCache.syncError,
      };
    }

    // No prior cache exists -> throw error
    throw Object.assign(new Error(`Failed to load Google Sheets data: ${err.message || "Network error"}`), {
      status: 502,
    });
  }
}

module.exports = {
  fetchFinanceSheetData,
  parseExpenseRows,
  parseJournalTable,
  parsePsrTable,
  parseSettlementsTable,
  parseGvizResponse,
  isRevenueEligible,
  isSettledStatus,
  isPendingStatus,
  resetSheetCache,
  DEFAULT_SHEET_ID,
  GIDS,
  CACHE_TTL_MS,
};

