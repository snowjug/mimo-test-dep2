# Mimo Print Ecosystem: System Architecture & Documentation

Welcome to the comprehensive technical documentation for the Mimo Print Kiosk system. Mimo is a fully automated, highly scalable, zero-maintenance print brokering platform designed to bridge web uploads with physical hardware printers using a serverless event-driven architecture.

---

## 1. High-Level Architecture Overview

Mimo has transitioned from a legacy "Push" architecture (requiring rented VPS servers and unstable Ngrok tunnels) to a robust **Serverless "Pull" Architecture**.

### The Three Pillars
1. **Frontend (React/Vite):** A sleek student-facing web app hosted on Vercel.
2. **Backend (Firebase Cloud Functions):** A zero-cost, infinitely scalable serverless API that handles payments, discounts, emails, and database routing.
3. **Hardware Node (Raspberry Pi):** A lightweight daemon running on a Raspberry Pi connected to a physical printer (e.g., Brother HL-L5210DN) that securely pulls and prints documents.

---

## 2. Component Deep-Dive

### A. The Frontend (`mimo-website/`)
- **Upload Flow:** Files are uploaded directly to Google Cloud Storage from the browser, bypassing the backend to allow massive concurrent uploads (e.g., 50MB PDFs) without choking the system.
- **Preview Generation:** Uses native HTML5 `<object type="application/pdf">` to render client-side document previews instantly.
- **Admin Dashboard:** Accessible at `/admin`. Uses a JWT token for secure access. Features:
  - Real-time revenue and order metrics.
  - Recharts-powered Peak Hour Analytics graph.
  - Coupon creation and deletion.
  - Live Raspberry Pi hardware status monitoring.

### B. The Serverless Backend (`functions/index.js`)
All business logic is isolated in stateless Firebase Cloud Functions (Node.js 20).

**Key Endpoints:**
- `POST /finalize-upload`: Creates the initial `pending` print job in Firestore.
- `POST /create-order`: Calculates total cost based on color/bw, duplex, and dynamically applies active discount coupons. Generates the Cashfree payment session.
- `POST /cashfree-webhook`: Listens for successful payment callbacks from the bank.
- `POST /payment-success`: Approves the payment, generates a 4-digit Print Code, and dispatches the Email Receipt via Nodemailer.
- `GET /validate-coupon/:code`: Public endpoint for the frontend to dynamically check promo discounts before checkout.

**Background Triggers:**
- `autoRefundJob`: An `onDocumentUpdated` Firestore trigger. If a print job status changes to `failed`, this function autonomously contacts the Cashfree API to issue a full refund to the user's bank account.

### C. The Hardware Node (`pi-listener/firebase_listener.py`)
The Pi script runs as a persistent Linux `systemd` service (`mimo-listener.service`).
- **WebSocket Polling:** Uses Firebase `on_snapshot()` to maintain a real-time, low-latency connection to the Firestore `print_jobs` collection. It only listens for jobs marked as `printing`.
- **Local Conversion:** When a Word Document (`.docx`) is downloaded, the Pi uses local `libreoffice --headless` to convert it to PDF locally, saving massive cloud compute costs.
- **CUPS Integration:** Dispatches the final PDF to the printer using `lp`.
- **Hardware Heartbeat:** A background thread runs `lpstat -p` every 30 seconds and updates `system_status/pi` in Firestore. If the printer jams, runs out of paper, or the Pi loses WiFi, the Admin Dashboard instantly reflects this.

---

## 3. Data Flow & The "Pull" Mechanism

This sequence guarantees zero lost prints, even during power outages.

1. **Upload & Pay:** Student uploads file to Cloud Storage -> Cloud Function validates payment -> Firestore document `status` becomes `paid` and a 4-digit code is issued.
2. **Kiosk Scan:** Student scans the code on the iPad -> Cloud Function changes `status` to `printing`.
3. **The Pull:** The Pi Listener detects the `printing` status instantly via WebSocket.
4. **Execution:** Pi downloads the file securely via Firebase Admin SDK -> Converts if necessary -> Sends to CUPS printer.
5. **Completion/Failure:**
   - *Success:* Pi updates Firestore `status` to `completed`.
   - *Failure:* Pi updates Firestore `status` to `failed`. Cloud Function trigger detects failure and issues Cashfree Auto-Refund.

---

## 4. Cost Analysis & Hosting

Because of the Serverless Pull architecture, Mimo operates effectively at **₹0.00/month** until massive scale.

- **Compute:** Firebase Cloud Functions (2 Million free invocations/month).
- **Database:** Firestore (50,000 free reads/day, 20,000 free writes/day).
- **Storage:** Google Cloud Storage (5GB Free Tier).
- **Conversion Compute:** Offloaded to the local Raspberry Pi CPU (Free).
- **Web Hosting:** Vercel (Free Tier).

## 5. Security & Credentials

- **Frontend Environment Variables (`mimo-website/.env`):** Contains public Firebase Config and Cashfree App IDs. Safe to expose.
- **Backend Environment Variables (`functions/.env`):** Contains the highly sensitive `GMAIL_APP_PASSWORD` used for Nodemailer. *Never commit to Git.*
- **Hardware Secrets (`pi-listener/serviceAccountKey.json`):** The Firebase Admin SDK key allowing the Pi to bypass security rules and read any document. *Never commit to Git.*
