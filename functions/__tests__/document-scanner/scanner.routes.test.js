const test = require("node:test");
const assert = require("node:assert/strict");
require("../helpers/quiet");
const { createFakeFirestore } = require("../helpers/fakeFirestore");

// Prevent any real Firebase calls
createFakeFirestore().install();

const { authMiddleware } = require("../../src/middleware/auth");
const {
  postCreateSession,
  getSession,
  postAddPage,
  deletePage,
  postReorderPages,
  patchPage,
  postFinalizeSession,
} = require("../../src/document-scanner/scanner.controller");
const router = require("../../src/document-scanner/scanner.routes");

function getRouteLayer(path, method = "post") {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  return layer ? layer.route : null;
}

test("1. POST /sessions route is registered", () => {
  const route = getRouteLayer("/sessions", "post");
  assert.ok(route, "POST /sessions route must be registered");
  assert.equal(route.path, "/sessions");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, postCreateSession);
});

test("2. GET /sessions/:sessionId route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId", "get");
  assert.ok(route, "GET /sessions/:sessionId route must be registered");
  assert.equal(route.path, "/sessions/:sessionId");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, getSession);
});

test("3. POST /sessions/:sessionId/pages route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId/pages", "post");
  assert.ok(route, "POST /sessions/:sessionId/pages route must be registered");
  assert.equal(route.path, "/sessions/:sessionId/pages");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, postAddPage);
});

test("4. DELETE /sessions/:sessionId/pages/:pageId route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId/pages/:pageId", "delete");
  assert.ok(route, "DELETE /sessions/:sessionId/pages/:pageId route must be registered");
  assert.equal(route.path, "/sessions/:sessionId/pages/:pageId");
  assert.equal(route.methods.delete, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, deletePage);
});

test("5. PATCH /sessions/:sessionId/pages/:pageId route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId/pages/:pageId", "patch");
  assert.ok(route, "PATCH /sessions/:sessionId/pages/:pageId route must be registered");
  assert.equal(route.path, "/sessions/:sessionId/pages/:pageId");
  assert.equal(route.methods.patch, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, patchPage);
});

test("6. POST /sessions/:sessionId/reorder route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId/reorder", "post");
  assert.ok(route, "POST /sessions/:sessionId/reorder route must be registered");
  assert.equal(route.path, "/sessions/:sessionId/reorder");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, postReorderPages);
});

test("7. POST /sessions/:sessionId/finalize route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId/finalize", "post");
  assert.ok(route, "POST /sessions/:sessionId/finalize route must be registered");
  assert.equal(route.path, "/sessions/:sessionId/finalize");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, postFinalizeSession);
});

test("8. Router exposes only the expected scanner routes", () => {
  const registeredRoutes = router.stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path,
      methods: Object.keys(l.route.methods),
    }));

  assert.deepEqual(registeredRoutes, [
    { path: "/sessions", methods: ["post"] },
    { path: "/sessions/:sessionId", methods: ["get"] },
    { path: "/sessions/:sessionId/pages", methods: ["post"] },
    { path: "/sessions/:sessionId/pages/:pageId", methods: ["delete"] },
    { path: "/sessions/:sessionId/pages/:pageId", methods: ["patch"] },
    { path: "/sessions/:sessionId/reorder", methods: ["post"] },
    { path: "/sessions/:sessionId/finalize", methods: ["post"] },
  ]);
});
