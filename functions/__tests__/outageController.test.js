const test = require("node:test");
const assert = require("node:assert/strict");
const { seed, response } = require("./helpers/orderHarness");
const outageController = require("../src/controllers/outage.controller");
const outageService = require("../src/services/outage.service");

test.describe("Outage Controller & Service Integration", () => {
  test("GET /api/kiosk-outages returns defaults when no overrides exist", async () => {
    seed({});
    const res = response();
    await outageController.getPublicOutages({}, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.hasActiveOutage, false);
    assert.equal(res.body.allDown, false);
    assert.equal(res.body.mimo1Down, false);
    assert.equal(res.body.mimo2BwDown, false);
    assert.equal(res.body.mimo2ColorDown, false);
    assert.deepEqual(res.body.activeNotices, []);
  });

  test("POST /api/notify-when-available validates email correctly", async () => {
    seed({});
    const badRes = response();
    await outageController.postNotifyWhenAvailable({ body: { email: "bademail" } }, badRes);
    assert.equal(badRes.code, 400);

    const goodRes = response();
    await outageController.postNotifyWhenAvailable(
      { body: { email: "student@reva.edu.in", scope: "all" } },
      goodRes
    );
    assert.equal(goodRes.code, 200);
    assert.equal(goodRes.body.success, true);
    assert.equal(goodRes.body.email, "student@reva.edu.in");
  });

  test("Admin can toggle outage states and see active notices", async () => {
    seed({});
    const postRes = response();
    await outageController.postAdminOutages(
      {
        body: {
          mimo1Down: true,
          mimo2ColorDown: true,
        },
        admin: { email: "admin@mimo.tech" },
      },
      postRes
    );
    assert.equal(postRes.code, 200);
    assert.equal(postRes.body.mimo1Down, true);
    assert.equal(postRes.body.mimo2ColorDown, true);
    assert.equal(postRes.body.hasActiveOutage, true);
    assert.ok(postRes.body.activeNotices.some((n) => n.includes("MIMO 1.0")));
    assert.ok(postRes.body.activeNotices.some((n) => n.includes("MIMO 2.0 Colour")));

    // Public view matches
    const pubRes = response();
    await outageController.getPublicOutages({}, pubRes);
    assert.equal(pubRes.code, 200);
    assert.equal(pubRes.body.mimo1Down, true);
    assert.equal(pubRes.body.mimo2ColorDown, true);
    assert.equal(pubRes.body.hasActiveOutage, true);
  });

  test("Admin toggling allDown shows Both Machines notice", async () => {
    seed({});
    const postRes = response();
    await outageController.postAdminOutages(
      {
        body: {
          allDown: true,
        },
        admin: { email: "admin@mimo.tech" },
      },
      postRes
    );
    assert.equal(postRes.code, 200);
    assert.equal(postRes.body.allDown, true);
    assert.equal(postRes.body.hasActiveOutage, true);
    assert.ok(postRes.body.activeNotices[0].includes("Both MIMO 1.0 and MIMO 2.0"));
  });

  test("Restoring outage notifies subscribed customers and clears restoredScopes", async () => {
    seed({});
    // 1. Subscribe customer
    await outageService.subscribeCustomerEmail({
      email: "bimbana@reva.edu.in",
      scope: "mimo1",
    });

    // 2. Set mimo1 down
    await outageController.postAdminOutages(
      { body: { mimo1Down: true } },
      response()
    );

    // 3. Mark mimo1 back to operational
    const restoreRes = response();
    await outageController.postAdminOutages(
      { body: { mimo1Down: false } },
      restoreRes
    );
    assert.equal(restoreRes.code, 200);
    assert.equal(restoreRes.body.mimo1Down, false);
    assert.ok(restoreRes.body.restoredScopes.includes("mimo1"));
  });
});
