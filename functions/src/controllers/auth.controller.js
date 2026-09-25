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

module.exports = {
  postRegister,
  postLogin,
  postGoogleLogin,
  postOnboarding,
};
