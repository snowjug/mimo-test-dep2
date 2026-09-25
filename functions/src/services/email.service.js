// Lazy-loaded Nodemailer Transporter helper
function getTransporter() {
  const nodemailer = require("nodemailer");
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "visionprintt@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD || "placeholder_pass"
    }
  });
}

module.exports = {
  getTransporter,
};
