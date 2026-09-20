const mongoose = require('mongoose');

// Join table: which users can access which businesses, and with what role.
// One user can have many memberships (one per business they belong to) —
// this is what lets a single login later switch between multiple businesses.
const membershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  role: { type: String, enum: ['owner', 'staff'], default: 'owner' },
}, { timestamps: true });

membershipSchema.index({ user: 1, business: 1 }, { unique: true });

module.exports = mongoose.model('Membership', membershipSchema);
