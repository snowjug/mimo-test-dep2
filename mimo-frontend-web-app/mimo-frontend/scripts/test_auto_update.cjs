/**
 * Comprehensive Test Suite for MIMO 1.0 Frontend Auto-Update Mechanism
 *
 * This test suite includes:
 * 1. PURE DECISION LOGIC TESTS: Directly tests `evaluateUpdateDecision` exported from `useAutoUpdate.ts`.
 * 2. REAL REACT HOOK EXECUTION TESTS: Directly imports and executes the actual `useAutoUpdate` React hook
 *    using React 19 `createRoot` and `act`, verifying real React ref synchronization, layout effects,
 *    mocked `fetch`, and mocked `window.location.reload`.
 */

const assert = require('assert');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');

// Setup minimal DOM environment for React 19 hook rendering in Node
class MockNode {
  constructor(nodeType = 1, nodeName = 'DIV') {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.tagName = nodeName;
    this.childNodes = [];
    this.style = {};
    this.ownerDocument = global.document;
  }
  appendChild(child) { this.childNodes.push(child); return child; }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    return child;
  }
  insertBefore(newChild, refChild) {
    const idx = this.childNodes.indexOf(refChild);
    if (idx !== -1) this.childNodes.splice(idx, 0, newChild);
    else this.childNodes.push(newChild);
    return newChild;
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
  removeAttribute() {}
}

global.Node = MockNode;
global.Element = MockNode;
global.HTMLElement = MockNode;
global.HTMLIFrameElement = class HTMLIFrameElement extends MockNode {};

const mockDoc = {
  nodeType: 9,
  nodeName: '#document',
  createElement(tag) { return new MockNode(1, tag.toUpperCase()); },
  createElementNS(ns, tag) { return new MockNode(1, tag.toUpperCase()); },
  createTextNode(text) {
    const node = new MockNode(3, '#text');
    node.nodeValue = text;
    return node;
  },
  createComment(text) {
    const node = new MockNode(8, '#comment');
    node.nodeValue = text;
    return node;
  },
  documentElement: new MockNode(1, 'HTML'),
  body: new MockNode(1, 'BODY'),
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
};
mockDoc.ownerDocument = mockDoc;
mockDoc.defaultView = global;

global.window = global;
global.document = mockDoc;
global.IS_REACT_ACT_ENVIRONMENT = true;

async function runTests() {
  console.log('================================================================');
  console.log('  MIMO 1.0 AUTO-UPDATE VERIFICATION & TEST SUITE');
  console.log('================================================================\n');

  // Dynamically load the actual production TypeScript hook module
  const { useAutoUpdate, evaluateUpdateDecision } = await import('../src/hooks/useAutoUpdate.ts');

  // --------------------------------------------------------------------------
  // SECTION 1: PURE DECISION EVALUATOR TESTS (Actual Production Function)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Pure Decision Function (evaluateUpdateDecision) ---');
  {
    // 1a. Matching versions -> no reload
    assert.deepStrictEqual(
      evaluateUpdateDecision({ localVersion: '100', remoteVersion: '100', isIdle: true, updateAlreadyPending: false }),
      { shouldReload: false, shouldSetPending: false }
    );
    // 1b. New version + idle -> immediate reload
    assert.deepStrictEqual(
      evaluateUpdateDecision({ localVersion: '100', remoteVersion: '101', isIdle: true, updateAlreadyPending: false }),
      { shouldReload: true, shouldSetPending: true }
    );
    // 1c. New version + active session -> defer reload
    assert.deepStrictEqual(
      evaluateUpdateDecision({ localVersion: '100', remoteVersion: '101', isIdle: false, updateAlreadyPending: false }),
      { shouldReload: false, shouldSetPending: true }
    );
    // 1d. Dev mode -> never reload
    assert.deepStrictEqual(
      evaluateUpdateDecision({ localVersion: 'dev', remoteVersion: '101', isIdle: true, updateAlreadyPending: false }),
      { shouldReload: false, shouldSetPending: false }
    );
    assert.deepStrictEqual(
      evaluateUpdateDecision({ localVersion: '100', remoteVersion: 'dev', isIdle: true, updateAlreadyPending: false }),
      { shouldReload: false, shouldSetPending: false }
    );
    // 1e. Null / invalid payload -> no reload
    assert.deepStrictEqual(
      evaluateUpdateDecision({ localVersion: '100', remoteVersion: null, isIdle: true, updateAlreadyPending: false }),
      { shouldReload: false, shouldSetPending: false }
    );
    console.log('✅ Passed: evaluateUpdateDecision handles all decision states correctly.');
  }

  // --------------------------------------------------------------------------
  // SECTION 2: REAL REACT HOOK EXECUTION TESTS (Actual `useAutoUpdate` Hook)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Actual `useAutoUpdate` React Hook Execution Tests ---');

  // Test Component that executes the real hook
  function AutoUpdateHarnessComponent({ isIdle, checkIntervalMs }) {
    useAutoUpdate({ isIdle, checkIntervalMs });
    return React.createElement('div', null, isIdle ? 'idle' : 'active');
  }

  // Helper to mount and control the test component with real React 19 root
  function createHookTester({ initialIdle = true, checkIntervalMs = 60000, buildId = '100' }) {
    global.__APP_BUILD_ID__ = buildId;
    let reloadCallCount = 0;
    global.window.location = {
      reload: () => {
        reloadCallCount++;
      },
    };

    const container = new MockNode(1, 'DIV');
    const root = createRoot(container);

    const render = async (isIdle) => {
      await act(async () => {
        root.render(
          React.createElement(AutoUpdateHarnessComponent, { isIdle, checkIntervalMs })
        );
      });
    };

    const unmount = async () => {
      await act(async () => {
        root.unmount();
      });
    };

    return {
      render,
      unmount,
      getReloadCount: () => reloadCallCount,
    };
  }

  // TEST 2.1: New version detected while idle -> triggers exactly one reload
  console.log('  [2.1] Real Hook: New version detected while idle -> triggers exactly 1 reload');
  {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ version: '101' }),
    });

    const tester = createHookTester({ initialIdle: true, buildId: '100' });
    try {
      await tester.render(true);
      // Allow microtasks to complete
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      assert.strictEqual(tester.getReloadCount(), 1, 'Real hook must trigger reload once when idle');
      console.log('  ✅ Passed');
    } finally {
      await tester.unmount();
    }
  }

  // TEST 2.2: New version detected during active customer session -> reload deferred
  console.log('  [2.2] Real Hook: New version detected during active session -> reload deferred (0 reloads)');
  {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ version: '101' }),
    });

    const tester = createHookTester({ initialIdle: false, buildId: '100', checkIntervalMs: 50 });
    try {
      await tester.render(false);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      assert.strictEqual(tester.getReloadCount(), 0, 'Real hook must NEVER reload during an active session');
      console.log('  ✅ Passed');
    } finally {
      await tester.unmount();
    }
  }

  // TEST 2.3: Microtask race condition: Fetch starts while idle, kiosk becomes active before fetch resolves
  console.log('  [2.3] Real Hook: Fetch started while idle resolves after kiosk becomes active -> NO reload');
  {
    let resolveFetchPromise;
    const fetchDeferred = new Promise((resolve) => {
      resolveFetchPromise = resolve;
    });

    global.fetch = () => fetchDeferred;

    const tester = createHookTester({ initialIdle: true, buildId: '100' });
    try {
      // Mount while idle -> checkForUpdate() initiates fetch
      await tester.render(true);

      // Customer starts interacting (PIN entered / screen touched) -> re-render with isIdle=false
      await tester.render(false);

      // Network response finally arrives
      await act(async () => {
        resolveFetchPromise({
          ok: true,
          json: async () => ({ version: '101' }),
        });
        await new Promise((r) => setTimeout(r, 20));
      });

      assert.strictEqual(
        tester.getReloadCount(),
        0,
        'Real hook with useLayoutEffect & render sync MUST NOT reload when session transitioned to active mid-fetch'
      );

      // TEST 2.4: Transition back to idle triggers the deferred reload
      console.log('  [2.4] Real Hook: Returning to idle after pending update -> triggers exactly 1 reload');
      await tester.render(true);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      assert.strictEqual(tester.getReloadCount(), 1, 'Deferred update must execute upon returning to idle');
      console.log('  ✅ Passed');
    } finally {
      await tester.unmount();
    }
  }

  // TEST 2.5: Repeated polls and network failures do not cause duplicate or unsafe reloads
  console.log('  [2.5] Real Hook: Network failures (500, 404, offline) and repeated polls handled safely');
  {
    let fetchAttempt = 0;
    global.fetch = async () => {
      fetchAttempt++;
      if (fetchAttempt === 1) return { ok: false, status: 500 };
      if (fetchAttempt === 2) return { ok: false, status: 404 };
      if (fetchAttempt === 3) throw new TypeError('Failed to fetch (offline)');
      return { ok: true, json: async () => ({ version: '100' }) }; // Same version
    };

    const tester = createHookTester({ initialIdle: true, buildId: '100', checkIntervalMs: 20 });
    try {
      await tester.render(true);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      assert.strictEqual(tester.getReloadCount(), 0, 'No reload should occur on network errors or same version');
      console.log('  ✅ Passed');
    } finally {
      await tester.unmount();
    }
  }

  // TEST 2.6: Development mode never triggers automatic reload
  console.log('  [2.6] Real Hook: Development mode (version="dev") never reloads');
  {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ version: '101' }),
    });

    const tester = createHookTester({ initialIdle: true, buildId: 'dev' });
    try {
      await tester.render(true);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      assert.strictEqual(tester.getReloadCount(), 0, 'Dev mode must never trigger reload');
      console.log('  ✅ Passed');
    } finally {
      await tester.unmount();
    }
  }

  console.log('\n================================================================');
  console.log('🎉 ALL AUTO-UPDATE TESTS PASSED SUCCESSFULLY (REAL HOOK + PURE DECISION)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});


