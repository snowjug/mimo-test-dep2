// A 4-digit printCode from a job completed months ago used to permanently shadow any brand-new job handed
// the same code later: postGetDocumentsByCode's "already used" fallback matched ANY historical job with that
// code, with no time bound. Confirmed production incident, 2026-10-16: printCode "9670" from a September job
// (status: completed) collided with a same-day paid job and returned 409 "already used" even though the new
// job was still unprinted. The fix bounds that fallback to the last 24h, matching the window
// printCode.service.js's CODE_VALIDITY_MS already documents codes as valid for.
const test = require("node:test");
require("./helpers/quiet");
const assert = require("node:assert");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

const fake = createFakeFirestore();
fake.install();
const { postGetDocumentsByCode } = require("../src/controllers/print.controller");

function response() {
  return { code: 200, body: undefined, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, set() { return this; } };
}
const job = (over = {}) => ({
  userId: "u1", printCode: "9670", status: "paid", colorMode: "bw", createdAt: new Date(),
  fileName: "notes.pdf", fileUrl: "https://example.invalid/notes.pdf",
  files: [{ name: "notes.pdf", url: "https://example.invalid/notes.pdf", type: "application/pdf" }],
  ...over,
});
const getDocuments = async (kioskId = "CV-001") => {
  const res = response();
  await postGetDocumentsByCode({ body: { printCode: "9670", kioskId } }, res);
  return res;
};

test("a code last used by a job from months ago no longer blocks a brand-new paid job with the same code", async () => {
  const monthsAgo = new Date(Date.now() - 37 * 24 * 60 * 60 * 1000); // ~Sept-style staleness
  fake.reset({
    print_jobs: {
      stale: job({ status: "completed", createdAt: monthsAgo, fileName: "Social_Psychology_Presentation_Script.docx", files: [{ name: "Social_Psychology_Presentation_Script.docx", url: "https://example.invalid/x.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }] }),
      fresh: job({ status: "paid", createdAt: new Date() }),
    },
  });
  const res = await getDocuments("CV-001");
  assert.strictEqual(res.code, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.documents[0].jobId, "fresh");
});

test("a code used within the last 24h still correctly blocks reuse as 'already used'", async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fake.reset({
    print_jobs: {
      recent: job({ status: "completed", createdAt: twoHoursAgo }),
      // no active 'paid' job holds this code right now -- the primary query must come back empty
    },
  });
  const res = await getDocuments("CV-001");
  assert.strictEqual(res.code, 409);
  assert.match(res.body.error, /already used/);
});

test("a code that was refunded within the last 24h still blocks reuse with the refund-specific message", async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  fake.reset({
    print_jobs: {
      refunded: job({ status: "refunded", createdAt: oneHourAgo }),
    },
  });
  const res = await getDocuments("CV-001");
  assert.strictEqual(res.code, 409);
  assert.match(res.body.error, /refunded/);
});
