// Mission 07: resolve an authenticated WhatsApp sender id to an EXISTING MIMO user. Read-only — never creates,
// links, or guesses an account. The only authoritative WhatsApp-to-MIMO mapping that exists today is the one
// the chatbot already relies on (functions/src/controllers/whatsapp.controller.js:255):
// `users` documents where `mobileNumber == <sender id>`. There is no deterministic `wa_<waId>` user id scheme
// in production (Mission 1's audit found guest users get Firestore auto-ids), so this function queries by
// field, not by doc id, and must therefore handle zero, one, or more than one match.
//
// CALLER CONTRACT (not enforced by this function, because it has no way to): `waId` must be the sender id
// from a request whose Meta signature has ALREADY been verified. This function trusts `waId` to be a correct
// WhatsApp sender identifier; it does not and cannot verify that the request it came from was authentic.
// `flow_token` is never accepted here and must never be treated as identity anywhere else either — a Flow
// token identifies a SESSION, not a person (see docs/engineering/MIMO_WHATSAPP_FLOW_APPLICATION_CONTRACT_v0.2.md).
//
// No raw phone number is ever logged by this module.

const WA_ID_PATTERN = /^\d{8,15}$/; // digits only, E.164 without "+" — matches the NormalizedInbound.waId
                                     // convention already proposed for the chatbot (Mission 1 §10.1).

/**
 * @typedef {
 *   {status:"resolved", userId:string} |
 *   {status:"invalid", reason:string} |
 *   {status:"unresolved", reason:"unknown"|"ambiguous"|"db_error"}
 * } WhatsAppIdentityResult
 */

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {unknown} waId - sender id from an ALREADY VERIFIED Meta request. Never pass a client-supplied
 *   identity field (e.g. a body field literally named `userId`) here — only the verified sender id.
 * @returns {Promise<WhatsAppIdentityResult>}
 */
async function resolveWhatsAppUser(db, waId) {
  if (typeof waId !== "string") {
    return { status: "invalid", reason: "waId must be a string" };
  }
  const normalized = waId.trim();
  if (!WA_ID_PATTERN.test(normalized)) {
    return { status: "invalid", reason: "waId is not a valid WhatsApp sender identifier" };
  }

  let snapshot;
  try {
    snapshot = await db.collection("users").where("mobileNumber", "==", normalized).get();
  } catch (err) {
    // A read failure is not "unknown" (which would be safe to treat as "no account yet") — surface it
    // distinctly so a caller doesn't accidentally offer to create a fresh guest account over a transient
    // outage. Never includes the phone number or the raw error (which could echo request data) in anything logged.
    console.error("[whatsappIdentity] mobileNumber lookup failed");
    return { status: "unresolved", reason: "db_error" };
  }

  if (snapshot.empty) {
    return { status: "unresolved", reason: "unknown" };
  }
  if (snapshot.size > 1) {
    // The schema does not enforce `mobileNumber` uniqueness (confirmed: no unique index/constraint anywhere
    // in firebase/firestore.rules or the user-creation paths). More than one match is a real, representable
    // state, not a theoretical one, and must never be resolved by guessing — refuse explicitly instead.
    return { status: "unresolved", reason: "ambiguous" };
  }
  return { status: "resolved", userId: snapshot.docs[0].id };
}

// MINIMUM ACCOUNT-LINKING CAPABILITY NEEDED LATER (documented, not implemented — out of this mission's
// scope, which explicitly excludes inventing a registration/OTP workflow):
// For "unknown" to ever become "resolved" for a real WhatsApp-first customer, some explicit, user-initiated
// linking step must exist — e.g. the customer logs into the website once and confirms/enters the same mobile
// number MIMO already has on file, or a one-time verification code sent to the number is confirmed back
// through a channel other than the Flow itself. Nothing in this function may substitute for that: it only
// ever reads an EXISTING mapping, it never creates one.

module.exports = { resolveWhatsAppUser, WA_ID_PATTERN };
