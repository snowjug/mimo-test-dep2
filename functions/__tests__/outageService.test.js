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
});
