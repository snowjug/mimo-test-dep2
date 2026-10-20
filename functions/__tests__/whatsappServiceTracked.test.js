"use strict";
// Mission 21: focused tests for sendWhatsAppCTAButtonTracked — the outcome-classifying SIBLING of the
// existing sendWhatsAppCTAButton (chatbot path, untouched, not exercised here). No real network; axios is
// fully stubbed. Proves the three classifications the Flow's durable notification state machine
// (createOrderOperation.js) depends on: confirmed, definite_failure, ambiguous.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { installAxiosStub } = require("./helpers/stubAxios");

process.env.JWT_SECRET = "whatsapp-tracked-test-secret-fixture-32"; // must be >= 32 chars (see src/config/env.js)
delete process.env.GMAIL_APP_PASSWORD;

const http = installAxiosStub();
const { sendWhatsAppCTAButtonTracked, WhatsAppSendError, sendWhatsAppCTAButton } = require("../src/services/whatsapp.service");

function setupHttp(handler) {
  http.reset();
  http.on("post", /graph\.facebook\.com/, handler);
}

test.describe("sendWhatsAppCTAButtonTracked — classifies the outcome, never swallows it", () => {
  test("a 2xx response with the documented messages[0].id shape -> confirmed", async () => {
    setupHttp(() => ({ data: { messages: [{ id: "wamid.ABC" }] } }));
    const result = await sendWhatsAppCTAButtonTracked("919876543210", "body", "Pay Now", "https://example/pay");
    assert.deepStrictEqual(result, { classification: "confirmed", messageId: "wamid.ABC" });
  });

  test("Meta responds with an HTTP error status -> definite_failure (safe to retry, never sent)", async () => {
    setupHttp(() => { throw Object.assign(new Error("Bad Request"), { response: { status: 400, data: { error: { message: "Invalid parameter" } } } }); });
    await assert.rejects(
      sendWhatsAppCTAButtonTracked("919876543210", "body", "Pay Now", "https://example/pay"),
      (err) => err instanceof WhatsAppSendError && err.classification === "definite_failure" && /Invalid parameter/.test(err.message)
    );
  });

  test("a network/timeout error with NO response at all -> ambiguous (never classified as safe to retry)", async () => {
    setupHttp(() => { throw new Error("ECONNABORTED: timeout of 10000ms exceeded"); });
    await assert.rejects(
      sendWhatsAppCTAButtonTracked("919876543210", "body", "Pay Now", "https://example/pay"),
      (err) => err instanceof WhatsAppSendError && err.classification === "ambiguous"
    );
  });

  test("a 2xx response that does NOT carry the documented success shape -> ambiguous, not a silent 'confirmed'", async () => {
    setupHttp(() => ({ data: {} })); // no messages[] at all
    await assert.rejects(
      sendWhatsAppCTAButtonTracked("919876543210", "body", "Pay Now", "https://example/pay"),
      (err) => err instanceof WhatsAppSendError && err.classification === "ambiguous"
    );
  });

  test("the request carries the EXACT same message type/shape as the existing (untouched) sendWhatsAppCTAButton", async () => {
    setupHttp(() => ({ data: { messages: [{ id: "wamid.XYZ" }] } }));
    await sendWhatsAppCTAButtonTracked("919876543210", "pay please", "Pay Now", "https://example/pay");
    const call = http.calls[http.calls.length - 1];
    assert.strictEqual(call.body.type, "interactive");
    assert.strictEqual(call.body.interactive.type, "cta_url");
    assert.strictEqual(call.body.interactive.action.parameters.url, "https://example/pay");
  });

  test("sendWhatsAppCTAButton (the chatbot's own function) is untouched: still never throws, still falls back to text on failure", async () => {
    setupHttp(() => { throw Object.assign(new Error("boom"), { response: { data: { error: { message: "rejected" } } } }); });
    await assert.doesNotReject(sendWhatsAppCTAButton("919876543210", "body", "Pay Now", "https://example/pay"));
    // Fallback is a plain text send to the SAME recipient — the second call in this test's http.calls log.
    assert.strictEqual(http.calls.length, 2);
    assert.strictEqual(http.calls[1].body.type, "text");
  });
});
