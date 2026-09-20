const nodemailer = require('nodemailer');

// Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM from
// config.env. If they're not set (fresh checkout, local dev), sendMail falls
// back to logging the email to the console instead of failing — so the
// forgot-password flow is testable immediately, and swapping in real SMTP
// credentials later needs no code change.
let transporter = null;
const isConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (!transporter && isConfigured()) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!isConfigured()) {
    console.log(`[mailer] SMTP not configured — logging email instead of sending.\n  To: ${to}\n  Subject: ${subject}\n  ${text}`);
    return { delivered: false };
  }
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to, subject, text, html,
  });
  return { delivered: true };
};

module.exports = { sendMail, isConfigured };
