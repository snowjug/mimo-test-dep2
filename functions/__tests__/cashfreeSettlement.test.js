const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeSettlementItem,
  classifySettlementStatus,
  calculateSettlementHealth,
  parseDateAndTimestamp,
  syncCashfreeSettlements,
} = require("../src/services/cashfreeSettlement.service");

describe("Cashfree Settlement Service - Forensic Audit & Integration Tests", () => {
  it("normalizes a raw Cashfree settlement record into integer paise and rupee floats", () => {
    const raw = {
      cf_settlement_id: "CF_SETTL_9901",
      settlement_utr: "UTR202610170001",
      order_id: "ORDER_5001",
      cf_order_id: "CF_ORD_5001",
      settlement_date: "2026-09-15T14:30:00+05:30",
      payment_amount: 1069.60,
      amount_settled: 916.77,
      service_charge: 17.14,
      service_tax: 3.16,
      adjustment: -132.53,
      status: "PAID",
      remarks: "Settlement completed successfully.",
    };

    const item = normalizeSettlementItem(raw, "cashfree_api");

    assert.strictEqual(item.cfSettlementId, "CF_SETTL_9901");
    assert.strictEqual(item.settlementUtr, "UTR202610170001");
    assert.strictEqual(item.settlementDate, "2026-09-15");
    assert.strictEqual(item.paymentPaise, 106960);
    assert.strictEqual(item.settledPaise, 91677);
    assert.strictEqual(item.serviceChargePaise, 1714);
    assert.strictEqual(item.serviceTaxPaise, 316);
    assert.strictEqual(item.adjustmentPaise, -13253);
    assert.strictEqual(item.settlementStatus, "Settled");
    assert.strictEqual(item.reconciledStatus, "RECONCILED");
    assert.strictEqual(item.health, "Partial");
  });

  it("accurately classifies status and skips insufficient balance remarks", () => {
    assert.strictEqual(classifySettlementStatus("PAID", 500, ""), "Settled");
    assert.strictEqual(classifySettlementStatus("SETTLED", 0, "Insufficient amount to settle"), "Skipped");
    assert.strictEqual(classifySettlementStatus("PAID", 0, "Pending bank batch"), "Pending Settlement");
    assert.strictEqual(classifySettlementStatus("FAILED", 0, "Bank technical error"), "Failed");
    assert.strictEqual(classifySettlementStatus("CANCELLED", 0, "Merchant cancelled"), "Cancelled");
  });

  it("calculates health categories correctly based on settlement ratio", () => {
    assert.strictEqual(calculateSettlementHealth(100, 99), "Excellent");
    assert.strictEqual(calculateSettlementHealth(100, 92), "Healthy");
    assert.strictEqual(calculateSettlementHealth(100, 50), "Partial");
    assert.strictEqual(calculateSettlementHealth(100, 0), "Unsettled");
  });

  it("normalizes date boundaries correctly for YYYY-MM-DD IST strings", () => {
    const res = parseDateAndTimestamp("2026-09-28");
    assert.strictEqual(res.dateStr, "2026-09-28");
    assert.ok(typeof res.timeMs === "number" && res.timeMs > 0);
  });

  it("deduplicates duplicate settlement rows and prevents monetary double-counting", async () => {
    // Simulating the 2 duplicate entries found in the legacy MBIS Google Sheet
    const mockRows = [
      {
        cf_settlement_id: "392551179",
        settlement_utr: "PGZ392551179",
        settlement_date: "2026-09-25",
        payment_amount: 230.70,
        amount_settled: 0.00,
        service_charge: 3.61,
        service_tax: 0.72,
        adjustment: -226.37,
        status: "PAID",
      },
      {
        cf_settlement_id: "394546338",
        settlement_utr: "AXISCN1481400443",
        settlement_date: "2026-09-28",
        payment_amount: 634.70,
        amount_settled: 288.55,
        service_charge: 10.00,
        service_tax: 1.92,
        adjustment: -334.23,
        status: "PAID",
      },
      // Duplicate occurrence 1 (inflates count and settled amount if not deduplicated)
      {
        cf_settlement_id: "392551179",
        settlement_utr: "PGZ392551179",
        settlement_date: "2026-09-25",
        payment_amount: 230.70,
        amount_settled: 0.00,
        service_charge: 3.61,
        service_tax: 0.72,
        adjustment: -226.37,
        status: "PAID",
      },
      // Duplicate occurrence 2 (inflated September by ₹288.55 from ₹12,214.99 to ₹12,503.54 in legacy script)
      {
        cf_settlement_id: "394546338",
        settlement_utr: "AXISCN1481400443",
        settlement_date: "2026-09-28",
        payment_amount: 634.70,
        amount_settled: 288.55,
        service_charge: 10.00,
        service_tax: 1.92,
        adjustment: -334.23,
        status: "PAID",
      },
      {
        cf_settlement_id: "395886320",
        settlement_utr: "AXISCN1483792352",
        settlement_date: "2026-09-30",
        payment_amount: 624.00,
        amount_settled: 579.90,
        service_charge: 9.82,
        service_tax: 1.88,
        adjustment: -32.40,
        status: "PAID",
      },
    ];

    const mockHttpGet = async () => ({
      data: `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({
        table: {
          rows: mockRows.map((r) => ({
            c: [
              { v: r.settlement_date },
              { v: r.cf_settlement_id },
              { v: r.settlement_utr },
              { v: "N/A" },
              { v: "N/A" },
              { v: r.payment_amount },
              { v: r.amount_settled },
              { v: r.service_charge },
              { v: r.service_tax },
              { v: r.adjustment },
              { v: r.status },
              { v: "Settled" },
              { v: "Completed" },
              { v: "Healthy" },
            ],
          })),
        },
      })});`,
    });

    const result = await syncCashfreeSettlements({
      dryRun: true,
      preferApi: false,
      httpGet: mockHttpGet,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.auditSummary.rowsDiscovered, 5);
    assert.strictEqual(result.auditSummary.rowsAccepted, 3); // exactly 3 unique IDs
    assert.strictEqual(result.auditSummary.duplicatesDetected, 2);
    assert.strictEqual(result.auditSummary.rowsSkipped, 2);

    // Verified monetary total: 288.55 + 579.90 = 868.45 (NOT double-counted to 1,157.00)
    assert.strictEqual(result.financialTotals.totalSettledAmount, 868.45);
    assert.strictEqual(result.financialTotals.totalPaymentAmount, 1489.40);
  });
});
