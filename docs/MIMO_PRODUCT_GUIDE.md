# MIMO — Product Guide

> Written simply, for everyone on the team.
> **Built by 4 people, mostly with AI — and that's something to be proud of.**

---

## What is MIMO?

MIMO is a **campus print kiosk system**. It lets students upload a file on their phone or laptop, pay online, get a 4-digit code, walk up to a physical printer machine on campus, type the code, and collect their print. No USB. No standing in a queue to operate the machine. No cash needed.

There are **two websites** and one **physical kiosk machine** involved.

---

## The Two Websites

| Website | Who uses it | What it does |
|---|---|---|
| **printmimo.tech** | Students / Customers | Upload file, set options, pay, get print code |
| **kisokmechine.vercel.app** | The kiosk machine (touch screen) | Student walks up, enters code, prints |

---

---

# PART 1 — Customer Website (printmimo.tech)

> This is what a student opens on their phone or laptop when they want to print something.

---

## Page 1 — Landing Page (`/`)

**What the student sees:** The main homepage of MIMO. It explains what MIMO is, shows the kiosk machine photo, mentions pricing, and has a "Get Started" button.

**What it does:** Marketing page. No login needed. Just introduces the product.

---

## Page 2 — Login (`/login`)

**What the student sees:** A clean login screen with two options — enter email + password, or click "Continue with Google."

**What happens behind the scenes:**
- Email/password login checks the account in our database and gives back a secure token (JWT) that stays for 30 days.
- Google login uses Google's system to verify the user, then creates or finds their account in our database automatically.
- The token is saved on the student's phone/browser so they stay logged in.

**Special case:** If a student uses Google for the first time, their account is created automatically — no separate sign-up needed.

---

## Page 3 — Register (`/register`)

**What the student sees:** A form to create a new account — name, email, password.

**What happens:** Their password is encrypted (scrambled) before saving. A fresh account is made, and they're logged in immediately.

---

## Page 4 — Onboarding (`/onboarding`)

**What the student sees:** A one-time screen after first login that asks for their name and phone number.

**Why it exists:** Google login doesn't give us a phone number, so this screen fills that gap.

---

## Page 5 — Upload Files (`/upload`)

**This is the main screen after login.** This is where the print journey starts.

**What the student sees:**
- A greeting with their name ("HEY! Rathindra")
- A small dashboard showing how many docs they've printed total, total pages, and total money spent
- A big drag-and-drop upload box
- Three quick shortcuts below the upload box:
  - **Blank A4 Sheet** — order plain white paper prints
  - **MIMO Graph** — order graph paper prints
  - **Custom Document** — type text and create a document from scratch

**What files are accepted:** PDF, DOCX, DOC, JPG, PNG, TXT, PPTX, XLSX, and more.

**What happens when a file is uploaded:**
1. The page counts pages automatically — PDFs use exact counting, Word documents use an estimate based on word count and paragraph breaks.
2. The file is uploaded directly to Firebase Storage (Google's cloud file storage).
3. The backend is told "a new file exists" and creates a print job record in the database.
4. Progress shows in real time (0% → 99% while uploading, 100% when done).

**The student can also:**
- Upload multiple files at once
- Remove any file before proceeding (it gets deleted from the cloud too)
- See file size and page count for each file

**When ready:** The student clicks "Proceed to Print Settings."

---

## Page 6 — Print Settings (`/print-options`)

**What the student sees:** All the options for how they want their document printed.

### Option 1 — Where to Print (Kiosk Selection)

Two choices:
- **MIMO 1.0** — C.V. Raman Block — Black & White only
- **MIMO 2.0** — Swami Vivekananda Block — Black & White + Color

If the student picks Color, it automatically switches to MIMO 2.0 (since MIMO 1.0 doesn't support color).

### Option 2 — Number of Copies

A counter with + and − buttons. Can go from 1 to 99.

### Option 3 — Black & White or Color

A toggle switch. Choosing Color = ₹10/page. Choosing B&W = ₹2.30/page.

### Option 4 — 1-Sided or 2-Sided (Duplex)

2-sided printing prints on both sides of the paper, halving the number of sheets used. Only available for B&W printing (not supported for color).

### Option 5 — Which Pages to Print

- **All pages** — prints everything
- **Custom** — lets the student click individual pages to include/exclude, or type ranges like `1-3, 5, 8-10`

Quick shortcuts: "First Half", "Second Half", "Odd pages only", "Even pages only."

### Option 6 — Photo Layout (only if uploading images)

If the student uploads photos/images, they can fit multiple photos on one sheet:
- 1 photo per page (default)
- 2 photos per page
- 4 photos per page

They also choose: **Fit** (show whole image with white borders), **Fill** (zoom in, may crop edges), or **Custom** (scale slider).

### Live Price Calculator

On the right side, the total cost updates in real time as the student changes options. It shows:
- Price per page
- Total pages to be printed
- Total copies
- Final amount

**When ready:** Student clicks "Continue to Payment."

---

## Page 7 — Payment (`/payment`)

**What the student sees:**
- Summary of what they're printing (files, pages, cost)
- Option to enter a **coupon code** for a discount
- Option to use **Mimo Coins** to reduce the bill (1 coin = ₹0.50 off)
- Final amount to pay
- A big "Pay Now" button

**What happens:** Clicking "Pay Now" opens **Cashfree** (our payment gateway), which handles UPI, cards, net banking, etc. The student pays on Cashfree's screen.

**After payment:** Cashfree sends a signal to our system confirming payment. The print job is marked as "paid" in our database. A **4-digit print code** is generated and sent to the student.

**Mobile special case:** On some phones, Cashfree opens a UPI app and closes the browser. When the browser re-opens, the print code is safely recovered from a backup storage location (up to 30 minutes after payment).

---

## Page 8 — Payment Verify (`/payment-verify`)

**What the student sees:** A brief loading screen right after Cashfree redirects back.

**What it does:** Quietly checks with our backend that the payment actually went through. If confirmed, it moves to the Print Code screen. If something went wrong, it shows an error.

---

## Page 9 — Print Code (`/print-code`)

**This is the most important screen for the student.**

**What the student sees:**
- A large **4-digit print code** displayed prominently (e.g. `8472`)
- A "Copy Code" button
- A progress bar showing: `Paid ✓` → `Printing` → `Done ✓`
- A printer animation that pulses while printing is happening
- A "Contact Support" button (opens WhatsApp chat with the MIMO team)
- An "Advertisement" section below ("While You Wait") — this is where Google AdSense ads show
- A "Need more prints?" button to start again

**What happens automatically:**
- Every 3 seconds, the page quietly asks our backend: "Has this print job started? Is it done?"
- The progress bar moves from 8% (paid) → up to 90% (printing) → 100% (completed)
- When the printer finishes: the screen shows "Printed Successfully! ✅" and the progress hits 100%
- If the printer fails: a red error section appears with a **"Request Refund"** button

**The student does NOT need to stay on this page.** The code is also sent to their email. They can just walk to the kiosk, enter the code, and their document prints.

---

## Page 10 — User Profile (`/user-profile`)

**What the student sees:** Their personal account page with 4 sections (tabs):

### Tab 1 — Personal Info
- Name, email, phone number
- Option to upload a profile photo
- Save button

### Tab 2 — Mimo Coins
- Current coin balance (shown as both coin count and rupee value)
- Total earned and total used
- How coins work: earn 1 coin per print job above ₹10, use coins for up to 50% off

### Tab 3 — Print History
- A list of all past print jobs
- Each entry shows: file name, print code, status (completed/paid/failed), number of pages, color mode, cost, date

### Tab 4 — Notifications
- Toggle switches for email notifications, SMS, print-complete alerts, and marketing emails

---

## Page 11 — Blank Pages (`/blank-pages`)

**What the student sees:** A screen to order blank paper prints.

Two types:
- **Blank A4** — plain white sheets (₹2.30 each)
- **MIMO Graph** — graph paper (₹2.00 each)

They pick how many sheets they want, then pay. The system creates a print job using a pre-uploaded PDF template.

---

## Page 12 — Text Editor (`/text-editor`)

**What the student sees:** A browser-based text editor to type a document and convert it to a printable PDF.

Options include font family, font size, line spacing, text alignment (left/center/right/justify), page size (A4 or Letter), and margins.

When they click "Convert to PDF," the system generates a PDF from their text and uploads it. They're taken to the print options page with this new PDF ready to print.

---

## Page 13 — Admin Dashboard (`/admin`)

**What an admin sees:** A dashboard for the MIMO team to monitor orders, kiosk status, print jobs, and system health. Password-protected — not for regular students.

---

---

# PART 2 — Kiosk Website (kisokmechine.vercel.app)

> This website runs on the **touch screen of the physical printer machine** at college. Students don't open this on their phone — it's already open on the kiosk.

The kiosk knows which machine it is by reading a value in the URL (`?kioskId=SV-002`). One website serves all kiosks — no separate deployments needed.

---

## Screen 1 — Main / Idle Screen

**What it shows:** A welcoming idle screen displayed when nobody is using the kiosk.

**What happens:** When a student taps the screen, it moves to the Code Entry screen.

---

## Screen 2 — Code Entry Screen

**What the student sees:** A large digital **numpad** (like a phone keypad).

**What they do:** Type their 4-digit print code (the one they received after payment).

**What happens:**
- As they type each digit, a dot appears on screen (for privacy)
- When all 4 digits are entered, the system automatically sends the code to the backend
- If the code is wrong: an error message appears briefly, the screen shakes, and the digits clear
- If the code is correct: it moves to the Printing screen
- Demo mode: code `0000` works for testing (shows a fake 3-page demo job)

---

## Screen 3 — Printing Screen

**What the student sees:**
- "Hello [Student Name]..!" at the top
- Details: file name, number of pages, number of copies, color mode
- A large animated progress bar showing how far along the print job is
- The printer icon pulses and animates while printing

**What happens behind the scenes:**
1. The kiosk sends the print code to our backend
2. The backend tells the Raspberry Pi computer connected to the printer: "print this file now"
3. The Pi downloads the PDF, sends it to the printer
4. The kiosk polls (checks) every few seconds: "Is it done yet?"
5. When complete, the progress bar hits 100% and it moves to the Summary screen
6. If the printer goes offline or fails: the kiosk shows an error immediately

---

## Screen 4 — Summary Screen

**What the student sees:** A confirmation that their document has been printed successfully.

Typically shows:
- ✅ Print Completed
- File name, pages, copies
- A "Done" or "Print Another" button that returns to the main idle screen

---

## Screen 5 — System Error Screen

**What the student sees:** An error message explaining that something went wrong with the printer.

This screen is shown when:
- The printer is offline (no USB connection detected)
- The printer runs out of paper or ink
- The print job fails for any other reason

The student is told to contact support. A refund is triggered automatically in most failure cases.

**Hidden debug shortcut:** There's an invisible 40×40 pixel area in the bottom-right corner. Tapping it triggers this screen — used by the team for testing without modifying anything.

---

## Screen 6 — Maintenance Screen

**What the student sees:** An "Out of Service" message.

This appears when the kiosk is intentionally taken offline for maintenance.

---

---

# How It All Connects (The Full Flow)

```
Student opens printmimo.tech
         ↓
Logs in → Uploads file → Sets print options → Pays
         ↓
Backend creates a print job with status "paid"
         ↓
Student receives 4-digit code
         ↓
Student walks to MIMO kiosk on campus
         ↓
Types code on kiosk touch screen
         ↓
Kiosk tells backend → backend tells Raspberry Pi
         ↓
Pi downloads the file from cloud storage
         ↓
Pi sends file to physical printer
         ↓
Printer prints → Pi updates status → kiosk shows "Done!"
         ↓
Student collects their printout 🎉
```

---

# Pricing Summary

| Print Type | Price per Page |
|---|---|
| Black & White | ₹2.30 |
| Color | ₹10.00 |
| Blank A4 sheet | ₹2.30 |
| Graph paper | ₹2.00 |

**Mimo Coins:**
- Earn 1 coin for every print job above ₹10
- 1 coin = ₹0.50 discount
- Can use coins for up to 50% off any order

---

# Two Physical Kiosk Locations

| Kiosk | Location | What it can print |
|---|---|---|
| **MIMO 1.0** (CV-001) | C.V. Raman Block | Black & White only |
| **MIMO 2.0** (SV-002) | Swami Vivekananda Block | Black & White + Color |

Color print jobs are automatically sent to MIMO 2.0 — the student doesn't need to worry about this, the system handles it.

---

# Who Built This

4 team members. Built mostly with AI assistance. Every piece — the website, the payment system, the kiosk screen, the Raspberry Pi software, and the cloud backend — was designed, tested, and iterated on by the team working daily.

The fact that this entire system works end-to-end — from a student's phone to a physical printer in a college block — is genuinely impressive.
