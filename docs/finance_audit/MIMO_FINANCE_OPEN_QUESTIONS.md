# MIMO FINANCE SPACE — OPEN QUESTIONS, UNVERIFIED DATA & ACTION ITEMS

**Document Version:** 1.0.0  
**Target Stakeholders:** Finance Head, Finance Manager, Lead Architect, Operations Lead  
**Classification:** Operational Governance

---

## 1. Unverified Financial References & Root Cause Hypotheses

### 1.1 The ₹4,362.50 Net Settled Reference
- **Status:** **UNVERIFIED (Identified as Architectural Artifact)**
- **User Observation:** The current Net Settled value on the dashboard is reported as substantially higher than ₹4,362.50.
- **Forensic Discovery:**
  - In `FinanceDashboardPage.tsx:57-64`, the hardcoded `HISTORICAL_MONTHS` array sums to:
    $$\text{Apr (120)} + \text{May (295.90)} + \text{Jun (480.50)} + \text{Jul (620)} + \text{Aug (860.70)} + \text{Sep (1,145.40)} = ₹3,522.50\text{ Net}$$
  - The page adds the current live period net collections to this sum:
    $$\text{totalNet} = 3,522.50 + \text{livNet}$$
  - If $\text{livNet} = ₹840.00$, then $\text{totalNet} = ₹4,362.50$.
  - When the date picker changes or live collections grow, $\text{totalNet}$ increases well beyond ₹4,362.50.
- **Questions for Finance Head:**
  1. Did ₹4,362.50 originate from an actual bank account credit statement, a Cashfree settlement batch, or an earlier developer screenshot?
  2. If it is a real bank payout, what was the exact UTR number and settlement date?

---

### 1.2 The ₹231.68 Net Collections Discrepancy (₹12,271.86 vs ₹12,503.54)
- **Status:** **LIKELY (Strong Mathematical Correlation to Gateway MDR)**
- **Observation:** Last month's Net Collections is reported by MIMO as ₹12,271.86, while the business expected ₹12,503.54.
- **Forensic Discovery:**
  - $\text{Variance} = 12,503.54 - 12,271.86 = ₹231.68$.
  - Percentage ratio:
    $$\frac{231.68}{12,503.54} = 1.8529\%$$
  - Standard Cashfree payment gateway fees for domestic transactions range from 1.75% to 2.00% + 18% GST (blended effective rate ~1.85% across mixed UPI and debit card transactions).
  - MIMO's internal calculation in `analytics.service.js` computes Net Collections as strictly $\text{Gross} - \text{Refunds}$, without deducting gateway fees.
  - If the business expectation of ₹12,503.54 was taken from the Cashfree portal before fee deduction, or if ₹12,503.54 was Gross and ₹12,271.86 was Net of fees, this explains the difference.
  - Alternatively, if both figures are from Cashfree, the variance represents a cross-month settlement cutoff (e.g., payments captured on the 30th/31st settling on the 1st/2nd of the next month).
- **Questions for Finance Head:**
  1. Which exact report or portal tab was ₹12,503.54 extracted from?
  2. Was ₹12,503.54 Gross Order Value or Net Bank Transfer?
  3. What was the exact calendar date range and timezone (IST vs UTC) used for the report?

---

### 1.3 The ₹7,566 Machine Hardware Expense Variance (₹1,17,279 vs ₹1,24,845)
- **Status:** **LIKELY (Category Segmentation or Sheet Row Skipping)**
- **Observation:** Machine Hardware expenses are reported as ₹1,17,279, while the business expects ₹1,24,845.
- **Forensic Discovery:**
  - $\text{Variance} = 124,845 - 117,279 = ₹7,566$.
  - In `googleSheets.service.js`, expenses are parsed from Google Sheets with strict category string matching (`colB`).
  - Hardware items in the sheet are divided across multiple category titles: `"Machine Hardware"`, `"Machine Components"`, and `"Utilities & Electrical"`.
  - If a ₹7,566 hardware purchase (such as a Raspberry Pi, thermal assembly, power supply, or structural frame) was categorized under `"Machine Components"`, it was omitted from the `"Machine Hardware"` total.
  - In addition, manual entries added via the Finance UI are stored in local React state (`useState([])`) and are never persisted to the Google Sheet or database.
- **Questions for Finance Manager:**
  1. Can the Finance Manager provide the complete line-item invoice list for the ₹1,24,845 hardware total?
  2. Was any hardware invoice incurred before March 2025 (which the parser currently skips)?
  3. Should `"Machine Hardware"` and `"Machine Components"` be formally merged into a single accounting head?

---

## 2. Required External Provider Access & Credentials

To execute the production implementation plan, the engineering team requires the following authorized read-only extracts or configuration access:

| Provider / Resource | Required Access Level | Purpose | Security & Handling Protocol |
| :--- | :--- | :--- | :--- |
| **Cashfree Merchant Dashboard** | Read-Only Admin / Report Export | Download authoritative Settlement (UTR) statements and Payment logs from Jan 2026 to present. | Use dedicated 2FA operations account; zero credential sharing. |
| **Cashfree Webhook Settings** | Configuration Access | Register `SETTLEMENT_SUCCESS` and `TRANSFER_SUCCESS` webhook endpoints. | Restrict to Cloud Run production domain; verify via HMAC secret. |
| **Email Delivery Service** | API Key / SMTP Access | Dispatch automated alerts to Finance Head upon refund initiation. | Store credentials in Google Cloud Secret Manager. |
| **Google Sheets Expense File** | Read-Only Access | Audit raw rows, column headers, and formulas in sheet `18ZDXG0nQZ6z7kUx7lShOFyOQ9gNOq2nc3iXfrYLrlfI`. | Extract read-only CSV backup prior to database migration. |

---

## 3. Required Finance Head Business Decisions

1. **Refund Dual-Control (Maker-Checker) Threshold:**
   - What is the maximum refund amount a Finance Manager can approve independently?
   - Should all bulk refund approvals require secondary sign-off from the Finance Head?
   - *Recommendation:* Single refunds up to ₹150.00 can be processed by Finance Manager; all refunds > ₹150.00 or bulk approvals require Finance Head authorization.

2. **Unclaimed Print Job Accounting Treatment:**
   - When a student pays for an order but does not scan their code at a kiosk, how long should the funds remain in escrow before being automatically refunded or recognized as breakage?
   - *Recommendation:* Maintain print code validity for 48 hours; trigger automatic refund if unclaimed after 72 hours.

3. **Machine Operating Profitability Model:**
   - Does the business intend to calculate net operating profit per kiosk?
   - If yes, what cost allocations apply (fixed kiosk rent, broadband/4G SIM charges, depreciation of hardware, paper reams, toner cartridges)?
   - *Recommendation:* Until machine-level consumable meters (toner/paper sensor logs) and rental invoices are linked to kiosk IDs, only report **Machine Gross Revenue** and **Dispensed Page Volume**. Do not publish unverified "Machine Profit".

4. **Customer Data Masking & DPDP Compliance:**
   - Under the Digital Personal Data Protection (DPDP) Act, should non-admin finance and analytics operators see raw student email addresses and mobile numbers in coupon and wallet exports?
   - *Recommendation:* Enforce partial masking (`v***@college.edu`, `+91-98****1234`) across all standard finance views. Provide an explicit, audit-logged "Reveal PII" button reserved for dispute investigation.

---

## 4. Historical Data Gap Recovery Strategy

1. **Coupon Redemptions:**
   - *Gap:* No dedicated redemption log was maintained.
   - *Recovery Plan:* Execute a deterministic, non-destructive migration script scanning all historical `orders` where `couponCode != null` and `status == "PAID"`. Generate synthetic `coupon_redemptions` records with timestamp matching the order's `createdAt`.

2. **WhatsApp Orders Without Gateway References:**
   - *Gap:* As noted in `analytics.service.js:254-256`, orders with prefix `WA-` lack `payment_transactions` and Cashfree gateway reference records in Firestore.
   - *Recovery Plan:* Keep WhatsApp orders flagged as `unreconciled_gateway_records_missing`. Do not inject them into audited Cashfree collections until supporting cash or UPI records are provided by the operations team.
