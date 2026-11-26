const test = require("node:test");
const assert = require("node:assert");
const { seed, response } = require("./helpers/orderHarness");
const kioskTheme = require("../src/controllers/kioskTheme.controller");

test.describe("Kiosk festival themes", () => {
  test("GET /api/kiosk-theme answers 'default' when nothing has been set", async () => {
    seed({});
    const res = response();
    await kioskTheme.getApiKioskTheme({ query: { kioskId: "sv-002" } }, res);
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.kioskId, "SV-002");
    assert.strictEqual(res.body.theme, "default");
  });

  test("admin can switch one kiosk to christmas without touching the others", async () => {
    seed({});
    const res = response();
    await kioskTheme.postAdminKioskThemes({ body: { themes: { "SV-002": "christmas" } }, user: { email: "admin@example.com" } }, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.body.themes, { "CV-001": "default", "SV-002": "christmas", "SV-003": "default" });

    const sv = response();
    await kioskTheme.getApiKioskTheme({ query: { kioskId: "SV-002" } }, sv);
    assert.strictEqual(sv.body.theme, "christmas");
    const cv = response();
    await kioskTheme.getApiKioskTheme({ query: { kioskId: "CV-001" } }, cv);
    assert.strictEqual(cv.body.theme, "default");

    const back = response();
    await kioskTheme.postAdminKioskThemes({ body: { themes: { "SV-002": "default" } } }, back);
    assert.strictEqual(back.body.themes["SV-002"], "default");
  });

  test("GET /admin/kiosk-themes lists every kiosk and the available themes", async () => {
    seed({});
    const res = response();
    await kioskTheme.getAdminKioskThemes({}, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(Object.keys(res.body.themes).sort(), ["CV-001", "SV-002", "SV-003"]);
    assert.ok(res.body.available.includes("default") && res.body.available.includes("christmas"));
  });

  test("unknown kiosks and unknown themes are rejected and nothing is saved", async () => {
    seed({});
    const badKiosk = response();
    await kioskTheme.postAdminKioskThemes({ body: { themes: { "XX-999": "christmas" } } }, badKiosk);
    assert.strictEqual(badKiosk.code, 400);
    const badTheme = response();
    await kioskTheme.postAdminKioskThemes({ body: { themes: { "SV-002": "halloween" } } }, badTheme);
    assert.strictEqual(badTheme.code, 400);
    const notObject = response();
    await kioskTheme.postAdminKioskThemes({ body: { themes: ["SV-002"] } }, notObject);
    assert.strictEqual(notObject.code, 400);

    const res = response();
    await kioskTheme.getApiKioskTheme({ query: { kioskId: "SV-002" } }, res);
    assert.strictEqual(res.body.theme, "default");
  });

  test("a corrupted stored value falls back to the default UI", async () => {
    seed({});
    const ok = response();
    await kioskTheme.postAdminKioskThemes({ body: { themes: { "CV-001": "christmas" } } }, ok);
    assert.strictEqual(ok.code, 200);
    // simulate a bad manual edit in Firestore
    const { db } = require("../src/config/firebase");
    await db.collection("mimo_settings").doc("kiosk_themes").set({ themes: { "CV-001": "neon-party" } }, { merge: true });
    const res = response();
    await kioskTheme.getApiKioskTheme({ query: { kioskId: "CV-001" } }, res);
    assert.strictEqual(res.body.theme, "default");
  });
});
