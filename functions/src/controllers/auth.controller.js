const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { SECRET_KEY, googleClient } = require("../config/env");
const { admin, db } = require("../config/firebase");

// ================= REGISTER =================
const postRegister = async (req, res) => {
  try {
    const { username, name, password, email, mobileNumber } = req.body;
    const existing = await db.collection("users").where("email", "==", email).get();
    if (!existing.empty) return res.status(400).json({ error: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const finalUsername = username || name || (email ? email.split("@")[0] : "User");
    const userRef = await db.collection("users").add({
      username: finalUsername, email, mobileNumber: mobileNumber || "", password: hashedPassword,
      googleUser: false, createdAt: now, updatedAt: now, accountStatus: "active",
      totalSpent: 0, totalPagesPrinted: 0, isVerified: true,
      mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
    });
    await userRef.update({ id: userRef.id });
    const token = jwt.sign({ userId: userRef.id }, SECRET_KEY, { expiresIn: "30d" });
    res.json({ jwtToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error registering user" });
  }
};

// ================= LOGIN =================
const postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (snapshot.empty) return res.status(400).json({ error: "User not found" });
    const doc = snapshot.docs[0];
    const user = doc.data();
    if (user.googleUser) return res.status(400).json({ error: "Use Google login" });
    const storedPassword = user.password || user.passwordHash;
    if (!storedPassword) return res.status(500).json({ error: "Password missing" });
    const valid = await bcrypt.compare(password, storedPassword);
    if (!valid) return res.status(400).json({ error: "Wrong password" });
    await doc.ref.update({ lastLoginAt: admin.firestore.FieldValue.serverTimestamp() });
    const token = jwt.sign({ userId: doc.id }, SECRET_KEY, { expiresIn: "30d" });
    res.json({ jwtToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
};

// ================= GOOGLE LOGIN =================
const postGoogleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token missing" });
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || "144514765704-a3nm5kgbtehioia9eki37s3t8doasfi1.apps.googleusercontent.com",
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const snapshot = await db.collection("users").where("email", "==", email).get();
    let mobileNumber = "";
    const now = admin.firestore.FieldValue.serverTimestamp();
    let userId;
    if (snapshot.empty) {
      const userRef = await db.collection("users").add({
        username: name, email, mobileNumber: "", password: null, googleUser: true,
        createdAt: now, updatedAt: now, accountStatus: "active",
        totalSpent: 0, totalPagesPrinted: 0, isVerified: true,
        mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
      });
      userId = userRef.id;
      await userRef.update({ id: userId });
    } else {
      userId = snapshot.docs[0].id;
      mobileNumber = snapshot.docs[0].data().mobileNumber || "";
      await snapshot.docs[0].ref.update({ lastLoginAt: now });
    }
    const jwtToken = jwt.sign({ userId }, SECRET_KEY, { expiresIn: "30d" });
    res.json({ jwtToken, name, email, userId, mobileNumber });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Google login failed" });
  }
};

// ================= ONBOARDING =================
const postOnboarding = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, mobileNumber } = req.body;
    if (!username) return res.status(400).json({ error: "Name required" });
    await db.collection("users").doc(userId).update({ username, mobileNumber: mobileNumber || "", onboardingCompleted: true });
    res.json({ message: "Onboarding complete" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Onboarding failed" });
  }
};

// ================= GUEST SESSION (QR-first entry, no login required) =================
// A guest is a real `users` doc — same shape register()/google-login() produce, minus email/password — so
// the entire existing upload/print/payment pipeline (all gated by authMiddleware checking only that the
// doc exists) works for a guest completely unchanged. isGuest:true is the only marker; there is no separate
// guest schema to keep in sync. No email means a password-guesser can never reach this account via /login.
const GUEST_ADJECTIVES = [
  "Blue", "Quick", "Silver", "Golden", "Swift", "Bright", "Calm", "Bold", "Lucky", "Gentle",
  "Clever", "Brave", "Sunny", "Misty", "Rapid", "Vivid", "Noble", "Cosmic", "Crimson", "Amber",
  "Jolly", "Wild", "Steady", "Nimble", "Mighty", "Curious", "Breezy", "Radiant", "Lively", "Dapper",
];
const GUEST_NOUNS = [
  "Falcon", "Panda", "Fox", "Otter", "Eagle", "Tiger", "Wolf", "Heron", "Lynx", "Sparrow",
  "Dolphin", "Badger", "Hawk", "Rabbit", "Raven", "Comet", "Phoenix", "Koala", "Puma", "Owl",
  "Stag", "Gecko", "Marlin", "Cobra", "Finch", "Panther", "Robin", "Orca", "Lemur", "Heron",
];
const generateGuestName = () => {
  const adjective = GUEST_ADJECTIVES[Math.floor(Math.random() * GUEST_ADJECTIVES.length)];
  const noun = GUEST_NOUNS[Math.floor(Math.random() * GUEST_NOUNS.length)];
  return `${adjective} ${noun}`;
};

const postGuestSession = async (req, res) => {
  try {
    const username = generateGuestName();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const userRef = await db.collection("users").add({
      username,
      email: null,
      mobileNumber: "",
      password: null,
      googleUser: false,
      isGuest: true,
      createdAt: now,
      updatedAt: now,
      accountStatus: "active",
      totalSpent: 0,
      totalPagesPrinted: 0,
      isVerified: false,
      mimo_coins: { balance: 0, total_earned: 0, total_used: 0 },
    });
    await userRef.update({ id: userRef.id });
    // Short-lived on purpose: a guest's job/file retention is already 24h (same as everyone else), so a
    // week-long token comfortably covers "come back and check the release code" without lingering forever.
    const jwtToken = jwt.sign({ userId: userRef.id }, SECRET_KEY, { expiresIn: "7d" });
    res.json({ jwtToken, name: username, userId: userRef.id, isGuest: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start guest session" });
  }
};

module.exports = {
  postRegister,
  postLogin,
  postGoogleLogin,
  postOnboarding,
  postGuestSession,
};
