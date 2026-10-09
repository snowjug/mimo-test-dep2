// Shared harness for the order-creation characterization tests: installs the fake Firestore and axios stub,
// loads the payment controller once, and offers `checkout()` to run POST /create-order end to end.
require("./quiet");
const { createFakeFirestore } = require("./fakeFirestore");
const { installAxiosStub } = require("./stubAxios");

process.env.JWT_SECRET = "characterization-test-secret-fixture-32ch"; // must be >= 32 chars (see src/config/env.js)
process.env.CASHFREE_ENV = "sandbox";
delete process.env.GMAIL_APP_PASSWORD; // tests never send e-mail unless they set it explicitly
delete process.env.PORT;

const fake = createFakeFirestore();
fake.install();
const http = installAxiosStub();

// Never send real e-mail from tests: replace the SMTP transport with an in-memory mailbox.
const mailbox = [];
const emailServicePath = require.resolve("../../src/services/email.service");
require.cache[emailServicePath] = {
  id: emailServicePath, filename: emailServicePath, loaded: true,
  exports: { getTransporter: () => ({ sendMail: async (mail) => { if (mailbox.failNext) { mailbox.failNext = false; throw new Error("smtp down"); } mailbox.push(mail); } }) },
};
const controller = require("../../src/controllers/payment.controller");

const ORDERS_URL = /\/pg\/orders$/;
const CASHFREE_CREATE = /sandbox\.cashfree\.com\/pg\/orders$/;

function response() {
  return {
    code: 200, body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    sendStatus(c) { this.code = c; return this; },
  };
}

/** A pending single-file job as /finalize-upload creates it. */
const pendingJob = (over = {}) => ({
  userId: "u1", status: "pending", fileName: "doc.pdf", fileUrl: "https://files.example/doc.pdf",
  mimetype: "application/pdf", size: 1000, pageCount: 10, ...over,
});

/** Reset the world: one user, the given jobs/coupons, and a Cashfree stub that accepts order creation. */
function seed({ jobs = { j1: pendingJob() }, user = { email: "u1@example.com", username: "Uma", mimo_coins: { balance: 1000, total_earned: 1000, total_used: 0 } }, coupons = {}, extra = {} } = {}) {
  http.reset();
  mailbox.length = 0;
  fake.reset({ users: { u1: user }, print_jobs: jobs, coupons, ...extra });
  http.on("post", CASHFREE_CREATE, () => ({ data: { payment_session_id: "session_test" } }));
  http.on("post", /graph\.facebook\.com/, () => ({ data: {} }));
}

/** Run POST /create-order for user u1. */
async function checkout(body, userId = "u1") {
  const res = response();
  await controller.postCreateOrder({ user: { userId }, body: { jobIds: ["j1"], ...body } }, res);
  return res;
}

/** Simulates what /verify-payment or the Cashfree webhook does after Cashfree confirms a payment. */
async function markPaid(orderId) {
  const snap = await fake.db.collection("payment_transactions").where("orderId", "==", orderId).get();
  for (const doc of snap.docs) await doc.ref.update({ status: "PAID" });
}

const cashfreeCalls = () => http.calls.filter((c) => c.method === "post" && CASHFREE_CREATE.test(c.url));
const mergedJobs = () => Object.entries(fake.data("print_jobs")).filter(([, j]) => j.status !== undefined);

module.exports = { fake, http, mailbox, markPaid, controller, response, pendingJob, seed, checkout, cashfreeCalls, mergedJobs, ORDERS_URL };
