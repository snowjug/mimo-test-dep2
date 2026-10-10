/**
 * Records one login-streak event per person per day, across every staff portal (Technical/HR/Marketing).
 * Doc id is deterministic (`${collection}_${memberId}_${date}`), so logging in twice in a day is a no-op
 * write, not a duplicate — exactly what a GitHub-style "did this day have activity" graph needs.
 */
const { admin, db } = require("../config/firebase");

const recordLogin = async (collection, memberId) => {
  const date = new Date().toISOString().slice(0, 10);
  const docId = `${collection}_${memberId}_${date}`;
  try {
    await db.collection("login_events").doc(docId).set({
      collection,
      memberId,
      date,
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    // Never let streak logging break an actual login.
    console.error("[LOGIN-STREAK] Failed to record login event:", err.message || err);
  }
};

module.exports = { recordLogin };
