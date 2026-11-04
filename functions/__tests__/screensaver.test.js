const test = require("node:test");
const assert = require("node:assert");
const { seed, response, fake } = require("./helpers/orderHarness");
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
    assert.strictEqual(res.body.playSound, false);
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

  test("POST /admin/screensaver normalizes storage.googleapis.com and Google Drive URLs", async () => {
    seed({});
    const req = {
      body: {
        videos: [
          "https://storage.googleapis.com/test-bucket.app/screensaver/123_video.mp4",
          "https://drive.google.com/file/d/1FmKpdxdO2_s2Zy1ERuGkYk5lnNWcjhby/view?usp=drive_link"
        ],
        playSound: true,
        idleTimeoutSeconds: 60
      }
    };
    const res = response();
    await adminController.postAdminScreensaver(req, res);
    assert.strictEqual(res.code, 200);

    const getRes = response();
    await publicController.getApiScreensaver({}, getRes);
    assert.deepStrictEqual(getRes.body.videos, [
      "https://firebasestorage.googleapis.com/v0/b/test-bucket.app/o/screensaver%2F123_video.mp4?alt=media",
      "https://drive.google.com/uc?export=download&id=1FmKpdxdO2_s2Zy1ERuGkYk5lnNWcjhby"
    ]);
  });

  test("Per-kiosk screensaver isolation: CV-001 and SV-002 have independent playlists and controls", async () => {
    seed({});

    // 1. Set global screensaver
    await adminController.postAdminScreensaver({
      body: {
        videos: ["https://example.com/global.mp4"],
        playSound: false,
        idleTimeoutSeconds: 45
      }
    }, response());

    // 2. Set CV-001 screensaver
    const resCV = response();
    await adminController.postAdminScreensaver({
      body: {
        kioskId: "CV-001",
        videos: ["https://example.com/cv001-promo.mp4"],
        playSound: true,
        idleTimeoutSeconds: 30
      }
    }, resCV);
    assert.strictEqual(resCV.code, 200);
    assert.strictEqual(resCV.body.kioskId, "CV-001");

    // 3. Set SV-002 screensaver
    const resSV = response();
    await adminController.postAdminScreensaver({
      body: {
        kioskId: "SV-002",
        videos: ["https://example.com/sv002-library.mp4"],
        playSound: false,
        idleTimeoutSeconds: 90
      }
    }, resSV);
    assert.strictEqual(resSV.code, 200);
    assert.strictEqual(resSV.body.kioskId, "SV-002");

    // 4. Verify CV-001 public fetch returns CV-001 playlist
    const pubCV = response();
    await publicController.getApiScreensaver({ query: { kioskId: "CV-001" } }, pubCV);
    assert.strictEqual(pubCV.code, 200);
    assert.strictEqual(pubCV.body.kioskId, "CV-001");
    assert.deepStrictEqual(pubCV.body.videos, ["https://example.com/cv001-promo.mp4"]);
    assert.strictEqual(pubCV.body.playSound, true);
    assert.strictEqual(pubCV.body.idleTimeoutSeconds, 30);
    assert.strictEqual(pubCV.body.isCustom, true);

    // 5. Verify SV-002 public fetch returns SV-002 playlist
    const pubSV = response();
    await publicController.getApiScreensaver({ query: { kioskId: "SV-002" } }, pubSV);
    assert.strictEqual(pubSV.code, 200);
    assert.strictEqual(pubSV.body.kioskId, "SV-002");
    assert.deepStrictEqual(pubSV.body.videos, ["https://example.com/sv002-library.mp4"]);
    assert.strictEqual(pubSV.body.playSound, false);
    assert.strictEqual(pubSV.body.idleTimeoutSeconds, 90);
    assert.strictEqual(pubSV.body.isCustom, true);

    // 6. Verify non-configured kiosk (e.g. KV-003) gracefully falls back to Global Default
    const pubFallback = response();
    await publicController.getApiScreensaver({ query: { kioskId: "KV-003" } }, pubFallback);
    assert.strictEqual(pubFallback.code, 200);
    assert.strictEqual(pubFallback.body.kioskId, "KV-003");
    assert.deepStrictEqual(pubFallback.body.videos, ["https://example.com/global.mp4"]);
    assert.strictEqual(pubFallback.body.isFallback, true);

    // 7. Verify admin GET per kiosk and GET all
    const adminCV = response();
    await adminController.getAdminScreensaver({ query: { kioskId: "CV-001" } }, adminCV);
    assert.strictEqual(adminCV.code, 200);
    assert.strictEqual(adminCV.body.kioskId, "CV-001");
    assert.deepStrictEqual(adminCV.body.videos, ["https://example.com/cv001-promo.mp4"]);

    const adminAll = response();
    await adminController.getAdminScreensaver({ query: { kioskId: "all" } }, adminAll);
    assert.strictEqual(adminAll.code, 200);
    assert.ok(adminAll.body.global);
    assert.ok(adminAll.body.kiosks["CV-001"]);
    assert.ok(adminAll.body.kiosks["SV-002"]);
  });

  test("POST /admin/upload-url namespaces screensaver files under kiosk folder", async () => {
    seed({});
    const res = response();
    await adminController.postGetAdminUploadUrl({
      body: {
        fileName: "promo.mp4",
        contentType: "video/mp4",
        purpose: "screensaver",
        kioskId: "CV-001"
      }
    }, res);

    assert.strictEqual(res.code, 200);
    assert.ok(res.body.uploadUrl);
    assert.ok(res.body.fileUrl.includes("screensaver%2FCV-001%2F"), "fileUrl should be scoped to CV-001 folder");
  });
});
