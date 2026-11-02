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

test("website health is good when storage and database are healthy and no incidents exist", async () => {
  fake.reset({
    system_status: { "CV-001": { lastSeen: new Date() } },
    customer_website_incidents: {},
  });

  const result = await checkCustomerWebsiteCondition({ skipProbe: true, autoAlert: false });
  assert.strictEqual(result.isGood, true);
  assert.strictEqual(result.status, "good");
  assert.strictEqual(result.problem, null);
  assert.strictEqual(result.location, null);
  assert.strictEqual(result.checks.database.ok, true);
  assert.strictEqual(result.checks.storage.ok, true);
  assert.strictEqual(result.checks.clientTelemetry.ok, true);
});

test("website health detects customer client incidents in the last 30 minutes and marks status as failing", async () => {
  fake.reset({
    customer_website_incidents: {
      inc_1: {
        type: "upload_failed",
        message: "Network timeout while uploading document.pdf",
        route: "/upload",
        details: "XHR error code 0 during Cloud Storage PUT",
        status: "unresolved",
        createdAt: new Date(),
      },
    },
  });

  const result = await checkCustomerWebsiteCondition({ skipProbe: true, autoAlert: false });
  assert.strictEqual(result.isGood, false);
  assert.strictEqual(result.status, "failing");
  assert.strictEqual(result.problem, "Network timeout while uploading document.pdf");
  assert.match(result.location, /Customer Frontend/);
  assert.strictEqual(result.checks.clientTelemetry.ok, false);
  assert.strictEqual(result.checks.clientTelemetry.activeIncidents, 1);
});

test("website alert email records notification to visionprintt@gmail.com with idempotency deduplication", async () => {
  fake.reset({
    email_notifications: {},
  });

  const res1 = await sendWebsiteAlertEmail({
    problem: "Upload failure detected on mobile Safari",
    location: "Customer Frontend (/upload)",
    details: "Failed to upload document",
  });

  assert.strictEqual(res1.sent, true);
  assert.ok(res1.id.startsWith("website_alert_"));

  // Check stored notification in fake DB
  const storedNotifs = fake.data("email_notifications");
  const notif = Object.values(storedNotifs)[0];
  assert.ok(notif, "notification was stored in DB");
  assert.strictEqual(notif.recipient, "visionprintt@gmail.com");
  assert.match(notif.subject, /Issue Detected: Upload failure detected/);
  assert.match(notif.body, /WHERE THE PROBLEM OCCURS:\s+Customer Frontend/);

  // Subsequent call within same window is deduplicated
  const res2 = await sendWebsiteAlertEmail({
    problem: "Upload failure detected on mobile Safari",
    location: "Customer Frontend (/upload)",
  });
  assert.strictEqual(res2.duplicate, true);

  // Force delivery bypasses deduplication
  const res3 = await sendWebsiteAlertEmail({
    problem: "Upload failure detected on mobile Safari",
    location: "Customer Frontend (/upload)",
    force: true,
  });
  assert.strictEqual(res3.sent, true);
  assert.strictEqual(res3.duplicate, undefined);
});

test("postCustomerIncident stores new unresolved incident in customer_website_incidents", async () => {
  fake.reset({
    customer_website_incidents: {},
    email_notifications: {},
  });

  const req = {
    body: {
      type: "render_crash",
      message: "Cannot read properties of undefined (reading 'length')",
      route: "/print-options",
      details: "TypeError at PrintOptions.tsx:702",
    },
  };
  const res = response();
  await postCustomerIncident(req, res);

  assert.strictEqual(res.code, 201);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.incidentId);

  const incidents = fake.data("customer_website_incidents");
  const saved = Object.values(incidents)[0];
  assert.ok(saved);
  assert.strictEqual(saved.type, "render_crash");
  assert.strictEqual(saved.message, "Cannot read properties of undefined (reading 'length')");
  assert.strictEqual(saved.route, "/print-options");
  assert.strictEqual(saved.status, "unresolved");
});

