# MIMO Admin V3 — Backend Integration Specification

## 1. Overview & Architecture

MIMO Admin Dashboard V3 is designed to connect to the MIMO production Cloud Run API and Google Cloud Firestore database.

```
┌────────────────────────────────────────────────────────┐
│             MIMO Admin Dashboard V3 (SPA)             │
└──────────────────────────┬─────────────────────────────┘
                           │
             HTTPS REST / Firestore SDK
                           │
         ┌─────────────────┴──────────────────┐
         ▼                                    ▼
┌──────────────────────────────┐    ┌───────────────────────────┐
│   MIMO Cloud Run API Server   │    │  Google Cloud Firestore   │
│ https://api-upqxuj7evq-uc... │    │ (mimo-v2-11868 project)   │
└──────────────────────────────┘    └───────────────────────────┘
```

---

## 2. Environment Configuration

Create a `.env` or `.env.local` in `mimo-admin-dashboard-v3/`:

```bash
# MIMO Backend API Base URL
VITE_API_BASE_URL=https://api-upqxuj7evq-uc.a.run.app

# Enable Live Production Backend (set to 'true' when connecting to live backend)
VITE_USE_LIVE_API=false

# Admin API Key / Service Authentication Token
VITE_ADMIN_API_KEY=your_admin_api_key_here

# Firebase Web Client Configuration (for direct Firestore realtime subscriptions)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=mimo-v2-11868.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mimo-v2-11868
VITE_FIREBASE_STORAGE_BUCKET=mimo-v2-11868.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 3. Endpoints & Schema

### A. Health & Metrics
- **Endpoint**: `GET /health`
- **Response**:
```json
{
  "status": "healthy",
  "uptime": 128490,
  "timestamp": "2026-09-18T08:15:00Z"
}
```

### B. Print Operations Queue
- **Endpoint**: `GET /admin/operations`
- **Query Parameters**: `?status=all|printing|completed|failed&kioskId=SV-002&limit=50`
- **Response**:
```json
{
  "operations": [
    {
      "id": "job_01",
      "jobCode": "PJ-8942",
      "documentName": "Campus_Thesis_Final.pdf",
      "kioskId": "SV-002",
      "kioskName": "SV-002 (Library Kiosk)",
      "pages": 14,
      "stage": "Printing",
      "status": "printing",
      "durationSeconds": 18,
      "submittedAt": "2 mins ago"
    }
  ],
  "kpis": {
    "totalJobs": 1284,
    "inQueue": 3,
    "completed": 1266,
    "actionNeeded": 15,
    "pendingRefunds": 2
  }
}
```

### C. Kiosk Fleet Status
- **Endpoint**: `GET /admin/kiosks`
- **Response**:
```json
{
  "kiosks": [
    {
      "id": "SV-002",
      "name": "MIMO 2 (SV-002)",
      "kioskCode": "SV-002",
      "location": "Central Library, Floor 1",
      "status": "Online",
      "ipAddress": "100.107.95.16",
      "uptimePercent": 99.8,
      "firmware": "v2.4.1",
      "pagesToday": 412,
      "revenueToday": 1030
    }
  ]
}
```

### D. Incident Dispatch
- **Endpoint**: `GET /admin/incidents`
- **Response**:
```json
{
  "incidents": [
    {
      "id": "inc_01",
      "incidentCode": "INC-1042",
      "title": "Low Paper Warning (< 25 sheets)",
      "kioskName": "MIMO 2 (Library)",
      "category": "Hardware",
      "severity": "high",
      "status": "open",
      "reportedAt": "12 mins ago",
      "assignedTo": "Ramesh K."
    }
  ],
  "kpis": {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 4,
    "resolvedToday": 17
  }
}
```

---

## 4. Current Status in V3 Project

- **Service Layer**: Fully typed and isolated behind `src/services/*` and `src/services/api.client.ts`.
- **Mock Fallback**: Clearly labeled in development mode (`VITE_USE_LIVE_API=false`) with zero hardcoded visual numbers inside JSX/TSX.
- **Production Switch**: Setting `VITE_USE_LIVE_API=true` and configuring `VITE_API_BASE_URL` directs all service calls to the real production server.
