import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_VALIDITY_MS,
  getJobTimestamp,
  formatValidTillDate,
  getTimeLeft,
  isCodeActive,
} from "./print-code-expiry.ts";

test("getJobTimestamp correctly extracts timestamps from all supported formats", () => {
  const baseTime = 1770000000000;

  // 1. Explicit createdAtTime
  assert.strictEqual(getJobTimestamp({ createdAtTime: baseTime }), baseTime);

  // 2. createdAt as number
  assert.strictEqual(getJobTimestamp({ createdAt: baseTime }), baseTime);

  // 3. createdAt as Firestore Timestamp object with toDate()
  assert.strictEqual(
    getJobTimestamp({ createdAt: { toDate: () => new Date(baseTime) } }),
    baseTime
  );

  // 4. createdAt as Firestore Timestamp serialized { seconds, nanoseconds }
  assert.strictEqual(
    getJobTimestamp({ createdAt: { seconds: Math.floor(baseTime / 1000), nanoseconds: 0 } }),
    Math.floor(baseTime / 1000) * 1000
  );

  // 5. createdAt as ISO string
  const isoStr = new Date(baseTime).toISOString();
  assert.strictEqual(getJobTimestamp({ createdAt: isoStr }), baseTime);

  // 6. date string fallback
  assert.strictEqual(getJobTimestamp({ date: isoStr }), baseTime);

  // 7. Missing / empty / invalid cases
  assert.strictEqual(getJobTimestamp(null), 0);
  assert.strictEqual(getJobTimestamp(undefined), 0);
  assert.strictEqual(getJobTimestamp({}), 0);
  assert.strictEqual(getJobTimestamp({ createdAtTime: NaN }), 0);
  assert.strictEqual(getJobTimestamp({ createdAtTime: -50 }), 0);
  assert.strictEqual(getJobTimestamp({ date: "invalid-date-string" }), 0);
});

test("formatValidTillDate formats date correctly", () => {
  // A specific fixed date: 2026-10-16 20:18:00 (Oct 16, 8:18 PM)
  const d = new Date(2026, 9, 16, 20, 18);
  const formatted = formatValidTillDate(d);
  assert.match(formatted, /16 Oct/);
  assert.match(formatted, /8:18/);
  assert.match(formatted, /PM/i);

  assert.strictEqual(formatValidTillDate(new Date(NaN)), "");
  assert.strictEqual(formatValidTillDate(null as any), "");
});

test("getTimeLeft calculates remaining time and formatting for multiple time windows", () => {
  const now = 1770000000000; // Reference "now"

  // Case 1: Freshly created code (5 minutes ago -> ~23h 55m remaining)
  const job5m = { createdAtTime: now - 5 * 60 * 1000 };
  const res5m = getTimeLeft(job5m, now);
  assert.strictEqual(res5m.isExpired, false);
  assert.strictEqual(res5m.hours, 23);
  assert.strictEqual(res5m.minutes, 55);
  assert.strictEqual(res5m.text, "Expires in 23h 55m");
  assert.strictEqual(res5m.shortText, "23h 55m left");
  assert.strictEqual(res5m.urgency, "normal");
  assert.ok(res5m.validTillText.length > 0);

  // Case 2: 12 hours ago -> 12h 0m remaining
  const job12h = { createdAtTime: now - 12 * 60 * 60 * 1000 };
  const res12h = getTimeLeft(job12h, now);
  assert.strictEqual(res12h.isExpired, false);
  assert.strictEqual(res12h.hours, 12);
  assert.strictEqual(res12h.minutes, 0);
  assert.strictEqual(res12h.text, "Expires in 12h 0m");
  assert.strictEqual(res12h.shortText, "12h 0m left");
  assert.strictEqual(res12h.urgency, "normal");

  // Case 3: 22 hours and 30 minutes ago -> 1h 30m remaining (warning urgency: < 2 hours)
  const job22h30 = { createdAtTime: now - (22 * 60 + 30) * 60 * 1000 };
  const res22h30 = getTimeLeft(job22h30, now);
  assert.strictEqual(res22h30.isExpired, false);
  assert.strictEqual(res22h30.hours, 1);
  assert.strictEqual(res22h30.minutes, 30);
  assert.strictEqual(res22h30.text, "Expires in 1h 30m");
  assert.strictEqual(res22h30.urgency, "warning");

  // Case 4: 23 hours and 15 minutes ago -> 45m 12s remaining (critical urgency: < 1 hour, showing seconds)
  const job45m = { createdAtTime: now - (23 * 3600 + 14 * 60 + 48) * 1000 };
  const res45m = getTimeLeft(job45m, now);
  assert.strictEqual(res45m.isExpired, false);
  assert.strictEqual(res45m.hours, 0);
  assert.strictEqual(res45m.minutes, 45);
  assert.strictEqual(res45m.seconds, 12);
  assert.strictEqual(res45m.text, "Expires in 45m 12s");
  assert.strictEqual(res45m.shortText, "45m 12s left");
  assert.strictEqual(res45m.urgency, "critical");

  // Case 5: 23 hours, 59 minutes, 30 seconds ago -> 30s remaining
  const job30s = { createdAtTime: now - (CODE_VALIDITY_MS - 30 * 1000) };
  const res30s = getTimeLeft(job30s, now);
  assert.strictEqual(res30s.isExpired, false);
  assert.strictEqual(res30s.hours, 0);
  assert.strictEqual(res30s.minutes, 0);
  assert.strictEqual(res30s.seconds, 30);
  assert.strictEqual(res30s.text, "Expires in 30s");
  assert.strictEqual(res30s.shortText, "30s left");
  assert.strictEqual(res30s.urgency, "critical");

  // Case 6: Exactly 24 hours ago (0 ms left) -> Expired
  const jobExpiredExact = { createdAtTime: now - CODE_VALIDITY_MS };
  const resExpiredExact = getTimeLeft(jobExpiredExact, now);
  assert.strictEqual(resExpiredExact.isExpired, true);
  assert.strictEqual(resExpiredExact.remainingMs, 0);
  assert.strictEqual(resExpiredExact.text, "Code expired");
  assert.strictEqual(resExpiredExact.shortText, "Expired");
  assert.strictEqual(resExpiredExact.urgency, "critical");

  // Case 7: Past 24 hours (e.g. 25 hours ago) -> Expired
  const jobExpired25h = { createdAtTime: now - 25 * 60 * 60 * 1000 };
  const resExpired25h = getTimeLeft(jobExpired25h, now);
  assert.strictEqual(resExpired25h.isExpired, true);
  assert.strictEqual(resExpired25h.remainingMs, 0);
  assert.strictEqual(resExpired25h.text, "Code expired");
  assert.strictEqual(resExpired25h.shortText, "Expired");

  // Case 8: Missing timestamp fallback
  const resFallback = getTimeLeft({}, now);
  assert.strictEqual(resFallback.isExpired, false);
  assert.strictEqual(resFallback.text, "Valid for 24h");
  assert.strictEqual(resFallback.shortText, "24h validity");
});

test("isCodeActive correctly filters valid unused paid print codes", () => {
  const now = 1770000000000;

  // Active paid job created 2 hours ago
  const validJob = {
    id: "job1",
    printCode: "1418",
    status: "paid",
    isPrinted: false,
    createdAtTime: now - 2 * 60 * 60 * 1000,
  };
  assert.strictEqual(isCodeActive(validJob, now), true);

  // Expired job (> 24 hours)
  const expiredJob = {
    ...validJob,
    createdAtTime: now - 25 * 60 * 60 * 1000,
  };
  assert.strictEqual(isCodeActive(expiredJob, now), false);

  // Already printed job
  const printedJob = {
    ...validJob,
    isPrinted: true,
  };
  assert.strictEqual(isCodeActive(printedJob, now), false);

  // Status not paid (e.g. "completed", "failed", "pending")
  assert.strictEqual(isCodeActive({ ...validJob, status: "completed" }, now), false);
  assert.strictEqual(isCodeActive({ ...validJob, status: "failed" }, now), false);
  assert.strictEqual(isCodeActive({ ...validJob, status: "pending" }, now), false);

  // Missing or placeholder printCode
  assert.strictEqual(isCodeActive({ ...validJob, printCode: "" }, now), false);
  assert.strictEqual(isCodeActive({ ...validJob, printCode: "-" }, now), false);
  assert.strictEqual(isCodeActive({ ...validJob, printCode: null as any }, now), false);

  // Null or empty job
  assert.strictEqual(isCodeActive(null, now), false);
  assert.strictEqual(isCodeActive(undefined, now), false);
  assert.strictEqual(isCodeActive({}, now), false);
});
