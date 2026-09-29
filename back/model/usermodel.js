const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  // Set by forgot-password, cleared once used (or expired). The raw token is
  // emailed to the user and never stored — only its hash, so a DB leak alone
  // can't be used to reset anyone's password.
  resetPasswordTokenHash: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  // Platform-wide admin flag — separate from the per-business owner/staff
  // roles in Membership. Grants access to the /api/admin/* endpoints, which
  // can see and manage every user/business, not just one tenant.
  isSuperAdmin: { type: Boolean, default: false },
  // Set by an admin to lock a user out of both the normal app and (if they're
  // also a super admin) the admin panel, without deleting their data.
  isDisabled: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
