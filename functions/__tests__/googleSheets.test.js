process.env.JWT_SECRET = "google-sheets-test-secret-fixture-32ch";
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const express = require("express");
const http = require("node:http");
const axios = require("axios");
const { getSecretKey } = require("../src/config/env");
const {
  fetchFinanceSheetData,
  parseExpenseRows,
  parseJournalTable,
  parsePsrTable,
  parseGvizResponse,
  resetSheetCache,
  DEFAULT_SHEET_ID,
  GIDS,
} = require("../src/services/googleSheets.service");

const SAMPLE_EXPENSES_2026_GVIZ = `/*O_o*/
google.visualization.Query.setResponse({
  "version": "0.6",
  "status": "ok",
  "table": {
    "cols": [
      {"id": "A", "label": "JANUARY Date"},
      {"id": "B", "label": "Category"},
      {"id": "C", "label": "Amount"},
      {"id": "D", "label": "Paid By"}
    ],
    "rows": [
      {
        "c": [
          {"v": "3rd"},
          {"v": "Developer & Software"},
          {"v": 1000.0},
          {"v": "Vishal"}
        ]
      },
      {
        "c": [
          {"v": "5th"},
          {"v": "Professional Services"},
          {"v": 800.0},
          {"v": "Vishal"}
        ]
      },
      {
        "c": [
          {"v": null},
          {"v": "Total"},
          {"v": 1800.0},
          {"v": null}
        ]
      },
      {
        "c": [
          {"v": "FEBRUARY"},
          {"v": null},
          {"v": null},
          {"v": null}
        ]
      },
      {
        "c": [
          {"v": "1st"},
          {"v": "Developer & Software"},
          {"v": 5000.0},
          {"v": "Vishal"}
        ]
      }
    ]
  }
});`;

const SAMPLE_EXPENSES_2025_GVIZ = `/*O_o*/
google.visualization.Query.setResponse({
  "version": "0.6",
  "status": "ok",
  "table": {
    "cols": [
      {"id": "A", "label": "March Date"},
      {"id": "B", "label": "Category"},
      {"id": "C", "label": "Amount"},
      {"id": "D", "label": "Paid By"}
    ],
    "rows": [
      {
        "c": [
          {"v": "27th"},
          {"v": "Developer & Software"},
          {"v": 4000.0},
          {"v": "Vishal"}
        ]
      },
      {
        "c": [
          {"v": "AUGUST"},
          {"v": null},
          {"v": null},
          {"v": null}
        ]
      },
      {
        "c": [
          {"v": "6th"},
          {"v": "Developer & Software"},
          {"v": 2000.0},
          {"v": "Vishal"}
        ]
      }
    ]
  }
});`;

const SAMPLE_PSR_GVIZ = `/*O_o*/
google.visualization.Query.setResponse({
  "version": "0.6",
  "status": "ok",
  "table": {
    "cols": [
      {"id": "A", "label": "Founder"},
      {"id": "B", "label": "Total Investment"},
      {"id": "C", "label": "Profit Sharing Ratio Withdrawals"},
      {"id": "D", "label": "Net Investment"},
      {"id": "E", "label": "Ownership %"},
      {"id": "F", "label": "Profit Share %"}
    ],
    "rows": [
      {
        "c": [
          {"v": "V Vishal"},
          {"v": 140409.0},
          {"v": 0.0},
          {"v": 140409.0},
          {"v": 0.6614},
          {"v": 0.6614}
        ]
      },
      {
        "c": [
          {"v": "Ankit Patel"},
          {"v": 71882.0},
          {"v": 0.0},
          {"v": 71882.0},
          {"v": 0.3386},
          {"v": 0.3386}
        ]
      },
      {
        "c": [
          {"v": "Total :"},
          {"v": 212291.0},
          {"v": 0.0},
          {"v": 212291.0},
          {"v": 1.0},
          {"v": 1.0}
        ]
      }
    ]
  }
});`;

const SAMPLE_JOURNAL_GVIZ = `/*O_o*/
google.visualization.Query.setResponse({
  "version": "0.6",
  "status": "ok",
  "table": {
    "cols": [
      {"id": "A", "label": "Date"},
      {"id": "B", "label": "Particulars"},
      {"id": "C", "label": "L.F."},
      {"id": "D", "label": "Debit (₹)"},
      {"id": "E", "label": "Credit (₹)"}
    ],
    "rows": [
      {
        "c": [
          {"v": "Date(2025,2,27)", "f": "27/Mar/2025"},
          {"v": "Gowtham A/c Dr."},
          {"v": null},
          {"v": 4000.0},
          {"v": 0.0}
        ]
      },
      {
        "c": [
          {"v": null},
          {"v": "To Bank A/c"},
          {"v": null},
          {"v": null},
          {"v": 4000.0}
        ]
      },
      {
        "c": [
          {"v": null},
          {"v": "(Being amount paid for Developer Fees)"},
          {"v": null},
          {"v": null},
          {"v": 0.0}
        ]
      },
      {
        "c": [
          {"v": null},
          {"v": "Grand Total"},
          {"v": null},
          {"v": 4000.0},
          {"v": 4000.0}
        ]
      }
    ]
  }
});`;

describe("googleSheets.service (New Revenue & Expense Spreadsheet)", () => {
  beforeEach(() => {
    resetSheetCache();
  });

  describe("Configuration & Constants", () => {
    it("uses the correct new spreadsheet ID 18ZDXG0nQZ6z7kUx7lShOFyOQ9gNOq2nc3iXfrYLrlfI", () => {
      assert.strictEqual(DEFAULT_SHEET_ID, "18ZDXG0nQZ6z7kUx7lShOFyOQ9gNOq2nc3iXfrYLrlfI");
    });

    it("defines valid GIDs for all tabs", () => {
      assert.strictEqual(GIDS.EXPENSES_2026, "1130673006");
      assert.strictEqual(GIDS.EXPENSES_2025, "2119576488");
      assert.strictEqual(GIDS.JOURNAL, "0");
      assert.strictEqual(GIDS.PSR, "1895235794");
    });
  });

  describe("parseExpenseRows", () => {
    it("correctly parses 2026 expense rows into typed line items with ISO dates and categories", () => {
      const gviz = parseGvizResponse(SAMPLE_EXPENSES_2026_GVIZ);
      const items = parseExpenseRows(gviz.table.rows, 2026);

      assert.strictEqual(items.length, 3);
      assert.strictEqual(items[0].date, "2026-01-03");
      assert.strictEqual(items[0].category, "Developer & Software");
      assert.strictEqual(items[0].amount, 1000);
      assert.strictEqual(items[0].paidBy, "Vishal");

      assert.strictEqual(items[1].date, "2026-01-05");
      assert.strictEqual(items[1].category, "Professional Services");
      assert.strictEqual(items[1].amount, 800);

      assert.strictEqual(items[2].date, "2026-02-01");
      assert.strictEqual(items[2].category, "Developer & Software");
      assert.strictEqual(items[2].amount, 5000);
    });

    it("correctly parses 2025 expense rows", () => {
      const gviz = parseGvizResponse(SAMPLE_EXPENSES_2025_GVIZ);
      const items = parseExpenseRows(gviz.table.rows, 2025);

      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].date, "2025-03-27");
      assert.strictEqual(items[0].category, "Developer & Software");
      assert.strictEqual(items[0].amount, 4000);

      assert.strictEqual(items[1].date, "2025-08-06");
      assert.strictEqual(items[1].category, "Developer & Software");
      assert.strictEqual(items[1].amount, 2000);
    });
  });

  describe("parsePsrTable", () => {
    it("correctly extracts founder investments and percentages", () => {
      const gviz = parseGvizResponse(SAMPLE_PSR_GVIZ);
      const psr = parsePsrTable(gviz.table.rows);

      assert.strictEqual(psr.founders.length, 2);
      assert.strictEqual(psr.founders[0].name, "V Vishal");
      assert.strictEqual(psr.founders[0].totalInvestment, 140409);
      assert.strictEqual(psr.founders[0].ownershipPct, 66.14);

      assert.strictEqual(psr.founders[1].name, "Ankit Patel");
      assert.strictEqual(psr.founders[1].totalInvestment, 71882);
      assert.strictEqual(psr.founders[1].ownershipPct, 33.86);

      assert.strictEqual(psr.totalInvestment, 212291);
    });
  });

  describe("parseJournalTable", () => {
    it("correctly constructs double-entry journal records", () => {
      const gviz = parseGvizResponse(SAMPLE_JOURNAL_GVIZ);
      const journal = parseJournalTable(gviz.table.rows);

      assert.strictEqual(journal.length, 1);
      assert.strictEqual(journal[0].date, "27/Mar/2025");
      assert.strictEqual(journal[0].debitAccount, "Gowtham A/c Dr.");
      assert.strictEqual(journal[0].debitAmount, 4000);
      assert.strictEqual(journal[0].creditAccount, "To Bank A/c");
      assert.strictEqual(journal[0].creditAmount, 4000);
      assert.strictEqual(journal[0].narration, "(Being amount paid for Developer Fees)");
    });
  });

  describe("fetchFinanceSheetData", () => {
    it("fetches all tabs, parses expenses and PSR, and caches results", async () => {
      let callCount = 0;
      const fakeHttpGet = async (url) => {
        callCount++;
        if (url.includes(`gid=${GIDS.EXPENSES_2026}`)) return { data: SAMPLE_EXPENSES_2026_GVIZ };
        if (url.includes(`gid=${GIDS.EXPENSES_2025}`)) return { data: SAMPLE_EXPENSES_2025_GVIZ };
        if (url.includes(`gid=${GIDS.PSR}`)) return { data: SAMPLE_PSR_GVIZ };
        if (url.includes(`gid=${GIDS.JOURNAL}`)) return { data: SAMPLE_JOURNAL_GVIZ };
        return { data: SAMPLE_EXPENSES_2026_GVIZ };
      };

      const res1 = await fetchFinanceSheetData({ httpGet: fakeHttpGet });
      assert.strictEqual(callCount, 4);
      assert.strictEqual(res1.cached, false);
      assert.strictEqual(res1.sheetId, "18ZDXG0nQZ6z7kUx7lShOFyOQ9gNOq2nc3iXfrYLrlfI");
      assert.strictEqual(res1.expenses.isAvailable, true);
      assert.strictEqual(res1.expenses.totalExpenses, 12800); // 6800 (2026) + 6000 (2025)
      assert.strictEqual(res1.expenses.totalExpenses2026, 6800);
      assert.strictEqual(res1.expenses.totalExpenses2025, 6000);
      assert.strictEqual(res1.expenses.count, 5);
      assert.strictEqual(res1.psr.founders.length, 2);
      assert.strictEqual(res1.journal.count, 1);

      assert.strictEqual(res1.revenue.isAvailable, false);
      assert.strictEqual(res1.revenue.totalGrossRevenue, 0);
      assert.strictEqual(res1.revenue.items.length, 0);
      assert.strictEqual(res1.summary.netPL, -12800);
      assert.strictEqual(res1.summary.isPlAvailable, true);

      // Verify founder object shape
      assert.strictEqual(res1.psr.founders[0].name, "V Vishal");
      assert.strictEqual(res1.psr.founders[0].totalInvestment, 140409);
      assert.strictEqual(res1.psr.founders[0].netInvestment, 140409);
      assert.strictEqual(res1.psr.founders[0].ownershipPct, 66.14);
      assert.strictEqual(res1.psr.founders[0].profitSharePct, 66.14);

      // Cache test
      const res2 = await fetchFinanceSheetData({ httpGet: fakeHttpGet });
      assert.strictEqual(callCount, 4); // No additional HTTP calls
      assert.strictEqual(res2.cached, true);
      assert.strictEqual(res2.expenses.totalExpenses, 12800);
    });

    it("bypasses cache when force=true is passed", async () => {
      let callCount = 0;
      const fakeHttpGet = async (url) => {
        callCount++;
        if (url.includes(`gid=${GIDS.EXPENSES_2026}`)) return { data: SAMPLE_EXPENSES_2026_GVIZ };
        if (url.includes(`gid=${GIDS.EXPENSES_2025}`)) return { data: SAMPLE_EXPENSES_2025_GVIZ };
        if (url.includes(`gid=${GIDS.PSR}`)) return { data: SAMPLE_PSR_GVIZ };
        return { data: SAMPLE_JOURNAL_GVIZ };
      };

      await fetchFinanceSheetData({ httpGet: fakeHttpGet });
      assert.strictEqual(callCount, 4);

      await fetchFinanceSheetData({ force: true, httpGet: fakeHttpGet });
      assert.strictEqual(callCount, 8);
    });

    it("falls back to previous cached data on network error with syncError notice", async () => {
      const fakeHttpGetSuccess = async (url) => {
        if (url.includes(`gid=${GIDS.EXPENSES_2026}`)) return { data: SAMPLE_EXPENSES_2026_GVIZ };
        if (url.includes(`gid=${GIDS.EXPENSES_2025}`)) return { data: SAMPLE_EXPENSES_2025_GVIZ };
        if (url.includes(`gid=${GIDS.PSR}`)) return { data: SAMPLE_PSR_GVIZ };
        return { data: SAMPLE_JOURNAL_GVIZ };
      };
      const fakeHttpGetFail = async () => {
        throw new Error("Network timeout");
      };

      const initial = await fetchFinanceSheetData({ httpGet: fakeHttpGetSuccess });
      assert.strictEqual(initial.cached, false);

      const fallback = await fetchFinanceSheetData({ force: true, httpGet: fakeHttpGetFail });
      assert.strictEqual(fallback.cached, true);
      assert.strictEqual(fallback.expenses.totalExpenses, 12800);
      assert.ok(fallback.syncError.includes("Network timeout"));
    });

    it("throws 502 error if initial fetch fails without any cache", async () => {
      const fakeHttpGetFail = async () => {
        throw new Error("DNS resolution error");
      };

      await assert.rejects(
        () => fetchFinanceSheetData({ httpGet: fakeHttpGetFail }),
        (err) => {
          assert.strictEqual(err.status, 502);
          assert.ok(err.message.includes("DNS resolution error"));
          return true;
        }
      );
    });
  });

  describe("Finance Route Authorization & Protection (/admin/finance-sheet)", () => {
    let server;
    let baseUrl;

    beforeEach(async () => {
      const app = express();
      app.use(express.json());
      app.use(require("../src/routes/admin.routes"));
      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    it("rejects unauthenticated requests with 401 Access Denied", async () => {
      try {
        await axios.get(`${baseUrl}/admin/finance-sheet`);
        assert.fail("Should have thrown 401");
      } catch (err) {
        assert.strictEqual(err.response?.status, 401);
        assert.strictEqual(err.response?.data?.error, "Access Denied");
      } finally {
        server.close();
      }
    });

    it("rejects malformed / invalid JWT with 401 Invalid Token", async () => {
      try {
        await axios.get(`${baseUrl}/admin/finance-sheet`, {
          headers: { Authorization: "Bearer malformed.invalid.token" },
        });
        assert.fail("Should have thrown 401");
      } catch (err) {
        assert.strictEqual(err.response?.status, 401);
        assert.strictEqual(err.response?.data?.error, "Invalid Token");
      } finally {
        server.close();
      }
    });

    it("rejects authenticated customer / unauthorized role with 403 Forbidden", async () => {
      const customerToken = jwt.sign({ userId: "customer-1", role: "customer" }, getSecretKey());
      try {
        await axios.get(`${baseUrl}/admin/finance-sheet`, {
          headers: { Authorization: `Bearer ${customerToken}` },
        });
        assert.fail("Should have thrown 403");
      } catch (err) {
        assert.strictEqual(err.response?.status, 403);
        assert.ok(err.response?.data?.error?.includes("Forbidden"));
      } finally {
        server.close();
      }
    });

    it("allows finance role token to access /admin/finance-sheet", async () => {
      const financeToken = jwt.sign({ isAdmin: false, role: "finance", email: "finance@mimo.com" }, getSecretKey());
      const res = await axios.get(`${baseUrl}/admin/finance-sheet`, {
        headers: { Authorization: `Bearer ${financeToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.sheetId, DEFAULT_SHEET_ID);
      assert.strictEqual(typeof res.data.expenses?.totalExpenses, "number");
      server.close();
    });

    it("blocks finance role token from general admin endpoints (e.g. /admin/coupons)", async () => {
      const financeToken = jwt.sign({ isAdmin: false, role: "finance", email: "finance@mimo.com" }, getSecretKey());
      try {
        await axios.get(`${baseUrl}/admin/coupons`, {
          headers: { Authorization: `Bearer ${financeToken}` },
        });
        assert.fail("Should have thrown 403");
      } catch (err) {
        assert.strictEqual(err.response?.status, 403);
        assert.strictEqual(err.response?.data?.error, "Forbidden: Admins only");
      } finally {
        server.close();
      }
    });

    it("allows admin role token to access /admin/finance-sheet", async () => {
      const adminToken = jwt.sign({ isAdmin: true, role: "admin", email: "admin@mimo.com" }, getSecretKey());
      const res = await axios.get(`${baseUrl}/admin/finance-sheet`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      server.close();
    });
  });
});

