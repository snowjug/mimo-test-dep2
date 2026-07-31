# 🚀 MIMO V2 — Intelligent Print Platform

Welcome to the **MIMO Printing Platform** repository! This project powers automated print kiosks, customer web applications, administration dashboards, and backend printing services.

---

## 🔗 Environment Variables & Secure Credentials

> [!IMPORTANT]
> **Environment Variables Download**: Real environment variables and service account keys are stored securely on Google Drive. Interns and developers must download credentials from this link:
> 
> 📁 **[Download Environment Variables (GDrive)](https://drive.google.com/file/d/1VURWsFEovVIUPC2dxNqrPfkcpAye42IU/view?usp=sharing)**
> 
> Do **NOT** commit raw `.env` files or secret keys to GitHub.

---

## 🏗️ Repository & Architecture Overview

The repository is structured into 3 core services:

- `backend/` — Node.js & Express REST API managing authentication, Firestore DB, Cashfree payments, and print job queues.
- `mimo-website/` — Main Vite + React customer web application (Document upload, payments, user account, admin dashboard).
- `mimo-frontend-web-app/mimo-frontend/` — Kiosk UI Vite + React application running on physical kiosk touchscreens.
- `functions/` — Firebase Cloud Functions for WhatsApp Cloud API, email OTPs, and background webhooks.
- `pi-listener/` / `pi_scripts/` — Python listener services running on Raspberry Pi hardware to receive print jobs and send them to CUPS printers.

---

## 🌿 Git Branch Topology

| Branch | Description |
|---|---|
| `main` | **Production branch** — Core website, backend API, kiosk UI, and Pi listeners |
| `atharv-changes` | Feature branch synced with main |
| `madhan` | Feature branch synced with main |
| `revautsav-android` | **Android Kiosk App (REVAUTSAV)** — Isolated branch for Android Studio deployment |

---

## 🛠️ Required Tools & System Requirements

Before starting development, ensure you have installed:

1. **Node.js**: `v18.x` or higher ([Node.js Download](https://nodejs.org/))
2. **Package Manager**: `npm` (comes with Node.js)
3. **Git**: Latest version ([Git Download](https://git-scm.com/))
4. **Python 3**: `v3.9+` (required for running Pi print listener scripts)
5. **Firebase CLI**: Install globally via `npm install -g firebase-tools`
6. **Android Studio** *(Optional)*: Required only if working on the `revautsav-android` branch.

---

## 🚀 Intern Onboarding Guide & How to Proceed

Follow these step-by-step instructions to get your local environment running:

### Step 1: Clone the Repository
```bash
git clone https://github.com/madhans7/mimo-test-dep2.git
cd mimo-test-dep2
```

### Step 2: Download & Setup Environment Files
1. Access the **[GDrive Environment Variables Link](https://drive.google.com/file/d/1VURWsFEovVIUPC2dxNqrPfkcpAye42IU/view?usp=sharing)**.
2. Download the `.env` configuration.
3. Create the following files locally:
   - Place backend credentials in `backend/.env`
   - Place Cloud Functions credentials in `functions/.env`
   - Place `serviceAccountKey.json` in the project root / `backend/`

### Step 3: Install Dependencies

**Backend API:**
```bash
cd backend
npm install
```

**Main Website & Admin Dashboard:**
```bash
cd ../mimo-website
npm install
```

**Kiosk Web Frontend:**
```bash
cd ../mimo-frontend-web-app/mimo-frontend
npm install
```

### Step 4: Run Local Development Servers

- **Run Backend API** (Terminal 1):
  ```bash
  cd backend
  npm start
  ```
  *(Server runs on `http://localhost:3000`)*

- **Run Customer Website** (Terminal 2):
  ```bash
  cd mimo-website
  npm run dev
  ```
  *(Website runs on `http://localhost:5173`)*

- **Run Kiosk App** (Terminal 3):
  ```bash
  cd mimo-frontend-web-app/mimo-frontend
  npm run dev
  ```

---

## 🖥️ Production Kiosk Hardware Topology

The platform coordinates real-time printing across physical kiosk stations:

| Kiosk ID | Station Name | Tailscale IP | Local IP | Monochrome Printer | Color Printer |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SV-002** | MIMO 2.0 | `100.107.95.16` | `192.168.8.197` | Brother HL-L2440DW | Epson L3250 |
| **CV-001** | MIMO 1.0 | `100.70.107.44` | `10.108.2.19` | Brother HL-L5210DN | Brother IPP |

---

## 🌐 Live Production Deployments

- **Customer Web App**: [https://printmimo.tech](https://printmimo.tech)
- **Kiosk Interface**: [https://kisokmechine.vercel.app](https://kisokmechine.vercel.app)
- **Admin Dashboard**: [https://printmimo.tech/admin](https://printmimo.tech/admin)
- **Cloud Backend API**: [https://api-upqxuj7evq-uc.a.run.app](https://api-upqxuj7evq-uc.a.run.app)

---

## ❓ Intern FAQs & Troubleshooting

### Q1: How do print jobs get from the web app to physical printers?
1. User uploads document on `mimo-website` and completes payment via Cashfree.
2. Backend creates a print job in Firestore with status `"paid"` and a 4-digit `printCode`.
3. User enters the code on the Kiosk touchscreen.
4. Status changes to `"printing"`. The Pi listener running `firebase_listener.py` receives the event, downloads the PDF signed URL, and sends it to CUPS (`lpr`).

### Q2: What happens if a printer runs out of paper or shows an error?
- The listener runs an **Auto-Error Clearance** watchdog: it automatically executes `cupsenable` and `cupsaccept`, clears stuck queues, and resets kiosk error flags.
- If the hardware is physically broken, the backend automatically calls Cashfree's refund API (`/request-refund`) to refund the customer.

### Q3: What should I do before pushing code to GitHub?
- Never commit `.env` or secret `.json` files.
- Test your changes locally (`npm run build`).
- Create a feature branch (e.g. `git checkout -b intern/your-name-feature`) and create a Pull Request against `main`.

---

## 🔒 Security Best Practices
- Always maintain `.env` files in `.gitignore`.
- Use `.env.example` as a template for adding any new environment key names.
