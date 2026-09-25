# Firebase Firestore Schema Design for MIMO Kiosk System

## Overview

This document defines the optimal Firestore collection structure designed for:
1. **Real-time operations** - Fast queries for user uploads, print jobs, payments
2. **BigQuery analytics** - Firestore → BigQuery export for reporting and data analysis
3. **Scalability** - Supports 1000+ concurrent kiosk machines
4. **Compliance** - Audit trails for payment transactions

**Key Answer: YES, fully possible.** Firestore natively supports BigQuery integration via the "Export to BigQuery" feature. Your schema can serve both real-time operations and analytics simultaneously with proper denormalization strategies.

---

## Collection Architecture

### 1. `users` Collection
Stores user account information with minimal data for quick authentication.

```json
{
  "userId": "user_uuid",
  "email": "user@example.com",
  "phoneNumber": "+91-9876543210",
  "name": "User Name",
  "passwordHash": "bcrypt_hash",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "accountStatus": "active",
  "totalSpent": 1250.50,
  "totalPagesPrinted": 45,
  "preferredPaymentMethod": "cashfree",
  "lastLoginAt": 1234567890000,
  "defaultPrintSettings": {
    "colorMode": "bw",
    "layout": "single",
    "paperSize": "a4"
  },
  "isVerified": true,
  "verificationMethod": "email"
}
```

**Firestore Path:** `users/{userId}`
**BigQuery Considerations:** 
- `createdAt`, `updatedAt` in milliseconds for consistency
- Flatten `defaultPrintSettings` in BigQuery for easier queries

---

### 2. `kiosk_machines` Collection
Tracks physical kiosk hardware and their operational status.

```json
{
  "kioskId": "kiosk_uuid_or_serial",
  "name": "Kiosk A - Main Floor",
  "location": {
    "building": "Building 1",
    "floor": "Ground",
    "area": "Lobby",
    "latitude": 28.7041,
    "longitude": 77.1025
  },
  "hardware": {
    "printerModel": "Canon imagePRESS C3080",
    "printerId": "printer_network_id",
    "paperSize": "A4",
    "colorCapable": true,
    "maxPagesPerMinute": 80,
    "maxConcurrentJobs": 5
  },
  "configuration": {
    "pricePerPageBW": 0.50,
    "pricePerPageColor": 1.50,
    "minOrderValue": 5.00,
    "maxOrderValue": 500.00,
    "autoShutdownMinutes": 15,
    "idleTimeoutMinutes": 10
  },
  "status": {
    "operationalStatus": "online",
    "lastHeartbeatAt": 1234567890000,
    "paperLevelPercent": 85,
    "tonerLevelPercent": 60,
    "errorCode": null,
    "errorMessage": null,
    "lastErrorAt": null
  },
  "statistics": {
    "totalJobsProcessed": 5420,
    "totalPagesProcessed": 45800,
    "totalRevenueGenerated": 28500.00,
    "averageJobSizePages": 8.4,
    "uptimePercent": 99.2,
    "maintenanceScheduledAt": 1234567890000,
    "lastMaintenanceAt": 1234567890000
  },
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "organizationId": "org_uuid"
}
```

**Firestore Path:** `kiosk_machines/{kioskId}`

**Indexes Needed:**
- `organizationId, updatedAt (descending)`
- `status.operationalStatus, lastHeartbeatAt (descending)`

**BigQuery Considerations:**
- Flatten `location`, `hardware`, `configuration`, `status`, `statistics` objects
- Create separate `kiosk_machine_status_history` table for time-series analysis
- `lastHeartbeatAt` crucial for uptime calculations

---

### 3. `print_jobs` Collection
Core collection tracking each print request from upload to completion.

```json
{
  "jobId": "job_uuid",
  "userId": "user_uuid",
  "kioskId": "kiosk_uuid",
  "orderId": "order_uuid",
  "pin": "4-digit-pin",
  "sourceFile": {
    "fileName": "document.pdf",
    "originalExtension": ".pdf",
    "mimeType": "application/pdf",
    "fileSizeBytes": 2048576,
    "uploadedAt": 1234567890000,
    "uploadDurationMs": 1250
  },
  "conversionDetails": {
    "convertedAt": 1234567890000,
    "originalPageCount": 25,
    "actualPageCount": 25,
    "isConverting": false,
    "conversionDurationMs": 2500,
    "conversionSuccess": true,
    "conversionError": null,
    "storagePath": "converted/1234567890000_job_uuid.pdf",
    "storageSizeBytes": 2048000
  },
  "printOptions": {
    "copies": 1,
    "colorMode": "bw",
    "layout": "single",
    "pageSelection": "all",
    "startPage": null,
    "endPage": null,
    "duplexMode": "simplex"
  },
  "pricing": {
    "pricePerPage": 0.50,
    "totalPages": 25,
    "copiesRequested": 1,
    "totalPagesToPrint": 25,
    "estimatedAmount": 12.50,
    "finalAmount": 12.50,
    "currency": "INR",
    "taxPercent": 0,
    "taxAmount": 0.00,
    "discountCode": null,
    "discountAmount": 0.00
  },
  "paymentStatus": {
    "status": "completed",
    "paymentMethod": "cashfree",
    "transactionId": "cashfree_txn_id",
    "paidAt": 1234567890000,
    "paymentGatewayResponse": {
      "orderId": "cashfree_order_id",
      "sessionId": "session_uuid"
    }
  },
  "printStatus": {
    "status": "printing",
    "retrievedAt": 1234567890000,
    "printStartedAt": 1234567890000,
    "printCompletedAt": null,
    "durationSeconds": null,
    "printErrorCode": null,
    "printErrorMessage": null,
    "printerJobId": "printer_job_id"
  },
  "timeline": {
    "createdAt": 1234567890000,
    "uploadedAt": 1234567890000,
    "conversionStartedAt": 1234567890000,
    "conversionCompletedAt": 1234567890000,
    "orderCreatedAt": 1234567890000,
    "paymentInitiatedAt": 1234567890000,
    "paymentCompletedAt": 1234567890000,
    "retrievedAt": 1234567890000,
    "printStartedAt": 1234567890000,
    "printCompletedAt": null,
    "expiresAt": 1234567890000
  },
  "metadata": {
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "sessionId": "session_uuid",
    "tags": ["urgent", "color"]
  }
}
```

**Firestore Path:** `print_jobs/{jobId}`

**Indexes Needed:**
- `userId, createdAt (descending)`
- `kioskId, createdAt (descending)`
- `pin` (for lookup by PIN)
- `paymentStatus.status, createdAt (descending)`
- `printStatus.status, createdAt (descending)`
- `timeline.expiresAt` (for cleanup)

**BigQuery Considerations:**
- Flatten all nested objects for easier SQL queries
- Create separate `print_job_events` table for state transitions (uploaded → converting → payment_pending → printing → completed)
- Timeline fields enable cohort analysis
- Pricing fields allow revenue analytics
- PIN is PII - consider masking in BigQuery

---

### 4. `payment_transactions` Collection
Audit trail for all payment attempts, including failed transactions.

```json
{
  "transactionId": "txn_uuid",
  "userId": "user_uuid",
  "orderId": "order_uuid",
  "jobId": "job_uuid",
  "paymentGateway": "cashfree",
  "gatewayTransactionId": "cashfree_txn_id",
  "orderDetails": {
    "description": "Print order for document.pdf - 25 pages",
    "amount": 12.50,
    "currency": "INR",
    "orderTimestamp": 1234567890000
  },
  "customerDetails": {
    "email": "user@example.com",
    "phone": "+91-9876543210",
    "name": "User Name"
  },
  "paymentAttempt": {
    "attemptNumber": 1,
    "initiatedAt": 1234567890000,
    "sessionId": "session_uuid",
    "paymentMethod": "unknown",
    "instrument": {
      "type": null,
      "last4": null,
      "bank": null,
      "issuer": null,
      "wallet": null
    }
  },
  "transactionStatus": {
    "status": "completed",
    "gatewayStatus": "authorized",
    "statusCode": 0,
    "statusMessage": "Success",
    "completedAt": 1234567890000,
    "failureReason": null,
    "failureCode": null
  },
  "reconciliation": {
    "settledAt": 1234567890000,
    "settledAmount": 12.50,
    "gatewayCharges": 0.25,
    "netAmount": 12.25,
    "reconciliationStatus": "settled",
    "bankReferenceId": "bank_ref_123456"
  },
  "audit": {
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "retryCount": 0,
    "webhookReceived": true,
    "webhookVerified": true,
    "idempotencyKey": "idemp_key_uuid"
  },
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000
}
```

**Firestore Path:** `payment_transactions/{transactionId}`

**Indexes Needed:**
- `userId, createdAt (descending)`
- `transactionStatus.status, createdAt (descending)`
- `orderId`
- `gatewayTransactionId` (for idempotency)

**BigQuery Considerations:**
- Complete transaction audit trail for compliance
- Separate failed/successful transactions for reconciliation reports
- Settlement tracking for accounting
- Instrument details useful for fraud detection patterns

---

### 5. `orders` Collection
Represents business orders that may contain multiple print jobs.

```json
{
  "orderId": "order_uuid",
  "userId": "user_uuid",
  "kioskId": "kiosk_uuid",
  "jobIds": ["job_uuid_1", "job_uuid_2"],
  "paymentTransactionId": "txn_uuid",
  "orderStatus": "completed",
  "orderType": "print",
  "items": [
    {
      "itemId": "item_1",
      "jobId": "job_uuid",
      "description": "document.pdf - 25 pages, BW",
      "quantity": 1,
      "unitPrice": 12.50,
      "totalPrice": 12.50
    }
  ],
  "totals": {
    "subtotalAmount": 12.50,
    "taxAmount": 0.00,
    "discountAmount": 0.00,
    "totalAmount": 12.50,
    "currency": "INR"
  },
  "paymentDetails": {
    "paymentMethod": "cashfree",
    "paymentStatus": "completed",
    "paidAt": 1234567890000,
    "paymentTimings": {
      "initiatedAt": 1234567890000,
      "completedAt": 1234567890000,
      "durationSeconds": 45
    }
  },
  "fulfillment": {
    "status": "printing",
    "printStartedAt": 1234567890000,
    "printCompletedAt": null,
    "estimatedCompletionTime": 1234567890000,
    "actualCompletionTime": null
  },
  "metadata": {
    "source": "web",
    "channel": "kiosk_self_service",
    "tags": []
  },
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000
}
```

**Firestore Path:** `orders/{orderId}`

**Indexes Needed:**
- `userId, createdAt (descending)`
- `orderStatus, createdAt (descending)`

---

### 6. `printers` Collection (Optional but Recommended)
Master list of printer models with capabilities for price calculations.

```json
{
  "printerId": "printer_uuid",
  "model": "Canon imagePRESS C3080",
  "manufacturer": "Canon",
  "specifications": {
    "maxPagesPerMinute": 80,
    "colorCapable": true,
    "duplexCapable": true,
    "supportedMediaSizes": ["A4", "A3", "Letter"],
    "maxPaperWeight": 300
  },
  "pricing": {
    "costPerPageBW": 0.10,
    "costPerPageColor": 0.30,
    "maintenanceCostPerYear": 5000.00
  },
  "vendors": [
    {
      "kioskId": "kiosk_uuid",
      "installationDate": 1234567890000,
      "warrantyExpiration": 1234567890000
    }
  ],
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000
}
```

**Firestore Path:** `printers/{printerId}`

---

### 7. `kiosk_health_logs` Collection (Time Series)
Separate collection for time-series health data (not queried in real-time, useful for BigQuery analytics).

```json
{
  "logId": "log_uuid",
  "kioskId": "kiosk_uuid",
  "timestamp": 1234567890000,
  "metrics": {
    "cpuUsagePercent": 45.2,
    "memoryUsagePercent": 62.1,
    "diskUsagePercent": 78.5,
    "networkLatencyMs": 25,
    "paperLevelPercent": 85,
    "tonerLevelPercent": 60,
    "temperature": 42,
    "jobQueueLength": 3
  },
  "events": [
    {
      "eventType": "paper_low_warning",
      "severity": "warning",
      "message": "Paper level below 20%",
      "timestamp": 1234567890000
    }
  ]
}
```

**Firestore Path:** `kiosk_health_logs/{logId}`
**Strategy:** Set TTL to 90 days, export to BigQuery daily for long-term analytics.

---

## Data Flow & Query Patterns

### Real-Time Operations
1. **User uploads file** → Create `print_jobs` doc, trigger conversion
2. **Checkout** → Query `print_jobs` by `jobId`, extract pricing
3. **Create order** → Create `orders` doc with `jobIds` array
4. **Payment** → Create `payment_transactions` doc, update `orders` and `print_jobs` status
5. **Retrieve at kiosk** → Query `print_jobs` by `pin`, validate user
6. **Print execution** → Update `print_jobs.printStatus`, append to `kiosk_health_logs`

### BigQuery Analytics

#### Revenue Dashboard
```sql
SELECT 
  DATE(TIMESTAMP_MILLIS(j.timeline.createdAt)) as date,
  COUNT(DISTINCT j.userId) as unique_users,
  SUM(j.pricing.finalAmount) as total_revenue,
  SUM(j.pricing.totalPages) as total_pages_printed,
  AVG(j.pricing.finalAmount) as avg_order_value
FROM `project.dataset.print_jobs` j
WHERE j.paymentStatus.status = 'completed'
GROUP BY date
ORDER BY date DESC;
```

#### Kiosk Performance
```sql
SELECT
  k.kioskId,
  k.name,
  COUNT(*) as total_jobs,
  SUM(stats.totalPagesPrinted) as pages_printed,
  AVG(CAST(stats.uptimePercent AS FLOAT64)) as avg_uptime
FROM `project.dataset.kiosk_machines` k
WHERE k.createdAt > TIMESTAMP_MILLIS(@start_date)
GROUP BY k.kioskId, k.name
ORDER BY pages_printed DESC;
```

#### User Engagement
```sql
SELECT
  DATE(TIMESTAMP_MILLIS(u.lastLoginAt)) as login_date,
  COUNT(*) as active_users,
  SUM(u.totalSpent) as revenue,
  AVG(u.totalPagesPrinted) as avg_pages_per_user
FROM `project.dataset.users` u
WHERE u.lastLoginAt > TIMESTAMP_MILLIS(@start_date)
GROUP BY login_date;
```

---

## BigQuery Export Configuration

### Enable Firestore BigQuery Export
```bash
gcloud firestore export gs://your-bucket/exports --collection-ids=print_jobs,users,orders,payment_transactions,kiosk_machines
```

### Recommended BigQuery Dataset Structure
```
dataset: mimo_analytics
├── users (Real-time snapshot)
├── print_jobs (Daily snapshots + live table)
├── orders (Daily snapshots + live table)
├── payment_transactions (Live, never delete)
├── kiosk_machines (Real-time snapshot)
├── kiosk_health_metrics (Time series, append-only)
├── print_job_events (Event stream)
└── payment_reconciliation (Monthly rollup)
```

---

## Security & Compliance

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Print jobs: read own, service account (server) writes
    match /print_jobs/{jobId} {
      allow read: if request.auth.uid == resource.data.userId || request.auth.token.service == true;
      allow write: if request.auth.token.service == true;
    }
    
    // Payment transactions: service account only
    match /payment_transactions/{txnId} {
      allow read: if request.auth.uid == resource.data.userId || request.auth.token.service == true;
      allow write: if request.auth.token.service == true;
    }
    
    // Kiosk machines: read by anyone, write by admin
    match /kiosk_machines/{kioskId} {
      allow read: if true;
      allow write: if request.auth.token.admin == true;
    }
  }
}
```

### BigQuery Access Control
- **Analysts:** Read-only access to BigQuery via service account
- **Finance:** Access to `payment_transactions` for reconciliation
- **Operations:** Access to `kiosk_machines` and health metrics
- **PII Masking:** Apply in BigQuery views, not source Firestore

---

## Implementation Roadmap

### Phase 1: Current System (Weeks 1-2)
- ✅ Core collections: `users`, `print_jobs`, `orders`
- ✅ Payments: `payment_transactions`
- Migration: Backfill existing data

### Phase 2: Hardware Management (Week 3)
- Add `kiosk_machines` collection
- Add `printers` master table
- Update `print_jobs` to reference `kioskId`

### Phase 3: BigQuery Integration (Week 4-5)
- Enable Firestore export to BigQuery
- Create BigQuery views and dashboards
- Set up daily export jobs
- Implement `kiosk_health_logs` append-only collection

### Phase 4: Analytics & Optimization (Week 6+)
- Build revenue dashboards
- Implement cost analysis
- Predict maintenance needs
- User retention analytics

---

## Migration Strategy from Current Schema

### Step 1: Add New Collections
Firestore backward-compatible - existing collections unaffected.

### Step 2: Backfill Historical Data
```javascript
// Migrate existing print jobs to new structure
db.collection('printJobs').get().then(snapshot => {
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    db.collection('print_jobs').doc(doc.id).set({
      ...data,
      timeline: {
        createdAt: data.createdAt,
        uploadedAt: data.uploadedAt || data.createdAt,
        // ... backfill other timeline fields
      }
    });
  });
});
```

### Step 3: Update Application Code
- Update backend to write to new collections
- Maintain reads from old collections during transition
- Gradual cutover per environment

---

## Performance Tuning

### Write Optimization
- Batch writes: Use transactions for related docs
- Avoid hot documents: Distribute `statistics` updates across shards
- Rate limiting: Use Cloud Tasks for batch operations

### Read Optimization
- Use composite indexes (listed above)
- Pagination: Always use `limit()` with `orderBy()`
- Cache frequently accessed: `kiosk_machines` in Redis

### BigQuery Cost Management
- Snapshot interval: Daily instead of real-time (cheaper)
- Data retention: 90 days in Firestore, 7 years in BigQuery
- Partitioning: By date in BigQuery to reduce scan costs

---

## Answer to Your Question

**Q: "Can you implement a good schema design in firebase for kiosk machine and payments like in collections? Is it possible?"**

**A: YES, fully possible and recommended.** This schema design:
✅ Supports real-time kiosk operations (fast queries, low latency)
✅ Integrates with BigQuery for analytics (denormalized, properly typed)
✅ Scales to 1000+ machines and millions of transactions
✅ Maintains audit trails for compliance
✅ Separates operational data from analytical data
✅ Uses Firestore's native export feature for BigQuery

All collections above follow Firebase best practices and are production-ready.
