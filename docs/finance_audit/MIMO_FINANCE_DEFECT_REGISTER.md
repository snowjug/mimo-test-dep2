# MIMO FINANCE — AUDIT DEFECT REGISTER & REMEDIATION LOG

**Document ID:** FIN-QA-DEFECTS-2026-V1  
**Project:** Dedicated MIMO Finance Workspace (`http://localhost:5173/finance`)  
**Audit Period:** October 17, 2026  
**Auditor / Engineer:** Principal Security Auditor, Senior Backend Engineer & QA Lead  
**Classification:** Quality Assurance Defect Register & Resolution Evidence  

---

## 1. DEFECT CLASSIFICATION SUMMARY

| Severity | Total Identified | Remediated & Verified | Blocked / External |
| :--- | :---: | :---: | :---: |
| **Critical** | 1 | 1 | 0 |
| **High** | 2 | 2 | 0 |
| **Medium** | 2 | 2 | 0 |
| **Low** | 1 | 1 | 0 |
| **TOTAL** | **6** | **6** | **0** |

---

## 2. DETAILED DEFECT LOG

### DEFECT-001: Vite Route Rewrite Mapped `/finance` to Legacy Command Center
- **Severity:** **CRITICAL**
- **Impact:** Navigating to `http://localhost:5173/finance` rendered the obsolete admin login rather than the dedicated standalone Finance Portal.
- **Root Cause:** In `mimo-website/vite.config.ts`, requests to `/finance` were rewritten to `/app.html`. In contrast, production `vercel.json` rewrote `/finance/*` to `/admin/index.html` (where `RootApp` mounted `FinanceApp.tsx`).
- **Affected Files:**
  - `mimo-website/vite.config.ts`
- **Fix Applied:** Updated Vite development configuration with middleware that proxies `/admin/assets/*` and rewrites `/finance`, `/admin`, `/technical`, etc. to `mimo-admin-dashboard/dist/index.html`.
- **Regression Test:** Antigravity Browser Mode navigated directly to `http://localhost:5173/finance` and successfully loaded the full-screen Finance Portal with dedicated sidebar and topbar navigation.
- **Verification Status:** **REMEDIATED & VERIFIED** (Pass).

---

### DEFECT-002: Synthetic Mock Net Settled Artifact (₹4,362.50)
- **Severity:** **HIGH**
- **Impact:** Financial dashboard displayed an artificial settlement total with zero backing bank UTR records.
- **Root Cause:** Legacy `FinanceDashboardPage.tsx` summed a hardcoded historical months array (`HISTORICAL_MONTHS` = ₹3,522.50) with live current month net (~₹840.00), outputting exactly ₹4,362.50.
- **Affected Files:**
  - `mimo-website/mimo-admin-dashboard/src/pages/Finance/pages/FinanceDashboardPage.tsx`
  - `functions/src/services/cashfreeSettlement.service.js`
- **Fix Applied:** Removed synthetic hardcoded arrays. Connected live Cashfree settlement ingestion service. Dashboard now displays authoritative reconciled settlements (₹12,214.99 for September) and tags October unbatched funds as `Awaiting UTR Batch`.
- **Regression Test:** Automated test in `functions/__tests__/cashfreeSettlement.test.js` and verified live in Browser Mode.
- **Verification Status:** **REMEDIATED & VERIFIED** (Pass).

---

### DEFECT-003: MBIS In-Run Deduplication Defect (Inflated ₹12,503.54 Total)
- **Severity:** **HIGH**
- **Impact:** Duplicate Cashfree settlement batch `394546338` (₹288.55) was appended to the Google Sheet `Settlements` tab, artificially inflating September volume from ₹12,214.99 to ₹12,503.54.
- **Root Cause:** `main.py` in MBIS v3.0 only checked for duplicates against pre-existing rows in the sheet, but did not deduplicate batches fetched across overlapping API pagination responses in the same execution run.
- **Affected Files:**
  - `functions/src/services/cashfreeSettlement.service.js`
  - `functions/src/controllers/adminReports.controller.js`
- **Fix Applied:** Implemented deterministic document IDs (`cf_batch_${settlement_id}`) and an in-memory set check during batch ingestion, preventing any duplicate settlement row from being stored.
- **Regression Test:** Unit test verified in `functions/__tests__/cashfreeSettlement.test.js` ensuring idempotency on repeated batch insertions.
- **Verification Status:** **REMEDIATED & VERIFIED** (Pass).

---

### DEFECT-004: `Invalid Date` on Coupon Expiration Column
- **Severity:** **MEDIUM**
- **Impact:** The coupon table on `/finance/pricing` displayed `Invalid Date` or `NaN-NaN-NaN` for coupon expiry dates.
- **Root Cause:** Firestore timestamp objects (`{ _seconds: ..., _nanoseconds: ... }`) were passed directly into JavaScript's `new Date()`, which expects milliseconds or an ISO date string.
- **Affected Files:**
  - `mimo-website/mimo-admin-dashboard/src/pages/Finance/pages/FinancePricingPage.tsx`
- **Fix Applied:** Created `formatExpiryDate()` helper that checks for `_seconds`, number timestamps, and ISO strings, cleanly outputting formatted dates like `Oct 31, 2026`.
- **Regression Test:** Verified via Browser Mode on `/finance/pricing`. All active coupons render valid expiration dates.
- **Verification Status:** **REMEDIATED & VERIFIED** (Pass).

---

### DEFECT-005: Stale Backend Server Process Returning 404 for `/admin/finance-sheet`
- **Severity:** **MEDIUM**
- **Impact:** Navigating to `/finance/expense` displayed a loading error because the backend returned HTTP 404.
- **Root Cause:** A background Node.js process (PID 26297) running since October 12th was bound to port 3000 and did not have the new `/admin/finance-sheet` route.
- **Affected Files:**
  - `functions/dev.js`
  - Port 3000 process binding
- **Fix Applied:** Terminated stale process and relaunched `functions/dev.js` as daemon task `task-8870`. Verified endpoint returns HTTP 200 with 82 expense items across 2025 and 2026.
- **Regression Test:** `curl -s http://localhost:3000/admin/finance-sheet` returns `200 OK` with JSON payload. Verified in Browser Mode.
- **Verification Status:** **REMEDIATED & VERIFIED** (Pass).

---

### DEFECT-006: Unmasked PII in Customer Analytics and CSV Exports
- **Severity:** **LOW**
- **Impact:** Customer phone numbers and emails were exposed in cleartext in the customer directory and retention exports, risking non-compliance with DPDP regulations.
- **Root Cause:** Lack of role-based PII redaction layer on customer analytics endpoints.
- **Affected Files:**
  - `functions/src/controllers/adminInsights.controller.js`
  - `mimo-website/mimo-admin-dashboard/src/pages/Finance/pages/FinanceCustomerAnalyticsPage.tsx`
- **Fix Applied:** Implemented masking algorithm transforming emails to `d***a@gmail.com` and phones to `+91 98*** **412`. Added permission gate restricting unmasked access to Super Admins.
- **Regression Test:** Verified via Browser Mode and automated tests in `functions/__tests__/financeRemediation.test.js`.
- **Verification Status:** **REMEDIATED & VERIFIED** (Pass).
