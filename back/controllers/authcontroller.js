const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../model/usermodel');
const Business = require('../model/businessmodel');
const Membership = require('../model/membershipmodel');
const { verifyToken, signSessionToken, signPendingToken, sessionCookieOptions, pendingCookieOptions, clearCookieOptions } = require('../config/jwt');
const { sendMail } = require('../config/mailer');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email });
const publicBusiness = (business) => ({ id: business._id, name: business.name, gstin: business.gstin || '' });

// Creates the first user + their business + the owner membership linking
// them, in one step — same as Zoho's "create your organization" signup.
exports.signup = async (req, res) => {
  try {
    const { name, email, password, businessName, gstin, phone, door, street, area, district, state, pincode } = req.body;
    if (!name || !email || !password || !businessName) {
      return res.status(400).json({ error: 'Name, email, password, and business name are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase().trim(), passwordHash });
    const business = await Business.create({ name: businessName, gstin, phone, door, street, area, district, state, pincode });
    await Membership.create({ user: user._id, business: business._id, role: 'owner' });

    const token = signSessionToken({ userId: user._id, businessId: business._id, role: 'owner' });
    res.cookie('token', token, sessionCookieOptions());
    res.status(201).json({ user: publicUser(user), business: publicBusiness(business), role: 'owner' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Password check first, then business selection: if the account only
// belongs to one business, log straight in; if it belongs to several,
// hand back the list and wait for /select-business instead of guessing.
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return res.status(401).json({ error: 'Invalid email or password.' });

    const memberships = await Membership.find({ user: user._id }).populate('business');
    if (!memberships.length) return res.status(403).json({ error: 'No business is linked to this account.' });

    if (memberships.length === 1) {
      const m = memberships[0];
      const token = signSessionToken({ userId: user._id, businessId: m.business._id, role: m.role });
      res.cookie('token', token, sessionCookieOptions());
      return res.status(200).json({ needsBusinessSelection: false, user: publicUser(user), business: publicBusiness(m.business), role: m.role });
    }

    const pendingToken = signPendingToken({ userId: user._id });
    res.cookie('pending_token', pendingToken, pendingCookieOptions());
    res.status(200).json({
      needsBusinessSelection: true,
      user: publicUser(user),
      businesses: memberships.map((m) => ({ ...publicBusiness(m.business), role: m.role })),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Completes login when the account has multiple businesses, or lets an
// already-logged-in user switch their active business.
exports.selectBusiness = async (req, res) => {
  try {
    const { businessId } = req.body;
    if (!businessId) return res.status(400).json({ error: 'businessId is required.' });

    const activeToken = req.cookies?.token;
    const pendingToken = req.cookies?.pending_token;
    const token = activeToken || pendingToken;
    if (!token) return res.status(401).json({ error: 'Not logged in.' });

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const membership = await Membership.findOne({ user: payload.sub, business: businessId }).populate('business');
    if (!membership) return res.status(403).json({ error: 'You do not have access to that business.' });

    const user = await User.findById(payload.sub);
    const newToken = signSessionToken({ userId: user._id, businessId: membership.business._id, role: membership.role });
    res.cookie('token', newToken, sessionCookieOptions());
    res.clearCookie('pending_token', clearCookieOptions());
    res.status(200).json({ user: publicUser(user), business: publicBusiness(membership.business), role: membership.role });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Current session's user + active business + the full list of businesses
// they can switch to (drives a business switcher in the nav later).
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId);
    const business = await Business.findById(req.auth.businessId);
    if (!user || !business) return res.status(401).json({ error: 'Session is no longer valid.' });

    const memberships = await Membership.find({ user: user._id }).populate('business');
    res.status(200).json({
      user: publicUser(user),
      business: publicBusiness(business),
      role: req.auth.role,
      businesses: memberships.map((m) => ({ ...publicBusiness(m.business), role: m.role })),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token', clearCookieOptions());
  res.clearCookie('pending_token', clearCookieOptions());
  res.status(200).json({ ok: true });
};

// Always responds with the same generic message whether or not the email
// exists — otherwise the endpoint could be used to check which emails have
// accounts. If it does exist, emails a one-time link (or logs it to the
// server console when SMTP isn't configured — see config/mailer.js).
exports.forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const genericResponse = { message: 'If an account exists for that email, a reset link has been sent.' };
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json(genericResponse);

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = hashToken(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your password',
      text: `Reset your password using this link (expires in 30 minutes): ${resetUrl}\n\nIf you didn't request this, ignore this email.`,
      html: `<p>Reset your password using the link below (expires in 30 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p>`,
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Consumes the token from forgotPassword — single use, and only valid within
// its 30-minute window.
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const user = await User.findOne({
      resetPasswordTokenHash: hashToken(token),
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'That reset link is invalid or has expired.' });

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({ message: 'Password updated. You can now log in.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
