"use strict";

const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();

const { checkCustomerWebsiteCondition, INCIDENT_COLLECTION } = require("../src/services/websiteHealth.service");
const { sendWebsiteAlertEmail } = require("../src/services/email.service");
const { postCustomerIncident } = require("../src/controllers/public.controller");
const { classifyIncident } = require("../src/services/incidentClassifier");

function response() {
  return {
    code: 200,
    body: undefined,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

// -------------------------------------------------------------
// 1. INCIDENT CLASSIFIER TESTS
// -------------------------------------------------------------
test("classifyIncident classifies wrong password and credential errors as non-technical (no email)", () => {
  const cases = [
    { message: "Wrong password", route: "/login" },
    { message: "Invalid email or password", route: "/login" },
    { message: "User not found", route: "/login" },
    { details: "Firebase: Error (auth/wrong-password)." },
    { status: 401, message: "Unauthorized" },
    { message: "Your session has expired. Please log in again." },
  ];

  for (const c of cases) {
    const res = classifyIncident(c);
    assert.strictEqual(res.isTechnical, false, `Expected non-technical for: ${JSON.stringify(c)}`);
    assert.strictEqual(res.category, "AUTH_USER_CREDENTIAL");
  }
});

test("classifyIncident classifies page reload, refresh, and user cancellations as non-technical", () => {
  const cases = [
    { details: "Request aborted", message: "Upload cancelled." },
    { message: "User cancelled upload", details: "AbortError: The user aborted a request." },
    { message: "CanceledError: canceled" },
    { message: "Page refreshed during print configuration" },
    { details: "beforeunload fired while document was loading" },
  ];

  for (const c of cases) {
    const res = classifyIncident(c);
    assert.strictEqual(res.isTechnical, false, `Expected non-technical for: ${JSON.stringify(c)}`);
    assert.strictEqual(res.category, "PAGE_LIFECYCLE_OR_CANCEL");
  }
});

test("classifyIncident classifies client offline and network drops as non-technical", () => {
  const cases = [
    { message: "Couldn't reach MIMO. Check your internet connection and try again." },
    { details: "net::ERR_INTERNET_DISCONNECTED" },
    { message: "Network Error", details: "Failed to fetch from client device" },
    { details: "navigator.offline during file selection" },
  ];

  for (const c of cases) {
    const res = classifyIncident(c);
    assert.strictEqual(res.isTechnical, false, `Expected non-technical for: ${JSON.stringify(c)}`);
    assert.strictEqual(res.category, "CLIENT_LOCAL_OFFLINE");
  }
});

test("classifyIncident classifies user validation and input errors (4xx) as non-technical", () => {
  const cases = [
    { message: "Invalid promo code", status: 404 },
    { message: "Promo code has expired", status: 400 },
    { message: "That file is too large to upload.", status: 413 },
    { message: "Password-protected PDF files cannot be printed directly." },
  ];

  for (const c of cases) {
    const res = classifyIncident(c);
    assert.strictEqual(res.isTechnical, false, `Expected non-technical for: ${JSON.stringify(c)}`);
    assert.strictEqual(res.category, "USER_INPUT_VALIDATION");
  }
});

test("classifyIncident classifies genuine technical faults as technical (MUST send email)", () => {
  const cases = [
    {
      type: "render_crash",
      message: "Minified React error #31; visit https://reactjs.org/docs/error-decoder.html?invariant=31",
      details: "at div\nat login.tsx:45",
      expectedCategory: "FRONTEND_CODE_CRASH",
    },
    {
      type: "render_crash",
      message: "TypeError: Cannot read properties of undefined (reading 'length')",
      details: "TypeError at PrintOptions.tsx:702",
      expectedCategory: "FRONTEND_CODE_CRASH",
    },
    {
      type: "upload_failed",
      status: 500,
      message: "Internal Server Error during LibreOffice PDF conversion",
      details: "Cloud Run worker exited with code 137 (OOM)",
      expectedCategory: "SERVER_5XX_ERROR",
    },
    {
      message: "Storage service error",
      details: "admin.storage bucket inaccessible",
      expectedCategory: "INFRASTRUCTURE_OUTAGE",
    },
  ];

  for (const c of cases) {
    const res = classifyIncident(c);
    assert.strictEqual(res.isTechnical, true, `Expected technical for: ${JSON.stringify(c)}`);
    assert.strictEqual(res.category, c.expectedCategory);
  }
});

// -------------------------------------------------------------
// 2. END-TO-END CONTROLLER BEHAVIOR (postCustomerIncident)
// -------------------------------------------------------------
test("postCustomerIncident ignores benign wrong password and sends NO email alert", async () => {
  fake.reset({
    customer_website_incidents: {},
    email_notifications: {},
  });

  const req = {
    body: {
      type: "auth_error",
      message: "Wrong password",
      route: "/login",
      details: "User entered invalid password on /login form",
    },
  };
  const res = response();
  await postCustomerIncident(req, res);

  // Must return 200 with ignored: true
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.ignored, true);
  assert.strictEqual(res.body.technical, false);

  // Stored in DB with status "ignored"
  const incidents = fake.data("customer_website_incidents");
  const stored = Object.values(incidents)[0];
  assert.ok(stored);
  assert.strictEqual(stored.status, "ignored");
  assert.strictEqual(stored.technical, false);
  assert.strictEqual(stored.category, "AUTH_USER_CREDENTIAL");

  // NO email notification created!
  const notifs = fake.data("email_notifications");
  assert.strictEqual(Object.keys(notifs).length, 0, "No email should be triggered for wrong password");
});

test("postCustomerIncident ignores benign page reload / request aborted and sends NO email alert", async () => {
  fake.reset({
    customer_website_incidents: {},
    email_notifications: {},
  });

  const req = {
    body: {
      type: "upload_failed",
      message: "Couldn't reach MIMO. Check your internet connection and try again.",
      route: "/upload",
      details: "Request aborted",
    },
  };
  const res = response();
  await postCustomerIncident(req, res);

  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.ignored, true);
  assert.strictEqual(res.body.technical, false);

  // NO email notification created!
  const notifs = fake.data("email_notifications");
  assert.strictEqual(Object.keys(notifs).length, 0, "No email should be triggered for client abort/reload");
});

test("postCustomerIncident records genuine render crash and triggers detailed developer alert email", async () => {
  fake.reset({
    customer_website_incidents: {},
    email_notifications: {},
  });

  const req = {
    body: {
      type: "render_crash",
      message: "Minified React error #31; object with keys {error}",
      route: "/login",
      details: "at div\nat Form\nat Login (https://printmimo.tech/assets/app.js:52:49382)",
    },
  };
  const res = response();
  await postCustomerIncident(req, res);

  // Must return 201 with technical: true
  assert.strictEqual(res.code, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.technical, true);

  // Incident stored as unresolved
  const incidents = fake.data("customer_website_incidents");
  const stored = Object.values(incidents)[0];
  assert.ok(stored);
  assert.strictEqual(stored.status, "unresolved");
  assert.strictEqual(stored.technical, true);
  assert.strictEqual(stored.category, "FRONTEND_CODE_CRASH");

  // Email notification IS dispatched to visionprintt@gmail.com with structured developer content
  const notifs = fake.data("email_notifications");
  const emailList = Object.values(notifs);
  assert.strictEqual(emailList.length, 1, "Alert email MUST be sent for technical crash");

  const email = emailList[0];
  assert.strictEqual(email.recipient, "visionprintt@gmail.com");
  assert.match(email.subject, /\[MIMO Technical Alert\] \[FRONTEND_CODE_CRASH\]/);
  assert.match(email.body, /1\. WHAT IS THE EXACT PROBLEM:/);
  assert.match(email.body, /2\. WHERE IT OCCURS ON THE WEBSITE:/);
  assert.match(email.body, /Route: \/login/);
  assert.match(email.body, /3\. TECHNICAL DETAILS & EVIDENCE:/);
  assert.match(email.body, /4\. DEVELOPER ACTION CHECKLIST:/);
  assert.match(email.body, /https:\/\/printmimo\.tech\/admin\/guardian/);
});

// -------------------------------------------------------------
// 3. WEBSITE HEALTH AGGREGATION & POLLING SAFETY
// -------------------------------------------------------------
test("website health is good when only benign ignored incidents exist", async () => {
  fake.reset({
    system_status: { "CV-001": { lastSeen: new Date() } },
    customer_website_incidents: {
      inc_1: {
        type: "auth_error",
        message: "Wrong password",
        route: "/login",
        status: "ignored",
        technical: false,
        createdAt: new Date(),
      },
      inc_2: {
        type: "upload_failed",
        message: "Request aborted",
        route: "/upload",
        status: "ignored",
        technical: false,
        createdAt: new Date(),
      },
    },
    email_notifications: {},
  });

  const result = await checkCustomerWebsiteCondition({ skipProbe: true, autoAlert: false });
  assert.strictEqual(result.isGood, true);
  assert.strictEqual(result.status, "good");
  assert.strictEqual(result.problem, null);
  assert.strictEqual(result.checks.clientTelemetry.ok, true);
  assert.strictEqual(result.checks.clientTelemetry.activeIncidents, 0);

  // Routine poll did NOT send emails
  const notifs = fake.data("email_notifications");
  assert.strictEqual(Object.keys(notifs).length, 0);
});

test("website health flags failing when an active technical incident exists", async () => {
  fake.reset({
    system_status: { "CV-001": { lastSeen: new Date() } },
    customer_website_incidents: {
      inc_tech: {
        type: "render_crash",
        category: "FRONTEND_CODE_CRASH",
        message: "Cannot read properties of undefined (reading 'split')",
        route: "/print-options",
        details: "TypeError at line 42",
        status: "unresolved",
        technical: true,
        createdAt: new Date(),
      },
    },
  });

  const result = await checkCustomerWebsiteCondition({ skipProbe: true, autoAlert: false });
  assert.strictEqual(result.isGood, false);
  assert.strictEqual(result.status, "failing");
  assert.strictEqual(result.problem, "Cannot read properties of undefined (reading 'split')");
  assert.strictEqual(result.checks.clientTelemetry.ok, false);
  assert.strictEqual(result.checks.clientTelemetry.activeIncidents, 1);
});
