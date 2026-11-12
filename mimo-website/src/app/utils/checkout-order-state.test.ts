import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearPendingOrderBinding,
  getBoundPendingOrderId,
  getCartJobSignature,
  savePendingOrderBinding,
} from "./checkout-order-state.ts";

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function resetGlobals() {
  const sessionStorage = createStorageMock();
  const localStorage = createStorageMock();
  (globalThis as any).sessionStorage = sessionStorage;
  (globalThis as any).localStorage = localStorage;
  return { sessionStorage, localStorage };
}

test("getCartJobSignature normalizes, deduplicates, and sorts jobIds consistently", () => {
  assert.strictEqual(getCartJobSignature([]), "");
  assert.strictEqual(getCartJobSignature(null), "");
  assert.strictEqual(getCartJobSignature([{ name: "no-id.pdf" }]), "");

  const sig1 = getCartJobSignature([
    { jobId: " job_b " },
    { jobId: "job_a" },
    { jobId: "job_b" },
    { jobId: "" },
  ]);
  const sig2 = getCartJobSignature([
    { jobId: "job_a" },
    { jobId: "job_b" },
  ]);

  assert.strictEqual(sig1, '["job_a","job_b"]');
  assert.strictEqual(sig1, sig2);
});

test("savePendingOrderBinding binds session and local storage and rejects cart mismatches", () => {
  const { sessionStorage, localStorage } = resetGlobals();

  savePendingOrderBinding("order_ab", [{ jobId: "job_b" }, { jobId: "job_a" }]);

  // Same cart in different order matches
  assert.strictEqual(
    getBoundPendingOrderId([{ jobId: "job_a" }, { jobId: "job_b" }]),
    "order_ab"
  );

  // Removing File B while File A remains must NOT match order_ab
  assert.strictEqual(getBoundPendingOrderId([{ jobId: "job_a" }]), null);

  // Even if localStorage still has order_ab and sessionStorage had a cleared/different order
  sessionStorage.removeItem("currentOrderId");
  sessionStorage.removeItem("currentOrderJobIds");
  assert.strictEqual(getBoundPendingOrderId([{ jobId: "job_2" }]), null);

  // Same cart can recover from localStorage if sessionStorage was wiped on mobile redirect
  assert.strictEqual(
    getBoundPendingOrderId([{ jobId: "job_a" }, { jobId: "job_b" }]),
    "order_ab"
  );

  // Clearing removes both session and local binding keys
  clearPendingOrderBinding();
  assert.strictEqual(sessionStorage.getItem("currentOrderId"), null);
  assert.strictEqual(sessionStorage.getItem("currentOrderJobIds"), null);
  assert.strictEqual(localStorage.getItem("mimo_currentOrderId"), null);
  assert.strictEqual(localStorage.getItem("mimo_currentOrderJobIds"), null);
});

test("legacy unbound currentOrderId without jobIds signature is never matched", () => {
  const { sessionStorage, localStorage } = resetGlobals();

  sessionStorage.setItem("currentOrderId", "legacy_order_1");
  localStorage.setItem("mimo_currentOrderId", "legacy_order_1");

  assert.strictEqual(getBoundPendingOrderId([{ jobId: "job_new" }]), null);

  // Also never falls back to localStorage when sessionStorage has a mismatched orderId
  sessionStorage.setItem("currentOrderId", "tab2_order");
  sessionStorage.setItem("currentOrderJobIds", '["job_other"]');
  localStorage.setItem("mimo_currentOrderId", "tab1_order");
  localStorage.setItem("mimo_currentOrderJobIds", '["job_new"]');

  assert.strictEqual(getBoundPendingOrderId([{ jobId: "job_new" }]), null);
});

