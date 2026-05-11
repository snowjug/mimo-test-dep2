# Backend Optimization Reference

This document summarizes recent optimization patterns found in the backend and gives prioritized, actionable recommendations your friend can use to further optimize the service.

---

## Quick summary of implemented optimizations

- PDF caching (in-memory): `mimo-backend/api/server.js` implements a simple in-process `pdfCache` Map with TTL (15 minutes), eviction when `PDF_CACHE_MAX_MB` is reached, and a periodic sweep to drop expired entries. This reduces repeated downloads/conversions for recent prints.

- Print-job retention cleanup: `mimo-backend/api/print-job-retention.js` uses parallel queries (Promise.all) to find expired and legacy print jobs, deduplicates results, deletes storage objects and Firestore docs, and exposes a scheduled cleanup timer with `timer.unref()`.

- Operation safety helpers: `withTimeout()` wrapper used to bound long-running promises; `emitOpsAlert()` records alerts and posts to an ops webhook; `normalizeApiError()` centralizes API error shapes.

- Helper utilities: `flow-utils.js` provides structured summaries and alert-detection for operational dashboards (backlog score, low virtual stock detection).

- Controlled conversions: file conversion uses `libre.convert` wrapped via `promisify` and call sites include timeouts/guards.

---

## Short analysis / trade-offs (what's good and what to watch for)

- In-memory PDF cache is simple and fast for a single-instance process, but:
  - It does not share cache across multiple instances (ineffective under horizontal scaling).
  - Eviction is FIFO (Map insertion order) rather than LRU; frequent hot items may be evicted spuriously.
  - Using process memory risks OOM if other allocations spike; cache size must be tuned.

- Retention cleanup is robust for different schema shapes and avoids double-deletes by deduping doc ids. However:
  - Deletions are performed serially and may be slow when many docs found.
  - Running on multiple app instances can result in duplicate work; there is no leader election or single-scheduler guarantee.

- Unique PIN generator currently polls Firestore up to 20 times; under high concurrency this can race and fail.

- File operations (download, convert) often load entire files into memory (Buffers) — this increases memory pressure and GC activity for large PDFs.

- External calls (storage, HTTP, libre convert) have timeouts in places, but not always uniformly instrumented with retries/backoff.

---

## Prioritized recommendations (actionable)

1) Replace in-process PDF cache with a proper LRU cache or a shared cache
- Short-term: swap the Map for an `lru-cache` (npm) instance configured by `PDF_CACHE_MAX_MB`. This gives true LRU eviction and TTL support.
- Long-term / multi-instance: move cache to Redis/Cloud Memorystore so all app instances share the same cache and memory usage is offloaded from Node processes.

2) Stream files rather than Buffering where possible
- Replace `file.download()` + full Buffer usage with streaming (e.g., `file.createReadStream()` piped into the converter or to the FastAPI service) to reduce memory spikes.

3) Offload heavy CPU work to workers/queues
- Move PDF conversion to a worker (Cloud Run / Cloud Tasks / a background worker pool). The HTTP server should enqueue conversion tasks and return quickly; workers do the heavy `libre.convert` work. This prevents the main instance from CPU blocking and OOM.

4) Harden and scale retention cleanup
- Use Firestore TTL for document expiry where possible (auto-delete docs), and/or run a single scheduled job (Cloud Scheduler / Cloud Function) to avoid multiple instances performing the same cleanup.
- When deleting many docs/objects, batch Firestore deletes in groups (max 500 per batch) and perform storage deletes in parallel but bounded concurrency.

5) Improve unique PIN generation for atomicity
- Avoid repeated read queries for uniqueness in hot paths. Use a `pins` collection and attempt a conditional `create` (transaction or `create()` that fails if exists), or use a longer nonce. This reduces race conditions under high concurrent PIN generation.

6) Add uniform timeouts, retries and circuit-breakers
- Wrap all external calls (storage, axios to FastAPI, libre convert) with a consistent helper that provides timeout, retry with exponential backoff, and optional circuit-breaker to avoid cascading failures.

7) Add observability and throttles
- Emit metrics for cache hit/miss, conversion queue depth, conversion latency, retention deletions per run.
- Add rate limits / request size limits on upload endpoints and protect long-running endpoints.

8) Protect multi-instance behavior
- Ensure scheduled timers are not run concurrently across instances (use a Cloud Scheduler + single worker, or leader election via Firestore lock document).

9) Secure and validate env/config
- Validate numeric envs (e.g., `PDF_CACHE_MAX_MB`) at startup and fail fast with clear messages if invalid.

---

## Quick code pointers (files to inspect)

- [mimo-backend/api/server.js](mimo-backend/api/server.js) — PDF cache, download/convert flow, `withTimeout`, PIN generation.
- [mimo-backend/api/print-job-retention.js](mimo-backend/api/print-job-retention.js) — cleanup logic and scheduling.
- [mimo-backend/api/flow-utils.js](mimo-backend/api/flow-utils.js) — ops summary and alert detection hooks.
- [mimo-backend/api/firebase.js](mimo-backend/api/firebase.js) — Firebase/Storage client settings and auth (review retry/backoff options).

---

## Suggested first pull requests (small, review-friendly)

- PR 1: Replace `pdfCache` Map with `lru-cache` and wire `PDF_CACHE_MAX_MB` as capacity.
- PR 2: Stream download->convert pipeline: use storage read stream piped into converter or upload stream to conversion worker.
- PR 3: Add batched deletes for retention cleanup (500-per-batch) and limit parallelism when deleting storage objects.
- PR 4: Add a small Redis-backed cache option and a feature flag to enable it.

---

## Notes & caveats

- Some recommendations (Redis, Cloud Scheduler, Cloud Tasks) require infra changes and credentials.
- If the app is deployed to a single-instance runtime (cheap host), in-process caches are acceptable; but when scaling horizontally, move to central services.

---

If you want, I can open PRs for any of the small-scope items above (start with `lru-cache` replacement and streaming download).