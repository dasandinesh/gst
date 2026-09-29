const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, 'config', 'config.env') });
const User = require('./model/usermodel');

// One-off bootstrap: there's no UI to grant the first super admin (chicken/egg),
// so this promotes/creates one directly in the database.
//
//   node _create-super-admin.js <email> <password> [name]
//
// If the email already belongs to an existing user, it's promoted in place
// (password left unchanged); otherwise a brand-new super-admin user is created.
(async () => {
  const [, , email, password, name] = process.argv;
  if (!email || !password) {
    console.error('Usage: node _create-super-admin.js <email> <password> [name]');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_LOCAL_URL, { serverSelectionTimeoutMS: 8000 });

  const normalizedEmail = email.toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail });
  if (user) {
    user.isSuperAdmin = true;
    user.isDisabled = false;
    await user.save();
    console.log(`Promoted existing user ${normalizedEmail} to super admin.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await User.create({ name: name || 'Admin', email: normalizedEmail, passwordHash, isSuperAdmin: true });
    console.log(`Created super admin ${normalizedEmail}.`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
