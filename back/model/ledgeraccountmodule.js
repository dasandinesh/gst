const mongoose = require('mongoose');

// An account the business adds to its chart of accounts (Accounts → Chart of
// Accounts → Add account): a bank account, an expense head, an income head, a
// loan, etc. The built-in accounts live in code (utils/accounting.js); these are
// merged in with the key `c_<_id>`.
const ledgerAccountSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  name: { type: String, required: true, trim: true },
  group: { type: String, enum: ['asset', 'liability', 'equity', 'income', 'expense'], required: true },
  kind: { type: String, enum: ['bank', 'expense', 'income', 'other'], default: 'other' },
  // Balance brought forward when the business started using the software.
  openingBalance: { type: Number, default: 0, min: 0 },
  openingSide: { type: String, enum: ['dr', 'cr'], default: 'dr' },
  // Bank accounts only
  bankName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  ifsc: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

ledgerAccountSchema.index({ businessId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('LedgerAccount', ledgerAccountSchema);
