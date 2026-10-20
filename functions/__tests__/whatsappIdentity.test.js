// Mission 07: tests for resolveWhatsAppUser (functions/src/services/whatsappIdentity.service.js).
// Read-only resolution against the existing `users.mobileNumber` mapping; no account is ever created.
const test = require("node:test");
const assert = require("node:assert");
require("./helpers/quiet");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { resolveWhatsAppUser } = require("../src/services/whatsappIdentity.service");

test.describe("resolveWhatsAppUser", () => {
  test("an existing valid mapping resolves to the user's doc id", async () => {
    const { db } = createFakeFirestore({ users: { u1: { mobileNumber: "919876543210", email: "a@example.com" } } });
    const r = await resolveWhatsAppUser(db, "919876543210");
    assert.deepStrictEqual(r, { status: "resolved", userId: "u1" });
  });

  test("an unknown sender resolves as unresolved/unknown, never as an invitation to create an account", async () => {
    const { db } = createFakeFirestore({ users: {} });
    const r = await resolveWhatsAppUser(db, "919876543210");
    assert.deepStrictEqual(r, { status: "unresolved", reason: "unknown" });
  });

  test("invalid sender identifiers are rejected before any Firestore read", async () => {
    const { db, log } = createFakeFirestore({ users: { u1: { mobileNumber: "919876543210" } } });
    for (const bad of ["abc", "+919876543210", "123", "", "   ", "1234567890123456", null, undefined, 919876543210, {}]) {
      const r = await resolveWhatsAppUser(db, bad);
      assert.strictEqual(r.status, "invalid", JSON.stringify(bad));
    }
    assert.strictEqual(log.reads, 0, "no lookup is attempted for a malformed id");
  });

  test("a conflicting/ambiguous mapping (two accounts sharing one mobileNumber) is refused, not guessed", async () => {
    const { db } = createFakeFirestore({
      users: {
        u1: { mobileNumber: "919876543210", email: "first@example.com" },
        u2: { mobileNumber: "919876543210", email: "second@example.com" },
      },
    });
    const r = await resolveWhatsAppUser(db, "919876543210");
    assert.deepStrictEqual(r, { status: "unresolved", reason: "ambiguous" });
  });

  test("a database read failure is reported distinctly from 'unknown', not papered over", async () => {
    const failingDb = { collection: () => ({ where: () => ({ get: async () => { throw new Error("firestore unavailable"); } }) }) };
    const r = await resolveWhatsAppUser(failingDb, "919876543210");
    assert.deepStrictEqual(r, { status: "unresolved", reason: "db_error" });
  });

  test("resolution never creates, writes, or links any account — zero writes for every outcome", async () => {
    const { db, log } = createFakeFirestore({
      users: {
        known: { mobileNumber: "911111111111" },
        dup1: { mobileNumber: "922222222222" },
        dup2: { mobileNumber: "922222222222" },
      },
    });
    await resolveWhatsAppUser(db, "911111111111"); // resolved
    await resolveWhatsAppUser(db, "933333333333"); // unknown
    await resolveWhatsAppUser(db, "922222222222"); // ambiguous
    await resolveWhatsAppUser(db, "not-a-number"); // invalid
    assert.strictEqual(log.writes.length, 0, "no write happened across any resolution outcome");
  });

  test("whitespace around an otherwise valid id is trimmed, not rejected", async () => {
    const { db } = createFakeFirestore({ users: { u1: { mobileNumber: "919876543210" } } });
    const r = await resolveWhatsAppUser(db, "  919876543210  ");
    assert.deepStrictEqual(r, { status: "resolved", userId: "u1" });
  });
});
