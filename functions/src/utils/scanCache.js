// Short-lived in-memory cache for full-collection reads that back read-only admin dashboards.
// Every dashboard call used to re-read all of users/orders/print_jobs; Firestore bills per document
// read, so a few open dashboard tabs auto-refreshing cost millions of reads a day. Entries expire on a
// TTL, and concurrent callers share one in-flight read. Never use this for anything on the print,
// payment or kiosk paths — those must always see live data.
// 15 min: the dashboards auto-refresh every 20 min, and a cold Cloud Run instance re-reads whole collections, so a
// short TTL turned every dashboard open into tens of thousands of reads (see the Nov 2026 read-burst investigation).
const TTL_MS = Number(process.env.ADMIN_SCAN_CACHE_TTL_MS ?? 15 * 60 * 1000);

// Off under `node --test` (NODE_TEST_CONTEXT) so cached snapshots can't leak between test cases.
const disabled = () => TTL_MS <= 0 || process.env.NODE_ENV === "test" || !!process.env.NODE_TEST_CONTEXT;

const entries = new Map(); // cache key -> { expires, promise }

/** Returns loader()'s promise, shared by every caller with the same key until it expires (ttlMs, default TTL_MS). */
function cachedValue(key, loader, ttlMs = TTL_MS) {
  if (disabled() || ttlMs <= 0) return loader();

  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.promise;

  const promise = loader();
  entries.set(key, { expires: now + ttlMs, promise });
  // A failed read must not be served again for the whole TTL.
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
}

function cachedCollectionGet(db, collectionName) {
  return cachedValue(`collection:${collectionName}`, () => db.collection(collectionName).get());
}

function clearScanCache() {
  entries.clear();
}

module.exports = { cachedValue, cachedCollectionGet, clearScanCache };
