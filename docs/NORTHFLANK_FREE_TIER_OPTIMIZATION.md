# Northflank Free Tier Optimization Guide

## Problem Statement

Current infrastructure constraints:
- **CPU:** 0.2 vCPU (1/5th of a core)
- **Memory:** 512 MB
- **Instances:** 1 (no auto-scaling)
- **Impact:** 12% payment failure rate (198 failed orders out of 1,626)

### Root Cause Analysis

During payment processing and concurrent kiosk prints, the backend:
1. Loads entire PDF into memory (150-200 MB per file)
2. Runs CPU-intensive LibreOffice conversions synchronously
3. Downloads files while handling other requests
4. Hits OOM (Out of Memory) and crashes pod
5. Payment webhook fires during restart → Firestore write fails
6. Order stuck in "created" state permanently

**Evidence:**
- Multiple deployments show `0 / 1` (pod crash)
- Peak day (119 orders): likely saw cascading failures
- Free tier forces single-threaded blocking operations

## Solution Architecture

### 1. PDF Caching (15-min TTL)
- **What:** Store downloaded PDFs in-memory with expiry
- **When:** Prefetch after payment-success, use during kiosk print
- **Benefit:** PIN→Print drops from 3-8s to <1s (cached case)
- **Memory:** ~5-10 MB per cached PDF, max 20 cached = 100-200 MB (acceptable)

### 2. Async File Conversion
- **What:** Don't convert on upload; queue for background processing
- **When:** Return immediately, convert every 30-60 seconds
- **Benefit:** Upload endpoint returns in <500ms (was 5-15s)
- **Memory:** No large conversions during request handling

### 3. PDF Streaming
- **What:** Use file streams instead of loading buffers
- **When:** Send PDF to printer via FastAPI
- **Benefit:** ~145 MB freed per request
- **Effect:** Allows 2-3 concurrent prints instead of 1

### 4. Graceful Degradation
- **What:** Add timeouts, fail fast instead of hanging
- **When:** Firebase ops, PDF downloads, printer dispatch
- **Benefit:** User gets error in 3s instead of 30s timeout

## Impact Projections

### Time Taken: Before vs After Optimization

| Flow | Before Optimization | After Optimization | Improvement |
|------|----------------------|--------------------|-------------|
| Upload request completion | 5-15 seconds | <500 ms | ~90-97% faster |
| PIN→Print (single user, cold path) | 3-8 seconds | ~2-5 seconds | ~35-60% faster |
| PIN→Print (single user, cache hit) | 3-8 seconds | <1 second | ~67-88% faster |
| PIN→Print (5 concurrent requests) | 20-45 seconds | 5-12 seconds | ~60-75% faster |
| API health checks (`/`, `/health`) | Not tracked previously | ~8-10 ms warm (smoke test) | Baseline established |

> Note: "After" values combine measured smoke-test results and production-target estimates for concurrent print scenarios.

### Before Optimization
| Metric | Value |
|--------|-------|
| Payment failure rate | 12.2% |
| Upload latency | 5-15 seconds |
| PIN→Print latency | 3-8 seconds (1 concurrent) |
| PIN→Print latency | 20-45 seconds (5 concurrent) |
| Memory headroom | ~50 MB available |
| Max concurrent operations | 1-2 |

### After Optimization
| Metric | Value |
|--------|-------|
| Payment failure rate | <2% (estimated) |
| Upload latency | <500 ms |
| PIN→Print latency | <2 seconds (cached) |
| PIN→Print latency | 5-12 seconds (5 concurrent) |
| Memory headroom | ~150-200 MB available |
| Max concurrent operations | 3-4 |

### Expected Revenue Recovery
- **Current failures:** 198 orders × ₹2.30 = **₹455 lost revenue/period**
- **After fix (70% recovery):** **₹318 recovered**
- **ROI:** Immediate (0 cost, code-only fix)

## Implementation Details

### A. PDF Cache with TTL

```javascript
const pdfCache = new Map();
const PDF_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Cleanup expired cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pdfCache.entries()) {
    if (value.expiry < now) {
      pdfCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes
```

**Usage:**
- After `/payment-success`: async prefetch PDF into cache
- On `/kiosk/print`: check cache first, fallback to download
- Result: Most prints hit cache (~70% hit rate)

### B. Async File Conversion

**Flow:**
1. `/upload` → validate files, save raw to Storage, return immediately
2. Jobs created with status: `"pending_conversion"`
3. Background cron (every 30-60s): `/internal/process-conversions`
4. Convert 1 file at a time, update job with PDF + page count
5. Frontend polls job status until `"pending"` (ready for payment)

**Benefits:**
- Upload returns instantly
- Conversions don't block request handling
- Can convert during low-traffic windows

### C. PDF Streaming

```javascript
// Instead of:
const [fileBuffer] = await file.download();
formData.append("file", blob, name);

// Do:
const fileStream = file.createReadStream();
formData.append("file", fileStream, name);
```

**Impact:** Node.js pipes data directly instead of buffering all in memory.

### D. Timeouts & Graceful Degradation

```javascript
const withTimeout = (promise, ms) => 
  Promise.race([promise, timeoutPromise(ms)]);

// Usage:
const pdf = await withTimeout(downloadJobPdf(jobData), 3000);
if (!pdf) {
  return res.status(503).json({ 
    error: "System busy, try again in 10 seconds" 
  });
}
```

## Migration Path

### Phase 1: Deploy Optimization (This PR)
- Add PDF cache
- Add async conversion
- Add streaming
- Add timeouts
- **Rollout:** Blue-green deployment (1 hour downtime)

### Phase 2: Monitor (Next 7 days)
- Watch payment success rate
- Monitor memory usage
- Check kiosk print latency
- Verify no regression

### Phase 3: Optional Upgrade (If needed)
- If still failures >5% after optimization
- Upgrade Northflank to 1 vCPU / 1024 MB ($15/mo)
- Not needed if optimization works

## Testing Checklist

- [ ] Upload multiple files → completes in <500ms
- [ ] Check job status transitions (pending_conversion → pending)
- [ ] Payment success → creates cached PDF
- [ ] Kiosk print (first time) → ~5-8s (download + print)
- [ ] Kiosk print (cache hit) → <1s
- [ ] Concurrent 3 kiosk prints → all complete in <10s
- [ ] Timeout test: kill FastAPI, print → error in 3s (not 30s)
- [ ] Memory usage stays below 400 MB during peak

## Monitoring After Deploy

### Key Metrics to Watch
```
POST /payment-success: success rate (target >98%)
POST /upload: latency (target <500ms)
POST /kiosk/print: latency (target <10s at 3 concurrent)
Memory usage: peak (target <450 MB)
Pod restarts: (target 0)
```

### Alert Thresholds
- Payment success <95% → rollback
- Memory >480 MB → incident
- Pod restarts > 0 → incident
- `/kiosk/print` timeout >10% of requests → investigate

## Rollback Plan

If issues occur:
1. Revert to previous commit
2. Redeploy from Northflank dashboard
3. Investigate logs via: `northflank get service logs --tail --projectId mimo-backend`

## Cost-Benefit Summary

| Item | Before | After | Benefit |
|------|--------|-------|---------|
| Revenue loss | ₹455/period | ₹136/period | +₹319 |
| User experience | 20-45s lag peaks | <10s peaks | ⬇ 60% latency |
| Infrastructure cost | $0 | $0 | None |
| Engineering effort | — | 2-3 hours | One-time |
| **ROI** | — | — | **Immediate +₹319** |

---

**Decision:** Implement all 4 optimizations before considering Northflank paid upgrade.
