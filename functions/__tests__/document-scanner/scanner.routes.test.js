const test = require("node:test");
const assert = require("node:assert/strict");
require("../helpers/quiet");
const { createFakeFirestore } = require("../helpers/fakeFirestore");

// Prevent any real Firebase calls
createFakeFirestore().install();

const { authMiddleware } = require("../../src/middleware/auth");
const {
  postCreateSession,
  postAddPage,
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
});

test("2. POST /sessions/:sessionId/pages route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId/pages", "post");
  assert.ok(route, "POST /sessions/:sessionId/pages route must be registered");
  assert.equal(route.path, "/sessions/:sessionId/pages");
  assert.equal(route.methods.post, true);
});

test("3. POST /sessions/:sessionId/finalize route is registered", () => {
  const route = getRouteLayer("/sessions/:sessionId/finalize", "post");
  assert.ok(route, "POST /sessions/:sessionId/finalize route must be registered");
  assert.equal(route.path, "/sessions/:sessionId/finalize");
  assert.equal(route.methods.post, true);
});

test("4. POST /sessions places authMiddleware before postCreateSession", () => {
  const route = getRouteLayer("/sessions", "post");
  assert.ok(route, "POST /sessions route must exist");
  assert.equal(route.stack.length, 2, "POST /sessions must have exactly 2 middleware/handlers");
  assert.equal(
    route.stack[0].handle,
    authMiddleware,
    "First middleware in chain must be authMiddleware"
  );
  assert.equal(
    route.stack[1].handle,
    postCreateSession,
    "Second handler in chain must be postCreateSession"
  );
});

test("5. POST /sessions/:sessionId/pages places authMiddleware before postAddPage", () => {
  const route = getRouteLayer("/sessions/:sessionId/pages", "post");
  assert.ok(route, "POST /sessions/:sessionId/pages route must exist");
  assert.equal(
    route.stack.length,
    2,
    "POST /sessions/:sessionId/pages must have exactly 2 middleware/handlers"
  );
  assert.equal(
    route.stack[0].handle,
    authMiddleware,
    "First middleware in chain must be authMiddleware"
  );
  assert.equal(
    route.stack[1].handle,
    postAddPage,
    "Second handler in chain must be postAddPage"
  );
});

test("6. POST /sessions/:sessionId/finalize places authMiddleware before postFinalizeSession", () => {
  const route = getRouteLayer("/sessions/:sessionId/finalize", "post");
  assert.ok(route, "POST /sessions/:sessionId/finalize route must exist");
  assert.equal(
    route.stack.length,
    2,
    "POST /sessions/:sessionId/finalize must have exactly 2 middleware/handlers"
  );
  assert.equal(
    route.stack[0].handle,
    authMiddleware,
    "First middleware in chain must be authMiddleware"
  );
  assert.equal(
    route.stack[1].handle,
    postFinalizeSession,
    "Second handler in chain must be postFinalizeSession"
  );
});

test("7. Router exposes only the expected scanner routes", () => {
  const registeredRoutes = router.stack
    .filter((l) => l.route)
    .map((l) => ({
      path: l.route.path,
      methods: Object.keys(l.route.methods),
    }));

  assert.deepEqual(registeredRoutes, [
    { path: "/sessions", methods: ["post"] },
    { path: "/sessions/:sessionId/pages", methods: ["post"] },
    { path: "/sessions/:sessionId/finalize", methods: ["post"] },
  ]);
});
