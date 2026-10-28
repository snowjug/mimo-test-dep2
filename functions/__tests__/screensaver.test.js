const test = require("node:test");
const assert = require("node:assert");
const { seed, response } = require("./helpers/orderHarness");
const adminController = require("../src/controllers/admin.controller");
const publicController = require("../src/controllers/public.controller");

test.describe("Screensaver Configuration Endpoints", () => {
  test("GET /api/screensaver returns safe defaults when document is absent", async () => {
    seed({});
    const res = response();
    await publicController.getApiScreensaver({}, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.body.videos, []);
    assert.strictEqual(res.body.playSound, true);
    assert.strictEqual(res.body.idleTimeoutSeconds, 60);
  });

  test("GET /admin/screensaver returns safe defaults when document is absent", async () => {
    seed({});
    const res = response();
    await adminController.getAdminScreensaver({}, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.body.videos, []);
    assert.strictEqual(res.body.playSound, true);
    assert.strictEqual(res.body.idleTimeoutSeconds, 60);
  });

  test("POST /admin/screensaver validates, clamps idle timeout, and sanitizes videos", async () => {
    seed({});
    const req = {
      body: {
        videos: ["https://example.com/ad1.mp4", "", "   ", "https://example.com/ad2.mp4", 12345],
        playSound: true,
        idleTimeoutSeconds: 5 // below min 10 -> clamped to 10
      }
    };
    const res = response();
    await adminController.postAdminScreensaver(req, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.body, { success: true });

    // Verify persisted doc via GET
    const getRes = response();
    await publicController.getApiScreensaver({}, getRes);
    assert.strictEqual(getRes.code, 200);
    assert.deepStrictEqual(getRes.body.videos, ["https://example.com/ad1.mp4", "https://example.com/ad2.mp4"]);
    assert.strictEqual(getRes.body.playSound, true);
    assert.strictEqual(getRes.body.idleTimeoutSeconds, 10);
  });

  test("POST /admin/screensaver clamps timeout to max 600", async () => {
    seed({});
    const req = {
      body: {
        videos: ["https://example.com/video.mp4"],
        playSound: false,
        idleTimeoutSeconds: 9999
      }
    };
    const res = response();
    await adminController.postAdminScreensaver(req, res);
    assert.strictEqual(res.code, 200);

    const getRes = response();
    await publicController.getApiScreensaver({}, getRes);
    assert.strictEqual(getRes.body.idleTimeoutSeconds, 600);
  });
});
