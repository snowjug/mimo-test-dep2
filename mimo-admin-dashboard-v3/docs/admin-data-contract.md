# MIMO Admin V3 — Data Contract Specification

This document maps every UI field across the 7 modules of MIMO Admin Dashboard V3 to its corresponding backend data field, data type, source database/service, and any transformation applied.

---

## 1. Overview Dashboard (`/overview`)

| UI Field | Backend Field | Data Type | Source | Transformation / Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Revenue Today** | `orders.amount` (sum for current date) | `number` (INR) | Firestore: `orders` where `status == 'SUCCESS'` | Summed for `createdAt >= startOfDay`, formatted as `₹{val.toLocaleString()}` |
| **Revenue Trend** | computed vs previous period | `number` (%) | Firestore: `orders` aggregated | `((today - yesterday) / yesterday) * 100` |
| **Paid Pages** | `print_jobs.pages` (sum where paid) | `number` | Firestore: `print_jobs` where `status in ['pending','printing','completed']` | Sum of total pages paid |
| **Printed Pages** | `print_jobs.pages` (sum where completed) | `number` | Firestore: `print_jobs` where `status == 'completed'` | Physical sheets confirmed delivered |
| **Print Success Rate** | `printedPages / paidPages * 100` | `number` (%) | Firestore: `print_jobs` | Formatted to 1 decimal place |
| **Customer Value at Risk** | `orders.amount` where failed/pending refund | `number` (INR) | Firestore: `orders` & `print_jobs` (`status == 'failed'`) | Unresolved order value needing attention |
| **Needs Attention Items** | `system_status` (alerts) & `incidents` | `Array<Item>` | Firestore: `system_status`, `print_jobs` | Severity mapping (`critical`, `high`, `medium`) with SLA countdown |
| **Kiosk Entities** | `system_status.{kioskId}` | `Array<Kiosk>` | Firestore: `system_status` collection | Live ping status, online/offline, today pages & revenue |
| **Live Print Operations** | `print_jobs` query | `Array<Job>` | Firestore: `print_jobs` ordered by `createdAt desc` | Live table: document name, kiosk ID, page count, stage, duration |

---

## 2. Print Operations & Queue (`/operations`)

| UI Field | Backend Field | Data Type | Source | Transformation / Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Job Code** | `print_jobs.printCode` / `jobId` | `string` | Firestore: `print_jobs.printCode` | Short alphanumeric code (e.g. `PJ-8942`) |
| **Document Name** | `print_jobs.documentName` / `fileName` | `string` | Firestore: `print_jobs.fileName` | Truncated with tooltip if exceeding cell width |
| **Kiosk Name** | `print_jobs.kioskId` / `system_status.name` | `string` | Firestore: `print_jobs.kioskId` | Kiosk identifier mapped to display name (`SV-002`, `Library Kiosk`) |
| **Pages** | `print_jobs.pages` / `pageCount` | `number` | Firestore: `print_jobs.pages` | Integer count of pages |
| **Stage** | `print_jobs.printerStatus` | `string` | Firestore: `print_jobs.status` / `printerStatus` | `Queued` → `Processing` → `Printing` → `Completed` / `Failed` |
| **Duration** | `updatedAt - createdAt` | `number` (sec) | Firestore timestamps | Time delta in seconds |
| **Status Badge** | `print_jobs.status` | `enum` | Firestore: `print_jobs.status` | Maps to `active`, `printing`, `completed`, `warning`, `critical` |

---

## 3. Kiosk Network Management (`/kiosks`)

| UI Field | Backend Field | Data Type | Source | Transformation / Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Total Kiosks** | `system_status.length` | `number` | Firestore: `system_status` | Count of registered hardware kiosks |
| **Online Status** | `system_status.status` / `lastPing` | `string` | Firestore: `system_status` | `Online` if `lastPing < 60s`, else `Offline` |
| **Current Job** | `system_status.activeJobId` | `string \| null` | Firestore: `system_status` | Linked to active `print_jobs` record |
| **IP Address** | `system_status.tailscaleIp` / `ip` | `string` | Firestore: `system_status` | Displayed in monospace |
| **Firmware Version** | `system_status.version` | `string` | Firestore: `system_status` | Pi listener version tag |
| **Uptime Percentage** | Computed uptime | `number` (%) | Aggregated ping history | Formatted as percentage (e.g. `99.8%`) |

---

## 4. Incidents & Hardware Monitoring (`/incidents`)

| UI Field | Backend Field | Data Type | Source | Transformation / Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Incident Code** | `incidents.incidentCode` / `id` | `string` | Firestore: `incidents` | `INC-1042` format |
| **Severity** | `incidents.severity` | `enum` | Firestore: `incidents.severity` | `critical` \| `high` \| `medium` \| `low` |
| **Status** | `incidents.status` | `enum` | Firestore: `incidents.status` | `open` \| `in_progress` \| `resolved` |
| **SLA Countdown** | `incidents.slaTarget` - `now()` | `string` | Firestore: `incidents.createdAt` + policy | Remaining minutes before breach |
| **Assigned To** | `incidents.assignedTo` | `string` | Firestore: `incidents.assignedTo` | Operator name / unassigned |

---

## 5. Analytics & Telemetry (`/analytics`)

| UI Field | Backend Field | Data Type | Source | Transformation / Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Total Revenue** | Sum of `orders.amount` | `number` (INR) | Firestore: `orders` | Filterable by 7d, 30d, 90d |
| **Total Paid Pages** | Sum of `print_jobs.pages` | `number` | Firestore: `print_jobs` | Grouped by date series |
| **Fulfillment Funnel** | Stage counts | `Array<{stage, count, %}>` | Firestore: `print_jobs` | Uploaded → Paid → Spooled → Printed |
| **Hourly Usage Heatmap** | `createdAt` timestamps | `Matrix[7][8]` | Firestore: `print_jobs` | Aggregated by day of week & time window |

---

## 6. Finance & Billing Ledger (`/finance`)

| UI Field | Backend Field | Data Type | Source | Transformation / Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Transaction ID** | `payment_transactions.transactionId` | `string` | Firestore: `payment_transactions` | Unique gateway transaction reference |
| **Job Code** | `payment_transactions.jobCode` | `string` | Firestore: `payment_transactions` | Linked print job reference |
| **Payment Method** | `payment_transactions.paymentMethod` | `enum` | Cashfree / UPI gateway | `UPI` \| `Card` \| `Cash` \| `Wallet` |
| **Amount** | `payment_transactions.amount` | `number` (INR) | Gateway webhook | Currency format `₹{amount.toFixed(2)}` |
| **Settlement Status** | `payment_transactions.settlementStatus` | `string` | Cashfree reconciliation | `T+1 Settled` \| `Pending` |

---

## 7. Fleet Configuration (`/configuration`)

| UI Field | Backend Field | Data Type | Source | Transformation / Handling |
| :--- | :--- | :--- | :--- | :--- |
| **B&W Page Price** | `pricing.bwPagePrice` | `number` (INR) | Firestore: `system/pricing` | In Rupees per page (default: ₹2.00) |
| **Color Page Price** | `pricing.colorPagePrice` | `number` (INR) | Firestore: `system/pricing` | In Rupees per page (default: ₹5.00) |
| **Max Pages Per Job** | `print_policies.maxPages` | `number` | Firestore: `system/policies` | Integer cap |
| **Auto Refund Policy** | `system.autoRefundOnFailure` | `boolean` | Firestore: `system/policies` | Instant refund trigger on printer failure |
| **CUPS Server URL** | `system.cupsUrl` | `string` | Server environment | Localhost / Tailscale endpoint |
