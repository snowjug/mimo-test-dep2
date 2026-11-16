const test = require("node:test");
const assert = require("node:assert/strict");

test("outageService - unit tests", async (t) => {
  const outageService = require("../src/services/outage.service");

  await t.test("exports expected functions and defaults", () => {
    assert.equal(typeof outageService.getOutageStatus, "function");
    assert.equal(typeof outageService.updateOutageStatus, "function");
    assert.equal(typeof outageService.subscribeCustomerEmail, "function");
    assert.equal(typeof outageService.getPendingSubscriberCount, "function");
    assert.equal(outageService.DEFAULT_OUTAGES.mimo1Down, false);
    assert.equal(outageService.DEFAULT_OUTAGES.mimo2BwDown, false);
    assert.equal(outageService.DEFAULT_OUTAGES.mimo2ColorDown, false);
    assert.equal(outageService.DEFAULT_OUTAGES.allDown, false);
  });

  await t.test("rejects invalid email on subscription", async () => {
    await assert.rejects(
      () => outageService.subscribeCustomerEmail({ email: "invalid-email" }),
      /Invalid email address format/
    );
    await assert.rejects(
      () => outageService.subscribeCustomerEmail({ email: "" }),
      /Email is required/
    );
  });

  await t.test("sendPrinterRestoredNotificationEmail rejects invalid email", async () => {
    const { sendPrinterRestoredNotificationEmail } = require("../src/services/email.service");
    await assert.rejects(
      () => sendPrinterRestoredNotificationEmail({ recipient: "bad-email" }),
      /Valid recipient email required/
    );
    const mockRes = await sendPrinterRestoredNotificationEmail({ recipient: "customer@example.com", printerName: "MIMO 2.0" });
    assert.equal(mockRes.sent, true);
    assert.equal(mockRes.mock, true);
  });

  await t.test("updateOutageStatus handles testEmailRecipient parameter", async () => {
    const res = await outageService.updateOutageStatus({ testEmailRecipient: "testadmin@example.com" });
    assert.ok(res.testEmailResult);
    assert.equal(res.testEmailResult.sent, true);
  });

  await t.test("summarizeOutages handles live paper, toner and ink exhaustion", () => {
    const { summarizeOutages } = outageService;

    // 1. Normal supplies
    const normal = summarizeOutages({}, {
      "CV-001": { paperLevel: 150, tonerLevel: 80 },
      "SV-002-BW": { paperLevel: 200, tonerLevel: 90 },
      "SV-002-COLOR": { paperLevel: 80, inkLevel: 100 },
    });
    assert.equal(normal.mimo1Down, false);
    assert.equal(normal.mimo2BwDown, false);
    assert.equal(normal.mimo2ColorDown, false);
    assert.equal(normal.allDown, false);
    assert.equal(normal.hasActiveOutage, false);

    // 2. MIMO 1.0 out of paper -> marks down and redirects to MIMO 2.0
    const cv001NoPaper = summarizeOutages({}, {
      "CV-001": { paperLevel: 0, tonerLevel: 80 },
      "SV-002-BW": { paperLevel: 200, tonerLevel: 90 },
    });
    assert.equal(cv001NoPaper.mimo1Down, true);
    assert.equal(cv001NoPaper.hardwareAlerts.mimo1.paperOut, true);
    assert.equal(cv001NoPaper.hardwareAlerts.mimo1.suggestedMachine, "MIMO 2.0");
    assert.match(cv001NoPaper.hardwareAlerts.mimo1.message, /Paper is not in MIMO 1\.0/);
    assert.match(cv001NoPaper.hardwareAlerts.mimo1.message, /take your printout in MIMO 2\.0/);

    // 3. MIMO 1.0 out of toner
    const cv001NoToner = summarizeOutages({}, {
      "CV-001": { paperLevel: 100, tonerLevel: 0 },
      "SV-002-BW": { paperLevel: 200, tonerLevel: 90 },
    });
    assert.equal(cv001NoToner.mimo1Down, true);
    assert.equal(cv001NoToner.hardwareAlerts.mimo1.tonerOut, true);
    assert.equal(cv001NoToner.hardwareAlerts.mimo1.suggestedMachine, "MIMO 2.0");

    // 4. MIMO 2.0 B&W out of paper -> marks down and redirects to MIMO 1.0
    const sv002NoPaper = summarizeOutages({}, {
      "CV-001": { paperLevel: 150, tonerLevel: 80 },
      "SV-002-BW": { paperLevel: 0, tonerLevel: 90 },
    });
    assert.equal(sv002NoPaper.mimo2BwDown, true);
    assert.equal(sv002NoPaper.hardwareAlerts.mimo2_bw.paperOut, true);
    assert.equal(sv002NoPaper.hardwareAlerts.mimo2_bw.suggestedMachine, "MIMO 1.0");
    assert.match(sv002NoPaper.hardwareAlerts.mimo2_bw.message, /Paper is not in MIMO 2\.0/);
    assert.match(sv002NoPaper.hardwareAlerts.mimo2_bw.message, /take your printout in MIMO 1\.0/);

    // 5. Both B&W out of paper -> allDown
    const bothNoPaper = summarizeOutages({}, {
      "CV-001": { paperLevel: 0, tonerLevel: 80 },
      "SV-002-BW": { paperLevel: 0, tonerLevel: 90 },
    });
    assert.equal(bothNoPaper.allDown, true);
    assert.match(bothNoPaper.activeNotices[0], /Both MIMO 1\.0 and MIMO 2\.0 are out of paper/);

    // 6. MIMO 2.0 Colour out of ink
    const sv002ColorNoInk = summarizeOutages({}, {
      "CV-001": { paperLevel: 150, tonerLevel: 80 },
      "SV-002-BW": { paperLevel: 200, tonerLevel: 90 },
      "SV-002-COLOR": { paperLevel: 80, inkLevel: 0 },
    });
    assert.equal(sv002ColorNoInk.mimo2ColorDown, true);
    assert.equal(sv002ColorNoInk.hardwareAlerts.mimo2_color.inkOut, true);
    assert.match(sv002ColorNoInk.hardwareAlerts.mimo2_color.message, /Colour ink is exhausted in MIMO 2\.0/);
  });
});
